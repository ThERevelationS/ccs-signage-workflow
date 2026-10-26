import { readFileSync } from 'node:fs';
import {
  SALES_SYNC_ALLOWED_FIELDS,
  filterSalesColumnBindings,
  isLegacyTerminalSalesTask,
  hasDownstreamOperationalSmartsheetEvidence,
  salesPulledFieldsUnchanged,
  salesPullSnapshotAligned,
  salesPushRecordUnchanged,
  salesPushSnapshotNeedsReview,
  classifySalesEstInvPreview,
  verifiedSalesPreviewColumn,
  salesRunRequiresReview,
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
  current_task_assigned_to: "3326787726927748",
  designer: "8455599681130372",
  project_manager: "280218450585476",
  estimator: "1592097412278148",
  date_initial_contact: "7287917153412996",
  site_survey_date: "3427811003262852",
  date_order_created: "1512747249389444",
  project_install_date: "4872970838167428",
  permit_receipt_confirmed_date: "6016346876759940",
  permit_approved_date: "3764547063074692",
  permit_number: "2966620789231492",
  notes_serialized: "2555898341156740",
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
  shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "Example Client", current_task_description: "Prospect Initiation" }) === true,
  "Pre-order Smartsheet rows with a real customer should still create as current Sales candidates."
);
for (const [field, value] of [
  ["date_order_created", "2026-10-07"],
  ["project_install_date", "2026-10-21"],
  ["permit_receipt_confirmed_date", "2026-10-08"],
  ["permit_approved_date", "2026-10-09"],
  ["permit_number", "P-12345"],
]) {
  assert(
    hasDownstreamOperationalSmartsheetEvidence({ [field]: value }) === true,
    `${field} must count as objective downstream operational evidence.`
  );
  assert(
    shouldCreateSmartsheetSalesRecordInPipeline({
      client_name: "Example Client",
      current_task_description: "Follow up with Customer - Post-Estimate",
      [field]: value,
    }) === false,
    `${field} must keep a new Smartsheet WorkOrder out of Current Pipeline without inferring Won/Lost.`
  );
}
assert(
  hasDownstreamOperationalSmartsheetEvidence({
    site_survey_date: "2026-10-08",
    estimate_amount: 2500,
    lead_source: "Web",
  }) === false &&
  shouldCreateSmartsheetSalesRecordInPipeline({
    client_name: "Example Client",
    current_task_description: "Conduct Site Survey",
    site_survey_date: "2026-10-08",
    estimate_amount: 2500,
    lead_source: "Web",
  }) === true,
  "Pre-sale survey/estimate/source evidence must not be mistaken for downstream operations."
);
assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "", current_task_description: "Prospect Initiation" }) === false &&
  shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "Unknown", current_task_description: "Prospect Initiation" }) === false,
  "Blank/Unknown Smartsheet customers must never create modern pipeline opportunities."
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
assert(salesPulledFieldsUnchanged({ ...syncedRecord, current_task_assigned_to: "Brett Heinlein" },
  { current_task_assigned_to: "Brett" }),
  "Smartsheet first-name assignee labels must compare equal to the same Base44 full name.");
assert(!salesPulledFieldsUnchanged({ ...syncedRecord, current_task_assigned_to: "Brett Heinlein" },
  { current_task_assigned_to: "Carl" }),
  "Different Smartsheet first-name assignees must remain a real change.");
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

// Preview categories must stay advisory; no category authorizes a live mutation.
assert(classifySalesEstInvPreview('EST-100', 'EST-100') === 'match', 'Matching IDs should be labeled without repairing snapshots.');
assert(classifySalesEstInvPreview('EST-100', 'EST-101') === 'different', 'Conflicting IDs must be visible for manual review.');
assert(classifySalesEstInvPreview('', 'EST-100') === 'smartsheet_only', 'Smartsheet-only IDs must be preserved for review.');
assert(classifySalesEstInvPreview('EST-100', '') === 'base44_only', 'Base44-only IDs must be preserved for review.');
assert(classifySalesEstInvPreview(null, null) === 'both_blank', 'Two blank cells are not evidence of a verified snapshot.');
assert(classifySalesEstInvPreview('EST-100', null, false) === 'row_not_returned', 'Missing API rows must not be called blank or deleted.');
assert(classifySalesEstInvPreview(100, '100') === 'match', 'Text/number representation must compare consistently.');

