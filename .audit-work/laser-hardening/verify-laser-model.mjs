// Laser pricing-availability — model verification.
// Bundles the candidate module, then proves: strict parsers, settings/item/
// project scans, held calc semantics, explicit-zero decisions, no source
// mutation, and BYTE-IDENTICAL valid-path parity vs the remote inline
// calculateTotals body extracted verbatim from remote/src/pages/LaserEstimator.jsx.
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import assertReal from "node:assert/strict";
import { E } from "./laser-frozen.mjs";

// Counted-assert proxy — every assertion is a recorded check so the run emits
// a machine-readable verification JSON (same convention as painting/cnc).
const __results = [];
let __section = "setup";
const section = (name) => { __section = name; };
const assert = new Proxy(assertReal, {
  get: (t, p) => {
    if (typeof t[p] !== "function") return t[p];
    return (...args) => { const r = t[p](...args); __results.push({ section: __section, ok: true }); return r; };
  },
});

const modBuild = await esbuild.build({
  entryPoints: [E + "laser-pricing-candidate-laserPricingAvailability.js"],
  bundle: true, format: "esm", platform: "node", write: true,
  outfile: E + ".laser-mod-bundle.mjs", logLevel: "silent",
});
assert.deepEqual(modBuild.warnings, []);
const M = await import(pathToFileURL(path.resolve(E + ".laser-mod-bundle.mjs")));

// ---- verbatim remote math reference: extract the calculateTotals body ----
const page = fs.readFileSync(E + "remote/src/pages/LaserEstimator.jsx", "utf8");
const start = page.indexOf("const calculateTotals = useCallback(() => {");
const end = page.indexOf("}, [", start);
assert.ok(start > 0 && end > start, "remote calculateTotals located");
const body = page.slice(page.indexOf("{", start) + 1, end).replace(/\}\s*$/, "");
// Build a reference function with the exact remote body.
const remoteCalc = new Function("project", `"use strict";\n${body}\n`);

// ---------- fixtures ----------
const SETTINGS = (o = {}) => ({
  parameter_laser_machine_rate: "100",
  parameter_laser_labor_rate: "75",
  engraving_laser_machine_rate: "80",
  engraving_labor_rate: "40",
  parameter_handling_time_percentage: "15",
  engraving_handling_time_percentage: "20",
  min_parameter_laser_setup_hours: "0.5",
  parameter_laser_fixed_material_setup_cost: "0",
  laser_letter_perimeter_factor: "3.5",
  laser_engrave_speed_sqipm: "5",
  acrylic_cut_multiplier: "1", wood_cut_multiplier: "1", leather_cut_multiplier: "1",
  acrylic_engrave_multiplier: "1", wood_engrave_multiplier: "1", leather_engrave_multiplier: "1",
  cut_speed_1_16: "20", cut_speed_1_8: "20", cut_speed_3_16: "20", cut_speed_1_4: "20",
  cut_speed_3_8: "20", cut_speed_1_2: "20", cut_speed_3_4: "20",
  ...o,
});
const PANEL = (o = {}) => ({
  item_type: "panel", material_type: "Acrylic", material_thickness: "1/4",
  description: "P", quantity: 2, length: 24, width: 12, letter_height: 0, num_letters: 1,
  engrave_area_sqin: 0, total_cut_length_inches: 2 * (24 + 12) * 2,
  cut_speed_ipm: 20, engrave_speed_sqipm: 5, file_url: "", ...o,
});
const ENGRAVE = (o = {}) => PANEL({ item_type: "engraving", material_thickness: "1/4",
  length: 10, width: 8, engrave_area_sqin: 80, ...o });
const LETTERS = (o = {}) => PANEL({ item_type: "lettering", letter_height: 6,
  num_letters: 12, length: 0, width: 0,
  total_cut_length_inches: 6 * 3.5 * 12 * 2, ...o });
