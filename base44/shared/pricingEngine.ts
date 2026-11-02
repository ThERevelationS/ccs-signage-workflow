// Shared pricing engine — pure, deterministic, zero entity/io access.
//
// Importable by Deno-style base44 functions AND the Vite frontend: no node:*,
// no npm:*, no imports at all. Callers hand the engine plain row objects
// (PricingTierMatrix-like chart rows, part/machine override descriptors) and
// get back fully-traced price breakdowns.
//
// Pipeline (pricePart): cost base -> tier lookup -> markup/fixed/market unit
// price -> formula modifiers -> qty extension -> minimum charge -> setup fee
// -> tax -> total.
//
// Tier precedence (resolveTier) follows the CoreBridge section-8 chain —
// "customer tier -> part-specific tier/fixed -> machine override" — read as a
// base-to-override ladder: the global default is the base, each configured
// layer overrides the previous one, so the MOST SPECIFIC layer wins:
//
//   machine_override  (strongest: the machine the part runs on)
//   part_fixed        (explicit sell price pinned on the part)
//   part_tier         (part-bound tier ref / part qty chart / part markup)
//   customer_tier     (chart row pinning the customer's assigned tier)
//   global_default    (weakest: category/blank chart row, else defaultMarkupPct)
//
// WITHIN the two chart-row layers the winning row follows legacy
// matchSpecificity (src/components/pricing/pricingEngine.js resolveMatrixRow):
// cat+tier (3) > cat-only (2) > tier-only (1) > blank (0) — so a
// category-pinned default row still outranks a bare customer_tier row even
// though it lives in the "weaker" ladder layer (F-27 parity). Part/machine
// descriptors keep the strict ladder ordering above the chart.
//
// Money semantics mirror src/components/pricing/pricingEngine.js:
//   markup_pct is a PERCENT over cost (50 = cost x 1.50); market mode stores a
//   retail price minus a discount percent; per_unit_breaks are qty thresholds
//   {qty, unit_price} where the highest qualifying bracket wins (in market
//   mode a break only wins when it undercuts the market unit price).
//   Money figures round to cents (round2); unit prices to 4 decimals (round4).

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normStr = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export const round2 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 100) / 100;
export const round4 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 10000) / 10000;

// Weakest -> strongest. resolveTier walks this order for the OVERRIDE layers
// (part/machine); the two chart-row layers beneath them compete on legacy
// row specificity instead of raw layer order (see the header block above).
export const TIER_PRECEDENCE = Object.freeze([
  'global_default',
  'customer_tier',
  'part_tier',
  'part_fixed',
  'machine_override',
] as const);

export type TierSource = typeof TIER_PRECEDENCE[number];

export const PRICING_MODES = Object.freeze({
  MARKUP: 'markup',
  COST_PLUS: 'cost_plus',
  MARKET: 'market',
  // F-05 activation vocabulary: 'market_based' is the entity/admin spelling of
  // the same retail-minus-discount chart family the engine rows call 'market'
  // (PricingTemplate.market_based, GlobalPricingTier.rules[].market_based).
  // 'fixed' is a pinned unit sell price (part.fixed_price family).
  MARKET_BASED: 'market_based',
  FIXED: 'fixed',
} as const);

// --- Date windows (chart rows may carry effective_from / effective_to) --------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const toTime = (v: unknown, { endOfDay = false } = {}): number | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return endOfDay && DATE_ONLY.test(s) ? t + 86399999 : t;
};

const rowIsActive = (row: any): boolean => normStr(row?.status ?? 'active') !== 'inactive';

export function rowIsEffective(row: any, now: unknown = new Date()): boolean {
  const t = now instanceof Date ? now.getTime() : toTime(now);
  const at = Number.isFinite(t) ? (t as number) : Date.now();
  const from = toTime(row?.effective_from);
  const to = toTime(row?.effective_to, { endOfDay: true });
  if (from != null && at < from) return false;
  if (to != null && at > to) return false;
  return true;
}

// --- Tier key matching ---------------------------------------------------------

// A customerTier may arrive as a MarkupTier-like record ({id, tier_name,
// tier_number, name}) or a bare string/number. Rows match on whichever of
// tier_name / tier_number / id / name the admin typed into customer_tier.
const tierKeySet = (customerTier: unknown): Set<string> => {
  const keys = new Set<string>();
  const add = (v: unknown) => {
    const k = normStr(v);
    if (k) keys.add(k);
  };
  if (customerTier && typeof customerTier === 'object') {
    const t: any = customerTier;
    add(t.tier_name);
    add(t.tier_number);
    add(t.id);
    add(t.name);
  } else {
    add(customerTier);
  }
  return keys;
};

