import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/seam-checks/reinforcement";
buildSync({
  entryPoints: ["src/components/estimator/foundation/foundationCalc.js"], bundle: true,
  platform: "node", format: "esm", outfile: `${DIR}/guard-calculator.mjs`,
});
const { calcProject } = await import(pathToFileURL(path.resolve(`${DIR}/guard-calculator.mjs`)));
const matrix = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/complete-before.json", "utf8")).cases;
const clone = value => JSON.parse(JSON.stringify(value));
const fields = [
  "concrete_volume_cy", "excavation_volume_cy", "concrete_bags", "rebar_feet", "rebar_weight_lbs",
  "concrete_cost", "concrete_rate", "rebar_cost", "rebar_rate", "excavation_cost", "excavation_hours",
  "forming_cost", "forming_qty", "pouring_cost", "finishing_cost", "finishing_hours", "item_total_cost",
];
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function acknowledged(index) {
  const c = matrix[index], d = c.expected.delivery;
  return {
    ...clone(c.project), ...clone(c.expected.totals), items: clone(c.expected.items),
    concrete_delivery_snapshot: {
      version: 1, concrete_total: d.concreteTotal, rounded_yards: d.roundedYards,
      rate_per_yard: d.ratePerYard, additional_stops_cost: d.additionalStopsCost,
      trucks: d.trucksList.map(t => ({
        yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost,
        small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee,
      })),
    },
  };
}
function run(index, patch, saved = acknowledged(index)) {
  const c = matrix[index], project = clone(saved);
  Object.assign(project.items[0], patch);
  const actual = calcProject(project, c.inventory, c.settings, { savedProject: saved });
  return { actual, saved, project, scenario: c };
}
function preserved(index, field, value, code) {
  const { actual, saved, project, scenario } = run(index, { [field]: value });
  assert.equal(actual.itemPricing[0].available, false);
  const issue = actual.inputIssues.find(i => i.field === field);
  assert.ok(issue);
  assert.equal(issue.code, code);
  assert.equal(issue.index, 0);
  assert.equal(issue.componentId, "f1");
  assert.deepEqual(actual.catalogIssues, []);
  assert.ok(Object.is(actual.items[0][field], value), "raw invalid authoring retained");
  assert.ok(Object.is(project.items[0][field], value), "input is not mutated");
  for (const f of fields) {
    const v = saved.items[0][f];
    assert.equal(actual.items[0][f], Number.isFinite(v) ? v : undefined, f);
  }
  assert.equal(actual.totals.grand_total, scenario.expected.totals.grand_total);
  assert.equal(actual.delivery.pricingUnavailable, true);
  assert.equal(actual.delivery.concreteTotal, scenario.expected.delivery.concreteTotal);
}
for (const c of matrix) check(`complete frozen model unchanged: ${c.name}`, () => {
  const actual = calcProject(clone(c.project), c.inventory, c.settings);
  for (const key of Object.keys(c.expected)) assert.deepEqual(clone(actual[key]), c.expected[key], key);
  assert.deepEqual(actual.inputIssues, []);
});
const invalidScalars = [0, -12, NaN, Infinity, "", " ", "12oops", "1e2", "0xC", true, [], [12], {}];
for (const field of ["rebar_spacing_length", "rebar_spacing_width"]) {
  for (const [n, value] of invalidScalars.entries()) check(`${field}: invalid boundary ${n} preserves prices`, () =>
    preserved(1, field, value, "foundation_rebar_spacing_invalid"));
}
const invalidCounts = [0, -2, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "", "1e2", "2oops", "1.00000000000000001", true, [], {}];
for (const [index, field] of [[1, "rebar_layers"], [3, "pillar_rebar_layers"], [3, "pillar_vertical_rebar_count"]]) {
  for (const [n, value] of invalidCounts.entries()) check(`${field}: invalid boundary ${n} preserves prices`, () =>
    preserved(index, field, value, "foundation_rebar_count_invalid"));
}
for (const [n, value] of [0, -20, 40, NaN, Infinity, "", "20in", "1e1", true, [], [20], {}].entries()) {
  check(`pillar hoop diameter: invalid boundary ${n} preserves prices`, () =>
    preserved(3, "pillar_rebar_hoop_diameter", value, "foundation_rebar_diameter_invalid"));
}
check("missing/null legacy spread fields retain defaults and exact prices", () => {
  for (const value of [undefined, null]) {
    const saved = acknowledged(1);
    const project = clone(saved);
    for (const f of ["rebar_layers", "rebar_spacing_length", "rebar_spacing_width"]) {
      if (value === undefined) delete project.items[0][f];
      else project.items[0][f] = value;
    }
    const actual = calcProject(project, matrix[1].inventory, matrix[1].settings, { savedProject: saved });
    assert.deepEqual(actual.inputIssues, []);
    assert.equal(actual.items[0].rebar_feet, 64);
    assert.equal(actual.items[0].rebar_cost, 252.8);
    assert.equal(actual.totals.grand_total, 866.55);
  }
});
check("missing/null legacy pillar fields retain one hoop and four longitudinal bars", () => {
  for (const value of [undefined, null]) {
    const { actual, scenario } = run(3, {
      pillar_rebar_layers: value, pillar_vertical_rebar_count: value, pillar_rebar_hoop_diameter: value,
    });
    assert.deepEqual(actual.inputIssues, []);
    for (const f of fields) assert.equal(actual.items[0][f], scenario.expected.items[0][f], f);
  }
});
check("ordinary signed decimal steel inputs retain exact current prices", () => {
  const { actual } = run(1, { rebar_spacing_length: " +12.0 ", rebar_spacing_width: "12.", rebar_layers: "1.0" });
  assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.items[0].rebar_feet, 64);
  assert.equal(actual.totals.grand_total, 866.55);
});
check("rebar off ignores every inactive steel input", () => {
  const { actual } = run(1, {
    include_rebar: false, rebar_layers: -2, rebar_spacing_width: -12, rebar_spacing_length: "bad",
    pillar_rebar_layers: 0, pillar_vertical_rebar_count: -2, pillar_rebar_hoop_diameter: -20,
  });
  assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.itemPricing[0].available, true);
  assert.equal(actual.items[0].rebar_feet, 0);
  assert.equal(actual.items[0].rebar_cost, 0);
});
check("inactive shape steel fields do not block valid pricing", () => {
  const spread = run(1, { pillar_rebar_layers: -2, pillar_vertical_rebar_count: 0, pillar_rebar_hoop_diameter: -20 }).actual;
  const pillar = run(3, { rebar_layers: -2, rebar_spacing_width: 0, rebar_spacing_length: "bad" }).actual;
  assert.deepEqual(spread.inputIssues, []);
  assert.deepEqual(pillar.inputIssues, []);
  assert.equal(spread.itemPricing[0].available, true);
  assert.equal(pillar.itemPricing[0].available, true);
});
check("physical diameter bound does not invent cover requirements", () => {
  const { actual } = run(3, { pillar_rebar_hoop_diameter: 23 });
  assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.itemPricing[0].available, true);
  // Legacy still clamps this to 20 inches; correcting that is a versioned-model change.
  assert.equal(actual.items[0].rebar_feet, matrix[3].expected.items[0].rebar_feet);
});
check("zero rate and quantity overrides remain valid", () => {
  const { actual } = run(1, { custom_rebar_cost_per_ft: 0, custom_rebar_qty: 0 });
  assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.itemPricing[0].available, true);
  assert.equal(actual.items[0].rebar_feet, 0);
});
check("new invalid steel item cannot borrow acknowledged costs", () => {
  const { actual } = run(1, { component_id: "new-steel", rebar_layers: -2 });
  assert.equal(actual.itemPricing[0].available, false);
  for (const f of fields) assert.equal(actual.items[0][f], undefined, f);
  assert.equal(actual.totals.grand_total, null);
});
check("repair restores exact live cost without altering unrelated description", () => {
  const saved = acknowledged(1);
  const project = clone(saved);
  project.items[0].description = "steel correction";
  project.items[0].rebar_spacing_width = -12;
  assert.equal(calcProject(project, matrix[1].inventory, matrix[1].settings, { savedProject: saved }).itemPricing[0].available, false);
  project.items[0].rebar_spacing_width = 12;
  const repaired = calcProject(project, matrix[1].inventory, matrix[1].settings, { savedProject: saved });
  assert.deepEqual(repaired.inputIssues, []);
  assert.equal(repaired.items[0].description, "steel correction");
  assert.equal(repaired.items[0].item_total_cost, 866.55);
  assert.equal(saved.items[0].description, matrix[1].expected.items[0].description);
});
fs.writeFileSync(`${DIR}/financial-verification.json`, JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`Reinforcement input verification: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
