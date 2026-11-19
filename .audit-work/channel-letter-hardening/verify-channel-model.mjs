// Channel Letter pricing-availability hardening — model verification.
// Bundles the real remote calculators + candidate availability layer in Node
// (no browser, no SDK, no network) and runs the fixture matrix.
//   --mode=red repeats the key cases against the FROZEN remote calculators to
//   prove the permissive $0/hidden-default laundering the hardening removes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const E = ".audit-work/channel-letter-hardening/";
const MODE = process.argv.includes("--mode=red") ? "red" : "candidate";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (p) => fs.readFileSync(p, "utf8");
const remoteSrc = (p) => read(E + "remote/" + p);
const candidate = (p) => read(E + "candidates/" + p);

// ---------- frozen source map ----------
const C = "/app/src/components/channelLetterInstall/";
const remote = {
  [C + "lettersCalculator.jsx"]: remoteSrc("src/components/channelLetterInstall/lettersCalculator.jsx"),
  [C + "installCalculator.jsx"]: remoteSrc("src/components/channelLetterInstall/installCalculator.jsx"),
  [C + "installSizeRates.jsx"]: remoteSrc("src/components/channelLetterInstall/installSizeRates.jsx"),
  [C + "wallMaterials.jsx"]: remoteSrc("src/components/channelLetterInstall/wallMaterials.jsx"),
};
const entry = "/app/model-entry.js";
const mkSources = (withCandidates) => {
  const sources = new Map(Object.entries(remote));
  if (withCandidates) {
    sources.set(C + "channelLetterPricingAvailability.js", candidate("src/components/channelLetterInstall/channelLetterPricingAvailability.js"));
    sources.set(entry, `
      export { calcChannelProject, channelProjectIssues, channelNumber,
        channelNonNegativeNumber, channelPositiveNumber, hasChannelCostSnapshot,
        channelDraftValue, issuesForField, hasIssueFor }
        from "${C}channelLetterPricingAvailability.js";
      export { calcLettersTotals, calcLetterPurchase, emptyLetterPurchase }
        from "${C}lettersCalculator.jsx";
      export { calcLineItem, calcProjectTotals, emptyLineItem }
        from "${C}installCalculator.jsx";
    `);
  } else {
    sources.set(entry, `
      export { calcLettersTotals, calcLetterPurchase, emptyLetterPurchase }
        from "${C}lettersCalculator.jsx";
      export { calcLineItem, calcProjectTotals, emptyLineItem }
        from "${C}installCalculator.jsx";
    `);
  }
  return sources;
};

const plug = (sources) => ({
  name: "frozen",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      let base;
      if (a.path.startsWith("/app/")) base = a.path;
      else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
      else if (a.path.startsWith(".")) {
        if (!a.importer.startsWith("/app")) return null;
        base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
      } else return null;
      const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
      if (!resolved) throw Error("Missing frozen source; held local work forbidden: " + a.path + " from " + a.importer);
      return { path: resolved, namespace: "frozen" };
    });
    b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => ({
      contents: sources.get(a.path),
      loader: a.path.endsWith(".jsx") ? "jsx" : "js",
    }));
  },
});

const buildVariant = async (withCandidates, outfile) => {
  const sources = mkSources(withCandidates);
  const build = await esbuild.build({
    entryPoints: [entry], bundle: true, platform: "node", format: "esm",
    write: false, metafile: true, logLevel: "silent", jsx: "automatic",
    plugins: [plug(sources)],
  });
  assert.deepEqual(build.warnings, []);
  fs.writeFileSync(E + outfile, build.outputFiles[0].contents);
  return { build, sources };
};

const { build: candBuild } = await buildVariant(true, ".model-bundle.candidate.mjs");
const { build: redBuild } = await buildVariant(false, ".model-bundle.frozen.mjs");
const { pathToFileURL } = await import("node:url");
const M = await import(pathToFileURL(path.resolve(E + ".model-bundle.candidate.mjs")).href + "?ts=" + Date.now());
const R = await import(pathToFileURL(path.resolve(E + ".model-bundle.frozen.mjs")).href + "?ts=" + Date.now());

// ---------- fixtures ----------
// A complete, valid settings catalog for the baseline project. Any setting the
// calculators consume for these rows must be recorded here.
const settings = {
  // letter rates
  letters_channel_flush_per_inch: 9.03,
  letters_channel_raceway_per_inch: 7.10,
  letters_channel_halo_per_inch: 11.75,
  letters_capsule_logo_per_sqft: 45.37,
  letters_raceway_1st_per_ft: 22.53,
  letters_raceway_2nd_per_ft: 23.53,
  letters_raceway_3rd_per_ft: 24.53,
  letters_raceway_4th_per_ft: 25.53,
  // install labor + size-rate minutes (medium / exterior / 0-12ft) + wall
  install_labor_rate: 65,
  install_installer_rate: 65,
  install_crew_lead_rate: 85,
  install_helper_rate: 45,
  install_drill_rate_medium__exterior__h0_12: 50,
  install_prep_rate_medium__exterior__h0_12: 100,
  install_electrical_rate_medium__exterior__h0_12: 15,
  install_drill_rate_medium__exterior__h12_20: 60,
  install_prep_rate_medium__exterior__h12_20: 110,
  install_electrical_rate_medium__exterior__h12_20: 18,
  install_raceway_base_minutes_per_foot: 30,
  install_raceway_letter_mounting_rate: 18,
  install_raceway_electrical_hookup_minutes: 30,
  install_wall_eifs_multiplier: 1.0,
  install_escort_multiplier: 1.15,
  install_badging_multiplier: 1.1,
  install_after_hours_multiplier: 1.5,
  install_set_hours_multiplier: 1.15,
  install_thick_walls_extra_per_letter: 8,
  install_thick_walls_extra_per_raceway: 30,
  install_parapet_roof_extra_per_letter: 10,
  install_parapet_roof_extra_per_raceway: 40,
  install_site_access_level_1: 3,
  install_poor_electrical_level_1: 3,
  // travel (consumed only when mileage > 0)
  install_gasoline_price_per_gallon: 3.5,
  install_diesel_price_per_gallon: 4.0,
  install_travel_labor_rate: 45,
  install_travel_avg_speed_mph: 55,
  install_travel_overhead_per_mile: 0.15,
  install_min_travel_charge: 75,
};

