// Sign Maintenance hardening — model suite.
// Asserts (a) valid-path parity: candidate calcMaintenanceProject output is
// identical to remote calcServiceItem/calcProjectTotals on clean inputs, and
// (b) strict-availability semantics: malformed/unavailable inputs hold totals
// to null, keep raw rows, and emit structured maintenance_* issues — never a
// silent $0.
import { build } from "esbuild";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AUDIT, ".build");
mkdirSync(OUT, { recursive: true });
const rel = (p) => "./" + path.relative(OUT, p).replace(/\\/g, "/");

// Frozen plugin (no stubs — the calc chain has no boundary imports).
const SM = "/app/src/components/signMaintenance/";
const remoteFile = (p) => readFileSync(path.join(AUDIT, "remote", p), "utf8");
const sources = new Map();
for (const f of ["constants.jsx", "defaults.jsx", "repaintCalculator.jsx", "repaintDefaults.jsx",
  "dimLetterPaintCalculator.jsx", "maintenanceCalculator.jsx"])
  sources.set(SM + f, remoteFile("src/components/signMaintenance/" + f));
sources.set(SM + "maintenancePricingAvailability.js",
  readFileSync(path.join(AUDIT, "maintenance-pricing-candidate-maintenancePricingAvailability.js"), "utf8"));
sources.set("/app/model-entry.mjs", `
  export * as avail from "${SM}maintenancePricingAvailability.js";
  export * as remote from "${SM}maintenanceCalculator.jsx";
  export { computeMonumentRepaint } from "${SM}repaintCalculator.jsx";
  export { computeDimLetterPaint } from "${SM}dimLetterPaintCalculator.jsx";
`);
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx", base + ".mjs"].find((p) => sources.has(p));
    if (!resolved) throw Error("missing frozen source: " + a.path + " (from " + a.importer + ")");
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => ({
    contents: sources.get(a.path), loader: a.path.endsWith(".jsx") ? "jsx" : "js",
  }));
}};
await build({
  entryPoints: ["/app/model-entry.mjs"], bundle: true, format: "esm", platform: "node",
  outfile: path.join(OUT, "maintenance-model-bundle.mjs"), plugins: [plug], logLevel: "silent",
});
const { avail, remote, computeMonumentRepaint, computeDimLetterPaint } =
  await import(pathToFileURL(path.join(OUT, "maintenance-model-bundle.mjs")).href);

