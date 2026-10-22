// Deterministic real-handler tests for overlapping Fleet Maintenance page loads
// and for the meter-rule post-save status refresh semantics.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const pageSource=readFileSync(path.join(process.cwd(),"src/pages/FleetMaintenance.jsx"),"utf8");
const loadBegin=pageSource.indexOf("  const loadData = useCallback(async () => {");
const callbackBegin=pageSource.indexOf("async () => {",loadBegin);
const loadEnd=pageSource.indexOf("\n  }, []);",callbackBegin);
assert.ok(loadBegin>=0&&callbackBegin>loadBegin&&loadEnd>callbackBegin);
const callback=pageSource.slice(callbackBegin,loadEnd+4);
const bindLoad=new Function("ctx",`with(ctx){return (${callback});}`);

const workspaceSource=readFileSync(path.join(process.cwd(),"src/components/fleet/FleetMaintenanceWorkspace.jsx"),"utf8");
const refreshBegin=workspaceSource.indexOf("const refreshMeterStatus = async () => {");
let refreshSource="";
if(refreshBegin>=0){
  const refreshEnd=workspaceSource.indexOf("\n  };",refreshBegin);
  assert.ok(refreshEnd>refreshBegin);
  refreshSource=workspaceSource.slice(workspaceSource.indexOf("async () => {",refreshBegin),refreshEnd+4);
}else{
  const inlineBegin=workspaceSource.indexOf("onSaved={async () => {");
  assert.ok(inlineBegin>=0,"Fleet Maintenance workspace must expose a meter status refresh handler");
  const inlineEnd=workspaceSource.indexOf("}} />",inlineBegin);
  assert.ok(inlineEnd>inlineBegin);
  refreshSource=workspaceSource.slice(inlineBegin+"onSaved={".length,inlineEnd+1);
}
const bindRefresh=new Function("ctx",`with(ctx){return (${refreshSource});}`);

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

function harness(){
  const calls=[],loading=[],errors=[],state={tasks:[],equipment:[],workOrders:[],parts:[],fluids:[],currentUser:null};
  const gate=label=>{const g=defer(),group=Math.floor(calls.length/7);calls.push({group,label,gate:g});return g.promise;};
  const ctx={
    loadSequenceRef:{current:0},
    base44:{
      auth:{me:async()=>({id:"synthetic-admin",email:"admin@example.test",role:"admin"})},
      entities:{FleetMaintenanceTask:{},FleetEquipment:{},FleetMaintenanceWorkOrder:{},FleetPart:{},FleetFluid:{}},
    },
    listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
    filterAllFleetRows:(_entity,_query,_sort,options)=>gate(options.label),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setTasks:value=>{state.tasks=value;},
    setEquipment:value=>{state.equipment=value;},
    setActiveWorkOrders:value=>{state.workOrders=value;},
    setParts:value=>{state.parts=value;},
    setFluids:value=>{state.fluids=value;},
    setCurrentUser:value=>{state.currentUser=value;},
  };
  return {load:bindLoad(ctx),calls,loading,errors,state};
}

async function waitForCalls(h,count){
  for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.calls.length,count,`Expected ${count} Fleet maintenance list requests`);
}
function resolveGroup(h,group,version){
  const payload={
    "Fleet maintenance schedules":[{id:"task-1",title:`${version} schedule`,status:version==="new"?"completed":"pending"}],
    "Fleet equipment":[{id:`equipment-${version}`,name:`${version} equipment`}],
    "Open Fleet maintenance work orders":[{id:`${version}-open-wo`,status:"open"}],
    "Assigned Fleet maintenance work orders":[{id:`${version}-assigned-wo`,status:"assigned"}],
    "In-progress Fleet maintenance work orders":[{id:`${version}-progress-wo`,status:"in_progress"}],
    "Fleet parts":[{id:"part-1",part_name:"Synthetic filter",quantity_on_hand:version==="new"?9:2}],
    "Fleet fluids":[{id:"fluid-1",fluid_name:"Synthetic oil",quantity_on_hand:version==="new"?5:1}],
  };
  for(const call of h.calls.filter(row=>row.group===group))call.gate.resolve(payload[call.label]);
}
function rejectGroup(h,group,message){
  for(const call of h.calls.filter(row=>row.group===group))call.gate.reject(new Error(message));
}

test("slower earlier Fleet Maintenance load cannot replace newer schedules, work orders, or inventory rows",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,7);
  const newer=h.load();
  await waitForCalls(h,14);
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.state.tasks[0]?.status,"completed");
  assert.equal(h.state.workOrders.length,3);
  assert.equal(h.state.parts[0]?.quantity_on_hand,9);
  assert.equal(h.loading.at(-1),false);
  resolveGroup(h,0,"old");
  await older;
  assert.equal(h.state.tasks[0]?.status,"completed","The older response must not restore a stale schedule status");
  assert.equal(h.state.equipment[0]?.name,"new equipment");
  assert.equal(h.state.workOrders[0]?.id,"new-open-wo","Stale work-order rows must not replace the refreshed list");
  assert.equal(h.state.parts[0]?.quantity_on_hand,9,"Stale Fleet stock must not replace the refreshed quantity");
  assert.equal(h.state.fluids[0]?.quantity_on_hand,5);
  assert.equal(h.loading.at(-1),false);
});

test("earlier Fleet Maintenance load cannot clear loading while a newer refresh is still pending",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,7);
  const newer=h.load();
  await waitForCalls(h,14);
  resolveGroup(h,0,"old");
  await older;
  assert.equal(h.loading.at(-1),true,"Only the newest active refresh controls the loading indicator");
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.tasks[0]?.status,"completed");
});

test("earlier Fleet Maintenance load failure cannot surface an error over a newer pending refresh",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,7);
  const newer=h.load();
  await waitForCalls(h,14);
  rejectGroup(h,0,"old load failed");
  await older;
  assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
  assert.equal(h.loading.at(-1),true,"A superseded load must not clear the newer loading state");
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.tasks[0]?.status,"completed");
});

function meterHarness(invokeImpl){
  const state={rows:[{rule:{id:"old-rule"}}]},errors=[];
  const ctx={
    base44:{functions:{invoke:invokeImpl}},
    equipment:{id:"equipment-1"},
    setMeterRows:value=>{state.rows=value;},
    setError:value=>errors.push(value),
  };
  return {refresh:bindRefresh(ctx),state,errors};
}

test("meter rule post-save refresh failure resolves so the successful save is not reported as failed",async()=>{
  const h=meterHarness(async()=>({data:{error:"status_unavailable"}}));
  await h.refresh();
  assert.equal(h.state.rows[0]?.rule?.id,"old-rule","Failed refresh must leave existing meter rows in place");
  assert.equal(h.errors.at(-1),"status_unavailable","The workspace must surface the refresh failure");
});

test("meter rule post-save refresh success replaces meter rows",async()=>{
  const h=meterHarness(async()=>({data:{rows:[{rule:{id:"new-rule"}}]}}));
  await h.refresh();
  assert.equal(h.state.rows[0]?.rule?.id,"new-rule");
  assert.equal(h.errors.length,0);
});
