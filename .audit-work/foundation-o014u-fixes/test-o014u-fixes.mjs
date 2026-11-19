// O-014u fix verification — bundles the CANDIDATE files from
// .audit-work/foundation-o014u-fixes/candidates (never local src/), injects
// transient entity failures through stubs, and mounts the real React
// components with react-test-renderer (same pattern as
// foundation-o014-templates/verify/test-o014-templates.mjs).
//
//   R-1   moduleTemplateService.deleteModuleTemplate — transient get no longer
//         mints false delete-success (canonical isNotFound port).
//   R-2/3/4 ModuleTemplateDialog — load catch → loadFailed+retry (no fake
//         empty), save catch → inline error, delete catch → error + row kept.
//   R-5   clipboardService.removeClipboardItem transient-vs-definitive +
//         ClipboardManagerModal only filters on confirmed removal.
//   R-6   EstimatorQueues permanent-delete linked-records read fails CLOSED.
//   R-7   EstimatorQueues open-revision trash guard fails CLOSED (strict read).
//   R-8   BuilderPartsPanel.persistGroupOrder — CAS-anchored, result-checked,
//         failure reverts order + alerts.
//   R-9   PartGroup.toggleOpen — get/write failure reverts toggle + alerts.
//   R-10  useSectionSync.deleteOwnedSection — not-found ok, transient rethrows.
//   L-*   static assertions for the six lint candidates.
//
// Run: node .audit-work/foundation-o014u-fixes/test-o014u-fixes.mjs
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const UNIT = '.audit-work/foundation-o014u-fixes';
const CAND = `${UNIT}/candidates/src`;
const REMOTE = `${UNIT}/remote/src`;
const OUT = `${UNIT}/verify`;
fs.mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

// ---------------------------------------------------------------------------
// Stubs — every injected point reads a globalThis hook so each case controls
// failure injection without rebundling.
// ---------------------------------------------------------------------------
const STUBS = {
  '@/api/base44Client': `
    const ent = (name) => new Proxy({}, { get: (_, m) => (...a) => globalThis.__ent(name, m, a) });
    export const base44 = {
      entities: new Proxy({}, { get: (_, n) => ent(n) }),
      auth: { me: async () => globalThis.__me ?? { email: 'staff@x.com', role: 'admin' } },
      functions: { invoke: async (n, p) => (globalThis.__invoke ? globalThis.__invoke(n, p) : { data: {} }) },
    };`,
  '@/components/staff/staffEntities': `
    const ent = (name) => new Proxy({}, { get: (_, m) => (...a) => globalThis.__staff(name, m, a) });
    export const staffEntities = new Proxy({}, { get: (_, n) => ent(n) });`,
  '@/components/estimator/loadAllEntityRows': `
    export const loadAllEntityRows = async (a) => globalThis.__loadAll(a);`,
  '@/components/estimator/products/reusableSaveIdempotency': `
    export const ensureReusableRecord = (a) => (globalThis.__tplSave || ((x) => ({ id: 't1', ...x.data })))(a);`,
  '@/components/estimator/idempotentEntityCreate': `
    let __n = 0;
    export const newCreationRequestKey = (k) => 'k-' + (k || 'x') + '-' + (++__n);
    export const ensureIdempotentEntityCreate = (...a) => (globalThis.__ensureIdempotent || ((x) => x))(...a);`,
  '@/components/ui/dialog': `
    export const Dialog = (p) => p?.children ?? null;
    export const DialogContent = (p) => p?.children ?? null;
    export const DialogHeader = (p) => p?.children ?? null;
    export const DialogTitle = (p) => p?.children ?? null;`,
  'lucide-react': `
    const I = () => null;
    export const Trash2 = I; export const ClipboardPaste = I; export const Package = I; export const Search = I;
    export const AlertTriangle = I; export const ArrowRightLeft = I; export const Box = I; export const BookmarkPlus = I;
    export const ChevronDown = I; export const ChevronRight = I; export const ClipboardCopy = I; export const CopyPlus = I;
    export const Layers3 = I; export const Link2 = I; export const LockKeyhole = I; export const Pencil = I;
    export const Plus = I; export const RefreshCw = I; export const Unlink = I;
    export const ListFilter = I; export const ArrowUpDown = I; export const RotateCcw = I; export const Download = I;
    export const Upload = I; export const Copy = I; export const Archive = I; export const Briefcase = I; export const Layers = I;`,
  'react-router-dom': `
    export const Link = (p) => p?.children ?? null;
    export const useLocation = () => globalThis.__location ?? { search: '' };
    export const useNavigate = () => (globalThis.__navigate ||= ((...a) => globalThis.__navCalls.push(a)));`,
  '@/components/queues/queueFeedClient': `
    export const fetchEstimateQueueBundle = async () => globalThis.__queueBundle;
    export const loadFullEstimateRow = async (e) => (globalThis.__fullRow ? globalThis.__fullRow(e) : e);`,
  '@/components/auth/EmailGate': `
    export const useAuth = () => ({ user: globalThis.__user ?? { email: 'staff@x.com' } });
    export const getSessionToken = () => 'tok';`,
  '@/components/workflow/SavedViews': `export default () => null;`,
  '@/components/importer/ImportExportButtons': `
    export const ExportEstimatesButton = () => null;
    export const CopyBomButton = () => null;`,
  '@/components/ui/list-skeleton': `export const ListSkeleton = () => null;`,
  '@/components/estimator/deepLinks': `
    export const estimateMatchesSearch = () => true;
    export const useEstimateDeepLink = () => {};`,
  '@/components/queues/QueueFilterBar': `export default () => null;`,
  '@/components/queues/productQueueModel': `
    export const DEFAULT_QUEUE_FILTERS = { search: '', pageSize: 50, salesperson: '', enteredBy: '', assigned: '', module: '', due: '' };
    export const filterQueueRows = (rows) => rows;`,
  '@/components/estimator/estimateConversionService': `
    export const convertEstimateToWorkOrder = async () => ({});
    export const convertEstimatesToSharedWorkOrder = async () => ({});`,
  '@/components/estimator/quoteLifecycle': `
    export const localDateStamp = () => '2026-11-08';
    export const formatInCompanyTz = (d) => String(d || '').slice(0, 10);
    export const quoteExpirationDate = () => null;`,
  '@/components/estimator/estimatePersistence': `
    export const restoreEstimateFromLoadedTrashSnapshot = async (a) => ({ ...(a?.estimate || {}), deleted: false });
    export const permanentlyDeleteTrashedEstimate = async (a) => globalThis.__permDelete(a);
    export const softDeleteEstimateFromLoadedSnapshot = async (a) => globalThis.__softDelete(a);
    export const expectedEstimateFields = (r = {}, n = {}) => Object.fromEntries(Object.keys(n).map((k) => [k, r?.[k]]));
    export const replaceEstimateFieldsIfUnchanged = async (a) => ({ ...(a?.estimate || {}), ...(a?.nextFields || {}) });`,
  '@/components/estimator/estimateCreationService': `
    export const duplicateEstimate = async () => ({ id: 'dup1' });
    export const newEstimateCreationKey = () => 'ck-' + Math.random().toString(36).slice(2);`,
  '@/components/estimator/estimateRevisionService': `
    export const ensureEstimateLifecycleRevision = async () => ({ id: 'rev1' });`,
  '@/components/estimator/estimateStatusTransitions': `
    export const isEstimateStatusTransitionAllowed = () => true;
    export const statusTransitionMap = () => ({});
    export const allEstimateStatuses = [];`,
  // --- BuilderPartsPanel deps ---
  './CreatePartGroupModal': `export default () => null;`,
  './BuilderPartEditWarningModal': `export default () => null;`,
  './DetachedPartOverrideModal': `export default () => null;`,
  './MovePartGroupModal': `export default () => null;`,
  '@/components/estimator/parts/MasterPartPickerModal': `export default () => null;`,
  '@/components/estimator/parts/SavePartTemplateModal': `export default () => null;`,
  '@/components/estimator/parts/PartLibraryPickerModal': `export default () => null;`,
  '@/components/estimator/VendorCostBadge': `export default () => null;`,
  '@/components/estimator/builder/partSync': `
    export const detachBuilderPartOverride = async () => ({});
    export const updateDetachedPartOverride = async () => ({});`,
  '@/components/estimator/parts/customProductService': `
    export const addCatalogPartToProduct = async () => ({});
    export const removeManualProductPart = async () => ({});
    export const switchManualProductPart = async () => ({});
    export const updateManualProductPart = async () => ({});`,
  '@/components/estimator/parts/partCatalog': `export const typeDetails = () => ({});`,
  '@/components/estimator/aioPricing': `export const money = (n) => '$' + Number(n || 0).toFixed(2);`,
  '@/components/estimator/parts/partGroupService': `
    export const clonePartGroupInProduct = async () => ({});
    export const createPartGroupInProduct = async () => ({});
    export const dissolvePartGroup = async () => ({});
    export const moveIndependentPartGroup = async () => ({});
    export const renamePartGroup = async () => ({});`,
  // clipboardService's other imports (only removeClipboardItem is exercised,
  // but every specifier must resolve for the bundle):
  '@/components/estimator/builder/builderService': `export const snapshotHash = () => 'h';`,
  '@/components/estimator/products/quickProductService': `export const instantiateProductSnapshot = async () => ({});`,
  '@/components/estimator/products/snapshotUtils': `export const cloneSnapshot = (x) => JSON.parse(JSON.stringify(x ?? {}));`,
  '@/components/estimator/parts/partPackageService': `export const addPartPackageToProduct = async () => ({});`,
  '@/components/estimator/customerPricing': `
    export const acceptedCustomerUnitPrice = () => 0;
    export const liveCustomerUnitPrice = () => 0;
    export const sourceProjectEconomics = () => ({ internalCost: 0, customerPrice: 0 });`,
  '@/components/estimator/builder/builderMutationRecovery': `export const builderMutationHash = () => 'bh';`,
  // useSectionSync deps
  './moduleRegistry': `export const getModule = (k) => globalThis.__getModule(k);`,
  './builder/builderService': `export const sourceProjectTotal = () => 0;`,
  './customerPricing': `
    export const liveCustomerUnitPrice = () => 0;
    export const sourceProjectEconomics = () => ({ internalCost: 0, customerPrice: 0 });`,
};

