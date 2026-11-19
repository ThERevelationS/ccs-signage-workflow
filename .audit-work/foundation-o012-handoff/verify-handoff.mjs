// O-012 (CMP-A12) model verification: Foundation save -> ?id= reopen ->
// Builder handoff -> quote/revision/WO reference+cost preservation.
//
// Bundles the REAL remote modules (fixture/src/...) with stubbed @/ imports
// backed by one shared in-memory entity store, then runs GREEN contract cases
// plus RED baseline-vs-candidate cases for each hardened gap:
//   G1  sourceProjectTotal/foundationRecordSavedTotal grand_total poison
//   G2  orphaned builder_sync_attempt bricking standalone saves
//   G3  recordBuilderSave minting an orphan BuilderProduct when the hint's
//       estimate line was removed between load and save
//   G4  handleMerge transplanting an unresumable pending recovery marker
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const F = (p) => resolve(here, 'fixture/src', p);
const stub = (p) => resolve(here, 'fixture/src', p);

const alias = {
  '@/api/base44Client': stub('api/base44Client.js'),
  '@/components/staff/staffEntities': stub('components/staff/staffEntities.js'),
  '@/components/estimator/loadAllEntityRows': stub('components/estimator/loadAllEntityRows.js'),
  '@/components/estimator/estimateMutationGuard': F('components/estimator/estimateMutationGuard.js'),
  '@/components/estimator/estimatePersistence': F('components/estimator/estimatePersistence.js'),
  '@/components/estimator/estimateLifecycle': F('components/estimator/estimateLifecycle.js'),
  '@/components/estimator/estimateRevisionService': stub('components/estimator/estimateRevisionService.js'),
  '@/components/estimator/moduleRegistry': F('components/estimator/moduleRegistry.js'),
  '@/components/estimator/customerPricing': F('components/estimator/customerPricing.js'),
  '@/components/estimator/parts/partState': F('components/estimator/parts/partState.js'),
  '@/components/estimator/brick/brickCalc': stub('components/estimator/brick/brickCalc.js'),
  '@/components/estimator/depositGate': stub('components/estimator/depositGate.js'),
  '@/components/estimator/idempotentEntityCreate': stub('components/estimator/idempotentEntityCreate.stub.js'),
  '@/components/estimator/builder/builderMutationRecovery': F('components/estimator/builder/builderMutationRecovery.js'),
  '@/components/vinylEstimator/vinylNestingCalculator': stub('components/vinylEstimator/vinylNestingCalculator.js'),
  '@/components/signMaintenance/maintenanceCalculator': stub('components/signMaintenance/maintenanceCalculator.js'),
  '@/components/workflow/NotificationService': stub('components/workflow/NotificationService.js'),
  '@/functions/generateDocNumber': stub('functions/generateDocNumber.js'),
};

const partSyncStub = F('components/estimator/builder/partSync.stub.js');
const swapPartSync = {
  name: 'swap-part-sync',
  setup(build) {
    build.onResolve({ filter: /^\.\/partSync$/ }, (args) =>
      /builderService/.test(args.importer) ? { path: partSyncStub } : null);
  },
};
const baselineRelocate = {
  name: 'baseline-relocate',
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!/fixture-baseline/.test(args.importer)) return null;
      const relocated = args.importer.replace(/fixture-baseline/, 'fixture');
      const target = resolve(dirname(relocated), args.path);
      if (/\.(js|ts|mjs|jsx)$/.test(target)) return { path: target };
      for (const ext of ['.js', '.ts', '.jsx', '.mjs']) {
        if (existsSync(target + ext)) return { path: target + ext };
      }
      return { path: target };
    });
  },
};

const bundle = (entry, out, plugins = []) => build({
  entryPoints: [resolve(here, entry)],
  bundle: true, format: 'esm', outfile: resolve(here, out),
  logLevel: 'silent', alias, plugins, define: { 'import.meta.env': '{}' },
});

await bundle('fixture/src/components/estimator/builder/builderService.js', '.tmp-svc-cand.mjs', [swapPartSync]);
await bundle('fixture-baseline/src/components/estimator/builder/builderService.js', '.tmp-svc-base.mjs', [swapPartSync, baselineRelocate]);
await bundle('fixture/src/components/estimator/builder/partSync.js', '.tmp-partSync.mjs');
await bundle('fixture-baseline/src/components/estimator/builder/partSync.js', '.tmp-partSync-base.mjs', [baselineRelocate]);
await bundle('fixture/src/components/estimator/builder/sourceProjectPersistence.js', '.tmp-srcpersist.mjs');
await bundle('fixture/src/components/estimator/foundation/foundationBuilderRecovery.js', '.tmp-recovery.mjs');
await bundle('fixture/src/components/estimator/workOrderConversion.js', '.tmp-wo.mjs');
await bundle('fixture/src/components/estimator/builder/builderMutationRecovery.js', '.tmp-mutrec.mjs');
await bundle('fixture/src/components/estimator/estimateMutationGuard.js', '.tmp-mutguard.mjs');
await bundle('fixture/src/components/estimator/estimateCreationService.js', '.tmp-create-cand.mjs');
await bundle('fixture-baseline/src/components/estimator/estimateCreationService.js', '.tmp-create-base.mjs', [baselineRelocate]);
await bundle('fixture/entries/quoteSurface.js', '.tmp-quote.mjs');

