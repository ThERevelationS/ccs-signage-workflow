// CNC pricing-availability layer.
//
// The live CNC calculator is page-inline in CNCEstimator.jsx (updateItem +
// calculateTotals): item rows store derived snapshots (machine_time_hours,
// setup_time_hours, machine_cost, labor_cost) computed at edit time from the
// project's rates and the Settings rows. This module owns:
//   - strict parsers (cncStrictNumber / cncNonNegativeNumber /
//     cncPositiveNumber); numeric strings accepted, "", "abc", Infinity, NaN,
//     null, undefined rejected.
//   - structured issue records { kind, index, itemIndex, field, code, message,
//     hold } split into authored-input issues (kind "cnc") and settings-side
//     catalog issues (kind "cnc_catalog"). CNC has no catalog entities — the
//     shared Settings rows are the priced surface.
//   - a derived pricing pass (computeCncItemPricing / computeCncTotals) that
//     mirrors the page-inline math byte-identically on the valid path, so
//     totals are recomputed from the CURRENT raw inputs every render — the
//     remote reprice-staleness defect (project-rate edits left stored item
//     snapshots stale) cannot persist stale totals as current.
//   - calcCncPricing: one pass returning { items, totals, issues, held }.
//     Held items keep their raw row but lose every derived number; totals
//     re-derive null-propagating and the page falls back to the saved
//     acknowledged snapshot — never an invented $0.
//   - explicit 0 stays valid where the math treats it as a real free/zero
//     amount (rates, percentages, hour floors); 0 is invalid where the math
//     divides by it or the value silently cancels a priced leg (cut speed,
//     carve speed, letter perimeter factor, material cut multiplier, letter
//     count/height, quantity).
//   - raw rows are never mutated — the derived pass reads the original
//     records exactly as updateItem always consumed them.
//
// Settings consumption split (why some keys are project-scanned, not
// settings-scanned): four keys are copied INTO the project at load
// (cnc_machine_rate → machine_rate_per_hour, cnc_labor_rate → labor_rate,
// cnc_setup_time_percentage → setup_time_percentage, min_cnc_setup_hours →
// fixed_setup_hours) — the CONSUMED value is the project field, so those are
// validated there (also avoids double-flagging one root cause). The rest are
// read live from Settings on every calc and are settings-scanned here.

// ---------- strict parsers ----------
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", Infinity, NaN, null, undefined, objects.
export const cncStrictNumber = (v) => {
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
export const cncNonNegativeNumber = (v) => {
  const n = cncStrictNumber(v);
  return n !== null && n >= 0 ? n : null;
};
export const cncPositiveNumber = (v) => {
  const n = cncStrictNumber(v);
  return n !== null && n > 0 ? n : null;
};

// A value that was actually recorded on the record — absent/blank/whitespace
// is "not recorded" (settings blank = falls back to the documented default).
const recorded = (v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
export const cncSettingRecorded = (settings, key) => recorded(settings?.[key]);
// Strict read of a Settings row: the finite number, or null when the recorded
// value is unusable (malformed/non-finite). Absent also reads null — callers
// distinguish via cncSettingRecorded.
export const cncSettingNumber = (settings, key) => cncStrictNumber(settings?.[key]);

// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasCncCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Blank-preserving input helper for number fields (paint/channel pattern):
// "" stays "" so the input does not fight the user mid-typing; parseable text
// becomes a number; anything else stays raw so validation can flag it instead
// of laundering it into 0 (remote parseFloat||0 silently read "" as 0).
export const cncDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind, index, itemIndex, field, code, message, hold,
});

// ---------- constants mirrored from the page ----------
// These lists describe which keys/fields the page-inline calculator consumes;
// they are NOT new formulas — the formulas stay mirrored in
// computeCncItemPricing / computeCncTotals below.
const CNC_MATERIALS = ["Acrylic", "Wood", "MDF", "Plywood", "PVC", "HDPE", "Aluminum", "Corian"];
const CNC_ITEM_TYPES = ["panel", "lettering", "3d_carving"];
const IMPERIAL_SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"];
const CUT_SPEED_KEYS = IMPERIAL_SIZES.map((s) => `cnc_cut_speed_${s.replace("/", "_").replace("-", "_")}`);
const CUT_MULTIPLIER_KEYS = CNC_MATERIALS.map((m) => `${m.toLowerCase()}_cnc_cut_multiplier`);

