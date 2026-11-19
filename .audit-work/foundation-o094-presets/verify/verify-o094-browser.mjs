// O-094 (CMP-H03) real-browser verification: mounts the CANDIDATE
// FoundationTemplateDialog (preset pick section) plus a model-ops panel that
// exercises duplicate/mirror/bulk inside real Chromium at 1280px and 390px.
// esbuild + playwright-core; the @ alias resolves into fixture-browser/src so
// candidate code runs, never a replica. No network beyond the local server;
// foreign-request telemetry asserted empty.
import esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UNIT = path.resolve(here, '..');
const OUT = UNIT;
const ORIGIN = 'http://127.0.0.1:5297';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- harness entry ----------
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoundationTemplateDialog from './fixture-browser/src/components/estimator/foundation/FoundationTemplateDialog.jsx';
import { duplicateFoundationAssembly, mirrorFoundationAssembly } from './fixture-browser/src/components/estimator/foundation/foundationDuplicateMirror.js';
import { applyFoundationBulkMaterial } from './fixture-browser/src/components/estimator/foundation/foundationBulkMaterialChange.js';
import { applyFoundationAssemblyPreset } from './fixture-browser/src/components/estimator/foundation/foundationAssemblyPresets.js';
import { prepareFoundationTemplatePatch } from './fixture-browser/src/components/estimator/foundation/foundationTemplateModel.js';

const mode = new URLSearchParams(location.search).get('case') || 'dialog-load';
let n = 0;
const ids = (k) => 'k-' + k + '-' + (++n);

window.__tplRows = [
  { id: 't1', template_name: 'Saved pylon', project_data: { items: [{ component_id: 'a' }] } },
];

const proj = {
  id: 'fp-1',
  items: [
    { component_id: 'it1', foundation_type: 'spread_foot', quantity: 1, length_inches: 96, width_inches: 64, depth_inches: 24, rotation_degrees: 30, x_inches: 100, z_inches: 100, selected_concrete_id: 'mix-a', selected_forming_id: 'form-1' },
    { component_id: 'it2', foundation_type: 'pillar', quantity: 1, diameter: 24, depth_inches: 36, x_inches: 300, z_inches: 200, selected_concrete_id: '', selected_forming_id: 'form-1' },
  ],
  walls: [],
  poles: [
    { component_id: 'p1', pole_id: 'pole-stl', height_inches: 240, foundation_component_id: 'it1', foundation_idx: 0, x_inches: 120, z_inches: 110, signs: [] },
  ],
  wall_caps: [],
  signage_cabinets: [],
  selected_concrete_id: 'mix-a',
};

