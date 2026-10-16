// Synthetic read-only Account write recovery. Executes the shipping Admin
// handlers with isolated test records; no Base44 access or live writes.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createAdminAccountDraft, getChangedAdminAccountFields, hasUnsavedAdminAccountDraft } from "../src/components/admin/adminAccountDraft.js";
import { compareUnverifiedAccountSave, rebaseAppliedAccountDraft, isSameVerifiedAccountSnapshot } from "../src/components/admin/unverifiedAccountSave.js";
import { planAccountFieldResolution } from "../src/components/admin/accountFieldResolution.js";
import { rejectedAdminAccountField } from "../src/components/admin/accountSaveConflict.js";

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
  passwordCalls:[],accountCalls:[],readCalls:0,approvalReads:0,approvalResponse:undefined,readResponse:[target],
  reads:[],approvalReplies:[],accounts:[],notice:"",error:"",loading:false,dirtyHr:false,
  directoryError:false,mutationSaving:false,confirmed:false,choices:{},dialog:true
 };
 const scope={
  ...refs,createAdminAccountDraft,getChangedAdminAccountFields,hasUnsavedAdminAccountDraft,
  compareUnverifiedAccountSave,rebaseAppliedAccountDraft,isSameVerifiedAccountSnapshot,
  rejectedAdminAccountField,
  planAccountFieldResolution,
  get sessionToken(){return token;},get editingUser(){return state.editor;},
  get formData(){return state.form;},get accountSaveRecovery(){return state.password;},
  get accountWriteRecovery(){return state.write;},
  get confirmAccountReconciliation(){return state.confirmed;},
  get accountResolutionPreview(){return state.write?.stage==="review" &&
    state.write?.comparison?.status!=="applied"
    ? planAccountFieldResolution({baseline:state.write.baseline,attempted:state.write.attempted,
      latest:state.write.latest,draft:state.form,choices:state.choices}) : null;},
  get isLoading(){return state.loading;},
  get userDirectoryError(){return state.directoryError;},
  hasProtectedHrDraft:()=>state.dirtyHr,
  setAccountSaveNotice:v=>{state.notice=v;},
  setUserMutationError:v=>{state.error=v;},
  setUserMutationSaving:v=>{state.mutationSaving=v;},
  setAccountWriteRecovery:v=>{state.write=v;},
  setAccountSaveRecovery:v=>{state.password=v;},
  setConfirmAccountReconciliation:v=>{state.confirmed=v;},
  setAccountFieldChoices:v=>{state.choices=typeof v==="function"?v(state.choices):v;},
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
  listAuthorizedUsersAdmin:()=>{
    state.approvalReads++;
    const next=state.approvalReplies.shift();
    return next?next.promise:Promise.resolve(state.approvalResponse===undefined?state.readResponse:state.approvalResponse);
  },
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
 await f.accept();
 assert.equal(f.state.write,null);
 assert.equal(f.refs.accountDraftBaseline.current.values.full_name,target.full_name);
 assert.equal(f.state.editor.updated_date,target.updated_date);
 assert.equal(f.state.form.password_hash,originalDraft.password_hash);
 assert.equal(f.state.password.passwordNotSent,true);
 assert.equal(f.state.accountCalls.length,1);
});

test("Read matches requested edits but preserves post-click local changes",async()=>{
 const f=fixture();await f.save();f.draft({username:"my-newer-edit"});
 await f.verify();await f.accept();
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
  await f.accept();
  assert.equal(f.state.write.stage,"review");
  assert.equal(f.state.editor.updated_date,before.updated_date);
  f.state.confirmed=true;await f.accept();
  assert.equal(f.state.write,null);
  assert.equal(f.state.form.full_name,status==="unchanged"?before.full_name:target.full_name);
  assert.equal(f.state.form.password_hash,originalDraft.password_hash);
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.passwordCalls.length,0);
 });
}

test("Field review keeps individual latest/mine choices without rewriting the Account",async()=>{
 const f=fixture();await f.save();
 // The full name landed, but an import/export grant did not.
 f.state.readResponse=[{...target,can_import_export:false,username:"remote-only-username"}];
 await f.verify();
 assert.equal(f.state.write.comparison.status,"mixed");
 f.state.choices={can_import_export:"mine",full_name:"latest"};
 f.state.confirmed=true;await f.accept();
 assert.equal(f.state.form.full_name,target.full_name);
 assert.equal(f.state.form.can_import_export,true);
 assert.equal(f.state.form.username,"remote-only-username");
 assert.equal(f.state.form.password_hash,originalDraft.password_hash);
 assert.equal(f.refs.accountDraftBaseline.current.values.can_import_export,false);
 assert.equal(f.state.choices && Object.keys(f.state.choices).length,0);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
});

