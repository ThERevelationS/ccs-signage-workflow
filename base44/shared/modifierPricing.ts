// PricingModifier engine + formula wiring — pure TS, no entity/io access.
// (ESTIMATOR_MASTERPLAN F-08 modifier engine + F-10 modifier->formula wiring;
// entity schemas A-06: base44/entities/PricingModifier.jsonc +
// ModifierOption.jsonc.)
//
// This module COMPOSES the sibling pure modules; nothing here touches
// pricingEngine.ts — the engine calls in later (F-15 setup-fee/minimum
// compose consumes the markers this module emits).
//
//   F-07 pricingVariables.ts — buildFormulaEnv supplies the builtin vars
//     (Quantity/Width/Height/Depth/PartBaseCost/PartRetail/StitchCount) plus
//     the GlobalSettings.pricing_variables custom globals layer.
//   F-09 formulaEval.ts       — evaluateFormula runs modifier formula_text
//     against the env this module builds (never throws; clean error tuples).
//
// ---------------------------------------------------------------------------
// Entity contract (A-06)
// ---------------------------------------------------------------------------
// PricingModifier: name (unique formula key), label, input_type
//   (text|number|select|checkbox|formula), can_use_in_pricing (gate for the
//   pricing waterfall), rates[] rows {label, retail, cost, per_unit},
//   formula_text (CoreBridge variable-rate syntax), include_setup_fee,
//   min_charge, affects_waste, inventoried_part_type, pricing_tier_id,
//   display_order, status (unset treated as 'active').
// ModifierOption: modifier_id, label, value, rate_overrides (open bag),
//   is_default, sort, status.
//
// ---------------------------------------------------------------------------
// Rate-kind semantics (priceModifierEffect)
// ---------------------------------------------------------------------------
// The resolved rate row's `per_unit` STRING selects the kind; the row's
// `retail` number is the rate that drives the amount (`cost` rides along in
// detail for margin). Canonical A-06 spellings first, aliases after:
//   per_unit  -> 'per_unit'  amount = retail * quantity   (each/ea/unit/qty)
//   per_sqft  -> 'per_sqft'  amount = retail * area       (sqft/sq_ft/sq ft)
//   percent_of_base -> 'percent'  amount = basePrice * retail / 100
//                       (percent/pct/%/percentage/percent_of_price)
//   flat_add  -> 'flat'      amount = retail              (flat/fee/fixed/once)
// Missing/blank per_unit -> 'flat' (a bare rate applies once per line — the
// conservative reading; a rate never multiplies unless it says so).
// Unrecognized per_unit  -> 'flat' + detail.unrecognized_per_unit.
// After the kind math, modifier.min_charge (>0) floors the amount —
// detail.raw_amount keeps the pre-floor figure and detail.min_charge_applied
// marks the floor hit. detail.include_setup_fee / detail.setup_fee surface
// the setup-fee flag for the caller's setup compose; detail.affects_waste
// marks that per_unit/per_sqft quantity bases should have come through
// effectiveModifierQuantity() (this fn has no part arg, so the caller scales).
//
// ---------------------------------------------------------------------------
// Flag effects (evaluateModifierFormula — F-10)
// ---------------------------------------------------------------------------
//   min_charge            floors the modifier amount (raw_amount preserved).
//   affects_waste         formula sees Quantity = env.Quantity * wasteFactor
//                         where wasteFactor resolves env.WasteFactor /
//                         env.PartWasteFactor / part.waste_factor /
//                         1 + waste_factor_percent/100 (default 1). The scaled
//                         qty is also injected as EffectiveQuantity; the raw
//                         env object is never mutated.
//   include_setup_fee     no math change — result.include_setup_fee = true and
//                         result.setup_fee carries the modifier's configured
//                         setup_fee/setup_fee_amount so the caller's setup
//                         compose can fold it in (F-15 owns the compose).
//   inventoried_part_type attachment gate — enforced in pricingModifiersFor
//                         (part.part_type must ci-match when set). The formula
//                         path double-checks when env.PartType was injected by
//                         buildModifierFormulaEnv: a mismatch is a clean
//                         {ok:false} error, not a silently-priced modifier.
//   pricing_tier_id       normalized passthrough — tier scoping is resolved by
//                         the caller's tier engine (this module is pure).
//
// ---------------------------------------------------------------------------
// Env composition (buildModifierFormulaEnv)
// ---------------------------------------------------------------------------
//   1. builtins + globals  via F-07 buildFormulaEnv({product:part, part,
//      globals}) — the part record feeds both the product-style qty/dims
//      candidates and the part-style rate candidates.
//   2. part meta           PartType (string), WasteFactor + PartWasteFactor
//      (numbers) — metadata for formulas/audits. String env vars are safe:
//      evaluateFormula only coerces vars the formula actually references.
//   3. modifier answers    each eligible modifier (pricing-gated, ordered by
//      display_order) contributes, under its identifier-safe name:
//        <Name>          numeric answer — checkbox 1|0, number input, select =
//                        option.value coerced (non-numeric selected -> 1, none
//                        -> 0). input_type 'formula' emits NO <Name> here —
//                        buildModifierFormulaEnv evaluates it in display_order
//                        against the env-so-far and injects the amount, so
//                        later modifiers can depend on earlier ones.
//        <Name>_Rate     resolved retail rate (option rate_overrides applied
//                        over modifier.rates — alias of _Retail).
//        <Name>_Retail   resolved retail number.
//        <Name>_Cost     resolved cost number.
//        <Name>_Label    resolved option/rate label (string metadata).
//        <Name>_PerUnit  resolved per_unit string (string metadata).
//      A modifier named after a builtin (Quantity etc.) keeps its _-suffixed
//      vars but its bare <Name> NEVER shadows the builtin — same reservation
//      rule pricingVariables applies to globals.
//   4. answers             caller map keyed by modifier.id OR modifier.name;
//      values may be primitives or {value|answer|option_id|option} records.

