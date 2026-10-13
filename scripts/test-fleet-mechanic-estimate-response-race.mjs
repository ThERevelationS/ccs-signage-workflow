// Real Fleet mechanic estimate Save/Submit handler, backed only by synthetic entities.
// No production data, credentials, HTTP endpoints, or Fleet writes are used.
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import path from "node:path";
import {createHash} from "node:crypto";

const root=process.cwd();
let source=readFileSync(path.join(root,"base44/functions/fleetMechanicPortal/entry.ts"),"utf8");
source=source.replace("import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';",
  "const createClientFromRequest = () => globalThis.__fleetEstimateResponseClient;");
source=source.replace(/from '([^']+\.ts)';/g,(_whole,spec)=>`from '${pathToFileURL(path.resolve(root,"base44/functions/fleetMechanicPortal",spec)).href}';`);
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
let handler;
globalThis.Deno={serve:fn=>{handler=fn;}};
await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
assert.equal(typeof handler,"function");

const clone=value=>structuredClone(value);
const token="synthetic-estimate-token-abcdefghijklmnopqrstuvwxyz0123456789";
const grantId="synthetic-estimate-grant";
const workId="synthetic-estimate-work";
const estimateId="synthetic-estimate-1";
const hash=value=>createHash("sha256").update(value).digest("hex");
const currentEstimate=()=>({
  id:estimateId,work_order_id:workId,equipment_id:"eq-allowed",updated_date:"estimate-v1",
  status:"draft",estimate_source:"mechanic_portal",mechanic_access_id:grantId,
  estimated_labor_hours:1,labor_rate:100,estimated_total:100,notes:"Initial draft",
});
const baseWork=()=>({id:workId,updated_date:"work-v1",status:"open",equipment_id:"eq-allowed"});
const saveBody=()=>({
  action:"estimate_save",token,work_order_id:workId,expected_updated_date:"work-v1",
  estimate_expected_updated_date:"estimate-v1",
  estimate:{estimated_labor_hours:2,labor_rate:150,notes:"Mechanic draft"},
});
const submitBody=()=>({
  action:"estimate_submit",token,work_order_id:workId,expected_updated_date:"work-v1",
  estimate_expected_updated_date:"estimate-v1",
});
function setup(){
  const store={work:baseWork(),estimate:currentEstimate(),writes:0,readBarrier:false,pendingReads:[],estimateReads:0,
    pausePolicyRead:false,pendingPolicyReads:[],pauseGrantRead:false,pendingGrantReads:[],
    pauseGateClaim:false,pendingGateClaims:[],gateClaims:0,loseWriteAck:false,loseCreateAck:false,writeThenCCSEdit:null};
  const grant={id:grantId,enabled:true,name:"Synthetic mechanic",token_hash:hash(token),
    allowed_actions:["bootstrap","start","save","estimate_save","estimate_submit"],
    scope_mode:"selected_equipment",allowed_equipment_ids:["eq-allowed"],
    expires_at:"2099-01-01T00:00:00.000Z"};
  const access={
    async filter(query){return query.token_hash===grant.token_hash && grant.enabled ? [clone(grant)] : [];},
    async get(id){
      if(store.pauseGrantRead){
        store.pauseGrantRead=false;
        await new Promise(resolve=>store.pendingGrantReads.push(resolve));
      }
      return id===grantId ? clone(grant) : null;
    },
    async update(){return clone(grant);},
  };
  const WorkOrder={async get(id){return id===workId&&store.work ? clone(store.work) : null;}};
  const Estimate={
    async filter(query){return store.estimate?.work_order_id===query.work_order_id ? [clone(store.estimate)] : [];},
    async get(id){
      store.estimateReads++;
      const snapshot=id===estimateId && store.estimate ? clone(store.estimate) : null;
      if(store.readBarrier){
        store.readBarrier=false;
        await new Promise(resolve=>store.pendingReads.push(resolve));
      }
      return snapshot;
    },
    async updateMany(query,change){
      if(!store.estimate || store.estimate.id!==query.id || store.estimate.updated_date!==query.updated_date)return {updated:0};
      store.estimate={...store.estimate,...clone(change.$set),updated_date:"estimate-v2"};
      store.writes++;
      if(store.writeThenCCSEdit){
        store.estimate={...store.estimate,...clone(store.writeThenCCSEdit),updated_date:"estimate-v3"};
        store.writeThenCCSEdit=null;
      }
      if(store.loseWriteAck){
        store.loseWriteAck=false;
        throw new Error("Synthetic estimate update acknowledgment lost");
      }
      return {updated:1};
    },
    async create(data){
      assert.equal(store.estimate,null,"Only the empty first-draft fixture may create an estimate");
      store.estimate={...clone(data),id:estimateId,updated_date:"estimate-v2"};
      store.writes++;
      if(store.loseCreateAck){
        store.loseCreateAck=false;
        throw new Error("Synthetic estimate create acknowledgment lost");
      }
      return clone(store.estimate);
    },
  };
  const gate={id:"synthetic-gate",scope:"fleet_repair_estimate",status:"idle",updated_date:"gate-v1"};
  const Gate={
    async filter(query){return query.scope===gate.scope ? [clone(gate)] : [];},
    async get(id){return id===gate.id ? clone(gate) : null;},
    async updateMany(query,change){
      if(query.id!==gate.id || query.status!==gate.status || (query.updated_date && query.updated_date!==gate.updated_date) ||
          (query.claim_token && query.claim_token!==gate.claim_token))return {updated:0};
      Object.assign(gate,clone(change.$set),{updated_date:"gate-v"+(++store.gateClaims+1)});
      if(store.pauseGateClaim && change.$set?.status==="creating"){
        store.pauseGateClaim=false;
        await new Promise(resolve=>store.pendingGateClaims.push(resolve));
      }
      return {updated:1};
    },
  };
  const Policy={async list(){
    if(store.pausePolicyRead){
      store.pausePolicyRead=false;
      await new Promise(resolve=>store.pendingPolicyReads.push(resolve));
    }
    return [];
  }};
  const client={asServiceRole:{entities:{
    FleetMechanicAccess:access,FleetMaintenanceWorkOrder:WorkOrder,
    FleetRepairEstimate:Estimate,FleetRepairEstimateCreateGate:Gate,FleetRepairApprovalPolicy:Policy,
    FleetOperationReceipt:{},FleetSystemLog:{async create(){}},
  }}};
  return {store,grant,gate,client};
}
async function call(body,client){
  globalThis.__fleetEstimateResponseClient=client;
  const res=await handler(new Request("http://synthetic.local",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
  }));
  return {status:res.status,body:await res.json()};
}
async function until(label,predicate){
  const untilMs=Date.now()+3500;
  while(!predicate()){
    assert.ok(Date.now()<untilMs,`Timed out waiting for synthetic ${label}`);
    await new Promise(resolve=>setTimeout(resolve,5));
  }
}
async function commitWithConcurrentEdit(request,mutate){
  const {store,grant,client}=setup();
  store.readBarrier=true;
  const pending=call(request(),client);
  await until("committed estimate reread",()=>store.pendingReads.length===1);
  assert.equal(store.writes,1,"Estimate persisted exactly once before the simulated CCS change");
  mutate(store,grant);
  store.pendingReads.shift()();
  return {...await pending,store,grant};
}

