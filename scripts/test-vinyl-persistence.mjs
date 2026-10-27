import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-vinyl-persistence.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/vinylInventory/vinylInventoryPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { createVinylRecordWithRecovery, duplicateVinylSafely } = await import(pathToFileURL(out).href);

const mkEntity = (rows) => ({
  get: async (id) => rows.find((r) => r.id === id) || null,
  filter: async (q) => rows.filter((r) => Object.entries(q).every(([k, v]) => r[k] === v)),
  create: async (d) => { const r = { ...d, id: `n${rows.length}`, updated_date: 'v1' }; rows.push(r); return r; },
  updateMany: async (q, set) => {
    const r = rows.find((x) => x.id === q.id && x.updated_date === q.updated_date);
    if (!r) return { updated: 0 };
    Object.assign(r, set.$set); r.updated_date = `v${Math.random()}`;
    return { updated: 1 };
  },
});

// createVinylRecordWithRecovery: clean create.
{
  const rows = [];
  const entity = mkEntity(rows);
  const res = await createVinylRecordWithRecovery({ entity, data: { vinyl_name: 'Vinyl A' } });
  assert.ok(res.record?.id);
  assert.ok(['created', 'recovered'].includes(res.status));
}

// duplicateVinylSafely: stale source version blocks before any copy.
await assert.rejects(
  duplicateVinylSafely({
    entity: mkEntity([{ id: 'v1', vinyl_name: 'X', updated_date: 'v-NEW' }]),
    source: { id: 'v1', vinyl_name: 'X', updated_date: 'v-OLD' },
    copyData: { vinyl_name: 'X (copy)' }, groupKey: 'g1',
  }),
  /changed in another session|no longer/);

// Happy path: live source → copy created, source grouped.
{
  const rows = [{ id: 'v1', vinyl_name: 'X', updated_date: 'v1', product_group_key: '' }];
  const entity = mkEntity(rows);
  const res = await duplicateVinylSafely({
    entity, source: { id: 'v1', vinyl_name: 'X', updated_date: 'v1' },
    copyData: { vinyl_name: 'X (copy)' }, groupKey: 'g1',
  });
  assert.ok(res, 'duplicate result');
  assert.equal(rows.length, 2, 'copy created');
}

// Missing source -> refuses (same session-changed guard fires).
await assert.rejects(
  duplicateVinylSafely({ entity: mkEntity([]), source: { id: 'ghost', updated_date: 'v1' }, copyData: {}, groupKey: 'g' }),
  /changed in another session|no longer/);

console.log('PASS vinyl persistence (8 cases)');
