// Lump-sync export model — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*), frontend admin surfaces, and Node test
// harnesses. No I/O anywhere in this module — the wiring layer (the future
// lumpSyncAction backend / the I-09 QBO adapter's migration path) loads
// Invoice / Payment / StoreCreditLedger / Customer / IncomeAccount rows and
// these functions turn them into ONE all-time GL dump envelope for a
// one-shot migration import.
//
// I-10 (ESTIMATOR_MASTERPLAN WS-I): "all-time GL dump (invoices + payments +
// journal splits) for one-shot migration import. Verify: dump reconciles to
// Financials totals."
//
// ── ENVELOPE ─────────────────────────────────────────────────────────────
//   {
//     format: 'lump-sync/v1',
//     generated_at,                       // injectable `now` → ISO
//     sections: {
//       journal_lines[],                  // GL postings (ExportRow parity — I-08)
//       invoice_rows[],                   // flat per-invoice dump (all statuses)
//       payment_rows[],                   // flat per-payment dump (all statuses)
//       credit_rows[],                    // flat per-ledger-row dump (live rows)
//       audit[],                          // every row excluded from journals,
//                                         //   with WHY (voids land here by spec)
//     },
//     totals{ *_cents authoritative integers + dollar mirrors +
//             by_account_cents },         // reconciliation targets — see below
//     row_counts{ per-section + per-class counts },
//     reconciliation{ checks[], journal_balanced, unbalanced_refs,
//                     unmapped_refs, ok },
//     checksum,                           // fnv1a-base36 over canon(sections)
//   }
//
// ── JOURNAL SEMANTICS (accountingExportModel I-08 parity, restated) ──────
//   posted invoice : DR AR(total) · DR deposits-held(deposit_applied)
//                    CR each income-account split · CR tax(tax_amount).
//   receipt paymt  : DR bank(gross − fee) · DR fee(fee) · CR AR(gross).
//   refund row     : DR AR(gross) · DR fee(fee) · CR bank(gross + fee).
//   credit memo    : DR AR(gross) · CR credit-liability(gross) — no cash.
//   Every journal ref must debit == credit; offenders surface in
//   reconciliation.unbalanced_refs (journal still emitted, like I-08).
//   Row types/roles/account-resolution chains are identical to I-08 so a
//   migration importer consumes one row shape for both engines.
//
// ── SPEC-MANDATED DIVERGENCE FROM I-08 (void handling) ───────────────────
//   accountingExportModel emits a mirror-image REVERSAL journal for void
//   invoices and silently skips void payments. The I-10 spec instead says
//   "void invoices/payments excluded from totals but included in an audit
//   section for completeness" — the entity stores only the CURRENT status,
//   so the original posting event is unknowable and cannot be faithfully
//   replayed; the void lands in sections.audit with voided_date/void_reason.
//   This model additionally applies the repo-wide void-ish test (status
//   'void'|'refunded'|'cancelled'|'canceled' OR void/voided/is_void/deleted
//   flags OR a voided_date stamp — reportEngine.isVoidRow parity) BEFORE the
//   posted-status test, so a status-'sent' row carrying void evidence is
//   audited, not posted (exportBatch is status-only; documented, safer for
//   a one-shot migration where double-posting AR is the expensive mistake).
//
// ── RECONCILIATION TOTALS (the I-10 verify: "reconciles to Financials") ──
//   totals.ar_balance_cents    == Σ open invoice balance_due — 'open' is the
//                                 arAgingReports membership rule: not
//                                 void-ish, not draft, balance > 0
//                                 (balance_due|balance|amount_due
//                                 authoritative else total − paid floor 0;
//                                 w-63 invoiceBalanceCents chain).
//   totals.invoiced_cents      == Σ posted invoice total (POSTED set
//                                 {'sent','partially_paid','paid'} + import
//                                 aliases {'partial','issued'} —
//                                 accountingExportModel/taxLiabilityModel
//                                 parity; invoiceTotalCents chain: total →
//                                 grand_total → subtotal−discount+tax).
//   totals.collected_cents     == Σ non-void Payment.amount (SIGNED net —
//                                 receipts positive, refunds/credit memos
//                                 negative; Payment.jsonc "amount_paid is
//                                 the net sum" semantics). Positive-only
//                                 receipts split out as
//                                 payments_received_cents; refund/credit-
//                                 memo magnitudes as refunds_cents /
//                                 credit_memos_cents.
//   totals.credit_outstanding_cents == Σ signed amount over LIVE credit
//                                 ledger rows (customerReports.ledgerSum-
//                                 Cents parity: deleted!==true, the four
//                                 CREDIT_LEDGER_KINDS; amount_cents
//                                 canonical, bare `amount` read as dollars).
//   reconciliation.checks[] re-derives each total FROM THE EMITTED SECTIONS
//   (independent second pass over invoice_rows/payment_rows/credit_rows) so
//   an importer can prove the dump is self-consistent without re-reading
//   source entities. ok = every check ties AND journals balance.
//
// ── DATA CONTRACT NOTES ──────────────────────────────────────────────────
//   * glSplits input (optional): pre-computed split rows per invoice —
//     accepted forms: function(invoice)→rows · Map<invoiceId|number, rows> ·
//     plain object {invoiceId|invoice_number: rows|{splits:rows}} · array of
//     {invoice_id|id|ref, splits|rows|income_account_splits}. Priority over
//     invoice.income_account_splits, then the single income-base bucket
//     (I-02 incomeBaseCents: subtotal − discount_amount + Σ signed
//     fee_lines.amount; 'discount' kind posts negative). Bare split-row
//     arrays cannot be attributed to an invoice and are ignored.
//   * glAccounts: IncomeAccount/COGSAccount rows {code,name,parent_account,
//     status} (or a {code: row|name} map) — account_name enrichment only;
//     codes post verbatim regardless of chart membership (I-08 rule: never
//     invented, never dropped — unresolved legs post '' and surface in
//     unmapped_refs).
//   * customers: Customer[] or {id: row} — display-name enrichment when the
//     source row's frozen name is absent (company_name → name → company →
//     contact_first_name + contact_last_name → customer_display_name).
//   * config: AccountCodeConfig parity (arAccount, bankAccount,
//     undepositedAccount, taxAccount, feeAccount, depositAccount,
//     creditAccount, defaultIncome, defaultAccount — camel or snake; bare
//     code or {code|id|name} row). Also read at input top level.
//   * Money: dollar entity fields convert to INTEGER CENTS exactly once at
//     the boundary (loose parser tolerates '1,234.56'/'$5.00'); every total
//     and emitted row is integer cents — no float math anywhere downstream.
//   * KNOWN DEFECT (documented, NOT fixed — storeCreditModel.js G-09):
//     src/components/customer360/storeCreditModel.js emits ledger_row
//     .amount and .balance_after in INTEGER CENTS (its own UNIT CONTRACT)
//     while StoreCreditLedger.jsonc declares both fields DOLLARS (canonical
//     cents in amount_cents). Persisting those rows verbatim would inflate
//     them 100× under every entity-convention reader (customerReports.
//     ledgerAmountCents, customerAnalyticsModel.ledgerAmountCents, this
//     dump). No function currently writes StoreCreditLedger (grep shows
//     only staffDataRead reads it), so the translating writer is unwired.
//     This model reads the ENTITY convention: amount_cents wins, bare
//     amount = dollars — parity with both report models.
//
// ── CHECKSUM ─────────────────────────────────────────────────────────────
//   checksum = fnv1a-32bit → base36 over canon(sections) — the canonical
//   JSON.stringify-semantics serialization with deep-sorted keys
//   (savedReportRunsModel.canonicalParamsJson + stableHash parity copy).
//   Row order is fully deterministic (every section sorted on stored keys),
//   so the same entity state always produces the same checksum regardless
//   of generated_at, config, or caller — an idempotent-dump identity for
//   migration verification. verifyDump() recomputes it.
//
// SURFACE:
//   LUMP_SYNC_FORMAT / LUMP_SYNC_SECTIONS / POSTED_INVOICE_STATUSES /
//     CREDIT_LEDGER_KINDS / AUDIT_REASONS
//   toCents / fromCents / invoiceDateOf / paymentDateOf / ledgerDayOf
//   isVoidishInvoice / isPostedInvoice / invoiceTotalCents /
//     invoicePaidCents / invoiceBalanceCents / incomeBaseCents
//   isVoidishPayment / paymentAmountCents / ledgerAmountCents /
//     isLiveLedgerRow / accountCodeFor
//   invoiceJournalRows / paymentJournalRows
//   invoiceDumpRow / paymentDumpRow / creditDumpRow
//   buildLumpSyncDump / dumpChecksum / verifyDump / canonicalJson
//
// ---------------------------------------------------------------------------