const imp = (f) => import(pathToFileURL(resolve(here, f)).href);
const svcC = await imp('.tmp-svc-cand.mjs');
const svcB = await imp('.tmp-svc-base.mjs');
const partSync = await imp('.tmp-partSync.mjs');
const partSyncB = await imp('.tmp-partSync-base.mjs');
const srcPersist = await imp('.tmp-srcpersist.mjs');
const recovery = await imp('.tmp-recovery.mjs');
const wo = await imp('.tmp-wo.mjs');
const mutrec = await imp('.tmp-mutrec.mjs');
const mutguard = await imp('.tmp-mutguard.mjs');
const createC = await imp('.tmp-create-cand.mjs');
const createB = await imp('.tmp-create-base.mjs');
const quote = await imp('.tmp-quote.mjs');
const syncC = await imp('candidates/foundationSyncRecovery.js');
const syncB = await imp('fixture-baseline/src/components/estimator/foundation/foundationSyncRecovery.js');
const assembly = await imp('fixture/src/components/estimator/foundation/foundationAssemblyModel.js');

// ---------- shared store helpers ----------
const E = () => globalThis.__ccsEntities;
const resetStore = () => { globalThis.__ccsEntities = new Map(); globalThis.__ccsPartSync = null; };
const seed = (entity, row) => {
  const t = E().get(entity) || E().set(entity, new Map()).get(entity);
  t.set(row.id, JSON.parse(JSON.stringify(row)));
  return row;
};
const all = (entity) => [...(E().get(entity) || new Map()).values()];
const get = (entity, id) => (E().get(entity) || new Map()).get(id);
let clock = 0;
globalThis.__ccsNow = () => `2026-11-05T12:00:${String(++clock % 60).padStart(2, '0')}.000Z`;
const { staffEntities } = await imp('fixture/src/components/staff/staffEntities.js');

const report = { cases: [], generated: new Date().toISOString() };
const ok = async (name, fn) => {
  try { await fn(); report.cases.push({ name, ok: true }); console.log('ok  -', name); }
  catch (e) { report.cases.push({ name, ok: false, error: String(e?.message || e) }); console.log('FAIL-', name, ':', String(e?.message || e).slice(0, 500)); }
};
const throws = async (fn, re) => {
  try { await fn(); } catch (e) { if (!re || re.test(e.message)) return e; throw new Error(`threw unexpected: ${e.message}`); }
  throw new Error('did not throw');
};

// ---------- synthetic records ----------
const FOUNDATION_TOTALS = {
  total_concrete_cost: 1200, total_rebar_cost: 400, total_excavation_cost: 300,
  total_forming_materials_cost: 150, total_labor_cost: 900, total_wall_cost: 2500,
  total_pole_cost: 600, total_pole_painting_cost: 200, total_equipment_cost: 350,
  total_wall_cap_cost: 450, total_signage_cabinet_cost: 380, total_landscape_cost: 70,
};
const SPLIT_SUM = Object.values(FOUNDATION_TOTALS).reduce((a, b) => a + b, 0); // 7500

const makeSource = (over = {}) => ({
  id: 'src-f1', project_name: 'Monument A', module_key: 'foundation',
  updated_date: '2026-11-05T10:00:00.000Z',
  items: [{
    component_id: 'itm-1', description: 'Footing A', quantity: 2,
    concrete_cost: 800, include_rebar: true, rebar_cost: 400, rebar_feet: 100, rebar_rate: 4,
    include_forming: true, forming_cost: 150, forming_qty: 40, forming_rate: 3.75,
    excavation_cost: 300, pouring_cost: 200, finishing_cost: 250, labor_cost: 900,
  }],
  walls: [{
    component_id: 'wal-1', wall_type: 'block', name: 'North wall',
    calculatedCosts: {
      materialCost: 1500, internalMaterialCost: 600, mortarCost: 220, laborCost: 400,
      internalMortarCost: 110, internalLaborCost: 280, totalBricks: 300, internalTotalBricks: 120,
    },
    shape: { segments: [{ component_id: 'seg-1', length_ft: 10 }] },
  }],
  poles: [{
    component_id: 'pol-1', pole_id: 'pole-inv-1', foundation_component_id: 'itm-1',
    height_inches: 240, pole_cost: 600, pole_painting_cost: 200,
    signs: [{ component_id: 'sgn-1' }],
  }],
  wall_caps: [{
    id: 'cap-1', component_id: 'cap-c1', cap_inventory_id: 'cap-inv-1', cost: 450,
    wall_component_id: 'wal-1', segment_component_id: 'seg-1',
  }],
  signage_cabinets: [{ id: 'cab-1', component_id: 'cab-c1', description: 'ID', quantity: 1, unit_cost: 380, mount: 'pole', pole_component_id: 'pol-1' }],
  landscape: { cell_size_inches: 12, cells: { a: 'grass' } },
  selected_equipment: [{ equipment_id: 'eq-1', name: 'Auger', quantity: 1, rate: 350, equipment_cost: 350 }],
  ...FOUNDATION_TOTALS,
  builder_calculation: { totals: { section_total: SPLIT_SUM } },
  ...over,
});

