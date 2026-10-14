// Deterministic extracted real FleetMechanic Save Draft -> Submit handler, mocked transport.
// Purely synthetic state: does not call Base44 or touch production records.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const source=readFileSync(path.join(process.cwd(),"src/pages/FleetMechanic.jsx"),"utf8");
const begin=source.indexOf("  const saveEstimate = async (submit = false) => {");
const finish=source.indexOf("  const saveProgress = async () => {",begin);
assert.ok(begin>=0&&finish>begin,"Live FleetMechanic estimate handler must exist");
const handlerBlock=source.slice(begin,finish);
const refreshBegin=source.indexOf("  const refreshEstimateState = async (workOrderId, reason = ");
assert.ok(refreshBegin>0&&refreshBegin<begin,"Real final estimate reload handler must exist");
const refreshBlock=source.slice(refreshBegin,begin);
const bindRefresh=new Function("ctx",`with(ctx){${refreshBlock} return refreshEstimateState; }`);
// Evaluate the exact live handler, with state and Base44 invocations replaced by
// local test fixtures. This is not a browser acceptance test.
const bindHandler=new Function("ctx",`with(ctx){${handlerBlock} return saveEstimate; }`);
const defer=()=>{let resolve; const promise=new Promise(done=>{resolve=done;}); return {promise,resolve};};

function harness({holdSave=false,holdSubmit=false,autoApproved=false}={}) {
  const calls=[];
  const saves=[],errors=[],forms=[],busy=[],refreshes=[],recoveries=[];
  const saveGate=defer(),submitGate=defer();
  const initialEstimate={id:"estimate-A",work_order_id:"wo-A",visibility:"mechanic",status:"draft",
    updated_date:"estimate-v1",estimated_labor_hours:2,labor_rate:100,notes:"Initial"};
  const savedEstimate={...initialEstimate,updated_date:"estimate-v2",notes:"Saved"};
  const submittedEstimate={...savedEstimate,updated_date:"estimate-v3",status:"submitted"};
  const ctx={
    selected:{id:"wo-A",updated_date:"work-v1"},
    selectedWorkOrderRef:{current:"wo-A"},
    portalAppliedEpochRef:{current:3},
    portalRequestRef:{current:0},
    setEstimateRecovery:value=>recoveries.push(value),
    setRefreshing:()=>{},
    applyPortalPayload:result=>{ctx.lastAppliedPayload=result;},
    fetchPortalPayload:async()=>ctx.serverPayload,
    pretty:value=>String(value||"draft").replaceAll("_"," "),
    data:{portal:{capabilities:{estimates:true}}},
    estimateRecovery:null,
    estimateByWorkOrder:{"wo-A":initialEstimate},
    estimateForm:{estimated_labor_hours:"3",labor_rate:"100",misc_total:"0",notes:"Changed",
      estimated_completion_date:"",parts_estimate:[],fluids_estimate:[]},
    token:"synthetic-token",
    setBusy:value=>busy.push(value),
    setActionError:value=>errors.push(value),
    setSavedMessage:value=>saves.push(value),
    setEstimateForm:value=>forms.push(value),
    estimateSeed:value=>value?.visibility === "mechanic"
      ? ({fromEstimate:value.updated_date,work_order_id:value.work_order_id})
      : ({fromEstimate:"",work_order_id:""}),
    refreshEstimateState:async (...args)=>{
      refreshes.push(args);
      if(args[3]?.estimate) {
        saves.push(args[3].message);
        forms.push({fromEstimate:args[3].estimate.updated_date,work_order_id:args[3].estimate.work_order_id});
      }
      return true;
    },
    base44:{functions:{invoke:async(_name,request)=>{
      calls.push(request);
      if(request.action==="estimate_save"){
        if(holdSave)return await saveGate.promise;
        return {data:{success:true,estimate:savedEstimate}};
      }
      if(request.action==="estimate_submit"){
        if(holdSubmit)return await submitGate.promise;
        return {data:{success:true,estimate:submittedEstimate,auto_approved:autoApproved}};
      }
      throw new Error("Unexpected synthetic portal operation");
    }}},
  };
  const run=bindHandler(ctx);
  const useRealRefresh=()=>{ctx.refreshEstimateState=bindRefresh(ctx);};
  const setServerEstimate=(estimate,visibility="mechanic")=>{
    ctx.serverPayload={
      active_work_orders:[{id:"wo-A"}],recent_completed:[],
      repair_estimates:estimate?[{...estimate,visibility}]:[],
    };
  };
  return {ctx,run,calls,saves,errors,forms,busy,refreshes,recoveries,saveGate,submitGate,
    savedEstimate,submittedEstimate,useRealRefresh,setServerEstimate};
}

