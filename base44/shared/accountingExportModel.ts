// Accounting export engine — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*), frontend export/preview code, and Node test
// harnesses. No I/O anywhere in this module — the wiring layer
// (accountingExportAction / the I-09 QuickBooks adapter / the I-10 lump-sync)
// loads Invoice / Payment / IncomeAccount rows and these functions turn them
// into balanced GL journal lines, CSV text, and an IIF-shaped dry run.
//
// I-08 (ESTIMATOR_MASTERPLAN WS-I). Consumes the I-02 storage contract:
// Invoice.income_account_splits[] stores {income_account_code, amount} —
// signed DOLLARS, one row per distinct GL account, footing to the pre-tax
// income base (subtotal − discount_amount + Σ signed fee_lines.amount). The
// SplitStorageRow shape is re-declared here by parity because this module
// must stay zero-import.
//
// DATA CONTRACT (base44/entities/*.jsonc + invoicingAction semantics):
//   Invoice.status        — 'draft' | 'sent' | 'partially_paid' | 'paid' |
//                           'void'. Posted (billed) = sent|partially_paid|paid
//                           (+ 'partial'/'issued' import aliases, same set as
//                           taxLiabilityModel). Drafts never billed → no rows.
//                           Void reverses a billed invoice → REVERSING journal.
//   Invoice.total         — subtotal − discount + tax_amount − deposit_applied
//                           (computeTotals). The AR debit is `total`; the
//                           deposit_applied slice debits a deposits-held
//                           clearing account so the journal still balances:
//                           DR AR(total) + DR deposits(deposit) =
//                           CR income splits + CR tax. credit_applied is NOT
//                           subtracted from total — it is a display aggregate
//                           of credit-memo Payment rows (each carries its own
//                           journal) so it gets no line here.
//   Invoice.tax_amount    — posts CR to the configured tax-liability account.
//   Invoice.issue_date    — journal date; chain invoice_date → issue_date →
//                           date → created_date (taxLiabilityModel parity).
//   Payment.amount        — signed dollars. Positive = receipt; negative =
//                           refund row (status 'refunded', refund_of_payment_id)
//                           or credit memo (method 'credit_memo', status
//                           'recorded'). status 'void' rows never post.
//   Payment.fee aliases   — no schema fee field; tolerated import/future
//                           spellings: fee_amount, processing_fee, fee,
//                           service_fee, card_fee (positive dollars).
//   Payment.gl_memo       — free text explicitly "carried to GL/accounting
//                           exports" — it is the ONLY free-text source used;
//                           Invoice.internal_notes / Payment.notes are never
//                           exported (I-08 safe-column rule).
//
// JOURNAL SEMANTICS (debit/credit direction per row type):
//   invoice_income — invoice journal (and its void reversal):
//       posted : DR AR(total) · DR deposits-held(deposit_applied)
//                CR each income account (split amount)
//       void   : mirror-image reversal (income+tax debit, AR+credits credit).
//                A negative split amount FLIPS column (posted as a debit) —
//                debit_cents/credit_cents are always ≥ 0.
//   invoice_tax   — the invoice's CR tax-liability line (DR on void).
//   payment_received — DR bank(gross − fee) · DR fee(fee) · CR AR(gross).
//   payment_fee    — processor-fee lines inside payment/refund journals.
//   refund         — money back out or store credit granted:
//       refund row (status refunded / negative non-memo): DR AR · DR fee ·
//                CR bank(gross + fee — the processor charges the refund fee
//                on top of the returned principal).
//       credit memo (method 'credit_memo'): DR AR · CR credit liability —
//                no cash moves; the credit side resolves to the configured
//                creditAccount (customer-credits / store-credit account),
//                falling back to '' unmapped rather than bank.
//
// BALANCED CHECK: every journal (one `ref` block) must debit == credit.
// exportBatch reports balanced only when every journal balances;
// unbalanced_refs lists the offending refs (e.g. caller-stamped splits that
// don't foot to total + deposit_applied − tax). Account resolution never
// affects balance — unresolved accounts post to '' (the unmapped bucket,
// never dropped) and surface in unmapped_refs.
//
// ACCOUNT RESOLUTION (accountCodeFor) — chain:
//   row's explicit account fields → role-mapped config → type-mapped config →
//   config.defaultAccount → '' (unmapped). Config accepts camelCase or
//   snake_case spellings and either a bare code string or an account row
//   ({code|id|name} first non-empty). Role map:
//     ar→arAccount · income→defaultIncome · tax→taxAccount ·
//     bank→bankAccount (cash/check payments prefer undepositedAccount) ·
//     fee→feeAccount · deposit→depositAccount · credit→creditAccount.
//
// IIF: toIifDraft emits an IIF-ISH preview — !TRNS/!SPL/!ENDTRNS blocks, one
// per journal ref, TRNS = the journal's first (debit) line, signed amount =
// debit − credit in dollars. It is a DRY-RUN shape for eyeballing the I-09
// mapping only — not a byte-exact QuickBooks import; the real adapter lands
// once OAuth credentials exist.
//
// Money: all outputs are INTEGER CENTS. Dollar inputs convert exactly once —
// no float arithmetic touches totals, so batches reconcile to the cent.

// ---------------------------------------------------------------------------

export const EXPORT_ROW_TYPES = [
  'invoice_income',
  'invoice_tax',
  'payment_received',
  'payment_fee',
  'refund',
] as const;

export type ExportRowType = (typeof EXPORT_ROW_TYPES)[number];

