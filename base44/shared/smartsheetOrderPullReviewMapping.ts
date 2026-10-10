// Shared by the single-row and bounded batch Order Form read-only reviews.
// Preserve the current Order pull's date and enum translation rules.
import { auditOrderDateParity, orderDateOptionField } from './smartsheetOrderDateTranslation.mjs';
import { orderStatusFromPulledDates } from './smartsheetOrderReceivedState.mjs';
import { buildOrderPullSnapshot, parseRowToFields } from './smartsheetSyncFields.ts';
import { normalizePullValue } from './smartsheetSyncUtils.ts';
import { compareUnresolvedOrderEvidenceRow } from './smartsheetOrderPullRowReview.mjs';

export function buildOrderPullReadOnlyRowReport({
  base44Order, remoteRow, orderId, sheetId, rowId, bindings,
}: {
  base44Order: any; remoteRow: any; orderId: string;
  sheetId: string; rowId: string; bindings: Record<string, string>;
}) {
  const linked = base44Order?.id && String(base44Order.id) === orderId &&
    !base44Order.deleted && remoteRow?.id === rowId &&
    String(base44Order.smartsheet_sheet_id ?? '') === sheetId &&
    String(base44Order.smartsheet_row_id ?? '') === rowId;
  if (!linked) {
    return compareUnresolvedOrderEvidenceRow({
      base44Order, remoteRow, orderId, sheetId, rowId,
    });
  }
  const dateAudit = auditOrderDateParity([base44Order], [remoteRow], bindings, sheetId);
  if (dateAudit.counts.invalid_date_values > 0) {
    return {
      base44_order_id: orderId, smartsheet_row_id: rowId,
      state: 'invalid_remote_dates', fields: [],
      message: 'Smartsheet date translation is invalid. Review source cells; no write or snapshot change was attempted.',
    };
  }
  const rawFields = parseRowToFields(remoteRow, bindings, 'orders');
  const expectedFields: Record<string, any> = {};
  for (const [key, val] of Object.entries(rawFields)) {
    if (val === '' && ['date_needed', 'date_ordered', 'date_received'].includes(key) &&
        rawFields[orderDateOptionField(key)]) {
      expectedFields[key] = '';
      continue;
    }
    if (val === '' && ['date_needed_option', 'date_ordered_option', 'receipt_option'].includes(key) &&
        ['date_needed', 'date_ordered', 'date_received'].some(dateKey =>
          orderDateOptionField(dateKey) === key && rawFields[dateKey])) {
      expectedFields[key] = '';
      continue;
    }
    const normalized = normalizePullValue(key, val);
    if (normalized !== undefined) expectedFields[key] = normalized;
  }
  Object.assign(expectedFields, orderStatusFromPulledDates(
    expectedFields, base44Order, /^\d+$/.test(String(bindings?.status ?? '').trim()),
  ));
  return compareUnresolvedOrderEvidenceRow({
    base44Order, remoteRow, orderId, sheetId, rowId, expectedFields,
    expectedSnapshot: buildOrderPullSnapshot(remoteRow, bindings),
  });
}
