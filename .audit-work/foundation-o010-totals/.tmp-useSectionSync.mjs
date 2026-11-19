// .audit-work/foundation-o010-totals/fixture/stubs/base44Client.mjs
var registry = globalThis.__b44EntityRegistry ??= /* @__PURE__ */ new Map();
var emptyEntity = () => ({
  get: async () => null,
  filter: async () => [],
  list: async () => [],
  create: async (row) => ({ id: "stub", ...row }),
  update: async (_id, row) => row,
  delete: async () => ({})
});
var base44 = {
  entities: new Proxy({}, {
    get: (_t, name) => registry.get(name) || emptyEntity()
  }),
  functions: { invoke: async () => ({ data: {} }) }
};

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
var MODULE_TOTAL_FIELD = {
  channel_letters: "total_cost",
  vinyl: "total_cost",
  cnc: "total_cost",
  laser: "total_cost",
  metal: "total_cost",
  brick_stone: "total_cost",
  maintenance: "total_cost",
  custom_items: "total_cost"
};
var LEGACY_MODULES = {};
var getModule = (key) => ESTIMATOR_MODULES.find((m) => m.key === key) || LEGACY_MODULES[key];

// .audit-work/foundation-o010-totals/fixture/stubs/moduleWires.mjs
function channelSellEconomics() {
  return null;
}
function vinylEngineEconomics() {
  return null;
}
function brickEngineEconomics() {
  return null;
}
function cncEngineEconomics() {
  return null;
}
function metalEngineEconomics() {
  return null;
}
function laserEngineEconomics() {
  return null;
}
function paintEngineEconomics() {
  return null;
}
function customItemsEngineEconomics() {
  return null;
}
function maintenanceEngineEconomics() {
  return null;
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
function matrixRowToRule(row, opts = {}) {
  if (!row || typeof row !== "object") return null;
  const out = { ...row };
  out.status = normStr(row.status) === "inactive" ? "inactive" : "active";
  const rawBreaks = Array.isArray(row.per_unit_breaks) ? row.per_unit_breaks : Array.isArray(row.unit_breaks) ? row.unit_breaks : Array.isArray(row.qty_breaks) ? row.qty_breaks : null;
  if (rawBreaks) {
    const clean = rawBreaks.map((b) => ({
      qty: num(b?.qty ?? b?.min_qty ?? b?.quantity, NaN),
      unit_price: num(b?.unit_price ?? b?.price, NaN)
    })).filter((b) => Number.isFinite(b.qty) && b.qty > 0 && Number.isFinite(b.unit_price));
    if (clean.length) out.per_unit_breaks = clean;
    else delete out.per_unit_breaks;
  }
  if (normStr(out.pricing_mode) === "market-based") out.pricing_mode = "market_based";
  const retail = firstFinite(row.market_retail, row.retail_price, row.retail);
  if (retail != null) out.market_retail = retail;
  const discount = firstFinite(row.market_discount_pct, row.discount_pct);
  if (discount != null) out.market_discount_pct = discount;
  if (wantsInterpolatedBreaks(row) || opts.interpolateBreaks === true) {
    out.interpolate_breaks = true;
  }
  return out;
}
function matrixRowsToRules(rows, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.rows) ? rows.rows : [];
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    if (!rowIsActive(row)) continue;
    if (!rowIsEffective(row, now)) continue;
    out.push(matrixRowToRule(row, opts));
  }
  return out;
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
var asString2 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc2 = (v) => asString2(v).toLowerCase();
var toFiniteNumber2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num3 = (v, fallback = 0) => toFiniteNumber2(v) ?? fallback;
var firstField2 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite3 = (rec, fields) => {
  const v = firstField2(rec, fields);
  const n = toFiniteNumber2(v);
  return n === null ? null : n;
};
var firstArray = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord2(rec[f])) return rec[f];
  }
  return null;
};
var round23 = (n) => Math.round((num3(n) + Number.EPSILON) * 100) / 100;
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
var wallCostBreakdown = (rec) => {
  const rows = rec.walls;
  if (!Array.isArray(rows)) return null;
  let hit = false;
  let materials = 0;
  let labor = 0;
  let matQty = 0;
  let labQty = 0;
  for (const w of rows) {
    const costs = isRecord2(w) && isRecord2(w.calculatedCosts) ? w.calculatedCosts : null;
    if (!costs) continue;
    hit = true;
    materials += num3(costs.materialCost) + num3(costs.mortarCost) + num3(costs.internalMaterialCost) + num3(costs.internalMortarCost);
    labor += num3(costs.laborCost) + num3(costs.internalLaborCost);
    matQty += num3(costs.totalBricks) + num3(costs.internalTotalBricks);
    labQty += num3(costs.laborHours) + num3(costs.internalLaborHours);
  }
  return hit ? { materials, labor, matQty, labQty } : null;
};
var CONTEXT_BLOCK_FIELDS = [
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context",
  "engine_context"
];
var NESTED_CONTEXT_FIELDS = ["engine_context", "pricing_engine"];
var ENGINE_LINE_MAP_FIELDS = ["items", "lines", "line_config", "item_config"];
var COMPONENT_BLOCK_SUFFIXES = [
  "pricing",
  "price_config",
  "engine_pricing",
  "pricing_config",
  "engine_price",
  "tier_config",
  "sell_pricing"
];
var ENGINE_MODE_TOKENS = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat",
  "cost_plus",
  "cost-plus",
  "costplus",
  "markup",
  "tier",
  "tier_markup",
  "tiered"
]);
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
var DEFAULT_MARKUP_FIELDS = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
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
var isEngineModeToken = (v) => ENGINE_MODE_TOKENS.has(lc2(v));
var nonEmptyArrayField = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var machineHasConfig = (v) => {
  if (!isRecord2(v)) return false;
  const fixed = firstFinite3(v, FIXED_FIELDS);
  const retail = firstFinite3(v, MARKET_FIELDS);
  const markup = firstFinite3(v, MARKUP_FIELDS2);
  return fixed !== null && fixed > 0 || retail !== null && retail > 0 || markup !== null || firstFinite3(v, MIN_FIELDS) !== null || nonEmptyArrayField(v, [...BREAK_FIELDS, ...FORMULA_FIELDS]) || MODE_FIELDS.some((f) => isEngineModeToken(v[f])) || TIER_REF_FIELDS.some((f) => asString2(v[f]) !== "");
};
function descriptorHasPricingContent(d) {
  if (!isRecord2(d)) return false;
  const fixed = firstFinite3(d, FIXED_FIELDS);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS.some((f) => asString2(d[f]) !== "")) return true;
  if (nonEmptyArrayField(d, BREAK_FIELDS)) return true;
  const retail = firstFinite3(d, MARKET_FIELDS);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite3(d, MARKET_DISCOUNT_FIELDS);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS.some((f) => isEngineModeToken(d[f]))) return true;
  const markup = firstFinite3(d, MARKUP_FIELDS2);
  if (markup !== null) return true;
  if (nonEmptyArrayField(d, FORMULA_FIELDS)) return true;
  if (firstFinite3(d, MIN_FIELDS) !== null) return true;
  if (firstFinite3(d, SETUP_FIELDS) !== null) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord2(v) ? true : asString2(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString2(d[f]) !== "")) return true;
  if (nonEmptyArrayField(d, [...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => asString2(firstField2(d, [f])) !== "")) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}
