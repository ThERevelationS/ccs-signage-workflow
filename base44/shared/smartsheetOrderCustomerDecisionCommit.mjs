import { checkOrderCustomerDecisionEvidence } from './smartsheetOrderCustomerDecisionSafety.mjs';

// Pure plan. The caller must verify the full revision + permanent identities
// freshly before using this predicate for a single Base44 CAS update.
export function planOrderSmartsheetCustomerUnlink({ review, order, job, remoteRow, remoteCustomerName, duplicateClaims, decision, confirmed } = {}) {
  if (decision !== 'adopt_smartsheet_unlink_job' || confirmed !== true) {
    return { ok: false, reason: 'explicit_admin_confirmation_required' };
  }
  const state = checkOrderCustomerDecisionEvidence({
    review, decision, order, job, remoteRow, remoteCustomerName, duplicateClaims,
  });
  if (state !== 'verified_read_only') return { ok: false, reason: state };
  return {
    ok: true,
    selector: {
      id: String(order.id),
      updated_date: String(order.updated_date),
      customer_name: order.customer_name,
      work_order_id: order.work_order_id,
      smartsheet_sheet_id: order.smartsheet_sheet_id,
      smartsheet_row_id: order.smartsheet_row_id,
    },
    patch: {
      customer_name: String(remoteCustomerName).trim(),
      work_order_id: '',
      smartsheet_pending_local_sync: true,
    },
  };
}
