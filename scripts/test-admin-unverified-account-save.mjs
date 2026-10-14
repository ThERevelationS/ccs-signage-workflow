// Synthetic read-only Account write recovery. Executes the shipping Admin
// handlers with isolated test records; no Base44 access or live writes.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createAdminAccountDraft, hasUnsavedAdminAccountDraft } from "../src/components/admin/adminAccountDraft.js";
import { compareUnverifiedAccountSave, rebaseAppliedAccountDraft } from "../src/components/admin/unverifiedAccountSave.js";
import { planAccountFieldResolution } from "../src/components/admin/accountFieldResolution.js";

const source = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const token = "synthetic-admin";
const before = {
  id:"test-user",email:"test@example.invalid",updated_date:"version-1",
  full_name:"Original",username:"staff",role:"user",sales_roles:["Designer"],
  can_import_export:false,can_order_export:false,can_view_resources:false,
  can_work_pause:false,employment_type:"hourly",hr_data:{city:"Test"}
};
const target = {...before,updated_date:"version-2",full_name:"Requested",
  can_import_export:true};
const attempted = createAdminAccountDraft(target);
const originalDraft = {...attempted,password_hash:"synthetic-pass-1234"};
const fullOriginal = createAdminAccountDraft(before);
const deferred = () => {
  let resolve,reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
function extract(start,end) {
 const a=source.indexOf(`  const ${start} = `);
 const b=source.indexOf(`  const ${end} = `,a+10);
 assert.ok(a>=0&&b>a,`shipping ${start} exists`);
 return source.slice(a,b).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
}
const code={
 save:extract("handleSave","verifyInterruptedAccountSave"),
 verify:extract("verifyInterruptedAccountSave","acceptVerifiedAccountSave"),
 accept:extract("acceptVerifiedAccountSave","retryUnverifiedAccountPassword")
};
const instantiate = (fragment,scope) =>
 new Function("scope",`with(scope){return (${fragment})}`)(scope);

function fixture() {
 const refs={
  activeSessionToken:{current:token},activeEditingUser:{current:before},
  accountDraftBaseline:{current:{sessionToken:token,id:before.id,email:before.email,values:fullOriginal}},
  activeAccountDraft:{current:originalDraft},
  userUpdateOwner:{current:null},userUpdateInFlight:{current:false},
  hrSaveInFlight:{current:false},hrReloadInFlight:{current:false},
  deletionInFlight:{current:false},userLoadSequence:{current:0}
 };
 const state={
  editor:before,form:originalDraft,users:[before],write:null,password:null,
  passwordCalls:[],accountCalls:[],readCalls:0,readResponse:[target],
  reads:[],accounts:[],notice:"",error:"",loading:false,dirtyHr:false,
  directoryError:false,mutationSaving:false,confirmed:false,choices:{},dialog:true
 };
 const scope={
  ...refs,createAdminAccountDraft,hasUnsavedAdminAccountDraft,
  compareUnverifiedAccountSave,rebaseAppliedAccountDraft,
  get sessionToken(){return token;},get editingUser(){return state.editor;},
  get formData(){return state.form;},get accountSaveRecovery(){return state.password;},
  get accountWriteRecovery(){return state.write;},
  get confirmAccountReconciliation(){return state.confirmed;},
  get isLoading(){return state.loading;},
  get userDirectoryError(){return state.directoryError;},
  hasProtectedHrDraft:()=>state.dirtyHr,
  setAccountSaveNotice:v=>{state.notice=v;},
  setUserMutationError:v=>{state.error=v;},
  setUserMutationSaving:v=>{state.mutationSaving=v;},
  setAccountWriteRecovery:v=>{state.write=v;},
  setAccountSaveRecovery:v=>{state.password=v;},
  setConfirmAccountReconciliation:v=>{state.confirmed=v;},
  setPasswordRetryConfirmed:()=>{},
  setUsers:v=>{state.users=typeof v==="function"?v(state.users):v;},
  setEditingUser:v=>{
    state.editor=typeof v==="function"?v(state.editor):v;
    refs.activeEditingUser.current=state.editor;
  },
  setFormData:v=>{
    state.form=typeof v==="function"?v(state.form):v;
    refs.activeAccountDraft.current=state.form;
  },
  setIsDialogOpen:v=>{state.dialog=v;},
  clearEditorDraftTracking:()=>{refs.accountDraftBaseline.current=null;},
  updateAuthorizedUserAdmin:options=>{
    state.accountCalls.push(options);
    return state.accounts.length?state.accounts.shift().promise:Promise.reject(new Error("lost acknowledgement"));
  },
  setPasswordFn:options=>{state.passwordCalls.push(options);return Promise.resolve({data:{success:true}});},
  loadUsers:()=>{
    state.readCalls++;
    return state.reads.length?state.reads.shift().promise:Promise.resolve(state.readResponse);
  }
 };
 return {state,refs,scope,
  save:instantiate(code.save,scope),verify:instantiate(code.verify,scope),
  accept:instantiate(code.accept,scope),
  draft:changes=>{
   state.form={...state.form,...changes};
   refs.activeAccountDraft.current=state.form;
  }
 };
}

test("Field reconciliation classifies exact match, unchanged, partial and different records",()=>{
 const applied=compareUnverifiedAccountSave({baseline:before,attempted,latest:target});
 assert.equal(applied.status,"applied");
 assert.equal(applied.appliedCount,2);
 assert.equal(applied.divergentCount,0);
 const unchanged=compareUnverifiedAccountSave({baseline:before,attempted,latest:before});
 assert.equal(unchanged.status,"unchanged");
 assert.equal(unchanged.unchangedCount,2);
 const mixed=compareUnverifiedAccountSave({
  baseline:before,attempted,latest:{...target,can_import_export:false}
 });
 assert.equal(mixed.status,"mixed");
 assert.equal(mixed.appliedCount,1);
 assert.equal(mixed.unchangedCount,1);
 const diverged=compareUnverifiedAccountSave({
  baseline:before,attempted,latest:{...target,full_name:"Other admin"}
 });
 assert.equal(diverged.status,"mixed");
 assert.equal(diverged.divergentCount,1);
 assert.equal(diverged.fields.find(row=>row.key==="full_name").outcome,"different");
 assert.equal(JSON.stringify(diverged).includes("Other admin"),false);
 assert.equal(JSON.stringify(diverged).includes("synthetic-pass"),false);
});

test("Stable Sales Pipeline role order is not a phantom conflict",()=>{
 const next={...attempted,sales_roles:["Installer","Designer"]};
 const current={...target,sales_roles:["Designer","Installer"]};
 const result=compareUnverifiedAccountSave({baseline:before,attempted:next,latest:current});
 assert.equal(result.status,"applied");
 assert.equal(result.fields.find(row=>row.key==="sales_roles").outcome,"applied");
});

test("Already-matching no-op Account fields can be adopted without claiming a receipt",()=>{
 const same=compareUnverifiedAccountSave({baseline:before,attempted:fullOriginal,latest:before});
 assert.equal(same.status,"applied");
 assert.equal(same.editedCount,0);
});

test("Applied read rebase preserves new local edits and remote-only changes",()=>{
 const latest={...target,can_work_pause:true};
 const result=rebaseAppliedAccountDraft({
  latest,attempted,current:{...originalDraft,username:"edited-since-click"}
 });
 assert.equal(result.full_name,target.full_name);
 assert.equal(result.username,"edited-since-click");
 assert.equal(result.can_work_pause,true);
 assert.equal(result.password_hash,originalDraft.password_hash);
});

test("Missing or malformed comparison data cannot be treated as success",()=>{
 assert.throws(()=>compareUnverifiedAccountSave({baseline:before,attempted:{},latest:target}),/incomplete/);
 assert.throws(()=>compareUnverifiedAccountSave({baseline:null,attempted,latest:target}),/complete/);
});

for(const outcome of ["rejected","invalid-receipt"]){
 test(`Unverified Account ${outcome} preserves draft and blocks duplicate Account and password writes`,async()=>{
  const f=fixture();
  if(outcome==="invalid-receipt")f.state.accounts.push({promise:Promise.resolve({...target,id:"wrong"})});
  await f.save();
  assert.equal(f.state.write.stage,"needs_read");
  assert.deepEqual(Object.keys(f.state.write).sort(),["attempted","baseline","email","id","sessionToken","stage"].sort());
  assert.equal(f.state.write.attempted.password_hash,undefined);
  assert.equal(f.state.editor.updated_date,before.updated_date);
  assert.equal(f.state.form.password_hash,originalDraft.password_hash);
  assert.equal(f.state.passwordCalls.length,0);
  assert.equal(f.state.accountCalls.length,1);
  await f.save();
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.readCalls,0);
  assert.match(f.state.error,/Resolve the unverified/);
 });
}

