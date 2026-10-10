import { orderPulledFieldsUnchanged, orderPullSnapshotAligned } from './smartsheetOrderPullSafety.mjs';

// Read-only review, NEVER an instruction to retry or clear an uncertain run.
// A single verified permanent pair from the independent store is required.
export function findUnresolvedOrderEvidencePair(value, { runStartedAt, orderId, rowId, sheetId } = {}) {
  if (value?.state !== 'unresolved' || value?.run_started_at !== runStartedAt ||
      String(value?.smartsheet_sheet_id || '') !== String(sheetId || '') ||
      !/^\d+$/.test(String(sheetId || '')) || !/^\d+$/.test(String(rowId || '')) ||
      typeof orderId !== 'string' || !orderId.trim() ||
      !Number.isSafeInteger(value?.batch_evidence?.attempted_batches) ||
      value.batch_evidence.attempted_batches < 1) return null;
  const recent = value.batch_evidence.recent_batches;
  if (!Array.isArray(recent) || recent.length === 0 || recent.length > 5) return null;
  let found = null;
  for (const batch of recent) {
    if (!Array.isArray(batch?.base44_order_ids) || !Array.isArray(batch?.smartsheet_row_ids) ||
        batch.base44_order_ids.length !== batch.smartsheet_row_ids.length ||
        !['attempting', 'acknowledged_unverified', 'write_uncertain'].includes(batch.state)) return null;
    for (let i = 0; i < batch.base44_order_ids.length; i++) {
      if (batch.base44_order_ids[i] !== orderId) continue;
      // Multiple or relinked identities must never be resolved by picking one.
      if (found || String(batch.smartsheet_row_ids[i]) !== String(rowId)) return null;
      found = { batchNumber: batch.batch_number, batchState: batch.state };
    }
  }
  return found;
}

export function compareUnresolvedOrderEvidenceRow({
  base44Order, remoteRow, orderId, sheetId, rowId, expectedFields, expectedSnapshot,
} = {}) {
  const requested = { base44_order_id: String(orderId || ''), smartsheet_row_id: String(rowId || '') };
  if (!base44Order?.id || String(base44Order.id) !== requested.base44_order_id ||
      base44Order.deleted === true ||
      String(base44Order.smartsheet_sheet_id || '') !== String(sheetId || '') ||
      String(base44Order.smartsheet_row_id || '') !== requested.smartsheet_row_id) {
    return { ...requested, state: 'identity_mismatch', fields: [],
      message: 'Base44 Order missing, deleted, or no longer linked to this exact sheet and permanent row. Do not relink or retry automatically.' };
  }
  if (!remoteRow?.id || String(remoteRow.id) !== requested.smartsheet_row_id) {
    return { ...requested, state: 'remote_unverified', fields: [],
      message: 'Smartsheet did not confirm the exact permanent row. No reconciliation can be inferred.' };
  }
  const expected = expectedFields && typeof expectedFields === 'object' && !Array.isArray(expectedFields)
    ? expectedFields : {};
  const keys = Object.keys(expected).slice(0, 30);
  if (!keys.length) return { ...requested, state: 'insufficient_fields', fields: [],
    message: 'No pulled business fields could be verified for this row; do not assume it is synchronized.' };
  const fields = keys.map(key => ({
    field: key,
    base44_value: base44Order[key] == null ? '' : String(base44Order[key]),
    smartsheet_pulled_value: expected[key] == null ? '' : String(expected[key]),
    matches: orderPulledFieldsUnchanged(base44Order, { [key]: expected[key] }),
  }));
  const differing = fields.filter(item => !item.matches).length;
  const pendingLocal = base44Order.smartsheet_pending_local_sync === true;
  const snapshotAligned = orderPullSnapshotAligned(base44Order, expectedSnapshot);
  return {
    ...requested,
    state: pendingLocal ? 'local_changes_pending'
      : differing ? 'fields_differ'
      : snapshotAligned ? 'currently_aligned_unresolved' : 'snapshot_outdated',
    pending_local_sync: pendingLocal,
    snapshot_matches: snapshotAligned,
    fields_compared: fields.length,
    fields_differing: differing,
    fields,
    message: pendingLocal
      ? 'Local edits are still pending. Do not overwrite them with Smartsheet.'
      : 'Read-only comparison only. The previous write outcome remains unresolved; this does not clear its evidence or authorize a retry.',
  };
}