const rowPinsTier = (row: any, tierKeys: Set<string>): boolean =>
  !!normStr(row?.customer_tier) && tierKeys.has(normStr(row?.customer_tier));

const rowFitsCategory = (row: any, category: unknown): boolean =>
  !normStr(row?.category) || normStr(row?.category) === normStr(category);

// Deterministic tie-break inside a match bucket: most recent effective_from,
// then most recent updated_date, then lowest id.
const newerRow = (a: any, b: any): any => {
  if (!b) return a;
  const aFrom = toTime(a?.effective_from) ?? -Infinity;
  const bFrom = toTime(b?.effective_from) ?? -Infinity;
  if (aFrom !== bFrom) return aFrom > bFrom ? a : b;
  const aUp = toTime(a?.updated_date) ?? -Infinity;
  const bUp = toTime(b?.updated_date) ?? -Infinity;
  if (aUp !== bUp) return aUp > bUp ? a : b;
  return String(a?.id || '') <= String(b?.id || '') ? a : b;
};

// --- Qty-break charts -----------------------------------------------------------

// The bracket with the highest qualifying `qty` threshold wins.
// opts.interpolate === true switches to linear interpolation between bracket
// points (see interpolateUnitBreak). With opts absent/false the pick is
// byte-for-byte the legacy bracket pick — callers never interpolate unless a
// chart explicitly opts in (interpolate_breaks / break_interpolation:'linear').
export function pickUnitBreak(breaks: any, qty: unknown, opts: any = {}): any {
  const q = num(qty);
  if (!Array.isArray(breaks) || q <= 0) return null;
  if (opts && opts.interpolate === true) return interpolateUnitBreak(breaks, q);
  let pick: any = null;
  for (const b of breaks) {
    const bq = num(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > q) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    if (!pick || bq > num(pick.qty)) pick = b;
  }
  return pick;
}

// Valid brackets ({qty>0, finite unit_price}) sorted ascending by qty with
// duplicate thresholds collapsed — the first-declared bracket wins its slot.
// This is the lattice interpolation walks.
const sortedUnitBreaks = (breaks: any): any[] => {
  const list: any[] = [];
  for (const b of Array.isArray(breaks) ? breaks : []) {
    const bq = num(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    list.push(b);
  }
  list.sort((a: any, b: any) => num(a.qty) - num(b.qty));
  return list.filter((b: any, i: number) => i === 0 || num(b.qty) !== num(list[i - 1].qty));
};

// Linear interpolation between neighboring bracket points (F-04 — CoreBridge
// interpolated qty-break charts). Semantics:
//   qty in [lo.qty, hi.qty): unit_price = lo.p + (hi.p - lo.p) * t where
//     t = (qty - lo.qty) / (hi.qty - lo.qty); result rounds to 4 decimals
//     (round4 — same precision as every engine unit price).
//   qty below the FIRST bracket  -> null (never extrapolate below the chart;
//     the caller falls back to markup/market exactly like a missed break).
//   qty exactly ON a bracket qty -> that bracket object verbatim.
//   qty at/above the TOP bracket -> top bracket verbatim (clamp — the best
//     published volume price, never an extrapolation off the chart's end).
//   0 or 1 valid brackets        -> plain bracket-pick semantics.
// Mid-bracket hits return a synthetic bracket
//   {qty: lower.qty, unit_price, interpolated: true, at_qty: <requested>,
//    between: [lowerBracket, upperBracket]}
// so a downstream `breakApplied` audit can show the interpolation anchors.
export function interpolateUnitBreak(breaks: any, qty: unknown): any {
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
    between: [lower, upper],
  };
}

// --- Formula modifiers -----------------------------------------------------------

