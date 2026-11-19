import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-accounting-export.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/accountingExportModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  EXPORT_ROW_TYPES, POSTED_INVOICE_STATUSES,
  toCents, fromCents, incomeBaseCents, invoiceDateOf, paymentDateOf,
  accountCodeFor, invoiceExportRows, paymentExportRows, exportBatch,
  toCsv, toIifDraft, journalBalance, reconcileBatch,
} = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// Config + fixtures — October 2026 period.
// ---------------------------------------------------------------------------
const CFG = {
  defaultIncome: '4000',
  taxAccount: '2100',
  arAccount: '1100',
  bankAccount: '1000',
  undepositedAccount: '1200',
  feeAccount: '6100',
  depositAccount: '2200',
  creditAccount: '2300',
};
const sumDr = (rows) => rows.reduce((s, r) => s + r.debit_cents, 0);
const sumCr = (rows) => rows.reduce((s, r) => s + r.credit_cents, 0);

// --- constants ---------------------------------------------------------------
assert.deepEqual([...EXPORT_ROW_TYPES], ['invoice_income', 'invoice_tax', 'payment_received', 'payment_fee', 'refund']);
assert.deepEqual(POSTED_INVOICE_STATUSES, ['sent', 'partially_paid', 'paid']);
assert.equal(toCents('1,234.56'), 123456, 'decorated money parses');
assert.equal(toCents('$5.00'), 500);
assert.equal(toCents('INV-001'), 0, 'letter-laden string rejected');
assert.equal(toCents(-2.5), -250, 'negative dollars → negative cents');
assert.equal(fromCents(12345), 123.45);

// --- date chains -------------------------------------------------------------
assert.equal(invoiceDateOf({ invoice_date: '2026-10-01', issue_date: '2026-10-05' }), '2026-10-01', 'invoice_date wins');
assert.equal(invoiceDateOf({ issue_date: '2026-10-05', created_date: '2026-10-01T09:00:00Z' }), '2026-10-05');
assert.equal(invoiceDateOf({ created_date: '2026-10-25T10:00:00Z' }), '2026-10-25', 'ISO prefix → day');
assert.equal(paymentDateOf({ paid_date: '2026-10-12' }), '2026-10-12');
assert.equal(paymentDateOf({ created_date: '2026-10-12T23:00:00Z' }), '2026-10-12');

// --- invoiceExportRows: balanced journal -------------------------------------
const inv1 = {
  id: 'i1', invoice_number: 'INV-001', status: 'sent', issue_date: '2026-10-05',
  customer_display_name: 'Acme Signs',
  subtotal: 100, discount_amount: 0, tax_rate: 0.078, tax_amount: 7.8, total: 107.8,
  income_account_splits: [
    { income_account_code: '4100', amount: 60 },
    { income_account_code: '4200', amount: 40 },
  ],
};
const rows1 = invoiceExportRows(inv1, CFG);
assert.equal(rows1.length, 4, 'AR + 2 income + tax');
assert.equal(sumDr(rows1), sumCr(rows1), 'journal balances');
assert.equal(sumDr(rows1), 10780, 'AR debit = total');
assert.equal(rows1[0].account_code, '1100', 'AR resolves from config');
assert.equal(rows1[0].type, 'invoice_income');
assert.equal(rows1[0].role, 'ar');
assert.equal(rows1[0].date, '2026-10-05');
assert.equal(rows1[0].ref, 'INV-001');
assert.equal(rows1[0].customer, 'Acme Signs');
assert.equal(rows1[0].entity_id, 'i1');
assert.deepEqual(rows1.filter(r => r.role === 'income').map(r => [r.account_code, r.credit_cents]), [['4100', 6000], ['4200', 4000]], 'split credits posted per account');
assert.equal(rows1.find(r => r.role === 'tax').account_code, '2100');
assert.equal(rows1.find(r => r.role === 'tax').type, 'invoice_tax');
assert.equal(rows1.find(r => r.role === 'tax').credit_cents, 780);
assert.ok(rows1.every(r => r.debit_cents >= 0 && r.credit_cents >= 0), 'no negative legs');

// deposit_applied: extra DR leg keeps the journal balanced
const invDep = { ...inv1, id: 'i2', invoice_number: 'INV-002', deposit_applied: 20, total: 87.8 };
const rowsDep = invoiceExportRows(invDep, CFG);
assert.equal(sumDr(rowsDep), sumCr(rowsDep), 'deposit journal balances');
assert.equal(rowsDep.find(r => r.role === 'deposit').debit_cents, 2000, 'deposit slice debits deposits-held');
assert.equal(rowsDep.find(r => r.role === 'ar').debit_cents, 8780, 'AR nets out deposit');
assert.equal(rowsDep.find(r => r.role === 'deposit').account_code, '2200');

