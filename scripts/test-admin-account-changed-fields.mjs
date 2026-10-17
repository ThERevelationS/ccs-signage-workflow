// Isolated Admin Account changed-field payload regression tests.
// Executes the shipping handler with synthetic data and no production calls.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
 createAdminAccountDraft, getChangedAdminAccountFields,
 hasUnsavedAdminAccountDraft
} from "../src/components/admin/adminAccountDraft.js";
import { rejectedAdminAccountField } from "../src/components/admin/accountSaveConflict.js";
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from "../base44/shared/authorizedEmailCredentialPersistence.mjs";
import { compareUnverifiedAccountSave, isSameVerifiedAccountSnapshot } from "../src/components/admin/unverifiedAccountSave.js";
import { planAccountFieldResolution } from "../src/components/admin/accountFieldResolution.js";

const source=readFileSync("src/components/admin/UserManagement.jsx","utf8");
const persistence=readFileSync("src/components/admin/authorizedUserAdminPersistence.js","utf8");
const backend=readFileSync("base44/functions/manageAuthorizedUsers/entry.ts","utf8");
const start=source.indexOf("  const handleSave = async () => {");
const end=source.indexOf("  const verifyInterruptedAccountSave = async () => {",start);
assert.ok(start>=0 && end>start);
const handler=source.slice(start,end).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
const retryStart=source.indexOf("  const retryPostSaveDirectoryRefresh = async () => {");
const retryEnd=source.indexOf("  const acceptPostSaveAccountReview = async () => {",retryStart);
assert.ok(retryStart>=0&&retryEnd>retryStart,"shipping read-only retry handler exists");
const retrySource=source.slice(retryStart,retryEnd).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
const approveStart=retryEnd;
const approveEnd=source.indexOf("\n\n  return (\n    <div",approveStart);
assert.ok(approveEnd>approveStart);
const approveSource=source.slice(approveStart,approveEnd).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
const compile=(code,scope)=>new Function("scope",`with(scope){return (${code})}`)(scope);
const token="synthetic-admin-session";
const original={
 id:"synthetic-user",email:"synthetic@example.invalid",updated_date:"version-one",
 full_name:"Synthetic Employee",username:"synthetic",
 role:"user",sales_roles:["Designer","Estimator"],
 can_import_export:false,can_order_export:false,can_view_resources:false,
 employment_type:"hourly",can_work_pause:false
};
const wait=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function fixture({record=original,changes={},passwordResult={data:{success:true}},remoteChanges={}}={}){
 const initial={...createAdminAccountDraft(record),...changes};
 const refs={
  activeSessionToken:{current:token},activeEditingUser:{current:record},
  activeAccountDraft:{current:initial},
  accountDraftBaseline:{current:{id:record.id,email:record.email,sessionToken:token,
   values:createAdminAccountDraft(record)}},
  userUpdateInFlight:{current:false},userUpdateOwner:{current:null},
  userLoadSequence:{current:0},hrSaveInFlight:{current:false},
  hrReloadInFlight:{current:false},deletionInFlight:{current:false}
 };
 const state={
  form:initial,editor:record,users:[record],dialog:true,error:"",notice:"",
  accountCalls:[],passwordCalls:[],readCalls:0,recovery:null,writeRecovery:null,hrDirty:false,
  mutationSaving:false,backendRecord:{...record,...remoteChanges},passwordResult,
  refreshPending:null,confirmed:false,choices:{},approvalRows:undefined,approvalDeferred:null,refreshRows:undefined,accountDeferred:null,passwordDeferred:null,readDeferred:null
 };
 const scope={...refs,
  createAdminAccountDraft,getChangedAdminAccountFields,hasUnsavedAdminAccountDraft,
  rejectedAdminAccountField,compareUnverifiedAccountSave,isSameVerifiedAccountSnapshot,
  get editingUser(){return state.editor;},get formData(){return state.form;},
  get sessionToken(){return token;},
  get accountSaveRecovery(){return state.recovery;},
  get accountWriteRecovery(){return state.writeRecovery;},
  get postSaveRefreshPending(){return state.refreshPending;},
  get postSaveResolutionPreview(){
   const pending=state.refreshPending;
   return pending?.stage==="review" && pending.latest && pending.saved
    ? planAccountFieldResolution({baseline:pending.saved,attempted:pending.attempted,
        latest:pending.latest,draft:state.form,choices:state.choices}) : null;
  },
  get confirmAccountReconciliation(){return state.confirmed;},
  isLoading:false,userDirectoryError:false,
  hasProtectedHrDraft:()=>state.hrDirty,
  setUserMutationError:value=>{state.error=value;},
  setAccountSaveNotice:value=>{state.notice=value;},
  setPostSaveRefreshPending:value=>{state.refreshPending=value;},
  setUserMutationSaving:value=>{state.mutationSaving=value;},
  setAccountSaveRecovery:value=>{state.recovery=value;},
  setAccountWriteRecovery:value=>{state.writeRecovery=value;},
  setConfirmAccountReconciliation:value=>{state.confirmed=value;},
  setAccountFieldChoices:value=>{state.choices=typeof value==="function"?value(state.choices):value;},
  setPasswordRetryConfirmed:()=>{},
  setUsers:value=>{state.users=typeof value==="function"?value(state.users):value;},
  setEditingUser:value=>{
   state.editor=typeof value==="function"?value(state.editor):value;
   refs.activeEditingUser.current=state.editor;
  },
  setFormData:value=>{
   state.form=typeof value==="function"?value(state.form):value;
   refs.activeAccountDraft.current=state.form;
  },
  setIsDialogOpen:value=>{state.dialog=value;},
  clearEditorDraftTracking:()=>{refs.accountDraftBaseline.current=null;},
  loadUsers:()=>{
   state.readCalls++;
   return state.readDeferred?state.readDeferred.promise:Promise.resolve(
     state.refreshRows===undefined?state.users:state.refreshRows);
  },
  updateAuthorizedUserAdmin:options=>{
   state.accountCalls.push(options);
   if(state.accountDeferred)return state.accountDeferred.promise;
   // Simulate the existing server-side field-scoped CAS. Changes on fields
   // outside the patch do not block or get overwritten by the write.
   for(const [key,value] of Object.entries(options.nextFields)){
    const before=options.record[key];
    const now=state.backendRecord[key];
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    if(!same(now,before)&&!same(now,value)){
     throw new Error(`Authorized user changed in another session (${key}). Reload before saving.`);
    }
   }
   const saved={...state.backendRecord,...options.nextFields,updated_date:"version-two"};
   if(saved.role==="admin")saved.can_view_resources=true;
   if(saved.role==="user")saved.can_order_export=false;
   state.backendRecord=saved;
   return Promise.resolve(saved);
  },
  listAuthorizedUsersAdmin:()=>state.approvalDeferred
    ? state.approvalDeferred.promise
    : Promise.resolve(state.approvalRows===undefined?[state.backendRecord]:state.approvalRows),
  setPasswordFn:options=>{
   state.passwordCalls.push(options);
   if(state.passwordDeferred)return state.passwordDeferred.promise;
   return Promise.resolve(state.passwordResult);
  }
 };
 return {state,refs,save:compile(handler,scope),retry:compile(retrySource,scope),approve:compile(approveSource,scope),edit:change=>{
  state.form={...state.form,...change};
  refs.activeAccountDraft.current=state.form;
 }};
}


