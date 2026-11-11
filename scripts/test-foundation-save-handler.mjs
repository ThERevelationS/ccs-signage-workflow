import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };
const baselineMode = process.argv.includes('--baseline');
const deferred = () => { let r; const p = new Promise(res => { r = res; }); return { p, resolve: r }; };

const DUMMY = n => `export default function ${n}(p){ if (globalThis.__cap) globalThis.__cap[${JSON.stringify(n)}]=p; return null; }`;
const KIDS = n => `export const ${n}=(p)=>p?.children??null;`;
const STUBS = {
  'react-router-dom': `export const Link=()=>null;export const useNavigate=()=>(...a)=>{globalThis.__nav.push(a[0]);};`,
  'lucide-react': ['Plus','Anchor','Wrench','LayoutGrid','Layers','ClipboardList','TrendingUp','Trees','Tag','ArrowLeft','HelpCircle','Eye','EyeOff','Settings','Copy','Download','Share2','Printer','Sparkles','FileText','X','Save','Undo2','Redo2','ExternalLink','AlertTriangle','CheckCircle2','Circle','Cpu','GitCompareArrows','Loader2','RefreshCw'].map(n=>`export const ${n}=()=>null;`).join(''),
  '@/components/auth/EmailGate': "export const useAuth=()=>({currentUser:{id:'synthetic-staff'}});",
  '@/components/ui/input': `export const Input=(p)=>{(globalThis.__inputs=globalThis.__inputs||[]).push(p);return null;}`,
  '@/components/ui/tabs': `${KIDS('Tabs')}${KIDS('TabsContent')}${KIDS('TabsList')}${KIDS('TabsTrigger')}`,
  '@/components/markup/projectCategorizer': `export function categorizeFoundationProject(){return {};}`,
  '@/components/markup/savedCustomerPricing': `export async function calculateSavedCustomerPricing(){globalThis.__calls.push(['pricing']);if(globalThis.__deferPricing)await globalThis.__deferPricing.p;return globalThis.__pricing||{applied:true};}`,
  '@/components/markup/CustomerPricingTab': DUMMY('CustomerPricingTab'),
  '@/components/estimator/foundation/landscapeMaterials': `export const landscapeSummary=()=>({total:0});`,
  '@/components/estimator/foundation/foundationCalc': `export const calcProject=(p)=>globalThis.__calcFromArg?{items:p.items||[],itemPricing:(p.items||[]).map(()=>({available:true,issues:[]})),equipment:p.selected_equipment||[],walls:p.walls||[],poles:p.poles||[],wallCaps:p.wall_caps||[],totals:{grand_total:1},delivery:{trucksList:[],concreteTotal:0,roundedYards:0,ratePerYard:0,additionalStopsCost:0}}:globalThis.__calc;export const money=v=>v;export {captureConcreteDeliverySnapshot} from ${JSON.stringify(path.resolve('src/components/estimator/foundation/foundationCalc.js').replace(/\\/g, '/'))};`,
  '@/components/estimator/foundation/legacyFoundationCalc': `export const normalizeConcreteSupplier=x=>x;`,
  '@/components/estimator/builder/builderService': `const FIELDS=["total_concrete_cost","total_rebar_cost","total_excavation_cost","total_forming_materials_cost","total_labor_cost","total_wall_cost","total_pole_cost","total_pole_painting_cost","total_equipment_cost","total_wall_cap_cost","total_signage_cabinet_cost","total_landscape_cost"];export const FOUNDATION_RECORD_TOTAL_FIELDS=FIELDS;export const foundationRecordSavedTotal=r=>{if(!r||!FIELDS.some(k=>Number.isFinite(Number(r[k]))))return null;return FIELDS.reduce((s,k)=>s+(Number.isFinite(Number(r[k]))?Number(r[k]):0),0);};export const recordBuilderSave=async(...a)=>{globalThis.__calls.push(['recordBuilderSave',a]);if(globalThis.__deferBuilder)await globalThis.__deferBuilder.p;if(globalThis.__builderFail)throw globalThis.__builderFail;if(globalThis.__builderLine)return globalThis.__builderLine;const lines=globalThis.__estimateLines||[];const fl=lines.find(l=>l.module_key==='foundation');if(fl)fl.synced=(fl.synced||0)+1;return{module_key:'foundation',project_id:a[0].line.project_id,estimate_id:a[0].estimateId,updated_date_snapshot:a[0].sourceProject.updated_date};}`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>[];`,
  '@/lib/loadAllEntityRows': `export const loadAllEntityRows=async()=>[];export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/foundation/foundationBuilderRecovery': `export async function loadFoundationBuilderRecovery(){return null;}export function verifyFoundationRecoverySource(){}`,
  '@/components/estimator/foundation/FoundationSyncConflictDialog': `export default ()=>null;export const FoundationSyncRetryAction=()=>null;export const useFoundationBuilderSyncRetry=()=>({retrying:false,retry:async()=>({})});export const useFoundationSyncConflict=()=>({conflict:null,openDraftConflict:()=>{},closeConflict:()=>{}});`,
  '@/components/estimator/builder/sourceProjectPersistence': `export const sourcePatchMatches=(r,p)=>!!r&&!!p&&Object.entries(p).every(([k,v])=>r[k]===v||(v==null&&r[k]==null));export const updateBuilderSourceProject=async a=>{globalThis.__calls.push(['saveSource',a]);if(globalThis.__deferSave)await globalThis.__deferSave.p;if(globalThis.__saveFail)throw globalThis.__saveFail;globalThis.__project={...globalThis.__project,...a.data,id:a.sourceId,updated_date:globalThis.__savedVersion||'v2'};return globalThis.__project;};`,
  '@/components/estimator/idempotentEntityCreate': `export const ensureIdempotentEntityCreate=(...a)=>(globalThis.__ensureIdempotent||(async()=>({id:'c1'})))(...a);let __nk=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__nk);`,
  '@/components/estimator/foundation/convertToBrickStone': `export const convertFoundationToBrickStone=async()=>({id:'d1'});`,
  '@/components/estimator/moduleShared/moduleProjectActions': `export const createEstimateReadOnlyShareLink=async()=>({url:'u'});`,
  '@/components/staff/staffEntities': `export const staffEntities={FoundationProject:{get:async(id)=>globalThis.__getProject?globalThis.__getProject(id):globalThis.__project,update:async()=>({})},FoundationInventory:{},LaborServiceInventory:{},Settings:{},AllInOneEstimate:{get:async()=>globalThis.__estimate}};`,
};
const compPaths = ['FoundationItemCard','FoundationRatesPanel','FoundationEquipmentTab','FoundationTotals','ConcreteDeliveryPanel','FoundationBOM','FoundationWallsPanel','FoundationWallCapsPanel','FoundationPolesPanel','FoundationToolbar','FoundationSectionBanner','AiEngineeringAssistant','Foundation3DPreview','FoundationTemplateDialog','FoundationLayoutCanvas','SignageCabinetsPanel','LandscapeDesigner','CustomerPricingPanel','FoundationAiIntake','FoundationPhotoIntake','FoundationBulkMaterialPanel','FoundationDesignBasis','FoundationFieldPackage','FoundationGuidedSteps','FoundationReinforcementProposalPanel'];
for (const n of compPaths) STUBS['@/components/estimator/foundation/' + n] = DUMMY(n);
const plugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: a.path, namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js', resolveDir: path.resolve('.') }));
  },
};
const bundles = {};
const toBuild = baselineMode ? { baseline: '.audit-work/foundation-save01/before/FoundationEstimator.remote.jsx' } : { patched: 'src/pages/FoundationEstimator.jsx' };
for (const [key, entry] of Object.entries(toBuild)) {
  const out = await esbuild.build({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-test-renderer'] });
  const tmp = path.join('.audit-work', 'foundation-save01', `fe-${key}.bundle.mjs`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  bundles[key] = (await import(pathToFileURL(tmp).href)).default;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { location: { search: '?id=p1&estimateId=e1' }, confirm: () => true, addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, querySelectorAll: () => [], createElement: () => ({ style: {} }) };
globalThis.alert = m => globalThis.__alerts.push(m);

const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const waitCall = async (m, name, n = 1) => {
  for (let i = 0; i < 20; i++) {
    if (m.calls().filter(c => c[0] === name).length >= n) return;
    await act(async () => { await Promise.resolve(); });
  }
  throw new Error('stage not reached: ' + name);
};
const mount = async (Page, { embedded = false, project, estimate, search = '?id=p1&estimateId=e1', onSaved } = {}) => {
  globalThis.__nav = []; globalThis.__alerts = []; globalThis.__calls = []; globalThis.__cap = {}; globalThis.__inputs = [];
  globalThis.__saveFail = null; globalThis.__builderFail = null;
  globalThis.__deferSave = null; globalThis.__deferBuilder = null; globalThis.__deferPricing = null;
  globalThis.__project = project === undefined ? { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } } : project;
  globalThis.__calc = { items: [], itemPricing: [], equipment: [], walls: [], poles: [], wallCaps: [], totals: { grand_total: 1 }, delivery: { trucksList: [], concreteTotal: 0, roundedYards: 0, ratePerYard: 0, additionalStopsCost: 0 } };
  globalThis.__savedVersion = 'v2';
  globalThis.__estimate = estimate === undefined ? { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' }] } : estimate;
  globalThis.__builderLine = null;
  globalThis.__getProject = null;
  window.location.search = search;
  const closed = [], savedCalls = [];
  const props = { ...(embedded ? { embedded: true, embeddedProjectId: search.match(/id=([^&]*)/)?.[1], embeddedEstimateId: 'e1', onClose: () => closed.push(1) } : {}), ...(onSaved ? { onSaved } : {}) };
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(Page, props)); });
  await flush();
  const tb = () => globalThis.__cap.FoundationToolbar;
  const edit = async () => { const inp = globalThis.__inputs.find(i => i.value === 'Fix'); assert.ok(inp, 'name input'); await act(async () => { inp.onChange({ target: { value: 'Edited' } }); }); };
  const reroute = async (s, proj) => { window.location.search = s; if (proj) globalThis.__project = proj; globalThis.__cap = {}; await act(async () => { c.update(React.createElement(Page, props)); }); await flush(); };
  const cleanup = async () => { await act(async () => { c.unmount(); }); };
  return { tb, edit, reroute, cleanup, closed, savedCalls, nav: () => globalThis.__nav, calls: () => globalThis.__calls, alerts: () => c.root.findAll(el => el?.props?.role === 'alert').length, root: () => c.root };
};

if (baselineMode) {
  await ok('baseline bug reproduction: failed save navigates (documented defect)', async () => {
    const m = await mount(bundles.baseline);
    try { globalThis.__saveFail = new Error('save rejected'); await act(async () => { await m.tb().onSaveAndExit(); }); assert.equal(m.nav().length, 0, 'defect: baseline navigated on failure'); }
    finally { await m.cleanup(); }
  });
  console.log(`BASELINE save-handler passed=${passed} failed=${failed}`);
  process.exit(failed ? 1 : 0);
}

const P = bundles.patched;
const c_findStatus = m => m.root().findAll(el => el?.props?.role === 'status' || el?.props?.role === 'alert').length;

await ok('failed save: no navigate, alert shown, dirty true', async () => {
  const m = await mount(P);
  try {
    globalThis.__saveFail = new Error('save rejected');
    const o = await act(async () => m.tb().onSaveAndExit());
    assert.equal(o.status, 'failed');
    assert.equal(m.nav().length, 0);
    assert.ok(m.alerts() >= 1);
    assert.equal(m.tb().dirty, true);
  } finally { await m.cleanup(); }
});
await ok('success: navigates standalone once, builder synced', async () => {
  const m = await mount(P);
  try {
    const o = await act(async () => m.tb().onSaveAndExit());
    assert.equal(o.status, 'saved');
    assert.equal(m.nav().length, 1);
    assert.equal(m.calls().filter(c => c[0] === 'recordBuilderSave').length, 1);
  } finally { await m.cleanup(); }
});
await ok('embedded success: onClose once, no navigate', async () => {
  const m = await mount(P, { embedded: true });
  try {
    await act(async () => m.tb().onSaveAndExit());
    assert.equal(m.closed.length, 1);
    assert.equal(m.nav().length, 0);
  } finally { await m.cleanup(); }
});
await ok('edit during pricing await: no source write', async () => {
  const m = await mount(P, { project: { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: true, tier_number: 1 } } });
  try {
    globalThis.__deferPricing = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSave(); });
    await waitCall(m, 'pricing');
    await m.edit();
    globalThis.__deferPricing.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
    assert.equal(m.tb().dirty, true);
  } finally { await m.cleanup(); }
});
await ok('edit during source await: write committed, superseded, dirty', async () => {
  const m = await mount(P);
  try {
    globalThis.__deferSave = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSaveAndExit(); });
    await waitCall(m, 'saveSource');
    await m.edit();
    globalThis.__deferSave.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 1);
    assert.equal(m.nav().length, 0);
    assert.equal(m.tb().dirty, true);
  } finally { await m.cleanup(); }
});
await ok('edit during builder await: superseded, dirty, source saved', async () => {
  const m = await mount(P);
  try {
    globalThis.__deferBuilder = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSaveAndExit(); });
    await waitCall(m, 'recordBuilderSave');
    await m.edit();
    globalThis.__deferBuilder.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(o.sourceSaved, true);
    assert.equal(m.nav().length, 0);
    assert.equal(m.tb().dirty, true);
  } finally { await m.cleanup(); }
});
await ok('partial: dirty true + alert + retry uses v2 CAS', async () => {
  const m = await mount(P);
  try {
    globalThis.__builderFail = new Error('builder down');
    const o = await act(async () => m.tb().onSave());
    assert.equal(o.status, 'partial');
    assert.equal(m.tb().dirty, true);
    assert.ok(m.alerts() >= 1);
    globalThis.__builderFail = null;
    const o2 = await act(async () => m.tb().onSave());
    assert.equal(o2.status, 'saved');
    const second = m.calls().filter(c => c[0] === 'saveSource')[1];
    assert.equal(second[1].expectedUpdatedAt, 'v2');
  } finally { await m.cleanup(); }
});
await ok('undo after v2 save uses ack v2 not history v1', async () => {
  const m = await mount(P);
  try {
    await m.edit();
    await act(async () => { await m.tb().onSave(); });
    await act(async () => { m.tb().onUndo(); });
    const o = await act(async () => m.tb().onSave());
    const last = m.calls().filter(c => c[0] === 'saveSource').pop();
    assert.equal(last[1].expectedUpdatedAt, 'v2');
  } finally { await m.cleanup(); }
});
await ok('route A->B->A stale completion: no bleed, fresh baseline CAS', async () => {
  const m = await mount(P);
  try {
    globalThis.__deferSave = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSave(); });
    await waitCall(m, 'saveSource');
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    await m.reroute('?id=p1&estimateId=e1', { id: 'p1', updated_date: 'v3', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    globalThis.__deferSave.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(m.nav().length, 0);
    // settled design: delayed source write on loaded newer gen requires reload first
    const reloadBtn = m.root().findAll(el => el?.props?.children === 'Reload saved project').map(el => el.props)[0];
    assert.ok(reloadBtn, 'refresh-required marker');
    const blocked = await act(async () => m.tb().onSave());
    assert.equal(blocked?.status ?? blocked, 'conflict', 'save blocked until reload');
    globalThis.__project = { id: 'p1', updated_date: 'v3', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } }; // live source row at reload time
    await act(async () => { reloadBtn.onClick(); await Promise.resolve(); });
    for (let i = 0; i < 30 && m.root().findAll(el => el?.props?.children === 'Reload saved project').length; i++) await act(async () => { await Promise.resolve(); });
    const o2 = await act(async () => m.tb().onSave());
    const last = m.calls().filter(c => c[0] === 'saveSource').pop();
    assert.equal(last[1].expectedUpdatedAt, 'v3');
  } finally { await m.cleanup(); }
});
await ok('old saveRef during new route load cannot write A', async () => {
  const m = await mount(P);
  try {
    const oldTb = m.tb();
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    const before = m.calls().filter(c => c[0] === 'saveSource').length;
    const o = await act(async () => oldTb.onSave());
    assert.equal(o.status, 'superseded');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, before);
  } finally { await m.cleanup(); }
});
await ok('same id different estimate context isolated', async () => {
  const m = await mount(P);
  try {
    const oldTb = m.tb();
    await m.reroute('?id=p1&estimateId=e2', { id: 'p1', updated_date: 'v3', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    const o = await act(async () => oldTb.onSave());
    assert.equal(o.status, 'superseded');
  } finally { await m.cleanup(); }
});
await ok('onSaved throws: still saved, warning captured, exit ok', async () => {
  const m = await mount(P, { onSaved: () => { throw new Error('observer broke'); } });
  try {
    const o = await act(async () => m.tb().onSaveAndExit());
    assert.equal(o.status, 'saved');
    assert.ok(o.warnings.includes('observer_error'));
    assert.equal(m.nav().length, 1);
  } finally { await m.cleanup(); }
});
await ok('duplicate onSave: same promise, one write, one observer', async () => {
  const savedCalls = [];
  const m = await mount(P, { onSaved: () => savedCalls.push(1) });
  try {
    let r1, r2;
    await act(async () => { r1 = m.tb().onSave(); r2 = m.tb().onSave(); });
    assert.equal(r1, r2);
    const [o1] = await Promise.all([r1, r2]);
    assert.equal(o1.status, 'saved');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 1);
    assert.equal(m.calls().filter(c => c[0] === 'recordBuilderSave').length, 1);
    assert.equal(savedCalls.length, 1);
  } finally { await m.cleanup(); }
});
await ok('duplicate SaveExit: at most one exit', async () => {
  const m = await mount(P);
  try {
    let o1, o2;
    await act(async () => { [o1, o2] = await Promise.all([m.tb().onSaveAndExit(), m.tb().onSaveAndExit()]); });
    assert.equal(m.nav().length, 1);
  } finally { await m.cleanup(); }
});
await ok('embedded failure: stays open, no close, alert', async () => {
  const m = await mount(P, { embedded: true });
  try {
    globalThis.__saveFail = new Error('save rejected');
    await act(async () => { await m.tb().onSaveAndExit(); });
    assert.equal(m.closed.length, 0);
    assert.ok(m.alerts() >= 1);
  } finally { await m.cleanup(); }
});
await ok('missing loaded project fails closed', async () => {
  const m = await mount(P, { project: null });
  try {
    assert.equal(m.tb(), undefined);
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
  } finally { await m.cleanup(); }
});
await ok('builder payload keeps module boundaries (witness)', async () => {
  const m = await mount(P);
  try {
    globalThis.__estimateLines = [
      { module_key: 'brick_stone', payload: { a: 1, nested: { deep: true } } },
      { module_key: 'custom_items', payload: { b: [1, 2] } },
      { module_key: 'foundation', payload: {} },
    ];
    const witnessBefore = JSON.stringify(globalThis.__estimateLines.filter(l => l.module_key !== 'foundation'));
    await act(async () => { await m.tb().onSave(); });
    const call = m.calls().find(c => c[0] === 'recordBuilderSave');
    assert.equal(call[1][0].line.module_key, 'foundation');
    assert.equal(JSON.stringify(globalThis.__estimateLines.filter(l => l.module_key !== 'foundation')), witnessBefore);
    assert.equal(globalThis.__estimateLines.find(l => l.module_key === 'foundation').synced, 1);
  } finally { await m.cleanup(); }
});
await ok('stale handler: no effects, no stuck saving', async () => {
  const m = await mount(P);
  try {
    const oldTb = m.tb();
    await m.edit();
    const o = await act(async () => oldTb.onSave());
    assert.equal(o.status, 'superseded');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
    assert.equal(m.tb().saving, false);
    assert.equal(m.tb().dirty, true);
  } finally { await m.cleanup(); }
});
await ok('in-flight A save settles while on B: saving clears', async () => {
  const m = await mount(P);
  try {
    globalThis.__deferSave = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSave(); });
    await waitCall(m, 'saveSource');
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    assert.equal(m.tb().saving, true);
    globalThis.__deferSave.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(m.tb().saving, false);
    assert.equal(m.nav().length, 0);
  } finally { await m.cleanup(); }
});
await ok('mixed intent same tick: one write, one observer, one exit', async () => {
  const savedCalls = [];
  const m = await mount(P, { onSaved: () => savedCalls.push(1) });
  try {
    let o1, o2;
    await act(async () => { [o1, o2] = await Promise.all([m.tb().onSave(), m.tb().onSaveAndExit()]); });
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 1);
    assert.equal(m.calls().filter(c => c[0] === 'recordBuilderSave').length, 1);
    assert.equal(savedCalls.length, 1);
    assert.equal(m.nav().length, 1);
  } finally { await m.cleanup(); }
});
await ok('unmount pending source: no observer/nav/application', async () => {
  const savedCalls = [];
  const m = await mount(P, { onSaved: () => savedCalls.push(1) });
  try {
    globalThis.__deferSave = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSaveAndExit(); });
    await waitCall(m, 'saveSource');
    await m.cleanup();
    globalThis.__deferSave.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(savedCalls.length, 0);
    assert.equal(m.nav().length, 0);
  } catch (error) { await m.cleanup(); throw error; }
});
await ok('unmount pending builder: no observer/nav/application', async () => {
  const savedCalls = [];
  const m = await mount(P, { onSaved: () => savedCalls.push(1) });
  try {
    globalThis.__deferBuilder = deferred();
    let saveP;
    await act(async () => { saveP = m.tb().onSaveAndExit(); });
    await waitCall(m, 'recordBuilderSave');
    await m.cleanup();
    globalThis.__deferBuilder.resolve();
    const o = await act(async () => saveP);
    assert.equal(o.status, 'superseded');
    assert.equal(savedCalls.length, 0);
    assert.equal(m.nav().length, 0);
  } catch (error) { await m.cleanup(); throw error; }
});
await ok('save includes durable builder_sync_attempt receipt', async () => {
  const m = await mount(P);
  try {
    await act(async () => { await m.tb().onSave(); });
    const save = m.calls().find(c => c[0] === 'saveSource');
    const att = save[1].data.builder_sync_attempt;
    assert.equal(att.schema_version, 1);
    assert.equal(att.source_project_id, 'p1');
    assert.equal(att.estimate_id, 'e1');
    assert.ok(att.key && att.requested_at);
  } finally { await m.cleanup(); }
});
await ok('partial save: receipt durable + recovery banner + autosave paused', async () => {
  const m = await mount(P);
  try {
    globalThis.__builderFail = new Error('builder down');
    const o = await act(async () => m.tb().onSave());
    assert.equal(o.status, 'partial');
    const status = m.tb();
    assert.equal(status.dirty, true);
    const banner = c_findStatus(m);
    assert.ok(banner >= 1, 'expected role=status recovery banner');
  } finally { await m.cleanup(); }
});
await ok('retry after partial: ACK line -> dirty cleared', async () => {
  const m = await mount(P);
  try {
    globalThis.__builderFail = new Error('builder down');
    await act(async () => { await m.tb().onSave(); });
    globalThis.__builderFail = null;
    const o2 = await act(async () => m.tb().onSave());
    assert.equal(o2.status, 'saved');
    assert.equal(m.tb().dirty, false);
  } finally { await m.cleanup(); }
});
await ok('stale recovered line (old snapshot) -> partial not exit', async () => {
  const m = await mount(P);
  try {
    globalThis.__builderLine = { module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' };
    const o = await act(async () => m.tb().onSaveAndExit());
    assert.equal(o.status, 'partial');
    assert.equal(m.nav().length, 0);
    assert.equal(m.tb().dirty, true);
  } finally { await m.cleanup(); }
});
await ok('foreign/malformed receipt blocks source write', async () => {
  const m = await mount(P, { project: { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false }, builder_sync_attempt: { schema_version: 99, rogue: true } } });
  try {
    const o = await act(async () => m.tb().onSave());
    assert.equal(o.status, 'failed');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
  } finally { await m.cleanup(); }
});
await ok('missing linked estimate fails closed', async () => {
  const m = await mount(P, { project: { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } } });
  try {
    globalThis.__estimate = null;
    await m.reroute('?id=p9&estimateId=e9', { id: 'p9', updated_date: 'v1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const errText = m.root().findAll(el => typeof el.children?.[0] === 'string' && el.children[0].includes('unavailable')).length;
    assert.ok(errText >= 1, 'loadError banner expected');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
  } finally { await m.cleanup(); }
});
await ok('no estimate context: no receipt written', async () => {
  const m = await mount(P, { search: '?id=p1' });
  try {
    await act(async () => { await m.tb().onSave(); });
    const save = m.calls().find(c => c[0] === 'saveSource');
    assert.equal(save[1].data.builder_sync_attempt, undefined);
  } finally { await m.cleanup(); }
});
await ok('reopen persisted receipt: pending banner + dirty + paused autosave', async () => {
  const att = { schema_version: 1, key: 'k1', source_project_id: 'p1', estimate_id: 'e1', requested_at: '2026-11-05T00:00:00Z' };
  const m = await mount(P, { project: { id: 'p1', updated_date: 'v2', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false }, builder_sync_attempt: att } });
  try {
    assert.equal(m.tb().dirty, true, 'reopen pending must mark dirty');
    const banner = c_findStatus(m);
    assert.ok(banner >= 1, 'expected recovery banner on reopen');
    globalThis.__builderFail = null;
    const o = await act(async () => m.tb().onSave());
    assert.equal(o.status, 'saved');
    assert.equal(m.tb().dirty, false);
  } finally { await m.cleanup(); }
});
await ok('beforeunload registered when dirty (not saving)', async () => {
  let listener = null;
  const origAdd = window.addEventListener;
  window.addEventListener = (t, fn) => { if (t === 'beforeunload') listener = fn; };
  const m = await mount(P);
  try {
    await m.edit();
    await act(async () => { await Promise.resolve(); });
    assert.equal(typeof listener, 'function', 'beforeunload listener expected');
    const ev = { preventDefault() { this.pd = true; } };
    listener(ev);
    assert.equal(ev.pd, true);
  } finally { window.addEventListener = origAdd; await m.cleanup(); }
});
await ok('standalone with foreign receipt blocks save', async () => {
  const att = { schema_version: 1, key: 'k1', source_project_id: 'p1', estimate_id: 'e9', requested_at: '2026-11-05T00:00:00Z' };
  const m = await mount(P, { search: '?id=p1', project: { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false }, builder_sync_attempt: att } });
  try {
    const o = await act(async () => m.tb().onSave());
    assert.equal(o.status, 'failed');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
  } finally { await m.cleanup(); }
});
await ok('back guard: confirm cancel keeps editor', async () => {
  const m = await mount(P, { embedded: true });
  try {
    await m.edit();
    const origConfirm = window.confirm;
    window.confirm = () => false;
    const back = m.tb().onBack;
    back();
    assert.equal(m.closed.length, 0);
    window.confirm = origConfirm;
  } finally { await m.cleanup(); }
});
await ok('back guard: confirm proceeds when clean', async () => {
  const m = await mount(P, { embedded: true });
  try {
    window.confirm = () => true;
    m.tb().onBack();
    assert.equal(m.closed.length, 1);
  } finally { await m.cleanup(); }
});
await ok('two explicit saves recover stale line then apply new revision', async () => {
  const m = await mount(P);
  try {
    globalThis.__builderLine = { module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' };
    const o1 = await act(async () => m.tb().onSave());
    assert.equal(o1.status, 'partial');
    globalThis.__builderLine = null;
    const o2 = await act(async () => m.tb().onSave());
    assert.equal(o2.status, 'saved');
    assert.equal(m.calls().filter(c => c[0] === 'recordBuilderSave').length, 2);
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 2);
  } finally { await m.cleanup(); }
});
const amber = m => m.root().findAll(el => el?.props?.role === 'status').length;
const retryBtn = m => m.root().findAll(el => el?.props?.children === 'Review and retry Save');
await ok('STRICT reopen: persisted CAS receipt -> pending banner -> retry ACK -> zero banner, one write', async () => {
  const m1 = await mount(P);
  let savedProj;
  try {
    globalThis.__deferSave = deferred();
    let saveP; await act(async () => { saveP = m1.tb().onSave(); });
    await waitCall(m1, 'saveSource');
    const casArgs = m1.calls().find(c => c[0] === 'saveSource')[1];
    assert.equal(casArgs.data.builder_sync_attempt?.schema_version, 1, 'receipt in CAS before await');
    globalThis.__deferSave.resolve();
    globalThis.__builderFail = new Error('builder down');
    const o = await act(async () => saveP);
    assert.equal(o.status, 'partial');
    savedProj = JSON.parse(JSON.stringify(globalThis.__project));
    assert.ok(savedProj.builder_sync_attempt, 'receipt persisted in server record');
  } finally { await m1.cleanup(); }
  const est = JSON.parse(JSON.stringify(globalThis.__estimate));
  const m2 = await mount(P, { project: savedProj, estimate: est });
  try {
    assert.equal(m2.tb().dirty, true);
    assert.ok(amber(m2) >= 1, 'amber recovery banner on reopen');
    assert.ok(retryBtn(m2).length >= 1, 'retry button visible');
    globalThis.__savedVersion = 'v3';
    globalThis.__builderFail = null;
    const writesBefore = m2.calls().length;
    const o2 = await act(async () => retryBtn(m2)[0].props.onClick());
    assert.equal(m2.calls().filter(c => c[0] === 'saveSource').length, 1, 'exactly one source write after remount');
    assert.equal(m2.calls().filter(c => c[0] === 'recordBuilderSave').length, 1, 'exactly one builder call after remount');
    assert.equal(m2.tb().dirty, false);
    assert.equal(amber(m2), 0, 'zero recovery banner after fresh ACK');
  } finally { await m2.cleanup(); }
});
await ok('timer: pending reopen schedules no 2000ms autosave', async () => {
  const timers = new Map(); let seq = 0;
  const oSet = globalThis.setTimeout, oClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, d, ...a) => { if (d !== 2000) return oSet(fn, d, ...a); const i = ++seq; timers.set(i, fn); return i; };
  globalThis.clearTimeout = i => { if (timers.has(i)) { timers.delete(i); return; } return oClear(i); };
  const att = { schema_version: 1, key: 'k1', source_project_id: 'p1', estimate_id: 'e1', requested_at: '2026-11-05T00:00:00Z' };
  const m = await mount(P, { project: { id: 'p1', updated_date: 'v2', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false }, builder_sync_attempt: att } });
  try {
    await act(async () => { m.tb().onToggleAutoSave(); });
    assert.equal(timers.size, 0, 'no autosave timer scheduled while recovery pending');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
  } finally { globalThis.setTimeout = oSet; globalThis.clearTimeout = oClear; await m.cleanup(); }
});
await ok('beforeunload fires on pending reopen', async () => {
  let listener = null;
  const origAdd = window.addEventListener;
  window.addEventListener = (t, fn) => { if (t === 'beforeunload') listener = fn; };
  const att = { schema_version: 1, key: 'k1', source_project_id: 'p1', estimate_id: 'e1', requested_at: '2026-11-05T00:00:00Z' };
  const m = await mount(P, { project: { id: 'p1', updated_date: 'v2', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false }, builder_sync_attempt: att } });
  try {
    assert.equal(typeof listener, 'function');
    const ev = { preventDefault() { this.pd = true; }, returnValue: 'x' };
    listener(ev);
    assert.equal(ev.pd, true);
    assert.equal(ev.returnValue, '');
  } finally { window.addEventListener = origAdd; await m.cleanup(); }
});
await ok('back while saving: no confirm, no leave', async () => {
  const m = await mount(P, { embedded: true });
  try {
    globalThis.__deferSave = deferred();
    let confirmCalls = 0;
    const oc = window.confirm; window.confirm = () => { confirmCalls++; return false; };
    let saveP; await act(async () => { saveP = m.tb().onSave(); });
    await waitCall(m, 'saveSource');
    m.tb().onBack();
    assert.equal(confirmCalls, 0);
    assert.equal(m.closed.length, 0);
    globalThis.__deferSave.resolve();
    await act(async () => saveP);
    window.confirm = oc;
  } finally { await m.cleanup(); }
});
await ok('back dirty standalone: cancel 0 nav, confirm 1 nav', async () => {
  const m = await mount(P);
  try {
    await m.edit();
    window.confirm = () => false;
    m.tb().onBack();
    assert.equal(m.nav().length, 0);
    window.confirm = () => true;
    m.tb().onBack();
    assert.equal(m.nav().length, 1);
  } finally { await m.cleanup(); }
});
await ok('delayed A load resolves after reroute B: B stays, save writes B only', async () => {
  const m = await mount(P);
  try {
    let resolveA;
    globalThis.__getProject = id => new Promise(res => { if (id === 'pA') resolveA = () => res({ id: 'pA', updated_date: 'vA', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } }); else res(globalThis.__project); });
    await m.reroute('?id=pA&estimateId=e1');
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    if (resolveA) { resolveA(); await act(async () => { await Promise.resolve(); }); }
    const o = await act(async () => m.tb().onSave());
    const save = m.calls().find(c => c[0] === 'saveSource');
    assert.equal(save[1].sourceId, 'pB');
    assert.notEqual(save[1].sourceId, 'pA');
  } finally { await m.cleanup(); }
});
await ok('missing id reroute clears old project + toolbar', async () => {
  const m = await mount(P);
  try {
    globalThis.__project = null;
    window.location.search = '?id=&estimateId=e1';
    globalThis.__cap = {};
    await act(async () => { await Promise.resolve(); });
    globalThis.__getProject = () => Promise.resolve(null);
    await m.reroute('?id=pX&estimateId=e1');
    globalThis.__project = null;
    await m.reroute('?id=&estimateId=e1');
    const o = await act(async () => m.tb() ? m.tb().onSave() : { status: 'superseded' });
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, 0);
  } finally { await m.cleanup(); }
});
await ok('assembly: CAS save contains component IDs + assembly version', async () => {
  globalThis.__calcFromArg = true;
  const proj = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0', unit_cost: 5 }], poles: [{ id: 'po0', foundation_idx: 0 }], signage_cabinets: [], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: proj });
  try {
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const call = m.calls().find(c => c[0] === 'saveSource');
    assert.ok(call, 'saveSource called');
    const d = call[1].data;
    assert.equal(d.assembly_schema_version, 1);
    assert.ok(d.items[0].component_id, 'item canon id in CAS payload');
    assert.ok(d.poles[0].component_id, 'pole canon id');
    assert.equal(d.poles[0].foundation_component_id, d.items[0].component_id);
    assert.equal(d.poles[0].foundation_idx, 0);
  } finally { await m.cleanup(); }
});

