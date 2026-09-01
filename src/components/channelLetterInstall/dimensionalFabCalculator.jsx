// Auto-build pricing for Dimensional Letters: Material + (CNC or Laser) + Paint.
// IMPORTANT: This file mirrors the EXACT calculation logic used by the
// stand-alone CNC, Laser, and Paint estimators, so changing settings in
// CNCSettings / LaserSettings / PaintSettings flows through here identically.
//
// Pure functions — no React, no entity calls.

const num = (v, fb = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fb : n;
};

// Default fab config for a brand-new dimensional letter row
export const emptyFabConfig = () => ({
  material_id: null,
  material_name: "",
  material_thickness_inches: 0.5,
  material_cost_per_sqin: 0,
  sheet_yield_factor: 0.7,

  // Letter geometry
  letter_height_inches: 0,
  letter_width_inches: 0,
  letter_perimeter_inches: 0,

  // Cutting method
  cutting_method: "cnc", // "cnc" | "laser"

  // Cut params (auto-seeded from settings; overridable)
  cut_speed_ipm: 50,
  cut_multiplier: 1.0,

  // Paint params — same shape as the stand-alone Paint estimator items
  paint_letters: true,
  paint_sides: "front_and_edges", // none | front | front_and_edges | all
  num_paint_colors: 1,
  paint_colors: [],
  paint_mask_sqft: 0,
  approx_coverage_factor: "1/4",

  // Resolved cost breakdown (filled by calculator)
  unit_material_cost: 0,
  unit_cut_cost: 0,
  unit_paint_cost: 0,
  unit_total_cost: 0,
});

// ============================================================================
// Geometry helpers
// ============================================================================

// Letter perimeter — matches the stand-alone CNC estimator:
//   cutLength = letter_height * cnc_letter_perimeter_factor * num_letters
// We compute per-letter here (num_letters is applied at the row level).
const estimatePerimeterPerLetter = (h, settings, cuttingMethod, override) => {
  if (num(override) > 0) return num(override);
  const factorKey = cuttingMethod === "laser"
    ? "laser_letter_perimeter_factor"
    : "cnc_letter_perimeter_factor";
  const factor = num(settings[factorKey], 3.5);
  return num(h) * factor;
};

// Letter face area — matches the stand-alone Paint estimator's lettering case:
//   faceArea = letterHeight^2 * 0.8 * numLetters / 144  (sqft)
// We compute per-letter in sqin here so it composes with cutting math.
const estimateFaceAreaSqinPerLetter = (h) => {
  return Math.pow(num(h), 2) * 0.8;
};

// ============================================================================
// Rate accessors (mirror the stand-alone estimators exactly)
// ============================================================================

export const getCncRates = (settings) => ({
  machine_rate: num(settings.cnc_machine_rate, 75),
  labor_rate: num(settings.cnc_labor_rate, 45),
  setup_time_percentage: num(settings.cnc_setup_time_percentage, 20),
  min_setup_hours: num(settings.min_cnc_setup_hours, 0),
  min_labor_hours: num(settings.min_cnc_labor_hours, 0),
  letter_perimeter_factor: num(settings.cnc_letter_perimeter_factor, 3.5),
});

export const getLaserRates = (settings) => ({
  machine_rate: num(settings.parameter_laser_machine_rate, 100),
  labor_rate: num(settings.parameter_laser_labor_rate, 45),
  // Laser uses "handling time percentage" instead of "setup time percentage"
  setup_time_percentage: num(settings.parameter_handling_time_percentage, 15),
  min_setup_hours: num(settings.min_laser_setup_hours, 0),
  min_labor_hours: num(settings.min_laser_labor_hours, 0),
  letter_perimeter_factor: num(settings.laser_letter_perimeter_factor, 3.5),
});

export const getActiveRates = (cuttingMethod, settings) =>
  cuttingMethod === "laser" ? getLaserRates(settings) : getCncRates(settings);

// Mixed liquid paint $/sqft — uses the EXACT Paint estimator formula.
const computeLiquidPaintPerSqft = (settings) => {
  const unitFactors = { oz: 128, pint: 8, quart: 4, liter: 3.78541, gallon: 1 };
  const perGallon = (cost, unit) => {
    const c = num(cost);
    const f = unitFactors[unit] || 1;
    return c * f;
  };
  const paintG = perGallon(settings.paint_cost_per_unit, settings.paint_unit);
  const hardG = perGallon(settings.hardener_cost_per_unit, settings.hardener_unit);
  const redG = perGallon(settings.reducer_cost_per_unit, settings.reducer_unit);

  const pR = num(settings.paint_mix_ratio, 3);
  const hR = num(settings.hardener_mix_ratio, 1);
  const rR = num(settings.reducer_mix_ratio, 1);
  const total = pR + hR + rR;
  if (total === 0) return 0;
  const costPerMixedGallon =
    (paintG / total) * pR + (hardG / total) * hR + (redG / total) * rR;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 350);
  return coverage > 0 ? costPerMixedGallon / coverage : 0;
};

