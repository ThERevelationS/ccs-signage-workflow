import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';

const originalPath = '.audit-work/cb-inv-plan.before-void.json';
const planPath = '.audit-work/cb-inv-plan.json';
const statePath = '.audit-work/cb-inv-state.json';
const reportPath = '.audit-work/cb-inv-plan-void-revision.json';
const lockPath = '.audit-work/cb-inv-import.lock';
const apply = process.argv.includes('--apply');
if (existsSync(reportPath)) throw new Error('Void plan revision already exists; do not overwrite.');
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  try {
    process.kill(lock.pid, 0);
    throw new Error('Import worker is still running.');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
const originalBytes = readFileSync(originalPath, 'utf8');
if (readFileSync(planPath, 'utf8') !== originalBytes) throw new Error('Current plan differs from preserved original.');
const plan = JSON.parse(originalBytes);
const state = JSON.parse(readFileSync(statePath, 'utf8'));
if (state.pending) throw new Error('Pending write must be reconciled before revising the plan.');
const cents = (value) => Math.round(Number(value || 0) * 100);
const net = new Map();
for (const payment of [...plan.payments, ...plan.refunds]) net.set(payment.order_id, (net.get(payment.order_id) || 0) + cents(payment.data.amount));
const byId = new Map(plan.invoices.map((invoice) => [invoice.source_id, invoice]));
const changes = [];
for (const invoice of plan.invoices) {
  if (invoice.data.status !== 'void') continue;
  const paid = (net.get(invoice.source_id) || 0) / 100;
  if (invoice.data.amount_paid !== paid || invoice.data.balance_due !== 0) changes.push({
    source_id: invoice.source_id,
    before: { amount_paid: invoice.data.amount_paid, balance_due: invoice.data.balance_due },
    after: { amount_paid: paid, balance_due: 0 },
  });
  invoice.data.amount_paid = paid;
  invoice.data.balance_due = 0;
}
plan.amount_paid_diffs = plan.invoices.flatMap((invoice) => {
  const difference = (net.get(invoice.source_id) || 0) - cents(invoice.data.amount_paid);
  return Math.abs(difference) > 1 ? [{
    order_id: invoice.source_id, invoice_number: invoice.data.invoice_number,
    amount_paid: invoice.data.amount_paid, net_transactions: (net.get(invoice.source_id) || 0) / 100,
    diff: difference / 100,
  }] : [];
});
plan.summary.amount_paid_diffs = plan.amount_paid_diffs.length;
for (const entry of state.ambiguous) {
  if (entry.entity !== 'Invoice' || entry.action !== 'write_rows') continue;
  const revised = byId.get(entry.row.source_id);
  if (!revised) throw new Error('Ambiguous invoice not found in plan.');
  entry.row.data.amount_paid = revised.data.amount_paid;
  entry.row.data.balance_due = revised.data.balance_due;
}
const report = {
  previous_amount_paid_diffs: JSON.parse(originalBytes).amount_paid_diffs.length,
  revised_amount_paid_diffs: plan.amount_paid_diffs.length,
  void_invoices: plan.invoices.filter((row) => row.data.status === 'void').length,
  void_invoices_changed: changes.length,
  confirmed_invoice_targets_in_changed_set: changes.filter((row) => state.ids.Invoice[row.source_id]).length,
  ambiguous_invoice_rows_in_changed_set: changes.filter((row) => state.ambiguous.some((entry) => entry.entity === 'Invoice' && entry.row.source_id === row.source_id)).length,
  changes,
};
console.log(JSON.stringify({ ...report, changes: undefined }, null, 2));
if (apply) {
  const stateBackup = '.audit-work/cb-inv-state.before-void.json';
  if (existsSync(stateBackup)) throw new Error('State backup exists; preserve it.');
  copyFileSync(statePath, stateBackup);
  writeFileSync(`${planPath}.tmp`, JSON.stringify(plan, null, 2));
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${planPath}.tmp`, planPath);
  renameSync(`${statePath}.tmp`, statePath);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
