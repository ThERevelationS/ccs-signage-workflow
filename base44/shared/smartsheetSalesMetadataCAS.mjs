const val = value => String(value ?? '').trim();
const numeric = value => /^\d+$/.test(val(value)) && val(value) !== '0';

// A remote read-back does not authorize overwriting newer local Sales edits.
// Every linked Sales metadata reconciliation must match the planned WorkOrder
// revision and permanent sheet+row identity, including ordinary (unapproved)
// updates. This is a per-WorkOrder CAS, NOT a global row uniqueness index.
export async function commitVerifiedSalesMetadata({
  entity, recordId, plannedVersion, sheetId, rowId, fields, assertRunOwnership,
}) {
  if (!entity?.updateMany || typeof assertRunOwnership !== 'function' ||
      !val(recordId) || !val(plannedVersion) || !numeric(sheetId) ||
      !numeric(rowId) || !fields || typeof fields !== 'object' ||
      Array.isArray(fields) || !Object.keys(fields).length ||
      Object.hasOwn(fields, 'id') || Object.hasOwn(fields, 'updated_date') ||
      Object.hasOwn(fields, 'smartsheet_sheet_id') ||
      Object.hasOwn(fields, 'smartsheet_row_id')) {
    throw new Error('Sales metadata requires a versioned permanent-row CAS; no WorkOrder was changed.');
  }
  await assertRunOwnership();
  const result = await entity.updateMany(
    { id: val(recordId), updated_date: val(plannedVersion),
      smartsheet_sheet_id: val(sheetId), smartsheet_row_id: val(rowId) },
    { $set: fields },
  );
  if (result?.updated !== 1) {
    throw new Error('Sales WorkOrder changed or was relinked during sync. Newer local edits remain pending.');
  }
  return true;
}