/** Posting-leg hint — drives accountCodeFor's role→config tier. */
export type ExportRole =
  | 'ar' | 'income' | 'tax' | 'bank' | 'fee' | 'deposit' | 'credit';

/** One GL export line. debit_cents/credit_cents are always ≥ 0. */
export interface ExportRow {
  /** Journal date 'YYYY-MM-DD' (issue_date chain for invoices, paid_date for payments). */
  date: string;
  type: ExportRowType;
  /** Journal/document reference — invoice_number, or PMT-/RF-/CM- doc ref. */
  ref: string;
  /** Resolved GL account code — '' = unmapped (never silently dropped). */
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  memo: string;
  /** customer_display_name / customer_name / customer_id of the source row. */
  customer: string;
  /** Source entity id (Invoice.id or Payment.id). */
  entity_id: string;
  /** Posting leg — present for downstream account mapping (see header). */
  role?: ExportRole;
  /** Resolved display name when an account lookup (accountsByCode) hits. */
  account_name?: string;
}

/** Stored entity row — Invoice.income_account_splits[] item shape (I-02 parity). */
export interface SplitStorageRow {
  income_account_code: string;
  amount: number;
}

/** Normalized split — accepts storage rows or rich {account_id, amount_cents} rows. */
export interface ExportSplit {
  account_code: string;
  amount_cents: number;
}

export interface AccountCodeConfig {
  /** Fallback income account for splits posted to '' (e.g. '4000'). */
  defaultIncome?: unknown;
  /** Sales-tax liability account (e.g. '2100'). */
  taxAccount?: unknown;
  /** Accounts-receivable account (e.g. '1100'). */
  arAccount?: unknown;
  /** Operating bank/checking account (e.g. '1000'). */
  bankAccount?: unknown;
  /** Undeposited-funds account — preferred for cash/check receipts. */
  undepositedAccount?: unknown;
  /** Merchant/processing fee expense account (e.g. '6100'). */
  feeAccount?: unknown;
  /** Customer-deposits-held liability consumed by deposit_applied. */
  depositAccount?: unknown;
  /** Customer-credit / store-credit liability for credit memos. */
  creditAccount?: unknown;
  /** Catch-all when nothing else resolves. */
  defaultAccount?: unknown;
  [key: string]: unknown;
}

export interface InvoiceExportOptions extends AccountCodeConfig {
  /** Pre-computed splits (storage rows, rich rows, or mixed). Falls back to
   *  invoice.income_account_splits, then a single income-base bucket. */
  splits?: unknown;
  /** Account-name enrichment: map code → row|name, or account row array. */
  accountsByCode?: unknown;
}

export interface PaymentExportOptions extends AccountCodeConfig {
  /** The invoice this payment applies to (for ref/memo/customer). */
  invoice?: unknown;
  /** Explicit destination account — wins the whole bank-side chain. */
  bank_account_id?: unknown;
  /** Same accepted forms as InvoiceExportOptions.accountsByCode. */
  accountsByCode?: unknown;
}

export interface ExportBatchOptions extends AccountCodeConfig {
  /** 'YYYY-MM-DD' inclusive bounds (period_start/start_date aliases ok).
   *  Both absent → unbounded; any bound → undated rows excluded. */
  from?: unknown;
  to?: unknown;
  /** code → account row|name map, or account rows array. */
  accountsByCode?: unknown;
  /** Extra invoice lookup for payments billed outside the period:
   *  {id: invoice} map, invoice array, or merged into `invoices`. */
  invoicesById?: unknown;
}

export interface ExportBatchResult {
  rows: ExportRow[];
  /** true only when EVERY journal balances AND the batch foots. */
  balanced: boolean;
  /** refs whose journal debits ≠ credits. */
  unbalanced_refs: string[];
  /** refs having ≥1 row with no resolvable account (''). */
  unmapped_refs: string[];
  totals: { debit_cents: number; credit_cents: number };
  period: { from: string; to: string };
  counts: { invoices: number; payments: number; journals: number };
  /** Entities excluded from the export, with why. */
  skipped: Array<{ entity: 'invoice' | 'payment'; ref: string; reason: string }>;
}

// Posted = billed. Same set as taxLiabilityModel (+import aliases).
export const POSTED_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid'];
const POSTED = new Set([...POSTED_INVOICE_STATUSES, 'partial', 'issued']);

// ---------------------------------------------------------------------------

