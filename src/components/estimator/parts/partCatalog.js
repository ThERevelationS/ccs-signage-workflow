import { base44 } from "@/api/base44Client";
import { pricingSnapshot } from "@/components/estimator/builder/partSync";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const human = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const VALID_EXTRUSION_MATERIAL_TYPES = new Set(["Aluminum", "Steel", "Stainless_Steel", "Galvanized_Steel", "Brass", "Copper", "Plastic", "Other"]);
const VALID_EXTRUSION_PRODUCT_TYPES = new Set(["Angle", "Channel", "Tube_Square", "Tube_Round", "Flat_Bar", "Round_Bar", "I_Beam", "H_Beam", "Pipe"]);
const isVisibleExtrusion = (row = {}) => row.legacy_compatibility !== true && VALID_EXTRUSION_MATERIAL_TYPES.has(row.material_type) && VALID_EXTRUSION_PRODUCT_TYPES.has(row.product_type);

const UNIT_BY_MODE = {
  per_roll: "roll",
  per_sqft: "sqft",
  per_linear_foot: "ft",
  per_foot: "ft",
  per_sheet: "sheet",
  per_hour: "hour",
  per_day: "day",
  per_week: "week",
  per_month: "month",
  per_job: "job",
  flat: "job",
  per_project_flat: "job",
  owned_flat: "job",
  per_unit: "each",
  per_piece: "each",
  per_box: "box",
  per_pack: "pack",
  per_gallon: "gallon",
  per_quart: "quart",
  per_pound: "lb",
  per_lb: "lb",
  per_cy: "cy",
  per_pallet: "pallet",
  per_letter_flat: "letter",
  per_letter_by_size: "letter",
  per_raceway_foot: "ft",
};

export function inventoryRowName(entity, row = {}) {
  switch (entity) {
    case "DimensionalLetterMaterial": return row.material_name || "Substrate";
    case "VinylInventory": return row.vinyl_name || "Vinyl";
    case "SignLightingInventory": return row.item_name || "Lighting";
    case "SignHardwareInventory": return row.item_name || "Hardware";
    case "LaborServiceInventory": return row.service_name || row.vendor_name || "Labor / Service";
    case "SignPartsSuppliesInventory": return row.item_name || "Sign Part / Supply";
    case "ChannelLetterInstallInventory": return row.item_name || "Installation Supply";
    case "ChannelLetterInstallEquipment": return row.equipment_name || "Equipment";
    case "FoundationInventory": return row.material_name || "Foundation Material";
    case "Inventory": return [row.material_type, row.product_type, row.size].filter(Boolean).join(" ") || "Extruded Metal";
    default: return row.name || row.item_name || row.material_name || row.service_name || "Inventory Part";
  }
}

export function inventorySubtype(entity, row = {}) {
  return row.material_type || row.vinyl_category || row.lighting_type || row.hardware_type || row.service_category || row.category || row.equipment_type || row.product_type || row.pricing_mode || entity;
}

export function inventorySupplier(entity, row = {}) {
  return row.supplier || row.vendor_name || row.rental_company || "";
}

