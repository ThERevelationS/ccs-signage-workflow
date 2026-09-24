import {
  SALES_SYNC_ALLOWED_FIELDS,
  filterSalesColumnBindings,
  isLegacyTerminalSalesTask,
  salesPulledFieldsUnchanged,
  salesPullSnapshotAligned,
  salesPushRecordUnchanged,
  salesPushSnapshotNeedsReview,
  shouldCreateSmartsheetSalesRecordInPipeline,
} from "../base44/shared/smartsheetSalesSafety.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const configuredBindings = {
  client_name: "3087579177346948",
  work_notes: "2555898341156740",
  notes_serialized: "2555898341156740",
  lead_source: "4072653460557700",
  est_inv_at: "4624329576763268",
  estimate_amount: "5655853885876100",
  current_task_description: "4783818077955972",
  title: "4872970838167428",
  sales_status: "999",
  sales_rep: "280218450585476",
  date_estimate_sent: "7591178804717444",
  current_task_deadline: "3828410546972548",
  expected_close_date: "123",
  lost_reason: "456",
};

const filtered = filterSalesColumnBindings(configuredBindings);
assert(
  JSON.stringify(Object.keys(filtered).sort()) === JSON.stringify([...SALES_SYNC_ALLOWED_FIELDS].sort()),
  "Sales Smartsheet backend must keep only the explicit Sales sync allowlist."
);
for (const protectedField of [
  "title",
  "sales_status",
  "sales_rep",
  "date_estimate_sent",
  "current_task_deadline",
  "expected_close_date",
  "lost_reason",
  "work_notes",
]) {
  assert(!(protectedField in filtered), `Protected Base44 field leaked through Sales Smartsheet bindings: ${protectedField}`);
}

assert(isLegacyTerminalSalesTask("Lost"), "Lost task text must classify as legacy terminal.");
assert(isLegacyTerminalSalesTask("Completed Sale"), "Completed Sale task text must classify as legacy terminal.");
assert(isLegacyTerminalSalesTask("Closed - Attempted Follow-up/No Response"), "Closed task text must classify as legacy terminal.");
assert(!isLegacyTerminalSalesTask("On Hold - Follow Up with Customer"), "On Hold task text must remain active.");
assert(!isLegacyTerminalSalesTask("Follow up with Customer - Post-Estimate"), "Active follow-up task text must remain active.");

assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ current_task_description: "Lost" }) === false,
  "Smartsheet legacy terminal rows must not be created as modern pipeline records."
);
assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ current_task_description: "Completed Sale" }) === false,
  "Completed Sale rows must not be created as modern pipeline records."
);
assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ current_task_description: "Prospect Initiation" }) === true,
  "Active Smartsheet rows should still create as modern pipeline opportunities."
);

// Synthetic live-record scenarios: unchanged pulls must never need a write.
const syncedRecord = {
  client_name: "Example Client",
  lead_source: "Web",
  estimate_amount: 250,
  sales_status: "lead", // Base44-only, never compared to Smartsheet.
  smartsheet_last_synced_at: "2026-09-24T15:00:00Z",
  smartsheet_sync_snapshot: { "11": "Example Client", "12": 250, "13": "Web", "14": "" },
};
const snapshot = { "11": "Example Client", "12": 250, "13": "Web", "14": "" };
const sameRemote = { client_name: "Example Client", estimate_amount: "250", lead_source: "Web" };
assert(salesPulledFieldsUnchanged(syncedRecord, sameRemote), "Unchanged Sales values, including numeric strings, must not cause a write.");
assert(salesPullSnapshotAligned(syncedRecord, snapshot), "An existing matching snapshot must allow a true no-op.");
assert(!salesPulledFieldsUnchanged(syncedRecord, { ...sameRemote, estimate_amount: "275" }), "A changed estimate must remain eligible for reconciliation.");
assert(!salesPulledFieldsUnchanged(syncedRecord, { ...sameRemote, current_task_description: "Follow Up" }), "A newly populated task must not be skipped.");
assert(!salesPulledFieldsUnchanged({ ...syncedRecord, estimate_amount: null }, { estimate_amount: 0 }), "An unknown estimate must not be treated as zero.");
assert(!salesPullSnapshotAligned({ ...syncedRecord, smartsheet_sync_snapshot: null }, snapshot), "Missing snapshots must not bypass reconciliation.");
assert(!salesPullSnapshotAligned({ ...syncedRecord, smartsheet_last_synced_at: null }, snapshot), "Unverified rows must not be treated as synced.");
assert(!salesPullSnapshotAligned(syncedRecord, { ...snapshot, "14": "changed notes" }), "A stale notes snapshot must not be skipped.");
assert(!salesPullSnapshotAligned(syncedRecord, { ...snapshot, "15": "new binding" }), "A newly bound field must not inherit an unrelated old snapshot.");

// Push skips only a verified, correctly linked, unchanged Sales record.
const linkedRecord = { ...syncedRecord, smartsheet_row_id: "12345", smartsheet_sheet_id: "8702703019812740" };
const salesSheetId = "8702703019812740";
assert(salesPushRecordUnchanged(linkedRecord, salesSheetId, snapshot), "A verified unchanged Sales record must skip push.");
assert(!salesPushRecordUnchanged({ ...linkedRecord, smartsheet_row_id: null }, salesSheetId, snapshot), "New Sales records must still push.");
assert(!salesPushRecordUnchanged(linkedRecord, "999", snapshot), "A different linked sheet must still reconcile.");
assert(!salesPushRecordUnchanged({ ...linkedRecord, smartsheet_sync_snapshot: null }, salesSheetId, snapshot), "Missing snapshots must still reconcile.");
assert(!salesPushRecordUnchanged(linkedRecord, salesSheetId, { ...snapshot, "12": 275 }), "Changed estimates must still push.");
assert(!salesPushRecordUnchanged(linkedRecord, salesSheetId, { ...snapshot, "14": "Updated notes" }), "Changed notes must still reconcile.");
assert(!salesPushRecordUnchanged(linkedRecord, salesSheetId, {}), "An empty snapshot must not suppress a push.");

// Legacy Sales snapshots predate the Est / Inv # binding. Never auto-push
// such linked production records until the newly mapped field is reconciled.
const mappedSnapshot = { ...snapshot, "4624329576763268": null };
assert(salesPushSnapshotNeedsReview(linkedRecord, salesSheetId, mappedSnapshot), "Old linked snapshot missing Est / Inv # must block automatic Sales push.");
assert(!salesPushSnapshotNeedsReview({ ...linkedRecord, smartsheet_sync_snapshot: mappedSnapshot }, salesSheetId, mappedSnapshot), "A complete linked snapshot may continue to normal push conflict checks.");
assert(salesPushSnapshotNeedsReview({ ...linkedRecord, smartsheet_sync_snapshot: null }, salesSheetId, mappedSnapshot), "Missing snapshot must require review.");
assert(salesPushSnapshotNeedsReview({ ...linkedRecord, smartsheet_last_synced_at: null }, salesSheetId, mappedSnapshot), "Unverified timestamp must require review.");
assert(!salesPushSnapshotNeedsReview({ ...linkedRecord, smartsheet_row_id: null }, salesSheetId, mappedSnapshot), "New unlinked opportunities use separate creation safeguards.");
assert(!salesPushSnapshotNeedsReview(linkedRecord, "999", mappedSnapshot), "Different-sheet links remain outside this Sales preflight.");

console.log("Smartsheet Sales boundary validation passed.");
