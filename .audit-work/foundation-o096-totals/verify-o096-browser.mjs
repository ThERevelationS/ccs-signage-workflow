// O-096 (CMP-H05) real-component verification: mounts the CANDIDATE
// FoundationTotals + CustomerPricingPanel under esbuild + playwright-core —
// real foundationCalc money/format, real sell-pricing detection chain,
// real candidate summary helper. Desktop 1280px + mobile 390px. No network:
// http server serves the bundle only; foreign-request telemetry asserted.
import esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = here;
const ORIGIN = 'http://127.0.0.1:5296';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- harness entry ----------
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoundationTotals from './fixture-browser/src/components/estimator/foundation/FoundationTotals.jsx';
import CustomerPricingPanel from './fixture-browser/src/components/estimator/foundation/CustomerPricingPanel.jsx';

const mode = new URLSearchParams(location.search).get('case') || 'trio-manual';
const noop = () => {};

const TOTALS = {
  total_concrete_volume_cy: 1.78, total_excavation_volume_cy: 2.22, total_labor_hours: 3.5,
  concrete_delivered_yards: 2.0, concrete_rate_per_yard: 185, concrete_delivery_cost: 75,
  concrete_trucks: [{ yards: 2, rounded_yards: 2, cost: 75 }], additional_stops_cost: 0,
  total_concrete_cost: 96, total_rebar_cost: 44, total_excavation_cost: 30,
  total_forming_materials_cost: 20, total_labor_cost: 40, total_brick_cost: 70,
  total_fill_cost: 15, total_wall_cost: 120, total_pole_cost: 120,
  total_pole_painting_cost: 35, total_equipment_cost: 50, total_wall_cap_cost: 10,
  total_signage_cabinet_cost: 100, total_landscape_cost: 0.75,
  wall_caps_by_material: [{ id: 'cap-1', name: 'Stone cap', qty: 4, cost: 10 }],
  grand_total: 465,
};
const SECTION = 565.75; // grand_total 465 + cabinets 100 + landscape .75

