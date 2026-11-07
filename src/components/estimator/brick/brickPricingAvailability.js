// Brick & Stone pricing-availability layer.
//
// Wraps calcBrickStoneProject with strict finite-number input validation so a
// missing, malformed, or unusable pricing input can no longer silently become
// $0, a hidden default, or an exploded labor estimate. Mirrors the landed
// Foundation / Vinyl / Channel / Painting hardening convention:
//   - strict parsers (brickNumber / brickNonNegativeNumber /
//     brickPositiveNumber) — real numbers and trimmed numeric strings
//     accepted; "", "abc", "0x10", Infinity, NaN, null, undefined rejected
//     (the calculator's num("") / num(null) laundered those to 0 and
//     num("0x10") parsed as 16 silently).
//   - structured issue records { kind, index, itemIndex, inventoryId, field,
//     code, message, hold } split into authored-input issues (kind "brick")
//     and catalog issues (kind "brick_catalog": the selected material row).
//   - every hold is project-level: the module returns one flat totals object,
//     so a tainted input poisons every derived number — the wrapper nulls
//     them all and the saved acknowledged snapshot on the record is the
//     display fallback, never an invented $0.
//   - explicit 0 stays valid where the calculator treats it as a real
//     free/zero amount (mortar bag cost, mason rate, markup, a flat side);
//     it is invalid where it silently erases the price (waste factor,
//     courses, both wall extents, a layer count below 1, the bricks-per-hour
//     clamp).
//   - raw rows are never mutated — the calculator reads the original records
//     exactly as BrickStoneEstimator has always passed them.
//
// Valid inputs take the exact same code path as before: the calc object the
// page receives for a clean project is bit-identical to today's result (plus
// __held / pricingUnavailable / issues metadata flags). brickCalc itself is
// unchanged, so builder/partSync keeps the identical calculator and output
// contract it has always had.

import { calcBrickStoneProject } from "./brickCalc";

// ---------- strict parsers ----------
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", "0x10", Infinity, NaN, null, undefined, objects.
export const brickNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
export const brickNonNegativeNumber = (v) => {
  const n = brickNumber(v);
  return n !== null && n >= 0 ? n : null;
};
export const brickPositiveNumber = (v) => {
  const n = brickNumber(v);
  return n !== null && n > 0 ? n : null;
};

// A value actually stored on the record. Absent (undefined) fields fall back
// to the module default by design and are never an issue; a stored "" or null
// is recorded-but-unusable — before this layer, num("") / num(null) laundered
// them to 0 silently instead of resolving the default.
export const brickRecorded = (v) => v !== undefined && v !== null;

// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasBrickCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Blank-preserving input helper for number fields: "" stays "" so the input
// does not fight the user mid-typing; parseable text becomes a number;
// anything else stays raw so validation can flag it instead of laundering it
// into 0 (the editor's parseFloat(...) || 0 did that silently before).
export const brickDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, inventoryId = null, field, code, message, hold = "project" }) => ({
  kind, index, itemIndex, inventoryId, field, code, message, hold,
});

// ---------- material (catalog) scan ----------
// The selected material row is the priced catalog surface: its dimensions
// drive wall geometry and its unit cost drives material pricing. Missing or
// malformed catalog values silently resolved 0 before — a "free" material or
// a dimensionless wall saved anyway.
export const brickMaterialIssues = (project = {}, material = null) => {
  const issues = [];
  const add = (field, code, message, inventoryId = null) =>
    issues.push(issue("brick_catalog", { inventoryId, field, code, message, hold: "project" }));

  const selectedId = project?.selected_material_id;
  if (!selectedId) {
    add("selected_material_id", "brick_material_unavailable",
      "select a brick or stone material — a wall priced without one silently bills $0 material");
    return issues;
  }
  if (!material) {
    add("selected_material_id", "brick_material_unavailable",
      "the selected material record is no longer available — reselect the brick or stone material",
      selectedId);
    return issues;
  }

  const label = material.material_name || "the selected material";
  for (const [field, human] of [
    ["length", "unit length (inches)"],
    ["width", "unit width (inches)"],
    ["height", "unit height (inches)"],
  ]) {
    if (brickPositiveNumber(material[field]) === null) {
      add(field, "brick_material_dimension_unavailable",
        `Material "${label}": record a positive, finite ${human} in the masonry catalog — a missing dimension silently prices as 0"`,
        material.id ?? null);
    }
  }
  if (brickNonNegativeNumber(material.cost_per_unit) === null) {
    add("cost_per_unit", "brick_material_price_unavailable",
      `Material "${label}": record a finite, nonnegative cost per unit — a missing price is not free`,
      material.id ?? null);
  }
  return issues;
};

