import { MaintenanceInventory } from "@/entities/all";
import { loadMasterPartCatalog } from "@/components/estimator/parts/partCatalog";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function isMaintenanceMaterialCatalogItem(item) {
  if (!item?.entity || !item?.row) return false;
  const row = item.row;
  if (item.entity === "DimensionalLetterMaterial") {
    return row.is_active !== false && (
      row.show_in_vinyl_replacement === true ||
      row.show_in_replace_returns === true ||
      row.show_in_replace_face === true
    );
  }
  if (item.entity === "ChannelLetterInstallInventory") return row.show_in_maintenance_materials === true;
  if (["VinylInventory", "SignLightingInventory", "SignHardwareInventory", "SignPartsSuppliesInventory"].includes(item.entity)) {
    return row.is_active !== false && row.show_in_sign_maintenance !== false && row.show_in_master_only !== true;
  }
  if (item.entity === "FoundationInventory") {
    return row.show_in_sign_maintenance === true && !["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type);
  }
  return false;
}

export function suggestedUsageBasis(item) {
  const row = item?.row || {};
  if (item?.entity === "DimensionalLetterMaterial" || item?.entity === "VinylInventory") return "per_sqft";
  if (item?.entity === "SignLightingInventory") {
    if (["led_module", "led_strip", "led_neon", "fluorescent_tube", "neon_tube", "wire", "connector"].includes(row.lighting_type)) return "per_letter";
    return "per_service_item";
  }
  if (item?.entity === "ChannelLetterInstallInventory") {
    if (row.pricing_mode === "per_raceway_foot") return "per_linear_foot";
    if (["per_letter_flat", "per_letter_by_size"].includes(row.pricing_mode)) return "per_letter";
    return "per_service_item";
  }
  if (item?.entity === "SignPartsSuppliesInventory") {
    if (["trim_cap", "returns", "retainer", "j_bar", "raceway_cover", "edge_trim"].includes(row.category)) return "per_linear_foot";
    if (row.pricing_mode === "per_sqft") return "per_sqft";
  }
  return "per_service_item";
}

export function suggestedUsageMultiplier(item, basis = suggestedUsageBasis(item)) {
  const row = item?.row || {};
  if (basis !== "per_sqft") return 1;

  if (item?.entity === "DimensionalLetterMaterial") {
    const grossSqft = num(row.sheet_width_inches) * num(row.sheet_length_inches) / 144;
    const yieldFactor = Math.max(0.01, num(row.yield_factor, 1));
    const usableSqft = grossSqft * yieldFactor;
    return usableSqft > 0 ? 1 / usableSqft : 1;
  }

  if (item?.entity === "VinylInventory") {
    const yieldFactor = Math.max(0.01, num(row.yield_factor, 1));
    if (row.pricing_mode === "per_sqft") return 1;
    if (row.pricing_mode === "per_roll") {
      const grossSqft = (num(row.roll_width_inches) / 12) * (num(row.roll_length_yards) * 3);
      const usableSqft = grossSqft * yieldFactor;
      return usableSqft > 0 ? 1 / usableSqft : 1;
    }
    if (row.pricing_mode === "per_linear_foot") {
      const usableSqftPerLinearFoot = (num(row.roll_width_inches) / 12) * yieldFactor;
      return usableSqftPerLinearFoot > 0 ? 1 / usableSqftPerLinearFoot : 1;
    }
  }

  return 1;
}

export function legacyPricingModeForUsageBasis(basis) {
  if (basis === "per_letter") return "per_letter_flat";
  if (basis === "per_cabinet") return "per_cabinet_flat";
  if (basis === "per_linear_foot") return "per_linear_foot";
  if (basis === "per_sqft") return "per_sqft";
  return "per_project_flat";
}

export function enrichMaintenanceRule(rule, catalogByKey) {
  const key = rule?.inventory_entity && rule?.inventory_item_id
    ? `${rule.inventory_entity}:${rule.inventory_item_id}`
    : "";
  const master = key ? catalogByKey.get(key) || null : null;
  return {
    ...rule,
    _master_item: master,
    _master_missing: !!key && !master,
    _master_unit_cost: master?.unitCost,
    _master_unit: master?.unit,
    _master_pricing_mode: master?.pricingMode,
    _master_category_label: master?.categoryLabel,
    _display_name: master?.name || rule?.inventory_item_name || rule?.item_name || "Maintenance Material",
  };
}

export async function loadMaintenanceMaterialRules({ includeInactive = false } = {}) {
  const [rules, catalog] = await Promise.all([
    MaintenanceInventory.list("sort_order").catch(() => []),
    loadMasterPartCatalog(),
  ]);
  const maintenanceCatalog = (catalog || []).filter(isMaintenanceMaterialCatalogItem);
  const catalogByKey = new Map(maintenanceCatalog.map((item) => [`${item.entity}:${item.inventoryId}`, item]));
  return {
    rules: (rules || [])
      .filter((rule) => includeInactive || rule.is_active !== false)
      .map((rule) => enrichMaintenanceRule(rule, catalogByKey)),
    catalog: maintenanceCatalog,
  };
}