const makeEstimate = (over = {}) => ({
  id: 'est-A', estimate_number: 1001, status: 'draft', deleted: false,
  updated_date: '2026-11-05T09:00:00.000Z',
  line_items: [{
    line_id: 'ln-1', module_key: 'foundation', project_id: 'src-f1',
    builder_product_id: 'bp-1', builder_name: 'Concrete | Masonry | Poles',
    client_product_name: 'Monument sign', project_name: 'Monument A',
    total_snapshot: SPLIT_SUM, live_total_snapshot: SPLIT_SUM,
    customer_price_snapshot: 11000, live_customer_price_snapshot: 11000,
    customer_quantity: 1, price_state: 'current',
    updated_date_snapshot: '2026-11-05T10:00:00.000Z',
  }],
  quote_total: 11000, total_cost: SPLIT_SUM,
  ...over,
});

const makeBuilder = (over = {}) => ({
  id: 'bp-1', estimate_id: 'est-A', estimate_line_id: 'ln-1', module_key: 'foundation',
  source_project_id: 'src-f1', price_state: 'current',
  frozen_cost: SPLIT_SUM, frozen_customer_price: 11000, current_recalculated_cost: SPLIT_SUM,
  builder_version: 3, part_count: 4, detached_part_count: 0,
  updated_date: '2026-11-05T09:30:00.000Z',
  ...over,
});

const receipt = (over = {}) => ({
  schema_version: 1, key: 'foundation_sync-abc123',
  source_project_id: 'src-f1', estimate_id: 'est-A',
  requested_at: '2026-11-05T10:00:01.000Z', ...over,
});

// =========================================================================
// A. Source save -> reopen contracts (CAS + receipts)
// =========================================================================
await ok('A1 updateBuilderSourceProject CAS save persists exact record incl. receipt', async () => {
  resetStore();
  const attempt = syncC.createFoundationSyncAttempt({
    sourceId: 'src-f1', estimateId: 'est-A', key: 'foundation_sync-k1', requestedAt: '2026-11-05T10:00:01.000Z',
  });
  const base = makeSource();
  seed('FoundationProject', base);
  const patch = { ...makeSource({ updated_date: undefined }), builder_sync_attempt: attempt };
  delete patch.updated_date;
  const saved = await srcPersist.updateBuilderSourceProject({
    entity: staffEntities.FoundationProject, sourceId: 'src-f1',
    expectedUpdatedAt: base.updated_date, data: patch, estimateId: '',
    label: 'Foundation project',
  });
  assert.equal(saved.id, 'src-f1');
  // Reopen path reads the exact persisted row (get() -> staffDataRead point read).
  const reopened = await staffEntities.FoundationProject.get('src-f1');
  assert.deepEqual(reopened, saved);
  assert.equal(reopened.builder_sync_attempt.key, attempt.key);
  assert.equal(syncC.validateFoundationSyncAttempt(reopened.builder_sync_attempt), true);
  assert.ok(reopened.updated_date !== base.updated_date, 'write bumped the version');
});

await ok('A2 [RED] stale source write (expectedUpdatedAt behind) is rejected, row untouched', async () => {
  resetStore();
  seed('FoundationProject', makeSource({ updated_date: '2026-11-05T11:00:00.000Z', items: [{ component_id: 'itm-9' }] }));
  await throws(() => srcPersist.updateBuilderSourceProject({
    entity: staffEntities.FoundationProject, sourceId: 'src-f1',
    expectedUpdatedAt: '2026-11-05T10:00:00.000Z', data: { project_name: 'Renamed' },
    label: 'Foundation project',
  }), /changed in another session/);
  const row = await staffEntities.FoundationProject.get('src-f1');
  assert.equal(row.project_name, 'Monument A');
  assert.equal(row.items[0].component_id, 'itm-9');
});

await ok('A3 idempotent retry: updateMany lost response but row already matches -> reuse', async () => {
  resetStore();
  const base = makeSource({ project_name: 'Renamed' });
  seed('FoundationProject', base);
  const flaky = { ...staffEntities.FoundationProject, updateMany: async () => ({ updated: 0 }) };
  const saved = await srcPersist.updateBuilderSourceProject({
    entity: flaky, sourceId: 'src-f1', expectedUpdatedAt: '2026-11-05T10:00:00.000Z',
    data: { project_name: 'Renamed' }, label: 'Foundation project',
  });
  assert.equal(saved.project_name, 'Renamed');
});

await ok('A4 assertFoundationBuilderAcknowledgment passes only on the saved revision', async () => {
  const src = makeSource({ updated_date: '2026-11-05T12:34:00.000Z' });
  const line = { module_key: 'foundation', project_id: 'src-f1', updated_date_snapshot: '2026-11-05T12:34:00.000Z' };
  syncC.assertFoundationBuilderAcknowledgment({ sourceProject: src, estimateId: 'est-A', line });
  assert.throws(() => syncC.assertFoundationBuilderAcknowledgment({
    sourceProject: src, estimateId: 'est-A', line: { ...line, updated_date_snapshot: 'stale' },
  }), /not yet synchronized/);
  assert.throws(() => syncC.assertFoundationBuilderAcknowledgment({
    sourceProject: src, estimateId: 'est-A',
    line: { ...line, price_acceptance_pending: { key: 'k' } },
  }), /not yet synchronized/);
});

// =========================================================================
// B. Receipt save-gate (G2)
// =========================================================================
const baselineGate = (project, estimateId) => {
  const prior = project.builder_sync_attempt;
  if (prior != null) {
    const gate = syncB.validateFoundationSyncAttempt(prior)
      && prior.source_project_id === project.id
      && (!!estimateId && prior.estimate_id === estimateId);
    if (!gate) throw new Error('An unrecognised Builder sync receipt blocks saving. Reload and retry.');
  }
  return true;
};

