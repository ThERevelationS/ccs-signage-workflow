import { createSmartsheetOrderPageGuard } from './smartsheetOrderPageGuard.mjs';

// Order Request pre-push backup. No production dependencies: the caller injects
// Smartsheet reads, private Google Drive upload/download, and BackupLog creation.
// Do not consider a BackupLog row evidence of a backup without byte-for-byte
// readback of the actual persistent Drive file.
export async function createVerifiedOrderSheetBackup({
  sheetId, readPage, verifySource, upload, readBack, log,
  capturedAt = new Date().toISOString(), pageSize = 200, maxPages = 100,
  maxBytes = 25_000_000,
}) {
  const permanentSheetId = String(sheetId ?? '').trim();
  if (!/^\d+$/.test(permanentSheetId) ||
      ![readPage, verifySource, upload, readBack, log].every(fn => typeof fn === 'function')) {
    throw new Error('Order pre-write backup is missing its permanent sheet identity or a required operation.');
  }
  const guard = createSmartsheetOrderPageGuard({ pageSize, maxPages });
  let version = null;
  let totalRows = null;
  let columns = null;
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = await readPage(page, pageSize);
    if (String(body?.id ?? '') !== permanentSheetId) {
      throw new Error('Order pre-write backup returned the wrong Smartsheet sheet.');
    }
    if (page === 1) {
      version = body.version;
      totalRows = body.totalRowCount;
      columns = body.columns;
      if (!Array.isArray(columns) || columns.length === 0 ||
          columns.some(column => !/^\d+$/.test(String(column?.id ?? '')) ||
            typeof column?.title !== 'string' || !column.title.trim())) {
        throw new Error('Order pre-write backup is missing complete column identities.');
      }
      const ids = columns.map(column => String(column.id));
      if (new Set(ids).size !== ids.length) {
        throw new Error('Order pre-write backup contains duplicate permanent column IDs.');
      }
    }
    const pageRows = body?.rows;
    if (!Array.isArray(pageRows) || pageRows.some(row =>
      !Array.isArray(row?.cells) || row.cells.some(cell =>
        !/^\d+$/.test(String(cell?.columnId ?? ''))))) {
      throw new Error('Order pre-write backup received malformed row/cell data.');
    }
    const finished = guard.accept(page, body, pageRows.map(row => ({ id: String(row.id ?? '') })));
    rows.push(...pageRows);
    if (finished) break;
  }
  guard.assertComplete();

  // Detect sheet changes after pagination and after the persisted copy has
  // been read back. If either comparison fails, no Smartsheet write follows.
  const unchanged = async () => {
    const current = await verifySource();
    return String(current?.id ?? '') === permanentSheetId &&
      current.version === version && current.totalRowCount === totalRows;
  };
  if (!(await unchanged())) {
    throw new Error('Order Request changed after backup pagination. No Smartsheet write was attempted.');
  }

  const timestamp = String(capturedAt).replace(/[:.]/g, '-');
  const filename = `CCS_OrderRequest_${permanentSheetId}_pre_sync_${timestamp}.json`;
  const content = JSON.stringify({
    format: 'ccs-order-request-smartsheet-prewrite-v1',
    sheet_id: permanentSheetId, sheet_version: version,
    total_row_count: totalRows, captured_at: capturedAt,
    scope: 'row_and_column_data_no_attachments',
    columns, rows,
  });
  const byteCount = new TextEncoder().encode(content).byteLength;
  if (!byteCount || byteCount > maxBytes) {
    throw new Error('Order pre-write backup is empty or exceeds the verified upload size limit.');
  }
  const uploaded = await upload({ filename, content });
  const fileId = String(uploaded?.id ?? '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    throw new Error('Order pre-write backup upload returned no verifiable persistent file ID.');
  }
  const restoredContent = await readBack(fileId);
  if (typeof restoredContent !== 'string' || restoredContent !== content) {
    throw new Error('Order pre-write backup readback did not match the original complete sheet snapshot.');
  }
  if (!(await unchanged())) {
    throw new Error('Order Request changed while backup was being verified. No Smartsheet write was attempted.');
  }
  // A successful log records where the actual recoverable artifact lives.
  // Failure to record the backup also blocks writes, even when upload succeeded.
  await log({
    filename, drive_file_id: fileId, bytes: byteCount,
    row_count: rows.length, sheet_id: permanentSheetId, version,
  });
  return { filename, drive_file_id: fileId, bytes: byteCount,
    row_count: rows.length, sheet_id: permanentSheetId, version };
}
