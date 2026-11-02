// Unit checks for base44/shared/accountingAlertsModel.ts (masterplan I-07):
// Accounting Home alerts feed — payment/conversion/variance/unbatched/
// unmapped/overdue/large-invoice alert generators + merged deduped feed.
// esbuild-bundle pattern — same as test-alert-subscriptions.mjs.
//
// Run: node scripts/test-accounting-alerts.mjs  →  prints "PASS accounting-alerts"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-accounting-alerts-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/accountingAlertsModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  ACCOUNTING_ALERT_KINDS,
  ACCOUNTING_ALERT_SEVERITY,
  ACCOUNTING_ALERT_LABELS,
  alertDedupeKey,
  paymentAlerts,
  conversionAlerts,
  varianceAlerts,
  unbatchedAlert,
  unmappedAlert,
  invoiceAlerts,
  accountingAlertFeed,
} = await import(pathToFileURL(out).href);

// Fixed clock — every window/age check anchors here.
const NOW = '2026-11-02T12:00:00.000Z';

// ---------------------------------------------------------------------------
// registry — spec'd 8 kinds; severity + label maps cover every kind
// ---------------------------------------------------------------------------
assert.equal(ACCOUNTING_ALERT_KINDS.length, 8, '8 alert kinds');
for (const k of ['payment_received', 'payment_refunded', 'estimate_converted', 'batch_variance', 'unbatched_payments', 'gl_unmapped', 'overdue_invoice', 'large_invoice']) {
  assert.ok(ACCOUNTING_ALERT_KINDS.includes(k), `kind ${k}`);
  assert.ok(ACCOUNTING_ALERT_SEVERITY[k], `severity for ${k}`);
  assert.ok(ACCOUNTING_ALERT_LABELS[k], `label for ${k}`);
}
assert.equal(ACCOUNTING_ALERT_SEVERITY.overdue_invoice, 'critical', 'overdue severity matches notificationModel invoice_overdue');
assert.equal(ACCOUNTING_ALERT_SEVERITY.estimate_converted, 'celebration', 'conversion celebrates');
assert.equal(alertDedupeKey('payment_received', 'p1'), 'acctalert:payment_received:p1', 'dedupe key format');

