// Order Form only: write-ahead protection for uncertain Smartsheet row creation.
// If Smartsheet accepts a POST but its response or Base44 linking fails, never
// repeat the POST without an explicit, verified reconciliation.
const numericId = (raw) => {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : '';
  if (typeof raw === 'string') {
    const value = raw.trim();
    return /^\d+$/.test(value) && value !== '0' ? value : '';
  }
  return '';
};

export function createdOrderSmartsheetRowId(body) {
  if (body?.message !== 'SUCCESS' || body?.resultCode !== 0) {
    throw new Error('Smartsheet did not confirm complete Order row creation. Review the sheet before retrying.');
  }
  const rows = Array.isArray(body.result) ? body.result : [body.result];
  if (rows.length !== 1) {
    throw new Error('Smartsheet returned an unexpected number of created Order rows. Review before retrying.');
  }
  const rowId = numericId(rows[0]?.id);
  if (!rowId) {
    throw new Error('Smartsheet did not return one safe permanent Order row ID. Review before retrying.');
  }
  return rowId;
}

export function orderSmartsheetCreateNeedsReview(record) {
  // A completed marker is trustworthy only alongside its matching permanent
  // Base44 link. Preserve malformed or interrupted markers for manual review.
  const marker = record?.smartsheet_create_attempt;
  if (!marker) return false;
  const rowId = numericId(record?.smartsheet_row_id);
  return !(marker.status === 'linked' && rowId &&
    numericId(marker.row_id) === rowId &&
    String(marker.sheet_id ?? '') === String(record.smartsheet_sheet_id ?? ''));
}

// Prevent simultaneous Order POSTs in one backend runtime. The durable
// reservation below protects later invocations, including across runtimes.
const activeOrderCreates = new Set();

export async function createOrderSmartsheetRowWithGuard(args) {
  const key = String(args?.record?.id ?? '').trim();
  if (!key) throw new Error('Order Smartsheet create requires a permanent Base44 record ID.');
  if (activeOrderCreates.has(key)) {
    throw new Error('An Order Smartsheet create is already in progress. No second POST was sent.');
  }
  activeOrderCreates.add(key);
  try {
    return await performOrderSmartsheetCreate(args);
  } finally {
    activeOrderCreates.delete(key);
  }
}

async function performOrderSmartsheetCreate({
  entity,
  record,
  sheetId,
  postRow,
  makeSnapshot,
  attemptId,
  startedAt,
}) {
  const id = String(record?.id ?? '').trim();
  const targetSheet = String(sheetId ?? '').trim();
  if (!id || !/^\d+$/.test(targetSheet) ||
      typeof entity?.get !== 'function' || typeof entity?.update !== 'function' ||
      typeof postRow !== 'function' || typeof makeSnapshot !== 'function') {
    throw new Error('Order Smartsheet create protection could not initialize.');
  }

  // Check authoritative current state, not the paginated snapshot.
  const current = await entity.get(id);
  if (!current || current.deleted) throw new Error('Order no longer exists or is deleted. Creation blocked.');
  if (orderSmartsheetCreateNeedsReview(current)) {
    throw new Error('Order has an unresolved Smartsheet create attempt. Review its row before retrying.');
  }
  if (String(current.smartsheet_row_id ?? '').trim() ||
      String(current.smartsheet_sheet_id ?? '').trim()) {
    throw new Error('Order already has a Smartsheet identity or an incomplete link. Review before creating another row.');
  }

  const token = typeof attemptId === 'string' && attemptId.trim()
    ? attemptId.trim() : crypto.randomUUID();
  const started = typeof startedAt === 'string' && startedAt.trim()
    ? startedAt.trim() : new Date().toISOString();
  const marker = { sheet_id: targetSheet, attempt_id: token, started_at: started, status: 'reserved' };

  // Write BEFORE POST. Any ambiguous error at or after this point leaves a
  // durable marker; subsequent runs are not allowed to repeat the POST.
  await entity.update(id, {
    smartsheet_sheet_id: targetSheet,
    smartsheet_create_attempt: marker,
  });

  const reserved = await entity.get(id);
  if (reserved?.deleted || reserved?.smartsheet_create_attempt?.attempt_id !== token ||
      String(reserved?.smartsheet_sheet_id ?? '').trim() !== targetSheet ||
      String(reserved?.smartsheet_row_id ?? '').trim()) {
    throw new Error('Order creation reservation could not be verified. No Smartsheet POST was sent.');
  }

  let body;
  try {
    body = await postRow(current);
  } catch (error) {
    throw new Error('Smartsheet Order create outcome is uncertain. The Order is held for review; do not retry automatically.');
  }

  // Smartsheet Add Rows normally returns result: [{id: ...}], not result.id.
  // Requiring one confirmed ID avoids marking an unlinked POST as successful.
  const rowId = createdOrderSmartsheetRowId(body);
  const snapshot = makeSnapshot(current);
  const syncedAt = new Date().toISOString();
  try {
    await entity.update(id, {
      smartsheet_row_id: rowId,
      smartsheet_sheet_id: targetSheet,
      smartsheet_sync_snapshot: snapshot,
      smartsheet_last_synced_at: syncedAt,
      smartsheet_create_attempt: { ...marker, status: 'linked', row_id: rowId, linked_at: syncedAt },
    });
    const verified = await entity.get(id);
    if (String(verified?.smartsheet_row_id ?? '') !== rowId ||
        String(verified?.smartsheet_sheet_id ?? '') !== targetSheet ||
        orderSmartsheetCreateNeedsReview(verified)) {
      throw new Error('Base44 did not verify its permanent Order row link.');
    }
  } catch {
    throw new Error(`Smartsheet created Order row ${rowId}, but Base44 could not confirm its permanent link. Review and link manually; never POST again.`);
  }

  return { rowId, recordId: id };
}