let pass = 0, fail = 0;
const failures = [];
const t = (name, cond, extra = "") => {
  if (cond) { pass++; }
  else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- shared fixtures ----------
const SETTINGS = {
  maintenance_tech_rate: "65",
  maintenance_crew_lead_rate: "75",
  maintenance_helper_rate: "35",
  // repaint settings
  maintenance_repaint_coverage_sqft_per_gallon: "350",
  maintenance_repaint_paint_cost_per_gallon: "55",
  maintenance_repaint_primer_coats: "1",
  maintenance_repaint_finish_coats: "2",
  maintenance_repaint_sqft_per_hour: "60",
  maintenance_repaint_feat_dimensional_letters: "1.35",
  maintenance_repaint_feat_painted_letters: "1.25",
  maintenance_repaint_feat_applied_vinyl: "1.15",
  maintenance_repaint_feat_complex_layering: "1.40",
  maintenance_repaint_condition_step_pct: "8",
  // dim-letter (shared paint estimator keys)
  letter_perimeter_factor: "3.5",
  paint_waste_multiplier: "1.25",
  mixed_paint_coverage_sqft_per_gallon: "350",
  base_labor_hours_per_sqft: "0.05",
  lettering_extra_small_prep_multiplier: "1.5",
  lettering_small_prep_multiplier: "1.3",
  lettering_normal_prep_multiplier: "1.0",
  lettering_medium_prep_multiplier: "0.9",
  lettering_large_prep_multiplier: "0.8",
  lettering_extra_large_prep_multiplier: "0.7",
  paint_mix_ratio: "4",
  hardener_mix_ratio: "1",
  reducer_mix_ratio: "0.5",
  paint_cost_per_unit: "200", paint_unit: "gallon",
  hardener_cost_per_unit: "80", hardener_unit: "quart",
  reducer_cost_per_unit: "60", reducer_unit: "gallon",
  paint_mask_rate_per_sqft: "0.75",
  paint_mask_machine_cutting_rate_per_sqft: "0.10",
  paint_mask_cutting_labor_rate_per_sqft: "0.15",
  paint_mask_application_labor_rate_per_sqft: "0.25",
  default_labor_rate: "60",
  // travel
  maintenance_gasoline_price_per_gallon: "3.5",
  maintenance_diesel_price_per_gallon: "4.0",
  maintenance_travel_labor_rate: "45",
  maintenance_travel_avg_speed_mph: "45",
  maintenance_travel_overhead_per_mile: "0.25",
  maintenance_min_travel_charge: "0",
};

const RATE = (over = {}) => ({
  id: "rate-1", sign_type: "flush_channel", action: "clean", is_enabled: true,
  base_minutes_xs: 15, base_minutes_s: 20, base_minutes_m: 30, base_minutes_l: 45,
  base_minutes_xl: 60, base_minutes_xxl: 90, base_minutes_flat: 30,
  ...over,
});
const RATES = [RATE()];

const ITEM = (over = {}) => ({
  description: "Front channel letters", sign_type: "flush_channel", size: "medium",
  qty: 10, installation_height_feet: 12, actions: ["clean"], materials: [],
  ...over,
});
const REPAINT_ITEM = (over = {}) => ({
  description: "Monument repaint", sign_type: "monument_sign", size: "cab_medium",
  qty: 1, actions: ["repaint"],
  repaint_config: {
    length_ft: 8, height_ft: 4, return_depth_in: 6, paint_mode: "entire_panel",
    features: [], retainer_width_in: 2, paint_condition: 3, paint_both_sides: true,
  },
  materials: [],
  ...over,
});
// Linked material rule — master row resolved.
const LINKED_RULE = (over = {}) => ({
  id: "rule-1", item_name: "LED modules", is_active: true,
  inventory_entity: "SignLightingInventory", inventory_item_id: "m-1",
  usage_basis: "per_letter", usage_multiplier: "1", usage_rounding: "none",
  _master_missing: false, _master_unit_cost: 2.5, _display_name: "LED modules",
  ...over,
});
// Legacy detached rule — priced off its own cost_* fields.
const DETACHED_RULE = (over = {}) => ({
  id: "rule-2", item_name: "Vinyl sqft", is_active: true,
  pricing_mode: "per_sqft", cost_per_sqft: "4.25",
  ...over,
});
const EQUIP = [{ equipment_id: "eq-1", equipment_name: "Bucket truck", total_cost: 150, ownership: "rented" }];
const EQUIP_INV = [{ id: "eq-1", equipment_name: "Bucket truck", ownership: "rented", equipment_type: "boom_truck", mpg: "12" }];
const PERSONNEL = [{ role: "Installer", name: "Tech", total_cost: 195 }];
const PROJECT = (over = {}) => ({
  project_name: "P", client_name: "C", items: [ITEM()],
  selected_equipment: EQUIP, personnel: PERSONNEL,
  travel_miles_round_trip: 0, total_travel_cost: 0,
  supplies_percent_of_materials: 10, extra_supplies_cost: 0, markup_percent: 15,
  ...over,
});
const calc = (project, s = SETTINGS, r = RATES, inv = [], eq = EQUIP_INV) =>
  avail.calcMaintenanceProject(project, { settings: s, rates: r, inventory: inv, equipmentInventory: eq });
const remoteCalc = (project, s = SETTINGS, r = RATES, inv = []) => {
  const items = (project.items || []).map(it => remote.calcServiceItem(it, s, r, inv));
  return { items, totals: remote.calcProjectTotals({ ...project, items }) };
};

// ---------- A. valid-path parity ----------
{
  const proj = PROJECT();
  const { calc: c, issues, held } = calc(JSON.parse(JSON.stringify(proj)));
  const r = remoteCalc(JSON.parse(JSON.stringify(proj)));
  t("A1 clean project → no issues", issues.length === 0, JSON.stringify(issues));
  t("A2 not held", held === false && c.__held === false && c.pricingUnavailable === false);
  t("A3 item byte-parity", JSON.stringify(c.items) === JSON.stringify(r.items),
    `\ncand=${JSON.stringify(c.items)}\nremote=${JSON.stringify(r.items)}`);
  t("A4 totals byte-parity", JSON.stringify(c.totals) === JSON.stringify(r.totals));
}
{
  // repaint path parity (monument + repaint + dim-letter feature)
  const proj = PROJECT({ items: [REPAINT_ITEM({
    repaint_config: {
      length_ft: 8, height_ft: 4, return_depth_in: 6, paint_mode: "entire_panel",
      features: ["dimensional_letters"], retainer_width_in: 2, paint_condition: 3,
      paint_both_sides: true,
      dim_letter_paint: { enabled: true, qty: 6, avg_height_in: 12, thickness_in: 1, second_color_mask: "paint_mask" },
    },
  })] });
  const { calc: c, issues } = calc(JSON.parse(JSON.stringify(proj)));
  const r = remoteCalc(JSON.parse(JSON.stringify(proj)));
  t("A5 repaint clean → no issues", issues.length === 0, JSON.stringify(issues));
  t("A6 repaint item byte-parity", JSON.stringify(c.items) === JSON.stringify(r.items));
  t("A7 repaint totals byte-parity", JSON.stringify(c.totals) === JSON.stringify(r.totals));
}
{
  // linked + detached material paths parity
  const inv = [LINKED_RULE(), DETACHED_RULE()];
  const proj = PROJECT({ items: [ITEM({
    face_sqft: 40, qty: 10,
    materials: [{ maintenance_rule_id: "rule-1" }, { maintenance_rule_id: "rule-2" }],
  })] });
  const { calc: c, issues } = calc(JSON.parse(JSON.stringify(proj)), SETTINGS, RATES, inv);
  const r = remoteCalc(JSON.parse(JSON.stringify(proj)), SETTINGS, RATES, inv);
  t("A8 materials clean → no issues", issues.length === 0, JSON.stringify(issues));
  t("A9 materials item byte-parity", JSON.stringify(c.items) === JSON.stringify(r.items));
}

// ---------- B. strict parsers ----------
const SN = avail.maintenanceStrictNumber;
t("B1 strict accepts number", SN(5) === 5 && SN(-2.5) === -2.5);
t("B2 strict accepts numeric string", SN(" 5 ") === 5 && SN("0") === 0);
t("B3 strict rejects blank", SN("") === null && SN("   ") === null);
t("B4 strict rejects malformed/objects", SN("abc") === null && SN({}) === null && SN([]) === null);
t("B5 strict rejects NaN/Infinity/nullish", SN(NaN) === null && SN(Infinity) === null && SN(null) === null && SN(undefined) === null);
t("B6 nonneg rejects negative", avail.maintenanceNonNegativeNumber(-1) === null && avail.maintenanceNonNegativeNumber("-1") === null);
t("B7 nonneg accepts 0", avail.maintenanceNonNegativeNumber(0) === 0);
t("B8 positive rejects 0", avail.maintenancePositiveNumber(0) === null && avail.maintenancePositiveNumber("0") === null);
t("B9 positive accepts >0", avail.maintenancePositiveNumber(0.5) === 0.5);
t("B10 settingRecorded treats blank as absent",
  avail.maintenanceSettingRecorded("x") && !avail.maintenanceSettingRecorded("") && !avail.maintenanceSettingRecorded("  ")
  && !avail.maintenanceSettingRecorded(null) && !avail.maintenanceSettingRecorded(undefined) && avail.maintenanceSettingRecorded(0));

// ---------- C. settings scanner ----------
t("C1 clean settings (items context) → no issues",
  avail.maintenanceSettingIssues(SETTINGS, { hasItems: true }).length === 0,
  JSON.stringify(avail.maintenanceSettingIssues(SETTINGS, { hasItems: true })));
{
  const iss = avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_tech_rate: "abc" }, { hasItems: true });
  t("C2 malformed tech rate → catalog issue", iss.length === 1 && iss[0].kind === "maintenance_catalog"
    && iss[0].field === "maintenance_tech_rate" && iss[0].hold === "project"
    && iss[0].code === "maintenance_labor_rate_unavailable", JSON.stringify(iss));
  t("C3 tech rate 0 flagged", avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_tech_rate: 0 }, { hasItems: true }).length === 1);
  t("C4 tech rate absent ok (documented default)", avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_tech_rate: undefined }, { hasItems: true }).length === 0);
  t("C5 tech rate not scanned w/o items", avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_tech_rate: "abc" }, { hasItems: false }).length === 0);
  t("C6 crew rate flagged when role present", avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_crew_lead_rate: "x" }, { hasItems: true, rolesPresent: new Set(["Crew Lead"]) }).some(i => i.field === "maintenance_crew_lead_rate"));
  t("C7 crew rate not flagged when role absent", !avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_crew_lead_rate: "x" }, { hasItems: true, rolesPresent: new Set([]) }).some(i => i.field === "maintenance_crew_lead_rate"));
}
// repaint settings — only when a repaint item exists
const REPAINT_CTX = { hasItems: true, hasRepaint: true, featuresUsed: new Set(["dimensional_letters"]) };
t("C8 repaint settings not scanned w/o repaint item",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_coverage_sqft_per_gallon: "x" }, { hasItems: true }).length === 0);
t("C9 repaint coverage malformed flagged",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_coverage_sqft_per_gallon: "x" }, REPAINT_CTX).some(i => i.field === "maintenance_repaint_coverage_sqft_per_gallon"));
t("C10 repaint coverage 0 flagged (||350 launder)",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_coverage_sqft_per_gallon: 0 }, REPAINT_CTX).some(i => i.field === "maintenance_repaint_coverage_sqft_per_gallon"));
t("C11 repaint sqft/hr 0 flagged (||60 launder)",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_sqft_per_hour: 0 }, REPAINT_CTX).some(i => i.field === "maintenance_repaint_sqft_per_hour"));
t("C12 repaint feature multiplier flagged only when feature used",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_feat_applied_vinyl: "x" }, { ...REPAINT_CTX, featuresUsed: new Set(["applied_vinyl"]) }).some(i => i.field === "maintenance_repaint_feat_applied_vinyl")
  && !avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_feat_applied_vinyl: "x" }, { ...REPAINT_CTX, featuresUsed: new Set([]) }).some(i => i.field === "maintenance_repaint_feat_applied_vinyl"));