// ---------------------------------------------------------------------------
// paymentAlerts — in-window receipts + refunds
// ---------------------------------------------------------------------------
{
  const rows = paymentAlerts([
    { id: 'p1', amount: 120, status: 'recorded', paid_date: '2026-11-02', invoice_id: 'inv1', customer_name: 'Acme', method: 'check', reference_number: '4412' },
  ], { now: NOW });
  assert.equal(rows.length, 1, 'in-window payment alerts');
  assert.equal(rows[0].kind, 'payment_received');
  assert.equal(rows[0].title, '$120.00 from Acme', 'spec title $X from <customer>');
  assert.equal(rows[0].deep_link, '/Invoices?invoice=inv1', 'spec deep link');
  assert.equal(rows[0].severity, 'info');
  assert.equal(rows[0].id, 'acctalert:payment_received:p1', 'dedupe key on id');
  assert.equal(rows[0].created_at, '2026-11-02T00:00:00.000Z', 'paid_date anchors created_at');
  assert.match(rows[0].message, /check/, 'method in message');
  assert.match(rows[0].message, /4412/, 'reference in message');
}
{
  // outside default 24h window → nothing; wider window → back in
  const p = { id: 'p2', amount: 50, status: 'recorded', paid_date: '2026-10-31', invoice_id: 'inv9', customer_name: 'Old' };
  assert.equal(paymentAlerts([p], { now: NOW }).length, 0, 'outside 24h excluded');
  assert.equal(paymentAlerts([p], { now: NOW, window_hours: 72 }).length, 1, 'window_hours param widens');
  // future-dated never alerts
  assert.equal(paymentAlerts([{ id: 'p3', amount: 5, status: 'recorded', paid_date: '2026-11-05' }], { now: NOW }).length, 0, 'future payment excluded');
  // void + zero never alert
  assert.equal(paymentAlerts([{ id: 'p4', amount: 9, status: 'void', paid_date: '2026-11-02' }], { now: NOW }).length, 0, 'void excluded');
  assert.equal(paymentAlerts([{ id: 'p5', amount: 0, status: 'recorded', paid_date: '2026-11-02' }], { now: NOW }).length, 0, 'zero amount moved nothing');
}
{
  // refund spellings → payment_refunded
  const refunds = paymentAlerts([
    { id: 'r1', amount: -40, status: 'refunded', paid_date: '2026-11-02', refund_of_payment_id: 'p1', invoice_id: 'inv1', customer_name: 'Acme' },
    { id: 'r2', amount: -10, status: 'recorded', paid_date: '2026-11-02', invoice_id: 'inv2', customer_name: 'Beta' },
    { id: 'r3', amount: 25, status: 'refunded', paid_date: '2026-11-02', invoice_id: 'inv3', customer_name: 'Gamma' },
  ], { now: NOW });
  assert.equal(refunds.length, 3, 'all three refund spellings alert');
  for (const r of refunds) {
    assert.equal(r.kind, 'payment_refunded', 'refund kind');
    assert.equal(r.severity, 'warning', 'refund severity');
    assert.match(r.title, /Refund of \$/, 'refund title');
  }
  // no invoice → generic link; no name → Customer fallback
  const noInv = paymentAlerts([{ id: 'p6', amount: 3, status: 'recorded', paid_date: '2026-11-02' }], { now: NOW });
  assert.equal(noInv[0].deep_link, '/Invoices', 'missing invoice → /Invoices');
  assert.match(noInv[0].title, /from Customer/, 'customer fallback');
}

// ---------------------------------------------------------------------------
// conversionAlerts — recently converted estimates
// ---------------------------------------------------------------------------
{
  const rows = conversionAlerts([
    { id: 'e1', status: 'won', project_name: 'Channel Letters', client_name: 'Acme', quote_total: 2400, updated_date: '2026-11-02T10:00:00Z' },
    { id: 'e2', status: 'sent', project_name: 'Still Out', updated_date: '2026-11-02T10:00:00Z' },
    { id: 'e3', status: 'draft', updated_date: '2026-11-02T10:00:00Z' },
  ], { now: NOW });
  assert.equal(rows.length, 1, 'only the won estimate alerts');
  assert.equal(rows[0].kind, 'estimate_converted');
  assert.equal(rows[0].severity, 'celebration');
  assert.equal(rows[0].deep_link, '/EstimateDetail?id=e1');
  assert.match(rows[0].title, /Channel Letters converted/);
  assert.match(rows[0].message, /Acme/, 'customer in message');
  assert.match(rows[0].message, /\$2,400\.00/, 'quote total in message');
}
{
  // precedence spellings: converted_at stamp, flag, approved+wo, sales_stage won, bare wo link
  const spells = [
    { id: 'c1', converted_at: '2026-11-02T09:00:00Z', status: 'approved', project_name: 'A' },
    { id: 'c2', converted_to_work_order: true, status: 'approved', project_name: 'B', updated_date: '2026-11-02T09:00:00Z' },
    { id: 'c3', status: 'approved', work_order_id: 'w1', project_name: 'C', updated_date: '2026-11-02T09:00:00Z' },
    { id: 'c4', sales_stage: 'won', sales_stage_changed_at: '2026-11-02T09:00:00Z', project_name: 'D' },
    { id: 'c5', status: 'sent', work_order_id: 'w2', project_name: 'E', updated_date: '2026-11-02T09:00:00Z' },
  ];
  assert.equal(conversionAlerts(spells, { now: NOW }).length, 5, 'every conversion spelling alerts');
  // exclusions: out-of-window, archived/cancelled stale links, templates
  assert.equal(conversionAlerts([{ id: 'x1', status: 'won', updated_date: '2026-10-01' }], { now: NOW }).length, 0, 'stale conversion outside window');
  assert.equal(conversionAlerts([{ id: 'x2', status: 'archived', work_order_id: 'w9', updated_date: '2026-11-02' }], { now: NOW }).length, 0, 'archived stale wo link excluded');
  assert.equal(conversionAlerts([{ id: 'x3', status: 'won', is_template: true, updated_date: '2026-11-02' }], { now: NOW }).length, 0, 'template excluded');
}

