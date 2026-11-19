// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/moduleRegistry.js
var ESTIMATOR_MODULES = [
  { key: "foundation", label: "Concrete | Masonry | Poles", entity: "FoundationProject", page: "FoundationEstimator" },
  { key: "channel_letters", label: "Channel & Dimensional Letters", entity: "ChannelLetterInstallation", page: "ChannelLetterEstimator" },
  { key: "vinyl", label: "Vinyl & Graphics", entity: "VinylProject", page: "VinylEstimator" },
  { key: "cnc", label: "CNC Router", entity: "CNCProject", page: "CNCEstimator" },
  { key: "laser", label: "Laser", entity: "LaserProject", page: "LaserEstimator" },
  { key: "metal", label: "Metal Fabrication", entity: "MetalProject", page: "MetalEstimator" },
  { key: "brick_stone", label: "Brick & Stone", entity: "BrickStoneProject", page: "BrickStoneEstimator" },
  { key: "maintenance", label: "Sign Maintenance", entity: "MaintenanceProject", page: "MaintenanceEstimator" },
  { key: "painting", label: "Painting", entity: "Project", page: "PaintingEstimator" },
  { key: "custom_items", label: "Custom line items", entity: "CustomItemsProject", page: "CustomItemsEstimator" }
];
var LEGACY_MODULES = {};
var getModule = (key) => ESTIMATOR_MODULES.find((m) => m.key === key) || LEGACY_MODULES[key];
var getModuleLabel = (key) => getModule(key)?.label || key;

// .audit-work/foundation-o012-handoff/fixture/base44/shared/dueDateEngine.ts
var LEAD_TIERS = ["standard", "minimum", "additional"];
var DAY_NAMES = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};
var finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : void 0;
};
var nonNeg = (value) => {
  const n = finite(value);
  return n === void 0 ? void 0 : Math.max(0, n);
};
var pad2 = (n) => String(n).padStart(2, "0");
function toLocalDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const v = String(value ?? "").trim();
  if (!v) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), day = Number(v.slice(8, 10));
    const dt = new Date(y, m - 1, day);
    d = dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day ? dt : /* @__PURE__ */ new Date(NaN);
  } else {
    d = new Date(v);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}
