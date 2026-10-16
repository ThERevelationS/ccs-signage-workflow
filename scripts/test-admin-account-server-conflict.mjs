// Executes the real Account Save handler with isolated backend failure fixtures.
// All email, role, and password values here are synthetic; no network calls.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { rejectedAdminAccountField } from "../src/components/admin/accountSaveConflict.js";
import { createAdminAccountDraft, getChangedAdminAccountFields, hasUnsavedAdminAccountDraft } from "../src/components/admin/adminAccountDraft.js";
import { compareUnverifiedAccountSave } from "../src/components/admin/unverifiedAccountSave.js";
import { planAccountFieldResolution } from "../src/components/admin/accountFieldResolution.js";

const source = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const begin=source.indexOf("  const handleSave = async () => {");
const end=source.indexOf("  const verifyInterruptedAccountSave = async () => {",begin);
assert.ok(begin>=0&&end>begin);
const saveCode=source.slice(begin,end).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
const generate=(scope)=>new Function("scope",`with(scope){return (${saveCode})}`)(scope);
const original={
 id:"synthetic-employee",email:"mock@example.invalid",updated_date:"v1",
 username:"mock-user",full_name:"Synthetic User",role:"user",
 sales_roles:["Designer"],can_import_export:false,can_order_export:false,
 can_view_resources:false,employment_type:"hourly",can_work_pause:false
};
const attempted={
 ...createAdminAccountDraft(original),full_name:"Requested Name",
 role:"admin",can_view_resources:true,can_import_export:true,
 sales_roles:["Designer","Estimator"],password_hash:"mock-only-secret-1234"
};
const fresh={...original,updated_date:"v2",role:"admin",
 can_view_resources:true,can_import_export:false,sales_roles:["Designer","Installer"],
 full_name:"Other Administrator"};
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
function fixture({response=fresh,errorMessage="Authorized user changed in another session (role). Reload before saving."}={}){
 const refs={
  activeSessionToken:{current:"session-1"},activeEditingUser:{current:original},
  activeAccountDraft:{current:attempted},
  accountDraftBaseline:{current:{id:original.id,email:original.email,
    sessionToken:"session-1",values:createAdminAccountDraft(original)}},
  userUpdateInFlight:{current:false},userUpdateOwner:{current:null},
  hrSaveInFlight:{current:false},hrReloadInFlight:{current:false},
  deletionInFlight:{current:false},userLoadSequence:{current:0}
 };
 const state={editor:original,draft:{...attempted},write:null,notice:"",
  error:"",confirm:true,choices:{role:"mine"},calls:0,passwordCalls:0,reads:0,readRows:response===null?null:[response],
  writeDeferred:null,readDeferred:null,loading:false,readError:false,users:[original],dialog:true,saving:false};
 refs.activeAccountDraft.current=state.draft;
 const scope={...refs,rejectedAdminAccountField,createAdminAccountDraft,
  compareUnverifiedAccountSave,hasUnsavedAdminAccountDraft,
  get sessionToken(){return "session-1";},get editingUser(){return state.editor;},
  get formData(){return state.draft;},get accountWriteRecovery(){return state.write;},
  get accountSaveRecovery(){return null;},
  get isLoading(){return state.loading;},get userDirectoryError(){return state.readError;},
  hasProtectedHrDraft:()=>false,
  setUserMutationError:v=>{state.error=v;},
  setUserMutationSaving:v=>{state.saving=v;},
  setAccountSaveNotice:v=>{state.notice=v;},
  setAccountWriteRecovery:v=>{state.write=v;},
  setConfirmAccountReconciliation:v=>{state.confirm=v;},
  setAccountFieldChoices:v=>{state.choices=v;},
  updateAuthorizedUserAdmin:()=>{
    state.calls++;
    return state.writeDeferred?state.writeDeferred.promise:Promise.reject(new Error(errorMessage));
  },
  listAuthorizedUsersAdmin:()=>{
    state.reads++;
    return state.readDeferred?state.readDeferred.promise:Promise.resolve(state.readRows);
  },
  setPasswordFn:()=>{state.passwordCalls++;throw new Error("Forbidden: password write");},
  setUsers:v=>{state.users=typeof v==="function"?v(state.users):v;},
  setEditingUser:v=>{
    state.editor=typeof v==="function"?v(state.editor):v;
    refs.activeEditingUser.current=state.editor;
  },
  setFormData:v=>{
    state.draft=typeof v==="function"?v(state.draft):v;
    refs.activeAccountDraft.current=state.draft;
  },
  setIsDialogOpen:v=>{state.dialog=v;},
  clearEditorDraftTracking:()=>{throw new Error("Must keep editor open");},
  loadUsers:()=>{throw new Error("Must not reload or retry through save failure");}
 };
 return {state,refs,scope,save:generate(scope)};
}

test("Only exact server field precondition failures are classified",()=>{
 for(const name of ["role","sales_roles","can_order_export","can_view_resources",
  "can_import_export","username","full_name","employment_type","can_work_pause"]){
  assert.equal(rejectedAdminAccountField(new Error(
    `Authorized user changed in another session (${name}). Reload before saving.`)),name);
 }
 for(const message of [
  "This username is already in use.",
  "The final admin account cannot be demoted or removed. Promote another admin first.",
  "Authorized user changed in another session (role).",
  "Authorized user admin@example.invalid changed in another session (role).",
  "Authorized user changed in another session (password_hash). Reload before saving.",
  "Authorized user changed in another session (role). Reload before saving. Extra",
  "network timeout","Unauthorized",""
 ]) assert.equal(rejectedAdminAccountField(new Error(message)),null);
 assert.equal(rejectedAdminAccountField(null),null);
});