t("C13 repaint paint_cost explicit 0 ok (free paint)",
  !avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_repaint_paint_cost_per_gallon: 0 }, REPAINT_CTX).some(i => i.field === "maintenance_repaint_paint_cost_per_gallon"));
// dim-letter settings — only when enabled
const DIM_CTX = { ...REPAINT_CTX, dimEnabled: true, dimBandsUsed: new Set(["lettering_normal_prep_multiplier"]), dimMaskUsed: true };
t("C14 dim-letter settings not scanned when disabled",
  avail.maintenanceSettingIssues({ ...SETTINGS, letter_perimeter_factor: "x" }, REPAINT_CTX).length === 0);
t("C15 dim-letter malformed setting flagged",
  avail.maintenanceSettingIssues({ ...SETTINGS, letter_perimeter_factor: "x" }, DIM_CTX).some(i => i.field === "letter_perimeter_factor"));
t("C16 dim-letter band multiplier flagged (consumed band only)",
  avail.maintenanceSettingIssues({ ...SETTINGS, lettering_normal_prep_multiplier: "x" }, DIM_CTX).some(i => i.field === "lettering_normal_prep_multiplier")
  && !avail.maintenanceSettingIssues({ ...SETTINGS, lettering_extra_large_prep_multiplier: "x" }, DIM_CTX).some(i => i.field === "lettering_extra_large_prep_multiplier"));