export const getPaintRates = (settings) => ({
  labor_rate: num(settings.default_labor_rate, 60),
  supplies_per_sqft: num(settings.default_paint_supplies_per_sqft, 1.25),
  liquid_paint_per_sqft: computeLiquidPaintPerSqft(settings),
  waste_multiplier: num(settings.paint_waste_multiplier, 1.25),
  coverage_sqft_per_gallon: num(settings.mixed_paint_coverage_sqft_per_gallon, 350),
  base_hours_per_sqft: num(settings.base_labor_hours_per_sqft, 0.05),
  min_labor_hours: num(settings.min_labor_hours, 0),
  min_paint_cost: num(settings.min_paint_cost, 0),
  mixing_hours_per_gallon: num(settings.paint_mixing_labor_hours, 0.25),
  setup_hours: num(settings.setup_time_labor_hours, 0.5),
  color_change_setup_hours: num(settings.color_change_setup_hours, 0.25),
  paint_gun_cleaning_hours: num(settings.paint_gun_cleaning_hours, 0.15),
  // Mask rates
  mask_material_rate: num(settings.paint_mask_rate_per_sqft, 0.75),
  mask_machine_rate: num(settings.paint_mask_machine_cutting_rate_per_sqft, 0.1),
  mask_application_labor_rate: num(settings.paint_mask_application_labor_rate_per_sqft, 0.25),
  mask_cutting_labor_rate: num(settings.paint_mask_cutting_labor_rate_per_sqft, 0.15),
  // Multipliers — letter complexity defaults to "complex" for dimensional letters
  // since they're not rectangular panels (matches Paint estimator behavior).
  complex_multiplier: num(settings.complex_complexity_multiplier, 1.5),
  moderate_multiplier: num(settings.moderate_complexity_multiplier, 1.0),
  one_side_multiplier: num(settings.one_side_paint_multiplier, 0.8),
  both_sides_multiplier: num(settings.both_sides_paint_multiplier, 1.0),
  additional_color_multiplier: num(settings.additional_color_multiplier, 0.3),
});

