// Phase-B2 real-page fixture: candidate FoundationEstimator (grafted page +
// proposal panel + session) with a synthetic /api backend. The page's REAL
// commit/save path is exercised end-to-end: start proposal → author design →
// preview → acknowledge → accept → Save & Exit → CAS update-many payload
// carries the accepted version-2 fields.
import esbuild from "esbuild";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const TREE = path.join(DIR, "candidate-tree-src");
const PORT = 5174;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KEEP = process.argv.includes("--keep-server");
const VIEWPORT = process.argv.includes("--mobile") ? { width: 390, height: 844 } : { width: 1280, height: 900 };

const STUBS = {
  "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
  "@/components/ui/tabs": `export const Tabs=(p)=><div {...p}>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
  "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=(p)=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
  "@/components/ui/dialog": `export const Dialog=(p)=>p.open?<div data-dialog="true">{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;`,
  "@/components/ui/button": `export const Button=(p)=><button {...p}>{p.children}</button>;`,
  "@/components/ui/badge": `export const Badge=(p)=><span>{p.children}</span>;`,
  "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
  "@/components/ui/switch": `export const Switch=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>;`,
  "@/components/ui/checkbox": `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>;`,
  "@/components/ui/dropdown-menu": `export const DropdownMenu=(p)=><div>{p.children}</div>;export const DropdownMenuTrigger=(p)=><button type="button">{p.children}</button>;export const DropdownMenuContent=(p)=><div>{p.children}</div>;export const DropdownMenuItem=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;export const DropdownMenuSeparator=()=>null;export const DropdownMenuLabel=(p)=><div>{p.children}</div>;export const DropdownMenuGroup=(p)=><div>{p.children}</div>;`,
  "@/components/ui/accordion": `export const Accordion=(p)=><div>{p.children}</div>;export const AccordionItem=(p)=><div>{p.children}</div>;export const AccordionTrigger=(p)=><div>{p.children}</div>;export const AccordionContent=(p)=><div>{p.children}</div>;`,
  "@/components/auth/EmailGate": `export const useAuth=()=>({currentUser:{id:"owner-1",email:"fixture@example.com"},isLoading:false});export const AuthProvider=({children})=>children;`,
  "@/api/base44Client": `export const base44={};`,
  "three": `export const Scene=class{};export const PerspectiveCamera=class{};export const WebGLRenderer=class{constructor(){}setSize(){}render(){}dispose(){}};export const Group=class{add(){}};export const BoxGeometry=class{};export const CylinderGeometry=class{};export const MeshStandardMaterial=class{};export const Mesh=class{constructor(){this.position={set(){}};this.rotation={set(){}};}};export const AmbientLight=class{};export const DirectionalLight=class{constructor(){this.position={set(){}}}};export const Color=class{};`,
  "@/components/markup/savedCustomerPricing": `export async function calculateSavedCustomerPricing(){return{applied:false,fixture:true};}`,
  "@/components/markup/CustomerPricingTab": `export default ()=><div data-stub="CustomerPricingTab"/>;`,
  "@/components/markup/projectCategorizer": `export function categorizeFoundationProject(){return{};}`,
  "@/components/estimator/builder/builderService": `const FIELDS=["total_concrete_cost","total_rebar_cost","total_excavation_cost","total_forming_materials_cost","total_labor_cost","total_wall_cost","total_pole_cost","total_pole_painting_cost","total_equipment_cost","total_wall_cap_cost","total_signage_cabinet_cost","total_landscape_cost"];
export const recordBuilderSave=async a=>{const r=await fetch('/api/builder-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({estimateId:a.estimateId,projectId:a.sourceProject.id,updated_date:a.sourceProject.updated_date,liveTotal:a.liveTotal})});const d=await r.json();if(!r.ok)throw new Error(d.error||'builder sync failed');return d.line;};
export const foundationRecordSavedTotal=(record)=>{if(!record||typeof record!=="object")return null;if(!FIELDS.some(k=>Number.isFinite(Number(record[k]))))return Number.isFinite(Number(record.grand_total))?Number(record.grand_total):null;return FIELDS.reduce((s,k)=>s+(Number(record[k])||0),0);};
export const newCreationRequestKey=(p)=>p+'-'+Date.now()+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);`,
  "@/components/estimator/idempotentEntityCreate": `export const newCreationRequestKey=(p)=>p+'-'+Date.now()+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);export const ensureIdempotentEntityCreate=async o=>o.create();`,
  "@/components/estimator/loadAllEntityRows": `export async function loadAllEntityRows({entity,limit=2000}){return entity.list?entity.list({},limit):[];}export const primeEntityRowsCache=()=>{};`,
  "@/components/estimator/estimateMutationGuard": `export async function assertEstimateProductMutationAllowed(e){if(e&&e.protected)throw new Error('Estimate is protected.');}`,
  "@/components/staff/staffEntities": `const J=async r0=>{const r=await r0;const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;};
export const staffEntities={
  FoundationProject:{get:id=>J(fetch('/api/project/'+encodeURIComponent(id))),update:async()=>({}),updateMany:async(q,u)=>{const d=await J(fetch('/api/update-many',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'project',query:q,update:u})}));return d.result||d;},list:async()=>[]},
  AllInOneEstimate:{get:id=>J(fetch('/api/estimate/'+encodeURIComponent(id))),list:async()=>[]},
  FoundationInventory:{list:async()=>J(fetch('/api/inventory'))},
  LaborServiceInventory:{list:async()=>J(fetch('/api/concrete-services'))},
  Settings:{list:async()=>J(fetch('/api/settings'))},
};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=()=>({});`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share-fixture';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
  "@/components/estimator/foundation/FoundationRatesPanel": `export default ()=><div data-stub="FoundationRatesPanel"/>`,
  "@/components/estimator/foundation/FoundationEquipmentTab": `export default ()=><div data-stub="FoundationEquipmentTab"/>`,
  "@/components/estimator/foundation/FoundationTotals": `export default (p)=><div data-stub="FoundationTotals" data-total={p.sectionTotal||0}>sectionTotal:{p.sectionTotal}</div>;`,
  "@/components/estimator/foundation/ConcreteDeliveryPanel": `export default ()=><div data-stub="ConcreteDeliveryPanel"/>`,
  "@/components/estimator/foundation/FoundationBOM": `export default ()=><div data-stub="FoundationBOM"/>`,
  "@/components/estimator/foundation/FoundationWallsPanel": `export default ()=><div data-stub="FoundationWallsPanel"/>`,
  "@/components/estimator/foundation/FoundationWallCapsPanel": `export default ()=><div data-stub="FoundationWallCapsPanel"/>`,
  "@/components/estimator/foundation/FoundationPolesPanel": `export default ()=><div data-stub="FoundationPolesPanel"/>`,
  "@/components/estimator/foundation/FoundationSectionBanner": `export default ()=><div data-stub="FoundationSectionBanner"/>`,
  "@/components/estimator/foundation/AiEngineeringAssistant": `export default ()=><div data-stub="AiEngineeringAssistant"/>`,
  "@/components/estimator/foundation/Foundation3DPreview": `export default ()=><div data-stub="Foundation3DPreview"/>`,
  "@/components/estimator/foundation/FoundationTemplateDialog": `export default ()=>null;`,
  "@/components/estimator/foundation/FoundationLayoutCanvas": `export default ()=><div data-stub="FoundationLayoutCanvas"/>`,
  "@/components/estimator/foundation/SignageCabinetsPanel": `export default ()=><div data-stub="SignageCabinetsPanel"/>`,
  "@/components/estimator/foundation/LandscapeDesigner": `export default ()=><div data-stub="LandscapeDesigner"/>`,
  "@/components/estimator/foundation/CustomerPricingPanel": `export default ()=><div data-stub="CustomerPricingPanel"/>`,
  "@/components/estimator/foundation/landscapeMaterials": `export const landscapeSummary=()=>({total:0,items:[]});export const landscapeIssues=()=>[];export const landscapeInputIssues=()=>[];export const landscapeCellIssues=()=>[];export const normalizeLandscape=()=>({cell_size_inches:12,cells:{}});`,
};

// Real fixture data — a legacy version-1 item on an acknowledged source.
const legacyItem = () => ({
  component_id: "F-1", foundation_type: "spread_foot", quantity: 2,
  length_inches: 48, width_inches: 48, depth_inches: 18,
  selected_concrete_id: "bag-1",
  include_rebar: true, rebar_size: "#4", rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
  include_forming: false, include_finishing: false, is_new_sign_location: true,
  excavation_method: "hand_dig",
  // acknowledged saved amounts (provenance for the proposal's saved rows)
  rebar_cost: 360.6, item_total_cost: 1173.93, rebar_feet: 130, rebar_weight_lbs: 86.84,
});
const inventory = [
  { id: "rebar-4", material_type: "rebar", material_name: "#4 rebar", rebar_size: "#4", rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, cost_per_unit: 0.42, unit: "ft", show_in_foundation: true },
  { id: "bag-1", material_type: "bagged_concrete", material_name: "80lb bag", cost_per_unit: 6.5, unit: "bag", show_in_foundation: true },
];
const settingsRows = [
  { setting_name: "concrete_cost_per_yard", setting_value: "180" },
];
const state = {
  project: { id: "pA", updated_date: "v1", project_name: "PhaseB2 Fixture", items: [legacyItem()], signage_cabinets: [], walls: [], wall_caps: [], poles: [], selected_equipment: [], landscape: null, excavation_method: "hand_dig" },
  estimate: { id: "eA", updated_date: "e1", line_items: [{ module_key: "foundation", project_id: "pA", estimate_id: "eA", updated_date_snapshot: "v1" }] },
  counters: { projectGet: 0, updateMany: 0, builderSync: 0 },
  updatePayloads: [],
};
let vSeq = 2;

const ENTRY = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FoundationEstimator from '@/pages/FoundationEstimator.jsx';
const wrap=(el)=><div><div style={{background:'#7f1d1d',color:'#fff',padding:'4px 8px',font:'bold 12px sans-serif'}}>PHASE-B2 SYNTHETIC FIXTURE - CANDIDATE TREE</div>{el}</div>;
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route path="/" element={wrap(<FoundationEstimator/>)}/>
  <Route path="/FoundationEstimator" element={wrap(<FoundationEstimator onSaved={()=>{window.__onSaved=(window.__onSaved||0)+1;fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'onSaved'})});}}/>)}/>
  <Route path="*" element={<div data-testid="exit-route">Back to synthetic estimate</div>}/>
</Routes></BrowserRouter>);`;

