// Per-module settings "factory defaults" (#83). Every value is the exact
// fallback the calculation/consumption code already uses when a Settings row
// is absent or unparsable — resetting to these restores out-of-the-box math.
// Keys with no real constant fallback (e.g. chained install_* overrides,
// JSON-structured tier/consumable editors) are intentionally NOT listed so a
// reset never fabricates a value the calculators would not produce.

export const CNC_SETTINGS_DEFAULTS = {
  // Consumed by CNCEstimator load + item math:
  //   parseFloat(cnc_machine_rate)||75, ||45, ||20, ||0, ||0, ||3.5
  cnc_machine_rate: "75",
  cnc_labor_rate: "45",
  cnc_setup_time_percentage: "20",
  min_cnc_setup_hours: "0",
  min_cnc_labor_hours: "0",
  cnc_letter_perimeter_factor: "3.5",
  // Machine-rate calculator inputs: informational only — no estimator fallback,
  // the calculator treats missing values as 0.
  cnc_purchase_price: "0",
  cnc_lifespan_years: "0",
  cnc_usage_hours_per_week: "0",
  cnc_annual_maintenance_cost: "0",
  cnc_power_consumption_kw: "0",
  cnc_tooling_cost_per_hour: "0",
  electricity_cost_per_kwh: "0",
  operator_cost_per_hour: "0",
  facility_overhead_per_hour: "0",
  // Material multipliers: parseFloat || 1.0
  acrylic_cnc_cut_multiplier: "1",
  wood_cnc_cut_multiplier: "1",
  mdf_cnc_cut_multiplier: "1",
  plywood_cnc_cut_multiplier: "1",
  pvc_cnc_cut_multiplier: "1",
  hdpe_cnc_cut_multiplier: "1",
  aluminum_cnc_cut_multiplier: "1",
  corian_cnc_cut_multiplier: "1",
  // Per-thickness cut speeds: parseFloat || 50 ipm
  cnc_cut_speed_1_16: "50",
  cnc_cut_speed_1_8: "50",
  cnc_cut_speed_3_16: "50",
  cnc_cut_speed_1_4: "50",
  cnc_cut_speed_3_8: "50",
  cnc_cut_speed_1_2: "50",
  cnc_cut_speed_5_8: "50",
  cnc_cut_speed_3_4: "50",
  cnc_cut_speed_7_8: "50",
  cnc_cut_speed_1: "50",
  cnc_cut_speed_1_1_4: "50",
  cnc_cut_speed_1_1_2: "50",
  cnc_cut_speed_2: "50",
  cnc_cut_speed_2_1_2: "50",
  cnc_cut_speed_3: "50",
  cnc_cut_speed_3_1_2: "50",
  cnc_cut_speed_4: "50",
};

export const LASER_SETTINGS_DEFAULTS = {
  // Consumed by LaserEstimator load + laserCalc fallbacks:
  parameter_laser_machine_rate: "100",
  parameter_laser_labor_rate: "75",
  engraving_laser_machine_rate: "80",
  engraving_labor_rate: "40",
  parameter_handling_time_percentage: "15",
  engraving_handling_time_percentage: "20",
  min_parameter_laser_setup_hours: "0.5",
  min_parameter_laser_labor_hours: "0",
  parameter_laser_fixed_material_setup_cost: "0",
  min_engraving_laser_setup_hours: "0",
  min_engraving_laser_labor_hours: "0",
  engraving_laser_fixed_material_setup_cost: "0",
  laser_letter_perimeter_factor: "3.5",
  laser_engrave_speed_sqipm: "5",
  acrylic_cut_multiplier: "1",
  wood_cut_multiplier: "1",
  leather_cut_multiplier: "1",
  acrylic_engrave_multiplier: "1",
  wood_engrave_multiplier: "1",
  leather_engrave_multiplier: "1",
  // Thickness cut speeds: parseFloat || 20 ipm
  cut_speed_1_16: "20",
  cut_speed_1_8: "20",
  cut_speed_3_16: "20",
  cut_speed_1_4: "20",
  cut_speed_3_8: "20",
  cut_speed_1_2: "20",
  cut_speed_3_4: "20",
  electricity_cost_per_kwh: "0",
  operator_cost_per_hour: "0",
  facility_overhead_per_hour: "0",
  // Machine-cost calculator inputs are informational (no estimator fallback).
  parameter_laser_purchase_price: "0",
  parameter_laser_lifespan_years: "0",
  parameter_laser_usage_hours_per_week: "0",
  parameter_laser_annual_maintenance_cost: "0",
  parameter_laser_chiller_annual_maintenance_cost: "0",
  parameter_laser_power_consumption_kw: "0",
  parameter_laser_chiller_power_consumption_kw: "0",
  parameter_laser_blower_power_consumption_kw: "0",
  parameter_laser_tube_purchase_price: "0",
  parameter_laser_tube_lifespan_hours: "0",
  engraving_laser_purchase_price: "0",
  engraving_laser_lifespan_years: "0",
  engraving_laser_usage_hours_per_week: "0",
  engraving_laser_annual_maintenance_cost: "0",
  engraving_laser_chiller_annual_maintenance_cost: "0",
  engraving_laser_power_consumption_kw: "0",
  engraving_laser_chiller_power_consumption_kw: "0",
  engraving_laser_blower_power_consumption_kw: "0",
  engraving_laser_tube_purchase_price: "0",
  engraving_laser_tube_lifespan_hours: "0",
};

