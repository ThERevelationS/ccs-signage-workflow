// O-009 equipment integrity browser fixture: REAL FoundationEstimator page,
// real calcProject/money/catalogIntegrity/panels/toolbar/totals/saveSession/recovery.
// Navigation15 O-004 unsent-draft loss reproduction. Stubs only SDK/service boundaries + visual leaves. Real BrowserRouter routes.
// Exact origin http://127.0.0.1:5172, self-stops. No external requests allowed.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = '.audit-work/foundation-navigation15';
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'http://127.0.0.1:5172';
const results = []; // baseline_reproduction / data_loss_reproduced
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- synthetic fixtures; original engine anchors are frozen separately ----------
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-materials14/syncrec-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-materials14/calc-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/syncrec-b.mjs')));
const { money } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/calc-b.mjs')));
const deep = (o) => JSON.parse(JSON.stringify(o));

// ---------- stubs (boundary + visual leaves only) ----------
const STUBS = {
  '@/components/estimator/foundation/FoundationToolbar': `import Real from 'toolbar-real';export default function FoundationToolbarProbe(p){window.__toolbarProps=p;return Real(p);}`,
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
  b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));
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
const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p3', estimateId: 'e1', key: 'key-nav-receipt-p3', requestedAt: '2024-01-01T00:00:00Z' });
const projB3 = {
  id: 'p3', updated_date: 'v1', project_name: 'NavProj', client_name: 'C', notes: 'n', excavation_method: 'hand_dig',
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


const settleAll = async (page) => {
  await page.evaluate(() => {
    for (const r of window.__reads) r.res(r.entity === window.__entInv ? window.__cat.inv : r.entity === window.__entLab ? window.__cat.lab : window.__cat.set);
    window.__reads = [];
  });
};
const readsInfo = (page) => page.evaluate(() => window.__reads.map(r => ({ label: r.label, query: r.query, sort: r.sort })));
const catFull = async (page) => { await cat(page, FULLV()); await arm(page, 3); };

const desc = (page) => page.locator('label:has-text("Description") input').first();
const offer = (page) => page.getByText('Unsent browser-tab draft found.', { exact: false });
const backedUp = (page) => page.getByText('Design edits backed up in this browser tab', { exact: false });
const ORIGINAL_DESC = EXP_ITEM.description || '';
const writeSpies = (page) => page.evaluate(() => window.__spies.filter(x => ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'].includes(x[0])).length);
const srcVersion = (page) => page.evaluate(() => window.__proj.p3.updated_date);
const openEstimator = async (ctx, tag) => {
  const page = await ctx.newPage(); guard(page, tag);
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  return page;
};
const DRAFT_KEY = 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify(['synthetic-staff', 'p3', 'e1']));
const draftKey = (page, owner = 'synthetic-staff') => page.evaluate((k) => sessionStorage.getItem(k), 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify([owner, 'p3', 'e1'])));
const draftRaw = (page) => draftKey(page);

// N1: Back/Forward -> offer -> restore exact unsent description
await R('N1 recovery: back/forward offers draft; restore yields exact description, zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n1');
  await desc(page).fill('native-back-unsent');
  await backedUp(page).waitFor();
  await page.goBack();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.goForward();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'server description before choice');
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'native-back-unsent', null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), 'native-back-unsent', 'restored exact description');
  assert.equal((await seen(page)).items[0].component_id, 'f1', 'stable f1');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  assert.ok(await backedUp(page).count() > 0, 'backup claim after restore');
  await page.getByText('Not yet saved', { exact: false }).waitFor();
  const storedEnv = JSON.parse(await draftRaw(page));
  assert.equal(storedEnv.data.items[0].description, 'native-back-unsent', 'cache holds restored desc');
  await page.screenshot({ path: OUT + '/n1-restored.png' });
  await ctx.close();
  return true;
});

// N2: app-shell leave/return; discard cancel preserves, confirm removes exact revision
await R('N2 recovery: shell leave/return -> cancel discard keeps offer; confirm removes cache only', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n2');
  await desc(page).fill('app-shell-unsent');
  await backedUp(page).waitFor();
  const rev = await draftRaw(page);
  assert.ok(rev, 'draft stored');
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  await offer(page).waitFor();
  assert.equal(await draftRaw(page), rev, 'canceled discard keeps raw');
  await page.evaluate((k) => sessionStorage.setItem(k, 'keep-me'), 'ccs:foundation-draft:v1:other-sentinel');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Unsent browser-tab'), null, { timeout: 8000 });
  assert.equal(await draftRaw(page), null, 'exact draft key removed');
  assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), 'ccs:foundation-draft:v1:other-sentinel'), 'keep-me', 'sentinel retained');
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'server description kept');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  await page.screenshot({ path: OUT + '/n2-discarded.png' });
  await ctx.close();
  return true;
});

