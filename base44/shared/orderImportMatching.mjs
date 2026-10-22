import { OrderImportConflictError } from './orderImportPersistence.mjs';

const clean = value => String(value ?? '').trim();

export class OrderImportMatchConflictError extends OrderImportConflictError {
  constructor(reason) {
    super(reason === 'source'
      ? 'Multiple rows in this file have the same customer, description and item type. Review these repeated rows before importing them.'
      : 'Multiple existing Orders match this customer, description and item type. Review the matching Orders or import within the intended job.');
    this.name = 'OrderImportMatchConflictError';
    this.reason = reason;
  }
}

export function readOrderImportIdentity(row = {}) {
  return {
    customer_name: clean(row['Customer'] ?? row['Customer Name'] ?? row['customer'] ?? row['customer_name']),
    description: clean(row['Description'] ?? row['description']),
    request_type: clean(row['Type'] ?? row['Request Type'] ?? row['type']),
  };
}

export function orderImportMatchKey(order = {}) {
  // A tuple avoids collisions when a customer or description contains "|".
  // Match the same default item type used when a new imported Order is created.
  return JSON.stringify([
    clean(order.customer_name).toLowerCase(),
    clean(order.description).toLowerCase(),
    (clean(order.request_type) || 'Other').toLowerCase(),
  ]);
}

export function rememberOrderImportMatch(index, order) {
  if (order?.deleted === true) return;
  const id = clean(order?.id);
  if (!id) throw new Error('An existing Order is missing its permanent ID. Import matching could not be verified.');
  const key = orderImportMatchKey(order);
  const matches = index.get(key) || new Map();
  matches.set(id, order);
  index.set(key, matches);
}

export function buildOrderImportMatchIndex(orders) {
  if (!Array.isArray(orders)) throw new Error('Existing Orders could not be verified for import matching.');
  const index = new Map();
  for (const order of orders) rememberOrderImportMatch(index, order);
  return index;
}

export function countOrderImportSourceKeys(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = orderImportMatchKey(readOrderImportIdentity(row));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function selectOrderImportMatch(index, sourceCounts, identity) {
  const key = orderImportMatchKey(identity);
  // Check the whole workbook before this identity's first write. Otherwise a
  // later repeated source row could overwrite the first row's imported values.
  if ((sourceCounts.get(key) || 0) > 1) throw new OrderImportMatchConflictError('source');
  const matches = index.get(key);
  if (matches?.size > 1) throw new OrderImportMatchConflictError('existing');
  return matches?.values().next().value || null;
}
