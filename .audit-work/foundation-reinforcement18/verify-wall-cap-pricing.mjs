import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const candidate = process.argv.includes("--candidate");
const names = ["wallCapCalculator.js", "foundationCatalogIntegrity.js", "foundationCalc.js"];
const sourceFolder = path.resolve("src/components/estimator/foundation");
const candidateFiles = new Map([...names, "FoundationWallCapsPanel.jsx"].map(name =>
  [name, path.resolve(DIR + "wall-cap-candidate-" + name)]));
const candidatePaths = new Set(candidateFiles.values());
const candidatePlugin = { name: "reviewed-remote-wall-cap-candidates", setup(builder) {
  builder.onResolve({ filter: /^\.\// }, args => {
    if (!candidatePaths.has(args.importer)) return;
    const name = path.basename(args.path);
    for (const extension of ["", ".js", ".jsx"]) {
      if (candidateFiles.has(name + extension)) return { path: candidateFiles.get(name + extension) };
      const file = path.resolve(sourceFolder, args.path + extension);
      if (fs.existsSync(file)) return { path: file };
    }
    throw Error("Unresolved reviewed candidate dependency: " + args.path);
  });
} };
const bundle = await build({
  entryPoints: names.map(name => candidate ? candidateFiles.get(name) : path.join(sourceFolder, name)),
  plugins: candidate ? [candidatePlugin] : [],
  bundle: true, format: "esm", platform: "node", outdir: DIR + "wall-cap-pricing-bundles", write: false,
});
const modules = await Promise.all(bundle.outputFiles.map(file => import("data:text/javascript;base64,"
  + Buffer.from(file.text).toString("base64"))));
const { calcWallCaps: calc, foundationWallCapCatalogIssues: capIssues } = modules.find(module => module.calcWallCaps);
const { foundationAssemblyCatalogIssues: allIssues } = modules.find(module => module.foundationAssemblyCatalogIssues);
const { calcProject } = modules.find(module => module.calcProject);
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cap = freeze({ id: "cap-one", component_id: "cap-one", cap_inventory_id: "inventory-one",
  length_inches: 18, cost: 21, cap_name: "Previously acknowledged cap", stock_length_inches: 48 });
const row = freeze({ id: "inventory-one", material_type: "wall_cap", material_name: "Synthetic current cap",
  cap_stock_length_inches: 48, cap_stock_price: 25 });