export const LUMP_SYNC_FORMAT = 'lump-sync/v1' as const;

export const LUMP_SYNC_SECTIONS = [
  'journal_lines',
  'invoice_rows',
  'payment_rows',
  'credit_rows',
  'audit',
] as const;

/** Posted = billed. accountingExportModel / taxLiabilityModel parity set. */
export const POSTED_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid'] as const;
const POSTED = new Set([...POSTED_INVOICE_STATUSES, 'partial', 'issued']);

/** StoreCreditLedger event kinds — customerReports/storeCreditModel parity. */
export const CREDIT_LEDGER_KINDS = [
  'credit_issued',
  'credit_applied',
  'credit_expired',
  'credit_voided',
] as const;
const LEDGER_KINDS = new Set<string>(CREDIT_LEDGER_KINDS);

/** Why a source row produced no journal lines / left a totals section. */
export const AUDIT_REASONS = [
  'void',
  'void_flagged',
  'draft',
  'unposted_status',
  'malformed_row',
  'zero_amount',
  'empty_journal',
  'deleted_row',
  'unknown_kind',
] as const;

export type AuditReason = (typeof AUDIT_REASONS)[number];

/** Posting-leg hint — accountingExportModel ExportRole parity. */
export type LumpSyncRole = 'ar' | 'income' | 'tax' | 'bank' | 'fee' | 'deposit' | 'credit';

/** Journal row type — accountingExportModel ExportRowType parity. */
export type LumpSyncJournalType =
  | 'invoice_income'
  | 'invoice_tax'
  | 'payment_received'
  | 'payment_fee'
  | 'refund';

/** One GL journal line — same field contract as accountingExportModel.ExportRow. */
export interface LumpSyncJournalLine {
  /** 'YYYY-MM-DD' (issue-date chain for invoices, paid-date for payments). */
  date: string;
  type: LumpSyncJournalType;
  /** Journal ref — invoice_number, or PMT-/RF-/CM- doc ref. */
  ref: string;
  /** Resolved GL code; '' = unmapped (surfaced in unmapped_refs, never dropped). */
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  memo: string;
  customer: string;
  /** Source entity id (Invoice.id or Payment.id). */
  entity_id: string;
  /** Source entity name — disambiguates entity_id across sections. */
  source_entity: 'Invoice' | 'Payment';
  role?: LumpSyncRole;
  account_name?: string;
}

/** Flat per-invoice dump row. All money integer cents. */
export interface LumpSyncInvoiceRow {
  id: string;
  ref: string;
  status: string;
  /** Emitted journal lines (posted status, not void-ish, non-empty journal). */
  posted: boolean;
  /** Member of the open-AR set (not void-ish, not draft, balance > 0). */
  open: boolean;
  /** Counted in totals.invoiced_cents (posted status, not void-ish). */
  in_totals: boolean;
  billing_type: string;
  customer_id: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  deposit_applied_cents: number;
  credit_applied_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  balance_due_cents: number;
  /** Stored income_account_splits normalized to cents (source-state echo —
   *  the JOURNAL carries the effective posting; a glSplits override posts
   *  to journal_lines without rewriting this source field). */
  income_splits: Array<{ account_code: string; amount_cents: number }>;
  salesperson: string;
  work_order_id: string;
  estimate_id: string;
  creation_request_key: string;
}

/** Flat per-payment dump row. amount_cents keeps the source sign. */
export interface LumpSyncPaymentRow {
  id: string;
  /** PMT-/RF-/CM- journal ref (same rule as I-08). */
  ref: string;
  kind: 'receipt' | 'refund' | 'credit_memo' | 'void' | 'zero';
  status: string;
  /** Emitted journal lines (non-void, non-deleted, nonzero amount). */
  posted: boolean;
  /** Counted in totals.collected_cents (non-void-ish). */
  in_totals: boolean;
  invoice_id: string;
  invoice_ref: string;
  customer_id: string;
  customer_name: string;
  method: string;
  paid_date: string;
  amount_cents: number;
  fee_cents: number;
  bank_account_code: string;
  reference_number: string;
  refund_of_payment_id: string;
  creation_request_key: string;
}

/** Flat per-ledger-row dump row (live rows only — deleted/unknown-kind audit). */
export interface LumpSyncCreditRow {
  id: string;
  customer_id: string;
  customer_name: string;
  kind: string;
  /** Signed integer cents (amount_cents canonical; amount-as-dollars fallback). */
  amount_cents: number;
  occurred_at: string;
  invoice_id: string;
  /** For credit_voided rows: id of the reversed ledger row. */
  ref: string;
  reversed_kind: string;
  reason: string;
  actor: string;
  balance_after_cents: number;
  creation_request_key: string;
}

/** One audit entry — a source row excluded from journals/totals, with why. */
export interface LumpSyncAuditRow {
  entity: 'invoice' | 'payment' | 'credit_ledger';
  entity_id: string;
  ref: string;
  reason: AuditReason | string;
  detail: string;
  status: string;
  day: string;
  amount_cents: number;
  voided_date: string;
  void_reason: string;
}

export interface LumpSyncTotals {
  /** Σ posted invoice total — cents authoritative. */
  invoiced_cents: number;
  /** Σ posted invoice tax_amount. */
  tax_collected_cents: number;
  /** Σ non-void signed payment amount (net receipts − refunds − memos). */
  collected_cents: number;
  /** Σ non-void payment amount where amount > 0. */
  payments_received_cents: number;
  /** Σ |amount| over non-void negative non-credit_memo payments. */
  refunds_cents: number;
  /** Σ |amount| over non-void credit_memo payments. */
  credit_memos_cents: number;
  /** Σ open invoice balance_due (arAgingReports membership parity). */
  ar_balance_cents: number;
  /** Count of open (AR-member) invoices. */
  open_invoice_count: number;
  /** Σ signed live-ledger amount (net outstanding store credit). */
  credit_outstanding_cents: number;
  credit_issued_cents: number;
  credit_applied_cents: number;
  credit_expired_cents: number;
  credit_voided_cents: number;
  /** Σ debit/credit legs over journal_lines. */
  journal_debit_cents: number;
  journal_credit_cents: number;
  /** Posted income-splits Σ per STORED split code — '' is the unmapped
   *  bucket (financialReports business_summary '(unmapped)' parity): it
   *  records that the income had no account coding in the source data,
   *  even though the journal leg resolved to a configured default. */
  by_account_cents: Record<string, number>;
  /** Dollar display mirrors (cents/100) — *_cents fields are authoritative. */
  invoiced: number;
  collected: number;
  ar_balance: number;
  credit_outstanding: number;
}

export interface LumpSyncCheck {
  name: string;
  expected_cents: number;
  actual_cents: number;
  delta_cents: number;
  ok: boolean;
}

export interface LumpSyncDump {
  format: typeof LUMP_SYNC_FORMAT;
  generated_at: string;
  sections: {
    journal_lines: LumpSyncJournalLine[];
    invoice_rows: LumpSyncInvoiceRow[];
    payment_rows: LumpSyncPaymentRow[];
    credit_rows: LumpSyncCreditRow[];
    audit: LumpSyncAuditRow[];
  };
  totals: LumpSyncTotals;
  row_counts: {
    journal_lines: number;
    invoice_rows: number;
    payment_rows: number;
    credit_rows: number;
    audit_rows: number;
    journals: number;
    invoices_posted: number;
    invoices_open: number;
    payments_posted: number;
    gl_accounts: number;
  };
  reconciliation: {
    checks: LumpSyncCheck[];
    journal_balanced: boolean;
    unbalanced_refs: string[];
    unmapped_refs: string[];
    ok: boolean;
  };
  checksum: string;
}

// ---------------------------------------------------------------------------
// Small helpers — clean/num/isObj/firstText parity with accountingExportModel.
// ---------------------------------------------------------------------------

