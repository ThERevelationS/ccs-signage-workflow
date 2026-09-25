// Sales Pipeline Smartsheet boundary safety.
//
// The live Sales Pipeline intentionally keeps most sales/workflow fields
// Base44-only. Persisted Smartsheet config can outlive UI changes, so the
// backend must never trust column_bindings as its write contract.
export const SALES_SYNC_ALLOWED_FIELDS = Object.freeze([
  "client_name",
  "lead_source",
  "est_inv_at",
  "estimate_amount",
  "current_task_description",
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
  return !isLegacyTerminalSalesTask(fields?.current_task_description);
}

// Only skip a linked Sales pull when every populated inbound field already
// agrees with the record AND its existing snapshot already reflects that state.
// Missing/old snapshots still follow the existing reconciliation path.
export function salesPulledFieldsUnchanged(existing = {}, incoming = {}) {
  return Object.entries(incoming).every(([key, value]) => {
    if (!SALES_SYNC_ALLOWED_FIELD_SET.has(key)) return false;
    const current = existing?.[key];
    if (key === "estimate_amount") {
      return current != null && current !== "" && Number.isFinite(Number(current)) &&
        Number.isFinite(Number(value)) && Number(current) === Number(value);
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

