// O-009 catalog-cost integrity — repaired node suite. Real page + real calcProject
// graph + real pole/cap/wall panels + real saveSession. Stubs only the staff-entity
// boundary, service writes, and visual leaf panels. Never stubs foundationCalc,
// money, catalogIntegrity, or foundationSyncRecovery.
import esbuild from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const OUT = '.audit-work/foundation-catalog-pricing11';
fs.mkdirSync(OUT, { recursive: true });

// ---------- window shim with real event-handler capture ----------
const winHandlers = {};
globalThis.window = {
  location: { search: '?id=p1&estimateId=e1' },
  confirm: () => true,
  alert: () => {},
  addEventListener: (t, f) => { (winHandlers[t] ??= []).push(f); },
  removeEventListener: (t, f) => { winHandlers[t] = (winHandlers[t] || []).filter(h => h !== f); },
};
globalThis.location = globalThis.window.location;
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, querySelectorAll: () => [], createElement: () => ({ style: {} }) };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });

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
  '@/components/markup/savedCustomerPricing': `export async function calculateSavedCustomerPricing(a){globalThis.__spies.push(['pricing',a]);return{applied:true};}`,
  '@/components/markup/CustomerPricingTab': `export default ()=><div data-stub="CustomerPricingTab"/>;`,
  '@/components/markup/projectCategorizer': `export function categorizeFoundationProject(){return{};}`,
  '@/components/estimator/builder/builderService': `const FIELDS=["total_concrete_cost","total_rebar_cost","total_excavation_cost","total_forming_materials_cost","total_labor_cost","total_wall_cost","total_pole_cost","total_pole_painting_cost","total_equipment_cost","total_wall_cap_cost","total_signage_cabinet_cost","total_landscape_cost"];export const FOUNDATION_RECORD_TOTAL_FIELDS=FIELDS;export const foundationRecordSavedTotal=r=>{if(!r||!FIELDS.some(k=>Number.isFinite(Number(r[k]))))return null;return FIELDS.reduce((s,k)=>s+(Number.isFinite(Number(r[k]))?Number(r[k]):0),0);};export const recordBuilderSave=async a=>{globalThis.__spies.push(['recordBuilderSave',a]);return{module_key:'foundation',project_id:a.line.project_id,estimate_id:a.estimateId,updated_date_snapshot:a.sourceProject.updated_date};};`,
  '@/components/estimator/idempotentEntityCreate': `export const ensureIdempotentEntityCreate=(...a)=>{globalThis.__spies.push(['ensureIdempotent',a]);return Promise.resolve({id:'new-'+(globalThis.__kseq=(globalThis.__kseq||0)+1)});};export const newCreationRequestKey=(k)=>'key-'+(k||'x')+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);`,
  '@/components/estimator/loadAllEntityRows': `export async function loadAllEntityRows(a){const rec={label:a.label,entity:a.entity,query:a.query||null,sort:a.sort||null};globalThis.__catalogReads.push(rec);if(globalThis.__deferReads){return new Promise((res,rj)=>{globalThis.__deferReads.push({rec,res,rj});});}if(a.entity===globalThis.__entInv)return globalThis.__invRows||[];if(a.entity===globalThis.__entLab)return globalThis.__labRows||[];if(a.entity===globalThis.__entSet)return globalThis.__setRows||[];return[];}export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/estimateMutationGuard': `export async function assertEstimateProductMutationAllowed(){}`,
  '@/components/estimator/builder/sourceProjectPersistence': `export const sourcePatchMatches=(r,p)=>!!r&&!!p&&Object.entries(p).every(([k,v])=>r[k]===v||(v==null&&r[k]==null));export const updateBuilderSourceProject=async a=>{globalThis.__spies.push(['saveSource',a]);globalThis.__project={...globalThis.__project,...a.data,id:a.sourceId,updated_date:globalThis.__savedVersion||'v2'};return globalThis.__project;};`,
  '@/components/staff/staffEntities': `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__getProject?globalThis.__getProject(id):globalThis.__project;},update:async()=>({}),updateMany:async()=>({updated:0})},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async(id)=>{globalThis.__spies.push(['estimateGet',id]);return globalThis.__estimates?.[id]??globalThis.__estimate;}}};`,
  '@/components/estimator/foundation/convertToBrickStone': `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  '@/components/estimator/moduleShared/moduleProjectActions': `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  '@/components/utils': `export const createPageUrl=(n)=>'/'+n;`,
  '@/components/estimator/foundation/FoundationItemCard': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationRatesPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationEquipmentTab': `export default ()=><div/>`,
  '@/components/estimator/foundation/ConcreteDeliveryPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationBOM': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationSectionBanner': `export default ()=><div/>;`,
  '@/components/estimator/foundation/AiEngineeringAssistant': `export default ()=><div/>`,
  '@/components/estimator/foundation/Foundation3DPreview': `export default (p)=>{globalThis.__seenProject=p.project;return <div/>;};`,
  '@/components/estimator/foundation/FoundationTemplateDialog': `export default ()=>null;`,
  '@/components/estimator/foundation/FoundationLayoutCanvas': `export default ()=><div/>`,
  '@/components/estimator/foundation/SignageCabinetsPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/LandscapeDesigner': `export default ()=><div/>`,
  '@/components/estimator/foundation/CustomerPricingPanel': `export default ()=><div data-stub="CustomerPricingPanel"/>`,
  '@/components/estimator/foundation/landscapeMaterials': `export const landscapeSummary=()=>({total:0,items:[]});`,
  '@/components/estimator/foundation/WallShapeEditor': `export default function(){return null;}`,
  './WallShapeEditor': `export default function(){return null;}`,
  '@/lib/loadAllEntityRows': `export async function loadAllEntityRows(a){const rec={label:a.label,entity:a.entity,query:a.query||null,sort:a.sort||null};globalThis.__catalogReads.push(rec);if(globalThis.__deferReads){return new Promise((res,rj)=>{globalThis.__deferReads.push({rec,res,rj});});}if(a.entity===globalThis.__entInv)return globalThis.__invRows||[];if(a.entity===globalThis.__entLab)return globalThis.__labRows||[];if(a.entity===globalThis.__entSet)return globalThis.__setRows||[];return[];}export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/foundation/foundationBuilderRecovery': `export async function loadFoundationBuilderRecovery(){return null;}export function verifyFoundationRecoverySource(){}`,
  '@/components/estimator/foundation/FoundationSyncConflictDialog': `export default ()=>null;export const FoundationSyncRetryAction=()=>null;export const useFoundationBuilderSyncRetry=()=>({retrying:false,retry:async()=>({})});export const useFoundationSyncConflict=()=>({conflict:null,openDraftConflict:()=>{},closeConflict:()=>{}});`,
  '@/components/estimator/foundation/FoundationAiIntake': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationPhotoIntake': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationToolbar': `export default ()=><div/>`,


  '@/components/estimator/foundation/FoundationTotals': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationBulkMaterialPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationDesignBasis': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationFieldPackage': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationGuidedSteps': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationReinforcementProposalPanel': `export default ()=><div/>`,
};
const plug = { name: 's', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx' }));
}};
await esbuild.build({
  entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm',
  external: [], loader: { '.js': 'jsx', '.jsx': 'jsx' },
  outfile: `${OUT}/calc.mjs`, alias: { '@': path.resolve('src') },
});
await esbuild.build({
  entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm',
  external: [], loader: { '.js': 'jsx', '.jsx': 'jsx' },
  outfile: `${OUT}/syncrec.mjs`, alias: { '@': path.resolve('src') },
});
await esbuild.build({
  entryPoints: ['src/pages/FoundationEstimator.jsx'], bundle: true, format: 'esm', platform: 'node', write: true,
  external: ['react', 'react-dom', 'react-dom/*', 'react/*', 'react-test-renderer', 'react-router-dom', 'scheduler', 'scheduler/*', 'lucide-react'],
  plugins: [plug], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  outfile: `${OUT}/page-catalog.mjs`, alias: { '@': path.resolve('src') },
});
const { calcProject } = await import(pathToFileURL(path.resolve(`${OUT}/calc.mjs`)));
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve(`${OUT}/syncrec.mjs`)));
const Page = (await import(pathToFileURL(path.resolve(`${OUT}/page-catalog.mjs`)))).default;
const React = (await import('react')).default;
globalThis.React = React;
const { create, act } = await import('react-test-renderer');
const { useNavigate, useLocation, MemoryRouter } = await import('react-router-dom');

