import { loadAllEntityRows } from './pagedEntityRows.ts';
import { salesSmartsheetCreateNeedsReview } from './smartsheetSalesCreateSafety.mjs';

const id = (value) => String(value ?? '').trim();

// Unresolved Sales POSTs cannot be matched to Smartsheet rows by customer,
// title, Notes, row position, or cell values. A reservation may have NO
// top-level smartsheet_sheet_id or smartsheet_row_id, so the normal linked
// WorkOrder query cannot find it. Only the durable attempt records count.
export function classifySalesPullCreateAttemptRisks(records = [], sheetId = '') {
  const sheet = id(sheetId);
  if (!/^\d+$/.test(sheet)) throw new Error('A verified Sales Smartsheet sheet ID is required.');
  const review = [];
  for (const record of records || []) {
    if (!record?.smartsheet_create_attempt ||
        !salesSmartsheetCreateNeedsReview(record)) continue;
    const markerSheet = id(record.smartsheet_create_attempt?.sheet_id);
    const linkedSheet = id(record.smartsheet_sheet_id);
    // A malformed/missing marker sheet identity cannot prove the attempt
    // belongs to a DIFFERENT sheet; conservatively hold imports for review.
    if (markerSheet && markerSheet !== sheet) continue;
    if (!markerSheet && linkedSheet && linkedSheet !== sheet) continue;
    review.push({
      workorder_id: id(record.id),
      status: id(record.smartsheet_create_attempt?.status) || 'unknown',
      row_id: /^\d+$/.test(id(record.smartsheet_create_attempt?.row_id))
        ? id(record.smartsheet_create_attempt.row_id) : '',
    });
  }
  return {
    count: review.length,
    workorder_ids: review.map((item) => item.workorder_id).filter(Boolean).slice(0, 20),
    attempt_states: review.reduce((out, item) => {
      out[item.status] = (out[item.status] || 0) + 1;
      return out;
    }, {}),
    known_permanent_row_ids: review.map((item) => item.row_id).filter(Boolean).slice(0, 20),
  };
}

export async function readSalesPullCreateAttemptRisks(entity, sheetId) {
  // Server-scoped indexed-style filtering, not a legacy WorkOrder archive
  // download. A failed/incomplete paged read fails closed before bulkCreate.
  const attempts = await loadAllEntityRows({
    entity,
    query: { smartsheet_create_attempt: { $exists: true } },
    sort: 'id',
    label: 'Sales pull durable Smartsheet create attempt review',
  });
  return classifySalesPullCreateAttemptRisks(attempts, sheetId);
}
