import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const dir = ".audit-work/foundation-reinforcement16";
for (const [entry, name] of [
  ["foundationCalc", "calc-after"], ["foundationInputValidation", "input-helper"],
]) {
  buildSync({
    entryPoints: [`src/components/estimator/foundation/${entry}.js`],
    bundle: true, platform: "node", format: "esm", outfile: `${dir}/${name}.mjs`,
  });
}
const { calcProject } = await import(pathToFileURL(path.resolve(`${dir}/calc-after.mjs`)));
const { foundationItemInputIssues, foundationProjectInputIssues } = await import(pathToFileURL(path.resolve(`${dir}/input-helper.mjs`)));
const matrix = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/complete-before.json", "utf8")).cases;
const observations = JSON.parse(fs.readFileSync(`${dir}/basic-inputs-before.json`, "utf8")).observations;
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack || error) }); console.error("FAIL", name, error); }
};
const scenario = matrix[1];
const original = scenario.project.items[0];
const inputIssues = patch => foundationItemInputIssues({ ...original, ...patch });
const snapshotFields = [
  "concrete_volume_cy", "excavation_volume_cy", "concrete_bags", "rebar_feet", "rebar_weight_lbs",
  "concrete_cost", "concrete_rate", "rebar_cost", "rebar_rate", "excavation_cost", "excavation_hours",
  "forming_cost", "forming_qty", "pouring_cost", "finishing_cost", "finishing_hours", "item_total_cost",
];
const delivery = scenario.expected.delivery;
// Independently construct the persisted contract; do not call its capture helper.
const saved = freeze({
  ...clone(scenario.project), ...clone(scenario.expected.totals), items: clone(scenario.expected.items),
  concrete_delivery_snapshot: {
    version: 1, concrete_total: delivery.concreteTotal, rounded_yards: delivery.roundedYards,
    rate_per_yard: delivery.ratePerYard, additional_stops_cost: delivery.additionalStopsCost,
    trucks: delivery.trucksList.map(t => ({
      yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost,
      small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee,
    })),
  },
});
const edited = patch => ({ ...clone(saved), items: [{ ...clone(saved.items[0]), ...patch }] });
const calculate = (project, acknowledged = saved) =>
  calcProject(freeze(project), freeze(clone(scenario.inventory)), freeze(clone(scenario.settings)), { savedProject: acknowledged });
const assertSnapshot = (actual, expected) => {
  for (const field of snapshotFields) {
    const value = expected?.[field];
    assert.equal(actual[field], typeof value === "number" && Number.isFinite(value) ? value : undefined, field);
  }
};

for (const c of matrix) check(`frozen complete-model parity: ${c.name}`, () => {
  const actual = calcProject(freeze(clone(c.project)), freeze(clone(c.inventory)), freeze(clone(c.settings)));
  for (const key of Object.keys(c.expected)) assert.deepEqual(clone(actual[key]), c.expected[key], key);
  assert.deepEqual(actual.inputIssues, []);
});
for (const observation of observations) check(`invalid input preserves acknowledged amounts: ${observation.name}`, () => {
  const project = edited(observation.authoredPatch);
  const actual = calculate(project);
  assert.equal(actual.itemPricing[0].available, false);
  assert.ok(actual.inputIssues.some(issue => issue.field === Object.keys(observation.authoredPatch)[0]));
  assert.ok(actual.inputIssues.every(issue => issue.index === 0 && issue.componentId === "f1"));
  assert.deepEqual(actual.catalogIssues, []);
  assertSnapshot(actual.items[0], saved.items[0]);
  if ("quantity" in observation.authoredPatch) assert.equal(actual.items[0].quantity, observation.authoredPatch.quantity);
  assert.equal(actual.totals.grand_total, scenario.expected.totals.grand_total);
  assert.equal(actual.delivery.pricingUnavailable, true);
  assert.equal(actual.delivery.concreteTotal, delivery.concreteTotal);
  assert.deepEqual(actual.delivery.trucksList, delivery.trucksList);
});

