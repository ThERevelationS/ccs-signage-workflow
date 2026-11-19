import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (rel, out) => {
  buildSync({
    entryPoints: [resolve(here, rel)],
    bundle: true, format: 'esm', outfile: resolve(here, out), logLevel: 'silent',
  });
  return resolve(here, out);
};
const outs = [
  bundle('../base44/shared/lumpSyncModel.ts', '.tmp-lump-sync.mjs'),
  bundle('../base44/shared/accountingExportModel.ts', '.tmp-lump-sync-ae.mjs'),
  bundle('../base44/shared/financialReports.ts', '.tmp-lump-sync-fr.mjs'),
  bundle('../base44/shared/customerReports.ts', '.tmp-lump-sync-cr.mjs'),
];
const M = await import(pathToFileURL(outs[0]).href);
const AE = await import(pathToFileURL(outs[1]).href);
const FR = await import(pathToFileURL(outs[2]).href);
const CR = await import(pathToFileURL(outs[3]).href);

const {
  LUMP_SYNC_FORMAT, LUMP_SYNC_SECTIONS, POSTED_INVOICE_STATUSES,
  CREDIT_LEDGER_KINDS, AUDIT_REASONS,
  toCents, fromCents, invoiceDateOf, paymentDateOf, ledgerDayOf,
  isVoidishInvoice, isPostedInvoice, invoiceTotalCents, invoicePaidCents,
  invoiceBalanceCents, incomeBaseCents, isVoidishPayment, paymentAmountCents,
  ledgerAmountCents, isLiveLedgerRow, accountCodeFor,
  invoiceJournalRows, paymentJournalRows, invoiceDumpRow, paymentDumpRow,
  creditDumpRow, buildLumpSyncDump, dumpChecksum, verifyDump, canonicalJson,
} = M;

// ---------------------------------------------------------------------------
// Config + fixture — a canonical small-shop all-time dataset.
// ---------------------------------------------------------------------------
const CFG = {
  defaultIncome: '4000', taxAccount: '2100', arAccount: '1100',
  bankAccount: '1000', undepositedAccount: '1200', feeAccount: '6100',
  depositAccount: '2200', creditAccount: '2300',
};
const NOW = '2026-11-15T12:00:00.000Z';

const customers = [
  { id: 'c1', company_name: 'Acme Signs' },
  { id: 'c2', company_name: 'Beta Co' },
];
const glAccounts = [
  { code: '1000', name: 'Operating Checking' },
  { code: '1100', name: 'Accounts Receivable' },
  { code: '1200', name: 'Undeposited Funds' },
  { code: '2100', name: 'Sales Tax Payable' },
  { code: '2200', name: 'Customer Deposits' },
  { code: '2300', name: 'Store Credit Liability' },
  { code: '4000', name: 'Sales Income' },
  { code: '4100', name: 'Sign Income' },
  { code: '4200', name: 'Service Income' },
  { code: '6100', name: 'Merchant Fees' },
];

const invoices = [
  { id: 'i1', invoice_number: 'INV-001', status: 'sent', issue_date: '2026-10-05',
    customer_id: 'c1', customer_display_name: 'Acme Signs',
    subtotal: 100, tax_rate: 0.078, tax_amount: 7.8, total: 107.8,
    amount_paid: 50, balance_due: 57.8,
    income_account_splits: [{ income_account_code: '4100', amount: 60 }, { income_account_code: '4200', amount: 40 }] },
  { id: 'i2', invoice_number: 'INV-002', status: 'partially_paid', issue_date: '2026-10-07',
    customer_id: 'c1', customer_display_name: 'Acme Signs', billing_type: 'progress',
    subtotal: 200, discount_amount: 10, tax_amount: 15.2, deposit_applied: 25, total: 180.2,
    amount_paid: 50, balance_due: 130.2,
    income_account_splits: [{ income_account_code: '4000', amount: 190 }] },
  { id: 'i3', invoice_number: 'INV-003', status: 'paid', issue_date: '2026-10-09',
    customer_id: 'c2', customer_display_name: 'Beta Co',
    subtotal: 50, tax_amount: 0, total: 50, amount_paid: 50, balance_due: 0 },
  { id: 'i4', invoice_number: 'INV-004', status: 'draft', issue_date: '2026-10-10',
    customer_id: 'c1', customer_display_name: 'Acme Signs', subtotal: 30, total: 30 },
  { id: 'i5', invoice_number: 'INV-005', status: 'void', issue_date: '2026-10-12',
    customer_id: 'c2', customer_display_name: 'Beta Co', subtotal: 75, total: 75,
    voided_date: '2026-10-13', void_reason: 'duplicate entry' },
  { id: 'i6', invoice_number: 'INV-006', status: 'mystery', issue_date: '2026-10-14',
    customer_id: 'c1', customer_display_name: 'Acme Signs', subtotal: 10, total: 10, balance_due: 10 },
  { id: 'i7', invoice_number: 'INV-007', status: 'sent', issue_date: '2026-10-15',
    customer_id: 'c1', customer_display_name: 'Acme Signs', subtotal: 0, tax_amount: 0, total: 0, balance_due: 0 },
  { id: 'i8', invoice_number: 'INV-008', status: 'sent', issue_date: '2026-10-16',
    customer_id: 'c1', customer_display_name: 'Acme Signs', subtotal: 40, total: 40,
    voided_date: '2026-10-20', void_reason: 'cancelled after send' },
  { id: 'i9', invoice_number: 'INV-009', status: 'sent', created_date: '2026-10-18T09:00:00Z',
    customer_id: 'c2', customer_display_name: 'Beta Co', subtotal: 20, tax_amount: 0, total: 20, balance_due: 20 },
  { id: 'i10', invoice_number: 'INV-010', status: 'sent', issue_date: '2026-10-19',
    customer_id: 'c1', customer_display_name: 'Acme Signs',
    subtotal: 0.1, tax_amount: 0.01, total: 0.11, balance_due: 0.11,
    income_account_splits: [{ income_account_code: '4000', amount: 0.1 }] },
  'garbage-row',
];

