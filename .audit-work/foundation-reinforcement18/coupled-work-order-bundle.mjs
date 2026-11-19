// offline:@/api/base44Client
var base44 = {
  entities: new Proxy({}, { get(_, key) {
    return globalThis.__coupledWorkOrder.store.entity(key);
  } }),
  functions: { invoke: (...args) => globalThis.__coupledWorkOrder.store.invoke(...args) }
};

// src/components/estimator/moduleRegistry.js
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

// base44/shared/pricingEngine.ts
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

// base44/shared/pricingTemplateModel.ts
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

// base44/shared/channelPricingWire.ts
var CHANNEL_MODULE_KEYS = Object.freeze([
  "channel_letters",
  "channel_letter",
  "channel_letter_installation"
]);
var CHANNEL_ENGINE_CONTEXT_FIELDS = Object.freeze([
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context"
]);
var CHANNEL_NESTED_CONTEXT_FIELDS = Object.freeze([
  "engine_context",
  "pricing_engine"
]);
var CHANNEL_LINE_PART_FIELDS = Object.freeze([
  "part",
  "pricing",
  "price_config",
  "tier_config",
  "sell_pricing"
]);
var CHANNEL_LINE_MACHINE_FIELDS = Object.freeze([
  "machine",
  "machine_override",
  "machine_pricing",
  "equipment_pricing"
]);
var CHANNEL_LINE_TEMPLATE_FIELDS = Object.freeze([
  "pricing_template",
  "price_template",
  "template"
]);
var CHANNEL_LINE_TEMPLATE_ID_FIELDS = Object.freeze([
  "pricing_template_id",
  "template_id",
  "margin_template_id"
]);
var CHANNEL_LINE_TEMPLATE_NAME_FIELDS = Object.freeze([
  "pricing_template_name",
  "template_name"
]);

