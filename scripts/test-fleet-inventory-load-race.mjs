// Deterministic real-handler tests for overlapping Fleet inventory page loads
// (FleetParts, FleetFluids). Save, usage-recording, and identification-dismiss flows
// each re-fire the page load, so a slower earlier response can roll back newer
// stock quantities or clear a newer loading state.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

const PAGES={
  FleetParts:{
    callsPerLoad:3,
    payload:version=>({
      "Fleet parts":[{id:"part-1",part_name:"Synthetic filter",quantity_on_hand:version==="new"?9:2}],
      "Fleet equipment":[{id:`equipment-${version}`,name:`${version} equipment`}],
      "Fleet part identification inbox":[{id:`identification-${version}`}],
    }),
    assertNew:state=>{
      assert.equal(state.parts[0]?.quantity_on_hand,9,"Stale Fleet stock must not replace the refreshed quantity");
      assert.equal(state.equipment[0]?.name,"new equipment");
      assert.equal(state.identifications[0]?.id,"identification-new");
    },
  },
  FleetFluids:{
    callsPerLoad:2,
    payload:version=>({
      "Fleet fluids":[{id:"fluid-1",fluid_name:"Synthetic oil",quantity:version==="new"?5:1}],
      "Fleet equipment":[{id:`equipment-${version}`,name:`${version} equipment`}],
    }),
    assertNew:state=>{
      assert.equal(state.fluids[0]?.quantity,5,"Stale Fleet stock must not replace the refreshed quantity");
      assert.equal(state.equipment[0]?.name,"new equipment");
    },
  },
};

for(const [page,cfg] of Object.entries(PAGES)){

  const source=readFileSync(path.join(process.cwd(),`src/pages/${page}.jsx`),"utf8");
  const begin=source.indexOf("  const load = useCallback(async () => {");
  const callbackBegin=source.indexOf("async () => {",begin);
  const end=source.indexOf("\n  },[]);",callbackBegin);
  assert.ok(begin>=0&&callbackBegin>begin&&end>callbackBegin,`Missing load source in ${page}`);
  const bindLoad=new Function("ctx",`with(ctx){return (${source.slice(callbackBegin,end+4)});}`);

  const harness=()=>{
    const calls=[],loading=[],errors=[],state={parts:[],fluids:[],equipment:[],identifications:[],user:null};
    const gate=label=>{const g=defer(),group=Math.floor(calls.length/cfg.callsPerLoad);calls.push({group,label,gate:g});return g.promise;};
    const ctx={
      loadSequenceRef:{current:0},
      base44:{
        auth:{me:async()=>({id:"synthetic-admin",email:"admin@example.test",role:"admin"})},
        entities:{FleetPart:{},FleetFluid:{},FleetEquipment:{},FleetPartIdentification:{}},
      },
      listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
      setLoading:value=>loading.push(value),
      setError:value=>errors.push(value),
      setParts:value=>{state.parts=value;},
      setFluids:value=>{state.fluids=value;},
      setEquipment:value=>{state.equipment=value;},
      setIdentifications:value=>{state.identifications=value;},
      setUser:value=>{state.user=value;},
    };
    return {load:bindLoad(ctx),calls,loading,errors,state};
  };

  const waitForCalls=async(h,count)=>{
    for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(h.calls.length,count,`Expected ${count} ${page} list requests`);
  };
  const resolveGroup=(h,group,version)=>{
    const payload=cfg.payload(version);
    for(const call of h.calls.filter(row=>row.group===group))call.gate.resolve(payload[call.label]);
  };

  test(`${page}: slower earlier load cannot replace newer stock quantities`,async()=>{
    const h=harness();
    const older=h.load();
    await waitForCalls(h,cfg.callsPerLoad);
    const newer=h.load();
    await waitForCalls(h,cfg.callsPerLoad*2);
    resolveGroup(h,1,"new");
    await newer;
    cfg.assertNew(h.state);
    assert.equal(h.loading.at(-1),false);
    resolveGroup(h,0,"old");
    await older;
    cfg.assertNew(h.state);
    assert.equal(h.loading.at(-1),false,"Stale load must not clear the newer loading state");
  });

  test(`${page}: earlier load cannot clear loading while a newer refresh is still pending`,async()=>{
    const h=harness();
    const older=h.load();
    await waitForCalls(h,cfg.callsPerLoad);
    const newer=h.load();
    await waitForCalls(h,cfg.callsPerLoad*2);
    resolveGroup(h,0,"old");
    await older;
    assert.equal(h.loading.at(-1),true,"Only the newest active refresh controls the loading indicator");
    resolveGroup(h,1,"new");
    await newer;
    assert.equal(h.loading.at(-1),false);
    cfg.assertNew(h.state);
  });

  test(`${page}: earlier load failure cannot surface an error over a newer pending refresh`,async()=>{
    const h=harness();
    const older=h.load();
    await waitForCalls(h,cfg.callsPerLoad);
    const newer=h.load();
    await waitForCalls(h,cfg.callsPerLoad*2);
    for(const call of h.calls.filter(row=>row.group===0&&row.label==="Fleet equipment"))call.gate.reject(new Error("equipment list failed"));
    for(const call of h.calls.filter(row=>row.group===0&&row.label!=="Fleet equipment"))call.gate.resolve(cfg.payload("old")[call.label]);
    await older;
    assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
    assert.equal(h.loading.at(-1),true,"A superseded load must not clear the newer loading state");
    resolveGroup(h,1,"new");
    await newer;
    assert.equal(h.loading.at(-1),false);
    cfg.assertNew(h.state);
  });
}
