// Supplier-defaults availability hardening — real-page proof (7 cases;
// 3 candidates: legacyFoundationCalc + foundationCalc + ConcreteDeliveryPanel,
// remote-frozen FoundationEstimator page). Uses
// supplier-defaults-flow-proof-spec.json. Stubs are limited to
// staff-entity/service boundaries and visual leaf components; calcProject,
// the delivery panel, equipment bindings/pricing, catalog integrity,
// save-session, recovery, assembly, and sourcePatchMatches are real.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement23/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "supplier-defaults-flow-proof-spec.json", "utf8"));
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
  sources.set(F + name, fs.readFileSync(DIR + file, "utf8"));
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(hash(sources.get(F + name)), h, "candidate " + name);
for (const name of ["poleCalculator.js", "wallCapCalculator.js", "wallCalculator.js",
    "FoundationWallCapsPanel.jsx", "FoundationTotals.jsx", "foundationCatalogIntegrity.js",
    "foundationEquipmentBindings.js", "foundationInputValidation.js",
    "FoundationPolesPanel.jsx", "FoundationWallsPanel.jsx", "FoundationItemCard.jsx",
    "FoundationBOM.jsx", "FoundationRatesPanel.jsx", "WallShapeEditor.jsx",
    "FoundationEquipmentTab.jsx", "legacyFoundationCalc.js", "foundationCalc.js",
    "ConcreteDeliveryPanel.jsx"])
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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline supplier proof"); };

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
  "@/components/staff/staffEntities": `export const staffEntities={FoundationProject:{get:async(id)=>{globalThis.__spies.push(['projectGet',id]);return globalThis.__project;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("FoundationProject.update not permitted in supplier proof");},updateMany:async(query,patch)=>{globalThis.__spies.push(['saveSource',{query,patch}]);const p=globalThis.__project;if(p&&p.id===query?.id&&p.updated_date===query?.updated_date){globalThis.__project={...p,...(patch?.$set||{}),id:query.id,updated_date:globalThis.__savedVersion};return{updated:1};}return{updated:0};}},FoundationInventory:globalThis.__entInv||(globalThis.__entInv={__ent:'inv'}),LaborServiceInventory:globalThis.__entLab||(globalThis.__entLab={__ent:'lab'}),Settings:globalThis.__entSet||(globalThis.__entSet={__ent:'set'}),AllInOneEstimate:{get:async(id)=>{globalThis.__spies.push(['estimateGet',id]);return globalThis.__estimates?.[id]??globalThis.__estimate;},update:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.update not permitted in supplier proof");},updateMany:async()=>{globalThis.__unexpectedSdk++;throw Error("AllInOneEstimate.updateMany not permitted in supplier proof");}}};`,
  "@/components/estimator/foundation/convertToBrickStone": `export const convertFoundationToBrickStone=async()=>{globalThis.__spies.push(['converter']);return{id:'d1'};};`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export const createEstimateReadOnlyShareLink=async()=>'/share';`,
  "@/components/utils": `export const createPageUrl=(n)=>'/'+n;`,
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
STUBS["@/api/base44Client"] = `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the supplier page proof");};
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
const entry = "/app/supplier-page-entry.jsx";
sources.set(entry, `
export { default as Page } from "/app/src/pages/FoundationEstimator.jsx";
export { resolveFoundationEquipment } from "/app/src/components/estimator/foundation/foundationEquipmentBindings.js";
export { foundationProjectInputIssues } from "/app/src/components/estimator/foundation/foundationInputValidation.js";
export { calcProject, calcEquipmentPricing } from "/app/src/components/estimator/foundation/foundationCalc.js";
`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: DIR + "supplier-page-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(pageBuild.warnings, []);
assert.ok(!Object.keys(pageBuild.metafile.inputs).some(f => /base44Client\.js|node_modules\/@base44/.test(f)),
  "The supplier page proof must not bundle a real SDK boundary.");
{
  const edges = [];
  for (const [out, info] of Object.entries(pageBuild.metafile.outputs))
    for (const imp of info.imports || []) edges.push({ output: out, ...imp });
  for (const e of edges) {
    assert.equal(e.external, true, "non-external import edge: " + JSON.stringify(e));
    assert.match(e.path, /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|react-test-renderer|react-router-dom|scheduler(?:\/.*)?)$/, "unexpected external: " + e.path);
  }
  fs.writeFileSync(DIR + "supplier-page-import-edges.json", JSON.stringify(edges, null, 2));
}
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(loaded[F + name], h, "candidate loaded " + name);
assert.ok(loaded[F + "foundationSaveSession.js"], "real save-session loaded");
fs.writeFileSync(DIR + "supplier-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page, calcProject } =
  await import(pathToFileURL(path.resolve(DIR + "supplier-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { useNavigate, useLocation, MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const { fixture: seed } = read(SPEC.fixtureArtifact);
const settingsRows = () => Object.entries(seed.settings).map(([k, v]) => ({ setting_name: k, setting_value: v }));
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
  globalThis.__setRows = opts.settings ? (Array.isArray(opts.settings) ? opts.settings : Object.entries(opts.settings).map(([k,v])=>({setting_name:k,setting_value:v}))) : settingsRows();
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? ROUTE] },
      React.createElement(LocSpy), React.createElement(NavSpy), React.createElement(Page)));
    await flush();
  });
  return c;
};
const elByType = (c, name) => c.root.findAll((el) => el.type?.name === name);
const deliveryPanel = (c) => { const e = elByType(c, "ConcreteDeliveryPanel"); assert.ok(e.length, "ConcreteDeliveryPanel mounted"); return e[0]; };
const totalsPanel = (c) => { const e = elByType(c, "FoundationTotals"); assert.ok(e.length, "FoundationTotals mounted"); return e[0]; };
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
    if (x.props?.children !== undefined) walk(x.props.children);
  };
  walk(node);
  return out.replace(/\s+/g, " ").trim();
};
const bannerText = (c) => c.root.findAll((el) => el.props?.role === "alert").map(textOf).join(" | ");
const spyCount = (k) => globalThis.__spies.filter((x) => x[0] === k).length;
const unmountAll = async (c) => { try { await act(async () => c.unmount()); } catch {} };
const editName = async (c) => {
  const input = c.root.findAll((el) => el.type === "input" && el.props?.value === "P")[0];
  assert.ok(input, "project name input by exact value");
  await act(async () => { input.props.onChange({ target: { value: "Edited" } }); });
};
const BLOCKED_MSG = SPEC.blockedSaveMessage;
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
  acknowledged: JSON.parse(JSON.stringify(globalThis.__project)),
  renderedDelivery: JSON.parse(JSON.stringify(deliveryPanel(c).props.delivery)),
  inventory: JSON.parse(JSON.stringify(globalThis.__invRows ?? null)),
  totals: JSON.parse(JSON.stringify(totalsPanel(c).props.totals)),
  pricingUnavailable: totalsPanel(c).props.pricingUnavailable,
  spies: JSON.parse(JSON.stringify(globalThis.__spies)),
});
const EV = seed.expectedValid;
const SUP = "synthetic-readymix";

