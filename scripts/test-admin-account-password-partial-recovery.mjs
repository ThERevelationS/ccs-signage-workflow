// Synthetic, isolated Admin Account + Time Clock password partial-save tests.
// Executes the shipping handlers with deferred mock responses; no production API calls.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createAdminAccountDraft,hasUnsavedAdminAccountDraft} from "../src/components/admin/adminAccountDraft.js";

const source=readFileSync("src/components/admin/UserManagement.jsx","utf8");
const old={id:"synthetic-user",email:"employee@example.invalid",updated_date:"before",
 username:"worker",full_name:"Synthetic Employee",role:"user",sales_roles:["Designer"],
 can_import_export:false,can_order_export:false,can_view_resources:false,
 employment_type:"hourly",can_work_pause:false};
const newer={...old,updated_date:"after",full_name:"Updated Synthetic Employee"};
const secret="synthetic-password-123";
const token="synthetic-session";
function extract(name,next){
 const start=source.indexOf(`  const ${name} = `);
 const end=source.indexOf(`  const ${next} = `,start+10);
 assert.ok(start>=0&&end>start,name+" shipping handler located");
 return source.slice(start,end).trim().replace(/^const \w+ = /,"").replace(/;$/,"");
}
const saveCode=extract("handleSave","verifyInterruptedAccountSave");
const retryCode=extract("retryUnverifiedAccountPassword","stopUnverifiedAccountPasswordRetry");
const stopCode=extract("stopUnverifiedAccountPasswordRetry","handleInvite");
const create=(code,scope)=>new Function("scope",`with(scope){return (${code})}`)(scope);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function fixture({password=secret,accountResult=newer}={}){
 const refs={activeSessionToken:{current:token},activeEditingUser:{current:old},
  accountDraftBaseline:{current:{id:old.id,email:old.email,sessionToken:token,values:createAdminAccountDraft(old)}},
  activeAccountDraft:{current:{...createAdminAccountDraft(old),full_name:newer.full_name,password_hash:password}},
  userUpdateInFlight:{current:false},userUpdateOwner:{current:null},
  hrSaveInFlight:{current:false},hrReloadInFlight:{current:false},
  deletionInFlight:{current:false},userLoadSequence:{current:3}};
 const state={accountCalls:[],passwordCalls:[],requestedPassword:password,
  recovery:null,confirmed:false,notice:"",error:"",mutationSaving:false,
  directory:[old],editor:old,dialog:true,loadCount:0,errors:[],
  form:refs.activeAccountDraft.current};
 const accountReplies=[],passwordReplies=[];
 const scope={...refs,createAdminAccountDraft,hasUnsavedAdminAccountDraft,
  get editingUser(){return state.editor;},get sessionToken(){return token;},
  get formData(){return state.form;},get accountSaveRecovery(){return state.recovery;},get accountWriteRecovery(){return state.writeRecovery;},
  get passwordRetryConfirmed(){return state.confirmed;},
  isLoading:false,userDirectoryError:false,
  hasProtectedHrDraft:()=>false,
  setUserMutationError:v=>{state.error=v;},
  setAccountSaveNotice:v=>{state.notice=v;},
  setUserMutationSaving:v=>{state.mutationSaving=v;},
  setPasswordRetryConfirmed:v=>{state.confirmed=v;},
  setAccountSaveRecovery:v=>{state.recovery=v;},
  setAccountWriteRecovery:v=>{state.writeRecovery=v;},setConfirmAccountReconciliation:()=>{},
  setFormData:v=>{state.form=typeof v==="function"?v(state.form):v;refs.activeAccountDraft.current=state.form;},
  setUsers:v=>{state.directory=typeof v==="function"?v(state.directory):v;},
  setEditingUser:v=>{state.editor=typeof v==="function"?v(state.editor):v;refs.activeEditingUser.current=state.editor;},
  setIsDialogOpen:v=>{state.dialog=v;},
  clearEditorDraftTracking:()=>{refs.accountDraftBaseline.current=null;},
  loadUsers:async()=>{state.loadCount++;return state.directory;},
  updateAuthorizedUserAdmin:options=>{
    state.accountCalls.push(options);
    const next=accountReplies.shift();
    return next?next.promise:Promise.resolve(accountResult);
  },
  setPasswordFn:options=>{
    state.passwordCalls.push(options);
    const next=passwordReplies.shift();
    return next?next.promise:Promise.resolve({data:{success:false}});
  },
  console:{error:(...args)=>state.errors.push(args)}
 };
 return {state,refs,scope,accountReplies,passwordReplies,
  save:create(saveCode,scope),retry:create(retryCode,scope),stop:create(stopCode,scope),
  edit:updates=>{state.form={...state.form,...updates};refs.activeAccountDraft.current=state.form;}};
}

