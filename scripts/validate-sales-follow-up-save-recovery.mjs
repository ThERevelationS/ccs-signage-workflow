import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { readBackUncertainSalesFollowUpSave } from "../src/components/sales/salesFollowUpSaveRecovery.mjs";
import { captureSalesFollowUpCompletionGuards } from "../src/components/sales/salesFollowUpCompletionGuards.mjs";

let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),b,label);checks++;};
const base={
  id:"synthetic-wo-6d", updated_date:"version-1", in_pipeline:true,
  sales_status:"follow_up", follow_up_date:"2026-10-15",
  current_task_description:"Call customer",sales_last_activity_at:"",
  sales_last_follow_up_completed_at:"",sales_last_follow_up_outcome:"",
};
const stamp="2026-10-16T09:00:00.000Z";
const changes={sales_last_follow_up_completed_at:stamp,
  sales_last_follow_up_outcome:"Connected / Spoke with customer",
  follow_up_date:"2026-10-20",sales_last_activity_at:stamp};
const committed={...base,...changes,updated_date:"version-2"};
const getLatest=async()=>committed;
const recovered=await readBackUncertainSalesFollowUpSave({
  workOrderId:base.id,changes,getLatest});
check(recovered.verified && recovered.record===committed,
  "Read-only confirmation recognizes all committed follow-up fields after a lost acknowledgment.");
for(const field of Object.keys(changes)){
  const latest={...committed,[field]:field==="follow_up_date"?"2026-10-21":"OTHER"};
  const result=await readBackUncertainSalesFollowUpSave({
    workOrderId:base.id,changes,getLatest:async()=>latest});
  eq(result.reason,"unmatched_fields",field+" mismatch never authorizes optimistic acknowledgment.");
}
for(const invalid of [
  {...committed,id:"other-workorder"},
  {...committed,deleted:true},
  null,
]){
  const result=await readBackUncertainSalesFollowUpSave({
    workOrderId:base.id,changes,getLatest:async()=>invalid});
  check(!result.verified,"Wrong/deleted/missing record never confirms a completion.");
}
let reads=0;
const unavailable=await readBackUncertainSalesFollowUpSave({
  workOrderId:base.id,changes,getLatest:async()=>{reads++;throw new Error("Read timed out");}});
eq(unavailable.reason,"read_failed","Failed authoritative read cannot prove commit.");
eq(reads,1,"Uncertain read-back does not loop or retry.");
check(!(await readBackUncertainSalesFollowUpSave({
  workOrderId:base.id,changes:{follow_up_date:"2026-10-20"},getLatest})).verified,
  "A generic follow-up reschedule cannot masquerade as completed follow-up recovery.");
check(!(await readBackUncertainSalesFollowUpSave({
  workOrderId:base.id,changes:{...changes,sales_last_follow_up_outcome:""},getLatest})).verified,
  "Completion must contain a nonblank outcome to be acknowledged.");
const unrelated={...committed,notes:[{text:"Production-only edit"}]};
check((await readBackUncertainSalesFollowUpSave({
  workOrderId:base.id,changes,getLatest:async()=>unrelated})).verified,
  "Unrelated WorkOrder updates do not invalidate a committed completion.");
eq(base.follow_up_date,"2026-10-15","No synthetic check mutates its loaded baseline.");

const sheet=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
const history=readFileSync("src/components/shared/CellContextMenu.jsx","utf8");
check(sheet.includes("const blockedFollowUpSavesRef = useRef(new Set())") &&
  sheet.includes("if (blockedFollowUpSavesRef.current.has(orderId))"),
  "Unverified saves block subsequent implicit writes to the same follow-up record.");
check(sheet.includes("blockedFollowUpSavesRef.current.clear()") &&
  sheet.includes("pendingFollowUpGuardsRef.current = {}"),
  "Explicit Reload latest discards uncertain save state.");
check(sheet.includes("getLatest: (id) => WorkOrder.get(id)") &&
  sheet.includes("if (!readBack.verified)"),
  "Actual quick-edit saves perform read-only WorkOrder reconciliation after failed completion ack.");
check(sheet.includes("recoveredFollowUpSave ? remaining : {}") &&
  sheet.includes("verifiedSameTaskRepair || recoveredFollowUpSave"),
  "Recovered writes update visible follow-up details while keeping newer unsaved local fields.");
check(sheet.includes("markWorkOrderNeedsSync(orderId)") &&
  sheet.includes("await Promise.all(Object.keys(changes)") &&
  history.includes("Field audit now belongs to the verified server save"),
  "Recovered completion continues through normal successful sync and server-owned audit flow.");

const begin="    const timerId = setTimeout(async () => {";
const end="    debounceTimers.current[orderId] = timerId;";
const startAt=sheet.indexOf(begin),stopAt=sheet.indexOf(end,startAt);
check(startAt>0 && stopAt>startAt,"Real quick-edit timer callback can be exercised without modifying production.");
const timerBlock=sheet.slice(startAt,stopAt+end.length);

