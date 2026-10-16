import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const source=readFileSync(path.join(process.cwd(),"src/pages/FleetMechanic.jsx"),"utf8");
const begin=source.indexOf("  const recoverWorkMutation = async (recovery, reason = \"");
const finish=source.indexOf("  const handleSupersededWorkAcknowledgement",begin);
assert.ok(begin>=0&&finish>begin,"Live Start/Save recovery handler must exist");
const bindRecovery=new Function("ctx",`with(ctx){${source.slice(begin,finish)} return recoverWorkMutation; }`);
const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

function harness(action){
  const response=defer();
  const initial={workOrderId:"wo-A",action,requestId:`request-${action}-1234567890123456`,reason:"Synthetic interrupted mutation."};
  const events={snapshots:[],errors:[],messages:[],scopeNotices:[],recoveries:[],busy:[],refreshing:[],clears:[],draftClears:[]};
  let currentRecovery=null;
  const ctx={
    token:"synthetic",
    selectedWorkOrderRef:{current:"wo-A"},
    workRecoveryRequestRef:{current:2},
    portalRequestRef:{current:10},
    photoDraftEpochRef:{current:0},
    base44:{functions:{invoke:async (_name,payload)=>{events.requests=(events.requests||[]).concat(payload);return response.promise;}}},
    setWorkRecovery:value=>{currentRecovery=typeof value==="function"?value(currentRecovery):value;events.recoveries.push(currentRecovery);},
    setBusy:value=>events.busy.push(value),
    setRefreshing:value=>events.refreshing.push(value),
    setActionError:value=>events.errors.push(value),
    setSavedMessage:value=>events.messages.push(value),
    setScopeNotice:value=>events.scopeNotices.push(value),
    applyWorkOrderSnapshot:value=>events.snapshots.push(value),
    clearSavedProgressDraft:value=>events.draftClears.push(value),
    clearStoredWorkRecovery:async (_token,value)=>events.clears.push(value),
  };
  return {ctx,events,response,initial,get recovery(){return currentRecovery;}};
}

for(const action of ["start","save"]){
  test(`${action}: late applied status after switching jobs cannot update the selected job or cancel its refresh`,async()=>{
    const h=harness(action);
    const pending=bindRecovery(h.ctx)(h.initial);
    assert.equal(h.events.requests[0].work_order_id,"wo-A");
    assert.equal(h.events.requests[0].request_id,h.initial.requestId);
    h.ctx.selectedWorkOrderRef.current="wo-B";
    h.ctx.portalRequestRef.current+=1; // deterministic newer refresh for the selected job
    const newPortalRequest=h.ctx.portalRequestRef.current;
    h.events.snapshots.length=0;
    h.events.errors.length=0;
    h.events.messages.length=0;
    h.events.busy.length=0;
    h.events.refreshing.length=0;
    h.response.resolve({data:{status:"applied",work_order:{id:"wo-A",status:"in_progress",actual_hours:9}}});
    assert.equal(await pending,true);
    assert.deepEqual(h.events.snapshots,[],"The old job snapshot must not enter the selected job's state");
    assert.equal(h.ctx.portalRequestRef.current,newPortalRequest,"Work recovery must not supersede the selected job's portal refresh");
    assert.deepEqual(h.events.errors,["An earlier mechanic request was confirmed. The currently open job was not changed."]);
    assert.deepEqual(h.events.messages,[""]);
    assert.deepEqual(h.events.busy,[]);
    assert.deepEqual(h.events.refreshing,[]);
    assert.equal(h.events.clears.length,1,"Verified receipt marker should be cleared for the original request");
    assert.equal(h.recovery,null,"Resolved original marker can be cleared without changing the selected job");
  });

  test(`${action}: late denied status after switching jobs preserves recovery without leaking an error`,async()=>{
    const h=harness(action);
    const pending=bindRecovery(h.ctx)(h.initial);
    h.ctx.selectedWorkOrderRef.current="wo-B";
    h.ctx.portalRequestRef.current+=1;
    const newPortalRequest=h.ctx.portalRequestRef.current;
    h.events.errors.length=0;
    h.events.messages.length=0;
    h.events.busy.length=0;
    h.events.refreshing.length=0;
    h.response.resolve({data:{error:"This mechanic link is not allowed to verify that action."}});
    assert.equal(await pending,false);
    assert.equal(h.ctx.portalRequestRef.current,newPortalRequest,"Denied recovery cannot cancel another job's portal work");
    assert.deepEqual(h.events.errors,["An earlier work-order request could not be verified. It may no longer be available to this mechanic link. Nothing was replayed; contact CCS if access is needed."],"Only a generic recovery notice may appear with the selected job");
    assert.doesNotMatch(h.events.errors.join(" "),/wo-A|request-start|request-save|Access denied/i,"The selected job must not reveal restricted identifiers or raw server details");
    assert.deepEqual(h.events.messages,[""]);
    assert.deepEqual(h.events.busy,[]);
    assert.deepEqual(h.events.refreshing,[]);
    assert.equal(h.recovery.workOrderId,"wo-A","Unverified recovery remains locked to the original job");
    assert.equal(h.recovery.requestId,h.initial.requestId);
    assert.deepEqual(h.events.clears,[],"Denied status must retain the durable request marker");
  });

  test(`${action}: denied recovery after scope loss remains actionable without exposing the job identifier`,async()=>{
    const h=harness(action);
    const pending=bindRecovery(h.ctx)(h.initial);
    h.ctx.selectedWorkOrderRef.current=null;
    h.response.resolve({data:{error:"Access denied for wo-A"}});
    assert.equal(await pending,false);
    assert.equal(h.recovery.workOrderId,"wo-A");
    assert.equal(h.events.clears.length,0);
    assert.equal(h.events.scopeNotices.at(-1),"An earlier work-order request could not be verified. It may no longer be available to this mechanic link. Nothing was replayed; contact CCS if access is needed.");
    assert.doesNotMatch(h.events.scopeNotices.at(-1),/wo-A|Access denied/i);
    assert.equal(h.events.busy.at(-1),"");
    assert.equal(h.events.refreshing.at(-1),false);
  });
}
