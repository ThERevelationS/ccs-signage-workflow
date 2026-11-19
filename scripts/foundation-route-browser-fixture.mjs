// O-003 route A-B-A + copy/save fixture: REAL FoundationEstimator + real
// FoundationToolbar, real saveSession/syncRecovery/assemblyModel/
// sourceProjectPersistence/idempotentEntityCreate. Only staff-entity/Builder
// boundary + heavy panels are stubbed. No SDK. 127.0.0.1:5172, self-stopping.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, '.audit-work/foundation-route07');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5172;
const ORIGIN = `http://127.0.0.1:${PORT}`;

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
  '@/components/estimator/builder/builderService': `export const recordBuilderSave=async a=>{const r=await fetch('/api/builder-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({estimateId:a.estimateId,projectId:a.sourceProject.id,updated_date:a.sourceProject.updated_date,liveTotal:a.liveTotal})});const d=await r.json();if(!r.ok)throw new Error(d.error||'builder sync failed');return d.line;};`,
  '@/components/estimator/loadAllEntityRows': `export async function loadAllEntityRows({entity,limit=2000}){return entity.list?entity.list({},limit):[];}export const primeEntityRowsCache=()=>{};`,
  '@/components/estimator/estimateMutationGuard': `export async function assertEstimateProductMutationAllowed(e){if(e&&e.protected)throw new Error('Estimate is protected.');}`,
  '@/components/staff/staffEntities': `const J=async r0=>{const r=await r0;const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||('HTTP '+r.status));e.status=r.status;throw e;}return d;};
export const staffEntities={
  FoundationProject:{
    get:id=>J(fetch('/api/project/'+encodeURIComponent(id))),
    update:async()=>({}),
    updateMany:async(q,u)=>{const d=await J(fetch('/api/update-many',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'project',query:q,update:u})}));return d.result||d;},
    filter:async(f)=>{const d=await J(fetch('/api/filter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'project',filter:f})}));return d.rows||[];},
    create:async(data)=>{window.__createInvoked=(window.__createInvoked||0)+1;const d=await J(fetch('/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'project',data})}));return d.row||d;},
    deleteMany:async()=>{throw new Error('fixture deleteMany forbidden');},
    list:async()=>[],
  },
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
  '@/components/estimator/foundation/FoundationTotals': `export default (p)=><div data-stub="FoundationTotals" data-total={p.total||0}/>`,
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
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import FoundationEstimator from './src/pages/FoundationEstimator.jsx';
const emit=(type)=>()=>{(window.__fixtureEvents=window.__fixtureEvents||[]).push(type);fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type})});};
const wrap=(el)=>{
  const Nav=()=>{const n=useNavigate();return <div>
    <button id="nav-a" onClick={()=>n('/FoundationEstimator?id=pA&estimateId=eA')}>Route A</button>
    <button id="nav-b" onClick={()=>n('/FoundationEstimator?id=pB&estimateId=eB')}>Route B</button>
  </div>;};
  return <div><div style={{background:'#7f1d1d',color:'#fff',padding:'4px 8px',font:'bold 12px sans-serif'}}>ISOLATED SYNTHETIC ROUTE FIXTURE - NO BASE44 DATA</div><Nav/>{el}</div>;
};
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route path="/" element={wrap(<FoundationEstimator onSaved={emit('onSaved')} onClose={emit('onClose')}/>)}/>
  <Route path="/FoundationEstimator" element={wrap(<FoundationEstimator onSaved={emit('onSaved')} onClose={emit('onClose')}/>)}/>
  <Route path="*" element={<div data-testid="exit-route">Back to synthetic estimate</div>}/>
</Routes></BrowserRouter>);`;

