import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-stubs.mjs');
writeFileSync(stub, `
globalThis.__assertCalls = [];
export const base44 = { entities: { AllInOneEstimate: { get: async (id) => id === 'est-1' ? { id: 'est-1', status: 'draft' } : null } }, functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: {} } };
export const assertEstimateProductMutationAllowed = async (estimate, opts) => { globalThis.__assertCalls.push({ estimateId: estimate?.id, opts }); return null; };
export const staffEntities = base44.entities;
`);
const out = resolve(here, '.tmp-preflight.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/sourceProjectPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub, '@/components/estimator/estimateMutationGuard': stub },
});
const { preflightBuilderSourceMutation } = await import(pathToFileURL(out).href);
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

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS preflight source mutation (7 cases)');
process.exit(0);
