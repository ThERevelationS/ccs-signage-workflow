import esbuild from 'esbuild';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, '.audit-work/foundation-browser03');
const PORT_START = 5171;

const STUBS = {
  '@/components/ui/input': `export const Input=(p)=><input {...p}/>;`,
  '@/components/ui/tabs': `export const Tabs=(p)=><div {...p}>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
  '@/components/ui/select': `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=(p)=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p.open?<div data-dialog="true">{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;`,
  '@/components/ui/button': `export const Button=(p)=><button {...p}>{p.children}</button>;`,
  '@/components/ui/badge': `export const Badge=(p)=><span>{p.children}</span>;`,
  '@/components/ui/label': `export const Label=(p)=><label {...p}>{p.children}</label>;`,
  '@/components/ui/switch': `export const Switch=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>;`,
  '@/components/ui/checkbox': `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>;`,
  '@/components/ui/dropdown-menu': `export const DropdownMenu=(p)=><div>{p.children}</div>;export const DropdownMenuTrigger=(p)=><button type="button">{p.children}</button>;export const DropdownMenuContent=(p)=><div>{p.children}</div>;export const DropdownMenuItem=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;export const DropdownMenuSeparator=()=>null;export const DropdownMenuLabel=(p)=><div>{p.children}</div>;export const DropdownMenuGroup=(p)=><div>{p.children}</div>;`,
  '@/components/ui/accordion': `export const Accordion=(p)=><div>{p.children}</div>;export const AccordionItem=(p)=><div>{p.children}</div>;export const AccordionTrigger=(p)=><div>{p.children}</div>;export const AccordionContent=(p)=><div>{p.children}</div>;`,
  '@/components/markup/savedCustomerPricing': `export async function calculateSavedCustomerPricing(){return{applied:true,fixture:true};}`,
  '@/components/markup/CustomerPricingTab': `export default ()=><div data-stub="CustomerPricingTab"/>;`,
  '@/components/markup/projectCategorizer': `export function categorizeFoundationProject(){return{};}`,
  '@/components/estimator/builder/builderService': `export const recordBuilderSave=async a=>{const r=await fetch('/api/builder-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({estimateId:a.estimateId,projectId:a.sourceProject.id,updated_date:a.sourceProject.updated_date,liveTotal:a.liveTotal})});const d=await r.json();if(!r.ok)throw new Error(d.error||'builder sync failed');return d.line;};
export const newCreationRequestKey=(p)=>p+'-'+Date.now()+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);`,
  '@/components/estimator/idempotentEntityCreate': `export const newCreationRequestKey=(p)=>p+'-'+Date.now()+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);export const ensureIdempotentEntityCreate=async o=>o.create();`,
  '@/components/estimator/loadAllEntityRows': `export async function loadAllEntityRows({entity,limit=2000}){return entity.list?entity.list({},limit):[];}export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/estimateMutationGuard': `export async function assertEstimateProductMutationAllowed(e){if(e&&e.protected)throw new Error('Estimate is protected.');}`,
  '@/components/staff/staffEntities': `const J=async r0=>{const r=await r0;const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;};
export const staffEntities={
  FoundationProject:{get:id=>J(fetch('/api/project/'+encodeURIComponent(id))),update:async()=>({}),updateMany:async(q,u)=>{const d=await J(fetch('/api/update-many',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'project',query:q,update:u})}));return d.result||d;},list:async()=>[]},
  AllInOneEstimate:{get:id=>J(fetch('/api/estimate/'+encodeURIComponent(id))),list:async()=>[]},
  FoundationInventory:{list:async()=>J(fetch('/api/inventory'))},
  LaborServiceInventory:{list:async()=>[]},
  Settings:{list:async()=>[]},
};`,
  '@/components/estimator/foundation/convertToBrickStone': `export const convertFoundationToBrickStone=()=>({});`,
  '@/components/estimator/moduleShared/moduleProjectActions': `export const createEstimateReadOnlyShareLink=async()=>'/share-fixture';`,
  '@/components/utils': `export const createPageUrl=(n)=>'/'+n;`,
  '@/components/estimator/foundation/FoundationItemCard': `export default ()=><div data-stub="FoundationItemCard"/>;`,
  '@/components/estimator/foundation/FoundationRatesPanel': `export default ()=><div data-stub="FoundationRatesPanel"/>`,
  '@/components/estimator/foundation/FoundationEquipmentTab': `export default ()=><div data-stub="FoundationEquipmentTab"/>`,
  '@/components/estimator/foundation/FoundationTotals': `export default (p)=><div data-stub="FoundationTotals" data-total={p.total||0}/>;`,
  '@/components/estimator/foundation/ConcreteDeliveryPanel': `export default ()=><div data-stub="ConcreteDeliveryPanel"/>`,
  '@/components/estimator/foundation/FoundationBOM': `export default ()=><div data-stub="FoundationBOM"/>`,
  '@/components/estimator/foundation/FoundationWallsPanel': `export default ()=><div data-stub="FoundationWallsPanel"/>`,
  '@/components/estimator/foundation/FoundationWallCapsPanel': `export default ()=><div data-stub="FoundationWallCapsPanel"/>`,
  '@/components/estimator/foundation/FoundationPolesPanel': `export default ()=><div data-stub="FoundationPolesPanel"/>`,
  '@/components/estimator/foundation/FoundationSectionBanner': `export default ()=><div data-stub="FoundationSectionBanner"/>`,
  '@/components/estimator/foundation/AiEngineeringAssistant': `export default ()=><div data-stub="AiEngineeringAssistant"/>`,
  '@/components/estimator/foundation/Foundation3DPreview': `export default ()=><div data-stub="Foundation3DPreview"/>`,
  '@/components/estimator/foundation/FoundationTemplateDialog': `export default ()=>null;`,
  '@/components/estimator/foundation/FoundationLayoutCanvas': `export default ()=><div data-stub="FoundationLayoutCanvas"/>`,
  '@/components/estimator/foundation/SignageCabinetsPanel': `export default ()=><div data-stub="SignageCabinetsPanel"/>`,
  '@/components/estimator/foundation/LandscapeDesigner': `export default ()=><div data-stub="LandscapeDesigner"/>`,
  '@/components/estimator/foundation/CustomerPricingPanel': `export default ()=><div data-stub="CustomerPricingPanel"/>`,
  '@/components/estimator/foundation/landscapeMaterials': `export const landscapeSummary=()=>({total:0,items:[]});`,
};

const ENTRY = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FoundationEstimator from './src/pages/FoundationEstimator.jsx';
const wrap=(el)=><div><div style={{background:'#7f1d1d',color:'#fff',padding:'4px 8px',font:'bold 12px sans-serif'}}>ISOLATED SYNTHETIC SAVE FIXTURE - NO BASE44 DATA</div>{el}</div>;
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route path="/" element={wrap(<FoundationEstimator/>)}/>
  <Route path="/FoundationEstimator" element={wrap(<FoundationEstimator/>)}/>
  <Route path="/embedded" element={wrap(<FoundationEstimator embedded embeddedProjectId="pA" embeddedEstimateId="eA" onClose={()=>{fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'onClose'})});window.__onClose=(window.__onClose||0)+1;}} onSaved={()=>{fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'onSaved'})});window.__onSaved=(window.__onSaved||0)+1;}}/>)}/>
  <Route path="*" element={<div data-testid="exit-route">Back to synthetic estimate</div>}/>