test("Late Account edits during final directory read stay in the editor",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 const deferred=wait();f.state.readDeferred=deferred;
 const saving=f.save();await Promise.resolve();await Promise.resolve();
 assert.equal(f.state.readCalls,1);
 f.edit({username:"edited-during-refresh",can_import_export:true});
 deferred.resolve([f.state.backendRecord]);await saving;
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.editor.updated_date,"version-two");
 assert.equal(f.state.form.username,"edited-during-refresh");
 assert.equal(f.state.form.can_import_export,true);
 assert.equal(f.state.accountCalls.length,1);
 assert.match(f.state.notice,/Edits made while refreshing/);
});

test("Late password edits made during directory refresh are never silently discarded",async()=>{
 const f=fixture({changes:{full_name:"Saved Name",password_hash:"first-password-1234"}});
 const deferred=wait();f.state.readDeferred=deferred;
 const saving=f.save();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(f.state.readCalls,1);
 f.edit({password_hash:"newer-password-5678"});
 deferred.resolve([f.state.backendRecord]);await saving;
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.form.password_hash,"newer-password-5678");
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.passwordCalls[0].new_password,"first-password-1234");
});

test("Late HR draft while directory refresh is pending cannot be silently closed",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 const deferred=wait();f.state.readDeferred=deferred;
 const task=f.save();await Promise.resolve();await Promise.resolve();
 f.state.hrDirty=true;
 deferred.resolve([f.state.backendRecord]);await task;
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.editor?.id,original.id);
 assert.equal(f.state.refreshPending,null);
 assert.match(f.state.notice,/Edits made while refreshing/);
});

