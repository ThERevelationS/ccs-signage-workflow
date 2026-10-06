import { orderHasSmartsheetRelationship } from './orderDeletionSmartsheetSafety.mjs';

const numericId = (value) => {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};

export function orderRestoreSmartsheetIdentity(order = {}) {
  const hasRelationship = orderHasSmartsheetRelationship(order);
  if (!hasRelationship) return { hasRelationship: false, sheetId: '', rowId: '' };
  return {
    hasRelationship: true,
    sheetId: numericId(order?.smartsheet_sheet_id),
    rowId: numericId(order?.smartsheet_row_id),
  };
}

export function assertOrderRestoreSmartsheetSafe(order, activeLinkedOrders = [], label = 'Order recovery') {
  const identity = orderRestoreSmartsheetIdentity(order);
  if (!identity.hasRelationship) return { ...identity, pendingLocalSync: order?.smartsheet_pending_local_sync === true };
  if (!identity.sheetId || !identity.rowId) {
    throw new Error(
      `${label} is blocked because this trash Order has Smartsheet history but does not have one complete permanent sheet + row identity. Review the relationship before restoring it.`
    );
  }
  if (!Array.isArray(activeLinkedOrders)) {
    throw new Error(`${label} could not verify active Orders that use the same permanent Smartsheet row.`);
  }
  const conflicts = activeLinkedOrders.filter(candidate =>
    candidate?.deleted !== true &&
    String(candidate?.id || '') !== String(order?.id || '') &&
    numericId(candidate?.smartsheet_sheet_id) === identity.sheetId &&
    numericId(candidate?.smartsheet_row_id) === identity.rowId
  );
  if (conflicts.length) {
    throw new Error(
      `${label} is blocked because permanent Smartsheet row ${identity.rowId} is already owned by ${conflicts.length} active Base44 Order${conflicts.length === 1 ? '' : 's'}. Restoring this historical duplicate would create two active Orders for one permanent row.`
    );
  }
  return {
    ...identity,
    pendingLocalSync: order?.smartsheet_pending_local_sync === true,
  };
}