// N3: real beforeunload dismiss retains; accepted reload offers + restore
await R('N3 recovery: real reload dismiss retains; accepted reload offers, restore exact', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n3');
  await desc(page).fill('reload-unsent');
  await backedUp(page).waitFor();
  let fired = false;
  page.once('dialog', d => { fired = true; d.dismiss(); });
  let navErr = null;
  try { await page.reload({ timeout: 8000 }); } catch (e) { navErr = String(e.message || e); }
  assert.equal(fired, true, 'beforeunload fired');
  assert.ok(/navigat|cancel/i.test(navErr || ''), 'reload cancelled');
  assert.equal(await desc(page).inputValue(), 'reload-unsent', 'edits retained');
  const dlg = page.waitForEvent('dialog', { timeout: 8000 });
  const rel = page.reload();
  const d = await dlg;
  assert.equal(d.type(), 'beforeunload', 'second dialog also real beforeunload');
  await d.accept();
  await rel;
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'reload-unsent', null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), 'reload-unsent', 'restored exact');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  await page.screenshot({ path: OUT + '/n3-reload-restored.png' });
  await ctx.close();
  return true;
});

// N4: explicit save -> CAS v1, source+Builder once, exact cache cleared, saved state
await R('N4 save: CAS current, source+Builder once, exact cache removed, saved state', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n4');
  await desc(page).fill('save-unsent');
  await backedUp(page).waitFor();
  const rev = await draftRaw(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await srcVersion(page), 'v2', 'source -> v2');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').length), 1, 'source once');
  assert.equal(await draftRaw(page), null, 'exact cache removed');
  await page.getByText('All changes saved', { exact: false }).waitFor();
  assert.equal(await backedUp(page).count(), 0, 'backup status gone');
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true, 'Save disabled when clean');
  await page.screenshot({ path: OUT + '/n4-saved.png' });
  await ctx.close();
  return true;
});

// N5: deferred write + newer edit -> stale completion can't clear; retry uses latest CAS
await R('N5 deferred write + newer edit: stale ack keeps newer draft/dirty; retry uses latest CAS', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n5');
  await desc(page).fill('older-save');
  await backedUp(page).waitFor();
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  await desc(page).fill('newer-edit');
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'newer-edit', null, { timeout: 8000 });
  const revNewer = await draftRaw(page);
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.getByText('Source saved; estimate/Builder sync incomplete', { exact: false }).waitFor();
  await page.waitForFunction(() => window.__proj.p3.updated_date === 'v2', null, { timeout: 10000 });
  assert.equal(await desc(page).inputValue(), 'newer-edit', 'live desc still newer');
  await page.getByText('Not yet saved', { exact: false }).waitFor();
  assert.equal(JSON.parse(await draftRaw(page)).data.items[0].description, 'newer-edit', 'raw cache is newer');
  const firstBody = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(firstBody.data.items[0].description, 'older-save', 'source body was older');
  assert.equal(firstBody.data.notes, 'n', 'notes literal in saved body');
  assert.equal(await draftRaw(page), revNewer, 'newer draft retained, not cleared by stale ack');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 0, 'no stale Builder');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'onSaved').length), 0, 'no stale onSaved');
  // leave + return -> offer restores NEWER edit; retry CAS against latest
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  page.once('dialog', d => d.accept()); // draft base v1 vs saved v2 -> confirm required
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'newer-edit', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg2[1].expectedUpdatedAt, 'v2', 'retry CAS v2 (latest ack)');
  await page.screenshot({ path: OUT + '/n5-newer-retry.png' });
  await ctx.close();
  return true;
});

// N6: owner A draft never appears for B, remains for A
await R('N6 owner isolation: B sees no A offer; A returns -> offer', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n6');
  await desc(page).fill('owner-a-unsent');
  await backedUp(page).waitFor();
  await page.evaluate(() => { window.__ownerId = 'staff-b'; window.__ownerCb && window.__ownerCb(); });
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  assert.equal(await offer(page).count(), 0, 'no A offer for B');
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'B sees server description');
  assert.ok(await draftRaw(page), 'A raw storage remains');
  await page.evaluate(() => { window.__ownerId = 'synthetic-staff'; window.__ownerCb && window.__ownerCb(); });
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'owner-a-unsent', null, { timeout: 8000 });
  assert.equal(await writeSpies(page), 0, 'zero writes on A restore');
  await page.screenshot({ path: OUT + '/n6-owner-isolation.png' });
  await ctx.close();
  return true;
});

