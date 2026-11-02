import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-completed-vs-paid.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/jobs/completedVsPaidModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  ORDER_LIFECYCLE, orderLifecycleState, orderFinancialState, canTransition,
  isPastDue, pastDueDays, arBucket, agingReportRows, invoiceLinksWorkOrder,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-15';
const woBase = { id: 'wo1', customer_id: 'cust1', estimate_amount: 1000, current_stage: 'production' };
const inv = (id, total, extra = {}) => ({ id, work_order_id: 'wo1', status: 'sent', total, balance_due: total, ...extra });

// --- lifecycle contract ---------------------------------------------------------
assert.deepEqual(ORDER_LIFECYCLE, ['open', 'in_progress', 'completed', 'closed', 'voided']);
assert.equal(orderLifecycleState({ current_stage: 'production' }), 'in_progress');
assert.equal(orderLifecycleState({}), 'open');
assert.equal(orderLifecycleState({ completed: true }), 'completed');
assert.equal(orderLifecycleState({ current_stage: 'completed' }), 'completed');
assert.equal(orderLifecycleState({ lifecycle_state: 'closed' }), 'closed');
assert.equal(orderLifecycleState({ status: 'void' }), 'voided', 'status alias normalizes');
assert.equal(orderLifecycleState({ deleted: true }), 'voided');

// --- financial reconciliation ---------------------------------------------------
// Uninvoiced: whole WO total is still owed.
{
  const s = orderFinancialState(woBase, []);
  assert.equal(s.state, 'uninvoiced');
  assert.equal(s.invoiced_total, 0);
  assert.equal(s.paid_total, 0);
  assert.equal(s.balance_due, 1000, 'uninvoiced WO owes its full total');
}
// Partial: billed invoice with part payment (amount_paid canonical).
{
  const s = orderFinancialState(woBase, [inv('i1', 1000, { balance_due: 600, amount_paid: 400 })]);
  assert.equal(s.state, 'partial');
  assert.equal(s.paid_total, 400);
  assert.equal(s.balance_due, 600);
}
// Paid in full → balance 0, state 'paid'.
{
  const s = orderFinancialState(woBase, [inv('i1', 1000, { status: 'paid', balance_due: 0, amount_paid: 1000 })]);
  assert.equal(s.state, 'paid');
  assert.equal(s.balance_due, 0);
}
// Overpaid → negative balance, 'overpaid'.
{
  const s = orderFinancialState(woBase, [inv('i1', 1000, { balance_due: -500, amount_paid: 1500 })]);
  assert.equal(s.state, 'overpaid');
  assert.equal(s.balance_due, -500);
}
// Field aliases: paid_amount, payments[] sum, balance alias, balance_due-free rows.
{
  const a = orderFinancialState(woBase, [inv('i1', 1000, { balance_due: 250, paid_amount: 750 })]);
  assert.equal(a.paid_total, 750, 'paid_amount alias');
  const b = orderFinancialState(woBase, [inv('i1', 500, { payments: [{ amount: 200 }, { amount: 300 }] })]);
  assert.equal(b.paid_total, 500, 'payments[] sum');
  assert.equal(b.balance_due, 500);
  const c = orderFinancialState(woBase, [inv('i1', 800, { balance_due: undefined, balance: 300, total_paid: 500 })]);
  assert.equal(c.paid_total, 500, 'total_paid alias');
  const d = orderFinancialState(woBase, [inv('i1', 400, { balance_due: undefined, balance: 150 })]);
  assert.equal(d.paid_total, 250, 'paid derived as total - balance');
}
// Cent-safe math: 33.37 + 66.73 must reconcile to exactly paid, not 100.0999.
{
  const wo = { ...woBase, estimate_amount: 100.10 };
  const s = orderFinancialState(wo, [inv('i1', 100.10, {
    payments: [{ amount: 33.37 }, { amount: 66.73 }],
  })]);
  assert.equal(s.paid_total, 100.10);
  assert.equal(s.balance_due, 0);
  assert.equal(s.state, 'paid', 'cent dust never leaves a false balance');
}
// Exclusions: void + deleted + draft invoices never bill; unlinked rows ignored.
{
  const s = orderFinancialState(woBase, [
    inv('i1', 1000, { status: 'void' }),
    inv('i2', 1000, { deleted: true }),
    inv('i3', 1000, { status: 'draft' }),
    { id: 'i4', work_order_id: 'other', status: 'sent', total: 999 },
  ]);
  assert.equal(s.state, 'uninvoiced');
  assert.equal(s.invoiced_total, 0);
}
// estimate_id linkage (invoice never stamped work_order_id).
{
  const wo = { ...woBase, estimate_id: 'est9' };
  assert.equal(invoiceLinksWorkOrder({ estimate_id: 'est9' }, wo), true);
  const s = orderFinancialState(wo, [{ id: 'i1', estimate_id: 'est9', status: 'sent', total: 400, balance_due: 400 }]);
  assert.equal(s.invoiced_total, 400);
}
// WO total from products[].quoted_total when products exist.
{
  const wo = { id: 'wo2', customer_id: 'c', products: [{ quoted_total: 2400 }, { quoted_total: 1500 }] };
  const s = orderFinancialState(wo, []);
  assert.equal(s.balance_due, 3900);
}
// Progress billing: invoice < WO total still reports the unbilled remainder.
{
  const s = orderFinancialState(woBase, [inv('i1', 300, { balance_due: 0, amount_paid: 300 })]);
  assert.equal(s.balance_due, 700, 'paid invoice does not zero the WO balance');
  assert.equal(s.state, 'partial');
}

