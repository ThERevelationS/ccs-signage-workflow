// Deterministic real-handler tests for overlapping FleetHistory loads and log
// pagination appends, plus the standard FleetEquipment load race.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const LOG_PAGE_SIZE=200;

// ---------- FleetHistory ----------
const historySource=readFileSync(path.join(process.cwd(),"src/pages/FleetHistory.jsx"),"utf8");
const extractHistory=(marker,endNeedle)=>{
  const begin=historySource.indexOf(marker);
  const callbackBegin=historySource.indexOf("async () => {",begin);
  const end=historySource.indexOf(endNeedle,callbackBegin);
  assert.ok(begin>=0&&callbackBegin>begin&&end>callbackBegin,`Missing source for ${marker}`);
  return historySource.slice(callbackBegin,end+4);
};
const bindHistoryLoad=new Function("ctx",`with(ctx){return (${extractHistory("  const load = useCallback(async () => {","\n  }, []);")});}`);
const bindLoadMore=new Function("ctx",`with(ctx){return (${extractHistory("  const loadMoreLogs = async () => {","\n  };")});}`);

function historyHarness(){
  const calls=[],loading=[],loadingMore=[],errors=[],state={reports:[],logs:[],logHasMore:false,user:null};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    LOG_PAGE_SIZE,
    loadSequenceRef:{current:0},
    moreSequenceRef:{current:0},
    base44:{
      auth:{me:async()=>({id:"admin-1",role:"admin",email:"admin@example.test"})},
      entities:{FleetSystemReport:{},FleetSystemLog:{list:(_sort,_limit,skip)=>gate(`logs:${skip}`)}},
    },
    listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
    setLoading:value=>loading.push(value),
    setLoadingMore:value=>loadingMore.push(value),
    setError:value=>errors.push(value),
    setUser:value=>{state.user=value;},
    setReports:value=>{state.reports=value;},
    setLogs:value=>{state.logs=typeof value==="function"?value(state.logs):value;},
    setLogHasMore:value=>{state.logHasMore=value;},
  };
  Object.defineProperty(ctx,"logs",{get:()=>state.logs});
  return {load:bindHistoryLoad(ctx),loadMore:bindLoadMore(ctx),calls,loading,loadingMore,errors,state};
}
const resolveCall=(h,index,payload)=>{
  const call=h.calls[index];
  assert.ok(call&&!call.settled,`Expected an open FleetHistory call at index ${index}`);
  call.settled=true;
  call.gate.resolve(payload[call.label]);
};
const historyPayload=version=>({
  "Fleet system reports":[{id:`report-${version}`}],
  "logs:0":[{id:`log-${version}-0`},{id:`log-${version}-1`}],
});
const rejectCall=(h,index,message)=>{
  const call=h.calls[index];
  assert.ok(call&&!call.settled,`Expected an open FleetHistory call at index ${index}`);
  call.settled=true;
  call.gate.reject(new Error(message));
};

test("FleetHistory: slower earlier load cannot replace newer report or log rows",async()=>{
  const h=historyHarness();
  const older=h.load();
  await tick();
  assert.equal(h.calls.length,2);
  const newer=h.load();
  await tick();
  assert.equal(h.calls.length,4);
  resolveCall(h,2,historyPayload("new")["Fleet system reports"]);
  resolveCall(h,3,historyPayload("new")["logs:0"]);
  await newer;
  assert.equal(h.state.logs[0]?.id,"log-new-0");
  assert.equal(h.loading.at(-1),false);
  resolveCall(h,0,historyPayload("old")["Fleet system reports"]);
  resolveCall(h,1,historyPayload("old")["logs:0"]);
  await older;
  assert.equal(h.state.logs[0]?.id,"log-new-0","Stale logs must not replace the refreshed page");
  assert.equal(h.state.reports[0]?.id,"report-new");
  assert.equal(h.loading.at(-1),false);
});