// Ordered unit-price adjustments, applied left-to-right ({type, value}):
//   add_pct  price = price x (1 + value/100)   (negative discounts)
//   mul      price = price x value
//   add_flat price = price + value
//   min      price = max(price, value)         (unit floor)
//   max      price = min(price, value)         (unit cap)
// Unknown types / non-finite values are skipped; price can never go below 0.
export function applyFormulaModifiers(unitPrice: unknown, modifiers: any): { unitPrice: number; applied: any[] } {
  let price = num(unitPrice);
  const applied: any[] = [];
  for (const m of Array.isArray(modifiers) ? modifiers : []) {
    const type = normStr(m?.type);
    const value = Number(m?.value);
    if (!Number.isFinite(value)) continue;
    const before = price;
    if (type === 'add_pct') price = price * (1 + value / 100);
    else if (type === 'mul') price = price * value;
    else if (type === 'add_flat') price = price + value;
    else if (type === 'min') price = Math.max(price, value);
    else if (type === 'max') price = Math.min(price, value);
    else continue;
    price = Math.max(0, price);
    applied.push({ type, value, before: round4(before), after: round4(price) });
  }
  return { unitPrice: round4(price), applied };
}

// --- Rule normalization ------------------------------------------------------------
//
// Every pricing layer resolves to one normalized rule:
//   kind: 'fixed' | 'markup' | 'market' | 'breaks'
//   fixedPrice?         unit sell price (fixed)
//   markupPct?          percent over unit cost (markup; also breaks fallback)
//   marketRetail?       market list price (market)
//   marketDiscountPct?  percent off retail (market)
//   unitBreaks?         [{qty, unit_price}] qty-break chart
//   minimumCharge?      extension floor
//   formulaModifiers?   ordered unit-price adjustments
//   ref?                originating record/descriptor (echoed for audit)

const marketKind = (row: any): boolean => {
  const pm = normStr(row?.pricing_mode);
  // 'market' is the engine token; 'market_based' is the entity/admin spelling
  // of the same chart family — both require a POSITIVE finite market_retail.
  // Legacy parity (F-27): retail <= 0 / non-finite is treated as absent — the
  // row falls back to its markup path exactly like resolveEffectivePrice's
  // `retail > 0` gate (pricingEngine.js).
  return (pm === PRICING_MODES.MARKET || pm === PRICING_MODES.MARKET_BASED)
    && Number.isFinite(Number(row?.market_retail)) && Number(row?.market_retail) > 0;
};

// A chart row / override descriptor opts its qty-break chart into interpolated
// pricing via interpolate_breaks (boolean | 'true' | 'linear'), the camelCase
// twins interpolateBreaks/interpolate, or break_interpolation:'linear'.
// Off by default — every unflagged chart keeps exact bracket-pick semantics.
const wantsInterpolatedBreaks = (src: any): boolean => {
  if (!src || typeof src !== 'object') return false;
  if (normStr(src.break_interpolation) === 'linear') return true;
  for (const f of ['interpolate_breaks', 'interpolateBreaks', 'interpolate']) {
    const v = (src as any)[f];
    if (v === true || normStr(v) === 'true' || normStr(v) === 'linear') return true;
  }
  return false;
};

function ruleFromChartRow(row: any): any {
  return {
    kind: marketKind(row) ? 'market' : 'markup',
    markupPct: num(row?.markup_pct),
    marketRetail: marketKind(row) ? num(row?.market_retail) : undefined,
    marketDiscountPct: marketKind(row) ? num(row?.market_discount_pct) : undefined,
    unitBreaks: Array.isArray(row?.per_unit_breaks) ? row.per_unit_breaks : undefined,
    interpolateBreaks: wantsInterpolatedBreaks(row) || undefined,
    minimumCharge: Number.isFinite(Number(row?.minimum_charge)) ? num(row.minimum_charge) : undefined,
    formulaModifiers: Array.isArray(row?.formula_modifiers) ? row.formula_modifiers : undefined,
    ref: row,
  };
}

const firstFinite = (...vals: unknown[]): number | null => {
  for (const v of vals) if (Number.isFinite(Number(v))) return Number(v);
  return null;
};