test("switching from A to B during delayed Save Draft must not submit A or project A into B",async()=>{
  const h=harness({holdSave:true});
  const pending=h.run(true);
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save"]);
  // A user selects B while A's request remains in-flight. React's original
  // callback retains selected=A, but its selectedWorkOrderRef changes.
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.saveGate.resolve({data:{success:true,estimate:h.savedEstimate}});
  await pending;
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save"],"Never submit stale A after B selected");
  assert.equal(h.forms.length,0,"No A form may overwrite B's draft");
  assert.equal(h.saves.some(x=>x&&/submitted|approved/i.test(x)),false,"No stale B success banner");
  assert.equal(h.refreshes.some(x=>x[0]==="wo-A"),true,"Reconcile saved A without replay");
});

test("a newer portal refresh during delayed Save Draft must fence Submit's second write",async()=>{
  const h=harness({holdSave:true});
  const pending=h.run(true);
  h.ctx.portalAppliedEpochRef.current+=1;
  h.saveGate.resolve({data:{success:true,estimate:h.savedEstimate}});
  await pending;
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save"],"Do not resubmit an estimate after a later refresh");
  assert.equal(h.forms.length,0,"Do not clobber refreshed form state");
  assert.equal(h.refreshes.length,1,"Use read-only current-state reconciliation");
});

test("switching work orders during delayed Submit must not project stale A status into B",async()=>{
  const h=harness({holdSubmit:true});
  const pending=h.run(true);
  for(let attempt=0;h.calls.length<2&&attempt<100;attempt++)await Promise.resolve();
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save","estimate_submit"]);
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.submitGate.resolve({data:{success:true,estimate:h.submittedEstimate,auto_approved:false}});
  await pending;
  assert.equal(h.forms.length,0,"No A submit response may replace B draft");
  assert.equal(h.saves.some(x=>x&&/submitted|approved/i.test(x)),false);
  assert.equal(h.refreshes.some(x=>x[0]==="wo-A"),true);
});

test("a newer portal refresh while Submit is in flight cannot overwrite refreshed form state",async()=>{
  const h=harness({holdSubmit:true});
  const pending=h.run(true);
  for(let attempt=0;h.calls.length<2&&attempt<100;attempt++)await Promise.resolve();
  assert.equal(h.calls.at(-1).action,"estimate_submit");
  h.ctx.portalAppliedEpochRef.current+=1;
  h.submitGate.resolve({data:{success:true,estimate:h.submittedEstimate,auto_approved:false}});
  await pending;
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save","estimate_submit"]);
  assert.equal(h.forms.length,0,"Do not project older estimate after later portal refresh");
  assert.equal(h.refreshes.length,1,"Reread CCS instead of claiming stale approval success");
  assert.equal(h.saves.filter(Boolean).length,0);
});

test("Save confirmed concurrent CCS edit halts Submit and provides a precise read-only recovery reason",async()=>{
  const h=harness({holdSave:true});
  const pending=h.run(true);
  h.saveGate.resolve({data:{success:true,estimate:{...h.savedEstimate,status:"changes_requested"},
    concurrently_updated:true}});
  await pending;
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save"],"CCS revision must fence Submit");
  assert.equal(h.refreshes.length,1);
  assert.match(h.refreshes[0][1],/Save Draft finished.*Submit was not attempted/i);
  assert.equal(h.refreshes[0][2],true,"Read-only recovery should explain authoritative CCS status");
  assert.equal(h.saves.filter(Boolean).length,0);
});

