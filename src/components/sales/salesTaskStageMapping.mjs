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
