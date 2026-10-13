// Deferred, synthetic exercises of the actual Admin HR save and shared HR form handlers.
// No backend invocation, live identity, or production record is used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const form = readFileSync("src/components/user/UserHRDataForm.jsx", "utf8");
const effect = admin.slice(admin.indexOf("  useEffect(() => {\n    // A previous Admin session"),
  admin.indexOf("  const loadUsers = async () => {"));
function extract(source, start, end) {
  const s = source.indexOf(start);
  const e = source.indexOf(end, s + start.length);
  assert.ok(s !== -1 && e > s, "handler extracted from shipping component");
  return source.slice(s, e).trim().replace(/^const \w+ = /, "").replace(/;$/, "");
}
const adminHandler = extract(admin,
  "  const handleSaveHrData = async (hrData, record) => {",
  "  const handleSave = async () => {");
const formHandler = extract(form,
  "  const handleSave = async () => {",
  "  const reloadHrForRecovery = async () => {");
const older = {id:"old-employee", email:"old@example.invalid", updated_date:"v1", hr_data:{city:"Old"}};
const newer = {id:"new-employee", email:"new@example.invalid", updated_date:"v2", hr_data:{city:"New"}};
const draft = { city:"Edited" };
const instantiate = (source, scope) =>
  new Function("scope", `with (scope) { return (${source}); }`)(scope);

function adminFixture() {
  const refs = {
    activeSessionToken:{current:"old-session"},
    activeEditingUser:{current:older},
    hrSaveOwner:{current:null},
    hrSaveInFlight:{current:false},
    hrReloadInFlight:{current:false},
    userLoadSequence:{current:0},
    userUpdateInFlight:{current:false},
    deletionInFlight:{current:false},
  };
  const state = { calls:[], loading:false, error:false, saving:false, users:[older], editingUser:older };
  const common = {
    ...refs, userMutationSaving:false,
    get isLoading(){return state.loading;},
    get userDirectoryError(){return state.error;},
    isDialogOpen:true,
    setHrMutationSaving:value=>{state.saving=value;},
    setUserDirectoryError:value=>{state.error=value;},
    setUsers:updater=>{state.users=updater(state.users);},
    setEditingUser:updater=>{
      state.editingUser=updater(state.editingUser);
      refs.activeEditingUser.current=state.editingUser;
    },
    updateAuthorizedUserHrAdmin:({record,hrData,sessionToken})=>
      new Promise((resolve,reject)=>state.calls.push({record,hrData,sessionToken,resolve,reject}))
  };
  const handler = (token, record, directory=[record]) => instantiate(adminHandler,{
    ...common, sessionToken:token, users:directory
  });
  const change = (token,record) => {
    refs.activeSessionToken.current=token;
    refs.activeEditingUser.current=record;
    state.editingUser=record;
    state.users=[record];
    refs.hrSaveOwner.current=null;
    refs.hrSaveInFlight.current=false;
    state.saving=false;
  };
  return {refs,state,common,handler,change};
}
function formFixture(saveFn=()=>Promise.resolve(true)) {
  const refs = { saveInFlight:{current:false},reloadInFlight:{current:false},saveOwner:{current:null},
    scopeVersion:{current:1}, successTimer:{current:null},
    activeScope:{current:{id:older.id,email:older.email,saveScope:"old-session"}} };
  const state = { saving:false,success:"",error:"",updates:0,errors:[],saves:[] };
  const handler = (record=older,scope="old-session") => instantiate(formHandler,{
    ...refs,userData:record,saveScope:scope,hrData:draft,hrRecovery:null,
    preserveDraftOnRecordRefresh:false,onReloadLatest:null,
    onSave:data=>{state.saves.push(data);return saveFn(data);},
    onUpdate:()=>{state.updates++;},
    setIsSaving:value=>{state.saving=value;},
    setSaveSuccess:value=>{state.success=value;},
    setSaveError:value=>{state.error=value;},
    setDraftNotice:()=>{},
    setHrRecovery:()=>{},
    setConfirmOverwrite:()=>{},
    console:{error:(...args)=>{state.errors.push(args);}}
  });
  const change = (record,scope) => {
    refs.activeScope.current={id:record.id,email:record.email,saveScope:scope};
    refs.scopeVersion.current++;
    refs.saveOwner.current=null;
    refs.saveInFlight.current=false;
    state.saving=false;
  };
  const dispose=()=>{if(refs.successTimer.current)clearTimeout(refs.successTimer.current);};
  return {refs,state,handler,change,dispose};
}


