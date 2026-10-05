export function durablePendingOrderIds(orders = []) {
  const ids = [];
  const seen = new Set();
  for (const order of Array.isArray(orders) ? orders : []) {
    const id = String(order?.id || '').trim();
    if (!id || order?.deleted === true || order?.smartsheet_pending_local_sync !== true || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
