import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {inspectUncertainSalesQuickEdit,uncertainSalesQuickEditWarning} from "../src/components/sales/salesQuickEditUncertainRecovery.mjs";

let n=0;
const check=(value,label)=>{assert.ok(value,label);n++;};
const eq=(actual,expected,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,label);n++;};
const id="synthetic-noncompletion-sales";
const base={id,updated_date:"v1",sales_status:"lead",lead_source:"Phone",current_task_description:"Initial Contact"};
const patch={lead_source:"Web"};
const latest={...base,...patch,updated_date:"v2"};
let reads=0;
const inspect=(record,changes=patch)=>inspectUncertainSalesQuickEdit({
  workOrderId:id,changes,getLatest:async()=>{reads++;return record;}
});
eq((await inspect(latest)).state,"values_match","Readback reports matching values without claiming the save succeeded.");
eq(reads,1,"Readback performs only one authoritative WorkOrder read.");
eq((await inspect({...latest,lead_source:"Referral"})).state,"values_differ","A mismatched source stays unverified.");
eq((await inspect({...latest,id:"other-order"})).state,"unavailable","Unrelated WorkOrder is never accepted.");
eq((await inspect({...latest,deleted:true})).state,"unavailable","Deleted record is not accepted.");
eq((await inspect(null)).state,"unavailable","Missing WorkOrder remains unknown.");
eq((await inspect({...latest,lead_source:undefined})).state,"values_differ","Missing changed value cannot match.");
eq((await inspect(latest,{lead_source:"Web",current_task_description:"Changed"})).state,"values_differ","Partial field agreement does not verify all changes.");
eq((await inspect(latest,{lead_source:"Web",current_task_description:"Initial Contact"})).state,"values_match","Complete changed-field agreement is observed.");
eq((await inspectUncertainSalesQuickEdit({workOrderId:id,changes:patch,getLatest:async()=>{throw Error("no network");}})).state,"unavailable","Read failure returns safe uncertainty.");
eq((await inspectUncertainSalesQuickEdit({workOrderId:id,changes:{},getLatest:async()=>{throw Error("should not read");}})).state,"unavailable","Invalid empty patch never triggers a read.");
for (const state of ["values_match","values_differ","unavailable"]) {
 const msg=uncertainSalesQuickEditWarning(state);
 check(msg.includes("Do not repeat this save")&&msg.includes("Reload latest"),"Every uncertainty outcome requires manual reload.");
 check(!msg.includes("Save completed")&&!msg.includes("successfully saved"),"No uncertainty outcome claims a commit.");
}

const sheet=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
check(sheet.includes("if (blockedFollowUpSavesRef.current.has(orderId))"),"An uncertain save blocks later edits to the same WorkOrder.");
check(sheet.includes("blockedFollowUpSavesRef.current.clear()"),"Existing explicit Reload latest clears the per-record fence.");
check(sheet.includes("if (!pendingFollowUpGuardsRef.current[orderId]) {") &&
 sheet.includes("readBackUncertainSalesFollowUpSave"),"Existing follow-up completion path is retained.");
check(sheet.includes("const observation = await inspectUncertainSalesQuickEdit") &&
 sheet.includes("blockedFollowUpSavesRef.current.add(orderId)"),"Other Sales saves use read-only observation and a write fence.");

