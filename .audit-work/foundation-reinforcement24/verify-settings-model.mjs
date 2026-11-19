// Settings+catalog availability hardening — model proof.
// Bundles the real calc chain (candidate legacyFoundationCalc +
// foundationInputValidation + foundationCalc + foundationEquipmentBindings
// against remote-frozen wallCalculator/poleCalculator/wallCapCalculator/
// foundationCatalogIntegrity/landscapeMaterials) and exercises calcItemCost,
// calcItem, calcProject, foundationItemInputIssues, and equipment bindings.
// SETTINGS_MODEL_RED=1 runs the pre-hardening remote sources — the hardening
// checks must fail there (they encode the hardened contract) while plain
// valid inputs still work (silent laundering).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement24/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read("settings-catalog-baseline.json").files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.SETTINGS_MODEL_RED === "1";
const F = "/app/src/components/estimator/foundation/";
const CALC_CANDIDATES = ["legacyFoundationCalc.js", "foundationInputValidation.js",
  "foundationCalc.js", "foundationEquipmentBindings.js"];
if (!RED) {
  for (const name of CALC_CANDIDATES)
    sources.set(F + name, fs.readFileSync(DIR + "settings-catalog-candidate-" + name, "utf8"));
}
const CANDIDATE_HASHES = JSON.parse(fs.readFileSync(DIR + "settings-catalog-candidate-hashes.json", "utf8"));
if (!RED) {
  for (const name of CALC_CANDIDATES)
    assert.equal(hash(sources.get(F + name)), CANDIDATE_HASHES[name], "candidate " + name);
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
const entry = "/app/settings-model-entry.js";
sources.set(entry, `
export { calcProject, calcItem, calcEquipmentPricing, captureConcreteDeliverySnapshot, money } from "${F}foundationCalc.js";
export { calcConcreteDelivery, calcItemCost, getConcreteMixes, getConcreteAdmixtures,
  getSmallLoadFee, getFuelSurcharge, normalizeConcreteSupplier${RED ? "" : ", foundationItemSettingIssues"} } from "${F}legacyFoundationCalc.js";
export { foundationItemInputIssues, foundationProjectInputIssues, signageCabinetsInputIssues } from "${F}foundationInputValidation.js";
export { foundationItemCatalogIssues, foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } from "${F}foundationCatalogIntegrity.js";
export { resolveFoundationEquipment } from "${F}foundationEquipmentBindings.js";
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "settings-model-red-bundle.mjs" : "settings-model-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "settings-model-red-bundle.mjs" : "settings-model-bundle.mjs"))));
if (!RED) {
  for (const name of CALC_CANDIDATES)
    assert.equal(loaded[F + name], CANDIDATE_HASHES[name], "candidate loaded " + name);
}

// ---------- fixtures ----------
const { fixture: seed } = read("settings-catalog-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseProject = () => clone(seed.project);
const baseInv = () => clone(seed.inventory);
const baseSettings = () => clone(seed.settings);
const savedOf = (project) => clone(project);
const ITEM = 0;
const codes = (issues) => issues.map((i) => i.code);
const EV = seed.expectedValid;
const SUP = "synthetic-readymix";
const proj = (p, options) => api.calcProject(p, baseInv(), baseSettings(), options ?? { savedProject: savedOf(p) });

const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok " + name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log("FAIL " + name + " :: " + String(error.message).slice(0, 400)); }
};

// ---------- frozen valid-formula parity ----------
check("valid settings produce byte-identical item math; no authored mutation", () => {
  const p = baseProject(), inv = baseInv(), s = baseSettings();
  const before = clone({ project: p, inv, settings: s });
  const legacy = api.calcItemCost(p.items[ITEM], inv, s);
  assert.equal(legacy.total, EV.item.item_total_cost);
  const r = proj(p);
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.inputIssues.length, 0, JSON.stringify(r.inputIssues));
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
  assert.equal(r.totals.grand_total, EV.grandTotal);
  assert.deepEqual({ project: p, inv, settings: s }, before, "no source mutation");
});

check("numeric-string settings stay valid on the calculation copy only", () => {
  const p = baseProject(), s = baseSettings();
  assert.equal(s.foundation_main_labor_rate, "60");
  const r = api.calcProject(p, baseInv(), s, { savedProject: savedOf(p) });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
  assert.equal(s.foundation_main_labor_rate, "60", "authored string preserved");
});

// ---------- explicit-zero semantics (preserved) ----------
check("explicit-0 settings are honored — the ported `|| def` overrode them", () => {
  const p = baseProject();
  const settings = baseSettings();
  settings.foundation_pouring_cost_per_cy = 0;
  const legacy = api.calcItemCost(p.items[ITEM], baseInv(), settings);
  assert.equal(legacy.pouringCost, 0, "explicit 0 pouring rate kept");
  assert.equal(legacy.total, EV.item.excavation_cost);
  const s2 = baseSettings();
  s2.foundation_hand_dig_time_per_cy = "0";
  const l2 = api.calcItemCost(p.items[ITEM], baseInv(), s2);
  assert.equal(l2.excavationCost, 0);
  const r2 = api.calcProject(p, baseInv(), s2, { savedProject: savedOf(p) });
  assert.equal(r2.catalogIssues.length, 0, JSON.stringify(r2.catalogIssues));
});

check("explicit-0 main labor is free labor when it only multiplies", () => {
  const p = baseProject();
  const s = baseSettings();
  s.foundation_main_labor_rate = 0;
  const item3 = { ...clone(p.items[ITEM]), include_rebar: true };
  const l3 = api.calcItemCost(item3, baseInv(), s);
  assert.equal(l3.rebarCost, 0, "rebar feet remain, labor is free");
  const p3 = baseProject();
  p3.items[ITEM].include_rebar = true;
  p3.items[ITEM].rebar_size = "#4";
  const r = api.calcProject(p3, baseInv(), s, { savedProject: savedOf(p3) });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
});

check("explicit-0 main labor as the finishing-hours divisor is unavailable, not free", () => {
  const p = baseProject();
  p.items[ITEM].include_finishing = true; // finishing back-out divides by main_labor_rate
  const s = baseSettings();
  s.foundation_main_labor_rate = 0;
  const r = api.calcProject(p, baseInv(), s, { savedProject: savedOf(p) });
  const issue = r.catalogIssues.find((i) => i.code === "foundation_setting_unavailable" && i.field === "foundation_main_labor_rate");
  assert.ok(issue, "0 divisor reported: " + JSON.stringify(r.catalogIssues));
  assert.equal(r.itemPricing[ITEM].available, false);
  const withHours = baseProject();
  withHours.items[ITEM].include_finishing = true;
  withHours.items[ITEM].custom_finishing_hours = 2; // hours recorded — rate only multiplies
  const r2 = api.calcProject(withHours, baseInv(), s, { savedProject: savedOf(withHours) });
  assert.equal(r2.catalogIssues.filter((i) => i.code === "foundation_setting_unavailable").length, 0,
    "0 labor rate is a legitimate multiplier when hours are authored: " + JSON.stringify(r2.catalogIssues));
});

// ---------- malformed consumed settings → issue + hold ----------
const settingCase = (mutateSettings, mutateItem) => {
  const p = baseProject(), s = baseSettings(), saved = savedOf(p);
  if (mutateItem) p.items[ITEM] = { ...p.items[ITEM], ...mutateItem };
  mutateSettings(s);
  return api.calcProject(p, baseInv(), s, { savedProject: saved });
};

for (const [label, value] of [["malformed string", "abc"], ["partial numeric", "12abc"],
    ["negative", "-5"], ["record", {}], ["negative number", -5]]) {
  check(`invalid consumed setting holds (${label})`, () => {
    const r = settingCase((s) => { s.foundation_pouring_cost_per_cy = value; });
    const issue = r.catalogIssues.find((i) => i.code === "foundation_setting_unavailable" && i.field === "foundation_pouring_cost_per_cy");
    assert.ok(issue, "issue present for " + JSON.stringify(value) + ": " + JSON.stringify(r.catalogIssues));
    assert.equal(issue.kind, "foundation");
    assert.equal(issue.index, ITEM);
    assert.equal(issue.componentId, "synthetic-item-1");
    assert.equal(r.itemPricing[ITEM].available, false, "item card unavailable");
    assert.equal(r.items[ITEM].item_total_cost, 111.11, "acknowledged item snapshot held");
    assert.equal(r.delivery.pricingUnavailable, true, "delivery gated by the held item");
    assert.equal(r.delivery.concreteTotal, 301.5, "acknowledged delivery snapshot held");
    assert.equal(r.totals.total_concrete_cost, 11.11 + 301.5, "acknowledged item + delivery, not repriced");
    assert.equal(r.totals.grand_total, 111.11 + 301.5, "acknowledged item total + delivery held");
  });
}

check("malformed settings flow through the input-issues scan as the same contract", () => {
  const s = baseSettings();
  s.foundation_equipment_excavation_time_per_cy = "abc";
  const p = baseProject();
  p.items[ITEM].excavation_method = "equipment_excavation";
  const r = api.calcProject(p, baseInv(), s, { savedProject: savedOf(p) });
  assert.ok(r.catalogIssues.some((i) => i.code === "foundation_setting_unavailable" && i.field === "foundation_equipment_excavation_time_per_cy"),
    JSON.stringify(r.catalogIssues));
  assert.equal(r.itemPricing[ITEM].available, false);
});

// ---------- consumption mirror: unconsumed settings are never checked ----------
check("a malformed setting the item does not consume is never checked", () => {
  const r = settingCase((s) => {
    s.foundation_forming_cost_per_sqft = "abc";       // include_forming false
    s.foundation_equipment_excavation_time_per_cy = "abc"; // hand_dig project
    s.foundation_rebar_time_cross_section = "abc";    // include_rebar false
    s.foundation_finishing_cost_per_sqft = "abc";     // include_finishing false
    s.foundation_forming_materials_pillar = "abc";    // spread_foot item
  });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost, "ported defaults untouched — full price stands");
});

check("pillar item consumes the pillar forming multiplier, not the spread-foot one", () => {
  const p = baseProject();
  p.items[ITEM] = { ...p.items[ITEM], foundation_type: "pillar", diameter: 24, include_forming: true,
    selected_forming_id: "synthetic-forming" };
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  const bad = baseSettings();
  bad.foundation_forming_materials_pillar = "abc";
  const r2 = api.calcProject(p, baseInv(), bad, { savedProject: savedOf(p) });
  assert.ok(r2.catalogIssues.some((i) => i.code === "foundation_setting_unavailable" && i.field === "foundation_forming_materials_pillar"),
    JSON.stringify(r2.catalogIssues));
});

check("missing/blank Settings rows keep the ported module default", () => {
  const s = baseSettings();
  delete s.foundation_pouring_cost_per_cy;
  s.foundation_hand_dig_time_per_cy = "";
  const r = api.calcProject(baseProject(), baseInv(), s, { savedProject: savedOf(baseProject()) });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
});

check("custom overrides cover their settings — no false unavailable", () => {
  const p = baseProject();
  p.items[ITEM].custom_excavation_rate = 10;
  p.items[ITEM].custom_excavation_hours = 3;
  const s = baseSettings();
  s.foundation_main_labor_rate = "abc";          // covered by custom rate
  s.foundation_hand_dig_time_per_cy = "abc";     // covered by custom hours
  const r = api.calcProject(p, baseInv(), s, { savedProject: savedOf(p) });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
});

// ---------- F4: explicit-zero custom overrides mean zero ----------
check("explicit-0 custom quantities and hours mean exactly zero", () => {
  const p = baseProject();
  p.items[ITEM].custom_concrete_qty = 0;
  p.items[ITEM].custom_excavation_hours = 0;
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.inputIssues.length, 0, JSON.stringify(r.inputIssues));
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.items[ITEM].concrete_volume_cy, 0, "0 concrete qty honored — not the measured volume");
  assert.equal(r.items[ITEM].excavation_hours, 0, "0 excavation hours honored");
  assert.equal(r.items[ITEM].excavation_cost, 0);
});

check("explicit-0 custom rates mean free labor, not fallback", () => {
  const p = baseProject();
  p.items[ITEM].custom_excavation_rate = 0;
  p.items[ITEM].custom_forming_rate = 0;
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.items[ITEM].excavation_cost, 0, "0 excavation rate honored");
});

// ---------- F5: excavation_method enum ----------
check("item excavation_method outside the enum is an input issue, not equipment math", () => {
  const p = baseProject();
  p.items[ITEM].excavation_method = "bulldozer";
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  const issue = r.inputIssues.find((i) => i.code === "foundation_excavation_method_invalid" && i.field === "excavation_method");
  assert.ok(issue, JSON.stringify(r.inputIssues));
  assert.equal(issue.kind, "foundation");
  assert.equal(issue.index, ITEM);
  assert.equal(r.itemPricing[ITEM].available, false, "held, not priced on the equipment branch");
});

check("project excavation_method outside the enum holds every inheriting item", () => {
  const p = baseProject();
  p.excavation_method = "explosives";
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  const methodIssues = r.inputIssues.filter((i) => i.code === "foundation_excavation_method_invalid");
  assert.ok(methodIssues.some((i) => i.index === null), "project-level issue: " + JSON.stringify(r.inputIssues));
  assert.ok(methodIssues.some((i) => i.index === ITEM), "inheriting item held: " + JSON.stringify(r.inputIssues));
  assert.equal(r.itemPricing[ITEM].available, false, "item cannot price a real branch");
  assert.equal(r.delivery.pricingUnavailable, true, "delivery gated");
  // An item with its own valid method still prices — the project default
  // does not reach it.
  const p2 = baseProject();
  p2.excavation_method = "explosives";
  p2.items[ITEM].excavation_method = "hand_dig";
  const r2 = api.calcProject(p2, baseInv(), baseSettings(), { savedProject: savedOf(p2) });
  assert.ok(r2.inputIssues.some((i) => i.code === "foundation_excavation_method_invalid" && i.index === null));
  assert.equal(r2.itemPricing[ITEM].available, true, "own-method item unaffected by the project default");
  assert.equal(r2.items[ITEM].item_total_cost, EV.item.item_total_cost);
});

// ---------- F7: truthy non-record landscape ----------
for (const [label, value] of [["string", "abc"], ["number", 5], ["array", [1, 2]], ["boolean", true]]) {
  check(`non-record landscape holds (${label})`, () => {
    const p = baseProject();
    p.landscape = value;
    const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
    const issue = r.inputIssues.find((i) => i.code === "landscape_unavailable" && i.kind === "landscape");
    assert.ok(issue, "landscape_unavailable for " + label + ": " + JSON.stringify(r.inputIssues));
    assert.equal(r.landscapePricing.available, false);
    assert.equal(r.totals.total_landscape_cost, null, "held — never a silent $0");
  });
}

check("valid landscape record behavior is unchanged", () => {
  const p = baseProject();
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.landscapePricing.available, true);
  assert.equal(r.totals.total_landscape_cost, 0);
});

// ---------- F3: explicit-zero attachment quantity ----------
check("a recorded 0 attachment quantity bills nothing and is ignored — `|| 1` repriced it", () => {
  const inv = baseInv();
  inv.push({ id: "synthetic-excavator", material_type: "excavation_equipment", material_name: "Mini-ex",
    cost_per_day: 200, cost_per_week: 800, cost_per_month: 2000, pickup_delivery_cost: 50, show_in_foundation: true });
  inv.push({ id: "synthetic-bucket", material_type: "attachment", material_name: "Bucket",
    cost_per_day: 40, cost_per_week: 160, cost_per_month: 400, show_in_foundation: true });
  const p = baseProject();
  p.selected_equipment = [{
    component_id: "eq-1", equipment_id: "synthetic-excavator",
    attachments: [{ id: "synthetic-bucket", inventory_id: "synthetic-bucket", qty: 0 }],
    rental_period: "day", rental_duration: 1,
  }];
  const rows = api.calcEquipmentPricing(p.selected_equipment, inv, { savedEquipment: [] });
  assert.equal(rows[0].issues.length, 0, JSON.stringify(rows[0].issues));
  const b = api.resolveFoundationEquipment(p.selected_equipment[0], inv, 0);
  assert.equal(b.attachmentRows[0].quantity, 0, "recorded 0 kept — the ported `|| 1` minted one billed attachment");
});

// ---------- issue contract ----------
check("setting issues carry the catalog-issue shape and per-item index", () => {
  const s = baseSettings();
  s.foundation_pouring_cost_per_cy = "abc";
  const p = baseProject();
  const issues = api.foundationItemSettingIssues(
    { ...p.items[ITEM], excavation_method: p.items[ITEM].excavation_method || p.excavation_method }, s, 3);
  assert.equal(issues.length, 1);
  assert.deepEqual(Object.keys(issues[0]).sort(),
    ["code", "componentId", "field", "index", "inventoryId", "kind", "message"].sort());
  assert.equal(issues[0].index, 3);
  assert.equal(issues[0].inventoryId, null);
  assert.equal(issues[0].code, "foundation_setting_unavailable");
  const r = api.calcProject(p, baseInv(), s, { savedProject: savedOf(p) });
  assert.equal(r.itemPricing[ITEM].issues.filter((i) => i.code === "foundation_setting_unavailable").length, 1,
    "merged once into the item card issues");
});

check("setting issues merge once into catalogIssues — delivery gated, not double-scanned", () => {
  const r = settingCase((s) => { s.foundation_pouring_cost_per_cy = "abc"; });
  assert.equal(r.catalogIssues.filter((i) => i.code === "foundation_setting_unavailable").length, 1);
  assert.equal(r.catalogIssues.filter((i) => i.kind === "concrete_delivery").length, 0,
    "supplier scan not run under the item gate");
});

const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + (RED ? "settings-model-red-verification.json" : "settings-model-verification.json"),
  JSON.stringify({ results }, null, 2));
console.log(`settings-model${RED ? "-red" : ""} passed=${okCount} failed=${results.length - okCount} total=${results.length}`);
if (!RED && okCount !== results.length) process.exit(1);
if (RED && okCount === results.length) { console.log("RED unexpectedly clean — hardening contract not exercised"); process.exit(1); }