function toDateOnly(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseDateOnly(value) {
  const d = toLocalDate(value);
  return d ? toDateOnly(d) : "";
}
var dayIndex = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) return value;
  const key = String(value ?? "").trim().toLowerCase();
  return DAY_NAMES[key];
};
function openDaySet(clock) {
  if (!clock || typeof clock !== "object") return null;
  const rawDays = clock.business_days ?? clock.businessDays ?? clock.days_of_week ?? null;
  const days = /* @__PURE__ */ new Set();
  let restricted = false;
  if (Array.isArray(rawDays)) {
    for (const entry of rawDays) {
      const idx = dayIndex(entry);
      if (idx !== void 0) days.add(idx);
    }
    if (rawDays.length && days.size) restricted = true;
  }
  const holidays = /* @__PURE__ */ new Set();
  for (const h of Array.isArray(clock.holidays) ? clock.holidays : []) {
    const d = parseDateOnly(h);
    if (d) holidays.add(d);
  }
  if (!restricted && !holidays.size) return null;
  if (!restricted) for (let i = 0; i < 7; i += 1) days.add(i);
  return { days, holidays };
}
var isOpenDay = (d, open) => open.days.has(d.getDay()) && !open.holidays.has(toDateOnly(d));
function addLeadDays(anchor, days, clock = null, trace = null, field = "") {
  const open = openDaySet(clock);
  const out = new Date(anchor.getTime());
  const n = Math.max(0, Math.round(Number(days) || 0));
  if (!open) {
    out.setDate(out.getDate() + n);
    if (trace) trace.push({ kind: "clock", field, mode: "calendar", days: n });
    return out;
  }
  let remaining = n;
  while (remaining > 0) {
    out.setDate(out.getDate() + 1);
    if (isOpenDay(out, open)) remaining -= 1;
  }
  if (trace) {
    trace.push({
      kind: "clock",
      field,
      mode: "business",
      days: n,
      business_days: [...open.days].sort(),
      holidays: [...open.holidays].sort()
    });
  }
  return out;
}
function resolvePartLead(part, kind = "product", tier = "standard") {
  const k = kind === "design" ? "design" : "product";
  const flat = nonNeg(part?.[`${k}_lead_days`]);
  const min = nonNeg(part?.[`${k}_min_days`]);
  const stdField = nonNeg(part?.[`${k}_std_days`]);
  const add = nonNeg(part?.[`${k}_add_days`]);
  const std = stdField ?? flat ?? 0;
  const floor = min ?? 0;
  const ceiling = std + (add ?? 0);
  let pick;
  let source;
  const numericTier = typeof tier === "number" ? tier : finite(tier);
  const name = String(tier ?? "standard").trim().toLowerCase();
  if (numericTier !== void 0 && !LEAD_TIERS.includes(name) && name !== "") {
    pick = numericTier;
    source = "tier";
  } else if (name === "minimum" || name === "min") {
    pick = min ?? std;
    source = min !== void 0 ? "min" : stdField !== void 0 ? "std" : flat !== void 0 ? "flat" : "zero";
  } else if (name === "additional" || name === "add" || name === "max" || name === "maximum" || name === "extended") {
    pick = ceiling;
    source = add !== void 0 ? "add" : stdField !== void 0 ? "std" : flat !== void 0 ? "flat" : "zero";
  } else {
    pick = std;
    source = stdField !== void 0 ? "std" : flat !== void 0 ? "flat" : "zero";
  }
  const effectiveCeiling = Math.max(ceiling, floor);
  const bounded = numericTier !== void 0 && !LEAD_TIERS.includes(name) && name !== "" ? Math.max(floor, pick) : Math.min(effectiveCeiling, Math.max(floor, pick));
  return {
    days: Math.round(bounded),
    min_days: min,
    std_days: std,
    add_days: add,
    flat_days: flat,
    floor,
    ceiling,
    source
  };
}
var holdResult = (existingProduct, existingDesign, trace) => ({
  due_date: existingProduct,
  design_due_date: existingDesign,
  prior_due_date: existingProduct,
  computed_due_date: "",
  anchor_date: "",
  max_product_lead_days: 0,
  max_design_lead_days: 0,
  pushed: false,
  changed: false,
  held_by_hard_date: true,
  trace: [...trace, { kind: "hard_date", held: true, due_date: existingProduct }]
});
var clampForward = (candidate, existing, enabled, field, trace) => {
  if (!enabled || !existing || !candidate || candidate >= existing) return candidate;
  trace.push({ kind: "clamp", field, from: candidate, to: existing, reason: "push_forward_only" });
  return existing;
};
function computeProductDueDate({
  parts = [],
  anchor_date,
  hard_due_date = false,
  product_due_date = "",
  design_due_date = "",
  clock = null,
  design_clock = null,
  tier = "standard",
  respect_hard_dates = true,
  push_forward_only = false,
  label = ""
} = {}) {
  const trace = label ? [{ kind: "trigger", label }] : [];
  const hard = hard_due_date === true;
  const respect = respect_hard_dates !== false;
  const existingProduct = parseDateOnly(product_due_date);
  const existingDesign = parseDateOnly(design_due_date);
  if (hard && respect && existingProduct) {
    return holdResult(existingProduct, existingDesign, trace);
  }
  const anchorInput = anchor_date ?? /* @__PURE__ */ new Date();
  const anchor = toLocalDate(anchorInput);
  const anchorStr = anchor ? toDateOnly(anchor) : "";
  trace.push({ kind: "anchor", date: anchorStr, input: String(anchorInput ?? "") });
  if (!anchor) {
    trace.push({ kind: "error", reason: "anchor_unparseable" });
    return {
      due_date: existingProduct,
      design_due_date: existingDesign,
      prior_due_date: existingProduct,
      computed_due_date: "",
      anchor_date: "",
      max_product_lead_days: 0,
      max_design_lead_days: 0,
      pushed: false,
      changed: false,
      held_by_hard_date: false,
      trace
    };
  }
  const partList = (Array.isArray(parts) ? parts : []).filter((p) => p && typeof p === "object");
  if (!partList.length) {
    trace.push({ kind: "note", reason: "no_parts" });
    return {
      due_date: existingProduct,
      design_due_date: existingDesign,
      prior_due_date: existingProduct,
      computed_due_date: "",
      anchor_date: anchorStr,
      max_product_lead_days: 0,
      max_design_lead_days: 0,
      pushed: false,
      changed: false,
      held_by_hard_date: false,
      trace
    };
  }
  let maxProduct = 0;
  let maxDesign = 0;
  let productOwner = null;
  let designOwner = null;
  (Array.isArray(parts) ? parts : []).forEach((part, index) => {
    if (!part || typeof part !== "object") return;
    const design = resolvePartLead(part, "design", tier);
    const product = resolvePartLead(part, "product", tier);
    trace.push({
      kind: "part",
      index,
      part_id: String(part?.id ?? part?.part_id ?? part?.builder_part_id ?? ""),
      name: String(part?.name ?? part?.part_name ?? part?.description ?? ""),
      design_days: design.days,
      product_days: product.days,
      design_source: design.source,
      product_source: product.source,
      design_bounds: [design.floor, design.ceiling],
      product_bounds: [product.floor, product.ceiling]
    });
    if (product.days >= maxProduct) {
      maxProduct = product.days;
      productOwner = { index, part_id: String(part?.id ?? part?.part_id ?? "") };
    }
    if (design.days >= maxDesign) {
      maxDesign = design.days;
      designOwner = { index, part_id: String(part?.id ?? part?.part_id ?? "") };
    }
  });
  trace.push({ kind: "max", field: "product_due_date", days: maxProduct, ...productOwner });
  trace.push({ kind: "max", field: "design_due_date", days: maxDesign, ...designOwner });
  const productionClock = clock ?? null;
  const salesClock = design_clock ?? productionClock;
  const prodCandidate = toDateOnly(addLeadDays(anchor, maxProduct, productionClock, trace, "product_due_date"));
  const designCandidate = toDateOnly(addLeadDays(anchor, maxDesign, salesClock, trace, "design_due_date"));
  const finalProduct = clampForward(prodCandidate, existingProduct, push_forward_only !== false, "product_due_date", trace);
  const finalDesign = clampForward(designCandidate, existingDesign, push_forward_only !== false, "design_due_date", trace);
  if (hard && !respect) trace.push({ kind: "hard_date", held: false, reason: "respect_hard_dates_off" });
  return {
    due_date: finalProduct,
    design_due_date: finalDesign,
    prior_due_date: existingProduct,
    computed_due_date: prodCandidate,
    anchor_date: anchorStr,
    max_product_lead_days: maxProduct,
    max_design_lead_days: maxDesign,
    pushed: Boolean(existingProduct) && finalProduct > existingProduct,
    changed: finalProduct !== existingProduct,
    held_by_hard_date: false,
    trace
  };
}
function computeOrderDueDate({
  products = [],
  existing_due_date = "",
  hard_due_date = false,
  date_field = "",
  respect_hard_dates = true,
  push_forward_only = false,
  label = ""
} = {}) {
  const trace = label ? [{ kind: "trigger", label }] : [];
  const hard = hard_due_date === true;
  const respect = respect_hard_dates !== false;
  const existing = parseDateOnly(existing_due_date);
  if (hard && respect && existing) {
    return holdResult(existing, "", trace);
  }
  const list = Array.isArray(products) ? products : [];
  let best = "";
  let bestIndex = -1;
  let bestId = "";
  list.forEach((product, index) => {
    if (!product || typeof product !== "object") return;
    const raw = date_field ? product?.[date_field] : product?.due_date || product?.product_due_date;
    const d = parseDateOnly(raw);
    trace.push({
      kind: "product",
      index,
      product_id: String(product?.id ?? product?.product_id ?? ""),
      due_date: d,
      skipped: !d
    });
    if (d && (!best || d > best)) {
      best = d;
      bestIndex = index;
      bestId = String(product?.id ?? product?.product_id ?? "");
    }
  });
  trace.push({ kind: "max", field: "due_date", due_date: best, index: bestIndex, product_id: bestId });
  if (!best) {
    return {
      due_date: existing,
      design_due_date: "",
      prior_due_date: existing,
      computed_due_date: "",
      binding_product_id: "",
      binding_index: -1,
      pushed: false,
      changed: false,
      held_by_hard_date: false,
      trace
    };
  }
  const final = clampForward(best, existing, push_forward_only !== false, "due_date", trace);
  return {
    due_date: final,
    design_due_date: "",
    prior_due_date: existing,
    computed_due_date: best,
    binding_product_id: bestId,
    binding_index: bestIndex,
    pushed: Boolean(existing) && final > existing,
    changed: final !== existing,
    held_by_hard_date: false,
    trace
  };
}
function recalcOnProofApproval({
  product = {},
  approval_date,
  parts,
  clock = null,
  design_clock = null,
  tier = "standard",
  respect_hard_dates = true,
  push_forward_only = true
} = {}) {
  const partList = parts !== void 0 ? parts : product?.parts ?? product?.part_list ?? product?.builder_parts ?? [];
  return computeProductDueDate({
    parts: partList,
    anchor_date: approval_date ?? /* @__PURE__ */ new Date(),
    hard_due_date: product?.hard_due_date === true,
    product_due_date: product?.product_due_date,
    design_due_date: product?.design_due_date,
    clock,
    design_clock,
    tier,
    respect_hard_dates,
    push_forward_only,
    label: "proof_approval"
  });
}

