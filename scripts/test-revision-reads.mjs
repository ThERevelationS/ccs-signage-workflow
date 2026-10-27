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

const stub = resolve(here, '.tmp-stubs.mjs');
writeFileSync(stub, `
globalThis.__revisionRows = [];
globalThis.__listError = null;
export const base44 = {
  entities: { EstimateRevision: { filter: async (q) => { if (globalThis.__listError) throw globalThis.__listError; return (globalThis.__revisionRows || []).filter((r) => r.estimate_id === q?.estimate_id && (q?.revision_status ? r.revision_status === q.revision_status : true)); } } },
  functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: {} },
};
export const staffEntities = base44.entities;
`);
const out = resolve(here, '.tmp-rev.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/estimateRevisionService.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub },
});
const { getOpenEstimateRevision, listEstimateRevisions } = await import(pathToFileURL(out).href);

globalThis.__revisionRows = [
  { id: 'r1', estimate_id: 'e1', revision_status: 'open', revision_number: 2 },
  { id: 'r0', estimate_id: 'e1', revision_status: 'closed', revision_number: 1 },
  { id: 'other', estimate_id: 'e2', revision_status: 'open', revision_number: 3 },
];

// getOpenEstimateRevision — blank -> null; returns the open revision.
assert.equal(await getOpenEstimateRevision(''), null);
assert.equal((await getOpenEstimateRevision('e1'))?.id, 'r1', 'open revision returned');
assert.equal((await getOpenEstimateRevision('e2'))?.id, 'other');
assert.equal(await getOpenEstimateRevision('e3'), null, 'no rows -> null');

// listEstimateRevisions — non-strict returns sorted desc; strict rethrows.
globalThis.__revisionRows = [
  { id: 'r0', estimate_id: 'e1', revision_number: 1 },
  { id: 'r2', estimate_id: 'e1', revision_number: 3 },
  { id: 'r1', estimate_id: 'e1', revision_number: 2 },
];
assert.deepEqual((await listEstimateRevisions('e1')).map((r) => r.revision_number), [3, 2, 1], 'desc by revision_number');
globalThis.__listError = new Error('catalog unavailable');
assert.deepEqual(await listEstimateRevisions('e1'), [], 'non-strict swallows error');
await assert.rejects(listEstimateRevisions('e1', { strict: true }), /catalog unavailable/, 'strict rethrows');
globalThis.__listError = null;

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS revision reads (8 cases)');
process.exit(0);
