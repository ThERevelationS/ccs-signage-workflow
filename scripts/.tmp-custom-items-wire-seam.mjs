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
var isRecord2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var num3 = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
var normStr2 = (v) => String(v ?? "").trim().toLowerCase();
var round23 = (n) => Math.round((num3(n) + Number.EPSILON) * 100) / 100;
var round43 = (n) => Math.round((num3(n) + Number.EPSILON) * 1e4) / 1e4;
var firstField2 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite3 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};
var firstNonBlank = (rec, fields) => firstField2(rec, fields);
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
var ENGINE_MODE_TOKENS = /* @__PURE__ */ new Set([
  "fixed",
  "fixed_price",
  "flat",
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "cost_plus",
  "cost-plus",
  "costplus",
  "markup",
  "tier",
  "tier_markup",
  "tiered"
]);
var FIXED_PRICE_FIELDS = ["fixed_price", "price_override", "override_price"];
var BREAK_FIELDS = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var MARKUP_FIELDS2 = ["markup_pct", "markup", "markup_percent"];
var MARKET_RETAIL_FIELDS = ["market_retail", "retail_price", "retail"];
var TIER_REF_FIELDS = ["tier_ref"];
var MODIFIER_FIELDS = ["formula_modifiers", "modifiers"];
var MIN_CHARGE_FIELDS2 = ["minimum_charge", "min_charge"];
var TIER_RULES_FIELDS = ["tier_rules", "tierRules", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var CUSTOMER_TIER_FIELDS = ["customer_tier", "customerTier"];
var SETUP_FEE_FIELDS = ["setup_fee", "setupFee"];
var TAX_PCT_FIELDS = ["tax_percent", "taxPercent"];
var MODE_FIELDS = ["pricing_mode", "price_mode", "mode", "active_mode"];
var TEMPLATE_REGISTRY_FIELDS = ["templates", "pricing_templates"];
var TIER_CATALOG_FIELDS = ["tiers", "markup_tiers"];
var DEFAULT_MARKUP_FIELDS = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var nonBlank = (v) => normStr2(v) !== "";
var hasBreakChart = (src) => BREAK_FIELDS.some((f) => Array.isArray(src?.[f]) && src[f].length > 0);
var hasTemplateEmbed = (src) => CHANNEL_LINE_TEMPLATE_FIELDS.some((f) => isRecord2(src?.[f]));
var templateRefValue = (src) => {
  for (const f of CHANNEL_LINE_TEMPLATE_ID_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_NAME_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
    const v = src?.[f];
    if (v !== void 0 && v !== null && !isRecord2(v) && nonBlank(v)) return { ref: v, via: f };
  }
  return null;
};
function descriptorConfigured(src) {
  const via = [];
  if (!isRecord2(src)) return { configured: false, via };
  const fixed = firstFinite3(src, FIXED_PRICE_FIELDS);
  if (fixed !== null && fixed > 0) via.push("fixed_price");
  for (const f of TIER_REF_FIELDS) if (nonBlank(src[f])) via.push(f);
  for (const f of ["tier", "tier_name"]) if (nonBlank(src[f])) via.push(f);
  if (hasBreakChart(src)) via.push("per_unit_breaks");
  const retail = firstFinite3(src, MARKET_RETAIL_FIELDS);
  if (retail !== null && retail > 0) via.push("market_retail");
  const mode = firstField2(src, MODE_FIELDS);
  if (mode !== void 0 && ENGINE_MODE_TOKENS.has(normStr2(mode))) via.push("pricing_mode");
  const markup = firstFinite3(src, MARKUP_FIELDS2);
  if (markup !== null) via.push("markup_pct");
  for (const f of MODIFIER_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) {
      via.push("formula_modifiers");
      break;
    }
  }
  const minCharge = firstFinite3(src, MIN_CHARGE_FIELDS2);
  if (minCharge !== null && minCharge > 0) via.push("minimum_charge");
  const setupFee = firstFinite3(src, SETUP_FEE_FIELDS);
  if (setupFee !== null && setupFee > 0) via.push("setup_fee");
  for (const f of TIER_RULES_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) {
      via.push("tier_rules");
      break;
    }
  }
  for (const f of CUSTOMER_TIER_FIELDS) {
    if (nonBlank(src[f])) {
      via.push("customer_tier");
      break;
    }
  }
  if (templateRefValue(src) || hasTemplateEmbed(src)) via.push("pricing_template");
  return { configured: via.length > 0, via };
}
function channelEngineContext(source) {
  if (source && source.__channelPricingContext === true) return source;
  if (!isRecord2(source)) return null;
  let block = null;
  let field = "";
  for (const f of CHANNEL_ENGINE_CONTEXT_FIELDS) {
    if (isRecord2(source[f])) {
      block = source[f];
      field = f;
      break;
    }
  }
  if (!block && isRecord2(source.customer_pricing)) {
    for (const f of CHANNEL_NESTED_CONTEXT_FIELDS) {
      if (isRecord2(source.customer_pricing[f])) {
        block = source.customer_pricing[f];
        field = `customer_pricing.${f}`;
        break;
      }
    }
  }
  if (!block) return null;
  const firstArr = (src, fields) => {
    for (const f of fields) if (Array.isArray(src?.[f]) && src[f].length > 0) return src[f];
    return [];
  };
  const cp = isRecord2(source.customer_pricing) ? source.customer_pricing : null;
  const customerTier = firstNonBlank(block, [...CUSTOMER_TIER_FIELDS, "tier"]) ?? firstNonBlank(source, [...CUSTOMER_TIER_FIELDS, "pricing_tier"]) ?? (cp ? cp.tier_number ?? cp.tier_name ?? void 0 : void 0) ?? null;
  const defaultMarkup = firstFinite3(block, DEFAULT_MARKUP_FIELDS) ?? firstFinite3(block, MARKUP_FIELDS2) ?? (Number.isFinite(Number(source.markup_percent)) ? num3(source.markup_percent) : 0);
  return {
    __channelPricingContext: true,
    field,
    customerTier,
    tierRules: firstArr(block, TIER_RULES_FIELDS),
    template: firstField2(block, ["template", "pricing_template"]),
    templates: firstArr(block, TEMPLATE_REGISTRY_FIELDS),
    tiers: firstArr(block, TIER_CATALOG_FIELDS),
    machine: firstField2(block, ["machine", "machine_override"]),
    defaultMarkupPct: num3(defaultMarkup),
    taxable: typeof block.taxable === "boolean" ? block.taxable : normStr2(block.taxable) === "false" ? false : normStr2(block.taxable) === "true" ? true : void 0,
    taxPercent: num3(firstFinite3(block, TAX_PCT_FIELDS)),
    setupFee: num3(firstFinite3(block, SETUP_FEE_FIELDS)),
    minimumCharge: num3(firstFinite3(block, MIN_CHARGE_FIELDS2)),
    modifiers: Array.isArray(block.modifiers) ? block.modifiers : Array.isArray(block.formula_modifiers) ? block.formula_modifiers : void 0,
    raw: block
  };
}
function channelLinePricingConfig(line) {
  const src = isRecord2(line?.line) && !isRecord2(line?.part) ? line.line : line;
  const via = [];
  let part = null;
  for (const f of CHANNEL_LINE_PART_FIELDS) {
    const d = src?.[f];
    if (!isRecord2(d)) continue;
    const probe = descriptorConfigured(d);
    via.push(...probe.via.map((v) => `${f}.${v}`));
    if (probe.configured && !part) part = { ...d, __via: f };
  }
  const inline = descriptorConfigured(src);
  if (inline.configured) {
    via.push(...inline.via);
    const merged = {};
    for (const f of [
      ...FIXED_PRICE_FIELDS,
      ...TIER_REF_FIELDS,
      "tier",
      "tier_name",
      ...BREAK_FIELDS,
      ...MARKET_RETAIL_FIELDS,
      "market_discount_pct",
      ...MODE_FIELDS,
      ...MARKUP_FIELDS2,
      ...MODIFIER_FIELDS,
      ...MIN_CHARGE_FIELDS2,
      ...SETUP_FEE_FIELDS
    ]) {
      if (src[f] !== void 0 && src[f] !== null && src[f] !== "") merged[f] = src[f];
    }
    part = part ? { ...merged, ...part } : merged;
  }
  let machine = null;
  for (const f of CHANNEL_LINE_MACHINE_FIELDS) {
    if (isRecord2(src?.[f])) {
      machine = src[f];
      via.push(f);
      break;
    }
  }
  let template = null;
  const tref = templateRefValue(src);
  if (tref) {
    template = tref.ref;
    via.push(tref.via);
  } else {
    for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
      if (isRecord2(src?.[f])) {
        template = src[f];
        via.push(f);
        break;
      }
    }
  }
  if (!template && isRecord2(part)) {
    const ptref = templateRefValue(part);
    if (ptref) {
      template = ptref.ref;
      via.push(`part.${ptref.via}`);
    } else {
      for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
        if (isRecord2(part[f])) {
          template = part[f];
          via.push(`part.${f}`);
          break;
        }
      }
    }
  }
  return { configured: via.length > 0, part, machine, template, via };
}
var labelOr = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};
function channelCostLines(record) {
  if (!isRecord2(record)) return [];
  const lines = [];
  const push = (l) => {
    const cost = num3(l.cost);
    const qty = num3(l.qty, 0) > 0 ? num3(l.qty) : 1;
    const unitCost = Number.isFinite(Number(l.unitCost)) ? num3(l.unitCost) : num3(l.qty, 0) > 0 ? cost / num3(l.qty) : cost;
    lines.push({ ...l, cost, qty, unitCost });
  };
  const purchases = Array.isArray(record.letter_purchases) ? record.letter_purchases : [];
  purchases.forEach((lp, i) => {
    const total = num3(lp?.total_cost, num3(lp?.line_total, num3(lp?.qty, 0) * num3(lp?.unit_cost)));
    if (total <= 0) return;
    const desc = labelOr(lp?.description, lp?.letter_type, `Purchase ${i + 1}`);
    const qty = num3(lp?.qty, 0);
    const isDimensional = lp?.letter_type === "dimensional_letters";
    if (isDimensional && isRecord2(lp?.fab_config)) {
      const matCost = num3(lp.fab_config.material_cost) + num3(lp.fab_config.paint_material_cost);
      const laborCost = num3(lp.fab_config.cnc_labor_cost) + num3(lp.fab_config.paint_labor_cost);
      if (matCost > 0) {
        push({
          key: `purchase:${i}:material`,
          label: `Dimensional Letter Material \u2014 ${desc}`,
          cost: matCost,
          qty,
          category: "substrates",
          family: "letter_purchase",
          line: lp
        });
      }
      if (laborCost > 0) {
        push({
          key: `purchase:${i}:labor`,
          label: `Dimensional Letter Fab Labor \u2014 ${desc}`,
          cost: laborCost,
          qty,
          category: "inhouse_labor",
          family: "letter_purchase",
          line: lp
        });
      }
      const remainder = total - matCost - laborCost;
      if (remainder > 0.01) {
        push({
          key: `purchase:${i}:other`,
          label: `Dimensional Letter (other) \u2014 ${desc}`,
          cost: remainder,
          qty,
          category: "substrates",
          family: "letter_purchase",
          line: lp
        });
      }
    } else {
      push({
        key: `purchase:${i}`,
        label: isDimensional ? `Dimensional Letters \u2014 ${desc}` : `Letter Purchase \u2014 ${desc}`,
        cost: total,
        qty,
        category: isDimensional ? "substrates" : "outsourced_fab",
        family: "letter_purchase",
        line: lp
      });
    }
  });
  const onlyDimensional = purchases.length > 0 && purchases.every((lp) => lp?.letter_type === "dimensional_letters");
  const letterFees = (onlyDimensional ? 0 : num3(record.letters_delivery_fee)) + num3(record.letters_design_fee) + num3(record.letters_install_supplies_fee) + num3(record.letters_permitting_fee) + num3(record.letters_other_fee);
  if (letterFees > 0) {
    push({
      key: "letter_fees",
      label: "Letter Fees (delivery/design/permit/etc.)",
      cost: letterFees,
      qty: 1,
      category: "outsourced_fab",
      family: "letter_fees",
      line: null
    });
  }
  const laborViaPersonnel = record.labor_priced_via_personnel !== void 0 ? !!record.labor_priced_via_personnel : num3(record.total_personnel_cost) > 0;
  const items = Array.isArray(record.items) ? record.items : [];
  items.forEach((it, i) => {
    const desc = labelOr(it?.description, it?.installation_type, `Item ${i + 1}`);
    const laborCost = num3(it?.labor_cost);
    const materialsCost = num3(it?.materials_cost);
    if (!laborViaPersonnel && laborCost > 0) {
      push({
        key: `item:${i}:labor`,
        label: `Install Labor \u2014 ${desc}`,
        cost: laborCost,
        qty: num3(it?.qty_letters, 0) || 1,
        category: "inhouse_labor",
        family: "install_item",
        line: it
      });
    }
    if (materialsCost > 0) {
      push({
        key: `item:${i}:materials`,
        label: `Install Materials \u2014 ${desc}`,
        cost: materialsCost,
        qty: num3(it?.qty_letters, 0) || 1,
        category: "outsourced_fab",
        family: "install_item",
        line: it
      });
    }
    if (!laborViaPersonnel && laborCost <= 0 && materialsCost <= 0 && num3(it?.item_total_cost) > 0) {
      push({
        key: `item:${i}`,
        label: `Install Item \u2014 ${desc}`,
        cost: num3(it.item_total_cost),
        qty: num3(it?.qty_letters, 0) || 1,
        category: "outsourced_fab",
        family: "install_item",
        line: it
      });
    }
    if (laborViaPersonnel && materialsCost <= 0 && laborCost <= 0 && num3(it?.item_total_cost) > 0) {
      const matShare = num3(it.item_total_cost) - laborCost;
      if (matShare > 0) {
        push({
          key: `item:${i}`,
          label: `Install Materials \u2014 ${desc}`,
          cost: matShare,
          qty: num3(it?.qty_letters, 0) || 1,
          category: "outsourced_fab",
          family: "install_item",
          line: it
        });
      }
    }
  });
  (Array.isArray(record.selected_equipment) ? record.selected_equipment : []).forEach((sel, i) => {
    const cost = num3(sel?.total_cost);
    if (cost <= 0) return;
    push({
      key: `equipment:${i}`,
      label: `Equipment \u2014 ${labelOr(sel?.equipment_name, sel?.equipment_id, `Row ${i + 1}`)}`,
      cost,
      qty: 1,
      category: "outsourced_services",
      family: "equipment",
      line: sel
    });
  });
  (Array.isArray(record.personnel) ? record.personnel : []).forEach((p, i) => {
    const cost = num3(p?.total_cost, num3(p?.hourly_rate) * num3(p?.hours));
    if (cost <= 0) return;
    push({
      key: `personnel:${i}`,
      label: `Crew \u2014 ${labelOr(p?.name, p?.role, p?.title, `Row ${i + 1}`)}`,
      cost,
      qty: num3(p?.hours, 0) || 1,
      category: "inhouse_labor",
      family: "personnel",
      line: p
    });
  });
  const supplies = num3(record.total_supplies_cost);
  if (supplies > 0) {
    push({
      key: "supplies",
      label: "Supplies",
      cost: supplies,
      qty: 1,
      category: "outsourced_fab",
      family: "supplies",
      line: null
    });
  }
  const travel = num3(record.total_travel_cost);
  if (travel > 0) {
    push({
      key: "travel",
      label: "Travel & Fuel",
      cost: travel,
      qty: 1,
      category: "outsourced_services",
      family: "travel",
      line: null
    });
  }
  return lines;
}
var enginePricer = (engine) => typeof engine === "function" ? engine : typeof engine?.pricePart === "function" ? engine.pricePart : null;
function wireChannelLineSell(input = {}) {
  const line = isRecord2(input.line) ? input.line : isRecord2(input) && input.cost !== void 0 && !input.line ? input : input.line;
  const src = isRecord2(line) ? line : {};
  const chain = [];
  const cost = num3(input.cost ?? input.lineCost ?? src.total_cost ?? src.cost);
  const rawQty = num3(input.qty ?? src.qty ?? src.qty_letters ?? src.quantity, 0);
  const qty = rawQty > 0 ? rawQty : 1;
  const unitCost = Number.isFinite(Number(input.unitCost ?? input.unit_cost)) ? num3(input.unitCost ?? input.unit_cost) : rawQty > 0 ? cost / rawQty : cost;
  const label = String(input.label ?? src.label ?? src.description ?? src.item_name ?? "");
  const category = String(input.category ?? src.category ?? src.category_key ?? "");
  const key = String(input.key ?? src.key ?? label ?? "line");
  const context = channelEngineContext(input.context);
  const ctxPresent = !!context;
  chain.push({ step: "context", detail: ctxPresent ? `context via ${context.field || "input"}` : "no_context" });
  const config = channelLinePricingConfig(src);
  chain.push({
    step: "detect",
    detail: config.configured ? `configured via ${config.via.join(",")}` : "no line config"
  });
  const out = (r) => ({
    priced: false,
    passthrough: false,
    reason: null,
    sellPrice: cost,
    key,
    label,
    cost,
    qty,
    unitCost,
    category,
    via: config.via,
    chain,
    ...r
  });
  if (!config.configured && !ctxPresent) {
    chain.push({ step: "passthrough", detail: "no tier/template config anywhere \u2014 cost echoed verbatim" });
    return out({ passthrough: true, reason: "no_tier_config" });
  }
  const pricer = enginePricer(input.engine);
  if (!pricer) {
    chain.push({ step: "passthrough", detail: "engine not supplied \u2014 cost echoed verbatim" });
    return out({ passthrough: true, reason: "engine_unavailable" });
  }
  let part = config.part;
  if (config.template !== null && config.template !== void 0) {
    const resolver = typeof input.engine?.resolveTemplatePrice === "function" ? input.engine.resolveTemplatePrice : null;
    if (resolver) {
      const templatePart = isRecord2(part) ? { ...part } : { ...isRecord2(src) ? src : {} };
      if (isRecord2(config.template)) templatePart.pricing_template = config.template;
      else templatePart.pricing_template_id = config.template;
      const res = resolver({
        part: templatePart,
        qty,
        base_price: unitCost,
        templates: input.templates ?? context?.templates,
        tiers: input.tiers ?? context?.tiers ?? input.customerTier ?? context?.customerTier,
        customer_tier: input.customerTier ?? context?.customerTier,
        template: isRecord2(input.template) ? input.template : isRecord2(context?.template) ? context?.template : void 0,
        default_markup_pct: context?.defaultMarkupPct,
        minimum_charge: src.minimum_charge ?? context?.minimumCharge
      });
      chain.push({
        step: "template",
        detail: res?.applied === true ? `template priced (${res.source}:${res.pct_source ?? "n/a"} -> unit ${round43(res.unit_price)})` : `template not applied (${res?.reason ?? "unresolved"}) \u2014 engine chain prices`
      });
      if (res?.applied === true) {
        const fold = typeof input.engine?.templatePartDescriptor === "function" ? input.engine.templatePartDescriptor : (p) => p;
        part = fold(part ?? {}, res);
      }
    } else {
      chain.push({ step: "template", detail: "resolveTemplatePrice not supplied \u2014 ref left to engine chain" });
    }
  }
  const customerTier = src.customer_tier ?? src.customerTier ?? (isRecord2(part) ? firstField2(part, CUSTOMER_TIER_FIELDS) : void 0) ?? input.customerTier ?? context?.customerTier ?? null;
  const lineRules = TIER_RULES_FIELDS.reduce((acc, f) => {
    const v = src[f] ?? (isRecord2(part) ? part[f] : void 0);
    return Array.isArray(v) && v.length ? acc.concat(v) : acc;
  }, []);
  const tierRules = lineRules.length ? [...lineRules, ...Array.isArray(input.tierRules) ? input.tierRules : [], ...context?.tierRules ?? []] : [...Array.isArray(input.tierRules) ? input.tierRules : [], ...context?.tierRules ?? []];
  const priced = pricer({
    label,
    category,
    qty,
    unitCost,
    customerTier,
    tierRules,
    part,
    machine: config.machine ?? context?.machine,
    defaultMarkupPct: context?.defaultMarkupPct ?? 0,
    setupFee: firstFinite3(src, SETUP_FEE_FIELDS) ?? context?.setupFee,
    minimumCharge: firstFinite3(src, MIN_CHARGE_FIELDS2) ?? context?.minimumCharge,
    taxable: typeof src.taxable === "boolean" ? src.taxable : context?.taxable,
    taxPercent: firstFinite3(src, TAX_PCT_FIELDS) ?? context?.taxPercent,
    // Line-level formula_modifiers already ride inside `part` (rule
    // modifiers). Passing them as caller `modifiers` too would double-apply
    // (engine runs rule modifiers THEN caller modifiers). Only caller/context
    // modifiers belong here.
    modifiers: input.modifiers ?? context?.modifiers,
    now: input.now
  });
  chain.push({
    step: "engine",
    detail: `pricePart -> ${priced?.priceSource ?? "unknown"} via ${priced?.tier?.source ?? "n/a"} (unit ${priced?.unitPrice ?? "n/a"}, total ${priced?.total ?? "n/a"})`
  });
  return out({
    priced: true,
    sellPrice: num3(priced?.total, cost),
    unitPrice: priced?.unitPrice,
    extension: priced?.extended ?? priced?.extension,
    priceSource: priced?.priceSource,
    tierSource: priced?.tier?.source,
    engine: priced
  });
}
function wireChannelProjectSell(input = {}) {
  const list = Array.isArray(input.lines) ? input.lines : [];
  const context = channelEngineContext(input.context);
  const chain = [{
    step: "context",
    detail: context ? `context via ${context.field || "input"}` : "no_context"
  }];
  const lines = list.map((l, i) => wireChannelLineSell({
    key: l?.key ?? `line:${i}`,
    line: isRecord2(l?.line) ? l.line : l,
    cost: l?.cost ?? l?.total_cost,
    qty: l?.qty,
    unitCost: l?.unitCost,
    label: l?.label,
    category: l?.category ?? l?.category_key,
    context,
    engine: input.engine,
    templates: input.templates,
    tiers: input.tiers,
    customerTier: input.customerTier,
    tierRules: input.tierRules,
    template: input.template,
    now: input.now
  }));
  const pricedCount = lines.filter((l) => l.priced).length;
  const passthroughCount = lines.length - pricedCount;
  const allPassthrough = pricedCount === 0;
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);
  const sellTotal = allPassthrough ? lines.reduce((s, l) => s + l.sellPrice, 0) : round23(lines.reduce((s, l) => s + l.sellPrice, 0));
  chain.push({
    step: "rollup",
    detail: allPassthrough ? `all ${lines.length} lines passthrough \u2014 sellTotal is verbatim cost sum` : `${pricedCount} priced / ${passthroughCount} passthrough -> sellTotal ${sellTotal}`
  });
  return {
    priced: pricedCount > 0,
    allPassthrough,
    sellTotal,
    costTotal,
    lines,
    pricedCount,
    passthroughCount,
    context,
    chain
  };
}
function channelEngineEconomics(input = {}) {
  const record = input.record;
  const chain = [];
  const done = (r) => ({
    wired: false,
    passthrough: false,
    reason: null,
    internalCost: num3(input.internalCost),
    customerPrice: num3(input.customerPrice),
    sell: null,
    lines: [],
    context: null,
    chain,
    ...r
  });
  if (!isRecord2(record)) {
    chain.push({ step: "passthrough", detail: "no record" });
    return done({ passthrough: true, reason: "no_record" });
  }
  const context = channelEngineContext(input.context ?? record);
  const lines = Array.isArray(input.lines) && input.lines.length ? input.lines : channelCostLines(record);
  if (!lines.length) {
    chain.push({ step: "passthrough", detail: "record produced no cost lines" });
    return done({ passthrough: true, reason: "no_cost_lines", context });
  }
  const anyLineConfig = lines.some((l) => channelLinePricingConfig(isRecord2(l?.line) ? l.line : l).configured);
  chain.push({
    step: "detect",
    detail: `${lines.length} cost lines; context ${context ? `via ${context.field}` : "absent"}; line config ${anyLineConfig ? "present" : "absent"}`
  });
  if (!context && !anyLineConfig) {
    chain.push({ step: "passthrough", detail: "no engine config anywhere \u2014 byte-identical" });
    return done({ passthrough: true, reason: "no_tier_config", lines, context });
  }
  const sell = wireChannelProjectSell({
    lines,
    context,
    engine: input.engine,
    templates: input.templates ?? context?.templates,
    tiers: input.tiers ?? context?.tiers,
    customerTier: input.customerTier ?? context?.customerTier,
    tierRules: input.tierRules,
    now: input.now
  });
  chain.push(...sell.chain);
  if (!sell.priced) {
    return done({ passthrough: true, reason: "no_priced_lines", sell, lines, context });
  }
  chain.push({
    step: "wired",
    detail: `engine customerPrice ${sell.sellTotal} over internalCost ${num3(input.internalCost)} (${sell.pricedCount}/${lines.length} priced)`
  });
  return done({
    wired: true,
    customerPrice: sell.sellTotal,
    sell,
    lines,
    context
  });
}