const payments = [
  { id: 'p1', invoice_id: 'i1', customer_id: 'c1', amount: 50, method: 'card', status: 'recorded',
    paid_date: '2026-10-12', reference_number: 'AUTH-9' },
  { id: 'p2', invoice_id: 'i2', customer_id: 'c1', amount: 50, method: 'cash', status: 'recorded',
    paid_date: '2026-10-16' },
  { id: 'p3', invoice_id: 'i2', customer_id: 'c1', amount: 100, method: 'card', status: 'recorded',
    paid_date: '2026-10-17', reference_number: 'AUTH-42', fee_amount: 3 },
  { id: 'p4', invoice_id: 'i1', customer_id: 'c1', amount: -25, method: 'card', status: 'refunded',
    refund_of_payment_id: 'p1', paid_date: '2026-10-19' },
  { id: 'p5', invoice_id: 'i1', customer_id: 'c1', amount: -10, method: 'credit_memo', status: 'recorded',
    paid_date: '2026-10-20' },
  { id: 'p6', invoice_id: 'i1', customer_id: 'c1', amount: 5, method: 'cash', status: 'void',
    paid_date: '2026-10-21', voided_date: '2026-10-21', void_reason: 'entered twice' },
  { id: 'p7', invoice_id: 'i1', customer_id: 'c1', amount: 0, method: 'other', status: 'recorded',
    paid_date: '2026-10-21' },
  { id: 'p8', invoice_id: 'ghost-inv', customer_id: 'ghost-cust', amount: 15, method: 'cash', status: 'recorded',
    paid_date: '2026-10-22' },
  { id: 'p9', invoice_id: 'i3', customer_id: 'c2', amount: 40, method: 'check', status: 'recorded',
    paid_date: '2026-10-23', bank_account_id: '1010' },
  { id: 'p10', invoice_id: 'i10', customer_id: 'c1', amount: 0.07, method: 'card', status: 'recorded',
    paid_date: '2026-10-24' },
  'bad',
];

const creditLedger = [
  { id: 'L1', customer_id: 'c1', kind: 'credit_issued', amount: 50, amount_cents: 5000,
    occurred_at: '2026-10-01T10:00:00Z', reason: 'goodwill', actor: 'brett@shop', balance_after: 50 },
  { id: 'L2', customer_id: 'c1', kind: 'credit_applied', amount: -20, amount_cents: -2000,
    occurred_at: '2026-10-10', invoice_id: 'i1', balance_after: 30 },
  { id: 'L3', customer_id: 'c2', kind: 'credit_issued', amount: 15,
    occurred_at: '2026-10-11', balance_after: 15 },
  { id: 'L4', customer_id: 'c1', kind: 'credit_voided', amount: -5, amount_cents: -500,
    occurred_at: '2026-10-15', ref: 'L2', reversed_kind: 'credit_applied', reason: 'misapplied', balance_after: 25 },
  { id: 'L5', customer_id: 'c2', kind: 'credit_expired', amount: -2, amount_cents: -200,
    occurred_at: '2026-10-16', balance_after: 13 },
  { id: 'L6', customer_id: 'c1', kind: 'credit_issued', amount: 999, amount_cents: 99900,
    occurred_at: '2026-10-17', deleted: true },
  { id: 'L7', customer_id: 'c1', kind: 'weird', amount: 7, amount_cents: 700, occurred_at: '2026-10-18' },
  null,
];

const dump = buildLumpSyncDump({ invoices, payments, creditLedger, customers, glAccounts, config: CFG, now: NOW });
const S = dump.sections;