// base44/shared/vinylPricingWire.ts
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
var FORMULA_FIELDS = ["formula_modifiers"];
var MODE_FIELDS = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS = ["tiers", "tier_catalog"];
var VINYL_ENGINE_LINE_FIELDS = Object.freeze([
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
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/vinyl/vinylEnginePricing.js
var ENGINE = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/brickPricingWire.ts
var BRICK_MODULE_KEYS = Object.freeze([
  "brick_stone",
  "brick",
  "brickstone",
  "brick_stone_project",
  "masonry"
]);
var BRICK_COMPONENTS = [
  {
    key: "material",
    label: "Brick / Stone Material",
    costFields: ["material_cost", "materials_cost"],
    qtyFields: ["calculated_bricks", "brick_count"],
    category_key: "outsourced_fab"
  },
  {
    key: "mortar",
    label: "Mortar",
    costFields: ["mortar_cost"],
    qtyFields: ["mortar_bags_needed", "mortar_bags"],
    category_key: "outsourced_fab"
  },
  {
    key: "labor",
    label: "Masonry Labor",
    costFields: ["labor_cost"],
    qtyFields: ["labor_hours"],
    category_key: "outsourced_services"
  }
];
var BRICK_COMPONENT_KEYS = Object.freeze(
  BRICK_COMPONENTS.map((c) => c.key)
);
var FIXED_FIELDS2 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS2 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS2 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS2 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS2 = [
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
var MARKET_FIELDS2 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS2 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS3 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS2 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS2 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS2 = ["formula_modifiers", "modifiers"];
var MODE_FIELDS2 = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS2 = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS2 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS2 = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS2 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS2 = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var BRICK_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS2,
  ...TIER_REF_FIELDS2,
  ...BREAK_FIELDS2,
  ...TEMPLATE_REF_FIELDS2,
  ...TIER_SET_FIELDS2,
  ...MARKET_FIELDS2,
  ...MARKET_DISCOUNT_FIELDS2,
  ...MARKUP_FIELDS3,
  ...MIN_FIELDS2,
  ...SETUP_FIELDS2,
  ...FORMULA_FIELDS2,
  ...MODE_FIELDS2,
  ...MACHINE_FIELDS2,
  ...TIER_CONTEXT_FIELDS2,
  ...EMBEDDED_RULE_FIELDS2,
  ...EMBEDDED_TEMPLATE_FIELDS2,
  ...EMBEDDED_TIER_CATALOG_FIELDS2,
  ...UNIT_FIELDS,
  ...TAX_PCT_FIELDS,
  ...INTERPOLATE_FIELDS,
  "taxable"
]);

// src/components/estimator/brick/brickSellPricing.js
var ENGINE2 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/cncPricingWire.ts
var FIXED_FIELDS3 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS3 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS3 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS3 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS3 = [
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
var MARKET_FIELDS3 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS3 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS4 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS3 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS3 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS3 = ["formula_modifiers"];
var MODE_FIELDS3 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS3 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS3 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS3 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS3 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS3 = ["tiers", "tier_catalog"];
var CNC_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS3,
  ...TIER_REF_FIELDS3,
  ...BREAK_FIELDS3,
  ...TEMPLATE_REF_FIELDS3,
  ...TIER_SET_FIELDS3,
  ...MARKET_FIELDS3,
  ...MARKET_DISCOUNT_FIELDS3,
  ...MARKUP_FIELDS4,
  ...MIN_FIELDS3,
  ...SETUP_FIELDS3,
  ...FORMULA_FIELDS3,
  ...MODE_FIELDS3,
  ...MACHINE_FIELDS3,
  ...TIER_CONTEXT_FIELDS3,
  ...EMBEDDED_RULE_FIELDS3,
  ...EMBEDDED_TEMPLATE_FIELDS3,
  ...EMBEDDED_TIER_CATALOG_FIELDS3,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/cnc/cncSellPricing.js
var ENGINE3 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/metalPricingWire.ts
var FIXED_FIELDS4 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS4 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS4 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS4 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS4 = [
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
var MARKET_FIELDS4 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS4 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS5 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS4 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS4 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS4 = ["formula_modifiers"];
var MODE_FIELDS4 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS4 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS4 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS4 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS4 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS4 = ["tiers", "tier_catalog"];
var METAL_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS4,
  ...TIER_REF_FIELDS4,
  ...BREAK_FIELDS4,
  ...TEMPLATE_REF_FIELDS4,
  ...TIER_SET_FIELDS4,
  ...MARKET_FIELDS4,
  ...MARKET_DISCOUNT_FIELDS4,
  ...MARKUP_FIELDS5,
  ...MIN_FIELDS4,
  ...SETUP_FIELDS4,
  ...FORMULA_FIELDS4,
  ...MODE_FIELDS4,
  ...MACHINE_FIELDS4,
  ...TIER_CONTEXT_FIELDS4,
  ...EMBEDDED_RULE_FIELDS4,
  ...EMBEDDED_TEMPLATE_FIELDS4,
  ...EMBEDDED_TIER_CATALOG_FIELDS4,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/metal/metalSellPricing.js
var ENGINE4 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/laserPricingWire.ts
var FIXED_FIELDS5 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS5 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS5 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS5 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS5 = [
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
var MARKET_FIELDS5 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS5 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS6 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS5 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS5 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS5 = ["formula_modifiers"];
var MODE_FIELDS5 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS5 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS5 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS5 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS5 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS5 = ["tiers", "tier_catalog"];
var LASER_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS5,
  ...TIER_REF_FIELDS5,
  ...BREAK_FIELDS5,
  ...TEMPLATE_REF_FIELDS5,
  ...TIER_SET_FIELDS5,
  ...MARKET_FIELDS5,
  ...MARKET_DISCOUNT_FIELDS5,
  ...MARKUP_FIELDS6,
  ...MIN_FIELDS5,
  ...SETUP_FIELDS5,
  ...FORMULA_FIELDS5,
  ...MODE_FIELDS5,
  ...MACHINE_FIELDS5,
  ...TIER_CONTEXT_FIELDS5,
  ...EMBEDDED_RULE_FIELDS5,
  ...EMBEDDED_TEMPLATE_FIELDS5,
  ...EMBEDDED_TIER_CATALOG_FIELDS5,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/laser/laserSellPricing.js
var ENGINE5 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/paintPricingWire.ts
var FIXED_FIELDS6 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS6 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS6 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS6 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS6 = [
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
var MARKET_FIELDS6 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS6 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS7 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS6 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS6 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS6 = ["formula_modifiers"];
var MODE_FIELDS6 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS6 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS6 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS6 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS6 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS6 = ["tiers", "tier_catalog"];
var PAINT_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS6,
  ...TIER_REF_FIELDS6,
  ...BREAK_FIELDS6,
  ...TEMPLATE_REF_FIELDS6,
  ...TIER_SET_FIELDS6,
  ...MARKET_FIELDS6,
  ...MARKET_DISCOUNT_FIELDS6,
  ...MARKUP_FIELDS7,
  ...MIN_FIELDS6,
  ...SETUP_FIELDS6,
  ...FORMULA_FIELDS6,
  ...MODE_FIELDS6,
  ...MACHINE_FIELDS6,
  ...TIER_CONTEXT_FIELDS6,
  ...EMBEDDED_RULE_FIELDS6,
  ...EMBEDDED_TEMPLATE_FIELDS6,
  ...EMBEDDED_TIER_CATALOG_FIELDS6,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/paint/paintSellPricing.js
var ENGINE6 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/foundationPricingWire.ts
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
var FIXED_FIELDS7 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS7 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS7 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS7 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS7 = [
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
var MARKET_FIELDS7 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS7 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS8 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS7 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS7 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS7 = ["formula_modifiers", "modifiers"];
var MODE_FIELDS7 = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS7 = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS7 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS7 = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS7 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS7 = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS2 = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS2 = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS2 = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var FOUNDATION_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS7,
  ...TIER_REF_FIELDS7,
  ...BREAK_FIELDS7,
  ...TEMPLATE_REF_FIELDS7,
  ...TIER_SET_FIELDS7,
  ...MARKET_FIELDS7,
  ...MARKET_DISCOUNT_FIELDS7,
  ...MARKUP_FIELDS8,
  ...MIN_FIELDS7,
  ...SETUP_FIELDS7,
  ...FORMULA_FIELDS7,
  ...MODE_FIELDS7,
  ...MACHINE_FIELDS7,
  ...TIER_CONTEXT_FIELDS7,
  ...EMBEDDED_RULE_FIELDS7,
  ...EMBEDDED_TEMPLATE_FIELDS7,
  ...EMBEDDED_TIER_CATALOG_FIELDS7,
  ...UNIT_FIELDS2,
  ...TAX_PCT_FIELDS2,
  ...INTERPOLATE_FIELDS2,
  "taxable"
]);

// src/components/estimator/foundation/foundationSellPricing.js
var ENGINE7 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/customItemsPricingWire.ts
var FIXED_FIELDS8 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS8 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS8 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS8 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS8 = [
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
var MARKET_FIELDS8 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS8 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS9 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS8 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS8 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS8 = ["formula_modifiers"];
var MODE_FIELDS8 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS8 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS8 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS8 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS8 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS8 = ["tiers", "tier_catalog"];
var CUSTOM_ITEMS_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS8,
  ...TIER_REF_FIELDS8,
  ...BREAK_FIELDS8,
  ...TEMPLATE_REF_FIELDS8,
  ...TIER_SET_FIELDS8,
  ...MARKET_FIELDS8,
  ...MARKET_DISCOUNT_FIELDS8,
  ...MARKUP_FIELDS9,
  ...MIN_FIELDS8,
  ...SETUP_FIELDS8,
  ...FORMULA_FIELDS8,
  ...MODE_FIELDS8,
  ...MACHINE_FIELDS8,
  ...TIER_CONTEXT_FIELDS8,
  ...EMBEDDED_RULE_FIELDS8,
  ...EMBEDDED_TEMPLATE_FIELDS8,
  ...EMBEDDED_TIER_CATALOG_FIELDS8,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/customItems/customItemsSellPricing.js
var ENGINE8 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// base44/shared/maintenancePricingWire.ts
var MAINTENANCE_MODULE_KEYS = Object.freeze([
  "maintenance",
  "sign_maintenance",
  "maintenance_project",
  "sign_maintenance_project",
  "service",
  "maintenance_service"
]);
var FIXED_FIELDS9 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS9 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS9 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS9 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS9 = [
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
var MARKET_FIELDS9 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS9 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS10 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS9 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS9 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS9 = ["formula_modifiers"];
var MODE_FIELDS9 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS9 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS9 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS9 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS9 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS9 = ["tiers", "tier_catalog"];
var MAINTENANCE_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS9,
  ...TIER_REF_FIELDS9,
  ...BREAK_FIELDS9,
  ...TEMPLATE_REF_FIELDS9,
  ...TIER_SET_FIELDS9,
  ...MARKET_FIELDS9,
  ...MARKET_DISCOUNT_FIELDS9,
  ...MARKUP_FIELDS10,
  ...MIN_FIELDS9,
  ...SETUP_FIELDS9,
  ...FORMULA_FIELDS9,
  ...MODE_FIELDS9,
  ...MACHINE_FIELDS9,
  ...TIER_CONTEXT_FIELDS9,
  ...EMBEDDED_RULE_FIELDS9,
  ...EMBEDDED_TEMPLATE_FIELDS9,
  ...EMBEDDED_TIER_CATALOG_FIELDS9,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);

// src/components/estimator/maintenance/maintenanceSellPricing.js
var ENGINE9 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

// src/components/estimator/customerPricing.js
var num4 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num4(line?.total_snapshot);
}
function acceptedInternalEstimateCost(lineItems = []) {
  return (lineItems || []).reduce((sum, line) => {
    const quantity = Math.max(0, num4(line?.customer_quantity, 1));
    return sum + num4(line?.total_snapshot) * quantity;
  }, 0);
}

// src/components/estimator/estimateSalesActivity.mjs
var SALES_FIELDS = /* @__PURE__ */ new Set([
  "sales_status",
  "sales_rep",
  "estimator",
  "estimate_amount",
  "date_estimate_sent",
  "date_order_created",
  "estimate_id",
  "in_pipeline"
]);
var equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function hasVerifiedEstimateSalesActivity(existing, fields = {}, {
  quoteDateVerificationRequested = false,
  includeProducts = false
} = {}) {
  if (!existing) return true;
  if (quoteDateVerificationRequested) return true;
  return Object.entries(fields).some(
    ([field, value]) => (SALES_FIELDS.has(field) || includeProducts && field === "products") && !equal(existing[field], value)
  );
}

// src/components/estimator/estimateLifecycle.js
var SYSTEM_FIELDS = /* @__PURE__ */ new Set(["id", "created_date", "updated_date", "created_by_id", "created_by", "edit_reason"]);
var num5 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function estimateAuditSnapshot(estimate = {}, { quoteTotal, internalCost } = {}) {
  const snapshot = {};
  Object.entries(estimate || {}).forEach(([key, value]) => {
    if (SYSTEM_FIELDS.has(key)) return;
    snapshot[key] = value;
  });
  snapshot.total_cost = internalCost === void 0 ? num5(estimate.total_cost) : num5(internalCost);
  snapshot.quote_total = quoteTotal === void 0 ? num5(estimate.quote_total) : num5(quoteTotal);
  return JSON.parse(JSON.stringify(snapshot));
}

// src/lib/loadAllEntityRows.js
var DEFAULT_PAGE_SIZE = 500;
var DEFAULT_MAX_ROWS = 5e4;
var RATE_LIMIT_MAX_RETRIES = 3;
var RATE_LIMIT_BASE_DELAY_MS = 1200;
function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const message = String(
    error?.message || error?.response?.data?.error || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}
async function withRateLimitRetry(fn) {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (typeof error?.ccsGovernorRetried === "number") throw error;
      if (attempt < RATE_LIMIT_MAX_RETRIES && isRateLimitError(error)) {
        await sleep(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}
var readCache = /* @__PURE__ */ new WeakMap();
var CACHE_MAX_AGE_MS = 3e4;
var inFlightReads = /* @__PURE__ */ new WeakMap();
var readCacheBucket = (entity) => {
  let bucket = readCache.get(entity);
  if (!bucket) {
    bucket = /* @__PURE__ */ new Map();
    readCache.set(entity, bucket);
  }
  return bucket;
};
async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Estimator prerequisite catalog",
  cacheTtlMs = 0,
  // (#403) `limit` bounds the total rows returned for callers that only need a
  // window (e.g. "the 50 newest"), not a verified-complete catalog. Reaching
  // the bound is a normal truncation — unlike `maxRows`, which stays a
  // runaway-scan safety net and still throws when a full scan would pass it.
  limit = null
} = {}) {
  const parsedLimit = limit == null ? null : Math.floor(Number(limit));
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const canShare = entity !== null && (typeof entity === "object" || typeof entity === "function");
  const cacheKey = cacheTtlMs > 0 && canShare ? JSON.stringify([query, sort, pageSize, safeLimit ?? maxRows]) : null;
  if (cacheKey) {
    const hit = readCache.get(entity)?.get(cacheKey);
    if (hit && Date.now() - hit.at < Math.min(cacheTtlMs, CACHE_MAX_AGE_MS)) return [...hit.rows];
  }
  const hasFilter = query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = safeLimit ?? Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const flightKey = JSON.stringify([hasFilter ? "filter" : "list", query ?? null, sort ?? null, safePageSize, safeMaxRows]);
  if (canShare) {
    const existing = inFlightReads.get(entity)?.get(flightKey);
    if (existing) return existing.then((rows) => [...rows]);
  }
  const readPromise = (async () => {
    const collected = [];
    const seen = /* @__PURE__ */ new Set();
    let skip = 0;
    while (skip < safeMaxRows) {
      const pageLimit = Math.min(safePageSize, safeMaxRows - skip);
      const page = await withRateLimitRetry(
        () => hasFilter ? entity.filter(query, sort || void 0, pageLimit, skip) : entity.list(sort || void 0, pageLimit, skip)
      );
      if (!Array.isArray(page)) {
        throw new Error(`${label} could not be verified completely. Estimating was blocked rather than using a partial catalog.`);
      }
      for (let index = 0; index < page.length; index += 1) {
        const row = page[index];
        const key = rowIdentity(row, skip + index);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(row);
      }
      if (page.length < pageLimit) {
        if (cacheKey) readCacheBucket(entity).set(cacheKey, { at: Date.now(), rows: collected });
        return collected;
      }
      skip += pageLimit;
    }
    if (safeLimit != null) {
      if (cacheKey) readCacheBucket(entity).set(cacheKey, { at: Date.now(), rows: collected });
      return collected;
    }
    throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
  })();
  if (!canShare) return readPromise;
  let flightBucket = inFlightReads.get(entity);
  if (!flightBucket) {
    flightBucket = /* @__PURE__ */ new Map();
    inFlightReads.set(entity, flightBucket);
  }
  flightBucket.set(flightKey, readPromise);
  try {
    const rows = await readPromise;
    return [...rows];
  } finally {
    if (flightBucket.get(flightKey) === readPromise) flightBucket.delete(flightKey);
  }
}

// src/components/estimator/estimatePersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function expectedEstimateFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  if (!Object.prototype.hasOwnProperty.call(expected, "deleted") && Object.prototype.hasOwnProperty.call(record || {}, "deleted")) {
    expected.deleted = record?.deleted;
  }
  return expected;
}
async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  guardFields = {},
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3
} = {}) {
  const id = String(estimateId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  const guardNames = Object.keys(guards);
  if (!id || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Estimate before saving.`);
    if ((current.deleted === true || expected.deleted === true) && !Object.prototype.hasOwnProperty.call(desired, "deleted")) {
      throw new Error(`${label} was blocked because this Estimate is in Trash. Restore it before saving. No Estimate fields were overwritten.`);
    }
    for (const fieldName of guardNames) {
      if (!sameValue(current[fieldName], guards[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Estimate version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} Estimate changed repeatedly while saving. Reload and try again.`);
}

// src/components/estimator/estimateRevisionService.js
var num6 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
async function ensureEstimateLifecycleRevision({ idempotencyKey = "", sessionToken = "", ...payload }) {
  const cleanKey = String(idempotencyKey || "").trim();
  const estimateId = payload.estimateAfter?.id || payload.estimateBefore?.id || "";
  if (!estimateId) throw new Error("Estimate is required for revision history.");
  if (!cleanKey) throw new Error("A stable lifecycle idempotency key is required.");
  const cleanReason = String(payload.reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  if (!sessionToken) {
    console.warn("Lifecycle revision skipped \u2014 no session token; audit write deferred for reconciliation.");
    return { id: "", skipped: true };
  }
  const before = estimateAuditSnapshot(payload.estimateBefore || {}, {
    quoteTotal: payload.quoteTotalBefore,
    internalCost: payload.internalCostBefore
  });
  const revisionPayload = {
    estimate_id: estimateId,
    revision_type: payload.revisionType || "status_transition",
    revision_status: "completed",
    reason: cleanReason,
    previous_status: before.status || "draft",
    previous_quote_total: num6(before.quote_total),
    previous_total_cost: num6(before.total_cost),
    estimate_snapshot_before: before,
    work_order_id: payload.workOrderId || "",
    delivery_evidence: payload.deliveryEvidence || {},
    notes: cleanKey,
    idempotency_key: cleanKey
  };
  const response = await base44.functions.invoke("ensureEstimateLifecycleRevision", {
    idempotency_key: cleanKey,
    revision: revisionPayload,
    session_token: sessionToken
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate lifecycle revision could not be verified after recording.");
  return result.revision;
}

// src/components/estimator/estimateMutationGuard.js
var PENDING_TTL_MS = 24 * 60 * 60 * 1e3;
function getPendingEstimatePriceAcceptance(estimate) {
  const line = (estimate?.line_items || []).find((item) => {
    const pending = item?.price_acceptance_pending;
    if (!String(pending?.key || "").trim()) return false;
    const startedAt = Date.parse(pending?.started_at || "");
    if (Number.isFinite(startedAt) && Date.now() - startedAt > PENDING_TTL_MS) return false;
    return true;
  });
  return line ? { line, pending: line.price_acceptance_pending } : null;
}

// src/components/estimator/quoteLifecycle.js
function localDateStamp(value = /* @__PURE__ */ new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// base44/shared/salesOpportunityHistory.mjs
var SALES_OPPORTUNITY_HISTORY_FIELDS = Object.freeze([
  "sales_status",
  "sales_stage_changed_at",
  "sales_rep",
  "lead_source",
  "estimate_amount",
  "date_estimate_sent",
  "follow_up_date",
  "sales_last_follow_up_completed_at",
  "sales_last_follow_up_outcome",
  "expected_close_date",
  "close_date",
  "lost_reason",
  "current_task_description",
  "current_task_deadline",
  "current_task_assigned_to",
  "in_pipeline",
  "sales_neutral_closed_at"
]);
var ALLOWED = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);

// base44/shared/salesSaveAcknowledgmentGuard.mjs
var salesFields = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);
var equivalent = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (a == null || a === "") && (b == null || b === "");
function verifySalesSaveAcknowledgment(entityType, id, nextFields, record) {
  if (entityType !== "WorkOrder" || !nextFields || !Object.keys(nextFields).some((field) => salesFields.has(field))) return record;
  const conflict = () => {
    const error = new Error("Sales save acknowledgment does not match the requested WorkOrder and fields. Do not repeat the save; reload the latest record to verify what was stored.");
    error.code = "SALES_SAVE_ACK_UNVERIFIED";
    error.status = 409;
    return error;
  };
  if (!record || typeof record !== "object" || Array.isArray(record) || record.id !== id) throw conflict();
  if (Object.entries(nextFields).some(([field, value]) => !Object.prototype.hasOwnProperty.call(record, field) || !equivalent(record[field], value))) throw conflict();
  return record;
}

// src/components/shared/trackedFieldPersistence.js
async function saveTrackedFields({ entityType, id, expectedFields, nextFields, guardFields = {}, expectedVersion = "" }) {
  let response;
  try {
    response = await base44.functions.invoke("fieldHistoryAction", {
      action: "save",
      session_token: localStorage.getItem("sss_session_token") || "",
      entity_type: entityType,
      entity_id: id,
      expected_fields: Object.fromEntries(Object.keys(nextFields).map((f) => [f, expectedFields?.[f] ?? null])),
      next_fields: nextFields,
      guard_fields: guardFields,
      expected_version: expectedVersion
    });
  } catch (error) {
    const serverError = error?.response?.data?.error;
    if (serverError && serverError !== error?.message) {
      throw Object.assign(new Error(serverError), { status: error?.response?.status });
    }
    throw error;
  }
  const data = response.data;
  if (!data?.success || !data.record) throw new Error(data?.error || "The saved field could not be verified.");
  return verifySalesSaveAcknowledgment(entityType, id, nextFields, data.record);
}

// src/components/workflow/workOrderCreationIdentity.mjs
var NEW_WORKORDER_PROTECTED_SYNC_FIELDS = Object.freeze([
  "smartsheet_sheet_id",
  "smartsheet_row_id",
  "smartsheet_parent_row_id",
  "smartsheet_last_synced_at",
  "smartsheet_sync_snapshot",
  "smartsheet_create_attempt",
  "sales_import_source_id",
  "sales_import_last_synced_at",
  "sales_import_snapshot"
]);
var PROTECTED = new Set(NEW_WORKORDER_PROTECTED_SYNC_FIELDS);

// offline:@/components/workflow/NotificationService
var NotificationTriggers = new Proxy({}, { get() {
  return (...args) => {
    globalThis.__coupledWorkOrder.forbidden.push("notification");
    throw Error("Forbidden advisory/notification I/O: notification");
  };
} });

// offline:@/components/staff/staffEntities
var staffEntities = new Proxy({}, { get(_, key) {
  return globalThis.__coupledWorkOrder.store.entity(key);
} });

// src/components/workflow/workOrderPersistence.js
async function replaceWorkOrderFieldsIfUnchanged({ workOrderId, expectedFields, nextFields, guardFields = {} }) {
  return saveTrackedFields({ entityType: "WorkOrder", id: workOrderId, expectedFields, nextFields, guardFields });
}

// src/components/estimator/workOrderSyncPersistence.js
async function createEstimateLinkedWorkOrderWithRecovery({
  entity,
  estimateId,
  data,
  convergeCreated,
  label = "Estimate-linked Work Order"
} = {}) {
  const linkedEstimateId = String(estimateId || "").trim();
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  if (!linkedEstimateId || !payload || String(payload.estimate_id || "").trim() !== linkedEstimateId || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const before = await entity.filter({ estimate_id: linkedEstimateId });
  if (!Array.isArray(before)) {
    throw new Error(`${label} lookup did not return a Work Order list.`);
  }
  if (before.length > 0) {
    throw new Error(`${label} appeared in another session while this create was starting. Reload before continuing so an existing estimate-linked Work Order is not duplicated.`);
  }
  const beforeIds = new Set(before.map((row) => row?.id).filter(Boolean));
  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }
  if (created?.id) {
    return typeof convergeCreated === "function" ? convergeCreated(created) : created;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  let after;
  try {
    after = await entity.filter({ estimate_id: linkedEstimateId });
  } catch (readError) {
    throw new Error(`${label} create response was unavailable and its recovery lookup also failed. Reload before retrying so an already-created Work Order is not duplicated. ${readError?.message || ""}`.trim());
  }
  if (!Array.isArray(after)) {
    throw new Error(`${label} recovery lookup did not return a Work Order list. Reload before retrying.`);
  }
  const newMatches = after.filter((row) => row?.id && !beforeIds.has(row.id));
  if (newMatches.length === 1) {
    return typeof convergeCreated === "function" ? convergeCreated(newMatches[0]) : newMatches[0];
  }
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No Work Orders were deleted because the losing create could not be identified safely; reload and review the estimate-linked jobs before retrying.`);
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No new estimate-linked Work Order was visible on the recovery read. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}
async function deleteCreatedDuplicateWorkOrderIfUnchanged({
  entity,
  created,
  sessionToken = "",
  label = "Created duplicate Work Order"
} = {}) {
  const id = String(created?.id || "").trim();
  const expectedUpdatedAt = String(created?.updated_date || "").trim();
  const estimateId = String(created?.estimate_id || "").trim();
  if (!id || !expectedUpdatedAt || !estimateId || typeof entity?.get !== "function") {
    throw new Error(`${label} could not be identified safely for duplicate cleanup.`);
  }
  let response;
  try {
    response = await base44.functions.invoke("deleteCreatedDuplicateWorkOrder", {
      id,
      expected_updated_date: expectedUpdatedAt,
      estimate_id: estimateId,
      session_token: sessionToken
    });
  } catch (error) {
    let afterError;
    try {
      afterError = await entity.get(id);
    } catch (verificationError) {
      throw new Error(`${label} delete response failed and the record's absence could not be verified. Reload before retrying duplicate cleanup. ${verificationError?.message || ""}`.trim());
    }
    if (!afterError) return { status: "confirmed_absent" };
    throw error;
  }
  const result = response?.data || response || {};
  if (result?.error) throw new Error(result.error);
  if (["deleted_now", "confirmed_absent", "already_absent"].includes(result?.status)) {
    return { status: result.status };
  }
  let after;
  try {
    after = await entity.get(id);
  } catch (verificationError) {
    throw new Error(`${label} cleanup returned an unknown result and the record's current state could not be verified. Reload before retrying duplicate cleanup. ${verificationError?.message || ""}`.trim());
  }
  if (!after) return { status: "confirmed_absent" };
  throw new Error(`${label} cleanup returned an unknown result, so the losing duplicate was left intact for review.`);
}
function expectedWorkOrderFields(record = {}, nextFields = {}) {
  const out = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  if (record?.work_order_number != null && !("work_order_number" in out)) {
    out.work_order_number = record.work_order_number;
  }
  return out;
}

// base44/shared/productStatusModel.ts
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
var WORK_ORDER_STAGE_SET = [
  "estimating",
  "sales",
  "permitting",
  "design",
  "production",
  "fabrication",
  "installation",
  "completed"
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

// src/components/jobs/productStageModel.js
var WO_STAGE_ORDER = [...WORK_ORDER_STAGE_SET];

// src/components/estimator/customerSync.js
var norm2 = (s) => String(s || "").trim().toLowerCase();
var CUSTOMER_PAGE_SIZE = 500;
var CUSTOMER_CATALOG_LIMIT = 5e4;
var loadAllCustomers = async ({ pageSize = CUSTOMER_PAGE_SIZE, maxRows = CUSTOMER_CATALOG_LIMIT } = {}) => {
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  let skip = 0;
  while (skip < maxRows) {
    const page = await staffEntities.Customer.list("created_date", pageSize, skip);
    if (!Array.isArray(page)) throw new Error("The Customer catalog could not be loaded safely.");
    for (const customer of page) {
      if (!customer?.id || seen.has(customer.id)) continue;
      seen.add(customer.id);
      rows.push(customer);
    }
    if (page.length < pageSize) {
      return rows.sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")));
    }
    skip += pageSize;
  }
  throw new Error(`The Customer catalog has reached the ${maxRows.toLocaleString()}-record safety limit.`);
};
var canonicalEstimateWorkOrder = (rows = []) => (rows || []).slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.updated_date || "") || 0;
  const bTime = Date.parse(b?.created_date || b?.updated_date || "") || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;
var convergeCreatedEstimateWorkOrder = async ({ estimateId, created, fields = {}, sessionToken = "", duplicateLabel = "Work Order" } = {}) => {
  if (!estimateId || !created?.id) return created || null;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const canonical = canonicalEstimateWorkOrder(
    (await staffEntities.WorkOrder.filter({ estimate_id: estimateId })).filter((row) => row?.deleted !== true)
  ) || created;
  if (canonical?.id && canonical.id !== created.id) {
    try {
      await deleteCreatedDuplicateWorkOrderIfUnchanged({
        entity: staffEntities.WorkOrder,
        created,
        sessionToken,
        label: `Duplicate ${duplicateLabel}`
      });
    } catch (error) {
      if (!sessionToken) {
        console.warn(`${duplicateLabel} duplicate cleanup skipped \u2014 no session token; reconciliation will repair the duplicate. (${error?.message || "unknown"})`);
      } else {
        throw new Error(`A duplicate ${duplicateLabel} was detected for this estimate and the losing duplicate could not be removed safely: ${error?.message || "unknown error"}`);
      }
    }
    if (Object.keys(fields || {}).length) {
      const linkFields = Object.fromEntries(
        Object.entries(fields).filter(([k]) => ["estimate_id", "opportunity_id", "estimating_request_id", "in_pipeline"].includes(k))
      );
      if (!Object.keys(linkFields).length) return canonical;
      return replaceWorkOrderFieldsIfUnchanged({
        workOrderId: canonical.id,
        expectedFields: expectedWorkOrderFields(canonical, linkFields),
        nextFields: linkFields,
        label: `${duplicateLabel} convergence`
      });
    }
    return canonical;
  }
  return canonical;
};
var fuzzyNorm = (s) => norm2(s).replace(/[.,'"&()-]/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|the)\b/g, " ").replace(/\s+/g, " ").trim();
var findCustomerByName = (customers, name) => {
  const n = norm2(name);
  if (!n) return null;
  const exact = customers.find((c) => norm2(c.company_name) === n) || customers.find((c) => (c.legacy_client_names || []).some((l) => norm2(l) === n)) || null;
  if (exact) return exact;
  const f = fuzzyNorm(name);
  if (!f) return null;
  return customers.find((c) => fuzzyNorm(c.company_name) === f) || customers.find((c) => (c.legacy_client_names || []).some((l) => fuzzyNorm(l) === f)) || null;
};
var resolveCustomerForEstimate = async (form, customers = []) => {
  const linkedId = String(form?.customer_id || "").trim();
  if (linkedId) {
    const linked = customers.find((customer) => customer.id === linkedId);
    if (linked) return linked;
    const fetched = await staffEntities.Customer.get(linkedId);
    if (fetched) return fetched;
  }
  return findCustomerByName(customers, form?.client_name);
};

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

// base44/shared/dueDateEngine.ts
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
var finite2 = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : void 0;
};
var nonNeg = (value) => {
  const n = finite2(value);
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
  const numericTier = typeof tier === "number" ? tier : finite2(tier);
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
    const product2 = resolvePartLead(part, "product", tier);
    trace.push({
      kind: "part",
      index,
      part_id: String(part?.id ?? part?.part_id ?? part?.builder_part_id ?? ""),
      name: String(part?.name ?? part?.part_name ?? part?.description ?? ""),
      design_days: design.days,
      product_days: product2.days,
      design_source: design.source,
      product_source: product2.source,
      design_bounds: [design.floor, design.ceiling],
      product_bounds: [product2.floor, product2.ceiling]
    });
    if (product2.days >= maxProduct) {
      maxProduct = product2.days;
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
  list.forEach((product2, index) => {
    if (!product2 || typeof product2 !== "object") return;
    const raw = date_field ? product2?.[date_field] : product2?.due_date || product2?.product_due_date;
    const d = parseDateOnly(raw);
    trace.push({
      kind: "product",
      index,
      product_id: String(product2?.id ?? product2?.product_id ?? ""),
      due_date: d,
      skipped: !d
    });
    if (d && (!best || d > best)) {
      best = d;
      bestIndex = index;
      bestId = String(product2?.id ?? product2?.product_id ?? "");
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

// src/components/estimator/productStageSync.js
var PRODUCT_TO_STAGE = {
  order_review: "sales",
  awaiting_customer_action: "sales",
  site_survey: "design",
  permitting: "permitting",
  awaiting_proof_approval: "design",
  design_review: "design",
  in_design: "design",
  proof_approved: "production",
  in_production: "production",
  quality_control: "fabrication",
  vended: "installation",
  install_or_removal_only: "installation",
  service_repair: "installation"
};

// src/components/estimator/depositGate.js
var GATED_STAGES = /* @__PURE__ */ new Set(["production", "fabrication"]);
var DEPOSIT_GATED_STATUSES = new Set(
  Object.entries(PRODUCT_TO_STAGE).filter(([, stage]) => GATED_STAGES.has(stage)).map(([status]) => status)
);

// src/components/estimator/workOrderConversion.js
var num7 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var norm3 = (value) => String(value || "").trim().toLowerCase();
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
    const quantity = Math.max(0, num7(priced.quantity, num7(line.customer_quantity, 1)));
    const unitPrice = num7(priced.unitRaw, acceptedCustomerUnitPrice(line));
    const adjustedTotal = Number.isFinite(Number(priced.adjusted)) ? Number(priced.adjusted) : unitPrice * quantity * (1 + num7(line.adjustment_percent) / 100);
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
    const seededStatus = explicitStatus && norm3(explicitStatus) !== "none" ? explicitStatus : INITIAL_OPERATIONAL_STATUS;
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
      queue_priority: num7(line.queue_priority, 0),
      proof_status: line.proof_status || "none",
      proof_file_url: line.proof_file_url || "",
      proof_file_name: line.proof_file_name || "",
      proof_version: num7(line.proof_version, 0),
      proof_approved_version: num7(line.proof_approved_version, 0)
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
function customerFacingStatusLabel(operationalStatus, explicit = "") {
  if (String(explicit || "").trim()) return String(explicit).trim();
  return OPERATIONAL_STATUS_CUSTOMER_LABELS[norm3(operationalStatus)] || "";
}
var productKey = (product2 = {}) => {
  if (product2.id) return `id:${product2.id}`;
  return `name:${norm3(product2.description)}|type:${norm3(product2.product_type)}`;
};
function mergeWorkOrderProducts(existingProducts = [], estimateProducts = []) {
  const merged = [...existingProducts || []];
  const keys = new Set(merged.map(productKey));
  for (const product2 of estimateProducts || []) {
    const key = productKey(product2);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(product2);
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
    const type = CONVERSION_ACTOR_TYPES.includes(norm3(actor.type)) ? norm3(actor.type) : "staff";
    return { type, label: firstNonBlank(actor.label, actor.name, actor.email, actor.display_name) };
  }
  return { type: "staff", label: String(actor ?? "").trim() };
};
function buildConversionEvent({ estimate = {}, workOrder = null, product: product2 = null, actor = "", now = "" } = {}) {
  const parsedNow = now ? new Date(now) : null;
  const occurred_at = (parsedNow && !Number.isNaN(parsedNow.getTime()) ? parsedNow : /* @__PURE__ */ new Date()).toISOString();
  const status = String(estimate?.status || "approved").trim().toUpperCase() || "APPROVED";
  const label = `Estimate Converted to Order - via product status (${status})`;
  const who = conversionActorParts(actor);
  const estimateId = String(estimate?.id || "").trim();
  const workOrderId = String(workOrder?.id || "").trim();
  const productId = String(product2?.id || "").trim();
  return {
    schema_version: 1,
    // Stable retry-safe receipt — rebuilding the same conversion regenerates
    // the same key, so a persist path honoring creation_request_key and the
    // merge helper below never double-write history.
    creation_request_key: `estimate_conversion:${estimateId || "unknown"}:${workOrderId || "new"}:${productId || "order"}`,
    work_order_id: workOrderId,
    product_id: productId,
    product_label: firstNonBlank(product2?.description, product2?.client_product_name, product2?.product_name),
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
      estimate_line_id: String(product2?.estimate_line_id || ""),
      builder_product_id: String(product2?.builder_product_id || "")
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
  const mine = (Array.isArray(products) ? products : []).filter((product2) => {
    if (!product2 || typeof product2 !== "object") return false;
    if (estimateId && String(product2?.source_estimate_id || "").trim() === estimateId) return true;
    if (lineIds.has(String(product2?.estimate_line_id || "").trim())) return true;
    if (builderProductIds.has(String(product2?.builder_product_id || "").trim())) return true;
    return false;
  });
  if (!mine.length) return [buildConversionEvent({ estimate, workOrder, actor, now })];
  return mine.map((product2) => buildConversionEvent({ estimate, workOrder, product: product2, actor, now }));
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
  const priced = num7(pricing?.quoteTotal, NaN);
  if (Number.isFinite(priced)) return priced;
  const quoted = num7(estimate?.quote_total, NaN);
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

// src/components/estimator/estimateConversionService.js
var num8 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var str = (value) => String(value ?? "").trim();
var defaultEntities = () => ({
  Estimate: base44.entities.AllInOneEstimate,
  WorkOrder: base44.entities.WorkOrder
});
var ESTIMATE_SECTION_TASK_TEMPLATES = {
  channel_letters: ["Verify letter pattern & depth before production", "Confirm raceway/wireway routing with site"],
  foundation: ["Confirm footing depth/diameter with site conditions", "Order concrete & schedule pour window"],
  vinyl: ["Confirm surface prep & temperature window", "Order vinyl media and laminate"],
  cnc: ["Approve cut file/toolpath before material pull", "Verify sheet stock on hand"],
  laser: ["Approve cut file before material pull", "Verify sheet stock thickness on hand"],
  metal: ["Confirm weld/finish spec with drawings", "Order metal stock & consumables"],
  brick_stone: ["Confirm substrate/masonry anchoring spec", "Stage stone/material before install"],
  maintenance: ["Schedule service window with customer", "Stage replacement parts/lamps"],
  painting: ["Confirm color/sheen approval with customer", "Mask & prep surfaces before spray"]
};
function buildEstimateWorkOrderSeedTasks(estimate, { idPrefix = "" } = {}) {
  return (Array.isArray(estimate?.line_items) ? estimate.line_items : []).flatMap((line) => {
    const moduleKey = str(line?.module_key);
    const template = (ESTIMATE_SECTION_TASK_TEMPLATES[moduleKey] || []).map((text2, i) => ({
      id: `${idPrefix}tpl_${moduleKey}_${line?.line_id || i}_${i}`,
      text: text2,
      completed: false
    }));
    const sectionTask = {
      id: `${idPrefix}sec_${line?.line_id || Math.random().toString(36).slice(2, 10)}`,
      text: `Estimate section: ${line?.client_product_name || line?.builder_name || moduleKey || "Product"}`,
      completed: false
    };
    return sectionTask.text !== "Estimate section: Product" ? [...template, sectionTask] : template;
  });
}
async function buildEstimateMaterialsManifest(estimate, { parts = null } = {}) {
  const estimateId = str(estimate?.id);
  if (!estimateId) return [];
  if (parts != null && !Array.isArray(parts)) {
    throw new Error("Parts must be an array when provided for material conversion.");
  }
  const lines = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  const lineByProduct = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const bpid = str(line?.builder_product_id);
    if (bpid) lineByProduct.set(bpid, line);
  }
  let allParts = parts;
  if (!Array.isArray(allParts)) {
    allParts = [];
    const seen = /* @__PURE__ */ new Set();
    const byEstimate = await loadAllEntityRows({
      entity: staffEntities.BuilderPart,
      query: { estimate_id: estimateId },
      sort: "created_date",
      label: "Conversion materials manifest"
    });
    for (const p of byEstimate) {
      const id = str(p?.id);
      if (id && !seen.has(id)) {
        seen.add(id);
        allParts.push(p);
      }
    }
    for (const bpid of lineByProduct.keys()) {
      const rows = await loadAllEntityRows({
        entity: staffEntities.BuilderPart,
        query: { builder_product_id: bpid },
        sort: "created_date",
        label: "Conversion Product materials manifest"
      });
      for (const p of rows) {
        const id = str(p?.id);
        if (id && !seen.has(id)) {
          seen.add(id);
          allParts.push(p);
        }
      }
    }
  }
  return allParts.filter((p) => p && p.is_active !== false).map((p) => {
    const line = lineByProduct.get(str(p?.builder_product_id)) || null;
    return {
      builder_part_id: str(p?.id),
      part_key: str(p?.part_key),
      part_name: str(p?.part_name) || str(p?.client_label) || str(p?.inventory_item_name) || "Part",
      part_type: str(p?.part_type),
      part_subtype: str(p?.part_subtype),
      quantity: num8(p?.quantity, 1),
      unit: str(p?.unit),
      unit_cost: num8(p?.frozen_unit_cost),
      extended_cost: num8(p?.frozen_extended_cost),
      inventory_item_id: str(p?.inventory_item_id),
      inventory_item_name: str(p?.inventory_item_name),
      source: "estimate_conversion",
      source_estimate_id: estimateId,
      source_estimate_number: str(estimate?.estimate_number),
      estimate_line_id: str(line?.line_id),
      builder_product_id: str(p?.builder_product_id),
      module_key: str(line?.module_key) || str(p?.source_module_key),
      section_name: str(line?.client_product_name || line?.project_name),
      ...projectFoundationReinforcementWorkOrderPart(p)
    };
  }).sort((a, b) => a.part_name.localeCompare(b.part_name));
}
function mergeWorkOrderMaterials(existing = [], incoming = []) {
  const merged = [...Array.isArray(existing) ? existing : []];
  const keys = new Set(merged.map((m) => `${str(m?.builder_part_id)}|${str(m?.source_estimate_id)}`));
  for (const row of incoming || []) {
    const key = `${str(row?.builder_part_id)}|${str(row?.source_estimate_id)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(row);
  }
  return merged;
}
async function prepareEstimateConversion({
  estimate,
  expectedUpdatedDate = void 0,
  entities = null,
  sharedWorkOrder = void 0
} = {}) {
  const { Estimate, WorkOrder } = entities || defaultEntities();
  const estimateBefore = await Estimate.get(str(estimate?.id));
  const pendingPrice = getPendingEstimatePriceAcceptance(estimateBefore);
  if (pendingPrice) {
    const name = pendingPrice.line?.client_product_name || pendingPrice.line?.project_name || "Product";
    const resumeLabel = pendingPrice.pending?.kind === "builder_initial_freeze" ? "Resume Initial Price" : pendingPrice.pending?.kind === "builder_detach_override" ? "Resume Part Detach" : pendingPrice.pending?.kind === "builder_detached_override_update" ? "Resume Part Change" : pendingPrice.pending?.kind === "builder_reattach_parts" ? "Resume Reattach" : pendingPrice.pending?.kind === "builder_manual_part_add" ? "Resume Part Add" : pendingPrice.pending?.kind === "builder_manual_part_edit" ? "Resume Part Edit" : pendingPrice.pending?.kind === "builder_manual_part_switch" ? "Resume Part Switch" : pendingPrice.pending?.kind === "builder_manual_part_remove" ? "Resume Part Remove" : pendingPrice.pending?.kind === "builder_part_package_add" ? "Resume Part Insert" : pendingPrice.pending?.kind === "builder_manual_product_price" ? "Resume Product Price" : pendingPrice.pending?.kind === "builder_part_group_clone" ? "Resume Group Clone" : pendingPrice.pending?.kind === "builder_part_group_move" ? "Resume Group Move" : pendingPrice.pending?.kind === "builder_part_group_create" ? "Resume Group Create" : pendingPrice.pending?.kind === "builder_part_group_dissolve" ? "Resume Group Dissolve" : pendingPrice.pending?.kind === "builder_blank_product_insert" ? "Resume Product Add" : pendingPrice.pending?.kind === "builder_product_remove" ? "Resume Product Remove" : pendingPrice.pending?.kind === "builder_quick_product_insert" ? pendingPrice.pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product" : "Resume Price Update";
    throw new Error(`"${name}" has a Builder mutation recovery pending. Use ${resumeLabel} before converting this estimate to a Work Order.`);
  }
  if (estimateBefore.status !== "approved") {
    throw new Error("Only an Approved estimate can be converted to a Work Order. Record customer acceptance or approve the estimate first.");
  }
  if (estimateBefore.pipeline_sync_pending) {
    throw new Error("Sales Pipeline synchronization is still pending. Retry that synchronization from Finalize Estimate before converting this estimate to a Work Order.");
  }
  const anchor = expectedUpdatedDate === void 0 ? estimate?.updated_date : expectedUpdatedDate;
  if (anchor && estimateBefore.updated_date && anchor !== estimateBefore.updated_date) {
    throw new Error("This estimate changed in another session. Reload before converting so newer approved pricing/details are not overwritten.");
  }
  let existing = null;
  if (sharedWorkOrder !== void 0) {
    existing = sharedWorkOrder;
  } else {
    const matches = await WorkOrder.filter({ estimate_id: estimate.id });
    const activeMatches = (matches || []).filter((row) => row?.deleted !== true);
    existing = selectExistingEstimateWorkOrder(activeMatches, estimateBefore.work_order_id || estimate.work_order_id);
    if (!existing && (matches || []).some((row) => row?.deleted === true)) {
      throw new Error("This estimate's linked Work Order is in Trash. Restore that Work Order from Project Trash before converting the estimate again.");
    }
    const linkedId = str(estimateBefore.work_order_id || estimate.work_order_id);
    if (!existing && linkedId) {
      const linked = await WorkOrder.get(linkedId);
      if (linked?.id && linked.deleted !== true) existing = linked;
    }
  }
  const customers = await loadAllCustomers();
  const resolvedCustomer = await resolveCustomerForEstimate(
    { ...estimateBefore, customer_id: existing?.customer_id || estimateBefore.customer_id || "" },
    customers || []
  );
  const verifiedCustomerId = resolvedCustomer?.id || "";
  return { estimateBefore, existing, resolvedCustomer, verifiedCustomerId };
}
async function checkEstimateConversionCredit({
  resolvedCustomer,
  estimate,
  pricing = {},
  currentUser = null,
  sessionToken = "",
  decide = null
} = {}) {
  if (!resolvedCustomer?.id) return { outcome: "ok" };
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
  const customerName = resolvedCustomer?.company_name || "This customer";
  const decideOrBlock = async (kind, message) => {
    if (typeof decide === "function") {
      const answer = await decide({ kind, message, isAdmin });
      if (answer === "blocked") return { outcome: "blocked", reason: message };
      return answer ? { outcome: "ok" } : { outcome: "aborted", reason: message };
    }
    return isAdmin ? { outcome: "blocked", reason: `${message} (admin may override interactively)` } : { outcome: "blocked", reason: message };
  };
  if (resolvedCustomer?.credit_hold === true) {
    return decideOrBlock("credit_hold", `${customerName} is on CREDIT HOLD \u2014 new work orders are blocked. An administrator can clear the hold on the customer record.`);
  }
  if (Number(resolvedCustomer?.credit_limit) > 0) {
    const limit = Number(resolvedCustomer.credit_limit);
    const estimateTotal = Number.isFinite(num8(pricing.quoteTotal, NaN)) ? num8(pricing.quoteTotal) : (estimate?.line_items || []).reduce(
      (sum, l) => sum + acceptedCustomerUnitPrice(l) * Math.max(1, Number(l?.customer_quantity) || 1),
      0
    );
    let openAr = null;
    if (sessionToken) {
      try {
        const r = await base44.functions.invoke("invoicingAction", {
          session_token: sessionToken,
          action: "list_invoices",
          limit: 500
        });
        const data = r?.data || r;
        if (data?.success) {
          openAr = (data.invoices || []).reduce(
            (sum, inv) => inv?.customer_id === resolvedCustomer.id && inv?.status !== "void" ? sum + (Number(inv?.balance_due) || 0) : sum,
            0
          );
        }
      } catch {
      }
    }
    const exposure = (openAr || 0) + estimateTotal;
    if (exposure > limit + 5e-3) {
      const arNote = openAr == null ? "open AR could not be loaded" : `open AR ${openAr.toFixed(2)}`;
      return decideOrBlock("credit_limit", `${customerName} would exceed its credit limit \u2014 ${arNote} + this estimate ${estimateTotal.toFixed(2)} = ${exposure.toFixed(2)} vs limit ${limit.toFixed(2)}.`);
    }
  }
  return { outcome: "ok" };
}
async function commitEstimateConversion({
  estimate,
  estimateBefore,
  existing,
  verifiedCustomerId,
  pricing = {},
  sessionToken = "",
  entities = null,
  extraWorkOrderFields = {},
  idempotencyPrefix = "work_order_conversion",
  reason = "Converted approved estimate to Work Order"
} = {}) {
  const { Estimate, WorkOrder } = entities || defaultEntities();
  const src = estimateBefore || estimate;
  const sections = (src.line_items || []).map((l) => `\u2022 ${getModuleLabel(l.module_key)} \u2014 ${l.project_name}`).join("\n");
  const estimateProducts = buildEstimateWorkOrderProducts(src, pricing).map((product2) => ({
    ...product2,
    source_estimate_id: src.id || "",
    source_estimate_number: src.estimate_number || ""
  }));
  const products = mergeWorkOrderProducts(existing?.products || [], estimateProducts);
  const generatedDescription = [src.notes, sections].filter(Boolean).join("\n\n");
  const materials = mergeWorkOrderMaterials(
    existing?.materials || [],
    await buildEstimateMaterialsManifest(src)
  );
  const convertedFields = buildConvertedWorkOrderFields({
    estimate: src,
    pricing,
    existing,
    products,
    generatedDescription,
    conversionDate: localDateStamp(),
    verifiedCustomerId
  });
  const hasConversionSalesActivity = !existing || hasVerifiedEstimateSalesActivity(existing, convertedFields, {
    includeProducts: true
  });
  const conversionActivityStamp = (/* @__PURE__ */ new Date()).toISOString();
  const workOrderFields = {
    ...convertedFields,
    materials,
    ...extraWorkOrderFields,
    ...hasConversionSalesActivity ? { sales_last_activity_at: conversionActivityStamp } : {},
    ...existing?.sales_status !== "won" ? { sales_stage_changed_at: conversionActivityStamp } : {}
  };
  let workOrder;
  if (existing?.id) {
    workOrder = await replaceWorkOrderFieldsIfUnchanged({
      workOrderId: existing.id,
      expectedFields: expectedWorkOrderFields(existing, workOrderFields),
      nextFields: workOrderFields,
      label: "Approved estimate Work Order conversion"
    });
  } else {
    const seedTasks = buildEstimateWorkOrderSeedTasks(src);
    const createFields = {
      ...workOrderFields,
      ...seedTasks.length ? { tasks: seedTasks } : {}
    };
    workOrder = await createEstimateLinkedWorkOrderWithRecovery({
      entity: WorkOrder,
      estimateId: src.id,
      data: createFields,
      label: "Approved estimate Work Order conversion",
      convergeCreated: (created) => convergeCreatedEstimateWorkOrder({
        estimateId: src.id,
        created,
        fields: createFields,
        sessionToken,
        duplicateLabel: "Work Order during simultaneous conversion"
      })
    });
  }
  const internalCost = acceptedInternalEstimateCost(src.line_items || []);
  const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...estimateData } = src;
  const conversionEstimateFields = {
    ...estimateData,
    work_order_id: workOrder.id,
    status: "approved",
    edit_reason: "",
    total_cost: internalCost,
    quote_total: num8(pricing.quoteTotal, num8(src.quote_total)),
    sales_stage: "won",
    sales_stage_changed_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const estimateAfter = {
    ...src,
    ...conversionEstimateFields
  };
  const estimateSaved = await replaceEstimateFieldsIfUnchanged({
    entity: Estimate,
    estimateId: src.id,
    expectedFields: expectedEstimateFields(src, conversionEstimateFields),
    guardFields: { updated_date: src.updated_date },
    nextFields: conversionEstimateFields,
    label: "Approved Estimate Work Order conversion link"
  });
  await ensureEstimateLifecycleRevision({
    idempotencyKey: `${idempotencyPrefix}:${workOrder.id}`,
    sessionToken,
    estimateBefore: src,
    estimateAfter,
    reason,
    revisionType: "conversion",
    quoteTotalBefore: src.quote_total,
    quoteTotalAfter: conversionEstimateFields.quote_total,
    internalCostBefore: src.total_cost,
    internalCostAfter: internalCost,
    workOrderId: workOrder.id
  });
  return { workOrder, estimateSaved };
}
async function convertEstimateToWorkOrder({
  estimate,
  pricing = {},
  sessionToken = "",
  currentUser = null,
  expectedUpdatedDate = void 0,
  entities = null,
  hooks = {}
} = {}) {
  const prepared = await prepareEstimateConversion({ estimate, expectedUpdatedDate, entities });
  const credit = await checkEstimateConversionCredit({
    resolvedCustomer: prepared.resolvedCustomer,
    estimate: prepared.estimateBefore,
    pricing,
    currentUser,
    sessionToken,
    decide: hooks.decideCredit
  });
  if (credit.outcome === "blocked") {
    return { status: "blocked", reason: credit.reason, prepared };
  }
  if (credit.outcome === "aborted") {
    return { status: "aborted", reason: credit.reason, prepared };
  }
  if (typeof hooks.confirmBeforeCommit === "function") {
    const proceed = await hooks.confirmBeforeCommit(prepared);
    if (!proceed) return { status: "aborted", prepared };
  }
  const result = await commitEstimateConversion({
    estimate,
    estimateBefore: prepared.estimateBefore,
    existing: prepared.existing,
    verifiedCustomerId: prepared.verifiedCustomerId,
    pricing,
    sessionToken,
    entities
  });
  return { status: "converted", ...result };
}

// src/components/jobs/productsToPartsModel.js
var clean = (v) => String(v ?? "").trim();
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var num9 = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
var firstPresent = (...vals) => vals.find((v) => v !== void 0 && v !== null && !(typeof v === "string" && v.trim() === ""));
var PART_TYPE_BUCKETS = Object.freeze(["materials", "labor", "equipment", "other"]);
var BUCKET_BY_TYPE = {
  material: "materials",
  materials: "materials",
  fabrication: "materials",
  // fabricated subassembly = a produced physical part
  substrate: "materials",
  hardware: "materials",
  vinyl: "materials",
  lighting: "materials",
  supply: "materials",
  supplies: "materials",
  component: "materials",
  inventory: "materials",
  part: "materials",
  product: "materials",
  labor: "labor",
  design: "labor",
  design_production: "labor",
  artwork: "labor",
  service: "labor",
  // service lines (delivery, install services) are work, not stock
  installation: "labor",
  install: "labor",
  equipment: "equipment",
  machine: "equipment",
  rental: "equipment",
  crane: "equipment",
  permit: "other",
  other: "other"
};
function bucketForPartType(partType) {
  return BUCKET_BY_TYPE[clean(partType).toLowerCase()] || "other";
}
var TOP_LEVEL_LIST_KEYS = ["parts", "part_list", "builder_parts", "line_items", "materials", "components"];
var SNAPSHOT_LIST_KEYS = ["parts", "part_list", "builder_parts", "materials", "line_items"];
var listFrom = (value) => {
  if (Array.isArray(value)) return value.filter(isObj);
  if (isObj(value)) return Object.values(value).filter(isObj);
  return [];
};
function embeddedPartList(product2) {
  const p = isObj(product2) ? product2 : {};
  for (const key of TOP_LEVEL_LIST_KEYS) {
    const rows = listFrom(p[key]);
    if (rows.length) return { rows, field: key };
  }
  const snap = isObj(p.builder_snapshot) ? p.builder_snapshot : {};
  for (const key of SNAPSHOT_LIST_KEYS) {
    const rows = listFrom(snap[key]);
    if (rows.length) return { rows, field: `builder_snapshot.${key}` };
  }
  return { rows: [], field: "" };
}
var REF_KEYS = ["part_id", "builder_part_id", "id", "part_key", "inventory_item_id", "line_id"];
var rowRefs = (row = {}) => REF_KEYS.map((k) => clean(row?.[k])).filter(Boolean);
function catalogRows(catalog) {
  if (!catalog) return [];
  if (catalog instanceof Map) return [...catalog.values()].filter(isObj);
  if (Array.isArray(catalog)) return catalog.filter(isObj);
  if (isObj(catalog)) return Object.values(catalog).filter(isObj);
  return [];
}
function catalogIndex(catalog) {
  const index = /* @__PURE__ */ new Map();
  for (const row of catalogRows(catalog)) {
    for (const ref of rowRefs(row)) {
      if (!index.has(ref)) index.set(ref, row);
    }
  }
  return index;
}
var matchCatalog = (index, row) => {
  for (const ref of rowRefs(row)) {
    const hit = index.get(ref);
    if (hit) return hit;
  }
  return null;
};
var nameOf = (r = {}) => clean(firstPresent(
  r.part_name,
  r.name,
  r.client_label,
  r.item_label,
  r.part_label,
  r.inventory_item_name,
  r.material_name,
  r.service_name,
  r.description,
  r.part_key
));
var typeOf = (r = {}) => clean(firstPresent(r.part_type, r.type, r.item_type, r.kind));
var subtypeOf = (r = {}) => clean(firstPresent(r.part_subtype, r.subtype));
var unitOf = (r = {}) => clean(firstPresent(r.unit, r.uom, r.pricing_mode));
var qtyOf = (r = {}) => num9(firstPresent(r.quantity, r.part_qty, r.qty, r.count), 1);
var centsDirect = (r, keys) => {
  for (const k of keys) {
    const v = r?.[k];
    if (Number.isFinite(Number(v))) return Math.round(Number(v));
  }
  return null;
};
var centsFromDollars = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null;
var unitDollars = (r = {}) => {
  const manual = r.manual_cost_override === true ? r.manual_cost : void 0;
  return firstPresent(
    manual,
    r.unit_cost,
    r.unitCost,
    r.frozen_unit_cost,
    r.current_unit_cost,
    r.unit_price,
    r.cost_per_unit,
    r.default_rate,
    r.price,
    r.manual_cost
  );
};
var extendedDollars = (r = {}) => {
  const explicit = firstPresent(
    r.price_override,
    // QuickProduct: replaces the whole line total
    r.extended_cost,
    r.ext_cost,
    r.extCost,
    r.frozen_extended_cost,
    r.current_extended_cost,
    r.total_cost,
    r.line_total,
    r.total
  );
  if (explicit !== void 0) return explicit;
  if (Number.isFinite(Number(r.part_price)) || Number.isFinite(Number(r.modifier_price))) {
    return num9(r.part_price) + num9(r.modifier_price);
  }
  return void 0;
};
var unitCents = (r = {}) => centsDirect(r, ["unit_cost_cents", "unitCostCents", "cost_cents"]) ?? centsFromDollars(unitDollars(r));
var extendedCents = (r = {}) => centsDirect(r, ["extended_cents", "ext_cost_cents", "extendedCostCents", "total_cost_cents"]) ?? centsFromDollars(extendedDollars(r));
function normalizePartRow(raw, source) {
  const r = isObj(raw) ? raw : {};
  const projection = Object.hasOwn(r, "foundation_reinforcement_handoff") ? null : projectFoundationReinforcementWorkOrderPart(r);
  const handoffRow = projection ? { ...r, ...projection } : r;
  const reinforcement = readFoundationReinforcementWorkOrderPart(handoffRow);
  if (reinforcement) {
    const part_type2 = typeOf(r);
    return {
      part_id: clean(firstPresent(r.part_id, r.builder_part_id, r.id, r.part_key, r.inventory_item_id, r.line_id)),
      part_key: clean(r.part_key),
      name: nameOf(r),
      part_type: part_type2,
      part_subtype: subtypeOf(r),
      type_bucket: bucketForPartType(part_type2),
      quantity: reinforcement.quantity ?? null,
      unit: reinforcement.unit,
      unit_cost_cents: reinforcement.unit_cost === void 0 ? null : Math.round(reinforcement.unit_cost * 100),
      extended_cents: Math.round(reinforcement.extended_cost * 100),
      foundation_reinforcement_handoff: structuredClone(handoffRow.foundation_reinforcement_handoff),
      source,
      enriched: false,
      enriched_fields: []
    };
  }
  const quantity = qtyOf(r);
  let unit_cost_cents = unitCents(r);
  let extended_cents = extendedCents(r);
  if (extended_cents == null && unit_cost_cents != null) {
    extended_cents = Math.round(unit_cost_cents * quantity);
  }
  if (unit_cost_cents == null && extended_cents != null && quantity > 0) {
    unit_cost_cents = Math.round(extended_cents / quantity);
  }
  const part_type = typeOf(r);
  return {
    part_id: clean(firstPresent(r.part_id, r.builder_part_id, r.id, r.part_key, r.inventory_item_id, r.line_id)),
    part_key: clean(r.part_key),
    name: nameOf(r),
    part_type,
    part_subtype: subtypeOf(r),
    type_bucket: bucketForPartType(part_type),
    quantity,
    unit: unitOf(r),
    unit_cost_cents,
    extended_cents,
    source,
    enriched: false,
    enriched_fields: []
  };
}
function enrichFromCatalog(row, catalogRow) {
  if (row.foundation_reinforcement_handoff) return row;
  if (!catalogRow) return row;
  const filled = [];
  const cat = normalizePartRow(catalogRow, "catalog");
  if (!row.name && cat.name) {
    row.name = cat.name;
    filled.push("name");
  }
  if (row.unit_cost_cents == null && cat.unit_cost_cents != null) {
    row.unit_cost_cents = cat.unit_cost_cents;
    filled.push("unit_cost_cents");
  }
  if (row.extended_cents == null && cat.extended_cents != null) {
    row.extended_cents = cat.extended_cents;
    filled.push("extended_cents");
  }
  if (row.unit_cost_cents == null && row.extended_cents != null && row.quantity > 0) {
    row.unit_cost_cents = Math.round(row.extended_cents / row.quantity);
    filled.push("unit_cost_cents");
  }
  if (row.extended_cents == null && row.unit_cost_cents != null) {
    row.extended_cents = Math.round(row.unit_cost_cents * row.quantity);
    filled.push("extended_cents");
  }
  if (filled.length) {
    row.enriched = true;
    row.enriched_fields = [...new Set(filled)];
  }
  return row;
}
function catalogRowsForProduct(product2, catalog) {
  const p = isObj(product2) ? product2 : {};
  const bp = clean(p.builder_product_id);
  const line = clean(p.estimate_line_id);
  const pid = clean(firstPresent(p.id, p.product_id));
  if (!bp && !line && !pid) return [];
  const seen = /* @__PURE__ */ new Set();
  return catalogRows(catalog).filter((row) => {
    if (row.is_active === false || row.deleted === true) return false;
    const rowId = clean(row.id);
    const linked = bp && clean(row.builder_product_id) === bp || line && (clean(row.estimate_line_id) === line || clean(row.line_id) === line) || pid && (clean(row.product_id) === pid || clean(row.work_order_product_id) === pid || clean(row.builder_product_id) === pid || clean(row.estimate_line_id) === pid || clean(row.line_id) === pid);
    if (!linked) return false;
    const dedupe = rowId || `${clean(row.part_key)}|${nameOf(row)}`;
    if (seen.has(dedupe)) return false;
    seen.add(dedupe);
    return true;
  });
}
function productParts(product2, { partsCatalog } = {}) {
  if (!isObj(product2)) return [];
  const index = catalogIndex(partsCatalog);
  const { rows: embedded } = embeddedPartList(product2);
  if (embedded.length) {
    return embedded.filter((r) => r.is_active !== false && r.deleted !== true).map((r) => {
      const row = normalizePartRow(r, "snapshot");
      const hit = index.size ? matchCatalog(index, r) : null;
      return hit ? enrichFromCatalog(row, hit) : row;
    });
  }
  return catalogRowsForProduct(product2, partsCatalog).map((r) => normalizePartRow(r, "catalog"));
}
function partsSummary(product2, parts) {
  const list = Array.isArray(parts) ? parts.map((r) => "type_bucket" in (r || {}) || "extended_cents" in (r || {}) ? r : normalizePartRow(r, "snapshot")) : productParts(product2);
  const by_type = {
    materials: { count: 0, cost_cents: 0 },
    labor: { count: 0, cost_cents: 0 },
    equipment: { count: 0, cost_cents: 0 },
    other: { count: 0, cost_cents: 0 }
  };
  let total_cost_cents = 0;
  let total_quantity = 0;
  let uncosted_parts = 0;
  for (const part of list) {
    const bucket = PART_TYPE_BUCKETS.includes(part?.type_bucket) ? part.type_bucket : "other";
    const cost = Number.isFinite(part?.extended_cents) ? part.extended_cents : 0;
    by_type[bucket].count += 1;
    by_type[bucket].cost_cents += cost;
    total_cost_cents += cost;
    total_quantity += num9(part?.quantity);
    if (!Number.isFinite(part?.extended_cents) && !Number.isFinite(part?.unit_cost_cents)) uncosted_parts += 1;
  }
  return {
    total_parts: list.length,
    total_quantity,
    total_cost_cents,
    uncosted_parts,
    by_type
  };
}

// src/components/estimator/foundation/foundationReinforcementPrintMaterial.js
var clean2 = (value) => String(value ?? "").trim();
var displayQuantity = (value) => typeof value === "number" && Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
function foundationReinforcementPrintMaterial(part) {
  const projection = Object.hasOwn(part || {}, "foundation_reinforcement_handoff") ? null : projectFoundationReinforcementWorkOrderPart(part);
  const row = projection ? { ...part, ...projection } : part;
  const value = readFoundationReinforcementWorkOrderPart(row);
  if (!value) return null;
  const basis = value.frozenStatus === "recorded" ? `Frozen priced quantity: ${displayQuantity(value.quantity)} ${value.unit}.` : "Frozen quantity and unit cost: Not recorded. Saved extended amount retained.";
  const physical = value.part_type === "material" ? `Physical steel (last calculated): ${displayQuantity(value.physical_quantity_ft)} ft; ${displayQuantity(value.physical_weight_lbs)} lb.` : `Last-calculated labor: ${displayQuantity(value.last_priced_quantity)} ${value.last_priced_unit}.`;
  const selection = value.part_type === "material" ? `Last-calculated material: ${clean2(value.last_calculated_material.name) || "Unnamed steel"}.` : "";
  return {
    name: clean2(row.part_name) || clean2(row.name) || clean2(row.inventory_item_name) || "Reinforcement",
    type: value.part_type,
    qty: displayQuantity(value.quantity ?? ""),
    unit: value.unit,
    unit_cost: value.unit_cost ?? null,
    ext_cost: value.extended_cost,
    section: clean2(row.section_name) || clean2(row.module_key),
    reinforcement_note: [
      basis,
      physical,
      selection,
      "Pricing and physical quantities are not a purchasing plan. Engineering and purchasing review required."
    ].filter(Boolean).join(" ")
  };
}

// src/components/jobs/printTemplates/workOrderPrintModel.js
var num10 = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
var clean3 = (v) => String(v ?? "").trim();
var firstText = (...vals) => {
  for (const v of vals) {
    const s = clean3(v);
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
      const s = clean3(piece);
      if (s) out.push(s);
    }
  }
  return out;
};
var fmtQty = (v) => {
  const n = num10(v, NaN);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
};
var fmtDate = (v) => {
  const s = clean3(v);
  if (!s) return "";
  const d = s.length === 10 ? /* @__PURE__ */ new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
var moneyOrNull = (v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = num10(v, NaN);
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
    if (!name && !num10(qty)) continue;
    const unitPrice = moneyOrNull(p.quoted_unit_price);
    const extPrice = moneyOrNull(
      p.quoted_total ?? (unitPrice != null && num10(qty) ? unitPrice * num10(qty) : null)
    );
    const unitCost = moneyOrNull(p.unit_cost ?? p.cost ?? p.est_unit_cost);
    const extCost = moneyOrNull(
      p.ext_cost ?? p.extended_cost ?? (unitCost != null && num10(qty) ? unitCost * num10(qty) : null)
    );
    const margin = moneyOrNull(
      p.margin ?? (extPrice != null && extCost != null ? extPrice - extCost : null)
    );
    const status = firstText(
      WO_PRINT_PRODUCT_STATUS_LABELS[clean3(p.operational_status)],
      clean3(p.operational_status),
      clean3(p.fulfillment_state)
    );
    rows.push({
      line: rows.length + 1,
      product_id: clean3(p.id),
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
    const name = clean3(wo[`product_${i}`]);
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
    if (!name && !num10(qty)) continue;
    rows.push({
      name: name || "Material",
      type: firstText(m.part_type, m.part_subtype),
      qty,
      unit: clean3(m.unit),
      unit_cost: moneyOrNull(m.unit_cost),
      ext_cost: moneyOrNull(m.ext_cost ?? m.extended_cost ?? (moneyOrNull(m.unit_cost) != null && num10(qty) ? moneyOrNull(m.unit_cost) * num10(qty) : null)),
      section: firstText(m.section_name, m.module_key)
    });
  }
  return rows;
};
var buildTasks = (wo) => {
  const src = Array.isArray(wo.notes) ? wo.notes : [];
  return src.filter((t) => t && clean3(t.text)).map((t) => ({
    text: clean3(t.text),
    completed: t.completed === true,
    is_milestone: t.is_milestone === true,
    is_critical_path: t.is_critical_path === true,
    assigned_to: clean3(t.assigned_to),
    due_date: fmtDate(t.due_date),
    checklist_context: clean3(t.checklist_context)
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
  const workOrderId = clean3(wo.id);
  const meta = [
    { key: "stage", label: "Stage", value: WO_PRINT_STAGE_LABELS[clean3(wo.current_stage)] || clean3(wo.current_stage) },
    { key: "start_date", label: "Start Date", value: fmtDate(wo.start_date) },
    { key: "due_date", label: "Due Date", value: fmtDate(wo.due_date) },
    { key: "install_date", label: "Install Date", value: fmtDate(wo.project_install_date) },
    { key: "sales_rep", label: "Sales Rep", value: firstText(wo.sales_rep, wo.representative) },
    { key: "project_manager", label: "Project Manager", value: clean3(wo.project_manager) },
    { key: "designer", label: "Designer", value: clean3(wo.designer) },
    { key: "estimator", label: "Estimator", value: clean3(wo.estimator) },
    { key: "assigned_to", label: "Assigned To", value: clean3(wo.assigned_to) },
    { key: "project_type", label: "Project Type", value: clean3(wo.project_type) },
    { key: "permit_number", label: "Permit #", value: clean3(wo.permit_number) },
    { key: "po_number", label: "Customer PO", value: clean3(wo.po_number) }
  ].filter((entry) => entry.value);
  const subtotal = rows.reduce((sum, r) => sum + (r.ext_price != null ? r.ext_price : 0), 0);
  const estimateAmount = moneyOrNull(wo.estimate_amount);
  const depositAmount = moneyOrNull(wo.deposit_amount);
  const totalCost = rows.reduce((sum, r) => sum + (r.internal.ext_cost != null ? r.internal.ext_cost : 0), 0);
  const totalMargin = subtotal - totalCost;
  const hasCompleteCost = rows.length > 0 && rows.every((r) => r.internal.ext_cost != null);
  const hasCompletePrice = rows.length > 0 && rows.every((r) => r.ext_price != null);
  const pieceCount = rows.reduce((sum, r) => sum + (r.qty === "" ? 0 : num10(r.qty)), 0);
  return {
    template_id: clean3(options.templateId ?? options.template_id),
    document_title: firstText(options.documentTitle, "Work Order"),
    order_number: orderNumber || workOrderId || "\u2014",
    job_code: workOrderId ? `WO-${workOrderId.toUpperCase()}` : orderNumber,
    work_order_id: workOrderId,
    work_order_title: clean3(wo.title),
    description: clean3(wo.description),
    image_url: clean3(wo.image_url),
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
        total_cost: hasCompleteCost ? totalCost : null,
        total_margin: hasCompleteCost && hasCompletePrice ? totalMargin : null,
        margin_pct: hasCompleteCost && hasCompletePrice && subtotal ? Math.round(totalMargin / subtotal * 1e3) / 10 : null,
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

// src/components/jobs/printTemplates/templates/_shared.js
var escapeHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var clean4 = (v) => String(v ?? "").trim();
var usd2 = (n, modelFmt) => {
  const fmt = modelFmt && typeof modelFmt.usd === "function" ? modelFmt.usd : (x) => x == null || !Number.isFinite(Number(x)) ? "" : `$${Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return fmt(n);
};
var printedAtText = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? clean4(iso) : d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};
var renderAddressLines = (lines) => Array.isArray(lines) && lines.length ? lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("") : `<div style="color:#94a3b8;">&mdash;</div>`;
function htmlDoc({ title, lang = "en", bodyHtml, extraCss = "", autoPrint = true }) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #0f172a; }
  table { border-collapse: collapse; }
  @media print {
    .no-print { display: none !important; }
    a { color: inherit; text-decoration: none; }
  }
${extraCss}
</style>
</head>
<body>
${bodyHtml}
${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},60);});</script>` : ""}
</body>
</html>`;
}
var asapBadge = (m, label = "ASAP") => m.asap ? `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;vertical-align:middle;">${escapeHtml(label)}</span>` : "";
function companyBlock(company, { align = "left", logoMaxH = 44 } = {}) {
  const c = company || {};
  return `
    <div style="text-align:${align};">
      ${c.logo_url ? `<img src="${escapeHtml(c.logo_url)}" alt="" style="max-height:${logoMaxH}px;max-width:200px;object-fit:contain;display:inline-block;margin-bottom:4px;" />` : ""}
      ${c.name ? `<div style="font-size:15px;font-weight:800;color:#0f172a;">${escapeHtml(c.name)}</div>` : ""}
      <div style="font-size:11px;color:#475569;line-height:1.45;">
        ${renderAddressLines(c.address_lines || [])}
        ${c.phone ? `<div>${escapeHtml(c.phone)}</div>` : ""}
        ${c.email ? `<div>${escapeHtml(c.email)}</div>` : ""}
        ${c.website ? `<div>${escapeHtml(c.website)}</div>` : ""}
      </div>
    </div>`;
}
var fieldLabel = (text2) => `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">${escapeHtml(text2)}</div>`;
var metaStrip = (meta, { columns = 4 } = {}) => Array.isArray(meta) && meta.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">` + meta.map(
  (entry) => `<div style="flex:1;min-width:110px;border:1px solid #cbd5e1;border-radius:4px;padding:5px 8px;text-align:center;">${fieldLabel(entry.label)}<div style="font-size:12px;font-weight:600;color:#1e293b;">${escapeHtml(entry.value)}</div></div>`
).join("") + `</div>` : "";

// src/components/jobs/printTemplates/templates/original.js
var th = (label, align = "left") => `<th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#475569;text-align:${align};">${escapeHtml(label)}</th>`;
var td = (content, { align = "left", bold = false, color = "#0f172a", size = 12 } = {}) => `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:${size}px;color:${color};text-align:${align};${bold ? "font-weight:700;" : ""}">${content}</td>`;
function renderOriginalHtml(model, renderOptions = {}) {
  const m = model || {};
  const rows = Array.isArray(m.rows) ? m.rows : [];
  const materials = Array.isArray(m.materials) ? m.materials : [];
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const t = m.totals || {};
  const ti = t.internal || {};
  const fmt = m.fmt;
  const money = (n) => escapeHtml(usd2(n, fmt));
  const productRows = rows.length ? rows.map((r, i) => {
    const bg = i % 2 ? "#f8fafc" : "#fff";
    return `<tr style="background:${bg};">` + td(`<span style="color:#64748b;">${escapeHtml(r.line ?? i + 1)}</span>`, { align: "right" }) + td(escapeHtml(r.name || "Item"), { bold: true }) + td(escapeHtml(r.type || "\u2014")) + td(escapeHtml(r.qty === "" || r.qty == null ? "\u2014" : r.qty), { align: "center" }) + td(money(r.unit_price), { align: "right" }) + td(money(r.ext_price), { align: "right", bold: true }) + td(`<span style="color:#64748b;">${money(r.internal?.unit_cost)}</span>`, { align: "right" }) + td(`<span style="color:#64748b;">${money(r.internal?.ext_cost)}</span>`, { align: "right" }) + td(`<span style="color:#64748b;">${money(r.internal?.margin)}</span>`, { align: "right" }) + td(escapeHtml(r.status || "\u2014"), { size: 11 }) + `</tr>`;
  }).join("") : `<tr><td colspan="10" style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;">No products on this work order.</td></tr>`;
  const materialRows = materials.length ? materials.map(
    (mat, i) => `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` + td(
      escapeHtml(mat.name) + (mat.reinforcement_note ? '<div style="font-size:9px;font-weight:400;line-height:1.4;color:#64748b;margin-top:3px;overflow-wrap:anywhere;">' + escapeHtml(mat.reinforcement_note) + "</div>" : ""),
      { bold: true }
    ) + td(escapeHtml(mat.type || "\u2014")) + td(escapeHtml(mat.section || "\u2014"), { size: 11 }) + td(escapeHtml(`${mat.qty === "" || mat.qty == null ? "\u2014" : mat.qty}${mat.unit ? ` ${mat.unit}` : ""}`), { align: "center" }) + td(money(mat.unit_cost), { align: "right" }) + td(money(mat.ext_cost), { align: "right" }) + `</tr>`
  ).join("") : "";
  const totalsRows = [
    ["Products Subtotal", t.subtotal],
    t.estimate_amount != null ? ["Contract Total (estimate)", t.estimate_amount] : null,
    t.deposit_required || t.deposit_amount != null ? [`Deposit Required${t.deposit_invoiced ? " (invoiced)" : ""}`, t.deposit_amount] : null,
    t.balance_due != null && t.deposit_amount != null ? ["Balance After Deposit", t.balance_due] : null,
    ti.total_cost != null ? ["Internal Cost", ti.total_cost] : null,
    ti.total_margin != null ? [`Internal Margin${ti.margin_pct != null ? ` (${ti.margin_pct}%)` : ""}`, ti.total_margin] : null,
    ti.actual_cost != null ? ["Actual Cost To Date", ti.actual_cost] : null,
    ti.profit_margin != null ? ["Profit Margin", ti.profit_margin] : null
  ].filter(Boolean);
  const totalsHtml = `
    <table style="width:280px;margin-left:auto;margin-top:10px;border:1.5px solid #334155;">
      ${totalsRows.map(([label, value]) => {
    const strong = /Subtotal|Contract|Balance/.test(label);
    return `<tr style="background:${strong ? "#f1f5f9" : "#fff"};"><td style="padding:5px 10px;font-size:11px;color:#475569;border-bottom:1px solid #e2e8f0;">${escapeHtml(label)}</td><td style="padding:5px 10px;font-size:12px;text-align:right;border-bottom:1px solid #e2e8f0;${strong ? "font-weight:800;color:#0f172a;" : "color:#334155;"}">${money(value)}</td></tr>`;
  }).join("")}
    </table>`;
  const taskRows = tasks.map(
    (task) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;width:26px;text-align:center;"><span style="display:inline-block;width:11px;height:11px;border:1.5px solid #334155;border-radius:2px;background:${task.completed ? "#334155" : "#fff"};"></span></td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;${task.completed ? "color:#94a3b8;text-decoration:line-through;" : "color:#0f172a;"}">${escapeHtml(task.text)}${task.is_milestone ? ' <span style="font-size:9px;font-weight:800;color:#7c3aed;">MILESTONE</span>' : ""}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;white-space:nowrap;">${escapeHtml([task.assigned_to, task.due_date].filter(Boolean).join(" \xB7 "))}</td></tr>`
  ).join("");
  const bodyHtml = `
<div style="max-width:8.5in;margin:0 auto;padding:0.3in;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2.5px solid #0f172a;padding-bottom:10px;">
    ${companyBlock(m.company)}
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.06em;color:#0f172a;text-transform:uppercase;">
        ${escapeHtml(m.document_title || "Work Order")}
      </div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">
        Order <span style="font-weight:700;color:#0f172a;">${escapeHtml(m.order_number)}</span>
      </div>
      ${m.job_code ? `<div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-top:2px;">${escapeHtml(m.job_code)}</div>` : ""}
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Printed ${escapeHtml(printedAtText(m.printed_at))}</div>
      <div style="margin-top:4px;">${asapBadge(m)}${m.completed ? ' <span style="display:inline-block;background:#059669;color:#fff;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;">COMPLETED</span>' : ""}</div>
    </div>
  </div>

  <div style="display:flex;gap:12px;margin-top:10px;">
    <div style="flex:1;border:1.5px solid #334155;border-radius:4px;padding:10px 12px;">
      ${fieldLabel("Bill To")}
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(m.bill_to?.name || "\u2014")}</div>
      ${m.bill_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.bill_to.attention)}</div>` : ""}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">${renderAddressLines(m.bill_to?.address_lines || [])}</div>
      ${m.bill_to?.phone || m.bill_to?.email ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${[m.bill_to.phone, m.bill_to.email].filter(Boolean).map(escapeHtml).join(" &middot; ")}</div>` : ""}
    </div>
    <div style="flex:1;border:1.5px solid #334155;border-radius:4px;padding:10px 12px;">
      ${fieldLabel("Install Site")}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">${renderAddressLines(m.ship_to?.address_lines || [])}</div>
      ${m.ship_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.ship_to.attention)}</div>` : ""}
    </div>
  </div>

  ${m.work_order_title ? `<div style="margin-top:10px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(m.work_order_title)}</div></div>` : ""}
  ${m.description ? `<div style="margin-top:4px;font-size:12px;color:#334155;white-space:pre-wrap;">${escapeHtml(m.description)}</div>` : ""}

  ${metaStrip(m.meta)}

  <div class="wo-table-scroll" role="region" aria-label="Work Order products" tabindex="0">
    <table style="width:100%;margin-top:12px;border:1.5px solid #334155;">
      <thead>
        <tr style="background:#f1f5f9;">
          ${th("#", "right")}${th("Product / Description")}${th("Type")}${th("Qty", "center")}
          ${th("Unit Price", "right")}${th("Ext Price", "right")}
          ${th("Unit Cost", "right")}${th("Ext Cost", "right")}${th("Margin", "right")}
          ${th("Status")}
        </tr>
      </thead>
      <tbody>${productRows}</tbody>
    </table>
  </div>
  <div style="margin-top:4px;font-size:10px;color:#64748b;">
    ${rows.length} line${rows.length === 1 ? "" : "s"}${m.piece_count ? ` \xB7 ${escapeHtml(m.piece_count)} total pieces` : ""}
  </div>

  ${totalsHtml}

  ${materials.length ? `<div style="margin-top:14px;page-break-inside:avoid;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
          Materials Manifest (internal) \u2014 ${materials.length}
        </div>
        <div class="wo-table-scroll" role="region" aria-label="Work Order materials" tabindex="0">
          <table style="width:100%;margin-top:6px;">
            <thead><tr style="background:#f8fafc;">${th("Part")}${th("Type")}${th("Section")}${th("Qty", "center")}${th("Unit Cost", "right")}${th("Ext Cost", "right")}</tr></thead>
            <tbody>${materialRows}</tbody>
          </table>
        </div>
      </div>` : ""}

  ${tasks.length ? `<div style="margin-top:14px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
          Production Checklist \u2014 ${m.task_counts?.done ?? 0}/${m.task_counts?.total ?? tasks.length} done
        </div>
        <table style="width:100%;margin-top:4px;">${taskRows}</table>
      </div>` : ""}

  <div style="display:flex;gap:24px;margin-top:26px;page-break-inside:avoid;">
    ${["Received By", "Approved By", "Date"].map(
    (lbl) => `<div style="flex:1;"><div style="height:26px;border-bottom:1px solid #94a3b8;"></div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;padding-top:2px;text-align:center;">${escapeHtml(lbl)}</div></div>`
  ).join("")}
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:9px;color:#94a3b8;">
    <span>${escapeHtml(m.footer_note || "")}</span>
    <span>${escapeHtml(m.document_title || "Work Order")} &mdash; ${escapeHtml(m.order_number)}${m.job_code ? ` (${escapeHtml(m.job_code)})` : ""}</span>
  </div>
</div>`;
  return htmlDoc({
    title: `${m.document_title || "Work Order"} \u2014 ${m.order_number || ""}`,
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { margin: 0.55in; }
  .sheet { max-width: 8.5in; }
  .wo-table-scroll { max-width: 100%; overflow-x: auto; }
  @media print { .wo-table-scroll { max-width: none; overflow: visible; } }
    `
  });
}
export {
  buildEstimateMaterialsManifest,
  buildEstimateWorkOrderProducts,
  buildWorkOrderPrintModel,
  convertEstimateToWorkOrder,
  partsSummary,
  productParts,
  renderOriginalHtml
};