const clean = (v: unknown): string =>
  v === undefined || v === null ? '' : String(v).trim();

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Loose numeric parse: numbers and plain/decorated numeric strings
// ('1,234.56', '$5.00', '-2.5'); letter-laden strings rejected
// (accountingExportModel.looseNum parity).
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

const firstStr = (row: unknown, keys: string[]): string => {
  if (!isObj(row)) return '';
  for (const key of keys) {
    const v = clean(row[key]);
    if (v) return v;
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
// wins (accountingExportModel.toDay parity; ISO stamps never shift days).
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

/** Accept ISO string / Date / epoch-ms; return ISO (clock when absent). */
const toIso = (now: unknown): string => {
  if (now instanceof Date) {
    const t = now.getTime();
    return Number.isFinite(t) ? now.toISOString() : new Date().toISOString();
  }
  if (typeof now === 'number' && Number.isFinite(now)) {
    return new Date(now).toISOString();
  }
  const s = clean(now);
  if (s) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
};

// ---------------------------------------------------------------------------
// Date chains + row classification.
// ---------------------------------------------------------------------------

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

/** Ledger row day: occurred_at → created_at → created_date (ledgerDay parity). */
export function ledgerDayOf(row: unknown): string {
  const r = isObj(row) ? row : {};
  return toDay(firstText(r.occurred_at, r.created_at, r.created_date));
}

// repo-wide void-ish test (reportEngine.isVoidRow parity): explicit status in
// the void-ish set OR a void/deleted flag OR a voided_date stamp.
const VOIDISH_STATUSES = new Set(['void', 'refunded', 'cancelled', 'canceled']);
const VOIDISH_PAYMENT_STATUSES = new Set(['void', 'cancelled', 'canceled']);

/**
 * isVoidishInvoice — true when the invoice must not post or total.
 * Status 'void' covers the schema enum; 'refunded'/'cancelled' are import
 * spellings; flags + voided_date catch status/stamp drift. NOTE: Payment's
 * 'refunded' status is LIVE (a refund row posts a refund journal) — it is
 * deliberately absent from the payment variant below.
 */
export function isVoidishInvoice(inv: unknown): boolean {
  if (!isObj(inv)) return false;
  if (VOIDISH_STATUSES.has(clean(inv.status).toLowerCase())) return true;
  if (inv.void === true || inv.voided === true || inv.is_void === true || inv.deleted === true) return true;
  return Boolean(clean(inv.voided_date));
}

const isDraftInvoice = (inv: unknown): boolean =>
  clean(isObj(inv) ? inv.status : '').toLowerCase() === 'draft';

/** Posted status test (I-08/I-13 parity) — void-ish checked separately. */
export function isPostedInvoice(inv: unknown): boolean {
  if (!isObj(inv)) return false;
  return POSTED.has(clean(inv.status).toLowerCase());
}

/**
 * isVoidishPayment — payment must not post or total.
 * Status 'void' (+ cancelled spellings) OR void flags OR voided_date OR
 * deleted. 'refunded' is NOT void — it is the schema's live refund-row
 * status and posts a refund journal.
 */
export function isVoidishPayment(payment: unknown): boolean {
  if (!isObj(payment)) return false;
  if (VOIDISH_PAYMENT_STATUSES.has(clean(payment.status).toLowerCase())) return true;
  if (payment.void === true || payment.voided === true || payment.is_void === true || payment.deleted === true) return true;
  return Boolean(clean(payment.voided_date));
}

/** Signed payment amount in cents — firstFinite chain parity (I-08). */
export function paymentAmountCents(payment: unknown): number {
  const p = isObj(payment) ? payment : {};
  const v = firstFinite(p.amount, p.value, p.paid_amount, p.total);
  return Number.isFinite(v) ? Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-9) : 0;
}

// ---------------------------------------------------------------------------
// Invoice money chains — w-63 parity (financialReports restated).
// ---------------------------------------------------------------------------

/** amount_paid → paid_amount/total_paid → payments[] live-sum → total − balance. */
export function invoicePaidCents(inv: unknown): number {
  const i = isObj(inv) ? inv : {};
  for (const v of [i.amount_paid, i.paid_amount, i.total_paid]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  if (Array.isArray(i.payments) && i.payments.length) {
    return i.payments
      .filter((p) => isObj(p) && !isVoidishPayment(p))
      .reduce((s, p) => s + paymentAmountCents(p), 0);
  }
  const balance = i.balance_due ?? i.balance ?? i.amount_due;
  if (balance != null && Number.isFinite(Number(balance)) && i.total != null) {
    return Math.max(0, toCents(i.total) - toCents(balance));
  }
  return 0;
}

/** balance_due (or balance/amount_due alias) authoritative; else total − paid floor 0. */
export function invoiceBalanceCents(inv: unknown): number {
  const i = isObj(inv) ? inv : {};
  const balance = i.balance_due ?? i.balance ?? i.amount_due;
  if (balance != null && Number.isFinite(Number(balance))) return toCents(balance);
  return Math.max(0, invoiceTotalCents(i) - invoicePaidCents(i));
}

/** Billed total: stored total → grand_total → computed subtotal − discount + tax (floor 0). */
export function invoiceTotalCents(inv: unknown): number {
  const i = isObj(inv) ? inv : {};
  const explicit = firstFinite(i.total, i.grand_total);
  if (Number.isFinite(explicit)) return toCents(explicit);
  return Math.max(
    0,
    toCents(i.subtotal) - Math.max(0, toCents(i.discount_amount)) +
      toCents(firstFinite(i.tax_amount, i.tax, i.tax_total)),
  );
}

/**
 * The invoice's pre-tax income base, integer cents:
 * subtotal − discount_amount + Σ signed fee_lines.amount (I-02
 * incomeBaseCents parity — 'discount' fee kind posts negative even when
 * stored positive). Used when neither glSplits nor income_account_splits
 * supplies a posting.
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
// Credit ledger — customerReports.ledgerAmountCents parity.
// ---------------------------------------------------------------------------

/**
 * Ledger row → signed cents. `amount_cents` is canonical (integer cents);
 * a bare `amount` reads as DOLLARS (the entity convention — see KNOWN
 * DEFECT note in the header about storeCreditModel's cent-valued rows).
 */
export function ledgerAmountCents(row: unknown): number {
  const r = isObj(row) ? row : {};
  if (r.amount_cents != null && Number.isFinite(Number(r.amount_cents))) {
    return Math.round(Number(r.amount_cents));
  }
  return toCents(r.amount);
}

/** Live ledger row: object, deleted!==true, one of the four ledger kinds. */
export function isLiveLedgerRow(row: unknown): boolean {
  return isObj(row) && row.deleted !== true && LEDGER_KINDS.has(clean(row.kind));
}

// ---------------------------------------------------------------------------
// Account-code resolution — accountingExportModel.accountCodeFor parity.
// ---------------------------------------------------------------------------

const configCode = (value: unknown): string => {
  if (typeof value === 'string') return clean(value);
  return firstStr(value, ['code', 'id', 'account_code', 'account_id', 'gl_account_code', 'name']);
};

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

const TYPE_SLOT: Record<string, string> = {
  invoice_income: 'defaultIncome',
  invoice_tax: 'taxAccount',
  payment_received: 'bankAccount',
  payment_fee: 'feeAccount',
  refund: 'bankAccount',
};

/**
 * accountCodeFor — GL code resolution chain (I-08 parity):
 * row's explicit account fields → role → config slot → type → config slot →
 * config.defaultAccount → '' (unmapped, never invented).
 */
export function accountCodeFor(row: unknown, config: unknown = {}): string {
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
// Lookups — accounts (name enrichment), customers, glSplits, invoices.
// ---------------------------------------------------------------------------

const ACCOUNT_ID_KEYS = ['code', 'id', 'account_code', 'account_id', 'gl_account_code'];
const ACCOUNT_NAME_KEYS = ['name', 'account_name', 'display_name', 'label'];

function makeAccountNameLookup(source: unknown): (code: string) => string {
  if (!source) return () => '';
  if (isObj(source) && !(source instanceof Map)) {
    const direct = source as Record<string, unknown>;
    return (code: string) => {
      const v = direct[code];
      if (typeof v === 'string') return clean(v);
      if (isObj(v)) return firstStr(v, ACCOUNT_NAME_KEYS);
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

// Accept a {id: row} map OR a row array → Map<id, row>; array rows also index
// themselves by their own .id (indexById parity with I-08).
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
  else if (input instanceof Map) for (const [k, v] of input.entries()) add(k, v);
  else if (isObj(input)) for (const [k, v] of Object.entries(input)) add(k, v);
  return byId;
}

// Customer display name — statementBatch chain (company_name → name →
// company → first+last → the row's own frozen display name).
const customerNameFromRow = (cust: unknown): string => {
  if (!isObj(cust)) return '';
  const joined = [clean(cust.contact_first_name), clean(cust.contact_last_name)]
    .filter(Boolean).join(' ');
  return firstText(cust.company_name, cust.name, cust.company, joined, cust.display_name, cust.customer_name);
};

const customerNameFor = (row: unknown, customersById: Map<string, Record<string, unknown>>): string => {
  const r = isObj(row) ? row : {};
  const frozen = firstText(r.customer_display_name, r.customer_name, r.client_name);
  if (frozen) return frozen;
  const cust = customersById.get(clean(r.customer_id));
  return cust ? customerNameFromRow(cust) : '';
};

// ---------------------------------------------------------------------------
// Split normalization + glSplits resolution (I-02 shapes restated).
// ---------------------------------------------------------------------------

interface NormSplit {
  account_code: string;
  amount_cents: number;
}

/** Normalize any accepted split spelling → {account_code, amount_cents}. */
const normalizeSplitRow = (row: unknown): NormSplit | null => {
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

/** Merge split rows by account (first-seen order); zero-net rows drop. */
const mergeSplitRows = (rows: unknown): NormSplit[] => {
  const merged = new Map<string, NormSplit>();
  const order: string[] = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    const n = normalizeSplitRow(raw);
    if (!n || n.amount_cents === 0) continue;
    const hit = merged.get(n.account_code);
    if (hit) hit.amount_cents += n.amount_cents;
    else { merged.set(n.account_code, { ...n }); order.push(n.account_code); }
  }
  return order.map((k) => merged.get(k) as NormSplit).filter((s) => s.amount_cents !== 0);
};

const invoiceSplitKeys = (inv: Record<string, unknown>): string[] =>
  [clean(inv.id), clean(inv.invoice_number), clean(inv.invoice_id)].filter(Boolean);

/**
 * Resolve the income splits for one invoice — priority:
 *   1. glSplits input (function | Map | {id:number→rows} | array of
 *      {invoice_id|id|ref, splits|rows|income_account_splits})
 *   2. invoice.income_account_splits (stored I-02 rows)
 *   3. a single income-base bucket posting to '' (resolves via role
 *      'income' → config defaultIncome; '' when nothing configured).
 */
function splitsForInvoice(invoice: unknown, glSplits: unknown): NormSplit[] {
  const inv = isObj(invoice) ? invoice : {};

  let supplied: unknown;
  if (typeof glSplits === 'function') {
    try { supplied = (glSplits as (i: unknown) => unknown)(inv); } catch { supplied = undefined; }
  } else if (glSplits instanceof Map) {
    for (const k of invoiceSplitKeys(inv)) {
      if ((glSplits as Map<unknown, unknown>).has(k)) { supplied = (glSplits as Map<unknown, unknown>).get(k); break; }
    }
  } else if (Array.isArray(glSplits)) {
    const keys = new Set(invoiceSplitKeys(inv));
    for (const entry of glSplits) {
      if (!isObj(entry)) continue;
      const eid = firstText(entry.invoice_id, entry.id, entry.ref, entry.invoice_number);
      if (eid && keys.has(eid)) {
        supplied = entry.splits ?? entry.rows ?? entry.income_account_splits;
        break;
      }
    }
  } else if (isObj(glSplits)) {
    for (const k of invoiceSplitKeys(inv)) {
      const v = (glSplits as Record<string, unknown>)[k];
      if (v !== undefined) { supplied = isObj(v) && Array.isArray(v.splits) ? v.splits : v; break; }
    }
  }
  if (supplied === undefined || supplied === null) supplied = inv.income_account_splits;

  const splits = mergeSplitRows(supplied);
  if (splits.length) return splits;
  const baseCents = incomeBaseCents(inv);
  return baseCents !== 0 ? [{ account_code: '', amount_cents: baseCents }] : [];
}

// ---------------------------------------------------------------------------
// Journal construction — accountingExportModel leg-for-leg parity.
// ---------------------------------------------------------------------------

interface JournalCtx {
  config: unknown;
  nameLookup: (code: string) => string;
}

/** Push a journal line. side 'dr'|'cr'; negative signedCents flips column. */
function pushLine(
  out: LumpSyncJournalLine[],
  ctx: JournalCtx,
  base: Omit<LumpSyncJournalLine, 'account_code' | 'debit_cents' | 'credit_cents' | 'account_name'> & { account_code?: string },
  side: 'dr' | 'cr',
  signedCents: number,
): void {
  const cents = Math.round(signedCents);
  if (cents === 0) return;
  const debit = (side === 'dr' && cents > 0) || (side === 'cr' && cents < 0);
  const account_code = clean(base.account_code) || accountCodeFor(base, ctx.config);
  const row: LumpSyncJournalLine = {
    date: base.date,
    type: base.type,
    ref: base.ref,
    account_code,
    debit_cents: debit ? Math.abs(cents) : 0,
    credit_cents: debit ? 0 : Math.abs(cents),
    memo: base.memo,
    customer: base.customer,
    entity_id: base.entity_id,
    source_entity: base.source_entity,
    ...(base.role ? { role: base.role } : {}),
  };
  const name = ctx.nameLookup(account_code);
  if (name) row.account_name = name;
  out.push(row);
}

const journalCustomerOf = (inv: unknown, pay: unknown, customersById: Map<string, Record<string, unknown>>): string => {
  const direct = firstText(
    isObj(inv) ? inv.customer_display_name : '',
    isObj(inv) ? inv.customer_name : '',
    isObj(pay) ? (pay as Record<string, unknown>).customer_name : '',
  );
  if (direct) return direct;
  for (const src of [pay, inv]) {
    const cust = isObj(src) ? customersById.get(clean((src as Record<string, unknown>).customer_id)) : undefined;
    const name = customerNameFromRow(cust);
    if (name) return name;
  }
  return firstText(
    isObj(inv) ? inv.customer_id : '',
    isObj(pay) ? (pay as Record<string, unknown>).customer_id : '',
  );
};

/**
 * invoiceJournalRows — the GL journal for one POSTED invoice.
 *   DR AR(total) · DR deposits-held(deposit_applied)
 *   CR each income split · CR tax(tax_amount)
 * Non-posted/void/non-object invoices return [] — the dump audits them
 * instead of emitting a reversal (see header DIVERGENCE note).
 */
export function invoiceJournalRows(
  invoice: unknown,
  opts: { config?: unknown; glSplits?: unknown; customersById?: unknown; accountsByCode?: unknown } = {},
): LumpSyncJournalLine[] {
  if (!isObj(invoice)) return [];
  if (!isPostedInvoice(invoice) || isVoidishInvoice(invoice)) return [];

  const o = isObj(opts) ? opts : {};
  const ctx: JournalCtx = {
    config: o.config,
    nameLookup: makeAccountNameLookup(o.accountsByCode),
  };
  const customersById = o.customersById instanceof Map
    ? o.customersById as Map<string, Record<string, unknown>>
    : indexById(o.customersById);

  const out: LumpSyncJournalLine[] = [];
  const ref = firstText(invoice.invoice_number, clean(invoice.id) ? `INV-${clean(invoice.id)}` : '', 'INVOICE');
  const billing = clean(invoice.billing_type).toLowerCase();
  const memoBase = `Invoice ${ref}${billing && billing !== 'standard' ? ` (${billing})` : ''}`;
  const base = {
    date: invoiceDateOf(invoice),
    ref,
    customer: journalCustomerOf(invoice, undefined, customersById),
    entity_id: clean(invoice.id),
    source_entity: 'Invoice' as const,
  };

  const splits = splitsForInvoice(invoice, o.glSplits);
  const totalCents = invoiceTotalCents(invoice);
  const depositCents = Math.max(0, toCents(invoice.deposit_applied));
  const taxCents = toCents(firstFinite(invoice.tax_amount, invoice.tax, invoice.tax_total));

  pushLine(out, ctx, { ...base, type: 'invoice_income', role: 'ar', memo: memoBase }, 'dr', totalCents);
  pushLine(out, ctx, { ...base, type: 'invoice_income', role: 'deposit', memo: `${memoBase} — deposit applied` }, 'dr', depositCents);
  for (const s of splits) {
    pushLine(out, ctx, {
      ...base, type: 'invoice_income', role: 'income',
      account_code: s.account_code, memo: memoBase,
    }, 'cr', s.amount_cents);
  }
  pushLine(out, ctx, { ...base, type: 'invoice_tax', role: 'tax', memo: `${memoBase} — sales tax` }, 'cr', taxCents);
  return out;
}

// --- payment journal --------------------------------------------------------

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

// Bank side: explicit deposit-account fields → undeposited for cash/check →
// config bankAccount → '' (I-08 paymentBankAccount parity).
const paymentBankAccount = (payment: Record<string, unknown>, config: unknown): string =>
  firstText(
    configCode(payment.bank_account_id),
    configCode(payment.deposit_account_id),
    configCode(payment.deposit_to_account),
    configCode(payment.bank_account),
    configCode(payment.gl_account),
    ['cash', 'check'].includes(clean(payment.method).toLowerCase()) ? configFor(config, 'undepositedAccount') : '',
    configFor(config, 'bankAccount'),
  );

const paymentRef = (payment: Record<string, unknown>, invoice: unknown): string => {
  const prefix = isCreditMemo(payment) ? 'CM' : paymentAmountCents(payment) < 0 ? 'RF' : 'PMT';
  const base = firstText(
    payment.id,
    payment.reference_number,
    payment.creation_request_key,
    `${firstText(isObj(invoice) ? invoice.invoice_number : '', payment.invoice_id, 'unlinked')}-${paymentDateOf(payment) || 'nodate'}`,
  );
  return `${prefix}-${base}`;
};

/**
 * paymentJournalRows — the GL journal for one non-void Payment row.
 *   receipt     : DR bank(gross−fee) · DR fee(fee) · CR AR(gross)
 *   refund      : DR AR(gross) · DR fee(fee) · CR bank(gross+fee)
 *   credit memo : DR AR(gross) · CR credit liability(gross)
 * void / zero / non-object → [] (the dump audits them).
 */
export function paymentJournalRows(
  payment: unknown,
  opts: { config?: unknown; invoice?: unknown; customersById?: unknown; accountsByCode?: unknown } = {},
): LumpSyncJournalLine[] {
  if (!isObj(payment)) return [];
  if (isVoidishPayment(payment)) return [];
  const amountCents = paymentAmountCents(payment);
  if (amountCents === 0) return [];

  const o = isObj(opts) ? opts : {};
  const ctx: JournalCtx = {
    config: o.config,
    nameLookup: makeAccountNameLookup(o.accountsByCode),
  };
  const customersById = o.customersById instanceof Map
    ? o.customersById as Map<string, Record<string, unknown>>
    : indexById(o.customersById);
  const invoice = isObj(o.invoice) ? o.invoice : {};

  const out: LumpSyncJournalLine[] = [];
  const invRef = firstText(invoice.invoice_number, payment.invoice_id);
  const ref = paymentRef(payment, invoice);
  const refNum = clean(payment.reference_number);
  const glMemo = clean(payment.gl_memo);
  const method = clean(payment.method).toLowerCase();
  const base = {
    date: paymentDateOf(payment),
    ref,
    customer: journalCustomerOf(invoice, payment, customersById),
    entity_id: clean(payment.id),
    source_entity: 'Payment' as const,
  };

  const fee = paymentFeeCents(payment);
  const gross = Math.abs(amountCents);

  if (amountCents > 0) {
    const bank = paymentBankAccount(payment, ctx.config);
    const memo = glMemo || `Payment${invRef ? ` on ${invRef}` : ''}${method ? ` (${method}${refNum ? ` #${refNum}` : ''})` : ''}`;
    pushLine(out, ctx, { ...base, type: 'payment_received', role: 'bank', account_code: bank, memo }, 'dr', gross - fee);
    pushLine(out, ctx, { ...base, type: 'payment_fee', role: 'fee', memo: `${memo} — processing fee` }, 'dr', fee);
    pushLine(out, ctx, { ...base, type: 'payment_received', role: 'ar', memo }, 'cr', gross);
  } else if (isCreditMemo(payment)) {
    const memo = glMemo || `Credit memo${invRef ? ` on ${invRef}` : ''}`;
    pushLine(out, ctx, { ...base, type: 'refund', role: 'ar', memo }, 'dr', gross);
    pushLine(out, ctx, { ...base, type: 'refund', role: 'credit', memo }, 'cr', gross);
  } else {
    const bank = paymentBankAccount(payment, ctx.config);
    const memo = glMemo || `Refund${invRef ? ` on ${invRef}` : ''}${method ? ` (${method}${refNum ? ` #${refNum}` : ''})` : ''}`;
    pushLine(out, ctx, { ...base, type: 'refund', role: 'ar', memo }, 'dr', gross);
    pushLine(out, ctx, { ...base, type: 'payment_fee', role: 'fee', memo: `${memo} — processing fee` }, 'dr', fee);
    pushLine(out, ctx, { ...base, type: 'refund', role: 'bank', account_code: bank, memo }, 'cr', gross + fee);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section row builders.
// ---------------------------------------------------------------------------

/** Flat invoice dump row — all money integer cents. `posted`/`open`/`in_totals` precomputed by caller. */
export function invoiceDumpRow(
  invoice: unknown,
  opts: { posted?: boolean; open?: boolean; in_totals?: boolean; customersById?: unknown } = {},
): LumpSyncInvoiceRow {
  const inv = isObj(invoice) ? invoice : {};
  const o = isObj(opts) ? opts : {};
  const customersById = o.customersById instanceof Map
    ? o.customersById as Map<string, Record<string, unknown>>
    : indexById(o.customersById);
  const splits = mergeSplitRows(inv.income_account_splits);
  return {
    id: clean(inv.id),
    ref: firstText(inv.invoice_number, clean(inv.id) ? `INV-${clean(inv.id)}` : '', 'INVOICE'),
    status: clean(inv.status).toLowerCase(),
    posted: o.posted === true,
    open: o.open === true,
    in_totals: o.in_totals === true,
    billing_type: clean(inv.billing_type).toLowerCase(),
    customer_id: clean(inv.customer_id),
    customer_name: customerNameFor(inv, customersById),
    issue_date: invoiceDateOf(inv),
    due_date: toDay(inv.due_date),
    subtotal_cents: toCents(inv.subtotal),
    discount_cents: Math.max(0, toCents(inv.discount_amount)),
    tax_cents: toCents(firstFinite(inv.tax_amount, inv.tax, inv.tax_total)),
    deposit_applied_cents: Math.max(0, toCents(inv.deposit_applied)),
    credit_applied_cents: toCents(firstFinite(inv.credit_applied, inv.store_credit_applied, inv.credit_used)),
    total_cents: invoiceTotalCents(inv),
    amount_paid_cents: invoicePaidCents(inv),
    balance_due_cents: invoiceBalanceCents(inv),
    income_splits: splits.map((s) => ({ account_code: s.account_code, amount_cents: s.amount_cents })),
    salesperson: clean(inv.salesperson),
    work_order_id: clean(inv.work_order_id),
    estimate_id: clean(inv.estimate_id),
    creation_request_key: clean(inv.creation_request_key),
  };
}

/** Flat payment dump row — signed amount_cents, resolved ref/kind/bank. */
export function paymentDumpRow(
  payment: unknown,
  opts: { invoice?: unknown; posted?: boolean; in_totals?: boolean; customersById?: unknown; config?: unknown } = {},
): LumpSyncPaymentRow {
  const p = isObj(payment) ? payment : {};
  const o = isObj(opts) ? opts : {};
  const customersById = o.customersById instanceof Map
    ? o.customersById as Map<string, Record<string, unknown>>
    : indexById(o.customersById);
  const invoice = isObj(o.invoice) ? o.invoice : undefined;
  const amountCents = paymentAmountCents(p);
  const voidish = isVoidishPayment(p);
  const kind: LumpSyncPaymentRow['kind'] =
    voidish ? 'void'
    : amountCents === 0 ? 'zero'
    : amountCents < 0 ? (isCreditMemo(p) ? 'credit_memo' : 'refund')
    : 'receipt';
  return {
    id: clean(p.id),
    ref: paymentRef(p, invoice),
    kind,
    status: clean(p.status).toLowerCase(),
    posted: o.posted === true,
    in_totals: o.in_totals === true,
    invoice_id: clean(p.invoice_id),
    invoice_ref: firstText(isObj(invoice) ? invoice.invoice_number : '', ''),
    customer_id: clean(p.customer_id) || clean(isObj(invoice) ? invoice.customer_id : ''),
    customer_name: journalCustomerOf(invoice, p, customersById),
    method: clean(p.method).toLowerCase(),
    paid_date: paymentDateOf(p),
    amount_cents: amountCents,
    fee_cents: paymentFeeCents(p),
    bank_account_code: kind === 'receipt' || kind === 'refund' ? paymentBankAccount(p, o.config) : '',
    reference_number: clean(p.reference_number),
    refund_of_payment_id: clean(p.refund_of_payment_id),
    creation_request_key: clean(p.creation_request_key),
  };
}

/** Flat credit-ledger dump row — live rows only (caller filters). */
export function creditDumpRow(
  row: unknown,
  opts: { customersById?: unknown } = {},
): LumpSyncCreditRow {
  const r = isObj(row) ? row : {};
  const o = isObj(opts) ? opts : {};
  const customersById = o.customersById instanceof Map
    ? o.customersById as Map<string, Record<string, unknown>>
    : indexById(o.customersById);
  const cust = customersById.get(clean(r.customer_id));
  return {
    id: clean(r.id),
    customer_id: clean(r.customer_id),
    customer_name: customerNameFromRow(cust),
    kind: clean(r.kind),
    amount_cents: ledgerAmountCents(r),
    occurred_at: ledgerDayOf(r),
    invoice_id: clean(r.invoice_id),
    ref: clean(r.ref),
    reversed_kind: clean(r.reversed_kind),
    reason: clean(r.reason),
    actor: clean(r.actor),
    balance_after_cents: toCents(r.balance_after),
    creation_request_key: clean(r.creation_request_key),
  };
}

// ---------------------------------------------------------------------------
// Canonical serialization + checksum (savedReportRunsModel parity copy).
// ---------------------------------------------------------------------------

// JSON.stringify semantics with sorted object keys: undefined/function/
// symbol values drop from objects, become null in arrays; non-finite
// numbers serialize null; toJSON hooks honored first.
function canon(v: unknown): string | undefined {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number') return Number.isFinite(v as number) ? JSON.stringify(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'object') {
    if (typeof (v as { toJSON?: unknown }).toJSON === 'function') {
      return canon((v as { toJSON: () => unknown }).toJSON());
    }
    if (Array.isArray(v)) return `[${v.map((x) => canon(x) ?? 'null').join(',')}]`;
    const parts: string[] = [];
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const c = canon((v as Record<string, unknown>)[k]);
      if (c !== undefined) parts.push(`${JSON.stringify(k)}:${c}`);
    }
    return `{${parts.join(',')}}`;
  }
  return undefined;
}

/** Canonical JSON string of any JSON-safe value ('{}' on junk). */
export function canonicalJson(value: unknown): string {
  return canon(value) ?? '{}';
}

// Deterministic FNV-1a (32-bit) → base36 — savedReportRunsModel.fnv1a
// parity. No crypto import: stable everywhere, sync in every target.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The dump checksum — fnv1a-base36 over the canonical serialization of the
 * sections object. Deliberately covers ROW CONTENT ONLY (generated_at,
 * totals, row_counts are derivable echoes and excluded) so re-running the
 * same entity state yields the same checksum.
 */
export function dumpChecksum(dump: unknown): string {
  const d = isObj(dump) ? dump : {};
  return fnv1a(canonicalJson({ sections: (d as Partial<LumpSyncDump>).sections }));
}

// ---------------------------------------------------------------------------
// Sorting helpers — every section has a total deterministic order.
// ---------------------------------------------------------------------------

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpNum = (a: number, b: number): number => a - b;

// ---------------------------------------------------------------------------
// buildLumpSyncDump — the all-time GL dump.
// ---------------------------------------------------------------------------

export interface LumpSyncInput {
  /** Invoice rows (any status — drafts/voids audit, posted rows journal). */
  invoices?: unknown;
  /** Payment rows (non-void nonzero rows journal; voids/zero audit). */
  payments?: unknown;
  /** Pre-computed income splits per invoice — function | Map | {id: rows} |
   *  array of {invoice_id|id|ref, splits}. Overrides stored splits. */
  glSplits?: unknown;
  /** StoreCreditLedger rows (live rows dump + total; deleted/unknown audit). */
  creditLedger?: unknown;
  /** Customer rows or {id: row} — display-name enrichment. */
  customers?: unknown;
  /** IncomeAccount/COGSAccount rows or {code: row|name} — account names. */
  glAccounts?: unknown;
  /** AccountCodeConfig (camel or snake spellings; also read at top level). */
  config?: unknown;
  /** generated_at anchor — ISO | Date | epoch ms (clock fallback). */
  now?: unknown;
  [key: string]: unknown;
}

/**
 * buildLumpSyncDump — assemble the versioned all-time GL dump envelope.
 *
 * Sections emit every source row (posted AND excluded) so the dump is a
 * complete migration artifact; journal_lines carries only live postings.
 * Totals are computed on the first pass over SOURCE rows; reconciliation
 * re-derives them on a second pass over the EMITTED section rows — both
 * passes must tie for reconciliation.ok.
 *
 * @returns LumpSyncDump — see header for the envelope contract.
 */
export function buildLumpSyncDump(input: LumpSyncInput = {}): LumpSyncDump {
  const o = isObj(input) ? input : {};
  // Config = top-level keys merged under explicit `config` (explicit wins).
  const config = { ...(o as Record<string, unknown>), ...(isObj(o.config) ? o.config : {}) };
  const nameLookupPrimary = makeAccountNameLookup(o.glAccounts);
  const nameLookupFallback = makeAccountNameLookup((config as Record<string, unknown>).accountsByCode);
  const nameLookup = (code: string): string => nameLookupPrimary(code) || nameLookupFallback(code);
  const customersById = indexById(o.customers);
  const invoiceById = indexById(o.invoices);
  const ctx: JournalCtx = { config, nameLookup };

  const invoiceList = Array.isArray(o.invoices) ? o.invoices : [];
  const paymentList = Array.isArray(o.payments) ? o.payments : [];
  const ledgerList = Array.isArray(o.creditLedger) ? o.creditLedger : [];

  const journalLines: LumpSyncJournalLine[] = [];
  const invoiceRows: LumpSyncInvoiceRow[] = [];
  const paymentRows: LumpSyncPaymentRow[] = [];
  const creditRows: LumpSyncCreditRow[] = [];
  const audit: LumpSyncAuditRow[] = [];
  // Journals keep their emit order inside a (date, ref) sort — journals[i]
  // carries a stable first-seen index as the final tiebreak.
  const journals: Array<{ date: string; ref: string; order: number; rows: LumpSyncJournalLine[] }> = [];
  let journalOrder = 0;

  // Emit-time account-name enrichment (exportBatch parity): the composed
  // glAccounts → config.accountsByCode lookup fills any name the
  // per-journal builder missed.
  const emitJournal = (rows: LumpSyncJournalLine[]): void => {
    for (const r of rows) {
      const name = nameLookup(r.account_code);
      if (name && !r.account_name) r.account_name = name;
    }
    journals.push({ date: rows[0].date, ref: rows[0].ref, order: journalOrder++, rows });
  };

  const auditRow = (a: Partial<LumpSyncAuditRow> & { entity: LumpSyncAuditRow['entity'] }): void => {
    audit.push({
      entity: a.entity,
      entity_id: clean(a.entity_id),
      ref: clean(a.ref),
      reason: clean(a.reason),
      detail: clean(a.detail),
      status: clean(a.status),
      day: clean(a.day),
      amount_cents: Math.round(num(a.amount_cents, 0)),
      voided_date: clean(a.voided_date),
      void_reason: clean(a.void_reason),
    });
  };

  // --- totals accumulators (first pass — source rows) ----------------------
  let invoicedCents = 0;
  let taxCollectedCents = 0;
  let collectedCents = 0;
  let paymentsReceivedCents = 0;
  let refundsCents = 0;
  let creditMemosCents = 0;
  let arBalanceCents = 0;
  let openInvoiceCount = 0;
  let creditOutstandingCents = 0;
  let creditIssuedCents = 0;
  let creditAppliedCents = 0;
  let creditExpiredCents = 0;
  let creditVoidedCents = 0;
  const byAccountCents: Record<string, number> = {};

  // --- invoices --------------------------------------------------------------
  let invoicesPosted = 0;
  for (const raw of invoiceList) {
    const inv = isObj(raw) ? raw : null;
    if (!inv) {
      auditRow({ entity: 'invoice', entity_id: '', ref: '(no ref)', reason: 'malformed_row', detail: 'non-object invoice row' });
      continue;
    }
    const ref = firstText(inv.invoice_number, inv.id, '(no ref)');
    const status = clean(inv.status).toLowerCase();
    const voidish = isVoidishInvoice(inv);
    const posted = !voidish && isPostedInvoice(inv);
    const open = !voidish && !isDraftInvoice(inv) && invoiceBalanceCents(inv) > 0;

    if (voidish) {
      auditRow({
        entity: 'invoice', entity_id: clean(inv.id), ref,
        reason: status === 'void' || VOIDISH_STATUSES.has(status) ? 'void' : 'void_flagged',
        detail: clean(inv.void_reason) || 'void/voided invoice excluded from totals and journals',
        status, day: invoiceDateOf(inv), amount_cents: invoiceTotalCents(inv),
        voided_date: toDay(inv.voided_date), void_reason: clean(inv.void_reason),
      });
    } else if (status === 'draft') {
      auditRow({ entity: 'invoice', entity_id: clean(inv.id), ref, reason: 'draft', detail: 'draft invoice — never billed', status, day: invoiceDateOf(inv), amount_cents: invoiceTotalCents(inv) });
    } else if (!posted) {
      auditRow({ entity: 'invoice', entity_id: clean(inv.id), ref, reason: 'unposted_status', detail: `status '${status || '(blank)'}' is not a posted status`, status, day: invoiceDateOf(inv), amount_cents: invoiceTotalCents(inv) });
    }

    let didJournal = false;
    if (posted) {
      const rows = invoiceJournalRows(inv, {
        config, glSplits: o.glSplits, customersById, accountsByCode: o.glAccounts,
      });
      if (!rows.length) {
        auditRow({ entity: 'invoice', entity_id: clean(inv.id), ref, reason: 'empty_journal', detail: 'posted invoice produced no journal lines', status, day: invoiceDateOf(inv), amount_cents: invoiceTotalCents(inv) });
      } else {
        didJournal = true;
        invoicesPosted += 1;
        emitJournal(rows);
        invoicedCents += invoiceTotalCents(inv);
        taxCollectedCents += toCents(firstFinite(inv.tax_amount, inv.tax, inv.tax_total));
        for (const s of splitsForInvoice(inv, o.glSplits)) {
          byAccountCents[s.account_code] = (byAccountCents[s.account_code] || 0) + s.amount_cents;
        }
      }
    }
    if (open) {
      arBalanceCents += invoiceBalanceCents(inv);
      openInvoiceCount += 1;
    }
    invoiceRows.push(invoiceDumpRow(inv, {
      posted: didJournal,
      open,
      in_totals: posted,
      customersById,
    }));
  }

  // --- payments ---------------------------------------------------------------
  let paymentsPosted = 0;
  for (const raw of paymentList) {
    const p = isObj(raw) ? raw : null;
    if (!p) {
      auditRow({ entity: 'payment', entity_id: '', ref: '(no ref)', reason: 'malformed_row', detail: 'non-object payment row' });
      continue;
    }
    const ref = firstText(p.reference_number, p.id, p.invoice_id, '(no ref)');
    const status = clean(p.status).toLowerCase();
    const voidish = isVoidishPayment(p);
    const amountCents = paymentAmountCents(p);
    const invoice = invoiceById.get(clean(p.invoice_id));

    if (voidish) {
      auditRow({
        entity: 'payment', entity_id: clean(p.id), ref, reason: 'void',
        detail: clean(p.void_reason) || 'void payment excluded from totals and journals',
        status, day: paymentDateOf(p), amount_cents: amountCents,
        voided_date: toDay(p.voided_date), void_reason: clean(p.void_reason),
      });
    } else if (amountCents === 0) {
      auditRow({ entity: 'payment', entity_id: clean(p.id), ref, reason: 'zero_amount', detail: 'zero-amount payment — nothing posts', status, day: paymentDateOf(p), amount_cents: 0 });
    }

    if (voidish) {
      paymentRows.push(paymentDumpRow(p, { invoice, posted: false, in_totals: false, customersById, config }));
      continue;
    }
    // Non-void: counts toward collected (signed net) even when it posts no journal.
    collectedCents += amountCents;
    if (amountCents > 0) paymentsReceivedCents += amountCents;
    else if (amountCents < 0) {
      if (isCreditMemo(p)) creditMemosCents += Math.abs(amountCents);
      else refundsCents += Math.abs(amountCents);
    }
    if (amountCents !== 0) {
      const rows = paymentJournalRows(p, { config, invoice, customersById, accountsByCode: o.glAccounts });
      if (!rows.length) {
        auditRow({ entity: 'payment', entity_id: clean(p.id), ref, reason: 'empty_journal', detail: 'payment produced no journal lines', status, day: paymentDateOf(p), amount_cents: amountCents });
      } else {
        paymentsPosted += 1;
        emitJournal(rows);
      }
    }
    paymentRows.push(paymentDumpRow(p, { invoice, posted: amountCents !== 0, in_totals: true, customersById, config }));
  }

  // --- credit ledger -------------------------------------------------------------
  for (const raw of ledgerList) {
    const r = isObj(raw) ? raw : null;
    if (!r) {
      auditRow({ entity: 'credit_ledger', entity_id: '', ref: '(no ref)', reason: 'malformed_row', detail: 'non-object ledger row' });
      continue;
    }
    const ref = firstText(r.id, r.creation_request_key, '(no ref)');
    if (r.deleted === true) {
      auditRow({ entity: 'credit_ledger', entity_id: clean(r.id), ref, reason: 'deleted_row', detail: 'deleted ledger row excluded from totals', status: clean(r.kind), day: ledgerDayOf(r), amount_cents: ledgerAmountCents(r) });
      continue;
    }
    if (!LEDGER_KINDS.has(clean(r.kind))) {
      auditRow({ entity: 'credit_ledger', entity_id: clean(r.id), ref, reason: 'unknown_kind', detail: `kind '${clean(r.kind) || '(blank)'}' is not a credit-ledger kind`, status: clean(r.kind), day: ledgerDayOf(r), amount_cents: ledgerAmountCents(r) });
      continue;
    }
    const amt = ledgerAmountCents(r);
    creditOutstandingCents += amt;
    const kind = clean(r.kind);
    if (kind === 'credit_issued') creditIssuedCents += amt;
    else if (kind === 'credit_applied') creditAppliedCents += amt;
    else if (kind === 'credit_expired') creditExpiredCents += amt;
    else creditVoidedCents += amt;
    creditRows.push(creditDumpRow(r, { customersById }));
  }

  // --- deterministic ordering ------------------------------------------------------
  // Journals: (date, ref, first-seen) — I-08 exportBatch ordering parity.
  journals.sort((a, b) => cmpStr(a.date, b.date) || cmpStr(a.ref, b.ref) || cmpNum(a.order, b.order));
  journalLines.push(...journals.flatMap((j) => j.rows));

  invoiceRows.sort((a, b) => cmpStr(a.issue_date, b.issue_date) || cmpStr(a.ref, b.ref) || cmpStr(a.id, b.id));
  paymentRows.sort((a, b) => cmpStr(a.paid_date, b.paid_date) || cmpStr(a.ref, b.ref) || cmpStr(a.id, b.id));
  creditRows.sort((a, b) => cmpStr(a.occurred_at, b.occurred_at) || cmpStr(a.id, b.id) || cmpStr(a.kind, b.kind));
  audit.sort((a, b) => cmpStr(a.entity, b.entity) || cmpStr(a.entity_id, b.entity_id) || cmpStr(a.ref, b.ref) || cmpStr(a.reason, b.reason));

  // --- journal totals + balance check -------------------------------------------------
  let journalDebitCents = 0;
  let journalCreditCents = 0;
  const unbalancedRefs: string[] = [];
  const unmappedRefs: string[] = [];
  for (const j of journals) {
    let dr = 0;
    let cr = 0;
    let hasUnmapped = false;
    for (const r of j.rows) {
      dr += r.debit_cents;
      cr += r.credit_cents;
      if (!r.account_code) hasUnmapped = true;
    }
    journalDebitCents += dr;
    journalCreditCents += cr;
    if (dr !== cr && !unbalancedRefs.includes(j.ref)) unbalancedRefs.push(j.ref);
    if (hasUnmapped && !unmappedRefs.includes(j.ref)) unmappedRefs.push(j.ref);
  }
  unbalancedRefs.sort();
  unmappedRefs.sort();
  const journalBalanced = unbalancedRefs.length === 0 && journalDebitCents === journalCreditCents;

  const totals: LumpSyncTotals = {
    invoiced_cents: invoicedCents,
    tax_collected_cents: taxCollectedCents,
    collected_cents: collectedCents,
    payments_received_cents: paymentsReceivedCents,
    refunds_cents: refundsCents,
    credit_memos_cents: creditMemosCents,
    ar_balance_cents: arBalanceCents,
    open_invoice_count: openInvoiceCount,
    credit_outstanding_cents: creditOutstandingCents,
    credit_issued_cents: creditIssuedCents,
    credit_applied_cents: creditAppliedCents,
    credit_expired_cents: creditExpiredCents,
    credit_voided_cents: creditVoidedCents,
    journal_debit_cents: journalDebitCents,
    journal_credit_cents: journalCreditCents,
    by_account_cents: byAccountCents,
    invoiced: fromCents(invoicedCents),
    collected: fromCents(collectedCents),
    ar_balance: fromCents(arBalanceCents),
    credit_outstanding: fromCents(creditOutstandingCents),
  };

  // --- reconciliation: re-derive every total FROM THE EMITTED SECTIONS ----------
  const check = (name: string, expected: number, actual: number): LumpSyncCheck => ({
    name, expected_cents: expected, actual_cents: actual,
    delta_cents: actual - expected, ok: actual === expected,
  });
  const secInvoiced = invoiceRows.filter((r) => r.in_totals).reduce((s, r) => s + r.total_cents, 0);
  const secCollected = paymentRows.filter((r) => r.in_totals).reduce((s, r) => s + r.amount_cents, 0);
  const secAr = invoiceRows.filter((r) => r.open).reduce((s, r) => s + r.balance_due_cents, 0);
  const secCredit = creditRows.reduce((s, r) => s + r.amount_cents, 0);
  const secDr = journalLines.reduce((s, r) => s + r.debit_cents, 0);
  const secCr = journalLines.reduce((s, r) => s + r.credit_cents, 0);
  const checks: LumpSyncCheck[] = [
    check('invoiced', invoicedCents, secInvoiced),
    check('collected', collectedCents, secCollected),
    check('ar_balance', arBalanceCents, secAr),
    check('credit_outstanding', creditOutstandingCents, secCredit),
    check('journal_debits', journalDebitCents, secDr),
    check('journal_credits', journalCreditCents, secCr),
  ];
  const checksOk = checks.every((c) => c.ok);

  const row_counts: LumpSyncDump['row_counts'] = {
    journal_lines: journalLines.length,
    invoice_rows: invoiceRows.length,
    payment_rows: paymentRows.length,
    credit_rows: creditRows.length,
    audit_rows: audit.length,
    journals: journals.length,
    invoices_posted: invoicesPosted,
    invoices_open: openInvoiceCount,
    payments_posted: paymentsPosted,
    gl_accounts: Array.isArray(o.glAccounts)
      ? o.glAccounts.filter(isObj).length
      : o.glAccounts instanceof Map
        ? o.glAccounts.size
        : isObj(o.glAccounts) ? Object.keys(o.glAccounts).length : 0,
  };

  const dump: LumpSyncDump = {
    format: LUMP_SYNC_FORMAT,
    generated_at: toIso(o.now),
    sections: {
      journal_lines: journalLines,
      invoice_rows: invoiceRows,
      payment_rows: paymentRows,
      credit_rows: creditRows,
      audit,
    },
    totals,
    row_counts,
    reconciliation: {
      checks,
      journal_balanced: journalBalanced,
      unbalanced_refs: unbalancedRefs,
      unmapped_refs: unmappedRefs,
      ok: checksOk && journalBalanced && unbalancedRefs.length === 0,
    },
    checksum: '',
  };
  dump.checksum = dumpChecksum(dump);
  return dump;
}

/**
 * verifyDump — recompute the checksum and re-derive totals/row_counts from
 * the emitted sections (the importer's integrity check). Returns
 * {ok, checksum_ok, checks, expected_checksum, actual_checksum}.
 * checksum_ok = stored checksum equals a fresh computation over sections.
 */
export function verifyDump(dump: unknown): {
  ok: boolean;
  checksum_ok: boolean;
  expected_checksum: string;
  actual_checksum: string;
  checks: LumpSyncCheck[];
  journal_balanced: boolean;
} {
  const d = isObj(dump) ? (dump as unknown as LumpSyncDump) : ({} as LumpSyncDump);
  const sec = isObj(d.sections) ? d.sections : ({} as LumpSyncDump['sections']);
  const invoiceRows = Array.isArray(sec.invoice_rows) ? sec.invoice_rows : [];
  const paymentRows = Array.isArray(sec.payment_rows) ? sec.payment_rows : [];
  const creditRows = Array.isArray(sec.credit_rows) ? sec.credit_rows : [];
  const journalLines = Array.isArray(sec.journal_lines) ? sec.journal_lines : [];
  const t = isObj(d.totals) ? d.totals : ({} as LumpSyncTotals);

  const check = (name: string, expected: number, actual: number): LumpSyncCheck => ({
    name, expected_cents: expected, actual_cents: actual,
    delta_cents: actual - expected, ok: actual === expected,
  });
  const checks: LumpSyncCheck[] = [
    check('invoiced', Math.round(num(t.invoiced_cents, 0)),
      invoiceRows.filter((r) => isObj(r) && r.in_totals === true).reduce((s, r) => s + Math.round(num(r.total_cents, 0)), 0)),
    check('collected', Math.round(num(t.collected_cents, 0)),
      paymentRows.filter((r) => isObj(r) && r.in_totals === true).reduce((s, r) => s + Math.round(num(r.amount_cents, 0)), 0)),
    check('ar_balance', Math.round(num(t.ar_balance_cents, 0)),
      invoiceRows.filter((r) => isObj(r) && r.open === true).reduce((s, r) => s + Math.round(num(r.balance_due_cents, 0)), 0)),
    check('credit_outstanding', Math.round(num(t.credit_outstanding_cents, 0)),
      creditRows.reduce((s, r) => s + Math.round(num(isObj(r) ? r.amount_cents : 0, 0)), 0)),
    check('journal_debits', Math.round(num(t.journal_debit_cents, 0)),
      journalLines.reduce((s, r) => s + Math.round(num(isObj(r) ? r.debit_cents : 0, 0)), 0)),
    check('journal_credits', Math.round(num(t.journal_credit_cents, 0)),
      journalLines.reduce((s, r) => s + Math.round(num(isObj(r) ? r.credit_cents : 0, 0)), 0)),
  ];
  const secDr = journalLines.reduce((s, r) => s + Math.round(num(isObj(r) ? r.debit_cents : 0, 0)), 0);
  const secCr = journalLines.reduce((s, r) => s + Math.round(num(isObj(r) ? r.credit_cents : 0, 0)), 0);
  const journalBalanced = secDr === secCr;
  const expected = clean(d.checksum);
  const actual = dumpChecksum(d);
  const checksumOk = expected !== '' && expected === actual;
  return {
    ok: checksumOk && checks.every((c) => c.ok) && journalBalanced,
    checksum_ok: checksumOk,
    expected_checksum: expected,
    actual_checksum: actual,
    checks,
    journal_balanced: journalBalanced,
  };
}
