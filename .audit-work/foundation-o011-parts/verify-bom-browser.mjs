// O-011 (CMP-A11) real-page verification: mounts the CANDIDATE FoundationBOM
// fed by the REAL calcProject pipeline (the same props FoundationEstimator
// passes at the <FoundationBOM> mount). Desktop 1280px + mobile 390px cases.
// No network: http server serves the esbuild IIFE bundle only; playwright-core
// chromium drives DOM assertions + screenshots.
import esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = here;
const ORIGIN = 'http://127.0.0.1:5194';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- fixture entry: real calcProject -> candidate FoundationBOM ----------
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoundationBOM from './foundation/FoundationBOM.jsx';
import { calcProject } from './foundation/foundationCalc.js';

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get('case') || 'valid';
const clone = (o) => JSON.parse(JSON.stringify(o));

const project = clone(seed.project);
const savedProject = clone(seed.project);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
if (mode === 'held') {
  project.signage_cabinets[1].unit_cost = undefined;      // held row
  project.landscape.cells.z9 = 'mystery-material';         // held grid line
}
if (mode === 'held-unsaved') {
  project.signage_cabinets[1].unit_cost = undefined;
  project.landscape.cells.z9 = 'mystery-material';
  delete project.total_signage_cabinet_cost;
  delete project.total_landscape_cost;
  delete savedProject.total_signage_cabinet_cost;
  delete savedProject.total_landscape_cost;
}
if (mode === 'malformed-landscape') {
  project.landscape = 'corrupt-record';
}

const calc = calcProject(project, inventory, settings, { savedProject });
const pricingBlocked = Boolean(calc.catalogIssues.length || calc.inputIssues.length);
window.__M = { mode, totals: calc.totals, landscapePricing: calc.landscapePricing,
  signageCabinetPricing: calc.signageCabinetPricing, inputIssues: calc.inputIssues,
  catalogIssues: calc.catalogIssues, pricingBlocked };

createRoot(document.getElementById('root')).render(
  React.createElement(FoundationBOM, {
    items: calc.items,
    poles: calc.poles,
    walls: calc.walls,
    delivery: calc.delivery,
    totals: calc.totals,
    inventory,
    itemPricing: calc.itemPricing,
    polePricing: calc.polePricing,
    wallPricing: calc.wallPricing,
    cabinets: project.signage_cabinets || [],
    landscape: project.landscape,
    landscapePricing: calc.landscapePricing,
    pricingUnavailable: pricingBlocked,
  }));
`;

const plugin = { name: 'h', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.join(here, 'fixture-bom') }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', metafile: true,
});
fs.writeFileSync(`${OUT}/bom-browser-metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
const bad = Object.keys(built.metafile.inputs).filter(i => /base44|base44Client|AuthContext/i.test(i));
if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }
const bundle = built.outputFiles[0].text;

