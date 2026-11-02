// Double-sided (duplex) part pricing — pure TS, no entity/io access.
// (ESTIMATOR_MASTERPLAN F-18; COREBRIDGE_MAP §8 Options: part config carries
// "double-sided rules"; Machines carry per-part/machine "second-side"
// overrides that WIN over the part-level rule.)
//
// CoreBridge double-sided semantics: a part flagged double_sided prices its
// second (reverse) side by a configurable rule instead of simply doubling
// the line. The rule is a {mode, value} pair:
//
//   full_price    second side = first side          (the CoreBridge default —
//                                                  machineCosts.ts pins the
//                                                  same floor via
//                                                  DEFAULT_SECOND_SIDE_PCT=100:
//                                                  "no silent duplex discount")
//   half_price    second side = first side x 0.5
//   percent       second side = first side x value/100   (value = percent of
//                                                  the first-side SELL price;
//                                                  interoperates with the
//                                                  Machine.second_side_price_pct
//                                                  dangling field priced by
//                                                  machineCosts.priceMachineStep)
//   flat          second side = value               (one pinned $ charge for
//                                                  the whole reverse side —
//                                                  NOT per unit; use
//                                                  machine_rate for per-unit)
//   machine_rate  second side = rate x qty factor   (value/rate = the machine's
//                                                  $/unit second-side run rate;
//                                                  qty factor = the line
//                                                  quantity passed by the
//                                                  caller — see below)
//   free          second side = 0                   (duplex included in price)
//
// The map documents the rules' existence but no enumerated vocabulary, so the
// mode set above is the F-18 contract. 'percent' is the interop mode: value
// 100 ≡ full_price, 50 ≡ half_price, 0 ≡ free.
//
// ---------------------------------------------------------------------------
// Field contract
// ---------------------------------------------------------------------------
// Declared (BuilderPart.jsonc / PartTemplate.jsonc):
//   double_sided : boolean — "Whether this part is produced double-sided."
//
// Tolerated dangling fields (never required, read when present):
//   part.second_side_pricing | secondSidePricing | double_sided_pricing |
//     duplex_pricing | second_side_rule | second_side_price_rule |
//     second_side | duplex        — {mode, value} config record. Scalar
//     shorthand on these fields: a mode token reads as that mode, a bare
//     number/percent-string reads as percent mode (the machineCosts
//     second_side_price_pct convention); a boolean on second_side/duplex
//     reads as the double-sided flag, not a rule.
//   part.second_side_price_pct | secondSidePricePct | second_side_pct |
//     duplex_price_pct            — bare percent fields → percent mode
//     (same alias family machineCosts.normalizeMachine understands).
//   part.two_sided | doubleSided | is_double_sided | sides | side_count |
//     number_of_sides             — double-sided flag aliases: booleans take
//     truthy/'true'/'yes'/'1' forms; side-count fields take 2/'2'/'two'/
//     'double'/'duplex'.
//
// Config-record inner aliases:
//   mode   <- mode | type | rule | pricing_mode | second_side_mode |
//             charge_mode | method
//   value  <- value | price_pct | pct | percent | amount | rate | flat_fee |
//             second_side_price_pct   (the $/unit rate under machine_rate)
//   factor <- factor | multiplier     (ratio-of-side-1 escape hatch — kept
//             OUT of value so a factor never reads as a $/unit rate)
//
// machine_override (call arg) shapes — SAME normalization as a config record,
// plus: a bare finite number → percent mode; {second_side_price_pct|price_pct
// |pct|percent} with no mode → percent; {flat_fee|amount|fixed_price|
// flat_price} with no mode → flat; {rate|second_side_rate|unit_rate} with no
// mode → machine_rate. Pass machinePartOverride()'s second_side_price_pct
// straight through as {second_side_price_pct: n} or a bare n.
//
// Precedence (spec + map §8 "customer tier → part → machine override"):
//   machine_override rule > part.second_side_pricing family >
//   part.second_side_price_pct family > 'full_price' default.
//
// ---------------------------------------------------------------------------
// Money semantics (mirrors pricingEngine.ts / machineCosts.ts)
// ---------------------------------------------------------------------------
// side1_price is the LINE-TOTAL already charged for side 1 (post-tier, post-
// modifier — this module only sees the number). Money rounds half-up to cents
// (round2 EPSILON convention); per-unit figures round4. second_side_price and
// total are always cent-consistent: total = round2(side1) + round2(amount).
//
// Fail-closed value policy (never silently undercharge): a resolvable mode
// missing its value warns and prices at FULL side-1 price — percent defaults
// to 100 (DEFAULT_SECOND_SIDE_PCT parity), flat/machine_rate fall back to
// full_price. Explicit value 0 IS a real value (a configured 'flat' 0 or
// 'percent' 0 legitimately means free reverse side).
//
// 'machine_rate' qty factor: callers pass qty | quantity | side1_qty | units
// in the arg bag (doubleSidedQuote forwards its qty). With no factor supplied
// the rate applies once (factor 1 — i.e. the call degenerates to a flat
// rate charge). A 'factor'/'multiplier' field in lieu of rate multiplies the
// side-1 price directly (documented escape hatch for ratio-priced machines).
//
// Never throws: non-record parts/inputs degrade to {mode:'none', amount:0}.

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

