// base44/shared/brickPricingWire.ts
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc = (v) => asString(v).toLowerCase();
var toFiniteNumber = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num = (v, fallback = 0) => toFiniteNumber(v) ?? fallback;
var firstField = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite = (rec, fields) => {
  const v = firstField(rec, fields);
  const n = toFiniteNumber(v);
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
    if (isRecord(rec[f])) return rec[f];
  }
  return null;
};
var round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
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
var MARKUP_FIELDS = ["markup_pct", "markup", "markup_percent"];
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
var BRICK_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS,
  ...TIER_REF_FIELDS,
  ...BREAK_FIELDS,
  ...TEMPLATE_REF_FIELDS,
  ...TIER_SET_FIELDS,
  ...MARKET_FIELDS,
  ...MARKET_DISCOUNT_FIELDS,
  ...MARKUP_FIELDS,
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
var isEngineModeToken = (v) => ENGINE_MODE_TOKENS.has(lc(v));
var nonEmptyArrayField = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var machineHasConfig = (v) => {
  if (!isRecord(v)) return false;
  const fixed = firstFinite(v, FIXED_FIELDS);
  const retail = firstFinite(v, MARKET_FIELDS);
  const markup = firstFinite(v, MARKUP_FIELDS);
  return fixed !== null && fixed > 0 || retail !== null && retail > 0 || markup !== null || firstFinite(v, MIN_FIELDS) !== null || nonEmptyArrayField(v, [...BREAK_FIELDS, ...FORMULA_FIELDS]) || MODE_FIELDS.some((f) => isEngineModeToken(v[f])) || TIER_REF_FIELDS.some((f) => asString(v[f]) !== "");
};
function descriptorHasPricingContent(d) {
  if (!isRecord(d)) return false;
  const fixed = firstFinite(d, FIXED_FIELDS);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS.some((f) => asString(d[f]) !== "")) return true;
  if (nonEmptyArrayField(d, BREAK_FIELDS)) return true;
  const retail = firstFinite(d, MARKET_FIELDS);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite(d, MARKET_DISCOUNT_FIELDS);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS.some((f) => isEngineModeToken(d[f]))) return true;
  const markup = firstFinite(d, MARKUP_FIELDS);
  if (markup !== null) return true;
  if (nonEmptyArrayField(d, FORMULA_FIELDS)) return true;
  if (firstFinite(d, MIN_FIELDS) !== null) return true;
  if (firstFinite(d, SETUP_FIELDS) !== null) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord(v) ? true : asString(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString(d[f]) !== "")) return true;
  if (nonEmptyArrayField(d, [...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => asString(firstField(d, [f])) !== "")) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}
