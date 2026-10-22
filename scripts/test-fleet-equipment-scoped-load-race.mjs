// Deterministic real-handler tests for overlapping equipment-scoped Fleet page loads
// (FleetFuel, FleetWarranties, FleetReservations). Each page's `load` is re-fired when the
// equipment filter changes, so overlapping responses are routine, not exceptional.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};

const PAGES={
  FleetWarranties:{
    beginMarker:"  const load=useCallback(async()=>{",
    asyncNeedle:"async()=>{",
    endNeedle:"\n  },[equipmentId]);",
    entityLabel:"Fleet equipment for warranty tracking",
    invokeName:"fleetWarrantyAction",
    payload:version=>({
      "Fleet equipment for warranty tracking":[{id:`equipment-${version}`,name:`${version} equipment`}],
      fleetWarrantyAction:{data:{rows:[{id:`warranty-${version}`,status:version==="new"?"active":"expired"}],summary:{count:version==="new"?2:1}}},
    }),
    assertNew:state=>{
      assert.equal(state.equipment[0]?.name,"new equipment");
      assert.equal(state.rows[0]?.status,"active");
      assert.equal(state.summary?.count,2);
    },
  },
  FleetReservations:{
    beginMarker:"  const load=useCallback(async()=>{",
    asyncNeedle:"async()=>{",
    endNeedle:"\n  },[equipmentId]);",
    entityLabel:"Fleet equipment for reservations",
    invokeName:"fleetReservationAction",
    payload:version=>({
      "Fleet equipment for reservations":[{id:`equipment-${version}`,name:`${version} equipment`}],
      fleetReservationAction:{data:{reservations:[{id:`reservation-${version}`,status:version==="new"?"checked_out":"reserved"}]}},
    }),
    assertNew:state=>{
      assert.equal(state.equipment[0]?.name,"new equipment");
      assert.equal(state.reservations[0]?.status,"checked_out");
    },
  },
};

