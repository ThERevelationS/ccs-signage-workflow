// O-009 catalog-cost integrity browser fixture: REAL FoundationEstimator page,
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

const OUT = '.audit-work/foundation-catalog-pricing11';
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'http://127.0.0.1:5172';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- frozen fixtures (loss-repro inputs + lead's inventory literal) ----------
const IN = JSON.parse(fs.readFileSync(`${OUT}/calculator-loss-repro.json`, 'utf8')).inputs;
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm', outfile: `${OUT}/syncrec-b.mjs`, alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm', outfile: `${OUT}/calc-b.mjs`, alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve(`${OUT}/syncrec-b.mjs`)));
const { calcProject } = await import(pathToFileURL(path.resolve(`${OUT}/calc-b.mjs`)));

const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'key-fx-receipt', requestedAt: '2024-01-01T00:00:00Z' });
const PROJ_A = () => ({
  id: 'p1', updated_date: 'v1', project_name: 'ProjA', client_name: 'C', excavation_method: 'hand_dig',
  items: [], poles: [JSON.parse(JSON.stringify(IN.pole))], wall_caps: [JSON.parse(JSON.stringify(IN.cap))],
  walls: [JSON.parse(JSON.stringify(IN.wall))], signage_cabinets: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
const PROJ_B = () => ({ id: 'b', updated_date: 'vB', project_name: 'RouteB-Proj', items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [] });
const FULL = () => ({
  inv: [
    { id: IN.pole.pole_id, material_name: 'Restored pole', material_type: 'pole', cost_per_unit: 10, pole_pricing_mode: 'per_lf' },
    { id: IN.cap.cap_inventory_id, material_name: 'Restored cap', material_type: 'wall_cap', cap_stock_price: 17, cap_stock_length_inches: 48 },
    { id: IN.wall.materialId, material_name: 'Restored masonry', material_type: 'wall_material', wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, cost_per_unit: 2 },
  ],
  lab: [],
  set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }],
});

