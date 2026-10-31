import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (name, dir = 'masterInventory') => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, `../src/components/${dir}/${name}.js`)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' }, });
  return pathToFileURL(out).href;
};
const { sameImportedValue, importedPayloadMatches, createImportedInventoryRowSafely } =
  await import(bundle('inventoryImportPersistence'));
const { createInventoryRecordWithRecovery } = await import(bundle('inventoryPersistence'));

// sameImportedValue: numerics compare as numbers, empties equal.
assert.equal(sameImportedValue(5, '5'), true);
assert.equal(sameImportedValue('', undefined), true);
assert.equal(sameImportedValue('a', 'b'), false);
assert.equal(importedPayloadMatches({ a: 1 }, { a: 1, b: 2 }), false, 'extra payload key must match record');

// createImportedInventoryRowSafely: existing name (matched at DB level by payload
// value, then case-normalized by cleanName) -> reused canonical.
{
  const store = [{ item_name: 'Vinyl A', id: 'old', created_date: '2026-01-01' }];
  const entity = { filter: async (q) => store.filter((r) => r.item_name === q.item_name), create: async () => ({ id: 'new' }) };
  const res = await createImportedInventoryRowSafely({ entity, payload: { item_name: 'Vinyl A' }, nameField: 'item_name', name: 'vinyl a' });
  assert.equal(res.status, 'existing');
  assert.equal(res.record.id, 'old');
}

// Different-case payload misses the DB filter entirely -> would create (not dedupe).
{
  const store = [{ item_name: 'Vinyl A', id: 'old' }];
  const entity = {
    filter: async (q) => store.filter((r) => r.item_name === q.item_name),
    create: async (d) => { const r = { ...d, id: 'i-new' }; store.push(r); return r; },
  };
  const res = await createImportedInventoryRowSafely({ entity, payload: { item_name: 'vinyl a' }, nameField: 'item_name', name: 'vinyl a' });
  assert.equal(res.status, 'created', 'case-differing payload creates (DB filter is case-sensitive)');
}

// No match -> created.
{
  const store = [];
  const entity = {
    filter: async () => store.slice(),
    create: async (d) => { const r = { ...d, id: 'i1' }; store.push(r); return r; },
  };
  const res = await createImportedInventoryRowSafely({ entity, payload: { item_name: 'Vinyl B' }, nameField: 'item_name' });
  assert.equal(res.status, 'created');
  assert.equal(res.record.id, 'i1');
}

// createInventoryRecordWithRecovery: recovery only counts NEW rows — a pre-existing
// name match does NOT dedupe, so a lost create rethrows (no false recovery).
await assert.rejects(
  (async () => {
    const store = [{ item_name: 'Part X', id: 'px' }];
    const entity = { filter: async (q) => store.filter((r) => r.item_name === q.item_name), create: async () => { throw new Error('nope'); } };
    await createInventoryRecordWithRecovery({ entity, data: { item_name: 'Part X' }, nameField: 'item_name' });
  })(),
  /nope/, 'pre-existing row never counts as recovery');

// Validation.
await assert.rejects(
  createImportedInventoryRowSafely({ entity: { filter: async () => [], create: async () => ({}) }, payload: {}, nameField: '', label: 'T' }),
  /could not initialize/);
await assert.rejects(
  createInventoryRecordWithRecovery({ entity: { filter: async () => [], create: async () => ({}) }, data: {}, nameField: '', label: 'T' }),
  /could not initialize/);

console.log('PASS inventory persistence (12 cases)');
