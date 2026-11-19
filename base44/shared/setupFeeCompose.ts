// Setup fees + minimums compose — pure TS, ZERO imports. Safe to bundle into
// Deno-style base44 functions AND the Vite frontend (esbuild/Vite strip the
// types). Deterministic: identical inputs -> identical outputs; money figures
// round to cents (round2, same EPSILON-adjusted formula as pricingEngine.ts).
//
// ESTIMATOR_MASTERPLAN F-15: "part setup_fee + min_charge + modifier min
// compose (largest wins or additive per CB semantics — check map §8 and
// decide, document choice)". This module is the compose layer the F-08/F-10
// modifier engine deferred to (modifierPricing.ts header: "the caller's setup
// compose can fold it in (F-15 owns the compose)").
//
// ---------------------------------------------------------------------------
// EVIDENCE (what the map/siblings actually pin down)
// ---------------------------------------------------------------------------
// COREBRIDGE_MAP.md §8 (lines 102/106):
//   - Part General tab carries "setup fees"; part Options tab carries
//     "minimums"; modifiers carry flags "include setup fee" + "min charge".
//   - The map does NOT state whether multiple minimums stack, nor whether a
//     minimum floors the line before or after setup fees -> both are
//     documented decisions here.
// Entity A-06 (base44/entities/PricingModifier.jsonc):
//   - include_setup_fee (default false): "the modifier contributes a flat
//     setup fee in addition to its unit-rate price" — the flag GATES the fee;
//     a configured-but-unflagged fee is not charged.
//   - min_charge (default 0): "Floor for this modifier's total price
//     contribution; 0 = no minimum."
// Sibling modules:
//   - modifierPricing.ts priceModifierEffect/evaluateModifierFormula floor the
//     modifier's OWN amount at min_charge (per-modifier floor, raw_amount
//     preserved) and surface include_setup_fee/setup_fee markers — this
//     module consumes those markers; it does NOT re-floor modifier amounts.
//   - pricingEngine.ts pricePart already composes a line-level floor
//     LARGEST-WINS: extended = max(rule.minimumCharge, input.minimumCharge,
//     extension) — and adds its single setupFee AFTER the floor ("a minimum
//     can't eat it", docs/pricing-engine.md §3).
//
// ---------------------------------------------------------------------------
// DECISIONS (documented per the F-15 brief)
// ---------------------------------------------------------------------------
// D1 — MINIMUMS COMPOSE LARGEST-WINS, never additive. Every applicable
//      minimum (part min_charge, each modifier min_charge, any line/rule
//      minimum) is a FLOOR on the same line; competing floors resolve to the
//      largest. Rationale: (a) CB parity — a "min charge" is a price floor,
//      not a fee; stacking floors would double-count the same guarantee;
//      (b) engine parity — pricingEngine.ts already resolves rule vs caller
//      minimums via Math.max; (c) modifierPricing already treats min_charge
//      as a floor (never a sum). Ties resolve deterministically: earliest
//      declared candidate wins (part bucket before modifier bucket before
//      line bucket; array order within a bucket).
// D2 — SETUP FEES ARE ADDITIVE. Each applicable setup fee adds on top; they
//      never compete and never floor each other. A PART setup fee may carry
//      a quantity threshold (setup_fee_threshold_qty family): qty < threshold
//      -> the fee applies (small-order recovery charge); qty >= threshold ->
//      waived (setup amortized into the volume price). No threshold -> always
//      applies. A MODIFIER setup fee applies when the modifier's
//      include_setup_fee flag is not false — entity parity: flag ON charges
//      the fee; flag explicitly false suppresses even a configured positive
//      amount; flag ABSENT with a positive fee counts (the caller resolved
//      the fee into the compose). All amounts coerce NaN-safe; only positive
//      finite fees sum.
// D3 — FLOOR SCOPE: default 'inclusive' — the floor bounds
//      (line_subtotal + total_setup_fees), so
//        final_subtotal = max(S + F, floor).
//      This is the F-15 brief's stated default reading of "a min_charge
//      floors the line": the line's whole sell (merch + setup) is what the
//      floor guarantees. Consequence: when a floor binds above (S + F), the
//      setup fee is absorbed into the minimum, not charged on top.
//      Alternative 'exclusive' (pass floor_mode:'exclusive'|'pre_setup'):
//        final_subtotal = max(S, floor) + F
//      which is byte-identical to pricePart's single-fee behavior (setup
//      added after the floor so a minimum can never eat it). Callers wiring
//      this compose underneath pricingEngine pricePart lines should pass
//      'exclusive' for identical math; the compose default stays 'inclusive'
//      per the brief.
// D4 — EMPTY/NEGATIVE LINES ARE NEVER FLOORED. A floor only binds when the
//      measured base is positive (parity: pricePart's minimumApplied requires
//      extension > 0 — a minimum is a sell-price floor, not a way to charge
//      for nothing). Zero/negative/NaN minimums are ignored, counted in
//      skipped_minimums.
//
// ---------------------------------------------------------------------------
// Field aliases tolerated (entity + caller conventions)
// ---------------------------------------------------------------------------
//   line subtotal : line_subtotal | subtotal | extension | extended
//   minimum value : min_charge | minimum_charge | minimum | floor | amount |
//                   value   (records only; bare numbers = the minimum itself)
//   setup fee     : setup_fee | setup_fee_amount | setupFee | fee | amount |
//                   value   (records only; bare numbers = the fee itself)
//   qty threshold : setup_fee_threshold_qty | setup_fee_quantity_threshold |
//                   setup_fee_threshold | setup_threshold_qty | threshold_qty
//   line minimum  : input.minimum | input.minimum_charge | input.min_charge
//                   | input.line_minimum  (scalar; engine-parity channel)
//   suppressors   : entry.applies === false  (minimum or fee skipped)
//                   entry.include_setup_fee === false  (fee skipped)
//   floor_mode    : 'inclusive'|'total' -> inclusive (default)
//                   'exclusive'|'pre_setup'|'extension' -> exclusive
//
// Exports: applyMinimum, normalizeMinimumCandidate, normalizeSetupFee,
// composeOrderMinimums, evaluateMinimums, MINIMUM_FLOOR_MODES,
// MINIMUM_VALUE_FIELDS, SETUP_FEE_VALUE_FIELDS, SETUP_FEE_THRESHOLD_FIELDS.