test("FleetHistory: earlier load cannot clear loading while a newer refresh is pending",async()=>{
  const h=historyHarness();
  const older=h.load();
  await tick();
  const newer=h.load();
  await tick();
  resolveCall(h,0,historyPayload("old")["Fleet system reports"]);
  resolveCall(h,1,historyPayload("old")["logs:0"]);
  await older;
  assert.equal(h.loading.at(-1),true,"Only the newest active refresh controls the loading indicator");
  resolveCall(h,2,historyPayload("new")["Fleet system reports"]);
  resolveCall(h,3,historyPayload("new")["logs:0"]);
  await newer;
  assert.equal(h.loading.at(-1),false);
});

test("FleetHistory: earlier load failure cannot surface an error over a newer pending refresh",async()=>{
  const h=historyHarness();
  const older=h.load();
  await tick();
  const newer=h.load();
  await tick();
  rejectCall(h,0,"reports failed");
  resolveCall(h,1,historyPayload("old")["logs:0"]);
  await older;
  assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
  assert.equal(h.loading.at(-1),true);
  resolveCall(h,2,historyPayload("new")["Fleet system reports"]);
  resolveCall(h,3,historyPayload("new")["logs:0"]);
  await newer;
  assert.equal(h.loading.at(-1),false);
});

test("FleetHistory: a full reload drops a pending load-more append",async()=>{
  const h=historyHarness();
  h.state.logs=[{id:"log-seed"}];
  const more=h.loadMore();
  await tick();
  assert.equal(h.calls.length,1,"loadMore must request the next page");
  const refresh=h.load();
  await tick();
  assert.equal(h.calls.length,3);
  resolveCall(h,1,historyPayload("new")["Fleet system reports"]);
  resolveCall(h,2,historyPayload("new")["logs:0"]);
  await refresh;
  assert.deepEqual(h.state.logs.map(row=>row.id),["log-new-0","log-new-1"]);
  resolveCall(h,0,[{id:"log-stale-page"}]);
  await more;
  assert.deepEqual(h.state.logs.map(row=>row.id),["log-new-0","log-new-1"],"The stale page must not append onto the refreshed list");
  assert.equal(h.loadingMore.at(-1),false,"The reload must clear the pending load-more indicator");
});

test("FleetHistory: overlapping load-more calls cannot append the same page twice",async()=>{
  const h=historyHarness();
  h.state.logs=[{id:"log-seed"}];
  const first=h.loadMore();
  const second=h.loadMore();
  await tick();
  assert.equal(h.calls.length,2);
  resolveCall(h,1,[{id:"log-page-2a"},{id:"log-page-2b"}]);
  await second;
  assert.deepEqual(h.state.logs.map(row=>row.id),["log-seed","log-page-2a","log-page-2b"]);
  resolveCall(h,0,[{id:"log-page-2a"},{id:"log-page-2b"}]);
  await first;
  assert.deepEqual(h.state.logs.map(row=>row.id),["log-seed","log-page-2a","log-page-2b"],"The superseded page fetch must not duplicate rows");
});

test("FleetHistory: a superseded load-more failure cannot surface an error",async()=>{
  const h=historyHarness();
  h.state.logs=[{id:"log-seed"}];
  const first=h.loadMore();
  const second=h.loadMore();
  await tick();
  rejectCall(h,0,"page fetch failed");
  await first;
  assert.equal(h.errors.length,0,"The superseded page fetch must not project its failure");
  resolveCall(h,1,[{id:"log-page-2a"}]);
  await second;
  assert.deepEqual(h.state.logs.map(row=>row.id),["log-seed","log-page-2a"]);
});

// ---------- FleetEquipment ----------
const equipmentSource=readFileSync(path.join(process.cwd(),"src/pages/FleetEquipment.jsx"),"utf8");
const eqBegin=equipmentSource.indexOf("  const loadData = useCallback(async () => {");
const eqCallbackBegin=equipmentSource.indexOf("async () => {",eqBegin);
const eqEnd=equipmentSource.indexOf("\n  }, []);",eqCallbackBegin);
assert.ok(eqBegin>=0&&eqCallbackBegin>eqBegin&&eqEnd>eqCallbackBegin);
const bindEquipmentLoad=new Function("ctx",`with(ctx){return (${equipmentSource.slice(eqCallbackBegin,eqEnd+4)});}`);

