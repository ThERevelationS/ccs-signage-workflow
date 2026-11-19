// O-030 (CMP-B16) — real-page proof.
// Mounts the remote-frozen FoundationEstimator page with the candidate calc
// chain (foundationConstructionChecks + foundationCalc + candidate page).
// Stubs are limited to staff-entity/service boundaries and visual leaf
// components. calcProject, the new warnings module, input validation,
// catalog integrity, save-session, recovery, and assembly are real.
// Asserts: construction warnings render on the non-blocking diagnostics
// surface (role="status"), never in the role="alert" blocking banners, and
// never pause Save — while the existing blocking path still blocks.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-o030-diagnostics/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "o030-flow-proof-spec.json", "utf8"));
{ const art = JSON.parse(fs.readFileSync(DIR + SPEC.sourceArtifact, "utf8"));
  assert.equal(art.head, SPEC.sourceHead, "source artifact head"); }
const hash = (t) => createHash("sha256").update(t).digest("hex");

// ---------- frozen source map ----------
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));
const sources = new Map();
for (const f of read(SPEC.sourceArtifact).files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const F = "/app/src/components/estimator/foundation/";
const candidatePath = (name) =>
  name.endsWith(".jsx") ? "/app/src/pages/" + name : F + name;
for (const [name, file] of Object.entries(SPEC.candidates))
  sources.set(candidatePath(name), fs.readFileSync(DIR + file, "utf8"));
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(hash(sources.get(candidatePath(name))), h, "candidate " + name);
for (const name of ["foundationCalc.js", "foundationConstructionChecks.js",
    "foundationInputValidation.js", "legacyFoundationCalc.js",
    "foundationCatalogIntegrity.js", "foundationEquipmentBindings.js",
    "wallCalculator.js", "poleCalculator.js", "wallCapCalculator.js",
    "landscapeMaterials.js", "foundationAssemblyModel.js",
    "FoundationItemCard.jsx", "FoundationTotals.jsx", "FoundationBOM.jsx",
    "ConcreteDeliveryPanel.jsx", "FoundationWallsPanel.jsx",
    "FoundationWallCapsPanel.jsx", "FoundationPolesPanel.jsx",
    "FoundationRatesPanel.jsx", "FoundationEquipmentTab.jsx", "WallShapeEditor.jsx"])
  assert.ok(sources.has(F + name), "real source " + name);
assert.ok(sources.has("/app/src/pages/FoundationEstimator.jsx"), "real page");

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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline o030 proof"); };

// ---------- boundary + visual-leaf stubs ----------
const STUBS = {
  "@/components/auth/EmailGate": "export const useAuth=()=>({currentUser:{id:'synthetic-staff'}});",
  "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
  "@/components/ui/card": `export const Card=(p)=><div {...p}>{p.children}</div>;export const CardContent=(p)=><div {...p}>{p.children}</div>;export const CardHeader=(p)=><div {...p}>{p.children}</div>;export const CardTitle=(p)=><div {...p}>{p.children}</div>;`,
  "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
  "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
  "@/components/ui/dialog": `export const Dialog=(p)=>p.open?<div>{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;`,
  "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
  "@/components/ui/badge": `export const Badge=(p)=><span {...p}>{p.children}</span>;`,
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
  "@/components/staff/staffEntities": `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__project;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("FoundationProject.update not permitted in o030 proof");},updateMany:async(query,patch)=>{globalThis.__spies.push(['saveSource',{query,patch}]);const p=globalThis.__project;if(p&&p.id===query?.id&&p.updated_date===query?.updated_date){globalThis.__project={...p,...(patch?.$set||{}),id:query.id,updated_date:globalThis.__savedVersion};return{updated:1};}return{updated:0};}},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async(id)=>{globalThis.__spies.push(['estimateGet',id]);return globalThis.__estimates?.[id]??globalThis.__estimate;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.update not permitted in o030 proof");},updateMany:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.updateMany not permitted in o030 proof");}}};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
  "@/components/estimator/foundation/FoundationToolbar": `export default (p)=><div data-stub="Toolbar" data-onsave={!!p.onSave}/>;`,
  "@/components/estimator/foundation/FoundationSectionBanner": `export default ()=><div/>;`,
  "@/components/estimator/foundation/AiEngineeringAssistant": `export default ()=><div/>`,
  "@/components/estimator/foundation/Foundation3DPreview": `export default (p)=>{globalThis.__seenProject=p.project;return <div/>;};`,
  "@/components/estimator/foundation/FoundationTemplateDialog": `export default ()=>null;`,
  "@/components/estimator/foundation/FoundationLayoutCanvas": `export default ()=><div/>`,
  "@/components/estimator/foundation/SignageCabinetsPanel": `export default ()=><div/>`,
  "@/components/estimator/foundation/LandscapeDesigner": `export default ()=><div/>`,
  "@/components/estimator/foundation/CustomerPricingPanel": `export default ()=><div data-stub="CustomerPricingPanel"/>`,
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
STUBS["@/api/base44Client"] = `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the o030 page proof");};
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
const entry = "/app/o030-page-entry.jsx";
sources.set(entry, `
export { default as Page } from "/app/src/pages/FoundationEstimator.jsx";
export { calcProject } from "/app/src/components/estimator/foundation/foundationCalc.js";
export { foundationConstructionWarnings } from "/app/src/components/estimator/foundation/foundationConstructionChecks.js";
`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: DIR + "o030-page-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(pageBuild.warnings, []);
assert.ok(!Object.keys(pageBuild.metafile.inputs).some(f => /base44Client\.js|node_modules\/@base44/.test(f)),
  "The o030 page proof must not bundle a real SDK boundary.");
{
  const edges = [];
  for (const [out, info] of Object.entries(pageBuild.metafile.outputs))
    for (const imp of info.imports || []) edges.push({ output: out, ...imp });
  for (const e of edges) {
    assert.equal(e.external, true, "non-external import edge: " + JSON.stringify(e));
    assert.match(e.path, /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|react-test-renderer|react-router-dom|scheduler(?:\/.*)?)$/, "unexpected external: " + e.path);
  }
  fs.writeFileSync(DIR + "o030-page-import-edges.json", JSON.stringify(edges, null, 2));
}
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(loaded[candidatePath(name)], h, "candidate loaded " + name);
assert.ok(loaded[F + "foundationSaveSession.js"], "real save-session loaded");
assert.ok(loaded[F + "foundationConstructionChecks.js"], "candidate checks module loaded");
fs.writeFileSync(DIR + "o030-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page, calcProject } =
  await import(pathToFileURL(path.resolve(DIR + "o030-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { useNavigate, useLocation, MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const { fixture: seed } = read(SPEC.fixtureArtifact);
const settingsRows = (mutate = {}) => Object.entries({ ...seed.settings, ...mutate })
  .map(([k, v]) => ({ setting_name: k, setting_value: v }));
const makeProject = (items, extras = {}) => ({
  id: SPEC.sourceId, updated_date: SPEC.sourceVersion, project_name: "P",
  project_concrete_type: seed.project.project_concrete_type,
  project_concrete_admixtures: [...seed.project.project_concrete_admixtures],
  items, poles: [], wall_caps: [], walls: [],
  selected_equipment: [], signage_cabinets: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
  excavation_method: seed.project.excavation_method,
  total_concrete_cost: seed.project.total_concrete_cost,
  concrete_delivery_snapshot: JSON.parse(JSON.stringify(seed.project.concrete_delivery_snapshot)),
  ...extras,
});
const seedItems = () => JSON.parse(JSON.stringify(seed.project.items));
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
  globalThis.__labRows = opts.laborRows ?? [];
  globalThis.__setRows = opts.settingsRows ?? settingsRows();
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? ROUTE] },
      React.createElement(LocSpy), React.createElement(NavSpy), React.createElement(Page)));
    await flush();
  });
  return c;
};
const elByType = (c, name) => c.root.findAll((el) => el.type?.name === name);
const totalsPanel = (c) => { const e = elByType(c, "FoundationTotals"); assert.ok(e.length, "FoundationTotals mounted"); return e[0]; };
const itemCard = (c) => { const e = elByType(c, "FoundationItemCard"); assert.ok(e.length, "FoundationItemCard mounted"); return e[0]; };
const toolbarProp = (c, key) => {
  const els = c.root.findAll((el) => typeof el.props?.[key] === "function");
  return els.length ? els[0].props[key] : null;
};
const textOf = (node) => {
  let out = "";
  const walk = (x) => {
    if (x == null || typeof x === "boolean") return;
    if (typeof x === "string" || typeof x === "number") { out += x + " "; return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x.findAll === "function" && Array.isArray(x.children)) { x.children.forEach(walk); return; }
    if (x.props?.children !== undefined) walk(x.props.children);
  };
  walk(node);
  return out.replace(/\s+/g, " ").trim();
};
const alertText = (c) => c.root.findAll((el) => el.props?.role === "alert").map(textOf).join(" | ");
const statusText = (c) => c.root.findAll((el) => el.props?.role === "status").map(textOf).join(" | ");
const spyCount = (k) => globalThis.__spies.filter((x) => x[0] === k).length;
const unmountAll = async (c) => { try { await act(async () => c.unmount()); } catch {} };
const editName = async (c) => {
  const input = c.root.findAll((el) => el.type === "input" && el.props?.value === "P")[0];
  assert.ok(input, "project name input by exact value");
  await act(async () => { input.props.onChange({ target: { value: "Edited" } }); });
};
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
  alertText: alertText(c), statusText: statusText(c),
  spies: JSON.parse(JSON.stringify(globalThis.__spies)),
});
const BLOCKED_MSG = SPEC.blockedSaveMessage;

