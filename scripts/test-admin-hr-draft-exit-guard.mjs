// Synthetic Admin HR draft lifecycle regression tests. No backend, identities or real HR data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasUnsavedHrDraft } from "../src/components/user/reconcileHrDraft.js";

const page=readFileSync("src/components/admin/UserManagement.jsx","utf8");
const form=readFileSync("src/components/user/UserHRDataForm.jsx","utf8");
const old={id:"emp-a",email:"a@example.invalid",updated_date:"v1",full_name:"Synthetic A",hr_data:{city:"Cincinnati",clothing_sizes:{shirt:"L"}}};
const other={id:"emp-b",email:"b@example.invalid",updated_date:"v2",full_name:"Synthetic B",hr_data:{city:"Dayton"}};
const fakeScope="synthetic-session";
function extract(start,end){
 const a=page.indexOf("  const "+start+" = "),b=page.indexOf("  const "+end+" = ",a+8);
 assert.ok(a>=0&&b>a,`shipping handler ${start} has valid boundaries`);
 return page.slice(a,b).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
}
const code={
 protected:extract("hasProtectedHrDraft","hasProtectedAccountDraft"),
 account:extract("hasProtectedAccountDraft","clearHrDraftTracking"),
 clear:extract("clearHrDraftTracking","clearEditorDraftTracking"),
 clearEditor:extract("clearEditorDraftTracking","hasProtectedEditorDraft"),
 close:extract("requestCloseUserEditor","openEditUser"),
 open:extract("openEditUser","confirmDiscardHrDraft"),
 confirm:extract("confirmDiscardHrDraft","handleSendPasswordReset")
};
const compile=(source,scope)=>new Function("scope",`with(scope){return (${source})}`)(scope);

function fixture(){
 const refs={
  activeSessionToken:{current:fakeScope},
  activeEditingUser:{current:old},
  hrDraftStatus:{current:null},
  accountDraftBaseline:{current:null},
  hrSaveInFlight:{current:false},
  hrReloadInFlight:{current:false},
  userUpdateInFlight:{current:false},
  deletionInFlight:{current:false}
 };
 const state={
  editor:old,dialog:true,token:fakeScope,
  pending:null,hasUnsaved:false,loading:false,directoryError:false,
  directory:[old,other],account:null,
 };
 const scope={
  ...refs,
  get sessionToken(){return state.token;},
  get editingUser(){return state.editor;},
  get isDialogOpen(){return state.dialog;},
  get pendingHrExit(){return state.pending;},
  get users(){return state.directory;},
  get isLoading(){return state.loading;},
  get userDirectoryError(){return state.directoryError;},
  get formData(){return state.account;},
  createAdminAccountDraft:record=>({ full_name:record.full_name || "" }), 
  hasUnsavedAdminAccountDraft:()=>false,
  setAccountSaveRecovery:()=>{},setPasswordRetryConfirmed:()=>{},setAccountSaveNotice:()=>{},
  setPendingHrExit:v=>{state.pending=v;},
  setHasUnsavedHrData:v=>{state.hasUnsaved=typeof v==="function"?v(state.hasUnsaved):v;},
  setEditingUser:v=>{
    state.editor=typeof v==="function"?v(state.editor):v;
    refs.activeEditingUser.current=state.editor;
  },
  setIsDialogOpen:v=>{state.dialog=v;},
  setFormData:v=>{state.account=v;}
 };
 const names={protected:"hasProtectedHrDraft",account:"hasProtectedAccountDraft",
  clear:"clearHrDraftTracking",clearEditor:"clearEditorDraftTracking",
  close:"requestCloseUserEditor",open:"openEditUser",confirm:"confirmDiscardHrDraft"};
 for(const [key,source] of Object.entries(code)) scope[names[key]]=compile(source,scope);
 scope.hasProtectedEditorDraft=()=>scope.hasProtectedHrDraft()||scope.hasProtectedAccountDraft();
 const mark=(record=old,dirty=true,token=fakeScope)=>{
   refs.hrDraftStatus.current={id:record.id,email:record.email,sessionToken:token,dirty};
   state.hasUnsaved=dirty;
 };
 return {state,refs,scope,mark,...Object.fromEntries(Object.keys(code).map(key=>[key,scope[names[key]]]))};
}

