import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
buildSync({
  entryPoints: [
    resolve(here, '../src/components/jobs/orderWaterfall.js'),
    resolve(here, '../src/components/jobs/orderHistoryModel.js'),
  ],
  bundle: true, format: 'esm', outdir: resolve(here, '.tmp-wf-hist'), logLevel: 'silent',
});
const {
  computeOrderWaterfall, normalizeFeeLines, reconcileWaterfall, waterfallRow,
  waterfallToCsv, paymentCountsTowardInvoice, ORDER_FEE_KINDS,
} = await import(pathToFileURL(resolve(here, '.tmp-wf-hist/orderWaterfall.js')).href);
const {
  classifyOrderHistoryEvent, mergeOrderHistorySources, historyToCsv,
  ORDER_HISTORY_ACTOR_CSS,
} = await import(pathToFileURL(resolve(here, '.tmp-wf-hist/orderHistoryModel.js')).href);

const rowAmount = (rows, key) => waterfallRow(rows, key)?.amount;

// ── D-02: waterfall row order + cents-exact math vs a hand-computed invoice ──
// line_items: 2×$100 taxable + 1×$50 non-taxable = $250 subtotal ($200 taxable)
// discount_amount $20; tax_rate 6%; fee_lines: freight $15 taxable, stamps
// $2.50 non-taxable, loyalty discount −$5 taxable, rush fee $30 taxable.
// Tax base = 200 − 20 + (15 − 5 + 30) = 220 → tax $13.20
// New subtotal = 250 − 25 + 15 + 2.50 + 30 = 272.50 → total $285.70
const invoice = {
  id: 'inv-1',
  invoice_number: 'INV-1001',
  subtotal: 250,
  discount_amount: 20,
  tax_rate: 0.06,
  tax_amount: 13.2,
  total: 285.7,
  amount_paid: 125,
  balance_due: 160.7,
  line_items: [
    { description: 'Sign', quantity: 2, unit_price: 100, taxable: true },
    { description: 'Design', quantity: 1, unit_price: 50, taxable: false },
  ],
  fee_lines: [
    { label: 'Freight', kind: 'shipping', amount: 15, taxable: true, income_account_code: '4100' },
    { label: 'Stamps', kind: 'postage', amount: 2.5, taxable: false },
    { label: 'Loyalty', kind: 'discount', amount: -5, taxable: true },
    { label: 'Rush fee', kind: 'fee', amount: 30, taxable: true, income_account_code: '4200' },
  ],
};
const payments = [
  { id: 'p1', invoice_id: 'inv-1', amount: 100, status: 'recorded', method: 'cash' },
  { id: 'p2', invoice_id: 'inv-1', amount: 50, status: 'recorded', method: 'card' },
  { id: 'p3', invoice_id: 'inv-1', amount: -25, status: 'refunded', method: 'card' },
  { id: 'p4', invoice_id: 'inv-1', amount: 999, status: 'void', method: 'check' },
  { id: 'p5', invoice_id: 'inv-other', amount: 40, status: 'recorded' },
];

{
  const rows = computeOrderWaterfall({ invoice, payments });
  const keys = rows.map((r) => r.key);
  assert.deepEqual(keys, [
    'subtotal', 'discount', 'shipping', 'postage', 'fee:3',
    'new_subtotal', 'tax', 'total', 'total_paid', 'balance_due',
  ], 'canonical waterfall order with misc-fee row after postage');
  assert.equal(rowAmount(rows, 'subtotal'), 250);
  assert.equal(rowAmount(rows, 'discount'), -25, 'discount row = discount_amount + discount fee line');
  assert.equal(rowAmount(rows, 'shipping'), 15);
  assert.equal(rowAmount(rows, 'postage'), 2.5);
  assert.equal(rowAmount(rows, 'fee:3'), 30);
  assert.equal(waterfallRow(rows, 'fee:3').label, 'Rush fee');
  assert.equal(rowAmount(rows, 'new_subtotal'), 272.5);
  assert.equal(waterfallRow(rows, 'tax').label, 'Tax 6%');
  assert.equal(waterfallRow(rows, 'tax').taxable_base, 220, 'taxable items − discount + taxable fees');
  assert.equal(rowAmount(rows, 'tax'), 13.2);
  assert.equal(rowAmount(rows, 'total'), 285.7);
  assert.equal(rowAmount(rows, 'total_paid'), 125, 'recorded+refunded rows net, void excluded');
  assert.equal(rowAmount(rows, 'balance_due'), 160.7);
  const rec = reconcileWaterfall(rows, invoice);
  assert.equal(rec.matches, true, 'computed waterfall foots to the stored invoice to the cent');
  // Integer-cent round trip: every row carries a lossless cents value.
  assert.ok(rows.every((r) => Number.isInteger(r.amount_cents)));
  assert.equal(waterfallRow(rows, 'balance_due').amount_cents, 16070);
}