function equipmentHarness(){
  const calls=[],loading=[],errors=[],state={equipment:[],workOrders:[],tasks:[],currentUser:null,bouncie:[]};
  const gate=label=>{const g=defer(),group=Math.floor(calls.length/4);calls.push({group,label,gate:g});return g.promise;};
  const ctx={
    loadSequenceRef:{current:0},
    base44:{
      auth:{me:async()=>({id:"admin-1",role:"admin"})},
      entities:{FleetEquipment:{},FleetMaintenanceWorkOrder:{},FleetMaintenanceTask:{}},
      functions:{invoke:name=>gate(name)},
    },
    listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setEquipment:value=>{state.equipment=value;},
    setWorkOrders:value=>{state.workOrders=value;},
    setTasks:value=>{state.tasks=value;},
    setCurrentUser:value=>{state.currentUser=value;},
    setBouncieVehicles:value=>{state.bouncie=value;},
  };
  return {load:bindEquipmentLoad(ctx),calls,loading,errors,state};
}
const waitForCalls=async(h,count)=>{
  for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.calls.length,count,`Expected ${count} FleetEquipment list requests`);
};
const equipmentPayload=version=>({
  "Fleet equipment":[{id:`equipment-${version}`,status:version==="new"?"operational":"retired"}],
  "Fleet work-order history":[{id:`wo-${version}`}],
  "Fleet maintenance schedules":[{id:`task-${version}`}],
  bouncieApi:{data:{data:[{imei:version==="new"?"imei-new":"imei-old"}]}},
});
const resolveEquipmentGroup=(h,group,version)=>{
  const payload=equipmentPayload(version);
  for(const call of h.calls.filter(row=>row.group===group))call.gate.resolve(payload[call.label]);
};
const assertEquipmentNew=state=>{
  assert.equal(state.equipment[0]?.status,"operational","Stale load must not restore a retired equipment status");
  assert.equal(state.workOrders[0]?.id,"wo-new");
  assert.equal(state.bouncie[0]?.imei,"imei-new");
};

test("FleetEquipment: slower earlier load cannot replace newer equipment, work-order, or tracking rows",async()=>{
  const h=equipmentHarness();
  const older=h.load();
  await waitForCalls(h,4);
  const newer=h.load();
  await waitForCalls(h,8);
  resolveEquipmentGroup(h,1,"new");
  await newer;
  assertEquipmentNew(h.state);
  assert.equal(h.loading.at(-1),false);
  resolveEquipmentGroup(h,0,"old");
  await older;
  assertEquipmentNew(h.state);
  assert.equal(h.loading.at(-1),false);
});

test("FleetEquipment: earlier load cannot clear loading while a newer refresh is pending",async()=>{
  const h=equipmentHarness();
  const older=h.load();
  await waitForCalls(h,4);
  const newer=h.load();
  await waitForCalls(h,8);
  resolveEquipmentGroup(h,0,"old");
  await older;
  assert.equal(h.loading.at(-1),true);
  resolveEquipmentGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assertEquipmentNew(h.state);
});

test("FleetEquipment: earlier load failure cannot surface an error over a newer pending refresh",async()=>{
  const h=equipmentHarness();
  const older=h.load();
  await waitForCalls(h,4);
  const newer=h.load();
  await waitForCalls(h,8);
  for(const call of h.calls.filter(row=>row.group===0&&row.label==="Fleet equipment"))call.gate.reject(new Error("equipment list failed"));
  for(const call of h.calls.filter(row=>row.group===0&&row.label!=="Fleet equipment"))call.gate.resolve(equipmentPayload("old")[call.label]);
  await older;
  assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
  assert.equal(h.loading.at(-1),true);
  resolveEquipmentGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assertEquipmentNew(h.state);
});
