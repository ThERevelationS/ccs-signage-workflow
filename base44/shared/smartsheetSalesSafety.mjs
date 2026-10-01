import { smartsheetSalesAssigneeLabel } from './smartsheetSalesAssigneeTranslation.mjs';
import { hasMeaningfulSmartsheetSalesCustomer } from './smartsheetSalesImportEligibility.mjs';

// Sales Pipeline Smartsheet boundary safety.
//
// Only real, supported Workflow business columns participate in Sales sync.
// Internal identifiers/history and unrelated fields remain Base44-only.
export const SALES_SYNC_ALLOWED_FIELDS = Object.freeze([
  "client_name",
  "lead_source",
  "est_inv_at",
  "estimate_amount",
  "current_task_description",
  "current_task_assigned_to",
  "current_task_deadline",
  "designer",
  "project_manager",
  "estimator",
  "date_initial_contact",
  "site_survey_date",
  "date_estimate_sent",
  "date_order_created",
  "project_install_date",
  "permit_receipt_confirmed_date",
  "permit_approved_date",
  "permit_number",
  "notes_serialized",
]);

const SALES_SYNC_ALLOWED_FIELD_SET = new Set(SALES_SYNC_ALLOWED_FIELDS);
const LEGACY_TERMINAL_TASK_PATTERN = /^(lost\b|completed sale\b|closed\b)/i;

export function filterSalesColumnBindings(bindings = {}) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return {};
  return Object.fromEntries(
    Object.entries(bindings).filter(([field, columnId]) =>
      SALES_SYNC_ALLOWED_FIELD_SET.has(field) && /^\d+$/.test(String(columnId ?? "").trim())
    )
  );
}

export function isLegacyTerminalSalesTask(value) {
  return LEGACY_TERMINAL_TASK_PATTERN.test(String(value ?? "").trim());
}

export function shouldCreateSmartsheetSalesRecordInPipeline(fields = {}) {
  return hasMeaningfulSmartsheetSalesCustomer(fields) &&
    !isLegacyTerminalSalesTask(fields?.current_task_description);
}

// Only skip a linked Sales pull when every populated inbound field already
// agrees with the record AND its existing snapshot already reflects that state.
// Missing/old snapshots still follow the existing reconciliation path.
export function salesPulledFieldsUnchanged(existing = {}, incoming = {}) {
  return Object.entries(incoming).every(([key, value]) => {
    if (key === 'work_notes') return JSON.stringify(existing?.work_notes || []) === JSON.stringify(value || []);
    if (!SALES_SYNC_ALLOWED_FIELD_SET.has(key)) return false;
    const current = existing?.[key];
    if (key === "estimate_amount") {
      return current != null && current !== "" && Number.isFinite(Number(current)) &&
        Number.isFinite(Number(value)) && Number(current) === Number(value);
    }
    if (key === "current_task_assigned_to") {
      return smartsheetSalesAssigneeLabel(current) === smartsheetSalesAssigneeLabel(value);
    }
    return String(current ?? "").trim() === String(value ?? "").trim();
  });
}

export function salesPullSnapshotAligned(existing = {}, expectedSnapshot = {}) {
  const prior = existing?.smartsheet_sync_snapshot;
  if (!existing?.smartsheet_last_synced_at || !prior || typeof prior !== "object" ||
      Array.isArray(prior) || !expectedSnapshot || typeof expectedSnapshot !== "object") return false;
  const columns = Object.entries(expectedSnapshot);
  return columns.length > 0 && columns.every(([columnId, value]) => {
    if (!Object.prototype.hasOwnProperty.call(prior, columnId)) return false;
    const previous = prior[columnId];
    if (previous == null || value == null) return previous == null && value == null;
    return String(previous).trim() === String(value).trim();
  });
}

// A linked Sales record needs no push if its current bound values still match
// its last verified snapshot. Do not fetch or overwrite the remote row merely
// to refresh timestamps; a remote-only change belongs to the pull path.
// Never skip new or differently linked records, or records missing a snapshot.
export function salesPushRecordUnchanged(record = {}, sheetId = "", expectedSnapshot = {}) {
  const linkedRowId = String(record?.smartsheet_row_id ?? "").trim();
  const linkedSheetId = String(record?.smartsheet_sheet_id ?? "").trim();
  return /^\d+$/.test(linkedRowId) && linkedSheetId === String(sheetId).trim() &&
    /^\d+$/.test(linkedSheetId) && salesPullSnapshotAligned(record, expectedSnapshot);
}

function sameKnownSalesSnapshotValue(columnId, current, previous, assigneeColumnId = "") {
  if (columnId === String(assigneeColumnId || "").trim()) {
    return smartsheetSalesAssigneeLabel(current).toLowerCase() ===
      smartsheetSalesAssigneeLabel(previous).toLowerCase();
  }
  const currentBlank = current == null || String(current).trim() === "";
  const previousBlank = previous == null || String(previous).trim() === "";
  if (currentBlank || previousBlank) return currentBlank && previousBlank;
  if (typeof current === "number" || typeof previous === "number") {
    const a = Number(current);
    const b = Number(previous);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }
  return String(current).trim() === String(previous).trim();
}

