// Synthetic Admin HR conflict recovery; never invokes production data or APIs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reconcileHrDraft } from "../src/components/user/reconcileHrDraft.js";

const admin=readFileSync("src/components/admin/UserManagement.jsx","utf8");
const form=readFileSync("src/components/user/UserHRDataForm.jsx","utf8");
const old={id:"employee",email:"employee@example.invalid",updated_date:"v1",hr_data:{address:"First",city:"Cincinnati",clothing_sizes:{shirt:"L"}}};
const latest={...old,updated_date:"v2",hr_data:{address:"New",city:"Cincinnati",clothing_sizes:{shirt:"L"}}};
const draft={address:"Draft",city:"Cincinnati",clothing_sizes:{shirt:"XL"}};
function extract(source,name,following) {
 const begin=source.indexOf(`  const ${name} = `),end=source.indexOf(`  const ${following} = `,begin+1);
 assert.ok(begin>=0&&end>begin,`Found shipping ${name}`);
 return source.slice(begin,end).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
}
const adminReload=extract(admin,"reloadHrRecord","handleSaveHrData");
const formReload=extract(form,"reloadHrForRecovery","recoveryComparison");
const formResolve=extract(form,"resolveHrRecovery","updateField");
const instantiate=(source,scope)=>new Function("scope",`with(scope){return (${source})}`)(scope);

function parentFixture(){
 const refs={
  activeSessionToken:{current:"session-1"},activeEditingUser:{current:old},
  hrReloadInFlight:{current:false},hrReloadOwner:{current:null},
  hrSaveInFlight:{current:false},userUpdateInFlight:{current:false},
  deletionInFlight:{current:false},userLoadSequence:{current:5}
 };
 const state={requests:[],directory:[old],editing:old,loading:false,dirError:true,reloadLoading:false};
 const common={...refs,isLoading:false,isDialogOpen:true,sessionToken:"session-1",
  listAuthorizedUsersAdmin:({sessionToken})=>new Promise((resolve,reject)=>
    state.requests.push({sessionToken,resolve,reject})),
  setUsers:value=>{state.directory=value;},
  setEditingUser:update=>{state.editing=update(state.editing);refs.activeEditingUser.current=state.editing;},
  setUserDirectoryError:value=>{state.dirError=value;},
  setHrReloadLoading:value=>{state.reloadLoading=value;}
 };
 const handler=(token="session-1")=>instantiate(adminReload,{...common,sessionToken:token});
 const switchSession=(token,record=old)=>{
  refs.activeSessionToken.current=token;
  refs.activeEditingUser.current=record;
  refs.hrReloadOwner.current=null;
  refs.hrReloadInFlight.current=false;
  state.editing=record;
  state.reloadLoading=false;
 };
 return {refs,state,handler,switchSession};
}
function formFixture(){
 const refs={reloadOwner:{current:null},reloadInFlight:{current:false},
  saveInFlight:{current:false},scopeVersion:{current:9},
  activeScope:{current:{id:old.id,email:old.email,saveScope:"session-1"}}};
 const state={recovery:{stage:"needs_reload",baseline:old.hr_data},draft,
  savedError:"",loading:false,notice:"",confirmed:false,calls:[],
  latestResult:null};
 const shared={...refs,
  userData:old,saveScope:"session-1",onReloadLatest:()=>new Promise((resolve,reject)=>
    state.calls.push({resolve,reject})),
  setReloadSaving:v=>{state.loading=v;},
  setSaveError:v=>{state.savedError=v;},
  setHrRecovery:update=>{state.recovery=typeof update==="function"?update(state.recovery):update;},
  setConfirmOverwrite:v=>{state.confirmed=v;},
  setHrData:v=>{state.draft=v;},
  setDraftNotice:v=>{state.notice=v;}
 };
 const reload=()=>instantiate(formReload,{...shared,hrRecovery:state.recovery});
 const resolve=()=>{
  const comparison=state.recovery?.stage==="review"?reconcileHrDraft({
   baseline:state.recovery.baseline, latest:state.recovery.latest,draft:state.draft}):null;
  return instantiate(formResolve,{...shared,reconcileHrDraft,hrRecovery:state.recovery,
    hrData:state.draft,recoveryComparison:comparison,confirmOverwrite:state.confirmed});
 };
 const change=()=>{
  refs.scopeVersion.current++;
  refs.reloadOwner.current=null;refs.reloadInFlight.current=false;
  refs.activeScope.current={id:"other",email:"other@example.invalid",saveScope:"session-2"};
 };
 return {refs,state,reload,resolve,change};
}