test("Read-only verification observes applied Account and never resends the update",async()=>{
 const f=fixture();await f.save();
 await f.verify();
 assert.equal(f.state.readCalls,1);
 assert.equal(f.state.write.stage,"review");
 assert.equal(f.state.write.comparison.status,"applied");
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 f.accept();
 assert.equal(f.state.write,null);
 assert.equal(f.refs.accountDraftBaseline.current.values.full_name,target.full_name);
 assert.equal(f.state.editor.updated_date,target.updated_date);
 assert.equal(f.state.form.password_hash,originalDraft.password_hash);
 assert.equal(f.state.password.passwordNotSent,true);
 assert.equal(f.state.accountCalls.length,1);
});

test("Read matches requested edits but preserves post-click local changes",async()=>{
 const f=fixture();await f.save();f.draft({username:"my-newer-edit"});
 await f.verify();f.accept();
 assert.equal(f.state.form.username,"my-newer-edit");
 assert.equal(f.state.form.full_name,target.full_name);
 assert.equal(f.state.accountCalls.length,1);
});

for(const status of ["unchanged","mixed"]){
 test(`Read-only ${status} comparison requires acknowledgment and keeps draft`,async()=>{
  const f=fixture();await f.save();
  f.state.readResponse=status==="unchanged"?[before]:[{...target,can_import_export:false}];
  await f.verify();
  assert.equal(f.state.write.comparison.status,status);
  f.accept();
  assert.equal(f.state.write.stage,"review");
  assert.equal(f.state.editor.updated_date,before.updated_date);
  f.state.confirmed=true;f.accept();
  assert.equal(f.state.write,null);
  assert.equal(f.state.form.full_name,target.full_name);
  assert.equal(f.state.form.password_hash,originalDraft.password_hash);
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.passwordCalls.length,0);
 });
}

