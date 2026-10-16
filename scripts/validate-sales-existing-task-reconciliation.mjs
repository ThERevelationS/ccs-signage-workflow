import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  planExistingSalesTaskStatusReconciliation,
  planSalesTaskChange,
  captureSalesTransitionGuards,
  untouchedSalesTransitionGuards,
} from "../src/components/sales/salesTaskStageMapping.mjs";
import { classifySalesTaskStatusAudit } from "../base44/shared/salesTaskStatusAudit.mjs";
import { trackedConditionalSave } from "../base44/shared/fieldAudit.ts";

let checks = 0;
const same = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const check = (ok,label) => { assert.ok(ok,label); checks++; };
const baseline = {
  id:"synthetic-task-repair",updated_date:"2026-10-09T16:10:00.000Z",
  in_pipeline:true,sales_status:"lead",
  current_task_description:"Estimate Sent to Customer",
  sales_stage_changed_at:"",sales_last_activity_at:"",
  smartsheet_sheet_id:"8702703019812740",smartsheet_row_id:"90001",
};

for (const [task,from,status,action] of [
  ["Estimate Sent to Customer","lead","quoted","save_stage_and_task"],
  ["Waiting on Deposit","lead","quoted","save_stage_and_task"],
  ["Follow up with Customer - Pre-Estimating","quoted","follow_up","save_stage_and_task"],
  ["On Hold - Follow Up with Customer","follow_up","on_hold","save_stage_and_task"],
  ["Conduct Site Survey","on_hold","lead","save_stage_and_task"],
  ["SIPs","lead","won","confirm_transition"],
  ["WIP - Designing","quoted","won","confirm_transition"],
  ["Lost","lead","lost","confirm_transition"],
  ["Lost - We took too long","quoted","lost","confirm_transition"],
  ["Conduct Site Survey","won","lead","confirm_transition"],
  ["Follow up with Customer - Post-Estimate","lost","follow_up","confirm_transition"],
  ["Lost","won","lost","confirm_transition"],
]) {
  const row={...baseline,sales_status:from,current_task_description:task,
    // Terminal task words on a Smartsheet row are legacy without independent
    // modern workflow evidence; only eligible modern repairs may confirm Won/Lost.
    ...(['won','lost'].includes(status) ? {sales_stage_changed_at:'2026-10-08T12:00:00.000Z'} : {})};
  const plan=planExistingSalesTaskStatusReconciliation(row);
  same(plan,{action,task,status},`Explicit ${from} -> ${status} via stored task ${task}`);
  same(classifySalesTaskStatusAudit({...row,sales_status:plan.status}).kind,"none",
    "Only the corrected stored status resolves modern mismatch: "+task);
}
for (const [label,record] of [
  ["already matched",{...baseline,sales_status:"quoted"}],
  ["no task",{...baseline,current_task_description:""}],
  ["unknown task",{...baseline,current_task_description:"New custom workflow"}],
  ["neutral close",{...baseline,current_task_description:"Closed - Did not Lose"}],
  ["unsupported status",{...baseline,sales_status:"needs_stage"}],
  ["no status",{...baseline,sales_status:""}],
  ["not in pipeline",{...baseline,in_pipeline:false}],
  ["deleted",{...baseline,deleted:true}],
  ["legacy imported completed",{...baseline,current_task_description:"Completed Sale",sales_stage_changed_at:"",sales_last_activity_at:""}],
  ["legacy imported lost",{...baseline,current_task_description:"Lost",sales_stage_changed_at:"",sales_last_activity_at:""}],
  ["unknown Smartsheet shell",{...baseline,client_name:"Unknown",title:"Smartsheet row 90001",sales_stage_changed_at:""}],
]) {
  same(planExistingSalesTaskStatusReconciliation(record),null,"Ineligible for direct reconciliation: "+label);
}
const start=structuredClone(baseline);
const plan=planExistingSalesTaskStatusReconciliation(start);
same(plan,planSalesTaskChange(start,start.current_task_description),
  "Same-task repair uses the existing authoritative stage transition planner.");
const after={...start,sales_status:plan.status,sales_stage_changed_at:"2026-10-09T17:10:00.000Z",
  sales_last_activity_at:"2026-10-09T17:10:00.000Z"};
same(after.current_task_description,start.current_task_description,"Existing task is never rewritten.");
check(!start.sales_stage_changed_at && !start.sales_last_activity_at,"No historical timestamp backfill.");
const originalGuards=captureSalesTransitionGuards(start,{sales_status:start.sales_status});
const fullGuards={...originalGuards,current_task_description:start.current_task_description};
same(untouchedSalesTransitionGuards(fullGuards,{
  sales_status:plan.status,
  sales_last_activity_at:after.sales_last_activity_at,
  sales_stage_changed_at:after.sales_stage_changed_at,
}),{in_pipeline:true,current_task_description:start.current_task_description},
  "Existing task and pipeline membership must remain exact CAS guards.");
same(originalGuards.sales_status,"lead","Original status captured for version-safe expectedFields.");

