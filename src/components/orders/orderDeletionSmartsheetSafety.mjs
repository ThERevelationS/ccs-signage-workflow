export function orderHasSmartsheetRelationship(order = {}) {
  const hasSnapshot = order?.smartsheet_sync_snapshot &&
    typeof order.smartsheet_sync_snapshot === "object" &&
    !Array.isArray(order.smartsheet_sync_snapshot) &&
    Object.keys(order.smartsheet_sync_snapshot).length > 0;
  return Boolean(
    String(order?.smartsheet_sheet_id || "").trim() ||
    String(order?.smartsheet_row_id || "").trim() ||
    String(order?.smartsheet_last_synced_at || "").trim() ||
    order?.smartsheet_create_attempt ||
    hasSnapshot
  );
}

export function assertOrderPermanentDeleteSafe(order, label = "Order permanent delete") {
  if (orderHasSmartsheetRelationship(order)) {
    throw new Error(
      `${label} is blocked because this Order preserves a Smartsheet relationship or create history. ` +
      "Keep it in Order Trash or recover it; permanently deleting it would erase the permanent row identity needed to prevent orphan/recreated Orders."
    );
  }
  return true;
}
