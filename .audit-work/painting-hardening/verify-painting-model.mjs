// Painting hardening — model suite.
// Asserts (a) valid-path parity: candidate calcPaintingProject output is
// byte-identical to remote calculatePaintingProject on clean inputs, and
// (b) strict-availability semantics: malformed inputs hold totals to null,
// keep raw rows, and emit structured paint_* issues — never a silent $0.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AUDIT, ".build");
mkdirSync(OUT, { recursive: true });
const rel = (p) => "./" + path.relative(OUT, p).replace(/\\/g, "/");

const entry = path.join(OUT, "model-entry.mjs");
writeFileSync(entry, `
export * as remote from ${JSON.stringify(rel(path.join(AUDIT, "remote-src", "src/components/estimator/paint/paintCalc.js")))};
export * as cand from ${JSON.stringify(rel(path.join(AUDIT, "frozen-src/components/estimator/paint/paintCalc.js")))};
export * as avail from ${JSON.stringify(rel(path.join(AUDIT, "frozen-src/components/estimator/paint/paintPricingAvailability.js")))};
`);

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: path.join(OUT, "model-bundle.mjs"),
  logLevel: "silent",
});

const { remote, cand, avail } = await import(pathToFileURL(path.join(OUT, "model-bundle.mjs")).href);