export const METAL_SETTINGS_DEFAULTS = {
  // MetalEstimator: metal_* with legacy fallbacks, defaults 65/75/55.
  metal_fabrication_rate: "65",
  metal_welding_rate: "75",
  metal_finishing_rate: "55",
};

export const FOUNDATION_SETTINGS_DEFAULTS = {
  // legacyFoundationCalc getSetting() fallbacks + FoundationRatesPanel RATES.
  foundation_main_labor_rate: "60",
  foundation_pouring_cost_per_cy: "15",
  foundation_forming_cost_per_sqft: "2.5",
  foundation_finishing_cost_per_sqft: "1.25",
  foundation_rebar_time_cross_section: "0.05",
  foundation_rebar_time_linear_ft: "0.02",
  foundation_hand_dig_time_per_cy: "2",
  foundation_equipment_excavation_time_per_cy: "0.5",
  foundation_forming_materials_spread_foot: "0.5",
  foundation_forming_materials_pillar: "0.75",
  // wallCalculator fallbacks.
  wall_labor_rate: "45",
  wall_minimum_charge: "150",
  wall_labor_bricks_per_hour: "50",
  // poleCalculator fallbacks.
  pole_paint_cost_per_lf: "3.5",
  pole_paint_labor_per_lf: "2.5",
  pole_paint_size_multiplier_4in: "1",
  pole_paint_size_multiplier_6in: "1.25",
  pole_paint_size_multiplier_8in: "1.5",
  pole_paint_size_multiplier_10in: "1.75",
  pole_paint_size_multiplier_12in: "2",
};

export const MAINTENANCE_SETTINGS_DEFAULTS = {
  // MaintenanceEstimator crew-rate fallbacks: ||75 / ||65 / ||35.
  maintenance_crew_lead_rate: "75",
  maintenance_tech_rate: "65",
  maintenance_helper_rate: "35",
  // maintenance_shop_address / travel overrides fall back to shared install_*
  // settings rather than a constant, so they are not reset here.
};

export const PAINTING_SETTINGS_DEFAULTS = {
  // paintCalc num(..., fallback) constants.
  default_labor_rate: "60",
  min_labor_hours: "0",
  min_paint_cost: "0",
  base_supplies_per_job: "0",
  default_paint_supplies_per_sqft: "1.25",
  paint_cost_per_unit: "0",
  paint_unit: "gallon",
  hardener_cost_per_unit: "0",
  hardener_unit: "gallon",
  reducer_cost_per_unit: "0",
  reducer_unit: "gallon",
  paint_mix_ratio: "3",
  hardener_mix_ratio: "1",
  reducer_mix_ratio: "1",
  mixed_paint_coverage_sqft_per_gallon: "350",
  paint_waste_multiplier: "1.25",
  fixed_paint_waste_gallons: "0",
  paint_mask_rate_per_sqft: "0.75",
  paint_mask_machine_cutting_rate_per_sqft: "0.1",
  paint_mask_cutting_labor_rate_per_sqft: "0.15",
  paint_mask_application_labor_rate_per_sqft: "0.25",
  // base_labor_hours_per_sqft (calc fallback 0.05) is auto-derived as
  // prep + paint on this page — keep the composite consistent by assigning
  // the whole 0.05 to prep.
  base_labor_hours_prep_per_sqft: "0.05",
  base_labor_hours_paint_per_sqft: "0",
  base_labor_hours_per_sqft: "0.05",
  setup_time_labor_hours: "0.5",
  paint_mixing_labor_hours: "0.25",
  color_change_setup_hours: "0.25",
  paint_gun_cleaning_hours: "0.15",
  one_side_paint_multiplier: "0.8",
  both_sides_paint_multiplier: "1",
  additional_color_multiplier: "0.3",
  simple_complexity_multiplier: "0.7",
  moderate_complexity_multiplier: "1",
  complex_complexity_multiplier: "1.5",
  letter_perimeter_factor: "3.5",
};

// Apply a module's defaults to the page's `values` map, restricted to the
// keys the page actually manages so unrelated settings are untouched.
export function resetValuesToDefaults(values, defaults, managedKeys) {
  const next = { ...(values || {}) };
  const keys = managedKeys && managedKeys.length ? managedKeys : Object.keys(next);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(defaults, key)) next[key] = defaults[key];
  }
  return next;
}
