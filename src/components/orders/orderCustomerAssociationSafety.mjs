// Order Form only. A manual customer-name change does not verify a new job.
// Never silently retain the prior permanent Work Order association.
export function shouldUnlinkOrderJobForTypedCustomer(order, nextName) {
  return Boolean(String(order?.work_order_id ?? '').trim()) &&
    String(nextName ?? '') !== String(order?.customer_name ?? '');
}

export function orderAfterTypedCustomerName(order, nextName) {
  const customer_name = String(nextName ?? '');
  return {
    ...order,
    customer_name,
    ...(shouldUnlinkOrderJobForTypedCustomer(order, customer_name) ? { work_order_id: '' } : {}),
  };
}

// Stage both fields in the same Base44 save only when the editor blurs.
// Keep unrelated pending fields and do not relink by matching text alone.
export function pendingAfterManualCustomerBlur({ baseline, pending = {}, customerName, unlinkJob = false } = {}) {
  const fields = { ...pending };
  const name = String(customerName ?? '');
  const original = String(baseline?.customer_name ?? '');
  if (name !== original) fields.customer_name = name;
  else delete fields.customer_name;
  if (unlinkJob) fields.work_order_id = '';
  return fields;
}
