// Client-side validation/aggregation of bounded read-only Order batch pages.
// Incomplete or mismatched pages never appear as a completed reconciliation.
export function startOrderBatchReview(batch, { runStartedAt, sheetId } = {}) {
  if (!Array.isArray(batch?.links) || batch.links.length < 1 || batch.links.length > 100 ||
      !Number.isSafeInteger(batch?.number) || batch.number < 1 ||
      !/^\d+$/.test(String(sheetId || '')) || !Number.isFinite(Date.parse(String(runStartedAt || '')))) {
    throw new Error('Cannot start review without a valid unresolved Order batch.');
  }
  return {
    kind: 'running', batchNumber: batch.number, runStartedAt, sheetId,
    total: batch.links.length, reviewed: 0, nextOffset: 0,
    counts: { matching: 0, differing: 0, investigating: 0 },
    rows: [], error: '',
  };
}

export function appendOrderBatchReviewPage(current, page, batch) {
  if (!current || !page?.success || page.read_only !== true ||
      page.writes_attempted !== false || page.evidence_unresolved !== true ||
      page.run_started_at !== current.runStartedAt || page.sheet_id !== current.sheetId ||
      page.batch_number !== current.batchNumber || page.offset !== current.nextOffset ||
      page.batch_total !== current.total || !Array.isArray(page.rows) ||
      page.rows.length < 1 || page.rows.length > 20 ||
      page.reviewed !== page.rows.length || !Array.isArray(batch?.links) ||
      batch.links.length !== current.total) {
    throw new Error('Batch review page did not confirm this exact unresolved run and permanent-ID window.');
  }
  const counts = { matching: 0, differing: 0, investigating: 0 };
  for (const [index, row] of page.rows.entries()) {
    const expected = batch.links[current.reviewed + index];
    if (!expected || row?.base44_order_id !== expected.base44Id ||
        row?.smartsheet_row_id !== expected.smartsheetRowId ||
        !['matching', 'differing', 'investigating'].includes(row.category) ||
        typeof row.state !== 'string' || !row.state.trim()) {
      throw new Error('Batch review page returned a wrong or unverified permanent Order link.');
    }
    const rightCategory = row.state === 'currently_aligned_unresolved' ? 'matching'
      : ['fields_differ', 'snapshot_outdated'].includes(row.state) ? 'differing' : 'investigating';
    if (row.category !== rightCategory) throw new Error('Order batch review misclassified a live record.');
    counts[row.category]++;
  }
  if (!['matching','differing','investigating'].every(key => page.counts?.[key] === counts[key])) {
    throw new Error('Order batch review counts did not match verified row classifications.');
  }
  const reviewed = current.reviewed + page.rows.length;
  const expectedNext = reviewed < current.total ? reviewed : null;
  if (page.next_offset !== expectedNext) {
    throw new Error('Order batch review skipped or repeated a page.');
  }
  return {
    ...current,
    kind: expectedNext === null ? 'complete' : 'running',
    reviewed, nextOffset: expectedNext,
    counts: Object.fromEntries(Object.keys(counts).map(key => [key, current.counts[key] + counts[key]])),
    rows: [...current.rows, ...page.rows],
  };
}