const clean = (v: unknown): string =>
  v === undefined || v === null ? '' : String(v).trim();

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Loose numeric parse: accepts numbers and plain/decorated numeric strings
// ('1,234.56', '$5.00', '-2.5'); rejects letter-laden strings ('INV-001').
const MONEYISH = /^\s*\$?\s*-?[\d,]*\.?\d+\s*%?\s*$/;
const looseNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = clean(v);
  if (!s || !MONEYISH.test(s)) return NaN;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const firstFinite = (...vals: unknown[]): number => {
  for (const v of vals) {
    const n = looseNum(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
};

const firstText = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

/** Dollars → integer cents (round-half-away at the penny). */
export const toCents = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = looseNum(v);
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};

/** Integer cents → dollars. */
export const fromCents = (cents: unknown): number =>
  Math.round(num(cents, 0)) / 100;

// Normalize any date-ish value to 'YYYY-MM-DD' — leading YYYY-MM-DD prefix
// wins so ISO timestamps never shift days across timezones (same rule as
// taxLiabilityModel / statementBatchModel). '' when unparseable.
const toDay = (value: unknown): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

/** Invoice journal date: invoice_date → issue_date → date → created_date. */
export function invoiceDateOf(invoice: unknown): string {
  const inv = isObj(invoice) ? invoice : {};
  return toDay(firstText(inv.invoice_date, inv.issue_date, inv.date, inv.created_date));
}

/** Payment journal date: paid_date → payment_date → date → created_date. */
export function paymentDateOf(payment: unknown): string {
  const p = isObj(payment) ? payment : {};
  return toDay(firstText(p.paid_date, p.payment_date, p.date, p.created_date));
}

const isPostedInvoice = (inv: unknown): boolean =>
  POSTED.has(clean(isObj(inv) ? (inv as Record<string, unknown>).status : '').toLowerCase());

const isVoidInvoice = (inv: unknown): boolean =>
  clean(isObj(inv) ? (inv as Record<string, unknown>).status : '').toLowerCase() === 'void';

// ---------------------------------------------------------------------------
// Account-code resolution.
// ---------------------------------------------------------------------------

// A config value may be a bare code or an account row — read code/id/name.
const configCode = (value: unknown): string => {
  if (typeof value === 'string') return clean(value);
  return firstStr(value, ['code', 'id', 'account_code', 'account_id', 'gl_account_code', 'name']);
};

const firstStr = (row: unknown, keys: string[]): string => {
  if (!row || typeof row !== 'object') return '';
  const r = row as Record<string, unknown>;
  for (const key of keys) {
    const v = clean(r[key]);
    if (v) return v;
  }
  return '';
};

// Every accepted spelling per config slot (camelCase first, then snake_case
// and *_account_id import forms).
const CFG_KEYS: Record<string, string[]> = {
  defaultIncome: ['defaultIncome', 'default_income', 'default_income_account_id', 'income_account', 'income_account_id'],
  taxAccount: ['taxAccount', 'tax_account', 'tax_account_id', 'sales_tax_account', 'tax_liability_account', 'liability_account_id'],
  arAccount: ['arAccount', 'ar_account', 'ar_account_id', 'accounts_receivable', 'receivable_account', 'receivable_account_id'],
  bankAccount: ['bankAccount', 'bank_account', 'bank_account_id', 'checking_account', 'cash_account'],
  undepositedAccount: ['undepositedAccount', 'undeposited_account', 'undeposited_account_id', 'undeposited_funds_account', 'undeposited_funds'],
  feeAccount: ['feeAccount', 'fee_account', 'fee_account_id', 'processing_fee_account', 'bank_fee_account', 'merchant_fee_account'],
  depositAccount: ['depositAccount', 'deposit_account', 'deposit_account_id', 'customer_deposits_account', 'deposits_held', 'deposit_liability_account'],
  creditAccount: ['creditAccount', 'credit_account', 'credit_account_id', 'customer_credit_account', 'store_credit_account', 'credit_liability_account'],
  defaultAccount: ['defaultAccount', 'default_account', 'default_account_id', 'fallback_account'],
};

const configFor = (config: unknown, slot: string): string => {
  if (!isObj(config)) return '';
  for (const key of CFG_KEYS[slot] || []) {
    const v = configCode(config[key]);
    if (v) return v;
  }
  return '';
};

// Fields on the ROW itself that carry an explicit account code.
const ROW_ACCOUNT_KEYS = [
  'account_code', 'account_id', 'gl_account_code', 'gl_account',
  'income_account_code', 'income_account_id', 'code',
];

const ROLE_SLOT: Record<string, string> = {
  ar: 'arAccount',
  income: 'defaultIncome',
  tax: 'taxAccount',
  bank: 'bankAccount',
  fee: 'feeAccount',
  deposit: 'depositAccount',
  credit: 'creditAccount',
};

// Type-only fallback tier when the row carries no role hint.
const TYPE_SLOT: Record<string, string> = {
  invoice_income: 'defaultIncome',
  invoice_tax: 'taxAccount',
  payment_received: 'bankAccount',
  payment_fee: 'feeAccount',
  refund: 'bankAccount',
};

/**
 * accountCodeFor — resolve the GL code for one export row (or row descriptor).
 *   1. row's explicit account fields (account_code → account_id →
 *      gl_account_code → gl_account → income_account_code → income_account_id
 *      → code)
 *   2. role → its config slot (ar→arAccount, income→defaultIncome,
 *      tax→taxAccount, bank→bankAccount, fee→feeAccount,
 *      deposit→depositAccount, credit→creditAccount)
 *   3. type → its config slot
 *   4. config.defaultAccount
 *   5. '' — unmapped (never invented)
 */
export function accountCodeFor(row: unknown, config: AccountCodeConfig = {}): string {
  const r = isObj(row) ? row : {};
  const explicit = firstStr(r, ROW_ACCOUNT_KEYS);
  if (explicit) return explicit;
  const role = clean(r.role).toLowerCase();
  if (role && ROLE_SLOT[role]) {
    const v = configFor(config, ROLE_SLOT[role]);
    if (v) return v;
  }
  const type = clean(r.type).toLowerCase();
  if (type && TYPE_SLOT[type]) {
    const v = configFor(config, TYPE_SLOT[type]);
    if (v) return v;
  }
  return configFor(config, 'defaultAccount');
}

// ---------------------------------------------------------------------------
// Lookups + split normalization.
// ---------------------------------------------------------------------------

// Account-name enrichment — accountsByCode accepts a {code: row|name} map or
// an array of account rows ({code|id → row, name|account_name|display_name}).
const ACCOUNT_ID_KEYS = ['code', 'id', 'account_code', 'account_id', 'gl_account_code'];
const ACCOUNT_NAME_KEYS = ['name', 'account_name', 'display_name', 'label'];

function makeAccountNameLookup(source: unknown): (code: string) => string {
  if (!source) return () => '';
  if (isObj(source) && !(source instanceof Map)) {
    const direct = source as Record<string, unknown>;
    return (code: string) => {
      const v = direct[code];
      if (typeof v === 'string') return clean(v);
      if (v && typeof v === 'object') return firstStr(v, ACCOUNT_NAME_KEYS);
      return '';
    };
  }
  const rows = source instanceof Map ? [...source.values()]
    : Array.isArray(source) ? source : [];
  return (code: string) => {
    for (const row of rows) {
      if (!isObj(row)) continue;
      for (const key of ACCOUNT_ID_KEYS) {
        if (clean(row[key]) === code) return firstStr(row, ACCOUNT_NAME_KEYS);
      }
    }
    return '';
  };
}

/** Normalize any accepted split spelling → {account_code, amount_cents}. */
const normalizeSplitRow = (row: unknown): ExportSplit | null => {
  if (!isObj(row)) return null;
  const account = firstStr(row, [
    'income_account_code', 'account_code', 'account_id',
    'income_account_id', 'income_account', 'gl_account_code', 'gl_account', 'code',
  ]);
  let cents: number;
  if (Number.isFinite(Number(row.amount_cents))) cents = Math.round(Number(row.amount_cents));
  else {
    const n = looseNum(row.amount);
    if (!Number.isFinite(n)) return null;
    cents = Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9);
  }
  return { account_code: account, amount_cents: cents };
};

