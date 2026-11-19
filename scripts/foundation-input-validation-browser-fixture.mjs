// O-015 basic foundation input validation, with real calculator, editor and draft store.
// Only auth/service boundaries and unrelated visual leaves are stubbed.
// Exact origin http://127.0.0.1:5172, self-stops. No external requests allowed.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const BASELINE_MODE = process.env.BASELINE === '1';
const STEEL_MODE = process.env.REINFORCEMENT === '1';
assert.ok(!(BASELINE_MODE && STEEL_MODE), 'Baseline and reinforcement modes are separate.');
const OUT = process.env.BASIC_REGRESSION === '1'
  ? '.audit-work/foundation-reinforcement17/basic-browser-regression'
  : `.audit-work/foundation-reinforcement${STEEL_MODE ? '17' : '16'}`;
const RESULTS_FILE = `${OUT}/${BASELINE_MODE ? 'baseline-browser-results' : 'browser-results'}.json`;
const META_FILE = `${OUT}/${BASELINE_MODE ? 'baseline-metafile' : 'browser-metafile'}.json`;
if (BASELINE_MODE && fs.existsSync(RESULTS_FILE)) throw new Error('Baseline proof is frozen; refusing to overwrite.');
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'http://127.0.0.1:5172';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- synthetic fixtures; original engine anchors are frozen separately ----------
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm', outfile: `${OUT}/sync-bundle.mjs`, alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve(`${OUT}/sync-bundle.mjs`)));
const deep = (o) => JSON.parse(JSON.stringify(o));

// ---------- stubs (boundary + visual leaves only) ----------
const BASELINES = JSON.parse(fs.readFileSync('.audit-work/foundation-reinforcement16/fresh-validation-baselines.json', 'utf8'));
const baseContent = (path) => BASELINES.files.find(f => f.path === path)?.content;
const STUBS = {
  '@/components/estimator/foundation/FoundationToolbar': `import Real from 'toolbar-real';export default function FoundationToolbarProbe(p){window.__toolbarProps=p;return <Real {...p}/>;}`,
  '@/components/estimator/foundation/FoundationItemCard': `import Real from 'card-real';export default function CardProbe(p){(window.__cardProps ||= {})[p.item.component_id]=p;return <Real {...p}/>;}`,
  '@/components/auth/EmailGate': `import React from 'react';export const useAuth=()=>{const id=React.useSyncExternalStore(cb=>{window.__ownerCb=cb;return()=>{window.__ownerCb=null};},()=>window.__ownerId||'synthetic-staff');return{currentUser:{id}};};export function setSyntheticOwner(id){window.__ownerId=id;window.__ownerCb?.();}`,
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
  '@/components/estimator/builder/sourceProjectPersistence': `export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);if(window.__deferWrite) await new Promise(res=>window.__releaseSourceWrite=res);const cur=window.__proj[a.sourceId];if(a.expectedUpdatedAt!==cur.updated_date){const e=new Error('CAS conflict: expected '+a.expectedUpdatedAt+' but server has '+cur.updated_date);e.casConflict=true;throw e;}const next={...cur,...a.data,id:a.sourceId,updated_date:'v'+(parseInt(cur.updated_date.replace(/^v/,''),10)+1)};window.__proj[a.sourceId]=JSON.parse(JSON.stringify(next));return next;};`,
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
import { BrowserRouter, useNavigate, Routes, Route, Link } from 'react-router-dom';
import Page from '@/pages/FoundationEstimator';

window.__spies = window.__spies || [];
window.__reads = [];
window.__oldReads = [];
window.__allReads = [];
window.__armCount = 0;
window.__proj = window.__DATA.projects;
window.__est = window.__DATA.estimates;
window.__cat = window.__DATA.catalogs.p3 || { inv: [], lab: [], set: [] }; // full catalog for p3 regardless of initial /away route
window.__ctl = (cmd, arg) => {
  if (cmd === 'arm') { window.__oldReads = window.__reads; window.__reads = []; window.__armCount = arg; }
  if (cmd === 'setCatalog') window.__cat = arg;
  if (cmd === 'setProject') window.__proj[arg.id] = arg.proj;
};
function NavSpy(){ window.__nav = useNavigate(); return null; }
function Away(){ return React.createElement('div', null,
    React.createElement(Link, { to: '/FoundationEstimator?id=p3&estimateId=e1', id: 'open-foundation' }, 'Open foundation estimator')); }
const pageEl = React.createElement(Page, {
  onSaved: () => window.__spies.push(['onSaved']),
  onClose: () => window.__spies.push(['onClose']),
});
createRoot(document.getElementById('root')).render(
  React.createElement(BrowserRouter, null,
    React.createElement(NavSpy),
    React.createElement(Link, { to: '/away', id: 'shell-away' }, 'Shell back to workflow'),
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/away', element: React.createElement(Away) }),
      React.createElement(Route, { path: '*', element: pageEl }))));
