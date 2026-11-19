// testtree/src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var inventoryFiniteNumber = (value) => strictNumber(value);
var inventoryNonnegativeNumber = (value) => {
  const number = strictNumber(value);
  return number !== null && number >= 0 ? number : null;
};
var inventoryPositiveNumber = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number > 0 ? number : null;
};
var inventoryNonnegativeMeasurement = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number >= 0 ? number : null;
};
var inventoryIsPositiveWhole = (value) => {
  const number = inventoryFiniteNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var inventorySettingNumber = (value, fallback) => inventoryNonnegativeNumber(inventorySettingValue(value, fallback));
var inventoryPositiveSettingNumber = (value, fallback) => inventoryPositiveNumber(inventorySettingValue(value, fallback));
var inventoryNumberInput = (value) => String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
var inventoryDraftInput = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;
var FOUNDATION_MATERIAL_TYPE_ALIASES = {
  forming: "forming_material"
};
var FOUNDATION_FIELD_ALIASES = [
  ["wall_unit_length_inches", "brick_length_inches"],
  ["wall_unit_width_inches", "brick_width_inches"],
  ["wall_unit_height_inches", "brick_height_inches"]
];
var WALL_MATERIAL_SUBTYPES = ["brick", "cinderblock", "stone", "concrete"];
var WALL_MATERIAL_UNIT_MASONRY_SUBTYPES = ["brick", "cinderblock", "stone"];
var FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES = {
  brick: "brick",
  clay_brick: "brick",
  face_brick: "brick",
  veneer_brick: "brick",
  cinderblock: "cinderblock",
  cinder_block: "cinderblock",
  cmu: "cinderblock",
  concrete_block: "cinderblock",
  cement_block: "cinderblock",
  concrete_masonry_unit: "cinderblock",
  masonry_block: "cinderblock",
  block: "cinderblock",
  stone: "stone",
  natural_stone: "stone",
  cut_stone: "stone",
  stone_veneer: "stone",
  veneer_stone: "stone",
  limestone: "stone",
  sandstone: "stone",
  concrete: "concrete",
  poured_concrete: "concrete",
  poured: "concrete",
  poured_in_place: "concrete",
  cast_in_place: "concrete",
  cast_in_place_concrete: "concrete",
  monolithic_concrete: "concrete"
};
var wallMaterialSubtypeKey = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/[\s\-_]+/g, "_") : null;
var wallMaterialSubtypeRecorded = (value) => value !== void 0 && value !== null && (typeof value !== "string" || value.trim() !== "");
var canonicalWallMaterialSubtype = (value) => {
  if (!wallMaterialSubtypeRecorded(value)) return null;
  const key = wallMaterialSubtypeKey(value);
  return key ? FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES[key] ?? null : null;
};
var INCHES_PER_FOOT = 12;
function normalizeFoundationInventoryRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = { ...row };
  const canonicalType = FOUNDATION_MATERIAL_TYPE_ALIASES[out.material_type];
  if (canonicalType) out.material_type = canonicalType;
  for (const [canonical, legacy] of FOUNDATION_FIELD_ALIASES) {
    if (out[canonical] === void 0 && out[legacy] !== void 0) {
      out[canonical] = out[legacy];
    }
  }
  if (out.pole_stock_length_ft === void 0 && out.pole_stock_length_inches !== void 0) {
    const stockLengthInches = inventoryPositiveNumber(out.pole_stock_length_inches);
    if (stockLengthInches !== null) out.pole_stock_length_ft = stockLengthInches / INCHES_PER_FOOT;
  }
  const canonicalSubtype = canonicalWallMaterialSubtype(out.wall_material_subtype);
  if (canonicalSubtype !== null) out.wall_material_subtype = canonicalSubtype;
  return out;
}
var normalizeFoundationInventoryRows = (rows) => Array.isArray(rows) ? rows.map(normalizeFoundationInventoryRow) : rows;
var normalizeConcreteSupplier = (row) => ({
  id: row.id,
  material_name: row.service_name,
  material_description: row.description || "",
  material_type: "concrete_service",
  supplier: row.vendor_name || row.service_name,
  cost_per_unit: row.default_rate || 0,
  unit: "cy",
  minimum_order_yards: row.minimum_order_yards || 0,
  below_minimum_cost_per_cy: row.below_minimum_cost_per_cy || 0,
  minimum_cost: row.minimum_charge || 0,
  mix_3500_price: row.mix_3500_price ?? null,
  mix_4000_price: row.mix_4000_price ?? null,
  mix_4500_price: row.mix_4500_price ?? null,
  mix_5000_price: row.mix_5000_price ?? null,
  mix_fast_set_price: row.mix_fast_set_price ?? null,
  admix_calcium_chloride_price: row.admix_calcium_chloride_price ?? null,
  admix_set_retarding_price: row.admix_set_retarding_price ?? null,
  admix_water_reducing_price: row.admix_water_reducing_price ?? null,
  admix_fibers_price: row.admix_fibers_price ?? null,
  admix_winter_service_price: row.admix_winter_service_price ?? null,
  small_load_fee_1_1_75: row.small_load_fee_1_1_75 ?? null,
  small_load_fee_2_2_75: row.small_load_fee_2_2_75 ?? null,
  small_load_fee_3_3_75: row.small_load_fee_3_3_75 ?? null,
  small_load_fee_4_4_25: row.small_load_fee_4_4_25 ?? null,
  small_load_fee_4_5_4_75: row.small_load_fee_4_5_4_75 ?? null,
  fuel_surcharge: row.fuel_surcharge ?? null,
  show_in_foundation: row.show_in_foundation !== false,
  _source: "labor_services"
});
export {
  FOUNDATION_FIELD_ALIASES,
  FOUNDATION_MATERIAL_TYPE_ALIASES,
  FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES,
  WALL_MATERIAL_SUBTYPES,
  WALL_MATERIAL_UNIT_MASONRY_SUBTYPES,
  canonicalWallMaterialSubtype,
  inventoryDraftInput,
  inventoryFiniteNumber,
  inventoryIsPositiveWhole,
  inventoryNonnegativeMeasurement,
  inventoryNonnegativeNumber,
  inventoryNumberInput,
  inventoryPositiveNumber,
  inventoryPositiveSettingNumber,
  inventorySettingNumber,
  inventorySettingValue,
  normalizeConcreteSupplier,
  normalizeFoundationInventoryRow,
  normalizeFoundationInventoryRows,
  wallMaterialSubtypeRecorded
};
