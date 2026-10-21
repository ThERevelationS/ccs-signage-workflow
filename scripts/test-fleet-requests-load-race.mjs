// Deterministic real-handler tests for overlapping Fleet Requests list loads.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const source=readFileSync(path.join(process.cwd(),"src/pages/FleetRequests.jsx"),"utf8");
const loadBegin=source.indexOf("  const loadData = useCallback(async () => {");
const callbackBegin=source.indexOf("async () => {",loadBegin);
const loadEnd=source.indexOf("\n  }, []);",callbackBegin);
assert.ok(loadBegin>=0&&callbackBegin>loadBegin&&loadEnd>callbackBegin);
const callback=source.slice(callbackBegin,loadEnd+4);
const bindLoad=new Function("ctx",`with(ctx){return (${callback});}`);

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const labels=["Fleet requests","Fleet equipment","Fleet parts","Fleet fluids"];

function harness(){
  const calls=[],loading=[],state={requests:[],equipment:[],parts:[],fluids:[],currentUser:null,isAdmin:false};
  const entity={};
  const ctx={
    loadSequenceRef:{current:0},
    base44:{
      auth:{me:async()=>({id:"synthetic-admin",email:"admin@example.test",role:"admin"})},
      entities:{FleetPartFluidRequest:entity,FleetEquipment:entity,FleetPart:entity,FleetFluid:entity},
    },
    listAllFleetRows:(_entity,_sort,options)=>{
      const gate=defer(),group=Math.floor(calls.length/4);
      calls.push({group,label:options.label,gate});
      return gate.promise;
    },
    setLoading:value=>loading.push(value),
    setCurrentUser:value=>{state.currentUser=value;},
    setIsAdmin:value=>{state.isAdmin=value;},
    setRequests:value=>{state.requests=value;},
    setEquipment:value=>{state.equipment=value;},
    setParts:value=>{state.parts=value;},
    setFluids:value=>{state.fluids=value;},
  };
  return {load:bindLoad(ctx),calls,loading,state};
}

async function waitForCalls(h,count){
  for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.calls.length,count,`Expected ${count} Fleet list requests`);
}
function resolveGroup(h,group,version){
  const payload={
    "Fleet requests":[{id:"request-1",item_name:`${version} request`,status:version==="new"?"received":"pending"}],
    "Fleet equipment":[{id:`equipment-${version}`,name:`${version} equipment`}],
    "Fleet parts":[{id:"part-1",part_name:"Synthetic filter",quantity_on_hand:version==="new"?7:1}],
    "Fleet fluids":[{id:"fluid-1",fluid_name:"Synthetic oil",quantity_on_hand:version==="new"?4:2}],
  };
  for(const call of h.calls.filter(row=>row.group===group)){
    call.gate.resolve(payload[call.label]);
  }
}

test("slower earlier Fleet Requests load cannot replace newer request or inventory rows",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,4);
  const newer=h.load();
  await waitForCalls(h,8);
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.state.requests[0]?.status,"received");
  assert.equal(h.state.parts[0]?.quantity_on_hand,7);
  assert.equal(h.loading.at(-1),false);
  resolveGroup(h,0,"old");
  await older;
  assert.equal(h.state.requests[0]?.status,"received","The older response must not restore a pending request");
  assert.equal(h.state.equipment[0]?.name,"new equipment");
  assert.equal(h.state.parts[0]?.quantity_on_hand,7,"Stale Fleet stock must not replace the refreshed quantity");
  assert.equal(h.state.fluids[0]?.quantity_on_hand,4);
  assert.equal(h.loading.at(-1),false);
});

test("earlier Fleet Requests load cannot clear loading while a newer refresh is still pending",async()=>{
  const h=harness();
  const older=h.load();
  await waitForCalls(h,4);
  const newer=h.load();
  await waitForCalls(h,8);
  resolveGroup(h,0,"old");
  await older;
  assert.equal(h.loading.at(-1),true,"Only the newest active refresh controls the loading indicator");
  resolveGroup(h,1,"new");
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.requests[0]?.status,"received");
});
