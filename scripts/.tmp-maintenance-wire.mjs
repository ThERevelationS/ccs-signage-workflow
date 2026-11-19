// base44/shared/maintenancePricingWire.ts
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
var MAINTENANCE_MODULE_KEYS = Object.freeze([
  "maintenance",
  "sign_maintenance",
  "maintenance_project",
  "sign_maintenance_project",
  "service",
  "maintenance_service"
]);
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
var LINE_COMPONENT_FIELDS = ["labor_cost", "materials_cost"];
var LINE_QTY_FIELDS = ["qty", "quantity", "count"];
var LINE_LABEL_FIELDS = ["description", "label", "name", "item_name", "part_name", "service_name"];
var LINE_KEY_FIELDS = ["builder_item_id", "id", "item_id", "service_item_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS = ["category_key", "category", "part_category", "pricing_category", "service_category", "sign_type"];
var ENGINE_BLOCK_FIELDS = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS = /* @__PURE__ */ new Set([
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
var FORMULA_FIELDS = ["formula_modifiers"];
var MODE_FIELDS = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS = ["tiers", "tier_catalog"];
var MAINTENANCE_ENGINE_LINE_FIELDS = Object.freeze([
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
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken = (v) => ENGINE_MODE_TOKENS.has(lc(v));
var nonEmptyArrayField = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField = (rec, fields) => fields.some((f) => firstFinite(rec, [f]) !== null);
var anyPositiveField = (rec, fields) => fields.some((f) => {
  const v = firstFinite(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig = (v) => {
  if (!isRecord(v)) return false;
  return anyPositiveField(v, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MIN_FIELDS]) || anyFiniteField(v, MARKUP_FIELDS) || nonEmptyArrayField(v, [...BREAK_FIELDS, ...FORMULA_FIELDS]) || MODE_FIELDS.some((f) => isEngineModeToken(v[f])) || TIER_REF_FIELDS.some((f) => asString(v[f]) !== "");
};
function descriptorHasPricingContent(d) {
  if (!isRecord(d)) return false;
  if (anyPositiveField(d, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MARKET_DISCOUNT_FIELDS, ...MIN_FIELDS, ...SETUP_FIELDS]) || anyFiniteField(d, MARKUP_FIELDS)) return true;
  if (nonEmptyArrayField(d, [...BREAK_FIELDS, ...FORMULA_FIELDS, ...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (MODE_FIELDS.some((f) => isEngineModeToken(d[f]))) return true;
  if (TIER_REF_FIELDS.some((f) => asString(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord(v) ? true : asString(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => firstField(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}
var lineKey = (item, index) => {
  const explicit = firstField(item, LINE_KEY_FIELDS);
  if (explicit !== void 0 && asString(explicit) !== "") return asString(explicit);
  return `idx-${index}`;
};
var lineCostOf = (item) => {
  const direct = firstFinite(item, LINE_COST_FIELDS);
  if (direct !== null) return direct;
  const hasComponent = LINE_COMPONENT_FIELDS.some((f) => toFiniteNumber(item[f]) !== null);
  if (!hasComponent) return null;
  return LINE_COMPONENT_FIELDS.reduce((s, f) => s + num(item[f]), 0);
};
function maintenanceRecordLines(record) {
  if (!isRecord(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord) : [];
  return flat.map((item, index) => ({
    key: lineKey(item, index),
    index,
    label: asString(firstField(item, LINE_LABEL_FIELDS)) || asString(item.sign_type) || `Item ${index + 1}`,
    qty: num(firstField(item, LINE_QTY_FIELDS), 1),
    cost: lineCostOf(item),
    category_key: asString(firstField(item, LINE_CATEGORY_FIELDS)),
    item,
    origin: "items"
  }));
}
var engineBlockOf = (record) => firstRecord(record, ENGINE_BLOCK_FIELDS) ?? {};
function maintenancePricingContextOf(record, callerContext = null) {
  const rec = isRecord(record) ? record : {};
  const block = engineBlockOf(rec);
  const caller = isRecord(callerContext) ? callerContext : {};
  const cp = isRecord(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField(block, TIER_CONTEXT_FIELDS.concat("tier")) ?? firstField(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray(block, EMBEDDED_RULE_FIELDS) ?? [];
  const templates = firstArray(caller, ["templates", "pricing_templates"]) ?? firstArray(block, EMBEDDED_TEMPLATE_FIELDS) ?? [];
  const tiers = firstArray(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray(block, EMBEDDED_TIER_CATALOG_FIELDS.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite(rec, ["markup_percent"]) ?? 0;
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
  const item = isRecord(line?.item) ? line.item : isRecord(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of MAINTENANCE_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf(record);
  const lineMap = firstRecord(block, ENGINE_LINE_MAP_FIELDS);
  const mapEntry = lineMap ? isRecord(lineMap[line?.key]) ? lineMap[line.key] : isRecord(lineMap[asString(line?.index)]) ? lineMap[asString(line?.index)] : null : null;
  const nested = firstRecord(item, NESTED_CONFIG_FIELDS);
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
function resolveMaintenanceSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord(input.record) ? input.record : null;
  const baselineSell = num(input.baselineSell ?? input.baseline_sell);
  const internalCost = num(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite(rec, ["subtotal"]);
  const markupPct = firstFinite(input, ["markupPercent", "markup_percent"]) ?? firstFinite(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = maintenancePricingContextOf(rec, input.context);
  const contextUsed = {
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
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : maintenanceRecordLines(rec);
  const scan = maintenanceConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart) {
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
    const rawItem = isRecord(line?.item) ? line.item : isRecord(line) ? line : {};
    const descriptor = maintenanceLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf(rawItem);
    const qty = num(line.qty ?? firstField(rawItem, LINE_QTY_FIELDS), 1) || 0;
    const base = {
      key: line.key || lineKey(rawItem, position),
      label: line.label || asString(firstField(rawItem, LINE_LABEL_FIELDS)) || asString(rawItem.sign_type) || `Item ${position + 1}`,
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
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS) ? EMBEDDED_RULE_FIELDS.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField(partDescriptor, MACHINE_FIELDS) ?? null;
    const setupFee = firstFinite(partDescriptor, SETUP_FIELDS) ?? void 0;
    const minimumCharge = firstFinite(partDescriptor, MIN_FIELDS) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart({
        label: base.label,
        category: line.category_key || asString(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString(firstField(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
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
      warnings.push(`line '${base.label}': engine pricing failed (${asString(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord(priced) ? priced : {};
    const lineSubtotal = firstFinite(pricedRecord, ["subtotal"]) ?? num(pricedRecord.extended);
    base.priced = true;
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
  const customerPrice = round2(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round2(configuredBaseline)}) exceeds project sell \u2014 remainder ${round2(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round2(baselineSell)} - configured baseline ${round2(configuredBaseline)} = remainder ${round2(remainder)}`
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
  MAINTENANCE_ENGINE_LINE_FIELDS,
  MAINTENANCE_MODULE_KEYS,
  descriptorHasPricingContent,
  maintenanceConfigScan,
  maintenanceLineDescriptor,
  maintenancePricingContextOf,
  maintenanceRecordLines,
  resolveMaintenanceSellPricing
};