await ok('assembly: duplicate keeps children on original canon, updates indices', async () => {
  globalThis.__calcFromArg = true;
  const proj = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }], poles: [{ id: 'po0', foundation_idx: 0 }], signage_cabinets: [{ mount: 'foundation', foundation_index: 0 }], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: proj });
  try {
    const card = globalThis.__cap.FoundationItemCard;
    assert.ok(card?.onDuplicate, 'card props captured');
    await act(async () => { card.onDuplicate(0); });
    await act(async () => {});
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const d = m.calls().find(c => c[0] === 'saveSource')[1].data;
    assert.equal(d.items.length, 2);
    assert.notEqual(d.items[0].component_id, d.items[1].component_id);
    assert.equal(d.poles[0].foundation_component_id, d.items[0].component_id, 'pole stays on ORIGINAL not the dup');
    assert.equal(d.signage_cabinets[0].foundation_component_id, d.items[0].component_id);
  } finally { await m.cleanup(); }
});

await ok('assembly copy: same-tick calls coalesce to one create', async () => {
  let creates = 0, deferred;
  globalThis.__ensureIdempotent = (a) => { creates += 1; globalThis.__createArgs = a; return new Promise(r => { deferred = r; }); };
  const m = await mount(bundles.patched);
  try {
    let p1, p2;
    await act(async () => { p1 = m.tb().onSaveAsCopy(); p2 = m.tb().onSaveAsCopy(); });
    for (let i = 0; i < 20 && !deferred; i++) await act(async () => { await Promise.resolve(); });
    assert.equal(typeof deferred, 'function');
    await act(async () => { deferred({ id: 'copyX' }); await p1; await p2; });
    assert.equal(creates, 1);
    assert.equal(m.nav().filter(u => u.includes('copyX')).length, 1);
  } finally { globalThis.__ensureIdempotent = null; await m.cleanup(); }
});