// The REAL CAS persistence module (pure, no imports) is bundled verbatim so
// the collapse-toggle test exercises the actual write path, not a stand-in.
const REAL_REDIRECT = {
  '@/components/estimator/builder/builderEntityPersistence': path.resolve(`${REMOTE}/components/estimator/builder/builderEntityPersistence.js`),
};

const CAND_ABS = path.resolve(CAND);
const plugin = { name: 'stubs', setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    if (REAL_REDIRECT[a.path]) return { path: REAL_REDIRECT[a.path] };
    if (STUBS[a.path]) return { path: a.path, namespace: 'stub' };
    // Unstubbed `@/` specifiers resolve to the CANDIDATE tree so components
    // bundle the fixed services they call (e.g. ClipboardManagerModal pulls
    // the real candidate clipboardService).
    if (a.path.startsWith('@/')) {
      const rel = a.path.slice(2);
      for (const cand of [rel + '.js', rel + '.jsx', rel + '/index.js', rel + '/index.jsx']) {
        const p = path.resolve(CAND_ABS, cand);
        if (fs.existsSync(p)) return { path: p };
      }
    }
    return undefined;
  });
  b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
}};

const mk = async (entry, out) => {
  const r = await esbuild.build({
    entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', write: false,
    plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-test-renderer'],
  });
  fs.writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(path.resolve(out)).href);
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = {
  confirm: (m) => { globalThis.__confirms.push(String(m)); return globalThis.__confirmNext ?? true; },
  alert: (m) => { globalThis.__alerts.push(String(m)); },
};
globalThis.localStorage = { getItem: () => 'tok', setItem() {}, removeItem() {} };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const flush = async () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
// Flatten rendered children (strings, numbers, nested elements/arrays) to text.
const textOf = (node) => {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node?.props) return textOf(node.props.children);
  return '';
};
const resetGlobals = () => {
  globalThis.__alerts = []; globalThis.__confirms = []; globalThis.__navCalls = [];
  globalThis.__confirmNext = true; globalThis.__entCalls = []; globalThis.__staffCalls = [];
  globalThis.__closed = 0; globalThis.__applied = 0; globalThis.__permDeleted = 0; globalThis.__softDeleted = 0;
};
// Entity traffic recorders — the REAL builderEntityPersistence (bundled
// verbatim) drives entity.get/deleteMany/updateMany through these hooks, so
// asserting on the call log verifies the true CAS path end to end.
const logEnt = (impl) => (n, m, a) => { globalThis.__entCalls.push({ entity: n, method: m, args: a }); return impl(n, m, a); };
const logStaff = (impl) => (n, m, a) => { globalThis.__staffCalls.push({ entity: n, method: m, args: a }); return impl(n, m, a); };
const calls = (method, entity) => globalThis.__entCalls.filter((c) => c.method === method && (!entity || c.entity === entity));
const staffCalls = (method, entity) => globalThis.__staffCalls.filter((c) => c.method === method && (!entity || c.entity === entity));

