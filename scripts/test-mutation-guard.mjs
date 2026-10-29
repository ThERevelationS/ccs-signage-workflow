import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-mutation-guard.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/estimateMutationGuard.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
});
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { assertEstimateProductMutationAllowed, getPendingEstimatePriceAcceptance } = await import(pathToFileURL(out).href);

await assert.rejects(
  assertEstimateProductMutationAllowed(null),
  /could not be verified/, 'missing estimate throws');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', updated_date: 'v-new' }, { expectedUpdatedAt: 'v-old' }),
  /changed in another session/, 'version drift throws');
assert.equal(
  await assertEstimateProductMutationAllowed({ id: 'e1', updated_date: 'v1', status: 'draft' }, { expectedUpdatedAt: 'v1' }),
  null, 'draft passes, no revision needed');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'cancelled' }),
  /cancelled and permanently locked/, 'cancelled is hard-locked');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'draft', line_items: [{ price_acceptance_pending: { key: 'k-pending' } }] }),
  /still being recovered/, 'pending builder mutation blocks');
assert.equal(
  await assertEstimateProductMutationAllowed(
    { id: 'e1', status: 'draft', line_items: [{ price_acceptance_pending: { key: 'k-pending' } }] },
    { allowPriceAcceptanceKey: 'k-pending' }),
  null, 'matching pending key resumes instead of blocking');
assert.equal(
  getPendingEstimatePriceAcceptance({ line_items: [{ price_acceptance_pending: { key: 'k' } }] }).pending.key, 'k');

console.log('PASS estimate mutation guard (7 cases)');
