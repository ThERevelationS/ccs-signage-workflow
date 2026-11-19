import assert from "node:assert/strict";
import fs from "node:fs";
import { foundationReinforcementBOMRows as rows } from "../../src/components/estimator/foundation/foundationReinforcementBOMRows.js";

const DIR = ".audit-work/foundation-reinforcement18/";
const base = JSON.parse(fs.readFileSync(DIR + "active-v2-dispatch-frozen-inputs.json", "utf8")).item;
const results = [];
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
};
check("known20-foot steel material40 and labor72 remain distinct and sum to112", () => {
  const actual = rows(base);
  assert.equal(actual.length, 2);
  assert.deepEqual(actual.map(row => row.cost), [40, 72]);
  assert.equal(actual[0].quantity, "20 LF physical / 20 LF priced");
  assert.equal(actual[1].quantity, "1.2 hr");
  assert.ok(actual[0].note.includes("Physical weight: 13.36 lb. Priced weight: 13.36 lb."));
  assert.ok(actual.every(row => row.note.includes("Not a purchasing plan.")));
});
check("zero priced steel still lists physical20 and material0 alongside labor48", () => {
  const item = { ...base, rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0,
    rebar_labor_cost: 48, rebar_labor_hours: 0.8, rebar_cost: 48 };
  const actual = rows(item);
  assert.equal(actual.length, 2); assert.equal(actual[0].quantity, "20 LF physical / 0 LF priced");
  assert.deepEqual(actual.map(row => row.cost), [0, 48]); assert.equal(actual[1].quantity, "0.8 hr");
  assert.ok(actual[0].note.includes("Priced weight: 0 lb."));
});
check("unknown source quantities, weights, hours and costs are not relabeled as zero", () => {
  const item = { reinforcement_calculation_version: 2, include_rebar: true };
  const actual = rows(item, { saved: true });
  assert.equal(actual[0].quantity, "Not saved LF physical / Not saved LF priced");
  assert.equal(actual[1].quantity, "Not saved hr"); assert.deepEqual(actual.map(row => row.cost), [null, null]);
  assert.ok(actual[0].note.includes("Physical weight: Not saved lb."));
  assert.ok(actual.every(row => row.saved === true && row.note.includes("Acknowledged saved quantities and amounts")));
});
check("known combined history survives without inventing an unrecorded material/labor split", () => {
  const item = { ...base }; delete item.rebar_material_cost; delete item.rebar_labor_cost;
  const actual = rows(item, { saved: true });
  assert.equal(actual.length, 1); assert.equal(actual[0].cost, 112);
  assert.ok(actual[0].note.includes("Material/labor split: Not saved."));
  assert.ok(actual[0].note.includes("without an invented breakdown"));
});
check("a partial or inconsistent saved split never duplicates or replaces a known combined112", () => {
  for (const patch of [{ rebar_labor_cost: undefined }, { rebar_labor_cost: 73 }]) {
    const actual = rows({ ...base, ...patch }, { saved: true });
    assert.equal(actual.length, 1); assert.equal(actual[0].cost, 112);
  }
});
check("a valid off design has no live steel rows, while a blocked removal retains acknowledged112", () => {
  assert.deepEqual(rows({ ...base, include_rebar: false, rebar_cost: 0 }), []);
  const retained = rows({ ...base, include_rebar: false }, { saved: true });
  assert.deepEqual(retained.map(row => row.cost), [40, 72]);
  assert.ok(retained.every(row => row.saved === true));
});
check("legacy and unrelated items remain on their existing BOM route", () => {
  assert.equal(rows({}), null); assert.equal(rows(null), null);
  assert.equal(rows({ ...base, reinforcement_calculation_version: 1 }), null);
});
check("snapshot names remain historical and frozen input is not mutated", () => {
  const item = structuredClone(base), before = JSON.stringify(item);
  Object.freeze(item.reinforcement_cost_snapshot.material); Object.freeze(item.reinforcement_cost_snapshot); Object.freeze(item);
  const actual = rows(item, { saved: true });
  assert.equal(JSON.stringify(item), before); assert.ok(actual[0].material.includes("Synthetic"));
  actual[0].cost = 999;
  assert.equal(item.rebar_material_cost, 40);
});
fs.writeFileSync(DIR + "reinforcement-bom-rows-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Reinforcement BOM rows: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;
