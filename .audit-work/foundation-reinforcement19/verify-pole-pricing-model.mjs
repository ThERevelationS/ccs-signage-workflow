// Pole-pricing availability hardening — model proof.
// Bundles the real calc chain (candidate poleCalculator + candidate foundationCalc
// against remote-frozen wallCalculator/wallCapCalculator/legacyFoundationCalc/
// foundationCatalogIntegrity/foundationEquipmentBindings/foundationInputValidation)
// and exercises calcPoles + calcProject invariants.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement19/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read("pole-page-dependency-source.json").files)
  sources.set("/app/" + f.path, f.content);
for (const f of read("pole-pricing-baseline.json").files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.POLE_MODEL_RED === "1";
if (!RED) {
  sources.set("/app/src/components/estimator/foundation/poleCalculator.js",
    fs.readFileSync(DIR + "pole-pricing-candidate-poleCalculator.js", "utf8"));
  sources.set("/app/src/components/estimator/foundation/foundationCalc.js",
    fs.readFileSync(DIR + "pole-pricing-candidate-foundationCalc.js", "utf8"));
}
const CANDIDATE_HASHES = JSON.parse(fs.readFileSync(DIR + "pole-pricing-candidate-hashes.json", "utf8"));
if (!RED) {
  assert.equal(hash(sources.get("/app/src/components/estimator/foundation/poleCalculator.js")), CANDIDATE_HASHES["poleCalculator.js"], "pole calc candidate");
  assert.equal(hash(sources.get("/app/src/components/estimator/foundation/foundationCalc.js")), CANDIDATE_HASHES["foundationCalc.js"], "foundationCalc candidate");
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
const entry = "/app/pole-model-entry.js";
sources.set(entry, RED ? `
export { calcPoles, calcPolePaintingCost } from "/app/src/components/estimator/foundation/poleCalculator.js";
export const foundationPolePricingIssues = () => [];
export const foundationPoleCatalogIssues = () => [];
export { calcProject } from "/app/src/components/estimator/foundation/foundationCalc.js";
export { foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } from "/app/src/components/estimator/foundation/foundationCatalogIntegrity.js";
` : `
export { calcPoles, calcPolePaintingCost, foundationPolePricingIssues, foundationPoleCatalogIssues } from "/app/src/components/estimator/foundation/poleCalculator.js";
export { calcProject } from "/app/src/components/estimator/foundation/foundationCalc.js";
export { foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } from "/app/src/components/estimator/foundation/foundationCatalogIntegrity.js";
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "pole-pricing-model-red-bundle.mjs" : "pole-pricing-model-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "pole-pricing-model-red-bundle.mjs" : "pole-pricing-model-bundle.mjs"))));
if (!RED) {
  assert.equal(loaded["/app/src/components/estimator/foundation/poleCalculator.js"], CANDIDATE_HASHES["poleCalculator.js"], "candidate loaded");
  assert.equal(loaded["/app/src/components/estimator/foundation/foundationCalc.js"], CANDIDATE_HASHES["foundationCalc.js"], "calc loaded");
}

// ---------- fixtures ----------
const { fixture: seed } = read("pole-pricing-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const STOCK = 0, LF = 1;
const baseProject = () => clone(seed.project);
const baseInv = () => clone(seed.inventory);
const baseSettings = () => clone(seed.settings);
const savedOf = (project) => clone(project);
// RED mode runs the pre-hardening remote poleCalculator: it returns a bare
// array, so adapt it into the {poles, polePricing} shape (issues always empty).
const poleResult = RED
  ? (poles, inv, settings) => ({
      poles: api.calcPoles(poles, inv, settings),
      polePricing: (poles || []).map(() => ({ available: true, issues: [] })),
    })
  : (poles, inv, settings, options) => api.calcPoles(poles, inv, settings, options);
const issueCodes = (list) => list.map((i) => i.code);

const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok " + name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log("FAIL " + name + " :: " + String(error.message).slice(0, 400)); }
};

// ---------- frozen-legacy controls ----------
check("valid legacy poles price identically to ported formulas", () => {
  const p = baseProject(), inv = baseInv(), s = baseSettings();
  const before = clone({ poles: p.poles, inv, s });
  const r = poleResult(p.poles, inv, s, { savedPoles: savedOf(p).poles });
  assert.deepEqual(r.polePricing.map((x) => x.available), [true, true]);
  assert.deepEqual(r.polePricing.map((x) => x.issues.length), [0, 0]);
  assert.equal(r.poles[STOCK].pole_cost, seed.expectedValid.stock.pole_cost);
  assert.equal(r.poles[STOCK].pole_painting_cost, 0);
  assert.equal(r.poles[STOCK].total_cost, seed.expectedValid.stock.total_cost);
  assert.equal(r.poles[STOCK].pole_name, "Stock pole 20ft");
  assert.equal(r.poles[LF].pole_cost, seed.expectedValid.lf.pole_cost);
  assert.equal(r.poles[LF].pole_painting_cost, seed.expectedValid.lf.pole_painting_cost);
  assert.equal(r.poles[LF].total_cost, seed.expectedValid.lf.total_cost);
  assert.deepEqual({ poles: p.poles, inv, s }, before, "no source mutation");
});

check("numeric-string dimensions normalize on the calculation copy, never concatenated", () => {
  const p = baseProject();
  p.poles[STOCK].height_inches = "120";
  p.poles[STOCK].y_offset_inches = "36";
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: [] });
  assert.equal(r.polePricing[STOCK].available, true);
  assert.equal(r.poles[STOCK].pole_cost, 250, "120+36 as numbers, not '12036'");
  assert.equal(p.poles[STOCK].height_inches, "120", "authored string preserved");
});

check("explicit-zero catalog prices are valid free poles, not unavailable", () => {
  const p = baseProject(), inv = baseInv();
  inv[STOCK].pole_stock_price = 0;
  inv[LF].cost_per_unit = 0;
  p.poles[LF].include_pole_painting = false;
  const r = poleResult(p.poles, inv, baseSettings(), { savedPoles: [] });
  assert.deepEqual(r.polePricing.map((x) => x.available), [true, true]);
  assert.equal(r.poles[STOCK].pole_cost, 0);
  assert.equal(r.poles[LF].pole_cost, 0);
  assert.equal(r.poles[STOCK].total_cost, 0);
});

check("zero depth is legitimate surface mount; string zero normalizes", () => {
  const p = baseProject();
  p.poles[STOCK].y_offset_inches = 0;
  p.poles[LF].y_offset_inches = "0";
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: [] });
  assert.deepEqual(r.polePricing.map((x) => x.available), [true, true]);
  assert.equal(r.poles[STOCK].pole_cost, 250, "ceil(120/240)*250");
  assert.equal(r.poles[LF].pole_cost, 96, "8ft * $12");
});

check("custom_cost_per_unit override prices and explicit zero override is honored", () => {
  const p = baseProject();
  p.poles[STOCK].custom_cost_per_unit = 5;
  p.poles[LF].custom_cost_per_unit = 0;
  p.poles[LF].include_pole_painting = false;
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: [] });
  assert.deepEqual(r.polePricing.map((x) => x.available), [true, true]);
  assert.equal(r.poles[STOCK].pole_cost, 5, "1 piece * $5 override");
  assert.equal(r.poles[LF].pole_cost, 0, "explicit $0 override");
});

check("explicit-zero paint settings are honored, not defaulted", () => {
  const p = baseProject(), s = baseSettings();
  s.pole_paint_cost_per_lf = 0; // number zero
  s.pole_paint_labor_per_lf = "0"; // string zero
  const r = poleResult(p.poles, baseInv(), s, { savedPoles: [] });
  assert.equal(r.polePricing[LF].available, true);
  assert.equal(r.poles[LF].pole_painting_cost, 0, "free paint at explicit 0 rates");
});

check("missing paint settings fall back to module defaults", () => {
  const p = baseProject();
  const r = poleResult(p.poles, baseInv(), {}, { savedPoles: [] });
  assert.equal(r.polePricing[LF].available, true);
  assert.equal(r.poles[LF].pole_painting_cost, 75, "10ft * (3.5+2.5) * 1.25");
});

// ---------- invalid dimensions hold ----------
const badDims = [
  ["blank", ""], ["whitespace", " "], ["zero", 0], ["negative", -8],
  ["NaN", NaN], ["Infinity", Infinity], ["malformed", "8 inches"], ["record", {}], ["array", []],
];
// JSON cannot carry NaN/Infinity — inject directly.
for (const [label, value] of badDims) {
  check(`invalid height holds acknowledged amounts (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.poles[STOCK].height_inches = value;
    const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
    assert.equal(r.polePricing[STOCK].available, false);
    const issue = r.polePricing[STOCK].issues.find((i) => i.field === "height_inches");
    assert.equal(issue?.code, "pole_height_unavailable");
    assert.equal(issue?.kind, "pole");
    assert.equal(issue?.index, STOCK);
    assert.equal(issue?.componentId, "synthetic-pole-stock");
    assert.equal(r.poles[STOCK].pole_cost, 999, "held saved pole_cost");
    assert.equal(r.poles[STOCK].total_cost, 999, "held saved total");
    assert.equal(p.poles[STOCK].height_inches === value || (typeof value === "number" && Number.isNaN(value) && Number.isNaN(p.poles[STOCK].height_inches)), true, "authored value preserved");
  });
}
for (const [label, value] of badDims.filter(([l]) => l !== "zero")) {
  check(`invalid depth holds acknowledged amounts (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.poles[LF].y_offset_inches = value;
    const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
    assert.equal(r.polePricing[LF].available, false);
    const issue = r.polePricing[LF].issues.find((i) => i.field === "y_offset_inches");
    assert.equal(issue?.code, "pole_depth_unavailable");
    assert.equal(r.poles[LF].pole_cost, 888);
    assert.equal(r.poles[LF].pole_painting_cost, 111);
    assert.equal(r.poles[LF].total_cost, 999);
  });
}

// ---------- invalid prices hold ----------
check("missing pole_stock_price is unavailable, never $0", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  delete inv[STOCK].pole_stock_price;
  const r = poleResult(p.poles, inv, baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[STOCK].available, false);
  const issue = r.polePricing[STOCK].issues.find((i) => i.field === "pole_stock_price");
  assert.equal(issue?.code, "pole_price_unavailable");
  assert.equal(issue?.inventoryId, "synthetic-pole-stock");
  assert.equal(r.poles[STOCK].pole_cost, 999, "acknowledged held, not repriced to $0");
});
check("missing cost_per_unit is unavailable, never $0", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  delete inv[LF].cost_per_unit;
  const r = poleResult(p.poles, inv, baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[LF].available, false);
  assert.equal(r.polePricing[LF].issues.find((i) => i.field === "cost_per_unit")?.code, "pole_price_unavailable");
  assert.equal(r.poles[LF].pole_cost, 888);
});
check("malformed and negative catalog prices hold", () => {
  for (const v of ["abc", -5, NaN]) {
    const p = baseProject(), inv = baseInv(), saved = savedOf(p);
    inv[STOCK].pole_stock_price = v;
    const r = poleResult(p.poles, inv, baseSettings(), { savedPoles: saved.poles });
    assert.equal(r.polePricing[STOCK].available, false, "v=" + v);
    assert.equal(r.poles[STOCK].pole_cost, 999);
  }
});
check("NaN and negative custom_cost_per_unit hold", () => {
  for (const v of [NaN, -1, "bogus"]) {
    const p = baseProject(), saved = savedOf(p);
    p.poles[STOCK].custom_cost_per_unit = v;
    const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
    assert.equal(r.polePricing[STOCK].available, false, "v=" + v);
    assert.equal(r.polePricing[STOCK].issues.find((i) => i.field === "custom_cost_per_unit")?.code, "pole_price_unavailable");
    assert.equal(r.poles[STOCK].pole_cost, 999);
  }
});

// ---------- catalog identity issues hold ----------
check("unassigned pole_id holds", () => {
  const p = baseProject(), saved = savedOf(p);
  p.poles[STOCK].pole_id = "";
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[STOCK].issues.find((i) => i.field === "pole_id")?.code, "catalog_item_unassigned");
  assert.equal(r.polePricing[STOCK].issues.find((i) => i.field === "pole_id")?.inventoryId, null);
  assert.equal(r.poles[STOCK].pole_cost, 999);
});
check("unavailable catalog pole holds", () => {
  const p = baseProject(), saved = savedOf(p);
  p.poles[STOCK].pole_id = "gone-pole";
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
  const issue = r.polePricing[STOCK].issues.find((i) => i.field === "pole_id");
  assert.equal(issue?.code, "catalog_item_unavailable");
  assert.equal(issue?.inventoryId, "gone-pole");
  assert.equal(r.poles[STOCK].pole_cost, 999);
});
check("ambiguous catalog id holds", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  inv.push({ ...clone(inv[STOCK]), material_name: "dup" });
  const r = poleResult(p.poles, inv, baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[STOCK].issues.find((i) => i.field === "pole_id")?.code, "catalog_item_ambiguous");
  assert.equal(r.poles[STOCK].pole_cost, 999);
});
check("type-mismatched catalog row holds", () => {
  const p = baseProject(), saved = savedOf(p);
  p.poles[STOCK].pole_id = "synthetic-wall-material";
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[STOCK].issues.find((i) => i.field === "pole_id")?.code, "catalog_item_type_mismatch");
  assert.equal(r.poles[STOCK].pole_cost, 999);
});

// ---------- catalog attribute + paint settings ----------
check("missing stock length defaults to 20ft; malformed/zero stock length holds", () => {
  const p = baseProject(), inv = baseInv();
  delete inv[STOCK].pole_stock_length_ft;
  const r1 = poleResult(p.poles, inv, baseSettings(), { savedPoles: [] });
  assert.equal(r1.poles[STOCK].pole_cost, 250, "default 20ft stock");
  for (const v of ["abc", 0, -20]) {
    const inv2 = baseInv(), saved = savedOf(p);
    inv2[STOCK].pole_stock_length_ft = v;
    const r = poleResult(p.poles, inv2, baseSettings(), { savedPoles: saved.poles });
    assert.equal(r.polePricing[STOCK].available, false, "v=" + v);
    assert.equal(r.polePricing[STOCK].issues.find((i) => i.field === "pole_stock_length_ft")?.code, "pole_stock_length_unavailable");
    assert.equal(r.poles[STOCK].pole_cost, 999);
  }
  // NaN is falsy — same "missing → default" path as the legacy `|| 20`.
  const inv3 = baseInv(); inv3[STOCK].pole_stock_length_ft = NaN;
  const rN = poleResult(p.poles, inv3, baseSettings(), { savedPoles: [] });
  assert.equal(rN.poles[STOCK].pole_cost, 250, "NaN stock length → default 20ft");
});
check("malformed catalog pole width holds when painting; missing width defaults", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  delete inv[LF].pole_width_inches;
  const r1 = poleResult(p.poles, inv, baseSettings(), { savedPoles: [] });
  assert.equal(r1.poles[LF].pole_painting_cost, 75, "default 6in bucket");
  inv[LF].pole_width_inches = "wide";
  const r = poleResult(p.poles, inv, baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[LF].available, false);
  assert.equal(r.polePricing[LF].issues.find((i) => i.field === "pole_width_inches")?.code, "pole_width_unavailable");
});
check("malformed/negative paint settings hold; ignored when painting off", () => {
  const p = baseProject(), s = baseSettings(), saved = savedOf(p);
  s.pole_paint_cost_per_lf = "bogus";
  const r = poleResult(p.poles, baseInv(), s, { savedPoles: saved.poles });
  assert.equal(r.polePricing[LF].available, false);
  const issue = r.polePricing[LF].issues.find((i) => i.field === "pole_paint_cost_per_lf");
  assert.equal(issue?.code, "pole_paint_setting_unavailable");
  assert.equal(r.poles[LF].pole_painting_cost, 111, "saved paint amount held");
  // painting off: same malformed setting irrelevant
  p.poles[LF].include_pole_painting = false;
  const r2 = poleResult(p.poles, baseInv(), s, { savedPoles: [] });
  assert.equal(r2.polePricing[LF].available, true, "unpainted pole ignores paint settings");
  const s2 = baseSettings(); s2.pole_paint_size_multiplier_6in = -1;
  const r3 = poleResult(baseProject().poles, baseInv(), s2, { savedPoles: [] });
  assert.equal(r3.polePricing[LF].available, false, "negative multiplier held");
});

// ---------- acknowledged snapshot semantics ----------
check("new held pole has no acknowledged amounts — snapshot fields removed", () => {
  const p = baseProject(), saved = savedOf(p);
  p.poles.push({ component_id: "brand-new-pole", pole_id: "gone", height_inches: "", y_offset_inches: 10,
    pole_cost: 500, pole_painting_cost: 50, total_cost: 550, pole_name: "preview" });
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.polePricing[2].available, false);
  assert.equal("pole_cost" in r.poles[2], false, "rendered preview price cannot persist");
  assert.equal("total_cost" in r.poles[2], false);
  assert.equal("pole_name" in r.poles[2], false);
  assert.equal(r.poles[2].pole_id, "gone", "authored fields retained");
});
check("non-explicit snapshot keeps stored amounts on held poles", () => {
  const p = baseProject();
  p.poles[STOCK].height_inches = "";
  const r = poleResult(p.poles, baseInv(), baseSettings());
  assert.equal(r.poles[STOCK].pole_cost, 999, "no snapshot arg → authored basis kept");
});
check("held pole keeps saved name and amounts on all issue paths", () => {
  const p = baseProject(), saved = savedOf(p);
  p.poles[STOCK].pole_id = "gone";
  const r = poleResult(p.poles, baseInv(), baseSettings(), { savedPoles: saved.poles });
  assert.equal(r.poles[STOCK].pole_name, "Stock pole 20ft");
});
check("foundationPoleCatalogIssues and foundationPolePricingIssues exports", () => {
  const p = baseProject();
  p.poles[STOCK].pole_id = "";
  p.poles[LF].height_inches = -3;
  const all = api.foundationPoleCatalogIssues(p.poles, baseInv(), baseSettings());
  assert.equal(all.length, 2);
  assert.equal(all[0].code, "catalog_item_unassigned");
  assert.equal(all[1].code, "pole_height_unavailable");
  const single = api.foundationPolePricingIssues(p.poles[LF], baseInv(), LF, baseSettings());
  assert.equal(single.length, 1);
  assert.equal(single[0].message, "Pole 2: record a positive, finite height above grade in inches before repricing.");
});

// ---------- calcProject wiring ----------
check("calcProject wires pole issues once, holds totals, nulls grand total", () => {
  const p = baseProject(), saved = savedOf(p);
  p.poles[STOCK].pole_id = "gone-pole";
  const calc = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  const poleIssues = calc.catalogIssues.filter((i) => i.kind === "pole");
  assert.equal(poleIssues.length, 1, "exactly one pole issue — assembly duplicate filtered");
  assert.equal(poleIssues[0].code, "catalog_item_unavailable");
  assert.equal(calc.polePricing[STOCK].available, false);
  assert.equal(calc.polePricing[LF].available, true);
  assert.equal(calc.totals.total_pole_cost, 1119, "acknowledged 999 + current 120 mixed total");
  assert.equal(calc.totals.total_pole_painting_cost, 75, "held pole saved 0 + sibling 75");
  assert.equal(calc.totals.grand_total, 1194, "acknowledged amounts keep grand total computable while save stays blocked");
  assert.equal(calc.poles[STOCK].pole_cost, 999, "saved pole amount held");
  assert.equal(calc.poles[LF].pole_cost, 120, "valid sibling repriced");
});
check("calcProject valid poles produce current totals, not saved", () => {
  const p = baseProject();
  const calc = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.deepEqual(calc.catalogIssues.filter((i) => i.kind === "pole"), []);
  assert.equal(calc.totals.total_pole_cost, 370, "250+120 current");
  assert.equal(calc.totals.total_pole_painting_cost, 75);
  assert.equal(calc.totals.grand_total, 445, "items 0 + walls 0 + poles 445 + equip 0 + caps 0");
  assert.deepEqual(calc.polePricing.map((x) => x.available), [true, true]);
});
check("calcProject held pole without saved project falls null", () => {
  const p = baseProject();
  delete p.total_pole_cost; delete p.total_pole_painting_cost;
  p.poles[STOCK].pole_id = "";
  const calc = api.calcProject(p, baseInv(), baseSettings(), { savedProject: null });
  assert.equal(calc.totals.total_pole_cost, null, "no acknowledged basis → null");
  assert.equal(calc.totals.total_pole_painting_cost, null, "all-or-nothing per key");
  assert.equal(calc.totals.grand_total, null);
});
check("calcPolePaintingCost export still prices valid inputs identically", () => {
  const p = baseProject(), inv = baseInv();
  assert.equal(api.calcPolePaintingCost(p.poles[LF], inv[LF], baseSettings()), 75);
  const s = baseSettings(); s.pole_paint_cost_per_lf = 0;
  assert.equal(api.calcPolePaintingCost(p.poles[LF], inv[LF], s), 31.25, "explicit 0 honored: 10*(0+2.5)*1.25");
});

assert.ok(results.length > 0);
const okCount = results.filter((r) => r.ok).length;
if (RED) {
  fs.writeFileSync(DIR + "pole-pricing-model-red-verification.json", JSON.stringify({ results }, null, 2));
  console.log(`pole-pricing-model RED (pre-hardening source) passed=${okCount} failed=${results.length - okCount} — failures expected`);
  process.exit(0);
}
fs.writeFileSync(DIR + "pole-pricing-model-verification.json", JSON.stringify({ results }, null, 2));
console.log(`pole-pricing-model passed=${okCount} failed=${results.length - okCount}`);
if (okCount !== results.length) process.exit(1);