test("Two consecutive HR saves use each verified prior version and retain the same editor", async () => {
  const f=adminFixture();
  const firstData={city:"Cincinnati",emergency_contacts:[{name:"A",phone:"111"}]};
  const secondData={city:"Columbus",emergency_contacts:[{name:"A",phone:"222"}]};
  const first=f.handler("old-session",older,f.state.users)(firstData,older);
  assert.equal(f.state.calls.length,1);
  f.state.calls[0].resolve({...older,updated_date:"v1-next",hr_data:firstData});
  assert.equal(await first,true);
  assert.deepEqual(f.state.editingUser.hr_data,firstData);
  assert.equal(f.state.editingUser.updated_date,"v1-next");
  assert.equal(f.state.users[0].updated_date,"v1-next");
  assert.equal(f.refs.userLoadSequence.current,1,"Earlier directory reads invalidated");
  const edited=f.state.editingUser;
  const second=f.handler("old-session",edited,f.state.users)(secondData,edited);
  assert.equal(f.state.calls.length,2);
  assert.equal(f.state.calls[1].record.updated_date,"v1-next");
  assert.deepEqual(f.state.calls[1].record.hr_data,firstData,
    "Compare-and-swap includes the latest saved HR snapshot");
  f.state.calls[1].resolve({...edited,updated_date:"v1-twice",hr_data:secondData});
  assert.equal(await second,true);
  assert.equal(f.state.editingUser.updated_date,"v1-twice");
  assert.deepEqual(f.state.users[0].hr_data,secondData);
  assert.equal(f.refs.userLoadSequence.current,2);
});

test("Equivalent nested HR objects with reordered keys verify successfully",async()=>{
  const f=adminFixture();
  const sent={city:"Cincinnati",emergency_contacts:[{phone:"111",name:"A"}],
    clothing_sizes:{shoe:"10",shirt:"XL"}};
  const returned={clothing_sizes:{shirt:"XL",shoe:"10"},
    emergency_contacts:[{name:"A",phone:"111"}],city:"Cincinnati"};
  const operation=f.handler("old-session",older)(sent,older);
  f.state.calls[0].resolve({...older,updated_date:"reordered",hr_data:returned});
  assert.equal(await operation,true);
  assert.equal(f.state.error,false);
  assert.equal(f.state.editingUser.updated_date,"reordered");
});

for(const outcome of ["wrong identity","missing version","mismatched HR data","array order changed"]){
  test(`Invalid HR receipt (${outcome}) blocks another write until directory reload`,async()=>{
    const f=adminFixture();
    const submitted={city:"Cincinnati",emergency_contacts:[{name:"A"},{name:"B"}]};
    const invalid={
      "wrong identity":{...older,id:"other",updated_date:"next",hr_data:submitted},
      "missing version":{...older,updated_date:"",hr_data:submitted},
      "mismatched HR data":{...older,updated_date:"next",hr_data:{city:"Not saved"}},
      "array order changed":{...older,updated_date:"next",
        hr_data:{city:"Cincinnati",emergency_contacts:[{name:"B"},{name:"A"}]}}
    }[outcome];
    const pending=f.handler("old-session",older)(submitted,older);
    f.state.calls[0].resolve(invalid);
    await assert.rejects(pending,/could not be verified/);
    assert.equal(f.state.error,true);
    assert.equal(f.state.editingUser,older);
    assert.equal(f.state.users[0],older);
    assert.equal(f.refs.hrSaveInFlight.current,false);
    await assert.rejects(()=>f.handler("old-session",older)(submitted,older),/directory or editor has changed/);
    assert.equal(f.state.calls.length,1);
  });
}

test("Pre-existing newer directory row is not overwritten by the old HR response",async()=>{
  const f=adminFixture();
  const pending=f.handler("old-session",older)(draft,older);
  const concurrentlyUpdated={...older,updated_date:"external-v2",hr_data:{city:"Other admin"}};
  f.state.users=[concurrentlyUpdated];
  f.state.calls[0].resolve({...older,updated_date:"saved-v2",hr_data:draft});
  assert.equal(await pending,true,"The write itself was acknowledged");
  assert.equal(f.state.users[0],concurrentlyUpdated,
    "No stale overwrite of another verified directory version");
  await assert.rejects(()=>f.handler("old-session",f.state.editingUser,f.state.users)(draft,f.state.editingUser));
  assert.equal(f.state.calls.length,1);
});