// Candidate rule from a part- or machine-shaped override descriptor.
// Within a layer: fixed_price > tier_ref > per_unit_breaks > pricing_mode
// 'market' > markup_pct. Returns null when the descriptor overrides nothing.
function overrideRule(source: any, tierRules: any[]): any {
  if (!source || typeof source !== 'object') return null;

  const fixed = firstFinite(source.fixed_price, source.price_override, source.override_price);
  if (fixed != null && fixed > 0) {
    return {
      kind: 'fixed',
      fixedPrice: fixed,
      minimumCharge: firstFinite(source.minimum_charge) ?? undefined,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : undefined,
      ref: source,
    };
  }

  const tierRef = source.tier_ref ?? source.tier ?? source.tier_name;
  if (tierRef != null && normStr(tierRef)) {
    const wanted = normStr(typeof tierRef === 'object' ? (tierRef as any).name ?? (tierRef as any).id : tierRef);
    const row = (Array.isArray(tierRules) ? tierRules : []).find(
      (r: any) => r && rowIsActive(r) && (normStr(r.name) === wanted || normStr(r.id) === wanted),
    );
    if (row) return ruleFromChartRow(row);
    // A dangling tier ref must NOT silently fall through to weaker layers —
    // report it as an unpriced hit so the caller sees the misconfiguration.
    return { kind: 'markup', markupPct: 0, ref: source, danglingTierRef: String(wanted) };
  }

  const breaks = Array.isArray(source.per_unit_breaks) ? source.per_unit_breaks
    : Array.isArray(source.unit_breaks) ? source.unit_breaks
    : null;
  if (breaks && breaks.length) {
    return {
      kind: 'breaks',
      unitBreaks: breaks,
      interpolateBreaks: wantsInterpolatedBreaks(source) || undefined,
      markupPct: firstFinite(source.markup_pct) ?? undefined,
      minimumCharge: firstFinite(source.minimum_charge) ?? undefined,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : undefined,
      ref: source,
    };
  }

  if (marketKind(source)) {
    return {
      kind: 'market',
      marketRetail: num(source.market_retail),
      marketDiscountPct: num(source.market_discount_pct),
      unitBreaks: Array.isArray(source.per_unit_breaks) ? source.per_unit_breaks : undefined,
      interpolateBreaks: wantsInterpolatedBreaks(source) || undefined,
      minimumCharge: firstFinite(source.minimum_charge) ?? undefined,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : undefined,
      ref: source,
    };
  }

  const markup = firstFinite(source.markup_pct);
  if (markup != null && markup !== 0) {
    return {
      kind: 'markup',
      markupPct: markup,
      interpolateBreaks: wantsInterpolatedBreaks(source) || undefined,
      minimumCharge: firstFinite(source.minimum_charge) ?? undefined,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : undefined,
      ref: source,
    };
  }

  return null;
}

