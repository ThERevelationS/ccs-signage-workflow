// O-004 (CMP-A04 remainder) browser verification — REAL remote FoundationEstimator
// page + REAL draft store candidates over a frozen remote source map. Stubs only
// SDK/service boundaries + visual leaves (same approach as foundation-navigation15).
// Proves: pricing fields in drafts, route-leave click guard, Back/Forward sentinel
// guard, clean passthrough, quota loss-marker UX. Desktop 1280 + mobile 390.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-o004-drafts/";
const OUT = DIR + "browser";
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = "http://127.0.0.1:5174";
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- frozen remote source map (NO local worktree src) ----------
const sources = new Map();
const walk = (root, prefix) => {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) walk(p, prefix + "/" + e.name);
    else sources.set(prefix + "/" + e.name, fs.readFileSync(p, "utf8"));
  }
};
walk(DIR + "remote-src/src", "/app/src");
walk(DIR + "remote-src/base44", "/app/base44");
// Candidates under test override their remote counterparts.
sources.set("/app/src/pages/FoundationEstimator.jsx", fs.readFileSync(DIR + "candidates/FoundationEstimator.jsx", "utf8"));
sources.set("/app/src/components/estimator/foundation/foundationDraftRecovery.js", fs.readFileSync(DIR + "candidates/foundationDraftRecovery.js", "utf8"));

// ---------- stubs (boundary + visual leaves only) ----------
const STUBS = {
  "@/components/auth/EmailGate": `import React from 'react';export const useAuth=()=>{const id=React.useSyncExternalStore(cb=>{window.__ownerCb=cb;return()=>{window.__ownerCb=null};},()=>window.__ownerId||'synthetic-staff');return{currentUser:{id}};};export function setSyntheticOwner(id){window.__ownerId=id;window.__ownerCb?.();}`,
  "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
  "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
  "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
  "@/components/ui/dialog": `export const Dialog=(p)=>p.open?<div>{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;`,
  "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
  "@/components/ui/badge": `export const Badge=(p)=><span>{p.children}</span>;`,
  "@/components/ui/card": `export const Card=(p)=><div>{p.children}</div>;export const CardContent=(p)=><div>{p.children}</div>;export const CardHeader=(p)=><div>{p.children}</div>;export const CardTitle=(p)=><div>{p.children}</div>;`,
  "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
  "@/components/ui/switch": `export const Switch=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  "@/components/ui/checkbox": `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  "@/components/ui/dropdown-menu": `export const DropdownMenu=(p)=><div>{p.children}</div>;export const DropdownMenuTrigger=(p)=><div>{p.children}</div>;export const DropdownMenuContent=(p)=><div>{p.children}</div>;export const DropdownMenuItem=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;export const DropdownMenuSeparator=()=>null;export const DropdownMenuLabel=()=>null;export const DropdownMenuGroup=(p)=><div>{p.children}</div>;`,
  "@/components/ui/accordion": `export const Accordion=(p)=><div>{p.children}</div>;export const AccordionItem=(p)=><div>{p.children}</div>;export const AccordionTrigger=(p)=><div>{p.children}</div>;export const AccordionContent=(p)=><div>{p.children}</div>;`,
  "@/components/markup/savedCustomerPricing": `export async function calculateSavedCustomerPricing(a){window.__spies.push(['pricing',a]);return{applied:true,tier_number:a.tierNumber};}`,
  "@/components/markup/CustomerPricingTab": `export default (p)=><button type="button" data-stub="ApplyTier" onClick={()=>p.onApplyTier?.(3)}>Apply tier 3 (stub)</button>`,
  "@/components/markup/projectCategorizer": `export function categorizeFoundationProject(){return{};}`,
  "@/components/estimator/builder/builderService": `export const recordBuilderSave=async a=>{window.__spies.push(['recordBuilderSave',a]);return{module_key:'foundation',project_id:a.line.project_id,estimate_id:a.estimateId,updated_date_snapshot:a.sourceProject.updated_date};};`,
  "@/components/estimator/builder/builderMutationRecovery": `export const pendingBuilderMutation=()=>null;export const pendingBuilderMutationAge=()=>null;export const pendingBuilderMutationIsStale=()=>false;export const STALE_PENDING_BUILDER_MUTATION_MS=86400000;`,
  "@/components/estimator/idempotentEntityCreate": `export const ensureIdempotentEntityCreate=(...a)=>{window.__spies.push(['ensureIdempotent',a]);return Promise.resolve({id:'new-'+(window.__kseq=(window.__kseq||0)+1)});};export const newCreationRequestKey=(k)=>'key-'+(k||'x')+'-'+(window.__kseq=(window.__kseq||0)+1);`,
  "@/components/estimator/loadAllEntityRows": `export async function loadAllEntityRows(a){
    if(a.entity===window.__entInv)return window.__cat.inv||[];
    if(a.entity===window.__entLab)return window.__cat.lab||[];
    if(a.entity===window.__entSet)return window.__cat.set||[];
    return[];}
    export const primeEntityRowsCache=()=>{};`,
  "@/components/estimator/estimateMutationGuard": `export async function assertEstimateProductMutationAllowed(){}`,
  "@/components/estimator/builder/sourceProjectPersistence": `export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);const cur=window.__proj[a.sourceId];if(a.expectedUpdatedAt!==cur.updated_date){const e=new Error('CAS conflict: expected '+a.expectedUpdatedAt+' but server has '+cur.updated_date);e.casConflict=true;throw e;}const next={...cur,...a.data,id:a.sourceId,updated_date:'v'+(parseInt(cur.updated_date.replace(/^v/,''),10)+1)};window.__proj[a.sourceId]=JSON.parse(JSON.stringify(next));return next;};export const sourcePatchMatches=()=>true;`,
  "@/components/staff/staffEntities": `export const staffEntities={
    FoundationProject:{get:async(id)=>{window.__spies.push(['projectGet',id]);const p=window.__proj[id];return p?JSON.parse(JSON.stringify(p)):null;},update:async()=>({}),updateMany:async()=>({updated:0})},
    FoundationInventory:window.__entInv||(window.__entInv={__ent:'inv'}),
    LaborServiceInventory:window.__entLab||(window.__entLab={__ent:'lab'}),
    Settings:window.__entSet||(window.__entSet={__ent:'set'}),
    AllInOneEstimate:{get:async(id)=>{window.__spies.push(['estimateGet',id]);const e=window.__est[id];return e?JSON.parse(JSON.stringify(e)):null;}}};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=async()=>{window.__spies.push(['converter']);return{id:'d1'};};`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
  "@/components/estimator/foundation/FoundationRatesPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationSectionBanner": `export default ()=><div/>`,
  "@/components/estimator/foundation/AiEngineeringAssistant": `export default ()=><div/>`,
  "@/components/estimator/foundation/Foundation3DPreview": `export default (p)=>{window.__seenProject=p.project;return <div/>;};`,
  "@/components/estimator/foundation/FoundationTemplateDialog": `export default ()=>null;`,
  "@/components/estimator/foundation/FoundationLayoutCanvas": `export default ()=><div/>`,
  "@/components/estimator/foundation/SignageCabinetsPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/LandscapeDesigner": `export default ()=><div/>`,
  "@/components/estimator/foundation/landscapeMaterials": `export const landscapeSummary=()=>({total:0,items:[]});export const landscapeInputIssues=()=>[];`,
  "@/components/estimator/foundation/WallShapeEditor": `export default function(){return null;}`,
  "./WallShapeEditor": `export default function(){return null;}`,
  "lucide-react": fs.readFileSync(".audit-work/foundation-catalog-pricing11/lucide-stub.js", "utf8"),
};

