// ../../src/components/estimator/foundation/foundationReinforcementPartDescriptors.js
var INVALID = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
var fail = (message) => {
  const error = new Error(message);
  error.code = INVALID;
  throw error;
};
var plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var finite = (v) => typeof v === "number" && Number.isFinite(v);
var nonnegative = (v) => finite(v) && v >= 0;
var positive = (v) => finite(v) && v > 0;
var nonemptyStr = (v) => typeof v === "string" && v.trim().length > 0;
var safeInt = (v) => Number.isSafeInteger(v);
var clone = (v) => structuredClone(v);
function foundationReinforcementPartDescriptors({ item, itemIndex } = {}) {
  if (!plain(item)) fail("item must be a plain record.");
  if (!safeInt(itemIndex) || itemIndex < 0) fail("itemIndex must be a non-negative safe integer.");
  if (item.reinforcement_calculation_version !== 2) fail("reinforcement_calculation_version must be 2.");
  const include = item.include_rebar;
  if (include === false || include === null || include === void 0) return [];
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
  const numerics = {
    rebar_feet: nonnegative,
    rebar_rate: nonnegative,
    rebar_material_cost: nonnegative,
    rebar_labor_cost: nonnegative,
    rebar_labor_hours: nonnegative,
    rebar_cost: nonnegative,
    rebar_geometry_feet: positive,
    rebar_geometry_weight_lbs: positive,
    rebar_connection_count: (v) => safeInt(v) && v >= 0
  };
  for (const [field, check] of Object.entries(numerics)) {
    if (!check(item[field])) fail(`${field} must be a finite numeric in range.`);
  }
  const A = snapshot.amounts;
  const mapping = {
    rebar_feet: "priced_feet",
    rebar_geometry_feet: "geometry_feet",
    rebar_weight_lbs: "priced_weight_lbs",
    rebar_geometry_weight_lbs: "geometry_weight_lbs",
    rebar_material_cost: "material_cost",
    rebar_labor_cost: "labor_cost",
    rebar_labor_hours: "labor_hours",
    rebar_connection_count: "connection_count",
    rebar_cost: "steel_cost"
  };
  if (!nonnegative(item.rebar_weight_lbs)) fail("rebar_weight_lbs must be finite numeric non-negative.");
  for (const [itemField, snapField] of Object.entries(mapping)) {
    if (!nonnegative(A[snapField]) || item[itemField] !== A[snapField]) fail(`${itemField} must strictly equal snapshot.amounts.${snapField}.`);
  }
  const M = snapshot.material;
  const B = snapshot.basis;
  if (!nonnegative(B.labor_rate_per_hour)) fail("labor_rate_per_hour must be finite numeric >= 0.");
  if (A.material_cost + A.labor_cost !== A.steel_cost) fail("amounts must sum to steel_cost.");
  const productMatches = (a, b, expected) => {
    const value = a * b;
    return Number.isFinite(value) && !(a > 0 && b > 0 && value === 0) && value === expected;
  };
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
    if (M.inventory_id !== null && M.inventory_id !== void 0 && M.inventory_id !== "") fail("manual material must not carry an inventory id.");
  } else {
    fail("reinforcement_material.kind must be catalog or manual.");
  }
  const S = snapshot.supports;
  const supportFields = [
    "support_count",
    "support_purchased_units",
    "support_packs",
    "support_material_cost",
    "support_labor_cost",
    "support_labor_hours",
    "support_cost"
  ];
  const supportDataPresent = supportFields.some((f) => item[f] !== void 0 && item[f] !== null);
  let supportParts = [];
  if (S != null || supportDataPresent) {
    if (!plain(S) || !plain(S.amounts) || S.status !== "resolved") {
      fail("reinforcement_cost_snapshot.supports must be a resolved support resolution when support data is present.");
    }
    const SA = S.amounts;
    for (const f of supportFields) {
      if (!nonnegative(item[f])) fail(`${f} must be a finite numeric >= 0.`);
    }
    const supportMapping = {
      support_count: "support_count",
      support_purchased_units: "support_purchased_units",
      support_packs: "support_packs",
      support_material_cost: "support_material_cost",
      support_labor_cost: "support_labor_cost",
      support_labor_hours: "support_labor_hours",
      support_cost: "support_cost"
    };
    for (const [itemField, snapField] of Object.entries(supportMapping)) {
      if (!nonnegative(SA[snapField]) || item[itemField] !== SA[snapField]) {
        fail(`${itemField} must strictly equal snapshot.supports.amounts.${snapField}.`);
      }
    }
    if (SA.support_material_cost + SA.support_labor_cost !== SA.support_cost) {
      fail("support amounts must sum to support_cost.");
    }
    if (SA.support_count > 0) {
      const selections = Array.isArray(S.selections) ? S.selections : fail("resolved supports require selections.");
      if (!productMatches(SA.support_labor_hours, B.labor_rate_per_hour, SA.support_labor_cost)) {
        fail("support labor hours*rate must equal support_labor_cost.");
      }
      let purchasedSum = 0, packsSum = 0, materialSum = 0;
      for (const sel of selections) {
        if (!plain(sel) || !nonemptyStr(sel.name) || !safeInt(sel.units_purchased) || sel.units_purchased <= 0 || !safeInt(sel.units_required) || sel.units_required <= 0 || sel.units_purchased < sel.units_required || !safeInt(sel.pack_size) || sel.pack_size <= 0 || !safeInt(sel.packs) || sel.packs <= 0 || sel.packs * sel.pack_size !== sel.units_purchased || !nonnegative(sel.material_cost) || !nonnegative(sel.unit_cost)) {
          fail("each support selection needs a named pick with consistent pack/unit/cost math.");
        }
        if (!productMatches(sel.units_purchased, sel.unit_cost, sel.material_cost)) {
          fail("support selection units*unit_cost must equal material_cost.");
        }
        purchasedSum += sel.units_purchased;
        packsSum += sel.packs;
        materialSum += sel.material_cost;
      }
      if (purchasedSum !== SA.support_purchased_units || packsSum !== SA.support_packs || materialSum !== SA.support_material_cost) {
        fail("support selections must reconcile to support amounts.");
      }
    } else if (SA.support_purchased_units || SA.support_packs || SA.support_cost) {
      fail("zero required supports cannot carry purchased units or cost.");
    }
  }
  const CS = snapshot.cut_schedule;
  let matParts = null;
  if (CS != null) {
    if (!plain(CS) || !Array.isArray(CS.cut_lines)) fail("cut_schedule requires cut_lines.");
    const closeN = (a, b) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
    const buckets = /* @__PURE__ */ new Map();
    for (const line of CS.cut_lines) {
      if (!plain(line) || !positive(line.cut_length_inches) || !safeInt(line.quantity_total) || line.quantity_total <= 0) {
        fail("each cut_schedule line needs a positive quantity_total and cut_length_inches.");
      }
      const isMat = nonemptyStr(line.mat_id);
      if (!isMat && !nonemptyStr(line.role)) fail("a non-mat cut_schedule line requires a role.");
      const key = isMat ? `mat:${line.mat_id}` : `role:${line.role}`;
      const bucket = buckets.get(key) ?? { kind: isMat ? "mat" : "role", id: isMat ? line.mat_id : line.role, feet: 0 };
      bucket.feet += line.cut_length_inches * line.quantity_total / 12;
      buckets.set(key, bucket);
    }
    matParts = [...buckets.values()];
    const feetSum = matParts.reduce((sum, m) => sum + m.feet, 0);
    if (!closeN(feetSum, A.geometry_feet)) fail("cut_schedule feet must reconcile to snapshot.amounts.geometry_feet.");
  }
  const weightPerFt = nonnegative(B.weight_lb_per_ft) && B.weight_lb_per_ft > 0 ? B.weight_lb_per_ft : null;
  const matPartsSnap = () => matParts == null ? [] : matParts.map((m) => ({
    ...clone(m),
    weight_lbs: weightPerFt == null ? null : m.feet * weightPerFt
  }));
  const builder = () => {
    const active = { ...item };
    delete active.reinforcement_proposal;
    return structuredClone(active);
  };
  const basisSnap = () => ({
    pricing_mode: "foundation_reinforcement_v2",
    reinforcement: {
      version: 1,
      calculation_version: 2,
      component_id: item.component_id,
      // O-011 (CMP-A11) -- accepted-design v2 part model: the part's
      // `accepted_design_version` records the accepted design's version so a
      // v2 part model's consumer reads the version, never a fabricated v1.
      accepted_design_version: 2,
      physical_quantity_ft: item.rebar_geometry_feet,
      priced_quantity_ft: item.rebar_feet,
      geometry_weight_lbs: item.rebar_geometry_weight_lbs,
      priced_weight_lbs: item.rebar_weight_lbs,
      connection_count: item.rebar_connection_count,
      engineering_approved: false,
      procurement_ready: false,
      material: clone(M),
      amounts: clone(A),
      supports: clone(S ?? null),
      mat_parts: matPartsSnap()
    }
  });
  const name = nonemptyStr(M.name) ? M.name : "Reinforcing steel";
  const i = itemIndex;
  if (S != null && S.amounts.support_count > 0) {
    supportParts = S.selections.map((sel, s) => ({
      part_key: `foundation:item:${i}:support:${s}`,
      part_type: "material",
      part_subtype: "rebar_support",
      part_name: sel.name,
      source_path: `items[${i}].reinforcement_cost_snapshot.supports.selections[${s}]`,
      inventory_entity: nonemptyStr(sel.inventory_id) ? "FoundationInventory" : "",
      inventory_item_id: nonemptyStr(sel.inventory_id) ? sel.inventory_id : "",
      quantity: sel.units_purchased,
      unit: "ea",
      unit_cost: sel.unit_cost,
      extended_cost: sel.material_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    }));
    supportParts.push({
      part_key: `foundation:item:${i}:support-labor`,
      part_type: "labor",
      part_subtype: "rebar_support_labor",
      part_name: "Support install labor",
      source_path: `items[${i}].reinforcement_cost_snapshot.supports`,
      inventory_entity: "",
      inventory_item_id: "",
      quantity: item.support_labor_hours,
      unit: "hr",
      unit_cost: B.labor_rate_per_hour,
      extended_cost: item.support_labor_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    });
  }
  const rebarPartBase = {
    part_type: "material",
    part_subtype: "rebar",
    inventory_entity: material.kind === "catalog" ? "FoundationInventory" : "",
    inventory_item_id: material.kind === "catalog" ? M.inventory_id : "",
    unit: "ft",
    unit_cost: item.rebar_rate
  };
  const steelParts = matParts != null && A.priced_feet === A.geometry_feet ? matParts.map((m, idx) => {
    const last = idx === matParts.length - 1;
    const feet = last ? A.geometry_feet - matParts.slice(0, -1).reduce((s, p) => s + p.feet, 0) : m.feet;
    const extended = last ? A.material_cost - matParts.slice(0, -1).reduce((s, p) => s + p.feet * item.rebar_rate, 0) : m.feet * item.rebar_rate;
    return {
      ...rebarPartBase,
      part_key: `foundation:item:${i}:rebar:${m.kind}:${m.id}`,
      part_name: m.kind === "mat" ? `${name} \u2014 mat ${m.id}` : `${name} \u2014 ${m.role}`,
      source_path: `items[${i}].reinforcement_cost_snapshot.cut_schedule`,
      quantity: feet,
      extended_cost: extended,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    };
  }) : [{
    ...rebarPartBase,
    part_key: `foundation:item:${i}:rebar`,
    part_name: name,
    source_path: `items[${i}].reinforcement_material.inventory_id`,
    quantity: item.rebar_feet,
    extended_cost: item.rebar_material_cost,
    builder_data: builder(),
    calculation_snapshot: clone(snapshot),
    pricing_basis_snapshot: basisSnap()
  }];
  return [
    ...steelParts,
    {
      part_key: `foundation:item:${i}:rebar-labor`,
      part_type: "labor",
      part_subtype: "rebar_labor",
      part_name: "Reinforcement labor",
      source_path: `items[${i}].reinforcement_design`,
      inventory_entity: "",
      inventory_item_id: "",
      quantity: item.rebar_labor_hours,
      unit: "hr",
      unit_cost: B.labor_rate_per_hour,
      extended_cost: item.rebar_labor_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    },
    ...supportParts
  ];
}
export {
  foundationReinforcementPartDescriptors
};