// --- resolveTier -------------------------------------------------------------------
//
// context:
//   customerTier      assigned tier (string | number | MarkupTier-like record)
//   category          line category key (chart rows may pin a category)
//   tierRules         pricing chart rows (PricingTierMatrix-like)
//   part              part-level override descriptor
//   machine           machine-level override descriptor
//   defaultMarkupPct  shop fallback percent over cost
//   now               override for effective-window checks (tests)
//
// Returns { source, rule, layer, trace } where trace walks the ladder
// base -> override and marks which layers were hit and which one won.
export function resolveTier({
  customerTier = null,
  category = '',
  tierRules = [],
  part = null,
  machine = null,
  defaultMarkupPct = 0,
  now = undefined,
}: any = {}): any {
  const rules = Array.isArray(tierRules) ? tierRules : [];
  const tierKeys = tierKeySet(customerTier);
  const eligible = rules.filter((r: any) => r && rowIsActive(r) && rowIsEffective(r, now) && rowFitsCategory(r, category));

  // Customer-tier layer: rows that PIN this customer's tier.
  // category+tier beats tier-only inside the layer.
  let tierRow: any = null;
  let tierRowScoped = false;
  for (const row of eligible) {
    if (!rowPinsTier(row, tierKeys)) continue;
    const scoped = !!normStr(row.category);
    if (!tierRow || (scoped && !tierRowScoped) || scoped === tierRowScoped) {
      if (!tierRow || (scoped && !tierRowScoped)) { tierRow = row; tierRowScoped = scoped; }
      else tierRow = newerRow(row, tierRow);
    }
  }

  // Global-default layer: rows that pin NO tier — category rows beat blank
  // rows; failing both, the shop defaultMarkupPct is the implicit rule.
  let catRow: any = null;
  let blankRow: any = null;
  for (const row of eligible) {
    if (normStr(row.customer_tier)) continue;
    if (normStr(row.category)) catRow = newerRow(row, catRow);
    else blankRow = newerRow(row, blankRow);
  }

  // Part layer: fixed price outranks the part's own tier/chart/markup.
  const partRule = overrideRule(part, rules);
  const partSource = partRule?.kind === 'fixed' ? 'part_fixed' : 'part_tier';

  // Machine layer: anything the machine descriptor overrides wins outright.
  const machineRule = overrideRule(machine, rules);

  const defaultRule = catRow || blankRow
    ? ruleFromChartRow(catRow || blankRow)
    : { kind: 'markup', markupPct: num(defaultMarkupPct), ref: null, implicit: true };

  const ladder: any[] = [
    { layer: 'global_default', source: 'global_default', rule: defaultRule, hit: true,
      detail: catRow ? 'category_row' : blankRow ? 'blank_row' : 'default_markup_pct' },
    { layer: 'customer_tier', source: 'customer_tier', rule: tierRow ? ruleFromChartRow(tierRow) : null,
      hit: !!tierRow, detail: tierRow ? (tierRowScoped ? 'category+tier' : 'tier') : 'no tier row' },
    { layer: 'part', source: partSource, rule: partRule, hit: !!partRule,
      detail: partRule ? partRule.kind : 'no part override' },
    { layer: 'machine', source: 'machine_override', rule: machineRule, hit: !!machineRule,
      detail: machineRule ? machineRule.kind : 'no machine override' },
  ];

  // Chart-row layers compete on legacy matchSpecificity, NOT ladder order
  // (F-27 parity with resolveMatrixRow): cat+tier (3) > cat-only (2) >
  // tier-only (1) > blank (0). Scores never tie across layers (tier adds 1,
  // category adds 2), and each layer's row is already its best by the shared
  // tie-break (scoped > unscoped, then effective_from -> updated_date -> id).
  // The implicit defaultMarkupPct rule only wins when no chart row matched.
  const tierRowSpec = tierRow ? (tierRowScoped ? 3 : 1) : -1;
  const defaultRowSpec = catRow ? 2 : blankRow ? 0 : -1;
  let winner = tierRowSpec > defaultRowSpec ? ladder[1] : ladder[0];
  // Part/machine descriptors still override the winning chart layer in order.
  for (const step of ladder.slice(2)) if (step.hit && step.rule) winner = step;

  return {
    source: winner.source as TierSource,
    layer: winner.layer,
    rule: winner.rule,
    matchedRow: winner.rule?.ref ?? null,
    trace: ladder.map((step) => ({
      layer: step.layer,
      source: step.source,
      hit: step.hit,
      won: step === winner,
      detail: step.detail,
    })),
  };
}

// --- pricePart ---------------------------------------------------------------------
//
// input:
//   label, category, qty, unitCost (internal cost base per pricing unit),
//   pricingUnit (echo only — caller measures qty in pricing units),
//   customerTier, tierRules, part, machine, defaultMarkupPct  -> resolveTier
//   setupFee        flat dollars added after the minimum floor
//   minimumCharge   caller-side floor; combined with the winning rule's own
//                   minimum_charge (the higher floor wins)
//   taxable         false exempts the whole line (incl. setup fee) from tax
//   taxPercent      percent applied to (extension + setupFee) when taxable
//   modifiers       caller-level formula modifiers (run after rule modifiers)
//   now             effective-window override
//
// Returns a fully-traced breakdown. Never throws on bad numbers — non-finite
// inputs coerce to 0. Legacy parity (F-27): qty/unitCost pass through
// UNCLAMPED exactly like pricingEngine.js num() — a negative qty or cost
// yields a negative extension (minimums still never fire on extension <= 0).
export function pricePart(input: any = {}): any {
  const qty = num(input.qty ?? input.quantity, 0);
  const unitCost = num(input.unitCost ?? input.cost ?? input.costBase);
  const tier = resolveTier(input);
  const rule = tier.rule || { kind: 'markup', markupPct: 0 };

  let unitPrice = 0;
  let priceSource = 'cost_passthrough';
  let breakApplied: any = null;
  let market: any = null;

  const breaks = Array.isArray(rule.unitBreaks) ? rule.unitBreaks : null;
  // Interpolated break charts opt in via rule.interpolateBreaks (matrix row /
  // descriptor flag) — unflagged charts keep exact bracket-pick semantics.
  const brk = breaks ? pickUnitBreak(breaks, qty, { interpolate: rule.interpolateBreaks === true }) : null;

  if (rule.kind === 'fixed') {
    unitPrice = num(rule.fixedPrice);
    priceSource = 'fixed_price';
  } else if (rule.kind === 'market') {
    const retail = num(rule.marketRetail);
    const discountPct = num(rule.marketDiscountPct);
    const marketUnit = Math.max(0, retail * (1 - discountPct / 100));
    // A volume break must actually beat the market unit price to win.
    if (brk && num(brk.unit_price) < marketUnit) {
      unitPrice = num(brk.unit_price);
      priceSource = 'qty_break';
      breakApplied = brk;
    } else {
      unitPrice = marketUnit;
      priceSource = 'market';
    }
    market = { marketRetail: retail, marketDiscountPct: discountPct, marketUnit: round4(marketUnit) };
  } else if (rule.kind === 'breaks') {
    if (brk) {
      unitPrice = num(brk.unit_price);
      priceSource = 'qty_break';
      breakApplied = brk;
    } else {
      // No qualifying bracket — fall back to the descriptor's markup (or cost).
      unitPrice = unitCost * (1 + num(rule.markupPct) / 100);
      priceSource = Number.isFinite(Number(rule.markupPct)) ? 'markup' : 'cost_passthrough';
    }
  } else {
    // markup: a qualifying qty break beats the markup chart outright.
    if (brk) {
      unitPrice = num(brk.unit_price);
      priceSource = 'qty_break';
      breakApplied = brk;
    } else {
      unitPrice = unitCost * (1 + num(rule.markupPct) / 100);
      priceSource = 'markup';
    }
  }

  const baseUnitPrice = unitPrice;
  const modResult = applyFormulaModifiers(unitPrice, [
    ...(Array.isArray(rule.formulaModifiers) ? rule.formulaModifiers : []),
    ...(Array.isArray(input.modifiers) ? input.modifiers : []),
  ]);
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
    label: String(input.label ?? ''),
    category: String(input.category ?? ''),
    pricingUnit: String(input.pricingUnit ?? input.pricing_unit ?? 'each'),
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
    danglingTierRef: rule.danglingTierRef || null,
  };
}