import { evaluateFormula } from './formulaEval.ts';
import {
  buildFormulaEnv,
  canonicalVariableName,
  BUILTIN_VARIABLE_NAMES,
} from './pricingVariables.ts';

// ---------------------------------------------------------------------------
// shared coercion (same reject set as formulaEval/pricingVariables)
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

const lc = (v: unknown): string => asString(v).toLowerCase();

// ---------------------------------------------------------------------------
// types + constants
// ---------------------------------------------------------------------------

export const MODIFIER_INPUT_TYPES = Object.freeze([
  'text',
  'number',
  'select',
  'checkbox',
  'formula',
] as const);

export type ModifierInputType = typeof MODIFIER_INPUT_TYPES[number];

export type ModifierEffectKind = 'per_unit' | 'per_sqft' | 'flat' | 'percent';

export interface ModifierRateRow {
  label: string;
  retail: number;
  cost: number;
  per_unit: string;
}

export interface NormalizedModifierOption {
  id: string;
  modifier_id: string;
  label: string;
  value: string;
  rate_overrides: Record<string, unknown> | null;
  is_default: boolean;
  sort: number;
  status: string;
}

export interface NormalizedPricingModifier {
  id: string;
  /** Unique formula/identifier key (entity: "unique key used in formulas"). */
  name: string;
  label: string;
  input_type: string;
  can_use_in_pricing: boolean;
  rates: ModifierRateRow[];
  formula_text: string;
  include_setup_fee: boolean;
  min_charge: number;
  affects_waste: boolean;
  inventoried_part_type: string;
  pricing_tier_id: string;
  display_order: number;
  /** Lifecycle status; 'active' when unset (entity contract). */
  status: string;
  /** Options attached by the caller (entity stores them as separate rows). */
  options: NormalizedModifierOption[];
  /** Configured setup fee surfaced when include_setup_fee is set. */
  setup_fee: number;
  /** Soft coercion notes — normalization never throws. */
  warnings: string[];
}

export interface ModifierVarsResult {
  /** Env fragment the modifier contributes (merge into a FormulaEnv). */
  vars: Record<string, unknown>;
  /** Resolved numeric answer (null when the modifier takes no answer). */
  answer: number | null;
  /** Selected option (select inputs only), else null. */
  option: NormalizedModifierOption | null;
  /** Effective rate row after option overrides, else null. */
  rate: ModifierRateRow | null;
}

export interface ModifierEffectResult {
  amount: number;
  kind: ModifierEffectKind;
  detail: Record<string, unknown>;
}

