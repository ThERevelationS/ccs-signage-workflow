import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const source=readFileSync("src/pages/FleetMechanic.jsx","utf8");
const begin=source.indexOf("  const recoverWorkMutation = async (recovery, reason = \"");
const end=source.indexOf("  const handleSupersededWorkAcknowledgement",begin);
assert.ok(begin>=0&&end>begin);
const recover=new Function("ctx",`with(ctx){${source.slice(begin,end)} return recoverWorkMutation; }`);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

for(const action of ["start","save"]) for(const outcome of ["applied","denied"]) {
  test(`${action} late ${outcome} recovery is isolated from selected job B`,async()=>{
    const response=deferred(), initial={workOrderId:"wo-A",action,requestId:"request-0123456789abcdef",reason:"Synthetic uncertain mutation."};
    const events={snapshots:[],errors:[],messages:[],clears:[],busy:[],refreshing:[]};let marker=null;
    const ctx={token:"synthetic",selectedWorkOrderRef:{current:"wo-A"},workRecoveryRequestRef:{current:0},portalRequestRef:{current:7},photoDraftEpochRef:{current:0},
      base44:{functions:{invoke:async(_name,payload)=>{assert.equal(payload.work_order_id,"wo-A");assert.equal(payload.request_id,initial.requestId);return response.promise;}}},
      setWorkRecovery:value=>{marker=typeof value==="function"?value(marker):value;},setBusy:value=>events.busy.push(value),setRefreshing:value=>events.refreshing.push(value),
      setActionError:value=>events.errors.push(value),setSavedMessage:value=>events.messages.push(value),applyWorkOrderSnapshot:value=>events.snapshots.push(value),
      clearSavedProgressDraft:()=>{},clearStoredWorkRecovery:async()=>events.clears.push(true)};
    const pending=recover(ctx)(initial);
    ctx.selectedWorkOrderRef.current="wo-B";ctx.portalRequestRef.current++;
    const portalRequest=ctx.portalRequestRef.current;
    events.busy.length=0;events.refreshing.length=0;
    if(outcome==="applied") response.resolve({data:{status:"applied",work_order:{id:"wo-A",status:"in_progress"}}});
    else response.resolve({data:{error:"Access denied"}});
    assert.equal(await pending,outcome==="applied");
    assert.equal(ctx.portalRequestRef.current,portalRequest);
    assert.deepEqual(events.snapshots,[]);
    assert.deepEqual(events.errors,[]);assert.deepEqual(events.messages,[]);
    assert.deepEqual(events.busy,[]);assert.deepEqual(events.refreshing,[]);
    if(outcome==="applied"){assert.equal(events.clears.length,1);assert.equal(marker,null);}
    else {assert.equal(events.clears.length,0);assert.equal(marker.workOrderId,"wo-A");assert.equal(marker.requestId,initial.requestId);}
  });
}
