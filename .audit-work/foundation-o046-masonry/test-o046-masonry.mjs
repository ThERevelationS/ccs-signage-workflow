// O-046 / CMP-D03 verification harness — masonry normalization boundary.
// Bundles the CANDIDATE tree (testtree/src = remote deps + candidate overlay)
// and the verbatim REMOTE tree (remotetree/src) under Node via esbuild.
// No Base44 writes; pure Node.
//
// Parity contract under test: unit-masonry rows (brick / cinderblock / stone /
// absent subtype) must produce byte-identical results remote-vs-candidate.
// Poured-concrete rows are the deliberate honesty change: previously they were
// always held (UI preset writes 0 unit length/height → positive-dim check
// failed) or, with positive dims, priced via fictional unit-masonry math.
// Now they price by placed volume (CY) with only wall thickness required.

import { build } from "esbuild";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAND = path.join(HERE, "testtree", "src");
const REM = path.join(HERE, "remotetree", "src");
const OUT = path.join(HERE, ".bundle");
mkdirSync(OUT, { recursive: true });

const aliasFor = (root) => ({
  name: "base44-alias",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const base = path.join(root, args.path.slice(2));
      for (const ext of ["", ".js", ".jsx"]) {
        if (existsSync(base + ext)) return { path: base + ext };
      }
      return { path: base };
    });
  },
});

const bundle = async (root, entry, name) => {
  const res = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true, format: "esm", platform: "node",
    write: false, plugins: [aliasFor(root)], logLevel: "silent",
  });
  const file = path.join(OUT, name);
  writeFileSync(file, res.outputFiles[0].text);
  return file;
};

const mod = async (root, entry, name) => import(pathToFileURL(await bundle(root, entry, name)).href);

const B = await mod(CAND, "components/masterInventory/inventoryNormalization.js", "boundary.mjs");
const wall = await mod(CAND, "components/estimator/foundation/wallCalculator.js", "wall.mjs");
const calc = await mod(CAND, "components/estimator/foundation/foundationCalc.js", "calc.mjs");
const rwall = await mod(REM, "components/estimator/foundation/wallCalculator.js", "remote-wall.mjs");
const rB = await mod(REM, "components/masterInventory/inventoryNormalization.js", "remote-boundary.mjs");

let pass = 0, fail = 0;
const eq = (a, b) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => {
  if (eq(got, want)) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name} ${detail}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const OUTLINE_OPEN_96 = { points: [{ x: 0, z: 0 }, { x: 96, z: 0 }], closed: false, segments: [{ length: 96 }] };
const OUTLINE_SQUARE_96 = {
  points: [{ x: 0, z: 0 }, { x: 96, z: 0 }, { x: 96, z: 96 }, { x: 0, z: 96 }],
  closed: true,
  segments: [{ length: 96 }, { length: 96 }, { length: 96 }, { length: 96 }],
};
const wallRow = (over = {}) => ({
  heightInches: 24, includeInternalWall: false, shape: OUTLINE_OPEN_96,
  materialId: "m1", component_id: "w1", ...over,
});
const masonryRow = (over = {}) => ({
  id: "m1", material_type: "wall_material", material_name: "Red Brick",
  wall_material_subtype: "brick",
  wall_unit_length_inches: 8, wall_unit_width_inches: 3.75, wall_unit_height_inches: 2.25,
  cost_per_unit: 0.75, ...over,
});
const cmuRow = (over = {}) => masonryRow({
  material_name: "8x8x16 CMU", wall_material_subtype: "cinderblock",
  wall_unit_length_inches: 16, wall_unit_width_inches: 8, wall_unit_height_inches: 8,
  cost_per_unit: 1.9, ...over,
});
const stoneRow = (over = {}) => masonryRow({
  material_name: "Field Stone", wall_material_subtype: "stone",
  wall_unit_length_inches: 12, wall_unit_width_inches: 6, wall_unit_height_inches: 4,
  cost_per_unit: 2.4, ...over,
});
const brickStoneRow = (over = {}) => ({
  id: "m1", material_type: "brick_stone", material_name: "Legacy Brick",
  brick_length_inches: 8, brick_width_inches: 3.75, brick_height_inches: 2.25,
  cost_per_unit: 0.75, ...over,
});
const concreteRow = (over = {}) => ({
  id: "m1", material_type: "wall_material", material_name: "Poured Wall Mix",
  wall_material_subtype: "concrete",
  wall_unit_length_inches: null, wall_unit_width_inches: 8, wall_unit_height_inches: null,
  cost_per_unit: 150, ...over,
});
const SETTINGS = { wall_mortar_cost_per_bag: 10, wall_labor_rate: 45, wall_minimum_charge: 150, wall_labor_bricks_per_hour: 50 };