// ===========================================================================
// Bundles
// ===========================================================================
const modSvc = await mk(`${CAND}/components/estimator/moduleShared/moduleTemplateService.js`, `${OUT}/modSvc.bundle.mjs`);
const modDlg = await mk(`${CAND}/components/estimator/moduleShared/ModuleTemplateDialog.jsx`, `${OUT}/modDlg.bundle.mjs`);
const clipSvc = await mk(`${CAND}/components/estimator/products/clipboardService.js`, `${OUT}/clipSvc.bundle.mjs`);
const clipModal = await mk(`${CAND}/components/estimator/aio/ClipboardManagerModal.jsx`, `${OUT}/clipModal.bundle.mjs`);
const queues = await mk(`${CAND}/pages/EstimatorQueues.jsx`, `${OUT}/queues.bundle.mjs`);
const panel = await mk(`${CAND}/components/estimator/aio/BuilderPartsPanel.jsx`, `${OUT}/panel.bundle.mjs`);
const sectionSync = await mk(`${CAND}/components/estimator/useSectionSync.js`, `${OUT}/sectionSync.bundle.mjs`);

const { deleteModuleTemplate } = modSvc;
const ModuleTemplateDialog = modDlg.default;
const { removeClipboardItem } = clipSvc;
const ClipboardManagerModal = clipModal.default;
const EstimatorQueues = queues.default;
const BuilderPartsPanel = panel.default;
const { deleteOwnedSection } = sectionSync;

// ===========================================================================
// R-1 — deleteModuleTemplate (mirror of the landed O-014 service cases)
// ===========================================================================
await ok('R-1 service: 404 family resolves already-gone, no delete attempted', async () => {
  resetGlobals();
  for (const mk404 of [
    () => Object.assign(new Error('nf'), { status: 404 }),
    () => Object.assign(new Error('nf'), { response: { status: 404 } }),
    () => Object.assign(new Error('nf'), { response: { statusCode: 404 } }),
    () => Object.assign(new Error('nf'), { data: { status: 404 } }),
    () => new Error('record not found'),
    () => new Error('entity does not exist'),
    () => Object.assign(new Error('x'), { response: { data: { message: 'Not found' } } }),
    () => Object.assign(new Error('x'), { response: { data: { error: 'does not exist' } } }),
    () => Object.assign(new Error('x'), { data: { message: 'not found' } }),
    () => Object.assign(new Error('x'), { data: { error: 'not found' } }),
  ]) {
    globalThis.__ent = logEnt((n, m) => { if (n === 'ProjectTemplate' && m === 'get') return Promise.reject(mk404()); throw new Error('unexpected ' + m); });
    assert.equal(await deleteModuleTemplate('t9'), true, 'not-found resolves true');
    assert.equal(calls('deleteMany').length, 0, 'no delete attempted');
    globalThis.__entCalls = [];
  }
});

await ok('R-1 service: transient fetch failures PROPAGATE (500/TypeError/403/429) — no false success', async () => {
  resetGlobals();
  for (const bad of [
    Object.assign(new Error('srv'), { status: 500 }),
    new TypeError('fetch failed'),
    Object.assign(new Error('forbidden'), { status: 403 }),
    Object.assign(new Error('rate limited'), { response: { status: 429 } }),
    Object.assign(new Error('timeout'), { status: 0 }),
  ]) {
    globalThis.__ent = logEnt((n, m) => { if (m === 'get') return Promise.reject(bad); throw new Error('unexpected ' + m); });
    await assert.rejects(() => deleteModuleTemplate('t9'), undefined, `transient ${bad.message} must rethrow`);
    assert.equal(calls('deleteMany').length, 0, 'no delete attempted');
    globalThis.__entCalls = [];
  }
});

await ok('R-1 service: unverifiable fetched records abort (null/undefined/array/wrong-id/scalar)', async () => {
  resetGlobals();
  for (const bad of [null, undefined, [], { id: 'other' }, 'x', 42]) {
    globalThis.__ent = logEnt((n, m) => { if (m === 'get') return Promise.resolve(bad); throw new Error('unexpected ' + m); });
    await assert.rejects(() => deleteModuleTemplate('t9'), /could not be verified/, JSON.stringify(bad));
    assert.equal(calls('deleteMany').length, 0, 'no delete attempted');
    globalThis.__entCalls = [];
  }
});

await ok('R-1 service: verified record -> exactly one anchored deleteMany via real CAS helper; blank id rejected', async () => {
  resetGlobals();
  globalThis.__ent = logEnt((n, m) => {
    if (n === 'ProjectTemplate' && m === 'get') return Promise.resolve({ id: 't9', template_name: 'T9', updated_date: 'v3' });
    if (n === 'ProjectTemplate' && m === 'deleteMany') return Promise.resolve({ deleted: 1 });
    throw new Error('unexpected ' + m);
  });
  assert.equal(await deleteModuleTemplate('t9', 'Laser template'), true);
  const dels = calls('deleteMany', 'ProjectTemplate');
  assert.equal(dels.length, 1, 'exactly one conditional delete');
  assert.deepEqual(dels[0].args[0], { id: 't9', updated_date: 'v3' }, 'deleteMany anchored id+updated_date');
  await assert.rejects(() => deleteModuleTemplate('  '), /id is required/);
});