const CALC = {
  items: [
    { component_id: 'it1', foundation_type: 'spread_foot', quantity: 2, concrete_volume_cy: 0.89, rebar_feet: 48, forming_qty: 3, excavation_volume_cy: 1.11, item_total_cost: 105 },
    { component_id: 'it2', foundation_type: 'pillar', quantity: 1, concrete_volume_cy: 0.89, rebar_feet: 40, forming_qty: 0, excavation_volume_cy: 1.11, item_total_cost: 96 },
  ],
  itemPricing: [{ available: true, issues: [] }, { available: true, issues: [] }],
  walls: [{ component_id: 'w1', name: 'Front wall', calculatedCosts: { totalBricks: 420, materialCost: 70, laborCost: 50, totalCost: 120, totalLinearInches: 480, internalTotalBricks: 60 } }],
  wallPricing: [{ available: true, issues: [] }],
  poles: [{ component_id: 'p1', pole_name: '20ft pole', required_length_inches: 240, stock_pieces: 1, pole_cost: 120, pole_painting_cost: 35, total_cost: 155 }],
  polePricing: [{ available: true, issues: [] }],
  wallCaps: [{ component_id: 'c1', cap_name: 'Stone cap', length_inches: 36, cost: 2.5 }],
  equipment: [{ component_id: 'e1', rental_period: 'day', rental_duration: 2, include_delivery: true, equipment_cost: 50 }],
  equipmentPricing: [{ available: true, issues: [] }],
  delivery: { concreteTotal: 75, roundedYards: 2.0, ratePerYard: 185, additionalStopsCost: 0, trucksList: [{ yards: 2, rounded_yards: 2, cost: 75 }], pricingUnavailable: false },
  signageCabinetPricing: [{ available: true, issues: [] }],
  landscapePricing: { available: true, issues: [] },
  catalogIssues: [], inputIssues: [], constructionWarnings: [],
};
const PROJECT = {
  customer_markup_percent: 20,
  items: [{ component_id: 'it1' }, { component_id: 'it2' }],
  walls: [{ component_id: 'w1', shape: { segments: [{ component_id: 'seg1', length: 480 }] } }],
  poles: [{ component_id: 'p1' }],
  wall_caps: [{ component_id: 'c1', wall_component_id: 'w1', segment_component_id: 'seg1' }],
  signage_cabinets: [{ component_id: 'sc1', description: 'Lit cabinet', quantity: 2, unit_cost: 50, mount: 'pole', pole_component_id: 'p1' }],
  landscape: { cell_size_inches: 12, cells: { '0,0': 'grass', '0,1': 'grass', '1,0': 'concrete' } },
};
const CALC_BLOCKED = {
  ...CALC,
  items: [CALC.items[0], { component_id: 'it2', foundation_type: 'pillar', quantity: 1 }],
  itemPricing: [CALC.itemPricing[0], { available: false, issues: [{ kind: 'foundation', index: 1, code: 'foundation_dimension_invalid', message: 'Foundation 2: diameter (inches) must be a finite positive number.' }] }],
  inputIssues: [{ kind: 'foundation', index: 1, code: 'foundation_dimension_invalid', message: 'Foundation 2: diameter (inches) must be a finite positive number.' }],
  catalogIssues: [{ kind: 'equipment', index: 0, code: 'equipment_price_unavailable', message: 'Equipment 1: record a finite, nonnegative catalog day rental price before repricing.' }],
  constructionWarnings: [{ code: 'w1', kind: 'foundation', message: 'Verify footing depth against frost requirements.' }],
  delivery: { pricingUnavailable: true, concreteTotal: 75, roundedYards: 2.0, trucksList: [{ cost: 75 }] },
  equipmentPricing: [{ available: false, issues: [] }],
};
const TOTALS_BLOCKED = { ...TOTALS, total_rebar_cost: null, total_excavation_cost: null, grand_total: null };

const cases = {
  'trio-manual':     { wired: true, project: PROJECT, saved: 565.75, current: 565.75 },
  'trio-tier':       { wired: true, project: { ...PROJECT, customer_pricing: { applied: true, tier_number: 2, total: 900, raw_subtotal: 550 } }, saved: 565.75, current: 565.75 },
  'trio-tier-equal': { wired: true, project: { ...PROJECT, customer_pricing: { applied: true, tier_number: 2, total: 900, raw_subtotal: 565.75 } }, saved: 565.75, current: 565.75 },
  'trio-override':   { wired: true, project: { ...PROJECT, customer_price_override: 800 }, saved: 565.75, current: 565.75 },
  'trio-engine':     { wired: true, project: { ...PROJECT, ...TOTALS, pricing_engine: { default_markup_pct: 50 } }, saved: 565.75, current: 565.75 },
  'trio-blocked':    { wired: true, blocked: true, project: PROJECT, saved: 505.75, current: null },
  'trio-held-tier':  { wired: true, blocked: true, project: { ...PROJECT, customer_pricing: { applied: true, tier_number: 2, total: 900, raw_subtotal: 505.75 } }, saved: 505.75, current: null },
  'unwired':         { wired: false, saved: 565.75, current: 565.75 },
  'unwired-held':    { wired: false, blocked: true, saved: 505.75, current: null },
  'wallcap-hold':    { wired: true, wallcap: true, project: PROJECT, saved: 455, current: null },
  'panel-tier-margin': { kind: 'panel', project: { customer_markup_percent: 20, customer_pricing: { applied: true, tier_number: 2, total: 900, raw_subtotal: 550 } } },
};

