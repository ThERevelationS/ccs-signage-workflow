// Accounting verification SUITE — masterplan item N-05 (worker w-131,
// redispatch of w-128). ONE suite that esbuild-bundles the accounting-side
// models and asserts unit semantics + cross-model reconciliation:
//
//   base44/shared/glSplitModel.ts            (I-02 GL income splits)
//   base44/shared/accountingExportModel.ts   (I-08 export engine)
//   base44/shared/statementBatchModel.ts     (H-08 monthly statement batch)
//   base44/shared/paymentRegisterModel.ts    (I-05 payments register)
//   base44/shared/accountingAlertsModel.ts   (I-07 variance/unbatched/unmapped)
//   src/components/customer360/storeCreditModel.js (G-09 credit ledger model)
//   src/components/invoicing/refundMath.js   (ledger truth: net collected)
//   base44/shared/customerAnalyticsModel.ts  (ledger-amount reader contract)
// + entity schemas parsed for shape validation:
//   base44/entities/{StoreCreditLedger,ReconciliationBatch,Invoice,Payment}.jsonc
//
// Assert themes: cent-safe split allocation + largest-remainder, journal
// balance per ref + batch footing, period/skip semantics, CSV/IIF shape +
// escaping, statement roll-forward + aging + dedupe keys, credit-ledger
// apply/deplete ordering + over-application guard + audit trail + entity
// persistence contract, register reconcile + void exclusion, batch variance
// vs sum-of-rows, idempotency-key determinism.
//
// KNOWN DEFECT markers assert OBSERVED (defective) values so a future fix
// flips the assertion and flags the record:
//   N-05.1 — statementBatchModel partial-refund reopen is dropped: the
//            negative 'refunded' reversal row is VOIDISH → net-0, so
//            closing_balance/line_items/candidates never see the reopened AR
//            (invoice truth via refundMath/COUNTED_STATUSES does reopen).
//   N-05.2 — glSplitModel.toCents(1.005) → 100 not 101: Math.round(v*100)
//            hits the IEEE754 half-cent round-down vs the documented
//            round-half-away contract.
//
// Run: node scripts/test-accounting-suite.mjs  →  prints "PASS accounting-suite"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// ── assertion counter (the suite prints its count like the sibling suites) ──
let ASSERTS = 0;
const A = new Proxy(assert, {
  get: (t, k) => {
    const v = t[k];
    if (typeof v !== 'function') return v;
    return (...args) => { ASSERTS++; return v(...args); };
  },
});

