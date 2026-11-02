// Parent sheet/stock sizes + line minimums — pure TS, no entity/io access.
// (ESTIMATOR_MASTERPLAN F-19; entity field: BuilderPart.parent_sizes[]
// declared in base44/entities/BuilderPart.jsonc by A-03.)
//
// CoreBridge semantics: a part's parent_sizes list the stock sheet sizes the
// part can be produced from. When at least one parent carries real dims the
// list CONSTRAINS orderable width/height: a line's dims must match a parent
// within tolerance (orientation may swap unless locked). Parts with no
// dim-bearing parents stay unconstrained — backward compatible with every
// part that predates the field or only records size names.
//
// ---------------------------------------------------------------------------
// Entity contract (BuilderPart.parent_sizes[] item shape)
// ---------------------------------------------------------------------------
// Schema declares items: string — the canonical stored row is a size LABEL
// like '48x96' / '48 x 96 coroplast'. Entries normalize from BOTH forms:
//   string : dims parsed out of the label — first 'N <sep> N' pair wins.
//            Separators: x X × * by. Inch marks (", '', in, in., inch, inches)
//            ignored; foot marks (', ft, ft., feet, foot) scale that dim x12.
//            Fractions ok: '1/2 x 3/4', '48 1/2 x 96'. Unparseable strings
//            keep the label with null dims.
//   object : dims via aliases width_in|width|w, height_in|height|h;
//            extras: label|name|size_label|description,
//            min_qty|minimum_qty|min_quantity,
//            price_override|override_price|fixed_price|price,
//            tolerance_in|tolerance, lock_orientation.
// String dims coerce ('48'). Non-positive dims -> null (can never match).
// label defaults to 'W x H' when an object entry gives dims but no text.
// Entries that produce neither dims nor a label are dropped.
//
// ---------------------------------------------------------------------------
// Constraint semantics (isOrderableSize)
// ---------------------------------------------------------------------------
// - dim-parents = normalized entries with finite positive width_in+height_in.
// - No dim-parents (empty list OR label-only entries like 'A') -> ok:true,
//   unconstrained. Rationale: A-03 stores label rows; a list without dims can
//   name sheets but cannot bound orderable dims — treating it as a hard
//   constraint would reject EVERY line for that part.
// - Requested dims must BOTH be finite > 0 -> else ok:false code 'bad_dims'.
// - Match = |w-pw|<=tol AND |h-ph|<=tol straight, or unless orientation is
//   locked |w-ph|<=tol AND |h-pw|<=tol swapped. Orientation locks when
//   part.lock_orientation === true or the parent row sets it === true.
// - tol = parent.tolerance_in ?? part.tolerance_in|size_tolerance_in|
//   parent_size_tolerance_in ?? DEFAULT_TOLERANCE_IN (0.125in), clamped >= 0.
// - Multiple matching parents pick the closest (smallest max-axis deviation);
//   straight beats swapped for the same parent.
//
// ---------------------------------------------------------------------------
// Minimums (minQtyFor / validateOrderLine)
// ---------------------------------------------------------------------------
// Part minimum chain: part.min_qty ?? part.minimum_qty ?? part.min_quantity
// ?? 1. A matched parent may RAISE (never lower) it:
//   max(part_min, parent.min_qty ?? 1).
// validateOrderLine emits coded errors — 'bad_dims' (non-positive/non-finite
// w/h), 'out_of_parent' (no parent within tolerance; carries a `suggestion`
// for did-you-mean UI), 'below_min_qty' (quantity < resolved minimum; qty
// defaults to 1, non-finite counts as below). ok === errors.length === 0.

// ---------------------------------------------------------------------------
// shared coercion (same reject set as sizeDiscounts/modifierPricing)
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

/** First non-nullish/non-empty field value across a name scan. */
const firstField = (rec: Record<string, unknown> | null, fields: readonly string[]): unknown => {
  if (!rec) return undefined;
  for (const f of fields) {
    if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') return rec[f];
  }
  return undefined;
};