// === A. Envelope shape =======================================================
assert.equal(dump.format, 'lump-sync/v1', 'format marker');
assert.equal(dump.format, LUMP_SYNC_FORMAT);
assert.equal(dump.generated_at, NOW, 'generated_at honors injected now');
assert.deepEqual(Object.keys(S).sort(), [...LUMP_SYNC_SECTIONS].sort(), 'exactly the five sections');
assert.ok(Array.isArray(S.journal_lines) && Array.isArray(S.invoice_rows) && Array.isArray(S.payment_rows) && Array.isArray(S.credit_rows) && Array.isArray(S.audit));
assert.equal(typeof dump.checksum, 'string');
assert.match(dump.checksum, /^[0-9a-z]+$/, 'base36 checksum');
assert.equal(dump.checksum, dumpChecksum(dump), 'stored checksum equals fresh computation');
assert.ok(Number.isInteger(dump.totals.invoiced_cents));
assert.ok(Number.isInteger(dump.totals.collected_cents));
assert.ok(Number.isInteger(dump.totals.ar_balance_cents));
assert.ok(Number.isInteger(dump.totals.credit_outstanding_cents));
assert.deepEqual([...POSTED_INVOICE_STATUSES], ['sent', 'partially_paid', 'paid']);
assert.deepEqual([...CREDIT_LEDGER_KINDS], ['credit_issued', 'credit_applied', 'credit_expired', 'credit_voided']);
assert.ok(AUDIT_REASONS.includes('void_flagged') && AUDIT_REASONS.includes('empty_journal'));

// === B. Section contents =====================================================
assert.equal(S.invoice_rows.length, 10, 'invoice_rows: 10 real invoices (malformed audited, no row)');
assert.equal(S.payment_rows.length, 10, 'payment_rows: all 10 payments');
assert.equal(S.credit_rows.length, 5, 'credit_rows: live ledger rows only');
assert.equal(S.journal_lines.length, 32, 'journal lines: i1×4 i2×4 i3×2 i9×2 i10×3 + p1×2 p2×2 p3×3 p4×2 p5×2 p8×2 p9×2 p10×2');
assert.equal(S.audit.length, 12, 'audit: i4 i5 i6 i7 i8 + malformed + p6 p7 + L6 L7 + malformed ledger');

const auditKey = (e, id) => S.audit.find((a) => a.entity === e && a.entity_id === id);
assert.equal(auditKey('invoice', 'i4').reason, 'draft');
assert.equal(auditKey('invoice', 'i5').reason, 'void');
assert.equal(auditKey('invoice', 'i5').voided_date, '2026-10-13');
assert.equal(auditKey('invoice', 'i5').void_reason, 'duplicate entry');
assert.equal(auditKey('invoice', 'i6').reason, 'unposted_status');
assert.equal(auditKey('invoice', 'i7').reason, 'empty_journal', 'all-zero posted invoice audits empty journal');
assert.equal(auditKey('invoice', 'i8').reason, 'void_flagged', 'sent + voided_date → void_flagged (flag evidence wins over posted status)');
assert.equal(auditKey('payment', 'p6').reason, 'void');
assert.equal(auditKey('payment', 'p6').void_reason, 'entered twice');
assert.equal(auditKey('payment', 'p7').reason, 'zero_amount');
assert.equal(auditKey('credit_ledger', 'L6').reason, 'deleted_row');
assert.equal(auditKey('credit_ledger', 'L7').reason, 'unknown_kind');
assert.equal(S.audit.filter((a) => a.reason === 'malformed_row').length, 3, 'invoice + payment + ledger malformed rows audited');
assert.ok(!S.journal_lines.some((r) => r.entity_id === 'i5' || r.entity_id === 'i8' || r.entity_id === 'i4' || r.entity_id === 'p6'), 'void/draft rows emit no journal lines');

const invRow = (id) => S.invoice_rows.find((r) => r.id === id);
assert.equal(invRow('i1').posted, true);
assert.equal(invRow('i1').in_totals, true);
assert.equal(invRow('i1').open, true);
assert.equal(invRow('i1').total_cents, 10780);
assert.equal(invRow('i1').balance_due_cents, 5780);
assert.equal(invRow('i1').amount_paid_cents, 5000);
assert.deepEqual(invRow('i1').income_splits, [{ account_code: '4100', amount_cents: 6000 }, { account_code: '4200', amount_cents: 4000 }], 'stored splits normalized to cents');
assert.equal(invRow('i2').deposit_applied_cents, 2500);
assert.equal(invRow('i2').billing_type, 'progress');
assert.equal(invRow('i3').open, false, 'paid invoice balance 0 → not open');
assert.equal(invRow('i4').posted, false);
assert.equal(invRow('i4').in_totals, false);
assert.equal(invRow('i4').open, false, 'draft never counts in AR');
assert.equal(invRow('i6').open, true, 'unknown-status invoice with balance IS open AR (arAging parity)');
assert.equal(invRow('i6').in_totals, false, '…but never counts as invoiced');
assert.equal(invRow('i7').posted, false);
assert.equal(invRow('i7').in_totals, true, 'posted-status zero invoice still counts (adds 0)');
assert.equal(invRow('i8').in_totals, false, 'void-flagged sent invoice excluded from totals');
assert.equal(invRow('i9').issue_date, '2026-10-18', 'created_date date chain → day');
assert.equal(invRow('i1').customer_name, 'Acme Signs');
assert.ok(Number.isInteger(invRow('i10').total_cents) && invRow('i10').total_cents === 11, '0.11 → 11 integer cents');

