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
