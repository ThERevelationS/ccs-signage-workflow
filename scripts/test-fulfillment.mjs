import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-fulfillment-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/fulfillmentModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  FULFILLMENT_METHODS, FULFILLMENT_STATES, FULFILLMENT_AWAITING,
  FULFILLMENT_COMPLETED, FULFILLMENT_TERMINAL, METHOD_AWAITING_STATE,
  METHOD_COMPLETED_STATE, STATE_METHOD, fulfillmentMethodFrom,
  isFulfillmentState, isFulfillmentAwaiting, isFulfillmentTerminal,
  awaitingStateFor, completedStateFor, methodForState,
  FULFILLMENT_CUSTOMER_LABELS, customerLabelFor,
  COMPLETED_SUBSTATUSES, completedSubstatus, completedSubstatusBadge,
  FULFILLMENT_METHOD_PRECEDENCE, resolveFulfillmentMethod, methodLabel,
  queueBucketFor,
} = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// E-05 — vocabulary + state maps, both directions
// ---------------------------------------------------------------------------
assert.deepEqual([...FULFILLMENT_METHODS], ['pickup', 'installation', 'shipping', 'delivery'], 'four methods in display order');
assert.deepEqual([...FULFILLMENT_STATES], [
  'none', 'awaiting_pickup', 'awaiting_installation', 'awaiting_shipping',
  'awaiting_delivery', 'picked_up', 'installed', 'shipped', 'delivered',
], 'nine states mirroring the entity enum');
assert.deepEqual([...FULFILLMENT_AWAITING], ['awaiting_pickup', 'awaiting_installation', 'awaiting_shipping', 'awaiting_delivery'], 'awaiting set');
assert.deepEqual(FULFILLMENT_COMPLETED, {
  awaiting_pickup: 'picked_up', awaiting_installation: 'installed',
  awaiting_shipping: 'shipped', awaiting_delivery: 'delivered',
}, 'awaiting → completed transition map');

// Reverse direction: method → awaiting state.
assert.equal(awaitingStateFor('pickup'), 'awaiting_pickup');
assert.equal(awaitingStateFor('installation'), 'awaiting_installation');
assert.equal(awaitingStateFor('shipping'), 'awaiting_shipping');
assert.equal(awaitingStateFor('delivery'), 'awaiting_delivery');
// And method → completed state.
assert.equal(completedStateFor('pickup'), 'picked_up');
assert.equal(completedStateFor('installation'), 'installed');
assert.equal(completedStateFor('shipping'), 'shipped');
assert.equal(completedStateFor('delivery'), 'delivered');

// Round-trip: every method's awaiting state completes to its terminal state,
// and every tracked state maps back to its own method.
for (const m of FULFILLMENT_METHODS) {
  const awaiting = awaitingStateFor(m);
  assert.equal(FULFILLMENT_COMPLETED[awaiting], completedStateFor(m), `${m} transition`);
  assert.equal(methodForState(awaiting), m, `${awaiting} → ${m}`);
  assert.equal(methodForState(completedStateFor(m)), m, `${m} terminal → ${m}`);
}
assert.equal(methodForState('none'), '', 'none has no method');
assert.equal(methodForState('bogus'), '', 'unknown state has no method');
// Method/state maps agree with the per-function lookups.
for (const m of FULFILLMENT_METHODS) {
  assert.equal(METHOD_AWAITING_STATE[m], awaitingStateFor(m));
  assert.equal(METHOD_COMPLETED_STATE[m], completedStateFor(m));
  assert.equal(STATE_METHOD[awaitingStateFor(m)], m);
}

// Method alias normalization on the state helpers.
assert.equal(awaitingStateFor('install'), 'awaiting_installation', 'install alias');
assert.equal(completedStateFor('ship'), 'shipped', 'ship alias');
assert.equal(awaitingStateFor('bogus'), '', 'unknown method → ""');
assert.equal(completedStateFor(''), '');

// Membership / terminal detection (normalized like the status model).
for (const s of FULFILLMENT_STATES) assert.ok(isFulfillmentState(s), `${s} validates`);
assert.ok(isFulfillmentState(' Awaiting-Pickup '), 'normalize folds spaces/hyphens/case');
assert.equal(isFulfillmentState('bogus'), false);
assert.equal(isFulfillmentState(''), false);
assert.equal(isFulfillmentState(undefined), false);
for (const s of FULFILLMENT_AWAITING) assert.ok(isFulfillmentAwaiting(s), `${s} awaiting`);
assert.ok(isFulfillmentAwaiting('Awaiting_Delivery'));
assert.equal(isFulfillmentAwaiting('picked_up'), false);
for (const s of FULFILLMENT_TERMINAL) assert.ok(isFulfillmentTerminal(s), `${s} terminal`);
assert.ok(isFulfillmentTerminal('Picked-Up'), 'terminal normalization');
assert.equal(isFulfillmentTerminal('awaiting_pickup'), false, 'awaiting not terminal');
assert.equal(isFulfillmentTerminal('none'), false);
assert.equal(isFulfillmentTerminal('bogus'), false);
// awaiting ∪ terminal ∪ {none} = the full enum, no overlap.
assert.deepEqual(
  ['none', ...FULFILLMENT_AWAITING, ...FULFILLMENT_TERMINAL].sort(),
  [...FULFILLMENT_STATES].sort(),
  'none + awaiting + terminal covers the enum',
);

