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

function snapshotsEqual(left, right) {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
      Array.isArray(left) || Array.isArray(right)) return false;
  const a = Object.keys(left).sort();
  const b = Object.keys(right).sort();
  if (a.length !== b.length || a.some((key, index) => key !== b[index])) return false;
  return a.every((key) => String(left[key] ?? '').trim() === String(right[key] ?? '').trim());
}

export function recoverableOrderSmartsheetCreate(record, sheetId) {
  const marker = record?.smartsheet_create_attempt;
  const targetSheet = numericId(sheetId);
  const rowId = numericId(marker?.row_id);
  const snapshot = marker?.expected_snapshot;
  if (!marker || marker.status !== 'created_unlinked' || !targetSheet || !rowId ||
      numericId(marker?.sheet_id) !== targetSheet ||
      numericId(record?.smartsheet_sheet_id) !== targetSheet ||
      numericId(record?.smartsheet_row_id) ||
      !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return { rowId, snapshot, marker };
}

// Release only a verified reservation whose POST was never dispatched. A
// failed version check or unavailable readback leaves the claim for review.
async function releaseUnsentOrderCreateReservation({ entity, id, token, targetSheet, expectedSnapshot }) {
  const needsReview = 'No Smartsheet POST was sent, but Base44 could not verify reservation release. Pending Order edits remain; an administrator must audit this create attempt before retrying.';
  try {
    const held = await entity.get(id);
    if (!held || held.deleted || held.smartsheet_pending_local_sync !== true ||
        String(held.smartsheet_sheet_id ?? '').trim() !== targetSheet ||
        String(held.smartsheet_row_id ?? '').trim() ||
        held.smartsheet_create_attempt?.attempt_id !== token ||
        held.smartsheet_create_attempt?.status !== 'reserved' ||
        !snapshotsEqual(held.smartsheet_create_attempt?.expected_snapshot, expectedSnapshot)) {
      throw new Error('Reservation no longer matches');
    }
    const released = await entity.updateMany(
      { id, updated_date: held.updated_date, smartsheet_pending_local_sync: true,
        smartsheet_sheet_id: targetSheet,
        'smartsheet_create_attempt.attempt_id': token,
        'smartsheet_create_attempt.status': 'reserved' },
      { $unset: { smartsheet_sheet_id: 1, smartsheet_create_attempt: 1 } },
    );
    if (released?.updated !== 1) throw new Error('Reservation release did not commit');
    const verified = await entity.get(id);
    if (!verified || verified.deleted || verified.smartsheet_pending_local_sync !== true ||
        String(verified.smartsheet_sheet_id ?? '').trim() ||
        String(verified.smartsheet_row_id ?? '').trim() ||
        verified.smartsheet_create_attempt) throw new Error('Reservation release readback failed');
  } catch {
    throw new Error(needsReview);
  }
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
  verifyCreatedRow,
  attemptId,
  startedAt,
}) {
  const id = String(record?.id ?? '').trim();
  const targetSheet = String(sheetId ?? '').trim();
  if (!id || !/^\d+$/.test(targetSheet) ||
      typeof entity?.get !== 'function' || typeof entity?.update !== 'function' ||
      typeof entity?.updateMany !== 'function' || typeof postRow !== 'function' ||
      typeof makeSnapshot !== 'function' || typeof verifyCreatedRow !== 'function') {
    throw new Error('Order Smartsheet create protection could not initialize.');
  }

  const finalizePermanentLink = async ({ latest, marker, rowId, snapshot, recovered }) => {
    const actualVerified = await verifyCreatedRow({ rowId, expectedSnapshot: snapshot, record: latest, recovered });
    if (actualVerified !== true) {
      throw new Error(`Smartsheet row ${rowId} could not be verified against the durable create snapshot. The Order remains held for review; never POST again.`);
    }

    const beforeCommit = await entity.get(id);
    if (!beforeCommit || beforeCommit.deleted ||
        beforeCommit?.smartsheet_create_attempt?.attempt_id !== marker.attempt_id ||
        numericId(beforeCommit?.smartsheet_create_attempt?.row_id) !== rowId ||
        numericId(beforeCommit?.smartsheet_sheet_id) !== targetSheet ||
        numericId(beforeCommit?.smartsheet_row_id)) {
      throw new Error(`Smartsheet row ${rowId} exists, but the Base44 create marker changed before link finalization. Review manually; never POST again.`);
    }

    const currentLocalSnapshot = makeSnapshot(beforeCommit);
    const newerLocalEditsRemain = !snapshotsEqual(currentLocalSnapshot, snapshot);
    const syncedAt = new Date().toISOString();
    const linkedMarker = { ...marker, status: 'linked', row_id: rowId, linked_at: syncedAt };
    let committed;
    try {
      committed = await entity.updateMany(
        { id, updated_date: beforeCommit.updated_date },
        { $set: {
          smartsheet_row_id: rowId,
          smartsheet_sheet_id: targetSheet,
          smartsheet_sync_snapshot: snapshot,
          smartsheet_last_synced_at: syncedAt,
          smartsheet_pending_local_sync: newerLocalEditsRemain,
          smartsheet_create_attempt: linkedMarker,
        } },
      );
    } catch {
      throw new Error(`Smartsheet row ${rowId} exists, but Base44 could not finalize its permanent Order link. The Order remains held for review; never POST again.`);
    }
    if (!committed || committed.updated !== 1) {
      throw new Error(`Smartsheet row ${rowId} exists, but the Base44 Order changed before its permanent link could be finalized. The Order remains held for review; never POST again.`);
    }
    const verified = await entity.get(id);
    if (String(verified?.smartsheet_row_id ?? '') !== rowId ||
        String(verified?.smartsheet_sheet_id ?? '') !== targetSheet ||
        verified?.smartsheet_pending_local_sync !== newerLocalEditsRemain ||
        orderSmartsheetCreateNeedsReview(verified)) {
      throw new Error(`Smartsheet row ${rowId} exists, but Base44 could not verify its permanent Order link. Review manually; never POST again.`);
    }
    return { rowId, recordId: id, recovered: Boolean(recovered), newerLocalEditsRemain };
  };

  // Check authoritative current state, not the paginated snapshot.
  const current = await entity.get(id);
  if (!current || current.deleted) throw new Error('Order no longer exists or is deleted. Creation blocked.');
  const recoverable = recoverableOrderSmartsheetCreate(current, targetSheet);
  if (recoverable) {
    return finalizePermanentLink({
      latest: current,
      marker: recoverable.marker,
      rowId: recoverable.rowId,
      snapshot: recoverable.snapshot,
      recovered: true,
    });
  }
  if (orderSmartsheetCreateNeedsReview(current)) {
    throw new Error('Order has an unresolved Smartsheet create attempt without a safely recoverable permanent row ID. Review its row before retrying.');
  }
  if (String(current.smartsheet_row_id ?? '').trim() ||
      String(current.smartsheet_sheet_id ?? '').trim()) {
    throw new Error('Order already has a Smartsheet identity or an incomplete link. Review before creating another row.');
  }

  const token = typeof attemptId === 'string' && attemptId.trim()
    ? attemptId.trim() : crypto.randomUUID();
  const started = typeof startedAt === 'string' && startedAt.trim()
    ? startedAt.trim() : new Date().toISOString();
  const expectedSnapshot = makeSnapshot(current);
  const marker = {
    sheet_id: targetSheet,
    attempt_id: token,
    started_at: started,
    status: 'reserved',
    expected_snapshot: expectedSnapshot,
  };

  // Write BEFORE POST, including the exact mapped values we intend to create.
  // If the POST later times out without returning a row ID, the snapshot is
  // durable evidence for manual reconciliation only; it is never sufficient to
  // infer or auto-link a row without a permanent Smartsheet row ID.
  await entity.update(id, {
    smartsheet_sheet_id: targetSheet,
    smartsheet_create_attempt: marker,
  });

  const reserved = await entity.get(id);
  if (reserved?.deleted || reserved?.smartsheet_create_attempt?.attempt_id !== token ||
      String(reserved?.smartsheet_sheet_id ?? '').trim() !== targetSheet ||
      String(reserved?.smartsheet_row_id ?? '').trim() ||
      !snapshotsEqual(reserved?.smartsheet_create_attempt?.expected_snapshot, expectedSnapshot)) {
    throw new Error('Order creation reservation could not be verified. No Smartsheet POST was sent.');
  }

  let body;
  try {
    body = await postRow(current);
  } catch (error) {
    if (error?.orderCreatePrePostGuardBlocked === true) {
      await releaseUnsentOrderCreateReservation({ entity, id, token, targetSheet, expectedSnapshot });
      throw new Error('Order backup changed before Smartsheet POST. No new row was sent; the reservation was released and pending edits retained. Reload and run Save & Sync with a fresh verified backup.');
    }
    throw new Error('Smartsheet Order create outcome is uncertain. The Order is held for review; do not retry automatically.');
  }

  // Smartsheet Add Rows normally returns result: [{id: ...}], not result.id.
  // Requiring one confirmed ID avoids marking an unlinked POST as successful.
  const rowId = createdOrderSmartsheetRowId(body);
  const snapshot = expectedSnapshot;
  const createdAt = new Date().toISOString();
  const createdMarker = {
    ...marker,
    status: 'created_unlinked',
    row_id: rowId,
    created_at: createdAt,
    expected_snapshot: snapshot,
  };

  // Persist the permanent row ID immediately after the POST response, before
  // attempting the broader Base44 link/snapshot update. If the browser closes
  // or the backend later fails, the next Save & Sync can verify this exact row
  // and finish linking without issuing a second POST.
  try {
    await entity.update(id, { smartsheet_create_attempt: createdMarker });
    const recorded = await entity.get(id);
    if (recorded?.smartsheet_create_attempt?.attempt_id !== token ||
        recorded?.smartsheet_create_attempt?.status !== 'created_unlinked' ||
        numericId(recorded?.smartsheet_create_attempt?.row_id) !== rowId ||
        !snapshotsEqual(recorded?.smartsheet_create_attempt?.expected_snapshot, snapshot)) {
      throw new Error('Base44 did not verify the permanent row ID create marker.');
    }
  } catch {
    throw new Error(`Smartsheet created Order row ${rowId}, but Base44 could not durably record that permanent row ID. Review manually; never POST again.`);
  }

  return finalizePermanentLink({
    latest: await entity.get(id),
    marker: createdMarker,
    rowId,
    snapshot,
    recovered: false,
  });
}