/**
 * The pre-tax income base, integer cents: subtotal − discount_amount + Σ
 * signed fee_lines.amount (glSplitModel.incomeBaseCents parity — 'discount'
 * fee kind posts negative even when stored positive). Used only when the
 * caller supplies no splits AND the invoice stores none.
 */
export function incomeBaseCents(invoice: unknown): number {
  const inv = isObj(invoice) ? invoice : {};
  let cents = toCents(inv.subtotal) - Math.max(0, toCents(inv.discount_amount));
  if (Array.isArray(inv.fee_lines)) {
    for (const fee of inv.fee_lines) {
      if (!isObj(fee)) continue;
      const amount = num(fee.amount, 0);
      const signed = clean(fee.kind).toLowerCase() === 'discount' && amount > 0 ? -amount : amount;
      cents += Math.sign(signed) * Math.round(Math.abs(signed) * 100 + 1e-9);
    }
  }
  return cents;
}

// ---------------------------------------------------------------------------
// Row construction.
// ---------------------------------------------------------------------------

interface Ctx {
  config: AccountCodeConfig;
  nameLookup: (code: string) => string;
  /** Assigns sequence for deterministic intra-batch ordering. */
  seq: () => number;
}

interface PendingRow {
  row: ExportRow;
  seq: number;
}

/** Push a journal line. side: 'dr' | 'cr'; a NEGATIVE signedCents flips the
 *  column (a negative credit is a debit) so exported debit/credit cells stay
 *  ≥ 0. amount 0 emits nothing. */
function pushRow(
  out: PendingRow[],
  ctx: Ctx,
  base: Omit<ExportRow, 'account_code' | 'debit_cents' | 'credit_cents' | 'account_name'> & { account_code?: string },
  side: 'dr' | 'cr',
  signedCents: number,
): void {
  const cents = Math.round(signedCents);
  if (cents === 0) return;
  const debit = (side === 'dr' && cents > 0) || (side === 'cr' && cents < 0);
  const account_code = clean(base.account_code) || accountCodeFor(base, ctx.config);
  const row: ExportRow = {
    date: base.date,
    type: base.type,
    ref: base.ref,
    account_code,
    debit_cents: debit ? Math.abs(cents) : 0,
    credit_cents: debit ? 0 : Math.abs(cents),
    memo: base.memo,
    customer: base.customer,
    entity_id: base.entity_id,
    ...(base.role ? { role: base.role } : {}),
  };
  const name = ctx.nameLookup(account_code);
  if (name) row.account_name = name;
  out.push({ row, seq: ctx.seq() });
}

const customerOf = (inv: unknown, pay?: unknown): string =>
  firstText(
    isObj(inv) ? inv.customer_display_name : '',
    isObj(inv) ? inv.customer_name : '',
    isObj(pay) ? (pay as Record<string, unknown>).customer_name : '',
    isObj(inv) ? inv.customer_id : '',
    isObj(pay) ? (pay as Record<string, unknown>).customer_id : '',
  );

// ---------------------------------------------------------------------------
// Invoice journal.
// ---------------------------------------------------------------------------

/**
 * invoiceExportRows — the GL journal for one invoice.
 *   posted : DR AR(total) · DR deposits-held(deposit_applied)
 *            CR each income-account split · CR tax liability(tax_amount)
 *   void   : the mirror image (reversal) — income+tax debit, AR+deposits credit.
 *   draft / unknown status / non-object → [] (never billed → nothing posts).
 *
 * opts.splits: storage rows {income_account_code, amount} | rich rows
 * {account_id|account_code, amount_cents} | mixed. Falls back to
 * invoice.income_account_splits, then a single income-base bucket.
 */