const project = freeze({ id: "synthetic-wall-cap", items: [], walls: [], poles: [], selected_equipment: [],
  wall_caps: [cap] });
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("each cut row remains one FULL stock price regardless of cut length or unrelated quantity metadata", () => {
  const priced = calc([cap, { ...cap, id: "cap-two", length_inches: 48, quantity: 7 }], [row]);
  assert.equal(priced.total, 50); assert.equal(priced.byInventory[0].qty, 2);
  assert.equal(priced.byInventory[0].cost, 50); assert.deepEqual(priced.issues, []);
  assert.deepEqual(priced.caps.map(item => item.cost), [25, 25]);
});
check("an explicit catalog zero is genuine zero, not an unavailable price", () => {
  const priced = calc([cap], [{ ...row, cap_stock_price: 0 }]);
  assert.equal(priced.total, 0); assert.equal(priced.caps[0].cost, 0); assert.deepEqual(priced.issues, []);
});
check("explicit decimal string rates remain supported without blank-string zero coercion", () => {
  const priced = calc([cap], [{ ...row, cap_stock_price: "25.50" }]);
  assert.equal(priced.total, 25.5); assert.deepEqual(priced.issues, []);
});
for (const [name, value] of [
  ["missing", undefined], ["null", null], ["blank", ""], ["whitespace", " "], ["malformed", "bad"],
  ["boolean", false], ["array", []], ["object", {}], ["nonfinite", Infinity], ["negative", -1],
]) check(`${name} stock price preserves acknowledged amounts and blocks current catalog pricing`, () => {
  const bad = freeze({ ...row, cap_stock_price: value }), priced = calc([cap], [bad]);
  assert.deepEqual(priced.caps[0], cap); assert.equal(priced.total, 21);
  assert.equal(priced.byInventory[0].cost, 21);
  assert.equal(priced.issues.length, 1); assert.equal(priced.issues[0].code, "wall_cap_stock_price_unavailable");
  assert.equal(priced.issues[0].kind, "wall_cap"); assert.equal(priced.issues[0].index, 0);
  assert.equal(cap.cost, 21);
});
check("unrecorded cost is unknown in both material group and total, never silently zero", () => {
  const saved = { ...cap }; delete saved.cost;
  const priced = calc([freeze(saved)], [{ ...row, cap_stock_price: null }]);
  assert.equal(Object.hasOwn(priced.caps[0], "cost"), false);
  assert.equal(priced.total, null); assert.equal(priced.byInventory[0].cost, null);
  assert.ok(priced.issues.length > 0);
});
check("recorded zero history stays exactly zero when the current price becomes unavailable", () => {
  const priced = calc([{ ...cap, cost: 0 }], [{ ...row, cap_stock_price: null }]);
  assert.equal(priced.caps[0].cost, 0); assert.equal(priced.total, 0);
  assert.ok(priced.issues.length > 0);
});
check("a missing material retains exact saved identity amount stock and quantity fields", () => {
  const priced = calc([cap], []);
  assert.deepEqual(priced.caps[0], cap); assert.equal(priced.total, 21);
  assert.equal(priced.issues[0].code, "catalog_item_unavailable");
});
check("wrong type ambiguous identity and unassigned materials cannot become current cap prices", () => {
  for (const [caps, inventory, code] of [
    [[cap], [{ ...row, material_type: "rebar" }], "catalog_item_type_mismatch"],
    [[cap], [row, { ...row, cap_stock_price: 26 }], "catalog_item_ambiguous"],
    [[{ ...cap, cap_inventory_id: "" }], [row], "catalog_item_unassigned"],
  ]) {
    const priced = calc(caps, inventory);
    assert.equal(priced.total, 21); assert.equal(priced.caps[0].cap_name, cap.cap_name);
    assert.equal(priced.issues[0].code, code);
  }
});
check("mixed known/current and unrecorded rows keep individual values but not a fabricated complete subtotal", () => {
  const unknown = { ...cap, id: "cap-two", cap_inventory_id: "missing" }; delete unknown.cost;
  const priced = calc([cap, freeze(unknown)], [row]);
  assert.equal(priced.caps[0].cost, 25); assert.equal(priced.total, null);
  assert.equal(priced.byInventory[0].cost, 25); assert.equal(priced.byInventory[1].cost, null);
});
check("catalog IDs that are object prototype keys form ordinary isolated groups without pollution", () => {
  const priced = calc(["__proto__", "constructor"].map(id => ({ ...cap, cap_inventory_id: id })),
    ["__proto__", "constructor"].map(id => ({ ...row, id })));
  assert.equal(priced.total, 50); assert.equal(priced.byInventory.length, 2);
  assert.deepEqual(priced.byInventory.map(group => group.qty), [1, 1]);
  assert.equal(Object.prototype.qty, undefined); assert.equal(Object.prototype.cost, undefined);
});
check("overflow makes the subtotal unknown and creates a save-blocking diagnostic", () => {
  const priced = calc([cap, { ...cap, id: "cap-two" }], [{ ...row, cap_stock_price: Number.MAX_VALUE }]);
  assert.equal(priced.total, null); assert.equal(priced.byInventory[0].cost, null);
  assert.ok(priced.issues.some(issue => issue.code === "wall_cap_cost_total_invalid"));
});
check("the shared catalog gate includes cap rate diagnostics even when the selected ID exists", () => {
  const inventory = [{ ...row, cap_stock_price: null }];
  const issues = allIssues(project, inventory);
  assert.deepEqual(issues, capIssues(project.wall_caps, inventory));
  assert.equal(issues[0].field, "cap_stock_price"); assert.equal(issues[0].componentId, cap.component_id);
});
check("project rollup preserves current full-stock price or saved cost while reporting incomplete current pricing", () => {
  const valid = calcProject(project, [row]);
  assert.equal(valid.totals.total_wall_cap_cost, 25); assert.equal(valid.totals.grand_total, 25);
  assert.deepEqual(valid.catalogIssues, []);
  const blocked = calcProject(project, [{ ...row, cap_stock_price: null }]);
  assert.equal(blocked.totals.total_wall_cap_cost, 21); assert.equal(blocked.totals.grand_total, 21);
  assert.ok(blocked.catalogIssues.length > 0);
});
check("project rollup never coerces an unknown cap subtotal to a zero contribution", () => {
  const unknown = { ...cap }; delete unknown.cost;
  const blocked = calcProject({ ...project, wall_caps: [unknown] }, [{ ...row, cap_stock_price: null }]);
  assert.equal(blocked.totals.total_wall_cap_cost, null); assert.equal(blocked.totals.grand_total, null);
  assert.ok(blocked.catalogIssues.length > 0);
});
check("no cap rows remains a genuine zero and valid frozen source inputs are never mutated", () => {
  const original = JSON.stringify({ project, row });
  assert.deepEqual(calc([], [row]), { caps: [], byInventory: [], total: 0, issues: [] });
  calc(project.wall_caps, [row]);
  assert.equal(JSON.stringify({ project, row }), original);
});
const proofFile = process.env.WALL_CAP_PROOF_FILE
  || (candidate ? "wall-cap-remote-candidate-pricing-verification.json" : "wall-cap-pricing-verification.json");
assert.equal(path.basename(proofFile), proofFile);
fs.writeFileSync(DIR + proofFile, JSON.stringify({
  results, candidate, syntheticOnly: true, realStorageVerified: false, pricingActivation: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