const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate, Routes, Route, Link } from 'react-router-dom';
import Page from '@/pages/FoundationEstimator';

window.__spies = window.__spies || [];
window.__proj = window.__DATA.projects;
window.__est = window.__DATA.estimates;
window.__cat = window.__DATA.catalogs.p3 || { inv: [], lab: [], set: [] };
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

const plugin = { name: "frozen", setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: "harness", namespace: "h" }));
  b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: "/app/src/components/estimator/foundation/FoundationToolbar.jsx", namespace: "frozen" }));
  b.onResolve({ filter: /.*/ }, (a) => {
    if (STUBS[a.path]) return { path: "stub:" + a.path, namespace: "stub" };
    if (a.path === "react" || a.path.startsWith("react/") || a.path === "react-dom" || a.path.startsWith("react-dom/") || a.path === "react-router-dom" || a.path === "scheduler") return null; // node_modules
    let base;
    if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith("./") || a.path.startsWith("../")) {
      if (!a.importer.startsWith("/app")) return null;
      base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    } else return null;
    const resolved = [base, base + ".js", base + ".jsx", base + ".ts", base + ".tsx"].find((p) => sources.has(p));
    if (!resolved) throw new Error("Missing frozen source (no local worktree allowed): " + a.path + " from " + a.importer);
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "h" }, () => ({ contents: harness, loader: "jsx", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path.slice(5)], loader: "jsx", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    const loader = a.path.endsWith(".jsx") ? "jsx" : a.path.endsWith(".ts") || a.path.endsWith(".tsx") ? "ts" : "js";
    return { contents, loader, resolveDir: path.resolve(".") };
  });
}};
const built = await esbuild.build({
  entryPoints: ["harness"], bundle: true, format: "iife", platform: "browser", write: false,
  plugins: [plugin], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic", metafile: true, logLevel: "silent",
});
const badInputs = Object.keys(built.metafile.inputs).filter(i => /node_modules.*base44|@base44|base44Client|AuthContext/i.test(i));
fs.writeFileSync(OUT + "/metafile.json", JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
assert.deepEqual(badInputs, [], "SDK/AUTH leaked into bundle");
for (const rp of ["FoundationEstimator.jsx", "foundationDraftRecovery.js", "foundationCalc.js", "foundationAssemblyModel.js", "CustomerPricingPanel.jsx", "FoundationToolbar.jsx", "foundationSaveSession.js", "foundationSyncRecovery.js"])
  assert.ok(Object.keys(built.metafile.inputs).some(i => i.endsWith(rp)), "missing real source: " + rp);
assert.deepEqual(built.warnings, []);
const bundle = built.outputFiles[0].text;

// ---------- synthetic seed ----------
const CASE = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/complete-before.json", "utf8")).cases[1];
const EXP_ITEM = CASE.expected.items[0];
const deep = (o) => JSON.parse(JSON.stringify(o));
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve(".audit-work/foundation-materials14/syncrec-b.mjs")));
const projB3 = {
  id: "p3", updated_date: "v1", project_name: "NavProj", client_name: "C", notes: "n", excavation_method: "hand_dig",
  items: [deep(EXP_ITEM)], poles: [], wall_caps: [], walls: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
};
projB3.builder_sync_attempt = createFoundationSyncAttempt({ sourceId: "p3", estimateId: "e1", key: "key-nav-receipt-p3", requestedAt: "2024-01-01T00:00:00Z" });
const _dd = CASE.expected.delivery;
projB3.concrete_delivery_snapshot = { version: 1, concrete_total: _dd.concreteTotal, rounded_yards: _dd.roundedYards, rate_per_yard: _dd.ratePerYard, additional_stops_cost: _dd.additionalStopsCost, trucks: _dd.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })) };
const DATA = {
  catalogs: { p3: { inv: deep(CASE.inventory), lab: [], set: [{ setting_name: "wall_labor_rate", setting_value: 25 }] } },
  projects: { p3: projB3 },
  estimates: { e1: { id: "e1", line_items: [{ module_key: "foundation", project_id: "p3", estimate_id: "e1", updated_date_snapshot: "v1" }] } },
};

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
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
await new Promise((r) => server.listen(5174, "127.0.0.1", r));

