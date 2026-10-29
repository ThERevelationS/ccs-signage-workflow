import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-equipment-persistence.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/masterInventory/equipmentPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { setExclusiveBooleanSafely } = await import(pathToFileURL(out).href);

const mkEntity = (rows) => ({
  get: async (id) => rows.find((r) => r.id === id) || null,
  updateMany: async (q, set) => {
    const row = rows.find((r) => r.id === q.id && r.updated_date === q.updated_date);
    if (!row) return { updated: 0 };
    Object.assign(row, set.$set);
    row.updated_date = `v-${Math.random()}`;
    return { updated: 1 };
  },
});

// Turn on: target set true, other selected rows cleared, verified exclusively.
{
  const rows = [
    { id: 'a', updated_date: 'v1', is_primary: true },
    { id: 'b', updated_date: 'v1', is_primary: false },
    { id: 'c', updated_date: 'v1', is_primary: true },
  ];
  const entity = mkEntity(rows);
  const res = await setExclusiveBooleanSafely({
    entity, targetId: 'b', field: 'is_primary', next: true,
    readRows: async () => rows.map((r) => ({ ...r })), label: 'Primary unit',
  });
  assert.equal(res.target.id, 'b');
  assert.equal(res.target.is_primary, true);
  assert.equal(rows.filter((r) => r.is_primary).length, 1, 'exactly one primary');
  assert.equal(res.confirmedWrites, 3, '1 set + 2 clears');
}

// Turn off: only the target flips; no exclusive verification needed.
{
  const rows = [{ id: 'a', updated_date: 'v1', is_primary: true }];
  const entity = mkEntity(rows);
  const res = await setExclusiveBooleanSafely({
    entity, targetId: 'a', field: 'is_primary', next: false,
    readRows: async () => rows.map((r) => ({ ...r })), label: 'Primary unit',
  });
  assert.equal(res.target.is_primary, false);
  assert.equal(res.confirmedWrites, 1);
}

// Missing target -> refuses.
await assert.rejects(
  setExclusiveBooleanSafely({
    entity: mkEntity([]), targetId: 'ghost', field: 'is_primary', next: true,
    readRows: async () => [], label: 'Primary unit',
  }),
  /no longer exists/);

// Stale target version -> refuses.
await assert.rejects(
  setExclusiveBooleanSafely({
    entity: mkEntity([{ id: 'a', updated_date: 'v-NEW', is_primary: false }]),
    targetId: 'a', field: 'is_primary', next: true,
    expectedTargetUpdatedAt: 'v-OLD',
    readRows: async () => [{ id: 'a', updated_date: 'v-NEW', is_primary: false }], label: 'Primary unit',
  }),
  /changed in another session/);

console.log('PASS exclusive toggle (10 cases)');
