// Deterministic real-handler tests for the year-scoped Fleet Analytics fuel fetch
// and for FleetEquipmentDetail loads racing an equipment-id switch, including the
// chained Bouncie trip load that must not land on a different asset's page.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

// ---------- FleetAnalytics ----------
const analyticsSource=readFileSync(path.join(process.cwd(),"src/pages/FleetAnalytics.jsx"),"utf8").replace(/\r\n/g,"\n");
const analyticsExtract=(marker,asyncNeedle,endNeedle)=>{
  const begin=analyticsSource.indexOf(marker);
  const fnBegin=analyticsSource.indexOf(asyncNeedle,begin);
  const end=analyticsSource.indexOf(endNeedle,fnBegin);
  assert.ok(begin>=0&&fnBegin>begin&&end>fnBegin,`Missing source for ${marker}`);
  return analyticsSource.slice(fnBegin,end+4);
};
const bindAnalyticsLoad=new Function("ctx",`with(ctx){return (${analyticsExtract("  const load = useCallback(","async () => {","\n  }, []);")});}`);
// The year-scoped fuel effect body.
const fuelMarker="  useEffect(() => {\n    if (user?.role !== \"admin\") return;";
assert.ok(analyticsSource.includes(fuelMarker),"Missing fuel effect marker");
const fuelFnBegin=analyticsSource.indexOf("() => {",analyticsSource.indexOf(fuelMarker));
const fuelEnd=analyticsSource.indexOf("\n  }, [user?.role, selectedYear]);",fuelFnBegin);
assert.ok(fuelEnd>fuelFnBegin,"Missing fuel effect end");
const bindFuelEffect=new Function("ctx",`with(ctx){return (${analyticsSource.slice(fuelFnBegin,fuelEnd+4)});}`);

function analyticsHarness(){
  const calls=[],fuelLoading=[],fuelErrors=[],state={fuelSummary:null};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    loadSequenceRef:{current:0},
    fuelSequenceRef:{current:0},
    selectedYear:"2025",
    user:{role:"admin"},
    base44:{
      auth:{me:async()=>({id:"admin-1",role:"admin"})},
      entities:{FleetEquipment:{},FleetMaintenanceWorkOrder:{},FleetMaintenanceTask:{}},
      functions:{invoke:(name,args)=>gate(args?.action==="summary"?`fuel:${args.start_date}`:`${name}:${args?.action||"run"}`)},
    },
    listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
    setLoading:()=>{},
    setError:()=>{},
    setUser:()=>{},
    setEquipment:()=>{},
    setWorkOrders:()=>{},
    setTasks:()=>{},
    setLifecycleRows:()=>{},
    setLifecycleError:()=>{},
    setFuelSummary:value=>{state.fuelSummary=value;},
    setFuelError:value=>fuelErrors.push(value),
    setFuelLoading:value=>fuelLoading.push(value),
  };
  return {load:bindAnalyticsLoad(ctx),fuelEffect:bindFuelEffect(ctx),ctx,calls,fuelLoading,fuelErrors,state};
}
const waitForCalls=async(h,count)=>{
  for(let attempt=0;h.calls.length<count&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.calls.length,count,`Expected ${count} gated calls, saw ${h.calls.length}`);
};
const resolveCall=(h,index,value)=>{
  const call=h.calls[index];
  assert.ok(call&&!call.settled,`Expected open call ${index}`);
  call.settled=true;
  call.gate.resolve(value);
};

// The year-scoped fuel effect already fences itself: React runs its returned
// cleanup on every year/role change, flipping the stale fetch's `mounted` flag
// before the next fetch starts. These tests lock that boundary in.
test("FleetAnalytics: fuel effect cleanup drops the superseded year's response",async()=>{
  const h=analyticsHarness();
  const cleanup1=h.fuelEffect();
  await waitForCalls(h,1);
  assert.equal(h.calls[0].label,"fuel:2025-01-01");
  assert.equal(typeof cleanup1,"function","The fuel effect must return a cleanup that retires the in-flight fetch");
  cleanup1();
  h.ctx.selectedYear="2024";
  const cleanup2=h.fuelEffect();
  await waitForCalls(h,2);
  assert.equal(h.calls[1].label,"fuel:2024-01-01");
  resolveCall(h,1,{data:{summary:"for-2024"}});
  await tick();
  assert.equal(h.state.fuelSummary?.summary,"for-2024");
  resolveCall(h,0,{data:{summary:"stale-2025"}});
  await tick();
  assert.equal(h.state.fuelSummary?.summary,"for-2024","The cleaned-up 2025 fetch must not replace the 2024 summary");
  assert.equal(h.fuelLoading.at(-1),false);
  cleanup2();
});

