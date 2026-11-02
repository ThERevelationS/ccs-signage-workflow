// Size-based discounts — pure TS, no entity/io access.
// (ESTIMATOR_MASTERPLAN F-14; entity field: BuilderPart.size_discounts[]
// declared in base44/entities/BuilderPart.jsonc.)
//
// CoreBridge volume-discount semantics: a part carries threshold rows keyed by
// a size basis; when the part's measured size reaches a threshold the row's
// discount_pct comes off the already-tier-priced base (post-tier — this module
// is applied AFTER pricing_tier / modifier math, on whatever base_price the
// caller hands in). The LARGEST qualifying threshold wins (deepest break the
// size earns); rows on the same threshold tie-break to the highest pct.
//
// ---------------------------------------------------------------------------
// Entity contract (BuilderPart.size_discounts[] item shape)
// ---------------------------------------------------------------------------
//   threshold_basis : 'sqft' | 'width_in' | 'height_in' | 'area_sqin' |
//                     'perimeter_in'   (enum; common aliases normalized)
//   threshold_value : number — inclusive lower bound on the basis measure
//   discount_pct    : number — percent off base_price, clamped to [0, 100]
//   label           : string — optional audit/UI label
//
// ---------------------------------------------------------------------------
// Basis measures (measureFor)
// ---------------------------------------------------------------------------
// Given dims {width_in, height_in, quantity?, sqft?} plus the part record as a
// fallback field source (part root, then part.dims, same alias spellings):
//   sqft         dims.sqft when finite, else width_in * height_in / 144
//   width_in     resolved width
//   height_in    resolved height
//   area_sqin    width_in * height_in
//   perimeter_in 2 * (width_in + height_in)
// Missing inputs produce 0 for derived measures — a part that cannot be
// measured never earns a discount (fail-closed). Negative inputs clamp to 0.
// dims.quantity is accepted for API forward-compat: this module does NOT
// auto-multiply any basis by quantity. Callers pricing a whole line's area
// supply dims.sqft = per-piece sqft * quantity themselves.
//
// ---------------------------------------------------------------------------
// Normalization (sizeDiscountsFor)
// ---------------------------------------------------------------------------
// Never throws. Tolerates string numbers ('12'), percent-ish discount spellings
// ('15', '15%'), and alias fields:
//   threshold_basis  <- threshold_basis | basis | measure | measure_basis
//   threshold_value  <- threshold_value | threshold | threshold_sqft | value |
//                       min_value
//   discount_pct     <- discount_pct | discount_percent | discount | pct |
//                       percent
//   label            <- label | name | description
// Rows that can never fire — non-records, unrecognized basis, non-finite
// threshold or pct — are dropped outright. Surviving rows are sorted
// threshold_value ASC, then discount_pct DESC, then label ASC, so resolveSize
// Discount can scan deterministically.
//
// ---------------------------------------------------------------------------
// Money (applyPostTier)
// ---------------------------------------------------------------------------
// Cent-safe: discount_amount and final_price are rounded half-up to cents via
// the shared EPSILON convention, and discount_amount + final_price always
// equals round2(base_price) — the split never drifts a cent. base_price clamps
// to >= 0; pct clamps to [0, 100], so final_price can never go negative.

// ---------------------------------------------------------------------------
// shared coercion (same reject set as modifierPricing/pricingVariables)
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

/** First finite number across a field-name scan; null when none resolve. */
const firstFinite = (rec: Record<string, unknown> | null, fields: readonly string[]): number | null => {
  if (!rec) return null;
  for (const f of fields) {
    const n = toFiniteNumber(rec[f]);
    if (n !== null) return n;
  }
  return null;
};

// ---------------------------------------------------------------------------
// types + constants
// ---------------------------------------------------------------------------

export const SIZE_DISCOUNT_BASES = Object.freeze([
  'sqft',
  'width_in',
  'height_in',
  'area_sqin',
  'perimeter_in',
] as const);

export type SizeDiscountBasis = typeof SIZE_DISCOUNT_BASES[number];

/** One number per basis — the part's measured size on every discount axis. */
export interface SizeDiscountMeasures {
  sqft: number;
  width_in: number;
  height_in: number;
  area_sqin: number;
  perimeter_in: number;
}

