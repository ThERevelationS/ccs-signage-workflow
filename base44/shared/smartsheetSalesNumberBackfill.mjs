// Guardrails for a deliberately approved, small Sales Est/Inv-only backfill.
// A Smartsheet number is an identifier, never a hyperlink or a generic amount.
export const SALES_NUMBER_BACKFILL_CONFIRMATION = 'FILL_BLANK_SALES_NUMBERS_BY_VERIFIED_ROW_ID';
export const SALES_NUMBER_BACKFILL_MAX = 20;

export function normalizeSalesNumber(value) {
  const text = String(value ?? '').trim();
  return /^\d{5}$/.test(text) ? text : '';
}

export function validateSalesNumberSelections(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > SALES_NUMBER_BACKFILL_MAX) {
    throw new Error('Select between 1 and 20 reviewed Sales records.');
  }
  const ids = new Set();
  const rows = new Set();
  return items.map((item) => {
    const workorderId = String(item?.workorder_id ?? '').trim();
    const rowId = String(item?.smartsheet_row_id ?? '').trim();
    const number = normalizeSalesNumber(item?.expected_number);
    if (!workorderId || !/^\d+$/.test(rowId) || !number || ids.has(workorderId) || rows.has(rowId)) {
      throw new Error('Reviewed Sales selection has an invalid number, duplicate identity, or missing permanent row ID.');
    }
    ids.add(workorderId);
    rows.add(rowId);
    return { workorder_id: workorderId, smartsheet_row_id: rowId, expected_number: number };
  });
}

export function assessSalesNumberFill({ record, sheetId, rowId, remoteValue, expectedNumber, activeLinks = 0 }) {
  const number = normalizeSalesNumber(remoteValue);
  if (!record?.id || record.deleted === true || record.in_pipeline !== true ||
      String(record.smartsheet_sheet_id ?? '').trim() !== String(sheetId ?? '').trim() ||
      String(record.smartsheet_row_id ?? '').trim() !== String(rowId ?? '').trim()) return 'link_changed';
  if (activeLinks !== 1) return 'ambiguous_link';
  if (!number) return 'invalid_smartsheet_number';
  if (number !== normalizeSalesNumber(expectedNumber)) return 'smartsheet_changed_since_preview';
  const stored = String(record.est_inv_at ?? '').trim();
  if (stored === number) return 'already_set';
  if (stored) return 'base44_number_already_populated';
  return 'eligible';
}