t("C17 absent mask rate flagged when mask used (num() → $0)",
  avail.maintenanceSettingIssues({ ...SETTINGS, paint_mask_rate_per_sqft: undefined }, DIM_CTX).some(i => i.field === "paint_mask_rate_per_sqft"));
t("C18 all-zero mix parts flagged",
  avail.maintenanceSettingIssues({ ...SETTINGS, paint_mix_ratio: undefined, hardener_mix_ratio: undefined, reducer_mix_ratio: undefined }, DIM_CTX)
    .some(i => i.code === "maintenance_dim_letter_setting_unavailable"));
t("C19 bad liquid unit flagged",
  avail.maintenanceSettingIssues({ ...SETTINGS, paint_unit: "bucket" }, DIM_CTX).some(i => i.field === "paint_unit"));
// travel — only when miles positive
const TRAVEL_CTX = { hasItems: true, milesPositive: true };
t("C20 travel settings not scanned at 0 miles",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_travel_labor_rate: "x" }, { hasItems: true }).length === 0);
t("C21 malformed maintenance travel rate flagged",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_travel_labor_rate: "x" }, TRAVEL_CTX).some(i => i.field === "maintenance_travel_labor_rate"));
t("C22 install_* fallback flagged when maintenance_* absent",
  avail.maintenanceSettingIssues({ ...SETTINGS, maintenance_travel_labor_rate: undefined, install_travel_labor_rate: "x" }, TRAVEL_CTX).some(i => i.field === "install_travel_labor_rate"));
t("C23 maintenance_* recorded wins over bad install_* (?? semantics — good value consumed)",
  !avail.maintenanceSettingIssues({ ...SETTINGS, install_travel_labor_rate: "x" }, TRAVEL_CTX).some(i => i.field === "install_travel_labor_rate"));

