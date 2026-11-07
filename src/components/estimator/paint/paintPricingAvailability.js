// Painting pricing-availability layer.
//
// Wraps calculatePaintingProject with strict finite-number input validation so
// a missing, malformed, or unusable pricing input can no longer silently
// become $0, a hidden default, or a dropped item edge. Mirrors the landed
// Foundation/Vinyl hardening convention:
//   - strict parsers (paintStrictNumber / paintSettingNumber / paintThicknessNumber,
//     owned by paintCalc so the calculator and the scanner resolve identically)
//   - structured issue records { kind, index, itemIndex, field, code, message, hold }
//   - Painting has no catalog entities — the shared Settings rows are the
//     priced surface, so settings issues are kind "paint_catalog" and hold the
//     whole project calc; authored item/project-field issues hold the affected
//     item's derived numbers and every aggregate those numbers feed.
//   - explicit 0 stays valid where the calculator treats it as a real
//     free/zero amount (rates, multipliers, hours, floors, costs); 0 is
//     invalid where the math divides or needs a real magnitude (coverage, the
//     paint mix ratio, the waste multiplier, the labor rate divisor, the
//     letter perimeter factor).
//   - raw rows are never mutated — the calculator reads the original records
//     exactly as PaintingEstimator has always passed them.
//
// Valid inputs take the exact same code path as before: the calc object the
// page receives for a clean project is bit-identical to today's result (plus
// __held / pricingUnavailable / issues metadata flags).

import {
  calculatePaintingProject,
  paintSettingNumber,
  paintSettingRecorded,
  paintStrictNumber,
  paintThicknessNumber,
} from "./paintCalc";

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind, index, itemIndex, field, code, message, hold,
});

// ---------- settings scan ----------
// Every Settings row the calculator prices from. [key, human, positive]
// positive: true  → recorded value must be > 0
// positive: false → recorded value must be finite and >= 0
const PRICED_SETTINGS = [
  ["default_labor_rate", "default labor rate ($/hr)", true],
  ["min_labor_hours", "minimum labor hours floor", false],
  ["min_paint_cost", "minimum paint cost floor", false],
  ["default_paint_supplies_per_sqft", "default paint supplies per sq ft", false],
  ["paint_cost_per_unit", "paint cost per unit", false],
  ["hardener_cost_per_unit", "hardener cost per unit", false],
  ["reducer_cost_per_unit", "reducer cost per unit", false],
  ["paint_mix_ratio", "paint mix ratio", true],
  ["hardener_mix_ratio", "hardener mix ratio", false],
  ["reducer_mix_ratio", "reducer mix ratio", false],
  ["mixed_paint_coverage_sqft_per_gallon", "mixed paint coverage (sq ft/gallon)", true],
  ["paint_waste_multiplier", "paint waste multiplier", true],
  ["fixed_paint_waste_gallons", "fixed paint waste (gallons)", false],
  ["paint_mask_rate_per_sqft", "paint mask material rate per sq ft", false],
  ["paint_mask_machine_cutting_rate_per_sqft", "paint mask machine cutting rate per sq ft", false],
  ["paint_mask_application_labor_rate_per_sqft", "paint mask application labor rate per sq ft", false],
  ["paint_mask_cutting_labor_rate_per_sqft", "paint mask cutting labor rate per sq ft", false],
  ["base_labor_hours_per_sqft", "base labor hours per sq ft", false],
  ["setup_time_labor_hours", "setup time (hours)", false],
  ["paint_mixing_labor_hours", "paint mixing labor hours per mix", false],
  ["color_change_setup_hours", "color change setup hours", false],
  ["paint_gun_cleaning_hours", "paint gun cleaning hours", false],
  ["one_side_paint_multiplier", "one-side paint multiplier", false],
  ["both_sides_paint_multiplier", "both-sides paint multiplier", false],
  ["additional_color_multiplier", "additional color multiplier", false],
  ["simple_complexity_multiplier", "simple complexity multiplier", false],
  ["moderate_complexity_multiplier", "moderate complexity multiplier", false],
  ["complex_complexity_multiplier", "complex complexity multiplier", false],
  ["letter_perimeter_factor", "letter perimeter factor", true],
];

