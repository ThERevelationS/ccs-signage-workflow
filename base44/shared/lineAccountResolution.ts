// GL account-code resolution for order/invoice lines — pure TS. Imports only
// the sibling pure module orderFees.ts (explicit .ts extension, Deno-safe).
//
// CoreBridge parity (COREBRIDGE_MAP.md §10 L132 + §8 L102): income accounts
// (GL-coded 4000 Sales … 4999 Services) and COGS accounts attach per-part,
// per-modifier and per-fee. ESTIMATOR_MASTERPLAN F-17: the resolved code rides
// the priced line into Invoice.income_account_splits[] (A-16 shape
// {income_account_code, amount}).
//
// RESOLUTION MODEL:
//   - resolveLineAccounts walks tiers part → template → product → fallback,
//     INDEPENDENTLY per code: a part may supply income_account_code while the
//     COGS code falls through to the template. `source` reports the tier that
//     resolved the income code (income is the primary GL dimension on
//     invoices); `income_source`/`cogs_source` report each code's tier.
//   - Each tier reads the canonical `income_account_code` /
//     `cogs_account_code` first, then the legacy PartTemplate spellings
//     `income_account` / `cogs_account` (both field sets coexist on
//     PartTemplate — see PartTemplate.jsonc L115-132).
//   - Empty/whitespace codes never satisfy a tier — resolution keeps walking.
//     A fully-unresolved code lands on the fallback (which may itself be '').
//
// SPLIT ROUNDING (splitInvoiceByAccount): per-account sums are computed on
// exact (float) cent values, then each split is cent-rounded by
// LARGEST-REMAINDER apportionment against the cent-rounded grand total:
// every split's floor cents are kept, and the leftover pennies go one each to
// the splits with the largest fractional remainders (ties break to the
// earliest-seen account). This guarantees Σ splits == round2(Σ inputs)
// exactly — invoice splits always foot to the invoice total.

import { normalizeFeeLines } from './orderFees.ts';

export type AccountSource = 'part' | 'template' | 'product' | 'fallback';

export interface LineAccountInput {
  /** BuilderPart-shaped row (canonical income_account_code/cogs_account_code). */
  part?: unknown;
  /** PartTemplate-shaped row (canonical *_code fields + legacy income_account/cogs_account). */
  partTemplate?: unknown;
  /** Product-level row (BuilderProduct/estimate product) — same key spellings. */
  product?: unknown;
  /** Fallback income code when no tier supplies one (e.g. settings default). */
  fallbackIncome?: string;
  /** Fallback COGS code when no tier supplies one. */
  fallbackCogs?: string;
}

export interface ResolvedLineAccounts {
  income_account_code: string;
  cogs_account_code: string;
  /** Tier that resolved income_account_code (primary split dimension). */
  source: AccountSource;
  /** Tier that resolved income_account_code — same value as `source`. */
  income_source: AccountSource;
  /** Tier that resolved cogs_account_code. */
  cogs_source: AccountSource;
}

/** Invoice.income_account_splits[] item — matches the stored entity shape. */
export interface IncomeAccountSplit {
  income_account_code: string;
  amount: number;
}

export interface SplitOptions {
  /** Account code used when a row carries none. Default '' (unmapped bucket). */
  fallbackIncome?: string;
}

// ---------------------------------------------------------------------------

const toStr = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

const firstCode = (row: unknown, keys: string[]): string => {
  if (!row || typeof row !== 'object') return '';
  const r = row as Record<string, unknown>;
  for (const key of keys) {
    const v = toStr(r[key]);
    if (v) return v;
  }
  return '';
};

const INCOME_KEYS = ['income_account_code', 'income_account'];
const COGS_KEYS = ['cogs_account_code', 'cogs_account'];

/**
 * Resolve income + COGS GL codes for a priced line.
 * Precedence: part > partTemplate > product > fallback — evaluated
 * independently for each code (documented in the file header).
 */