const seed = () => ({
  projects: {
    pA: { id: 'pA', updated_date: 'v1', project_name: 'Project A', items: [{ id: 'i0', description: 'Fnd A' }], signage_cabinets: [], customer_pricing: { applied: false } },
    pB: { id: 'pB', updated_date: 'w1', project_name: 'Project B', items: [{ id: 'j0', description: 'Fnd B' }], signage_cabinets: [], customer_pricing: { applied: false } },
  },
  estimates: {
    eA: { id: 'eA', line_items: [{ module_key: 'foundation', project_id: 'pA', estimate_id: 'eA', updated_date_snapshot: 'v1' }] },
    eB: { id: 'eB', line_items: [{ module_key: 'foundation', project_id: 'pB', estimate_id: 'eB', updated_date_snapshot: 'w1' }] },
  },
  copies: {},
  counters: { projectGet: 0, estimateGet: 0, updateMany: 0, filter: 0, create: 0, builderSync: 0 },
  toggles: { deferGet: {}, deferSource: false, deferBuilder: false, deferCreate: false, createFail: false, createLostReply: false },
  deferred: {},
  events: [],
  requests: [],
  createAttempts: [],
  builderAttempts: [],
  sourceAttempts: [],
  vSeq: 10,
});
let state = seed();
const reset = () => { state = seed(); };

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
  const inputs = Object.keys(r.metafile.inputs);
  const bad = inputs.filter(i => i.includes('@base44') || i.includes('base44Client'));
  return { code: r.outputFiles[0].text, inputs, bad };
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/') && u.pathname !== '/api/state') {
    state.requests.push({ method: req.method, path: u.pathname, at: new Date().toISOString() });
  }
  const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const body = await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
  if (u.pathname === '/api/state') return json(JSON.parse(JSON.stringify({ ...state, deferred: Object.keys(state.deferred) })));
  if (u.pathname === '/api/control') {
    const c = JSON.parse(body || '{}');
    if (c.reset) reset();
    if (c.toggles) {
      if (c.toggles.deferGet) Object.assign(state.toggles.deferGet, c.toggles.deferGet);
      for (const [k, v] of Object.entries(c.toggles)) if (k !== 'deferGet') state.toggles[k] = v;
    }
    if (c.setProject) state.projects[c.setProject.id] = { ...state.projects[c.setProject.id], ...c.setProject };
    if (c.release) {
      const [key, which] = String(c.release).split('@');
      const d = state.deferred[key];
      if (Array.isArray(d)) { const e = which === 'last' ? d.pop() : d.shift(); e?.resolve(); if (!d.length) delete state.deferred[key]; }
      else if (d) { delete state.deferred[key]; d.resolve(); }
    }
    return json({ ok: true });
  }
  if (u.pathname === '/api/event') { state.events.push(JSON.parse(body || '{}')); return json({ ok: true }); }
  if (u.pathname.startsWith('/api/project/')) {
    const id = decodeURIComponent(u.pathname.slice('/api/project/'.length));
    state.counters.projectGet++;
    const row = state.projects[id] || state.copies[id];
    if (!row) return json({ error: 'nf' }, 404);
    const snap = JSON.parse(JSON.stringify(row)); // snapshot at invocation
    if (state.toggles.deferGet[id]) { const q = (state.deferred['get:' + id] = state.deferred['get:' + id] || []); await new Promise(r => q.push({ resolve: r })); }
    return json(snap);
  }
  if (u.pathname.startsWith('/api/estimate/')) {
    const id = decodeURIComponent(u.pathname.slice('/api/estimate/'.length));
    state.counters.estimateGet++;
    const row = state.estimates[id];
    return row ? json(JSON.parse(JSON.stringify(row))) : json({ error: 'nf' }, 404);
  }
  if (u.pathname === '/api/inventory') return json([]);
  if (u.pathname === '/api/filter') {
    const { filter } = JSON.parse(body);
    state.counters.filter++;
    const key = filter?.creation_request_key;
    const rows = Object.values(state.copies).filter(r => r.creation_request_key === key);
    return json({ rows });
  }
  if (u.pathname === '/api/create') {
    const { data } = JSON.parse(body);
    state.createAttempts.push(JSON.parse(JSON.stringify(data)));
    state.counters.create++;
    if (state.toggles.deferCreate) { await new Promise(r => { state.deferred.create = { resolve: r }; }); }
    if (state.toggles.createFail) return json({ error: 'synthetic create failure' }, 500);
    const id = 'copy' + (Object.keys(state.copies).length + 1) + '_' + Date.now().toString(36);
    const row = { ...data, id, created_date: new Date().toISOString(), updated_date: new Date().toISOString() };
    state.copies[id] = row;
    state.projects[id] = row;
    if (state.toggles.createLostReply) return json({ error: 'synthetic lost reply' }, 500);
    return json({ row });
  }
  if (u.pathname === '/api/update-many') {
    const { query, update } = JSON.parse(body);
    state.sourceAttempts.push(JSON.parse(JSON.stringify({ query, update })));
    state.counters.updateMany++;
    if (state.toggles.deferSource) { await new Promise(r => { state.deferred.source = { resolve: r }; }); }
    const row = state.projects[query?.id];
    if (row && row.updated_date === query.updated_date) {
      const nv = 'v' + state.vSeq++;
      state.projects[query.id] = { ...row, ...(update.$set || {}), id: query.id, updated_date: nv };
      if (state.copies[query.id]) state.copies[query.id] = state.projects[query.id];
      return json({ result: { updated: 1 }, row: state.projects[query.id] });
    }
    return json({ result: { updated: 0 } });
  }
  if (u.pathname === '/api/builder-sync') {
    const b = JSON.parse(body);
    state.builderAttempts.push(JSON.parse(JSON.stringify(b)));
    state.counters.builderSync++;
    state.lastBuilderSync = b;
    if (state.toggles.deferBuilder) { await new Promise(r => { state.deferred.builder = { resolve: r }; }); }
    const est = state.estimates[b.estimateId];
    const line = est?.line_items?.find(l => l.module_key === 'foundation' && l.project_id === b.projectId);
    if (line) line.updated_date_snapshot = b.updated_date;
    return json({ line: line || null });
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>route fixture</title></head><body><div id="root"></div><script>${fs.readFileSync(path.join(OUT, 'fixture-bundle.js'), 'utf8')}</script></body></html>`);
});

const b = await bundle();
if (b.bad.length) { console.error('FORBIDDEN SDK inputs:', b.bad); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'fixture-bundle.js'), b.code);
fs.writeFileSync(path.join(OUT, 'bundle-inputs.json'), JSON.stringify(b.inputs, null, 2));
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const ctl = (c) => fetch(`http://127.0.0.1:${PORT}/api/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).then(r => r.json());
const getState = () => fetch(`http://127.0.0.1:${PORT}/api/state`).then(r => r.json());

const results = [];
const telemetry = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const newCasePage = async (name) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const expectedFailure = name === '4' || name === '4b';
  page.__confirmAnswers = [];
  page.on('pageerror', (e) => results.push({ case: name + ':pageerror', ok: false, error: String(e) }));
  page.on('dialog', async (d) => {
    page.__dlgs = (page.__dlgs || []).concat(d.message());
    telemetry.push({ case: name, type: d.type(), message: d.message() });
    if (d.type() === 'confirm') {
      if (page.__confirmAnswers.shift() === false) await d.dismiss();
      else await d.accept();
      return;
    }
    if (!expectedFailure || !/Foundation project copy.*synthetic create failure/.test(d.message())) {
      results.push({ case: name + ':unexpected-dialog', ok: false, error: d.message() });
    }
    await d.accept();
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const message = m.text();
    telemetry.push({ case: name, type: 'console-error', message });
    if (!(expectedFailure && (/status of 500/.test(message) || /Foundation project copy.*synthetic create failure/s.test(message)))) {
      results.push({ case: name + ':unexpected-console', ok: false, error: message });
    }
  });
  page.on('request', (rq) => { if (new URL(rq.url()).origin !== ORIGIN) results.push({ case: name + ':external-request', ok: false, error: rq.url() }); });
  await page.route('**/*', (r) => { if (new URL(r.request().url()).origin === ORIGIN) r.continue(); else r.abort(); });
  return { ctx, page };
};
const S = async (name, fn) => {
  try { const out = await fn() || {}; results.push({ case: name, ok: true, ...out, evidence: await getState() }); }
  catch (e) { results.push({ case: name, ok: false, error: String(e), evidence: await getState().catch(() => null) }); }
  finally { for (const ctx of browser.contexts()) await ctx.close(); }
};
const nameInput = (page) => page.locator('input').first();
const toolbarBtn = (page, text) => page.locator(`button:has-text("${text}")`).first();
const savingFalse = async (page) => { await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => /Saving…/.test(b.textContent)), null, { timeout: 8000 }); };

