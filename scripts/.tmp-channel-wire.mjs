// base44/shared/channelPricingWire.ts
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
var normStr = (v) => String(v ?? "").trim().toLowerCase();
var round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
var round4 = (n) => Math.round((num(n) + Number.EPSILON) * 1e4) / 1e4;
var firstField = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};
var firstNonBlank = (rec, fields) => firstField(rec, fields);
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
var MARKUP_FIELDS = ["markup_pct", "markup", "markup_percent"];
var MARKET_RETAIL_FIELDS = ["market_retail", "retail_price", "retail"];
var TIER_REF_FIELDS = ["tier_ref"];
var MODIFIER_FIELDS = ["formula_modifiers", "modifiers"];
var MIN_CHARGE_FIELDS = ["minimum_charge", "min_charge"];
var TIER_RULES_FIELDS = ["tier_rules", "tierRules", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var CUSTOMER_TIER_FIELDS = ["customer_tier", "customerTier"];
var SETUP_FEE_FIELDS = ["setup_fee", "setupFee"];
var TAX_PCT_FIELDS = ["tax_percent", "taxPercent"];
var MODE_FIELDS = ["pricing_mode", "price_mode", "mode", "active_mode"];
var TEMPLATE_REGISTRY_FIELDS = ["templates", "pricing_templates"];
var TIER_CATALOG_FIELDS = ["tiers", "markup_tiers"];
var DEFAULT_MARKUP_FIELDS = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var nonBlank = (v) => normStr(v) !== "";
var hasBreakChart = (src) => BREAK_FIELDS.some((f) => Array.isArray(src?.[f]) && src[f].length > 0);
var hasTemplateEmbed = (src) => CHANNEL_LINE_TEMPLATE_FIELDS.some((f) => isRecord(src?.[f]));
var templateRefValue = (src) => {
  for (const f of CHANNEL_LINE_TEMPLATE_ID_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_NAME_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
    const v = src?.[f];
    if (v !== void 0 && v !== null && !isRecord(v) && nonBlank(v)) return { ref: v, via: f };
  }
  return null;
};
function descriptorConfigured(src) {
  const via = [];
  if (!isRecord(src)) return { configured: false, via };
  const fixed = firstFinite(src, FIXED_PRICE_FIELDS);
  if (fixed !== null && fixed > 0) via.push("fixed_price");
  for (const f of TIER_REF_FIELDS) if (nonBlank(src[f])) via.push(f);
  for (const f of ["tier", "tier_name"]) if (nonBlank(src[f])) via.push(f);
  if (hasBreakChart(src)) via.push("per_unit_breaks");
  const retail = firstFinite(src, MARKET_RETAIL_FIELDS);
  if (retail !== null && retail > 0) via.push("market_retail");
  const mode = firstField(src, MODE_FIELDS);
  if (mode !== void 0 && ENGINE_MODE_TOKENS.has(normStr(mode))) via.push("pricing_mode");
  const markup = firstFinite(src, MARKUP_FIELDS);
  if (markup !== null) via.push("markup_pct");
  for (const f of MODIFIER_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) {
      via.push("formula_modifiers");
      break;
    }
  }
  const minCharge = firstFinite(src, MIN_CHARGE_FIELDS);
  if (minCharge !== null && minCharge > 0) via.push("minimum_charge");
  const setupFee = firstFinite(src, SETUP_FEE_FIELDS);
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
  if (!isRecord(source)) return null;
  let block = null;
  let field = "";
  for (const f of CHANNEL_ENGINE_CONTEXT_FIELDS) {
    if (isRecord(source[f])) {
      block = source[f];
      field = f;
      break;
    }
  }
  if (!block && isRecord(source.customer_pricing)) {
    for (const f of CHANNEL_NESTED_CONTEXT_FIELDS) {
      if (isRecord(source.customer_pricing[f])) {
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
  const cp = isRecord(source.customer_pricing) ? source.customer_pricing : null;
  const customerTier = firstNonBlank(block, [...CUSTOMER_TIER_FIELDS, "tier"]) ?? firstNonBlank(source, [...CUSTOMER_TIER_FIELDS, "pricing_tier"]) ?? (cp ? cp.tier_number ?? cp.tier_name ?? void 0 : void 0) ?? null;
  const defaultMarkup = firstFinite(block, DEFAULT_MARKUP_FIELDS) ?? firstFinite(block, MARKUP_FIELDS) ?? (Number.isFinite(Number(source.markup_percent)) ? num(source.markup_percent) : 0);
  return {
    __channelPricingContext: true,
    field,
    customerTier,
    tierRules: firstArr(block, TIER_RULES_FIELDS),
    template: firstField(block, ["template", "pricing_template"]),
    templates: firstArr(block, TEMPLATE_REGISTRY_FIELDS),
    tiers: firstArr(block, TIER_CATALOG_FIELDS),
    machine: firstField(block, ["machine", "machine_override"]),
    defaultMarkupPct: num(defaultMarkup),
    taxable: typeof block.taxable === "boolean" ? block.taxable : normStr(block.taxable) === "false" ? false : normStr(block.taxable) === "true" ? true : void 0,
    taxPercent: num(firstFinite(block, TAX_PCT_FIELDS)),
    setupFee: num(firstFinite(block, SETUP_FEE_FIELDS)),
    minimumCharge: num(firstFinite(block, MIN_CHARGE_FIELDS)),
    modifiers: Array.isArray(block.modifiers) ? block.modifiers : Array.isArray(block.formula_modifiers) ? block.formula_modifiers : void 0,
    raw: block
  };
}
function channelLinePricingConfig(line) {
  const src = isRecord(line?.line) && !isRecord(line?.part) ? line.line : line;
  const via = [];
  let part = null;
  for (const f of CHANNEL_LINE_PART_FIELDS) {
    const d = src?.[f];
    if (!isRecord(d)) continue;
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
      ...MARKUP_FIELDS,
      ...MODIFIER_FIELDS,
      ...MIN_CHARGE_FIELDS,
      ...SETUP_FEE_FIELDS
    ]) {
      if (src[f] !== void 0 && src[f] !== null && src[f] !== "") merged[f] = src[f];
    }
    part = part ? { ...merged, ...part } : merged;
  }
  let machine = null;
  for (const f of CHANNEL_LINE_MACHINE_FIELDS) {
    if (isRecord(src?.[f])) {
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
      if (isRecord(src?.[f])) {
        template = src[f];
        via.push(f);
        break;
      }
    }
  }
  if (!template && isRecord(part)) {
    const ptref = templateRefValue(part);
    if (ptref) {
      template = ptref.ref;
      via.push(`part.${ptref.via}`);
    } else {
      for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
        if (isRecord(part[f])) {
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
  if (!isRecord(record)) return [];
  const lines = [];
  const push = (l) => {
    const cost = num(l.cost);
    const qty = num(l.qty, 0) > 0 ? num(l.qty) : 1;
    const unitCost = Number.isFinite(Number(l.unitCost)) ? num(l.unitCost) : num(l.qty, 0) > 0 ? cost / num(l.qty) : cost;
    lines.push({ ...l, cost, qty, unitCost });
  };
  const purchases = Array.isArray(record.letter_purchases) ? record.letter_purchases : [];
  purchases.forEach((lp, i) => {
    const total = num(lp?.total_cost, num(lp?.line_total, num(lp?.qty, 0) * num(lp?.unit_cost)));
    if (total <= 0) return;
    const desc = labelOr(lp?.description, lp?.letter_type, `Purchase ${i + 1}`);
    const qty = num(lp?.qty, 0);
    const isDimensional = lp?.letter_type === "dimensional_letters";
    if (isDimensional && isRecord(lp?.fab_config)) {
      const matCost = num(lp.fab_config.material_cost) + num(lp.fab_config.paint_material_cost);
      const laborCost = num(lp.fab_config.cnc_labor_cost) + num(lp.fab_config.paint_labor_cost);
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
  const letterFees = (onlyDimensional ? 0 : num(record.letters_delivery_fee)) + num(record.letters_design_fee) + num(record.letters_install_supplies_fee) + num(record.letters_permitting_fee) + num(record.letters_other_fee);
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
  const laborViaPersonnel = record.labor_priced_via_personnel !== void 0 ? !!record.labor_priced_via_personnel : num(record.total_personnel_cost) > 0;
  const items = Array.isArray(record.items) ? record.items : [];
  items.forEach((it, i) => {
    const desc = labelOr(it?.description, it?.installation_type, `Item ${i + 1}`);
    const laborCost = num(it?.labor_cost);
    const materialsCost = num(it?.materials_cost);
    if (!laborViaPersonnel && laborCost > 0) {
      push({
        key: `item:${i}:labor`,
        label: `Install Labor \u2014 ${desc}`,
        cost: laborCost,
        qty: num(it?.qty_letters, 0) || 1,
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
        qty: num(it?.qty_letters, 0) || 1,
        category: "outsourced_fab",
        family: "install_item",
        line: it
      });
    }
    if (!laborViaPersonnel && laborCost <= 0 && materialsCost <= 0 && num(it?.item_total_cost) > 0) {
      push({
        key: `item:${i}`,
        label: `Install Item \u2014 ${desc}`,
        cost: num(it.item_total_cost),
        qty: num(it?.qty_letters, 0) || 1,
        category: "outsourced_fab",
        family: "install_item",
        line: it
      });
    }
    if (laborViaPersonnel && materialsCost <= 0 && laborCost <= 0 && num(it?.item_total_cost) > 0) {
      const matShare = num(it.item_total_cost) - laborCost;
      if (matShare > 0) {
        push({
          key: `item:${i}`,
          label: `Install Materials \u2014 ${desc}`,
          cost: matShare,
          qty: num(it?.qty_letters, 0) || 1,
          category: "outsourced_fab",
          family: "install_item",
          line: it
        });
      }
    }
  });
  (Array.isArray(record.selected_equipment) ? record.selected_equipment : []).forEach((sel, i) => {
    const cost = num(sel?.total_cost);
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
    const cost = num(p?.total_cost, num(p?.hourly_rate) * num(p?.hours));
    if (cost <= 0) return;
    push({
      key: `personnel:${i}`,
      label: `Crew \u2014 ${labelOr(p?.name, p?.role, p?.title, `Row ${i + 1}`)}`,
      cost,
      qty: num(p?.hours, 0) || 1,
      category: "inhouse_labor",
      family: "personnel",
      line: p
    });
  });
  const supplies = num(record.total_supplies_cost);
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
  const travel = num(record.total_travel_cost);
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
  const line = isRecord(input.line) ? input.line : isRecord(input) && input.cost !== void 0 && !input.line ? input : input.line;
  const src = isRecord(line) ? line : {};
  const chain = [];
  const cost = num(input.cost ?? input.lineCost ?? src.total_cost ?? src.cost);
  const rawQty = num(input.qty ?? src.qty ?? src.qty_letters ?? src.quantity, 0);
  const qty = rawQty > 0 ? rawQty : 1;
  const unitCost = Number.isFinite(Number(input.unitCost ?? input.unit_cost)) ? num(input.unitCost ?? input.unit_cost) : rawQty > 0 ? cost / rawQty : cost;
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
      const templatePart = isRecord(part) ? { ...part } : { ...isRecord(src) ? src : {} };
      if (isRecord(config.template)) templatePart.pricing_template = config.template;
      else templatePart.pricing_template_id = config.template;
      const res = resolver({
        part: templatePart,
        qty,
        base_price: unitCost,
        templates: input.templates ?? context?.templates,
        tiers: input.tiers ?? context?.tiers ?? input.customerTier ?? context?.customerTier,
        customer_tier: input.customerTier ?? context?.customerTier,
        template: isRecord(input.template) ? input.template : isRecord(context?.template) ? context?.template : void 0,
        default_markup_pct: context?.defaultMarkupPct,
        minimum_charge: src.minimum_charge ?? context?.minimumCharge
      });
      chain.push({
        step: "template",
        detail: res?.applied === true ? `template priced (${res.source}:${res.pct_source ?? "n/a"} -> unit ${round4(res.unit_price)})` : `template not applied (${res?.reason ?? "unresolved"}) \u2014 engine chain prices`
      });
      if (res?.applied === true) {
        const fold = typeof input.engine?.templatePartDescriptor === "function" ? input.engine.templatePartDescriptor : (p) => p;
        part = fold(part ?? {}, res);
      }
    } else {
      chain.push({ step: "template", detail: "resolveTemplatePrice not supplied \u2014 ref left to engine chain" });
    }
  }
  const customerTier = src.customer_tier ?? src.customerTier ?? (isRecord(part) ? firstField(part, CUSTOMER_TIER_FIELDS) : void 0) ?? input.customerTier ?? context?.customerTier ?? null;
  const lineRules = TIER_RULES_FIELDS.reduce((acc, f) => {
    const v = src[f] ?? (isRecord(part) ? part[f] : void 0);
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
    setupFee: firstFinite(src, SETUP_FEE_FIELDS) ?? context?.setupFee,
    minimumCharge: firstFinite(src, MIN_CHARGE_FIELDS) ?? context?.minimumCharge,
    taxable: typeof src.taxable === "boolean" ? src.taxable : context?.taxable,
    taxPercent: firstFinite(src, TAX_PCT_FIELDS) ?? context?.taxPercent,
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
    sellPrice: num(priced?.total, cost),
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
    line: isRecord(l?.line) ? l.line : l,
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
  const sellTotal = allPassthrough ? lines.reduce((s, l) => s + l.sellPrice, 0) : round2(lines.reduce((s, l) => s + l.sellPrice, 0));
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
    internalCost: num(input.internalCost),
    customerPrice: num(input.customerPrice),
    sell: null,
    lines: [],
    context: null,
    chain,
    ...r
  });
  if (!isRecord(record)) {
    chain.push({ step: "passthrough", detail: "no record" });
    return done({ passthrough: true, reason: "no_record" });
  }
  const context = channelEngineContext(input.context ?? record);
  const lines = Array.isArray(input.lines) && input.lines.length ? input.lines : channelCostLines(record);
  if (!lines.length) {
    chain.push({ step: "passthrough", detail: "record produced no cost lines" });
    return done({ passthrough: true, reason: "no_cost_lines", context });
  }
  const anyLineConfig = lines.some((l) => channelLinePricingConfig(isRecord(l?.line) ? l.line : l).configured);
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
    detail: `engine customerPrice ${sell.sellTotal} over internalCost ${num(input.internalCost)} (${sell.pricedCount}/${lines.length} priced)`
  });
  return done({
    wired: true,
    customerPrice: sell.sellTotal,
    sell,
    lines,
    context
  });
}
function channelEngineConfigured(source, lines) {
  if (channelEngineContext(source)) return true;
  const list = Array.isArray(lines) ? lines : [];
  return list.some((l) => channelLinePricingConfig(isRecord(l?.line) ? l.line : l).configured);
}
export {
  CHANNEL_ENGINE_CONTEXT_FIELDS,
  CHANNEL_LINE_MACHINE_FIELDS,
  CHANNEL_LINE_PART_FIELDS,
  CHANNEL_LINE_TEMPLATE_FIELDS,
  CHANNEL_LINE_TEMPLATE_ID_FIELDS,
  CHANNEL_LINE_TEMPLATE_NAME_FIELDS,
  CHANNEL_MODULE_KEYS,
  CHANNEL_NESTED_CONTEXT_FIELDS,
  channelCostLines,
  channelEngineConfigured,
  channelEngineContext,
  channelEngineEconomics,
  channelLinePricingConfig,
  wireChannelLineSell,
  wireChannelProjectSell
};
