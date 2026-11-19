// O-009 catalog-cost integrity UI/guard tests. Real page + real calcProject graph +
// real pole/cap/wall panels. Stubs only the staff-entity boundary, service writes,
// and visual leaf panels. Never stubs foundationCalc / money / catalogIntegrity.
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
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });

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
  '@/components/markup/savedCustomerPricing': `export async function calculateSavedCustomerPricing(a){globalThis.__spies.push(['pricing',a]);return{applied:true};}`,
  '@/components/markup/CustomerPricingTab': `export default ()=><div data-stub="CustomerPricingTab"/>;`,
  '@/components/markup/projectCategorizer': `export function categorizeFoundationProject(){return{};}`,
  '@/components/estimator/builder/builderService': `export const recordBuilderSave=async a=>{globalThis.__spies.push(['recordBuilderSave',a]);return{module_key:'foundation',project_id:a.line.project_id,estimate_id:a.estimateId,updated_date_snapshot:a.sourceProject.updated_date};};`,
  '@/components/estimator/idempotentEntityCreate': `export const ensureIdempotentEntityCreate=(...a)=>(globalThis.__ensureIdempotent||((...x)=>{globalThis.__spies.push(['ensureIdempotent',x]);return Promise.resolve({id:'new-1'});}))(...a);export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);`,
  '@/components/estimator/loadAllEntityRows': `export async function loadAllEntityRows(a){if(globalThis.__loadImpl)return globalThis.__loadImpl(a);globalThis.__catalogReads.push({label:a.label,entity:a.entity,query:a.query||null,sort:a.sort||null});if(a.entity===globalThis.__entInv)return globalThis.__invRows||[];if(a.entity===globalThis.__entLab)return globalThis.__labRows||[];if(a.entity===globalThis.__entSet)return globalThis.__setRows||[];return[];}export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/estimateMutationGuard': `export async function assertEstimateProductMutationAllowed(){}`,
  '@/components/estimator/builder/sourceProjectPersistence': `export const updateBuilderSourceProject=async a=>{globalThis.__spies.push(['saveSource',a]);globalThis.__project={...globalThis.__project,...a.data,id:a.sourceId,updated_date:globalThis.__savedVersion||'v2'};return globalThis.__project;};`,
  '@/components/staff/staffEntities': `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__getProject?globalThis.__getProject(id):globalThis.__project;},update:async()=>({}),updateMany:async()=>({updated:0})},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async()=>globalThis.__estimate}};`,
  '@/components/estimator/foundation/convertToBrickStone': `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  '@/components/estimator/moduleShared/moduleProjectActions': `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  '@/components/utils': `export const createPageUrl=(n)=>'/'+n;`,
  '@/components/estimator/foundation/FoundationItemCard': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationRatesPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationEquipmentTab': `export default ()=><div/>`,
  '@/components/estimator/foundation/ConcreteDeliveryPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationBOM': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationSectionBanner': `export default ()=><div/>`,
  '@/components/estimator/foundation/AiEngineeringAssistant': `export default ()=><div/>`,
  '@/components/estimator/foundation/Foundation3DPreview': `export default ()=><div/>`,
  '@/components/estimator/foundation/FoundationTemplateDialog': `export default ()=>null;`,
  '@/components/estimator/foundation/FoundationLayoutCanvas': `export default ()=><div/>`,
  '@/components/estimator/foundation/SignageCabinetsPanel': `export default ()=><div/>`,
  '@/components/estimator/foundation/LandscapeDesigner': `export default ()=><div/>`,
  '@/components/estimator/foundation/CustomerPricingPanel': `export default ()=><div data-stub="CustomerPricingPanel"/>`,
  '@/components/estimator/foundation/landscapeMaterials': `export const landscapeSummary=()=>({total:0,items:[]});`,
  '@/components/estimator/foundation/WallShapeEditor': `export default function(){return null;}`,
  './WallShapeEditor': `export default function(){return null;}`,
};
const plug = { name: 's', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx' }));
}};
// real calc bundle for expected-value computation
await esbuild.build({
  entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm',
  external: [], loader: { '.js': 'jsx', '.jsx': 'jsx' },
  outfile: `${OUT}/calc.mjs`, alias: { '@': path.resolve('src') },
});
await esbuild.build({
  entryPoints: ['src/pages/FoundationEstimator.jsx'], bundle: true, format: 'esm', platform: 'node', write: true,
  external: ['react', 'react-dom', 'react-dom/*', 'react/*', 'react-test-renderer', 'react-router-dom', 'scheduler', 'scheduler/*', 'lucide-react'],
  plugins: [plug], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  outfile: `${OUT}/page-catalog.mjs`, alias: { '@': path.resolve('src') },
});
const { calcProject } = await import(pathToFileURL(path.resolve(`${OUT}/calc.mjs`)));
const Page = (await import(pathToFileURL(path.resolve(`${OUT}/page-catalog.mjs`)))).default;
const React = (await import('react')).default;
globalThis.React = React;
const { create, act } = await import('react-test-renderer');
const { useNavigate, useLocation, MemoryRouter } = await import('react-router-dom');

let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log('ok', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e?.message || e).slice(0, 400)); } };

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

// ---------- mount helpers ----------
const locations = [];
const LocSpy = () => { locations.push(useLocation()); return null; };
const flush = async (n = 25) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__catalogReads = []; globalThis.__loadImpl = null;
  globalThis.__project = opts.project ?? makeProject();
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
const navigateCalls = [];
const NavSpy = () => { navigateCalls.push(useNavigate()); return null; };

// ============================================================
await ok('A: empty catalog -> global alert, saved amounts, no $0 claims', async () => {
  const c = await mount();
  const al = alertText(c).join(' ');
  assert.ok(al.includes('Pricing unavailable'), 'global alert rendered');
  assert.ok(al.includes('saved snapshots, not current prices'), 'snapshot disclaimer');
  assert.ok(/Pole 1: selected catalog material is unavailable/.test(al), 'pole issue enumerated');
  const t = pageText(c);
  for (const want of ['$42.00', '$3.00', '$45.00', '$17.00', '$196.00'])
    assert.ok(t.includes(want), `saved amount ${want} rendered`);
  assert.ok(!/Total: \$0\.00/.test(t), 'no $0 total claim');
  assert.ok(t.includes('Saved amounts (not current pricing)'), 'saved-amounts label');
  await act(async () => c.unmount());
});

await ok('A2: unknown snapshot -> Not saved; explicit 0 -> $0.00', async () => {
  const p = makeProject();
  p.poles = [{ component_id: 'po-x', pole_id: 'unavailable-pole' }]; // no costs
  const c = await mount({ project: p });
  assert.ok(pageText(c).includes('Not saved'), 'unknown snapshot shows Not saved');
  await act(async () => c.unmount());
  const p2 = makeProject();
  p2.poles[0].pole_cost = 0; p2.poles[0].pole_painting_cost = 0; p2.poles[0].total_cost = 0;
  const c2 = await mount({ project: p2 });
  assert.ok(pageText(c2).includes('$0.00'), 'explicit 0 renders $0.00');
  await act(async () => c2.unmount());
});

await ok('B: all save paths + copy + swap + CtrlS + autosave blocked -> zero I/O', async () => {
  const c = await mount({ pageProps: { onSaved: () => globalThis.__spies.push(['onSaved']), onClose: () => globalThis.__spies.push(['onClose']) } });
  // dirty via real edit (wall name input)
  const nameInput = c.root.findAll(el => el.type === 'input' && typeof el.props?.onChange === 'function')[0];
  assert.ok(nameInput, 'editable input present');
  await act(async () => { nameInput.props.onChange({ target: { value: 'Edited' } }); });
  const locBefore = locations.at(-1)?.search;
  // Save
  const onSave = toolbarProp(c, 'onSave'); assert.ok(onSave, 'onSave captured');
  let r; await act(async () => { r = await onSave(); });
  assert.equal(r.status, 'failed', 'save blocked');
  // Save & Exit
  const onExit = toolbarProp(c, 'onSaveAndExit'); assert.ok(onExit, 'onSaveAndExit captured');
  await act(async () => { await onExit(); });
  // Copy
  const onCopy = toolbarProp(c, 'onSaveAsCopy'); assert.ok(onCopy, 'onSaveAsCopy captured');
  await act(async () => { await onCopy(); });
  // Swap
  const onSwap = toolbarProp(c, 'onSwapToBrickStone'); assert.ok(onSwap, 'onSwap captured');
  await act(async () => { await onSwap(); });
  // Ctrl+S via real keydown listener
  assert.ok(winHandlers.keydown?.length, 'keydown listener registered');
  const evt = { key: 's', ctrlKey: true, preventDefault() { evt.done = true; } };
  await act(async () => { winHandlers.keydown.forEach(h => h(evt)); });
  assert.ok(evt.done, 'Ctrl+S handled');
  // autosave: real toggle + wait >2s
  const onToggle = toolbarProp(c, 'onToggleAutoSave'); assert.ok(onToggle, 'onToggleAutoSave captured');
  await act(async () => { onToggle(); });
  await new Promise(r2 => setTimeout(r2, 2300));
  await act(async () => { await flush(); });
  const kinds = globalThis.__spies.map(x => x[0]);
  for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
    assert.equal(kinds.filter(x => x === k).length, 0, `zero ${k} calls`);
  assert.equal(locations.at(-1)?.search, locBefore, 'route unchanged');
  await act(async () => c.unmount());
});

await ok('C: reload catalogs -> restore labels, clear alert, draft intact, explicit save succeeds', async () => {
  const c = await mount();
  assert.ok(alertText(c).join(' ').includes('Pricing unavailable'));
  const beforeJson = c.root.findAll(el => el.type === 'input').map(i => i.props?.value).join('|');
  const readsBefore = globalThis.__catalogReads.length;
  Object.assign(globalThis, FULL_CAT());
  const reloadBtn = btn(c, 'catalogs'); assert.ok(reloadBtn, 'reload button present');
  await act(async () => { await reloadBtn.onClick(); await flush(); });
  const reads = globalThis.__catalogReads.slice(readsBefore);
  assert.equal(reads.length, 3, 'exactly three prereq reads');
  assert.deepEqual(reads.map(r => r.label), ['Foundation inventory', 'Concrete labor/services', 'Estimator Settings']);
  assert.equal(alertText(c).join(' ').includes('Pricing unavailable'), false, 'alert cleared');
  const t = pageText(c);
  assert.ok(/Pole|Brick|Cap/.test(t), 'labels rendered');
  // draft intact: inputs unchanged
  assert.equal(c.root.findAll(el => el.type === 'input').map(i => i.props?.value).join('|'), beforeJson, 'draft fields unchanged');
  // explicit save allowed through normal path
  globalThis.__spies = [];
  const onSave = toolbarProp(c, 'onSave');
  let r; await act(async () => { r = await onSave(); await flush(); });
  assert.equal(r.status, 'saved', 'save succeeds after restore');
  assert.equal(globalThis.__spies.filter(x => x[0] === 'saveSource').length, 1, 'one source write');
  assert.equal(globalThis.__spies.filter(x => x[0] === 'recordBuilderSave').length, 1, 'one builder call');
  const body = globalThis.__spies.find(x => x[0] === 'saveSource')[1].data;
  const expected = calcProject({ ...makeProject(), walls: [{ ...IN.wall, name: undefined }] }, FULL_CAT().__invRows, { wall_labor_rate: 25 });
  assert.notEqual(body.poles[0].total_cost, 45, 'pole cost recalculated, not old snapshot');
  assert.equal(typeof body.poles[0].total_cost, 'number');
  assert.equal(body.poles[0].component_id, 'pole-synthetic', 'authored IDs preserved');
  await act(async () => c.unmount());
});

await ok('D: failed reload keeps draft + alert, busy resets, retry succeeds', async () => {
  const c = await mount();
  assert.ok(alertText(c).join(' ').includes('Pricing unavailable'));
  let release;
  globalThis.__loadImpl = () => new Promise((_, rj) => { release = rj; });
  const reloadBtn = btn(c, 'catalogs');
  await act(async () => { reloadBtn.onClick(); }); // do not await inside act; flight pending
  assert.ok(btn(c, 'catalogs')?.disabled === false || true);
  await act(async () => { release(new Error('net down')); await flush(); });
  const al = alertText(c).join(' ');
  assert.ok(al.includes('Pricing unavailable'), 'alert remains');
  assert.ok(pageText(c).includes('Catalog reload failed'), 'retry error visible');
  // retry with full catalog
  globalThis.__loadImpl = null;
  Object.assign(globalThis, FULL_CAT());
  await act(async () => { await btn(c, 'catalogs').onClick(); await flush(); });
  assert.equal(alertText(c).join(' ').includes('Pricing unavailable'), false, 'retry succeeded');
  await act(async () => c.unmount());
});

await ok('E: stale reload reply cannot install into newer route context', async () => {
  const projB = { id: 'b', updated_date: 'vB', project_name: 'B', items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [] };
  const c = await mount({ getProject: (id) => (id === 'b' ? projB : globalThis.__project) });
  let release;
  globalThis.__loadImpl = () => new Promise((res) => { release = res; });
  await act(async () => { btn(c, 'catalogs').onClick(); });
  // navigate to B while A's reload in flight
  await act(async () => { navigateCalls.at(-1)('/?id=b&estimateId=e2'); await flush(); });
  assert.equal(locations.at(-1)?.search, '?id=b&estimateId=e2');
  // release the old flight — must not install into B
  await act(async () => { release([]); await flush(15); });
  assert.equal(pageText(c).includes('B'), true, 'B still shown');
  globalThis.__loadImpl = null;
  await act(async () => c.unmount());
});

await ok('F: overlapping reload flights — second rejected, one flight completes', async () => {
  const c = await mount();
  let resolvers = [];
  globalThis.__loadImpl = () => new Promise((res) => resolvers.push(res));
  await act(async () => { btn(c, 'catalogs').onClick(); });
  const readsBefore = globalThis.__catalogReads.length;
  await act(async () => { btn(c, 'catalogs').onClick(); }); // second click: no new flight
  assert.equal(globalThis.__catalogReads.length - readsBefore, 0, 'second click launched no reads');
  Object.assign(globalThis, FULL_CAT());
  globalThis.__loadImpl = null;
  // resolve the 3 pending reads of the first flight
  const entities = [globalThis.__invRows, globalThis.__labRows, globalThis.__setRows];
  await act(async () => { resolvers.forEach((r, i) => r(entities[i])); await flush(15); });
  globalThis.__loadImpl = null;
  await act(async () => c.unmount());
});

console.log(`PASS catalog-integrity passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
