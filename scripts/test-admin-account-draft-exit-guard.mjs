// Isolated Account-tab draft protection tests. No live records or Base44 mutations.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createAdminAccountDraft, hasUnsavedAdminAccountDraft } from "../src/components/admin/adminAccountDraft.js";

const source=readFileSync("src/components/admin/UserManagement.jsx","utf8");
const token="synthetic-admin";
const employee={
 id:"emp-a",email:"a@example.invalid",updated_date:"v1",
 full_name:"Alex Example",username:"alex",role:"user",
 sales_roles:["Designer","Estimator"],employment_type:"hourly",
 can_import_export:false,can_order_export:false,can_view_resources:false,
 can_work_pause:false
};
const colleague={...employee,id:"emp-b",email:"b@example.invalid",
 full_name:"Blair Example",username:"blair",updated_date:"v2"};
function take(first,last) {
 const begin=source.indexOf(`  const ${first} = `);
 const end=source.indexOf(`  const ${last} = `,begin+10);
 assert.ok(begin>=0&&end>begin,`${first} in real source`);
 return source.slice(begin,end).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
}
const handlers={
 hr:take("hasProtectedHrDraft","hasProtectedAccountDraft"),
 account:take("hasProtectedAccountDraft","clearHrDraftTracking"),
 clearHr:take("clearHrDraftTracking","clearEditorDraftTracking"),
 clearBoth:take("clearEditorDraftTracking","hasProtectedEditorDraft"),
 close:take("requestCloseUserEditor","openEditUser"),
 open:take("openEditUser","confirmDiscardHrDraft"),
 confirm:take("confirmDiscardHrDraft","handleSendPasswordReset")
};
const compile=(fragment,scope)=>new Function("scope",`with(scope){return (${fragment})}`)(scope);

function setup() {
 const refs={
  activeSessionToken:{current:token},activeEditingUser:{current:employee},
  hrDraftStatus:{current:null},accountDraftBaseline:{current:{
   sessionToken:token,id:employee.id,email:employee.email,
   values:createAdminAccountDraft(employee)
  }},
  hrSaveInFlight:{current:false},hrReloadInFlight:{current:false},
  userUpdateInFlight:{current:false},deletionInFlight:{current:false}
 };
 const state={
  editor:employee,dialog:true,pending:null,loading:false,error:false,
  currentSession:token,users:[employee,colleague],
  formData:createAdminAccountDraft(employee),hrDirty:false,
  changedUser:false
 };
 const scope={
  ...refs,createAdminAccountDraft,hasUnsavedAdminAccountDraft,
  get editingUser(){return state.editor;},
  get formData(){return state.formData;},
  get isDialogOpen(){return state.dialog;},
  get sessionToken(){return state.currentSession;},
  get isLoading(){return state.loading;},
  get userDirectoryError(){return state.error;},
  get pendingHrExit(){return state.pending;},
  get users(){return state.users;},
  setAccountSaveRecovery:()=>{},setAccountWriteRecovery:()=>{},setConfirmAccountReconciliation:()=>{},setAccountFieldChoices:()=>{},setPasswordRetryConfirmed:()=>{},setAccountSaveNotice:()=>{},
  setPendingHrExit:v=>{state.pending=v;},
  setHasUnsavedHrData:v=>{state.hrDirty=typeof v==="function"?v(state.hrDirty):v;},
  setEditingUser:v=>{
   state.editor=typeof v==="function"?v(state.editor):v;
   refs.activeEditingUser.current=state.editor;
   state.changedUser=true;
  },
  setIsDialogOpen:v=>{state.dialog=v;},
  setFormData:v=>{state.formData=typeof v==="function"?v(state.formData):v;}
 };
 for(const [key,fragment] of Object.entries(handlers)) {
  const name={
   hr:"hasProtectedHrDraft",account:"hasProtectedAccountDraft",
   clearHr:"clearHrDraftTracking",clearBoth:"clearEditorDraftTracking",
   close:"requestCloseUserEditor",open:"openEditUser",confirm:"confirmDiscardHrDraft"
  }[key];
  scope[name]=compile(fragment,scope);
 }
 scope.hasProtectedEditorDraft=()=>scope.hasProtectedHrDraft()||scope.hasProtectedAccountDraft();
 const edit=changes=>{state.formData={...state.formData,...changes};};
 const markHr=()=>{refs.hrDraftStatus.current={dirty:true,id:employee.id,
   email:employee.email,sessionToken:token};state.hrDirty=true;};
 return {scope,refs,state,edit,markHr};
}

