import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-base44-part.mjs');
writeFileSync(stub, `
globalThis.__partRows = [];
export const base44 = { entities: { BuilderPart: {
  filter: async (q) => (globalThis.__partRows || []).filter((r) => Object.entries(q).every(([k, v]) => r[k] === v)),
  create: async (d) => { const r = { ...d, id: 'p' + (globalThis.__partRows || []).length, updated_date: 'v1' }; globalThis.__partRows.push(r); return r; },
  get: async (id) => (globalThis.__partRows || []).find((r) => r.id === id) || null,
  updateMany: async () => ({ updated: 0 }),
}}, functions: { invoke: async () => ({}) } };
export function __setRows(rows) { globalThis.__partRows = rows; }
`);
const out = resolve(here, '.tmp-builder-part.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/itemIdentity.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const { newBuilderItemId, seedBuilderItemIds, builderItemToken } = await import(pathToFileURL(out).href);

const out2 = resolve(here, '.tmp-builder-part2.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/builderPartPersistence.js')],
  bundle: true, format: 'esm', outfile: out2, logLevel: 'silent',
  alias: { '@/api/base44Client': stub },
});
const { createBuilderPartWithRecovery } = await import(pathToFileURL(out2).href);
const stubMod = await import(pathToFileURL(stub).href);

// itemIdentity
const id = newBuilderItemId('part');
assert.match(id, /^part-/, 'prefix applied');
const seeded = seedBuilderItemIds([{ a: 1 }, { a: 2 }]);
assert.equal(seeded[0].builder_item_id, '0', 'legacy index adopted');
assert.equal(seeded[1].builder_item_id, '1');
assert.equal(builderItemToken({ builder_item_id: 'x' }, 0), 'x');
assert.equal(builderItemToken({ a: 1 }, 5), '5', 'missing id -> index fallback');

// createBuilderPartWithRecovery: clean create.
stubMod.__setRows([]);
const entity = {
  filter: async (q) => (globalThis.__partRows || []).filter((r) => r.builder_product_id === q.builder_product_id && r.part_key === q.part_key),
  create: async (d) => { const r = { ...d, id: 'p0', updated_date: 'v1' }; globalThis.__partRows.push(r); return r; },
};
const res = await createBuilderPartWithRecovery({ entity, data: { builder_product_id: 'bp1', part_key: 'k1' } });
assert.ok(res.record?.id);
assert.ok(['created', 'recovered'].includes(res.status));

// Validation: missing identity -> init error.
await assert.rejects(
  createBuilderPartWithRecovery({ entity, data: { builder_product_id: '', part_key: '' } }),
  /could not initialize/);

rmSync(stub, { force: true });
rmSync(out, { force: true });
rmSync(out2, { force: true });
console.log('PASS builder part identity + persistence (9 cases)');
