const close = (a, b) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
const nonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const whole = value => nonnegative(value) && Number.isSafeInteger(value);
const STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// Internal steel cost only. Call with a freshly calculated model, never stored calculated metadata.
// `supportsResolution` is the fresh support-economics result for modeled supports;
// steel amounts here stay steel-only — support money is added exactly once downstream.
export function priceFoundationReinforcementModel(model, basis = {}, supportsResolution = null) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const unavailable = () => ({
    steelPriceAvailable: false, canApplyToEstimate: false, amounts: null,
    engineeringApproved: false, issues,
  });
  if (model?.version !== 2 || !["valid", "off"].includes(model.status) || !model.totals
    || !Array.isArray(model.groups) || !whole(model.instanceCount) || !model.instanceCount
    || !Array.isArray(model.issues) || model.issues.some(i => i?.severity !== "warning")) {
    issue("model", "reinforcement_model_unavailable", "Calculate a valid current version-2 model before pricing.");
    return unavailable();
  }
  const connections = ["mat_crossings", "hoop_bar_crossings", "tie_ends"];
  if (!connections.every(key => whole(model.totals[key])) || !nonnegative(model.totals.total_steel_feet)) {
    issue("model.totals", "reinforcement_model_quantities_invalid", "Complete finite steel quantities and connection counts are required.");
    return unavailable();
  }
  const modelConnections = connections.reduce((sum, key) => sum + model.totals[key], 0);
  if (!Number.isSafeInteger(modelConnections)) {
    issue("model.totals", "reinforcement_connection_range_invalid", "Connection count is outside the supported numeric range.");
    return unavailable();
  }
  const feet = model.totals.total_steel_feet;
  if (model.status === "off") {
    if (feet || modelConnections || model.groups.length) {
      issue("model", "reinforcement_off_model_invalid", "A disabled steel model cannot contain priced steel.");
      return unavailable();
    }
    return {
      steelPriceAvailable: true, canApplyToEstimate: true, engineeringApproved: false, issues,
      amounts: {
        geometry_feet: 0, priced_feet: 0, connection_count: 0, material_cost: 0,
        labor_hours: 0, labor_cost: 0, steel_cost: 0, priced_weight_lbs: 0, geometry_weight_lbs: 0,
      },
    };
  }
  basis = basis && typeof basis === "object" ? basis : {};
  if (basis.unit !== "ft") issue("unit", "reinforcement_cost_unit_invalid", "An explicit per-foot material pricing basis is required.");
  for (const key of ["cost_per_ft", "labor_rate_per_hour", "labor_hours_per_ft", "labor_hours_per_connection"]) {
    if (!nonnegative(basis[key])) issue(key, "reinforcement_cost_input_invalid", "Use an explicit finite nonnegative rate; zero is allowed.");
  }
  if (!nonnegative(basis.bar_diameter_inches) || !basis.bar_diameter_inches) {
    issue("bar_diameter_inches", "reinforcement_material_diameter_required", "The priced material needs a known positive nominal diameter.");
  }
  let scheduledFeet = 0;
  if (!model.groups.length || !feet) issue("model.groups", "reinforcement_cost_schedule_missing", "Enabled steel requires a nonempty cut-quantity schedule.");
  for (const group of model.groups) {
    if (!STEEL_ROLES.includes(group?.role) || !whole(group?.count) || !group.count || !nonnegative(group.cut_length_inches) || !group.cut_length_inches
      || !nonnegative(group.diameter_inches) || !group.diameter_inches) {
      issue("model.groups", "reinforcement_cost_schedule_invalid", "Each cut group needs finite positive quantity, length and diameter.");
      continue;
    }
    scheduledFeet += group.count * group.cut_length_inches / 12 * model.instanceCount;
    if (!close(group.diameter_inches, basis.bar_diameter_inches)) {
      issue("bar_diameter_inches", "reinforcement_material_diameter_mismatch", "The priced bar diameter does not match the geometry.");
    }
  }
  if (!Number.isFinite(scheduledFeet) || !close(scheduledFeet, feet)) {
    issue("model.groups", "reinforcement_cost_schedule_mismatch", "Current model totals and cut schedule do not reconcile.");
  }
  const override = basis.quantity_override_ft;
  if (override !== null && override !== undefined && !nonnegative(override)) {
    issue("quantity_override_ft", "reinforcement_quantity_override_invalid", "An explicit aggregate quantity override must be finite and nonnegative.");
  }
  const weight = basis.weight_lb_per_ft;
  if (weight !== null && weight !== undefined && (!nonnegative(weight) || !weight)) {
    issue("weight_lb_per_ft", "reinforcement_material_weight_invalid", "Known material weight per foot must be finite and positive.");
  }
  if (issues.some(i => i.severity === "error")) return unavailable();
  const multiply = (a, b, field) => {
    const value = a * b;
    if (!Number.isFinite(value) || (a > 0 && b > 0 && value === 0)) {
      issue(field, "reinforcement_cost_numeric_range_invalid", "A positive cost/weight calculation overflowed or underflowed.");
    }
    return value;
  };
  const pricedFeet = override ?? feet;
  const material = multiply(pricedFeet, basis.cost_per_ft, "material_cost");
  const hours = multiply(pricedFeet, basis.labor_hours_per_ft, "linear_labor_hours")
    + multiply(modelConnections, basis.labor_hours_per_connection, "connection_labor_hours");
  const labor = multiply(hours, basis.labor_rate_per_hour, "labor_cost");
  const amounts = {
    geometry_feet: feet, priced_feet: pricedFeet, connection_count: modelConnections,
    material_cost: material, labor_hours: hours, labor_cost: labor, steel_cost: material + labor,
    priced_weight_lbs: weight == null ? null : multiply(pricedFeet, weight, "priced_weight_lbs"),
    geometry_weight_lbs: weight == null ? null : multiply(feet, weight, "geometry_weight_lbs"),
  };
  if (issues.some(i => i.severity === "error")) return unavailable();
  if (Object.values(amounts).some(value => value !== null && !Number.isFinite(value))) {
    issue("amounts", "reinforcement_cost_numeric_range_invalid", "Steel cost or weight exceeds the supported numeric range.");
    return unavailable();
  }
  if (override != null && !close(pricedFeet, feet)) issue("quantity_override_ft", "reinforcement_priced_quantity_differs",
    "The explicit aggregate priced quantity differs from geometric steel; it was not scaled again by foundation quantity.", "warning");
  if (weight == null) issue("weight_lb_per_ft", "reinforcement_weight_unknown", "Steel weight is unknown, not zero; BOM/handoff compatibility still requires resolution.", "warning");
  const supportsReady = model.supports?.status === "not_required"
    || (model.supports?.status === "off_explained" && model.supports.count === 0
      && typeof model.supports.reason === "string" && Boolean(model.supports.reason.trim()))
    || (model.supports?.status === "modeled" && supportsResolution?.status === "resolved");
  if (!supportsReady) issue("supports", "reinforcement_support_cost_unknown", "Support quantities/costs are unresolved; steel-only pricing cannot replace the estimate.", "warning");
  const connectionUnverified = model.issues?.some(i =>
    ["reinforcement_connection_unverified", "reinforcement_tie_path_only"].includes(i.code));
  if (connectionUnverified) issue("connections", "reinforcement_connection_cost_unverified",
    "Connection/fabrication assumptions need review before this steel-only amount can replace current pricing.", "warning");
  return {
    steelPriceAvailable: true, canApplyToEstimate: supportsReady && weight != null && !connectionUnverified,
    engineeringApproved: false, amounts, issues,
  };
}