export interface ModifierFormulaResult {
  ok: boolean;
  amount: number;
  error: string | null;
  pos?: number;
  raw_amount?: number;
  include_setup_fee?: boolean;
  setup_fee?: number;
  detail?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// per_unit -> kind map (canonical A-06 spellings + aliases)
// ---------------------------------------------------------------------------

const PER_UNIT_KIND: Record<string, ModifierEffectKind> = {
  // per_unit — rate * ordered quantity
  per_unit: 'per_unit',
  each: 'per_unit',
  ea: 'per_unit',
  unit: 'per_unit',
  units: 'per_unit',
  qty: 'per_unit',
  quantity: 'per_unit',
  per_item: 'per_unit',
  'per each': 'per_unit',
  // per_sqft — rate * area in square feet
  per_sqft: 'per_sqft',
  sqft: 'per_sqft',
  sq_ft: 'per_sqft',
  per_sq_ft: 'per_sqft',
  'sq ft': 'per_sqft',
  'per sq ft': 'per_sqft',
  square_foot: 'per_sqft',
  square_feet: 'per_sqft',
  area: 'per_sqft',
  // percent_of_base — basePrice * rate / 100
  percent_of_base: 'percent',
  percent: 'percent',
  percentage: 'percent',
  pct: 'percent',
  pct_of_base: 'percent',
  percent_of_price: 'percent',
  '%': 'percent',
  // flat_add — rate applied once
  flat_add: 'flat',
  flat: 'flat',
  flat_fee: 'flat',
  fee: 'flat',
  fixed: 'flat',
  once: 'flat',
  setup: 'flat',
  lump: 'flat',
  lump_sum: 'flat',
};

const RATE_ROW_KEYS = new Set(['label', 'retail', 'cost', 'per_unit']);

// ---------------------------------------------------------------------------
// normalization — never throws; soft issues land in warnings
// ---------------------------------------------------------------------------

const normalizeRateRow = (raw: unknown, warnings: string[]): ModifierRateRow => {
  const rec = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warnings.push('non-object rates[] entry coerced to zeros');
  return {
    label: asString(rec.label),
    retail: num(rec.retail),
    cost: num(rec.cost),
    per_unit: asString(rec.per_unit),
  };
};

/** Normalize a raw ModifierOption row. Never throws. */
export function normalizeModifierOption(raw: unknown): NormalizedModifierOption {
  const rec = isRecord(raw) ? raw : {};
  return {
    id: asString(rec.id),
    modifier_id: asString(rec.modifier_id),
    label: asString(rec.label),
    value: asString(rec.value),
    rate_overrides: isRecord(rec.rate_overrides) ? rec.rate_overrides : null,
    is_default: rec.is_default === true,
    sort: num(rec.sort),
    status: asString(rec.status) || 'active',
  };
}

/**
 * Validate + normalize a raw PricingModifier row. ALWAYS returns a row —
 * un-normalizable input (non-record) comes back as an empty inactive row with
 * a warning so pricing gates drop it naturally. Idempotent: an already-
 * normalized row round-trips unchanged.
 */
export function normalizeModifier(raw: unknown): NormalizedPricingModifier {
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    return {
      id: '', name: '', label: '', input_type: 'text', can_use_in_pricing: false,
      rates: [], formula_text: '', include_setup_fee: false, min_charge: 0,
      affects_waste: false, inventoried_part_type: '', pricing_tier_id: '',
      display_order: 0, status: 'inactive', options: [], setup_fee: 0,
      warnings: ['non-object modifier coerced to empty row'],
    };
  }

  const inputType = lc(raw.input_type);
  if (raw.input_type !== undefined && raw.input_type !== null &&
      inputType !== '' && !(MODIFIER_INPUT_TYPES as readonly string[]).includes(inputType)) {
    warnings.push(`unknown input_type '${asString(raw.input_type)}' kept verbatim`);
  }

  const rawRates = Array.isArray(raw.rates) ? raw.rates : [];
  if (raw.rates !== undefined && raw.rates !== null && !Array.isArray(raw.rates)) {
    warnings.push('rates was not an array — treated as empty');
  }
  const rates = rawRates.map((r) => normalizeRateRow(r, warnings));

  const minCharge = num(raw.min_charge);
  if (minCharge < 0) warnings.push('negative min_charge clamped to 0');

  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map(normalizeModifierOption)
    .sort((a, b) => a.sort - b.sort);

  return {
    id: asString(raw.id),
    name: asString(raw.name),
    label: asString(raw.label),
    input_type: inputType || 'text',
    can_use_in_pricing: raw.can_use_in_pricing === true,
    rates,
    formula_text: asString(raw.formula_text),
    include_setup_fee: raw.include_setup_fee === true,
    min_charge: Math.max(0, minCharge),
    affects_waste: raw.affects_waste === true,
    inventoried_part_type: asString(raw.inventoried_part_type),
    pricing_tier_id: asString(raw.pricing_tier_id),
    display_order: num(raw.display_order),
    status: asString(raw.status) || 'active',
    options,
    setup_fee: num(raw.setup_fee ?? raw.setup_fee_amount ?? raw.setupFee),
    warnings,
  };
}