// case 1 — missing mix price holds acknowledged amounts + blocks save
await check("held-missing-mix-blocks-save", async () => {
  const inv = seedInv();
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const c = await mount({ project: makeProject(seedItems()), inventory: inv });
  try {
    const delivery = deliveryPanel(c).props.delivery;
    assert.equal(delivery.pricingUnavailable, true);
    assert.equal(delivery.concreteTotal, EV.heldConcreteTotal, "acknowledged snapshot held");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_concrete_cost, EV.heldConcreteCostTotal);
    assert.equal(totals.grand_total, EV.heldGrandTotal);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    const banner = bannerText(c);
    assert.ok(banner.includes("supplier") && banner.includes("4000 AIR ENTRAINED"), "issue message rendered: " + banner.slice(0, 200));
    const calc = calcProject(globalThis.__project, inv, seed.settings, { savedProject: globalThis.__project });
    assert.ok(calc.catalogIssues.some((i) => i.code === "supplier_price_unavailable" && i.field === "mix_4000_price"));
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "held-missing-mix-blocks-save", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 2 — valid supplier saves the freshly captured delivery snapshot
await check("valid-supplier-saves-delivery-snapshot", async () => {
  const c = await mount({ project: makeProject(seedItems()) });
  try {
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    assert.equal(deliveryPanel(c).props.delivery.concreteTotal, EV.delivery.concreteTotal);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    const snap = call.patch.$set.concrete_delivery_snapshot;
    assert.equal(snap.version, 1);
    assert.equal(snap.concrete_total, EV.delivery.concreteTotal);
    assert.equal(snap.rate_per_yard, EV.delivery.ratePerYard);
    assert.equal(snap.trucks[0].cost, EV.delivery.truckCost);
    assert.equal(snap.trucks[0].small_order_fee, EV.delivery.truckSmallOrderFee);
    assert.equal(snap.trucks[0].fuel_fee, EV.delivery.truckFuelFee);
    assert.equal(call.patch.$set.total_concrete_cost, EV.delivery.concreteTotal);
    capture(c, { caseId: "valid-supplier-saves-delivery-snapshot", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 3 — unsaved held delivery withholds totals (no acknowledged snapshot)
await check("unsaved-held-delivery-withholds-totals", async () => {
  const inv = seedInv();
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const project = makeProject(seedItems());
  delete project.concrete_delivery_snapshot;
  delete project.total_concrete_cost;
  const c = await mount({ project, inventory: inv });
  try {
    const delivery = deliveryPanel(c).props.delivery;
    assert.equal(delivery.pricingUnavailable, true);
    assert.equal(delivery.concreteTotal, undefined, "no snapshot → nothing acknowledged");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.grand_total, null, "withheld, not $0 or guessed");
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "unsaved-held-delivery-withholds-totals", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 4 — missing supplier price repaired through the real catalog reload
await check("held-missing-price-repaired-by-catalog-reload", async () => {
  const inv = seedInv();
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const c = await mount({ project: makeProject(seedItems()), inventory: inv });
  try {
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    // Repair the catalog row, then reload through the real banner control.
    const repaired = seedInv();
    globalThis.__invRows = repaired;
    const reload = c.root.findAll((el) => el.type === "button" && textOf(el).includes("Reload catalogs"))[0];
    assert.ok(reload, "Reload catalogs control rendered");
    await act(async () => { await reload.props.onClick(); await flush(60); });
    assert.equal(totalsPanel(c).props.pricingUnavailable, false, "block cleared after reload");
    assert.equal(deliveryPanel(c).props.delivery.concreteTotal, EV.delivery.concreteTotal, "repriced live");
    await editName(c);
    const onSave2 = toolbarProp(c, "onSave"); // fresh closure — editRevision moved
    await act(async () => { r = await onSave2(); await flush(); });
    assert.equal(r?.status, "saved", "repaired save got " + JSON.stringify(r));
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.patch.$set.concrete_delivery_snapshot.concrete_total, EV.delivery.concreteTotal);
    capture(c, { caseId: "held-missing-price-repaired-by-catalog-reload", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 5 — foreign mix selection holds + blocks save (was silently 4000 AE)
await check("foreign-mix-selection-blocks-save", async () => {
  const project = makeProject(seedItems());
  project.project_concrete_type = "9000_fantasy";
  const c = await mount({ project });
  try {
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_concrete_cost, EV.heldConcreteCostTotal);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    const calc = calcProject(globalThis.__project, seedInv(), seed.settings, { savedProject: globalThis.__project });
    assert.ok(calc.catalogIssues.some((i) => i.field === "project_concrete_type"), "project_concrete_type issue");
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "foreign-mix-selection-blocks-save", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 6 — explicit-zero fuel surcharge is a legitimate free fee and saves
await check("free-zero-fuel-surcharge-saves", async () => {
  const inv = seedInv();
  inv.find((i) => i.id === SUP).fuel_surcharge = 0;
  const c = await mount({ project: makeProject(seedItems()), inventory: inv });
  try {
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    assert.equal(deliveryPanel(c).props.delivery.concreteTotal, EV.fuelZeroTotal);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.patch.$set.concrete_delivery_snapshot.trucks[0].fuel_fee, 0, "authored 0 fee persisted");
    assert.equal(call.patch.$set.concrete_delivery_snapshot.concrete_total, EV.fuelZeroTotal);
    capture(c, { caseId: "free-zero-fuel-surcharge-saves", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 7 — numeric-string catalog prices normalize for pricing; authored strings persist nowhere
await check("string-prices-normalize-and-save", async () => {
  const inv = seedInv();
  const sup = inv.find((i) => i.id === SUP);
  sup.mix_4000_price = "210"; sup.admix_calcium_chloride_price = "9";
  sup.small_load_fee_1_1_75 = "145"; sup.fuel_surcharge = "35";
  const c = await mount({ project: makeProject(seedItems()), inventory: inv });
  try {
    assert.equal(totalsPanel(c).props.pricingUnavailable, false);
    assert.equal(deliveryPanel(c).props.delivery.concreteTotal, EV.delivery.concreteTotal);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save got " + JSON.stringify(r));
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.patch.$set.concrete_delivery_snapshot.concrete_total, EV.delivery.concreteTotal);
    assert.equal(globalThis.__invRows.find((i) => i.id === SUP).mix_4000_price, "210", "catalog row never mutated");
    capture(c, { caseId: "string-prices-normalize-and-save", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

assert.equal(results.length, SPEC.pageCaseCount, "case count");
assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "supplier-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
fs.writeFileSync(DIR + "supplier-page-state-proof.json", JSON.stringify({ proof }, null, 2));
console.log("supplier-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