// ─── A. Boundary subtype canonicalization ───────────────────────────────────

const C = B.canonicalWallMaterialSubtype;
const SUBTYPE_MATRIX = [
  ["brick", "brick"], ["Brick", "brick"], [" BRICK ", "brick"], ["clay_brick", "brick"],
  ["cinderblock", "cinderblock"], ["cinder block", "cinderblock"], ["cinder_block", "cinderblock"],
  ["cmu", "cinderblock"], ["CMU", "cinderblock"], ["concrete block", "cinderblock"],
  ["concrete_block", "cinderblock"], ["concrete masonry unit", "cinderblock"], ["block", "cinderblock"],
  ["stone", "stone"], ["natural stone", "stone"], ["natural_stone", "stone"], ["cut stone", "stone"],
  ["limestone", "stone"], ["sandstone", "stone"], ["stone-veneer", "stone"],
  ["concrete", "concrete"], ["poured_concrete", "concrete"], ["poured concrete", "concrete"],
  ["poured-concrete", "concrete"], ["poured", "concrete"], ["cast_in_place", "concrete"],
  ["cast-in-place", "concrete"], ["cast in place concrete", "concrete"], ["monolithic concrete", "concrete"],
];
for (const [raw, want] of SUBTYPE_MATRIX) check(`subtype ${JSON.stringify(raw)}`, C(raw), want);
const UNRECORDED = [undefined, null, "", " ", "   "];
for (const v of UNRECORDED) {
  check(`subtype unrecorded ${JSON.stringify(v)}`, C(v), null);
  check(`recorded? ${JSON.stringify(v)}`, B.wallMaterialSubtypeRecorded(v), false);
}
const UNRECOGNIZED = ["glass_block", "glassblock", "mystery", "precast", "adobe", "rubble", 5, -1, {}, [], true];
for (const v of UNRECOGNIZED) {
  check(`subtype unrecognized ${JSON.stringify(v) === undefined ? String(v) : JSON.stringify(v)}`, C(v), null);
  check(`recorded? ${JSON.stringify(v) === undefined ? String(v) : JSON.stringify(v)}`, B.wallMaterialSubtypeRecorded(v), true);
}

const N = B.normalizeFoundationInventoryRow;
check("alias cmu→cinderblock", N({ wall_material_subtype: "cmu" }).wall_material_subtype, "cinderblock");
check("alias poured concrete→concrete", N({ wall_material_subtype: "poured concrete" }).wall_material_subtype, "concrete");
check("alias cast_in_place→concrete", N({ wall_material_subtype: "cast_in_place" }).wall_material_subtype, "concrete");
check("canonical subtype unchanged", N({ wall_material_subtype: "brick" }).wall_material_subtype, "brick");
check("unrecognized subtype verbatim", N({ wall_material_subtype: "glass_block" }).wall_material_subtype, "glass_block");
check("absent subtype stays absent", "wall_material_subtype" in N({}), false);
check("null subtype stays null", N({ wall_material_subtype: null }).wall_material_subtype, null);
{
  const src = { wall_material_subtype: "cmu" };
  N(src);
  check("authored subtype row not mutated", src.wall_material_subtype, "cmu");
}
{
  const rows = [{ wall_material_subtype: "Poured_Concrete" }, { wall_material_subtype: "brick" }];
  const once = B.normalizeFoundationInventoryRows(rows);
  check("rows subtype canonicalized", once[0].wall_material_subtype, "concrete");
  const twice = B.normalizeFoundationInventoryRows(once);
  check("subtype idempotent", twice, once);
}

// ─── B. Remote parity — unit masonry MUST be byte-identical ─────────────────
// Remote check() lacked subtype classification but every masonry fixture here
// keeps an already-canonical/absent subtype, so remote and candidate must
// agree exactly on issues, costs, BOM text, and wall snapshots.

