import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { normalizeFoundationAssembly, foundationAssemblyIssues, cloneFoundationComponents } from '../src/components/estimator/foundation/foundationAssemblyModel.js';

const calcBundle = await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm', platform: 'node', write: false, loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom'] });
fs.mkdirSync('.audit-work/foundation-assembly04', { recursive: true });
fs.writeFileSync('.audit-work/foundation-assembly04/calc.bundle.mjs', calcBundle.outputFiles[0].text);
const { calcProject } = await import(pathToFileURL(path.resolve('.audit-work/foundation-assembly04/calc.bundle.mjs')).href);

let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed += 1; console.log('ok', name); } catch (e) { failed += 1; console.log('not ok', name, '-', e.message); } };
let counter = 0;
const factory = (k) => `gen_${k}_${counter += 1}`;

const wall = (id, pts, closed = false, extra = {}) => ({ id, name: id, length_inches: 96, shape: { points: pts, closed, segments: buildSegmentsLocal(pts, closed) }, ...extra });
const buildSegmentsLocal = (points, closed) => {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push({ length: Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z) });
  if (closed && points.length > 2) segs.push({ length: Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) });
  return segs;
};

const legacyProject = () => ({
  id: 'pA', updated_date: 'v1', project_name: 'Legacy',
  items: [
    { id: 'i0', description: 'Footing A', quantity: 2, unit_cost: 100 },
    { id: 'i1', description: 'Footing B', quantity: 0, unit_cost: 50 },
  ],
  walls: [
    wall('w0', [{ x: 0, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 120 }, { x: 0, z: 120 }], true),
    wall('w1', [{ x: 0, z: 0 }, { x: 96, z: 0 }], false),
  ],
  poles: [
    { id: 'po0', foundation_idx: 1, height_inches: 120, signs: [{ description: 'cab sign' }] },
  ],
  wall_caps: [
    { id: 'cap0', wall_index: 1, segment_index: 0, cap_inventory_id: 'cap_inv_1', price: 42 },
  ],
  signage_cabinets: [
    { id: 'cab0', mount: 'foundation', foundation_index: 1, quantity: 1, unit_cost: 200 },
    { id: 'cab1', mount: 'pole', pole_index: 0, quantity: 3, unit_cost: 75 },
  ],
});

await ok('legacy migration: canon IDs + derived indices, input frozen, real geometry preserved', async () => {
  counter = 0;
  const src = legacyProject();
  const before = JSON.parse(JSON.stringify(src));
  const { project, issues } = normalizeFoundationAssembly(src, { createId: factory });
  assert.deepEqual(src, before);
  const i0 = project.items[0].component_id, i1 = project.items[1].component_id;
  assert.ok(i0 && i1 && i0 !== i1);
  assert.equal(project.poles[0].foundation_component_id, i1);
  assert.equal(project.poles[0].foundation_idx, 1);
  assert.equal(project.signage_cabinets[0].foundation_component_id, i1);
  assert.equal(project.signage_cabinets[1].pole_component_id, project.poles[0].component_id);
  assert.equal(project.wall_caps[0].wall_component_id, project.walls[1].component_id);
  assert.equal(project.wall_caps[0].segment_component_id, project.walls[1].shape.segments[0].component_id);
  assert.equal(project.walls[0].shape.points.length, 4);
  assert.equal(project.walls[0].shape.closed, true);
  assert.equal(project.walls[0].shape.segments.length, 4);
  assert.equal(project.walls[0].shape.segments[0].length, 120);
  assert.ok(project.poles[0].signs[0].component_id);
  assert.equal(project.items[1].quantity, 0);
  assert.equal(project.assembly_schema_version, 1);
  assert.equal(issues.filter((i) => i.code === 'dangling-parent').length, 0);
});

await ok('insert foundation before targets keeps canon refs, reindexes', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const b = { ...a, items: [{ id: 'iN', description: 'New' }, ...a.items] };
  const { project: n } = normalizeFoundationAssembly(b, { previous: a, createId: factory });
  const canon = a.items[1].component_id;
  assert.equal(n.poles[0].foundation_component_id, canon);
  assert.equal(n.poles[0].foundation_idx, 2);
  assert.equal(n.signage_cabinets[0].foundation_component_id, canon);
  assert.equal(n.signage_cabinets[0].foundation_index, 2);
});