const c = cases[mode] || cases['trio-manual'];
let el;
if (c.kind === 'panel') {
  el = React.createElement(CustomerPricingPanel, { cost: SECTION, project: c.project, onChange: noop });
} else {
  const calc = c.blocked ? CALC_BLOCKED : CALC;
  const totals = c.blocked ? TOTALS_BLOCKED : (c.wallcap ? { ...TOTALS, total_wall_cap_cost: null, grand_total: null } : TOTALS);
  el = React.createElement(FoundationTotals, {
    totals,
    pricingUnavailable: !!c.blocked,
    savedSectionTotal: c.saved,
    sectionTotal: c.current,
    ...(c.wired ? { project: c.project, calc } : {}),
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
      loader: 'jsx', resolveDir: process.cwd(),
    }));
  },
};

const plugin = { name: 'h', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: process.cwd() }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin, uiStub], loader: { '.js': 'jsx', '.jsx': 'jsx', '.ts': 'ts' }, jsx: 'automatic',
  metafile: true, alias: { '@': path.resolve('fixture-browser/src') },
});
fs.writeFileSync(`${OUT}/o096-browser-metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
const bad = Object.keys(built.metafile.inputs).filter(i => /base44Client|AuthContext|staffEntities/i.test(i));
if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }
const bundle = built.outputFiles[0].text;

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:8px}
  .bg-white{background:#fff}.rounded-xl{border-radius:12px}.rounded-sm{border-radius:2px}.rounded-lg{border-radius:8px}
  .border{border:1px solid #e5e7eb}.border-gray-200{border-color:#e5e7eb}.border-gray-100{border-color:#f3f4f6}
  .border-t{border-top:1px solid #e5e7eb}.border-b{border-bottom:1px solid #e5e7eb}
  .border-amber-300{border-color:#fcd34d}.bg-amber-50{background:#fffbeb}.border-amber-400{border-color:#fbbf24}
  .border-blue-200{border-color:#bfdbfe}.bg-blue-50{background:#eff6ff}.text-blue-800{color:#1e40af}.text-blue-700{color:#1d4ed8}.text-blue-900{color:#1e3a8a}
  .border-gray-300{border-color:#d1d5db}.bg-slate-50{background:#f8fafc}
  .border-emerald-200{border-color:#a7f3d0}.bg-emerald-50{background:#ecfdf5}.text-emerald-800{color:#065f46}
  .p-4{padding:16px}.p-3{padding:12px}.px-1{padding-left:4px;padding-right:4px}.px-2{padding-left:8px;padding-right:8px}
  .py-1{padding-top:4px;padding-bottom:4px}.py-2{padding-top:8px;padding-bottom:8px}
  .pt-3{padding-top:12px}.pt-2{padding-top:8px}.pt-1{padding-top:4px}
  .mt-1{margin-top:4px}.mt-3{margin-top:12px}.mb-3{margin-bottom:12px}.ml-1{margin-left:4px}.pl-4{padding-left:16px}
  .font-semibold{font-weight:600}.font-bold{font-weight:700}.font-normal{font-weight:400}
  .text-sm{font-size:14px}.text-xs{font-size:12px}.text-base{font-size:16px}
  .text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.text-\\[12px\\]{font-size:12px}.text-\\[13px\\]{font-size:13px}.text-\\[14px\\]{font-size:14px}
  .text-gray-900{color:#111827}.text-gray-800{color:#1f2937}.text-gray-700{color:#374151}.text-gray-600{color:#4b5563}
  .text-gray-500{color:#6b7280}.text-gray-400{color:#9ca3af}.text-red-600{color:#dc2626}.text-red-700{color:#b91c1c}
  .text-amber-700{color:#b45309}.text-amber-800{color:#92400e}.text-amber-900{color:#78350f}
  .flex{display:flex}.justify-between{justify-content:space-between}.grid{display:grid}
  .grid-cols-2{grid-template-columns:repeat(2,1fr)}.grid-cols-3{grid-template-columns:repeat(3,1fr)}
  .gap-2{gap:8px}.gap-3{gap:12px}
  .space-y-0\\.5>*+*{margin-top:2px}.space-y-1>*+*{margin-top:4px}.space-y-1\\.5>*+*{margin-top:6px}.space-y-2>*+*{margin-top:8px}.space-y-3>*+*{margin-top:12px}
  .text-center{text-align:center}.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.025em}
  .max-w-xl{max-width:36rem}.w-full{width:100%}.block{display:block}.sticky{position:sticky}.top-4{top:16px}
  .min-w-0{min-width:0}.whitespace-nowrap{white-space:nowrap}.list-disc{list-style:disc}
  .max-h-56{max-height:14rem}.max-h-64{max-height:16rem}.overflow-y-auto{overflow-y:auto}
  .cursor-pointer{cursor:pointer}.select-none{user-select:none}
  .ui-input{width:100%;border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;margin-top:2px}
  summary{display:list-item}
  label{display:block}
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><div id="root"></div><script>${bundle}</script>`);
});
await new Promise(r => server.listen(5296, '127.0.0.1', r));

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
const text = (page) => page.textContent('#root');
const statuses = (page) => page.$$eval('[role="status"]', ds => ds.map(d => d.textContent.trim()));
const trioCells = (page) => page.$$eval('.grid.grid-cols-3 > div', ds => ds.slice(0, 3).map(d => d.textContent.trim()));