// ============================================================================
// Main cost calculator — matches the stand-alone estimator math
// ============================================================================
//
// `qty` here = number of letters in the row (not a separate quantity multiplier).
// Returns PER-LETTER costs for the breakdown UI, plus row-level totals so the
// estimator can apply minimums against the whole row (just like the stand-alone
// estimators do at the project level).
export const calcDimensionalUnitCost = (fab, qty, settings) => {
  const safe = { ...emptyFabConfig(), ...fab };
  const numLetters = Math.max(1, num(qty, 1));

  // === 1) Material cost per letter ===
  const facePerLetterSqin = estimateFaceAreaSqinPerLetter(safe.letter_height_inches);
  const unit_material_cost = facePerLetterSqin * num(safe.material_cost_per_sqin);

  // === 2) Cutting cost — uses stand-alone CNC/Laser math ===
  const rates = getActiveRates(safe.cutting_method, settings);
  const perLetterCutLengthIn = estimatePerimeterPerLetter(
    safe.letter_height_inches,
    settings,
    safe.cutting_method,
    safe.letter_perimeter_inches
  );
  const totalCutLengthIn = perLetterCutLengthIn * numLetters;
  const cutSpeed = Math.max(1, num(safe.cut_speed_ipm, 50));
  const cutMultiplier = Math.max(0.01, num(safe.cut_multiplier, 1));

  // Same machine-time formula as NewCNCEstimate / NewLaserEstimate:
  //   machine_time_hours = (cutLength / cutSpeed * cutMultiplier) / 60
  // (For dimensional letters we run multiple letters; cutLength is per-row.)
  const cutTimeMinutes = (totalCutLengthIn / cutSpeed) * cutMultiplier;
  const machineTimeHours = cutTimeMinutes / 60;

  // Setup/handling time = machineTime * (setup_time_percentage / 100)
  // Floor it at min_setup_hours if set in settings.
  let setupTimeHours = machineTimeHours * (rates.setup_time_percentage / 100);
  if (rates.min_setup_hours > 0 && setupTimeHours < rates.min_setup_hours) {
    setupTimeHours = rates.min_setup_hours;
  }

  let machineCost = machineTimeHours * rates.machine_rate;
  let cutLaborCost = setupTimeHours * rates.labor_rate;

  // Apply minimum-labor-hours floor on the cut labor only (matches CNC estimator).
  if (rates.min_labor_hours > 0 && setupTimeHours > 0 && setupTimeHours < rates.min_labor_hours) {
    cutLaborCost = rates.min_labor_hours * rates.labor_rate;
  }

  const totalCutCost = machineCost + cutLaborCost;
  // Per-letter slice for the breakdown UI
  const unit_cut_cost = totalCutCost / numLetters;

  // === 3) Paint cost — uses stand-alone Paint estimator math ===
  let unit_paint_cost = 0;
  let totalPaintMaskCost = 0;
  let totalLiquidPaintAndSuppliesCost = 0;
  let totalPaintLaborCost = 0;
  let totalPaintGallons = 0;

  if (safe.paint_letters && safe.paint_sides !== "none") {
    const paint = getPaintRates(settings);

    // Paintable area — match Paint estimator's lettering case:
    //   faceArea = h^2 * 0.8 * numLetters / 144   (sqft)
    //   edgeArea = h * perimFactor * numLetters * thickness / 144
    //   one_side  -> face + edges
    //   both_sides -> face*2 + edges
    const totalFaceSqft = (facePerLetterSqin * numLetters) / 144;
    const thickness = num(safe.material_thickness_inches, 0.5);
    const totalEdgeSqft = (totalCutLengthIn * thickness) / 144;

    let paintableSqft = 0;
    let paintSidesKey = "one_side"; // for stand-alone multipliers map
    if (safe.paint_sides === "front") {
      paintableSqft = totalFaceSqft;
      paintSidesKey = "one_side";
    } else if (safe.paint_sides === "front_and_edges") {
      paintableSqft = totalFaceSqft + totalEdgeSqft;
      paintSidesKey = "one_side";
    } else if (safe.paint_sides === "all") {
      paintableSqft = totalFaceSqft * 2 + totalEdgeSqft;
      paintSidesKey = "both_sides";
    }

    const colors = Array.isArray(safe.paint_colors)
      ? safe.paint_colors.filter((c) => c && c.trim() !== "")
      : [];
    const numColors = Math.max(1, colors.length || num(safe.num_paint_colors, 1));

    // -- Paint mask (multi-color only) --
    if (numColors > 1 && num(safe.paint_mask_sqft) > 0) {
      const maskMaterial = num(safe.paint_mask_sqft) * paint.mask_material_rate * (numColors - 1);
      const maskMachine = num(safe.paint_mask_sqft) * paint.mask_machine_rate * (numColors - 1);
      totalPaintMaskCost = maskMaterial + maskMachine;
    }

    // -- Liquid paint + application supplies --
    const paintApplicationSupplies = paintableSqft * paint.supplies_per_sqft * numColors;
    const liquidPaint = paintableSqft * paint.liquid_paint_per_sqft * paint.waste_multiplier * numColors;
    totalLiquidPaintAndSuppliesCost = paintApplicationSupplies + liquidPaint;

    if (paint.coverage_sqft_per_gallon > 0) {
      totalPaintGallons =
        (paintableSqft * paint.waste_multiplier * numColors) / paint.coverage_sqft_per_gallon;
    }

    // -- Item labor (matches Paint estimator's per-item labor) --
    // Dimensional letters → "complex" complexity (small/extra_small map to complex
    // in the Paint estimator; we use complex as the default for dimensional letters).
    const complexityMult = paint.complex_multiplier;
    const sidesMult =
      paintSidesKey === "both_sides" ? paint.both_sides_multiplier : paint.one_side_multiplier;

    let baseHours = paintableSqft * paint.base_hours_per_sqft * complexityMult * sidesMult;
    if (numColors > 1) {
      baseHours *= 1 + (numColors - 1) * paint.additional_color_multiplier;
    }

    // Mask application/cutting labor adds to base hours (matches Paint estimator)
    if (numColors > 1 && num(safe.paint_mask_sqft) > 0) {
      const maskApplyHrs =
        (num(safe.paint_mask_sqft) * paint.mask_application_labor_rate * (numColors - 1)) /
        paint.labor_rate;
      const maskCutHrs =
        (num(safe.paint_mask_sqft) * paint.mask_cutting_labor_rate * (numColors - 1)) /
        paint.labor_rate;
      baseHours += maskApplyHrs + maskCutHrs;
    }

    let paintLaborHours = baseHours;

    // -- Fixed labor (mixing + setup + color change + gun cleaning) --
    // Matches the Paint estimator's project-level fixed labor block.
    const numberOfMixes = Math.max(1, Math.ceil(totalPaintGallons));
    const mixingHrs = numberOfMixes * paint.mixing_hours_per_gallon;
    const setupHrs = paint.setup_hours;

    // Unique colors → drives color-change + gun-cleaning hours
    const uniqueColors = new Set(
      colors.map((c) => c.trim().toLowerCase()).filter((c) => c)
    );
    const uniqueColorCount = Math.max(numColors > 1 ? uniqueColors.size : 1, 1);
    const colorChangeHrs =
      uniqueColorCount > 1 ? (uniqueColorCount - 1) * paint.color_change_setup_hours : 0;
    const gunCleanHrs = uniqueColorCount * paint.paint_gun_cleaning_hours;

    const totalPaintLaborHrs = paintLaborHours + mixingHrs + setupHrs + colorChangeHrs + gunCleanHrs;

    // Apply min_labor_hours floor (Paint estimator's behavior)
    const effectivePaintLaborHrs =
      paint.min_labor_hours > 0 && totalPaintLaborHrs < paint.min_labor_hours
        ? paint.min_labor_hours
        : totalPaintLaborHrs;

    totalPaintLaborCost = effectivePaintLaborHrs * paint.labor_rate;

    // Apply min_paint_cost floor (Paint estimator's behavior)
    if (paint.min_paint_cost > 0 && totalLiquidPaintAndSuppliesCost < paint.min_paint_cost) {
      totalLiquidPaintAndSuppliesCost = paint.min_paint_cost;
    }

    const totalPaint = totalPaintMaskCost + totalLiquidPaintAndSuppliesCost + totalPaintLaborCost;
    unit_paint_cost = totalPaint / numLetters;
  }

  const unit_total_cost = unit_material_cost + unit_cut_cost + unit_paint_cost;

  return {
    ...safe,
    face_area_sqin: facePerLetterSqin,
    cut_length_inches: perLetterCutLengthIn,
    // Per-letter values (used by the on-row breakdown UI)
    unit_material_cost,
    unit_cut_cost,
    unit_cnc_cost: unit_cut_cost, // back-compat alias
    unit_paint_cost,
    unit_total_cost,
    // Row-level totals (so caller can compare with stand-alone estimator numbers)
    row_total_material_cost: unit_material_cost * numLetters,
    row_total_cut_cost: totalCutCost,
    row_total_paint_mask_cost: totalPaintMaskCost,
    row_total_paint_supplies_cost: totalLiquidPaintAndSuppliesCost,
    row_total_paint_labor_cost: totalPaintLaborCost,
    row_total_paint_gallons: totalPaintGallons,
    row_machine_time_hours: machineTimeHours,
    row_setup_time_hours: setupTimeHours,
  };
};