export interface NormalizedSizeDiscountRow {
  threshold_basis: SizeDiscountBasis;
  threshold_value: number;
  discount_pct: number;
  label: string;
}

export interface PostTierDiscountResult {
  discount_amount: number;
  final_price: number;
}

export interface SizeDiscountResolution extends PostTierDiscountResult {
  discount_pct: number;
  /** Winning normalized row, or null when no threshold qualified. */
  applied_threshold: NormalizedSizeDiscountRow | null;
  /** All basis measures for audit/display. */
  measure: SizeDiscountMeasures;
}

// ---------------------------------------------------------------------------
// basis aliases (canonical entity spellings first)
// ---------------------------------------------------------------------------

const BASIS_ALIAS: Record<string, SizeDiscountBasis> = {
  sqft: 'sqft',
  sq_ft: 'sqft',
  'sq ft': 'sqft',
  square_feet: 'sqft',
  square_foot: 'sqft',
  area_sqft: 'sqft',
  width_in: 'width_in',
  width: 'width_in',
  w: 'width_in',
  height_in: 'height_in',
  height: 'height_in',
  h: 'height_in',
  area_sqin: 'area_sqin',
  sqin: 'area_sqin',
  sq_in: 'area_sqin',
  'sq in': 'area_sqin',
  square_inches: 'area_sqin',
  square_inch: 'area_sqin',
  area: 'area_sqin',
  perimeter_in: 'perimeter_in',
  perimeter: 'perimeter_in',
  perim: 'perimeter_in',
  perimeter_inches: 'perimeter_in',
};

const normalizeBasis = (v: unknown): SizeDiscountBasis | null =>
  BASIS_ALIAS[lc(v)] ?? null;

// ---------------------------------------------------------------------------
// dims resolution + measures
// ---------------------------------------------------------------------------

const WIDTH_FIELDS = ['width_in', 'width', 'w'] as const;
const HEIGHT_FIELDS = ['height_in', 'height', 'h'] as const;

/** part.dims when it is a record (secondary fallback scan after part root). */
const partDimsRecord = (part: unknown): Record<string, unknown> | null =>
  isRecord(part) && isRecord(part.dims) ? part.dims : null;

const resolveDim = (
  dims: Record<string, unknown> | null,
  part: unknown,
  fields: readonly string[],
): number | null =>
  firstFinite(dims, fields) ??
  firstFinite(isRecord(part) ? part : null, fields) ??
  firstFinite(partDimsRecord(part), fields);

/**
 * The part's measure on every discount basis. `dims` wins over part-carried
 * fields; part root fields win over part.dims. See header for per-basis math.
 * Never throws; every output is finite and >= 0.
 */
export function measureFor(part: unknown, dims: unknown): SizeDiscountMeasures {
  const d = isRecord(dims) ? dims : null;
  const w = resolveDim(d, part, WIDTH_FIELDS);
  const h = resolveDim(d, part, HEIGHT_FIELDS);

  const suppliedSqft = firstFinite(d, ['sqft', 'sq_ft', 'area_sqft']);
  const wPos = w !== null && w > 0 ? w : null;
  const hPos = h !== null && h > 0 ? h : null;

  const clean = (n: number | null): number =>
    n !== null && n > 0 ? n : 0;

  return {
    sqft: clean(
      suppliedSqft !== null
        ? suppliedSqft
        : (wPos !== null && hPos !== null ? (wPos * hPos) / 144 : null),
    ),
    width_in: clean(w),
    height_in: clean(h),
    area_sqin: wPos !== null && hPos !== null ? wPos * hPos : 0,
    perimeter_in: wPos !== null && hPos !== null ? 2 * (wPos + hPos) : 0,
  };
}

// ---------------------------------------------------------------------------
// row normalization
// ---------------------------------------------------------------------------

const THRESHOLD_VALUE_FIELDS = [
  'threshold_value', 'threshold', 'threshold_sqft', 'value', 'min_value',
] as const;
const DISCOUNT_PCT_FIELDS = [
  'discount_pct', 'discount_percent', 'discount', 'pct', 'percent',
] as const;
const BASIS_FIELDS = [
  'threshold_basis', 'basis', 'measure', 'measure_basis', 'unit_basis',
] as const;
const LABEL_FIELDS = ['label', 'name', 'description'] as const;

