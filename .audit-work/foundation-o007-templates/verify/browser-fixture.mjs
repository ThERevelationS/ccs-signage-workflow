// O-007 (CMP-A07) — real-DOM browser check: baseline dialog (unchanged at HEAD,
// O-014) bundled with the CANDIDATE foundationTemplateModel. Covers the new
// template coverage (links/AI brief/pricing selection/rates), the page-wired
// saveDisabled gate, and a full save->stored->apply->merge round-trip in a real
// DOM. Stub entities only; no Base44 SDK/network. 127.0.0.1:5173 only.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const UNIT = '.audit-work/foundation-o007-templates';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const BASE = `${UNIT}/baseline`;

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>window.__api.get(id)}}};`,
  '@/components/ui/dialog': `import React from 'react';export const Dialog=(p)=>p.open?React.createElement('div',{'data-dialog':'1'},p.children):null;export const DialogContent=(p)=>React.createElement('div',{},p.children);export const DialogHeader=(p)=>React.createElement('div',{},p.children);export const DialogTitle=(p)=>React.createElement('h2',{},p.children);`,
  'lucide-react': `export const Trash2=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>window.__api.save(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{window.__calls.push(['delete',a.record.id]);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(window.__loadErr)throw window.__loadErr;return window.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);`,
};

const REDIRECT = {
  // Baseline dialog imports the model relatively: redirect to the CANDIDATE so
  // the real DOM save path exercises the extended allowlist + pricing sanitize.
  './foundationTemplateModel': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationTemplateModel.js': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationAssemblyModel': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationAssemblyModel.js': path.resolve(`${BASE}/foundationAssemblyModel.js`),
};

const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationTemplateDialog from '${path.resolve(`${BASE}/FoundationTemplateDialog.jsx`).replace(/\\/g, '/')}';
import { prepareFoundationTemplatePatch } from '${path.resolve(`${CAND}/foundationTemplateModel.js`).replace(/\\/g, '/')}';

window.__calls = [];
window.__appliedProject = null;
let seq = 0;
const freshId = (kind) => 'b_' + kind + '_' + (seq++);

const project = {
  id: 'p-src', project_name: 'Src', client_name: 'Cust A', customer_id: 'cust-A', estimate_number: 'E-9',
  hyperlink: 'https://plans.example.com/a.pdf', beautify_data_url: 'data:image/png;base64,AAA',
  customer_markup_percent: 12, customer_price_override: 900,
  customer_pricing: { applied: true, tier_number: 2, tier_name: 'Silver', total: 4321, lines: [{ label: 'x' }] },
  concrete_cost_per_cy: 150, rebar_cost_per_ft: 0.8,
  pricing_engine: { customer_tier: 2 }, builder_sync_attempt: { key: 's' }, total_concrete_cost: 999,
  items: [{ component_id: 'it1', foundation_type: 'pillar', quantity: 1,
    reinforcement_calculation_version: 2,
    reinforcement_design: { version: 2, spread: { mats: [{ id: 'm1' }], inter_mat_ties: [{ id: 't1', from_mat_id: 'm1', to_mat_id: 'm1' }] } } }],
  poles: [{ component_id: 'po1', foundation_component_id: 'it1', signs: [{ component_id: 'sg1' }] }],
  walls: [{ component_id: 'w1', shape: { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], segments: [{ component_id: 'se1' }, { component_id: 'se2' }] } }],
  wall_caps: [{ component_id: 'wc1', wall_component_id: 'w1', segment_component_id: 'se2' }],
  signage_cabinets: [{ component_id: 'cb1', mount: 'pole', pole_component_id: 'po1' }],
  landscape: { cell_size_inches: 12, cells: { '0,0': 'mulch' } },
  notes: 'n',
};

function App() {
  const [dlg, setDlg] = useState({ open: false, mode: 'load', saveDisabled: false, saveDisabledReason: '' });
  window.__openSave = (gate) => setDlg({ open: true, mode: 'save', saveDisabled: !!(gate && gate.disabled), saveDisabledReason: (gate && gate.reason) || '' });
  window.__openLoad = () => setDlg({ open: true, mode: 'load', saveDisabled: false, saveDisabledReason: '' });
  return React.createElement('div', {},
    React.createElement('h1', { id: 'fx' }, 'SYNTHETIC O-007 FIXTURE - not Base44'),
    React.createElement(FoundationTemplateDialog, {
      open: dlg.open, mode: dlg.mode, project,
      saveDisabled: dlg.saveDisabled, saveDisabledReason: dlg.saveDisabledReason,
      onClose: () => { window.__closed = (window.__closed || 0) + 1; setDlg({ open: false, mode: dlg.mode, saveDisabled: false, saveDisabledReason: '' }); },
      onApply: (data) => {
        // Mirror of the page mount: prepare -> commit-style merge.
        const patch = prepareFoundationTemplatePatch(data, { createId: freshId });
        window.__appliedProject = { ...project, ...patch, client_name: 'Cust B', customer_id: 'cust-B', estimate_number: 'E-77' };
        window.__appliedPatch = patch;
        return true;
      },
    }));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
`;

const plugin = { name: 's', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onResolve({ filter: /.*/ }, a => {
    if (STUBS[a.path]) return { path: path.resolve('stub-' + a.path.replace(/[^a-z0-9]/gi, '_')), namespace: 's' };
    if (REDIRECT[a.path]) return { path: REDIRECT[a.path] };
    return undefined;
  });
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.resolve('.') }));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => { const key = Object.keys(STUBS).find(k => path.resolve('stub-' + k.replace(/[^a-z0-9]/gi, '_')) === a.path); return { contents: STUBS[key], loader: 'js', resolveDir: path.resolve('.') }; });
}};