// ---------- D. item scanner ----------
const itemScan = (item, r = RATES, inv = []) => avail.maintenanceItemIssues(item, 0, { rates: r, inventory: inv }).issues;
t("D1 clean item → no issues", itemScan(ITEM()).length === 0, JSON.stringify(itemScan(ITEM())));
{
  const iss = itemScan(ITEM(), []);
  t("D2 missing rate row → catalog issue hold item",
    iss.some(i => i.code === "maintenance_rate_unavailable" && i.hold === "item" && i.kind === "maintenance_catalog"), JSON.stringify(iss));
  t("D3 disabled rate row flagged",
    itemScan(ITEM(), [RATE({ is_enabled: false })]).some(i => i.code === "maintenance_rate_disabled"));
  t("D4 malformed minutes flagged",
    itemScan(ITEM(), [RATE({ base_minutes_m: "abc" })]).some(i => i.code === "maintenance_rate_unavailable"));
  t("D5 zero minutes flagged (selected action must price)",
    itemScan(ITEM(), [RATE({ base_minutes_m: 0 })]).some(i => i.code === "maintenance_rate_unavailable"));
  t("D6 flat-rate fallback consumed when size unmapped",
    itemScan(ITEM({ size: "unknown_size" }), [RATE({ base_minutes_flat: 0 })]).some(i => i.code === "maintenance_rate_unavailable"));
  t("D7 non-array actions flagged", itemScan(ITEM({ actions: "clean" })).some(i => i.field === "actions"));
  t("D8 qty blank flagged", itemScan(ITEM({ qty: "" })).some(i => i.field === "qty" && i.hold === "item"));
  t("D9 qty 0 flagged (letters)", itemScan(ITEM({ qty: 0 })).some(i => i.field === "qty"));
  t("D10 cabinet qty 0 flagged (clamped to 1 silently)",
    itemScan(ITEM({ sign_type: "monument_sign", qty: 0 })).some(i => i.field === "qty"));
  t("D11 repaint action skips rate-matrix check (specialized calc)",
    itemScan(REPAINT_ITEM()).filter(i => i.field === "actions").length === 0);
}
// materials
{
  const inv = [LINKED_RULE(), DETACHED_RULE()];
  const matItem = (mats) => ITEM({ face_sqft: 40, materials: mats });
  t("D12 linked + detached materials clean",
    itemScan(matItem([{ maintenance_rule_id: "rule-1" }, { maintenance_rule_id: "rule-2" }]), RATES, inv).length === 0,
    JSON.stringify(itemScan(matItem([{ maintenance_rule_id: "rule-1" }, { maintenance_rule_id: "rule-2" }]), RATES, inv)));
  t("D13 _master_missing rule flagged (enforced, not just displayed)",
    itemScan(matItem([{ maintenance_rule_id: "rule-1" }]), RATES, [LINKED_RULE({ _master_missing: true })])
      .some(i => i.code === "maintenance_material_link_unavailable"));
  t("D14 stored link_missing flagged",
    itemScan(matItem([{ maintenance_rule_id: "rule-1", link_missing: true }]), RATES, inv)
      .some(i => i.code === "maintenance_material_link_unavailable"));
  t("D15 missing rule row flagged (stored snapshot held)",
    itemScan(matItem([{ maintenance_rule_id: "rule-gone" }]), RATES, inv)
      .some(i => i.code === "maintenance_material_rule_unavailable"));
  t("D16 inactive rule flagged",
    itemScan(matItem([{ maintenance_rule_id: "rule-1" }]), RATES, [LINKED_RULE({ is_active: false })])
      .some(i => i.code === "maintenance_material_rule_unavailable"));
  t("D17 bad usage_basis flagged",
    itemScan(matItem([{ maintenance_rule_id: "rule-1" }]), RATES, [LINKED_RULE({ usage_basis: "per_hour" })])
      .some(i => i.code === "maintenance_material_usage_unavailable"));
  t("D18 absent usage_multiplier flagged (consumes 0 silently)",
    itemScan(matItem([{ maintenance_rule_id: "rule-1" }]), RATES, [LINKED_RULE({ usage_multiplier: undefined })])
      .some(i => i.code === "maintenance_material_usage_unavailable"));
  t("D19 detached rule missing cost field flagged",
    itemScan(matItem([{ maintenance_rule_id: "rule-2" }]), RATES, [DETACHED_RULE({ cost_per_sqft: undefined })])
      .some(i => i.code === "maintenance_material_price_unavailable"));
  t("D20 detached bad pricing_mode flagged",
    itemScan(matItem([{ maintenance_rule_id: "rule-2" }]), RATES, [DETACHED_RULE({ pricing_mode: "per_thing" })])
      .some(i => i.code === "maintenance_material_pricing_mode_unavailable"));
  t("D21 linked master cost absent + stored cost absent → held",
    itemScan(matItem([{ maintenance_rule_id: "rule-1" }]), RATES, [LINKED_RULE({ _master_unit_cost: undefined })])
      .some(i => i.code === "maintenance_material_price_unavailable"));
  t("D22 linked master cost absent + stored cost present → ok (fallback consumed)",
    !itemScan(matItem([{ maintenance_rule_id: "rule-1", unit_cost: 3 }]), RATES, [LINKED_RULE({ _master_unit_cost: undefined })])
      .some(i => i.code === "maintenance_material_price_unavailable"));
  t("D23 face_sqft required by per_sqft material (absent → consumed 0 silently)",
    itemScan(ITEM({ face_sqft: undefined, materials: [{ maintenance_rule_id: "rule-2" }] }), RATES, inv)
      .some(i => i.field === "face_sqft"));
  t("D24 face_sqft not required when no per_sqft material",
    !itemScan(ITEM({ face_sqft: undefined }), RATES, inv).some(i => i.field === "face_sqft"));
  t("D25 quantity_override malformed flagged",
    itemScan(matItem([{ maintenance_rule_id: "rule-1", quantity_override: true, quantity: "abc" }]), RATES, inv)
      .some(i => i.code === "maintenance_material_quantity_unavailable"));
  t("D26 detached stored snapshot no-rule: bad stored cost flagged",
    itemScan(matItem([{ item_name: "manual", unit_cost: "x", quantity: 2 }])).some(i => i.code === "maintenance_material_price_unavailable"));
}
// repaint_config
{
  t("D27 clean repaint item → no issues", itemScan(REPAINT_ITEM()).length === 0, JSON.stringify(itemScan(REPAINT_ITEM())));
  t("D28 repaint length flagged", itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, length_ft: "" } })).some(i => i.field === "repaint_config.length_ft"));
  t("D29 repaint length 0 flagged", itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, length_ft: 0 } })).some(i => i.field === "repaint_config.length_ft"));
  t("D30 return_depth consumed only in entire-panel mode",
    itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, paint_mode: "returns_only", return_depth_in: "abc" } }))
      .filter(i => i.field === "repaint_config.return_depth_in").length === 0);
  t("D31 retainer width required in returns_only",
    itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, paint_mode: "returns_only", retainer_width_in: 0 } }))
      .some(i => i.field === "repaint_config.retainer_width_in"));
  t("D32 retainer width not required in entire_panel",
    !itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, retainer_width_in: 0 } })).some(i => i.field === "repaint_config.retainer_width_in"));
  t("D33 bad paint_mode flagged",
    itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, paint_mode: "weird" } })).some(i => i.field === "repaint_config.paint_mode"));
  t("D34 paint_condition out of range flagged",
    itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, paint_condition: 15 } })).some(i => i.field === "repaint_config.paint_condition"));
  t("D35 non-array features flagged",
    itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, features: "x" } })).some(i => i.field === "repaint_config.features"));
}
// dim-letter
const DL_ITEM = (dl = {}) => REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, features: ["dimensional_letters"],
  dim_letter_paint: { enabled: true, qty: 6, avg_height_in: 12, thickness_in: 1, second_color_mask: "none", ...dl } } });