// ---------------------------------------------------------------------------
// shared coercion (same reject set as formulaEval/pricingVariables/
// modifierPricing — consistent NaN-safety across the pricing modules)
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

const toFiniteNumber = (v: unknown): number | null => {
  if (
    v === null || v === undefined || v === '' ||
    typeof v === 'object' || typeof v === 'function' ||
    typeof v === 'symbol' || typeof v === 'bigint'
  ) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const num = (v: unknown, fallback = 0): number => toFiniteNumber(v) ?? fallback;

const firstFinite = (...vals: unknown[]): number | null => {
  for (const v of vals) if (toFiniteNumber(v) !== null) return toFiniteNumber(v);
  return null;
};

/** Cent rounding — identical formula to pricingEngine.ts round2. */
export const round2 = (n: unknown): number =>
  Math.round((num(n) + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// constants + types
// ---------------------------------------------------------------------------

export const MINIMUM_FLOOR_MODES = Object.freeze(['inclusive', 'exclusive'] as const);
export type MinimumFloorMode = typeof MINIMUM_FLOOR_MODES[number];

/** Record fields read as a minimum value, in priority order. */
export const MINIMUM_VALUE_FIELDS = Object.freeze([
  'min_charge',
  'minimum_charge',
  'minimum',
  'floor',
  'min',
  'amount',
  'value',
] as const);

/** Record fields read as a setup-fee amount, in priority order. */
export const SETUP_FEE_VALUE_FIELDS = Object.freeze([
  'setup_fee',
  'setup_fee_amount',
  'setupFee',
  'fee',
  'amount',
  'value',
] as const);

/** Record fields read as a setup-fee quantity threshold, in priority order. */
export const SETUP_FEE_THRESHOLD_FIELDS = Object.freeze([
  'setup_fee_threshold_qty',
  'setup_fee_quantity_threshold',
  'setup_fee_threshold',
  'setup_threshold_qty',
  'threshold_qty',
] as const);

export interface MinimumCandidate {
  /** 'part' | 'modifier' | 'line' | entry.source override. */
  source: string;
  /** Entry key/id/name/label echo ('' when anonymous). */
  key: string;
  /** Positive finite floor value. */
  minimum: number;
  /** True on the single winning candidate (largest; earliest on ties). */
  winning: boolean;
}

export interface ResolvedSetupFee {
  /** 'part' | 'modifier' | 'setup_fee' | entry.source override. */
  source: string;
  /** Entry key/id/name/label echo ('' when anonymous). */
  key: string;
  /** Fee amount that charges (0 when threshold-waived), pre-round. */
  amount: number;
  /** The configured fee before the qty-threshold gate. */
  configured_amount: number;
  /** Resolved qty threshold (>0), else null. */
  threshold_qty: number | null;
  /** True when this fee was waived by its qty threshold. */
  threshold_waived: boolean;
}

export interface ApplyMinimumResult {
  /** max(subtotal, floor) when floor is usable; subtotal verbatim otherwise. */
  adjusted: number;
  /** floor - subtotal when positive, else 0 (never negative). */
  delta: number;
  /** True when the floor raised the subtotal (delta > 0). */
  applied: boolean;
}

export interface ComposeMinimumsResult {
  /** Largest applicable minimum; 0 when no positive candidates. */
  floor: number;
  /** The winning candidate echo, else null. */
  floor_source: MinimumCandidate | null;
  /** Every positive candidate, in competition order; winner flagged. */
  applied_minimums: MinimumCandidate[];
  /** Candidates dropped: zero/negative/NaN/suppressed entries. */
  skipped_minimums: number;
  /** Fee entries dropped: non-positive/NaN/suppressed (waived are NOT here —
   *  they surface in setup_fees with amount 0 + threshold_waived). */
  skipped_setup_fees: number;
  /** Applicable setup fees after gating (amounts rounded to cents); waived
   *  threshold entries are appended last with amount 0 + threshold_waived. */
  setup_fees: ResolvedSetupFee[];
  /** Sum of applicable setup fees, cent-rounded. */
  total_setup_fees: number;
  /** line_subtotal + total_setup_fees (pre-floor total), cent-rounded. */
  subtotal_before_minimum: number;
  /** The base the floor was measured against (per floor_mode). */
  floor_base: number;
  /** True when the floor bound (raised final_subtotal). */
  minimum_applied: boolean;
  /** final_subtotal - subtotal_before_minimum (>= 0). */
  minimum_delta: number;
  /** Money result, cent-rounded: S + F + minimum_delta. */
  final_subtotal: number;
  /** Echo of the resolved floor mode. */
  floor_mode: MinimumFloorMode;
  /** Echo of the coerced line subtotal. */
  line_subtotal: number;
}

// ---------------------------------------------------------------------------
// floor mode
// ---------------------------------------------------------------------------

const FLOOR_MODE_TOKENS: Record<string, MinimumFloorMode> = {
  inclusive: 'inclusive',
  total: 'inclusive',
  including_setup: 'inclusive',
  with_setup: 'inclusive',
  exclusive: 'exclusive',
  pre_setup: 'exclusive',
  pres_setup: 'exclusive',
  extension: 'exclusive',
  before_setup: 'exclusive',
};

/** Normalize a floor_mode token; unknown/blank -> 'inclusive' (D3 default). */
export const normalizeFloorMode = (v: unknown): MinimumFloorMode =>
  FLOOR_MODE_TOKENS[asString(v).toLowerCase()] ?? 'inclusive';

// ---------------------------------------------------------------------------
// candidate normalization — never throws; non-candidates return null
// ---------------------------------------------------------------------------

const keyOf = (rec: Record<string, unknown>): string =>
  asString(rec.key ?? rec.id ?? rec.name ?? rec.label ?? rec.modifier);

const fieldValue = (rec: Record<string, unknown>, fields: readonly string[]): number | null => {
  for (const f of fields) {
    const v = toFiniteNumber(rec[f]);
    if (v !== null) return v;
  }
  return null;
};

/**
 * One minimum entry -> a candidate, or null when not a positive finite floor
 * (bare numbers ARE the minimum; records resolve via MINIMUM_VALUE_FIELDS).
 * `applies === false` suppresses an entry explicitly.
 */
export function normalizeMinimumCandidate(
  raw: unknown,
  source = 'line',
): MinimumCandidate | null {
  if (isRecord(raw) && raw.applies === false) return null;
  const value = isRecord(raw)
    ? fieldValue(raw, MINIMUM_VALUE_FIELDS)
    : toFiniteNumber(raw);
  if (value === null || value <= 0) return null;
  return {
    source: isRecord(raw) ? (asString(raw.source) || source) : source,
    key: isRecord(raw) ? keyOf(raw) : '',
    minimum: value,
    winning: false,
  };
}

/**
 * One setup-fee entry -> a resolved fee, or null when it cannot charge
 * (non-positive/NaN amount, applies/include_setup_fee === false).
 * `qty` gates threshold-carrying fees per D2: a positive threshold with a
 * finite qty below it -> charged; qty at/above -> waived (the record is kept
 * with amount 0 + threshold_waived so audits can see the waiver); missing qty
 * -> charged (conservative: never silently drop a configured fee).
 */
export function normalizeSetupFee(
  raw: unknown,
  source = 'setup_fee',
  qty: unknown = undefined,
): ResolvedSetupFee | null {
  if (isRecord(raw)) {
    if (raw.applies === false || raw.include_setup_fee === false) return null;
    const amount = fieldValue(raw, SETUP_FEE_VALUE_FIELDS);
    if (amount === null || amount <= 0) return null;
    const threshold = fieldValue(raw, SETUP_FEE_THRESHOLD_FIELDS);
    const t = threshold !== null && threshold > 0 ? threshold : null;
    const q = toFiniteNumber(qty);
    const waived = t !== null && q !== null && q >= t;
    return {
      source: asString(raw.source) || source,
      key: keyOf(raw),
      amount: waived ? 0 : amount,
      configured_amount: amount,
      threshold_qty: t,
      threshold_waived: waived,
    };
  }
  const amount = toFiniteNumber(raw);
  if (amount === null || amount <= 0) return null;
  return { source, key: '', amount, configured_amount: amount, threshold_qty: null, threshold_waived: false };
}

// ---------------------------------------------------------------------------
// applyMinimum — the atomic floor
// ---------------------------------------------------------------------------

/**
 * Floor one subtotal. Returns { adjusted, delta, applied }: delta is
 * floor - subtotal when positive else 0; applied marks delta > 0.
 * Zero/negative/NaN floors and non-positive subtotals pass through (D4) —
 * NaN subtotal coerces to 0 but a non-positive base is never floored.
 */
export function applyMinimum(subtotal: unknown, floor: unknown): ApplyMinimumResult {
  const s = num(subtotal);
  const f = num(floor);
  if (f <= 0 || s <= 0 || s >= f) {
    return { adjusted: s, delta: 0, applied: false };
  }
  return { adjusted: f, delta: round2(f - s), applied: true };
}

// ---------------------------------------------------------------------------
// composeOrderMinimums — the F-15 compose
// ---------------------------------------------------------------------------

/**
 * Compose one order line's minimums + setup fees into a final subtotal.
 *
 * input:
 *   line_subtotal      merchandise subtotal the floors measure against
 *                      (aliases: subtotal | extension | extended)
 *   part_minimums[]    part-level floor candidates (numbers or records)
 *   modifier_minimums[] modifier-level floor candidates
 *   minimums[]         extra line-level candidates (source 'line')
 *   minimum            scalar line/rule minimum (aliases: minimum_charge,
 *                      min_charge, line_minimum) — engine-parity channel for
 *                      pricingEngine's input.minimumCharge
 *   setup_fees[]       fee entries (numbers or records; thresholds gated via
 *                      `qty`)
 *   qty                line quantity for setup-fee thresholds
 *   floor_mode         'inclusive' (default — floor bounds S+F) |
 *                      'exclusive' (engine parity — floor bounds S, fees add)
 *
 * Never throws; empty/absent arrays pass through with floor 0.
 */
export function composeOrderMinimums(input: unknown = {}): ComposeMinimumsResult {
  const rec = isRecord(input) ? input : {};
  const lineSubtotal = num(
    rec.line_subtotal ?? rec.subtotal ?? rec.extension ?? rec.extended,
  );
  const qty = rec.qty ?? rec.quantity;
  const floorMode = normalizeFloorMode(rec.floor_mode ?? rec.floorMode);

  // --- minimum candidates (D1: largest wins, earliest declared on ties) ---
  const candidates: MinimumCandidate[] = [];
  let skipped = 0;
  const pushAll = (list: unknown, source: string): void => {
    for (const entry of Array.isArray(list) ? list : []) {
      const c = normalizeMinimumCandidate(entry, source);
      if (c) candidates.push(c);
      else skipped += 1;
    }
  };
  pushAll(rec.part_minimums, 'part');
  pushAll(rec.modifier_minimums, 'modifier');
  pushAll(rec.minimums, 'line');
  const scalar = firstFinite(
    rec.minimum, rec.minimum_charge, rec.min_charge, rec.line_minimum,
  );
  if (scalar !== null) {
    if (scalar > 0) candidates.push({ source: 'line', key: 'line_minimum', minimum: scalar, winning: false });
    else skipped += 1;
  } else if (
    rec.minimum !== undefined || rec.minimum_charge !== undefined ||
    rec.min_charge !== undefined || rec.line_minimum !== undefined
  ) {
    skipped += 1; // present but non-numeric — counted, never guessed
  }

  let floor = 0;
  let winner: MinimumCandidate | null = null;
  for (const c of candidates) {
    if (c.minimum > floor) {
      floor = c.minimum;
      winner = c;
    }
  }
  if (winner) winner.winning = true;
  floor = round2(floor);

  // --- setup fees (D2: additive, gated) ---
  // normalizeSetupFee returns null for suppressed/non-positive entries
  // (counted as skipped) and amount:0 + threshold_waived for waived entries
  // (kept in the audit list so the waiver is visible, excluded from the sum).
  const resolved: ResolvedSetupFee[] = [];
  let skippedFees = 0;
  for (const entry of Array.isArray(rec.setup_fees) ? rec.setup_fees : []) {
    const f = normalizeSetupFee(entry, 'setup_fee', qty);
    if (f === null) {
      skippedFees += 1;
      continue;
    }
    resolved.push(f);
  }
  const chargeFees = resolved.filter((f) => f.amount > 0);
  const waivedFees = resolved.filter((f) => f.amount <= 0);
  const totalFees = round2(chargeFees.reduce((s, f) => s + f.amount, 0));

  // --- floor the base (D3 scope, D4 positive-base only) ---
  const baseTotal = round2(lineSubtotal + totalFees);
  const floorBase = floorMode === 'exclusive' ? round2(lineSubtotal) : baseTotal;
  const hit = floor > 0 && floorBase > 0 && floor > floorBase;
  const delta = hit ? round2(floor - floorBase) : 0;
  const finalSubtotal = round2(baseTotal + delta);

  return {
    floor,
    floor_source: winner ? { ...winner } : null,
    applied_minimums: candidates,
    skipped_minimums: skipped,
    setup_fees: [...chargeFees, ...waivedFees].map((f) => ({
      ...f,
      amount: round2(f.amount),
      configured_amount: round2(f.configured_amount),
    })),
    total_setup_fees: totalFees,
    subtotal_before_minimum: baseTotal,
    floor_base: round2(floorBase),
    minimum_applied: hit,
    minimum_delta: delta,
    final_subtotal: finalSubtotal,
    floor_mode: floorMode,
    line_subtotal: round2(lineSubtotal),
    skipped_setup_fees: skippedFees,
  };
}

// ---------------------------------------------------------------------------
// evaluateMinimums — line-shaped convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Resolve the applicable floor + setup fees for one priced line:
 *   { part, qty, modifiers[], line_subtotal?, floor_mode?, ...compose extras }
 *
 *   part       {min_charge | minimum_charge, setup_fee,
 *               setup_fee_threshold_qty?...} — its min_charge enters the
 *               'part' bucket; its setup_fee enters as a 'part'-sourced fee
 *               (threshold-gated by qty).
 *   modifiers  [{min_charge, setup_fee, include_setup_fee?}] — each enters
 *              the 'modifier' minimum bucket; each contributes a 'modifier'-
 *              sourced setup fee gated by include_setup_fee (D2).
 *   Extra compose fields (minimum, minimums, additional setup_fees) pass
 *   straight through so callers can layer line/rule minimums on top.
 *
 * Returns the full ComposeMinimumsResult plus {part_minimums,
 * modifier_minimums} echoes of the extracted buckets. line_subtotal defaults
 * to 0 — read `.floor` for the floor-resolution view without pricing.
 */
// Entity-canonical extraction fields for evaluateMinimums — deliberately
// narrower than the compose buckets' alias lists: a full part/modifier record
// may carry unrelated `amount`/`value` fields (ModifierOption.value!) that
// must never be read as a minimum or fee.
const PART_MIN_FIELDS = ['min_charge', 'minimum_charge', 'minimum', 'min'] as const;
const MOD_MIN_FIELDS = PART_MIN_FIELDS;
const PART_FEE_FIELDS = ['setup_fee', 'setup_fee_amount', 'setupFee'] as const;
const MOD_FEE_FIELDS = PART_FEE_FIELDS; // mirror modifierPricing normalizeModifier

const extractField = (rec: Record<string, unknown>, fields: readonly string[]): number | null => {
  for (const f of fields) {
    const v = toFiniteNumber(rec[f]);
    if (v !== null) return v;
  }
  return null;
};

const extractThreshold = (rec: Record<string, unknown>): number | null =>
  extractField(rec, SETUP_FEE_THRESHOLD_FIELDS);

/** Narrow a record down to the compose's fee-entry shape (null when no fee
 *  amount — a bare threshold with no fee can never charge). */
const feeEntryFrom = (
  rec: Record<string, unknown>,
  source: string,
  feeFields: readonly string[],
): Record<string, unknown> | null => {
  const amount = extractField(rec, feeFields);
  if (amount === null) return null;
  const threshold = extractThreshold(rec);
  const out: Record<string, unknown> = { source };
  const key = keyOf(rec);
  if (key !== '') out.key = key;
  if (amount !== null) out.setup_fee = amount;
  if (threshold !== null) out.setup_fee_threshold_qty = threshold;
  if (rec.include_setup_fee !== undefined) out.include_setup_fee = rec.include_setup_fee;
  if (rec.applies !== undefined) out.applies = rec.applies;
  return out;
};

export function evaluateMinimums(line: unknown = {}): ComposeMinimumsResult & {
  part_minimums: unknown[];
  modifier_minimums: unknown[];
} {
  const rec = isRecord(line) ? line : {};
  const part = rec.part;
  const mods = Array.isArray(rec.modifiers) ? rec.modifiers : [];

  // Part: bare number = its min_charge; record -> narrowed extraction so
  // generic amount/value fields can't misfire.
  const partMinimums: unknown[] = [];
  if (isRecord(part)) {
    const pm = extractField(part, PART_MIN_FIELDS);
    if (pm !== null) partMinimums.push({ value: pm, source: 'part', key: keyOf(part) });
  } else if (part !== undefined && part !== null) {
    partMinimums.push(part);
  }

  const modMinimums: unknown[] = mods.map((m) => {
    if (!isRecord(m)) return { value: m, source: 'modifier' };
    const mm = extractField(m, MOD_MIN_FIELDS);
    return { value: mm, source: 'modifier', key: keyOf(m) };
  });

  const setupFees: unknown[] = [
    ...(isRecord(part) ? [feeEntryFrom(part, 'part', PART_FEE_FIELDS)] : []),
    ...mods.map((m) =>
      isRecord(m) ? feeEntryFrom(m, 'modifier', MOD_FEE_FIELDS) : null),
    ...(Array.isArray(rec.setup_fees) ? rec.setup_fees : []),
  ].filter((e) => e !== null);

  const out = composeOrderMinimums({
    ...rec,
    part_minimums: [
      ...partMinimums,
      ...(Array.isArray(rec.part_minimums) ? rec.part_minimums : []),
    ],
    modifier_minimums: [
      ...modMinimums,
      ...(Array.isArray(rec.modifier_minimums) ? rec.modifier_minimums : []),
    ],
    setup_fees: setupFees,
  });
  return {
    ...out,
    part_minimums: partMinimums,
    modifier_minimums: modMinimums,
  };
}
