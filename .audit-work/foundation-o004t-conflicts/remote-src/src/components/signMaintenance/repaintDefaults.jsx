// Defaults & constants for the Repaint action estimator.
// Setting names follow the "maintenance_repaint_*" convention so they live
// inside the maintenance_pricing category alongside other repaint config.

// Paint coverage and price
export const REPAINT_DEFAULTS = {
  // Paint
  maintenance_repaint_coverage_sqft_per_gallon: "350",  // typical exterior acrylic
  maintenance_repaint_paint_cost_per_gallon:    "55",
  maintenance_repaint_primer_coats:             "1",
  maintenance_repaint_finish_coats:             "2",

  // Productivity (sqft per hour for prep+paint, drives labor for monument repaints
  // when the action rate uses sqft basis)
  maintenance_repaint_sqft_per_hour:            "60",

  // Feature time/material multipliers for "entire panel" repaints
  // (applied to base panel labor/material when feature is selected).
  maintenance_repaint_feat_dimensional_letters: "1.35",
  maintenance_repaint_feat_painted_letters:     "1.25",
  maintenance_repaint_feat_applied_vinyl:       "1.15",
  maintenance_repaint_feat_complex_layering:    "1.40",

  // Paint condition difficulty — 10 positions. 1 = like-new, 10 = severely degraded.
  // Each step adds X% prep labor.
  maintenance_repaint_condition_step_pct:       "8",   // 8% per step over level 1
};

export const REPAINT_FEATURES = [
  { id: "dimensional_letters", label: "Dimensional Letters", setting: "maintenance_repaint_feat_dimensional_letters" },
  { id: "painted_letters",     label: "Painted Letters",     setting: "maintenance_repaint_feat_painted_letters" },
  { id: "applied_vinyl",       label: "Applied Vinyl",       setting: "maintenance_repaint_feat_applied_vinyl" },
  { id: "complex_layering",    label: "Complex Layering/Shapes", setting: "maintenance_repaint_feat_complex_layering" },
];

export const PAINT_CONDITION_LABELS = [
  "Like New", "Excellent", "Very Good", "Good", "Fair",
  "Worn", "Faded", "Heavily Faded", "Chalking", "Severely Degraded",
];

// Retainer widths offered on "returns only" mode
export const RETAINER_WIDTHS_IN = [1, 1.5, 2, 2.5, 3, 4, 5, 6];

// Slider ranges
export const MONUMENT_LENGTH_RANGE_FT = { min: 1, max: 50, step: 0.5 };
export const MONUMENT_HEIGHT_RANGE_FT = { min: 1, max: 50, step: 0.5 };
export const MONUMENT_RETURN_DEPTH_RANGE_IN = { min: 1, max: 48, step: 0.5 };