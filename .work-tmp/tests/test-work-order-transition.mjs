import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Backlog §16 #377 + #387: transitionWorkOrderFromLoadedSnapshot full path
// (CAS via saveTrackedFields + stage transition + permit guard + reopen
// normalization) and expectedWorkOrderFields/replaceWorkOrderFieldsIfUnchanged.
// The real trackedFieldPersistence is stubbed with a spy so the CAS payload
// (expected/next/guard fields) is asserted without invoking fieldHistoryAction.

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis.window || { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = globalThis.document || { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = globalThis.window.localStorage;

const stub = resolve(here, '.tmp-wo-transition-stubs.mjs');
writeFileSync(stub, `
globalThis.__permitRows = [];
globalThis.__saveCalls = [];
globalThis.__saveError = null;
globalThis.__saveResponse = { id: 'wo1', current_stage: 'design' };
export const base44 = { entities: {}, functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: {} } };
export const staffEntities = {
  WorkOrder: { get: async () => null, filter: async () => [], updateMany: async () => ({ updated: 0 }), create: async (d) => ({ ...d, id: 'new' }) },
  PermitLineItem: { filter: async (q) => (globalThis.__permitRows || []).filter((r) => !q?.work_order_id || r.work_order_id === q.work_order_id) },
};
export async function saveTrackedFields(payload) {
  globalThis.__saveCalls.push(payload);
  if (globalThis.__saveError) throw globalThis.__saveError;
  return globalThis.__saveResponse;
}
export const NotificationTriggers = { workOrderRestored: async () => {}, workOrderFieldsChanged: async () => {} };
`);

const out = resolve(here, '.tmp-wo-transition.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/workflow/workOrderPersistence.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: {
    '@/api/base44Client': stub,
    '@/components/staff/staffEntities': stub,
    '@/components/shared/trackedFieldPersistence': stub,
    '@/components/workflow/NotificationService': stub,
  },
});
const { transitionWorkOrderFromLoadedSnapshot, replaceWorkOrderFieldsIfUnchanged } = await import(pathToFileURL(out).href);

const outSync = resolve(here, '.tmp-wo-sync-persistence.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/workOrderSyncPersistence.js')],
  bundle: true, format: 'esm', outfile: outSync, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub },
});
const { expectedWorkOrderFields } = await import(pathToFileURL(outSync).href);

const calls = globalThis.__saveCalls;
const reset = () => { calls.length = 0; globalThis.__permitRows = []; globalThis.__saveError = null; globalThis.__saveResponse = { id: 'wo1', current_stage: 'design' }; };

// ---------- #377: transitionWorkOrderFromLoadedSnapshot ----------

// Forward move that crosses Permitting but has no open permits: the guard
// runs, finds nothing blocking, and one CAS save carries the stage.
reset();
const wo = { id: 'wo1', current_stage: 'estimating', completed: false, updated_date: 'v1' };
globalThis.__saveResponse = { id: 'wo1', current_stage: 'design' };
const moved = await transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage: 'design' });
assert.equal(moved.current_stage, 'design', 'transition returns saved record');
assert.equal(calls.length, 1, 'one CAS save issued');
assert.equal(calls[0].entityType, 'WorkOrder');
assert.equal(calls[0].id, 'wo1');
assert.deepEqual(calls[0].expectedFields, { current_stage: 'estimating' }, 'CAS baseline is the loaded stage');
assert.deepEqual(calls[0].nextFields, { current_stage: 'design' }, 'next fields carry the destination stage');

// Cross-Permitting jump with an open permit line is blocked before any save.
reset();
globalThis.__permitRows = [{ id: 'p1', work_order_id: 'wo1', status: 'active' }];
await assert.rejects(
  transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage: 'production' }),
  /cannot skip the Permitting stage/, 'open permit blocks the skip');
assert.equal(calls.length, 0, 'no save attempted when permit guard trips');

// allowPermitSkip is the sanctioned bypass; non-open permit rows never block.
reset();
globalThis.__permitRows = [{ id: 'p2', work_order_id: 'wo1', status: 'received' }];
await transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage: 'production', allowPermitSkip: true });
assert.equal(calls.length, 1, 'allowPermitSkip proceeds');
reset();
globalThis.__permitRows = [{ id: 'p3', work_order_id: 'wo1', status: 'active' }];
await transitionWorkOrderFromLoadedSnapshot({
  workOrder: { ...wo, current_stage: 'production' }, newStage: 'fabrication' });