// ===========================================================================
// R-2/3/4 — ModuleTemplateDialog (mounted, real component + real service)
// ===========================================================================
// The dialog bundles the CANDIDATE service + the REAL CAS persistence helper:
//   __loadAll    -> listModuleTemplates read
//   __tplSave    -> ensureReusableRecord (save path)
//   __ent        -> ProjectTemplate.get/deleteMany inside deleteModuleTemplate
//                   (via the real deleteEntityIfUnchanged CAS path)
const mountModuleDlg = async (props = {}) => {
  resetGlobals();
  globalThis.__loadAll = async () => { if (props.loadErr) throw props.loadErr; return props.rows ?? []; };
  globalThis.__tplSave = null;
  globalThis.__ent = logEnt((n, m, a) => {
    if (m === 'get') return props.getImpl ? props.getImpl(n, a[0]) : Promise.resolve({ id: a[0], template_name: 'T', updated_date: 'v1' });
    if (m === 'deleteMany') return Promise.resolve({ deleted: 1 });
    throw new Error('unexpected ' + m);
  });
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(ModuleTemplateDialog, {
      open: true, mode: 'load', moduleKey: 'laser', title: 'Laser',
      onClose: () => { globalThis.__closed = (globalThis.__closed || 0) + 1; },
      project: { id: 'p1' },
      onApply: () => { globalThis.__applied = (globalThis.__applied || 0) + 1; },
      buildTemplateData: (p) => ({ from: p?.id }),
      describeTemplate: (t) => `${(t.project_data?.items || []).length} items`,
      ...props,
    }));
  });
  await flush();
  const alerts = () => c.root.findAll((el) => el?.props?.role === 'alert').map((el) => textOf(el.props.children));
  const btn = (label) => c.root.findAll((el) => el?.props?.children === label).map((el) => el.props);
  const text = (s) => c.root.findAll((el) => el?.props?.children === s);
  const removeBtn = () => c.root.findAll((el) => el.type === 'button' && el.props.className?.includes('text-gray-400')).map((el) => el.props);
  return { c, alerts, btn, text, removeBtn, cleanup: async () => act(async () => { c.unmount(); }) };
};

await ok('R-2 dialog load: fetch failure shows failure copy + retry, NOT fake empty; retry recovers', async () => {
  const m = await mountModuleDlg({ loadErr: new Error('load dead') });
  assert.equal(m.text('Templates could not be loaded.').length, 1, 'load-failure copy');
  assert.equal(m.text('No laser templates saved yet.').length, 0, 'fake-empty copy absent');
  assert.ok(m.alerts().some((s) => String(s).includes('load dead')), 'alert with cause');
  assert.equal(m.btn('Retry').length, 1, 'retry affordance');
  const m2rows = [{ id: 't9', template_name: 'B', project_data: { items: [1] } }];
  const { c } = m;
  await act(async () => {
    globalThis.__loadAll = async () => m2rows;
    m.btn('Retry')[0].onClick();
  });
  await flush();
  assert.equal(c.root.findAll((el) => el?.props?.children === 'Apply').length, 1, 'retry reloads rows');
  assert.equal(m.alerts().length, 0, 'error cleared after successful reload');
  await m.cleanup();
});

await ok('R-3 dialog save: rejection surfaces inline error, dialog stays open, busy resets', async () => {
  globalThis.__closed = 0;
  const m = await mountModuleDlg({ mode: 'save' });
  globalThis.__tplSave = () => Promise.reject(new Error('boom save'));
  const inp = m.c.root.findAll((el) => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'My T' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.ok(m.alerts().some((s) => String(s).includes('boom save')), 'error text: ' + JSON.stringify(m.alerts()));
  assert.equal(globalThis.__closed, 0, 'dialog stays open');
  assert.equal(m.btn('Save Template')[0].disabled, false, 'busy cleared');
  await m.cleanup();
});

await ok('R-3 dialog save: success closes + service receives moduleKey/idempotency data', async () => {
  globalThis.__closed = 0;
  const m = await mountModuleDlg({ mode: 'save' });
  let got = null;
  globalThis.__tplSave = (a) => { got = a; return Promise.resolve({ id: 't1' }); };
  const inp = m.c.root.findAll((el) => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'My T' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.equal(globalThis.__closed, 1, 'closed once');
  assert.equal(got.data.module_key, 'laser');
  assert.equal(got.data.template_name, 'My T');
  assert.equal(got.data.project_data.from, 'p1', 'buildTemplateData ran');
  assert.ok(String(got.idempotencyKey).startsWith('laser_template_save:'), 'keyed retry');
  assert.equal(m.alerts().length, 0);
  await m.cleanup();
});

await ok('R-4 dialog delete: transient PRE-READ 500 -> row kept + error; 404 -> row removed; CAS reject -> row kept', async () => {
  const row = { id: 't1', template_name: 'A', updated_date: 'v1', project_data: {} };
  // transient get failure — real CAS helper is bypassed before any delete
  let m = await mountModuleDlg({ rows: [row], getImpl: () => Promise.reject(Object.assign(new Error('server'), { status: 500 })) });
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.btn('Apply').length, 1, 'row retained after transient fetch failure');
  assert.ok(m.alerts().some((s) => String(s).includes('server')), 'error surfaced: ' + JSON.stringify(m.alerts()));
  await m.cleanup();

  // definitive 404 — row is already gone; list drops it silently
  m = await mountModuleDlg({ rows: [row], getImpl: () => Promise.reject(Object.assign(new Error('nf'), { status: 404 })) });
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.btn('Apply').length, 0, 'row removed for already-gone record');
  assert.equal(m.alerts().length, 0, 'no error');
  await m.cleanup();

  // real CAS delete reports deleted:0 -> helper re-reads, row still exists ->
  // throws "changed in another session" -> row kept + error
  m = await mountModuleDlg({
    rows: [row],
    getImpl: () => Promise.resolve({ id: 't1', template_name: 'A', updated_date: 'v9-changed' }),
  });
  globalThis.__ent = logEnt((n, m2, a) => {
    if (m2 === 'get') return Promise.resolve({ id: 't1', template_name: 'A', updated_date: 'v9-changed' });
    if (m2 === 'deleteMany') return Promise.resolve({ deleted: 0 });
    throw new Error('unexpected ' + m2);
  });
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.btn('Apply').length, 1, 'row retained after CAS mismatch');
  assert.ok(m.alerts().length >= 1, 'delete error visible');
  await m.cleanup();
});

