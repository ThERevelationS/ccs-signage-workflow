// base44/shared/machineCosts.ts
var num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
var normStr = (v) => String(v ?? "").trim().toLowerCase();
var round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
var round4 = (n) => Math.round((num(n) + Number.EPSILON) * 1e4) / 1e4;
var firstFinite = (...vals) => {
  for (const v of vals) {
    if (v === void 0 || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
var firstPresent = (...vals) => {
  for (const v of vals) if (v !== void 0 && v !== null && v !== "") return v;
  return void 0;
};
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var boolWithDefault = (v, defaultValue) => {
  if (v === void 0 || v === null || v === "") return defaultValue;
  if (v === false || v === true) return v;
  const s = normStr(v);
  if (s === "false" || s === "no" || s === "off" || s === "0") return false;
  if (s === "true" || s === "yes" || s === "on" || s === "1") return true;
  return !!v;
};
var DEFAULT_SECOND_SIDE_PCT = 100;
var PRICE_CALC_TOKENS = {
  margin: "margin",
  gross_margin: "margin",
  "gross-margin": "margin",
  sell_margin: "margin",
  margin_pct: "margin",
  markup: "markup",
  markup_pct: "markup",
  cost_plus: "markup",
  "cost-plus": "markup",
  costplus: "markup",
  fixed: "fixed",
  fixed_price: "fixed",
  "fixed-price": "fixed",
  flat: "fixed",
  machine: "machine",
  default: "machine"
};
var normalizePriceCalc = (v) => isObj(v) ? null : PRICE_CALC_TOKENS[normStr(v)] ?? null;
var normalizeMarginMode = (v) => {
  const t = normalizePriceCalc(v);
  return t === "margin" || t === "markup" ? t : null;
};
function normalizeMachine(raw) {
  if (!isObj(raw)) return null;
  const warnings = [];
  const costPerHour = Math.max(0, num(
    firstPresent(raw.cost_per_hour, raw.runtime_rate_per_hour, raw.rate_per_hour, raw.hourly_rate, raw.rate)
  ));
  const setupCost = Math.max(0, num(firstPresent(raw.setup_cost, raw.setup_fee, raw.flat_setup_cost)));
  const setupMinutes = Math.max(0, num(
    firstPresent(raw.setup_minutes, raw.setup_time_minutes, raw.setup_mins)
  ));
  const explicitSetupHours = firstFinite(raw.setup_hours, raw.setup_time_hours);
  const setupHours = explicitSetupHours != null ? Math.max(0, explicitSetupHours) : setupMinutes / 60;
  let laborPct = num(firstPresent(raw.labor_pct, raw.labor_percent, raw.operator_labor_pct));
  if (laborPct < 0 || laborPct > 100) {
    warnings.push(`labor_pct ${laborPct} clamped to [0,100]`);
    laborPct = Math.min(100, Math.max(0, laborPct));
  }
  let weighted = firstFinite(
    raw.weighted_multiplier,
    raw.multiplier,
    raw.complexity_multiplier,
    raw.difficulty_multiplier
  );
  if (weighted == null) weighted = 1;
  if (weighted < 0) {
    warnings.push(`weighted_multiplier ${weighted} clamped to 0`);
    weighted = 0;
  }
  let secondSidePct = firstFinite(
    raw.second_side_price_pct,
    raw.secondSidePricePct,
    raw.second_side_pct,
    raw.duplex_price_pct
  );
  if (secondSidePct == null) secondSidePct = DEFAULT_SECOND_SIDE_PCT;
  if (secondSidePct < 0) {
    warnings.push(`second_side_price_pct ${secondSidePct} clamped to 0`);
    secondSidePct = 0;
  }
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).filter((p) => isObj(p)).map((p) => ({
    ...p,
    name: String(p.name ?? ""),
    speed_settings: isObj(p.speed_settings) ? p.speed_settings : {}
  }));
  const priceCalc = normalizePriceCalc(raw.price_calc ?? raw.priceCalc);
  if ((raw.price_calc ?? raw.priceCalc) != null && !priceCalc) {
    warnings.push(`unknown price_calc '${raw.price_calc ?? raw.priceCalc}' ignored`);
  }
  const status = String(raw.status ?? "").trim() || "active";
  return {
    id: raw.id ?? raw.machine_id ?? null,
    name: String(raw.name ?? ""),
    machine_type: String(raw.machine_type ?? "").trim(),
    status,
    active: normStr(status) !== "inactive",
    cost_per_hour: costPerHour,
    profiles,
    disposable_cost_per_unit: Math.max(0, num(firstPresent(
      raw.disposable_cost_per_unit,
      raw.disposable_per_unit,
      raw.consumable_cost_per_unit,
      raw.consumables_per_unit
    ))),
    setup_cost: setupCost,
    setup_minutes: setupMinutes,
    setup_hours: setupHours,
    setup_billed: boolWithDefault(raw.setup_billed ?? raw.bill_setup_time, true),
    labor_pct: laborPct,
    labor_rate_per_hour: Math.max(0, num(
      firstFinite(raw.labor_rate_per_hour, raw.labor_rate, raw.operator_rate) ?? costPerHour
    )),
    weighted_multiplier: weighted,
    margin_chart_id: raw.margin_chart_id ?? raw.pricing_template_id ?? raw.margin_template_id ?? null,
    margin_chart: raw.margin_chart ?? raw.marginChart,
    // embedded chart (passthrough)
    margin_mode: normalizeMarginMode(raw.margin_mode ?? raw.marginMode),
    income_account: raw.income_account ?? raw.incomeAccount ?? "",
    price_calc: priceCalc && priceCalc !== "machine" ? priceCalc : null,
    fixed_price: firstFinite(raw.fixed_price, raw.price_override, raw.override_price, raw.flat_price),
    second_side_price_pct: secondSidePct,
    part_overrides: raw.part_overrides ?? raw.machine_part_overrides ?? null,
    description: String(raw.description ?? ""),
    warnings,
    raw
  };
}
function machineUseCost({
  machine,
  run_hours,
  runtime_hours,
  hours,
  quantity,
  qty,
  setup_billed,
  setup_hours,
  setup_minutes,
  labor_rate,
  labor_rate_per_hour,
  disposable_cost_per_unit,
  disposable_per_unit
} = {}) {
  const m = normalizeMachine(machine);
  if (!m) {
    return {
      machine_found: false,
      machine_id: null,
      machine_name: "",
      active: false,
      run_hours: 0,
      quantity: 0,
      cost_per_hour: 0,
      run_cost: 0,
      setup_cost: 0,
      setup_hours: 0,
      setup_billed: false,
      disposable_cost: 0,
      labor_cost: 0,
      labor_pct: 0,
      total: 0,
      breakdown: {},
      warnings: ["machine row missing or not an object"]
    };
  }
  const runHours = Math.max(0, num(firstFinite(run_hours, runtime_hours, hours) ?? 0));
  const quantityN = Math.max(0, num(firstFinite(quantity, qty) ?? 0));
  const zero = (extra) => ({
    machine_found: true,
    machine_id: m.id,
    machine_name: m.name,
    active: m.active,
    run_hours: runHours,
    quantity: quantityN,
    cost_per_hour: m.cost_per_hour,
    run_cost: 0,
    setup_cost: 0,
    setup_hours: m.setup_hours,
    setup_billed: m.setup_billed,
    disposable_cost: 0,
    labor_cost: 0,
    labor_pct: m.labor_pct,
    total: 0,
    breakdown: {},
    warnings: [...m.warnings || []],
    ...extra
  });
  if (!m.active) return zero({ inactive: true, skipped_reason: "inactive_machine" });
  const setupHours = Math.max(0, num(
    firstFinite(setup_hours) ?? (firstFinite(setup_minutes) != null ? firstFinite(setup_minutes) / 60 : m.setup_hours)
  ));
  const billed = setup_billed !== void 0 ? boolWithDefault(setup_billed, true) : m.setup_billed;
  const laborRate = Math.max(0, num(
    firstFinite(labor_rate, labor_rate_per_hour) ?? m.labor_rate_per_hour
  ));
  const disposableRate = Math.max(0, num(
    firstFinite(disposable_cost_per_unit, disposable_per_unit) ?? m.disposable_cost_per_unit
  ));
  const runCost = runHours * m.cost_per_hour;
  const setupTimeCost = billed ? setupHours * m.cost_per_hour : 0;
  const setupTotal = m.setup_cost + setupTimeCost;
  const disposableCost = disposableRate * quantityN;
  const laborHours = runHours * (m.labor_pct / 100);
  const laborCost = laborHours * laborRate;
  const total = runCost + setupTotal + disposableCost + laborCost;
  return {
    machine_found: true,
    machine_id: m.id,
    machine_name: m.name,
    active: true,
    run_hours: runHours,
    quantity: quantityN,
    cost_per_hour: m.cost_per_hour,
    run_cost: round2(runCost),
    setup_cost: round2(setupTotal),
    setup_hours: setupHours,
    setup_billed: billed,
    disposable_cost: round2(disposableCost),
    disposable_cost_per_unit: disposableRate,
    labor_cost: round2(laborCost),
    labor_pct: m.labor_pct,
    labor_rate_per_hour: laborRate,
    labor_hours: round4(laborHours),
    total: round2(total),
    breakdown: {
      run: { hours: runHours, rate: m.cost_per_hour, cost: round2(runCost) },
      setup: {
        flat: round2(m.setup_cost),
        hours: setupHours,
        rate: m.cost_per_hour,
        billed,
        time_cost: round2(setupTimeCost),
        total: round2(setupTotal)
      },
      disposable: { per_unit: disposableRate, qty: quantityN, cost: round2(disposableCost) },
      labor: { pct: m.labor_pct, hours: round4(laborHours), rate: laborRate, cost: round2(laborCost) },
      total: round2(total)
    },
    warnings: [...m.warnings || []]
  };
}
var chartRows = (chart) => {
  if (Array.isArray(chart)) return chart;
  if (!isObj(chart)) return [];
  const rows = chart.breaks ?? chart.rows ?? chart.margin_rows ?? chart.brackets ?? chart.tiers;
  return Array.isArray(rows) ? rows : [];
};
var bracketMinQty = (b) => num(firstFinite(b?.qty, b?.min_qty, b?.min_quantity, b?.quantity, b?.break_qty, b?.from_qty) ?? 0);
var tierMarkupsPct = (map, customerTier) => {
  if (!isObj(map)) return null;
  const keys = /* @__PURE__ */ new Set();
  const add = (v) => {
    const k = normStr(v);
    if (k) keys.add(k);
  };
  if (isObj(customerTier)) {
    add(customerTier.tier_name);
    add(customerTier.tier_number);
    add(customerTier.id);
    add(customerTier.name);
  } else {
    add(customerTier);
  }
  for (const [k, v] of Object.entries(map)) {
    if (keys.has(normStr(k)) && Number.isFinite(Number(v))) return Number(v);
  }
  for (const fallback of ["default", "*"]) {
    const hit = Object.entries(map).find(([k]) => normStr(k) === fallback);
    if (hit && Number.isFinite(Number(hit[1]))) return Number(hit[1]);
  }
  const numeric = Object.values(map).filter((v) => Number.isFinite(Number(v)));
  if (Object.keys(map).length === 1 && numeric.length === 1) return Number(numeric[0]);
  return null;
};
var bracketPct = (b, customerTier) => {
  const marginVal = firstFinite(b?.margin_pct, b?.margin, b?.pct, b?.percent, b?.gross_margin_pct);
  if (marginVal != null) return { pct: marginVal, basisHint: "margin" };
  const markupVal = firstFinite(b?.markup_pct, b?.markup);
  if (markupVal != null) return { pct: markupVal, basisHint: "markup" };
  const tierVal = tierMarkupsPct(b?.tier_markups ?? b?.tierMargins ?? b?.tiers, customerTier);
  if (tierVal != null) return { pct: tierVal, basisHint: "markup" };
  return null;
};
var pickMarginBracket = (rows, quantity, customerTier) => {
  let pick = null;
  let pickQty = -Infinity;
  for (const b of rows) {
    if (!isObj(b)) continue;
    const hit = bracketPct(b, customerTier);
    if (!hit) continue;
    const bq = bracketMinQty(b);
    if (bq > quantity) continue;
    if (bq > pickQty) {
      pick = { bracket: b, ...hit, min_qty: bq };
      pickQty = bq;
    }
  }
  return pick;
};
function applyMachineMultipliers(cost, machine, opts = {}) {
  const baseCost = Math.max(0, num(isObj(cost) && Number.isFinite(Number(cost.total)) ? cost.total : cost));
  const m = normalizeMachine(machine);
  const warnings = [];
  const quantity = Math.max(0, num(firstFinite(opts.quantity, opts.qty) ?? 0));
  const customerTier = opts.customer_tier ?? opts.customerTier ?? opts.tier;
  if (!m) {
    return {
      machine_found: false,
      base_cost: round2(baseCost),
      weighted_multiplier: 1,
      weighted_cost: round2(baseCost),
      quantity,
      margin_pct: null,
      margin_mode: null,
      bracket: null,
      chart_id: null,
      chart_resolved: false,
      price: round2(baseCost),
      price_valid: true,
      margin_amount: 0,
      source: "passthrough",
      applied: [],
      warnings: ["machine row missing or not an object"]
    };
  }
  warnings.push(...m.warnings || []);
  const mult = m.weighted_multiplier;
  const weighted = baseCost * mult;
  const applied = [{ step: "weighted_multiplier", multiplier: mult, before: round2(baseCost), after: round2(weighted) }];
  const chart = firstPresent(opts.margin_chart, opts.marginChart, opts.chart, m.margin_chart);
  const rows = chartRows(chart);
  const chartId = isObj(chart) ? chart.id ?? chart.name ?? m.margin_chart_id ?? null : m.margin_chart_id ?? null;
  const chartResolved = rows.length > 0;
  const modeHit = normalizeMarginMode(opts.margin_mode ?? opts.marginMode) ?? m.margin_mode ?? (isObj(chart) ? normalizeMarginMode(chart.margin_mode ?? chart.marginMode) : null);
  let pick = null;
  let pctSource = "none";
  if (chartResolved) {
    pick = pickMarginBracket(rows, quantity, customerTier);
    if (pick) pctSource = "bracket";
  }
  if (!pick && isObj(chart)) {
    const flat = bracketPct(chart, customerTier);
    if (flat) {
      pick = { bracket: null, ...flat, min_qty: 0 };
      pctSource = "chart_default";
    }
  }
  const marginMode = modeHit ?? pick?.basisHint ?? "margin";
  if (!pick || !Number.isFinite(Number(pick.pct))) {
    if (m.margin_chart_id && !chartResolved) {
      warnings.push(`margin_chart_id '${m.margin_chart_id}' unresolved \u2014 pass the chart record via opts.margin_chart`);
    }
    return {
      machine_found: true,
      machine_id: m.id,
      base_cost: round2(baseCost),
      weighted_multiplier: mult,
      weighted_cost: round2(weighted),
      quantity,
      margin_pct: null,
      margin_mode: marginMode,
      bracket: null,
      chart_id: chartId,
      chart_resolved: chartResolved,
      price: round2(weighted),
      price_valid: true,
      margin_amount: 0,
      source: chartResolved ? "weighted_multiplier" : m.margin_chart_id ? "unresolved_chart" : "weighted_multiplier",
      applied,
      warnings
    };
  }
  const pct = num(pick.pct);
  let price;
  let valid = true;
  if (pct < 0) warnings.push(`negative margin pct ${pct} prices below cost`);
  if (marginMode === "margin") {
    if (pct >= 100) {
      price = null;
      valid = false;
      warnings.push(`margin_pct ${pct} >= 100 cannot price (cost/(1-m) undefined)`);
    } else {
      price = weighted / (1 - pct / 100);
    }
  } else {
    price = weighted * (1 + pct / 100);
  }
  if (price != null) {
    applied.push({
      step: "margin_chart",
      mode: marginMode,
      pct,
      min_qty: pick.min_qty,
      before: round2(weighted),
      after: round2(price)
    });
  }
  return {
    machine_found: true,
    machine_id: m.id,
    base_cost: round2(baseCost),
    weighted_multiplier: mult,
    weighted_cost: round2(weighted),
    quantity,
    margin_pct: pct,
    margin_mode: marginMode,
    bracket: pick.bracket,
    bracket_min_qty: pick.min_qty,
    chart_id: chartId,
    chart_resolved: chartResolved,
    price: price != null ? round2(price) : null,
    price_valid: valid,
    margin_amount: price != null ? round2(price - weighted) : null,
    source: pctSource === "chart_default" ? "chart_default" : "margin_chart",
    applied,
    warnings
  };
}
function machinePartOverride(machine, partId) {
  const m = normalizeMachine(machine);
  const warnings = [];
  const want = normStr(isObj(partId) ? firstPresent(partId.id, partId.part_id, partId.part_key, partId.part_name, partId.name) : partId);
  const container = m ? m.part_overrides ?? null : null;
  let entry = null;
  if (want && container) {
    if (Array.isArray(container)) {
      entry = container.find((e) => isObj(e) && normStr(
        firstPresent(e.part_id, e.partId, e.part, e.id, e.part_key, e.part_name, e.name)
      ) === want) ?? null;
    } else if (isObj(container)) {
      const direct = container[partId] ?? container[want];
      if (isObj(direct)) entry = direct;
      else {
        entry = Object.entries(container).filter(([, v]) => isObj(v)).map(([k, v]) => v.part_id === void 0 && v.partId === void 0 ? { part_id: k, ...v } : v).find((e) => normStr(
          firstPresent(e.part_id, e.partId, e.part, e.id, e.part_key, e.part_name, e.name)
        ) === want) ?? null;
      }
    }
  }
  const o = isObj(entry) ? entry : {};
  const applied = [];
  const disposable = firstFinite(o.disposable, o.disposable_cost_per_unit, o.consumable_cost_per_unit);
  if (disposable != null) applied.push("disposable_cost_per_unit");
  const income = firstPresent(o.income_account, o.incomeAccount);
  if (income !== void 0) applied.push("income_account");
  const rawCalc = firstPresent(o.price_calc, o.priceCalc);
  const priceCalc = normalizePriceCalc(rawCalc);
  if (rawCalc !== void 0) {
    applied.push("price_calc");
    if (!priceCalc) warnings.push(`unknown price_calc '${rawCalc}' ignored`);
  }
  const ssPct = firstFinite(o.second_side_price_pct, o.secondSidePricePct, o.second_side_pct, o.duplex_price_pct);
  if (ssPct != null) applied.push("second_side_price_pct");
  const fixed = firstFinite(o.fixed_price, o.price_override, o.override_price, o.flat_price);
  if (fixed != null) applied.push("fixed_price");
  const rawMode = firstPresent(o.margin_mode, o.marginMode);
  const marginMode = normalizeMarginMode(rawMode);
  if (rawMode !== void 0 && marginMode) applied.push("margin_mode");
  const partChart = firstPresent(o.margin_chart, o.marginChart);
  if (partChart !== void 0) applied.push("margin_chart");
  const resolvedCalc = priceCalc && priceCalc !== "machine" ? priceCalc : null;
  return {
    part_id: want || null,
    found: !!entry,
    override: entry,
    applied,
    disposable_cost_per_unit: disposable != null ? Math.max(0, disposable) : m?.disposable_cost_per_unit ?? 0,
    income_account: income !== void 0 ? String(income) : m?.income_account ?? "",
    price_calc: resolvedCalc ?? m?.price_calc ?? null,
    second_side_price_pct: ssPct != null ? Math.max(0, ssPct) : m?.second_side_price_pct ?? DEFAULT_SECOND_SIDE_PCT,
    fixed_price: fixed != null ? fixed : m?.fixed_price ?? null,
    margin_mode: marginMode ?? m?.margin_mode ?? null,
    margin_chart: partChart !== void 0 ? partChart : void 0,
    machine: m,
    warnings
  };
}
function priceMachineStep(input = {}) {
  const m = normalizeMachine(input.machine);
  const quantity = Math.max(0, num(firstFinite(input.quantity, input.qty) ?? 0));
  const runHours = Math.max(0, num(firstFinite(input.run_hours, input.runtime_hours, input.hours) ?? 0));
  const pricedOut = (extra) => ({
    priced: false,
    machine_id: m?.id ?? null,
    machine_name: m?.name ?? "",
    machine_active: !!m?.active,
    part_id: null,
    quantity,
    run_hours: runHours,
    cost: null,
    base_cost: 0,
    margin: null,
    price_calc: null,
    first_side_price: 0,
    second_side: false,
    second_side_price_pct: 0,
    second_side_price: 0,
    price: 0,
    total: 0,
    unit_price: 0,
    income_account: "",
    override_applied: false,
    override_fields: [],
    warnings: [],
    ...extra
  });
  if (!m) return pricedOut({ reason: "no_machine", warnings: ["machine row missing or not an object"] });
  if (!m.active) return pricedOut({ reason: "inactive_machine", machine_active: false, warnings: [...m.warnings || []] });
  const partId = isObj(input.part) ? firstPresent(input.part.id, input.part.part_id, input.part.part_key, input.part.part_name, input.part.name) : input.part;
  const ov = machinePartOverride(m, partId);
  const use = machineUseCost({
    machine: m,
    run_hours: runHours,
    quantity,
    setup_billed: input.setup_billed,
    setup_hours: input.setup_hours,
    setup_minutes: input.setup_minutes,
    labor_rate: input.labor_rate ?? input.labor_rate_per_hour,
    disposable_cost_per_unit: ov.disposable_cost_per_unit
  });
  const warnings = [...use.warnings || [], ...ov.warnings || []];
  const ssArg = input.second_side;
  const ssOn = ssArg === true || normStr(ssArg) === "true" || isObj(ssArg) && (ssArg.enabled === true || ssArg.double_sided === true || boolWithDefault(ssArg.enabled, false));
  const ssPct = Math.max(0, num(
    firstFinite(
      isObj(ssArg) ? ssArg.price_pct : null,
      isObj(ssArg) ? ssArg.second_side_price_pct : null,
      input.second_side_price_pct,
      ov.second_side_price_pct
    ) ?? DEFAULT_SECOND_SIDE_PCT
  ));
  const calc = ov.price_calc;
  let firstSide = null;
  let margin = null;
  let priceSource;
  if (calc === "fixed") {
    if (Number.isFinite(Number(ov.fixed_price))) {
      firstSide = round2(num(ov.fixed_price) * quantity);
      priceSource = "fixed_price";
    } else {
      warnings.push("price_calc 'fixed' without finite fixed_price \u2014 fell back to chart/markup flow");
    }
  }
  if (firstSide == null) {
    margin = applyMachineMultipliers(use.total, m, {
      quantity,
      margin_chart: firstPresent(input.margin_chart, input.marginChart, ov.margin_chart, m.margin_chart),
      margin_mode: firstPresent(
        input.margin_mode,
        input.marginMode,
        calc === "margin" || calc === "markup" ? calc : void 0,
        ov.margin_mode
      ),
      customer_tier: input.customer_tier ?? input.customerTier ?? input.tier
    });
    warnings.push(...margin.warnings || []);
    firstSide = margin.price;
    priceSource = margin.source;
  }
  if (firstSide == null) {
    return {
      ...pricedOut({ reason: "unpriceable_margin" }),
      machine_active: true,
      part_id: ov.part_id,
      cost: use,
      base_cost: use.total,
      margin,
      price_calc: calc ?? "machine",
      second_side: ssOn,
      second_side_price_pct: ssPct,
      income_account: ov.income_account,
      override_applied: ov.found,
      override_fields: ov.applied,
      price: null,
      total: null,
      unit_price: null,
      first_side_price: null,
      warnings
    };
  }
  const secondPrice = ssOn ? round2(firstSide * (ssPct / 100)) : 0;
  const price = round2(firstSide + secondPrice);
  const unitPrice = quantity > 0 ? round4(price / quantity) : round4(price);
  return {
    priced: true,
    machine_id: m.id,
    machine_name: m.name,
    machine_active: true,
    part_id: ov.part_id,
    quantity,
    run_hours: runHours,
    cost: use,
    base_cost: use.total,
    margin,
    price_calc: calc ?? "machine",
    price_source: priceSource,
    first_side_price: round2(firstSide),
    second_side: ssOn,
    second_side_price_pct: ssOn ? ssPct : 0,
    second_side_price: secondPrice,
    price,
    total: price,
    unit_price: unitPrice,
    income_account: ov.income_account,
    disposable_cost_per_unit: use.disposable_cost_per_unit,
    override_applied: ov.found,
    override_fields: ov.applied,
    warnings
  };
}
export {
  DEFAULT_SECOND_SIDE_PCT,
  PRICE_CALC_TOKENS,
  applyMachineMultipliers,
  machinePartOverride,
  machineUseCost,
  normalizeMachine,
  priceMachineStep,
  round2,
  round4
};
