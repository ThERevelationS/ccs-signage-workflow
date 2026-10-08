// Order Form only. Small post-write verification sets can read exact Base44
// IDs rather than scanning thousands of linked Orders again. Larger sets
// retain the existing safe, complete paginated sheet-linked read path.
export const ORDER_PULL_DIRECT_READBACK_LIMIT = 3;

export async function loadOrderPullReadbackRows({ entity, ids, readLinkedOrders }) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const normalizedIds = ids.map(id => String(id ?? '').trim());
  if (normalizedIds.some(id => !id)) {
    throw new Error('Order read-back is missing a permanent Base44 ID; no sync verification was confirmed.');
  }
  const uniqueIds = [...new Set(normalizedIds)];
  if (uniqueIds.length <= ORDER_PULL_DIRECT_READBACK_LIMIT) {
    if (typeof entity?.get !== 'function') throw new Error('Exact Order read-back is unavailable.');
    const rows = [];
    for (const id of uniqueIds) {
      const row = await entity.get(id);
      if (!row?.id || String(row.id) !== id) {
        throw new Error('Exact Order read-back did not confirm the requested permanent Base44 ID.');
      }
      rows.push(row);
    }
    return rows;
  }
  if (typeof readLinkedOrders !== 'function') {
    throw new Error('Complete Order read-back is unavailable.');
  }
  return await readLinkedOrders();
}