// No fee lines → waterfall reproduces invoicingAction.computeTotals exactly:
// tax base = taxable items (200) − discount (20) = 180 → tax 10.80,
// total = 250 − 20 + 10.80 = 240.80.
{
  const rows = computeOrderWaterfall({
    invoice: { id: 'i2', subtotal: 250, discount_amount: 20, tax_rate: 0.06, line_items: invoice.line_items },
    payments: [],
  });
  assert.equal(rowAmount(rows, 'tax'), 10.8);
  assert.equal(rowAmount(rows, 'total'), 240.8);
  assert.equal(rowAmount(rows, 'total_paid'), 0);
  assert.equal(rowAmount(rows, 'balance_due'), 240.8);
  assert.equal(rows.filter((r) => r.key === 'deposit_applied').length, 0, 'no deposit row when none applied');
}

// Snapshot invoices without line_items treat the stored subtotal as the
// taxable base; deposit_applied inserts its own row before Total.
{
  const rows = computeOrderWaterfall({
    invoice: { id: 'i3', subtotal: 100, tax_rate: 0.1, deposit_applied: 25 },
    payments: [],
  });
  assert.equal(waterfallRow(rows, 'tax').taxable_base, 100);
  assert.equal(rowAmount(rows, 'tax'), 10);
  assert.equal(rowAmount(rows, 'deposit_applied'), -25);
  assert.equal(rowAmount(rows, 'total'), 85);
  assert.ok(rows.map((r) => r.key).indexOf('deposit_applied') < rows.map((r) => r.key).indexOf('total'));
}

// Discount-kind fee lines are normalized to negative even when stored
// positive; unknown kinds fall back to 'fee'; payments default to
// invoice.amount_paid when the list isn't passed.
{
  const fees = normalizeFeeLines([
    { kind: 'discount', amount: 7 }, { kind: 'mystery', amount: 3, label: 'Other' },
  ]);
  assert.equal(fees[0].amount_cents, -700);
  assert.equal(fees[1].kind, 'fee');
  const rows = computeOrderWaterfall({ invoice: { id: 'i4', subtotal: 50, amount_paid: 12.5 } });
  assert.equal(rowAmount(rows, 'total_paid'), 12.5, 'falls back to stored amount_paid');
  assert.equal(rowAmount(rows, 'balance_due'), 37.5);
}

// paymentCountsTowardInvoice mirrors recomputeInvoiceAfterPayments.
{
  assert.equal(paymentCountsTowardInvoice({ invoice_id: 'a', status: 'recorded' }, 'a'), true);
  assert.equal(paymentCountsTowardInvoice({ invoice_id: 'a', status: 'refunded' }, 'a'), true);
  assert.equal(paymentCountsTowardInvoice({ invoice_id: 'a', status: 'void' }, 'a'), false);
  assert.equal(paymentCountsTowardInvoice({ invoice_id: 'b', status: 'recorded' }, 'a'), false);
  assert.equal(paymentCountsTowardInvoice({ invoice_id: 'a', status: 'recorded', deleted: true }, 'a'), false);
}

// waterfallToCsv: header + fixed-2 amounts, labels escaped.
{
  const rows = computeOrderWaterfall({ invoice, payments });
  const csv = waterfallToCsv(rows);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'key,label,amount');
  assert.equal(lines.length, rows.length + 1);
  assert.equal(lines[1], 'subtotal,Subtotal,250.00');
  assert.equal(lines[6], 'new_subtotal,New Subtotal,272.50');
  assert.match(csv, /\ntax,Tax 6%,13\.20\n/);
  assert.match(csv, /balance_due,Balance Due,160\.70$/);
  const quoted = waterfallToCsv([{ key: 'x', label: 'Fee, "misc"', amount: 1.5 }]);
  assert.equal(quoted.split('\n')[1], 'x,"Fee, ""misc""",1.50');
}

