// Deterministic extracted live Start Work / Save Progress handlers with deferred synthetic transport.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const source=readFileSync(path.join(process.cwd(),"src/pages/FleetMechanic.jsx"),"utf8");
const handoffBegin=source.indexOf("  const handleSupersededWorkAcknowledgement = recovery => {");
const startBegin=source.indexOf("  const startJob = async () => {",handoffBegin);
const handoffEnd=source.indexOf("  const refreshEstimateState =",startBegin);
const saveBegin=source.indexOf("  const saveProgress = async () => {",handoffEnd);
const saveEnd=source.indexOf("  if (loading) return",saveBegin);
assert.ok(handoffBegin>=0&&startBegin>handoffBegin&&handoffEnd>startBegin&&saveBegin>handoffEnd&&saveEnd>saveBegin);
const bindStart=new Function("ctx",`with(ctx){${source.slice(handoffBegin,handoffEnd)} return startJob; }`);
const bindSave=new Function("ctx",`with(ctx){${source.slice(saveBegin,saveEnd)} return saveProgress; }`);
const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

function harness(action){
  const gate=defer(),calls=[],markers=new Map();
  const errors=[],messages=[],busy=[],snapshots=[],draftClears=[],scopeNotices=[];
  const recovery={workOrderId:"wo-A",action,requestId:"request-A-abcdefghijklmnop",reason:`${action} request could not be confirmed.`};
  const ctx={
    selected:{id:"wo-A",updated_date:"rev-A"},
    selectedWorkOrderRef:{current:"wo-A"},
    portalAppliedEpochRef:{current:4},
    token:"synthetic-token",
    workRecovery:null,
    workRecoveryRequestRef:{current:0},
    photoDraftEpochRef:{current:0},
    form:{actual_hours:"2",corrective_action:"Synthetic repair",mechanic_note:"Synthetic note"},
    photos:[],
    base44:{functions:{invoke:async(_name,payload)=>{calls.push(payload);return gate.promise;}}},
    newMechanicRequestId:()=>recovery.requestId,
    storeWorkRecovery:async(_token,value)=>{markers.set(value.workOrderId,value);},
    clearStoredWorkRecovery:async(_token,value)=>{markers.delete(value.workOrderId);},
    setWorkRecovery:value=>{ctx.workRecovery=typeof value==="function"?value(ctx.workRecovery):value;},
    setBusy:value=>busy.push(value),
    setActionError:value=>errors.push(value),
    setSavedMessage:value=>messages.push(value),
    setScopeNotice:value=>scopeNotices.push(value),
    applyWorkOrderSnapshot:value=>snapshots.push(value),
    clearSavedProgressDraft:value=>draftClears.push(value),
    setForm:()=>{},
    setPhotos:()=>{},
    notifyRecoveryOnCurrentView:message=>{
      if(ctx.selectedWorkOrderRef.current){messages.push("");errors.push(message);}
      else scopeNotices.push(message);
    },
    recoverWorkMutation:async value=>{ctx.recoveryStarted=value;},
  };
  const run=action==="start"?bindStart(ctx):bindSave(ctx);
  return {ctx,run,gate,calls,markers,errors,messages,busy,snapshots,draftClears,scopeNotices,recovery};
}

for(const action of ["start","save"]){
  test(`${action}: late success after scope loss and opening another job preserves A receipt lock`,async()=>{
    const h=harness(action);
    const pending=h.run();
    for(let attempt=0;h.calls.length<1&&attempt<100;attempt++)await Promise.resolve();
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].action,action);
    assert.equal(h.calls[0].work_order_id,"wo-A");
    assert.equal(h.markers.has("wo-A"),true,"Durable A marker must be written before dispatch");
    h.ctx.portalAppliedEpochRef.current+=1; // A disappeared in a newer authorized portal payload.
    h.ctx.selectedWorkOrderRef.current="wo-B";
    h.ctx.selected={id:"wo-B",updated_date:"rev-B"};
    h.gate.resolve({data:{success:true,work_order:{id:"wo-A",status:action==="start"?"in_progress":"open",updated_date:"rev-A2"}}});
    await pending;
    assert.equal(h.ctx.workRecovery?.workOrderId,"wo-A","A's uncertain marker remains visible after the job switch");
    assert.equal(h.ctx.workRecovery?.requestId,h.recovery.requestId);
    assert.equal(h.markers.has("wo-A"),true,"Late acknowledgment must not silently discard A's durable marker");
    assert.deepEqual(h.snapshots,[],"A's response cannot project into B");
    assert.deepEqual(h.draftClears,[],"A's response cannot clear B's draft");
    assert.equal(h.errors.at(-1),"An earlier mechanic request is still being verified. Check its current server state before starting or saving another job.");
    assert.equal(h.busy.at(-1),"");
  });
}