test("Account baseline matches every editable Account-tab field and excludes historical password",()=>{
 const baseline=createAdminAccountDraft(employee);
 assert.deepEqual(Object.keys(baseline).sort(),[
  "full_name","username","password_hash","role","sales_roles","can_import_export",
  "can_order_export","can_view_resources","employment_type","can_work_pause"
 ].sort());
 assert.equal(baseline.password_hash,"");
 assert.equal(hasUnsavedAdminAccountDraft(baseline,{...baseline}),false);
 assert.equal(hasUnsavedAdminAccountDraft(baseline,{...baseline,sales_roles:["Estimator","Designer"]}),false);
 assert.equal(hasUnsavedAdminAccountDraft(baseline,{...baseline,sales_roles:["Designer","Estimator","Estimator"]}),false);
 assert.equal(hasUnsavedAdminAccountDraft(baseline,{...baseline,sales_roles:["Designer"]}),true);
 assert.equal(hasUnsavedAdminAccountDraft({},null),true);
});

for(const [field,value] of [
 ["full_name","Updated synthetic name"],["username","updated"],
 ["role","admin"],["sales_roles",["Designer","Fabricator"]],
 ["can_import_export",true],["can_order_export",true],
 ["can_view_resources",true],["employment_type","salary"],
 ["can_work_pause",true],["password_hash","synthetic-pass-123"]
]){
 test(`Account ${field} edit requires confirmation before closing`,()=>{
  const f=setup();
  f.edit({[field]:value});
  assert.equal(f.scope.hasProtectedAccountDraft(),true);
  f.scope.requestCloseUserEditor();
  assert.equal(f.state.dialog,true);
  assert.equal(f.state.editor,employee);
  assert.equal(f.state.pending?.kind,"close");
  assert.equal(f.refs.accountDraftBaseline.current?.id,employee.id);
 });
}

test("Restored value and erased new password return to a clean Account draft",()=>{
 const f=setup();
 f.edit({full_name:"Different",password_hash:"synthetic-test-password"});
 assert.equal(f.scope.hasProtectedAccountDraft(),true);
 f.edit({full_name:employee.full_name,password_hash:""});
 assert.equal(f.scope.hasProtectedAccountDraft(),false);
 f.scope.requestCloseUserEditor();
 assert.equal(f.state.pending,null);
 assert.equal(f.state.dialog,false);
 assert.equal(f.refs.accountDraftBaseline.current,null);
});

test("Declining discard keeps Account state including unsaved role and password",()=>{
 const f=setup();f.edit({role:"admin",password_hash:"synthetic-test-password"});
 f.scope.requestCloseUserEditor();
 f.state.pending=null; // Keep editing/dismiss confirmation
 assert.equal(f.state.editor,employee);
 assert.equal(f.state.formData.role,"admin");
 assert.equal(f.state.formData.password_hash,"synthetic-test-password");
 assert.equal(f.scope.hasProtectedAccountDraft(),true);
});

test("Explicit confirmed discard closes editor and purges Account baseline",()=>{
 const f=setup();f.edit({can_work_pause:true,role:"admin"});
 const before=JSON.stringify(f.state.users);
 f.scope.requestCloseUserEditor();f.scope.confirmDiscardHrDraft();
 assert.equal(f.state.editor,null);
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.pending,null);
 assert.equal(f.refs.accountDraftBaseline.current,null);
 assert.equal(JSON.stringify(f.state.users),before);
});

test("Confirmed discard clears a typed Time Clock password from editor state",()=>{
 const f=setup();f.edit({password_hash:"synthetic-discard-password"});
 f.scope.requestCloseUserEditor();
 f.scope.confirmDiscardHrDraft();
 assert.equal(f.state.formData.password_hash,"");
 assert.equal(f.refs.accountDraftBaseline.current,null);
 assert.equal(f.state.dialog,false);
});

