// Invoice GL income splits — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*) and frontend modules.
//
// I-02 (ESTIMATOR_MASTERPLAN WS-I): Invoice.income_account_splits[] auto-
// computed from line parts' income accounts at invoice create/edit, plus a
// manual split override with audit. Companion to F-17
// (lineAccountResolution.ts — same largest-remainder discipline, re-stated
// here so this module stays zero-import).
//
// STORAGE CONTRACT (Invoice.jsonc): income_account_splits[] stores one row
// per distinct GL account: {income_account_code: string, amount: number}
// — amount in signed DOLLARS. The richer GlSplit shape below is the working/
// editing model (cent-exact, percent, line provenance, auto/manual source);
// splitsToStorage / splitsFromStorage convert between the two. `account_id`
// carries whatever GL identifier the caller's chart uses — on this schema
// that is IncomeAccount.code (the '4000'-series GL code).
//
// ACCOUNT RESOLUTION (resolveLineAccount) — per spec chain:
//   line's own account → part's income account → category default → invoice
//   default. Each tier accepts the spelling variants that coexist in this
//   codebase (canonical income_account_code, PartTemplate legacy
//   income_account, spec-named *_account_id, account_code, gl_account*).
//   An empty/whitespace tier never satisfies resolution — the chain keeps
//   walking. Fully-unresolved lines land on '' (the unmapped bucket, still
//   grouped/deterministic — never dropped silently).
//
// BALANCE BASE (incomeBaseCents): splits foot to the invoice INCOME total —
//   cents(subtotal − discount_amount + Σ signed fee_lines.amount).
//   That is pre-tax revenue: tax_amount is a liability, not income;
//   deposit_applied / credit_applied / amount_paid / balance_due are payment
//   applications, not revenue; `total` is rejected as a base precisely
//   because it includes tax. (invoicingAction.computeTotals never folds
//   fee_lines into subtotal, so fee amounts are added here — when a caller
//   stamps fee_lines AND folds them into line_items the same rows must not
//   be passed twice; that is the caller's contract.)
//
// CENT-SAFE MATH: all computation is integer cents. Each line's amount is
// cent-rounded individually (matches invoicingAction line_total =
// money(qty × unit_price)), so per-account sums are exact integers. The only
// distribution needing apportionment is the flat discount_amount across
// line-revenue accounts: each account's exact pro-rata share is floored and
// the leftover pennies go one each to the largest fractional remainders
// (ties → earliest-seen account) — classic largest-remainder, identical to
// splitInvoiceByAccount's scheme. A final residual pass pushes any drift
// (e.g. caller-stored line_total disagreeing with subtotal) onto the largest
// split, so Σ splits ≡ incomeBaseCents ALWAYS — splits can never unfoot.
//
// OVERRIDE: manualSplitOverride validates that the proposed splits balance
// to the SAME income base before emitting a patch — an unbalanced manual
// posting is rejected (ok:false + delta_cents), never silently forced.
// splits_override* fields flag the row; splitAuditEvent produces the
// before/after activity row. NOTE: Invoice.jsonc does not yet declare
// splits_override*/splits_override_by — the schema owner adds them (fields
// ride the patch regardless; entities in this schema family are permissive).
//
// FEE SIGN PARITY: kind 'discount' fee lines post negative (positive input
// coerced), mirroring orderFees.normalizeFeeLines — restated inline because
// this module must stay zero-import.

export type SplitSource = 'auto' | 'manual';

/** Provenance of one contributor to a split bucket. */
export interface SplitLineRef {
  /** 'line' → invoice.line_items[index]; 'fee' → invoice.fee_lines[index]; 'discount' → flat discount_amount (index −1). */
  kind: 'line' | 'fee' | 'discount';
  index: number;
  /** Best-effort stable identifier (line id/part key/fee label) when present. */
  ref?: string;
}

