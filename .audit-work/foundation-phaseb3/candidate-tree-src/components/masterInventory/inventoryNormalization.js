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
// Authored entity rows are never mutated: field-name/unit/subtype
// canonicalization returns a calculation copy with canonical fields filled in
// alongside the authored ones (see normalizeFoundationInventoryRow).

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

// Canonical wall-material subtype enum (FoundationInventory
// `wall_material_subtype`, schema-order): brick / cinderblock (CMU) / stone are
// UNIT MASONRY — the quantity method is unit count from cataloged unit
// dimensions. `concrete` is POURED concrete — a different quantity basis
// (placed volume in cubic yards on the wall-face footprint x cataloged
// thickness) with no units, courses, or mortar joints. CMP-D03 / O-046.
export const WALL_MATERIAL_SUBTYPES = ["brick", "cinderblock", "stone", "concrete"];
export const WALL_MATERIAL_UNIT_MASONRY_SUBTYPES = ["brick", "cinderblock", "stone"];

// Recorded spellings that canonicalize onto the enum. Before this map existed
// the only subtype read was the strict `=== 'concrete'` test, so a row authored
// "poured_concrete" or "cmu" silently priced as mortared unit masonry — poured
// concrete billed for bricks and mortar bags (the laundering CMP-D03 removes).
// Keys are normalized: trimmed, lowercased, separators collapsed to "_".
export const FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES = {
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
  monolithic_concrete: "concrete",
};

const wallMaterialSubtypeKey = (value) => (typeof value === "string"
  ? value.trim().toLowerCase().replace(/[\s\-_]+/g, "_") : null);

// Whether a subtype value carries an authored classification at all (absent,
// null, and blank-string all mean "not recorded" — the calculator treats them
// as the legacy unit-masonry default, never as an error).
export const wallMaterialSubtypeRecorded = (value) => value !== undefined
  && value !== null
  && (typeof value !== "string" || value.trim() !== "");

// Classify a recorded wall_material_subtype onto the canonical enum: returns
// the enum value, or null when the value is absent/blank (not recorded) or
// recorded but unrecognized — an unrecognized subtype returns null so the
// consumption check can hold the row instead of silently choosing a quantity
// method for it (never laundered to masonry, never guessed concrete).
export const canonicalWallMaterialSubtype = (value) => {
  if (!wallMaterialSubtypeRecorded(value)) return null;
  const key = wallMaterialSubtypeKey(value);
  return key ? (FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES[key] ?? null) : null;
};

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
  // Wall-material subtype canonicalization (CMP-D03): a recorded subtype the
  // alias table resolves is rewritten to its canonical enum value on the
  // calculation copy ("cmu" → "cinderblock", "poured concrete" → "concrete").
  // Absent/blank stays absent (the calculator's legacy unit-masonry default);
  // recorded-but-unrecognized passes through VERBATIM so the wall check holds
  // the row on its authored value instead of silently picking a method.
  const canonicalSubtype = canonicalWallMaterialSubtype(out.wall_material_subtype);
  if (canonicalSubtype !== null) out.wall_material_subtype = canonicalSubtype;
  // Canonical supplier-group key (CMP-A08 tail): filled on the calculation
  // copy from the authored supplier field so every consumer — catalog-UX
  // grouping now, per-supplier delivery grouping later — reads ONE canonical
  // key. Materialized only when the key is absent and the supplier field
  // resolves; an authored supplier_key wins verbatim, and an unrecorded
  // supplier stays absent (the unassigned group — never minted).
  if (out.supplier_key === undefined) {
    const key = inventorySupplierKey(out.supplier);
    if (key !== null) out.supplier_key = key;
  }
  return out;
}

// Boundary entry point: every inventory array handed to the foundation
// calculators passes through here (see calcProject's ingress).
export const normalizeFoundationInventoryRows = (rows) =>
  (Array.isArray(rows) ? rows.map(normalizeFoundationInventoryRow) : rows);

// ── Supplier grouping (CMP-A08 tail / O-008t) ───────────────────────────────

// Canonical supplier-group key. The catalog stores supplier/vendor names as
// free text, so the same vendor is spelled differently across rows
// ("Citywide", "citywide ", "Citywide Ready-Mix") — grouping on the raw
// string fragments one supplier into several groups. The canonical key is
// trimmed, lowercased, and separator-collapsed so case/spacing/punctuation
// variants group together. An unrecorded or blank supplier keys to null —
// the "unassigned" group — never guessed into another supplier's group.
// Non-string authored values stay ungrouped the same way (never fabricated).
export const inventorySupplierKey = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s\-_.]+/g, "_");
  return key === "" ? null : key;
};

// Group catalog rows by their canonical supplier key for the catalog UX
// (explicit supply grouping — CMP-A08 tail). Returns
// [{ key, label, rows }] ordered alphabetically by key; rows with no recorded
// supplier form the unassigned group (key null) which always sorts LAST so a
// missing supplier is visible, never silently merged into a named vendor.
// `label` keeps the first-seen authored spelling for display. `getSupplier`
// reads the row's authored supplier field — `supplier` on FoundationInventory
// rows (the default), `vendor_name || service_name` on raw
// LaborServiceInventory rows, `rental_company` on equipment rows. Input order
// inside each group is preserved (caller sorting is untouched).
export const groupInventoryBySupplier = (rows, getSupplier) => {
  const read = typeof getSupplier === "function" ? getSupplier : (row) => row?.supplier;
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const authored = read(row);
    const label = typeof authored === "string" && authored.trim() !== "" ? authored.trim() : null;
    const key = inventorySupplierKey(label);
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
};

// ── Cross-entity source adaptation ──────────────────────────────────────────

// Normalize a LaborServiceInventory concrete supplier into the
// FoundationInventory shape the ported ready-mix math expects. Supplier-
// catalog price fields keep null for "not authored" — a missing catalog price
// is unavailable, never a fabricated free price. (Moved verbatim from
// legacyFoundationCalc; re-exported there for existing import paths.)
//
// CMP-A08 tail: cost_per_unit and the delivery-minimum fields now ride the
// same nonnegative price basis as every other catalog price — an explicit 0
// is still a legitimate free rate, but an absent/blank/malformed value keeps
// null ("not cataloged") instead of the ported `|| 0` minted-zero (or a
// verbatim malformed value) leaking into the normalized row. Downstream the
// ported `selectedConcrete?.cost_per_unit || 0` read resolves a null rate to
// the same 0 the minted field produced, so totals are unchanged; the minimum
// fields have no ported consumer at all (schema-declared, partSync reads the
// raw LaborServiceInventory row for its own snapshot).
export const normalizeConcreteSupplier = (row) => ({
  id: row.id,
  material_name: row.service_name,
  material_description: row.description || "",
  material_type: "concrete_service",
  supplier: row.vendor_name || row.service_name,
  // Canonical supplier-group key — the explicit grouping the catalog UX
  // renders and the delivery-side remainder can group on. Null when the row
  // carries no recorded vendor (the unassigned group).
  supplier_key: inventorySupplierKey(row.vendor_name || row.service_name),
  cost_per_unit: inventoryNonnegativeNumber(row.default_rate),
  unit: "cy",
  minimum_order_yards: inventoryNonnegativeNumber(row.minimum_order_yards),
  below_minimum_cost_per_cy: inventoryNonnegativeNumber(row.below_minimum_cost_per_cy),
  minimum_cost: inventoryNonnegativeNumber(row.minimum_charge),
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