const payRow = (id) => S.payment_rows.find((r) => r.id === id);
assert.equal(payRow('p1').kind, 'receipt');
assert.equal(payRow('p1').ref, 'PMT-p1');
assert.equal(payRow('p1').amount_cents, 5000);
assert.equal(payRow('p1').posted, true);
assert.equal(payRow('p4').kind, 'refund');
assert.equal(payRow('p4').ref, 'RF-p4');
assert.equal(payRow('p4').amount_cents, -2500, 'refund keeps signed cents');
assert.equal(payRow('p5').kind, 'credit_memo');
assert.equal(payRow('p5').ref, 'CM-p5');
assert.equal(payRow('p6').kind, 'void');
assert.equal(payRow('p6').in_totals, false);
assert.equal(payRow('p7').kind, 'zero');
assert.equal(payRow('p7').in_totals, true, 'zero payment still in collected set (adds 0)');
assert.equal(payRow('p7').posted, false);
assert.equal(payRow('p9').bank_account_code, '1010', 'explicit bank_account_id wins over undeposited');
assert.equal(payRow('p2').bank_account_code, '1200', 'cash → undeposited funds');
assert.equal(payRow('p8').invoice_ref, '', 'ghost invoice → empty invoice_ref');
assert.equal(payRow('p8').customer_name, 'ghost-cust', 'unresolvable customer falls back to id');

const credRow = (id) => S.credit_rows.find((r) => r.id === id);
assert.equal(credRow('L1').amount_cents, 5000, 'amount_cents canonical wins');
assert.equal(credRow('L3').amount_cents, 1500, 'bare amount read as dollars → cents');
assert.equal(credRow('L4').ref, 'L2');
assert.equal(credRow('L4').reversed_kind, 'credit_applied');
assert.equal(credRow('L2').invoice_id, 'i1');
assert.equal(credRow('L1').balance_after_cents, 5000, 'balance_after dollars → cents');
assert.equal(credRow('L1').customer_name, 'Acme Signs');
assert.equal(credRow('L3').customer_name, 'Beta Co');
assert.equal(credRow('L1').occurred_at, '2026-10-01');

// === C. Journal leg contents (I-08 parity) ===================================
const lines = (entityId) => S.journal_lines.filter((r) => r.entity_id === entityId);
const sumDr = (rows) => rows.reduce((s, r) => s + r.debit_cents, 0);
const sumCr = (rows) => rows.reduce((s, r) => s + r.credit_cents, 0);

const i1j = lines('i1');
assert.equal(i1j.length, 4);
assert.equal(i1j.find((r) => r.role === 'ar').account_code, '1100');
assert.equal(i1j.find((r) => r.role === 'ar').debit_cents, 10780);
assert.deepEqual(i1j.filter((r) => r.role === 'income').map((r) => [r.account_code, r.credit_cents]), [['4100', 6000], ['4200', 4000]]);
assert.equal(i1j.find((r) => r.role === 'tax').credit_cents, 780);
assert.equal(i1j.find((r) => r.role === 'tax').account_code, '2100');
assert.equal(i1j[0].ref, 'INV-001');
assert.equal(i1j[0].source_entity, 'Invoice');
assert.equal(i1j[0].customer, 'Acme Signs');
assert.equal(i1j.find((r) => r.account_code === '4100').account_name, 'Sign Income', 'glAccounts name enrichment');

const i2j = lines('i2');
assert.equal(i2j.length, 4);
assert.equal(i2j.find((r) => r.role === 'deposit').debit_cents, 2500, 'deposit slice debits deposits-held');
assert.equal(i2j.find((r) => r.role === 'deposit').account_code, '2200');
assert.equal(i2j.find((r) => r.role === 'ar').debit_cents, 18020);
assert.equal(sumDr(i2j), sumCr(i2j), 'deposit journal balances');
assert.match(i2j[0].memo, /\(progress\)/, 'billing_type in memo');

const i3j = lines('i3');
assert.equal(i3j.find((r) => r.role === 'income').account_code, '4000', 'no splits → income base → defaultIncome');
assert.equal(i3j.find((r) => r.role === 'income').credit_cents, 5000);

const i10j = lines('i10');
assert.equal(sumDr(i10j), sumCr(i10j), 'penny invoice journal balances');
assert.equal(i10j.find((r) => r.role === 'ar').debit_cents, 11);
assert.ok(i10j.every((r) => Number.isInteger(r.debit_cents) && Number.isInteger(r.credit_cents)));