for(const [page,cfg] of Object.entries(PAGES)){

  const source=readFileSync(path.join(process.cwd(),`src/pages/${page}.jsx`),"utf8");
  const begin=source.indexOf(cfg.beginMarker);
  const callbackBegin=source.indexOf(cfg.asyncNeedle,begin);
  const end=source.indexOf(cfg.endNeedle,callbackBegin);
  assert.ok(begin>=0&&callbackBegin>begin&&end>callbackBegin,`Missing load source in ${page}`);
  const bindLoad=new Function("ctx",`with(ctx){return (${source.slice(callbackBegin,end+4)});}`);

  const harness=()=>{
    const calls=[],loading=[],errors=[],state={equipment:[],user:null,summary:null,rows:[],reservations:[]};
    const gate=label=>{const g=defer(),group=Math.floor(calls.length/2);calls.push({group,label,gate:g});return g.promise;};
    const ctx={
      loadSequenceRef:{current:0},
      equipmentId:"equipment-1",
      year:"2026",
      base44:{
        auth:{me:async()=>({id:"synthetic-admin",email:"admin@example.test",role:"admin"})},
        entities:{FleetEquipment:{}},
        functions:{invoke:name=>gate(name)},
      },
      listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
      setLoading:value=>loading.push(value),
      setError:value=>errors.push(value),
      setEquipment:value=>{state.equipment=value;},
      setUser:value=>{state.user=value;},
      setSummary:value=>{state.summary=value;},
      setRows:value=>{state.rows=value;},
      setReservations:value=>{state.reservations=value;},
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

  test(`${page}: slower earlier load cannot replace newer equipment-scoped rows`,async()=>{
    const h=harness();
    const older=h.load();
    await waitForCalls(h,2);
    const newer=h.load();
    await waitForCalls(h,4);
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
    await waitForCalls(h,2);
    const newer=h.load();
    await waitForCalls(h,4);
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
    await waitForCalls(h,2);
    const newer=h.load();
    await waitForCalls(h,4);
    for(const call of h.calls.filter(row=>row.group===0&&row.label===cfg.entityLabel))call.gate.reject(new Error("equipment list failed"));
    for(const call of h.calls.filter(row=>row.group===0&&row.label!==cfg.entityLabel))call.gate.resolve(cfg.payload("old")[call.label]);
    await older;
    assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
    assert.equal(h.loading.at(-1),true,"A superseded load must not clear the newer loading state");
    resolveGroup(h,1,"new");
    await newer;
    assert.equal(h.loading.at(-1),false);
    cfg.assertNew(h.state);
  });
}

// FleetFuel resolves its summary in a second phase, so a superseded load creates only
// its equipment call; resolve calls by index instead of fixed-size groups.
const FUEL={
  beginMarker:"  const load = useCallback(async()=>{",
  asyncNeedle:"async()=>{",
  endNeedle:"\n  },[equipmentId,year]);",
  payload:version=>({
    "Fleet equipment for fuel tracking":[{id:`equipment-${version}`,name:`${version} equipment`}],
    fleetFuelAction:{data:{total_cost:version==="new"?900:100,marker:version}},
  }),
  assertNew:state=>{
    assert.equal(state.equipment[0]?.name,"new equipment");
    assert.equal(state.summary?.total_cost,900);
  },
};

{
  const source=readFileSync(path.join(process.cwd(),"src/pages/FleetFuel.jsx"),"utf8");
  const begin=source.indexOf(FUEL.beginMarker);
  const callbackBegin=source.indexOf(FUEL.asyncNeedle,begin);
  const end=source.indexOf(FUEL.endNeedle,callbackBegin);
  assert.ok(begin>=0&&callbackBegin>begin&&end>callbackBegin,"Missing load source in FleetFuel");
  const bindLoad=new Function("ctx",`with(ctx){return (${source.slice(callbackBegin,end+4)});}`);

  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const harness=()=>{
    const calls=[],loading=[],errors=[],state={equipment:[],user:null,summary:null};
    const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
    const ctx={
      loadSequenceRef:{current:0},
      equipmentId:"equipment-1",
      year:"2026",
      base44:{
        auth:{me:async()=>({id:"synthetic-admin",email:"admin@example.test",role:"admin"})},
        entities:{FleetEquipment:{}},
        functions:{invoke:name=>gate(name)},
      },
      listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
      setLoading:value=>loading.push(value),
      setError:value=>errors.push(value),
      setEquipment:value=>{state.equipment=value;},
      setUser:value=>{state.user=value;},
      setSummary:value=>{state.summary=value;},
    };
    return {load:bindLoad(ctx),calls,loading,errors,state};
  };
  const resolveOne=(h,index,version)=>{
    const call=h.calls[index];
    assert.ok(call&&!call.settled,`Expected an open FleetFuel call at index ${index}`);
    call.settled=true;
    call.gate.resolve(FUEL.payload(version)[call.label]);
  };
  const resolveOpen=async(h,version)=>{
    for(let guard=0;guard<20;guard+=1){
      const open=h.calls.filter(call=>!call.settled);
      if(!open.length)return;
      for(const call of open){call.settled=true;call.gate.resolve(FUEL.payload(version)[call.label]);}
      await tick();
    }
    throw new Error("FleetFuel calls did not drain");
  };

  test("FleetFuel: slower earlier load cannot replace newer equipment-scoped rows",async()=>{
    const h=harness();
    const older=h.load();
    await tick();
    assert.equal(h.calls.length,1);
    const newer=h.load();
    await tick();
    assert.equal(h.calls.length,2);
    resolveOne(h,1,"new");
    await tick();
    resolveOne(h,2,"new");
    await newer;
    FUEL.assertNew(h.state);
    assert.equal(h.loading.at(-1),false);
    resolveOne(h,0,"old");
    await tick();
    if(h.calls[3]&&!h.calls[3].settled)resolveOne(h,3,"old");
    await older;
    FUEL.assertNew(h.state);
    assert.equal(h.loading.at(-1),false,"Stale load must not clear the newer loading state");
  });

  test("FleetFuel: earlier load cannot clear loading while a newer refresh is still pending",async()=>{
    const h=harness();
    const older=h.load();
    await tick();
    const newer=h.load();
    await tick();
    resolveOne(h,0,"old");
    await tick();
    if(h.calls[2]&&h.calls[2].label==="fleetFuelAction"&&!h.calls[2].settled)resolveOne(h,2,"old");
    await older;
    assert.equal(h.loading.at(-1),true,"Only the newest active refresh controls the loading indicator");
    await resolveOpen(h,"new");
    await newer;
    assert.equal(h.loading.at(-1),false);
    FUEL.assertNew(h.state);
  });

  test("FleetFuel: earlier load failure cannot surface an error over a newer pending refresh",async()=>{
    const h=harness();
    const older=h.load();
    await tick();
    const newer=h.load();
    await tick();
    h.calls[0].settled=true;
    h.calls[0].gate.reject(new Error("equipment list failed"));
    await older;
    assert.equal(h.errors.at(-1),"","A superseded load must not project its failure over the newer refresh");
    assert.equal(h.loading.at(-1),true,"A superseded load must not clear the newer loading state");
    await resolveOpen(h,"new");
    await newer;
    assert.equal(h.loading.at(-1),false);
    FUEL.assertNew(h.state);
  });
}
