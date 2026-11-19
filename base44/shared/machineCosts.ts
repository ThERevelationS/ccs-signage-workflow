// Shared machine cost model — pure, deterministic, zero entity/io access.
//
// Importable by Deno-style base44 functions AND the Vite frontend: no node:*,
// no npm:*, no imports at all. Callers hand the model plain Machine-like row
// objects (plus optional margin-chart records the caller already loaded) and
// get back fully-traced cost / price breakdowns.
//
// Entity contract (Machine.jsonc — verified against the schema):
//   name, machine_type ('roll_fed'|'sheet_fed'|'other', free-form), status
//   ('active'|'inactive'; blank = active), cost_per_hour ($/runtime hour),
//   profiles [{name, speed_settings}], disposable_cost_per_unit ($/unit),
//   setup_cost (flat $/job), setup_minutes (billed at machine rate),
//   labor_pct (0-100, % of RUN time requiring paid operator labor),
//   weighted_multiplier (complexity weight applied BEFORE margin),
//   margin_chart_id (ref to a PricingTemplate-like chart record),
//   income_account, description.
//
// Tolerated extras the schema does not declare (read when present, never
// required — "dangling" fields the admin may persist through other modules):
//   setup_billed          boolean; when false the setup MINUTES charge is
//                         skipped (flat setup_cost still applies). Default
//                         true — Machine.jsonc documents setup_minutes as
//                         "billed at the machine rate each time the machine
//                         is used".
//   setup_hours           explicit setup hours; wins over setup_minutes/60.
//   labor_rate_per_hour   operator labor $ rate; default = cost_per_hour.
//   margin_mode           'margin' | 'markup' — the machine-level default
//                         basis for margin-chart percentages (see
//                         applyMachineMultipliers for full precedence).
//   margin_chart          embedded chart object (or bare bracket array);
//                         margin_chart_id stays the persisted reference —
//                         when only the id is present the caller must load
//                         and pass the record (opts.margin_chart).
//   price_calc            machine-level default pricing mode:
//                         'margin'|'markup'|'cost_plus'|'fixed'|'machine'.
//   fixed_price           unit sell price for price_calc 'fixed'.
//   second_side_price_pct machine-level default % of the first-side SELL
//                         price charged for the second side (duplex work).
//   part_overrides        per-part overrides — array of
//                         {part_id, disposable|disposable_cost_per_unit,
//                          income_account, price_calc, second_side_price_pct,
//                          fixed_price, margin_mode, margin_chart} or a map
//                         keyed by part id.
//
// MachineRate-family aliases (Machine "generalizes the narrower MachineRate
// pricing rows" — normalizeMachine understands the legacy spellings so rows
// adapted from either registry behave identically):
//   runtime_rate_per_hour | rate_per_hour | hourly_rate  -> cost_per_hour
//   setup_fee | flat_setup_cost                          -> setup_cost
//   setup_time_minutes | setup_mins                      -> setup_minutes
//   disposable_per_unit | consumable_cost_per_unit       -> disposable_cost_per_unit
//   labor_percent | operator_labor_pct                   -> labor_pct
//   multiplier | complexity_multiplier | difficulty_multiplier -> weighted_multiplier
//   pricing_template_id | margin_template_id             -> margin_chart_id
//
// Money semantics mirror src/components/pricing/pricingEngine.js and
// base44/shared/pricingEngine.ts: money figures round to cents (round2),
// unit prices to 4 decimals (round4). markup_pct-style values are PERCENT
// over cost (50 = cost x 1.50); margin_pct-style values are gross-margin
// percents (50 = cost / 0.50).

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normStr = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export const round2 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 100) / 100;
export const round4 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 10000) / 10000;

// Number(null) === 0 and Number('') === 0 are finite — absent-looking values
// must NOT win the "first finite" slot, so skip null/undefined/blank strings
// before the coercion check (booleans stay: Number(true)=1 is a real value).
const firstFinite = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const firstPresent = (...vals: unknown[]): unknown => {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return undefined;
};