// N7: backend changed -> offer warns; restore confirm keeps fresh id/version/receipt/customer; save CAS new version
await R('N7 changed backend: warn+confirm; forbidden fields dropped; save CAS new version', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n7');
  await desc(page).fill('stale-base-unsent');
  await backedUp(page).waitFor();
  // simulate a newer source save + tamper the draft with DISTINCT forbidden values
  await page.evaluate(() => { window.__proj.p3.updated_date = 'v9'; window.__proj.p3.items[0].description = 'server-newer'; window.__proj.p3.customer_pricing = { applied: false, tier_number: 7, marker: 'server-current' }; window.__proj.p3.customer_id = 'server-customer-v9'; window.__proj.p3.client_name = 'Server V9'; });
  await page.evaluate((k) => {
    const env = JSON.parse(sessionStorage.getItem(k));
    env.data.id = 'forged'; env.data.updated_date = 'forged-version'; env.data.customer_pricing = { applied: true, tier_number: 99 }; env.data.builder_sync_attempt = { key: 'forged' };
    sessionStorage.setItem(k, JSON.stringify(env));
  }, DRAFT_KEY);
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByText('Saved project changed since these edits', { exact: false }).waitFor();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  assert.equal(await desc(page).inputValue(), 'server-newer', 'cancel keeps server value');
  assert.equal(JSON.parse(await draftRaw(page)).data.id, 'forged', 'cancel leaves raw cache');
  await offer(page).waitFor();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'stale-base-unsent', null, { timeout: 8000 });
  const raw = await seen(page);
  assert.equal(raw.id, 'p3', 'fresh id kept');
  assert.equal(raw.updated_date, 'v9', 'fresh version kept');
  assert.equal(raw.items[0].component_id, 'f1');
  assert.deepEqual(raw.customer_pricing, { applied: false, tier_number: 7, marker: 'server-current' }, 'fresh pricing metadata kept');
  assert.equal(raw.customer_id, 'server-customer-v9', 'fresh customer kept');
  assert.equal(raw.client_name, 'Server V9', 'fresh client kept');
  assert.deepEqual(raw.builder_sync_attempt, RECEIPT, 'receipt kept');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v9', 'save CAS against new version');
  await page.screenshot({ path: OUT + '/n7-new-base.png' });
  await ctx.close();
  return true;
});

// N8: throwing storage -> warning, edits retained, save still possible
await R('N8 storage failure: warning shown, edits retained, no false backup, save works', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n8');
  await page.evaluate(() => {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    window.__restoreStorage = () => Object.defineProperty(Storage.prototype, 'setItem', orig);
    Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('quota'); }, configurable: true });
  });
  await desc(page).fill('storage-fail-unsent');
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'storage-fail-unsent', null, { timeout: 8000 });
  await page.getByText('Latest edits could not be backed up', { exact: false }).waitFor();
  assert.equal(await backedUp(page).count(), 0, 'no false backup claim');
  assert.equal(await desc(page).inputValue(), 'storage-fail-unsent', 'edits retained');
  await page.evaluate(() => window.__restoreStorage());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  await page.screenshot({ path: OUT + '/n8-storage-fail.png' });
  await ctx.close();
  return true;
});