/** Rich working split row — cent-exact; convert via splitsToStorage to persist. */
export interface GlSplit {
  /** GL account identifier (IncomeAccount.code in this schema). '' = unmapped. */
  account_id: string;
  account_name?: string;
  /** Signed integer cents posted to this account. */
  amount_cents: number;
  /** Share of the income base, 4-decimal rounded — informational only; amount_cents is authoritative. */
  percent: number;
  source: SplitSource;
  line_refs: SplitLineRef[];
}

/** Stored entity row — Invoice.income_account_splits[] item shape. */
export interface SplitStorageRow {
  income_account_code: string;
  amount: number;
}

export interface ComputeSplitOptions {
  /**
   * Part lookup for line→part resolution. Accepted forms:
   *   - function: (line) => partRow
   *   - Map<key, partRow>
   *   - array of part rows (indexed by id/part_key/key/part_id/name/sku)
   *   - plain object keyed by the line's part key
   * Line part keys tried (first non-empty): part_key, part_id, partId,
   * builder_part_id, catalog_part_id, part, sku, part_name.
   */
  partsByKey?: unknown;
  /** Same accepted forms for the part's category/group row (part.part_group_id, part.category, part.group …). */
  categoriesByKey?: unknown;
  /** Account display-name lookup: array of IncomeAccount rows or map id/code → row|name. */
  accountsByKey?: unknown;
  /** Final fallback account for unresolved lines AND fees (spec: default_income_account_id). */
  default_income_account_id?: string;
  /** Optional dedicated contra account for the flat discount_amount. When set, the whole discount posts there instead of being allocated pro-rata across line accounts. */
  discount_account_id?: string;
  /** Fallback account for fee lines that carry no income_account_code (defaults to default_income_account_id). */
  fee_default_account_id?: string;
}

export interface SplitBalance {
  ok: boolean;
  /** splitsCents − incomeBaseCents (0 when balanced). */
  delta_cents: number;
  base_cents: number;
  splits_cents: number;
}

export interface SplitOverrideInput {
  actor_id?: string;
  now?: string;
  reason?: string;
}

export interface SplitOverrideResult {
  ok: boolean;
  /** Present when ok — the Invoice update payload. */
  patch?: {
    income_account_splits: SplitStorageRow[];
    splits_override: true;
    splits_override_by: string;
    splits_override_at: string;
    splits_override_reason: string;
  };
  /** Normalized rich splits (source 'manual', percent recomputed) when ok. */
  splits?: GlSplit[];
  error?: string;
  detail?: string;
  delta_cents?: number;
  base_cents?: number;
  splits_cents?: number;
}

export interface SplitAuditChange {
  account_id: string;
  account_name?: string;
  before_cents: number;
  after_cents: number;
  delta_cents: number;
}

export interface SplitAuditEvent {
  event_type: 'invoice_income_splits_changed';
  entity_type: 'Invoice';
  entity_id: string;
  invoice_number: string;
  actor_id: string;
  occurred_at: string;
  /** False when before/after are identical — callers may skip persisting. */
  has_changes: boolean;
  added: Array<{ account_id: string; account_name?: string; after_cents: number }>;
  removed: Array<{ account_id: string; account_name?: string; before_cents: number }>;
  changed: SplitAuditChange[];
  before_total_cents: number;
  after_total_cents: number;
  /** One-line human summary, e.g. "GL splits: +4000 $12.00 · ~4100 $5.00→$7.00 · −4200 $3.00". */
  summary: string;
}

// ---------------------------------------------------------------------------

const toStr = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

const toFinite = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Dollars → integer cents (round-half-away at the penny via Math.round). */
export const toCents = (dollars: unknown): number =>
  Math.round(toFinite(dollars, 0) * 100);

/** Integer cents → dollars. */
export const fromCents = (cents: unknown): number =>
  Math.round(toFinite(cents, 0)) / 100;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

const firstStr = (row: unknown, keys: string[]): string => {
  if (!row || typeof row !== 'object') return '';
  const r = row as Record<string, unknown>;
  for (const key of keys) {
    const v = toStr(r[key]);
    if (v) return v;
  }
  return '';
};

/**
 * Account spellings per tier — canonical income_account_code first, then the
 * spec-named *_account_id forms, PartTemplate legacy income_account, and the
 * generic gl_* spellings seen on imports. `code`/`id` are only read on
 * default/category rows (where the row IS the account), never on lines/parts.
 */
