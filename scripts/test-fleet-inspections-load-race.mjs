// Deterministic real-handler tests for overlapping Fleet Inspections page loads
// and for dialog error surfacing on inspection start / template save failures.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const pageSource=readFileSync(path.join(process.cwd(),"src/pages/FleetInspections.jsx"),"utf8");

const extract=(marker,asyncNeedle,endNeedle)=>{
  const begin=pageSource.indexOf(marker);
  const callbackBegin=pageSource.indexOf(asyncNeedle,begin);
  const end=pageSource.indexOf(endNeedle,callbackBegin);
  assert.ok(begin>=0&&callbackBegin>begin&&end>callbackBegin,`Missing source for ${marker}`);
  return pageSource.slice(callbackBegin,end+4);
};
const bind=source=>new Function("ctx",`with(ctx){return (${source});}`);

const bindLoad=bind(extract("  const load = useCallback(","async () => {","\n  }, []);"));
const bindStart=bind(extract("  const startInspection = ","async () => {","\n  };"));
const bindTemplate=bind(extract("  const saveTemplate = ","async (","\n  };"));

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

function harness(){
  const calls=[],loading=[],errors=[],state={templates:[],inspections:[],equipment:[],user:null};
  const gate=label=>{const g=defer(),group=Math.floor(calls.length/3);calls.push({group,label,gate:g});return g.promise;};
  const ctx={
    loadSequenceRef:{current:0},
    base44:{
      auth:{me:async()=>({id:"synthetic-admin",email:"admin@example.test",role:"admin"})},
      entities:{FleetInspectionTemplate:{},FleetInspection:{},FleetEquipment:{}},
    },
    listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setTemplates:value=>{state.templates=value;},
    setInspections:value=>{state.inspections=value;},
    setEquipment:value=>{state.equipment=value;},
    setUser:value=>{state.user=value;},
  };
  return {load:bindLoad(ctx),calls,loading,errors,state};
}

async function waitForCalls(h,count){
  for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.calls.length,count,`Expected ${count} Fleet inspection list requests`);
}
function resolveGroup(h,group,version){
  const payload={
    "Fleet inspection templates":[{id:"template-1",name:`${version} template`}],
    "Fleet inspections":[{id:"inspection-1",status:version==="new"?"completed":"draft",template_name:`${version} inspection`}],
    "Fleet equipment":[{id:`equipment-${version}`,name:`${version} equipment`}],
  };
  for(const call of h.calls.filter(row=>row.group===group))call.gate.resolve(payload[call.label]);
}
function rejectLabel(h,group,label,message){
  for(const call of h.calls.filter(row=>row.group===group&&row.label===label))call.gate.reject(new Error(message));
}

test("slower earlier Fleet Inspections load cannot replace newer template, inspection, or equipment rows",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,3);
  const newer=h.load();
  await waitForCalls(h,6);
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.state.inspections[0]?.status,"completed");
  assert.equal(h.loading.at(-1),false);
  resolveGroup(h,0,"old");
  await older;
  assert.equal(h.state.inspections[0]?.status,"completed","The older response must not restore a stale inspection status");
  assert.equal(h.state.templates[0]?.name,"new template");
  assert.equal(h.state.equipment[0]?.name,"new equipment");
  assert.equal(h.loading.at(-1),false);
});

test("earlier Fleet Inspections load cannot clear loading while a newer refresh is still pending",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,3);
  const newer=h.load();
  await waitForCalls(h,6);
  resolveGroup(h,0,"old");
  await older;
  assert.equal(h.loading.at(-1),true,"Only the newest active refresh controls the loading indicator");
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.inspections[0]?.status,"completed");
});

test("earlier Fleet Inspections load failure cannot surface an error over a newer pending refresh",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,3);
  const newer=h.load();
  await waitForCalls(h,6);
  rejectLabel(h,0,"Fleet equipment","equipment list failed");
  await older;
  assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
  assert.equal(h.loading.at(-1),true,"A superseded load must not clear the newer loading state");
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.inspections[0]?.status,"completed");
});

function startHarness(invokeImpl){
  const errors=[],runner=[],closed=[],loads=[];
  const ctx={
    startDialog:{equipment_id:"equipment-1",template_id:"template-1",creation_key:"key-1"},
    base44:{functions:{invoke:invokeImpl}},
    templates:[{id:"template-1",name:"Synthetic template"}],
    setError:value=>errors.push(value),
    setRunner:value=>runner.push(value),
    closeStartDialog:()=>closed.push(true),
    load:async()=>{loads.push(true);},
  };
  return {start:bindStart(ctx),errors,runner,closed,loads};
}

test("inspection start failure rejects so the start dialog can display it",async()=>{
  const h=startHarness(async()=>({data:{error:"start_denied"}}));
  await assert.rejects(h.start(),/start_denied/,"A failed start must reject so the open dialog surfaces it");
  assert.equal(h.runner.length,0,"Failed start must not open the runner");
  assert.equal(h.closed.length,0,"Failed start must not close the dialog");
});

test("inspection start success opens the runner and refreshes",async()=>{
  const h=startHarness(async()=>({data:{inspection:{id:"inspection-1"},template:{id:"template-1"}}}));
  await h.start();
  assert.equal(h.runner[0]?.inspection?.id,"inspection-1");
  assert.equal(h.closed.length,1);
  assert.equal(h.loads.length,1);
});

function templateHarness(invokeImpl){
  const errors=[],dialogs=[],loads=[];
  const ctx={
    base44:{functions:{invoke:invokeImpl}},
    setError:value=>errors.push(value),
    setTemplateDialog:value=>dialogs.push(value),
    load:async()=>{loads.push(true);},
  };
  return {save:bindTemplate(ctx),errors,dialogs,loads};
}

test("template save failure rejects so the template dialog can display it",async()=>{
  const h=templateHarness(async()=>({data:{error:"template_denied"}}));
  await assert.rejects(h.save({template:{name:"Synthetic"},existing:null,creationKey:"key-1"}),/template_denied/,"A failed save must reject so the open dialog surfaces it");
  assert.equal(h.dialogs.length,0,"Failed save must not close the dialog");
});

test("template save success closes the dialog and refreshes",async()=>{
  const h=templateHarness(async()=>({data:{template:{id:"template-2"}}}));
  await h.save({template:{name:"Synthetic"},existing:null,creationKey:"key-1"});
  assert.equal(h.dialogs[0],null);
  assert.equal(h.loads.length,1);
});