// .audit-work/foundation-o012-handoff/fixture/base44/shared/productStatusModel.ts
var norm = (v) => String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
var OPERATIONAL_STATUS_SET = [
  "order_review",
  "site_survey",
  "awaiting_customer_action",
  "awaiting_proof_approval",
  "proof_changes_requested",
  "permitting",
  "proof_approved",
  "in_production",
  "install_removal_only",
  "quality_control",
  "design_review",
  "service_repair",
  "built",
  "completed",
  "voided"
];
function isOperationalStatus(s) {
  return OPERATIONAL_STATUS_SET.includes(norm(s));
}
var CUSTOMER_FACING_LABELS = {
  order_review: "Order Review",
  site_survey: "Site Survey Scheduled",
  awaiting_customer_action: "Action Required",
  awaiting_proof_approval: "Requires Proof Approval",
  proof_changes_requested: "Proof Changes Requested",
  permitting: "Permitting",
  proof_approved: "Proof Approved",
  design_review: "Design Review",
  in_production: "In Production",
  install_removal_only: "Install/Removal Only",
  quality_control: "Quality Control",
  service_repair: "Service/Repair",
  built: "Built",
  completed: "Completed",
  voided: "Voided"
};
function customerFacingLabel(status) {
  const v = norm(status);
  return isOperationalStatus(v) ? CUSTOMER_FACING_LABELS[v] : "";
}

// .audit-work/foundation-o012-handoff/fixture/src/components/workflow/workOrderPersistence.js
async function mutateWorkOrderArrayField({ entity, id, field, mutate } = {}) {
  const row = await entity.get(id);
  const next = { ...row, [field]: typeof mutate === "function" ? mutate(row[field] || [], row) : mutate };
  return entity.update(id, next);
}

// .audit-work/foundation-o012-handoff/fixture/src/components/workflow/NotificationService.js
var NotificationTriggers = {};

