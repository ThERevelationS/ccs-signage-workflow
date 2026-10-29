import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-estimate-cas.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/estimatePersistence.js'), resolve(here, '../src/components/estimator/estimateConcurrency.js')], bundle: true, format: 'esm', outdir: resolve(here, '.tmp-cas'), outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
const { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } = await import(pathToFileURL(resolve(here, '.tmp-cas/estimatePersistence.mjs')).href);
const { hasEstimateVersionConflict } = await import(pathToFileURL(resolve(here, '.tmp-cas/estimateConcurrency.mjs')).href);

assert.equal(hasEstimateVersionConflict('a', 'b'), true);
assert.equal(hasEstimateVersionConflict('a', 'a'), false);
assert.equal(hasEstimateVersionConflict('', 'a'), false, 'missing baseline = no conflict');
assert.equal(hasEstimateVersionConflict('a', ''), false, 'missing current = no conflict');

assert.deepEqual(
  expectedEstimateFields({ a: 1, b: 2, c: 3 }, { a: 10, c: 30 }),
  { a: 1, c: 3 }, 'baseline snapshots only the desired fields');

const makeEntity = (record) => ({
  get: async () => ({ ...record }),
  updateMany: async (q, set) => {
    assert.equal(q.updated_date, record.updated_date, 'CAS anchored to loaded version');
    record = { ...record, ...set.$set, updated_date: 'v-next' };
    return { updated: 1 };
  },
});

// Happy path: field unchanged from baseline -> write lands.
{
  const entity = makeEntity({ id: 'e1', updated_date: 'v1', status: 'draft', total: 100 });
  const result = await replaceEstimateFieldsIfUnchanged({
    entity, estimateId: 'e1',
    expectedFields: { status: 'draft' },
    nextFields: { status: 'sent' },
    label: 'Test',
  });
  assert.equal(result.status, 'sent', 'update landed and re-read');
  assert.equal(result.updated_date, 'v-next', 'returned record is post-write');
}

// Conflict: field changed since baseline -> throws, nothing written.
await assert.rejects(
  (async () => {
    const entity = makeEntity({ id: 'e2', updated_date: 'v2', status: 'sent' });
    await replaceEstimateFieldsIfUnchanged({
      entity, estimateId: 'e2',
      expectedFields: { status: 'draft' },
      nextFields: { status: 'cancelled' },
      label: 'Test',
    });
  })(),
  /changed in another session/, 'drifted field blocks the write');

// No-op: current already equals desired -> returns record without updateMany.
{
  let writes = 0;
  const rec = { id: 'e3', updated_date: 'v3', status: 'sent' };
  const entity = { get: async () => ({ ...rec }), updateMany: async () => { writes += 1; return { updated: 1 }; } };
  const result = await replaceEstimateFieldsIfUnchanged({
    entity, estimateId: 'e3',
    expectedFields: { status: 'draft' },
    nextFields: { status: 'sent' },
    label: 'Test',
  });
  assert.equal(writes, 0, 'already-desired skips the write');
  assert.equal(result.status, 'sent');
}

// Guard fields: a guard field drift aborts even when desired field is untouched.
await assert.rejects(
  (async () => {
    const entity = makeEntity({ id: 'e4', updated_date: 'v4', status: 'draft', lock: 'other' });
    await replaceEstimateFieldsIfUnchanged({
      entity, estimateId: 'e4',
      expectedFields: { status: 'draft' },
      guardFields: { lock: 'mine' },
      nextFields: { status: 'sent' },
      label: 'Test',
    });
  })(),
  /lock/, 'guard drift aborts');

// Missing baseline for a desired field -> hard error.
await assert.rejects(
  (async () => {
    const entity = makeEntity({ id: 'e5', updated_date: 'v5', status: 'draft' });
    await replaceEstimateFieldsIfUnchanged({
      entity, estimateId: 'e5',
      expectedFields: {},
      nextFields: { status: 'sent' },
      label: 'Test',
    });
  })(),
  /missing the loaded baseline/, 'baseline required');

console.log('PASS estimate CAS persistence (10 cases)');
