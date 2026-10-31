import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis.window || { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, location: { origin: 'http://localhost', hostname: 'localhost', pathname: '/' }, self: {}, top: {} };
globalThis.window.self = globalThis.window;
globalThis.window.top = globalThis.window;
globalThis.document = globalThis.document || { createElement: () => ({ style: {} }), head: { appendChild: () => {} } };
const stub = resolve(here, '.tmp-b44-stub.mjs');
writeFileSync(stub, `
export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }) } };
export const staffEntities = base44.entities;
export const assertEstimateProductMutationAllowed = async () => null;
export const getOpenEstimateRevision = async () => null;
export const isRetryableFunction = () => false;
`);
const out1 = resolve(here, '.tmp-custsync.mjs');
const out2 = resolve(here, '.tmp-srcproj.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerSync.js')],
  bundle: true, format: 'esm', outfile: out1, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub },
});
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/sourceProjectPersistence.js')],
  bundle: true, format: 'esm', outfile: out2, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub, '@/components/estimator/estimateMutationGuard': stub },
});
const { canonicalEstimateWorkOrder } = await import(pathToFileURL(out1).href);
const { sourcePatchMatches } = await import(pathToFileURL(out2).href);

// canonicalEstimateWorkOrder — earliest created wins, id tiebreak, empty/null.
assert.equal(canonicalEstimateWorkOrder([]), null, 'empty -> null');
assert.equal(canonicalEstimateWorkOrder(null), null, 'null -> null');
assert.equal(canonicalEstimateWorkOrder([{ id: 'a', created_date: '2026-01-02' }]).id, 'a');
assert.equal(
  canonicalEstimateWorkOrder([
    { id: 'later', created_date: '2026-01-03' },
    { id: 'earlier', created_date: '2026-01-01' },
  ]).id, 'earlier', 'earliest created wins');
assert.equal(
  canonicalEstimateWorkOrder([
    { id: 'b', created_date: '2026-01-01' },
    { id: 'a', created_date: '2026-01-01' },
  ]).id, 'a', 'same date -> id tiebreak');
assert.equal(
  canonicalEstimateWorkOrder([
    { id: 'nodate' },
    { id: 'dated', created_date: '2026-01-01' },
  ]).id, 'nodate', 'missing date parses as 0 (earliest)');

// sourcePatchMatches — normalized compare; false on missing record/patch.
assert.equal(sourcePatchMatches(null, { a: 1 }), false);
assert.equal(sourcePatchMatches({ a: 1 }, null), false);
assert.equal(sourcePatchMatches({ a: 1 }, { a: 1 }), true);
assert.equal(sourcePatchMatches({ a: 'x', b: 2 }, { a: 'x' }), true, 'subset patch matches');
assert.equal(sourcePatchMatches({ a: 'x' }, { a: 'x', b: 2 }), false, 'extra patch key fails');
assert.equal(sourcePatchMatches({ nested: { b: 2, a: 1 } }, { nested: { a: 1, b: 2 } }), true, 'key-order-insensitive');
assert.equal(sourcePatchMatches({ n: 1.0000001 }, { n: 1 }), true, 'float tolerance');

rmSync(stub, { force: true });
rmSync(out1, { force: true });
rmSync(out2, { force: true });
console.log('PASS canonical compares (13 cases)');
process.exit(0);