// ---------- settings scan ----------
// Live-consumed Settings rows. Only recorded values can be broken — an absent
// row falls back to the documented module default by design, so it is never an
// issue. Every settings issue holds the whole project calc.
//   positive: true  → recorded value must be > 0 (divisors and factors where
//                     0 silently cancels a priced leg)
//   positive: false → recorded value must be finite and >= 0
const LIVE_SETTINGS = [
  ["cnc_letter_perimeter_factor", "letter perimeter factor", true],
  ["min_cnc_labor_hours", "minimum dynamic labor hours floor", false],
  ...CUT_SPEED_KEYS.map((k) => [k, "cut speed (in/min)", true]),
  ...CUT_MULTIPLIER_KEYS.map((k) => [k, "material cut multiplier", true]),
];

export function cncSettingIssues(settings = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("cnc_catalog", { field, code, message, hold: "project" }));
  for (const [key, human, positive] of LIVE_SETTINGS) {
    if (!cncSettingRecorded(settings, key)) continue;
    const n = cncStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(key, "cnc_setting_unavailable",
        `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in CNC Settings — the stored value cannot price this estimate`);
    }
  }
  return issues;
}

// ---------- item-level scan ----------
// Consumed fields on each CNC item. Issues hold the item's derived numbers
// (hold "item") — totals re-derive null because they sum held items.
export function cncItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) =>
    issues.push(issue("cnc", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));

  // item_type — the cut leg keys on it; anything else silently prices the cut
  // leg as $0 (a stored carve leg can still bill — flagged regardless since
  // the row's type cannot be determined).
  const type = rawItem?.item_type;
  const typeKnown = CNC_ITEM_TYPES.includes(type);
  if (!typeKnown) {
    add("item_type", "cnc_item_type_unavailable",
      "select Panel Cut, Lettering Cut, or 3D Carving — the stored type silently prices the cut leg as $0");
  }
  const cutLeg = type === "panel" || type === "lettering";

  // quantity — consumed as a direct multiplier for every type except
  // lettering (lettering forces qty 1 by design — unconsumed there).
  // Absent/malformed laundered to NaN → silent $0 row in remote totals.
  if (type !== "lettering" && typeKnown) {
    const q = cncStrictNumber(rawItem?.quantity);
    if (q === null || q < 1) {
      add("quantity", "cnc_quantity_unavailable",
        "record a quantity of 1 or more — a blank or malformed value silently zeroes this item's machine time");
    }
  }

  // material_type — drives the <material>_cnc_cut_multiplier Settings key,
  // consumed only on the cut leg (panel/lettering). Unknown/missing resolves
  // to a silent 1× multiplier in remote (parseFloat(undefined)||1.0).
  if (cutLeg) {
    const mt = rawItem?.material_type;
    if (!recorded(mt) || !CNC_MATERIALS.map((m) => m.toLowerCase()).includes(String(mt).toLowerCase())) {
      add("material_type", "cnc_material_unavailable",
        "choose a known material — the stored value silently prices the cut multiplier as 1×");
    }
  }

  if (type === "panel") {
    // length / width — consumed (l + w) * 2. Each must be finite, nonnegative;
    // both at 0 silently prices a $0 panel (no cut perimeter).
    for (const [field, human] of [["length", "length"], ["width", "height"]]) {
      const n = cncStrictNumber(rawItem?.[field]);
      if (n === null || n < 0) {
        add(field, "cnc_dimension_unavailable",
          `record a finite, nonnegative ${human} (inches) — the stored value cannot price the cut perimeter`);
      }
    }
    const l = cncStrictNumber(rawItem?.length);
    const w = cncStrictNumber(rawItem?.width);
    if (l !== null && w !== null && l >= 0 && w >= 0 && l + w === 0) {
      add("length", "cnc_dimension_unavailable",
        "a 0 × 0 panel has no cut perimeter — it silently prices as $0");
    }
  }

  if (type === "lettering") {
    // letter_height × perimeter factor × num_letters — every factor must be
    // positive; a 0 or malformed leg silently prices the letters as $0.
    if (cncPositiveNumber(rawItem?.letter_height) === null) {
      add("letter_height", "cnc_dimension_unavailable",
        "record a positive, finite letter height (inches) — a blank or zero height silently prices the letters as $0");
    }
    if (cncPositiveNumber(rawItem?.num_letters) === null) {
      add("num_letters", "cnc_dimension_unavailable",
        "record a positive, finite letter count — a blank or zero count silently prices the letters as $0");
    }
  }

  // cut_speed_ipm — the divisor on the cut leg. Gated > 0 in remote math, so
  // a 0/blank/malformed stored speed silently drops cut pricing (the
  // thickness preset writes this from cnc_cut_speed_* Settings).
  if (cutLeg && cncPositiveNumber(rawItem?.cut_speed_ipm) === null) {
    add("cut_speed_ipm", "cnc_cut_speed_unavailable",
      "record a positive, finite cut speed (in/min) — a blank or zero speed silently drops cut pricing");
  }

  // carve leg — remote fires it for ANY type whenever carve_area_sqin > 0
  // (the gate is on the fields, not the item type).
  const carveArea = cncStrictNumber(rawItem?.carve_area_sqin);
  if (type === "3d_carving") {
    // For 3D items carving is the ONLY priced leg — both the gated area and
    // the divisor speed must be positive or the item silently prices as $0.
    if (cncPositiveNumber(rawItem?.carve_area_sqin) === null) {
      add("carve_area_sqin", "cnc_dimension_unavailable",
        "record a positive, finite carve area (in²) — a blank or zero area silently prices the carving as $0");
    }
    if (cncPositiveNumber(rawItem?.carve_speed_sqipm) === null) {
      add("carve_speed_sqipm", "cnc_carve_speed_unavailable",
        "record a positive, finite carve speed (in²/min) — a blank or zero speed silently drops carve pricing");
    }
  } else {
    // Non-3D: a recorded malformed/negative carve area is silently ignored by
    // the > 0 gate; an authored positive area still needs a positive speed.
    if (recorded(rawItem?.carve_area_sqin) && (carveArea === null || carveArea < 0)) {
      add("carve_area_sqin", "cnc_dimension_unavailable",
        "the stored carve area is malformed or negative — it is silently ignored; fix it or clear it");
    }
    if (carveArea !== null && carveArea > 0 && cncPositiveNumber(rawItem?.carve_speed_sqipm) === null) {
      add("carve_speed_sqipm", "cnc_carve_speed_unavailable",
        "a stored carve area is priced only with a positive, finite carve speed — the stored speed silently drops it");
    }
  }

  return issues;
}