for(const [kind,rows] of [
 ["missing response",null],
 ["empty response",[]],
 ["duplicate matches",[{...original,updated_date:"v2"},{...original,updated_date:"v2"}]],
 ["unversioned match",[{...original,updated_date:""}]],
 ["different employee",[{...original,id:"another"}]]
]){
 test(`Confirmed Account saves keep the editor on ${kind} refresh`,async()=>{
  const f=fixture({changes:{full_name:"Saved Name"}});
  f.state.refreshRows=rows;
  await f.save();
  assert.equal(f.state.dialog,true);
  assert.notEqual(f.state.editor,null);
  assert.equal(f.state.refreshPending?.id,original.id);
  assert.equal(f.state.refreshPending?.email,original.email);
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.passwordCalls.length,0);
  assert.equal(f.refs.accountDraftBaseline.current?.values.full_name,"Saved Name");
  assert.match(f.state.error,/directory refresh could not be verified/);
 });
}

test("Unexpected directory read exception also preserves verified Account baseline",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 f.state.readDeferred={promise:Promise.reject(new Error("synthetic read failed"))};
 await f.save();
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.refreshPending?.id,original.id);
 assert.equal(f.refs.accountDraftBaseline.current?.values.full_name,"Saved Name");
 assert.equal(f.state.accountCalls.length,1);
});

test("Read-only retry clears refresh recovery without repeating writes",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 f.state.refreshRows=null;await f.save();
 assert.equal(f.state.refreshPending?.id,original.id);
 const saved={...f.state.backendRecord};
 f.state.refreshRows=[saved];await f.retry();
 assert.equal(f.state.refreshPending,null);
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.editor?.id,original.id);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 assert.equal(f.state.error,"");
 assert.match(f.state.notice,/directory verified/i);
});

test("Failed read-only retry preserves recovery and never resubmits Account writes",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 f.state.refreshRows=null;await f.save();
 const previous=f.state.form;
 await f.retry();
 assert.equal(f.state.refreshPending?.id,original.id);
 assert.equal(f.state.form,previous);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 assert.match(f.state.error,/still not verified/);
 await f.save();
 assert.equal(f.state.accountCalls.length,1);
 assert.match(f.state.error,/confirmed save must not be submitted again/);
});

test("Read-only retry cannot adopt a stale employee or session",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 f.state.refreshRows=null;await f.save();
 const pending=wait();f.state.readDeferred=pending;
 const task=f.retry();
 f.refs.activeSessionToken.current="new-session";
 pending.resolve([f.state.backendRecord]);await task;
 assert.equal(f.state.refreshPending?.id,original.id);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
});

test("Read-only refresh retries are fenced against duplicate clicks",async()=>{
 const f=fixture({changes:{full_name:"Saved Name"}});
 f.state.refreshRows=null;await f.save();
 const d=wait();f.state.readDeferred=d;
 const a=f.retry(),b=f.retry();
 assert.equal(f.state.readCalls,2);
 d.resolve([f.state.backendRecord]);await a;await b;
 assert.equal(f.state.refreshPending,null);
 assert.equal(f.state.readCalls,2);
 assert.equal(f.state.accountCalls.length,1);
});

test("Directory refresh failure after a confirmed password clears only the sent password",async()=>{
 const f=fixture({changes:{password_hash:"confirmed-password-1234"}});
 f.state.refreshRows=null;await f.save();
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.refreshPending?.id,original.id);
 assert.equal(f.state.form.password_hash,"");
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.accountCalls.length,0);
 await f.retry();
 assert.equal(f.state.passwordCalls.length,1);
});

test("Later unsent password edits survive a failed directory read",async()=>{
 const f=fixture({changes:{password_hash:"sent-password-1234"}});
 const d=wait();f.state.readDeferred=d;
 const active=f.save();await Promise.resolve();await Promise.resolve();
 f.edit({password_hash:"different-password-5678"});
 d.resolve(null);await active;
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.form.password_hash,"different-password-5678");
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.accountCalls.length,0);
});