function fake(initial) {
  let record=structuredClone(initial),writes=0;
  const audit=[];
  const base44={asServiceRole:{entities:{
    WorkOrder:{
      async updateMany(where,body) {
        if(where.id!==record.id || where.updated_date!==record.updated_date) return {updated:0};
        record={...record,...body.$set,updated_date:"2026-10-09T17:10:01.999Z"};
        writes++;return {updated:1};
      },
      async get(id){return id===record.id?structuredClone(record):null;},
    },
    FieldAudit:{
      async bulkCreate(rows){const created=rows.map((row,i)=>({...row,id:"audit-"+i}));audit.push(...created);return created;},
      async bulkUpdate(rows){for(const row of rows){const entry=audit.find(e=>e.id===row.id);if(entry)entry.status=row.status;}return rows;}
    },
  }}};
  return {base44,audit,get record(){return record},get writes(){return writes},
    concurrentTask(value){record={...record,current_task_description:value,updated_date:"2026-10-09T17:05:00.000Z"};},
    concurrentStage(status){record={...record,sales_status:status,updated_date:"2026-10-09T17:05:00.000Z"};}
  };
}
const patch={sales_status:plan.status,sales_stage_changed_at:after.sales_stage_changed_at,
  sales_last_activity_at:after.sales_last_activity_at};
const success=fake(start);
const saved=await trackedConditionalSave(success.base44,"WorkOrder",start,patch,
  {full_name:"Synthetic Sales stage reconciliation"},"ui");
same(saved.sales_status,"quoted","Synthetic guarded stage save changes status.");
same(saved.current_task_description,start.current_task_description,"Synthetic save preserves task.");
same(saved.sales_stage_changed_at,after.sales_stage_changed_at,"Real status change records stage timing.");
same(success.writes,1,"Single atomic WorkOrder write.");
for(const field of ["sales_status","sales_stage_changed_at","sales_last_activity_at"]){
  check(success.audit.some(row=>row.field_name===field && row.status==="committed"),
    "Committed stage update audits "+field);
}
const taskRace=fake(start);
taskRace.concurrentTask("Lost");
check(taskRace.record.current_task_description!==
  fullGuards.current_task_description,"Concurrent task no longer satisfies frontend CAS guard.");
await assert.rejects(trackedConditionalSave(taskRace.base44,"WorkOrder",start,patch,
  {full_name:"Synthetic Sales stage reconciliation"},"ui"),e=>e.status===409);
checks++;
same(taskRace.writes,0,"Concurrent task version cannot receive stale stage repair.");
const statusRace=fake(start);
statusRace.concurrentStage("follow_up");
await assert.rejects(trackedConditionalSave(statusRace.base44,"WorkOrder",start,patch,
  {full_name:"Synthetic Sales stage reconciliation"},"ui"),e=>e.status===409);
checks++;
same(statusRace.writes,0,"Concurrent stage version cannot receive stale stage repair.");

const sheet=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
const detail=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
const confirmation=readFileSync("src/components/sales/SalesStatusTransitionDialog.jsx","utf8");
const server=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
check(sheet.includes("const reconcileExistingSalesTaskStatus = (workOrder) =>") &&
  sheet.includes("onReconcileExistingTaskStatus={reconcileExistingSalesTaskStatus}"),
  "Opportunity Detail can request explicit same-task correction without a dropdown status.");
check(detail.includes("Use Current Task to Correct Status") &&
  detail.includes("isRegistered && taskStatusReconciliation && onReconcileExistingTaskStatus"),
  "Desktop/mobile correction control requires registration and eligible modern review.");
check(sheet.includes("reconcileSameTask || String(nextChanges.current_task_description") &&
  sheet.includes("proposedUpdates.sales_status = taskPlan.status"),
  "Same-task correction activates only the existing mapped stage transition.");
check(sheet.includes("reconcileSameTask, followUpGuards })") &&
  sheet.includes("statusTransition.reconcileSameTask === true"),
  "Terminal stage correction preserves confirmation context.");
check(confirmation.includes("transition.reconcileSameTask") &&
  confirmation.includes("The existing Task Description") &&
  confirmation.includes("const canConfirm = !isLost || Boolean(finalReason)"),
  "Confirmation explains unchanged task and still requires a Lost reason.");
check(sheet.includes("pendingSalesGuardsRef.current[orderId].current_task_description = currentWo.current_task_description") &&
  sheet.includes("...untouchedSalesTransitionGuards(pendingSalesGuardsRef.current[orderId], changes)") &&
  sheet.includes("...(pendingFollowUpGuardsRef.current[orderId] || {})"),
  "Unchanged task is included in frontend CAS guards for explicit reconciliation.");
check(server.includes("Object.entries(body.guard_fields||{})") &&
  server.includes("trackedConditionalSave(base44,type,record,patch,actor)"),
  "Server rejects stale task guard before conditional WorkOrder save.");
check(sheet.includes("pendingChangesRef.current[current.id] || debounceTimers.current[current.id]"),
  "No same-task reconcile while this WorkOrder has unsaved edits.");
check(sheet.includes("sales_stage_changed_at: activityStamp") &&
  sheet.includes("currentWo.sales_status !== proposedUpdates.sales_status"),
  "Stage timestamp is produced only by a real Sales status change.");
check(sheet.includes("trackChange(orderId, changedField, baselineSource[changedField], saved[changedField])") &&
  sheet.includes("await replaceWorkOrderFieldsIfUnchanged({"),
  "Existing CellHistory is still written after successful conflict-safe save.");
same(start.sales_status,"lead","Synthetic input is unchanged.");

console.log("Explicit existing-task Sales status reconciliation (synthetic): "+checks+"/"+checks+" PASS.");