export function invoiceExportRows(invoice: unknown, opts: InvoiceExportOptions = {}): ExportRow[] {
  if (!isObj(invoice)) return [];
  const status = clean(invoice.status).toLowerCase();
  const posted = POSTED.has(status);
  const voided = status === 'void';
  if (!posted && !voided) return [];

  const ctx: Ctx = {
    config: (isObj(opts) ? opts : {}) as AccountCodeConfig,
    nameLookup: makeAccountNameLookup(opts.accountsByCode),
    seq: (() => { let n = 0; return () => n++; })(),
  };
  const out: PendingRow[] = [];

  const ref = firstText(
    invoice.invoice_number,
    clean(invoice.id) ? `INV-${clean(invoice.id)}` : '',
    'INVOICE',
  );
  const billing = clean(invoice.billing_type).toLowerCase();
  const memoBase = voided
    ? `Void reversal — invoice ${ref}`
    : `Invoice ${ref}${billing && billing !== 'standard' ? ` (${billing})` : ''}`;
  const base = {
    date: invoiceDateOf(invoice),
    ref,
    customer: customerOf(invoice),
    entity_id: clean(invoice.id),
  };

  // Splits: explicit opts → stored invoice rows → single income-base bucket.
  let splits: ExportSplit[] = [];
  const explicit = Array.isArray(opts.splits) ? opts.splits
    : Array.isArray(invoice.income_account_splits) ? invoice.income_account_splits
    : null;
  if (explicit) {
    // Merge by account (first-seen order) — duplicate account rows would post
    // as separate lines; the journal is cleaner and still foots.
    const merged = new Map<string, ExportSplit>();
    const order: string[] = [];
    for (const raw of explicit) {
      const n = normalizeSplitRow(raw);
      if (!n || n.amount_cents === 0) continue;
      const hit = merged.get(n.account_code);
      if (hit) hit.amount_cents += n.amount_cents;
      else { merged.set(n.account_code, { ...n }); order.push(n.account_code); }
    }
    splits = order.map((k) => merged.get(k) as ExportSplit).filter((s) => s.amount_cents !== 0);
  }
  if (splits.length === 0) {
    const baseCents = incomeBaseCents(invoice);
    if (baseCents !== 0) {
      splits = [{ account_code: '', amount_cents: baseCents }]; // '' → defaultIncome
    }
  }

  const totalCents = toCents(invoice.total);
  const depositCents = Math.max(0, toCents(invoice.deposit_applied));
  const taxCents = toCents(firstFinite(invoice.tax_amount, invoice.tax, invoice.tax_total));

  if (posted) {
    // DR AR for the net receivable; DR deposits-held for the prepaid slice.
    pushRow(out, ctx, { ...base, type: 'invoice_income', role: 'ar', memo: memoBase }, 'dr', totalCents);
    pushRow(out, ctx, { ...base, type: 'invoice_income', role: 'deposit', memo: `${memoBase} — deposit applied` }, 'dr', depositCents);
    for (const s of splits) {
      pushRow(out, ctx, {
        ...base, type: 'invoice_income', role: 'income',
        account_code: s.account_code, memo: memoBase,
      }, 'cr', s.amount_cents);
    }
    pushRow(out, ctx, { ...base, type: 'invoice_tax', role: 'tax', memo: `${memoBase} — sales tax` }, 'cr', taxCents);
  } else {
    // void — mirror image.
    for (const s of splits) {
      pushRow(out, ctx, {
        ...base, type: 'invoice_income', role: 'income',
        account_code: s.account_code, memo: memoBase,
      }, 'dr', s.amount_cents);
    }
    pushRow(out, ctx, { ...base, type: 'invoice_tax', role: 'tax', memo: `${memoBase} — sales tax` }, 'dr', taxCents);
    pushRow(out, ctx, { ...base, type: 'invoice_income', role: 'deposit', memo: `${memoBase} — deposit released` }, 'cr', depositCents);
    pushRow(out, ctx, { ...base, type: 'invoice_income', role: 'ar', memo: memoBase }, 'cr', totalCents);
  }

  return out.sort((a, b) => a.seq - b.seq).map((p) => p.row);
}

// ---------------------------------------------------------------------------
// Payment journal.
// ---------------------------------------------------------------------------

const PAYMENT_FEE_KEYS = ['fee_amount', 'processing_fee', 'fee', 'service_fee', 'card_fee'];

const paymentFeeCents = (payment: Record<string, unknown>): number => {
  for (const key of PAYMENT_FEE_KEYS) {
    const n = looseNum(payment[key]);
    if (Number.isFinite(n) && n !== 0) return Math.round(Math.abs(n) * 100);
  }
  return 0;
};

const isCreditMemo = (payment: Record<string, unknown>): boolean =>
  clean(payment.method).toLowerCase() === 'credit_memo';

// Payment bank side: explicit opt → payment's own deposit account fields →
// undeposited for cash/check → config bankAccount → ''.
const paymentBankAccount = (payment: Record<string, unknown>, opts: PaymentExportOptions, config: AccountCodeConfig): string =>
  firstText(
    configCode(opts.bank_account_id),
    configCode(payment.bank_account_id),
    configCode(payment.deposit_account_id),
    configCode(payment.deposit_to_account),
    configCode(payment.bank_account),
    configCode(payment.gl_account),
    ['cash', 'check'].includes(clean(payment.method).toLowerCase()) ? configFor(config, 'undepositedAccount') : '',
    configFor(config, 'bankAccount'),
  );

