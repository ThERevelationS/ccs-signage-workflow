import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Backlog §16 #391 + #388: createWorkOrderWithRecovery preflight + recovery
// dedupe, and deleteCreatedDuplicateWorkOrderIfUnchanged (the WO delete-with-
// guard-fields + updated_date path — there is no function literally named
// "deleteWorkOrderFieldsIfUnchanged"; this is the WO conditional-delete seam).

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis.window || { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = globalThis.document || { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = globalThis.window.localStorage;

const stub = resolve(here, '.tmp-wo-create-stubs.mjs');
writeFileSync(stub, `
globalThis.__invokeCalls = [];
globalThis.__invokeResult = { status: 'deleted_now' };
globalThis.__invokeError = null;
globalThis.__staffWorkOrder = { get: async () => null, filter: async () => [], updateMany: async () => ({ updated: 0 }), create: async (d) => ({ ...d, id: 'new' }) };
export const base44 = {
  entities: {},
  functions: { invoke: async (fn, body) => { globalThis.__invokeCalls.push({ fn, body }); if (globalThis.__invokeError) throw globalThis.__invokeError; return globalThis.__invokeResult; } },
  auth: { me: async () => null }, asServiceRole: { entities: {} },
};
export const staffEntities = new Proxy({}, { get: (t, p) => p === 'WorkOrder' ? globalThis.__staffWorkOrder : { get: async () => null, filter: async () => [] } });
export async function saveTrackedFields() { return {}; }
export const NotificationTriggers = { workOrderRestored: async () => {}, workOrderFieldsChanged: async () => {} };
`);

const out = resolve(here, '.tmp-wo-create.mjs');
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
const { createWorkOrderWithRecovery } = await import(pathToFileURL(out).href);

const outSync = resolve(here, '.tmp-wo-sync2.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/workOrderSyncPersistence.js')],
  bundle: true, format: 'esm', outfile: outSync, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub },
});
const { deleteCreatedDuplicateWorkOrderIfUnchanged } = await import(pathToFileURL(outSync).href);

const reset = () => { globalThis.__invokeCalls.length = 0; globalThis.__invokeResult = { status: 'deleted_now' }; globalThis.__invokeError = null; };

// ---------- #391: createWorkOrderWithRecovery ----------

// Init guards: no title -> fails before any read; missing entity -> fails.
await assert.rejects(
  createWorkOrderWithRecovery({ data: { title: '   ' }, entity: { filter: async () => [], create: async () => ({}) } }),
  /could not initialize/, 'blank title fails closed');
await assert.rejects(
  createWorkOrderWithRecovery({ data: { title: 'Job' }, entity: {} }),
  /could not initialize/, 'entity without filter/create fails closed');

// Clean create: preflight same-title scan ran first, create landed, get-verified.
{
  const ops = [];
  const entity = {
    filter: async (q, sort, limit, skip) => { ops.push(['filter', skip]); return []; },
    create: async (d) => { ops.push(['create']); return { ...d, id: 'wo-new' }; },
    get: async (id) => { ops.push(['get', id]); return { id: 'wo-new', title: 'Job A' }; },
  };
  const res = await createWorkOrderWithRecovery({ data: { title: 'Job A' }, entity });
  assert.equal(res.status, 'created');
  assert.equal(res.record.id, 'wo-new');
  assert.deepEqual(ops.map((o) => o[0]), ['filter', 'create', 'get'], 'preflight read precedes create, then get-verify');
}

// Preflight same-title cap: count() over the safety ceiling refuses the create.
{
  let created = 0;
  const entity = {
    count: async () => 99999,
    filter: async () => [],
    create: async () => { created += 1; return { id: 'x' }; },
  };
  await assert.rejects(
    createWorkOrderWithRecovery({ data: { title: 'Common' }, entity }),
    /too many same-title/, 'same-title over-cap refuses before creating');
  assert.equal(created, 0, 'no create attempted past the cap');
}

// Lost create response: create threw, but exactly one new matching row exists
// on the recovery read -> recovered, no duplicate created.
{
  let state = [{ id: 'wo-old', title: 'Job A', client_name: 'Acme' }];
  const entity = {
    filter: async () => state.slice(),
    create: async () => { state = [...state, { id: 'wo-new', title: 'Job A', client_name: 'Acme' }]; throw new Error('response lost'); },
  };
  const res = await createWorkOrderWithRecovery({ data: { title: 'Job A', client_name: 'Acme' }, entity });
  assert.equal(res.status, 'recovered', 'single new same-title match adopted');
  assert.equal(res.record.id, 'wo-new');
}

