import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-customer-pricing.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerPricing.js')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const { hasNumericValue, acceptedCustomerUnitPrice, liveCustomerUnitPrice, acceptedInternalEstimateCost, manualCustomerPriceState, sourceProjectEconomics } =
  await import(pathToFileURL(bundlePath).href);

assert.equal(hasNumericValue(0), true, 'zero is numeric');
assert.equal(hasNumericValue(''), false, 'empty string is not numeric');
assert.equal(hasNumericValue(null), false);
assert.equal(hasNumericValue('12.5'), true);

assert.equal(acceptedCustomerUnitPrice({ customer_price_snapshot: 42 }), 42);
assert.equal(acceptedCustomerUnitPrice({ customer_price_snapshot: 0, total_snapshot: 55 }), 0, 'explicit 0 snapshot wins');
assert.equal(acceptedCustomerUnitPrice({ total_snapshot: 55 }), 55, 'falls back to total_snapshot');
assert.equal(acceptedCustomerUnitPrice({}), 0);

assert.equal(liveCustomerUnitPrice({ live_customer_price_snapshot: 10, customer_price_snapshot: 20 }), 10, 'live snapshot wins');
assert.equal(liveCustomerUnitPrice({ customer_price_snapshot: 20, live_total_snapshot: 30 }), 20);
assert.equal(liveCustomerUnitPrice({ live_total_snapshot: 30, total_snapshot: 40 }), 30);
assert.equal(liveCustomerUnitPrice({ total_snapshot: 40 }), 40);

assert.equal(acceptedInternalEstimateCost([{ total_snapshot: 100, customer_quantity: 2 }, { total_snapshot: 50 }]), 250);
assert.equal(acceptedInternalEstimateCost([]), 0);
assert.equal(acceptedInternalEstimateCost([{ total_snapshot: 100, customer_quantity: -3 }]), 0, 'negative qty clamped');

assert.equal(manualCustomerPriceState({ detached: true }), 'detached_parts');
assert.equal(manualCustomerPriceState({ recalcRequired: true }), 'changed');
assert.equal(manualCustomerPriceState({ detached: true, recalcRequired: true }), 'detached_parts', 'detached wins');
assert.equal(manualCustomerPriceState({}), 'manual');

// sourceProjectEconomics per-module economics.
assert.deepEqual(
  sourceProjectEconomics('foundation', { customer_markup_percent: 25 }, 800),
  { internalCost: 800, customerPrice: 1000 }, 'foundation markup');
assert.deepEqual(
  sourceProjectEconomics('foundation', { customer_price_override: 1234 }, 800),
  { internalCost: 800, customerPrice: 1234 }, 'foundation override wins');
assert.deepEqual(
  sourceProjectEconomics('vinyl', { total_cost: 900, markup_amount: 200 }, 0),
  { internalCost: 700, customerPrice: 900 }, 'vinyl splits markup from total');
assert.deepEqual(
  sourceProjectEconomics('channel_letters', { total_cost: 1000, subtotal: 800, total_letters_cost: 300, letters_subtotal: 250 }, 0),
  { internalCost: 750, customerPrice: 1000 }, 'channel letters subtract letter markup');
assert.deepEqual(
  sourceProjectEconomics('unknown_module', { total_cost: 500 }, 123),
  { internalCost: 123, customerPrice: 123 }, 'unknown module uses fallback');
assert.deepEqual(
  sourceProjectEconomics('vinyl', { total_cost: 900, markup_amount: 200, customer_pricing: { applied: true, total: 1111 } }, 0),
  { internalCost: 700, customerPrice: 1111 }, 'saved customer tier overrides derived price');
assert.deepEqual(sourceProjectEconomics('cnc', null, 50), { internalCost: 50, customerPrice: 50 }, 'null record falls back');

console.log('PASS customer pricing helpers (21 cases)');