const EAC = (o = {}) => PANEL({ item_type: "engrave_and_cut", engrave_area_sqin: 48, ...o });
const PROJ = (items, o = {}) => ({
  project_name: "P", client_name: "C", items,
  machine_rate_per_hour: 100, labor_rate: 75,
  engraving_machine_rate_per_hour: 80, engraving_labor_rate: 40,
  parameter_handling_time_percentage: 15, engraving_handling_time_percentage: 20,
  fixed_setup_hours: 0.5, fixed_material_setup_cost: 0, notes: "", ...o,
});

// ---------- strict parser ----------
section("strict_parsers");
{
  const good = [0, 5, -3, "12", " 12.5 ", "-2", "0", "1e2"];
  for (const v of good) assert.notEqual(M.laserStrictNumber(v), null, `strict ok ${v}`);
  const bad = ["", "  ", "abc", "0x10", null, undefined, NaN, Infinity, {}, [], "1,2"];
  for (const v of bad) assert.equal(M.laserStrictNumber(v), null, `strict bad ${JSON.stringify(v)}`);
  assert.equal(M.laserStrictNumber(0), 0, "0 is a number");
}
{
  assert.equal(M.laserSettingRecorded({ k: "5" }, "k"), true);
  assert.equal(M.laserSettingRecorded({ k: " " }, "k"), false, "blank = not recorded");
  assert.equal(M.laserSettingRecorded({ k: null }, "k"), false);
  assert.equal(M.laserSettingRecorded({}, "k"), false);
  // seed resolver: absent→fallback; recorded verbatim incl. legit 0; bad→fallback
  assert.equal(M.laserSeedNumber({}, "k", 15), 15);
  assert.equal(M.laserSeedNumber({ k: "0" }, "k", 15), 0, "authored 0 honored (nonneg)");
  assert.equal(M.laserSeedNumber({ k: "0" }, "k", 100, { positive: true }), 100, "0 rejected (positive)");
  assert.equal(M.laserSeedNumber({ k: "abc" }, "k", 15), 15, "malformed → fallback");
  assert.equal(M.laserSeedNumber({ k: "42" }, "k", 15), 42);
  assert.equal(M.laserSeedNumber({ k: "-1" }, "k", 15), 15, "negative → fallback (nonneg)");
}

// ---------- settings scan ----------
section("settings_scan");
{
  // New project (no id): malformed consumed seed key flags laser_catalog/project.
  const iss = M.laserSettingIssues(PROJ([PANEL()]), SETTINGS({ parameter_laser_machine_rate: "oops" }));
  assert.equal(iss.length, 1);
  assert.equal(iss[0].kind, "laser_catalog");
  assert.equal(iss[0].hold, "project");
  assert.equal(iss[0].field, "parameter_laser_machine_rate");
  assert.equal(iss[0].code, "laser_setting_unavailable");
  // Existing record (has id) — seed keys are NOT settings-consumed anymore.
  assert.equal(M.laserSettingIssues(PROJ([PANEL()], { id: "x" }), SETTINGS({ parameter_laser_machine_rate: "oops" })).length, 0,
    "existing record: seed settings not consumed");
  // 0 rate on a NEW project flags (positive key); authored 0 handling does NOT.
  assert.equal(M.laserSettingIssues(PROJ([]), SETTINGS({ parameter_laser_machine_rate: "0" })).length, 1);
  assert.equal(M.laserSettingIssues(PROJ([]), SETTINGS({ parameter_handling_time_percentage: "0" })).length, 0,
    "authored 0% handling is legitimate");
  // Item-derived keys only when consumed.
  assert.equal(M.laserSettingIssues(PROJ([PANEL()], { id: "x" }), SETTINGS({ cut_speed_1_4: "bad" })).length, 1,
    "consumed thickness speed flags");
  assert.equal(M.laserSettingIssues(PROJ([PANEL({ material_thickness: "1/2" })], { id: "x" }), SETTINGS({ cut_speed_1_4: "bad" })).length, 0,
    "unconsumed thickness speed does not flag");
  assert.equal(M.laserSettingIssues(PROJ([PANEL()], { id: "x" }), SETTINGS({ acrylic_cut_multiplier: "bad" })).length, 1);
  assert.equal(M.laserSettingIssues(PROJ([PANEL()], { id: "x" }), SETTINGS({ wood_cut_multiplier: "bad" })).length, 0,
    "unconsumed material multiplier does not flag");
  assert.equal(M.laserSettingIssues(PROJ([ENGRAVE()], { id: "x" }), SETTINGS({ laser_engrave_speed_sqipm: "0" })).length, 1);
  assert.equal(M.laserSettingIssues(PROJ([PANEL()], { id: "x" }), SETTINGS({ laser_engrave_speed_sqipm: "bad" })).length, 0,
    "engrave speed unconsumed for pure cut project");
  assert.equal(M.laserSettingIssues(PROJ([LETTERS()], { id: "x" }), SETTINGS({ laser_letter_perimeter_factor: "bad" })).length, 1);
  assert.equal(M.laserSettingIssues(PROJ([PANEL()], { id: "x" }), SETTINGS({ laser_letter_perimeter_factor: "bad" })).length, 0,
    "perimeter factor unconsumed for non-lettering project");
  // Absent keys = documented default → never flagged.
  assert.equal(M.laserSettingIssues(PROJ([PANEL()]), {}).length, 0, "absent settings = defaults, no flags");
}

