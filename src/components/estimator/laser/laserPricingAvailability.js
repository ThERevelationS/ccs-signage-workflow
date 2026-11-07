// Laser pricing-availability layer.
//
// Wraps the LaserEstimator's inline calculateTotals (ported verbatim below as
// computeLaserTotals) with strict finite-number input validation so a missing,
// malformed, or unusable pricing input can no longer silently become $0, a
// hidden default, or a NaN that is laundered into the persisted totals.
// Mirrors the landed Foundation/Vinyl/Painting hardening convention:
//   - strict parsers (laserStrictNumber / laserSettingRecorded /
//     laserSeedNumber — the page seeds new-project defaults through the same
//     resolver so the scanner and the seed agree)
//   - structured issue records { kind, index, itemIndex, field, code, message,
//     hold } — kind "laser_catalog" for Settings rows (the priced surface —
//     Laser has no catalog entities), kind "laser" for project-field and item
//     issues; hold "project" holds the whole calc, hold "item" holds one row's
//     derived numbers plus every aggregate they feed
//   - explicit 0 stays valid where the math treats it as a real free/zero
//     amount (handling %, fixed setup hours, fixed material setup cost); 0 is
//     invalid where the math divides or needs a real magnitude (rates, speeds,
//     multipliers feeding a speed, perimeter factor, dimensions, counts)
//   - only CONSUMED values are validated: seed settings only while a new
//     project would seed from them (!project.id), item-derived settings only
//     when a project row actually consumes them, engrave-side rates only when
//     an engraving-type item exists
//   - raw rows are never mutated — the calculator reads the original records
//     exactly as the page has always passed them
//
// Valid inputs take the exact same code path as before: the result the page
// receives for a clean project is bit-identical to today's inline result (plus
// __held / pricingUnavailable / issues metadata flags).
//
// NOTE: src/components/estimator/laser/laserCalc.js is DEAD and DIVERGENT from
// the live math (different units, perimeter rule, and cost split) — it is not
// the source of truth; the ported inline body below is.

// ---------- strict parsers ----------
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", Infinity, NaN, hex/octal strings, null, undefined,
// objects. `Number()` alone would accept "0x10" → 16 and launder it silently.
export const laserStrictNumber = (v) => {
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

// A Settings value that was actually recorded — absent rows/blank text fall
// back to the documented module default by design (see LASER_SETTINGS_DEFAULTS
// in moduleSettingDefaults).
export const laserSettingRecorded = (settings, key) => {
  const v = settings?.[key];
  return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
};

// Strict settings read used for NEW-project seeding: a recorded finite value
// is honored verbatim — an explicit 0 stays 0 where the key allows it (the old
// `parseFloat(x)||d` revived the default and made a deliberate 0 impossible).
// Absent/blank/malformed or out-of-range values resolve the fallback exactly
// like before; the availability layer flags every recorded-but-unusable value
// separately.
//   positive: true  → value must be > 0 (rates, speeds, multipliers, factors)
//   positive: false → value must be >= 0 (handling %, setup hours, fixed cost)
export const laserSeedNumber = (settings, key, fallback, { positive = false } = {}) => {
  if (!laserSettingRecorded(settings, key)) return fallback;
  const n = laserStrictNumber(settings[key]);
  if (n === null) return fallback;
  if (positive ? n <= 0 : n < 0) return fallback;
  return n;
};

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind, index, itemIndex, field, code, message, hold,
});

// ---------- consumption model ----------
const CUT_TYPES = new Set(["panel", "lettering", "engrave_and_cut"]);
const ENGRAVE_TYPES = new Set(["engraving", "engrave_and_cut"]);
const VALID_TYPES = new Set(["panel", "lettering", "engraving", "engrave_and_cut"]);
const IMPERIAL_SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4"];
const MATERIALS = ["Acrylic", "Wood", "Leather"];

const PRESENT = (v) => v !== undefined && v !== null && v !== "";
const cutConsumed = (item) => CUT_TYPES.has(item?.item_type);
const engraveConsumed = (item) => ENGRAVE_TYPES.has(item?.item_type);