const parity = (name, projectWall, inventory, settings, options) => {
  const a = wall.calcWalls({ walls: [projectWall] }, inventory, settings, options);
  const b = rwall.calcWalls({ walls: [projectWall] }, inventory, settings, options);
  check(`PARITY ${name} walls`, JSON.stringify(a.walls), JSON.stringify(b.walls));
  check(`PARITY ${name} pricing`, JSON.stringify(a.wallPricing), JSON.stringify(b.wallPricing));
};
const parityIssues = (name, projectWall, inventory, settings) => {
  const a = wall.foundationWallPricingIssues(projectWall, inventory, 0, settings);
  const b = rwall.foundationWallPricingIssues(projectWall, inventory, 0, settings);
  check(`PARITY issues ${name}`, JSON.stringify(a), JSON.stringify(b));
};

parity("brick basic", wallRow(), [masonryRow()], SETTINGS);
parity("cmu basic", wallRow(), [cmuRow()], SETTINGS);
parity("stone basic", wallRow(), [stoneRow()], SETTINGS);
parity("absent subtype (legacy wall_material)", wallRow(), [masonryRow({ wall_material_subtype: undefined })], SETTINGS);
parity("brick_stone legacy alias dims", wallRow(), [brickStoneRow()], SETTINGS);
parity("square closed outline", wallRow({ shape: OUTLINE_SQUARE_96 }), [masonryRow()], SETTINGS);
parity("internal masonry wall", wallRow({ includeInternalWall: true, internalMaterialId: "m2", internalWallHeightInches: 18 }),
  [masonryRow(), { ...cmuRow({ id: undefined }), id: "m2" }], SETTINGS);
parity("qty+rate overrides", wallRow({ custom_internal_material_qty: 7 }),
  [masonryRow({ custom_outer_material_qty: 500, custom_cost_per_unit: 0.5, custom_outer_labor_rate: 30, custom_outer_mortar_qty: 3, custom_outer_mortar_rate: 12 })], SETTINGS);
parity("explicit-0 override kept", wallRow(), [masonryRow({ custom_outer_material_qty: 0 })], SETTINGS);
parity("malformed unit dim held", wallRow(), [masonryRow({ wall_unit_length_inches: "abc" })], SETTINGS);
parity("zero dim held", wallRow(), [masonryRow({ wall_unit_height_inches: 0 })], SETTINGS);
parity("negative dim held", wallRow(), [masonryRow({ wall_unit_width_inches: -4 })], SETTINGS);
parity("missing price held", wallRow(), [masonryRow({ cost_per_unit: null })], SETTINGS);
parity("explicit-0 price is free", wallRow(), [masonryRow({ cost_per_unit: 0 })], SETTINGS);
parity("bad mortar gap held", wallRow({ mortarGapInches: "x" }), [masonryRow()], SETTINGS);
parity("zero mortar gap stack bond", wallRow({ mortarGapInches: 0 }), [masonryRow()], SETTINGS);
parity("bad labor setting held", wallRow(), [masonryRow()], { ...SETTINGS, wall_labor_rate: "abc" });
parity("bad production setting held", wallRow(), [masonryRow()], { ...SETTINGS, wall_labor_bricks_per_hour: "no" });
parity("bad mortar setting held", wallRow(), [masonryRow()], { ...SETTINGS, wall_mortar_cost_per_bag: -1 });
parity("missing material held", wallRow({ materialId: "gone" }), [masonryRow()], SETTINGS);
parity("ambiguous material held", wallRow(), [masonryRow(), { ...masonryRow(), material_name: "dup" }], SETTINGS);
parity("type mismatch held", wallRow(), [{ ...masonryRow(), material_type: "rebar" }], SETTINGS);
parity("unassigned held", wallRow({ materialId: "" }), [masonryRow()], SETTINGS);
parity("missing outline held", wallRow({ shape: {} }), [masonryRow()], SETTINGS);
parity("height missing held", wallRow({ heightInches: null }), [masonryRow()], SETTINGS);
parity("saved-wall acknowledged hold", wallRow({ materialId: "gone", calculatedCosts: { materialCost: 42, totalCost: 99 } }),
  [masonryRow()], SETTINGS, { savedWalls: [{ component_id: "w1", calculatedCosts: { materialCost: 42, totalCost: 99 } }] });
parityIssues("brick issues", wallRow(), [masonryRow()], SETTINGS);
parityIssues("bad dims issues", wallRow(), [masonryRow({ wall_unit_width_inches: "z" })], SETTINGS);