// ── per-model bundles (export names collide across models — isolate each) ──
const bundleAt = (rel, tag) => {
  const out = resolve(here, `.tmp-acct-suite-${tag}.mjs`);
  buildSync({ entryPoints: [resolve(root, rel)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return out;
};
const TMP = [
  bundleAt('base44/shared/glSplitModel.ts', 'gl'),
  bundleAt('base44/shared/accountingExportModel.ts', 'exp'),
  bundleAt('base44/shared/statementBatchModel.ts', 'stmt'),
  bundleAt('base44/shared/paymentRegisterModel.ts', 'reg'),
  bundleAt('base44/shared/accountingAlertsModel.ts', 'al'),
  bundleAt('src/components/customer360/storeCreditModel.js', 'cr'),
  bundleAt('src/components/invoicing/refundMath.js', 'rm'),
  bundleAt('base44/shared/customerAnalyticsModel.ts', 'an'),
];
const gl = await import(pathToFileURL(TMP[0]).href);
const exp = await import(pathToFileURL(TMP[1]).href);
const stmt = await import(pathToFileURL(TMP[2]).href);
const reg = await import(pathToFileURL(TMP[3]).href);
const al = await import(pathToFileURL(TMP[4]).href);
const cr = await import(pathToFileURL(TMP[5]).href);
const rm = await import(pathToFileURL(TMP[6]).href);
const an = await import(pathToFileURL(TMP[7]).href);

const jsonc = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const SCL = jsonc('base44/entities/StoreCreditLedger.jsonc');
const RCB = jsonc('base44/entities/ReconciliationBatch.jsonc');
const INV_SCHEMA = jsonc('base44/entities/Invoice.jsonc');
const PAY_SCHEMA = jsonc('base44/entities/Payment.jsonc');

const NOW = '2026-11-02T12:00:00.000Z';
const PERIOD = { period_start: '2026-10-01', period_end: '2026-10-31', label: 'October 2026' };
const sumCents = (rows) => rows.reduce((s, r) => s + r.amount_cents, 0);
const sumDr = (rows) => rows.reduce((s, r) => s + r.debit_cents, 0);
const sumCr = (rows) => rows.reduce((s, r) => s + r.credit_cents, 0);

// ===========================================================================
// FIXTURE — one coherent shop period (October 2026). Every cross-model
// reconciliation below anchors on this same data.
// ===========================================================================
const CFG = {
  defaultIncome: '4000', taxAccount: '2100', arAccount: '1100',
  bankAccount: '1000', undepositedAccount: '1200', feeAccount: '6100',
  depositAccount: '2200', creditAccount: '2300',
};
const ACCOUNT_NAMES = {
  '1100': 'Accounts Receivable', '4000': 'Income — General',
  '4100': 'Sign Sales', '4200': 'Print Income', '2100': 'Sales Tax Payable',
  '1000': 'Operating Checking', '1200': 'Undeposited Funds',
  '6100': 'Merchant Fees', '2200': 'Customer Deposits', '2300': 'Customer Credits',
};

const CUSTOMERS = [
  { id: 'c1', company_name: 'Acme Sign Co', billing_email: 'ap@acme.test' },
  { id: 'c2', company_name: 'Beta Works', email: 'pay@beta.test' },
  { id: 'c3', company_name: 'NoEmail LLC' },                        // missing billing email
  { id: 'c4', company_name: 'Zero Bal Inc', billing_email: 'z@zero.test' },
  { id: 'c5', company_name: 'CreditCo', billing_email: 'cm@credit.test' },
  { /* no id — unkeyable, candidates skip */ company_name: 'Ghost' },
];

// i1's splits come from the GL model (line parts) — the same chain
// invoicingAction runs at create time.
const PARTS = { 'PT-SIGN': { part_key: 'PT-SIGN', income_account_code: '4100' } };
const I1 = {
  id: 'i1', invoice_number: 'INV-001', status: 'sent', customer_id: 'c1',
  customer_display_name: 'Acme Sign Co',
  issue_date: '2026-10-05', due_date: '2026-11-15',
  subtotal: 100, discount_amount: 0, tax_amount: 7.8, total: 107.8,
  balance_due: 47.8, amount_paid: 60,
  line_items: [
    { description: 'Channel letters', line_total: 60, part_key: 'PT-SIGN' },
    { description: 'Vinyl print', line_total: 40, income_account_code: '4200' },
  ],
};
I1.income_account_splits = gl.splitsToStorage(
  gl.computeInvoiceSplits(I1, { partsByKey: PARTS, default_income_account_id: '4000' }),
);

const INVOICES = [
  I1,
  { id: 'i2', invoice_number: 'INV-002', status: 'sent', customer_id: 'c1', issue_date: '2026-09-20', due_date: '2026-09-30', subtotal: 200, total: 200 },       // pre-period carryover
  { id: 'i3', invoice_number: 'INV-003', status: 'sent', customer_id: 'c1', issue_date: '2026-10-12', due_date: '2026-10-20', subtotal: 50, total: 50 },
  { id: 'i4', invoice_number: 'INV-004', status: 'void', customer_id: 'c1', issue_date: '2026-10-15', subtotal: 80, total: 80 },
  { id: 'i5', invoice_number: 'INV-005', status: 'draft', customer_id: 'c1', issue_date: '2026-10-20', subtotal: 999, total: 999 },
  { id: 'i6', invoice_number: 'INV-006', status: 'sent', customer_id: 'c2', issue_date: '2026-10-08', due_date: '2026-10-15', subtotal: 300, total: 300, income_account_splits: [{ income_account_code: '4100', amount: 300 }] },
  { id: 'i7', invoice_number: 'INV-007', status: 'sent', customer_id: 'c4', issue_date: '2026-10-10', subtotal: 60, total: 60 },
  { id: 'i8', invoice_number: 'INV-008', status: 'sent', customer_id: 'c5', issue_date: '2026-10-01', subtotal: 100, total: 100 },
  { id: 'i9', invoice_number: 'INV-009', status: 'sent', customer_id: 'c3', issue_date: '2026-10-09', due_date: '2026-10-01', subtotal: 75, total: 75 },
  { id: 'i10', invoice_number: 'INV-010', status: 'paid', customer_id: 'c1', issue_date: '2026-10-30', due_date: '2026-11-01', subtotal: 20, total: 20 },
  { id: 'i11', invoice_number: 'INV-011', status: 'sent', customer_id: 'c1', subtotal: 12, total: 12 },                                          // undated
];

const PAYMENTS = [
  { id: 'pA', invoice_id: 'i2', customer_id: 'c1', amount: 150, method: 'check', status: 'recorded', paid_date: '2026-09-25', reference_number: 'CK-9001' },
  { id: 'pB', invoice_id: 'i1', customer_id: 'c1', amount: 60, method: 'check', status: 'recorded', paid_date: '2026-10-10', reference_number: 'CK-4471', reconciliation_batch_id: 'B1' },
  { id: 'pC', invoice_id: 'i10', customer_id: 'c1', amount: 20, method: 'cash', status: 'recorded', paid_date: '2026-10-30' },
  { id: 'pV', invoice_id: '', customer_id: 'c1', amount: 999, method: 'other', status: 'void', paid_date: '2026-10-11' },
  { id: 'pU', invoice_id: '', customer_id: 'c1', amount: 40, method: 'card', status: 'recorded', paid_date: '2026-10-25' },            // unapplied credit
  { id: 'pB2', invoice_id: 'i6', customer_id: 'c2', amount: 300, method: 'card', status: 'recorded', paid_date: '2026-10-09', reconciliation_batch_id: 'B1', processing_fee: 2.5 },
  { id: 'pR2', invoice_id: 'i6', customer_id: 'c2', amount: -30, method: 'card', status: 'refunded', refund_of_payment_id: 'pB2', paid_date: '2026-10-20', reconciliation_batch_id: 'B1', card_fee: 1 },
  { id: 'pC4', invoice_id: 'i7', customer_id: 'c4', amount: 60, method: 'cash', status: 'recorded', paid_date: '2026-10-12' },
  { id: 'pC5', invoice_id: 'i8', customer_id: 'c5', amount: 130, method: 'ach', status: 'recorded', paid_date: '2026-10-15' },
  { id: 'pCM', invoice_id: 'i8', customer_id: 'c5', amount: -25, method: 'credit_memo', status: 'recorded', paid_date: '2026-10-22', notes: 'Credit memo: goodwill' },
  { id: 'pOld', invoice_id: '', customer_id: 'c6', amount: 15, method: 'check', status: 'recorded', paid_date: '2026-10-28' },         // stale unbatched
  { id: 'pZ', invoice_id: '', customer_id: 'c6', amount: 0, method: 'other', status: 'recorded', paid_date: '2026-10-15' },            // zero row
  { id: 'pPend', invoice_id: '', customer_id: 'c6', amount: 5, method: 'ach', status: 'queued' },                                     // unknown status → pending; undated
  { id: 'pNoDate', invoice_id: '', customer_id: 'c6', amount: 7, method: 'other', status: 'recorded', created_date: '2026-10-14T09:00:00Z' },
];

// ===========================================================================
// SECTION 1 — glSplitModel: cent-safe allocation
// ===========================================================================
// 1a. toCents/fromCents conversions.
A.equal(gl.toCents(10.005), 1001, 'toCents half-up at the penny (10.005)');
// FIXED DEFECT N-05.2: 'round-half-away at the penny' is the documented
// contract — 1.005 stored as 100.4999… used to Math.round DOWN to 100.
// The epsilon+sign-normalized fix lands 101 (and -1.005 → -101).
A.equal(gl.toCents(1.005), 101, 'N-05.2 fixed: toCents(1.005) rounds half-away to 101');
A.equal(gl.toCents('2.5'), 250, 'toCents coerces strings');
A.equal(gl.toCents('junk'), 0, 'toCents non-finite → 0');
A.equal(gl.toCents(-2.5), -250, 'toCents signed');
A.equal(gl.toCents(-1.005), -101, 'N-05.2 fixed: negative half rounds away from zero');
A.equal(gl.fromCents(12345), 123.45, 'fromCents dollars');

// 1b. Account resolution chain line → part → category → invoice default.
A.equal(gl.resolveLineAccount({ income_account_code: '4050' }, { part: { income_account_code: '4100' }, invoiceDefault: '4999' }), '4050', 'line account wins');
A.equal(gl.resolveLineAccount({ description: 'x' }, { part: { income_account_code: '4100' }, invoiceDefault: '4999' }), '4100', 'part tier');
A.equal(gl.resolveLineAccount({}, { part: {}, categoryDefault: { default_income_account_id: '4350' }, invoiceDefault: '4999' }), '4350', 'category default tier');
A.equal(gl.resolveLineAccount({}, { invoiceDefault: '4999' }), '4999', 'invoice default last');
A.equal(gl.resolveLineAccount({}, {}), '', 'fully unresolved → unmapped bucket (never dropped)');

// 1c. Multi-line grouping + provenance + percent + footing.
{
  const splits = gl.computeInvoiceSplits(I1, { partsByKey: PARTS, default_income_account_id: '4000', accountsByKey: ACCOUNT_NAMES });
  A.equal(splits.length, 2, 'two distinct accounts');
  A.deepEqual(splits.map((s) => s.account_id), ['4100', '4200'], 'first-seen order');
  A.equal(splits[0].amount_cents, 6000);
  A.equal(splits[1].amount_cents, 4000);
  A.equal(splits[0].percent, 60, 'percent vs income base');
  A.equal(splits[1].percent, 40);
  A.equal(splits[0].account_name, 'Sign Sales', 'name enrichment via accountsByKey');
  A.equal(splits[0].source, 'auto', 'computed splits are always auto');
  A.equal(splits[0].line_refs[0].kind, 'line', 'line provenance');
  A.equal(sumCents(splits), gl.incomeBaseCents(I1), 'splits foot to income base');
  A.equal(gl.incomeBaseCents(I1), 10000, 'base = subtotal − discount + fees (pre-tax)');
}

// 1d. Largest-remainder discount apportionment across accounts.
{
  const inv = {
    subtotal: 3, discount_amount: 1,
    line_items: [
      { line_total: 1, income_account_code: '4100' },
      { line_total: 1, income_account_code: '4200' },
      { line_total: 1, income_account_code: '4300' },
    ],
  };
  const splits = gl.computeInvoiceSplits(inv, {});
  A.deepEqual(splits.map((s) => [s.account_id, s.amount_cents]), [['4100', 66], ['4200', 67], ['4300', 67]],
    'discount $1 across 3 equal accounts → 34/33/33 → splits 66/67/67');
  A.equal(sumCents(splits), 200, 'still foots to base (300 − 100)');

  // 1-cent discount: ties on remainder → earliest-seen takes the penny.
  const tiny = gl.computeInvoiceSplits({ ...inv, discount_amount: 0.01 }, {});
  A.deepEqual(tiny.map((s) => s.amount_cents), [99, 100, 100], 'single penny → largest remainder, tie → earliest');
  A.equal(sumCents(tiny), 299);

  // Uneven weights with nonzero remainders: 200/100/100 + $2 discount.
  const uneven = gl.computeInvoiceSplits({
    subtotal: 4, discount_amount: 2,
    line_items: [
      { line_total: 2, income_account_code: '4100' },
      { line_total: 1, income_account_code: '4200' },
      { line_total: 1, income_account_code: '4300' },
    ],
  }, {});
  A.deepEqual(uneven.map((s) => s.amount_cents), [100, 50, 50], 'weighted pro-rata exacts 100/50/50');
  A.equal(sumCents(uneven), 200);

  // Dedicated discount account bypasses apportionment entirely.
  const dedicated = gl.computeInvoiceSplits(inv, { discount_account_id: '4900' });
  const byAcct = Object.fromEntries(dedicated.map((s) => [s.account_id, s.amount_cents]));
  A.equal(byAcct['4900'], -100, 'dedicated contra account carries the discount');
  A.equal(byAcct['4100'], 100, 'line buckets untouched when dedicated account set');
  A.equal(sumCents(dedicated), 200, 'dedicated path still foots');
}

// 1e. Fee lines + sign parity (discount kind posts negative even when stored positive).
{
  const inv = {
    subtotal: 100,
    line_items: [{ line_total: 100, income_account_code: '4100' }],
    fee_lines: [
      { label: 'Rush', kind: 'fee', amount: 5, income_account_code: '4500' },
      { label: 'Promo', kind: 'discount', amount: 10 },                  // stored positive → −10
    ],
  };
  const splits = gl.computeInvoiceSplits(inv, { default_income_account_id: '4000' });
  const byAcct = Object.fromEntries(splits.map((s) => [s.account_id, s.amount_cents]));
  A.equal(byAcct['4500'], 500, 'fee accrues to its own account');
  A.equal(byAcct['4000'], -1000, 'discount-kind fee coerced negative, lands on default');
  A.equal(sumCents(splits), 9500, 'base = subtotal + signed fees (10000 + 500 − 1000)');
  A.equal(gl.incomeBaseCents(inv), 9500);
}

// 1f. Edge cases: zero, single cent, negative, drift repair.
{
  A.equal(gl.incomeBaseCents({}), 0, 'empty invoice → 0 base');
  A.deepEqual(gl.computeInvoiceSplits({}), [], 'empty invoice → no splits');
  A.deepEqual(gl.computeInvoiceSplits({ line_items: [] }), [], 'no lines → no splits');

  const penny = gl.computeInvoiceSplits({ subtotal: 0.01, line_items: [{ line_total: 0.01, income_account_code: '4100' }] });
  A.equal(penny.length, 1, 'single cent produces a row');
  A.equal(penny[0].amount_cents, 1, 'single cent preserved');
  A.equal(penny[0].percent, 100);

  const neg = gl.computeInvoiceSplits({ subtotal: -50, line_items: [{ line_total: -50, income_account_code: '4100' }] });
  A.equal(neg.length, 1, 'negative line survives');
  A.equal(neg[0].amount_cents, -5000, 'negative cents signed through');
  A.equal(neg[0].percent, 100, 'percent = share of negative base');

  // Zero-amount lines are dropped; a nonzero base with no contributor posts
  // the whole residual to the default bucket (never lost).
  const fallback = gl.computeInvoiceSplits(
    { subtotal: 50, line_items: [{ line_total: 0, income_account_code: '4100' }] },
    { default_income_account_id: '4000' });
  A.deepEqual(fallback.map((s) => [s.account_id, s.amount_cents]), [['4000', 5000]], 'orphan base → default bucket');

  // Drift repair: stored line_total (90) disagrees with subtotal (100) →
  // residual pushed onto the largest split so Σ ≡ base.
  const drift = gl.computeInvoiceSplits({ subtotal: 100, line_items: [{ line_total: 90, income_account_code: '4100' }] });
  A.equal(drift[0].amount_cents, 10000, 'residual pushed onto largest (only) split');

  const driftTie = gl.computeInvoiceSplits({
    subtotal: 100,
    line_items: [{ line_total: 40, income_account_code: '4100' }, { line_total: 40, income_account_code: '4200' }],
  });
  A.deepEqual(driftTie.map((s) => [s.account_id, s.amount_cents]), [['4100', 6000], ['4200', 4000]],
    'drift tie → earliest-seen bucket absorbs residual');

  // Lines that net to zero within one bucket drop the bucket.
  const netZero = gl.computeInvoiceSplits({
    subtotal: 0,
    line_items: [{ line_total: 50, income_account_code: '4100' }, { line_total: -50, income_account_code: '4100' }],
  });
  A.deepEqual(netZero, [], 'zero-net buckets emit nothing');
}

// 1g. Balance validation + storage round-trip.
{
  const bal = gl.splitsBalance(I1, I1.income_account_splits);
  A.equal(bal.ok, true, 'stored splits foot');
  A.equal(bal.delta_cents, 0);
  A.equal(bal.base_cents, 10000);
  A.equal(bal.splits_cents, 10000);
  const off = gl.splitsBalance(I1, [{ income_account_code: '4100', amount: 99.99 }]);
  A.equal(off.ok, false, 'off-by-a-penny rejects');
  A.equal(off.delta_cents, -1, 'delta signed cents');

  const rich = gl.splitsFromStorage({ ...I1, splits_override: true });
  A.equal(rich[0].source, 'manual', 'splits_override flag marks manual provenance');
  A.equal(rich[0].percent, 60, 'percent recomputed on storage read');
  const auto = gl.splitsFromStorage(I1);
  A.equal(auto[0].source, 'auto', 'no override flag → auto');
}

// 1h. Manual override: validation, patch shape, merge, audit, revert.
{
  const ok = gl.manualSplitOverride(I1, [
    { account_id: '4100', amount_cents: 7000 },
    { account_id: '4200', amount_cents: 3000 },
    { account_id: '4100', amount_cents: 0 },                              // zero dupe merges
  ], { actor_id: 'brett', now: NOW, reason: 'reclass print' });
  A.equal(ok.ok, true, 'balanced override accepted');
  A.equal(ok.patch.splits_override, true);
  A.equal(ok.patch.splits_override_by, 'brett');
  A.equal(ok.patch.splits_override_at, NOW);
  A.equal(ok.patch.splits_override_reason, 'reclass print');
  A.deepEqual(ok.patch.income_account_splits, [
    { income_account_code: '4100', amount: 70 },
    { income_account_code: '4200', amount: 30 },
  ], 'patch carries storage rows (dollars, merged)');
  A.equal(ok.splits[0].source, 'manual');
  A.equal(ok.splits[0].percent, 70);

  const bad = gl.manualSplitOverride(I1, [{ account_id: '4100', amount_cents: 9999 }]);
  A.equal(bad.ok, false, 'unbalanced override rejected, never forced');
  A.equal(bad.error, 'unbalanced_splits');
  A.equal(bad.delta_cents, -1, 'rejection reports the delta');
  A.equal('patch' in bad, false, 'no patch on rejection');

  const notArray = gl.manualSplitOverride(I1, 'garbage');
  A.equal(notArray.error, 'invalid_splits');
  const badRow = gl.manualSplitOverride(I1, [{ amount_cents: 10000 }]);
  A.equal(badRow.error, 'invalid_split_row', 'empty account rejected');

  // Zero-base invoice + empty override is legal (nothing to post).
  const zeroOk = gl.manualSplitOverride({ subtotal: 0 }, []);
  A.equal(zeroOk.ok, true, 'empty override on zero base balances');

  // Audit event: added/removed/changed + summary.
  const evt = gl.splitAuditEvent(I1,
    [{ account_id: '4100', amount_cents: 6000 }, { account_id: '4200', amount_cents: 4000 }],
    [{ account_id: '4100', amount_cents: 7000 }, { account_id: '4300', amount_cents: 3000 }],
    { actor_id: 'brett', now: NOW });
  A.equal(evt.event_type, 'invoice_income_splits_changed');
  A.equal(evt.entity_type, 'Invoice');
  A.equal(evt.entity_id, 'i1');
  A.equal(evt.actor_id, 'brett');
  A.equal(evt.has_changes, true);
  A.deepEqual(evt.added, [{ account_id: '4300', after_cents: 3000 }], 'added bucket');
  A.deepEqual(evt.removed, [{ account_id: '4200', before_cents: 4000 }], 'removed bucket');
  A.deepEqual(evt.changed, [{ account_id: '4100', before_cents: 6000, after_cents: 7000, delta_cents: 1000 }], 'changed bucket');
  A.equal(evt.before_total_cents, 10000);
  A.equal(evt.after_total_cents, 10000);
  A.match(evt.summary, /^GL splits: /);
  A.ok(evt.summary.includes('4300') && evt.summary.includes('4200') && evt.summary.includes('4100'), 'summary names all three buckets');

  const noop = gl.splitAuditEvent(I1, I1.income_account_splits, I1.income_account_splits, {});
  A.equal(noop.has_changes, false, 'identical posting → no-change event');
  A.equal(noop.summary, 'GL splits: no posting change');

  const cleared = gl.clearSplitOverride(I1, { partsByKey: PARTS, default_income_account_id: '4000' }, { actor_id: 'ops', now: NOW });
  A.equal(cleared.patch.splits_override, false, 'revert clears the flag');
  A.equal(cleared.patch.splits_override_by, 'ops');
  A.deepEqual(cleared.patch.income_account_splits, I1.income_account_splits, 'revert restores auto storage rows');
}

// ===========================================================================
// SECTION 2 — accountingExportModel: journal shape, mapping, identity, CSV
// ===========================================================================
// 2a. Constants + money parsing + date chains.
A.deepEqual([...exp.EXPORT_ROW_TYPES], ['invoice_income', 'invoice_tax', 'payment_received', 'payment_fee', 'refund']);
A.deepEqual(exp.POSTED_INVOICE_STATUSES, ['sent', 'partially_paid', 'paid']);
A.equal(exp.toCents('$1,234.56'), 123456, 'decorated money parses');
A.equal(exp.toCents('INV-001'), 0, 'letter-laden rejected');
A.equal(exp.invoiceDateOf({ invoice_date: '2026-10-01', issue_date: '2026-10-05' }), '2026-10-01', 'invoice_date wins chain');
A.equal(exp.invoiceDateOf({ issue_date: '2026-10-05T23:00:00Z' }), '2026-10-05', 'ISO prefix → day, no TZ shift');
A.equal(exp.paymentDateOf({ created_date: '2026-10-12T23:00:00Z' }), '2026-10-12', 'created_date fallback');

// 2b. Posted invoice journal — balanced, roles, accounts, memo safety.
{
  const rows = exp.invoiceExportRows(I1, CFG);
  A.equal(rows.length, 4, 'AR + 2 income + tax legs');
  A.equal(sumDr(rows), sumCr(rows), 'journal balances');
  A.equal(rows[0].account_code, '1100', 'AR resolves arAccount');
  A.equal(rows[0].debit_cents, 10780, 'AR debit = invoice total');
  A.deepEqual(rows.filter((r) => r.role === 'income').map((r) => [r.account_code, r.credit_cents]),
    [['4100', 6000], ['4200', 4000]], 'split credits per account (GL-chain storage rows honored)');
  A.equal(rows.find((r) => r.role === 'tax').account_code, '2100');
  A.equal(rows.find((r) => r.role === 'tax').credit_cents, 780);
  A.ok(rows.every((r) => r.debit_cents >= 0 && r.credit_cents >= 0), 'legs always ≥ 0');
  A.equal(rows[0].entity_id, 'i1');
  A.equal(rows[0].customer, 'Acme Sign Co');
  A.equal(rows[0].memo, 'Invoice INV-001');
  A.equal(rows[0].date, '2026-10-05');
}

// 2c. Deposit, void reversal, negative split column-flip, draft suppression.
{
  const dep = exp.invoiceExportRows({ ...I1, id: 'iD', invoice_number: 'INV-D', deposit_applied: 20, total: 87.8 }, CFG);
  A.equal(sumDr(dep), 10780, 'deposit slice adds a DR leg and still balances');
  A.equal(dep.find((r) => r.role === 'deposit').account_code, '2200', 'deposit → depositAccount');
  A.equal(dep.find((r) => r.role === 'deposit').debit_cents, 2000);

  const v = exp.invoiceExportRows({ ...I1, id: 'iV', invoice_number: 'INV-V', status: 'void' }, CFG);
  A.equal(sumDr(v), sumCr(v), 'void reversal still balances');
  A.equal(v.find((r) => r.role === 'ar').credit_cents, 10780, 'AR credited on void');
  A.match(v[0].memo, /Void reversal/, 'void memo marked');

  A.deepEqual(exp.invoiceExportRows({ ...I1, status: 'draft' }, CFG), [], 'draft posts nothing');
  A.deepEqual(exp.invoiceExportRows(null, CFG), [], 'non-object → []');

  const negSplit = exp.invoiceExportRows({
    id: 'iN', invoice_number: 'INV-N', status: 'sent', issue_date: '2026-10-05',
    subtotal: 50, total: 50, income_account_splits: [{ income_account_code: '4100', amount: -50 }, { income_account_code: '4200', amount: 100 }],
  }, CFG);
  const negRow = negSplit.find((r) => r.account_code === '4100');
  A.equal(negRow.debit_cents, 5000, 'negative split flips to the debit column');
  A.equal(negRow.credit_cents, 0, 'flipped leg keeps cells ≥ 0');
  A.equal(sumDr(negSplit), sumCr(negSplit), 'negative-split journal still foots');
}

// 2d. Payment journals — receipt + fee, refund + fee, credit memo.
{
  const rcpt = exp.paymentExportRows(PAYMENTS.find((p) => p.id === 'pB'), { ...CFG, invoice: I1 });
  A.equal(rcpt.length, 2, 'receipt = bank + AR');
  A.equal(rcpt[0].account_code, '1200', 'check → undeposited funds');
  A.equal(rcpt[0].ref, 'PMT-pB', 'payment ref = PMT-<id>');
  A.equal(rcpt.find((r) => r.role === 'ar').credit_cents, 6000);

  const fee = exp.paymentExportRows(PAYMENTS.find((p) => p.id === 'pB2'), { ...CFG });
  A.equal(fee.length, 3, 'fee receipt = bank net + fee + AR gross');
  A.equal(fee.find((r) => r.type === 'payment_fee').debit_cents, 250, 'processor cut to feeAccount');
  A.equal(fee.find((r) => r.type === 'payment_fee').account_code, '6100');
  A.equal(fee.find((r) => r.role === 'bank').debit_cents, 29750, 'bank nets the fee');
  A.equal(sumDr(fee), sumCr(fee), 'fee receipt balances');

  const refund = exp.paymentExportRows(PAYMENTS.find((p) => p.id === 'pR2'), { ...CFG });
  A.equal(refund.find((r) => r.role === 'bank').credit_cents, 3100, 'refund bank loses gross + fee');
  A.equal(refund.find((r) => r.type === 'payment_fee').debit_cents, 100, 'refund fee expense leg');
  A.equal(refund[0].ref, 'RF-pR2', 'refund ref = RF-<id>');
  A.equal(sumDr(refund), sumCr(refund), 'refund journal balances');

  const memo = exp.paymentExportRows(PAYMENTS.find((p) => p.id === 'pCM'), { ...CFG });
  A.deepEqual(memo.map((r) => [r.role, r.debit_cents, r.credit_cents]),
    [['ar', 2500, 0], ['credit', 0, 2500]], 'credit memo: DR AR / CR credit liability, no cash');
  A.equal(memo.find((r) => r.role === 'credit').account_code, '2300', 'credit → creditAccount');
  A.equal(memo[0].ref, 'CM-pCM', 'credit memo ref = CM-<id>');

  A.deepEqual(exp.paymentExportRows({ ...PAYMENTS[3], status: 'void' }, CFG), [], 'void payment posts nothing');
  A.deepEqual(exp.paymentExportRows({ amount: 0, status: 'recorded' }, CFG), [], 'zero amount posts nothing');

  // Bank-side override + cash→undeposited preference.
  const override = exp.paymentExportRows({ id: 'px', amount: 10, status: 'recorded', method: 'card' }, { ...CFG, bank_account_id: '1999' });
  A.equal(override[0].account_code, '1999', 'explicit bank_account_id wins the chain');
  const cash = exp.paymentExportRows({ id: 'py', amount: 10, status: 'recorded', method: 'cash', paid_date: '2026-10-01' }, CFG);
  A.equal(cash[0].account_code, '1200', 'cash prefers undeposited funds');
}

// 2e. Account resolution tiers.
{
  A.equal(exp.accountCodeFor({ account_code: '4999', role: 'ar' }, CFG), '4999', 'row explicit wins');
  A.equal(exp.accountCodeFor({ role: 'ar' }, CFG), '1100', 'role → config slot');
  A.equal(exp.accountCodeFor({ type: 'invoice_tax' }, CFG), '2100', 'type fallback tier');
  A.equal(exp.accountCodeFor({ type: 'x' }, { ...CFG, defaultAccount: '3999' }), '3999', 'defaultAccount catch-all');
  A.equal(exp.accountCodeFor({ role: 'income' }, { arAccount: '1100' }), '', 'no income config + no default → unmapped, never invented');
  A.equal(exp.accountCodeFor({ role: 'bank' }, { bank_account: '1005' }), '1005', 'snake_case config spelling resolves');
  A.equal(exp.accountCodeFor({ role: 'ar' }, { arAccount: { code: '1110' } }), '1110', 'account row value → code');
}

// 2f. exportBatch — period filter, skips, deterministic order, footing.
let BATCH;
{
  BATCH = exp.exportBatch(INVOICES, PAYMENTS, { ...CFG, from: '2026-10-01', to: '2026-10-31', accountsByCode: ACCOUNT_NAMES });
  A.equal(BATCH.balanced, true, 'every journal balances and batch foots');
  A.equal(BATCH.totals.debit_cents, BATCH.totals.credit_cents, 'batch debits == credits');
  A.equal(BATCH.totals.debit_cents, 148080, 'batch total cents');
  A.equal(BATCH.counts.invoices, 8, 'posted invoices in period (i2 excluded pre-period, i5 draft, i11 undated)');
  A.equal(BATCH.counts.payments, 10, 'live payments in period (pA out, pV void, pZ zero, pPend undated)');
  A.equal(BATCH.counts.journals, 18, 'one journal per posted entity');
  A.equal(BATCH.rows.length, 40, 'export row count');
  A.deepEqual(BATCH.unbalanced_refs, [], 'nothing unbalanced');
  A.deepEqual(BATCH.unmapped_refs, [], 'full config resolves every account');
  A.equal(BATCH.rows[0].ref, 'INV-008', 'sorted by date → ref (earliest journal first)');
  A.equal(BATCH.rows[BATCH.rows.length - 1].ref, 'PMT-pC', 'last journal = latest payment');
  A.equal(BATCH.period.from, '2026-10-01');
  A.equal(BATCH.period.to, '2026-10-31');
  const reasons = BATCH.skipped.map((s) => `${s.entity}:${s.reason}`);
  for (const r of ['invoice:draft', 'invoice:out_of_period', 'invoice:undated', 'payment:void', 'payment:zero_amount', 'payment:out_of_period', 'payment:undated']) {
    A.ok(reasons.includes(r), `skipped reason ${r}`);
  }
  A.equal(BATCH.rows.find((r) => r.account_code === '4100').account_name, 'Sign Sales', 'account_name enrichment applied');
  // Idempotency: same inputs → byte-identical rows.
  const rerun = exp.exportBatch(INVOICES, PAYMENTS, { ...CFG, from: '2026-10-01', to: '2026-10-31', accountsByCode: ACCOUNT_NAMES });
  A.deepEqual(rerun.rows, BATCH.rows, 'export is deterministic (re-run reproduces)');
  A.deepEqual(rerun.totals, BATCH.totals, 're-run totals identical');
}

// 2g. Unbalanced + unmapped surface honestly.
{
  const badInv = { id: 'iBad', invoice_number: 'INV-BAD', status: 'sent', issue_date: '2026-10-10', subtotal: 100, total: 100, income_account_splits: [{ income_account_code: '4100', amount: 50 }] };
  const b1 = exp.exportBatch([badInv], [], { ...CFG, from: '2026-10-01', to: '2026-10-31' });
  A.equal(b1.balanced, false, 'non-footing splits → batch flagged unbalanced');
  A.deepEqual(b1.unbalanced_refs, ['INV-BAD'], 'offending ref listed');
  A.equal(b1.totals.debit_cents - b1.totals.credit_cents, 5000, 'delta = the missing split half');

  const sparse = exp.exportBatch([{ id: 'iX', invoice_number: 'INV-X', status: 'sent', issue_date: '2026-10-10', subtotal: 25, total: 25, income_account_splits: [{ income_account_code: '', amount: 25 }] }], [], { arAccount: '1100', from: '2026-10-01', to: '2026-10-31' });
  A.deepEqual(sparse.unmapped_refs, ['INV-X'], 'unresolvable account → unmapped_refs');
  A.equal(sparse.rows.find((r) => r.role === 'income').account_code, '', 'unmapped posts to the empty bucket, never dropped');

  // In the same sparse-config world the alerts layer agrees the splits are unmapped.
  const unmapped = al.unmappedAlert([{ id: 'iX', invoice_number: 'INV-X', status: 'sent', issue_date: '2026-10-10', income_account_splits: [{ income_account_code: '', amount: 25 }] }]);
  A.equal(unmapped.length, 1, 'unmappedAlert flags the same invoice');
  A.equal(unmapped[0].total_cents, 2500, 'unmapped cents summed');
}

// 2h. CSV serializer — headers, encoding, escaping.
{
  const csv = exp.toCsv(BATCH.rows);
  const lines = csv.split('\n');
  A.equal(lines[0], 'date,ref,type,account,debit,credit,memo', 'CSV header row');
  A.equal(lines.length - 1, BATCH.rows.length, 'one line per export row');
  A.equal(lines[1], '2026-10-01,INV-008,invoice_income,1100,100.00,,Invoice INV-008', 'row encoding: debit cell, empty credit cell, plain 2dp money');
  const taxLine = lines.find((l) => l.includes('invoice_tax'));
  A.match(taxLine, /,2100,,7\.80,/, 'credit leg in the credit column');
  A.ok(!csv.includes('$'), 'money cells are bare decimals, no currency marks');

  const esc = exp.toCsv([
    { date: '2026-10-01', ref: 'R,1', type: 'x', account_code: 'A"B', debit_cents: 0, credit_cents: 0, memo: 'line1\nline2' },
    'not-a-row',
  ]);
  const escLines = esc.split('\n');
  A.equal(escLines.length, 3, 'non-row entries skipped; embedded newline lives inside the quoted cell');
  A.equal(escLines[1], '2026-10-01,"R,1",x,"A""B",,,"line1', 'RFC-4180 quoting: comma + doubled quote + newline');
  A.equal(escLines[2], 'line2"', 'quoted newline continues the cell');
}

// 2i. IIF dry-run shape.
{
  const iif = exp.toIifDraft(exp.invoiceExportRows(I1, CFG));
  const il = iif.split('\n');
  A.equal(il[0], '!TRNS\tTRNSID\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', 'IIF TRNS header');
  A.equal(il[1], '!SPL\tSPLID\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', 'IIF SPL header');
  A.equal(il[2], '!ENDTRNS', 'IIF ENDTRNS header');
  A.match(il[3], /^TRNS\t\t2026-10-05\t1100\tAcme Sign Co\t107\.80\tINV-001/, 'TRNS = first debit leg');
  A.match(il[4], /^SPL\t\t2026-10-05\t4100\tAcme Sign Co\t-60\.00\tINV-001/, 'SPL credit signed negative');
  A.equal(il[7], 'ENDTRNS', 'block closes');
  // Signed amounts inside a block sum to zero (balanced journal).
  const blockAmounts = il.slice(3, 7).map((l) => Number(l.split('\t')[5]));
  A.ok(Math.abs(blockAmounts.reduce((s, n) => s + n, 0)) < 0.005, 'IIF block amounts sum to zero');

  const sparse = exp.toIifDraft(exp.invoiceExportRows(
    { id: 'iX', invoice_number: 'INV-X', status: 'sent', issue_date: '2026-10-10', subtotal: 25, total: 25, income_account_splits: [{ income_account_code: '', amount: 25 }] },
    { arAccount: '1100' }));
  A.ok(sparse.includes('(UNMAPPED)'), 'unmapped account renders (UNMAPPED) in IIF');
  A.ok(!sparse.includes('\n '), 'tab cells stripped clean');
}

// 2j. Balance/reconcile helpers.
{
  A.deepEqual(exp.journalBalance(exp.invoiceExportRows(I1, CFG)), { ok: true, debit_cents: 10780, credit_cents: 10780, delta_cents: 0 });
  A.equal(exp.journalBalance([{ debit_cents: 100, credit_cents: 0 }]).ok, false, 'unbalanced helper detects');
  const rec = exp.reconcileBatch(BATCH, { debit_cents: 148080, credit_cents: 148080, rows: 40 });
  A.equal(rec.ok, true, 'reconcileBatch ties on expected totals');
  const off = exp.reconcileBatch(BATCH, { debit: 1, credit: 1, row_count: 1 });
  A.equal(off.ok, false);
  A.equal(off.debit_delta_cents, 148079, 'delta reported');
}

// ===========================================================================
// SECTION 3 — statementBatchModel: grouping, carry-forward, content
// ===========================================================================
// 3a. statementPeriod — generation-day semantics + clamps.
A.deepEqual(stmt.statementPeriod({ now: '2026-11-01' }), { period_start: '2026-10-01', period_end: '2026-10-31', label: 'October 2026' }, 'run on the 1st covers last month');
A.deepEqual(stmt.statementPeriod({ now: '2026-11-15', day_of_month: 31 }), { period_start: '2026-09-01', period_end: '2026-09-30', label: 'September 2026' }, 'before the effective run day → month-2');
A.deepEqual(stmt.statementPeriod({ now: '2026-02-28', day_of_month: 31 }), { period_start: '2026-01-01', period_end: '2026-01-31', label: 'January 2026' }, 'day 31 clamped to Feb 28 → fires, covers month-1');
A.deepEqual(stmt.statementPeriod({ now: '2026-02-10', day_of_month: 31 }), { period_start: '2025-12-01', period_end: '2025-12-31', label: 'December 2025' }, 'Feb 10 < effective 28 → month-2');
A.equal(stmt.statementPeriod({ now: '2026-03-01' }).period_end, '2026-02-28', 'month-end bound respects month length');

// 3b. Roll-forward — opening carryover + gross + adjustments + identity.
const CTX1 = stmt.customerStatementContext({ customer: CUSTOMERS[0], invoices: INVOICES, payments: PAYMENTS, period: PERIOD });
A.equal(CTX1.customer_id, 'c1');
A.equal(CTX1.company_name, 'Acme Sign Co');
A.equal(CTX1.billing_email, 'ap@acme.test', 'billing email resolved');
A.equal(CTX1.period_start, '2026-10-01');
A.equal(CTX1.period_end, '2026-10-31');
A.equal(CTX1.as_of, '2026-10-31');
A.equal(CTX1.opening_balance, 5000, 'opening = live i2 (200) − live pA (150) pre-period');
A.equal(CTX1.invoiced, 25780, 'gross billed in period incl the voided i4 (gross then reversed)');
A.equal(CTX1.paid, 111900, 'gross received in period incl the voided pV (gross then reversed)');
A.equal(CTX1.adjustments, 91900, 'adjustments = void pay +99900, void inv −8000');
A.equal(CTX1.closing_balance, 10780, 'closing = opening + invoiced − paid + adjustments');
// Roll-forward identity is exact.
A.equal(CTX1.opening_balance + CTX1.invoiced - CTX1.paid + CTX1.adjustments, CTX1.closing_balance, 'roll-forward identity holds');

// 3c. Line items + aging buckets vs the period end.
{
  A.equal(CTX1.line_items.length, 3, 'open items only (i1 partial, i2 carryover, i3 unpaid)');
  A.deepEqual(CTX1.line_items.map((li) => li.invoice_number), ['INV-002', 'INV-001', 'INV-003'], 'sorted by issue date');
  const li1 = CTX1.line_items.find((l) => l.invoice_number === 'INV-001');
  A.equal(li1.total, 10780);
  A.equal(li1.paid, 6000, 'linked live payment applied');
  A.equal(li1.balance, 4780);
  const itemsSum = CTX1.line_items.reduce((s, l) => s + l.balance, 0);
  A.equal(itemsSum, 14780);
  A.equal(CTX1.closing_balance, itemsSum - 4000, 'closing = Σ items + unapplied payment credit (−4000)');
  A.deepEqual(CTX1.aging, { current: 4780, b1_30: 5000, b31_60: 5000, b61_90: 0, b90p: 0 },
    'aging vs as_of: i1 current (due 11-15), i3 11d late, i2 31d late');
  // Void/draft/undated invoices never appear; settled invoices drop.
  const itemNums = CTX1.line_items.map((l) => l.invoice_number);
  for (const n of ['INV-004', 'INV-005', 'INV-010', 'INV-011']) A.ok(!itemNums.includes(n), `${n} not an open item`);
}

// 3d. KNOWN DEFECT N-05.1 — partial refund reopen never reaches the statement.
{
  // Invoice-ledger truth (refundMath / invoicingAction): counted rows =
  // recorded + refunded SIGNED → net collected 300 − 30 = 270 → balance_due
  // reopens by $30 on i6.
  A.equal(rm.netCollected([
    { id: 'pB2', amount: 300, status: 'recorded' },
    { id: 'pR2', amount: -30, status: 'refunded', refund_of_payment_id: 'pB2' },
  ]), 270, 'ledger truth: net collected after partial refund = $270');

  const ctx2 = stmt.customerStatementContext({ customer: CUSTOMERS[1], invoices: INVOICES, payments: PAYMENTS, period: PERIOD });
  // FIXED DEFECT N-05.1: the 'refunded' reversal leg is now a live money row
  // (isVoidPayment = void/cancel only) → net collected 27000 surfaces the
  // reopened $30 as AR: closing 3000, INV-006 listed with balance 3000.
  A.equal(ctx2.paid, 27000, 'N-05.1 fixed: paid nets 27000 (leg counted live)');
  A.equal(ctx2.closing_balance, 3000, 'N-05.1 fixed: closing reopens $30 AR');
  A.equal(ctx2.line_items.length, 1, 'N-05.1 fixed: reopened invoice lists');
  A.equal(ctx2.line_items[0].balance, 3000, 'N-05.1 fixed: line balance = reopened $30');
  // Contrast: a fully-refunded ORIGINAL (status flipped to 'refunded') is
  // also net-0 — same rule, correct outcome there.
  const fullRefund = stmt.customerStatementContext({
    customer: { id: 'cF' }, period: PERIOD,
    invoices: [{ id: 'iF', customer_id: 'cF', status: 'sent', issue_date: '2026-10-05', total: 100 }],
    payments: [
      { id: 'pF', invoice_id: 'iF', customer_id: 'cF', amount: 100, status: 'refunded', paid_date: '2026-10-06' },
      { id: 'pFR', invoice_id: 'iF', customer_id: 'cF', amount: -100, status: 'refunded', refund_of_payment_id: 'pF', paid_date: '2026-10-07' },
    ],
  });
  A.equal(fullRefund.closing_balance, 10000, 'fully-refunded payment → AR fully restored (same rule, correct here)');
  A.equal(fullRefund.line_items[0].balance, 10000, 'full refund nets applied to 0 → full balance reopens');
}

// 3e. Candidates — closing>0 gate, missing-email flag, deterministic sort.
// Post-N-05.1: c2's reopened $30 makes it a candidate (real AR, correctly).
const CANDS = stmt.statementCandidates({ customers: CUSTOMERS, invoices: INVOICES, payments: PAYMENTS, period: PERIOD, now: NOW });
A.equal(CANDS.length, 3, 'positive-balance customers (c2 reopened + c1 + c3; c4 zero + c5 credit excluded)');
A.deepEqual(CANDS.map((c) => c.customer.id), ['c1', 'c2', 'c3'], 'sorted by company name');
A.equal(CANDS[0].missing_email, false);
A.equal(CANDS[1].missing_email, false, 'c2 resolves email via fallback');
A.equal(CANDS[1].context.closing_balance, 3000, 'c2 candidate balance = reopened $30');
A.equal(CANDS[2].missing_email, true, 'no billing email → missing_email flag, still a candidate');
A.equal(CANDS[2].context.closing_balance, 7500);
A.deepEqual(CANDS[2].context.aging, { current: 0, b1_30: 7500, b31_60: 0, b61_90: 0, b90p: 0 }, 'i9 30 days past due → b1_30');
// Zero and credit balances prove the gate.
A.equal(stmt.customerStatementContext({ customer: CUSTOMERS[3], invoices: INVOICES, payments: PAYMENTS, period: PERIOD }).closing_balance, 0, 'c4 settles to zero');
A.equal(stmt.customerStatementContext({ customer: CUSTOMERS[4], invoices: INVOICES, payments: PAYMENTS, period: PERIOD }).closing_balance, -500, 'c5 overpaid + credit memo → credit balance −500, skipped');

// 3f. Dedupe keys + batch plan idempotency.
A.equal(stmt.statementDedupeKey(CUSTOMERS[0], PERIOD), 'stmt:c1:2026-10-01', 'dedupe key = stmt:<cust>:<period_start>');
A.equal(stmt.statementDedupeKey('c1', '2026-10-01'), 'stmt:c1:2026-10-01', 'bare-string forms resolve');
const PLAN = stmt.statementBatchPlan(CANDS);
A.equal(PLAN.length, 3);
A.deepEqual(PLAN.map((r) => r.dedupe_key), ['stmt:c1:2026-10-01', 'stmt:c2:2026-10-01', 'stmt:c3:2026-10-01']);
A.equal(PLAN[0].customer_id, 'c1');
A.equal(PLAN[2].missing_email, true, 'missing_email rides the plan row');
// Rerun against persisted keys → everything deduped (idempotent delivery).
A.equal(stmt.statementBatchPlan(CANDS, { existingKeys: PLAN.map((r) => r.dedupe_key) }).length, 0, 'rerun with existing keys emits nothing');
A.equal(stmt.statementBatchPlan(CANDS, { existingKeys: { 'stmt:c1:2026-10-01': true } }).length, 2, 'object-map keys also dedupe');
// Duplicate customer inside one plan only emits once.
const dup = stmt.statementBatchPlan([...CANDS, CANDS[0]]);
A.equal(dup.length, 3, 'same-plan duplicates deduped');
// Unkeyable rows skipped: a bare as-of period leaves period_start '' → key
// ends ':' → skipped rather than generating an undedupable statement.
const unkeyed = stmt.statementBatchPlan([{ customer: { id: 'c9' }, context: { customer_id: 'c9', period_start: '' }, missing_email: false }]);
A.equal(unkeyed.length, 0, 'no period bound → unkeyable → skipped');

// 3g. Summary rendering.
{
  const s = stmt.renderStatementSummary(CTX1);
  A.match(s, /^Acme Sign Co — October 2026 statement: 3 open invoices/, 'summary headline');
  A.ok(s.includes('$107.80 due'), 'summary carries closing');
  A.ok(s.includes('invoiced $257.80, paid $1,119.00, adjustments $919.00'), 'summary carries components');
  A.ok(s.includes('aging current $47.80 / 1-30d $50.00 / 31-60d $50.00'), 'summary carries positive buckets only');
  A.equal(stmt.centsToMoney(123456), '$1,234.56');
  A.equal(stmt.centsToMoney(-500), '-$5.00');
  A.equal(stmt.centsToMoney('junk'), '$0.00');
}

// ===========================================================================
// SECTION 4 — StoreCreditLedger: model semantics + entity contract
// ===========================================================================
// 4a. Ledger kinds + signed-sum balance + precedence.
A.deepEqual([...cr.CREDIT_LEDGER_KINDS], ['credit_issued', 'credit_applied', 'credit_expired', 'credit_voided'], 'model kinds');
A.equal(cr.ledgerSumCents([
  { kind: 'credit_issued', amount: 10000 },
  { kind: 'credit_applied', amount: -2500 },
  { kind: 'credit_expired', amount: -1000 },
  { kind: 'credit_voided', amount: 2500, ref: 'x' },
  { kind: 'credit_issued', amount: 9999, deleted: true },                  // dead row ignored
  { kind: 'note', amount: 777 },                                          // unknown kind ignored
]), 9000, 'signed sum over live rows');
A.equal(cr.creditBalance({ in_store_credit_balance: 42.5 }, [{ kind: 'credit_issued', amount: 1 }]), 4250, 'stored field authoritative over ledger');
A.equal(cr.creditBalance({}, [{ kind: 'credit_issued', amount: 300 }]), 300, 'no stored → ledger sum');
A.equal(cr.creditBalance({ in_store_credit_balance: -20 }, []), -2000, 'negative credit surfaces raw (net-owed signal)');

// 4b. Issue → apply ordering (min(balance, due)) → audit trail fields.
const ISSUE = cr.issueCredit({ customer: { id: 'c6' }, amount: 20000, reason: 'Credit memo CM-1042', actor: 'brett', now: NOW, ledgerRows: [] });
A.equal(ISSUE.ledger_row.kind, 'credit_issued');
A.equal(ISSUE.ledger_row.amount, 20000, 'model row amount is signed CENTS');
A.equal(ISSUE.ledger_row.balance_after, 20000, 'running balance stamped');
A.equal(ISSUE.ledger_row.actor, 'brett', 'actor audit field');
A.equal(ISSUE.ledger_row.reason, 'Credit memo CM-1042', 'reason audit field');
A.equal(ISSUE.ledger_row.created_at, NOW, 'timestamp field (created_at — see entity mapping below)');
A.equal(ISSUE.ledger_row.customer_id, 'c6');
A.equal(ISSUE.customer_patch.in_store_credit_balance, 200, 'entity patch writes DOLLARS');
A.deepEqual(cr.issueCredit({ customer: {}, amount: 0 }), { ledger_row: null, customer_patch: {} }, 'zero issue is a no-op');
A.deepEqual(cr.issueCredit({ customer: {}, amount: -5 }), { ledger_row: null, customer_patch: {} }, 'negative issue is a no-op');

// Apply ordering: apply = min(credit, due); both ≤0 → null row, nothing moves.
{
  const cust = { id: 'c6', in_store_credit_balance: 200 };
  const plan = cr.applyCreditPlan({ customer: cust, invoice: { id: 'iZ', balance_due: 120 }, now: NOW, actor: 'ops' });
  A.equal(plan.apply_amount, 12000, 'apply = min(credit 20000, due 12000)');
  A.equal(plan.new_invoice_balance, 0);
  A.equal(plan.new_credit_balance, 8000);
  A.equal(plan.ledger_row.kind, 'credit_applied');
  A.equal(plan.ledger_row.amount, -12000, 'apply posts negative');
  A.equal(plan.ledger_row.invoice_id, 'iZ', 'application audit link');
  A.equal(plan.ledger_row.balance_after, 8000);

  // OVER-APPLICATION GUARD: credit can never exceed the smaller side.
  const clamp = cr.applyCreditPlan({ customer: { in_store_credit_balance: 50 }, invoice: { balance_due: 90 }, now: NOW });
  A.equal(clamp.apply_amount, 5000, 'apply clamps to credit — never over-applies');
  A.equal(clamp.new_invoice_balance, 4000, 'remainder stays owed');
  const clamp2 = cr.applyCreditPlan({ customer: { in_store_credit_balance: 33.33 }, invoice: { balance_due: 40 }, now: NOW });
  A.equal(clamp2.apply_amount, 3333, 'cent-precision clamp');
  A.equal(clamp2.new_invoice_balance, 667);
  // Negative/zero credit can never be applied (spending path clamps at 0).
  A.equal(cr.applyCreditPlan({ customer: { in_store_credit_balance: -30 }, invoice: { balance_due: 50 } }).ledger_row, null, 'negative credit → no apply');
  A.equal(cr.applyCreditPlan({ customer: cust, invoice: { balance_due: 0 } }).ledger_row, null, 'zero due → no apply');

  const w = cr.applyCredit({ customer: cust, invoice: { id: 'iZ', balance_due: 120, amount_paid: 25, credit_applied: 10 }, actor: 'ops', now: NOW });
  A.equal(w.invoice_patch.amount_paid, 145, 'invoice patch: amount_paid += credit (dollars)');
  A.equal(w.invoice_patch.balance_due, 0);
  A.equal(w.invoice_patch.credit_applied, 130, 'cumulative credit_applied tracked');
  A.equal(w.customer_patch.in_store_credit_balance, 80);
  A.equal(w.apply_amount_dollars, 120, 'echo for dollar-side callers');
}

// 4c. Void semantics — append-only reversal, error table, balance restore.
{
  const rows = [
    { id: 'L1', kind: 'credit_issued', amount: 10000, customer_id: 'c6' },
    { id: 'L2', kind: 'credit_applied', amount: -2500, customer_id: 'c6', invoice_id: 'iZ' },
  ]; // live balance 7500
  const v = cr.voidCredit({ ledgerRows: rows, row_id: 'L2', actor: 'admin', reason: 'voided payment', now: NOW });
  A.equal(v.ledger_row.kind, 'credit_voided');
  A.equal(v.ledger_row.amount, 2500, 'reversal = negation of the applied row → credit restored');
  A.equal(v.ledger_row.ref, 'L2', 'reversal points at its target');
  A.equal(v.ledger_row.reversed_kind, 'credit_applied', 'reversed kind recorded');
  A.equal(v.ledger_row.balance_after, 10000);
  A.equal(v.reversed_row_id, 'L2');
  A.equal(v.customer_patch.in_store_credit_balance, 100);
  A.equal(rows.length, 2, 'append-only: target row untouched');
  A.equal(cr.ledgerSumCents([...rows, v.ledger_row]), 10000, 'replay equals balance_after');

  const errs = (id) => cr.voidCredit({ ledgerRows: [...rows, v.ledger_row && { ...v.ledger_row, id: 'V1' }], row_id: id });
  A.equal(errs('nope').error, 'not_found');
  A.equal(errs('L2').error, 'already_voided', 'a row voids once only');
  A.equal(errs('V1').error, 'cannot_void_reversal', 'reversals themselves never void');
  A.equal(cr.voidCredit({ ledgerRows: rows, row_id: 'L1' }).customer_patch.in_store_credit_balance, -25, 'voiding issuance can drive balance negative (raw)');
}

// 4d. Reconcile + entity schema contract + persistence mapping.
{
  const ledger = [{ kind: 'credit_issued', amount: 5000 }, { kind: 'credit_applied', amount: -1500 }];
  A.deepEqual(cr.reconcileCredit({ in_store_credit_balance: 35 }, ledger), { matches: true, computed: 3500, stored: 3500 }, 'denormalized cache ties to ledger');
  A.equal(cr.reconcileCredit({ in_store_credit_balance: 34.99 }, ledger).matches, false, 'drift flags');
  A.equal(cr.reconcileCredit({}, ledger).stored, null, 'absent cache reported null');

  // Entity shape — the canonical store the model writes through.
  A.deepEqual(SCL.required, ['customer_id', 'kind', 'amount'], 'entity required fields');
  A.deepEqual(SCL.properties.kind.enum, [...cr.CREDIT_LEDGER_KINDS], 'entity kind enum == model kinds');
  for (const f of ['amount_cents', 'balance_after', 'occurred_at', 'ref', 'reversed_kind', 'reason', 'actor', 'invoice_id', 'creation_request_key', 'schema_version']) {
    A.ok(f in SCL.properties, `StoreCreditLedger declares ${f}`);
  }
  A.equal(SCL.properties.occurred_at.format, 'date-time', 'occurred_at is the entity timestamp');
  for (const op of ['create', 'read', 'update', 'delete']) {
    A.equal(SCL.rls[op].user_condition.role, '__store_credit_ledger_backend_only__', `rls.${op} backend-only`);
  }

  // PERSISTENCE CONTRACT: the model row carries CENTS in `amount`; the
  // entity stores DOLLARS in `amount` + cents in `amount_cents`. The writer
  // must map — prove it through the analytics reader's documented rule
  // ("amount_cents wins; bare amount is read as dollars").
  const applied = cr.applyCredit({ customer: { id: 'c6', in_store_credit_balance: 100 }, invoice: { id: 'iZ', balance_due: 25 }, now: NOW });
  const modelRow = applied.ledger_row;                                    // {amount: -2500 CENTS}
  A.equal(modelRow.amount, -2500, 'model row amount is cents (pre-persist)');
  const persisted = { ...modelRow, amount: modelRow.amount / 100, amount_cents: modelRow.amount, occurred_at: modelRow.created_at };
  const viaEntity = an.customerAnalytics({ creditLedger: [persisted] });
  A.equal(viaEntity.discounts.credit_applied_cents, 2500, 'CONTRACT: mapped row reads as 2500¢');
  const viaRaw = an.customerAnalytics({ creditLedger: [modelRow] });
  A.equal(viaRaw.discounts.credit_applied_cents, 250000, 'CONTRACT: raw model row would read 100× hot — writers MUST map amount→dollars + amount_cents');
}

// 4e. End-to-end ledger flow: issue → apply → void → reconcile.
{
  let rows = [];
  let cust = { id: 'c6' };
  const i = cr.issueCredit({ customer: cust, amount: 20000, actor: 'a', now: NOW, ledgerRows: rows });
  rows.push({ id: 'E1', ...i.ledger_row });
  cust = { ...cust, ...i.customer_patch };
  const ap = cr.applyCredit({ customer: cust, invoice: { id: 'iZ', balance_due: 120, amount_paid: 0 }, actor: 'b', now: NOW, ledgerRows: rows });
  rows.push({ id: 'E2', ...ap.ledger_row });
  cust = { ...cust, ...ap.customer_patch };
  A.equal(cust.in_store_credit_balance, 80, 'balance after apply');
  A.equal(cr.reconcileCredit(cust, rows).matches, true, 'cache reconciles mid-flow');
  const v = cr.voidCredit({ ledgerRows: rows, row_id: 'E2', actor: 'c', now: NOW });
  rows.push({ id: 'E3', ...v.ledger_row });
  cust = { ...cust, ...v.customer_patch };
  A.equal(cust.in_store_credit_balance, 200, 'voiding the application restores credit');
  A.equal(cr.ledgerSumCents(rows), 20000);
  A.equal(cr.reconcileCredit(cust, rows).matches, true, 'end state reconciles');
}

// ===========================================================================
// SECTION 5 — paymentRegisterModel: rows reconcile, void out of the net
// ===========================================================================
const LOOKUPS = {
  customersById: Object.fromEntries(CUSTOMERS.filter((c) => c.id).map((c) => [c.id, c])),
  invoicesById: Object.fromEntries(INVOICES.map((i) => [i.id, i])),
};

// 5a. Status map + row shape + ordering.
const ROWS = reg.registerRows(PAYMENTS, LOOKUPS);
A.equal(ROWS.length, 14, 'every ledger row lists');
A.equal(ROWS.find((r) => r.payment_id === 'pB').status, 'posted', 'recorded → posted');
A.equal(ROWS.find((r) => r.payment_id === 'pR2').status, 'refunded', 'refunded → refunded');
A.equal(ROWS.find((r) => r.payment_id === 'pV').status, 'void', 'void → void');
A.equal(ROWS.find((r) => r.payment_id === 'pPend').status, 'pending', 'unknown status → pending bucket (never dropped)');
A.equal(ROWS[0].payment_id, 'pC', 'newest paid_date first');
A.equal(ROWS[ROWS.length - 1].payment_id, 'pPend', 'undated row sorts last');
A.equal(ROWS.find((r) => r.payment_id === 'pB').deposited, true, 'batch id → deposited');
A.equal(ROWS.find((r) => r.payment_id === 'pU').deposited, false, 'no batch → undeposited');
A.equal(ROWS.find((r) => r.payment_id === 'pR2').is_refund, true, 'negative row flagged refund');
A.equal(ROWS.find((r) => r.payment_id === 'pCM').is_refund, true, 'credit memo negative also refund-flagged');
A.equal(ROWS.find((r) => r.payment_id === 'pB').customer_name, 'Acme Sign Co', 'customer lookup resolves');
A.equal(ROWS.find((r) => r.payment_id === 'pB').invoice_number, 'INV-001', 'invoice lookup resolves');
A.equal(ROWS.find((r) => r.payment_id === 'pNoDate').date, '2026-10-14', 'paid_date falls back to created_date day');

// 5b. registerTotals — the reconcile: buckets partition, void out of pools.
const T = reg.registerTotals(ROWS);
A.equal(T.count, 14);
A.equal(T.total_cents, 173100, 'signed total over ALL shown rows (incl void +99900)');
A.equal(T.deposited_cents, 33000, 'deposited = net of batched non-void rows');
A.equal(T.undeposited_cents, 40200, 'undeposited = net of unbatched non-void rows');
A.equal(T.deposited_cents + T.undeposited_cents, T.total_cents - 99900, 'pools = total − void slice (void excluded from net)');
A.equal(T.by_method.check.total_cents, 22500, 'method bucket: checks');
A.equal(T.by_method.cash.total_cents, 8000);
A.equal(T.by_method.card.total_cents, 31000, 'card net includes the −3000 refund');
A.equal(T.by_method.ach.total_cents, 13500);
A.equal(T.by_method.credit_memo.total_cents, -2500, 'credit memo bucket carries the negative');
A.equal(T.by_method.other.total_cents, 100600);
A.equal(T.by_status.posted.total_cents, 75700);
A.equal(T.by_status.refunded.total_cents, -3000);
A.equal(T.by_status.void.total_cents, 99900);
A.equal(T.by_status.pending.total_cents, 500);
const bucketSum = (bag) => Object.values(bag).reduce((s, b) => s + b.total_cents, 0);
A.equal(bucketSum(T.by_method), T.total_cents, 'method buckets partition the total');
A.equal(bucketSum(T.by_status), T.total_cents, 'status buckets partition the total');
A.equal(Object.values(T.by_method).reduce((s, b) => s + b.count, 0), T.count, 'method counts partition');

// 5c. filterRegister — every axis.
A.deepEqual(reg.filterRegister(ROWS, { method: 'check' }).map((r) => r.payment_id), ['pOld', 'pB', 'pA'], 'method filter');
A.equal(reg.filterRegister(ROWS, { q: 'CK-4471' })[0].payment_id, 'pB', 'reference-number search');
A.equal(reg.filterRegister(ROWS, { q: 'acme ck-4471' }).length, 1, 'multi-token AND search');
A.deepEqual(reg.filterRegister(ROWS, { from: '2026-10-10', to: '2026-10-20' }).map((r) => r.payment_id).sort(), ['pB', 'pC4', 'pC5', 'pNoDate', 'pR2', 'pV', 'pZ'], 'date range inclusive');
A.deepEqual(reg.filterRegister(ROWS, { batch_status: 'deposited' }).map((r) => r.payment_id), ['pR2', 'pB', 'pB2'], 'deposited = batched non-empty');
A.deepEqual(reg.filterRegister(ROWS, { batch_status: 'B1' }).map((r) => r.payment_id), ['pR2', 'pB', 'pB2'], 'exact batch id filter');
A.equal(reg.filterRegister(ROWS, { batch_status: 'undeposited' }).length, 11, 'unbatched includes the void row (filter is deposit-state only)');
A.deepEqual(reg.filterRegister(ROWS, { customer_id: 'c2' }).map((r) => r.payment_id), ['pR2', 'pB2'], 'customer filter');

// 5d. Request builders — server-parity guards + deterministic keys.
{
  const ok = reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 2000, method: 'check', ref: { reference_number: 'CK-5000', paid_date: '2026-10-31', notes: 'mailed' }, actor_id: 'brett' });
  A.equal(ok.ok, true);
  A.deepEqual(ok.payload, {
    action: 'record_payment', invoice_id: 'i3',
    creation_request_key: ok.payload.creation_request_key,
    amount: 20, method: 'check', paid_date: '2026-10-31',
    reference_number: 'CK-5000', notes: 'mailed',
  }, 'record_payment wire shape (dollars back over the wire)');
  A.match(ok.payload.creation_request_key, /^payment:i3:2000:check:CK-5000:2026-10-31:/, 'deterministic request key carries the logical inputs');
  const again = reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 2000, method: 'check', ref: { reference_number: 'CK-5000', paid_date: '2026-10-31' }, actor_id: 'brett' });
  A.equal(again.payload.creation_request_key, ok.payload.creation_request_key, 'same inputs → same key (server-side dedupe)');
  A.equal(reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 2000, method: 'check', ref: 'CK-5000', actor_id: 'ops' }).payload.creation_request_key !== ok.payload.creation_request_key, true, 'different actor → different key');

  A.equal(reg.receivePaymentPatch({ invoice: null, amount_cents: 100 }).error, 'Invoice is required.');
  A.match(reg.receivePaymentPatch({ invoice: { id: 'i7', status: 'paid' }, amount_cents: 100 }).error, /sent or partially paid/, 'non-open invoice rejected');
  A.equal(reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 0 }).error, 'Payment amount must be positive.');
  A.equal(reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 6000 }).error, 'Payment exceeds the open balance of $50.00.', 'over-payment rejected (over-application guard)');
  A.match(reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 100, method: 'credit_memo' }).error, /method must be one of/, 'credit_memo not recordable (backend-stamped only)');
  A.equal(reg.receivePaymentPatch({ invoice: { id: 'i3', status: 'sent', balance_due: 50 }, amount_cents: 2000, ref: { creation_request_key: 'attempt-uuid-1' } }).payload.creation_request_key, 'attempt-uuid-1', 'explicit attempt key wins');
  A.equal(reg.paymentRequestKey('i', 1, 'm', 'r', 'd', 'a').length <= 256, true, 'key capped at 256 chars');

  const rp = reg.refundPatch({ payment: { id: 'pB2', status: 'recorded', amount: 300 }, amount_cents: 3000, reason: 'oops', actor_id: 'brett' });
  A.equal(rp.ok, true);
  A.deepEqual(rp.payload, { action: 'refund_payment', payment_id: 'pB2', creation_request_key: rp.payload.creation_request_key, amount: 30, reason: 'oops', restock: false }, 'refund_payment wire shape');
  A.match(rp.payload.creation_request_key, /^refund:pB2:3000:oops:/);
  const capped = reg.refundPatch({ payment: { id: 'pB2', status: 'recorded', amount: 300 }, amount_cents: 30000, reason: { reason: 'x', payments: [{ id: 'pB2', status: 'recorded', amount: 300 }, { id: 'pR2', status: 'refunded', amount: -30, refund_of_payment_id: 'pB2' }] } });
  A.equal(capped.error, 'Refund exceeds the refundable amount of $270.00.', 'sibling-aware cap: over-refund rejected');
  const partial = reg.refundPatch({ payment: { id: 'pB2', status: 'recorded', amount: 300 }, reason: { payments: [{ id: 'pB2', status: 'recorded', amount: 300 }, { id: 'pR2', status: 'refunded', amount: -30, refund_of_payment_id: 'pB2' }] } });
  A.equal(partial.payload.amount, 270, 'no amount → defaults to the refundable remainder');
  A.equal(reg.refundPatch({ payment: { id: 'pR2', status: 'refunded', amount: -30 } }).error, 'Only recorded payments can be refunded.');
  A.equal(reg.refundPatch({ payment: { id: 'pB2', status: 'recorded', amount: 300 }, reason: { payments: [{ id: 'pB2', status: 'recorded', amount: 300 }, { id: 'pX', status: 'refunded', amount: -300, refund_of_payment_id: 'pB2' }] } }).error, 'This payment is already fully refunded or credited.');
}