test("Admin HR record refresh preserves the draft while other shared form consumers still sync",()=>{
  const start=form.indexOf("  useEffect(() => {\n    // Admin refreshes the record version");
  const end=form.indexOf("  useEffect(() => {\n    // A switched employee",start);
  assert.ok(start>=0 && end>start);
  const effectSource=form.slice(start,end);
  for(const preserveDraftOnRecordRefresh of [true,false]){
    const written=[];
    const execute=new Function("scope", `with (scope) { ${effectSource} }`);
    execute({useEffect:callback=>callback(), preserveDraftOnRecordRefresh,
      userData:{...older,updated_date:"refreshed",hr_data:{city:"Refreshed"}},
      setHrData:data=>written.push(data)});
    assert.deepEqual(written,preserveDraftOnRecordRefresh?[]:[{city:"Refreshed"}]);
  }
  assert.match(form,/\[userData\?\.id, userData\?\.email, saveScope\]/,
    "Identity/scope changes must still clear confidential drafts");
  assert.match(admin,/preserveDraftOnRecordRefresh=\{true\}/);
});

test("Admin session transition revokes HR writes and prevents account saves while HR write runs",()=>{
  assert.match(admin,/const hrSaveInFlight = useRef\(false\);\s*const hrSaveOwner = useRef\(null\)/);
  assert.match(effect,/hrSaveOwner\.current = null;\s*hrSaveInFlight\.current = false;\s*setHrMutationSaving\(false\)/);
  assert.match(effect,/return \(\) => \{\s*hrReloadOwner\.current = null;\s*hrReloadInFlight\.current = false;\s*hrDraftStatus\.current = null;\s*accountDraftBaseline\.current = null;\s*hrSaveOwner\.current = null;\s*hrSaveInFlight\.current = false/);
  assert.match(admin,/if \(!editingUser \|\| userUpdateInFlight\.current \|\| hrSaveInFlight\.current/);
  assert.match(admin,/saveScope=\{sessionToken\}/);
  assert.match(admin,/disabled=\{userMutationSaving \|\| hrMutationSaving \|\| hrReloadLoading \|\| hasUnsavedHrData \|\| isLoading/);
});

test("Form owns requests with employee+session identity and discards old timers",()=>{
  assert.match(form,/saveOwner\.current === owner &&\s*scopeVersion\.current === owner\.version/);
  assert.match(form,/activeScope\.current\?\.id === owner\.id/);
  assert.match(form,/activeScope\.current\?\.saveScope === owner\.saveScope/);
  assert.match(form,/if \(!ownsSave\(\) \|\| result === false\) return/);
  assert.match(form,/if \(onUpdate && ownsSave\(\)\) onUpdate\(\)/);
  assert.match(form,/return \(\) => \{\s*\+\+scopeVersion\.current;\s*saveOwner\.current = null;\s*saveInFlight\.current = false;\s*reloadOwner\.current = null;\s*reloadInFlight\.current = false;\s*if \(successTimer\.current\) clearTimeout/);
  assert.match(form,/setHrData\(userData\?\.hr_data \|\| \{\}\)/);
});

test("Admin double submit starts one authorized HR write",async()=>{
  const f=adminFixture();
  const run=f.handler("old-session",older);
  const first=run(draft,older);
  const duplicate=assert.rejects(()=>run(draft,older), /directory or editor has changed/);
  assert.equal(f.state.calls.length,1);
  assert.equal(f.state.saving,true);
  assert.equal(f.state.calls[0].record,older);
  assert.equal(f.state.calls[0].sessionToken,"old-session");
  f.state.calls[0].resolve({...older, updated_date:"v1-saved", hr_data:draft});
  assert.deepEqual(await Promise.all([first,duplicate]),[true,undefined]);
  assert.equal(f.state.saving,false);
});

for (const outcome of ["success","failure"]) {
  test(`Admin old HR ${outcome} cannot release new lock or authorize new-session form update`,async()=>{
    const f=adminFixture();
    const oldPending=f.handler("old-session",older)(draft,older);
    f.change("new-session",newer);
    const newPending=f.handler("new-session",newer)(draft,newer);
    assert.equal(f.state.calls.length,2);
    if(outcome==="success")f.state.calls[0].resolve({...older, updated_date:"v1-saved", hr_data:draft});
    else f.state.calls[0].reject(new Error("private-old-hr-error"));
    assert.equal(await oldPending,false);
    assert.equal(f.state.saving,true);
    assert.equal(f.refs.hrSaveInFlight.current,true);
    f.state.calls[1].resolve({...newer, updated_date:"v2-saved", hr_data:draft});
    assert.equal(await newPending,true);
    assert.equal(f.state.saving,false);
  });
}

test("Admin refuses unverified employee, session, and overlapping writes",async()=>{
  const f=adminFixture();
  const attempts=[
    ()=>f.handler("old-session",older,[])(draft,older),
    ()=>f.handler("old-session",older,[{...older,updated_date:"v3"}])(draft,older),
    ()=>f.handler("old-session",older,[{...older,email:"other@example.invalid"}])(draft,older)
  ];
  for(const attempt of attempts)await assert.rejects(attempt);
  f.refs.activeEditingUser.current=newer;
  await assert.rejects(()=>f.handler("old-session",older)(draft,older));
  f.refs.activeEditingUser.current=older;
  f.refs.activeSessionToken.current="new-session";
  await assert.rejects(()=>f.handler("old-session",older)(draft,older));
  f.refs.activeSessionToken.current="old-session";
  f.refs.deletionInFlight.current=true;
  await assert.rejects(()=>f.handler("old-session",older)(draft,older));
  assert.equal(f.state.calls.length,0);
});

test("Current Admin HR error releases owner and permits retry",async()=>{
  const f=adminFixture();
  const first=f.handler("old-session",older)(draft,older);
  f.state.calls[0].reject(new Error("synthetic-hr-version-conflict"));
  await assert.rejects(first,/synthetic-hr-version-conflict/);
  assert.equal(f.refs.hrSaveInFlight.current,false);
  const next=f.handler("old-session",older)(draft,older);
  assert.equal(f.state.calls.length,2);
  f.state.calls[1].resolve({...older, updated_date:"v1-saved", hr_data:draft});
  assert.equal(await next,true);
});

for(const outcome of ["success","failure"]){
  test(`Shared HR form old ${outcome} cannot change new employee progress, toast, or refresh`,async()=>{
    let release,reject;
    const f=formFixture(()=>new Promise((resolve,rej)=>{release=resolve;reject=rej;}));
    const oldPending=f.handler(older,"old-session")();
    assert.equal(f.state.saves.length,1);
    const duplicate=f.handler(older,"old-session")();
    assert.equal(f.state.saves.length,1);
    f.change(newer,"new-session");
    f.state.success="New employee success";
    f.state.error="New employee error";
    f.state.saving=true;
    if(outcome==="success")release(true);
    else reject(new Error("private-old-error"));
    await Promise.all([oldPending,duplicate]);
    assert.equal(f.state.success,"New employee success");
    assert.equal(f.state.error,"New employee error");
    assert.equal(f.state.saving,true);
    assert.equal(f.state.updates,0);
    assert.equal(f.state.errors.length,0);
    f.dispose();
  });
}

test("Current HR form save succeeds and refreshes exactly once",async()=>{
  const f=formFixture();
  await f.handler()();
  assert.equal(f.state.success,"Changes saved successfully!");
  assert.equal(f.state.updates,1);
  assert.equal(f.state.saving,false);
  f.dispose();
});

test("Current HR form error reports safely, releases lock and does not refresh",async()=>{
  const f=formFixture(()=>Promise.reject(new Error("synthetic-save-conflict")));
  await f.handler()();
  assert.equal(f.state.error,"synthetic-save-conflict");
  assert.equal(f.state.updates,0);
  assert.equal(f.state.saving,false);
  f.dispose();
});

test("Admin returning false suppresses success and refresh without leaving form blocked",async()=>{
  const f=formFixture(()=>Promise.resolve(false));
  await f.handler()();
  assert.equal(f.state.success,"");
  assert.equal(f.state.error,"");
  assert.equal(f.state.updates,0);
  assert.equal(f.state.saving,false);
  f.dispose();
});