test("FleetAnalytics: a cleaned-up fuel-year failure cannot blank the newer summary",async()=>{
  const h=analyticsHarness();
  const cleanup1=h.fuelEffect();
  await waitForCalls(h,1);
  cleanup1();
  h.ctx.selectedYear="2024";
  h.fuelEffect();
  await waitForCalls(h,2);
  const stale=h.calls[0];
  stale.settled=true;
  stale.gate.reject(new Error("2025 summary failed"));
  await tick();
  assert.equal(h.fuelErrors.filter(Boolean).length,0,"The cleaned-up fetch must not project its failure");
  resolveCall(h,1,{data:{summary:"for-2024"}});
  await tick();
  assert.equal(h.state.fuelSummary?.summary,"for-2024");
  assert.equal(h.fuelLoading.at(-1),false);
});

// ---------- FleetEquipmentDetail ----------
const detailSource=readFileSync(path.join(process.cwd(),"src/pages/FleetEquipmentDetail.jsx"),"utf8").replace(/\r\n/g,"\n");
const detailExtract=(marker,endNeedle)=>{
  const begin=detailSource.indexOf(marker);
  const fnBegin=detailSource.indexOf("async",begin);
  const end=detailSource.indexOf(endNeedle,fnBegin);
  assert.ok(begin>=0&&fnBegin>begin&&end>fnBegin,`Missing source for ${marker}`);
  return detailSource.slice(fnBegin,end+4);
};
const bindDetailLoad=new Function("ctx",`with(ctx){return (${detailExtract("  const load = async () => {","\n  };")});}`);
const bindLoadTrips=new Function("ctx",`with(ctx){return (${detailExtract("  const loadTrips = async (eq) => {","\n  };")});}`);

const ASSETS={
  a:{id:"a",name:"Asset A",vin:"VINA",bouncie_imei:"IMEIA",bouncie_link_status:"linked"},
  b:{id:"b",name:"Asset B",vin:"VINB",bouncie_imei:"IMEIB",bouncie_link_status:"unlinked"},
};
const detailPayload=(asset,version)=>({
  [`equipment:${asset}`]:[ASSETS[asset]],
  [`${ASSETS[asset].name} Fleet work-order history`]:[{id:`wo-${version}`}],
  [`${ASSETS[asset].name} maintenance schedules`]:[{id:`task-${version}`}],
  [`${ASSETS[asset].name} equipment usage history`]:[{id:`log-${version}`}],
  [`${ASSETS[asset].name} Fleet inspections`]:[{id:`insp-${version}`}],
  "Fleet parts for equipment hub":[{id:`part-${version}`,compatible_equipment_ids:[asset]}],
  [`${ASSETS[asset].name} Fleet requests`]:[{id:`req-${version}`}],
  liveStates:[],notifications:[],metadata:[],
});

const resolveOpen=(h,payload,excludeIndex=-1)=>{
  for(const call of h.calls.filter((row,index)=>!row.settled&&index!==excludeIndex)){
    call.settled=true;
    call.gate.resolve(payload[call.label]??[]);
  }
};

function detailHarness(){
  const calls=[],loading=[],errors=[],tripsLoading=[],state={equipment:null,workOrders:[],trips:[]};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    id:"a",
    loadSequenceRef:{current:0},
    base44:{
      auth:{me:async()=>({id:"admin-1",role:"admin"})},
      entities:{
        FleetEquipment:{filter:query=>gate(`equipment:${query.id}`)},
        FleetMaintenanceWorkOrder:{},FleetMaintenanceTask:{},FleetEquipmentLog:{},FleetInspection:{},FleetPart:{},FleetPartFluidRequest:{},
        BouncieVehicleLiveState:{filter:()=>gate("liveStates")},
        BouncieNotification:{filter:()=>gate("notifications")},
        FleetVehicleMetadata:{filter:()=>gate("metadata")},
      },
      functions:{invoke:(name,args)=>gate(`${name}:${args?.path||"run"}`)},
    },
    filterAllFleetRows:(_entity,_filter,_sort,options)=>gate(options.label),
    listAllFleetRows:(_entity,_sort,options)=>gate(options.label),
    normalizeVin:value=>String(value||"").toUpperCase().trim(),
    normalizeImei:value=>String(value||"").toUpperCase().trim(),
    TRACKED_LINK:new Set(["linked"]),
    buildWeeklyRanges:count=>Array.from({length:count},(_,i)=>({start_date:`d${i}`})),
    metadataSeed:()=>({}),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setEquipment:value=>{state.equipment=value;},
    setCurrentUser:value=>{state.currentUser=value;},
    setTrips:value=>{state.trips=value;},
    setTripIdentityWarning:()=>{},
    setWorkOrders:value=>{state.workOrders=value;},
    setTasks:()=>{},
    setLogs:()=>{},
    setInspections:()=>{},
    setParts:()=>{},
    setRequests:()=>{},
    setLiveStates:()=>{},
    setNotifications:()=>{},
    setMetadata:()=>{},
    setMetaForm:()=>{},
    setTripsLoading:value=>tripsLoading.push(value),
  };
  ctx.loadTrips=bindLoadTrips(ctx);
  return {load:bindDetailLoad(ctx),ctx,calls,loading,errors,tripsLoading,state};
}