await ok('assembly copy: lost-reply retry reuses key + identical remapped data; edit -> new key', async () => {
  const calls = [];
  let fails = 0;
  globalThis.__ensureIdempotent = (a) => { calls.push(a); if (fails < 1) { fails += 1; return Promise.reject(new Error('lost reply')); } return Promise.resolve({ id: 'copy1' }); };
  const m = await mount(bundles.patched);
  try {
    await act(async () => { await m.tb().onSaveAsCopy(); });
    assert.equal(calls.length, 1);
    const k1 = calls[0].key;
    await act(async () => { await m.tb().onSaveAsCopy(); });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].key, k1, 'same creation key on retry');
    assert.deepEqual(calls[1].data, calls[0].data, 'same remapped graph on retry');
    await m.edit();
    await act(async () => { await m.tb().onSaveAsCopy(); });
    assert.equal(calls.length, 3);
    assert.notEqual(calls[2].key, k1, 'edit produces new signature key');
  } finally { globalThis.__ensureIdempotent = null; await m.cleanup(); }
});

await ok('assembly copy: stale route/unmount zero effects; copy-vs-save mutual exclusion', async () => {
  let deferred, creates = 0;
  globalThis.__ensureIdempotent = (a) => { creates += 1; return new Promise(r => { deferred = r; }); };
  const m = await mount(bundles.patched);
  try {
    await act(async () => { m.tb().onSaveAsCopy(); });
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    for (let i = 0; i < 20 && !deferred; i++) await act(async () => { await Promise.resolve(); });
    await act(async () => { deferred?.({ id: 'late' }); });
    assert.equal(m.nav().filter(u => u.includes('late')).length, 0, 'no nav from stale copy');
    let deferredSave;
    globalThis.__deferSave = { p: new Promise(r => { deferredSave = r; }) };
    const saved = m.tb().onSave();
    await act(async () => {});
    let copyResult;
    await act(async () => { copyResult = await m.tb().onSaveAsCopy(); });
    assert.equal(copyResult, null, 'copy blocked while save in flight');
    await act(async () => { deferredSave(); await saved; });
    await waitCall(m, 'recordBuilderSave');
    let deferredCreate;
    globalThis.__ensureIdempotent = (a) => { creates += 1; return new Promise(r => { deferredCreate = r; }); };
    const p2 = m.tb().onSaveAsCopy();
    for (let i = 0; i < 20 && !deferredCreate; i++) await act(async () => { await Promise.resolve(); });
    const outcome = await act(async () => m.tb().onSave());
    assert.equal(outcome?.status ?? outcome, 'superseded', 'save blocked while copy in flight');
    await act(async () => { deferredCreate?.({ id: 'cc' }); await p2; });
  } finally { globalThis.__ensureIdempotent = null; globalThis.__deferSave = null; await m.cleanup(); }
});