/** First finite number across a field-name scan; null when none resolve. */
const firstFinite = (rec: Record<string, unknown> | null, fields: readonly string[]): number | null =>
  toFiniteNumber(firstField(rec, fields));

/** Finite positive dims only — zero/negative normalize to null. */
const positive = (n: number | null): number | null =>
  n !== null && n > 0 ? n : null;

/** '48.5' style dim text — trims trailing float noise for labels/messages. */
const fmtDim = (n: number): string => String(Math.round(n * 10000) / 10000);

// ---------------------------------------------------------------------------
// types + constants
// ---------------------------------------------------------------------------

export const DEFAULT_TOLERANCE_IN = 0.125;

export const PARENT_SIZE_ERROR_CODES = Object.freeze([
  'bad_dims',
  'out_of_parent',
  'below_min_qty',
] as const);

export type ParentSizeErrorCode = typeof PARENT_SIZE_ERROR_CODES[number];

export type MatchedOrientation = 'straight' | 'swapped';

/** One normalized parent_sizes[] entry. null dims = label-only row. */
export interface ParentSize {
  width_in: number | null;
  height_in: number | null;
  label: string;
  /** Per-parent minimum — may raise (never lower) the part minimum. */
  min_qty?: number;
  /** Per-parent flat price override (pricing engine consumption). */
  price_override?: number;
  /** Per-parent match tolerance in inches. */
  tolerance_in?: number;
  /** Per-parent orientation lock (forbids swapped matching). */
  lock_orientation?: boolean;
}

/** Nearest-parent did-you-mean payload. */
export interface ParentSizeSuggestion extends ParentSize {
  matched_orientation: MatchedOrientation;
  /** Euclidean inch distance to the requested dims (best orientation). */
  distance_in: number;
}

export interface ParentSizeError {
  code: ParentSizeErrorCode;
  message: string;
  /** Present on out_of_parent — nearest orderable size for the UI. */
  suggestion?: ParentSizeSuggestion | null;
}

export interface OrderableSizeResult {
  ok: boolean;
  matched_parent: ParentSize | null;
  matched_orientation: MatchedOrientation | null;
  error: ParentSizeError | null;
}

export interface OrderLineError {
  code: ParentSizeErrorCode;
  message: string;
  /** below_min_qty extras for the UI. */
  min_qty?: number;
  quantity?: number | null;
  /** out_of_parent extra — nearest orderable size. */
  suggestion?: ParentSizeSuggestion | null;
}

export interface OrderLineValidation {
  ok: boolean;
  errors: OrderLineError[];
  matched_parent: ParentSize | null;
  matched_orientation: MatchedOrientation | null;
  min_qty: number;
  quantity: number | null;
}

// ---------------------------------------------------------------------------
// entry normalization
// ---------------------------------------------------------------------------

const WIDTH_FIELDS = ['width_in', 'width', 'w'] as const;
const HEIGHT_FIELDS = ['height_in', 'height', 'h'] as const;
const LABEL_FIELDS = ['label', 'name', 'size_label', 'description'] as const;
const MIN_QTY_FIELDS = ['min_qty', 'minimum_qty', 'min_quantity'] as const;
const PRICE_OVERRIDE_FIELDS = ['price_override', 'override_price', 'fixed_price', 'price'] as const;
const TOLERANCE_FIELDS = ['tolerance_in', 'tolerance'] as const;
const PARENT_SIZES_FIELDS = ['parent_sizes', 'parentSizes', 'parent_size_list'] as const;
const PART_TOLERANCE_FIELDS = [
  'tolerance_in', 'parent_size_tolerance_in', 'size_tolerance_in',
] as const;