for(const field of ["role","can_import_export","can_order_export","can_view_resources","sales_roles","full_name"]){
 test(`Confirmed ${field} precondition rejection immediately opens read-only field review`,async()=>{
  const f=fixture({errorMessage:`Authorized user changed in another session (${field}). Reload before saving.`});
  await f.save();
  assert.equal(f.state.calls,1);
  assert.equal(f.state.passwordCalls,0);
  assert.equal(f.state.reads,1);
  assert.equal(f.state.write.stage,"review");
  assert.equal(f.state.write.rejectedField,field);
  assert.equal(f.state.write.comparison.status,"mixed");
  assert.equal(f.state.editor.updated_date,"v1");
  assert.equal(f.state.draft.password_hash,attempted.password_hash);
  assert.equal(f.state.draft.role,"admin");
  assert.equal(f.state.confirm,false);
  assert.deepEqual(f.state.choices,{});
  assert.equal(f.state.error,"");
  assert.equal(f.refs.userUpdateInFlight.current,false);
  assert.equal(f.state.dialog,true);
  assert.equal(f.state.write.attempted.password_hash,undefined);
  assert.equal(JSON.stringify(f.state.write).includes(attempted.password_hash),false);
  const plan=planAccountFieldResolution({
   baseline:f.state.write.baseline,attempted:f.state.write.attempted,
   latest:f.state.write.latest,draft:f.state.draft,choices:{role:"latest"}
  });
  assert.equal(plan.draft.role,"admin");
  assert.ok(plan.fields.some(x=>x.sensitive));
  await f.save();
  assert.equal(f.state.calls,1);
  assert.equal(f.state.passwordCalls,0);
 });
}

for(const message of [
 "This username is already in use.",
 "The final admin account cannot be demoted or removed. Promote another admin first.",
 "network timeout",
 "Authorized user update could not be verified.",
 "Authorized user changed in another session (password_hash). Reload before saving."
]){
 test(`Non-field rejection ${message.slice(0,30)} remains uncertain and never auto-reads`,async()=>{
  const f=fixture({errorMessage:message});
  await f.save();
  assert.equal(f.state.calls,1);
  assert.equal(f.state.reads,0);
  assert.equal(f.state.write.stage,"needs_read");
  assert.equal(f.state.write.rejectedField,undefined);
  assert.equal(f.state.passwordCalls,0);
  assert.equal(f.state.draft.password_hash,attempted.password_hash);
 });
}

for(const value of [null,[],[fresh,fresh],[{...fresh,updated_date:""}]]){
 test(`Confirmed field rejection with invalid latest directory ${String(value).slice(0,14)} blocks review`,async()=>{
  const f=fixture();
  f.state.readRows=value;
  await f.save();
  assert.equal(f.state.calls,1);
  assert.equal(f.state.reads,1);
  assert.equal(f.state.write.stage,"needs_read");
  assert.equal(f.state.write.rejectedField,"role");
  assert.equal(f.state.passwordCalls,0);
  assert.deepEqual(f.state.draft,attempted);
  assert.match(f.state.error,/could not be verified/);
 });
}

test("Read-only lookup failure preserves typed draft and permits manual verification",async()=>{
 const f=fixture();f.state.readDeferred=deferred();
 const done=f.save();
 f.state.readDeferred.reject(new Error("offline"));
 await done;
 assert.equal(f.state.write.stage,"needs_read");
 assert.equal(f.state.write.rejectedField,"role");
 assert.deepEqual(f.state.draft,attempted);
 assert.equal(f.state.passwordCalls,0);
 assert.equal(f.state.calls,1);
});

test("Rapid duplicate Save sends one write while the field conflict read is pending",async()=>{
 const f=fixture();f.state.writeDeferred=deferred();f.state.readDeferred=deferred();
 const first=f.save(),second=f.save();
 assert.equal(f.state.calls,1);
 f.state.writeDeferred.reject(new Error(
   "Authorized user changed in another session (can_import_export). Reload before saving."));
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.state.reads,1);
 assert.equal(f.refs.userUpdateInFlight.current,true);
 f.state.readDeferred.resolve([fresh]);await first;await second;
 assert.equal(f.state.calls,1);
 assert.equal(f.state.write.stage,"review");
 assert.equal(f.refs.userUpdateInFlight.current,false);
});

test("Retired session during conflict lookup cannot present another admin's review",async()=>{
 const f=fixture();f.state.readDeferred=deferred();
 const active=f.save();
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.state.reads,1);
 f.refs.activeSessionToken.current="replacement-session";
 f.state.readDeferred.resolve([fresh]);await active;
 assert.equal(f.state.write.stage,"needs_read");
 assert.equal(f.state.passwordCalls,0);
 assert.equal(f.state.calls,1);
});

test("No plaintext, passwords, or account values appear in review banner",()=>{
 assert.match(source,/Account save rejected — review concurrent field changes/);
 assert.match(source,/rejectedField\.replaceAll\("_", " "\)/);
 assert.doesNotMatch(source,/\$\{error\.message\}/);
 assert.match(source,/No automatic Account retry will occur/);
 assert.match(source,/The server rejected this Account update/);
});