// --- transitions ------------------------------------------------------------------
const completedWo = { ...woBase, completed: true, current_stage: 'completed' };
const openBalanceCtx = { invoices: [inv('i1', 1000, { balance_due: 500, amount_paid: 500 })] };

// → 'completed' with open balance: allowed — the whole point of E-06.
{
  const r = canTransition({ ...woBase, current_stage: 'production' }, 'completed', openBalanceCtx);
  assert.equal(r.ok, true, 'completion must never block on collection');
  assert.equal(r.patch.lifecycle_state, 'completed');
}
// → 'closed' with open balance: blocked without payment.
{
  const r = canTransition(completedWo, 'closed', openBalanceCtx);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'open_balance');
}
// → 'closed' with open balance + admin_close: allowed, closed_reason stamped.
{
  const r = canTransition(completedWo, 'closed', { ...openBalanceCtx, admin_close: true, reason: 'bad debt write-off', actor: 'brett@x.com', now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.patch.closed_reason, 'bad debt write-off');
  assert.equal(r.patch.closed_by, 'brett@x.com');
  assert.equal(r.patch.closed_at, NOW);
}
// → 'closed' paid in full: allowed, reason 'paid_in_full'.
{
  const r = canTransition(completedWo, 'closed', { invoices: [inv('i1', 1000, { balance_due: 0, amount_paid: 1000 })] });
  assert.equal(r.ok, true);
  assert.equal(r.patch.closed_reason, 'paid_in_full');
}
// 'closed' is terminal — even completed→closed→anything, without admin_reopen.
{
  const closedWo = { ...completedWo, lifecycle_state: 'closed' };
  assert.equal(canTransition(closedWo, 'open', {}).ok, false);
  assert.equal(canTransition(closedWo, 'open', {}).error, 'terminal_state');
  assert.equal(canTransition(closedWo, 'voided', { reason: 'x' }).ok, false, 'admin reason does not beat terminal without reopen');
  const rr = canTransition(closedWo, 'open', { admin_reopen: true, reason: 'customer returned' });
  assert.equal(rr.ok, true);
  assert.equal(rr.patch.reopen_reason, 'customer returned');
}
// 'voided' is terminal too; reopen path same rule.
{
  const voidedWo = { ...completedWo, lifecycle_state: 'voided' };
  assert.equal(canTransition(voidedWo, 'in_progress', {}).ok, false);
  assert.equal(canTransition(voidedWo, 'in_progress', { admin_reopen: true }).ok, true);
}
// → 'voided' needs ctx.reason.
{
  assert.equal(canTransition(completedWo, 'voided', {}).ok, false);
  assert.equal(canTransition(completedWo, 'voided', {}).error, 'reason_required');
  const r = canTransition(completedWo, 'voided', { reason: 'duplicate order' });
  assert.equal(r.ok, true);
  assert.equal(r.patch.voided_reason, 'duplicate order');
}
// Unknown target + already-in-state guards.
{
  assert.equal(canTransition(woBase, 'shipped', {}).error, 'unknown_state');
  assert.equal(canTransition(completedWo, 'completed', {}).error, 'already_in_state');
}
// Backward reopen completed → in_progress is allowed (job reopened for rework).
{
  assert.equal(canTransition(completedWo, 'in_progress', {}).ok, true);
}

// --- aging ------------------------------------------------------------------------
// Due-date math: 'completed' with open balance still counts — closed/voided never.
{
  const dueWo = { ...completedWo, due_date: '2026-11-05' }; // 10 days past NOW
  assert.equal(isPastDue(dueWo, NOW), true, 'completed + open balance is still AR-past-due');
  assert.equal(pastDueDays(dueWo, NOW), 10);
  assert.equal(isPastDue({ ...dueWo, lifecycle_state: 'closed' }, NOW), false);
  assert.equal(pastDueDays({ ...dueWo, lifecycle_state: 'closed' }, NOW), 0);
  assert.equal(isPastDue({ ...dueWo, lifecycle_state: 'voided' }, NOW), false);
  assert.equal(isPastDue({ ...woBase, due_date: '2026-11-15' }, NOW), false, 'due today is not past due');
  assert.equal(isPastDue({ ...woBase, due_date: '2026-12-01' }, NOW), false);
  assert.equal(isPastDue({ ...woBase }, NOW), false, 'no due date is never past due');
  assert.equal(pastDueDays({ ...woBase }, NOW), 0);
  // Explicit zero-balance marker suppresses the flag (settled, not AR).
  assert.equal(isPastDue({ ...dueWo, balance_due: 0 }, NOW), false);
}
// Buckets.
{
  const mk = (days) => ({ ...woBase, due_date: new Date(Date.UTC(2026, 10, 15 - days)).toISOString().slice(0, 10) });
  assert.equal(arBucket(mk(0), NOW), 'current');
  assert.equal(arBucket({ ...woBase }, NOW), 'current', 'null due → current');
  assert.equal(arBucket(mk(15), NOW), '1-30');
  assert.equal(arBucket(mk(30), NOW), '1-30', 'boundary 30');
  assert.equal(arBucket(mk(45), NOW), '31-60');
  assert.equal(arBucket(mk(75), NOW), '61-90');
  assert.equal(arBucket(mk(90), NOW), '61-90', 'boundary 90');
  assert.equal(arBucket(mk(120), NOW), '90+');
  assert.equal(arBucket({ ...mk(120), lifecycle_state: 'closed' }, NOW), 'current', 'closed never ages');
  // Completed flag does NOT flatten the bucket.
  assert.equal(arBucket({ ...mk(45), completed: true, current_stage: 'completed' }, NOW), '31-60');
}

// --- aging report -------------------------------------------------------------------
{
  const wos = [
    { id: 'a', customer_id: 'c1', estimate_amount: 1000, completed: true, current_stage: 'completed', due_date: '2026-09-01' }, // 75d past — completed + open
    { id: 'b', customer_id: 'c2', estimate_amount: 500, current_stage: 'production', due_date: '2026-11-01' },                  // 14d past, billed
    { id: 'c', customer_id: 'c3', estimate_amount: 800, current_stage: 'production', due_date: '2026-11-20' },                  // current, billed
    { id: 'd', customer_id: 'c4', estimate_amount: 300, current_stage: 'production', due_date: '2026-10-01' },                  // paid — excluded
    { id: 'e', customer_id: 'c5', estimate_amount: 200, lifecycle_state: 'closed', due_date: '2026-01-01' },                    // closed — excluded
    { id: 'f', customer_id: 'c6', estimate_amount: 400, current_stage: 'production', due_date: '2026-10-01' },                  // uninvoiced open — excluded (not yet AR)
    { id: 'g', customer_id: 'c7', estimate_amount: 600, current_stage: 'production', deleted: true },                            // deleted — excluded
  ];
  const invoicesByWo = {
    a: [{ id: 'ia', work_order_id: 'a', status: 'sent', total: 1000, balance_due: 1000 }],
    b: [{ id: 'ib', work_order_id: 'b', status: 'sent', total: 500, balance_due: 500 }],
    c: [{ id: 'ic', work_order_id: 'c', status: 'sent', total: 800, balance_due: 800 }],
    d: [{ id: 'id', work_order_id: 'd', status: 'paid', total: 300, balance_due: 0, amount_paid: 300 }],
  };
  const rows = agingReportRows(wos, invoicesByWo, NOW);
  assert.equal(rows.length, 3, 'a (completed never-paid), b, c only');
  assert.deepEqual(rows.map((r) => r.wo_id), ['a', 'b', 'c'], 'sorted days_past_due desc');
  const rowA = rows[0];
  assert.equal(rowA.completed, true, 'completed WO appears in AR');
  assert.equal(rowA.balance, 1000);
  assert.equal(rowA.bucket, '61-90');
  assert.equal(rowA.days_past_due, 75);
  assert.equal(rowA.customer_id, 'c1');
  assert.equal(rowA.state, 'partial');
  assert.equal(rows.find((r) => r.wo_id === 'b').bucket, '1-30');
  assert.equal(rows.find((r) => r.wo_id === 'c').days_past_due, 0);
}
// invoicesByWo also accepts a Map and a flat array (linked internally).
{
  const wos = [{ id: 'a', customer_id: 'c1', estimate_amount: 100, completed: true, current_stage: 'completed', due_date: '2026-11-01' }];
  const flat = [{ id: 'i1', work_order_id: 'a', status: 'sent', total: 100, balance_due: 100 }];
  assert.equal(agingReportRows(wos, new Map([['a', flat]]), NOW).length, 1, 'Map form');
  assert.equal(agingReportRows(wos, flat, NOW).length, 1, 'flat-array form');
  assert.equal(agingReportRows(wos, {}, NOW).length, 1, 'uninvoiced completed WO still lands (money owed)');
  assert.equal(agingReportRows(null, flat, NOW).length, 0);
}

rmSync(out, { force: true });
console.log('PASS completed-vs-paid');