// Ambiguous recovery: two new same-title matches -> refuses to guess.
{
  let state = [];
  const entity = {
    filter: async () => state.slice(),
    create: async () => { state = [{ id: 'w1', title: 'Job' }, { id: 'w2', title: 'Job' }]; throw new Error('response lost'); },
  };
  await assert.rejects(
    createWorkOrderWithRecovery({ data: { title: 'Job' }, entity }),
    /more than once/, 'two new matches is an ambiguous recovery');
}

// Unverifiable: create failed AND nothing new is visible -> original error rethrows.
{
  const entity = {
    filter: async () => [],
    create: async () => { throw new Error('db down'); },
  };
  await assert.rejects(
    createWorkOrderWithRecovery({ data: { title: 'Job' }, entity }),
    /db down/, 'real create error surfaces after empty recovery read');
}

// Dedupe within the recovery scan: the same new row appearing twice on a page
// (newest-first pages shift under concurrent inserts) still counts as ONE
// match — the row is deduped by id before the payload compare.
{
  const dup = { id: 'wo-dup', title: 'Job' };
  let state = [];
  const entity = {
    filter: async () => state.slice(),
    // The new row is created but the response is lost; the recovery page
    // then sees the SAME new row twice (newest-first page overlap).
    create: async () => { state = [dup, { ...dup }]; throw new Error('response lost'); },
  };
  const res = await createWorkOrderWithRecovery({ data: { title: 'Job' }, entity });
  assert.equal(res.status, 'recovered', 'overlapping-page duplicate deduped to one match');
  assert.equal(res.record.id, 'wo-dup');
}

// ---------- #388: deleteCreatedDuplicateWorkOrderIfUnchanged ----------

// Identity anchors: id + expected_updated_date + estimate_id all required.
reset();
await assert.rejects(
  deleteCreatedDuplicateWorkOrderIfUnchanged({ entity: { get: async () => null }, created: { id: 'w1' } }),
  /could not be identified/, 'missing updated_date/estimate_id fails closed');

// Happy path: backend deletes it — the invoke carries all three guard fields.
reset();
{
  const res = await deleteCreatedDuplicateWorkOrderIfUnchanged({
    entity: { get: async () => null },
    created: { id: 'w1', updated_date: 'v1', estimate_id: 'e1' },
    sessionToken: 'tok',
  });
  assert.equal(res.status, 'deleted_now');
  const call = globalThis.__invokeCalls[0];
  assert.equal(call.fn, 'deleteCreatedDuplicateWorkOrder');
  assert.equal(call.body.id, 'w1');
  assert.equal(call.body.expected_updated_date, 'v1', 'updated_date CAS anchor forwarded');
  assert.equal(call.body.estimate_id, 'e1', 'estimate guard forwarded');
  assert.equal(call.body.session_token, 'tok');
}

// Response loss + row gone -> confirmed_absent (converged, not retried blindly).
reset();
globalThis.__invokeError = new Error('network down');
{
  const res = await deleteCreatedDuplicateWorkOrderIfUnchanged({
    entity: { get: async () => null },
    created: { id: 'w1', updated_date: 'v1', estimate_id: 'e1' },
  });
  assert.equal(res.status, 'confirmed_absent', 'absent row after lost response is a safe convergence');
}

// Response loss + row still present -> the error rethrows (delete unverified).
reset();
globalThis.__invokeError = new Error('network down');
await assert.rejects(
  deleteCreatedDuplicateWorkOrderIfUnchanged({
    entity: { get: async () => ({ id: 'w1' }) },
    created: { id: 'w1', updated_date: 'v1', estimate_id: 'e1' },
  }),
  /network down/, 'surviving row after failed delete surfaces the error');

// Function-level error propagates.
reset();
globalThis.__invokeResult = { error: 'record changed' };
await assert.rejects(
  deleteCreatedDuplicateWorkOrderIfUnchanged({
    entity: { get: async () => null },
    created: { id: 'w1', updated_date: 'v1', estimate_id: 'e1' },
  }),
  /record changed/, 'backend error response propagates');

// Unknown status + row present -> refuses to claim a delete that did not happen.
reset();
globalThis.__invokeResult = { status: 'mystery' };
await assert.rejects(
  deleteCreatedDuplicateWorkOrderIfUnchanged({
    entity: { get: async () => ({ id: 'w1' }) },
    created: { id: 'w1', updated_date: 'v1', estimate_id: 'e1' },
  }),
  /left intact for review/, 'unknown result with surviving row fails closed');

rmSync(stub, { force: true });
rmSync(out, { force: true });
rmSync(outSync, { force: true });
console.log('PASS work order create recovery + duplicate delete (16 cases)');
process.exit(0);