const invalidDimensions = [0, -1, NaN, Infinity, -Infinity, null, undefined, "", " ", "36oops", "36 in", "0x24", "1e2", true, false, [], [36], {}];
for (const [index, value] of invalidDimensions.entries()) check(`dimension boundary ${index}: reject ${String(value)}`, () => {
  const issues = inputIssues({ width_inches: value });
  assert.ok(issues.some(issue => issue.field === "width_inches" && issue.code === "foundation_dimension_invalid"));
});
for (const [index, value] of [0, -1, 0.5, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "", "1e2", "2ft", true, [], [1], {}, "1.00000000000000001", "9007199254740991.1", "2.0000000000000000001"].entries()) {
  check(`instance-count boundary ${index}: reject ${String(value)}`, () => {
    assert.ok(inputIssues({ quantity: value }).some(issue => issue.field === "quantity" && issue.code === "foundation_quantity_invalid"));
  });
}
check("legacy missing/null quantity retains one-instance semantics", () => {
  for (const quantity of [undefined, null]) {
    const project = clone(scenario.project);
    if (quantity === undefined) delete project.items[0].quantity;
    else project.items[0].quantity = null;
    assert.deepEqual(foundationProjectInputIssues(project), []);
    const actual = calcProject(project, scenario.inventory, scenario.settings);
    assert.equal(actual.items[0].quantity, 1);
    for (const field of snapshotFields) assert.equal(actual.items[0][field], scenario.expected.items[0][field], field);
  }
});
check("full decimal strings accepted without partial coercion", () => {
  const project = edited({ quantity: "1.0", length_inches: "+36.0", width_inches: " 36 ", depth_inches: "36." });
  assert.deepEqual(foundationProjectInputIssues(project), []);
  assertSnapshot(calculate(project).items[0], scenario.expected.items[0]);
});
check("inactive dimensions, layout and grade do not invalidate spread", () => {
  assert.deepEqual(inputIssues({ diameter: -10, grade_offset_inches: -12, x: -200, y: -100 }), []);
});
check("pillar uses diameter/depth, not inactive length/width", () => {
  assert.deepEqual(inputIssues({ foundation_type: "pillar", diameter: 24, length_inches: null, width_inches: -20 }), []);
  assert.ok(inputIssues({ foundation_type: "pillar", diameter: 0 }).some(i => i.field === "diameter"));
});
check("unsupported/missing type never silently falls through to pillar", () => {
  for (const foundation_type of [undefined, null, "", "unsupported", "standard", 0, {}]) {
    assert.ok(inputIssues({ foundation_type }).some(i => i.code === "foundation_type_invalid"));
  }
});
check("arithmetic overflow/underflow pauses pricing, no engineering minimum", () => {
  for (const size of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    assert.ok(inputIssues({ length_inches: size, width_inches: size, depth_inches: size })
      .some(i => i.code === "foundation_volume_out_of_range"));
  }
  assert.deepEqual(inputIssues({ length_inches: 0.01, width_inches: 0.01, depth_inches: 0.01 }), []);
});
check("project issues preserve row/stable-ID attribution and reject malformed arrays", () => {
  const issues = foundationProjectInputIssues({ items: [original, { ...original, component_id: "f2", quantity: 0 }] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].index, 1);
  assert.equal(issues[0].componentId, "f2");
  assert.throws(() => foundationProjectInputIssues({ items: {} }), /array/);
  assert.deepEqual(foundationProjectInputIssues({ items: [] }), []);
});
check("explicit zero overrides remain current and saveable inputs", () => {
  const project = edited({
    custom_concrete_qty: 0, custom_concrete_cost_per_cy: 0, custom_rebar_qty: 0,
    custom_rebar_cost_per_ft: 0, custom_forming_qty: 0, custom_forming_rate: 0,
    custom_finishing_hours: 0, custom_finishing_rate: 0, custom_excavation_hours: 0, custom_excavation_rate: 0,
  });
  const actual = calculate(project);
  assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.itemPricing[0].available, true);
  for (const field of ["concrete_volume_cy", "concrete_bags", "concrete_cost", "rebar_feet", "forming_qty", "finishing_hours", "excavation_hours"]) {
    assert.equal(actual.items[0][field], 0, field);
  }
});
check("no-rebar design is valid without rebar metadata", () => {
  const project = edited({ include_rebar: false, rebar_size: null, rebar_spacing_length: 0, rebar_layers: 0 });
  const actual = calculate(project);
  assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.itemPricing[0].available, true);
  assert.equal(actual.items[0].rebar_feet, 0);
});
check("missing/foreign source acknowledgment cannot borrow draft cached prices", () => {
  for (const acknowledged of [null, { ...saved, id: "foreign-source" }]) {
    const actual = calculate(edited({ quantity: 0 }), acknowledged);
    assert.equal(actual.itemPricing[0].available, false);
    assertSnapshot(actual.items[0], null);
    assert.equal(actual.totals.grand_total, null);
    assert.equal(actual.delivery.concreteTotal, undefined);
  }
});
check("new or duplicate current component identity cannot borrow a saved row", () => {
  const changedId = calculate(edited({ component_id: "brand-new", quantity: 0 }));
  assertSnapshot(changedId.items[0], null);
  assert.equal(changedId.totals.grand_total, null);
  const project = edited({ quantity: 0 });
  project.items.push(clone(project.items[0]));
  const duplicated = calculate(project);
  for (const item of duplicated.items) assertSnapshot(item, null);
  assert.equal(duplicated.totals.grand_total, null);
});
check("ambiguous acknowledged identity cannot supply a cached amount", () => {
  const acknowledged = { ...clone(saved), items: [clone(saved.items[0]), clone(saved.items[0])] };
  const actual = calculate(edited({ depth_inches: 0 }), acknowledged);
  assertSnapshot(actual.items[0], null);
  assert.equal(actual.totals.grand_total, null);
});
check("invalid rows use their stable-ID saved prices after reordering", () => {
  const second = { ...clone(matrix[0].expected.items[0]), component_id: "f2" };
  assert.notEqual(second.item_total_cost, saved.items[0].item_total_cost);
  const acknowledged = { ...clone(saved), items: [clone(saved.items[0]), second] };
  const project = {
    ...clone(acknowledged),
    items: [{ ...clone(second), depth_inches: 0 }, { ...clone(saved.items[0]), quantity: 0 }],
  };
  const actual = calculate(project, acknowledged);
  assertSnapshot(actual.items[0], second);
  assertSnapshot(actual.items[1], saved.items[0]);
  assert.equal(actual.totals.grand_total, second.item_total_cost + saved.items[0].item_total_cost);
});
check("valid zero snapshot survives; absent delivery snapshot is not fabricated", () => {
  const acknowledged = clone(saved);
  for (const field of snapshotFields) acknowledged.items[0][field] = 0;
  const actual = calculate(edited({ quantity: 0 }), acknowledged);
  assertSnapshot(actual.items[0], acknowledged.items[0]);
  assert.equal(actual.totals.grand_total, 0);
  delete acknowledged.concrete_delivery_snapshot;
  const absent = calculate(edited({ quantity: 0 }), acknowledged);
  assert.equal(absent.delivery.concreteTotal, undefined);
  assert.equal(absent.totals.grand_total, null);
});
check("correcting inputs restores exact current pricing without mutating saved source", () => {
  const project = edited({ quantity: 0 });
  const blocked = calculate(clone(project));
  assert.equal(blocked.items[0].quantity, 0);
  project.items[0].quantity = 1;
  const restored = calculate(project);
  assert.deepEqual(restored.inputIssues, []);
  assert.equal(restored.itemPricing[0].available, true);
  assertSnapshot(restored.items[0], scenario.expected.items[0]);
  assert.equal(restored.totals.grand_total, scenario.expected.totals.grand_total);
  assert.equal(saved.items[0].quantity, 1);
});
check("simultaneous catalog and input defects are separate and both unavailable", () => {
  const project = edited({ quantity: 0 });
  const actual = calcProject(project, scenario.inventory.filter(row => row.id !== "bag"), scenario.settings, { savedProject: saved });
  assert.ok(actual.catalogIssues.length > 0);
  assert.ok(actual.inputIssues.length > 0);
  assert.equal(actual.itemPricing[0].available, false);
  assertSnapshot(actual.items[0], saved.items[0]);
});

fs.writeFileSync(`${dir}/financial-verification.json`, JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Basic input verification: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
