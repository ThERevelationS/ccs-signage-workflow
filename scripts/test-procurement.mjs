import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outRecv = resolve(here, '.tmp-procurement-recv.mjs');
const outBill = resolve(here, '.tmp-procurement-bill.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/procurement/receivingModel.js')], bundle: true, format: 'esm', outfile: outRecv, logLevel: 'silent' });
buildSync({ entryPoints: [resolve(here, '../src/components/procurement/progressBillingModel.js')], bundle: true, format: 'esm', outfile: outBill, logLevel: 'silent' });
const {
  LINE_STATUS, PO_ROLLUP, toPoStatus,
  deriveLineReceipt, derivePoReceipt, buildReceiptLines,
  receivingSummaryText, vendorNotifyMailto,
} = await import(pathToFileURL(outRecv).href);
const {
  DEFAULT_SCHEDULE, normalizeSchedule, milestoneAmounts,
  deriveBillingState, buildMilestoneInvoicePayload, buildEstimateBillingPayload,
  scheduleToEntity, scheduleFromEntity,
} = await import(pathToFileURL(outBill).href);

// ===================== receivingModel =====================

// --- deriveLineReceipt: per-line status + open/backorder + variance
let l = deriveLineReceipt({ description: 'ACM', quantity: 10, unit_cost: 25, quantity_received: 0 });
assert.equal(l.status, LINE_STATUS.OPEN);
assert.equal(l.open, 10);
assert.equal(l.backordered, 0, 'no receipt yet — open qty is not backorder');
assert.equal(l.ordered_cost, 250);
assert.equal(l.variance_qty, -10);
assert.equal(l.variance_cost, -250);

l = deriveLineReceipt({ quantity: 10, unit_cost: 25, quantity_received: 4 }, { poHasReceipt: true });
assert.equal(l.status, LINE_STATUS.PARTIAL);
assert.equal(l.open, 6);
assert.equal(l.backordered, 6, 'open remainder becomes backorder once the PO has a receipt');
assert.equal(l.received_cost, 100);

l = deriveLineReceipt({ quantity: 10, unit_cost: 25, quantity_received: 10 });
assert.equal(l.status, LINE_STATUS.RECEIVED);
assert.equal(l.open, 0);
assert.equal(l.backordered, 0);
assert.equal(l.variance_cost, 0);

// fractional quantities + tolerance
l = deriveLineReceipt({ quantity: 2.5, unit_cost: 1.33, quantity_received: 2.49 });
assert.equal(l.status, LINE_STATUS.PARTIAL, 'open remainder above EPS stays partial');
l = deriveLineReceipt({ quantity: 2.5, unit_cost: 1.33, quantity_received: 2.496 });
assert.equal(l.status, LINE_STATUS.RECEIVED, 'open remainder within EPS counts as received');
l = deriveLineReceipt({ quantity: 2.5, unit_cost: 1.33, quantity_received: 2.5 });
assert.equal(l.status, LINE_STATUS.RECEIVED);

// --- derivePoReceipt: rollup transitions open → partial → received
const po = {
  po_number: 'PO-9', vendor_name: 'Acme', status: 'sent', expected_date: '2099-01-01',
  line_items: [
    { description: 'A', quantity: 10, unit_cost: 5, quantity_received: 0 },
    { description: 'B', quantity: 4, unit_cost: 10, quantity_received: 0 },
  ],
};
let r = derivePoReceipt(po, { today: '2026-01-01' });
assert.equal(r.rollup, PO_ROLLUP.OPEN);
assert.equal(r.status, 'sent', 'rollup maps back to the entity status enum');
assert.equal(r.any_received, false);
assert.equal(r.totals.backordered, 0);
assert.equal(r.percent_received, 0);

po.line_items[0].quantity_received = 10;
r = derivePoReceipt(po, { today: '2026-01-01' });
assert.equal(r.rollup, PO_ROLLUP.PARTIAL);
assert.equal(r.status, 'partially_received');
assert.equal(r.any_received, true);
assert.equal(r.totals.backordered, 4, 'line B remainder counts as backorder');
assert.equal(r.lines[0].status, LINE_STATUS.RECEIVED);
assert.equal(r.lines[1].status, LINE_STATUS.OPEN);
assert.equal(r.lines[1].backordered, 4);
assert.equal(r.percent_received, Math.round((10 / 14) * 1000) / 10);

po.line_items[1].quantity_received = 4;
r = derivePoReceipt(po, { today: '2026-01-01' });
assert.equal(r.rollup, PO_ROLLUP.RECEIVED);
assert.equal(r.status, 'received');
assert.equal(r.complete, true);
assert.equal(r.percent_received, 100);
assert.equal(r.totals.backordered, 0);

// overdue stamp: past expected_date on an open/partial PO
r = derivePoReceipt({ ...po, status: 'sent', expected_date: '2020-01-01', line_items: [{ description: 'A', quantity: 2, unit_cost: 1, quantity_received: 0 }] }, { today: '2026-01-01' });
assert.equal(r.overdue, true);
assert.equal(r.lines[0].overdue, true);