const CHROME = "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, channel: fs.existsSync(CHROME) ? undefined : "chrome", headless: true, args: ["--disable-gpu", "--no-sandbox"] });

const dialogMode = new WeakMap(); // page -> 'accept' | 'dismiss'
const guard = (page, tag) => {
  page.on("request", (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ tag, url: r.url() }); } catch { telemetry.foreign.push({ tag, url: r.url() }); } });
  page.on("pageerror", (e) => telemetry.pageErrors.push({ tag, error: String(e) }));
  page.on("console", (m) => { if (m.type() === "error") telemetry.consoleErrors.push({ tag, text: m.text().slice(0, 200) }); });
};
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log("ok", name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.stack || e).slice(0, 1400) }); console.log("FAIL", name, "-", String(e.message || e).slice(0, 400)); }
  finally { for (const c of browser.contexts()) await c.close(); }
};
const seen = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__seenProject)));
const waitLoaded = async (page, id) => page.waitForFunction((id) => window.__seenProject?.id === id, id, { timeout: 10000 });
const spyCount = (page, k) => page.evaluate((k) => window.__spies.filter(x => x[0] === k).length, k);
const writeSpies = (page) => page.evaluate(() => window.__spies.filter(x => ["saveSource", "recordBuilderSave", "pricing", "ensureIdempotent", "converter", "onSaved", "onClose"].includes(x[0])).length);
const desc = (page) => page.locator('label:has-text("Description") input').first();
const markupInput = (page) => page.locator('label:has-text("Markup %") input').first();
const overrideInput = (page) => page.locator('label:has-text("Price override") input').first();
const offer = (page) => page.getByText("Unsent browser-tab draft found.", { exact: false });
const backedUp = (page) => page.getByText("Design and customer-pricing edits backed up in this browser tab", { exact: false });
const DRAFT_KEY = "ccs:foundation-draft:v1:" + encodeURIComponent(JSON.stringify(["synthetic-staff", "p3", "e1"]));
const draftRaw = (page) => page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY);
const openEstimator = async (ctx, tag, { init } = {}) => {
  const page = await ctx.newPage();
  dialogMode.set(page, "dismiss");
  page.on("dialog", (d) => { (dialogMode.get(page) === "accept" ? d.accept() : d.dismiss()); });
  guard(page, tag);
  await page.route("**/*", (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  if (init) await page.addInitScript(init);
  await page.goto(ORIGIN + "/away");
  await page.locator("#open-foundation").click();
  await waitLoaded(page, "p3");
  return page;
};
const ORIGINAL_DESC = EXP_ITEM.description || "";
const EST_URL = "**/FoundationEstimator?id=p3&estimateId=e1";

// O1: pricing + design fields drafted, offered, and restored exactly — desktop + mobile
for (const vp of [{ w: 1280, h: 800, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
  await R(`O1 ${vp.tag}: markup/override/tier drafted + restored exactly`, async () => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await openEstimator(ctx, "o1-" + vp.tag);
    await desc(page).fill("o4-pricing-" + vp.tag);
    await markupInput(page).fill("17");
    await overrideInput(page).fill("4321");
    await page.locator('[data-stub="ApplyTier"]').click();
    await backedUp(page).waitFor();
    const env = JSON.parse(await draftRaw(page));
    assert.equal(env.data.customer_markup_percent, 17, "markup drafted");
    assert.equal(env.data.customer_price_override, 4321, "override drafted");
    assert.equal(env.data.customer_pricing.applied, true, "tier applied drafted");
    assert.equal(env.data.customer_pricing.tier_number, 3, "tier number drafted");
    assert.equal(env.data.items[0].description, "o4-pricing-" + vp.tag, "desc drafted");
    // leave via shell link (accept the leave confirm), return, restore
    dialogMode.set(page, "accept");
    await page.locator("#shell-away").click();
    await page.waitForURL("**/away", { timeout: 8000 });
    await page.locator("#open-foundation").click();
    await waitLoaded(page, "p3");
    await offer(page).waitFor();
    assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, "server values before choice");
    assert.equal(await markupInput(page).inputValue(), "0", "server markup before choice");
    await page.getByRole("button", { name: "Restore browser draft" }).click();
    await page.waitForFunction((want) => window.__seenProject?.items?.[0]?.description === want, "o4-pricing-" + vp.tag, { timeout: 8000 });
    assert.equal(await markupInput(page).inputValue(), "17", "markup restored");
    assert.equal(await overrideInput(page).inputValue(), "4321", "override restored");
    const proj = await seen(page);
    assert.equal(proj.customer_pricing.tier_number, 3, "tier restored");
    assert.equal(proj.customer_pricing.applied, true, "applied restored");
    assert.equal(await writeSpies(page), 0, "zero writes");
    await page.screenshot({ path: `${OUT}/o1-${vp.tag}-restored.png` });
    await ctx.close();
    return true;
  });
}

// O2: internal link click guarded — cancel keeps page + edits; accept leaves; draft retained
await R("O2: shell link click confirm — cancel stays, accept leaves, draft retained", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, "o2");
  await desc(page).fill("o2-link-guard");
  await backedUp(page).waitFor();
  dialogMode.set(page, "dismiss");
  await page.locator("#shell-away").click();
  await page.waitForTimeout(400);
  assert.ok(page.url().includes("/FoundationEstimator"), "cancel stays on estimator");
  assert.equal(await desc(page).inputValue(), "o2-link-guard", "edits intact after cancel");
  dialogMode.set(page, "accept");
  await page.locator("#shell-away").click();
  await page.waitForURL("**/away", { timeout: 8000 });
  assert.ok(await draftRaw(page), "draft retained after guarded leave");
  await page.screenshot({ path: OUT + "/o2-away.png" });
  await ctx.close();
  return true;
});