// src/components/estimator/channel/channelSellPricing.js
var ENGINE = { pricePart, resolveTemplatePrice, templatePartDescriptor };
function channelSellEconomics(record, economics) {
  const wired = channelEngineEconomics({
    record,
    internalCost: economics?.internalCost,
    customerPrice: economics?.customerPrice,
    engine: ENGINE
  });
  return wired?.wired === true ? wired : null;
}

// base44/shared/vinylPricingWire.ts
var isRecord3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString2 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc2 = (v) => asString2(v).toLowerCase();
var toFiniteNumber2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num4 = (v, fallback = 0) => toFiniteNumber2(v) ?? fallback;
var firstField3 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite4 = (rec, fields) => {
  const v = firstField3(rec, fields);
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
    if (isRecord3(rec[f])) return rec[f];
  }
  return null;
};
var round24 = (n) => Math.round((num4(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS = ["label", "description", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS = ["id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS = ["category_key", "category", "part_category", "pricing_category"];
var ENGINE_BLOCK_FIELDS = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS2 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS2 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS2 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS3 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS = ["formula_modifiers"];
var MODE_FIELDS2 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS = ["tiers", "tier_catalog"];
var VINYL_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS,
  ...TIER_REF_FIELDS2,
  ...BREAK_FIELDS2,
  ...TEMPLATE_REF_FIELDS,
  ...TIER_SET_FIELDS,
  ...MARKET_FIELDS,
  ...MARKET_DISCOUNT_FIELDS,
  ...MARKUP_FIELDS3,
  ...MIN_FIELDS,
  ...SETUP_FIELDS,
  ...FORMULA_FIELDS,
  ...MODE_FIELDS2,
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
var isEngineModeToken = (v) => ENGINE_MODE_TOKENS2.has(lc2(v));
var nonEmptyArrayField = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField = (rec, fields) => fields.some((f) => firstFinite4(rec, [f]) !== null);
var anyPositiveField = (rec, fields) => fields.some((f) => {
  const v = firstFinite4(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig = (v) => {
  if (!isRecord3(v)) return false;
  return anyPositiveField(v, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MIN_FIELDS]) || anyFiniteField(v, MARKUP_FIELDS3) || nonEmptyArrayField(v, [...BREAK_FIELDS2, ...FORMULA_FIELDS]) || MODE_FIELDS2.some((f) => isEngineModeToken(v[f])) || TIER_REF_FIELDS2.some((f) => asString2(v[f]) !== "");
};
function descriptorHasPricingContent(d) {
  if (!isRecord3(d)) return false;
  if (anyPositiveField(d, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MARKET_DISCOUNT_FIELDS, ...MIN_FIELDS, ...SETUP_FIELDS]) || anyFiniteField(d, MARKUP_FIELDS3)) return true;
  if (nonEmptyArrayField(d, [...BREAK_FIELDS2, ...FORMULA_FIELDS, ...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (MODE_FIELDS2.some((f) => isEngineModeToken(d[f]))) return true;
  if (TIER_REF_FIELDS2.some((f) => asString2(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord3(v) ? true : asString2(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString2(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => firstField3(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}
var lineKey = (item, index, workflowId = "", position) => {
  const explicit = firstField3(item, LINE_KEY_FIELDS);
  if (explicit !== void 0 && asString2(explicit) !== "") return asString2(explicit);
  if (!workflowId) return `idx-${position ?? index}`;
  return `${workflowId}:${index}`;
};
function vinylRecordLines(record) {
  if (!isRecord3(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord3) : [];
  const source = flat.length ? flat.map((item, index) => ({ item, index, workflowId: asString2(item.workflow_id) })) : (Array.isArray(record.workflows) ? record.workflows : []).flatMap((wf) => {
    if (!isRecord3(wf)) return [];
    const wfId = asString2(wf.id ?? wf.workflow_id ?? wf.name);
    return (Array.isArray(wf.items) ? wf.items : []).filter(isRecord3).map((item, index) => ({ item, index, workflowId: wfId }));
  });
  const origin = flat.length ? "items" : "workflows";
  return source.map(({ item, index, workflowId }, position) => ({
    key: lineKey(item, index, workflowId, position),
    index: position,
    label: asString2(firstField3(item, LINE_LABEL_FIELDS)) || `Item ${position + 1}`,
    qty: num4(firstField3(item, LINE_QTY_FIELDS), 1),
    cost: firstFinite4(item, LINE_COST_FIELDS),
    category_key: asString2(firstField3(item, LINE_CATEGORY_FIELDS)),
    item,
    origin,
    workflow_id: workflowId
  }));
}
var engineBlockOf = (record) => firstRecord(record, ENGINE_BLOCK_FIELDS) ?? {};
function vinylPricingContextOf(record, callerContext = null) {
  const rec = isRecord3(record) ? record : {};
  const block = engineBlockOf(rec);
  const caller = isRecord3(callerContext) ? callerContext : {};
  const cp = isRecord3(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField3(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField3(block, TIER_CONTEXT_FIELDS.concat("tier")) ?? firstField3(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray(block, EMBEDDED_RULE_FIELDS) ?? [];
  const templates = firstArray(caller, ["templates", "pricing_templates"]) ?? firstArray(block, EMBEDDED_TEMPLATE_FIELDS) ?? [];
  const tiers = firstArray(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray(block, EMBEDDED_TIER_CATALOG_FIELDS.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite4(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite4(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite4(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function vinylLineDescriptor(line, record = null) {
  const item = isRecord3(line?.item) ? line.item : isRecord3(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of VINYL_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf(record);
  const lineMap = firstRecord(block, ENGINE_LINE_MAP_FIELDS);
  const mapEntry = lineMap ? isRecord3(lineMap[line?.key]) ? lineMap[line.key] : isRecord3(lineMap[asString2(line?.index)]) ? lineMap[asString2(line?.index)] : null : null;
  const nested = firstRecord(item, NESTED_CONFIG_FIELDS);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function vinylConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : vinylRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = vinylLineDescriptor(line, record);
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
var passthroughResult = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveVinylSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord3(input.record) ? input.record : null;
  const baselineSell = num4(input.baselineSell ?? input.baseline_sell);
  const internalCost = num4(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite4(rec, ["subtotal"]);
  const markupPct = firstFinite4(input, ["markupPercent", "markup_percent"]) ?? firstFinite4(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num4(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = vinylPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString2(
      isRecord3(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num4(context.defaultMarkupPct)
  };
  const engine = isRecord3(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : vinylRecordLines(rec);
  const scan = vinylConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord3(line?.item) ? line.item : isRecord3(line) ? line : {};
    const descriptor = vinylLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    const cost = line.cost !== void 0 ? line.cost : firstFinite4(rawItem, LINE_COST_FIELDS);
    const qty = num4(line.qty ?? firstField3(rawItem, LINE_QTY_FIELDS), 1) || 0;
    const base = {
      key: line.key || lineKey(rawItem, position),
      label: line.label || asString2(firstField3(rawItem, LINE_LABEL_FIELDS)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField3(partDescriptor, FORMULA_FIELDS);
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
          tier: firstField3(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord3(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString2(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString2(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString2(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField3(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS) ? EMBEDDED_RULE_FIELDS.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField3(partDescriptor, MACHINE_FIELDS) ?? null;
    const setupFee = firstFinite4(partDescriptor, SETUP_FIELDS) ?? void 0;
    const minimumCharge = firstFinite4(partDescriptor, MIN_FIELDS) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString2(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString2(firstField3(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString2(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord3(priced) ? priced : {};
    const lineSubtotal = firstFinite4(pricedRecord, ["subtotal"]) ?? num4(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num4(pricedRecord.unitPrice),
      extended: num4(pricedRecord.extended),
      setup_fee: num4(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num4(pricedRecord.total),
      price_source: asString2(pricedRecord.priceSource),
      tier_source: asString2(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString2(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round24(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round24(configuredBaseline)}) exceeds project sell \u2014 remainder ${round24(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round24(baselineSell)} - configured baseline ${round24(configuredBaseline)} = remainder ${round24(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round24(remainder)} + engine ${round24(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/vinyl/vinylEnginePricing.js
var ENGINE2 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveVinylEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = vinylPricingContextOf(record, caller);
    return resolveVinylSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE2, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function vinylEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveVinylEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/brickPricingWire.ts
var isRecord4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString3 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc3 = (v) => asString3(v).toLowerCase();
var toFiniteNumber3 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num5 = (v, fallback = 0) => toFiniteNumber3(v) ?? fallback;
var firstField4 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite5 = (rec, fields) => {
  const v = firstField4(rec, fields);
  const n = toFiniteNumber3(v);
  return n === null ? null : n;
};
var firstArray2 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord2 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord4(rec[f])) return rec[f];
  }
  return null;
};
var round25 = (n) => Math.round((num5(n) + Number.EPSILON) * 100) / 100;
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
var CONTEXT_BLOCK_FIELDS = [
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context",
  "engine_context"
];
var NESTED_CONTEXT_FIELDS = ["engine_context", "pricing_engine"];
var ENGINE_LINE_MAP_FIELDS2 = ["items", "lines", "line_config", "item_config"];
var COMPONENT_BLOCK_SUFFIXES = [
  "pricing",
  "price_config",
  "engine_pricing",
  "pricing_config",
  "engine_price",
  "tier_config",
  "sell_pricing"
];
var ENGINE_MODE_TOKENS3 = /* @__PURE__ */ new Set([
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
var FIXED_FIELDS2 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS3 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS3 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS4 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS2 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS2 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS2 = ["formula_modifiers", "modifiers"];
var MODE_FIELDS3 = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS2 = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS2 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS2 = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS2 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS2 = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS2 = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var DEFAULT_MARKUP_FIELDS2 = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var BRICK_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS2,
  ...TIER_REF_FIELDS3,
  ...BREAK_FIELDS3,
  ...TEMPLATE_REF_FIELDS2,
  ...TIER_SET_FIELDS2,
  ...MARKET_FIELDS2,
  ...MARKET_DISCOUNT_FIELDS2,
  ...MARKUP_FIELDS4,
  ...MIN_FIELDS2,
  ...SETUP_FIELDS2,
  ...FORMULA_FIELDS2,
  ...MODE_FIELDS3,
  ...MACHINE_FIELDS2,
  ...TIER_CONTEXT_FIELDS2,
  ...EMBEDDED_RULE_FIELDS2,
  ...EMBEDDED_TEMPLATE_FIELDS2,
  ...EMBEDDED_TIER_CATALOG_FIELDS2,
  ...UNIT_FIELDS,
  ...TAX_PCT_FIELDS2,
  ...INTERPOLATE_FIELDS,
  "taxable"
]);
var isEngineModeToken2 = (v) => ENGINE_MODE_TOKENS3.has(lc3(v));
var nonEmptyArrayField2 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var machineHasConfig2 = (v) => {
  if (!isRecord4(v)) return false;
  const fixed = firstFinite5(v, FIXED_FIELDS2);
  const retail = firstFinite5(v, MARKET_FIELDS2);
  const markup = firstFinite5(v, MARKUP_FIELDS4);
  return fixed !== null && fixed > 0 || retail !== null && retail > 0 || markup !== null || firstFinite5(v, MIN_FIELDS2) !== null || nonEmptyArrayField2(v, [...BREAK_FIELDS3, ...FORMULA_FIELDS2]) || MODE_FIELDS3.some((f) => isEngineModeToken2(v[f])) || TIER_REF_FIELDS3.some((f) => asString3(v[f]) !== "");
};
function descriptorHasPricingContent2(d) {
  if (!isRecord4(d)) return false;
  const fixed = firstFinite5(d, FIXED_FIELDS2);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS3.some((f) => asString3(d[f]) !== "")) return true;
  if (nonEmptyArrayField2(d, BREAK_FIELDS3)) return true;
  const retail = firstFinite5(d, MARKET_FIELDS2);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite5(d, MARKET_DISCOUNT_FIELDS2);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS3.some((f) => isEngineModeToken2(d[f]))) return true;
  const markup = firstFinite5(d, MARKUP_FIELDS4);
  if (markup !== null) return true;
  if (nonEmptyArrayField2(d, FORMULA_FIELDS2)) return true;
  if (firstFinite5(d, MIN_FIELDS2) !== null) return true;
  if (firstFinite5(d, SETUP_FIELDS2) !== null) return true;
  if (TEMPLATE_REF_FIELDS2.some((f) => {
    const v = d[f];
    return isRecord4(v) ? true : asString3(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS2.some((f) => asString3(d[f]) !== "")) return true;
  if (nonEmptyArrayField2(d, [...EMBEDDED_RULE_FIELDS2, ...EMBEDDED_TEMPLATE_FIELDS2, ...EMBEDDED_TIER_CATALOG_FIELDS2])) return true;
  if (TIER_CONTEXT_FIELDS2.some((f) => asString3(firstField4(d, [f])) !== "")) return true;
  if (MACHINE_FIELDS2.some((f) => machineHasConfig2(d[f]))) return true;
  return false;
}
var componentOf = (key) => BRICK_COMPONENTS.find((c) => c.key === lc3(key)) ?? null;
function brickCostLines(record) {
  if (!isRecord4(record)) return [];
  const lines = [];
  BRICK_COMPONENTS.forEach((comp) => {
    const cost = firstFinite5(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite5(record, comp.qtyFields) ?? 1;
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
  const rec = isRecord4(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS) {
    if (isRecord4(rec[f])) return { block: rec[f], field: f };
  }
  const cp = isRecord4(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS) {
      if (isRecord4(cp[f])) return { block: cp[f], field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: "" };
};
function brickPricingContextOf(record, callerContext = null) {
  const rec = isRecord4(record) ? record : {};
  const caller = isRecord4(callerContext) ? callerContext : {};
  if (callerContext?.__brickPricingContext === true) {
    return callerContext;
  }
  const { block, field } = contextBlockOf(rec);
  const blk = block ?? {};
  const cp = isRecord4(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField4(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField4(blk, [...TIER_CONTEXT_FIELDS2, "tier"]) ?? firstField4(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray2(caller, EMBEDDED_RULE_FIELDS2) ?? firstArray2(blk, EMBEDDED_RULE_FIELDS2) ?? [];
  const templates = firstArray2(caller, EMBEDDED_TEMPLATE_FIELDS2) ?? firstArray2(blk, EMBEDDED_TEMPLATE_FIELDS2) ?? [];
  const tiers = firstArray2(caller, EMBEDDED_TIER_CATALOG_FIELDS2) ?? firstArray2(blk, EMBEDDED_TIER_CATALOG_FIELDS2) ?? [];
  const defaultMarkupPct = firstFinite5(caller, DEFAULT_MARKUP_FIELDS2.concat("markup_pct")) ?? firstFinite5(blk, DEFAULT_MARKUP_FIELDS2.concat(MARKUP_FIELDS4)) ?? firstFinite5(rec, ["markup_percent"]) ?? 0;
  const taxable = typeof caller.taxable === "boolean" ? caller.taxable : typeof blk.taxable === "boolean" ? blk.taxable : lc3(blk.taxable) === "true" ? true : lc3(blk.taxable) === "false" ? false : void 0;
  const callerModifiers = firstArray2(caller, FORMULA_FIELDS2);
  const blockModifiers = firstArray2(blk, FORMULA_FIELDS2);
  return {
    __brickPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num5(defaultMarkupPct),
    machine: firstField4(blk, MACHINE_FIELDS2) ?? firstField4(caller, MACHINE_FIELDS2) ?? null,
    taxable,
    taxPercent: num5(firstFinite5(caller, TAX_PCT_FIELDS2) ?? firstFinite5(blk, TAX_PCT_FIELDS2)),
    setupFee: num5(firstFinite5(caller, SETUP_FIELDS2) ?? firstFinite5(blk, SETUP_FIELDS2)),
    minimumCharge: num5(firstFinite5(caller, MIN_FIELDS2) ?? firstFinite5(blk, MIN_FIELDS2)),
    modifiers: callerModifiers ?? blockModifiers ?? void 0,
    lineMap: firstRecord2(blk, ENGINE_LINE_MAP_FIELDS2),
    now: caller.now ?? blk.now,
    raw: block
  };
}
var componentNestedBlock = (record, key) => {
  const rec = isRecord4(record) ? record : {};
  for (const suffix of COMPONENT_BLOCK_SUFFIXES) {
    const f = `${key}_${suffix}`;
    if (isRecord4(rec[f])) return rec[f];
  }
  return null;
};
var engineFieldsFrom = (src, prefix = "") => {
  const out = {};
  if (!isRecord4(src)) return out;
  for (const f of BRICK_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== void 0 && src[k] !== null && src[k] !== "") out[f] = src[k];
  }
  return out;
};
function brickLineDescriptor(line, record = null) {
  const key = lc3(line?.key);
  if (!componentOf(key)) return null;
  const rec = isRecord4(record) ? record : {};
  const flat = engineFieldsFrom(rec, key);
  const rawLine = isRecord4(line) ? line : {};
  const ownInline = engineFieldsFrom(rawLine);
  const ownNested = firstRecord2(rawLine, ["descriptor", "pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"]);
  const { block } = contextBlockOf(rec);
  const lineMap = block ? firstRecord2(block, ENGINE_LINE_MAP_FIELDS2) : null;
  const mapEntry = lineMap ? isRecord4(lineMap[key]) ? lineMap[key] : isRecord4(lineMap[asString3(line?.index)]) ? lineMap[asString3(line?.index)] : null : null;
  const nested = componentNestedBlock(rec, key);
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
function brickConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : brickCostLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = brickLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent2(descriptor),
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
var passthroughResult2 = (reason, baselineSell, internalCost, markupPct, contextEngaged, lines, chain, warnings, contextUsed) => ({
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
function resolveBrickSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord4(input.record) ? input.record : null;
  const baselineSell = num5(input.baselineSell ?? input.baseline_sell);
  const internalCost = num5(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite5(rec, ["subtotal"]);
  const markupPct = firstFinite5(input, ["markupPercent", "markup_percent"]) ?? firstFinite5(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num5(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = brickPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || "",
    customer_tier: asString3(
      isRecord4(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num5(context.defaultMarkupPct)
  };
  const engine = isRecord4(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines.map((l, position) => ({
    key: asString3(l?.key) || `line-${position}`,
    index: position,
    label: asString3(l?.label) || componentOf(l?.key)?.label || `Component ${position + 1}`,
    qty: l?.qty !== void 0 ? num5(l.qty, 1) : componentOf(l?.key) ? firstFinite5(rec, componentOf(l?.key).qtyFields) ?? 1 : 1,
    cost: l?.cost !== void 0 ? toFiniteNumber3(l.cost) : componentOf(l?.key) ? firstFinite5(rec, componentOf(l?.key).costFields) : toFiniteNumber3(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost),
    category_key: asString3(l?.category_key) || componentOf(l?.key)?.category_key || "",
    item: isRecord4(l?.item) ? l.item : rec,
    descriptor: isRecord4(l) ? l : null,
    origin: "caller"
  })) : brickCostLines(rec);
  const scan = brickConfigScan(rec, wireLines);
  const engaged = context.hasContextBlock || scan.configured;
  chain.push({
    layer: "config_scan",
    hit: engaged,
    won: false,
    detail: context.hasContextBlock ? `context block via ${context.field}${scan.configured ? ` + ${scan.configuredCount} configured component(s)` : ""}` : scan.configured ? `${scan.configuredCount} of ${scan.lineCount} components carry pricing config` : `no pricing config on ${scan.lineCount} components`
  });
  if (!record) return passthroughResult2("no_record", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult2("no_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult2("no_config", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult2("no_engine", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const descriptor = brickLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent2(descriptor);
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== void 0 ? line.cost : null;
    const qty = num5(line.qty, 1);
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
    const lineModifiers = firstField4(partDescriptor, FORMULA_FIELDS2);
    for (const f of FORMULA_FIELDS2) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS2.reduce(
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
          tier: firstField4(partDescriptor, TIER_CONTEXT_FIELDS2) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord4(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString3(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `component '${base.label}': ${asString3(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`component '${base.label}': template resolution failed (${asString3(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField4(partDescriptor, TIER_CONTEXT_FIELDS2) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField2(partDescriptor, EMBEDDED_RULE_FIELDS2) ? EMBEDDED_RULE_FIELDS2.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField4(partDescriptor, MACHINE_FIELDS2) ?? context.machine;
    const setupFee = firstFinite5(partDescriptor, SETUP_FIELDS2) ?? (context.setupFee || void 0);
    const minimumCharge = firstFinite5(partDescriptor, MIN_FIELDS2) ?? (context.minimumCharge || void 0);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === "boolean" ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite5(partDescriptor, TAX_PCT_FIELDS2) ?? (context.taxPercent || void 0);
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString3(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString3(firstField4(partDescriptor, UNIT_FIELDS)) || "each",
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
      warnings.push(`component '${base.label}': engine pricing failed (${asString3(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord4(priced) ? priced : {};
    const lineSubtotal = firstFinite5(pricedRecord, ["subtotal"]) ?? num5(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? "descriptor" : "context";
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num5(pricedRecord.unitPrice),
      extended: num5(pricedRecord.extended),
      setup_fee: num5(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num5(pricedRecord.total),
      price_source: asString3(pricedRecord.priceSource),
      tier_source: asString3(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString3(pricedRecord.danglingTierRef) || null,
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
    return passthroughResult2("no_priced_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round25(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round25(configuredBaseline)}) exceeds project sell \u2014 remainder ${round25(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round25(baselineSell)} - priced baseline ${round25(configuredBaseline)} = remainder ${round25(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round25(remainder)} + engine ${round25(engineTotal)} = ${customerPrice}`
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

// src/components/estimator/brick/brickSellPricing.js
var ENGINE3 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveBrickEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = brickPricingContextOf(record, caller);
    return resolveBrickSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE3, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function brickEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveBrickEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/cncPricingWire.ts
var isRecord5 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString4 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc4 = (v) => asString4(v).toLowerCase();
var toFiniteNumber4 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num6 = (v, fallback = 0) => toFiniteNumber4(v) ?? fallback;
var firstField5 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite6 = (rec, fields) => {
  const v = firstField5(rec, fields);
  const n = toFiniteNumber4(v);
  return n === null ? null : n;
};
var firstArray3 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord3 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord5(rec[f])) return rec[f];
  }
  return null;
};
var round26 = (n) => Math.round((num6(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS2 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS2 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS2 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS2 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS2 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS2 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS2 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS3 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS4 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS3 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS4 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS4 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS5 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS3 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS3 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS3 = ["formula_modifiers"];
var MODE_FIELDS4 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS3 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS3 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS3 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS3 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS3 = ["tiers", "tier_catalog"];
var CNC_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS3,
  ...TIER_REF_FIELDS4,
  ...BREAK_FIELDS4,
  ...TEMPLATE_REF_FIELDS3,
  ...TIER_SET_FIELDS3,
  ...MARKET_FIELDS3,
  ...MARKET_DISCOUNT_FIELDS3,
  ...MARKUP_FIELDS5,
  ...MIN_FIELDS3,
  ...SETUP_FIELDS3,
  ...FORMULA_FIELDS3,
  ...MODE_FIELDS4,
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
var isEngineModeToken3 = (v) => ENGINE_MODE_TOKENS4.has(lc4(v));
var nonEmptyArrayField3 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField2 = (rec, fields) => fields.some((f) => firstFinite6(rec, [f]) !== null);
var anyPositiveField2 = (rec, fields) => fields.some((f) => {
  const v = firstFinite6(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig3 = (v) => {
  if (!isRecord5(v)) return false;
  return anyPositiveField2(v, [...FIXED_FIELDS3, ...MARKET_FIELDS3, ...MIN_FIELDS3]) || anyFiniteField2(v, MARKUP_FIELDS5) || nonEmptyArrayField3(v, [...BREAK_FIELDS4, ...FORMULA_FIELDS3]) || MODE_FIELDS4.some((f) => isEngineModeToken3(v[f])) || TIER_REF_FIELDS4.some((f) => asString4(v[f]) !== "");
};
function descriptorHasPricingContent3(d) {
  if (!isRecord5(d)) return false;
  if (anyPositiveField2(d, [...FIXED_FIELDS3, ...MARKET_FIELDS3, ...MARKET_DISCOUNT_FIELDS3, ...MIN_FIELDS3, ...SETUP_FIELDS3]) || anyFiniteField2(d, MARKUP_FIELDS5)) return true;
  if (nonEmptyArrayField3(d, [...BREAK_FIELDS4, ...FORMULA_FIELDS3, ...EMBEDDED_RULE_FIELDS3, ...EMBEDDED_TEMPLATE_FIELDS3, ...EMBEDDED_TIER_CATALOG_FIELDS3])) return true;
  if (MODE_FIELDS4.some((f) => isEngineModeToken3(d[f]))) return true;
  if (TIER_REF_FIELDS4.some((f) => asString4(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS3.some((f) => {
    const v = d[f];
    return isRecord5(v) ? true : asString4(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS3.some((f) => asString4(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS3.some((f) => firstField5(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS3.some((f) => machineHasConfig3(d[f]))) return true;
  return false;
}
var lineKey2 = (item, index) => {
  const explicit = firstField5(item, LINE_KEY_FIELDS2);
  if (explicit !== void 0 && asString4(explicit) !== "") return asString4(explicit);
  return `idx-${index}`;
};
var lineCostOf = (item) => {
  const direct = firstFinite6(item, LINE_COST_FIELDS2);
  if (direct !== null) return direct;
  const machine = toFiniteNumber4(item.machine_cost);
  const labor = toFiniteNumber4(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num6(machine) + num6(labor);
};
function cncRecordLines(record) {
  if (!isRecord5(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord5) : [];
  return flat.map((item, index) => ({
    key: lineKey2(item, index),
    index,
    label: asString4(firstField5(item, LINE_LABEL_FIELDS2)) || `Item ${index + 1}`,
    qty: num6(firstField5(item, LINE_QTY_FIELDS2), 1),
    cost: lineCostOf(item),
    category_key: asString4(firstField5(item, LINE_CATEGORY_FIELDS2)),
    item,
    origin: "items"
  }));
}
var engineBlockOf2 = (record) => firstRecord3(record, ENGINE_BLOCK_FIELDS2) ?? {};
function cncPricingContextOf(record, callerContext = null) {
  const rec = isRecord5(record) ? record : {};
  const block = engineBlockOf2(rec);
  const caller = isRecord5(callerContext) ? callerContext : {};
  const cp = isRecord5(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField5(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField5(block, TIER_CONTEXT_FIELDS3.concat("tier")) ?? firstField5(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray3(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray3(block, EMBEDDED_RULE_FIELDS3) ?? [];
  const templates = firstArray3(caller, ["templates", "pricing_templates"]) ?? firstArray3(block, EMBEDDED_TEMPLATE_FIELDS3) ?? [];
  const tiers = firstArray3(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray3(block, EMBEDDED_TIER_CATALOG_FIELDS3.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite6(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite6(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite6(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function cncLineDescriptor(line, record = null) {
  const item = isRecord5(line?.item) ? line.item : isRecord5(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of CNC_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf2(record);
  const lineMap = firstRecord3(block, ENGINE_LINE_MAP_FIELDS3);
  const mapEntry = lineMap ? isRecord5(lineMap[line?.key]) ? lineMap[line.key] : isRecord5(lineMap[asString4(line?.index)]) ? lineMap[asString4(line?.index)] : null : null;
  const nested = firstRecord3(item, NESTED_CONFIG_FIELDS2);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function cncConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : cncRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = cncLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent3(descriptor),
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
var passthroughResult3 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveCncSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord5(input.record) ? input.record : null;
  const baselineSell = num6(input.baselineSell ?? input.baseline_sell);
  const internalCost = num6(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite6(rec, ["subtotal"]);
  const markupPct = firstFinite6(input, ["markupPercent", "markup_percent"]) ?? firstFinite6(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num6(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = cncPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString4(
      isRecord5(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num6(context.defaultMarkupPct)
  };
  const engine = isRecord5(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : cncRecordLines(rec);
  const scan = cncConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult3("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult3("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult3("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult3("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord5(line?.item) ? line.item : isRecord5(line) ? line : {};
    const descriptor = cncLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent3(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf(rawItem);
    const qty = num6(line.qty ?? firstField5(rawItem, LINE_QTY_FIELDS2), 1) || 0;
    const base = {
      key: line.key || lineKey2(rawItem, position),
      label: line.label || asString4(firstField5(rawItem, LINE_LABEL_FIELDS2)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField5(partDescriptor, FORMULA_FIELDS3);
    for (const f of FORMULA_FIELDS3) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS3.reduce(
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
          tier: firstField5(partDescriptor, TIER_CONTEXT_FIELDS3) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord5(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString4(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString4(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString4(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField5(partDescriptor, TIER_CONTEXT_FIELDS3) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField3(partDescriptor, EMBEDDED_RULE_FIELDS3) ? EMBEDDED_RULE_FIELDS3.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField5(partDescriptor, MACHINE_FIELDS3) ?? null;
    const setupFee = firstFinite6(partDescriptor, SETUP_FIELDS3) ?? void 0;
    const minimumCharge = firstFinite6(partDescriptor, MIN_FIELDS3) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString4(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString4(firstField5(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString4(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord5(priced) ? priced : {};
    const lineSubtotal = firstFinite6(pricedRecord, ["subtotal"]) ?? num6(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num6(pricedRecord.unitPrice),
      extended: num6(pricedRecord.extended),
      setup_fee: num6(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num6(pricedRecord.total),
      price_source: asString4(pricedRecord.priceSource),
      tier_source: asString4(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString4(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult3("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round26(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round26(configuredBaseline)}) exceeds project sell \u2014 remainder ${round26(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round26(baselineSell)} - configured baseline ${round26(configuredBaseline)} = remainder ${round26(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round26(remainder)} + engine ${round26(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/cnc/cncSellPricing.js
var ENGINE4 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveCncEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = cncPricingContextOf(record, caller);
    return resolveCncSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE4, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function cncEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveCncEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/metalPricingWire.ts
var isRecord6 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString5 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc5 = (v) => asString5(v).toLowerCase();
var toFiniteNumber5 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num7 = (v, fallback = 0) => toFiniteNumber5(v) ?? fallback;
var firstField6 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite7 = (rec, fields) => {
  const v = firstField6(rec, fields);
  const n = toFiniteNumber5(v);
  return n === null ? null : n;
};
var firstArray4 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord4 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord6(rec[f])) return rec[f];
  }
  return null;
};
var round27 = (n) => Math.round((num7(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS3 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_COMPONENT_FIELDS = [
  "material_cost",
  "supplies_cost",
  "fabrication_cost",
  "welding_cost",
  "finishing_cost"
];
var RECORD_COMPONENT_TOTAL_FIELDS = [
  "total_material_cost",
  "total_supplies_cost",
  "total_fabrication_cost",
  "total_welding_cost",
  "total_finishing_cost"
];
var ENRICHED_MATERIAL_FIELDS = ["materials_cost"];
var ENRICHED_LABOR_FIELDS = ["labor_cost"];
var LINE_QTY_FIELDS3 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS3 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS3 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS3 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS3 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS3 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS4 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS5 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS4 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS5 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS5 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS6 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS4 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS4 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS4 = ["formula_modifiers"];
var MODE_FIELDS5 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS4 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS4 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS4 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS4 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS4 = ["tiers", "tier_catalog"];
var METAL_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS4,
  ...TIER_REF_FIELDS5,
  ...BREAK_FIELDS5,
  ...TEMPLATE_REF_FIELDS4,
  ...TIER_SET_FIELDS4,
  ...MARKET_FIELDS4,
  ...MARKET_DISCOUNT_FIELDS4,
  ...MARKUP_FIELDS6,
  ...MIN_FIELDS4,
  ...SETUP_FIELDS4,
  ...FORMULA_FIELDS4,
  ...MODE_FIELDS5,
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
var isEngineModeToken4 = (v) => ENGINE_MODE_TOKENS5.has(lc5(v));
var nonEmptyArrayField4 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField3 = (rec, fields) => fields.some((f) => firstFinite7(rec, [f]) !== null);
var anyPositiveField3 = (rec, fields) => fields.some((f) => {
  const v = firstFinite7(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig4 = (v) => {
  if (!isRecord6(v)) return false;
  return anyPositiveField3(v, [...FIXED_FIELDS4, ...MARKET_FIELDS4, ...MIN_FIELDS4]) || anyFiniteField3(v, MARKUP_FIELDS6) || nonEmptyArrayField4(v, [...BREAK_FIELDS5, ...FORMULA_FIELDS4]) || MODE_FIELDS5.some((f) => isEngineModeToken4(v[f])) || TIER_REF_FIELDS5.some((f) => asString5(v[f]) !== "");
};
function descriptorHasPricingContent4(d) {
  if (!isRecord6(d)) return false;
  if (anyPositiveField3(d, [...FIXED_FIELDS4, ...MARKET_FIELDS4, ...MARKET_DISCOUNT_FIELDS4, ...MIN_FIELDS4, ...SETUP_FIELDS4]) || anyFiniteField3(d, MARKUP_FIELDS6)) return true;
  if (nonEmptyArrayField4(d, [...BREAK_FIELDS5, ...FORMULA_FIELDS4, ...EMBEDDED_RULE_FIELDS4, ...EMBEDDED_TEMPLATE_FIELDS4, ...EMBEDDED_TIER_CATALOG_FIELDS4])) return true;
  if (MODE_FIELDS5.some((f) => isEngineModeToken4(d[f]))) return true;
  if (TIER_REF_FIELDS5.some((f) => asString5(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS4.some((f) => {
    const v = d[f];
    return isRecord6(v) ? true : asString5(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS4.some((f) => asString5(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS4.some((f) => firstField6(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS4.some((f) => machineHasConfig4(d[f]))) return true;
  return false;
}
var lineKey3 = (item, index) => {
  const explicit = firstField6(item, LINE_KEY_FIELDS3);
  if (explicit !== void 0 && asString5(explicit) !== "") return asString5(explicit);
  return `idx-${index}`;
};
var qtyMultiplier = (item) => num7(firstField6(item, LINE_QTY_FIELDS3), 1) || 1;
var hasEnrichedCost = (item) => firstFinite7(item, ENRICHED_MATERIAL_FIELDS) !== null || firstFinite7(item, ENRICHED_LABOR_FIELDS) !== null;
var isComponentCostItem = (item) => firstFinite7(item, LINE_COST_FIELDS3) === null && !hasEnrichedCost(item) && LINE_COMPONENT_FIELDS.some((f) => toFiniteNumber5(item[f]) !== null);
function metalComponentsAreExtended(record, items) {
  const rec = isRecord6(record) ? record : {};
  const list = Array.isArray(items) ? items : Array.isArray(rec.items) ? rec.items.filter(isRecord6) : [];
  const componentItems = list.filter(isComponentCostItem);
  if (!componentItems.length) return false;
  let errExtended = 0;
  let errPerUnit = 0;
  let compared = 0;
  LINE_COMPONENT_FIELDS.forEach((comp, i) => {
    const recorded = toFiniteNumber5(rec[RECORD_COMPONENT_TOTAL_FIELDS[i]]);
    if (recorded === null) return;
    let sumExtended = 0;
    let sumPerUnit = 0;
    let any = false;
    for (const item of componentItems) {
      const v = toFiniteNumber5(item[comp]);
      if (v === null) continue;
      any = true;
      sumExtended += v;
      sumPerUnit += v * qtyMultiplier(item);
    }
    if (!any) return;
    errExtended += Math.abs(sumExtended - recorded);
    errPerUnit += Math.abs(sumPerUnit - recorded);
    compared += 1;
  });
  if (!compared) {
    const basis = firstFinite7(rec, ["subtotal"]) ?? (toFiniteNumber5(rec.total_cost) !== null ? num7(rec.total_cost) - num7(rec.markup_amount) : null);
    if (basis === null) return false;
    let sumExtended = 0;
    let sumPerUnit = 0;
    for (const item of list) {
      if (isComponentCostItem(item)) {
        const comps = LINE_COMPONENT_FIELDS.reduce((s, f) => s + num7(item[f]), 0);
        sumExtended += comps;
        sumPerUnit += comps * qtyMultiplier(item);
      } else {
        const other = lineCostOf2(item, false);
        if (other === null) continue;
        sumExtended += other;
        sumPerUnit += other;
      }
    }
    errExtended = Math.abs(sumExtended - basis);
    errPerUnit = Math.abs(sumPerUnit - basis);
  }
  return errExtended < errPerUnit;
}
var lineCostOf2 = (item, componentsExtended = false) => {
  const direct = firstFinite7(item, LINE_COST_FIELDS3);
  if (direct !== null) return direct;
  if (hasEnrichedCost(item)) {
    return num7(firstFinite7(item, ENRICHED_MATERIAL_FIELDS)) + num7(item.supplies_cost) + num7(firstFinite7(item, ENRICHED_LABOR_FIELDS));
  }
  const hasComponent = LINE_COMPONENT_FIELDS.some((f) => toFiniteNumber5(item[f]) !== null);
  if (!hasComponent) return null;
  const compSum = LINE_COMPONENT_FIELDS.reduce((s, f) => s + num7(item[f]), 0);
  return componentsExtended ? compSum : compSum * qtyMultiplier(item);
};
function metalRecordLines(record) {
  if (!isRecord6(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord6) : [];
  const componentsExtended = metalComponentsAreExtended(record, flat);
  return flat.map((item, index) => ({
    key: lineKey3(item, index),
    index,
    label: asString5(firstField6(item, LINE_LABEL_FIELDS3)) || `Item ${index + 1}`,
    qty: num7(firstField6(item, LINE_QTY_FIELDS3), 1),
    cost: lineCostOf2(item, componentsExtended),
    category_key: asString5(firstField6(item, LINE_CATEGORY_FIELDS3)),
    item,
    origin: "items"
  }));
}
var engineBlockOf3 = (record) => firstRecord4(record, ENGINE_BLOCK_FIELDS3) ?? {};
function metalPricingContextOf(record, callerContext = null) {
  const rec = isRecord6(record) ? record : {};
  const block = engineBlockOf3(rec);
  const caller = isRecord6(callerContext) ? callerContext : {};
  const cp = isRecord6(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField6(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField6(block, TIER_CONTEXT_FIELDS4.concat("tier")) ?? firstField6(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray4(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray4(block, EMBEDDED_RULE_FIELDS4) ?? [];
  const templates = firstArray4(caller, ["templates", "pricing_templates"]) ?? firstArray4(block, EMBEDDED_TEMPLATE_FIELDS4) ?? [];
  const tiers = firstArray4(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray4(block, EMBEDDED_TIER_CATALOG_FIELDS4.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite7(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite7(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite7(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function metalLineDescriptor(line, record = null) {
  const item = isRecord6(line?.item) ? line.item : isRecord6(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of METAL_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf3(record);
  const lineMap = firstRecord4(block, ENGINE_LINE_MAP_FIELDS4);
  const mapEntry = lineMap ? isRecord6(lineMap[line?.key]) ? lineMap[line.key] : isRecord6(lineMap[asString5(line?.index)]) ? lineMap[asString5(line?.index)] : null : null;
  const nested = firstRecord4(item, NESTED_CONFIG_FIELDS3);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function metalConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : metalRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = metalLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent4(descriptor),
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
var passthroughResult4 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveMetalSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord6(input.record) ? input.record : null;
  const baselineSell = num7(input.baselineSell ?? input.baseline_sell);
  const internalCost = num7(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite7(rec, ["subtotal"]);
  const markupPct = firstFinite7(input, ["markupPercent", "markup_percent"]) ?? firstFinite7(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num7(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = metalPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString5(
      isRecord6(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num7(context.defaultMarkupPct)
  };
  const engine = isRecord6(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : metalRecordLines(rec);
  const scan = metalConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult4("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult4("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult4("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult4("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  const componentsExtended = metalComponentsAreExtended(rec);
  wireLines.forEach((line, position) => {
    const rawItem = isRecord6(line?.item) ? line.item : isRecord6(line) ? line : {};
    const descriptor = metalLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent4(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf2(rawItem, componentsExtended);
    const qty = num7(line.qty ?? firstField6(rawItem, LINE_QTY_FIELDS3), 1) || 0;
    const base = {
      key: line.key || lineKey3(rawItem, position),
      label: line.label || asString5(firstField6(rawItem, LINE_LABEL_FIELDS3)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField6(partDescriptor, FORMULA_FIELDS4);
    for (const f of FORMULA_FIELDS4) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS4.reduce(
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
          tier: firstField6(partDescriptor, TIER_CONTEXT_FIELDS4) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord6(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString5(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString5(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString5(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField6(partDescriptor, TIER_CONTEXT_FIELDS4) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField4(partDescriptor, EMBEDDED_RULE_FIELDS4) ? EMBEDDED_RULE_FIELDS4.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField6(partDescriptor, MACHINE_FIELDS4) ?? null;
    const setupFee = firstFinite7(partDescriptor, SETUP_FIELDS4) ?? void 0;
    const minimumCharge = firstFinite7(partDescriptor, MIN_FIELDS4) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString5(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString5(firstField6(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString5(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord6(priced) ? priced : {};
    const lineSubtotal = firstFinite7(pricedRecord, ["subtotal"]) ?? num7(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num7(pricedRecord.unitPrice),
      extended: num7(pricedRecord.extended),
      setup_fee: num7(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num7(pricedRecord.total),
      price_source: asString5(pricedRecord.priceSource),
      tier_source: asString5(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString5(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult4("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round27(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round27(configuredBaseline)}) exceeds project sell \u2014 remainder ${round27(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round27(baselineSell)} - configured baseline ${round27(configuredBaseline)} = remainder ${round27(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round27(remainder)} + engine ${round27(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/metal/metalSellPricing.js
var ENGINE5 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveMetalEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = metalPricingContextOf(record, caller);
    return resolveMetalSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE5, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function metalEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveMetalEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/laserPricingWire.ts
var isRecord7 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString6 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc6 = (v) => asString6(v).toLowerCase();
var toFiniteNumber6 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num8 = (v, fallback = 0) => toFiniteNumber6(v) ?? fallback;
var firstField7 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite8 = (rec, fields) => {
  const v = firstField7(rec, fields);
  const n = toFiniteNumber6(v);
  return n === null ? null : n;
};
var firstArray5 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord5 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord7(rec[f])) return rec[f];
  }
  return null;
};
var round28 = (n) => Math.round((num8(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS4 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS4 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS4 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS4 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS4 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS4 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS4 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS5 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS6 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS5 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS6 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS6 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS7 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS5 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS5 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS5 = ["formula_modifiers"];
var MODE_FIELDS6 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS5 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS5 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS5 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS5 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS5 = ["tiers", "tier_catalog"];
var LASER_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS5,
  ...TIER_REF_FIELDS6,
  ...BREAK_FIELDS6,
  ...TEMPLATE_REF_FIELDS5,
  ...TIER_SET_FIELDS5,
  ...MARKET_FIELDS5,
  ...MARKET_DISCOUNT_FIELDS5,
  ...MARKUP_FIELDS7,
  ...MIN_FIELDS5,
  ...SETUP_FIELDS5,
  ...FORMULA_FIELDS5,
  ...MODE_FIELDS6,
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
var isEngineModeToken5 = (v) => ENGINE_MODE_TOKENS6.has(lc6(v));
var nonEmptyArrayField5 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField4 = (rec, fields) => fields.some((f) => firstFinite8(rec, [f]) !== null);
var anyPositiveField4 = (rec, fields) => fields.some((f) => {
  const v = firstFinite8(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig5 = (v) => {
  if (!isRecord7(v)) return false;
  return anyPositiveField4(v, [...FIXED_FIELDS5, ...MARKET_FIELDS5, ...MIN_FIELDS5]) || anyFiniteField4(v, MARKUP_FIELDS7) || nonEmptyArrayField5(v, [...BREAK_FIELDS6, ...FORMULA_FIELDS5]) || MODE_FIELDS6.some((f) => isEngineModeToken5(v[f])) || TIER_REF_FIELDS6.some((f) => asString6(v[f]) !== "");
};
function descriptorHasPricingContent5(d) {
  if (!isRecord7(d)) return false;
  if (anyPositiveField4(d, [...FIXED_FIELDS5, ...MARKET_FIELDS5, ...MARKET_DISCOUNT_FIELDS5, ...MIN_FIELDS5, ...SETUP_FIELDS5]) || anyFiniteField4(d, MARKUP_FIELDS7)) return true;
  if (nonEmptyArrayField5(d, [...BREAK_FIELDS6, ...FORMULA_FIELDS5, ...EMBEDDED_RULE_FIELDS5, ...EMBEDDED_TEMPLATE_FIELDS5, ...EMBEDDED_TIER_CATALOG_FIELDS5])) return true;
  if (MODE_FIELDS6.some((f) => isEngineModeToken5(d[f]))) return true;
  if (TIER_REF_FIELDS6.some((f) => asString6(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS5.some((f) => {
    const v = d[f];
    return isRecord7(v) ? true : asString6(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS5.some((f) => asString6(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS5.some((f) => firstField7(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS5.some((f) => machineHasConfig5(d[f]))) return true;
  return false;
}
var lineKey4 = (item, index) => {
  const explicit = firstField7(item, LINE_KEY_FIELDS4);
  if (explicit !== void 0 && asString6(explicit) !== "") return asString6(explicit);
  return `idx-${index}`;
};
var lineCostOf3 = (item) => {
  const direct = firstFinite8(item, LINE_COST_FIELDS4);
  if (direct !== null) return direct;
  const machine = toFiniteNumber6(item.machine_cost);
  const labor = toFiniteNumber6(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num8(machine) + num8(labor);
};
function laserRecordLines(record) {
  if (!isRecord7(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord7) : [];
  return flat.map((item, index) => ({
    key: lineKey4(item, index),
    index,
    label: asString6(firstField7(item, LINE_LABEL_FIELDS4)) || `Item ${index + 1}`,
    qty: num8(firstField7(item, LINE_QTY_FIELDS4), 1),
    cost: lineCostOf3(item),
    category_key: asString6(firstField7(item, LINE_CATEGORY_FIELDS4)),
    item,
    origin: "items"
  }));
}
var engineBlockOf4 = (record) => firstRecord5(record, ENGINE_BLOCK_FIELDS4) ?? {};
function laserPricingContextOf(record, callerContext = null) {
  const rec = isRecord7(record) ? record : {};
  const block = engineBlockOf4(rec);
  const caller = isRecord7(callerContext) ? callerContext : {};
  const cp = isRecord7(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField7(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField7(block, TIER_CONTEXT_FIELDS5.concat("tier")) ?? firstField7(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray5(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray5(block, EMBEDDED_RULE_FIELDS5) ?? [];
  const templates = firstArray5(caller, ["templates", "pricing_templates"]) ?? firstArray5(block, EMBEDDED_TEMPLATE_FIELDS5) ?? [];
  const tiers = firstArray5(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray5(block, EMBEDDED_TIER_CATALOG_FIELDS5.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite8(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite8(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite8(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function laserLineDescriptor(line, record = null) {
  const item = isRecord7(line?.item) ? line.item : isRecord7(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of LASER_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf4(record);
  const lineMap = firstRecord5(block, ENGINE_LINE_MAP_FIELDS5);
  const mapEntry = lineMap ? isRecord7(lineMap[line?.key]) ? lineMap[line.key] : isRecord7(lineMap[asString6(line?.index)]) ? lineMap[asString6(line?.index)] : null : null;
  const nested = firstRecord5(item, NESTED_CONFIG_FIELDS4);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function laserConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : laserRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = laserLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent5(descriptor),
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
var passthroughResult5 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveLaserSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord7(input.record) ? input.record : null;
  const baselineSell = num8(input.baselineSell ?? input.baseline_sell);
  const internalCost = num8(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite8(rec, ["subtotal"]);
  const markupPct = firstFinite8(input, ["markupPercent", "markup_percent"]) ?? firstFinite8(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num8(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = laserPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString6(
      isRecord7(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num8(context.defaultMarkupPct)
  };
  const engine = isRecord7(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : laserRecordLines(rec);
  const scan = laserConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult5("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult5("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult5("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult5("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord7(line?.item) ? line.item : isRecord7(line) ? line : {};
    const descriptor = laserLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent5(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf3(rawItem);
    const qty = num8(line.qty ?? firstField7(rawItem, LINE_QTY_FIELDS4), 1) || 0;
    const base = {
      key: line.key || lineKey4(rawItem, position),
      label: line.label || asString6(firstField7(rawItem, LINE_LABEL_FIELDS4)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField7(partDescriptor, FORMULA_FIELDS5);
    for (const f of FORMULA_FIELDS5) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS5.reduce(
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
          tier: firstField7(partDescriptor, TIER_CONTEXT_FIELDS5) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord7(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString6(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString6(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString6(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField7(partDescriptor, TIER_CONTEXT_FIELDS5) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField5(partDescriptor, EMBEDDED_RULE_FIELDS5) ? EMBEDDED_RULE_FIELDS5.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField7(partDescriptor, MACHINE_FIELDS5) ?? null;
    const setupFee = firstFinite8(partDescriptor, SETUP_FIELDS5) ?? void 0;
    const minimumCharge = firstFinite8(partDescriptor, MIN_FIELDS5) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString6(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString6(firstField7(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString6(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord7(priced) ? priced : {};
    const lineSubtotal = firstFinite8(pricedRecord, ["subtotal"]) ?? num8(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num8(pricedRecord.unitPrice),
      extended: num8(pricedRecord.extended),
      setup_fee: num8(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num8(pricedRecord.total),
      price_source: asString6(pricedRecord.priceSource),
      tier_source: asString6(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString6(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult5("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round28(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round28(configuredBaseline)}) exceeds project sell \u2014 remainder ${round28(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round28(baselineSell)} - configured baseline ${round28(configuredBaseline)} = remainder ${round28(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round28(remainder)} + engine ${round28(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/laser/laserSellPricing.js
var ENGINE6 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveLaserEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = laserPricingContextOf(record, caller);
    return resolveLaserSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE6, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function laserEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveLaserEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/paintPricingWire.ts
var isRecord8 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString7 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc7 = (v) => asString7(v).toLowerCase();
var toFiniteNumber7 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num9 = (v, fallback = 0) => toFiniteNumber7(v) ?? fallback;
var firstField8 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite9 = (rec, fields) => {
  const v = firstField8(rec, fields);
  const n = toFiniteNumber7(v);
  return n === null ? null : n;
};
var firstArray6 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord6 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord8(rec[f])) return rec[f];
  }
  return null;
};
var round29 = (n) => Math.round((num9(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS5 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_COMPONENT_FIELDS2 = ["supplies_cost", "paint_cost", "labor_cost"];
var LINE_QTY_FIELDS5 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS5 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS5 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS5 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS5 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS5 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS6 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS7 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS6 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS7 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS7 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS8 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS6 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS6 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS6 = ["formula_modifiers"];
var MODE_FIELDS7 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS6 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS6 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS6 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS6 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS6 = ["tiers", "tier_catalog"];
var PAINT_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS6,
  ...TIER_REF_FIELDS7,
  ...BREAK_FIELDS7,
  ...TEMPLATE_REF_FIELDS6,
  ...TIER_SET_FIELDS6,
  ...MARKET_FIELDS6,
  ...MARKET_DISCOUNT_FIELDS6,
  ...MARKUP_FIELDS8,
  ...MIN_FIELDS6,
  ...SETUP_FIELDS6,
  ...FORMULA_FIELDS6,
  ...MODE_FIELDS7,
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
var isEngineModeToken6 = (v) => ENGINE_MODE_TOKENS7.has(lc7(v));
var nonEmptyArrayField6 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField5 = (rec, fields) => fields.some((f) => firstFinite9(rec, [f]) !== null);
var anyPositiveField5 = (rec, fields) => fields.some((f) => {
  const v = firstFinite9(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig6 = (v) => {
  if (!isRecord8(v)) return false;
  return anyPositiveField5(v, [...FIXED_FIELDS6, ...MARKET_FIELDS6, ...MIN_FIELDS6]) || anyFiniteField5(v, MARKUP_FIELDS8) || nonEmptyArrayField6(v, [...BREAK_FIELDS7, ...FORMULA_FIELDS6]) || MODE_FIELDS7.some((f) => isEngineModeToken6(v[f])) || TIER_REF_FIELDS7.some((f) => asString7(v[f]) !== "");
};
function descriptorHasPricingContent6(d) {
  if (!isRecord8(d)) return false;
  if (anyPositiveField5(d, [...FIXED_FIELDS6, ...MARKET_FIELDS6, ...MARKET_DISCOUNT_FIELDS6, ...MIN_FIELDS6, ...SETUP_FIELDS6]) || anyFiniteField5(d, MARKUP_FIELDS8)) return true;
  if (nonEmptyArrayField6(d, [...BREAK_FIELDS7, ...FORMULA_FIELDS6, ...EMBEDDED_RULE_FIELDS6, ...EMBEDDED_TEMPLATE_FIELDS6, ...EMBEDDED_TIER_CATALOG_FIELDS6])) return true;
  if (MODE_FIELDS7.some((f) => isEngineModeToken6(d[f]))) return true;
  if (TIER_REF_FIELDS7.some((f) => asString7(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS6.some((f) => {
    const v = d[f];
    return isRecord8(v) ? true : asString7(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS6.some((f) => asString7(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS6.some((f) => firstField8(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS6.some((f) => machineHasConfig6(d[f]))) return true;
  return false;
}
var lineKey5 = (item, index) => {
  const explicit = firstField8(item, LINE_KEY_FIELDS5);
  if (explicit !== void 0 && asString7(explicit) !== "") return asString7(explicit);
  return `idx-${index}`;
};
var qtyMultiplier2 = (item) => Math.max(num9(firstField8(item, LINE_QTY_FIELDS5), 1) || 1, 1);
var isComponentCostItem2 = (item) => firstFinite9(item, LINE_COST_FIELDS5) === null && LINE_COMPONENT_FIELDS2.some((f) => toFiniteNumber7(item[f]) !== null);
function paintComponentsAreExtended(record, items) {
  const rec = isRecord8(record) ? record : {};
  const list = Array.isArray(items) ? items : Array.isArray(rec.items) ? rec.items.filter(isRecord8) : [];
  const componentItems = list.filter(isComponentCostItem2);
  if (!componentItems.length) return true;
  const recordedMask = toFiniteNumber7(rec.total_paint_mask_cost);
  if (recordedMask === null) return true;
  let any = false;
  let sumExtended = 0;
  let sumPerUnit = 0;
  for (const item of componentItems) {
    const v = toFiniteNumber7(item.supplies_cost);
    if (v === null) continue;
    any = true;
    sumExtended += v;
    sumPerUnit += v * qtyMultiplier2(item);
  }
  if (!any || Math.abs(sumExtended - sumPerUnit) <= 5e-3) return true;
  return Math.abs(sumExtended - recordedMask) <= Math.abs(sumPerUnit - recordedMask);
}
var lineCostOf4 = (item, componentsExtended = true) => {
  const direct = firstFinite9(item, LINE_COST_FIELDS5);
  if (direct !== null) return direct;
  const hasComponent = LINE_COMPONENT_FIELDS2.some((f) => toFiniteNumber7(item[f]) !== null);
  if (!hasComponent) return null;
  const compSum = LINE_COMPONENT_FIELDS2.reduce((s, f) => s + num9(item[f]), 0);
  return componentsExtended ? compSum : compSum * qtyMultiplier2(item);
};
function paintRecordLines(record) {
  if (!isRecord8(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord8) : [];
  const componentsExtended = paintComponentsAreExtended(record, flat);
  return flat.map((item, index) => ({
    key: lineKey5(item, index),
    index,
    label: asString7(firstField8(item, LINE_LABEL_FIELDS5)) || `Item ${index + 1}`,
    qty: num9(firstField8(item, LINE_QTY_FIELDS5), 1),
    cost: lineCostOf4(item, componentsExtended),
    category_key: asString7(firstField8(item, LINE_CATEGORY_FIELDS5)),
    item,
    origin: "items"
  }));
}
var engineBlockOf5 = (record) => firstRecord6(record, ENGINE_BLOCK_FIELDS5) ?? {};
function paintPricingContextOf(record, callerContext = null) {
  const rec = isRecord8(record) ? record : {};
  const block = engineBlockOf5(rec);
  const caller = isRecord8(callerContext) ? callerContext : {};
  const cp = isRecord8(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField8(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField8(block, TIER_CONTEXT_FIELDS6.concat("tier")) ?? firstField8(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray6(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray6(block, EMBEDDED_RULE_FIELDS6) ?? [];
  const templates = firstArray6(caller, ["templates", "pricing_templates"]) ?? firstArray6(block, EMBEDDED_TEMPLATE_FIELDS6) ?? [];
  const tiers = firstArray6(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray6(block, EMBEDDED_TIER_CATALOG_FIELDS6.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite9(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite9(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite9(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function paintLineDescriptor(line, record = null) {
  const item = isRecord8(line?.item) ? line.item : isRecord8(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of PAINT_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf5(record);
  const lineMap = firstRecord6(block, ENGINE_LINE_MAP_FIELDS6);
  const mapEntry = lineMap ? isRecord8(lineMap[line?.key]) ? lineMap[line.key] : isRecord8(lineMap[asString7(line?.index)]) ? lineMap[asString7(line?.index)] : null : null;
  const nested = firstRecord6(item, NESTED_CONFIG_FIELDS5);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function paintConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : paintRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = paintLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent6(descriptor),
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
var passthroughResult6 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolvePaintSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord8(input.record) ? input.record : null;
  const baselineSell = num9(input.baselineSell ?? input.baseline_sell);
  const internalCost = num9(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite9(rec, ["subtotal"]);
  const markupPct = firstFinite9(input, ["markupPercent", "markup_percent"]) ?? firstFinite9(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num9(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = paintPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString7(
      isRecord8(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num9(context.defaultMarkupPct)
  };
  const engine = isRecord8(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : paintRecordLines(rec);
  const scan = paintConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult6("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult6("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult6("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult6("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord8(line?.item) ? line.item : isRecord8(line) ? line : {};
    const descriptor = paintLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent6(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf4(rawItem);
    const qty = num9(line.qty ?? firstField8(rawItem, LINE_QTY_FIELDS5), 1) || 0;
    const base = {
      key: line.key || lineKey5(rawItem, position),
      label: line.label || asString7(firstField8(rawItem, LINE_LABEL_FIELDS5)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField8(partDescriptor, FORMULA_FIELDS6);
    for (const f of FORMULA_FIELDS6) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS6.reduce(
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
          tier: firstField8(partDescriptor, TIER_CONTEXT_FIELDS6) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord8(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString7(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString7(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString7(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField8(partDescriptor, TIER_CONTEXT_FIELDS6) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField6(partDescriptor, EMBEDDED_RULE_FIELDS6) ? EMBEDDED_RULE_FIELDS6.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField8(partDescriptor, MACHINE_FIELDS6) ?? null;
    const setupFee = firstFinite9(partDescriptor, SETUP_FIELDS6) ?? void 0;
    const minimumCharge = firstFinite9(partDescriptor, MIN_FIELDS6) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString7(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString7(firstField8(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString7(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord8(priced) ? priced : {};
    const lineSubtotal = firstFinite9(pricedRecord, ["subtotal"]) ?? num9(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num9(pricedRecord.unitPrice),
      extended: num9(pricedRecord.extended),
      setup_fee: num9(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num9(pricedRecord.total),
      price_source: asString7(pricedRecord.priceSource),
      tier_source: asString7(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString7(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult6("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round29(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round29(configuredBaseline)}) exceeds project sell \u2014 remainder ${round29(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round29(baselineSell)} - configured baseline ${round29(configuredBaseline)} = remainder ${round29(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round29(remainder)} + engine ${round29(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/paint/paintSellPricing.js
var ENGINE7 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolvePaintEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = paintPricingContextOf(record, caller);
    return resolvePaintSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE7, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function paintEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolvePaintEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/foundationPricingWire.ts
var isRecord9 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString8 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc8 = (v) => asString8(v).toLowerCase();
var toFiniteNumber8 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num10 = (v, fallback = 0) => toFiniteNumber8(v) ?? fallback;
var firstField9 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite10 = (rec, fields) => {
  const v = firstField9(rec, fields);
  const n = toFiniteNumber8(v);
  return n === null ? null : n;
};
var firstArray7 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord7 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord9(rec[f])) return rec[f];
  }
  return null;
};
var round210 = (n) => Math.round((num10(n) + Number.EPSILON) * 100) / 100;
var sumRows = (rows, field) => {
  if (!Array.isArray(rows)) return null;
  let hit = false;
  let total = 0;
  for (const r of rows) {
    const n = toFiniteNumber8(isRecord9(r) ? r[field] : null);
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
        (p) => isRecord9(p) && (p.paint === true || num10(p.pole_painting_cost) > 0)
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
        if (!isRecord9(c)) continue;
        hit = true;
        total += num10(c.quantity, 1);
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
      const cells = isRecord9(rec.landscape) && isRecord9(rec.landscape.cells) ? Object.keys(rec.landscape.cells).length : null;
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
    const costs = isRecord9(w) && isRecord9(w.calculatedCosts) ? w.calculatedCosts : null;
    if (!costs) continue;
    hit = true;
    materials += num10(costs.materialCost) + num10(costs.mortarCost) + num10(costs.internalMaterialCost) + num10(costs.internalMortarCost);
    labor += num10(costs.laborCost) + num10(costs.internalLaborCost);
    matQty += num10(costs.totalBricks) + num10(costs.internalTotalBricks);
    labQty += num10(costs.laborHours) + num10(costs.internalLaborHours);
  }
  return hit ? { materials, labor, matQty, labQty } : null;
};
var CONTEXT_BLOCK_FIELDS2 = [
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context",
  "engine_context"
];
var NESTED_CONTEXT_FIELDS2 = ["engine_context", "pricing_engine"];
var ENGINE_LINE_MAP_FIELDS7 = ["items", "lines", "line_config", "item_config"];
var COMPONENT_BLOCK_SUFFIXES2 = [
  "pricing",
  "price_config",
  "engine_pricing",
  "pricing_config",
  "engine_price",
  "tier_config",
  "sell_pricing"
];
var ENGINE_MODE_TOKENS8 = /* @__PURE__ */ new Set([
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
var FIXED_FIELDS7 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS8 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS8 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS9 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS7 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS7 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS7 = ["formula_modifiers", "modifiers"];
var MODE_FIELDS8 = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS7 = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS7 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS7 = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS7 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS7 = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS2 = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS3 = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS2 = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var DEFAULT_MARKUP_FIELDS3 = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var FOUNDATION_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS7,
  ...TIER_REF_FIELDS8,
  ...BREAK_FIELDS8,
  ...TEMPLATE_REF_FIELDS7,
  ...TIER_SET_FIELDS7,
  ...MARKET_FIELDS7,
  ...MARKET_DISCOUNT_FIELDS7,
  ...MARKUP_FIELDS9,
  ...MIN_FIELDS7,
  ...SETUP_FIELDS7,
  ...FORMULA_FIELDS7,
  ...MODE_FIELDS8,
  ...MACHINE_FIELDS7,
  ...TIER_CONTEXT_FIELDS7,
  ...EMBEDDED_RULE_FIELDS7,
  ...EMBEDDED_TEMPLATE_FIELDS7,
  ...EMBEDDED_TIER_CATALOG_FIELDS7,
  ...UNIT_FIELDS2,
  ...TAX_PCT_FIELDS3,
  ...INTERPOLATE_FIELDS2,
  "taxable"
]);
var isEngineModeToken7 = (v) => ENGINE_MODE_TOKENS8.has(lc8(v));
var nonEmptyArrayField7 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var machineHasConfig7 = (v) => {
  if (!isRecord9(v)) return false;
  const fixed = firstFinite10(v, FIXED_FIELDS7);
  const retail = firstFinite10(v, MARKET_FIELDS7);
  const markup = firstFinite10(v, MARKUP_FIELDS9);
  return fixed !== null && fixed > 0 || retail !== null && retail > 0 || markup !== null || firstFinite10(v, MIN_FIELDS7) !== null || nonEmptyArrayField7(v, [...BREAK_FIELDS8, ...FORMULA_FIELDS7]) || MODE_FIELDS8.some((f) => isEngineModeToken7(v[f])) || TIER_REF_FIELDS8.some((f) => asString8(v[f]) !== "");
};
function descriptorHasPricingContent7(d) {
  if (!isRecord9(d)) return false;
  const fixed = firstFinite10(d, FIXED_FIELDS7);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS8.some((f) => asString8(d[f]) !== "")) return true;
  if (nonEmptyArrayField7(d, BREAK_FIELDS8)) return true;
  const retail = firstFinite10(d, MARKET_FIELDS7);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite10(d, MARKET_DISCOUNT_FIELDS7);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS8.some((f) => isEngineModeToken7(d[f]))) return true;
  const markup = firstFinite10(d, MARKUP_FIELDS9);
  if (markup !== null) return true;
  if (nonEmptyArrayField7(d, FORMULA_FIELDS7)) return true;
  if (firstFinite10(d, MIN_FIELDS7) !== null) return true;
  if (firstFinite10(d, SETUP_FIELDS7) !== null) return true;
  if (TEMPLATE_REF_FIELDS7.some((f) => {
    const v = d[f];
    return isRecord9(v) ? true : asString8(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS7.some((f) => asString8(d[f]) !== "")) return true;
  if (nonEmptyArrayField7(d, [...EMBEDDED_RULE_FIELDS7, ...EMBEDDED_TEMPLATE_FIELDS7, ...EMBEDDED_TIER_CATALOG_FIELDS7])) return true;
  if (TIER_CONTEXT_FIELDS7.some((f) => asString8(firstField9(d, [f])) !== "")) return true;
  if (MACHINE_FIELDS7.some((f) => machineHasConfig7(d[f]))) return true;
  return false;
}
var componentOf2 = (key) => {
  const k = lc8(key);
  return FOUNDATION_COMPONENTS.find((c) => c.key === k) ?? null;
};
var carrierKeys = (spec) => [
  ...spec.aliases ?? [],
  spec.key
];
function foundationCostLines(record) {
  if (!isRecord9(record)) return [];
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
    const cost = firstFinite10(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite10(record, comp.qtyFields ?? []) ?? comp.qtyFrom?.(record) ?? 1;
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
var contextBlockOf2 = (record) => {
  const rec = isRecord9(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS2) {
    if (isRecord9(rec[f])) return { block: rec[f], field: f };
  }
  const cp = isRecord9(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS2) {
      if (isRecord9(cp[f])) return { block: cp[f], field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: "" };
};
function foundationPricingContextOf(record, callerContext = null) {
  const rec = isRecord9(record) ? record : {};
  const caller = isRecord9(callerContext) ? callerContext : {};
  if (callerContext?.__foundationPricingContext === true) {
    return callerContext;
  }
  const { block, field } = contextBlockOf2(rec);
  const blk = block ?? {};
  const cp = isRecord9(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField9(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField9(blk, [...TIER_CONTEXT_FIELDS7, "tier"]) ?? firstField9(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray7(caller, EMBEDDED_RULE_FIELDS7) ?? firstArray7(blk, EMBEDDED_RULE_FIELDS7) ?? [];
  const templates = firstArray7(caller, EMBEDDED_TEMPLATE_FIELDS7) ?? firstArray7(blk, EMBEDDED_TEMPLATE_FIELDS7) ?? [];
  const tiers = firstArray7(caller, EMBEDDED_TIER_CATALOG_FIELDS7) ?? firstArray7(blk, EMBEDDED_TIER_CATALOG_FIELDS7) ?? [];
  const defaultMarkupPct = firstFinite10(caller, DEFAULT_MARKUP_FIELDS3.concat("markup_pct")) ?? firstFinite10(blk, DEFAULT_MARKUP_FIELDS3.concat(MARKUP_FIELDS9)) ?? firstFinite10(rec, ["customer_markup_percent"]) ?? 0;
  const taxable = typeof caller.taxable === "boolean" ? caller.taxable : typeof blk.taxable === "boolean" ? blk.taxable : lc8(blk.taxable) === "true" ? true : lc8(blk.taxable) === "false" ? false : void 0;
  const callerModifiers = firstArray7(caller, FORMULA_FIELDS7);
  const blockModifiers = firstArray7(blk, FORMULA_FIELDS7);
  return {
    __foundationPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num10(defaultMarkupPct),
    machine: firstField9(blk, MACHINE_FIELDS7) ?? firstField9(caller, MACHINE_FIELDS7) ?? null,
    taxable,
    taxPercent: num10(firstFinite10(caller, TAX_PCT_FIELDS3) ?? firstFinite10(blk, TAX_PCT_FIELDS3)),
    setupFee: num10(firstFinite10(caller, SETUP_FIELDS7) ?? firstFinite10(blk, SETUP_FIELDS7)),
    minimumCharge: num10(firstFinite10(caller, MIN_FIELDS7) ?? firstFinite10(blk, MIN_FIELDS7)),
    modifiers: callerModifiers ?? blockModifiers ?? void 0,
    lineMap: firstRecord7(blk, ENGINE_LINE_MAP_FIELDS7),
    now: caller.now ?? blk.now,
    raw: block
  };
}
var componentNestedBlock2 = (record, spec) => {
  const rec = isRecord9(record) ? record : {};
  let merged = null;
  for (const carrier of carrierKeys(spec)) {
    for (const suffix of COMPONENT_BLOCK_SUFFIXES2) {
      const f = `${carrier}_${suffix}`;
      if (isRecord9(rec[f])) merged = { ...merged ?? {}, ...rec[f] };
    }
  }
  return merged;
};
var engineFieldsFrom2 = (src, prefix = "") => {
  const out = {};
  if (!isRecord9(src)) return out;
  for (const f of FOUNDATION_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== void 0 && src[k] !== null && src[k] !== "") out[f] = src[k];
  }
  return out;
};
function foundationLineDescriptor(line, record = null) {
  const spec = componentOf2(line?.key);
  if (!spec) return null;
  const rec = isRecord9(record) ? record : {};
  const carriers = carrierKeys(spec);
  const flat = carriers.reduce(
    (acc, carrier) => ({ ...acc, ...engineFieldsFrom2(rec, carrier) }),
    {}
  );
  const rawLine = isRecord9(line) ? line : {};
  const ownInline = engineFieldsFrom2(rawLine);
  const ownNested = firstRecord7(rawLine, ["descriptor", "pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"]);
  const { block } = contextBlockOf2(rec);
  const lineMap = block ? firstRecord7(block, ENGINE_LINE_MAP_FIELDS7) : null;
  const mapEntry = lineMap ? carriers.reduce((acc, carrier) => {
    const v = lineMap[carrier];
    return isRecord9(v) ? { ...acc ?? {}, ...v } : acc;
  }, null) ?? (isRecord9(lineMap[asString8(line?.index)]) ? lineMap[asString8(line?.index)] : null) : null;
  const nested = componentNestedBlock2(rec, spec);
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
      configured: descriptorHasPricingContent7(descriptor),
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
var passthroughResult7 = (reason, baselineSell, internalCost, markupPct, contextEngaged, lines, chain, warnings, contextUsed) => ({
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
  const record = isRecord9(input.record) ? input.record : null;
  const baselineSell = num10(input.baselineSell ?? input.baseline_sell);
  const internalCost = num10(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const markupPct = firstFinite10(input, ["markupPercent", "markup_percent"]) ?? firstFinite10(rec, ["customer_markup_percent"]) ?? 0;
  const context = foundationPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || "",
    customer_tier: asString8(
      isRecord9(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num10(context.defaultMarkupPct)
  };
  const engine = isRecord9(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines.map((l, position) => {
    const spec = componentOf2(l?.key);
    return {
      key: asString8(l?.key) || `line-${position}`,
      index: position,
      label: asString8(l?.label) || spec?.label || `Component ${position + 1}`,
      qty: l?.qty !== void 0 ? num10(l.qty, 1) : spec ? firstFinite10(rec, spec.qtyFields ?? []) ?? spec.qtyFrom?.(rec) ?? 1 : 1,
      cost: l?.cost !== void 0 ? toFiniteNumber8(l.cost) : spec && spec.costFields.length ? firstFinite10(rec, spec.costFields) : toFiniteNumber8(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost),
      category_key: asString8(l?.category_key) || spec?.category_key || "",
      item: isRecord9(l?.item) ? l.item : rec,
      descriptor: isRecord9(l) ? l : null,
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
  if (!record) return passthroughResult7("no_record", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult7("no_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult7("no_config", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult7("no_engine", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const descriptor = foundationLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent7(descriptor);
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== void 0 ? line.cost : null;
    const qty = num10(line.qty, 1);
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
    const lineModifiers = firstField9(partDescriptor, FORMULA_FIELDS7);
    for (const f of FORMULA_FIELDS7) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS7.reduce(
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
          tier: firstField9(partDescriptor, TIER_CONTEXT_FIELDS7) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord9(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString8(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `component '${base.label}': ${asString8(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`component '${base.label}': template resolution failed (${asString8(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField9(partDescriptor, TIER_CONTEXT_FIELDS7) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField7(partDescriptor, EMBEDDED_RULE_FIELDS7) ? EMBEDDED_RULE_FIELDS7.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField9(partDescriptor, MACHINE_FIELDS7) ?? context.machine;
    const setupFee = firstFinite10(partDescriptor, SETUP_FIELDS7) ?? (context.setupFee || void 0);
    const minimumCharge = firstFinite10(partDescriptor, MIN_FIELDS7) ?? (context.minimumCharge || void 0);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === "boolean" ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite10(partDescriptor, TAX_PCT_FIELDS3) ?? (context.taxPercent || void 0);
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString8(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString8(firstField9(partDescriptor, UNIT_FIELDS2)) || "each",
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
      warnings.push(`component '${base.label}': engine pricing failed (${asString8(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord9(priced) ? priced : {};
    const lineSubtotal = firstFinite10(pricedRecord, ["subtotal"]) ?? num10(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? "descriptor" : "context";
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num10(pricedRecord.unitPrice),
      extended: num10(pricedRecord.extended),
      setup_fee: num10(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num10(pricedRecord.total),
      price_source: asString8(pricedRecord.priceSource),
      tier_source: asString8(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString8(pricedRecord.danglingTierRef) || null,
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
    return passthroughResult7("no_priced_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round210(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round210(configuredBaseline)}) exceeds project sell \u2014 remainder ${round210(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round210(baselineSell)} - priced baseline ${round210(configuredBaseline)} = remainder ${round210(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round210(remainder)} + engine ${round210(engineTotal)} = ${customerPrice}`
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

// src/components/estimator/foundation/foundationSellPricing.js
var ENGINE8 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = foundationPricingContextOf(record, caller);
    return resolveFoundationSellPricing({ record, baselineSell, internalCost, markupPercent, context, engine: ENGINE8, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function foundationEngineEconomics(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  const res = resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/customItemsPricingWire.ts
var isRecord10 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString9 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc9 = (v) => asString9(v).toLowerCase();
var toFiniteNumber9 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num11 = (v, fallback = 0) => toFiniteNumber9(v) ?? fallback;
var firstField10 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite11 = (rec, fields) => {
  const v = firstField10(rec, fields);
  const n = toFiniteNumber9(v);
  return n === null ? null : n;
};
var firstArray8 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord8 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord10(rec[f])) return rec[f];
  }
  return null;
};
var round211 = (n) => Math.round((num11(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS6 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS6 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS6 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS6 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS6 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS6 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS6 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS8 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS9 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS8 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS9 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS9 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS10 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS8 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS8 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS8 = ["formula_modifiers"];
var MODE_FIELDS9 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS8 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS8 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS8 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS8 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS8 = ["tiers", "tier_catalog"];
var CUSTOM_ITEMS_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS8,
  ...TIER_REF_FIELDS9,
  ...BREAK_FIELDS9,
  ...TEMPLATE_REF_FIELDS8,
  ...TIER_SET_FIELDS8,
  ...MARKET_FIELDS8,
  ...MARKET_DISCOUNT_FIELDS8,
  ...MARKUP_FIELDS10,
  ...MIN_FIELDS8,
  ...SETUP_FIELDS8,
  ...FORMULA_FIELDS8,
  ...MODE_FIELDS9,
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
var isEngineModeToken8 = (v) => ENGINE_MODE_TOKENS9.has(lc9(v));
var nonEmptyArrayField8 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField6 = (rec, fields) => fields.some((f) => firstFinite11(rec, [f]) !== null);
var anyPositiveField6 = (rec, fields) => fields.some((f) => {
  const v = firstFinite11(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig8 = (v) => {
  if (!isRecord10(v)) return false;
  return anyPositiveField6(v, [...FIXED_FIELDS8, ...MARKET_FIELDS8, ...MIN_FIELDS8]) || anyFiniteField6(v, MARKUP_FIELDS10) || nonEmptyArrayField8(v, [...BREAK_FIELDS9, ...FORMULA_FIELDS8]) || MODE_FIELDS9.some((f) => isEngineModeToken8(v[f])) || TIER_REF_FIELDS9.some((f) => asString9(v[f]) !== "");
};
function descriptorHasPricingContent8(d) {
  if (!isRecord10(d)) return false;
  if (anyPositiveField6(d, [...FIXED_FIELDS8, ...MARKET_FIELDS8, ...MARKET_DISCOUNT_FIELDS8, ...MIN_FIELDS8, ...SETUP_FIELDS8]) || anyFiniteField6(d, MARKUP_FIELDS10)) return true;
  if (nonEmptyArrayField8(d, [...BREAK_FIELDS9, ...FORMULA_FIELDS8, ...EMBEDDED_RULE_FIELDS8, ...EMBEDDED_TEMPLATE_FIELDS8, ...EMBEDDED_TIER_CATALOG_FIELDS8])) return true;
  if (MODE_FIELDS9.some((f) => isEngineModeToken8(d[f]))) return true;
  if (TIER_REF_FIELDS9.some((f) => asString9(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS8.some((f) => {
    const v = d[f];
    return isRecord10(v) ? true : asString9(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS8.some((f) => asString9(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS8.some((f) => firstField10(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS8.some((f) => machineHasConfig8(d[f]))) return true;
  return false;
}
var lineKey6 = (item, index) => {
  const explicit = firstField10(item, LINE_KEY_FIELDS6);
  if (explicit !== void 0 && asString9(explicit) !== "") return asString9(explicit);
  return `idx-${index}`;
};
var lineCostOf5 = (item) => {
  const direct = firstFinite11(item, LINE_COST_FIELDS6);
  if (direct !== null) return direct;
  const machine = toFiniteNumber9(item.machine_cost);
  const labor = toFiniteNumber9(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num11(machine) + num11(labor);
};
function customItemsRecordLines(record) {
  if (!isRecord10(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord10) : [];
  return flat.map((item, index) => ({
    key: lineKey6(item, index),
    index,
    label: asString9(firstField10(item, LINE_LABEL_FIELDS6)) || `Item ${index + 1}`,
    qty: num11(firstField10(item, LINE_QTY_FIELDS6), 1),
    cost: lineCostOf5(item),
    category_key: asString9(firstField10(item, LINE_CATEGORY_FIELDS6)),
    item,
    origin: "items"
  }));
}
var engineBlockOf6 = (record) => firstRecord8(record, ENGINE_BLOCK_FIELDS6) ?? {};
function customItemsPricingContextOf(record, callerContext = null) {
  const rec = isRecord10(record) ? record : {};
  const block = engineBlockOf6(rec);
  const caller = isRecord10(callerContext) ? callerContext : {};
  const cp = isRecord10(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField10(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField10(block, TIER_CONTEXT_FIELDS8.concat("tier")) ?? firstField10(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray8(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray8(block, EMBEDDED_RULE_FIELDS8) ?? [];
  const templates = firstArray8(caller, ["templates", "pricing_templates"]) ?? firstArray8(block, EMBEDDED_TEMPLATE_FIELDS8) ?? [];
  const tiers = firstArray8(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray8(block, EMBEDDED_TIER_CATALOG_FIELDS8.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite11(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite11(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite11(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function customItemsLineDescriptor(line, record = null) {
  const item = isRecord10(line?.item) ? line.item : isRecord10(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of CUSTOM_ITEMS_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf6(record);
  const lineMap = firstRecord8(block, ENGINE_LINE_MAP_FIELDS8);
  const mapEntry = lineMap ? isRecord10(lineMap[line?.key]) ? lineMap[line.key] : isRecord10(lineMap[asString9(line?.index)]) ? lineMap[asString9(line?.index)] : null : null;
  const nested = firstRecord8(item, NESTED_CONFIG_FIELDS6);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function customItemsConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : customItemsRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = customItemsLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent8(descriptor),
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
var passthroughResult8 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveCustomItemsSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord10(input.record) ? input.record : null;
  const baselineSell = num11(input.baselineSell ?? input.baseline_sell);
  const internalCost = num11(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite11(rec, ["subtotal"]);
  const markupPct = firstFinite11(input, ["markupPercent", "markup_percent"]) ?? firstFinite11(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num11(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = customItemsPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString9(
      isRecord10(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num11(context.defaultMarkupPct)
  };
  const engine = isRecord10(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : customItemsRecordLines(rec);
  const scan = customItemsConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult8("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult8("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult8("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult8("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord10(line?.item) ? line.item : isRecord10(line) ? line : {};
    const descriptor = customItemsLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent8(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf5(rawItem);
    const qty = num11(line.qty ?? firstField10(rawItem, LINE_QTY_FIELDS6), 1) || 0;
    const base = {
      key: line.key || lineKey6(rawItem, position),
      label: line.label || asString9(firstField10(rawItem, LINE_LABEL_FIELDS6)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField10(partDescriptor, FORMULA_FIELDS8);
    for (const f of FORMULA_FIELDS8) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS8.reduce(
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
          tier: firstField10(partDescriptor, TIER_CONTEXT_FIELDS8) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord10(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString9(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString9(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString9(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField10(partDescriptor, TIER_CONTEXT_FIELDS8) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField8(partDescriptor, EMBEDDED_RULE_FIELDS8) ? EMBEDDED_RULE_FIELDS8.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField10(partDescriptor, MACHINE_FIELDS8) ?? null;
    const setupFee = firstFinite11(partDescriptor, SETUP_FIELDS8) ?? void 0;
    const minimumCharge = firstFinite11(partDescriptor, MIN_FIELDS8) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString9(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString9(firstField10(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString9(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord10(priced) ? priced : {};
    const lineSubtotal = firstFinite11(pricedRecord, ["subtotal"]) ?? num11(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num11(pricedRecord.unitPrice),
      extended: num11(pricedRecord.extended),
      setup_fee: num11(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num11(pricedRecord.total),
      price_source: asString9(pricedRecord.priceSource),
      tier_source: asString9(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString9(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult8("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round211(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round211(configuredBaseline)}) exceeds project sell \u2014 remainder ${round211(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round211(baselineSell)} - configured baseline ${round211(configuredBaseline)} = remainder ${round211(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round211(remainder)} + engine ${round211(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/customItems/customItemsSellPricing.js
var ENGINE9 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = customItemsPricingContextOf(record, caller);
    return resolveCustomItemsSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE9, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function customItemsEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/maintenancePricingWire.ts
var isRecord11 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString10 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc10 = (v) => asString10(v).toLowerCase();
var toFiniteNumber10 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num12 = (v, fallback = 0) => toFiniteNumber10(v) ?? fallback;
var firstField11 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite12 = (rec, fields) => {
  const v = firstField11(rec, fields);
  const n = toFiniteNumber10(v);
  return n === null ? null : n;
};
var firstArray9 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord9 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord11(rec[f])) return rec[f];
  }
  return null;
};
var round212 = (n) => Math.round((num12(n) + Number.EPSILON) * 100) / 100;
var MAINTENANCE_MODULE_KEYS = Object.freeze([
  "maintenance",
  "sign_maintenance",
  "maintenance_project",
  "sign_maintenance_project",
  "service",
  "maintenance_service"
]);
var LINE_COST_FIELDS7 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_COMPONENT_FIELDS3 = ["labor_cost", "materials_cost"];
var LINE_QTY_FIELDS7 = ["qty", "quantity", "count"];
var LINE_LABEL_FIELDS7 = ["description", "label", "name", "item_name", "part_name", "service_name"];
var LINE_KEY_FIELDS7 = ["builder_item_id", "id", "item_id", "service_item_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS7 = ["category_key", "category", "part_category", "pricing_category", "service_category", "sign_type"];
var ENGINE_BLOCK_FIELDS7 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS7 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS9 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS10 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS9 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS10 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS10 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
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
var MARKUP_FIELDS11 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS9 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS9 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS9 = ["formula_modifiers"];
var MODE_FIELDS10 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS9 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS9 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS9 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS9 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS9 = ["tiers", "tier_catalog"];
var MAINTENANCE_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS9,
  ...TIER_REF_FIELDS10,
  ...BREAK_FIELDS10,
  ...TEMPLATE_REF_FIELDS9,
  ...TIER_SET_FIELDS9,
  ...MARKET_FIELDS9,
  ...MARKET_DISCOUNT_FIELDS9,
  ...MARKUP_FIELDS11,
  ...MIN_FIELDS9,
  ...SETUP_FIELDS9,
  ...FORMULA_FIELDS9,
  ...MODE_FIELDS10,
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
var isEngineModeToken9 = (v) => ENGINE_MODE_TOKENS10.has(lc10(v));
var nonEmptyArrayField9 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField7 = (rec, fields) => fields.some((f) => firstFinite12(rec, [f]) !== null);
var anyPositiveField7 = (rec, fields) => fields.some((f) => {
  const v = firstFinite12(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig9 = (v) => {
  if (!isRecord11(v)) return false;
  return anyPositiveField7(v, [...FIXED_FIELDS9, ...MARKET_FIELDS9, ...MIN_FIELDS9]) || anyFiniteField7(v, MARKUP_FIELDS11) || nonEmptyArrayField9(v, [...BREAK_FIELDS10, ...FORMULA_FIELDS9]) || MODE_FIELDS10.some((f) => isEngineModeToken9(v[f])) || TIER_REF_FIELDS10.some((f) => asString10(v[f]) !== "");
};
function descriptorHasPricingContent9(d) {
  if (!isRecord11(d)) return false;
  if (anyPositiveField7(d, [...FIXED_FIELDS9, ...MARKET_FIELDS9, ...MARKET_DISCOUNT_FIELDS9, ...MIN_FIELDS9, ...SETUP_FIELDS9]) || anyFiniteField7(d, MARKUP_FIELDS11)) return true;
  if (nonEmptyArrayField9(d, [...BREAK_FIELDS10, ...FORMULA_FIELDS9, ...EMBEDDED_RULE_FIELDS9, ...EMBEDDED_TEMPLATE_FIELDS9, ...EMBEDDED_TIER_CATALOG_FIELDS9])) return true;
  if (MODE_FIELDS10.some((f) => isEngineModeToken9(d[f]))) return true;
  if (TIER_REF_FIELDS10.some((f) => asString10(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS9.some((f) => {
    const v = d[f];
    return isRecord11(v) ? true : asString10(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS9.some((f) => asString10(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS9.some((f) => firstField11(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS9.some((f) => machineHasConfig9(d[f]))) return true;
  return false;
}
var lineKey7 = (item, index) => {
  const explicit = firstField11(item, LINE_KEY_FIELDS7);
  if (explicit !== void 0 && asString10(explicit) !== "") return asString10(explicit);
  return `idx-${index}`;
};
var lineCostOf6 = (item) => {
  const direct = firstFinite12(item, LINE_COST_FIELDS7);
  if (direct !== null) return direct;
  const hasComponent = LINE_COMPONENT_FIELDS3.some((f) => toFiniteNumber10(item[f]) !== null);
  if (!hasComponent) return null;
  return LINE_COMPONENT_FIELDS3.reduce((s, f) => s + num12(item[f]), 0);
};
function maintenanceRecordLines(record) {
  if (!isRecord11(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord11) : [];
  return flat.map((item, index) => ({
    key: lineKey7(item, index),
    index,
    label: asString10(firstField11(item, LINE_LABEL_FIELDS7)) || asString10(item.sign_type) || `Item ${index + 1}`,
    qty: num12(firstField11(item, LINE_QTY_FIELDS7), 1),
    cost: lineCostOf6(item),
    category_key: asString10(firstField11(item, LINE_CATEGORY_FIELDS7)),
    item,
    origin: "items"
  }));
}
var engineBlockOf7 = (record) => firstRecord9(record, ENGINE_BLOCK_FIELDS7) ?? {};
function maintenancePricingContextOf(record, callerContext = null) {
  const rec = isRecord11(record) ? record : {};
  const block = engineBlockOf7(rec);
  const caller = isRecord11(callerContext) ? callerContext : {};
  const cp = isRecord11(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField11(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField11(block, TIER_CONTEXT_FIELDS9.concat("tier")) ?? firstField11(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray9(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray9(block, EMBEDDED_RULE_FIELDS9) ?? [];
  const templates = firstArray9(caller, ["templates", "pricing_templates"]) ?? firstArray9(block, EMBEDDED_TEMPLATE_FIELDS9) ?? [];
  const tiers = firstArray9(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray9(block, EMBEDDED_TIER_CATALOG_FIELDS9.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite12(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite12(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite12(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function maintenanceLineDescriptor(line, record = null) {
  const item = isRecord11(line?.item) ? line.item : isRecord11(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of MAINTENANCE_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf7(record);
  const lineMap = firstRecord9(block, ENGINE_LINE_MAP_FIELDS9);
  const mapEntry = lineMap ? isRecord11(lineMap[line?.key]) ? lineMap[line.key] : isRecord11(lineMap[asString10(line?.index)]) ? lineMap[asString10(line?.index)] : null : null;
  const nested = firstRecord9(item, NESTED_CONFIG_FIELDS7);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function maintenanceConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : maintenanceRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = maintenanceLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent9(descriptor),
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
var passthroughResult9 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveMaintenanceSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord11(input.record) ? input.record : null;
  const baselineSell = num12(input.baselineSell ?? input.baseline_sell);
  const internalCost = num12(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite12(rec, ["subtotal"]);
  const markupPct = firstFinite12(input, ["markupPercent", "markup_percent"]) ?? firstFinite12(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num12(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = maintenancePricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString10(
      isRecord11(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num12(context.defaultMarkupPct)
  };
  const engine = isRecord11(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : maintenanceRecordLines(rec);
  const scan = maintenanceConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult9("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult9("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult9("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult9("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord11(line?.item) ? line.item : isRecord11(line) ? line : {};
    const descriptor = maintenanceLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent9(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf6(rawItem);
    const qty = num12(line.qty ?? firstField11(rawItem, LINE_QTY_FIELDS7), 1) || 0;
    const base = {
      key: line.key || lineKey7(rawItem, position),
      label: line.label || asString10(firstField11(rawItem, LINE_LABEL_FIELDS7)) || asString10(rawItem.sign_type) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField11(partDescriptor, FORMULA_FIELDS9);
    for (const f of FORMULA_FIELDS9) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS9.reduce(
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
          tier: firstField11(partDescriptor, TIER_CONTEXT_FIELDS9) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord11(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString10(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString10(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString10(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField11(partDescriptor, TIER_CONTEXT_FIELDS9) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField9(partDescriptor, EMBEDDED_RULE_FIELDS9) ? EMBEDDED_RULE_FIELDS9.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField11(partDescriptor, MACHINE_FIELDS9) ?? null;
    const setupFee = firstFinite12(partDescriptor, SETUP_FIELDS9) ?? void 0;
    const minimumCharge = firstFinite12(partDescriptor, MIN_FIELDS9) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString10(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString10(firstField11(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString10(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord11(priced) ? priced : {};
    const lineSubtotal = firstFinite12(pricedRecord, ["subtotal"]) ?? num12(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num12(pricedRecord.unitPrice),
      extended: num12(pricedRecord.extended),
      setup_fee: num12(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num12(pricedRecord.total),
      price_source: asString10(pricedRecord.priceSource),
      tier_source: asString10(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString10(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult9("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round212(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round212(configuredBaseline)}) exceeds project sell \u2014 remainder ${round212(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round212(baselineSell)} - configured baseline ${round212(configuredBaseline)} = remainder ${round212(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round212(remainder)} + engine ${round212(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/maintenance/maintenanceSellPricing.js
var ENGINE10 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveMaintenanceEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = maintenancePricingContextOf(record, caller);
    return resolveMaintenanceSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE10, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function maintenanceEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveMaintenanceEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// src/components/estimator/customerPricing.js
var num13 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num13(line?.total_snapshot);
}
function liveCustomerUnitPrice(line) {
  if (hasNumericValue(line?.live_customer_price_snapshot)) return Number(line.live_customer_price_snapshot);
  if (hasNumericValue(line?.customer_price_snapshot)) return Number(line.customer_price_snapshot);
  return num13(line?.live_total_snapshot, num13(line?.total_snapshot));
}
function acceptedInternalEstimateCost(lineItems = []) {
  return (lineItems || []).reduce((sum, line) => {
    const quantity = Math.max(0, num13(line?.customer_quantity, 1));
    return sum + num13(line?.total_snapshot) * quantity;
  }, 0);
}
function manualCustomerPriceState({ detached = false, recalcRequired = false } = {}) {
  if (detached) return "detached_parts";
  if (recalcRequired) return "changed";
  return "manual";
}
function sourceProjectEconomics(moduleKey, record, fallbackTotal = 0, pricingContext = null) {
  const fallback = num13(fallbackTotal);
  if (!record) return { internalCost: fallback, customerPrice: fallback };
  const total = num13(record.total_cost, fallback);
  const savedTierCustomerPrice = record?.customer_pricing?.applied === true && hasNumericValue(record?.customer_pricing?.total) ? num13(record.customer_pricing.total) : null;
  const withSavedTier = (economics) => savedTierCustomerPrice === null ? economics : { ...economics, customerPrice: savedTierCustomerPrice };
  if (moduleKey === "foundation") {
    const cost = fallback;
    const markupPercent = num13(record.customer_markup_percent);
    const override = num13(record.customer_price_override);
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
    const internalCost = hasNumericValue(record.subtotal) ? num13(record.subtotal) : total - num13(record.markup_amount);
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
    const letterMarkup = num13(record.total_letters_cost) - num13(record.letters_subtotal);
    const projectSubtotal = hasNumericValue(record.subtotal) ? num13(record.subtotal) : total - num13(record.markup_amount);
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
    const internalCost = hasNumericValue(record.subtotal) ? num13(record.subtotal) : total - num13(record.markup_amount);
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
export {
  acceptedCustomerUnitPrice,
  acceptedInternalEstimateCost,
  hasNumericValue,
  liveCustomerUnitPrice,
  manualCustomerPriceState,
  sourceProjectEconomics
};