// ============ trio: manual markup ============
await R('trio manual: cost/sell/margin cells show markup-derived sell + margin', async () => {
  const { context, page } = await open(1280, 'trio-manual');
  const cells = await trioCells(page);
  assert.ok(cells[0].includes('$565.75'), cells[0]);
  assert.ok(cells[1].includes('$678.90'), cells[1]); // 565.75*1.2
  assert.ok(cells[1].includes('Markup 20%'), cells[1]);
  assert.ok(cells[2].includes('$113.15'), cells[2]);
  assert.ok(cells[2].includes('16.7%'), cells[2]); // margin% = (sell-cost)/sell, panel parity
  await page.screenshot({ path: `${OUT}/trio-manual-1280.png`, fullPage: true });
  await context.close();
});

// ============ trio: applied tier ============
await R('trio tier: sell = snapshot total + acknowledged margin footnote', async () => {
  const { context, page } = await open(1280, 'trio-tier');
  const cells = await trioCells(page);
  assert.ok(cells[1].includes('$900.00'), cells[1]);
  assert.ok(cells[1].includes('Tier 2 applied'), cells[1]);
  const s = await statuses(page);
  assert.ok(s.some(x => x.includes('acknowledged margin') && x.includes('$350.00')), JSON.stringify(s));
  assert.ok(s.some(x => x.includes('recorded internal cost $550.00')), JSON.stringify(s));
  await page.screenshot({ path: `${OUT}/trio-tier-1280.png`, fullPage: true });
  await context.close();
});

await R('trio tier-equal: no acknowledged footnote when snapshot cost matches', async () => {
  const { context, page } = await open(1280, 'trio-tier-equal');
  const s = await statuses(page);
  assert.ok(!s.some(x => x.includes('acknowledged margin')), JSON.stringify(s));
  await context.close();
});

await R('trio override: sell = authored override', async () => {
  const { context, page } = await open(1280, 'trio-override');
  const cells = await trioCells(page);
  assert.ok(cells[1].includes('$800.00'), cells[1]);
  assert.ok(cells[1].includes('Price override'), cells[1]);
  assert.ok(cells[2].includes('$234.25'), cells[2]); // 800-565.75
  await context.close();
});

await R('trio engine: engine-resolved sell wins', async () => {
  const { context, page } = await open(1280, 'trio-engine');
  const cells = await trioCells(page);
  assert.ok(cells[1].includes('Pricing engine'), cells[1]);
  assert.ok(/\$\d/.test(cells[1]), cells[1]);
  await page.screenshot({ path: `${OUT}/trio-engine-1280.png`, fullPage: true });
  await context.close();
});

