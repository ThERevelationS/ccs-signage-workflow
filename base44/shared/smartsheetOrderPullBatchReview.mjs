// Order Form ONLY: read-only, bounded review of the permanently linked pairs
// retained in the independent unresolved-pull evidence record.
export const ORDER_PULL_REVIEW_PAGE_SIZE = 20;

export function planUnresolvedOrderBatchReview(evidence, {
  runStartedAt, sheetId, batchNumber, offset = 0,
} = {}) {
  if (evidence?.state !== 'unresolved' || evidence?.run_started_at !== runStartedAt ||
      !/^\d+$/.test(String(sheetId || '')) || String(evidence?.smartsheet_sheet_id) !== String(sheetId) ||
      !Number.isSafeInteger(batchNumber) || batchNumber < 1 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset % ORDER_PULL_REVIEW_PAGE_SIZE !== 0) {
    throw new Error('Unresolved Order batch identity or page offset changed. No comparison performed.');
  }
  const source = evidence?.batch_evidence;
  const batches = source?.recent_batches;
  if (!Number.isSafeInteger(source?.attempted_batches) || source.attempted_batches < 1 ||
      !Array.isArray(batches) || !batches.length || batches.length > 5) {
    throw new Error('Order batch evidence is incomplete and cannot be compared safely.');
  }
  const matching = batches.filter(item => item?.batch_number === batchNumber);
  if (matching.length !== 1) throw new Error('Requested Order batch is missing or duplicated in independent evidence.');
  const allOrderIds = new Set();
  const allRowIds = new Set();
  for (const batch of batches) {
    if (!Number.isSafeInteger(batch?.batch_number) || !Number.isSafeInteger(batch?.total_batches) ||
        batch.batch_number < 1 || batch.total_batches < batch.batch_number ||
        !['attempting', 'acknowledged_unverified', 'write_uncertain'].includes(batch.state) ||
        !Number.isSafeInteger(batch?.count) || batch.count < 1 || batch.count > 100 ||
        !Array.isArray(batch.base44_order_ids) || !Array.isArray(batch.smartsheet_row_ids) ||
        batch.base44_order_ids.length !== batch.count || batch.smartsheet_row_ids.length !== batch.count) {
      throw new Error('Order batch evidence contains malformed permanent IDs or counts.');
    }
    for (let i = 0; i < batch.count; i++) {
      const orderId = batch.base44_order_ids[i];
      const rowId = String(batch.smartsheet_row_ids[i] ?? '');
      if (typeof orderId !== 'string' || !orderId.trim() || !/^\d+$/.test(rowId) ||
          allOrderIds.has(orderId) || allRowIds.has(rowId)) {
        throw new Error('Order batch evidence contains duplicate or invalid permanent identities.');
      }
      allOrderIds.add(orderId);
      allRowIds.add(rowId);
    }
  }
  const batch = matching[0];
  if (offset >= batch.count) throw new Error('Requested Order review page is outside its recorded batch.');
  const pairs = batch.base44_order_ids.slice(offset, offset + ORDER_PULL_REVIEW_PAGE_SIZE)
    .map((orderId, i) => ({
      orderId,
      rowId: String(batch.smartsheet_row_ids[offset + i]),
    }));
  return {
    batchNumber, batchState: batch.state, offset, total: batch.count, pairs,
    nextOffset: offset + pairs.length < batch.count ? offset + pairs.length : null,
  };
}

// A successful Smartsheet Get Sheet rowIds response is not proof that
// every requested permanent row was returned. Never treat omissions as deletes.
export function verifyUnresolvedOrderBatchSheetRows(sheetResponse, requestedRowIds) {
  if (!Array.isArray(requestedRowIds) || !requestedRowIds.length ||
      requestedRowIds.length > ORDER_PULL_REVIEW_PAGE_SIZE ||
      !Array.isArray(sheetResponse?.rows)) {
    throw new Error('Smartsheet rowIds-filtered Order batch response was incomplete or malformed.');
  }
  const expected = new Set(requestedRowIds);
  if (expected.size !== requestedRowIds.length ||
      requestedRowIds.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) {
    throw new Error('Order batch request has duplicate or malformed permanent row IDs.');
  }
  const seen = new Set();
  for (const row of sheetResponse.rows) {
    const id = String(row?.id ?? '');
    if (!/^\d+$/.test(id) || !expected.has(id) || seen.has(id)) {
      throw new Error('Smartsheet rowIds-filtered Order batch response has unexpected or duplicate permanent row IDs.');
    }
    seen.add(id);
  }
  if (seen.size !== expected.size) {
    throw new Error('Smartsheet rowIds-filtered Order batch response omitted requested permanent rows. No page comparison was confirmed; absence does not establish deletion.');
  }
  return sheetResponse.rows;
}

export function summarizeUnresolvedOrderBatchPage(plan, reports) {
  if (!plan || !Array.isArray(reports) || !Array.isArray(plan.pairs) ||
      reports.length !== plan.pairs.length) {
    throw new Error('Order batch comparison returned an incomplete page. No summary was confirmed.');
  }
  const counts = { matching: 0, differing: 0, investigating: 0 };
  const rows = reports.map((report, index) => {
    const pair = plan.pairs[index];
    if (report?.base44_order_id !== pair.orderId || report?.smartsheet_row_id !== pair.rowId ||
        typeof report?.state !== 'string') {
      throw new Error('Order batch review result did not match a permanent ID pair.');
    }
    const category = report.state === 'currently_aligned_unresolved' ? 'matching'
      : ['fields_differ', 'snapshot_outdated'].includes(report.state) ? 'differing' : 'investigating';
    counts[category]++;
    return { base44_order_id: pair.orderId, smartsheet_row_id: pair.rowId,
      state: report.state, category,
      fields_differing: Number.isSafeInteger(report.fields_differing) ? report.fields_differing : null };
  });
  return {
    batch_number: plan.batchNumber, batch_write_state: plan.batchState,
    offset: plan.offset, batch_total: plan.total,
    next_offset: plan.nextOffset, reviewed: reports.length, counts, rows,
  };
}
