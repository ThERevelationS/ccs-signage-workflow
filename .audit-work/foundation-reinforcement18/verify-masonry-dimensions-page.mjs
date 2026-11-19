// Masonry dimensions — real-page proof (5 cases; single candidate: dimensions wallCalculator).
// Uses masonry-dimensions-flow-proof-spec.json and the actual FoundationEstimator
// page with its applied wall panel; only wallCalculator is overridden.
// Stubs are limited to staff-entity/service boundaries and visual
// leaf components; calcProject, wall calculations, catalog integrity,
// save-session, recovery, assembly, and sourcePatchMatches are real.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "masonry-dimensions-flow-proof-spec.json", "utf8"));
{ const art = JSON.parse(fs.readFileSync(DIR + SPEC.sourceArtifact, "utf8"));
  assert.equal(art.sourceHead ?? art.head ?? art.source_head, SPEC.sourceHead, "source artifact head"); }
const hash = (t) => createHash("sha256").update(t).digest("hex");

// ---------- frozen source map ----------
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));
const sources = new Map();
for (const artifact of [
  "wall-cap-physical-source.json",
  "wall-cap-geometry-remote-validation.json",
  "masonry-material-pole-source.json",
  "masonry-page-dependency-source.json",
  "masonry-rates-panel-source.json",
]) for (const f of read(artifact).files) sources.set("/app/" + f.path, f.content);
// actual applied remote scope LAST — overrides any stale overlapping artifact paths
for (const f of read(SPEC.sourceArtifact).files)
  sources.set("/app/" + f.path, f.text ?? f.normalized);
for (const name of ["wallCalculator.js", "FoundationWallsPanel.jsx", "FoundationBOM.jsx", "foundationCalc.js", "foundationCatalogIntegrity.js"])
  assert.ok(sources.has("/app/src/components/estimator/foundation/" + name), "applied source " + name);
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationWallsPanel.jsx")),"03620a63e2b273d08d1ad8ecd665173ceade72a8c556e12be64b0fde356e23e0","applied WallsPanel");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationBOM.jsx")),"688323df8427d019f1b9da8371b4f6a30f65d24963fb913589ce84ae93fc5432","applied BOM");
assert.equal(hash(sources.get("/app/src/pages/FoundationEstimator.jsx")),"e20865a04ec97fe8b54d5df7632f80229d5c3ebf6ba9c2e87d3bf20a29574809","actual page");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationRatesPanel.jsx")),"c5f9a0feeb8391a7d864c07c4362d2f421d501154624f328fcac6c26936acd68","real RatesPanel");
sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + SPEC.candidateCalculator, "utf8"));


