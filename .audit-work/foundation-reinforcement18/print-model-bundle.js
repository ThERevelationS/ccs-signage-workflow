// src/components/estimator/foundation/foundationReinforcementPartDescriptors.js
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
      amounts: clone(A)
    }
  });
  const name = nonemptyStr(M.name) ? M.name : "Reinforcing steel";
  const i = itemIndex;
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
    }
  ];
}

// src/components/estimator/foundation/foundationReinforcementFrozenPricing.js
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
function validate(frame, unitCost, extendedCost) {
  if (!plain2(frame) || frame.version !== 1) fail2("unsupported record/version.");
  if (frame.state === "unrecorded") {
    if (Object.keys(frame).some((key) => key !== "version" && key !== "state")) fail2("unrecorded basis carries asserted values.");
    return;
  }
  if (frame.state !== "recorded") fail2("unsupported state.");
  if (!["material", "labor"].includes(frame.part_type) || frame.unit !== (frame.part_type === "material" ? "ft" : "hr")) fail2("role/unit mismatch.");
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
  const material = frame.part_type === "material";
  if (frame.quantity !== (material ? a.priced_feet : a.labor_hours) || frame.unit_cost !== (material ? m.cost_per_ft : frame.labor_rate_per_hour) || frame.extended_cost !== (material ? a.material_cost : a.labor_cost)) fail2("role amounts do not match the snapshot.");
}
function captureFoundationReinforcementFrozenPricing(part) {
  if (!plain2(part)) fail2("part must be a plain record.");
  const frame = {
    version: 1,
    state: "recorded",
    part_type: part.part_type,
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

// src/components/estimator/foundation/foundationReinforcementWorkOrderPart.js
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
function validateCurrent(part) {
  const basis = part.pricing_basis_snapshot;
  if (basis?.pricing_mode !== MODE || basis.reinforcement?.version !== 1 || basis.reinforcement?.calculation_version !== 2) fail3("unsupported source calculation version.");
  if (part.builder_data?.__builder_pending_removal === true) {
    fail3("reinforcement removal is pending. Complete the estimate price review before conversion.");
  }
  const descriptors = foundationReinforcementPartDescriptors({ item: part.builder_data, itemIndex: 0 });
  const descriptor = descriptors.find((row) => row.part_type === part.part_type);
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
function financialFields(frozen, amount, role) {
  assertMoney(amount);
  const recorded = frozen.state === "recorded";
  if (recorded) assertMoney(frozen.unit_cost);
  const material = recorded && role === "material" ? frozen.reinforcement_snapshot.material : null;
  return {
    quantity: recorded ? frozen.quantity : void 0,
    unit: recorded ? frozen.unit : "",
    unit_cost: recorded ? frozen.unit_cost : void 0,
    extended_cost: amount,
    inventory_item_id: material?.kind === "catalog" ? material.inventory_id : "",
    inventory_item_name: material?.name || ""
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
    ...financialFields(frozen, part.frozen_extended_cost, part.part_type),
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
  const source = {
    builder_sync_state: "linked",
    builder_data: definition,
    part_type: row.part_type,
    part_subtype: isMaterial ? "rebar" : "rebar_labor",
    quantity: current.quantity,
    unit: current.unit,
    current_unit_cost: current.unit_cost,
    current_extended_cost: current.extended_cost,
    inventory_entity: isMaterial && material?.kind === "catalog" ? "FoundationInventory" : "",
    inventory_item_id: isMaterial && material?.kind === "catalog" ? material.inventory_id : "",
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
  const financial = financialFields(frozen, row.extended_cost, row.part_type);
  for (const field of ["quantity", "unit", "unit_cost", "extended_cost", "inventory_item_id", "inventory_item_name"]) {
    if (row[field] !== financial[field]) fail3(`the manifest ${field} does not match its frozen basis.`);
  }
  return {
    ...financial,
    part_type: row.part_type,
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

// src/components/estimator/foundation/foundationReinforcementPrintMaterial.js
var clean = (value) => String(value ?? "").trim();
function foundationReinforcementPrintMaterial(part) {
  const projection = Object.hasOwn(part || {}, "foundation_reinforcement_handoff") ? null : projectFoundationReinforcementWorkOrderPart(part);
  const row = projection ? { ...part, ...projection } : part;
  const value = readFoundationReinforcementWorkOrderPart(row);
  if (!value) return null;
  const basis = value.frozenStatus === "recorded" ? `Frozen priced quantity: ${value.quantity} ${value.unit}.` : "Frozen quantity and unit cost: Not recorded. Saved extended amount retained.";
  const physical = value.part_type === "material" ? `Physical steel (last calculated): ${value.physical_quantity_ft} ft; ${value.physical_weight_lbs} lb.` : `Last-calculated labor: ${value.last_priced_quantity} ${value.last_priced_unit}.`;
  const selection = value.part_type === "material" ? `Last-calculated material: ${clean(value.last_calculated_material.name) || "Unnamed steel"}.` : "";
  return {
    name: clean(row.part_name) || clean(row.name) || clean(row.inventory_item_name) || "Reinforcement",
    type: value.part_type,
    qty: value.quantity ?? "",
    unit: value.unit,
    unit_cost: value.unit_cost ?? null,
    ext_cost: value.extended_cost,
    section: clean(row.section_name) || clean(row.module_key),
    reinforcement_note: [
      basis,
      physical,
      selection,
      "Pricing and physical quantities are not a purchasing plan. Engineering and purchasing review required."
    ].filter(Boolean).join(" ")
  };
}

// src/components/jobs/printTemplates/workOrderPrintModel.js
var num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
var clean2 = (v) => String(v ?? "").trim();
var firstText = (...vals) => {
  for (const v of vals) {
    const s = clean2(v);
    if (s) return s;
  }
  return "";
};
var textLines = (v) => {
  if (v == null) return [];
  const items = Array.isArray(v) ? v : [v];
  const out = [];
  for (const item of items) {
    if (item == null) continue;
    const raw = typeof item === "object" ? firstText(item.line, item.text, item.label, item.name, item.address) : String(item);
    for (const piece of raw.split(/\r?\n/)) {
      const s = clean2(piece);
      if (s) out.push(s);
    }
  }
  return out;
};
var fmtQty = (v) => {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
};
var fmtDate = (v) => {
  const s = clean2(v);
  if (!s) return "";
  const d = s.length === 10 ? /* @__PURE__ */ new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
var moneyOrNull = (v) => {
  const s = clean2(v);
  if (!s && s !== "0") {
    const n2 = num(v, NaN);
    return Number.isFinite(n2) ? n2 : null;
  }
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
var usd = (n) => n == null || !Number.isFinite(Number(n)) ? "" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var WO_PRINT_STAGE_LABELS = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
  completed: "Completed"
};
var WO_PRINT_PRODUCT_STATUS_LABELS = {
  queued: "Queued",
  in_design: "In Design",
  design_review: "Design Review",
  ready_for_production: "Ready for Production",
  in_production: "In Production",
  in_fabrication: "In Fabrication",
  ready_for_install: "Ready for Install",
  in_installation: "In Installation",
  completed: "Completed",
  on_hold: "On Hold"
};
var WO_PRINT_DEFAULT_COMPANY = {
  name: "CCS Signage",
  address_lines: [],
  phone: "",
  email: "",
  website: "",
  license: "",
  logo_url: ""
};
var buildCompany = (wo, options) => {
  const src = options.company || wo.company || {};
  return {
    name: firstText(src.name, src.company_name, wo.company_name, WO_PRINT_DEFAULT_COMPANY.name),
    address_lines: textLines(
      src.address_lines ?? src.company_address ?? src.address ?? WO_PRINT_DEFAULT_COMPANY.address_lines
    ),
    phone: firstText(src.phone, src.company_phone, WO_PRINT_DEFAULT_COMPANY.phone),
    email: firstText(src.email, src.company_email, WO_PRINT_DEFAULT_COMPANY.email),
    website: firstText(src.website, src.company_website, WO_PRINT_DEFAULT_COMPANY.website),
    license: firstText(src.license, src.company_license, WO_PRINT_DEFAULT_COMPANY.license),
    logo_url: firstText(
      options.logoUrl,
      options.logo_url,
      src.logo_url,
      src.company_logo_url,
      src.logo,
      WO_PRINT_DEFAULT_COMPANY.logo_url
    )
  };
};
var cityStateZip = (wo) => {
  const cityState = [
    firstText(wo.city, wo.township_city),
    firstText(wo.state, wo.county)
  ].filter(Boolean).join(", ");
  return [cityState, firstText(wo.zip, wo.postal_code, wo.zip_code)].filter(Boolean).join(" ");
};
var buildBillTo = (wo, options) => {
  const ov = options.billTo || options.bill_to || {};
  return {
    name: firstText(ov.name, wo.bill_to_name, wo.client_name, wo.customer_name),
    attention: firstText(ov.attention, wo.contact_name, wo.additional_contact),
    address_lines: [
      ...textLines(ov.address_lines),
      ...textLines(ov.address),
      ...textLines(wo.billing_address),
      ...textLines(wo.billing_address_line_2)
    ],
    phone: firstText(ov.phone, wo.contact_phone),
    email: firstText(ov.email, wo.contact_email)
  };
};
var buildShipTo = (wo, options) => {
  const ov = options.shipTo || options.ship_to || {};
  const lines = [
    ...textLines(ov.address_lines),
    ...textLines(ov.address),
    ...textLines(wo.install_location),
    ...textLines(wo.address_line_2),
    ...textLines(cityStateZip(wo))
  ];
  return {
    name: firstText(ov.name, wo.ship_to_name, wo.client_name, wo.customer_name),
    attention: firstText(ov.attention, wo.contact_name, wo.additional_contact),
    address_lines: lines,
    phone: firstText(ov.phone, wo.contact_phone),
    email: firstText(ov.email, wo.contact_email)
  };
};
var buildRows = (wo, options) => {
  const rows = [];
  const srcProducts = Array.isArray(options.products) ? options.products : Array.isArray(wo.products) ? wo.products : [];
  for (const p of srcProducts) {
    if (!p) continue;
    const name = firstText(
      p.customer_description,
      p.description,
      p.client_product_name,
      p.product_type,
      p.category
    );
    const qty = fmtQty(p.quantity);
    if (!name && !num(qty)) continue;
    const unitPrice = moneyOrNull(p.quoted_unit_price);
    const extPrice = moneyOrNull(
      p.quoted_total ?? (unitPrice != null && num(qty) ? unitPrice * num(qty) : null)
    );
    const unitCost = moneyOrNull(p.unit_cost ?? p.cost ?? p.est_unit_cost);
    const extCost = moneyOrNull(
      p.ext_cost ?? p.extended_cost ?? (unitCost != null && num(qty) ? unitCost * num(qty) : null)
    );
    const margin = moneyOrNull(
      p.margin ?? (extPrice != null && extCost != null ? extPrice - extCost : null)
    );
    const status = firstText(
      WO_PRINT_PRODUCT_STATUS_LABELS[clean2(p.operational_status)],
      clean2(p.operational_status),
      clean2(p.fulfillment_state)
    );
    rows.push({
      line: rows.length + 1,
      product_id: clean2(p.id),
      qty,
      name: name || "Item",
      type: firstText(p.product_type, p.category),
      description: firstText(p.customer_description) && firstText(p.description) !== name ? firstText(p.description) : "",
      notes: firstText(p.packing_notes, p.production_notes, p.notes),
      status,
      due_date: fmtDate(firstText(p.product_due_date, p.design_due_date)),
      unit_price: unitPrice,
      ext_price: extPrice,
      internal: {
        unit_cost: unitCost,
        ext_cost: extCost,
        margin,
        estimator_notes: firstText(p.estimator_notes),
        source_estimate_number: firstText(p.source_estimate_number),
        module_key: firstText(p.module_key),
        responsibility: firstText(p.responsibility),
        assigned_to: firstText(p.assigned_to, p.designer)
      }
    });
  }
  for (let i = 1; i <= 6; i += 1) {
    const name = clean2(wo[`product_${i}`]);
    if (!name) continue;
    rows.push({
      line: rows.length + 1,
      product_id: "",
      qty: "",
      name,
      type: "",
      description: "",
      notes: "",
      status: "",
      due_date: "",
      unit_price: null,
      ext_price: null,
      internal: {
        unit_cost: null,
        ext_cost: null,
        margin: null,
        estimator_notes: "",
        source_estimate_number: "",
        module_key: "",
        responsibility: "",
        assigned_to: ""
      }
    });
  }
  return rows;
};
var buildMaterials = (wo, options) => {
  const src = Array.isArray(options.materials) ? options.materials : Array.isArray(wo.materials) ? wo.materials : [];
  const rows = [];
  for (const m of src) {
    if (!m) continue;
    const reinforcement = foundationReinforcementPrintMaterial(m);
    if (reinforcement) {
      rows.push(reinforcement);
      continue;
    }
    const name = firstText(m.part_name, m.name, m.item_label, m.part_key);
    const qty = fmtQty(m.quantity);
    if (!name && !num(qty)) continue;
    rows.push({
      name: name || "Material",
      type: firstText(m.part_type, m.part_subtype),
      qty,
      unit: clean2(m.unit),
      unit_cost: moneyOrNull(m.unit_cost),
      ext_cost: moneyOrNull(m.ext_cost ?? m.extended_cost ?? (moneyOrNull(m.unit_cost) != null && num(qty) ? moneyOrNull(m.unit_cost) * num(qty) : null)),
      section: firstText(m.section_name, m.module_key)
    });
  }
  return rows;
};
var buildTasks = (wo) => {
  const src = Array.isArray(wo.notes) ? wo.notes : [];
  return src.filter((t) => t && clean2(t.text)).map((t) => ({
    text: clean2(t.text),
    completed: t.completed === true,
    is_milestone: t.is_milestone === true,
    is_critical_path: t.is_critical_path === true,
    assigned_to: clean2(t.assigned_to),
    due_date: fmtDate(t.due_date),
    checklist_context: clean2(t.checklist_context)
  }));
};
function buildWorkOrderPrintModel(workOrder, options = {}) {
  const wo = workOrder || {};
  const rows = buildRows(wo, options);
  const materials = buildMaterials(wo, options);
  const tasks = buildTasks(wo);
  const orderNumber = firstText(
    wo.corbridge_invoice_number,
    wo.order_number,
    wo.work_order_number,
    wo.invoice_number,
    wo.id
  );
  const workOrderId = clean2(wo.id);
  const meta = [
    { key: "stage", label: "Stage", value: WO_PRINT_STAGE_LABELS[clean2(wo.current_stage)] || clean2(wo.current_stage) },
    { key: "start_date", label: "Start Date", value: fmtDate(wo.start_date) },
    { key: "due_date", label: "Due Date", value: fmtDate(wo.due_date) },
    { key: "install_date", label: "Install Date", value: fmtDate(wo.project_install_date) },
    { key: "sales_rep", label: "Sales Rep", value: firstText(wo.sales_rep, wo.representative) },
    { key: "project_manager", label: "Project Manager", value: clean2(wo.project_manager) },
    { key: "designer", label: "Designer", value: clean2(wo.designer) },
    { key: "estimator", label: "Estimator", value: clean2(wo.estimator) },
    { key: "assigned_to", label: "Assigned To", value: clean2(wo.assigned_to) },
    { key: "project_type", label: "Project Type", value: clean2(wo.project_type) },
    { key: "permit_number", label: "Permit #", value: clean2(wo.permit_number) },
    { key: "po_number", label: "Customer PO", value: clean2(wo.po_number) }
  ].filter((entry) => entry.value);
  const subtotal = rows.reduce((sum, r) => sum + (r.ext_price != null ? r.ext_price : 0), 0);
  const estimateAmount = moneyOrNull(wo.estimate_amount);
  const depositAmount = moneyOrNull(wo.deposit_amount);
  const totalCost = rows.reduce((sum, r) => sum + (r.internal.ext_cost != null ? r.internal.ext_cost : 0), 0);
  const totalMargin = subtotal - totalCost;
  const hasCost = rows.some((r) => r.internal.ext_cost != null) || materials.some((m) => m.ext_cost != null);
  const pieceCount = rows.reduce((sum, r) => sum + (r.qty === "" ? 0 : num(r.qty)), 0);
  return {
    template_id: clean2(options.templateId ?? options.template_id),
    document_title: firstText(options.documentTitle, "Work Order"),
    order_number: orderNumber || workOrderId || "\u2014",
    job_code: workOrderId ? `WO-${workOrderId.toUpperCase()}` : orderNumber,
    work_order_id: workOrderId,
    work_order_title: clean2(wo.title),
    description: clean2(wo.description),
    image_url: clean2(wo.image_url),
    asap: wo.asap === true,
    is_rider: wo.is_rider === true,
    completed: wo.completed === true,
    printed_at: firstText(options.printedAt, options.printed_at, (/* @__PURE__ */ new Date()).toISOString()),
    company: buildCompany(wo, options),
    bill_to: buildBillTo(wo, options),
    ship_to: buildShipTo(wo, options),
    meta,
    rows,
    row_count: rows.length,
    piece_count: pieceCount,
    totals: {
      subtotal,
      estimate_amount: estimateAmount,
      // The headline contract total: stored estimate_amount when present,
      // else the product subtotal.
      contract_total: estimateAmount != null ? estimateAmount : subtotal,
      deposit_required: wo.deposit_required === true,
      deposit_amount: depositAmount,
      deposit_invoiced: wo.deposit_invoiced === true,
      balance_due: estimateAmount != null && depositAmount != null ? estimateAmount - depositAmount : estimateAmount,
      internal: {
        total_cost: hasCost ? totalCost : null,
        total_margin: hasCost ? totalMargin : null,
        margin_pct: hasCost && subtotal ? Math.round(totalMargin / subtotal * 1e3) / 10 : null,
        actual_cost: moneyOrNull(wo.actual_cost),
        profit_margin: moneyOrNull(wo.profit_margin),
        materials_cost: materials.some((m) => m.ext_cost != null) ? materials.reduce((sum, m) => sum + (m.ext_cost != null ? m.ext_cost : 0), 0) : null
      }
    },
    materials,
    tasks,
    task_counts: {
      total: tasks.length,
      done: tasks.filter((t) => t.completed).length,
      milestones: tasks.filter((t) => t.is_milestone).length
    },
    fmt: { usd, fmtDate, fmtQty },
    footer_note: firstText(
      options.footerNote,
      "This work order lists customer pricing \u2014 production details travel on the shop traveler."
    )
  };
}
export {
  WO_PRINT_DEFAULT_COMPANY,
  WO_PRINT_PRODUCT_STATUS_LABELS,
  WO_PRINT_STAGE_LABELS,
  buildWorkOrderPrintModel
};
