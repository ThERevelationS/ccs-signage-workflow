import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-credit-terms.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/customer360/creditTermsModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  invoiceDueDate, creditUsage, creditLimitCheck, creditLimitBanner, applyInStoreCredit,
} = await import(pathToFileURL(out).href);

// --- invoiceDueDate: terms math ------------------------------------------------
{
  // Net 30 from a YYYY-MM-DD issue date.
  const d = invoiceDueDate({ customer: { credit_terms_days: 30 }, invoiceDate: '2026-01-15' });
  assert.equal(d.basis, 'terms');
  assert.equal(d.days, 30);
  assert.equal(d.due_date, '2026-02-14');
  // Month + year rollover.
  assert.equal(
    invoiceDueDate({ customer: { credit_terms_days: 45 }, invoiceDate: '2026-11-20' }).due_date,
    '2027-01-04',
  );
  // Net 1 across a year boundary.
  assert.equal(
    invoiceDueDate({ customer: { credit_terms_days: 1 }, invoiceDate: '2026-12-31' }).due_date,
    '2027-01-01',
  );
  // ISO datetime input normalizes to a date string.
  assert.equal(
    invoiceDueDate({ customer: { credit_terms_days: 10 }, invoiceDate: '2026-03-01T15:30:00Z' }).due_date,
    '2026-03-11',
  );
  // Date object input contributes its UTC calendar date.
  assert.equal(
    invoiceDueDate({ customer: { credit_terms_days: 7 }, invoiceDate: new Date(Date.UTC(2026, 0, 10)) }).due_date,
    '2026-01-17',
  );
  // Terms basis survives an unparseable/missing invoice date (due_date null).
  const noDate = invoiceDueDate({ customer: { credit_terms_days: 30 } });
  assert.equal(noDate.basis, 'terms');
  assert.equal(noDate.due_date, null);
  // Rollover garbage ('2026-02-31') is rejected, not silently rolled.
  assert.equal(
    invoiceDueDate({ customer: { credit_terms_days: 30 }, invoiceDate: '2026-02-31' }).due_date,
    null,
  );
}

// --- invoiceDueDate: receipt semantics ------------------------------------------
{
  // 0 / absent / negative terms and a missing customer → due-on-receipt.
  assert.deepEqual(
    invoiceDueDate({ customer: { credit_terms_days: 0 }, invoiceDate: '2026-01-15' }),
    { due_date: null, basis: 'receipt' },
  );
  assert.deepEqual(
    invoiceDueDate({ customer: {}, invoiceDate: '2026-01-15' }),
    { due_date: null, basis: 'receipt' },
  );
  assert.deepEqual(
    invoiceDueDate({ customer: { credit_terms_days: -15 }, invoiceDate: '2026-01-15' }),
    { due_date: null, basis: 'receipt' },
  );
  assert.deepEqual(invoiceDueDate({ invoiceDate: '2026-01-15' }), { due_date: null, basis: 'receipt' });
  assert.deepEqual(invoiceDueDate(), { due_date: null, basis: 'receipt' });
}