test("Save Draft lost write acknowledgment reports uncertainty without replaying or hiding saved data",async()=>{
  const {store,client}=setup();
  store.loseWriteAck=true;
  const outcome=await call(saveBody(),client);
  assert.equal(outcome.status,409);
  assert.match(outcome.body.error,/may have (already )?(been )?committed|may have saved/i);
  assert.equal(outcome.body.estimate,undefined);
  assert.equal(store.writes,1);
  assert.equal(store.estimate.estimated_total,300);
  const retry=await call(saveBody(),client);
  assert.equal(retry.status,409);
  assert.equal(store.writes,1,"Stale repeated Save Draft must never reapply an uncertain commit");
});

test("Submit lost write acknowledgment reports uncertainty and cannot submit twice",async()=>{
  const {store,client}=setup();
  store.loseWriteAck=true;
  const outcome=await call(submitBody(),client);
  assert.equal(outcome.status,409);
  assert.match(outcome.body.error,/may have (already )?(been )?committed|may have submitted/i);
  assert.equal(outcome.body.estimate,undefined);
  assert.equal(store.estimate.status,"approved");
  assert.equal(store.writes,1);
  const retry=await call(submitBody(),client);
  assert.equal(retry.status,409);
  assert.equal(store.writes,1,"Submit retry must never double-submit an uncertain update");
});