// ===========================================================================
// SECTION 6 — Batch variance vs sum-of-rows + threshold detection
// ===========================================================================
// 6a. ReconciliationBatch entity contract.
A.deepEqual(RCB.required, ['batch_number', 'closed_at']);
for (const f of ['expected_total', 'collected_total', 'cash_adjustment', 'variance', 'payment_ids', 'method_totals', 'batch_number', 'closed_at', 'location', 'created_by']) {
  A.ok(f in RCB.properties, `ReconciliationBatch declares ${f}`);
}
A.deepEqual(RCB.properties.status.enum, ['open', 'closed', 'reopened'], 'reopened = immutable audit-stub status (reopen_batch admin flow)');
for (const op of ['create', 'read', 'update', 'delete']) {
  A.equal(RCB.rls[op].user_condition.role, '__reconciliationbatch_backend_only__', `rls.${op} backend-only`);
}

// 6b. Batch totals reconcile to the swept register rows (sum-of-rows check).
const BATCH1 = {
  id: 'B1', batch_number: 'REC-0042', status: 'closed', closed_at: '2026-10-30T18:00:00Z',
  location: 'Front', payment_ids: ['pB', 'pB2', 'pR2'],
  expected_total: 330, collected_total: 330.15, cash_adjustment: 0, variance: 0.15,
};
{
  const swept = ROWS.filter((r) => BATCH1.payment_ids.includes(r.payment_id) && r.status !== 'void');
  const sweptCents = swept.reduce((s, r) => s + r.amount_cents, 0);
  A.equal(sweptCents, 33000, 'register deposited rows for B1 net $330.00');
  A.equal(Math.round(BATCH1.expected_total * 100), sweptCents, 'expected_total == Σ swept register rows');
  const computedVariance = Math.round((BATCH1.collected_total + BATCH1.cash_adjustment - BATCH1.expected_total) * 100);
  A.equal(Math.round(BATCH1.variance * 100), computedVariance, 'stored variance == collected + adj − expected');
  A.equal(computedVariance, 15, 'batch is 15¢ over');
}