export function resolveLineAccounts(input: LineAccountInput): ResolvedLineAccounts {
  const src = input && typeof input === 'object' ? input : ({} as LineAccountInput);
  const tiers: Array<[AccountSource, unknown]> = [
    ['part', src.part],
    ['template', src.partTemplate],
    ['product', src.product],
  ];

  let income = '';
  let cogs = '';
  let income_source: AccountSource = 'fallback';
  let cogs_source: AccountSource = 'fallback';
  for (const [tier, row] of tiers) {
    if (!income) {
      const v = firstCode(row, INCOME_KEYS);
      if (v) { income = v; income_source = tier; }
    }
    if (!cogs) {
      const v = firstCode(row, COGS_KEYS);
      if (v) { cogs = v; cogs_source = tier; }
    }
  }
  if (!income) income = toStr(src.fallbackIncome);
  if (!cogs) cogs = toStr(src.fallbackCogs);

  return {
    income_account_code: income,
    cogs_account_code: cogs,
    source: income_source,
    income_source,
    cogs_source,
  };
}

/**
 * Resolve the income account for a fee line: its own income_account_code
 * wins; otherwise the caller's fallback ('' when omitted).
 */
export function resolveFeeAccount(feeLine: unknown, fallback?: string): string {
  const own = firstCode(feeLine, INCOME_KEYS);
  return own || toStr(fallback);
}

const lineAmount = (row: Record<string, unknown>): number => {
  for (const key of ['line_total', 'amount', 'total', 'extended_price']) {
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  const qty = Number(row.quantity);
  const unit = Number(row.unit_price);
  if (Number.isFinite(qty) && Number.isFinite(unit)) return qty * unit;
  return 0;
};

/**
 * Group line amounts (+ fee lines) into Invoice.income_account_splits[].
 * - `lines`: rows with an amount (`line_total` | `amount` | `total` |
 *   `extended_price` | quantity×unit_price) and a resolved account
 *   (`income_account_code` | `account_code`).
 * - `feeLines`: canonical fee rows — normalized internally so a positive
 *   discount amount still posts negative to its account.
 * - Rows with neither amount nor account are ignored. Splits rounding to
 *   0.00 are dropped (nothing posts to GL).
 * - Deterministic output order: first-seen account order (lines before fees).
 * - Largest-remainder cent apportionment guarantees the splits sum exactly
 *   equals round2(sum of all input amounts) — see file header.
 */
export function splitInvoiceByAccount(
  lines: unknown,
  feeLines?: unknown,
  opts: SplitOptions = {},
): IncomeAccountSplit[] {
  const fallback = toStr(opts.fallbackIncome);
  const order: string[] = [];
  const cents = new Map<string, number>();

  const accrue = (account: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) {
      if (!account) return; // nothing to post and nowhere to post it
      if (!cents.has(account)) { cents.set(account, 0); order.push(account); }
      return;
    }
    if (!cents.has(account)) { cents.set(account, 0); order.push(account); }
    cents.set(account, (cents.get(account) as number) + amount * 100);
  };

  if (Array.isArray(lines)) {
    for (const row of lines) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const account = firstCode(r, INCOME_KEYS) || toStr(r.account_code) || fallback;
      accrue(account, lineAmount(r));
    }
  }
  for (const fee of normalizeFeeLines(feeLines)) {
    accrue(fee.income_account_code || fallback, fee.amount);
  }

  // Largest-remainder cent apportionment so splits foot exactly to the total.
  const targetCents = Math.round([...cents.values()].reduce((s, c) => s + c, 0));
  const entries = order.map((account, i) => {
    const exact = cents.get(account) as number;
    const floor = Math.floor(exact);
    return { account, i, exact, floor, remainder: exact - floor };
  });
  let leftover = targetCents - entries.reduce((s, e) => s + e.floor, 0);
  // Positive leftover → +1¢ to largest remainders; negative → −1¢ from
  // smallest remainders (over-rounding can only come from floor drift, but
  // stay symmetric for safety). Ties → earliest-seen account.
  const sorted = [...entries].sort((a, b) =>
    leftover >= 0 ? (b.remainder - a.remainder) || (a.i - b.i)
                  : (a.remainder - b.remainder) || (a.i - b.i));
  for (const e of sorted) {
    if (leftover === 0) break;
    e.floor += leftover > 0 ? 1 : -1;
    leftover += leftover > 0 ? -1 : 1;
  }

  return entries
    .map((e) => ({ income_account_code: e.account, amount: e.floor / 100 }))
    .filter((s) => s.amount !== 0);
}
