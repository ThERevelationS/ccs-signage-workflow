import { normalizeSheetRows } from './smartsheetSyncUtils.ts';

// The Sales PUT acknowledgement is not proof that the correct rows persisted.
// Require a complete, unambiguous read-back before comparing field snapshots
// or allowing Base44 metadata/approved decisions to advance.
export function verifiedSalesReadbackRows(body, sheetId, requestedRowIds, mappedColumnIds) {
  const targetSheet = String(sheetId ?? '').trim();
  const requested = (requestedRowIds || []).map(id => String(id ?? '').trim());
  const columns = (mappedColumnIds || []).map(id => String(id ?? '').trim());
  if (!/^[0-9]+$/.test(targetSheet) ||
      !requested.length || requested.some(id => !/^[0-9]+$/.test(id)) ||
      new Set(requested).size !== requested.length ||
      !columns.length || columns.some(id => !/^[0-9]+$/.test(id)) ||
      new Set(columns).size !== columns.length) {
    throw new Error('Sales read-back requested invalid or duplicate row/column identities.');
  }
  if (String(body?.id ?? '') !== targetSheet ||
      !Array.isArray(body?.rows) || !Array.isArray(body?.columns)) {
    throw new Error('Sales read-back did not confirm the requested Smartsheet sheet and rows.');
  }
  const returnedColumns = body.columns.map(col => String(col?.id ?? ''));
  if (new Set(returnedColumns).size !== returnedColumns.length ||
      columns.some(id => !returnedColumns.includes(id))) {
    throw new Error('Sales read-back did not confirm all mapped Smartsheet columns uniquely.');
  }
  const expected = new Set(requested);
  const actual = body.rows.map(row => String(row?.id ?? ''));
  if (actual.length !== requested.length ||
      new Set(actual).size !== actual.length ||
      actual.some(id => !expected.has(id))) {
    throw new Error('Sales read-back returned missing, duplicate or unexpected permanent rows.');
  }
  const mapped = new Set(columns);
  for (const row of body.rows) {
    if (!Array.isArray(row?.cells)) {
      throw new Error('Sales read-back returned an unreadable row cell collection.');
    }
    const seen = new Set();
    for (const cell of row.cells) {
      const columnId = String(cell?.columnId ?? '');
      if (!mapped.has(columnId)) continue;
      if (seen.has(columnId)) {
        throw new Error('Sales read-back returned duplicate mapped cells.');
      }
      seen.add(columnId);
    }
  }
  const rows = normalizeSheetRows(body);
  if (rows.length !== requested.length) {
    throw new Error('Sales read-back row normalization was incomplete.');
  }
  return new Map(rows.map(row => [String(row.id), row]));
}