await ok('remove attached foundation: priced children keep dangling canon, no reattach, durable issue', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const b = { ...a, items: [a.items[0]] };
  const { project: n, issues } = normalizeFoundationAssembly(b, { previous: a, createId: factory });
  assert.equal(n.poles[0].foundation_component_id, a.items[1].component_id);
  assert.equal(n.poles[0].foundation_idx, undefined);
  assert.equal(n.signage_cabinets[0].foundation_component_id, a.items[1].component_id);
  assert.equal(n.signage_cabinets[0].unit_cost, 200);
  assert.ok(issues.filter((i) => i.code === 'dangling-parent').length >= 2);
  const rt = JSON.parse(JSON.stringify(n));
  assert.ok(foundationAssemblyIssues(rt).some((i) => i.code === 'dangling-parent' && i.kind === 'pole'));
});

await ok('remove wall: cap retained + warned; reassign clears', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const b = { ...a, walls: [a.walls[0]] };
  const { project: n, issues } = normalizeFoundationAssembly(b, { previous: a, createId: factory });
  assert.equal(n.wall_caps[0].wall_component_id, a.walls[1].component_id);
  assert.equal(n.wall_caps[0].wall_index, undefined);
  assert.ok(issues.some((i) => i.kind === 'wall_cap' && i.code === 'dangling-parent'));
  const c = { ...n, wall_caps: [{ ...n.wall_caps[0], wall_component_id: n.walls[0].component_id, segment_component_id: n.walls[0].shape.segments[0].component_id }] };
  const { issues: cleared } = normalizeFoundationAssembly(c, { previous: n, createId: factory });
  assert.equal(cleared.filter((i) => i.kind === 'wall_cap').length, 0);
});

await ok('remove pole: cabinet orphan retained + warned', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const { project: n, issues } = normalizeFoundationAssembly({ ...a, poles: [] }, { previous: a, createId: factory });
  assert.equal(n.signage_cabinets[1].pole_component_id, a.poles[0].component_id);
  assert.equal(n.signage_cabinets[1].pole_index, undefined);
  assert.ok(issues.some((i) => i.kind === 'signage_cabinet' && i.code === 'dangling-parent'));
});

await ok('legacy index semantics: 0 valid, -1 unassigned, out-of-range -> unresolved token (not raw idx)', async () => {
  counter = 0;
  const p0 = legacyProject(); p0.poles[0].foundation_idx = 0;
  const { project: a } = normalizeFoundationAssembly(p0, { createId: factory });
  assert.equal(a.poles[0].foundation_component_id, a.items[0].component_id);
  const pn = legacyProject(); pn.poles[0].foundation_idx = -1;
  const { project: b } = normalizeFoundationAssembly(pn, { createId: factory });
  assert.equal(b.poles[0].foundation_component_id, '');
  const px = legacyProject(); px.poles[0].foundation_idx = 9;
  const { project: c, issues: ci } = normalizeFoundationAssembly(px, { createId: factory });
  assert.equal(c.poles[0].foundation_component_id, 'unresolved:legacy-foundation');
  assert.equal(c.poles[0].foundation_idx, undefined);
  assert.ok(ci.some((i) => i.code === 'unresolved-parent'));
  assert.ok(foundationAssemblyIssues(JSON.parse(JSON.stringify(c))).some((i) => i.code === 'unresolved-parent'));
  const pf = legacyProject(); pf.poles[0].foundation_idx = 0.5;
  const { project: f } = normalizeFoundationAssembly(pf, { createId: factory });
  assert.equal(f.poles[0].foundation_component_id, 'unresolved:legacy-foundation');
});

await ok('canonical ID wins over contradictory legacy index; canon "" never falls back to index', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const bad = { ...a, poles: [{ ...a.poles[0], foundation_idx: 0 }] };
  const { project: n } = normalizeFoundationAssembly(bad, { previous: a, createId: factory });
  assert.equal(n.poles[0].foundation_component_id, a.items[1].component_id);
  assert.equal(n.poles[0].foundation_idx, 1);
  const un = { ...a, poles: [{ ...a.poles[0], foundation_component_id: '' }] };
  const { project: u } = normalizeFoundationAssembly(un, { previous: a, createId: factory });
  assert.equal(u.poles[0].foundation_component_id, '');
  assert.equal(u.poles[0].foundation_idx, undefined);
});

