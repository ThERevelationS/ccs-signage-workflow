// A new WorkOrder must receive fresh external synchronization identities.
// Duplicate forms are prefilled from complete existing WorkOrders, including
// hidden Smartsheet link/POST markers. None of those markers may be reused by
// an ordinary new WorkOrder creation. Authorized imports/recovery use their
// separately guarded backend paths, never this UI create helper.
export const NEW_WORKORDER_PROTECTED_SYNC_FIELDS = Object.freeze([
  "smartsheet_sheet_id",
  "smartsheet_row_id",
  "smartsheet_parent_row_id",
  "smartsheet_last_synced_at",
  "smartsheet_sync_snapshot",
  "smartsheet_create_attempt",
  "sales_import_source_id",
  "sales_import_last_synced_at",
  "sales_import_snapshot",
]);

const PROTECTED = new Set(NEW_WORKORDER_PROTECTED_SYNC_FIELDS);

export function stripInheritedWorkOrderSyncIdentity(record = {}) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([field]) => !PROTECTED.has(field))
  );
}
