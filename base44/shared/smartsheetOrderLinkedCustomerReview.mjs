// Order Form-only read-only pull guard. An existing Base44 Work Order link
// is not evidence that an edited Smartsheet customer name identifies that job.
// Hold this Order row for explicit review; never relink or change its snapshot.
const normalizeName = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

export function linkedOrderCustomerPullNeedsReview({ order, remoteCustomerName, customerColumnBound = false } = {}) {
  if (!order?.id || !String(order.work_order_id ?? '').trim() ||
      order.deleted === true || !customerColumnBound ||
      typeof remoteCustomerName !== 'string') return false;
  return normalizeName(order.customer_name) !== normalizeName(remoteCustomerName);
}