let passed = 0, failed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log('ok', name); }
  catch (e) { failed++; console.log('FAIL', name, '-', String(e?.message || e).slice(0, 500)); }
};

// ---------- settled frozen fixtures ----------
const repro = JSON.parse(fs.readFileSync(`${OUT}/calculator-loss-repro.json`, 'utf8'));
const IN = repro.inputs;
const makeProject = () => ({
  id: 'p1', updated_date: 'v1', project_name: 'P', client_name: 'C', excavation_method: 'hand_dig',
  items: [], poles: [JSON.parse(JSON.stringify(IN.pole))], wall_caps: [JSON.parse(JSON.stringify(IN.cap))],
  walls: [JSON.parse(JSON.stringify(IN.wall))], signage_cabinets: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
const EMPTY_CAT = () => ({ __invRows: [], __labRows: [], __setRows: [] });
const FULL_CAT = () => ({
  __invRows: [
    { id: IN.pole.pole_id, material_type: 'pole', cost_per_unit: 10, pole_pricing_mode: 'per_lf' },
    { id: IN.cap.cap_inventory_id, material_type: 'wall_cap', cap_stock_price: 17, cap_stock_length_inches: 48 },
    { id: IN.wall.materialId, material_type: 'wall_material', wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, cost_per_unit: 2 },
  ],
  __labRows: [],
  __setRows: [{ setting_name: 'wall_labor_rate', setting_value: 25 }],
});
const SETTINGS_25 = { wall_labor_rate: 25 };

// ---------- mount helpers ----------
const locations = [];
const navigates = [];
const LocSpy = () => {
  const loc = useLocation();
  globalThis.window.location.search = loc.search;
  locations.push(loc);
  return null;
};
const NavSpy = () => { navigates.push(useNavigate()); return null; };
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__catalogReads = []; globalThis.__deferReads = null;
  globalThis.__project = opts.project ?? makeProject();
  globalThis.__estimates = opts.estimates;
  globalThis.__estimate = opts.estimate ?? { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' }] };
  Object.assign(globalThis, opts.catalog ?? EMPTY_CAT());
  if (opts.getProject) globalThis.__getProject = opts.getProject; else delete globalThis.__getProject;
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? '/?id=p1&estimateId=e1'] },
      React.createElement(LocSpy), React.createElement(NavSpy), React.createElement(Page, opts.pageProps || {})));
    await flush();
  });
  return c;
};
const hostText = (node) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(hostText).join(' ');
  if (node && node.children) return hostText(node.children);
  return '';
};
const pageText = (c) => hostText(c.toJSON());
const alertText = (c) => {
  const hits = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && n.props?.role === 'alert') hits.push(hostText(n));
    if (n?.children) walk(n.children);
  };
  walk(c.toJSON());
  return hits;
};
const toolbarProp = (c, key) => {
  const els = c.root.findAll(el => typeof el.props?.[key] === 'function');
  return els.length ? els[0].props[key] : null;
};
const btn = (c, label) => {
  const els = c.root.findAll(el => (el.type === 'button' || el.type === 'Button') && hostText(el).includes(label));
  return els.length ? els[0].props : null;
};
const unmountAll = async (c) => { try { await act(async () => c.unmount()); } catch {} };
const spyCount = (k) => globalThis.__spies.filter(x => x[0] === k).length;