for(const [name,outcome] of [
 ["explicit failure",{data:{success:false,error:"synthetic"}}],
 ["missing confirmation",{}],
 ["missing success flag",{data:{}}],
 ["rejected request",new Error("network timeout")]
]){
 test(`Account success + password ${name} retains editor, draft, and committed baseline`,async()=>{
  const f=fixture();
  const pending=deferred();f.passwordReplies.push(pending);
  const saving=f.save();
  await Promise.resolve(); // Account reply acknowledged
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.passwordCalls.length,1);
  assert.equal(f.state.dialog,true);
  if(outcome instanceof Error)pending.reject(outcome);else pending.resolve(outcome);
  await saving;
  assert.equal(f.state.accountCalls.length,1);
  assert.equal(f.state.loadCount,0);
  assert.equal(f.state.dialog,true);
  assert.equal(f.state.editor.updated_date,"after");
  assert.equal(f.state.directory[0].updated_date,"after");
  assert.equal(f.state.form.password_hash,secret);
  assert.equal(f.refs.accountDraftBaseline.current.values.full_name,newer.full_name);
  assert.deepEqual(Object.keys(f.state.recovery).sort(),["email","id","sessionToken","updated_date"].sort());
  assert.equal(JSON.stringify(f.state.recovery).includes(secret),false);
  assert.match(f.state.error,/Account changes were saved/);
  assert.equal(f.refs.userUpdateInFlight.current,false);
 });
}

test("The normal Account Save cannot resubmit an already-committed partial save",async()=>{
 const f=fixture();await f.save();
 assert.equal(f.state.accountCalls.length,1);
 await f.save();await f.save();
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,1);
 assert.match(f.state.error,/already saved/);
});

test("Manual retry cannot execute without reviewed confirmation",async()=>{
 const f=fixture();await f.save();
 await f.retry();
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.recovery.id,old.id);
});

test("Approved retry submits password only once and fences rapid duplicate clicks",async()=>{
 const f=fixture();await f.save();f.state.confirmed=true;
 const pending=deferred();f.passwordReplies.push(pending);
 const first=f.retry();const duplicate=f.retry();
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,2);
 assert.equal(f.state.confirmed,false);
 assert.equal(f.refs.userUpdateInFlight.current,true);
 pending.resolve({data:{success:true}});
 await first;await duplicate;
 assert.equal(f.state.recovery,null);
 assert.equal(f.state.form.password_hash,"");
 assert.equal(f.state.editor.updated_date,"after");
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.accountCalls.length,1);
 assert.match(f.state.notice,/password update confirmed/);
});

test("Another unconfirmed retry keeps the password and requires a fresh acknowledgment",async()=>{
 const f=fixture();await f.save();f.state.confirmed=true;
 const pending=deferred();f.passwordReplies.push(pending);
 const first=f.retry();pending.reject(new Error("uncertain result"));await first;
 assert.equal(f.state.form.password_hash,secret);
 assert.equal(f.state.recovery.id,old.id);
 assert.equal(f.state.confirmed,false);
 await f.retry();
 assert.equal(f.state.passwordCalls.length,2);
 assert.equal(f.state.accountCalls.length,1);
 assert.match(f.state.error,/still unverified/);
});