test("One chosen conflicting personal-detail field leaves other latest Account data alone",async()=>{
 const f=fixture();await f.save();
 f.state.readResponse=[{...target,full_name:"Another person's edit",
   username:"Remote username",can_import_export:false}];
 await f.verify();
 assert.equal(f.state.write.comparison.status,"mixed");
 f.state.choices={full_name:"mine"};
 f.state.confirmed=true;await f.accept();
 assert.equal(f.state.form.full_name,target.full_name);
 assert.equal(f.state.form.username,"Remote username");
 assert.equal(f.state.form.can_import_export,false);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 assert.match(f.state.notice,/local draft only/);
});

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
 await f.accept();
 assert.equal(f.state.write.stage,"review");
 f.refs.activeEditingUser.current=before;
 f.refs.userUpdateInFlight.current=true;
 await f.accept();
 assert.equal(f.state.write.stage,"review");
});

test("Snapshot comparison rejects version changes and sensitive permission changes even with same version",()=>{
 assert.equal(isSameVerifiedAccountSnapshot(target,{...target}),true);
 assert.equal(isSameVerifiedAccountSnapshot(target,{...target,sales_roles:["Designer"]}),true);
 for(const record of [
  {...target,updated_date:"version-3"},
  {...target,role:"admin"},
  {...target,can_order_export:true},
  {...target,can_view_resources:true},
  {...target,can_import_export:false},
  {...target,can_work_pause:true},
  {...target,employment_type:"salary"},
  {...target,username:"other-login"},
  {...target,id:"another"},
  {...target,email:"other@example.invalid"},
  {...target,updated_date:""},
  null
 ]){
  assert.equal(isSameVerifiedAccountSnapshot(target,record),false);
 }
 const matchingRoles={...target,sales_roles:["Estimator","Designer"]};
 assert.equal(isSameVerifiedAccountSnapshot(
  {...target,sales_roles:["Designer","Estimator"]},matchingRoles),true);
});

for(const [name,change] of [
 ["version",row=>({...row,updated_date:"version-3"})],
 ["privilege promotion",row=>({...row,role:"admin"})],
 ["role demotion",row=>({...row,role:"user",can_view_resources:false})],
 ["Order Form export revocation",row=>({...row,can_order_export:false})],
 ["Resources permission",row=>({...row,can_view_resources:true})],
 ["Import/export permission",row=>({...row,can_import_export:true})],
 ["Sales Pipeline roles",row=>({...row,sales_roles:["Installer"]})],
 ["unchanged version but different username",row=>({...row,username:"different"})]
]){
 test(`Concurrent ${name} between preview and approval requires new review without applying choices`,async()=>{
  const f=fixture();await f.save();
  f.state.readResponse=[{...target,can_import_export:false,
    ...(["role demotion","Order Form export revocation"].includes(name)
      ? {role:"admin",can_view_resources:true,can_order_export:true} : {})}];
  await f.verify();
  f.state.choices={can_import_export:"mine"};
  f.state.confirmed=true;
  const priorDraft={...f.state.form};
  const priorBaseline=f.refs.accountDraftBaseline.current;
  f.state.approvalResponse=[change(f.state.readResponse[0])];
  await f.accept();
  assert.equal(f.state.approvalReads,1);
  assert.equal(f.state.write.stage,"needs_read");
  assert.equal(f.state.write.latest,null);
  assert.equal(f.state.write.comparison,null);
  assert.equal(f.state.confirmed,false);
  assert.deepEqual(f.state.choices,{});
  assert.deepEqual(f.state.form,priorDraft);
  assert.equal(f.refs.accountDraftBaseline.current,priorBaseline);
  assert.equal(f.state.editor.updated_date,before.updated_date);
  assert.equal(f.state.passwordCalls.length,0);
  assert.equal(f.state.accountCalls.length,1);
  assert.match(f.state.error,/No choices were applied/);
 });
}

test("Approval refuses missing, duplicate, misidentified and unversioned fresh records",async()=>{
 for(const value of [null,[],[target,target],
  [{...target,id:"someone-else"}],[{...target,email:"other@example.invalid"}],
  [{...target,updated_date:""}]]){
  const f=fixture();await f.save();await f.verify();
  f.state.approvalResponse=value;
  await f.accept();
  assert.equal(f.state.write.stage,"needs_read");
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.passwordCalls.length,0);
  assert.equal(f.state.form.password_hash,originalDraft.password_hash);
 }
});