// ---------- synthetic seed ----------
const SEED = {
  project: {
    id: 'p-bom', updated_date: 'v1', project_name: 'BOM Fixture', excavation_method: 'hand_dig',
    items: [{
      component_id: 'item-1', description: 'ID Sign Footing', foundation_type: 'spread_foot',
      quantity: 1, length_inches: 48, width_inches: 24, depth_inches: 24,
      selected_concrete_id: 'bag1', concrete_bags: 12, concrete_cost: 96,
      include_rebar: false, include_forming: false,
      excavation_method: 'hand_dig', item_total_cost: 96,
    }],
    walls: [], poles: [], wall_caps: [], selected_equipment: [],
    signage_cabinets: [
      { id: 'cab_1', description: 'Main ID Cabinet', mount: 'foundation', foundation_component_id: 'item-1', quantity: 2, unit_cost: 150, width_inches: 48, height_inches: 24, depth_inches: 8 },
      { id: 'cab_2', description: 'Directional Cabinet', mount: 'pole', pole_component_id: 'pole-1', quantity: 1, unit_cost: 80, width_inches: 36, height_inches: 18, depth_inches: 8 },
    ],
    landscape: { cell_size_inches: 12, cells: { a1: 'grass', a2: 'grass', b1: 'concrete', b2: 'mulch' } },
    total_signage_cabinet_cost: 380,
    total_landscape_cost: 10.75,
    customer_pricing: { applied: false },
  },
  inventory: [
    { id: 'bag1', material_name: '80lb Concrete Bag', material_type: 'bagged_concrete', cost_per_unit: 8 },
  ],
  settings: {},
};

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:8px}
  .bg-white{background:#fff}.rounded-xl{border-radius:12px}.border{border:1px solid #e5e7eb}.border-gray-200{border-color:#e5e7eb}
  .p-4{padding:16px}.font-semibold{font-weight:600}.text-gray-900{color:#111827}.mb-3{margin-bottom:12px}
  .text-sm{font-size:14px}.text-xs{font-size:12px}.text-\[11px\]{font-size:11px}.text-\[10px\]{font-size:10px}
  .text-left{text-align:left}.text-right{text-align:right}.text-gray-500{color:#6b7280}.text-gray-600{color:#4b5563}.text-gray-800{color:#1f2937}
  .border-b{border-bottom:1px solid #e5e7eb}.border-gray-100{border-color:#f3f4f6}.border-t{border-top:1px solid #e5e7eb}
  .py-1\\.5{padding-top:6px;padding-bottom:6px}.pr-3{padding-right:12px}.pl-3{padding-left:12px}
  .whitespace-nowrap{white-space:nowrap}.w-full{width:100%}table{border-collapse:collapse}
  .flex{display:flex}.justify-between{justify-content:space-between}.pt-3{padding-top:12px}.mt-1{margin-top:4px}
  .font-bold{font-weight:700}.rounded-sm{border-radius:2px}.border-amber-300{border-color:#fcd34d}.bg-amber-50{background:#fffbeb}
  .px-2{padding-left:8px;padding-right:8px}.py-1{padding-top:4px;padding-bottom:4px}
  .text-amber-800{color:#92400e}.text-amber-700{color:#b45309}.font-semibold{font-weight:600}
  .last\\:border-0:last-child{border-bottom:0}
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><div id="root"></div><script>window.__SEED=${JSON.stringify(SEED)};</script><script>${bundle}</script>`);
});
await new Promise(r => server.listen(5194, '127.0.0.1', r));

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
  await page.waitForSelector('table', { timeout: 10000 });
  return { context, page };
};
const rows = (page) => page.$$eval('tbody tr', trs => trs.map(t => [...t.querySelectorAll('td')].map(td => td.textContent.trim())));
const subtotal = (page) => page.$$eval('div', ds => (ds.find(d => d.textContent.includes('Listed cost subtotal')) || {}).textContent || '');
const banner = (page) => page.$$eval('div', ds => { const b = ds.find(d => d.textContent.includes('Pricing unavailable —')); return b ? b.textContent : ''; });

// ============ desktop valid ============
await R('desktop valid: cabinet + landscape rows priced', async () => {
  const { context, page } = await open(1280, 'valid');
  const r = await rows(page);
  const flat = JSON.stringify(r);
  assert.ok(flat.includes('Main ID Cabinet'), 'cabinet 1 row');
  assert.ok(flat.includes('Directional Cabinet'), 'cabinet 2 row');
  assert.ok(flat.includes('Site — Grass'), 'grass row');
  assert.ok(flat.includes('Site — Concrete'), 'concrete row');
  assert.ok(flat.includes('Site — Mulch'), 'mulch row');
  assert.ok(flat.includes('$300.00'), 'cabinet 1 extended $300');
  assert.ok(flat.includes('$80.00'), 'cabinet 2 $80');
  assert.ok(flat.includes('$1.50'), 'grass 2sqft x .75');
  assert.ok(flat.includes('$8.00'), 'concrete $8');
  assert.ok(flat.includes('$1.25'), 'mulch $1.25');
  assert.ok(!(await banner(page)).includes('Pricing unavailable'), 'no pricing banner');
  assert.equal(await page.evaluate(() => window.__M.pricingBlocked), false);
  await page.screenshot({ path: `${OUT}/bom-valid-1280.png`, fullPage: true });
  fs.writeFileSync(`${OUT}/bom-valid-1280-snapshot.json`, JSON.stringify({ rows: r, subtotal: await subtotal(page) }, null, 1));
  await context.close();
});

// ============ mobile valid ============
await R('mobile valid: same rows at 390px', async () => {
  const { context, page } = await open(390, 'valid');
  const flat = JSON.stringify(await rows(page));
  assert.ok(flat.includes('Main ID Cabinet') && flat.includes('Site — Grass'));
  await page.screenshot({ path: `${OUT}/bom-valid-390.png`, fullPage: true });
  await context.close();
});

// ============ held desktop ============
await R('desktop held: saved rows + Not saved + issues banner', async () => {
  const { context, page } = await open(1280, 'held');
  const r = await rows(page);
  const flat = JSON.stringify(r);
  assert.ok(flat.includes('Directional Cabinet (saved)'), 'held cabinet shows saved row');
  assert.ok(flat.includes('Not saved'), 'held costs render Not saved');
  assert.ok(flat.includes('Main ID Cabinet'), 'priced cabinet still lists');
  assert.ok(flat.includes('Site landscaping (saved)'), 'held grid shows saved aggregate row');
  const b = await banner(page);
  assert.ok(b.includes('Pricing unavailable'), 'pricing banner shown');
  assert.equal(await page.evaluate(() => window.__M.pricingBlocked), true);
  assert.equal(await page.evaluate(() => window.__M.totals.total_signage_cabinet_cost), 380, 'acknowledged total held');
  await page.screenshot({ path: `${OUT}/bom-held-1280.png`, fullPage: true });
  fs.writeFileSync(`${OUT}/bom-held-1280-snapshot.json`, JSON.stringify({ rows: r, subtotal: await subtotal(page), banner: b }, null, 1));
  await context.close();
});

// ============ held mobile ============
await R('mobile held: saved rows at 390px', async () => {
  const { context, page } = await open(390, 'held');
  const flat = JSON.stringify(await rows(page));
  assert.ok(flat.includes('Directional Cabinet (saved)') && flat.includes('Site landscaping (saved)'));
  await page.screenshot({ path: `${OUT}/bom-held-390.png`, fullPage: true });
  await context.close();
});

// ============ held-unsaved ============
await R('held with no acknowledged totals -> Not saved everywhere, no $0', async () => {
  const { context, page } = await open(1280, 'held-unsaved');
  const flat = JSON.stringify(await rows(page));
  assert.ok(flat.includes('Not saved'));
  assert.ok(!flat.includes('$0.00'), 'no fabricated $0 rows');
  await page.screenshot({ path: `${OUT}/bom-held-unsaved-1280.png`, fullPage: true });
  await context.close();
});

// ============ malformed landscape ============
await R('malformed landscape record -> saved aggregate row, no crash', async () => {
  const { context, page } = await open(1280, 'malformed-landscape');
  const flat = JSON.stringify(await rows(page));
  assert.ok(flat.includes('Site landscaping (saved)'));
  assert.equal(await page.evaluate(() => window.__M.landscapePricing.available), false);
  await context.close();
});

await browser.close();
server.close();
fs.writeFileSync(`${OUT}/bom-browser-verification.json`, JSON.stringify({ results, telemetry }, null, 1));
const failed = results.filter(r => !r.ok);
if (telemetry.pageErrors.length) console.log('PAGE ERRORS:', telemetry.pageErrors);
if (telemetry.foreign.length) console.log('FOREIGN REQUESTS:', telemetry.foreign.slice(0, 5));
if (failed.length) { console.log(`\nFAIL ${failed.length}/${results.length}`); process.exit(1); }
console.log(`\nPASS bom-browser o011 (${results.length} cases, ${telemetry.pageErrors.length} page errors, ${telemetry.foreign.length} foreign requests)`);
process.exit(0);