const PAINT_UNITS = ["oz", "pint", "quart", "liter", "gallon"];
const TIER_SETTINGS = [
  ["panel_labor_tiers", "panel labor tiers"],
  ["complex_shapes_labor_tiers", "complex shape labor tiers"],
  ["lettering_labor_tiers", "lettering labor tiers"],
];

// Settings rows the calc prices from. Only recorded values can be broken —
// an absent row falls back to the documented module default by design, so it
// is never an issue. Every settings issue holds the whole project calc.
export function paintSettingIssues(settings = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("paint_catalog", { field, code, message, hold: "project" }));

  for (const [key, human, positive] of PRICED_SETTINGS) {
    if (!paintSettingRecorded(settings, key)) continue;
    const n = paintStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(key, "paint_setting_unavailable",
        `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in Painting Settings — the stored value cannot price this estimate`);
    }
  }

  // Liquid unit selectors — a recorded-but-unsupported unit resolves 0 in
  // costPerGallon (silently free); a missing unit next to a priced component
  // does the same.
  for (const [costKey, unitKey, human] of [
    ["paint_cost_per_unit", "paint_unit", "paint"],
    ["hardener_cost_per_unit", "hardener_unit", "hardener"],
    ["reducer_cost_per_unit", "reducer_unit", "reducer"],
  ]) {
    const unitRecorded = paintSettingRecorded(settings, unitKey);
    const unitValid = PAINT_UNITS.includes(settings?.[unitKey]);
    if (unitRecorded && !unitValid) {
      add(unitKey, "paint_liquid_unit_unavailable",
        `Setting ${unitKey}: select a supported ${human} unit (oz / pint / quart / liter / gallon) in Painting Settings`);
    } else if (!unitValid && (paintStrictNumber(settings?.[costKey]) ?? 0) > 0) {
      add(unitKey, "paint_liquid_unit_unavailable",
        `Setting ${unitKey}: set a ${human} unit — a recorded ${costKey} prices as $0 without one`);
    }
  }

  // Labor tier tables are JSON arrays of {min_quantity, max_quantity,
  // labor_multiplier}. Malformed JSON silently disables the whole table;
  // malformed row fields silently dead-window the tier or reprice it.
  for (const [key, human] of TIER_SETTINGS) {
    if (!paintSettingRecorded(settings, key)) continue;
    const raw = settings[key];
    let tiers = raw;
    if (!Array.isArray(tiers)) {
      try {
        const parsed = JSON.parse(raw || "[]");
        tiers = Array.isArray(parsed) ? parsed : null;
      } catch {
        tiers = null;
      }
    }
    if (tiers === null) {
      add(key, "paint_labor_tiers_unavailable",
        `Setting ${key}: the ${human} table is not a valid JSON array — repair it in Painting Settings or quantity discounts price as 1x`);
      continue;
    }
    tiers.forEach((row, rowIdx) => {
      const where = `Setting ${key} row ${rowIdx + 1}`;
      for (const [field, human2] of [["min_quantity", "minimum quantity"], ["max_quantity", "maximum quantity"]]) {
        if (row?.[field] !== undefined && row?.[field] !== null
          && (paintStrictNumber(row[field]) === null || paintStrictNumber(row[field]) < 0)) {
          add(key, "paint_labor_tier_row_unavailable",
            `${where}: record a finite, nonnegative ${human2} — the stored value dead-windows this tier`);
        }
      }
      if (row?.labor_multiplier !== undefined && row?.labor_multiplier !== null
        && (paintStrictNumber(row.labor_multiplier) === null || paintStrictNumber(row.labor_multiplier) < 0)) {
        add(key, "paint_labor_tier_row_unavailable",
          `${where}: record a finite, nonnegative labor multiplier — the stored value cannot price this tier`);
      }
    });
  }

  return issues;
}

// ---------- item-level scan ----------
// Consumed fields on each paint item. Issues hold the item's derived numbers
// (hold "item") — totals re-derive null because they sum held items.
const LETTER_SIZES = ["extra_small", "small", "normal", "medium", "large", "extra_large"];
const PRESENT = (v) => v !== undefined && v !== null;
// For this module a cleared stored value is malformed input, not an absent
// one: paintCalc's num("") launders to 0 / a clamp to 1 silently.
const nonnegField = (v) => paintStrictNumber(v) !== null && paintStrictNumber(v) >= 0;