/** Entity contract: a modifier with no status is treated as active. */
export const modifierIsActive = (m: { status?: string }): boolean =>
  lc(m.status || 'active') === 'active';

/** The pricing waterfall gate (entity: can_use_in_pricing). */
export const modifierCanPrice = (m: { can_use_in_pricing?: boolean; status?: string }): boolean =>
  m.can_use_in_pricing === true && modifierIsActive(m);

// ---------------------------------------------------------------------------
// part attachment + inventoried_part_type gating
// ---------------------------------------------------------------------------

/** Part fields that may carry a modifier attachment list (first array wins). */
const PART_MODIFIER_FIELDS = [
  'modifiers',
  'modifier_ids',
  'pricing_modifier_ids',
  'pricing_modifiers',
  'modifier_links',
] as const;

/** Part fields that may carry the part-type key for inventoried gating. */
const PART_TYPE_FIELDS = ['part_type', 'inventoried_part_type', 'partType'] as const;

export const partTypeOf = (part: unknown): string => {
  if (!isRecord(part)) return '';
  for (const f of PART_TYPE_FIELDS) {
    const v = asString(part[f]);
    if (v) return v;
  }
  return '';
};

interface AttachmentRef { id: string; name: string; }

/** Extract {id,name} candidates from one attachment entry. */
const attachmentRef = (entry: unknown): AttachmentRef => {
  if (typeof entry === 'string') return { id: entry, name: entry };
  if (!isRecord(entry)) return { id: '', name: '' };
  const nested = isRecord(entry.modifier) ? entry.modifier : null;
  return {
    id: asString(entry.id ?? entry.modifier_id ?? nested?.id),
    name: asString(entry.name ?? entry.modifier_name ?? nested?.name),
  };
};

/** An attachment record that itself looks like a PricingModifier row. */
const isInlineModifier = (entry: unknown): boolean =>
  isRecord(entry) &&
  (entry.input_type !== undefined || Array.isArray(entry.rates) || entry.can_use_in_pricing !== undefined);

/**
 * Sorted-by-display_order modifiers eligible to price `part`:
 *   can_use_in_pricing === true AND status 'active' (unset = active),
 *   gated by the part's attachment list when it declares one, and by
 *   inventoried_part_type when the modifier pins one.
 *
 * Attachment fields tried in order: modifiers, modifier_ids,
 * pricing_modifier_ids, pricing_modifiers, modifier_links. Entries may be
 * id/name strings, {id|modifier_id|name|modifier_name|modifier:{...}}
 * records, or INLINE modifier rows (carrying input_type/rates) — inline rows
 * are normalized and included directly. A part with NO attachment field
 * treats every supplied modifier as attached (caller pre-filtered the list).
 */
export function pricingModifiersFor(
  part: unknown,
  modifiers: unknown,
): NormalizedPricingModifier[] {
  const list = (Array.isArray(modifiers) ? modifiers : []).map(normalizeModifier);
  const p = isRecord(part) ? part : {};

  // attachment gate — first array field found on the part wins
  let attached: AttachmentRef[] | null = null;
  const inline: NormalizedPricingModifier[] = [];
  for (const f of PART_MODIFIER_FIELDS) {
    const v = p[f];
    if (!Array.isArray(v)) continue;
    attached = [];
    for (const entry of v) {
      if (isInlineModifier(entry)) {
        inline.push(normalizeModifier(entry));
        continue;
      }
      attached.push(attachmentRef(entry));
    }
    break;
  }

  const isAttached = (m: NormalizedPricingModifier): boolean => {
    if (attached === null) return true; // part declares no attachment list
    if (!attached.length && !inline.length) return false; // explicit empty = none
    const mid = lc(m.id);
    const mname = lc(m.name);
    return attached.some((r) =>
      (mid !== '' && (lc(r.id) === mid || lc(r.name) === mid)) ||
      (mname !== '' && (lc(r.name) === mname || lc(r.id) === mname)));
  };

  const partType = lc(partTypeOf(p));
  const typeOk = (m: NormalizedPricingModifier): boolean =>
    m.inventoried_part_type === '' ||
    (partType !== '' && lc(m.inventoried_part_type) === partType);

  const seen = new Set<string>();
  const out: NormalizedPricingModifier[] = [];
  // catalog modifiers pass the attachment gate; inline modifiers came FROM the
  // part's own attachment list so they are attached by definition.
  for (const [m, isInline] of [
    ...list.map((x) => [x, false] as const),
    ...inline.map((x) => [x, true] as const),
  ]) {
    if (!modifierCanPrice(m)) continue;       // pricing gate + status gate
    if (!typeOk(m)) continue;                 // inventoried_part_type gate
    if (!isInline && !isAttached(m)) continue; // part attachment gate
    const key = m.id || `name:${lc(m.name)}`;
    if (seen.has(key)) continue;              // first occurrence wins a dupe
    seen.add(key);
    out.push(m);
  }

  out.sort((a, b) =>
    a.display_order - b.display_order ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id));
  return out;
}

