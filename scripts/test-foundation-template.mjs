import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;export const AlertTriangle=()=>null;export const X=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>(globalThis.__tplSave||((x)=>({id:'t1',...x.data})))(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{globalThis.__deletes.push(a);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(globalThis.__tplLoad)return globalThis.__tplLoad();if(globalThis.__tplLoadErr)throw globalThis.__tplLoadErr;return globalThis.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);export const ensureIdempotentEntityCreate=(...a)=>(globalThis.__ensureIdempotent||((x)=>x))(...a);`,
};
const plugin = { name: 'stubs', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: a.path, namespace: 'stub' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js' }));
}};
const mk = async (entry, out) => {
  const r = await esbuild.build({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-test-renderer'] });
  fs.writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(path.resolve(out)).href);
};
fs.mkdirSync('.audit-work/foundation-template05', { recursive: true });
const dlgMod = await mk('src/components/estimator/foundation/FoundationTemplateDialog.jsx', '.audit-work/foundation-template05/dlg.bundle.mjs');
const svcMod = await mk('src/components/estimator/foundation/foundationTemplateService.js', '.audit-work/foundation-template05/svc.bundle.mjs');
const model = await import('../src/components/estimator/foundation/foundationTemplateModel.js');
const presetMod = await mk('src/components/estimator/foundation/foundationAssemblyPresets.js', '.audit-work/foundation-template05/presets.bundle.mjs');
const { FOUNDATION_ASSEMBLY_PRESETS, foundationAssemblyPresetTemplateData } = presetMod;
const { createFoundationTemplateSnapshot, prepareFoundationTemplatePatch, FOUNDATION_TEMPLATE_FIELDS } = model;
const Dialog = dlgMod.default;
const { deleteFoundationTemplate, saveFoundationTemplate } = svcMod;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
let idc = 0;
const nid = (k) => `${k}_${++idc}`;

const rich = () => ({
  id: 'p1', project_name: 'X', customer_id: 'c1', updated_date: 'v1',
  items: [{ id: 'i0', description: 'F', quantity: 2 }],
  walls: [{ id: 'w0', shape: { points: [{ x: 0, z: 0 }, { x: 96, z: 0 }], closed: false, segments: [{ length: 96 }] } }],
  wall_caps: [{ wall_index: 0, segment_index: 0, cap_inventory_id: 'cap_1' }],
  poles: [{ id: 'po0', foundation_index: 1, signs: [{ label: 'S' }] }],
  signage_cabinets: [{ mount: 'foundation', foundation_index: 0 }, { mount: 'pole', pole_index: 0 }],
  selected_equipment: [{ id: 'eq1' }],
  project_concrete_type: 'bagged',
  project_concrete_admixtures: ['fiber'],
  excavation_method: 'auger',
  selected_concrete_id: 'bag_1',
  landscape: { beds: [{ plant: 'boxwood' }] },
  ai_engineering_recommendation: 'consult engineer',
  ai_engineering_data: { notes: 'draft annotation' },
  notes: 'customer prefers morning pour',
  builder_sync_attempt: { key: 'r1' },
  totals: { grand_total: 999 },
  status: 'accepted',
});

await ok('snapshot: full design roundtrip, excludes identity/receipt/pricing', async () => {
  const src = rich();
  const snap = createFoundationTemplateSnapshot(src, { createId: nid });
  assert.equal(snap.assembly_schema_version, 1);
  for (const k of ['items','walls','poles','wall_caps','signage_cabinets','selected_equipment','landscape','ai_engineering_recommendation','ai_engineering_data','project_concrete_type','project_concrete_admixtures','excavation_method','selected_concrete_id','notes']) assert.ok(snap[k] !== undefined, k);
  for (const k of ['id','project_name','customer_id','updated_date','builder_sync_attempt','totals','status']) assert.equal(snap[k], undefined, k);
  assert.notEqual(snap.items[0], src.items[0], 'deep clone');
  src.items[0].description = 'mutated';
  assert.equal(snap.items[0].description, 'F', 'input immutability');
});

await ok('snapshot JSON roundtrip preserves structure', async () => {
  const snap = createFoundationTemplateSnapshot(rich(), { createId: nid });
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

await ok('patch: fresh IDs, remapped refs, external refs dangling, immutability', async () => {
  const snap = createFoundationTemplateSnapshot(rich(), { createId: nid });
  const before = JSON.stringify(snap);
  const patch = prepareFoundationTemplatePatch(snap, { createId: nid });
  assert.equal(JSON.stringify(snap), before, 'input untouched');
  const iid = patch.items.map(i => i.component_id), wid = patch.walls.map(w => w.component_id);
  assert.ok(iid.every(Boolean) && wid.every(Boolean));
  assert.ok(wid.includes(patch.wall_caps[0].wall_component_id), 'cap->wall remapped');
  assert.ok(patch.walls[0].shape.segments.map(s => s.component_id).includes(patch.wall_caps[0].segment_component_id), 'cap->segment remapped');
  assert.ok(iid.includes(patch.signage_cabinets[0].foundation_component_id));
  assert.equal(patch.signage_cabinets[1].pole_component_id, patch.poles[0].component_id);
  assert.equal(patch.wall_index, undefined);
  const orig = createFoundationTemplateSnapshot(rich(), { createId: nid });
  const p2 = prepareFoundationTemplatePatch(orig, { createId: nid });
  const origIds = JSON.parse(JSON.stringify(orig));
  assert.ok(!origIds.items.some(i => i.component_id && p2.items.some(n => n.component_id === i.component_id)) || origIds.items.every(i => !i.component_id), 'fresh ids differ from originals when present');
  const extRef = prepareFoundationTemplatePatch({ poles: [{ id: 'p', component_id: 'pp', foundation_component_id: 'missing_parent' }] }, { createId: nid });
  assert.equal(extRef.poles[0].pole_component_id === 'missing_parent' || extRef.poles[0].foundation_component_id === 'missing_parent', true, 'external dangling ref preserved, not retargeted');
});

await ok('patch: partial fields retain target arrays (no fabricated empties)', async () => {
  const patch = prepareFoundationTemplatePatch({ items: [{ id: 'x', component_id: 'itm_1' }], notes: 'n' }, { createId: nid });
  assert.equal(patch.items.length, 1);
  for (const k of ['walls','poles','wall_caps','signage_cabinets','landscape']) assert.equal(patch[k], undefined, k);
});

await ok('future version / non-record rejected without mutation', async () => {
  assert.throws(() => prepareFoundationTemplatePatch({ assembly_schema_version: 2, items: [] }, { createId: nid }), /unsupported/);
  assert.throws(() => prepareFoundationTemplatePatch(null, { createId: nid }), /record/);
  assert.throws(() => createFoundationTemplateSnapshot('x'), /record/);
});

await ok('allowlist is shared and exact', async () => {
  assert.deepEqual([...FOUNDATION_TEMPLATE_FIELDS].sort(), ["ai_engineering_data","ai_engineering_recommendation","beautify_data_url","concrete_cost_per_cy","customer_markup_percent","customer_price_override","customer_pricing","equipment_excavation_cost_per_cy","equipment_excavation_labor_rate","excavation_method","finishing_labor_rate","forming_labor_rate","forming_materials_cost_pillar","forming_materials_cost_spread_foot","hand_dig_excavation_cost_per_cy","hand_dig_labor_rate","hyperlink","items","landscape","min_excavation_time_hours","notes","poles","pouring_labor_rate","project_concrete_admixtures","project_concrete_type","rebar_cost_per_ft","selected_concrete_id","selected_equipment","signage_cabinets","wall_caps","walls"].sort());
});

// ---- dialog tests ----
const mountDlg = async (props = {}) => {
  globalThis.__tplRows = props.rows ?? []; globalThis.__tplLoadErr = props.loadErr ?? null; globalThis.__tplSave = null;
  globalThis.__deletes = []; globalThis.__tplLoad = null;
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(Dialog, { open: true, mode: 'load', onClose: () => { globalThis.__closed = true; }, project: rich(), onApply: () => true, ...props }));
  });
  await flush();
  const alerts = () => c.root.findAll(el => el?.props?.role === 'alert').map(el => el.props.children);
  const btn = (label) => c.root.findAll(el => el?.props?.children === label).map(el => el.props);
  // The load view lists O-094 assembly presets first, then saved templates;
  // Apply lookups are scoped to their section so the two lists never mix.
  const section = (heading) => c.root.findAll(el => el.type === 'div' && (el.children || []).some(ch => ch?.type === 'p'
    && (Array.isArray(ch.props?.children) ? ch.props.children : [ch.props?.children]).includes(heading)));
  const inSection = (heading, label) => section(heading).flatMap(s => s.findAll(el => el?.props?.children === label).map(el => el.props));
  const tplBtn = (label) => inSection('Saved templates', label);
  const presetBtn = (label) => inSection('Start from an assembly preset', label);
  return { c, alerts, btn, tplBtn, presetBtn, cleanup: async () => act(async () => { c.unmount(); }) };
};

await ok('dialog: save builds full snapshot data + single flight', async () => {
  const calls = []; let d;
  const m = await mountDlg({ mode: 'save' });
  globalThis.__tplSave = (a) => { calls.push(a); return new Promise(r => { d = r; }); };
  const inp = m.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'My T' } }); });
  let p1, p2;
  await act(async () => { p1 = m.btn('Save Template')[0].onClick(); p2 = m.btn('Save Template')[0].onClick(); });
  await act(async () => { d({ id: 't9' }); await p1; await p2; });
  assert.equal(calls.length, 1, 'single flight');
  const pd = calls[0].data.project_data;
  assert.ok(pd.items?.length && pd.signage_cabinets?.length && pd.landscape && pd.ai_engineering_data && pd.assembly_schema_version === 1, 'full snapshot incl cabinets/landscape/AI/version');
  assert.equal(pd.builder_sync_attempt, undefined);
  await m.cleanup();
});

await ok('dialog: lost-reply retry same key+data; name change => new key', async () => {
  const calls = []; let fail = true;
  const m = await mountDlg({ mode: 'save' });
  globalThis.__tplSave = (a) => { calls.push(a); return fail ? Promise.reject(new Error('lost')) : Promise.resolve({ id: 't1' }); };
  const inp = m.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'K' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.ok(m.alerts().length > 0, 'save failure surfaced');
  fail = false;
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey, 'retry same key');
  assert.deepEqual(calls[1].data, calls[0].data);
  globalThis.__closed = false;
  // same mounted dialog: name change => new key
  const m2 = await mountDlg({ mode: 'save' });
  globalThis.__tplSave = (a) => { calls.push(a); return Promise.resolve({ id: 't1' }); };
  const inp2 = m2.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp2.props.onChange({ target: { value: 'K' } }); });
  await act(async () => { await m2.btn('Save Template')[0].onClick(); });
  const kFirst = calls[2].idempotencyKey;
  await act(async () => { inp2.props.onChange({ target: { value: 'K2' } }); });
  await act(async () => { await m2.btn('Save Template')[0].onClick(); });
  assert.notEqual(calls[3].idempotencyKey, kFirst, 'name change in same mounted dialog -> new key');
  // project content change (same id) => new signature/key/data
  globalThis.__closed = false;
  const projB = { ...rich(), notes: 'changed content' };
  const m3 = await mountDlg({ mode: 'save', project: projB });
  globalThis.__tplSave = (a) => { calls.push(a); return Promise.resolve({ id: 't1' }); };
  const inp3 = m3.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp3.props.onChange({ target: { value: 'K' } }); });
  await act(async () => { await m3.btn('Save Template')[0].onClick(); });
  assert.notDeepEqual(calls[4].data, calls[2].data, 'changed project -> new data');
  await m.cleanup(); await m2.cleanup(); await m3.cleanup();
});

await ok('dialog: load failure visible + retry; failed delete keeps row', async () => {
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: { items: [] } }] });
  assert.equal(m.tplBtn('Apply').length, 1);
  globalThis.__tplGet = () => Promise.reject(Object.assign(new Error('server'), { status: 500 }));
  await act(async () => { m.c.root.findAll(el => el?.props?.onClick && typeof el.props.onClick === 'function' && el.props.className?.includes('hover:text-red-600'))[0].props.onClick(); });
  assert.equal(m.tplBtn('Apply').length, 1, 'row retained after failed delete');
  assert.ok(m.alerts().length >= 1, 'delete error visible');
  await m.cleanup();
  const mL2 = await mountDlg({ loadErr: new Error('load fail') });
  assert.ok(mL2.btn('Retry').length === 1, 'retry affordance shown after load failure');
  globalThis.__tplLoadErr = null;
  globalThis.__tplRows = [{ id: 't9', template_name: 'B', project_data: {} }];
  await act(async () => { mL2.btn('Retry')[0].onClick(); });
  await flush();
  assert.equal(mL2.tplBtn('Apply').length, 1, 'retry reloads rows');
  await mL2.cleanup();
});

await ok('dialog: O-094 assembly presets listed; apply rides onApply with the exact preset template data', async () => {
  assert.ok(FOUNDATION_ASSEMBLY_PRESETS.length >= 1, 'preset catalog is non-empty');
  let got = null; globalThis.__closed = false;
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: { items: [] } }], onApply: (data) => { got = data; return true; } });
  assert.equal(m.presetBtn('Apply').length, FOUNDATION_ASSEMBLY_PRESETS.length, 'one Apply per preset');
  assert.equal(m.tplBtn('Apply').length, 1, 'saved-template rows listed separately');
  await act(async () => { m.presetBtn('Apply')[0].onClick(); });
  assert.deepEqual(got, foundationAssemblyPresetTemplateData(FOUNDATION_ASSEMBLY_PRESETS[0]), 'exact preset data');
  assert.equal(globalThis.__closed, true, 'accepted preset closes');
  globalThis.__closed = false;
  const r = await mountDlg({ onApply: () => false });
  await act(async () => { r.presetBtn('Apply')[0].onClick(); });
  assert.equal(globalThis.__closed, false, 'rejected preset keeps dialog open');
  assert.ok(r.alerts().length >= 1, 'rejection surfaced');
  await m.cleanup(); await r.cleanup();
});

await ok('dialog: save is blocked with the page-supplied reason while pricing is unavailable', async () => {
  let calls = 0; globalThis.__tplSave = () => { calls++; return Promise.resolve({ id: 't1' }); };
  const m = await mountDlg({ mode: 'save', saveDisabled: true, saveDisabledReason: 'Pricing unavailable: test reason' });
  const reason = m.c.root.findAll(el => el.type === 'p' && el.props?.children === 'Pricing unavailable: test reason');
  assert.equal(reason.length, 1, 'reason rendered');
  const save = m.btn('Save Template')[0];
  assert.equal(save.disabled, true, 'Save Template disabled');
  await act(async () => { await save.onClick?.(); });
  assert.equal(calls, 0, 'no save request while disabled');
  await m.cleanup();
});

await ok('dialog: apply rejection stays open; apply success closes', async () => {
  globalThis.__closed = false;
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: { items: [{ id: 'x' }] } }], onApply: () => false });
  await act(async () => { m.tplBtn('Apply')[0].onClick(); });
  assert.equal(globalThis.__closed, false, 'rejected apply keeps dialog open');
  assert.ok(m.alerts().length >= 1, 'rejection surfaced');
  const m2 = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }], onApply: () => true });
  globalThis.__closed = false;
  await act(async () => { m2.tplBtn('Apply')[0].onClick(); });
  assert.equal(globalThis.__closed, true, 'accepted apply closes');
  await m.cleanup(); await m2.cleanup();
});

await ok('dialog: genuinely deferred old load cannot overwrite reopened project context', async () => {
  const pending = [];
  globalThis.__tplLoad = () => new Promise(resolve => pending.push(resolve));
  const a = rich(), b = { ...rich(), id: 'p2' };
  const props = { open: true, mode: 'load', onClose: () => {}, project: a, onApply: () => true };
  let c;
  try {
    await act(async () => { c = TestRenderer.create(React.createElement(Dialog, props)); });
    assert.equal(pending.length, 1);
    await act(async () => { c.update(React.createElement(Dialog, { ...props, open: false })); });
    await act(async () => { c.update(React.createElement(Dialog, { ...props, project: b })); });
    assert.equal(pending.length, 2);
    await act(async () => { pending[1]([{ id: 'new', template_name: 'NEW', project_data: {} }]); });
    await act(async () => { pending[0]([{ id: 'old', template_name: 'OLD', project_data: {} }]); });
    assert.equal(c.root.findAll(el => el.props.children === 'NEW').length, 1);
    assert.equal(c.root.findAll(el => el.props.children === 'OLD').length, 0);
  } finally {
    globalThis.__tplLoad = null;
    if (c) await act(async () => { c.unmount(); });
  }
});

await ok('dialog: two pending retries resolve backwards; only latest rows survive', async () => {
  const m = await mountDlg({ loadErr: new Error('load failed') });
  const pending = [];
  globalThis.__tplLoad = () => new Promise(resolve => pending.push(resolve));
  const retry = m.btn('Retry')[0].onClick;
  try {
    await act(async () => { retry(); retry(); });
    assert.equal(pending.length, 2, 'both reads genuinely pending');
    await act(async () => { pending[1]([{ id: 'new', template_name: 'NEW', project_data: {} }]); });
    await act(async () => { pending[0]([{ id: 'old', template_name: 'OLD', project_data: {} }]); });
    assert.equal(m.c.root.findAll(el => el.props.children === 'NEW').length, 1);
    assert.equal(m.c.root.findAll(el => el.props.children === 'OLD').length, 0);
    assert.equal(m.alerts().length, 0, 'successful retry clears old error');
  } finally { globalThis.__tplLoad = null; await m.cleanup(); }
});

await ok('dialog: delayed save after project-context switch does not close; stale handler zero calls', async () => {
  const calls = [];
  let d;
  globalThis.__tplSave = (a) => { calls.push(a); return new Promise(r => { d = r; }); };
  let c; let closed = 0;
  const proj1 = rich();
  await act(async () => { c = TestRenderer.create(React.createElement(Dialog, { open: true, mode: 'save', onClose: () => { closed += 1; }, project: proj1, onApply: () => true })); });
  await flush();
  const inp = () => c.root.findAll(el => el?.props?.value !== undefined)[0];
  const saveBtn = () => c.root.findAll(el => el?.props?.children === 'Save Template').map(el => el.props)[0];
  await act(async () => { inp().props.onChange({ target: { value: 'T' } }); });
  const oldSave = saveBtn().onClick;
  // capture handler from THIS render, then switch project context before it resolves
  let p1;
  await act(async () => { p1 = oldSave(); });
  await act(async () => { c.update(React.createElement(Dialog, { open: true, mode: 'save', onClose: () => { closed += 1; }, project: { ...rich(), id: 'p2' }, onApply: () => true })); });
  await act(async () => { d?.({ id: 'late' }); await p1; });
  assert.equal(closed, 0, 'stale-context save completion never closes newer dialog');
  assert.equal(saveBtn().disabled, false, 'new context is not stuck busy after old save');
  // stale handler invoked from new context: no service call
  const n0 = calls.length;
  await act(async () => { await oldSave(); });
  assert.equal(calls.length, n0, 'stale handler zero service calls');
  await act(async () => { c.unmount(); });
});

await ok('dialog: stale same-context draft handlers do not save an older name or project', async () => {
  const calls = [];
  const source = rich();
  const m = await mountDlg({ mode: 'save', project: source });
  globalThis.__tplSave = async a => { calls.push(a); throw new Error('retry'); };
  try {
    const input = () => m.c.root.findAll(el => el.type === 'input')[0];
    await act(async () => { input().props.onChange({ target: { value: 'First' } }); });
    const oldNameSave = m.btn('Save Template')[0].onClick;
    await act(async () => { input().props.onChange({ target: { value: 'Second' } }); });
    await act(async () => { await oldNameSave(); });
    assert.equal(calls.length, 0);
    const oldProjectSave = m.btn('Save Template')[0].onClick;
    const next = { ...source, notes: 'new design' };
    await act(async () => { m.c.update(React.createElement(Dialog, {
      open: true, mode: 'save', project: next, onClose: () => {}, onApply: () => true,
    })); });
    await act(async () => { await oldProjectSave(); });
    assert.equal(calls.length, 0);
    await act(async () => { await m.btn('Save Template')[0].onClick(); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.template_name, 'Second');
    assert.equal(calls[0].data.project_data.notes, 'Preliminary estimating only - final engineering required\n\nnew design');
  } finally { await m.cleanup(); }
});

await ok('dialog: source edit during save keeps newer draft open and retryable', async () => {
  const m = await mountDlg({ mode: 'save' });
  let finish, closed = 0;
  globalThis.__tplSave = () => new Promise(resolve => { finish = resolve; });
  try {
    await act(async () => { m.c.root.findByType('input').props.onChange({ target: { value: 'Original' } }); });
    let flight;
    await act(async () => { flight = m.btn('Save Template')[0].onClick(); });
    await act(async () => { m.c.update(React.createElement(Dialog, {
      open: true, mode: 'save', project: { ...rich(), notes: 'new edit' },
      onClose: () => { closed++; }, onApply: () => true,
    })); });
    await act(async () => { finish({ id: 'saved' }); await flight; });
    assert.equal(closed, 0);
    assert.equal(m.btn('Save Template')[0].disabled, false);
    assert.ok(m.alerts().some(s => String(s).includes('Current changes have not been saved')));
  } finally { await m.cleanup(); }
});

await ok('dialog: stale apply/delete callbacks after close or unmount have no effects', async () => {
  let applied = 0, reads = 0, confirmations = 0;
  const confirm = window.confirm;
  const m = await mountDlg({
    rows: [{ id: 't1', template_name: 'A', project_data: {} }],
    onApply: () => { applied++; return true; },
  });
  globalThis.__tplGet = async () => { reads++; return { id: 't1' }; };
  window.confirm = () => { confirmations++; return true; };
  const apply = m.tplBtn('Apply')[0].onClick;
  const remove = m.c.root.findAll(el => el.type === 'button' && el.props.className?.includes('hover:text-red-600'))[0].props.onClick;
  try {
    await act(async () => { m.c.update(React.createElement(Dialog, {
      open: false, mode: 'load', project: rich(), onClose: () => {},
      onApply: () => { applied++; return true; },
    })); });
    await act(async () => { apply(); await remove(); });
    await m.cleanup();
    await act(async () => { apply(); await remove(); });
    assert.deepEqual([applied, reads, confirmations], [0, 0, 0]);
    assert.equal(globalThis.__deletes.length, 0);
  } finally { window.confirm = confirm; }
});

await ok('service delete: 404 absent ok, 500 propagates, wrong-id throws, normal CAS delete', async () => {
  globalThis.__deletes = [];
  globalThis.__tplGet = () => Promise.reject(Object.assign(new Error('nf'), { status: 404 }));
  assert.equal(await deleteFoundationTemplate('t9'), true);
  globalThis.__tplGet = () => Promise.reject(Object.assign(new Error('srv'), { status: 500 }));
  await assert.rejects(() => deleteFoundationTemplate('t9'), /srv/);
  globalThis.__tplGet = () => Promise.resolve({ id: 'other' });
  await assert.rejects(() => deleteFoundationTemplate('t9'), /verified/);
  globalThis.__tplGet = () => Promise.resolve(null);
  await assert.rejects(() => deleteFoundationTemplate('t9'), /verified/);
  globalThis.__tplGet = () => Promise.resolve([]);
  await assert.rejects(() => deleteFoundationTemplate('t9'), /verified/);
  globalThis.__tplGet = () => Promise.resolve({ id: 't9', template_name: 'T' });
  assert.equal(await deleteFoundationTemplate('t9'), true);
  assert.equal(globalThis.__deletes.length, 1, 'exactly one CAS delete on verified record');
  assert.equal(globalThis.__deletes[0].record.template_name, 'T', 'CAS used loaded record');
});

console.log(`PASS template passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