// ============================================================
await ok('A: empty catalog -> global alert, saved amounts, no $0 claims', async () => {
  const c = await mount();
  try {
    const al = alertText(c).join(' ');
    assert.ok(al.includes('Pricing unavailable'), 'global alert rendered');
    assert.ok(al.includes('Unavailable items show saved amounts only; other amounts may be recalculated.'), 'snapshot versus current-price disclaimer');
    assert.ok(/Pole 1: selected catalog material is unavailable/.test(al), 'pole issue enumerated');
    const t = pageText(c);
    for (const want of ['$42.00', '$3.00', '$45.00', '$17.00', '$196.00'])
      assert.ok(t.includes(want), `saved amount ${want} rendered`);
    assert.ok(!/Total: \$0\.00/.test(t), 'no $0 total claim');
    assert.ok(t.includes('Saved amounts (not current pricing)'), 'saved-amounts label');
  } finally { await unmountAll(c); }
});

await ok('A2: scoped pole row: unknown->Not saved, explicit 0->$0.00, pricing stub gated', async () => {
  const p = makeProject();
  p.poles = [{ component_id: 'po-x', pole_id: 'unavailable-pole', pole_painting_cost: 3, total_cost: 45 }]; // pole_cost missing
  const c = await mount({ project: p });
  try {
    const t = pageText(c);
    assert.ok(c.root.findAll(el => el.type === 'span' && hostText(el).replace(/\s+/g, ' ').trim() === 'Pole Not saved').length > 0, 'missing pole_cost shows Not saved in its own amount span');
    assert.ok(t.includes('$3.00') && t.includes('$45.00'), 'other saved amounts still real');
    assert.equal(c.root.findAll(el => el.props?.['data-stub'] === 'CustomerPricingPanel').length, 0, 'pricing panel hidden when blocked');
  } finally { await unmountAll(c); }
  const p2 = makeProject();
  p2.poles[0].pole_cost = 0;
  const c2 = await mount({ project: p2 });
  try {
    assert.ok(c2.root.findAll(el => el.type === 'span' && hostText(el).replace(/\s+/g, ' ').trim() === 'Pole $0.00').length > 0, 'explicit zero renders in its own pole amount span');
  } finally { await unmountAll(c2); }
});

