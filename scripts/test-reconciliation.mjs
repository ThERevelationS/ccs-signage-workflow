import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-reconciliation.mjs');
const outShared = resolve(here, '.tmp-reconciliation-shared.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/reconciliation/reconciliationModel.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { TENDER_BUCKETS, BUCKET_LABELS, bucketFor, unreconciledPayments, batchTotals, computeVariance, nextBatchNumber } = await import(pathToFileURL(out).href);

// --- bucket mapping: the Payment.method enum folds into four tender buckets
assert.equal(bucketFor('cash'), 'cash');
assert.equal(bucketFor('Check'), 'check');
assert.equal(bucketFor('card'), 'card');
assert.equal(bucketFor('ach'), 'other', 'ach counts with other');
assert.equal(bucketFor('financing'), 'other', 'financing counts with other');
assert.equal(bucketFor(''), 'other', 'blank counts as other');
assert.equal(bucketFor(undefined), 'other');
assert.deepEqual(TENDER_BUCKETS, ['cash', 'check', 'card', 'other']);
assert.equal(BUCKET_LABELS.other, 'Other');

// --- nextBatchNumber: REC-#### sequence, padded, ignores malformed numbers
assert.equal(nextBatchNumber([]), 'REC-0001');
assert.equal(nextBatchNumber(undefined), 'REC-0001');
assert.equal(nextBatchNumber([{ batch_number: 'REC-0001' }]), 'REC-0002');
assert.equal(nextBatchNumber([{ batch_number: 'REC-0007' }, { batch_number: 'REC-0003' }]), 'REC-0008', 'highest suffix wins');
assert.equal(nextBatchNumber([{ batch_number: 'REC-9' }]), 'REC-0010', 'unpadded legacy numbers still advance');
assert.equal(nextBatchNumber([{ batch_number: 'INV-1042' }, { batch_number: 'nope' }, {}]), 'REC-0001', 'foreign/malformed numbers ignored');
assert.equal(nextBatchNumber([{ batch_number: 'rec-0042' }]), 'REC-0043', 'case-insensitive prefix');

// --- batchTotals: sums recorded payments by bucket
const payments = [
  { id: 'p1', amount: 100, method: 'cash', status: 'recorded' },
  { id: 'p2', amount: 50.25, method: 'cash', status: 'recorded' },
  { id: 'p3', amount: 200, method: 'card', status: 'recorded' },
  { id: 'p4', amount: 75, method: 'check', status: 'recorded' },
  { id: 'p5', amount: 30, method: 'ach', status: 'recorded' },
  { id: 'p6', amount: 20, method: 'other', status: 'recorded' },
  { id: 'p7', amount: 999, method: 'cash', status: 'void' },
  { id: 'p8', amount: 888, method: 'card', status: 'refunded' },
];
const totals = batchTotals(payments);
assert.equal(totals.cash, 150.25);
assert.equal(totals.card, 200);
assert.equal(totals.check, 75);
assert.equal(totals.other, 50, 'ach + other fold into the other bucket');
assert.equal(totals.total, 475.25);
assert.equal(totals.count, 6, 'void/refunded excluded');
assert.equal(totals.by_method.ach, 30, 'raw method detail preserved');
assert.equal(totals.by_method.cash, 150.25);
assert.deepEqual(batchTotals([]), { cash: 0, check: 0, card: 0, other: 0, total: 0, count: 0, by_method: {} });

// --- computeVariance: collected + adjustment - expected
assert.equal(computeVariance(100, 100, 0), 0);
assert.equal(computeVariance(100, 95, 0), -5, 'short by five');
assert.equal(computeVariance(100, 105, 0), 5, 'over by five');
assert.equal(computeVariance(100, 95, 10), 5, 'adjustment offsets a short count');
assert.equal(computeVariance(100, 100, -2.5), -2.5);
assert.equal(computeVariance(0, 0, 0), 0);
assert.equal(computeVariance('100', '90.005', 0), -10, 'coerces strings and rounds cents');

// --- unreconciledPayments: recorded + no batch link + not swept into a batch
const batch = { payment_ids: ['p3'] };
const mixed = [
  { id: 'p1', status: 'recorded', reconciliation_batch_id: '' },
  { id: 'p2', status: 'recorded' },
  { id: 'p3', status: 'recorded' },                    // listed in batch.payment_ids
  { id: 'p4', status: 'recorded', reconciliation_batch_id: 'b1' },
  { id: 'p5', status: 'void' },
  { id: 'p6', status: 'refunded' },
];
const pending = unreconciledPayments(mixed, [batch]).map((p) => p.id);
assert.deepEqual(pending, ['p1', 'p2'], 'only un-swept recorded payments qualify');
assert.deepEqual(unreconciledPayments(mixed, []).map((p) => p.id), ['p1', 'p2', 'p3'], 'batch-less rows pass when no batches exist');
assert.deepEqual(unreconciledPayments([], []), []);
assert.deepEqual(unreconciledPayments(undefined, undefined), []);

// ==========================================================================
// I-03 shared model — base44/shared/reconciliationModel.ts (integer cents,
// filtered candidates, close/reopen plans with status-tagged guard errors).
// ==========================================================================
buildSync({ entryPoints: [resolve(here, '../base44/shared/reconciliationModel.ts')], bundle: true, format: 'esm', outfile: outShared, logLevel: 'silent' });
const M = await import(pathToFileURL(outShared).href);
const {
  toCents, fromCents, moneyRound, batchCandidates, batchTotals: sBatchTotals,
  normalizeAdjustments, adjustmentsAmountCents, closePlan, reopenPlan,
  isAdminActor, auditNote, paymentDay, paymentLocationKey, isUnbatchedPayment,
} = M;

// --- toCents: sign-aware half-away-from-zero at the float boundary
assert.equal(toCents(1.005), 101, 'float boundary rounds up');
assert.equal(toCents(-1.005), -101, 'negative boundary rounds away from zero');
assert.equal(toCents(2.675), 268);
assert.equal(toCents(0.1) + toCents(0.2), 30, '0.10 + 0.20 is exactly 30 cents');
assert.equal(toCents('12.34'), 1234, 'numeric strings parse');
assert.equal(toCents('$1,234.56'), 123456, 'currency decoration stripped');
assert.equal(toCents(NaN), 0);
assert.equal(toCents(undefined), 0);
assert.equal(toCents(null), 0);
assert.equal(toCents(''), 0);
assert.equal(toCents('abc'), 0);
assert.equal(toCents(-0.004), 0);
assert.ok(Object.is(toCents(-0.004), 0), 'no negative zero leaks');
assert.equal(toCents(-50.25), -5025);
assert.equal(fromCents(12345), 123.45);
assert.equal(fromCents(-250), -2.5);
assert.equal(moneyRound('10.005'), 10.01);
assert.equal(M.bucketFor('credit_memo'), 'other', 'credit_memo folds into other');
assert.equal(M.bucketFor('card'), 'card');

// --- selectors / eligibility helpers
assert.equal(paymentDay({ paid_date: '2026-11-01' }), '2026-11-01');
assert.equal(paymentDay({ created_date: '2026-11-02T15:30:00Z' }), '2026-11-02', 'created_date fallback');
assert.equal(paymentDay({}), '');
assert.equal(paymentLocationKey({ location_id: 'L1' }), 'L1');
assert.equal(paymentLocationKey({ location: 'Main' }), 'Main', 'free-text location falls through');
assert.equal(paymentLocationKey({}), '');
assert.ok(isUnbatchedPayment({ status: 'recorded' }));
assert.ok(isUnbatchedPayment({}), 'missing status defaults to recorded');
assert.ok(!isUnbatchedPayment({ status: 'void' }));
assert.ok(!isUnbatchedPayment({ status: 'recorded', reconciliation_batch_id: 'b1' }));

// --- batchCandidates: the filtered, grouped selection contract
const pool = [
  { id: 'c1', amount: 100.10, method: 'cash', status: 'recorded', paid_date: '2026-11-01', location_id: 'loc-a' },
  { id: 'c2', amount: 50.25, method: 'check', status: 'recorded', paid_date: '2026-11-01', location_id: 'loc-a' },
  { id: 'c3', amount: 200, method: 'card', status: 'recorded', paid_date: '2026-11-02', location_id: 'loc-b' },
  { id: 'c4', amount: 30, method: 'ach', status: 'recorded', paid_date: '2026-11-03', location_id: 'loc-a' },
  { id: 'c5', amount: 999, method: 'cash', status: 'recorded', paid_date: '2026-11-01', location_id: 'loc-a', reconciliation_batch_id: 'bX' },
  { id: 'c6', amount: 88, method: 'card', status: 'void', paid_date: '2026-11-01' },
  { id: 'c7', amount: 40, method: 'cash', status: 'refunded', paid_date: '2026-11-04', location_id: 'loc-b' },
  { id: 'c8', amount: 25, method: 'cash', status: 'recorded', location_id: 'loc-a' }, // undated
  { id: 'c9', amount: 60, method: 'check', status: 'recorded', paid_date: '2026-11-02', location_id: 'loc-a' },
];

const all = batchCandidates({ payments: pool });
assert.equal(all.count, 6, 'unbatched recorded only (c1,c2,c3,c4,c8,c9)');
assert.deepEqual(all.candidates.map((p) => p.id), ['c8', 'c1', 'c2', 'c3', 'c9', 'c4'], 'sorted by day then id; undated sorts first for attention');
assert.equal(all.expected_cents, 46535, 'cent-exact expected sum');
assert.equal(all.groups.by_method.cash.expected_cents, 12510);
assert.equal(all.groups.by_method.other.count, 1, 'ach groups under other bucket');
assert.equal(all.groups.by_day['2026-11-01'].count, 2);
assert.equal(all.groups.by_location['loc-a'].count, 5);
assert.equal(all.groups.by_location['loc-b'].count, 1);

const locFiltered = batchCandidates({ payments: pool, filters: { location_id: 'LOC-A' } });
assert.deepEqual(locFiltered.candidates.map((p) => p.id).sort(), ['c1', 'c2', 'c4', 'c8', 'c9'], 'location match is case-insensitive');
assert.equal(locFiltered.applied_filters.location_id, 'LOC-A');

const windowed = batchCandidates({ payments: pool, filters: { date_start: '2026-11-01', date_end: '2026-11-02' } });
assert.deepEqual(windowed.candidates.map((p) => p.id).sort(), ['c1', 'c2', 'c3', 'c9'], 'inclusive both ends; undated excluded');
const startOnly = batchCandidates({ payments: pool, filters: { date_start: '2026-11-03' } });
assert.deepEqual(startOnly.candidates.map((p) => p.id), ['c4'], 'open-ended end keeps later days only');

const cashOnly = batchCandidates({ payments: pool, filters: { method: 'cash' } });
assert.deepEqual(cashOnly.candidates.map((p) => p.id), ['c8', 'c1'], 'bucket method selects raw cash rows (undated first)');
const otherOnly = batchCandidates({ payments: pool, filters: { method: 'other' } });
assert.deepEqual(otherOnly.candidates.map((p) => p.id), ['c4'], "bucket 'other' catches ach/financing/credit_memo");
const achOnly = batchCandidates({ payments: pool, filters: { method: 'ach' } });
assert.deepEqual(achOnly.candidates.map((p) => p.id), ['c4'], 'non-bucket method matches raw method exactly');
const cardOnly = batchCandidates({ payments: pool, filters: { method: 'card' } });
assert.deepEqual(cardOnly.candidates.map((p) => p.id), ['c3']);

const excluded = batchCandidates({ payments: pool, filters: { exclude_ids: ['c9', 'c1'] } });
assert.deepEqual(excluded.candidates.map((p) => p.id).sort(), ['c2', 'c3', 'c4', 'c8'], 'exclude_ids defends against lost back-links');
assert.equal(excluded.applied_filters.excluded_count, 2);
assert.equal(batchCandidates({ payments: undefined }).count, 0, 'empty input safe');

// --- normalizeAdjustments: itemized cash adjustments with the note guard
assert.deepEqual(normalizeAdjustments([{ amount: 10, reason: 'till over' }]),
  [{ amount: 10, amount_cents: 1000, reason: 'till over', note: '' }]);
assert.equal(normalizeAdjustments({ amount: 5, reason: 'drawer loan' })[0].amount_cents, 500, 'single object becomes one row');
assert.throws(() => normalizeAdjustments(5), /explanation/i, 'bare scalar non-zero still needs an explanation');
assert.equal(normalizeAdjustments([]).length, 0);
assert.equal(normalizeAdjustments([{ amount: 0 }]).length, 1, 'zero rows allowed without a reason');
assert.throws(() => normalizeAdjustments([{ amount: -2.5 }]), /explanation/i, 'non-zero adjustment requires reason or note');
assert.equal(normalizeAdjustments([{ amount: -2.5, note: 'bank fee' }])[0].amount_cents, -250, 'note satisfies the guard');
assert.equal(adjustmentsAmountCents(normalizeAdjustments([{ amount: 10, reason: 'a' }, { amount: -3, note: 'b' }])), 700);

// --- batchTotals (shared): cent-safe totals + variance incl. partial adjustments
const tBase = sBatchTotals({ payments: pool.slice(0, 4) });
assert.equal(tBase.expected_cents, 38035, '100.10+50.25+200+30 in cents');
assert.equal(tBase.collected_cents, 38035, 'collected defaults to expected');
assert.equal(tBase.adjustments_cents, 0);
assert.equal(tBase.variance_cents, 0);
assert.equal(tBase.count, 4);
assert.equal(tBase.by_method.cash.expected_cents, 10010);
assert.equal(tBase.by_method.other.expected_cents, 3000, 'ach sums under other');
assert.equal(tBase.by_method.other.count, 1);
assert.deepEqual(tBase.payment_ids, ['c1', 'c2', 'c3', 'c4']);

const tVoid = sBatchTotals({ payments: pool });
assert.equal(tVoid.count, 7, 'void/refunded rows never count; batched-but-recorded rows still total (the entry passes the locked member set)');

const tPartial = sBatchTotals({
  payments: [{ id: 'x1', amount: 100, method: 'cash', status: 'recorded' }],
  adjustments: [{ amount: 3, reason: 'found change' }],
  collected_cents: 9500,
});
assert.equal(tPartial.expected_cents, 10000);
assert.equal(tPartial.collected_cents, 9500);
assert.equal(tPartial.adjustments_cents, 300);
assert.equal(tPartial.variance_cents, -200, 'collected 95 + adj 3 vs expected 100 → short 2');
assert.equal(tPartial.by_method.cash.collected_cents, 9500, 'scalar delta lands on the cash line');

const tPerRow = sBatchTotals({
  payments: [
    { id: 'x1', amount: 10, method: 'cash', status: 'recorded', collected_amount: 9.5 },
    { id: 'x2', amount: 10, method: 'cash', status: 'recorded' },
  ],
});
assert.equal(tPerRow.collected_cents, 1950, 'per-payment collected_amount override');
assert.equal(tPerRow.variance_cents, -50);

const tCounted = sBatchTotals({
  payments: [
    { id: 'x1', amount: 10, method: 'cash', status: 'recorded' },
    { id: 'x2', amount: 10, method: 'cash', status: 'recorded' },
    { id: 'x3', amount: 5, method: 'check', status: 'recorded' },
  ],
  counted: { cash: 18, check: 5, card: 0, other: 0 },
});
assert.equal(tCounted.by_method.cash.collected_cents, 1800, 'counted map is whole-bucket, not per-row');
assert.equal(tCounted.collected_cents, 2300);
assert.equal(tCounted.variance_cents, -200);

const tCountedEmpty = sBatchTotals({
  payments: [{ id: 'x1', amount: 10, method: 'cash', status: 'recorded' }],
  counted: { cash: 10, check: 25, card: 0, other: 0 },
});
assert.equal(tCountedEmpty.by_method.check.collected_cents, 2500, 'counted bucket with no payments still books on its own bucket');
assert.equal(tCountedEmpty.collected_cents, 3500);
assert.equal(tCountedEmpty.variance_cents, 2500, 'counted money without payments = over');

const tPenny = sBatchTotals({
  payments: [0.1, 0.2, 0.3].map((a, i) => ({ id: `d${i}`, amount: a, method: 'card', status: 'recorded' })),
});
assert.equal(tPenny.expected_cents, 60, 'float cents never drift');

// --- closePlan: the per-payment stamp spec + closed-batch guard
assert.throws(() => closePlan({ payments: [] }), /batch id/i, 'batch_id required');

const closePayments = [
  { id: 'k1', status: 'recorded', amount: 10, method: 'cash' },
  { id: 'k2', status: 'recorded', amount: 20, method: 'card' },
  { id: 'k3', status: 'void', amount: 5, method: 'cash' },
  { id: 'k4', status: 'recorded', amount: 7, method: 'cash', reconciliation_batch_id: 'OTHER' },
];
const plan1 = closePlan({ batch_id: 'B1', payments: closePayments, now: '2026-11-05T00:00:00Z', actor: 'clerk@x.com' });
assert.equal(plan1.batch_id, 'B1');
assert.deepEqual(plan1.to_stamp.sort(), ['k1', 'k2']);
assert.deepEqual(plan1.conflicts, [{ id: 'k4', reconciliation_batch_id: 'OTHER' }], 'foreign-batch rows report as conflicts');
assert.deepEqual(plan1.skipped, [{ id: 'k3', reason: 'status:void' }], 'void rows skipped');
assert.equal(plan1.changed, true);
assert.equal(plan1.patch.reconciliation_batch_id, 'B1');
assert.equal(plan1.payment_updates.find((u) => u.id === 'k1').expected_batch_id, '');
assert.deepEqual(plan1.member_ids.sort(), ['k1', 'k2']);

// idempotent re-close: everything already stamped → literal no-op
const stamped = [
  { id: 'k1', status: 'recorded', amount: 10, method: 'cash', reconciliation_batch_id: 'B1' },
  { id: 'k2', status: 'recorded', amount: 20, method: 'card', reconciliation_batch_id: 'B1' },
];
const plan2 = closePlan({ batch_id: 'B1', payments: stamped });
assert.equal(plan2.changed, false, 're-close is a no-op');
assert.equal(plan2.to_stamp.length, 0);
assert.deepEqual(plan2.already.sort(), ['k1', 'k2']);
assert.ok(plan2.payment_updates.every((u) => u.already === true));

// closed batch rejects new payments — but honors its own recorded members
const closedBatch = { id: 'B9', status: 'closed', payment_ids: ['m1', 'm2'] };
assert.throws(
  () => closePlan({ batch_id: 'B9', batch: closedBatch, payments: [{ id: 'n1', status: 'recorded', amount: 1, method: 'cash' }] }),
  /closed.*reopen/i,
  'closed batch rejects new payments (409 guard)',
);
try { closePlan({ batch_id: 'B9', batch: closedBatch, payments: [{ id: 'n1', status: 'recorded' }] }); assert.fail('should throw'); }
catch (e) { assert.equal(e.status, 409, 'guard carries a 409 status'); }

const converge = closePlan({
  batch_id: 'B9', batch: closedBatch,
  payments: [
    { id: 'm1', status: 'recorded', amount: 1, method: 'cash' },                          // recorded member, stamp lost
    { id: 'm2', status: 'recorded', amount: 1, method: 'cash', reconciliation_batch_id: 'B9' }, // already stamped
  ],
});
assert.equal(converge.changed, true, 'authorized member may still stamp on a closed batch (retry converge)');
assert.deepEqual(converge.to_stamp, ['m1']);
assert.deepEqual(converge.already, ['m2']);

const closedNoop = closePlan({
  batch_id: 'B9', batch: closedBatch,
  payments: [
    { id: 'm1', status: 'recorded', amount: 1, method: 'cash', reconciliation_batch_id: 'B9' },
    { id: 'm2', status: 'recorded', amount: 1, method: 'cash', reconciliation_batch_id: 'B9' },
  ],
});
assert.equal(closedNoop.changed, false, 'closed batch with only its own stamped rows stays a no-op');
assert.deepEqual(closedNoop.conflicts, []);
assert.deepEqual(closedNoop.already.sort(), ['m1', 'm2']);

// --- reopenPlan: admin + reason guards, un-stamp spec, audit note
const rBatch = { id: 'B1', status: 'closed', payment_ids: ['k1', 'k2', 'ghost'] };
const rPayments = [
  { id: 'k1', status: 'recorded', reconciliation_batch_id: 'B1' },
  { id: 'k2', status: 'recorded', reconciliation_batch_id: 'B1' },
  { id: 'k9', status: 'recorded', reconciliation_batch_id: 'OTHER' },
];
assert.throws(() => reopenPlan({ batch: rBatch, payments: rPayments, actor: { email: 'a@x.com', role: 'user' }, reason: 'recount' }),
  /admin/i, 'non-admin cannot reopen');
try { reopenPlan({ batch: rBatch, payments: rPayments, actor: { email: 'a@x.com', role: 'user' }, reason: 'recount' }); assert.fail('nope'); }
catch (e) { assert.equal(e.status, 403); }
assert.throws(() => reopenPlan({ batch: rBatch, payments: rPayments, actor: { role: 'admin', email: 'a@x.com' }, reason: '   ' }),
  /reason/i, 'blank reason rejected');
assert.throws(() => reopenPlan({ batch: rBatch, payments: rPayments, actor: { role: 'admin', email: 'a@x.com' }, reason: 'ab' }),
  /reason/i, 'reason needs substance');
assert.throws(() => reopenPlan({ batch: { id: 'B2', status: 'reopened' }, payments: [], actor: { role: 'admin', email: 'a@x.com' }, reason: 'again' }),
  /closed batch/i, 'a reopened batch is an immutable audit stub');
assert.throws(() => reopenPlan({ batch: null, payments: [], actor: { role: 'admin' }, reason: 'x'.repeat(5) }),
  /not found/i);
assert.ok(isAdminActor({ role: 'admin' }));
assert.ok(isAdminActor({ is_full_admin: true }), 'is_full_admin flag also satisfies the gate');
assert.ok(!isAdminActor({ role: 'manager' }));
assert.ok(!isAdminActor('admin@x.com'), 'bare email string is not an admin marker');

const rPlan = reopenPlan({
  batch: rBatch, payments: rPayments, actor: { email: 'boss@x.com', role: 'admin' },
  reason: 'drawer recounted after close', now: '2026-11-05T10:00:00Z',
});
assert.equal(rPlan.batch_update.status, 'reopened');
assert.equal(rPlan.batch_update.reopened_by, 'boss@x.com');
assert.equal(rPlan.batch_update.reopened_at, '2026-11-05T10:00:00Z');
assert.equal(rPlan.batch_update.reopen_reason, 'drawer recounted after close');
assert.match(rPlan.audit_note, /^\[reopened 2026-11-05T10:00:00Z by boss@x\.com\] drawer recounted after close$/);
assert.deepEqual(rPlan.unstamp_ids.sort(), ['k1', 'k2'], 'only rows stamped to THIS batch un-stamp');
assert.deepEqual(rPlan.foreign, [{ id: 'k9', reconciliation_batch_id: 'OTHER' }], 'foreign-locked rows reported, never touched');
assert.deepEqual(rPlan.snapshot_only, ['ghost'], 'snapshot ids with lost back-links still reported');
assert.equal(rPlan.payment_updates[0].set.reconciliation_batch_id, '');

// --- end-to-end model flow: close → stamp → reopen → candidates again
const flow = [
  { id: 'f1', amount: 25, method: 'cash', status: 'recorded', paid_date: '2026-11-01' },
  { id: 'f2', amount: 25, method: 'cash', status: 'recorded', paid_date: '2026-11-01' },
];
const fPlan = closePlan({ batch_id: 'BF', payments: flow, actor: { email: 'a@x.com' } });
const afterClose = flow.map((p) => (fPlan.to_stamp.includes(p.id) ? { ...p, ...fPlan.patch } : p));
assert.equal(batchCandidates({ payments: afterClose }).count, 0, 'stamped payments leave the candidate pool');
const fReopen = reopenPlan({ batch: { id: 'BF', status: 'closed', payment_ids: ['f1', 'f2'] }, payments: afterClose, actor: { role: 'admin', email: 'a@x.com' }, reason: 'recount' });
const afterReopen = afterClose.map((p) => (fReopen.unstamp_ids.includes(p.id) ? { ...p, reconciliation_batch_id: '' } : p));
assert.equal(batchCandidates({ payments: afterReopen }).count, 2, 'reopened payments are candidates again');
assert.equal(auditNote({ now: '2026-11-05T00:00:00Z', actor: { email: 'a@x.com' }, reason: 'r' }),
  '[reopened 2026-11-05T00:00:00Z by a@x.com] r');

rmSync(out, { force: true });
rmSync(outShared, { force: true });

console.log('PASS reconciliation (161 assertions)');
