// src/components/estimator/foundation/FoundationReinforcementPricingInfo.jsx
import { jsx, jsxs } from "react/jsx-runtime";
var quantity = (n) => n > 0 && n < 1e-4 ? "<0.0001" : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
function FoundationReinforcementPricingInfo({ presentation, formatMoney }) {
  if (!presentation) return null;
  const amount = (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 ? "Unavailable" : n > 0 && n < 5e-3 ? "<$0.01" : formatMoney(n);
  const { current, frozen, frozenStatus, frozenAmount, removalPending, catalogUnverified } = presentation;
  const recorded = frozenStatus === "recorded";
  const pending = removalPending;
  return /* @__PURE__ */ jsxs("section", { className: "rounded border border-gray-200 bg-white p-3", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[9px] font-bold tracking-widest text-gray-500 mb-2", children: "REINFORCEMENT PRICING" }),
    /* @__PURE__ */ jsxs("dl", { className: "space-y-1.5 text-[11px]", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Frozen quantity" }),
        /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right min-w-0 break-all", children: recorded ? `${quantity(frozen.quantity)} ${frozen.unit}` : frozenStatus === "unrecorded" ? "Not recorded" : "Unavailable" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Frozen unit cost" }),
        /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right min-w-0 break-all", children: recorded ? `${amount(frozen.unit_cost)} / ${frozen.unit}` : frozenStatus === "unrecorded" ? "Not recorded" : "Unavailable" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Frozen extended" }),
        /* @__PURE__ */ jsx("dd", { className: "font-semibold text-gray-800 text-right min-w-0 break-all", children: amount(frozenAmount) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Last priced quantity" }),
        /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right min-w-0 break-all", children: current ? `${quantity(current.quantity)} ${current.unit}` : pending ? "Removal pending" : "Unavailable" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Last unit cost" }),
        /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right min-w-0 break-all", children: current ? `${amount(current.unit_cost)} / ${current.unit}` : pending ? "Not applicable" : "Unavailable" })
      ] }),
      pending ? /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "After removal" }),
        /* @__PURE__ */ jsx("dd", { className: "font-semibold text-gray-800 text-right min-w-0 break-all", children: amount(0) })
      ] }) : /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Last extended" }),
        /* @__PURE__ */ jsx("dd", { className: "font-semibold text-gray-800 text-right min-w-0 break-all", children: current ? amount(current.extended_cost) : "Unavailable" })
      ] }),
      current && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Physical steel" }),
        /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right min-w-0 break-all", children: `${quantity(current.reinforcement_snapshot.physical_quantity_ft)} ft` })
      ] }),
      current && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Physical weight" }),
        /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right min-w-0 break-all", children: `${quantity(current.reinforcement_snapshot.geometry_weight_lbs)} lb` })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-2 space-y-1 text-[10px] text-gray-500", children: [
      /* @__PURE__ */ jsx("div", { children: "Preliminary quantities; engineering and purchasing review required." }),
      catalogUnverified && /* @__PURE__ */ jsx("div", { className: "text-amber-700", children: "Catalog basis is unverified. Reopen and save Foundation before updating price." }),
      frozenStatus === "invalid" && /* @__PURE__ */ jsx("div", { className: "text-amber-700", children: "Frozen price basis is invalid. Review pricing before updating the estimate." }),
      frozenStatus === "unrecorded" && /* @__PURE__ */ jsx("div", { children: "Quantity and unit basis were not recorded; the frozen amount was retained without an inferred rate." }),
      pending && /* @__PURE__ */ jsx("div", { children: "Frozen amount retained until Update Price is explicitly accepted; the previous geometry no longer represents the design." })
    ] })
  ] });
}