// ---------- window/browser shim ----------
const winHandlers = {};
globalThis.window = {
  location: { search: "?id=" + SPEC.sourceId + "&estimateId=" + SPEC.estimateId },
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
  "@/components/staff/staffEntities": `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__project;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("FoundationProject.update not permitted in height proof");},updateMany:async(query,patch)=>{globalThis.__spies.push(['saveSource',{query,patch}]);const p=globalThis.__project;if(p&&p.id===query?.id&&p.updated_date===query?.updated_date){globalThis.__project={...p,...(patch?.$set||{}),id:query.id,updated_date:globalThis.__savedVersion};return{updated:1};}return{updated:0};}},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async(id)=>{globalThis.__spies.push(['estimateGet',id]);return globalThis.__estimates?.[id]??globalThis.__estimate;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.update not permitted in height proof");},updateMany:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.updateMany not permitted in height proof");}}};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
  "@/components/estimator/foundation/FoundationItemCard": `export default ()=><div/>`,
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
  outfile: DIR + "masonry-dimensions-page-bundle.mjs", metafile: true, logLevel: "silent",
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
  fs.writeFileSync(DIR + "masonry-dimensions-page-import-edges.json", JSON.stringify(edges, null, 2));
}
const F = "/app/src/components/estimator/foundation/";
assert.ok(loaded[F + "wallCalculator.js"], "calc candidate loaded");
assert.equal(loaded[F + "wallCalculator.js"], SPEC.candidateHash);

assert.equal(loaded[F + "FoundationWallsPanel.jsx"], SPEC.appliedPanelHash, "applied Panel");
assert.ok(loaded["/app/src/pages/FoundationEstimator.jsx"], "actual page loaded");
assert.ok(loaded[F + "foundationSaveSession.js"], "real save-session loaded");
fs.writeFileSync(DIR + "masonry-dimensions-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page, foundationAssemblyCatalogIssues, foundationWallPricingIssues, calcProject } =
  await import(pathToFileURL(path.resolve(DIR + "masonry-dimensions-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { useNavigate, useLocation, MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const { fixture: seed } = JSON.parse(fs.readFileSync(DIR + "masonry-pricing-baseline-probe.json", "utf8"));
const settingsRows = () => Object.entries(seed.settings).map(([k, v]) => ({ setting_name: k, setting_value: v }));
const makeProject = (walls) => ({
  id: SPEC.sourceId, updated_date: SPEC.sourceVersion, project_name: "P",
  items: [], poles: [], wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls, landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
const seedWall = () => JSON.parse(JSON.stringify(seed.project.walls[0]));
const seedInv = () => JSON.parse(JSON.stringify(seed.inventory));
const makeEstimate = () => ({
  id: SPEC.estimateId,
  line_items: [{ module_key: "foundation", project_id: SPEC.sourceId, estimate_id: SPEC.estimateId, updated_date_snapshot: SPEC.sourceVersion }],
});
const ROUTE = "/?id=" + SPEC.sourceId + "&estimateId=" + SPEC.estimateId;

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
  globalThis.__estimates = { [SPEC.estimateId]: opts.estimate ?? makeEstimate() };
  globalThis.__estimate = opts.estimate ?? makeEstimate();
  globalThis.__invRows = opts.inventory ?? seedInv();
  globalThis.__catalogBefore = JSON.parse(JSON.stringify(globalThis.__invRows));
  globalThis.__labRows = []; globalThis.__setRows = opts.settings ? (Array.isArray(opts.settings) ? opts.settings : Object.entries(opts.settings).map(([k,v])=>({setting_name:k,setting_value:v}))) : settingsRows();
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
const fieldSubset = (actual, expected) => {
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(actual?.[k], v, "snapshot field " + k);
};
const innerFixture = JSON.parse(fs.readFileSync(DIR + SPEC.innerFixtureArtifact, "utf8"))
  .rows.find((r) => r.name === SPEC.innerFixtureRowName).fixture;
const innerProject = () => {
  const w = { ...JSON.parse(JSON.stringify(innerFixture.project.walls[0])) };
  return makeProject([w]);
};
const materialSelect = (c, aria) => {
  const els = c.root.findAll((el) => el.type === "select" && el.props?.["aria-label"] === aria);
  return els.length ? els[0] : null;
};
const ratesSettings = (c, expected) => {
  const el = elByType(c, "FoundationRatesPanel");
  assert.ok(el.length, "FoundationRatesPanel mounted");
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(el[0].props.settings[k], v, "rates settings " + k);
};
const BLOCKED_MSG = SPEC.blockedSaveMessage;
const ZERO_WRITE_KINDS = ["saveSource", "recordBuilderSave", "pricing", "ensureIdempotent", "estimateWrite", "partGroup", "converter"];
const zeroWrites = () => { for (const k of ZERO_WRITE_KINDS) assert.equal(spyCount(k), 0, "zero " + k); };
const catalogUnchanged = () => assert.deepEqual(globalThis.__invRows, globalThis.__catalogBefore, "raw catalog unchanged");
const results = [];
const proof = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1500) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};
const capture = (c, extra = {}) => proof.push({
  ...extra,
  rawDraft: JSON.parse(JSON.stringify(globalThis.__seenProject ?? null)),
  acknowledged: JSON.parse(JSON.stringify(globalThis.__project)),
  renderedWalls: wallsPanel(c).props.walls.map((w) => ({ component_id: w.component_id, heightInches: w.heightInches, materialId: w.materialId, internalMaterialId: w.internalMaterialId, calculatedCosts: w.calculatedCosts })),
  totals: JSON.parse(JSON.stringify(totalsPanel(c).props.totals)),
  inventory: JSON.parse(JSON.stringify(globalThis.__invRows ?? null)),
  inventoryBefore: JSON.parse(JSON.stringify(globalThis.__catalogBefore ?? null)),
  ratesSettings: (() => { try { const el = c.root.findAll((e2) => e2.type?.name === "FoundationRatesPanel"); return el.length ? JSON.parse(JSON.stringify(el[0].props.settings)) : null; } catch { return null; } })(),
  pricingUnavailable: totalsPanel(c).props.pricingUnavailable,
  spies: JSON.parse(JSON.stringify(globalThis.__spies)),
});
const invIssues = (inv) => foundationAssemblyCatalogIssues(globalThis.__seenProject, inv);

// case 1 — missing outer unit length holds acknowledged, not guessed
await check("missing-outer-unit-length-holds-acknowledged-not-guessed", async () => {
  const inv = seedInv(); delete inv[0].wall_unit_length_inches;
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(invIssues(inv).some((i) => i.code === "wall_unit_length_inches_unavailable" && i.field === "materialId"), "outer length issue");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    catalogUnchanged();
    capture(c, { caseId: "missing-outer-unit-length-holds-acknowledged-not-guessed", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 2 — zero outer unit height is not a default
await check("zero-outer-unit-height-is-not-a-default", async () => {
  const inv = seedInv(); inv[0].wall_unit_height_inches = 0;
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(invIssues(inv).some((i) => i.code === "wall_unit_height_inches_unavailable" && i.field === "materialId"), "outer height issue");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    catalogUnchanged();
    capture(c, { caseId: "zero-outer-unit-height-is-not-a-default", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 3 — unknown internal unit width holds entire wall vector
await check("unknown-internal-unit-width-holds-entire-wall-vector", async () => {
  const inv = JSON.parse(JSON.stringify(innerFixture.inventory));
  const innerRow = inv.find((i) => i.id === "synthetic-inner");
  innerRow.wall_unit_width_inches = null;
  const c = await mount({ project: innerProject(), inventory: inv, settings: innerFixture.settings });
  try {
    ratesSettings(c, innerFixture.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(invIssues(inv).some((i) => i.code === "wall_unit_width_inches_unavailable" && i.field === "internalMaterialId"), "inner width issue");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    catalogUnchanged();
    capture(c, { caseId: "unknown-internal-unit-width-holds-entire-wall-vector", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 4 — new invalid unit dimensions cannot adopt rendered history
await check("new-invalid-unit-dimensions-cannot-adopt-rendered-history", async () => {
  const inv = seedInv(); inv[0].wall_unit_length_inches = "";
  const c = await mount({ project: makeProject([]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const panel = wallsPanel(c);
    const newWall = { ...seedWall(), component_id: "masonry-new-dimensions",
      calculatedCosts: { ...SPEC.validCurrentSnapshotFields } };
    const expectedShape = JSON.parse(JSON.stringify(newWall.shape));
    await act(async () => { panel.props.onChange([newWall]); });
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, expectedShape);
    assert.deepEqual(wallsPanel(c).props.walls[0].calculatedCosts, {}, "rendered fields cannot persist");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_wall_cost, null); assert.equal(totals.total_brick_cost, null);
    assert.equal(totals.grand_total, null);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    catalogUnchanged();
    capture(c, { caseId: "new-invalid-unit-dimensions-cannot-adopt-rendered-history", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 5 — numeric-string unit dims save + establish new acknowledged basis
await check("numeric-string-unit-dimensions-save-and-establish-new-acknowledged-basis", async () => {
  const inv = seedInv();
  for (const k of ["wall_unit_length_inches", "wall_unit_width_inches", "wall_unit_height_inches"])
    inv[0][k] = String(inv[0][k]);
  inv.push({ ...JSON.parse(JSON.stringify(inv[0])), id: SPEC.badMaterialId, material_name: SPEC.badMaterialName, ...SPEC.badMaterialPatch });
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    const authoredMatId = globalThis.__seenProject.walls[0].materialId;
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save " + JSON.stringify(r?.error?.message || "").slice(0, 120));
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.query.updated_date, SPEC.sourceVersion);
    const savedWall = call.patch.$set.walls[0];
    assert.equal(savedWall.component_id, "synthetic-wall");
    assert.equal(savedWall.heightInches, 9, "numeric 9 height");
    assert.equal(savedWall.materialId, authoredMatId, "raw material id unchanged");
    assert.deepEqual(savedWall.shape, authoredShape, "CAS shape unchanged");
    fieldSubset(savedWall.calculatedCosts, SPEC.validCurrentSnapshotFields);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion);
    catalogUnchanged();
    for (const k of ["wall_unit_length_inches", "wall_unit_width_inches", "wall_unit_height_inches"]) assert.strictEqual(globalThis.__invRows[0][k], String(seedInv()[0][k]), "catalog " + k + " still string");
    capture(c, { caseId: "numeric-string-unit-dimensions-save-and-establish-new-acknowledged-basis", phase: "afterValidSave", saveOutcome: { status: r?.status }, cas: call });
    // select invalid dimensions via actual Wall material select — holds new 57, not old 408
    const sel = materialSelect(c, "Wall material"); assert.ok(sel);
    await act(async () => { sel.props.onChange({ target: { value: SPEC.badMaterialId } }); });
    assert.equal(globalThis.__seenProject.walls[0].materialId, SPEC.badMaterialId, "raw draft badMaterialId");
    assert.equal(globalThis.__project.walls[0].materialId, authoredMatId, "acknowledged materialId unchanged");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape, "shape after select");
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    const rawInv = globalThis.__seenProject ? JSON.parse(JSON.stringify(globalThis.__invRows)) : null;
    const dimRow = rawInv?.find((i) => i.id === SPEC.badMaterialId);
    assert.equal(dimRow?.wall_unit_length_inches, "", "raw catalog length untouched");
    const fresh = toolbarProp(c, "onSave");
    let r2; await act(async () => { r2 = await fresh(); });
    assert.equal(r2?.status, "failed", "next save blocked");
    assert.equal(r2?.error?.message, BLOCKED_MSG);
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    assert.equal(spyCount("pricing"), 0); assert.equal(spyCount("ensureIdempotent"), 0);
    assert.equal(spyCount("estimateWrite"), 0); assert.equal(spyCount("partGroup"), 0); assert.equal(spyCount("converter"), 0);
    catalogUnchanged();
    capture(c, { caseId: "numeric-string-unit-dimensions-save-and-establish-new-acknowledged-basis", phase: "afterInvalidSelectBlocked", saveOutcome: { status: r2?.status, error: r2?.error?.message } });
  } finally { await unmountAll(c); }
});

assert.equal(results.length, SPEC.pageCaseCount, "case count " + SPEC.pageCaseCount);
assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-dimensions-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
fs.writeFileSync(DIR + "masonry-dimensions-page-state-proof.json", JSON.stringify({ proof }, null, 2));
console.log("masonry-dimensions-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