const p3j = lines('p3');
assert.equal(p3j.length, 3);
assert.equal(p3j.find((r) => r.role === 'bank').debit_cents, 9700, 'bank nets the fee');
assert.equal(p3j.find((r) => r.type === 'payment_fee').debit_cents, 300);
assert.equal(p3j.find((r) => r.type === 'payment_fee').account_code, '6100');
assert.equal(p3j.find((r) => r.role === 'ar').credit_cents, 10000);

const p4j = lines('p4');
assert.equal(p4j.find((r) => r.role === 'ar').debit_cents, 2500);
assert.equal(p4j.find((r) => r.role === 'bank').credit_cents, 2500);
assert.equal(p4j[0].ref, 'RF-p4');
assert.equal(p4j[0].type, 'refund');

const p5j = lines('p5');
assert.equal(p5j.length, 2);
assert.equal(p5j.find((r) => r.role === 'credit').account_code, '2300', 'credit memo posts to credit liability, never bank');
assert.equal(p5j.find((r) => r.role === 'credit').credit_cents, 1000);

const p8j = lines('p8');
assert.equal(p8j.length, 2, 'ghost-invoice payment still posts');
assert.match(p8j[0].memo, /ghost-inv|Payment/, 'memo degrades gracefully');

for (const j of S.journal_lines) {
  assert.ok(j.debit_cents >= 0 && j.credit_cents >= 0, `non-negative legs ${j.ref}`);
  assert.ok(j.debit_cents === 0 || j.credit_cents === 0, `one-sided leg ${j.ref}`);
  assert.ok(Number.isInteger(j.debit_cents) && Number.isInteger(j.credit_cents), `integer cents ${j.ref}`);
}

// === D. Reconciliation identities (the I-10 verify) ===========================
const T = dump.totals;
assert.equal(T.invoiced_cents, 35811, 'Σ posted totals: 107.80+180.20+50+20+0+0.11');
assert.equal(T.tax_collected_cents, 2301, 'Σ posted tax 780+1520+0+0+0+1');
assert.equal(T.collected_cents, 22007, 'net non-void: 50+50+100−25−10+0+15+40+0.07');
assert.equal(T.payments_received_cents, 25507, 'positive receipts only');
assert.equal(T.refunds_cents, 2500);
assert.equal(T.credit_memos_cents, 1000);
assert.equal(T.ar_balance_cents, 21811, 'open: i1 5780 + i2 13020 + i6 1000 + i9 2000 + i10 11');
assert.equal(T.open_invoice_count, 5);
assert.equal(T.credit_outstanding_cents, 3800, '5000−2000+1500−500−200');
assert.equal(T.credit_issued_cents, 6500);
assert.equal(T.credit_applied_cents, -2000);
assert.equal(T.credit_expired_cents, -200);
assert.equal(T.credit_voided_cents, -500);
assert.equal(T.journal_debit_cents, T.journal_credit_cents, 'dump journal foots');
assert.equal(T.journal_debit_cents, 67318);
assert.equal(T.invoiced, 358.11, 'dollar mirror');
assert.equal(T.collected, 220.07);
assert.equal(T.ar_balance, 218.11);
assert.equal(T.credit_outstanding, 38);
assert.equal(T.by_account_cents['4000'], 19010, 'i2 19000 + i10 10 (split codes verbatim)');
assert.equal(T.by_account_cents['4100'], 6000);
assert.equal(T.by_account_cents['4200'], 4000);
assert.equal(T.by_account_cents[''], 7000, 'i3 5000 + i9 2000 no-split → unmapped bucket (business_summary parity)');
assert.equal(dump.reconciliation.ok, true, 'all section-derived checks tie');
assert.equal(dump.reconciliation.journal_balanced, true);
assert.deepEqual(dump.reconciliation.unbalanced_refs, []);
assert.equal(dump.reconciliation.checks.length, 6);
assert.ok(dump.reconciliation.checks.every((c) => c.ok && c.delta_cents === 0));
assert.deepEqual(dump.reconciliation.checks.map((c) => c.name),
  ['invoiced', 'collected', 'ar_balance', 'credit_outstanding', 'journal_debits', 'journal_credits']);
assert.equal(dump.row_counts.journal_lines, 32);
assert.equal(dump.row_counts.invoice_rows, 10);
assert.equal(dump.row_counts.payment_rows, 10);
assert.equal(dump.row_counts.credit_rows, 5);
assert.equal(dump.row_counts.audit_rows, 12);
assert.equal(dump.row_counts.journals, 13);
assert.equal(dump.row_counts.invoices_posted, 5);
assert.equal(dump.row_counts.invoices_open, 5);
assert.equal(dump.row_counts.payments_posted, 8);
assert.equal(dump.row_counts.gl_accounts, 10);

