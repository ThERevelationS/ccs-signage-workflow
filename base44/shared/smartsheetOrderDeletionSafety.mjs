const numericId = (value) => {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};

export function classifyOrderDeletedLinkTombstones(records, configuredSheetId) {
  const sheetId = numericId(configuredSheetId);
  if (!sheetId || !Array.isArray(records)) {
    throw new Error('Order deletion safety needs a permanent sheet ID and complete linked Order list.');
  }
  const deletedRowIds = new Set();
  const activeRowIds = new Set();
  for (const record of records) {
    if (numericId(record?.smartsheet_sheet_id) !== sheetId) continue;
    const rowId = numericId(record?.smartsheet_row_id);
    if (!rowId) continue;
    if (record?.deleted === true) deletedRowIds.add(rowId);
    else activeRowIds.add(rowId);
  }
  const shadowedDeletedRowIds = [...deletedRowIds].filter(rowId => activeRowIds.has(rowId)).sort();
  const tombstoneRowIds = new Set([...deletedRowIds].filter(rowId => !activeRowIds.has(rowId)));
  return { sheetId, deletedRowIds, activeRowIds, tombstoneRowIds, shadowedDeletedRowIds };
}