// --- priceLines ----------------------------------------------------------------------
//
// Convenience roll-up: pricePart over an array of lines sharing the same
// context (customerTier, tierRules, taxPercent...). Per-line `part`, `machine`,
// `taxable`, `setupFee`, `minimumCharge`, `modifiers` stay on each line object.
export function priceLines({ lines = [], ...shared }: any = {}): any {
  const priced = (Array.isArray(lines) ? lines : []).map((line: any, index: number) =>
    pricePart({ label: line?.label ?? `Line ${index + 1}`, ...shared, ...line }));

  const extended = round2(priced.reduce((s: number, l: any) => s + l.extended, 0));
  const setupFees = round2(priced.reduce((s: number, l: any) => s + l.setupFee, 0));
  const subtotal = round2(priced.reduce((s: number, l: any) => s + l.subtotal, 0));
  const tax = round2(priced.reduce((s: number, l: any) => s + l.tax, 0));
  const total = round2(priced.reduce((s: number, l: any) => s + l.total, 0));

  return {
    lines: priced,
    extended,
    setupFees,
    subtotal,
    tax,
    total,
    minimumsApplied: priced
      .map((l: any, index: number) => (l.minimumApplied
        ? { index, label: l.label, extension: l.extension, minimumCharge: l.minimumCharge, source: l.tier.source }
        : null))
      .filter(Boolean),
  };
}