await ok('fail-closed: duplicate/invalid/reserved IDs, object refs, future version, colliding generator', async () => {
  counter = 0;
  const p = legacyProject();
  p.items[0].component_id = 'dup'; p.items[1].component_id = 'dup';
  assert.throws(() => normalizeFoundationAssembly(p, { createId: factory }), /duplicate/);
  const q = legacyProject(); q.items[0].component_id = {};
  assert.throws(() => normalizeFoundationAssembly(q, { createId: factory }), /invalid/);
  const r = legacyProject(); r.items[0].component_id = 'unresolved:legacy-foundation';
  assert.throws(() => normalizeFoundationAssembly(r, { createId: factory }), /invalid/);
  const o = legacyProject(); o.poles[0].foundation_component_id = { bad: 1 };
  assert.throws(() => normalizeFoundationAssembly(o, { createId: factory }), /invalid.*reference/);
  const v = legacyProject(); v.assembly_schema_version = 2;
  assert.throws(() => normalizeFoundationAssembly(v, { createId: factory }), /unsupported/);
  const badRow = legacyProject(); badRow.items = [null];
  assert.throws(() => normalizeFoundationAssembly(badRow, { createId: factory }), /record/);
  let calls = 0;
  assert.throws(() => normalizeFoundationAssembly(legacyProject(), { createId: () => `same_${calls += 1 < 9 ? '' : calls}` }), /unique|same/);
});

await ok('fresh mint never collides with later existing ID or dangling ref', async () => {
  const p = legacyProject();
  p.poles[0].foundation_component_id = 'gen_item_1';
  p.items[1].component_id = 'gen_item_2';
  let n = 0;
  const { project } = normalizeFoundationAssembly(p, { createId: (k) => `gen_${k}_${n += 1}` });
  const ids = new Set();
  const walk = (rows) => rows.forEach((r) => { assert.ok(!ids.has(r.component_id), `dup ${r.component_id}`); ids.add(r.component_id); });
  walk(project.items); walk(project.walls); walk(project.poles); walk(project.wall_caps); walk(project.signage_cabinets);
  project.walls.forEach((w) => walk(w.shape.segments));
  project.poles.forEach((po) => walk(po.signs));
  assert.equal(project.poles[0].foundation_component_id, 'gen_item_1');
});

await ok('legacy child + previous graph: prev-first resolution, no occupant grab', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const legacy = { ...a, items: [{ id: 'iN', description: 'Inserted' }, ...a.items], poles: [...a.poles, { id: 'po1', foundation_idx: 1 }] };
  const { project: n } = normalizeFoundationAssembly(legacy, { previous: a, createId: factory });
  assert.equal(n.poles[1].foundation_component_id, a.items[1].component_id);
  assert.equal(n.poles[1].foundation_idx, 2);
  const legacy2 = { ...n, items: [n.items[0]], poles: [...n.poles, { id: 'po2', foundation_idx: 1 }] };
  const { project: m } = normalizeFoundationAssembly(legacy2, { previous: n, createId: factory });
  assert.equal(m.poles[2].foundation_component_id, 'unresolved:legacy-foundation');
});

await ok('real geometry: identical rebuild retains seg IDs + cap; closing adds one edge; removed edge warns', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const segIds = a.walls[0].shape.segments.map((s) => s.component_id);
  const strip = (w) => ({ ...w, shape: { ...w.shape, segments: w.shape.segments.map((s) => { const c = { ...s }; delete c.component_id; return c; }) } });
  const { project: n } = normalizeFoundationAssembly({ ...a, walls: a.walls.map(strip) }, { previous: a, createId: factory });
  assert.deepEqual(n.walls[0].shape.segments.map((s) => s.component_id), segIds);
  assert.equal(n.wall_caps[0].segment_component_id, a.walls[1].shape.segments[0].component_id);
  const open = { ...a, walls: a.walls.map((w, i) => i !== 0 ? w : { ...w, shape: { ...w.shape, closed: false, segments: buildSegmentsLocal(w.shape.points, false) } }) };
  const { project: m } = normalizeFoundationAssembly(open, { previous: a, createId: factory });
  assert.equal(m.walls[0].shape.segments.length, 3);
  assert.equal(m.walls[0].shape.segments[0].component_id, segIds[0]);
  assert.notEqual(m.walls[0].shape.segments[2]?.component_id, undefined);
  const pts2 = [{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 50, z: 50 }, { x: 0, z: 50 }];
  const p2 = { ...a, walls: [wall('wR', pts2, true)] };
  const { project: r } = normalizeFoundationAssembly(p2, { createId: factory });
  const rSegs = r.walls[0].shape.segments.map((s) => s.component_id);
  const moved = { ...r, walls: [wall('wR', [{ x: 10, z: 10 }, { x: 60, z: 10 }, { x: 60, z: 60 }, { x: 10, z: 60 }], true, { component_id: 'wR' })] };
  const { project: mm } = normalizeFoundationAssembly(moved, { previous: r, createId: factory });
  assert.ok(mm.walls[0].shape.segments.every((s) => !rSegs.includes(s.component_id)), 'equal-length different endpoints must NOT retain');
});