test("Read failure, missing target, duplicate target, or missing version cannot authorize resubmission",async()=>{
 for(const value of [null,[],[target,target],[{...target,updated_date:""}]]){
  const f=fixture();await f.save();f.state.readResponse=value;
  await f.verify();
  assert.equal(f.state.write.stage,"needs_read");
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.passwordCalls.length,0);
 }
});

test("Repeated read can recover after a prior failed read without writing",async()=>{
 const f=fixture();await f.save();
 f.state.readResponse=null;await f.verify();
 f.state.readResponse=[target];await f.verify();
 assert.equal(f.state.write.stage,"review");
 assert.equal(f.state.readCalls,2);
 assert.equal(f.state.accountCalls.length,1);
});

test("Duplicate verification clicks share one owned read and stale completions do not reconcile",async()=>{
 const f=fixture();await f.save();
 const read=deferred();f.state.reads.push(read);
 const first=f.verify();const repeat=f.verify();
 assert.equal(f.state.readCalls,1);
 f.refs.activeSessionToken.current="other-session";
 read.resolve([target]);await first;await repeat;
 assert.equal(f.state.write.stage,"needs_read");
 assert.equal(f.state.accountCalls.length,1);
});

test("Review cannot adopt another employee identity or run while a write is in flight",async()=>{
 const f=fixture();await f.save();await f.verify();
 f.refs.activeEditingUser.current={...before,id:"another"};
 f.accept();
 assert.equal(f.state.write.stage,"review");
 f.refs.activeEditingUser.current=before;
 f.refs.userUpdateInFlight.current=true;
 f.accept();
 assert.equal(f.state.write.stage,"review");
});

test("Synthetic Account recovery UI discloses field names but no values or automatic writes",()=>{
 assert.match(source,/Account save outcome needs verification/);
 assert.match(source,/Read latest Account \(no writes\)/);
 assert.match(source,/Adopt verified baseline; keep my draft/);
 assert.match(source,/No automatic Account retry will occur/);
 assert.match(source,/disabled=\{userMutationSaving \|\| hrMutationSaving \|\| hrReloadLoading \|\| hasUnsavedHrData \|\| !!accountSaveRecovery \|\| !!accountWriteRecovery/);
 assert.doesNotMatch(code.verify,/updateAuthorizedUserAdmin|setPasswordFn/);
 assert.doesNotMatch(code.accept,/updateAuthorizedUserAdmin|setPasswordFn/);
 assert.doesNotMatch(JSON.stringify(compareUnverifiedAccountSave({baseline:before,attempted,latest:target})),/synthetic-pass/);
});