test("FleetEquipmentDetail: stale earlier asset load cannot replace the newer asset's page",async()=>{
  const h=detailHarness();
  const older=h.load();
  await waitForCalls(h,1);                       // call 0 = equipment:a
  h.ctx.id="b";
  const newer=h.load();
  await waitForCalls(h,2);                       // call 1 = equipment:b
  resolveCall(h,1,detailPayload("b","new")["equipment:b"]);
  await waitForCalls(h,11);                      // calls 2-10 = B's nine detail fetches
  for(let i=2;i<11;i++)resolveCall(h,i,detailPayload("b","new")[h.calls[i].label]);
  await newer;
  assert.equal(h.state.equipment?.id,"b");
  assert.equal(h.state.workOrders[0]?.id,"wo-new");
  resolveCall(h,0,detailPayload("a","old")["equipment:a"]);
  await tick();
  resolveOpen(h,detailPayload("a","old"));        // resolves A's detail batch if it was issued (pre-fix)
  await older;
  assert.equal(h.calls.length,11,"The superseded load must not even issue its detail fetches");
  assert.equal(h.state.equipment?.id,"b","Asset A's response must not replace Asset B's page");
  assert.equal(h.state.workOrders[0]?.id,"wo-new","Asset A's work orders must not replace Asset B's");
  assert.equal(h.loading.at(-1),false);
});

test("FleetEquipmentDetail: earlier asset load cannot clear loading while the newer asset load is pending",async()=>{
  const h=detailHarness();
  const older=h.load();
  await waitForCalls(h,1);
  h.ctx.id="b";
  const newer=h.load();
  await waitForCalls(h,2);
  resolveCall(h,0,detailPayload("a","old")["equipment:a"]);
  await tick();
  resolveOpen(h,detailPayload("a","old"),1);      // resolves A's detail batch if it was issued (pre-fix), leaving B's equipment fetch open
  await older;
  assert.equal(h.loading.at(-1),true,"Only the newest asset's load controls the loading indicator");
  resolveCall(h,1,detailPayload("b","new")["equipment:b"]);
  await waitForCalls(h,11);                      // calls 2-10 = B's nine detail fetches
  for(let i=2;i<11;i++)resolveCall(h,i,detailPayload("b","new")[h.calls[i].label]);
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.equipment?.id,"b");
});

test("FleetEquipmentDetail: a stale asset's Bouncie trip fetch cannot land on the newer asset's page",async()=>{
  const h=detailHarness();
  const older=h.load();
  await waitForCalls(h,1);
  resolveCall(h,0,detailPayload("a","old")["equipment:a"]);
  await waitForCalls(h,10);                      // calls 1-9 = A's nine detail fetches
  for(let i=1;i<10;i++)resolveCall(h,i,detailPayload("a","old")[h.calls[i].label]);
  await tick();
  await waitForCalls(h,11);                      // call 10 = A's chained Bouncie vehicle-identity fetch
  assert.equal(h.calls[10].label,"bouncieApi:/v1/vehicles");
  h.ctx.id="b";
  const newer=h.load();
  await waitForCalls(h,12);
  resolveCall(h,11,detailPayload("b","new")["equipment:b"]);
  await waitForCalls(h,21);                      // calls 12-20 = B's nine detail fetches
  for(let i=12;i<21;i++)resolveCall(h,i,detailPayload("b","new")[h.calls[i].label]);
  await newer;
  assert.equal(h.state.equipment?.id,"b");
  // A's stale identity check resolves after B's page applied; any trips it might
  // fetch must never land here.
  resolveCall(h,10,{data:{data:[{vin:"VINA",imei:"IMEIA"}]}});
  await older;
  await tick();
  for(const call of h.calls.filter(row=>!row.settled&&row.label==="bouncieApi:/v1/trips")){
    call.settled=true;
    call.gate.resolve({data:{data:[{id:"trip-a"}]}});
  }
  await tick();
  assert.deepEqual(h.state.trips,[],"Asset A's trips must not appear on Asset B's page");
  assert.equal(h.tripsLoading.at(-1),false,"The newer load must reset the stale trip indicator");
});