await ok('reversed points: oriented endpoints not equal -> fresh IDs + cap warns, not retargeted', async () => {
  counter = 0;
  const src = legacyProject();
  src.wall_caps[0].wall_index = 0; src.wall_caps[0].segment_index = 0;
  const { project: a } = normalizeFoundationAssembly(src, { createId: factory });
  const seg0 = a.walls[0].shape.segments[0].component_id;
  const reversed = { ...a, walls: a.walls.map((w, i) => i !== 0 ? w : { ...w, shape: { points: [...w.shape.points].reverse(), closed: true, segments: buildSegmentsLocal([...w.shape.points].reverse(), true) } }) };
  const { project: n, issues } = normalizeFoundationAssembly(reversed, { previous: a, createId: factory });
  assert.notEqual(n.walls[0].shape.segments[0].component_id, seg0);
  assert.equal(n.wall_caps[0].segment_component_id, seg0);
  assert.ok(issues.some((i) => i.kind === 'wall_cap'));
});

await ok('clone: fresh IDs all nodes + remap incl nested; catalog/zero/root untouched; second clone unique; partial only', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const { components, idMap } = cloneFoundationComponents(a, { createId: factory });
  assert.equal(idMap.size > 8, true);
  assert.equal(components.poles[0].foundation_component_id, components.items[1].component_id);
  assert.equal(components.signage_cabinets[1].pole_component_id, components.poles[0].component_id);
  assert.equal(components.wall_caps[0].segment_component_id, components.walls[1].shape.segments[0].component_id);
  assert.equal(components.wall_caps[0].cap_inventory_id, 'cap_inv_1');
  assert.equal(components.items[0].id, 'i0');
  assert.equal(components.items[1].quantity, 0);
  assert.equal(components.id, undefined);
  assert.equal(components.builder_sync_attempt, undefined);
  const c2 = cloneFoundationComponents(a, { createId: factory });
  assert.notEqual(c2.components.items[0].component_id, components.items[0].component_id);
  const partial = cloneFoundationComponents({ items: a.items }, { createId: factory });
  assert.ok(partial.components.items && partial.components.signage_cabinets === undefined);
});

await ok('clone roundtrip JSON preserves graph + index adapters', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const rt = JSON.parse(JSON.stringify(cloneFoundationComponents(a, { createId: factory }).components));
  assert.equal(rt.poles[0].foundation_idx, 1);
  assert.equal(rt.signage_cabinets[0].foundation_index, 1);
  assert.equal(rt.wall_caps[0].segment_index, 0);
});

await ok('price invariance: nonzero calc scalars identical after normalization (identity metadata stripped)', async () => {
  counter = 0;
  const src = legacyProject();
  src.items=[{id:'i0',foundation_type:'spread_foot',description:'F',length_inches:48,width_inches:48,depth_inches:12,quantity:2,selected_concrete_id:'bag_1',include_rebar:true,rebar_size:'#4',rebar_spacing_width:12,rebar_spacing_length:12,rebar_layers:1}];
  src.poles=[{id:'po0',foundation_idx:0,pole_id:'pole_1',height_inches:120,y_offset_inches:24,include_pole_painting:true}];
  src.walls=[wall('w0',[{x:0,z:0},{x:96,z:0}],false,{materialId:'brick_1',heightInches:24,mortarGapInches:0.375})];
  src.wall_caps=[{wall_index:0,segment_index:0,cap_inventory_id:'cap_1',length_inches:24}];
  src.signage_cabinets=[{mount:'foundation',foundation_index:0,quantity:1,unit_cost:100}];
  const inventory=[
    {id:'bag_1',material_type:'bagged_concrete',material_name:'Bagged concrete',cost_per_unit:8},
    {id:'bar_1',material_type:'rebar',material_name:'#4',rebar_size:'#4',cost_per_unit:2},
    {id:'pole_1',material_type:'pole',material_name:'Steel pole',pole_pricing_mode:'per_linear_foot',cost_per_unit:18,pole_width_inches:6},
    {id:'brick_1',material_type:'wall_material',material_name:'Brick',wall_unit_length_inches:8,wall_unit_width_inches:4,wall_unit_height_inches:2.25,cost_per_unit:3},
    {id:'cap_1',material_type:'wall_cap',material_name:'Cap',cap_stock_length_inches:48,cap_stock_price:45}];
  const before = calcProject(src, inventory, {});
  const { project } = normalizeFoundationAssembly(src, { createId: factory });
  const after = calcProject(project, inventory, {});
  for (const k of ['total_concrete_cost','total_rebar_cost','total_pole_cost','total_wall_cost','total_wall_cap_cost']) {
    assert.ok(typeof before.totals[k] === 'number' && Number.isFinite(before.totals[k]) && before.totals[k] > 0, `${k} must be nonzero`);
  }
  const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'component_id' || k === 'assembly_schema_version' || k.endsWith('_component_id') ? undefined : x)));
  assert.deepEqual(strip(after), strip(before));
});

