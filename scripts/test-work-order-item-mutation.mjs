import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-b44-wo.mjs');
writeFileSync(stub, `
globalThis.__wo = null;
globalThis.__failSave = false;
export const base44 = { entities: { WorkOrder: {
  get: async (id) => globalThis.__wo,
  updateMany: async () => ({ updated: 0 }),
}}, functions: { invoke: async (name, payload) => {
  if (globalThis.__failSave) return { data: { success: false, error: 'conflict' } };
  const r = globalThis.__wo;
  const set = payload?.fields || payload?.next_fields || payload?.nextFields || {};
  Object.assign(r, set); r.updated_date = 'v2';
  return { data: { success: true, record: r } };
}} };
`);
const out = resolve(here, '.tmp-wo-item.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/workflow/workOrderPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub },
  define: { 'import.meta.env': '{}' },
});
globalThis.window = { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, self: null, top: {} };
globalThis.window.self = globalThis.window;
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { mutateLocatedWorkOrderArrayItem } = await import(pathToFileURL(out).href);
const stubMod = await import(pathToFileURL(stub).href);

// Happy path: locate by id, flip a flag, CAS write succeeds.
{
  globalThis.__wo = { id: 'w1', updated_date: 'v1', tasks: [{ id: 't1', completed: false }, { id: 't2', completed: false }] };
  const res = await mutateLocatedWorkOrderArrayItem({
    workOrderId: 'w1', field: 'tasks', item: { id: 't1', completed: false },
    mutateItem: (it) => ({ ...it, completed: true }), label: 'Test task',
  });
  assert.ok(res, 'mutation returned');
  assert.equal(globalThis.__wo.tasks.find((t) => t.id === 't1').completed, true);
}

// Remove path: located item filtered out.
{
  globalThis.__wo = { id: 'w1', updated_date: 'v1', tasks: [{ id: 't1' }, { id: 't2' }] };
  await mutateLocatedWorkOrderArrayItem({ workOrderId: 'w1', field: 'tasks', item: { id: 't2' }, remove: true });
  assert.equal(globalThis.__wo.tasks.length, 1);
}

// Missing item -> locate error propagates (callers must catch).
{
  globalThis.__wo = { id: 'w1', updated_date: 'v1', tasks: [{ id: 't1' }] };
  await assert.rejects(
    mutateLocatedWorkOrderArrayItem({ workOrderId: 'w1', field: 'tasks', item: { id: 'ghost' }, mutateItem: (x) => x }),
    /changed or disappeared/);
}

// Save failure -> propagates (F9: callers lacking catch = silent no-op).
{
  globalThis.__wo = { id: 'w1', updated_date: 'v1', tasks: [{ id: 't1', v: 0 }] };
  globalThis.__failSave = true;
  await assert.rejects(
    mutateLocatedWorkOrderArrayItem({ workOrderId: 'w1', field: 'tasks', item: { id: 't1', v: 0 }, mutateItem: (x) => ({ ...x, v: 1 }) }),
    /conflict|changed|reload|version|attempt|verif|error/i);
  globalThis.__failSave = false;
}

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS work order item mutation (9 cases)');
process.exit(0);