test("lost acknowledgment after another CCS estimate edit preserves that edit and avoids false success",async()=>{
  const {store,client}=setup();
  store.loseWriteAck=true;
  store.writeThenCCSEdit={notes:"Later CCS review notes",status:"changes_requested"};
  const outcome=await call(saveBody(),client);
  assert.equal(outcome.status,409);
  assert.equal(outcome.body.estimate,undefined);
  assert.match(outcome.body.error,/may have (already )?(been )?committed|may have saved/i);
  assert.equal(store.estimate.notes,"Later CCS review notes");
  assert.equal(store.estimate.status,"changes_requested");
  assert.equal(store.writes,1);
  const retry=await call(saveBody(),client);
  assert.equal(retry.status,409);
  assert.equal(store.estimate.notes,"Later CCS review notes");
  assert.equal(store.writes,1);
});

test("first-draft lost create acknowledgment preserves one new draft and blocks blind retry",async()=>{
  const {store,client}=setup();
  store.estimate=null;
  store.loseCreateAck=true;
  const outcome=await call(saveBody(),client);
  assert.equal(outcome.status,409);
  assert.match(outcome.body.error,/may have (already )?(been )?committed|may have saved/i);
  assert.equal(outcome.body.estimate,undefined);
  assert.equal(store.writes,1);
  assert.equal(store.estimate.status,"draft");
  const retry=await call(saveBody(),client);
  assert.equal(retry.status,409,"The portal requires the newly persisted draft version before any further edit");
  assert.equal(retry.body.estimate,undefined);
  assert.equal(store.writes,1,"Unverified first-draft retry must never create or overwrite a second draft");
});

test("Save Draft rejects an equipment reassignment during approval-policy evaluation before its estimate CAS",async()=>{
  const {store,client}=setup();
  store.pausePolicyRead=true;
  const pending=call(saveBody(),client);
  await until("Save Draft approval-policy read",()=>store.pendingPolicyReads.length===1);
  store.work={...store.work,updated_date:"work-v2",equipment_id:"eq-outside"};
  store.pendingPolicyReads.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0,"No estimate update is allowed from a stale Fleet asset");
  assert.equal(store.estimate.updated_date,"estimate-v1");
});

test("Submit Estimate rejects equipment reassignment during approval-policy evaluation",async()=>{
  const {store,client}=setup();
  store.pausePolicyRead=true;
  const pending=call(submitBody(),client);
  await until("Submit Estimate approval-policy read",()=>store.pendingPolicyReads.length===1);
  store.work={...store.work,updated_date:"work-v2",equipment_id:"eq-outside"};
  store.pendingPolicyReads.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0,"Submit must not mutate an estimate for reassigned equipment");
  assert.equal(store.estimate.status,"draft");
});

test("first Save Draft creation rejects reassignment during approval-policy evaluation",async()=>{
  const {store,client}=setup();
  store.estimate=null;
  store.pausePolicyRead=true;
  const pending=call(saveBody(),client);
  await until("first Save Draft policy read",()=>store.pendingPolicyReads.length===1);
  store.work={...store.work,updated_date:"work-v2",equipment_id:"eq-outside"};
  store.pendingPolicyReads.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0,"No first estimate draft may be created for a reassigned work order");
  assert.equal(store.estimate,null);
});

test("first Save Draft gate claim rechecks equipment before creation",async()=>{
  const {store,gate,client}=setup();
  store.estimate=null;
  store.pauseGateClaim=true;
  const pending=call(saveBody(),client);
  await until("first draft gate acquired",()=>store.pendingGateClaims.length===1);
  assert.equal(gate.status,"creating");
  assert.equal(store.writes,0);
  store.work={...store.work,updated_date:"work-v2",equipment_id:"eq-outside"};
  store.pendingGateClaims.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.estimate,null);
  assert.equal(store.writes,0);
  assert.equal(gate.status,"idle");
});

