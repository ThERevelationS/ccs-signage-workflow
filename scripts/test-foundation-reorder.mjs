import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-foundation-reorder.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/foundation/foundationInventoryPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { reorderFoundationItemsSafely } = await import(pathToFileURL(out).href);
rmSync && null;

const row = (id, sort_order, v = 'v1') => ({ id, sort_order, updated_date: v });
const mkEntity = (rows) => ({
  get: async (id) => rows.find((r) => r.id === id) || null,
  updateMany: async (q, set) => {
    const r = rows.find((x) => x.id === q.id && x.updated_date === q.updated_date);
    if (!r) return { updated: 0 };
    Object.assign(r, set.$set); r.updated_date = `v${Math.random()}`;
    return { updated: 1 };
  },
});

// Reorder c->a->b: only changed rows written.
{
  const rows = [row('a', 0), row('b', 1), row('c', 2)];
  const entity = mkEntity(rows);
  const res = await reorderFoundationItemsSafely({
    entity,
    loadedItems: [row('a', 0), row('b', 1), row('c', 2)],
    reorderedItems: [row('c', 2), row('a', 0), row('b', 1)],
    readCurrentItems: async () => rows.map((r) => ({ ...r })),
  });
  assert.equal(rows.find((r) => r.id === 'c').sort_order, 0);
  assert.equal(rows.find((r) => r.id === 'a').sort_order, 1);
  assert.equal(rows.find((r) => r.id === 'b').sort_order, 2);
  assert.ok(res.confirmed >= 1);
}

// Empty reorder -> nothing to do.
{
  const res = await reorderFoundationItemsSafely({
    entity: mkEntity([]), loadedItems: [], reorderedItems: [], readCurrentItems: async () => [],
  });
  assert.equal(res.planned, 0);
}

// Missing init args -> refuses.
await assert.rejects(
  reorderFoundationItemsSafely({ entity: null, loadedItems: [], reorderedItems: [], readCurrentItems: null }),
  /cannot run without|initialize|invalid/i);

console.log('PASS foundation reorder (8 cases)');
