// O-009 equipment integrity browser fixture: REAL FoundationEstimator page,
// real calcProject/money/catalogIntegrity/panels/toolbar/totals/saveSession/recovery.
// Stubs only SDK/service boundaries + visual leaves. Real BrowserRouter routes.
// Exact origin http://127.0.0.1:5172, self-stops. No external requests allowed.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = '.audit-work/foundation-materials14';
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'http://127.0.0.1:5172';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- synthetic fixtures; original engine anchors are frozen separately ----------
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-materials14/syncrec-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-materials14/calc-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/syncrec-b.mjs')));
const { money } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/calc-b.mjs')));
const deep = (o) => JSON.parse(JSON.stringify(o));

const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'key-fx-receipt', requestedAt: '2024-01-01T00:00:00Z' });
// ---------- stubs (boundary + visual leaves only) ----------
const STUBS = {
  '@/components/auth/EmailGate': "export const useAuth=()=>({currentUser:{id:'synthetic-staff'}});",
  '@/components/ui/input': `export const Input=(p)=><input {...p}/>;`,
  '@/components/ui/tabs': `export const Tabs=(p)=><div>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
  '@/components/ui/select': `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p.open?<div>{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;`,
  '@/components/ui/button': `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
  '@/components/ui/badge': `export const Badge=(p)=><span>{p.children}</span>;`,
  '@/components/ui/label': `export const Label=(p)=><label {...p}>{p.children}</label>;`,
  '@/components/ui/switch': `export const Switch=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  '@/components/ui/checkbox': `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  '@/components/ui/dropdown-menu': `export const DropdownMenu=(p)=><div>{p.children}</div>;export const DropdownMenuTrigger=(p)=><button type="button">{p.children}</button>;export const DropdownMenuContent=(p)=><div>{p.children}</div>;export const DropdownMenuItem=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;export const DropdownMenuSeparator=()=>null;export const DropdownMenuLabel=()=>null;export const DropdownMenuGroup=(p)=><div>{p.children}</div>;`,
  '@/components/ui/accordion': `export const Accordion=(p)=><div>{p.children}</div>;export const AccordionItem=(p)=><div>{p.children}</div>;export const AccordionTrigger=(p)=><div>{p.children}</div>;export const AccordionContent=(p)=><div>{p.children}</div>;`,
  '@/components/markup/savedCustomerPricing': `export async function calculateSavedCustomerPricing(a){window.__spies.push(['pricing',a]);return{applied:true};}`,
  '@/components/markup/CustomerPricingTab': `export default ()=><div data-stub="CustomerPricingTab"/>`,
  '@/components/markup/projectCategorizer': `export function categorizeFoundationProject(){return{};}`,
  '@/components/estimator/builder/builderService': `export const recordBuilderSave=async a=>{window.__spies.push(['recordBuilderSave',a]);return{module_key:'foundation',project_id:a.line.project_id,estimate_id:a.estimateId,updated_date_snapshot:a.sourceProject.updated_date};};`,
  '@/components/estimator/idempotentEntityCreate': `export const ensureIdempotentEntityCreate=(...a)=>{window.__spies.push(['ensureIdempotent',a]);return Promise.resolve({id:'new-'+(window.__kseq=(window.__kseq||0)+1)});};export const newCreationRequestKey=(k)=>'key-'+(k||'x')+'-'+(window.__kseq=(window.__kseq||0)+1);`,
  '@/components/estimator/loadAllEntityRows': `export async function loadAllEntityRows(a){
    const rec={label:a.label,entity:a.entity,query:a.query||null,sort:a.sort||null};
    window.__allReads.push(rec);
    if(window.__armCount>0){
      window.__armCount--;
      rec.completion=new Promise((res,rj)=>{rec.res=res;rec.rj=rj;window.__reads.push(rec);});
      return rec.completion;
    }
    if(a.entity===window.__entInv)return window.__cat.inv||[];
    if(a.entity===window.__entLab)return window.__cat.lab||[];
    if(a.entity===window.__entSet)return window.__cat.set||[];
    return[];}
    export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/estimateMutationGuard': `export async function assertEstimateProductMutationAllowed(){}`,
  '@/components/estimator/builder/sourceProjectPersistence': `export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);if(window.__deferWrite) await new Promise(res=>window.__releaseSourceWrite=res);const next={...window.__proj[a.sourceId],...a.data,id:a.sourceId,updated_date:'v2'};window.__proj[a.sourceId]=JSON.parse(JSON.stringify(next));return next;};`,
  '@/components/staff/staffEntities': `export const staffEntities={
    FoundationProject:{get:async(id)=>{window.__spies.push(['projectGet',id]);const p=window.__proj[id];return p?JSON.parse(JSON.stringify(p)):null;},update:async()=>({}),updateMany:async()=>({updated:0})},
    FoundationInventory:window.__entInv||(window.__entInv={__ent:'inv'}),
    LaborServiceInventory:window.__entLab||(window.__entLab={__ent:'lab'}),
    Settings:window.__entSet||(window.__entSet={__ent:'set'}),
    AllInOneEstimate:{get:async(id)=>{window.__spies.push(['estimateGet',id]);const e=window.__est[id];return e?JSON.parse(JSON.stringify(e)):null;}}};`,
  '@/components/estimator/foundation/convertToBrickStone': `export const convertFoundationToBrickStone=async()=>{window.__spies.push(['converter']);return{id:'d1'};};`,
  '@/components/estimator/moduleShared/moduleProjectActions': `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  '@/components/utils': `export const createPageUrl=(n)=>'/'+n;`,
  '@/components/estimator/foundation/FoundationRatesPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationSectionBanner': `export default ()=><div/>`,
  '@/components/estimator/foundation/AiEngineeringAssistant': `export default ()=><div/>`,
  '@/components/estimator/foundation/Foundation3DPreview': `export default (p)=>{window.__seenProject=p.project;return <div/>;};`,
  '@/components/estimator/foundation/FoundationTemplateDialog': `export default ()=>null;`,
  '@/components/estimator/foundation/FoundationLayoutCanvas': `export default ()=><div/>`,
  '@/components/estimator/foundation/SignageCabinetsPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/LandscapeDesigner': `export default ()=><div/>`,
  '@/components/estimator/foundation/CustomerPricingPanel': `export default ()=><div data-stub="CustomerPricingPanel"/>`,
  '@/components/estimator/foundation/landscapeMaterials': `export const landscapeSummary=()=>({total:0,items:[]});`,
  '@/components/estimator/foundation/WallShapeEditor': `export default function(){return null;}`,
  './WallShapeEditor': `export default function(){return null;}`,
  'lucide-react': fs.readFileSync('.audit-work/foundation-catalog-pricing11/lucide-stub.js', 'utf8'),
};