// 6c. varianceAlerts — detection, thresholds, direction, open-skip.
{
  const alerts = al.varianceAlerts([
    BATCH1,
    { id: 'B2', batch_number: 'REC-0043', status: 'closed', closed_at: '2026-10-30T19:00:00Z', expected_total: 200, collected_total: 201, cash_adjustment: 0.5 }, // computed 1.50 over
    { id: 'B3', batch_number: 'REC-0044', status: 'open', closed_at: '2026-10-30T20:00:00Z', variance: 9 },   // open → skipped
    { id: 'B4', batch_number: 'REC-0045', status: 'closed', closed_at: '2026-10-30T21:00:00Z', expected_total: 100, collected_total: 100, variance: 0 },
    { id: 'B5', batch_number: 'REC-0046', status: 'closed', closed_at: '2026-10-29T18:00:00Z', expected_total: 100, collected_total: 99.5 },
  ]);
  A.equal(alerts.length, 3, 'closed non-zero batches flag (open + zero skipped)');
  A.equal(alerts[0].source_id, 'B2', 'newest close first');
  const b1 = alerts.find((a) => a.source_id === 'B1');
  A.equal(b1.kind, 'batch_variance');
  A.match(b1.title, /REC-0042 over \$0\.15/, 'over direction + amount');
  A.ok(b1.message.includes('Front'), 'location in message');
  A.equal(b1.deep_link, '/Reconciliation');
  A.equal(alerts.find((a) => a.source_id === 'B2').title.includes('over $1.50'), true, 'variance computed from parts when stored field absent');
  A.match(alerts.find((a) => a.source_id === 'B5').title, /short \$0\.50/, 'short direction');
  A.equal(al.varianceAlerts([BATCH1], { threshold_cents: 20 }).length, 0, 'threshold suppresses sub-threshold variance');
  A.equal(al.varianceAlerts([BATCH1], { threshold_cents: 15 }).length, 1, '|variance| ≥ threshold inclusive');
}