await ok('B1 no prior receipt -> save gate passes', async () => {
  const r = await syncC.resolveFoundationSyncReceiptForSave({ project: makeSource(), estimateId: 'est-A' });
  assert.equal(r.ok, true); assert.equal(r.clearStaleReceipt, false);
});

await ok('B2 receipt naming THIS estimate -> gate passes (pending op is ours)', async () => {
  const r = await syncC.resolveFoundationSyncReceiptForSave({
    project: makeSource({ builder_sync_attempt: receipt() }), estimateId: 'est-A',
    getEstimate: () => { throw new Error('must not probe same-context receipts'); },
  });
  assert.equal(r.ok, true);
});

await ok('B3 receipt naming a live other estimate -> blocked (recover there first)', async () => {
  const r = await syncC.resolveFoundationSyncReceiptForSave({
    project: makeSource({ builder_sync_attempt: receipt({ estimate_id: 'est-B' }) }),
    estimateId: 'est-A',
    getEstimate: async () => ({ id: 'est-B' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /different estimate/);
});

await ok('B4 [RED] orphaned receipt (named estimate deleted) -> baseline bricks, candidate retires', async () => {
  const proj = makeSource({ builder_sync_attempt: receipt({ estimate_id: 'est-B' }) });
  const gone404 = async () => { throw Object.assign(new Error('Record not found.'), { status: 404 }); };
  // Baseline inline gate: standalone and linked contexts both block forever.
  assert.throws(() => baselineGate(proj, ''), /unrecognised Builder sync receipt/);
  assert.throws(() => baselineGate(proj, 'est-A'), /unrecognised Builder sync receipt/);
  // Candidate: definitively absent -> ok + clear flag; caller writes null via CAS.
  const r1 = await syncC.resolveFoundationSyncReceiptForSave({ project: proj, estimateId: '', getEstimate: gone404 });
  assert.deepEqual(r1, { ok: true, clearStaleReceipt: true });
  const r2 = await syncC.resolveFoundationSyncReceiptForSave({ project: proj, estimateId: 'est-A', getEstimate: gone404 });
  assert.deepEqual(r2, { ok: true, clearStaleReceipt: true });
});

await ok('B5 malformed receipt -> blocked as unrecognised', async () => {
  for (const bad of [
    { schema_version: 2, key: 'k', source_project_id: 'src-f1', estimate_id: 'est-A', requested_at: '2026-11-05T10:00:00Z' },
    receipt({ source_project_id: 'src-OTHER' }),
    receipt({ key: 'x'.repeat(300) }),
    receipt({ requested_at: 'not-a-date' }),
  ]) {
    const r = await syncC.resolveFoundationSyncReceiptForSave({
      project: makeSource({ builder_sync_attempt: bad }), estimateId: 'est-A', getEstimate: async () => null,
    });
    assert.equal(r.ok, false, JSON.stringify(bad).slice(0, 80));
    assert.match(r.error, /unrecognised/);
  }
});

await ok('B6 probe failure (non-404) -> stays blocked, fail closed', async () => {
  const r = await syncC.resolveFoundationSyncReceiptForSave({
    project: makeSource({ builder_sync_attempt: receipt({ estimate_id: 'est-B' }) }),
    estimateId: 'est-A',
    getEstimate: async () => { throw Object.assign(new Error('rate limited'), { status: 429 }); },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /could not be verified/);
});

await ok('B7 [RED] CAS-retired receipt: orphaned receipt cleared + save lands atomically', async () => {
  resetStore();
  const proj = makeSource({ builder_sync_attempt: receipt({ estimate_id: 'est-B' }) });
  seed('FoundationProject', proj);
  const gate = await syncC.resolveFoundationSyncReceiptForSave({
    project: proj, estimateId: '', getEstimate: async () => { throw Object.assign(new Error('nf'), { status: 404 }); },
  });
  assert.equal(gate.clearStaleReceipt, true);
  const data = { project_name: 'Renamed', ...(gate.clearStaleReceipt ? { builder_sync_attempt: null } : {}) };
  const saved = await srcPersist.updateBuilderSourceProject({
    entity: staffEntities.FoundationProject, sourceId: 'src-f1',
    expectedUpdatedAt: proj.updated_date, data, label: 'Foundation project',
  });
  assert.equal(saved.builder_sync_attempt, null);
  assert.equal(saved.project_name, 'Renamed');
});

// =========================================================================
// C. sourceProjectTotal / foundationRecordSavedTotal (G1)
// =========================================================================
await ok('C1 [RED] grand_total:null poisons baseline to $0; candidate keeps the partition', () => {
  const line = { module_key: 'foundation', total_snapshot: 9999 };
  const rec = { ...FOUNDATION_TOTALS, grand_total: null };
  assert.equal(svcB.sourceProjectTotal(line, rec), 0, 'baseline returns poisoned $0');
  assert.equal(svcC.sourceProjectTotal(line, rec), SPLIT_SUM);
  assert.equal(svcB.foundationRecordSavedTotal(rec), 0, 'baseline saved-total poisoned too');
  assert.equal(svcC.foundationRecordSavedTotal(rec), SPLIT_SUM);
});

await ok('C2 [RED] stale foreign grand_total undercounts extras; candidate trusts partition', () => {
  const line = { module_key: 'foundation' };
  const rec = { ...FOUNDATION_TOTALS, grand_total: 5000 };
  assert.equal(svcB.sourceProjectTotal(line, rec), 5000);
  assert.equal(svcC.sourceProjectTotal(line, rec), SPLIT_SUM);
});

await ok('C3 grand_total-only legacy record still works (last-resort fallback)', () => {
  const rec = { grand_total: 6400 };
  assert.equal(svcC.sourceProjectTotal({ module_key: 'foundation' }, rec), 6400);
  assert.equal(svcC.foundationRecordSavedTotal(rec), 6400);
  assert.equal(svcB.sourceProjectTotal({ module_key: 'foundation' }, rec), 6400);
});

await ok('C4 normal persisted record -> identical totals both builds', () => {
  const rec = makeSource();
  assert.equal(svcC.sourceProjectTotal({ module_key: 'foundation' }, rec), SPLIT_SUM);
  assert.equal(svcB.sourceProjectTotal({ module_key: 'foundation' }, rec), SPLIT_SUM);
  assert.equal(svcC.foundationRecordSavedTotal(rec), SPLIT_SUM);
  assert.equal(svcB.foundationRecordSavedTotal(rec), SPLIT_SUM);
});

await ok('C5 no totals at all -> saved-total is null, live path falls back to line snapshot', () => {
  assert.equal(svcC.foundationRecordSavedTotal({}), null);
  assert.equal(svcC.foundationRecordSavedTotal(null), null);
  assert.equal(svcC.sourceProjectTotal({ module_key: 'foundation', total_snapshot: 42 }, {}), 0);
  assert.equal(svcC.sourceProjectTotal({ module_key: 'foundation', total_snapshot: 42, live_total_snapshot: 77 }, null), 77);
});

// =========================================================================
// D. recordBuilderSave handoff (G3 + CAS guards)
// =========================================================================
await ok('D1 handoff preserves refs + writes acknowledged snapshots', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate());
  seed('BuilderProduct', makeBuilder());
  const saved = makeSource({ updated_date: '2026-11-05T12:00:00.000Z' });
  const result = await svcC.recordBuilderSave({
    estimateId: 'est-A', line: { project_id: 'src-f1', module_key: 'foundation' },
    sourceProject: saved, liveTotal: SPLIT_SUM + 500, customerPrice: 12000,
  });
  const ackLine = result?.line || result;
  assert.equal(ackLine.project_id, 'src-f1');
  assert.equal(ackLine.line_id, 'ln-1');
  assert.equal(ackLine.builder_product_id, 'bp-1');
  assert.equal(ackLine.updated_date_snapshot, '2026-11-05T12:00:00.000Z');
  assert.equal(ackLine.live_total_snapshot, SPLIT_SUM + 500);
  assert.equal(ackLine.live_customer_price_snapshot, 12000);
  // Persisted to the estimate row via CAS:
  const est = await staffEntities.AllInOneEstimate.get('est-A');
  const line = est.line_items.find((l) => l.project_id === 'src-f1');
  assert.equal(line.updated_date_snapshot, '2026-11-05T12:00:00.000Z');
  // Page-level acknowledgment assertion would pass on this line:
  syncC.assertFoundationBuilderAcknowledgment({ sourceProject: saved, estimateId: 'est-A', line });
  // BuilderProduct carries the new source snapshot:
  const bp = await staffEntities.BuilderProduct.get('bp-1');
  assert.equal(bp.builder_snapshot_source_updated_date, '2026-11-05T12:00:00.000Z');
  assert.equal(bp.current_recalculated_cost, SPLIT_SUM + 500);
});

await ok('D2 [RED] hint resolving to no estimate line: baseline mints orphan BP, candidate throws clean', async () => {
  // Baseline: line removed between load and save -> orphan BuilderProduct + throw.
  resetStore();
  seed('AllInOneEstimate', makeEstimate({ line_items: [] }));
  await throws(() => svcB.recordBuilderSave({
    estimateId: 'est-A', line: { project_id: 'src-f1', module_key: 'foundation' },
    sourceProject: makeSource(), liveTotal: SPLIT_SUM,
  }));
  const orphans = all('BuilderProduct');
  assert.equal(orphans.length, 1, 'baseline left an orphan BuilderProduct');
  assert.equal(orphans[0].estimate_id, 'est-A');
  assert.equal(orphans[0].source_project_id, 'src-f1');
  const estAfter = await staffEntities.AllInOneEstimate.get('est-A');
  assert.ok(!estAfter.line_items.some((l) => l.builder_product_id === orphans[0].id), 'orphan never lands in line_items');

  // Candidate: throws before any write, no orphan.
  resetStore();
  seed('AllInOneEstimate', makeEstimate({ line_items: [] }));
  await throws(() => svcC.recordBuilderSave({
    estimateId: 'est-A', line: { project_id: 'src-f1', module_key: 'foundation' },
    sourceProject: makeSource(), liveTotal: SPLIT_SUM,
  }), /no longer part of the estimate/);
  assert.equal(all('BuilderProduct').length, 0, 'candidate mints no orphan');
});

await ok('D3 [CAS guard] estimate changed mid-handoff -> line write rejected', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate());
  seed('BuilderProduct', makeBuilder());
  globalThis.__ccsPartSync = {
    onSync: () => {
      // A concurrent session edits the estimate's watched line_items between
      // the builder CAS and the line-item CAS.
      const t = E().get('AllInOneEstimate'); const row = t.get('est-A');
      t.set('est-A', {
        ...row, updated_date: '2026-11-05T09:59:59.999Z',
        line_items: row.line_items.map((l) => ({ ...l, total_snapshot: 1 })),
      });
    },
  };
  await throws(() => svcC.recordBuilderSave({
    estimateId: 'est-A', line: { project_id: 'src-f1', module_key: 'foundation' },
    sourceProject: makeSource({ updated_date: '2026-11-05T12:00:00.000Z' }), liveTotal: SPLIT_SUM,
  }), /another session|changed repeatedly/i);
});