await ok('R-4b dialog apply: throwing onApply surfaces error + stays open; success closes even when onApply returns undefined', async () => {
  // throwing apply
  let m = await mountModuleDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }], onApply: () => { throw new Error('apply boom'); } });
  await act(async () => { m.btn('Apply')[0].onClick(); });
  assert.ok(m.alerts().some((s) => String(s).includes('apply boom')), 'apply error visible');
  assert.equal(globalThis.__closed || 0, 0, 'stays open');
  await m.cleanup();

  // real callers return undefined (setProject/patch) — must still close
  globalThis.__closed = 0;
  m = await mountModuleDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }], onApply: () => undefined });
  await act(async () => { m.btn('Apply')[0].onClick(); });
  assert.equal(globalThis.__closed, 1, 'undefined-returning apply still closes (real caller contract)');
  await m.cleanup();
});

// ===========================================================================
// R-5 — clipboardService.removeClipboardItem + ClipboardManagerModal
// ===========================================================================
await ok('R-5 service: transient get failures PROPAGATE (500/429/TypeError) — no silent return', async () => {
  resetGlobals();
  for (const bad of [
    Object.assign(new Error('srv'), { status: 500 }),
    Object.assign(new Error('rate'), { status: 429 }),
    new TypeError('fetch failed'),
  ]) {
    globalThis.__staff = logStaff((n, m) => { if (m === 'get') return Promise.reject(bad); throw new Error('unexpected ' + m); });
    await assert.rejects(() => removeClipboardItem('c1'), undefined, `${bad.message} must rethrow`);
    assert.equal(staffCalls('deleteMany').length, 0, 'no delete attempted');
    globalThis.__staffCalls = [];
  }
});

await ok('R-5 service: 404 family + resolved-null -> returns without delete; verified -> anchored deleteMany', async () => {
  resetGlobals();
  for (const mk404 of [
    () => Object.assign(new Error('nf'), { status: 404 }),
    () => new Error('clipboard item not found'),
  ]) {
    globalThis.__staff = logStaff((n, m) => { if (m === 'get') return Promise.reject(mk404()); throw new Error('unexpected ' + m); });
    await removeClipboardItem('c1');
    assert.equal(staffCalls('deleteMany').length, 0, 'already-gone needs no delete');
    globalThis.__staffCalls = [];
  }
  globalThis.__staff = logStaff((n, m) => { if (m === 'get') return Promise.resolve(null); throw new Error('unexpected ' + m); });
  globalThis.__staffCalls = [];
  await removeClipboardItem('c1');
  assert.equal(staffCalls('deleteMany').length, 0, 'resolved-null treated as gone');

  globalThis.__staff = logStaff((n, m) => {
    if (m === 'get') return Promise.resolve({ id: 'c1', item_name: 'X', updated_date: 'v1' });
    if (m === 'deleteMany') return Promise.resolve({ deleted: 1 });
    throw new Error('unexpected ' + m);
  });
  globalThis.__staffCalls = [];
  await removeClipboardItem('c1');
  const dels = staffCalls('deleteMany', 'EstimateClipboardItem');
  assert.equal(dels.length, 1, 'verified record CAS-deleted');
  assert.deepEqual(dels[0].args[0], { id: 'c1', updated_date: 'v1' }, 'anchored on loaded version');
  await removeClipboardItem('   ');
});

// Modal: bundles the REAL candidate service — __staff drives the entity lane
// (EstimateClipboardItem.get + deleteMany via the real CAS helper).
const mountClipModal = async ({ rows = [], getImpl } = {}) => {
  resetGlobals();
  globalThis.__loadAll = async () => rows;
  globalThis.__staff = logStaff((n, m, a) => {
    if (m === 'get') return getImpl ? getImpl(n, a[0]) : Promise.resolve({ id: a[0], updated_date: 'v1' });
    if (m === 'deleteMany') return Promise.resolve({ deleted: 1 });
    throw new Error('unexpected ' + m);
  });
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(ClipboardManagerModal, {
      open: true, estimateId: 'e1', onClose: () => {}, onPasted: async () => {}, lines: [],
    }));
  });
  await flush();
  const alerts = () => c.root.findAll((el) => el?.props?.role === 'alert').map((el) => textOf(el.props.children));
  const removeBtn = () => c.root.findAll((el) => el.type === 'button' && el.props.title === 'Remove from clipboard').map((el) => el.props);
  const items = () => c.root.findAll((el) => typeof el?.props?.['aria-label'] === 'string' && el.props['aria-label'].startsWith('Remove '));
  return { c, alerts, removeBtn, items, cleanup: async () => act(async () => { c.unmount(); }) };
};

await ok('R-5 modal: transient remove failure keeps row + surfaces error; confirmed removal drops row', async () => {
  const row = { id: 'c1', item_name: 'Part X', item_type: 'part', copied_at: '2026-11-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z' };
  // transient get failure -> service rethrows -> modal error, row kept
  let m = await mountClipModal({ rows: [row], getImpl: () => Promise.reject(Object.assign(new Error('gateway'), { status: 500 })) });
  assert.equal(m.items().length, 1, 'row rendered');
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.items().length, 1, 'row NOT stale-removed');
  assert.ok(m.alerts().some((s) => String(s).includes('gateway')), 'error surfaced: ' + JSON.stringify(m.alerts()));
  await m.cleanup();

  // success -> confirmed removal -> row filtered
  m = await mountClipModal({ rows: [row], getImpl: () => Promise.resolve({ id: 'c1', item_name: 'Part X', updated_date: 'v1' }) });
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.items().length, 0, 'confirmed removal drops the row');
  assert.equal(staffCalls('deleteMany', 'EstimateClipboardItem').length, 1, 'real delete issued');
  await m.cleanup();
});

