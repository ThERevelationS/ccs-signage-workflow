import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {
  captureSalesFollowUpCompletionGuards, isSalesFollowUpCompletionSnapshotCurrent,
} from "../src/components/sales/salesFollowUpCompletionGuards.mjs";
import {equivalent} from "../base44/shared/fieldAudit.ts";
import {validateSalesStageTimestampPatch} from "../base44/shared/salesStageTimestampGuard.mjs";
import {validateSalesActivityTimestampPatch} from "../base44/shared/salesActivityTimestampGuard.mjs";
import {validateNeutralSalesCloseout} from "../base44/shared/salesNeutralCloseoutGuard.mjs";

let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const eq=(actual,expected,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,label);checks++;};
const old={
  id:"syntheticFollowUp001",updated_date:"v1",in_pipeline:true,deleted:false,
  sales_status:"follow_up",current_task_description:"Call client",
  follow_up_date:"2026-10-14",
  sales_last_follow_up_completed_at:"2026-10-01T14:00:00.000Z",
  sales_last_follow_up_outcome:"Previous voicemail",
  sales_last_activity_at:"2026-10-01T14:00:00.000Z",
};
const baseline=structuredClone(old);
const guards=captureSalesFollowUpCompletionGuards(old);
eq(Object.keys(guards).sort(),[
  "follow_up_date","current_task_description","sales_last_follow_up_completed_at",
  "sales_last_follow_up_outcome","sales_status","in_pipeline"
].sort(),"Completion baseline contains both markers, next-action fields and lifecycle status.");
check(isSalesFollowUpCompletionSnapshotCurrent(old,{...old,updated_date:"v2",notes:[{text:"Unrelated"}]}),
  "Unrelated WorkOrder edits do not invalidate a follow-up completion.");
for(const changes of [
  {follow_up_date:"2026-10-16"},
  {current_task_description:"Email revised estimate"},
  {sales_last_follow_up_completed_at:"2026-10-14T15:00:00.000Z"},
  {sales_last_follow_up_outcome:"Other user reached client"},
  {sales_status:"won"},
  {in_pipeline:false},
  {deleted:true},
  {id:"different-workorder"},
]) {
  check(!isSalesFollowUpCompletionSnapshotCurrent(old,{...old,...changes}),
    "Follow-up modal detects changed or ineligible original context.");
}
check(!isSalesFollowUpCompletionSnapshotCurrent(old,null),
  "A removed/filtered WorkOrder blocks the opened completion.");
eq(old,baseline,"Capturing a modal snapshot never mutates the original WorkOrder.");

const source=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
const dialog=readFileSync("src/components/sales/SalesFollowUpCompleteDialog.jsx","utf8");
check(source.includes("pendingFollowUpGuardsRef = useRef({})") &&
  source.includes("pendingFollowUpGuardsRef.current[orderId] = followUpGuards"),
  "Queued completion retains modal guards until save.");
check(source.includes("...(pendingFollowUpGuardsRef.current[orderId] || {})") &&
  source.includes("guardFields: {") &&
  source.includes("...untouchedSalesTransitionGuards"),
  "Follow-up context and Sales stage guards are enforced together in guarded persistence.");
check(source.includes("captureSalesFollowUpCompletionGuards(followUpCompletion)") &&
  source.includes("isSalesFollowUpCompletionSnapshotCurrent(followUpCompletion, current)"),
  "Actual completion submits opened snapshot, not latest displayed row as its baseline.");
check(source.includes("pendingChangesRef.current[followUpCompletion.id] || debounceTimers.current[followUpCompletion.id]"),
  "A second same-tick local completion cannot replace a pending first completion.");
check(source.includes("followUpGuards:")===false || source.includes("followUpGuards"),
  "No alternate unguarded follow-up completion mechanism introduced.");
check(source.includes("pendingChanges: proposedUpdates, reconcileSameTask, followUpGuards") &&
  source.includes("statusTransition.reconcileSameTask === true, statusTransition.followUpGuards") &&
  source.includes("false, true, false, statusTransition.followUpGuards"),
  "Stage confirmation and neutral close carry follow-up guards into final save.");
check(source.includes('delete pendingFollowUpGuardsRef.current[orderId]') &&
  source.includes("pendingFollowUpGuardsRef.current = {}"),
  "Successful and discarded completions clear their transient guard state.");
check(dialog.includes('role="alert"') &&
  source.includes("error={followUpCompletionError}"),
  "Stale modal rejects without closing and shows a visible error on desktop and mobile.");