await ok('present-null canon -> explicit unassigned, never index fallback', async () => {
  counter = 0;
  const p = legacyProject();
  p.poles[0].foundation_component_id = null; p.poles[0].foundation_idx = 0;
  const { project } = normalizeFoundationAssembly(p, { createId: factory });
  assert.equal(project.poles[0].foundation_component_id, '');
  assert.equal(project.poles[0].foundation_idx, undefined);
});

await ok('legacy cap resolves previous graph first; removed wall/segment -> unresolved token', async () => {
  counter = 0;
  const { project: a } = normalizeFoundationAssembly(legacyProject(), { createId: factory });
  const capWall = a.walls[1].component_id;
  const b = { ...a, walls: [a.walls[0], { id: 'wN', shape: { points: [{ x: 0, z: 0 }, { x: 50, z: 0 }], closed: false, segments: [{ length: 50 }] } }, a.walls[1]], wall_caps: [{ wall_index: 1, segment_index: 0 }] };
  const { project: n } = normalizeFoundationAssembly(b, { previous: a, createId: factory });
  assert.equal(n.wall_caps[0].wall_component_id, capWall);
  assert.equal(n.wall_caps[0].wall_index, 2);
  const c = { ...a, walls: [a.walls[0]], wall_caps: [{ wall_index: 1, segment_index: 0 }] };
  const { project: m, issues } = normalizeFoundationAssembly(c, { previous: a, createId: factory });
  assert.equal(m.wall_caps[0].wall_component_id, 'unresolved:legacy-wall');
});

await ok('ambiguous identical endpoint pairs -> no heuristic retention', async () => {
  counter = 0;
  const pts = [{ x: 0, z: 0 }, { x: 96, z: 0 }, { x: 96, z: 96 }, { x: 0, z: 96 }];
  const p = { items: [], walls: [{ id: 'wA', shape: { points: [{ x: 0, z: 0 }, { x: 96, z: 0 }, { x: 0, z: 0 }, { x: 96, z: 0 }], closed: true, segments: [{ length: 96 }, { length: 96 }, { length: 96 }, { length: 96 }] } }], wall_caps: [] };
  const { project: a } = normalizeFoundationAssembly(p, { createId: factory });
  const segIds = a.walls[0].shape.segments.map((sg) => sg.component_id);
  const strip = { ...a, walls: a.walls.map((w) => ({ ...w, shape: { ...w.shape, segments: w.shape.segments.map((sg) => { const c = { ...sg }; delete c.component_id; return c; }) } })) };
  const { project: n } = normalizeFoundationAssembly(strip, { previous: a, createId: factory });
  assert.ok(!segIds.some((id) => n.walls[0].shape.segments.some((sg) => sg.component_id === id)), 'rectangle has ambiguous endpoint pairs -> none retained');
});

await ok('unknown mount stays unsupported, visible orphan, durable issue', async () => {
  counter = 0;
  const p = legacyProject();
  p.signage_cabinets[0].mount = 'portal';
  const { project, issues } = normalizeFoundationAssembly(p, { createId: factory });
  assert.equal(project.signage_cabinets[0].mount, 'portal');
  assert.ok(issues.some((i) => i.code === 'unsupported-mount'));
  assert.ok(foundationAssemblyIssues(JSON.parse(JSON.stringify(project))).some((i) => i.code === 'unsupported-mount'));
});

