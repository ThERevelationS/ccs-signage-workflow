// Order Form only. Run-scoped diagnostic evidence, not proof of committed data.
// Keep the most recent batches and permanent IDs without copying field values
// or growing the shared coordinator status without bound.
export const ORDER_PULL_EVIDENCE_RECENT_BATCHES = 5;

export function recordOrderPullBatchEvidence(previous, {
  batchNumber, totalBatches, batch, state,
} = {}) {
  if (!Number.isSafeInteger(batchNumber) || batchNumber < 1 ||
      !Number.isSafeInteger(totalBatches) || totalBatches < batchNumber ||
      !Array.isArray(batch) || batch.length < 1 || batch.length > 100 ||
      !['attempting', 'acknowledged_unverified', 'write_uncertain'].includes(state)) {
    throw new Error('Order batch evidence is invalid; no further Order writes are allowed.');
  }
  const base44Ids = batch.map(item => String(item?.id ?? '').trim());
  const rowIds = batch.map(item => String(item?._existing?.smartsheet_row_id ?? '').trim());
  if (base44Ids.some(id => !id) || rowIds.some(id => !/^\d+$/.test(id)) ||
      new Set(base44Ids).size !== base44Ids.length) {
    throw new Error('Order batch evidence lacks unique Base44 IDs and permanent Smartsheet row IDs.');
  }

  const before = previous && typeof previous === 'object' ? previous : {};
  const recent = Array.isArray(before.recent_batches) ? before.recent_batches : [];
  const old = recent.find(item => item.batch_number === batchNumber);
  if (state !== 'attempting' && !old) {
    throw new Error('Order batch acknowledgment has no recorded pre-write attempt.');
  }
  const entry = {
    batch_number: batchNumber,
    total_batches: totalBatches,
    count: batch.length,
    base44_order_ids: base44Ids,
    smartsheet_row_ids: rowIds,
    state,
  };
  const recentBatches = [...recent.filter(item => item.batch_number !== batchNumber), entry]
    .slice(-ORDER_PULL_EVIDENCE_RECENT_BATCHES);
  const newAttempt = state === 'attempting' && !old;
  const newAck = state === 'acknowledged_unverified' && old?.state !== 'acknowledged_unverified';
  const newUncertain = state === 'write_uncertain' && old?.state !== 'write_uncertain';
  return {
    total_batches: totalBatches,
    attempted_batches: (before.attempted_batches || 0) + (newAttempt ? 1 : 0),
    attempted_orders: (before.attempted_orders || 0) + (newAttempt ? batch.length : 0),
    acknowledged_unverified_batches: (before.acknowledged_unverified_batches || 0) + (newAck ? 1 : 0),
    write_uncertain_batches: (before.write_uncertain_batches || 0) + (newUncertain ? 1 : 0),
    recent_batches: recentBatches,
    older_batches_omitted: Math.max(0, (before.attempted_batches || 0) + (newAttempt ? 1 : 0) - recentBatches.length),
  };
}