const LINE_ACCOUNT_KEYS = [
  'income_account_code', 'income_account_id', 'account_id', 'account_code',
  'income_account', 'gl_account_code', 'gl_account',
];
const PART_ACCOUNT_KEYS = [
  'income_account_id', 'income_account_code', 'income_account',
  'default_income_account_id', 'gl_account_code', 'gl_account', 'account_id',
];
const CATEGORY_ACCOUNT_KEYS = [
  'default_income_account_id', 'income_account_code', 'income_account_id',
  'income_account', 'gl_account_code', 'account_code', 'code',
];
const DEFAULT_ACCOUNT_KEYS = [
  'default_income_account_id', 'income_account_code', 'income_account_id',
  'income_account', 'account_code', 'code', 'id',
];

/** A "default" may be passed as a bare string (the account) or a row. */
const defaultAccountOf = (value: unknown, keys: string[]): string =>
  typeof value === 'string' ? toStr(value) : firstStr(value, keys);

/**
 * Resolve the income account for one invoice line — spec chain:
 *   line.account_id → part.income_account_id → category default → invoiceDefault.
 * Returns '' when every tier is empty (the unmapped bucket).
 */
export function resolveLineAccount(
  line: unknown,
  ctx: { part?: unknown; categoryDefault?: unknown; invoiceDefault?: unknown } = {},
): string {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return (
    firstStr(line, LINE_ACCOUNT_KEYS) ||
    firstStr(c.part, PART_ACCOUNT_KEYS) ||
    defaultAccountOf(c.categoryDefault, CATEGORY_ACCOUNT_KEYS) ||
    defaultAccountOf(c.invoiceDefault, DEFAULT_ACCOUNT_KEYS)
  );
}

// ---------------------------------------------------------------------------
// Lookup normalization — partsByKey / categoriesByKey / accountsByKey accept
// function | Map | array | plain-object forms.
// ---------------------------------------------------------------------------

const LOOKUP_ID_KEYS = ['id', 'part_key', 'key', 'part_id', 'code', 'name', 'sku'];

function indexRows(rows: unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of LOOKUP_ID_KEYS) {
      const k = toStr((row as Record<string, unknown>)[key]);
      if (k && !map.has(k)) map.set(k, row);
    }
  }
  return map;
}

function makeLookup(source: unknown): (key: string) => unknown {
  if (!source) return () => undefined;
  if (typeof source === 'function') {
    return (key: string) => (source as (k: string) => unknown)(key);
  }
  if (source instanceof Map) {
    return (key: string) => source.get(key);
  }
  if (Array.isArray(source)) {
    const map = indexRows(source);
    return (key: string) => map.get(key);
  }
  if (typeof source === 'object') {
    const obj = source as Record<string, unknown>;
    return (key: string) => obj[key];
  }
  return () => undefined;
}

const LINE_PART_KEYS = [
  'part_key', 'part_id', 'partId', 'builder_part_id', 'catalog_part_id',
  'part', 'sku', 'part_name',
];

const partKeyCandidates = (line: Record<string, unknown>): string[] => {
  const out: string[] = [];
  for (const key of LINE_PART_KEYS) {
    const v = toStr(line[key]);
    if (v) out.push(v);
  }
  return out;
};

const findPart = (line: Record<string, unknown>, lookup: (k: string) => unknown): unknown => {
  for (const key of partKeyCandidates(line)) {
    const hit = lookup(key);
    if (hit && typeof hit === 'object') return hit;
  }
  return undefined;
};

const PART_CATEGORY_KEYS = [
  'part_group_id', 'catalog_part_group_id', 'part_group', 'category_id',
  'category', 'group_id', 'group',
];

const findCategory = (part: unknown, lookup: (k: string) => unknown): unknown => {
  if (!part || typeof part !== 'object') return undefined;
  const p = part as Record<string, unknown>;
  for (const key of PART_CATEGORY_KEYS) {
    const ref = p[key];
    if (ref && typeof ref === 'object') return ref; // row embedded directly
    const k = toStr(ref);
    if (k) {
      const hit = lookup(k);
      if (hit) return hit;
    }
  }
  return undefined;
};

