import { foundationInputNumber } from "./foundationGeometryInputs";

const FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
const finiteRate = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const positive = value => finiteRate(value) && value > 0;
const isRecord = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const numeric = value => {
  const parsed = foundationInputNumber(value);
  if (parsed !== null) return parsed;
  return value === null || ["undefined", "number", "string", "boolean"].includes(typeof value) ? value : NaN;
};
const text = value => typeof value === "string" ? value.trim() : "";

// This resolves explicit inputs only; it never guesses #size diameter, stock units or weight.
export function resolveFoundationReinforcementBasis({
  material, inventory = [], settings = {}, quantityOverride = null, rateOverride = null,
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const reference = isRecord(material) ? material : {};
  let row = null, source = null, name = "", reason = "", inventoryId = null;
  if (reference.kind === "manual") {
    source = reference;
    name = text(reference.name) || "Manual rebar";
    reason = text(reference.reason);
    if (!reason || reason.length > 1000) issue("material.reason", "reinforcement_manual_basis_reason_required",
      "Explain the manual material/rate basis in 1 to 1000 characters; this is not an engineering approval.");
  } else if (reference.kind === "catalog") {
    const id = reference.inventory_id;
    if (typeof id !== "string" || !id || id.trim() !== id || id.length > 128) {
      issue("material.inventory_id", "reinforcement_material_id_required", "Select a stable rebar inventory ID.");
    } else if (!Array.isArray(inventory)) {
      issue("inventory", "reinforcement_inventory_unavailable", "The rebar catalog could not be read; do not assume the material was deleted.");
    } else {
      const matches = inventory.filter(candidate => candidate?.id === id);
      row = matches.length === 1 ? matches[0] : null;
      if (matches.length > 1) issue("material.inventory_id", "reinforcement_material_id_ambiguous", "Multiple current records have the selected ID; refresh the catalog before pricing.");
      else if (!row) issue("material.inventory_id", "reinforcement_material_unavailable", "The selected rebar catalog record is unavailable.");
      else if (row.material_type !== "rebar") {
        issue("material.inventory_id", "reinforcement_material_type_invalid", "The selected catalog record is not rebar.");
        row = null;
      }
      if (row) {
        inventoryId = id;
        name = text(row.material_name) || "Catalog rebar";
        source = { unit: row.unit, cost_per_ft: row.cost_per_unit,
          bar_diameter_inches: row.rebar_diameter_inches, weight_lb_per_ft: row.rebar_weight_lb_per_ft };
      }
    }
  } else issue("material.kind", "reinforcement_material_source_required", "Choose an explicit manual basis or a stable catalog record.");

  const rawUnit = source?.unit;
  const unit = typeof rawUnit === "string" && FOOT_UNITS.includes(rawUnit.trim().toLowerCase()) ? "ft" : undefined;
  if (!unit) issue("material.unit", "reinforcement_material_unit_unsupported",
    "Rebar needs a known per-foot pricing unit; each/stick/weight units are not silently converted.");
  const diameter = numeric(source?.bar_diameter_inches);
  if (!positive(diameter)) issue("material.bar_diameter_inches", "reinforcement_material_diameter_required",
    "Enter a known positive nominal bar diameter; a #size label alone is not diameter metadata.");
  const weight = source?.weight_lb_per_ft == null ? null : numeric(source.weight_lb_per_ft);
  if (weight === null) issue("material.weight_lb_per_ft", "reinforcement_material_weight_unknown",
    "Material weight per foot is unknown, not zero.", "warning");
  else if (!positive(weight)) issue("material.weight_lb_per_ft", "reinforcement_material_weight_invalid",
    "Known material weight per foot must be finite and positive.");
  const override = rateOverride !== null && rateOverride !== undefined;
  const rate = numeric(override ? rateOverride : source?.cost_per_ft);
  if (!finiteRate(rate)) issue(override ? "custom_rebar_cost_per_ft" : "material.cost_per_ft",
    "reinforcement_material_rate_invalid", "Use an explicit finite nonnegative per-foot rate; zero is allowed.");
  if (reference.kind === "catalog" && !override && rate === 0) {
    issue("material.cost_per_ft", "reinforcement_zero_catalog_rate_unconfirmed",
      "A zero catalog price may be unpriced, not free. Use an explicit per-foot override to confirm a zero rate.");
  }
  const quantity = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity !== null && !finiteRate(quantity)) issue("custom_rebar_qty",
    "reinforcement_quantity_override_invalid", "Use a finite nonnegative aggregate item quantity; zero is allowed.");

  const settingsValid = isRecord(settings);
  if (!settingsValid) issue("settings", "reinforcement_settings_unavailable", "Labor settings are unavailable; do not infer defaults from a failed read.");
  const rateSources = [];
  const setting = (key, fallback) => {
    const missing = settingsValid && (!Object.prototype.hasOwnProperty.call(settings, key) || settings[key] === undefined);
    const value = !settingsValid ? undefined : missing ? fallback : numeric(settings[key]);
    if (!finiteRate(value)) issue(`settings.${key}`, "reinforcement_labor_rate_invalid",
      `${key} must be a finite nonnegative number; an explicit malformed value does not use its default.`);
    rateSources.push({ key, source: missing ? "legacy_default" : "settings", value });
    return value;
  };
  const basis = {
    unit, bar_diameter_inches: diameter, weight_lb_per_ft: weight, cost_per_ft: rate,
    quantity_override_ft: quantity,
    labor_rate_per_hour: setting("foundation_main_labor_rate", 60),
    labor_hours_per_ft: setting("foundation_rebar_time_linear_ft", 0.02),
    labor_hours_per_connection: setting("foundation_rebar_time_cross_section", 0.05),
    labor_hours_per_support: setting("foundation_rebar_support_time_each", 0.05),
  };
  return {
    basis, issues, rateSources,
    materialSnapshot: {
      kind: reference.kind === "manual" ? "manual" : reference.kind === "catalog" ? "catalog" : null,
      inventory_id: inventoryId, inventory_updated_date: typeof row?.updated_date === "string" ? row.updated_date : null,
      name: name || "Unresolved rebar", reason: reference.kind === "manual" ? reason : null,
      pricing_unit: unit ?? null, original_unit: typeof rawUnit === "string" ? rawUnit : null,
      bar_diameter_inches: diameter, weight_lb_per_ft: weight,
      cost_per_ft: rate, rate_source: override ? "custom_rebar_cost_per_ft" : reference.kind === "catalog" ? "catalog" : "manual",
    },
  };
}