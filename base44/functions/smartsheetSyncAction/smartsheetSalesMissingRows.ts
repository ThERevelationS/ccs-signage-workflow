// Quarantine only verified missing permanent links, without deleting, unlinking,
// recreating rows, or manufacturing a snapshot for a row that does not exist.
export async function findMissingSalesLinks(candidates, sheetId, bindings, readSheet, verifiedColumn) {
  const missing = [];
  const evidenceColumnId = Object.values(bindings)[0];
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100);
    const requested = new Set(batch.map(record => String(record.smartsheet_row_id).trim()));
    const params = new URLSearchParams({ rowIds: [...requested].join(','), columnIds: String(evidenceColumnId) });
    const body = await readSheet(`/sheets/${sheetId}?${params}`);
    if (String(body?.id) !== sheetId || !Array.isArray(body?.rows) || !verifiedColumn(body?.columns, evidenceColumnId)) {
      throw new Error('Sales missing-row preflight could not verify the configured sheet and column. No rows were written.');
    }
    const returnedIds = body.rows.map(row => String(row?.id || ''));
    if (new Set(returnedIds).size !== returnedIds.length || returnedIds.some(id => !requested.has(id))) {
      throw new Error('Sales missing-row preflight returned unexpected row identities. No rows were written.');
    }
    const present = new Set(returnedIds);
    missing.push(...batch.filter(record => !present.has(String(record.smartsheet_row_id))).map(record => String(record.id)));
  }
  return new Set(missing);
}