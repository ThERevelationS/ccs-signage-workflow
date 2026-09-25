// Order Form only: Date Received is the authoritative receipt flag in the
// configured Order Request sheet. Keep historical records without deleting them.
export function effectiveOrderStatus(order) {
  if (order?.date_received) return 'received';
  if (order?.status === 'cancelled') return 'cancelled';
  if (order?.date_ordered) return 'ordered';
  // Historical imports defaulted to pending even when receipt dates existed.
  // An unverified status alone must not hide an item from the open-items view.
  return order?.status === 'received' ? 'pending' : (order?.status || 'pending');
}

export function orderMatchesReceivedFilter(order, filter) {
  if (filter === 'not_received') return !order?.date_received;
  if (filter === 'received') return Boolean(order?.date_received);
  if (filter === 'pending' || filter === 'ordered' || filter === 'cancelled') {
    return !order?.date_received && effectiveOrderStatus(order) === filter;
  }
  return true; // Existing unfiltered consumers and explicit Order history view.
}

// Derive the Base44 status when the Order Request sheet has no Status column
// binding. Never interpret a missing Date Received cell as permission to erase
// an existing receipt date or a locally cancelled Order.
export function orderStatusFromPulledDates(fields, existing, hasStatusBinding) {
  if (hasStatusBinding) return fields;
  if (fields?.date_received) return { ...fields, status: 'received' };
  if (existing?.status === 'cancelled' || existing?.date_received) return fields;
  return { ...fields, status: (fields?.date_ordered || existing?.date_ordered) ? 'ordered' : 'pending' };
}