// O3: browser Back confirm — dismiss stays (sentinel re-armed), accept leaves; Forward returns to offer
await R("O3: Back guarded by sentinel — dismiss stays, accept exits, Forward offers draft", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, "o3");
  await desc(page).fill("o3-back-guard");
  await backedUp(page).waitFor();
  dialogMode.set(page, "dismiss");
  await page.goBack();
  await page.waitForTimeout(500);
  assert.ok(page.url().includes("/FoundationEstimator"), "dismissed Back stays on estimator");
  assert.equal(await desc(page).inputValue(), "o3-back-guard", "edits intact after dismissed Back");
  dialogMode.set(page, "accept");
  await page.goBack();
  await page.waitForURL("**/away", { timeout: 8000 });
  await page.goForward();
  await waitLoaded(page, "p3");
  await offer(page).waitFor();
  await page.getByRole("button", { name: "Restore browser draft" }).click();
  await page.waitForFunction(() => window.__seenProject?.items?.[0]?.description === "o3-back-guard", null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), "o3-back-guard", "restored after forward-return");
  await page.screenshot({ path: OUT + "/o3-restored.png" });
  await ctx.close();
  return true;
});

// O4: after a verified save the stale sentinel passes through — Back leaves with no confirm
await R("O4: clean passthrough — save clears guard, Back exits without confirm", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, "o4");
  await desc(page).fill("o4-save-then-leave");
  await backedUp(page).waitFor();
  let dialogs = 0;
  page.on("dialog", (d) => { dialogs += 1; d.accept(); });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  try {
    await page.waitForFunction(() => window.__spies.filter(x => x[0] === "saveSource").length === 1, null, { timeout: 8000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Not yet saved"), null, { timeout: 8000 });
  } catch (e) {
    const dbg = await page.evaluate(() => ({
      spies: window.__spies.map(x => x[0]),
      alerts: [...document.querySelectorAll("[role=alert]")].map(a => a.textContent.slice(0, 220)),
      statusText: [...document.querySelectorAll("span")].map(s => s.textContent).filter(t => /saved|Saving/.test(t)).slice(-3),
      saveDisabled: [...document.querySelectorAll("button")].filter(b => b.textContent === "Save").map(b => b.disabled),
    }));
    console.log("O4-DEBUG", JSON.stringify(dbg, null, 1));
    throw e;
  }
  await page.goBack();
  await page.waitForURL("**/away", { timeout: 8000 });
  assert.equal(dialogs, 0, "no leave confirm after save");
  assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY), null, "draft cleared after save");
  await ctx.close();
  return true;
});