test("newer CCS changes-requested decision on final reload clears earlier auto-approval banner",async()=>{
  const h=harness({autoApproved:true});
  h.submittedEstimate.status="approved";
  h.useRealRefresh();
  h.setServerEstimate({...h.submittedEstimate,updated_date:"estimate-v4",status:"changes_requested",
    approval_required:true,approval_tier:"Supervisor",decision_notes:"Revise line items"});
  await h.run(true);
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save","estimate_submit"]);
  assert.equal(h.forms.at(-1).fromEstimate,"estimate-v4");
  assert.equal(h.saves.at(-1),"","Do not leave a stale auto-approved confirmation");
  assert.match(h.errors.at(-1),/changes requested/i);
  assert.match(h.errors.at(-1),/CCS/i);
});

test("newer CCS approval on final reload clears stale waiting-for-approval banner",async()=>{
  const h=harness();
  h.useRealRefresh();
  h.setServerEstimate({...h.submittedEstimate,updated_date:"estimate-v4",status:"approved",
    approval_required:true,approval_tier:"Manager",decision_notes:"Approved by CCS"});
  await h.run(true);
  assert.equal(h.saves.at(-1),"","Old submission-to-CCS message must not remain");
  assert.equal(h.forms.at(-1).fromEstimate,"estimate-v4");
  assert.match(h.errors.at(-1),/approved/i);
});

test("a newer CCS revision to Save Draft clears the draft-saved confirmation",async()=>{
  const h=harness();
  h.useRealRefresh();
  h.setServerEstimate({...h.savedEstimate,updated_date:"estimate-v7",notes:"Changed by CCS"});
  await h.run(false);
  assert.equal(h.saves.at(-1),"");
  assert.match(h.errors.at(-1),/CCS/i);
  assert.equal(h.forms.at(-1).fromEstimate,"estimate-v7");
});

test("unchanged server revision preserves legitimate automatic approval confirmation",async()=>{
  const h=harness({autoApproved:true});
  h.submittedEstimate.status="approved";
  h.useRealRefresh();
  h.setServerEstimate(h.submittedEstimate);
  await h.run(true);
  assert.match(h.saves.at(-1),/automatically approved/i);
  assert.equal(h.errors.at(-1),"");
  assert.equal(h.recoveries.at(-1),null);
});

test("unavailable final reload hides unverified automatic approval banner and retains recovery lock",async()=>{
  const h=harness({autoApproved:true});
  h.submittedEstimate.status="approved";
  h.useRealRefresh();
  h.ctx.fetchPortalPayload=async()=>{throw new Error("Synthetic CCS reload unavailable")};
  await h.run(true);
  assert.equal(h.saves.at(-1),"");
  assert.match(h.errors.at(-1),/server ownership could not be verified/i);
  assert.equal(h.recoveries.at(-1)?.workOrderId,"wo-A");
});

test("missing or transferred estimate on final reload cannot leave a successful approval banner",async()=>{
  for(const [row,visibility] of [[null,"mechanic"],[{id:"estimate-other",work_order_id:"wo-A",updated_date:"estimate-v4",status:"submitted"},"ccs_managed"]]){
    const h=harness({autoApproved:true});
    h.submittedEstimate.status="approved";
    h.useRealRefresh();
    h.setServerEstimate(row,visibility);
    await h.run(true);
    assert.equal(h.saves.at(-1),"");
    assert.match(h.errors.at(-1),/CCS Fleet estimate changed after the operation response/i,
      "Missing or transferred ownership must reach verified mismatch handling, not a mock error");
    assert.equal(h.forms.at(-1).fromEstimate,"","Unverified financial details must not survive final reload");
    assert.equal(h.recoveries.at(-1)?.workOrderId,"wo-A","Unverified ownership cannot unlock editing");
  }
});

test("unchanged Save and Submit remains a valid two-write flow",async()=>{
  const h=harness();
  await h.run(true);
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save","estimate_submit"]);
  assert.equal(h.forms.at(-1).fromEstimate,"estimate-v3");
  assert.match(h.saves.at(-1),/submitted to CCS/i);
  assert.equal(h.refreshes.length,1);
});

test("ordinary Save Draft still completes without an extra Submit",async()=>{
  const h=harness();
  await h.run(false);
  assert.deepEqual(h.calls.map(x=>x.action),["estimate_save"]);
  assert.equal(h.forms.at(-1).fromEstimate,"estimate-v2");
  assert.match(h.saves.at(-1),/draft saved/i);
});