const basePurchase = {
  id: "lp1", letter_type: "channel_flush_mounted", description: "Front letters",
  qty: 5, size_value: 24, raceway_length_feet: 0, raceway_qty: 0,
  unit_cost: 0, unit_cost_override: false, letters_total_override: false,
  create_install_item: true, install_height_feet: 12, wall_material: "eifs",
  backer_enabled: false,
};
const baseRacewayPurchase = {
  id: "lp2", letter_type: "raceway", description: "Raceway",
  qty: 1, size_value: 8, raceway_length_feet: 0, raceway_qty: 0,
  unit_cost: 0, unit_cost_override: false, letters_total_override: false,
  create_install_item: false, install_height_feet: 12, wall_material: "eifs",
  backer_enabled: false,
};
const baseDimPurchase = {
  id: "lp3", letter_type: "dimensional_letters", description: "Lobby dims",
  qty: 8, size_value: 0, raceway_length_feet: 0, raceway_qty: 0,
  unit_cost: 0, unit_cost_override: false, letters_total_override: false,
  create_install_item: true, install_height_feet: 8, wall_material: "drywall_interior",
  backer_enabled: false,
  fab_config: {
    material_id: "dm1", cutting_method: "cnc",
    letter_height_inches: 12, unit_total_cost: 42.5,
    material_thickness_inches: 0.25, material_type: "acrylic",
    paint_letters: false,
  },
};
const baseItem = {
  description: "Install", installation_type: "flush_mount",
  qty_letters: 10, letter_size: "medium", letter_height_inches: 24,
  installation_height_feet: 12, wall_material: "eifs",
  thick_hollow_walls: false, parapet: false,
  poor_electrical_access: false, escort_required: false,
  badging_checkin: false, after_hours_weekend: false,
  set_hours_installation: false, poor_site_access: false,
  materials: [],
};
const baseMaterial = {
  inventory_item_id: "m1", item_name: "Sleeve anchors",
  pricing_mode: "per_letter_flat", unit_cost: 0.35, quantity: 10, total_cost: 3.5,
};
const baseEquipment = {
  equipment_id: "eq1", equipment_name: "Bucket Truck",
  pricing_mode: "per_day", duration: 1, unit_cost: 350, total_cost: 350,
};
const basePersonnel = {
  role: "Installer", name: "Jo", hourly_rate: 65, hours: 8, total_cost: 520,
};
const inventory = [
  { id: "m1", item_name: "Sleeve anchors", pricing_mode: "per_letter_flat", cost_per_letter: 0.35, is_default: false },
];
const equipmentInventory = [
  { id: "eq1", equipment_name: "Bucket Truck", equipment_type: "boom_truck", pricing_mode: "per_day", cost_per_day: 350 },
  { id: "tk1", equipment_name: "F-250", equipment_type: "truck", ownership: "owned", pricing_mode: "owned_flat", cost_flat: 0, mpg: 14 },
];
const dimensionalMaterials = [
  { id: "dm1", material_name: "Acrylic 1/4", is_active: true, material_type: "acrylic",
    cost_per_sheet: 120, sheet_length_inches: 96, sheet_width_inches: 48,
    thickness_inches: 0.25, yield_factor: 0.7 },
];

const mkProject = (over = {}) => ({
  project_scope: "full", install_environment: "exterior",
  letter_purchases: [structuredClone(basePurchase)],
  items: [structuredClone(baseItem)],
  selected_equipment: [structuredClone(baseEquipment)],
  personnel: [structuredClone(basePersonnel)],
  letters_delivery_fee: 25, letters_design_fee: 0,
  letters_install_supplies_fee: 0, letters_permitting_fee: 0, letters_other_fee: 0,
  letters_markup_percent: 10,
  travel_miles_round_trip: 40, total_travel_cost: 120,
  supplies_percent_of_materials: 10, extra_supplies_cost: 0,
  markup_percent: 20,
  ...over,
});

const catalogs = { settings, inventory, equipmentInventory, dimensionalMaterials };
const calc = (project, cat = catalogs, savedProject = undefined) =>
  M.calcChannelProject({ project, savedProject, ...cat });

// Replicates the page's useMemo against the frozen calculators — the parity
// oracle. Anything other than this exact chain is a regression.
const expectedFor = (project, cat = catalogs) => {
  const { settings: st, inventory: inv } = cat;
  const scope = project.project_scope || "full";
  const swe = { ...st, _project_install_environment: project.install_environment || "exterior" };
  const lettersTotals = scope === "install_only"
    ? { letters_subtotal: 0, total_letters_cost: 0, letter_purchases: project.letter_purchases || [] }
    : R.calcLettersTotals(project, swe);
  const recalcItems = scope === "letters_only"
    ? []
    : (project.items || []).map(it => R.calcLineItem(it, swe, inv));
  const projectForTotals = scope === "letters_only"
    ? { ...project, ...lettersTotals, items: recalcItems, selected_equipment: [], personnel: [] }
    : { ...project, ...lettersTotals, items: recalcItems };
  const totals = R.calcProjectTotals(projectForTotals);
  return { ...project, ...lettersTotals, items: recalcItems, ...totals };
};
const stripMeta = (r) => { const { __held, pricingUnavailable, issues, ...rest } = r; return rest; };

const results = [];
const check = (id, fn) => {
  try { fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 900) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 250)); }
};
const codes = (issues) => issues.map(i => i.code);
const has = (issues, code) => issues.some(i => i.code === code);
const find = (issues, code) => issues.find(i => i.code === code);