const built = await esbuild.build({ entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', metafile: true });
const sdkReal = Object.keys(built.metafile.inputs).filter(i => /node_modules.*base44|@base44|api\/base44Client\.(js|ts)/i.test(i));
fs.writeFileSync(`${UNIT}/verify/metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
if (sdkReal.length) { console.error('BUNDLE CONTAINS BASE44 SDK:', sdkReal); process.exit(1); }

const server = http.createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><title>SYNTHETIC non-Base44 fixture</title><body><div id=root></div><script>${built.outputFiles[0].text}</script>`);
});
await new Promise(r => server.listen(5173, '127.0.0.1', r));

const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const run = async (viewport, tag) => {
  const page = await browser.newPage({ viewport });
  const foreignReqs = [];
  page.on('dialog', (d) => { d.accept(); });
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:5173')) foreignReqs.push(r.url()); });
  page.on('pageerror', (e) => results.push({ case: `${tag} pageerror`, ok: false, error: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') results.push({ case: `${tag} console.error`, ok: false, error: m.text() }); });
  await page.route('**/*', (r) => { if (r.request().url().startsWith('http://127.0.0.1:5173')) r.continue(); else r.abort(); });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(600);
  const S = async (name, fn) => {
    try { const out = await fn() || {}; results.push({ case: `${tag} ${name}`, ok: true, ...out }); }
    catch (e) { results.push({ case: `${tag} ${name}`, ok: false, error: String(e) }); }
  };

  await S('template save stores extended allowlist (links, AI brief, pricing selection, rates); forbidden fields absent', async () => {
    await page.evaluate(() => {
      window.__saved = null; window.__closed = 0;
      window.__api = { get: async () => { throw new Error('unused'); }, save: async (a) => { window.__saved = a.data; return { id: 't1', ...a.data }; } };
      window.__openSave();
    });
    await page.waitForTimeout(250);
    await page.locator('input').first().fill('Full design');
    await page.locator('button:has-text("Save Template")').click();
    await page.waitForTimeout(400);
    const pd = await page.evaluate(() => window.__saved?.project_data);
    assert.ok(pd, 'project_data stored');
    assert.equal(pd.hyperlink, 'https://plans.example.com/a.pdf');
    assert.equal(pd.beautify_data_url, 'data:image/png;base64,AAA');
    assert.deepEqual(pd.customer_pricing, { applied: true, tier_number: 2 });
    assert.equal(pd.customer_markup_percent, 12);
    assert.equal(pd.customer_price_override, 900);
    assert.equal(pd.concrete_cost_per_cy, 150);
    assert.ok(pd.items[0].reinforcement_design.spread.mats[0].id === 'm1', 'accepted design carried');
    for (const k of ['client_name', 'customer_id', 'estimate_number', 'pricing_engine', 'builder_sync_attempt', 'total_concrete_cost', 'id', 'status']) {
      assert.ok(!(k in pd), `forbidden ${k} in template`);
    }
    await page.screenshot({ path: `${UNIT}/verify/browser-save-${tag}.png` });
  });

  await S('page-wired gate: saveDisabled + reason renders amber note, disabled action, zero service calls', async () => {
    await page.evaluate(() => {
      window.__saveCalls = 0; window.__closed = 0;
      window.__api = { get: async () => { throw new Error('unused'); }, save: async () => { window.__saveCalls += 1; return { id: 't2' }; } };
      window.__openSave({ disabled: true, reason: 'Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template.' });
    });
    await page.waitForTimeout(300);
    const html = await page.locator('[data-dialog]').innerText();
    assert.ok(html.includes('Pricing unavailable'), 'reason note in DOM');
    const btn = page.locator('button:has-text("Save Template")');
    assert.equal(await btn.isDisabled(), true, 'button disabled');
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__saveCalls), 0, 'no service call');
    await page.screenshot({ path: `${UNIT}/verify/browser-gated-${tag}.png` });
    await page.evaluate(() => { window.__openSave(); }); // ungate for next cases
  });

  await S('save -> stored -> apply -> merge round-trips all covered fields with remapped ids and preserved identity', async () => {
    await page.evaluate(() => {
      window.__tplRows = [{ id: 't9', template_name: 'Full', project_data: window.__saved.project_data }];
      window.__appliedProject = null; window.__appliedPatch = null;
      window.__openLoad();
    });
    await page.waitForTimeout(400);
    await page.locator('button:has-text("Apply")').click();
    await page.waitForTimeout(400);
    const merged = await page.evaluate(() => window.__appliedProject);
    assert.ok(merged, 'apply produced a merged project');
    // Design fields round-trip.
    assert.equal(merged.hyperlink, 'https://plans.example.com/a.pdf');
    assert.equal(merged.beautify_data_url, 'data:image/png;base64,AAA');
    assert.deepEqual(merged.customer_pricing, { applied: true, tier_number: 2 });
    assert.equal(merged.customer_markup_percent, 12);
    assert.equal(merged.concrete_cost_per_cy, 150);
    assert.deepEqual(merged.landscape, { cell_size_inches: 12, cells: { '0,0': 'mulch' } });
    // Identity preserved on the target.
    assert.equal(merged.client_name, 'Cust B');
    assert.equal(merged.customer_id, 'cust-B');
    assert.equal(merged.estimate_number, 'E-77');
    // Fresh component ids + consistent remaps.
    const it = merged.items[0];
    assert.notEqual(it.component_id, 'it1');
    assert.equal(merged.poles[0].foundation_component_id, it.component_id);
    assert.equal(merged.signage_cabinets[0].pole_component_id, merged.poles[0].component_id);
    const segs = merged.walls[0].shape.segments.map(s => s.component_id);
    assert.equal(merged.wall_caps[0].wall_component_id, merged.walls[0].component_id);
    assert.equal(merged.wall_caps[0].segment_component_id, segs[1]);
    // Accepted design preserved verbatim.
    assert.deepEqual(it.reinforcement_design.spread.inter_mat_ties, [{ id: 't1', from_mat_id: 'm1', to_mat_id: 'm1' }]);
    await page.screenshot({ path: `${UNIT}/verify/browser-apply-${tag}.png` });
  });

  assert.equal(foreignReqs.length, 0, `${tag} foreign requests: ${foreignReqs.join(',')}`);
  await page.close();
};

await run({ width: 1280, height: 800 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');

await browser.close();
server.close();
fs.writeFileSync(`${UNIT}/verify/browser-results.json`, JSON.stringify(results, null, 1));
const failed = results.filter(r => !r.ok);
results.forEach(r => console.log(r.ok ? 'ok' : 'FAIL', r.case, r.error || ''));
console.log(`\n${results.length - failed.length}/${results.length} browser cases pass`);
process.exit(failed.length ? 1 : 0);