test("Save Draft rejects a same-equipment Fleet revision before the write",async()=>{
  const {store,client}=setup();
  store.pausePolicyRead=true;
  const pending=call(saveBody(),client);
  await until("Save Draft policy read before Fleet revision",()=>store.pendingPolicyReads.length===1);
  store.work={...store.work,updated_date:"work-v2"};
  store.pendingPolicyReads.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0);
});

test("Submit rejects Fleet completion before changing estimate status",async()=>{
  const {store,client}=setup();
  store.pausePolicyRead=true;
  const pending=call(submitBody(),client);
  await until("Submit policy read before Fleet completion",()=>store.pendingPolicyReads.length===1);
  store.work={...store.work,status:"completed"};
  store.pendingPolicyReads.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0);
  assert.equal(store.estimate.status,"draft");
});

test("Save Draft refuses mismatched preexisting estimate equipment",async()=>{
  const {store,client}=setup();
  store.estimate.equipment_id="eq-conflict";
  const outcome=await call(saveBody(),client);
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0);
});

test("Save Draft rejects a Fleet reassignment while the final grant authorization is delayed",async()=>{
  const {store,client}=setup();
  store.pauseGrantRead=true;
  const pending=call(saveBody(),client);
  await until("Save Draft grant check",()=>store.pendingGrantReads.length===1);
  store.work={...store.work,updated_date:"work-v2",equipment_id:"eq-outside"};
  store.pendingGrantReads.shift()();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(store.writes,0,"A delayed grant read cannot authorize a stale Fleet work-order identity");
});

test("legitimate unchanged Save, Submit, and first draft creation still commit once",async()=>{
  for(const [makeBody,firstDraft] of [[saveBody,false],[submitBody,false],[saveBody,true]]){
    const {store,client}=setup();
    if(firstDraft)store.estimate=null;
    const outcome=await call(makeBody(),client);
    assert.equal(outcome.status,200,JSON.stringify(outcome.body));
    assert.equal(store.writes,1,"Exactly one estimate mutation per request");
    assert.equal(outcome.body.estimate.work_order_id,workId);
  }
});

test("Save Draft returns the latest estimate after a later legitimate CCS edit",async()=>{
  const result=await commitWithConcurrentEdit(saveBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",notes:"Later CCS approved edits",estimated_total:935};
  });
  assert.equal(result.status,200);
  assert.equal(result.body.estimate?.updated_date,"estimate-v3");
  assert.equal(result.body.estimate?.notes,"Later CCS approved edits");
  assert.equal(result.body.estimate?.estimated_total,935);
  assert.equal(result.store.writes,1);
});

test("Submit must not claim automatic approval after CCS requests changes during final reread",async()=>{
  const result=await commitWithConcurrentEdit(submitBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",status:"changes_requested",
      approval_required:true,approval_tier:"CCS review",decision_by_email:"ccs-reviewer",decision_notes:"Please revise"};
  });
  assert.equal(result.status,200);
  assert.equal(result.body.estimate?.status,"changes_requested");
  assert.equal(result.body.auto_approved,false,"Latest CCS decision must supersede earlier mechanic auto-approval metadata");
  assert.equal(result.body.concurrently_updated,true);
  assert.equal(result.body.policy?.approval_required,true);
  assert.equal(result.body.policy?.approval_tier,"CCS review");
  assert.equal(result.store.writes,1);
});

test("Submit must not label a newer manual CCS approval as policy-auto approved",async()=>{
  const result=await commitWithConcurrentEdit(submitBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",status:"approved",
      approval_required:true,approval_tier:"CCS manager",decision_by_email:"manager@synthetic.example"};
  });
  assert.equal(result.status,200);
  assert.equal(result.body.estimate?.status,"approved");
  assert.equal(result.body.auto_approved,false);
  assert.equal(result.body.concurrently_updated,true);
  assert.equal(result.body.policy?.approval_required,true);
  assert.equal(result.body.policy?.approval_tier,"CCS manager");
});

