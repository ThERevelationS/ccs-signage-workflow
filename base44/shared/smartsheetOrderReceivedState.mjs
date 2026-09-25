// Order Form only: keep actual receipts separate from open text choices.
// A receipt date or the explicit In Stock choice confirms receipt; other
// custom text choices (for example Backordered) must stay in open Orders.
export function isFulfilledOrder(order) {
  return Boolean(order?.date_received) ||
    String(order?.receipt_option ?? '').trim().toLowerCase() === 'in stock';
}

export function effectiveOrderStatus(order) {
  if (isFulfilledOrder(order)) return 'received';
  if (order?.status === 'cancelled') return 'cancelled';
  if (order?.date_ordered) return 'ordered';
  // Historical imports defaulted to pending even when receipt dates existed.
  // An unverified status alone must not hide an item from the open-items view.
  return order?.status === 'received' ? 'pending' : (order?.status || 'pending');
}

export function orderMatchesReceivedFilter(order, filter) {
  if (filter === 'not_received' || filter === 'open_only') return !isFulfilledOrder(order);
  if (filter === 'received') return isFulfilledOrder(order);
  if (filter === 'pending' || filter === 'ordered' || filter === 'cancelled') {
    return !isFulfilledOrder(order) && effectiveOrderStatus(order) === filter;
  }
  return true; // Existing unfiltered consumers and explicit Order history view.
}

// Derive the Base44 status when the Order Request sheet has no Status column
// binding. Never interpret a missing Date Received cell as permission to erase
// an existing receipt date or a locally cancelled Order.
export function orderStatusFromPulledDates(fields, existing, hasStatusBinding) {
  if (hasStatusBinding) return fields;
  // A verified nonempty Smartsheet text choice replaces a previously dated
  // receipt. A custom choice stays open; In Stock counts as received.
  if (fields?.receipt_option && fields?.date_received === '') {
    return { ...fields, status: String(fields.receipt_option).trim().toLowerCase() === 'in stock'
      ? 'received' : ((fields?.date_ordered || existing?.date_ordered) ? 'ordered' : 'pending') };
  }
  if (isFulfilledOrder(fields)) return { ...fields, status: 'received' };
  if (existing?.status === 'cancelled' || isFulfilledOrder(existing)) return fields;
  return { ...fields, status: (fields?.date_ordered || existing?.date_ordered) ? 'ordered' : 'pending' };
}