await ok('D4 [CAS guard] foreign pending marker blocks, removal marker explains', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate({
    line_items: [{
      ...makeEstimate().line_items[0],
      price_acceptance_pending: { key: 'K1', kind: 'builder_product_remove', estimate_id: 'est-A', builder_product_id: 'bp-1', started_at: '2026-11-05T09:50:00.000Z' },
    }],
  }));
  seed('BuilderProduct', makeBuilder());
  await throws(() => svcC.recordBuilderSave({
    estimateId: 'est-A', line: { project_id: 'src-f1', module_key: 'foundation' },
    sourceProject: makeSource(), liveTotal: SPLIT_SUM,
  }), /being removed/);

  await throws(() => svcC.recordBuilderSave({
    estimateId: 'est-A', line: { project_id: 'src-f1', module_key: 'foundation' },
    sourceProject: makeSource(), liveTotal: SPLIT_SUM, expectedPendingKey: 'OTHER',
  }), /pending Builder operation changed/);
});

// =========================================================================
// E. loadFoundationBuilderRecovery identity checks
// =========================================================================
const pendingLine = (over = {}) => ({
  ...makeEstimate().line_items[0],
  price_acceptance_pending: {
    key: 'K9', kind: 'builder_manual_part_edit', estimate_id: 'est-A',
    builder_product_id: 'bp-1', estimate_line_id: 'ln-1',
    line_patch: { updated_date_snapshot: '2026-11-05T10:00:00.000Z' },
    started_at: '2026-11-05T09:55:00.000Z', ...over,
  },
});