// ---------- stubs (boundary + visual leaves only) ----------
const STUBS = {
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
  '@/components/estimator/builder/sourceProjectPersistence': `export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);return{...window.__proj[a.sourceId],...a.data,id:a.sourceId,updated_date:'v2'};};`,
  '@/components/staff/staffEntities': `export const staffEntities={
    FoundationProject:{get:async(id)=>{window.__spies.push(['projectGet',id]);const p=window.__proj[id];return p?JSON.parse(JSON.stringify(p)):null;},update:async()=>({}),updateMany:async()=>({updated:0})},
    FoundationInventory:window.__entInv||(window.__entInv={__ent:'inv'}),
    LaborServiceInventory:window.__entLab||(window.__entLab={__ent:'lab'}),
    Settings:window.__entSet||(window.__entSet={__ent:'set'}),
    AllInOneEstimate:{get:async(id)=>{window.__spies.push(['estimateGet',id]);const e=window.__est[id];return e?JSON.parse(JSON.stringify(e)):null;}}};`,
  '@/components/estimator/foundation/convertToBrickStone': `export const convertFoundationToBrickStone=async()=>{window.__spies.push(['converter']);return{id:'d1'};};`,
  '@/components/estimator/moduleShared/moduleProjectActions': `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  '@/components/utils': `export const createPageUrl=(n)=>'/'+n;`,
  '@/components/estimator/foundation/FoundationItemCard': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationRatesPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationEquipmentTab': `export default ()=><div/>`,
  '@/components/estimator/foundation/ConcreteDeliveryPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationBOM': `export default ()=><div/>`,
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
window.__cat = { inv: [], lab: [], set: [] };
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
const bundle = built.outputFiles[0].text;

const projA1 = PROJ_A(); projA1.builder_sync_attempt = RECEIPT;
const projA2 = PROJ_A(); projA2.id = 'p2'; projA2.poles = [{ component_id: 'po-x', pole_id: 'unavailable-pole', pole_painting_cost: 3, total_cost: 45 }];
const projA3 = PROJ_A(); projA3.id = 'p3'; projA3.poles[0].pole_cost = 0;
const DATA = {
  projects: { p1: projA1, p2: projA2, p3: projA3, b: PROJ_B() },
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
const settle = (page, i, val) => page.evaluate(([i, v]) => window.__reads[i].res(v), [i, val]);
const reject = (page, i, msg) => page.evaluate(([i, m]) => window.__reads[i].rj(new Error(m)), [i, msg]);
const readsByLabel = (page) => page.evaluate(() => window.__reads.map(r => r.label));
const spyCount = (page, k) => page.evaluate((k) => window.__spies.filter(x => x[0] === k).length, k);
const seen = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__seenProject)));
const cat = (page, c) => page.evaluate((c) => window.__ctl('setCatalog', c), c);
const arm = (page, n) => page.evaluate((n) => window.__ctl('arm', n), n);
const waitLoaded = async (page, id) => page.waitForFunction((id) => window.__seenProject?.id === id, id, { timeout: 10000 });
const alertText = async (page) => (await page.locator('[role=alert]').allTextContents()).join(' ');
const FULLV = FULL();
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

// ============ SCENARIO 1: missing catalog shell (desktop) ============
await R('S1: missing catalog shell — alert, saved amounts, all write paths blocked', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(`${ORIGIN}/?id=p1&estimateId=e1`);
  await waitLoaded(page, 'p1');
  const al = await alertText(page);
  assert.ok(al.includes('Pricing unavailable'), 'global alert');
  for (const iss of ['Pole 1', 'Wall cap 1', 'Wall 1']) assert.ok(al.includes(iss + ':'), `issue ${iss}`);
  const body = await page.locator('body').innerText();
  for (const amt of ['$42.00', '$3.00', '$45.00', '$17.00', '$196.00']) assert.ok(body.includes(amt), `saved ${amt}`);
  assert.ok(body.includes('Saved amounts (not current pricing)'), 'saved label');
  assert.ok(!/Total: \$0\.00/.test(body), 'no $0 total');
  assert.equal(await page.locator('[data-stub="CustomerPricingPanel"]').count(), 0, 'pricing editor hidden');
  const rawBefore = await seen(page);
  // dirty via wall name input
  const nameInput = page.locator('input').first();
  await nameInput.fill('UserEditedWall');
  // blocked actions
  await page.getByRole('button', { name: 'Save As Copy' }).click();
  await page.getByRole('button', { name: 'Swap to BrickStone' }).click();
  await page.getByRole('button', { name: 'Save & Exit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.keyboard.press('Control+s');
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2300);
  const url = page.url();
  for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
    assert.equal(await spyCount(page, k), 0, `zero ${k}`);
  assert.equal(new URL(url).search, '?id=p1&estimateId=e1', 'route unchanged');
  const rawAfter = await seen(page);
  assert.deepEqual(rawAfter.builder_sync_attempt, RECEIPT, 'receipt preserved');
  for (const f of ['pole_id', 'pole_cost', 'pole_painting_cost', 'total_cost'])
    assert.equal(rawAfter.poles[0][f], rawBefore.poles[0][f], `pole ${f} unchanged`);
  // unknown pole_cost -> Not saved (p2), explicit 0 -> $0.00 (p3)
  await page.evaluate(() => window.__nav('/?id=p2&estimateId=e1'));
  await waitLoaded(page, 'p2');
  assert.ok(await page.locator('span').filter({ hasText: /^Pole\s+Not saved$/ }).count() > 0, 'unknown pole cost -> Not saved in its own span');
  assert.ok((await page.locator('body').innerText()).includes('$3.00'), 'sibling known cost still real');
  assert.match(await page.locator('button[title="Auto-save"]').getAttribute('class'), /bg-gray-800/, 'autosave remains enabled in this receipt-free project');
  await page.locator('input').first().fill('ReceiptFreeDirtyEdit');
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'catalog guard also pauses autosave without a pending receipt');
  assert.equal((await page.locator('body').innerText()).includes('Resolve catalog availability before saving.'), false, 'autosave does not repeatedly invoke the blocked save handler');
  await page.evaluate(() => window.__nav('/?id=p3&estimateId=e1'));
  await waitLoaded(page, 'p3');
  assert.ok(await page.locator('span').filter({ hasText: /^Pole\s+\$0\.00$/ }).count() > 0, 'explicit zero in its own pole amount span');
  await ctx.close();
  return true;
});

// ============ SCENARIO 2: reload failure/retry/success (mobile 390) ============
await R('S2: reload failure -> retry -> success -> explicit save CAS v1', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); guard(page, 's2');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(`${ORIGIN}/?id=p1&estimateId=e1`);
  await waitLoaded(page, 'p1');
  await page.locator('input').first().fill('MobileEdit');
  await page.locator('button[title="Auto-save"]').click();
  assert.match(await page.locator('button[title="Auto-save"]').getAttribute('class'), /bg-gray-800/, 'autosave enabled before catalog refresh');
  const rawBefore = await seen(page);
  await page.screenshot({ path: `${OUT}/s2-mobile-warning.png` });
  // first flight: defer 3 reads
  await arm(page, 3);
  const reloadBtn = page.getByRole('button', { name: /catalogs/ });
  await reloadBtn.click();
  assert.equal(await reloadBtn.isDisabled(), true, 'disabled while pending');
  await page.waitForFunction(() => window.__reads.length === 3);
  assert.deepEqual(await readsByLabel(page), ['Foundation inventory', 'Concrete labor/services', 'Estimator Settings']);
  // reject Settings, resolve other 2
  const setIdx = (await readsByLabel(page)).indexOf('Estimator Settings');
  await reject(page, setIdx, 'net down');
  await settle(page, (await readsByLabel(page)).indexOf('Foundation inventory'), []);
  await settle(page, (await readsByLabel(page)).indexOf('Concrete labor/services'), []);
  await page.waitForFunction(() => !document.body.innerText.includes('Reloading'), null, { timeout: 10000 });
  assert.equal(await reloadBtn.isDisabled(), false, 'busy reset');
  assert.ok((await alertText(page)).includes('Pricing unavailable'), 'alert remains');
  assert.ok((await page.locator('body').innerText()).includes('Catalog reload failed'), 'error visible');
  assert.deepEqual(await seen(page), rawBefore, 'draft/receipt kept after failure');
  // retry with full catalog
  await cat(page, FULLV);
  const readsBefore = await page.evaluate(() => window.__allReads.length);
  await reloadBtn.click();
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 10000 });
  const reads = await page.evaluate((n) => window.__allReads.slice(n), readsBefore);
  assert.equal(reads.length, 3, 'retry: exactly 3 reads');
  assert.deepEqual(reads.map(r => r.label), ['Foundation inventory', 'Concrete labor/services', 'Estimator Settings']);
  assert.equal((await alertText(page)).includes('Pricing unavailable'), false, 'alert cleared');
  assert.ok((await page.locator('body').innerText()).includes('Restored pole'), 'restored catalog label rendered');
  assert.deepEqual(await seen(page), rawBefore, 'successful refresh also retains the complete unsaved design');
  assert.match(await page.locator('button[title="Auto-save"]').getAttribute('class'), /bg-gray-300/, 'catalog refresh explicitly turns autosave off');
  assert.deepEqual((await seen(page)).builder_sync_attempt, rawBefore.builder_sync_attempt, 'receipt kept');
  assert.ok((await page.locator('[data-stub="CustomerPricingPanel"]').count()) >= 1, 'pricing editor present');
  // autosave must be OFF after reload; wait >2s no writes
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'no auto write after refresh');
  // explicit save: CAS v1, exactly 1 write + 1 builder + onSaved
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  assert.equal(await spyCount(page, 'saveSource'), 1);
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await spyCount(page, 'onSaved'), 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS baseline v1');
  const expected = calcProject(rawBefore, FULLV.inv, { wall_labor_rate: 25 });
  assert.deepEqual(arg.data.poles.map(p => p.total_cost), expected.poles.map(p => p.total_cost), 'pole costs real');
  assert.deepEqual(arg.data.walls.map(w => w.calculatedCosts), expected.walls.map(w => w.calculatedCosts), 'wall costs real');
  assert.deepEqual(arg.data.wall_caps.map(w => w.cost), expected.wallCaps.map(w => w.cost), 'cap costs real');
  await ctx.close();
  return true;
});

// helper for S3/S4
const gotoA = async (page) => { await page.evaluate(() => window.__nav('/?id=p1&estimateId=e1')); await waitLoaded(page, 'p1'); };
const gotoB = async (page) => { await page.evaluate(() => window.__nav('/?id=b&estimateId=e2')); await waitLoaded(page, 'b'); };

// ============ SCENARIO 3: A-B-A overlap, OLD flight succeeds ============
await R('S3: old A reload settling (success) during NEW A flight cannot hijack it', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(`${ORIGIN}/?id=p1&estimateId=e1`);
  await waitLoaded(page, 'p1');
  assert.ok((await alertText(page)).includes('Pricing unavailable'));
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length === 3);
  // B loads fully (no global defer)
  await gotoB(page);
  assert.equal((await seen(page)).project_name, 'RouteB-Proj', 'B fully loaded');
  // back to A, fully loaded
  await gotoA(page);
  assert.equal((await seen(page)).id, 'p1');
  assert.ok((await alertText(page)).includes('Pricing unavailable'), 'A alert back');
  const rawA = await seen(page);
  // NEW A flight: arm + click
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length === 3);
  assert.equal(await page.getByRole('button', { name: /catalogs/ }).isDisabled(), true, 'new flight disables');
  // now settle ALL old-A reads (they were queued earlier) — old flight completes
  const oldCatalog = FULLV.inv.map(row => ({ ...row, material_name: 'STALE old catalog' }));
  await settleFlight(page, '__oldReads', [oldCatalog, [], FULLV.set]);
  assert.equal(await page.getByRole('button', { name: /catalogs/ }).isDisabled(), true, 'new flight still disabled after old settles');
  assert.ok((await alertText(page)).includes('Pricing unavailable'), 'old valid catalog cannot enable pricing in the new visit');
  assert.equal((await page.locator('body').innerText()).includes('STALE old catalog'), false, 'old catalog was not installed');
  assert.equal((await page.locator('body').innerText()).includes('Catalog reload failed'), false, 'no old error');
  assert.deepEqual(await seen(page), rawA, 'A project untouched by old flight');
  // resolve NEW flight with fresh catalog
  await cat(page, FULLV);
  await settleFlight(page, '__reads', [FULLV.inv, FULLV.lab, FULLV.set]);
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'));
  assert.ok((await page.locator('body').innerText()).includes('Restored pole'), 'new visit installs only its own restored catalog');
  await ctx.close();
  return true;
});

// ============ SCENARIO 4: A-B-A overlap, OLD flight fails ============
await R('S4: old A reload failing during NEW A flight leaves new busy + draft intact', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's4');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(`${ORIGIN}/?id=p1&estimateId=e1`);
  await waitLoaded(page, 'p1');
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length === 3);
  await gotoB(page);
  assert.equal((await seen(page)).id, 'b');
  await gotoA(page);
  assert.ok((await alertText(page)).includes('Pricing unavailable'));
  const rawA = await seen(page);
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length === 3);
  assert.equal(await page.getByRole('button', { name: /catalogs/ }).isDisabled(), true);
  // reject old Settings, resolve other old 2 — old flight fails while new pending
  await settleFlight(page, '__oldReads', [[], [], []], 'old fail');
  assert.equal(await page.getByRole('button', { name: /catalogs/ }).isDisabled(), true, 'new flight still busy after old failure');
  assert.equal((await page.locator('body').innerText()).includes('old fail'), false, 'no old error on new context');
  assert.deepEqual(await seen(page), rawA, 'project untouched');
  // complete NEW flight with still-missing catalog -> alert stays, button re-enabled
  await cat(page, { inv: [], lab: [], set: [] });
  await settleFlight(page, '__reads', [[], [], []]);
  assert.equal(await page.getByRole('button', { name: /catalogs/ }).isDisabled(), false, 'busy false after new completion');
  assert.ok((await alertText(page)).includes('Pricing unavailable'), 'alert remains with missing catalog');
  // retry launches fresh reads
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length === 3);
  await settleFlight(page, '__reads', [[], [], []]);
  assert.equal(await page.getByRole('button', { name: /catalogs/ }).isDisabled(), false, 'retry also releases its own busy state');
  await ctx.close();
  return true;
});

// ---------- teardown ----------
if (telemetry.foreign.length) results.push({ case: 'external-request', ok: false, detail: telemetry.foreign });
if (telemetry.pageErrors.length) results.push({ case: 'pageerror', ok: false, detail: telemetry.pageErrors });
if (telemetry.consoleErrors.length) results.push({ case: 'console-error', ok: false, detail: telemetry.consoleErrors });
fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));
await browser.close();
server.close();
const fails = results.filter(r => r.ok === false);
console.log(`catalog-integrity-browser scenarios=4 failed=${fails.length}`);
process.exit(fails.length ? 1 : 0);
