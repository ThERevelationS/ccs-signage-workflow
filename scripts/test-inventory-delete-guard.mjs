import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Backlog §16 #392: deleteInventoryRecordIfUnchanged — the nameField value must
// reach deleteEntityIfUnchanged's guardFields so the conditional delete query
// anchors on {name, id, updated_date}, not just the version.

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis.window || { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = globalThis.document || { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = globalThis.window.localStorage;

const stub = resolve(here, '.tmp-inv-delete-stubs.mjs');
writeFileSync(stub, `
globalThis.__deleteCalls = [];
export const base44 = { entities: {}, functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: {} } };
export async function deleteEntityIfUnchanged(payload) { globalThis.__deleteCalls.push(payload); return globalThis.__deleteResponse || { deleted: true }; }
`);

const out = resolve(here, '.tmp-inv-persistence.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/masterInventory/inventoryPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: {
    '@/api/base44Client': stub,
    '@/components/estimator/builder/builderEntityPersistence': stub,
  },
});
const { deleteInventoryRecordIfUnchanged } = await import(pathToFileURL(out).href);

// nameField present on the record -> guardFields carries its value.
{
  globalThis.__deleteCalls.length = 0;
  const entity = {};
  const record = { id: 'i1', item_name: 'Aluminum Sheet 4x8', updated_date: 'v1' };
  await deleteInventoryRecordIfUnchanged({ entity, record, nameField: 'item_name', label: 'Material row' });
  assert.equal(globalThis.__deleteCalls.length, 1, 'delegates to the shared conditional delete');
  const call = globalThis.__deleteCalls[0];
  assert.deepEqual(call.guardFields, { item_name: 'Aluminum Sheet 4x8' }, 'nameField value anchors the delete guard');
  assert.equal(call.entity, entity, 'entity forwarded');
  assert.equal(call.record, record, 'record forwarded');
  assert.equal(call.label, 'Material row', 'label forwarded');
}

// Record missing the nameField -> empty guardFields (id+updated_date still anchor).
{
  globalThis.__deleteCalls.length = 0;
  await deleteInventoryRecordIfUnchanged({
    entity: {},
    record: { id: 'i2', updated_date: 'v2' },
    nameField: 'item_name',
  });
  assert.deepEqual(globalThis.__deleteCalls[0].guardFields, {}, 'missing nameField -> no extra guard');
}

// Blank nameField -> empty guardFields.
{
  globalThis.__deleteCalls.length = 0;
  await deleteInventoryRecordIfUnchanged({
    entity: {},
    record: { id: 'i3', item_name: 'Copper', updated_date: 'v3' },
    nameField: '  ',
  });
  assert.deepEqual(globalThis.__deleteCalls[0].guardFields, {}, 'blank nameField -> no extra guard');
}

// The REAL shared delete now proves the merged query keeps the nameField guard
// alongside the id + updated_date anchors (guards can narrow, never widen).
const out2 = resolve(here, '.tmp-builder-entity-persistence.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/builderEntityPersistence.js')],
  bundle: true, format: 'esm', outfile: out2, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
});
const { deleteEntityIfUnchanged } = await import(pathToFileURL(out2).href);

{
  const queries = [];
  const entity = {
    get: async () => null,
    deleteMany: async (q) => { queries.push(q); return { deleted: 1 }; },
  };
  const res = await deleteEntityIfUnchanged({
    entity,
    record: { id: 'i1', updated_date: 'v1' },
    guardFields: { item_name: 'Aluminum Sheet 4x8' },
    label: 'Material row',
  });
  assert.equal(res.deleted, true);
  assert.deepEqual(queries[0], { item_name: 'Aluminum Sheet 4x8', id: 'i1', updated_date: 'v1' },
    'conditional delete query = guard fields + id + updated_date');
}

// A same-record guard mismatch (row moved/changed since load) -> deleted:0 ->
// record still present -> refuses rather than claiming a delete.
{
  const entity = {
    get: async () => ({ id: 'i1', item_name: 'Renamed', updated_date: 'v2' }),
    deleteMany: async () => ({ deleted: 0 }),
  };
  await assert.rejects(
    deleteEntityIfUnchanged({
      entity,
      record: { id: 'i1', updated_date: 'v1' },
      guardFields: { item_name: 'Aluminum Sheet 4x8' },
      label: 'Material row',
    }),
    /changed in another session/, 'guard-mismatched delete fails closed');
}

rmSync(stub, { force: true });
rmSync(out, { force: true });
rmSync(out2, { force: true });
console.log('PASS inventory delete guard (11 cases)');
process.exit(0);