// src/components/estimator/foundation/foundationReinforcementFrozenPricing.js
var plain = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var nonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive = (value) => nonnegative(value) && value > 0;
var text = (value) => typeof value === "string" && value.trim().length > 0;
var product = (a, b, amount) => {
  const result = a * b;
  return Number.isFinite(result) && !(a > 0 && b > 0 && result === 0) && result === amount;
};
var fail = (message) => {
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
  if (!plain(frame) || frame.version !== 1) fail("unsupported record/version.");
  if (frame.state === "unrecorded") {
    if (Object.keys(frame).some((key) => key !== "version" && key !== "state")) fail("unrecorded basis carries asserted values.");
    return;
  }
  if (frame.state !== "recorded") fail("unsupported state.");
  const supportMaterial = frame.part_subtype === "rebar_support";
  const supportLabor = frame.part_type === "labor" && frame.part_subtype === "rebar_support_labor";
  const expectedUnit = supportMaterial ? "ea" : frame.part_type === "material" ? "ft" : "hr";
  if (!["material", "labor"].includes(frame.part_type) || frame.unit !== expectedUnit) fail("role/unit mismatch.");
  if (supportMaterial && frame.part_type !== "material") fail("support material must be a material part.");
  if (supportMaterial) {
    if (!Number.isSafeInteger(frame.support_selection_index) || frame.support_selection_index < 0) {
      fail("invalid support selection index.");
    }
  } else if (frame.support_selection_index !== void 0 && frame.support_selection_index !== null) {
    fail("a non-support part cannot carry a support selection index.");
  }
  for (const value of [frame.quantity, frame.unit_cost, frame.extended_cost, frame.labor_rate_per_hour]) {
    if (!nonnegative(value)) fail("quantity, rates and amounts must be finite nonnegative numbers.");
  }
  if (!product(frame.quantity, frame.unit_cost, frame.extended_cost)) fail("quantity times rate does not match amount.");
  if (frame.unit_cost !== unitCost || frame.extended_cost !== extendedCost) fail("stored amounts do not match frozen fields.");
  const r = frame.reinforcement_snapshot;
  if (!plain(r) || r.version !== 1 || r.calculation_version !== 2 || !text(r.component_id) || r.engineering_approved !== false || r.procurement_ready !== false) fail("invalid preliminary provenance.");
  const a = r.amounts, m = r.material;
  if (!plain(a) || !plain(m)) fail("missing amount/material snapshots.");
  if (!plain(frame.pricing_basis) || frame.pricing_basis.unit !== "ft" || frame.pricing_basis.cost_per_ft !== m.cost_per_ft || frame.pricing_basis.labor_rate_per_hour !== frame.labor_rate_per_hour || !Array.isArray(frame.rate_sources) || frame.rate_sources.some((source) => !plain(source) || !text(source.key) || !text(source.source) || !nonnegative(source.value))) fail("invalid rate provenance.");
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
    if (!nonnegative(a[key])) fail(`invalid ${key}.`);
  }
  if (!positive(a.geometry_feet) || !positive(a.geometry_weight_lbs) || !Number.isSafeInteger(a.connection_count)) fail("invalid geometry/connection quantities.");
  const mapping = {
    physical_quantity_ft: "geometry_feet",
    priced_quantity_ft: "priced_feet",
    geometry_weight_lbs: "geometry_weight_lbs",
    priced_weight_lbs: "priced_weight_lbs",
    connection_count: "connection_count"
  };
  for (const [key, amountKey] of Object.entries(mapping)) {
    if (r[key] !== a[amountKey]) fail("quantity snapshots disagree.");
  }
  if (m.pricing_unit !== "ft" || !nonnegative(m.cost_per_ft) || !positive(m.bar_diameter_inches) || !positive(m.weight_lb_per_ft)) fail("unknown material metadata.");
  if (m.kind === "catalog") {
    if (!text(m.inventory_id)) fail("missing catalog identity.");
    if (m.cost_per_ft === 0 && (frame.zero_rate_authored !== true || m.rate_source !== "custom_rebar_cost_per_ft")) {
      fail("catalog zero has no authored provenance.");
    }
  } else if (m.kind === "manual") {
    if (!text(m.reason) || m.inventory_id !== null && m.inventory_id !== void 0 && m.inventory_id !== "") fail("invalid manual basis.");
  } else fail("unsupported material kind.");
  if (a.material_cost + a.labor_cost !== a.steel_cost || !product(a.priced_feet, m.cost_per_ft, a.material_cost) || !product(a.labor_hours, frame.labor_rate_per_hour, a.labor_cost)) fail("snapshot costs do not reconcile.");
  const supportsSnap = r.supports;
  if (supportMaterial) {
    if (!plain(supportsSnap) || !plain(supportsSnap.amounts) || !Array.isArray(supportsSnap.selections)) {
      fail("missing support snapshot.");
    }
    const sel = supportsSnap.selections[frame.support_selection_index];
    if (!plain(sel) || frame.quantity !== sel.units_purchased || frame.unit_cost !== sel.unit_cost || frame.extended_cost !== sel.material_cost) fail("support material amounts do not match the snapshot.");
  } else if (supportLabor) {
    if (!plain(supportsSnap) || !plain(supportsSnap.amounts)) fail("missing support snapshot.");
    if (frame.quantity !== supportsSnap.amounts.support_labor_hours || frame.unit_cost !== frame.labor_rate_per_hour || frame.extended_cost !== supportsSnap.amounts.support_labor_cost) {
      fail("support labor amounts do not match the snapshot.");
    }
  } else {
    const material = frame.part_type === "material";
    if (frame.quantity !== (material ? a.priced_feet : a.labor_hours) || frame.unit_cost !== (material ? m.cost_per_ft : frame.labor_rate_per_hour) || frame.extended_cost !== (material ? a.material_cost : a.labor_cost)) fail("role amounts do not match the snapshot.");
  }
}
function captureFoundationReinforcementFrozenPricing(part) {
  if (!plain(part)) fail("part must be a plain record.");
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
  if (!plain(part)) fail("part must be a plain record.");
  const frame = part.pricing_basis_snapshot?.reinforcement_frozen_pricing;
  if (frame === void 0 || frame === null) return { version: 1, state: "unrecorded" };
  validate(frame, part.frozen_unit_cost, part.frozen_extended_cost);
  if (frame.state === "recorded" && frame.part_type !== part.part_type) fail("stored role does not match part.");
  return structuredClone(frame);
}
function foundationReinforcementPricingPresentation(part) {
  const basis = part?.pricing_basis_snapshot;
  if (basis?.pricing_mode !== "foundation_reinforcement_v2" || basis.reinforcement?.version !== 1 || basis.reinforcement?.calculation_version !== 2 || part.builder_sync_state !== "linked") return null;
  const removalPending = part.builder_data?.__builder_pending_removal === true && part.current_unit_cost === 0 && part.current_extended_cost === 0;
  let current = null;
  if (!removalPending) {
    try {
      current = captureFoundationReinforcementFrozenPricing(part);
    } catch {
    }
  }
  let frozen = null, frozenStatus = "invalid";
  try {
    frozen = preserveFoundationReinforcementFrozenPricing(part);
    frozenStatus = frozen.state;
  } catch {
  }
  return {
    current,
    frozen,
    frozenStatus,
    removalPending,
    frozenAmount: nonnegative(part.frozen_extended_cost) ? part.frozen_extended_cost : null,
    catalogUnverified: !removalPending && !!part.inventory_item_id && basis.reinforcement_catalog_basis_current !== true
  };
}

