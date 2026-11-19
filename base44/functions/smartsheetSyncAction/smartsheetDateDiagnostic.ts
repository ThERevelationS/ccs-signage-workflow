// Existing read-only legacy date diagnostic, extracted without changing its contract.
export async function smartsheetDateDiagnostic({ base44, config, token, smartsheetGet, normalizeSheetRows, cleanText }) {
  if (!config) return Response.json({ success: false, error: 'No sync config.' }, { status: 400 });
  const profile = config?.orders || {};
  const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
  const bindings = profile?.column_bindings || {};
  const dateOrderedCol = String(bindings?.date_ordered || '').trim();
  const dateReceivedCol = String(bindings?.date_received || '').trim();
  const columnIds = [dateOrderedCol, dateReceivedCol].filter(id => /^\d+$/.test(id));
  if (!columnIds.length) return Response.json({ success: false, error: 'No date column bindings.' }, { status: 400 });
  const allRows = [];
  let totalRowCount = 0;
  for (let page = 1; page <= 100; page++) {
    const params = new URLSearchParams({ page: String(page), pageSize: '200', columnIds: columnIds.join(','), exclude: 'nonexistentCells' });
    const result = await smartsheetGet(`/sheets/${sheetId}?${params}`, token);
    const rows = normalizeSheetRows(result.body);
    if (page === 1) totalRowCount = Number(result.body?.totalRowCount || 0);
    allRows.push(...rows);
    if (allRows.length >= totalRowCount || rows.length === 0) break;
  }
  const rawRecords = await base44.asServiceRole.entities.Order.filter({ smartsheet_sheet_id: sheetId }, '-updated_date', 5000);
  const existingRecords = (Array.isArray(rawRecords) ? rawRecords : []).filter(r => !r?.deleted);
  const recordsByRowId = {};
  for (const rec of existingRecords) {
    const rowId = cleanText(rec?.smartsheet_row_id, 40);
    if (rowId) recordsByRowId[rowId] = rec;
  }
  const parseDate = value => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  };
  const discrepancies = [];
  let ssHasOrderedB44Missing = 0, ssHasReceivedB44Missing = 0, matchedCount = 0, unmatchedCount = 0;
  let ssRowsWithOrdered = 0, ssRowsWithReceived = 0, ssRowsWithValidOrderedDate = 0, ssRowsWithValidReceivedDate = 0;
  const nonDateValues = { ordered: {}, received: {} };
  for (const row of allRows) {
    const rec = recordsByRowId[row.id];
    const orderedCell = row.cells.find(c => c.column_id === dateOrderedCol);
    const receivedCell = row.cells.find(c => c.column_id === dateReceivedCol);
    const orderedRaw = orderedCell?.value ?? orderedCell?.display_value;
    const receivedRaw = receivedCell?.value ?? receivedCell?.display_value;
    const orderedParsed = orderedRaw ? parseDate(orderedRaw) : null;
    const receivedParsed = receivedRaw ? parseDate(receivedRaw) : null;
    if (orderedRaw) ssRowsWithOrdered++;
    if (receivedRaw) ssRowsWithReceived++;
    if (orderedParsed) ssRowsWithValidOrderedDate++;
    if (receivedParsed) ssRowsWithValidReceivedDate++;
    if (orderedRaw && !orderedParsed) {
      const key = String(orderedRaw).slice(0, 50);
      nonDateValues.ordered[key] = (nonDateValues.ordered[key] || 0) + 1;
    }
    if (receivedRaw && !receivedParsed) {
      const key = String(receivedRaw).slice(0, 50);
      nonDateValues.received[key] = (nonDateValues.received[key] || 0) + 1;
    }
    if (!rec) { unmatchedCount++; continue; }
    matchedCount++;
    if (orderedParsed && !rec.date_ordered) ssHasOrderedB44Missing++;
    if (receivedParsed && !rec.date_received) ssHasReceivedB44Missing++;
    if ((orderedParsed && !rec.date_ordered) || (receivedParsed && !rec.date_received)) {
      discrepancies.push({ row_id: row.id, customer: rec.customer_name,
        b44_ordered: rec.date_ordered, b44_received: rec.date_received,
        ss_ordered_raw: orderedRaw ?? null, ss_ordered_parsed: orderedParsed,
        ss_received_raw: receivedRaw ?? null, ss_received_parsed: receivedParsed });
    }
  }
  const colResult = await smartsheetGet(`/sheets/${sheetId}/columns?includeAll=true`, token);
  const allColumns = (Array.isArray(colResult.body?.data) ? colResult.body.data : []).map(c => ({
    id: String(c?.id ?? ''), title: cleanText(c?.title, 300), type: cleanText(c?.type, 80),
  })).filter(c => c.id);
  const columnInfo = id => ({ id, title: allColumns.find(c => c.id === id)?.title, type: allColumns.find(c => c.id === id)?.type });
  return Response.json({ success: true, total_smartsheet_rows: allRows.length,
    matched_count: matchedCount, unmatched_count: unmatchedCount, b44_records_total: existingRecords.length,
    ss_rows_with_ordered: ssRowsWithOrdered, ss_rows_with_received: ssRowsWithReceived,
    ss_rows_with_valid_ordered_date: ssRowsWithValidOrderedDate, ss_rows_with_valid_received_date: ssRowsWithValidReceivedDate,
    non_date_values_ordered: nonDateValues.ordered, non_date_values_received: nonDateValues.received,
    ss_has_ordered_b44_missing: ssHasOrderedB44Missing, ss_has_received_b44_missing: ssHasReceivedB44Missing,
    discrepancy_count: discrepancies.length, discrepancies: discrepancies.slice(0, 20),
    bound_date_ordered_col: columnInfo(dateOrderedCol), bound_date_received_col: columnInfo(dateReceivedCol),
    all_date_columns: allColumns.filter(c => c.type === 'DATE' || c.title?.toLowerCase().includes('date') || c.title?.toLowerCase().includes('ordered') || c.title?.toLowerCase().includes('received')),
  });
}