const ACCOUNT_NAME_KEYS = ['name', 'account_name', 'display_name', 'label'];
const ACCOUNT_ROW_ID_KEYS = ['code', 'id', 'account_id', 'income_account_code', 'gl_account_code'];

function makeAccountNameLookup(source: unknown): (accountId: string) => string {
  if (!source) return () => '';
  const direct = (k: string): string => {
    if (typeof source === 'object' && !Array.isArray(source) && !(source instanceof Map)) {
      const v = (source as Record<string, unknown>)[k];
      if (typeof v === 'string') return toStr(v);
      if (v && typeof v === 'object') return firstStr(v, ACCOUNT_NAME_KEYS);
      return '';
    }
    return '';
  };
  return (accountId: string) => {
    const d = direct(accountId);
    if (d) return d;
    const rows = source instanceof Map ? [...source.values()]
      : Array.isArray(source) ? source : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      for (const key of ACCOUNT_ROW_ID_KEYS) {
        if (toStr(r[key]) === accountId) return firstStr(r, ACCOUNT_NAME_KEYS);
      }
    }
    return '';
  };
}

// ---------------------------------------------------------------------------
// Amount extraction + fee sign parity (orderFees.ts conventions, restated).
// ---------------------------------------------------------------------------

const LINE_AMOUNT_KEYS = ['line_total', 'amount', 'total', 'extended_price'];