// Dim token: '48' | '48.5' | '1/2' | '48 1/2'. Pure-fraction branch first so
// '1/2' doesn't tokenize as '1'.
const DIM_TOKEN = String.raw`(\d+\s*\/\s*\d+|\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?)`;
// Unit mark: '' or " or ″ = inches; ' or ′ or ft/feet/foot = feet; in/inch = inches.
const DIM_UNIT = String.raw`(''|["″'′]|feet|foot|ft\.?|inch(?:es)?|in\.?)`;
// Pair: 'N u? <x|×|*|by> N u?'. 'by' needs word boundaries so '48by96' (and
// stray prose 'by') never split.
const DIM_PAIR_RE = new RegExp(
  `${DIM_TOKEN}\\s*${DIM_UNIT}?\\s*(?:[x×*]|\\bby\\b)\\s*${DIM_TOKEN}\\s*${DIM_UNIT}?`,
  'i',
);

/** '48 1/2' -> 48.5, '1/2' -> 0.5, '48.5' -> 48.5; null on junk/zero-divisor. */
const evalDimToken = (token: unknown): number | null => {
  const s = asString(token);
  if (!s) return null;
  let m = /^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const d = Number(m[3]);
    return d ? Number(m[1]) + Number(m[2]) / d : null;
  }
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const d = Number(m[2]);
    return d ? Number(m[1]) / d : null;
  }
  return toFiniteNumber(s);
};

const isFootUnit = (unit: unknown): boolean =>
  /^(?:'|′|ft\.?|feet|foot)$/i.test(asString(unit));

/** Parse dims out of a size label; label is preserved regardless. */
const parseParentLabel = (raw: unknown): { width_in: number | null; height_in: number | null; label: string } => {
  const text = asString(raw);
  if (!text) return { width_in: null, height_in: null, label: '' };
  const m = DIM_PAIR_RE.exec(text);
  if (!m) return { width_in: null, height_in: null, label: text };
  let w = evalDimToken(m[1]);
  let h = evalDimToken(m[3]);
  if (w !== null && isFootUnit(m[2])) w *= 12;
  if (h !== null && isFootUnit(m[4])) h *= 12;
  return { width_in: positive(w), height_in: positive(h), label: text };
};

const generatedLabel = (w: number | null, h: number | null): string =>
  w !== null && h !== null ? `${fmtDim(w)} x ${fmtDim(h)}` : '';

const normalizeEntry = (raw: unknown): ParentSize | null => {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const p = parseParentLabel(raw);
    if (p.width_in === null && p.height_in === null && p.label === '') return null;
    return {
      width_in: p.width_in,
      height_in: p.height_in,
      label: p.label || generatedLabel(p.width_in, p.height_in),
    };
  }
  if (!isRecord(raw)) return null;
  const w = positive(firstFinite(raw, WIDTH_FIELDS));
  const h = positive(firstFinite(raw, HEIGHT_FIELDS));
  let label = asString(firstField(raw, LABEL_FIELDS));
  if (!label) label = generatedLabel(w, h);
  if (w === null && h === null && !label) return null;
  const out: ParentSize = { width_in: w, height_in: h, label };
  const mq = firstFinite(raw, MIN_QTY_FIELDS);
  if (mq !== null) out.min_qty = Math.max(0, mq);
  const po = firstFinite(raw, PRICE_OVERRIDE_FIELDS);
  if (po !== null) out.price_override = Math.max(0, po);
  const tol = firstFinite(raw, TOLERANCE_FIELDS);
  if (tol !== null) out.tolerance_in = Math.max(0, tol);
  if (raw.lock_orientation === true) out.lock_orientation = true;
  return out;
};

/**
 * The part's parent_sizes[] as normalized entries, original order kept.
 * String labels parse to dims when possible; unparseable entries survive as
 * label-only rows (width_in/height_in null) so the UI can still show them —
 * they simply never match in isOrderableSize. Never throws; no rows -> [].
 */