test("Save Draft must expose concurrent CCS policy fields rather than earlier evaluated policy",async()=>{
  const result=await commitWithConcurrentEdit(saveBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",status:"submitted",
      approval_required:true,approval_tier:"Director review"};
  });
  assert.equal(result.status,200);
  assert.equal(result.body.estimate?.status,"submitted");
  assert.equal(result.body.concurrently_updated,true);
  assert.equal(result.body.policy?.approval_required,true);
  assert.equal(result.body.policy?.approval_tier,"Director review");
  assert.equal(result.body.policy?.policy_id,"","No earlier policy identity may be misattributed to a newer CCS estimate");
});

test("Ordinary unchanged Submit keeps its real policy-auto success metadata",async()=>{
  const {store,client}=setup();
  const outcome=await call(submitBody(),client);
  assert.equal(outcome.status,200);
  assert.equal(outcome.body.auto_approved,true);
  assert.notEqual(outcome.body.concurrently_updated,true);
  assert.equal(outcome.body.estimate?.status,"approved");
  assert.equal(store.writes,1);
});

test("Mechanic Submit flow fences its second write when CCS revises the Save Draft response",()=>{
  const ui=readFileSync(path.join(root,"src/pages/FleetMechanic.jsx"),"utf8");
  const start=ui.indexOf("const saveEstimate = async (submit = false) =>");
  const end=ui.indexOf("const saveProgress = async () =>",start);
  assert.ok(start>0&&end>start);
  const flow=ui.slice(start,end);
  const guard=flow.indexOf("if (saved?.data?.concurrently_updated)");
  const secondWrite=flow.indexOf('action:"estimate_submit"');
  assert.ok(guard>=0&&secondWrite>guard,"Second Submit write must be fenced by concurrent Save detection");
  assert.match(flow,/Submit was not attempted/,"Explicitly tell mechanic no Submit occurred");
  assert.match(flow,/if \(submitted\?\.data\?\.concurrently_updated\)/,"Newer CCS decision must override a stale Submit banner");
  assert.match(flow,/if \(submitted\?\.data\?\.auto_approved\)/,"Ordinary auto-approval messaging must remain");
});

test("Submit blocks financial data if the Fleet work order changes to equipment outside the bearer grant",async()=>{
  const result=await commitWithConcurrentEdit(submitBody,store=>{
    store.work={...store.work,equipment_id:"eq-outside",updated_date:"work-v2"};
  });
  assert.equal(result.status,403);
  assert.equal(result.body.estimate,undefined);
  assert.equal(result.store.writes,1);
});

test("Save Draft blocks estimate details after another administrator transfers estimate ownership",async()=>{
  const result=await commitWithConcurrentEdit(saveBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",mechanic_access_id:"other-grant"};
  });
  assert.equal(result.status,409);
  assert.equal(result.body.estimate,undefined);
  assert.equal(result.store.writes,1);
});

test("Submit blocks stale estimate details if the estimate is relinked to a different Fleet work order",async()=>{
  const result=await commitWithConcurrentEdit(submitBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",work_order_id:"unrelated-work"};
  });
  assert.equal(result.status,409);
  assert.equal(result.body.estimate,undefined);
  assert.equal(result.store.writes,1);
});

test("Save Draft denies financial data if the latest Fleet work order is unavailable",async()=>{
  const result=await commitWithConcurrentEdit(saveBody,store=>{store.work=null;});
  assert.equal(result.status,409);
  assert.equal(result.body.estimate,undefined);
  assert.equal(result.store.writes,1);
});

test("Submit blocks estimate details if its equipment reference conflicts with the current Fleet work order",async()=>{
  const result=await commitWithConcurrentEdit(submitBody,store=>{
    store.estimate={...store.estimate,updated_date:"estimate-v3",equipment_id:"eq-mismatch"};
  });
  assert.equal(result.status,409);
  assert.equal(result.body.estimate,undefined);
  assert.equal(result.store.writes,1);
});