</Routes></BrowserRouter>);`;

const state = {
  project: { id: 'pA', updated_date: 'v1', project_name: 'Fixture Project', items: [], signage_cabinets: [], customer_pricing: { applied: false } },
  estimate: { id: 'eA', line_items: [{ module_key: 'foundation', project_id: 'pA', estimate_id: 'eA', updated_date_snapshot: 'v1' }] },
  counters: { projectGet: 0, estimateGet: 0, updateMany: 0, builderSync: 0, foreignWrite: 0 },
  toggles: { sourceFail: false, builderFail: false, deferSource: false, deferBuilder: false, staleAck: false, foreignWriteAfterUpdate: false, missingEstimate: false },
  deferred: {},
  events: [],
  requests: [],
};

const snap = () => JSON.parse(JSON.stringify({ project: state.project, estimate: state.estimate, counters: state.counters, toggles: state.toggles, events: state.events, requests: state.requests }));
const reset = () => { state.project = { id: 'pA', updated_date: 'v1', project_name: 'Fixture Project', items: [], signage_cabinets: [], customer_pricing: { applied: false } }; state.estimate = { id: 'eA', line_items: [{ module_key: 'foundation', project_id: 'pA', estimate_id: 'eA', updated_date_snapshot: 'v1' }] }; state.counters = { projectGet: 0, estimateGet: 0, updateMany: 0, builderSync: 0, foreignWrite: 0 }; for (const k of Object.keys(state.toggles)) state.toggles[k] = false; state.deferred = {}; state.events = []; state.requests = []; };
let vSeq = 2;

const bundle = async () => {
  const probe = (base) => {
    for (const c of [base + '.jsx', base + '.js', base + '/index.jsx', base + '/index.js', base]) {
      try { if (fs.statSync(c).isFile()) return c; } catch { }
    }
    return null;
  };
  const plugin = {
    name: 'fixture-stubs',
    setup(b) {
      b.onResolve({ filter: /^@\/|^\.\.\// }, (a) => {
        const resolved = a.path.startsWith('@/') ? a.path
          : (a.importer.includes('node_modules') ? null : '@/' + a.path.replace(/^\.\.\//, 'src/'));
        if (resolved === null) return null;
        const stub = STUBS[a.path] || STUBS[resolved];
        if (stub) return { path: a.path, namespace: 'stub', pluginData: { contents: stub, resolveDir: ROOT } };
        const file = probe(path.resolve(ROOT, a.path.replace(/^@\//, 'src/').replace(/^\.\.\//, 'src/')));
        return file ? { path: file, namespace: 'file' } : null;
      });
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: (a.pluginData && a.pluginData.contents) || 'export default ()=>null;', loader: 'jsx', resolveDir: ROOT }));
    },
  };
  const r = await esbuild.build({
    entryPoints: [],
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'jsx', sourcefile: 'fixture-entry.jsx' },
    bundle: true, format: 'iife', platform: 'browser', write: false, metafile: true,
    plugins: [plugin],
    loader: { '.jsx': 'jsx', '.js': 'jsx' },
    jsx: 'automatic',
  });
  const meta = r.metafile;
  const inputs = Object.keys(meta.inputs);
  const bad = inputs.filter(i => i.includes('@base44') || i.includes('base44Client'));
  return { code: r.outputFiles[0].text, inputs, bad };
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/') && u.pathname !== '/api/state') {
    state.requests.push({ method: req.method, path: u.pathname, at: new Date().toISOString() });
    if (state.requests.length > 1000) state.requests = state.requests.slice(-1000);
  }
  const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const body = await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
  if (u.pathname === '/api/state') return json(snap());
  if (u.pathname === '/api/control') {
    const c = JSON.parse(body || '{}');
    if (c.reset) reset();
    if (c.toggles) Object.assign(state.toggles, c.toggles);
    if (c.release) { const d = state.deferred[c.release]; if (d) { delete state.deferred[c.release]; d.resolve(); } }
    return json({ ok: true });
  }
  if (u.pathname === '/api/event') { state.events.push(JSON.parse(body || '{}')); return json({ ok: true }); }
  if (u.pathname.startsWith('/api/project/')) { state.counters.projectGet++; return state.toggles.missingEstimate ? json({ error: 'nf' }, 404) : json(state.project); }
  if (u.pathname.startsWith('/api/estimate/')) { state.counters.estimateGet++; return state.toggles.missingEstimate ? json({ error: 'nf' }, 404) : json(state.estimate); }
  if (u.pathname === '/api/inventory') return json([]);
  if (u.pathname === '/api/update-many') {
    const { query, update } = JSON.parse(body);
    if (state.toggles.sourceFail) return json({ error: 'synthetic source failure' }, 500);
    state.counters.updateMany++;
    const run = async () => {
      if (state.project.id === query.id && state.project.updated_date === query.updated_date) {
        const nv = 'v' + vSeq++;
        state.project = { ...state.project, ...(update.$set || {}), id: query.id, updated_date: nv };
        return { updated: 1 };
      }
      return { updated: 0 };
    };
    if (state.toggles.deferSource) { await new Promise(r => { state.deferred.source = { resolve: r }; }); }
    const result = await run();
    if (result.updated === 1 && state.toggles.foreignWriteAfterUpdate) {
      state.counters.foreignWrite++;
      state.project = { ...state.project, project_name: 'FOREIGN WRITER', updated_date: 'v' + vSeq++ };
    }
    return json({ result });
  }
  if (u.pathname === '/api/builder-sync') {
    const b = JSON.parse(body);
    if (state.toggles.builderFail) return json({ error: 'synthetic builder failure' }, 500);
    if (state.toggles.deferBuilder) { await new Promise(r => { state.deferred.builder = { resolve: r }; }); }
    state.counters.builderSync++;
    const line = state.estimate.line_items.find(l => l.module_key === 'foundation' && l.project_id === b.projectId);
    const snap2 = state.toggles.staleAck ? 'v1' : b.updated_date;
    if (line) line.updated_date_snapshot = snap2;
    return json({ line: { module_key: 'foundation', project_id: b.projectId, estimate_id: b.estimateId, updated_date_snapshot: snap2 } });
  }
  if (u.pathname === '/' || u.pathname === '/FoundationEstimator' || u.pathname === '/embedded' || !u.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body><div id="root"></div><script>${fs.readFileSync(path.join(OUT_DIR, 'fixture-bundle.js'), 'utf8')}</script></body></html>`);
  }
  res.writeHead(404); res.end('nf');
});

const b = await bundle();
if (b.bad.length) { console.error('FORBIDDEN SDK/bundle inputs:', b.bad); process.exit(1); }
fs.writeFileSync(path.join(OUT_DIR, 'fixture-bundle.js'), b.code);
fs.writeFileSync(path.join(OUT_DIR, 'bundle-inputs.json'), JSON.stringify(b.inputs, null, 2));
server.listen(PORT_START, '127.0.0.1', () => console.log(`fixture http://127.0.0.1:${PORT_START}`));
