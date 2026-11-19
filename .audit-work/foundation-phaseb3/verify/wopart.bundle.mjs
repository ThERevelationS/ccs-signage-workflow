// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementPartDescriptors.js
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
      physical_quantity_ft: item.rebar_geometry_feet,
      priced_quantity_ft: item.rebar_feet,
      geometry_weight_lbs: item.rebar_geometry_weight_lbs,
      priced_weight_lbs: item.rebar_weight_lbs,
      connection_count: item.rebar_connection_count,
      engineering_approved: false,
      procurement_ready: false,
      material: clone(M),
      amounts: clone(A),
      supports: clone(S ?? null)
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
  return [
    {
      part_key: `foundation:item:${i}:rebar`,
      part_type: "material",
      part_subtype: "rebar",
      part_name: name,
      source_path: `items[${i}].reinforcement_material.inventory_id`,
      inventory_entity: material.kind === "catalog" ? "FoundationInventory" : "",
      inventory_item_id: material.kind === "catalog" ? M.inventory_id : "",
      quantity: item.rebar_feet,
      unit: "ft",
      unit_cost: item.rebar_rate,
      extended_cost: item.rebar_material_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    },
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementFrozenPricing.js
var plain2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var nonnegative2 = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive2 = (value) => nonnegative2(value) && value > 0;
var text = (value) => typeof value === "string" && value.trim().length > 0;
var product = (a, b, amount) => {
  const result = a * b;
  return Number.isFinite(result) && !(a > 0 && b > 0 && result === 0) && result === amount;
};
var fail2 = (message) => {
  const error = new Error(`Frozen reinforcement price basis is invalid: ${message}`);
  error.code = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
  throw error;
};
var supportSelectionIndex = (partKey, partSubtype) => {
  if (partSubtype !== "rebar_support" || typeof partKey !== "string") return null;
  const segments = partKey.split(":");
  if (segments.length === 5 && segments[0] === "foundation" && segments[1] === "item" && segments[3] === "support" && /^\d+$/.test(segments[4])) {
    return Number(segments[4]);
  }
  return null;
};
function validate(frame, unitCost, extendedCost) {
  if (!plain2(frame) || frame.version !== 1) fail2("unsupported record/version.");
  if (frame.state === "unrecorded") {
    if (Object.keys(frame).some((key) => key !== "version" && key !== "state")) fail2("unrecorded basis carries asserted values.");
    return;
  }
  if (frame.state !== "recorded") fail2("unsupported state.");
  const supportMaterial = frame.part_subtype === "rebar_support";
  const supportLabor = frame.part_type === "labor" && frame.part_subtype === "rebar_support_labor";
  const expectedUnit = supportMaterial ? "ea" : frame.part_type === "material" ? "ft" : "hr";
  if (!["material", "labor"].includes(frame.part_type) || frame.unit !== expectedUnit) fail2("role/unit mismatch.");
  if (supportMaterial && frame.part_type !== "material") fail2("support material must be a material part.");
  if (supportMaterial) {
    if (!Number.isSafeInteger(frame.support_selection_index) || frame.support_selection_index < 0) {
      fail2("invalid support selection index.");
    }
  } else if (frame.support_selection_index !== void 0 && frame.support_selection_index !== null) {
    fail2("a non-support part cannot carry a support selection index.");
  }
  for (const value of [frame.quantity, frame.unit_cost, frame.extended_cost, frame.labor_rate_per_hour]) {
    if (!nonnegative2(value)) fail2("quantity, rates and amounts must be finite nonnegative numbers.");
  }
  if (!product(frame.quantity, frame.unit_cost, frame.extended_cost)) fail2("quantity times rate does not match amount.");
  if (frame.unit_cost !== unitCost || frame.extended_cost !== extendedCost) fail2("stored amounts do not match frozen fields.");
  const r = frame.reinforcement_snapshot;
  if (!plain2(r) || r.version !== 1 || r.calculation_version !== 2 || !text(r.component_id) || r.engineering_approved !== false || r.procurement_ready !== false) fail2("invalid preliminary provenance.");
  const a = r.amounts, m = r.material;
  if (!plain2(a) || !plain2(m)) fail2("missing amount/material snapshots.");
  if (!plain2(frame.pricing_basis) || frame.pricing_basis.unit !== "ft" || frame.pricing_basis.cost_per_ft !== m.cost_per_ft || frame.pricing_basis.labor_rate_per_hour !== frame.labor_rate_per_hour || !Array.isArray(frame.rate_sources) || frame.rate_sources.some((source) => !plain2(source) || !text(source.key) || !text(source.source) || !nonnegative2(source.value))) fail2("invalid rate provenance.");
  for (const key of [
    "geometry_feet",
    "priced_feet",
    "geometry_weight_lbs",
    "priced_weight_lbs",
    "material_cost",
    "labor_cost",
    "labor_hours",
    "steel_cost",
    "connection_count"
  ]) {
    if (!nonnegative2(a[key])) fail2(`invalid ${key}.`);
  }
  if (!positive2(a.geometry_feet) || !positive2(a.geometry_weight_lbs) || !Number.isSafeInteger(a.connection_count)) fail2("invalid geometry/connection quantities.");
  const mapping = {
    physical_quantity_ft: "geometry_feet",
    priced_quantity_ft: "priced_feet",
    geometry_weight_lbs: "geometry_weight_lbs",
    priced_weight_lbs: "priced_weight_lbs",
    connection_count: "connection_count"
  };
  for (const [key, amountKey] of Object.entries(mapping)) {
    if (r[key] !== a[amountKey]) fail2("quantity snapshots disagree.");
  }
  if (m.pricing_unit !== "ft" || !nonnegative2(m.cost_per_ft) || !positive2(m.bar_diameter_inches) || !positive2(m.weight_lb_per_ft)) fail2("unknown material metadata.");
  if (m.kind === "catalog") {
    if (!text(m.inventory_id)) fail2("missing catalog identity.");
    if (m.cost_per_ft === 0 && (frame.zero_rate_authored !== true || m.rate_source !== "custom_rebar_cost_per_ft")) {
      fail2("catalog zero has no authored provenance.");
    }
  } else if (m.kind === "manual") {
    if (!text(m.reason) || m.inventory_id !== null && m.inventory_id !== void 0 && m.inventory_id !== "") fail2("invalid manual basis.");
  } else fail2("unsupported material kind.");
  if (a.material_cost + a.labor_cost !== a.steel_cost || !product(a.priced_feet, m.cost_per_ft, a.material_cost) || !product(a.labor_hours, frame.labor_rate_per_hour, a.labor_cost)) fail2("snapshot costs do not reconcile.");
  const supportsSnap = r.supports;
  if (supportMaterial) {
    if (!plain2(supportsSnap) || !plain2(supportsSnap.amounts) || !Array.isArray(supportsSnap.selections)) {
      fail2("missing support snapshot.");
    }
    const sel = supportsSnap.selections[frame.support_selection_index];
    if (!plain2(sel) || frame.quantity !== sel.units_purchased || frame.unit_cost !== sel.unit_cost || frame.extended_cost !== sel.material_cost) fail2("support material amounts do not match the snapshot.");
  } else if (supportLabor) {
    if (!plain2(supportsSnap) || !plain2(supportsSnap.amounts)) fail2("missing support snapshot.");
    if (frame.quantity !== supportsSnap.amounts.support_labor_hours || frame.unit_cost !== frame.labor_rate_per_hour || frame.extended_cost !== supportsSnap.amounts.support_labor_cost) {
      fail2("support labor amounts do not match the snapshot.");
    }
  } else {
    const material = frame.part_type === "material";
    if (frame.quantity !== (material ? a.priced_feet : a.labor_hours) || frame.unit_cost !== (material ? m.cost_per_ft : frame.labor_rate_per_hour) || frame.extended_cost !== (material ? a.material_cost : a.labor_cost)) fail2("role amounts do not match the snapshot.");
  }
}
function captureFoundationReinforcementFrozenPricing(part) {
  if (!plain2(part)) fail2("part must be a plain record.");
  const frame = {
    version: 1,
    state: "recorded",
    part_type: part.part_type,
    part_subtype: typeof part.part_subtype === "string" ? part.part_subtype : null,
    support_selection_index: supportSelectionIndex(part.part_key, part.part_subtype),
    quantity: part.quantity,
    unit: part.unit,
    unit_cost: part.current_unit_cost,
    extended_cost: part.current_extended_cost,
    labor_rate_per_hour: part.calculation_snapshot?.basis?.labor_rate_per_hour,
    pricing_basis: structuredClone(part.calculation_snapshot?.basis),
    rate_sources: structuredClone(part.calculation_snapshot?.rate_sources),
    zero_rate_authored: part.builder_data?.custom_rebar_cost_per_ft === 0,
    reinforcement_snapshot: structuredClone(part.pricing_basis_snapshot?.reinforcement)
  };
  validate(frame, part.current_unit_cost, part.current_extended_cost);
  return frame;
}
function preserveFoundationReinforcementFrozenPricing(part) {
  if (!plain2(part)) fail2("part must be a plain record.");
  const frame = part.pricing_basis_snapshot?.reinforcement_frozen_pricing;
  if (frame === void 0 || frame === null) return { version: 1, state: "unrecorded" };
  validate(frame, part.frozen_unit_cost, part.frozen_extended_cost);
  if (frame.state === "recorded" && frame.part_type !== part.part_type) fail2("stored role does not match part.");
  return structuredClone(frame);
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementWorkOrderPart.js
var MODE = "foundation_reinforcement_v2";
var KEY = "foundation_reinforcement_handoff";
var plain3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var nonnegative3 = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var ordered = (value) => {
  if (Array.isArray(value)) return value.map(ordered);
  if (!plain3(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
};
var same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
var fail3 = (message) => {
  const error = new Error(`Reinforcement Work Order handoff is invalid: ${message}`);
  error.code = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
  throw error;
};
var assertMoney = (value) => {
  if (!nonnegative3(value) || !Number.isSafeInteger(Math.round(value * 100))) {
    fail3("a saved amount cannot be represented safely in integer cents.");
  }
};
var roleSuffix = (partKey) => typeof partKey === "string" && partKey.startsWith("foundation:item:") ? partKey.split(":").slice(3).join(":") : null;
function validateCurrent(part) {
  const basis = part.pricing_basis_snapshot;
  if (basis?.pricing_mode !== MODE || basis.reinforcement?.version !== 1 || basis.reinforcement?.calculation_version !== 2) fail3("unsupported source calculation version.");
  if (part.builder_data?.__builder_pending_removal === true) {
    fail3("reinforcement removal is pending. Complete the estimate price review before conversion.");
  }
  const descriptors = foundationReinforcementPartDescriptors({ item: part.builder_data, itemIndex: 0 });
  const suffix = roleSuffix(part.part_key);
  let descriptor = suffix !== null ? descriptors.find((row) => roleSuffix(row.part_key) === suffix) : null;
  if (!descriptor) {
    descriptor = descriptors.find((row) => row.part_type === part.part_type && row.part_subtype === part.part_subtype && row.part_name === part.part_name);
  }
  if (!descriptor) fail3("the live reinforcement role is missing from the saved definition.");
  const fields = ["part_type", "part_subtype", "quantity", "unit", "inventory_entity", "inventory_item_id"];
  for (const field of fields) {
    if (part[field] !== descriptor[field]) fail3(`the saved definition and Part disagree on ${field}.`);
  }
  if (part.current_unit_cost !== descriptor.unit_cost || part.current_extended_cost !== descriptor.extended_cost || !same(part.calculation_snapshot, descriptor.calculation_snapshot) || !same(basis.reinforcement, descriptor.pricing_basis_snapshot.reinforcement)) {
    fail3("the last-calculated Part does not match the saved definition. Recalculate and save Foundation.");
  }
  return captureFoundationReinforcementFrozenPricing(part);
}
function financialFields(frozen, amount, role, partSubtype = null, selectionIndex = null) {
  assertMoney(amount);
  const recorded = frozen.state === "recorded";
  if (recorded) assertMoney(frozen.unit_cost);
  const material = recorded && role === "material" ? frozen.reinforcement_snapshot.material : null;
  let inventoryId = material?.kind === "catalog" ? material.inventory_id : "";
  let inventoryName = material?.name || "";
  if (recorded && partSubtype === "rebar_support") {
    const sel = frozen.reinforcement_snapshot.supports?.selections?.[selectionIndex];
    inventoryId = sel?.inventory_id || "";
    inventoryName = sel?.name || "";
  }
  return {
    quantity: recorded ? frozen.quantity : void 0,
    unit: recorded ? frozen.unit : "",
    unit_cost: recorded ? frozen.unit_cost : void 0,
    extended_cost: amount,
    inventory_item_id: inventoryId,
    inventory_item_name: inventoryName
  };
}
function projectFoundationReinforcementWorkOrderPart(part) {
  if (part?.pricing_basis_snapshot?.pricing_mode !== MODE) return null;
  if (["independent", "manual", "manual_addon", "detached_override"].includes(part.builder_sync_state)) return null;
  if (part.builder_sync_state !== "linked") fail3("the source Part has no verified linked-Builder state.");
  const current = validateCurrent(part);
  const frozen = preserveFoundationReinforcementFrozenPricing(part);
  if (frozen.state === "recorded" && frozen.reinforcement_snapshot.component_id !== current.reinforcement_snapshot.component_id) {
    fail3("the frozen and last-calculated snapshots refer to different components.");
  }
  const definition = structuredClone(part.builder_data);
  delete definition.reinforcement_proposal;
  const proof = part.pricing_basis_snapshot.reinforcement_catalog_basis_current;
  if (proof !== void 0 && typeof proof !== "boolean") fail3("catalog verification metadata is malformed.");
  return {
    ...financialFields(
      frozen,
      part.frozen_extended_cost,
      part.part_type,
      part.part_subtype,
      frozen.support_selection_index ?? null
    ),
    [KEY]: {
      version: 1,
      authority: "linked_builder_snapshot",
      part_type: part.part_type,
      frozen_pricing: frozen,
      last_calculated: current,
      definition_reference: definition,
      catalog_basis_current: current.reinforcement_snapshot.material.kind === "catalog" ? proof ?? false : null,
      engineering_approved: false,
      procurement_ready: false,
      purchasing: { state: "unplanned" }
    }
  };
}
function readFoundationReinforcementWorkOrderPart(row) {
  if (!plain3(row) || !Object.hasOwn(row, KEY)) return null;
  const handoff = row[KEY];
  if (!plain3(handoff) || handoff.version !== 1 || handoff.authority !== "linked_builder_snapshot" || handoff.part_type !== row.part_type || handoff.engineering_approved !== false || handoff.procurement_ready !== false || !same(handoff.purchasing, { state: "unplanned" })) {
    fail3("unsupported handoff metadata or an asserted engineering/procurement approval.");
  }
  const current = handoff.last_calculated;
  if (!plain3(current) || current.state !== "recorded" || current.part_type !== row.part_type) {
    fail3("the last-calculated snapshot is missing or has the wrong role.");
  }
  const definition = handoff.definition_reference;
  if (!plain3(definition) || Object.hasOwn(definition, "reinforcement_proposal")) {
    fail3("the definition reference is missing or contains an unapplied proposal.");
  }
  if (!plain3(handoff.frozen_pricing)) fail3("the explicit frozen-price provenance is missing.");
  const material = current.reinforcement_snapshot?.material;
  const isMaterial = row.part_type === "material";
  const partSubtype = typeof row.part_subtype === "string" ? row.part_subtype : isMaterial ? "rebar" : "rebar_labor";
  const descriptors = foundationReinforcementPartDescriptors({ item: definition, itemIndex: 0 });
  const suffix = typeof row.part_key === "string" ? roleSuffix(row.part_key) : null;
  const matched = (suffix !== null ? descriptors.find((d) => roleSuffix(d.part_key) === suffix) : null) || descriptors.find((d) => d.part_type === row.part_type && d.part_subtype === partSubtype && d.part_name === row.part_name);
  const source = {
    builder_sync_state: "linked",
    builder_data: definition,
    part_type: row.part_type,
    part_subtype: partSubtype,
    part_key: typeof row.part_key === "string" ? row.part_key : void 0,
    part_name: typeof row.part_name === "string" ? row.part_name : void 0,
    quantity: current.quantity,
    unit: current.unit,
    current_unit_cost: current.unit_cost,
    current_extended_cost: current.extended_cost,
    inventory_entity: matched?.inventory_entity ?? "",
    inventory_item_id: matched?.inventory_item_id ?? "",
    calculation_snapshot: definition.reinforcement_cost_snapshot,
    pricing_basis_snapshot: {
      pricing_mode: MODE,
      reinforcement: current.reinforcement_snapshot,
      reinforcement_frozen_pricing: handoff.frozen_pricing,
      reinforcement_catalog_basis_current: handoff.catalog_basis_current
    }
  };
  const verifiedCurrent = validateCurrent(source);
  if (!same(current, verifiedCurrent)) fail3("last-calculated provenance does not match the definition reference.");
  const proof = handoff.catalog_basis_current;
  if (material.kind === "catalog" ? typeof proof !== "boolean" : proof !== null) {
    fail3("catalog verification metadata does not match the material basis.");
  }
  const frozen = preserveFoundationReinforcementFrozenPricing({
    part_type: row.part_type,
    frozen_unit_cost: row.unit_cost,
    frozen_extended_cost: row.extended_cost,
    pricing_basis_snapshot: { reinforcement_frozen_pricing: handoff.frozen_pricing }
  });
  if (frozen.state === "recorded" && frozen.reinforcement_snapshot.component_id !== current.reinforcement_snapshot.component_id) {
    fail3("the frozen and last-calculated snapshots refer to different components.");
  }
  const financial = financialFields(
    frozen,
    row.extended_cost,
    row.part_type,
    typeof row.part_subtype === "string" ? row.part_subtype : null,
    frozen.support_selection_index ?? null
  );
  for (const field of ["quantity", "unit", "unit_cost", "extended_cost", "inventory_item_id", "inventory_item_name"]) {
    if (row[field] !== financial[field]) fail3(`the manifest ${field} does not match its frozen basis.`);
  }
  return {
    ...financial,
    part_type: row.part_type,
    part_subtype: partSubtype,
    frozenStatus: frozen.state,
    physical_quantity_ft: current.reinforcement_snapshot.physical_quantity_ft,
    physical_weight_lbs: current.reinforcement_snapshot.geometry_weight_lbs,
    last_priced_quantity: current.quantity,
    last_priced_unit: current.unit,
    last_calculated_material: structuredClone(material),
    catalog_basis_current: proof,
    engineering_approved: false,
    procurement_ready: false,
    purchasing: { state: "unplanned" }
  };
}
export {
  projectFoundationReinforcementWorkOrderPart,
  readFoundationReinforcementWorkOrderPart
};
