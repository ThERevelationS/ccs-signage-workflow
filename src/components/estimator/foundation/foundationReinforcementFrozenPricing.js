// Internal frozen-cost provenance, not customer acceptance or engineering approval.
const plain = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const positive = value => nonnegative(value) && value > 0;
const text = value => typeof value === "string" && value.trim().length > 0;
const product = (a, b, amount) => {
  const result = a * b;
  return Number.isFinite(result) && !(a > 0 && b > 0 && result === 0) && result === amount;
};
const fail = message => {
  const error = new Error(`Frozen reinforcement price basis is invalid: ${message}`);
  error.code = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
  throw error;
};

const supportSelectionIndex = (partKey, partSubtype) => {
  if (partSubtype !== "rebar_support" || typeof partKey !== "string") return null;
  const segments = partKey.split(":");
  // part_key shape: foundation:item:<index>:support:<selectionOrdinal>
  if (segments.length === 5 && segments[0] === "foundation" && segments[1] === "item"
    && segments[3] === "support" && /^\d+$/.test(segments[4])) {
    return Number(segments[4]);
  }
  return null;
};

function validate(frame, unitCost, extendedCost) {
  if (!plain(frame) || frame.version !== 1) fail("unsupported record/version.");
  if (frame.state === "unrecorded") {
    if (Object.keys(frame).some(key => key !== "version" && key !== "state")) fail("unrecorded basis carries asserted values.");
    return;
  }
  if (frame.state !== "recorded") fail("unsupported state.");
  const supportMaterial = frame.part_subtype === "rebar_support";
  const supportLabor = frame.part_type === "labor" && frame.part_subtype === "rebar_support_labor";
  const expectedUnit = supportMaterial ? "ea" : frame.part_type === "material" ? "ft" : "hr";
  if (!["material", "labor"].includes(frame.part_type) ||
      frame.unit !== expectedUnit) fail("role/unit mismatch.");
  if (supportMaterial && frame.part_type !== "material") fail("support material must be a material part.");
  if (supportMaterial) {
    if (!Number.isSafeInteger(frame.support_selection_index) || frame.support_selection_index < 0) {
      fail("invalid support selection index.");
    }
  } else if (frame.support_selection_index !== undefined && frame.support_selection_index !== null) {
    fail("a non-support part cannot carry a support selection index.");
  }
  for (const value of [frame.quantity, frame.unit_cost, frame.extended_cost, frame.labor_rate_per_hour]) {
    if (!nonnegative(value)) fail("quantity, rates and amounts must be finite nonnegative numbers.");
  }
  if (!product(frame.quantity, frame.unit_cost, frame.extended_cost)) fail("quantity times rate does not match amount.");
  if (frame.unit_cost !== unitCost || frame.extended_cost !== extendedCost) fail("stored amounts do not match frozen fields.");
  const r = frame.reinforcement_snapshot;
  if (!plain(r) || r.version !== 1 || r.calculation_version !== 2 || !text(r.component_id)
      || r.engineering_approved !== false || r.procurement_ready !== false) fail("invalid preliminary provenance.");
  const a = r.amounts, m = r.material;
  if (!plain(a) || !plain(m)) fail("missing amount/material snapshots.");
  if (!plain(frame.pricing_basis) || frame.pricing_basis.unit !== "ft" ||
      frame.pricing_basis.cost_per_ft !== m.cost_per_ft ||
      frame.pricing_basis.labor_rate_per_hour !== frame.labor_rate_per_hour ||
      !Array.isArray(frame.rate_sources) || frame.rate_sources.some(source =>
        !plain(source) || !text(source.key) || !text(source.source) || !nonnegative(source.value))) fail("invalid rate provenance.");
  for (const key of ["geometry_feet", "priced_feet", "geometry_weight_lbs", "priced_weight_lbs",
    "material_cost", "labor_cost", "labor_hours", "steel_cost", "connection_count"]) {
    if (!nonnegative(a[key])) fail(`invalid ${key}.`);
  }
  if (!positive(a.geometry_feet) || !positive(a.geometry_weight_lbs) ||
      !Number.isSafeInteger(a.connection_count)) fail("invalid geometry/connection quantities.");
  const mapping = { physical_quantity_ft: "geometry_feet", priced_quantity_ft: "priced_feet",
    geometry_weight_lbs: "geometry_weight_lbs", priced_weight_lbs: "priced_weight_lbs", connection_count: "connection_count" };
  for (const [key, amountKey] of Object.entries(mapping)) {
    if (r[key] !== a[amountKey]) fail("quantity snapshots disagree.");
  }
  if (m.pricing_unit !== "ft" || !nonnegative(m.cost_per_ft) ||
      !positive(m.bar_diameter_inches) || !positive(m.weight_lb_per_ft)) fail("unknown material metadata.");
  if (m.kind === "catalog") {
    if (!text(m.inventory_id)) fail("missing catalog identity.");
    if (m.cost_per_ft === 0 && (frame.zero_rate_authored !== true || m.rate_source !== "custom_rebar_cost_per_ft")) {
      fail("catalog zero has no authored provenance.");
    }
  } else if (m.kind === "manual") {
    if (!text(m.reason) || (m.inventory_id !== null && m.inventory_id !== undefined && m.inventory_id !== "")) fail("invalid manual basis.");
  } else fail("unsupported material kind.");
  if (a.material_cost + a.labor_cost !== a.steel_cost ||
      !product(a.priced_feet, m.cost_per_ft, a.material_cost) ||
      !product(a.labor_hours, frame.labor_rate_per_hour, a.labor_cost)) fail("snapshot costs do not reconcile.");
  // Support parts prove their amounts against the resolved support snapshot:
  // material rows against their own catalog pick (never the steel rate), the
  // labor row against the support labor hours at the same hourly basis.
  const supportsSnap = r.supports;
  if (supportMaterial) {
    if (!plain(supportsSnap) || !plain(supportsSnap.amounts) || !Array.isArray(supportsSnap.selections)) {
      fail("missing support snapshot.");
    }
    const sel = supportsSnap.selections[frame.support_selection_index];
    if (!plain(sel) || frame.quantity !== sel.units_purchased || frame.unit_cost !== sel.unit_cost ||
        frame.extended_cost !== sel.material_cost) fail("support material amounts do not match the snapshot.");
  } else if (supportLabor) {
    if (!plain(supportsSnap) || !plain(supportsSnap.amounts)) fail("missing support snapshot.");
    if (frame.quantity !== supportsSnap.amounts.support_labor_hours ||
        frame.unit_cost !== frame.labor_rate_per_hour ||
        frame.extended_cost !== supportsSnap.amounts.support_labor_cost) {
      fail("support labor amounts do not match the snapshot.");
    }
  } else {
    const material = frame.part_type === "material";
    if (frame.quantity !== (material ? a.priced_feet : a.labor_hours) ||
        frame.unit_cost !== (material ? m.cost_per_ft : frame.labor_rate_per_hour) ||
        frame.extended_cost !== (material ? a.material_cost : a.labor_cost)) fail("role amounts do not match the snapshot.");
  }
}