await ok('E1 recovery loads when pending + receipt + source version all match', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate({ line_items: [pendingLine()] }));
  seed('FoundationProject', makeSource({ builder_sync_attempt: receipt() }));
  const r = await recovery.loadFoundationBuilderRecovery({
    sourceId: 'src-f1', estimateId: 'est-A', expectedSourceVersion: '2026-11-05T10:00:00.000Z',
  });
  assert.equal(r.pendingKey, 'K9');
  assert.equal(r.sourceProject.id, 'src-f1');
});

await ok('E2 [RED] receipt naming another estimate -> recovery refused', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate({ line_items: [pendingLine()] }));
  seed('FoundationProject', makeSource({ builder_sync_attempt: receipt({ estimate_id: 'est-B' }) }));
  await throws(() => recovery.loadFoundationBuilderRecovery({
    sourceId: 'src-f1', estimateId: 'est-A', expectedSourceVersion: '2026-11-05T10:00:00.000Z',
  }), /receipt does not match/);
});

await ok('E3 [RED] source saved again since the pending op -> recovery refused', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate({ line_items: [pendingLine()] }));
  seed('FoundationProject', makeSource({ updated_date: '2026-11-05T11:30:00.000Z', builder_sync_attempt: receipt() }));
  await throws(() => recovery.loadFoundationBuilderRecovery({
    sourceId: 'src-f1', estimateId: 'est-A', expectedSourceVersion: '2026-11-05T11:30:00.000Z',
  }), /different Foundation source revision/);
});

await ok('E4 [RED] pending marker belonging to a different estimate -> refused', async () => {
  resetStore();
  seed('AllInOneEstimate', makeEstimate({ line_items: [pendingLine({ estimate_id: 'est-B' })] }));
  seed('FoundationProject', makeSource({ builder_sync_attempt: receipt() }));
  await throws(() => recovery.loadFoundationBuilderRecovery({
    sourceId: 'src-f1', estimateId: 'est-A', expectedSourceVersion: '2026-11-05T10:00:00.000Z',
  }), /does not match this Foundation Product/);
});

await ok('E5 [RED] linked estimate deleted -> recovery refuses (fail closed)', async () => {
  resetStore();
  seed('FoundationProject', makeSource({ builder_sync_attempt: receipt() }));
  await throws(() => recovery.loadFoundationBuilderRecovery({
    sourceId: 'src-f1', estimateId: 'est-A', expectedSourceVersion: '2026-11-05T10:00:00.000Z',
  }));
});

// =========================================================================
// F. extractFoundation key stability across save/copy round-trips
// =========================================================================
const extractCatalogs = { FoundationInventory: { rows: [], byId: new Map() }, LaborServiceInventory: { rows: [], byId: new Map() } };
const partKeys = (project) => partSync.extractBuilderParts('foundation', project, extractCatalogs).map((p) => p.part_key).sort();
const createId = (() => { let n = 0; return (kind) => `${kind}-clone-${++n}`; })();

await ok('F1 extract keys stable: original vs clone (component_id remap preserves pattern)', async () => {
  const src = makeSource();
  const before = partKeys(src);
  assert.ok(before.length >= 10, `expected a real BOM, got ${before.length} keys: ${before.join(',')}`);
  const { components } = assembly.cloneFoundationComponents(src, { createId });
  const cloned = { ...src, ...components };
  const after = partKeys(cloned);
  assert.deepEqual(after, before, 'part key set must survive the copy/remap round-trip');
});

