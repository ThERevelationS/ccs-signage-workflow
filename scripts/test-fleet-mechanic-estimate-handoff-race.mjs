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
const defer=()=>{let resolve,reject; const promise=new Promise((done,fail)=>{resolve=done;reject=fail;}); return {promise,resolve,reject};};
const applyBegin=source.indexOf("  const applyPortalPayload = result => {");
const applyEnd=source.indexOf("  const applyWorkOrderSnapshot = workOrder => {",applyBegin);
const loadBegin=source.indexOf("  const load = async (");
const loadEnd=source.indexOf("  useEffect(() => { load(); }, []);",loadBegin);
assert.ok(applyBegin>=0&&applyEnd>applyBegin&&loadBegin>=0&&loadEnd>loadBegin);
const bindApply=new Function("ctx",`with(ctx){${source.slice(applyBegin,applyEnd)} return applyPortalPayload; }`);
const bindLoad=new Function("ctx",`with(ctx){${source.slice(loadBegin,loadEnd)} return load; }`);

function refreshHarness(){
  const original={id:"estimate-A",work_order_id:"wo-A",visibility:"mechanic",updated_date:"v1",status:"approved",
    approval_required:false,approval_tier:"",notes:"Old saved"};
  const previous={portal:{capabilities:{estimates:true,save:true}},
    active_work_orders:[{id:"wo-A",updated_date:"work-v1"}],recent_completed:[],repair_estimates:[original]};
  const events={forms:[],errors:[],saves:[],recoveries:[],applications:[],
    selections:[],scopeNotices:[],photos:[]};
  const ctx={
    token:"synthetic",selectedWorkOrderRef:{current:"wo-A"},
    portalRequestRef:{current:0},portalAppliedEpochRef:{current:3},
    portalPayloadRef:{current:previous},estimateCapabilityRef:{current:true},saveCapabilityRef:{current:true},
    photoDraftEpochRef:{current:0},
    setData:value=>events.applications.push(value),
    setError:()=>{},setSelected:value=>events.selections.push(value),
    setPhotos:value=>events.photos.push(typeof value==="function"?value([]):value),setForm:()=>{},
    setScopeNotice:value=>events.scopeNotices.push(value),
    setActionError:value=>events.errors.push(value),
    setSavedMessage:value=>events.saves.push(value),
    setEstimateRecovery:value=>events.recoveries.push(value),
    setEstimateForm:value=>events.forms.push(value),
    setBusy:()=>{},setRefreshing:()=>{},setLoading:()=>{},
    estimateSeed:row=>row?.visibility==="mechanic" ? ({status:row.status,version:row.updated_date,notes:row.notes}) : ({notes:""}),
    pretty:value=>String(value||"draft").replaceAll("_"," "),
    readStoredWorkRecovery:async()=>null,
    openJob:()=>{},
    fetchPortalPayload:async()=>ctx.nextPayload,
  };
  ctx.applyPortalPayload=bindApply(ctx);
  ctx.load=bindLoad(ctx);
  ctx.refreshEstimateState=bindRefresh(ctx);
  return {ctx,events,original,previous,
    nextEstimate:(overrides={})=>({...previous,
      repair_estimates:[{...original,...overrides}]}),
  };
}

test("manual Refresh removes inaccessible work order and displays generic access-change notice",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload={...h.previous,active_work_orders:[],recent_completed:[],repair_estimates:[]};
  await h.ctx.load(true);
  assert.equal(h.ctx.selectedWorkOrderRef.current,null,"Revoked work order must close");
  assert.equal(h.events.selections.at(-1),null,"Restricted modal cannot remain mounted");
  assert.deepEqual(h.events.forms.at(-1),{notes:""},"Old financial form is cleared");
  assert.deepEqual(h.events.photos.at(-1),[],"Restricted photos cleared");
  assert.equal(h.events.saves.at(-1),"","Old approval cannot remain visible");
  assert.equal(h.events.recoveries.at(-1),null,"No inaccessible estimate recovery marker");
  assert.match(h.events.scopeNotices.at(-1),/no longer available to this mechanic link/i);
  assert.doesNotMatch(h.events.scopeNotices.at(-1),/estimate-A|wo-A|approved/i,
    "Access warning must not reveal restricted record identity or approval");
});

test("Check Current Server State on revoked work order must not recreate inaccessible recovery",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload={...h.previous,active_work_orders:[],recent_completed:[],repair_estimates:[]};
  const verified=await h.ctx.refreshEstimateState("wo-A","Interrupted estimate requested reread.",true);
  assert.equal(verified,false);
  assert.equal(h.ctx.selectedWorkOrderRef.current,null);
  assert.equal(h.events.recoveries.at(-1),null,"No stale inaccessible recovery state after closing");
  assert.match(h.events.scopeNotices.at(-1),/no longer available to this mechanic link/i);
  assert.equal(h.events.saves.at(-1),"");
});