// 6d. unbatchedAlert ↔ register undeposited pool reconciliation.
{
  const alert = al.unbatchedAlert(PAYMENTS, { now: NOW });
  A.ok(alert && !Array.isArray(alert), 'grouped single alert');
  A.equal(alert.count, 8, 'stale positive unbatched rows (zero/negative/void/batched excluded)');
  A.equal(alert.total_cents, 42700, 'alert total $427.00');
  A.match(alert.message, /\$427\.00 awaiting deposit · oldest 2026-09-25 · over 2d old/);
  A.equal(alert.created_at, '2026-09-25T00:00:00.000Z', 'oldest row anchors');
  // Reconcile vs the register's undeposited positive stale pool.
  const cutoff = Date.parse(NOW) - 2 * 86400000;
  const pool = ROWS.filter((r) => r.status !== 'void' && !r.deposited && r.amount_cents > 0)
    .filter((r) => !r.date || Date.parse(`${r.date}T00:00:00Z`) <= cutoff);
  A.equal(pool.reduce((s, r) => s + r.amount_cents, 0), alert.total_cents, 'alert total == register undeposited positive stale pool');
  A.equal(pool.length, alert.count, 'row counts tie');
  A.equal(al.unbatchedAlert(PAYMENTS.map((p) => ({ ...p, reconciliation_batch_id: 'BX' })), { now: NOW }), null, 'all batched → null (nothing to alert)');
}

