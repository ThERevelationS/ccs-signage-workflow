// Deterministic real-handler tests for component-level Fleet load races:
// FleetLifecyclePanel and FleetEquipmentDocuments re-fire on equipment-prop
// changes; FleetRepairApprovalPolicies reloads on mount, Retry refresh, and
// post-mutation refreshes. Superseded responses must not project stale state.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const src=file=>readFileSync(path.join(process.cwd(),file),"utf8").replace(/\r\n/g,"\n");
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

// ---------- FleetLifecyclePanel ----------
const lifecycleSource=src("src/components/fleet/FleetLifecyclePanel.jsx");
{
  const begin=lifecycleSource.indexOf("  const load = async () => {");
  const fnBegin=lifecycleSource.indexOf("async",begin);
  const end=lifecycleSource.indexOf("\n  };",fnBegin);
  assert.ok(begin>=0&&end>fnBegin,"Missing FleetLifecyclePanel load source");
  var bindLifecycleLoad=new Function("ctx",`with(ctx){return (${lifecycleSource.slice(fnBegin,end+4)});}`);
}
function lifecycleHarness(){
  const calls=[],loading=[],errors=[],state={profile:null,metrics:null};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    isAdmin:true,
    equipment:{id:"a",name:"Asset A"},
    loadSequenceRef:{current:0},
    base44:{functions:{invoke:(name,args)=>gate(`lifecycle:${args.equipment_id}`)}},
    invokeFleet:(name,args)=>ctx.base44.functions.invoke(name,args),
    seed:profile=>({seeded:profile?.id||"none"}),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setProfile:value=>{state.profile=value;},
    setMetrics:value=>{state.metrics=value;},
    setFlags:()=>{},
    setPriority:()=>{},
    setForm:()=>{},
  };
  return {load:bindLifecycleLoad(ctx),ctx,calls,loading,errors,state};
}
const lifecyclePayload=(asset,version)=>({data:{profile:{id:`profile-${asset}-${version}`},metrics:{score:version}}});

test("FleetLifecyclePanel: stale earlier asset load cannot overwrite the newer asset's profile",async()=>{
  const h=lifecycleHarness();
  const older=h.load();
  await waitForCalls(h,1);
  h.ctx.equipment={id:"b",name:"Asset B"};
  const newer=h.load();
  await waitForCalls(h,2);
  resolveCall(h,1,lifecyclePayload("b","new"));
  await newer;
  assert.equal(h.state.profile?.id,"profile-b-new");
  resolveCall(h,0,lifecyclePayload("a","old"));
  await older;
  assert.equal(h.state.profile?.id,"profile-b-new","Asset A's lifecycle must not replace Asset B's");
  assert.equal(h.loading.at(-1),false);
});

test("FleetLifecyclePanel: earlier asset load cannot clear loading while the newer load is pending",async()=>{
  const h=lifecycleHarness();
  const older=h.load();
  await waitForCalls(h,1);
  h.ctx.equipment={id:"b",name:"Asset B"};
  const newer=h.load();
  await waitForCalls(h,2);
  resolveCall(h,0,lifecyclePayload("a","old"));
  await older;
  assert.equal(h.loading.at(-1),true);
  resolveCall(h,1,lifecyclePayload("b","new"));
  await newer;
  assert.equal(h.loading.at(-1),false);
  assert.equal(h.state.profile?.id,"profile-b-new");
});

test("FleetLifecyclePanel: a superseded asset load failure cannot surface over the newer load",async()=>{
  const h=lifecycleHarness();
  const older=h.load();
  await waitForCalls(h,1);
  h.ctx.equipment={id:"b",name:"Asset B"};
  const newer=h.load();
  await waitForCalls(h,2);
  const stale=h.calls[0];
  stale.settled=true;
  stale.gate.reject(new Error("asset A lifecycle failed"));
  await older;
  assert.equal(h.errors.filter(Boolean).length,0,"The superseded load must not project its failure");
  resolveCall(h,1,lifecyclePayload("b","new"));
  await newer;
  assert.equal(h.state.profile?.id,"profile-b-new");
  assert.equal(h.loading.at(-1),false);
});

// ---------- FleetEquipmentDocuments ----------
const documentsSource=src("src/components/fleet/FleetEquipmentDocuments.jsx");
{
  const begin=documentsSource.indexOf("  const loadDocuments = useCallback(async () => {");
  const fnBegin=documentsSource.indexOf("async",begin);
  const end=documentsSource.indexOf("\n  }, [equipment?.id, equipment?.name]);",fnBegin);
  assert.ok(begin>=0&&end>fnBegin,"Missing FleetEquipmentDocuments load source");
  var bindDocumentsLoad=new Function("ctx",`with(ctx){return (${documentsSource.slice(fnBegin,end+4)});}`);
}
function documentsHarness(){
  const calls=[],loading=[],errors=[],state={documents:[]};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    equipment:{id:"a",name:"Asset A"},
    loadSequenceRef:{current:0},
    base44:{entities:{FleetEquipmentDocument:{}}},
    filterAllFleetRows:(_entity,_filter,_sort,options)=>gate(options.label),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setDocuments:value=>{state.documents=value;},
  };
  return {load:bindDocumentsLoad(ctx),ctx,calls,loading,errors,state};
}