await ok('B: Save/SaveExit/Copy/Swap/CtrlS/autosave blocked -> zero I/O, route+receipt intact', async () => {
  const receipt = createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'key-receipt-1', requestedAt: '2024-01-01T00:00:00Z' });
  const proj = makeProject();
  proj.builder_sync_attempt = receipt;
  const c = await mount({ project: proj, pageProps: { onSaved: () => globalThis.__spies.push(['onSaved']), onClose: () => globalThis.__spies.push(['onClose']) } });
  try {
    const seenBefore = JSON.parse(JSON.stringify(globalThis.__seenProject));
    const nameInput = c.root.findAll(el => el.type === 'input' && typeof el.props?.onChange === 'function')[0];
    assert.ok(nameInput, 'editable input present');
    await act(async () => { nameInput.props.onChange({ target: { value: 'Edited' } }); });
    const locBefore = { pathname: locations.at(-1)?.pathname, search: locations.at(-1)?.search };
    const onSave = toolbarProp(c, 'onSave'); assert.ok(onSave, 'onSave captured');
    let r; await act(async () => { r = await onSave(); });
    assert.equal(r.status, 'failed', 'save blocked');
    const onExit = toolbarProp(c, 'onSaveAndExit'); assert.ok(onExit);
    await act(async () => { await onExit(); });
    const onCopy = toolbarProp(c, 'onSaveAsCopy'); assert.ok(onCopy);
    await act(async () => { await onCopy(); });
    const onSwap = toolbarProp(c, 'onSwapToBrickStone'); assert.ok(onSwap);
    await act(async () => { await onSwap(); });
    assert.ok(winHandlers.keydown?.length, 'keydown listener registered');
    const evt = { key: 's', ctrlKey: true, preventDefault() { evt.done = true; } };
    await act(async () => { winHandlers.keydown.forEach(h => h(evt)); });
    assert.ok(evt.done, 'Ctrl+S handled');
    const onToggle = toolbarProp(c, 'onToggleAutoSave'); assert.ok(onToggle);
    await act(async () => { onToggle(); });
    await new Promise(r2 => setTimeout(r2, 2300));
    await act(async () => { await flush(); });
    for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
      assert.equal(spyCount(k), 0, `zero ${k} calls`);
    assert.equal(locations.at(-1)?.pathname, locBefore.pathname, 'pathname unchanged');
    assert.equal(locations.at(-1)?.search, locBefore.search, 'search unchanged');
    // receipt + raw draft untouched by blocked attempts
    const seenEnd = JSON.parse(JSON.stringify(globalThis.__seenProject));
    assert.deepEqual(seenEnd.builder_sync_attempt, receipt, 'receipt preserved');
    for (const f of ['pole_id', 'pole_cost', 'pole_painting_cost', 'total_cost'])
      assert.equal(seenEnd.poles[0][f], seenBefore.poles[0][f], 'pole field ' + f + ' unchanged by blocked attempts');
    assert.equal(seenEnd.updated_date, 'v1', 'CAS version unchanged');
  } finally { await unmountAll(c); }
});

