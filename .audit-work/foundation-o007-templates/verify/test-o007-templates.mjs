// O-007 (CMP-A07) template/copy round-trip remainder — candidate verification.
// Bundles the CANDIDATE foundationTemplateModel from
// .audit-work/foundation-o007-templates/candidates (never local src/) with the
// unchanged remote-baseline foundationAssemblyModel dep. The dialog is
// unchanged at HEAD (O-014), so it is bundled from baseline with the model
// dep redirected to the CANDIDATE so save-path snapshots exercise the new
// allowlist. Page edits are verified by esbuild syntax + mount/payload
// source assertions.
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const UNIT = '.audit-work/foundation-o007-templates';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const CAND_PAGE = `${UNIT}/candidates/src/pages`;
const BASE = `${UNIT}/baseline`;

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>(globalThis.__tplSave||((x)=>({id:'t1',...x.data})))(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{globalThis.__deletes.push(a);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(globalThis.__tplLoad)return globalThis.__tplLoad();if(globalThis.__tplLoadErr)throw globalThis.__tplLoadErr;return globalThis.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);export const ensureIdempotentEntityCreate=(...a)=>(globalThis.__ensureIdempotent||((x)=>x))(...a);`,
};

const REDIRECT = {
  './foundationAssemblyModel': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationAssemblyModel.js': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  // The baseline dialog imports the model relatively; point it at the
  // CANDIDATE model so the dialog save path exercises the new allowlist.
  './foundationTemplateModel': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationTemplateModel.js': path.resolve(`${CAND}/foundationTemplateModel.js`),
};

const plugin = { name: 'stubs', setup(b) {
  b.onResolve({ filter: /.*/ }, a => {
    if (STUBS[a.path]) return { path: a.path, namespace: 'stub' };
    if (REDIRECT[a.path]) return { path: REDIRECT[a.path] };
    return undefined;
  });
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js' }));
}};

const mk = async (entry, out) => {
  const r = await esbuild.build({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-test-renderer'] });
  fs.writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(path.resolve(out)).href);
};

fs.mkdirSync(`${UNIT}/verify`, { recursive: true });
const model = await mk(`${CAND}/foundationTemplateModel.js`, `${UNIT}/verify/model.candidate.bundle.mjs`);
const dlgMod = await mk(`${BASE}/FoundationTemplateDialog.jsx`, `${UNIT}/verify/dlg.baseline.bundle.mjs`);
const { createFoundationTemplateSnapshot, prepareFoundationTemplatePatch, FOUNDATION_TEMPLATE_FIELDS } = model;
const Dialog = dlgMod.default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

let idSeq = 0;
const ids = (kind) => `${kind}_${idSeq++}`;

// A fully-populated source project covering every allowlisted field plus
// forbidden identity/receipt/derived fields that must never carry.
const fullProject = () => ({
  id: 'src-proj-1',
  project_name: 'Source',
  client_name: 'Cust A',
  customer_id: 'cust-A',
  estimate_number: 'E-100',
  updated_date: '2026-11-01T00:00:00Z',
  created_date: '2026-10-01T00:00:00Z',
  status: 'calculated',
  creation_request_key: 'crk-src',
  builder_sync_attempt: { schema_version: 1, key: 'sync1', source_project_id: 'src-proj-1', estimate_id: 'e1', requested_at: 't' },
  concrete_delivery_snapshot: { version: 1, concrete_total: 500, trucks: [{ yards: 9 }] },
  pricing_engine: { customer_tier: 2, default_markup_pct: 30 },
  total_concrete_cost: 999, total_rebar_cost: 88, total_wall_cost: 77, total_signage_cabinet_cost: 66, total_landscape_cost: 55,

  hyperlink: 'https://plans.example.com/site-A.pdf',
  beautify_data_url: 'data:image/png;base64,AAAA',
  customer_markup_percent: 18,
  customer_price_override: 12345,
  customer_pricing: { applied: true, tier_number: 3, tier_name: 'Gold', total: 7777, raw_subtotal: 5000, lines: [{ label: 'L1', cost: 5000 }], saved_at: 'x' },
  notes: 'design notes',
  ai_engineering_recommendation: 'prelim text',
  ai_engineering_data: { review_status: 'preliminary_only', engineering_approved: false, information_gaps: ['g'], model: 'm', policy_version: 'v', source_key: 'k', generated_at: 't' },
  project_concrete_type: '4000psi',
  project_concrete_admixtures: ['fiber'],
  excavation_method: 'hand_dig',
  selected_concrete_id: 'conc-1',
  landscape: { cell_size_inches: 24, cells: { '0,0': 'mulch', '1,0': 'grass' } },
  selected_equipment: [{ equipment_id: 'eq-1', rental_period: 'day', rental_duration: 2, include_delivery: true, equipment_cost: 100 }],
  concrete_cost_per_cy: 155, rebar_cost_per_ft: 0.9,
  forming_materials_cost_spread_foot: 0.6, forming_materials_cost_pillar: 0.8,
  min_excavation_time_hours: 2, hand_dig_excavation_cost_per_cy: 12,
  equipment_excavation_cost_per_cy: 17, forming_labor_rate: 57,
  pouring_labor_rate: 62, finishing_labor_rate: 52,
  hand_dig_labor_rate: 47, equipment_excavation_labor_rate: 37,

  items: [{ component_id: 'it1', foundation_type: 'spread_foot', quantity: 2, length_inches: 36, width_inches: 36, depth_inches: 12, reinforcement_calculation_version: 2, reinforcement_design: { version: 2, cover_inches: { side: 3, top: 3, bottom: 3 }, supports: { mode: 'auto' }, spread: { mats: [{ id: 'm1', bearing_elevation_inches: 3, max_spacing_x_inches: 10, max_spacing_z_inches: 10 }], inter_mat_ties: [{ id: 't1', from_mat_id: 'm1', to_mat_id: 'm1', x_inches: 5, z_inches: 5, cut_length_inches: 9 }] }, pillar: { hoops: null, longitudinal: null } } }],
  walls: [{ component_id: 'w1', name: 'Wall', heightInches: 24, materialId: 'brick-1', shape: { points: [{ x: 0, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 96 }], closed: false, segments: [{ component_id: 'seg1' }, { component_id: 'seg2' }] }, calculatedCosts: { totalBricks: 10, totalCost: 50 } }],
  poles: [{ component_id: 'p1', foundation_component_id: 'it1', foundation_idx: 0, height_inches: 240, signs: [{ component_id: 'sg1', face: 'A' }] }],
  wall_caps: [{ component_id: 'c1', wall_component_id: 'w1', segment_component_id: 'seg2', wall_index: 0, segment_index: 1, cap_inventory_id: 'cap-1', length_inches: 24 }],
  signage_cabinets: [{ component_id: 'sc1', mount: 'pole', pole_component_id: 'p1', pole_index: 0, foundation_component_id: '', description: 'Cab', unit_cost: 300 }],
});

// ---------- model: allowlist coverage ----------

await ok('snapshot captures every allowlisted field incl. links, AI brief, pricing settings, rates', async () => {
  const snap = createFoundationTemplateSnapshot(fullProject(), { createId: ids });
  for (const k of FOUNDATION_TEMPLATE_FIELDS) assert.ok(k in snap, `missing ${k}`);
  assert.equal(snap.hyperlink, 'https://plans.example.com/site-A.pdf');
  assert.equal(snap.beautify_data_url, 'data:image/png;base64,AAAA');
  assert.equal(snap.customer_markup_percent, 18);
  assert.equal(snap.customer_price_override, 12345);
  assert.equal(snap.concrete_cost_per_cy, 155);
  assert.equal(snap.equipment_excavation_labor_rate, 37);
  assert.equal(snap.assembly_schema_version, 1);
});

await ok('snapshot excludes identity/customer/quote/receipt/derived/engine fields', async () => {
  const snap = createFoundationTemplateSnapshot(fullProject(), { createId: ids });
  for (const k of ['id', 'updated_date', 'created_date', 'status', 'creation_request_key', 'builder_sync_attempt',
    'client_name', 'customer_id', 'estimate_number', 'pricing_engine', 'concrete_delivery_snapshot',
    'total_concrete_cost', 'total_rebar_cost', 'total_wall_cost', 'total_signage_cabinet_cost', 'total_landscape_cost',
    'project_name']) {
    assert.ok(!(k in snap), `forbidden field carried: ${k}`);
  }
});

await ok('customer_pricing: applied snapshot reduced to selection-only at snapshot AND patch time', async () => {
  const snap = createFoundationTemplateSnapshot(fullProject(), { createId: ids });
  assert.deepEqual(snap.customer_pricing, { applied: true, tier_number: 3 });
  const legacyStored = { ...snap, customer_pricing: { applied: true, tier_number: 3, tier_name: 'Gold', total: 7777, lines: [{ label: 'L' }] } };
  const patch = prepareFoundationTemplatePatch(legacyStored, { createId: ids });
  assert.deepEqual(patch.customer_pricing, { applied: true, tier_number: 3 });
  assert.ok(!('total' in patch.customer_pricing) && !('lines' in patch.customer_pricing));
});

await ok('customer_pricing: non-applied record and null travel verbatim', async () => {
  const p1 = fullProject(); p1.customer_pricing = { applied: false, stale_total: 9 };
  const s1 = createFoundationTemplateSnapshot(p1, { createId: ids });
  assert.deepEqual(s1.customer_pricing, { applied: false, stale_total: 9 });
  const p2 = fullProject(); p2.customer_pricing = null;
  const s2 = createFoundationTemplateSnapshot(p2, { createId: ids });
  assert.equal(s2.customer_pricing, null);
  const patch2 = prepareFoundationTemplatePatch(s2, { createId: ids });
  assert.equal(patch2.customer_pricing, null);
});

await ok('customer_pricing: malformed values fail closed in snapshot and patch', async () => {
  const bad = fullProject(); bad.customer_pricing = 'not-a-record';
  assert.throws(() => createFoundationTemplateSnapshot(bad, { createId: ids }), /customer_pricing must be a record/);
  const bad2 = fullProject(); bad2.customer_pricing = [1, 2];
  assert.throws(() => createFoundationTemplateSnapshot(bad2, { createId: ids }), /customer_pricing must be a record/);
  assert.throws(() => prepareFoundationTemplatePatch({ customer_pricing: 42 }, { createId: ids }), /customer_pricing must be a record/);
});

// ---------- model: full round-trip ----------

await ok('snapshot -> patch -> merge produces deep-equal design state on all covered fields', async () => {
  const src = fullProject();
  const snap = createFoundationTemplateSnapshot(src, { createId: ids });
  // Simulate template round-trip through storage.
  const stored = JSON.parse(JSON.stringify(snap));
  const patch = prepareFoundationTemplatePatch(stored, { createId: ids });
  const target = {
    id: 'dst-proj-9', project_name: 'Target', client_name: 'Cust B', customer_id: 'cust-B',
    estimate_number: 'E-200', hyperlink: 'https://plans.example.com/site-B.pdf',
    customer_markup_percent: 5, items: [], walls: [], poles: [], wall_caps: [], signage_cabinets: [],
  };
  const merged = { ...target, ...patch };
  // Scalar/compound design fields deep-equal source values.
  for (const k of ['hyperlink', 'beautify_data_url', 'notes', 'project_concrete_type', 'project_concrete_admixtures',
    'excavation_method', 'selected_concrete_id', 'landscape', 'selected_equipment',
    'ai_engineering_recommendation', 'ai_engineering_data',
    'customer_markup_percent', 'customer_price_override',
    'concrete_cost_per_cy', 'rebar_cost_per_ft', 'forming_materials_cost_spread_foot',
    'forming_materials_cost_pillar', 'min_excavation_time_hours', 'hand_dig_excavation_cost_per_cy',
    'equipment_excavation_cost_per_cy', 'forming_labor_rate', 'pouring_labor_rate',
    'finishing_labor_rate', 'hand_dig_labor_rate', 'equipment_excavation_labor_rate']) {
    assert.deepEqual(merged[k], src[k], `round-trip mismatch on ${k}`);
  }
  // Customer/quote identity untouched by the apply patch.
  assert.equal(merged.client_name, 'Cust B');
  assert.equal(merged.customer_id, 'cust-B');
  assert.equal(merged.estimate_number, 'E-200');
  // Applied-tier selection traveled; computed snapshot did not.
  assert.deepEqual(merged.customer_pricing, { applied: true, tier_number: 3 });
});

await ok('assembly arrays clone with fresh component_ids; all parent/nested refs remapped consistently', async () => {
  const snap = createFoundationTemplateSnapshot(fullProject(), { createId: ids });
  const patch = prepareFoundationTemplatePatch(JSON.parse(JSON.stringify(snap)), { createId: ids });
  const newItem = patch.items[0];
  assert.notEqual(newItem.component_id, 'it1');
  assert.equal(patch.poles[0].foundation_component_id, newItem.component_id);
  assert.equal(patch.poles[0].foundation_idx, 0);
  assert.notEqual(patch.poles[0].component_id, 'p1');
  assert.notEqual(patch.poles[0].signs[0].component_id, 'sg1');
  assert.equal(patch.poles[0].signs[0].face, 'A');
  const newWall = patch.walls[0];
  assert.notEqual(newWall.component_id, 'w1');
  const newSegIds = newWall.shape.segments.map((s) => s.component_id);
  assert.ok(!newSegIds.includes('seg1') && !newSegIds.includes('seg2'));
  assert.equal(patch.wall_caps[0].wall_component_id, newWall.component_id);
  assert.equal(patch.wall_caps[0].segment_component_id, newSegIds[1]);
  assert.equal(patch.wall_caps[0].segment_index, 1);
  assert.equal(patch.signage_cabinets[0].pole_component_id, patch.poles[0].component_id);
  assert.equal(patch.signage_cabinets[0].pole_index, 0);
});

await ok('accepted design: item reinforcement_design + calculation_version round-trip deep-equal (preserve, never mint)', async () => {
  const src = fullProject();
  const snap = createFoundationTemplateSnapshot(src, { createId: ids });
  const patch = prepareFoundationTemplatePatch(JSON.parse(JSON.stringify(snap)), { createId: ids });
  const it = patch.items[0];
  assert.deepEqual(it.reinforcement_design, src.items[0].reinforcement_design);
  assert.equal(it.reinforcement_calculation_version, 2);
  // Design-internal ids are item-scoped data, not component ids: preserved verbatim.
  assert.equal(it.reinforcement_design.spread.inter_mat_ties[0].from_mat_id, 'm1');
});

await ok('omitted template keys stay absent from patch so the target keeps its own values', async () => {
  const patch = prepareFoundationTemplatePatch({ items: [{ component_id: 'a' }], notes: 'only' }, { createId: ids });
  for (const k of ['walls', 'poles', 'wall_caps', 'signage_cabinets', 'landscape', 'hyperlink', 'beautify_data_url',
    'customer_markup_percent', 'customer_price_override', 'customer_pricing', 'concrete_cost_per_cy']) {
    assert.ok(!(k in patch), `unexpected key ${k}`);
  }
  assert.equal(patch.items.length, 1);
  assert.notEqual(patch.items[0].component_id, 'a');
});

// ---------- model: fail-closed on malformed content ----------

await ok('malformed template content fails closed', async () => {
  assert.throws(() => prepareFoundationTemplatePatch(null, { createId: ids }), /must be a record/);
  assert.throws(() => prepareFoundationTemplatePatch('x', { createId: ids }), /must be a record/);
  assert.throws(() => prepareFoundationTemplatePatch([1], { createId: ids }), /must be a record/);
  assert.throws(() => prepareFoundationTemplatePatch({ assembly_schema_version: 2 }, { createId: ids }), /unsupported assembly version/);
  assert.throws(() => prepareFoundationTemplatePatch({ items: 'not-array' }, { createId: ids }), /must be an array/);
  assert.throws(() => createFoundationTemplateSnapshot('x', { createId: ids }), /must be a record/);
  assert.throws(() => createFoundationTemplateSnapshot({ assembly_schema_version: 9, items: [] }, { createId: ids }), /unsupported assembly version/);
});

await ok('snapshot preserves supplied assembly rows verbatim except normalized ids; non-assembly fields untouched', async () => {
  const src = fullProject();
  const snap = createFoundationTemplateSnapshot(src, { createId: ids });
  assert.deepEqual(snap.items[0].reinforcement_design, src.items[0].reinforcement_design);
  assert.equal(snap.items[0].component_id, 'it1'); // snapshot keeps source ids; fresh mint happens on apply
  assert.deepEqual(snap.landscape, src.landscape);
});

// ---------- dialog render (baseline dialog + candidate model dep) ----------

const projForDialog = () => fullProject();

const mountDlg = async (props = {}) => {
  globalThis.__tplRows = props.rows ?? []; globalThis.__tplLoadErr = props.loadErr ?? null; globalThis.__tplSave = null;
  globalThis.__deletes = []; globalThis.__tplLoad = null; globalThis.__tplGet = async (id) => ({ id, template_name: 'T', updated_date: 'v1' });
  globalThis.__closed = 0; globalThis.__applied = null;
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(Dialog, {
      open: true, mode: 'load', onClose: () => { globalThis.__closed += 1; },
      project: projForDialog(),
      onApply: (d) => { globalThis.__applied = d; return true; },
      ...props,
    }));
  });
  await flush();
  const alerts = () => c.root.findAll(el => el?.props?.role === 'alert').map(el => el.props.children);
  const btn = (label) => c.root.findAll(el => el?.props?.children === label).map(el => el.props);
  const texts = () => JSON.stringify(c.root.findAll(el => typeof el?.props?.children === 'string').map(el => el.props.children));
  return { c, alerts, btn, texts, cleanup: async () => act(async () => { c.unmount(); }) };
};

await ok('dialog save path snapshots the extended allowlist (links + pricing selection + AI brief)', async () => {
  const m = await mountDlg({ mode: 'save' });
  let savedData = null;
  globalThis.__tplSave = (a) => { savedData = a.data; return { id: 't1', ...a.data }; };
  const input = m.c.root.find(el => el.type === 'input');
  await act(async () => { input.props.onChange({ target: { value: 'T1' } }); });
  await act(async () => { m.c.root.findAll(el => el?.props?.children === 'Save Template').forEach(el => el.props.onClick()); });
  await flush();
  const pd = savedData?.project_data;
  assert.ok(pd, 'template project_data captured');
  assert.equal(pd.hyperlink, 'https://plans.example.com/site-A.pdf');
  assert.equal(pd.beautify_data_url, 'data:image/png;base64,AAAA');
  assert.deepEqual(pd.customer_pricing, { applied: true, tier_number: 3 });
  assert.equal(pd.customer_markup_percent, 18);
  assert.equal(pd.concrete_cost_per_cy, 155);
  assert.ok(!('client_name' in pd) && !('customer_id' in pd) && !('pricing_engine' in pd) && !('total_concrete_cost' in pd));
  await m.cleanup();
});

await ok('dialog saveDisabled gate (page passes pricingBlocked || catalogReloading): disabled button + note + zero service calls', async () => {
  let called = 0;
  globalThis.__tplSave = () => { called += 1; return { id: 't2' }; };
  const m = await mountDlg({ mode: 'save', saveDisabled: true, saveDisabledReason: 'Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template.' });
  const saveBtn = m.btn('Save Template')[0];
  assert.equal(saveBtn.disabled, true);
  assert.ok(m.texts().includes('Pricing unavailable'), 'reason note rendered');
  await act(async () => { saveBtn.onClick(); });
  await flush();
  assert.equal(called, 0, 'no service call behind the gate');
  await m.cleanup();
});

await ok('dialog apply path hands stored project_data to onApply verbatim (page prepareFoundationTemplatePatch does the remap)', async () => {
  const stored = { id: 't1', template_name: 'T', project_data: createFoundationTemplateSnapshot(fullProject(), { createId: ids }) };
  const m = await mountDlg({ mode: 'load', rows: [stored] });
  await flush();
  m.btn('Apply')[0].onClick();
  await flush();
  assert.ok(globalThis.__applied?.items?.length === 1);
  assert.equal(globalThis.__applied.customer_pricing.applied, true);
  await m.cleanup();
});

// ---------- page candidate: syntax + wiring assertions ----------

await ok('page candidate parses as JSX and wires the O-014 gate + copy field carry', async () => {
  const src = fs.readFileSync(`${CAND_PAGE}/FoundationEstimator.jsx`, 'utf8');
  await esbuild.transform(src, { loader: 'jsx' });
  assert.ok(/saveDisabled=\{pricingBlocked \|\| catalogReloading\}/.test(src), 'saveDisabled wired to the pricing gate');
  assert.ok(/saveDisabledReason="Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template\."/.test(src));
  for (const f of ['estimate_number: project.estimate_number', 'hyperlink: project.hyperlink', 'beautify_data_url: project.beautify_data_url', 'pricing_engine: project.pricing_engine']) {
    assert.ok(src.includes(f), `copy baseData missing ${f}`);
  }
  // Exactly one mount, one gate — no duplicate wiring.
  assert.equal(src.match(/<FoundationTemplateDialog/g).length, 1);
});

await ok('model candidate parses cleanly and baseline deps still satisfy its imports', async () => {
  const src = fs.readFileSync(`${CAND}/foundationTemplateModel.js`, 'utf8');
  await esbuild.transform(src, { loader: 'js' });
  assert.ok(src.includes('"hyperlink"') && src.includes('"beautify_data_url"') && src.includes('"customer_pricing"'));
  assert.ok(src.includes('sanitizeTemplateCustomerPricing'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { process.exit(1); } else { console.log('PASS o007-templates'); }