export function paintItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) =>
    issues.push(issue("paint", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));

  // item_type — every geometry branch keys on it; anything else prices a
  // silent $0 item.
  if (PRESENT(rawItem?.item_type) && !["panel", "lettering", "complex_shapes"].includes(rawItem.item_type)) {
    add("item_type", "paint_item_type_unavailable",
      "select Panel, Lettering, or Complex Shape — the stored type prices as $0 silently");
  }
  const effectiveType = rawItem?.item_type || "panel";

  // thickness — the strict imperial parse: malformed text used to vanish into
  // 0 (edge area silently dropped; "-1" even laundered to +1). Panel math has
  // an explicit edge-less branch so a real 0 is tolerated there; lettering
  // and complex shapes price nothing at all without a positive thickness.
  if (rawItem?.thickness !== undefined) {
    const t = paintThicknessNumber(rawItem.thickness);
    if (t === null || t < 0) {
      add("thickness", "paint_thickness_unavailable",
        "record a usable thickness (inches, e.g. 1/2 or 1-1/4) — the stored value silently drops edge pricing");
    } else if (t === 0 && effectiveType !== "panel") {
      add("thickness", "paint_thickness_unavailable",
        "record a positive thickness — lettering and complex shapes price nothing at 0\"");
    }
  }

  // length / width — every branch gates > 0; blank, zero, negative or
  // malformed dimensions silently collapse the item's paint and labor.
  for (const field of ["length", "width"]) {
    const n = paintStrictNumber(rawItem?.[field]);
    if (n === null || n <= 0) {
      add(field, "paint_dimension_unavailable",
        `record a positive, finite ${field === "length" ? (effectiveType === "lettering" ? "letter count" : "length") : (effectiveType === "lettering" ? "letter height" : "width")} (inches) — a blank or zero dimension prices the item as $0 silently`);
    }
  }

  // quantity — lettering forces 1 by design; other types clamp <1 to 1 in the
  // math, so a recorded 0/blank/malformed value silently repriced as one.
  if (effectiveType !== "lettering" && PRESENT(rawItem?.quantity)) {
    const q = paintStrictNumber(rawItem.quantity);
    if (q === null || q < 1) {
      add("quantity", "paint_quantity_unavailable",
        "record a quantity of 1 or more — a blank or malformed value prices as 1 silently");
    }
  }

  // paint_sides — the stored value chooses the multiplier branch; "none" is a
  // tolerated legacy alias for one_side.
  if (PRESENT(rawItem?.paint_sides) && rawItem.paint_sides !== ""
    && !["one_side", "both_sides", "none"].includes(rawItem.paint_sides)) {
    add("paint_sides", "paint_sides_unavailable",
      "choose One side or Both sides — the stored value silently prices as one side");
  }

  // edge complexity — complex-shape edge multiplier; negative values priced
  // negative edge area, malformed text repriced as 1x, blank as 0 edges.
  if (effectiveType === "complex_shapes" && PRESENT(rawItem?.edge_complexity_multiplier)
    && !nonnegField(rawItem.edge_complexity_multiplier)) {
    add("edge_complexity_multiplier", "paint_edge_complexity_unavailable",
      "record a finite, nonnegative edge complexity multiplier — the stored value cannot price edges");
  }

  // paint mask sq ft — consumed when more than one color is selected; blank
  // or malformed text silently priced as no mask.
  if (PRESENT(rawItem?.paint_mask_sqft) && !nonnegField(rawItem.paint_mask_sqft)) {
    add("paint_mask_sqft", "paint_mask_sqft_unavailable",
      "record a finite, nonnegative paint mask area (sq ft) — the stored value drops mask pricing");
  }

  // fixed waste gallons / base supplies — recorded junk silently became 0.
  for (const [field, human] of [["fixed_waste_gallons", "fixed waste (gallons)"], ["base_supplies_cost", "base supplies cost ($)"]]) {
    if (PRESENT(rawItem?.[field]) && !nonnegField(rawItem[field])) {
      add(field, field === "fixed_waste_gallons" ? "paint_fixed_waste_unavailable" : "paint_base_supplies_unavailable",
        `record a finite, nonnegative ${human} — the stored value silently became $0`);
    }
  }

  // letter_size — drives the complexity class for lettering only.
  if (effectiveType === "lettering" && PRESENT(rawItem?.letter_size) && rawItem.letter_size !== ""
    && !LETTER_SIZES.includes(rawItem.letter_size)) {
    add("letter_size", "paint_letter_size_unavailable",
      "the stored letter size is unsupported — it silently prices as moderate complexity");
  }

  // paint_colors — the math reads the array length verbatim (ported); a
  // non-array value normalized to [] silently bills no paint.
  if (PRESENT(rawItem?.paint_colors) && !Array.isArray(rawItem.paint_colors)) {
    add("paint_colors", "paint_colors_unavailable",
      "the stored color list is malformed — it silently bills $0 paint; re-add the colors");
  }

  return issues;
}