const isObj = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Absent -> defaultValue; explicit false/'false'/'no'/'off'/0 -> false;
// anything else truthy -> true.
const boolWithDefault = (v: unknown, defaultValue: boolean): boolean => {
  if (v === undefined || v === null || v === '') return defaultValue;
  if (v === false || v === true) return v;
  const s = normStr(v);
  if (s === 'false' || s === 'no' || s === 'off' || s === '0') return false;
  if (s === 'true' || s === 'yes' || s === 'on' || s === '1') return true;
  return !!v;
};

// Second-side fallback: absent any configured percent, the second side sells
// at the same price as the first (100%) — no silent duplex discount.
export const DEFAULT_SECOND_SIDE_PCT = 100;

// --- Pricing-mode tokens ------------------------------------------------------
//
// 'margin'  sell = cost / (1 - pct/100)   (gross-margin basis)
// 'markup'  sell = cost * (1 + pct/100)   (cost-plus basis)
// 'fixed'   sell = fixed_price x qty      (pinned unit price; cost still
//                                        computed for margin analysis)
// 'machine' pricing follows the machine's default flow (no override).
export const PRICE_CALC_TOKENS: Record<string, string> = {
  margin: 'margin',
  gross_margin: 'margin',
  'gross-margin': 'margin',
  sell_margin: 'margin',
  margin_pct: 'margin',
  markup: 'markup',
  markup_pct: 'markup',
  cost_plus: 'markup',
  'cost-plus': 'markup',
  costplus: 'markup',
  fixed: 'fixed',
  fixed_price: 'fixed',
  'fixed-price': 'fixed',
  flat: 'fixed',
  machine: 'machine',
  default: 'machine',
};

const normalizePriceCalc = (v: unknown): string | null =>
  isObj(v) ? null : PRICE_CALC_TOKENS[normStr(v)] ?? null;

// Margin-basis tokens ('margin') vs markup-basis tokens ('markup'). Used by
// applyMachineMultipliers — 'fixed'/'machine' are meaningless there.
const normalizeMarginMode = (v: unknown): string | null => {
  const t = normalizePriceCalc(v);
  return t === 'margin' || t === 'markup' ? t : null;
};