// --- creditUsage -----------------------------------------------------------------
const CUST = { id: 'cust-1', company_name: 'Acme Signs' };
const INVOICES = [
  { id: 'i1', customer_id: 'cust-1', status: 'sent', balance_due: 500 },
  { id: 'i2', customer_id: 'cust-1', status: 'partially_paid', balance_due: 120.55 },
  { id: 'i3', customer_id: 'cust-1', status: 'draft', balance_due: 75 },
  { id: 'i4', customer_id: 'cust-1', status: 'paid', balance_due: 0 },
  { id: 'i5', customer_id: 'cust-1', status: 'void', balance_due: 900 },
  { id: 'i6', customer_id: 'other', status: 'sent', balance_due: 300 },
  { id: 'i7', customer_id: 'cust-1', status: 'sent', balance_due: 0 },
  { id: 'i8', customer_id: 'cust-1', status: 'sent', balance_due: -20 },
  { id: 'i9', customer_id: 'cust-1', status: 'sent', balance_due: 400, deleted: true },
  { id: 'i10', customer_id: 'cust-1', balance_due: 25 }, // no status → counts
];
{
  const u = creditUsage({ customer: CUST, invoices: INVOICES, portalPending: 250 });
  assert.equal(u.openInvoiceBalance, 720.55); // 500 + 120.55 + 75 + 25
  assert.equal(u.portalPending, 250);
  assert.equal(u.totalUsage, 970.55);
  // No pending → invoices alone.
  assert.equal(creditUsage({ customer: CUST, invoices: INVOICES }).totalUsage, 720.55);
  // Blank inputs stay safe.
  assert.deepEqual(creditUsage({}), { openInvoiceBalance: 0, portalPending: 0, totalUsage: 0 });
  // A customer with no id matches nothing.
  assert.equal(
    creditUsage({ customer: { company_name: 'no id' }, invoices: INVOICES }).openInvoiceBalance,
    0,
  );
  // Negative pending clamps to 0.
  assert.equal(creditUsage({ customer: CUST, portalPending: -50 }).portalPending, 0);
  // A list of pending rows is summed by amount.
  const u2 = creditUsage({
    customer: CUST,
    invoices: [],
    portalPending: [{ amount: 30 }, { amount: 20.5 }, { amount: 5, deleted: true }, null],
  });
  assert.equal(u2.portalPending, 50.5);
  assert.equal(u2.totalUsage, 50.5);
}

// --- creditLimitCheck -------------------------------------------------------------
const LIMIT = { credit_limit: 1000 };
{
  // Under limit → ok.
  let r = creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 400 }, newAmount: 100 });
  assert.equal(r.severity, 'ok');
  assert.equal(r.over, false);
  assert.equal(r.current, 400);
  assert.equal(r.limit, 1000);
  assert.equal(r.projected, 500);
  // Boundary: current usage exactly AT the limit → warn (account is at cap).
  r = creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 1000 } });
  assert.equal(r.severity, 'warn');
  assert.equal(r.over, false);
  // Already over the limit → exceeded even with no new charge.
  r = creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 1200 }, newAmount: 0 });
  assert.equal(r.severity, 'exceeded');
  assert.equal(r.over, true);
  // New charge pushes projected over the limit → exceeded.
  r = creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 800 }, newAmount: 300 });
  assert.equal(r.severity, 'exceeded');
  assert.equal(r.over, true);
  assert.equal(r.projected, 1100);
  // Boundary: projected lands exactly ON the limit → not over, still ok.
  r = creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 600 }, newAmount: 400 });
  assert.equal(r.severity, 'ok');
  assert.equal(r.over, false);
  // Bare-number usage accepted.
  r = creditLimitCheck({ customer: LIMIT, usage: 950, newAmount: 100 });
  assert.equal(r.severity, 'exceeded');
  assert.equal(r.projected, 1050);
  // Over-limit already but a credit memo brings projected back under → warn.
  r = creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 1100 }, newAmount: -500 });
  assert.equal(r.severity, 'warn');
  assert.equal(r.over, false);
  assert.equal(r.projected, 600);
  // No configured limit → never warns, never over.
  r = creditLimitCheck({ customer: { credit_limit: 0 }, usage: { totalUsage: 99999 }, newAmount: 1 });
  assert.equal(r.severity, 'ok');
  assert.equal(r.over, false);
  r = creditLimitCheck({ customer: {}, usage: { totalUsage: 5 }, newAmount: 5 });
  assert.equal(r.severity, 'ok');
  // Negative limit is treated as unconfigured (reported as 0).
  r = creditLimitCheck({ customer: { credit_limit: -10 }, usage: { totalUsage: 5 } });
  assert.equal(r.severity, 'ok');
  assert.equal(r.limit, 0);
  // Empty call stays safe.
  r = creditLimitCheck();
  assert.equal(r.severity, 'ok');
  assert.equal(r.projected, 0);
}