await ok('assembly template: root id/receipt ignored, provided arrays remapped only, future version rejected', async () => {
  globalThis.__calcFromArg = true;
  const proj = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }], signage_cabinets: [{ mount: 'foundation', foundation_index: 0 }], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: proj });
  try {
    const dlg = globalThis.__cap.FoundationTemplateDialog;
    assert.ok(dlg?.onApply, 'template props captured');
    await act(async () => { dlg.onApply({ id: 'evil', updated_date: 'vx', builder_sync_attempt: {}, items: [{ description: 'T1' }] }); });
    await act(async () => {});
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const d = m.calls().find(c => c[0] === 'saveSource')[1].data;
    assert.equal(d.items[0].description, 'T1');
    assert.ok(d.items[0].component_id, 'template items get fresh canon IDs');
    assert.notEqual(d.items[0].id, 'evil');
    assert.equal(d.signage_cabinets.length, 1, 'omitted arrays retained');
    await act(async () => { dlg.onApply({ assembly_schema_version: 2, items: [{ description: 'BAD' }] }); });
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave', 2);
    const d2 = m.calls().filter(c => c[0] === 'saveSource').at(-1)[1].data;
    assert.equal(d2.items[0].description, 'T1', 'future version apply rejected, prior items kept');
  } finally { await m.cleanup(); }
});

