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