// --- normalizeMachine -----------------------------------------------------------
//
// Validated Machine row: every numeric field coerced + defaulted, every
// tolerated alias collapsed onto the canonical name, flags derived
// (`active` from status, `setup_hours` from setup_minutes). Idempotent —
// re-normalizing a normalized row produces the same row. Non-object input
// returns null (callers guard with machine_found checks downstream).
export function normalizeMachine(raw: any): any {
  if (!isObj(raw)) return null;
  const warnings: string[] = [];

  const costPerHour = Math.max(0, num(
    firstPresent(raw.cost_per_hour, raw.runtime_rate_per_hour, raw.rate_per_hour, raw.hourly_rate, raw.rate),
  ));
  const setupCost = Math.max(0, num(firstPresent(raw.setup_cost, raw.setup_fee, raw.flat_setup_cost)));
  const setupMinutes = Math.max(0, num(
    firstPresent(raw.setup_minutes, raw.setup_time_minutes, raw.setup_mins),
  ));
  const explicitSetupHours = firstFinite(raw.setup_hours, raw.setup_time_hours);
  const setupHours = explicitSetupHours != null ? Math.max(0, explicitSetupHours) : setupMinutes / 60;

  let laborPct = num(firstPresent(raw.labor_pct, raw.labor_percent, raw.operator_labor_pct));
  if (laborPct < 0 || laborPct > 100) {
    warnings.push(`labor_pct ${laborPct} clamped to [0,100]`);
    laborPct = Math.min(100, Math.max(0, laborPct));
  }

  let weighted = firstFinite(raw.weighted_multiplier, raw.multiplier,
    raw.complexity_multiplier, raw.difficulty_multiplier);
  if (weighted == null) weighted = 1;
  if (weighted < 0) {
    warnings.push(`weighted_multiplier ${weighted} clamped to 0`);
    weighted = 0;
  }

  let secondSidePct = firstFinite(raw.second_side_price_pct, raw.secondSidePricePct,
    raw.second_side_pct, raw.duplex_price_pct);
  if (secondSidePct == null) secondSidePct = DEFAULT_SECOND_SIDE_PCT;
  if (secondSidePct < 0) {
    warnings.push(`second_side_price_pct ${secondSidePct} clamped to 0`);
    secondSidePct = 0;
  }

  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : [])
    .filter((p: any) => isObj(p))
    .map((p: any) => ({
      ...p,
      name: String(p.name ?? ''),
      speed_settings: isObj(p.speed_settings) ? p.speed_settings : {},
    }));

  const priceCalc = normalizePriceCalc(raw.price_calc ?? raw.priceCalc);
  if ((raw.price_calc ?? raw.priceCalc) != null && !priceCalc) {
    warnings.push(`unknown price_calc '${raw.price_calc ?? raw.priceCalc}' ignored`);
  }

  const status = String(raw.status ?? '').trim() || 'active';
  return {
    id: raw.id ?? raw.machine_id ?? null,
    name: String(raw.name ?? ''),
    machine_type: String(raw.machine_type ?? '').trim(),
    status,
    active: normStr(status) !== 'inactive',
    cost_per_hour: costPerHour,
    profiles,
    disposable_cost_per_unit: Math.max(0, num(firstPresent(
      raw.disposable_cost_per_unit, raw.disposable_per_unit, raw.consumable_cost_per_unit,
      raw.consumables_per_unit,
    ))),
    setup_cost: setupCost,
    setup_minutes: setupMinutes,
    setup_hours: setupHours,
    setup_billed: boolWithDefault(raw.setup_billed ?? raw.bill_setup_time, true),
    labor_pct: laborPct,
    labor_rate_per_hour: Math.max(0, num(
      firstFinite(raw.labor_rate_per_hour, raw.labor_rate, raw.operator_rate) ?? costPerHour,
    )),
    weighted_multiplier: weighted,
    margin_chart_id: raw.margin_chart_id ?? raw.pricing_template_id ?? raw.margin_template_id ?? null,
    margin_chart: raw.margin_chart ?? raw.marginChart,   // embedded chart (passthrough)
    margin_mode: normalizeMarginMode(raw.margin_mode ?? raw.marginMode),
    income_account: raw.income_account ?? raw.incomeAccount ?? '',
    price_calc: priceCalc && priceCalc !== 'machine' ? priceCalc : null,
    fixed_price: firstFinite(raw.fixed_price, raw.price_override, raw.override_price, raw.flat_price),
    second_side_price_pct: secondSidePct,
    part_overrides: raw.part_overrides ?? raw.machine_part_overrides ?? null,
    description: String(raw.description ?? ''),
    warnings,
    raw,
  };
}

