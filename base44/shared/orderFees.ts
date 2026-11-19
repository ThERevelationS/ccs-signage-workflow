// Order fees engine — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*) and frontend modules.
//
// Canonical OrderFeeLine shape (ESTIMATOR_MASTERPLAN A-22/F-16; identical on
// AllInOneEstimate.fee_lines and Invoice.fee_lines):
//   { label: string,
//     kind: 'shipping' | 'postage' | 'discount' | 'fee',
//     amount: number,                 // SIGNED — discount lines are negative
//     taxable: boolean,               // "this line's signed amount is in the taxable base"
//     income_account_code: string }   // GL income account for export/splits
//
// COREBRIDGE_MAP.md §8 (L109) only states "Order fees: shipping/postage/
// discount with taxable flag + income-account mapping" — it does NOT pin
// discount-vs-tax semantics, so this engine documents and implements the rule
// below.
//
// TAX RULE IMPLEMENTED (applyFeesToTotals):
//   - `taxable` is uniform across every kind, including discounts: the line's
//     SIGNED amount participates in the taxable base. A shipping/postage/fee
//     line contributes its amount when flagged; a discount (negative amount)
//     flagged taxable REDUCES the taxable base by its magnitude.
//   - Discount attribution is PRO-RATA ACROSS TAXABLE LINES: a taxable
//     discount is conceptually spread over the taxable components (taxable
//     merchandise subtotal + each taxable non-discount fee) in proportion to
//     each component's share. In aggregate the base reduction therefore equals
//     min(taxableDiscountTotal, taxableComponentSum); the base clamps at 0 —
//     a discount can never push the taxable base negative, and any excess
//     still lowers newSubtotal/total (it just stops reducing tax).
//   - A discount flagged NON-taxable never reduces the taxable base (e.g. a
//     courtesy credit issued against non-taxable freight).
//   - Merchandise `subtotal` is treated as fully taxable by default. Callers
//     with mixed-taxability line items (e.g. Invoice.line_items where each
//     row carries its own `taxable` flag) pass `taxableSubtotal` — the taxable
//     portion only, clamped into [0, subtotal].
//   - DEFAULT FLAG PARITY: normalizeFeeLines defaults a missing `taxable`
//     flag to TRUE on discount lines — matching the legacy flat
//     `discount_amount` convention in invoicingAction.computeTotals
//     (taxBase = max(0, taxableSubtotal − discount)). All other kinds default
//     to non-taxable when the flag is absent. Pass explicit flags to override.
//
// MONEY: all outputs are cent-rounded (round-half-away-from-zero at the penny,
// Number.EPSILON-adjusted). Inputs are coerced defensively — the engine never
// throws on totals math; run validateFeeLines first when strict checking of
// user-entered rows is required.

export const FEE_KINDS = ['shipping', 'postage', 'discount', 'fee'] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export interface OrderFeeLine {
  label: string;
  kind: FeeKind;
  amount: number;
  taxable: boolean;
  income_account_code: string;
}

export type FeeLineErrorCode =
  | 'not_array'
  | 'not_object'
  | 'unknown_kind'
  | 'invalid_amount'
  | 'negative_amount'
  | 'discount_exceeds_subtotal';

export interface FeeLineError {
  /** Row index in the input array; -1 for array-level/aggregate errors. */
  index: number;
  code: FeeLineErrorCode;
  message: string;
}

export interface FeeValidation {
  valid: boolean;
  errors: FeeLineError[];
}

/** Bucketed totals. `discount` is a positive magnitude (display convention). */
export interface FeeTotals {
  shipping: number;
  postage: number;
  discount: number;
  fees: number;
  /** Signed sum of NON-discount fee lines flagged taxable. */
  taxableFees: number;
  /** Signed sum of NON-discount fee lines not flagged taxable. */
  nontaxableFees: number;
}

export interface ApplyFeesInput {
  /** Merchandise subtotal (pre-fee, pre-tax). */
  subtotal: number;
  /**
   * Taxable portion of `subtotal`; defaults to the full subtotal. Pass the
   * sum of taxable line items when merchandise mixes taxable/non-taxable
   * rows. Clamped into [0, subtotal].
   */
  taxableSubtotal?: number;
  /** Raw or normalized fee rows — normalized internally. */
  feeLines?: unknown;
  /** Sales-tax rate as a PERCENT (6.5 → 6.5%). Negative input clamps to 0. */
  taxRatePct?: number;
}

