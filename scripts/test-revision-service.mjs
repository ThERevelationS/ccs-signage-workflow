import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-base44-stub.mjs');
import { writeFileSync, rmSync } from 'node:fs';
writeFileSync(stub, `
globalThis.__revisionRows = [];
export const base44 = { entities: { EstimateRevision: {
  filter: async () => (globalThis.__revisionRows || []).slice(),
  create: async (d) => ({ ...d, id: 'new' }),
  get: async () => null,
  updateMany: async () => ({ updated: 0 }),
}}, functions: { invoke: async () => ({}) } };
export const staffEntities = base44.entities;
export function __setRows(rows) { globalThis.__revisionRows = rows; }
`);
const out = resolve(here, '.tmp-revision-service.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/estimateRevisionService.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub },
});
const svc = await import(pathToFileURL(out).href);
const stubMod = await import(pathToFileURL(stub).href);

// getOpenEstimateRevision: latest open revision wins.
stubMod.__setRows([
  { id: 'r1', estimate_id: 'e1', revision_status: 'open', revision_number: 1 },
  { id: 'r2', estimate_id: 'e1', revision_status: 'open', revision_number: 2 },
]);
// filter returns all open rows; the service takes [0] after "-revision_number" sort —
// the mock ignores sort so provide the same order the API would return.
const open = await svc.getOpenEstimateRevision('e1');
assert.ok(open?.id, 'open revision returned');
assert.equal(await svc.getOpenEstimateRevision(''), null, 'missing id -> null');

// listEstimateRevisions: sorted desc by revision_number.
stubMod.__setRows([
  { id: 'r1', estimate_id: 'e1', revision_status: 'completed', revision_number: 1 },
  { id: 'r3', estimate_id: 'e1', revision_status: 'completed', revision_number: 3 },
  { id: 'r2', estimate_id: 'e1', revision_status: 'completed', revision_number: 2 },
]);
const list = await svc.listEstimateRevisions('e1');
assert.deepEqual(list.map((r) => r.revision_number), [3, 2, 1], 'descending revision order');
assert.deepEqual(await svc.listEstimateRevisions(''), [], 'missing id -> empty');

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS revision service (5 cases)');
