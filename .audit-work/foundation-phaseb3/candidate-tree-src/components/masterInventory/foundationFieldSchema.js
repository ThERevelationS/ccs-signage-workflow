// Which FoundationInventory fields to show for each material type.
export const MATERIAL_TYPES = [
  { value: "concrete_service", label: "Ready-Mix Concrete" },
  { value: "bagged_concrete", label: "Bagged Concrete" },
  { value: "rebar", label: "Rebar" },
  // O-021 / CMP-B07: rebar supports (chairs / stands / bolsters) sit next to
  // rebar in every type picker — same reinforcement family, own catalog type.
  { value: "rebar_support", label: "Rebar Support" },
  { value: "forming_material", label: "Forming Material" },
  { value: "excavation_equipment", label: "Excavation Equipment" },
  { value: "pole", label: "Pole" },
  { value: "brick_stone", label: "Brick / Stone" },
  { value: "wall_material", label: "Wall Material" },
  { value: "wall_cap", label: "Wall Cap" },
  { value: "fill_material", label: "Fill Material" },
];

const COMMON = [
  { key: "material_name", label: "Name", type: "text" },
  { key: "material_description", label: "Description", type: "text" },
  // CMP-A08 tail: `supplier` is the authored field behind the explicit supply
  // grouping in the catalog UX — rows section by inventorySupplierKey(supplier)
  // (trim + lowercase + separator-collapse), so keep spellings consistent;
  // a blank supplier leaves the row ungrouped ("No supplier recorded").
  { key: "supplier", label: "Supplier (groups rows)", type: "text" },
  { key: "unit", label: "Unit", type: "text" },
  { key: "cost_per_unit", label: "Cost per unit", type: "number" },
];

const BY_TYPE = {
  concrete_service: [
    { key: "minimum_order_yards", label: "Min order (CY)", type: "number" },
    { key: "below_minimum_cost_per_cy", label: "Below-min $/CY", type: "number" },
    { key: "fuel_surcharge", label: "Fuel surcharge", type: "number" },
  ],
  bagged_concrete: [{ key: "minimum_cost", label: "Minimum cost", type: "number" }],
  rebar: [{ key: "rebar_size", label: "Rebar size (e.g. #4)", type: "text" }],
  // O-021 / CMP-B07: the ten rebar_support_* catalog fields plus the COMMON
  // name/description/supplier/unit/cost_per_unit row. Field descriptor types:
  //   • "select" — renders a native <select> with the given options plus a
  //     blank option that clears the field to null (untyped, never guessed);
  //     a stored value outside the options list is shown verbatim.
  //   • "list"   — a comma-separated text draft parsed into a string array on
  //     save via listFieldValue (blank clears to [] = "unknown, not
  //     universal"; a stored non-string/non-array value passes through
  //     verbatim so validation can report it).
  rebar_support: [
    {
      key: "rebar_support_kind", label: "Kind", type: "select", options: [
        { value: "chair", label: "Chair" },
        { value: "stand", label: "Stand" },
        { value: "bolster", label: "Bolster" },
      ],
    },
    { key: "rebar_support_height_inches", label: "Height (in)", type: "number" },
    { key: "rebar_support_height_min_inches", label: "Height min (in, adjustable)", type: "number" },
    { key: "rebar_support_height_max_inches", label: "Height max (in, adjustable)", type: "number" },
    { key: "rebar_support_footprint_length_inches", label: "Footprint length (in)", type: "number" },
    { key: "rebar_support_footprint_width_inches", label: "Footprint width (in)", type: "number" },
    { key: "rebar_support_material", label: "Material (steel / plastic / concrete)", type: "text" },
    { key: "rebar_support_pack_size", label: "Pack size (units per pack)", type: "number" },
    { key: "rebar_support_compatible_bar_sizes", label: "Compatible bar sizes (comma-separated, e.g. #3, #4)", type: "list" },
    { key: "rebar_support_placement_notes", label: "Placement notes / constraints", type: "text" },
  ],
  forming_material: [
    { key: "lumber_size", label: "Lumber size", type: "text" },
    { key: "thickness_inches", label: "Thickness (in)", type: "number" },
  ],
  excavation_equipment: [
    { key: "cost_per_day", label: "$/day", type: "number" },
    { key: "cost_per_week", label: "$/week", type: "number" },
    { key: "cost_per_month", label: "$/month", type: "number" },
    { key: "pickup_delivery_cost", label: "Delivery cost", type: "number" },
    { key: "rental_company", label: "Rental company", type: "text" },
  ],
  pole: [
    { key: "pole_shape", label: "Shape (square/round)", type: "text" },
    { key: "pole_width_inches", label: "Width (in)", type: "number" },
    { key: "pole_wall_thickness_inches", label: "Wall thickness (in)", type: "number" },
    { key: "pole_stock_length_ft", label: "Stock length (ft)", type: "number" },
    { key: "pole_stock_price", label: "Stock price", type: "number" },
    { key: "pole_pricing_mode", label: "Pricing (per_foot / stock_price)", type: "text" },
    { key: "paint_rate_per_linear_ft", label: "Paint $/linear ft", type: "number" },
  ],
  brick_stone: [
    { key: "brick_length_inches", label: "Length (in)", type: "number" },
    { key: "brick_width_inches", label: "Width (in)", type: "number" },
    { key: "brick_height_inches", label: "Height (in)", type: "number" },
    { key: "brick_color", label: "Color", type: "text" },
  ],
  wall_material: [
    // CMP-D03: subtype picks the quantity method — brick/cinderblock/stone are
    // unit masonry (priced per unit from the unit dims below); "concrete" is
    // poured, priced per cubic yard on wall thickness alone.
    { key: "wall_material_subtype", label: "Subtype (brick / cinderblock / stone / concrete)", type: "text" },
    { key: "wall_unit_length_inches", label: "Unit length (in)", type: "number" },
    { key: "wall_unit_width_inches", label: "Unit width (in) — wall thickness for poured concrete", type: "number" },
    { key: "wall_unit_height_inches", label: "Unit height (in)", type: "number" },
    { key: "wall_color", label: "Color", type: "text" },
  ],
  wall_cap: [
    { key: "cap_stock_length_inches", label: "Stock length (in)", type: "number" },
    { key: "cap_width_inches", label: "Width (in)", type: "number" },
    { key: "cap_height_inches", label: "Height (in)", type: "number" },
    { key: "cap_stock_price", label: "Stock price", type: "number" },
    { key: "cap_profile", label: "Profile", type: "text" },
  ],
  fill_material: [{ key: "fill_material_subtype", label: "Subtype", type: "text" }],
};

export const fieldsFor = (type) => [...COMMON, ...(BY_TYPE[type] || [])];

export const typeLabel = (type) => MATERIAL_TYPES.find((t) => t.value === type)?.label || type;

// ─── "list" field drafts (O-021 / CMP-B07) ─────────────────────────────────
// Display draft for a `list` field: a stored string array joins into a
// comma-separated draft; anything else renders verbatim (absent -> "").
export const listFieldDraft = (value) => (Array.isArray(value) ? value.join(", ") : (value ?? ""));

// Save-side parse for a `list` field: a string draft tokenizes on commas
// (blank clears to [] — "compatibility unknown", never universal); arrays
// pass through untouched; a stored non-string/non-array value stays VERBATIM
// so availability validation reports it instead of laundering it into a list.
export const listFieldValue = (value) => (typeof value === "string"
  ? value.split(",").map((token) => token.trim()).filter(Boolean)
  : value);