// ---------- settings scan ----------
// Seed keys consumed at load for a NEW project only — existing records carry
// their own (validated as project inputs). [key, human, positive]
const SEED_SETTINGS = [
  ["parameter_laser_machine_rate", "parameter laser machine rate ($/hr)", true],
  ["parameter_laser_labor_rate", "parameter laser labor rate ($/hr)", true],
  ["engraving_laser_machine_rate", "engraving laser machine rate ($/hr)", true],
  ["engraving_labor_rate", "engraving labor rate ($/hr)", true],
  ["parameter_handling_time_percentage", "parameter handling time %", false],
  ["engraving_handling_time_percentage", "engraving handling time %", false],
  ["min_parameter_laser_setup_hours", "minimum parameter laser setup hours", false],
  ["parameter_laser_fixed_material_setup_cost", "parameter laser fixed material setup cost", false],
];

// Item-derived settings (updateItem reads them on every field edit). Only the
// keys a project row actually consumes are validated — a malformed setting no
// item reads cannot silently reprice anything.
const thicknessSpeedKey = (t) => `cut_speed_${String(t || "").replace("/", "_")}`;
const cutMultiplierKey = (m) => `${String(m || "").toLowerCase()}_cut_multiplier`;
const engraveMultiplierKey = (m) => `${String(m || "").toLowerCase()}_engrave_multiplier`;

export function laserSettingIssues(project = {}, settings = {}) {
  const issues = [];
  const add = (field, message) =>
    issues.push(issue("laser_catalog", { field, code: "laser_setting_unavailable", message, hold: "project" }));
  const check = (key, human, positive) => {
    if (!laserSettingRecorded(settings, key)) return; // absent → documented module default by design
    const n = laserStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(key, `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in Laser Settings — the stored value cannot price this estimate`);
    }
  };

  // Seed keys — only while this project has no persisted id and would seed
  // from Settings at load.
  if (!project?.id) {
    for (const [key, human, positive] of SEED_SETTINGS) check(key, human, positive);
  }

  const items = Array.isArray(project?.items) ? project.items : [];
  const derivedKeys = new Map(); // key -> human (dedupe across items)
  for (const it of items) {
    if (cutConsumed(it)) {
      if (IMPERIAL_SIZES.includes(it?.material_thickness)) {
        derivedKeys.set(thicknessSpeedKey(it.material_thickness), `cut speed for ${it.material_thickness}" material (mm/sec)`);
      }
      if (MATERIALS.includes(it?.material_type)) {
        derivedKeys.set(cutMultiplierKey(it.material_type), `${it.material_type} cut multiplier`);
      }
      if (it?.item_type === "lettering") {
        derivedKeys.set("laser_letter_perimeter_factor", "letter perimeter factor");
      }
    }
    if (engraveConsumed(it)) {
      derivedKeys.set("laser_engrave_speed_sqipm", "engrave speed (sq mm/sec)");
      if (MATERIALS.includes(it?.material_type)) {
        derivedKeys.set(engraveMultiplierKey(it.material_type), `${it.material_type} engrave multiplier`);
      }
    }
  }
  for (const [key, human] of derivedKeys) check(key, human, true);

  return issues;
}

