import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const DIR = ".audit-work/foundation-reinforcement18/";
const rawDraft = JSON.parse(fs.readFileSync(DIR + "versioned-persistence-frozen-inputs.json", "utf8")).rawDraft;
const clone = structuredClone;
const dummy = name => `export default function Component(p) {
  const env=globalThis.__foundationPage;
  if(${JSON.stringify(name)}==="Panel")env.panels.set(p.item.component_id,p);
  else if(${JSON.stringify(name)}==="Card")env.cards.set(p.item.component_id,p);
  else env.caps[${JSON.stringify(name)}]=p;
  return null;
}`;
const stubs = {
  "react-router-dom": `export const Link=()=>null;export const useNavigate=()=>url=>globalThis.__foundationPage.nav.push(url);`,
  "lucide-react": ["AlertTriangle","Anchor","BookmarkPlus","Box","CheckCircle2","ChevronDown","ChevronUp","Circle","ClipboardList","Copy","Cpu","Eye","EyeOff","GitCompareArrows","Info","Landmark","Layers","LayoutGrid","LayoutTemplate","Link2","Loader2","Lock","LockKeyhole","LockOpen","MapPin","Maximize2","Move","PenLine","Plus","RefreshCw","RotateCcw","Square","Tag","Trash2","TrendingUp","Trees","Undo2","Unlink","Wrench","X","ZoomIn","ZoomOut"]
    .map(name => `export const ${name}=()=>null;`).join(""),
  "@/components/auth/EmailGate": `export const useAuth=()=>({currentUser:{id:"synthetic-owner"}});`,
  "@/components/ui/input": `export const Input=()=>null;`,
  "@/components/ui/tabs": ["Tabs", "TabsContent", "TabsList", "TabsTrigger"].map(name => `export const ${name}=p=>p.children??null;`).join(""),
  "@/components/markup/projectCategorizer": `export function categorizeFoundationProject(){throw Error("Unexpected selling-price categorization.");}`,
  "@/components/markup/savedCustomerPricing": `export function calculateSavedCustomerPricing(){throw Error("Unexpected customer selling-price calculation.");}`,
  "@/components/markup/CustomerPricingTab": dummy("CustomerPricingTab"),
  "@/components/estimator/builder/builderService": `export function recordBuilderSave(){throw Error("Unlinked offline source must not write Builder records.");}export const foundationRecordSavedTotal=r=>{if(!r||typeof r!=='object')return null;const f=['total_concrete_cost','total_rebar_cost','total_excavation_cost','total_forming_materials_cost','total_labor_cost','total_wall_cost','total_pole_cost','total_pole_painting_cost','total_equipment_cost','total_wall_cap_cost','total_signage_cabinet_cost','total_landscape_cost'];if(f.some(k=>Number.isFinite(+r[k])))return f.reduce((t,k)=>t+(Number.isFinite(+r[k])?+r[k]:0),0);return Number.isFinite(+r.grand_total)?+r.grand_total:null;};`,
  "@/components/estimator/foundation/foundationBuilderRecovery": `
    export async function loadFoundationBuilderRecovery({estimateId}){
      if(estimateId)throw Error("Unlinked page regression must not attempt linked Builder recovery.");
      return null;
    }
    export function verifyFoundationRecoverySource(){throw Error("Unlinked page regression must not verify a linked recovery.");}`,
  "@/components/estimator/estimateMutationGuard": `export function assertEstimateProductMutationAllowed(){throw Error("Offline gate does not claim live linked-estimate authorization.");}`,
  "@/components/estimator/loadAllEntityRows": `export async function loadAllEntityRows({entity}){
    const env=globalThis.__foundationPage;env.calls.push(["load",entity.tag]);
    if(entity.tag==="FoundationInventory")return structuredClone(env.inventory);
    if(entity.tag==="Settings"||entity.tag==="LaborServiceInventory")return [];
    throw Error("Unexpected collection read: "+entity.tag);
  }`,
  "@/lib/loadAllEntityRows": `export async function loadAllEntityRows({entity}){
    const env=globalThis.__foundationPage;env.calls.push(["load",entity.tag]);
    if(entity.tag==="FoundationInventory")return structuredClone(env.inventory);
    if(entity.tag==="Settings"||entity.tag==="LaborServiceInventory")return [];
    throw Error("Unexpected collection read: "+entity.tag);
  }`,
  "@/components/estimator/idempotentEntityCreate": `let n=0;
    export const newCreationRequestKey=prefix=>prefix+"-"+(++n);
    export function ensureIdempotentEntityCreate(){throw Error("Unexpected create in offline page gate.");}`,
  "@/components/estimator/foundation/convertToBrickStone": `export function convertFoundationToBrickStone(){throw Error("Unexpected module conversion.");}`,
  "@/components/estimator/moduleShared/moduleProjectActions": `export function createEstimateReadOnlyShareLink(){throw Error("Unexpected share API.");}`,
  "@/components/staff/staffEntities": `export const staffEntities={
    FoundationProject:{
      async get(id){const env=globalThis.__foundationPage;env.calls.push(["get",id]);return structuredClone(env.records.get(id));},
      async updateMany(query,update){
        const env=globalThis.__foundationPage;env.calls.push(["updateMany",structuredClone(query),structuredClone(update)]);
        const row=env.records.get(query.id);
        if(row.updated_date!==query.updated_date)return {updated:0};
        env.version++;env.records.set(query.id,JSON.parse(JSON.stringify({...row,...update.$set,updated_date:"saved-"+env.version})));
        return {updated:1};
      }
    },
    FoundationInventory:{tag:"FoundationInventory"},Settings:{tag:"Settings"},LaborServiceInventory:{tag:"LaborServiceInventory"},
    AllInOneEstimate:{async get(){throw Error("Unexpected linked-estimate data read.");}}
  };`,
};
const panels = ["FoundationRatesPanel", "FoundationEquipmentTab", "FoundationTotals", "ConcreteDeliveryPanel", "FoundationBOM",
  "FoundationWallsPanel", "FoundationWallCapsPanel", "FoundationPolesPanel", "FoundationToolbar", "FoundationSectionBanner",
  "AiEngineeringAssistant", "Foundation3DPreview", "FoundationTemplateDialog", "FoundationLayoutCanvas", "SignageCabinetsPanel",
  "LandscapeDesigner", "CustomerPricingPanel", "FoundationAiIntake", "FoundationPhotoIntake"];
