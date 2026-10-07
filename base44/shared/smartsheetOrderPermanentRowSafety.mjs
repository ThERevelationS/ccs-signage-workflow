const cleanId = value => {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};

export function classifyOrderPermanentRowIdentity(record, configuredSheetId, remoteRowIds) {
  const sheetId = cleanId(configuredSheetId);
  const storedSheetId = cleanId(record?.smartsheet_sheet_id);
  const rowId = cleanId(record?.smartsheet_row_id);
  const ids = remoteRowIds instanceof Set
    ? remoteRowIds
    : new Set((Array.isArray(remoteRowIds) ? remoteRowIds : [])
        .map(value => cleanId(value?.id ?? value)).filter(Boolean));

  if (!sheetId || !rowId || storedSheetId !== sheetId) {
    return {
      state: 'invalid_link',
      sheet_id: storedSheetId,
      row_id: rowId,
      reason: 'The Base44 Order does not have one valid permanent row ID on the configured Order Request sheet.',
    };
  }
  if (ids.has(rowId)) {
    return {
      state: 'linked',
      sheet_id: sheetId,
      row_id: rowId,
      reason: 'The exact permanent Smartsheet row ID still exists. Visual row position is irrelevant.',
    };
  }
  return {
    state: 'missing_permanent_row',
    sheet_id: sheetId,
    row_id: rowId,
    reason: 'The stored permanent Smartsheet row ID is absent. Keep the Base44 link and local data unchanged for review; never relink by customer, description, row position, or a replacement row with similar values.',
  };
}