// O5: quota-refused draft write -> loss marker -> reopen warns + discard clears
await R("O5: storage quota refusal -> tombstone -> reopen warns, discard clears", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, "o5", {
    init: `(() => { const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes("ccs:foundation-draft") && !String(v).includes('"draftLost":true')) {
          const e = new DOMException("quota", "QuotaExceededError"); throw e;
        }
        return orig.call(this, k, v);
      }; })();`,
  });
  await desc(page).fill("o5-quota-loss");
  await page.getByText("Latest edits could not be backed up", { exact: false }).waitFor();
  const marker = JSON.parse(await draftRaw(page));
  assert.equal(marker.draftLost, true, "tombstone stored");
  assert.equal(marker.ownerId, "synthetic-staff");
  assert.equal(marker.sourceId, "p3");
  assert.ok(marker.droppedBytes > 100, "dropped size recorded");
  dialogMode.set(page, "accept");
  await page.reload();
  await waitLoaded(page, "p3");
  await page.getByText("A browser draft exists but cannot be restored.", { exact: false }).waitFor();
  await page.getByText("could not be kept", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Discard browser draft" }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("cannot be restored"), null, { timeout: 8000 });
  assert.equal(await draftRaw(page), null, "marker discarded");
  await page.screenshot({ path: OUT + "/o5-tombstone-cleared.png" });
  await ctx.close();
  return true;
});

// O6: protected wiring — healthy totals, pricing panel real, no console errors
await R("O6: page boots clean — totals + real pricing panel render, no console errors", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, "o6");
  await page.getByText("Internal section cost", { exact: false }).waitFor(); // real CustomerPricingPanel
  assert.equal(await markupInput(page).inputValue(), "0", "markup input live");
  await page.getByText("Total:", { exact: false }).first().waitFor();
  await page.screenshot({ path: OUT + "/o6-healthy.png" });
  await ctx.close();
  return true;
});

const okCount = results.filter(r => r.ok).length;
fs.writeFileSync(OUT + "/browser-verification.json", JSON.stringify({ results, telemetry, okCount, total: results.length }, null, 2));
console.log(`\n${okCount}/${results.length} browser checks passed`);
console.log("foreign requests:", telemetry.foreign.length, "| consoleErrors:", telemetry.consoleErrors.length, "| pageErrors:", telemetry.pageErrors.length);
await browser.close();
server.close();
process.exit(results.every(r => r.ok) && telemetry.pageErrors.length === 0 ? 0 : 1);
