import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-priority-reorder.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/workflow/workOrderPriorityPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { reorderWorkOrdersFromLoadedSnapshot } = await import(pathToFileURL(out).href);

const row = (id, priority, v = 'v1') => ({ id, priority, updated_date: v });
const mkEntity = (rows) => ({
  get: async (id) => rows.find((r) => r.id === id) || null,
  updateMany: async (q, set) => {
    const r = rows.find((x) => x.id === q.id && x.updated_date === q.updated_date);
    if (!r) return { updated: 0 };
    Object.assign(r, set.$set);
    return { updated: 1 };
  },
});

// Reorder a->c->b: only rows whose persisted priority changes are written.
{
  const rows = [row('a', 0), row('b', 1), row('c', 2)];
  const entity = mkEntity(rows);
  const res = await reorderWorkOrdersFromLoadedSnapshot({
    entity,
    loadedItems: [row('a', 0), row('b', 1), row('c', 2)],
    reorderedItems: [row('c', 2), row('a', 0), row('b', 1)],
    readCurrentItems: async () => rows.map((r) => ({ ...r })),
  });
  assert.equal(rows.find((r) => r.id === 'c').priority, 0, 'c moved to top');
  assert.equal(rows.find((r) => r.id === 'a').priority, 1);
  assert.equal(rows.find((r) => r.id === 'b').priority, 2);
  assert.ok(res, 'result returned');
}

// Reordered cohort missing a loaded row -> refuses before any write.
await assert.rejects(
  (async () => {
    let writes = 0;
    const rows = [row('a', 0), row('b', 1)];
    const entity = { get: async (id) => rows.find((r) => r.id === id), updateMany: async () => { writes += 1; return { updated: 1 }; } };
    await reorderWorkOrdersFromLoadedSnapshot({
      entity,
      loadedItems: [row('a', 0), row('b', 1)],
      reorderedItems: [row('b', 1)],
      readCurrentItems: async () => rows.map((r) => ({ ...r })),
    });
    assert.equal(writes, 0, 'no writes on cohort mismatch');
  })(),
  /incomplete|cohort|match|reorder/i);

// Current server state drifted (newer version) -> refuses before any write.
await assert.rejects(
  (async () => {
    let writes = 0;
    const rows = [row('a', 0), row('b', 1)];
    const entity = { get: async (id) => rows.find((r) => r.id === id), updateMany: async () => { writes += 1; return { updated: 1 }; } };
    await reorderWorkOrdersFromLoadedSnapshot({
      entity,
      loadedItems: [row('a', 0), row('b', 1)],
      reorderedItems: [row('b', 1), row('a', 0)],
      readCurrentItems: async () => [row('a', 0, 'v-NEW'), row('b', 1)],
    });
    assert.equal(writes, 0, 'no writes on version drift');
  })(),
  /changed|version|reload|cohort|incomplete|concurrent/i);

// New row appeared server-side (cohort grew) -> refuses.
await assert.rejects(
  (async () => {
    const rows = [row('a', 0), row('b', 1)];
    const entity = { get: async (id) => rows.find((r) => r.id === id), updateMany: async () => ({ updated: 1 }) };
    await reorderWorkOrdersFromLoadedSnapshot({
      entity,
      loadedItems: [row('a', 0), row('b', 1)],
      reorderedItems: [row('b', 1), row('a', 0)],
      readCurrentItems: async () => [row('a', 0), row('b', 1), row('z', 2)],
    });
  })(),
  /cohort|new|missing|match|reload|change|incomplete/i);

console.log('PASS priority reorder (9 cases)');