// ── D-05: actor classification per source ──
{
  // Explicit actor_type wins (ProductActivity canonical).
  assert.equal(classifyOrderHistoryEvent({ actor_type: 'customer' }).actorType, 'customer');
  assert.equal(classifyOrderHistoryEvent({ actor_type: 'Vendor' }).actorType, 'vendor');
  assert.equal(classifyOrderHistoryEvent({ actor_type: 'employee' }).actorType, 'staff', 'synonym → staff');
  assert.equal(classifyOrderHistoryEvent({ actor_type: 'client', source: 'system' }).actorType, 'customer', 'explicit beats source');
  assert.equal(classifyOrderHistoryEvent({ details: { actor_type: 'system' } }).actorType, 'system');
  // OpportunityActivity source markers.
  assert.equal(classifyOrderHistoryEvent({ source: 'auto_followup', actor: 'sales@ccs.test' }).actorType, 'system');
  assert.equal(classifyOrderHistoryEvent({ source: 'manual', actor: 'sales@ccs.test' }).actorType, 'staff');
  assert.equal(classifyOrderHistoryEvent({ event_type: 'note', actor: 'jane@ccs.test', source: 'manual' }).cssClass, 'text-black');
  // Payment portal_source / email direction / flags.
  assert.equal(classifyOrderHistoryEvent({ portal_source: 'added from Customer Portal' }).actorType, 'customer');
  assert.equal(classifyOrderHistoryEvent({ direction: 'inbound', from: 'buyer@co.test' }).actorType, 'customer');
  assert.equal(classifyOrderHistoryEvent({ direction: 'outbound', actor: 'rep@ccs.test' }).actorType, 'staff');
  assert.equal(classifyOrderHistoryEvent({ direction: 'outbound', automated: true }).actorType, 'system', 'automated send');
  assert.equal(classifyOrderHistoryEvent({ vendor_id: 'v-9', actor: 'anyone' }).actorType, 'vendor');
  // Fallbacks: identity present → staff; bare row → system.
  assert.equal(classifyOrderHistoryEvent({ created_by: 'ops@ccs.test' }).actorType, 'staff');
  assert.equal(classifyOrderHistoryEvent({}).actorType, 'system');
  assert.deepEqual(ORDER_HISTORY_ACTOR_CSS, {
    staff: 'text-black', customer: 'text-green-600', vendor: 'text-blue-600', system: 'text-gray-500',
  });
}

// Merge: all four sources normalize + interleave chronologically (ascending),
// ties keep entry order, undated events sort last.
{
  const merged = mergeOrderHistorySources({
    activities: [
      { id: 'a1', event_type: 'stage_changed', summary: 'Stage → production', actor: 'sam@ccs.test', source: 'manual', created_date: '2026-11-01T10:00:00Z' },
      { id: 'a2', event_type: 'note', summary: 'Called customer', actor: 'sam@ccs.test', source: 'manual', occurred_at: '2026-11-01T10:00:00Z' },
    ],
    productEvents: [
      { id: 'pe1', actor_type: 'vendor', event_type: 'proof_uploaded', product_name: 'Pylon sign', occurred_at: '2026-10-31T09:00:00Z' },
    ],
    payments: [
      { id: 'pay1', amount: 285.7, method: 'card', status: 'recorded', paid_date: '2026-11-02', portal_source: 'added from Customer Portal' },
      { id: 'pay2', amount: -10, method: 'card', status: 'refunded', created_date: '2026-11-03T12:00:00Z', created_by: 'ap@ccs.test' },
    ],
    emails: [
      { id: 'e1', direction: 'inbound', subject: 'Re: proof', from: 'buyer@co.test', occurred_at: '2026-11-01T15:00:00Z' },
      { id: 'e2', subject: 'No date', direction: 'outbound', actor: 'rep@ccs.test' },
    ],
  });
  assert.equal(merged.length, 7);
  assert.deepEqual(merged.map((r) => r.id), ['pe1', 'a1', 'a2', 'e1', 'pay1', 'pay2', 'e2'],
    'chronological, stable on ties, undated last');
  assert.equal(merged[0].actor_type, 'vendor');
  assert.equal(merged[0].cssClass, 'text-blue-600');
  assert.equal(merged[1].actor_type, 'staff');
  assert.equal(merged[3].actor_type, 'customer', 'inbound email');
  assert.equal(merged[4].actor_type, 'customer', 'portal payment');
  assert.equal(merged[4].source, 'payment');
  assert.equal(merged[4].event_type, 'payment');
  assert.equal(merged[4].amount, 285.7);
  assert.match(merged[4].label, /Payment — Card \$285\.70/);
  assert.equal(merged[5].event_type, 'refund');
  assert.equal(merged[5].amount, -10);
  assert.equal(merged[6].source, 'email');
  assert.equal(merged[6].actor_type, 'staff');
  assert.ok(merged.every((r) => r.raw && typeof r.raw === 'object'));
}

// historyToCsv: fixed columns, one row per event, payment amounts signed-2.
{
  const merged = mergeOrderHistorySources({
    payments: [{ id: 'p', invoice_id: 'i', amount: -25, method: 'card', status: 'refunded', paid_date: '2026-11-02', created_by: 'ap@ccs.test' }],
    activities: [{ id: 'n', event_type: 'note', summary: 'Note, with "comma"', actor: 'me@x.test', created_date: '2026-11-01' }],
  });
  const csv = historyToCsv(merged);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'occurred_at,actor_type,actor,source,event_type,label,amount');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '2026-11-01,staff,me@x.test,activity,note,"Note, with ""comma""",');
  assert.match(lines[2], /^2026-11-02,staff,ap@ccs\.test,payment,refund,Refund — Card \$25\.00,-25\.00$/);
}

rmSync(resolve(here, '.tmp-wf-hist'), { recursive: true, force: true });
console.log('PASS order-waterfall-history');
