// O-094 (CMP-H03) verification — start-from-assembly presets, duplicate/
// mirror, bulk material change, reusable templates. Bundles the CANDIDATE
// modules (foundationAssemblyPresets, foundationDuplicateMirror,
// foundationBulkMaterialChange) against BASELINE deps
// (foundationAssemblyModel, foundationLayoutModel, foundationTemplateModel,
// foundationPreliminaryNotice, wallCalculator — the real models, not
// replicas), plus the CANDIDATE FoundationTemplateDialog via
// react-test-renderer with the same service/ui stubs the O-119 unit used.
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const UNIT = '.audit-work/foundation-o094-presets';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const BASE = `${UNIT}/baseline`;

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.stack || e.message); } };

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;export const AlertTriangle=()=>null;export const X=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>({id:'t1',...a.data});`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async()=>true;`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(globalThis.__tplLoadErr)throw globalThis.__tplLoadErr;return globalThis.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);`,
  // wallCalculator's calc-path deps — foundationWallSegments itself is pure
  // local math (wallPoint + Math.hypot); these satisfy the module's imports
  // without dragging the inventory/catalog chains into the harness.
  '@/components/masterInventory/inventoryNormalization': `export const inventorySettingValue=(v,d)=>v??d;export const inventoryNonnegativeNumber=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;export const inventoryPositiveNumber=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;export const inventorySettingNumber=(v)=>v??null;export const inventoryPositiveSettingNumber=(v)=>v??null;export const canonicalWallMaterialSubtype=()=>null;export const wallMaterialSubtypeRecorded=()=>false;`,
  './foundationCatalogIntegrity': `export const foundationCatalogRowAvailability=()=>({});`,
};

const REDIRECT = {
  './foundationAssemblyModel': `${BASE}/foundationAssemblyModel.js`,
  './foundationAssemblyModel.js': `${BASE}/foundationAssemblyModel.js`,
  './foundationLayoutModel': `${BASE}/foundationLayoutModel.js`,
  './foundationLayoutModel.js': `${BASE}/foundationLayoutModel.js`,
  './foundationTemplateModel': `${BASE}/foundationTemplateModel.js`,
  './foundationTemplateModel.js': `${BASE}/foundationTemplateModel.js`,
  './foundationPreliminaryNotice': `${BASE}/foundationPreliminaryNotice.js`,
  './foundationPreliminaryNotice.js': `${BASE}/foundationPreliminaryNotice.js`,
  './wallCalculator': `${BASE}/wallCalculator.js`,
  './wallCalculator.js': `${BASE}/wallCalculator.js`,
  './foundationDuplicateMirror': `${CAND}/foundationDuplicateMirror.js`,
  './foundationDuplicateMirror.js': `${CAND}/foundationDuplicateMirror.js`,
  './foundationAssemblyPresets': `${CAND}/foundationAssemblyPresets.js`,
  './foundationAssemblyPresets.js': `${CAND}/foundationAssemblyPresets.js`,
  './foundationTemplateService': `${BASE}/foundationTemplateService.js`,
  './foundationTemplateService.js': `${BASE}/foundationTemplateService.js`,
};

const plugin = { name: 'stubs', setup(b) {
  b.onResolve({ filter: /.*/ }, a => {
    if (STUBS[a.path]) return { path: a.path, namespace: 'stub' };
    if (REDIRECT[a.path]) return { path: path.resolve(REDIRECT[a.path]) };
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
const presets = await mk(`${CAND}/foundationAssemblyPresets.js`, `${UNIT}/verify/presets.candidate.bundle.mjs`);
const dupmir = await mk(`${CAND}/foundationDuplicateMirror.js`, `${UNIT}/verify/dupmir.candidate.bundle.mjs`);
const bulk = await mk(`${CAND}/foundationBulkMaterialChange.js`, `${UNIT}/verify/bulk.candidate.bundle.mjs`);
const model = await mk(`${BASE}/foundationTemplateModel.js`, `${UNIT}/verify/model.baseline.bundle.mjs`);
const dlgMod = await mk(`${CAND}/FoundationTemplateDialog.jsx`, `${UNIT}/verify/dlg.candidate.bundle.mjs`);

const { FOUNDATION_ASSEMBLY_PRESETS, describeFoundationAssemblyPreset, foundationAssemblyPresetTemplateData, applyFoundationAssemblyPreset } = presets;
const { duplicateFoundationAssembly, mirrorFoundationAssembly, appendClonedFoundationAssemblies } = dupmir;
const { FOUNDATION_BULK_MATERIAL_TARGETS, applyFoundationBulkMaterial } = bulk;
const { createFoundationTemplateSnapshot, prepareFoundationTemplatePatch } = model;
const Dialog = dlgMod.default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const containsText = (c, s) => c.root.findAll(el => {
  const ch = el?.props?.children;
  if (typeof ch === 'string') return ch.includes(s);
  if (Array.isArray(ch)) return ch.filter(x => typeof x === 'string').join('').includes(s);
  return false;
}).length > 0;

let idSeq = 0;
const ids = (kind) => `${kind}_t${idSeq++}`;

// fixture project: item it1 with pole p1 + cabinet c1; wall w1 (2 open
// segments) with caps cap1/cap2; extra item it2 (pillar) untouched.
const wallPts = [{ x: 10, z: 10 }, { x: 70, z: 10 }, { x: 70, z: 40 }];
const segs = (pts, closed, pfx) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ component_id: `${pfx}${i}`, length: Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].z - pts[i].z) });
  if (closed && pts.length > 2) out.push({ component_id: `${pfx}${out.length}`, length: Math.hypot(pts[0].x - pts[pts.length-1].x, pts[0].z - pts[pts.length-1].z) });
  return out;
};
const fixture = () => ({
  id: 'fp-1',
  items: [
    { component_id: 'it1', foundation_type: 'spread_foot', description: 'F1', quantity: 1, length_inches: 96, width_inches: 64, depth_inches: 24, rotation_degrees: 30, x_inches: 100, z_inches: 100, selected_concrete_id: 'mix-a', selected_forming_id: 'form-1', custom_concrete_cost_per_cy: 175 },
    { component_id: 'it2', foundation_type: 'pillar', description: 'P1', quantity: 1, diameter: 24, depth_inches: 36, x_inches: 300, z_inches: 200, selected_concrete_id: '', selected_forming_id: 'form-1' },
  ],
  walls: [
    { component_id: 'w1', name: 'W1', heightInches: 18, materialId: 'mat-block', internalMaterialId: 'mat-fill', shape: { points: wallPts, closed: false, segments: segs(wallPts, false, 's') } },
  ],
  poles: [
    { component_id: 'p1', pole_id: 'pole-stl', height_inches: 240, embedment_inches: 48, foundation_component_id: 'it1', foundation_idx: 0, x_inches: 120, z_inches: 110, signs: [{ component_id: 'sg1', sign_id: 'sign-9' }], source_item_component_id: 'it1', migrated_from: 'legacy_item' },
  ],
  wall_caps: [
    { component_id: 'cap1', cap_inventory_id: 'cap-old', wall_component_id: 'w1', wall_index: 0, segment_component_id: 's0', segment_index: 0 },
    { component_id: 'cap2', cap_inventory_id: 'cap-old', wall_component_id: 'w1', wall_index: 0, segment_component_id: 's1', segment_index: 1 },
  ],
  signage_cabinets: [
    { component_id: 'c1', mount: 'pole', pole_component_id: 'p1', pole_index: 0, foundation_component_id: '', width_inches: 72, height_inches: 48, depth_inches: 10, mount_height_inches: 84, quantity: 1, unit_cost: 0 },
  ],
  selected_concrete_id: 'mix-a',
  notes: 'keep me',
});

// ---------- preset catalog ----------

await ok('catalog: 6 named presets, all snapshot-shaped with the 5 assembly arrays + schema v1', async () => {
  assert.equal(FOUNDATION_ASSEMBLY_PRESETS.length, 6);
  for (const p of FOUNDATION_ASSEMBLY_PRESETS) {
    assert.ok(p.preset_key && p.name && p.summary, `preset ${p.preset_key} metadata`);
    const d = p.project_data;
    for (const k of ['items', 'walls', 'poles', 'wall_caps', 'signage_cabinets']) {
      assert.ok(Array.isArray(d[k]), `${p.preset_key}.${k} must be a supplied array (start-from replaces)`);
    }
    assert.equal(d.assembly_schema_version, 1);
  }
});

await ok('catalog: every preset survives the real template gates (snapshot validate + prepare)', async () => {
  for (const p of FOUNDATION_ASSEMBLY_PRESETS) {
    const data = foundationAssemblyPresetTemplateData(p);
    const patch = prepareFoundationTemplatePatch(data, { createId: ids });
    for (const k of ['items', 'walls', 'poles', 'wall_caps', 'signage_cabinets']) {
      assert.ok(Array.isArray(patch[k]), `${p.preset_key}: patch.${k}`);
    }
    // every row id re-minted — preset ids never reach the project
    const srcIds = new Set(JSON.stringify(data).match(/preset_[a-z_0-9]+/g) || []);
    for (const k of ['items', 'walls', 'poles', 'wall_caps', 'signage_cabinets']) {
      for (const r of patch[k]) assert.ok(!srcIds.has(r.component_id), `${p.preset_key}: stale id ${r.component_id}`);
    }
  }
});

await ok('catalog: preset refs remap consistently (pole->item, cap->wall+segment, cabinet->pole)', async () => {
  const data = foundationAssemblyPresetTemplateData('twin-pole-monument');
  const patch = prepareFoundationTemplatePatch(data, { createId: ids });
  const itemIds = new Set(patch.items.map(i => i.component_id));
  for (const p of patch.poles) assert.ok(itemIds.has(p.foundation_component_id), 'pole must anchor a NEW item id');
  const poleIds = new Set(patch.poles.map(p => p.component_id));
  for (const c of patch.signage_cabinets) assert.ok(poleIds.has(c.pole_component_id), 'cabinet must anchor a NEW pole id');
  const mon = prepareFoundationTemplatePatch(foundationAssemblyPresetTemplateData('monument-base-wall-cap'), { createId: ids });
  const wall = mon.walls[0];
  const segIds = new Set(wall.shape.segments.map(s => s.component_id));
  for (const cap of mon.wall_caps) {
    assert.equal(cap.wall_component_id, wall.component_id);
    assert.ok(segIds.has(cap.segment_component_id), 'cap must anchor a NEW segment id');
    assert.ok(Number.isInteger(cap.segment_index) && cap.segment_index >= 0, 'cap segment_index rebuilt');
  }
});

await ok('templateData: deep-cloned (catalog frozen, mutating output cannot corrupt presets)', async () => {
  const a = foundationAssemblyPresetTemplateData('single-spread-footing');
  a.items[0].description = 'MUTATED';
  a.items[0].component_id = 'hacked';
  const b = foundationAssemblyPresetTemplateData('single-spread-footing');
  assert.equal(b.items[0].description, 'Spread footing');
  assert.equal(b.items[0].component_id, 'preset_ssf_item_1');
  assert.throws(() => foundationAssemblyPresetTemplateData('nope'), /unknown preset/);
});

await ok('describe: counts + label for dialog rows', async () => {
  const d = describeFoundationAssemblyPreset('twin-pole-monument');
  assert.equal(d.counts.items, 2);
  assert.equal(d.counts.poles, 2);
  assert.equal(d.counts.signage_cabinets, 2);
  assert.ok(d.counts_label.includes('2 foundations') && d.counts_label.includes('2 poles') && d.counts_label.includes('2 cabinets'), d.counts_label);
});

await ok('applyFoundationAssemblyPreset replace: patch through the prepare gate; merge replaces arrays', async () => {
  const proj = fixture();
  const { patch, summary } = applyFoundationAssemblyPreset(proj, 'pylon-pole-on-pier', { createId: ids });
  assert.equal(summary.mode, 'replace');
  const merged = { ...proj, ...patch };
  assert.equal(merged.items.length, 1, 'preset items replace existing');
  assert.equal(merged.items[0].foundation_type, 'pillar');
  assert.equal(merged.poles.length, 1);
  assert.equal(merged.poles[0].foundation_component_id, merged.items[0].component_id, 'remapped anchor');
  assert.equal(merged.walls.length, 0, 'supplied empty walls clears walls');
  assert.equal(merged.notes, 'keep me', 'non-assembly fields preserved');
  assert.equal(proj.items.length, 2, 'source not mutated');
});

await ok('applyFoundationAssemblyPreset append: clones onto existing rows, refs remapped, indexes rebuilt', async () => {
  const proj = fixture();
  const { patch, summary } = applyFoundationAssemblyPreset(proj, 'twin-pole-monument', { createId: ids, mode: 'append' });
  assert.equal(summary.mode, 'append');
  const merged = { ...proj, ...patch };
  assert.equal(merged.items.length, 4, 'existing items kept + 2 preset items');
  assert.ok(merged.items.slice(0, 2).every((r, i) => r.component_id === ['it1', 'it2'][i]), 'existing ids unchanged');
  assert.equal(merged.poles.length, 3);
  const newPoles = merged.poles.slice(1);
  const newItemIds = new Set(merged.items.slice(2).map(i => i.component_id));
  for (const p of newPoles) assert.ok(newItemIds.has(p.foundation_component_id), 'appended pole anchors appended item');
  const cabs = merged.signage_cabinets;
  assert.equal(cabs.length, 3);
  const newPoleIds = new Set(newPoles.map(p => p.component_id));
  for (const c of cabs.slice(1)) assert.ok(newPoleIds.has(c.pole_component_id), 'appended cabinet anchors appended pole');
  assert.equal(patch.walls, undefined, 'empty preset arrays do not touch existing walls');
  assert.equal(merged.walls[0].component_id, 'w1');
  // dependent index fields vs final arrays
  assert.equal(newPoles[0].foundation_idx, 2);
  assert.equal(cabs[1].pole_index, 1);
});

// ---------- duplicate ----------

await ok('duplicate: selected item pulls dependents (pole+cabinet) with remapped refs + offset', async () => {
  const proj = fixture();
  const { patch, summary } = duplicateFoundationAssembly(proj, { component_ids: ['it1'], createId: ids, offset_inches: { x: 24, z: 8 } });
  const merged = { ...proj, ...patch };
  assert.equal(merged.items.length, 3);
  assert.equal(merged.poles.length, 2, 'pole dependent cloned');
  assert.equal(merged.signage_cabinets.length, 2, 'cabinet dependent cloned');
  assert.equal(merged.wall_caps.length, 2, 'caps not selected — untouched');
  const dup = merged.items[2];
  assert.notEqual(dup.component_id, 'it1');
  assert.equal(dup.x_inches, 124);
  assert.equal(dup.z_inches, 108);
  const dp = merged.poles[1];
  assert.equal(dp.foundation_component_id, dup.component_id, 'cloned pole anchors cloned item');
  assert.equal(dp.x_inches, 144);
  assert.equal(dp.source_item_component_id, dup.component_id, 'migrated-pole lineage remapped');
  assert.equal(dp.signs[0].component_id === 'sg1', false, 'nested sign id re-minted');
  const dc = merged.signage_cabinets[1];
  assert.equal(dc.pole_component_id, dp.component_id, 'cloned cabinet anchors cloned pole');
  assert.equal(dc.pole_index, 1);
  assert.equal(summary.duplicated.items, 1);
  assert.equal(summary.rows_added, 3);
  assert.equal(summary.id_map.it1, dup.component_id);
  assert.equal(proj.items.length, 2, 'source untouched');
});

await ok('duplicate: cap without its wall keeps original refs; explicit unknown id fails closed', async () => {
  const proj = fixture();
  const { patch } = duplicateFoundationAssembly(proj, { component_ids: ['cap1'], include_dependents: false, createId: ids });
  const merged = { ...proj, ...patch };
  assert.equal(merged.wall_caps.length, 3);
  const dc = merged.wall_caps[2];
  assert.equal(dc.wall_component_id, 'w1', 'cap clone stays on the same wall');
  assert.equal(dc.segment_component_id, 's0', 'same segment');
  assert.equal(dc.wall_index, 0);
  assert.equal(patch.items, undefined, 'no new items -> array absent');
  assert.throws(() => duplicateFoundationAssembly(proj, { component_ids: ['ghost'], createId: ids }), /unknown component id/);
});

await ok('duplicate: no component_ids duplicates the whole assembly; createId collision guard works', async () => {
  const proj = fixture();
  let collided = 0;
  const guardedIds = (kind) => {
    if (collided === 0) { collided += 1; return 'it1'; } // first mint collides with an existing id
    return `${kind}_g${idSeq++}`;
  };
  const { patch, summary } = duplicateFoundationAssembly(proj, { createId: guardedIds });
  const merged = { ...proj, ...patch };
  assert.equal(merged.items.length, 4);
  assert.equal(merged.poles.length, 2);
  assert.equal(merged.wall_caps.length, 4);
  assert.equal(merged.signage_cabinets.length, 2);
  const allIds = new Set();
  for (const k of ['items', 'walls', 'poles', 'wall_caps', 'signage_cabinets']) for (const r of merged[k]) { assert.ok(!allIds.has(r.component_id), 'dup id'); allIds.add(r.component_id); }
  assert.equal(summary.rows_added, 7);
});

await ok('duplicate: wall clone remaps segment ids + cap refs follow', async () => {
  const proj = fixture();
  const { patch } = duplicateFoundationAssembly(proj, { component_ids: ['w1'], createId: ids });
  const merged = { ...proj, ...patch };
  assert.equal(merged.walls.length, 2);
  assert.equal(merged.wall_caps.length, 4, 'caps are dependents of the wall');
  const nw = merged.walls[1];
  const nseg = new Set(nw.shape.segments.map(s => s.component_id));
  for (const c of merged.wall_caps.slice(2)) {
    assert.equal(c.wall_component_id, nw.component_id);
    assert.ok(nseg.has(c.segment_component_id));
  }
  // segment lengths survive (points translated, not scaled)
  assert.equal(nw.shape.segments[0].length, merged.walls[0].shape.segments[0].length);
});

// ---------- mirror ----------

await ok('mirror copy: reflected clone across default centerline (x=240)', async () => {
  const proj = fixture();
  const { patch, summary } = mirrorFoundationAssembly(proj, { component_ids: ['it1'], createId: ids });
  const merged = { ...proj, ...patch };
  assert.equal(summary.at, 240);
  const m = merged.items[2];
  // x' = 2*240 - x - width = 480 - 100 - 96 = 284
  assert.equal(m.x_inches, 284);
  assert.equal(m.z_inches, 100, 'z untouched by x-mirror');
  assert.equal(m.rotation_degrees, 330, 'rotation flips (theta -> -theta)');
  const mp = merged.poles[1];
  assert.equal(mp.x_inches, 360, 'pole point reflected');
  assert.equal(mp.foundation_component_id, m.component_id);
});

await ok('mirror copy across a foundation edge (edge_of + max_x)', async () => {
  const proj = fixture();
  const { patch, summary } = mirrorFoundationAssembly(proj, { component_ids: ['it2'], edge_of: 'it1', edge: 'max_x', createId: ids });
  assert.equal(summary.axis, 'x');
  assert.equal(summary.at, 196, 'right edge of it1 (x=100 + w=96)');
  const merged = { ...proj, ...patch };
  const m = merged.items[2];
  // pillar: fp = 24x24; x' = 2*196 - 300 - 24 = 68
  assert.equal(m.x_inches, 68);
});

await ok('mirror copy on walls: points reflected, segment lengths preserved, cap refs remapped', async () => {
  const proj = fixture();
  const { patch } = mirrorFoundationAssembly(proj, { component_ids: ['w1'], at: 120, createId: ids });
  const merged = { ...proj, ...patch };
  const nw = merged.walls[1];
  assert.deepEqual(nw.shape.points.map(p => p.x), [230, 170, 170]);
  assert.deepEqual(nw.shape.points.map(p => p.z), [10, 10, 40]);
  assert.equal(nw.shape.segments[0].length, merged.walls[0].shape.segments[0].length, 'isometry keeps lengths');
  const nc = merged.wall_caps[2];
  assert.equal(nc.wall_component_id, nw.component_id);
});

await ok('mirror in_place: same ids, reflected rows only in changed arrays', async () => {
  const proj = fixture();
  const { patch, summary } = mirrorFoundationAssembly(proj, { component_ids: ['it1'], mode: 'reflect', at: 200 });
  const m = patch.items.find(r => r.component_id === 'it1');
  // x' = 400 - 100 - 96 = 204
  assert.equal(m.x_inches, 204);
  assert.equal(m.rotation_degrees, 330);
  assert.equal(patch.items.find(r => r.component_id === 'it2').x_inches, 300, 'unselected row verbatim');
  assert.equal(patch.walls, undefined, 'no wall rows changed');
  assert.equal(patch.wall_caps, undefined);
  // dependent pole reflected via closure (include_dependents default)
  const mp = patch.poles.find(r => r.component_id === 'p1');
  assert.equal(mp.x_inches, 280);
  assert.equal(summary.mode, 'in_place');
  assert.equal(proj.items[0].x_inches, 100, 'source untouched');
});

await ok('mirror z-axis + edge validation errors', async () => {
  const proj = fixture();
  const { patch } = mirrorFoundationAssembly(proj, { component_ids: ['it1'], mode: 'reflect', axis: 'z', at: 100 });
  const m = patch.items.find(r => r.component_id === 'it1');
  // z' = 200 - 100 - 64 = 36
  assert.equal(m.z_inches, 36);
  assert.equal(m.rotation_degrees, 330);
  assert.throws(() => mirrorFoundationAssembly(proj, { component_ids: ['it1'], mode: 'reflect', edge_of: 'ghost', edge: 'max_x' }), /edge_of/);
  assert.throws(() => mirrorFoundationAssembly(proj, { component_ids: ['it1'], mode: 'reflect', at: 'bad' }), /finite/);
  assert.throws(() => mirrorFoundationAssembly(proj, { component_ids: ['it1'], mode: 'bogus', createId: ids }), /mode/);
});

// ---------- bulk material ----------

await ok('bulk concrete: items + project default, per-field applicability only', async () => {
  const proj = fixture();
  const { patch, summary } = applyFoundationBulkMaterial(proj, { target: 'concrete', value: 'mix-b' });
  assert.equal(patch.selected_concrete_id, 'mix-b', 'project default updated');
  assert.ok(patch.items.every(r => r.selected_concrete_id === 'mix-b'));
  assert.equal(patch.items[0].custom_concrete_cost_per_cy, 175, 'price override verbatim — never authored');
  assert.equal(patch.walls, undefined, 'walls untouched by concrete target');
  assert.equal(summary.rows_changed.items, 2);
  assert.equal(summary.project_default_changed, true);
  assert.equal(summary.custom_price_rows_kept, 1);
  assert.equal(proj.items[0].selected_concrete_id, 'mix-a', 'source untouched');
});

await ok('bulk applicability: unknown target fails closed listing valid keys', async () => {
  assert.throws(() => applyFoundationBulkMaterial(fixture(), { target: 'concrete', value: 5 }), /material id string/);
  assert.throws(() => applyFoundationBulkMaterial(fixture(), { target: 'mortar', value: 'x' }), /unknown target/);
});

await ok('bulk replace mode: only rows holding `from` move; blanks stay blank', async () => {
  const proj = fixture();
  const { patch, summary } = applyFoundationBulkMaterial(proj, { target: 'concrete', value: 'mix-c', mode: 'replace', from: 'mix-a' });
  const items = patch.items;
  assert.equal(items[0].selected_concrete_id, 'mix-c', 'matching row replaced');
  assert.equal(items[1].selected_concrete_id, '', 'blank row not pinned');
  assert.equal(patch.selected_concrete_id, 'mix-c', 'project default was mix-a -> moves');
  assert.equal(summary.rows_changed.items, 1);
});

await ok('bulk fill_blank: only empty slots written', async () => {
  const proj = fixture();
  const { patch } = applyFoundationBulkMaterial(proj, { target: 'concrete', value: 'mix-d', mode: 'fill_blank' });
  assert.equal(patch.items[0].selected_concrete_id, 'mix-a', 'occupied slot kept');
  assert.equal(patch.items[1].selected_concrete_id, 'mix-d', 'blank filled');
  assert.equal(patch.selected_concrete_id, undefined, 'project default occupied -> untouched');
});

await ok('bulk wall targets: materialId vs internalMaterialId are separate slots; caps and poles', async () => {
  const proj = fixture();
  const a = applyFoundationBulkMaterial(proj, { target: 'wall_material', value: 'mat-brick' });
  assert.equal(a.patch.walls[0].materialId, 'mat-brick');
  assert.equal(a.patch.walls[0].internalMaterialId, 'mat-fill', 'internal slot untouched');
  const b = applyFoundationBulkMaterial(proj, { target: 'internal_wall_material', value: 'mat-fill2' });
  assert.equal(b.patch.walls[0].internalMaterialId, 'mat-fill2');
  assert.equal(b.patch.walls[0].materialId, 'mat-block');
  const c = applyFoundationBulkMaterial(proj, { target: 'wall_cap', value: 'cap-new' });
  assert.ok(c.patch.wall_caps.every(r => r.cap_inventory_id === 'cap-new'));
  const d = applyFoundationBulkMaterial(proj, { target: 'pole', value: 'pole-alum' });
  assert.equal(d.patch.poles[0].pole_id, 'pole-alum');
});

await ok('bulk component_ids scope + clear ("") + no-change empty patch', async () => {
  const proj = fixture();
  const scoped = applyFoundationBulkMaterial(proj, { target: 'forming', value: 'form-9', component_ids: ['it1'] });
  assert.equal(scoped.patch.items[0].selected_forming_id, 'form-9');
  assert.equal(scoped.patch.items[1].selected_forming_id, 'form-1', 'out of scope kept');
  const clear = applyFoundationBulkMaterial(proj, { target: 'wall_cap', value: '' });
  assert.ok(clear.patch.wall_caps.every(r => r.cap_inventory_id === ''));
  const noop = applyFoundationBulkMaterial(proj, { target: 'forming', value: 'form-1', include_project_default: false });
  assert.deepEqual(noop.patch, {}, 'no applicable change -> empty patch');
  const only = applyFoundationBulkMaterial(proj, { target: 'concrete', value: 'mix-z', include_project_default: false });
  assert.equal(only.patch.selected_concrete_id, undefined, 'project default excluded when flag off');
});

// ---------- real component: dialog preset pick row ----------

const mountDlg = async (props = {}) => {
  globalThis.__tplRows = props.rows ?? []; globalThis.__tplLoadErr = props.loadErr ?? null;
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(Dialog, {
      open: true, mode: 'load', onClose: () => {},
      project: { id: 'p', items: [] },
      onApply: () => true,
      ...props,
    }));
  });
  await flush();
  return c;
};

await ok('dialog: preset section renders all 6 presets with counts + replace disclosure', async () => {
  const c = await mountDlg();
  assert.ok(containsText(c, 'Start from an assembly preset'));
  assert.ok(containsText(c, 'replaces the current foundation assembly sections'), 'replace disclosure');
  for (const p of FOUNDATION_ASSEMBLY_PRESETS) assert.ok(containsText(c, p.name), `missing ${p.name}`);
  assert.ok(containsText(c, '2 foundations · 2 poles · 2 cabinets'), 'twin-pole counts_label');
  await act(async () => { c.unmount(); });
});

await ok('dialog: preset Apply passes snapshot-shaped data through onApply', async () => {
  let applied = null;
  const c = await mountDlg({ onApply: (data) => { applied = data; return true; } });
  const btn = c.root.findAll(el => el?.props?.children === 'Apply')[0];
  await act(async () => { btn.props.onClick(); });
  assert.ok(applied, 'onApply not called');
  for (const k of ['items', 'walls', 'poles', 'wall_caps', 'signage_cabinets']) assert.ok(Array.isArray(applied[k]), `applied.${k}`);
  // and the data is acceptable to the REAL prepare gate
  const patch = prepareFoundationTemplatePatch(applied, { createId: ids });
  assert.ok(Array.isArray(patch.items));
  await act(async () => { c.unmount(); });
});

await ok('dialog: presets render even when saved-template load fails', async () => {
  const c = await mountDlg({ loadErr: new Error('offline') });
  assert.ok(containsText(c, 'Start from an assembly preset'));
  assert.ok(containsText(c, 'Templates could not be loaded'));
  await act(async () => { c.unmount(); });
  globalThis.__tplLoadErr = null;
});

console.log(`\n${failed ? 'FAIL' : 'PASS'} o094-presets (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