await ok('assembly commit: rejected update preserves history/revision; two quick commits both persist', async () => {
  globalThis.__calcFromArg = true;
  const proj = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }, { id: 'i1', description: 'F1' }], signage_cabinets: [], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: proj });
  try {
    const card = globalThis.__cap.FoundationItemCard;
    assert.ok(card?.onChange, 'card props captured');
    const dlg = globalThis.__cap.FoundationTemplateDialog;
    const dirty0 = globalThis.__cap.FoundationToolbar.dirty;
    await act(async () => { dlg.onApply({ items: [{ component_id: 'dupx' }, { component_id: 'dupx' }] }); });
    await act(async () => {});
    assert.equal(globalThis.__cap.FoundationToolbar.dirty, dirty0, 'rejected commit keeps prior state');
    assert.equal(globalThis.__cap.FoundationItemCard.item?.component_id === 'dupx', false, 'duplicate IDs not committed');
    await act(async () => { card.onChange(0, { description: 'A' }); card.onChange(1, { description: 'B' }); });
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const d = m.calls().find(c => c[0] === 'saveSource')[1].data;
    assert.equal(d.items[0].description, 'A');
    assert.equal(d.items[1].description, 'B');
  } finally { await m.cleanup(); }
});

await ok('assembly copy: stale handler after reroute/unmount zero create', async () => {
  let creates = 0;
  globalThis.__ensureIdempotent = (a) => { creates += 1; return Promise.resolve({ id: 'c9' }); };
  const m = await mount(bundles.patched);
  try {
    const stale = m.tb().onSaveAsCopy;
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    const r = await act(async () => stale());
    await act(async () => {});
    assert.equal(creates, 0, 'stale handler produced no create');
    assert.equal(r, null);
  } finally { globalThis.__ensureIdempotent = null; await m.cleanup(); }
});