test("Draft comparison preserves semantic equality and detects edits to confidential nested fields",()=>{
 const baseline={clothing_sizes:{shirt:"L",shoe:"10"},emergency_contacts:[{name:"A",phone:"111" }]};
 const same={emergency_contacts:[{phone:"111",name:"A"}],clothing_sizes:{shoe:"10",shirt:"L"}};
 assert.equal(hasUnsavedHrDraft(baseline,same),false);
 assert.equal(hasUnsavedHrDraft({},{}),false);
 assert.equal(hasUnsavedHrDraft(baseline,{...same,clothing_sizes:{shoe:"11",shirt:"L"}}),true);
 assert.equal(hasUnsavedHrDraft(baseline,{...same,emergency_contacts:[{name:"A",phone:"222"}]}),true);
 assert.equal(hasUnsavedHrDraft(baseline,{clothing_sizes:{shirt:"L",shoe:"10"}}),true);
 assert.equal(hasUnsavedHrDraft(null,{}),true);
 assert.equal(hasUnsavedHrDraft({},[]),true);
});

test("Dirty HR status matches exact employee and session, not an old editor",()=>{
 const f=fixture();
 f.mark();
 assert.equal(f.protected(),true);
 f.mark(other);
 assert.equal(f.protected(),false);
 f.mark(old,true,"retired");
 assert.equal(f.protected(),false);
 f.mark(old,false);
 assert.equal(f.protected(),false);
 f.mark(old,true);
 f.refs.activeEditingUser.current=other;
 assert.equal(f.protected(),false);
});

test("Cancel with unsaved draft opens a confirmation and retains the editor",()=>{
 const f=fixture();f.mark();
 f.close();
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.editor,old);
 assert.deepEqual(f.state.pending,{kind:"close",sessionToken:fakeScope,sourceId:old.id,sourceEmail:old.email});
 assert.equal(f.state.hasUnsaved,true);
});

test("Declining the discard confirmation preserves the HR draft and editor",()=>{
 const f=fixture();f.mark();f.close();
 f.state.pending=null; // Equivalent to Keep editing / dismiss.
 assert.equal(f.protected(),true);
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.editor,old);
});

test("Confirmed discard closes current editor without changing any employee record",()=>{
 const f=fixture();f.mark();f.close();
 const initial=JSON.stringify(f.state.directory);
 f.confirm();
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.editor,null);
 assert.equal(f.state.pending,null);
 assert.equal(f.state.hasUnsaved,false);
 assert.equal(f.refs.hrDraftStatus.current,null);
 assert.equal(JSON.stringify(f.state.directory),initial);
});

test("Clean HR editor closes without presenting a discard dialog",()=>{
 const f=fixture();
 f.close();
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.pending,null);
 assert.equal(f.state.editor,null);
});

test("Switching employees with unsaved HR edits requires confirmation",()=>{
 const f=fixture();f.mark();
 f.open(other);
 assert.equal(f.state.editor,old);
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.account,null);
 assert.deepEqual(f.state.pending,{
   kind:"switch",sessionToken:fakeScope,sourceId:old.id,sourceEmail:old.email,
   targetId:other.id,targetEmail:other.email,targetVersion:other.updated_date
 });
 f.confirm();
 assert.equal(f.state.editor,other);
 assert.equal(f.state.pending,null);
 assert.equal(f.state.hasUnsaved,false);
 assert.equal(f.state.account.full_name,"Synthetic B");
});

test("Switching employees with clean HR data works without prompt",()=>{
 const f=fixture();
 f.open(other);
 assert.equal(f.state.editor,other);
 assert.equal(f.state.pending,null);
});

test("Reopening the same employee does not wipe its unsaved HR draft",()=>{
 const f=fixture();f.mark();
 f.open(old);
 assert.equal(f.state.editor,old);
 assert.equal(f.state.pending,null);
 assert.equal(f.refs.hrDraftStatus.current.dirty,true);
});