// ---------------------------------------------------------------------------
// varianceAlerts — |variance| ≥ threshold_cents (default 1 = any variance)
// ---------------------------------------------------------------------------
{
  const rows = varianceAlerts([
    { id: 'b1', batch_number: 'REC-0042', status: 'closed', closed_at: '2026-11-01T18:00:00Z', expected_total: 500, collected_total: 499.85, cash_adjustment: 0, variance: -0.15, location: 'Front' },
    { id: 'b2', batch_number: 'REC-0043', status: 'closed', closed_at: '2026-11-01T19:00:00Z', expected_total: 100, collected_total: 100, variance: 0 },
    { id: 'b3', batch_number: 'REC-0044', status: 'open', closed_at: '2026-11-01T20:00:00Z', variance: 9 },
  ]);
  assert.equal(rows.length, 1, 'only the closed non-zero batch flags');
  assert.equal(rows[0].kind, 'batch_variance');
  assert.equal(rows[0].severity, 'warning');
  assert.equal(rows[0].deep_link, '/Reconciliation');
  assert.match(rows[0].title, /REC-0042 short \$0\.15/, 'short direction + amount');
  assert.match(rows[0].message, /Front/, 'location in message');
}
{
  // threshold param: 20c suppresses the 15c variance; computed-from-parts path
  assert.equal(varianceAlerts([{ id: 'b1', batch_number: 'A', variance: -0.15 }], { threshold_cents: 20 }).length, 0, 'threshold suppresses small variance');
  const computed = varianceAlerts([{ id: 'b4', batch_number: 'B', status: 'closed', closed_at: '2026-11-01', expected_total: 200, collected_total: 201, cash_adjustment: 0.5 }]);
  assert.equal(computed.length, 1, 'variance computed from parts when field absent');
  assert.match(computed[0].title, /over \$1\.50/, 'over direction');
}

// ---------------------------------------------------------------------------
// unbatchedAlert — ONE grouped alert for stale undeposited payments
// ---------------------------------------------------------------------------
{
  const rows = unbatchedAlert([
    { id: 'u1', amount: 80, status: 'recorded', paid_date: '2026-10-29' },
    { id: 'u2', amount: 20, status: 'recorded', paid_date: '2026-10-28' },
    { id: 'u3', amount: 50, status: 'recorded', paid_date: '2026-11-02' },         // too fresh
    { id: 'u4', amount: 60, status: 'recorded', paid_date: '2026-10-28', reconciliation_batch_id: 'b1' }, // batched
    { id: 'u5', amount: 70, status: 'void', paid_date: '2026-10-28' },            // void
    { id: 'u6', amount: -15, status: 'refunded', paid_date: '2026-10-28' },       // refund row
  ], { now: NOW });
  assert.ok(rows && !Array.isArray(rows), 'grouped = single object, not list');
  assert.equal(rows.kind, 'unbatched_payments');
  assert.equal(rows.id, 'acctalert:unbatched_payments:open', 'stable grouped dedupe id');
  assert.equal(rows.count, 2, 'two stale unbatched payments');
  assert.equal(rows.total_cents, 10000, '$100 total cents');
  assert.match(rows.title, /2 payments not yet batched/);
  assert.match(rows.message, /\$100\.00 awaiting deposit/, 'summed total in message');
  assert.equal(rows.created_at, '2026-10-28T00:00:00.000Z', 'oldest payment anchors');
  assert.equal(unbatchedAlert([{ id: 'u3', amount: 50, status: 'recorded', paid_date: '2026-11-02' }], { now: NOW }), null, 'nothing stale → null');
  assert.equal(unbatchedAlert([{ id: 'u7', amount: 5, status: 'recorded', paid_date: '2026-11-02' }], { now: NOW, age_days: 0 }).count, 1, 'age_days=0 flags fresh rows');
}