test("in-flight recovery for A cannot apply stale scope after mechanic opens B",async()=>{
  const h=refreshHarness();
  const pendingResponse=defer();
  h.ctx.fetchPortalPayload=()=>pendingResponse.promise;
  const pending=h.ctx.refreshEstimateState("wo-A","Recover A.",true);
  const markersBefore=h.events.recoveries.length;
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.ctx.photoDraftEpochRef.current+=1;
  pendingResponse.resolve({...h.previous,active_work_orders:[{id:"wo-B"}]});
  assert.equal(await pending,false);
  assert.equal(h.events.applications.length,0,"Do not apply an old scoped response to B");
  assert.equal(h.events.recoveries.length,markersBefore,"Do not clear or change B's recovery lock");
  assert.equal(h.events.scopeNotices.length,0);
});

test("failed in-flight recovery for A cannot replace B's pending recovery marker",async()=>{
  const h=refreshHarness();
  const pendingResponse=defer();
  h.ctx.fetchPortalPayload=()=>pendingResponse.promise;
  const pending=h.ctx.refreshEstimateState("wo-A","Recover A.",true);
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.ctx.photoDraftEpochRef.current+=1;
  const markersBefore=h.events.recoveries.length;
  pendingResponse.reject(new Error("Synthetic network failure"));
  assert.equal(await pending,false);
  assert.equal(h.events.recoveries.length,markersBefore,"A's late failure must not overwrite B's pending recovery");
  assert.equal(h.events.errors.length,0,"Do not show A's error in B");
});

test("close and reopen same work order fences stale earlier recovery response",async()=>{
  const h=refreshHarness();
  const pendingResponse=defer();
  h.ctx.fetchPortalPayload=()=>pendingResponse.promise;
  const pending=h.ctx.refreshEstimateState("wo-A","Recover A.",true);
  h.ctx.selectedWorkOrderRef.current=null;
  h.ctx.photoDraftEpochRef.current+=1;
  h.ctx.selectedWorkOrderRef.current="wo-A";
  h.ctx.photoDraftEpochRef.current+=1;
  pendingResponse.resolve(h.nextEstimate({updated_date:"v2",status:"changes_requested"}));
  assert.equal(await pending,false);
  assert.equal(h.events.applications.length,0,"Old A response must not overwrite newly reopened A");
});

test("late recovery for inaccessible A cannot clear B's active recovery lock",async()=>{
  const h=refreshHarness();
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.ctx.nextPayload={...h.previous,active_work_orders:[{id:"wo-B"}],
    recent_completed:[],repair_estimates:[]};
  const result=await h.ctx.refreshEstimateState("wo-A","Old estimate response finished.",true);
  assert.equal(result,false);
  assert.equal(h.ctx.selectedWorkOrderRef.current,"wo-B","Current authorized work order remains selected");
  assert.equal(h.events.recoveries.length,0,
    "Old A completion cannot replace or clear B's separate pending recovery marker");
  assert.equal(h.events.scopeNotices.length,0,"Do not raise revocation notice for B");
  assert.equal(h.events.saves.length,0,"Do not modify B's confirmation UI");
});

test("reordered refresh cannot restore revoked work order from a stale response",async()=>{
  const h=refreshHarness();
  const slow=defer(),fast=defer();
  let calls=0;
  h.ctx.fetchPortalPayload=()=>++calls===1?slow.promise:fast.promise;
  const prior=h.ctx.load(true);
  const latest=h.ctx.load(true);
  fast.resolve({...h.previous,active_work_orders:[],recent_completed:[],repair_estimates:[]});
  await latest;
  slow.resolve(h.previous);
  await prior;
  assert.equal(h.events.applications.length,1);
  assert.equal(h.ctx.selectedWorkOrderRef.current,null);
  assert.equal(h.events.selections.at(-1),null);
  assert.match(h.events.scopeNotices.at(-1),/no longer available/i);
});

test("manual Refresh detects newer CCS estimate and preserves unsaved draft behind recovery guard",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate({updated_date:"v2",status:"changes_requested"});
  await h.ctx.load(true);
  assert.equal(h.events.applications.length,1,"Scoped fresh portal data is applied");
  assert.equal(h.events.forms.length,0,"Manual Refresh must not silently overwrite unsaved entries");
  assert.equal(h.events.saves.at(-1),"","Earlier approval banner is no longer reliable");
  assert.equal(h.events.recoveries.at(-1)?.workOrderId,"wo-A","Editing remains locked for review");
  assert.match(h.events.errors.at(-1),/CCS.*changed/i);
});

test("manual Refresh detects status changes even with a contradictory unchanged version",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate({status:"changes_requested",approval_required:true});
  await h.ctx.load(true);
  assert.equal(h.events.recoveries.at(-1)?.workOrderId,"wo-A");
  assert.equal(h.events.saves.at(-1),"");
});

