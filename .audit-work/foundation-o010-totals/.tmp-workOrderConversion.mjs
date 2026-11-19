// .audit-work/foundation-o010-totals/fixture/src/components/estimator/moduleRegistry.js
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

// .audit-work/foundation-o010-totals/fixture/base44/shared/dueDateEngine.ts
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

// .audit-work/foundation-o010-totals/fixture/base44/shared/productStatusModel.ts
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

// .audit-work/foundation-o010-totals/fixture/stubs/workOrderPersistence.mjs
async function mutateWorkOrderArrayField() {
  return null;
}

// .audit-work/foundation-o010-totals/fixture/stubs/notificationService.mjs
var NotificationTriggers = {};

// .audit-work/foundation-o010-totals/fixture/stubs/staffEntities.mjs
var emptyEntity = () => ({
  get: async () => null,
  filter: async () => [],
  list: async () => [],
  create: async (row) => ({ id: "stub", ...row }),
  update: async (_id, row) => row,
  delete: async () => ({})
});
var staffEntities = new Proxy({}, { get: () => emptyEntity() });

// .audit-work/foundation-o010-totals/fixture/stubs/depositGate.mjs
var DEPOSIT_GATED_STATUSES = /* @__PURE__ */ new Set();
function depositGateApplies() {
  return false;
}
function depositGateMessage() {
  return "";
}