test("Switching user with unsaved Account details is confirmation-gated",()=>{
 const f=setup();f.edit({username:"newname",sales_roles:["Installer"]});
 f.scope.openEditUser(colleague);
 assert.equal(f.state.editor,employee);
 assert.equal(f.state.formData.username,"newname");
 assert.equal(f.state.pending?.targetId,colleague.id);
 f.scope.confirmDiscardHrDraft();
 assert.equal(f.state.editor,colleague);
 assert.equal(f.state.formData.full_name,colleague.full_name);
 assert.equal(f.scope.hasProtectedAccountDraft(),false);
 assert.equal(f.refs.accountDraftBaseline.current.id,colleague.id);
});

test("Switching user with a clean Account draft resets the baseline",()=>{
 const f=setup();
 f.scope.openEditUser(colleague);
 assert.equal(f.state.editor,colleague);
 assert.equal(f.state.pending,null);
 assert.equal(f.state.formData.password_hash,"");
 assert.equal(f.scope.hasProtectedAccountDraft(),false);
});

test("HR and Account simultaneous changes share one safe discard confirmation",()=>{
 const f=setup();f.markHr();f.edit({can_import_export:true});
 f.scope.requestCloseUserEditor();
 assert.equal(f.state.pending.kind,"close");
 assert.equal(f.state.dialog,true);
 f.scope.confirmDiscardHrDraft();
 assert.equal(f.refs.accountDraftBaseline.current,null);
 assert.equal(f.refs.hrDraftStatus.current,null);
 assert.equal(f.state.hrDirty,false);
});

test("Session and employee identity fence the Account dirty-check",()=>{
 const f=setup();f.edit({full_name:"Changed"});
 assert.equal(f.scope.hasProtectedAccountDraft(),true);
 f.refs.activeSessionToken.current="retired";
 assert.equal(f.scope.hasProtectedAccountDraft(),false);
 f.refs.activeSessionToken.current=token;
 f.refs.activeEditingUser.current=colleague;
 assert.equal(f.scope.hasProtectedAccountDraft(),false);
});

test("Confirmation cannot cross sessions or save operations",()=>{
 for(const mode of ["session","identity","updated","reload","saving"]){
  const f=setup();f.edit({role:"admin"});
  f.scope.openEditUser(colleague);
  if(mode==="session")f.refs.activeSessionToken.current="retired";
  if(mode==="identity")f.refs.activeEditingUser.current=colleague;
  if(mode==="updated")f.state.users=[employee,{...colleague,updated_date:"v3"}];
  if(mode==="reload")f.refs.hrReloadInFlight.current=true;
  if(mode==="saving")f.refs.userUpdateInFlight.current=true;
  f.scope.confirmDiscardHrDraft();
  assert.equal(f.state.editor,employee,mode);
  assert.equal(f.refs.accountDraftBaseline.current.id,employee.id,mode);
 }
});

test("Same employee selection cannot silently reset an Account draft",()=>{
 const f=setup();f.edit({full_name:"Edited"});
 f.scope.openEditUser(employee);
 assert.equal(f.state.formData.full_name,"Edited");
 assert.equal(f.state.pending,null);
 assert.equal(f.scope.hasProtectedAccountDraft(),true);
});

test("Account draft reset on current-session save and session change is explicit",()=>{
 assert.match(source,/accountDraftBaseline\.current = null;\s*setHasUnsavedHrData\(false\);/);
 assert.match(source,/return \(\) => \{[\s\S]*?accountDraftBaseline\.current = null/);
 assert.match(source,/clearEditorDraftTracking\(\);\s*setIsDialogOpen\(false\);\s*setEditingUser\(null\);/);
 assert.match(source,/hasProtectedEditorDraft\(\)/);
 assert.match(source,/hasUnsavedAccountData = isDialogOpen && hasProtectedAccountDraft\(\)/);
 assert.match(source,/Unsaved Account changes are protected/);
 assert.match(source,/Discard unsaved employee changes\?/);
 assert.match(source,/Discard unsaved changes/);
});

test("Account draft protection doesn't block legitimate Account saves",()=>{
 const f=setup();f.edit({role:"admin"});
 assert.equal(f.scope.hasProtectedHrDraft(),false);
 assert.equal(f.scope.hasProtectedAccountDraft(),true);
 assert.match(source,/if \(hasProtectedHrDraft\(\)\) \{[\s\S]*?const requestedPassword/);
 assert.match(source,/disabled=\{userMutationSaving \|\| hrMutationSaving \|\| hrReloadLoading \|\| hasUnsavedHrData \|\| !!accountSaveRecovery \|\| !!accountWriteRecovery \|\| isLoading/);
});