stubs["@/components/estimator/foundation/FoundationSyncConflictDialog"] =
  `export const useFoundationSyncConflict=()=>({conflicts:[],dismiss(){},report(){}});`+
  `export const useFoundationBuilderSyncRetry=()=>({retry(){},retrying:false,lastError:null});`+
  `export const FoundationSyncRetryAction=()=>null;export default ()=>null;`;
for (const name of panels) stubs["@/components/estimator/foundation/" + name] = dummy(name);
stubs["@/components/estimator/foundation/FoundationReinforcementProposalPanel"] = dummy("Panel");
stubs["@/components/estimator/foundation/FoundationItemCard"] = dummy("Card");
const built = await build({
  entryPoints: ["src/pages/FoundationEstimator.jsx"], bundle: true, format: "esm", platform: "node",
  jsx: "automatic", outfile: DIR + "page-reinforcement-test-bundle.mjs", metafile: true,
  external: ["react", "react-dom", "react-test-renderer"],
  plugins: [{ name: "offline-page-io-only", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "offline" } : null);
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({
      contents: stubs[args.path], loader: "js", resolveDir: process.cwd(),
    }));
  } }],
});
const inputs = Object.keys(built.metafile.inputs);
for (const file of ["src/pages/FoundationEstimator.jsx", "src/components/estimator/foundation/useFoundationReinforcementEditor.js",
  "src/components/estimator/foundation/foundationReinforcementEditorSession.js", "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/foundationReinforcementProposal.js",
  "src/components/estimator/builder/sourceProjectPersistence.js", "src/components/estimator/foundation/foundationDraftRecovery.js"])
  assert.ok(inputs.includes(file), "Must exercise actual " + file);
