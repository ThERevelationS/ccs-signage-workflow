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
  const store={work:baseWork(),estimate:currentEstimate(),writes:0,readBarrier:false,pendingReads:[],estimateReads:0};
  const grant={id:grantId,enabled:true,name:"Synthetic mechanic",token_hash:hash(token),
    allowed_actions:["bootstrap","start","save","estimate_save","estimate_submit"],
    scope_mode:"selected_equipment",allowed_equipment_ids:["eq-allowed"],
    expires_at:"2099-01-01T00:00:00.000Z"};
  const access={
    async filter(query){return query.token_hash===grant.token_hash && grant.enabled ? [clone(grant)] : [];},
    async get(id){return id===grantId ? clone(grant) : null;},
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
      return {updated:1};
    },
  };
  const Policy={async list(){return [];}};
  const client={asServiceRole:{entities:{
    FleetMechanicAccess:access,FleetMaintenanceWorkOrder:WorkOrder,
    FleetRepairEstimate:Estimate,FleetRepairEstimateCreateGate:{},FleetRepairApprovalPolicy:Policy,
    FleetOperationReceipt:{},FleetSystemLog:{async create(){}},
  }}};
  return {store,grant,client};
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