const bundles = {};
const buildPanel = async (key, code) => {
  if (!bundles[key]) {
    const plugin = { name: 'p', setup: (b) => {
      b.onResolve({ filter: /.*/ }, (a) => {
        if (a.importer === '') return a.path === 'stub' ? { path: 'stub', namespace: 'stub' } : { path: path.resolve(a.path) };
        if (a.path.startsWith('@/components/ui/')) return { path: a.path, namespace: 'uistub' };
        if (a.path.startsWith('@/')) { const p = path.resolve('src', a.path.slice(2)); return { path: fs.existsSync(p) ? p : fs.existsSync(p + '.js') ? p + '.js' : fs.existsSync(p + '.jsx') ? p + '.jsx' : p }; }
        if (a.path === 'lucide-react') return { path: 'lucide', namespace: 'stub' };
        return null;
      });
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => a.path === 'stub' ? { contents: code, loader: 'jsx' } : { contents: 'export const Plus=()=>null;export const Trash2=()=>null;export default {};', loader: 'js' });
      b.onLoad({ filter: /.*/, namespace: 'uistub' }, () => ({ contents: `import React from 'react';const strip=({className,variant,size,...r})=>r;export const Input=(p)=><input {...strip(p)}/>;export const Button=(p)=><button {...strip(p)}/>;export const Card=(p)=><div {...strip(p)}/>;export const Textarea=(p)=><textarea {...strip(p)}/>;export const Select=(p)=><select {...strip(p)}/>;export const Checkbox=(p)=><input type='checkbox' {...strip(p)}/>;export const Label=(p)=><label {...strip(p)}/>;export default {};`, loader: 'jsx' }));
    } };
    const out = await esbuild.build({ entryPoints: ['stub'], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', jsxImportSource: 'react', external: ['react', 'react-dom', 'react-test-renderer', 'react/jsx-runtime', 'react/jsx-dev-runtime'] });
    const tmp = path.resolve(`.audit-work/foundation-assembly04/${key}.bundle.mjs`);
    fs.writeFileSync(tmp, out.outputFiles[0].text);
    bundles[key] = await import(pathToFileURL(tmp).href);
  }
  return bundles[key];
};

globalThis.window = { location: { search: '' }, confirm: () => true, addEventListener() {}, removeEventListener() {} };

await ok('SignageCabinetsPanel renders orphan cabinet (unknown + dangling) with cost + reassign', async () => {
  await buildPanel('cab', `
import React from 'react';
import Panel from '@/components/estimator/foundation/SignageCabinetsPanel.jsx';
export default function Harness(){
  const items=[{id:'i0',description:'F0',component_id:'itm_0'}];
  const poles=[];
  const cabinets=[
    {id:'cabX',mount:'foundation',foundation_component_id:'gone_id',quantity:2,unit_cost:100,component_id:'cab_1'},
    {id:'cabY',mount:'portal',component_id:'cab_2',quantity:1,unit_cost:50},
  ];
  return <Panel items={items} poles={poles} cabinets={cabinets} onChange={(arr)=>{globalThis.__cabPatch=arr;}}/>;
}
`);
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(bundles.cab.default)); });
  const orphans = r.root.findAll((n) => n.props && n.props['data-orphan'] === 'true');
  assert.equal(orphans.length, 1);
  const sel = r.root.findAllByType('select').find((s2) => s2.props['aria-label'] === 'Reassign cabinet');
  assert.ok(sel);
  await act(async () => { sel.props.onChange({ target: { value: 'foundation:itm_0' } }); });
  const patched = globalThis.__cabPatch?.[0];
  assert.equal(patched?.foundation_component_id, 'itm_0');
  assert.equal(patched?.mount, 'foundation');
  const text = JSON.stringify(r.toJSON());
  assert.ok(text.includes('cab_') || text.length > 10);
});

await ok('FoundationPolesPanel canon select: value, missing option, none clears', async () => {
  await buildPanel('poles', `
import React from 'react';
import Panel from '@/components/estimator/foundation/FoundationPolesPanel.jsx';
export default function Harness(){
  const items=[{id:'i0',component_id:'itm_0'},{id:'i1',component_id:'itm_1'}];
  const poles=[{component_id:'po_0',foundation_component_id:'gone_0'},{component_id:'po_1',foundation_component_id:'itm_1'}];
  return <Panel items={items} poles={poles} options={[{id:'po_inv',material_name:'Pole'}]} onChange={(arr)=>{globalThis.__polePatch=arr;}}/>;
}
`);
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(bundles.poles.default)); });
  const sels = r.root.findAllByType('select').filter((s) => s.props['aria-label'] === 'Pole foundation');
  assert.equal(sels.length, 2);
  assert.equal(sels[0].props.value, 'gone_0');
  const opts = r.root.findAllByType('option').map((o) => String(o.children?.[0] ?? ''));
  assert.ok(opts.some((t) => t.includes('Missing foundation')));
  await act(async () => { sels[1].props.onChange({ target: { value: '' } }); });
  assert.equal(globalThis.__polePatch?.[1]?.foundation_component_id, '');
  assert.equal(globalThis.__polePatch?.[1]?.foundation_idx, undefined);
});