// ---------------------------------------------------------------------------
// unmappedAlert — posted invoices with splits to ''/'unmapped' (glSplitModel)
// ---------------------------------------------------------------------------
{
  const rows = unmappedAlert([
    { id: 'i1', invoice_number: 'INV-1', status: 'sent', customer_display_name: 'Acme', issue_date: '2026-11-01', income_account_splits: [{ income_account_code: '4000', amount: 100 }, { income_account_code: '', amount: 25 }] },
    { id: 'i2', invoice_number: 'INV-2', status: 'paid', income_account_splits: [{ income_account_code: 'unmapped', amount: 10 }] },
    { id: 'i3', invoice_number: 'INV-3', status: 'sent', income_account_splits: [{ income_account_code: '4000', amount: 50 }] },
    { id: 'i4', invoice_number: 'INV-4', status: 'draft', income_account_splits: [{ income_account_code: '', amount: 5 }] },
    { id: 'i5', invoice_number: 'INV-5', status: 'sent' },
  ]);
  assert.equal(rows.length, 2, 'posted invoices with unmapped splits only');
  for (const r of rows) {
    assert.equal(r.kind, 'gl_unmapped');
    assert.equal(r.severity, 'warning');
    assert.match(r.deep_link, /\/Invoices\?invoice=/);
  }
  assert.equal(rows[0].total_cents + rows[1].total_cents, 3500, 'unmapped cents summed across both');
  const inv1 = rows.find((r) => r.source_id === 'i1');
  assert.match(inv1.title, /INV-1 has unmapped GL splits/);
  assert.match(inv1.message, /\$25\.00 posting to unmapped GL/, 'unmapped amount in message');
  assert.match(inv1.message, /Acme/, 'customer in message');
}

// ---------------------------------------------------------------------------
// invoiceAlerts — overdue_invoice + large_invoice
// ---------------------------------------------------------------------------
{
  const rows = invoiceAlerts([
    { id: 'i1', invoice_number: 'INV-1', status: 'sent', balance_due: 300, due_date: '2026-10-28', customer_display_name: 'Acme' },
    { id: 'i2', invoice_number: 'INV-2', status: 'partially_paid', balance_due: 10, due_date: '2026-11-01' },
    { id: 'i3', invoice_number: 'INV-3', status: 'sent', balance_due: 0, due_date: '2026-10-01' },
    { id: 'i4', invoice_number: 'INV-4', status: 'paid', balance_due: 0, due_date: '2026-10-01' },
    { id: 'i5', invoice_number: 'INV-5', status: 'sent', balance_due: 9, due_date: '2026-12-01' },
  ], { now: NOW });
  const overdue = rows.filter((r) => r.kind === 'overdue_invoice');
  assert.equal(overdue.length, 2, 'two overdue invoices');
  assert.equal(overdue[0].severity, 'critical');
  const inv1 = overdue.find((r) => r.source_id === 'i1');
  assert.match(inv1.title, /INV-1 overdue/);
  assert.match(inv1.message, /\$300\.00 open/, 'open balance in message');
  assert.match(inv1.message, /5d late/, 'days-late count');
}
{
  const rows = invoiceAlerts([
    { id: 'L1', invoice_number: 'INV-900', status: 'sent', total: 15000, issue_date: '2026-11-02', customer_display_name: 'BigCo' },
    { id: 'L2', invoice_number: 'INV-901', status: 'sent', total: 15000, issue_date: '2026-09-01' },   // old issue — outside window
    { id: 'L3', invoice_number: 'INV-902', status: 'sent', total: 500, issue_date: '2026-11-02' },    // under threshold
    { id: 'L4', invoice_number: 'INV-903', status: 'draft', total: 99999, issue_date: '2026-11-02' }, // draft never posts
  ], { now: NOW });
  const large = rows.filter((r) => r.kind === 'large_invoice');
  assert.equal(large.length, 1, 'only the fresh posted invoice over threshold');
  assert.equal(large[0].source_id, 'L1');
  assert.match(large[0].title, /\$15,000\.00/);
  assert.equal(invoiceAlerts([{ id: 'L1', invoice_number: 'X', status: 'sent', total: 15000, issue_date: '2026-11-02' }], { now: NOW, large_invoice_cents: 2000000 }).length, 0, 'threshold param suppresses');
}