test("Two Account input changes before a React render retain both edits",()=>{
 const start=source.indexOf("  const changeAccountDraft = changes => {");
 const end=source.indexOf("\n  const [sendingPasswordReset",start);
 assert.ok(start>=0&&end>start);
 const code=source.slice(start,end).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
 const originalDraft=createAdminAccountDraft(original);
 const ref={current:originalDraft};
 const queued=[];
 const change=new Function("scope",`with(scope){return (${code})}`)({
  activeAccountDraft:ref,setFormData:value=>queued.push(value)
 });
 change({username:"new-username"});
 change({role:"admin",can_view_resources:true});
 change({sales_roles:["Designer","Estimator","Installer"]});
 assert.equal(queued.length,3);
 assert.equal(ref.current.username,"new-username");
 assert.equal(ref.current.role,"admin");
 assert.equal(ref.current.can_view_resources,true);
 assert.deepEqual(ref.current.sales_roles,["Designer","Estimator","Installer"]);
 assert.notEqual(ref.current,originalDraft);
});

test("Shipping input callbacks synchronously update Account draft reference",()=>{
 assert.match(source,/const changeAccountDraft = changes =>/);
 assert.match(source,/activeAccountDraft\.current = next;\s*setFormData\(next\)/);
 for(const key of ["full_name","username","password_hash","sales_roles",
  "role","employment_type","can_work_pause","can_import_export",
  "can_order_export","can_view_resources"]){
  assert.match(source,new RegExp(`changeAccountDraft\\(\\{[\\s\\S]*?${key}:`));
 }
 assert.match(source,/Retry directory read \(no writes\)/);
 assert.match(source,/onClick=\{retryPostSaveDirectoryRefresh\}/);
 assert.match(source,/!!postSaveRefreshPending \|\| isLoading/);
});

test("Exactly one edited detail is in the Account patch and password is excluded",async()=>{
 const f=fixture({changes:{full_name:"Different Name",password_hash:"synthetic-pass-1234"}});
 await f.save();
 assert.equal(f.state.accountCalls.length,1);
 assert.deepEqual(f.state.accountCalls[0].nextFields,{full_name:"Different Name"});
 assert.deepEqual(f.state.accountCalls[0].record,original);
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.passwordCalls[0].new_password,"synthetic-pass-1234");
 assert.equal(f.state.editor,null);
 assert.equal(f.state.dialog,false);
});

test("No Account changes and no password skip all writes",async()=>{
 const f=fixture();await f.save();
 assert.equal(f.state.accountCalls.length,0);
 assert.equal(f.state.passwordCalls.length,0);
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.readCalls,1);
});

test("Password-only change never writes Account and closes on confirmed password",async()=>{
 const f=fixture({changes:{password_hash:"synthetic-pass-1234"}});await f.save();
 assert.equal(f.state.accountCalls.length,0);
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.passwordCalls[0].user_email,original.email);
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.readCalls,1);
});

test("Password-only uncertain result retains draft with accurate recovery label",async()=>{
 const f=fixture({changes:{password_hash:"synthetic-pass-1234"},
  passwordResult:{data:{success:false}}});
 await f.save();
 assert.equal(f.state.accountCalls.length,0);
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.form.password_hash,"synthetic-pass-1234");
 assert.equal(f.state.recovery.accountUnchanged,true);
 assert.equal(f.state.recovery.updated_date,original.updated_date);
 assert.equal(f.state.dialog,true);
 assert.match(f.state.error,/No Account fields required updating/);
 assert.match(source,/Account unchanged; Time Clock password outcome unverified/);
});

test("Two reordered or duplicated Sales roles are semantically unchanged",async()=>{
 const f=fixture({changes:{sales_roles:["Estimator","Designer","Designer"]}});
 await f.save();
 assert.equal(f.state.accountCalls.length,0);
 assert.equal(f.state.dialog,false);
 const patch=getChangedAdminAccountFields(original,{...createAdminAccountDraft(original),
  sales_roles:["Estimator","Designer","Designer"]});
 assert.deepEqual(patch,{});
});

test("One changed Sales assignment is sent without modifying unrelated permissions",async()=>{
 const f=fixture({changes:{sales_roles:["Designer","Fabricator"]},
  remoteChanges:{can_import_export:true}});
 await f.save();
 assert.deepEqual(f.state.accountCalls[0].nextFields,
  {sales_roles:["Designer","Fabricator"]});
 assert.equal(f.state.backendRecord.can_import_export,true);
 assert.equal(f.state.backendRecord.role,"user");
 assert.equal(f.state.passwordCalls.length,0);
});

