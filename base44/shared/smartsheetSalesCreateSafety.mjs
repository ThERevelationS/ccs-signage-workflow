import { salesSnapshotsEqual } from './smartsheetSalesSafety.mjs';

const id = (value) => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return '';
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  const text = String(value).trim();
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};
const equalSnapshot = (left, right) =>
  left && right && typeof left === 'object' && typeof right === 'object' &&
  !Array.isArray(left) && !Array.isArray(right) &&
  Object.keys(left).length > 0 &&
  Object.keys(left).length === Object.keys(right).length &&
  salesSnapshotsEqual(left, right);

export function createdSalesSmartsheetRowId(body) {
  if (body?.message !== 'SUCCESS' || body?.resultCode !== 0) {
    throw new Error('Smartsheet did not confirm the Sales create. The attempt remains held for review; never repeat an uncertain POST.');
  }
  const rows = Array.isArray(body.result) ? body.result : [body.result];
  if (rows.length !== 1 || !id(rows[0]?.id)) {
    throw new Error('Smartsheet did not return exactly one verified permanent Sales row ID. Review the held attempt; never repeat the POST.');
  }
  return id(rows[0].id);
}

export function salesSmartsheetCreateNeedsReview(record) {
  const marker = record?.smartsheet_create_attempt;
  if (!marker) return false;
  return !(marker.status === 'linked' &&
    id(marker.sheet_id) === id(record.smartsheet_sheet_id) &&
    id(marker.row_id) && id(marker.row_id) === id(record.smartsheet_row_id));
}