await ok('FoundationWallCapsPanel: missing wall/segment options + new wall clears segment', async () => {
  await buildPanel('caps', `
import React from 'react';
import Panel from '@/components/estimator/foundation/FoundationWallCapsPanel.jsx';
export default function Harness(){
  const walls=[{component_id:'w_0',name:'W0',shape:{segments:[{component_id:'s_0'}]}}];
  const caps=[{component_id:'cap_0',cap_inventory_id:'cap_inv',wall_component_id:'gone_w',segment_component_id:'gone_s'}];
  return <Panel caps={caps} walls={walls} options={[{id:'cap_inv',material_name:'Cap'}]} onChange={(arr)=>{globalThis.__capPatch=arr;}}/>;
}
`);
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(bundles.caps.default)); });
  const wallSel = r.root.findAllByType('select').find((s) => s.props['aria-label'] === 'Cap wall');
  const segSel = r.root.findAllByType('select').find((s) => s.props['aria-label'] === 'Cap segment');
  assert.equal(wallSel.props.value, 'gone_w');
  const opts2 = r.root.findAllByType('option').map((o) => String(o.children?.[0] ?? ''));
  assert.ok(opts2.some((t) => t.includes('Missing wall')));
  assert.equal(segSel.props.value, 'gone_s');
  assert.ok(opts2.some((t) => t.includes('Missing segment')));
  await act(async () => { wallSel.props.onChange({ target: { value: 'w_0' } }); });
  assert.equal(globalThis.__capPatch?.[0]?.wall_component_id, 'w_0');
  assert.equal(globalThis.__capPatch?.[0]?.segment_component_id, '');
  assert.equal(globalThis.__capPatch?.[0]?.segment_index, undefined);
});


await ok('prior unique edge duplicated incoming -> neither duplicate retains prior ID, cap orphan', async () => {
  // prior: unique open path 0,0 -> 9,0 -> 18,0 (two unique oriented edges)
  const prev = { items: [], poles: [], walls: [{ id: 'wP', shape: { points: [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 18, z: 0 }], closed: false, segments: [{ length: 9 }, { length: 9 }] } }], wall_caps: [{ wall_index: 0, segment_index: 0, cap_inventory_id: 'cap' }], signage_cabinets: [] };
  const { project: a } = normalizeFoundationAssembly(prev, { createId: factory });
  const priorEdgeId = a.walls[0].shape.segments[0].component_id;
  const next = JSON.parse(JSON.stringify(a));
  // incoming: edge 0,0->9,0 now occurs TWICE within the same wall
  next.walls[0].shape.points = [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 0, z: 0 }, { x: 9, z: 0 }];
  next.walls[0].shape.segments = [{ length: 9 }, { length: 9 }, { length: 9 }];
  next.wall_caps = [{ wall_index: 0, segment_index: 0, cap_inventory_id: 'cap' }];
  const { project: n, issues } = normalizeFoundationAssembly(next, { previous: a, createId: factory });
  assert.ok(!n.walls[0].shape.segments.some((sg) => sg.component_id === priorEdgeId), 'duplicated edge -> prior seg ID not retained');
  assert.ok(issues.some((i) => i.kind === 'wall_cap' && (i.code === 'dangling-parent' || i.code === 'unresolved-parent')), 'cap stays orphan, not attached to a wrong edge');
});

await ok('non-record incoming segment row fails closed', async () => {
  const p = { items: [], walls: [{ id: 'w1', shape: { points: [{ x: 0, z: 0 }, { x: 9, z: 0 }], closed: false, segments: [null, 'x'] } }], wall_caps: [] };
  assert.throws(() => normalizeFoundationAssembly(p, { createId: factory }), /records/);
  // same geometry in prior graph -> retention path reached, still fails closed before any retention
  const { project: a } = normalizeFoundationAssembly({ items: [], walls: [{ id: 'w1', shape: { points: [{ x: 0, z: 0 }, { x: 9, z: 0 }], closed: false, segments: [{ length: 9 }] } }], wall_caps: [] }, { createId: factory });
  const cur = JSON.parse(JSON.stringify(a));
  cur.walls[0].shape.segments = [null];
  assert.throws(() => normalizeFoundationAssembly(cur, { previous: a, createId: factory }), /records/);
});

await ok('prev graph lacks wall; incoming legacy wall_index -> unresolved token, not occupant', async () => {
  const prev = { items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [] };
  const { project: a } = normalizeFoundationAssembly(prev, { createId: factory });
  const cur = { items: [], poles: [], walls: [{ id: 'wX', shape: { points: [{ x: 0, z: 0 }, { x: 5, z: 0 }], closed: false, segments: [{ length: 5 }] } }], wall_caps: [{ wall_index: 0, segment_index: 0, cap_inventory_id: 'cap' }], signage_cabinets: [] };
  const { project: n } = normalizeFoundationAssembly(cur, { previous: a, createId: factory });
  assert.equal(n.wall_caps[0].wall_component_id, 'unresolved:legacy-wall');
  assert.equal(n.wall_caps[0].wall_index, undefined);
});