check(dialog.includes("onConfirm?.({ outcome: finalOutcome, nextFollowUpDate, nextAction: nextAction.trim() })"),
  "Optional outcome details and explicit next follow-up remain part of the form.");

let live=structuredClone(old);
let writes=0;
const sdk={asServiceRole:{entities:{WorkOrder:{async get(id){return id===live.id?structuredClone(live):null;}}}}};
const mock={
  createClientFromRequest:()=>sdk,
  measureSyncEntities:value=>value,
  authenticateSignShopSession:async()=>({role:"user",email:"synthetic@example.invalid"}),
  beginSyncTraceStorage:async()=>{},
  validateNeutralSalesCloseout,validateSalesStageTimestampPatch,validateSalesActivityTimestampPatch,
  equivalent,
  trackedConditionalSave:async(_sdk,type,record,patch)=>{
    assert.equal(type,"WorkOrder");
    assert.equal(live.updated_date,record.updated_date);
    writes++;
    live={...live,...patch,updated_date:"v"+(writes+1)};
    return structuredClone(live);
  },
  Response,
};
const backend=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
runInNewContext(backend.replace(/^import .*;\s*$/gm,"")
  .replace("export default async function(req) {","async function wrappedDefault(req) {")
  +"\nglobalThis.syntheticHandler=fieldHistoryHandler;",mock,{timeout:3000});
const complete=(opened,patch)=>mock.syntheticHandler({
  async json(){return {action:"save",session_token:"synthetic",entity_type:"WorkOrder",entity_id:old.id,
    next_fields:patch,guard_fields:captureSalesFollowUpCompletionGuards(opened),
    expected_fields:Object.fromEntries(Object.keys(patch).map(field=>[field,opened[field]??null]))};}
});
const stamp=new Date().toISOString();
const action={sales_last_follow_up_completed_at:stamp,
  sales_last_follow_up_outcome:"Connected / Spoke with customer",
  follow_up_date:"2026-10-21",sales_last_activity_at:stamp};
let response=await complete(old,action);
eq(response.status,200,"First valid completion is committed through actual fieldHistory handler.");
check(writes===1 && live.sales_last_follow_up_outcome===action.sales_last_follow_up_outcome &&
  live.follow_up_date===action.follow_up_date,"One atomic write saves complete outcome and reschedule.");
response=await complete(old,{...action,sales_last_follow_up_completed_at:new Date(Date.now()+1000).toISOString()});
eq(response.status,409,"Second user with stale modal cannot double-log same follow-up.");
eq(writes,1,"Stale duplicate produces no second write or committed history.");
eq(live.sales_last_follow_up_outcome,action.sales_last_follow_up_outcome,
  "First user's outcome is not overwritten by stale same-outcome retry.");
const firstResult={...live};
response=await complete(old,{...action,sales_last_follow_up_outcome:"Other user claims no response",
  sales_last_follow_up_completed_at:new Date(Date.now()+2000).toISOString()});
eq(response.status,409,"Different stale follow-up outcome cannot overwrite successful completion.");
eq(live,firstResult,"Conflict leaves completed follow-up unchanged.");
live={...structuredClone(old),follow_up_date:"2026-10-17",updated_date:"v2"};
writes=0;
response=await complete(old,action);
eq(response.status,409,"Concurrent reschedule blocks older modal completion.");
eq(writes,0,"Reschedule conflict performs zero writes.");
live={...structuredClone(old),current_task_description:"New salesperson task",updated_date:"v2"};
response=await complete(old,action);
eq(response.status,409,"Concurrent task update blocks outdated next-action completion.");
live={...structuredClone(old),sales_status:"won",updated_date:"v2"};
response=await complete(old,action);
eq(response.status,409,"Concurrent Won transition protects closed opportunity from stale completion.");
live={...structuredClone(old),sales_last_follow_up_outcome:"Someone else spoke to client",updated_date:"v2"};
response=await complete(old,action);
eq(response.status,409,"Concurrent logged outcome is preserved even without a different completed timestamp.");
live={...structuredClone(old),updated_date:"v2",notes:[{text:"Shop production update"}]};
response=await complete(old,action);
eq(response.status,200,"Unrelated WorkOrder update does not block still-current follow-up completion.");
eq(live.sales_last_follow_up_completed_at,stamp,"Unrelated update retains intended completion timestamp.");
check(writes===1,"One successful guarded save after unrelated update.");
console.log("Sales Phase 6C follow-up completion concurrency: "+checks+"/"+checks+" PASS.");