// ===========================================================================
// SECTION 7 — Cross-model + entity contract sweep
// ===========================================================================
// 7a. Invoice + Payment schemas declare the fields the models rely on.
A.ok('income_account_splits' in INV_SCHEMA.properties, 'Invoice.income_account_splits declared (I-02)');
A.equal(INV_SCHEMA.properties.income_account_splits.items.properties.income_account_code.type, 'string');
A.equal(INV_SCHEMA.properties.income_account_splits.items.properties.amount.type, 'number');
for (const f of ['splits_override', 'splits_override_by', 'splits_override_at', 'splits_override_reason', 'credit_applied', 'deposit_applied', 'statement_batch_id', 'tax_amount', 'balance_due', 'amount_paid']) {
  A.ok(f in INV_SCHEMA.properties, `Invoice declares ${f}`);
}
A.deepEqual(PAY_SCHEMA.required, ['invoice_id', 'amount'], 'Payment required fields');
A.deepEqual(PAY_SCHEMA.properties.method.enum, [...reg.PAYMENT_METHODS_ALL], 'Payment.method enum == register display list (incl credit_memo)');
A.deepEqual(PAY_SCHEMA.properties.status.enum, ['recorded', 'void', 'refunded'], 'Payment.status enum');
for (const f of ['reconciliation_batch_id', 'refund_of_payment_id', 'refunded_amount', 'creation_request_key', 'gl_memo', 'paid_date', 'customer_id']) {
  A.ok(f in PAY_SCHEMA.properties, `Payment declares ${f}`);
}
A.equal(PAY_SCHEMA.properties.status.enum.includes('pending'), false, 'no pending entity status — register bucket is a display-side catch-all');
for (const op of ['create', 'read', 'update', 'delete']) {
  A.equal(PAY_SCHEMA.rls[op].user_condition.role, '__payment_backend_only__', `Payment rls.${op} backend-only (register reads via invoicingAction)`);
}
A.deepEqual(reg.PAYMENT_METHODS, ['cash', 'check', 'card', 'ach', 'financing', 'other'], 'recordable methods exclude credit_memo');
A.deepEqual(reg.OPEN_AR_STATUSES, ['sent', 'partially_paid'], 'open AR statuses mirror invoicingAction');