await ok('assembly projectRef: save v2 metadata retained on next edit + CAS baseline v2', async () => {
  const proj = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }], signage_cabinets: [], customer_pricing: { applied: true } };
  const m = await mount(bundles.patched, { project: proj });
  try {
    globalThis.__savedVersion = 'v2';
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const card = globalThis.__cap.FoundationItemCard;
    await act(async () => { card.onChange(0, { description: 'AfterSave' }); });
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave', 2);
    const last = m.calls().filter(c => c[0] === 'saveSource').at(-1)[1];
    assert.equal(last.data.items[0].description, 'AfterSave');
    assert.ok(last.data.items[0].component_id, 'canon metadata retained after save+edit');
  } finally { await m.cleanup(); }
});


await ok('assembly copy: success and rejection both settle saving=false; retry same key+data', async () => {
  let calls = [], reject = true;
  globalThis.__ensureIdempotent = (a) => { calls.push(a); return reject ? Promise.reject(new Error('boom')) : Promise.resolve({ id: 'cok' }); };
  const m = await mount(bundles.patched);
  try {
    await act(async () => { await m.tb().onSaveAsCopy(); });
    assert.equal(m.tb().saving, false, 'rejected copy clears busy');
    reject = false;
    await act(async () => { await m.tb().onSaveAsCopy(); });
    assert.equal(m.tb().saving, false, 'successful copy clears busy');
    assert.equal(calls[1].key, calls[0].key, 'retry same signature -> same key');
    assert.deepEqual(calls[1].data, calls[0].data, 'identical remapped data on retry');
  } finally { globalThis.__ensureIdempotent = null; await m.cleanup(); }
});

