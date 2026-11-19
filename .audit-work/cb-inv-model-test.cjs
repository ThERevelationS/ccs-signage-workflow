const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let source = fs.readFileSync('.audit-work/cb-inv-import.mjs', 'utf8');
source = source.replace(/^import .*;\s*$/gm, '');
source = source.slice(0, source.indexOf("if (!['plan', 'apply', 'reconcile', 'verify', 'void-correct'].includes(mode))"));
source += '\nglobalThis.test = { date, invoiceLines, invoiceRecord, paymentRecord, hydrate, pacedWrite, reconcile, newState, selectInvoices, setRaw: (fn) => { raw = fn; }, setReadAction: (fn) => { readAction = fn; } };';
const logs = [];
const ctx = {
  process: { argv: ['', '', 'test'] }, console, setTimeout,
  Date, Math, JSON, Number, String, Set, Map, Object, Array, Promise,
  writeFileSync() {}, renameSync() {}, appendFileSync(_path, line) { logs.push(line); },
};
vm.runInNewContext(source, ctx);
const t = ctx.test;
assert.equal(t.date({ DateTimeOffset: '2026-11-13T09:00:00-05:00' }), '2026-11-13');
assert.equal(t.date({ DateTimeOffset: '/Date(0)/' }), '1970-01-01');
assert.equal(t.date({ DisplayDate: '1/2/2020' }), '2020-01-02');
const lines = t.invoiceLines([
  { Description: 'Mixed', Qty: 3, TaxableAmount: 40, NonTaxableAmount: 60 },
  { Description: 'Tax', Qty: 2, TaxableAmount: 10, TotalPrice: 10 },
]);
assert.equal(lines.length, 3);
assert.deepEqual(JSON.parse(JSON.stringify(lines.map((line) => [line.unit_price, line.taxable]))), [[40, true], [60, false], [10, true]]);
assert.match(lines[0].description, /qty 3.*taxable portion/);
const invoice = { customer_id: 'c', estimate_id: 'e', work_order_id: '' };
const original = { Id: 10, Amount: 100, Type: 'Visa' };
assert.equal(t.paymentRecord(original, invoice, false, 10000).status, 'refunded');
assert.equal(t.paymentRecord(original, invoice, false, 5000).status, 'recorded');
assert.equal(t.paymentRecord({ ...original, Amount: -2 }, invoice, false, 0).status, 'recorded');
assert.equal(t.paymentRecord(original, invoice, true, 0).status, 'refunded');
const sampleOrder = {
  order_id: '1',
  header: { InvoiceNumber: 'INV-1', TotalPrice: 100, BalanceDue: 7, OrderStatus: 'VOIDED' },
  products: [],
};
const links = { customer_id: 'c', estimate_id: 'e', work_order_ids: [] };
const tx = { payments: [{ Amount: 50 }], refunds: [{ Amount: -20 }] };
const voidInvoice = t.invoiceRecord(sampleOrder, links, tx, '2026-01-01');
assert.equal(voidInvoice.amount_paid, 30);
assert.equal(voidInvoice.balance_due, 0);
sampleOrder.header.OrderStatus = 'WIP';
const activeInvoice = t.invoiceRecord(sampleOrder, links, tx, '2026-01-01');
assert.equal(activeInvoice.amount_paid, 93);
assert.equal(activeInvoice.balance_due, 7);
const picked = t.selectInvoices({
  invoices: [
    { source_id: 'a', data: { status: 'paid', line_items: [] } },
    { source_id: 'b', data: { status: 'void', line_items: [] } },
    { source_id: 'c', data: { status: 'paid', line_items: [{ description: 'x (taxable portion)' }] } },
  ],
  refunds: [{ order_id: 'a' }],
}, 3);
assert.equal(picked.length, 3);
assert.equal(picked[0].source_id, 'a');
(async () => {
  const state = t.newState();
  let attempts = 0;
  t.setRaw(async () => { attempts++; throw new Error('synthetic timeout'); });
  const row = { source_entity: 'invoices', source_id: '1', data: { creation_request_key: 'cb:invoice:1' } };
  const result = await t.pacedWrite(state, { action: 'write_rows', entity: 'Invoice', rows: [row] });
  assert.equal(attempts, 1);
  assert.equal(result.ambiguous, 1);
  assert.equal(state.ambiguous.length, 1);
  assert.equal(state.pending, null);
  assert.equal(logs.length, 1);
  state.apply_ended_at = Date.now() - 181000;
  state.last_write_started_at = 0;
  t.setReadAction(async () => ({ results: [{ key: row.data.creation_request_key, matches: [{ id: 'invoice-1' }] }] }));
  let adopt;
  t.setRaw(async (_name, payload) => {
    adopt = payload.adopt;
    return { status: 200, body: { success: true, results: [{ status: 'existing', target_id: 'invoice-1' }] } };
  });
  await t.reconcile(state);
  assert.equal(adopt, true);
  assert.equal(state.ambiguous.length, 0);
  assert.equal(state.ids.Invoice['1'], 'invoice-1');
  state.ambiguous.push({ action: 'update_rows', entity: 'Invoice', row: { id: 'invoice-1', set: { amount_paid: 0, balance_due: 0 } } });
  state.apply_ended_at = Date.now() - 181000;
  state.last_write_started_at = 0;
  let updateReads = 0;
  t.setReadAction(async () => ({ results: [{ item: { amount_paid: ++updateReads === 1 ? 20 : 0, balance_due: 0 } }] }));
  t.setRaw(async () => ({ status: 200, body: { success: true, results: [{ status: 'updated' }] } }));
  await t.reconcile(state);
  assert.equal(state.ambiguous.length, 0);
  assert.equal(updateReads, 2);
  console.log('PASS importer model: dates, tax split, void totals, refund status, ambiguous recovery');
})().catch((error) => { console.error(error); process.exitCode = 1; });