// rich-split spelling + negative split flips to debit leg
const invNeg = {
  id: 'i3', invoice_number: 'INV-003', status: 'paid', issue_date: '2026-10-07',
  subtotal: 50, tax_amount: 0, total: 50,
};
const rowsNeg = invoiceExportRows(invNeg, { ...CFG, splits: [{ account_id: '4100', amount_cents: 6000 }, { account_id: '4500', amount_cents: -1000 }] });
assert.equal(sumDr(rowsNeg), sumCr(rowsNeg), 'contra split journal balances');
const contra = rowsNeg.find(r => r.account_code === '4500');
assert.equal(contra.debit_cents, 1000, 'negative split posts as a debit leg');
assert.equal(contra.credit_cents, 0);

// no splits stored → income base falls to defaultIncome
const invNoSplits = { ...inv1, id: 'i4', invoice_number: 'INV-004', income_account_splits: [] };
const rowsNS = invoiceExportRows(invNoSplits, CFG);
const incomeRow = rowsNS.find(r => r.role === 'income');
assert.equal(incomeRow.account_code, '4000', 'unmapped split falls to defaultIncome');
assert.equal(incomeRow.credit_cents, 10000, 'income base = subtotal − discount + fees');
assert.equal(sumDr(rowsNS), sumCr(rowsNS));

// status gating
assert.equal(invoiceExportRows({ ...inv1, status: 'draft' }, CFG).length, 0, 'draft never bills');
assert.equal(invoiceExportRows({ ...inv1, status: 'mystery' }, CFG).length, 0, 'unknown status fails closed');
assert.equal(invoiceExportRows(null, CFG).length, 0, 'non-object → []');

// void → mirror-image reversal
const rowsVoid = invoiceExportRows({ ...inv1, status: 'void' }, CFG);
assert.equal(sumDr(rowsVoid), sumCr(rowsVoid), 'void reversal balances');
assert.equal(rowsVoid.find(r => r.role === 'ar').credit_cents, 10780, 'void credits AR back');
assert.equal(rowsVoid.filter(r => r.role === 'income').every(r => r.debit_cents > 0), true, 'void debits income');
assert.ok(rowsVoid.every(r => /void/i.test(r.memo)), 'void memo marks reversal');