export function captureFoundationReinforcementFrozenPricing(part) {
  if (!plain(part)) fail("part must be a plain record.");
  const frame = {
    version: 1, state: "recorded", part_type: part.part_type,
    part_subtype: typeof part.part_subtype === "string" ? part.part_subtype : null,
    support_selection_index: supportSelectionIndex(part.part_key, part.part_subtype),
    quantity: part.quantity, unit: part.unit,
    unit_cost: part.current_unit_cost, extended_cost: part.current_extended_cost,
    labor_rate_per_hour: part.calculation_snapshot?.basis?.labor_rate_per_hour,
    pricing_basis: structuredClone(part.calculation_snapshot?.basis),
    rate_sources: structuredClone(part.calculation_snapshot?.rate_sources),
    zero_rate_authored: part.builder_data?.custom_rebar_cost_per_ft === 0,
    reinforcement_snapshot: structuredClone(part.pricing_basis_snapshot?.reinforcement),
  };
  validate(frame, part.current_unit_cost, part.current_extended_cost);
  return frame;
}

export function preserveFoundationReinforcementFrozenPricing(part) {
  if (!plain(part)) fail("part must be a plain record.");
  const frame = part.pricing_basis_snapshot?.reinforcement_frozen_pricing;
  if (frame === undefined || frame === null) return { version: 1, state: "unrecorded" };
  validate(frame, part.frozen_unit_cost, part.frozen_extended_cost);
  if (frame.state === "recorded" && frame.part_type !== part.part_type) fail("stored role does not match part.");
  return structuredClone(frame);
}

export function foundationReinforcementPricingPresentation(part) {
  const basis = part?.pricing_basis_snapshot;
  if (basis?.pricing_mode !== "foundation_reinforcement_v2" ||
      basis.reinforcement?.version !== 1 || basis.reinforcement?.calculation_version !== 2 ||
      part.builder_sync_state !== "linked") return null;
  const removalPending = part.builder_data?.__builder_pending_removal === true &&
    part.current_unit_cost === 0 && part.current_extended_cost === 0;
  let current = null;
  if (!removalPending) {
    try { current = captureFoundationReinforcementFrozenPricing(part); } catch { /* Never display a fabricated rate for an invalid basis. */ }
  }
  let frozen = null, frozenStatus = "invalid";
  try {
    frozen = preserveFoundationReinforcementFrozenPricing(part);
    frozenStatus = frozen.state;
  } catch { /* The stored amount can remain known even when its unit basis is invalid. */ }
  return {
    current, frozen, frozenStatus, removalPending,
    frozenAmount: nonnegative(part.frozen_extended_cost) ? part.frozen_extended_cost : null,
    catalogUnverified: !removalPending && !!part.inventory_item_id && basis.reinforcement_catalog_basis_current !== true,
  };
}