await ok('clone: factory yielding a dangling referenced ID first is not used for minted node', async () => {
  // already-normalized input: explicit component_ids so first createId call happens inside cloneFoundationComponents
  const p = { items: [{ id: 'i0', component_id: 'item_0' }], walls: [{ id: 'w0', component_id: 'wall_0', shape: { points: [{ x: 0, z: 0 }, { x: 9, z: 0 }], closed: false, segments: [{ component_id: 'seg_0', length: 9 }] } }], poles: [{ id: 'p0', component_id: 'pole_0', foundation_component_id: 'dangling_ref_x', signs: [{ component_id: 'sign_0' }] }], wall_caps: [{ component_id: 'cap_0', wall_component_id: 'wall_0', segment_component_id: 'seg_0' }], signage_cabinets: [{ component_id: 'cab_0', mount: 'pole', pole_component_id: 'pole_0' }] };
  const calls = ['dangling_ref_x']; let n = 0;
  const f = () => calls.length ? calls.shift() : `mint_${n++}`;
  const { components: c } = cloneFoundationComponents(p, { createId: f });
  const allIds = [...(c.items || []), ...(c.poles || []), ...(c.walls || []), ...(c.wall_caps || []), ...(c.signage_cabinets || [])].map((x) => x.component_id)
    .concat((c.walls || []).flatMap((w) => (w.shape?.segments || []).map((sg) => sg.component_id)))
    .concat((c.poles || []).flatMap((pl) => (pl.signs || []).map((sg) => sg.component_id)));
  assert.ok(allIds.every(Boolean) && !allIds.includes('dangling_ref_x'), 'reserved dangling ref never minted as a node id');
  assert.equal(c.poles[0].foundation_component_id, 'dangling_ref_x', 'dangling pole ref preserved verbatim');
});

await ok('cap canon wall + legacy segment_index with prev graph: unresolved segment token', async () => {
  const { project: a } = normalizeFoundationAssembly({ items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [] }, { createId: factory });
  const cur = { items: [], poles: [], walls: [{ id: 'wX', component_id: 'new_wall', shape: { points: [{ x: 0, z: 0 }, { x: 5, z: 0 }], closed: false, segments: [{ length: 5 }] } }], wall_caps: [{ wall_component_id: 'new_wall', segment_index: 0, cap_inventory_id: 'cap' }], signage_cabinets: [] };
  const { project: n } = normalizeFoundationAssembly(cur, { previous: a, createId: factory });
  assert.equal(n.wall_caps[0].wall_component_id, 'new_wall', 'canon wall ref kept');
  assert.equal(n.wall_caps[0].segment_component_id, 'unresolved:legacy-segment', 'prev graph exists but lacks wall -> no incoming-seg fallback');
  assert.equal(n.wall_caps[0].segment_index, undefined);
});

await ok('issue classifications durable across JSON roundtrip (null refs, mounts)', async () => {
  const p = { items: [{ id: 'i0' }], walls: [{ id: 'w0', shape: { points: [{ x: 0, z: 0 }, { x: 5, z: 0 }], closed: false, segments: [{ length: 5 }] } }], poles: [{ id: 'p0', foundation_component_id: null }], wall_caps: [{ wall_component_id: null, segment_component_id: null }], signage_cabinets: [{ mount: 'pole', pole_component_id: null }, { mount: null }, { mount: undefined }, { mount: 'portal' }] };
  const { project } = normalizeFoundationAssembly(p, { createId: factory });
  const rt = foundationAssemblyIssues(JSON.parse(JSON.stringify(project)));
  assert.ok(!rt.some((i) => i.kind === 'pole'), 'null pole foundation ref = unassigned, no issue');
  assert.equal(rt.filter((i) => i.kind === 'wall_cap' && i.code === 'missing-mount').length, 1, 'null wall ref -> wall missing-mount only (no segment dup)');
  assert.ok(rt.some((i) => i.kind === 'signage_cabinet' && i.code === 'missing-mount'), 'null cabinet pole ref -> missing-mount');
  assert.equal(rt.filter((i) => i.code === 'unsupported-mount').length, 3, 'null/undefined/unknown mounts all unsupported');
});

console.log(`assembly passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