// — Cross-verify vs Financials models (the actual verify criterion) —
const summary = FR.invoiceSummaryRows(invoices, { voidPolicy: 'exclude' });
const postedBuckets = summary.filter((g) => POSTED_INVOICE_STATUSES.includes(g.status));
const finInvoiced = postedBuckets.reduce((s, g) => s + g.total_cents, 0);
assert.equal(finInvoiced, T.invoiced_cents, 'financialReports.invoice_summary posted total == dump invoiced');
const finOpen = summary
  .filter((g) => !['draft', 'void'].includes(g.status))
  .reduce((s, g) => s + g.balance_cents, 0);
assert.equal(finOpen, T.ar_balance_cents, 'financialReports open balance == dump ar_balance');
assert.equal(CR.ledgerSumCents(creditLedger), T.credit_outstanding_cents, 'customerReports.ledgerSumCents == dump credit_outstanding');

// — Journal parity vs accountingExportModel.exportBatch (unbounded) —
const aeBatch = AE.exportBatch(invoices, payments, { ...CFG, accountsByCode: glAccounts });
// I-08 posts a reversal for status-'void' i5 and a live journal for i8
// (status-only void test); the dump audits both. Strip exportBatch rows for
// those entity ids, strip dump-only source_entity, then the engines agree.
const aeRows = aeBatch.rows
  .filter((r) => r.entity_id !== 'i5' && r.entity_id !== 'i8')
  .map((r) => ({ ...r }));
const myRows = S.journal_lines.map((r) => {
  const { source_entity, ...rest } = r;
  return rest;
});
assert.equal(aeRows.length, myRows.length, 'journal line count parity vs exportBatch');
assert.equal(canonicalJson(aeRows), canonicalJson(myRows), 'journal rows identical to I-08 export engine');
assert.ok(aeBatch.rows.some((r) => r.entity_id === 'i5'), 'sanity: exportBatch did emit the void reversal we intentionally omit');

// === E. Determinism: ordering + checksum =====================================
const reversed = buildLumpSyncDump({
  invoices: [...invoices].reverse(), payments: [...payments].reverse(),
  creditLedger: [...creditLedger].reverse(), customers: [...customers].reverse(),
  glAccounts: [...glAccounts].reverse(), config: CFG, now: '2030-01-01T00:00:00Z',
});
assert.equal(reversed.checksum, dump.checksum, 'input order + generated_at do not perturb the checksum');
assert.equal(canonicalJson(reversed.sections), canonicalJson(S), 'input order does not perturb sections');

// Field-wise non-decreasing checks (same comparators the model documents —
// avoids separator-char pitfalls of joined key strings).
const nonDecreasing = (rows, keys) => rows.every((r, i) => {
  if (i === 0) return true;
  const prev = rows[i - 1];
  for (const k of keys) {
    const a = prev[k], b = r[k];
    if (a < b) return true;
    if (a > b) return false;
  }
  return true;
});
assert.ok(nonDecreasing(S.journal_lines, ['date', 'ref']), 'journal_lines sorted (date, ref)');
assert.ok(nonDecreasing(S.invoice_rows, ['issue_date', 'ref', 'id']), 'invoice_rows sorted (issue, ref, id)');
assert.ok(nonDecreasing(S.payment_rows, ['paid_date', 'ref', 'id']), 'payment_rows sorted (paid, ref, id)');
assert.ok(nonDecreasing(S.credit_rows, ['occurred_at', 'id']), 'credit_rows sorted (occurred, id)');
assert.ok(nonDecreasing(S.audit, ['entity', 'entity_id', 'ref', 'reason']), 'audit sorted (entity, id, ref, reason)');

// checksum changes on ANY row mutation
const bump = (arr, idx, field, delta) => arr.map((r, i) => i === idx ? { ...r, [field]: r[field] + delta } : r);
const dMut = buildLumpSyncDump({ invoices: bump(invoices.filter((x) => typeof x === 'object'), 0, 'total', 1), payments, creditLedger, customers, glAccounts, config: CFG, now: NOW });
assert.notEqual(dMut.checksum, dump.checksum, 'invoice total mutation → new checksum');
const dMut2 = buildLumpSyncDump({ invoices, payments: bump(payments, 0, 'amount', 0.01), creditLedger, customers, glAccounts, config: CFG, now: NOW });
assert.notEqual(dMut2.checksum, dump.checksum, 'payment amount mutation → new checksum');
const dMut3 = buildLumpSyncDump({ invoices, payments, creditLedger: creditLedger.filter((r) => r && r.id !== 'L1'), customers, glAccounts, config: CFG, now: NOW });
assert.notEqual(dMut3.checksum, dump.checksum, 'dropped ledger row → new checksum');
const dMut4 = buildLumpSyncDump({ invoices, payments, creditLedger, customers: [{ id: 'c1', company_name: 'ACME renamed' }, customers[1]], glAccounts, config: CFG, now: NOW });
assert.notEqual(dMut4.checksum, dump.checksum, 'customer name mutation → new checksum (names ride the rows)');
const dMut5 = buildLumpSyncDump({ invoices, payments, creditLedger, customers, glAccounts, config: { ...CFG, arAccount: '1199' }, now: NOW });
assert.notEqual(dMut5.checksum, dump.checksum, 'account remapping → new checksum (resolved codes ride the rows)');
assert.equal(verifyDump(dMut5).checksum_ok, true, 'mutated dump self-verifies (its own checksum recomputes)');