test("Approval failure preserves password, role, permissions and chosen draft, requiring another review",async()=>{
 const f=fixture();await f.save();
 const privileged={...target,role:"admin",can_view_resources:true};
 f.state.readResponse=[privileged];
 await f.verify();
 f.state.confirmed=true;
 f.state.choices={can_import_export:"mine"};
 f.draft({role:"admin",can_order_export:true,can_view_resources:true});
 const preserved={...f.state.form};
 const request=deferred();f.state.approvalReplies.push(request);
 const pending=f.accept();
 request.reject(new Error("Read timed out"));
 await pending;
 assert.deepEqual(f.state.form,preserved);
 assert.equal(f.state.write.stage,"needs_read");
 assert.equal(f.state.passwordCalls.length,0);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.confirmed,false);
});

test("Duplicate approval clicks cause exactly one authorized read and no writes",async()=>{
 const f=fixture();await f.save();await f.verify();
 const read=deferred();f.state.approvalReplies.push(read);
 const first=f.accept(),second=f.accept();
 assert.equal(f.state.approvalReads,1);
 assert.equal(f.refs.userUpdateInFlight.current,true);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 read.resolve([target]);
 await first;await second;
 assert.equal(f.state.approvalReads,1);
 assert.equal(f.state.write,null);
 assert.equal(f.refs.userUpdateInFlight.current,false);
});

test("Replaced session during approval cannot adopt an old Account or dismiss review",async()=>{
 const f=fixture();await f.save();await f.verify();
 const read=deferred();f.state.approvalReplies.push(read);
 const pending=f.accept();
 f.refs.activeSessionToken.current="new-session";
 read.resolve([target]);await pending;
 assert.equal(f.state.write.stage,"review");
 assert.equal(f.state.editor.updated_date,before.updated_date);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
});

test("Changes typed after approval begins cannot be silently overwritten",async()=>{
 const f=fixture();await f.save();await f.verify();
 const read=deferred();f.state.approvalReplies.push(read);
 const pending=f.accept();
 f.draft({full_name:"Typed during approval",role:"admin",can_order_export:true});
 read.resolve([target]);await pending;
 assert.equal(f.state.write.stage,"needs_read");
 assert.equal(f.state.form.full_name,"Typed during approval");
 assert.equal(f.state.form.role,"admin");
 assert.equal(f.state.form.can_order_export,true);
 assert.equal(f.state.passwordCalls.length,0);
 assert.equal(f.state.accountCalls.length,1);
});

test("Approval succeeds when a fresh Account read semantically matches with new array order",async()=>{
 const f=fixture();await f.save();await f.verify();
 f.state.approvalResponse=[{...target,sales_roles:["Designer"]}];
 await f.accept();
 assert.equal(f.state.write,null);
 assert.equal(f.state.editor.updated_date,target.updated_date);
 assert.equal(f.state.approvalReads,1);
 assert.equal(f.state.accountCalls.length,1);
});

test("Failed approval can reverify and make newly reviewed choices later",async()=>{
 const f=fixture();await f.save();await f.verify();
 f.state.approvalResponse=[{...target,role:"admin",can_view_resources:true,updated_date:"version-3"}];
 await f.accept();
 assert.equal(f.state.write.stage,"needs_read");
 f.state.readResponse=f.state.approvalResponse;
 await f.verify();
 assert.equal(f.state.write.stage,"review");
 // The refreshed review is now the only valid base.
 f.state.confirmed=true;
 await f.accept();
 assert.equal(f.state.write,null);
 assert.equal(f.state.editor.updated_date,"version-3");
 assert.equal(f.state.form.role,"admin");
 assert.equal(f.state.accountCalls.length,1);
});

test("Synthetic Account recovery UI discloses field names but no values or automatic writes",()=>{
 assert.match(source,/Account save outcome needs verification/);
 assert.match(source,/Read latest Account \(no writes\)/);
 assert.match(source,/Apply reviewed field choices \(local only\)/);
 assert.match(source,/No automatic Account retry will occur/);
 assert.match(source,/disabled=\{userMutationSaving \|\| hrMutationSaving \|\| hrReloadLoading \|\| hasUnsavedHrData \|\| !!accountSaveRecovery \|\| !!accountWriteRecovery/);
 assert.doesNotMatch(code.verify,/updateAuthorizedUserAdmin|setPasswordFn/);
 assert.doesNotMatch(code.accept,/updateAuthorizedUserAdmin|setPasswordFn/);
 assert.doesNotMatch(JSON.stringify(compareUnverifiedAccountSave({baseline:before,attempted,latest:target})),/synthetic-pass/);
});
