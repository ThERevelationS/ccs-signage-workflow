import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-customer-sync-sdk.mjs');
writeFileSync(stub, 'export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }) };' + String.fromCharCode(10) + 'export const isRetryableFunction = () => false;');
const bundle = (name) => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, `../src/components/estimator/${name}.js`)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
    alias: { '@/api/base44Client': stub },
    define: { 'import.meta.env': '{}' } });
  return out;
};

// base44Client reads browser globals at module-eval time.
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { estimateCustomerChangedKeys, estimateCustomerFieldsChanged, canonicalEstimateWorkOrder, findCustomerByName, resolveCustomerForEstimate } =
  await import(pathToFileURL(bundle('customerSync')).href);
const { getPendingEstimatePriceAcceptance } = await import(pathToFileURL(bundle('estimateMutationGuard')).href);

// --- canonicalEstimateWorkOrder: oldest non-deleted row wins on dup convergence
{
  const older = { id: 'w1', created_date: '2026-01-01T00:00:00Z' };
  const newer = { id: 'w2', created_date: '2026-01-02T00:00:00Z' };
  assert.equal(canonicalEstimateWorkOrder([newer, older]).id, 'w1', 'earliest row is canonical');
  assert.equal(canonicalEstimateWorkOrder([]), null);
  assert.equal(canonicalEstimateWorkOrder([{ id: 'a', created_date: '' }, { id: 'b', created_date: '' }]).id, 'a', 'id tiebreak');
}

// --- estimateCustomerChangedKeys / FieldsChanged
{
  const before = { client_name: 'Acme', office_phone: '555', terms: 'Net 30' };
  const afterSame = { ...before };
  assert.equal(estimateCustomerFieldsChanged(before, afterSame), false);
  assert.deepEqual(estimateCustomerChangedKeys(before, { ...before, terms: 'Net 60' }), ['terms'], 'changed key detected');
  assert.ok(estimateCustomerChangedKeys({}, { office_phone: '1' }).includes('office_phone'));
  assert.ok(Array.isArray(estimateCustomerChangedKeys(null, null)), 'null-safe');
}

// --- findCustomerByName: company_name then legacy client names, normalized
{
  const customers = [
    { id: 'c1', company_name: 'Acme Signs' },
    { id: 'c2', company_name: 'Other Co', legacy_client_names: ['Acme Signage LLC'] },
  ];
  assert.equal(findCustomerByName(customers, 'acme signs')?.id, 'c1', 'case-insensitive match');
  assert.equal(findCustomerByName(customers, '  ACME SIGNS  ')?.id, 'c1', 'trimmed case-insensitive match');
  assert.equal(findCustomerByName(customers, 'Acme Signage LLC')?.id, 'c2', 'legacy name match');
  assert.equal(findCustomerByName(customers, 'Nope'), null);
  assert.equal(findCustomerByName(customers, ''), null, 'blank returns null');
}

// --- resolveCustomerForEstimate: linked id wins, name fallback (no base44 hits)
{
  const customers = [{ id: 'c1', company_name: 'Acme' }, { id: 'c2', company_name: 'Beta' }];
  assert.equal((await resolveCustomerForEstimate({ customer_id: 'c2', client_name: 'Acme' }, customers))?.id, 'c2', 'linked id wins over name');
  assert.equal((await resolveCustomerForEstimate({ client_name: 'acme' }, customers))?.id, 'c1', 'name fallback');
  assert.equal(await resolveCustomerForEstimate({ client_name: 'Ghost' }, customers), null, 'unmatched returns null');
}

// --- getPendingEstimatePriceAcceptance
{
  const pending = { key: 'abc', at: '2026-01-01' };
  const est = { line_items: [{ line_id: 'x' }, { line_id: 'y', price_acceptance_pending: pending }] };
  const found = getPendingEstimatePriceAcceptance(est);
  assert.equal(found.line.line_id, 'y');
  assert.equal(found.pending.key, 'abc');
  assert.equal(getPendingEstimatePriceAcceptance({ line_items: [] }), null);
  assert.equal(getPendingEstimatePriceAcceptance({}), null);
}

{
  const picker = readFileSync(resolve(here, '../src/components/estimator/aio/CustomerSearchDialog.jsx'), 'utf8');
  const newCustomerDialog = readFileSync(resolve(here, '../src/components/estimator/aio/NewCustomerDialog.jsx'), 'utf8');
  assert.match(picker, /query\.trim\(\)\.toLowerCase\(\)/, 'customer search normalizes surrounding whitespace and case');
  assert.match(newCustomerDialog, /String\(c\?\.company_name \|\| \"\"\)\.trim\(\)\.toLowerCase\(\)/, 'existing names are normalized');
  assert.match(newCustomerDialog, /String\(data\.company_name \|\| \"\"\)\.trim\(\)\.toLowerCase\(\)/, 'new name is normalized before duplicate warning');
}

console.log('PASS customer sync, picker normalization, and mutation guard');
rmSync(stub, { force: true });
rmSync(resolve(here, '.tmp-customerSync.mjs'), { force: true });
rmSync(resolve(here, '.tmp-estimateMutationGuard.mjs'), { force: true });
process.exit(0);