import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { runInNewContext } from 'node:vm';

const D = 'imports/corebridge-2026-11-16/';
const planPath = '.audit-work/cb-inv-plan.json';
const backupPath = '.audit-work/cb-inv-plan.before-held.json';
const reportPath = '.audit-work/cb-held-inv-plan-report.json';
const apply = process.argv.includes('--apply');
if (existsSync(reportPath) || (apply && existsSync(backupPath))) throw new Error('Held-invoice plan revision already exists.');
if (existsSync('.audit-work/cb-inv-import.lock') || existsSync('.audit-work/cb-inv-supervisor.lock')) throw new Error('An invoice worker is running or requires reconciliation.');
const previous = JSON.parse(readFileSync(planPath, 'utf8'));
const state = JSON.parse(readFileSync('.audit-work/cb-inv-state.json', 'utf8'));
if (state.pending || state.ambiguous.length) throw new Error('Invoice state contains unresolved ambiguous outcomes.');
const missing = new Set(previous.missing_customers.map((row) => String(row.order_id)));
const estimatePlan = JSON.parse(readFileSync('.audit-work/cb-held-estimate-plan.json', 'utf8'));
const estimateState = JSON.parse(readFileSync('.audit-work/cb-held-estimate-state.json', 'utf8'));
if (estimateState.pending || estimateState.conflicts.length) throw new Error('Estimate links are not fully resolved.');
const links = new Map(estimatePlan.rows.map((row) => [String(row.source_id), row]));
for (const id of missing) {
  const link = links.get(id);
  if (!link || (!link.current_customer_id && !estimateState.complete[id]) || (link.current_customer_id && link.current_customer_id !== link.expected_customer_id)) throw new Error(`Estimate ${id} not linked.`);
}
const importer = readFileSync('.audit-work/cb-inv-import.mjs', 'utf8');
const start = importer.indexOf('const sleep =');
const end = importer.indexOf('async function makePlan');
if (start < 0 || end < start) throw new Error('History importer structure changed.');
const sandboxModule = { exports: {} };
runInNewContext(`${importer.slice(start, end)}\nmodule.exports={invoiceRecord,paymentRecord,date,cents};`, {
  module: sandboxModule, exports: sandboxModule.exports, Date, Map, Set, String, Number, Object, Array, Math, JSON, Error,
  setTimeout, BATCH: previous.batch_id,
});
const { invoiceRecord, paymentRecord, cents } = sandboxModule.exports;
const rows = async function* (path) {
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) if (line.trim()) yield JSON.parse(line);
};
const orders = new Map();
for await (const row of rows(`${D}orders/orders.jsonl`)) if (missing.has(String(row.order_id))) orders.set(String(row.order_id), row);
const txs = new Map();
for await (const row of rows(`${D}orders/orders-pass2.jsonl`)) if (missing.has(String(row.order_id))) txs.set(String(row.order_id), row);
if (orders.size !== missing.size || txs.size !== missing.size) throw new Error('Held archive rows are incomplete.');
const additions = { invoices: [], payments: [], refunds: [] };
const parents = new Map();
const existingTransactions = new Set([...previous.payments, ...previous.refunds].map((row) => row.source_id));
const differences = [];
const lineDiffs = [];
const ambiguousWos = [];
for (const id of missing) {
  const order = orders.get(id);
  const tx = txs.get(id);
  if (!Array.isArray(tx.payments) || !Array.isArray(tx.refunds)) throw new Error(`Invalid transactions ${id}.`);
  const link = links.get(id);
  const invoice = invoiceRecord(order, { estimate_id: link.estimate_id, customer_id: link.expected_customer_id, work_order_ids: link.work_order_ids }, tx, previous.generated_at);
  additions.invoices.push({ source_entity: 'invoices', source_id: id, data: invoice });
  if (link.work_order_ids.length > 1) ambiguousWos.push({ order_id: id, work_order_ids: link.work_order_ids });
  const net = [...tx.payments, ...tx.refunds].reduce((sum, row) => sum + cents(row.Amount), 0);
  const diff = net - cents(invoice.amount_paid);
  if (Math.abs(diff) > 1) differences.push({ order_id: id, invoice_number: invoice.invoice_number, amount_paid: invoice.amount_paid, net_transactions: net / 100, diff: diff / 100 });
  const lineTotal = invoice.line_items.reduce((sum, line) => sum + cents(line.quantity * line.unit_price), 0);
  const taxable = invoice.line_items.filter((line) => line.taxable).reduce((sum, line) => sum + cents(line.quantity * line.unit_price), 0);
  const subtotalDiff = lineTotal - cents(order.header.SubTotalPrice);
  const taxableDiff = taxable - cents(order.header.TaxableAmount);
  if (Math.abs(subtotalDiff) > 1 || Math.abs(taxableDiff) > 1) lineDiffs.push({ order_id: id, subtotal_diff: subtotalDiff / 100, taxable_diff: taxableDiff / 100 });
  for (const payment of tx.payments) {
    const source_id = String(payment.Id);
    if (!source_id || existingTransactions.has(source_id)) throw new Error(`Duplicate payment/refund ${source_id}.`);
    existingTransactions.add(source_id);
    const row = { source_entity: 'payments', source_id, order_id: id, source: payment };
    parents.set(source_id, row);
    additions.payments.push(row);
  }
  for (const refund of tx.refunds) {
    const source_id = String(refund.Id);
    if (!source_id || existingTransactions.has(source_id)) throw new Error(`Duplicate payment/refund ${source_id}.`);
    existingTransactions.add(source_id);
    const refs = [...new Set((refund.OrderPaymentRefundInfos || []).map((row) => String(row.TransactionToRefundId || '')).filter(Boolean))];
    additions.refunds.push({ source_entity: 'refunds', source_id, order_id: id, parent_source_id: refs.length === 1 ? refs[0] : '', source: refund });
  }
}
const invoiceByOrder = new Map(additions.invoices.map((row) => [row.source_id, row.data]));
const refunded = new Map();
for (const refund of additions.refunds) {
  const parent = parents.get(refund.parent_source_id);
  if (!parent || parent.order_id !== refund.order_id) throw new Error(`Missing refund parent ${refund.source_id}.`);
  refunded.set(parent.source_id, (refunded.get(parent.source_id) || 0) + Math.abs(cents(refund.source.Amount)));
}
for (const payment of additions.payments) {
  payment.data = paymentRecord(payment.source, invoiceByOrder.get(payment.order_id), false, refunded.get(payment.source_id));
  delete payment.source;
}
for (const refund of additions.refunds) {
  refund.data = paymentRecord(refund.source, invoiceByOrder.get(refund.order_id), true, 0);
  delete refund.source;
}
const plan = { ...previous, invoices: [...previous.invoices, ...additions.invoices], payments: [...previous.payments, ...additions.payments], refunds: [...previous.refunds, ...additions.refunds],
  missing_customers: [], ambiguous_work_orders: [...previous.ambiguous_work_orders, ...ambiguousWos],
  amount_paid_diffs: [...previous.amount_paid_diffs, ...differences], line_diffs: [...previous.line_diffs, ...lineDiffs] };