const paymentRef = (payment: Record<string, unknown>, invoice: unknown): string => {
  const prefix = isCreditMemo(payment) ? 'CM' : num(payment.amount, 0) < 0 ? 'RF' : 'PMT';
  const base = firstText(
    payment.id,
    payment.reference_number,
    payment.creation_request_key,
    `${firstText(isObj(invoice) ? (invoice as Record<string, unknown>).invoice_number : '', payment.invoice_id, 'unlinked')}-${paymentDateOf(payment) || 'nodate'}`,
  );
  return `${prefix}-${base}`;
};

/**
 * paymentExportRows — the GL journal for one Payment row.
 *   positive (receipt)      : DR bank(net) · DR fee(fee) · CR AR(gross)
 *   negative refund row     : DR AR(gross) · DR fee(fee) · CR bank(gross+fee)
 *   negative credit memo    : DR AR(amount) · CR credit liability(amount)
 *   void / zero / non-object: [] (voided rows never happened).
 * opts.invoice supplies ref/customer context (recommended — the batch passes
 * it automatically). opts.bank_account_id overrides the bank-side chain.
 */
export function paymentExportRows(payment: unknown, opts: PaymentExportOptions = {}): ExportRow[] {
  if (!isObj(payment)) return [];
  const status = clean(payment.status).toLowerCase();
  if (status === 'void') return [];
  const amountCents = toCents(payment.amount);
  if (amountCents === 0) return [];

  const o = isObj(opts) ? opts : {};
  const ctx: Ctx = {
    config: o as AccountCodeConfig,
    nameLookup: makeAccountNameLookup(o.accountsByCode),
    seq: (() => { let n = 0; return () => n++; })(),
  };
  const out: PendingRow[] = [];
  const invoice = isObj(o.invoice) ? o.invoice : {};
  const invRef = firstText(
    (invoice as Record<string, unknown>).invoice_number,
    payment.invoice_id,
  );
  const ref = paymentRef(payment, invoice);
  const refNum = clean(payment.reference_number);
  const glMemo = clean(payment.gl_memo);
  const method = clean(payment.method).toLowerCase();
  const base = {
    date: paymentDateOf(payment),
    ref,
    customer: customerOf(invoice, payment),
    entity_id: clean(payment.id),
  };

  const fee = paymentFeeCents(payment);
  const gross = Math.abs(amountCents);

  if (amountCents > 0) {
    // Receipt: bank gets net; fee expense carries the processor cut; AR drops
    // by the gross. Bank prefers undeposited-funds for cash/check.
    const bank = paymentBankAccount(payment, o, ctx.config);
    const memo = glMemo || `Payment ${invRef ? `on ${invRef}` : ''}${method ? ` (${method}${refNum ? ` #${refNum}` : ''})` : ''}`;
    pushRow(out, ctx, { ...base, type: 'payment_received', role: 'bank', account_code: bank, memo }, 'dr', gross - fee);
    pushRow(out, ctx, { ...base, type: 'payment_fee', role: 'fee', memo: `${memo} — processing fee` }, 'dr', fee);
    pushRow(out, ctx, { ...base, type: 'payment_received', role: 'ar', memo }, 'cr', gross);
  } else if (isCreditMemo(payment)) {
    // Credit memo: reopens the balance without moving cash — the contra posts
    // to the customer-credits liability account, never to bank.
    const memo = glMemo || `Credit memo${invRef ? ` on ${invRef}` : ''}`;
    pushRow(out, ctx, { ...base, type: 'refund', role: 'ar', memo }, 'dr', gross);
    pushRow(out, ctx, { ...base, type: 'refund', role: 'credit', memo }, 'cr', gross);
  } else {
    // Refund: AR restored for the gross; the bank loses principal + fee; the
    // processor's cut posts to the fee expense account.
    const bank = paymentBankAccount(payment, o, ctx.config);
    const memo = glMemo || `Refund${invRef ? ` on ${invRef}` : ''}${method ? ` (${method}${refNum ? ` #${refNum}` : ''})` : ''}`;
    pushRow(out, ctx, { ...base, type: 'refund', role: 'ar', memo }, 'dr', gross);
    pushRow(out, ctx, { ...base, type: 'payment_fee', role: 'fee', memo: `${memo} — processing fee` }, 'dr', fee);
    pushRow(out, ctx, { ...base, type: 'refund', role: 'bank', account_code: bank, memo }, 'cr', gross + fee);
  }

  return out.sort((a, b) => a.seq - b.seq).map((p) => p.row);
}

// ---------------------------------------------------------------------------
// Batch assembly.
// ---------------------------------------------------------------------------

// Accept a {id: row} map OR a row array → Map<id, row>; rows also index
// themselves by their own .id so either keying style resolves.
function indexById(input: unknown): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  const add = (key: unknown, row: unknown) => {
    if (!isObj(row)) return;
    const k = clean(key) || clean(row.id);
    if (k && !byId.has(k)) byId.set(k, row);
    const rid = clean(row.id);
    if (rid && !byId.has(rid)) byId.set(rid, row);
  };
  if (Array.isArray(input)) for (const r of input) add(isObj(r) ? r.id : '', r);
  else if (isObj(input)) for (const [k, v] of Object.entries(input)) add(k, v);
  else if (input instanceof Map) for (const [k, v] of input.entries()) add(k, v);
  return byId;
}