const firstField = (rec: Record<string, unknown>, fields: readonly string[]): unknown => {
  for (const f of fields) {
    if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') return rec[f];
  }
  return undefined;
};

/** '15%' / '15 pct' style discount spellings coerce to the bare number. */
const pctNumber = (v: unknown): number | null => {
  if (typeof v === 'string') {
    const stripped = v.replace(/[%\s]/g, '').replace(/pct$/i, '');
    return toFiniteNumber(stripped === '' ? null : stripped);
  }
  return toFiniteNumber(v);
};

const normalizeRow = (raw: unknown): NormalizedSizeDiscountRow | null => {
  if (!isRecord(raw)) return null;
  const basis = normalizeBasis(firstField(raw, BASIS_FIELDS));
  const threshold = toFiniteNumber(firstField(raw, THRESHOLD_VALUE_FIELDS));
  const pct = pctNumber(firstField(raw, DISCOUNT_PCT_FIELDS));
  if (basis === null || threshold === null || pct === null) return null;
  return {
    threshold_basis: basis,
    threshold_value: Math.max(0, threshold),
    discount_pct: Math.min(100, Math.max(0, pct)),
    label: asString(firstField(raw, LABEL_FIELDS)),
  };
};

/**
 * The part's size_discounts[] as normalized, sorted rows (threshold_value ASC,
 * then discount_pct DESC, then label ASC). Unusable rows are dropped — what
 * remains can be priced directly. Never throws; a part with no rows gets [].
 */
export function sizeDiscountsFor(part: unknown): NormalizedSizeDiscountRow[] {
  const raw = isRecord(part)
    ? (part.size_discounts ?? part.sizeDiscounts)
    : undefined;
  const list = Array.isArray(raw) ? raw : [];
  const out: NormalizedSizeDiscountRow[] = [];
  for (const entry of list) {
    const row = normalizeRow(entry);
    if (row !== null) out.push(row);
  }
  out.sort((a, b) =>
    a.threshold_value - b.threshold_value ||
    b.discount_pct - a.discount_pct ||
    a.label.localeCompare(b.label));
  return out;
}

// ---------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------

/** Shared pricing convention: half-up cents with the float-epsilon nudge. */
const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Apply a post-tier percent discount to an already-priced base. Cent-safe:
 * discount_amount + final_price === round2(base_price). Inputs clamp to sane
 * ranges (base >= 0, pct in [0, 100]); non-finite input behaves as 0.
 */
export function applyPostTier(
  base_price: unknown,
  discount_pct: unknown,
): PostTierDiscountResult {
  const base = Math.max(0, num(base_price));
  const pct = Math.min(100, Math.max(0, num(discount_pct)));
  const discount_amount = round2((base * pct) / 100);
  const final_price = round2(base - discount_amount);
  return { discount_amount, final_price };
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the winning size-discount row for a part at the given dims and
 * apply it to `base_price` (post-tier). Winner = the LARGEST threshold_value
 * whose basis measure reaches it (inclusive); equal thresholds tie-break to
 * the highest discount_pct. No qualifying row → zero-discount passthrough
 * (applied_threshold null, final_price = round2(base_price)).
 */
export function resolveSizeDiscount(args: {
  part: unknown;
  dims: unknown;
  base_price: unknown;
}): SizeDiscountResolution {
  const { part, dims, base_price } = isRecord(args) ? args : { part: null, dims: null, base_price: 0 };
  const rows = sizeDiscountsFor(part);
  const measure = measureFor(part, dims);

  let best: NormalizedSizeDiscountRow | null = null;
  for (const row of rows) {
    if (measure[row.threshold_basis] < row.threshold_value) continue;
    if (
      best === null ||
      row.threshold_value > best.threshold_value ||
      (row.threshold_value === best.threshold_value && row.discount_pct > best.discount_pct)
    ) {
      best = row;
    }
  }

  const { discount_amount, final_price } = applyPostTier(
    base_price,
    best === null ? 0 : best.discount_pct,
  );
  return {
    discount_pct: best === null ? 0 : best.discount_pct,
    discount_amount,
    applied_threshold: best,
    final_price,
    measure,
  };
}
