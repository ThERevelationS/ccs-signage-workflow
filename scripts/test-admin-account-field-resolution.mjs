// Synthetic field-level Admin Account conflict decisions.
// No production records, backend calls, or real employee data.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createAdminAccountDraft } from "../src/components/admin/adminAccountDraft.js";
import { planAccountFieldResolution } from "../src/components/admin/accountFieldResolution.js";

const source=readFileSync("src/components/admin/UserManagement.jsx","utf8");
const baseline={
 id:"synthetic",email:"synthetic@example.invalid",updated_date:"v1",
 full_name:"Before",username:"initial",role:"user",sales_roles:["Designer"],
 can_import_export:false,can_order_export:false,can_view_resources:false,
 can_work_pause:false,employment_type:"hourly"
};
const attempted={...createAdminAccountDraft(baseline),
 full_name:"My update",username:"my-username",
 sales_roles:["Designer","Estimator"],can_import_export:true};
const latest={...baseline,updated_date:"v2",
 full_name:"Their update",username:"remote-username",
 sales_roles:["Designer","Installer"],can_import_export:false};
const draft={...attempted,password_hash:"test-password-not-for-real"};
const plan=(options={})=>planAccountFieldResolution({
 baseline,attempted,latest,draft,choices:{},...options
});
const field=(result,key)=>result.fields.find(item=>item.key===key);

test("Defaults to latest for attempted fields, including conflicts and roles",()=>{
 const p=plan();
 assert.equal(p.draft.full_name,"Their update");
 assert.equal(p.draft.username,"remote-username");
 assert.deepEqual(p.draft.sales_roles,["Designer","Installer"]);
 assert.equal(p.draft.can_import_export,false);
 assert.equal(p.draft.password_hash,draft.password_hash);
 assert.equal(p.counts.useMine,0);
 assert.equal(p.counts.useLatest,p.fields.length);
 assert.equal(field(p,"full_name").selected,"latest");
 assert.equal(field(p,"can_import_export").sensitive,true);
});

test("Single field Keep my draft never overwrites other remote fields",()=>{
 const p=plan({choices:{full_name:"mine"}});
 assert.equal(p.draft.full_name,"My update");
 assert.equal(p.draft.username,"remote-username");
 assert.deepEqual(p.draft.sales_roles,["Designer","Installer"]);
 assert.equal(p.draft.can_import_export,false);
 assert.equal(p.counts.useMine,1);
});

test("Roles array compares as a set and never mutates original arrays",()=>{
 const baseCopy=JSON.stringify(draft),latestCopy=JSON.stringify(latest);
 const p=plan({choices:{sales_roles:"mine"}});
 assert.deepEqual(p.draft.sales_roles,["Designer","Estimator"]);
 p.draft.sales_roles.push("Painter");
 assert.equal(JSON.stringify(draft),baseCopy);
 assert.equal(JSON.stringify(latest),latestCopy);
 const sameOrder=plan({draft:{...draft,sales_roles:["Estimator","Designer"]}});
 assert.equal(field(sameOrder,"sales_roles").editedLater,false);
});

test("Changes made after interrupted save are preserved by default",()=>{
 const p=plan({draft:{...draft,username:"Typed after save",can_work_pause:true}});
 assert.equal(p.draft.username,"Typed after save");
 assert.equal(p.draft.can_work_pause,true);
 assert.equal(field(p,"username").editedLater,true);
 assert.equal(field(p,"username").selected,"mine");
 assert.equal(field(p,"can_work_pause").selected,"mine");
});

test("Can explicitly reject post-click edits and choose latest",()=>{
 const p=plan({draft:{...draft,username:"Typed after save"},choices:{username:"latest"}});
 assert.equal(p.draft.username,"remote-username");
 assert.equal(field(p,"username").selected,"latest");
});

test("Remote-only changes are included in the field review, default latest",()=>{
 const p=plan({latest:{...latest,employment_type:"salary"}});
 assert.equal(p.draft.employment_type,"salary");
 assert.equal(field(p,"employment_type").tried,false);
 assert.equal(field(p,"employment_type").remoteChanged,true);
 assert.equal(field(p,"employment_type").selected,"latest");
});

test("An explicit permission choice is independently applied in memory",()=>{
 const p=plan({choices:{can_import_export:"mine",full_name:"latest"}});
 assert.equal(p.draft.can_import_export,true);
 assert.equal(p.draft.full_name,"Their update");
 assert.equal(p.counts.privilegedMine,1);
});