test("Only selected changed permissions are sent, preserving concurrent unrelated edits",async()=>{
 const f=fixture({changes:{can_work_pause:true},
  remoteChanges:{can_import_export:true,employment_type:"salary",full_name:"Remote Rename"}});
 await f.save();
 assert.deepEqual(f.state.accountCalls[0].nextFields,{can_work_pause:true});
 assert.equal(f.state.backendRecord.can_work_pause,true);
 assert.equal(f.state.backendRecord.can_import_export,true);
 assert.equal(f.state.backendRecord.employment_type,"salary");
 assert.equal(f.state.backendRecord.full_name,"Remote Rename");
});

test("Conflicting changed field is still rejected by server CAS and draft is protected",async()=>{
 const f=fixture({changes:{full_name:"My New Name"},
  remoteChanges:{full_name:"Their New Name"}});
 await f.save();
 assert.deepEqual(f.state.accountCalls[0].nextFields,{full_name:"My New Name"});
 assert.equal(f.state.writeRecovery.stage,"review");
 assert.equal(f.state.writeRecovery.rejectedField,"full_name");
 assert.equal(f.state.form.full_name,"My New Name");
 assert.equal(f.state.backendRecord.full_name,"Their New Name");
 assert.equal(f.state.passwordCalls.length,0);
});

test("Admin promotion carries only actual role/resources changes; server remains final authority",async()=>{
 const f=fixture({changes:{role:"admin",can_view_resources:true}});
 await f.save();
 assert.deepEqual(f.state.accountCalls[0].nextFields,
  {role:"admin",can_view_resources:true});
 assert.equal(f.state.backendRecord.role,"admin");
 assert.equal(f.state.backendRecord.can_view_resources,true);
 assert.equal(f.state.backendRecord.can_order_export,false);
});

test("Demotion includes changed role/export permission for server final-admin checks",async()=>{
 const admin={...original,role:"admin",can_view_resources:true,can_order_export:true};
 const f=fixture({record:admin,changes:{role:"user",can_order_export:false}});
 await f.save();
 assert.deepEqual(f.state.accountCalls[0].nextFields,{role:"user",can_order_export:false});
 assert.equal(f.state.backendRecord.role,"user");
 assert.equal(f.state.backendRecord.can_order_export,false);
});

test("Pure helper excludes unknown fields, IDs, HR and password and refuses incomplete record",()=>{
 const draft={...createAdminAccountDraft(original),full_name:"Updated",
  password_hash:"not-to-be-sent",hr_data:{salary:999},
  id:"spoofed",email:"spoofed@example.invalid",admin_flag:true};
 const patch=getChangedAdminAccountFields(original,draft);
 assert.deepEqual(patch,{full_name:"Updated"});
 assert.equal(JSON.stringify(patch).includes("not-to-be-sent"),false);
 assert.throws(()=>getChangedAdminAccountFields({...original,updated_date:""},draft),/verified/);
 assert.throws(()=>getChangedAdminAccountFields(original,{full_name:"Updated"}),/complete/);
});

test("Patch arrays are isolated from the draft and do not mutate saved roles",()=>{
 const edited={...createAdminAccountDraft(original),sales_roles:["Fabricator","Designer","Fabricator"]};
 const prior=JSON.stringify(edited),originalSnapshot=JSON.stringify(original);
 const patch=getChangedAdminAccountFields(original,edited);
 assert.deepEqual(patch.sales_roles,["Fabricator","Designer"]);
 patch.sales_roles.push("Painter");
 assert.equal(JSON.stringify(edited),prior);
 assert.equal(JSON.stringify(original),originalSnapshot);
});

test("Account-save controls keep server-side role restrictions and field-scoped expectations",()=>{
 assert.match(persistence,/Object\.keys\(desired\)\.map\(\(field\) => \[field, record\?\.\[field\]\]\)/);
 assert.match(backend,/const desired = cleanManagedFields\(body\?\.next_fields\)/);
 assert.match(backend,/if \(desired\.role === 'user'\) desired\.can_order_export = false/);
 assert.match(backend,/if \(out\.role === 'admin'\) out\.can_view_resources = true/);
 assert.match(backend,/await ensureAnotherAdminExists\(AuthorizedEmail, id\)/);
 assert.match(backend,/replaceAuthorizedEmailCredentialFieldsIfUnchanged/);
 assert.match(source,/const changedFields = getChangedAdminAccountFields\(record, dataToSave\)/);
 assert.match(source,/nextFields: changedFields/);
 assert.match(source,/accountWriteSent = Object\.keys\(changedFields\)\.length > 0/);
});