await ok('F2 clone remaps component_id + every cross-reference consistently', () => {
  const src = makeSource();
  const { components, idMap } = assembly.cloneFoundationComponents(src, { createId });
  const oldIds = new Set(['itm-1', 'wal-1', 'seg-1', 'pol-1', 'sgn-1', 'cap-c1', 'cab-c1']);
  const newIds = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  components.items.forEach((i) => newIds.add(i.component_id));
  components.walls.forEach((w) => { newIds.add(w.component_id); (w.shape?.segments || []).forEach((s) => newIds.add(s.component_id)); });
  components.poles.forEach((p) => { newIds.add(p.component_id); (p.signs || []).forEach((s) => newIds.add(s.component_id)); });
  components.wall_caps.forEach((c) => newIds.add(c.component_id));
  components.signage_cabinets.forEach((c) => newIds.add(c.component_id));
  for (const id of newIds) assert.ok(!oldIds.has(id), `clone reused old id ${id}`);
  // Every remapped cross-reference lands on a cloned row — no dangling refs.
  const pole = components.poles[0];
  assert.ok(newIds.has(pole.foundation_component_id), 'pole foundation ref remapped');
  assert.ok(components.items.some((i) => i.component_id === pole.foundation_component_id), 'pole ref resolves');
  const cap = components.wall_caps[0];
  assert.ok(components.walls.some((w) => w.component_id === cap.wall_component_id), 'cap wall ref resolves');
  assert.ok(components.walls[0].shape.segments.some((s) => s.component_id === cap.segment_component_id), 'cap segment ref resolves');
  const cab = components.signage_cabinets[0];
  assert.ok(components.poles.some((p) => p.component_id === cab.pole_component_id), 'cabinet pole ref resolves');
  assert.equal(idMap.size, oldIds.size, 'every old component id was remapped');
});

await ok('F3 save -> reopen (get) -> extract = identical keys', async () => {
  resetStore();
  const proj = makeSource();
  seed('FoundationProject', proj);
  const reopened = await staffEntities.FoundationProject.get('src-f1');
  assert.deepEqual(partKeys(reopened), partKeys(proj));
});

await ok('F4 [RED] malformed persisted subsections: baseline crashes, candidate degrades to no rows', () => {
  const crashBaseline = [
    { items: null, walls: 'x', poles: [null], wall_caps: {}, selected_equipment: 'y', signage_cabinets: [null], landscape: null },
    { items: 'corrupt', walls: {}, poles: 'x', wall_caps: [null], selected_equipment: [null, 42], signage_cabinets: 's', project_concrete_admixtures: 'adm-1' },
    { items: [undefined, { component_id: null }], signage_cabinets: [{ quantity: 'q' }], landscape: { cells: 'nope' } },
  ];
  for (const proj of crashBaseline) {
    // Baseline throws on non-array subsections — getSourceProject feeds the raw
    // persisted row straight into this extractor during estimate reconcile.
    assert.throws(() => partSyncB.extractBuilderParts('foundation', proj, extractCatalogs));
    const parts = partSync.extractBuilderParts('foundation', proj, extractCatalogs);
    assert.ok(Array.isArray(parts));
    parts.forEach((p) => assert.ok(Number.isFinite(Number(p.extended_cost ?? 0)), `non-finite part cost on ${p.part_key}`));
  }
  // A sparse/empty/absent record is fine on both builds — assert no regression.
  for (const proj of [{}, { items: [], walls: [] }, null]) {
    for (const mod of [partSync, partSyncB]) {
      const parts = mod.extractBuilderParts('foundation', proj, extractCatalogs);
      assert.ok(Array.isArray(parts));
    }
  }
});

// =========================================================================
// G. Quote/revision/WO cost consistency (uses real computePricing chain)
// =========================================================================
await ok('G1 quote surface prices the acknowledged snapshot (customer_price_snapshot)', () => {
  const est = makeEstimate();
  const pricing = quote.computePricing(est);
  const section = pricing.sections.find((s) => s.line_id === 'ln-1');
  assert.equal(section.unitRaw, 11000);
  assert.equal(section.adjusted, 11000);
  const rows = quote.buildCustomerQuoteRows(est, pricing);
  const row = rows.find((r) => r.key === 'ln-1');
  assert.equal(row?.amount, 11000);
});

await ok('G2 WO seed preserves refs + costs from the acknowledged line', async () => {
  resetStore();
  const est = makeEstimate();
  const pricing = quote.computePricing(est);
  const parts = [
    { id: 'pt-1', builder_product_id: 'bp-1', estimate_line_id: 'ln-1', part_key: 'foundation:item:0:concrete', internal_cost: 700, quantity: 1, active: true },
  ];
  const products = wo.buildEstimateWorkOrderProducts(est, { ...pricing, parts });
  assert.equal(products.length, 1);
  const p = products[0];
  assert.equal(p.estimate_line_id, 'ln-1');
  assert.equal(p.builder_product_id, 'bp-1');
  assert.equal(p.source_project_id, 'src-f1');
  assert.equal(p.module_key, 'foundation');
  assert.equal(p.quoted_unit_price, 11000, 'WO quoted price = acknowledged customer snapshot');
  assert.equal(p.quoted_total, 11000);
  const lineParts = wo.resolveEstimateLineParts(est.line_items[0], parts);
  assert.equal(lineParts.length, 1);
  assert.equal(lineParts[0].part_key, 'foundation:item:0:concrete');
  // Fallback resolution by builder_product_id when estimate_line_id is absent:
  const legacy = wo.resolveEstimateLineParts({ line_id: 'ln-1', builder_product_id: 'bp-1' }, [
    { id: 'pt-2', builder_product_id: 'bp-1', part_key: 'foundation:pole:0' },
  ]);
  assert.equal(legacy.length, 1);
});