var componentOf = (key) => {
  const k = lc2(key);
  return FOUNDATION_COMPONENTS.find((c) => c.key === k) ?? null;
};
var carrierKeys = (spec) => [
  ...spec.aliases ?? [],
  spec.key
];
function foundationCostLines(record) {
  if (!isRecord2(record)) return [];
  const lines = [];
  const walls = wallCostBreakdown(record);
  FOUNDATION_COMPONENTS.forEach((comp) => {
    if (comp.key === "wall_materials" || comp.key === "wall_labor") {
      if (!walls) return;
      const isMat = comp.key === "wall_materials";
      lines.push({
        key: comp.key,
        index: lines.length,
        label: comp.label,
        qty: isMat ? walls.matQty : walls.labQty,
        cost: isMat ? walls.materials : walls.labor,
        category_key: comp.category_key,
        item: record,
        origin: "components"
      });
      return;
    }
    if (comp.key === "walls" && walls) return;
    const cost = firstFinite3(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite3(record, comp.qtyFields ?? []) ?? comp.qtyFrom?.(record) ?? 1;
    lines.push({
      key: comp.key,
      index: lines.length,
      label: comp.label,
      qty,
      cost,
      category_key: comp.category_key,
      item: record,
      origin: "components"
    });
  });
  return lines;
}
var contextBlockOf = (record) => {
  const rec = isRecord2(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS) {
    if (isRecord2(rec[f])) return { block: rec[f], field: f };
  }
  const cp = isRecord2(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS) {
      if (isRecord2(cp[f])) return { block: cp[f], field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: "" };
};
function foundationPricingContextOf(record, callerContext = null) {
  const rec = isRecord2(record) ? record : {};
  const caller = isRecord2(callerContext) ? callerContext : {};
  if (callerContext?.__foundationPricingContext === true) {
    return callerContext;
  }
  const { block, field } = contextBlockOf(rec);
  const blk = block ?? {};
  const cp = isRecord2(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField2(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField2(blk, [...TIER_CONTEXT_FIELDS, "tier"]) ?? firstField2(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray(caller, EMBEDDED_RULE_FIELDS) ?? firstArray(blk, EMBEDDED_RULE_FIELDS) ?? [];
  const templates = firstArray(caller, EMBEDDED_TEMPLATE_FIELDS) ?? firstArray(blk, EMBEDDED_TEMPLATE_FIELDS) ?? [];
  const tiers = firstArray(caller, EMBEDDED_TIER_CATALOG_FIELDS) ?? firstArray(blk, EMBEDDED_TIER_CATALOG_FIELDS) ?? [];
  const defaultMarkupPct = firstFinite3(caller, DEFAULT_MARKUP_FIELDS.concat("markup_pct")) ?? firstFinite3(blk, DEFAULT_MARKUP_FIELDS.concat(MARKUP_FIELDS2)) ?? firstFinite3(rec, ["customer_markup_percent"]) ?? 0;
  const taxable = typeof caller.taxable === "boolean" ? caller.taxable : typeof blk.taxable === "boolean" ? blk.taxable : lc2(blk.taxable) === "true" ? true : lc2(blk.taxable) === "false" ? false : void 0;
  const callerModifiers = firstArray(caller, FORMULA_FIELDS);
  const blockModifiers = firstArray(blk, FORMULA_FIELDS);
  return {
    __foundationPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num3(defaultMarkupPct),
    machine: firstField2(blk, MACHINE_FIELDS) ?? firstField2(caller, MACHINE_FIELDS) ?? null,
    taxable,
    taxPercent: num3(firstFinite3(caller, TAX_PCT_FIELDS) ?? firstFinite3(blk, TAX_PCT_FIELDS)),
    setupFee: num3(firstFinite3(caller, SETUP_FIELDS) ?? firstFinite3(blk, SETUP_FIELDS)),
    minimumCharge: num3(firstFinite3(caller, MIN_FIELDS) ?? firstFinite3(blk, MIN_FIELDS)),
    modifiers: callerModifiers ?? blockModifiers ?? void 0,
    lineMap: firstRecord(blk, ENGINE_LINE_MAP_FIELDS),
    now: caller.now ?? blk.now,
    raw: block
  };
}
var componentNestedBlock = (record, spec) => {
  const rec = isRecord2(record) ? record : {};
  let merged = null;
  for (const carrier of carrierKeys(spec)) {
    for (const suffix of COMPONENT_BLOCK_SUFFIXES) {
      const f = `${carrier}_${suffix}`;
      if (isRecord2(rec[f])) merged = { ...merged ?? {}, ...rec[f] };
    }
  }
  return merged;
};
var engineFieldsFrom = (src, prefix = "") => {
  const out = {};
  if (!isRecord2(src)) return out;
  for (const f of FOUNDATION_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== void 0 && src[k] !== null && src[k] !== "") out[f] = src[k];
  }
  return out;
};
function foundationLineDescriptor(line, record = null) {
  const spec = componentOf(line?.key);
  if (!spec) return null;
  const rec = isRecord2(record) ? record : {};
  const carriers = carrierKeys(spec);
  const flat = carriers.reduce(
    (acc, carrier) => ({ ...acc, ...engineFieldsFrom(rec, carrier) }),
    {}
  );
  const rawLine = isRecord2(line) ? line : {};
  const ownInline = engineFieldsFrom(rawLine);
  const ownNested = firstRecord(rawLine, ["descriptor", "pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"]);
  const { block } = contextBlockOf(rec);
  const lineMap = block ? firstRecord(block, ENGINE_LINE_MAP_FIELDS) : null;
  const mapEntry = lineMap ? carriers.reduce((acc, carrier) => {
    const v = lineMap[carrier];
    return isRecord2(v) ? { ...acc ?? {}, ...v } : acc;
  }, null) ?? (isRecord2(lineMap[asString2(line?.index)]) ? lineMap[asString2(line?.index)] : null) : null;
  const nested = componentNestedBlock(rec, spec);
  const merged = {
    ...flat,
    ...ownInline,
    ...ownNested ?? {},
    ...mapEntry ?? {},
    ...nested ?? {}
  };
  if (!Object.keys(merged).length && !nested && !mapEntry && !ownNested) return null;
  return merged;
}
function foundationConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : foundationCostLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = foundationLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult = (reason, baselineSell, internalCost, markupPct, contextEngaged, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  context_engaged: contextEngaged,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveFoundationSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord2(input.record) ? input.record : null;
  const baselineSell = num3(input.baselineSell ?? input.baseline_sell);
  const internalCost = num3(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const markupPct = firstFinite3(input, ["markupPercent", "markup_percent"]) ?? firstFinite3(rec, ["customer_markup_percent"]) ?? 0;
  const context = foundationPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || "",
    customer_tier: asString2(
      isRecord2(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num3(context.defaultMarkupPct)
  };
  const engine = isRecord2(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines.map((l, position) => {
    const spec = componentOf(l?.key);
    return {
      key: asString2(l?.key) || `line-${position}`,
      index: position,
      label: asString2(l?.label) || spec?.label || `Component ${position + 1}`,
      qty: l?.qty !== void 0 ? num3(l.qty, 1) : spec ? firstFinite3(rec, spec.qtyFields ?? []) ?? spec.qtyFrom?.(rec) ?? 1 : 1,
      cost: l?.cost !== void 0 ? toFiniteNumber2(l.cost) : spec && spec.costFields.length ? firstFinite3(rec, spec.costFields) : toFiniteNumber2(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost),
      category_key: asString2(l?.category_key) || spec?.category_key || "",
      item: isRecord2(l?.item) ? l.item : rec,
      descriptor: isRecord2(l) ? l : null,
      origin: "caller"
    };
  }) : foundationCostLines(rec);
  const scan = foundationConfigScan(rec, wireLines);
  const engaged = context.hasContextBlock || scan.configured;
  chain.push({
    layer: "config_scan",
    hit: engaged,
    won: false,
    detail: context.hasContextBlock ? `context block via ${context.field}${scan.configured ? ` + ${scan.configuredCount} configured component(s)` : ""}` : scan.configured ? `${scan.configuredCount} of ${scan.lineCount} components carry pricing config` : `no pricing config on ${scan.lineCount} components`
  });
  if (!record) return passthroughResult("no_record", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult("no_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult("no_config", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult("no_engine", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const descriptor = foundationLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== void 0 ? line.cost : null;
    const qty = num3(line.qty, 1);
    const base = {
      key: line.key || `line-${position}`,
      label: line.label || `Component ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      priced_via: null,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!enginePrices) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`component '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor ?? {} };
    const lineModifiers = firstField2(partDescriptor, FORMULA_FIELDS);
    for (const f of FORMULA_FIELDS) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField2(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord2(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString2(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `component '${base.label}': ${asString2(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`component '${base.label}': template resolution failed (${asString2(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField2(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS) ? EMBEDDED_RULE_FIELDS.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField2(partDescriptor, MACHINE_FIELDS) ?? context.machine;
    const setupFee = firstFinite3(partDescriptor, SETUP_FIELDS) ?? (context.setupFee || void 0);
    const minimumCharge = firstFinite3(partDescriptor, MIN_FIELDS) ?? (context.minimumCharge || void 0);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === "boolean" ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite3(partDescriptor, TAX_PCT_FIELDS) ?? (context.taxPercent || void 0);
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString2(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString2(firstField2(partDescriptor, UNIT_FIELDS)) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        taxable,
        taxPercent,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`component '${base.label}': engine pricing failed (${asString2(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord2(priced) ? priced : {};
    const lineSubtotal = firstFinite3(pricedRecord, ["subtotal"]) ?? num3(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? "descriptor" : "context";
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num3(pricedRecord.unitPrice),
      extended: num3(pricedRecord.extended),
      setup_fee: num3(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num3(pricedRecord.total),
      price_source: asString2(pricedRecord.priceSource),
      tier_source: asString2(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString2(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`component '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult("no_priced_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round23(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round23(configuredBaseline)}) exceeds project sell \u2014 remainder ${round23(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round23(baselineSell)} - priced baseline ${round23(configuredBaseline)} = remainder ${round23(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round23(remainder)} + engine ${round23(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    context_engaged: context.hasContextBlock,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/foundation/foundationSellPricing.js
var ENGINE = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = foundationPricingContextOf(record, caller);
    return resolveFoundationSellPricing({ record, baselineSell, internalCost, markupPercent, context, engine: ENGINE, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function foundationEngineEconomics(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  const res = resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/customerPricing.js
var num4 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function liveCustomerUnitPrice(line) {
  if (hasNumericValue(line?.live_customer_price_snapshot)) return Number(line.live_customer_price_snapshot);
  if (hasNumericValue(line?.customer_price_snapshot)) return Number(line.customer_price_snapshot);
  return num4(line?.live_total_snapshot, num4(line?.total_snapshot));
}
function sourceProjectEconomics(moduleKey, record, fallbackTotal = 0, pricingContext = null) {
  const fallback = num4(fallbackTotal);
  if (!record) return { internalCost: fallback, customerPrice: fallback };
  const total = num4(record.total_cost, fallback);
  const savedTierCustomerPrice = record?.customer_pricing?.applied === true && hasNumericValue(record?.customer_pricing?.total) ? num4(record.customer_pricing.total) : null;
  const withSavedTier = (economics) => savedTierCustomerPrice === null ? economics : { ...economics, customerPrice: savedTierCustomerPrice };
  if (moduleKey === "foundation") {
    const cost = fallback;
    const markupPercent = num4(record.customer_markup_percent);
    const override = num4(record.customer_price_override);
    const baselineSell = override > 0 ? override : cost * (1 + markupPercent / 100);
    const wired = foundationEngineEconomics(record, { baselineSell, internalCost: cost, markupPercent, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: cost, customerPrice: baselineSell });
  }
  if (["vinyl", "brick_stone", "maintenance"].includes(moduleKey)) {
    const internalCost = hasNumericValue(record.subtotal) ? num4(record.subtotal) : total - num4(record.markup_amount);
    const wired = moduleKey === "vinyl" ? vinylEngineEconomics(record, { baselineSell: total, internalCost, pricingContext }) : moduleKey === "brick_stone" ? brickEngineEconomics(record, { baselineSell: total, internalCost, pricingContext }) : moduleKey === "maintenance" ? maintenanceEngineEconomics(record, { baselineSell: total, internalCost, pricingContext }) : null;
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }
  if (moduleKey === "channel_letters") {
    const letterMarkup = num4(record.total_letters_cost) - num4(record.letters_subtotal);
    const projectSubtotal = hasNumericValue(record.subtotal) ? num4(record.subtotal) : total - num4(record.markup_amount);
    const internalCost = projectSubtotal - letterMarkup;
    const wired = channelSellEconomics(record, { internalCost, customerPrice: total });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }
  if (moduleKey === "cnc") {
    const wired = cncEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }
  if (moduleKey === "laser") {
    const wired = laserEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }
  if (moduleKey === "metal") {
    const internalCost = hasNumericValue(record.subtotal) ? num4(record.subtotal) : total - num4(record.markup_amount);
    const wired = metalEngineEconomics(record, { baselineSell: total, internalCost, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }
  if (moduleKey === "painting") {
    const wired = paintEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }
  if (moduleKey === "custom_items") {
    const wired = customItemsEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: fallback, customerPrice: fallback });
  }
  return withSavedTier({ internalCost: fallback, customerPrice: fallback });
}

// .audit-work/foundation-o010-totals/fixture/stubs/staffEntities.mjs
var emptyEntity2 = () => ({
  get: async () => null,
  filter: async () => [],
  list: async () => [],
  create: async (row) => ({ id: "stub", ...row }),
  update: async (_id, row) => row,
  delete: async () => ({})
});
var staffEntities = new Proxy({}, { get: () => emptyEntity2() });

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/builder/builderService.js
var num5 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function sourceProjectTotal(line, record) {
  if (!record) return num5(line?.live_total_snapshot, num5(line?.total_snapshot));
  const totalField = MODULE_TOTAL_FIELD[line?.module_key];
  if (totalField) return num5(record[totalField]);
  if (line?.module_key === "painting") {
    return num5(record.total_paint_mask_cost) + num5(record.total_liquid_paint_and_supplies_cost) + num5(record.total_labor_cost);
  }
  if (line?.module_key === "foundation") {
    const direct = num5(record.grand_total, NaN);
    if (Number.isFinite(direct)) return direct;
    return FOUNDATION_RECORD_TOTAL_FIELDS.reduce((sum, key) => sum + num5(record[key]), 0);
  }
  return num5(record.total_cost, num5(line?.total_snapshot));
}
var FOUNDATION_RECORD_TOTAL_FIELDS = [
  "total_concrete_cost",
  "total_rebar_cost",
  "total_excavation_cost",
  "total_forming_materials_cost",
  "total_labor_cost",
  "total_wall_cost",
  "total_pole_cost",
  "total_pole_painting_cost",
  "total_equipment_cost",
  "total_wall_cap_cost",
  "total_signage_cabinet_cost",
  "total_landscape_cost"
];

// .audit-work/foundation-o010-totals/fixture/src/components/estimator/useSectionSync.js
async function refreshSectionSnapshots(lineItems) {
  const lines = lineItems || [];
  const refreshed = await Promise.all(
    lines.map(async (line) => {
      const mod = getModule(line.module_key);
      if (!mod || !line.project_id) return line;
      const record = await base44.entities[mod.entity].get(line.project_id).catch(() => null);
      if (!record) return line;
      if (line.builder_product_id) {
        return {
          ...line,
          project_name: record.project_name || line.project_name,
          updated_date_snapshot: record.updated_date
        };
      }
      const sourceTotal = sourceProjectTotal(line, record);
      const frozenTotal = Number(line.total_snapshot || 0);
      const keepLegacyState = line.price_state === "legacy_frozen";
      const economics = keepLegacyState ? { internalCost: sourceTotal, customerPrice: liveCustomerUnitPrice(line) } : sourceProjectEconomics(line.module_key, record, sourceTotal);
      const liveTotal = economics.internalCost;
      const changed = Math.abs(liveTotal - frozenTotal) > 5e-3;
      const hasDetachedParts = Number(line.detached_part_count || 0) > 0 || line.needs_reattach_review;
      return {
        ...line,
        project_name: record.project_name || line.project_name,
        live_total_snapshot: liveTotal,
        live_customer_price_snapshot: economics.customerPrice,
        price_state: hasDetachedParts ? "detached_parts" : keepLegacyState ? "legacy_frozen" : changed ? "changed" : "current",
        last_price_check_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_date_snapshot: record.updated_date
      };
    })
  );
  return refreshed;
}
async function deleteOwnedSection(line) {
  const mod = getModule(line?.module_key);
  if (!line?.owned || !mod || !line.project_id) return;
  await base44.entities[mod.entity].delete(line.project_id).catch(() => null);
}
export {
  deleteOwnedSection,
  refreshSectionSnapshots
};