t("D36 dim-letter clean → no issues", itemScan(DL_ITEM()).length === 0, JSON.stringify(itemScan(DL_ITEM())));
t("D37 dim qty 0 flagged (silently skips whole feature)",
  itemScan(DL_ITEM({ qty: 0 })).some(i => i.field === "dim_letter_paint.qty"));
t("D38 dim height blank flagged",
  itemScan(DL_ITEM({ avg_height_in: "" })).some(i => i.field === "dim_letter_paint.avg_height_in"));
t("D39 dim thickness explicit 0 ok (face only)",
  !itemScan(DL_ITEM({ thickness_in: 0 })).some(i => i.field === "dim_letter_paint.thickness_in"));
t("D40 dim thickness malformed flagged",
  itemScan(DL_ITEM({ thickness_in: "x" })).some(i => i.field === "dim_letter_paint.thickness_in"));
t("D41 bad second_color_mask flagged",
  itemScan(DL_ITEM({ second_color_mask: "laser" })).some(i => i.field === "dim_letter_paint.second_color_mask"));
t("D42 disabled dim-letter → no dim flags",
  itemScan(DL_ITEM({ enabled: false, qty: 0 })).filter(i => String(i.field).startsWith("dim_letter_paint")).length === 0);
t("D43 dim-letter feature off → dl ignored",
  itemScan(REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, dim_letter_paint: { enabled: true, qty: 0, avg_height_in: 0 } } }))
    .filter(i => String(i.field).startsWith("dim_letter_paint")).length === 0);