// Realistic Get Sheet metadata: the configured column must be returned before
// absent row cells are interpreted as blank. This is not a live API test.
const estColumnId = "4624329576763268";
const sampleSheetColumns = [{ id: 3087579177346948, title: "Customer" },
  { id: 4624329576763268, title: "Est / Inv #", type: "TEXT_NUMBER" }];
assert(verifiedSalesPreviewColumn(sampleSheetColumns, estColumnId)?.title === "Est / Inv #",
  "Expected sheet column metadata must be verified by permanent ID.");
assert(verifiedSalesPreviewColumn([{ id: 3087579177346948, title: "Customer" }], estColumnId) === null,
  "A missing mapped column must not create false blank remote values.");
assert(verifiedSalesPreviewColumn(null, estColumnId) === null,
  "Missing sheet metadata must fail closed.");
assert(verifiedSalesPreviewColumn([...sampleSheetColumns, sampleSheetColumns[1]], estColumnId) === null,
  "Duplicate metadata for one column must fail closed.");
assert(verifiedSalesPreviewColumn([{ id: estColumnId, title: " " }], estColumnId) === null,
  "An unidentified Smartsheet column cannot be treated as Est / Inv #.");

// A completed coordinator loop is not a completed Sales sync if an attempted
// Sales stage was blocked, conflicted, or reported errors. Intentionally
// disabled stages and unrelated Order results do not trigger this Sales flag.
assert(salesRunRequiresReview([{ dataset: 'sales', direction: 'push', skipped: true, snapshot_review_required: 500 }]),
  'A missing Sales push snapshot must show needs_review rather than completed.');
assert(salesRunRequiresReview([{ dataset: 'sales', direction: 'pull', skipped: true, reason: 'Unable to read sheet' }]),
  'An attempted failed Sales pull must show needs_review.');
assert(salesRunRequiresReview([{ dataset: 'sales', direction: 'push', conflicts: 1, skipped: false }]),
  'A Sales push conflict must show needs_review.');
assert(salesRunRequiresReview([{ dataset: 'sales', direction: 'push', errors: 2 }]),
  'Sales push errors must show needs_review.');
const syncBackend = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
assert(/if \(records\.length > massLimit\)[\s\S]{0,180}?dataset,[\s\S]{0,80}?direction: 'push',[\s\S]{0,80}?skipped: true/.test(syncBackend),
  'The Sales mass-change hard stop must remain an attempted push so the coordinator reports needs_review.');
assert(!salesRunRequiresReview([{ dataset: 'sales', skipped: true, reason: 'Mirror disabled' }]),
  'Intentionally disabled Sales must not appear as an attempted sync failure.');
assert(!salesRunRequiresReview([{ dataset: 'orders', direction: 'push', skipped: true }]),
  'Order results must not be reclassified by the Sales-only status helper.');
assert(!salesRunRequiresReview([{ dataset: 'sales', direction: 'pull', created: 0, updated: 0, errors: 0 },
  { dataset: 'sales', direction: 'push', unchanged_skipped: 500, conflicts: 0, errors: 0 }]),
  'A verified no-op Sales sync should still report completed.');

// Held-field reviews flag a run only when their evidence is newly reported or
// unknown. A stable, already-reported review queue stays visible to admins
// without re-failing every subsequent pull.
assert(salesRunRequiresReview([{ dataset: 'sales', direction: 'pull',
  local_pending_preserved: 3, local_pending_newly_reported: 2 }]),
  'Newly reported held-field reviews must show needs_review.');
assert(salesRunRequiresReview([{ dataset: 'sales', direction: 'pull',
  local_pending_preserved: 3 }]),
  'Unknown review freshness must fail closed and show needs_review.');
assert(!salesRunRequiresReview([{ dataset: 'sales', direction: 'pull',
  local_pending_preserved: 3, local_pending_newly_reported: 0, errors: 0 },
  { dataset: 'sales', direction: 'push', unchanged_skipped: 500, errors: 0 }]),
  'A stable already-reported review queue must not re-fail every pull.');
assert(!salesRunRequiresReview([{ dataset: 'sales', direction: 'pull',
  local_pending_preserved: 0, local_pending_newly_reported: 5 }]),
  'No preserved fields means nothing held, regardless of stale counters.');

console.log("Smartsheet Sales boundary validation passed.");