const lineAmountCents = (line: Record<string, unknown>): number => {
  for (const key of LINE_AMOUNT_KEYS) {
    const n = Number(line[key]);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  const qty = Number(line.quantity);
  const unit = Number(line.unit_price);
  if (Number.isFinite(qty) && Number.isFinite(unit)) return Math.round(qty * unit * 100);
  return 0;
};

/** Signed fee cents: 'discount' kind coerced negative; other kinds keep sign. */
const feeAmountCents = (fee: Record<string, unknown>): number => {
  const amount = toFinite(fee.amount, 0);
  const kind = toStr(fee.kind).toLowerCase();
  const signed = kind === 'discount' && amount > 0 ? -amount : amount;
  return Math.round(signed * 100);
};

const lineRefTag = (line: Record<string, unknown>): string =>
  firstStr(line, ['id', 'line_id', 'line_key', 'part_key', 'part_id', 'sku', 'description']);

/**
 * The income base splits must foot to, in integer cents:
 *   cents(subtotal − discount_amount + Σ signed fee_lines.amount).
 * Pre-tax revenue — see the file header for what is excluded and why.
 */
export function incomeBaseCents(invoice: unknown): number {
  const inv = (invoice && typeof invoice === 'object' ? invoice : {}) as Record<string, unknown>;
  let cents = toCents(inv.subtotal) - toCents(Math.max(0, toFinite(inv.discount_amount, 0)));
  if (Array.isArray(inv.fee_lines)) {
    for (const fee of inv.fee_lines) {
      if (fee && typeof fee === 'object') cents += feeAmountCents(fee as Record<string, unknown>);
    }
  }
  return cents;
}

// ---------------------------------------------------------------------------

interface Bucket {
  account_id: string;
  line_cents: number;   // merchandise lines only (drives discount weighting)
  fee_cents: number;    // signed fee accrual
  discount_cents: number; // allocated flat-discount share (negative)
  refs: SplitLineRef[];
  order: number;
}

/**
 * Largest-remainder apportionment of `totalCents` (a positive magnitude to
 * SUBTRACT) across buckets weighted by their `line_cents`. Only buckets with
 * line_cents > 0 participate — merchandise discounts never land on fee-only
 * or unmapped-credit buckets. Guarantees Σ shares === totalCents exactly.
 */
function apportionDiscount(buckets: Bucket[], totalCents: number): Map<number, number> {
  const shares = new Map<number, number>();
  const participants = buckets.filter((b) => b.line_cents > 0);
  const pool = participants.reduce((s, b) => s + b.line_cents, 0);
  if (totalCents <= 0 || pool <= 0) return shares;

  const exacts = participants.map((b) => {
    const exact = (b.line_cents / pool) * totalCents;
    return { b, exact, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = totalCents - exacts.reduce((s, e) => s + e.floor, 0);
  // Largest remainder first; ties → earliest-seen bucket (lower .order).
  for (const e of [...exacts].sort((a, z) => (z.remainder - a.remainder) || (a.b.order - z.b.order))) {
    if (leftover <= 0) break;
    e.floor += 1;
    leftover -= 1;
  }
  for (const e of exacts) shares.set(e.b.order, e.floor);
  return shares;
}

/**
 * Group invoice line_items (+ fee_lines, + flat discount_amount) into rich
 * per-account splits. Deterministic output order = first-seen account
 * (lines first, then fees, then the discount bucket). Rows netting to 0¢ are
 * dropped (nothing posts to GL), matching splitInvoiceByAccount. Every
 * returned row is source:'auto' — manual provenance never comes out of
 * computation (see manualSplitOverride).
 *
 * Callers: skip recompute when invoice.splits_override === true — the manual
 * posting is authoritative until cleared (clearSplitOverride).
 */
export function computeInvoiceSplits(invoice: unknown, opts: ComputeSplitOptions = {}): GlSplit[] {
  const o = opts && typeof opts === 'object' ? opts : {};
  const inv = (invoice && typeof invoice === 'object' ? invoice : {}) as Record<string, unknown>;
  const partLookup = makeLookup(o.partsByKey);
  const categoryLookup = makeLookup(o.categoriesByKey);
  const nameLookup = makeAccountNameLookup(o.accountsByKey);
  const defaultAccount = toStr(o.default_income_account_id);
  const feeDefault = toStr(o.fee_default_account_id) || defaultAccount;

  const buckets: Bucket[] = [];
  const byAccount = new Map<string, Bucket>();
  const bucket = (account: string): Bucket => {
    let b = byAccount.get(account);
    if (!b) {
      b = { account_id: account, line_cents: 0, fee_cents: 0, discount_cents: 0, refs: [], order: buckets.length };
      byAccount.set(account, b);
      buckets.push(b);
    }
    return b;
  };

  const lines = Array.isArray(inv.line_items) ? inv.line_items : [];
  lines.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    const line = row as Record<string, unknown>;
    const part = findPart(line, partLookup);
    const account = resolveLineAccount(line, {
      part,
      categoryDefault: findCategory(part, categoryLookup),
      invoiceDefault: defaultAccount,
    });
    const b = bucket(account);
    b.line_cents += lineAmountCents(line);
    const ref = lineRefTag(line);
    b.refs.push({ kind: 'line', index: i, ...(ref ? { ref } : {}) });
  });

  const fees = Array.isArray(inv.fee_lines) ? inv.fee_lines : [];
  fees.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    const fee = row as Record<string, unknown>;
    const account = firstStr(fee, LINE_ACCOUNT_KEYS) || feeDefault;
    const b = bucket(account);
    b.fee_cents += feeAmountCents(fee);
    const ref = toStr(fee.label) || toStr(fee.id);
    b.refs.push({ kind: 'fee', index: i, ...(ref ? { ref } : {}) });
  });

  // Flat invoice-level discount: dedicated contra account when configured,
  // otherwise pro-rata (largest-remainder) across line-revenue accounts, or —
  // with no positive line revenue to absorb it — the fallback bucket.
  const discountCents = toCents(Math.max(0, toFinite(inv.discount_amount, 0)));
  const discountRef: SplitLineRef = { kind: 'discount', index: -1 };
  if (discountCents > 0) {
    const dedicated = toStr(o.discount_account_id);
    if (dedicated) {
      const b = bucket(dedicated);
      b.discount_cents -= discountCents;
      b.refs.push(discountRef);
    } else {
      const shares = apportionDiscount(buckets, discountCents);
      if (shares.size === 0) {
        const b = bucket(defaultAccount);
        b.discount_cents -= discountCents;
        b.refs.push(discountRef);
      } else {
        for (const [order, cents] of shares) {
          const b = buckets[order];
          b.discount_cents -= cents;
          b.refs.push(discountRef);
        }
      }
    }
  }

  const base = incomeBaseCents(inv);
  let splits: GlSplit[] = buckets.map((b) => ({
    account_id: b.account_id,
    ...(nameLookup(b.account_id) ? { account_name: nameLookup(b.account_id) } : {}),
    amount_cents: b.line_cents + b.fee_cents + b.discount_cents,
    percent: 0, // filled below, after drift repair
    source: 'auto' as SplitSource,
    line_refs: b.refs,
  })).filter((s) => s.amount_cents !== 0);

  // Drift repair: if stored line amounts disagree with the stated base (e.g.
  // stale line_total vs subtotal), push the residual onto the largest split
  // so splits always foot exactly. Deterministic: largest |amount|, ties →
  // earliest first-seen.
  const sum = splits.reduce((s, x) => s + x.amount_cents, 0);
  const residual = base - sum;
  if (residual !== 0 && splits.length > 0) {
    let target = 0;
    for (let i = 1; i < splits.length; i++) {
      if (Math.abs(splits[i].amount_cents) > Math.abs(splits[target].amount_cents)) target = i;
    }
    splits[target].amount_cents += residual;
  }
  if (residual !== 0 && splits.length === 0) {
    // Base nonzero but no contributor resolved — post it to the default bucket.
    splits = [{
      account_id: defaultAccount,
      amount_cents: residual,
      percent: 0,
      source: 'auto' as SplitSource,
      line_refs: [],
    }];
  }

  for (const s of splits) {
    s.percent = base !== 0 ? round4((s.amount_cents / base) * 100) : 0;
  }
  return splits;
}

