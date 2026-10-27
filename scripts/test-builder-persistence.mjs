import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-builder-persistence.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/builder/builderEntityPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { expectedBuilderEntityFields, replaceBuilderEntityFieldsIfUnchanged, deleteBuilderEntityIfUnchanged } =
  await import(pathToFileURL(out).href);

assert.deepEqual(
  expectedBuilderEntityFields({ a: 1, b: 2, c: 3 }, { b: 9 }),
  { b: 2 }, 'baseline snapshots only desired fields');

// CAS update: stale version anchor aborts.
await assert.rejects(
  (async () => {
    const entity = {
      get: async () => ({ id: 'r1', updated_date: 'v-NEW', status: 'x' }),
      updateMany: async () => ({ updated: 0 }),
    };
    await replaceBuilderEntityFieldsIfUnchanged({
      entity, id: 'r1', expectedUpdatedAt: 'v-OLD',
      expectedFields: { status: 'x' }, nextFields: { status: 'y' }, label: 'Test',
    });
  })(),
  (e) => /changed|version|reload/i.test(e.message), 'stale version anchor aborts');

// CAS delete: record must match guard fields or nothing is removed.
{
  let deletes = 0;
  const rec = { id: 'd1', updated_date: 'v1', creation_request_key: 'k', status: 'draft' };
  const entity = {
    get: async () => ({ ...rec }),
    deleteMany: async () => { deletes += 1; rec.id = null; return { deleted: 1 }; },
  };
  await deleteBuilderEntityIfUnchanged({
    entity, record: { ...rec },
    guardFields: { creation_request_key: 'k' }, label: 'Test',
  });
  assert.equal(deletes, 1, 'guarded delete landed');
}
await assert.rejects(
  (async () => {
    // Record drifted since load: deleteMany matches nothing, re-read shows it still there.
    const rec = { id: 'd2', updated_date: 'v2', creation_request_key: 'other' };
    const entity = { get: async () => ({ ...rec }), deleteMany: async () => ({ deleted: 0 }) };
    await deleteBuilderEntityIfUnchanged({
      entity, record: { id: 'd2', updated_date: 'v1', creation_request_key: 'k' },
      guardFields: { creation_request_key: 'k' }, label: 'Test',
    });
  })(),
  /changed in another session/, 'drifted record blocks delete');

// Zero-match + already-gone record converges as alreadyDeleted (safe retry).
{
  const entity = { get: async () => null, deleteMany: async () => ({ deleted: 0 }) };
  const result = await deleteBuilderEntityIfUnchanged({
    entity, record: { id: 'd3', updated_date: 'v1' }, label: 'Test',
  });
  assert.deepEqual(result, { deleted: true, alreadyDeleted: true }, 'already-gone converges');
}

console.log('PASS builder persistence (8 cases)');
