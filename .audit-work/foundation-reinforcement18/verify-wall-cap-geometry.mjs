import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const bundle = await build({
  entryPoints: ["src/components/estimator/foundation/wallCapCalculator.js",
    "src/components/estimator/foundation/foundationCalc.js"],
  bundle: true, format: "esm", platform: "node", write: false, outdir: DIR + "wall-cap-geometry-bundles",
});
const modules = await Promise.all(bundle.outputFiles.map(file => import("data:text/javascript;base64,"
  + Buffer.from(file.text).toString("base64"))));
const { calcWallCaps: calc, wallCapCutLengthValue: cutValue, wallCapInputNumber: number } = modules.find(value => value.calcWallCaps);
const { calcProject } = modules.find(value => value.calcProject);
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cap = freeze({ component_id: "piece", id: "piece", cap_inventory_id: "material",
  length_inches: 18, stock_length_inches: 48, cost: 21, cap_name: "Saved cap" });
const stock = freeze({ id: "material", material_type: "wall_cap", material_name: "Current cap",
  cap_stock_length_inches: 48, cap_stock_price: 25 });
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
const issue = (priced, code) => assert.ok(priced.issues.some(value => value.code === code), JSON.stringify(priced.issues));
check("finite cut fitting stock keeps full-stock pricing rather than pricing a fraction of stock", () => {
  const priced = calc([cap], [stock]);
  assert.equal(priced.caps[0].length_inches, 18); assert.equal(priced.caps[0].cost, 25);
  assert.equal(priced.total, 25); assert.equal(priced.byInventory[0].qty, 1); assert.deepEqual(priced.issues, []);
});
check("cut exactly matching stock is valid", () => {
  const priced = calc([{ ...cap, length_inches: 48 }], [stock]);
  assert.equal(priced.total, 25); assert.deepEqual(priced.issues, []);
});
check("explicit legacy-only cut remains readable without automatic canonical-field migration", () => {
  const legacy = { ...cap, cut_length_inches: 18 }; delete legacy.length_inches;
  const priced = calc([freeze(legacy)], [stock]);
  assert.equal(cutValue(legacy), 18); assert.equal(Object.hasOwn(priced.caps[0], "length_inches"), false);
  assert.equal(priced.caps[0].cut_length_inches, 18); assert.equal(priced.total, 25);
  assert.deepEqual(priced.issues, []);
});
check("the current cut is authoritative over a stale legacy hint", () => {
  const record = freeze({ ...cap, cut_length_inches: 999 });
  assert.equal(cutValue(record), 18); assert.deepEqual(calc([record], [stock]).issues, []);
});
for (const [name, value] of [["blank", ""], ["null", null], ["undefined", undefined]]) {
  check(`an explicitly ${name} current cut cannot fall back to a legacy 18-inch value`, () => {
    const record = freeze({ ...cap, length_inches: value, cut_length_inches: 18 });
    const priced = calc([record], [stock]);
    assert.equal(cutValue(record), value); assert.equal(priced.caps[0].cost, 21);
    assert.equal(priced.total, 21); issue(priced, "wall_cap_cut_length_invalid");
  });
}
for (const [name, value] of [["zero", 0], ["negative", -1], ["whitespace", " "], ["nonnumeric", "bad"],
  ["boolean", false], ["array", []], ["object", {}], ["infinite", Infinity]]) {
  check(`${name} cut is rejected without clamping or changing acknowledged values`, () => {
    const record = freeze({ ...cap, length_inches: value });
    const priced = calc([record], [stock]);
    assert.deepEqual(priced.caps[0], record); assert.equal(priced.total, 21);
    issue(priced, "wall_cap_cut_length_invalid");
  });
}
check("no cut field is unknown, not a manufactured 48-inch cut", () => {
  const record = { ...cap }; delete record.length_inches;
  assert.equal(cutValue(record), undefined);
  const priced = calc([freeze(record)], [stock]);
  assert.deepEqual(priced.caps[0], record); issue(priced, "wall_cap_cut_length_invalid");
});
for (const [name, value] of [["missing", undefined], ["null", null], ["blank", ""], ["zero", 0],
  ["negative", -1], ["boolean", false], ["infinite", Infinity]]) {
  check(`${name} live stock length cannot borrow an old 48-inch snapshot`, () => {
    const priced = calc([cap], [freeze({ ...stock, cap_stock_length_inches: value })]);
    assert.deepEqual(priced.caps[0], cap); assert.equal(priced.total, 21);
    issue(priced, "wall_cap_stock_length_unavailable");
  });
}
check("an oversized cut stays authored and priced quantity stays one, with no guessed extra stock", () => {
  const record = freeze({ ...cap, length_inches: 49 });
  const priced = calc([record], [stock]);
  assert.equal(priced.caps[0].length_inches, 49); assert.equal(priced.caps[0].cost, 21);
  assert.equal(priced.byInventory[0].qty, 1); assert.equal(priced.total, 21);
  issue(priced, "wall_cap_cut_exceeds_stock");
});
check("longer replacement stock preserves an 18-inch cut while shorter stock blocks current repricing", () => {
  const record = freeze({ ...cap, cap_inventory_id: "replacement" });
  const row = { ...stock, id: "replacement", cap_stock_price: 30 };
  const longer = calc([record], [{ ...row, cap_stock_length_inches: 96 }]);
  assert.equal(longer.caps[0].length_inches, 18); assert.equal(longer.total, 30);
  const shorter = calc([record], [{ ...row, cap_stock_length_inches: 12 }]);
  assert.deepEqual(shorter.caps[0], record); assert.equal(shorter.total, 21);
  issue(shorter, "wall_cap_cut_exceeds_stock");
  const corrected = calc([{ ...record, length_inches: 12 }], [{ ...row, cap_stock_length_inches: 12 }]);
  assert.equal(corrected.total, 30); assert.deepEqual(corrected.issues, []);
});
check("an incomplete first row does not freeze an unrelated valid row", () => {
  const priced = calc([{ ...cap, length_inches: 49 }, { ...cap, id: "second" }], [stock]);
  assert.deepEqual(priced.caps.map(value => value.cost), [21, 25]);
  assert.equal(priced.total, 46); assert.equal(priced.byInventory[0].qty, 2);
  assert.equal(priced.issues.length, 1); assert.equal(priced.issues[0].index, 0);
});
check("unknown cost stays unknown when the physical input is infeasible", () => {
  const record = { ...cap, length_inches: 49 }; delete record.cost;
  const priced = calc([freeze(record)], [stock]);
  assert.equal(Object.hasOwn(priced.caps[0], "cost"), false);
  assert.equal(priced.total, null); assert.equal(priced.byInventory[0].cost, null);
});
check("an explicit zero price only becomes current when the cut fits the selected stock", () => {
  const row = { ...stock, cap_stock_price: 0 };
  const infeasible = calc([{ ...cap, length_inches: 49 }], [row]);
  assert.equal(infeasible.total, 21); issue(infeasible, "wall_cap_cut_exceeds_stock");
  const valid = calc([cap], [row]); assert.equal(valid.total, 0); assert.deepEqual(valid.issues, []);
  const savedZero = calc([{ ...cap, cost: 0, length_inches: 49 }], [stock]);
  assert.equal(savedZero.total, 0); assert.ok(savedZero.issues.length > 0);
});
check("price stock and cut diagnostics are all returned together without converting blanks to zero", () => {
  const record = freeze({ ...cap, length_inches: "" });
  const priced = calc([record], [{ ...stock, cap_stock_price: "", cap_stock_length_inches: null }]);
  assert.deepEqual(priced.caps[0], record);
  assert.deepEqual(priced.issues.map(value => value.field), ["cap_stock_price", "cap_stock_length_inches", "length_inches"]);
});
check("recorded decimal strings remain supported and scalar parsing keeps blank/boolean values unknown", () => {
  const priced = calc([{ ...cap, length_inches: "18.5" }], [{ ...stock, cap_stock_length_inches: "48" }]);
  assert.equal(priced.total, 25); assert.deepEqual(priced.issues, []);
  assert.equal(number("18.5"), 18.5); assert.equal(number("0"), 0); assert.equal(number("-1"), -1);
  for (const value of ["", " ", null, undefined, false, [], {}, "18 in"]) assert.equal(number(value), null);
});
check("project save/handoff gate receives stock-fit issues while keeping stored amounts and source data intact", () => {
  const project = freeze({ id: "synthetic-cap-geometry", items: [], poles: [], walls: [], selected_equipment: [],
    wall_caps: [{ ...cap, length_inches: 49 }] });
  const original = JSON.stringify(project);
  const priced = calcProject(project, [stock]);
  assert.equal(priced.wallCaps[0].length_inches, 49); assert.equal(priced.totals.total_wall_cap_cost, 21);
  assert.equal(priced.totals.grand_total, 21);
  assert.ok(priced.catalogIssues.some(value => value.kind === "wall_cap" && value.code === "wall_cap_cut_exceeds_stock"));
  assert.equal(JSON.stringify(project), original); assert.equal(cap.cost, 21); assert.equal(cap.length_inches, 18);
});
fs.writeFileSync(DIR + "wall-cap-geometry-verification.json", JSON.stringify({
  results, syntheticOnly: true, realStorageVerified: false, reinforcementV2Activated: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