// BOM rows on masonry must be identical strings remote-vs-candidate.
{
  const priced = wall.calcWalls({ walls: [wallRow()] }, [masonryRow()], SETTINGS);
  const a = wall.foundationWallBomRows(priced.walls, [masonryRow()], priced.wallPricing);
  const rPriced = rwall.calcWalls({ walls: [wallRow()] }, [masonryRow()], SETTINGS);
  const b = rwall.foundationWallBomRows(rPriced.walls, [masonryRow()], rPriced.wallPricing);
  check("PARITY BOM rows", JSON.stringify(a), JSON.stringify(b));
}

// ─── C. The documented divergence: poured concrete ≠ unit masonry ───────────
// Remote: UI-authored concrete row (0 L/H dims) → held "unavailable".
// Candidate: same row prices by placed volume — 96 x 24 x 8 in = 18,432 in³
// ÷ 46,656 in³/CY = 0.395061728 CY × $150/CY = $59.26 material.

{
  const proj = { walls: [wallRow()] };
  const row = concreteRow({ wall_unit_length_inches: 0, wall_unit_height_inches: 0 });
  const remoteRes = rwall.calcWalls(proj, [row], SETTINGS);
  check("REMOTE held on 0-dims (control)", remoteRes.wallPricing[0].available, false);
  ok("REMOTE issues include dim holds",
    remoteRes.wallPricing[0].issues.some(i => i.code === "wall_unit_length_inches_unavailable")
      && remoteRes.wallPricing[0].issues.some(i => i.code === "wall_unit_height_inches_unavailable"),
    JSON.stringify(remoteRes.wallPricing[0].issues));

  const res = wall.calcWalls(proj, [row], SETTINGS);
  const costs = res.walls[0].calculatedCosts;
  check("concrete now priced", res.wallPricing[0].available, true);
  ok("concrete qty = CY volume", near(costs.totalBricks, 18432 / 46656), JSON.stringify(costs));
  ok("concrete material = CY × $/CY", near(costs.materialCost, (18432 / 46656) * 150), JSON.stringify(costs));
  check("concrete no courses", costs.numCourses, 0);
  check("concrete no mortar", costs.mortarCost, 0);
  check("concrete no per-unit hours", costs.laborHours, 0);
  ok("concrete labor by wall-face area", near(costs.laborCost, Math.max(16 * 45, 150)), JSON.stringify(costs));
  ok("concrete total", near(costs.totalCost, (18432 / 46656) * 150 + 720), JSON.stringify(costs));
  check("concrete snapshot carries CY basis", costs.materialQuantityUnit, "cy");
}

// Poured aliases (raw rows — the panel path sees un-normalized inventory).
{
  const res = wall.calcWalls({ walls: [wallRow()] },
    [concreteRow({ wall_material_subtype: "poured concrete" })], SETTINGS);
  ok("'poured concrete' raw row prices CY", res.wallPricing[0].available
    && near(res.walls[0].calculatedCosts.materialCost, (18432 / 46656) * 150),
    JSON.stringify(res.wallPricing[0].issues));
  const res2 = wall.calcWalls({ walls: [wallRow()] },
    [concreteRow({ wall_material_subtype: "cast-in-place" })], SETTINGS);
  check("'cast-in-place' prices", res2.wallPricing[0].available, true);
}

// 'cmu' alias → unit masonry, identical dims math as canonical cinderblock.
{
  const a = wall.calcWalls({ walls: [wallRow()] }, [cmuRow({ wall_material_subtype: "cmu" })], SETTINGS);
  const b = wall.calcWalls({ walls: [wallRow()] }, [cmuRow()], SETTINGS);
  check("cmu alias == cinderblock priced", JSON.stringify(a.walls), JSON.stringify(b.walls));
}

// Unrecognized recorded subtypes → held, never laundered to a method.
for (const bad of ["glass_block", "precast", "adobe", 5, { x: 1 }]) {
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ wall_material_subtype: bad })], SETTINGS);
  check(`unrecognized subtype held ${JSON.stringify(bad) === undefined ? String(bad) : JSON.stringify(bad)}`,
    res.wallPricing[0].available, false);
  ok(`subtype issue code ${String(bad)}`,
    res.wallPricing[0].issues.some(i => i.code === "wall_material_subtype_unavailable"),
    JSON.stringify(res.wallPricing[0].issues));
}
// …and the acknowledged saved snapshot rides through the hold untouched.
{
  const savedWall = wallRow({ calculatedCosts: { materialCost: 42, totalCost: 99 } });
  const res = wall.calcWalls({ walls: [savedWall] },
    [concreteRow({ wall_material_subtype: "glass_block" })], SETTINGS);
  check("held wall keeps acknowledged costs", JSON.stringify(res.walls[0].calculatedCosts), JSON.stringify({ materialCost: 42, totalCost: 99 }));
}

