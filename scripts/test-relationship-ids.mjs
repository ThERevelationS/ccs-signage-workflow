import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-b44-rel.mjs');
writeFileSync(stub, `
export const base44 = { entities: {}, functions: { invoke: async () => ({ data: {} }) } };
export const staffEntities = new Proxy({}, { get: () => ({}) });
`);
const out = resolve(here, '.tmp-rel-ids.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/masterInventory/equipmentPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: {
    '@/api/base44Client': stub,
    '@/components/staff/staffEntities': stub,
  },
  define: { 'import.meta.env': '{}' },
});
globalThis.window = { location: { href: 'http://t' }, history: { replaceState() {} }, localStorage: { getItem: () => null } };
globalThis.document = { createElement: () => ({}) };
globalThis.localStorage = window.localStorage;

const { replaceRelationshipIdsIfUnchanged } = await import(pathToFileURL(out).href);

const makeEntity = (row) => ({
  writes: [],
  async get() { return row; },
  async updateMany(query, patch) {
    this.writes.push({ query, patch });
    if (row && row.updated_date === query.updated_date) {
      Object.assign(row, patch.$set || {});
      row.updated_date = 'v2';
      return { updated: 1 };
    }
    return { updated: 0 };
  },
});

// Happy path: id + updated_date + field guard in the CAS query, $set carries the new ids.
{
  const row = { id: 'e1', updated_date: 'v1', equipment_ids: ['x'] };
  const ent = makeEntity(row);
  await replaceRelationshipIdsIfUnchanged({ entity: ent, row, field: 'equipment_ids', nextIds: ['x', 'y'], label: 'test' });
  assert.equal(ent.writes.length, 1, 'one CAS write');
  assert.equal(ent.writes[0].query.id, 'e1');
  assert.equal(ent.writes[0].query.updated_date, 'v1');
  assert.deepEqual(ent.writes[0].patch.$set.equipment_ids, ['x', 'y']);
}

// Concurrent change: another session replaced the ids — the per-field CAS
// guard must throw rather than silently writing over it.
{
  const ent = makeEntity({ id: 'e1', updated_date: 'v2', equipment_ids: ['w'] });
  await assert.rejects(
    () => replaceRelationshipIdsIfUnchanged({ entity: ent, row: { id: 'e1', updated_date: 'v1', equipment_ids: ['x'] }, field: 'equipment_ids', nextIds: ['z'], label: 'test' }),
    /changed|reload/i,
  );
}

// No-op: identical nextIds short-circuit without a write.
{
  const row = { id: 'e1', updated_date: 'v1', equipment_ids: ['x', 'y'] };
  const ent = makeEntity(row);
  const res = await replaceRelationshipIdsIfUnchanged({ entity: ent, row, field: 'equipment_ids', nextIds: ['x', 'y'], label: 'test' });
  assert.equal(ent.writes.length, 0, 'no write for unchanged ids');
  assert.equal(res.id, 'e1');
}

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS test-relationship-ids');