// The CAS reservation is durable across runtimes, failed requests and later
// syncs. A reserved-but-unknown remote POST is never automatically repeated.
export async function createSalesSmartsheetRowWithGuard({
  entity, record, sheetId, postRow, makeSnapshot, verifyCreatedRow, assertOwner,
  readCompetingClaims, attemptId, startedAt,
}) {
  const recordId = String(record?.id ?? '').trim();
  const target = id(sheetId);
  if (!recordId || !target || !entity?.get || !entity?.updateMany ||
      !postRow || !makeSnapshot || !verifyCreatedRow) {
    throw new Error('Sales create reservation could not initialize. No Smartsheet POST was sent.');
  }
  const owner = typeof assertOwner === 'function' ? assertOwner : async () => {};
  const fail = (message) => { throw new Error(message); };
  const finalize = async (marker, rowId, recovered) => {
    await owner();
    if (await verifyCreatedRow({rowId, expectedSnapshot: marker.expected_snapshot, recovered}) !== true) {
      fail('Smartsheet Sales row ' + rowId + ' cannot be verified against the reserved snapshot. Keep the attempt for review; never repeat POST.');
    }
    await owner();
    const current = await entity.get(recordId);
    if (!current || current.deleted || current.smartsheet_create_attempt?.attempt_id !== marker.attempt_id ||
        current.smartsheet_create_attempt?.status !== 'created_unlinked' ||
        id(current.smartsheet_create_attempt?.row_id) !== rowId ||
        id(current.smartsheet_row_id) || !current.updated_date ||
        (id(current.smartsheet_sheet_id) && id(current.smartsheet_sheet_id) !== target)) {
      fail('Sales row exists, but the Base44 create evidence or WorkOrder changed. Review the attempt; never repeat POST.');
    }
    const newerLocalEditsRemain = !equalSnapshot(makeSnapshot(current), marker.expected_snapshot);
    const syncedAt = new Date().toISOString();
    const updated = await entity.updateMany({id: recordId, updated_date: current.updated_date}, {
      $set: {
        smartsheet_sheet_id: target, smartsheet_row_id: rowId,
        smartsheet_sync_snapshot: marker.expected_snapshot,
        smartsheet_last_synced_at: syncedAt,
        smartsheet_create_attempt: {...marker, status:'linked', linked_at:syncedAt},
      },
    });
    if (updated?.updated !== 1) {
      fail('Sales WorkOrder changed during permanent link save. The remote row remains held for recovery, never another POST.');
    }
    const saved = await entity.get(recordId);
    if (id(saved?.smartsheet_sheet_id) !== target || id(saved?.smartsheet_row_id) !== rowId ||
        saved?.smartsheet_create_attempt?.status !== 'linked' ||
        saved?.smartsheet_create_attempt?.attempt_id !== marker.attempt_id ||
        !equalSnapshot(saved?.smartsheet_sync_snapshot, marker.expected_snapshot) ||
        saved?.smartsheet_last_synced_at !== syncedAt) {
      fail('Sales permanent Smartsheet link could not be verified after create. Review before retrying; never POST again.');
    }
    return {rowId, recovered, newerLocalEditsRemain};
  };

  await owner();
  const current = await entity.get(recordId);
  if (!current || current.deleted) fail('Sales WorkOrder missing or deleted. No Smartsheet row was created.');
  const marker = current.smartsheet_create_attempt;
  if (marker) {
    const recoverId = id(marker.row_id);
    if (marker.status === 'created_unlinked' && id(marker.sheet_id) === target &&
        recoverId && !id(current.smartsheet_row_id) &&
        (!id(current.smartsheet_sheet_id) || id(current.smartsheet_sheet_id) === target) &&
        marker.expected_snapshot && typeof marker.expected_snapshot === 'object' &&
        !Array.isArray(marker.expected_snapshot) && Object.keys(marker.expected_snapshot).length) {
      return finalize(marker, recoverId, true);
    }
    fail('Sales WorkOrder has an unresolved or previously linked Smartsheet create attempt. Review the permanent ID; no second POST was sent.');
  }
  if (String(current.smartsheet_row_id ?? '').trim() ||
      String(current.smartsheet_sheet_id ?? '').trim() || !current.updated_date) {
    fail('Sales WorkOrder has an incomplete Smartsheet identity or missing revision. No new row was created.');
  }
  const snapshot = makeSnapshot(current);
  if (!snapshot || typeof snapshot !== 'object' || !Object.keys(snapshot).length) {
    fail('Sales WorkOrder has no mapped values for a safe Smartsheet create.');
  }
  const token = attemptId || crypto.randomUUID();
  const reserved = {
    sheet_id: target, attempt_id: token,
    started_at: startedAt || new Date().toISOString(),
    status:'reserved', expected_snapshot:snapshot,
  };
  await owner();
  const result = await entity.updateMany({id: recordId, updated_date: current.updated_date},
    {$set:{smartsheet_create_attempt:reserved}});
  if (result?.updated !== 1) fail('Sales WorkOrder changed before the create reservation. No POST was sent.');
  const ready = await entity.get(recordId);
  if (!ready || ready.deleted || ready.smartsheet_create_attempt?.attempt_id !== token ||
      ready.smartsheet_create_attempt?.status !== 'reserved' ||
      !equalSnapshot(ready.smartsheet_create_attempt.expected_snapshot, snapshot) ||
      !equalSnapshot(makeSnapshot(ready), snapshot) ||
      String(ready.smartsheet_row_id ?? '').trim() ||
      String(ready.smartsheet_sheet_id ?? '').trim()) {
    fail('Sales create reservation could not be verified. The attempt is held; no POST was sent.');
  }
  // Exactly one POST. Timeouts and malformed acknowledgements leave the durable
  // reservation for manual ID reconciliation; never search by row values.
  await owner();
  let body;
  try { body = await postRow(ready); }
  catch {
    fail('Sales Smartsheet POST outcome is uncertain. The reserved attempt requires review; never auto-create another row.');
  }
  const rowId = createdSalesSmartsheetRowId(body);
  await owner();
  const afterPost = await entity.get(recordId);
  if (afterPost?.smartsheet_create_attempt?.attempt_id !== token ||
      afterPost?.smartsheet_create_attempt?.status !== 'reserved' ||
      String(afterPost.smartsheet_row_id ?? '').trim() || !afterPost.updated_date) {
    fail('Smartsheet created Sales row ' + rowId + ' but the Base44 reservation changed. Review manually; never POST again.');
  }
  const created = {...reserved,status:'created_unlinked',row_id:rowId,created_at:new Date().toISOString()};
  const stored = await entity.updateMany({id: recordId,updated_date: afterPost.updated_date},
    {$set:{smartsheet_create_attempt:created}});
  if (stored?.updated !== 1) fail('Smartsheet created Sales row ' + rowId + ' but Base44 could not preserve the permanent ID. Review manually; never POST again.');
  const checked = await entity.get(recordId);
  if (checked?.smartsheet_create_attempt?.attempt_id !== token ||
      checked.smartsheet_create_attempt?.status !== 'created_unlinked' ||
      id(checked.smartsheet_create_attempt.row_id) !== rowId ||
      !equalSnapshot(checked.smartsheet_create_attempt.expected_snapshot,snapshot)) {
    fail('Sales permanent row ID reservation could not be verified. Review manually; never POST again.');
  }
  return finalize(created, rowId, false);
}
