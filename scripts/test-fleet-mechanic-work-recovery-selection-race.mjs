// Deterministic mutation-status recovery races with synthetic delayed Base44 responses.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const source=readFileSync(path.join(process.cwd(),"src/pages/FleetMechanic.jsx"),"utf8");
const recoverBegin=source.indexOf("  const recoverWorkMutation = async (recovery, reason = \"\") => {");
const recoverEnd=source.indexOf("  const notifyRecoveryOnCurrentView =",recoverBegin);
assert.ok(recoverBegin>=0&&recoverEnd>recoverBegin);
const bindRecover=new Function("ctx",`with(ctx){${source.slice(recoverBegin,recoverEnd)} return recoverWorkMutation; }`);
const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

function harness({action="start",selected="wo-A"}={}) {
  const gate=defer(),calls=[],snapshots=[],draftClears=[],messages=[],errors=[],scopeNotices=[],busy=[];
  const recovery={workOrderId:"wo-A",action,requestId:"request-A-abcdefghijklmnop",reason:"The mechanic update could not be confirmed."};
  let storedRecovery={...recovery};
  const ctx={
    token:"synthetic-token",
    workRecovery:{...recovery},
    workRecoveryRequestRef:{current:0},
    selectedWorkOrderRef:{current:selected},
    photoDraftEpochRef:{current:12},
    base44:{functions:{invoke:async(_name,payload)=>{calls.push(payload);return gate.promise;}}},
    setWorkRecovery:value=>{ctx.workRecovery=typeof value==="function"?value(ctx.workRecovery):value;},
    setBusy:value=>busy.push(value),
    setRefreshing:value=>{},
    setSavedMessage:value=>messages.push(value),
    setActionError:value=>errors.push(value),
    setError:value=>errors.push(value),
    setScopeNotice:value=>scopeNotices.push(value),
    applyWorkOrderSnapshot:value=>snapshots.push(value),
    clearSavedProgressDraft:value=>draftClears.push(value),
    clearStoredWorkRecovery:async(_token,value)=>{
      if(storedRecovery?.workOrderId===value.workOrderId&&storedRecovery?.action===value.action&&storedRecovery?.requestId===value.requestId)storedRecovery=null;
    },
    load:async()=>{ctx.loads=(ctx.loads||0)+1;},
    notifyRecoveryOnCurrentView:message=>{
      if(ctx.selectedWorkOrderRef.current){messages.push("");errors.push(message);}
      else scopeNotices.push(message);
    },
  };
  return {ctx,recover:bindRecover(ctx),gate,calls,snapshots,draftClears,messages,errors,scopeNotices,busy,recovery,get storedRecovery(){return storedRecovery;}};
}

async function startRecovery(h) {
  const pending=h.recover(h.recovery,h.recovery.reason);
  for(let attempt=0;h.calls.length===0&&attempt<100;attempt++)await Promise.resolve();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].action,"mutation_status");
  assert.equal(h.calls[0].work_order_id,"wo-A");
  assert.equal(h.calls[0].request_id,h.recovery.requestId);
  return pending;
}

for(const action of ["start","save"]) {
  test(`${action}: late applied mutation-status result after scope loss cannot project into another job`,async()=>{
    const h=harness({action});
    const pending=startRecovery(h);
    h.ctx.selectedWorkOrderRef.current=null; // An authorized bootstrap removed A from current scope.
    h.ctx.photoDraftEpochRef.current+=1;
    h.gate.resolve({data:{status:"applied",work_order:{id:"wo-A",status:action==="start"?"in_progress":"open",notes:"A-only data",updated_date:"rev-A2"}}});
    await pending;
    assert.deepEqual(h.snapshots,[],"A's late Fleet snapshot must not be applied after scope loss");
    assert.deepEqual(h.draftClears,[],"A's Save receipt must not clear another editor draft");
    assert.equal(h.storedRecovery,null,"A's positively confirmed receipt may be cleared");
    assert.equal(h.ctx.workRecovery,null);
    assert.equal(h.scopeNotices.length,1,"Only a generic notice may appear after the selected job disappears");
    assert.doesNotMatch(h.scopeNotices[0],/wo-A|A-only data|in_progress/i);
    assert.equal(h.calls.length,1,"Recovery must never replay Start/Save");
  });
}

test("save: confirmed not-applied recovery after switching to B leaves B's editor untouched",async()=>{
  const h=harness({action:"save"});
  const pending=startRecovery(h);
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.ctx.photoDraftEpochRef.current+=1;
  h.gate.resolve({data:{status:"failed",work_order:{id:"wo-A",notes:"A-only data"}}});
  await pending;
  assert.deepEqual(h.snapshots,[]);
  assert.deepEqual(h.draftClears,[]);
  assert.equal(h.storedRecovery,null);
  assert.equal(h.ctx.workRecovery,null);
  assert.match(h.errors.at(-1),/earlier mechanic request is confirmed not applied/i);
  assert.doesNotMatch(h.errors.at(-1),/wo-A|A-only data/i);
  assert.equal(h.calls.length,1);
});

test("start: late applied recovery after switching to B does not apply A's snapshot to B",async()=>{
  const h=harness({action:"start"});
  const pending=startRecovery(h);
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.ctx.photoDraftEpochRef.current+=1;
  h.gate.resolve({data:{status:"applied",work_order:{id:"wo-A",status:"in_progress",notes:"A-only data"}}});
  await pending;
  assert.deepEqual(h.snapshots,[]);
  assert.deepEqual(h.draftClears,[]);
  assert.equal(h.storedRecovery,null);
  assert.equal(h.ctx.workRecovery,null);
  assert.match(h.errors.at(-1),/earlier mechanic request was confirmed/i);
  assert.doesNotMatch(h.errors.at(-1),/wo-A|A-only data|in_progress/i);
  assert.equal(h.calls.length,1,"No Start replay after confirmed recovery");
});

test("start: inconclusive recovery after switching to B preserves A's durable lock",async()=>{
  const h=harness({action:"start"});
  const pending=startRecovery(h);
  h.ctx.selectedWorkOrderRef.current="wo-B";
  h.ctx.photoDraftEpochRef.current+=1;
  h.gate.resolve({data:{status:"pending",work_order:{id:"wo-A",notes:"A-only data"}}});
  await pending;
  assert.deepEqual(h.snapshots,[]);
  assert.deepEqual(h.draftClears,[]);
  assert.equal(h.storedRecovery?.workOrderId,"wo-A");
  assert.equal(h.ctx.workRecovery?.workOrderId,"wo-A");
  assert.match(h.errors.at(-1),/earlier mechanic request is still unverified/i);
  assert.doesNotMatch(h.errors.at(-1),/wo-A|A-only data/i);
  assert.equal(h.calls.length,1,"No replay when status is inconclusive");
});

test("close and reopen A during recovery triggers a fresh scoped bootstrap instead of applying its old editor snapshot",async()=>{
  const h=harness({action:"save"});
  const pending=startRecovery(h);
  h.ctx.selectedWorkOrderRef.current=null;
  h.ctx.photoDraftEpochRef.current+=1;
  h.ctx.selectedWorkOrderRef.current="wo-A";
  h.ctx.photoDraftEpochRef.current+=1;
  h.gate.resolve({data:{status:"applied",work_order:{id:"wo-A",notes:"stale editor snapshot"}}});
  await pending;
  assert.deepEqual(h.snapshots,[],"The previous editor epoch cannot receive the recovered snapshot");
  assert.equal(h.ctx.loads,1,"Reopening the same id requires fresh scoped server state");
  assert.equal(h.storedRecovery,null);
  assert.equal(h.calls.length,1);
});
