import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Backlog §16 #382: customerSync.syncEstimateToPipeline with stub entities —
// create path, CAS update path (fieldHistoryAction save gateway + the
// estimate sales_stage CAS stamp), and created-duplicate convergence.
// NOTE: esbuild inlines the stub module into the bundle — per-test behavior is
// driven through globalThis hooks, never by mutating a re-imported copy.

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis.window || { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = globalThis.document || { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = globalThis.window.localStorage;

const stub = resolve(here, '.tmp-pipeline-stubs.mjs');
writeFileSync(stub, `
globalThis.__woRows = [];
globalThis.__woFilterHook = null; // (query) => rows — overrides WorkOrder.filter per-case
globalThis.__woCreateHook = null; // (data) => row|throw — overrides WorkOrder.create per-case
globalThis.__permitCreates = [];
globalThis.__invokeCalls = [];
globalThis.__fieldHistoryError = null;
globalThis.__estRow = null;       // the "stored" estimate row the sales_stage stamp lands on
const matches = (row, q) => Object.entries(q || {}).every(([k, v]) => row?.[k] === v);
export const base44 = {
  entities: {},
  functions: {
    invoke: async (fn, body) => {
      globalThis.__invokeCalls.push({ fn, body });
      if (fn === 'fieldHistoryAction') {
        if (globalThis.__fieldHistoryError) throw globalThis.__fieldHistoryError;
        // Echo next_fields back as the saved record — satisfies the
        // sales-save acknowledgment verifier (id + every desired field).
        return { data: { success: true, record: { id: body.entity_id, ...(body.next_fields || {}) } } };
      }
      if (fn === 'deleteCreatedDuplicateWorkOrder') return { data: { status: 'deleted_now' } };
      return { data: {} };
    },
  },
  auth: { me: async () => null },
  asServiceRole: { entities: {} },
};
export const staffEntities = {
  WorkOrder: {
    filter: async (q, ...rest) => globalThis.__woFilterHook
      ? globalThis.__woFilterHook(q, ...rest)
      : (globalThis.__woRows || []).filter((r) => matches(r, q)),
    list: async () => (globalThis.__woRows || []).slice(),
    get: async (id) => (globalThis.__woRows || []).find((r) => r.id === id) || null,
    create: async (d) => {
      if (globalThis.__woCreateHook) return globalThis.__woCreateHook(d);
      const row = { ...d, id: 'wo-created-' + ((globalThis.__woRows || []).length + 1), created_date: '2026-02-01T00:00:00Z', updated_date: 'v-new' };
      globalThis.__woRows = [...(globalThis.__woRows || []), row];
      return row;
    },
  },
  PermitLineItem: {
    filter: async () => [],
    create: async (d) => { globalThis.__permitCreates.push(d); return { ...d, id: 'pl-1' }; },
  },
  AllInOneEstimate: {
    get: async (id) => (globalThis.__estRow?.id === id ? { ...globalThis.__estRow } : null),
    updateMany: async (q, patch) => {
      const row = globalThis.__estRow;
      if (!row || row.id !== q?.id || (q.updated_date && row.updated_date !== q.updated_date)) return { updated: 0 };
      globalThis.__estRow = { ...row, ...(patch?.$set || {}), updated_date: 'v-next' };
      return { updated: 1 };
    },
  },
  Customer: { list: async () => [], get: async () => null },
};
export const fetchAllWorkOrders = async () => (globalThis.__woRows || []).slice();
export const NotificationTriggers = { workOrderFieldsChanged: async () => {}, workOrderRestored: async () => {} };
`);

const out = resolve(here, '.tmp-customerSync-pipeline.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerSync.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: {
    '@/api/base44Client': stub,
    '@/components/staff/staffEntities': stub,
    '@/lib/workOrderCache': stub,
    '@/components/workflow/NotificationService': stub,
  },
});
const { syncEstimateToPipeline } = await import(pathToFileURL(out).href);

