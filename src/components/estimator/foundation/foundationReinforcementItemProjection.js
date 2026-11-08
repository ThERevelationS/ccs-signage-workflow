import { calcItemCost as legacyCalcItemCost } from "./legacyFoundationCalc";
import { foundationItemCatalogIssues } from "./foundationCatalogIntegrity";
import { foundationInputNumber } from "./foundationGeometryInputs";
import { calculateFoundationReinforcementProjection } from "./foundationReinforcementProjection";

const isRecord = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finiteNonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const COMMON_OVERRIDES = [
  "custom_concrete_qty", "custom_concrete_cost_per_cy", "custom_forming_qty", "custom_forming_rate",
  "custom_finishing_hours", "custom_finishing_rate", "custom_excavation_hours", "custom_excavation_rate",
];

// Local proposal-only item projection. Active legacy pricing is untouched.
// Calculate common costs with rebar OFF, then add independent fresh steel once.
export function calculateFoundationReinforcementItemProjection({
  item, design, material, inventory = [], settings = {}, excavationMethod,
  quantityOverride = null, rateOverride = null,
} = {}) {
  const reinforcement = calculateFoundationReinforcementProjection({
    item, design, material, inventory, settings, quantityOverride, rateOverride,
  });
  const issues = [...reinforcement.issues];
  const issue = (field, code, message) => issues.push({ field, code, message, scope: "common_cost", severity: "error" });
  const unavailable = () => ({
    calculationVersion: 2, engineeringApproved: false, reinforcement, commonCost: null,
    itemCost: null, issues, priceAvailable: false, canApplyToEstimate: false,
  });
  if (!["valid", "off"].includes(reinforcement.model.status)) return unavailable();
  if (!isRecord(item)) {
    issue("item", "reinforcement_common_item_invalid", "A current foundation record is required.");
    return unavailable();
  }
  if (!Array.isArray(inventory) || inventory.some(row => !isRecord(row))) {
    issue("inventory", "reinforcement_common_inventory_unavailable", "Current concrete and forming catalog records could not be verified.");
    return unavailable();
  }
  if (!isRecord(settings)) {
    issue("settings", "reinforcement_common_settings_unavailable", "Current common-cost settings could not be verified.");
    return unavailable();
  }
  const commonItem = { ...item, include_rebar: false, excavation_method: item.excavation_method || excavationMethod };
  const bagged = inventory.some(row => row.id === item.selected_concrete_id && row.material_type === "bagged_concrete");
  const commonSettings = { ...settings };
  const activeSettings = [
    "foundation_main_labor_rate", "foundation_pouring_cost_per_cy",
    commonItem.excavation_method === "hand_dig" || !commonItem.excavation_method
      ? "foundation_hand_dig_time_per_cy" : "foundation_equipment_excavation_time_per_cy",
    ...(item.include_finishing ? ["foundation_finishing_cost_per_sqft"] : []),
    ...(item.include_forming ? ["foundation_forming_cost_per_sqft",
      item.foundation_type === "spread_foot" ? "foundation_forming_materials_spread_foot" : "foundation_forming_materials_pillar"] : []),
  ];
  for (const key of activeSettings) {
    if (!Object.hasOwn(settings, key) || settings[key] === undefined) continue;
    const value = foundationInputNumber(settings[key]);
    if (value === null || value < 0) issue(`settings.${key}`, "reinforcement_common_setting_invalid",
      "An explicit active common-cost setting must be a finite nonnegative decimal; malformed values do not infer defaults.");
    // The legacy getSetting uses ||; a textual0 preserves the explicit zero.
    else commonSettings[key] = value === 0 ? "0" : value;
  }
  for (const field of COMMON_OVERRIDES) {
    if (field.startsWith("custom_forming_") && !item.include_forming) continue;
    if (field.startsWith("custom_finishing_") && !item.include_finishing) continue;
    if (field === "custom_concrete_cost_per_cy" && !bagged) continue;
    if (item[field] == null) continue;
    const value = foundationInputNumber(item[field]);
    if (value === null || value < 0) issue(field, "reinforcement_common_override_invalid",
      "An active common-cost override must be a finite nonnegative decimal; clear it explicitly to use the current basis.");
    else commonItem[field] = value;
  }
  const catalogIssues = foundationItemCatalogIssues(commonItem, inventory);
  issues.push(...catalogIssues.map(value => ({ ...value, severity: "error", scope: "common_cost" })));
  for (const field of ["selected_concrete_id", ...(item.include_forming ? ["selected_forming_id"] : [])]) {
    if (item[field] == null || item[field] === "") continue;
    if (inventory.filter(row => row.id === item[field]).length > 1) issue(field, "reinforcement_common_catalog_ambiguous",
      "The selected common-cost catalog ID is duplicated; refresh the catalog before previewing a replacement price.");
  }
  if (issues.some(value => value.scope === "common_cost" && value.severity === "error")) return unavailable();
  const common = legacyCalcItemCost(commonItem, inventory, commonSettings);
  const commonCost = {
    concrete: common.concreteCost, forming: common.formingCost, pouring: common.pouringCost,
    finishing: common.finishingCost, excavation: common.excavationCost, total: common.total,
  };
  const commonValues = [
    ...Object.values(commonCost), common.volumeCY, common.baseVolumeCY, common.excavationHours, common.excavationRate,
    ...(bagged ? [common.concreteRate] : []),
    ...(item.include_forming ? [common.formingRate, common.formingQty] : []),
    ...(item.include_finishing ? [common.finishingRate, common.finishingHours] : []),
    ...(common.concreteBags === null ? [] : [common.concreteBags]),
  ];
  if (common.rebarCost !== 0 || !commonValues.every(finiteNonnegative)) {
    issue("common_cost", "reinforcement_common_result_invalid",
      "Common quantities, rates, hours or amounts are invalid. No replacement total is available; current saved pricing is unchanged.");
    return unavailable();
  }
  const steel = reinforcement.steel.amounts;
  if (!reinforcement.steel.steelPriceAvailable || !steel) return unavailable();
  const total = commonCost.total + steel.steel_cost, excavationVolume = common.volumeCY * 1.25;
  if (![total, excavationVolume].every(finiteNonnegative)) {
    issue("item_total_cost", "reinforcement_item_result_invalid", "The proposed item cost or excavation volume exceeds the supported numeric range.");
    return unavailable();
  }
  return {
    calculationVersion: 2, engineeringApproved: false, reinforcement, commonCost, issues, priceAvailable: true,
    canApplyToEstimate: reinforcement.canApplyToEstimate,
    itemCost: {
      quantity: reinforcement.model.instanceCount, concrete_volume_cy: common.volumeCY,
      excavation_volume_cy: excavationVolume, concrete_bags: common.concreteBags,
      concrete_cost: common.concreteCost, concrete_rate: finiteNonnegative(common.concreteRate) ? common.concreteRate : null,
      rebar_feet: steel.priced_feet, rebar_weight_lbs: steel.priced_weight_lbs,
      rebar_cost: steel.steel_cost, rebar_rate: reinforcement.basis?.cost_per_ft ?? 0,
      rebar_material_cost: steel.material_cost, rebar_labor_cost: steel.labor_cost,
      rebar_labor_hours: steel.labor_hours, rebar_geometry_feet: steel.geometry_feet,
      rebar_geometry_weight_lbs: steel.geometry_weight_lbs, rebar_connection_count: steel.connection_count,
      excavation_cost: common.excavationCost, excavation_hours: common.excavationHours,
      forming_cost: common.formingCost, forming_qty: item.include_forming ? common.formingQty : 0,
      pouring_cost: common.pouringCost, finishing_cost: common.finishingCost,
      finishing_hours: item.include_finishing ? common.finishingHours : 0, item_total_cost: total,
    },
  };
}