// src/components/estimator/foundation/foundationReinforcementPartDescriptors.js
var INVALID = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
var fail2 = (message) => {
  const error = new Error(message);
  error.code = INVALID;
  throw error;
};
var plain2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var finite = (v) => typeof v === "number" && Number.isFinite(v);
var nonnegative2 = (v) => finite(v) && v >= 0;
var positive2 = (v) => finite(v) && v > 0;
var nonemptyStr = (v) => typeof v === "string" && v.trim().length > 0;
var safeInt = (v) => Number.isSafeInteger(v);
var clone = (v) => structuredClone(v);
function foundationReinforcementPartDescriptors({ item, itemIndex } = {}) {
  if (!plain2(item)) fail2("item must be a plain record.");
  if (!safeInt(itemIndex) || itemIndex < 0) fail2("itemIndex must be a non-negative safe integer.");
  if (item.reinforcement_calculation_version !== 2) fail2("reinforcement_calculation_version must be 2.");
  const include = item.include_rebar;
  if (include === false || include === null || include === void 0) return [];
  if (typeof include !== "boolean") fail2("include_rebar must be a boolean.");
  if (!nonemptyStr(item.component_id)) fail2("component_id must be a non-empty string.");
  const design = item.reinforcement_design;
  const material = item.reinforcement_material;
  const snapshot = item.reinforcement_cost_snapshot;
  if (!plain2(design) || design.version !== 2) fail2("reinforcement_design.version must be 2.");
  if (!plain2(material)) fail2("reinforcement_material must be a record.");
  if (!plain2(snapshot) || snapshot.version !== 1 || snapshot.calculation_version !== 2 || snapshot.engineering_approved !== false) {
    fail2("reinforcement_cost_snapshot must be version 1 / calculation_version 2 / unapproved.");
  }
  if (!plain2(snapshot.amounts) || !plain2(snapshot.material) || !plain2(snapshot.basis) || !Array.isArray(snapshot.rate_sources)) {
    fail2("reinforcement_cost_snapshot requires amounts/material/basis/rate_sources.");
  }
  const numerics = {
    rebar_feet: nonnegative2,
    rebar_rate: nonnegative2,
    rebar_material_cost: nonnegative2,
    rebar_labor_cost: nonnegative2,
    rebar_labor_hours: nonnegative2,
    rebar_cost: nonnegative2,
    rebar_geometry_feet: positive2,
    rebar_geometry_weight_lbs: positive2,
    rebar_connection_count: (v) => safeInt(v) && v >= 0
  };
  for (const [field, check] of Object.entries(numerics)) {
    if (!check(item[field])) fail2(`${field} must be a finite numeric in range.`);
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
  if (!nonnegative2(item.rebar_weight_lbs)) fail2("rebar_weight_lbs must be finite numeric non-negative.");
  for (const [itemField, snapField] of Object.entries(mapping)) {
    if (!nonnegative2(A[snapField]) || item[itemField] !== A[snapField]) fail2(`${itemField} must strictly equal snapshot.amounts.${snapField}.`);
  }
  const M = snapshot.material;
  const B = snapshot.basis;
  if (!nonnegative2(B.labor_rate_per_hour)) fail2("labor_rate_per_hour must be finite numeric >= 0.");
  if (A.material_cost + A.labor_cost !== A.steel_cost) fail2("amounts must sum to steel_cost.");
  const productMatches = (a, b, expected) => {
    const value = a * b;
    return Number.isFinite(value) && !(a > 0 && b > 0 && value === 0) && value === expected;
  };
  if (!productMatches(item.rebar_feet, item.rebar_rate, A.material_cost)) fail2("feet*rate must equal material_cost.");
  if (!productMatches(item.rebar_labor_hours, B.labor_rate_per_hour, A.labor_cost)) fail2("hours*labor_rate must equal labor_cost.");
  if (M.pricing_unit !== "ft" || B.unit !== "ft") fail2("pricing/basis units must be ft.");
  if (M.cost_per_ft !== item.rebar_rate || B.cost_per_ft !== item.rebar_rate) fail2("rate must match snapshot material and basis.");
  if (M.kind !== material.kind) fail2("snapshot material kind must match authored kind.");
  if (material.kind === "catalog") {
    if (!nonemptyStr(material.inventory_id)) fail2("catalog material requires inventory_id.");
    if (M.inventory_id !== material.inventory_id) fail2("catalog inventory_id mismatch. Recalculate and save Foundation with the selected reinforcement material before Builder handoff; frozen prices remain unchanged until Update Price.");
    if (item.rebar_rate === 0) {
      if (item.custom_rebar_cost_per_ft !== 0 || M.rate_source !== "custom_rebar_cost_per_ft") {
        fail2("explicit catalog rate 0 requires authored zero override provenance.");
      }
    }
  } else if (material.kind === "manual") {
    if (!nonemptyStr(material.reason) || !nonemptyStr(M.reason) || M.reason.trim() !== material.reason.trim()) fail2("manual material reason must match snapshot.");
    if (M.inventory_id !== null && M.inventory_id !== void 0 && M.inventory_id !== "") fail2("manual material must not carry an inventory id.");
  } else {
    fail2("reinforcement_material.kind must be catalog or manual.");
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
    if (!plain2(S) || !plain2(S.amounts) || S.status !== "resolved") {
      fail2("reinforcement_cost_snapshot.supports must be a resolved support resolution when support data is present.");
    }
    const SA = S.amounts;
    for (const f of supportFields) {
      if (!nonnegative2(item[f])) fail2(`${f} must be a finite numeric >= 0.`);
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
      if (!nonnegative2(SA[snapField]) || item[itemField] !== SA[snapField]) {
        fail2(`${itemField} must strictly equal snapshot.supports.amounts.${snapField}.`);
      }
    }
    if (SA.support_material_cost + SA.support_labor_cost !== SA.support_cost) {
      fail2("support amounts must sum to support_cost.");
    }
    if (SA.support_count > 0) {
      const selections = Array.isArray(S.selections) ? S.selections : fail2("resolved supports require selections.");
      if (!productMatches(SA.support_labor_hours, B.labor_rate_per_hour, SA.support_labor_cost)) {
        fail2("support labor hours*rate must equal support_labor_cost.");
      }
      let purchasedSum = 0, packsSum = 0, materialSum = 0;
      for (const sel of selections) {
        if (!plain2(sel) || !nonemptyStr(sel.name) || !safeInt(sel.units_purchased) || sel.units_purchased <= 0 || !safeInt(sel.units_required) || sel.units_required <= 0 || sel.units_purchased < sel.units_required || !safeInt(sel.pack_size) || sel.pack_size <= 0 || !safeInt(sel.packs) || sel.packs <= 0 || sel.packs * sel.pack_size !== sel.units_purchased || !nonnegative2(sel.material_cost) || !nonnegative2(sel.unit_cost)) {
          fail2("each support selection needs a named pick with consistent pack/unit/cost math.");
        }
        if (!productMatches(sel.units_purchased, sel.unit_cost, sel.material_cost)) {
          fail2("support selection units*unit_cost must equal material_cost.");
        }
        purchasedSum += sel.units_purchased;
        packsSum += sel.packs;
        materialSum += sel.material_cost;
      }
      if (purchasedSum !== SA.support_purchased_units || packsSum !== SA.support_packs || materialSum !== SA.support_material_cost) {
        fail2("support selections must reconcile to support amounts.");
      }
    } else if (SA.support_purchased_units || SA.support_packs || SA.support_cost) {
      fail2("zero required supports cannot carry purchased units or cost.");
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
export {
  FoundationReinforcementPricingInfo as PricingInfo,
  captureFoundationReinforcementFrozenPricing,
  foundationReinforcementPartDescriptors,
  foundationReinforcementPricingPresentation,
  preserveFoundationReinforcementFrozenPricing
};