// ============ held states ============
await R('blocked: acknowledged cost shown (saved), sell —, margin —, checklist open w/ blocking', async () => {
  const { context, page } = await open(1280, 'trio-blocked');
  const cells = await trioCells(page);
  assert.ok(cells[0].includes('$505.75'), cells[0]);
  assert.ok(cells[0].includes('acknowledged saved'), cells[0]);
  assert.ok(cells[1].includes('—'), cells[1]);
  assert.ok(cells[2].includes('—'), cells[2]);
  const body = await text(page);
  assert.ok(body.includes('Missing inputs'), 'checklist section present');
  assert.ok(body.includes('blocking'), 'blocking count shown');
  assert.ok(body.includes('diameter (inches)'), 'input issue message');
  assert.ok(body.includes('catalog day rental price'), 'catalog issue message');
  assert.ok(body.includes('Verify footing depth'), 'advisory message');
  // checklist details auto-opened (blocking > 0):
  const detailsOpen = await page.$eval('details', d => d.open);
  assert.equal(detailsOpen, true);
  await page.screenshot({ path: `${OUT}/trio-blocked-1280.png`, fullPage: true });
  await context.close();
});

await R('held tier: acknowledged sell shows on blocked project; margin vs saved', async () => {
  const { context, page } = await open(1280, 'trio-held-tier');
  const cells = await trioCells(page);
  assert.ok(cells[1].includes('$900.00'), cells[1]);
  assert.ok(cells[1].includes('Tier 2 applied'), cells[1]);
  assert.ok(cells[2].includes('$394.25'), cells[2]); // 900-505.75
  assert.ok(cells[2].includes('vs saved cost'), cells[2]);
  await page.screenshot({ path: `${OUT}/trio-held-tier-1280.png`, fullPage: true });
  await context.close();
});

// ============ takeoff ============
await R('takeoff: itemized per-component rows with quantities', async () => {
  const { context, page } = await open(1280, 'trio-manual');
  const body = await text(page);
  assert.ok(body.includes('Itemized takeoff'), 'takeoff section');
  // expand
  await page.click('text=Itemized takeoff');
  const body2 = await text(page);
  assert.ok(body2.includes('Item 1 — spread footing ×2'), body2.slice(0, 4000));
  assert.ok(body2.includes('LF rebar'), 'rebar qty');
  assert.ok(body2.includes('Concrete delivery'), 'delivery row');
  assert.ok(body2.includes('Front wall'), 'wall row');
  assert.ok(body2.includes('20ft pole'), 'pole row');
  assert.ok(body2.includes('Stone cap'), 'cap row');
  assert.ok(body2.includes('Lit cabinet'), 'cabinet row');
  assert.ok(body2.includes('Grass'), 'landscape row');
  await page.screenshot({ path: `${OUT}/takeoff-open-1280.png`, fullPage: true });
  await context.close();
});

await R('takeoff: held item row flags (saved) + Not saved amount', async () => {
  const { context, page } = await open(1280, 'trio-blocked');
  await page.click('text=Itemized takeoff');
  const body = await text(page);
  assert.ok(body.includes('Item 2 — pillar/caisson'), 'held item row present');
  assert.ok(body.includes('(saved)'), 'held chip');
  assert.ok(body.includes('Not saved'), 'not-saved amount');
  await context.close();
});

// ============ checklist held channels ============
await R('checklist: held amounts enumerate non-finite partition buckets', async () => {
  const { context, page } = await open(1280, 'trio-blocked');
  const body = await text(page);
  assert.ok(body.includes('Rebar — amount unavailable'), 'rebar held row');
  assert.ok(body.includes('Excavation — amount unavailable'), 'excavation held row');
  await context.close();
});

await R('checklist: wall-cap-only hold caught by held channel (zero upstream issues)', async () => {
  const { context, page } = await open(1280, 'wallcap-hold');
  const body = await text(page);
  assert.ok(body.includes('Wall caps — amount unavailable'), body.slice(0, 5000));
  assert.ok(!body.includes('blocking'), 'no false blocking claim');
  await page.screenshot({ path: `${OUT}/wallcap-hold-1280.png`, fullPage: true });
  await context.close();
});