test("FleetEquipmentDocuments: stale earlier asset load cannot overwrite the newer asset's documents",async()=>{
  const h=documentsHarness();
  const older=h.load();
  await waitForCalls(h,1);
  assert.equal(h.calls[0].label,"Asset A Fleet documents");
  h.ctx.equipment={id:"b",name:"Asset B"};
  const newer=h.load();
  await waitForCalls(h,2);
  assert.equal(h.calls[1].label,"Asset B Fleet documents");
  resolveCall(h,1,[{id:"doc-b"}]);
  await newer;
  assert.equal(h.state.documents[0]?.id,"doc-b");
  resolveCall(h,0,[{id:"doc-a"}]);
  await older;
  assert.equal(h.state.documents[0]?.id,"doc-b","Asset A's documents must not replace Asset B's");
  assert.equal(h.loading.at(-1),false);
});

test("FleetEquipmentDocuments: earlier load cannot clear loading while a newer refresh is pending",async()=>{
  const h=documentsHarness();
  const older=h.load();
  await waitForCalls(h,1);
  const newer=h.load();
  await waitForCalls(h,2);
  resolveCall(h,0,[{id:"doc-a"}]);
  await older;
  assert.equal(h.loading.at(-1),true);
  resolveCall(h,1,[{id:"doc-a2"}]);
  await newer;
  assert.equal(h.loading.at(-1),false);
});

// ---------- FleetRepairApprovalPolicies ----------
const policiesSource=src("src/components/fleet/FleetRepairApprovalPolicies.jsx");
{
  const loadBegin=policiesSource.indexOf("  const load = async () => {");
  const loadFnBegin=policiesSource.indexOf("async",loadBegin);
  const loadEnd=policiesSource.indexOf("\n  };",loadFnBegin);
  assert.ok(loadBegin>=0&&loadEnd>loadFnBegin,"Missing policies load source");
  var bindPoliciesLoad=new Function("ctx",`with(ctx){return (${policiesSource.slice(loadFnBegin,loadEnd+4)});}`);
  const mutBegin=policiesSource.indexOf("  const refreshAfterMutation = async verb => {");
  const mutFnBegin=policiesSource.indexOf("async verb => {",mutBegin);
  const mutEnd=policiesSource.indexOf("\n  };",mutFnBegin);
  assert.ok(mutBegin>=0&&mutEnd>mutFnBegin,"Missing policies refreshAfterMutation source");
  var bindRefresh=new Function("ctx",`with(ctx){return (${policiesSource.slice(mutFnBegin,mutEnd+4)});}`);
}
function policiesHarness(){
  const calls=[],loading=[],errors=[],warnings=[],state={policies:[],loadFailed:false};
  const gate=label=>{const g=defer();calls.push({label,gate:g,settled:false});return g.promise;};
  const ctx={
    loadSequenceRef:{current:0},
    fetchPolicies:()=>gate("policies"),
    setLoading:value=>loading.push(value),
    setError:value=>errors.push(value),
    setLoadFailed:value=>{state.loadFailed=value;},
    setPolicies:value=>{state.policies=value;},
    setRefreshWarning:value=>warnings.push(value),
  };
  return {load:bindPoliciesLoad(ctx),refresh:bindRefresh(ctx),calls,loading,errors,warnings,state};
}

test("FleetRepairApprovalPolicies: stale earlier load cannot overwrite the refreshed policy list",async()=>{
  const h=policiesHarness();
  const older=h.load();
  await waitForCalls(h,1);
  const newer=h.load();
  await waitForCalls(h,2);
  resolveCall(h,1,[{id:"policy-new"}]);
  await newer;
  assert.equal(h.state.policies[0]?.id,"policy-new");
  resolveCall(h,0,[{id:"policy-old"}]);
  const olderResult=await older;
  assert.equal(olderResult,false,"A superseded load must report it did not apply");
  assert.equal(h.state.policies[0]?.id,"policy-new");
  assert.equal(h.loading.at(-1),false);
});

test("FleetRepairApprovalPolicies: earlier load cannot clear loading while a newer refresh is pending",async()=>{
  const h=policiesHarness();
  const older=h.load();
  await waitForCalls(h,1);
  const newer=h.load();
  await waitForCalls(h,2);
  resolveCall(h,0,[{id:"policy-old"}]);
  await older;
  assert.equal(h.loading.at(-1),true);
  resolveCall(h,1,[{id:"policy-new"}]);
  await newer;
  assert.equal(h.loading.at(-1),false);
});

test("FleetRepairApprovalPolicies: a post-mutation refresh wins over an in-flight load",async()=>{
  const h=policiesHarness();
  const load=h.load();
  await waitForCalls(h,1);
  const refresh=h.refresh("Save");
  await waitForCalls(h,2);
  resolveCall(h,1,[{id:"policy-after-save"}]);
  const refreshResult=await refresh;
  assert.equal(refreshResult,true);
  assert.equal(h.state.policies[0]?.id,"policy-after-save");
  resolveCall(h,0,[{id:"policy-stale"}]);
  await load;
  assert.equal(h.state.policies[0]?.id,"policy-after-save","The in-flight load must not roll back the post-mutation list");
  assert.equal(h.loading.at(-1),false);
});