// --- buildReceiptLines: mirrors the backend receive_items contract
po.line_items[0].quantity_received = 3;
r = derivePoReceipt(po, { today: '2026-01-01' });
let built = buildReceiptLines({ 0: '7', 1: '' }, r);
assert.equal(built.errors.length, 0);
assert.deepEqual(built.lines, [{ index: 0, quantity: 7 }]);

built = buildReceiptLines({ 0: '8' }, r);
assert.equal(built.lines.length, 0);
assert.match(built.errors[0], /exceeds the open quantity on line 1/i, 'client pre-check matches the server 409 guard');

built = buildReceiptLines({ 9: '1' }, r);
assert.match(built.errors[0], /missing line/i);

built = buildReceiptLines({}, r);
assert.match(built.errors[0], /at least one line/i);

// --- summary + mailto for vendor notify
const text = receivingSummaryText({ po_number: 'PO-9', vendor_name: 'Acme', expected_date: '2020-01-01', status: 'partially_received', line_items: [{ description: 'A', quantity: 10, unit_cost: 5, quantity_received: 6 }] });
assert.match(text, /PO-9/);
assert.match(text, /BACKORDER 4/);
assert.match(text, /backorder ETA/i);
const m = vendorNotifyMailto({ po_number: 'PO-9', vendor_email: 'sales@acme.test', status: 'partially_received', line_items: [{ description: 'A', quantity: 10, unit_cost: 5, quantity_received: 6 }] });
assert.equal(m.to, 'sales@acme.test');
assert.match(m.href, /^mailto:sales%40acme\.test\?subject=/);
assert.match(m.subject, /backorder/i);

// ===================== progressBillingModel =====================

// --- normalizeSchedule: clamps pct, caps cumulative at 100, auto-labels
let sched = normalizeSchedule([{ label: 'Deposit', pct: 50 }, { label: 'Fab', pct: 30 }, { label: 'Install', pct: 40 }]);
assert.deepEqual(sched.map((s) => s.pct), [50, 30, 20], 'tail trimmed so cumulative never exceeds 100');
sched = normalizeSchedule([{ label: '', pct: 25 }, { label: 'B', pct: -5 }, { label: 'C', pct: 'abc' }]);
assert.equal(sched.length, 1, 'non-positive/non-numeric pcts dropped');
assert.equal(sched[0].label, 'Milestone 1', 'blank labels auto-named');
assert.equal(normalizeSchedule(undefined).length, 0);

// --- milestoneAmounts: penny-safe allocation sums exactly to total
let amounts = milestoneAmounts(DEFAULT_SCHEDULE, 100.01);
assert.deepEqual(amounts.map((a) => a.amount), [50.01, 50], 'last milestone takes the remainder');
assert.equal(amounts[1].cumulative_amount, 100.01);
amounts = milestoneAmounts([{ label: 'A', pct: 33.33 }, { label: 'B', pct: 33.33 }, { label: 'C', pct: 33.34 }], 999.99);
assert.equal(amounts.reduce((s, a) => s + a.amount, 0), 999.99, 'amounts always sum to job total');
assert.deepEqual(amounts.map((a) => a.cumulative_pct), [33.33, 66.66, 100]);

// --- deriveBillingState: next billable milestone + coverage
let st = deriveBillingState({ jobTotal: 10000, schedule: DEFAULT_SCHEDULE, invoiced: 0 });
assert.equal(st.next.label, 'Deposit');
assert.equal(st.next.amount, 5000);
assert.equal(st.remaining, 10000);
assert.equal(st.complete, false);
assert.equal(st.milestones[0].status, 'open');

st = deriveBillingState({ jobTotal: 10000, schedule: DEFAULT_SCHEDULE, invoiced: 5000 });
assert.equal(st.milestones[0].status, 'billed');
assert.equal(st.next.label, 'Completion');
assert.equal(st.next.amount, 5000);
assert.equal(st.next.is_final, true);
assert.equal(st.billed_pct, 50);

st = deriveBillingState({ jobTotal: 10000, schedule: DEFAULT_SCHEDULE, invoiced: 2500 });
assert.equal(st.milestones[0].status, 'partial');
assert.equal(st.milestones[0].covered, 2500);
assert.equal(st.next.label, 'Deposit', 'partial coverage bills the rest of that milestone first');
assert.equal(st.next.amount, 2500);

// caps: invoiced can exceed the schedule but never reports > 100% or negative remaining
st = deriveBillingState({ jobTotal: 10000, schedule: DEFAULT_SCHEDULE, invoiced: 12000 });
assert.equal(st.next, null, 'nothing billable past 100%');
assert.equal(st.remaining, -2000);
assert.equal(st.over_billed, 2000);
assert.equal(st.billed_pct, 100, 'pct display clamps at 100');
assert.equal(st.milestones.every((x) => x.status === 'billed'), true);