await ok('C: reload -> exact 3 reads, alert clears, draft/receipt intact, save->saved CAS v1 recalculated body', async () => {
  const receipt = createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'key-r2', requestedAt: '2024-02-01T00:00:00Z' });
  const proj = makeProject();
  proj.builder_sync_attempt = receipt;
  const c = await mount({ project: proj });
  try {
    assert.ok(alertText(c).join(' ').includes('Pricing unavailable'));
    const seenBefore = JSON.parse(JSON.stringify(globalThis.__seenProject));
    const readsBefore = globalThis.__catalogReads.length;
    Object.assign(globalThis, FULL_CAT());
    const reloadBtn = btn(c, 'catalogs'); assert.ok(reloadBtn, 'reload button present');
    await act(async () => { await reloadBtn.onClick(); await flush(); });
    const reads = globalThis.__catalogReads.slice(readsBefore);
    assert.equal(reads.length, 3, 'exactly three prereq reads');
    assert.deepEqual(reads.map(r => r.label), ['Foundation inventory', 'Concrete labor/services', 'Estimator Settings']);
    assert.deepEqual(reads[0].query, { show_in_foundation: true });
    assert.equal(reads[2].sort, 'created_date');
    assert.equal(alertText(c).join(' ').includes('Pricing unavailable'), false, 'alert cleared');
    assert.equal(c.root.findAll(el => el.props?.['data-stub'] === 'CustomerPricingPanel').length >= 1, true, 'pricing panel rendered after restore');
    // raw draft + receipt deep-equal (ids, ai brief, landscape, CAS version)
    const seenAfter = JSON.parse(JSON.stringify(globalThis.__seenProject));
    assert.deepEqual(seenAfter.builder_sync_attempt, receipt, 'receipt untouched by reload');
    for (const f of ['poles', 'wall_caps', 'walls', 'signage_cabinets', 'landscape', 'items'])
      assert.deepEqual(seenAfter[f], seenBefore[f], `${f} unchanged`);
    assert.equal(seenAfter.updated_date, 'v1', 'CAS baseline unchanged');
    // explicit save through normal CAS path
    globalThis.__spies = globalThis.__spies.filter(x => !['projectGet', 'estimateGet'].includes(x[0]));
    const onSave = toolbarProp(c, 'onSave'); assert.ok(onSave);
    let r; await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r.status, 'saved', 'save succeeds after restore');
    assert.equal(spyCount('saveSource'), 1, 'exactly one source write');
    assert.equal(spyCount('recordBuilderSave'), 1, 'exactly one builder call');
    const arg = globalThis.__spies.find(x => x[0] === 'saveSource')[1];
    assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS baseline v1');
    const expected = calcProject(globalThis.__seenProject, FULL_CAT().__invRows, SETTINGS_25);
    assert.deepEqual(arg.data.poles.map(p => p.total_cost), expected.poles.map(p => p.total_cost), 'pole costs == real calc output');
    assert.deepEqual(arg.data.walls.map(w => w.calculatedCosts), expected.walls.map(w => w.calculatedCosts), 'wall costs == real calc output (settings mapped)');
    assert.deepEqual(arg.data.wall_caps.map(w => w.cost), expected.wallCaps.map(w => w.cost), 'cap costs == real calc output');
    assert.notDeepEqual(arg.data.poles.map(p => p.total_cost), [45], 'not stale snapshot 45');
    for (const [i, p2] of arg.data.poles.entries()) assert.equal(p2.component_id, IN.pole.component_id, `pole ${i} id preserved`);
    assert.equal(arg.data.walls[0].component_id, 'wall-synthetic', 'wall id preserved');
    assert.equal(arg.data.walls[0].shape?.segments?.[0]?.length, 96, 'authored geometry length preserved');
  } finally { await unmountAll(c); }
});

await ok('D: failed reload keeps draft+alert+busy false; retry succeeds', async () => {
  const c = await mount();
  try {
    assert.ok(alertText(c).join(' ').includes('Pricing unavailable'));
    globalThis.__deferReads = [];
    const reloadBtn = btn(c, 'catalogs'); assert.ok(reloadBtn);
    let flightDone = false;
    let flight;
    await act(async () => { flight = reloadBtn.onClick(); flight.then(() => { flightDone = true; }, () => { flightDone = true; }); });
    assert.equal(btn(c, 'catalogs')?.disabled, true, 'reload disabled while pending');
    assert.equal(globalThis.__deferReads.length, 3, 'three prereq reads in flight');
    // reject Settings, resolve the other two
    globalThis.__deferReads.find(d => d.rec.label === 'Estimator Settings').rj(new Error('net down'));
    globalThis.__deferReads.find(d => d.rec.label === 'Foundation inventory').res([]);
    globalThis.__deferReads.find(d => d.rec.label === 'Concrete labor/services').res([]);
    globalThis.__deferReads = null;
    await act(async () => { await flight; await flush(); });
    assert.equal(btn(c, 'catalogs')?.disabled, false, 'busy reset after failure');
    assert.ok(alertText(c).join(' ').includes('Pricing unavailable'), 'alert remains');
    assert.ok(pageText(c).includes('Catalog reload failed'), 'retry error visible');
    Object.assign(globalThis, FULL_CAT());
    await act(async () => { await btn(c, 'catalogs').onClick(); await flush(); });
    assert.equal(alertText(c).join(' ').includes('Pricing unavailable'), false, 'retry succeeded');
  } finally { await unmountAll(c); }
});