// ---------- project scan ----------
section("project_scan");
{
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { items: "junk" }))[0].code, "laser_items_unavailable");
  const r = M.laserProjectInputIssues(PROJ([PANEL()], { machine_rate_per_hour: "abc" }));
  assert.equal(r.length, 1); assert.equal(r[0].code, "laser_rate_unavailable"); assert.equal(r[0].field, "machine_rate_per_hour");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { machine_rate_per_hour: 0 })).length, 1, "0 machine rate invalid");
  assert.equal(M.laserProjectInputIssues(PROJ([ENGRAVE()], { machine_rate_per_hour: "junk" })).length, 0,
    "machine rate unconsumed on engrave-only project");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { labor_rate: "x" })).length, 1, "labor rate always consumed (setup)");
  assert.equal(M.laserProjectInputIssues(PROJ([], { labor_rate: "bad" })).length, 1, "labor consumed even with 0 items");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { parameter_handling_time_percentage: 0 })).length, 0, "0% handling legit");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { parameter_handling_time_percentage: "x" })).length, 1);
  assert.equal(M.laserProjectInputIssues(PROJ([ENGRAVE()], { engraving_handling_time_percentage: 0 })).length, 0, "0% engrave handling legit");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { fixed_setup_hours: "" })).length, 1, "blank setup = malformed");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { fixed_setup_hours: 0 })).length, 0, "0 setup legit");
  assert.equal(M.laserProjectInputIssues(PROJ([PANEL()], { fixed_material_setup_cost: -1 })).length, 1, "negative cost invalid");
  assert.equal(M.laserProjectInputIssues(PROJ([ENGRAVE()], { engraving_labor_rate: 0 })).length, 1, "0 engrave labor invalid");
}

