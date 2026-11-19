// Masonry material pricing — real-page proof (7 cases from
// masonry-material-page-proof-spec.json). Loads the frozen remote
// FoundationEstimator page + all five lead candidates from the frozen source
// map only. Stubs are limited to staff-entity/service boundaries and visual
// leaf components; calcProject, wall calculations, catalog integrity,
// save-session, recovery, assembly, and sourcePatchMatches are real.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "masonry-material-page-proof-spec.json", "utf8"));
const hash = (t) => createHash("sha256").update(t).digest("hex");

// ---------- frozen source map ----------
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));
const sources = new Map();
for (const f of read(SPEC.sourceArtifact).files)
  sources.set("/app/" + f.path, f.text ?? f.normalized);
for (const artifact of [
  "wall-cap-physical-source.json",
  "wall-cap-geometry-remote-validation.json",
  "masonry-material-pole-source.json",
  "masonry-page-dependency-source.json",
]) for (const f of read(artifact).files) sources.set("/app/" + f.path, f.content);
for (const name of SPEC.candidateFiles)
  sources.set("/app/src/components/estimator/foundation/" + name, fs.readFileSync(DIR + "masonry-material-candidate-" + name, "utf8"));

// ---------- window/browser shim ----------
const winHandlers = {};
globalThis.window = {
  location: { search: "?id=" + SPEC.fixtureSourceId + "&estimateId=" + SPEC.fixtureEstimateId },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  confirm: () => true,
  alert: () => {},
  addEventListener: (t, f) => { (winHandlers[t] ??= []).push(f); },
  removeEventListener: (t, f) => { winHandlers[t] = (winHandlers[t] || []).filter(h => h !== f); },
};
globalThis.location = globalThis.window.location;
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline masonry proof"); };