// ---------- E. held calc semantics ----------
{
  const proj = PROJECT({ items: [ITEM(), ITEM({ description: "bad", qty: "" })] });
  const { calc: c, issues, held, catalogIssues, inputIssues } = calc(proj);
  t("E1 held=true on qty issue", held === true && c.__held === true && c.pricingUnavailable === true);
  t("E2 issue partitions cover all", catalogIssues.length + inputIssues.length === issues.length);
  t("E3 held item derived null", ["labor_hours", "labor_cost", "materials_cost", "item_total_cost"].every(f => c.items[1][f] === null));
  t("E4 held item raw preserved", c.items[1].qty === "" && c.items[1].description === "bad");
  t("E5 unheld item keeps derived numbers", Number.isFinite(c.items[0].labor_cost) && c.items[0].labor_cost > 0);
  t("E6 ALL totals null while any item held", Object.values(c.totals).every(v => v === null), JSON.stringify(c.totals));
}
{
  const { calc: c, issues } = calc(PROJECT(), { ...SETTINGS, maintenance_tech_rate: "x" });
  t("E7 settings hold → all totals null", Object.values(c.totals).every(v => v === null));
  t("E8 settings hold → all items held (project hold)",
    c.items.every(it => it.labor_cost === null && it.item_total_cost === null));
  t("E9 settings issue kind catalog + hold project",
    issues[0].kind === "maintenance_catalog" && issues[0].hold === "project");
}
{
  // Missing rate row → item held; materials on that item show held total only
  // for the flagged material (per-material granularity).
  const inv = [LINKED_RULE()];
  const proj = PROJECT({ items: [ITEM({ materials: [{ maintenance_rule_id: "rule-1" }] })] });
  const { calc: c } = calc(proj, SETTINGS, [], inv);
  t("E10 missing rate row → item derived null",
    c.items[0].labor_cost === null && c.items[0].item_total_cost === null);
  t("E11 repaint_calc removed on held repaint item",
    calc(PROJECT({ items: [REPAINT_ITEM({ repaint_config: { ...REPAINT_ITEM().repaint_config, length_ft: "" } })] })).calc.items[0].repaint_calc === undefined);
}

// ---------- F. explicit-zero paths ----------
{
  // markup 0 is semantically valid (no markup) — must NOT flag.
  const { calc: c, issues } = calc(PROJECT({ markup_percent: 0, extra_supplies_cost: 0, supplies_percent_of_materials: 0, total_travel_cost: 0 }));
  t("F1 explicit-zero project fields → no issues", issues.length === 0, JSON.stringify(issues));
  t("F2 markup 0 → total = subtotal", near(c.totals.total_cost, c.totals.subtotal));
}
{
  // explicit-0 repaint coverage is the ||350 launder defect — must flag, not
  // silently revive 350 (remote would launder).
  const remoteOut = computeMonumentRepaint(REPAINT_ITEM(), { ...SETTINGS, maintenance_repaint_coverage_sqft_per_gallon: 0 });
  const { issues } = calc(PROJECT({ items: [REPAINT_ITEM()] }), { ...SETTINGS, maintenance_repaint_coverage_sqft_per_gallon: 0 });
  t("F3 remote laundered coverage 0 → 350 silently", remoteOut.coverage === 350, `got ${remoteOut.coverage}`);
  t("F4 candidate flags coverage 0", issues.some(i => i.field === "maintenance_repaint_coverage_sqft_per_gallon"));
}
{
  // detached material with explicit-0 stored unit cost on a missing rule is
  // legitimate free — but the missing-rule link flags anyway (link integrity).
  const { issues } = calc(PROJECT({ items: [ITEM({ materials: [{ maintenance_rule_id: "gone", unit_cost: 0, quantity: 2 }] })] }));
  t("F5 missing rule flags regardless of stored cost", issues.some(i => i.code === "maintenance_material_rule_unavailable"));
}
{
  // equipment/personnel explicit-0 totals are legitimate free rows.
  const { issues } = calc(PROJECT({ selected_equipment: [{ ...EQUIP[0], total_cost: 0 }], personnel: [{ ...PERSONNEL[0], total_cost: 0 }] }));
  t("F6 explicit-0 equipment/personnel totals ok", !issues.some(i => i.code === "maintenance_equipment_cost_unavailable" || i.code === "maintenance_personnel_cost_unavailable"), JSON.stringify(issues));
}