const reset = (est = null) => {
  globalThis.__woRows = [];
  globalThis.__woFilterHook = null;
  globalThis.__woCreateHook = null;
  globalThis.__permitCreates = [];
  globalThis.__invokeCalls = [];
  globalThis.__fieldHistoryError = null;
  globalThis.__estRow = est;
};

const estimate = (over = {}) => ({
  id: 'e1',
  project_name: 'Monument Sign',
  client_name: 'Acme Corp',
  status: 'draft',
  quote_total: 1200,
  site_address: '100 Main St, Cincinnati, OH',
  line_items: [],
  updated_date: 'v1',
  ...over,
});

// ---------- Create path: no linked WO -> one create, estimate-linked. ----------
reset(estimate());
{
  const wo = await syncEstimateToPipeline(estimate());
  assert.equal(wo.estimate_id, 'e1', 'new WO linked to the estimate');
  assert.equal(wo.title, 'Monument Sign');
  assert.equal(wo.client_name, 'Acme Corp');
  assert.equal(wo.current_stage, 'estimating', 'non-approved estimate lands in estimating');
  assert.equal(wo.in_pipeline, true);
  assert.equal(wo.sales_status, 'lead', 'draft estimate maps to lead');
  // Site address seeds one open PermitLineItem on brand-new jobs.
  assert.equal(globalThis.__permitCreates.length, 1, 'site permit auto-seeded');
  assert.equal(globalThis.__permitCreates[0].work_order_id, wo.id);
  assert.equal(globalThis.__permitCreates[0].locality_name, 'Cincinnati', 'site city parsed into the permit row');
  // Estimate sales_stage mirror stamp landed through the estimate CAS gateway.
  assert.equal(globalThis.__estRow.sales_stage, 'lead', 'estimate sales_stage stamped to match the WO');
}

// ---------- Create path: approved estimate lands in production. ----------
reset(estimate({ status: 'approved' }));
{
  const wo = await syncEstimateToPipeline(estimate({ status: 'approved' }));
  assert.equal(wo.current_stage, 'production', 'approved estimate converts to production');
  assert.equal(wo.sales_status, 'won');
}

// ---------- CAS update path: existing linked WO -> fieldHistoryAction save. ----------
reset(estimate());
{
  const existing = { id: 'wo-9', estimate_id: 'e1', title: 'Old Title', current_stage: 'estimating', sales_status: 'lead', updated_date: 'v9', created_date: '2026-01-01T00:00:00Z' };
  globalThis.__woRows = [existing];
  const wo = await syncEstimateToPipeline(estimate());
  const saveCalls = globalThis.__invokeCalls.filter((c) => c.fn === 'fieldHistoryAction');
  assert.equal(saveCalls.length, 1, 'existing row updated through the CAS save gateway');
  assert.equal(saveCalls[0].body.entity_type, 'WorkOrder');
  assert.equal(saveCalls[0].body.entity_id, 'wo-9');
  assert.equal(saveCalls[0].body.expected_fields.title, 'Old Title', 'CAS baseline is the loaded title');
  assert.equal(saveCalls[0].body.next_fields.title, 'Monument Sign', 'estimate project name wins');
  assert.equal(saveCalls[0].body.next_fields.estimate_id, 'e1');
  assert.equal(wo.title, 'Monument Sign');
  assert.equal(globalThis.__permitCreates.length, 0, 'permit auto-seed only runs on create');
}

// ---------- estimate_revision_required: amount changed on a real estimate. ----------
reset(estimate());
{
  const existing = { id: 'wo-9', estimate_id: 'e1', estimate_amount: 500, current_stage: 'production', sales_status: 'quoted', updated_date: 'v9', created_date: '2026-01-01T00:00:00Z' };
  globalThis.__woRows = [existing];
  await syncEstimateToPipeline(estimate());
  const call = globalThis.__invokeCalls.find((c) => c.fn === 'fieldHistoryAction');
  assert.equal(call.body.next_fields.estimate_revision_required, true, 'amount drift flags re-review');
}

