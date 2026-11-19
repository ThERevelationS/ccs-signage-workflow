// Pole-pricing availability — real-page proof (6 cases; 5 candidates:
// poleCalculator, foundationCalc, PolesPanel, BOM, page wiring).
// Uses pole-pricing-flow-proof-spec.json and the actual candidate
// FoundationEstimator page. Stubs are limited to staff-entity/service
// boundaries and visual leaf components; calcProject, pole/wall/cap
// calculations, catalog integrity, save-session, recovery, assembly, and
// sourcePatchMatches are real.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement19/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "pole-pricing-flow-proof-spec.json", "utf8"));
{ const art = JSON.parse(fs.readFileSync(DIR + SPEC.sourceArtifact, "utf8"));
  assert.equal(art.head, SPEC.sourceHead, "source artifact head"); }
const hash = (t) => createHash("sha256").update(t).digest("hex");

// ---------- frozen source map ----------
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));
const sources = new Map();
for (const f of read(SPEC.dependencyArtifact).files) sources.set("/app/" + f.path, f.content);
for (const f of read(SPEC.sourceArtifact).files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const F = "/app/src/components/estimator/foundation/";
for (const [name, file] of Object.entries(SPEC.candidates))
  sources.set(name === "FoundationEstimator.jsx" ? "/app/src/pages/FoundationEstimator.jsx" : F + name,
    fs.readFileSync(DIR + file, "utf8"));
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(hash(sources.get(name === "FoundationEstimator.jsx" ? "/app/src/pages/FoundationEstimator.jsx" : F + name)), h, "candidate " + name);
for (const name of ["wallCalculator.js", "wallCapCalculator.js", "FoundationWallCapsPanel.jsx", "FoundationTotals.jsx", "foundationCatalogIntegrity.js"])
  assert.ok(sources.has(F + name), "real source " + name);

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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline pole proof"); };

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
  "@/components/staff/staffEntities": `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__project;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("FoundationProject.update not permitted in pole proof");},updateMany:async(query,patch)=>{globalThis.__spies.push(['saveSource',{query,patch}]);const p=globalThis.__project;if(p&&p.id===query?.id&&p.updated_date===query?.updated_date){globalThis.__project={...p,...(patch?.$set||{}),id:query.id,updated_date:globalThis.__savedVersion};return{updated:1};}return{updated:0};}},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async(id)=>{globalThis.__spies.push(['estimateGet',id]);return globalThis.__estimates?.[id]??globalThis.__estimate;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.update not permitted in pole proof");},updateMany:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.updateMany not permitted in pole proof");}}};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
  "@/components/estimator/foundation/FoundationItemCard": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationEquipmentTab": `export default ()=><div/>`,
  "@/components/estimator/foundation/ConcreteDeliveryPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationWallsPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/FoundationWallCapsPanel": `export default ()=><div/>`,
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
  "@/components/estimator/foundation/WallShapeEditor": `export { foundationWallOutlineBasis } from "./wallCalculator";`,
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
STUBS["@/api/base44Client"] = `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the pole page proof");};
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
const entry = "/app/pole-page-entry.jsx";
sources.set(entry, `
export { default as Page } from "/app/src/pages/FoundationEstimator.jsx";
export { foundationPoleCatalogIssues } from "/app/src/components/estimator/foundation/poleCalculator.js";
export { calcProject } from "/app/src/components/estimator/foundation/foundationCalc.js";
`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: DIR + "pole-pricing-page-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(pageBuild.warnings, []);
assert.ok(!Object.keys(pageBuild.metafile.inputs).some(f => /base44Client\.js|node_modules\/@base44/.test(f)),
  "The pole page proof must not bundle a real SDK boundary.");
{
  const edges = [];
  for (const [out, info] of Object.entries(pageBuild.metafile.outputs))
    for (const imp of info.imports || []) edges.push({ output: out, ...imp });
  for (const e of edges) {
    assert.equal(e.external, true, "non-external import edge: " + JSON.stringify(e));
    assert.match(e.path, /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|react-test-renderer|react-router-dom|scheduler(?:\/.*)?)$/, "unexpected external: " + e.path);
  }
  fs.writeFileSync(DIR + "pole-pricing-page-import-edges.json", JSON.stringify(edges, null, 2));
}
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(loaded[name === "FoundationEstimator.jsx" ? "/app/src/pages/FoundationEstimator.jsx" : F + name], h, "candidate loaded " + name);
assert.ok(loaded[F + "foundationSaveSession.js"], "real save-session loaded");
fs.writeFileSync(DIR + "pole-pricing-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page, foundationPoleCatalogIssues, calcProject } =
  await import(pathToFileURL(path.resolve(DIR + "pole-pricing-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { useNavigate, useLocation, MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const { fixture: seed } = read(SPEC.fixtureArtifact);
const settingsRows = () => Object.entries(seed.settings).map(([k, v]) => ({ setting_name: k, setting_value: v }));
const makeProject = (poles, extras = {}) => ({
  id: SPEC.sourceId, updated_date: SPEC.sourceVersion, project_name: "P",
  items: [], poles, wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls: [], landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
  ...extras,
});
const seedPoles = () => JSON.parse(JSON.stringify(seed.project.poles));
const seedInv = () => JSON.parse(JSON.stringify(seed.inventory));
const seedTotals = () => ({ total_pole_cost: seed.project.total_pole_cost, total_pole_painting_cost: seed.project.total_pole_painting_cost });
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
const polesPanel = (c) => { const e = elByType(c, "FoundationPolesPanel"); assert.ok(e.length, "FoundationPolesPanel mounted"); return e[0]; };
const totalsPanel = (c) => { const e = elByType(c, "FoundationTotals"); assert.ok(e.length, "FoundationTotals mounted"); return e[0]; };
const bomPanel = (c) => { const e = elByType(c, "FoundationBOM"); assert.ok(e.length, "FoundationBOM mounted"); return e[0]; };
const spyCount = (k) => globalThis.__spies.filter((x) => x[0] === k).length;
const unmountAll = async (c) => { try { await act(async () => c.unmount()); } catch {} };
const editName = async (c) => {
  const input = c.root.findAll((el) => el.type === "input" && el.props?.value === "P")[0];
  assert.ok(input, "project name input by exact value");
  await act(async () => { input.props.onChange({ target: { value: "Edited" } }); });
};
const BLOCKED_MSG = "Save paused: fix highlighted design inputs or catalog selections.";
const ZERO_WRITE_KINDS = ["saveSource", "recordBuilderSave", "pricing", "ensureIdempotent", "estimateWrite", "partGroup", "converter"];
const zeroWrites = () => { for (const k of ZERO_WRITE_KINDS) assert.equal(spyCount(k), 0, "zero " + k); };
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
  renderedPoles: (() => { try { const e = polesPanel(c); return e.props.poles.map((p) => ({ component_id: p.component_id, pole_id: p.pole_id, height_inches: p.height_inches, y_offset_inches: p.y_offset_inches, pole_cost: p.pole_cost, pole_painting_cost: p.pole_painting_cost, total_cost: p.total_cost })); } catch { return null; } })(),
  polePricing: (() => { try { const e = polesPanel(c); return JSON.parse(JSON.stringify(e.props.polePricing)); } catch { return null; } })(),
  totals: (() => { try { const e = totalsPanel(c); return JSON.parse(JSON.stringify(e.props.totals)); } catch { return null; } })(),
  pricingUnavailable: (() => { try { const e = totalsPanel(c); return e.props.pricingUnavailable; } catch { return null; } })(),
  inventory: JSON.parse(JSON.stringify(globalThis.__invRows ?? null)),
  spies: JSON.parse(JSON.stringify(globalThis.__spies)),
});
const poleIssuesOnPanel = (c) => polesPanel(c).props.polePricing.flatMap((p) => p.issues || []);
const issueCodes = (c) => poleIssuesOnPanel(c).map((i) => i.code);

// case 1 — missing catalog price holds acknowledged amounts + blocks save
await check("held-missing-price-blocks-save", async () => {
  const inv = seedInv(); delete inv[0].pole_stock_price;
  const c = await mount({ project: makeProject(seedPoles(), seedTotals()), inventory: inv });
  try {
    const panel = polesPanel(c);
    assert.equal(panel.props.poles[0].pole_cost, 999, "acknowledged pole_cost held");
    assert.equal(panel.props.poles[0].total_cost, 999);
    assert.equal(panel.props.poles[1].pole_cost, 120, "valid sibling repriced");
    assert.ok(issueCodes(c).includes("pole_price_unavailable"), "pole_price_unavailable issue");
    assert.equal(poleIssuesOnPanel(c)[0].kind, "pole");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_pole_cost, 1119, "acknowledged 999 + current 120");
    assert.equal(totals.grand_total, 1194);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "held-missing-price-blocks-save", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 2 — blank height holds acknowledged amounts + blocks save
await check("held-blank-height-blocks-save", async () => {
  const poles = seedPoles(); poles[0].height_inches = "";
  const c = await mount({ project: makeProject(poles, seedTotals()) });
  try {
    assert.equal(polesPanel(c).props.poles[0].pole_cost, 999, "held pole_cost");
    assert.ok(issueCodes(c).includes("pole_height_unavailable"), "pole_height_unavailable issue");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "held-blank-height-blocks-save", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 3 — new held pole strips rendered snapshot fields (Not saved, totals null)
await check("new-pole-strips-rendered-cost", async () => {
  const c = await mount({ project: makeProject(seedPoles(), seedTotals()) });
  try {
    // acknowledged basis has only the two saved poles; a draft-added pole has none.
    const newPole = { component_id: "synthetic-pole-new", pole_id: "gone-pole",
      height_inches: 120, y_offset_inches: 36, include_pole_painting: false,
      pole_name: "rendered junk", pole_cost: 555, pole_painting_cost: 0, total_cost: 555 };
    const current = polesPanel(c).props.poles;
    await act(async () => { polesPanel(c).props.onChange([...current, newPole]); await flush(); });
    const rendered = polesPanel(c).props.poles[2];
    assert.equal("pole_cost" in rendered, false, "rendered cost cannot persist");
    assert.equal("total_cost" in rendered, false);
    assert.equal("pole_name" in rendered, false);
    assert.equal(rendered.pole_id, "gone-pole", "authored fields kept");
    assert.ok(issueCodes(c).includes("catalog_item_unavailable"));
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_pole_cost, 1887, "acknowledged project-level total fallback");
    assert.equal(totals.grand_total, null, "grand total withheld — a pole total is unavailable");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "new-pole-strips-rendered-cost", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 4 — valid poles save calculated snapshots; new acknowledged basis then holds
await check("valid-poles-save-then-new-acknowledged-holds", async () => {
  const c = await mount({ project: makeProject(seedPoles(), seedTotals()) });
  try {
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.query.updated_date, SPEC.sourceVersion);
    const savedPoles = call.patch.$set.poles;
    assert.equal(savedPoles[0].pole_cost, 250);
    assert.equal(savedPoles[0].pole_name, "Stock pole 20ft");
    assert.equal(savedPoles[0].total_cost, 250);
    assert.equal(savedPoles[1].pole_cost, 120);
    assert.equal(savedPoles[1].pole_painting_cost, 75);
    assert.equal(savedPoles[1].total_cost, 195);
    assert.equal(call.patch.$set.total_pole_cost, 370, "current totals persisted");
    assert.equal(call.patch.$set.total_pole_painting_cost, 75);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion);
    capture(c, { caseId: "valid-poles-save-then-new-acknowledged-holds", phase: "afterValidSave", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }

  // reload against the newly acknowledged basis, break the price, confirm hold
  const inv2 = seedInv(); delete inv2[0].pole_stock_price;
  const ackProject = { ...globalThis.__project, updated_date: SPEC.savedVersion };
  const c2 = await mount({ project: ackProject, inventory: inv2 });
  try {
    assert.equal(polesPanel(c2).props.poles[0].pole_cost, 250, "new acknowledged amount held (not old 999)");
    assert.ok(issueCodes(c2).includes("pole_price_unavailable"));
    assert.equal(totalsPanel(c2).props.totals.total_pole_cost, 370, "new acknowledged total");
    assert.equal(totalsPanel(c2).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c2, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c2, { caseId: "valid-poles-save-then-new-acknowledged-holds", phase: "heldOnNewBasis", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c2); }
});

// case 5 — explicit $0 catalog price is a valid free pole and saves
await check("free-pole-zero-price-saves", async () => {
  const inv = seedInv(); inv[0].pole_stock_price = 0;
  const c = await mount({ project: makeProject(seedPoles(), seedTotals()), inventory: inv });
  try {
    assert.equal(polesPanel(c).props.poles[0].pole_cost, 0, "explicit $0 is valid, not unavailable");
    assert.equal(polesPanel(c).props.polePricing[0].available, true);
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.patch.$set.poles[0].pole_cost, 0, "$0 pole persisted");
    assert.equal(call.patch.$set.total_pole_cost, 120, "0 + 120");
    capture(c, { caseId: "free-pole-zero-price-saves", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 6 — numeric-string dims normalize for pricing; authored strings persist
await check("string-dims-normalize-and-persist", async () => {
  const poles = seedPoles();
  poles[0].height_inches = "120"; poles[0].y_offset_inches = "36";
  const c = await mount({ project: makeProject(poles, seedTotals()) });
  try {
    assert.equal(polesPanel(c).props.poles[0].pole_cost, 250, "string dims priced, not concatenated");
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.patch.$set.poles[0].height_inches, "120", "authored string persisted");
    assert.equal(call.patch.$set.poles[0].pole_cost, 250);
    capture(c, { caseId: "string-dims-normalize-and-persist", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

assert.equal(results.length, SPEC.pageCaseCount, "case count");
assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "pole-pricing-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
fs.writeFileSync(DIR + "pole-pricing-page-state-proof.json", JSON.stringify({ proof }, null, 2));
console.log("pole-pricing-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