`;

const plugin = { name: 's', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  if (BASELINE_MODE) {
    b.onResolve({ filter: /FoundationEstimator$/ }, () => ({ path: 'baseline-page', namespace: 'base' }));
    b.onLoad({ filter: /.*/, namespace: 'base' }, () => ({ contents: baseContent('src/pages/FoundationEstimator.jsx'), loader: 'jsx', resolveDir: path.resolve('src/pages') }));
  }
    b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));
    b.onResolve({ filter: /^card-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationItemCard.jsx') }));
    if (BASELINE_MODE) {
      b.onResolve({ filter: /foundationCalc$/ }, () => ({ path: 'baseline-calc', namespace: 'base2' }));
      b.onLoad({ filter: /.*/, namespace: 'base2' }, () => ({ contents: baseContent('src/components/estimator/foundation/foundationCalc.js'), loader: 'jsx', resolveDir: path.resolve('src/components/estimator/foundation') }));
    }
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.resolve('.') }));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx', resolveDir: path.resolve('.') }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  alias: { '@': path.resolve('src') }, metafile: true,
});
const bad = Object.keys(built.metafile.inputs).filter(i => /node_modules.*base44|@base44|base44Client|AuthContext/i.test(i) || i.endsWith('/auth/EmailGate.jsx'));
fs.writeFileSync(META_FILE, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }
const realPaths = ['FoundationItemCard.jsx', 'ConcreteDeliveryPanel.jsx', 'FoundationTotals.jsx', 'FoundationBOM.jsx', 'foundationCalc.js', 'foundationInputValidation.js', 'foundationDraftRecovery.js', 'foundationCatalogIntegrity.js', 'foundationEquipmentBindings.js', 'FoundationToolbar.jsx', 'foundationSaveSession.js', 'foundationSyncRecovery.js'];
const inputs = Object.keys(built.metafile.inputs);
for (const rp of realPaths) if (!BASELINE_MODE && !inputs.some(i => i.endsWith('/' + rp) || i.endsWith(rp))) { console.error('MISSING real source in bundle:', rp); process.exit(1); }
const bundle = built.outputFiles[0].text;

const CASE = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[1];


const EXP_ITEM = CASE.expected.items[0];
const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p3', estimateId: 'e1', key: 'key-nav-receipt-p3', requestedAt: '2024-01-01T00:00:00Z' });
const projB3 = {
  id: 'p3', updated_date: 'v1', project_name: 'ValProj', client_name: 'C', notes: 'n', excavation_method: 'hand_dig',
  items: [deep(EXP_ITEM)], poles: [], wall_caps: [], walls: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
};
projB3.builder_sync_attempt = RECEIPT;
const _dd = CASE.expected.delivery;
projB3.concrete_delivery_snapshot = { version: 1, concrete_total: _dd.concreteTotal, rounded_yards: _dd.roundedYards, rate_per_yard: _dd.ratePerYard, additional_stops_cost: _dd.additionalStopsCost, trucks: _dd.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })) };
const DATA = {
  catalogs: { p3: { inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] } },
  projects: { p3: projB3 },
  estimates: { e1: { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p3', estimate_id: 'e1', updated_date_snapshot: 'v1' }] } },
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
let browser;
try {
browser = await chromium.launch({ channel: 'chrome', headless: true });
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
const spyCount = (page, k) => page.evaluate((k) => window.__spies.filter(x => x[0] === k).length, k);
const seen = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__seenProject)));
const waitLoaded = async (page, id) => page.waitForFunction((id) => window.__seenProject?.id === id, id, { timeout: 10000 });


const qtyInput = (page) => page.locator('label:has-text("Quantity") input').first();
const inputBanner = (page) => page.getByText('Design input required:', { exact: false });
const threeDNotice = (page) => page.getByText('3D preview hidden', { exact: false });
const savedBanner = (page) => page.getByText('Saved amounts (not current pricing)', { exact: true });
const cardOf = (page) => page.locator('[class*="border-l-amber-500"]');
const cardTotal = (page) => cardOf(page).locator('div.font-bold.text-gray-900');
const desc = (page) => page.locator('label:has-text("Description") input').first();
const offer = (page) => page.getByText('Unsent browser-tab draft found.', { exact: false });
const writeSpies = (page) => page.evaluate(() => window.__spies.filter(x => ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'].includes(x[0])).length);
const srcVersion = (page) => page.evaluate(() => window.__proj.p3.updated_date);
const openEstimator = async (ctx, tag, seed = null, invalid = false) => {
  const page = await ctx.newPage(); guard(page, tag);
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  if (seed) await page.evaluate(patch => Object.assign(window.__proj.p3.items[0], patch), seed);
  await page.locator('#open-foundation').click();
  if (invalid) await inputBanner(page).waitFor();
  else await waitLoaded(page, 'p3');
  return page;
};
const DRAFT_KEY = 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify(['synthetic-staff', 'p3', 'e1']));
const draftKey = (page, owner = 'synthetic-staff') => page.evaluate((k) => sessionStorage.getItem(k), 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify([owner, 'p3', 'e1'])));
const draftRaw = (page) => draftKey(page);
const draftData = async page => JSON.parse(await draftRaw(page)).data;
const cardState = (page, id = 'f1') => page.evaluate(id => {
  const props = window.__cardProps[id];
  return { item: props.item, pricing: props.pricing };
}, id);
const waitQuantity = async (page, quantity) => {
  await page.waitForFunction(q => window.__cardProps?.f1?.item.quantity === q, quantity);
  await page.waitForFunction(({ key, q }) => JSON.parse(sessionStorage.getItem(key) || 'null')?.data?.items?.[0]?.quantity === q, { key: DRAFT_KEY, q: quantity });
  assert.equal(await qtyInput(page).inputValue(), String(quantity));
};
const invokeToolbar = (page, keys) => page.evaluate(async keys => {
  for (const key of keys) {
    const fn = window.__toolbarProps[key];
    if (typeof fn !== 'function') throw new Error('Missing real toolbar callback: ' + key);
    await fn();
  }
}, keys);


if (BASELINE_MODE) {
  await R('B0 baseline: negative qty -2 -> displayed 1, raw -2, payload clamps, Builder/onSaved once', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); guard(page, 'b0');
    await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
    await page.goto(ORIGIN + '/away');
    await page.locator('#open-foundation').click();
    await waitLoaded(page, 'p3');
    await qtyInput(page).fill('-2');
    await page.waitForFunction(() => window.__seenProject.items[0].quantity === -2, null, { timeout: 8000 });
    assert.equal(await qtyInput(page).inputValue(), '1', 'baseline displays clamped 1');
    assert.equal((await seen(page)).items[0].quantity, -2, 'raw qty -2 kept');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
    const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
    const it = arg.data.items[0];
    assert.equal(it.quantity, 1, 'payload clamps qty to 1');
    assert.equal(it.concrete_volume_cy, -2);
    assert.equal(it.rebar_feet, -128);
    assert.equal(it.item_total_cost, -1733.1);
    assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
    await page.screenshot({ path: OUT + '/b0-baseline.png' });
    await ctx.close();
    return true;
  });
} else if (STEEL_MODE) {
await R('R1 invalid spread steel: raw/cache/prices preserved, all writes blocked, correction saves', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'r1');
  await desc(page).fill('steel design');
  const spacing = page.locator('label:has-text("Spacing width (in)") input').first();
  const layers = page.locator('label:has-text("Layers") input').first();
  await spacing.fill('-12');
  await inputBanner(page).waitFor();
  assert.equal(await spacing.inputValue(), '-12');
  assert.equal((await draftData(page)).items[0].rebar_spacing_width, -12);
  const blocked = await cardState(page);
  assert.equal(blocked.pricing.available, false);
  assert.ok(blocked.pricing.issues.some(i => i.field === 'rebar_spacing_width'));
  assert.equal(blocked.item.rebar_feet, 64);
  assert.equal(blocked.item.rebar_cost, 252.8);
  assert.equal(blocked.item.item_total_cost, 866.55);
  await threeDNotice(page).waitFor();
  await invokeToolbar(page, ['onSave', 'onSaveAndExit', 'onSaveAsCopy', 'onSwapToBrickStone']);
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0);
  await spacing.fill('12');
  for (const value of ['-2', '1.5', '0']) {
    await layers.fill(value);
    await inputBanner(page).waitFor();
    assert.equal(await layers.inputValue(), value);
    assert.equal((await draftData(page)).items[0].rebar_layers, Number(value));
    assert.equal((await cardState(page)).item.rebar_cost, 252.8);
    await invokeToolbar(page, ['onSave']);
    assert.equal(await writeSpies(page), 0);
  }
  await layers.fill('1');
  await page.waitForFunction(() => window.__cardProps.f1.pricing.available);
  assert.equal(await cardTotal(page).innerText(), '$866.55');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].rebar_layers, 1);
  assert.equal(arg.data.items[0].rebar_spacing_width, 12);
  assert.equal(arg.data.items[0].rebar_feet, 64);
  assert.equal(arg.data.items[0].item_total_cost, 866.55);
  assert.equal(arg.data.items[0].description, 'steel design');
  assert.equal(arg.data.notes, 'n');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await draftRaw(page), null);
  await page.screenshot({ path: `${OUT}/r1-steel-repaired.png` });
});
await R('R2 pillar counts and hoop bounds: no silent defaults/clamping, explicit repair saves', async () => {
  const frozen = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[3];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'r2', {
    ...frozen.expected.items[0], pillar_rebar_layers: 1, pillar_vertical_rebar_count: -2,
    rebar_layers: -2, rebar_spacing_width: -12,
  }, true);
  const bars = page.locator('label:has-text("Vertical bars") input').first();
  const hoop = page.locator('label:has-text("Hoop dia (in)") input').first();
  assert.equal(await bars.inputValue(), '-2');
  assert.equal((await cardState(page)).item.rebar_feet, frozen.expected.items[0].rebar_feet);
  assert.equal((await cardState(page)).item.item_total_cost, frozen.expected.items[0].item_total_cost);
  for (const value of ['0', '1.5']) {
    await bars.fill(value);
    await inputBanner(page).waitFor();
    assert.equal((await draftData(page)).items[0].pillar_vertical_rebar_count, Number(value));
    await invokeToolbar(page, ['onSave']);
    assert.equal(await writeSpies(page), 0);
  }
  await bars.fill('4');
  await hoop.fill('40');
  await inputBanner(page).waitFor();
  const issues = (await cardState(page)).pricing.issues;
  assert.ok(issues.some(i => i.field === 'pillar_rebar_hoop_diameter'));
  assert.ok(!issues.some(i => ['rebar_layers', 'rebar_spacing_width'].includes(i.field)));
  await invokeToolbar(page, ['onSave', 'onSaveAsCopy']);
  assert.equal(await writeSpies(page), 0);
  await hoop.fill('20');
  await page.waitForFunction(() => window.__cardProps.f1.pricing.available);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].pillar_vertical_rebar_count, 4);
  assert.equal(arg.data.items[0].pillar_rebar_layers, 1);
  assert.equal(arg.data.items[0].pillar_rebar_hoop_diameter, 20);
  assert.equal(arg.data.items[0].rebar_feet, frozen.expected.items[0].rebar_feet);
  assert.equal(arg.data.items[0].item_total_cost, frozen.expected.items[0].item_total_cost);
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await draftRaw(page), null);
  await page.screenshot({ path: `${OUT}/r2-pillar-repaired.png` });
});
await R('R3 rebar disabled: inactive invalid steel fields do not block or change on save', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'r3', {
    include_rebar: false, rebar_layers: -2, rebar_spacing_length: 0, rebar_spacing_width: -12,
    pillar_rebar_layers: 0, pillar_vertical_rebar_count: -2, pillar_rebar_hoop_diameter: -20,
  });
  assert.equal(await inputBanner(page).count(), 0);
  assert.equal((await cardState(page)).pricing.available, true);
  assert.equal((await cardState(page)).item.rebar_feet, 0);
  assert.equal((await cardState(page)).item.rebar_cost, 0);
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true, 'clean source has nothing to save');
  await desc(page).fill('no steel design');
  assert.equal((await cardState(page)).pricing.available, true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].include_rebar, false);
  assert.equal(arg.data.items[0].description, 'no steel design');
  assert.equal(arg.data.items[0].rebar_layers, -2);
  assert.equal(arg.data.items[0].rebar_spacing_length, 0);
  assert.equal(arg.data.items[0].rebar_spacing_width, -12);
  assert.equal(arg.data.items[0].pillar_vertical_rebar_count, -2);
  assert.equal(arg.data.items[0].rebar_feet, 0);
  assert.equal(arg.data.items[0].rebar_cost, 0);
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await draftRaw(page), null);
  await page.screenshot({ path: `${OUT}/r3-rebar-off.png` });
});
await R('R4 legacy null defaults preserved, explicit empty spacing requires correction', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'r4', {
    quantity: null, rebar_layers: null, rebar_spacing_length: null, rebar_spacing_width: '',
  }, true);
  const state = await cardState(page);
  assert.equal(state.pricing.available, false);
  assert.equal(state.pricing.issues.length, 1);
  assert.equal(state.pricing.issues[0].field, 'rebar_spacing_width');
  assert.equal(state.item.rebar_feet, 64);
  await invokeToolbar(page, ['onSave', 'onSaveAndExit']);
  assert.equal(await writeSpies(page), 0);
  await page.locator('label:has-text("Spacing width (in)") input').first().fill('12');
  await page.waitForFunction(() => window.__cardProps.f1.pricing.available);
  assert.equal(await inputBanner(page).count(), 0);
  assert.equal(await cardTotal(page).innerText(), '$866.55');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].quantity, 1);
  assert.equal(arg.data.items[0].rebar_layers, null);
  assert.equal(arg.data.items[0].rebar_spacing_length, null);
  assert.equal(arg.data.items[0].rebar_spacing_width, 12);
  assert.equal(arg.data.items[0].rebar_feet, 64);
  assert.equal(arg.data.items[0].item_total_cost, 866.55);
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await draftRaw(page), null);
  await page.screenshot({ path: `${OUT}/r4-legacy-defaults.png` });
});
} else {
// V1 qty0 -> invalid, blocked, all write paths 0
await R('V1 qty0: invalid -> banner, saved amounts, blocked, zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v1');
  await desc(page).fill('validation-description');
  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  await savedBanner(page).first().waitFor();
  assert.equal(await qtyInput(page).inputValue(), '0', 'raw qty 0 kept');
  await threeDNotice(page).waitFor();
  assert.equal(await cardTotal(page).innerText(), '$866.55');
  const state = await cardState(page);
  assert.equal(state.pricing.available, false);
  assert.equal(state.item.quantity, 0);
  assert.equal(state.item.concrete_volume_cy, 1);
  assert.equal(state.item.rebar_feet, 64);
  assert.equal(state.item.item_total_cost, 866.55);
  const data = await draftData(page);
  assert.equal(data.items[0].quantity, 0);
  assert.equal(data.items[0].description, 'validation-description');
  assert.equal(data.notes, 'n');
  assert.equal(await page.locator('[data-stub="CustomerPricingTab"],[data-stub="CustomerPricingPanel"]').count(), 0);
  await page.getByText('Estimate handoff paused', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__toolbarProps.pricingUnavailable), true);
  for (const name of ['Save', 'Save & Exit', 'Save As Copy', 'Swap to BrickStone'])
    await page.getByRole('button', { name, exact: true }).click();
  await invokeToolbar(page, ['onSave', 'onSaveAndExit', 'onSaveAsCopy', 'onSwapToBrickStone']);
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0, 'zero writes while invalid');
  assert.equal((await draftData(page)).notes, 'n', 'notes retained');
  await page.screenshot({ path: OUT + '/v1-qty0.png' });
  await ctx.close();
  return true;
});

// V2 qty-2 then 1.5, len-36/depth0 raw kept, autosave no writes
await R('V2 invalid variants: raw kept, errors, autosave zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v2');
  for (const [field, key, val] of [['Quantity', 'quantity', '-2'], ['Quantity', 'quantity', '1.5'], ['Length (in)', 'length_inches', '-36'], ['Depth (in)', 'depth_inches', '0']]) {
    const inp = page.locator(`label:has-text("${field}") input`).first();
    await inp.fill(val);
    await inputBanner(page).waitFor();
    assert.equal(await inp.inputValue(), val);
    assert.equal((await draftData(page)).items[0][key], Number(val));
    assert.equal((await cardState(page)).pricing.available, false);
    assert.equal(await cardTotal(page).innerText(), '$866.55');
    assert.equal(await writeSpies(page), 0, 'no writes after ' + field);
    if (field !== 'Depth (in)') await inp.fill(field === 'Quantity' ? '1' : '36'); // correct between mutations
  }
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2400);
  assert.equal(await writeSpies(page), 0, 'autosave blocked');
  await page.screenshot({ path: OUT + '/v2-variants.png' });
  await ctx.close();
  return true;
});

// V3 persisted unsupported type -> choose spread_foot -> valid + save
await R('V3 unsupported type: unavailable option, choose spread_foot -> valid, save CAS v1->v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v3', { foundation_type: 'unsupported' }, true);
  await inputBanner(page).waitFor();
  await threeDNotice(page).waitFor();
  const typeSel = page.locator('select').first();
  assert.equal(await typeSel.inputValue(), 'unsupported');
  assert.ok((await typeSel.locator('option').allInnerTexts()).some(t => t.includes('Unsupported type')), 'unavailable option visible');
  assert.equal(await writeSpies(page), 0);
  await typeSel.selectOption('spread_foot');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  assert.equal(await cardTotal(page).innerText(), '$866.55');
  assert.equal((await cardState(page)).pricing.available, true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].foundation_type, 'spread_foot');
  assert.equal(arg.data.items[0].quantity, 1);
  assert.equal(arg.data.items[0].concrete_volume_cy, 1);
  assert.equal(arg.data.items[0].item_total_cost, 866.55);
  assert.equal(arg.data.notes, 'n');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await draftRaw(page), null);
  assert.equal(await srcVersion(page), 'v2', 'v2 after save');
  await page.screenshot({ path: OUT + '/v3-type-repair.png' });
  await ctx.close();
  return true;
});

// V4 invalid qty0 -> leave/return -> restore -> still blocked; undo->valid, redo->invalid
await R('V4 draft restore preserves invalid qty0; undo/redo roundtrip', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v4');
  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await waitQuantity(page, 0);
  await inputBanner(page).waitFor();
  assert.equal((await cardState(page)).pricing.available, false);
  assert.equal((await draftData(page)).notes, 'n');
  assert.equal(await offer(page).count(), 0);
  await page.getByText('Not yet saved', { exact: true }).waitFor();
  assert.equal(await writeSpies(page), 0, 'no writes');
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitQuantity(page, 1);
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  assert.equal((await cardState(page)).pricing.available, true);
  await page.getByRole('button', { name: 'Redo' }).click();
  await waitQuantity(page, 0);
  await inputBanner(page).waitFor();
  assert.equal((await cardState(page)).pricing.available, false);
  assert.equal(await writeSpies(page), 0);
  await page.screenshot({ path: OUT + '/v4-restore-invalid.png' });
  await ctx.close();
  return true;
});

// V5 valid zero concrete override -> save OK
await R('V5 explicit zero concrete override: valid, save CAS v1, cost fields persisted', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v5');
  const override = page.locator('label:has-text("Concrete $/bag override") input, label:has-text("Concrete $/CY override") input, label:has-text("Concrete cost override") input').first();
  await override.fill('0');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].custom_concrete_cost_per_cy, 0, 'override 0 persisted');
  assert.equal(arg.data.items[0].concrete_cost, 0);
  assert.equal(arg.data.items[0].concrete_volume_cy, 1);
  assert.equal(arg.data.items[0].quantity, 1);
  assert.equal((await cardState(page)).pricing.available, true);
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await draftRaw(page), null);
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  await page.screenshot({ path: OUT + '/v5-zero-override.png' });
  await ctx.close();
  return true;
});

// V6 held save + qty0 midflight -> release -> older valid saved, invalid retained, retry v2
await R('V6 held save + qty0 midflight: older saved, invalid retained, retry CAS v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v6');
  await desc(page).fill('held-save');
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  await qtyInput(page).fill('0');
  await waitQuantity(page, 0);
  const newerDraft = await draftRaw(page);
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.getByText('Source saved; estimate/Builder sync incomplete. Retry save.', { exact: true }).waitFor();
  await page.getByText('Not yet saved', { exact: true }).waitFor();
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await draftRaw(page), newerDraft);
  const firstBody = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(firstBody.data.items[0].quantity, 1, 'older valid payload saved');
  assert.equal(firstBody.data.items[0].concrete_volume_cy, 1);
  assert.equal(firstBody.data.items[0].item_total_cost, 866.55);
  assert.equal(firstBody.data.items[0].description, 'held-save');
  assert.equal(firstBody.data.notes, 'n');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 0);
  assert.equal(await spyCount(page, 'onSaved'), 0);
  assert.equal(await spyCount(page, 'onClose'), 0);
  assert.equal(await qtyInput(page).inputValue(), '0', 'invalid raw kept');
  await inputBanner(page).waitFor();
  await qtyInput(page).fill('1');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  assert.equal((await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]))).at(-1).expectedUpdatedAt, 'v2', 'retry CAS v2');
  assert.equal(await spyCount(page, 'saveSource'), 2);
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await srcVersion(page), 'v3');
  assert.equal(await draftRaw(page), null);
  await page.getByText('All changes saved', { exact: false }).waitFor();
  await page.screenshot({ path: OUT + '/v6-held.png' });
  await ctx.close();
  return true;
});

// V7 new foundation + qty0 -> 'Not saved' row, blocked, f1 preserved
await R('V7 new item qty0: Not saved row, blocked, original f1 amount preserved', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v7');
  await page.getByRole('button', { name: 'Add Foundation Item' }).click();
  await page.waitForFunction(() => window.__seenProject.items.length === 2, null, { timeout: 8000 });
  const newCard = page.locator('[class*="border-l-amber-500"]').nth(1);
  await newCard.locator('label:has-text("Quantity") input').first().fill('0');
  await inputBanner(page).waitFor();
  await newCard.locator('div.font-bold.text-gray-900', { hasText: 'Not saved' }).first().waitFor();
  assert.equal((await cardState(page)).item.item_total_cost, 866.55);
  const ids = await page.evaluate(() => Object.keys(window.__cardProps));
  assert.equal(ids.length, 2);
  const newId = ids.find(id => id !== 'f1');
  assert.ok(newId && newId !== 'f1');
  const state = await cardState(page, newId);
  assert.equal(state.item.quantity, 0);
  assert.equal(state.pricing.available, false);
  for (const field of [
    'concrete_volume_cy', 'excavation_volume_cy', 'concrete_bags', 'rebar_feet', 'rebar_weight_lbs',
    'concrete_cost', 'concrete_rate', 'rebar_cost', 'rebar_rate', 'excavation_cost', 'excavation_hours',
    'forming_cost', 'forming_qty', 'pouring_cost', 'finishing_cost', 'finishing_hours', 'item_total_cost',
  ]) assert.equal(state.item[field], undefined, field);
  await invokeToolbar(page, ['onSave', 'onSaveAsCopy']);
  assert.equal(await writeSpies(page), 0, 'no writes');
  await page.screenshot({ path: OUT + '/v7-new-item.png' });
  await ctx.close();
  return true;
});

// V8 pillar diameter0 -> error; ignored inactive dims; valid save volume PI/9
await R('V8 pillar diameter0 -> error; ignored inactive dims; valid save volume PI/9', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v8', {
    foundation_type: 'pillar', diameter: 0, depth_inches: 36, quantity: 1,
    length_inches: -10, width_inches: null,
  }, true);
  await inputBanner(page).waitFor();
  const issues = (await cardState(page)).pricing.issues;
  assert.ok(issues.some(issue => issue.field === 'diameter'));
  assert.ok(!issues.some(issue => ['length_inches', 'width_inches'].includes(issue.field)));
  assert.equal(await writeSpies(page), 0);
  await page.locator('label:has-text("Diameter") input, label:has-text("diameter") input').first().fill('24');
  await page.locator('label:has-text("Depth") input, label:has-text("depth") input').first().fill('36');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  const item = arg.data.items[0];
  assert.equal(item.foundation_type, 'pillar');
  assert.equal(item.diameter, 24);
  assert.equal(item.depth_inches, 36);
  assert.equal(item.quantity, 1);
  assert.equal(item.length_inches, -10);
  assert.equal(item.width_inches, null);
  assert.equal(await srcVersion(page), 'v2');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await draftRaw(page), null);
  const vol = item.concrete_volume_cy;
  assert.ok(Math.abs(vol - Math.PI / 9) < 1e-12, 'pillar volume PI/9 got ' + vol);
  await page.screenshot({ path: OUT + '/v8-pillar.png' });
  await ctx.close();
  return true;
});
}
} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}

// ---------- teardown ----------
if (telemetry.foreign.length) results.push({ case: 'external-request', ok: false, detail: telemetry.foreign });
if (telemetry.pageErrors.length) results.push({ case: 'pageerror', ok: false, detail: telemetry.pageErrors });
if (telemetry.consoleErrors.length) results.push({ case: 'console-error', ok: false, detail: telemetry.consoleErrors });
const scenarioCount = results.filter(r => (BASELINE_MODE ? /^B\d+\b/ : STEEL_MODE ? /^R\d+\b/ : /^V\d+\b/).test(r.case)).length;
if (scenarioCount !== (BASELINE_MODE ? 1 : STEEL_MODE ? 4 : 8)) results.push({ case: 'scenario-count', ok: false, actual: scenarioCount });
fs.writeFileSync(RESULTS_FILE, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));
const fails = results.filter(r => r.ok === false);
console.log(`input-validation scenarios=${scenarioCount} failed=${fails.length}`);
process.exitCode = fails.length ? 1 : 0;