// Resolve cost_per_sqin from a material record (taking yield into account)
export const materialCostPerSqin = (material) => {
  if (!material) return 0;
  const sheetArea = num(material.sheet_length_inches) * num(material.sheet_width_inches);
  const yieldFactor = Math.max(0.05, Math.min(1, num(material.yield_factor, 0.7)));
  const usableArea = sheetArea * yieldFactor;
  if (usableArea <= 0) return 0;
  return num(material.cost_per_sheet) / usableArea;
};

// Look up the per-thickness cut speed setting for the active method.
//   CNC:   cnc_cut_speed_<thickness>
//   Laser: cut_speed_<thickness>
export const lookupCutSpeed = (cuttingMethod, thicknessInches, settings) => {
  if (!thicknessInches) return null;
  const candidates = decimalToImperialKeys(thicknessInches);
  const prefix = cuttingMethod === "laser" ? "cut_speed_" : "cnc_cut_speed_";
  for (const c of candidates) {
    const v = settings[`${prefix}${c}`];
    if (v !== undefined && v !== null && v !== "") return num(v);
  }
  return null;
};

// Lookup material cut multiplier from settings.
//   CNC: <material>_cnc_cut_multiplier
//   Laser: <material>_cut_multiplier
export const lookupCutMultiplier = (cuttingMethod, materialType, settings) => {
  if (!materialType) return 1;
  const mat = materialType.toLowerCase();
  const key = cuttingMethod === "laser" ? `${mat}_cut_multiplier` : `${mat}_cnc_cut_multiplier`;
  const v = settings[key];
  return v !== undefined && v !== null && v !== "" ? num(v, 1) : 1;
};

// Map common decimal thicknesses → key strings used in settings.
const decimalToImperialKeys = (decimal) => {
  const map = {
    0.0625: ["1_16"],
    0.125: ["1_8"],
    0.1875: ["3_16"],
    0.25: ["1_4"],
    0.375: ["3_8"],
    0.5: ["1_2"],
    0.625: ["5_8"],
    0.75: ["3_4"],
    0.875: ["7_8"],
    1: ["1"],
    1.25: ["1_1_4"],
    1.5: ["1_1_2"],
    2: ["2"],
    2.5: ["2_1_2"],
    3: ["3"],
    3.5: ["3_1_2"],
    4: ["4"],
  };
  const snap = Math.round(decimal * 16) / 16;
  return map[snap] || [];
};

export const PAINT_SIDES_LABELS = {
  none: "No Paint",
  front: "Front Only",
  front_and_edges: "Front + Edges",
  all: "All Sides",
};

export const CUTTING_METHOD_LABELS = {
  cnc: "CNC Routing",
  laser: "Laser Cutting",
};