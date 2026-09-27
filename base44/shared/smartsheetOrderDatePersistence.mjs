// Order-only verification after Base44 bulkUpdate. Verify ISO dates AND their
// companion text options: a silent drop of either leaves the UI and snapshot
// inconsistent with Smartsheet. Do not mark an Order synced on write ACK alone.
export const ORDER_DATE_FIELDS = ['date_needed', 'date_ordered', 'date_received'];
export const ORDER_DATE_OPTION_FIELDS = ['date_needed_option', 'date_ordered_option', 'receipt_option'];
export const ORDER_DATE_CELL_FIELDS = [...ORDER_DATE_FIELDS, ...ORDER_DATE_OPTION_FIELDS];
const value = input => String(input ?? '').trim();

export function changedPulledOrderDates(previous, incoming) {
  return Object.fromEntries(ORDER_DATE_CELL_FIELDS.filter(field =>
    Object.hasOwn(incoming ?? {}, field) && value(previous?.[field]) !== value(incoming[field])
  ).map(field => [field, value(incoming[field])]));
}

export async function verifyPulledOrderDates(entity, id, previous, changes) {
  if (!id || typeof entity?.get !== 'function' || typeof entity?.update !== 'function') {
    throw new Error('Order date verification requires a permanent Order ID and read/write access.');
  }
  const keys = Object.keys(changes ?? {});
  if (keys.length === 0) return { repaired: false };
  let actual = await entity.get(id);
  if (!actual?.id || String(actual.id) !== String(id)) throw new Error('Order date re-read did not confirm the permanent ID.');
  let missing = keys.filter(field => value(actual[field]) !== value(changes[field]));
  if (missing.length === 0) return { repaired: false };
  // Avoid overwriting a concurrent change that is neither our desired value
  // nor the value in the pre-pull baseline. Empty/missing bulk writes are safe
  // to repair when the previous Order was also empty.
  if (missing.some(field => value(actual[field]) && value(actual[field]) !== value(previous?.[field]))) {
    throw new Error(`Order dates changed concurrently: ${missing.join(', ')}. Review before retry.`);
  }
  const correction = Object.fromEntries(missing.map(field => [field, changes[field]]));
  await entity.update(id, correction);
  actual = await entity.get(id);
  if (!actual?.id || String(actual.id) !== String(id)) throw new Error('Order date repair re-read did not confirm the permanent ID.');
  missing = keys.filter(field => value(actual[field]) !== value(changes[field]));
  if (missing.length) throw new Error(`Base44 did not retain verified date fields: ${missing.join(', ')}.`);
  return { repaired: true };
}