const simulate=async ({mode,latest=committed})=>{
  let writes=0,readCount=0,sync=0,warning="",timerFn=null;
  const pendingChangesRef={current:{[base.id]:{...changes}}};
  const pendingBaselinesRef={current:{[base.id]:Object.fromEntries(Object.keys(changes).map(k=>[k,base[k]??null]))}};
  const pendingFollowUpGuardsRef={current:{[base.id]:captureSalesFollowUpCompletionGuards(base)}};
  const pendingSalesGuardsRef={current:{}}, pendingRecordScopesRef={current:{[base.id]:"current"}};
  const pendingHistoryFieldsRef={current:{[base.id]:new Set(["sales_last_follow_up_completed_at","sales_last_follow_up_outcome","follow_up_date"])}};
  const pendingSameTaskRepairRef={current:new Set()}, failedSameTaskRepairRef={current:new Map()};
  const blockedFollowUpSavesRef={current:new Set()}, debounceTimers={current:{}};
  let display={...base,...changes},selected={...base,...changes};
  const ctx={
    orderId:base.id,currentWo:{...base},
    pendingChangesRef,pendingBaselinesRef,pendingSalesGuardsRef,
    pendingFollowUpGuardsRef,pendingRecordScopesRef,pendingHistoryFieldsRef,
    pendingSameTaskRepairRef,failedSameTaskRepairRef,blockedFollowUpSavesRef,
    debounceTimers,
    setTimeout:(fn)=>{timerFn=fn;return 44;},clearTimeout:()=>{},
    replaceWorkOrderFieldsIfUnchanged:async()=>{writes++;
      if(mode==="success")return committed;
      throw new Error("Network acknowledgment lost");
    },
    WorkOrder:{get:async()=>{readCount++;if(mode==="read_failed")throw new Error("Unavailable");
      return latest;
    }},
    readBackUncertainSalesFollowUpSave,
    untouchedSalesTransitionGuards:()=>({}),
    trackChange:async()=>{},
    setWorkOrders:fn=>{display=fn([display])[0];},
    setSelectedWorkOrder:fn=>{selected=fn(selected);},
    setQuickEditError:v=>{warning=v;},
    markWorkOrderNeedsSync:()=>{sync++;},
    refreshSameTaskSaveNotice:()=>{},
    setLiveEditPinVersion:()=>{},
    canKeepLocallyResolvedSalesReview:()=>false,
    selectedWorkOrder:null,attentionFilter:"all",reviewQueueFilterKey:"all",
    resolvedReviewExitRef:{current:null},
    readOnlyToken:"synthetic",
    console:{error:()=>{}},
    Object,JSON,Set,Map,Promise,Error,
  };
  runInNewContext(timerBlock,ctx,{timeout:3000});
  check(typeof timerFn==="function","Quick-edit callback was scheduled from the real implementation.");
  await timerFn();
  return {writes,readCount,sync,warning,display,selected,
    remaining:pendingChangesRef.current[base.id],
    blocked:blockedFollowUpSavesRef.current.has(base.id),
    remainingGuards:pendingFollowUpGuardsRef.current[base.id]};
};
const success=await simulate({mode:"success"});
eq(success.writes,1,"Normal ack writes once.");
eq(success.readCount,0,"Normal successful ack does not perform recovery read.");
eq(success.sync,1,"Normal completion requests downstream Smartsheet sync.");
check(!success.remaining && !success.remainingGuards,"Acknowledged completion clears pending intent and guards.");
const lost=await simulate({mode:"lost"});
eq(lost.writes,1,"Lost acknowledgment never causes a second WorkOrder write.");
eq(lost.readCount,1,"Lost acknowledgment performs one read-only reconciliation.");
eq(lost.sync,1,"Verified persisted completion remains eligible for Smartsheet sync.");
check(!lost.warning && !lost.blocked && !lost.remaining && !lost.remainingGuards,
  "Verified recovery clears the queued save and transient guards.");
eq(lost.selected.sales_last_follow_up_outcome,changes.sales_last_follow_up_outcome,
  "Recovered completion is visible in Opportunity Detail.");
eq(lost.display.follow_up_date,changes.follow_up_date,
  "Recovered next follow-up date is visible in the Sales board.");
const mismatched=await simulate({mode:"lost",latest:{...committed,sales_last_follow_up_outcome:"Other user's outcome"}});
eq(mismatched.writes,1,"Unverified completion is not resubmitted.");
eq(mismatched.readCount,1,"Unverified completion uses only one read.");
eq(mismatched.sync,0,"Unverified completion is never pushed to Smartsheet.");
check(mismatched.blocked && mismatched.remaining && mismatched.remainingGuards &&
  mismatched.warning.includes("Reload latest"),
  "Unverified outcome holds original intent and blocks implicit retry until explicit reload.");
const readFail=await simulate({mode:"read_failed"});
eq(readFail.sync,0,"Failed read-back cannot mark completion synced.");
check(readFail.blocked && readFail.remaining &&
  readFail.warning.includes("Do not complete it again"),
  "Read failure keeps the completion blocked rather than claiming it committed.");

console.log("Sales Phase 6D follow-up lost-ack recovery: "+checks+"/"+checks+" PASS.");
