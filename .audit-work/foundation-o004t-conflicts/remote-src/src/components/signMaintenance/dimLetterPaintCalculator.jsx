// Adds Painted Dimensional Letters on top of the monument repaint calc.
// Pulls rates from the *Paint Estimator* settings (no new settings created).
//
// Inputs from item.repaint_config.dim_letter_paint:
//   { enabled, qty, avg_height_in, thickness_in, second_color_mask }
//
// Output (or null if not enabled):
//   {
//     letters_face_sqft, letters_returns_sqft, letters_total_sqft,
//     letters_gallons, letters_paint_cost,
//     mask_sqft, mask_material_cost, mask_machine_cost,
//     mask_weed_labor_cost, mask_apply_labor_cost,
//     mask_total_cost, mask_labor_hours,
//     letters_labor_hours, letters_total_added_cost,
//   }

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// Mirror paint cost-per-gallon resolution used by PaintSettings.
const UNIT_FACTORS = { oz: 1/128, pint: 1/8, quart: 1/4, liter: 1/3.78541, gallon: 1 };
const costPerGallon = (cost, unit) => {
  const c = num(cost);
  const f = UNIT_FACTORS[unit] || 1;
  if (!f) return 0;
  return c / f;
};

// Liquid mixed paint $ per sqft, derived from PaintSettings mix.
const mixedPaintCostPerSqft = (s) => {
  const paintG = costPerGallon(s.paint_cost_per_unit, s.paint_unit);
  const hardG  = costPerGallon(s.hardener_cost_per_unit, s.hardener_unit);
  const redG   = costPerGallon(s.reducer_cost_per_unit, s.reducer_unit);
  const pR = num(s.paint_mix_ratio), hR = num(s.hardener_mix_ratio), rR = num(s.reducer_mix_ratio);
  const parts = pR + hR + rR;
  if (!parts) return 0;
  const costPerGalMixed = (paintG * pR + hardG * hR + redG * rR) / parts;
  const coverage = num(s.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  return costPerGalMixed / coverage;
};

// Estimate sqft of paintable area on a single dimensional letter:
//   face = h × (h × perimeterFactor / 4)  ≈ approximated using h² for stroke-based letters
// We use the same approximation as the Paint Estimator's letter math:
//   letter face area ≈ h² × 0.55 (typical sans serif), but to stay simple,
//   we expose a knob: face_factor = 0.55 (face vs bounding box).
// Return walls = letter perimeter × thickness.
// Letter perimeter = h × letter_perimeter_factor (from Paint Settings).
export const computeDimLetterPaint = (cfg, settings) => {
  const dl = cfg?.dim_letter_paint;
  if (!dl?.enabled) return null;

  const qty = Math.max(0, num(dl.qty));
  if (qty <= 0) return null;
  const hIn = Math.max(0, num(dl.avg_height_in));
  const tIn = Math.max(0, num(dl.thickness_in));
  if (hIn <= 0) return null;

  const perimFactor = num(settings.letter_perimeter_factor, 3.5) || 3.5;
  const FACE_FACTOR = 0.55; // sans-serif stroke ratio

  // Per-letter areas in square inches
  const facePerLetterIn2 = hIn * hIn * FACE_FACTOR;
  const returnsPerLetterIn2 = (hIn * perimFactor) * tIn;

  // Convert to sqft × qty
  const SQIN_PER_SQFT = 144;
  const letters_face_sqft = (facePerLetterIn2 * qty) / SQIN_PER_SQFT;
  const letters_returns_sqft = (returnsPerLetterIn2 * qty) / SQIN_PER_SQFT;
  const letters_total_sqft = letters_face_sqft + letters_returns_sqft;

  // Paint material cost
  const liquid$PerSqft = mixedPaintCostPerSqft(settings);
  const wasteMult = num(settings.paint_waste_multiplier, 1.25) || 1.25;
  const letters_paint_cost = letters_total_sqft * liquid$PerSqft * wasteMult;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  const letters_gallons = (letters_total_sqft * wasteMult) / coverage;

  // Labor: use Paint Settings base hours/sqft + small-letter prep multiplier when applicable
  const basePerSqft = num(settings.base_labor_hours_per_sqft, 0.05);
  let prepMult = num(settings.lettering_normal_prep_multiplier, 1.0) || 1.0;
  if (hIn <= 4)       prepMult = num(settings.lettering_extra_small_prep_multiplier, 1.5);
  else if (hIn <= 8)  prepMult = num(settings.lettering_small_prep_multiplier, 1.3);
  else if (hIn <= 12) prepMult = num(settings.lettering_normal_prep_multiplier, 1.0);
  else if (hIn <= 20) prepMult = num(settings.lettering_medium_prep_multiplier, 0.9);
  else if (hIn <= 30) prepMult = num(settings.lettering_large_prep_multiplier, 0.8);
  else                prepMult = num(settings.lettering_extra_large_prep_multiplier, 0.7);
  const letters_labor_hours = letters_total_sqft * basePerSqft * prepMult;

  // Paint Mask (only when the second color requires masking)
  const usingMask = dl.second_color_mask === "paint_mask";
  let mask_sqft = 0, mask_material_cost = 0, mask_machine_cost = 0;
  let mask_weed_labor_cost = 0, mask_apply_labor_cost = 0, mask_labor_hours = 0;
  if (usingMask) {
    // Mask covers the face area only (returns aren't typically masked for a 2nd color)
    mask_sqft = letters_face_sqft;
    const matRate    = num(settings.paint_mask_rate_per_sqft);
    const machineRate= num(settings.paint_mask_machine_cutting_rate_per_sqft);
    const weedRate   = num(settings.paint_mask_cutting_labor_rate_per_sqft);
    const applyRate  = num(settings.paint_mask_application_labor_rate_per_sqft);
    const laborRate  = num(settings.default_labor_rate, 60) || 60;

    mask_material_cost = mask_sqft * matRate;
    mask_machine_cost  = mask_sqft * machineRate;
    mask_weed_labor_cost  = mask_sqft * weedRate;
    mask_apply_labor_cost = mask_sqft * applyRate;
    // Convert mask labor $ back into hours so it rolls into the maintenance labor pool
    const mask_labor_cost = mask_weed_labor_cost + mask_apply_labor_cost;
    mask_labor_hours = laborRate > 0 ? (mask_labor_cost / laborRate) : 0;

    // For a 2nd color the letters get painted twice on the face (base + accent),
    // double the face paint quantity.
    const secondColorExtraPaint = letters_face_sqft * liquid$PerSqft * wasteMult;
    // Add to letters_paint_cost
    // (mutate locally so the return value matches)
    // eslint-disable-next-line no-param-reassign
    return finalize({
      letters_face_sqft, letters_returns_sqft, letters_total_sqft,
      letters_gallons: letters_gallons + (letters_face_sqft * wasteMult) / coverage,
      letters_paint_cost: letters_paint_cost + secondColorExtraPaint,
      mask_sqft, mask_material_cost, mask_machine_cost,
      mask_weed_labor_cost, mask_apply_labor_cost,
      mask_labor_hours, letters_labor_hours,
    });
  }

  return finalize({
    letters_face_sqft, letters_returns_sqft, letters_total_sqft,
    letters_gallons, letters_paint_cost,
    mask_sqft: 0, mask_material_cost: 0, mask_machine_cost: 0,
    mask_weed_labor_cost: 0, mask_apply_labor_cost: 0,
    mask_labor_hours: 0, letters_labor_hours,
  });
};

const finalize = (r) => {
  const mask_total_cost =
    r.mask_material_cost + r.mask_machine_cost + r.mask_weed_labor_cost + r.mask_apply_labor_cost;
  const letters_total_added_cost = r.letters_paint_cost + mask_total_cost;
  return { ...r, mask_total_cost, letters_total_added_cost };
};