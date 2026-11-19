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

const OUT = '.audit-work/foundation-equipment13';
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'http://127.0.0.1:5172';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- synthetic fixtures; original engine anchors are frozen separately ----------
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-equipment13/syncrec-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-equipment13/calc-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve('.audit-work/foundation-equipment13/syncrec-b.mjs')));
const { calcProject } = await import(pathToFileURL(path.resolve('.audit-work/foundation-equipment13/calc-b.mjs')));

const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'key-fx-receipt', requestedAt: '2024-01-01T00:00:00Z' });
const EQROW = { id: 'eq1', material_type: 'excavation_equipment', material_name: 'Rental Excavator', cost_per_day: 100, cost_per_week: 500, pickup_delivery_cost: 20, compatible_attachment_ids: ['att1'], is_spread_foot_excavation: true };
const ATTROW = { id: 'att1', material_type: 'attachment', material_name: 'Auger Bit', cost_per_day: 15, compatible_sub_attachment_ids: ['sub1'] };
const SUBROW = { id: 'sub1', material_type: 'sub_attachment', material_name: 'Rock Tip', cost_per_day: 7 };
const PROJ_A = (entry) => ({
  id: 'p1', updated_date: 'v1', project_name: 'EqProj', client_name: 'C', excavation_method: 'hand_dig',
  items: [], poles: [], wall_caps: [], walls: [], signage_cabinets: [],
  selected_equipment: entry ? [entry] : [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
const FULL = () => ({
  inv: [EQROW, ATTROW, SUBROW],
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
  '@/components/estimator/builder/sourceProjectPersistence': `export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);const next={...window.__proj[a.sourceId],...a.data,id:a.sourceId,updated_date:'v2'};window.__proj[a.sourceId]=JSON.parse(JSON.stringify(next));return next;};`,
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

const projMissing = PROJ_A({ _id: 'e1', equipment_id: 'eq1', attachment_counts: {}, equipment_cost: 600 });
projMissing.builder_sync_attempt = RECEIPT;
const projQty = PROJ_A({ _id: 'e2', equipment_id: 'eq1', attachments: [{ id: 'att1', qty: 2 }], equipment_cost: 130 });
projQty.id = 'p2';
const projMobile = PROJ_A({ _id: 'e3', equipment_id: 'gone', attachment_counts: {}, equipment_cost: 600 });
projMobile.id = 'p3';
const DATA = {
  projects: { p1: projMissing, p2: projQty, p3: projMobile },
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

const FULLV = FULL();

try {
// ============ SCENARIO 1: missing-equipment shell, all write paths blocked ============
await R('S1: missing rental parent -> global alert, Saved 600, all save paths blocked', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  const al = await alertText(page);
  assert.ok(al.includes('Pricing unavailable'), 'global alert');
  assert.ok(/Equipment 1/.test(al), 'equipment issue enumerated');
  const body = await page.locator('body').innerText();
  assert.ok(body.includes('$600.00'), 'saved 600 shown');
  assert.equal(await page.locator('[data-equipment-index="0"]').locator('span').filter({ hasText: /^Total: / }).innerText(), 'Total: $600.00');
  if(!body.includes('Unavailable')){fs.writeFileSync('.audit-work/foundation-equipment13/s1-body.txt',body);throw new Error('unavailable breakdown label');}
  const durInput = page.locator('input[aria-label="Rental duration"]').first();
  await durInput.fill('2');
  await page.getByRole('button', { name: 'Save As Copy' }).click();
  await page.getByRole('button', { name: 'Swap to BrickStone' }).click();
  await page.getByRole('button', { name: 'Save & Exit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.keyboard.press('Control+s');
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2300);
  const url = page.url();
  for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
    assert.equal(await spyCount(page, k), 0, 'zero ' + k);
  assert.equal(new URL(url).search, '?id=p1&estimateId=e1');
  const rawAfter = await seen(page);
  assert.deepEqual(rawAfter.builder_sync_attempt, RECEIPT, 'receipt preserved');
  assert.equal(rawAfter.selected_equipment[0].equipment_cost, 600, 'snapshot kept');
  assert.equal(rawAfter.selected_equipment[0].rental_duration, 2, 'unsaved edit kept');
  await ctx.close();
  return true;
});

// ============ SCENARIO 2: reload restore -> save CAS v1; qty edit 2->3 == 130->145 ============
await R('S2: reload restores catalog, save CAS v1 writes real body; qty2->3 costs 145', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's2');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  await page.locator('input[aria-label="Rental duration"]').fill('2');
  await page.locator('button[title="Auto-save"]').click();
  assert.match(await page.locator('button[title="Auto-save"]').getAttribute('class'), /bg-gray-800/);
  await page.waitForFunction(() => window.__seenProject.selected_equipment[0].rental_duration === 2);
  const rawBefore = await seen(page);
  await cat(page, FULLV);
  await arm(page, 3);
  const reloadBtn = page.getByRole('button', { name: /catalogs/ });
  await reloadBtn.click();
  await page.waitForFunction(() => window.__reads.length === 3);
  assert.deepEqual(await readsByLabel(page), ['Foundation inventory', 'Concrete labor/services', 'Estimator Settings']);
  const inputs = await page.evaluate(() => window.__reads.map(({ query, sort }) => ({ query, sort })));
  assert.deepEqual(inputs, [
    { query: { show_in_foundation: true }, sort: 'material_name' },
    { query: { service_category: 'concrete_service', is_active: true }, sort: 'service_name' },
    { query: null, sort: 'created_date' },
  ]);
  assert.equal(await reloadBtn.isDisabled(), true, 'three-read flight has a visible busy state');
  assert.deepEqual(await seen(page), rawBefore, 'busy reload retains the complete raw draft');
  await settleFlight(page, '__reads', [FULLV.inv, FULLV.lab, FULLV.set]);
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 10000 });
  assert.ok(!(await alertText(page)).includes('Pricing unavailable'), 'alert cleared');
  assert.deepEqual(await seen(page), rawBefore, 'successful reload preserves complete draft and receipt');
  assert.match(await page.locator('button[title="Auto-save"]').getAttribute('class'), /bg-gray-300/, 'reload turns autosave off');
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'no auto write');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await spyCount(page, 'onSaved'), 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.deepEqual(arg.data.selected_equipment, calcProject(rawBefore, FULLV.inv, { wall_labor_rate: 25 }).equipment, 'all saved rental data equals the real calculator result');
  assert.equal(arg.data.selected_equipment[0].equipment_cost, 200, 'explicit edited duration and restored pricing');
  // qty edit 2->3 via real panel on p2
  await page.evaluate(() => window.__nav('/?id=p2&estimateId=e1'));
  await waitLoaded(page, 'p2');
  const total = page.locator('[data-equipment-index="0"]').locator('span').filter({ hasText: /^Total: / });
  assert.equal(await total.innerText(), 'Total: $130.00', 'exact card total, not an unrelated catalog rate');
  const qtyInput = page.locator('input[aria-label*="Attachment qty"]').first();
  assert.equal(await qtyInput.inputValue(), '2');
  await qtyInput.fill('3');
  await page.waitForFunction(() => window.__seenProject.selected_equipment[0].attachments[0].qty === 3);
  assert.equal(await total.innerText(), 'Total: $145.00');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 2);
  const keyboardBody = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource')[1][1]);
  assert.equal(keyboardBody.sourceId, 'p2');
  assert.equal(keyboardBody.expectedUpdatedAt, 'v1');
  assert.equal(keyboardBody.data.selected_equipment[0].attachments[0].qty, 3, 'focused input must be included without blur');
  assert.equal(keyboardBody.data.selected_equipment[0].equipment_cost, 145);
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length === 2);
  await qtyInput.blur();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForFunction(() => window.__seenProject.selected_equipment[0].attachments[0].qty === 2);
  assert.equal(await qtyInput.inputValue(), '2', 'Undo resets the local quantity draft');
  await qtyInput.focus();
  await qtyInput.blur();
  assert.equal(await total.innerText(), 'Total: $130.00', 'blur cannot replay the undone input');
  assert.equal((await seen(page)).selected_equipment[0].attachments[0].qty, 2);
  await ctx.close();
  return true;
});

// ============ SCENARIO 3: mobile unavailable card ============
await R('S3: mobile 390 unavailable card stays visible with Saved 600', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); guard(page, 's3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p3&estimateId=e1');
  await waitLoaded(page, 'p3');
  const body = await page.locator('body').innerText();
  assert.ok(body.includes('$600.00'), 'saved 600 on mobile');
  await page.locator('[data-equipment-index="0"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-equipment-index="0"]').locator('span').filter({ hasText: /^Total: / }).innerText(), 'Total: $600.00');
  if(!body.includes('Unavailable')){fs.writeFileSync('.audit-work/foundation-equipment13/s3-body.txt',body);throw new Error('unavailable label');}
  await page.screenshot({ path: '.audit-work/foundation-equipment13/s3-mobile-unavailable.png' });
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
console.log(`equipment-integrity-browser scenarios=3 failed=${fails.length}`);
process.exit(fails.length ? 1 : 0);