// case 1 — baseline project renders the spoil advisory on role="status",
// NOT in role="alert", does not hold the item, and saves cleanly.
await check("warnings-render-not-blocking-save", async () => {
  const c = await mount({ project: makeProject(seedItems()) });
  try {
    const status = statusText(c);
    assert.ok(status.includes("Construction checks"), "warning header rendered: " + status.slice(0, 400));
    assert.ok(status.includes("125%"), "spoil assumption rendered");
    assert.ok(status.includes("haul-off"), "spoil haul-off advisory rendered");
    assert.ok(!alertText(c).includes("Construction checks"), "warnings must not appear in alert banners");
    assert.equal(totalsPanel(c).props.pricingUnavailable, false, "pricing not blocked");
    assert.equal(itemCard(c).props.pricing.available, true, "item priced");
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    assert.equal(spyCount("saveSource"), 1);
    assert.equal(spyCount("recordBuilderSave"), 1);
    capture(c, { caseId: "warnings-render-not-blocking-save", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 2 — the full advisory set renders together: equipment method
// unpriced, forming-only mismatch, calcium chloride + rebar + retarder
// pace conflict — all role="status", save still succeeds.
await check("advisory-set-renders-and-saves", async () => {
  const items = seedItems();
  Object.assign(items[0], {
    excavation_method: "equipment_excavation", include_finishing: false,
    include_rebar: true, rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
  });
  const project = makeProject(items, {
    project_concrete_admixtures: ["calcium_chloride", "set_retarding"],
  });
  const c = await mount({ project });
  try {
    const status = statusText(c);
    for (const needle of [
      "Construction checks", "125%", "equipment excavation is priced as crew hours",
      "forming is priced but top finishing is not", "corrodes rebar", "accelerating",
    ]) assert.ok(status.includes(needle), "missing advisory text: " + needle + " :: " + status.slice(0, 600));
    assert.ok(!alertText(c).includes("corrodes rebar"), "advisory leaked into alert channel");
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    assert.equal(spyCount("saveSource"), 1);
    capture(c, { caseId: "advisory-set-renders-and-saves", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 3 — a fully consistent item (forming+finishing, recorded method,
// recorded mix, no admixtures) emits only the standing spoil advisory.
await check("clean-project-single-advisory", async () => {
  const c = await mount({ project: makeProject(seedItems()) });
  try {
    const calc = calcProject(globalThis.__project, seedInv(), seed.settings, { savedProject: globalThis.__project });
    assert.deepEqual((calc.constructionWarnings || []).map(w => w.code), ["excavation_spoil_unaccounted"]);
    const status = statusText(c);
    assert.ok(status.includes("125%"));
  } finally { await unmountAll(c); }
});

// case 4 — empty project renders no warning panel at all.
await check("empty-project-no-warning-panel", async () => {
  const c = await mount({ project: makeProject([]) });
  try {
    assert.ok(!statusText(c).includes("Construction checks"), "panel must not render with zero warnings");
  } finally { await unmountAll(c); }
});

// case 5 — existing blocking still blocks; the advisory warning may coexist
// but the save outcome/zero-writes come from the blocking channel only.
await check("blocking-issue-still-blocks-with-warning-present", async () => {
  const items = seedItems();
  Object.assign(items[0], { length_inches: 0, include_finishing: false });
  const c = await mount({ project: makeProject(items) });
  try {
    assert.equal(itemCard(c).props.pricing.available, false, "item held");
    assert.ok(alertText(c).includes("Design input required"), "blocking banner present");
    const status = statusText(c);
    assert.ok(status.includes("forming is priced but top finishing is not"),
      "authored-choice advisory still rendered: " + status.slice(0, 400));
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed");
    assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "blocking-issue-still-blocks-with-warning-present", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 6 — the editor's load path materializes the mix default itself
// (`project_concrete_type || "4000_ae"` on the merged record), so a raw
// record lacking a mix enters the editor already holding the default: the
// advisory correctly does NOT fire on normalized state, while a direct
// calcProject call on the same unnormalized record still emits it (the
// check protects raw-record consumers). The all-bagged admixture advisory
// remains renderable in the editor.
await check("load-materialized-mix-no-advisory-bagged-admix-renders", async () => {
  const items = seedItems();
  items[0].selected_concrete_id = "synthetic-bagged";
  const c = await mount({
    project: makeProject(items, { project_concrete_type: null, project_concrete_admixtures: ["set_retarding"] }),
  });
  try {
    const status = statusText(c);
    assert.ok(status.includes("bagged concrete"), "bagged-only admixture advisory rendered: " + status.slice(0, 500));
    assert.ok(!status.includes("no mix strength"), "materialized mix default is a recorded choice, not an advisory");
    // A raw record that DOES have ready-mix but no recorded mix still emits
    // the fallback advisory — the check protects unnormalized consumers.
    const rawReadyMix = calcProject(makeProject(seedItems(), { project_concrete_type: null }), seedInv(), seed.settings, {});
    assert.ok((rawReadyMix.constructionWarnings || []).some(w => w.code === "concrete_mix_unspecified"),
      "raw-record calc still surfaces the silent fallback: " + JSON.stringify(rawReadyMix.constructionWarnings));
    const rawCalc = calcProject(globalThis.__project, seedInv(), seed.settings, {});
    assert.ok((rawCalc.constructionWarnings || []).some(w => w.code === "admixtures_without_ready_mix"));
    assert.deepEqual(rawCalc.catalogIssues, [], "no catalog issues");
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    capture(c, { caseId: "load-materialized-mix-no-advisory-bagged-admix-renders" });
  } finally { await unmountAll(c); }
});

const pass = results.every(r => r.ok);
fs.writeFileSync(DIR + "o030-page-verification.json", JSON.stringify({ results, pass, proof }, null, 1));
console.log((pass ? "PASS" : "FAIL") + " o030-page " + results.filter(r => r.ok).length + "/" + results.length);
if (!pass) process.exit(1);