// ---------- project-level scan ----------
// The four rate fields the calculator consumes from the project. They are
// seeded from CNC Settings at load (malformed settings land as null and flag
// here — one flag site per consumed value) and edited directly on the page.
// ≥0 throughout: an explicit 0 is a legitimate authored "no charge" rate.
export function cncProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("cnc", { field, code, message, hold: "project" }));

  // items must be an array — the derived pass maps it verbatim.
  if (project?.items !== undefined && !Array.isArray(project.items)) {
    add("items", "cnc_items_unavailable",
      "the stored CNC items are malformed — the project cannot be repriced");
  }

  for (const [field, human] of [
    ["machine_rate_per_hour", "machine rate ($/hr)"],
    ["labor_rate", "labor rate ($/hr)"],
    ["setup_time_percentage", "setup time percentage (%)"],
    ["fixed_setup_hours", "fixed setup hours"],
  ]) {
    if (cncNonNegativeNumber(project?.[field]) === null) {
      add(field, "cnc_project_rate_unavailable",
        `record a finite, nonnegative ${human} — fix the project value or the CNC Settings value it was seeded from; the stored value cannot price this estimate`);
    }
  }
  return issues;
}

// ---------- derived pricing (mirrors the page-inline math) ----------
// computeCncItemPricing reproduces updateItem's derived-field math exactly on
// the valid path — same formulas, strict-normalized reads. Malformed reads
// resolve to 0 here but are always flagged by the scanners above, so the
// derived output for a tainted row is discarded under the hold.
const num = (v) => cncStrictNumber(v) ?? 0;
// Live Settings read with documented fallback: absent → the module default;
// recorded-malformed → null-safe 0 internally (flagged by cncSettingIssues,
// discarded under the project hold).
const settingOr = (settings, key, dflt) =>
  cncSettingRecorded(settings, key) ? (cncSettingNumber(settings, key) ?? 0) : dflt;

