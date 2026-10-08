// Explicit CCS Sales task-to-stage mapping. Never infer a modern outcome from
// a historical Smartsheet row merely because its task text matches a closeout.
const TASKS_BY_STATUS = {
  lead: [
    "Prospect Initiation (Gather Info, Initial Discuss ...)",
    "Conduct Site Survey",
    "Research Sign Code for Mock-up",
    "Mock up and Send to Customer",
    "Mock up Only",
    "Send Mock up to Customer",
    "Quoting - 3rd Party",
    "Complete Estimate for Review",
    "Estimate - To Be Reviewed",
    "Review Complete - Send to Customer",
  ],
  quoted: [
    "Estimate Sent to Customer",
    "Waiting on Deposit",
  ],
  follow_up: [
    "Follow up with Customer - Pre-Estimating",
    "Follow up with Customer - Post-Estimate",
  ],
  on_hold: ["On Hold - Follow Up with Customer"],
  won: [
    "SIPs",
    "WIP - Waiting for Deposit",
    "WIP - In Final Design Queue",
    "WIP - Designing",
    "WIP - Prepare/Submit Permit",
    "WIP - Follow Up On Status of Accepted Permit",
    "WIP - Permitting Follow-ups",
    "WIP - Production/Fabrication",
    "WIP - Outsourced Fabrication",
    "WIP - Maintenance/Service Call",
    "WIP - Installation",
    "WIP - Outsourced Installation",
    "WIP - Follow Up with Customer",
    "WIP - Inspections",
    "Completed Sale - Electrical Inspection",
    "Completed Sale - Sign Inspection",
    "Completed Sales - Post Invoice Tasks",
    "Completed Sale",
  ],
  lost: [
    "Lost",
    "Lost - We took too long",
    "Closed - Attempted Follow-up/No Response",
  ],
};

// Closed - Did not Lose has no trusted Won/Lost outcome in the existing schema.
export const NEUTRAL_CLOSED_TASK = "Closed - Did not Lose";
export const SALES_TASK_STAGE_MAP = Object.freeze(
  Object.fromEntries(Object.entries(TASKS_BY_STATUS)
    .flatMap(([status, tasks]) => tasks.map((task) => [task, status])))
);

export function mapSalesTaskToStage(taskDescription) {
  const task = String(taskDescription || "").trim();
  if (task === NEUTRAL_CLOSED_TASK) return { kind: "neutral_close", status: null };
  const status = SALES_TASK_STAGE_MAP[task];
  return status ? { kind: "stage", status } : { kind: "unmapped", status: null };
}

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