const sum = (items, fn) => items.reduce((total, row) => total + cents(fn(row)), 0) / 100;
const net = sum([...plan.payments, ...plan.refunds], (row) => row.data.amount);
plan.batch = { ...previous.batch, data: { ...previous.batch.data, collected_total: net, expected_total: net, expected_amount: net, collected_amount: net, payment_count: plan.payments.length + plan.refunds.length } };
plan.summary = { ...previous.summary, invoices: plan.invoices.length, payments: plan.payments.length, refunds: plan.refunds.length, unresolved_customers: 0,
  ambiguous_work_orders: plan.ambiguous_work_orders.length, amount_paid_diffs: plan.amount_paid_diffs.length, line_diffs: plan.line_diffs.length,
  statuses: plan.invoices.reduce((result, row) => { result[row.data.status] = (result[row.data.status] || 0) + 1; return result; }, {}),
  invoice_total: sum(plan.invoices, (row) => row.data.total), payment_total: sum(plan.payments, (row) => row.data.amount), refund_total: sum(plan.refunds, (row) => row.data.amount) };
const report = { additions: { invoices: additions.invoices.length, payments: additions.payments.length, refunds: additions.refunds.length }, summary: plan.summary };
if (plan.summary.invoices !== plan.summary.archive_invoices || plan.summary.payments !== plan.summary.archive_payments ||
    plan.summary.refunds !== plan.summary.archive_refunds || plan.summary.invoice_total !== plan.summary.archive_invoice_total ||
    plan.summary.payment_total !== plan.summary.archive_payment_total || plan.summary.refund_total !== plan.summary.archive_refund_total) throw new Error(`Final plan does not match archive: ${JSON.stringify(report)}`);
console.log(JSON.stringify(report, null, 2));
if (apply) {
  copyFileSync(planPath, backupPath);
  writeFileSync(`${planPath}.tmp`, JSON.stringify(plan, null, 2));
  renameSync(`${planPath}.tmp`, planPath);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
