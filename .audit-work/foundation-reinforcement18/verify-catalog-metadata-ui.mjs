import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const DIR = ".audit-work/foundation-reinforcement18/";
const D = "Nominal bar diameter (in)", W = "Weight (lb/ft)";
const wrapper = name => `export const ${name}=p=>p.children??null;`;
const stubs = {
  "@/api/base44Client": `export const base44={entities:{FoundationInventory:{
    async get(id){const env=globalThis.__catalogMetaUI;env.calls.push(["get",id]);return structuredClone(env.record);}
  }}};`,
  "@/components/staff/staffEntities": `export const staffEntities={FoundationInventory:{}};`,
  "@/components/ui/dialog": ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogFooter"].map(wrapper).join(""),
  "@/components/ui/card": ["Card", "CardContent", "CardHeader", "CardTitle"].map(wrapper).join(""),
  "@/components/ui/tabs": ["Tabs", "TabsContent", "TabsList", "TabsTrigger"].map(wrapper).join(""),
  "@/components/ui/select": ["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"].map(wrapper).join(""),
  "@/components/ui/button": `import React from"react";export const Button=({children,...props})=>React.createElement("button",props,children);`,
  "@/components/ui/input": `import React from"react";export const Input=p=>React.createElement("input",p);`,
  "@/components/ui/label": `import React from"react";export const Label=p=>React.createElement("label",p);`,
  "@/components/ui/badge": wrapper("Badge"),
  "lucide-react": ["Trash2", "Plus", "Edit", "Package", "Building2", "Layers", "Wrench", "Square"].map(name => `export const ${name}=()=>null;`).join(""),
  "@/components/foundation/EquipmentInventoryTab": `export default function Component(){return null;}`,
  "@/components/foundation/WallCapsInventoryTab": `export default function Component(){return null;}`,
  "@/components/estimator/loadAllEntityRows": `export function loadAllEntityRows(){throw Error("Unexpected collection read in isolated catalog form.");}`,
  "@/components/estimator/builder/builderEntityPersistence": `
    export const expectedEntityFields=(live,data)=>Object.fromEntries(Object.keys(data).map(key=>[key,live[key]]));
    export async function replaceEntityFieldsIfUnchanged(args){const env=globalThis.__catalogMetaUI;env.calls.push(["replace",structuredClone(args.nextFields)]);if(env.wait)await env.wait;}
    export function deleteEntityIfUnchanged(){throw Error("Unexpected delete.");}`,
  "@/components/masterInventory/inventoryPersistence": `export async function createInventoryRecordWithRecovery(args){globalThis.__catalogMetaUI.calls.push(["create",structuredClone(args.data)]);}`,
};
stubs["./inventoryPersistence"] = stubs["@/components/masterInventory/inventoryPersistence"];
const plugin = {
  name: "offline-catalog-forms",
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "offline" } : null);
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
    builder.onLoad({ filter: /[\\/]src[\\/]pages[\\/]FoundationInventory\.jsx$/ }, args => ({
      // Export the private form only in this test bundle; do not replace its body.
      contents: fs.readFileSync(args.path, "utf8") + "\nexport { GenericItemForm };\n", loader: "jsx",
    }));
  },
};
async function module(entry, name) {
  const output = DIR + name + ".mjs";
  const built = await build({ entryPoints: [entry], outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic",
    metafile: true, plugins: [plugin], external: ["react", "react-dom", "react-test-renderer"] });
  const inputs = Object.keys(built.metafile.inputs);
  assert.ok(inputs.includes("src/components/estimator/foundation/FoundationReinforcementCatalogMetadataFields.jsx"));
  assert.ok(inputs.includes("src/components/estimator/foundation/foundationReinforcementCatalogMetadata.js"));
  assert.ok(!inputs.some(file => file.includes("base44Client.js") || file.includes("node_modules/@base44/")));
  fs.writeFileSync(DIR + name + "-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
  return import(pathToFileURL(path.resolve(output)));
}
const { default: Dialog } = await module("src/components/masterInventory/FoundationMaterialDialog.jsx", "catalog-meta-dialog-test");
const { GenericItemForm } = await module("src/pages/FoundationInventory.jsx", "catalog-meta-legacy-test");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.alert = value => { throw Error("Unexpected alert: " + value); };
const base = Object.freeze({ id: "synthetic-catalog", updated_date: "synthetic-version", material_type: "rebar",
  material_name: "Synthetic bar", unit: "lf", rebar_size: "#4", cost_per_unit: 2 });
const known = Object.freeze({ ...base, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 });
async function mount(record = base, legacy = false, tabKey = "rebar") {
  const env = { record, calls: [], saved: 0, wait: null };
  globalThis.__catalogMetaUI = env;
  const props = legacy
    ? { tabKey, item: record, onSave: data => env.calls.push(["legacy", structuredClone(data)]), onCancel() {} }
    : { open: true, record, defaultType: tabKey, onSaved: () => { env.saved += 1; }, onClose() {} };
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(legacy ? GenericItemForm : Dialog, props)); });
  const root = () => renderer.root;
  const input = label => root().findAllByType("input").find(node => node.props["aria-label"] === label);
  const save = () => root().findAllByType("button").find(node => node.children.join("") === "Save");
  return {
    env, input, save, root,
    async type(label, value) { assert.ok(input(label), label); await act(async () => { input(label).props.onChange({ target: { value } }); }); },
    async clickSave() { assert.equal(save().props.disabled, false); await act(async () => { await save().props.onClick(); }); },
    async typeChange(type) { await act(async () => { root().findByType("select").props.onChange({ target: { value: type } }); }); },
    async update(record) { env.record = record; await act(async () => { renderer.update(React.createElement(Dialog, { ...props, record })); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}
const results = [];
async function check(name, fn, record = base, legacy = false, tab = "rebar") {
  const m = await mount(record, legacy, tab);
  try { await fn(m); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
  finally { await m.close(); }
}
const saved = (m, kind = "replace") => m.env.calls.find(call => call[0] === kind)?.[1];
await check("catalog unknown metadata stays blank and absent on ordinary Save, never defaulted from #4", async m => {
  assert.equal(m.input(D).props.value, ""); assert.equal(m.input(W).props.value, "");
  assert.equal(m.input(W).props.placeholder, "Not recorded"); assert.equal(m.input(W).props.inputMode, "decimal");
  await m.clickSave(); assert.equal(m.env.saved, 1);
  assert.equal(Object.hasOwn(saved(m), "rebar_diameter_inches"), false);
  assert.equal(Object.hasOwn(saved(m), "rebar_weight_lb_per_ft"), false);
  assert.equal(saved(m).cost_per_unit, 2); assert.equal(base.rebar_size, "#4");
});
await check("catalog raw decimal text is preserved until Save then sent as finite numeric metadata", async m => {
  await m.type(D, ".5"); await m.type(W, " .668 ");
  assert.equal(m.input(D).props.value, ".5"); assert.equal(m.input(W).props.value, " .668 ");
  await m.clickSave();
  assert.equal(saved(m).rebar_diameter_inches, 0.5); assert.equal(saved(m).rebar_weight_lb_per_ft, 0.668);
  assert.equal(saved(m).unit, "lf"); assert.equal(Object.hasOwn(base, "rebar_diameter_inches"), false);
});
await check("explicit clearing of recorded metadata emits null unknowns rather than zero", async m => {
  await m.type(D, ""); await m.type(W, "");
  await m.clickSave(); assert.equal(saved(m).rebar_diameter_inches, null); assert.equal(saved(m).rebar_weight_lb_per_ft, null);
  assert.equal(known.rebar_weight_lb_per_ft, 0.668);
}, known);
await check("malformed and zero metadata blocks button and direct Save callback before any API request", async m => {
  for (const value of ["0", "-1", "0.5in", ".", "1e-3"]) {
    await m.type(W, value);
    assert.equal(m.save().props.disabled, true); assert.ok(m.root().findAll(node => node.props?.role === "alert").length > 0);
    await act(async () => { await m.save().props.onClick(); }); assert.deepEqual(m.env.calls, []);
  }
});
await check("imported zero remains visibly invalid until an explicit positive repair", async m => {
  assert.equal(m.input(W).props.value, 0); assert.equal(m.save().props.disabled, true);
  await m.type(W, ".668"); await m.clickSave(); assert.equal(saved(m).rebar_weight_lb_per_ft, 0.668);
}, Object.freeze({ ...base, rebar_weight_lb_per_ft: 0 }));
await check("non-rebar type Save ignores temporary metadata text while preserving the original record", async m => {
  await m.type(D, ".75"); await m.type(W, "unfinished");
  await m.typeChange("pole");
  assert.equal(m.input(D), undefined); assert.equal(m.save().props.disabled, false);
  await m.clickSave(); assert.equal(saved(m).rebar_diameter_inches, 0.5); assert.equal(saved(m).rebar_weight_lb_per_ft, 0.668);
  assert.equal(saved(m).material_type, "pole");
  await m.typeChange("rebar"); assert.equal(m.input(D).props.value, ".75"); assert.equal(m.input(W).props.value, "unfinished");
  assert.equal(m.save().props.disabled, true);
}, known);
await check("changing the dialog record resets metadata buffers instead of leaking the previous item's measurements", async m => {
  await m.type(D, ".75");
  await m.update(Object.freeze({ ...base, id: "other-synthetic-catalog", rebar_weight_lb_per_ft: 1.043 }));
  assert.equal(m.input(D).props.value, ""); assert.equal(m.input(W).props.value, 1.043);
  await m.clickSave(); assert.equal(Object.hasOwn(saved(m), "rebar_diameter_inches"), false);
  assert.equal(saved(m).rebar_weight_lb_per_ft, 1.043);
}, known);
await check("catalog Save captures one immutable update and disables all inputs while its response is pending", async m => {
  let release;
  m.env.wait = new Promise(resolve => { release = resolve; });
  const click = m.save().props.onClick;
  let operation;
  try {
    await act(async () => { operation = click(); await Promise.resolve(); await Promise.resolve(); });
    assert.equal(m.input(D).props.disabled, true); assert.equal(m.input(W).props.disabled, true);
    assert.ok(m.root().findAllByType("input").every(input => input.props.disabled === true));
    assert.equal(m.root().findByType("select").props.disabled, true);
    await act(async () => { await click(); });
    assert.equal(m.env.calls.filter(call => call[0] === "get").length, 1);
    assert.equal(m.env.calls.filter(call => call[0] === "replace").length, 1);
    assert.equal(saved(m).rebar_diameter_inches, 0.5); assert.equal(saved(m).rebar_weight_lb_per_ft, 0.668);
  } finally { release(); await act(async () => { await operation; }); }
  assert.equal(m.env.saved, 1);
}, known);
await check("legacy rebar editor also keeps unrecorded metadata absent instead of adding generic numeric zero defaults", async m => {
  assert.equal(m.input(D).props.value, ""); assert.equal(m.input(W).props.value, "");
  await m.clickSave(); assert.equal(Object.hasOwn(saved(m, "legacy"), "rebar_diameter_inches"), false);
  assert.equal(Object.hasOwn(saved(m, "legacy"), "rebar_weight_lb_per_ft"), false);
}, base, true);
await check("legacy rebar editor sends parsed numeric measurements and rejects raw partial/zero values", async m => {
  await m.type(D, ".5"); await m.type(W, "0"); assert.equal(m.save().props.disabled, true);
  assert.deepEqual(m.env.calls, []);
  await m.type(W, "0.668"); await m.clickSave();
  assert.equal(saved(m, "legacy").rebar_diameter_inches, 0.5); assert.equal(saved(m, "legacy").rebar_weight_lb_per_ft, 0.668);
}, base, true);
await check("legacy forming editor exposes no reinforcement inputs and retains its existing fields and values", async m => {
  assert.equal(m.input(D), undefined); assert.equal(m.input(W), undefined);
  await m.clickSave();
  const data = saved(m, "legacy");
  assert.equal(data.material_type, "forming_material"); assert.equal(data.lumber_size, "2x4"); assert.equal(data.cost_per_unit, 7);
  assert.equal(data.unrelated, "preserve"); assert.equal(Object.hasOwn(data, "rebar_weight_lb_per_ft"), false);
}, Object.freeze({ material_type: "forming_material", material_name: "Synthetic lumber", lumber_size: "2x4", cost_per_unit: 7, unrelated: "preserve" }), true, "forming");
fs.writeFileSync(DIR + "catalog-metadata-ui-verification.json", JSON.stringify({
  synthetic: true, realBase44StorageVerified: false, explicitNullClearReadbackVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Catalog metadata UI: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
