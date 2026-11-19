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
  '@/components/ui/button': `export const Button=(p)=>globalThis.React.createElement('button',{...p,onClick:p.onClick,disabled:p.disabled},p.children);`,
  '@/components/ui/input': `export const Input=(p)=>globalThis.React.createElement('input',p);`,
  'lucide-react': ['Trash2','Plus','PenLine','Undo2','Square','MousePointer','Trash','Save','X'].map(n=>`export const ${n}=()=>null;`).join(''),
  '@/components/estimator/foundation/WallShapeEditor': `export default function WallShapeEditor(){return null;}`,
  './WallShapeEditor': `export default function WallShapeEditor(){return null;}`,
};
globalThis.React = React;
const plugin = { name: 's', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: path.resolve('s-' + a.path.replace(/[^a-z0-9]/gi, '_')), namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => { const key = Object.keys(STUBS).find(k => path.resolve('s-' + k.replace(/[^a-z0-9]/gi, '_')) === a.path); return { contents: STUBS[key], loader: 'js', resolveDir: path.resolve('.') }; });
}};
fs.mkdirSync('.audit-work/foundation-catalog06', { recursive: true });
const mk = async (entry, out) => {
  const r = await esbuild.build({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-test-renderer'] });
  fs.writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(path.resolve(out)).href);
};
const Poles = (await mk('src/components/estimator/foundation/FoundationPolesPanel.jsx', '.audit-work/foundation-catalog06/poles.bundle.mjs')).default;
const Caps = (await mk('src/components/estimator/foundation/FoundationWallCapsPanel.jsx', '.audit-work/foundation-catalog06/caps.bundle.mjs')).default;
const Walls = (await mk('src/components/estimator/foundation/FoundationWallsPanel.jsx', '.audit-work/foundation-catalog06/walls.bundle.mjs')).default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const render = async (Comp, props) => { let c; await act(async () => { c = TestRenderer.create(React.createElement(Comp, props)); }); return c; };
const sels = (c, label) => c.root.findAll(e => e?.props?.['aria-label'] === label);
const findByText = (c, re) => c.root.findAll(e => typeof e?.props?.children === 'string' && re.test(e.props.children));
const warn = (c) => findByText(c, /Catalog .* unavailable; current pricing needs review/);

await ok('poles: options=[] keeps authored rows + selectors + saved cost; add disabled', async () => {
  const pole = { component_id: 'po1', pole_id: 'pole_X', foundation_component_id: 'f1', height_inches: 120, pole_cost: 42, pole_painting_cost: 3, total_cost: 45 };
  const c = await render(Poles, { poles: [pole], options: [], items: [{ component_id: 'f1' }], onChange: () => {} });
  const json = JSON.stringify(c.toJSON());
  for (const t of ['$42.00', '$3.00', '$45.00']) assert.ok(json.includes(t), `rendered cost text ${t}`);
  assert.equal(sels(c, 'Pole material').length, 1, 'material select rendered');
  assert.equal(sels(c, 'Pole foundation').length, 1, 'parent select rendered');
  const mat = sels(c, 'Pole material')[0];
  assert.equal(mat.props.value, 'pole_X');
  const opts = mat.findAll(e => e.type === 'option');
  assert.ok(opts.some(o => o.props.value === 'pole_X' && o.props.disabled), 'disabled placeholder for missing catalog id');
  assert.equal(warn(c).length, 1, 'explicit unavailable warning');
  const addBtn = c.root.findAll(e => e.type === 'button' && (e.props.children === ' Pole' || (Array.isArray(e.props.children) && e.props.children.includes(' Pole'))));
  assert.equal(addBtn.length, 1, 'pole add button found');
  assert.ok(addBtn[0].props.disabled === true, 'pole add disabled when catalog empty');
  c.unmount();
});

await ok('poles: reassign parent keeps pole_id and cost unchanged', async () => {
  const pole = { component_id: 'po1', pole_id: 'pole_X', foundation_component_id: 'f1', pole_cost: 42, pole_painting_cost: 3, total_cost: 45 };
  let out;
  const c = await render(Poles, { poles: [pole], options: [], items: [{ component_id: 'f1' }, { component_id: 'f2' }], onChange: (v) => { out = v; } });
  await act(async () => { sels(c, 'Pole foundation')[0].props.onChange({ target: { value: 'f2' } }); });
  assert.equal(out[0].foundation_component_id, 'f2');
  assert.equal(out[0].component_id, 'po1', 'component id preserved');
  assert.equal(out[0].pole_id, 'pole_X', 'material id untouched');
  assert.equal(out[0].pole_cost, 42, 'saved pole cost untouched');
  assert.equal(out[0].pole_painting_cost, 3);
  assert.equal(out[0].total_cost, 45);
  c.unmount();
});

await ok('caps: options=[] keeps rows; missing cap id visible + warning; wall reassign clears segment', async () => {
  const cap = { component_id: 'cp1', cap_inventory_id: 'cap_X', wall_component_id: 'w1', segment_component_id: 's0', cost: 17 };
  const walls = [
    { component_id: 'w1', shape: { segments: [{ component_id: 's0' }] } },
    { component_id: 'w2', shape: { segments: [{ component_id: 'sx' }] } },
  ];
  let out;
  const c = await render(Caps, { caps: [cap], walls, options: [], onChange: (v) => { out = v; } });
  const mat = sels(c, 'Cap material')[0];
  assert.equal(mat.props.value, 'cap_X');
  assert.ok(mat.findAll(e => e.type === 'option').some(o => o.props.value === 'cap_X' && o.props.disabled));
  assert.equal(warn(c).length, 1);
  assert.ok(JSON.stringify(c.toJSON()).includes('$17.00'), 'rendered cap cost text');
  await act(async () => { sels(c, 'Cap wall')[0].props.onChange({ target: { value: 'w2' } }); });
  assert.equal(out[0].wall_component_id, 'w2');
  assert.equal(out[0].component_id, 'cp1', 'cap id preserved');
  assert.equal(out[0].cap_inventory_id, 'cap_X', 'cap material id untouched');
  assert.equal(out[0].cost, 17, 'saved cap cost untouched');
  assert.equal(out[0].segment_component_id, '', 'segment cleared on wall change');
  assert.equal(out[0].segment_index, undefined);
  c.unmount();
});

await ok('populated catalog missing selected id -> same warning; catalog restore resolves label, no onChange from render', async () => {
  const pole = { component_id: 'po1', pole_id: 'pole_X', foundation_component_id: 'f1' };
  let called = 0;
  const c = await render(Poles, { poles: [pole], options: [{ id: 'other_p', material_name: 'Other' }], items: [{ component_id: 'f1' }], onChange: () => { called++; } });
  assert.equal(warn(c).length, 1, 'missing id warns with populated catalog');
  await act(async () => { c.update(React.createElement(Poles, { poles: [pole], options: [{ id: 'pole_X', material_name: 'Steel pole X' }], items: [{ component_id: 'f1' }], onChange: () => { called++; } })); });
  const mat = sels(c, 'Pole material')[0];
  assert.equal(mat.props.value, 'pole_X');
  assert.ok(mat.findAll(e => e.type === 'option').some(o => o.props.value === 'pole_X' && !o.props.disabled && String(o.props.children) === 'Steel pole X'), 'real label resolved');
  assert.equal(warn(c).length, 0, 'warning removed on catalog restore');
  assert.equal(called, 0, 'no onChange emitted from render');
  c.unmount();
});

await ok('walls: outer + internal missing material -> disabled option + warning; honest empty state', async () => {
  const wall = { component_id: 'w1', materialId: 'brick_X', internalMaterialId: 'fill_X', includeInternalWall: true, shape: { points: [], segments: [] }, calculatedCosts: { totalCost: 123 } };
  const c = await render(Walls, { walls: [wall], options: [{ id: 'other', material_name: 'Other' }], onChange: () => {} });
  const outer = sels(c, 'Wall material')[0];
  const inner = sels(c, 'Internal wall material')[0];
  assert.equal(outer.props.value, 'brick_X');
  assert.equal(inner.props.value, 'fill_X');
  assert.ok(outer.findAll(e => e.type === 'option').some(o => o.props.value === 'brick_X' && o.props.disabled));
  assert.ok(inner.findAll(e => e.type === 'option').some(o => o.props.value === 'fill_X' && o.props.disabled));
  assert.equal(warn(c).length, 2, 'one warning per missing selection');
  assert.ok(findByText(c, /123|\$123/).length >= 1, 'displayed amount unchanged');
  const e = await render(Walls, { walls: [], options: [], onChange: () => {} });
  assert.equal(sels(e, 'Wall material').length, 0, 'no rows = no material selects');
  e.unmount(); c.unmount();
});

console.log(`PASS catalog-visibility passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