// Concrete dim contract: only wall thickness (unit width) is consumed.
for (const [w, desc] of [[undefined, "absent"], [0, "zero"], [-8, "negative"], ["abc", "malformed"], ["", "blank"]]) {
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ wall_unit_width_inches: w })], SETTINGS);
  check(`concrete thickness ${desc} held`, res.wallPricing[0].available, false);
  ok(`thickness issue ${desc}`, res.wallPricing[0].issues.some(i => i.code === "wall_unit_width_inches_unavailable"),
    JSON.stringify(res.wallPricing[0].issues));
}
// Non-consumed L/H fields on concrete never hold — even malformed noise.
{
  const res = wall.calcWalls({ walls: [wallRow()] },
    [concreteRow({ wall_unit_length_inches: "junk", wall_unit_height_inches: -5 })], SETTINGS);
  check("concrete L/H noise not consumed", res.wallPricing[0].available, true);
}

// Unit basis: recorded non-CY unit is a price-basis ambiguity → hold.
for (const u of ["each", "sqft", "bag", "lf", "ton", 3]) {
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ unit: u })], SETTINGS);
  check(`unit ${JSON.stringify(u)} held`, res.wallPricing[0].available, false);
  ok(`unit issue ${String(u)}`, res.wallPricing[0].issues.some(i => i.code === "wall_material_unit_mismatch"),
    JSON.stringify(res.wallPricing[0].issues));
}
for (const u of ["cy", "CY", "cubic yards", "yd", "yards", "cy.d", undefined, null, "", "  "]) {
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ unit: u })], SETTINGS);
  check(`unit ${JSON.stringify(u)} priced`, res.wallPricing[0].available, true);
}

// Overrides on the CY basis: qty override = CY override, explicit 0 stays free.
{
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ custom_outer_material_qty: 2 })], SETTINGS);
  ok("CY qty override", near(res.walls[0].calculatedCosts.materialCost, 300), JSON.stringify(res.walls[0].calculatedCosts));
  const res0 = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ custom_outer_material_qty: 0 })], SETTINGS);
  check("explicit-0 CY override = $0 material", res0.walls[0].calculatedCosts.materialCost, 0);
  check("explicit-0 price still free", wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ cost_per_unit: 0 })], SETTINGS)
    .walls[0].calculatedCosts.materialCost, 0);
  const resBad = wall.calcWalls({ walls: [wallRow()] }, [concreteRow({ custom_outer_material_qty: "x" })], SETTINGS);
  check("malformed CY override held", resBad.wallPricing[0].available, false);
}

// Mortar + production settings are NOT consumed by poured walls.
{
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow()],
    { ...SETTINGS, wall_mortar_cost_per_bag: "x", wall_labor_bricks_per_hour: "x" });
  check("concrete ignores unconsumed settings", res.wallPricing[0].available, true);
  const mres = wall.calcWalls({ walls: [wallRow()] }, [masonryRow()],
    { ...SETTINGS, wall_labor_bricks_per_hour: "x" });
  check("masonry still held on bad production setting (control)", mres.wallPricing[0].available, false);
}
// …but wall labor rate + minimum charge ARE consumed (area labor).
{
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow()], { ...SETTINGS, wall_labor_rate: "bad" });
  check("concrete held on bad labor rate", res.wallPricing[0].available, false);
  const resMin = wall.calcWalls({ walls: [wallRow()] }, [concreteRow()], { ...SETTINGS, wall_minimum_charge: "bad" });
  check("concrete held on bad minimum charge", resMin.wallPricing[0].available, false);
}

// ─── D. Internal (fill) wall on the CY basis ────────────────────────────────