test("Role-bound permissions keep the role as a conditional guard, not a write field",()=>{
 assert.match(persistence,/permissionDependsOnRole = \["can_order_export", "can_view_resources"\]/);
 assert.match(persistence,/expected_role: record.role/);
 assert.match(backend,/const roleBoundPermission = Object\.prototype\.hasOwnProperty\.call\(desired, 'can_order_export'\)/);
 assert.match(backend,/expectedRole && expectedRole !== current.role/);
 assert.match(backend,/role: expectedRole \|\| current.role/);
 assert.match(backend,/Administrator Resources access cannot be disabled/);
});

test("Synthetic conditional permission update refuses role changed before read",async()=>{
 let writes=0;
 const current={...original,role:"user",can_order_export:false};
 const entity={
  get:async()=>({...current}),
  updateMany:async()=>{writes++;return {updated:1};}
 };
 await assert.rejects(
  replaceAuthorizedEmailCredentialFieldsIfUnchanged({
   entity,user:{id:current.id,can_order_export:false},
   nextFields:{can_order_export:true},guardFields:{email:current.email,role:"admin"},
   label:"Synthetic role-dependent permission"
  }),
  /changed in another session \(role\)/
 );
 assert.equal(writes,0);
 assert.equal(current.can_order_export,false);
});

test("Synthetic role switch between read and write cannot grant Order Form export",async()=>{
 let current={...original,role:"admin",can_view_resources:true,updated_date:"v1"};
 let attempts=0;
 const entity={
  get:async()=>({...current}),
  updateMany:async()=>{
   attempts++;
   // Concurrent demotion wins the CAS race. The permission update writes 0.
   current={...current,role:"user",updated_date:"v2"};
   return {updated:0};
  }
 };
 await assert.rejects(
  replaceAuthorizedEmailCredentialFieldsIfUnchanged({
   entity,user:{id:current.id,can_order_export:false},
   nextFields:{can_order_export:true},guardFields:{email:current.email,role:"admin"},
   label:"Synthetic Order Form export"
  }),
  /changed in another session \(role\)/
 );
 assert.equal(attempts,1);
 assert.equal(current.can_order_export,false);
 assert.equal(current.role,"user");
});

test("Synthetic authorized admin export grant writes only the permission with verified role",async()=>{
 let current={...original,role:"admin",can_view_resources:true,updated_date:"v1"};
 let patch=null;
 const entity={
  get:async()=>({...current}),
  updateMany:async(query,update)=>{
   assert.deepEqual(query,{id:current.id,updated_date:"v1"});
   patch=update.$set;
   current={...current,...patch,updated_date:"v2"};
   return {updated:1};
  }
 };
 const saved=await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
  entity,user:{id:current.id,can_order_export:false},
  nextFields:{can_order_export:true},
  guardFields:{email:current.email,role:"admin"},
  label:"Synthetic authorized export"
 });
 assert.deepEqual(patch,{can_order_export:true});
 assert.equal(saved.can_order_export,true);
 assert.equal(saved.role,"admin");
});

test("Concurrent late local edit during password-only request remains in editor",async()=>{
 const f=fixture({changes:{password_hash:"synthetic-pass-1234"}});
 const pending=wait();f.state.passwordDeferred=pending;
 const task=f.save();
 f.edit({username:"newer-edit"});
 pending.resolve({data:{success:true}});
 await task;
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.form.username,"newer-edit");
 assert.equal(f.state.form.password_hash,"");
 assert.equal(f.state.accountCalls.length,0);
});

test("Concurrent local edit during Account write remains in editor",async()=>{
 const f=fixture({changes:{full_name:"My Name"}});
 const pending=wait();f.state.accountDeferred=pending;
 const task=f.save();
 f.edit({username:"typed while saving"});
 pending.resolve({...original,full_name:"My Name",updated_date:"version-two"});
 await task;
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.form.username,"typed while saving");
 assert.equal(f.state.accountCalls.length,1);
 assert.deepEqual(f.state.accountCalls[0].nextFields,{full_name:"My Name"});
});
