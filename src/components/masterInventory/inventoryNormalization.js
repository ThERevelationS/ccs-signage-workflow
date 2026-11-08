// ─── THE inventory normalization boundary (CMP-A08 / O-008) ────────────────
//
// Every inventory-row value normalization in the app converges on this one
// module. Before it existed the same strict-number parsers and draft-input
// coercions were copy-pasted across ~20 sites (six identical "price number"
// functions alone), field-name adaptation lived only in the concrete-supplier
// adapter, and three write surfaces used three different numeric coercions
// (catalogNumberInput verbatim / parseFloat partial-parse / parseFloat||0
// zero-laundering). Consumers below now delegate here instead of owning a copy.
//
// Contract (unchanged from the landed hardening — this module declares it once):
//   • Catalog price basis      — finite, nonnegative. An explicit 0 is a
//                                legitimate free price/rate. Blank, malformed,
//                                negative or non-finite values are UNAVAILABLE
//                                (null), never laundered to 0 or a guess.
//   • Dimension/duration basis — finite, positive. 0 is not a legitimate
//                                length/duration/qty-multiplier.
//   • Measurement basis        — finite, nonnegative (depth-in-ground may be 0).
//   • Finite basis             — finite, any sign (signed reads validated
//                                downstream, e.g. wall-cap price/length or
//                                item override checks that report negatives).
//   • Settings pick            — explicit-0-respecting: a recorded 0 wins, a
//                                missing/blank/falsy setting keeps the ported
//                                module default, then the basis check applies.
//   • Write-side draft input   — blank clears to null ("not cataloged"), a
//                                numeric draft coerces to Number, anything else
//                                stays VERBATIM so availability validation
//                                reports it instead of persisting a laundered
//                                number.
//
// Authored entity rows are never mutated: field-name/unit canonicalization
// returns a calculation copy with canonical fields filled in alongside the
// authored ones (see normalizeFoundationInventoryRow).

// ── Scalar numeric kernels ──────────────────────────────────────────────────

// Strict numeric-string shapes. The catalog/price basis intentionally rejects
// exponent and partial parses ("12abc", "1e3") — a stored catalog string must
// be a plain decimal. The measurement/dimension basis additionally accepts
// exponent notation (matching every prior dimension parser verbatim).
const STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

const strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string"
    || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Finite number, any sign. (Formerly inputNumber / wallCapInputNumber.)
export const inventoryFiniteNumber = (value) => strictNumber(value);

// Catalog/customer price basis: finite, nonnegative — an explicit 0 is a
// legitimate free price. (Formerly supplierPriceNumber / equipmentPriceNumber /
// cabinetPriceNumber / wallPriceNumber / polePriceNumber / landscapePriceNumber.)
export const inventoryNonnegativeNumber = (value) => {
  const number = strictNumber(value);
  return number !== null && number >= 0 ? number : null;
};

// Dimension / duration / quantity-multiplier basis: finite, positive.
// (Formerly poleDimensionNumber / wallDimensionNumber /
// equipmentPositiveNumber / cabinetQuantityNumber / landscapeCellSizeNumber.)
export const inventoryPositiveNumber = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number > 0 ? number : null;
};

// Measurement basis: finite, nonnegative with exponent notation — a depth in
// ground or offset may legitimately be 0. (Formerly poleOffsetNumber.)
export const inventoryNonnegativeMeasurement = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number >= 0 ? number : null;
};

// Positive whole-number predicate (quantity-style fields). A number-typed
// input only needs to be a safe positive integer; a string must also be
// written as a whole number ("4" or "4.0", never "4.5"/"4e0"/"+4").
// (Formerly foundationInputValidation's positiveWholeNumber.)
export const inventoryIsPositiveWhole = (value) => {
  const number = inventoryFiniteNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};

// ── Settings basis ──────────────────────────────────────────────────────────

// Explicit-0-respecting setting pick (the ported `value === 0 ? 0 : value ||
// fallback` semantics): a recorded 0 is legitimate; absent/blank/falsy keeps
// the module default. (Formerly wallSettingValue / poleSettingValue, and the
// inline pick inside foundationSettingNumber / calcItemCost's getSetting.)
export const inventorySettingValue = (value, fallback) => (value === 0 ? 0 : value || fallback);

// A recorded setting used as a cost/rate must parse on the price basis.
// (Formerly wallSettingNumber / poleSettingNumber / foundationSettingNumber.)
export const inventorySettingNumber = (value, fallback) =>
  inventoryNonnegativeNumber(inventorySettingValue(value, fallback));

