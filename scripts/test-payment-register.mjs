import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-payment-register.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/paymentRegisterModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PAYMENT_METHODS, PAYMENT_METHODS_ALL, OPEN_AR_STATUSES, REGISTER_BATCH_STATUSES,
  registerRows, filterRegister, registerTotals,
  receivePaymentPatch, refundPatch, paymentRequestKey, refundRequestKey,
} = await import(pathToFileURL(out).href);

const customers = {
  'cust-1': { id: 'cust-1', company_name: 'Acme Signs' },
  'cust-2': { id: 'cust-2', company_name: 'Bayside Marina' },
};
const invoices = {
  'inv-1': { id: 'inv-1', invoice_number: 'INV-1041', customer_display_name: 'Acme Signs' },
  'inv-2': { id: 'inv-2', invoice_number: 'INV-1042', customer_display_name: 'Bayside Marina' },
};

const payments = [
  { id: 'p1', invoice_id: 'inv-1', customer_id: 'cust-1', amount: 120, method: 'check', reference_number: 'CHK 4471', paid_date: '2026-10-30', status: 'recorded', reconciliation_batch_id: 'batch-9', notes: 'Mailed check', creation_request_key: 'k1', created_date: '2026-10-30T12:00:00Z' },
  { id: 'p2', invoice_id: 'inv-1', customer_id: 'cust-1', amount: 80.5, method: 'card', reference_number: 'AUTH-99', paid_date: '2026-11-01', status: 'recorded', notes: '', creation_request_key: 'k2', created_date: '2026-11-01T09:00:00Z' },
  { id: 'p3', invoice_id: 'inv-2', customer_id: 'cust-2', amount: 300, method: 'cash', paid_date: '2026-11-02', status: 'recorded', notes: 'Counter deposit', creation_request_key: 'k3', created_date: '2026-11-02T08:00:00Z' },
  { id: 'p4', invoice_id: 'inv-2', customer_id: 'cust-2', amount: -50, method: 'cash', paid_date: '2026-11-02', status: 'refunded', refund_of_payment_id: 'p3', notes: 'Refund: overpayment', creation_request_key: 'k4', created_date: '2026-11-02T15:00:00Z' },
  { id: 'p5', invoice_id: 'inv-2', customer_id: 'cust-2', amount: 25, method: 'ach', paid_date: '2026-11-03', status: 'void', void_reason: 'Duplicate entry', creation_request_key: 'k5', created_date: '2026-11-03T10:00:00Z' },
  { id: 'p6', invoice_id: '', customer_id: 'cust-2', amount: 10, method: 'other', status: '', creation_request_key: 'k6', created_date: '2026-10-01T00:00:00Z' },
];

// ── Method lists ─────────────────────────────────────────────────────────
// Canonical list mirrors invoicingAction PAYMENT_METHODS verbatim (no
// credit_memo); the display list adds it in Payment.jsonc enum order.
assert.deepEqual([...PAYMENT_METHODS], ['cash', 'check', 'card', 'ach', 'financing', 'other']);
assert.deepEqual([...PAYMENT_METHODS_ALL], ['cash', 'check', 'card', 'ach', 'financing', 'other', 'credit_memo']);
assert.deepEqual([...OPEN_AR_STATUSES], ['sent', 'partially_paid']);
assert.deepEqual([...REGISTER_BATCH_STATUSES], ['all', 'deposited', 'undeposited']);