// ---------------------------------------------------------------------------
// accountingAlertFeed — merge, dedupe, newest-first sort, limit
// ---------------------------------------------------------------------------
{
  const feed = accountingAlertFeed({
    payments: [
      { id: 'p1', amount: 120, status: 'recorded', paid_date: '2026-11-02', invoice_id: 'inv1', customer_name: 'Acme' },
      { id: 'p1', amount: 120, status: 'recorded', paid_date: '2026-11-02', invoice_id: 'inv1', customer_name: 'Acme' }, // dup id
      { id: 'p9', amount: 30, status: 'recorded', paid_date: '2026-10-28' },                                            // unbatched stale
    ],
    invoices: [
      { id: 'i1', invoice_number: 'INV-1', status: 'sent', balance_due: 300, due_date: '2026-10-28' },
    ],
    estimates: [
      { id: 'e1', status: 'won', project_name: 'Conv', updated_date: '2026-11-02T06:00:00Z' },
    ],
    batches: [
      { id: 'b1', batch_number: 'REC-1', status: 'closed', closed_at: '2026-11-01T18:00:00Z', variance: 0.25 },
    ],
  }, { now: NOW });
  const kinds = feed.map((a) => a.kind);
  for (const k of ['payment_received', 'estimate_converted', 'batch_variance', 'unbatched_payments', 'overdue_invoice']) {
    assert.ok(kinds.includes(k), `feed covers ${k}`);
  }
  assert.equal(feed.filter((a) => a.id === 'acctalert:payment_received:p1').length, 1, 'duplicate source id deduped');
  for (const a of feed) {
    assert.match(a.id, /^acctalert:[a-z_]+:.+/, 'every alert carries acctalert dedupe key');
    for (const f of ['kind', 'title', 'message', 'deep_link', 'severity', 'created_at']) {
      assert.ok(f in a, `alert has ${f}`);
    }
  }
  // newest-first: payment (Nov 2 00:00) ties est conversion (Nov 2 06:00 >) —
  // conversion is newest, stale unbatched (Oct 28) sits last.
  assert.equal(feed[0].kind, 'estimate_converted', 'newest event first');
  assert.equal(feed[feed.length - 1].kind, 'unbatched_payments', 'oldest anchor last');
  const sorted = [...feed].sort((a, b) => b.created_at.localeCompare(a.created_at));
  assert.deepEqual(feed.map((a) => a.id), sorted.map((a) => a.id), 'feed is newest-first sorted');
  // limit
  const capped = accountingAlertFeed({ payments: [{ id: 'p1', amount: 1, status: 'recorded', paid_date: '2026-11-02' }, { id: 'p2', amount: 2, status: 'recorded', paid_date: '2026-11-02' }] }, { now: NOW, limit: 1 });
  assert.equal(capped.length, 1, 'limit caps merged feed');
  // empty inputs → empty feed (fail-soft for the home strip)
  assert.deepEqual(accountingAlertFeed({}, { now: NOW }), [], 'empty in → empty feed');
  assert.deepEqual(accountingAlertFeed(null, null), [], 'junk in → empty feed');
}

rmSync(out);
console.log('PASS accounting-alerts');