// Customer-facing labels: exact text on all eight tracked states.
const EXPECTED_LABELS = {
  awaiting_pickup: 'Ready for Pickup',
  awaiting_installation: 'Awaiting Installation',
  awaiting_shipping: 'Awaiting Shipment',
  awaiting_delivery: 'Awaiting Delivery',
  picked_up: 'Picked Up',
  installed: 'Installed',
  shipped: 'Shipped',
  delivered: 'Delivered',
};
assert.deepEqual(
  Object.keys(FULFILLMENT_CUSTOMER_LABELS).sort(),
  Object.keys(EXPECTED_LABELS).sort(),
  'label map covers every tracked state (not none)',
);
for (const [state, label] of Object.entries(EXPECTED_LABELS)) {
  assert.equal(customerLabelFor(state), label, `${state} label`);
}
assert.equal(customerLabelFor('Awaiting_Pickup'), 'Ready for Pickup', 'label normalization');
assert.equal(customerLabelFor('none'), '', 'none renders no label');
assert.equal(customerLabelFor('bogus'), '');
assert.equal(customerLabelFor(''), '');

// ---------------------------------------------------------------------------
// E-07 — completed substatus truth table
// ---------------------------------------------------------------------------
assert.deepEqual([...COMPLETED_SUBSTATUSES], ['on_account', 'past_due'], 'substatus set');
const TODAY = new Date('2026-06-15T12:00:00');
const ymd = (d) => d.toISOString().slice(0, 10);

// Paid-in-full / no open balance → null, regardless of dates.
assert.equal(completedSubstatus({ status: 'paid', balance_due: 0, due_date: '2020-01-01' }, TODAY), null, 'paid status → null');
assert.equal(completedSubstatus({ status: 'sent', balance_due: 0, due_date: '2020-01-01' }, TODAY), null, 'zero balance → null');
assert.equal(completedSubstatus({ status: 'sent', balance_due: -5 }, TODAY), null, 'credit balance → null');
assert.equal(completedSubstatus({ status: 'void', balance_due: 500, due_date: '2020-01-01' }, TODAY), null, 'void → null');
assert.equal(completedSubstatus({ status: 'partially_paid', total: 100, amount_paid: 100 }, TODAY), null, 'total−paid ≤ 0 → null');
assert.equal(completedSubstatus(null, TODAY), null, 'no invoice → null');
assert.equal(completedSubstatus({}, TODAY), null, 'empty invoice has no open balance');

// Open balance + due in the past → past_due.
assert.equal(completedSubstatus({ status: 'sent', balance_due: 250, due_date: '2026-06-14' }, TODAY), 'past_due', 'due yesterday → past_due');
assert.equal(completedSubstatus({ status: 'partially_paid', balance_due: 1, due_date: '2026-06-01' }, TODAY), 'past_due');
assert.equal(completedSubstatus({ status: 'draft', balance_due: 10, due_date: '2026-06-14' }, TODAY), 'past_due', 'draft with overdue balance still flags');

// Boundary: due TODAY is not past due.
assert.equal(completedSubstatus({ status: 'sent', balance_due: 250, due_date: '2026-06-15' }, TODAY), 'on_account', 'due today → on_account (boundary)');
assert.equal(completedSubstatus({ status: 'sent', balance_due: 250, due_date: '2026-06-16' }, TODAY), 'on_account', 'due tomorrow → on_account');
assert.equal(completedSubstatus({ status: 'sent', balance_due: 250, due_date: '' }, TODAY), 'on_account', 'no due date → on_account');
assert.equal(completedSubstatus({ status: 'sent', balance_due: 250, due_date: 'not-a-date' }, TODAY), 'on_account', 'unparseable due → on_account');
// Balance derived from total − amount_paid when balance_due absent.
assert.equal(completedSubstatus({ status: 'partially_paid', total: 300, amount_paid: 100, due_date: '2026-06-10' }, TODAY), 'past_due', 'derived balance overdue');
assert.equal(completedSubstatus({ status: 'partially_paid', total: 300, amount_paid: 100, due_date: '2026-06-20' }, TODAY), 'on_account', 'derived balance current');
// `today` injectable as a date string; default uses real now.
assert.equal(completedSubstatus({ status: 'sent', balance_due: 5, due_date: '2026-01-01' }, '2026-02-01'), 'past_due', 'string today arg');
assert.ok(['on_account', 'past_due'].includes(completedSubstatus({ status: 'sent', balance_due: 5, due_date: ymd(new Date(Date.now() + 86400000 * 30)) })), 'default today arg runs');