const sdkLeaks = inputs.filter(file => file.includes("base44Client") || file.includes("node_modules/@base44/"));
if (sdkLeaks.length) console.log("sdk-boundary leaks:", sdkLeaks.join(", "));
assert.ok(!sdkLeaks.length);
fs.writeFileSync(DIR + "page-reinforcement-test-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const { default: Page } = await import(pathToFileURL(path.resolve(DIR + "page-reinforcement-test-bundle.mjs")));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const base = {
  id: "page-source", updated_date: "version-1", project_name: "Synthetic page only", client_name: "Synthetic",
  items: [{ component_id: "one", foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36,
    depth_inches: 36, include_rebar: true, include_finishing: true, rebar_size: "#4", rebar_cost: 262.8, item_total_cost: 439.05 }],
  signage_cabinets: [{ unit_cost: 12, quantity: 2 }], landscape: { cell_size_inches: 12, cells: { "0,0": "grass" } },
};
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
function environment(record = base) {
  const storage = new Map();
  return {
    records: new Map([[record.id, clone(record)]]), inventory: [{ id: "catalog-rebar", material_type: "rebar", rebar_size: "#4",
      cost_per_unit: 2, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, unit: "ft" }],
    calls: [], caps: {}, panels: new Map(), cards: new Map(), nav: [], storage, storageWrites: 0, version: 1,
  };
}
async function mount(env = environment(), id = "page-source") {
  globalThis.__foundationPage = env;
  globalThis.window = {
    location: { search: "?id=" + id }, confirm: () => true, addEventListener() {}, removeEventListener() {},
    sessionStorage: {
      getItem: key => env.storage.get(key) ?? null,
      setItem: (key, value) => { env.storageWrites += 1; env.storage.set(key, value); },
      removeItem: key => env.storage.delete(key),
    },
  };
  // The O-004 dirty-route-leave guard registers a capture-phase document
  // click listener; a no-op document stand-in keeps the Node mount working.
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  globalThis.alert = message => { throw Error("Unexpected alert: " + message); };
  let renderer, closed = false;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Page)); }); await flush();
  return {
    env, panel: (key = "one") => env.panels.get(key), toolbar: () => env.caps.FoundationToolbar,
    async invoke(name, ...args) { await act(async () => { env.panels.get("one")[name](...args); }); await flush(); },
    async toolbarAction(name) { let result; await act(async () => { result = await env.caps.FoundationToolbar[name](); }); await flush(); return result; },
    async cardEdit(changes) { await act(async () => { const card = env.cards.get("one"); card.onChange(card.index, changes); }); await flush(); },
    async reroute(nextId) { window.location.search = "?id=" + nextId; await act(async () => { renderer.update(React.createElement(Page)); }); await flush(); },
    async click(text) {
      const button = renderer.root.findAllByType("button").find(node => node.children.join("") === text);
      assert.ok(button, text); await act(async () => { button.props.onClick(); }); await flush();
    },
    async close() { if (!closed) { closed = true; await act(async () => { renderer.unmount(); }); } },
  };
}
async function prepare(m) {
  await m.invoke("onStart"); await m.invoke("onDraftChange", clone(rawDraft)); await m.invoke("onPreview");
  const first = m.panel().preview; assert.ok(first?.warningCodes);
  await m.invoke("onAcknowledgmentsChange", { preliminary: true, warningCodes: [...first.warningCodes] });
  assert.equal(m.panel().preview.stale, true);
  await m.invoke("onPreview"); assert.equal(m.panel().preview.canAccept, true);
  return m.panel().preview.id;
}
const cents = value => Math.round(value * 100);
const writes = m => m.env.calls.filter(call => call[0] === "updateMany");
const results = [];
async function check(name, run) {
  const m = await mount();
  try { await run(m); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
  finally { await m.close(); }
}
await check("actual page draft edits and acknowledgments leave live legacy steel and section prices unchanged with no backend writes", async m => {
  assert.ok(m.panel()); assert.equal(m.panel().disabled, false); assert.equal(cents(m.toolbar().total), 83480);
  await m.invoke("onStart"); await m.invoke("onDraftChange", clone(rawDraft));
  assert.equal(cents(m.env.cards.get("one").item.rebar_cost), 25280); assert.equal(cents(m.toolbar().total), 83480);
  const backups = m.env.storageWrites;
  await m.invoke("onPreview");
  await m.invoke("onAcknowledgmentsChange", { preliminary: true, warningCodes: [...m.panel().preview.warningCodes] });
  assert.equal(m.env.storageWrites, backups); assert.equal(writes(m).length, 0);
});
await check("actual page preview distinguishes saved, current and proposed prices and includes full section delta", async m => {
  await prepare(m);
  const cost = label => m.panel().preview.costs.find(row => row.label === label).value;
  assert.equal(cost("Saved steel"), "$262.80"); assert.equal(cost("Current steel"), "$252.80");
  assert.equal(cost("Proposed steel"), "$112.00"); assert.equal(cost("Current section"), "$834.80");
  assert.equal(cost("Proposed section"), "$694.00"); assert.equal(cost("Section delta"), "$-140.80");
  assert.equal(writes(m).length, 0);
});
await check("real page acceptance is one Undo and Redo, consumes its exact ID, and never saves immediately", async m => {
  const id = await prepare(m), beforeDraft = clone(m.panel().draft);
  await m.invoke("onAccept", id);
  assert.equal(cents(m.toolbar().total), 69400); assert.equal(m.env.cards.get("one").item.reinforcement_calculation_version, 2);
  assert.equal(m.panel().draft, null); assert.equal(m.toolbar().canUndo, true); assert.equal(writes(m).length, 0);
  await m.invoke("onAccept", id); assert.equal(writes(m).length, 0);
  await m.toolbarAction("onUndo");
  assert.equal(m.env.cards.get("one").item.reinforcement_calculation_version, undefined);
  assert.deepEqual(m.panel().draft, beforeDraft); assert.equal(cents(m.toolbar().total), 83480);
  assert.equal(m.toolbar().canRedo, true); assert.equal(m.panel().preview, null);
  await m.toolbarAction("onRedo"); assert.equal(cents(m.toolbar().total), 69400);
  assert.equal(m.panel().preview, null); assert.equal(writes(m).length, 0);
});
await check("manual Save uses real CAS/readback helper and persists accepted geometry, split and origin receipt", async m => {
  await m.invoke("onAccept", await prepare(m));
  const outcome = await m.toolbarAction("onSave");
  assert.equal(outcome.status, "saved"); assert.equal(writes(m).length, 1); assert.equal(writes(m)[0][1].updated_date, "version-1");
  const item = m.env.records.get("page-source").items[0];
  assert.equal(item.reinforcement_calculation_version, 2); assert.equal(item.reinforcement_design.version, 2);
  assert.equal(item.reinforcement_acceptance.component_id, "one"); assert.equal(item.reinforcement_acceptance.source_id, "page-source");
  assert.equal(item.reinforcement_cost_snapshot.engineering_approved, false);
  assert.equal(cents(item.rebar_material_cost), 4000); assert.equal(cents(item.rebar_labor_cost), 7200);
  assert.equal(item.rebar_geometry_feet, 20); assert.equal(cents(item.item_total_cost), 28825);
  assert.equal(Object.hasOwn(item, "reinforcement_proposal"), false); assert.equal(m.toolbar().dirty, false);
});
await check("Undo after successful save retains latest acknowledged CAS version instead of rewriting from the old version", async m => {
  await m.invoke("onAccept", await prepare(m)); await m.toolbarAction("onSave");
  await m.toolbarAction("onUndo");
  assert.equal(m.env.cards.get("one").item.reinforcement_calculation_version, undefined);
  const outcome = await m.toolbarAction("onSave");
  assert.equal(outcome.status, "saved"); assert.equal(writes(m).length, 2);
  assert.equal(writes(m)[1][1].updated_date, "saved-2");
  assert.ok(m.env.records.get("page-source").items[0].reinforcement_proposal);
});
await check("accepted infeasible edit displays acknowledged price, blocks Save and allows controlled repair without source writes", async m => {
  await m.invoke("onAccept", await prepare(m)); await m.toolbarAction("onSave");
  const accepted = clone(m.env.cards.get("one").item);
  await m.cardEdit({ reinforcement_design: { ...accepted.reinforcement_design, supports: { mode: "unconfigured", reason: "" } } });
  assert.equal(m.toolbar().pricingUnavailable, true); assert.equal(cents(m.env.cards.get("one").item.rebar_cost), 11200);
  const count = writes(m).length, outcome = await m.toolbarAction("onSave");
  assert.equal(outcome.status, "failed"); assert.equal(writes(m).length, count);
  assert.equal(m.panel().disabled, false);
});
await check("old proposal callback cannot accept after route change, return or reload of the same source", async m => {
  const id = await prepare(m), callback = m.panel().onAccept;
  m.env.records.set("other-source", { ...clone(base), id: "other-source" });
  await m.reroute("other-source"); await m.reroute("page-source");
  await act(async () => { callback(id); }); await flush();
  assert.equal(m.env.cards.get("one").item.reinforcement_calculation_version, undefined);
  assert.equal(m.panel().preview, null); assert.equal(writes(m).length, 0);
});
await check("raw proposal survives close and explicit browser restore without restoring a stale preview or acknowledgment", async m => {
  await prepare(m); const env = m.env; assert.ok(env.storage.size > 0);
  await m.close(); const reopened = await mount(env);
  try {
    assert.equal(reopened.panel().disabled, true); assert.equal(reopened.panel().draft, null);
    await reopened.click("Restore browser draft");
    assert.deepEqual(reopened.panel().draft, rawDraft); assert.equal(reopened.panel().preview, null);
    assert.deepEqual(reopened.panel().acknowledgments, { preliminary: false, warningCodes: [] });
    assert.equal(cents(reopened.toolbar().total), 83480); assert.equal(writes(reopened).length, 0);
  } finally { await reopened.close(); }
});
fs.writeFileSync(DIR + "page-reinforcement-verification.json", JSON.stringify({
  synthetic: true, actualPageUndoVerified: results.some(result => result.ok && result.name.startsWith("real page acceptance is one Undo")),
  liveAuthorizationVerified: false, realBase44StorageVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Foundation page reinforcement: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