// === F. glSplits input forms ==================================================
const dumpMap = buildLumpSyncDump({ invoices, payments, creditLedger, customers, glAccounts, config: CFG, now: NOW, glSplits: { i3: [{ income_account_code: '4500', amount: 50 }] } });
const i3jMap = dumpMap.sections.journal_lines.filter((r) => r.entity_id === 'i3');
assert.equal(i3jMap.find((r) => r.role === 'income').account_code, '4500', 'glSplits map overrides stored splits');
assert.equal(dumpMap.totals.by_account_cents['4500'], 5000);
assert.equal(dumpMap.totals.by_account_cents['4000'], 19010, '4000 loses the overridden i3 base');
assert.notEqual(dumpMap.checksum, dump.checksum);
const dumpArr = buildLumpSyncDump({ invoices, payments, creditLedger, customers, glAccounts, config: CFG, now: NOW, glSplits: [{ invoice_id: 'i3', splits: [{ income_account_code: '4500', amount: 50 }] }] });
assert.equal(dumpArr.sections.journal_lines.find((r) => r.entity_id === 'i3' && r.role === 'income').account_code, '4500', 'glSplits array form resolves by invoice_id');
const dumpFn = buildLumpSyncDump({ invoices, payments, creditLedger, customers, glAccounts, config: CFG, now: NOW, glSplits: (inv) => inv.id === 'i3' ? [{ account_id: '4600', amount_cents: 5000 }] : undefined });
assert.equal(dumpFn.sections.journal_lines.find((r) => r.entity_id === 'i3' && r.role === 'income').account_code, '4600', 'glSplits function form; rich {account_id,amount_cents} rows accepted');

// === G. verifyDump ============================================================
const v = verifyDump(dump);
assert.equal(v.ok, true);
assert.equal(v.checksum_ok, true);
assert.equal(v.journal_balanced, true);
assert.equal(v.actual_checksum, dump.checksum);
const tampered = JSON.parse(JSON.stringify(dump));
tampered.sections.invoice_rows[0].total_cents += 1;
const vT = verifyDump(tampered);
assert.equal(vT.checksum_ok, false, 'row tamper → checksum mismatch');
assert.equal(vT.ok, false);
const tamperedTotals = JSON.parse(JSON.stringify(dump));
tamperedTotals.totals.invoiced_cents += 1;
const vTT = verifyDump(tamperedTotals);
assert.equal(vTT.checks.find((c) => c.name === 'invoiced').ok, false, 'totals tamper → check fails even with checksum intact');
const tamperedJournal = JSON.parse(JSON.stringify(dump));
tamperedJournal.sections.journal_lines[0].debit_cents += 5;
const vTJ = verifyDump(tamperedJournal);
assert.equal(vTJ.journal_balanced, false, 'leg tamper → journal unbalanced');
assert.equal(verifyDump(null).ok, false, 'junk input fails closed');
assert.equal(verifyDump({ checksum: '' }).checksum_ok, false, 'missing checksum fails');

// === H. Edge cases + unit surface =============================================
const empty = buildLumpSyncDump({ now: NOW });
assert.equal(empty.sections.journal_lines.length, 0);
assert.equal(empty.sections.invoice_rows.length, 0);
assert.equal(empty.totals.invoiced_cents, 0);
assert.equal(empty.reconciliation.ok, true, 'empty dump reconciles trivially');
assert.equal(typeof empty.checksum, 'string');
assert.equal(verifyDump(empty).ok, true);