// ===========================================================================
// R-6 / R-7 — EstimatorQueues mounted page
// ===========================================================================
const mountQueues = async ({ status = '', estimates = [] } = {}) => {
  globalThis.__alerts = []; globalThis.__confirms = [];
  globalThis.__permDeleted = 0; globalThis.__softDeleted = 0;
  resetGlobals();
  globalThis.__location = { search: status ? `?status=${status}` : '' };
  globalThis.__queueBundle = { estimates, quoteDefaults: {} };
  globalThis.__me = { email: 'staff@x.com', role: 'admin' };
  globalThis.__user = { email: 'staff@x.com' };
  globalThis.__fullRow = async (e) => e;
  globalThis.__permDelete = async () => { globalThis.__permDeleted += 1; return { deleted: true }; };
  globalThis.__softDelete = async (a) => { globalThis.__softDeleted += 1; return { ...(a?.estimate || {}), deleted: true }; };
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(EstimatorQueues)); });
  await flush();
  const alerts = () => c.root.findAll((el) => el?.props?.role === 'alert').map((el) => textOf(el.props.children));
  const text = (s) => c.root.findAll((el) => el?.props?.children === s);
  // "Delete permanently" is a text node inside a button that also holds the
  // Trash2 icon — match the button whose children array contains the label.
  const permBtn = () => c.root
    .findAll((el) => el.type === 'button'
      && Array.isArray(el.props?.children)
      && el.props.children.some((ch) => typeof ch === 'string' && ch.includes('Delete permanently')))
    .map((el) => el.props);
  const trashBtn = () => c.root.findAll((el) => typeof el?.props?.['aria-label'] === 'string' && el.props['aria-label'].startsWith('Move ')).map((el) => el.props);
  return { c, alerts, text, permBtn, trashBtn, cleanup: async () => act(async () => { c.unmount(); }) };
};

const estimate = (over = {}) => ({
  id: 'e1', project_name: 'Sign Job', client_name: 'ACME', estimate_number: 'EST-1',
  status: 'draft', created_date: '2026-11-01T00:00:00Z', updated_date: 'v1',
  quote_total: 1000, deleted: false, ...over,
});

await ok('R-6 permanent delete: acceptance read rejection BLOCKS delete (fail closed), no confirm shown', async () => {
  globalThis.__staff = (n, m) => {
    if (n === 'EstimateAcceptance' && m === 'filter') return Promise.reject(Object.assign(new Error('gateway dead'), { status: 500 }));
    if (m === 'updateMany') return Promise.resolve({ updated: 0 });
    throw new Error('unexpected ' + n + '.' + m);
  };
  const m = await mountQueues({ status: 'trash', estimates: [estimate({ deleted: true })] });
  assert.equal(m.permBtn().length, 1, 'row rendered in trash queue');
  await act(async () => { await m.permBtn()[0].onClick(); });
  assert.equal(globalThis.__confirms.length, 0, 'confirm never reached — guard failed closed');
  assert.equal(globalThis.__permDeleted || 0, 0, 'no delete attempted');
  assert.ok(m.alerts().some((s) => String(s).includes('Linked records could not be verified')), 'block reason: ' + JSON.stringify(m.alerts()));
  await m.cleanup();
});

await ok('R-6 permanent delete: verified acceptances adorn the confirm warning; delete proceeds on confirm', async () => {
  let filterCalls = 0;
  globalThis.__staff = logStaff((n, m) => {
    if (n === 'EstimateAcceptance' && m === 'filter') { filterCalls++; return Promise.resolve([{ id: 'a1' }, { id: 'a2' }]); }
    throw new Error('unexpected ' + n + '.' + m);
  });
  const m = await mountQueues({ status: 'trash', estimates: [estimate({ deleted: true })] });
  await act(async () => { await m.permBtn()[0].onClick(); });
  assert.equal(filterCalls, 1, 'guard read ran');
  assert.equal(globalThis.__confirms.length, 1, 'confirm shown after verified read');
  assert.ok(globalThis.__confirms[0].includes('2 recorded customer acceptances'), 'warning names the linked records: ' + globalThis.__confirms[0]);
  assert.equal(globalThis.__permDeleted, 1, 'confirmed delete proceeded');
  await m.cleanup();
});

await ok('R-7 quick trash: revision read rejection BLOCKS trash (fail closed) via the strict read', async () => {
  const readCalls = [];
  globalThis.__loadAll = async (a) => { readCalls.push(a); return Promise.reject(Object.assign(new Error('read dead'), { status: 503 })); };
  globalThis.__staff = (n, m) => { throw new Error('unexpected ' + n + '.' + m); };
  const m = await mountQueues({ estimates: [estimate()] });
  assert.equal(m.trashBtn().length, 1, 'trash action rendered');
  await act(async () => { await m.trashBtn()[0].onClick(); });
  assert.equal(globalThis.__confirms.length, 0, 'confirm never reached — guard failed closed');
  assert.equal(globalThis.__softDeleted || 0, 0, 'not trashed');
  assert.ok(m.alerts().some((s) => String(s).includes('read dead') || String(s).includes('could not be moved to Trash')), 'block reason: ' + JSON.stringify(m.alerts()));
  assert.deepEqual(readCalls[0]?.query, { estimate_id: 'e1', revision_status: 'open' }, 'same bounded read as the helper');
  assert.equal(readCalls[0]?.limit, 50, 'bounded read preserved');
  assert.equal(readCalls[0]?.sort, '-revision_number', 'same sort');
  await m.cleanup();
});

await ok('R-7 quick trash: open revision blocks with message; verified-empty proceeds to confirm + soft delete', async () => {
  // open revision present -> guard blocks BEFORE confirm
  globalThis.__loadAll = async () => [{ id: 'rev1', revision_status: 'open' }];
  globalThis.__staff = (n, m) => { throw new Error('unexpected ' + n + '.' + m); };
  let m = await mountQueues({ estimates: [estimate()] });
  await act(async () => { await m.trashBtn()[0].onClick(); });
  assert.equal(globalThis.__confirms.length, 0, 'open revision blocks before confirm');
  assert.equal(globalThis.__softDeleted || 0, 0);
  assert.ok(m.alerts().some((s) => String(s).includes('open revision')), 'guard message: ' + JSON.stringify(m.alerts()));
  await m.cleanup();

  // definitively no open revision -> confirm -> soft delete
  globalThis.__loadAll = async () => [];
  m = await mountQueues({ estimates: [estimate()] });
  await act(async () => { await m.trashBtn()[0].onClick(); });
  assert.equal(globalThis.__confirms.length, 1, 'confirm reached on verified-empty read');
  assert.equal(globalThis.__softDeleted, 1, 'trash proceeded after confirm');
  await m.cleanup();
});