// ---------------------------------------------------------------------------
// option + rate resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the answers-map entry for a modifier. The map is keyed by
 * modifier.id first, then modifier.name (exact, then case-insensitive).
 * Values may be primitives or {value|answer|option_id|option} records.
 */
const answerFor = (
  modifier: NormalizedPricingModifier,
  answers: unknown,
): { present: boolean; value: unknown } => {
  if (!isRecord(answers)) return { present: false, value: undefined };
  const has = (k: string) => k !== '' && Object.prototype.hasOwnProperty.call(answers, k);
  let raw: unknown;
  if (modifier.id && has(modifier.id)) raw = answers[modifier.id];
  else if (modifier.name && has(modifier.name)) raw = answers[modifier.name];
  else {
    const want = lc(modifier.name);
    const k = want && Object.keys(answers).find((key) => lc(key) === want);
    if (k === undefined) return { present: false, value: undefined };
    raw = answers[k];
  }
  if (isRecord(raw)) {
    for (const f of ['value', 'answer', 'option_id', 'option']) {
      if (raw[f] !== undefined) return { present: true, value: raw[f] };
    }
  }
  return { present: true, value: raw };
};

/**
 * Pick the option for a select modifier: explicit answer match first
 * (option.value === answer, then option.label === answer — exact match
 * before case-insensitive), then the is_default option (lowest sort), then
 * null. Non-select modifiers always return null.
 */
export function resolveModifierOption(
  modifier: unknown,
  options?: unknown,
  answer?: unknown,
): NormalizedModifierOption | null {
  const m = normalizeModifier(modifier);
  const opts: NormalizedModifierOption[] = (
    (Array.isArray(options) ? options : m.options) as unknown[]
  )
    .map(normalizeModifierOption)
    .filter((o) => lc(o.status || 'active') === 'active')
    .sort((a, b) => a.sort - b.sort);
  if (m.input_type !== 'select' || !opts.length) return null;

  if (answer !== undefined && answer !== null && answer !== '') {
    const want = asString(answer);
    const exact = opts.find((o) => o.value === want || o.label === want);
    if (exact) return exact;
    const ci = opts.find((o) => lc(o.value) === lc(want) || lc(o.label) === lc(want));
    if (ci) return ci;
  }
  return opts.find((o) => o.is_default) ?? null;
}

/**
 * Effective rate row for (modifier, option): the option's rate_overrides
 * merge OVER the matched modifier.rates row.
 *   base row: option present -> rates row whose label matches option.value
 *             or option.label (exact then ci); else rates[0].
 *   override bag shaped like a rate row ({retail|cost|per_unit|label,...})
 *     -> merged over the base row.
 *   override bag keyed by rows ({<key>: {...}}) -> the row keyed by
 *     option.value / option.label merges over the base row.
 */
