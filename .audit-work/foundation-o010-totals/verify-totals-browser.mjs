// O-010 (CMP-A10) real-page verification: mounts the CANDIDATE
// FoundationTotals + CustomerPricingPanel with the exact props the page
// passes — real foundationCalc money/format, real foundationSellPricing
// detection chain (wire + pricingEngine + pricingTemplateModel). Desktop
// 1280px + mobile 390px. No network: http server serves the esbuild IIFE
// bundle only; playwright-core chromium drives DOM assertions + screenshots.
import esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = here;
const ORIGIN = 'http://127.0.0.1:5197';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- harness entry ----------
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoundationTotals from './src/components/estimator/foundation/FoundationTotals.jsx';
import CustomerPricingPanel from './src/components/estimator/foundation/CustomerPricingPanel.jsx';

const mode = new URLSearchParams(location.search).get('case') || 'totals-equal';
const noop = () => {};

const TOTALS = {
  total_concrete_volume_cy: 1.78, total_excavation_volume_cy: 2.22, total_labor_hours: 3.5,
  total_concrete_cost: 96, total_rebar_cost: 44, total_excavation_cost: 30,
  total_forming_materials_cost: 20, total_labor_cost: 40, total_brick_cost: 70,
  total_fill_cost: 15, total_wall_cost: 120, total_pole_cost: 120,
  total_pole_painting_cost: 35, total_equipment_cost: 50, total_wall_cap_cost: 10,
  grand_total: 465,
};
const SECTION = 565.75; // grand_total + cabinets(100) + landscape(0.75)

const cases = {
  // ---- FoundationTotals saved-vs-current ----
  'totals-equal':      { kind: 'totals', saved: 565.75, current: 565.75 },
  'totals-delta':      { kind: 'totals', saved: 505.75, current: 565.75 },
  'totals-delta-down': { kind: 'totals', saved: 605.75, current: 565.75 },
  'totals-eps-boundary': { kind: 'totals', saved: 565.75, current: 565.755 },
  'totals-eps-over':   { kind: 'totals', saved: 565.75, current: 565.756 },
  'totals-unsaved':    { kind: 'totals', saved: null, current: 565.75 },
  'totals-blocked':    { kind: 'totals', saved: 505.75, current: null },
  // ---- CustomerPricingPanel precedence ----
  'panel-manual':      { kind: 'panel', project: { customer_markup_percent: 20 } },
  'panel-override':    { kind: 'panel', project: { customer_markup_percent: 20, customer_price_override: 800 } },
  'panel-tier':        { kind: 'panel', project: { customer_markup_percent: 20, customer_pricing: { applied: true, tier_number: 2, total: 900 } } },
  'panel-tier-equal':  { kind: 'panel', project: { customer_markup_percent: 0, customer_pricing: { applied: true, tier_number: 2, total: 565.75 } } },
  'panel-tier-unsaved':{ kind: 'panel', project: { customer_markup_percent: 20, customer_pricing: { applied: true, tier_number: 2 } } },
  'panel-tier-override':{ kind: 'panel', project: { customer_markup_percent: 20, customer_price_override: 800, customer_pricing: { applied: true, tier_number: 2, total: 900 } } },
  'panel-engine':      { kind: 'panel', project: { total_concrete_cost: 96, customer_pricing: { applied: true, tier_number: 1, total: 700 }, pricing_engine: { default_markup_pct: 50 } } },
};