// --- machineUseCost -------------------------------------------------------------
//
// COST of one machine use (no margin — pure cost stack):
//   run_cost        = cost_per_hour x run_hours
//   setup_cost      = setup_cost (flat $) + setup_hours x cost_per_hour
//                     (time charge only while setup_billed — default true)
//   disposable_cost = disposable_cost_per_unit x quantity
//   labor_cost      = run_hours x labor_pct/100 x labor_rate_per_hour
//                     (operator share of RUN time; rate defaults to
//                     cost_per_hour — labor_pct is "percent of machine run
//                     time that requires paid operator labor")
//   total           = run_cost + setup_cost + disposable_cost + labor_cost
//
// Inactive machines price nothing (Machine.jsonc: "Inactive machines are
// ignored by pricing") — a zeroed breakdown with inactive:true is returned.
// opts: run_hours|runtime_hours|hours, quantity|qty, setup_billed,
// setup_hours, setup_minutes, labor_rate|labor_rate_per_hour,
// disposable_cost_per_unit|disposable_per_unit.
export function machineUseCost({ machine, run_hours, runtime_hours, hours, quantity, qty,
  setup_billed, setup_hours, setup_minutes, labor_rate, labor_rate_per_hour,
  disposable_cost_per_unit, disposable_per_unit }: any = {}): any {
  const m = normalizeMachine(machine);
  if (!m) {
    return {
      machine_found: false, machine_id: null, machine_name: '', active: false,
      run_hours: 0, quantity: 0, cost_per_hour: 0,
      run_cost: 0, setup_cost: 0, setup_hours: 0, setup_billed: false,
      disposable_cost: 0, labor_cost: 0, labor_pct: 0, total: 0,
      breakdown: {}, warnings: ['machine row missing or not an object'],
    };
  }

  const runHours = Math.max(0, num(firstFinite(run_hours, runtime_hours, hours) ?? 0));
  const quantityN = Math.max(0, num(firstFinite(quantity, qty) ?? 0));

  const zero = (extra: any) => ({
    machine_found: true, machine_id: m.id, machine_name: m.name, active: m.active,
    run_hours: runHours, quantity: quantityN, cost_per_hour: m.cost_per_hour,
    run_cost: 0, setup_cost: 0, setup_hours: m.setup_hours, setup_billed: m.setup_billed,
    disposable_cost: 0, labor_cost: 0, labor_pct: m.labor_pct, total: 0,
    breakdown: {}, warnings: [...(m.warnings || [])], ...extra,
  });

  if (!m.active) return zero({ inactive: true, skipped_reason: 'inactive_machine' });

  const setupHours = Math.max(0, num(
    firstFinite(setup_hours) ?? (firstFinite(setup_minutes) != null
      ? (firstFinite(setup_minutes) as number) / 60
      : m.setup_hours),
  ));
  const billed = setup_billed !== undefined
    ? boolWithDefault(setup_billed, true)
    : m.setup_billed;
  const laborRate = Math.max(0, num(
    firstFinite(labor_rate, labor_rate_per_hour) ?? m.labor_rate_per_hour,
  ));
  const disposableRate = Math.max(0, num(
    firstFinite(disposable_cost_per_unit, disposable_per_unit) ?? m.disposable_cost_per_unit,
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
        total: round2(setupTotal),
      },
      disposable: { per_unit: disposableRate, qty: quantityN, cost: round2(disposableCost) },
      labor: { pct: m.labor_pct, hours: round4(laborHours), rate: laborRate, cost: round2(laborCost) },
      total: round2(total),
    },
    warnings: [...(m.warnings || [])],
  };
}

// --- Margin-chart resolution ----------------------------------------------------
//
// A margin chart is qty-bracketed margin/markup % rows — PricingTemplate-
// compatible (`breaks: [{qty, tier_markups:{<tier>: markup_pct}}]`) and plain
// row shapes ({qty|min_qty|min_quantity|quantity|break_qty|from_qty,
// margin_pct|margin|pct|percent|markup_pct|markup} or a tier_markups map).
// Highest qualifying bracket wins; a bracket with no/low qty threshold acts
// as the catch-all (min_qty defaults to 0 so a single flat-margin row covers
// every quantity). Rows without a resolvable percent never qualify.
//
// Which field drives margin-vs-markup basis — resolved in THIS order:
//   1. opts.margin_mode                 (caller / part-override intent)
//   2. machine.margin_mode              (Machine.margin_mode dangling field)
//   3. chart.margin_mode                (chart record field)
//   4. field-name inference             ('margin_pct'|'margin'|'pct'|'percent'
//                                        family  -> 'margin';
//                                        'markup_pct'|tier_markups -> 'markup')
//   5. 'margin'                         (the chart IS a margin chart — spec
//                                        default is cost/(1-margin))
const chartRows = (chart: any): any[] => {
  if (Array.isArray(chart)) return chart;
  if (!isObj(chart)) return [];
  const rows = chart.breaks ?? chart.rows ?? chart.margin_rows ?? chart.brackets ?? chart.tiers;
  return Array.isArray(rows) ? rows : [];
};

const bracketMinQty = (b: any): number =>
  num(firstFinite(b?.qty, b?.min_qty, b?.min_quantity, b?.quantity, b?.break_qty, b?.from_qty) ?? 0);

