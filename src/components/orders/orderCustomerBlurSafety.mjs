// Order Form only. After a verified job selection, a delayed blur from the
// previously typed search text must not replace the chosen customer name
// while keeping the newly selected permanent Work Order ID.
export function isStaleVerifiedOrderCustomerBlur({ selection, blurValue } = {}) {
  if (!selection || typeof selection.customerName !== 'string' ||
      !String(selection.workOrderId || '').trim()) return false;
  return String(blurValue ?? '') !== selection.customerName;
}