// ── registerRows ─────────────────────────────────────────────────────────
const rows = registerRows(payments, { customersById: customers, invoicesById: invoices });
assert.equal(rows.length, 6);
// Newest-first by paid_date.
assert.deepEqual(rows.map((r) => r.payment_id), ['p5', 'p4', 'p3', 'p2', 'p1', 'p6']);
{
  const r = rows.find((x) => x.payment_id === 'p1');
  assert.equal(r.date, '2026-10-30');
  assert.equal(r.customer_name, 'Acme Signs');
  assert.equal(r.invoice_number, 'INV-1041');
  assert.equal(r.method, 'check');
  assert.equal(r.amount_cents, 12000);
  assert.equal(r.status, 'posted');
  assert.equal(r.batch_id, 'batch-9');
  assert.equal(r.deposited, true);
  assert.equal(r.reference_number, 'CHK 4471');
  assert.equal(r.is_refund, false);
}
// Status mapping: refunded rows, void rows, missing → pending.
assert.equal(rows.find((x) => x.payment_id === 'p4').status, 'refunded');
assert.equal(rows.find((x) => x.payment_id === 'p4').is_refund, true);
assert.equal(rows.find((x) => x.payment_id === 'p5').status, 'void');
assert.equal(rows.find((x) => x.payment_id === 'p6').status, 'pending');
assert.equal(rows.find((x) => x.payment_id === 'p6').date, '2026-10-01', 'created_date date fallback');
// Customer name falls back to invoice.customer_display_name when no customer row.
{
  const orphan = registerRows([{ id: 'p9', customer_id: 'ghost', invoice_id: 'inv-1', amount: 5, status: 'recorded', paid_date: '2026-11-05' }], { customersById: {}, invoicesById: invoices });
  assert.equal(orphan[0].customer_name, 'Acme Signs');
}
// Lookups accept row arrays as well as maps.
{
  const r = registerRows([payments[0]], { customersById: Object.values(customers), invoicesById: Object.values(invoices) });
  assert.equal(r[0].customer_name, 'Acme Signs');
  assert.equal(r[0].invoice_number, 'INV-1041');
}
// Missing-method default and null-input safety.
assert.equal(registerRows(null, {}).length, 0);
assert.equal(registerRows([{ id: 'x', amount: 1, status: 'recorded' }], {})[0].method, 'other');

// ── filterRegister ───────────────────────────────────────────────────────
// q matches customer name, invoice number, and check-number memo — tokens
// are AND-ed, case-insensitive.
assert.equal(filterRegister(rows, { q: 'acme' }).length, 2);
assert.equal(filterRegister(rows, { q: 'inv-1042' }).length, 3);
assert.equal(filterRegister(rows, { q: '4471' }).length, 1, 'check number hits reference_number');
assert.equal(filterRegister(rows, { q: 'overpayment' }).length, 1, 'memo hits notes');
assert.equal(filterRegister(rows, { q: 'bayside inv-1042' }).length, 3, 'multi-token AND');
assert.equal(filterRegister(rows, { q: 'nomatch' }).length, 0);
// Method filter: exact, with all/blank as pass-through.
assert.equal(filterRegister(rows, { method: 'cash' }).length, 2);
assert.equal(filterRegister(rows, { method: 'check' }).length, 1);
assert.equal(filterRegister(rows, { method: 'all' }).length, 6);
assert.equal(filterRegister(rows, {}).length, 6);
// Date range: inclusive bounds; unbounded on either side works.
assert.equal(filterRegister(rows, { from: '2026-11-01', to: '2026-11-02' }).length, 3);
assert.equal(filterRegister(rows, { from: '2026-11-02' }).length, 3);
assert.equal(filterRegister(rows, { to: '2026-10-30' }).length, 2);
assert.equal(filterRegister(rows, { from: '2026-11-02', to: '2026-11-02' }).length, 2, 'single-day inclusive');
// Batch status: deposited / undeposited / specific batch id.
assert.equal(filterRegister(rows, { batch_status: 'deposited' }).length, 1);
assert.equal(filterRegister(rows, { batch_status: 'undeposited' }).length, 5);
assert.equal(filterRegister(rows, { batch_status: 'batch-9' }).length, 1, 'concrete batch id');
assert.equal(filterRegister(rows, { batch_status: 'all' }).length, 6);
// customer_id + combined filters.
assert.equal(filterRegister(rows, { customer_id: 'cust-1' }).length, 2);
assert.equal(filterRegister(rows, { customer_id: 'cust-2', method: 'cash', batch_status: 'undeposited' }).length, 2);
// Rows with no date are excluded only when a bound is set.
assert.equal(filterRegister(rows, { q: '', from: '', to: '' }).length, 6);

// ── registerTotals ───────────────────────────────────────────────────────
{
  const t = registerTotals(rows);
  assert.equal(t.count, 6);
  assert.equal(t.total_cents, 12000 + 8050 + 30000 - 5000 + 2500 + 1000);
  assert.equal(t.by_method.cash.count, 2);
  assert.equal(t.by_method.cash.total_cents, 25000, 'cash nets the refund');
  assert.equal(t.by_method.check.total_cents, 12000);
  assert.equal(t.by_status.void.count, 1);
  assert.equal(t.by_status.posted.count, 3);
  assert.equal(t.by_status.refunded.count, 1);
  assert.equal(t.by_status.pending.count, 1);
  assert.equal(t.deposited_cents, 12000, 'batched rows only');
  assert.equal(t.undeposited_cents, 8050 + 30000 - 5000 + 1000, 'non-void, unbatched');
}
assert.equal(registerTotals(filterRegister(rows, { method: 'cash' })).total_cents, 25000);
assert.equal(registerTotals([]).count, 0);