// ---------- project-level scan ----------
// Every project field calcBrickStoneProject prices from. All holds are
// project-level: the module returns one flat totals object, so a tainted
// input poisons every derived number.
export const brickProjectInputIssues = (project = {}) => {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("brick", { field, code, message, hold: "project" }));

  // Required wall extents — the editor displays hint defaults (6 / 9) that are
  // never stored, while the calculator prices an unset value as 0: an absent
  // count silently priced a different wall than the one on screen. A recorded
  // 0 stays a legitimate flat side.
  for (const [field, human] of [
    ["bricks_along_length", "brick count along the length"],
    ["bricks_along_width", "brick count along the width"],
  ]) {
    if (!brickRecorded(project?.[field])) {
      add(field, "brick_dimension_unavailable",
        `record the ${human} — the displayed hint is not stored, so an unset value silently prices as 0 (record 0 for a flat side)`);
      continue;
    }
    const n = brickNumber(project[field]);
    if (n === null || n < 0) {
      add(field, "brick_dimension_unavailable",
        `record a finite, nonnegative ${human} — the stored value cannot price the wall`);
    }
  }
  // A wall needs SOME extent — 0 along both axes prices no perimeter at all.
  const alongLength = brickNumber(project?.bricks_along_length);
  const alongWidth = brickNumber(project?.bricks_along_width);
  if (alongLength !== null && alongWidth !== null
    && alongLength >= 0 && alongWidth >= 0 && alongLength + alongWidth <= 0) {
    add("bricks_along_length", "brick_wall_extent_unavailable",
      "record bricks along the length or the width — a wall with no extent cannot be priced");
  }

  // courses_high — same display-hint divergence (shows 5, prices 0); a
  // recorded 0 is no wall at all, so positive is required.
  if (!brickRecorded(project?.courses_high)) {
    add("courses_high", "brick_courses_unavailable",
      "record the courses high — the displayed hint is not stored, so an unset value silently prices no wall");
  } else if (brickPositiveNumber(project.courses_high) === null) {
    add("courses_high", "brick_courses_unavailable",
      "record a positive, finite courses high — a zero or malformed count prices no wall");
  }

  // layers — the calculator clamped Math.max(1, x), so a recorded value below
  // 1 (or malformed) silently repriced as a single layer.
  if (brickRecorded(project?.layers)) {
    const n = brickNumber(project.layers);
    if (n === null || n < 1) {
      add("layers", "brick_layers_unavailable",
        "record a layer count of 1 or more — a lower or malformed value silently prices as 1 layer");
    }
  }

  // mortar_gap — nonnegative; malformed text silently resolved the 0.375"
  // default and a negative gap priced negative joint volume.
  if (brickRecorded(project?.mortar_gap) && brickNonNegativeNumber(project.mortar_gap) === null) {
    add("mortar_gap", "brick_mortar_gap_unavailable",
      "record a finite, nonnegative mortar gap in inches — the stored value cannot price mortar joints");
  }

  // waste_factor — multiplies the whole brick count; 0 or negative silently
  // priced a $0 wall while the surface-area save gate still passed (derived
  // geometry never reads the factor).
  if (brickRecorded(project?.waste_factor) && brickPositiveNumber(project.waste_factor) === null) {
    add("waste_factor", "brick_waste_factor_unavailable",
      "record a positive, finite waste factor (1.0 = exact count) — a zero or negative factor silently prices $0 materials");
  }

  // mortar_bag_cost — nonnegative; malformed silently resolved the $12
  // default. An explicit 0 stays a legitimate free bag.
  if (brickRecorded(project?.mortar_bag_cost) && brickNonNegativeNumber(project.mortar_bag_cost) === null) {
    add("mortar_bag_cost", "brick_mortar_cost_unavailable",
      "record a finite, nonnegative mortar bag cost — the stored value cannot price mortar");
  }

  // bricks_per_hour — the divisor in the labor calc: the calculator clamped
  // Math.max(1, x), so a recorded 0, fraction, or malformed rate silently
  // repriced labor at 1 brick/hour — an order-of-magnitude explosion.
  if (brickRecorded(project?.bricks_per_hour)) {
    const n = brickNumber(project.bricks_per_hour);
    if (n === null || n < 1) {
      add("bricks_per_hour", "brick_lay_rate_unavailable",
        "record a laying rate of 1 brick/hour or more — a lower or malformed rate silently reprices labor at 1/hr");
    }
  }

  // labor_rate_per_hour — nonnegative; malformed silently resolved the $55
  // default. An explicit 0 stays legitimate free labor.
  if (brickRecorded(project?.labor_rate_per_hour) && brickNonNegativeNumber(project.labor_rate_per_hour) === null) {
    add("labor_rate_per_hour", "brick_labor_rate_unavailable",
      "record a finite, nonnegative mason labor rate per hour — the stored value cannot price labor");
  }

  // markup_percent — nonnegative; malformed silently resolved 0. An explicit
  // 0 stays a legitimate no-markup price.
  if (brickRecorded(project?.markup_percent) && brickNonNegativeNumber(project.markup_percent) === null) {
    add("markup_percent", "brick_markup_unavailable",
      "record a finite, nonnegative markup % or clear it — the stored value cannot price markup");
  }

  return issues;
};

// ---------- calc wrapper ----------
// Returns { calc, issues, held }. The calc keeps the real result shape; when
// held, every derived number is null — the saved acknowledged totals on the
// record are the display fallback, never an invented $0. Raw rows are
// untouched and calcBrickStoneProject itself is unchanged (partSync keeps the
// identical calculator contract).
export const calcBrickStoneAvailability = (project = {}, material = null) => {
  const issues = [
    ...brickMaterialIssues(project, material),
    ...brickProjectInputIssues(project),
  ];
  const calc = calcBrickStoneProject(project, material);
  if (!issues.length) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held: false };
  }

  const out = { ...calc };
  for (const field of Object.keys(out)) {
    if (typeof out[field] === "number") out[field] = null;
  }
  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held: true };
};

// ---------- UI helpers ----------
// All issues attached to a single field (optionally a single item row).
export const issuesForField = (issues = [], field, itemIndex = null) =>
  issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
export const hasIssueFor = (issues = [], field, itemIndex = null) =>
  issuesForField(issues, field, itemIndex).length > 0;