{
  const proj = { walls: [wallRow({ includeInternalWall: true, internalMaterialId: "m2", internalWallHeightInches: 24, shape: OUTLINE_SQUARE_96 })] };
  const inv = [concreteRow(), { ...concreteRow({ id: undefined }), id: "m2", wall_unit_width_inches: 4, cost_per_unit: 140 }];
  const res = wall.calcWalls(proj, inv, SETTINGS);
  const costs = res.walls[0].calculatedCosts;
  check("concrete fill priced", res.wallPricing[0].available, true);
  // Closed square: inner run reduced by outer(8)+inner(4) thickness per corner
  // → 84" × 4 segs = 336 lin-in × 24h × 4" = 32,256 in³ ÷ 46,656 = 0.691358 CY.
  ok("fill qty = CY on reduced run", near(costs.internalTotalBricks, 32256 / 46656), JSON.stringify(costs));
  ok("fill material = CY × $/CY", near(costs.internalMaterialCost, (32256 / 46656) * 140), JSON.stringify(costs));
  check("fill no mortar", costs.internalMortarCost, 0);
  check("fill no per-unit hours", costs.internalLaborHours, 0);
  check("fill snapshot CY basis", costs.internalMaterialQuantityUnit, "cy");
}

// Masonry outer + concrete inner → mortar only on the masonry half.
{
  const proj = { walls: [wallRow({ includeInternalWall: true, internalMaterialId: "m2", internalWallHeightInches: 24 })] };
  const inv = [masonryRow(), { ...concreteRow({ id: undefined }), id: "m2" }];
  const res = wall.calcWalls(proj, inv, SETTINGS);
  const costs = res.walls[0].calculatedCosts;
  check("masonry outer + poured fill priced", res.wallPricing[0].available, true);
  ok("outer mortar still counted", costs.mortarCost > 0, JSON.stringify(costs));
  check("fill no mortar", costs.internalMortarCost, 0);
  ok("fill CY", costs.internalTotalBricks > 0 && costs.internalTotalBricks < 1, JSON.stringify(costs));
}
// Concrete outer + masonry inner → inner keeps courses/mortar/production-hours.
{
  const proj = { walls: [wallRow({ includeInternalWall: true, internalMaterialId: "m2", internalWallHeightInches: 24 })] };
  const inv = [concreteRow(), { ...cmuRow({ id: undefined }), id: "m2" }];
  const res = wall.calcWalls(proj, inv, SETTINGS);
  const costs = res.walls[0].calculatedCosts;
  check("poured outer + masonry fill priced", res.wallPricing[0].available, true);
  check("outer no mortar", costs.mortarCost, 0);
  ok("inner mortar counted", costs.internalMortarCost > 0, JSON.stringify(costs));
  ok("inner unit count", costs.internalTotalBricks > 10, JSON.stringify(costs));
  ok("inner production hours", costs.internalLaborHours > 0, JSON.stringify(costs));
}
// Masonry fill still requires the production setting even when outer is poured.
{
  const proj = { walls: [wallRow({ includeInternalWall: true, internalMaterialId: "m2", internalWallHeightInches: 24 })] };
  const inv = [concreteRow(), { ...cmuRow({ id: undefined }), id: "m2" }];
  const res = wall.calcWalls(proj, inv, { ...SETTINGS, wall_labor_bricks_per_hour: "x" });
  check("bad production setting holds masonry fill", res.wallPricing[0].available, false);
}

// ─── E. BOM labels ──────────────────────────────────────────────────────────

{
  const res = wall.calcWalls({ walls: [wallRow()] }, [concreteRow()], SETTINGS);
  const rows = wall.foundationWallBomRows(res.walls, [concreteRow()], res.wallPricing);
  ok("BOM concrete qty labeled CY", rows[0].quantity.endsWith("CY"), JSON.stringify(rows));
  ok("BOM CY number", near(parseFloat(rows[0].quantity), 18432 / 46656, 0.005), rows[0].quantity);
  const mres = wall.calcWalls({ walls: [wallRow()] }, [masonryRow()], SETTINGS);
  const mrows = wall.foundationWallBomRows(mres.walls, [masonryRow()], mres.wallPricing);
  ok("BOM masonry qty labeled units", mrows[0].quantity.endsWith("units"), JSON.stringify(mrows));
}
// Saved/held rows keep the saved vocabulary (material row may be gone).
{
  const res = wall.calcWalls({ walls: [wallRow({ materialId: "gone", calculatedCosts: { totalBricks: 5, materialCost: 9 } })] },
    [concreteRow()], SETTINGS);
  const rows = wall.foundationWallBomRows(res.walls, [concreteRow()], res.wallPricing);
  ok("saved row lists saved material", /saved outer material/.test(rows[0].material), JSON.stringify(rows));
}