// tier_markups lookup: match the caller's customerTier by normalized key
// (tier_name / tier_number / id / name), then 'default'/'*', then — only when
// the map holds exactly one numeric value — that lone entry.
const tierMarkupsPct = (map: any, customerTier: unknown): number | null => {
  if (!isObj(map)) return null;
  const keys = new Set<string>();
  const add = (v: unknown) => { const k = normStr(v); if (k) keys.add(k); };
  if (isObj(customerTier)) {
    add(customerTier.tier_name); add(customerTier.tier_number);
    add(customerTier.id); add(customerTier.name);
  } else {
    add(customerTier);
  }
  for (const [k, v] of Object.entries(map)) {
    if (keys.has(normStr(k)) && Number.isFinite(Number(v))) return Number(v);
  }
  for (const fallback of ['default', '*']) {
    const hit = Object.entries(map).find(([k]) => normStr(k) === fallback);
    if (hit && Number.isFinite(Number(hit[1]))) return Number(hit[1]);
  }
  const numeric = Object.values(map).filter((v) => Number.isFinite(Number(v)));
  if (Object.keys(map).length === 1 && numeric.length === 1) return Number(numeric[0]);
  return null;
};

// Returns {pct, basisHint} — basisHint records which percent FIELD produced
// the value so precedence step 4 can infer margin vs markup.
const bracketPct = (b: any, customerTier: unknown): any => {
  const marginVal = firstFinite(b?.margin_pct, b?.margin, b?.pct, b?.percent, b?.gross_margin_pct);
  if (marginVal != null) return { pct: marginVal, basisHint: 'margin' };
  const markupVal = firstFinite(b?.markup_pct, b?.markup);
  if (markupVal != null) return { pct: markupVal, basisHint: 'markup' };
  const tierVal = tierMarkupsPct(b?.tier_markups ?? b?.tierMargins ?? b?.tiers, customerTier);
  if (tierVal != null) return { pct: tierVal, basisHint: 'markup' }; // PricingTemplate tier_markups are markup_pct
  return null;
};

const pickMarginBracket = (rows: any[], quantity: number, customerTier: unknown): any => {
  let pick: any = null;
  let pickQty = -Infinity;
  for (const b of rows) {
    if (!isObj(b)) continue;
    const hit = bracketPct(b, customerTier);
    if (!hit) continue;
    const bq = bracketMinQty(b);
    if (bq > quantity) continue;
    if (bq > pickQty) { pick = { bracket: b, ...hit, min_qty: bq }; pickQty = bq; }
  }
  return pick;
};