export function inventoryPricingMode(entity, row = {}) {
  if (entity === "DimensionalLetterMaterial") return "per_sheet";
  if (entity === "FoundationInventory" && row.material_type === "pole") return row.pole_pricing_mode || "per_foot";
  if (entity === "FoundationInventory" && ["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type)) return row.pricing_mode || "per_day";
  if (entity === "Inventory") return row.unit_type || "per_foot";
  return row.pricing_mode || "per_unit";
}

export function inventoryUnit(entity, row = {}) {
  if (row.unit) return row.unit;
  const mode = inventoryPricingMode(entity, row);
  return UNIT_BY_MODE[mode] || human(mode).toLowerCase();
}

export function inventoryUnitCost(entity, row = {}) {
  const mode = inventoryPricingMode(entity, row);
  if (entity === "DimensionalLetterMaterial") return num(row.cost_per_sheet);
  if (entity === "VinylInventory") {
    if (mode === "per_sqft") return num(row.cost_per_sqft);
    if (mode === "per_linear_foot") return num(row.cost_per_linear_foot);
    return num(row.cost_per_roll);
  }
  if (entity === "LaborServiceInventory") return num(row.default_rate);
  if (entity === "ChannelLetterInstallInventory") {
    if (mode === "per_raceway_foot") return num(row.cost_per_foot);
    if (mode === "per_project_flat") return num(row.cost_flat);
    if (mode === "per_letter_by_size") return num(row.cost_medium || row.cost_per_letter);
    return num(row.cost_per_letter);
  }
  if (entity === "ChannelLetterInstallEquipment") {
    if (mode === "per_hour") return num(row.cost_per_hour);
    if (mode === "per_week") return num(row.cost_per_week);
    if (mode === "per_month") return num(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num(row.cost_flat);
    return num(row.cost_per_day);
  }
  if (entity === "FoundationInventory") {
    if (row.material_type === "pole" && mode === "stock_price") return num(row.pole_stock_price);
    if (row.material_type === "wall_cap") return num(row.cap_stock_price || row.cost_per_unit);
    if (["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type)) {
      if (mode === "per_week") return num(row.cost_per_week);
      if (mode === "per_month") return num(row.cost_per_month);
      if (mode === "per_hour") return num(row.cost_per_hour);
      return num(row.cost_per_day || row.cost_per_unit);
    }
    return num(row.cost_per_unit);
  }
  return num(row.cost_per_unit ?? row.default_rate ?? row.cost_flat ?? row.cost_per_sheet);
}

const NUMERIC_DETAIL_FIELDS = new Set([
  "thickness_inches", "sheet_width_inches", "sheet_length_inches", "yield_factor",
  "roll_width_inches", "roll_length_yards", "thickness_mil", "waste_factor_percent",
  "voltage", "wattage", "max_load_watts", "modules_per_run",
  "length_inches", "diameter_inches", "load_rating_lbs",
  "minimum_charge", "typical_duration_hours", "units_per_box",
  "max_height_feet", "horizontal_boom_reach_feet", "pole_stock_length_ft", "standard_length",
]);

export const TYPE_DETAIL_FIELDS = {
  DimensionalLetterMaterial: [
    ["material_type", "Type"], ["thickness_inches", "Thickness"], ["sheet_width_inches", "Sheet Width"], ["sheet_length_inches", "Sheet Length"], ["color", "Color"], ["yield_factor", "Yield"], ["supplier", "Supplier"],
  ],
  VinylInventory: [
    ["manufacturer", "Manufacturer"], ["product_series", "Series"], ["vinyl_category", "Category"], ["vinyl_use_case", "Use Case"], ["finish", "Finish"], ["roll_width_inches", "Roll Width"], ["roll_length_yards", "Roll Length"], ["thickness_mil", "Thickness"], ["waste_factor_percent", "Waste %"], ["yield_factor", "Yield"], ["adhesive_type", "Adhesive"], ["indoor_outdoor", "Indoor/Outdoor"],
  ],
  SignLightingInventory: [
    ["lighting_type", "Type"], ["manufacturer", "Manufacturer"], ["model_number", "Model"], ["color_name", "Color"], ["voltage", "Voltage"], ["wattage", "Watts"], ["max_load_watts", "Max Load"], ["modules_per_run", "Modules/Run"], ["ip_rating", "IP Rating"], ["supplier", "Supplier"],
  ],
  SignHardwareInventory: [
    ["hardware_type", "Type"], ["material", "Material"], ["finish", "Finish"], ["size", "Size"], ["thread_size", "Thread"], ["length_inches", "Length"], ["diameter_inches", "Diameter"], ["load_rating_lbs", "Load Rating"], ["supplier", "Supplier"],
  ],
  LaborServiceInventory: [
    ["service_category", "Category"], ["pricing_mode", "Pricing"], ["minimum_charge", "Minimum"], ["typical_duration_hours", "Typical Hours"], ["vendor_name", "Vendor"], ["description", "Description"],
  ],
  SignPartsSuppliesInventory: [
    ["category", "Category"], ["color", "Color"], ["size", "Size"], ["pricing_mode", "Pricing"], ["units_per_box", "Units/Box"], ["supplier", "Supplier"], ["supplier_sku", "SKU"],
  ],
  ChannelLetterInstallInventory: [
    ["pricing_mode", "Pricing"], ["unit", "Unit"], ["supplier", "Supplier"], ["applies_to", "Applies To"],
  ],
  ChannelLetterInstallEquipment: [
    ["equipment_type", "Type"], ["ownership", "Ownership"], ["pricing_mode", "Pricing"], ["max_height_feet", "Max Height"], ["horizontal_boom_reach_feet", "Horizontal Reach"], ["rental_company", "Rental Company"],
  ],
  FoundationInventory: [
    ["material_type", "Type"], ["foundation_usage", "Usage"], ["lumber_size", "Lumber Size"], ["rebar_size", "Rebar Size"], ["pole_shape", "Pole Shape"], ["pole_stock_length_ft", "Stock Length"], ["wall_material_subtype", "Wall Material"], ["cap_profile", "Cap Profile"], ["supplier", "Supplier"],
  ],
  Inventory: [
    ["material_type", "Material"], ["product_type", "Product"], ["size", "Size"], ["thickness_gauge", "Thickness/Gauge"], ["standard_length", "Stock Length"], ["unit_type", "Pricing Unit"], ["supplier", "Supplier"],
  ],
};

const SOURCES = [
  { key: "equipment", label: "Equipment", entities: [
    { entity: "FoundationInventory", filter: (r) => ["excavation_equipment", "attachment", "sub_attachment"].includes(r.material_type) },
    { entity: "ChannelLetterInstallEquipment", filter: (r) => r.is_active !== false },
  ]},
  { key: "substrates", label: "Substrates", entities: [{ entity: "DimensionalLetterMaterial", filter: (r) => r.is_active !== false }] },
  { key: "supplies", label: "Installation & Maintenance Supplies", entities: [
    { entity: "ChannelLetterInstallInventory" },
    { entity: "FoundationInventory", filter: (r) => ["bagged_concrete", "rebar", "forming_material"].includes(r.material_type) },
  ]},
  { key: "vinyl", label: "Vinyl", entities: [{ entity: "VinylInventory", filter: (r) => r.is_active !== false }] },
  { key: "sign_lighting", label: "Sign Lighting", entities: [{ entity: "SignLightingInventory", filter: (r) => r.is_active !== false }] },
  { key: "sign_hardware", label: "Hardware", entities: [{ entity: "SignHardwareInventory", filter: (r) => r.is_active !== false }] },
  { key: "labor_services", label: "Labor & Services", entities: [{ entity: "LaborServiceInventory", filter: (r) => r.is_active !== false }] },
  { key: "sign_parts_supplies", label: "Sign Parts | Supplies", entities: [{ entity: "SignPartsSuppliesInventory", filter: (r) => r.is_active !== false }] },
  { key: "extruded_metals_poles", label: "Extruded Metals & Poles", entities: [
    { entity: "Inventory", filter: isVisibleExtrusion },
    { entity: "FoundationInventory", filter: (r) => r.material_type === "pole" },
  ]},
  { key: "concrete_stone", label: "Concrete & Stone", entities: [
    { entity: "FoundationInventory", filter: (r) => ["concrete_service", "bagged_concrete", "rebar", "forming_material", "brick_stone", "fill_material", "wall_material", "wall_cap"].includes(r.material_type) },
    { entity: "LaborServiceInventory", filter: (r) => r.service_category === "concrete_service" && r.is_active !== false },
  ]},
];

async function list(entity) {
  try { return await base44.entities[entity].list(); } catch { return []; }
}

export async function loadMasterPartCatalog() {
  const entityNames = [...new Set(SOURCES.flatMap((source) => source.entities.map((spec) => spec.entity)))];
  const loaded = Object.fromEntries(await Promise.all(entityNames.map(async (entity) => [entity, await list(entity)])));
  const itemByInventoryKey = new Map();
  for (const source of SOURCES) {
    for (const spec of source.entities) {
      for (const row of loaded[spec.entity] || []) {
        if (spec.filter && !spec.filter(row)) continue;
        const inventoryKey = `${spec.entity}:${row.id}`;
        const existing = itemByInventoryKey.get(inventoryKey);
        if (existing) {
          if (!existing.categories.some((category) => category.key === source.key)) {
            existing.categories.push({ key: source.key, label: source.label });
            existing.searchText = `${existing.searchText} ${source.label.toLowerCase()}`.trim();
          }
          continue;
        }
        const name = inventoryRowName(spec.entity, row);
        const subtype = inventorySubtype(spec.entity, row);
        const pricingMode = inventoryPricingMode(spec.entity, row);
        const unit = inventoryUnit(spec.entity, row);
        const unitCost = inventoryUnitCost(spec.entity, row);
        itemByInventoryKey.set(inventoryKey, {
          id: inventoryKey,
          entity: spec.entity,
          inventoryId: row.id,
          categoryKey: source.key,
          categoryLabel: source.label,
          categories: [{ key: source.key, label: source.label }],
          name,
          subtype,
          supplier: inventorySupplier(spec.entity, row),
          pricingMode,
          unit,
          unitCost,
          row,
          pricingSnapshot: pricingSnapshot(row),
          searchText: [source.label, name, subtype, inventorySupplier(spec.entity, row), pricingMode, row.manufacturer, row.product_series, row.size, row.color, row.color_name].filter(Boolean).join(" ").toLowerCase(),
        });
      }
    }
  }
  return [...itemByInventoryKey.values()].sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));
}

export function typeDetails(entity, row = {}, overrides = {}) {
  return (TYPE_DETAIL_FIELDS[entity] || [])
    .map(([field, label]) => {
      const overridden = Object.prototype.hasOwnProperty.call(overrides || {}, field);
      return { field, label, value: overridden ? overrides[field] : row[field], overridden };
    })
    .filter((detail) => detail.value !== undefined && detail.value !== null && detail.value !== "" && !(Array.isArray(detail.value) && detail.value.length === 0));
}

export function typeEditFields(entity, row = {}, overrides = {}) {
  return (TYPE_DETAIL_FIELDS[entity] || []).map(([field, label]) => {
    const overridden = Object.prototype.hasOwnProperty.call(overrides || {}, field);
    const inherited = row?.[field];
    const value = overridden ? overrides[field] : (inherited ?? "");
    const kind = Array.isArray(inherited) || Array.isArray(value)
      ? "list"
      : typeof inherited === "boolean" || typeof value === "boolean"
        ? "boolean"
        : NUMERIC_DETAIL_FIELDS.has(field) || typeof inherited === "number"
          ? "number"
          : "text";
    return { field, label, value, inherited, overridden, kind };
  });
}