test("Stop retry clears only the password draft and keeps saved Account fields",async()=>{
 const f=fixture();await f.save();
 f.stop();
 assert.equal(f.state.form.password_hash,"");
 assert.equal(f.state.form.full_name,newer.full_name);
 assert.equal(f.state.recovery,null);
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,1);
 assert.match(f.state.notice,/no retry was sent/);
 assert.equal(hasUnsavedAdminAccountDraft(f.refs.accountDraftBaseline.current.values,f.state.form),false);
});

test("Stale recovery cannot retry another employee or session",async()=>{
 for(const change of ["session","employee","version"]){
  const f=fixture();await f.save();f.state.confirmed=true;
  if(change==="session")f.refs.activeSessionToken.current="new-session";
  if(change==="employee")f.refs.activeEditingUser.current={...newer,id:"other"};
  if(change==="version")f.refs.activeEditingUser.current={...newer,updated_date:"new-version"};
  await f.retry();f.stop();
  assert.equal(f.state.passwordCalls.length,1,change);
  assert.equal(f.state.recovery.id,old.id,change);
  assert.equal(f.state.form.password_hash,secret,change);
 }
});

test("In-flight retry response from retired session never changes the new editor",async()=>{
 const f=fixture();await f.save();f.state.confirmed=true;
 const pending=deferred();f.passwordReplies.push(pending);
 const saving=f.retry();f.refs.activeSessionToken.current="new-session";
 pending.resolve({data:{success:true}});await saving;
 assert.equal(f.state.recovery.id,old.id);
 assert.equal(f.state.form.password_hash,secret);
});

test("Account write and password call run once when Save is double-clicked",async()=>{
 const f=fixture();const delayed=deferred();f.accountReplies.push(delayed);
 const a=f.save(),b=f.save();
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 delayed.resolve(newer);await a;await b;
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,1);
});

test("A successful password result retains normal close behavior",async()=>{
 const f=fixture();f.passwordReplies.push({promise:Promise.resolve({data:{success:true}})});
 await f.save();
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,1);
 assert.equal(f.state.loadCount,1);
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.editor,null);
 assert.equal(f.state.recovery,null);
});

test("Account-only Save still finishes without a password write",async()=>{
 const f=fixture({password:""});await f.save();
 assert.equal(f.state.accountCalls.length,1);
 assert.equal(f.state.passwordCalls.length,0);
 assert.equal(f.state.dialog,false);
 assert.equal(f.state.loadCount,1);
});

test("Edits made during a pending save are retained instead of closing the editor",async()=>{
 const f=fixture({password:""});const deferredAccount=deferred();
 f.accountReplies.push(deferredAccount);
 const task=f.save();f.edit({username:"after-click"});
 deferredAccount.resolve(newer);await task;
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.form.username,"after-click");
 assert.equal(f.state.editor.updated_date,"after");
 assert.equal(f.state.accountCalls.length,1);
 assert.match(f.state.notice,/New edits made during saving/);
});

test("Invalid Account receipt never begins the separate password write",async()=>{
 const f=fixture({accountResult:{...newer,id:"another-employee"}});
 await f.save();
 assert.equal(f.state.passwordCalls.length,0);
 assert.equal(f.state.dialog,true);
 assert.equal(f.state.accountCalls.length,1);
 assert.match(f.state.error,/receipt could not be verified/);
});

test("Recovery controls show uncertainty, require attestation and never auto-save Account",()=>{
 assert.match(source,/Account saved; Time Clock password outcome unverified/);
 assert.match(source,/I verified the password was not changed/);
 assert.match(source,/disabled=\{!passwordRetryConfirmed \|\| userMutationSaving/);
 assert.match(source,/onClick=\{retryUnverifiedAccountPassword\}/);
 assert.match(source,/onClick=\{stopUnverifiedAccountPasswordRetry\}/);
 assert.match(source,/\!\!accountSaveRecovery \|\| isLoading/);
 assert.match(source,/setPasswordRetryConfirmed\(false\)/);
 assert.doesNotMatch(retryCode,/updateAuthorizedUserAdmin|setEditingUser\(null\)|setIsDialogOpen\(false\)/);
 assert.doesNotMatch(stopCode,/updateAuthorizedUserAdmin|setPasswordFn\(/);
});