const inPeriod = (day: string, from: string, to: string, bounded: boolean): boolean => {
  if (!bounded) return true;
  if (!day) return false; // undated rows can't be attributed to a bounded period
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

const invoiceRefLabel = (inv: Record<string, unknown>): string =>
  firstText(inv.invoice_number, inv.id, '(no ref)');

const paymentRefLabel = (p: Record<string, unknown>): string =>
  firstText(p.reference_number, p.id, p.invoice_id, '(no ref)');

/**
 * exportBatch — every invoice + payment journal for a period.
 *
 * @param invoices  Invoice rows (any status/date — posted-status + period
 *                  filters are applied here). All rows also feed the
 *                  payment→invoice lookup.
 * @param payments  Payment rows (status recorded|refunded post; void skipped).
 * @param opts      period bounds, account config, accountsByCode enrichment,
 *                  invoicesById for payments whose invoice predates the period.
 * @returns {rows, balanced, unbalanced_refs, unmapped_refs, totals, period,
 *           counts, skipped} — rows sorted by (date, ref) then journal order
 *           (debit legs first, deterministic).
 */
export function exportBatch(invoices: unknown, payments: unknown, opts: ExportBatchOptions = {}): ExportBatchResult {
  const o = isObj(opts) ? opts : {};
  const from = toDay(o.from ?? o.period_start ?? o.start ?? o.start_date);
  const to = toDay(o.to ?? o.period_end ?? o.end ?? o.end_date);
  const bounded = Boolean(from || to);
  const config = o as AccountCodeConfig;
  const nameLookup = makeAccountNameLookup(o.accountsByCode);

  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const paymentList = Array.isArray(payments) ? payments : [];
  const invoiceById = indexById(invoiceList);
  for (const [k, v] of indexById(o.invoicesById)) {
    if (!invoiceById.has(k)) invoiceById.set(k, v);
  }

  const skipped: ExportBatchResult['skipped'] = [];
  const journals: Array<{ date: string; ref: string; order: number; rows: ExportRow[] }> = [];
  let order = 0;

  const emit = (date: string, ref: string, rows: ExportRow[]) => {
    if (!rows.length) return;
    for (const r of rows) {
      const name = nameLookup(r.account_code);
      if (name && !r.account_name) r.account_name = name;
    }
    journals.push({ date, ref, order: order++, rows });
  };

  let invoiceCount = 0;
  for (const raw of invoiceList) {
    const inv = isObj(raw) ? raw : null;
    const ref = inv ? invoiceRefLabel(inv) : '(no ref)';
    if (!inv) { skipped.push({ entity: 'invoice', ref, reason: 'malformed_row' }); continue; }
    const status = clean(inv.status).toLowerCase();
    const posted = POSTED.has(status);
    if (!posted && !isVoidInvoice(inv)) {
      skipped.push({ entity: 'invoice', ref, reason: status === 'draft' ? 'draft' : 'unposted_status' });
      continue;
    }
    const day = invoiceDateOf(inv);
    if (!inPeriod(day, from, to, bounded)) {
      skipped.push({ entity: 'invoice', ref, reason: day ? 'out_of_period' : 'undated' });
      continue;
    }
    const rows = invoiceExportRows(inv, o);
    if (!rows.length) { skipped.push({ entity: 'invoice', ref, reason: 'empty_journal' }); continue; }
    invoiceCount++;
    emit(day, rows[0].ref, rows);
  }

  let paymentCount = 0;
  for (const raw of paymentList) {
    const p = isObj(raw) ? raw : null;
    const ref = p ? paymentRefLabel(p) : '(no ref)';
    if (!p) { skipped.push({ entity: 'payment', ref, reason: 'malformed_row' }); continue; }
    const status = clean(p.status).toLowerCase();
    if (status === 'void') { skipped.push({ entity: 'payment', ref, reason: 'void' }); continue; }
    if (toCents(p.amount) === 0) { skipped.push({ entity: 'payment', ref, reason: 'zero_amount' }); continue; }
    const day = paymentDateOf(p);
    if (!inPeriod(day, from, to, bounded)) {
      skipped.push({ entity: 'payment', ref, reason: day ? 'out_of_period' : 'undated' });
      continue;
    }
    const inv = invoiceById.get(clean(p.invoice_id));
    const rows = paymentExportRows(p, { ...o, invoice: inv });
    if (!rows.length) { skipped.push({ entity: 'payment', ref, reason: 'empty_journal' }); continue; }
    paymentCount++;
    emit(day, rows[0].ref, rows);
  }

  // Deterministic order: date → ref → first-seen order.
  journals.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)
    || a.order - b.order);

  const rows = journals.flatMap((j) => j.rows);
  const unbalanced: string[] = [];
  const unmapped: string[] = [];
  let debitTotal = 0;
  let creditTotal = 0;
  for (const j of journals) {
    let dr = 0;
    let cr = 0;
    let hasUnmapped = false;
    for (const r of j.rows) {
      dr += r.debit_cents;
      cr += r.credit_cents;
      if (!r.account_code) hasUnmapped = true;
    }
    debitTotal += dr;
    creditTotal += cr;
    if (dr !== cr && !unbalanced.includes(j.ref)) unbalanced.push(j.ref);
    if (hasUnmapped && !unmapped.includes(j.ref)) unmapped.push(j.ref);
  }

  return {
    rows,
    balanced: unbalanced.length === 0 && debitTotal === creditTotal,
    unbalanced_refs: unbalanced,
    unmapped_refs: unmapped,
    totals: { debit_cents: debitTotal, credit_cents: creditTotal },
    period: { from, to },
    counts: { invoices: invoiceCount, payments: paymentCount, journals: journals.length },
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Serializers.
// ---------------------------------------------------------------------------

const money2 = (cents: number): string => (Math.abs(cents) / 100).toFixed(2);

const csvCell = (value: unknown): string => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * toCsv — deterministic CSV: columns
 *   date,ref,type,account,debit,credit,memo
 * Rows emit in the order given (exportBatch already sorts). Money renders as
 * plain 2-decimal dollars ('1234.56'); empty cell when the leg is 0. Cells
 * are RFC-4180-escaped (quoted on " , \n \r; quotes doubled).
 */
export function toCsv(rows: unknown): string {
  const list = Array.isArray(rows) ? rows : [];
  const lines = ['date,ref,type,account,debit,credit,memo'];
  for (const raw of list) {
    const r = isObj(raw) ? raw as ExportRow : null;
    if (!r) continue;
    lines.push([
      clean(r.date),
      clean(r.ref),
      clean(r.type),
      clean(r.account_code),
      r.debit_cents ? money2(r.debit_cents) : '',
      r.credit_cents ? money2(r.credit_cents) : '',
      clean(r.memo),
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}

const tabCell = (value: unknown): string =>
  String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();

/**
 * toIifDraft — QuickBooks-IIF-ISH preview (TAB-separated):
 *   !TRNS/!SPL/!ENDTRNS headers, one TRNS…SPL…ENDTRNS block per journal ref.
 *   The journal's first line (always a debit leg in this engine's ordering)
 *   becomes TRNS; the rest become SPL lines. AMOUNT is signed dollars:
 *   debit positive, credit negative — each block sums to zero when balanced.
 *   ACCNT carries the resolved account code ('(UNMAPPED)' when ''); NAME
 *   carries the customer.
 *
 *   ⚠ DRY-RUN SHAPE ONLY for the I-09 adapter — this is NOT a byte-exact
 *   QuickBooks import file (real IIF needs TRNSID/SPLID classes, exact
 *   header ordering, and account-name resolution against the QBO chart).
 *   Final mapping lands once OAuth credentials exist.
 */
export function toIifDraft(rows: unknown): string {
  const list = (Array.isArray(rows) ? rows : []).filter(isObj) as ExportRow[];
  const lines = [
    '!TRNS\tTRNSID\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO',
    '!SPL\tSPLID\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO',
    '!ENDTRNS',
  ];
  // Group contiguous rows sharing a ref into one transaction block.
  let block: ExportRow[] = [];
  let blockRef: string | null = null;
  const flush = () => {
    if (!block.length) return;
    block.forEach((r, i) => {
      const amount = ((r.debit_cents - r.credit_cents) / 100).toFixed(2);
      const accnt = r.account_code || '(UNMAPPED)';
      lines.push([
        i === 0 ? 'TRNS' : 'SPL',
        '',
        clean(r.date),
        accnt,
        clean(r.customer),
        amount,
        clean(r.ref),
        clean(r.memo),
      ].map(tabCell).join('\t'));
    });
    lines.push('ENDTRNS');
    block = [];
    blockRef = null;
  };
  for (const r of list) {
    const ref = clean(r.ref);
    if (blockRef !== null && ref !== blockRef) flush();
    blockRef = ref;
    block.push(r);
  }
  flush();
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Convenience aggregates for adapters (I-09/I-10).
// ---------------------------------------------------------------------------

/**
 * journalBalance — debit/credit sums for one journal's rows.
 * {ok, delta_cents} — ok when they tie exactly.
 */
export function journalBalance(rows: unknown): { ok: boolean; debit_cents: number; credit_cents: number; delta_cents: number } {
  let dr = 0;
  let cr = 0;
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!isObj(raw)) continue;
    dr += Math.round(num((raw as ExportRow).debit_cents, 0));
    cr += Math.round(num((raw as ExportRow).credit_cents, 0));
  }
  return { ok: dr === cr, debit_cents: dr, credit_cents: cr, delta_cents: dr - cr };
}

/**
 * reconcileBatch — expected-vs-computed totals check for a batch.
 * Pass expected {debit_cents|debit, credit_cents|credit, rows|row_count} in
 * any spelling; returns per-field deltas plus ok.
 */
export function reconcileBatch(
  batch: ExportBatchResult,
  expected: { debit_cents?: unknown; debit?: unknown; credit_cents?: unknown; credit?: unknown; rows?: unknown; row_count?: unknown } = {},
): { ok: boolean; debit_delta_cents: number; credit_delta_cents: number; row_delta: number } {
  const b = isObj(batch) ? batch : ({} as ExportBatchResult);
  const rows = Array.isArray((b as ExportBatchResult).rows) ? (b as ExportBatchResult).rows : [];
  const totals = (b as ExportBatchResult).totals || { debit_cents: 0, credit_cents: 0 };
  const e = isObj(expected) ? expected : {};
  const expDebit = Math.round(firstFinite(e.debit_cents, e.debit) || 0);
  const expCredit = Math.round(firstFinite(e.credit_cents, e.credit) || 0);
  const expRows = Math.round(firstFinite(e.rows, e.row_count) || 0);
  return {
    ok: totals.debit_cents === expDebit && totals.credit_cents === expCredit && rows.length === expRows,
    debit_delta_cents: totals.debit_cents - expDebit,
    credit_delta_cents: totals.credit_cents - expCredit,
    row_delta: rows.length - expRows,
  };
}