// ---------- item-level scan ----------
// Consumed fields on each laser item. Issues hold the item's derived numbers
// (hold "item") — totals re-derive null because they sum held items.
export function laserItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) =>
    issues.push(issue("laser", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));

  // item_type — every cost branch keys on it; anything else prices a silent
  // $0 item.
  if (!VALID_TYPES.has(rawItem?.item_type)) {
    add("item_type", "laser_item_type_unavailable",
      "select Panel, Lettering, Engraving, or Engrave and Cut — the stored type prices as $0 silently");
  }
  const effectiveType = VALID_TYPES.has(rawItem?.item_type) ? rawItem.item_type : "panel";
  const cuts = cutConsumed({ item_type: effectiveType });
  const engraves = engraveConsumed({ item_type: effectiveType });

  // material_type — derives the *_cut_multiplier / *_engrave_multiplier
  // Settings keys; an unknown or missing material silently resolves 1×.
  if (!MATERIALS.includes(rawItem?.material_type)) {
    add("material_type", "laser_material_type_unavailable",
      "choose Acrylic, Wood, or Leather — the stored material silently prices at a 1.0× multiplier");
  }

  // material_thickness — keys the cut_speed_<t> Settings row for cutting
  // items; an unknown size reads a nonexistent setting → silent 20 mm/s.
  if (cuts && !IMPERIAL_SIZES.includes(rawItem?.material_thickness)) {
    add("material_thickness", "laser_thickness_unavailable",
      "choose a listed thickness — the stored size has no cut-speed setting and silently prices at 20 mm/sec");
  }

  // Dimensions — the derivation multiplies them verbatim.
  if (effectiveType === "lettering") {
    const h = laserStrictNumber(rawItem?.letter_height);
    if (h === null || h <= 0) {
      add("letter_height", "laser_dimension_unavailable",
        "record a positive, finite letter height (inches) — a blank or zero height prices the letters as $0 silently");
    }
    const n = laserStrictNumber(rawItem?.num_letters);
    if (n === null || n < 1) {
      add("num_letters", "laser_quantity_unavailable",
        "record a letter count of 1 or more — a blank or malformed count prices the letters as $0 silently");
    }
  } else {
    for (const field of ["length", "width"]) {
      const n = laserStrictNumber(rawItem?.[field]);
      if (cuts) {
        if (n === null || n <= 0) {
          add(field, "laser_dimension_unavailable",
            `record a positive, finite ${field} (inches) — a blank or zero dimension silently mis-prices the cut perimeter`);
        }
      } else if (PRESENT(rawItem?.[field]) && (n === null || n < 0)) {
        // engraving: dims only feed the engrave-area derivation on edit —
        // a recorded malformed value still poisons it; 0/absent is fine when
        // the area is hand-entered.
        add(field, "laser_dimension_unavailable",
          `record a finite, nonnegative ${field} (inches) or clear it — the stored value poisons the engrave area`);
      }
    }
  }

  // quantity — multiplied into engrave_area for every row and into every
  // cut-length derivation; blank/malformed silently zeroes or NaNs the row.
  {
    const q = laserStrictNumber(rawItem?.quantity);
    if (q === null || q < 1) {
      add("quantity", "laser_quantity_unavailable",
        "record a quantity of 1 or more — a blank or malformed value prices this row as $0 silently");
    }
  }

  // total_cut_length_inches — the calc multiplies it by MM_PER_IN verbatim:
  // a malformed or string value NaNs the row; for cutting items a nonpositive
  // value silently drops all machine time.
  {
    const n = laserStrictNumber(rawItem?.total_cut_length_inches);
    if (n === null || (cuts ? n <= 0 : n < 0)) {
      add("total_cut_length_inches", "laser_cut_length_unavailable",
        cuts
          ? "re-enter the dimensions — the derived cut length is unusable and would silently price $0 machine time"
          : "the stored cut length is malformed — it corrupts the row's machine time");
    }
  }

  // engrave_area_sqin — multiplied unconditionally; engraving types price
  // nothing at 0.
  {
    const n = laserStrictNumber(rawItem?.engrave_area_sqin);
    if (n === null || (engraves ? n <= 0 : n < 0)) {
      add("engrave_area_sqin", "laser_engrave_area_unavailable",
        engraves
          ? "record a positive, finite engraving area (sq in) — a blank or zero area prices the engraving as $0 silently"
          : "the stored engrave area is malformed — it corrupts the row's machine time");
    }
  }

  // cut_speed_ipm / engrave_speed_sqipm — unconditional divisors: a truthy
  // malformed string NaNs the row even when its own geometry is zero.
  {
    const n = laserStrictNumber(rawItem?.cut_speed_ipm);
    if (n === null || n <= 0) {
      add("cut_speed_ipm", "laser_cut_speed_unavailable",
        "re-pick the material and thickness — the derived cut speed is unusable and corrupts the row's machine time");
    }
    const e = laserStrictNumber(rawItem?.engrave_speed_sqipm);
    if (e === null || e <= 0) {
      add("engrave_speed_sqipm", "laser_engrave_speed_unavailable",
        "re-pick the material — the derived engrave speed is unusable and corrupts the row's machine time");
    }
  }

  return issues;
}