// 7b. GL chain → export chain end-to-end: computed splits → storage → journal.
{
  const fresh = gl.computeInvoiceSplits(I1, { partsByKey: PARTS, default_income_account_id: '4000' });
  const stored = gl.splitsToStorage(fresh);
  A.deepEqual(stored, I1.income_account_splits, 'storage rows match what the invoice carries');
  const journal = exp.invoiceExportRows({ ...I1, income_account_splits: stored }, CFG);
  A.equal(sumCr(journal) - 780, gl.incomeBaseCents(I1), 'journal income credits == GL income base');
  A.equal(sumDr(journal), sumCr(journal), 'chain journal balances');
  // And the round-trip read model agrees.
  const rich = gl.splitsFromStorage({ ...I1, income_account_splits: stored });
  A.equal(sumCents(rich), 10000, 'storage round-trip preserves cents');
}

// 7c. Export batch ↔ register reconciliation (same period, same ledger).
{
  const paymentRowsInPeriod = ROWS.filter((r) => r.date >= '2026-10-01' && r.date <= '2026-10-31' && r.status !== 'void' && r.amount_cents !== 0);
  A.equal(paymentRowsInPeriod.length, BATCH.counts.payments, 'register rows in period == exported payment journals');
  // AR-side net in the export ties to the register's signed net for the
  // period: receipts credit AR gross, refunds/credit memos debit it back.
  const arNet = BATCH.rows.filter((r) => r.role === 'ar' && ['payment_received', 'refund'].includes(r.type))
    .reduce((s, r) => s + r.credit_cents - r.debit_cents, 0);
  const regNet = paymentRowsInPeriod.reduce((s, r) => s + r.amount_cents, 0);
  A.equal(regNet, 57700, 'register October net $577.00 across all tenders');
  A.equal(arNet, regNet, 'export AR legs net to the register ledger ($577.00)');
}