// ─── F. calcProject ingress + totals flow ────────────────────────────────────

{
  const project = { items: [], poles: [], selected_equipment: [], wall_caps: [], walls: [wallRow()] };
  const rawInv = [concreteRow({ wall_material_subtype: "poured concrete" })];
  const res = calc.calcProject(project, rawInv, SETTINGS, { savedProject: null });
  const costs = res.walls[0].calculatedCosts;
  check("calcProject ingress: poured alias priced", res.wallPricing[0].available, true);
  ok("ingress CY material cost", near(costs.materialCost, (18432 / 46656) * 150), JSON.stringify(costs));
  ok("total_wall_cost flows", near(res.totals.total_wall_cost, costs.totalCost), JSON.stringify(res.totals));
  ok("total_brick_cost flows", near(res.totals.total_brick_cost, costs.materialCost), JSON.stringify(res.totals));
  check("no catalog issues on priced concrete",
    res.catalogIssues.filter(i => i.kind === "wall" || i.kind === "internal_wall").length, 0);
  ok("grand_total includes wall", near(res.totals.grand_total, costs.totalCost), JSON.stringify(res.totals));
}

// calcProject ingress: legacy brick_stone dims fill wall_unit_* on the
// calculation copy — the authored dims drive the count (audit repro: legacy
// brick_* fields invisible → 8x4x2.25 fallback count; canonicalized →
// authored-dims count). A 16" authored unit on a 96x24 wall: pitch 16.375 →
// 6/course x 10 courses = 60, vs the 12/course x 10 = 120 an 8" fallback
// would produce.
{
  const project = { items: [], poles: [], selected_equipment: [], wall_caps: [], walls: [wallRow()] };
  const res = calc.calcProject(project, [brickStoneRow({ brick_length_inches: 16 })], SETTINGS, { savedProject: null });
  const costs = res.walls[0].calculatedCosts;
  check("legacy brick_* row prices via ingress fill", res.wallPricing[0].available, true);
  ok("authored dims drive count", near(costs.totalBricks, 60), JSON.stringify(costs));
  // Explicit canonical null beats the legacy alias — the fill only fires on
  // ABSENT canonical fields, so a deliberately-cleared field stays cleared
  // and the wall holds instead of silently pricing on alias dims.
  const resNull = calc.calcProject(project,
    [{ ...brickStoneRow(), wall_unit_length_inches: null }], SETTINGS, { savedProject: null });
  check("explicit-null canonical holds despite legacy alias", resNull.wallPricing[0].available, false);
  ok("null hold issue", resNull.wallPricing[0].issues.some(i => i.code === "wall_unit_length_inches_unavailable"),
    JSON.stringify(resNull.wallPricing[0].issues));
}

// A declared concrete subtype wins over material_type — a legacy brick_stone
// row marked "concrete" is poured, priced per CY on its thickness field.
{
  const res = wall.calcWalls({ walls: [wallRow()] },
    [brickStoneRow({ wall_material_subtype: "concrete", wall_unit_width_inches: 8 })], SETTINGS);
  check("brick_stone+concrete subtype prices CY", res.wallPricing[0].available, true);
  ok("subtype picks CY method", near(res.walls[0].calculatedCosts.materialCost, (18432 / 46656) * 0.75),
    JSON.stringify(res.walls[0].calculatedCosts));
  check("brick_stone+concrete no mortar", res.walls[0].calculatedCosts.mortarCost, 0);
}

// ─── G. Direct calcWallCosts parity + concrete method ────────────────────────

{
  const shape = wall.foundationWallOutlineBasis(OUTLINE_OPEN_96).shape;
  const mk = (mat) => ({
    wall: wallRow(), wallShape: shape, wallMaterial: mat, internalMaterial: null,
    includeInternalWall: false, wallHeightInches: 24, internalWallHeightInches: null,
    mortarGapInches: 0.375, internalMortarGapInches: 0.375, settings: SETTINGS,
  });
  const a = wall.calcWallCosts(mk(masonryRow()));
  const b = rwall.calcWallCosts(mk(masonryRow()));
  check("PARITY calcWallCosts masonry", JSON.stringify(a), JSON.stringify(b));
  const c = wall.calcWallCosts(mk(concreteRow()));
  ok("direct concrete CY", near(c.totalBricks, 18432 / 46656) && c.numCourses === 0 && c.mortarCost === 0,
    JSON.stringify(c));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} o046-masonry — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