// ---------- project-level scan ----------
// Stored rate/setup fields the calc reads with `||` launders that pass truthy
// malformed values straight into NaN. Engrave-side rates validate only when an
// engraving-type item consumes them; cut-side rates only when a cutting item
// does; labor/setup fields are consumed unconditionally.
export function laserProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("laser", { field, code, message, hold: "project" }));

  if (project?.items !== undefined && !Array.isArray(project.items)) {
    add("items", "laser_items_unavailable",
      "the stored laser items are malformed — the project cannot be repriced");
  }

  const items = Array.isArray(project?.items) ? project.items : [];
  const anyCut = items.some(cutConsumed);
  const anyEngrave = items.some(engraveConsumed);

  const needPositive = (field, human, active) => {
    if (!active) return;
    const n = laserStrictNumber(project?.[field]);
    if (n === null || n <= 0) {
      add(field, "laser_rate_unavailable",
        `record a positive, finite ${human} — the stored value silently reprices this estimate`);
    }
  };
  const needNonNeg = (field, human, active) => {
    if (!active) return;
    const n = laserStrictNumber(project?.[field]);
    if (n === null || n < 0) {
      add(field, "laser_rate_unavailable",
        `record a finite, nonnegative ${human} — the stored value silently reprices this estimate`);
    }
  };

  needPositive("machine_rate_per_hour", "machine rate ($/hr)", anyCut);
  needPositive("labor_rate", "labor rate ($/hr)", true); // fixed setup consumes it always
  needPositive("engraving_machine_rate_per_hour", "engraving machine rate ($/hr)", anyEngrave);
  needPositive("engraving_labor_rate", "engraving labor rate ($/hr)", anyEngrave);
  needNonNeg("parameter_handling_time_percentage", "parameter handling %", anyCut);
  needNonNeg("engraving_handling_time_percentage", "engraving handling %", anyEngrave);
  needNonNeg("fixed_setup_hours", "fixed setup hours", true);
  needNonNeg("fixed_material_setup_cost", "fixed material setup cost ($)", true);

  return issues;
}

// ---------- live calculation (ported verbatim from LaserEstimator) ----------
// Byte-identical reproduction of the page's inline calculateTotals body —
// same formulas, same `||` launders, same iteration order. On a clean project
// it returns exactly the remote result; under issues its (possibly NaN)
// numbers are discarded by the held wrapper, never persisted.
export function computeLaserTotals(project = {}) {
  let totalMachineCost = 0;
  let totalLaborCost = 0;
  let totalSuppliesCost = 0;

  // Cut/engrave speeds are stored as mm/sec and mm²/sec.
  // Convert lengths/areas from inches to mm (1 in = 25.4 mm) before dividing.
  const MM_PER_IN = 25.4;
  const SQMM_PER_SQIN = 25.4 * 25.4;

  const updatedItems = project.items.map((item) => {
    const cutLengthMm = item.total_cut_length_inches * MM_PER_IN;
    const engraveAreaSqMm = item.engrave_area_sqin * item.quantity * SQMM_PER_SQIN;

    const cutTimeSeconds = cutLengthMm / (item.cut_speed_ipm || 20);
    const engraveTimeSeconds = engraveAreaSqMm / (item.engrave_speed_sqipm || 5);

    const cutTimeHours = cutTimeSeconds / 3600;
    const engraveTimeHours = engraveTimeSeconds / 3600;
    const machineTimeHours = cutTimeHours + engraveTimeHours;

    // Rates
    const paramMachineRate = project.machine_rate_per_hour || 100;
    const paramLaborRate = project.labor_rate || 75;
    const paramHandlingPct = (project.parameter_handling_time_percentage || 15) / 100;

    const engraveMachineRate = project.engraving_machine_rate_per_hour || 80;
    const engraveLaborRate = project.engraving_labor_rate || 40;
    const engraveHandlingPct = (project.engraving_handling_time_percentage || 20) / 100;

    let itemMachineCost = 0;
    let itemLaborCost = 0;
    let itemHandlingHours = 0;

    if (item.item_type === 'panel' || item.item_type === 'lettering') {
      // Parameter Only
      itemHandlingHours = machineTimeHours * paramHandlingPct;
      itemMachineCost = machineTimeHours * paramMachineRate;
      itemLaborCost = itemHandlingHours * paramLaborRate;
    } else if (item.item_type === 'engraving') {
      // Engraving Only
      itemHandlingHours = machineTimeHours * engraveHandlingPct;
      itemMachineCost = machineTimeHours * engraveMachineRate;
      itemLaborCost = itemHandlingHours * engraveLaborRate;
    } else if (item.item_type === 'engrave_and_cut') {
      // Mixed - Split costs
      const cutHandling = cutTimeHours * paramHandlingPct;
      const engraveHandling = engraveTimeHours * engraveHandlingPct;
      itemHandlingHours = cutHandling + engraveHandling;

      itemMachineCost = (cutTimeHours * paramMachineRate) + (engraveTimeHours * engraveMachineRate);
      itemLaborCost = (cutHandling * paramLaborRate) + (engraveHandling * engraveLaborRate);
    }

    totalMachineCost += itemMachineCost;
    totalLaborCost += itemLaborCost;

    return {
      ...item,
      machine_time_hours: machineTimeHours,
      handling_time_hours: itemHandlingHours,
      machine_cost: itemMachineCost,
      labor_cost: itemLaborCost
    };
  });

  // Add fixed setup time labor cost
  const fixedSetupLaborCost = project.fixed_setup_hours * project.labor_rate;
  totalLaborCost += fixedSetupLaborCost;

  // Add fixed material setup cost to supplies cost
  const fixedMaterialSetupCost = project.fixed_material_setup_cost || 0;
  totalSuppliesCost += fixedMaterialSetupCost; // Now goes to supplies cost

  return {
    items: updatedItems,
    total_machine_cost: totalMachineCost,
    total_labor_cost: totalLaborCost,
    total_supplies_cost: totalSuppliesCost
  };
}

