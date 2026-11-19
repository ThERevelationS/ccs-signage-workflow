// .audit-work/laser-hardening/laser-pricing-candidate-laserPricingAvailability.js
var laserStrictNumber = (v) => {
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
var laserSettingRecorded = (settings, key) => {
  const v = settings?.[key];
  return v !== void 0 && v !== null && !(typeof v === "string" && v.trim() === "");
};
var laserSeedNumber = (settings, key, fallback, { positive = false } = {}) => {
  if (!laserSettingRecorded(settings, key)) return fallback;
  const n = laserStrictNumber(settings[key]);
  if (n === null) return fallback;
  if (positive ? n <= 0 : n < 0) return fallback;
  return n;
};
var issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind,
  index,
  itemIndex,
  field,
  code,
  message,
  hold
});
var CUT_TYPES = /* @__PURE__ */ new Set(["panel", "lettering", "engrave_and_cut"]);
var ENGRAVE_TYPES = /* @__PURE__ */ new Set(["engraving", "engrave_and_cut"]);
var VALID_TYPES = /* @__PURE__ */ new Set(["panel", "lettering", "engraving", "engrave_and_cut"]);
var IMPERIAL_SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4"];
var MATERIALS = ["Acrylic", "Wood", "Leather"];
var PRESENT = (v) => v !== void 0 && v !== null && v !== "";
var cutConsumed = (item) => CUT_TYPES.has(item?.item_type);
var engraveConsumed = (item) => ENGRAVE_TYPES.has(item?.item_type);
var SEED_SETTINGS = [
  ["parameter_laser_machine_rate", "parameter laser machine rate ($/hr)", true],
  ["parameter_laser_labor_rate", "parameter laser labor rate ($/hr)", true],
  ["engraving_laser_machine_rate", "engraving laser machine rate ($/hr)", true],
  ["engraving_labor_rate", "engraving labor rate ($/hr)", true],
  ["parameter_handling_time_percentage", "parameter handling time %", false],
  ["engraving_handling_time_percentage", "engraving handling time %", false],
  ["min_parameter_laser_setup_hours", "minimum parameter laser setup hours", false],
  ["parameter_laser_fixed_material_setup_cost", "parameter laser fixed material setup cost", false]
];
var thicknessSpeedKey = (t) => `cut_speed_${String(t || "").replace("/", "_")}`;
var cutMultiplierKey = (m) => `${String(m || "").toLowerCase()}_cut_multiplier`;
var engraveMultiplierKey = (m) => `${String(m || "").toLowerCase()}_engrave_multiplier`;
function laserSettingIssues(project = {}, settings = {}) {
  const issues = [];
  const add = (field, message) => issues.push(issue("laser_catalog", { field, code: "laser_setting_unavailable", message, hold: "project" }));
  const check = (key, human, positive) => {
    if (!laserSettingRecorded(settings, key)) return;
    const n = laserStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(key, `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in Laser Settings \u2014 the stored value cannot price this estimate`);
    }
  };
  if (!project?.id) {
    for (const [key, human, positive] of SEED_SETTINGS) check(key, human, positive);
  }
  const items = Array.isArray(project?.items) ? project.items : [];
  const derivedKeys = /* @__PURE__ */ new Map();
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
function laserItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) => issues.push(issue("laser", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));
  if (!VALID_TYPES.has(rawItem?.item_type)) {
    add(
      "item_type",
      "laser_item_type_unavailable",
      "select Panel, Lettering, Engraving, or Engrave and Cut \u2014 the stored type prices as $0 silently"
    );
  }
  const effectiveType = VALID_TYPES.has(rawItem?.item_type) ? rawItem.item_type : "panel";
  const cuts = cutConsumed({ item_type: effectiveType });
  const engraves = engraveConsumed({ item_type: effectiveType });
  if (!MATERIALS.includes(rawItem?.material_type)) {
    add(
      "material_type",
      "laser_material_type_unavailable",
      "choose Acrylic, Wood, or Leather \u2014 the stored material silently prices at a 1.0\xD7 multiplier"
    );
  }
  if (cuts && !IMPERIAL_SIZES.includes(rawItem?.material_thickness)) {
    add(
      "material_thickness",
      "laser_thickness_unavailable",
      "choose a listed thickness \u2014 the stored size has no cut-speed setting and silently prices at 20 mm/sec"
    );
  }
  if (effectiveType === "lettering") {
    const h = laserStrictNumber(rawItem?.letter_height);
    if (h === null || h <= 0) {
      add(
        "letter_height",
        "laser_dimension_unavailable",
        "record a positive, finite letter height (inches) \u2014 a blank or zero height prices the letters as $0 silently"
      );
    }
    const n = laserStrictNumber(rawItem?.num_letters);
    if (n === null || n < 1) {
      add(
        "num_letters",
        "laser_quantity_unavailable",
        "record a letter count of 1 or more \u2014 a blank or malformed count prices the letters as $0 silently"
      );
    }
  } else {
    for (const field of ["length", "width"]) {
      const n = laserStrictNumber(rawItem?.[field]);
      if (cuts) {
        if (n === null || n <= 0) {
          add(
            field,
            "laser_dimension_unavailable",
            `record a positive, finite ${field} (inches) \u2014 a blank or zero dimension silently mis-prices the cut perimeter`
          );
        }
      } else if (PRESENT(rawItem?.[field]) && (n === null || n < 0)) {
        add(
          field,
          "laser_dimension_unavailable",
          `record a finite, nonnegative ${field} (inches) or clear it \u2014 the stored value poisons the engrave area`
        );
      }
    }
  }
  {
    const q = laserStrictNumber(rawItem?.quantity);
    if (q === null || q < 1) {
      add(
        "quantity",
        "laser_quantity_unavailable",
        "record a quantity of 1 or more \u2014 a blank or malformed value prices this row as $0 silently"
      );
    }
  }
  {
    const n = laserStrictNumber(rawItem?.total_cut_length_inches);
    if (n === null || (cuts ? n <= 0 : n < 0)) {
      add(
        "total_cut_length_inches",
        "laser_cut_length_unavailable",
        cuts ? "re-enter the dimensions \u2014 the derived cut length is unusable and would silently price $0 machine time" : "the stored cut length is malformed \u2014 it corrupts the row's machine time"
      );
    }
  }
  {
    const n = laserStrictNumber(rawItem?.engrave_area_sqin);
    if (n === null || (engraves ? n <= 0 : n < 0)) {
      add(
        "engrave_area_sqin",
        "laser_engrave_area_unavailable",
        engraves ? "record a positive, finite engraving area (sq in) \u2014 a blank or zero area prices the engraving as $0 silently" : "the stored engrave area is malformed \u2014 it corrupts the row's machine time"
      );
    }
  }
  {
    const n = laserStrictNumber(rawItem?.cut_speed_ipm);
    if (n === null || n <= 0) {
      add(
        "cut_speed_ipm",
        "laser_cut_speed_unavailable",
        "re-pick the material and thickness \u2014 the derived cut speed is unusable and corrupts the row's machine time"
      );
    }
    const e = laserStrictNumber(rawItem?.engrave_speed_sqipm);
    if (e === null || e <= 0) {
      add(
        "engrave_speed_sqipm",
        "laser_engrave_speed_unavailable",
        "re-pick the material \u2014 the derived engrave speed is unusable and corrupts the row's machine time"
      );
    }
  }
  return issues;
}
function laserProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("laser", { field, code, message, hold: "project" }));
  if (project?.items !== void 0 && !Array.isArray(project.items)) {
    add(
      "items",
      "laser_items_unavailable",
      "the stored laser items are malformed \u2014 the project cannot be repriced"
    );
  }
  const items = Array.isArray(project?.items) ? project.items : [];
  const anyCut = items.some(cutConsumed);
  const anyEngrave = items.some(engraveConsumed);
  const needPositive = (field, human, active) => {
    if (!active) return;
    const n = laserStrictNumber(project?.[field]);
    if (n === null || n <= 0) {
      add(
        field,
        "laser_rate_unavailable",
        `record a positive, finite ${human} \u2014 the stored value silently reprices this estimate`
      );
    }
  };
  const needNonNeg = (field, human, active) => {
    if (!active) return;
    const n = laserStrictNumber(project?.[field]);
    if (n === null || n < 0) {
      add(
        field,
        "laser_rate_unavailable",
        `record a finite, nonnegative ${human} \u2014 the stored value silently reprices this estimate`
      );
    }
  };
  needPositive("machine_rate_per_hour", "machine rate ($/hr)", anyCut);
  needPositive("labor_rate", "labor rate ($/hr)", true);
  needPositive("engraving_machine_rate_per_hour", "engraving machine rate ($/hr)", anyEngrave);
  needPositive("engraving_labor_rate", "engraving labor rate ($/hr)", anyEngrave);
  needNonNeg("parameter_handling_time_percentage", "parameter handling %", anyCut);
  needNonNeg("engraving_handling_time_percentage", "engraving handling %", anyEngrave);
  needNonNeg("fixed_setup_hours", "fixed setup hours", true);
  needNonNeg("fixed_material_setup_cost", "fixed material setup cost ($)", true);
  return issues;
}
function computeLaserTotals(project = {}) {
  let totalMachineCost = 0;
  let totalLaborCost = 0;
  let totalSuppliesCost = 0;
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
    const paramMachineRate = project.machine_rate_per_hour || 100;
    const paramLaborRate = project.labor_rate || 75;
    const paramHandlingPct = (project.parameter_handling_time_percentage || 15) / 100;
    const engraveMachineRate = project.engraving_machine_rate_per_hour || 80;
    const engraveLaborRate = project.engraving_labor_rate || 40;
    const engraveHandlingPct = (project.engraving_handling_time_percentage || 20) / 100;
    let itemMachineCost = 0;
    let itemLaborCost = 0;
    let itemHandlingHours = 0;
    if (item.item_type === "panel" || item.item_type === "lettering") {
      itemHandlingHours = machineTimeHours * paramHandlingPct;
      itemMachineCost = machineTimeHours * paramMachineRate;
      itemLaborCost = itemHandlingHours * paramLaborRate;
    } else if (item.item_type === "engraving") {
      itemHandlingHours = machineTimeHours * engraveHandlingPct;
      itemMachineCost = machineTimeHours * engraveMachineRate;
      itemLaborCost = itemHandlingHours * engraveLaborRate;
    } else if (item.item_type === "engrave_and_cut") {
      const cutHandling = cutTimeHours * paramHandlingPct;
      const engraveHandling = engraveTimeHours * engraveHandlingPct;
      itemHandlingHours = cutHandling + engraveHandling;
      itemMachineCost = cutTimeHours * paramMachineRate + engraveTimeHours * engraveMachineRate;
      itemLaborCost = cutHandling * paramLaborRate + engraveHandling * engraveLaborRate;
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
  const fixedSetupLaborCost = project.fixed_setup_hours * project.labor_rate;
  totalLaborCost += fixedSetupLaborCost;
  const fixedMaterialSetupCost = project.fixed_material_setup_cost || 0;
  totalSuppliesCost += fixedMaterialSetupCost;
  return {
    items: updatedItems,
    total_machine_cost: totalMachineCost,
    total_labor_cost: totalLaborCost,
    total_supplies_cost: totalSuppliesCost
  };
}
var ITEM_HELD_FIELDS = ["machine_time_hours", "handling_time_hours", "machine_cost", "labor_cost"];
var TOTAL_FIELDS = ["total_machine_cost", "total_labor_cost", "total_supplies_cost"];
function calcLaserPricing(project = {}, settings = {}) {
  const issues = [
    ...laserSettingIssues(project, settings),
    ...laserProjectInputIssues(project),
    ...(Array.isArray(project?.items) ? project.items : []).flatMap((item, index) => laserItemIssues(item, index))
  ];
  const calcable = Array.isArray(project?.items) ? project : { ...project, items: [] };
  const calc = computeLaserTotals(calcable);
  const leakedNaN = issues.length === 0 && (!TOTAL_FIELDS.every((f) => Number.isFinite(calc[f])) || calc.items.some((it) => ITEM_HELD_FIELDS.some((f) => !Number.isFinite(it[f]))));
  if (leakedNaN) {
    issues.push(issue("laser", {
      field: "total_cost",
      code: "laser_totals_unavailable",
      message: "Pricing produced a non-finite total \u2014 re-check the item values before saving",
      hold: "project"
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
var hasLaserCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var laserSumOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
var laserDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;
export {
  calcLaserPricing,
  computeLaserTotals,
  hasIssueFor,
  hasLaserCostSnapshot,
  issuesForField,
  laserDraftValue,
  laserItemIssues,
  laserProjectInputIssues,
  laserSeedNumber,
  laserSettingIssues,
  laserSettingRecorded,
  laserStrictNumber,
  laserSumOrNull
};