st = deriveBillingState({ jobTotal: 10000, schedule: DEFAULT_SCHEDULE, invoiced: 10000 });
assert.equal(st.complete, true);
assert.equal(st.next, null);

// under-100% schedule: unscheduled remainder is visible, final flag stays off
st = deriveBillingState({ jobTotal: 10000, schedule: [{ label: 'Deposit', pct: 50 }], invoiced: 0 });
assert.equal(st.unscheduled_pct, 50);
assert.equal(st.unscheduled_amount, 5000);
assert.equal(st.next.is_final, false, 'last scheduled milestone is not final while remainder is unscheduled');

// zero/negative total → nothing billable
st = deriveBillingState({ jobTotal: 0, schedule: DEFAULT_SCHEDULE, invoiced: 0 });
assert.equal(st.next, null);
assert.equal(st.complete, false);

// --- buildMilestoneInvoicePayload: exact create_invoice contract
const wo = { id: 'wo1', title: 'Lobby sign', customer_id: 'c1', client_name: 'Acme', estimate_id: 'e1', opportunity_id: 'o1' };
const payload = buildMilestoneInvoicePayload({ workOrder: wo, milestone: { index: 0, label: 'Deposit', pct: 50, amount: 5000 }, jobTotal: 10000, schedule: DEFAULT_SCHEDULE, requestKey: 'k1' });
assert.equal(payload.action, 'create_invoice');
assert.equal(payload.creation_request_key, 'k1');
assert.equal(payload.fields.customer_id, 'c1');
assert.equal(payload.fields.work_order_id, 'wo1');
assert.equal(payload.fields.estimate_id, 'e1');
assert.equal(payload.fields.opportunity_id, 'o1');
assert.deepEqual(payload.fields.line_items, [{ description: 'Deposit (50%) — progress billing — Lobby sign', quantity: 1, unit_price: 5000, taxable: false }]);
assert.equal(payload.fields.source_summary.kind, 'progress_billing');
assert.equal(payload.fields.source_summary.milestone_label, 'Deposit');

// --- buildEstimateBillingPayload: deposit vs final fallback
let fb = buildEstimateBillingPayload({ estimateId: 'e1', milestone: { label: 'Deposit', pct: 50, amount: 5000 }, isFinal: false });
assert.equal(fb.action, 'create_from_estimate');
assert.equal(fb.billing_mode, 'deposit');
assert.equal(fb.deposit_amount, 5000);
fb = buildEstimateBillingPayload({ estimateId: 'e1', milestone: { label: 'Completion', pct: 50, amount: 5000 }, isFinal: true });
assert.equal(fb.billing_mode, 'final');
assert.equal('deposit_amount' in fb, false, 'final mode bills the server-computed remainder');

// --- scheduleToEntity/scheduleFromEntity: WorkOrder.billing_schedule round trip
const messySchedule = [
  { label: 'Deposit', pct: 50, note: 'due at signing' },
  { label: '  ', pct: 30 },
  { label: 'Install', pct: 80 },
  { label: 'junk', pct: 'abc' },
  { label: 'neg', pct: -5 },
  null,
  'not a row',
];
const storedSchedule = scheduleToEntity(messySchedule);
assert.equal(storedSchedule.length, 3, 'junk rows (bad/non-positive pct, non-objects) dropped');
assert.deepEqual(storedSchedule.map((r) => r.pct), [50, 30, 20], 'entity write trims cumulative pct to 100');
assert.equal(storedSchedule[0].note, 'due at signing', 'note survives normalization');
assert.equal(storedSchedule[1].label, 'Milestone 2', 'blank labels still auto-named');
assert.equal('note' in storedSchedule[1], false, 'rows without notes stay clean');
assert.deepEqual(scheduleFromEntity(storedSchedule), storedSchedule, 'stored rows round-trip unchanged');
assert.deepEqual(scheduleFromEntity(scheduleToEntity(messySchedule)), storedSchedule);

// scheduleFromEntity tolerates missing/garbage field values
assert.deepEqual(scheduleFromEntity(undefined), []);
assert.deepEqual(scheduleFromEntity(null), []);
assert.deepEqual(scheduleFromEntity('Deposit 50%'), []);
assert.deepEqual(scheduleFromEntity({ label: 'A', pct: 50 }), []);
assert.deepEqual(scheduleFromEntity([]), []);
assert.deepEqual(scheduleFromEntity([{ label: 'x', pct: 0 }, { pct: -2 }, 42]), [], 'junk-only field normalizes to empty');

// an under-100% entity schedule survives intact (unscheduled remainder is legal)
assert.deepEqual(scheduleFromEntity([{ label: 'Deposit', pct: 40 }]), [{ label: 'Deposit', pct: 40 }]);

console.log('PASS procurement (111 assertions)');