// N9: newer raw inserted mid-offer -> stale discard retains; storage-fail reread preserves actions
await R('N9 mid-offer write: stale discard retains new rev; storage-fail reread preserves offer', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n9');
  await desc(page).fill('offer-then-newer');
  await backedUp(page).waitFor();
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  const oldRev = await draftRaw(page);
  // newer write behind the offer (another tab effect)
  await page.evaluate(() => {
    const k = Object.keys(sessionStorage).find(k => k.startsWith('ccs:foundation-draft'));
    const env = JSON.parse(sessionStorage.getItem(k));
    env.savedAt = '2025-06-01T00:00:00Z'; env.data.notes = 'newer';
    sessionStorage.setItem(k, JSON.stringify(env));
  });
  const newRev = await draftRaw(page);
  assert.notEqual(newRev, oldRev, 'newer raw inserted');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  assert.equal(await draftRaw(page), newRev, 'stale discard cannot remove newer record');
  await offer(page).waitFor();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  assert.equal(await draftRaw(page), newRev, 'canceled confirm untouched');
  // storage reread failure preserves offer + buttons
  await page.evaluate(() => {
    window.__failGet = true;
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
    window.__restoreGet = () => Object.defineProperty(Storage.prototype, 'getItem', orig);
    Object.defineProperty(Storage.prototype, 'getItem', { value: function(){ if (window.__failGet) throw new Error('io'); return orig.value.apply(this, arguments); }, configurable: true });
  });
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await offer(page).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Restore browser draft' }).count(), 1, 'restore still offered');
  await page.evaluate(() => { window.__failGet = false; });
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'offer-then-newer', null, { timeout: 8000 });
  // post-restore editor state: notes from newer raw, no pending lock, Save enabled
  assert.equal(JSON.parse(await draftRaw(page)).data.notes, 'newer', 'raw notes newer');
  assert.equal(await offer(page).count(), 0, 'offer dismissed');
  assert.equal(await backedUp(page).count(), 1, 'backed-up status');
  assert.equal(await desc(page).isEnabled(), true, 'editor enabled');
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true, 'Save enabled');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  assert.equal((await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]))).at(-1).expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await draftRaw(page), null, 'matching cache cleared');
  await page.screenshot({ path: OUT + '/n9-stale-discard.png' });
  await ctx.close();
  return true;
});

// N10: pending blocks all handlers; restore->undo->redo sync cache + latest CAS
await R('N10 pending blocks handlers; restore+undo+redo syncs cache, CAS latest', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n10');
  await desc(page).fill('pending-unsent');
  await backedUp(page).waitFor();
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  // all write paths blocked while pending (toolbar inside disabled fieldset)
  for (const name of ['Save', 'Save As Copy', 'Swap to BrickStone'])
    assert.equal(await page.getByRole('button', { name, exact: name === 'Save' }).first().isDisabled(), true, name + ' disabled while pending');
  await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Save') b.click(); });
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0, 'zero writes while pending');
  // programmatic handler invocations through real captured props: all blocked while pending
  await page.evaluate(() => {
    const t = window.__toolbarProps;
    for (const fn of [t.onSave, t.onSaveAndExit, t.onSaveAsCopy, t.onSwapToBrickStone, t.onTemplates, t.onSaveAsTemplate, t.onShareLink, t.onToggleAutoSave, t.onUndo, t.onRedo]) { try { fn && fn(); } catch (e) {} }
  });
  assert.equal(await writeSpies(page), 0, 'programmatic handlers zero writes');
  assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]') !== null), false, 'no template dialog');
  // restore then undo/redo -> cache follows with real content
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'pending-unsent', null, { timeout: 8000 });
  const revRestored = await draftRaw(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description !== 'pending-unsent', null, { timeout: 8000 });
  const revUndo = JSON.parse(await draftRaw(page));
  assert.equal(revUndo.data.items[0].description, EXP_ITEM.description, 'undo cache holds original desc');
  assert.equal(revUndo.baseUpdatedAt, 'v1', 'undo cache base v1');
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'pending-unsent', null, { timeout: 8000 });
  const revRedo = JSON.parse(await draftRaw(page));
  assert.equal(revRedo.data.items[0].description, 'pending-unsent', 'redo cache holds draft desc');
  assert.notEqual(JSON.stringify(revRedo), revRestored, 'redo revision differs');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS latest');
  // second cycle proves undo keeps latest acknowledgment (v2)
  await desc(page).fill('post-save-edit');
  await backedUp(page).waitFor();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description !== 'post-save-edit', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'post-save-edit', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 2, null, { timeout: 10000 });
  const arg2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg2[1].expectedUpdatedAt, 'v2', 'second save CAS v2 after undo/redo');
  await page.screenshot({ path: OUT + '/n10-undo-redo.png' });
  await ctx.close();
  return true;
});

} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}

// ---------- teardown ----------
if (telemetry.foreign.length) results.push({ case: 'external-request', ok: false, detail: telemetry.foreign });
if (telemetry.pageErrors.length) results.push({ case: 'pageerror', ok: false, detail: telemetry.pageErrors });
if (telemetry.consoleErrors.length) results.push({ case: 'console-error', ok: false, detail: telemetry.consoleErrors });
fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));
const fails = results.filter(r => r.ok === false);
const scenarioCount = results.filter(r => /^N\d+/.test(r.case)).length;
console.log(`navigation-recovery scenarios=${scenarioCount} failed=${fails.length}`);
process.exitCode = fails.length ? 1 : 0;