const c = cases[mode] || cases['totals-equal'];
let el;
if (c.kind === 'totals') {
  el = React.createElement(FoundationTotals, {
    totals: TOTALS,
    pricingUnavailable: c.current === null,
    savedSectionTotal: c.saved,
    sectionTotal: c.current,
  });
} else {
  el = React.createElement(CustomerPricingPanel, {
    cost: SECTION,
    project: c.project,
    onChange: noop,
  });
}
window.__M = { mode };
createRoot(document.getElementById('root')).render(el);
`;

const uiStub = {
  name: 'ui-stub',
  setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/input$/ }, () => ({ path: 'input-stub', namespace: 'ui' }));
    b.onLoad({ filter: /.*/, namespace: 'ui' }, () => ({
      contents: `import React from 'react';
        export const Input = React.forwardRef(function Input(props, ref) {
          return React.createElement('input', { ...props, ref, className: 'ui-input ' + (props.className || '') });
        });
        export default Input;`,
      loader: 'jsx', resolveDir: path.join(here, 'fixture-browser'),
    }));
  },
};

const plugin = { name: 'h', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.join(here, 'fixture-browser') }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin, uiStub], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', metafile: true,
});
fs.writeFileSync(`${OUT}/totals-browser-metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
const bad = Object.keys(built.metafile.inputs).filter(i => /base44Client|AuthContext|staffEntities/i.test(i));
if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }
const bundle = built.outputFiles[0].text;

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:8px}
  .bg-white{background:#fff}.rounded-xl{border-radius:12px}.rounded-sm{border-radius:2px}.rounded-lg{border-radius:8px}
  .border{border:1px solid #e5e7eb}.border-gray-200{border-color:#e5e7eb}.border-gray-100{border-color:#f3f4f6}
  .border-t{border-top:1px solid #e5e7eb}.border-b{border-bottom:1px solid #e5e7eb}
  .border-amber-300{border-color:#fcd34d}.bg-amber-50{background:#fffbeb}
  .border-blue-200{border-color:#bfdbfe}.bg-blue-50{background:#eff6ff}.text-blue-800{color:#1e40af}
  .border-gray-300{border-color:#d1d5db}.bg-slate-50{background:#f8fafc}
  .p-4{padding:16px}.p-3{padding:12px}.px-2{padding-left:8px;padding-right:8px}.py-1{padding-top:4px;padding-bottom:4px}
  .py-2{padding-top:8px;padding-bottom:8px}.pt-3{padding-top:12px}.pt-2{padding-top:8px}.pt-1{padding-top:4px}
  .mt-1{margin-top:4px}.mt-3{margin-top:12px}.mb-3{margin-bottom:12px}
  .font-semibold{font-weight:600}.font-bold{font-weight:700}
  .text-sm{font-size:14px}.text-xs{font-size:12px}.text-base{font-size:16px}.text-\[11px\]{font-size:11px}
  .text-\[12px\]{font-size:12px}.text-\[13px\]{font-size:13px}.text-\[14px\]{font-size:14px}.text-\[10px\]{font-size:10px}
  .text-gray-900{color:#111827}.text-gray-800{color:#1f2937}.text-gray-700{color:#374151}.text-gray-600{color:#4b5563}
  .text-gray-500{color:#6b7280}.text-gray-400{color:#9ca3af}.text-red-600{color:#dc2626}.text-red-700{color:#b91c1c}
  .text-amber-700{color:#b45309}.text-amber-800{color:#92400e}
  .flex{display:flex}.justify-between{justify-content:space-between}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}
  .grid-cols-3{grid-template-columns:repeat(3,1fr)}.gap-2{gap:8px}.gap-3{gap:12px}
  .space-y-1>*+*{margin-top:4px}.space-y-1\\.5>*+*{margin-top:6px}.space-y-3>*+*{margin-top:12px}
  .text-center{text-align:center}.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.025em}
  .max-w-xl{max-width:36rem}.w-full{width:100%}.block{display:block}.sticky{position:sticky}.top-4{top:16px}
  .ui-input{width:100%;border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;margin-top:2px}
  label{display:block}
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><div id="root"></div><script>${bundle}</script>`);
});
await new Promise(r => server.listen(5197, '127.0.0.1', r));

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
  await page.waitForSelector('#root > div', { timeout: 10000 });
  return { context, page };
};
const strips = (page) => page.$$eval('[role="status"]', ds => ds.map(d => d.textContent.trim()));
const statuses = strips;

// ============ totals: identical -> no strip ============
await R('totals identical: no advisory strip (no spurious fire)', async () => {
  const { context, page } = await open(1280, 'totals-equal');
  assert.deepEqual(await strips(page), []);
  assert.ok((await page.textContent('#root')).includes('Total'));
  await page.screenshot({ path: `${OUT}/totals-equal-1280.png`, fullPage: true });
  await context.close();
});

// ============ totals: delta -> advisory strip ============
await R('totals delta: Saved $X — current $Y advisory strip', async () => {
  const { context, page } = await open(1280, 'totals-delta');
  const s = await strips(page);
  assert.equal(s.length, 1);
  assert.ok(s[0].includes('Saved $505.75 — current $565.75'), s[0]);
  assert.ok(s[0].includes('+$60.00'));
  assert.ok(s[0].includes('recalculated'));
  await page.screenshot({ path: `${OUT}/totals-delta-1280.png`, fullPage: true });
  await context.close();
});

await R('totals delta downward: minus sign + absolute delta', async () => {
  const { context, page } = await open(1280, 'totals-delta-down');
  const s = await strips(page);
  assert.ok(s[0].includes('Saved $605.75 — current $565.75'));
  assert.ok(s[0].includes('−$40.00'));
  await context.close();
});

// ============ totals: tolerance boundary ============
await R('totals eps: |delta| == 0.005 does not fire; 0.006 fires', async () => {
  {
    const { context, page } = await open(1280, 'totals-eps-boundary');
    assert.deepEqual(await strips(page), [], '0.005 boundary never fires');
    await context.close();
  }
  {
    const { context, page } = await open(1280, 'totals-eps-over');
    const s = await strips(page);
    assert.equal(s.length, 1, '0.006 fires');
    await context.close();
  }
});

// ============ totals: unsaved record -> nothing ============
await R('totals unsaved: null saved -> no strip', async () => {
  const { context, page } = await open(1280, 'totals-unsaved');
  assert.deepEqual(await strips(page), []);
  await context.close();
});

// ============ totals: pricing unavailable variant ============
await R('totals blocked: saved total persists while current unavailable', async () => {
  const { context, page } = await open(1280, 'totals-blocked');
  const s = await strips(page);
  assert.equal(s.length, 1);
  assert.ok(s[0].includes('Saved section total $505.75 — current pricing unavailable.'), s[0]);
  assert.ok((await page.textContent('#root')).includes('Pricing unavailable'));
  await page.screenshot({ path: `${OUT}/totals-blocked-1280.png`, fullPage: true });
  await context.close();
});

// ============ panel: manual only -> no note ============
await R('panel manual: no precedence note when no tier/engine', async () => {
  const { context, page } = await open(1280, 'panel-manual');
  assert.deepEqual(await statuses(page), []);
  assert.ok((await page.textContent('#root')).includes('$678.90')); // 565.75*1.2
  await context.close();
});

// ============ panel: applied tier shadows baseline ============
await R('panel tier: precedence note when applied tier shadows manual price', async () => {
  const { context, page } = await open(1280, 'panel-tier');
  const s = await statuses(page);
  assert.equal(s.length, 1);
  assert.ok(s[0].includes('Applied Tier 2 pricing ($900.00) is the live customer price'), s[0]);
  assert.ok(s[0].includes('not used while a tier is applied'));
  // Baseline still displayed (stored, not used):
  assert.ok((await page.textContent('#root')).includes('$678.90'));
  await page.screenshot({ path: `${OUT}/panel-tier-1280.png`, fullPage: true });
  await context.close();
});

await R('panel tier-equal: no note when tier total matches baseline (no spurious fire)', async () => {
  const { context, page } = await open(1280, 'panel-tier-equal');
  assert.deepEqual(await statuses(page), []);
  await context.close();
});

await R('panel tier-unsaved: no note while tier applied but no saved total yet', async () => {
  const { context, page } = await open(1280, 'panel-tier-unsaved');
  assert.deepEqual(await statuses(page), []);
  await context.close();
});

await R('panel tier+override: note still fires — tier shadows both manual fields', async () => {
  const { context, page } = await open(1280, 'panel-tier-override');
  const s = await statuses(page);
  assert.equal(s.length, 1);
  assert.ok(s[0].includes('Applied Tier 2 pricing ($900.00)'));
  await context.close();
});

// ============ panel: engine config ============
await R('panel engine: engine-config note names the precedence chain', async () => {
  const { context, page } = await open(1280, 'panel-engine');
  const s = await statuses(page);
  assert.equal(s.length, 1);
  assert.ok(s[0].includes('Pricing-engine configuration'), s[0]);
  assert.ok(s[0].includes('pricing engine → applied tier → price override → markup %'));
  await page.screenshot({ path: `${OUT}/panel-engine-1280.png`, fullPage: true });
  await context.close();
});

// ============ mobile ============
await R('mobile: delta strip wraps cleanly at 390px', async () => {
  const { context, page } = await open(390, 'totals-delta');
  const s = await strips(page);
  assert.equal(s.length, 1);
  const box = await page.evaluate(() => {
    const el = document.querySelector('div[role="status"]');
    const r = el.getBoundingClientRect();
    return { w: r.width, right: r.right, vw: window.innerWidth };
  });
  assert.ok(box.right <= box.vw + 1, 'strip stays inside viewport');
  await page.screenshot({ path: `${OUT}/totals-delta-390.png`, fullPage: true });
  await context.close();
});

await R('mobile: tier precedence note at 390px', async () => {
  const { context, page } = await open(390, 'panel-tier');
  const s = await statuses(page);
  assert.equal(s.length, 1);
  await page.screenshot({ path: `${OUT}/panel-tier-390.png`, fullPage: true });
  await context.close();
});

await browser.close();
server.close();
fs.writeFileSync(`${OUT}/totals-browser-verification.json`, JSON.stringify({ results, telemetry }, null, 1));
const failed = results.filter(r => !r.ok);
if (telemetry.pageErrors.length) console.log('PAGE ERRORS:', telemetry.pageErrors);
if (telemetry.foreign.length) console.log('FOREIGN REQUESTS:', telemetry.foreign.slice(0, 5));
if (failed.length) { console.log(`\nFAIL ${failed.length}/${results.length}`); process.exit(1); }
console.log(`\nPASS totals-browser o010 (${results.length} cases, ${telemetry.pageErrors.length} page errors, ${telemetry.foreign.length} foreign requests)`);
process.exit(0);