export function resolveModifierRateRow(
  modifier: unknown,
  option?: unknown,
): ModifierRateRow | null {
  const m = normalizeModifier(modifier);
  const opt = option ? normalizeModifierOption(option) : null;
  const warnings: string[] = [];

  let base: ModifierRateRow | null = null;
  if (opt) {
    const hit = m.rates.find((r) => r.label === opt.value || r.label === opt.label)
      ?? m.rates.find((r) => lc(r.label) === lc(opt.value) || lc(r.label) === lc(opt.label));
    base = hit ?? null;
  }
  if (!base) base = m.rates[0] ?? null;

  const bag = opt?.rate_overrides ?? null;
  let overrideRow: Record<string, unknown> | null = null;
  if (isRecord(bag)) {
    if (Object.keys(bag).some((k) => RATE_ROW_KEYS.has(k))) {
      overrideRow = bag; // flat {retail, cost, per_unit, label?} override
    } else if (opt) {
      const keyed =
        (isRecord(bag[opt.value]) ? bag[opt.value] : null) ??
        (isRecord(bag[opt.label]) ? bag[opt.label] : null);
      if (keyed) overrideRow = keyed;
    }
  }

  if (!base && !overrideRow) return null;
  const merged: ModifierRateRow = {
    label: base?.label ?? '',
    retail: base?.retail ?? 0,
    cost: base?.cost ?? 0,
    per_unit: base?.per_unit ?? '',
  };
  if (overrideRow) {
    const o = normalizeRateRow(overrideRow, warnings);
    if (asString(overrideRow.label) !== '') merged.label = o.label;
    if (toFiniteNumber(overrideRow.retail) !== null) merged.retail = o.retail;
    if (toFiniteNumber(overrideRow.cost) !== null) merged.cost = o.cost;
    if (asString(overrideRow.per_unit) !== '') merged.per_unit = o.per_unit;
    if (opt && merged.label === '') merged.label = opt.label;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// identifier-safe variable names
// ---------------------------------------------------------------------------

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Modifier name/label -> a formula identifier. Never blank. */
export const sanitizeModifierVarName = (name: unknown): string => {
  const raw = asString(name).replace(/[^A-Za-z0-9_]/g, '_');
  const squashed = raw.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const candidate = squashed || 'Modifier';
  return IDENT_RE.test(candidate) ? candidate : `M_${candidate}`;
};

const isBuiltinName = (name: string): boolean =>
  BUILTIN_VARIABLE_NAMES.some((b) => b.toLowerCase() === name.toLowerCase());

// ---------------------------------------------------------------------------
// F-08: modifierVarsForPart — env vars one modifier contributes
// ---------------------------------------------------------------------------

const numericAnswer = (
  m: NormalizedPricingModifier,
  answer: { present: boolean; value: unknown },
  option: NormalizedModifierOption | null,
): number | null => {
  switch (m.input_type) {
    case 'checkbox':
      if (!answer.present) return 0;
      return answer.value === true || answer.value === 'true' ||
        num(answer.value, NaN) === 1 ? 1 : 0;
    case 'select':
      if (option) return toFiniteNumber(option.value) ?? 1;
      return 0;
    case 'formula':
      return null; // evaluated downstream — see buildModifierFormulaEnv
    case 'number':
    case 'text':
    default:
      return answer.present ? (toFiniteNumber(answer.value) ?? 0) : 0;
  }
};

/**
 * Env vars `modifier` contributes for `part` under the caller's `answers`.
 * Returns { vars, answer, option, rate } — vars merges into a FormulaEnv;
 * option/rate expose the resolution for priceModifierEffect chaining.
 * The bare <Name> var is skipped when it would shadow a builtin (F-07 rule).
 */
export function modifierVarsForPart(
  part: unknown,
  modifier: unknown,
  answers?: unknown,
): ModifierVarsResult {
  const m = normalizeModifier(modifier);
  void part; // part context is carried by the env/attachment gates upstream
  const vars: Record<string, unknown> = {};
  const base = sanitizeModifierVarName(m.name || m.label || m.id);

  const answer = answerFor(m, answers);
  const option = resolveModifierOption(m, m.options, answer.present ? answer.value : undefined);
  const rate = resolveModifierRateRow(m, option);

  const write = (suffix: string, v: unknown): void => {
    if (suffix === '') {
      if (isBuiltinName(base)) return; // builtins can never be shadowed
      vars[base] = v;
      return;
    }
    vars[`${base}${suffix}`] = v;
  };

  const a = numericAnswer(m, answer, option);
  if (a !== null) write('', a);
  if (rate) {
    write('_Rate', rate.retail); // the per-unit rate formulas multiply by
    write('_Retail', rate.retail);
    write('_Cost', rate.cost);
    write('_Label', option?.label ?? rate.label);
    write('_PerUnit', rate.per_unit);
  } else if (option) {
    write('_Label', option.label);
  }
  return { vars, answer: a, option, rate };
}

// ---------------------------------------------------------------------------
// waste factor (affects_waste)
// ---------------------------------------------------------------------------

/**
 * Part's waste multiplier: waste_factor verbatim when finite >0 (a
 * multiplier like 1.1), else 1 + waste_factor_percent/waste_pct/100,
 * else 1 (no waste).
 */
export function modifierWasteFactor(part: unknown): number {
  if (!isRecord(part)) return 1;
  const direct = toFiniteNumber(part.waste_factor);
  if (direct !== null && direct > 0) return direct;
  for (const f of ['waste_factor_percent', 'waste_pct', 'waste_percent']) {
    const pct = toFiniteNumber(part[f]);
    if (pct !== null) return 1 + pct / 100;
  }
  return 1;
}

/**
 * Quantity the modifier's rate/formula math should see: affects_waste scales
 * qty by the part's waste factor; all other modifiers see qty verbatim.
 */
export function effectiveModifierQuantity(
  part: unknown,
  modifier: unknown,
  quantity: unknown,
): number {
  const q = num(quantity, 1);
  const m = normalizeModifier(modifier);
  return m.affects_waste ? q * modifierWasteFactor(part) : q;
}

// ---------------------------------------------------------------------------
// F-08: priceModifierEffect — one modifier's price contribution
// ---------------------------------------------------------------------------

/**
 * Price a modifier's rate-table contribution. `option` is the resolved
 * ModifierOption (resolveModifierOption) or null; rate_overrides merge over
 * modifier.rates. Returns { amount, kind, detail } — see the header for the
 * per_unit -> kind table. min_charge floors amount (raw_amount preserved in
 * detail); include_setup_fee/affects_waste are reported via detail for the
 * caller's compose (this fn receives no part — pass
 * effectiveModifierQuantity() output as `quantity` when affects_waste).
 */
export function priceModifierEffect({
  modifier,
  option = null,
  basePrice = 0,
  quantity = 1,
  area = 0,
}: {
  modifier: unknown;
  option?: unknown;
  basePrice?: unknown;
  quantity?: unknown;
  area?: unknown;
}): ModifierEffectResult {
  const m = normalizeModifier(modifier);
  const opt = option ? normalizeModifierOption(option) : null;
  const rate = resolveModifierRateRow(m, opt);

  const perUnit = lc(rate?.per_unit);
  const kind: ModifierEffectKind = PER_UNIT_KIND[perUnit] ?? 'flat';
  const qty = num(quantity, 1);
  const sqft = num(area);
  const base = num(basePrice);
  const r = rate?.retail ?? 0;

  let raw = 0;
  if (rate) {
    if (kind === 'per_unit') raw = r * qty;
    else if (kind === 'per_sqft') raw = r * sqft;
    else if (kind === 'percent') raw = base * (r / 100);
    else raw = r; // flat
  }

  const floored = m.min_charge > 0 && raw < m.min_charge;
  const amount = floored ? m.min_charge : raw;

  const detail: Record<string, unknown> = {
    modifier: m.name || m.label || m.id,
    option: opt ? { label: opt.label, value: opt.value } : null,
    rate_label: rate?.label ?? null,
    retail: r,
    cost: rate?.cost ?? 0,
    per_unit: rate?.per_unit ?? '',
    quantity: qty,
    area: sqft,
    base_price: base,
    raw_amount: raw,
    min_charge: m.min_charge,
    min_charge_applied: floored,
    include_setup_fee: m.include_setup_fee,
    setup_fee: m.include_setup_fee ? m.setup_fee : 0,
    affects_waste: m.affects_waste,
    no_rate: !rate,
  };
  if (perUnit !== '' && PER_UNIT_KIND[perUnit] === undefined) {
    detail.unrecognized_per_unit = rate?.per_unit ?? '';
  }
  return { amount, kind, detail };
}

// ---------------------------------------------------------------------------
// F-10: buildModifierFormulaEnv — env for evaluateFormula
// ---------------------------------------------------------------------------

/**
 * Compose the FormulaEnv a part's modifier formulas evaluate against.
 * Layers (see header): F-07 builtins + globals <- part meta vars <- modifier
 * answer vars in display_order (formula-typed modifiers evaluated in order
 * so later modifiers can reference earlier <Name> amounts).
 */
export function buildModifierFormulaEnv({
  part = null,
  modifiers = [],
  options = [],
  answers = {},
  globals = undefined,
}: {
  part?: Record<string, unknown> | null;
  modifiers?: unknown;
  options?: unknown;
  answers?: unknown;
  globals?: unknown;
} = {}): Record<string, unknown> {
  const p = isRecord(part) ? part : null;
  const env = buildFormulaEnv({ product: p ?? undefined, part: p ?? undefined, globals });

  // part meta — string vars are safe (engine only coerces referenced vars)
  const partType = partTypeOf(p);
  if (partType) env.PartType = partType;
  const waste = modifierWasteFactor(p);
  env.WasteFactor = waste;
  env.PartWasteFactor = waste;

  // options arrive as flat ModifierOption rows — group by parent modifier_id
  const optRows = (Array.isArray(options) ? options : []).map(normalizeModifierOption);
  const optionsFor = (m: NormalizedPricingModifier): NormalizedModifierOption[] => {
    if (m.options.length) return m.options;
    const mid = lc(m.id);
    const mine = mid ? optRows.filter((o) => lc(o.modifier_id) === mid) : [];
    return mine.sort((a, b) => a.sort - b.sort);
  };

  for (const m of pricingModifiersFor(p, modifiers)) {
    const withOpts: NormalizedPricingModifier = { ...m, options: optionsFor(m) };
    const { vars } = modifierVarsForPart(p, withOpts, answers);
    for (const [k, v] of Object.entries(vars)) {
      env[canonicalVariableName(k, env)] = v;
    }
    // formula-typed modifiers: evaluate in display_order against the env
    // built so far and inject <Name> = amount — this is the dependency/order
    // channel (later modifiers can reference earlier modifier values).
    if (m.input_type === 'formula' && m.formula_text) {
      const r = evaluateModifierFormula(withOpts, env);
      if (r.ok) env[canonicalVariableName(sanitizeModifierVarName(m.name || m.label || m.id), env)] = r.amount;
    }
  }
  return env;
}

// ---------------------------------------------------------------------------
// F-10: evaluateModifierFormula — formula_text -> amount, flags honored
// ---------------------------------------------------------------------------

/**
 * Evaluate a modifier's formula_text against `env` (typically from
 * buildModifierFormulaEnv). Never throws — returns
 * { ok, amount, error, pos?, raw_amount?, include_setup_fee?, setup_fee?, detail? }.
 * Flag effects per the header: min_charge floors, affects_waste scales the
 * Quantity the formula sees, include_setup_fee marks the result for the
 * caller's setup compose, inventoried_part_type fails closed when
 * env.PartType was injected and mismatches.
 */
export function evaluateModifierFormula(
  modifier: unknown,
  env: Record<string, unknown> | null | undefined,
): ModifierFormulaResult {
  const m = normalizeModifier(modifier);
  const envSafe: Record<string, unknown> = isRecord(env) ? env : {};

  // inventoried_part_type — second gate behind pricingModifiersFor; only
  // verifiable when the env carries the PartType marker.
  if (m.inventoried_part_type !== '') {
    const envType = asString(envSafe.PartType);
    if (envType !== '' && lc(envType) !== lc(m.inventoried_part_type)) {
      return {
        ok: false,
        amount: 0,
        error: `modifier '${m.name || m.id}' requires inventoried_part_type '${m.inventoried_part_type}', part is '${envType}'`,
        pos: 0,
      };
    }
  }

  const src = m.formula_text;
  if (!src) {
    return { ok: false, amount: 0, error: 'modifier has no formula_text', pos: 0 };
  }

  // affects_waste — the formula sees Quantity scaled by the part's waste
  // factor (env.WasteFactor / env.PartWasteFactor injected by
  // buildModifierFormulaEnv; a caller-built env may supply either).
  const waste = toFiniteNumber(envSafe.WasteFactor) ??
    toFiniteNumber(envSafe.PartWasteFactor) ?? 1;
  const rawQty = toFiniteNumber(envSafe.Quantity) ?? 1;
  const effQty = m.affects_waste ? rawQty * waste : rawQty;
  const effEnv: Record<string, unknown> = m.affects_waste
    ? { ...envSafe, Quantity: effQty, EffectiveQuantity: effQty, WasteFactor: waste }
    : { ...envSafe, EffectiveQuantity: rawQty, WasteFactor: waste };

  const r = evaluateFormula(src, effEnv);
  if (!r.ok) {
    return { ok: false, amount: 0, error: r.error, pos: r.pos };
  }

  const raw = r.value;
  const floored = m.min_charge > 0 && raw < m.min_charge;
  const amount = floored ? m.min_charge : raw;

  return {
    ok: true,
    amount,
    error: null,
    raw_amount: raw,
    include_setup_fee: m.include_setup_fee,
    setup_fee: m.include_setup_fee ? m.setup_fee : 0,
    detail: {
      modifier: m.name || m.label || m.id,
      formula_text: src,
      min_charge: m.min_charge,
      min_charge_applied: floored,
      affects_waste: m.affects_waste,
      waste_factor: waste,
      quantity: rawQty,
      quantity_effective: effQty,
      inventoried_part_type: m.inventoried_part_type,
      pricing_tier_id: m.pricing_tier_id,
    },
  };
}