let pass = 0, fail = 0;
const failures = [];
const t = (name, cond, extra = "") => {
  if (cond) { pass++; }
  else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- shared fixtures ----------
// Settings covering every priced key at documented defaults.
const SETTINGS = {
  default_labor_rate: 60,
  min_labor_hours: 0,
  min_paint_cost: 0,
  default_paint_supplies_per_sqft: 1.25,
  paint_cost_per_unit: 200,
  paint_unit: "gallon",
  hardener_cost_per_unit: 80,
  hardener_unit: "quart",
  reducer_cost_per_unit: 60,
  reducer_unit: "gallon",
  paint_mix_ratio: 4,
  hardener_mix_ratio: 1,
  reducer_mix_ratio: 0.5,
  mixed_paint_coverage_sqft_per_gallon: 350,
  paint_waste_multiplier: 1.25,
  fixed_paint_waste_gallons: 0,
  paint_mask_rate_per_sqft: 0.75,
  paint_mask_machine_cutting_rate_per_sqft: 0.10,
  paint_mask_application_labor_rate_per_sqft: 0.50,
  paint_mask_cutting_labor_rate_per_sqft: 0.25,
  base_labor_hours_per_sqft: 0.05,
  setup_time_labor_hours: 0.5,
  paint_mixing_labor_hours: 0.25,
  color_change_setup_hours: 0.25,
  paint_gun_cleaning_hours: 0.15,
  one_side_paint_multiplier: 1,
  both_sides_paint_multiplier: 1.85,
  additional_color_multiplier: 1.1,
  simple_complexity_multiplier: 1,
  moderate_complexity_multiplier: 1.4,
  complex_complexity_multiplier: 1.8,
  letter_perimeter_factor: 2.5,
  panel_labor_tiers: JSON.stringify([{ min_quantity: 1, max_quantity: 9, labor_multiplier: 1 }, { min_quantity: 10, max_quantity: 49, labor_multiplier: 0.9 }]),
  complex_shapes_labor_tiers: "[]",
  lettering_labor_tiers: "[]",
};

const panelItem = () => ({
  description: "4x8 ACM panel",
  item_type: "panel",
  thickness: "1/2",
  length: 96,
  width: 48,
  quantity: 2,
  paint_sides: "one_side",
  paint_colors: ["PMS 186"],
  paint_mask_sqft: 10,
  edge_complexity_multiplier: 1,
  fixed_waste_gallons: 0,
  base_supplies_cost: 0,
});
const letterItem = () => ({
  description: "DIM letters",
  item_type: "lettering",
  thickness: "1/4",
  length: 12,   // letter count
  width: 8,     // letter height
  letter_size: "small",
  paint_sides: "one_side",
  paint_colors: ["White", "Black"],
  paint_mask_sqft: 0,
});
const complexItem = () => ({
  description: "routed logo",
  item_type: "complex_shapes",
  thickness: "3/4",
  length: 30,
  width: 20,
  quantity: 3,
  edge_complexity_multiplier: 1.5,
  paint_sides: "both_sides",
  paint_colors: ["Red"],
  paint_mask_sqft: 0,
});

const cleanProject = () => ({ items: [panelItem(), letterItem(), complexItem()], paint_supplies_per_sqft: 1.25 });
const stripMeta = (o) => JSON.parse(JSON.stringify(o, (k, v) => ["__held", "pricingUnavailable", "issues"].includes(k) ? undefined : v));

// ---------- A. valid-path byte-parity ----------
{
  const proj = cleanProject();
  const remoteOut = remote.calculatePaintingProject(JSON.parse(JSON.stringify(proj)), { ...SETTINGS });
  const { calc, issues, held } = avail.calcPaintingProject(JSON.parse(JSON.stringify(proj)), { ...SETTINGS });
  t("A1 clean calc issues empty", issues.length === 0, JSON.stringify(issues));
  t("A2 clean calc not held", held === false);
  t("A3 clean calc byte-identical to remote", JSON.stringify(stripMeta(calc)) === JSON.stringify(remoteOut),
    `\ncand=${JSON.stringify(stripMeta(calc)).slice(0,400)}\nremote=${JSON.stringify(remoteOut).slice(0,400)}`);
}

// ---------- B. strict parsers ----------
const SN = cand.paintStrictNumber;
t("B1 strict accepts number", SN(5) === 5);
t("B2 strict accepts numeric string", SN(" 5 ") === 5);
t("B3 strict accepts 0", SN(0) === 0 && SN("0") === 0);
t("B4 strict rejects blank", SN("") === null && SN("   ") === null);
t("B5 strict rejects nullish", SN(null) === null && SN(undefined) === null);
t("B6 strict rejects malformed", SN("abc") === null && SN("1/2") === null && SN({}) === null);
t("B7 strict rejects NaN/Infinity", SN(NaN) === null && SN(Infinity) === null && SN(-Infinity) === null);

const TN = cand.paintThicknessNumber;
t("B8 thickness parses fraction", TN("1/2") === 0.5);
t("B9 thickness parses mixed", TN("1-1/2") === 1.5 && TN("1 - 1/2") === 1.5);
t("B10 thickness parses whole/decimal", TN("2") === 2 && TN(0.75) === 0.75);
t("B11 thickness rejects junk", TN("abc") === null && TN("") === null && TN(null) === null && TN("-1") === -1 || TN("-1") === null);
// "-1" may parse as -1 (negative) — the scanner flags <0; either way it cannot price.
t("B12 thickness rejects 1/0 div-zero", TN("1/0") === null || !Number.isFinite(TN("1/0")));

// ---------- C. settings scanner ----------
t("C1 clean settings → no issues", avail.paintSettingIssues(SETTINGS).length === 0,
  JSON.stringify(avail.paintSettingIssues(SETTINGS)));

// Every priced key: recorded malformed → paint_catalog issue holding project.
const PRICED_KEYS = [
  "default_labor_rate", "min_labor_hours", "min_paint_cost", "default_paint_supplies_per_sqft",
  "paint_cost_per_unit", "hardener_cost_per_unit", "reducer_cost_per_unit",
  "paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio",
  "mixed_paint_coverage_sqft_per_gallon", "paint_waste_multiplier", "fixed_paint_waste_gallons",
  "paint_mask_rate_per_sqft", "paint_mask_machine_cutting_rate_per_sqft",
  "paint_mask_application_labor_rate_per_sqft", "paint_mask_cutting_labor_rate_per_sqft",
  "base_labor_hours_per_sqft", "setup_time_labor_hours", "paint_mixing_labor_hours",
  "color_change_setup_hours", "paint_gun_cleaning_hours",
  "one_side_paint_multiplier", "both_sides_paint_multiplier", "additional_color_multiplier",
  "simple_complexity_multiplier", "moderate_complexity_multiplier", "complex_complexity_multiplier",
  "letter_perimeter_factor",
];
for (const key of PRICED_KEYS) {
  const iss = avail.paintSettingIssues({ ...SETTINGS, [key]: "not-a-number" });
  t(`C2 malformed ${key} → issue`, iss.length === 1 && iss[0].kind === "paint_catalog"
    && iss[0].field === key && iss[0].hold === "project" && iss[0].code === "paint_setting_unavailable",
    JSON.stringify(iss));
}

// Explicit-zero legitimacy — nonnegative-allowed keys must accept 0; positive-required must not.
const ZERO_OK = [
  "min_labor_hours", "min_paint_cost", "default_paint_supplies_per_sqft",
  "paint_cost_per_unit", "hardener_cost_per_unit", "reducer_cost_per_unit",
  "hardener_mix_ratio", "reducer_mix_ratio", "fixed_paint_waste_gallons",
  "paint_mask_rate_per_sqft", "paint_mask_machine_cutting_rate_per_sqft",
  "paint_mask_application_labor_rate_per_sqft", "paint_mask_cutting_labor_rate_per_sqft",
  "base_labor_hours_per_sqft", "setup_time_labor_hours", "paint_mixing_labor_hours",
  "color_change_setup_hours", "paint_gun_cleaning_hours",
  "one_side_paint_multiplier", "both_sides_paint_multiplier", "additional_color_multiplier",
  "simple_complexity_multiplier", "moderate_complexity_multiplier", "complex_complexity_multiplier",
];
const ZERO_BAD = [
  "default_labor_rate", "paint_mix_ratio", "mixed_paint_coverage_sqft_per_gallon",
  "paint_waste_multiplier", "letter_perimeter_factor",
];
for (const key of ZERO_OK) {
  const iss = avail.paintSettingIssues({ ...SETTINGS, [key]: 0 });
  t(`C3 explicit-0 valid: ${key}`, iss.length === 0, JSON.stringify(iss));
}
for (const key of ZERO_BAD) {
  const iss = avail.paintSettingIssues({ ...SETTINGS, [key]: 0 });
  t(`C4 explicit-0 rejected: ${key}`, iss.length === 1 && iss[0].field === key, JSON.stringify(iss));
}
// Negative rejected everywhere.
for (const key of PRICED_KEYS) {
  const iss = avail.paintSettingIssues({ ...SETTINGS, [key]: -1 });
  t(`C5 negative rejected: ${key}`, iss.length === 1 && iss[0].field === key, JSON.stringify(iss));
}
// Absent keys fall back to defaults — never an issue.
{
  const iss = avail.paintSettingIssues({});
  t("C6 absent settings → no issues (defaults apply)", iss.length === 0, JSON.stringify(iss));
}

// Units: bad unit string or priced-liquid-without-unit → issue.
{
  t("C7 bad paint_unit", avail.paintSettingIssues({ ...SETTINGS, paint_unit: "bucket" }).some(i => i.field === "paint_unit"));
  t("C8 priced paint, unit absent", avail.paintSettingIssues({ ...SETTINGS, paint_unit: undefined }).some(i => i.field === "paint_unit"));
  t("C9 zero paint cost, unit absent → ok", avail.paintSettingIssues({ ...SETTINGS, paint_unit: undefined, paint_cost_per_unit: 0 }).filter(i => i.field === "paint_unit").length === 0);
}

// Tiers: malformed JSON or malformed rows → issue.
{
  t("C10 malformed tier JSON", avail.paintSettingIssues({ ...SETTINGS, panel_labor_tiers: "{oops" }).some(i => i.field === "panel_labor_tiers" && i.code === "paint_labor_tiers_unavailable"));
  t("C11 malformed tier row", avail.paintSettingIssues({ ...SETTINGS, panel_labor_tiers: JSON.stringify([{ min_quantity: "x", max_quantity: 5, labor_multiplier: 1 }]) }).some(i => i.code === "paint_labor_tier_row_unavailable"));
  t("C12 valid tiers pass", avail.paintSettingIssues({ ...SETTINGS, panel_labor_tiers: JSON.stringify([{ min_quantity: 1, max_quantity: 5, labor_multiplier: 0.9 }]) }).length === 0);
}

// ---------- D. item scanner ----------
t("D1 clean items → no issues",
  cleanProject().items.every((it, i) => avail.paintItemIssues(it, i).length === 0),
  JSON.stringify(cleanProject().items.flatMap((it, i) => avail.paintItemIssues(it, i))));

// thickness malformed → the original silent-0 defect
{
  const iss = avail.paintItemIssues({ ...panelItem(), thickness: "not-an-inch" }, 0);
  t("D2 malformed thickness → paint_thickness_unavailable",
    iss.some(i => i.field === "thickness" && i.code === "paint_thickness_unavailable" && i.hold === "item"), JSON.stringify(iss));
  t("D3 lettering 0 thickness flagged", avail.paintItemIssues({ ...letterItem(), thickness: "0" }, 0).some(i => i.field === "thickness"));
  t("D4 panel 0 thickness tolerated", !avail.paintItemIssues({ ...panelItem(), thickness: "0" }, 0).some(i => i.field === "thickness"));
  t("D5 negative thickness flagged", avail.paintItemIssues({ ...panelItem(), thickness: "-1" }, 0).some(i => i.field === "thickness"));
}
// dimensions
for (const [field, val] of [["length", ""], ["length", 0], ["length", "x"], ["width", -2], ["width", null]]) {
  t(`D6 ${field}=${JSON.stringify(val)} flagged`,
    avail.paintItemIssues({ ...panelItem(), [field]: val }, 0).some(i => i.field === field && i.code === "paint_dimension_unavailable"));
}
// quantity (panel) — 0/blank/malformed silently became 1
t("D7 quantity 0 flagged", avail.paintItemIssues({ ...panelItem(), quantity: 0 }, 0).some(i => i.field === "quantity"));
t("D8 quantity blank flagged", avail.paintItemIssues({ ...panelItem(), quantity: "" }, 0).some(i => i.field === "quantity"));
t("D9 quantity absent ok", avail.paintItemIssues({ ...panelItem(), quantity: undefined }, 0).length === 0);
t("D10 lettering quantity skipped", avail.paintItemIssues({ ...letterItem(), quantity: 0 }, 0).length === 0);
// paint_sides / mask / waste / supplies / colors / letter_size
t("D11 bad paint_sides", avail.paintItemIssues({ ...panelItem(), paint_sides: "sideways" }, 0).some(i => i.field === "paint_sides"));
t("D12 mask blank flagged", avail.paintItemIssues({ ...panelItem(), paint_mask_sqft: "" }, 0).some(i => i.field === "paint_mask_sqft"));
t("D13 mask junk flagged", avail.paintItemIssues({ ...panelItem(), paint_mask_sqft: "abc" }, 0).some(i => i.field === "paint_mask_sqft"));
t("D14 mask 0 ok", avail.paintItemIssues({ ...panelItem(), paint_mask_sqft: 0 }, 0).length === 0);
t("D15 waste junk flagged", avail.paintItemIssues({ ...panelItem(), fixed_waste_gallons: "some" }, 0).some(i => i.field === "fixed_waste_gallons"));
t("D16 supplies junk flagged", avail.paintItemIssues({ ...panelItem(), base_supplies_cost: "free" }, 0).some(i => i.field === "base_supplies_cost"));
t("D17 bad letter_size", avail.paintItemIssues({ ...letterItem(), letter_size: "huge" }, 0).some(i => i.field === "letter_size"));
t("D18 non-array colors", avail.paintItemIssues({ ...panelItem(), paint_colors: "red" }, 0).some(i => i.field === "paint_colors"));
t("D19 bad edge complexity", avail.paintItemIssues({ ...complexItem(), edge_complexity_multiplier: -1 }, 0).some(i => i.field === "edge_complexity_multiplier"));
t("D20 bad item_type", avail.paintItemIssues({ ...panelItem(), item_type: "mystery" }, 0).some(i => i.field === "item_type"));

// ---------- E. held calc semantics ----------
// Malformed thickness on one item: that item's derived numbers null, ALL
// totals null, raw row preserved, other items keep derived numbers.
{
  const proj = cleanProject();
  proj.items[1] = { ...proj.items[1], thickness: "bogus" };
  const { calc, issues, held } = avail.calcPaintingProject(proj, SETTINGS);
  t("E1 held=true", held === true);
  t("E2 calc.pricingUnavailable", calc.pricingUnavailable === true && calc.__held === true);
  t("E3 issues recorded on calc", calc.issues.length === issues.length && issues.length > 0);
  t("E4 held item derived null", ["supplies_cost", "paint_cost", "paint_gallons", "labor_hours", "labor_cost", "paintable_sqft"]
    .every(f => calc.items[1][f] === null));
  t("E5 held item raw fields preserved",
    calc.items[1].thickness === "bogus" && calc.items[1].description === "DIM letters" && calc.items[1].length === 12);
  t("E6 unheld items keep derived numbers",
    Number.isFinite(calc.items[0].paint_cost) && Number.isFinite(calc.items[2].labor_cost));
  t("E7 all totals null", Object.values(calc.totals).every(v => v === null),
    JSON.stringify(calc.totals));
  t("E8 liquidPaintRate still computable (item-hold only)", Number.isFinite(calc.liquidPaintRate));
}

// Settings hold → everything null incl. liquidPaintRate.
{
  const { calc, issues } = avail.calcPaintingProject(cleanProject(), { ...SETTINGS, paint_mix_ratio: "x" });
  t("E9 settings hold → all totals null", Object.values(calc.totals).every(v => v === null));
  t("E10 settings hold → rate null", calc.liquidPaintRate === null);
  t("E11 settings hold → all item derived null",
    calc.items.every(it => ["supplies_cost", "paint_cost", "labor_cost", "paint_gallons", "labor_hours", "paintable_sqft"].every(f => it[f] === null)));
  t("E12 issue kind paint_catalog", issues[0].kind === "paint_catalog" && issues[0].hold === "project");
}

// Project-level holds.
{
  t("E13 non-array items flagged", avail.calcPaintingProject({ items: "oops" }, SETTINGS).issues.some(i => i.code === "paint_items_unavailable" && i.hold === "project"));
  t("E14 malformed supplies rate flagged", avail.calcPaintingProject({ ...cleanProject(), paint_supplies_per_sqft: "abc" }, SETTINGS).issues.some(i => i.code === "paint_supplies_rate_unavailable" && i.hold === "project"));
  t("E15 supplies blank flagged", avail.calcPaintingProject({ ...cleanProject(), paint_supplies_per_sqft: "" }, SETTINGS).issues.some(i => i.code === "paint_supplies_rate_unavailable"));
}

// ---------- F. explicit-zero paths ----------
// F1–F3: zeros on keys where remote already honored 0 (plain num(), no ||)
// → byte-identical output.
{
  const s = { ...SETTINGS, paint_cost_per_unit: 0, hardener_cost_per_unit: 0, reducer_cost_per_unit: 0, fixed_paint_waste_gallons: 0, min_labor_hours: 0, min_paint_cost: 0 };
  const proj = cleanProject();
  const remoteOut = remote.calculatePaintingProject(JSON.parse(JSON.stringify(proj)), { ...s });
  const { calc, issues, held } = avail.calcPaintingProject(JSON.parse(JSON.stringify(proj)), { ...s });
  t("F1 zero-cost settings → no issues", issues.length === 0, JSON.stringify(issues));
  t("F2 zero-cost settings → not held", held === false);
  t("F3 non-resurrected zeros → byte-identical to remote", JSON.stringify(stripMeta(calc)) === JSON.stringify(remoteOut));
}
// F4–F6: zeros on keys the remote resurrected (`|| default`) are the actual
// defect being fixed — the candidate must honor them, producing a DIFFERENT
// (correct-per-author) result. mask material 0: cost = sqft*(0+0.10)*(n-1).
{
  const proj = { items: [{ ...panelItem(), paint_colors: ["A", "B"], paint_mask_sqft: 10 }] };
  const s = { ...SETTINGS, paint_mask_rate_per_sqft: 0 };
  const { calc, issues } = avail.calcPaintingProject(JSON.parse(JSON.stringify(proj)), { ...s });
  const remoteOut = remote.calculatePaintingProject(JSON.parse(JSON.stringify(proj)), { ...s });
  t("F4 honored-0 mask material → no issue", issues.length === 0, JSON.stringify(issues));
  t("F5 honored-0 mask material → $2.00 (10sf × 0.10 machine × 1 extra color × qty 2)",
    near(calc.totals.total_paint_mask_cost, 2.0), `got ${calc.totals.total_paint_mask_cost}`);
  t("F6 remote resurrected 0.75 → $17.00 (the bug being fixed)",
    near(remoteOut.totals.total_paint_mask_cost, 17.0), `got ${remoteOut.totals.total_paint_mask_cost}`);
}
// F7: multiplier 0 honored — extra-color LABOR markup zeroed, not resurrected
// (additional_color_multiplier scales baseHours, not paint cost).
{
  const proj = { items: [{ ...panelItem(), paint_colors: ["A", "B", "C"] }] };
  const s = { ...SETTINGS, additional_color_multiplier: 0 };
  const { calc, issues } = avail.calcPaintingProject(JSON.parse(JSON.stringify(proj)), { ...s });
  const remoteOut = remote.calculatePaintingProject(JSON.parse(JSON.stringify(proj)), { ...s });
  t("F7 honored-0 color multiplier → no issues + labor differs from remote",
    issues.length === 0 && !near(calc.totals.total_labor_cost, remoteOut.totals.total_labor_cost)
      && near(calc.totals.total_liquid_paint_and_supplies_cost, remoteOut.totals.total_liquid_paint_and_supplies_cost),
    `cand labor=${calc.totals.total_labor_cost} remote labor=${remoteOut.totals.total_labor_cost}`);
}

// ---------- G. paintSettingNumber semantics ----------
{
  const SN = cand.paintSettingNumber;
  t("G1 finite verbatim", SN({ k: 5 }, "k", 9) === 5 && SN({ k: "5" }, "k", 9) === 5);
  t("G2 explicit 0 honored", SN({ k: 0 }, "k", 9) === 0 && SN({ k: "0" }, "k", 9) === 0);
  t("G3 absent→fallback", SN({}, "k", 9) === 9 && SN({ k: undefined }, "k", 9) === 9
    && SN({ k: null }, "k", 9) === 9 && SN({ k: "" }, "k", 9) === 9 && SN({ k: "  " }, "k", 9) === 9);
  t("G4 malformed→fallback", SN({ k: "abc" }, "k", 9) === 9 && SN({ k: NaN }, "k", 9) === 9 && SN({ k: Infinity }, "k", 9) === 9);
  t("G5 negative→fallback", SN({ k: -3 }, "k", 9) === 9);
  t("G6 positive-required 0→fallback", SN({ k: 0 }, "k", 9, { positive: true }) === 9
    && SN({ k: -1 }, "k", 9, { positive: true }) === 9 && SN({ k: 2 }, "k", 9, { positive: true }) === 2);
}

// ---------- H. UI helpers ----------
t("H1 snapshot gate", avail.hasPaintCostSnapshot(5) && avail.hasPaintCostSnapshot(0)
  && !avail.hasPaintCostSnapshot(null) && !avail.hasPaintCostSnapshot("5") && !avail.hasPaintCostSnapshot(NaN));
t("H2 draft preserves blank", avail.paintDraftValue("") === "");
t("H3 draft parses", avail.paintDraftValue("2.5") === 2.5);
t("H4 draft keeps malformed raw", avail.paintDraftValue("abc") === "abc");
t("H5 field lookup", avail.hasIssueFor([{ field: "x", itemIndex: 2 }], "x", 2) && !avail.hasIssueFor([{ field: "x", itemIndex: 2 }], "y", 2));

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS painting-model");