const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import Page from '@/pages/FoundationEstimator';

window.__spies = window.__spies || [];
window.__reads = [];
window.__oldReads = [];
window.__allReads = [];
window.__armCount = 0;
window.__proj = window.__DATA.projects;
window.__est = window.__DATA.estimates;
window.__cat = (window.__DATA.catalogs && window.__DATA.catalogs[new URLSearchParams(location.search).get('id')]) || { inv: [], lab: [], set: [] };
window.__ctl = (cmd, arg) => {
  if (cmd === 'arm') { window.__oldReads = window.__reads; window.__reads = []; window.__armCount = arg; }
  if (cmd === 'setCatalog') window.__cat = arg;
  if (cmd === 'setProject') window.__proj[arg.id] = arg.proj;
};
function NavSpy(){ window.__nav = useNavigate(); return null; }
createRoot(document.getElementById('root')).render(
  React.createElement(BrowserRouter, null,
    React.createElement(NavSpy),
    React.createElement(Page, {
      onSaved: () => window.__spies.push(['onSaved']),
      onClose: () => window.__spies.push(['onClose']),
    })));
`;

const plugin = { name: 's', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.resolve('.') }));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx', resolveDir: path.resolve('.') }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  alias: { '@': path.resolve('src') }, metafile: true,
});
const bad = Object.keys(built.metafile.inputs).filter(i => /node_modules.*base44|@base44|base44Client|AuthContext/i.test(i));
fs.writeFileSync(`${OUT}/browser-metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }
const realPaths = ['FoundationItemCard.jsx', 'ConcreteDeliveryPanel.jsx', 'FoundationTotals.jsx', 'FoundationBOM.jsx', 'foundationCalc.js', 'foundationCatalogIntegrity.js', 'foundationEquipmentBindings.js', 'FoundationToolbar.jsx', 'foundationSaveSession.js', 'foundationSyncRecovery.js'];
const inputs = Object.keys(built.metafile.inputs);
for (const rp of realPaths) if (!inputs.some(i => i.endsWith('/' + rp) || i.endsWith(rp))) { console.error('MISSING real source in bundle:', rp); process.exit(1); }
const bundle = built.outputFiles[0].text;

