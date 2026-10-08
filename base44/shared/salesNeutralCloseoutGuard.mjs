// Neutral Sales closeout is not a seventh sales_status or a Won/Lost event.
// Enforce the full confirmed WorkOrder patch before the conditional audit/save.
export function validateNeutralSalesCloseout(record, patch, equivalent) {
  if (!Object.prototype.hasOwnProperty.call(patch || {}, "sales_neutral_closed_at")) return;
  const marker = String(patch.sales_neutral_closed_at || "").trim();
  const matchesSaved = Object.entries(patch).every(([field, value]) => equivalent(record[field], value));
  const newClosure = record.in_pipeline === true && !["won", "lost"].includes(record.sales_status);
  // A lost acknowledgement may retry an already-committed save. Never write it twice.
  const replayedClosure = matchesSaved && record.in_pipeline === false;
  const validStamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(marker)
    && Number.isFinite(Date.parse(marker));
  if (!validStamp || (!newClosure && !replayedClosure) || patch.in_pipeline !== false
    || patch.follow_up_date !== ""
    || String(patch.current_task_description || "").trim() !== "Closed - Did not Lose"
    || (Object.prototype.hasOwnProperty.call(patch, "sales_status") && patch.sales_status !== record.sales_status)) {
    throw Object.assign(
      new Error("Neutral closure requires an active nonterminal Sales opportunity and its confirmed task and pipeline changes together."),
      { status: 409 }
    );
  }
}