// --- Entity activation layer (F-04 / F-05) -------------------------------------
//
// The engine resolves plain chart-row objects; this section bridges persisted
// Base44 entity shapes to those rows. Still pure/deterministic — no io.
//
// PricingTierMatrix.jsonc field reality (verified against the schema):
//   name, status ('active'|'inactive'), customer_tier (MarkupTier.tier_name /
//   tier_number / record id; blank = every tier), category (MarkupCategory
//   .category_key; blank = every category), markup_pct, minimum_charge,
//   per_unit_breaks [{qty, unit_price}], effective_from / effective_to
//   (YYYY-MM-DD; `to` inclusive through end of day), updated_by, updated_note,
//   sort_order — plus tolerated extras the engine understands when present:
//   pricing_mode ('market'|'market_based'), market_retail,
//   market_discount_pct, formula_modifiers, interpolate_breaks.
//
// matrixRowToRule normalizes one row: tolerated aliases collapse onto the
// canonical engine fields (unit_breaks / qty_breaks -> per_unit_breaks; bracket
// {price|unit_price} and {qty|min_qty|quantity} -> {qty, unit_price};
// 'market-based' -> 'market_based'; retail / retail_price -> market_retail;
// discount_pct -> market_discount_pct; any interpolation spelling ->
// interpolate_breaks:true). Break charts are sanitized: non-positive qty and
// non-finite price brackets drop; a chart emptied that way is removed entirely
// so it can't mask the markup path. NOTE `breaks` is deliberately NOT aliased —
// PricingTemplate.breaks carries {qty, tier_markups} which is a different
// chart, not a {qty, unit_price} list.
//
// matrixRowsToRules applies the row gate the entity contract requires —
// status:'inactive' rows and rows outside their effective_from/effective_to
// window (checked at `now`) never reach the resolver — then maps each
// survivor through matrixRowToRule. Output rows are drop-in `tierRules` for
// resolveTier / pricePart (which re-check status + window themselves, so a
// stale adapted list still can't price an expired row).
export function matrixRowToRule(row: any, opts: any = {}): any {
  if (!row || typeof row !== 'object') return null;
  const out: any = { ...row };

  // Canonical status token: anything but 'inactive' is live (blank = active).
  out.status = normStr(row.status) === 'inactive' ? 'inactive' : 'active';

  const rawBreaks = Array.isArray(row.per_unit_breaks) ? row.per_unit_breaks
    : Array.isArray(row.unit_breaks) ? row.unit_breaks
    : Array.isArray(row.qty_breaks) ? row.qty_breaks
    : null;
  if (rawBreaks) {
    const clean = rawBreaks
      .map((b: any) => ({
        qty: num(b?.qty ?? b?.min_qty ?? b?.quantity, NaN),
        unit_price: num(b?.unit_price ?? b?.price, NaN),
      }))
      .filter((b: any) => Number.isFinite(b.qty) && b.qty > 0 && Number.isFinite(b.unit_price));
    if (clean.length) out.per_unit_breaks = clean;
    else delete out.per_unit_breaks;
  }

  if (normStr(out.pricing_mode) === 'market-based') out.pricing_mode = 'market_based';
  const retail = firstFinite(row.market_retail, row.retail_price, row.retail);
  if (retail != null) out.market_retail = retail;
  const discount = firstFinite(row.market_discount_pct, row.discount_pct);
  if (discount != null) out.market_discount_pct = discount;

  if (wantsInterpolatedBreaks(row) || opts.interpolateBreaks === true) {
    out.interpolate_breaks = true;
  }
  return out;
}

export function matrixRowsToRules(rows: any, opts: any = {}): any[] {
  const now = opts.now ?? new Date();
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.rows) ? rows.rows : [];
  const out: any[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    if (!rowIsActive(row)) continue;          // status:'inactive' never competes
    if (!rowIsEffective(row, now)) continue;  // effective_from/to window (entity field names)
    out.push(matrixRowToRule(row, opts));
  }
  return out;
}

// --- resolvePricingMode -----------------------------------------------------------
//
// Which pricing FAMILY a part prices under (F-05):
//   'cost_plus'    markup over unit cost — includes the %-tier matrix chart;
//                  PricingMode.active_mode 'tier' maps here.
//   'market_based' retail minus discount — PricingTemplate.market_based /
//                  GlobalPricingTier rule market_based / market_retail data.
//   'fixed'        pinned unit sell price (fixed_price / price_override family).
//
// Precedence: part > template > globalDefault > 'cost_plus' fallback.
// Within each layer: explicit mode token > fixed_price > bound tier_ref's
// chart row > market signals — mirroring overrideRule's own precedence.
//   { part, template, globalDefault, tierRules }
//   part          part-level descriptor. Field-name trap: inventory entities
//                 use `pricing_mode` for UNIT enums ('per_piece', 'per_roll'…)
//                 — unrecognized tokens are skipped, never guessed as a family.
//   template      PricingTemplate-like ({market_based, breaks, ...}) or any
//                 descriptor carrying the same signals.
//   globalDefault PricingMode entity ({active_mode:'tier'|'cost_plus'}),
//                 a settings-like object, or a bare mode string.
//   tierRules     optional chart rows so a bound tier_ref resolves to its row's
//                 family (a dangling ref resolves nothing — falls through).
// Returns {mode, source:'part'|'template'|'global'|'default', raw, via}.