// ---------- boundary + visual-leaf stubs ----------
const STUBS = {
  "@/components/auth/EmailGate": "export const useAuth=()=>({currentUser:{id:'synthetic-staff'}});",
  "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
  "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
  "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
  "@/components/ui/dialog": `export const Dialog=(p)=>p.open?<div>{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;`,
  "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
  "@/components/ui/badge": `export const Badge=(p)=><span>{p.children}</span>;`,
  "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
  "@/components/ui/switch": `export const Switch=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  "@/components/ui/checkbox": `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  "@/components/ui/dropdown-menu": `export const DropdownMenu=(p)=><div>{p.children}</div>;export const DropdownMenuTrigger=(p)=><button type="button">{p.children}</button>;export const DropdownMenuContent=(p)=><div>{p.children}</div>;export const DropdownMenuItem=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;export const DropdownMenuSeparator=()=>null;export const DropdownMenuLabel=()=>null;export const DropdownMenuGroup=(p)=><div>{p.children}</div>;`,
  "@/components/ui/accordion": `export const Accordion=(p)=><div>{p.children}</div>;export const AccordionItem=(p)=><div>{p.children}</div>;export const AccordionTrigger=(p)=><div>{p.children}</div>;export const AccordionContent=(p)=><div>{p.children}</div>;`,
  "@/components/markup/savedCustomerPricing": `export async function calculateSavedCustomerPricing(a){globalThis.__spies.push(['pricing',a]);return{applied:true};}`,
  "@/components/markup/CustomerPricingTab": `export default ()=><div data-stub="CustomerPricingTab"/>;`,
  "@/components/markup/projectCategorizer": `export function categorizeFoundationProject(){return{};}`,
  "@/components/estimator/builder/builderService": `export const recordBuilderSave=async a=>{globalThis.__spies.push(['recordBuilderSave',a]);return{module_key:'foundation',project_id:a.line?.project_id||a.sourceId,estimate_id:a.estimateId,updated_date_snapshot:a.sourceProject?.updated_date||'${SPEC.savedVersion}'};};`,
  "@/components/estimator/idempotentEntityCreate": `export const ensureIdempotentEntityCreate=(...a)=>{globalThis.__spies.push(['ensureIdempotent',a]);return Promise.resolve({id:'new-'+(globalThis.__kseq=(globalThis.__kseq||0)+1)});};export const newCreationRequestKey=(k)=>'key-'+(k||'x')+'-'+(globalThis.__kseq=(globalThis.__kseq||0)+1);`,
  "@/components/estimator/loadAllEntityRows": `export async function loadAllEntityRows(a){const rec={label:a.label,entity:a.entity,query:a.query||null,sort:a.sort||null};globalThis.__catalogReads.push(rec);if(a.entity===globalThis.__entInv)return globalThis.__invRows||[];if(a.entity===globalThis.__entLab)return globalThis.__labRows||[];if(a.entity===globalThis.__entSet)return globalThis.__setRows||[];return[];}export const primeEntityRowsCache=()=>{};`,
  "@/components/estimator/estimateMutationGuard": `export async function assertEstimateProductMutationAllowed(){}`,
  "@/components/estimator/estimatePersistence": `export const expectedEstimateFields=(o=[])=>o;export const replaceEstimateFieldsIfUnchanged=async(a)=>{globalThis.__spies.push(['estimateWrite',a]);return{updated:1};};`,
  "@/components/estimator/builder/builderPartGroupPersistence": `export const createBuilderPartGroupWithRecovery=async(a)=>{globalThis.__spies.push(['partGroup',a]);return{id:'grp-1'};};`,
  "./builderPartGroupPersistence": `export const createBuilderPartGroupWithRecovery=async(a)=>{globalThis.__spies.push(['partGroup',a]);return{id:'grp-1'};};`,
  "@/components/staff/staffEntities": `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__project;},update:async()=>({}),updateMany:async(query,patch)=>{globalThis.__spies.push(['saveSource',{query,patch}]);const p=globalThis.__project;if(p&&p.id===query?.id&&p.updated_date===query?.updated_date){globalThis.__project={...p,...(patch?.$set||{}),id:query.id,updated_date:globalThis.__savedVersion};return{updated:1};}return{updated:0};}},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async(id)=>{globalThis.__spies.push(['estimateGet',id]);return globalThis.__estimates?.[id]??globalThis.__estimate;},update:async()=>({}),updateMany:async()=>({updated:0})}};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
  "@/components/estimator/foundation/FoundationItemCard": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationRatesPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationEquipmentTab": `export default ()=><div/>`,
  "@/components/estimator/foundation/ConcreteDeliveryPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationPolesPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationToolbar": `export default ()=><div data-stub="Toolbar"/>`,
  "@/components/estimator/foundation/FoundationSectionBanner": `export default ()=><div/>;`,
  "@/components/estimator/foundation/AiEngineeringAssistant": `export default ()=><div/>`,
  "@/components/estimator/foundation/Foundation3DPreview": `export default (p)=>{globalThis.__seenProject=p.project;return <div/>;};`,
  "@/components/estimator/foundation/FoundationTemplateDialog": `export default ()=>null;`,
  "@/components/estimator/foundation/FoundationLayoutCanvas": `export default ()=><div/>`,
  "@/components/estimator/foundation/SignageCabinetsPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/LandscapeDesigner": `export default ()=><div/>`,
  "@/components/estimator/foundation/CustomerPricingPanel": `export default ()=><div data-stub="CustomerPricingPanel"/>`,
  "@/components/estimator/foundation/landscapeMaterials": `export const landscapeSummary=()=>({total:0,items:[]});`,
  "@/components/estimator/foundation/WallShapeEditor": `export default function(){return null;}`,
  "./WallShapeEditor": `export default function(){return null;}`,
};
// lucide-react stub: export null-rendering icons for every name imported anywhere.
{
  const names = new Set();
  for (const text of sources.values())
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g))
      for (const raw of m[1].split(",")) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (n) names.add(n);
      }
  STUBS["lucide-react"] = [...names].map((n) => `export const ${n}=()=>null;`).join("\n");
}
STUBS["@/api/base44Client"] = `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the masonry page proof");};
const entity=new Proxy({}, {get:()=>fail});
export const base44={functions:{invoke:fail},entities:new Proxy({}, {get:()=>entity})};`;

// ---------- bundle (frozen sources only; missing = fail closed) ----------
const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    if (STUBS[a.path]) return { path: "s://" + a.path, namespace: "s" };
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source; held local work forbidden: " + a.path + " (imported by " + a.importer + ")");
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "s" }, (a) => ({ contents: STUBS[a.path.slice(4)], loader: "jsx", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js" };
  });
}};
const entry = "/app/masonry-page-entry.jsx";
sources.set(entry, `
export { default as Page } from "/app/src/pages/FoundationEstimator.jsx";
export { foundationAssemblyCatalogIssues } from "/app/src/components/estimator/foundation/foundationCatalogIntegrity.js";
export { foundationWallPricingIssues } from "/app/src/components/estimator/foundation/wallCalculator.js";
export { calcProject } from "/app/src/components/estimator/foundation/foundationCalc.js";
`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: DIR + "masonry-page-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(pageBuild.warnings, []);
assert.ok(!Object.keys(pageBuild.metafile.inputs).some(f => /base44Client\.js|node_modules\/@base44/.test(f)),
  "The masonry page proof must not bundle a real SDK boundary.");
{
  const edges = [];
  for (const [out, info] of Object.entries(pageBuild.metafile.outputs))
    for (const imp of info.imports || []) edges.push({ output: out, ...imp });
  for (const e of edges) {
    assert.equal(e.external, true, "non-external import edge: " + JSON.stringify(e));
    assert.match(e.path, /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|react-test-renderer|react-router-dom|scheduler(?:\/.*)?)$/, "unexpected external: " + e.path);
  }
  fs.writeFileSync(DIR + "masonry-page-import-edges.json", JSON.stringify(edges, null, 2));
}
const F = "/app/src/components/estimator/foundation/";
for (const name of SPEC.candidateFiles) assert.ok(loaded[F + name], "candidate loaded: " + name);
assert.ok(loaded["/app/src/pages/FoundationEstimator.jsx"], "actual page loaded");
assert.ok(loaded[F + "foundationSaveSession.js"], "real save-session loaded");
fs.writeFileSync(DIR + "masonry-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page, foundationAssemblyCatalogIssues, foundationWallPricingIssues, calcProject } =
  await import(pathToFileURL(path.resolve(DIR + "masonry-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { useNavigate, useLocation, MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const { fixture: seed } = JSON.parse(fs.readFileSync(DIR + "masonry-pricing-baseline-probe.json", "utf8"));
const settingsRows = () => Object.entries(seed.settings).map(([k, v]) => ({ setting_name: k, setting_value: v }));
const makeProject = (walls) => ({
  id: SPEC.fixtureSourceId, updated_date: SPEC.sourceVersion, project_name: "P",
  items: [], poles: [], wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls, landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
const seedWall = () => JSON.parse(JSON.stringify(seed.project.walls[0]));
const seedInv = () => JSON.parse(JSON.stringify(seed.inventory));
const makeEstimate = () => ({
  id: SPEC.fixtureEstimateId,
  line_items: [{ module_key: "foundation", project_id: SPEC.fixtureSourceId, estimate_id: SPEC.fixtureEstimateId, updated_date_snapshot: SPEC.sourceVersion }],
});
const ROUTE = "/?id=" + SPEC.fixtureSourceId + "&estimateId=" + SPEC.fixtureEstimateId;

// ---------- mount + helpers ----------
const locations = [], navigates = [];
const LocSpy = () => { const l = useLocation(); globalThis.window.location.search = l.search; locations.push(l); return null; };
const NavSpy = () => { navigates.push(useNavigate()); return null; };
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.window.sessionStorage._d = {}; // each case is a fresh browser session
  globalThis.__spies = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project;
  globalThis.__savedVersion = SPEC.savedVersion;
  globalThis.__estimates = { [SPEC.fixtureEstimateId]: opts.estimate ?? makeEstimate() };
  globalThis.__estimate = opts.estimate ?? makeEstimate();
  globalThis.__invRows = opts.inventory ?? seedInv();
  globalThis.__labRows = []; globalThis.__setRows = settingsRows();
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? ROUTE] },
      React.createElement(LocSpy), React.createElement(NavSpy), React.createElement(Page)));
    await flush();
  });
  return c;
};
const hostText = (n) => typeof n === "string" || typeof n === "number" ? String(n)
  : Array.isArray(n) ? n.map(hostText).join(" ") : n && n.children ? hostText(n.children) : "";
const elByType = (c, name) => c.root.findAll((el) => el.type?.name === name);
const toolbarProp = (c, key) => {
  const els = c.root.findAll((el) => typeof el.props?.[key] === "function");
  return els.length ? els[0].props[key] : null;
};
const wallsPanel = (c) => { const e = elByType(c, "FoundationWallsPanel"); assert.ok(e.length, "FoundationWallsPanel mounted"); return e[0]; };
const totalsPanel = (c) => { const e = elByType(c, "FoundationTotals"); assert.ok(e.length, "FoundationTotals mounted"); return e[0]; };
const bomPanel = (c) => { const e = elByType(c, "FoundationBOM"); assert.ok(e.length, "FoundationBOM mounted"); return e[0]; };
const spyCount = (k) => globalThis.__spies.filter((x) => x[0] === k).length;
const unmountAll = async (c) => { try { await act(async () => c.unmount()); } catch {} };
const editName = async (c) => {
  const input = c.root.findAll((el) => el.type === "input" && el.props?.value === "P")[0];
  assert.ok(input, "project name input by exact value");
  await act(async () => { input.props.onChange({ target: { value: "Edited" } }); });
};
const materialSelect = (c, aria) => {
  const els = c.root.findAll((el) => el.type === "select" && el.props?.["aria-label"] === aria);
  return els.length ? els[0] : null;
};
const fieldSubset = (actual, expected) => {
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(actual?.[k], v, "snapshot field " + k);
};
const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1500) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};

// ================= case 1 =================
await check("missing-price-blocks-actions", async () => {
  const inv = seedInv(); delete inv[0].cost_per_unit;
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    await editName(c);
    const calc = wallsPanel(c).props.walls;
    fieldSubset(calc[0].calculatedCosts, SPEC.baselineSnapshot);
    const issues = foundationAssemblyCatalogIssues(globalThis.__seenProject, inv);
    assert.ok(issues.some((i) => i.code === "wall_material_price_unavailable"), "wall_material_price_unavailable issue");
    const locBefore = { pathname: locations.at(-1)?.pathname, search: locations.at(-1)?.search };
    for (const key of ["onSave", "onSaveAndExit", "onSaveAsCopy", "onSwapToBrickStone"]) {
      const fn = toolbarProp(c, key); assert.ok(fn, key);
      let r; await act(async () => { r = await fn(); });
      if (key === "onSave") assert.equal(r?.status, "failed", "save blocked");
    }
    assert.ok(winHandlers.keydown?.length, "keydown listener");
    const evt = { key: "s", ctrlKey: true, preventDefault() { evt.done = true; } };
    await act(async () => { winHandlers.keydown.forEach((h) => h(evt)); });
    assert.ok(evt.done, "Ctrl+S handled");
    const onToggle = toolbarProp(c, "onToggleAutoSave"); assert.ok(onToggle);
    await act(async () => { onToggle(); });
    await new Promise((r2) => setTimeout(r2, 2300));
    await act(async () => { await flush(); });
    for (const k of ["saveSource", "recordBuilderSave", "pricing", "ensureIdempotent", "converter"])
      assert.equal(spyCount(k), 0, "zero " + k);
    assert.equal(locations.at(-1)?.pathname, locBefore.pathname, "pathname unchanged");
    assert.equal(locations.at(-1)?.search, locBefore.search, "search unchanged");
    assert.equal(globalThis.__project.updated_date, SPEC.sourceVersion, "ownerVersion " + SPEC.sourceVersion);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true, "case1 pricingUnavailable");
  } finally { await unmountAll(c); }
});

// ================= case 2 =================
await check("new-unpriced-wall-remains-unknown", async () => {
  const inv = seedInv(); delete inv[0].cost_per_unit;
  const c = await mount({ project: makeProject([]), inventory: inv });
  try {
    const panel = wallsPanel(c);
    const newWall = { ...seedWall(), component_id: "masonry-new-wall",
      calculatedCosts: { ...SPEC.validCurrentSnapshotFields } };
    await act(async () => { panel.props.onChange([newWall]); });
    const calc = wallsPanel(c).props.walls;
    assert.deepEqual(calc[0].calculatedCosts, {}, "raw rendered fields must not become history");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_wall_cost, null); assert.equal(totals.total_brick_cost, null);
    assert.equal(totals.grand_total, null);
    const text = hostText(c.toJSON());
    assert.ok(text.includes("Not saved"), "panel shows Not saved");
    assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true, "case2 pricingUnavailable");
  } finally { await unmountAll(c); }
});

// ================= case 3 =================
await check("genuine-zero-rate-saves", async () => {
  const inv = seedInv(); inv[0].cost_per_unit = 0;
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    await editName(c);
    const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    let r; await act(async () => { r = await onSave(); await flush(); });
    globalThis.__dbg3 = { status: r?.status, error: String(r?.error?.message || r?.error), spies: globalThis.__spies.map((s) => s[0]) };
    assert.equal(r?.status, "saved", "save succeeds: " + JSON.stringify(globalThis.__dbg3).slice(0, 400));
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.query.updated_date, SPEC.sourceVersion, "expectedUpdatedAt " + SPEC.sourceVersion);
    const savedWall = call.patch.$set.walls[0];
    fieldSubset(savedWall.calculatedCosts, SPEC.validZeroSnapshotFields);
    assert.equal(savedWall.component_id, "synthetic-wall", "stable component id");
    assert.equal(savedWall.shape?.segments?.[0]?.length, 16, "authored segment length");
    assert.equal(totalsPanel(c).props.pricingUnavailable, false, "case3 pricingUnavailable");
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion, "sourceSavedVersion " + SPEC.savedVersion);
  } finally { await unmountAll(c); }
});

// ================= case 4 =================
await check("valid-preview-cannot-relabel-as-acknowledged", async () => {
  const c = await mount({ project: makeProject([seedWall()]) });
  try {
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    const select = materialSelect(c, "Wall material"); assert.ok(select, "wall material select");
    await act(async () => { select.props.onChange({ target: { value: "unavailable-material" } }); });
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    let r; await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed", "blocked after invalid change");
    assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
    assert.equal(globalThis.__seenProject.walls[0].shape?.segments?.[0]?.length, 16, "authored segment length");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true, "case4 pricingUnavailable");
  } finally { await unmountAll(c); }
});

// ================= case 5 =================
await check("explicit-save-updates-acknowledged-basis", async () => {
  const c = await mount({ project: makeProject([seedWall()]) });
  try {
    await editName(c);
    const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    let r; await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved");
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const select = materialSelect(c, "Wall material"); assert.ok(select);
    await act(async () => { select.props.onChange({ target: { value: "unavailable-material" } }); });
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion, "ownerVersion " + SPEC.savedVersion);
    const freshSave = toolbarProp(c, "onSave"); assert.ok(freshSave);
    let r2; await act(async () => { r2 = await freshSave(); });
    assert.equal(r2?.status, "failed", "blocked after invalid edit");
    assert.equal(spyCount("saveSource"), 1, "no extra source write while blocked");
    assert.equal(spyCount("recordBuilderSave"), 1, "no extra builder write while blocked");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true, "case5 pricingUnavailable");
  } finally { await unmountAll(c); }
});

// ================= case 6 =================
await check("unpriced-inner-wall-blocks-complete-wall", async () => {
  const inv = seedInv();
  inv.push({ id: "inner-mat", material_type: "wall_material", material_name: "Inner units",
    wall_material_subtype: "brick", wall_unit_length_inches: 8, wall_unit_width_inches: 4,
    wall_unit_height_inches: 4, cost_per_unit: null });
  const wall = seedWall(); wall.includeInternalWall = true; wall.internalMaterialId = "inner-mat";
  const c = await mount({ project: makeProject([wall]), inventory: inv });
  try {
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    const issues = foundationAssemblyCatalogIssues(globalThis.__seenProject, inv);
    assert.ok(issues.some((i) => i.kind === "internal_wall"), "internal_wall issue kind");
    const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    let r; await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed", "inner wall blocks complete wall");
    assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true, "case6 pricingUnavailable");
  } finally { await unmountAll(c); }
});

// ================= case 7 =================
await check("invalid-override-cannot-fall-back-to-base", async () => {
  const inv = seedInv(); inv[0].custom_cost_per_unit = "";
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    let r; await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed", "blank override cannot fall back to base rate");
    assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true, "case7 pricingUnavailable");
  } finally { await unmountAll(c); }
});

assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-page-verification.json", JSON.stringify({
  results,
  unexpectedNetwork: globalThis.__unexpectedNetwork,
  unexpectedSdk: globalThis.__unexpectedSdk,
}, null, 2));
console.log(`masonry-page passed=${okCount} failed=${results.length - okCount}`);
if (okCount !== results.length) process.exit(1);