if (MODE === "candidate") {
  // ---------- strict parsers ----------
  check("parser: numbers + numeric strings pass", () => {
    assert.equal(M.channelNumber(12.5), 12.5);
    assert.equal(M.channelNumber("12.5"), 12.5);
    assert.equal(M.channelNumber(" 8 "), 8);
    assert.equal(M.channelNumber(0), 0);
    assert.equal(M.channelNumber("0"), 0);
    assert.equal(M.channelNumber(-4), -4);
  });
  check("parser: malformed → null", () => {
    for (const v of ["", "abc", "12x", Infinity, -Infinity, NaN, null, undefined, {}, [], " ", "0x10", "1,200"]) {
      assert.equal(M.channelNumber(v), null, `channelNumber(${JSON.stringify(v)})`);
    }
  });
  check("parser: nonneg/positive gates", () => {
    assert.equal(M.channelNonNegativeNumber(0), 0);
    assert.equal(M.channelNonNegativeNumber(-1), null);
    assert.equal(M.channelNonNegativeNumber("3.5"), 3.5);
    assert.equal(M.channelPositiveNumber(0), null);
    assert.equal(M.channelPositiveNumber(-2), null);
    assert.equal(M.channelPositiveNumber(0.5), 0.5);
  });
  check("snapshot: only real finite numbers count", () => {
    assert.equal(M.hasChannelCostSnapshot(0), true);
    assert.equal(M.hasChannelCostSnapshot(12.5), true);
    for (const v of ["12", null, undefined, NaN, Infinity, {}, []]) assert.equal(M.hasChannelCostSnapshot(v), false);
  });
  check("draft value: blank preserved, numbers parsed, junk kept raw", () => {
    assert.equal(M.channelDraftValue(""), "");
    assert.equal(M.channelDraftValue("12.5"), 12.5);
    assert.equal(M.channelDraftValue("abc"), "abc");
    assert.equal(M.channelDraftValue(7), 7);
  });

  // ---------- valid baseline: byte-identical math ----------
  check("valid: clean full-scope project produces identical calc + no issues", () => {
    const p = mkProject();
    const { recalculated, issues, held } = calc(p);
    assert.equal(held, false, JSON.stringify(issues));
    assert.equal(issues.length, 0);
    assert.deepEqual(stripMeta(recalculated), expectedFor(p));
  });
  check("valid: explicit $0 fees + $0 markup are real zeros, not issues", () => {
    const p = mkProject({ letters_delivery_fee: 0, letters_design_fee: 0, markup_percent: 0, supplies_percent_of_materials: 0, travel_miles_round_trip: 0, total_travel_cost: 0 });
    const { recalculated, issues, held } = calc(p);
    assert.equal(held, false, JSON.stringify(issues));
    assert.equal(recalculated.markup_amount, 0);
    assert.deepEqual(stripMeta(recalculated), expectedFor(p));
  });
  check("valid: numeric-string inputs produce identical calc + no issues", () => {
    const p = mkProject();
    p.letter_purchases[0].qty = "5";
    p.letter_purchases[0].size_value = "24";
    p.items[0].qty_letters = "10";
    p.letters_markup_percent = "10";
    const { recalculated, issues, held } = calc(p);
    assert.equal(held, false, JSON.stringify(issues));
    assert.deepEqual(stripMeta(recalculated), expectedFor(p));
  });
  check("valid: raceway install item may mount 0 letters", () => {
    const p = mkProject({
      items: [{ ...structuredClone(baseItem), installation_type: "raceway", qty_letters: 0, raceway_length_feet: 20, letter_size: "medium" }],
      letter_purchases: [structuredClone(baseRacewayPurchase)],
    });
    const { issues, held } = calc(p);
    assert.equal(held, false, JSON.stringify(issues));
  });
  check("valid: install_only scope zeroes letters side identically", () => {
    const p = mkProject({ project_scope: "install_only" });
    const { recalculated, issues, held } = calc(p);
    assert.equal(held, false, JSON.stringify(issues));
    assert.equal(recalculated.total_letters_cost, 0);
    assert.equal(recalculated.letters_subtotal, 0);
    assert.deepEqual(stripMeta(recalculated), expectedFor(p));
  });
  check("valid: letters_only scope drops install/crew from rollup identically", () => {
    const p = mkProject({ project_scope: "letters_only" });
    const { recalculated, issues, held } = calc(p);
    assert.equal(held, false, JSON.stringify(issues));
    assert.equal(recalculated.total_equipment_cost, 0);
    assert.equal(recalculated.total_personnel_cost, 0);
    assert.deepEqual(stripMeta(recalculated), expectedFor(p));
  });

  // ---------- letters: authored input issues ----------
  check("held: blank purchase qty → qty issue + row held + subtotal null", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "";
    const { recalculated, issues, held } = calc(p);
    assert.equal(held, true);
    const i = find(issues, "channel_qty_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.kind, "channel");
    assert.equal(i.index, 0);
    assert.equal(i.hold, "purchase");
    assert.equal(recalculated.letter_purchases[0].__held, true);
    assert.equal(recalculated.letters_subtotal, null);
    assert.equal(recalculated.total_letters_cost, null);
    assert.equal(recalculated.total_cost, null);
    assert.ok(Number.isFinite(recalculated.labor_cost), "install side unaffected");
  });
  check("held: malformed qty string → qty issue (numeric strings only)", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "abc";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_qty_unavailable"));
  });
  check("held: zero qty → qty issue (0 silently prices the row $0)", () => {
    const p = mkProject(); p.letter_purchases[0].qty = 0;
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_qty_unavailable"));
  });
  check("held: blank size_value → size issue", () => {
    const p = mkProject(); p.letter_purchases[0].size_value = "";
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_size_unavailable"), JSON.stringify(codes(issues)));
    assert.equal(recalculated.letter_purchases[0].__held, true);
    assert.equal(recalculated.letters_subtotal, null);
  });
  check("held: standalone raceway with blank length (size_value) → size issue", () => {
    const p = mkProject({ letter_purchases: [{ ...structuredClone(baseRacewayPurchase), size_value: "" }] });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_size_unavailable"), JSON.stringify(codes(issues)));
    assert.equal(recalculated.total_letters_cost, null);
  });
  check("held: unknown letter_type → type issue", () => {
    const p = mkProject(); p.letter_purchases[0].letter_type = "neon";
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_letter_type_unavailable"));
    assert.equal(recalculated.letter_purchases[0].__held, true);
  });
  check("held: unit_cost_override + malformed override → unit cost issue", () => {
    const p = mkProject();
    p.letter_purchases[0].unit_cost_override = true;
    p.letter_purchases[0].unit_cost = "abc";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_unit_cost_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: letters_total_override + malformed total → total issue", () => {
    const p = mkProject();
    p.letter_purchases[0].letters_total_override = true;
    p.letter_purchases[0].letters_total = "zzz";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_letters_total_unavailable"));
  });
  check("held: malformed install_height_feet on a purchase → height issue", () => {
    const p = mkProject(); p.letter_purchases[0].install_height_feet = "abc";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_install_height_unavailable"), JSON.stringify(codes(issues)));
  });

  // ---------- letters: catalog + fee issues ----------
  check("held: missing per-inch rate setting → catalog issue poisons the row", () => {
    const st = { ...settings }; delete st.letters_channel_flush_per_inch;
    const { issues, recalculated } = calc(mkProject(), { ...catalogs, settings: st });
    const i = find(issues, "channel_letter_rate_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.kind, "channel_catalog");
    assert.equal(i.field, "letters_channel_flush_per_inch");
    assert.equal(recalculated.letter_purchases[0].__held, true, "row poisoned via letterTypes");
    assert.equal(recalculated.letters_subtotal, null);
  });
  check("held: malformed per-inch rate → same catalog issue", () => {
    const st = { ...settings, letters_channel_flush_per_inch: "abc" };
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    assert.ok(has(issues, "channel_letter_rate_unavailable"));
  });
  check("held: raceway row + missing tier rate → catalog rate issue", () => {
    const st = { ...settings }; delete st.letters_raceway_1st_per_ft;
    const p = mkProject({ letter_purchases: [structuredClone(baseRacewayPurchase)] });
    const { issues, recalculated } = calc(p, { ...catalogs, settings: st });
    assert.ok(has(issues, "channel_letter_rate_unavailable"));
    assert.equal(recalculated.letter_purchases[0].__held, true);
  });
  check("held: malformed design fee → aggregate-only hold, rows stay live", () => {
    const p = mkProject({ letters_design_fee: "abc" });
    const { issues, recalculated } = calc(p);
    const i = find(issues, "channel_fee_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "letters_design_fee");
    assert.equal(recalculated.letter_purchases[0].__held, undefined, "purchase rows not poisoned");
    assert.equal(recalculated.letters_subtotal, null);
    assert.equal(recalculated.total_letters_cost, null);
  });
  check("held: malformed letters markup → markup issue + null letters total", () => {
    const p = mkProject({ letters_markup_percent: "zzz" });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_letters_markup_unavailable"));
    assert.equal(recalculated.total_letters_cost, null);
    assert.equal(recalculated.total_cost, null);
  });
  check("held: delivery fee still flagged when a non-dimensional row exists", () => {
    const p = mkProject({ letters_delivery_fee: "abc" });
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_fee_unavailable"));
  });
  check("valid: delivery fee is NOT consumed for all-dimensional projects", () => {
    const st = { ...settings,
      cnc_machine_rate: 80, cnc_labor_rate: 45, cnc_setup_time_percentage: 0.1, cnc_letter_perimeter_factor: 1.2,
      cnc_cut_speed_1_4: 50 };
    const p = mkProject({ letter_purchases: [structuredClone(baseDimPurchase)], letters_delivery_fee: "abc" });
    const { issues } = calc(p, { ...catalogs, settings: st });
    assert.ok(!has(issues, "channel_fee_unavailable"), "delivery ignored for in-house fab");
  });
  check("held: dimensional row without fab_config → dimensional issue", () => {
    const p = mkProject({ letter_purchases: [{ ...structuredClone(baseDimPurchase), fab_config: null }] });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "dimensional_fab_unavailable"), JSON.stringify(codes(issues)));
    assert.equal(recalculated.letter_purchases[0].__held, true);
  });
  check("held: inactive dimensional material → material unavailable", () => {
    const st = { ...settings,
      cnc_machine_rate: 80, cnc_labor_rate: 45, cnc_setup_time_percentage: 0.1, cnc_letter_perimeter_factor: 1.2,
      cnc_cut_speed_1_4: 50 };
    const dims = [{ ...dimensionalMaterials[0], is_active: false }];
    const p = mkProject({ letter_purchases: [structuredClone(baseDimPurchase)] });
    const { issues } = calc(p, { ...catalogs, settings: st, dimensionalMaterials: dims });
    const i = find(issues, "dimensional_material_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.inventoryId, "dm1");
  });
  check("held: dimensional fab + missing CNC settings → setting issue", () => {
    const p = mkProject({ letter_purchases: [structuredClone(baseDimPurchase)] });
    const { issues } = calc(p); // baseline settings carry no CNC keys
    assert.ok(has(issues, "dimensional_setting_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: dangling standoff inventory ref → material unavailable", () => {
    const p = mkProject({
      letter_purchases: [{
        ...structuredClone(baseDimPurchase), backer_enabled: true,
        backer_fab_config: { material_id: "dm1", cutting_method: "cnc", width_inches: 24, height_inches: 12, unit_total_cost: 30, material_thickness_inches: 0.25, material_type: "acrylic", paint_letters: false },
        backer_standoff_inventory_id: "gone", backer_standoff_qty: 4,
      }],
    });
    const st = { ...settings,
      cnc_machine_rate: 80, cnc_labor_rate: 45, cnc_setup_time_percentage: 0.1, cnc_letter_perimeter_factor: 1.2,
      cnc_cut_speed_1_4: 50 };
    const { issues } = calc(p, { ...catalogs, settings: st });
    const i = find(issues, "channel_material_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.inventoryId, "gone");
  });

  // ---------- install items: authored + catalog issues ----------
  check("held: unknown installation_type → type issue + row held", () => {
    const p = mkProject(); p.items[0].installation_type = "skyhook";
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_item_type_unavailable"));
    assert.equal(recalculated.items[0].__held, true);
    assert.equal(recalculated.labor_cost, null);
    assert.equal(recalculated.total_cost, null);
  });
  check("held: qty_letters 0 on flush mount → qty issue", () => {
    const p = mkProject(); p.items[0].qty_letters = 0;
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_item_qty_unavailable"));
  });
  check("held: invalid letter_size → size issue (medium defaults hidden)", () => {
    const p = mkProject(); p.items[0].letter_size = "jumbo";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_item_size_unavailable"));
  });
  check("held: raceway item missing length → raceway length issue", () => {
    const p = mkProject({ items: [{ ...structuredClone(baseItem), installation_type: "raceway", qty_letters: 0, raceway_length_feet: "" }] });
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_raceway_length_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: malformed installation_height_feet → height issue", () => {
    const p = mkProject(); p.items[0].installation_height_feet = "abc";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_item_height_unavailable"));
  });
  check("held: unsupported install_environment → env issue", () => {
    const p = mkProject(); p.items[0].install_environment = "rooftop";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_item_env_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: missing install_labor_rate → catalog rate issue poisons item", () => {
    const st = { ...settings }; delete st.install_labor_rate;
    const { issues, recalculated } = calc(mkProject(), { ...catalogs, settings: st });
    const i = find(issues, "channel_install_rate_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.kind, "channel_catalog");
    assert.equal(i.field, "install_labor_rate");
    assert.equal(recalculated.items[0].__held, true);
    assert.equal(recalculated.labor_cost, null);
  });
  check("held: missing qualified size-rate minutes → minutes issue", () => {
    const st = { ...settings }; delete st.install_drill_rate_medium__exterior__h0_12;
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    const i = find(issues, "channel_install_minutes_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "install_drill_rate_medium__exterior__h0_12");
  });
  check("held: legacy size-rate key satisfies the minutes check (no issue)", () => {
    const st = { ...settings };
    delete st.install_drill_rate_medium__exterior__h0_12;
    st.install_drill_rate_medium = 50; // legacy fallback
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    const hits = issues.filter(i => i.code === "channel_install_minutes_unavailable" && String(i.field).includes("drill"));
    assert.equal(hits.length, 0, JSON.stringify(codes(issues)));
  });
  check("held: malformed qualified minutes (even w/ legacy present) → issue", () => {
    const st = { ...settings, install_drill_rate_medium__exterior__h0_12: "abc", install_drill_rate_medium: 50 };
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    const i = find(issues, "channel_install_minutes_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "install_drill_rate_medium__exterior__h0_12");
  });
  check("held: malformed wall multiplier → wall multiplier issue", () => {
    const st = { ...settings, install_wall_eifs_multiplier: "abc" };
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    assert.ok(has(issues, "channel_wall_multiplier_unavailable"));
  });
  check("held: unknown wall material id → wall material issue (1.0x hidden)", () => {
    const p = mkProject(); p.items[0].wall_material = "adamantium";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_wall_material_unavailable"));
  });
  check("held: escort on + missing escort multiplier → condition issue", () => {
    const st = { ...settings }; delete st.install_escort_multiplier;
    const p = mkProject(); p.items[0].escort_required = true;
    const { issues } = calc(p, { ...catalogs, settings: st });
    const i = find(issues, "channel_condition_setting_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "install_escort_multiplier");
  });
  check("held: poor site access + missing level minutes → condition issue", () => {
    const st = { ...settings }; delete st.install_site_access_level_1;
    const p = mkProject(); p.items[0].poor_site_access = true; p.items[0].poor_site_access_severity = 1;
    const { issues } = calc(p, { ...catalogs, settings: st });
    assert.ok(has(issues, "channel_condition_setting_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: severity out of range → severity issue", () => {
    const p = mkProject(); p.items[0].poor_site_access = true; p.items[0].poor_site_access_severity = 99;
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_item_severity_unavailable"));
  });
  check("held: material linked to missing inventory → material unavailable", () => {
    const p = mkProject();
    p.items[0].materials = [{ ...structuredClone(baseMaterial), inventory_item_id: "gone" }];
    const { issues, recalculated } = calc(p);
    const i = find(issues, "channel_material_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.inventoryId, "gone");
    assert.equal(recalculated.items[0].__held, true);
  });
  check("held: material inventory missing price → material price issue", () => {
    const inv = [{ ...inventory[0] }]; delete inv[0].cost_per_letter;
    const p = mkProject(); p.items[0].materials = [structuredClone(baseMaterial)];
    const { issues } = calc(p, { ...catalogs, inventory: inv });
    const i = find(issues, "channel_material_price_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.inventoryId, "m1");
  });
  check("held: per_letter_by_size uses the size-specific cost field", () => {
    const inv = [{ id: "m2", item_name: "By-size clips", pricing_mode: "per_letter_by_size", is_default: false }]; // no cost_medium
    const p = mkProject();
    p.items[0].materials = [{ inventory_item_id: "m2", item_name: "By-size clips", pricing_mode: "per_letter_by_size", unit_cost: 0, quantity: 10, total_cost: 0 }];
    const { issues } = calc(p, { ...catalogs, inventory: inv });
    const i = find(issues, "channel_material_price_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "cost_medium");
  });
  check("held: custom material malformed unit_cost → material value issue", () => {
    const p = mkProject();
    p.items[0].materials = [{ item_name: "Custom bracket", unit_cost: "abc", quantity: 4 }];
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_material_value_unavailable"));
  });
  check("held: raceway hardware in install materials → mode issue (Letters owns it)", () => {
    const inv = [...inventory, { id: "rw1", item_name: "Raceway 8ft", pricing_mode: "per_raceway_foot", cost_per_foot: 20 }];
    const p = mkProject();
    p.items[0].materials = [{ inventory_item_id: "rw1", item_name: "Raceway 8ft", pricing_mode: "per_raceway_foot", unit_cost: 20, quantity: 8, total_cost: 160 }];
    const { issues } = calc(p, { ...catalogs, inventory: inv });
    assert.ok(has(issues, "channel_material_mode_unavailable"), JSON.stringify(codes(issues)));
  });

  // ---------- equipment / personnel / travel ----------
  check("held: equipment row without equipment_id → unassigned issue", () => {
    const p = mkProject({ selected_equipment: [{ equipment_name: "Loose row", pricing_mode: "per_day", duration: 1, unit_cost: 10, total_cost: 10 }] });
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_equipment_unassigned"));
  });
  check("held: dangling equipment_id → equipment unavailable", () => {
    const p = mkProject({ selected_equipment: [{ equipment_id: "gone", equipment_name: "Ghost", pricing_mode: "per_day", duration: 1, unit_cost: 10, total_cost: 10 }] });
    const { issues } = calc(p);
    const i = find(issues, "channel_equipment_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.inventoryId, "gone");
  });
  check("held: equipment missing price → catalog price issue", () => {
    const eq = [{ ...equipmentInventory[0] }]; delete eq[0].cost_per_day;
    const { issues } = calc(mkProject(), { ...catalogs, equipmentInventory: eq });
    const i = find(issues, "channel_equipment_price_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "cost_per_day");
  });
  check("held: unsupported equipment pricing_mode → mode issue", () => {
    const eq = [{ ...equipmentInventory[0], pricing_mode: "per_fortnight" }];
    const { issues } = calc(mkProject(), { ...catalogs, equipmentInventory: eq });
    assert.ok(has(issues, "channel_equipment_mode_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: blank equipment duration → duration issue (0 periods bills $0)", () => {
    const p = mkProject(); p.selected_equipment[0].duration = "";
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_equipment_duration_unavailable"));
  });
  check("held: malformed equipment total_cost → equipment value issue + null rollup", () => {
    const p = mkProject(); p.selected_equipment[0].total_cost = "abc";
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_equipment_value_unavailable"));
    assert.equal(recalculated.total_equipment_cost, null);
    assert.equal(recalculated.subtotal, null);
    assert.equal(recalculated.total_cost, null);
  });
  check("held: personnel hours>0 + missing rate → rate issue + null rollup", () => {
    const p = mkProject({ personnel: [{ role: "Installer", name: "Jo", hourly_rate: "", hours: 8, total_cost: 0 }] });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_personnel_rate_unavailable"));
    assert.equal(recalculated.total_personnel_cost, null);
  });
  check("held: malformed personnel total_cost → personnel cost issue", () => {
    const p = mkProject(); p.personnel[0].total_cost = "abc";
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_personnel_cost_unavailable"));
    assert.equal(recalculated.total_personnel_cost, null);
  });
  check("held: crew role present + missing role rate → catalog rate issue", () => {
    const st = { ...settings }; delete st.install_installer_rate;
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    assert.ok(has(issues, "channel_install_rate_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: miles set + missing fuel price → travel setting issue", () => {
    const st = { ...settings }; delete st.install_gasoline_price_per_gallon;
    const { issues } = calc(mkProject(), { ...catalogs, settings: st });
    const i = find(issues, "channel_travel_setting_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.field, "install_gasoline_price_per_gallon");
  });
  check("held: miles set + owned truck missing mpg → vehicle mpg issue", () => {
    const eq = [{ id: "tk1", equipment_name: "F-250", equipment_type: "truck", ownership: "owned", pricing_mode: "owned_flat", cost_flat: 0, mpg: "" }];
    const p = mkProject({
      selected_equipment: [{ equipment_id: "tk1", equipment_name: "F-250", pricing_mode: "owned_flat", unit_cost: 0, total_cost: 0 }],
    });
    const { issues } = calc(p, { ...catalogs, equipmentInventory: eq });
    assert.ok(has(issues, "channel_vehicle_mpg_unavailable"), JSON.stringify(codes(issues)));
  });
  check("valid: miles set + owned truck WITH mpg → no vehicle issue", () => {
    const eq = [equipmentInventory[1]]; // tk1 has mpg 14
    const p = mkProject({
      selected_equipment: [{ equipment_id: "tk1", equipment_name: "F-250", pricing_mode: "owned_flat", unit_cost: 0, total_cost: 0 }],
    });
    const { issues } = calc(p, { ...catalogs, equipmentInventory: eq });
    assert.ok(!has(issues, "channel_vehicle_mpg_unavailable"), JSON.stringify(codes(issues)));
  });
  check("held: malformed miles → miles issue", () => {
    const p = mkProject({ travel_miles_round_trip: "abc" });
    const { issues } = calc(p);
    assert.ok(has(issues, "channel_travel_miles_unavailable"));
  });
  check("held: malformed stored travel cost → travel issue + null rollup", () => {
    const p = mkProject({ total_travel_cost: "abc" });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_travel_cost_unavailable"));
    assert.equal(recalculated.total_travel_cost, null);
    assert.equal(recalculated.subtotal, null);
  });
  check("valid: zero mileage does not demand travel settings", () => {
    const st = { ...settings };
    delete st.install_gasoline_price_per_gallon;
    delete st.install_diesel_price_per_gallon;
    delete st.install_travel_labor_rate;
    delete st.install_travel_avg_speed_mph;
    const p = mkProject({ travel_miles_round_trip: 0, total_travel_cost: 0 });
    const { issues, held } = calc(p, { ...catalogs, settings: st });
    assert.equal(held, false, JSON.stringify(issues));
  });

  // ---------- project cost knobs ----------
  check("held: malformed supplies % → supplies issue + null supplies/subtotal", () => {
    const p = mkProject({ supplies_percent_of_materials: "abc" });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_supplies_percent_unavailable"));
    assert.equal(recalculated.total_supplies_cost, null);
    assert.equal(recalculated.subtotal, null);
    assert.equal(recalculated.total_cost, null);
  });
  check("held: malformed extra supplies → supplies issue", () => {
    const p = mkProject({ extra_supplies_cost: "zzz" });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_extra_supplies_unavailable"));
    assert.equal(recalculated.total_supplies_cost, null);
  });
  check("held: malformed project markup → markup issue + null markup/total", () => {
    const p = mkProject({ markup_percent: "zzz" });
    const { issues, recalculated } = calc(p);
    assert.ok(has(issues, "channel_markup_unavailable"));
    assert.equal(recalculated.markup_amount, null);
    assert.equal(recalculated.total_cost, null);
    assert.ok(Number.isFinite(recalculated.subtotal), "subtotal itself stays real");
  });

  // ---------- null propagation boundaries ----------
  check("held: install item hold poisons labor/materials/subtotal, not letters", () => {
    const p = mkProject(); p.items[0].qty_letters = "";
    const { recalculated } = calc(p);
    assert.equal(recalculated.items[0].__held, true);
    assert.equal(recalculated.labor_cost, null);
    assert.equal(recalculated.labor_hours, null);
    assert.equal(recalculated.total_materials_cost, null);
    assert.equal(recalculated.subtotal, null);
    assert.equal(recalculated.total_cost, null);
    assert.ok(Number.isFinite(recalculated.total_letters_cost), "letters side unaffected");
    assert.ok(Number.isFinite(recalculated.total_equipment_cost), "equipment unaffected");
  });
  check("held: held purchase row passes through RAW (no laundering, no mutation)", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "abc";
    const before = structuredClone(p.letter_purchases[0]);
    const { recalculated } = calc(p);
    const row = recalculated.letter_purchases[0];
    assert.equal(row.__held, true);
    assert.equal(row.qty, "abc", "raw malformed value preserved");
    assert.equal(row.total_cost, undefined, "no fabricated calc field");
    assert.deepEqual({ ...row, __held: undefined }, { ...before, __held: undefined });
    // source project untouched
    assert.equal(p.letter_purchases[0].total_cost, undefined);
    assert.equal(p.letter_purchases[0].__held, undefined);
  });
  check("held: source install items + materials never mutated", () => {
    const p = mkProject(); p.items[0].qty_letters = "";
    const snap = structuredClone(p);
    calc(p);
    assert.deepEqual(p, snap, "project object graph untouched by calc");
  });

  // ---------- acknowledged saved snapshots ----------
  check("snapshot: held letters + saved subtotal surfaces, then recomposes downstream", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "";
    const saved = { ...p, letters_subtotal: 1083.5, total_letters_cost: 9999 };
    const { recalculated } = calc(p, catalogs, saved);
    assert.equal(recalculated.letters_subtotal, 1083.5, "saved acknowledged subtotal surfaces");
    // total_letters_cost recomposes from the surfaced subtotal × live markup —
    // the live composition beats the stale saved 9999.
    assert.ok(Math.abs(recalculated.total_letters_cost - 1083.5 * 1.1) < 1e-6);
    assert.ok(recalculated.pricingUnavailable);
  });
  check("snapshot: held component with no own fallback → saved aggregate fills the hole", () => {
    const p = mkProject(); p.selected_equipment[0].total_cost = "abc";
    // saved snapshot carries NO total_equipment_cost → subtotal can't compose →
    // the acknowledged saved subtotal surfaces directly (labeled upstream).
    const saved = { ...p, subtotal: 3000, markup_amount: 600, total_cost: 3600 };
    const { recalculated } = calc(p, catalogs, saved);
    assert.equal(recalculated.total_equipment_cost, null, "no saved equipment value → stays null");
    assert.equal(recalculated.subtotal, 3000, "saved acknowledged subtotal surfaces");
    assert.equal(recalculated.markup_amount, 600);
    assert.equal(recalculated.total_cost, 3600);
  });
  check("snapshot: held project with NO saved totals → honest nulls", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "";
    const { recalculated } = calc(p);
    assert.equal(recalculated.letters_subtotal, null);
    assert.equal(recalculated.total_cost, null);
  });
  check("snapshot: saved totals carried on the project itself are honored", () => {
    // Page passes savedProject: project — stored acknowledged values on the
    // record itself are the fallback source.
    const p = mkProject({ letters_subtotal: 500 });
    p.letter_purchases[0].qty = "";
    const { recalculated } = calc(p);
    assert.equal(recalculated.letters_subtotal, 500, "stored acknowledged subtotal surfaces");
    // Downstream recomposes: 500 × live 10% markup = 550 letters total.
    assert.ok(Math.abs(recalculated.total_letters_cost - 550) < 1e-6);
  });
  check("snapshot: live finite value always beats the saved snapshot", () => {
    const p = mkProject();
    const saved = { ...p, total_cost: 9999, letters_subtotal: 9999 };
    const { recalculated, held } = calc(p, catalogs, saved);
    assert.equal(held, false);
    assert.notEqual(recalculated.total_cost, 9999);
    assert.equal(recalculated.total_cost, expectedFor(p).total_cost);
  });
  check("snapshot: explicit saved $0 stays a real zero", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "";
    const saved = { ...p, letters_subtotal: 0, total_letters_cost: 0 };
    const { recalculated } = calc(p, catalogs, saved);
    assert.equal(recalculated.letters_subtotal, 0, "saved $0 is a real acknowledged zero");
    assert.equal(recalculated.total_letters_cost, 0);
    // Live components (equipment/personnel/travel) still compose the rollup —
    // the saved $0 only fills the held letters hole.
    assert.ok(recalculated.subtotal > 0);
  });
  check("snapshot: non-finite saved totals are NOT trusted", () => {
    const p = mkProject(); p.letter_purchases[0].qty = "";
    const saved = { ...p, letters_subtotal: "abc", total_cost: NaN, subtotal: Infinity };
    const { recalculated } = calc(p, catalogs, saved);
    assert.equal(recalculated.letters_subtotal, null);
    assert.equal(recalculated.total_cost, null);
    assert.equal(recalculated.subtotal, null);
  });

  // ---------- helpers + issue shape ----------
  check("helpers: issuesForField + hasIssueFor filter by field/index/itemIndex", () => {
    const p = mkProject(); p.items[0].qty_letters = "";
    const { issues } = calc(p);
    assert.ok(M.hasIssueFor(issues, "qty_letters", null, 0));
    assert.ok(!M.hasIssueFor(issues, "qty_letters", null, 5));
    assert.ok(!M.hasIssueFor(issues, "nonexistent_field"));
  });
  check("issue shape: kind/index/field/code/message/hold on every record", () => {
    const p = mkProject(); p.letter_purchases[0].qty = ""; p.items[0].qty_letters = 0;
    const { issues } = calc(p, { ...catalogs, settings: { ...settings, install_labor_rate: "abc" } });
    for (const i of issues) {
      assert.ok(["channel", "channel_catalog"].includes(i.kind), i.kind);
      assert.equal(typeof i.field, "string");
      assert.match(i.code, /^(channel_|dimensional_)/);
      assert.ok(i.message.length > 10);
      assert.ok(i.hold);
    }
  });
  check("empty settings short-circuits like the page (no calc, no issues)", () => {
    const { recalculated, issues, held } = M.calcChannelProject({ project: mkProject(), settings: {} });
    assert.equal(held, false);
    assert.equal(issues.length, 0);
    assert.equal(recalculated.letter_purchases[0].total_cost, undefined, "no calc ran");
  });

  // ---------- contrast: same input, remote chain launders ----------
  check("contrast: remote chain prices missing-rate letters at a hidden default", () => {
    const st = { ...settings }; delete st.letters_channel_flush_per_inch;
    const p = mkProject();
    const remote = R.calcLettersTotals(p, st);
    const expected = 5 * 24 * 9.03 + 25; // hidden DEFAULT 9.03 + delivery
    assert.ok(Math.abs(remote.letters_subtotal - expected) < 1e-6, "remote silently used the Excel default");
    const { recalculated } = calc(p, { ...catalogs, settings: st });
    assert.equal(recalculated.letters_subtotal, null, "candidate refuses the hidden default");
  });
  check("contrast: remote rollup launders a malformed supplies % to the 10% default", () => {
    const p = mkProject({ supplies_percent_of_materials: "abc" });
    const swe = { ...settings, _project_install_environment: "exterior" };
    const lt = R.calcLettersTotals(p, swe);
    const items2 = p.items.map(it => R.calcLineItem(it, swe, inventory));
    const totals = R.calcProjectTotals({ ...p, ...lt, items: items2 });
    assert.ok(Math.abs(totals.total_supplies_cost - totals.total_materials_cost * 0.10) < 1e-9, "remote silently used 10%");
    assert.ok(totals.total_cost > 0, "remote produced a confident total anyway");
    const { recalculated } = calc(p);
    assert.equal(recalculated.total_supplies_cost, null);
    assert.equal(recalculated.total_cost, null);
  });
  check("contrast: remote line item launders blank qty to $0 labor", () => {
    const it = { ...structuredClone(baseItem), qty_letters: "" };
    const remote = R.calcLineItem(it, { ...settings }, inventory);
    assert.equal(remote.labor_hours, 0, "remote silently priced 0 letters");
    assert.equal(remote.labor_cost, 0);
    const p = mkProject(); p.items[0].qty_letters = "";
    const { recalculated } = calc(p);
    assert.equal(recalculated.labor_cost, null);
  });
} else {
  // ---------- RED: frozen remote implementation launders everything ----------
  check("RED: remote letters calc silently uses hidden per-inch default", () => {
    const st = { ...settings }; delete st.letters_channel_flush_per_inch;
    const r = R.calcLettersTotals(mkProject(), st);
    assert.ok(r.letters_subtotal > 0, "remote produced a confident subtotal off a hidden default");
    assert.ok(Math.abs(r.letter_purchases[0].unit_cost - 9.03) < 1e-9, "unit price came from the Excel default, not the record");
  });
  check("RED: remote purchase calc launders blank qty to $0", () => {
    const r = R.calcLetterPurchase({ ...basePurchase, qty: "" }, settings);
    assert.equal(r.total_cost, 0, "remote laundered blank qty → $0 row");
  });
  check("RED: remote purchase calc launders blank raceway length to $0", () => {
    const r = R.calcLetterPurchase({ ...baseRacewayPurchase, size_value: "" }, settings);
    assert.equal(r.total_cost, 0, "remote laundered blank length → $0 raceway");
  });
  check("RED: remote letters calc drops a malformed fee silently", () => {
    const p = mkProject({ letters_design_fee: "abc" });
    const r = R.calcLettersTotals(p, settings);
    const withFee = R.calcLettersTotals(mkProject({ letters_design_fee: 150 }), settings);
    assert.equal(r.letters_subtotal, withFee.letters_subtotal - 150, "'abc' fee silently became $0");
  });
  check("RED: remote line item uses hidden 65/hr labor default", () => {
    const st = { ...settings }; delete st.install_labor_rate;
    const r = R.calcLineItem(structuredClone(baseItem), st, inventory);
    const withRate = R.calcLineItem(structuredClone(baseItem), { ...st, install_labor_rate: 65 }, inventory);
    assert.equal(r.labor_cost, withRate.labor_cost, "remote silently priced at the hardcoded 65 default");
  });
  check("RED: remote line item launders blank qty_letters to $0 labor", () => {
    const r = R.calcLineItem({ ...structuredClone(baseItem), qty_letters: "" }, settings, inventory);
    assert.equal(r.labor_hours, 0);
    assert.equal(r.labor_cost, 0, "remote laundered blank qty → $0 labor");
  });
  check("RED: remote line item uses hidden size-rate defaults", () => {
    const st = { ...settings };
    delete st.install_drill_rate_medium__exterior__h0_12;
    delete st.install_prep_rate_medium__exterior__h0_12;
    delete st.install_electrical_rate_medium__exterior__h0_12;
    const r = R.calcLineItem(structuredClone(baseItem), st, inventory);
    // TYPE_DEFAULTS medium flush = [50,100,15] → 165min × 10 letters / 60 × $65 × 1.0 wall
    const expected = 10 * (165 / 60) * 65;
    assert.ok(Math.abs(r.labor_cost - expected) < 1e-6, `remote silently used hardcoded [50,100,15] (got ${r.labor_cost})`);
  });
  check("RED: remote line item launders malformed material cost to $0", () => {
    const it = { ...structuredClone(baseItem), materials: [{ item_name: "Custom", unit_cost: "abc", quantity: 4 }] };
    const r = R.calcLineItem(it, settings, inventory);
    assert.equal(r.materials_cost, 0, "remote laundered 'abc' → $0 material");
  });
  check("RED: remote rollup launders malformed equipment total to $0", () => {
    const p = { items: [], selected_equipment: [{ equipment_name: "Boom", total_cost: "abc" }], personnel: [], total_travel_cost: 0, supplies_percent_of_materials: 0, extra_supplies_cost: 0, markup_percent: 0, total_letters_cost: 0 };
    const r = R.calcProjectTotals(p);
    assert.equal(r.total_equipment_cost, 0, "remote laundered 'abc' → $0 equipment");
    assert.equal(r.total_cost, 0, "remote produced a confident $0 total");
  });
  check("RED: remote rollup launders malformed supplies % to the 10% default", () => {
    const p = { items: [{ materials_cost: 200, labor_cost: 0, labor_hours: 0 }], selected_equipment: [], personnel: [], total_travel_cost: 0, supplies_percent_of_materials: "abc", extra_supplies_cost: 0, markup_percent: 0, total_letters_cost: 0 };
    const r = R.calcProjectTotals(p);
    assert.equal(r.total_supplies_cost, 20, "remote silently applied the 10% default to 'abc'");
  });
  check("RED: remote rollup launders malformed travel cost to $0", () => {
    const p = { items: [], selected_equipment: [], personnel: [], total_travel_cost: "abc", supplies_percent_of_materials: 0, extra_supplies_cost: 0, markup_percent: 0, total_letters_cost: 0 };
    const r = R.calcProjectTotals(p);
    assert.equal(r.total_travel_cost, 0, "remote laundered 'abc' → $0 travel");
  });
  check("RED: remote rollup launders missing letters total to $0", () => {
    const p = { items: [], selected_equipment: [], personnel: [], total_travel_cost: 0, supplies_percent_of_materials: 0, extra_supplies_cost: 0, markup_percent: 0 };
    const r = R.calcProjectTotals(p);
    assert.equal(r.subtotal, 0, "absent letters pricing silently contributes $0");
  });
  check("RED: remote line item prices unknown type at flush-mount defaults", () => {
    const r = R.calcLineItem({ ...structuredClone(baseItem), installation_type: "skyhook" }, settings, inventory);
    const flush = R.calcLineItem({ ...structuredClone(baseItem), installation_type: "flush_mount" }, settings, inventory);
    assert.equal(r.labor_cost, flush.labor_cost, "remote silently priced an unknown type as flush mount");
  });
}

const failed = results.filter(r => !r.ok);
const artifact = {
  mode: MODE,
  generatedAt: new Date().toISOString(),
  totalChecks: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  candidateBundleInputs: Object.keys(candBuild.metafile.inputs),
  frozenBundleInputs: MODE === "red" ? Object.keys(redBuild.metafile.inputs) : undefined,
  availabilitySha256: hash(read(E + "candidates/src/components/channelLetterInstall/channelLetterPricingAvailability.js")),
  results,
};
fs.writeFileSync(E + (MODE === "red" ? "channel-model-red-verification.json" : "channel-model-verification.json"), JSON.stringify(artifact, null, 1));
console.log(JSON.stringify({ mode: MODE, total: results.length, failed: failed.length }));
if (failed.length) process.exit(1);