await ok('assembly copy ends after reroute: no nav, busy recomputed, B save works once', async () => {
  let deferredCreate;
  globalThis.__ensureIdempotent = (a) => new Promise(r => { deferredCreate = r; });
  const m = await mount(bundles.patched);
  try {
    await act(async () => { m.tb().onSaveAsCopy(); });
    for (let i = 0; i < 20 && !deferredCreate; i++) await act(async () => { await Promise.resolve(); });
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'vB1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    const blocked = await act(async () => m.tb().onSave());
    assert.equal(blocked?.status ?? blocked, 'superseded', 'B save blocked while A copy still in flight');
    await act(async () => { deferredCreate?.({ id: 'lateC' }); await Promise.resolve(); });
    assert.equal(m.nav().filter(u => u.includes('lateC')).length, 0, 'stale copy never navigates');
    assert.equal(m.tb().saving, false, 'stale copy completion recomputes global busy truth, not stuck');
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').at(-1)[1].sourceId, 'pB', 'B save proceeds after copy settles');
  } finally { globalThis.__ensureIdempotent = null; await m.cleanup(); }
});

await ok('assembly projectRef: post-save edit keeps updated_date+receipt; next CAS v2', async () => {
  const m = await mount(bundles.patched, { project: { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }], signage_cabinets: [], customer_pricing: { applied: true } } });
  try {
    globalThis.__savedVersion = 'v2';
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const firstData = m.calls().filter(c => c[0] === 'saveSource')[0][1].data;
    const card = globalThis.__cap.FoundationItemCard;
    await act(async () => { card.onChange(0, { description: 'PostSaveEdit' }); });
    const dlgProject = globalThis.__cap.FoundationTemplateDialog.project;
    assert.equal(dlgProject.updated_date, 'v2', 'committed render carries saved version, not stale v1');
    assert.deepEqual(dlgProject.builder_sync_attempt, firstData.builder_sync_attempt, 'receipt metadata identical after post-save edit');
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave', 2);
    const last = m.calls().filter(c => c[0] === 'saveSource').at(-1)[1];
    assert.equal(last.expectedUpdatedAt, 'v2', 'CAS guard advanced to saved version');
  } finally { await m.cleanup(); }
});


await ok('template onApply: rejected -> false, valid partial -> true + identity retained', async () => {
  const m = await mount(bundles.patched, { project: { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'Orig' }], signage_cabinets: [{ mount: 'foundation', foundation_index: 0 }], customer_pricing: { applied: true } } });
  try {
    const dlg = () => globalThis.__cap.FoundationTemplateDialog;
    const bad = await act(async () => dlg().onApply({ assembly_schema_version: 2, items: [{ id: 'evil' }] }));
    assert.equal(bad, false, 'future version rejected');
    assert.equal(globalThis.__cap.FoundationItemCard.item?.description, 'Orig', 'item unchanged after reject');
    const res = await act(async () => dlg().onApply({ items: [{ id: 't1', description: 'Tpl' }], notes: 'applied' }));
    assert.equal(res, true, 'valid partial apply committed');
    const card = globalThis.__cap.FoundationItemCard;
    assert.equal(card.item?.description, 'Tpl', 'template item applied');
    assert.ok(card.item?.component_id, 'fresh component id minted');
    assert.equal(dlg().project.id, 'p1', 'root identity retained');
    assert.equal(dlg().project.signage_cabinets.length, 1, 'omitted arrays retained');
    assert.equal(dlg().project.updated_date, 'v1', 'receipt fields untouched');
  } finally { await m.cleanup(); }
});


await ok('late write while returned A still loading: stale v1 read not installed, bounded reread', async () => {
  const projA = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }], signage_cabinets: [], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: projA });
  try {
    globalThis.__deferSave = deferred();
    let sp;
    await act(async () => { sp = m.tb().onSave(); });
    await waitCall(m, 'saveSource');
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'w1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    const held = deferred();
    let getCount = 0;
    globalThis.__getProject = (id) => { getCount += 1; return id === 'p1' ? held.p : globalThis.__project; };
    globalThis.__project = { ...projA };
    await m.reroute('?id=p1&estimateId=e1', { ...projA });
    // old source write completes (v2) while returned-A read is still held
    globalThis.__deferSave.resolve();
    await act(async () => { await sp; });
    const savedRow = { ...projA, ...m.calls().filter(c => c[0] === 'saveSource')[0][1].data, updated_date: 'v2' };
    globalThis.__project = savedRow;
    globalThis.__getProject = (id) => { getCount += 1; return Promise.resolve(id === 'p1' ? savedRow : globalThis.__project); }; // rerun counts + returns saved v2
    await act(async () => { held.resolve({ ...projA }); await Promise.resolve(); });
    // epoch advanced -> v1 read discarded -> fresh read installs v2 + receipt
    for (let i = 0; i < 30 && globalThis.__cap.FoundationTemplateDialog?.project?.updated_date !== 'v2'; i++) await act(async () => { await Promise.resolve(); });
    assert.equal(globalThis.__cap.FoundationTemplateDialog.project.updated_date, 'v2', 'fresh read installed saved version, not stale v1');
    assert.equal(getCount, 2, 'exactly one fresh read follows the superseded snapshot');
    assert.equal(m.tb().dirty, true, 'pending receipt keeps dirty/recovery');
    assert.equal(globalThis.__cap.FoundationSectionBanner.sectionName, 'Fix');
  } finally { globalThis.__getProject = null; await m.cleanup(); }
});