test("Demoting an administrator always revokes Order Form export",()=>{
 const admin={...baseline,role:"admin",can_order_export:true,can_view_resources:true};
 const desired={...createAdminAccountDraft(admin),role:"user",can_order_export:false,can_view_resources:false};
 const remote={...admin,updated_date:"new",can_order_export:true};
 const p=planAccountFieldResolution({
   baseline:admin,attempted:desired,latest:remote,
   draft:{...desired,can_order_export:true},
   choices:{role:"mine",can_order_export:"mine"}
 });
 assert.equal(p.draft.role,"user");
 assert.equal(p.draft.can_order_export,false);
 assert.match(p.adjustments.join(" "),/disabled for non-admin/);
});

test("Admin role preserves automatic Resources access even if draft chooses false",()=>{
 const admin={...latest,role:"admin",can_view_resources:true,can_order_export:true};
 const p=plan({latest:admin,draft:{...draft,can_view_resources:false},
   choices:{can_view_resources:"mine"}});
 assert.equal(p.draft.role,"admin");
 assert.equal(p.draft.can_view_resources,true);
 assert.match(p.adjustments.join(" "),/Administrators have Resources access/);
});

test("Changing a role in the local draft requires deliberate selection and does not grant export implicitly",()=>{
 const account={...draft,role:"admin",can_order_export:true,can_view_resources:true};
 const p=plan({draft:account});
 assert.equal(p.draft.role,"admin"); // Later edit is retained as a local-only draft
 assert.equal(p.draft.can_order_export,true);
 assert.equal(field(p,"role").selected,"mine");
 assert.equal(p.counts.privilegedMine>=1,true);
});

test("Unrecognized choice or malformed draft is rejected without implicit granting",()=>{
 assert.throws(()=>plan({choices:{role:"force-admin"}}),/Unknown/);
 assert.throws(()=>plan({draft:{role:"admin"}}),/complete/);
 assert.throws(()=>plan({latest:null}),/complete/);
 assert.throws(()=>plan({choices:null}),/complete/);
});

test("Summary cannot expose account values, passwords or employee emails",()=>{
 const p=plan();
 assert.deepEqual(Object.keys(field(p,"full_name")).sort(),[
  "key","label","selected","tried","remoteChanged","editedLater","sensitive","matchesLatest"
 ].sort());
 const displayed=JSON.stringify({fields:p.fields,adjustments:p.adjustments,counts:p.counts});
 for(const secret of [draft.password_hash,latest.email,latest.full_name,attempted.full_name]){
   assert.equal(displayed.includes(secret),false);
 }
});

test("Field-choice UI is scoped, accessible and explicitly local-only",()=>{
 assert.match(source,/planAccountFieldResolution\(\{/);
 assert.match(source,/onClick=\{\(\) => chooseAccountField\(field.key, "latest"\)\}/);
 assert.match(source,/onClick=\{\(\) => chooseAccountField\(field.key, "mine"\)\}/);
 assert.match(source,/aria-pressed=\{field.selected === "latest"\}/);
 assert.match(source,/aria-pressed=\{field.selected === "mine"\}/);
 assert.match(source,/Apply reviewed field choices \(local only\)/);
 assert.match(source,/setAccountFieldChoices\(\{\}\)/);
 assert.match(source,/setConfirmAccountReconciliation\(false\)/);
 assert.match(source,/accountResolutionPreview\.draft/);
 assert.match(source,/A later Save is/);
});

test("Resolve handler retains a separate Account save and backend validation",()=>{
 const start=source.indexOf("  const acceptVerifiedAccountSave = async () => {");
 const end=source.indexOf("  const retryUnverifiedAccountPassword = async",start);
 assert.ok(start>=0&&end>start);
 const accept=source.slice(start,end);
 assert.doesNotMatch(accept,/updateAuthorizedUserAdmin|setPasswordFn|base44\.functions/);
 assert.match(accept,/accountDraftBaseline\.current =/);
 assert.match(accept,/setFormData\(current => \(\{\.\.\.resolved, password_hash: current.password_hash/);
 assert.match(accept,/!confirmAccountReconciliation \|\| !accountResolutionPreview/);
 assert.match(accept,/await listAuthorizedUsersAdmin\(\{ sessionToken \}\)/);
 assert.match(accept,/isSameVerifiedAccountSnapshot\(pending.latest, matching\[0\]\)/);
});
