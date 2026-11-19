import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = path.resolve(".audit-work/foundation-phaseb1");
const CAND = `${DIR}/candidate-tree-src`;
const REM = `${DIR}/remote-src/src`;

// ── Bundle remote calc (baseline) and grafted candidate calc ────────────────
buildSync({
  entryPoints: [`${REM}/components/estimator/foundation/foundationCalc.js`],
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/remote-calc.bundle.mjs`,
  alias: { "@": REM },
});
buildSync({
  entryPoints: [`${CAND}/components/estimator/foundation/foundationCalc.js`],
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/candidate-calc.bundle.mjs`,
  alias: { "@": CAND },
});
const remote = await import(pathToFileURL(`${DIR}/remote-calc.bundle.mjs`));
const candidate = await import(pathToFileURL(`${DIR}/candidate-calc.bundle.mjs`));

const clone = value => JSON.parse(JSON.stringify(value));
const frozen = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const results = [];
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack || error) }); console.error("FAIL", name, error.message); }
};
const near = (actual, expected) => assert.ok(typeof actual === "number" &&
  Math.abs(actual - expected) <= 64 * Number.EPSILON * Math.max(1, Math.abs(expected)),
  `${actual} does not equal ${expected} within floating-point arithmetic tolerance.`);

// ═══ PART 1 — 25 frozen complete-model cases: candidate ≡ remote byte-equal ═
const matrix = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/complete-before.json", "utf8")).cases;
// Canonical serialization (sorted keys): deepEqual alone is semantic — a
// canonical stringify proves the outputs serialize byte-for-byte identically.
const canonical = value => JSON.stringify(value, (key, v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
for (const c of matrix) check(`remote-identical whole-model output: ${c.name}`, () => {
  const expected = remote.calcProject(frozen(clone(c.project)), frozen(clone(c.inventory)), frozen(clone(c.settings)));
  const actual = candidate.calcProject(frozen(clone(c.project)), frozen(clone(c.inventory)), frozen(clone(c.settings)));
  assert.deepEqual(clone(actual), clone(expected), "candidate differs from remote");
  assert.equal(canonical(actual), canonical(expected), "candidate serialization differs from remote");
});

// Snapshot-mode parity too (held-amounts path is where v1 acknowledged
// pricing lives): candidate ≡ remote with explicit savedProject.
for (const c of matrix.slice(0, 5)) check(`remote-identical snapshot-mode: ${c.name}`, () => {
  const saved = frozen({ ...clone(c.project), ...clone(c.expected.totals), items: clone(c.expected.items) });
  const options = { savedProject: saved };
  const expected = remote.calcProject(frozen(clone(c.project)), frozen(clone(c.inventory)), frozen(clone(c.settings)), options);
  const actual = candidate.calcProject(frozen(clone(c.project)), frozen(clone(c.inventory)), frozen(clone(c.settings)), options);
  assert.deepEqual(clone(actual), clone(expected), "candidate differs from remote");
  assert.equal(canonical(actual), canonical(expected), "candidate serialization differs from remote");
});

// Informational: the frozen expected outputs were generated before the remote
// availability hardening (O-008/O-030 et al.) — count how many the CURRENT
// remote still reproduces verbatim (expected lower; not a failure gate).
let legacyExpectedMatches = 0;
for (const c of matrix) {
  const actual = remote.calcProject(clone(c.project), clone(c.inventory), clone(c.settings));
  let same = true;
  try { for (const key of Object.keys(c.expected)) assert.deepEqual(clone(actual[key]), c.expected[key], key); }
  catch { same = false; }
  if (same) legacyExpectedMatches++;
}
console.log(`info: remote still reproduces ${legacyExpectedMatches}/${matrix.length} pre-hardening frozen expected outputs`);

// ═══ PART 2 — v2-dispatch cases (ported from verify-active-v2-dispatch.mjs) ═
const { item, project } = JSON.parse(fs.readFileSync(".audit-work/foundation-reinforcement18/active-v2-dispatch-frozen-inputs.json", "utf8"));
const { calcItem, calcProject } = candidate;

check("accepted version2 dispatch retains 20ft/112 steel and 288.25 item instead of legacy steel math", () => {
  const actual = calcItem(item, project, [], {}, item);
  assert.equal(actual.rebar_feet, 20); near(actual.rebar_cost, 112); near(actual.item_total_cost, 288.25);
  assert.equal(Math.round(actual.rebar_cost * 100), 11200);
  near(actual.rebar_material_cost, 40); near(actual.rebar_labor_cost, 72);
  assert.equal(actual.rebar_geometry_feet, 20);
  assert.equal(actual.reinforcement_cost_snapshot.calculation_version, 2);
});
check("explicit manual version2 selection does not require an unrelated legacy rebar size", () => {
  const source = structuredClone(project); source.items[0].custom_rebar_cost_per_ft = null;
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true);
  // Remote O-008 hardening may add concrete_delivery scope issues (no priced
  // supplier in the empty-inventory fixture) — assert zero FOUNDATION issues.
  assert.deepEqual(actual.catalogIssues.filter(issue => issue.kind === "foundation"), []);
  near(actual.items[0].rebar_cost, 112);
});
check("unknown active calculation versions are unavailable rather than silently calculated as legacy", () => {
  const source = structuredClone(project); source.items[0].reinforcement_calculation_version = 3;
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false);
  assert.ok(actual.inputIssues.some(issue => issue.code === "foundation_reinforcement_version_unsupported"));
  assert.equal(actual.items[0].rebar_cost, 112);
});
check("unconfigured supports keep acknowledged amounts and block active pricing and saving", () => {
  const source = structuredClone(project); source.items[0].reinforcement_design.supports = { mode: "unconfigured" };
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, 112);
  assert.equal(actual.items[0].item_total_cost, 288.25);
  assert.ok(actual.inputIssues.length + actual.catalogIssues.length > 0);
});
check("valid active recalculation returns a new reconciled snapshot instead of reusing an old result", () => {
  const source = structuredClone(project); source.items[0].custom_rebar_cost_per_ft = 0;
  const actual = calcItem(source.items[0], source, [], {}, item);
  assert.equal(actual.rebar_material_cost, 0); near(actual.rebar_labor_cost, 72);
  near(actual.rebar_cost, 72); near(actual.item_total_cost, 248.25);
  assert.equal(Math.round(actual.rebar_cost * 100), 7200);
  assert.equal(actual.reinforcement_cost_snapshot.material.cost_per_ft, 0);
  assert.equal(actual.reinforcement_cost_snapshot.amounts.material_cost, 0);
});
check("disabled version2 steel clears live steel snapshots without requiring a material or design", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { include_rebar: false, reinforcement_design: null, reinforcement_material: null });
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true);
  assert.equal(actual.items[0].rebar_cost, 0); assert.equal(actual.items[0].rebar_geometry_feet, 0);
  assert.equal(actual.items[0].reinforcement_cost_snapshot, undefined);
  near(actual.items[0].item_total_cost, 176.25);
});
check("zero priced footage keeps physical 20ft and 48 connection labor", () => {
  const source = structuredClone(project); source.items[0].custom_rebar_qty = 0;
  const actual = calcItem(source.items[0], source, [], {}, item);
  assert.equal(actual.rebar_feet, 0); assert.equal(actual.rebar_geometry_feet, 20);
  assert.equal(actual.rebar_material_cost, 0); near(actual.rebar_labor_cost, 48);
  near(actual.rebar_cost, 48); near(actual.item_total_cost, 224.25);
});
check("missing selected catalog ID cannot be replaced by legacy size even with a rate override", () => {
  const source = structuredClone(project);
  source.items[0].reinforcement_material = { kind: "catalog", inventory_id: "missing" };
  const inventory = [{ id: "legacy", material_type: "rebar", rebar_size: "#4", cost_per_unit: 999 }];
  const actual = calcProject(source, inventory, {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, 112);
  assert.ok(actual.catalogIssues.some(issue => issue.field === "reinforcement_material.inventory_id"));
});
check("a current selected ID controls active rate rather than a different legacy size match", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { custom_rebar_cost_per_ft: null, rebar_size: "#4",
    reinforcement_material: { kind: "catalog", inventory_id: "selected" } });
  const inventory = [
    { id: "legacy", material_type: "rebar", rebar_size: "#4", cost_per_unit: 999 },
    { id: "selected", material_name: "Selected", material_type: "rebar", rebar_size: "#8", unit: "ft",
      cost_per_unit: 3, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, updated_date: "synthetic-v1" },
  ];
  const actual = calcProject(source, inventory, {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true); near(actual.items[0].rebar_material_cost, 60);
  near(actual.items[0].rebar_cost, 132);
  assert.equal(actual.items[0].reinforcement_cost_snapshot.material.inventory_id, "selected");
});
check("inactive legacy reinforcement fields do not block or influence version2", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { rebar_layers: -999, rebar_spacing_length: "invalid", rebar_spacing_width: -5 });
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true); near(actual.items[0].rebar_cost, 112);
});
check("unknown material weight cannot become a ready zero-weight active estimate", () => {
  const source = structuredClone(project); source.items[0].reinforcement_material.weight_lb_per_ft = null;
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, 112);
  assert.equal(actual.items[0].rebar_geometry_weight_lbs, 13.36);
  assert.ok(actual.inputIssues.some(issue => issue.code === "foundation_reinforcement_not_ready"));
});
check("unavailable version2 with no acknowledged snapshot never adopts raw999 or fabricates zero", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { item_total_cost: 999, rebar_cost: 999 });
  source.items[0].reinforcement_design.supports = { mode: "unconfigured" };
  const actual = calcProject(source, [], {}, { savedProject: null });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, undefined);
  assert.equal(actual.items[0].reinforcement_cost_snapshot, undefined);
  assert.equal(actual.totals.total_rebar_cost, null); assert.equal(actual.totals.grand_total, null);
});
check("duplicate live component IDs cannot borrow another component's acknowledged amounts", () => {
  const source = structuredClone(project);
  source.items[0].reinforcement_design.supports = { mode: "unconfigured" };
  source.items.push(structuredClone(source.items[0]));
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.ok(actual.itemPricing.every(value => value.available === false));
  assert.ok(actual.items.every(value => value.rebar_cost === undefined));
  assert.equal(actual.totals.total_rebar_cost, null);
});