export function computeCncItemPricing(item = {}, project = {}, settings = {}) {
  const letterPerimFactor = settingOr(settings, "cnc_letter_perimeter_factor", 3.5);

  let cutLength = 0;
  if (item?.item_type === "panel") {
    cutLength = (num(item.length) + num(item.width)) * 2;
  } else if (item?.item_type === "lettering") {
    cutLength = num(item.letter_height) * letterPerimFactor * num(item.num_letters);
  }

  // Remote derives the key via item.material_type.toLowerCase(); String()
  // keeps the same resolution without throwing on a missing material.
  const materialCutMultiplierKey = `${String(item?.material_type ?? "").toLowerCase()}_cnc_cut_multiplier`;
  const cutMultiplier = settingOr(settings, materialCutMultiplierKey, 1.0);

  const cutSpeed = num(item?.cut_speed_ipm);
  const carveArea = num(item?.carve_area_sqin);
  const carveSpeed = num(item?.carve_speed_sqipm);
  // Lettering forces qty 1 — "Number of Letters" IS the quantity.
  const qty = item?.item_type === "lettering" ? 1 : num(item?.quantity);

  const cutTimeMinutes = cutLength > 0 && cutSpeed > 0
    ? (cutLength / cutSpeed) * cutMultiplier : 0;
  const carveTimeMinutes = carveArea > 0 && carveSpeed > 0
    ? carveArea / carveSpeed : 0;
  const machineTimeHours = ((cutTimeMinutes + carveTimeMinutes) * qty) / 60;
  const setupTimeHours = machineTimeHours * (num(project?.setup_time_percentage) / 100);

  return {
    machine_time_hours: machineTimeHours,
    setup_time_hours: setupTimeHours,
    machine_cost: machineTimeHours * num(project?.machine_rate_per_hour),
    labor_cost: setupTimeHours * num(project?.labor_rate),
  };
}

// computeCncTotals reproduces the page-inline calculateTotals exactly on the
// valid path, over DERIVED item costs (fresh every render — stored snapshots
// can never go stale against the project rates).
export function computeCncTotals(derivedItems = [], project = {}, settings = {}) {
  const laborRate = num(project?.labor_rate);
  const totalMachineCost = derivedItems.reduce((sum, item) => sum + num(item.machine_cost), 0);
  const dynamicLaborFromItems = derivedItems.reduce((sum, item) => sum + num(item.labor_cost), 0);
  const totalSetupHours = derivedItems.reduce((sum, item) => sum + num(item.setup_time_hours), 0);
  const fixedSetupCost = num(project?.fixed_setup_hours) * laborRate;
  const minLaborHours = settingOr(settings, "min_cnc_labor_hours", 0);

  // Source behavior: minimum applies only to the dynamic item setup portion,
  // while fixed setup remains additive.
  const effectiveDynamicLabor = totalSetupHours > 0 && totalSetupHours < minLaborHours
    ? minLaborHours * laborRate
    : dynamicLaborFromItems;
  const minimumDynamicLaborAdjustment = effectiveDynamicLabor - dynamicLaborFromItems;
  const totalLaborCost = fixedSetupCost + effectiveDynamicLabor;

  return {
    totalMachine: totalMachineCost,
    totalLabor: totalLaborCost,
    totalSetupHours,
    dynamicLaborFromItems,
    fixedSetupCost,
    minLaborHours,
    minimumDynamicLaborAdjustment,
  };
}

// ---------- calc wrapper ----------
// Returns { items, totals, issues, held }. items = raw rows plus derived
// pricing fields (machine_time_hours, setup_time_hours, machine_cost,
// labor_cost). When held, every derived number a flagged input could have
// tainted is null — saved acknowledged totals on the record are the display
// fallback, never an invented $0. Raw rows are untouched.
const ITEM_HELD_FIELDS = ["machine_time_hours", "setup_time_hours", "machine_cost", "labor_cost"];
const NULL_TOTALS = {
  totalMachine: null,
  totalLabor: null,
  totalSetupHours: null,
  dynamicLaborFromItems: null,
  fixedSetupCost: null,
  minLaborHours: null,
  minimumDynamicLaborAdjustment: null,
};

export function calcCncPricing(project = {}, settings = {}) {
  const issues = [
    ...cncSettingIssues(settings),
    ...((Array.isArray(project?.items) ? project.items : [])
      .flatMap((item, index) => cncItemIssues(item, index))),
    ...cncProjectInputIssues(project),
  ];

  const held = issues.length > 0;
  const rawItems = Array.isArray(project?.items) ? project.items : [];
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = new Set(issues.filter((i) => i.hold === "item").map((i) => i.itemIndex));

  const items = rawItems.map((item, index) => {
    if (hasProjectHold || itemHolds.has(index)) {
      const heldItem = { ...item };
      for (const field of ITEM_HELD_FIELDS) heldItem[field] = null;
      return heldItem;
    }
    return { ...item, ...computeCncItemPricing(item, project, settings) };
  });

  const totals = held ? { ...NULL_TOTALS } : computeCncTotals(items, project, settings);

  return {
    items,
    totals,
    issues,
    held,
    __held: held,
    pricingUnavailable: held,
  };
}

// ---------- UI helpers ----------
// All issues attached to a single field (optionally a single item row).
export const issuesForField = (issues = [], field, itemIndex = null) =>
  issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
export const hasIssueFor = (issues = [], field, itemIndex = null) =>
  issuesForField(issues, field, itemIndex).length > 0;
