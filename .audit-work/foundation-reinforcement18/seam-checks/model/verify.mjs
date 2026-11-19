import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/seam-checks/model";
buildSync({
  entryPoints: ["src/components/estimator/foundation/foundationReinforcementModel.js"],
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/model-bundle.mjs`,
});
const { calculateFoundationReinforcementModel: calculate } = await import(pathToFileURL(path.resolve(`${DIR}/model-bundle.mjs`)));
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const spread = {
  component_id: "f1", foundation_type: "spread_foot", quantity: 1, include_rebar: true,
  length_inches: 36, width_inches: 36, depth_inches: 36,
};
const top = { id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 };
const design = {
  version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
  supports: { mode: "off", reason: "Synthetic explicit support condition, not an engineering recommendation." },
  spread: { mats: [top], inter_mat_ties: [] },
};
const pillar = { ...spread, foundation_type: "pillar", diameter: 24 };
const pillarDesign = {
  version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
  supports: clone(design.supports),
  pillar: {
    hoops: [{ id: "h1", center_y_inches: 6, centerline_diameter_inches: 17, cut_allowance_inches: 0 }],
    longitudinal: { count: 4, radius_inches: 8, bottom_end_inches: 3, top_end_inches: 33 },
  },
};
const results = [];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function valid(item = spread, config = design, options) {
  const model = calculate(item, config, options);
  assert.equal(model.status, "valid", JSON.stringify(model.issues));
  assert.equal(model.engineeringApproved, false);
  assert.ok(model.totals);
  assert.ok(model.issues.every(i => i.severity === "warning"));
  return model;
}
function invalid(item, config, options, status = "invalid") {
  const model = calculate(item, config, options);
  assert.equal(model.status, status, JSON.stringify(model.issues));
  assert.equal(model.totals, null);
  assert.equal(model.perInstance, null);
  assert.deepEqual(model.groups, []);
  assert.deepEqual(model.geometry, []);
  assert.equal(model.engineeringApproved, false);
  assert.ok(model.issues.some(i => i.severity === "error"));
  return model;
}
check("one explicit top mat: 8 straight bars, 20ft, 16 crossings, NO vertical ties", () => {
  const m = valid();
  assert.equal(m.perInstance.horizontal_count, 8);
  assert.equal(m.perInstance.horizontal_length_inches, 240);
  assert.equal(m.perInstance.mat_crossings, 16);
  assert.equal(m.perInstance.inter_mat_tie_count, 0);
  assert.equal(m.totals.total_steel_feet, 20);
  assert.equal(m.geometry.length, 8);
  assert.equal(m.omittedGeometryCount, 0);
  assert.equal(m.supports.count, 0);
  assert.equal(m.supports.status, "off_explained");
  for (const g of m.groups) assert.equal(g.cut_length_inches, 30);
  for (const bar of m.geometry) {
    near(Math.hypot(bar.to.x - bar.from.x, bar.to.y - bar.from.y, bar.to.z - bar.from.z), 30);
    assert.ok(bar.from.y === 32.25 || bar.from.y === 32.75);
  }
});
check("maximum spacing uses ceil and evenly distributed edge centerlines", () => {
  const d = clone(design);
  d.spread.mats[0].max_spacing_x_inches = 14;
  d.spread.mats[0].max_spacing_z_inches = 14;
  const m = valid(spread, d);
  assert.equal(m.perInstance.horizontal_count, 8);
  const positions = m.geometry.filter(g => g.groupId === "top/x").map(g => g.from.z);
  near(positions[0], 3.25);
  near(positions.at(-1), 32.75);
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i] - positions[i - 1] <= 14);
});
check("two mats remain horizontal-only until an explicit inter-mat tie is authored", () => {
  const d = clone(design);
  d.spread.mats.unshift({ ...clone(top), id: "bottom", bearing_elevation_inches: 3 });
  const m = valid(spread, d);
  assert.equal(m.perInstance.horizontal_count, 16);
  assert.equal(m.totals.horizontal_feet, 40);
  assert.equal(m.totals.inter_mat_tie_feet, 0);
  assert.equal(m.geometry.filter(g => g.kind === "tie_reference").length, 0);
  d.spread.inter_mat_ties.push({ id: "tie1", from_mat_id: "bottom", to_mat_id: "top", x_inches: 3.25, z_inches: 3.25, cut_length_inches: 30 });
  const tied = valid({ ...spread, quantity: 3 }, d);
  assert.equal(tied.perInstance.inter_mat_tie_count, 1);
  assert.equal(tied.perInstance.tie_ends, 2);
  assert.equal(tied.totals.total_steel_feet, 127.5);
  assert.equal(tied.totals.horizontal_count, 48);
  assert.equal(tied.totals.tie_ends, 6);
  assert.equal(tied.geometry.length, 17, "per-instance geometry never expands quantity copies");
  const line = tied.geometry.find(g => g.kind === "tie_reference");
  assert.equal(line.to.y - line.from.y, 29);
  assert.equal(tied.groups.find(g => g.role === "inter_mat_tie").cut_length_inches, 30);
  assert.ok(tied.issues.some(i => i.code === "reinforcement_tie_path_only"));
});
check("pillar one hoop keeps all four independently authored longitudinal bars", () => {
  const m = valid(pillar, pillarDesign);
  assert.equal(m.perInstance.longitudinal_count, 4);
  assert.equal(m.perInstance.longitudinal_length_inches, 120);
  assert.equal(m.perInstance.hoop_count, 1);
  assert.equal(m.perInstance.hoop_bar_crossings, 4);
  near(m.totals.total_steel_feet, 10 + Math.PI * 17 / 12);
  for (const bar of m.geometry.filter(g => g.role === "longitudinal")) {
    near(Math.hypot(bar.from.x - 12, bar.from.z - 12), 8);
    assert.equal(bar.to.y - bar.from.y, 30);
  }
});
check("version2 explicit zero longitudinal bars means hoop-only, NOT fallback four", () => {
  const d = clone(pillarDesign);
  d.pillar.longitudinal = { count: 0 };
  const m = valid(pillar, d);
  assert.equal(m.perInstance.longitudinal_count, 0);
  assert.equal(m.perInstance.hoop_bar_crossings, 0);
  near(m.totals.total_steel_feet, Math.PI * 17 / 12);
  assert.equal(m.geometry.length, 1);
});
check("longitudinal-only steel is not removed by an explicit empty hoop list", () => {
  const d = clone(pillarDesign);
  d.pillar.hoops = [];
  const m = valid(pillar, d);
  assert.equal(m.totals.longitudinal_count, 4);
  assert.equal(m.totals.total_steel_feet, 10);
});
check("authored hoop allowance contributes cut length, not invented default hooks", () => {
  const d = clone(pillarDesign);
  d.pillar.hoops[0].cut_allowance_inches = 8;
  near(valid(pillar, d).totals.hoop_feet, (Math.PI * 17 + 8) / 12);
  delete d.pillar.hoops[0].cut_allowance_inches;
  invalid(pillar, d, undefined, "incomplete");
});
for (const [name, mutate] of [
  ["top cover", d => { d.spread.mats[0].bearing_elevation_inches = 33; }],
  ["bottom cover", d => { d.spread.mats[0].bearing_elevation_inches = 2; }],
  ["side clearance", d => { d.cover_inches.side = 18; }],
  ["overlapping mats", d => { d.spread.mats = [{ ...clone(top), id: "a", bearing_elevation_inches: 3 }, { ...clone(top), id: "b", bearing_elevation_inches: 3.5 }]; }],
  ["duplicate mat IDs", d => { d.spread.mats.push(clone(top)); }],
  ["empty enabled mats", d => { d.spread.mats = []; }],
  ["unsafe spacing-derived count", d => { d.spread.mats[0].max_spacing_x_inches = 1e-300; }],
  ["partial spacing string", d => { d.spread.mats[0].max_spacing_x_inches = "12oops"; }],
  ["empty enabled design", d => { d.spread.mats = []; d.spread.inter_mat_ties = []; }],
]) check(`spread invalid ${name}: no partial or fabricated totals`, () => {
  const d = clone(design); mutate(d); invalid(spread, d);
});
for (const [name, mutate] of [
  ["oversized hoop", d => { d.pillar.hoops[0].centerline_diameter_inches = 18; }],
  ["hoop self-overlap", d => { d.pillar.hoops[0].centerline_diameter_inches = 0.25; }],
  ["hoop top cover", d => { d.pillar.hoops[0].center_y_inches = 33; }],
  ["overlapping hoops", d => { d.pillar.hoops.push({ ...d.pillar.hoops[0], id: "h2", center_y_inches: 6.25 }); }],
  ["overlapping longitudinal bars", d => { d.pillar.longitudinal.radius_inches = 0; }],
  ["longitudinal hoop collision", d => { d.pillar.longitudinal.radius_inches = 8.25; }],
  ["reversed longitudinal ends", d => { d.pillar.longitudinal.top_end_inches = 2; }],
  ["fractional count", d => { d.pillar.longitudinal.count = 1.5; }],
  ["negative count", d => { d.pillar.longitudinal.count = -1; }],
  ["explicit empty steel", d => { d.pillar.longitudinal.count = 0; d.pillar.hoops = []; }],
]) check(`pillar invalid ${name}: no partial or fabricated totals`, () => {
  const d = clone(pillarDesign); mutate(d); invalid(pillar, d);
});
check("preview budget zero/three preserves COMPLETE quantities and exact omitted count", () => {
  for (const limit of [0, 3]) {
    const m = valid(spread, design, { geometryLimit: limit });
    assert.equal(m.geometry.length, limit);
    assert.equal(m.omittedGeometryCount, 8 - limit);
    assert.equal(m.totals.total_steel_feet, 20);
    assert.equal(m.groups.reduce((sum, g) => sum + g.count, 0), 8);
    assert.ok(m.issues.some(i => i.code === "reinforcement_geometry_truncated"));
  }
  for (const limit of [-1, 1.5, 4097, Infinity]) invalid(spread, design, { geometryLimit: limit });
});
check("instance scaling does not duplicate preview geometry or lose safe-count checks", () => {
  const m = valid({ ...spread, quantity: 3 });
  assert.equal(m.geometry.length, 8);
  assert.equal(m.totals.total_steel_feet, 60);
  assert.equal(m.totals.horizontal_count, 24);
  assert.equal(m.totals.mat_crossings, 48);
  invalid({ ...spread, quantity: Number.MAX_SAFE_INTEGER }, design);
  for (const quantity of [null, undefined]) assert.equal(valid({ ...spread, quantity }).totals.total_steel_feet, 20);
});
check("zero centerline span yields one bar in that direction, no division by zero", () => {
  const d = clone(design);
  d.cover_inches = { side: 0, top: 0, bottom: 0 };
  const m = valid({ ...spread, length_inches: 0.5 }, d);
  assert.equal(m.perInstance.horizontal_count, 5);
  near(m.totals.total_steel_feet, 38 / 12);
  assert.ok(m.geometry.every(g => [g.from.x, g.from.y, g.from.z, g.to.x, g.to.y, g.to.z].every(Number.isFinite)));
});
check("supports unknown/manual/auto never masquerade as zero", () => {
  for (const supports of [undefined, { mode: "unconfigured" }, { mode: "manual" }, { mode: "auto" }]) {
    const d = clone(design); d.supports = supports;
    const m = valid(spread, d);
    assert.equal(m.supports.count, null);
    assert.equal(m.supports.status, "unconfigured");
    assert.ok(m.issues.some(i => i.code === "reinforcement_supports_unconfigured"));
  }
  const d = clone(design); d.supports = { mode: "off", reason: " " };
  invalid(spread, d, undefined, "incomplete");
  d.supports = { mode: "invented" };
  invalid(spread, d);
});
check("missing explicit design/cover/tie lists is incomplete, unsupported version invalid", () => {
  invalid(spread, undefined, undefined, "incomplete");
  const d = clone(design);
  delete d.cover_inches.top;
  invalid(spread, d, undefined, "incomplete");
  const noTies = clone(design); delete noTies.spread.inter_mat_ties;
  invalid(spread, noTies, undefined, "incomplete");
  invalid(spread, { ...design, version: 1 });
  invalid(spread, { ...design, bar_diameter_inches: "0.5" });
});
check("invalid basic shapes/counts/null input never produce preview or quantities", () => {
  for (const item of [null, {}, { ...spread, foundation_type: "unknown" }, { ...spread, quantity: 0 }, { ...spread, depth_inches: 0 }]) {
    invalid(item, design);
  }
});
check("rebar off requires no design, yields real zeros and no support requirement", () => {
  const m = calculate({ ...spread, include_rebar: false, rebar_layers: -2 });
  assert.equal(m.status, "off");
  assert.equal(m.totals.total_steel_feet, 0);
  assert.equal(m.supports.count, 0);
  assert.equal(m.supports.status, "not_required");
  assert.deepEqual(m.issues, []);
  assert.deepEqual(m.geometry, []);
});
check("proposal geometry is independent of legacy steel inputs, never reprices them", () => {
  const m = valid({ ...spread, rebar_layers: -2, rebar_spacing_width: 0, rebar_feet: 64, rebar_cost: 252.8 });
  assert.equal(m.totals.total_steel_feet, 20);
  assert.equal(m.rebar_cost, undefined);
  assert.equal(m.totals.grand_total, undefined);
});
check("manual ties require distinct valid parents, fitting positions and adequate cut length", () => {
  const d = clone(design);
  d.spread.mats.unshift({ ...clone(top), id: "bottom", bearing_elevation_inches: 3 });
  const tie = { id: "t", from_mat_id: "bottom", to_mat_id: "top", x_inches: 3.25, z_inches: 3.25, cut_length_inches: 30 };
  for (const patch of [
    { from_mat_id: "missing" }, { from_mat_id: "top" }, { x_inches: 0 },
    { z_inches: 36 }, { cut_length_inches: 28 }, { id: "top" },
  ]) {
    d.spread.inter_mat_ties = [{ ...tie, ...patch }];
    invalid(spread, d);
  }
});
check("CPU list bounds reject oversized designs without partial calculations", () => {
  const d = clone(design);
  d.spread.mats = Array.from({ length: 257 }, (_, i) => ({ ...top, id: "m" + i }));
  invalid(spread, d);
  const p = clone(pillarDesign);
  p.pillar.hoops = Array.from({ length: 257 }, (_, i) => ({ ...p.pillar.hoops[0], id: "h" + i }));
  invalid(pillar, p);
});
check("hoop identifier cannot collide with fixed longitudinal group identities", () => {
  const d = clone(pillarDesign);
  d.pillar.hoops[0].id = "longitudinal";
  const m = valid(pillar, d);
  assert.equal(new Set(m.groups.map(g => g.id)).size, m.groups.length);
  assert.equal(new Set(m.geometry.map(g => g.id)).size, m.geometry.length);
});
check("disconnected pillar steel is visible and never counted as proved connections", () => {
  const d = clone(pillarDesign);
  d.pillar.longitudinal.radius_inches = 7;
  const m = valid(pillar, d);
  assert.equal(m.perInstance.hoop_bar_crossings, 0);
  assert.ok(m.issues.some(i => i.code === "reinforcement_connection_unverified"));
});
check("all model authoring inputs remain unchanged and results have no shared mutable state", () => {
  const item = freeze(clone(spread)), d = freeze(clone(design)), options = freeze({ geometryLimit: 3 });
  const before = JSON.stringify({ item, d, options });
  const first = valid(item, d, options), second = valid(item, d, options);
  assert.deepEqual(first, second);
  first.geometry[0].from.x = 999;
  first.groups[0].count = 999;
  assert.notEqual(second.geometry[0].from.x, 999);
  assert.notEqual(second.groups[0].count, 999);
  assert.equal(JSON.stringify({ item, d, options }), before);
  valid(freeze(clone(pillar)), freeze(clone(pillarDesign)));
});

fs.writeFileSync(`${DIR}/model-verification.json`, JSON.stringify({ synthetic: true, modelOnly: true, results }, null, 2) + "\n");
const failures = results.filter(r => !r.ok).length;
console.log(`Version2 local geometry model: ${results.length - failures}/${results.length} passed; failed=${failures}`);
process.exitCode = failures ? 1 : 0;