// ── receivePaymentPatch ──────────────────────────────────────────────────
// Happy path mirrors the invoicingAction record_payment contract exactly:
// {action, invoice_id, creation_request_key, amount(dollars), method,
//  paid_date, reference_number, notes}. session_token is merged by the caller.
{
  const res = receivePaymentPatch({
    invoice: { id: 'inv-1', status: 'partially_paid', balance_due: 200 },
    amount_cents: 15000,
    method: 'check',
    ref: 'CHK 4472',
    actor_id: 'ar@ccs.test',
    now: '2026-11-03T12:00:00Z',
  });
  assert.equal(res.ok, true);
  const p = res.payload;
  assert.equal(p.action, 'record_payment');
  assert.equal(p.invoice_id, 'inv-1');
  assert.equal(p.amount, 150, 'cents → dollars for the wire');
  assert.equal(p.method, 'check');
  assert.equal(p.paid_date, '2026-11-03');
  assert.equal(p.reference_number, 'CHK 4472');
  assert.ok(p.creation_request_key.startsWith('payment:inv-1:15000:check'));
  assert.ok(p.creation_request_key.length <= 256);
  assert.ok(!('session_token' in p), 'caller merges the session token');
}
// Defaults: method 'other', paid_date falls back to today.
{
  const res = receivePaymentPatch({ invoice: { id: 'i', status: 'sent', balance_due: 10 }, amount_cents: 500 });
  assert.equal(res.payload.method, 'other');
  assert.equal(res.payload.paid_date, new Date().toISOString().slice(0, 10));
  assert.equal(res.payload.amount, 5);
}
// Options-bag ref: notes + explicit creation_request_key passthrough.
{
  const res = receivePaymentPatch({
    invoice: { id: 'i', status: 'sent', balance_due: 10 },
    amount_cents: 500,
    ref: { reference_number: 'R1', notes: 'phone payment', creation_request_key: 'custom-key-1' },
  });
  assert.equal(res.payload.notes, 'phone payment');
  assert.equal(res.payload.reference_number, 'R1');
  assert.equal(res.payload.creation_request_key, 'custom-key-1');
}
// Deterministic key: identical inputs dedupe (retry-safe), different amount
// or ref produces a distinct key.
{
  const mk = () => receivePaymentPatch({ invoice: { id: 'i', status: 'sent', balance_due: 99 }, amount_cents: 100, method: 'cash' }).payload.creation_request_key;
  assert.equal(mk(), mk());
  assert.notEqual(mk(), receivePaymentPatch({ invoice: { id: 'i', status: 'sent', balance_due: 99 }, amount_cents: 200, method: 'cash' }).payload.creation_request_key);
}
// Guards mirror the server's, in order.
{
  const draft = { id: 'i', status: 'draft', balance_due: 10 };
  assert.match(receivePaymentPatch({ invoice: draft, amount_cents: 100 }).error, /sent or partially paid/);
  const paid = { id: 'i', status: 'paid', balance_due: 0 };
  assert.match(receivePaymentPatch({ invoice: paid, amount_cents: 100 }).error, /sent or partially paid/);
  const sent = { id: 'i', status: 'sent', balance_due: 100 };
  assert.match(receivePaymentPatch({ invoice: sent, amount_cents: 0 }).error, /positive/);
  assert.match(receivePaymentPatch({ invoice: sent, amount_cents: -5 }).error, /positive/);
  assert.match(receivePaymentPatch({ invoice: sent, amount_cents: 10001 }).error, /exceeds the open balance of \$100\.00/);
  assert.match(receivePaymentPatch({ invoice: sent, amount_cents: 100, method: 'bitcoin' }).error, /method must be one of/);
  assert.match(receivePaymentPatch({ invoice: sent, amount_cents: 100, method: 'credit_memo' }).error, /method must be one of/, 'credit_memo is not recordable');
  assert.equal(receivePaymentPatch({ invoice: sent, amount_cents: 10000 }).ok, true, 'exact balance is allowed');
  assert.equal(receivePaymentPatch({ invoice: null, amount_cents: 100 }).ok, false);
}