/** Waterfall-ready totals: subtotal → fees/discount → tax → total. */
export interface ApplyFeesResult {
  subtotal: number;
  discount: number;   // positive magnitude
  shipping: number;
  postage: number;
  fees: number;
  /** subtotal + shipping + postage + fees − discount (pre-tax). */
  newSubtotal: number;
  /** Taxable base after taxable-flagged discount reduction; ≥ 0. */
  taxableBase: number;
  /** taxableBase × taxRatePct/100. */
  tax: number;
  /** newSubtotal + tax. */
  total: number;
}

// ---------------------------------------------------------------------------

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const toFinite = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

const toBool = (value: unknown): boolean =>
  value === true || value === 1 || value === 'true' || value === 'yes' || value === '1';

const rawKind = (value: unknown): string => toStr(value).toLowerCase();

const isFeeKind = (kind: string): kind is FeeKind =>
  (FEE_KINDS as readonly string[]).includes(kind);

/**
 * Coerce raw rows into canonical OrderFeeLine shape.
 * - Non-array input → []. Non-object rows → zero-value 'fee' rows.
 * - `kind` is lowercased/trimmed; unrecognized kinds repair to 'fee'
 *   (run validateFeeLines on the RAW input first to catch them).
 * - `amount` coerces via Number(); non-finite → 0; cent-rounded.
 *   A positive amount on a discount line is flipped to the canonical
 *   negative sign. A NEGATIVE amount on a non-discount line is preserved
 *   as-is (validateFeeLines flags it) so normalization never hides bad data.
 * - `taxable` defaults to true for discounts (flat-discount parity), false
 *   for other kinds, when the flag is absent; otherwise truthy-coerced
 *   (true | 1 | '1' | 'true' | 'yes').
 */
export function normalizeFeeLines(raw: unknown): OrderFeeLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : {};
    const k = rawKind(r.kind);
    const kind: FeeKind = isFeeKind(k) ? k : 'fee';
    let amount = toFinite(r.amount, 0);
    if (kind === 'discount' && amount > 0) amount = -amount; // canonical sign
    const taxable = r.taxable === undefined || r.taxable === null
      ? kind === 'discount'
      : toBool(r.taxable);
    return {
      label: toStr(r.label),
      kind,
      amount: round2(amount),
      taxable,
      income_account_code: toStr(r.income_account_code),
    };
  });
}

/**
 * Validate raw fee rows. Returns structured errors; `valid` = no errors.
 * Checks (per spec): unknown kind, non-finite amount, negative amount on a
 * non-discount line, and — when opts.subtotal is a finite number — discount
 * magnitude exceeding the merchandise subtotal. null/undefined input is
 * valid (absent fee_lines is legal); non-array non-null input is not.
 */
