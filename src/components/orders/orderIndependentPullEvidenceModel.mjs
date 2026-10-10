// Read-only Order Form presentation of the independent production evidence.
// Never treat a missing, malformed or unreadable record as verified.
export const ORDER_PULL_EVIDENCE_KEY = 'smartsheetOrderPullWriteEvidence';

export function orderIndependentPullEvidenceModel(records, { readFailed = false } = {}) {
  if (readFailed) return { kind: 'unavailable', message: 'Cannot read independent Order sync evidence. Its outcome is unknown.' };
  const rows = Array.isArray(records) ? records : records?.id ? [records] : [];
  if (rows.length === 0) return { kind: 'none' };
  if (rows.length !== 1 || rows[0]?.setting_key !== ORDER_PULL_EVIDENCE_KEY) {
    return { kind: 'invalid', message: 'Independent Order sync evidence is duplicated or ambiguous. Review before syncing.' };
  }
  const value = rows[0]?.setting_value;
  if (value?.state === 'verified_complete') return { kind: 'none' };
  const batch = value?.batch_evidence;
  const attempted = batch?.attempted_batches;
  const recent = batch?.recent_batches;
  const validCounts = Number.isSafeInteger(attempted) && attempted > 0 &&
    Number.isSafeInteger(batch?.attempted_orders) && batch.attempted_orders >= attempted &&
    Number.isSafeInteger(batch?.older_batches_omitted) && batch.older_batches_omitted >= 0;
  if (value?.state !== 'unresolved' || !validCounts ||
      !/^\d+$/.test(String(value?.smartsheet_sheet_id || '')) ||
      !Number.isFinite(Date.parse(String(value?.run_started_at || ''))) ||
      !Array.isArray(recent) || recent.length === 0 || recent.length > 5 ||
      attempted < recent.length || batch.older_batches_omitted !== attempted - recent.length) {
    return { kind: 'invalid', message: 'Independent Order sync evidence is incomplete. Do not assume the previous pull finished.' };
  }
  const entries = [];
  for (const item of recent) {
    const ids = item?.base44_order_ids;
    const rows = item?.smartsheet_row_ids;
    if (!Number.isSafeInteger(item?.batch_number) || item.batch_number < 1 ||
        !Number.isSafeInteger(item?.total_batches) || item.total_batches < item.batch_number ||
        !Number.isSafeInteger(item?.count) || item.count < 1 || item.count > 100 ||
        !['attempting', 'acknowledged_unverified', 'write_uncertain'].includes(item?.state) ||
        !Array.isArray(ids) || !Array.isArray(rows) ||
        ids.length !== item.count || rows.length !== item.count ||
        ids.some(id => typeof id !== 'string' || !id.trim()) ||
        rows.some(id => !/^\d+$/.test(String(id))) ||
        new Set(ids).size !== ids.length) {
      return { kind: 'invalid', message: 'An Order sync batch has incomplete permanent-ID evidence. Manual review is required.' };
    }
    entries.push({
      number: item.batch_number,
      total: item.total_batches,
      count: item.count,
      state: item.state,
      links: ids.map((id, i) => ({ base44Id: id, smartsheetRowId: String(rows[i]) })),
    });
  }
  return {
    kind: 'unresolved',
    sheetId: String(value.smartsheet_sheet_id),
    startedAt: value.run_started_at,
    attempted,
    attemptedOrders: batch.attempted_orders,
    acknowledged: Number(batch.acknowledged_unverified_batches) || 0,
    uncertain: Number(batch.write_uncertain_batches) || 0,
    olderOmitted: batch.older_batches_omitted,
    entries,
  };
}