// ---------- project-level scan ----------
export function paintProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("paint", { field, code, message, hold: "project" }));

  // items must be an array — the calc maps it verbatim.
  if (project?.items !== undefined && !Array.isArray(project.items)) {
    add("items", "paint_items_unavailable",
      "the stored paint items are malformed — the project cannot be repriced");
  }

  // paint_supplies_per_sqft — blank/null laundered to $0 under num(); a
  // malformed string silently became the settings default. Explicit 0 stays a
  // legitimate free supplies rate.
  if (project?.paint_supplies_per_sqft !== undefined
    && (paintStrictNumber(project.paint_supplies_per_sqft) === null
      || paintStrictNumber(project.paint_supplies_per_sqft) < 0)) {
    add("paint_supplies_per_sqft", "paint_supplies_rate_unavailable",
      "record a finite, nonnegative supplies rate per sq ft — a blank or malformed value silently repriced supplies");
  }

  return issues;
}

// ---------- calc wrapper ----------
// Returns { calc, issues, held }. The calc keeps the real result shape; when
// held, every derived number a flagged input could have tainted is null —
// saved acknowledged totals on the record are the display fallback, never an
// invented $0. Raw rows are untouched.
const ITEM_HELD_FIELDS = ["supplies_cost", "paint_cost", "paint_gallons", "labor_hours", "labor_cost", "paintable_sqft"];

export function calcPaintingProject(project = {}, settings = {}) {
  const issues = [
    ...paintSettingIssues(settings),
    ...((Array.isArray(project?.items) ? project.items : [])
      .flatMap((item, index) => paintItemIssues(item, index))),
    ...paintProjectInputIssues(project),
  ];

  // A non-array items value is itself a project-level hold; hand the calc an
  // empty list so it still returns a real result shape (the input object is
  // never mutated — totals are nulled below regardless).
  const calcable = Array.isArray(project?.items) ? project : { ...project, items: [] };
  const calc = calculatePaintingProject(calcable, settings);
  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held };
  }

  const out = { ...calc, totals: { ...calc.totals } };
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = new Set(issues.filter((i) => i.hold === "item").map((i) => i.itemIndex));

  // Held items keep their raw row but lose every derived number — the totals
  // sum those numbers so every aggregate is untrustworthy too.
  out.items = calc.items.map((item, index) => {
    if (!hasProjectHold && !itemHolds.has(index)) return item;
    const heldItem = { ...item };
    for (const field of ITEM_HELD_FIELDS) heldItem[field] = null;
    return heldItem;
  });
  for (const field of Object.keys(out.totals)) out.totals[field] = null;
  if (hasProjectHold) out.liquidPaintRate = null;

  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held };
}

// ---------- UI helpers ----------
// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasPaintCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Blank-preserving input helper for number fields: "" stays "" so the input
// does not fight the user mid-typing; parseable text becomes a number;
// anything else stays raw so validation can flag it instead of laundering it
// into 0 (paintCalc's num("") silently read as 0 before).
export const paintDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// All issues attached to a single field (optionally a single item row).
export const issuesForField = (issues = [], field, itemIndex = null) =>
  issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
export const hasIssueFor = (issues = [], field, itemIndex = null) =>
  issuesForField(issues, field, itemIndex).length > 0;