// 7d. Alert dedupe identity across the suite.
A.equal(al.alertDedupeKey('batch_variance', 'B1'), 'acctalert:batch_variance:B1', 'alert dedupe key format');
{
  const feed = al.accountingAlertFeed({
    payments: PAYMENTS,
    batches: [BATCH1],
    invoices: [{ id: 'iX', invoice_number: 'INV-X', status: 'sent', income_account_splits: [{ income_account_code: '', amount: 25 }], issue_date: '2026-10-10' }],
  }, { now: NOW });
  const ids = feed.map((a) => a.id);
  A.equal(new Set(ids).size, ids.length, 'feed ids unique (dedupe keys collide-free)');
  A.ok(ids.includes('acctalert:batch_variance:B1') && ids.includes('acctalert:unbatched_payments:open') && ids.includes('acctalert:gl_unmapped:iX'), 'feed carries variance + unbatched + unmapped');
  const sorted = [...feed].sort((a, b) => b.created_at.localeCompare(a.created_at));
  A.deepEqual(ids, sorted.map((a) => a.id), 'feed newest-first');
}

// ── cleanup + result ───────────────────────────────────────────────────────
for (const f of TMP) rmSync(f, { force: true });
console.log(`PASS accounting-suite (${ASSERTS} assertions)`);