test("manual Refresh detects changed financial inputs even when provider version is unchanged",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate({estimated_labor_hours:9,notes:"CCS revised estimated hours"});
  await h.ctx.load(true);
  assert.equal(h.events.recoveries.at(-1)?.workOrderId,"wo-A",
    "Fresh CAS version must not authorize saving a stale local form over altered CCS financial inputs");
  assert.equal(h.events.forms.length,0);
  assert.equal(h.events.saves.at(-1),"");
});

test("out-of-order manual Refresh results cannot roll back a newer CCS decision",async()=>{
  const h=refreshHarness();
  const slow=defer(),fast=defer();
  let calls=0;
  h.ctx.fetchPortalPayload=()=>++calls===1?slow.promise:fast.promise;
  const first=h.ctx.load(true);
  const second=h.ctx.load(true);
  fast.resolve(h.nextEstimate({updated_date:"v3",status:"changes_requested"}));
  await second;
  slow.resolve(h.nextEstimate({updated_date:"v2",status:"submitted"}));
  await first;
  assert.equal(h.events.applications.length,1,"Older request cannot apply after newer scoped data");
  assert.equal(h.ctx.portalPayloadRef.current.repair_estimates[0].updated_date,"v3");
  assert.equal(h.events.recoveries.at(-1)?.workOrderId,"wo-A");
  assert.equal(h.events.saves.at(-1),"");
});

test("a second unchanged manual Refresh must not remove an outstanding review lock",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate({updated_date:"v2",status:"changes_requested"});
  await h.ctx.load(true);
  const recoveryCount=h.events.recoveries.length;
  await h.ctx.load(true);
  assert.equal(h.events.recoveries.length,recoveryCount,
    "Only explicit Check Current Server State can release a detected conflict");
});

test("manual Refresh with same server estimate preserves editable draft without false conflict",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate();
  await h.ctx.load(true);
  assert.ok(!h.events.recoveries.some(Boolean),"Unchanged server state does not lock estimate");
  assert.equal(h.events.forms.length,0,"Unchanged manual refresh does not destroy unsaved notes");
});

test("Check Current Server State after manual conflict accepts newest version, clears old banner",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate({updated_date:"v5",status:"changes_requested"});
  await h.ctx.load(true);
  await h.ctx.refreshEstimateState("wo-A","CCS updated this estimate.",true);
  assert.equal(h.events.forms.at(-1).version,"v5");
  assert.equal(h.events.recoveries.at(-1),null);
  assert.equal(h.events.saves.at(-1),"");
  assert.match(h.events.errors.at(-1),/Current server estimate reloaded as changes requested/);
});

test("Check Current Server State cannot leave a previous automatic-approval banner",async()=>{
  const h=refreshHarness();
  h.ctx.nextPayload=h.nextEstimate({updated_date:"v4",status:"changes_requested"});
  await h.ctx.refreshEstimateState("wo-A","Earlier confirmation requires verification.",true);
  assert.equal(h.events.saves.at(-1),"");
  assert.match(h.events.errors.at(-1),/changes requested/);
});


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
    photoDraftEpochRef:{current:0},
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

test("automatic approval is never displayed while the final reload is pending",async()=>{
  const h=harness({autoApproved:true});
  h.submittedEstimate.status="approved";
  h.useRealRefresh();
  const reload=defer();
  let reloadStarted=false;
  h.ctx.fetchPortalPayload=async()=>{reloadStarted=true;return await reload.promise;};
  const pending=h.run(true);
  for(let i=0;i<40&&!reloadStarted;i++)await Promise.resolve();
  assert.equal(reloadStarted,true,"Final read must start before the approval may be confirmed");
  assert.equal(h.saves.some(message=>/approved/i.test(message||"")),false,
    "An in-flight response must not show automatic approval before CCS verification");
  h.setServerEstimate({...h.submittedEstimate,updated_date:"estimate-v4",status:"changes_requested"});
  reload.resolve(h.ctx.serverPayload);
  await pending;
  assert.equal(h.saves.some(message=>/approved/i.test(message||"")),false);
  assert.match(h.errors.at(-1),/changes requested/i);
});

test("same-version decision conflict also suppresses the success banner",async()=>{
  const h=harness({autoApproved:true});
  h.submittedEstimate.status="approved";
  h.useRealRefresh();
  h.setServerEstimate({...h.submittedEstimate,status:"changes_requested",approval_required:true});
  await h.run(true);
  assert.equal(h.saves.at(-1),"");
  assert.match(h.errors.at(-1),/changes requested/i);
});

test("explicit read-only recovery retains its existing latest-status explanation",async()=>{
  const h=harness();
  h.useRealRefresh();
  h.setServerEstimate({...h.savedEstimate,status:"changes_requested"});
  const loaded=await h.ctx.refreshEstimateState("wo-A","Interrupted estimate needs verification.",true);
  assert.equal(loaded,true);
  assert.match(h.errors.at(-1),/Current server estimate reloaded as changes requested/i);
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