export function parentSizesFor(part: unknown): ParentSize[] {
  const raw = isRecord(part) ? firstField(part, PARENT_SIZES_FIELDS) : undefined;
  const list = Array.isArray(raw) ? raw : [];
  const out: ParentSize[] = [];
  for (const entry of list) {
    const n = normalizeEntry(entry);
    if (n !== null) out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// matching internals
// ---------------------------------------------------------------------------

/** Only dim-bearing entries can bound orderable dims. */
const dimParents = (parents: ParentSize[]): ParentSize[] =>
  parents.filter((p) => p.width_in !== null && p.height_in !== null);

/** parent-row tolerance wins over part cfg; both clamp >= 0. */
const toleranceFor = (part: unknown, parent: ParentSize | null): number => {
  const tol =
    (parent && typeof parent.tolerance_in === 'number' ? parent.tolerance_in : null) ??
    firstFinite(isRecord(part) ? part : null, PART_TOLERANCE_FIELDS) ??
    DEFAULT_TOLERANCE_IN;
  return Math.max(0, tol);
};

/** part.lock_orientation === true locks all rows; a row may also lock itself. */
const orientationLocked = (part: unknown, parent: ParentSize | null): boolean =>
  (isRecord(part) && part.lock_orientation === true) || parent?.lock_orientation === true;

const dimsArg = (dims: unknown): { w: number | null; h: number | null } => {
  const d = isRecord(dims) ? dims : null;
  return {
    w: firstFinite(d, WIDTH_FIELDS),
    h: firstFinite(d, HEIGHT_FIELDS),
  };
};

/**
 * Is {width_in, height_in} an orderable size for this part? No dim-bearing
 * parents -> ok:true (unconstrained, backward compat). Otherwise dims must
 * match a parent within tolerance — swapped w/h allowed unless
 * part.lock_orientation === true (or the parent row locks). Closest match wins.
 */
export function isOrderableSize(part: unknown, dims: unknown): OrderableSizeResult {
  const parents = dimParents(parentSizesFor(part));
  const { w, h } = dimsArg(dims);

  if (w === null || h === null || w <= 0 || h <= 0) {
    return {
      ok: false,
      matched_parent: null,
      matched_orientation: null,
      error: {
        code: 'bad_dims',
        message: `width_in and height_in must be positive numbers (got ${asString(w)}, ${asString(h)})`,
      },
    };
  }
  if (parents.length === 0) {
    return { ok: true, matched_parent: null, matched_orientation: null, error: null };
  }

  let best: { parent: ParentSize; dev: number; orientation: MatchedOrientation } | null = null;
  for (const p of parents) {
    const pw = p.width_in as number;
    const ph = p.height_in as number;
    const tol = toleranceFor(part, p);
    const dwS = Math.abs(w - pw);
    const dhS = Math.abs(h - ph);
    if (dwS <= tol && dhS <= tol) {
      const dev = Math.max(dwS, dhS);
      if (!best || dev < best.dev) best = { parent: p, dev, orientation: 'straight' };
      continue; // straight match on this parent always beats its swapped match
    }
    if (!orientationLocked(part, p)) {
      const dwX = Math.abs(w - ph);
      const dhX = Math.abs(h - pw);
      if (dwX <= tol && dhX <= tol) {
        const dev = Math.max(dwX, dhX);
        if (!best || dev < best.dev) best = { parent: p, dev, orientation: 'swapped' };
      }
    }
  }

  if (best) {
    return {
      ok: true,
      matched_parent: best.parent,
      matched_orientation: best.orientation,
      error: null,
    };
  }
  const suggestion = nearestParentSuggestion(part, { width_in: w, height_in: h });
  return {
    ok: false,
    matched_parent: null,
    matched_orientation: null,
    error: {
      code: 'out_of_parent',
      message:
        `${fmtDim(w)} x ${fmtDim(h)} is not an orderable size for this part` +
        (suggestion ? `; nearest orderable size: ${suggestion.label || generatedLabel(suggestion.width_in, suggestion.height_in)}` : ''),
      suggestion,
    },
  };
}

// ---------------------------------------------------------------------------
// minimums
// ---------------------------------------------------------------------------

/**
 * Effective minimum quantity: max(part.min_qty ?? part.minimum_qty ??
 * part.min_quantity ?? 1, parent?.min_qty ?? 1). A parent row can only RAISE
 * the floor. Always >= 1 — ordering at qty 0 is never valid.
 */
export function minQtyFor(part: unknown, parent?: unknown): number {
  const partMin =
    firstFinite(isRecord(part) ? part : null, MIN_QTY_FIELDS) ?? 1;
  const parentMin =
    (isRecord(parent) ? firstFinite(parent, MIN_QTY_FIELDS) : null) ?? 1;
  return Math.max(partMin, parentMin);
}

// ---------------------------------------------------------------------------
// line validation (entry + engine share this)
// ---------------------------------------------------------------------------

/**
 * Validate one order line's dims + quantity against the part's parent sizes
 * and minimums. Returns every applicable coded error — 'bad_dims',
 * 'out_of_parent', 'below_min_qty' — never throws. Extras (matched_parent,
 * matched_orientation, min_qty, quantity) let the engine reuse the resolution.
 */
export function validateOrderLine(args: unknown): OrderLineValidation {
  const a = isRecord(args) ? args : {};
  const part = a.part;
  const { w, h } = dimsArg(a);
  const errors: OrderLineError[] = [];
  let matched: ParentSize | null = null;
  let orientation: MatchedOrientation | null = null;

  if (w === null || h === null || w <= 0 || h <= 0) {
    errors.push({
      code: 'bad_dims',
      message: `width_in and height_in must be positive numbers (got ${asString(a.width_in)}, ${asString(a.height_in)})`,
    });
  } else {
    const size = isOrderableSize(part, { width_in: w, height_in: h });
    if (!size.ok && size.error) {
      errors.push({ code: size.error.code, message: size.error.message, suggestion: size.error.suggestion ?? null });
    } else {
      matched = size.matched_parent;
      orientation = size.matched_orientation;
    }
  }

  const qty = toFiniteNumber(a.quantity ?? a.qty ?? 1);
  const min = minQtyFor(part, matched ?? undefined);
  if (qty === null || qty < min) {
    errors.push({
      code: 'below_min_qty',
      message: `quantity ${qty === null ? asString(a.quantity ?? a.qty) || '(missing)' : fmtDim(qty)} is below the minimum of ${fmtDim(min)} for this part`,
      min_qty: min,
      quantity: qty,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    matched_parent: matched,
    matched_orientation: orientation,
    min_qty: min,
    quantity: qty,
  };
}

// ---------------------------------------------------------------------------
// did-you-mean suggestion
// ---------------------------------------------------------------------------

/**
 * Closest dim-bearing parent to the requested dims — for the order-entry
 * "did you mean 48 x 96?" prompt. Orientation-aware (swapped counts unless
 * locked); distance is euclidean inches in the best orientation. null when
 * the part has no dim-bearing parents or the request dims aren't finite.
 */
export function nearestParentSuggestion(part: unknown, dims: unknown): ParentSizeSuggestion | null {
  const parents = dimParents(parentSizesFor(part));
  if (parents.length === 0) return null;
  const { w, h } = dimsArg(dims);
  if (w === null || h === null) return null;

  let best: { parent: ParentSize; dev: number; orientation: MatchedOrientation } | null = null;
  for (const p of parents) {
    const pw = p.width_in as number;
    const ph = p.height_in as number;
    let cand = { dev: Math.hypot(w - pw, h - ph), orientation: 'straight' as MatchedOrientation };
    if (!orientationLocked(part, p)) {
      const dSwap = Math.hypot(w - ph, h - pw);
      if (dSwap < cand.dev) cand = { dev: dSwap, orientation: 'swapped' };
    }
    if (!best || cand.dev < best.dev) best = { parent: p, dev: cand.dev, orientation: cand.orientation };
  }
  if (!best) return null;
  return { ...best.parent, matched_orientation: best.orientation, distance_in: best.dev };
}