const MODE_TOKENS: Record<string, string> = {
  fixed: PRICING_MODES.FIXED,
  fixed_price: PRICING_MODES.FIXED,
  flat: PRICING_MODES.FIXED,
  market: PRICING_MODES.MARKET_BASED,
  market_based: PRICING_MODES.MARKET_BASED,
  'market-based': PRICING_MODES.MARKET_BASED,
  retail: PRICING_MODES.MARKET_BASED,
  retail_minus_discount: PRICING_MODES.MARKET_BASED,
  cost_plus: PRICING_MODES.COST_PLUS,
  'cost-plus': PRICING_MODES.COST_PLUS,
  costplus: PRICING_MODES.COST_PLUS,
  markup: PRICING_MODES.COST_PLUS,
  tier: PRICING_MODES.COST_PLUS,
  tier_markup: PRICING_MODES.COST_PLUS,
  tiered: PRICING_MODES.COST_PLUS,
};

export const normalizePricingMode = (v: unknown): string | null =>
  MODE_TOKENS[normStr(v)] ?? null;

// Explicit token fields, checked in order. A bare string/number descriptor is
// itself the token (via:'value').
const explicitModeHit = (src: any): any => {
  if (src == null) return null;
  if (typeof src !== 'object') {
    const m = normalizePricingMode(src);
    return m ? { mode: m, raw: src, via: 'value' } : null;
  }
  for (const f of ['pricing_mode', 'price_mode', 'mode', 'active_mode']) {
    const m = normalizePricingMode(src[f]);
    if (m) return { mode: m, raw: src[f], via: f };
  }
  return null;
};

const fixedSignalHit = (src: any): any => {
  if (!src || typeof src !== 'object') return null;
  const fixed = firstFinite(src.fixed_price, src.price_override, src.override_price);
  return fixed != null && fixed > 0
    ? { mode: PRICING_MODES.FIXED, raw: fixed, via: 'fixed_price' }
    : null;
};

const marketSignalHit = (src: any): any => {
  if (!src || typeof src !== 'object') return null;
  if (src.market_based === true || normStr(src.market_based) === 'true') {
    return { mode: PRICING_MODES.MARKET_BASED, raw: src.market_based, via: 'market_based' };
  }
  const retail = firstFinite(src.market_retail, src.retail_price, src.retail);
  return retail != null && retail > 0
    ? { mode: PRICING_MODES.MARKET_BASED, raw: retail, via: 'market_retail' }
    : null;
};

// tier_ref / tier / tier_name binding -> the bound chart row's family. A market
// row (pricing_mode market + finite market_retail) resolves 'market_based';
// any other bound row is the cost-plus family. A DANGLING ref resolves
// nothing — falls through rather than guessing.
const tierRefModeHit = (src: any, rows: any): any => {
  if (!src || typeof src !== 'object') return null;
  const ref = src.tier_ref ?? src.tier ?? src.tier_name;
  if (ref == null || !normStr(ref)) return null;
  const wanted = normStr(typeof ref === 'object' ? (ref as any).name ?? (ref as any).id : ref);
  const row = (Array.isArray(rows) ? rows : []).find(
    (r: any) => r && rowIsActive(r) && (normStr(r.name) === wanted || normStr(r.id) === wanted),
  );
  if (!row) return null;
  return {
    mode: marketKind(row) ? PRICING_MODES.MARKET_BASED : PRICING_MODES.COST_PLUS,
    raw: row,
    via: 'tier_ref',
  };
};

const descriptorModeHit = (src: any, rows: any): any =>
  explicitModeHit(src) || fixedSignalHit(src) || tierRefModeHit(src, rows) || marketSignalHit(src);

export function resolvePricingMode({ part = null, template = null, globalDefault = null, tierRules = null }: any = {}): any {
  const partHit = descriptorModeHit(part, tierRules);
  if (partHit) return { mode: partHit.mode, source: 'part', raw: partHit.raw, via: partHit.via };
  const tplHit = descriptorModeHit(template, tierRules);
  if (tplHit) return { mode: tplHit.mode, source: 'template', raw: tplHit.raw, via: tplHit.via };
  const gHit = descriptorModeHit(globalDefault, tierRules);
  if (gHit) return { mode: gHit.mode, source: 'global', raw: gHit.raw, via: gHit.via };
  return { mode: PRICING_MODES.COST_PLUS, source: 'default', raw: null, via: 'fallback' };
}
