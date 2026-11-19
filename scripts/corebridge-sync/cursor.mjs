export const SEED_CURSOR = Object.freeze({ last_account_id: 3834, last_order_id: 11286 });
export const SEED_PENDING = Object.freeze({ order_id: 11286, account_id: '3835', account_name: 'Cincinnati Vietnamese Baptist Church' });

export function parseCursor(row) {
  if (!row) return { ...SEED_CURSOR, watch_orders: [], pending_account_orders: [{ ...SEED_PENDING }], held_accounts: [], watch_transactions: {} };
  let note;
  try { note = typeof row.notes === 'string' ? JSON.parse(row.notes) : row.notes; }
  catch { throw new Error('Latest sync cursor has invalid notes.'); }
  const cursor = note?.cursor || note;
  const accounts = Number(cursor?.last_account_id);
  const orders = Number(cursor?.last_order_id);
  if (!Number.isSafeInteger(accounts) || accounts < SEED_CURSOR.last_account_id ||
      !Number.isSafeInteger(orders) || orders < SEED_CURSOR.last_order_id) {
    throw new Error('Latest sync cursor is invalid.');
  }
  const watch = cursor?.watch_orders ?? note?.watch_orders ?? [];
  if (!Array.isArray(watch) || watch.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(watch).size !== watch.length || watch.length > 200) {
    throw new Error('Latest sync cursor has invalid watched orders.');
  }
  const pending = cursor?.pending_account_orders ?? note?.pending_account_orders ?? [];
  if (!Array.isArray(pending) || pending.some((item) => !Number.isSafeInteger(item?.order_id) || item.order_id <= 0 ||
      !String(item.account_id || '').trim() || typeof item.account_name !== 'string') ||
      new Set(pending.map((item) => item.order_id)).size !== pending.length) {
    throw new Error('Latest sync cursor has invalid pending account orders.');
  }
  const held = cursor?.held_accounts ?? note?.held_accounts ?? [];
  if (!Array.isArray(held) || held.length > 200 || held.some((item) => {
    const id = String(item?.account_id ?? '');
    return !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
      typeof item.name !== 'string' || !item.name.trim() || typeof item.reason !== 'string' || !item.reason.trim() ||
      typeof item.first_seen !== 'string' || !Number.isFinite(Date.parse(item.first_seen));
  }) || new Set(held.map((item) => String(item.account_id))).size !== held.length) {
    throw new Error('Latest sync cursor has invalid held accounts.');
  }
  const transactions = Object.hasOwn(cursor, 'watch_transactions') ? cursor.watch_transactions
    : Object.hasOwn(note, 'watch_transactions') ? note.watch_transactions : {};
  const plainObject = transactions !== null && typeof transactions === 'object' &&
    (Object.getPrototypeOf(transactions) === Object.prototype || Object.getPrototypeOf(transactions) === null);
  if (!plainObject || Object.keys(transactions).length > 200 || Object.entries(transactions).some(([id, items]) =>
    !/^[1-9]\d*$/.test(id) || !Array.isArray(items) || items.length > 500 ||
    items.some((item) => typeof item !== 'string' || !item.trim()) || new Set(items).size !== items.length)) {
    throw new Error('Latest sync cursor has invalid watched transactions.');
  }
  return { last_account_id: accounts, last_order_id: orders, watch_orders: [...watch],
    pending_account_orders: pending.map((item) => ({ ...item })),
    held_accounts: held.map((item) => ({ ...item, account_id: String(item.account_id) })),
    watch_transactions: Object.fromEntries(Object.entries(transactions).map(([id, items]) => [id, [...items]])) };
}

export function updateWatchOrders(watch, orderId, shouldWatch) {
  if (!Number.isSafeInteger(orderId) || orderId < 1) throw new Error('Invalid watched order id.');
  const next = shouldWatch ? [...watch] : watch.filter((id) => id !== orderId);
  if (shouldWatch && !next.includes(orderId)) next.push(orderId);
  const dropped = next.splice(0, Math.max(0, next.length - 200));
  return { watch_orders: next, dropped };
}

export async function scanAbove({ high, missLimit, maxRecords, probe, processRecord }) {
  if (!Number.isSafeInteger(high) || high < 0 || !Number.isSafeInteger(missLimit) || missLimit < 1 ||
      !Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new Error('Invalid scan bounds.');
  let id = high;
  let lastProcessed = high;
  let misses = 0;
  let processed = 0;
  while (misses < missLimit && processed < maxRecords) {
    id++;
    let result;
    try {
      result = await probe(id);
      if (result === null) { misses++; continue; }
      await processRecord(result, id);
    } catch (error) {
      if (error && typeof error === 'object') {
        error.lastProcessed = lastProcessed;
        error.failedId = id;
      }
      throw error;
    }
    lastProcessed = id;
    processed++;
    misses = 0;
  }
  return { lastProcessed, processed, lastProbed: id, consecutiveMisses: misses, capReached: processed >= maxRecords };
}