// ---------------------------------------------------------------------------

/** Normalize any accepted split row spelling → {account_id, amount_cents, account_name?, line_refs}. */
const normalizeSplitRow = (row: unknown): { account_id: string; amount_cents: number; account_name?: string; line_refs: SplitLineRef[] } | null => {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const account = firstStr(r, ['account_id', 'income_account_code', 'account_code', 'income_account', 'income_account_id', 'code']);
  let cents: number;
  if (Number.isFinite(Number(r.amount_cents))) cents = Math.round(Number(r.amount_cents));
  else if (Number.isFinite(Number(r.amount))) cents = Math.round(Number(r.amount) * 100);
  else return null;
  if (!account) return null;
  const name = toStr(r.account_name) || toStr(r.name);
  const refs = Array.isArray(r.line_refs) ? (r.line_refs as SplitLineRef[]) : [];
  return { account_id: account, amount_cents: cents, ...(name ? { account_name: name } : {}), line_refs: refs };
};

/** Merge normalized rows by account (sum cents, keep first name, union refs). */
const mergeRows = (rows: Array<NonNullable<ReturnType<typeof normalizeSplitRow>>>): typeof rows => {
  const order: string[] = [];
  const merged = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = merged.get(row.account_id);
    if (!existing) {
      merged.set(row.account_id, { ...row, line_refs: [...row.line_refs] });
      order.push(row.account_id);
    } else {
      existing.amount_cents += row.amount_cents;
      if (!existing.account_name && row.account_name) existing.account_name = row.account_name;
      existing.line_refs.push(...row.line_refs);
    }
  }
  return order.map((k) => merged.get(k) as (typeof rows)[number]);
};

/** Σ split cents — accepts rich rows, stored rows, or mixed spellings. */
const splitsSumCents = (splits: unknown): number => {
  if (!Array.isArray(splits)) return 0;
  let sum = 0;
  for (const row of splits) {
    const n = normalizeSplitRow(row);
    if (n) sum += n.amount_cents;
  }
  return sum;
};

/**
 * Do the proposed splits foot to the invoice income base?
 * {ok:true, delta_cents:0} only when Σ splits === incomeBaseCents exactly.
 */