// ── refundPatch ──────────────────────────────────────────────────────────
// Happy path mirrors refund_payment: {action, payment_id,
// creation_request_key, amount(dollars), reason, restock}.
{
  const res = refundPatch({
    payment: { id: 'p3', status: 'recorded', amount: 300, refunded_amount: 0 },
    amount_cents: 5000,
    reason: 'overpayment',
    actor_id: 'ar@ccs.test',
  });
  assert.equal(res.ok, true);
  const p = res.payload;
  assert.equal(p.action, 'refund_payment');
  assert.equal(p.payment_id, 'p3');
  assert.equal(p.amount, 50, 'cents → dollars');
  assert.equal(p.reason, 'overpayment');
  assert.equal(p.restock, false);
  assert.ok(p.creation_request_key.startsWith('refund:p3:5000'));
}
// Omitted amount defaults to the full refundable remainder (server parity).
{
  const res = refundPatch({ payment: { id: 'p', status: 'recorded', amount: 300, refunded_amount: 50 } });
  assert.equal(res.payload.amount, 250);
}
// Partial refunds accumulate: refunded_amount shrinks the remainder.
{
  const payment = { id: 'p', status: 'recorded', amount: 300, refunded_amount: 250 };
  const res = refundPatch({ payment, amount_cents: 6000 });
  assert.equal(res.ok, false);
  assert.match(res.error, /exceeds the refundable amount of \$50\.00/);
}
// Sibling rows tighten the cap to the invoice's net collected balance —
// a credit memo already returned the dollars.
{
  const payment = { id: 'p', status: 'recorded', amount: 300 };
  const siblings = [payment, { id: 'c1', status: 'recorded', amount: -280, method: 'credit_memo' }];
  const res = refundPatch({ payment, amount_cents: 30000, reason: { payments: siblings } });
  assert.equal(res.ok, false);
  assert.match(res.error, /refundable amount of \$20\.00/);
  const partial = refundPatch({ payment, amount_cents: 2000, reason: { payments: siblings } });
  assert.equal(partial.ok, true);
}
// Void / refunded / negative rows cannot be refunded.
{
  assert.match(refundPatch({ payment: { id: 'v', status: 'void', amount: 100 } }).error, /Only recorded payments/);
  assert.match(refundPatch({ payment: { id: 'r', status: 'refunded', amount: 100 } }).error, /Only recorded payments/);
  assert.match(refundPatch({ payment: { id: 'n', status: 'recorded', amount: -30 } }).error, /Only recorded payments/, 'credit rows are not refundable');
  assert.match(refundPatch({ payment: { id: 'f', status: 'recorded', amount: 100, refunded_amount: 100 } }).error, /fully refunded/);
  assert.match(refundPatch({ payment: { id: 'z', status: 'recorded', amount: 100 }, amount_cents: 0 }).error, /positive/);
  assert.equal(refundPatch({ payment: null }).ok, false);
}
// Options-bag reason: restock + key override; deterministic keys otherwise.
{
  const res = refundPatch({
    payment: { id: 'p', status: 'recorded', amount: 100 },
    reason: { reason: 'damaged', restock: true, creation_request_key: 'rf-77' },
  });
  assert.equal(res.payload.reason, 'damaged');
  assert.equal(res.payload.restock, true);
  assert.equal(res.payload.creation_request_key, 'rf-77');
  const mk = () => refundPatch({ payment: { id: 'p', status: 'recorded', amount: 100 }, amount_cents: 1000, reason: 'dup' }).payload.creation_request_key;
  assert.equal(mk(), mk(), 'same inputs dedupe');
  assert.notEqual(mk(), refundPatch({ payment: { id: 'p', status: 'recorded', amount: 100 }, amount_cents: 2000, reason: 'dup' }).payload.creation_request_key);
}
// Exported key builders stay under the 256-char receipt cap.
assert.ok(paymentRequestKey('i', 100, 'cash', 'R', '2026-11-03').length <= 256);
assert.ok(refundRequestKey('p', 100, 'why').length <= 256);

rmSync(out, { force: true });
console.log('PASS payment-register');
