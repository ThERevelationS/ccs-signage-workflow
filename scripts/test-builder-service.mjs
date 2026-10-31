import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-builder-service.mjs');
const stub = resolve(here, '.tmp-builder-service-sdk.mjs');
writeFileSync(stub, 'export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }) };' + String.fromCharCode(10) + 'export const isRetryableFunction = () => false;');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/builderService.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub },
});
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { sourceProjectTotal } = await import(pathToFileURL(out).href);

// Module-total-field path: vinyl/cnc/etc. read record.total_cost.
assert.equal(sourceProjectTotal({ module_key: 'vinyl' }, { total_cost: 900 }), 900);
assert.equal(sourceProjectTotal({ module_key: 'cnc' }, { total_cost: '450' }), 450);

// Painting sums its three cost fields.
assert.equal(
  sourceProjectTotal({ module_key: 'painting' }, { total_paint_mask_cost: 100, total_liquid_paint_and_supplies_cost: 200, total_labor_cost: 150 }),
  450, 'painting 3-field sum');

// Foundation prefers grand_total, then the known-field sum.
assert.equal(sourceProjectTotal({ module_key: 'foundation' }, { grand_total: 5000 }), 5000);
assert.equal(
  sourceProjectTotal({ module_key: 'foundation' }, { total_concrete_cost: 100, total_labor_cost: 50 }),
  150, 'foundation falls back to field sum');

// Unknown/other modules read total_cost, else line snapshot.
assert.equal(sourceProjectTotal({ module_key: 'other' }, { total_cost: 77 }), 77);
assert.equal(sourceProjectTotal({ module_key: 'other' }, {}), 0);
assert.equal(
  sourceProjectTotal({ module_key: 'other', total_snapshot: 321 }, {}),
  321, 'line snapshot fallback');

// Missing record -> live snapshot, else total_snapshot.
assert.equal(sourceProjectTotal({ module_key: 'vinyl', live_total_snapshot: 88 }, null), 88);
assert.equal(sourceProjectTotal({ module_key: 'vinyl', total_snapshot: 66 }, null), 66);
assert.equal(sourceProjectTotal({ module_key: 'vinyl' }, null), 0);

console.log('PASS builder service totals (12 cases)');
rmSync(out, { force: true });
rmSync(stub, { force: true });
process.exit(0);