// ---------- item scan ----------
section("item_scan");
{
  assert.equal(M.laserItemIssues(PANEL()).length, 0, "clean panel OK");
  assert.equal(M.laserItemIssues(ENGRAVE()).length, 0, "clean engraving OK");
  assert.equal(M.laserItemIssues(LETTERS()).length, 0, "clean lettering OK");
  const t = M.laserItemIssues(PANEL({ item_type: "weird" }));
  assert.equal(t[0].code, "laser_item_type_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ material_type: "Steel" }))[0].code, "laser_material_type_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ material_thickness: "9/9" }))[0].code, "laser_thickness_unavailable");
  assert.equal(M.laserItemIssues(ENGRAVE({ material_thickness: "9/9" })).length, 0,
    "thickness not consumed on engraving");
  assert.equal(M.laserItemIssues(PANEL({ length: "" }))[0].code, "laser_dimension_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ width: 0 }))[0].code, "laser_dimension_unavailable");
  assert.equal(M.laserItemIssues(ENGRAVE({ length: 0, width: 0 })).length, 0, "engraving L/W 0 OK (area hand-entered)");
  assert.equal(M.laserItemIssues(ENGRAVE({ length: "abc" }))[0].code, "laser_dimension_unavailable",
    "engraving L/W malformed flagged (feeds area derivation)");
  assert.equal(M.laserItemIssues(LETTERS({ letter_height: 0 }))[0].code, "laser_dimension_unavailable");
  assert.equal(M.laserItemIssues(LETTERS({ num_letters: "" }))[0].code, "laser_quantity_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ quantity: "" }))[0].code, "laser_quantity_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ quantity: 0 }))[0].code, "laser_quantity_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ total_cut_length_inches: 0 }))[0].code, "laser_cut_length_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ total_cut_length_inches: "x" }))[0].code, "laser_cut_length_unavailable");
  assert.equal(M.laserItemIssues(ENGRAVE({ total_cut_length_inches: 0 })).length, 0, "engraving 0 cut len OK");
  assert.equal(M.laserItemIssues(ENGRAVE({ engrave_area_sqin: 0 }))[0].code, "laser_engrave_area_unavailable");
  assert.equal(M.laserItemIssues(ENGRAVE({ engrave_area_sqin: "" }))[0].code, "laser_engrave_area_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ engrave_area_sqin: "junk" }))[0].code, "laser_engrave_area_unavailable",
    "malformed area flagged even when multiplied to 0");
  assert.equal(M.laserItemIssues(PANEL({ cut_speed_ipm: "abc" }))[0].code, "laser_cut_speed_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ cut_speed_ipm: 0 }))[0].code, "laser_cut_speed_unavailable");
  assert.equal(M.laserItemIssues(PANEL({ engrave_speed_sqipm: "x" }))[0].code, "laser_engrave_speed_unavailable");
  // issues are item-held with itemIndex
  const ii = M.laserItemIssues(PANEL({ quantity: "" }), 2);
  assert.equal(ii[0].hold, "item"); assert.equal(ii[0].itemIndex, 2); assert.equal(ii[0].index, 2);
}

// ---------- held calc semantics ----------
section("held_calc_semantics");
{
  // Held: malformed item → totals null, held row derived null, raw untouched.
  const proj = PROJ([PANEL({ total_cut_length_inches: "abc" })]);
  const raw = JSON.stringify(proj);
  const r = M.calcLaserPricing(proj, SETTINGS());
  assert.equal(r.held, true);
  assert.equal(r.calc.pricingUnavailable, true);
  assert.equal(r.calc.total_machine_cost, null);
  assert.equal(r.calc.total_labor_cost, null);
  assert.equal(r.calc.total_supplies_cost, null);
  assert.equal(r.calc.items[0].machine_cost, null);
  assert.equal(r.calc.items[0].machine_time_hours, null);
  assert.equal(proj.total_cut_length_inches, undefined);
  assert.equal(JSON.stringify(proj), raw, "raw project not mutated");
  // Only the held row's derived fields null when item-scoped.
  const r2 = M.calcLaserPricing(PROJ([PANEL(), PANEL({ quantity: "" })]), SETTINGS());
  assert.equal(r2.held, true);
  assert.ok(Number.isFinite(r2.calc.items[0].machine_cost), "clean row keeps live derived");
  assert.equal(r2.calc.items[1].machine_cost, null, "held row derived nulled");
  assert.equal(r2.calc.total_machine_cost, null, "totals null when any item held");
  // Project-hold nulls every row's derived fields.
  const r3 = M.calcLaserPricing(PROJ([PANEL(), PANEL()], { labor_rate: "x" }), SETTINGS());
  assert.equal(r3.calc.items[0].machine_cost, null);
  assert.equal(r3.calc.items[1].machine_cost, null);
  // Settings-hold behaves as project-hold.
  const r4 = M.calcLaserPricing(PROJ([PANEL()]), SETTINGS({ parameter_laser_machine_rate: "bad" }));
  assert.equal(r4.held, true); assert.equal(r4.calc.items[0].machine_cost, null);
  // Non-array items → held, calcable shape.
  const r5 = M.calcLaserPricing(PROJ([], { items: "junk" }), SETTINGS());
  assert.equal(r5.held, true);
  assert.equal(r5.calc.total_machine_cost, null);
  assert.deepEqual(r5.calc.items, []);
  // Clean → unheld with metadata.
  const ok = M.calcLaserPricing(PROJ([PANEL()]), SETTINGS());
  assert.equal(ok.held, false);
  assert.equal(ok.calc.__held, false);
  assert.ok(Number.isFinite(ok.calc.total_machine_cost));
}