// --- creditLimitBanner --------------------------------------------------------------
{
  // ok → hidden.
  let b = creditLimitBanner(
    creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 100 }, newAmount: 1 }),
  );
  assert.equal(b.show, false);
  assert.equal(b.text, '');
  // warn → amber with amounts in the message.
  b = creditLimitBanner(creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 1000 } }));
  assert.equal(b.show, true);
  assert.equal(b.tone, 'amber');
  assert.match(b.text, /credit limit/i);
  assert.match(b.text, /\$1,000\.00/);
  // exceeded → red, projected amount shown.
  b = creditLimitBanner(
    creditLimitCheck({ customer: LIMIT, usage: { totalUsage: 900 }, newAmount: 200 }),
  );
  assert.equal(b.show, true);
  assert.equal(b.tone, 'red');
  assert.match(b.text, /\$1,100\.00/);
  // Garbage inputs → hidden.
  assert.equal(creditLimitBanner(null).show, false);
  assert.equal(creditLimitBanner({}).show, false);
  assert.equal(creditLimitBanner('exceeded').show, false);
  // A bare { over: true } without severity still surfaces red.
  assert.equal(
    creditLimitBanner({ over: true, current: 1, limit: 1, projected: 2 }).tone,
    'red',
  );
}

// --- applyInStoreCredit ---------------------------------------------------------------
{
  // Credit covers the whole charge.
  let a = applyInStoreCredit({ customer: { in_store_credit: 200 }, amount: 150 });
  assert.equal(a.applied, 150);
  assert.equal(a.remainingCredit, 50);
  assert.equal(a.remainingAmount, 0);
  // Partial coverage.
  a = applyInStoreCredit({ customer: { in_store_credit: 60 }, amount: 150 });
  assert.equal(a.applied, 60);
  assert.equal(a.remainingCredit, 0);
  assert.equal(a.remainingAmount, 90);
  // Exact match.
  a = applyInStoreCredit({ customer: { in_store_credit: 100 }, amount: 100 });
  assert.equal(a.applied, 100);
  assert.equal(a.remainingCredit, 0);
  assert.equal(a.remainingAmount, 0);
  // Explicit creditBalance arg wins over customer fields.
  a = applyInStoreCredit({
    customer: { in_store_credit: 999, in_store_credit_balance: 10 },
    amount: 50,
    creditBalance: 30,
  });
  assert.equal(a.applied, 30);
  assert.equal(a.remainingCredit, 0);
  assert.equal(a.remainingAmount, 20);
  // in_store_credit_balance is preferred over in_store_credit when no arg.
  a = applyInStoreCredit({ customer: { in_store_credit: 999, in_store_credit_balance: 40 }, amount: 50 });
  assert.equal(a.applied, 40);
  // Zero / negative amounts apply nothing.
  a = applyInStoreCredit({ customer: { in_store_credit: 100 }, amount: 0 });
  assert.deepEqual(a, { applied: 0, remainingCredit: 100, remainingAmount: 0 });
  a = applyInStoreCredit({ customer: { in_store_credit: 100 }, amount: -25 });
  assert.deepEqual(a, { applied: 0, remainingCredit: 100, remainingAmount: 0 });
  // No credit anywhere → full amount remains.
  a = applyInStoreCredit({ amount: 80 });
  assert.deepEqual(a, { applied: 0, remainingCredit: 0, remainingAmount: 80 });
  // Negative credit balance never goes below zero.
  a = applyInStoreCredit({ customer: { in_store_credit: -50 }, amount: 80 });
  assert.deepEqual(a, { applied: 0, remainingCredit: 0, remainingAmount: 80 });
  // Cent rounding: 33.333 credit fully applies as 33.33.
  a = applyInStoreCredit({ customer: { in_store_credit: 33.333 }, amount: 50 });
  assert.equal(a.applied, 33.33);
  assert.equal(a.remainingCredit, 0);
  assert.equal(a.remainingAmount, 16.67);
}

rmSync(out, { force: true });
console.log('PASS credit-terms');