// .audit-work/foundation-o012-handoff/fixture/src/components/staff/staffEntities.js
var store = () => {
  if (!globalThis.__ccsEntities) globalThis.__ccsEntities = /* @__PURE__ */ new Map();
  return globalThis.__ccsEntities;
};
var table = (name) => {
  const s = store();
  if (!s.has(name)) s.set(name, /* @__PURE__ */ new Map());
  return s.get(name);
};
var clone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var notFound = () => Object.assign(new Error("Record not found."), { status: 404 });
var bump = () => globalThis.__ccsNow ? globalThis.__ccsNow() : (/* @__PURE__ */ new Date()).toISOString();
var matches = (row, query = {}) => Object.entries(query).every(([key, want]) => {
  if (key === "id") return row?.id === want;
  return JSON.stringify(row?.[key] ?? null) === JSON.stringify(want ?? null);
});
var applySet = (row, update = {}) => {
  const patch = update.$set || update;
  const next = { ...row, ...clone(patch) };
  next.updated_date = bump();
  return next;
};
var api = (name) => ({
  async get(id) {
    const row = table(name).get(id);
    if (!row) throw notFound();
    return clone(row);
  },
  async filter(query = {}, _sort = void 0, _limit = void 0) {
    return [...table(name).values()].filter((r) => matches(r, query)).map(clone);
  },
  async list() {
    return [...table(name).values()].map(clone);
  },
  async create(data) {
    const id = data?.id || `${name}-${table(name).size + 1}-${Math.random().toString(36).slice(2, 8)}`;
    const now = bump();
    const row = { ...clone(data), id, created_date: data?.created_date || now, updated_date: data?.updated_date || now };
    table(name).set(id, row);
    return clone(row);
  },
  async update(id, data) {
    const row = table(name).get(id);
    if (!row) throw notFound();
    const next = applySet(row, data);
    table(name).set(id, next);
    return clone(next);
  },
  async updateMany(query = {}, update = {}) {
    let updated = 0;
    for (const [id, row] of table(name)) {
      if (!matches(row, query)) continue;
      table(name).set(id, applySet(row, update));
      updated += 1;
    }
    return { updated };
  },
  async delete(id) {
    return table(name).delete(id);
  },
  async deleteMany(query = {}) {
    let deleted = 0;
    for (const [id, row] of table(name)) {
      if (matches(row, query)) {
        table(name).delete(id);
        deleted += 1;
      }
    }
    return { deleted };
  },
  async count(query = {}) {
    return [...table(name).values()].filter((r) => matches(r, query)).length;
  },
  subscribe() {
    return () => {
    };
  }
});
var cache = /* @__PURE__ */ new Map();
var staffEntities = new Proxy({}, {
  get(_, name) {
    if (typeof name !== "string") return void 0;
    if (!cache.has(name)) cache.set(name, api(name));
    return cache.get(name);
  }
});

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/depositGate.js
var DEPOSIT_GATED_STATUSES = /* @__PURE__ */ new Set();
function depositGateApplies() {
  return false;
}
function depositGateMessage() {
  return "";
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/customerPricing.js
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num(line?.total_snapshot);
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/workOrderConversion.js
var num2 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var norm2 = (value) => String(value || "").trim().toLowerCase();
var firstNonBlank = (...values) => values.find((value) => value !== void 0 && value !== null && String(value).trim() !== "") ?? "";
var INITIAL_OPERATIONAL_STATUS = Array.isArray(OPERATIONAL_STATUS_SET) && OPERATIONAL_STATUS_SET[0] || "order_review";
var asObjectList = (value) => Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
function resolveEstimateLineParts(line = {}, partsPool = []) {
  const embedded = [
    line?.parts,
    line?.part_list,
    line?.builder_parts,
    line?.builder_snapshot?.parts,
    line?.builder_snapshot?.part_list
  ].find((list) => Array.isArray(list) && list.length > 0);
  if (embedded) return asObjectList(embedded).filter((part) => part.is_active !== false);
  const pool = asObjectList(partsPool).filter((part) => part.is_active !== false);
  if (!pool.length) return [];
  const lineId = String(line?.line_id || "").trim();
  const builderProductId = String(line?.builder_product_id || "").trim();
  return pool.filter(
    (part) => lineId && (String(part?.estimate_line_id || "").trim() === lineId || String(part?.line_id || "").trim() === lineId) || builderProductId && String(part?.builder_product_id || "").trim() === builderProductId
  );
}
async function loadEstimateConversionParts(estimate = {}, { entity = null } = {}) {
  const Part = entity || staffEntities?.BuilderPart;
  if (typeof Part?.filter !== "function") return [];
  const estimateId = String(estimate?.id || "").trim();
  const lines = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  const builderProductIds = [...new Set(lines.map((l) => String(l?.builder_product_id || "").trim()).filter(Boolean))];
  const seen = /* @__PURE__ */ new Set();
  const parts = [];
  const push = (row) => {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    parts.push(row);
  };
  if (estimateId) {
    (await Part.filter({ estimate_id: estimateId }, "created_date", 500).catch(() => [])).forEach(push);
  }
  for (const bpid of builderProductIds) {
    if (parts.some((p) => String(p?.builder_product_id || "").trim() === bpid)) continue;
    (await Part.filter({ builder_product_id: bpid }, "created_date", 500).catch(() => [])).forEach(push);
  }
  return parts;
}
function buildEstimateWorkOrderProducts(estimate = {}, pricing = {}, options = {}) {
  const pricedByLine = new Map(
    (pricing.sections || []).filter((section) => section?.line_id).map((section) => [section.line_id, section])
  );
  const partsPool = asObjectList(options?.parts ?? pricing?.parts ?? estimate?.parts);
  const anchorDate = firstNonBlank(options?.anchor_date, options?.conversionDate, options?.now, pricing?.anchor_date) || /* @__PURE__ */ new Date();
  const dueOptions = {
    clock: options?.clock ?? pricing?.clock ?? null,
    design_clock: options?.design_clock ?? pricing?.design_clock ?? null,
    tier: options?.tier ?? pricing?.lead_tier ?? "standard",
    respect_hard_dates: true,
    push_forward_only: false,
    label: "estimate_conversion"
  };
  return (estimate.line_items || []).map((line, index) => {
    const priced = pricedByLine.get(line.line_id) || line;
    const quantity = Math.max(0, num2(priced.quantity, num2(line.customer_quantity, 1)));
    const unitPrice = num2(priced.unitRaw, acceptedCustomerUnitPrice(line));
    const adjustedTotal = Number.isFinite(Number(priced.adjusted)) ? Number(priced.adjusted) : unitPrice * quantity * (1 + num2(line.adjustment_percent) / 100);
    const productName = line.client_product_name || line.project_name || getModuleLabel(line.module_key) || `Product ${index + 1}`;
    const lineParts = resolveEstimateLineParts(line, partsPool);
    const due = typeof computeProductDueDate === "function" ? computeProductDueDate({
      parts: lineParts,
      anchor_date: anchorDate,
      hard_due_date: Boolean(line.hard_due_date),
      product_due_date: firstNonBlank(line.product_due_date, priced.product_due_date),
      design_due_date: firstNonBlank(line.design_due_date, priced.design_due_date),
      ...dueOptions
    }) : { due_date: line.product_due_date || "", design_due_date: line.design_due_date || "" };
    const explicitStatus = String(line.operational_status || "").trim();
    const seededStatus = explicitStatus && norm2(explicitStatus) !== "none" ? explicitStatus : INITIAL_OPERATIONAL_STATUS;
    return {
      id: line.builder_product_id || line.line_id || line.project_id || `estimate-product-${index + 1}`,
      description: productName,
      // SIP/production Product Type is an explicit classification selected on
      // the estimator Product. Builder/module names are not interchangeable
      // with the production taxonomy, so never guess a fallback here.
      product_type: line.production_product_type || "",
      estimate_line_id: line.line_id || "",
      builder_product_id: line.builder_product_id || "",
      source_project_id: line.project_id || "",
      module_key: line.module_key || "",
      quantity,
      quoted_unit_price: unitPrice,
      quoted_total: adjustedTotal,
      category: line.product_category || "",
      customer_description: line.customer_description || "",
      estimator_notes: line.product_notes || "",
      operational_status: seededStatus,
      operational_substatus: line.operational_substatus || "",
      // Seeded products get the canonical customer-facing label for their
      // initial status (locked vocabulary first, legacy alias map second);
      // an explicit line value always wins.
      customer_facing_status: firstNonBlank(
        line.customer_facing_status,
        typeof customerFacingLabel === "function" ? customerFacingLabel(seededStatus) : "",
        customerFacingStatusLabel(seededStatus)
      ),
      fulfillment_state: line.fulfillment_state || "none",
      design_due_date: due.design_due_date || "",
      product_due_date: due.due_date || "",
      hard_due_date: Boolean(line.hard_due_date),
      designer: line.designer || "",
      assigned_to: line.assigned_to || "",
      // Responsibility seeds per-line first, then whatever estimate-level
      // default the estimate carries (default_responsibility /
      // sales_responsibility / responsibility), then a caller override.
      responsibility: firstNonBlank(
        line.responsibility,
        estimate.default_responsibility,
        estimate.sales_responsibility,
        estimate.responsibility,
        options?.default_responsibility,
        pricing?.default_responsibility
      ),
      responsibility_color: firstNonBlank(line.responsibility_color, options?.responsibility_color),
      queue_priority: num2(line.queue_priority, 0),
      proof_status: line.proof_status || "none",
      proof_file_url: line.proof_file_url || "",
      proof_file_name: line.proof_file_name || "",
      proof_version: num2(line.proof_version, 0),
      proof_approved_version: num2(line.proof_approved_version, 0)
    };
  });
}
var OPERATIONAL_STATUS_CUSTOMER_LABELS = {
  order_review: "Prepping Your Order",
  site_survey: "Site Survey",
  awaiting_customer_action: "Customer Action Needed",
  awaiting_proof_approval: "Requires Proof Approval",
  permitting: "Permitting",
  proof_approved: "Proof Approved",
  design_review: "In Design",
  in_design: "In Design",
  in_production: "In Production",
  quality_control: "Quality Control",
  service_repair: "Service/Repair",
  install_or_removal_only: "Install or Removal Only",
  vended: "In Production",
  none: ""
};
var OPERATIONAL_STATUS_VALUES = Object.keys(OPERATIONAL_STATUS_CUSTOMER_LABELS);
var PROOF_STATUS_VALUES = ["none", "draft", "sent", "awaiting_approval", "approved", "revision_requested"];
var FULFILLMENT_STATE_VALUES = [
  "none",
  "awaiting_pickup",
  "awaiting_installation",
  "awaiting_shipping",
  "awaiting_delivery",
  "picked_up",
  "installed",
  "shipped",
  "delivered"
];
var PRODUCT_OPERATIONAL_FIELDS = [
  "operational_status",
  "operational_substatus",
  "customer_facing_status",
  "fulfillment_state",
  "design_due_date",
  "product_due_date",
  "hard_due_date",
  "designer",
  "assigned_to",
  "responsibility",
  "queue_priority",
  "proof_status",
  "proof_file_url",
  "proof_file_name",
  "proof_version",
  "proof_approved_version",
  "operational_status_changed_at"
];
function customerFacingStatusLabel(operationalStatus, explicit = "") {
  if (String(explicit || "").trim()) return String(explicit).trim();
  return OPERATIONAL_STATUS_CUSTOMER_LABELS[norm2(operationalStatus)] || "";
}
var requireEnum = (value, allowed, label) => {
  const v = norm2(value) || "none";
  if (!allowed.includes(v)) throw new Error(`Unknown ${label} "${String(value).trim()}".`);
  return v;
};
var requireDateString = (value, label = "due date") => {
  const v = String(value || "").trim();
  if (!v) return "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(v) ? /* @__PURE__ */ new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${label} "${v}".`);
  return v;
};
function buildProductOperationalPatch({
  operationalStatus,
  operationalSubstatus,
  proofStatus,
  fulfillmentState,
  designer,
  assignedTo,
  responsibility,
  queuePriority,
  designDueDate,
  productDueDate,
  hardDueDate,
  proofFileUrl,
  proofFileName,
  proofVersion,
  proofApprovedVersion,
  now
} = {}) {
  const patch = {};
  if (operationalStatus !== void 0) {
    const status = requireEnum(operationalStatus, OPERATIONAL_STATUS_VALUES, "product status");
    patch.operational_status = status;
    patch.customer_facing_status = customerFacingStatusLabel(status);
    patch.operational_status_changed_at = (now ? new Date(now) : /* @__PURE__ */ new Date()).toISOString();
  }
  if (operationalSubstatus !== void 0) patch.operational_substatus = String(operationalSubstatus || "").trim();
  if (proofStatus !== void 0) patch.proof_status = requireEnum(proofStatus, PROOF_STATUS_VALUES, "proof status");
  if (fulfillmentState !== void 0) patch.fulfillment_state = requireEnum(fulfillmentState, FULFILLMENT_STATE_VALUES, "fulfillment state");
  if (designer !== void 0) patch.designer = String(designer || "").trim();
  if (assignedTo !== void 0) patch.assigned_to = String(assignedTo || "").trim();
  if (responsibility !== void 0) patch.responsibility = String(responsibility || "").trim();
  if (queuePriority !== void 0) {
    const n = Number(queuePriority);
    patch.queue_priority = Math.max(0, Math.min(99, Math.round(Number.isFinite(n) ? n : 0)));
  }
  if (designDueDate !== void 0) patch.design_due_date = requireDateString(designDueDate);
  if (productDueDate !== void 0) patch.product_due_date = requireDateString(productDueDate);
  if (hardDueDate !== void 0) patch.hard_due_date = Boolean(hardDueDate);
  if (proofFileUrl !== void 0) patch.proof_file_url = String(proofFileUrl || "").trim();
  if (proofFileName !== void 0) patch.proof_file_name = String(proofFileName || "").trim();
  if (proofVersion !== void 0) {
    const n = Number(proofVersion);
    patch.proof_version = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  }
  if (proofApprovedVersion !== void 0) {
    const n = Number(proofApprovedVersion);
    patch.proof_approved_version = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  }
  return patch;
}
var sameField = (a, b) => {
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a ?? "") === String(b ?? "");
};
function applyProductOperationalPatch(product, patchInput, { now, actor = "", overrideHardDue = false } = {}) {
  const patch = buildProductOperationalPatch({ ...patchInput || {}, now });
  const nowIso = (now ? new Date(now) : /* @__PURE__ */ new Date()).toISOString();
  if (product?.hard_due_date === true && typeof patch.product_due_date === "string" && patch.product_due_date && String(product?.product_due_date || "") && new Date(requireDateString(patch.product_due_date)).getTime() > new Date(requireDateString(product.product_due_date)).getTime() && patch.hard_due_date !== false && !overrideHardDue) {
    throw new Error("This product has a hard due date; moving it later requires an explicit override.");
  }
  if (patch.proof_status === "approved" && patch.operational_status === void 0 && norm2(product?.operational_status) === "awaiting_proof_approval") {
    patch.operational_status = "proof_approved";
    patch.customer_facing_status = customerFacingStatusLabel("proof_approved");
    patch.operational_status_changed_at = nowIso;
  }
  const trackable = [
    "operational_status",
    "operational_substatus",
    "customer_facing_status",
    "proof_status",
    "fulfillment_state",
    "design_due_date",
    "product_due_date",
    "hard_due_date",
    "designer",
    "assigned_to",
    "responsibility",
    "queue_priority",
    "proof_file_url",
    "proof_file_name",
    "proof_version",
    "proof_approved_version"
  ];
  const changed = {};
  for (const field of trackable) {
    if (patch[field] !== void 0 && !sameField(product?.[field], patch[field])) changed[field] = patch[field];
  }
  if (!Object.keys(changed).length) return product;
  const entries = Object.keys(changed).filter((field) => field !== "customer_facing_status").map((field) => ({ at: nowIso, field, from: product?.[field] ?? "", to: changed[field], by: actor }));
  if (changed.operational_status !== void 0) changed.operational_status_changed_at = patch.operational_status_changed_at || nowIso;
  return {
    ...product,
    ...changed,
    status_history: [
      ...Array.isArray(product?.status_history) ? product.status_history : [],
      ...entries
    ].slice(-50)
  };
}
function allProductsOperationallyApproved(products = []) {
  const list = (products || []).filter((product) => product && product.id);
  if (!list.length) return false;
  return list.every((product) => norm2(product.operational_status) === "proof_approved" || norm2(product.proof_status) === "approved");
}
var productKey = (product = {}) => {
  if (product.id) return `id:${product.id}`;
  return `name:${norm2(product.description)}|type:${norm2(product.product_type)}`;
};
function mergeWorkOrderProducts(existingProducts = [], estimateProducts = []) {
  const merged = [...existingProducts || []];
  const keys = new Set(merged.map(productKey));
  for (const product of estimateProducts || []) {
    const key = productKey(product);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(product);
  }
  return merged;
}
function selectExistingEstimateWorkOrder(rows = [], linkedWorkOrderId = "") {
  const activeRows = (rows || []).filter((row) => row?.deleted !== true);
  if (linkedWorkOrderId) {
    const linked = activeRows.find((row) => row.id === linkedWorkOrderId);
    if (linked) return linked;
  }
  return activeRows.slice().sort((a, b) => {
    const aTime = Date.parse(a?.created_date || a?.updated_date || "") || 0;
    const bTime = Date.parse(b?.created_date || b?.updated_date || "") || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}
function convertedWorkOrderStage(existingStage) {
  if (existingStage && !["estimating", "sales"].includes(existingStage)) return existingStage;
  return "sales";
}
var CONVERSION_ACTOR_TYPES = ["staff", "customer", "vendor", "system"];
var conversionActorParts = (actor) => {
  if (actor && typeof actor === "object") {
    const type = CONVERSION_ACTOR_TYPES.includes(norm2(actor.type)) ? norm2(actor.type) : "staff";
    return { type, label: firstNonBlank(actor.label, actor.name, actor.email, actor.display_name) };
  }
  return { type: "staff", label: String(actor ?? "").trim() };
};
function buildConversionEvent({ estimate = {}, workOrder = null, product = null, actor = "", now = "" } = {}) {
  const parsedNow = now ? new Date(now) : null;
  const occurred_at = (parsedNow && !Number.isNaN(parsedNow.getTime()) ? parsedNow : /* @__PURE__ */ new Date()).toISOString();
  const status = String(estimate?.status || "approved").trim().toUpperCase() || "APPROVED";
  const label = `Estimate Converted to Order - via product status (${status})`;
  const who = conversionActorParts(actor);
  const estimateId = String(estimate?.id || "").trim();
  const workOrderId = String(workOrder?.id || "").trim();
  const productId = String(product?.id || "").trim();
  return {
    schema_version: 1,
    // Stable retry-safe receipt — rebuilding the same conversion regenerates
    // the same key, so a persist path honoring creation_request_key and the
    // merge helper below never double-write history.
    creation_request_key: `estimate_conversion:${estimateId || "unknown"}:${workOrderId || "new"}:${productId || "order"}`,
    work_order_id: workOrderId,
    product_id: productId,
    product_label: firstNonBlank(product?.description, product?.client_product_name, product?.product_name),
    event_type: "conversion",
    label,
    actor_type: who.type,
    actor_label: who.label,
    from_value: firstNonBlank(estimate?.estimate_number, estimateId),
    to_value: firstNonBlank(workOrder?.title, workOrderId),
    note: label,
    occurred_at,
    details: {
      source: "estimate_conversion",
      estimate_id: estimateId,
      estimate_number: String(estimate?.estimate_number || ""),
      conversion_status: status,
      estimate_line_id: String(product?.estimate_line_id || ""),
      builder_product_id: String(product?.builder_product_id || "")
    }
  };
}
function buildConversionEvents({ estimate = {}, workOrder = null, products = [], actor = "", now = "" } = {}) {
  const estimateId = String(estimate?.id || "").trim();
  const lineIds = /* @__PURE__ */ new Set();
  const builderProductIds = /* @__PURE__ */ new Set();
  for (const line of estimate?.line_items || []) {
    const lineId = String(line?.line_id || "").trim();
    const builderProductId = String(line?.builder_product_id || "").trim();
    if (lineId) lineIds.add(lineId);
    if (builderProductId) builderProductIds.add(builderProductId);
  }
  const mine = (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || typeof product !== "object") return false;
    if (estimateId && String(product?.source_estimate_id || "").trim() === estimateId) return true;
    if (lineIds.has(String(product?.estimate_line_id || "").trim())) return true;
    if (builderProductIds.has(String(product?.builder_product_id || "").trim())) return true;
    return false;
  });
  if (!mine.length) return [buildConversionEvent({ estimate, workOrder, actor, now })];
  return mine.map((product) => buildConversionEvent({ estimate, workOrder, product, actor, now }));
}
function mergeConversionEvents(existing = [], incoming = []) {
  const merged = [...Array.isArray(existing) ? existing : []];
  const keys = new Set(merged.map((evt) => String(evt?.creation_request_key || "")).filter(Boolean));
  for (const evt of Array.isArray(incoming) ? incoming : []) {
    if (!evt || typeof evt !== "object") continue;
    const key = String(evt?.creation_request_key || "");
    if (key && keys.has(key)) continue;
    if (key) keys.add(key);
    merged.push(evt);
  }
  return merged;
}
function estimateConvertedAmount(estimate = {}, pricing = {}) {
  const priced = num2(pricing?.quoteTotal, NaN);
  if (Number.isFinite(priced)) return priced;
  const quoted = num2(estimate?.quote_total, NaN);
  if (Number.isFinite(quoted) && quoted > 0) return quoted;
  return (estimate?.line_items || []).reduce(
    (sum, l) => sum + acceptedCustomerUnitPrice(l) * Math.max(1, Number(l?.customer_quantity) || 1),
    0
  );
}
function buildConvertedWorkOrderFields({ estimate = {}, pricing = {}, existing = null, products = [], generatedDescription = "", conversionDate = "", verifiedCustomerId = "", actor = "", now = "" } = {}) {
  return {
    title: firstNonBlank(estimate.project_name, existing?.title),
    client_name: firstNonBlank(estimate.client_name, existing?.client_name),
    // Conversion must not revive a stale estimate.customer_id. The caller passes
    // only a Customer ID verified against the live Customer entity.
    customer_id: verifiedCustomerId || "",
    estimate_id: estimate.id || existing?.estimate_id || "",
    // Upstream chain links: the Opportunity workspace and invoice creation
    // aggregate Work Orders by opportunity_id/estimating_request_id — an
    // existing WO keeps its original links when estimates merge into it.
    opportunity_id: firstNonBlank(existing?.opportunity_id, estimate.opportunity_id),
    estimating_request_id: firstNonBlank(existing?.estimating_request_id, estimate.estimating_request_id),
    // Preserve richer sales/production notes already entered on the pipeline lead.
    description: firstNonBlank(existing?.description, generatedDescription),
    current_stage: convertedWorkOrderStage(existing?.current_stage),
    sales_status: "won",
    install_location: firstNonBlank(estimate.site_address, existing?.install_location),
    contact_name: firstNonBlank(estimate.contact_name, estimate.order_contact, existing?.contact_name),
    contact_email: firstNonBlank(estimate.contact_email, existing?.contact_email),
    contact_phone: firstNonBlank(estimate.contact_phone, estimate.office_phone, existing?.contact_phone),
    representative: firstNonBlank(estimate.order_contact, existing?.representative),
    sales_rep: firstNonBlank(estimate.salesperson, existing?.sales_rep),
    estimator: firstNonBlank(estimate.salesperson, existing?.estimator),
    estimate_amount: estimateConvertedAmount(estimate, pricing),
    date_order_created: firstNonBlank(existing?.date_order_created, conversionDate),
    corbridge_invoice_number: firstNonBlank(estimate.estimate_number, existing?.corbridge_invoice_number),
    project_install_date: firstNonBlank(estimate.target_install_date, existing?.project_install_date),
    in_pipeline: true,
    // B-14: order due = max product due date (engine rollup). push_forward_only
    // over the existing date means a merge can push the job later but never
    // pulls it earlier; no product dates echoes the existing date unchanged.
    due_date: (typeof computeOrderDueDate === "function" ? computeOrderDueDate({
      products,
      existing_due_date: existing?.due_date || "",
      hard_due_date: existing?.hard_due_date === true,
      push_forward_only: true,
      label: "estimate_conversion"
    }).due_date : existing?.due_date) || "",
    products,
    // D-06: conversion history events ride the WO payload — ProductActivity-
    // shaped rows a backend/portal write path can persist as the audit trail.
    conversion_events: mergeConversionEvents(
      existing?.conversion_events,
      buildConversionEvents({ estimate, workOrder: existing, products, actor, now })
    )
  };
}
async function transitionProductOperationalStatus({ workOrderId, productId, patch = {}, actor = "", overrideHardDue = false, label = "Product status" } = {}) {
  const targetId = String(productId || "").trim();
  if (!targetId) throw new Error(`${label}: this product has no id. Reopen the Work Order to repair it.`);
  return mutateWorkOrderArrayField({
    workOrderId,
    field: "products",
    label,
    mutate: (products) => {
      const index = products.findIndex((product) => String(product?.id || "") === targetId);
      if (index < 0) throw new Error(`${label}: this product is no longer on the Work Order. Reload and try again.`);
      const next = applyProductOperationalPatch(products[index], patch, { actor, overrideHardDue });
      if (next === products[index]) return products;
      const nextProducts = [...products];
      nextProducts[index] = next;
      return nextProducts;
    }
  });
}
function recalculateProductDueDateOnProofApproval({ product = {}, leadTimeDays = 0, parts, tier, fromDate = /* @__PURE__ */ new Date() } = {}) {
  const explicit = num2(leadTimeDays, 0);
  const hasOverride = explicit > 0;
  const embedded = parts !== void 0 ? parts : product?.parts ?? product?.part_list ?? product?.builder_parts;
  const hasParts = Array.isArray(embedded) && embedded.length > 0;
  const result = recalcOnProofApproval({
    product,
    approval_date: fromDate,
    parts: hasParts ? embedded : hasOverride ? [{ product_lead_days: explicit }] : [],
    tier: tier !== void 0 ? tier : hasOverride && hasParts ? explicit : "standard"
  });
  return result.due_date || product?.product_due_date || "";
}
async function syncBuilderProductOperationalStatus({ builderProductId, fields = null, patch = {}, expectedUpdatedDate = "" } = {}) {
  let apply;
  if (fields && typeof fields === "object") {
    apply = {};
    for (const field of PRODUCT_OPERATIONAL_FIELDS) {
      if (fields[field] !== void 0) apply[field] = fields[field];
    }
  } else {
    apply = buildProductOperationalPatch(patch);
  }
  const id = String(builderProductId || "").trim();
  if (!id || !Object.keys(apply).length) return { synced: false, reason: "nothing_to_apply" };
  const entity = staffEntities?.BuilderProduct;
  if (!entity?.updateMany) return { synced: false, reason: "unavailable" };
  const live = await entity.get(id).catch(() => null);
  if (!live?.id) return { synced: false, reason: "not_found" };
  if (expectedUpdatedDate && String(live.updated_date || "") !== String(expectedUpdatedDate)) {
    return { synced: false, reason: "stale" };
  }
  const result = await entity.updateMany({ id, updated_date: live.updated_date }, { $set: apply }).catch(() => null);
  if (!result || typeof result.updated === "number" && result.updated < 1) return { synced: false, reason: "write_failed" };
  return { synced: true };
}
async function transitionProductAndBuilderStatus({ workOrderId, product, patch = {}, actor = "", overrideHardDue = false, label = "Product status", workOrder = null } = {}) {
  let targetStatus = norm2(patch?.operationalStatus);
  if (!targetStatus && norm2(patch?.proofStatus) === "approved" && norm2(product?.operational_status) === "awaiting_proof_approval") {
    targetStatus = "proof_approved";
  }
  if (targetStatus && DEPOSIT_GATED_STATUSES.has(targetStatus) && targetStatus !== norm2(product?.operational_status)) {
    const woSnapshot = workOrder && typeof workOrder === "object" ? workOrder : await staffEntities.WorkOrder.get(String(workOrderId || "").trim()).catch(() => null);
    if (depositGateApplies(woSnapshot, product, targetStatus) && typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(depositGateMessage(woSnapshot))) {
      throw Object.assign(new Error("Deposit required \xE2\u20AC\u201D the move into production was not applied."), { depositCancelled: true });
    }
  }
  const saved = await transitionProductOperationalStatus({ workOrderId, productId: product?.id, patch, actor, overrideHardDue, label });
  const savedProducts = Array.isArray(saved?.products) ? saved.products : [];
  const savedProduct = savedProducts.find((row) => String(row?.id || "") === String(product?.id || "")) || null;
  let sync = { synced: false, reason: "no_builder_link" };
  if (product?.builder_product_id) {
    sync = await syncBuilderProductOperationalStatus({
      builderProductId: product.builder_product_id,
      fields: savedProduct || {}
    }).catch(() => ({ synced: false, reason: "error" }));
  }
  const previousStatus = String(product?.operational_status || "none").trim() || "none";
  const nextStatus = String(savedProduct?.operational_status || previousStatus).trim() || previousStatus;
  if (saved?.id && savedProduct && previousStatus !== nextStatus) {
    try {
      void NotificationTriggers.productTransition(saved, {
        productId: savedProduct.id || product?.id,
        productDescription: savedProduct.description || product?.description,
        previousStatus,
        newStatus: nextStatus,
        changedBy: actor
      });
    } catch {
    }
  }
  return { workOrder: saved, product: savedProduct, builderSynced: sync.synced === true };
}
export {
  FULFILLMENT_STATE_VALUES,
  INITIAL_OPERATIONAL_STATUS,
  OPERATIONAL_STATUS_CUSTOMER_LABELS,
  OPERATIONAL_STATUS_VALUES,
  PRODUCT_OPERATIONAL_FIELDS,
  PROOF_STATUS_VALUES,
  allProductsOperationallyApproved,
  applyProductOperationalPatch,
  buildConversionEvent,
  buildConversionEvents,
  buildConvertedWorkOrderFields,
  buildEstimateWorkOrderProducts,
  buildProductOperationalPatch,
  convertedWorkOrderStage,
  customerFacingStatusLabel,
  estimateConvertedAmount,
  loadEstimateConversionParts,
  mergeConversionEvents,
  mergeWorkOrderProducts,
  recalculateProductDueDateOnProofApproval,
  resolveEstimateLineParts,
  selectExistingEstimateWorkOrder,
  syncBuilderProductOperationalStatus,
  transitionProductAndBuilderStatus,
  transitionProductOperationalStatus
};