var componentOf = (key) => BRICK_COMPONENTS.find((c) => c.key === lc(key)) ?? null;
function brickCostLines(record) {
  if (!isRecord(record)) return [];
  const lines = [];
  BRICK_COMPONENTS.forEach((comp) => {
    const cost = firstFinite(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite(record, comp.qtyFields) ?? 1;
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
  const rec = isRecord(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS) {
    if (isRecord(rec[f])) return { block: rec[f], field: f };
  }
  const cp = isRecord(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS) {
      if (isRecord(cp[f])) return { block: cp[f], field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: "" };
};
function brickPricingContextOf(record, callerContext = null) {
  const rec = isRecord(record) ? record : {};
  const caller = isRecord(callerContext) ? callerContext : {};
  if (callerContext?.__brickPricingContext === true) {
    return callerContext;
  }
  const { block, field } = contextBlockOf(rec);
  const blk = block ?? {};
  const cp = isRecord(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField(blk, [...TIER_CONTEXT_FIELDS, "tier"]) ?? firstField(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray(caller, EMBEDDED_RULE_FIELDS) ?? firstArray(blk, EMBEDDED_RULE_FIELDS) ?? [];
  const templates = firstArray(caller, EMBEDDED_TEMPLATE_FIELDS) ?? firstArray(blk, EMBEDDED_TEMPLATE_FIELDS) ?? [];
  const tiers = firstArray(caller, EMBEDDED_TIER_CATALOG_FIELDS) ?? firstArray(blk, EMBEDDED_TIER_CATALOG_FIELDS) ?? [];
  const defaultMarkupPct = firstFinite(caller, DEFAULT_MARKUP_FIELDS.concat("markup_pct")) ?? firstFinite(blk, DEFAULT_MARKUP_FIELDS.concat(MARKUP_FIELDS)) ?? firstFinite(rec, ["markup_percent"]) ?? 0;
  const taxable = typeof caller.taxable === "boolean" ? caller.taxable : typeof blk.taxable === "boolean" ? blk.taxable : lc(blk.taxable) === "true" ? true : lc(blk.taxable) === "false" ? false : void 0;
  const callerModifiers = firstArray(caller, FORMULA_FIELDS);
  const blockModifiers = firstArray(blk, FORMULA_FIELDS);
  return {
    __brickPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num(defaultMarkupPct),
    machine: firstField(blk, MACHINE_FIELDS) ?? firstField(caller, MACHINE_FIELDS) ?? null,
    taxable,
    taxPercent: num(firstFinite(caller, TAX_PCT_FIELDS) ?? firstFinite(blk, TAX_PCT_FIELDS)),
    setupFee: num(firstFinite(caller, SETUP_FIELDS) ?? firstFinite(blk, SETUP_FIELDS)),
    minimumCharge: num(firstFinite(caller, MIN_FIELDS) ?? firstFinite(blk, MIN_FIELDS)),
    modifiers: callerModifiers ?? blockModifiers ?? void 0,
    lineMap: firstRecord(blk, ENGINE_LINE_MAP_FIELDS),
    now: caller.now ?? blk.now,
    raw: block
  };
}
var componentNestedBlock = (record, key) => {
  const rec = isRecord(record) ? record : {};
  for (const suffix of COMPONENT_BLOCK_SUFFIXES) {
    const f = `${key}_${suffix}`;
    if (isRecord(rec[f])) return rec[f];
  }
  return null;
};
var engineFieldsFrom = (src, prefix = "") => {
  const out = {};
  if (!isRecord(src)) return out;
  for (const f of BRICK_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== void 0 && src[k] !== null && src[k] !== "") out[f] = src[k];
  }
  return out;
};
function brickLineDescriptor(line, record = null) {
  const key = lc(line?.key);
  if (!componentOf(key)) return null;
  const rec = isRecord(record) ? record : {};
  const flat = engineFieldsFrom(rec, key);
  const rawLine = isRecord(line) ? line : {};
  const ownInline = engineFieldsFrom(rawLine);
  const ownNested = firstRecord(rawLine, ["descriptor", "pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"]);
  const { block } = contextBlockOf(rec);
  const lineMap = block ? firstRecord(block, ENGINE_LINE_MAP_FIELDS) : null;
  const mapEntry = lineMap ? isRecord(lineMap[key]) ? lineMap[key] : isRecord(lineMap[asString(line?.index)]) ? lineMap[asString(line?.index)] : null : null;
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
function brickEngineConfigured(record, lines) {
  if (contextBlockOf(record).block) return true;
  return brickConfigScan(record, lines).configured;
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
function resolveBrickSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord(input.record) ? input.record : null;
  const baselineSell = num(input.baselineSell ?? input.baseline_sell);
  const internalCost = num(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite(rec, ["subtotal"]);
  const markupPct = firstFinite(input, ["markupPercent", "markup_percent"]) ?? firstFinite(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = brickPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || "",
    customer_tier: asString(
      isRecord(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num(context.defaultMarkupPct)
  };
  const engine = isRecord(input.engine) ? input.engine : {};
  const pricePart = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines.map((l, position) => ({
    key: asString(l?.key) || `line-${position}`,
    index: position,
    label: asString(l?.label) || componentOf(l?.key)?.label || `Component ${position + 1}`,
    qty: l?.qty !== void 0 ? num(l.qty, 1) : componentOf(l?.key) ? firstFinite(rec, componentOf(l?.key).qtyFields) ?? 1 : 1,
    cost: l?.cost !== void 0 ? toFiniteNumber(l.cost) : componentOf(l?.key) ? firstFinite(rec, componentOf(l?.key).costFields) : toFiniteNumber(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost),
    category_key: asString(l?.category_key) || componentOf(l?.key)?.category_key || "",
    item: isRecord(l?.item) ? l.item : rec,
    descriptor: isRecord(l) ? l : null,
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
  if (!record) return passthroughResult("no_record", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult("no_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult("no_config", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart) {
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
    const descriptor = brickLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== void 0 ? line.cost : null;
    const qty = num(line.qty, 1);
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
    const lineModifiers = firstField(partDescriptor, FORMULA_FIELDS);
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
          tier: firstField(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `component '${base.label}': ${asString(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`component '${base.label}': template resolution failed (${asString(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS) ? EMBEDDED_RULE_FIELDS.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField(partDescriptor, MACHINE_FIELDS) ?? context.machine;
    const setupFee = firstFinite(partDescriptor, SETUP_FIELDS) ?? (context.setupFee || void 0);
    const minimumCharge = firstFinite(partDescriptor, MIN_FIELDS) ?? (context.minimumCharge || void 0);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === "boolean" ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite(partDescriptor, TAX_PCT_FIELDS) ?? (context.taxPercent || void 0);
    let priced = null;
    try {
      priced = pricePart({
        label: base.label,
        category: line.category_key || asString(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString(firstField(partDescriptor, UNIT_FIELDS)) || "each",
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
      warnings.push(`component '${base.label}': engine pricing failed (${asString(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord(priced) ? priced : {};
    const lineSubtotal = firstFinite(pricedRecord, ["subtotal"]) ?? num(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? "descriptor" : "context";
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num(pricedRecord.unitPrice),
      extended: num(pricedRecord.extended),
      setup_fee: num(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num(pricedRecord.total),
      price_source: asString(pricedRecord.priceSource),
      tier_source: asString(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString(pricedRecord.danglingTierRef) || null,
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
  const customerPrice = round2(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round2(configuredBaseline)}) exceeds project sell \u2014 remainder ${round2(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round2(baselineSell)} - priced baseline ${round2(configuredBaseline)} = remainder ${round2(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round2(remainder)} + engine ${round2(engineTotal)} = ${customerPrice}`
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
export {
  BRICK_COMPONENT_KEYS,
  BRICK_ENGINE_LINE_FIELDS,
  BRICK_MODULE_KEYS,
  brickConfigScan,
  brickCostLines,
  brickEngineConfigured,
  brickLineDescriptor,
  brickPricingContextOf,
  descriptorHasPricingContent,
  resolveBrickSellPricing
};