// ===========================================================================
// R-8 / R-9 — BuilderPartsPanel mounted panel
// ===========================================================================
const GROUP_A = { id: 'g1', group_name: 'Alpha', builder_product_id: 'bp1', sort_order: 0, is_active: true, is_collapsed: false, updated_date: 'v1' };
const GROUP_B = { id: 'g2', group_name: 'Beta', builder_product_id: 'bp1', sort_order: 1, is_active: true, is_collapsed: true, updated_date: 'v2' };
const PARTS = [
  { id: 'pt1', part_group_id: 'g1', part_name: 'Part One', part_type: 'material', is_active: true, sort_order: 0, frozen_extended_cost: 10, builder_sync_state: 'manual' },
  { id: 'pt2', part_group_id: 'g2', part_name: 'Part Two', part_type: 'material', is_active: true, sort_order: 1, frozen_extended_cost: 20, builder_sync_state: 'manual' },
];

const mountPanel = async ({ groups = [GROUP_A, GROUP_B], parts = PARTS, groupGet, updateMany } = {}) => {
  globalThis.__alerts = []; globalThis.__confirms = [];
  resetGlobals();
  globalThis.__loadCalls = [];
  // loadAllEntityRows is called per entity with a label — route by label
  globalThis.__loadAll = async (a) => {
    globalThis.__loadCalls.push(a.label);
    if (a.label === 'Builder Parts panel Parts') return Promise.resolve(parts);
    if (a.label === 'Builder Parts panel Groups') return Promise.resolve(groups);
    return Promise.resolve([]);
  };
  globalThis.__ent = logEnt((n, m, a) => {
    if (n === 'BuilderPartGroup' && m === 'get') return groupGet ? groupGet(n, a[0]) : Promise.resolve(groups.find((g) => g.id === a[0]) ?? null);
    if (n === 'BuilderPartGroup' && m === 'updateMany') return updateMany(n, a[0], a[1]);
    throw new Error('unexpected ' + n + '.' + m);
  });
  globalThis.__staff = logStaff((n, m, a) => {
    if (n === 'BuilderPartGroup' && m === 'updateMany') return updateMany(n, a[0], a[1]);
    throw new Error('unexpected staff ' + n + '.' + m);
  });
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(BuilderPartsPanel, {
      builderProductId: 'bp1', estimateId: 'e1', expectedEstimateUpdatedAt: 'ev1',
      onLoaded: () => {}, onProductRefresh: async () => {}, allowAddParts: false,
    }));
  });
  await flush();
  // Group-name span carries font-bold; part-name spans are font-semibold.
  const groupNames = () => c.root
    .findAll((el) => el.type === 'span' && el.props?.className?.includes('font-bold text-gray-900 truncate flex-1') && typeof el.props?.children === 'string')
    .map((el) => el.props.children);
  const draggables = () => c.root.findAll((el) => el.props?.draggable === true).map((el) => el.props);
  // PartRow rows also carry aria-expanded — the GROUP toggle is the one whose
  // button class carries `min-w-0 flex-1` (part rows use `flex-1 min-w-0`).
  const expands = () => c.root
    .findAll((el) => el.props?.['aria-expanded'] !== undefined && String(el.props?.className || '').includes('min-w-0 flex-1'))
    .map((el) => el.props);
  return { c, groupNames, draggables, expands, cleanup: async () => act(async () => { c.unmount(); }) };
};

await ok('R-8 reorder: write rejection reverts the visual order + alerts + re-reads (fail honest)', async () => {
  const writes = [];
  const m = await mountPanel({
    updateMany: (n, q) => { writes.push(q); return Promise.reject(Object.assign(new Error('write dead'), { status: 500 })); },
  });
  assert.deepEqual(m.groupNames(), ['Alpha', 'Beta'], 'initial order');
  assert.equal(m.draggables().length, 2, 'two draggable group rows');
  // Re-query after dragStart — onDrop closes over the dragGroupIdx state var.
  await act(async () => { m.draggables()[0].onDragStart(); });
  await flush();
  await act(async () => { await m.draggables()[1].onDrop({ preventDefault: () => {} }); });
  await flush();
  assert.deepEqual(m.groupNames(), ['Alpha', 'Beta'], 'order reverted to persisted state after failed writes');
  assert.ok(globalThis.__alerts.some((s) => s.includes('could not be reordered')), 'failure alerted: ' + JSON.stringify(globalThis.__alerts));
  assert.ok(writes.length >= 1, 'writes attempted');
  assert.equal(writes[0].updated_date, 'v2', 'CAS anchor on the moved group version');
  assert.ok(globalThis.__loadCalls.filter((l) => l === 'Builder Parts panel Groups').length >= 2, 'groups re-read after failure');
  await m.cleanup();
});

await ok('R-8 reorder: result.updated!==1 counted as failure (CAS no-match does not fake-apply)', async () => {
  const m = await mountPanel({
    updateMany: (n, q) => Promise.resolve({ updated: 0 }),
  });
  await act(async () => { m.draggables()[0].onDragStart(); });
  await flush();
  await act(async () => { await m.draggables()[1].onDrop({ preventDefault: () => {} }); });
  await flush();
  assert.deepEqual(m.groupNames(), ['Alpha', 'Beta'], 'order reverted on CAS no-match');
  assert.ok(globalThis.__alerts.some((s) => s.includes('could not be reordered')), 'no-match alerted');
  await m.cleanup();
});

await ok('R-8 reorder: successful persist applies order, anchored writes, no alert', async () => {
  const writes = [];
  const m = await mountPanel({
    updateMany: (n, q) => { writes.push(q); return Promise.resolve({ updated: 1 }); },
  });
  await act(async () => { m.draggables()[0].onDragStart(); });
  await flush();
  await act(async () => { await m.draggables()[1].onDrop({ preventDefault: () => {} }); });
  await flush();
  assert.equal(writes.length, 2, 'both moved rows written');
  assert.equal(writes[0].id, 'g2');
  assert.equal(writes[0].updated_date, 'v2', 'anchored');
  assert.equal(writes[1].id, 'g1');
  assert.equal(writes[1].updated_date, 'v1', 'anchored');
  assert.equal(globalThis.__alerts.length, 0, 'no alert on success');
  await m.cleanup();
});