// ---------- G. project scanner ----------
{
  t("G1 non-array items flagged", calc(PROJECT({ items: "oops" })).issues.some(i => i.code === "maintenance_items_unavailable" && i.hold === "project"));
  t("G2 malformed supplies pct flagged", calc(PROJECT({ supplies_percent_of_materials: "abc" })).issues.some(i => i.code === "maintenance_supplies_rate_unavailable"));
  t("G3 absent supplies pct ok (documented 10% default)", !calc(PROJECT({ supplies_percent_of_materials: undefined })).issues.some(i => i.code === "maintenance_supplies_rate_unavailable"));
  t("G4 negative markup flagged", calc(PROJECT({ markup_percent: -5 })).issues.some(i => i.code === "maintenance_markup_unavailable"));
  t("G5 malformed markup flagged", calc(PROJECT({ markup_percent: "x" })).issues.some(i => i.code === "maintenance_markup_unavailable"));
  t("G6 malformed extra supplies flagged", calc(PROJECT({ extra_supplies_cost: "free" })).issues.some(i => i.code === "maintenance_extra_supplies_unavailable"));
  t("G7 malformed travel cost flagged", calc(PROJECT({ total_travel_cost: "x" })).issues.some(i => i.code === "maintenance_travel_unavailable"));
  t("G8 malformed miles flagged", calc(PROJECT({ travel_miles_round_trip: "far" })).issues.some(i => i.code === "maintenance_travel_unavailable"));
  t("G9 dangling equipment_id flagged", calc(PROJECT({ selected_equipment: [{ equipment_id: "gone", equipment_name: "Ghost", total_cost: 1 }] })).issues.some(i => i.code === "maintenance_equipment_unavailable" && i.hold === "project"));
  t("G10 missing equipment cost flagged", calc(PROJECT({ selected_equipment: [{ equipment_id: "eq-1", equipment_name: "T" }] })).issues.some(i => i.code === "maintenance_equipment_cost_unavailable"));
  t("G11 personnel total_cost absent flagged", calc(PROJECT({ personnel: [{ role: "Installer", name: "X" }] })).issues.some(i => i.code === "maintenance_personnel_cost_unavailable"));
  t("G12 bad-mpg owned vehicle flagged when miles>0",
    calc(PROJECT({ travel_miles_round_trip: 40, selected_equipment: [{ equipment_id: "eq-1", equipment_name: "T", total_cost: 1 }] }), SETTINGS, RATES, [],
      [{ id: "eq-1", equipment_name: "T", ownership: "owned", equipment_type: "truck", mpg: "0" }])
      .issues.some(i => i.code === "maintenance_vehicle_mpg_unavailable"));
  t("G13 bad-mpg vehicle not flagged at 0 miles",
    !calc(PROJECT({ travel_miles_round_trip: 0, selected_equipment: [{ equipment_id: "eq-1", equipment_name: "T", total_cost: 1 }] }), SETTINGS, RATES, [],
      [{ id: "eq-1", equipment_name: "T", ownership: "owned", equipment_type: "truck", mpg: "0" }])
      .issues.some(i => i.code === "maintenance_vehicle_mpg_unavailable"));
  t("G14 non-vehicle owned equipment not mpg-flagged",
    !calc(PROJECT({ travel_miles_round_trip: 40, selected_equipment: [{ equipment_id: "eq-1", equipment_name: "T", total_cost: 1 }] }), SETTINGS, RATES, [],
      [{ id: "eq-1", equipment_name: "T", ownership: "owned", equipment_type: "scaffold", mpg: "" }])
      .issues.some(i => i.code === "maintenance_vehicle_mpg_unavailable"));
}

// ---------- H. UI helpers ----------
t("H1 snapshot gate", avail.hasMaintenanceCostSnapshot(5) && avail.hasMaintenanceCostSnapshot(0)
  && !avail.hasMaintenanceCostSnapshot(null) && !avail.hasMaintenanceCostSnapshot("5") && !avail.hasMaintenanceCostSnapshot(NaN));
t("H2 draft preserves blank", avail.maintenanceDraftValue("") === "");
t("H3 draft parses", avail.maintenanceDraftValue("2.5") === 2.5);
t("H4 draft keeps malformed raw", avail.maintenanceDraftValue("abc") === "abc");
t("H5 field lookup", avail.hasIssueFor([{ field: "qty", itemIndex: 2 }], "qty", 2) && !avail.hasIssueFor([{ field: "qty", itemIndex: 2 }], "qty", 3));
t("H6 material lookup", avail.hasIssueFor([{ field: "quantity", itemIndex: 0, materialIndex: 1 }], "quantity", 0, 1)
  && !avail.hasIssueFor([{ field: "quantity", itemIndex: 0, materialIndex: 1 }], "quantity", 0, 0));
t("H7 item issue list", avail.maintenanceItemIssueList([{ itemIndex: 0 }, { itemIndex: 1 }, { itemIndex: 0 }], 0).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS maintenance-model");