await ok('late save on loaded newer gen: refresh marker, blocked saves, reload confirm/cancel', async () => {
  const projA = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0', description: 'F0' }], signage_cabinets: [], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: projA });
  try {
    globalThis.__deferSave = deferred();
    let sp;
    await act(async () => { sp = m.tb().onSave(); });
    await waitCall(m, 'saveSource');
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'w1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    await m.reroute('?id=p1&estimateId=e1', { ...projA });
    const inp = [...globalThis.__inputs].reverse().find(i => i.value === 'Fix');
    await act(async () => { inp.onChange({ target: { value: 'NewerDraft' } }); });
    globalThis.__deferSave.resolve();
    await act(async () => { await sp; });
    const reloadBtn = () => m.root().findAll(el => el?.props?.children === 'Reload saved project').map(el => el.props);
    assert.equal(reloadBtn().length, 1, 'refresh-required marker visible');
    assert.equal(globalThis.__cap.FoundationTemplateDialog.project.items[0].description, 'F0', 'loaded design not overwritten');
    assert.equal(globalThis.__cap.FoundationTemplateDialog.project.project_name, 'NewerDraft', 'current draft preserved after old save');
    assert.equal(m.tb().dirty, true, 'marker keeps dirty');
    const savesBefore = m.calls().filter(c => c[0] === 'saveSource').length;
    const builderBefore = m.calls().filter(c => c[0] === 'recordBuilderSave').length;
    const blocked = await act(async () => m.tb().onSave());
    assert.equal(blocked?.status ?? blocked, 'conflict', 'save blocked while refresh required');
    const blockedExit = await act(async () => m.tb().onSaveAndExit());
    assert.equal((blockedExit?.status ?? blockedExit) !== 'saved', true, 'save&exit must not navigate');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, savesBefore, 'zero source I/O while marked');
    assert.equal(m.calls().filter(c => c[0] === 'recordBuilderSave').length, builderBefore, 'zero Builder I/O while marked');
    assert.equal(m.nav().length, 0, 'no navigation');
    // cancel reload preserves state
    const origConfirm = window.confirm;
    window.confirm = () => false;
    await act(async () => { reloadBtn()[0].onClick(); });
    window.confirm = origConfirm;
    assert.equal(reloadBtn().length, 1, 'cancel keeps marker');
    assert.equal(globalThis.__cap.FoundationTemplateDialog.project.project_name, 'NewerDraft', 'cancel keeps current draft');
    // confirm reload -> fresh read of saved row -> pending receipt -> explicit retry
    const savedRow = { ...projA, ...m.calls().filter(c => c[0] === 'saveSource')[0][1].data, updated_date: 'v2' };
    globalThis.__project = savedRow;
    await act(async () => { reloadBtn()[0].onClick(); await Promise.resolve(); });
    for (let i = 0; i < 30 && globalThis.__cap.FoundationTemplateDialog?.project?.updated_date !== 'v2'; i++) await act(async () => { await Promise.resolve(); });
    assert.equal(globalThis.__cap.FoundationTemplateDialog.project.updated_date, 'v2', 'reload read saved version');
    assert.equal(reloadBtn().length, 0, 'marker cleared after successful reload');
    await m.tb().onSave();
    await waitCall(m, 'recordBuilderSave');
    const last = m.calls().filter(c => c[0] === 'saveSource').at(-1)[1];
    assert.equal(last.expectedUpdatedAt, 'v2', 'retry CAS uses reloaded version');
    assert.equal(m.tb().dirty, false, 'retry clears recovery on matching ack');
  } finally { await m.cleanup(); }
});


await ok('marker reload fail: explicit load error, no writes/close, marker survives', async () => {
  const projA = { id: 'p1', updated_date: 'v1', project_name: 'Fix', items: [{ id: 'i0' }], signage_cabinets: [], customer_pricing: { applied: false } };
  const m = await mount(bundles.patched, { project: projA });
  try {
    globalThis.__deferSave = deferred();
    let sp;
    await act(async () => { sp = m.tb().onSave(); });
    await waitCall(m, 'saveSource');
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'w1', project_name: 'Fix', items: [], signage_cabinets: [], customer_pricing: { applied: false } });
    await m.reroute('?id=p1&estimateId=e1', { ...projA });
    globalThis.__deferSave.resolve();
    await act(async () => { await sp; });
    const reloadBtn = () => m.root().findAll(el => el?.props?.children === 'Reload saved project').map(el => el.props);
    assert.equal(reloadBtn().length, 1, 'marker present');
    const staleSave = m.tb().onSave;
    globalThis.__getProject = () => Promise.reject(new Error('synthetic reload failure'));
    await act(async () => { reloadBtn()[0].onClick(); await Promise.resolve(); });
    for (let i = 0; i < 30; i++) await act(async () => { await Promise.resolve(); });
    assert.ok(m.root().findAll(el => JSON.stringify(el?.props?.children || '').includes('unavailable')).length >= 1, 'explicit load error shown after failed reload');
    const savesBefore = m.calls().filter(c => c[0] === 'saveSource').length;
    const staleOutcome = await act(async () => staleSave());
    assert.equal(staleOutcome.status, 'superseded', 'old handler fails closed after reload error');
    assert.equal(m.calls().filter(c => c[0] === 'saveSource').length, savesBefore, 'failed reload -> no source write from stale handler');
    assert.equal(m.nav().length, 0, 'no close/nav on failed reload');
    // recover: reroute fresh loads safely
    globalThis.__getProject = null;
    await m.reroute('?id=pB&estimateId=e1', { id: 'pB', updated_date: 'w2', project_name: 'B', items: [], customer_pricing: { applied: false } });
    await m.reroute('?id=p1&estimateId=e1', { ...projA, updated_date: 'v9' });
    for (let i = 0; i < 30 && !globalThis.__cap.FoundationTemplateDialog?.project; i++) await act(async () => { await Promise.resolve(); });
    assert.equal(globalThis.__cap.FoundationTemplateDialog?.project?.updated_date, 'v9', 'fresh load after failure works');
  } finally { globalThis.__getProject = null; await m.cleanup(); }
});

console.log(`PASS save-handler passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
