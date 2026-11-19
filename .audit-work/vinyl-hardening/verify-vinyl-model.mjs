// Vinyl pricing-availability hardening — model verification.
// Bundles the real remote calculator + candidate availability layer + hardened
// helpers in Node (no browser, no SDK, no network) and runs the fixture
// matrix. --mode=red repeats the key cases against the FROZEN remote helpers
// to prove the permissive $0/drop laundering the hardening removes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const E = ".audit-work/vinyl-hardening/";
const MODE = process.argv.includes("--mode=red") ? "red" : "candidate";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (p) => fs.readFileSync(p, "utf8");
const remoteSrc = (p) => read(E + "remote-src/" + p);
const candidate = (n) => read(E + "vinyl-pricing-candidate-" + n);

// ---------- frozen source map ----------
const V = "/app/src/components/vinylEstimator/";
const I = "/app/src/components/vinylInventory/";
const remote = {
  [V + "vinylNestingCalculator.jsx"]: remoteSrc("src/components/vinylEstimator/vinylNestingCalculator.jsx"),
  [V + "vinylProjectHelpers.jsx"]: remoteSrc("src/components/vinylEstimator/vinylProjectHelpers.jsx"),
  [V + "vinylCostHelpers.jsx"]: remoteSrc("src/components/vinylEstimator/vinylCostHelpers.jsx"),
  [I + "vinylConstants.jsx"]: remoteSrc("src/components/vinylInventory/vinylConstants.jsx"),
};
const entry = "/app/model-entry.js";
const mkSources = (withCandidates) => {
  const sources = new Map(Object.entries(remote));
  if (withCandidates) {
    sources.set(V + "vinylPricingAvailability.js", candidate("vinylPricingAvailability.js"));
    sources.set(V + "vinylProjectHelpers.jsx", candidate("vinylProjectHelpers.jsx"));
    sources.set(V + "vinylCostHelpers.jsx", candidate("vinylCostHelpers.jsx"));
    sources.set(entry, `
      export { calcVinylWorkflow, vinylWorkflowIssues, vinylProjectInputIssues,
        vinylMaterialIssues, vinylNumber, vinylNonNegativeNumber, vinylPositiveNumber,
        hasVinylCostSnapshot, vinylDraftValue, issuesForField, hasIssueFor }
        from "${V}vinylPricingAvailability.js";
      export { rollupVinylProject, sumWorkflowField, blankWorkflow, blankVinylProject, migrateProject }
        from "${V}vinylProjectHelpers.jsx";
      export { computeWorkflowMetrics, computeStockUsage, computePerPartCosts }
        from "${V}vinylCostHelpers.jsx";
      export { calculateVinylProject } from "${V}vinylNestingCalculator.jsx";
    `);
  } else {
    sources.set(entry, `
      export { rollupVinylProject, sumWorkflowField, blankWorkflow, blankVinylProject, migrateProject }
        from "${V}vinylProjectHelpers.jsx";
      export { computeWorkflowMetrics, computeStockUsage, computePerPartCosts }
        from "${V}vinylCostHelpers.jsx";
      export { calculateVinylProject } from "${V}vinylNestingCalculator.jsx";
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

// ---------- fixture ----------
const baseVinyl = { id: "v1", vinyl_name: "Cast 54", roll_width_inches: 54, roll_length_yards: 50, pricing_mode: "per_sqft", cost_per_sqft: 0.5, waste_factor_percent: "" };
const baseLaminate = { id: "l1", vinyl_name: "Cast Lam", is_laminate: true, roll_width_inches: 54, roll_length_yards: 50, pricing_mode: "per_sqft", cost_per_sqft: 0.3 };
const baseTT = { id: "t1", vinyl_name: "App Tape", vinyl_category: "transfer_tape", roll_width_inches: 48, pricing_mode: "per_roll", cost_per_roll: 60, roll_length_yards: 100 };
const basePrinter = {
  id: "p1", machine_name: "Printer", machine_type: "printer",
  machine_hourly_rate: 35, print_speed_sqft_per_hour: 400,
  warmup_minutes: 2, media_load_minutes: 1, calibration_minutes_per_job: 1,
  print_cost_per_sqin: 0.002, print_cost_per_sqin_high_quality: 0.003,
  operator_hourly_rate: 45,
  left_margin_inches: 0.5, right_margin_inches: 0.5,
  leading_edge_inches: 4, trailing_edge_inches: 2,
  default_gutter_horizontal_inches: 0.25, default_gutter_vertical_inches: 0.25,
  default_bleed_inches: 0.125, max_media_width_inches: 54,
};
const baseCutter = {
  id: "c1", machine_name: "Cutter", machine_type: "cutter",
  machine_hourly_rate: 25, cut_speed_inches_per_second: 30,
  cut_setup_minutes_per_job: 2, cut_blade_life_minutes: 6000, cut_blade_cost: 12,
  cut_pull_off_inches_per_job: 6, operator_hourly_rate: 45,
  max_media_width_inches: 48,
};
const baseLaminator = { id: "lm1", machine_name: "Laminator", machine_type: "laminator", laminator_hourly_rate: 20, laminator_speed_inches_per_minute: 100, laminator_setup_minutes_per_job: 3 };
const baseItem = { id: "i1", description: "Decal", width_inches: 12, height_inches: 8, quantity: 2, bleed_inches: 0.125 };
const mkWf = (over = {}) => ({
  id: "wf1", name: "W1",
  vinyl_id: "v1", laminate_id: "", transfer_tape_id: "",
  printer_id: "p1", cutter_id: "c1", laminator_id: "",
  apply_print: true, apply_cut: true, apply_laminate: false, apply_transfer_tape: false,
  print_quality: "", weeding_difficulty: "moderate",
  weeding_minutes_per_part_override: "", install_minutes_per_part: "",
  spoilage_buffer_percent: "", setup_fee_floor: "",
  gutter_h_override: "", gutter_v_override: "",
  items: [structuredClone(baseItem)], personnel: [],
  ...over,
});
const catalogs = { vinyls: [baseVinyl, baseLaminate, baseTT], machines: [basePrinter, baseCutter, baseLaminator] };

const results = [];
const check = (id, fn) => {
  try { fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 800) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 250)); }
};
const codes = (issues) => issues.map(i => i.code);
const has = (issues, code) => issues.some(i => i.code === code);
const calc = (wf, cat = catalogs, idx = 0) => M.calcVinylWorkflow({ workflow: wf, ...cat, index: idx });

if (MODE === "candidate") {
  // ---------- strict parsers ----------
  check("parser: numbers + numeric strings pass", () => {
    assert.equal(M.vinylNumber(12.5), 12.5);
    assert.equal(M.vinylNumber("12.5"), 12.5);
    assert.equal(M.vinylNumber(" 8 "), 8);
    assert.equal(M.vinylNumber(0), 0);
    assert.equal(M.vinylNumber("0"), 0);
  });
  check("parser: malformed → null", () => {
    for (const v of ["", "abc", "12x", Infinity, NaN, null, undefined, {}, [], " ", "0x10"]) {
      assert.equal(M.vinylNumber(v), null, `vinylNumber(${JSON.stringify(v)})`);
    }
  });
  check("parser: nonneg/positive gates", () => {
    assert.equal(M.vinylNonNegativeNumber(0), 0);
    assert.equal(M.vinylNonNegativeNumber(-1), null);
    assert.equal(M.vinylPositiveNumber(0), null);
    assert.equal(M.vinylPositiveNumber(0.5), 0.5);
  });
  check("snapshot: only real finite numbers count", () => {
    assert.equal(M.hasVinylCostSnapshot(0), true);
    assert.equal(M.hasVinylCostSnapshot(12.5), true);
    for (const v of ["12", null, undefined, NaN, Infinity, {}, []]) assert.equal(M.hasVinylCostSnapshot(v), false);
  });
  check("draft value: blank preserved, numbers parsed, junk kept raw", () => {
    assert.equal(M.vinylDraftValue(""), "");
    assert.equal(M.vinylDraftValue("12.5"), 12.5);
    assert.equal(M.vinylDraftValue("abc"), "abc");
  });

  // ---------- valid baseline: byte-identical math ----------
  check("valid: clean workflow produces identical calc + no issues", () => {
    const wf = mkWf();
    const { calc: c, issues, held } = calc(wf);
    const raw = M.calculateVinylProject({
      items: wf.items, printer: basePrinter, cutter: baseCutter, laminator: null,
      vinyl: baseVinyl, laminate: null, transferTape: null,
      operatorHourlyRate: 45,
      applyPrint: true, applyCut: true, applyLaminate: false, applyTransferTape: false,
      overrideGutterH: undefined, overrideGutterV: undefined,
      printQuality: "high_quality", weedingDifficulty: "moderate",
      weedingMinutesPerPartOverride: "", installMinutesPerPart: "",
      personnel: [], spoilageBufferPercent: 0, setupFeeFloor: 0,
    });
    assert.equal(held, false);
    assert.equal(issues.length, 0);
    for (const k of Object.keys(raw)) assert.deepEqual(c[k], raw[k], `calc.${k} identical`);
    assert.equal(c.__held, false);
  });
  check("valid: explicit $0 price is still a real, valid zero", () => {
    const v0 = { ...baseVinyl, cost_per_sqft: 0 };
    const { calc: c, issues, held } = calc(mkWf(), { vinyls: [v0], machines: catalogs.machines });
    assert.equal(held, false, JSON.stringify(issues));
    assert.equal(c.vinylCost, 0);
    assert.ok(c.totalCost > 0, "machine+labor still priced");
  });
  check("valid: explicit $0 ink rate is still a real, valid zero", () => {
    const p0 = { ...basePrinter, print_cost_per_sqin: 0, print_cost_per_sqin_high_quality: 0, print_cost_per_sqin_draft: 0, print_cost_per_sqin_production: 0 };
    const { calc: c, issues, held } = calc(mkWf(), { vinyls: catalogs.vinyls, machines: [p0, baseCutter] });
    assert.equal(held, false, JSON.stringify(issues));
    assert.equal(c.inkCost, 0);
  });

  // ---------- catalog unavailability ----------
  check("held: missing vinyl price → flagged + null vinyl/material/total, geometry kept", () => {
    const v = { ...baseVinyl }; delete v.cost_per_sqft;
    const { calc: c, issues, held } = calc(mkWf(), { vinyls: [v], machines: catalogs.machines });
    assert.equal(held, true);
    assert.ok(has(issues, "vinyl_vinyl_price_unavailable"), JSON.stringify(codes(issues)));
    assert.equal(c.vinylCost, null);
    assert.equal(c.materialCost, null);
    assert.equal(c.totalCost, null);
    assert.ok(Number.isFinite(c.inkCost), "ink unaffected by vinyl price hold");
    assert.ok(c.shelves.length > 0, "layout rows stay visible");
    assert.equal(c.partsPlaced, 2);
  });
  check("held: missing roll width → layout poison + issue", () => {
    const v = { ...baseVinyl }; delete v.roll_width_inches;
    const { calc: c, issues } = calc(mkWf(), { vinyls: [v], machines: catalogs.machines });
    assert.ok(has(issues, "vinyl_vinyl_roll_width_unavailable"));
    assert.equal(c.vinylCost, null);
    assert.equal(c.totalCost, null);
    assert.equal(c.laborCost, null, "layout hold poisons labor too");
    assert.equal(c.usedSqFt, null);
  });
  check("held: malformed waste factor → price hold only", () => {
    const v = { ...baseVinyl, waste_factor_percent: "abc" };
    const { calc: c, issues } = calc(mkWf(), { vinyls: [v], machines: catalogs.machines });
    assert.ok(has(issues, "vinyl_vinyl_waste_factor_unavailable"));
    assert.equal(c.vinylCost, null);
    assert.ok(Number.isFinite(c.laborCost), "labor unaffected");
  });
  check("held: malformed machine hourly rate → machine hold, vinyl price stays real", () => {
    const p = { ...basePrinter, machine_hourly_rate: "abc" };
    const { calc: c, issues } = calc(mkWf(), { vinyls: catalogs.vinyls, machines: [p, baseCutter] });
    assert.ok(has(issues, "vinyl_machine_rate_unavailable"));
    assert.equal(c.printMachineCost, null);
    assert.equal(c.machineCost, null);
    assert.equal(c.totalCost, null);
    assert.ok(Number.isFinite(c.vinylCost), "vinyl price stays real");
  });
  check("held: absent machine hourly rate → same (missing is not free)", () => {
    const p = { ...basePrinter }; delete p.machine_hourly_rate;
    const { issues } = calc(mkWf(), { vinyls: catalogs.vinyls, machines: [p, baseCutter] });
    assert.ok(has(issues, "vinyl_machine_rate_unavailable"));
  });
  check("held: missing ink rate → ink hold", () => {
    const p = { ...basePrinter };
    delete p.print_cost_per_sqin; delete p.print_cost_per_sqin_high_quality;
    delete p.print_cost_per_sqin_draft; delete p.print_cost_per_sqin_production;
    const { calc: c, issues } = calc(mkWf(), { vinyls: catalogs.vinyls, machines: [p, baseCutter] });
    assert.ok(has(issues, "vinyl_ink_rate_unavailable"));
    assert.equal(c.inkCost, null);
    assert.equal(c.inkRatePerSqIn, null);
    assert.ok(Number.isFinite(c.vinylCost));
  });
  check("held: missing laminate price → laminate hold only", () => {
    const l = { ...baseLaminate }; delete l.cost_per_sqft;
    const wf = mkWf({ apply_laminate: true, laminate_id: "l1", laminator_id: "lm1" });
    const { calc: c, issues } = calc(wf, { vinyls: [baseVinyl, l], machines: catalogs.machines });
    assert.ok(has(issues, "vinyl_laminate_price_unavailable"));
    assert.equal(c.laminateCost, null);
    assert.equal(c.laminateSqFt, null);
    assert.ok(Number.isFinite(c.vinylCost));
  });

  // ---------- authored input problems ----------
  check("held: zero width → dimension issue, part row retained", () => {
    const wf = mkWf(); wf.items[0].width_inches = 0;
    const { calc: c, issues } = calc(wf);
    assert.ok(has(issues, "vinyl_part_dimension_unavailable"));
    assert.equal(issues.find(i => i.code === "vinyl_part_dimension_unavailable").itemIndex, 0);
    assert.equal(wf.items.length, 1, "raw row untouched");
    assert.equal(c.totalCost, null);
  });
  check("held: malformed width string → dimension issue", () => {
    const wf = mkWf(); wf.items[0].width_inches = "12x3";
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_part_dimension_unavailable"));
  });
  check("held: blank width → dimension issue (blank is not 0)", () => {
    const wf = mkWf(); wf.items[0].width_inches = "";
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_part_dimension_unavailable"));
  });
  check("held: fractional quantity → quantity issue (floor would silently reprice)", () => {
    const wf = mkWf(); wf.items[0].quantity = "2.7";
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_part_quantity_unavailable"));
  });
  check("held: zero quantity → quantity issue", () => {
    const wf = mkWf(); wf.items[0].quantity = 0;
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_part_quantity_unavailable"));
  });
  check("held: malformed gutter override → layout hold", () => {
    const wf = mkWf({ gutter_h_override: "abc" });
    const { calc: c, issues } = calc(wf);
    assert.ok(has(issues, "vinyl_gutter_override_unavailable"));
    assert.equal(c.totalCost, null);
  });
  check("held: malformed setup fee floor → floor hold only", () => {
    const wf = mkWf({ setup_fee_floor: "abc" });
    const { calc: c, issues } = calc(wf);
    assert.ok(has(issues, "vinyl_setup_fee_unavailable"));
    assert.equal(c.setupFeeApplied, null);
    assert.equal(c.totalCost, null);
    assert.ok(Number.isFinite(c.vinylCost), "floor hold does not poison materials");
    assert.ok(Number.isFinite(c.materialCost));
    assert.ok(Number.isFinite(c.preFloorTotal));
  });
  check("held: malformed weeding override → labor hold", () => {
    const wf = mkWf({ weeding_minutes_per_part_override: "abc" });
    const { calc: c, issues } = calc(wf);
    assert.ok(has(issues, "vinyl_weeding_override_unavailable"));
    assert.equal(c.laborCost, null);
    assert.ok(Number.isFinite(c.vinylCost));
  });
  check("held: unsupported weeding difficulty → labor hold", () => {
    const wf = mkWf({ weeding_difficulty: "impossible" });
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_weeding_difficulty_unavailable"));
  });
  check("held: personnel row hours>0 + missing rate → labor hold", () => {
    const wf = mkWf({ personnel: [{ role: "Weeder", hourly_rate: "", hours: 2 }] });
    const { calc: c, issues } = calc(wf);
    assert.ok(has(issues, "vinyl_personnel_rate_unavailable"));
    assert.equal(c.laborCost, null);
  });
  check("held: personnel row hours>0 + zero rate → labor hold ($0 labor is unavailable)", () => {
    const wf = mkWf({ personnel: [{ role: "Weeder", hourly_rate: 0, hours: 2 }] });
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_personnel_rate_unavailable"));
  });
  check("valid: dormant personnel row (no hours) does not flag", () => {
    const wf = mkWf({ personnel: [{ role: "Weeder", hourly_rate: 50, hours: "" }] });
    const { issues, held } = calc(wf);
    assert.equal(held, false, JSON.stringify(issues));
  });
  check("held: malformed operator rate + no personnel → catalog labor hold", () => {
    const p = { ...basePrinter, operator_hourly_rate: "abc" };
    const { calc: c, issues } = calc(mkWf(), { vinyls: catalogs.vinyls, machines: [p, baseCutter] });
    const i = issues.find(x => x.code === "vinyl_operator_rate_unavailable");
    assert.ok(i, JSON.stringify(codes(issues)));
    assert.equal(i.kind, "vinyl_catalog");
    assert.equal(i.inventoryId, "p1");
    assert.equal(c.laborCost, null);
  });
  check("held: applied machine unassigned → machine unassigned issue", () => {
    const wf = mkWf({ cutter_id: "" });
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_machine_unassigned"));
  });
  check("held: dangling vinyl id → material unavailable", () => {
    const wf = mkWf({ vinyl_id: "gone" });
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_material_unavailable"));
  });
  check("held: unplaced part → parts_unplaced issue + layout hold", () => {
    const wf = mkWf(); wf.items[0].width_inches = 200;
    const { calc: c, issues } = calc(wf);
    assert.ok(has(issues, "vinyl_parts_unplaced"));
    assert.ok(c.partsUnplaced > 0);
    assert.equal(c.totalCost, null);
  });
  check("valid: empty workflow is dormant — no issues", () => {
    const wf = mkWf({ items: [] });
    const { issues, held, calc: c } = calc(wf);
    assert.equal(held, false, JSON.stringify(issues));
    assert.ok(Number.isFinite(c.totalCost));
  });
  check("held: malformed floor still flags on an empty workflow (floor is consumed)", () => {
    const wf = mkWf({ items: [], setup_fee_floor: "abc" });
    const { issues } = calc(wf);
    assert.ok(has(issues, "vinyl_setup_fee_unavailable"));
  });

  // ---------- project-level issues + rollup ----------
  const baseProject = (over = {}) => ({
    project_name: "P", workflows: [], items: [],
    selected_equipment: [], personnel: [],
    travel_miles_round_trip: 0, total_travel_cost: 0,
    supplies_percent_of_materials: 5, extra_supplies_cost: 0, markup_percent: 0,
    ...over,
  });
  check("project: malformed equipment total → equipment issue + null rollup", () => {
    const p = baseProject({ selected_equipment: [{ equipment_id: "e1", equipment_name: "Boom", total_cost: "abc" }] });
    const issues = M.vinylProjectInputIssues(p, { settings: {}, equipmentInventory: [{ id: "e1", equipment_name: "Boom", equipment_type: "ladder", pricing_mode: "per_day" }] });
    assert.ok(has(issues, "vinyl_equipment_cost_unavailable"));
    const r = M.rollupVinylProject(p);
    assert.equal(r.equipmentCost, null);
    assert.equal(r.subtotal, null);
    assert.equal(r.totalCost, null);
  });
  check("project: missing personnel total → personnel issue", () => {
    const p = baseProject({ personnel: [{ role: "Installer", name: "Jo", total_cost: undefined }] });
    const issues = M.vinylProjectInputIssues(p, { settings: { install_installer_rate: 65 } });
    assert.ok(has(issues, "vinyl_personnel_cost_unavailable"));
    assert.equal(M.rollupVinylProject(p).personnelCost, null);
  });
  check("project: malformed install rate setting + crew row → setting issue", () => {
    const p = baseProject({ personnel: [{ role: "Installer", total_cost: 100 }] });
    const issues = M.vinylProjectInputIssues(p, { settings: { install_installer_rate: "abc" } });
    assert.ok(has(issues, "vinyl_install_rate_unavailable"));
  });
  check("project: miles set + malformed fuel price → travel setting issue", () => {
    const p = baseProject({ travel_miles_round_trip: 50 });
    const issues = M.vinylProjectInputIssues(p, { settings: { install_gasoline_price_per_gallon: "abc", install_diesel_price_per_gallon: 4, install_travel_labor_rate: 45, install_travel_avg_speed_mph: 55 } });
    assert.ok(has(issues, "vinyl_travel_setting_unavailable"));
  });
  check("project: miles set + owned vehicle missing mpg → vehicle issue", () => {
    const p = baseProject({ travel_miles_round_trip: 50, selected_equipment: [{ equipment_id: "v9", equipment_name: "Van", total_cost: 100 }] });
    const issues = M.vinylProjectInputIssues(p, {
      settings: { install_gasoline_price_per_gallon: 4, install_diesel_price_per_gallon: 4.5, install_travel_labor_rate: 45, install_travel_avg_speed_mph: 55 },
      equipmentInventory: [{ id: "v9", equipment_name: "Van", equipment_type: "truck", ownership: "owned", mpg: "" }],
    });
    assert.ok(has(issues, "vinyl_vehicle_mpg_unavailable"));
  });
  check("project: malformed miles → travel miles issue", () => {
    const p = baseProject({ travel_miles_round_trip: "abc" });
    const issues = M.vinylProjectInputIssues(p);
    assert.ok(has(issues, "vinyl_travel_miles_unavailable"));
  });
  check("project: malformed supplies % + markup → issues + null supplies/subtotal", () => {
    const p = baseProject({ supplies_percent_of_materials: "abc", markup_percent: "zzz" });
    const issues = M.vinylProjectInputIssues(p);
    assert.ok(has(issues, "vinyl_supplies_percent_unavailable"));
    assert.ok(has(issues, "vinyl_markup_unavailable"));
    const r = M.rollupVinylProject(p);
    assert.equal(r.baseSupplies, null);
    assert.equal(r.supplies, null);
    assert.equal(r.subtotal, null);
    assert.equal(r.totalCost, null);
  });

  // ---------- acknowledged saved snapshots ----------
  check("snapshot: held workflow falls back to SAVED totals, never invents $0", () => {
    const badVinyl = { ...baseVinyl }; delete badVinyl.cost_per_sqft;
    const wf = mkWf();
    const { calc: heldCalc } = calc(wf, { vinyls: [badVinyl], machines: catalogs.machines });
    assert.equal(heldCalc.vinylCost, null);
    const p = baseProject({
      workflows: [{ ...wf, _calc: heldCalc }],
      total_vinyl_cost: 40, total_machine_cost: 10, labor_cost: 30,
      total_supplies_cost: 4.5, base_supplies_cost: 4.5,
      total_equipment_cost: 100, total_personnel_cost: 50, total_travel_cost: 25,
      subtotal: 259.5, markup_amount: 0, total_cost: 259.5,
    });
    const r = M.rollupVinylProject(p);
    assert.equal(r.vinylCost, 40, "saved vinyl snapshot surfaces");
    assert.equal(r.materialCost, null, "no saved key → not saved");
    assert.equal(r.subtotal, 259.5);
    assert.equal(r.totalCost, 259.5);
  });
  check("snapshot: held workflow with NO saved totals → honest nulls", () => {
    const badVinyl = { ...baseVinyl }; delete badVinyl.cost_per_sqft;
    const wf = mkWf();
    const { calc: heldCalc } = calc(wf, { vinyls: [badVinyl], machines: catalogs.machines });
    const p = baseProject({ workflows: [{ ...wf, _calc: heldCalc }] });
    const r = M.rollupVinylProject(p);
    assert.equal(r.vinylCost, null);
    assert.equal(r.totalCost, null);
    assert.equal(r.subtotal, null);
  });
  check("snapshot: live finite value always beats the saved snapshot", () => {
    const wf = mkWf();
    const { calc: c } = calc(wf);
    const p = baseProject({ workflows: [{ ...wf, _calc: c }], total_cost: 9999, total_vinyl_cost: 9999 });
    const r = M.rollupVinylProject(p);
    assert.notEqual(r.totalCost, 9999);
    assert.notEqual(r.vinylCost, 9999);
  });
  check("snapshot: explicit saved $0 stays a real zero", () => {
    const wf = mkWf(); const { calc: heldCalc } = calc(wf, { vinyls: [{ ...baseVinyl, cost_per_sqft: undefined }], machines: catalogs.machines });
    const p = baseProject({ workflows: [{ ...wf, _calc: heldCalc }], total_vinyl_cost: 0, total_cost: 0, subtotal: 0 });
    const r = M.rollupVinylProject(p);
    assert.equal(r.vinylCost, 0);
    assert.equal(r.totalCost, 0);
  });

  // ---------- helpers + issue shape ----------
  check("metrics: held calc → null costPerSqFt, real yield", () => {
    const badVinyl = { ...baseVinyl }; delete badVinyl.cost_per_sqft;
    const { calc: c } = calc(mkWf(), { vinyls: [badVinyl], machines: catalogs.machines });
    const m = M.computeWorkflowMetrics(c);
    assert.equal(m.costPerSqFt, null);
    assert.ok(m.yieldPercent > 0, "geometry metrics stay real");
  });
  check("metrics: stock usage returns null on a held calc", () => {
    const badVinyl = { ...baseVinyl }; delete badVinyl.roll_width_inches;
    const { calc: c } = calc(mkWf(), { vinyls: [badVinyl], machines: catalogs.machines });
    assert.equal(M.computeStockUsage(c, badVinyl), null);
  });
  check("issue shape: kind/index/field/code/message/hold on every record", () => {
    const v = { ...baseVinyl }; delete v.cost_per_sqft;
    const wf = mkWf(); wf.items[0].quantity = 0;
    const { issues } = calc(wf, { vinyls: [v], machines: catalogs.machines });
    for (const i of issues) {
      assert.ok(["vinyl", "vinyl_catalog"].includes(i.kind));
      assert.equal(typeof i.index, "number");
      assert.equal(typeof i.field, "string");
      assert.match(i.code, /^vinyl_/);
      assert.ok(i.message.length > 10);
      assert.ok(i.hold);
    }
  });
} else {
  // ---------- RED: frozen remote implementation launders everything ----------
  check("RED: remote calc silently reprices a missing vinyl price as $0", () => {
    const v = { ...baseVinyl }; delete v.cost_per_sqft;
    const c = R.calculateVinylProject({
      items: [baseItem], printer: basePrinter, cutter: baseCutter, vinyl: v,
      applyPrint: true, applyCut: true,
    });
    assert.equal(c.vinylCost, 0, "remote laundered missing price → $0");
    assert.ok(c.totalCost > 0, "remote still produced a confident-looking total");
  });
  check("RED: remote calc silently drops a zero-dimension part", () => {
    const c = R.calculateVinylProject({
      items: [{ ...baseItem, width_inches: 0 }],
      printer: basePrinter, cutter: baseCutter, vinyl: baseVinyl,
      applyPrint: true, applyCut: true,
    });
    assert.equal(c.partsRequested, 0, "remote silently dropped the part row");
    assert.equal(c.partsPlaced, 0);
  });
  check("RED: remote calc silently floors a fractional quantity", () => {
    const c = R.calculateVinylProject({
      items: [{ ...baseItem, quantity: "2.7" }],
      printer: basePrinter, cutter: baseCutter, vinyl: baseVinyl,
      applyPrint: true, applyCut: true,
    });
    assert.equal(c.partsRequested, 2, "remote floor(2.7) → 2 parts, no signal");
  });
  check("RED: remote rollup launders malformed supplies % to 0", () => {
    const r = R.rollupVinylProject({
      workflows: [{ _calc: { materialCost: 100, machineCost: 10, laborCost: 20 } }],
      supplies_percent_of_materials: "abc", extra_supplies_cost: 0, markup_percent: 0,
      selected_equipment: [], personnel: [], total_travel_cost: 0,
    });
    assert.equal(r.baseSupplies, 0, "remote laundered 'abc' → $0 supplies");
    assert.equal(r.subtotal, 130, "remote produced a confident subtotal anyway");
  });
  check("RED: remote rollup launders malformed equipment totals to 0", () => {
    const r = R.rollupVinylProject({
      workflows: [],
      selected_equipment: [{ equipment_name: "Boom", total_cost: "abc" }],
      personnel: [], total_travel_cost: 0,
      supplies_percent_of_materials: 0, extra_supplies_cost: 0, markup_percent: 0,
    });
    assert.equal(r.equipmentCost, 0, "remote laundered 'abc' → $0 equipment");
    assert.equal(r.totalCost, 0, "remote produced $0 total from unusable input");
  });
  check("RED: remote calc prices $0 labor for a personnel row missing its rate", () => {
    const c = R.calculateVinylProject({
      items: [baseItem], printer: basePrinter, cutter: baseCutter, vinyl: baseVinyl,
      applyPrint: true, applyCut: true,
      personnel: [{ role: "Weeder", hourly_rate: "", hours: 5 }],
    });
    assert.equal(c.perPersonnelCost, 0, "remote silently skipped 5 hr of labor");
  });
  check("RED: remote calc silently defaults missing roll width to 54in", () => {
    const v = { ...baseVinyl }; delete v.roll_width_inches;
    const c = R.calculateVinylProject({
      items: [baseItem], printer: basePrinter, cutter: baseCutter, vinyl: v,
      applyPrint: true, applyCut: true,
    });
    assert.ok(c.vinylCost > 0, "remote priced against a phantom 54in roll");
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
  results,
};
fs.writeFileSync(E + (MODE === "red" ? "vinyl-model-red-verification.json" : "vinyl-model-verification.json"), JSON.stringify(artifact, null, 1));
console.log(JSON.stringify({ mode: MODE, total: results.length, failed: failed.length }));
if (failed.length) process.exit(1);
