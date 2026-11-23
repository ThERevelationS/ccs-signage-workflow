import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };
const throws = async (fn, re, n) => { try { await fn(); failed++; console.error('FAIL', n); } catch (e) { assert.ok(re.test(e.message), n + ' got ' + e.message); } };

const STUBS = {
  'guard': `export async function assertEstimateProductMutationAllowed(est){ if(est?.protected) throw new Error('protected'); }`,
  'staff': `export const staffEntities = { AllInOneEstimate: { get: async (id) => globalThis.__estimate || { id } } };`,
};
const plugin = {
  name: 's',
  setup(b) {
    b.onResolve({ filter: /estimateMutationGuard/ }, () => ({ path: 'guard', namespace: 'stub' }));
    b.onResolve({ filter: /staffEntities/ }, () => ({ path: 'staff', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js' }));
  },
};
const out = await esbuild.build({ entryPoints: [path.resolve('src/components/estimator/builder/sourceProjectPersistence.js')], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin] });
const tmp = path.join(os.tmpdir(), 'spp-' + process.pid + '.mjs');
fs.writeFileSync(tmp, out.outputFiles[0].text);
const M = await import(pathToFileURL(tmp).href);

const mkEntity = (initial) => {
  let row = { ...initial };
  return {
    row: () => row,
    calls: [],
    async updateMany(q, u) {
      this.calls.push(['updateMany', q, u]);
      if (this.fail) throw this.fail;
      if (row.id === q.id && row.updated_date === q.updated_date) {
        row = { ...row, ...(u.$set || {}), updated_date: this.nextVersion || 'v2' };
        return { updated: 1 };
      }
      return { updated: 0 };
    },
    async get(id) {
      this.calls.push(['get', id]);
      return this.getOverride ? this.getOverride(row) : row;
    },
  };
};
const base = { entity: null, sourceId: 'p1', expectedUpdatedAt: 'v1', data: { a: 1 }, estimateId: 'e1', label: 'X' };
const seed = r => { globalThis.__estimate = { id: 'e1' }; };

await ok('updated=1 + reread same payload -> accept', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  const r = await M.updateBuilderSourceProject({ ...base, entity: e });
  assert.equal(r.id, 'p1'); assert.equal(r.updated_date, 'v2'); assert.equal(r.a, 1);
});
await ok('updated=1 strips top-level system fields and retains nested identity', async () => {
  seed();
  const e = mkEntity({ id: 'p1', updated_date: 'v1', created_date: 'old-created' });
  const data = {
    id: 'p1', created_date: 'old-created', updated_date: 'v1', created_by: 'staff', created_by_id: 'staff-id',
    total_cost: 12, items: [{ id: 'item-1', updated_date: 'nested-version', created_by: 'nested-owner' }],
  };
  const original = structuredClone(data);
  const saved = await M.updateBuilderSourceProject({ ...base, entity: e, data });
  assert.equal(saved.updated_date, 'v2');
  const [, query, update] = e.calls.find(call => call[0] === 'updateMany');
  assert.deepEqual(query, { id: 'p1', updated_date: 'v1' });
  assert.deepEqual(update.$set, { total_cost: 12, items: data.items });
  assert.deepEqual(data, original);
});
await ok('updated=1 detects a real field changed on readback', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  e.getOverride = row => ({ ...row, total_cost: 10 });
  await assert.rejects(
    () => M.updateBuilderSourceProject({ ...base, entity: e, data: { id: 'p1', updated_date: 'v1', total_cost: 12 } }),
    /X changed in another session\. Reload it before saving\./,
  );
});
await ok('updated=0 accepts a matching retry despite stale system fields', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v2', created_date: 'server-created', total_cost: 12 });
  const data = { id: 'stale-id', updated_date: 'v1', created_date: 'stale-created', total_cost: 12 };
  const saved = await M.updateBuilderSourceProject({ ...base, entity: e, data });
  assert.equal(saved.updated_date, 'v2');
  assert.deepEqual(e.calls.find(call => call[0] === 'updateMany').slice(1), [{ id: 'p1', updated_date: 'v1' }, { $set: { total_cost: 12 } }]);
});
await ok('updated=0 still rejects a differing retry with stale system fields', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v2', total_cost: 10 });
  await assert.rejects(
    () => M.updateBuilderSourceProject({ ...base, entity: e, data: { id: 'p1', updated_date: 'v1', total_cost: 12 } }),
    /X changed in another session\. Reload it before saving\./,
  );
});
await ok('lost-response verification ignores stale system fields', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v2', created_date: 'server-created', total_cost: 12 });
  e.fail = new Error('network lost');
  const saved = await M.updateBuilderSourceProject({
    ...base, entity: e, data: { id: 'p1', updated_date: 'v1', created_date: 'old-created', total_cost: 12 },
  });
  assert.equal(saved.updated_date, 'v2');
  assert.deepEqual(e.calls.find(call => call[0] === 'updateMany')[2].$set, { total_cost: 12 });
});
await ok('sourcePatchMatches skips only top-level entity metadata', async () => {
  const record = { id: 'p1', created_date: 'new', updated_date: 'v2', created_by: 'new', created_by_id: 'new', total_cost: 12, items: [{ id: 'nested', updated_date: 'nested-v1' }] };
  assert.equal(M.sourcePatchMatches(record, { id: 'stale', created_date: 'old', updated_date: 'v1', created_by: 'old', created_by_id: 'old', total_cost: 12 }), true);
  assert.equal(M.sourcePatchMatches(record, { total_cost: 10 }), false);
  assert.equal(M.sourcePatchMatches(record, { items: [{ id: 'other', updated_date: 'nested-v1' }] }), false);
  assert.equal(M.sourcePatchMatches(record, { items: [{ id: 'nested', updated_date: 'nested-v2' }] }), false);
  assert.equal(M.sourcePatchMatches({ edit_reason: 'new' }, { edit_reason: 'old' }), false);
});
await ok('updated=1 + foreign reread -> conflict throw', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  e.getOverride = row => ({ id: 'p1', updated_date: 'v3', a: 999 });
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /changed in another session/, 'foreign reread');
});
await ok('updated=1 + reread missing version -> reject', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  e.getOverride = () => ({ id: 'p1', a: 1 });
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /changed in another session/, 'missing version');
});
await ok('updated=1 + reread wrong id -> reject', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  e.getOverride = () => ({ id: 'pX', updated_date: 'v2', a: 1 });
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /changed in another session/, 'wrong id');
});
await ok('lost response + intended record -> return without rewrite', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v2', a: 1 });
  e.fail = new Error('network lost');
  const r = await M.updateBuilderSourceProject({ ...base, entity: e });
  assert.equal(r.updated_date, 'v2');
  assert.equal(e.calls.filter(c => c[0] === 'updateMany').length, 1);
});
await ok('lost response + foreign record -> propagate error', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v9', a: 999 });
  e.fail = new Error('network lost');
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /network lost/, 'foreign');
});
await ok('updated=0 + intended record -> accept retry', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v2', a: 1 });
  const r = await M.updateBuilderSourceProject({ ...base, entity: e });
  assert.equal(r.updated_date, 'v2');
});
await ok('updated=0 + changed record -> conflict', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v9', a: 999 });
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /changed in another session/, 'conflict');
});
await ok('updated=2/-1/NaN/malformed -> reject', async () => {
  for (const v of [2, -1, NaN, null]) {
    seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
    e.updateMany = async () => ({ updated: v });
    await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /could not be verified/, 'updated=' + v);
  }
});
await ok('nested id change in reread detected', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  e.getOverride = () => ({ id: 'p1', updated_date: 'v2', a: 1, nested: { id: 'other' } });
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e, data: { a: 1, nested: { id: 'mine' } } }), /changed in another session/, 'nested id');
});
await ok('whitespace/numeric tolerance preserved', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  e.getOverride = () => ({ id: 'p1', updated_date: 'v2', name: 'Fix  it', total: 10.0000005 });
  const r = await M.updateBuilderSourceProject({ ...base, entity: e, data: { name: 'Fix it', total: 10 } });
  assert.equal(r.updated_date, 'v2');
});
await ok('protected estimate -> preflight blocks update', async () => {
  globalThis.__estimate = { id: 'e1', protected: true };
  const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  await throws(() => M.updateBuilderSourceProject({ ...base, entity: e }), /protected/, 'protected');
  assert.equal(e.calls.filter(c => c[0] === 'updateMany').length, 0);
  globalThis.__estimate = { id: 'e1' };
});
await ok('missing expected version -> reject early', async () => {
  seed(); const e = mkEntity({ id: 'p1', updated_date: 'v1' });
  await throws(() => M.updateBuilderSourceProject({ ...base, expectedUpdatedAt: '', entity: e }), /missing its loaded version/, 'no expected');
});
fs.rmSync(tmp, { force: true });
console.log(`PASS source-persistence passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
