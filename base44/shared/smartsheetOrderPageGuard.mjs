// Fail closed if a paginated Order Request sheet read is incomplete or changes mid-read.
// Pure guard so pagination safety can be tested without accessing production data.
export function createSmartsheetOrderPageGuard({ pageSize = 200, maxPages = 100, datasetLabel = 'Order Form' } = {}) {
  let expectedTotal = null;
  let expectedVersion = null;
  let lastPage = 0;
  let complete = false;
  const seenRowIds = new Set();

  function accept(page, body, rows) {
    if (complete || page !== lastPage + 1 || page > maxPages) {
      throw new Error(`${datasetLabel} Smartsheet pagination returned an unexpected page.`);
    }
    if (!body || !Array.isArray(body.rows) || !Array.isArray(rows) || rows.length !== body.rows.length) {
      throw new Error(`${datasetLabel} Smartsheet returned a malformed or incomplete row page.`);
    }
    const total = body.totalRowCount;
    const version = body.version;
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(version) || version < 0) {
      throw new Error(`${datasetLabel} Smartsheet omitted valid row-count or sheet-version metadata.`);
    }
    if (page === 1) {
      if (total > pageSize * maxPages) {
        throw new Error(`${datasetLabel} Smartsheet row count exceeds the safe pagination limit.`);
      }
      expectedTotal = total;
      expectedVersion = version;
    } else if (total !== expectedTotal) {
      // Cell edits bump the sheet version on a live sheet; only a changed row
      // count (rows added/removed, so pages may shift) invalidates the read.
      // Distinct-ID and complete-count checks below still apply.
      throw new Error(`${datasetLabel} Smartsheet changed during pagination. No records were imported.`);
    }
    if (rows.length > pageSize) {
      throw new Error(`${datasetLabel} Smartsheet returned more rows than the requested page size.`);
    }
    for (const row of rows) {
      const id = String(row?.id ?? '');
      if (!/^\d+$/.test(id) || seenRowIds.has(id)) {
        throw new Error(`${datasetLabel} Smartsheet returned an invalid or repeated row ID during pagination.`);
      }
      seenRowIds.add(id);
    }
    if (seenRowIds.size > expectedTotal) {
      throw new Error(`${datasetLabel} Smartsheet returned more rows than its declared row count.`);
    }
    lastPage = page;
    complete = seenRowIds.size === expectedTotal;
    if (!complete && (rows.length === 0 || page === maxPages)) {
      throw new Error(`${datasetLabel} Smartsheet pagination ended before all rows were retrieved.`);
    }
    return complete;
  }

  function assertComplete() {
    if (!complete || seenRowIds.size !== expectedTotal) {
      throw new Error(`${datasetLabel} Smartsheet pagination could not be verified completely.`);
    }
  }

  return { accept, assertComplete };
}