// ---------- CAS stamp conflict: a moved estimate leaves sales_stage alone. ----------
reset(estimate());
{
  // The stored estimate row moved to v2 while this sync's loaded copy is still
  // v1 — the guard-field compare fails and the stamp is skipped, never forced.
  globalThis.__estRow = { ...estimate(), updated_date: 'v2' };
  const existing = { id: 'wo-9', estimate_id: 'e1', title: 'T', current_stage: 'estimating', sales_status: 'lead', updated_date: 'v9', created_date: '2026-01-01T00:00:00Z' };
  globalThis.__woRows = [existing];
  await syncEstimateToPipeline(estimate());
  assert.equal(globalThis.__estRow.sales_stage, undefined, 'moved estimate keeps its version; stamp skipped not forced');
}

// ---------- Trash guard: only deleted linked rows -> refuse to resurrect. ----------
reset(estimate());
{
  globalThis.__woRows = [{ id: 'wo-dead', estimate_id: 'e1', deleted: true }];
  await assert.rejects(
    syncEstimateToPipeline(estimate()),
    /in Trash/, 'trashed linked WO refuses the sync');
}

// ---------- Converge path: a concurrent session linked the same estimate. ----------
reset(estimate());
{
  // Sequence: this sync's estimate_id scan sees nothing, the create preflight
  // sees nothing, our create lands — and by the time converge re-reads, a
  // concurrent session's older row is estimate-linked too. The older row wins
  // canonicalEstimateWorkOrder's earliest-created sort, so our just-created
  // row is the losing duplicate: deleted via the backend guard while linkage
  // fields converge onto the canonical row.
  const older = { id: 'wo-old', estimate_id: 'e1', title: 'Canonical', current_stage: 'estimating', updated_date: 'v-old', created_date: '2025-12-01T00:00:00Z' };
  let filterCalls = 0;
  const concurrent = [];
  globalThis.__woFilterHook = async (q) => {
    filterCalls += 1;
    if (filterCalls <= 2) return []; // sync pre-scan + create preflight
    const pool = [...concurrent, older];
    return pool.filter((r) => Object.entries(q || {}).every(([k, v]) => r[k] === v));
  };
  globalThis.__woCreateHook = async (d) => {
    const row = { ...d, id: 'wo-newer', created_date: '2026-02-01T00:00:00Z', updated_date: 'v-new' };
    concurrent.push(row); // our row becomes visible on the convergence re-read
    return row;
  };
  const wo = await syncEstimateToPipeline(estimate(), null, { sessionToken: 'sess' });
  assert.equal(wo.id, 'wo-old', 'canonical (earliest-created) row wins');
  const delCall = globalThis.__invokeCalls.find((c) => c.fn === 'deleteCreatedDuplicateWorkOrder');
  assert.ok(delCall, 'losing duplicate deleted through the backend guard');
  assert.equal(delCall.body.id, 'wo-newer');
  assert.equal(delCall.body.expected_updated_date, 'v-new');
  assert.equal(delCall.body.estimate_id, 'e1');
  assert.equal(delCall.body.session_token, 'sess', 'session token forwarded to the delete guard');
  const convergeSave = globalThis.__invokeCalls.filter((c) => c.fn === 'fieldHistoryAction').pop();
  assert.ok(convergeSave, 'linkage fields converge onto the canonical row');
  assert.equal(convergeSave.body.entity_id, 'wo-old');
  assert.equal(convergeSave.body.next_fields.estimate_id, 'e1');
  assert.equal(convergeSave.body.next_fields.in_pipeline, true);
  // Convergence writes only linkage fields — the canonical row's user-edited
  // title is never overwritten by estimate defaults.
  assert.equal(convergeSave.body.next_fields.title, undefined, 'content fields not forced during convergence');
}

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS customer sync pipeline (30 cases)');
process.exit(0);