// ---- Case 1: stale first read must not overwrite latest A ----
const waitState = async (predicate) => {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const snapshot = await getState();
    if (predicate(snapshot)) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Synthetic service state did not reach the expected condition.');
};
const requireReady = async (page) => {
  await savingFalse(page);
  assert.equal(await page.getByRole('button', { name: 'Save & Exit', exact: true }).isEnabled(), true);
};
const settleView = (page) => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

await S('1 stale deferred first read does not clobber latest A', async () => {
  await ctl({ reset: true, toggles: { deferGet: { pA: true } } });
  const { ctx, page } = await newCasePage('1');
  await page.goto('http://127.0.0.1:5172/FoundationEstimator?id=pA&estimateId=eA');
  await page.locator('#nav-b').waitFor();
  await page.locator('#nav-b').click();
  await page.waitForFunction(() => window.location.search.includes('id=pB'));
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project B'), null, { timeout: 15000 });
  await ctl({ setProject: { id: 'pA', project_name: 'Project A latest' } }); // new reads see latest; call1 snap still 'Project A'
  await page.locator('#nav-a').click();
  await page.waitForFunction(() => window.location.search.includes('id=pA'));
  await waitState(s => s.deferred.includes('get:pA') && s.counters.projectGet === 3);
  await ctl({ release: 'get:pA@last' }); // release newest read first -> 'Project A latest'
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A latest'), null, { timeout: 15000 });
  await ctl({ release: 'get:pA@first' }); // now release the STALE first response 'Project A'
  await page.waitForTimeout(600);
  const visible = await page.locator('input').first().inputValue();
  assert.equal(visible, 'Project A latest', 'stale response must not overwrite latest A');
  const st = await getState();
  assert.equal(st.counters.updateMany, 0, 'no source writes');
  assert.equal(st.counters.builderSync, 0, 'no builder writes');
  await savingFalse(page);
  await page.screenshot({ path: `${OUT}/case1-stale-read.png` });
  await ctx.close();
  return { visible, counters: st.counters };
});