for(const invalid of ["retired-session","changed-editor","new-target-version","loading","update-active","reload-active"]){
 test(`Stale discard confirmation cannot dismiss the HR draft: ${invalid}`,()=>{
  const f=fixture();f.mark();f.open(other);
  if(invalid==="retired-session")f.refs.activeSessionToken.current="new-session";
  if(invalid==="changed-editor")f.refs.activeEditingUser.current=other;
  if(invalid==="new-target-version")f.state.directory=[old,{...other,updated_date:"v3"}];
  if(invalid==="loading")f.state.loading=true;
  if(invalid==="update-active")f.refs.userUpdateInFlight.current=true;
  if(invalid==="reload-active")f.refs.hrReloadInFlight.current=true;
  f.confirm();
  assert.equal(f.state.editor,old);
  assert.equal(f.state.dialog,true);
  assert.equal(f.state.hasUnsaved,true);
  assert.equal(f.refs.hrDraftStatus.current.dirty,true);
 });
}

test("Cancel cannot hide the dialog during an authorized in-flight HR mutation",()=>{
 for(const field of ["hrSaveInFlight","hrReloadInFlight","userUpdateInFlight","deletionInFlight"]){
  const f=fixture();f.mark();f.refs[field].current=true;
  f.close();
  assert.equal(f.state.dialog,true,field);
  assert.equal(f.state.pending,null,field);
 }
});

test("Scoped child draft notifications publish no HR field values",()=>{
 const start=form.indexOf("  useEffect(() => {\n    // Only publish scoped dirty metadata");
 const end=form.indexOf("  useEffect(() => {\n    // Admin refreshes",start+1);
 assert.ok(start>=0&&end>start);
 const effect=form.slice(start,end);
 const published=[];
 const execute=new Function("scope",`with(scope){${effect}}`);
 for(const [draft,expected] of [
  [{city:"Cincinnati",clothing_sizes:{shirt:"L"}},false],
  [{city:"Columbus",clothing_sizes:{shirt:"L"}},true],
 ]){
  execute({useEffect:callback=>callback(),onDraftStatusChange:status=>published.push(status),
   userData:old,saveScope:fakeScope,hrData:draft,hrRecovery:null,hasUnsavedHrDraft});
  assert.equal(published.at(-1).dirty,expected);
  assert.deepEqual(Object.keys(published.at(-1)).sort(),["dirty","email","id","saveScope"]);
 }
});

test("Force-mounted HR tab survives Account tab switching and is reset for a new employee",()=>{
 assert.match(page,/<TabsContent value="hr" forceMount className="mt-0 data-\[state=inactive\]:hidden">/);
 assert.match(page,/key=\{\`\$\{sessionToken\}:\$\{editingUser\.id\}:\$\{editingUser\.email\}\`\}/);
 assert.match(page,/onDraftStatusChange=\{recordHrDraftStatus\}/);
 assert.match(page,/onClick=\{requestCloseUserEditor\}/);
 assert.match(page,/Unsaved HR changes are protected/);
 assert.match(page,/Discard unsaved employee changes\?/);
 assert.match(page,/Keep editing/);
 assert.match(page,/Discard unsaved changes/);
 assert.match(page,/onClick=\{confirmDiscardHrDraft\}/);
 assert.match(page,/hasUnsavedHrData \|\| !!accountSaveRecovery \|\| isLoading/);
});

test("Account save cannot close an editor with unsaved HR changes",async()=>{
 const start=page.indexOf("  const handleSave = async () => {");
 const end=page.indexOf("  const retryUnverifiedAccountPassword = async () => {",start);
 assert.ok(start>=0&&end>start);
 const handler=compile(page.slice(start,end).trim().replace(/^const \w+ = /,"").replace(/;$/,""),{
  hasProtectedHrDraft:()=>true,setUserMutationError:message=>{assert.match(message,/HR data/);},
  updateAuthorizedUserAdmin:()=>{throw new Error("Must not write account while HR dirty");}
 });
 await handler();
 assert.match(page,/disabled=\{userMutationSaving \|\| hrMutationSaving \|\| hrReloadLoading \|\| hasUnsavedHrData/);
});

test("Session changes revoke draft ownership and pending destructive confirmation",()=>{
 assert.match(page,/hrDraftStatus\.current = null;\s*accountDraftBaseline\.current = null;\s*setHasUnsavedHrData\(false\);\s*setPendingHrExit\(null\)/);
 assert.match(page,/return \(\) => \{[\s\S]*?hrDraftStatus\.current = null/);
 assert.match(page,/pending\.sessionToken !== sessionToken/);
 assert.match(page,/activeEditingUser\.current\?\.email !== pending\.sourceEmail/);
});