await ok('G3 revision-snapshot fields survive round-trip on the estimate row', async () => {
  resetStore();
  const est = makeEstimate();
  seed('AllInOneEstimate', est);
  const before = await staffEntities.AllInOneEstimate.get('est-A');
  const snapshot = JSON.parse(JSON.stringify(before));
  await staffEntities.AllInOneEstimate.update('est-A', { status: 'sent' });
  const after = await staffEntities.AllInOneEstimate.get('est-A');
  assert.deepEqual(
    after.line_items.map((l) => [l.line_id, l.project_id, l.builder_product_id, l.total_snapshot, l.customer_price_snapshot]),
    snapshot.line_items.map((l) => [l.line_id, l.project_id, l.builder_product_id, l.total_snapshot, l.customer_price_snapshot]),
    'whole-estimate revision snapshots carry refs+costs byte-identical',
  );
});

// =========================================================================
// H. Merge pending-marker transplant (G4)
// =========================================================================
await ok('H1 [RED] merge of pending secondary line locks primary + marker unresumable', async () => {
  const picked = [{
    ...makeEstimate().line_items[0],
    line_id: 'ln-sec', project_id: 'src-f9', builder_product_id: 'bp-9',
    price_acceptance_pending: { key: 'KX', kind: 'builder_initial_freeze', estimate_id: 'est-B', builder_product_id: 'bp-9', started_at: new Date().toISOString() },
  }];
  // Baseline merge copies the line verbatim -> primary estimate gains a
  // foreign pending marker.
  const primary = makeEstimate({ line_items: [...makeEstimate().line_items, ...picked] });
  const entry = mutguard.getPendingEstimatePriceAcceptance(primary);
  assert.ok(entry, 'transplanted marker blocks the primary estimate');
  assert.equal(entry.pending.estimate_id, 'est-B', 'marker owned by the archived estimate -> never resumable');
  await throws(() => mutguard.assertEstimateProductMutationAllowed(primary, {}), /still being recovered/);
  // Candidate guard refuses the merge before any copy happens.
  assert.throws(() => mutrec.assertNoPendingLinesForCopy(picked, 'merging them into this estimate'), /Resume it on this estimate/);
});

await ok('H2 clean secondary lines pass the merge guard', () => {
  assert.doesNotThrow(() => mutrec.assertNoPendingLinesForCopy(makeEstimate().line_items, 'merging'));
  assert.doesNotThrow(() => mutrec.assertNoPendingLinesForCopy([], 'merging'));
});

await ok('H3 [RED] duplicate transplants pending marker verbatim; candidate refuses', () => {
  const pendingLine = {
    ...makeEstimate().line_items[0],
    price_acceptance_pending: { key: 'KD', kind: 'builder_initial_freeze', estimate_id: 'est-A', builder_product_id: 'bp-1', started_at: new Date().toISOString() },
  };
  const src = makeEstimate({ line_items: [pendingLine] });
  // Baseline: clone carries the marker into the new estimate verbatim.
  const clone = createB.buildDuplicateEstimate(src);
  assert.ok(mutrec.pendingBuilderMutation(clone.line_items[0]), 'baseline clone kept the foreign marker');
  assert.ok(mutguard.getPendingEstimatePriceAcceptance(clone), 'clone is locked by the transplanted marker');
  // Candidate: buildDuplicateEstimate throws before any copy leaves the gate.
  assert.throws(() => createC.buildDuplicateEstimate(src), /Resume it on this estimate/);
});

await ok('H4 [RED] split of a pending picked line refused; unpicked pending does not block', () => {
  const pendingLn = {
    ...makeEstimate().line_items[0], line_id: 'ln-p',
    price_acceptance_pending: { key: 'KS', kind: 'builder_manual_part_edit', estimate_id: 'est-A', builder_product_id: 'bp-1', started_at: new Date().toISOString() },
  };
  const cleanLn = { ...makeEstimate().line_items[0], line_id: 'ln-c', project_id: 'src-f2', builder_product_id: 'bp-2' };
  const src = makeEstimate({ line_items: [pendingLn, cleanLn] });
  // Picked the pending line -> baseline clones it; candidate refuses.
  const pickedPending = createB.buildSplitEstimate(src, { lineItemIds: ['ln-p'] });
  assert.ok(mutrec.pendingBuilderMutation(pickedPending.line_items[0]), 'baseline split cloned the marker');
  assert.throws(() => createC.buildSplitEstimate(src, { lineItemIds: ['ln-p'] }), /Resume it on this estimate/);
  // Picked only the clean line -> split allowed on both builds.
  for (const mod of [createB, createC]) {
    const split = mod.buildSplitEstimate(src, { lineItemIds: ['ln-c'] });
    assert.equal(split.line_items.length, 1);
    assert.equal(split.line_items[0].line_id, 'ln-c');
    assert.equal(split.split_from_estimate_id, 'est-A');
  }
});

// =========================================================================
const failed = report.cases.filter((c) => !c.ok);
writeFileSync(resolve(here, 'verify-handoff-results.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.cases.length - failed.length}/${report.cases.length} cases passed`);
if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join(' | ')); process.exit(1); }
console.log('PASS verify-handoff');