// ---------- calc wrapper ----------
// Returns { calc, issues, held }. The calc keeps the real result shape
// ({ items, total_machine_cost, total_labor_cost, total_supplies_cost }); when
// held, every derived number a flagged input could have tainted is null — the
// saved acknowledged totals on the record are the display fallback, never an
// invented $0. Raw rows are untouched.
const ITEM_HELD_FIELDS = ["machine_time_hours", "handling_time_hours", "machine_cost", "labor_cost"];
const TOTAL_FIELDS = ["total_machine_cost", "total_labor_cost", "total_supplies_cost"];

export function calcLaserPricing(project = {}, settings = {}) {
  const issues = [
    ...laserSettingIssues(project, settings),
    ...laserProjectInputIssues(project),
    ...((Array.isArray(project?.items) ? project.items : [])
      .flatMap((item, index) => laserItemIssues(item, index))),
  ];

  // A non-array items value is itself a project-level hold; hand the calc an
  // empty list so it still returns a real result shape (the input object is
  // never mutated — totals are nulled below regardless).
  const calcable = Array.isArray(project?.items) ? project : { ...project, items: [] };
  const calc = computeLaserTotals(calcable);

  // Paranoid net: if any derived number still came out non-finite without a
  // named issue, hold rather than let a NaN reach the persisted totals.
  const leakedNaN =
    issues.length === 0 &&
    (!TOTAL_FIELDS.every((f) => Number.isFinite(calc[f])) ||
      calc.items.some((it) => ITEM_HELD_FIELDS.some((f) => !Number.isFinite(it[f]))));
  if (leakedNaN) {
    issues.push(issue("laser", {
      field: "total_cost",
      code: "laser_totals_unavailable",
      message: "Pricing produced a non-finite total — re-check the item values before saving",
      hold: "project",
    }));
  }

  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held };
  }

  const out = { ...calc, items: calc.items.slice() };
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
  for (const field of TOTAL_FIELDS) out[field] = null;

  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held };
}

// ---------- UI helpers ----------
// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasLaserCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Sum that propagates null — for "total = machine + supplies + labor" cells.
export const laserSumOrNull = (...xs) =>
  xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;

// Blank-preserving input helper for number fields: "" stays "" so the input
// does not fight the user mid-typing; parseable text becomes a number;
// anything else stays raw so validation can flag it instead of laundering it
// into 0/1 (the old parseFloat||N silently read "" as the fallback).
export const laserDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// All issues attached to a single field (optionally a single item row).
export const issuesForField = (issues = [], field, itemIndex = null) =>
  issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
export const hasIssueFor = (issues = [], field, itemIndex = null) =>
  issuesForField(issues, field, itemIndex).length > 0;