// .audit-work/foundation-o010-totals/fixture/base44/shared/pricingEngine.ts
var num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
var normStr = (v) => String(v ?? "").trim().toLowerCase();
var round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
var round4 = (n) => Math.round((num(n) + Number.EPSILON) * 1e4) / 1e4;
var TIER_PRECEDENCE = Object.freeze([
  "global_default",
  "customer_tier",
  "part_tier",
  "part_fixed",
  "machine_override"
]);
var PRICING_MODES = Object.freeze({
  MARKUP: "markup",
  COST_PLUS: "cost_plus",
  MARKET: "market",
  // F-05 activation vocabulary: 'market_based' is the entity/admin spelling of
  // the same retail-minus-discount chart family the engine rows call 'market'
  // (PricingTemplate.market_based, GlobalPricingTier.rules[].market_based).
  // 'fixed' is a pinned unit sell price (part.fixed_price family).
  MARKET_BASED: "market_based",
  FIXED: "fixed"
});
var DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
var toTime = (v, { endOfDay = false } = {}) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const t2 = v.getTime();
    return Number.isFinite(t2) ? t2 : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return endOfDay && DATE_ONLY.test(s) ? t + 86399999 : t;
};
var rowIsActive = (row) => normStr(row?.status ?? "active") !== "inactive";
function rowIsEffective(row, now = /* @__PURE__ */ new Date()) {
  const t = now instanceof Date ? now.getTime() : toTime(now);
  const at = Number.isFinite(t) ? t : Date.now();
  const from = toTime(row?.effective_from);
  const to = toTime(row?.effective_to, { endOfDay: true });
  if (from != null && at < from) return false;
  if (to != null && at > to) return false;
  return true;
}
var tierKeySet = (customerTier) => {
  const keys = /* @__PURE__ */ new Set();
  const add = (v) => {
    const k = normStr(v);
    if (k) keys.add(k);
  };
  if (customerTier && typeof customerTier === "object") {
    const t = customerTier;
    add(t.tier_name);
    add(t.tier_number);
    add(t.id);
    add(t.name);
  } else {
    add(customerTier);
  }
  return keys;
};
var rowPinsTier = (row, tierKeys) => !!normStr(row?.customer_tier) && tierKeys.has(normStr(row?.customer_tier));
var rowFitsCategory = (row, category) => !normStr(row?.category) || normStr(row?.category) === normStr(category);
var newerRow = (a, b) => {
  if (!b) return a;
  const aFrom = toTime(a?.effective_from) ?? -Infinity;
  const bFrom = toTime(b?.effective_from) ?? -Infinity;
  if (aFrom !== bFrom) return aFrom > bFrom ? a : b;
  const aUp = toTime(a?.updated_date) ?? -Infinity;
  const bUp = toTime(b?.updated_date) ?? -Infinity;
  if (aUp !== bUp) return aUp > bUp ? a : b;
  return String(a?.id || "") <= String(b?.id || "") ? a : b;
};
function pickUnitBreak(breaks, qty, opts = {}) {
  const q = num(qty);
  if (!Array.isArray(breaks) || q <= 0) return null;
  if (opts && opts.interpolate === true) return interpolateUnitBreak(breaks, q);
  let pick = null;
  for (const b of breaks) {
    const bq = num(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > q) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    if (!pick || bq > num(pick.qty)) pick = b;
  }
  return pick;
}
var sortedUnitBreaks = (breaks) => {
  const list = [];
  for (const b of Array.isArray(breaks) ? breaks : []) {
    const bq = num(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    list.push(b);
  }
  list.sort((a, b) => num(a.qty) - num(b.qty));
  return list.filter((b, i) => i === 0 || num(b.qty) !== num(list[i - 1].qty));
};
function interpolateUnitBreak(breaks, qty) {
  const q = num(qty);
  const list = sortedUnitBreaks(breaks);
  if (!list.length || q <= 0 || q < num(list[0].qty)) return null;
  const last = list[list.length - 1];
  if (q >= num(last.qty)) return last;
  let lower = list[0];
  let upper = last;
  for (let i = 0; i < list.length - 1; i += 1) {
    if (q < num(list[i + 1].qty)) {
      lower = list[i];
      upper = list[i + 1];
      break;
    }
  }
  if (q === num(lower.qty)) return lower;
  const loQ = num(lower.qty);
  const hiQ = num(upper.qty);
  const loP = num(lower.unit_price);
  const hiP = num(upper.unit_price);
  const t = (q - loQ) / (hiQ - loQ);
  return {
    qty: loQ,
    unit_price: round4(loP + (hiP - loP) * t),
    interpolated: true,
    at_qty: q,
    between: [lower, upper]
  };
}
function applyFormulaModifiers(unitPrice, modifiers) {
  let price = num(unitPrice);
  const applied = [];
  for (const m of Array.isArray(modifiers) ? modifiers : []) {
    const type = normStr(m?.type);
    const value = Number(m?.value);
    if (!Number.isFinite(value)) continue;
    const before = price;
    if (type === "add_pct") price = price * (1 + value / 100);
    else if (type === "mul") price = price * value;
    else if (type === "add_flat") price = price + value;
    else if (type === "min") price = Math.max(price, value);
    else if (type === "max") price = Math.min(price, value);
    else continue;
    price = Math.max(0, price);
    applied.push({ type, value, before: round4(before), after: round4(price) });
  }
  return { unitPrice: round4(price), applied };
}
var marketKind = (row) => {
  const pm = normStr(row?.pricing_mode);
  return (pm === PRICING_MODES.MARKET || pm === PRICING_MODES.MARKET_BASED) && Number.isFinite(Number(row?.market_retail)) && Number(row?.market_retail) > 0;
};
var wantsInterpolatedBreaks = (src) => {
  if (!src || typeof src !== "object") return false;
  if (normStr(src.break_interpolation) === "linear") return true;
  for (const f of ["interpolate_breaks", "interpolateBreaks", "interpolate"]) {
    const v = src[f];
    if (v === true || normStr(v) === "true" || normStr(v) === "linear") return true;
  }
  return false;
};
function ruleFromChartRow(row) {
  return {
    kind: marketKind(row) ? "market" : "markup",
    markupPct: num(row?.markup_pct),
    marketRetail: marketKind(row) ? num(row?.market_retail) : void 0,
    marketDiscountPct: marketKind(row) ? num(row?.market_discount_pct) : void 0,
    unitBreaks: Array.isArray(row?.per_unit_breaks) ? row.per_unit_breaks : void 0,
    interpolateBreaks: wantsInterpolatedBreaks(row) || void 0,
    minimumCharge: Number.isFinite(Number(row?.minimum_charge)) ? num(row.minimum_charge) : void 0,
    formulaModifiers: Array.isArray(row?.formula_modifiers) ? row.formula_modifiers : void 0,
    ref: row
  };
}
var firstFinite = (...vals) => {
  for (const v of vals) if (Number.isFinite(Number(v))) return Number(v);
  return null;
};
var markupField = (src) => firstFinite(src?.markup_pct, src?.markup, src?.markup_percent);
function overrideRule(source, tierRules) {
  if (!source || typeof source !== "object") return null;
  const fixed = firstFinite(source.fixed_price, source.price_override, source.override_price);
  if (fixed != null && fixed > 0) {
    return {
      kind: "fixed",
      fixedPrice: fixed,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  const tierRef = source.tier_ref ?? source.tier ?? source.tier_name;
  if (tierRef != null && normStr(tierRef)) {
    const wanted = normStr(typeof tierRef === "object" ? tierRef.name ?? tierRef.id : tierRef);
    const row = (Array.isArray(tierRules) ? tierRules : []).find(
      (r) => r && rowIsActive(r) && (normStr(r.name) === wanted || normStr(r.id) === wanted)
    );
    if (row) return ruleFromChartRow(row);
    return { kind: "markup", markupPct: 0, ref: source, danglingTierRef: String(wanted) };
  }
  const breaks = Array.isArray(source.per_unit_breaks) ? source.per_unit_breaks : Array.isArray(source.unit_breaks) ? source.unit_breaks : null;
  if (breaks && breaks.length) {
    return {
      kind: "breaks",
      unitBreaks: breaks,
      interpolateBreaks: wantsInterpolatedBreaks(source) || void 0,
      markupPct: markupField(source) ?? void 0,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  if (marketKind(source)) {
    return {
      kind: "market",
      marketRetail: num(source.market_retail),
      marketDiscountPct: num(source.market_discount_pct),
      unitBreaks: Array.isArray(source.per_unit_breaks) ? source.per_unit_breaks : void 0,
      interpolateBreaks: wantsInterpolatedBreaks(source) || void 0,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  const markup = markupField(source);
  if (markup != null) {
    return {
      kind: "markup",
      markupPct: markup,
      interpolateBreaks: wantsInterpolatedBreaks(source) || void 0,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  return null;
}
function resolveTier({
  customerTier = null,
  category = "",
  tierRules = [],
  part = null,
  machine = null,
  defaultMarkupPct = 0,
  now = void 0
} = {}) {
  const rules = Array.isArray(tierRules) ? tierRules : [];
  const tierKeys = tierKeySet(customerTier);
  const eligible = rules.filter((r) => r && rowIsActive(r) && rowIsEffective(r, now) && rowFitsCategory(r, category));
  let tierRow = null;
  let tierRowScoped = false;
  for (const row of eligible) {
    if (!rowPinsTier(row, tierKeys)) continue;
    const scoped = !!normStr(row.category);
    if (!tierRow || scoped && !tierRowScoped || scoped === tierRowScoped) {
      if (!tierRow || scoped && !tierRowScoped) {
        tierRow = row;
        tierRowScoped = scoped;
      } else tierRow = newerRow(row, tierRow);
    }
  }
  let catRow = null;
  let blankRow = null;
  for (const row of eligible) {
    if (normStr(row.customer_tier)) continue;
    if (normStr(row.category)) catRow = newerRow(row, catRow);
    else blankRow = newerRow(row, blankRow);
  }
  const partRule = overrideRule(part, rules);
  const partSource = partRule?.kind === "fixed" ? "part_fixed" : "part_tier";
  const machineRule = overrideRule(machine, rules);
  const defaultRule = catRow || blankRow ? ruleFromChartRow(catRow || blankRow) : { kind: "markup", markupPct: num(defaultMarkupPct), ref: null, implicit: true };
  const ladder = [
    {
      layer: "global_default",
      source: "global_default",
      rule: defaultRule,
      hit: true,
      detail: catRow ? "category_row" : blankRow ? "blank_row" : "default_markup_pct"
    },
    {
      layer: "customer_tier",
      source: "customer_tier",
      rule: tierRow ? ruleFromChartRow(tierRow) : null,
      hit: !!tierRow,
      detail: tierRow ? tierRowScoped ? "category+tier" : "tier" : "no tier row"
    },
    {
      layer: "part",
      source: partSource,
      rule: partRule,
      hit: !!partRule,
      detail: partRule ? partRule.kind : "no part override"
    },
    {
      layer: "machine",
      source: "machine_override",
      rule: machineRule,
      hit: !!machineRule,
      detail: machineRule ? machineRule.kind : "no machine override"
    }
  ];
  const tierRowSpec = tierRow ? tierRowScoped ? 3 : 1 : -1;
  const defaultRowSpec = catRow ? 2 : blankRow ? 0 : -1;
  let winner = tierRowSpec > defaultRowSpec ? ladder[1] : ladder[0];
  for (const step of ladder.slice(2)) if (step.hit && step.rule) winner = step;
  return {
    source: winner.source,
    layer: winner.layer,
    rule: winner.rule,
    matchedRow: winner.rule?.ref ?? null,
    trace: ladder.map((step) => ({
      layer: step.layer,
      source: step.source,
      hit: step.hit,
      won: step === winner,
      detail: step.detail
    }))
  };
}
function pricePart(input = {}) {
  const qty = num(input.qty ?? input.quantity, 0);
  const unitCost = num(input.unitCost ?? input.cost ?? input.costBase);
  const tier = resolveTier(input);
  const rule = tier.rule || { kind: "markup", markupPct: 0 };
  let unitPrice = 0;
  let priceSource = "cost_passthrough";
  let breakApplied = null;
  let market = null;
  const breaks = Array.isArray(rule.unitBreaks) ? rule.unitBreaks : null;
  const brk = breaks ? pickUnitBreak(breaks, qty, { interpolate: rule.interpolateBreaks === true }) : null;
  if (rule.kind === "fixed") {
    unitPrice = num(rule.fixedPrice);
    priceSource = "fixed_price";
  } else if (rule.kind === "market") {
    const retail = num(rule.marketRetail);
    const discountPct = num(rule.marketDiscountPct);
    const marketUnit2 = Math.max(0, retail * (1 - discountPct / 100));
    if (brk && num(brk.unit_price) < marketUnit2) {
      unitPrice = num(brk.unit_price);
      priceSource = "qty_break";
      breakApplied = brk;
    } else {
      unitPrice = marketUnit2;
      priceSource = "market";
    }
    market = { marketRetail: retail, marketDiscountPct: discountPct, marketUnit: round4(marketUnit2) };
  } else if (rule.kind === "breaks") {
    if (brk) {
      unitPrice = num(brk.unit_price);
      priceSource = "qty_break";
      breakApplied = brk;
    } else {
      unitPrice = unitCost * (1 + num(rule.markupPct) / 100);
      priceSource = Number.isFinite(Number(rule.markupPct)) ? "markup" : "cost_passthrough";
    }
  } else {
    if (brk) {
      unitPrice = num(brk.unit_price);
      priceSource = "qty_break";
      breakApplied = brk;
    } else {
      unitPrice = unitCost * (1 + num(rule.markupPct) / 100);
      priceSource = "markup";
    }
  }
  const baseUnitPrice = unitPrice;
  const ruleMods = Array.isArray(rule.formulaModifiers) ? rule.formulaModifiers : [];
  const ruleModKeys = new Set(ruleMods.map((m) => `${normStr(m?.type)}|${Number(m?.value)}`));
  const callerMods = (Array.isArray(input.modifiers) ? input.modifiers : []).filter((m) => !ruleModKeys.has(`${normStr(m?.type)}|${Number(m?.value)}`));
  const modResult = applyFormulaModifiers(unitPrice, [...ruleMods, ...callerMods]);
  unitPrice = modResult.unitPrice;
  const extension = round2(unitPrice * qty);
  const ruleMin = num(rule.minimumCharge);
  const callerMin = num(input.minimumCharge);
  const minimumCharge = Math.max(ruleMin, callerMin);
  const minimumApplied = minimumCharge > 0 && extension > 0 && extension < minimumCharge;
  const extended = minimumApplied ? round2(minimumCharge) : extension;
  const setupFee = Math.max(0, num(input.setupFee ?? input.setup_fee));
  const subtotal = round2(extended + setupFee);
  const taxable = input.taxable !== false;
  const taxPercent = Math.max(0, num(input.taxPercent ?? input.tax_percent));
  const tax = taxable ? round2(subtotal * (taxPercent / 100)) : 0;
  const total = round2(subtotal + tax);
  return {
    label: String(input.label ?? ""),
    category: String(input.category ?? ""),
    pricingUnit: String(input.pricingUnit ?? input.pricing_unit ?? "each"),
    qty,
    unitCost,
    tier,
    rule,
    baseUnitPrice: round4(baseUnitPrice),
    unitPrice: round4(unitPrice),
    priceSource,
    breakApplied,
    market,
    modifiersApplied: modResult.applied,
    extension,
    minimumCharge: minimumCharge > 0 ? minimumCharge : 0,
    minimumApplied,
    extended,
    setupFee,
    subtotal,
    taxable,
    taxPercent,
    tax,
    total,
    danglingTierRef: rule.danglingTierRef || null
  };
}
var MODE_TOKENS = {
  fixed: PRICING_MODES.FIXED,
  fixed_price: PRICING_MODES.FIXED,
  flat: PRICING_MODES.FIXED,
  market: PRICING_MODES.MARKET_BASED,
  market_based: PRICING_MODES.MARKET_BASED,
  "market-based": PRICING_MODES.MARKET_BASED,
  retail: PRICING_MODES.MARKET_BASED,
  retail_minus_discount: PRICING_MODES.MARKET_BASED,
  cost_plus: PRICING_MODES.COST_PLUS,
  "cost-plus": PRICING_MODES.COST_PLUS,
  costplus: PRICING_MODES.COST_PLUS,
  markup: PRICING_MODES.COST_PLUS,
  tier: PRICING_MODES.COST_PLUS,
  tier_markup: PRICING_MODES.COST_PLUS,
  tiered: PRICING_MODES.COST_PLUS
};

// .audit-work/foundation-o010-totals/fixture/base44/shared/pricingTemplateModel.ts
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString = (v) => v === null || v === void 0 ? "" : String(v).trim();
var toFiniteNumber = (v) => {
  if (v === null || v === void 0 || v === "" || typeof v === "object" || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num2 = (v, fallback = 0) => toFiniteNumber(v) ?? fallback;
var lc = (v) => asString(v).toLowerCase();
var round22 = (n) => Math.round((num2(n) + Number.EPSILON) * 100) / 100;
var round42 = (n) => Math.round((num2(n) + Number.EPSILON) * 1e4) / 1e4;
var firstField = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite2 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    const n = toFiniteNumber(rec[f]);
    if (n !== null) return n;
  }
  return null;
};
var scopedFinite = (part, fields) => {
  if (!part) return null;
  return firstFinite2(part, fields) ?? firstFinite2(isRecord(part.detail_overrides) ? part.detail_overrides : null, fields) ?? firstFinite2(isRecord(part.pricing_basis_snapshot) ? part.pricing_basis_snapshot : null, fields);
};
var BREAK_QTY_FIELDS = [
  "qty",
  "min_qty",
  "qty_from",
  "from_qty",
  "min_quantity",
  "quantity",
  "break_qty",
  "threshold"
];
var TIER_MAP_FIELDS = [
  "tier_markups",
  "tierMarkups",
  "tier_margins",
  "tierMargins",
  "tiers"
];
var UNIT_PRICE_FIELDS = ["unit_price", "price", "sell_price", "rate"];
var MARKUP_FIELDS = ["markup_pct", "markup", "markup_percent"];
var DISCOUNT_FIELDS = ["discount_pct", "discount", "discount_percent", "pct_off"];
var RETAIL_FIELDS = ["market_retail", "retail", "retail_price", "list_price"];
var RETAIL_DISCOUNT_FIELDS = ["market_discount_pct", "retail_discount_pct"];
var MIN_CHARGE_FIELDS = ["minimum_charge", "min_charge", "minimum"];
var CHART_FIELDS = ["breaks", "rows", "margin_rows", "brackets", "chart"];
var PART_TEMPLATE_ID_FIELDS = [
  "pricing_template_id",
  "template_id",
  "margin_template_id"
];
var PART_TEMPLATE_NAME_FIELDS = [
  "pricing_template_name",
  "template_name"
];
var PART_TEMPLATE_EMBED_FIELDS = ["pricing_template", "template"];
var PART_TIER_SET_FIELDS = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id"
];
var PART_TIER_SET_NAME_FIELDS = [
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var PART_FIXED_FIELDS = [
  "fixed_price",
  "price_override",
  "override_price",
  "flat_price"
];
var PART_BREAK_FIELDS = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var PART_MARKET_RETAIL_FIELDS = RETAIL_FIELDS;
var PART_MARKET_DISCOUNT_FIELDS = ["market_discount_pct", "retail_discount_pct", "discount_pct"];
var PART_MARKUP_FIELDS = ["markup_pct", "markup", "markup_percent"];
var PART_MIN_CHARGE_FIELDS = ["min_charge", "minimum_charge", "minimum"];
var PART_UNIT_FIELDS = [
  "unit",
  "pricing_unit",
  "pricingUnit",
  "unit_category",
  "uom",
  "unit_of_measure"
];
var TEMPLATE_MODE_FIELDS = ["pricing_mode", "price_mode", "mode"];
var MARKET_MODE_TOKENS = /* @__PURE__ */ new Set(["market", "market_based", "market-based", "retail", "retail_minus_discount"]);
var normalizeTierKey = (v) => {
  if (v === null || v === void 0) return "";
  if (typeof v === "object") return "";
  const s = lc(v);
  if (!s) return "";
  const n = Number(s);
  if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(s)) return String(n);
  return s;
};
var tierKeysOf = (tier) => {
  const keys = /* @__PURE__ */ new Set();
  const add = (v) => {
    const k = normalizeTierKey(v);
    if (k) keys.add(k);
  };
  if (isRecord(tier)) {
    for (const f of ["tier_number", "tier_name", "name", "id", "tier", "key"]) add(tier[f]);
  } else {
    add(tier);
  }
  return keys;
};
var chartRows = (raw) => {
  for (const f of CHART_FIELDS) {
    if (Array.isArray(raw[f])) return raw[f];
  }
  return [];
};
var normalizeTierMarkups = (raw, warnings, rowIdx) => {
  const src = firstField(raw, TIER_MAP_FIELDS);
  const out = {};
  if (src === void 0) return out;
  if (!isRecord(src)) {
    warnings.push(`break ${rowIdx + 1}: tier_markups is not an object \u2014 ignored`);
    return out;
  }
  for (const [k, v] of Object.entries(src)) {
    const n = toFiniteNumber(v);
    if (n === null) {
      warnings.push(`break ${rowIdx + 1}: tier_markups["${k}"] is not a number \u2014 dropped`);
      continue;
    }
    out[k] = n;
  }
  return out;
};
var normalizeBreak = (raw, index, warnings) => {
  if (!isRecord(raw)) {
    warnings.push(`break ${index + 1}: non-object row rejected`);
    return null;
  }
  const qtyField = BREAK_QTY_FIELDS.find((f) => raw[f] !== void 0 && raw[f] !== null && raw[f] !== "");
  if (qtyField !== void 0) {
    const q = toFiniteNumber(raw[qtyField]);
    if (q === null || q < 0) {
      warnings.push(`break ${index + 1}: ${qtyField} '${asString(raw[qtyField])}' is not a non-negative number \u2014 row rejected`);
      return null;
    }
  }
  const qty = qtyField !== void 0 ? num2(raw[qtyField]) : 0;
  const tier_markups = normalizeTierMarkups(raw, warnings, index);
  const unit_price = firstFinite2(raw, UNIT_PRICE_FIELDS);
  const markup_pct = firstFinite2(raw, MARKUP_FIELDS);
  const discount_pct = firstFinite2(raw, DISCOUNT_FIELDS);
  const market_retail = firstFinite2(raw, RETAIL_FIELDS);
  const market_discount_pct = firstFinite2(raw, RETAIL_DISCOUNT_FIELDS);
  const minimum_charge = firstFinite2(raw, MIN_CHARGE_FIELDS);
  const hasContent = Object.keys(tier_markups).length > 0 || unit_price !== null || markup_pct !== null || discount_pct !== null || market_retail !== null;
  if (!hasContent) {
    warnings.push(`break ${index + 1}: no usable pricing content \u2014 row rejected`);
    return null;
  }
  return {
    qty,
    tier_markups,
    unit_price,
    markup_pct,
    discount_pct,
    market_retail,
    market_discount_pct,
    minimum_charge,
    index,
    raw
  };
};
var templateIsMarketBased = (raw) => {
  if (raw.market_based === true || lc(raw.market_based) === "true") return true;
  for (const f of TEMPLATE_MODE_FIELDS) {
    if (MARKET_MODE_TOKENS.has(lc(raw[f]))) return true;
  }
  return false;
};
function normalizePricingTemplate(raw) {
  if (!isRecord(raw)) return null;
  const warnings = [];
  const rows = chartRows(raw);
  const breaks = [];
  let rejected = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const b = normalizeBreak(rows[i], i, warnings);
    if (b === null) rejected += 1;
    else breaks.push(b);
  }
  breaks.sort((a, b) => a.qty - b.qty || a.index - b.index);
  const status = asString(raw.status) || "active";
  return {
    id: asString(raw.id ?? raw.template_id),
    name: asString(raw.name),
    unit_category: asString(raw.unit_category ?? raw.unitCategory),
    breaks,
    market_based: templateIsMarketBased(raw),
    status,
    active: lc(status) !== "inactive",
    sort: num2(raw.sort ?? raw.sort_order),
    description: asString(raw.description),
    unit_price: firstFinite2(raw, UNIT_PRICE_FIELDS),
    markup_pct: firstFinite2(raw, MARKUP_FIELDS),
    discount_pct: firstFinite2(raw, DISCOUNT_FIELDS),
    market_retail: firstFinite2(raw, RETAIL_FIELDS),
    market_discount_pct: firstFinite2(raw, RETAIL_DISCOUNT_FIELDS),
    minimum_charge: firstFinite2(raw, MIN_CHARGE_FIELDS),
    rejected_breaks: rejected,
    warnings,
    raw
  };
}
var recordLooksLikeTemplate = (v) => isRecord(v) && (Array.isArray(v.breaks) || Array.isArray(v.rows) || Array.isArray(v.margin_rows) || Array.isArray(v.brackets) || Array.isArray(v.chart));
function templateRefForPart(part) {
  const p = isRecord(part) ? part : null;
  if (!p) return null;
  let embedded = null;
  for (const f of PART_TEMPLATE_EMBED_FIELDS) {
    if (recordLooksLikeTemplate(p[f])) {
      embedded = p[f];
      break;
    }
  }
  for (const f of PART_TEMPLATE_ID_FIELDS) {
    const v = asString(p[f]);
    if (v) return { ref: v, via: f, embedded };
  }
  for (const f of PART_TEMPLATE_NAME_FIELDS) {
    const v = asString(p[f]);
    if (v) return { ref: v, via: f, embedded };
  }
  for (const f of PART_TEMPLATE_EMBED_FIELDS) {
    const v = p[f];
    if (isRecord(v)) {
      const inner = asString(v.id ?? v.name ?? v.template_id);
      if (inner) return { ref: inner, via: `${f}.id`, embedded: embedded ?? v };
    } else {
      const s = asString(v);
      if (s) return { ref: s, via: f, embedded };
    }
  }
  if (embedded) return { ref: asString(embedded.id ?? embedded.name), via: "embedded", embedded };
  return null;
}
var templateIds = (t) => {
  const keys = /* @__PURE__ */ new Set();
  for (const k of [t.id, t.template_id]) {
    const s = lc(k);
    if (s) keys.add(s);
  }
  return keys;
};
function templateForPart(part, templates = []) {
  const ref = templateRefForPart(part);
  if (!ref) return null;
  const list = Array.isArray(templates) ? templates.filter(isRecord) : isRecord(templates) && Array.isArray(templates.rows) ? templates.rows.filter(isRecord) : isRecord(templates) && Array.isArray(templates.templates) ? templates.templates.filter(isRecord) : isRecord(templates) ? [templates] : [];
  const wanted = lc(ref.ref);
  if (wanted) {
    const idHit = list.find((t) => templateIds(t).has(wanted));
    if (idHit) return idHit;
    const nameHits = list.filter((t) => lc(t.name) === wanted);
    if (nameHits.length) {
      nameHits.sort((a, b) => {
        const aAct = lc(a.status ?? "active") !== "inactive" ? 0 : 1;
        const bAct = lc(b.status ?? "active") !== "inactive" ? 0 : 1;
        return aAct - bAct || num2(a.sort) - num2(b.sort) || String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
      return nameHits[0];
    }
  }
  return ref.embedded ?? null;
}
var tierMarkupsHit = (map, tierKeys) => {
  for (const [k, v] of Object.entries(map)) {
    if (tierKeys.has(lc(k)) && Number.isFinite(Number(v))) {
      return { key: k, value: Number(v), match: "exact" };
    }
  }
  for (const fallback of ["default", "*"]) {
    for (const [k, v] of Object.entries(map)) {
      if (lc(k) === fallback && Number.isFinite(Number(v))) {
        return { key: k, value: Number(v), match: "default" };
      }
    }
  }
  const entries = Object.entries(map);
  if (entries.length === 1 && Number.isFinite(Number(entries[0][1]))) {
    return { key: entries[0][0], value: Number(entries[0][1]), match: "lone" };
  }
  return null;
};
var marketUnit = (retail, discountPct) => Math.max(0, retail * (1 - num2(discountPct) / 100));
var bracketPrice = (b, tmpl, tierKeys, base) => {
  const tierHit = tierMarkupsHit(b.tier_markups, tierKeys);
  const pct_source = tierHit ? tierHit.match === "exact" ? "tier_markups" : tierHit.match === "default" ? "tier_markups_default" : "tier_markups_lone" : null;
  const matched_tier = tierHit ? { key: tierHit.key, value: tierHit.value } : null;
  if (tmpl.market_based) {
    if (tierHit && tierHit.value > 0) {
      const disc = b.market_discount_pct ?? b.discount_pct ?? tmpl.market_discount_pct;
      return {
        unit: marketUnit(tierHit.value, disc),
        pct_source,
        pricing_mode: "market_based",
        markup_pct: null,
        discount_pct: disc ?? 0,
        market_retail: tierHit.value,
        market_discount_pct: num2(disc),
        matched_tier,
        detail: `tier retail ${tierHit.key}`
      };
    }
    const rowRetail = b.market_retail !== null && b.market_retail > 0 ? b.market_retail : null;
    const tmplRetail = tmpl.market_retail !== null && tmpl.market_retail > 0 ? tmpl.market_retail : null;
    const retail = rowRetail ?? tmplRetail;
    if (retail !== null) {
      const disc = b.market_discount_pct ?? b.discount_pct ?? tmpl.market_discount_pct;
      return {
        unit: marketUnit(retail, disc),
        pct_source: "market_retail",
        pricing_mode: "market_based",
        markup_pct: null,
        discount_pct: disc ?? 0,
        market_retail: retail,
        market_discount_pct: num2(disc),
        matched_tier,
        detail: rowRetail !== null ? "row market_retail" : "template market_retail"
      };
    }
    if (b.markup_pct !== null) {
      return {
        unit: base * (1 + b.markup_pct / 100),
        pct_source: "markup_pct",
        pricing_mode: "markup",
        markup_pct: b.markup_pct,
        discount_pct: null,
        market_retail: null,
        market_discount_pct: null,
        matched_tier,
        detail: "market chart markup fallback"
      };
    }
    if (b.unit_price !== null) {
      return {
        unit: b.unit_price,
        pct_source: "unit_price",
        pricing_mode: "fixed",
        markup_pct: null,
        discount_pct: null,
        market_retail: null,
        market_discount_pct: null,
        matched_tier,
        detail: "bracket unit_price"
      };
    }
    if (b.discount_pct !== null) {
      return {
        unit: Math.max(0, base * (1 - b.discount_pct / 100)),
        pct_source: "discount_pct",
        pricing_mode: "market_based",
        markup_pct: null,
        discount_pct: b.discount_pct,
        market_retail: null,
        market_discount_pct: b.discount_pct,
        matched_tier,
        detail: "market chart discount off base"
      };
    }
    return null;
  }
  if (tierHit) {
    return {
      unit: base * (1 + tierHit.value / 100),
      pct_source,
      pricing_mode: "markup",
      markup_pct: tierHit.value,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: `tier markup ${tierHit.key}=${tierHit.value}`
    };
  }
  if (b.unit_price !== null) {
    return {
      unit: b.unit_price,
      pct_source: "unit_price",
      pricing_mode: "fixed",
      markup_pct: null,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: "bracket unit_price"
    };
  }
  if (b.markup_pct !== null) {
    return {
      unit: base * (1 + b.markup_pct / 100),
      pct_source: "markup_pct",
      pricing_mode: "markup",
      markup_pct: b.markup_pct,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: "bracket markup_pct"
    };
  }
  if (b.discount_pct !== null) {
    return {
      unit: Math.max(0, base * (1 - b.discount_pct / 100)),
      pct_source: "discount_pct",
      pricing_mode: "markup",
      markup_pct: null,
      discount_pct: b.discount_pct,
      market_retail: null,
      market_discount_pct: b.discount_pct,
      matched_tier,
      detail: "bracket discount off base"
    };
  }
  return null;
};
var pickTemplateBreak = (tmpl, qty, tierKeys, base) => {
  let pick = null;
  for (const b of tmpl.breaks) {
    if (b.qty > qty) continue;
    const price = bracketPrice(b, tmpl, tierKeys, base);
    if (price === null) continue;
    if (!pick || b.qty > pick.bracket.qty) pick = { bracket: b, price };
  }
  return pick;
};
var isRuleSet = (v) => isRecord(v) && Array.isArray(v.rules);
var ruleSetIds = (set) => {
  const keys = /* @__PURE__ */ new Set();
  for (const k of [set.id, set.name]) {
    const s = lc(k);
    if (s) keys.add(s);
  }
  return keys;
};
var partTierSetRefs = (part) => {
  const refs = [];
  for (const f of [...PART_TIER_SET_FIELDS, ...PART_TIER_SET_NAME_FIELDS]) {
    const v = asString(part[f]);
    if (v) refs.push(v);
  }
  return refs;
};
var tierRuleSetHit = (part, ruleSets, tierKeys, base) => {
  const refs = partTierSetRefs(part).map(lc);
  if (!refs.length) return null;
  for (const wanted of refs) {
    for (const set of ruleSets) {
      if (lc(set.status ?? "active") === "inactive") continue;
      if (!ruleSetIds(set).has(wanted)) continue;
      for (const rule of Array.isArray(set.rules) ? set.rules : []) {
        if (!isRecord(rule)) continue;
        const pin = lc(rule.tier ?? rule.customer_tier);
        const pinned = pin && (tierKeys.has(pin) || pin === "*" || pin === "default");
        if (!pinned) continue;
        const pct = toFiniteNumber(rule.markup_pct);
        if (pct === null) continue;
        return {
          unit: base * (1 + pct / 100),
          markup_pct: pct,
          set,
          rule
        };
      }
    }
  }
  return null;
};
var partChartBreaks = (part) => {
  for (const f of PART_BREAK_FIELDS) {
    if (Array.isArray(part[f])) return part[f];
  }
  return [];
};
var pickPartUnitBreak = (breaks, qty) => {
  let pick = null;
  for (const b of breaks) {
    if (!isRecord(b)) continue;
    const bq = num2(b.qty ?? b.min_qty ?? b.quantity, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > qty) continue;
    if (!Number.isFinite(Number(b.unit_price ?? b.price))) continue;
    if (!pick || bq > num2(pick.qty ?? pick.min_qty ?? pick.quantity)) pick = b;
  }
  return pick;
};
function resolveTemplatePrice(input = {}) {
  const args = isRecord(input) ? input : {};
  const part = isRecord(args.part) ? args.part : {};
  const qty = num2(args.qty ?? args.quantity);
  const base = num2(firstField(args, ["base_price", "basePrice", "unit_cost", "unitCost", "cost", "costBase", "cost_base"]) ?? 0);
  const warnings = [];
  const tierValue = firstField(args, ["tier", "customer_tier", "customerTier"]);
  const tiersArg = args.tiers;
  const tierCatalog = Array.isArray(tiersArg) ? tiersArg : [];
  const bareTier = tierValue ?? (!Array.isArray(tiersArg) && !isRecord(tiersArg) ? tiersArg : null);
  const tierKeys = tierKeysOf(
    bareTier !== null && bareTier !== void 0 ? bareTier : isRecord(tiersArg) ? tiersArg : null
  );
  for (const row of tierCatalog) {
    if (!isRecord(row) || isRuleSet(row)) continue;
    const rowKeys = tierKeysOf(row);
    let shared = false;
    for (const k of rowKeys) if (tierKeys.has(k)) {
      shared = true;
      break;
    }
    if (shared) for (const k of rowKeys) tierKeys.add(k);
  }
  const ruleSets = tierCatalog.filter(isRuleSet);
  const ref = templateRefForPart(part);
  const templatePool = Array.isArray(args.templates) ? args.templates : isRecord(args.templates) && Array.isArray(args.templates.rows) ? args.templates.rows : isRecord(args.templates) && Array.isArray(args.templates.templates) ? args.templates.templates : isRecord(args.templates) ? [args.templates] : [];
  let rawTemplate = null;
  let templateVia = "";
  if (isRecord(args.template)) {
    rawTemplate = args.template;
    templateVia = "opts.template";
  } else if (args.template !== void 0 && args.template !== null && asString(args.template)) {
    const wanted = lc(args.template);
    rawTemplate = templatePool.filter(isRecord).find(
      (t) => templateIds(t).has(wanted) || lc(t.name) === wanted
    ) ?? null;
    templateVia = "opts.template";
  } else if (ref) {
    rawTemplate = templateForPart(part, templatePool);
    templateVia = ref.via;
  }
  const tmpl = rawTemplate ? normalizePricingTemplate(rawTemplate) : null;
  if (tmpl) warnings.push(...tmpl.warnings);
  const templateId = tmpl ? tmpl.id || asString(rawTemplate?.name) || asString(ref?.ref) : null;
  const partUnit = lc(firstField(part, PART_UNIT_FIELDS));
  const unitCategory = tmpl ? lc(tmpl.unit_category) : "";
  const unitMismatch = !!tmpl && !!unitCategory && !!partUnit && partUnit !== unitCategory;
  const unitUnverified = !!tmpl && !!unitCategory && !partUnit;
  const chain = [];
  let won = false;
  const record = (layer, hit, detail) => chain.push({ layer, hit, won: false, detail });
  const markWon = () => {
    chain[chain.length - 1].won = true;
    won = true;
  };
  const take = (fn) => {
    if (!won) fn();
  };
  let unit = null;
  let source = "cost_passthrough";
  let pctSource = null;
  let pricingMode = "cost_passthrough";
  let tierRow = null;
  let matchedTier = null;
  let markupPct = null;
  let discountPct = null;
  let marketRetail = null;
  let marketDiscountPct = null;
  let reason = null;
  let breakMinCharge = null;
  let applied = false;
  const fixed = scopedFinite(part, PART_FIXED_FIELDS);
  if (fixed !== null && fixed > 0) {
    record("part_fixed", true, `fixed_price ${fixed}`);
    take(() => {
      markWon();
      unit = fixed;
      source = "part_fixed";
      pctSource = "fixed_price";
      pricingMode = "fixed";
      reason = "fixed_price";
    });
  } else {
    record("part_fixed", false, fixed !== null ? "fixed_price not positive" : "no fixed price");
  }
  {
    let layerReason = null;
    if (!ref && !rawTemplate) layerReason = "no_template_ref";
    else if (!tmpl) layerReason = "template_not_found";
    else if (!tmpl.active) layerReason = "template_inactive";
    else if (unitMismatch) layerReason = "unit_category_mismatch";
    else if (qty <= 0) layerReason = "qty_not_positive";
    if (layerReason) {
      record("template", false, layerReason);
      reason = reason ?? layerReason;
    } else {
      const pick = pickTemplateBreak(tmpl, qty, tierKeys, base);
      if (pick) {
        record(
          "template",
          true,
          `bracket qty>=${pick.bracket.qty} via ${pick.price.pct_source}${templateVia ? ` [${templateVia}]` : ""}`
        );
        take(() => {
          markWon();
          applied = true;
          source = "template";
          pctSource = pick.price.pct_source;
          pricingMode = pick.price.pricing_mode === "fixed" ? "fixed" : pick.price.pricing_mode === "market_based" ? "market_based" : "markup";
          unit = pick.price.unit;
          tierRow = pick.bracket;
          matchedTier = pick.price.matched_tier;
          markupPct = pick.price.markup_pct;
          discountPct = pick.price.discount_pct;
          marketRetail = pick.price.market_retail;
          marketDiscountPct = pick.price.market_discount_pct;
          breakMinCharge = pick.bracket.minimum_charge;
        });
      } else {
        const t = tmpl;
        const flat = bracketPrice(
          {
            qty: 0,
            tier_markups: {},
            unit_price: t.unit_price,
            markup_pct: t.markup_pct,
            discount_pct: t.discount_pct,
            market_retail: t.market_retail,
            market_discount_pct: t.market_discount_pct,
            minimum_charge: null,
            index: -1,
            raw: t.raw
          },
          t,
          tierKeys,
          base
        );
        if (flat) {
          record("template", true, `template_default ${flat.pct_source}${templateVia ? ` [${templateVia}]` : ""}`);
          take(() => {
            markWon();
            applied = true;
            source = "template";
            pctSource = "template_default";
            pricingMode = flat.pricing_mode === "fixed" ? "fixed" : flat.pricing_mode === "market_based" ? "market_based" : "markup";
            unit = flat.unit;
            matchedTier = flat.matched_tier;
            markupPct = flat.markup_pct;
            discountPct = flat.discount_pct;
            marketRetail = flat.market_retail;
            marketDiscountPct = flat.market_discount_pct;
          });
        } else {
          record("template", false, "no_qualifying_break");
          reason = reason ?? "no_qualifying_break";
        }
      }
    }
  }
  {
    const hit = tierRuleSetHit(part, ruleSets, tierKeys, base);
    if (hit) {
      record("tier_rule_set", true, `rule tier ${asString(hit.rule.tier ?? hit.rule.customer_tier)} -> ${hit.markup_pct}%`);
      take(() => {
        markWon();
        source = "tier_rule_set";
        pctSource = "tier_rule_set";
        pricingMode = "markup";
        unit = hit.unit;
        markupPct = hit.markup_pct;
      });
    } else {
      record("tier_rule_set", false, partTierSetRefs(part).length ? "no matching rule" : "no linked rule set");
    }
  }
  {
    const brk = pickPartUnitBreak(partChartBreaks(part), qty);
    if (brk) {
      const price = num2(brk.unit_price ?? brk.price);
      record("part_chart", true, `per_unit_breaks qty>=${num2(brk.qty ?? brk.min_qty ?? brk.quantity)} -> ${price}`);
      take(() => {
        markWon();
        source = "part_chart";
        pctSource = "part_chart";
        pricingMode = "fixed";
        unit = price;
      });
    } else {
      record("part_chart", false, "no qualifying part break");
    }
  }
  {
    const retail = scopedFinite(part, PART_MARKET_RETAIL_FIELDS);
    if (retail !== null && retail > 0) {
      const disc = scopedFinite(part, PART_MARKET_DISCOUNT_FIELDS) ?? 0;
      record("part_market", true, `market_retail ${retail} - ${disc}%`);
      take(() => {
        markWon();
        source = "part_market";
        pctSource = "market_retail";
        pricingMode = "market_based";
        unit = marketUnit(retail, disc);
        marketRetail = retail;
        marketDiscountPct = disc;
        discountPct = disc;
      });
    } else {
      record("part_market", false, "no positive market_retail");
    }
  }
  {
    const partMarkup = scopedFinite(part, PART_MARKUP_FIELDS);
    const shopDefault = toFiniteNumber(args.default_markup_pct ?? args.defaultMarkupPct);
    if (partMarkup !== null && partMarkup !== 0) {
      record("default_markup", true, `part.markup_pct ${partMarkup}`);
      take(() => {
        markWon();
        source = "default_markup";
        pctSource = "markup_pct";
        pricingMode = "markup";
        unit = base * (1 + partMarkup / 100);
        markupPct = partMarkup;
      });
    } else if (shopDefault !== null) {
      record("default_markup", true, `default_markup_pct ${shopDefault}`);
      take(() => {
        markWon();
        source = "default_markup";
        pctSource = "fallback";
        pricingMode = "default_markup";
        unit = base * (1 + shopDefault / 100);
        markupPct = shopDefault;
      });
    } else {
      record("default_markup", false, "no finite fallback percent");
    }
  }
  {
    record("cost_passthrough", true, "unit = base_price");
    take(() => {
      markWon();
      source = "cost_passthrough";
      pricingMode = "cost_passthrough";
      unit = base;
    });
  }
  const unitPrice = num2(unit);
  const extension = round22(unitPrice * qty);
  const minCandidates = [
    breakMinCharge,
    tmpl?.minimum_charge ?? null,
    scopedFinite(part, PART_MIN_CHARGE_FIELDS),
    toFiniteNumber(args.minimum_charge ?? args.minimumCharge)
  ];
  let minimumCharge = 0;
  for (const c of minCandidates) {
    if (c !== null && c > minimumCharge) minimumCharge = c;
  }
  const minimumApplied = minimumCharge > 0 && extension > 0 && extension < minimumCharge;
  const extended = minimumApplied ? round22(minimumCharge) : extension;
  return {
    applied,
    template_id: templateId,
    template_name: tmpl?.name ?? "",
    template: tmpl,
    source,
    pct_source: pctSource,
    pricing_mode: pricingMode,
    qty,
    base_price: base,
    unit_price: round42(unitPrice),
    extended,
    tier_row: tierRow,
    bracket_min_qty: tierRow ? tierRow.qty : null,
    matched_tier: matchedTier,
    markup_pct: markupPct,
    discount_pct: discountPct,
    market_retail: marketRetail,
    market_discount_pct: marketDiscountPct,
    minimum_charge: minimumCharge,
    minimum_applied: minimumApplied,
    reason,
    chain,
    unit_unverified: unitUnverified,
    warnings
  };
}
var TEMPLATE_SUPERSEDED_FIELDS = [
  "tier_ref",
  "tier",
  "tier_name",
  "per_unit_breaks",
  "unit_breaks",
  "qty_breaks",
  "market_retail",
  "retail",
  "retail_price",
  "list_price",
  "market_discount_pct",
  "market_based",
  "pricing_mode",
  "price_mode",
  "markup_pct",
  "markup",
  "markup_percent",
  "discount_pct"
];
function templatePartDescriptor(part, resolution) {
  const p = isRecord(part) ? { ...part } : {};
  if (!resolution || !resolution.applied) return part;
  for (const f of TEMPLATE_SUPERSEDED_FIELDS) delete p[f];
  const pinUnit = () => {
    p.per_unit_breaks = [{ qty: resolution.qty || 1, unit_price: resolution.unit_price }];
  };
  switch (resolution.pricing_mode) {
    case "market_based":
      if (resolution.pct_source === "discount_pct" && resolution.market_retail === null) {
        if (resolution.discount_pct !== null && resolution.discount_pct !== 0) {
          p.markup_pct = -resolution.discount_pct;
        } else {
          pinUnit();
        }
      } else {
        p.pricing_mode = "market_based";
        p.market_retail = resolution.market_retail ?? resolution.unit_price;
        p.market_discount_pct = resolution.market_discount_pct ?? resolution.discount_pct ?? 0;
      }
      break;
    case "fixed":
      pinUnit();
      break;
    case "markup":
    default:
      if (resolution.pct_source === "discount_pct" && resolution.discount_pct !== null) {
        if (resolution.discount_pct !== 0) p.markup_pct = -resolution.discount_pct;
        else pinUnit();
      } else if (resolution.markup_pct !== null && resolution.markup_pct !== 0) {
        p.markup_pct = resolution.markup_pct;
      } else {
        pinUnit();
      }
      break;
  }
  return p;
}

// .audit-work/foundation-o010-totals/fixture/base44/shared/foundationPricingWire.ts
var isRecord2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var toFiniteNumber2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num3 = (v, fallback = 0) => toFiniteNumber2(v) ?? fallback;
var sumRows = (rows, field) => {
  if (!Array.isArray(rows)) return null;
  let hit = false;
  let total = 0;
  for (const r of rows) {
    const n = toFiniteNumber2(isRecord2(r) ? r[field] : null);
    if (n === null) continue;
    hit = true;
    total += n;
  }
  return hit ? total : null;
};
var FOUNDATION_MODULE_KEYS = Object.freeze([
  "foundation",
  "foundation_project",
  "concrete",
  "masonry",
  "concrete_masonry_poles",
  "poles"
]);
var itemSum = (field) => (rec) => sumRows(rec.items, field);
var itemSum2 = (a, b) => (rec) => {
  const x = sumRows(rec.items, a);
  const y = sumRows(rec.items, b);
  if (x === null && y === null) return null;
  return (x ?? 0) + (y ?? 0);
};
var rowCount = (field) => (rec) => Array.isArray(rec[field]) ? rec[field].length : null;
var FOUNDATION_COMPONENTS = [
  {
    key: "concrete",
    label: "Concrete & Delivery",
    costFields: ["total_concrete_cost"],
    qtyFields: ["concrete_delivered_yards", "total_concrete_volume_cy"],
    qtyFrom: itemSum("concrete_volume_cy"),
    category_key: "outsourced_fab"
  },
  {
    key: "rebar",
    label: "Rebar",
    costFields: ["total_rebar_cost"],
    qtyFields: ["total_rebar_feet", "rebar_feet"],
    qtyFrom: itemSum("rebar_feet"),
    category_key: "outsourced_fab"
  },
  {
    key: "excavation",
    label: "Excavation",
    costFields: ["total_excavation_cost"],
    qtyFields: ["total_excavation_volume_cy"],
    qtyFrom: itemSum("excavation_volume_cy"),
    category_key: "inhouse_labor"
  },
  {
    key: "forming",
    label: "Forming Materials",
    costFields: ["total_forming_materials_cost"],
    qtyFields: ["total_forming_qty"],
    qtyFrom: itemSum("forming_qty"),
    category_key: "outsourced_fab"
  },
  {
    key: "labor",
    label: "Pouring & Finishing Labor",
    costFields: ["total_labor_cost"],
    qtyFields: ["total_labor_hours"],
    qtyFrom: itemSum2("pouring_hours", "finishing_hours"),
    category_key: "inhouse_labor"
  },
  {
    // Breakdown line — walls[].calculatedCosts material+mortar+internal
    // material+internal mortar (categorizeFoundationProject 'Brick / Wall /
    // Mortar Materials'). Emitted only when a walls[] row carries a
    // calculatedCosts record; the 'walls' aggregate fills the slot otherwise.
    key: "wall_materials",
    label: "Brick / Wall / Mortar Materials",
    costFields: [],
    category_key: "outsourced_fab",
    aliases: ["walls", "wall"]
  },
  {
    // Breakdown line — walls[].calculatedCosts labor+internal labor
    // (categorizer 'Masonry Labor').
    key: "wall_labor",
    label: "Masonry Labor",
    costFields: [],
    category_key: "outsourced_services",
    aliases: ["walls", "wall"]
  },
  {
    // Aggregate fallback — persisted total_wall_cost when no walls[]
    // calculatedCosts breakdown exists (legacy/manual totals).
    key: "walls",
    label: "Masonry Walls",
    costFields: ["total_wall_cost"],
    qtyFrom: rowCount("walls"),
    category_key: "outsourced_fab",
    aliases: ["wall"]
  },
  {
    key: "poles",
    label: "Poles",
    costFields: ["total_pole_cost"],
    qtyFrom: rowCount("poles"),
    category_key: "outsourced_fab"
  },
  {
    key: "pole_painting",
    label: "Pole Painting",
    costFields: ["total_pole_painting_cost"],
    qtyFrom: (rec) => {
      const rows = rec.poles;
      if (!Array.isArray(rows)) return null;
      const n = rows.filter(
        (p) => isRecord2(p) && (p.paint === true || num3(p.pole_painting_cost) > 0)
      ).length;
      return n || (rows.length ? 0 : null);
    },
    category_key: "outsourced_fab"
  },
  {
    key: "equipment",
    label: "Equipment Rental",
    costFields: ["total_equipment_cost"],
    qtyFrom: rowCount("selected_equipment"),
    category_key: "outsourced_services"
  },
  {
    key: "wall_caps",
    label: "Wall Caps",
    costFields: ["total_wall_cap_cost"],
    qtyFrom: rowCount("wall_caps"),
    category_key: "outsourced_fab"
  },
  {
    key: "signage",
    label: "Signage Cabinets",
    costFields: ["total_signage_cabinet_cost"],
    qtyFrom: (rec) => {
      const rows = rec.signage_cabinets;
      if (!Array.isArray(rows)) return null;
      let hit = false;
      let total = 0;
      for (const c of rows) {
        if (!isRecord2(c)) continue;
        hit = true;
        total += num3(c.quantity, 1);
      }
      return hit ? total : rows.length ? 0 : null;
    },
    category_key: "outsourced_fab"
  },
  {
    key: "landscape",
    label: "Landscape / Site Materials",
    costFields: ["total_landscape_cost"],
    qtyFrom: (rec) => {
      const cells = isRecord2(rec.landscape) && isRecord2(rec.landscape.cells) ? Object.keys(rec.landscape.cells).length : null;
      return cells === null ? null : cells;
    },
    category_key: "outsourced_fab"
  }
];
var FOUNDATION_COMPONENT_KEYS = Object.freeze(
  FOUNDATION_COMPONENTS.map((c) => c.key)
);
var FIXED_FIELDS = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS2 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS = ["formula_modifiers", "modifiers"];
var MODE_FIELDS = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var FOUNDATION_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS,
  ...TIER_REF_FIELDS,
  ...BREAK_FIELDS,
  ...TEMPLATE_REF_FIELDS,
  ...TIER_SET_FIELDS,
  ...MARKET_FIELDS,
  ...MARKET_DISCOUNT_FIELDS,
  ...MARKUP_FIELDS2,
  ...MIN_FIELDS,
  ...SETUP_FIELDS,
  ...FORMULA_FIELDS,
  ...MODE_FIELDS,
  ...MACHINE_FIELDS,
  ...TIER_CONTEXT_FIELDS,
  ...EMBEDDED_RULE_FIELDS,
  ...EMBEDDED_TEMPLATE_FIELDS,
  ...EMBEDDED_TIER_CATALOG_FIELDS,
  ...UNIT_FIELDS,
  ...TAX_PCT_FIELDS,
  ...INTERPOLATE_FIELDS,
  "taxable"
]);

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/foundation/foundationSellPricing.js
var ENGINE = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/customerPricing.js
var num4 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num4(line?.total_snapshot);
}

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/workOrderConversion.js
var num5 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
    const quantity = Math.max(0, num5(priced.quantity, num5(line.customer_quantity, 1)));
    const unitPrice = num5(priced.unitRaw, acceptedCustomerUnitPrice(line));
    const adjustedTotal = Number.isFinite(Number(priced.adjusted)) ? Number(priced.adjusted) : unitPrice * quantity * (1 + num5(line.adjustment_percent) / 100);
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
      queue_priority: num5(line.queue_priority, 0),
      proof_status: line.proof_status || "none",
      proof_file_url: line.proof_file_url || "",
      proof_file_name: line.proof_file_name || "",
      proof_version: num5(line.proof_version, 0),
      proof_approved_version: num5(line.proof_approved_version, 0)
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
  const priced = num5(pricing?.quoteTotal, NaN);
  if (Number.isFinite(priced)) return priced;
  const quoted = num5(estimate?.quote_total, NaN);
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
  const explicit = num5(leadTimeDays, 0);
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