await ok('R-9 collapse toggle: pre-read rejection reverts open state + alerts', async () => {
  const m = await mountPanel({
    groupGet: () => Promise.reject(Object.assign(new Error('read dead'), { status: 500 })),
    updateMany: () => Promise.resolve({ updated: 1 }),
  });
  const expanded = () => m.expands().map((p) => p['aria-expanded']);
  assert.deepEqual(expanded(), [true, false], 'initial collapse state from is_collapsed');
  await act(async () => { await m.expands()[0].onClick(); });
  await flush();
  assert.deepEqual(expanded(), [true, false], 'toggle reverted after transient get failure');
  assert.ok(globalThis.__alerts.some((s) => s.includes('collapsed state could not be saved')), 'alerted: ' + JSON.stringify(globalThis.__alerts));
  await m.cleanup();
});

await ok('R-9 collapse toggle: CAS write rejection reverts + alerts; success persists real $set write', async () => {
  // write rejection path — real replaceBuilderEntityFieldsIfUnchanged throws
  const writes = [];
  let m = await mountPanel({
    groupGet: (n, id) => Promise.resolve({ id, builder_product_id: 'bp1', is_collapsed: false, updated_date: 'v1' }),
    updateMany: (n, q, u) => { writes.push({ q, u }); return Promise.reject(Object.assign(new Error('conflict'), { status: 409 })); },
  });
  await act(async () => { await m.expands()[0].onClick(); });
  await flush();
  assert.deepEqual(m.expands().map((p) => p['aria-expanded']), [true, false], 'toggle reverted after write failure');
  assert.ok(globalThis.__alerts.some((s) => s.includes('collapsed state')), 'write failure alerted');
  await m.cleanup();

  // success path — real CAS helper: updateMany {id, updated_date} + {$set};
  // the stub row mirrors the write so the helper's post-save re-read verifies.
  writes.length = 0;
  let persistedCollapsed = false;
  m = await mountPanel({
    groupGet: (n, id) => Promise.resolve({ id, builder_product_id: 'bp1', is_collapsed: persistedCollapsed, updated_date: 'v1' }),
    updateMany: (n, q, u) => { writes.push({ q, u }); persistedCollapsed = u.$set.is_collapsed; return Promise.resolve({ updated: 1 }); },
  });
  await act(async () => { await m.expands()[0].onClick(); });
  await flush();
  assert.equal(globalThis.__alerts.length, 0, 'no alert on success');
  const w = writes.find((x) => x.q.id === 'g1');
  assert.ok(w, 'group write issued');
  assert.equal(w.q.updated_date, 'v1', 'write anchored on loaded version');
  assert.equal(w.u.$set.is_collapsed, true, 'collapse persisted to true after toggling closed');
  await m.cleanup();
});

// ===========================================================================
// R-10 — useSectionSync.deleteOwnedSection
// ===========================================================================
await ok('R-10 deleteOwnedSection: transient delete PROPAGATES; not-found resolves true; non-owned returns false', async () => {
  globalThis.__getModule = () => ({ entity: 'FoundationProject' });
  for (const bad of [
    Object.assign(new Error('srv'), { status: 500 }),
    Object.assign(new Error('rate'), { status: 429 }),
    new TypeError('fetch failed'),
    Object.assign(new Error('forbidden'), { status: 403 }),
  ]) {
    globalThis.__ent = (n, m) => { if (m === 'delete') return Promise.reject(bad); throw new Error('unexpected ' + m); };
    await assert.rejects(() => deleteOwnedSection({ owned: true, module_key: 'foundation', project_id: 'p1' }), undefined, `${bad.message} rethrows`);
  }
  globalThis.__ent = (n, m) => { if (m === 'delete') return Promise.reject(Object.assign(new Error('nf'), { status: 404 })); throw new Error('unexpected ' + m); };
  assert.equal(await deleteOwnedSection({ owned: true, module_key: 'foundation', project_id: 'p1' }), true, 'already-gone ok');
  globalThis.__ent = (n, m) => { if (m === 'delete') return Promise.resolve(true); throw new Error('unexpected ' + m); };
  assert.equal(await deleteOwnedSection({ owned: true, module_key: 'foundation', project_id: 'p1' }), true, 'delete success');
  assert.equal(await deleteOwnedSection({ owned: false, module_key: 'foundation', project_id: 'p1' }), false, 'non-owned no-op');
  assert.equal(await deleteOwnedSection({ owned: true, module_key: 'foundation' }), false, 'missing project no-op');
  globalThis.__getModule = () => null;
  assert.equal(await deleteOwnedSection({ owned: true, module_key: 'nope', project_id: 'p1' }), false, 'unknown module no-op');
});

// ===========================================================================
// Lint candidates — static assertions on the candidate sources
// ===========================================================================
const src = (p) => fs.readFileSync(path.join(CAND, p), 'utf8');
await ok('L-* lint candidates: dead imports + dead param removed', async () => {
  const paint = src('components/estimator/paint/paintPricingAvailability.js');
  assert.ok(!paint.split('\n').some((l) => l.trim() === 'paintSettingNumber,'), 'paintSettingNumber import gone');
  assert.ok(!src('components/masterInventory/MasterConcreteStoneTab.jsx').includes('import React'), 'React import gone');
  assert.ok(!src('components/masterInventory/MasterSuppliesTab.jsx').includes('base44Client'), 'base44 import gone');
  assert.ok(!/\bAnchor\b/.test(src('components/masterInventory/inventorySources.jsx').split('from "lucide-react"')[0].split('import').pop()), 'Anchor import gone');
  assert.ok(!src('pages/FoundationEstimator.jsx').includes('validateFoundationSyncAttempt'), 'validateFoundationSyncAttempt import gone');
  assert.ok(src('components/estimator/foundation/foundationCatalogIntegrity.js').includes('priceBasis: () => (!authoredOverride(item.custom_forming_rate)'), 'dead row param dropped');
});

console.log(`PASS o014u-fixes passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