// --- applyMachineMultipliers ----------------------------------------------------
//
// cost -> sell price for one machine use:
//   weighted_cost = cost x weighted_multiplier   ("applied to this machine's
//                                                 computed cost before margin")
//   margin pick   = highest qualifying qty bracket in the resolved chart
//                   (opts.margin_chart > machine.margin_chart embedded;
//                   margin_chart_id alone stays unresolved — the caller must
//                   load the record)
//   'margin' mode price = weighted_cost / (1 - pct/100)   (pct >= 100 cannot
//                                                          price -> null)
//   'markup' mode price = weighted_cost * (1 + pct/100)
//
// `cost` accepts a number or a machineUseCost result (.total used).
// opts: quantity|qty, margin_chart|marginChart|chart, margin_mode,
// customer_tier|customerTier|tier.
export function applyMachineMultipliers(cost: any, machine: any, opts: any = {}): any {
  const baseCost = Math.max(0, num(isObj(cost) && Number.isFinite(Number(cost.total)) ? cost.total : cost));
  const m = normalizeMachine(machine);
  const warnings: string[] = [];
  const quantity = Math.max(0, num(firstFinite(opts.quantity, opts.qty) ?? 0));
  const customerTier = opts.customer_tier ?? opts.customerTier ?? opts.tier;

  if (!m) {
    return {
      machine_found: false, base_cost: round2(baseCost), weighted_multiplier: 1,
      weighted_cost: round2(baseCost), quantity, margin_pct: null, margin_mode: null,
      bracket: null, chart_id: null, chart_resolved: false,
      price: round2(baseCost), price_valid: true, margin_amount: 0,
      source: 'passthrough', applied: [], warnings: ['machine row missing or not an object'],
    };
  }
  warnings.push(...(m.warnings || []));

  const mult = m.weighted_multiplier;
  const weighted = baseCost * mult;
  const applied: any[] = [{ step: 'weighted_multiplier', multiplier: mult, before: round2(baseCost), after: round2(weighted) }];

  const chart = firstPresent(opts.margin_chart, opts.marginChart, opts.chart, m.margin_chart);
  const rows = chartRows(chart);
  const chartId = isObj(chart) ? (chart.id ?? chart.name ?? m.margin_chart_id ?? null)
    : m.margin_chart_id ?? null;
  const chartResolved = rows.length > 0;

  const modeHit = normalizeMarginMode(opts.margin_mode ?? opts.marginMode)
    ?? m.margin_mode
    ?? (isObj(chart) ? normalizeMarginMode(chart.margin_mode ?? chart.marginMode) : null);

  let pick: any = null;
  let pctSource = 'none';
  if (chartResolved) {
    pick = pickMarginBracket(rows, quantity, customerTier);
    if (pick) pctSource = 'bracket';
  }
  if (!pick && isObj(chart)) {
    // Chart-level default percent (no matching bracket / flat chart).
    const flat = bracketPct(chart, customerTier);
    if (flat) { pick = { bracket: null, ...flat, min_qty: 0 }; pctSource = 'chart_default'; }
  }

  const marginMode = modeHit ?? pick?.basisHint ?? 'margin';

  if (!pick || !Number.isFinite(Number(pick.pct))) {
    // No chart / no qualifying percent — weighted cost is the sell basis.
    if (m.margin_chart_id && !chartResolved) {
      warnings.push(`margin_chart_id '${m.margin_chart_id}' unresolved — pass the chart record via opts.margin_chart`);
    }
    return {
      machine_found: true, machine_id: m.id, base_cost: round2(baseCost),
      weighted_multiplier: mult, weighted_cost: round2(weighted), quantity,
      margin_pct: null, margin_mode: marginMode, bracket: null,
      chart_id: chartId, chart_resolved: chartResolved,
      price: round2(weighted), price_valid: true, margin_amount: 0,
      source: chartResolved ? 'weighted_multiplier' : (m.margin_chart_id ? 'unresolved_chart' : 'weighted_multiplier'),
      applied, warnings,
    };
  }

  const pct = num(pick.pct);
  let price: number | null;
  let valid = true;
  if (pct < 0) warnings.push(`negative margin pct ${pct} prices below cost`);
  if (marginMode === 'margin') {
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
      step: 'margin_chart', mode: marginMode, pct, min_qty: pick.min_qty,
      before: round2(weighted), after: round2(price),
    });
  }

  return {
    machine_found: true, machine_id: m.id,
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
    source: pctSource === 'chart_default' ? 'chart_default' : 'margin_chart',
    applied,
    warnings,
  };
}

