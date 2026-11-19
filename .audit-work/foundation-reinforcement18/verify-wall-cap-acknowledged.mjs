import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const built = await build({
  entryPoints: ["src/components/estimator/foundation/wallCapCalculator.js",
    "src/components/estimator/foundation/foundationCalc.js"],
  bundle: true, platform: "node", format: "esm", write: false, outdir: DIR + "wall-cap-ack-bundles",
});
const modules = await Promise.all(built.outputFiles.map(file => import("data:text/javascript;base64,"
  + Buffer.from(file.text).toString("base64"))));
const { calcWallCaps: calc } = modules.find(value => value.calcWallCaps);
const { calcProject } = modules.find(value => value.calcProject);
const saved = Object.freeze({ component_id: "piece-a", id: "legacy-id", cap_inventory_id: "material",
  length_inches: 18, stock_length_inches: 48, cost: 21, cap_name: "Acknowledged cap" });
const draft = Object.freeze({ ...saved, length_inches: 49, cost: 25, cap_name: "Preview cap", stock_length_inches: 96 });
const inventory = Object.freeze([{ id: "material", material_type: "wall_cap", material_name: "Current cap",
  cap_stock_length_inches: 48, cap_stock_price: 25 }]);
const snapshot = { savedCaps: [saved] };
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function unknown(row) {
  for (const field of ["cost", "cap_name", "stock_length_inches"]) assert.equal(Object.hasOwn(row, field), false, field);
}
check("infeasible geometry uses acknowledged 21 rather than an inherited rendered 25", () => {
  const priced = calc([draft], inventory, snapshot);
  assert.equal(priced.caps[0].cost, 21); assert.equal(priced.total, 21);
  assert.equal(priced.caps[0].cap_name, "Acknowledged cap"); assert.equal(priced.caps[0].stock_length_inches, 48);
  assert.equal(priced.caps[0].length_inches, 49); assert.equal(priced.caps[0].cap_inventory_id, "material");
  assert.equal(draft.cost, 25); assert.equal(saved.cost, 21);
});
for (const [name, rows, record] of [
  ["unavailable catalog", [], draft],
  ["unassigned material", inventory, { ...draft, cap_inventory_id: "" }],
  ["ambiguous catalog", [inventory[0], inventory[0]], draft],
  ["wrong catalog type", [{ ...inventory[0], material_type: "concrete" }], draft],
  ["missing rate", [{ ...inventory[0], cap_stock_price: null }], draft],
  ["missing stock dimension", [{ ...inventory[0], cap_stock_length_inches: null }], draft],
  ["cleared cut", inventory, { ...draft, length_inches: "" }],
]) {
  check(`${name} also restores only the acknowledged snapshot fields`, () => {
    const priced = calc([record], rows, snapshot);
    assert.equal(priced.caps[0].cost, 21); assert.equal(priced.caps[0].stock_length_inches, 48);
    assert.equal(priced.caps[0].cap_name, "Acknowledged cap");
    assert.equal(priced.caps[0].length_inches, record.length_inches);
    assert.equal(priced.caps[0].cap_inventory_id, record.cap_inventory_id);
    assert.ok(priced.issues.length > 0);
  });
}
for (const [name, value] of [["empty", []], ["null", null], ["undefined", undefined], ["malformed", {}]]) {
  check(`an explicit ${name} acknowledgment cannot claim draft prices as saved`, () => {
    const priced = calc([draft], inventory, { savedCaps: value });
    unknown(priced.caps[0]); assert.equal(priced.total, null); assert.equal(priced.caps[0].length_inches, 49);
  });
}
check("a replacement component cannot borrow history merely because its legacy ID was copied", () => {
  const priced = calc([{ ...draft, component_id: "new-piece" }], inventory, snapshot);
  unknown(priced.caps[0]); assert.equal(priced.total, null);
});
check("missing canonical identity cannot borrow an acknowledged row by index or inventory ID", () => {
  const record = { ...draft }; delete record.component_id;
  const priced = calc([record], inventory, snapshot); unknown(priced.caps[0]); assert.equal(priced.total, null);
});
check("duplicate current or acknowledged identities do not select an arbitrary saved amount", () => {
  const current = calc([draft, { ...draft, id: "another" }], inventory, snapshot);
  current.caps.forEach(unknown); assert.equal(current.total, null);
  const previous = calc([draft], inventory, { savedCaps: [saved, { ...saved, cost: 7 }] });
  unknown(previous.caps[0]); assert.equal(previous.total, null);
});
check("reordering uses canonical identity rather than array position", () => {
  const b = { ...saved, component_id: "piece-b", id: "b", cost: 7, cap_name: "Acknowledged B" };
  const priced = calc([{ ...b, length_inches: 49, cost: 99 }, draft], inventory, { savedCaps: [saved, b] });
  assert.deepEqual(priced.caps.map(row => row.cost), [7, 21]); assert.equal(priced.total, 28);
});
check("historical zero remains zero and an unrecorded historical field never inherits its preview counterpart", () => {
  const zero = calc([draft], inventory, { savedCaps: [{ ...saved, cost: 0 }] });
  assert.equal(zero.total, 0); assert.ok(zero.issues.length > 0);
  const incomplete = { ...saved }; delete incomplete.cost; delete incomplete.cap_name; delete incomplete.stock_length_inches;
  const priced = calc([draft], inventory, { savedCaps: [incomplete] });
  unknown(priced.caps[0]); assert.equal(priced.total, null);
});
check("valid geometry keeps current full-stock pricing even for a new unacknowledged row", () => {
  const priced = calc([{ ...draft, component_id: "new-piece", length_inches: 18 }], inventory, { savedCaps: [] });
  assert.equal(priced.total, 25); assert.equal(priced.caps[0].stock_length_inches, 48); assert.deepEqual(priced.issues, []);
});
check("an invalid first row does not prevent the next valid row from using its current price", () => {
  const priced = calc([draft, { ...draft, component_id: "new-piece", length_inches: 18 }], inventory, snapshot);
  assert.deepEqual(priced.caps.map(row => row.cost), [21, 25]); assert.equal(priced.total, 46);
});
check("a newer acknowledged save becomes the next invalid edit's basis", () => {
  const priced = calc([draft], inventory, { savedCaps: [{ ...saved, cost: 25, cap_name: "Newly acknowledged" }] });
  assert.equal(priced.total, 25); assert.equal(priced.caps[0].cap_name, "Newly acknowledged");
});
check("project adapter uses only a matching project's acknowledgment and preserves source objects", () => {
  const project = { id: "project-one", items: [], poles: [], walls: [], selected_equipment: [], wall_caps: [draft] };
  const ack = { ...project, wall_caps: [saved] };
  const source = JSON.stringify({ project, ack });
  const held = calcProject(project, inventory, {}, { savedProject: ack });
  assert.equal(held.totals.grand_total, 21); assert.equal(held.wallCaps[0].length_inches, 49);
  const foreign = calcProject(project, inventory, {}, { savedProject: { ...ack, id: "project-two" } });
  unknown(foreign.wallCaps[0]); assert.equal(foreign.totals.grand_total, null);
  const none = calcProject(project, inventory, {}, { savedProject: null });
  unknown(none.wallCaps[0]); assert.equal(none.totals.grand_total, null);
  assert.equal(JSON.stringify({ project, ack }), source);
});
check("legacy standalone calls without a supplied snapshot still preserve their known input amounts", () => {
  assert.equal(calc([draft], inventory).total, 25);
});
fs.writeFileSync(DIR + "wall-cap-acknowledged-verification.json", JSON.stringify({ results,
  syntheticOnly: true, realStorageVerified: false, reinforcementV2Activated: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