export function validateFeeLines(
  raw: unknown,
  opts: { subtotal?: number } = {},
): FeeValidation {
  const errors: FeeLineError[] = [];
  if (raw === undefined || raw === null) return { valid: true, errors };
  if (!Array.isArray(raw)) {
    errors.push({ index: -1, code: 'not_array', message: 'fee_lines must be an array.' });
    return { valid: false, errors };
  }
  let discountTotal = 0;
  let sawDiscount = false;
  raw.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push({ index: i, code: 'not_object', message: `fee_lines[${i}] must be an object.` });
      return;
    }
    const r = row as Record<string, unknown>;
    const k = rawKind(r.kind);
    if (!isFeeKind(k)) {
      errors.push({
        index: i,
        code: 'unknown_kind',
        message: `fee_lines[${i}].kind "${toStr(r.kind)}" is not one of: ${FEE_KINDS.join(', ')}.`,
      });
    }
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) {
      errors.push({
        index: i,
        code: 'invalid_amount',
        message: `fee_lines[${i}].amount must be a finite number.`,
      });
      return;
    }
    if (k === 'discount') {
      discountTotal += Math.abs(amount);
      sawDiscount = true;
    } else if (isFeeKind(k) && amount < 0) {
      errors.push({
        index: i,
        code: 'negative_amount',
        message: `fee_lines[${i}].amount may not be negative on kind "${k}".`,
      });
    }
  });
  const subtotal = opts.subtotal === undefined ? NaN : toFinite(opts.subtotal, NaN);
  if (sawDiscount && Number.isFinite(subtotal) && round2(discountTotal) > round2(subtotal)) {
    errors.push({
      index: -1,
      code: 'discount_exceeds_subtotal',
      message: `discount total ${round2(discountTotal)} exceeds subtotal ${round2(subtotal)}.`,
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Bucketed sums of fee lines (normalized internally). `discount` is a
 * positive magnitude; taxableFees/nontaxableFees split the NON-discount
 * lines by their flag (the discount's own tax effect is applied inside
 * applyFeesToTotals, not reported here).
 */
export function feeTotals(raw: unknown): FeeTotals {
  let shipping = 0;
  let postage = 0;
  let discount = 0;
  let fees = 0;
  let taxableFees = 0;
  let nontaxableFees = 0;
  for (const line of normalizeFeeLines(raw)) {
    if (line.kind === 'shipping') shipping += line.amount;
    else if (line.kind === 'postage') postage += line.amount;
    else if (line.kind === 'discount') discount += -line.amount; // signed → magnitude
    else fees += line.amount;
    if (line.kind !== 'discount') {
      if (line.taxable) taxableFees += line.amount;
      else nontaxableFees += line.amount;
    }
  }
  return {
    shipping: round2(shipping),
    postage: round2(postage),
    discount: round2(discount),
    fees: round2(fees),
    taxableFees: round2(taxableFees),
    nontaxableFees: round2(nontaxableFees),
  };
}

/**
 * Waterfall totals with fees + tax. Pure math on normalized input — never
 * throws. See the file-header TAX RULE for discount/taxable semantics.
 *
 *   newSubtotal  = subtotal + shipping + postage + fees − discount
 *   taxableBase  = max(0, taxableMerch + taxableFeeSum − taxableDiscountSum)
 *   tax          = taxableBase × taxRatePct / 100
 *   total        = newSubtotal + tax
 */
export function applyFeesToTotals(input: ApplyFeesInput): ApplyFeesResult {
  const src = input && typeof input === 'object' ? input : ({} as ApplyFeesInput);
  const subtotal = round2(toFinite(src.subtotal, 0));
  const taxableMerch = src.taxableSubtotal === undefined || src.taxableSubtotal === null
    ? Math.max(0, subtotal)
    : Math.max(0, Math.min(toFinite(src.taxableSubtotal, subtotal), Math.max(0, subtotal)));

  let shipping = 0;
  let postage = 0;
  let fees = 0;
  let discount = 0;
  let taxableFeeSum = 0;
  let taxableDiscountSum = 0;
  for (const line of normalizeFeeLines(src.feeLines)) {
    if (line.kind === 'shipping') shipping += line.amount;
    else if (line.kind === 'postage') postage += line.amount;
    else if (line.kind === 'fee') fees += line.amount;
    else {
      discount += -line.amount;
      if (line.taxable) taxableDiscountSum += -line.amount;
    }
    if (line.kind !== 'discount' && line.taxable) taxableFeeSum += line.amount;
  }

  const taxableComponents = taxableMerch + taxableFeeSum;
  // Pro-rata across taxable lines: aggregate base reduction is the taxable
  // discount magnitude, capped at what the taxable components can absorb.
  const reduction = Math.min(taxableDiscountSum, Math.max(0, taxableComponents));
  const taxableBase = round2(Math.max(0, taxableComponents - reduction));

  const newSubtotal = round2(subtotal + shipping + postage + fees - discount);
  const ratePct = Math.max(0, toFinite(src.taxRatePct, 0));
  const tax = round2(taxableBase * ratePct / 100);
  const total = round2(newSubtotal + tax);

  return {
    subtotal,
    discount: round2(discount),
    shipping: round2(shipping),
    postage: round2(postage),
    fees: round2(fees),
    newSubtotal,
    taxableBase,
    tax,
    total,
  };
}