const toFiniteNumber = (v: unknown): number | null => {
  if (
    v === null || v === undefined || v === '' ||
    typeof v === 'object' || typeof v === 'function' ||
    typeof v === 'symbol' || typeof v === 'bigint' ||
    typeof v === 'boolean' // booleans are flags (Number(true)=1 must not
                           // read as a 1%/1-unit value on rule fields)
  ) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const num = (v: unknown, fallback = 0): number => toFiniteNumber(v) ?? fallback;

const lc = (v: unknown): string => asString(v).toLowerCase();

/** Shared pricing convention: half-up cents with the float-epsilon nudge. */
export const round2 = (n: unknown): number =>
  Math.round((num(n) + Number.EPSILON) * 100) / 100;

/** Unit-price precision, same convention as the rest of the pricing family. */
export const round4 = (n: unknown): number =>
  Math.round((num(n) + Number.EPSILON) * 10000) / 10000;

const firstField = (rec: Record<string, unknown>, fields: readonly string[]): unknown => {
  for (const f of fields) {
    if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') return rec[f];
  }
  return undefined;
};

const firstFinite = (rec: Record<string, unknown> | null, fields: readonly string[]): number | null => {
  if (!rec) return null;
  for (const f of fields) {
    const n = toFiniteNumber(rec[f]);
    if (n !== null) return n;
  }
  return null;
};

/** '15%' / '50 pct' style percent spellings coerce to the bare number. */
const pctNumber = (v: unknown): number | null => {
  if (typeof v === 'string') {
    const stripped = v.replace(/[%\s]/g, '').replace(/pct$/i, '');
    return toFiniteNumber(stripped === '' ? null : stripped);
  }
  return toFiniteNumber(v);
};

// ---------------------------------------------------------------------------
// mode vocabulary
// ---------------------------------------------------------------------------

export const DOUBLE_SIDED_MODES = Object.freeze([
  'full_price',
  'half_price',
  'percent',
  'flat',
  'machine_rate',
  'free',
] as const);

export type DoubleSidedMode = typeof DOUBLE_SIDED_MODES[number];

/** Sentinel result mode when the part is NOT produced double-sided. */
export const NO_SECOND_SIDE = 'none' as const;

// 'none'/'no_charge' style config spellings normalize to 'free' — a part that
// IS double-sided whose rule says "no charge" means free, not "not duplex".
const MODE_ALIAS: Record<string, DoubleSidedMode> = {
  full_price: 'full_price',
  'full-price': 'full_price',
  full: 'full_price',
  same_price: 'full_price',
  'same-price': 'full_price',
  same: 'full_price',
  both_sides: 'full_price',
  both_sides_full: 'full_price',
  double: 'full_price',
  double_price: 'full_price',
  duplex: 'full_price',
  duplex_full: 'full_price',
  '100': 'full_price',
  '100%': 'full_price',
  '100_pct': 'full_price',
  '100pct': 'full_price',
  half_price: 'half_price',
  'half-price': 'half_price',
  half: 'half_price',
  '50': 'half_price',
  '50%': 'half_price',
  '50_pct': 'half_price',
  '50pct': 'half_price',
  fifty: 'half_price',
  fifty_percent: 'half_price',
  percent: 'percent',
  pct: 'percent',
  percentage: 'percent',
  percent_of_first: 'percent',
  percent_of_side1: 'percent',
  pct_of_first: 'percent',
  of_first: 'percent',
  second_side_pct: 'percent',
  price_pct: 'percent',
  flat: 'flat',
  flat_fee: 'flat',
  flat_amount: 'flat',
  'flat-fee': 'flat',
  fixed: 'flat',
  fixed_fee: 'flat',
  fixed_amount: 'flat',
  fixed_price: 'flat',
  amount: 'flat',
  fee: 'flat',
  machine_rate: 'machine_rate',
  'machine-rate': 'machine_rate',
  machine: 'machine_rate',
  rate: 'machine_rate',
  unit_rate: 'machine_rate',
  per_unit: 'machine_rate',
  per_unit_rate: 'machine_rate',
  machine_priced: 'machine_rate',
  machine_price: 'machine_rate',
  free: 'free',
  none: 'free',
  no_charge: 'free',
  'no-charge': 'free',
  nocharge: 'free',
  included: 'free',
  complimentary: 'free',
  '0': 'free',
};

/** Unknown/blank tokens normalize to null (caller warns + falls back). */
export const normalizeDoubleSidedMode = (v: unknown): DoubleSidedMode | null =>
  isRecord(v) ? null : MODE_ALIAS[lc(v)] ?? null;

// ---------------------------------------------------------------------------
// flag aliases — isDoubleSided
// ---------------------------------------------------------------------------

// Spec aliases first (double_sided===true | sides===2 | two_sided===true),
// then the tolerated spellings. String bools ('true'/'yes'/'1') count; a
// RECORD under second_side/duplex is a pricing rule, not a flag.
const BOOL_FLAG_FIELDS = [
  'double_sided', 'doubleSided', 'two_sided', 'twoSided', 'is_double_sided',
  'second_side', 'duplex',
] as const;

const SIDE_COUNT_FIELDS = [
  'sides', 'side_count', 'number_of_sides', 'sides_count',
] as const;

const truthyFlag = (v: unknown): boolean => {
  if (v === true) return true;
  if (typeof v === 'boolean') return false;
  const s = lc(v);
  return s === 'true' || s === 'yes' || s === 'on' || s === '1';
};

const sideCountIsTwo = (v: unknown): boolean => {
  const n = toFiniteNumber(v);
  if (n !== null) return n === 2;
  const s = lc(v);
  return s === 'two' || s === 'double' || s === 'duplex' || s === 'both';
};

/**
 * Whether the part is produced double-sided. Spec rule —
 * part.double_sided===true || part.sides===2 || part.two_sided===true —
 * widened by the documented alias spellings (see header). Never throws.
 */
export function isDoubleSided(part: unknown): boolean {
  if (!isRecord(part)) return false;
  for (const f of BOOL_FLAG_FIELDS) {
    const v = part[f];
    if (isRecord(v)) continue; // config record, not a flag
    if (truthyFlag(v)) return true;
  }
  for (const f of SIDE_COUNT_FIELDS) {
    if (part[f] === undefined || part[f] === null || part[f] === '') continue;
    if (sideCountIsTwo(part[f])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// rule extraction
// ---------------------------------------------------------------------------

const CONFIG_FIELDS = [
  'second_side_pricing', 'secondSidePricing', 'double_sided_pricing',
  'duplex_pricing', 'second_side_rule', 'second_side_price_rule',
  'second_side', 'duplex',
] as const;

const PART_PCT_FIELDS = [
  'second_side_price_pct', 'secondSidePricePct', 'second_side_pct',
  'duplex_price_pct',
] as const;

const MODE_FIELDS = [
  'mode', 'type', 'rule', 'pricing_mode', 'second_side_mode', 'charge_mode',
  'method',
] as const;

// 'factor'/'multiplier' deliberately excluded — under machine_rate they mean
// ratio-of-side-1 (escape hatch), not the $/unit rate `value` carries.
const VALUE_FIELDS = [
  'value', 'price_pct', 'pct', 'percent', 'amount', 'rate', 'flat_fee',
  'second_side_price_pct',
] as const;

const PCT_ONLY_FIELDS = [
  'second_side_price_pct', 'secondSidePricePct', 'price_pct', 'pct', 'percent',
] as const;

const FLAT_ONLY_FIELDS = [
  'flat_fee', 'flat_price', 'fixed_price', 'amount', 'fee', 'price',
] as const;

const RATE_ONLY_FIELDS = [
  'rate', 'second_side_rate', 'unit_rate', 'per_unit_rate',
] as const;

export interface DoubleSidedRule {
  mode: DoubleSidedMode;
  /** Raw configured value (percent | $ flat | $/unit rate) or null. */
  value: number | null;
  /** Ratio escape hatch for machine_rate (factor|multiplier field). */
  factor: number | null;
  /** Which source supplied the rule. */
  source: 'machine_override' | 'part' | 'part_pct_field' | 'default';
  /** Token as configured (before alias normalization), for audit. */
  configured: string;
  /**
   * False when a mode token was configured but isn't a known mode — the rule
   * is skipped at resolve time (machineCosts "unknown price_calc ignored"
   * precedent) and the token surfaces via warnings instead.
   */
  recognized: boolean;
}

/**
 * Normalize one rule-ish input ({mode,value} record, bare number, or a record
 * carrying a mode-less percent/flat/rate field). Returns null when nothing
 * usable is present — NOT a fallback, just "no rule here". `value` keeps the
 * configured number as-is; sign/magnitude handling lives at price time.
 */
const normalizeRule = (raw: unknown, source: DoubleSidedRule['source']): DoubleSidedRule | null => {
  if (raw === undefined || raw === null || raw === '') return null;

  // Scalar shorthand on a rule slot: a mode token ('half_price', 'free'…)
  // carries no value; a bare number / percent string ('60', '60%') reads as
  // percent of side 1 (the machineCosts second_side_price_pct convention).
  if (!isRecord(raw)) {
    const token = normalizeDoubleSidedMode(raw);
    if (token !== null) {
      return {
        mode: token, value: null, factor: null, source,
        configured: asString(raw), recognized: true,
      };
    }
    const bare = pctNumber(raw);
    return bare !== null
      ? { mode: 'percent', value: bare, factor: null, source, configured: String(bare), recognized: true }
      : null;
  }

  const configuredToken = firstField(raw, MODE_FIELDS);
  const value = firstFinite(raw, VALUE_FIELDS);
  const factor = firstFinite(raw, ['factor', 'multiplier']);
  const mode = normalizeDoubleSidedMode(configuredToken);

  if (mode !== null) {
    return { mode, value, factor, source, configured: asString(configuredToken), recognized: true };
  }
  if (configuredToken !== undefined) {
    // A mode token was configured but isn't a known mode — unusable rule,
    // skipped by resolveSecondSideRule (its token is echoed for warnings).
    return {
      mode: 'full_price', value, factor, source,
      configured: asString(configuredToken), recognized: false,
    };
  }

  // Mode-less record: infer the mode from which value family is present.
  const pct = firstFinite(raw, PCT_ONLY_FIELDS);
  if (pct !== null) {
    return { mode: 'percent', value: pct, factor, source, configured: `${pct}%`, recognized: true };
  }
  const rate = firstFinite(raw, RATE_ONLY_FIELDS);
  if (rate !== null) {
    return { mode: 'machine_rate', value: rate, factor, source, configured: `rate:${rate}`, recognized: true };
  }
  const flat = firstFinite(raw, FLAT_ONLY_FIELDS);
  if (flat !== null) {
    return { mode: 'flat', value: flat, factor, source, configured: `flat:${flat}`, recognized: true };
  }
  if (factor !== null) {
    return { mode: 'machine_rate', value: null, factor, source, configured: `factor:${factor}`, recognized: true };
  }
  return null;
};

/**
 * The part-level double-sided rule: config record family first, then the
 * bare percent-field family (machineCosts interop). null when unconfigured.
 */
export function partSecondSideRule(part: unknown): DoubleSidedRule | null {
  if (!isRecord(part)) return null;
  for (const f of CONFIG_FIELDS) {
    const v = part[f];
    if (v === undefined || v === null || v === '') continue;
    const rule = normalizeRule(v, 'part');
    if (rule !== null) return rule;
  }
  const pct = firstFinite(part, PART_PCT_FIELDS);
  if (pct !== null) {
    return {
      mode: 'percent', value: pct, factor: null,
      source: 'part_pct_field', configured: `${pct}%`, recognized: true,
    };
  }
  return null;
}

/**
 * First unrecognized mode token found on a rule-ish input (for warnings).
 * `slots === null` checks the input itself (machine_override bag or scalar);
 * otherwise `slots` names part fields whose RECORD values get the same
 * MODE_FIELDS check — scalar slot values are flags/shorthand, never warned.
 */
const badModeToken = (input: unknown, slots: readonly string[] | null): string | null => {
  if (input === undefined || input === null || input === '') return null;
  const tokenOf = (rec: Record<string, unknown>): string | null => {
    const t = firstField(rec, MODE_FIELDS);
    return t !== undefined && normalizeDoubleSidedMode(t) === null ? asString(t) : null;
  };
  if (!isRecord(input)) {
    return normalizeDoubleSidedMode(input) === null && pctNumber(input) === null
      ? asString(input) : null;
  }
  if (slots === null) return tokenOf(input);
  for (const f of slots) {
    const v = input[f];
    if (!isRecord(v)) continue;
    const hit = tokenOf(v);
    if (hit !== null) return hit;
  }
  return null;
};

/**
 * Effective second-side rule for a (part, machine_override) pair.
 * machine_override wins when it yields ANY usable rule; a rule carrying an
 * unrecognized mode token is skipped (machineCosts "unknown price_calc
 * ignored" precedent) so the next source applies; otherwise the part's own
 * rule; otherwise the 'full_price' default (DEFAULT_SECOND_SIDE_PCT=100
 * parity — an unconfigured duplex part charges its second side in full).
 */
export function resolveSecondSideRule(part: unknown, machine_override?: unknown): DoubleSidedRule {
  const mo = normalizeRule(machine_override, 'machine_override');
  if (mo !== null && mo.recognized) return mo;
  const partRule = partSecondSideRule(part);
  if (partRule !== null && partRule.recognized) return partRule;
  return {
    mode: 'full_price', value: null, factor: null,
    source: 'default', configured: 'default', recognized: true,
  };
}

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------

const QTY_FACTOR_FIELDS = ['qty', 'quantity', 'side1_qty', 'units'] as const;

export interface SecondSidePriceResult {
  /** Effective mode, or 'none' when the part is not double-sided. */
  mode: DoubleSidedMode | typeof NO_SECOND_SIDE;
  /** Resolved second-side charge (cents-rounded). Same as second_side_price. */
  amount: number;
  /** Resolved second-side charge (cents-rounded). */
  second_side_price: number;
  /** round2(side1_price) + second_side_price — always cent-consistent. */
  total: number;
  /** Echoed rounded first-side line price the charge was computed against. */
  side1_price: number;
  /** Config value actually used (percent | flat $ | rate $/unit | factor). */
  value: number | null;
  /** Whether the part priced a second side at all. */
  double_sided: boolean;
  /** Where the rule came from ('disabled' when not double-sided). */
  source: DoubleSidedRule['source'] | 'disabled';
  /** Token configured upstream, echoed for audit. */
  configured_mode: string;
  warnings: string[];
}

/**
 * Price the reverse side of a double-sided line. `side1_price` is the
 * side-1 LINE total (post-tier/modifier money); the mode table in the header
 * maps it to the second-side charge. `machine_override` ({mode,value} | bare
 * percent | mode-less {second_side_price_pct|rate|flat_fee…}) beats the
 * part's own rule. Optional qty/quantity/side1_qty/units feed the
 * 'machine_rate' qty factor.
 */
export function resolveSecondSidePrice(args: {
  part?: unknown;
  side1_price?: unknown;
  machine_override?: unknown;
  qty?: unknown;
  quantity?: unknown;
  side1_qty?: unknown;
  units?: unknown;
} = {}): SecondSidePriceResult {
  const a = isRecord(args) ? args : {};
  const part = a.part;
  const s1 = round2(Math.max(0, num(a.side1_price)));
  const warnings: string[] = [];

  const disabled = (extra: Partial<SecondSidePriceResult> = {}): SecondSidePriceResult => ({
    mode: NO_SECOND_SIDE,
    amount: 0,
    second_side_price: 0,
    total: s1,
    side1_price: s1,
    value: null,
    double_sided: false,
    source: 'disabled',
    configured_mode: '',
    warnings,
    ...extra,
  });

  if (!isDoubleSided(part)) return disabled();

  const badMo = badModeToken(a.machine_override, null);
  if (badMo !== null) {
    warnings.push(`unrecognized machine_override second-side mode '${badMo}' — ignored`);
  }
  const badPart = badModeToken(part, CONFIG_FIELDS);
  if (badPart !== null) {
    warnings.push(`unrecognized part second-side mode '${badPart}' — ignored`);
  }

  const rule = resolveSecondSideRule(part, a.machine_override);
  const configured = rule.configured;

  // Value sanity: negative values clamp to 0 (a discount config can't flip
  // sign into a credit); a mode missing its value fails CLOSED at the
  // per-mode default below (never silently undercharge a produced side).
  let value = rule.value;
  if (value !== null && value < 0) {
    warnings.push(`${rule.mode} value ${value} clamped to 0`);
    value = 0;
  }

  let amount: number;
  switch (rule.mode) {
    case 'free':
      amount = 0;
      break;
    case 'half_price':
      amount = s1 * 0.5;
      break;
    case 'percent': {
      const pct = value ?? 100;
      if (value === null) warnings.push("percent mode missing value — 100% assumed");
      if (pct > 100) warnings.push(`percent ${pct} > 100 — second side priced above side 1`);
      amount = s1 * (pct / 100);
      break;
    }
    case 'flat': {
      if (value === null) {
        warnings.push("flat mode missing value — full side-1 price assumed");
        amount = s1;
      } else {
        amount = value;
      }
      break;
    }
    case 'machine_rate': {
      if (value !== null) {
        // $/unit machine rate x the caller-supplied qty factor (default 1).
        const mo = isRecord(a.machine_override) ? a.machine_override : null;
        const qtyFactor = firstFinite(a, QTY_FACTOR_FIELDS)
          ?? firstFinite(mo, ['qty', 'quantity', 'qty_factor', 'side1_qty', 'units'])
          ?? firstFinite(isRecord(part) ? part : null, ['qty_factor', 'side1_qty_factor'])
          ?? 1;
        amount = value * Math.max(0, qtyFactor);
      } else if (rule.factor !== null) {
        // Ratio escape hatch: factor/multiplier x side-1 price.
        amount = s1 * Math.max(0, rule.factor);
      } else {
        warnings.push("machine_rate mode missing rate — full side-1 price assumed");
        amount = s1;
      }
      break;
    }
    case 'full_price':
    default:
      amount = s1;
      break;
  }

  const charge = round2(amount);
  return {
    mode: rule.mode,
    amount: charge,
    second_side_price: charge,
    total: round2(s1 + charge),
    side1_price: s1,
    value,
    double_sided: true,
    source: rule.source,
    configured_mode: configured,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// line-level quote
// ---------------------------------------------------------------------------

export interface DoubleSidedQuoteResult {
  /** 'none' when the part is not produced double-sided. */
  mode: DoubleSidedMode | typeof NO_SECOND_SIDE;
  quantity: number;
  side1_unit_price: number;
  /** round2(qty x side1_unit_price). */
  side1_total: number;
  /** Second-side line charge (0 when not double-sided). */
  side2_total: number;
  /** Per-unit second-side charge, round4 (0 when qty is 0 or not duplex). */
  second_side_unit_price: number;
  /** side1_total + side2_total — the full line price. */
  total: number;
  double_sided: boolean;
  /** Config value used (percent | flat $ | rate $/unit | factor) or null. */
  value: number | null;
  source: DoubleSidedRule['source'] | 'disabled';
  configured_mode: string;
  warnings: string[];
}

/**
 * Full double-sided line quote: side1_total = qty x side1_unit_price, then
 * the second-side rule over that total ('machine_rate' receives qty as its
 * factor, so a $/unit machine rate prices per-piece). `machine_override`
 * beats the part's rule. Not double-sided → side2_total 0, mode 'none'
 * (disabled-part passthrough: total === side1_total).
 */
export function doubleSidedQuote(
  part: unknown,
  qty: unknown,
  side1_unit_price: unknown,
  machine_override?: unknown,
): DoubleSidedQuoteResult {
  const quantity = Math.max(0, num(qty));
  const unit = round4(Math.max(0, num(side1_unit_price)));
  const side1Total = round2(quantity * unit);
  const res = resolveSecondSidePrice({
    part,
    side1_price: side1Total,
    machine_override,
    qty: quantity,
  });
  return {
    mode: res.mode,
    quantity,
    side1_unit_price: unit,
    side1_total: side1Total,
    side2_total: res.amount,
    second_side_unit_price:
      res.double_sided && quantity > 0 ? round4(res.amount / quantity) : 0,
    total: res.total,
    double_sided: res.double_sided,
    value: res.value,
    source: res.source,
    configured_mode: res.configured_mode,
    warnings: res.warnings,
  };
}
