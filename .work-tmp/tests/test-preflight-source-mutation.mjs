import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-stubs.mjs');
writeFileSync(stub, `
globalThis.__assertCalls = [];
globalThis.__assertError = null;
globalThis.__estimates = { 'est-1': { id: 'est-1', status: 'draft' } };
export const base44 = { entities: { AllInOneEstimate: { get: async (id) => (globalThis.__estimates[id] || null) } }, functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: {} } };
export const assertEstimateProductMutationAllowed = async (estimate, opts) => {
  globalThis.__assertCalls.push({ estimateId: estimate?.id, estimateStatus: estimate?.status, estimateDeleted: estimate?.deleted, opts });
  if (globalThis.__assertError) throw globalThis.__assertError;
  return null;
};
export const staffEntities = { AllInOneEstimate: { get: async (id) => (globalThis.__estimates[id] || null) } };
`);
const out = resolve(here, '.tmp-preflight.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/sourceProjectPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub, '@/components/estimator/estimateMutationGuard': stub },
});
const { preflightBuilderSourceMutation, updateBuilderSourceProject } = await import(pathToFileURL(out).href);
const calls = globalThis.__assertCalls;

assert.equal(await preflightBuilderSourceMutation({}), null, 'blank estimateId returns null');
assert.equal(await preflightBuilderSourceMutation({ estimateId: '' }), null);
assert.equal(calls.length, 0, 'no guard call on blank id');

const est = await preflightBuilderSourceMutation({ estimateId: 'est-1' });
assert.equal(est?.id, 'est-1');
assert.equal(calls.length, 1, 'guard called once');
assert.equal(calls[0].estimateId, 'est-1');

await assert.rejects(
  preflightBuilderSourceMutation({ estimateId: 'ghost' }),
  /could not be verified/,
);
assert.equal(calls.length, 1, 'guard NOT called on missing estimate');

// ---------- #378: lifecycle/delegation coverage ----------
// The loaded estimate — whatever its lifecycle state — is the row handed to
// the mutation guard. The guard stub records what it was given so each state
// is proven to reach the same enforcement seam.
for (const [label, row] of [
  ['deleted', { id: 'e-del', status: 'draft', deleted: true }],
  ['archived', { id: 'e-arch', status: 'archived' }],
  ['sent', { id: 'e-sent', status: 'sent' }],
]) {
  calls.length = 0;
  globalThis.__estimates[row.id] = row;
  await preflightBuilderSourceMutation({ estimateId: row.id });
  assert.equal(calls.length, 1, `${label} estimate still reaches the guard`);
  assert.equal(calls[0].estimateId, row.id);
  if (row.deleted) assert.equal(calls[0].estimateDeleted, true, 'deleted flag forwarded');
  else assert.equal(calls[0].estimateStatus, row.status, `${label} status forwarded`);
}

// A guard rejection propagates through preflight untouched — the Builder save
// must surface the guard's own message, not a generic failure.
calls.length = 0;
globalThis.__assertError = new Error('This estimate is sent and protected. Start an Estimate Revision first.');
await assert.rejects(
  preflightBuilderSourceMutation({ estimateId: 'e-sent' }),
  /sent and protected/, 'guard rejection surfaces verbatim');
assert.equal(calls.length, 1);
globalThis.__assertError = null;

// updateBuilderSourceProject runs the preflight BEFORE its CAS write: when the
// guard rejects, updateMany is never attempted — a protected estimate's source
// row cannot be touched.
{
  calls.length = 0;
  let writes = 0;
  globalThis.__estimates['e-sent'] = { id: 'e-sent', status: 'sent' };
  globalThis.__assertError = new Error('This estimate is sent and protected.');
  const entity = {
    get: async () => ({ id: 'src-1', name: 'Source' }),
    updateMany: async () => { writes += 1; return { updated: 1 }; },
  };
  await assert.rejects(
    updateBuilderSourceProject({ entity, sourceId: 'src-1', expectedUpdatedAt: 'v1', data: { name: 'X' }, estimateId: 'e-sent' }),
    /sent and protected/, 'guarded source write blocked');
  assert.equal(writes, 0, 'updateMany never attempted when the guard trips');
  assert.equal(calls.length, 1, 'guard still consulted');
  globalThis.__assertError = null;
}

// Happy-path source write: preflight passes, CAS update lands and is re-read.
{
  calls.length = 0;
  const row = { id: 'src-1', name: 'Old', updated_date: 'v1' };
  const entity = {
    get: async () => ({ ...row }),
    updateMany: async (q, patch) => {
      assert.equal(q.id, 'src-1');
      assert.equal(q.updated_date, 'v1', 'CAS anchor on the loaded version');
      Object.assign(row, patch.$set, { updated_date: 'v2' });
      return { updated: 1 };
    },
  };
  const saved = await updateBuilderSourceProject({
    entity, sourceId: 'src-1', expectedUpdatedAt: 'v1', data: { name: 'New' }, estimateId: 'est-1',
  });
  assert.equal(saved.name, 'New', 'updated source returned');
  assert.equal(calls.length, 1, 'preflight ran ahead of the write');
}

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS preflight source mutation (26 cases)');
process.exit(0);