let el;
if (mode === 'dialog-load' || mode === 'dialog-apply') {
  el = React.createElement(FoundationTemplateDialog, {
    open: true, mode: 'load', onClose: () => { window.__closed = true; },
    project: { id: 'p', items: [] },
    onApply: (data) => {
      window.__appliedData = data;
      // the real page gate — proves the dialog payload is apply-ready
      window.__appliedPatch = prepareFoundationTemplatePatch(data, { createId: ids });
      return true;
    },
  });
} else if (mode === 'ops-panel') {
  const dup = duplicateFoundationAssembly(proj, { component_ids: ['it1'], createId: ids, offset_inches: { x: 24, z: 8 } });
  const mir = mirrorFoundationAssembly(proj, { component_ids: ['it1'], createId: ids });
  const inplace = mirrorFoundationAssembly(proj, { component_ids: ['it1'], mode: 'reflect', at: 200 });
  const blk = applyFoundationBulkMaterial(proj, { target: 'concrete', value: 'mix-b' });
  const preset = applyFoundationAssemblyPreset(proj, 'pylon-pole-on-pier', { createId: ids });
  window.__ops = { dup, mir, inplace, blk, preset };
  const merged = { ...proj, ...dup.patch };
  el = React.createElement('pre', { id: 'ops' }, JSON.stringify({
    dupItems: merged.items.length, dupPoles: merged.poles.length,
    dupX: merged.items[2].x_inches, dupZ: merged.items[2].z_inches,
    dupPoleAnchor: merged.poles[1].foundation_component_id === merged.items[2].component_id,
    mirX: mir.patch.items[2].x_inches, mirRot: mir.patch.items[2].rotation_degrees,
    inplaceX: inplace.patch.items.find(r => r.component_id === 'it1').x_inches,
    bulkProject: blk.patch.selected_concrete_id,
    bulkItem: blk.patch.items.every(r => r.selected_concrete_id === 'mix-b'),
    presetItems: preset.patch.items.length, presetAnchor: preset.patch.poles[0].foundation_component_id === preset.patch.items[0].component_id,
  }));
}
window.__M = { mode };
createRoot(document.getElementById('root')).render(el);
`;

const plugin = { name: 'h', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: UNIT }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  metafile: true, alias: { '@': path.resolve(`${UNIT}/fixture-browser/src`) },
});
fs.writeFileSync(`${OUT}/verify/o094-browser-metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
const bad = Object.keys(built.metafile.inputs).filter(i => /AuthContext|staffEntities|integrations/i.test(i));
if (bad.length) { console.error('AUTH/SDK IN BUNDLE:', bad); process.exit(1); }
const bundle = built.outputFiles[0].text;

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:8px}
  .border{border:1px solid #e5e7eb}.rounded-sm{border-radius:2px}
  .border-gray-300{border-color:#d1d5db}.border-gray-200{border-color:#e5e7eb}.bg-white{background:#fff}
  .border-red-200{border-color:#fecaca}.bg-red-50{background:#fef2f2}
  .border-amber-200{border-color:#fde68a}.bg-amber-50{background:#fffbeb}
  .px-2{padding-left:8px;padding-right:8px}.px-3{padding-left:12px;padding-right:12px}
  .px-4{padding-left:16px;padding-right:16px}
  .py-1{padding-top:4px;padding-bottom:4px}.py-1\\.5{padding-top:6px;padding-bottom:6px}
  .py-2{padding-top:8px;padding-bottom:8px}.py-4{padding-top:16px;padding-bottom:16px}
  .mb-1{margin-bottom:4px}.mt-1{margin-top:4px}
  .flex{display:flex}.items-center{align-items:center}.gap-2{gap:8px}
  .flex-1{flex:1}.justify-end{justify-content:flex-end}
  .text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.text-\\[12px\\]{font-size:12px}.text-\\[15px\\]{font-size:15px}
  .font-semibold{font-weight:600}.font-bold{font-weight:700}
  .uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.025em}
  .text-violet-600{color:#7c3aed}.text-amber-800{color:#92400e}
  .text-gray-800{color:#1f2937}.text-gray-700{color:#374151}.text-gray-500{color:#6b7280}.text-gray-400{color:#9ca3af}
  .text-red-700{color:#b91c1c}
  .w-4{width:16px}.h-4{height:16px}.h-\\[26px\\]{height:26px}.h-\\[30px\\]{height:30px}
  .max-w-\\[520px\\]{max-width:520px}.max-h-\\[320px\\]{max-height:320px}.overflow-y-auto{overflow-y:auto}
  .divide-y>*+*{border-top:1px solid #e5e7eb}.divide-gray-100>*+*{border-color:#f3f4f6}.divide-gray-200>*+*{border-color:#e5e7eb}
  .space-y-2>*+*{margin-top:8px}.space-y-3>*+*{margin-top:12px}.space-y-4>*+*{margin-top:16px}
  .w-full{width:100%}.block{display:block}
  .bg-lime-300{background:#bef264}.border-lime-400{border-color:#a3e635}
  .disabled\\:opacity-60:disabled{opacity:.6}.hover\\:text-red-600:hover{color:#dc2626}
  .focus\\:outline-none:focus{outline:none}.focus\\:border-red-400:focus{border-color:#f87171}
  button{cursor:pointer;background:#fff}
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><div id="root"></div><script>${bundle}</script>`);
});
await new Promise(r => server.listen(5297, '127.0.0.1', r));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log('ok  -', name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.message || e) }); console.log('FAIL-', name, ':', String(e.message || e).slice(0, 500)); }
};
const open = async (width, mode) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.on('request', (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ mode, url: r.url() }); } catch {} });
  page.on('pageerror', (e) => telemetry.pageErrors.push({ mode, error: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') telemetry.consoleErrors.push({ mode, text: m.text().slice(0, 200) }); });
  await page.goto(`${ORIGIN}/?case=${mode}`);
  await page.waitForSelector('#root > *', { timeout: 10000 });
  return { context, page };
};

const PRESET_NAMES = ['Single spread footing', 'Single pillar pier', 'Pylon pole on pier', 'Twin pole monument', 'Monument base with wall cap', 'Open L wall on footing'];

for (const width of [1280, 390]) {
  const tag = width === 1280 ? 'desktop' : 'mobile';
  await R(`dialog ${tag}: preset pick section renders all 6 presets + disclosure`, async () => {
    const { context, page } = await open(width, 'dialog-load');
    const body = await page.textContent('#root');
    assert.ok(body.includes('Start from an assembly preset'), 'section header');
    assert.ok(body.includes('replaces the current foundation assembly sections'), 'replace disclosure');
    for (const n of PRESET_NAMES) assert.ok(body.includes(n), `missing preset ${n}`);
    assert.ok(body.includes('2 foundations · 2 poles · 2 cabinets'), 'twin-pole counts');
    assert.ok(body.includes('Saved pylon'), 'saved templates still list');
    await page.screenshot({ path: `${OUT}/dialog-load-${width}.png`, fullPage: true });
    await context.close();
  });
}

await R('dialog: preset Apply produces a page-gate-ready patch and closes', async () => {
  const { context, page } = await open(1280, 'dialog-apply');
  // Monument base is the 5th preset Apply button on the page (index 4)
  const applies = page.locator('button', { hasText: 'Apply' });
  await applies.nth(4).click();
  await page.waitForFunction('window.__appliedData !== undefined', { timeout: 5000 });
  const applied = await page.evaluate(() => window.__appliedData);
  for (const k of ['items', 'walls', 'poles', 'wall_caps', 'signage_cabinets']) assert.ok(Array.isArray(applied[k]), `applied.${k}`);
  const patch = await page.evaluate(() => window.__appliedPatch);
  const wall = patch.walls[0];
  const segIds = new Set(wall.shape.segments.map(s => s.component_id));
  for (const cap of patch.wall_caps) { assert.equal(cap.wall_component_id, wall.component_id); assert.ok(segIds.has(cap.segment_component_id)); }
  assert.ok(patch.items[0].component_id !== 'preset_monument_item_1', 'fresh ids minted by the real gate');
  await page.waitForFunction('window.__closed === true', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/dialog-apply-1280.png`, fullPage: true });
  await context.close();
});

await R('model ops in-browser: duplicate/mirror/bulk/preset produce merge-ready patches', async () => {
  const { context, page } = await open(1280, 'ops-panel');
  const ops = await page.evaluate(() => JSON.parse(document.getElementById('ops').textContent));
  assert.deepEqual(ops, {
    dupItems: 3, dupPoles: 2, dupX: 124, dupZ: 108, dupPoleAnchor: true,
    mirX: 284, mirRot: 330,
    inplaceX: 204,
    bulkProject: 'mix-b', bulkItem: true,
    presetItems: 1, presetAnchor: true,
  }, JSON.stringify(ops));
  await page.screenshot({ path: `${OUT}/ops-panel-1280.png`, fullPage: true });
  await context.close();
});

await R('zero foreign requests / console errors / page errors', async () => {
  assert.deepEqual(telemetry.foreign, [], JSON.stringify(telemetry.foreign));
  assert.deepEqual(telemetry.consoleErrors, [], JSON.stringify(telemetry.consoleErrors));
  assert.deepEqual(telemetry.pageErrors, [], JSON.stringify(telemetry.pageErrors));
});

fs.writeFileSync(`${OUT}/verify/o094-browser-verification.json`, JSON.stringify({ results, telemetry }, null, 1));
await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} o094-browser (${results.length - failed.length}/${results.length} cases)`);
process.exit(failed.length ? 1 : 0);