const bundle = async () => {
  const probe = (base) => {
    for (const c of [base + ".jsx", base + ".js", base + "/index.jsx", base + "/index.js", base]) {
      try { if (fs.statSync(c).isFile()) return c; } catch { }
    }
    return null;
  };
  const plugin = {
    name: "phaseb2-stubs",
    setup(b) {
      b.onResolve({ filter: /^@\/|^\.\.\// }, (a) => {
        const stub = STUBS[a.path];
        if (stub) return { path: a.path, namespace: "stub", pluginData: { contents: stub } };
        if (a.path.startsWith("@/")) {
          const file = probe(path.join(TREE, a.path.slice(2)));
          if (file) return { path: file };
          // Fall back to remote-src layout: TREE mirrors remote-src/src
          const alt = probe(path.join(DIR, "remote-src/src", a.path.slice(2)));
          return alt ? { path: alt } : undefined;
        }
        return undefined;
      });
      b.onResolve({ filter: /^three$/ }, (a) => ({ path: "three", namespace: "stub", pluginData: { contents: STUBS["three"] } }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: a.pluginData.contents, loader: "jsx", resolveDir: ROOT }));
    },
  };
  const r = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: "jsx", sourcefile: "fixture-entry.jsx" },
    bundle: true, format: "iife", platform: "browser", write: false, metafile: true,
    plugins: [plugin], loader: { ".jsx": "jsx", ".js": "jsx" }, jsx: "automatic",
  });
  const inputs = Object.keys(r.metafile.inputs);
  const bad = inputs.filter(i => i.includes("@base44") || i.includes("base44Client") && !i.includes("stub"));
  return { code: r.outputFiles[0].text, inputs, bad };
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, ORIGIN);
  const json = (o, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const body = await new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); });
  if (u.pathname === "/api/state") return json(state);
  if (u.pathname === "/api/event") return json({ ok: true });
  if (u.pathname.startsWith("/api/project/")) { state.counters.projectGet++; return json(state.project); }
  if (u.pathname.startsWith("/api/estimate/")) return json(state.estimate);
  if (u.pathname === "/api/inventory") return json(inventory);
  if (u.pathname === "/api/concrete-services") return json([]);
  if (u.pathname === "/api/settings") return json(settingsRows);
  if (u.pathname === "/api/update-many") {
    const { query, update } = JSON.parse(body);
    state.counters.updateMany++;
    state.updatePayloads.push({ query, update });
    if (state.project.id === query.id && state.project.updated_date === query.updated_date) {
      state.project = { ...state.project, ...(update.$set || {}), id: query.id, updated_date: "v" + vSeq++ };
      return json({ result: { updated: 1 } });
    }
    return json({ result: { updated: 0 } });
  }
  if (u.pathname === "/api/builder-sync") {
    state.counters.builderSync++;
    const b = JSON.parse(body);
    const line = state.estimate.line_items.find(l => l.module_key === "foundation" && l.project_id === b.projectId);
    if (line) line.updated_date_snapshot = b.updated_date;
    return json({ line: { module_key: "foundation", project_id: b.projectId, estimate_id: b.estimateId, updated_date_snapshot: b.updated_date } });
  }
  if (!u.pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>phaseb2</title></head><body><div id="root"></div><script>${fs.readFileSync(path.join(DIR, "phaseb2-bundle.js"), "utf8")}</script></body></html>`);
  }
  res.writeHead(404); res.end("nf");
});

const results = [];
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (e) { results.push({ name, ok: false, error: String(e.message || e) }); console.error("FAIL", name, e.message); }
};
const acheck = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (e) { results.push({ name, ok: false, error: String(e.message || e) }); console.error("FAIL", name, e.message); }
};

const built = await bundle();
if (built.bad.length) { console.error("FORBIDDEN inputs:", built.bad); process.exit(1); }
fs.writeFileSync(path.join(DIR, "phaseb2-bundle.js"), built.code);
fs.writeFileSync(path.join(DIR, "phaseb2-bundle-inputs.json"), JSON.stringify(built.inputs, null, 2));
await new Promise(r => server.listen(PORT, "127.0.0.1", r));
console.log(`fixture ${ORIGIN} viewport=${VIEWPORT.width}x${VIEWPORT.height}`);

if (!KEEP) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const telemetry = { consoleErrors: [], pageErrors: [], foreign: [] };
  page.on("console", m => { if (m.type() === "error") telemetry.consoleErrors.push(m.text()); });
  page.on("pageerror", e => telemetry.pageErrors.push(String(e)));
  page.on("request", rq => { try { if (new URL(rq.url()).origin !== ORIGIN) telemetry.foreign.push(rq.url()); } catch { telemetry.foreign.push(rq.url()); } });
  await page.route("**/*", r => { if (new URL(r.request().url()).origin === ORIGIN) r.continue(); else r.abort(); });

  await page.goto(`${ORIGIN}/FoundationEstimator?id=pA&estimateId=eA`, { waitUntil: "networkidle" });

  await acheck("page loads foundation card and proposal panel", async () => {
    await page.waitForSelector('text=Reinforcement proposal', { timeout: 15000 });
    await page.waitForSelector('button:has-text("Start Proposal")', { timeout: 5000 });
    assert.ok(await page.locator('text=Legacy').count() >= 1, "legacy version label missing");
  });

  await acheck("start proposal commits a raw draft (legacy fields untouched)", async () => {
    await page.click('button:has-text("Start Proposal")');
    await page.waitForSelector('input[aria-label="Bar diameter (in)"]', { timeout: 5000 });
    const st = await (await fetch(`${ORIGIN}/api/state`)).json();
    assert.ok(st.project.items[0].reinforcement_proposal === undefined, "draft must NOT be server-persisted before save");
  });

  await acheck("author explicit geometry: diameter, covers, supports-off+reason, single mat", async () => {
    await page.fill('input[aria-label="Bar diameter (in)"]', "0.5");
    await page.fill('input[aria-label="Cover side (in)"]', "3");
    await page.fill('input[aria-label="Cover top (in)"]', "3");
    await page.fill('input[aria-label="Cover bottom (in)"]', "3");
    await page.selectOption('select[aria-label="Supports"]', "off");
    await page.waitForSelector('input[aria-label="Reason"]', { timeout: 3000 });
    await page.locator('input[aria-label="Reason"]').first().fill("Chairs and bolsters supplied by installer");
    await page.click('button[data-add="mats"]');
    await page.waitForSelector('input[aria-label="Bearing elevation (in)"]', { timeout: 3000 });
    await page.fill('input[aria-label="Bearing elevation (in)"]', "3");
    await page.fill('input[aria-label="Max spacing X (in)"]', "12");
    await page.fill('input[aria-label="Max spacing Z (in)"]', "12");
  });

  await acheck("catalog material basis picks the rebar row", async () => {
    await page.click('button:has-text("Catalog")');
    await page.waitForSelector('select[aria-label="Rebar item"]', { timeout: 3000 });
    await page.selectOption('select[aria-label="Rebar item"]', "rebar-4");
  });

  await acheck("refresh preview shows quantities + costs + required acknowledgments", async () => {
    await page.click('button:has-text("Refresh Preview")');
    await page.waitForSelector('text=Preview', { timeout: 8000 });
    await page.waitForSelector('text=Physical steel', { timeout: 5000 });
    assert.ok(await page.locator('text=Section delta').count() >= 1, "section delta row missing");
    assert.ok(await page.locator('text=preliminary only').count() >= 1, "preliminary acknowledgment missing");
    const acceptDisabled = await page.locator('button:has-text("Accept Proposal")').isDisabled();
    assert.equal(acceptDisabled, true, "accept must be disabled before acknowledgments");
  });

  await acheck("acknowledge preliminary + warnings, re-preview, accept becomes enabled", async () => {
    const boxes = page.locator('fieldset input[type="checkbox"]');
    const n = await boxes.count();
    assert.ok(n >= 1, "no acknowledgment checkboxes");
    for (let i = 0; i < n; i++) {
      const b = boxes.nth(i);
      if (!(await b.isChecked())) await b.check();
    }
    await page.click('button:has-text("Refresh Preview")');
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll("button")].find(x => x.textContent.includes("Accept Proposal"));
      return btn && !btn.disabled;
    }, { timeout: 10000 });
  });

  await acheck("accept marks item version-2 via the page commit path", async () => {
    await page.click('button:has-text("Accept Proposal")');
    await page.waitForSelector('text=Version 2 reinforcement uses the accepted design', { timeout: 8000 });
    await page.waitForSelector('text=Start Proposal', { timeout: 8000 }); // draft cleared, panel resets
  });

  await acheck("save writes version-2 fields through CAS update-many", async () => {
    await page.click('button:has-text("Save & Exit")');
    await page.waitForFunction(() => (window.__onSaved || 0) >= 1, { timeout: 15000 });
    const st = await (await fetch(`${ORIGIN}/api/state`)).json();
    assert.ok(st.counters.updateMany >= 1, "no CAS update-many call");
    const item = st.project.items[0];
    assert.equal(item.reinforcement_calculation_version, 2, "saved item not version 2");
    assert.ok(item.reinforcement_design?.version === 2, "saved design missing");
    assert.ok(item.reinforcement_material?.kind === "catalog", "saved material missing");
    assert.ok(item.reinforcement_cost_snapshot?.calculation_version === 2, "cost snapshot missing");
    assert.equal(item.reinforcement_cost_snapshot?.engineering_approved, false);
    assert.ok(item.reinforcement_acceptance?.proposal_id, "acceptance provenance missing");
    assert.equal(item.reinforcement_acceptance?.engineering_approved, false);
    assert.equal(item.reinforcement_proposal, undefined, "draft must be cleared on save");
    // CAS anchor: query carried the acknowledged updated_date.
    const last = st.updatePayloads[st.updatePayloads.length - 1];
    assert.equal(last.query.updated_date, "v1", "CAS anchor must be the acknowledged version");
  });

  const failures = results.filter(r => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} browser checks passed at ${VIEWPORT.width}px`);
  if (telemetry.pageErrors.length) console.log("pageErrors:", telemetry.pageErrors.slice(0, 3));
  if (telemetry.foreign.length) console.log("foreignRequests:", telemetry.foreign.slice(0, 3));
  fs.writeFileSync(path.join(DIR, `browser-results-${VIEWPORT.width}.json`), JSON.stringify({ results, telemetry }, null, 2));
  await browser.close();
  server.close();
  process.exit(failures.length ? 1 : 0);
}
console.log("fixture server running — press Ctrl+C to stop");
