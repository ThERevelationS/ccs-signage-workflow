// Read-only Order Form review summaries returned by the guarded Order pull.
// Never accept missing or duplicate permanent IDs as a basis for UI actions.
// This data is diagnostic: no resolution mutates Base44 or Smartsheet.
export function normalizeOrderLinkedCustomerReviews(items, count) {
  if (!Number.isSafeInteger(count) || count < 1 || !Array.isArray(items)) return [];
  const seenOrders = new Set();
  const seenRows = new Set();
  const normalized = [];
  for (const item of items.slice(0, 10)) {
    const orderId = item?.order_id;
    const rowId = item?.row_id;
    const workOrderId = item?.work_order_id;
    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(orderId) ||
        typeof rowId !== 'string' || !/^\d+$/.test(rowId) ||
        typeof workOrderId !== 'string' || !workOrderId.trim() ||
        seenOrders.has(orderId) || seenRows.has(rowId) ||
        typeof item.local_customer_name !== 'string' ||
        typeof item.smartsheet_customer_name !== 'string') continue;
    seenOrders.add(orderId);
    seenRows.add(rowId);
    normalized.push({
      orderId, rowId, workOrderId: workOrderId.slice(0, 100),
      localCustomerName: item.local_customer_name.slice(0, 160),
      smartsheetCustomerName: item.smartsheet_customer_name.slice(0, 160),
    });
  }
  return normalized;
}

export function orderCustomerReviewRowState(review, loadedOrder) {
  if (!loadedOrder || String(loadedOrder.id) !== review?.orderId ||
      String(loadedOrder.smartsheet_row_id ?? '') !== review?.rowId ||
      String(loadedOrder.work_order_id ?? '') !== review?.workOrderId) {
    return 'changed_or_unavailable';
  }
  if (String(loadedOrder.customer_name ?? '') !== review.localCustomerName ||
      loadedOrder.smartsheet_pending_local_sync === true) return 'changed_or_unavailable';
  return 'matches_review';
}