assert.equal(calls.length, 1, 'non-crossing move saved despite open permit');

// Reopen: a completed WO moved to a live stage clears `completed` through CAS.
reset();
const doneWo = { id: 'wo1', current_stage: 'completed', completed: true, updated_date: 'v1' };
await transitionWorkOrderFromLoadedSnapshot({ workOrder: doneWo, newStage: 'production' });
assert.deepEqual(calls[0].nextFields, { current_stage: 'production', completed: false }, 'reopen clears the completed flag');
assert.equal(calls[0].expectedFields.completed, true, 'completed baseline anchored on loaded row');

// Explicit completed arg wins over the implicit reopen logic.
reset();
await transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage: 'completed', completed: true });
assert.deepEqual(calls[0].nextFields, { current_stage: 'completed', completed: true }, 'explicit completed passed through');

// Legacy string notes normalize into the notes array on the same CAS write.
reset();
const notedWo = { id: 'wo1', current_stage: 'estimating', completed: false, notes: 'legacy note text', created_date: '2026-01-01T00:00:00Z', created_by: 'Tester', updated_date: 'v1' };
await transitionWorkOrderFromLoadedSnapshot({ workOrder: notedWo, newStage: 'design', normalizeLegacyNotes: true });
assert.equal(calls[0].expectedFields.notes, 'legacy note text', 'notes baseline anchored');
assert.equal(calls[0].nextFields.notes[0].text, 'legacy note text', 'string notes converted to array form');
assert.equal(calls[0].nextFields.notes[0].created_by, 'Tester');
reset();
await transitionWorkOrderFromLoadedSnapshot({ workOrder: notedWo, newStage: 'design' });
assert.equal(calls[0].nextFields.notes, undefined, 'normalize flag off leaves notes untouched');

// A CAS failure (another session moved it) propagates instead of being swallowed.
reset();
globalThis.__saveError = new Error('changed in another session');
await assert.rejects(
  transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage: 'design' }),
  /changed in another session/, 'CAS conflict surfaces to the caller');

// ---------- #387: replaceWorkOrderFieldsIfUnchanged + expectedWorkOrderFields ----------

// replaceWorkOrderFieldsIfUnchanged is the WorkOrder CAS gateway: it forwards
// the exact expected/next/guard payload to fieldHistoryAction via
// saveTrackedFields and returns the verified record.
reset();
globalThis.__saveResponse = { id: 'wo1', title: 'Saved' };
const saved = await replaceWorkOrderFieldsIfUnchanged({
  workOrderId: 'wo1',
  expectedFields: { title: 'Old' },
  nextFields: { title: 'Saved' },
  guardFields: { updated_date: 'v1' },
});
assert.equal(saved.title, 'Saved');
assert.equal(calls.length, 1);
assert.equal(calls[0].entityType, 'WorkOrder');
assert.equal(calls[0].id, 'wo1');
assert.deepEqual(calls[0].expectedFields, { title: 'Old' });
assert.deepEqual(calls[0].nextFields, { title: 'Saved' });
assert.deepEqual(calls[0].guardFields, { updated_date: 'v1' }, 'guard fields forwarded');

reset();
globalThis.__saveError = new Error('save rejected');
await assert.rejects(
  replaceWorkOrderFieldsIfUnchanged({ workOrderId: 'wo1', expectedFields: { a: 1 }, nextFields: { a: 2 } }),
  /save rejected/, 'gateway errors propagate');

// expectedWorkOrderFields baselines only the desired fields, plus the durable
// work_order_number identity anchor when the loaded row carries one.
assert.deepEqual(
  expectedWorkOrderFields({ title: 'A', client_name: 'B' }, { title: 'Z' }),
  { title: 'A' }, 'baseline snapshots only desired fields');
assert.deepEqual(
  expectedWorkOrderFields({ id: 'wo1', work_order_number: 42, title: 'A' }, { title: 'Z' }),
  { title: 'A', work_order_number: 42 }, 'work_order_number anchor carried');
assert.deepEqual(
  expectedWorkOrderFields({ id: 'wo1' }, {}),
  {}, 'no desired fields and no number -> empty baseline');

rmSync(stub, { force: true });
rmSync(out, { force: true });
rmSync(outSync, { force: true });
console.log('PASS work order transition + field CAS (23 cases)');
process.exit(0);
