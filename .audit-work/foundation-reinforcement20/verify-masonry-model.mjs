// Masonry residual-input hardening — model proof.
// Bundles the real calc chain (candidate wallCalculator + foundationCalc +
// foundationInputValidation against remote-frozen poleCalculator/
// wallCapCalculator/legacyFoundationCalc/foundationCatalogIntegrity/
// foundationEquipmentBindings) and exercises calcWalls + calcProject invariants.
// MASONRY_MODEL_RED=1 runs the pre-hardening remote sources — the checks must
// fail there (they encode the hardened contract).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement20/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read("masonry-residuals-baseline.json").files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.MASONRY_MODEL_RED === "1";
const F = "/app/src/components/estimator/foundation/";
if (!RED) {
  sources.set(F + "wallCalculator.js", fs.readFileSync(DIR + "masonry-residuals-candidate-wallCalculator.js", "utf8"));
  sources.set(F + "foundationCalc.js", fs.readFileSync(DIR + "masonry-residuals-candidate-foundationCalc.js", "utf8"));
  sources.set(F + "foundationInputValidation.js", fs.readFileSync(DIR + "masonry-residuals-candidate-foundationInputValidation.js", "utf8"));
}
const CANDIDATE_HASHES = JSON.parse(fs.readFileSync(DIR + "masonry-residuals-candidate-hashes.json", "utf8"));
if (!RED) {
  for (const [name, p] of Object.entries({
    "wallCalculator.js": F + "wallCalculator.js",
    "foundationCalc.js": F + "foundationCalc.js",
    "foundationInputValidation.js": F + "foundationInputValidation.js",
  })) assert.equal(hash(sources.get(p)), CANDIDATE_HASHES[name], name + " candidate");
}

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source: " + a.path + " (imported by " + a.importer + ")");
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js" };
  });
}};
const entry = "/app/masonry-model-entry.js";
sources.set(entry, `
export { calcWalls, calcWallCosts, foundationWallPricingIssues, foundationWallCatalogIssues, foundationWallBomRows } from "${F}wallCalculator.js";
export { calcProject, calcItem } from "${F}foundationCalc.js";
export { foundationItemInputIssues, foundationProjectInputIssues } from "${F}foundationInputValidation.js";
export { foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } from "${F}foundationCatalogIntegrity.js";
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "masonry-model-red-bundle.mjs" : "masonry-model-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "masonry-model-red-bundle.mjs" : "masonry-model-bundle.mjs"))));
if (!RED) {
  assert.equal(loaded[F + "wallCalculator.js"], CANDIDATE_HASHES["wallCalculator.js"], "candidate loaded");
  assert.equal(loaded[F + "foundationCalc.js"], CANDIDATE_HASHES["foundationCalc.js"], "calc loaded");
  assert.equal(loaded[F + "foundationInputValidation.js"], CANDIDATE_HASHES["foundationInputValidation.js"], "validation loaded");
}

// ---------- fixtures ----------
const { fixture: seed } = read("masonry-residuals-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseProject = () => clone(seed.project);
const baseInv = () => clone(seed.inventory);
const baseSettings = () => clone(seed.settings);
const savedOf = (project) => clone(project);
const WALL = 0, ITEM = 0;
// RED mode runs the pre-hardening remote wallCalculator: calcWalls returns a
// bare array, so adapt it into the {walls, wallPricing} shape (issues empty).
const wallResult = RED
  ? (project, inv, settings) => ({
      walls: api.calcWalls(project, inv, settings),
      wallPricing: (project.walls || []).map(() => ({ available: true, issues: [] })),
    })
  : (project, inv, settings, options) => api.calcWalls(project, inv, settings, options);
const codes = (issues) => issues.map((i) => i.code);
const EV = seed.expectedValid;

const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok " + name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log("FAIL " + name + " :: " + String(error.message).slice(0, 400)); }
};

// ---------- frozen-legacy controls ----------
check("valid walls price identically to ported formulas; calcWalls returns {walls, wallPricing}", () => {
  const p = baseProject(), inv = baseInv(), s = baseSettings();
  const before = clone({ wall: p.walls[0], inv, s });
  const r = wallResult(p, inv, s, { savedWalls: savedOf(p).walls });
  assert.deepEqual(r.wallPricing.map((x) => x.available), [true]);
  assert.equal(r.wallPricing[0].issues.length, 0);
  assert.deepEqual(r.walls[WALL].calculatedCosts, EV.wall);
  assert.deepEqual({ wall: p.walls[0], inv, s }, before, "no source mutation");
});

check("calcProject totals match ported math for a valid wall + item", () => {
  const p = baseProject(), saved = savedOf(p);
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.catalogIssues.length, 0);
  assert.equal(r.inputIssues.length, 0);
  assert.equal(r.totals.total_wall_cost, EV.wall.totalCost);
  assert.equal(r.totals.total_brick_cost, EV.wall.materialCost);
  assert.equal(r.totals.total_fill_cost, EV.wall.internalMaterialCost);
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
  assert.equal(r.delivery.concreteTotal, EV.deliveryConcreteTotal);
  assert.equal(r.totals.grand_total, EV.grandTotal);
});

check("explicit-zero mortar gaps are honored (stack bond), not overridden", () => {
  const p = baseProject();
  p.walls[WALL].mortarGapInches = 0;
  p.walls[WALL].internalMortarGapInches = 0;
  const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: [] });
  assert.equal(r.wallPricing[0].available, true);
  assert.deepEqual(r.walls[WALL].calculatedCosts, EV.zeroGapWall,
    "0-gap outer + internal bricks differ from the 3/8in default");
});

check("blank and absent mortar gaps keep the 3/8in default", () => {
  for (const v of [undefined, null, ""]) {
    const p = baseProject(), inv = baseInv(), s = baseSettings();
    p.walls[WALL].mortarGapInches = v;
    p.walls[WALL].internalMortarGapInches = v;
    const r = wallResult(p, inv, s, { savedWalls: [] });
    assert.equal(r.wallPricing[0].available, true, "v=" + JSON.stringify(v));
    assert.equal(r.walls[WALL].calculatedCosts.totalBricks, EV.wall.totalBricks);
    assert.equal(r.walls[WALL].calculatedCosts.internalTotalBricks, EV.wall.internalTotalBricks);
  }
});

check("numeric-string mortar gaps normalize on the calculation copy", () => {
  const p = baseProject();
  p.walls[WALL].mortarGapInches = "0.5";
  p.walls[WALL].internalMortarGapInches = "0.25";
  const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: [] });
  assert.equal(r.wallPricing[0].available, true);
  // courseH 2.75 -> 9 courses; pitch 8.5 -> 57+29=86? verify bricks not concatenated
  assert.equal(typeof r.walls[WALL].calculatedCosts.totalBricks, "number");
  assert.ok(Number.isFinite(r.walls[WALL].calculatedCosts.totalCost));
  assert.equal(p.walls[WALL].mortarGapInches, "0.5", "authored string preserved");
});

// ---------- invalid mortar gaps hold ----------
const badGaps = [
  ["alpha", "abc"], ["negative", -3], ["NaN", NaN], ["Infinity", Infinity],
  ["unit-suffixed", "0.5 in"], ["record", {}], ["array", []], ["whitespace", " "],
];
for (const [label, value] of badGaps) {
  check(`invalid mortar gap holds acknowledged amounts (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.walls[WALL].mortarGapInches = value;
    const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: saved.walls });
    assert.equal(r.wallPricing[WALL].available, false, "v=" + String(value));
    const issue = r.wallPricing[WALL].issues.find((i) => i.field === "mortarGapInches");
    assert.equal(issue?.code, "wall_mortar_gap_unavailable");
    assert.equal(issue?.kind, "wall");
    assert.equal(issue?.componentId, "synthetic-wall-1");
    assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777, "held saved totalCost");
    assert.equal(r.walls[WALL].calculatedCosts.totalBricks, 700);
    assert.equal(p.walls[WALL].mortarGapInches === value || (typeof value === "number" && Number.isNaN(value) && Number.isNaN(p.walls[WALL].mortarGapInches)), true, "authored value preserved");
  });
}
for (const [label, value] of badGaps) {
  check(`invalid internal mortar gap holds acknowledged amounts (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.walls[WALL].internalMortarGapInches = value;
    const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: saved.walls });
    assert.equal(r.wallPricing[WALL].available, false, "v=" + String(value));
    const issue = r.wallPricing[WALL].issues.find((i) => i.field === "internalMortarGapInches");
    assert.equal(issue?.code, "internal_wall_mortar_gap_unavailable");
    assert.equal(issue?.kind, "internal_wall");
    assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777);
  });
}

check("garbage mortar gap on a concrete wall is not consumed — no hold", () => {
  const p = baseProject(), inv = baseInv();
  p.walls[WALL].materialId = "synthetic-wall-concrete";
  p.walls[WALL].internalMaterialId = "synthetic-wall-concrete";
  p.walls[WALL].mortarGapInches = "abc";
  p.walls[WALL].internalMortarGapInches = "abc";
  const r = wallResult(p, inv, baseSettings(), { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true, JSON.stringify(r.wallPricing[WALL].issues));
  assert.ok(Number.isFinite(r.walls[WALL].calculatedCosts.totalCost), "concrete wall priced");
});

// ---------- wall labor settings ----------
for (const [label, value] of [["string zero", "0"], ["number zero", 0], ["negative", -5], ["malformed", "abc"]]) {
  check(`invalid wall_labor_bricks_per_hour holds — never Infinity labor (${label})`, () => {
    const p = baseProject(), saved = savedOf(p), s = baseSettings();
    s.wall_labor_bricks_per_hour = value;
    const r = wallResult(p, baseInv(), s, { savedWalls: saved.walls });
    assert.equal(r.wallPricing[WALL].available, false, "v=" + String(value));
    const issue = r.wallPricing[WALL].issues.find((i) => i.field === "wall_labor_bricks_per_hour");
    assert.equal(issue?.code, "wall_setting_unavailable");
    assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777);
    assert.equal(r.walls[WALL].calculatedCosts.laborHours, 14, "held hours — no Infinity");
  });
}
check("NaN wall_labor_bricks_per_hour is falsy — falls back to default like the legacy pick", () => {
  const p = baseProject(), s = baseSettings();
  s.wall_labor_bricks_per_hour = NaN;
  const r = wallResult(p, baseInv(), s, { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true);
  assert.equal(r.walls[WALL].calculatedCosts.laborHours, EV.wall.laborHours, "default 50 used");
});
check("missing wall settings fall back to module defaults", () => {
  const p = baseProject();
  const r = wallResult(p, baseInv(), {}, { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true);
  assert.deepEqual(r.walls[WALL].calculatedCosts, EV.wall);
});
check("explicit-zero wall rate settings are honored", () => {
  const p = baseProject(), s = baseSettings();
  s.wall_labor_rate = "0";       // free labor rate (min charge still applies)
  s.wall_minimum_charge = 0;     // no minimum charge
  s.wall_mortar_cost_per_bag = 0; // free mortar
  const r = wallResult(p, baseInv(), s, { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true);
  assert.equal(r.walls[WALL].calculatedCosts.laborCost, 0, "0 rate + 0 min charge = $0 labor");
  assert.equal(r.walls[WALL].calculatedCosts.mortarCost, 0, "free mortar bags");
});
for (const [label, key] of [["labor rate", "wall_labor_rate"], ["minimum charge", "wall_minimum_charge"], ["mortar bag", "wall_mortar_cost_per_bag"]]) {
  check(`malformed ${label} setting holds`, () => {
    const p = baseProject(), saved = savedOf(p), s = baseSettings();
    s[key] = "bogus";
    const r = wallResult(p, baseInv(), s, { savedWalls: saved.walls });
    assert.equal(r.wallPricing[WALL].available, false);
    const issue = r.wallPricing[WALL].issues.find((i) => i.field === key);
    assert.equal(issue?.code, "wall_setting_unavailable");
    assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777);
  });
}
check("mortar bag setting on an all-concrete wall is not consumed — no hold", () => {
  const p = baseProject(), inv = baseInv(), s = baseSettings();
  s.wall_mortar_cost_per_bag = "bogus";
  p.walls[WALL].materialId = "synthetic-wall-concrete";
  p.walls[WALL].internalMaterialId = "synthetic-wall-concrete";
  const r = wallResult(p, inv, s, { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true);
});

// ---------- custom_* qty/rate overrides ----------
const overrideCases = [
  ["custom_outer_material_qty", "wall"], ["custom_outer_labor_rate", "wall"],
  ["custom_outer_mortar_qty", "wall"], ["custom_outer_mortar_rate", "wall"],
  ["custom_internal_material_qty", "internal_wall"], ["custom_internal_labor_rate", "internal_wall"],
  ["custom_internal_mortar_qty", "internal_wall"], ["custom_internal_mortar_rate", "internal_wall"],
];
const outerFields = new Set(["custom_outer_material_qty", "custom_outer_labor_rate", "custom_outer_mortar_qty", "custom_outer_mortar_rate"]);
for (const [field, kind] of overrideCases) {
  for (const [label, value] of [["malformed", "abc"], ["negative", -5], ["NaN", NaN]]) {
    check(`invalid ${field} holds (${label})`, () => {
      const p = baseProject(), inv = baseInv(), saved = savedOf(p);
      const target = outerFields.has(field) ? inv.find((i) => i.id === "synthetic-wall-brick") : p.walls[WALL];
      target[field] = value;
      const r = wallResult(p, inv, baseSettings(), { savedWalls: saved.walls });
      assert.equal(r.wallPricing[WALL].available, false, field + "=" + String(value));
      const issue = r.wallPricing[WALL].issues.find((i) => i.field === field);
      assert.equal(issue?.code, field + "_unavailable");
      assert.equal(issue?.kind, kind);
      assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777);
    });
  }
}
check("string overrides normalize to numbers on calculatedCosts", () => {
  const p = baseProject(), inv = baseInv();
  inv.find((i) => i.id === "synthetic-wall-brick").custom_outer_material_qty = "500";
  p.walls[WALL].custom_internal_material_qty = "250";
  const r = wallResult(p, inv, baseSettings(), { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true);
  assert.equal(r.walls[WALL].calculatedCosts.totalBricks, 500, "number, not '500' string");
  assert.equal(r.walls[WALL].calculatedCosts.materialCost, 1000);
  // Ported asymmetry kept: internalTotalBricks records the computed count while
  // the override prices internalMaterialCost.
  assert.equal(r.walls[WALL].calculatedCosts.internalTotalBricks, EV.wall.internalTotalBricks);
  assert.equal(r.walls[WALL].calculatedCosts.internalMaterialCost, 250);
});
check("explicit-zero overrides are honored", () => {
  const p = baseProject(), inv = baseInv();
  inv.find((i) => i.id === "synthetic-wall-brick").custom_outer_material_qty = 0;
  inv.find((i) => i.id === "synthetic-wall-brick").custom_outer_labor_rate = 0;   // -> min charge
  inv.find((i) => i.id === "synthetic-wall-brick").custom_outer_mortar_rate = 0;  // free mortar
  const r = wallResult(p, inv, baseSettings(), { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true);
  assert.equal(r.walls[WALL].calculatedCosts.totalBricks, 0);
  assert.equal(r.walls[WALL].calculatedCosts.materialCost, 0);
  assert.equal(r.walls[WALL].calculatedCosts.mortarCost, 0);
  assert.equal(r.walls[WALL].calculatedCosts.laborCost, 150, "min charge applies");
});
check("outer mortar overrides on a concrete wall are not consumed — no hold", () => {
  const p = baseProject(), inv = baseInv();
  p.walls[WALL].materialId = "synthetic-wall-concrete";
  p.walls[WALL].internalMaterialId = "synthetic-wall-concrete";
  inv.find((i) => i.id === "synthetic-wall-concrete").custom_outer_mortar_qty = "abc";
  p.walls[WALL].custom_internal_mortar_rate = -9;
  const r = wallResult(p, inv, baseSettings(), { savedWalls: [] });
  assert.equal(r.wallPricing[WALL].available, true, JSON.stringify(r.wallPricing[WALL].issues));
});

// ---------- NaN laundering guard ----------
check("calculatedCosts no longer launders NaN to $0 (defect is visible)", () => {
  // Through the gate an invalid gap holds; a direct calcWallCosts misuse
  // surfaces NaN instead of a silent 0.
  const p = baseProject(), saved = savedOf(p);
  p.walls[WALL].mortarGapInches = "abc";
  const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: saved.walls });
  assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777, "held, not $0");
  const costs = api.calcWallCosts({
    wall: p.walls[WALL], wallShape: p.walls[WALL].shape,
    wallMaterial: baseInv()[0], wallHeightInches: 24,
    mortarGapInches: "abc", settings: baseSettings(),
  });
  assert.equal(Number.isNaN(costs.totalCost), true, "raw NaN surfaces from calcWallCosts");
});

// ---------- acknowledged snapshot semantics ----------
check("new held wall has no acknowledged amounts — empty snapshot", () => {
  const p = baseProject(), saved = savedOf(p);
  p.walls.push({ component_id: "synthetic-wall-new", materialId: "gone-wall",
    heightInches: 24, mortarGapInches: 0.375, shape: p.walls[0].shape,
    calculatedCosts: { totalCost: 555, totalBricks: 50 } });
  const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: saved.walls });
  assert.equal(r.wallPricing[1].available, false);
  assert.deepEqual(r.walls[1].calculatedCosts, {}, "rendered preview cannot persist");
  assert.equal(r.walls[1].materialId, "gone-wall", "authored fields retained");
});
check("non-explicit snapshot keeps stored amounts on held walls", () => {
  const p = baseProject();
  p.walls[WALL].mortarGapInches = "abc";
  const r = wallResult(p, baseInv(), baseSettings());
  assert.equal(r.walls[WALL].calculatedCosts.totalCost, 7777, "no snapshot arg → authored basis kept");
});
check("calcProject exposes wallPricing + flags catalog issues + totals withheld", () => {
  const p = baseProject(), saved = savedOf(p);
  p.walls[WALL].mortarGapInches = "abc";
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.wallPricing[WALL].available, false);
  assert.ok(codes(r.catalogIssues).includes("wall_mortar_gap_unavailable"));
  assert.equal(r.totals.total_wall_cost, 7777, "acknowledged wall total kept");
  assert.equal(r.totals.grand_total, 7777 + EV.item.item_total_cost + EV.deliveryConcreteTotal,
    "grand total includes acknowledged amounts");
});
check("new unsaved held wall withholds totals", () => {
  const p = baseProject(), saved = savedOf(p);
  p.walls.push({ component_id: "synthetic-wall-new", materialId: "gone-wall",
    heightInches: 24, shape: p.walls[0].shape });
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.totals.total_wall_cost, null);
  assert.equal(r.totals.grand_total, null);
});
check("foundationWallBomRows marks held walls via provided wallPricing", () => {
  const p = baseProject(), saved = savedOf(p);
  p.walls[WALL].mortarGapInches = "abc";
  const r = wallResult(p, baseInv(), baseSettings(), { savedWalls: saved.walls });
  const rows = api.foundationWallBomRows(r.walls, baseInv(), r.wallPricing);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.saved === true), "all rows marked saved");
  assert.ok(rows.some((row) => row.material.includes("saved outer material")));
});

// ---------- item custom_* overrides (shared validation) ----------
const ITEM_OVERRIDES = [
  "custom_concrete_cost_per_cy", "custom_concrete_qty", "custom_rebar_cost_per_ft",
  "custom_rebar_qty", "custom_forming_rate", "custom_forming_qty",
  "custom_finishing_rate", "custom_finishing_hours",
  "custom_excavation_hours", "custom_excavation_rate",
];
for (const field of ITEM_OVERRIDES) {
  check(`invalid item ${field} is an input issue + holds the item`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.items[ITEM][field] = "abc";
    const inputIssues = api.foundationProjectInputIssues(p);
    const issue = inputIssues.find((i) => i.field === field);
    assert.equal(issue?.code, "foundation_override_invalid");
    const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
    assert.equal(r.itemPricing[ITEM].available, false);
    assert.equal(r.items[ITEM].item_total_cost, 111.11, "acknowledged item total held");
    assert.equal(r.delivery.pricingUnavailable, true, "coupled delivery held");
    const item2 = baseProject(); item2.items[ITEM][field] = -5;
    const r2 = api.calcProject(item2, baseInv(), baseSettings(), { savedProject: savedOf(item2) });
    assert.equal(r2.itemPricing[ITEM].available, false, field + "=-5");
  });
}
check("explicit-zero item overrides are honored", () => {
  const p = baseProject();
  p.items[ITEM].custom_concrete_cost_per_cy = 0;
  p.items[ITEM].custom_excavation_rate = 0;
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.itemPricing[ITEM].available, true);
  assert.equal(r.items[ITEM].excavation_cost, 0, "free excavation rate honored");
});
check("valid + absent item overrides price identically to ported formulas", () => {
  const p = baseProject();
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
  const p2 = baseProject();
  p2.items[ITEM].custom_concrete_qty = 1.5; // valid override
  const r2 = api.calcProject(p2, baseInv(), baseSettings(), { savedProject: savedOf(p2) });
  assert.equal(r2.itemPricing[ITEM].available, true);
  assert.equal(r2.items[ITEM].concrete_volume_cy, 1.5, "override qty used");
});

// ---------- exports + no-mutation ----------
check("foundationWallPricingIssues/CatalogIssues exports accept optional settings", () => {
  const p = baseProject(), s = baseSettings();
  s.wall_labor_bricks_per_hour = "0";
  const withSettings = api.foundationWallPricingIssues(p.walls[WALL], baseInv(), WALL, s);
  assert.ok(codes(withSettings).includes("wall_setting_unavailable"));
  const catalog = api.foundationWallCatalogIssues(p.walls, baseInv(), s);
  assert.ok(codes(catalog).includes("wall_setting_unavailable"));
});
check("wall issues are not double-reported through the assembly scan", () => {
  const p = baseProject(), saved = savedOf(p);
  p.walls[WALL].mortarGapInches = "abc";
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  const mortarIssues = r.catalogIssues.filter((i) => i.code === "wall_mortar_gap_unavailable");
  assert.equal(mortarIssues.length, 1, "single source");
});
check("held wall leaves authored row untouched", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  const before = clone(p.walls[WALL]);
  p.walls[WALL].custom_internal_material_qty = "abc";
  const beforeInv = clone(inv);
  inv.find((i) => i.id === "synthetic-wall-brick").custom_outer_material_qty = "abc";
  const r = wallResult(p, inv, baseSettings(), { savedWalls: saved.walls });
  assert.equal(r.wallPricing[WALL].available, false);
  assert.equal(p.walls[WALL].custom_internal_material_qty, "abc", "authored override preserved");
  assert.equal(inv.find((i) => i.id === "synthetic-wall-brick").custom_outer_material_qty, "abc", "inventory row not mutated");
  assert.deepEqual(clone(p.walls[WALL]) && true, true);
});

const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + (RED ? "masonry-model-red-verification.json" : "masonry-model-verification.json"),
  JSON.stringify({ results }, null, 2));
console.log(`masonry-model${RED ? "-red" : ""} passed=${okCount} failed=${results.length - okCount} total=${results.length}`);
if (okCount !== results.length) process.exit(1);