await ok('E: deferred A reload settling while on B installs nothing; A-B-A reopen gets new flight', async () => {
  const projB = { id: 'b', updated_date: 'vB', project_name: 'BB-ROUTE', items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [] };
  const estB = { id: 'e2', line_items: [] };
  const c = await mount({
    getProject: (id) => (id === 'b' ? projB : globalThis.__project),
    estimates: { e2: estB },
  });
  try {
    assert.ok(alertText(c).join(' ').includes('Pricing unavailable'));
    globalThis.__deferReads = [];
    let flightA;
    await act(async () => { flightA = btn(c, 'catalogs').onClick(); });
    assert.equal(globalThis.__deferReads.length, 3, 'A flight issued 3 reads');
    const aReads = globalThis.__deferReads;
    globalThis.__deferReads = null; // B must load normally
    await act(async () => { navigates.at(-1)('/?id=b&estimateId=e2'); await flush(); });
    assert.equal(locations.at(-1)?.search, '?id=b&estimateId=e2');
    assert.equal(globalThis.__seenProject?.project_name, 'BB-ROUTE', 'B actually loaded');
    const seenB = JSON.parse(JSON.stringify(globalThis.__seenProject));
    assert.equal(seenB.id, 'b');
    // resolve all 3 old A reads — old flight must not install into B
    await act(async () => { aReads.forEach((d, i) => d.res([[], [], [{}]][i])); await flightA; await flush(15); });
    assert.equal(globalThis.__seenProject?.project_name, 'BB-ROUTE', 'B still shown after A settles');
    const seenB2 = JSON.parse(JSON.stringify(globalThis.__seenProject));
    assert.equal(seenB2.id, 'b', 'still B');
    assert.equal(pageText(c).includes('Catalog reload failed'), false, 'no stale error written to B');
    // A->B->A: new A context gets its own flight
    await act(async () => { navigates.at(-1)('/?id=p1&estimateId=e1'); await flush(60); });
    assert.equal(globalThis.__seenProject?.id, 'p1', 'A loaded back');
    assert.ok(alertText(c).join(' ').includes('Pricing unavailable'), 'A alert back');
    globalThis.__deferReads = [];
    let flightA2;
    await act(async () => { flightA2 = btn(c, 'catalogs').onClick(); });
    assert.equal(globalThis.__deferReads.length, 3, 'new A flight issued its own 3 reads');
    const a2Reads = globalThis.__deferReads;
    assert.equal(btn(c, 'catalogs')?.disabled, true, 'new flight disables button');
    await act(async () => { const fc = FULL_CAT(); a2Reads.forEach((d, i) => d.res([fc.__invRows, fc.__labRows, fc.__setRows][i])); await flightA2; await flush(15); });
    assert.equal(btn(c, 'catalogs') === null || alertText(c).join(' ').includes('Pricing unavailable') === false, true, 'new flight settles');
  } finally { await unmountAll(c); }
});

await ok('F: overlapping reload — second click zero reads, one flight completes, busy false', async () => {
  const c = await mount();
  try {
    globalThis.__deferReads = [];
    let flight;
    await act(async () => { flight = btn(c, 'catalogs').onClick(); });
    assert.equal(globalThis.__deferReads.length, 3, 'first flight: 3 reads');
    const readsBefore = globalThis.__catalogReads.length;
    const secondReload = btn(c, 'catalogs');
    assert.ok(secondReload && typeof secondReload.onClick === 'function', 'second reload handler exists');
    await act(async () => { secondReload.onClick(); });
    assert.equal(globalThis.__catalogReads.length - readsBefore, 0, 'second click launched zero reads');
    Object.assign(globalThis, FULL_CAT());
    await act(async () => {
      globalThis.__deferReads.forEach((d, i) => d.res([FULL_CAT().__invRows, [], [{}]][i]));
      globalThis.__deferReads = null;
      await flight; await flush(15);
    });
    assert.equal(alertText(c).join(' ').includes('Pricing unavailable'), false, 'alert cleared');
    assert.equal(btn(c, 'catalogs') === null || btn(c, 'catalogs')?.disabled === false, true, 'busy false after flight');
  } finally { await unmountAll(c); }
});

console.log(`PASS catalog-integrity passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
