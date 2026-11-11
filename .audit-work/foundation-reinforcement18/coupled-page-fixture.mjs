import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { coupledBuilderStore } from "./coupled-builder-store.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const rawDraft = JSON.parse(fs.readFileSync(DIR + "versioned-persistence-frozen-inputs.json", "utf8")).rawDraft;
const dummy = name => `export default function Component(p){
  const env=globalThis.__coupledPage;
  if(${JSON.stringify(name)}==="Panel")env.panels.set(p.item.component_id,p);
  else if(${JSON.stringify(name)}==="Card")env.cards.set(p.item.component_id,p);
  else env.caps[${JSON.stringify(name)}]=p;
  return null;
}`;
const virtual = {
  "@/api/base44Client": `
    export const base44={entities:new Proxy({},{get(_,key){return globalThis.__coupledBuilder.entity(key);}}),
      functions:{invoke:(...args)=>globalThis.__coupledBuilder.invoke(...args)},auth:{me:async()=>({id:"synthetic-owner"})}};
    export const isRetryableFunction=()=>false;`,
  "@/components/staff/staffEntities": `export const staffEntities=new Proxy({},{get(_,key){return globalThis.__coupledBuilder.entity(key);}});`,
  "react-router-dom": `export const Link=()=>null;export const useNavigate=()=>url=>globalThis.__coupledPage.nav.push(url);`,
  "@/components/auth/EmailGate": `
    export const useAuth=()=>({currentUser:{id:"synthetic-owner"}});
    export const getSessionToken=()=>"synthetic-session-not-real";`,
  "@/components/ui/input": `export const Input=()=>null;`,
  "@/components/ui/tabs": ["Tabs", "TabsContent", "TabsList", "TabsTrigger"].map(name => `export const ${name}=p=>p.children??null;`).join(""),
  "@/components/markup/CustomerPricingTab": dummy("CustomerPricingTab"),
};
for (const name of ["FoundationRatesPanel", "FoundationEquipmentTab", "FoundationTotals", "ConcreteDeliveryPanel", "FoundationBOM",
  "FoundationWallsPanel", "FoundationWallCapsPanel", "FoundationPolesPanel", "FoundationToolbar", "FoundationSectionBanner",
  "AiEngineeringAssistant", "Foundation3DPreview", "FoundationTemplateDialog", "FoundationLayoutCanvas", "SignageCabinetsPanel",
  "LandscapeDesigner", "CustomerPricingPanel"]) virtual["@/components/estimator/foundation/" + name] = dummy(name);