const begin="    const timerId = setTimeout(async () => {";
const end="    debounceTimers.current[orderId] = timerId;";
const start=sheet.indexOf(begin),stop=sheet.indexOf(end,start);
check(start>0&&stop>start,"Real Sales quick-edit timer is available for VM simulation.");
const timerBlock=sheet.slice(start,stop+end.length);
async function simulate({mode,observed=latest,blockedInitially=false,reloadingInitially=false}={}){
 let writes=0,reads=0,syncs=0,warning="",timer=null;
 let display={...base,...patch},selection={...base,...patch};
 const blockedFollowUpSavesRef={current:new Set(blockedInitially?[id]:[])};
 const reloadingSalesQuickEditsRef={current:reloadingInitially};
 const pendingChangesRef={current:{[id]:{...patch}}};
 const pendingBaselinesRef={current:{[id]:{lead_source:base.lead_source}}};
 const pendingHistoryFieldsRef={current:{[id]:new Set(["lead_source"])}};
 const pendingSalesGuardsRef={current:{}},pendingFollowUpGuardsRef={current:{}};
 const pendingRecordScopesRef={current:{[id]:"current"}};
 const pendingSameTaskRepairRef={current:new Set()},failedSameTaskRepairRef={current:new Map()};
 const debounceTimers={current:{}};
 const ctx={
  orderId:id,currentWo:{...base},Object,JSON,Set,Map,Promise,Error,
  pendingChangesRef,pendingBaselinesRef,pendingHistoryFieldsRef,pendingSalesGuardsRef,
  pendingFollowUpGuardsRef,pendingRecordScopesRef,pendingSameTaskRepairRef,
  failedSameTaskRepairRef,blockedFollowUpSavesRef,reloadingSalesQuickEditsRef,debounceTimers,
  setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{},
  setQuickEditError:value=>{warning=value;},
  replaceWorkOrderFieldsIfUnchanged:async()=>{writes++;
   if(mode==="success")return latest;
   throw new Error("Synthetic response lost");
  },
  inspectUncertainSalesQuickEdit,uncertainSalesQuickEditWarning,
  WorkOrder:{get:async()=>{reads++;if(mode==="read_failed")throw Error("Read unavailable");return observed;}},
  readBackUncertainSalesFollowUpSave:async()=>{throw Error("Non-follow-up must not use completion recovery");},
  untouchedSalesTransitionGuards:()=>({}),
  trackChange:async()=>{},setWorkOrders:fn=>{display=fn([display])[0];},
  setSelectedWorkOrder:fn=>{selection=fn(selection);},
  markWorkOrderNeedsSync:()=>{syncs++;},refreshSameTaskSaveNotice:()=>{},
  canKeepLocallyResolvedSalesReview:()=>false,
  selectedWorkOrder:null,attentionFilter:"all",reviewQueueFilterKey:"all",
  resolvedReviewExitRef:{current:null},console:{error:()=>{}},
 };
 runInNewContext(timerBlock,ctx,{timeout:3000});
 check(typeof timer==="function","Actual Sales timer is mounted in synthetic runtime.");
 await timer();
 return {writes,reads,syncs,warning,blocked:blockedFollowUpSavesRef.current.has(id),
   queued:pendingChangesRef.current[id],baseline:pendingBaselinesRef.current[id],
   display,selection};
}
const saved=await simulate({mode:"success"});
eq(saved.writes,1,"Ordinary Sales save sends one write.");
eq(saved.reads,0,"Acknowledged save has no recovery read.");
eq(saved.syncs,1,"Acknowledged Sales save proceeds to downstream sync.");
check(!saved.blocked&&!saved.queued,"Normal successful save clears pending intent.");
const lost=await simulate({mode:"lost"});
eq(lost.writes,1,"Lost acknowledgment never triggers a second write.");
eq(lost.reads,1,"Lost acknowledgment performs exactly one read-only inspection.");
eq(lost.syncs,0,"Unacknowledged Sales changes are not pushed to Smartsheet.");
check(lost.blocked&&!!lost.queued&&!!lost.baseline,"Uncertain Sales save preserves queued intent and fences the record.");
check(lost.warning.includes("currently matches")&&lost.warning.includes("does not prove"),
 "Matching post-save WorkOrder values are not treated as proof of authorship or commit.");
const differed=await simulate({mode:"lost",observed:{...latest,lead_source:"Referral"}});
check(differed.blocked&&differed.warning.includes("does not match"),"Conflicting current value remains blocked.");
const unreadable=await simulate({mode:"read_failed"});
check(unreadable.blocked&&unreadable.warning.includes("could not be checked"),"Readback failure cannot unlock the row.");
eq(unreadable.reads,1,"Readback failures never trigger read loops.");
const second=await simulate({mode:"lost",blockedInitially:true});
eq(second.writes,0,"Previously queued timer cannot dispatch another write after a fence.");
eq(second.reads,0,"Blocked timer skips unnecessary readbacks.");
check(second.blocked&&!!second.queued,"Blocked timer preserves pending state for review.");
check(second.warning.includes("Reload latest"),"Blocked timer directs the user to manual reload.");
const midReload=await simulate({mode:"lost",reloadingInitially:true});
eq(midReload.writes,0,"A prequeued timer cannot dispatch while Reload latest is in flight.");
eq(midReload.reads,0,"Reload-in-progress blocks redundant WorkOrder inspection.");
check(!!midReload.queued,"Timer blocked by reload does not discard pending intent.");
console.log("Sales Phase 6N uncertain general quick-edit safety: "+n+"/"+n+" PASS.");