const CASE = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[1];
const EXP_ITEM = CASE.expected.items[0];
const FULLV = () => ({ inv: JSON.parse(JSON.stringify(CASE.inventory)), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] });
const PROJ_A = (items) => ({
  id: 'p1', updated_date: 'v1', project_name: 'Synthetic', client_name: 'C', excavation_method: 'hand_dig',
  items, poles: [], wall_caps: [], walls: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
// B1: saved expected snapshot (proves saved-cache not fresh)
const projB1 = PROJ_A([deep(EXP_ITEM)]);
projB1.builder_sync_attempt = RECEIPT;
projB1.concrete_delivery_snapshot = undefined; // legacy: no snapshot
// B2: raw cached financials 0 -> proves old raw cache != expected
const rawZero = { ...deep(EXP_ITEM) };
for (const k of Object.keys(rawZero)) if (/_cost$|_total$|^concrete_bags$|^rebar_feet$|^rebar_weight_lbs$|^forming_qty$/.test(k) && typeof rawZero[k] === 'number') rawZero[k] = 0;
const _dd = CASE.expected.delivery;
const projB2 = PROJ_A([rawZero]);
projB2.id = 'p2';
projB2.builder_sync_attempt = createFoundationSyncAttempt({ sourceId: 'p2', estimateId: 'e1', key: 'key-fx-receipt-p2', requestedAt: '2024-01-01T00:00:00Z' });
projB2.concrete_delivery_snapshot = { version: 1, concrete_total: _dd.concreteTotal, rounded_yards: _dd.roundedYards, rate_per_yard: _dd.ratePerYard, additional_stops_cost: _dd.additionalStopsCost, trucks: _dd.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })) };
// B3: fresh full-catalog project raw cache 0
const projB3 = PROJ_A([{ ...deep(rawZero), component_id: 'f1' }]);
projB3.id = 'p3';
projB3.builder_sync_attempt = createFoundationSyncAttempt({ sourceId: 'p3', estimateId: 'e1', key: 'key-fx-receipt-p3', requestedAt: '2024-01-01T00:00:00Z' });
projB3.concrete_delivery_snapshot = projB2.concrete_delivery_snapshot;
const minusBag = () => CASE.inventory.filter(i => i.id !== 'bag').map(deep);
const DATA = {
  catalogs: {
    p1: { inv: minusBag(), lab: [], set: [] },
    p2: { inv: minusBag(), lab: [], set: [] },
    p3: { inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] },
  },
  projects: { p1: projB1, p2: projB2, p3: projB3 },
  estimates: {
    e1: { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' }] },
    e2: { id: 'e2', line_items: [] },
  },
};
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *,*::before,*::after{box-sizing:border-box}
    .grid{display:grid}.flex{display:flex}.block{display:block}.hidden{display:none}
    .items-center{align-items:center}.justify-between{justify-content:space-between}.justify-center{justify-content:center}
    .relative{position:relative}.absolute{position:absolute}.sticky{position:sticky}
    .flex-wrap{flex-wrap:wrap}.gap-1{gap:4px}.gap-2{gap:8px}.gap-3{gap:12px}
    .p-2{padding:8px}.p-3{padding:12px}.p-4{padding:16px}.px-3{padding-left:12px;padding-right:12px}.py-2{padding-top:8px;padding-bottom:8px}
    .mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mt-1{margin-top:4px}.mt-2{margin-top:8px}.mt-3{margin-top:12px}
    .text-red-700{color:#b91c1c}.text-amber-700{color:#b45309}.text-amber-800{color:#92400e}.text-amber-900{color:#78350f}
    .bg-amber-50{background:#fffbeb}.bg-white{background:#fff}.border-amber-300{border-color:#fcd34d}
    .rounded-sm{border-radius:2px}.rounded{border-radius:4px}.rounded-xl{border-radius:12px}.rounded-full{border-radius:9999px}
    .border{border:1px solid #e5e7eb}.list-disc{list-style:disc}.pl-5{padding-left:20px}
    [role="alert"]{border:1px solid #fcd34d;background:#fffbeb;padding:8px;margin-bottom:8px}
    </style><div id="root"></div>
    <script>window.__DATA=${JSON.stringify(DATA)};</script>
    <script>${bundle}</script>`);
});

await new Promise(r => server.listen(5172, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const guard = (page, tag) => {
  page.on('request', (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ tag, url: r.url() }); } catch { telemetry.foreign.push({ tag, url: r.url() }); } });
  page.on('pageerror', (e) => telemetry.pageErrors.push({ tag, error: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') telemetry.consoleErrors.push({ tag, text: m.text().slice(0, 200) }); });
  page.on('requestfailed', (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ tag, url: r.url(), failed: true }); } catch {} });
};
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log('ok', name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.message || e).slice(0, 1500) }); console.log('FAIL', name, '-', String(e.message || e).slice(0, 300)); }
  finally { for (const context of browser.contexts()) await context.close(); }
};
const readsByLabel = (page) => page.evaluate(() => window.__reads.map(r => r.label));
const spyCount = (page, k) => page.evaluate((k) => window.__spies.filter(x => x[0] === k).length, k);
const seen = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__seenProject)));
const cat = (page, c) => page.evaluate((c) => window.__ctl('setCatalog', c), c);
const arm = (page, n) => page.evaluate((n) => window.__ctl('arm', n), n);
const waitLoaded = async (page, id) => page.waitForFunction((id) => window.__seenProject?.id === id, id, { timeout: 10000 });
const alertText = async (page) => (await page.locator('[role=alert]').allTextContents()).join(' ');
const settleFlight = async (page, field, values, failure = null) => {
  const outcome = await page.evaluate(async ({ field, values, failure }) => {
    const reads = window[field];
    if (!reads || reads.length !== 3) throw new Error('Expected exactly three captured prerequisite reads.');
    reads.forEach((read, index) => {
      if (failure && read.label === 'Estimator Settings') read.rj(new Error(failure));
      else read.res(values[index]);
    });
    const settled = await Promise.allSettled(reads.map(read => read.completion));
    // All remaining page-handler work is synchronous or microtasks after the
    // controlled reads. Drain that work and a React paint, not a guessed delay.
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => requestAnimationFrame(resolve));
    return settled.map(read => read.status);
  }, { field, values, failure });
  assert.deepEqual(outcome, failure ? ['fulfilled', 'fulfilled', 'rejected'] : ['fulfilled', 'fulfilled', 'fulfilled']);
};


try {
const settleAll = async (page) => {
  await page.evaluate(() => {
    for (const r of window.__reads) r.res(r.entity === window.__entInv ? window.__cat.inv : r.entity === window.__entLab ? window.__cat.lab : window.__cat.set);
    window.__reads = [];
  });
};
const readsInfo = (page) => page.evaluate(() => window.__reads.map(r => ({ label: r.label, query: r.query, sort: r.sort })));
const catFull = async (page) => { await cat(page, FULLV()); await arm(page, 3); };

const cardOf = (page) => page.locator('[class*="border-l-amber-500"]');
const cardTotal = (page) => cardOf(page).locator('div.font-bold.text-gray-900');
const expectedTotal = money(EXP_ITEM.item_total_cost);
const FULLSET = () => ({ inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] });
const _d = CASE.expected.delivery;
const EXPECTED_DELIVERY = {
  version: 1, concrete_total: _d.concreteTotal, rounded_yards: _d.roundedYards,
  rate_per_yard: _d.ratePerYard, additional_stops_cost: _d.additionalStopsCost,
  trucks: _d.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })),
};
const fmtQty = (n, unit) => n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + unit;
const assertSavedMaterials = async (page) => {
  for (const [kind, cost, qtyStr] of [
    ['concrete', EXP_ITEM.concrete_cost, fmtQty(EXP_ITEM.concrete_bags, 'bags')],
    ['rebar', EXP_ITEM.rebar_cost, fmtQty(EXP_ITEM.rebar_feet, 'LF')],
    ['forming', EXP_ITEM.forming_cost, fmtQty(EXP_ITEM.forming_qty, 'units')],
  ]) {
    const row = page.locator('tbody tr', { hasText: 'Foundation f1 (saved) — ' + kind });
    assert.equal(await row.count(), 1, `one saved ${kind} row`);
    const cells = row.first().locator('td');
    assert.equal(await cells.nth(1).innerText(), qtyStr, `saved ${kind} qty`);
    assert.equal(await cells.nth(2).innerText(), money(cost), `saved ${kind} cost`);
  }
  // card breakdown scoped Rebar/Forming amounts (label div then value div, same cell)
  for (const [lbl, v] of [['Rebar', EXP_ITEM.rebar_cost], ['Forming', EXP_ITEM.forming_cost]]) {
    const labelEl = cardOf(page).locator('div.text-gray-400', { hasText: new RegExp('^' + lbl + '$') }).first();
    const amtEl = labelEl.locator('xpath=following-sibling::div[contains(@class,"font-semibold")]').first();
    assert.equal(await amtEl.innerText(), money(v), `card ${lbl} == frozen`);
  }
};
const READS_EXPECTED = [
  { label: 'Foundation inventory', query: { show_in_foundation: true }, sort: 'material_name' },
  { label: 'Concrete labor/services', query: { service_category: 'concrete_service', is_active: true }, sort: 'service_name' },
  { label: 'Estimator Settings', query: null, sort: 'created_date' },
];

// ============ B1: missing bag, legacy no delivery snapshot -> blocked + saved amounts ============
await R('B1: missing bag legacy -> alert, saved total, unavailable option, zero write paths', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  const al = await alertText(page);
  assert.ok(al.includes('Pricing unavailable'), 'global alert');
  assert.ok(/Foundation/.test(al), 'foundation issue enumerated');
  await cardOf(page).first().waitFor();
  assert.equal(await cardOf(page).count(), 1, 'one item card');
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'card total == frozen expected');
  const bagOpt = cardOf(page).locator('select option[value="bag"]');
  assert.ok(await bagOpt.count() >= 1, 'bag option present');
  assert.equal(await bagOpt.first().evaluate(el => el.disabled), true, 'bag option disabled');
  const deliveryPanel = page.getByText('Ready-Mix Concrete Order').locator('..').locator('..');
  const dpText = await deliveryPanel.innerText();
  assert.ok(dpText.includes('Not saved'), 'delivery totals Not saved');
  assert.ok(!dpText.includes('Truck 1'), 'no fabricated truck rows');
  const rawBefore = await seen(page);
  await page.locator('label:has-text("Description") input').first().fill('unsaved material draft');
  await page.getByRole('button', { name: 'Save As Copy' }).click();
  await page.getByRole('button', { name: 'Swap to BrickStone' }).click();
  await page.getByRole('button', { name: 'Save & Exit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.keyboard.press('Control+s');
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2300);
  for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
    assert.equal(await spyCount(page, k), 0, 'zero ' + k);
  assert.equal(new URL(page.url()).search, '?id=p1&estimateId=e1');
  const rawAfter = await seen(page);
  assert.deepEqual(rawAfter.builder_sync_attempt, RECEIPT, 'receipt preserved');
  assert.equal(rawAfter.items[0].description, 'unsaved material draft', 'raw draft kept');
  // mobile 390: card + saved cash visible
  await page.setViewportSize({ width: 390, height: 844 });
  await cardTotal(page).waitFor({ state: 'visible' });
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'mobile saved cash visible');
  await page.screenshot({ path: OUT + '/b1-mobile.png' });
  await ctx.close();
  return true;
});

// ============ B2: reload -> save CAS v1 -> #99/Undo/#99 ack-cache wins ============
await R('B2: catalog recovery -> CAS v1 body=frozen expected+snapshot; #99 uses ack cache', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b2');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p2&estimateId=e1');
  await waitLoaded(page, 'p2');
  await cardOf(page).first().waitFor();
  assert.equal((await seen(page)).items[0].item_total_cost, 0, 'raw cache 0 seed');
  await page.locator('label:has-text("Description") input').first().fill('recovered draft');
  await page.locator('button[title="Auto-save"]').click();
  const rawBefore = await seen(page);
  await cat(page, FULLSET());
  await arm(page, 3);
  const reloadBtn = page.getByRole('button', { name: 'Reload catalogs' });
  await reloadBtn.click();
  await page.waitForFunction(() => window.__reads.length >= 3, null, { timeout: 8000 });
  const busy = await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Reloading catalogs/.test(x.textContent))?.disabled === true || [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Reload catalogs')?.disabled === true);
  assert.equal(busy, true, 'reload busy/disabled while pending');
  const reads = await page.evaluate(() => window.__reads.map(r => ({ label: r.label, query: r.query, sort: r.sort })));
  assert.deepEqual(reads, READS_EXPECTED, 'exact 3 reads label/query/sort');
  assert.deepEqual(await seen(page), rawBefore, 'raw project untouched while pending');
  await page.evaluate(() => {
    const cat = window.__cat;
    for (const r of window.__reads) r.res(r.entity === window.__entInv ? cat.inv : r.entity === window.__entLab ? cat.lab : cat.set);
    window.__reads = [];
  });
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 8000 });
  assert.deepEqual(await seen(page), rawBefore, 'raw project deep-equal after reload');
  const autoOff = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.title === 'Auto-save');
    return b?.classList.contains('bg-gray-300') || b?.getAttribute('aria-pressed') === 'false' || !b?.classList.contains('bg-indigo-600');
  });
  assert.equal(autoOff, true, 'autosave OFF after reload');
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'no auto write');
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'card total == expected (not raw0)');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.deepEqual(arg.data.items, [{ ...deep(EXP_ITEM), description: 'recovered draft' }], 'save body == frozen expected + description');
  assert.deepEqual(JSON.parse(JSON.stringify(arg.data.concrete_delivery_snapshot)), EXPECTED_DELIVERY, 'delivery snapshot == v1 shape');
  fs.writeFileSync(OUT + '/b2-save-body.json', JSON.stringify(arg.data, null, 1));
  // #99 -> blocked, ack cache keeps expected cash (not raw0)
  const sizeInput = page.locator('label:has-text("Rebar size") input').first();
  await sizeInput.fill('#99');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#99', null, { timeout: 8000 });
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after #99');
  assert.equal((await seen(page)).items[0].item_total_cost, 0, 'raw cash still 0');
  await assertSavedMaterials(page);
  await page.screenshot({ path: OUT + '/b2-ack-cache.png' });
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#4', null, { timeout: 8000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 8000 });
  await sizeInput.fill('#99');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#99', null, { timeout: 8000 });
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after re-edit');
  await assertSavedMaterials(page);
  assert.equal(await spyCount(page, 'saveSource'), 1, 'still one source write');
  await ctx.close();
  return true;
});

// ============ B3: deferred source write + #99 mid-flight -> ack cache wins, CAS v2 ============
await R('B3: held source write + #99 mid-flight -> saved expected, superseded Builder, CAS v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p3&estimateId=e1');
  await waitLoaded(page, 'p3');
  await cardOf(page).first().waitFor();
  await page.locator('label:has-text("Description") input').first().fill('pending draft');
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  const sizeInput = page.locator('label:has-text("Rebar size") input').first();
  await sizeInput.fill('#99');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#99', null, { timeout: 8000 });
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.waitForFunction(() => document.body.innerText.includes('Source saved'), null, { timeout: 10000 });
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after late write');
  await assertSavedMaterials(page);
  const raw = await seen(page);
  assert.equal(raw.items[0].description, 'pending draft', 'latest description retained');
  assert.equal(await page.getByText('All changes saved', { exact: true }).count(), 0, 'newer edit remains unsaved');
  assert.equal(raw.items[0].rebar_size, '#99', 'raw #99 preserved');
  assert.equal(raw.items[0].item_total_cost, 0, 'raw cache 0 preserved');
  const projV = await page.evaluate(() => window.__proj.p3.updated_date);
  assert.equal(projV, 'v2', 'source ack v2 installed');
  assert.equal(await spyCount(page, 'onSaved'), 0, 'onSaved 0 (superseded by newer edit)');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 0, 'Builder 0 (superseded)');
  assert.equal(await spyCount(page, 'saveSource'), 1, 'one source write');
  const firstWrite = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(firstWrite.expectedUpdatedAt, 'v1');
  assert.deepEqual(firstWrite.data.concrete_delivery_snapshot, EXPECTED_DELIVERY, 'held source save exact frozen delivery snapshot');
  await page.screenshot({ path: OUT + '/b3-blocked.png' });
  // optional CAS: #4 then Save -> expectedUpdatedAt v2
  await sizeInput.fill('#4');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#4', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg2[1].expectedUpdatedAt, 'v2', 'second save CAS v2');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1, 'Builder 1 on second save');
  await ctx.close();
  return true;
});
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

// ---------- teardown ----------
if (telemetry.foreign.length) results.push({ case: 'external-request', ok: false, detail: telemetry.foreign });
if (telemetry.pageErrors.length) results.push({ case: 'pageerror', ok: false, detail: telemetry.pageErrors });
if (telemetry.consoleErrors.length) results.push({ case: 'console-error', ok: false, detail: telemetry.consoleErrors });
fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));
const fails = results.filter(r => r.ok === false);
console.log(`material-integrity-browser scenarios=3 failed=${fails.length}`);
process.exitCode = fails.length ? 1 : 0;
