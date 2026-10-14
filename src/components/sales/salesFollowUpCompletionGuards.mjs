// A follow-up completion is an action on the follow-up the user opened.
// Guard both completion markers and its next-action context, even if those
// fields are not changed by the proposed completion patch.
const FOLLOW_UP_CONTEXT_FIELDS = Object.freeze([
  "follow_up_date",
  "current_task_description",
  "sales_last_follow_up_completed_at",
  "sales_last_follow_up_outcome",
  "sales_status",
  "in_pipeline",
]);

const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function captureSalesFollowUpCompletionGuards(workOrder = {}) {
  return Object.fromEntries(FOLLOW_UP_CONTEXT_FIELDS.map((field) =>
    [field, workOrder?.[field] ?? null]));
}

export function isSalesFollowUpCompletionSnapshotCurrent(opened, current) {
  if (!opened?.id || opened.id !== current?.id || current?.deleted === true ||
    current?.in_pipeline !== true || ["won", "lost"].includes(current?.sales_status)) return false;
  const guards = captureSalesFollowUpCompletionGuards(opened);
  return Object.entries(guards).every(([field, value]) => equal(current[field], value));
}