export function splitsBalance(invoice: unknown, splits: unknown): SplitBalance {
  const base = incomeBaseCents(invoice);
  const sum = splitsSumCents(splits);
  return { ok: sum === base, delta_cents: sum - base, base_cents: base, splits_cents: sum };
}

/** Rich splits → stored Invoice.income_account_splits[] rows (signed dollars). */
export function splitsToStorage(splits: unknown): SplitStorageRow[] {
  const normalized = mergeRows(
    (Array.isArray(splits) ? splits : [])
      .map(normalizeSplitRow)
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );
  return normalized
    .map((r) => ({ income_account_code: r.account_id, amount: fromCents(r.amount_cents) }))
    .filter((r) => r.amount !== 0);
}

/** Stored rows → rich working splits (source from invoice.splits_override; percent recomputed vs base). */
export function splitsFromStorage(invoice: unknown): GlSplit[] {
  const inv = (invoice && typeof invoice === 'object' ? invoice : {}) as Record<string, unknown>;
  const source: SplitSource = inv.splits_override === true ? 'manual' : 'auto';
  const base = incomeBaseCents(inv);
  return mergeRows(
    (Array.isArray(inv.income_account_splits) ? inv.income_account_splits : [])
      .map(normalizeSplitRow)
      .filter((r): r is NonNullable<typeof r> => r !== null),
  ).map((r) => ({
    account_id: r.account_id,
    ...(r.account_name ? { account_name: r.account_name } : {}),
    amount_cents: r.amount_cents,
    percent: base !== 0 ? round4((r.amount_cents / base) * 100) : 0,
    source,
    line_refs: r.line_refs,
  }));
}

/**
 * Manual split override. Validates the proposed posting against the SAME
 * income base as auto-computation before allowing it — unbalanced overrides
 * are rejected, never patched. On success returns the Invoice patch:
 * {income_account_splits, splits_override:true, _by, _at, _reason}.
 * Accepts rich rows ({account_id, amount_cents}) or stored rows
 * ({income_account_code, amount}); duplicate accounts merge.
 */
export function manualSplitOverride(
  invoice: unknown,
  splits: unknown,
  meta: SplitOverrideInput = {},
): SplitOverrideResult {
  if (!Array.isArray(splits)) {
    return { ok: false, error: 'invalid_splits', detail: 'splits must be an array of {account_id, amount_cents} (or stored {income_account_code, amount}) rows.' };
  }
  const rows: Array<NonNullable<ReturnType<typeof normalizeSplitRow>>> = [];
  for (let i = 0; i < splits.length; i++) {
    const n = normalizeSplitRow(splits[i]);
    if (!n) {
      return { ok: false, error: 'invalid_split_row', detail: `splits[${i}] needs a non-empty account and a finite amount/amount_cents.` };
    }
    rows.push(n);
  }
  const merged = mergeRows(rows);
  const balance = splitsBalance(invoice, merged);
  if (!balance.ok) {
    return {
      ok: false,
      error: 'unbalanced_splits',
      detail: `Splits total ${fromCents(balance.splits_cents)} does not equal the invoice income base ${fromCents(balance.base_cents)} (subtotal − discount + fees, pre-tax).`,
      delta_cents: balance.delta_cents,
      base_cents: balance.base_cents,
      splits_cents: balance.splits_cents,
    };
  }
  const base = balance.base_cents;
  const rich: GlSplit[] = merged.map((r) => ({
    account_id: r.account_id,
    ...(r.account_name ? { account_name: r.account_name } : {}),
    amount_cents: r.amount_cents,
    percent: base !== 0 ? round4((r.amount_cents / base) * 100) : 0,
    source: 'manual' as SplitSource,
    line_refs: r.line_refs,
  }));
  return {
    ok: true,
    splits: rich,
    patch: {
      income_account_splits: merged.map((r) => ({ income_account_code: r.account_id, amount: fromCents(r.amount_cents) })),
      splits_override: true,
      splits_override_by: toStr(meta.actor_id),
      splits_override_at: toStr(meta.now) || new Date().toISOString(),
      splits_override_reason: toStr(meta.reason),
    },
  };
}

