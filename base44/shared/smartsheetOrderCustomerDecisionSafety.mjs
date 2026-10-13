import { linkedOrderCustomerPullNeedsReview } from './smartsheetOrderLinkedCustomerReview.mjs';

// Pure read-only evidence gate. A successful preview authorizes NO writes;
// future resolution must repeat these comparisons immediately before CAS.
const id = v => String(v ?? '').trim();
const exactName = v => String(v ?? '').trim();
const revision = v => typeof v === 'string' && v.length > 4 && v.length <= 90;
const sameCustomer = (a, b) => exactName(a).replace(/\s+/g, ' ').toLowerCase() ===
  exactName(b).replace(/\s+/g, ' ').toLowerCase();
const decisions = new Set(['keep_linked_job', 'adopt_smartsheet_unlink_job']);

export function checkOrderCustomerDecisionEvidence({ review, decision, order, job, remoteRow, remoteCustomerName, duplicateClaims = false } = {}) {
  if (!decisions.has(decision) || !review ||
      !/^[A-Za-z0-9_-]{6,80}$/.test(id(review.order_id)) ||
      !/^\d+$/.test(id(review.sheet_id)) || !/^\d+$/.test(id(review.row_id)) ||
      !/^[A-Za-z0-9_-]{6,100}$/.test(id(review.work_order_id)) || !revision(review.order_updated_date) ||
      !revision(review.remote_modified_at) ||
      typeof review.local_customer_name !== 'string' ||
      typeof review.smartsheet_customer_name !== 'string') return 'invalid_review';
  if (duplicateClaims || !order || order.deleted === true ||
      id(order.id) !== id(review.order_id) ||
      id(order.smartsheet_sheet_id) !== id(review.sheet_id) ||
      id(order.smartsheet_row_id) !== id(review.row_id) ||
      id(order.work_order_id) !== id(review.work_order_id) ||
      order.smartsheet_pending_local_sync === true ||
      id(order.updated_date) !== id(review.order_updated_date) ||
      exactName(order.customer_name) !== exactName(review.local_customer_name)) return 'order_changed';
  if (!job || id(job.id) !== id(review.work_order_id) || job.deleted === true ||
      !exactName(job.client_name) || !sameCustomer(job.client_name, order.customer_name)) return 'linked_job_unverified';
  if (!remoteRow || id(remoteRow.id) !== id(review.row_id) ||
      id(remoteRow.modified_at) !== id(review.remote_modified_at) ||
      typeof remoteCustomerName !== 'string' ||
      exactName(remoteCustomerName) !== exactName(review.smartsheet_customer_name) ||
      !linkedOrderCustomerPullNeedsReview({
        order, remoteCustomerName, customerColumnBound: true,
      })) return 'smartsheet_changed';
  return 'verified_read_only';
}