// ---------- BYTE-IDENTICAL valid-path parity vs verbatim remote math ----------
section("parity_vs_remote");
{
  const cases = [
    ["panel", PROJ([PANEL()])],
    ["engraving", PROJ([ENGRAVE()])],
    ["lettering", PROJ([LETTERS()])],
    ["engrave_and_cut", PROJ([EAC()])],
    ["mixed", PROJ([PANEL(), ENGRAVE(), LETTERS(), EAC()])],
    ["fixed costs", PROJ([PANEL()], { fixed_setup_hours: 2.25, fixed_material_setup_cost: 17.5 })],
    ["odd rates", PROJ([ENGRAVE(), EAC()], { machine_rate_per_hour: 137.5, labor_rate: 62.25,
      engraving_machine_rate_per_hour: 95, engraving_labor_rate: 33,
      parameter_handling_time_percentage: 7.5, engraving_handling_time_percentage: 0 })],
    ["zero handling", PROJ([PANEL()], { parameter_handling_time_percentage: 0 })],
    ["empty items", PROJ([])],
    ["fractional qty", PROJ([PANEL({ quantity: 2.5 })])],
  ];
  for (const [name, proj] of cases) {
    const remote = remoteCalc(JSON.parse(JSON.stringify(proj)));
    const cand = M.computeLaserTotals(JSON.parse(JSON.stringify(proj)));
    assert.equal(cand.total_machine_cost, remote.total_machine_cost, `${name} machine`);
    assert.equal(cand.total_labor_cost, remote.total_labor_cost, `${name} labor`);
    assert.equal(cand.total_supplies_cost, remote.total_supplies_cost, `${name} supplies`);
    assert.equal(cand.items.length, remote.items.length, `${name} items`);
    for (let i = 0; i < remote.items.length; i++) {
      for (const f of ["machine_time_hours", "handling_time_hours", "machine_cost", "labor_cost"])
        assert.equal(cand.items[i][f], remote.items[i][f], `${name} item${i}.${f}`);
    }
    // And through the wrapper — unheld results are the same numbers.
    const w = M.calcLaserPricing(proj, SETTINGS());
    assert.equal(w.held, false, `${name} unheld`);
    assert.equal(w.calc.total_machine_cost, remote.total_machine_cost, `${name} wrapped machine`);
    assert.equal(w.calc.total_labor_cost, remote.total_labor_cost, `${name} wrapped labor`);
  }
}

// ---------- UI helpers ----------
section("ui_helpers");
{
  assert.equal(M.hasLaserCostSnapshot(10), true);
  assert.equal(M.hasLaserCostSnapshot(0), true);
  assert.equal(M.hasLaserCostSnapshot(null), false);
  assert.equal(M.hasLaserCostSnapshot(NaN), false);
  assert.equal(M.laserSumOrNull(1, 2, 3), 6);
  assert.equal(M.laserSumOrNull(1, null, 3), null);
  assert.equal(M.laserDraftValue(""), "");
  assert.equal(M.laserDraftValue("12.5"), 12.5);
  assert.equal(M.laserDraftValue("abc"), "abc", "malformed stays raw for flagging");
  const iss = [{ field: "quantity", itemIndex: 0 }, { field: "quantity", itemIndex: 1 }];
  assert.equal(M.hasIssueFor(iss, "quantity", 1), true);
  assert.equal(M.hasIssueFor(iss, "quantity", 5), false);
  assert.equal(M.issuesForField(iss, "quantity", 0).length, 1);
}

const sections = {};
for (const r of __results) sections[r.section] = (sections[r.section] || 0) + 1;
fs.writeFileSync(E + "laser-model-verification.json", JSON.stringify(
  { suite: "laser-model", passed: __results.length, failed: 0, result: "PASS", sections }, null, 1));
console.log(`PASS laser-model (parsers/scanners/held/parity-vs-remote/ui-helpers) — ${__results.length} checks`);