/**
 * Revert to auto-computed splits: recomputes from lines/parts and returns a
 * patch clearing the override flags.
 */
export function clearSplitOverride(
  invoice: unknown,
  opts: ComputeSplitOptions = {},
  meta: SplitOverrideInput = {},
): { splits: GlSplit[]; patch: Record<string, unknown> } {
  const splits = computeInvoiceSplits(invoice, opts);
  return {
    splits,
    patch: {
      income_account_splits: splitsToStorage(splits),
      splits_override: false,
      splits_override_by: toStr(meta.actor_id),
      splits_override_at: toStr(meta.now) || new Date().toISOString(),
      splits_override_reason: toStr(meta.reason),
    },
  };
}

const moneyLabel = (cents: number): string =>
  `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * Build an activity row describing a split transition (auto→manual override,
 * override→auto revert, or any recompute that changed the posting).
 * `before`/`after` accept rich or stored rows. `has_changes:false` when the
 * posting is identical — callers may skip persisting a no-op event.
 */
export function splitAuditEvent(
  invoice: unknown,
  before: unknown,
  after: unknown,
  meta: SplitOverrideInput = {},
): SplitAuditEvent {
  const inv = (invoice && typeof invoice === 'object' ? invoice : {}) as Record<string, unknown>;
  const beforeRows = mergeRows((Array.isArray(before) ? before : []).map(normalizeSplitRow).filter((r): r is NonNullable<typeof r> => r !== null));
  const afterRows = mergeRows((Array.isArray(after) ? after : []).map(normalizeSplitRow).filter((r): r is NonNullable<typeof r> => r !== null));
  const beforeMap = new Map(beforeRows.map((r) => [r.account_id, r]));
  const afterMap = new Map(afterRows.map((r) => [r.account_id, r]));

  const added: SplitAuditEvent['added'] = [];
  const removed: SplitAuditEvent['removed'] = [];
  const changed: SplitAuditChange[] = [];

  for (const r of afterRows) {
    const prior = beforeMap.get(r.account_id);
    if (!prior) added.push({ account_id: r.account_id, ...(r.account_name ? { account_name: r.account_name } : {}), after_cents: r.amount_cents });
    else if (prior.amount_cents !== r.amount_cents) {
      changed.push({
        account_id: r.account_id,
        ...(r.account_name || prior.account_name ? { account_name: r.account_name || prior.account_name } : {}),
        before_cents: prior.amount_cents,
        after_cents: r.amount_cents,
        delta_cents: r.amount_cents - prior.amount_cents,
      });
    }
  }
  for (const r of beforeRows) {
    if (!afterMap.has(r.account_id)) {
      removed.push({ account_id: r.account_id, ...(r.account_name ? { account_name: r.account_name } : {}), before_cents: r.amount_cents });
    }
  }

  const has_changes = added.length > 0 || removed.length > 0 || changed.length > 0;
  const parts: string[] = [];
  for (const a of added) parts.push(`+${a.account_id || 'unmapped'} ${moneyLabel(a.after_cents)}`);
  for (const c of changed) parts.push(`~${c.account_id || 'unmapped'} ${moneyLabel(c.before_cents)}→${moneyLabel(c.after_cents)}`);
  for (const r of removed) parts.push(`−${r.account_id || 'unmapped'} ${moneyLabel(r.before_cents)}`);
  const summary = has_changes ? `GL splits: ${parts.join(' · ')}` : 'GL splits: no posting change';

  return {
    event_type: 'invoice_income_splits_changed',
    entity_type: 'Invoice',
    entity_id: toStr(inv.id),
    invoice_number: toStr(inv.invoice_number),
    actor_id: toStr(meta.actor_id),
    occurred_at: toStr(meta.now) || new Date().toISOString(),
    has_changes,
    added,
    removed,
    changed,
    before_total_cents: beforeRows.reduce((s, r) => s + r.amount_cents, 0),
    after_total_cents: afterRows.reduce((s, r) => s + r.amount_cents, 0),
    summary,
  };
}