// A recorded setting the ported math divides by (production rates, multipliers
// in a divisor) must be positive — an explicit 0 there is not legitimate.
// (Formerly wallPositiveSettingNumber / polePositiveSettingNumber.)
export const inventoryPositiveSettingNumber = (value, fallback) =>
  inventoryPositiveNumber(inventorySettingValue(value, fallback));

// ── Write-side draft inputs ─────────────────────────────────────────────────

// Numeric catalog-field draft: a blank draft clears the field to null ("not
// cataloged" — never a silent free price), a numeric draft coerces to Number,
// anything else stays verbatim so availability validation reports it instead
// of a NaN or minted 0 leaking into recorded catalog prices.
// (Formerly catalogNumberInput ×4 + FoundationItemCard's nullSet.)
export const inventoryNumberInput = (value) => (String(value).trim() === "" ? null
  : Number.isFinite(Number(value)) ? Number(value) : value);

// Blank-preserving variant for project-entry drafts (wall heights, pole
// offsets, rental durations): a blank draft stays "" so the field keeps its
// authored empty state, numeric coerces, malformed stays verbatim.
// (Formerly equipmentInputValue / heightInput ×2.)
export const inventoryDraftInput = (value) => (value === "" ? ""
  : Number.isFinite(Number(value)) ? Number(value) : value);

// ── Field-name / unit canonicalization ──────────────────────────────────────

// Legacy material_type values that map onto a canonical type the calculators
// price. (FoundationEstimator's catalog filter already listed both spellings;
// the catalog-type check only accepted the canonical one.)
export const FOUNDATION_MATERIAL_TYPE_ALIASES = {
  forming: "forming_material",
};

// Legacy `brick_stone` rows carry brick_length_inches/brick_width_inches/
// brick_height_inches; canonical `wall_material` rows carry wall_unit_*.
// The calculators only read wall_unit_*, so a brick_stone row was always held
// "wall_unit_*_unavailable". Canonicalizing here makes legacy rows priceable —
// the authored fields stay on the row alongside the filled canonical ones.
export const FOUNDATION_FIELD_ALIASES = [
  ["wall_unit_length_inches", "brick_length_inches"],
  ["wall_unit_width_inches", "brick_width_inches"],
  ["wall_unit_height_inches", "brick_height_inches"],
];

// Unit canonicalization — inches→feet: the schema's canonical pole stock
// length is feet-denominated (`pole_stock_length_ft`, see foundationFieldSchema
// and the ported calculator's reads). A legacy row authored under an
// explicitly inch-denominated name (`pole_stock_length_inches`) is converted
// into the canonical feet field. Materialized only when the inch value parses
// positive and the canonical field is absent — a malformed/absent inch value
// stays absent so the pricing check on the canonical field reports it, never
// silently repriced.
const INCHES_PER_FOOT = 12;

// Canonicalize one inventory row onto a calculation copy: fills canonical
// field names from their known legacy aliases (only when the canonical field
// is absent — an explicit authored value, even null, always wins), maps legacy
// material types onto canonical ones, and converts legacy inch-denominated
// pole stock lengths into the canonical feet field. Authored fields are
// preserved verbatim; numeric validation stays with the consumption checks.
export function normalizeFoundationInventoryRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = { ...row };
  const canonicalType = FOUNDATION_MATERIAL_TYPE_ALIASES[out.material_type];
  if (canonicalType) out.material_type = canonicalType;
  for (const [canonical, legacy] of FOUNDATION_FIELD_ALIASES) {
    if (out[canonical] === undefined && out[legacy] !== undefined) {
      out[canonical] = out[legacy];
    }
  }
  if (out.pole_stock_length_ft === undefined && out.pole_stock_length_inches !== undefined) {
    const stockLengthInches = inventoryPositiveNumber(out.pole_stock_length_inches);
    if (stockLengthInches !== null) out.pole_stock_length_ft = stockLengthInches / INCHES_PER_FOOT;
  }
  return out;
}

// Boundary entry point: every inventory array handed to the foundation
// calculators passes through here (see calcProject's ingress).
export const normalizeFoundationInventoryRows = (rows) =>
  (Array.isArray(rows) ? rows.map(normalizeFoundationInventoryRow) : rows);

// ── Cross-entity source adaptation ──────────────────────────────────────────

// Normalize a LaborServiceInventory concrete supplier into the
// FoundationInventory shape the ported ready-mix math expects. Supplier-
// catalog price fields keep null for "not authored" — a missing catalog price
// is unavailable, never a fabricated free price. (Moved verbatim from
// legacyFoundationCalc; re-exported there for existing import paths.)
export const normalizeConcreteSupplier = (row) => ({
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
  _source: "labor_services",
});
