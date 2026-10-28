import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-equipment-persistence.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/masterInventory/equipmentPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const { replaceRelationshipIdsIfUnchanged } = await import(pathToFileURL(out).href);
rmSync(out, { force: true });

const stubEntity = (row, tracker = { updates: [] }) => {
  let state = { ...row };
  return {
    get: async (id) => (id === state.id ? { ...state } : null),
    updateMany: async (filter, patch) => { tracker.updates.push({ filter, patch }); state = { ...state, ...(patch.$set || patch) }; return { updated: 1 }; },
  };
};

// Validation guards.
await assert.rejects(
  replaceRelationshipIdsIfUnchanged({ entity: stubEntity({}), row: null, field: 'attachment_ids', nextIds: ['a'] }),
  /could not initialize/,
  'missing row rejected',
);
await assert.rejects(
  replaceRelationshipIdsIfUnchanged({ entity: stubEntity({ id: 'r1' }), row: { id: 'r1' }, field: '', nextIds: ['a'] }),
  /could not initialize/,
  'missing field rejected',
);
await assert.rejects(
  replaceRelationshipIdsIfUnchanged({ entity: stubEntity({ id: 'r1' }), row: { id: 'r1' }, field: 'attachment_ids', nextIds: 'a' }),
  /could not initialize/,
  'non-array nextIds rejected',
);

// Happy path: unchanged baseline writes the relationship patch via updateMany.
{
  const tracker = { updates: [] };
  const entity = stubEntity({ id: 'r1', attachment_ids: ['x'], updated_date: 't1' }, tracker);
  const result = await replaceRelationshipIdsIfUnchanged({
    entity,
    row: { id: 'r1', attachment_ids: ['x'], updated_date: 't1' },
    field: 'attachment_ids',
    nextIds: ['x', 'y'],
    label: 'Test relationship',
  });
  assert.equal(result?.attachment_ids?.length, 2, 'saved row carries the new id list');
  assert.equal(tracker.updates.length, 1, 'one updateMany call');
  assert.deepEqual(tracker.updates[0].patch, { $set: { attachment_ids: ['x', 'y'] } }, 'patch carries the new id list');
}

// Stale baseline: live row changed since load → refuses to write.
{
  const tracker = { updates: [] };
  const entity = stubEntity({ id: 'r1', attachment_ids: ['x', 'other-session-added'], updated_date: 't2' }, tracker);
  await assert.rejects(
    replaceRelationshipIdsIfUnchanged({
      entity,
      row: { id: 'r1', attachment_ids: ['x'], updated_date: 't1' },
      field: 'attachment_ids',
      nextIds: ['x', 'y'],
      label: 'Test relationship',
    }),
    /another session|changed|stale/i,
    'stale baseline rejected before write',
  );
  assert.equal(tracker.updates.length, 0, 'no update attempted on stale read');
}

console.log('PASS equipment relationship persistence (5 cases)');
process.exit(0);