export function salesSnapshotsEqual(expectedSnapshot = {}, actualSnapshot = {}, assigneeColumnId = "") {
  const expectedColumns = Object.keys(expectedSnapshot || {});
  if (expectedColumns.length === 0 || !actualSnapshot || typeof actualSnapshot !== "object" ||
      Array.isArray(actualSnapshot)) return false;
  return expectedColumns.every((columnId) =>
    Object.prototype.hasOwnProperty.call(actualSnapshot, columnId) &&
    sameKnownSalesSnapshotValue(
      columnId,
      expectedSnapshot[columnId],
      actualSnapshot[columnId],
      assigneeColumnId,
    )
  );
}

// Detect local Base44 edits without treating a newly-added Smartsheet binding
// as a local change. Only columns that already existed in the last verified
// snapshot are comparable. This lets pull safely fill a new binding baseline
// while preserving real local edits for the subsequent push/conflict check.
export function salesRecordHasLocalChangesSinceSnapshot(
  record = {},
  expectedSnapshot = {},
  assigneeColumnId = "",
) {
  const prior = record?.smartsheet_sync_snapshot;
  if (!record?.smartsheet_last_synced_at || !prior || typeof prior !== "object" || Array.isArray(prior)) {
    return false;
  }
  return Object.entries(expectedSnapshot || {}).some(([columnId, current]) =>
    Object.prototype.hasOwnProperty.call(prior, columnId) &&
    !sameKnownSalesSnapshotValue(columnId, current, prior[columnId], assigneeColumnId)
  );
}

// A previously linked Sales record with no verified snapshot for every current
// bound column must not be blindly rewritten. A new mapping (such as Est / Inv #)
// can be absent from an old snapshot even when the Smartsheet cell has data.
// Leave new, unlinked opportunities to the separate creation safety workflow.
export function salesPushSnapshotNeedsReview(record = {}, sheetId = "", expectedSnapshot = {}) {
  const rowId = String(record?.smartsheet_row_id ?? "").trim();
  const linkedSheetId = String(record?.smartsheet_sheet_id ?? "").trim();
  if (!/^\d+$/.test(rowId) || !/^\d+$/.test(linkedSheetId) || linkedSheetId !== String(sheetId).trim()) return false;
  const prior = record?.smartsheet_sync_snapshot;
  if (!record?.smartsheet_last_synced_at || !prior || typeof prior !== "object" || Array.isArray(prior)) return true;
  const requiredColumns = Object.keys(expectedSnapshot || {});
  return requiredColumns.length === 0 || requiredColumns.some((columnId) =>
    !Object.prototype.hasOwnProperty.call(prior, columnId)
  );
}

// Strictly read-only review classification for a newly mapped Est / Inv # cell.
// Matching values are observations, never permission to backfill snapshots.
export function classifySalesEstInvPreview(localValue, remoteValue, rowExists = true) {
  if (!rowExists) return "row_not_returned";
  const local = String(localValue ?? "").trim();
  const remote = String(remoteValue ?? "").trim();
  if (!local && !remote) return "both_blank";
  if (!local) return "smartsheet_only";
  if (!remote) return "base44_only";
  return local === remote ? "match" : "different";
}

// Get Sheet must return the actual bound column before an omitted cell can
// safely be interpreted as blank. Smartsheet returns only requested columns
// when columnIds is supplied; no match, ambiguous IDs, or missing metadata
// means the preview must fail closed without classifying any row.
export function verifiedSalesPreviewColumn(columns, expectedColumnId) {
  const id = String(expectedColumnId ?? "").trim();
  if (!/^\d+$/.test(id) || !Array.isArray(columns)) return null;
  const matches = columns.filter((column) => String(column?.id ?? "").trim() === id);
  if (matches.length !== 1) return null;
  const title = String(matches[0]?.title ?? "").trim();
  return title ? { id, title: title.slice(0, 180) } : null;
}

// An executed Sales stage is not successful merely because the coordinator
// finished its loop. Deliberately disabled stages have no direction and do not
// count as failures; blocked stages, errors, and conflicts require review.
export function salesRunRequiresReview(results = []) {
  return Array.isArray(results) && results.some((result) =>
    result?.dataset === "sales" && (
      (result?.skipped === true && (result?.direction === "pull" || result?.direction === "push")) ||
      Number(result?.errors || 0) > 0 || Number(result?.conflicts || 0) > 0 ||
      Number(result?.snapshot_review_required || 0) > 0 ||
      Number(result?.assignee_translation_review_required || 0) > 0 ||
      Number(result?.local_pending_preserved || 0) > 0 ||
      Number(result?.business_field_write_failures || 0) > 0 ||
      Number(result?.snapshot_write_failures || 0) > 0 ||
      Number(result?.orphans_flagged_for_review || 0) > 0 ||
      Number(result?.missing_remote_rows_preserved || 0) > 0 ||
      Number(result?.duplicate_groups_flagged_for_review || 0) > 0
    )
  );
}