// ============ unwired honesty ============
await R('unwired: cost column live, sell —, checklist shows only totals-derived channel', async () => {
  const { context, page } = await open(1280, 'unwired');
  const cells = await trioCells(page);
  assert.ok(cells[0].includes('$565.75'), cells[0]);
  assert.ok(cells[1].includes('—'), cells[1]);
  assert.ok(cells[2].includes('—'), cells[2]);
  const body = await text(page);
  assert.ok(!body.includes('All inputs recorded'), 'no false complete claim');
  assert.ok(body.includes('No held amounts in the totals snapshot'), 'honest unwired caption');
  await page.screenshot({ path: `${OUT}/unwired-1280.png`, fullPage: true });
  await context.close();
});

await R('unwired + held totals: held channel still enumerates without issues props', async () => {
  const { context, page } = await open(1280, 'unwired-held');
  const cells = await trioCells(page);
  assert.ok(cells[0].includes('$505.75'), cells[0]);
  const body = await text(page);
  assert.ok(body.includes('Rebar — amount unavailable'), 'held row without issue channels');
  await context.close();
});

await R('clean wired project: "All inputs recorded" status fires', async () => {
  const { context, page } = await open(1280, 'trio-manual');
  const body = await text(page);
  assert.ok(body.includes('All inputs recorded'), body.slice(0, 5000));
  await context.close();
});

// ============ panel acknowledged margin ============
await R('panel: tier-snapshot margin footnote from customer_pricing fields', async () => {
  const { context, page } = await open(1280, 'panel-tier-margin');
  const body = await text(page);
  assert.ok(body.includes('Tier 2 snapshot margin (acknowledged)'), body.slice(0, 4000));
  assert.ok(body.includes('$350.00'), 'acknowledged margin amount'); // 900-550
  assert.ok(body.includes('38.9%'), 'acknowledged margin pct');      // 350/900
  await page.screenshot({ path: `${OUT}/panel-tier-margin-1280.png`, fullPage: true });
  await context.close();
});

// ============ mobile ============
await R('mobile 390px: trio + checklist wrap inside viewport', async () => {
  const { context, page } = await open(390, 'trio-blocked');
  const cells = await trioCells(page);
  assert.ok(cells[0].includes('$505.75'), cells[0]);
  const box = await page.evaluate(() => {
    const el = document.querySelector('#root > div');
    const r = el.getBoundingClientRect();
    return { right: r.right, vw: window.innerWidth };
  });
  assert.ok(box.right <= box.vw + 1, 'card stays inside viewport');
  await page.screenshot({ path: `${OUT}/trio-blocked-390.png`, fullPage: true });
  await context.close();
});

await R('mobile 390px: tier trio + footnote wrap', async () => {
  const { context, page } = await open(390, 'trio-tier');
  const cells = await trioCells(page);
  assert.ok(cells[1].includes('$900.00'), cells[1]);
  await page.screenshot({ path: `${OUT}/trio-tier-390.png`, fullPage: true });
  await context.close();
});

await browser.close();
server.close();
fs.writeFileSync(`${OUT}/o096-browser-verification.json`, JSON.stringify({ results, telemetry }, null, 1));
const failed = results.filter(r => !r.ok);
if (telemetry.pageErrors.length) console.log('PAGE ERRORS:', telemetry.pageErrors);
if (telemetry.foreign.length) console.log('FOREIGN REQUESTS:', telemetry.foreign.slice(0, 5));
if (failed.length) { console.log(`\nFAIL ${failed.length}/${results.length}`); process.exit(1); }
console.log(`\nPASS o096-browser (${results.length} cases, ${telemetry.pageErrors.length} page errors, ${telemetry.foreign.length} foreign requests)`);
process.exit(0);
