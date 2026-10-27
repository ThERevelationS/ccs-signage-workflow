import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-cust-pricing.mjs');
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
buildSync({ entryPoints: [resolve(here, '../src/components/markup/savedCustomerPricing.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
const { calculateCustomerPricingFromConfig } = await import(pathToFileURL(out).href);

const categorize = (p) => (p?.items || []).map((i) => ({ module: 'x', label: i.n, category_key: 'mat', cost: i.c }));
const tiers = [{ tier_number: 1, tier_name: 'Standard', material_markup: 1.5 }, { tier_number: 2, tier_name: 'Premium', material_markup: 2 }];

// Null/empty guards.
assert.equal(calculateCustomerPricingFromConfig({ project: null, categorize, tiers }), null);
assert.equal(calculateCustomerPricingFromConfig({ project: { items: [] }, categorize, tiers }), null, 'empty lines -> null');
assert.equal(calculateCustomerPricingFromConfig({ project: { items: [{ n: 'a', c: 1 }] }, categorize, tiers: [] }), null, 'no tiers -> null');
assert.equal(calculateCustomerPricingFromConfig({ project: { items: [{ n: 'a', c: 1 }] }, categorize: null, tiers }), null);

// Happy path: marks up every line, returns tier metadata.
{
  const res = calculateCustomerPricingFromConfig({ project: { items: [{ n: 'a', c: 100 }] }, categorize, tierNumber: 1, tiers });
  assert.ok(res?.applied);
  assert.equal(res.tier_number, 1);
  assert.ok(res.raw_subtotal > 0);
  assert.ok(res.marked_subtotal >= res.raw_subtotal, 'marked >= raw');
  assert.equal(res.lines.length, 1);
  assert.equal(res.lines[0].label, 'a');
}

// Tier resolution: requested tier honored when it exists.
{
  const res = calculateCustomerPricingFromConfig({ project: { items: [{ n: 'a', c: 100 }] }, categorize, tierNumber: 2, tiers });
  assert.equal(res.tier_number, 2);
  assert.ok(res.marked_subtotal >= calculateCustomerPricingFromConfig({ project: { items: [{ n: 'a', c: 100 }] }, categorize, tierNumber: 1, tiers }).marked_subtotal, 'higher tier marks up more');
}

console.log('PASS customer pricing config (12 cases)');
// window stub -> SDK takes the browser path and keeps a handle alive; exit explicitly.
process.exit(0);