test("Three-way merge keeps unrelated latest changes and never writes a record",()=>{
 const answer=reconcileHrDraft({baseline:old.hr_data,latest:latest.hr_data,draft});
 assert.deepEqual(answer.editedFields,["address","clothing_sizes.shirt"]);
 assert.deepEqual(answer.conflictFields,["address"]);
 assert.equal(answer.merged.address,"New");
 assert.equal(answer.merged.clothing_sizes.shirt,"XL");
 assert.deepEqual(latest.hr_data.clothing_sizes,{shirt:"L"},"Source remains immutable");
 assert.equal(reconcileHrDraft({baseline:old.hr_data,latest:latest.hr_data,draft,overwriteConflicts:true}).merged.address,"Draft");
});
test("Nested objects compare structurally, arrays preserve order and deletions are explicit",()=>{
 const a={sizes:{shoe:"10",shirt:"L"},contacts:[{name:"A"},{name:"B"}],phone:"111"};
 const b={sizes:{shirt:"L",shoe:"10"},contacts:[{name:"B"},{name:"A"}],phone:"222"};
 const draft={...a,phone:"333",contacts:[{name:"A"}]};
 const result=reconcileHrDraft({baseline:a,latest:b,draft});
 assert.deepEqual(result.conflictFields,["contacts","phone"]);
 assert.deepEqual(result.merged.contacts,b.contacts);
 const removed=reconcileHrDraft({baseline:a,latest:a,draft:{sizes:a.sizes,contacts:a.contacts}});
 assert.equal(Object.hasOwn(removed.merged,"phone"),false);
 assert.throws(()=>reconcileHrDraft({baseline:a,latest:[],draft}),/verified records/);
});
test("Parent reload verifies session, identity and clears stale reads",async()=>{
 const f=parentFixture(),pending=f.handler()(old);
 assert.equal(f.state.requests.length,1);
 assert.equal(f.state.reloadLoading,true);
 f.state.requests[0].resolve([latest]);
 assert.deepEqual(await pending,latest);
 assert.equal(f.state.directory[0],latest);
 assert.equal(f.state.editing,latest);
 assert.equal(f.refs.userLoadSequence.current,6);
 assert.equal(f.state.dirError,false);
 assert.equal(f.state.reloadLoading,false);
 assert.equal(f.refs.hrReloadInFlight.current,false);
});
test("Parent duplicate reload blocked while first is pending",async()=>{
 const f=parentFixture(),first=f.handler()(old);
 await assert.rejects(()=>f.handler()(old),/editor changed/);
 assert.equal(f.state.requests.length,1);
 f.state.requests[0].resolve([latest]);
 await first;
});
for(const outcome of ["success","error"]){
 test(`Parent stale reload ${outcome} cannot update next session`,async()=>{
  const f=parentFixture(),first=f.handler()(old);
  f.switchSession("session-2");
  const next=f.handler("session-2")(old);
  if(outcome==="success")f.state.requests[0].resolve([latest]);
  else f.state.requests[0].reject(new Error("synthetic-old-reload"));
  if(outcome==="success")assert.equal(await first,null);
  else await assert.rejects(first);
  assert.equal(f.state.reloadLoading,true);
  assert.equal(f.state.editing,old);
  assert.equal(f.refs.hrReloadInFlight.current,true);
  f.state.requests[1].resolve([{...latest,updated_date:"v3"}]);
  await next;
  assert.equal(f.state.editing.updated_date,"v3");
 });
}
test("Unverified parent reload cannot replace the employee record",async()=>{
 const f=parentFixture(),pending=f.handler()(old);
 f.state.requests[0].resolve([{...latest,email:"another@example.invalid"}]);
 await assert.rejects(pending,/could not be verified/);
 assert.equal(f.state.editing,old);
 assert.equal(f.state.dirError,true);
});
test("Form reload preserves draft and requires a separate review decision",async()=>{
 const f=formFixture(),pending=f.reload()();
 assert.equal(f.state.calls.length,1);
 assert.equal(f.state.loading,true);
 f.state.calls[0].resolve(latest);
 await pending;
 assert.equal(f.state.recovery.stage,"review");
 assert.deepEqual(f.state.draft,draft);
 assert.equal(f.state.loading,false);
 assert.equal(f.state.savedError,"");
});
test("Form late reload never resurrects recovery after session change",async()=>{
 const f=formFixture(),pending=f.reload()();
 f.change();
 f.state.recovery=null;
 f.state.savedError="new session message";
 f.state.calls[0].resolve(latest);
 await pending;
 assert.equal(f.state.recovery,null);
 assert.equal(f.state.savedError,"new session message");
});
test("Form unverified reload leaves draft and retry option intact",async()=>{
 const f=formFixture(),pending=f.reload()();
 f.state.calls[0].resolve({...latest,id:"wrong"});
 await pending;
 assert.equal(f.state.recovery.stage,"needs_reload");
 assert.deepEqual(f.state.draft,draft);
 assert.match(f.state.savedError,/could not be verified/);
});
test("Keep non-conflicting changes preserves newer values in overlapping fields",()=>{
 const f=formFixture();
 f.state.recovery={...f.state.recovery,stage:"review",latest:latest.hr_data};
 f.resolve()("prefer-latest");
 assert.equal(f.state.draft.address,"New");
 assert.equal(f.state.draft.clothing_sizes.shirt,"XL");
 assert.equal(f.state.recovery,null);
 assert.match(f.state.notice,/Nothing has been saved yet/);
});
test("Overwriting conflicting fields needs an explicit acknowledgement",()=>{
 const f=formFixture();
 f.state.recovery={...f.state.recovery,stage:"review",latest:latest.hr_data};
 f.resolve()("keep-conflicts");
 assert.deepEqual(f.state.draft,draft);
 assert.equal(f.state.recovery.stage,"review");
 f.state.confirmed=true;
 f.resolve()("keep-conflicts");
 assert.equal(f.state.draft.address,"Draft");
 assert.equal(f.state.recovery,null);
});
test("Choosing latest discards draft only after a deliberate action",()=>{
 const f=formFixture();
 f.state.recovery={...f.state.recovery,stage:"review",latest:latest.hr_data};
 f.resolve()("latest");
 assert.deepEqual(f.state.draft,latest.hr_data);
 assert.equal(f.state.recovery,null);
});
test("Shipping form blocks Save until reconciliation and no direct write in reload path",()=>{
 assert.match(form,/saveInFlight\.current \|\| reloadInFlight\.current \|\| hrRecovery\) return/);
 assert.match(form,/disabled=\{isSaving \|\| saveInFlight\.current \|\| reloadSaving \|\| !!hrRecovery\}/);
 assert.match(form,/onClick=\{reloadHrForRecovery\}/);
 assert.match(form,/onClick=\{\(\) => resolveHrRecovery\("keep-conflicts"\)\}/);
 assert.match(form,/onReloadLatest &&[\s\S]*?HR data changed in another session/);
 assert.match(admin,/onReloadLatest=\{\(\) => reloadHrRecord\(editingUser\)\}/);
 assert.match(admin,/hrReloadOwner\.current = null;\s*hrReloadInFlight\.current = false;/);
 assert.doesNotMatch(adminReload,/updateAuthorizedUserHrAdmin|deleteAuthorizedUserAdmin/);
});
