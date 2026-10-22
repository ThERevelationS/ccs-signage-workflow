// Deterministic real-handler tests for overlapping FleetSettings server-health
// refreshes (runServerCheck) and integrity audits (runIntegrityAudit).
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

const source=readFileSync(path.join(process.cwd(),"src/pages/FleetSettings.jsx"),"utf8");
const extract=(marker)=>{
  const begin=source.indexOf(marker);
  const callbackBegin=source.indexOf("async () => {",begin);
  const end=source.indexOf("\n  };",callbackBegin);
  assert.ok(begin>=0&&callbackBegin>begin&&end>callbackBegin,`Missing source for ${marker}`);
  return source.slice(callbackBegin,end+4);
};
const bindCheck=new Function("ctx",`with(ctx){return (${extract("  const runServerCheck = async () => {")});}`);
const bindAudit=new Function("ctx",`with(ctx){return (${extract("  const runIntegrityAudit = async () => {")});}`);

function harness(){
  const calls=[],checking=[],integrityBusy=[],state={serverStatus:null,settings:null,connection:null,automationLogs:[],queueRows:[],receiptRows:[],mechanicLinks:[],mechanicEquipment:[],integrity:null};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    AUTOMATION_SOURCES:["fleetScheduledMaintenanceGeneration","fleetScheduledReminders","fleetNotificationWorker","fleetReminderFallback","bouncieSyncNotifications"],
    checkSequenceRef:{current:0},
    integritySequenceRef:{current:0},
    base44:{
      entities:{FleetSettings:{list:()=>gate("FleetSettings.list")},FleetEquipment:{}},
      functions:{invoke:(name,args)=>gate(`${name}:${args?.action||"run"}`)},
    },
    loadAutomationHealthData:()=>gate("health"),
    listAllFleetRows:()=>gate("equipment"),
    setChecking:value=>checking.push(value),
    setIntegrityBusy:value=>integrityBusy.push(value),
    setServerStatus:value=>{state.serverStatus=value;},
    setSettings:value=>{state.settings=value;},
    setConnection:value=>{state.connection=value;},
    setAutomationLogs:value=>{state.automationLogs=value;},
    setQueueRows:value=>{state.queueRows=value;},
    setReceiptRows:value=>{state.receiptRows=value;},
    setMechanicLinks:value=>{state.mechanicLinks=value;},
    setMechanicEquipment:value=>{state.mechanicEquipment=value;},
    setIntegrity:value=>{state.integrity=value;},
  };
  return {runServerCheck:bindCheck(ctx),runIntegrityAudit:bindAudit(ctx),calls,checking,integrityBusy,state};
}
const waitForCalls=async(h,count)=>{
  for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.calls.length,count,`Expected ${count} gated calls`);
};
const checkPayload=version=>({
  "fleetCutoverControl:status":{data:{cutover:version}},
  "FleetSettings.list":[{id:`settings-${version}`}],
  "bouncieStatus:run":{data:{connected:version==="new"}},
  health:{logs:[],notifications:[{id:`queue-${version}`}],receipts:[{id:`receipt-${version}`}]},
  "fleetMechanicPortal:admin_list_links":{data:{links:[{id:`link-${version}`}]}},
  equipment:[{id:`equip-${version}`}],
  "fleetIntegrityAudit:run":{data:{cutover:version}},
});
const resolveCheckCall=(h,index,version)=>{
  const call=h.calls[index];
  assert.ok(call&&!call.settled,`Expected open call ${index}`);
  call.settled=true;
  call.gate.resolve(checkPayload(version)[call.label]);
};

test("FleetSettings: slower earlier server check cannot replace newer health state",async()=>{
  const h=harness();
  const older=h.runServerCheck();
  await waitForCalls(h,1);
  resolveCheckCall(h,0,"old");
  await waitForCalls(h,6);
  const newer=h.runServerCheck();
  await waitForCalls(h,7);
  resolveCheckCall(h,6,"new");
  await waitForCalls(h,12);
  for(let i=7;i<12;i++)resolveCheckCall(h,i,"new");
  await newer;
  assert.equal(h.state.serverStatus?.cutover,"new");
  assert.equal(h.state.queueRows[0]?.id,"queue-new");
  for(let i=1;i<6;i++)resolveCheckCall(h,i,"old");
  await older;
  assert.equal(h.state.serverStatus?.cutover,"new","Stale check must not replace newer cutover status");
  assert.equal(h.state.queueRows[0]?.id,"queue-new");
  assert.equal(h.state.mechanicLinks[0]?.id,"link-new");
  assert.equal(h.checking.at(-1),false);
});

test("FleetSettings: earlier server check cannot clear checking while a newer check is pending",async()=>{
  const h=harness();
  const older=h.runServerCheck();
  await waitForCalls(h,1);
  resolveCheckCall(h,0,"old");
  await waitForCalls(h,6);
  const newer=h.runServerCheck();
  await waitForCalls(h,7);
  for(let i=1;i<6;i++)resolveCheckCall(h,i,"old");
  await older;
  assert.equal(h.checking.at(-1),true,"Only the newest active check controls the indicator");
  resolveCheckCall(h,6,"new");
  await waitForCalls(h,12);
  for(let i=7;i<12;i++)resolveCheckCall(h,i,"new");
  await newer;
  assert.equal(h.checking.at(-1),false);
});

test("FleetSettings: a superseded check still rejects to its own caller without touching newer state",async()=>{
  const h=harness();
  const older=h.runServerCheck();
  await waitForCalls(h,1);
  const newer=h.runServerCheck();
  await waitForCalls(h,2);
  const call=h.calls[0];
  call.settled=true;
  call.gate.reject(new Error("status check failed"));
  await assert.rejects(older,/status check failed/,"Callers must still observe their own check failure");
  assert.equal(h.state.serverStatus,null,"The failed superseded check must not project state");
  resolveCheckCall(h,1,"new");
  await waitForCalls(h,7);
  for(let i=2;i<7;i++)resolveCheckCall(h,i,"new");
  await newer;
  assert.equal(h.state.serverStatus?.cutover,"new");
  assert.equal(h.checking.at(-1),false);
});

test("FleetSettings: slower earlier integrity audit cannot replace the newer audit",async()=>{
  const h=harness();
  const older=h.runIntegrityAudit();
  const newer=h.runIntegrityAudit();
  await waitForCalls(h,2);
  resolveCheckCall(h,1,"new");
  await newer;
  assert.equal(h.state.integrity?.cutover,"new");
  resolveCheckCall(h,0,"old");
  await older;
  assert.equal(h.state.integrity?.cutover,"new","Stale audit must not replace the newer result");
  assert.equal(h.integrityBusy.at(-1),false);
});

test("FleetSettings: earlier integrity audit cannot clear busy while a newer audit is pending",async()=>{
  const h=harness();
  const older=h.runIntegrityAudit();
  const newer=h.runIntegrityAudit();
  await waitForCalls(h,2);
  resolveCheckCall(h,0,"old");
  await older;
  assert.equal(h.integrityBusy.at(-1),true);
  resolveCheckCall(h,1,"new");
  await newer;
  assert.equal(h.integrityBusy.at(-1),false);
});