// Badge descriptors.
assert.deepEqual(completedSubstatusBadge('on_account'), { label: 'On Account', tone: 'info' });
assert.deepEqual(completedSubstatusBadge('past_due'), { label: 'Past Due', tone: 'danger' });
assert.deepEqual(completedSubstatusBadge(null), { label: '', tone: 'neutral' }, 'no substatus → empty badge');
assert.deepEqual(completedSubstatusBadge('bogus'), { label: '', tone: 'neutral' });
assert.equal(completedSubstatusBadge('On_Account').label, 'On Account', 'badge normalization');

// ---------------------------------------------------------------------------
// E-08 — fulfillment-method capture + queue bucketing
// ---------------------------------------------------------------------------
assert.deepEqual([...FULFILLMENT_METHOD_PRECEDENCE], [
  'product.fulfillment_method', 'workOrder.fulfillment_method', 'estimate.delivery_method',
], 'precedence order is declared');

// Precedence: product beats WO beats estimate.
assert.equal(resolveFulfillmentMethod({
  product: { fulfillment_method: 'pickup' },
  workOrder: { fulfillment_method: 'installation' },
  estimate: { delivery_method: 'shipping' },
}), 'pickup', 'product wins over WO + estimate');
assert.equal(resolveFulfillmentMethod({
  product: {},
  workOrder: { fulfillment_method: 'installation' },
  estimate: { delivery_method: 'shipping' },
}), 'installation', 'WO wins when product blank');
assert.equal(resolveFulfillmentMethod({
  estimate: { delivery_method: 'delivery' },
}), 'delivery', 'estimate intent used last');
assert.equal(resolveFulfillmentMethod({}), '', 'no sources → ""');
assert.equal(resolveFulfillmentMethod(), '', 'no args → ""');

// Alias normalization at every layer.
assert.equal(resolveFulfillmentMethod({ product: { fulfillment_method: 'install' } }), 'installation');
assert.equal(resolveFulfillmentMethod({ workOrder: { fulfillment_method: 'ship' } }), 'shipping');
assert.equal(resolveFulfillmentMethod({ estimate: { delivery_method: 'will_call' } }), 'pickup');
assert.equal(resolveFulfillmentMethod({ estimate: { delivery_method: 'deliver' } }), 'delivery');
// Unrecognized values are skipped, not fatal — a quote-delivery channel like
// "email" never masquerades as a fulfillment method, and a garbage product
// value doesn't hide a valid WO capture.
assert.equal(resolveFulfillmentMethod({ estimate: { delivery_method: 'email' } }), '', 'email is not a fulfillment method');
assert.equal(resolveFulfillmentMethod({
  product: { fulfillment_method: 'carrier-pigeon' },
  workOrder: { fulfillment_method: 'delivery' },
}), 'delivery', 'unrecognized product value falls through to WO');

// Method labels.
assert.equal(methodLabel('pickup'), 'Pickup');
assert.equal(methodLabel('installation'), 'Installation');
assert.equal(methodLabel('ship'), 'Shipping', 'alias label');
assert.equal(methodLabel('delivery'), 'Delivery');
assert.equal(methodLabel('bogus'), '');
assert.equal(methodLabel(''), '');

// queueBucketFor: explicit method first, then the method implied by
// fulfillment_state, then the caller fallback.
assert.equal(queueBucketFor({ fulfillment_method: 'pickup', fulfillment_state: 'awaiting_shipping' }), 'pickup', 'explicit method beats state hint');
assert.equal(queueBucketFor({ fulfillment_state: 'awaiting_installation' }), 'installation', 'state-implied bucket');
assert.equal(queueBucketFor({ fulfillment_state: 'shipped' }), 'shipping', 'terminal state still buckets');
assert.equal(queueBucketFor({ fulfillment_state: 'none' }, 'delivery'), 'delivery', 'fallback used when product silent');
assert.equal(queueBucketFor({}), '', 'empty product → no bucket');
assert.equal(queueBucketFor({ fulfillment_method: 'email' }), '', 'unrecognized method → no bucket');
for (const m of FULFILLMENT_METHODS) {
  assert.equal(queueBucketFor({ fulfillment_state: awaitingStateFor(m) }), m, `${m} awaiting buckets to ${m}`);
  assert.equal(queueBucketFor({ fulfillment_state: completedStateFor(m) }), m, `${m} terminal buckets to ${m}`);
}

rmSync(out);
console.log('PASS fulfillment');
