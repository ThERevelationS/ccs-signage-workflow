// Which FoundationInventory fields to show for each material type.
export const MATERIAL_TYPES = [
  { value: "concrete_service", label: "Ready-Mix Concrete" },
  { value: "bagged_concrete", label: "Bagged Concrete" },
  { value: "rebar", label: "Rebar" },
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
  { key: "supplier", label: "Supplier", type: "text" },
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
    { key: "wall_unit_length_inches", label: "Unit length (in)", type: "number" },
    { key: "wall_unit_width_inches", label: "Unit width (in)", type: "number" },
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