// --- machinePartOverride ---------------------------------------------------------
//
// Per-part override merged OVER machine defaults. Sources (first hit wins):
//   machine.part_overrides as ARRAY  — entries matched on
//     part_id|partId|part|id|part_key|part_name vs the requested part
//   machine.part_overrides as MAP    — keyed directly by part id
// `partId` accepts a part id/key/name string or a part object
// ({id|part_id|part_key|part_name|name}).
//
// Merged keys (override value wins, machine default is the floor):
//   disposable_cost_per_unit  <- disposable | disposable_cost_per_unit |
//                                consumable_cost_per_unit
//   income_account            <- income_account | incomeAccount
//   price_calc                <- normalized 'margin'|'markup'|'fixed'|null
//                                ('machine'/'default' = no override)
//   second_side_price_pct     <- second_side_price_pct | secondSidePricePct |
//                                second_side_pct | duplex_price_pct
//   fixed_price               <- fixed_price | price_override |
//                                override_price | flat_price
//   margin_mode               <- normalized 'margin'|'markup'|null
//   margin_chart              <- passthrough embedded chart for this part
// `applied` lists the canonical keys the override actually supplied.
export function machinePartOverride(machine: any, partId: any): any {
  const m = normalizeMachine(machine);
  const warnings: string[] = [];
  const want = normStr(isObj(partId)
    ? firstPresent(partId.id, partId.part_id, partId.part_key, partId.part_name, partId.name)
    : partId);

  const container = m ? (m.part_overrides ?? null) : null;
  let entry: any = null;
  if (want && container) {
    if (Array.isArray(container)) {
      entry = container.find((e: any) => isObj(e) && normStr(
        firstPresent(e.part_id, e.partId, e.part, e.id, e.part_key, e.part_name, e.name),
      ) === want) ?? null;
    } else if (isObj(container)) {
      const direct = (container as any)[partId] ?? (container as any)[want];
      if (isObj(direct)) entry = direct;
      else {
        entry = Object.entries(container)
          .filter(([, v]) => isObj(v))
          .map(([k, v]: any) => (v.part_id === undefined && v.partId === undefined ? { part_id: k, ...v } : v))
          .find((e: any) => normStr(
            firstPresent(e.part_id, e.partId, e.part, e.id, e.part_key, e.part_name, e.name),
          ) === want) ?? null;
      }
    }
  }

  const o = isObj(entry) ? entry : {};
  const applied: string[] = [];
  const disposable = firstFinite(o.disposable, o.disposable_cost_per_unit, o.consumable_cost_per_unit);
  if (disposable != null) applied.push('disposable_cost_per_unit');
  const income = firstPresent(o.income_account, o.incomeAccount);
  if (income !== undefined) applied.push('income_account');
  const rawCalc = firstPresent(o.price_calc, o.priceCalc);
  const priceCalc = normalizePriceCalc(rawCalc);
  if (rawCalc !== undefined) {
    applied.push('price_calc');
    if (!priceCalc) warnings.push(`unknown price_calc '${rawCalc}' ignored`);
  }
  const ssPct = firstFinite(o.second_side_price_pct, o.secondSidePricePct, o.second_side_pct, o.duplex_price_pct);
  if (ssPct != null) applied.push('second_side_price_pct');
  const fixed = firstFinite(o.fixed_price, o.price_override, o.override_price, o.flat_price);
  if (fixed != null) applied.push('fixed_price');
  const rawMode = firstPresent(o.margin_mode, o.marginMode);
  const marginMode = normalizeMarginMode(rawMode);
  if (rawMode !== undefined && marginMode) applied.push('margin_mode');
  const partChart = firstPresent(o.margin_chart, o.marginChart);
  if (partChart !== undefined) applied.push('margin_chart');

  const resolvedCalc = priceCalc && priceCalc !== 'machine' ? priceCalc : null;
  return {
    part_id: want || null,
    found: !!entry,
    override: entry,
    applied,
    disposable_cost_per_unit: disposable != null ? Math.max(0, disposable) : (m?.disposable_cost_per_unit ?? 0),
    income_account: income !== undefined ? String(income) : (m?.income_account ?? ''),
    price_calc: resolvedCalc ?? m?.price_calc ?? null,
    second_side_price_pct: ssPct != null ? Math.max(0, ssPct) : (m?.second_side_price_pct ?? DEFAULT_SECOND_SIDE_PCT),
    fixed_price: fixed != null ? fixed : (m?.fixed_price ?? null),
    margin_mode: marginMode ?? m?.margin_mode ?? null,
    margin_chart: partChart !== undefined ? partChart : undefined,
    machine: m,
    warnings,
  };
}

