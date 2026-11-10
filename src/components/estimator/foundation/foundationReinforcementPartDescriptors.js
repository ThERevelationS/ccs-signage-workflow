// Faithful projection of an ALREADY-fresh validated calculated snapshot into partSync DTOs.
// Caller must supply a currently calculated item + reinforcement_cost_snapshot; this helper
// performs NO geometry/pricing recomputation, authorization, structural, or procurement approval.
const INVALID = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";

const fail = (message) => {
  const error = new Error(message);
  error.code = INVALID;
  throw error;
};

const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const nonnegative = (v) => finite(v) && v >= 0;
const positive = (v) => finite(v) && v > 0;
const nonemptyStr = (v) => typeof v === "string" && v.trim().length > 0;
const safeInt = (v) => Number.isSafeInteger(v);

const clone = (v) => structuredClone(v);

export function foundationReinforcementPartDescriptors({ item, itemIndex } = {}) {
  if (!plain(item)) fail("item must be a plain record.");
  if (!safeInt(itemIndex) || itemIndex < 0) fail("itemIndex must be a non-negative safe integer.");
  if (item.reinforcement_calculation_version !== 2) fail("reinforcement_calculation_version must be 2.");
  const include = item.include_rebar;
  if (include === false || include === null || include === undefined) return [];
  if (typeof include !== "boolean") fail("include_rebar must be a boolean.");
  if (!nonemptyStr(item.component_id)) fail("component_id must be a non-empty string.");

  const design = item.reinforcement_design;
  const material = item.reinforcement_material;
  const snapshot = item.reinforcement_cost_snapshot;
  if (!plain(design) || design.version !== 2) fail("reinforcement_design.version must be 2.");
  if (!plain(material)) fail("reinforcement_material must be a record.");
  if (!plain(snapshot) || snapshot.version !== 1 || snapshot.calculation_version !== 2 || snapshot.engineering_approved !== false) {
    fail("reinforcement_cost_snapshot must be version 1 / calculation_version 2 / unapproved.");
  }
  if (!plain(snapshot.amounts) || !plain(snapshot.material) || !plain(snapshot.basis) || !Array.isArray(snapshot.rate_sources)) {
    fail("reinforcement_cost_snapshot requires amounts/material/basis/rate_sources.");
  }

  // Strict numeric inputs: finite numeric, no coercion. Exact 0 allowed except geometry feet/weights.
  const numerics = {
    rebar_feet: nonnegative, rebar_rate: nonnegative,
    rebar_material_cost: nonnegative, rebar_labor_cost: nonnegative,
    rebar_labor_hours: nonnegative, rebar_cost: nonnegative,
    rebar_geometry_feet: positive, rebar_geometry_weight_lbs: positive,
    rebar_connection_count: (v) => safeInt(v) && v >= 0,
  };
  for (const [field, check] of Object.entries(numerics)) {
    if (!check(item[field])) fail(`${field} must be a finite numeric in range.`);
  }

  const A = snapshot.amounts;
  const mapping = {
    rebar_feet: "priced_feet", rebar_geometry_feet: "geometry_feet",
    rebar_weight_lbs: "priced_weight_lbs", rebar_geometry_weight_lbs: "geometry_weight_lbs",
    rebar_material_cost: "material_cost", rebar_labor_cost: "labor_cost",
    rebar_labor_hours: "labor_hours", rebar_connection_count: "connection_count",
    rebar_cost: "steel_cost",
  };
  if (!nonnegative(item.rebar_weight_lbs)) fail("rebar_weight_lbs must be finite numeric non-negative.");
  for (const [itemField, snapField] of Object.entries(mapping)) {
    if (!nonnegative(A[snapField]) || item[itemField] !== A[snapField]) fail(`${itemField} must strictly equal snapshot.amounts.${snapField}.`);
  }
  const M = snapshot.material;
  const B = snapshot.basis;
  if (!nonnegative(B.labor_rate_per_hour)) fail("labor_rate_per_hour must be finite numeric >= 0.");
  if (A.material_cost + A.labor_cost !== A.steel_cost) fail("amounts must sum to steel_cost.");
  const productMatches = (a, b, expected) => { const value = a * b; return Number.isFinite(value) && !(a > 0 && b > 0 && value === 0) && value === expected; };
  if (!productMatches(item.rebar_feet, item.rebar_rate, A.material_cost)) fail("feet*rate must equal material_cost.");
  if (!productMatches(item.rebar_labor_hours, B.labor_rate_per_hour, A.labor_cost)) fail("hours*labor_rate must equal labor_cost.");
  if (M.pricing_unit !== "ft" || B.unit !== "ft") fail("pricing/basis units must be ft.");
  if (M.cost_per_ft !== item.rebar_rate || B.cost_per_ft !== item.rebar_rate) fail("rate must match snapshot material and basis.");
  if (M.kind !== material.kind) fail("snapshot material kind must match authored kind.");
  if (material.kind === "catalog") {
    if (!nonemptyStr(material.inventory_id)) fail("catalog material requires inventory_id.");
    if (M.inventory_id !== material.inventory_id) fail("catalog inventory_id mismatch. Recalculate and save Foundation with the selected reinforcement material before Builder handoff; frozen prices remain unchanged until Update Price.");
    if (item.rebar_rate === 0) {
      if (item.custom_rebar_cost_per_ft !== 0 || M.rate_source !== "custom_rebar_cost_per_ft") {
        fail("explicit catalog rate 0 requires authored zero override provenance.");
      }
    }
  } else if (material.kind === "manual") {
    if (!nonemptyStr(material.reason) || !nonemptyStr(M.reason) || M.reason.trim() !== material.reason.trim()) fail("manual material reason must match snapshot.");
    if (M.inventory_id !== null && M.inventory_id !== undefined && M.inventory_id !== "") fail("manual material must not carry an inventory id.");
  } else {
    fail("reinforcement_material.kind must be catalog or manual.");
  }

  const builder = () => { const active = { ...item }; delete active.reinforcement_proposal; return structuredClone(active); };
  const basisSnap = () => ({
    pricing_mode: "foundation_reinforcement_v2",
    reinforcement: {
      version: 1, calculation_version: 2, component_id: item.component_id,
      physical_quantity_ft: item.rebar_geometry_feet, priced_quantity_ft: item.rebar_feet,
      geometry_weight_lbs: item.rebar_geometry_weight_lbs, priced_weight_lbs: item.rebar_weight_lbs,
      connection_count: item.rebar_connection_count, engineering_approved: false, procurement_ready: false,
      material: clone(M), amounts: clone(A),
    },
  });
  const name = nonemptyStr(M.name) ? M.name : "Reinforcing steel";
  const i = itemIndex;

  return [
    {
      part_key: `foundation:item:${i}:rebar`, part_type: "material", part_subtype: "rebar",
      part_name: name, source_path: `items[${i}].reinforcement_material.inventory_id`,
      inventory_entity: material.kind === "catalog" ? "FoundationInventory" : "",
      inventory_item_id: material.kind === "catalog" ? M.inventory_id : "",
      quantity: item.rebar_feet, unit: "ft", unit_cost: item.rebar_rate,
      extended_cost: item.rebar_material_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap(),
    },
    {
      part_key: `foundation:item:${i}:rebar-labor`, part_type: "labor", part_subtype: "rebar_labor",
      part_name: "Reinforcement labor", source_path: `items[${i}].reinforcement_design`,
      inventory_entity: "", inventory_item_id: "",
      quantity: item.rebar_labor_hours, unit: "hr", unit_cost: B.labor_rate_per_hour,
      extended_cost: item.rebar_labor_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap(),
    },
    // O-011 Phase-B -- a priced rebar-support line (chairs/dobies/bolsters)
    // mints only when the cost snapshot carries a finite authored
    // `supports_cost`; absent, it stays unresolved rather than a silent zero.
    ...(Number.isFinite(A.supports_cost) ? [{
      part_key: `foundation:item:${i}:rebar-supports`, part_type: "material", part_subtype: "rebar_supports",
      part_name: "Reinforcement supports (chairs/dobies)", source_path: `items[${i}].reinforcement_design.supports`,
      inventory_entity: "", inventory_item_id: "",
      quantity: 1, unit: "lot", unit_cost: A.supports_cost,
      extended_cost: A.supports_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap(),
    }] : []),
  ];
}