virtual["@/components/estimator/foundation/FoundationReinforcementProposalPanel"] = dummy("Panel");
virtual["@/components/estimator/foundation/FoundationItemCard"] = dummy("Card");
let Page;
export async function buildCoupledPage({ sourceOverrides = {}, artifactPrefix = "coupled-page", versioned = true } = {}) {
  const outfile = DIR + artifactPrefix + "-bundle.mjs";
  const built = await build({
    entryPoints: ["src/pages/FoundationEstimator.jsx"], outfile, bundle: true, format: "esm", platform: "node",
    jsx: "automatic", metafile: true, external: ["react", "react-dom", "react-test-renderer"],
    // CJS deps in the page graph emit __require shims that throw in ESM;
    // createRequire resolves them (e.g. require("react")) via real node.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    plugins: [{ name: "linked-page-synthetic-boundaries-and-presentation", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (virtual[args.path]) return { path: args.path, namespace: "synthetic" };
        if (args.path.startsWith("@/")) return builder.resolve(path.resolve("src", args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() });
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: virtual[args.path], loader: "js" }));
      builder.onLoad({ filter: /\.(?:[jt]sx?|json)$/, namespace: "file" }, args => {
        const relative = path.relative(process.cwd(), args.path).split(path.sep).join("/");
        if (typeof sourceOverrides[relative] !== "string") return null;
        const extension = path.extname(relative).slice(1);
        return { contents: sourceOverrides[relative], loader: extension, resolveDir: path.dirname(args.path) };
      });
    } }],
  });
  for (const file of ["src/pages/FoundationEstimator.jsx", "src/components/estimator/foundation/foundationCalc.js",
    "src/components/estimator/foundation/foundationSaveSession.js",
    "src/components/estimator/foundation/foundationSyncRecovery.js", "src/components/estimator/builder/sourceProjectPersistence.js",
    "src/components/estimator/builder/builderService.js", "src/components/estimator/builder/partSync.js",
    "src/components/estimator/builder/builderMutationRecovery.js", "src/components/estimator/customerPricing.js",
    "src/components/estimator/estimateMutationGuard.js", "src/components/estimator/estimatePersistence.js",
    "src/components/estimator/builder/builderEntityPersistence.js"]) assert.ok(built.metafile.inputs[file], "Actual helper required: " + file);
  assert.ok(!Object.keys(built.metafile.inputs).some(input => /src\/api\/base44Client\.js|node_modules\/@base44\//.test(input)));
  if (versioned) assert.ok(built.metafile.inputs["src/components/estimator/foundation/useFoundationReinforcementEditor.js"]);
  else {
    for (const file of ["useFoundationReinforcementEditor.js", "foundationReinforcementModel.js", "foundationReinforcementPartDescriptors.js"]) {
      assert.ok(!Object.keys(built.metafile.inputs).some(input => input.endsWith("/" + file)), "Legacy candidate must not activate v2: " + file);
    }
  }
  if (Object.keys(sourceOverrides).length) {
    for (const input of Object.keys(built.metafile.inputs).filter(input => input.startsWith("src/"))) {
      assert.equal(typeof sourceOverrides[input], "string", "Remote candidate must not fall back to local business source: " + input);
    }
  }
  fs.writeFileSync(DIR + artifactPrefix + "-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = () => { throw Error("External requests prohibited in linked-page fixture"); };
  // Some dependencies read window during module initialization; only this
  // in-memory browser stand-in exists, never the user's browser session.
  const temporary = environment();
  install(temporary);
  ({ default: Page } = await import(pathToFileURL(path.resolve(outfile))));
}
export function environment() {
  const source = {
    id: "page-source", updated_date: "version-1", project_name: "Synthetic page only", client_name: "Synthetic",
    items: [{ component_id: "one", foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36,
      depth_inches: 36, include_rebar: true, include_finishing: true, rebar_size: "#4", rebar_cost: 262.8, item_total_cost: 439.05 }],
    signage_cabinets: [{ unit_cost: 12, quantity: 2 }], landscape: { cell_size_inches: 12, cells: { "0,0": "grass" } },
  };
  const initial = {
    FoundationProject: [source],
    FoundationInventory: [{ id: "catalog-rebar", material_name: "Synthetic #4", material_type: "rebar", rebar_size: "#4",
      show_in_foundation: true, cost_per_unit: 2, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, unit: "ft", updated_date: "version-1" }],
    LaborServiceInventory: [], Settings: [],
    AllInOneEstimate: [{ id: "coupled-estimate", status: "draft", deleted: false, updated_date: "version-1", line_items: [
      { line_id: "unrelated-line", module_key: "painting", project_id: source.id, total_snapshot: 345, sentinel: ["untouched"] },
      { line_id: "coupled-foundation-line", module_key: "foundation", project_id: source.id, builder_product_id: "coupled-foundation-builder",
        total_snapshot: 0, customer_price_snapshot: 0 },
    ] }],
    BuilderProduct: [
      { id: "unrelated-builder", estimate_id: "coupled-estimate", module_key: "painting", source_project_id: source.id,
        updated_date: "version-1", frozen_cost: 345, builder_snapshot: { sentinel: "untouched" } },
      { id: "coupled-foundation-builder", estimate_id: "coupled-estimate", estimate_line_id: "coupled-foundation-line", module_key: "foundation",
        source_project_id: source.id, source_entity: "FoundationProject", updated_date: "version-1",
        frozen_cost: 0, frozen_customer_price: 0, price_state: "unchecked", builder_version: 1 },
    ],
    BuilderPart: [{ id: "unrelated-part", builder_product_id: "unrelated-builder", frozen_extended_cost: 48, sentinel: "untouched" }],
    BuilderPartGroup: [], BuilderPriceRevision: [],
  };
  return { store: coupledBuilderStore(initial), initial: structuredClone(initial), storage: new Map(), local: new Map([
    ["sss_session_token", "synthetic-session-not-real"],
  ]), caps: {}, panels: new Map(), cards: new Map(), nav: [], savedObservers: 0 };
}
function install(env) {
  globalThis.__coupledPage = env; globalThis.__coupledBuilder = env.store;
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  globalThis.window = {
    location: { search: "?id=page-source&estimateId=coupled-estimate", href: "http://coupled.invalid/?id=page-source&estimateId=coupled-estimate", origin: "http://coupled.invalid" },
    confirm: () => true, addEventListener() {}, removeEventListener() {},
    sessionStorage: storage(env.storage), localStorage: storage(env.local),
  };
  // The O-004 dirty-route-leave guard registers a capture-phase document
  // click listener; a no-op document stand-in keeps Node mounts working.
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  globalThis.alert = message => { throw Error("Unexpected alert: " + message); };
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
export async function mount(env = environment()) {
  install(env);
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Page, { onSaved: () => { env.savedObservers++; } })); }); await flush();
  return {
    env, renderer, panel: () => env.panels.get("one"), toolbar: () => env.caps.FoundationToolbar,
    async invoke(name, ...args) { await act(async () => { env.panels.get("one")[name](...args); }); await flush(); },
    async cardEdit(changes) {
      await act(async () => { const card = env.cards.get("one"); card.onChange(card.index, changes); }); await flush();
    },
    async save() {
      let result; await act(async () => { result = await env.caps.FoundationToolbar.onSave(); }); await flush();
      env.lastOutcome = result; return result;
    },
    async retry() {
      const button = renderer.root.findAllByType("button").find(node => node.children.join("") === "Review and retry Save");
      assert.ok(button && !button.props.disabled, "Recovery retry must be available");
      let result; await act(async () => { result = await button.props.onClick(); }); await flush();
      env.lastOutcome = result; return result;
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
export async function acceptVersionTwo(m) {
  await m.invoke("onStart"); await m.invoke("onDraftChange", structuredClone(rawDraft)); await m.invoke("onPreview");
  const warnings = [...m.panel().preview.warningCodes];
  await m.invoke("onAcknowledgmentsChange", { preliminary: true, warningCodes: warnings });
  await m.invoke("onPreview"); assert.equal(m.panel().preview.canAccept, true);
  assert.equal(m.panel().preview.costs.find(row => row.label === "Proposed section").value, "$694.00");
  await m.invoke("onAccept", m.panel().preview.id);
  assert.equal(m.toolbar().total, 694);
  assert.ok(!m.env.store.audit.some(event => event.entity === "FoundationProject" && event.method === "updateMany"));
}