assert.equal(toCents('1,234.56'), 123456);
assert.equal(toCents('$5.00'), 500);
assert.equal(toCents('INV-001'), 0);
assert.equal(fromCents(12345), 123.45);
assert.equal(invoiceDateOf({ issue_date: '2026-10-05', created_date: '2026-10-01T09:00:00Z' }), '2026-10-05');
assert.equal(paymentDateOf({ paid_date: '2026-10-12' }), '2026-10-12');
assert.equal(ledgerDayOf({ occurred_at: '2026-10-01T10:00:00Z' }), '2026-10-01');
assert.equal(isVoidishInvoice({ status: 'sent', voided_date: '2026-10-20' }), true);
assert.equal(isVoidishInvoice({ status: 'sent' }), false);
assert.equal(isPostedInvoice({ status: 'partially_paid' }), true);
assert.equal(isPostedInvoice({ status: 'partial' }), true, 'import alias');
assert.equal(isVoidishPayment({ status: 'refunded' }), false, 'refunded is LIVE for payments');
assert.equal(isVoidishPayment({ status: 'void' }), true);
assert.equal(isVoidishPayment({ deleted: true }), true);
assert.equal(paymentAmountCents({ amount: -25 }), -2500);
assert.equal(ledgerAmountCents({ amount_cents: -500, amount: 999 }), -500, 'amount_cents wins');
assert.equal(ledgerAmountCents({ amount: 15 }), 1500);
assert.equal(isLiveLedgerRow({ kind: 'credit_issued' }), true);
assert.equal(isLiveLedgerRow({ kind: 'credit_issued', deleted: true }), false);
assert.equal(isLiveLedgerRow({ kind: 'weird' }), false);
assert.equal(invoiceTotalCents({ subtotal: 10, discount_amount: 2, tax_amount: 1 }), 900, 'computed fallback');
assert.equal(invoiceBalanceCents({ total: 100, amount_paid: 30 }), 7000, 'total − paid fallback');
assert.equal(invoicePaidCents({ payments: [{ amount: 40, status: 'recorded' }, { amount: 5, status: 'void' }] }), 4000, 'embedded payments skip voids');
assert.equal(incomeBaseCents({ subtotal: 100, discount_amount: 10, fee_lines: [{ kind: 'discount', amount: 5 }, { kind: 'shipping', amount: 8 }] }), 9300, '100−10−5+8');
assert.equal(accountCodeFor({ role: 'ar' }, CFG), '1100');
assert.equal(accountCodeFor({ role: 'income' }, CFG), '4000');
assert.equal(accountCodeFor({}, { defaultAccount: '9999' }), '9999');
assert.equal(accountCodeFor({}, {}), '');

// unbalanced journal surfaces instead of failing closed (I-08 parity)
const unbal = buildLumpSyncDump({
  invoices: [{ id: 'u1', invoice_number: 'INV-U', status: 'sent', issue_date: '2026-10-05',
    subtotal: 10, tax_amount: 1, total: 11, income_account_splits: [{ income_account_code: '4000', amount: 8 }] }],
  config: CFG, now: NOW,
});
assert.deepEqual(unbal.reconciliation.unbalanced_refs, ['INV-U'], 'non-footing splits → unbalanced_refs');
assert.equal(unbal.reconciliation.journal_balanced, false);
assert.equal(unbal.reconciliation.ok, false, 'reconciliation flags the imbalance');
assert.equal(unbal.totals.journal_debit_cents - unbal.totals.journal_credit_cents, 200, 'delta = splits miss by $2');

// unmapped accounts surface
const unmapped = buildLumpSyncDump({ invoices: [invoices[0]], config: { arAccount: '1100' }, now: NOW });
assert.ok(unmapped.reconciliation.unmapped_refs.includes('INV-001'), 'missing tax/income config → unmapped_refs');
assert.equal(unmapped.sections.journal_lines.find((r) => r.role === 'tax').account_code, '');

// canonicalJson + dumpChecksum units
assert.equal(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] }), '{"a":[2,{"c":3,"d":4}],"b":1}', 'deep-sorted canonical json');
assert.equal(dumpChecksum({ sections: dump.sections }), dump.checksum);

// standalone builders
const jr = invoiceJournalRows(invoices[0], { config: CFG, accountsByCode: glAccounts });
assert.equal(jr.length, 4, 'standalone invoiceJournalRows');
assert.equal(jr[0].source_entity, 'Invoice');
const pr = paymentJournalRows(payments[0], { config: CFG, invoice: invoices[0] });
assert.equal(pr.length, 2, 'standalone paymentJournalRows');
assert.equal(pr[0].source_entity, 'Payment');
assert.equal(invoiceJournalRows({ ...invoices[0], status: 'void' }, { config: CFG }).length, 0, 'void invoice → no journal');
assert.equal(invoiceJournalRows({ ...invoices[0], voided_date: '2026-10-20' }, { config: CFG }).length, 0, 'void-flagged sent invoice → no journal');
assert.equal(paymentJournalRows({ ...payments[0], status: 'void' }, { config: CFG }).length, 0);
assert.equal(paymentJournalRows({ ...payments[0], amount: 0 }, { config: CFG }).length, 0);
const dr = invoiceDumpRow(invoices[0], { posted: true, open: true, in_totals: true });
assert.equal(dr.id, 'i1');
assert.equal(dr.tax_cents, 780);
const pr2 = paymentDumpRow(payments[3], { invoice: invoices[0], config: CFG });
assert.equal(pr2.kind, 'refund');
const cr2 = creditDumpRow(creditLedger[1], { customersById: customers });
assert.equal(cr2.amount_cents, -2000);
assert.equal(cr2.customer_name, 'Acme Signs');

rmSync(outs[0], { force: true });
rmSync(outs[1], { force: true });
rmSync(outs[2], { force: true });
rmSync(outs[3], { force: true });
console.log('PASS lump-sync');