// --- paymentExportRows ---------------------------------------------------------
const pay1 = { id: 'p1', invoice_id: 'i1', amount: 50, method: 'card', status: 'recorded', paid_date: '2026-10-12', reference_number: 'AUTH-9', customer_id: 'c1' };
const prows = paymentExportRows(pay1, { ...CFG, invoice: inv1 });
assert.equal(prows.length, 2, 'bank DR + AR CR (no fee)');
assert.equal(prows[0].role, 'bank');
assert.equal(prows[0].debit_cents, 5000);
assert.equal(prows[0].account_code, '1000', 'card → configured bank');
assert.equal(prows[1].role, 'ar');
assert.equal(prows[1].credit_cents, 5000);
assert.equal(prows[1].type, 'payment_received');
assert.equal(prows[0].ref, 'PMT-p1');
assert.match(prows[0].memo, /card #AUTH-9/);

// cash → undeposited funds preference
const prowsCash = paymentExportRows({ ...pay1, method: 'cash' }, { ...CFG, invoice: inv1 });
assert.equal(prowsCash[0].account_code, '1200', 'cash prefers undeposited funds');
// explicit bank_account_id wins
const prowsBank = paymentExportRows({ ...pay1, method: 'cash' }, { ...CFG, bank_account_id: '1010', invoice: inv1 });
assert.equal(prowsBank[0].account_code, '1010', 'explicit opt wins the chain');

// fee: DR net + DR fee = CR gross
const payFee = { ...pay1, id: 'p2', amount: 100, fee_amount: 3 };
const frows = paymentExportRows(payFee, { ...CFG, invoice: inv1 });
assert.equal(frows.length, 3);
assert.equal(frows.find(r => r.role === 'bank').debit_cents, 9700, 'bank nets the fee');
const feeRow = frows.find(r => r.type === 'payment_fee');
assert.equal(feeRow.debit_cents, 300);
assert.equal(feeRow.account_code, '6100');
assert.equal(frows.find(r => r.role === 'ar').credit_cents, 10000, 'AR credits gross');
assert.equal(sumDr(frows), sumCr(frows), 'fee journal balances');

// refund row: DR AR · CR bank(gross+fee)
const refund = { id: 'p3', invoice_id: 'i1', amount: -25, method: 'card', status: 'refunded', refund_of_payment_id: 'p1', paid_date: '2026-10-14', fee_amount: 1 };
const rrows = paymentExportRows(refund, { ...CFG, invoice: inv1 });
assert.equal(rrows.find(r => r.role === 'ar').debit_cents, 2500);
assert.equal(rrows.find(r => r.role === 'bank').credit_cents, 2600, 'bank loses principal + fee');
assert.equal(rrows.find(r => r.type === 'payment_fee').debit_cents, 100);
assert.equal(rrows[0].ref, 'RF-p3');
assert.equal(sumDr(rrows), sumCr(rrows), 'refund journal balances');

// credit memo: contra = credit liability, NOT bank
const memo = { id: 'p4', invoice_id: 'i1', amount: -10, method: 'credit_memo', status: 'recorded', paid_date: '2026-10-15' };
const mrows = paymentExportRows(memo, { ...CFG, invoice: inv1 });
assert.equal(mrows.length, 2);
assert.equal(mrows[0].role, 'ar');
assert.equal(mrows[1].role, 'credit');
assert.equal(mrows[1].account_code, '2300', 'credit memo posts to customer credits');
assert.equal(mrows[0].ref, 'CM-p4');
assert.equal(mrows[0].type, 'refund');
assert.equal(sumDr(mrows), sumCr(mrows));

// void/zero payments post nothing
assert.equal(paymentExportRows({ ...pay1, status: 'void' }, CFG).length, 0);
assert.equal(paymentExportRows({ ...pay1, amount: 0 }, CFG).length, 0);
assert.equal(paymentExportRows('x', CFG).length, 0);

// --- accountCodeFor chain ------------------------------------------------------
assert.equal(accountCodeFor({ account_code: '4500' }, CFG), '4500', 'row explicit wins');
assert.equal(accountCodeFor({ gl_account: '4600' }, CFG), '4600', 'gl_account spelling');
assert.equal(accountCodeFor({ role: 'ar' }, CFG), '1100', 'role → config slot');
assert.equal(accountCodeFor({ role: 'tax' }, CFG), '2100');
assert.equal(accountCodeFor({ type: 'payment_fee' }, CFG), '6100', 'type → config slot');
assert.equal(accountCodeFor({ role: 'income' }, { default_income_account_id: '4000' }), '4000', 'snake_case alias');
assert.equal(accountCodeFor({ role: 'bank' }, { bank_account_id: '1000' }), '1000');
assert.equal(accountCodeFor({ role: 'income' }, { defaultIncome: { code: '4100', name: 'Sign Income' } }), '4100', 'row config → code');
assert.equal(accountCodeFor({ role: 'mystery' }, CFG), '', 'unknown role → unmapped');
assert.equal(accountCodeFor({}, { defaultAccount: '9999' }), '9999', 'catch-all');
assert.equal(accountCodeFor({}, {}), '', 'nothing resolves → empty');

// --- exportBatch ---------------------------------------------------------------
const invoices = [
  inv1,
  { id: 'i9', invoice_number: 'INV-009', status: 'sent', issue_date: '2026-10-20', customer_display_name: 'Beta Co', subtotal: 40, tax_amount: 0, total: 40, income_account_splits: [{ income_account_code: '4000', amount: 40 }] },
  { id: 'i10', invoice_number: 'INV-010', status: 'sent', issue_date: '2026-11-02', subtotal: 9, tax_amount: 0, total: 9 }, // after period
  { id: 'i11', invoice_number: 'INV-011', status: 'draft', issue_date: '2026-10-10', subtotal: 5, total: 5 }, // draft
  { id: 'i12', invoice_number: 'INV-012', status: 'sent', subtotal: 7, total: 7 }, // undated
  { id: 'i13', invoice_number: 'INV-013', status: 'sent', issue_date: '2026-10-22', subtotal: 10, tax_amount: 1, total: 11, income_account_splits: [{ income_account_code: '4000', amount: 8 }] }, // splits don't foot → unbalanced
];
const payments = [
  pay1,
  refund,
  memo,
  { id: 'p5', invoice_id: 'i9', amount: 20, method: 'check', status: 'recorded', paid_date: '2026-10-25' }, // check → undeposited
  { id: 'p6', invoice_id: 'ghost', amount: 5, method: 'cash', status: 'recorded', paid_date: '2026-10-26' }, // invoice out of period/missing
  { id: 'p7', invoice_id: 'i1', amount: 5, method: 'cash', status: 'void', paid_date: '2026-10-26' },
  { id: 'p8', invoice_id: 'i1', amount: 5, method: 'cash', status: 'recorded', paid_date: '2026-12-01' }, // out of period
];
const batch = exportBatch(invoices, payments, { from: '2026-10-01', to: '2026-10-31', ...CFG });

assert.equal(batch.period.from, '2026-10-01');
assert.equal(batch.period.to, '2026-10-31');
assert.equal(batch.counts.invoices, 3, 'INV-001 + INV-009 + unbalanced INV-013');
assert.equal(batch.counts.payments, 5, 'pay1 + refund + memo + check + ghost-invoice cash');
assert.deepEqual(batch.unbalanced_refs, ['INV-013'], 'non-footing splits flagged, journal still emitted');
assert.equal(batch.balanced, false, 'unbalanced journal → batch unbalanced');
assert.ok(batch.totals.debit_cents !== batch.totals.credit_cents);
// sorted by (date, ref)
const dates = batch.rows.map(r => `${r.date}|${r.ref}`);
assert.deepEqual([...dates].sort(), dates, 'rows sorted date then ref');
// check payment → undeposited account
const p5bank = batch.rows.find(r => r.entity_id === 'p5' && r.role === 'bank');
assert.equal(p5bank.account_code, '1200', 'check prefers undeposited');
// ghost-invoice payment still exports, memo degrades gracefully
const p6rows = batch.rows.filter(r => r.entity_id === 'p6');
assert.equal(p6rows.length, 2);
assert.match(p6rows[0].memo, /ghost|Payment/);
// skipped bookkeeping
const skipReasons = Object.fromEntries(batch.skipped.map(s => [s.ref, s.reason]));
assert.equal(skipReasons['INV-011'], 'draft');
assert.equal(skipReasons['INV-012'], 'undated');
assert.equal(skipReasons['INV-010'], 'out_of_period');
assert.equal(skipReasons['p7'], 'void');
assert.equal(skipReasons['p8'], 'out_of_period');

// clean batch (drop the unbalanced invoice) → balanced
const cleanBatch = exportBatch(invoices.filter(i => i.id !== 'i13'), payments, { from: '2026-10-01', to: '2026-10-31', ...CFG });
assert.equal(cleanBatch.balanced, true);
assert.equal(cleanBatch.totals.debit_cents, cleanBatch.totals.credit_cents);
assert.deepEqual(cleanBatch.unbalanced_refs, []);

// unmapped refs surface
const noCfg = exportBatch([inv1], [], { arAccount: '1100' });
assert.ok(noCfg.unmapped_refs.includes('INV-001'), 'unconfigured tax account → unmapped_refs');
assert.equal(noCfg.rows.find(r => r.role === 'ar').account_code, '1100');
assert.equal(noCfg.rows.find(r => r.role === 'income').account_code, '4100', 'stored split codes post as-is');
assert.equal(noCfg.rows.find(r => r.role === 'tax').account_code, '', 'tax unresolved without taxAccount');
// no-splits invoice + no defaultIncome → income leg is truly unmapped
const noCfg2 = exportBatch([{ id: 'i4', invoice_number: 'INV-004', status: 'sent', issue_date: '2026-10-05', subtotal: 10, tax_amount: 0, total: 10 }], [], { arAccount: '1100' });
assert.equal(noCfg2.rows.find(r => r.role === 'income').account_code, '');
assert.ok(noCfg2.unmapped_refs.includes('INV-004'));

// accountsByCode enriches names (map form + array form)
const named = exportBatch([inv1], [], { ...CFG, accountsByCode: { '4100': { code: '4100', name: 'Sign Income' } } });
assert.equal(named.rows.find(r => r.account_code === '4100').account_name, 'Sign Income');
const namedArr = exportBatch([inv1], [], { ...CFG, accountsByCode: [{ code: '4200', name: 'Service Income' }] });
assert.equal(namedArr.rows.find(r => r.account_code === '4200').account_name, 'Service Income');

// unbounded period includes undated rows; bounded excludes
const unbounded = exportBatch([{ id: 'i12', invoice_number: 'INV-012', status: 'sent', subtotal: 7, total: 7 }], [], CFG);
assert.equal(unbounded.counts.invoices, 1, 'unbounded → undated included');
assert.equal(unbounded.period.from, '');

// journalBalance + reconcileBatch
assert.deepEqual(journalBalance(rows1), { ok: true, debit_cents: 10780, credit_cents: 10780, delta_cents: 0 });
assert.equal(journalBalance(batch.rows.filter(r => r.ref === 'INV-013')).ok, false);
const recon = reconcileBatch(cleanBatch, { debit_cents: cleanBatch.totals.debit_cents, credit_cents: cleanBatch.totals.credit_cents, rows: cleanBatch.rows.length });
assert.equal(recon.ok, true);
assert.equal(reconcileBatch(cleanBatch, { debit_cents: 1 }).ok, false);

// --- toCsv ---------------------------------------------------------------------
const csv = toCsv(rows1);
const csvLines = csv.split('\n');
assert.equal(csvLines[0], 'date,ref,type,account,debit,credit,memo');
assert.equal(csvLines.length, 5);
assert.match(csvLines[1], /^2026-10-05,INV-001,invoice_income,1100,107\.80,,/);
assert.match(csvLines[2], /,4100,,60\.00,Invoice INV-001/, 'income split row: empty debit, dollar credit');
assert.equal(csvLines[2].split(',')[5], '60.00', 'credit column renders dollars');
const csvEsc = toCsv([{ date: '2026-10-05', ref: 'R,"Q"', type: 'refund', account_code: '1100', debit_cents: 100, credit_cents: 0, memo: 'line1\nline2 "quoted"', customer: 'x', entity_id: 'e' }]);
assert.match(csvEsc, /"R,""Q"""/, 'ref with comma+quote escaped');
assert.match(csvEsc, /"line1\nline2 ""quoted"""/, 'memo newline + quotes escaped');
assert.equal(toCsv(null), 'date,ref,type,account,debit,credit,memo');
// deterministic: same input → identical output
assert.equal(toCsv(batch.rows), toCsv(exportBatch(invoices, payments, { from: '2026-10-01', to: '2026-10-31', ...CFG }).rows), 'CSV deterministic');

// --- toIifDraft ------------------------------------------------------------------
const iif = toIifDraft(rows1);
const iifLines = iif.split('\n');
assert.equal(iifLines[0], '!TRNS\tTRNSID\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO');
assert.equal(iifLines[1], '!SPL\tSPLID\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO');
assert.equal(iifLines[2], '!ENDTRNS');
assert.match(iifLines[3], /^TRNS\t\t2026-10-05\t1100\tAcme Signs\t107\.80\tINV-001\t/);
assert.match(iifLines[4], /^SPL\t\t2026-10-05\t4100\tAcme Signs\t-60\.00\tINV-001\t/);
assert.equal(iifLines[iifLines.length - 1], 'ENDTRNS');
// each block sums to zero (debit−credit signed)
const amounts = iifLines.filter(l => l.startsWith('TRNS') || l.startsWith('SPL')).map(l => Number(l.split('\t')[5]));
assert.equal(Math.round(amounts.reduce((s, n) => s + n, 0) * 100) + 0, 0, 'IIF block nets to zero');
// multi-journal: two blocks
const iif2 = toIifDraft(cleanBatch.rows);
assert.equal(iif2.split('\n').filter(l => l === 'ENDTRNS').length, cleanBatch.counts.journals, 'one ENDTRNS per journal');
assert.match(toIifDraft([{ date: '2026-10-05', ref: 'X', type: 'invoice_income', account_code: '', debit_cents: 100, credit_cents: 0, memo: 'm', customer: '', entity_id: 'e' }]), /\(UNMAPPED\)/, 'blank account → (UNMAPPED)');

// --- cent-safe: 33/33/34-style apportionments stay exact -------------------------
const pennies = invoiceExportRows({
  id: 'i9', invoice_number: 'INV-P', status: 'sent', issue_date: '2026-10-09',
  subtotal: 0.03, tax_amount: 0.01, total: 0.04,
  income_account_splits: [{ income_account_code: '4000', amount: 0.01 }, { income_account_code: '4100', amount: 0.01 }, { income_account_code: '4200', amount: 0.01 }],
}, CFG);
assert.equal(sumDr(pennies), sumCr(pennies), 'penny-level journal ties');
assert.equal(Number.isInteger(sumDr(pennies)), true, 'all legs integer cents');
assert.ok(pennies.every(r => Number.isInteger(r.debit_cents) && Number.isInteger(r.credit_cents)));

rmSync(out, { force: true });
console.log('PASS accounting-export');