// --- priceMachineStep -------------------------------------------------------------
//
// Full sell price of one machine step on one part:
//   use    = machineUseCost with the part's disposable override applied
//   mode   = merged price_calc: 'fixed' pins fixed_price x qty; 'margin' /
//            'markup' force the chart basis; default follows machine/chart.
//   sell   = applyMachineMultipliers(use.total, machine, {quantity, chart,
//            margin_mode, customer_tier})
//   second-side rule: when second_side is set the step charges
//            first_side + first_side x second_side_price_pct/100 — the
//            percent applies to the SELL price (post-margin), never to cost.
//            Precedence: second_side.price_pct (call arg object) >
//            opts.second_side_price_pct > part override >
//            machine.second_side_price_pct > DEFAULT_SECOND_SIDE_PCT (100).
//
// opts: machine, part (id string or part object), quantity|qty,
// run_hours|runtime_hours|hours, second_side (bool | {enabled|double_sided,
// price_pct|second_side_price_pct}), second_side_price_pct, margin_chart,
// margin_mode, customer_tier, setup_billed, setup_hours, setup_minutes,
// labor_rate, setup_cost passthrough fields.
export function priceMachineStep(input: any = {}): any {
  const m = normalizeMachine(input.machine);
  const quantity = Math.max(0, num(firstFinite(input.quantity, input.qty) ?? 0));
  const runHours = Math.max(0, num(firstFinite(input.run_hours, input.runtime_hours, input.hours) ?? 0));

  const pricedOut = (extra: any) => ({
    priced: false, machine_id: m?.id ?? null, machine_name: m?.name ?? '',
    machine_active: !!m?.active, part_id: null, quantity, run_hours: runHours,
    cost: null, base_cost: 0, margin: null, price_calc: null,
    first_side_price: 0, second_side: false, second_side_price_pct: 0,
    second_side_price: 0, price: 0, total: 0, unit_price: 0,
    income_account: '', override_applied: false, override_fields: [],
    warnings: [], ...extra,
  });

  if (!m) return pricedOut({ reason: 'no_machine', warnings: ['machine row missing or not an object'] });
  if (!m.active) return pricedOut({ reason: 'inactive_machine', machine_active: false, warnings: [...(m.warnings || [])] });

  const partId = isObj(input.part)
    ? firstPresent(input.part.id, input.part.part_id, input.part.part_key, input.part.part_name, input.part.name)
    : input.part;
  const ov = machinePartOverride(m, partId);

  const use = machineUseCost({
    machine: m,
    run_hours: runHours,
    quantity,
    setup_billed: input.setup_billed,
    setup_hours: input.setup_hours,
    setup_minutes: input.setup_minutes,
    labor_rate: input.labor_rate ?? input.labor_rate_per_hour,
    disposable_cost_per_unit: ov.disposable_cost_per_unit,
  });

  const warnings: string[] = [...(use.warnings || []), ...(ov.warnings || [])];

  // Second-side request: boolean flag, or an object carrying enabled/
  // double_sided plus an optional per-call price_pct.
  const ssArg = input.second_side;
  const ssOn = ssArg === true
    || normStr(ssArg) === 'true'
    || (isObj(ssArg) && (ssArg.enabled === true || ssArg.double_sided === true || boolWithDefault(ssArg.enabled, false)));
  const ssPct = Math.max(0, num(
    firstFinite(isObj(ssArg) ? ssArg.price_pct : null,
      isObj(ssArg) ? ssArg.second_side_price_pct : null,
      input.second_side_price_pct,
      ov.second_side_price_pct) ?? DEFAULT_SECOND_SIDE_PCT,
  ));

  const calc = ov.price_calc; // merged: part override > machine price_calc
  let firstSide: number | null = null;
  let margin: any = null;
  let priceSource: string | undefined;

  if (calc === 'fixed') {
    if (Number.isFinite(Number(ov.fixed_price))) {
      firstSide = round2(num(ov.fixed_price) * quantity);
      priceSource = 'fixed_price';
    } else {
      warnings.push("price_calc 'fixed' without finite fixed_price — fell back to chart/markup flow");
    }
  }
  if (firstSide == null) {
    margin = applyMachineMultipliers(use.total, m, {
      quantity,
      margin_chart: firstPresent(input.margin_chart, input.marginChart, ov.margin_chart, m.margin_chart),
      margin_mode: firstPresent(input.margin_mode, input.marginMode,
        (calc === 'margin' || calc === 'markup') ? calc : undefined, ov.margin_mode),
      customer_tier: input.customer_tier ?? input.customerTier ?? input.tier,
    });
    warnings.push(...(margin.warnings || []));
    firstSide = margin.price;
    priceSource = margin.source;
  }

  if (firstSide == null) {
    return {
      ...pricedOut({ reason: 'unpriceable_margin' }),
      machine_active: true, part_id: ov.part_id,
      cost: use, base_cost: use.total, margin,
      price_calc: calc ?? 'machine', second_side: ssOn,
      second_side_price_pct: ssPct, income_account: ov.income_account,
      override_applied: ov.found, override_fields: ov.applied,
      price: null, total: null, unit_price: null, first_side_price: null,
      warnings,
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
    price_calc: calc ?? 'machine',
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
    warnings,
  };
}
