export { NEUTRAL_CLOSED_TASK, SALES_TASK_STAGE_MAP, mapSalesTaskToStage } from "../../../base44/shared/salesTaskStageCatalog.mjs";
import { mapSalesTaskToStage } from "../../../base44/shared/salesTaskStageCatalog.mjs";
import { classifySalesTaskStatusAudit } from "../../../base44/shared/salesTaskStatusAudit.mjs";

// Won is a Sales outcome, not a freeze on downstream SIPs/WIP work.
// Only known Won-family tasks qualify for continued operational task editing.
export function isWonOperationalTask(taskDescription) {
  return mapSalesTaskToStage(taskDescription).status === "won";
}

export function canUpdateWonOperationalField(workOrder, changes, fieldName) {
  if (workOrder?.in_pipeline !== true || workOrder?.sales_status !== "won") return false;
  if (["current_task_description", "current_task_deadline", "current_task_assigned_to"].includes(fieldName) === false) return false;
  if (changes?.sales_status && changes.sales_status !== "won") return false;
  const task = Object.prototype.hasOwnProperty.call(changes || {}, "current_task_description")
    ? changes.current_task_description : workOrder.current_task_description;
  return isWonOperationalTask(task);
}

// Snapshot the Sales classification from the loaded record even when an edit
// has already been optimistically queued. Changed fields use their own CAS
// baseline; untouched classification fields must remain guarded as well.
export function captureSalesTransitionGuards(workOrder, baselines = {}, previousGuards = {}) {
  const guards = { ...previousGuards };
  for (const field of ["sales_status", "in_pipeline"]) {
    if (!Object.prototype.hasOwnProperty.call(guards, field)) {
      guards[field] = Object.prototype.hasOwnProperty.call(baselines, field)
        ? baselines[field] : workOrder?.[field] ?? null;
    }
  }
  return guards;
}

export function untouchedSalesTransitionGuards(guards = {}, changes = {}) {
  return Object.fromEntries(Object.entries(guards).filter(([field]) =>
    !Object.prototype.hasOwnProperty.call(changes, field)));
}

// Reject a confirmation opened against an older Sales classification/task.
// The conditional WorkOrder save still guards changes arriving after this check.
export function isSalesTransitionSnapshotCurrent(opened, current) {
  if (!opened?.id || opened.id !== current?.id) return false;
  return opened.sales_status === current.sales_status
    && opened.in_pipeline === current.in_pipeline
    && String(opened.current_task_description ?? "").trim() === String(current.current_task_description ?? "").trim()
    && String(opened.sales_neutral_closed_at ?? "").trim() === String(current.sales_neutral_closed_at ?? "").trim();
}

// Explicit repair of an existing mapped task/status mismatch. This only
// plans an action; it does not change persisted WorkOrders or infer a modern
// Won/Lost outcome from imported legacy task text.
export function planExistingSalesTaskStatusReconciliation(workOrder) {
  if (classifySalesTaskStatusAudit(workOrder).kind !== "modern_review") return null;
  const status = String(workOrder?.sales_status || "").trim().toLowerCase();
  if (!["lead", "quoted", "follow_up", "on_hold", "won", "lost"].includes(status)) return null;
  const mapping = mapSalesTaskToStage(workOrder?.current_task_description);
  if (mapping.kind !== "stage" || !mapping.status || mapping.status === status) return null;
  const plan = planSalesTaskChange(workOrder, workOrder.current_task_description);
  return ["save_stage_and_task", "confirm_transition"].includes(plan.action) ? plan : null;
}

export function planSalesTaskChange(workOrder, nextTaskDescription) {
  const task = String(nextTaskDescription || "").trim();
  const mapping = mapSalesTaskToStage(task);
  const currentStatus = String(workOrder?.sales_status || "lead").toLowerCase();
  if (mapping.kind === "unmapped") return { action: "task_only", task, status: null };
  if (mapping.kind === "neutral_close") {
    return { action: "confirm_neutral_close", task, status: null };
  }
  const nextStatus = mapping.status;
  if (nextStatus === currentStatus) return { action: "task_only", task, status: nextStatus };
  if (["won", "lost"].includes(nextStatus) || ["won", "lost"].includes(currentStatus)) {
    return { action: "confirm_transition", task, status: nextStatus };
  }
  return { action: "save_stage_and_task", task, status: nextStatus };
}