// ---- Case 2: in-flight A save settles after B->A ----
await S('2 in-flight A save after reroute: no stale close/nav, no B writes', async () => {
  await ctl({ reset: true });
  const { ctx, page } = await newCasePage('2');
  await page.goto('http://127.0.0.1:5172/FoundationEstimator?id=pA&estimateId=eA');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'), null, { timeout: 15000 });
  await nameInput(page).fill('Edited A');
  await ctl({ toggles: { deferSource: true } });
  await toolbarBtn(page, 'Save & Exit').click();
  await page.waitForFunction(async () => (await fetch('/api/state').then(r => r.json())).counters.updateMany >= 1, null, { timeout: 10000 });
  await page.locator('#nav-b').click();
  await page.waitForFunction(() => window.location.search.includes('id=pB'));
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project B'), null, { timeout: 15000 });
  await page.locator('#nav-a').click();
  await page.waitForFunction(() => window.location.search.includes('id=pA'));
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'), null, { timeout: 15000 });
  await nameInput(page).fill('Newer A draft');
  await ctl({ release: 'source', toggles: { deferSource: false } });
  const reload = page.getByRole('button', { name: 'Reload saved project', exact: true });
  await reload.waitFor();
  const st = await getState();
  assert.equal(st.counters.updateMany, 1, 'exactly one source write');
  assert.equal(st.projects.pA.items[0].description, 'Fnd A');
  assert.equal(st.projects.pA.project_name, 'Edited A', 'old save committed to A only');
  assert.deepEqual(st.projects.pB, seed().projects.pB, 'whole B source untouched');
  assert.deepEqual(st.estimates.eB, seed().estimates.eB, 'whole B estimate untouched');
  const savedSnapshot = st.projects.pA.updated_date;
  assert.equal(st.counters.builderSync, 0, 'superseded source save cannot synchronize the old visit');
  assert.equal(await nameInput(page).inputValue(), 'Newer A draft');
  assert.equal(await page.getByText('All changes saved', { exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__fixtureEvents || []), []);
  const writesBefore = st.counters.updateMany;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save & Exit', exact: true }).click();
  await settleView(page);
  assert.equal((await getState()).counters.updateMany, writesBefore);
  assert.equal((await getState()).counters.builderSync, 0);
  assert.ok(page.url().includes('id=pA'), 'still on A');
  await page.screenshot({ path: `${OUT}/case2-refresh-required-v3.png` });
  page.__confirmAnswers.push(false);
  await reload.click();
  await settleView(page);
  assert.equal(await nameInput(page).inputValue(), 'Newer A draft');
  assert.equal(await reload.count(), 1, 'cancel preserves refresh marker');
  page.__confirmAnswers.push(true);
  await reload.click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Edited A'));
  assert.equal(await reload.count(), 0, 'verified reload clears refresh marker');
  assert.ok((await page.getByRole('status').innerText()).includes('still unacknowledged'), 'reloaded source retains pending receipt');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const recovered = await waitState(s => s.counters.builderSync === 1 && s.events.some(e => e.type === 'onSaved'));
  await requireReady(page);
  assert.equal(await page.getByRole('status').count(), 0, 'matching current acknowledgment clears recovery');
  assert.equal(recovered.estimates.eA.line_items[0].updated_date_snapshot, recovered.projects.pA.updated_date);
  assert.equal(recovered.sourceAttempts[1].query.updated_date, savedSnapshot, 'retry uses refreshed CAS baseline');
  assert.deepEqual(recovered.projects.pB, seed().projects.pB);
  assert.deepEqual(recovered.estimates.eB, seed().estimates.eB);
  assert.deepEqual(await page.evaluate(() => window.__fixtureEvents || []), ['onSaved']);
  await page.screenshot({ path: `${OUT}/case2-recovered-v3.png` });
  await ctx.close();
  return { savedSnapshot, counters: recovered.counters, events: recovered.events };
});

await S('2b old Builder acknowledgment does not clear returned draft recovery', async () => {
  await ctl({ reset: true, toggles: { deferBuilder: true } });
  const { ctx, page } = await newCasePage('2b');
  await page.goto(`${ORIGIN}/FoundationEstimator?id=pA&estimateId=eA`);
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'));
  await nameInput(page).fill('Saved A');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const pending = await waitState(s => s.deferred.includes('builder') && s.counters.builderSync === 1);
  const firstVersion = pending.projects.pA.updated_date;
  await page.locator('#nav-b').click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project B'));
  await page.locator('#nav-a').click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Saved A'));
  await nameInput(page).fill('Newer A draft');
  await ctl({ release: 'builder', toggles: { deferBuilder: false } });
  await requireReady(page);
  assert.equal(await nameInput(page).inputValue(), 'Newer A draft');
  assert.deepEqual(await page.evaluate(() => window.__fixtureEvents || []), []);
  assert.ok((await page.getByRole('status').innerText()).includes('still unacknowledged'), 'old acknowledgment does not clear recovery in a later visit');
  const afterOld = await getState();
  assert.deepEqual(afterOld.projects.pB, seed().projects.pB);
  assert.deepEqual(afterOld.estimates.eB, seed().estimates.eB);
  assert.equal(afterOld.builderAttempts[0].estimateId, 'eA');
  assert.equal(afterOld.builderAttempts[0].projectId, 'pA');
  assert.equal(afterOld.builderAttempts[0].updated_date, firstVersion);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const recovered = await waitState(s => s.counters.builderSync === 2 && s.events.some(e => e.type === 'onSaved'));
  await requireReady(page);
  assert.equal(await page.getByRole('status').count(), 0, 'only the current acknowledgment clears recovery');
  assert.equal(recovered.projects.pA.project_name, 'Newer A draft');
  assert.notEqual(recovered.projects.pA.updated_date, firstVersion);
  assert.equal(recovered.estimates.eA.line_items[0].updated_date_snapshot, recovered.projects.pA.updated_date);
  assert.equal(recovered.builderAttempts[1].updated_date, recovered.projects.pA.updated_date);
  assert.deepEqual(await page.evaluate(() => window.__fixtureEvents || []), ['onSaved']);
  assert.ok(page.url().includes('id=pA'));
  assert.equal(await page.getByRole('button', { name: 'Reload saved project', exact: true }).count(), 0);
  await page.screenshot({ path: `${OUT}/case2b-current-ack-v3.png` });
  await ctx.close();
  return { firstVersion, finalVersion: recovered.projects.pA.updated_date };
});

// ---- Case 3: copy success, single create, remapped ids, navigate to copy ----
await S('3 copy success: one create, remapped ids, no receipt, nav to copy', async () => {
  await ctl({ reset: true });
  await ctl({ setProject: {
    id: 'pA',
    items: [{ id: 'i0', description: 'Fnd A', component_id: 'ia' }],
    walls: [{ id: 'w0', component_id: 'wa', shape: { points: [{ x: 0, z: 0 }, { x: 96, z: 0 }], closed: false, segments: [{ component_id: 'sa', length: 96 }] } }],
    poles: [{ id: 'po0', component_id: 'pa', foundation_component_id: 'ia', signs: [{ component_id: 'sg' }] }],
    wall_caps: [{ component_id: 'ca', wall_component_id: 'wa', segment_component_id: 'sa' }],
    signage_cabinets: [{ component_id: 'cb', mount: 'pole', pole_component_id: 'pa' }],
    landscape: { beds: [{ plant: 'x' }] },
    ai_engineering_data: { note: 'a' },
    builder_sync_attempt: { key: 'receiptA', source_project_id: 'pA' },
  } });
  const original = (await getState()).projects.pA;
  const { ctx, page } = await newCasePage('3');
  await page.goto('http://127.0.0.1:5172/FoundationEstimator?id=pA&estimateId=eA');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'), null, { timeout: 15000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Save As Copy/.test(x.textContent)); b.click(); b.click(); }); // strict same-tick
  await page.waitForFunction(async () => (await fetch('/api/state').then(r => r.json())).counters.create >= 1, null, { timeout: 10000 });
  await page.waitForFunction(() => window.location.search.includes('id=copy'), null, { timeout: 10000 });
  const st = await getState();
  assert.equal(st.counters.create, 1, 'exactly one create');
  const copy = Object.values(st.copies)[0];
  assert.ok(copy.creation_request_key, 'idempotent key present');
  assert.equal(copy.builder_sync_attempt, undefined, 'receipt stripped');
  assert.equal(copy.status, 'draft');
  const componentIds = (record) => {
    if (!record || typeof record !== 'object') return [];
    return [...(typeof record.component_id === 'string' ? [record.component_id] : []), ...Object.values(record).flatMap(componentIds)];
  };
  const origIds = componentIds(original);
  const freshIds = componentIds(copy);
  assert.equal(freshIds.length, origIds.length, 'all component identities retained');
  assert.equal(new Set(freshIds).size, freshIds.length, 'copied component identities unique');
  assert.ok(freshIds.every(id => !origIds.includes(id)), 'all copied identities fresh, including nested signs/segments');
  assert.ok(copy.wall_caps[0].wall_component_id === copy.walls[0].component_id, 'cap ref remapped');
  assert.equal(copy.wall_caps[0].segment_component_id, copy.walls[0].shape.segments[0].component_id);
  assert.equal(copy.poles[0].foundation_component_id, copy.items[0].component_id);
  assert.ok(copy.signage_cabinets[0].pole_component_id === copy.poles[0].component_id, 'cabinet->pole remapped');
  assert.equal(copy.project_name, 'Project A (Copy)');
  assert.deepEqual(st.projects.pA, original, 'whole original A unchanged');
  assert.deepEqual(copy.landscape, original.landscape);
  assert.deepEqual(copy.ai_engineering_data, original.ai_engineering_data);
  await requireReady(page);
  await page.screenshot({ path: `${OUT}/case3-copy.png` });
  await ctx.close();
  return { copyId: copy.id, counters: st.counters };
});

// ---- Case 4: copy failure, retry same key+data; lost-reply reconcile ----
await S('4 copy fail: alert, no record, URL same, retry same key+data', async () => {
  await ctl({ reset: true, toggles: { createFail: true } });
  const { ctx, page } = await newCasePage('4');
  await page.goto('http://127.0.0.1:5172/FoundationEstimator?id=pA&estimateId=eA');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'), null, { timeout: 15000 });
  await toolbarBtn(page, 'Save As Copy').click();
  await page.waitForFunction(async () => (await fetch('/api/state').then(r => r.json())).counters.create >= 1, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  let st = await getState();
  assert.equal(st.counters.create, 1);
  assert.equal(Object.keys(st.copies).length, 0, 'no record created');
  assert.ok(page.url().includes('id=pA'), 'URL unchanged');
  await savingFalse(page);
  assert.ok((page.__dlgs || []).length >= 1 || (await page.locator('[role=alert]').count()) >= 1, 'copy failure alert visible');
  // retry succeeds: same key + deep-equal data, single new record
  await ctl({ toggles: { createFail: false } });
  await page.evaluate(() => { window.__createInvoked = 0; const b = [...document.querySelectorAll('button')].find(x => /Save As Copy/.test(x.textContent)); b.click(); });
  await page.waitForTimeout(1200);
  const dbg = await page.evaluate(() => ({ invoked: window.__createInvoked, alertTxt: document.querySelector('[role=alert]')?.textContent || null }));
  await page.waitForFunction(async () => (await fetch('/api/state').then(r => r.json())).counters.create >= 2, null, { timeout: 10000 }).catch(e => { throw new Error('retry create never fired: ' + JSON.stringify(dbg) + ' err=' + e.message.slice(0, 80)); });
  st = await getState();
  const keys = Object.values(st.copies).map(c => c.creation_request_key);
  assert.equal(keys.length, 1);
  assert.equal(st.counters.create, 2);
  assert.deepEqual(st.createAttempts[1], st.createAttempts[0], 'retry retains exact key and snapshot');
  assert.deepEqual(st.projects.pA, seed().projects.pA, 'retry leaves original unchanged');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('id')?.startsWith('copy'));
  await requireReady(page);
  await ctx.close();
  return { retryKey: keys[0] };
});

await S('4b lost reply with persisted row: reconcile, no duplicate', async () => {
  await ctl({ reset: true, toggles: { createLostReply: true } });
  const { ctx, page } = await newCasePage('4b');
  await page.goto('http://127.0.0.1:5172/FoundationEstimator?id=pA&estimateId=eA');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'), null, { timeout: 15000 });
  await toolbarBtn(page, 'Save As Copy').click();
  // real helper's 700ms verify grace: poll until copy resolves (navigate or reconcile)
  await page.waitForFunction(async () => {
    const s = await fetch('/api/state').then(r => r.json());
    return Object.keys(s.copies).length >= 1;
  }, null, { timeout: 15000 });
  await page.waitForFunction(() => new URLSearchParams(location.search).get('id')?.startsWith('copy'));
  await requireReady(page);
  const st = await getState();
  const copyIds = Object.keys(st.copies);
  assert.equal(copyIds.length, 1, 'exactly one reconciled row');
  assert.equal(st.counters.create, 1, 'lost reply converges without a second create');
  assert.ok(st.counters.filter >= 2, 'post-create recovery lookup exercised');
  await ctx.close();
  return { reconciled: copyIds[0], creates: st.counters.create, filters: st.counters.filter };
});

// ---- Case 5: pending copy resolves after route B ----
await S('5 old copy completes after route B: no stale nav, B untouched', async () => {
  await ctl({ reset: true, toggles: { deferCreate: true } });
  const { ctx, page } = await newCasePage('5');
  await page.goto('http://127.0.0.1:5172/FoundationEstimator?id=pA&estimateId=eA');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project A'), null, { timeout: 15000 });
  await toolbarBtn(page, 'Save As Copy').click();
  await page.waitForFunction(async () => (await fetch('/api/state').then(r => r.json())).counters.create >= 1, null, { timeout: 10000 });
  await page.locator('#nav-b').click();
  await page.waitForFunction(() => window.location.search.includes('id=pB'));
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Project B'), null, { timeout: 15000 });
  await ctl({ release: 'create' });
  await page.waitForTimeout(600);
  const st = await getState();
  const copyIds = Object.keys(st.copies);
  assert.equal(copyIds.length, 1, 'orphaned synthetic copy recorded');
  assert.ok(page.url().includes('id=pB'), 'no stale navigate to copy');
  assert.equal(st.projects.pB.project_name, 'Project B');
  await savingFalse(page);
  await page.screenshot({ path: `${OUT}/case5-stale-copy.png` });
  await ctx.close();
  return { orphanCopy: copyIds[0], url: page.url() };
});

fs.writeFileSync(`${OUT}/results-v3.json`, JSON.stringify({ synthetic: true, note: 'no SDK; fake entity/Builder boundary only', results, telemetry }, null, 1));
await browser.close();
server.close();
const fails = results.filter(r => r.ok === false);
console.log(`route-fixture cases=${results.length} failed=${fails.length}`);
results.forEach(r => console.log(r.ok === false ? 'FAIL' : 'ok', r.case));
process.exit(fails.length ? 1 : 0);