// ── Single-mat honesty: the same physical inputs price higher under the
// legacy formula's assumed inter-layer verticals. Difference is BY DESIGN
// (O-016/CMP-B02) — v1 must remain byte-identical, v2 is explicit.
check("same inputs: v1 legacy steel exceeds explicit v2 single-mat steel (single-mat honesty by design)", () => {
  const base = structuredClone(item);
  delete base.reinforcement_calculation_version; delete base.reinforcement_design;
  delete base.reinforcement_material; delete base.reinforcement_cost_snapshot;
  Object.assign(base, { rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1 });
  const legacy = calcItem(base, project, [], {}, base);
  const versioned = calcItem(item, project, [], {}, item);
  // Legacy: 24ft horizontal + 16*2.5ft assumed verticals = 64ft at rate 2 +
  // (16*0.05 + 64*0.02)*60 labor = 128 + 124.8 = 252.8 vs v2 112.
  near(legacy.rebar_feet, 64); near(legacy.rebar_cost, 252.8);
  near(versioned.rebar_feet, 20); near(versioned.rebar_cost, 112);
  assert.ok(legacy.item_total_cost > versioned.item_total_cost);
});

const failures = results.filter(result => !result.ok);
fs.writeFileSync(`${DIR}/phaseb1-verification.json`,
  JSON.stringify({ synthetic: true, remote_head: "97d37964a8554d7561995975deb0d6096f63e3e3",
    results, passed: results.length - failures.length, failed: failures.length }, null, 2) + "\n");
console.log(`${failures.length ? "FAILED" : "PASS"} phaseb1 cases=${results.length} failed=${failures.length}`);
process.exitCode = failures.length ? 1 : 0;
