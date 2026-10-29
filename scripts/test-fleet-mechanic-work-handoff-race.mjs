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
const bindHandoff=new Function("ctx",`with(ctx){${source.slice(handoffBegin,startBegin)} return handleSupersededWorkAcknowledgement; }`);
const bindSave=new Function("ctx",`with(ctx){${source.slice(saveBegin,saveEnd)} return saveProgress; }`);
const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

function harness(action){
  const gate=defer(),calls=[];
  let storedMarker=null;
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
    invokeFleet:(name,args)=>ctx.base44.functions.invoke(name,args),
    newMechanicRequestId:()=>recovery.requestId,
    storeWorkRecovery:async(_token,value)=>{storedMarker=value;},
    clearStoredWorkRecovery:async(_token,value)=>{
      if(storedMarker?.workOrderId===value.workOrderId&&storedMarker?.requestId===value.requestId)storedMarker=null;
    },
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
  ctx.handleSupersededWorkAcknowledgement=bindHandoff(ctx);
  const run=action==="start"?bindStart(ctx):bindSave(ctx);
  return {ctx,run,gate,calls,get storedMarker(){return storedMarker;},errors,messages,busy,snapshots,draftClears,scopeNotices,recovery};
}

for(const action of ["start","save"]){
  test(`${action}: late success after scope loss and opening another job preserves A receipt lock`,async()=>{
    const h=harness(action);
    const pending=h.run();
    for(let attempt=0;h.calls.length<1&&attempt<100;attempt++)await Promise.resolve();
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].action,action);
    assert.equal(h.calls[0].work_order_id,"wo-A");
    assert.equal(h.storedMarker?.workOrderId,"wo-A","Durable A marker must be written before dispatch");
    h.ctx.portalAppliedEpochRef.current+=1; // A disappeared in a newer authorized portal payload.
    h.ctx.selectedWorkOrderRef.current="wo-B";
    h.ctx.selected={id:"wo-B",updated_date:"rev-B"};
    h.gate.resolve({data:{success:true,work_order:{id:"wo-A",status:action==="start"?"in_progress":"open",updated_date:"rev-A2"}}});
    await pending;
    assert.equal(h.ctx.workRecovery?.workOrderId,"wo-A","A's uncertain marker remains visible after the job switch");
    assert.equal(h.ctx.workRecovery?.requestId,h.recovery.requestId);
    assert.equal(h.storedMarker?.workOrderId,"wo-A","Late acknowledgment must not silently discard A's durable marker");
    assert.equal(h.errors.at(-1),"An earlier mechanic request is still being verified. Check its current server state before starting or saving another job.");
    assert.deepEqual(h.snapshots,[],"A's response cannot project into B");
    assert.deepEqual(h.draftClears,[],"A's response cannot clear B's draft");
    const nextRequest=h.run();
    await nextRequest;
    assert.equal(h.calls.length,1,"B Start/Save must stay blocked until A's receipt is checked");
    assert.equal(h.storedMarker?.workOrderId,"wo-A","A's single durable marker must not be overwritten by B");
    assert.match(h.errors.at(-1),/Check the current server state before (trying another work-order update|saving progress again)/);
    assert.equal(h.busy.at(-1),"");
  });
}
