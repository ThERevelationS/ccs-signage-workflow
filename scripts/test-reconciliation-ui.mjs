import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-recon-ui.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/reconciliation/reconUiModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out).href);
const {
  TENDER_BUCKETS, BUCKET_LABELS,
  toCents, fromCents, toDay,
  batchExpected, batchCollected, batchAdjustmentsAmount, batchVariance,
  batchName, batchNumber, batchStatus, batchPaymentCount, batchStatusTone,
  batchAdjustmentRows, statusHistory,
  candidateDay, candidateBucket, candidateLocationId,
  expectedBuckets, resolveCounted, varianceCents,
  adjustmentDrafts, adjustmentsCentsOf,
  buildCandidateFilters, buildBatchFilters, buildClosePayload,
  isAdminUser, canReopenBatch, validReopenReason,
} = M;

// Assert counter so the PASS line reports the real total.
let n = 0;
const eq = (...a) => { n++; return assert.equal(...a); };
const deq = (...a) => { n++; return assert.deepEqual(...a); };
const ok = (...a) => { n++; return assert.ok(...a); };
const throws = (...a) => { n++; return assert.throws(...a); };

// --- cent math: same sign-aware contract as the shared backend model
eq(toCents(1.005), 101, 'float boundary rounds up');
eq(toCents(-1.005), -101, 'negative boundary rounds away from zero');
eq(toCents('$1,234.56'), 123456, 'currency decoration stripped');
eq(toCents(''), 0);
eq(toCents(undefined), 0);
eq(toCents('abc'), 0);
ok(Object.is(toCents(-0.004), 0), 'no negative zero');
eq(fromCents(12345), 123.45);
eq(fromCents(-250), -2.5);
eq(TENDER_BUCKETS.length, 4);
eq(BUCKET_LABELS.cash, 'Cash');

// --- toDay: leading date prefix wins over full ISO stamps
eq(toDay('2026-11-05'), '2026-11-05');
eq(toDay('2026-11-05T23:59:59Z'), '2026-11-05', 'ISO prefix, no TZ drift');
eq(toDay(''), '');
eq(toDay('garbage'), '');

// --- batch field resolution: *_amount mirrors win, legacy falls back
const newBatch = {
  name: 'Register 2 close', batch_number: 'REC-0042', status: 'closed',
  expected_amount: 500.25, collected_amount: 498.25, adjustments_amount: -3,
  variance_amount: -5, payment_count: 7, payment_ids: ['a', 'b'],
  adjustments: [{ amount: -3, reason: 'drawer loan', note: '' }],
  closed_at: '2026-11-05T22:00:00Z', closed_by: 'clerk@x.com',
};
eq(batchExpected(newBatch), 500.25);
eq(batchCollected(newBatch), 498.25);
eq(batchAdjustmentsAmount(newBatch), -3);
eq(batchVariance(newBatch), -5);
eq(batchName(newBatch), 'Register 2 close');
eq(batchNumber(newBatch), 'REC-0042');
eq(batchStatus(newBatch), 'closed');
eq(batchPaymentCount(newBatch), 7);

const legacyBatch = {
  batch_number: 'REC-0007', expected_total: 100, collected_total: 95,
  cash_adjustment: 2, adjustment_note: 'found change', variance: -3,
  payment_ids: ['p1', 'p2', 'p3'],
  created_by: 'boss@x.com', closed_at: '2026-11-01',
};
eq(batchExpected(legacyBatch), 100, 'legacy expected_total fallback');
eq(batchCollected(legacyBatch), 95, 'legacy collected_total fallback');
eq(batchAdjustmentsAmount(legacyBatch), 2, 'legacy cash_adjustment fallback');
eq(batchVariance(legacyBatch), -3, 'legacy variance fallback');
eq(batchName(legacyBatch), 'REC-0007', 'name falls back to batch_number');
eq(batchStatus(legacyBatch), 'closed', 'missing status defaults closed');
eq(batchPaymentCount(legacyBatch), 3, 'count falls back to payment_ids length');
eq(batchVariance({ collected_total: 90, cash_adjustment: 5, expected_total: 100 }), -5,
  'no stored variance → computed collected + adj − expected');
eq(batchStatusTone('closed'), 'emerald');
eq(batchStatusTone('reopened'), 'amber');
eq(batchStatusTone('open'), 'sky');
eq(batchStatusTone('weird'), 'slate');

// --- batchAdjustmentRows: itemized rows win; legacy scalar folds in
deq(batchAdjustmentRows(newBatch), [{ amount: -3, reason: 'drawer loan', note: '' }]);
deq(batchAdjustmentRows(legacyBatch), [{ amount: 2, reason: 'found change', note: '' }],
  'legacy cash_adjustment + note becomes one row');
deq(batchAdjustmentRows({ adjustments: [], cash_adjustment: 0 }), []);
deq(batchAdjustmentRows({ adjustments: [{ amount: 0 }] }), [], 'all-empty adjustment rows drop');

// --- statusHistory: close event + reopen event with reason
deq(statusHistory(newBatch), [{ label: 'Closed', at: '2026-11-05T22:00:00Z', by: 'clerk@x.com', detail: '' }]);
const reopened = {
  ...legacyBatch, status: 'reopened',
  reopened_at: '2026-11-06T09:00:00Z', reopened_by: 'boss@x.com', reopen_reason: 'recount',
};
const hist = statusHistory(reopened);
eq(hist.length, 2, 'closed + reopened events');
eq(hist[1].label, 'Reopened');
eq(hist[1].detail, 'recount');
eq(hist[1].by, 'boss@x.com');
eq(statusHistory({ created_by: 'a@x.com' })[0].by, 'a@x.com', 'closed_by falls back to created_by');

// --- candidate normalization: paymentSnapshot wire shape AND model _fields
const snap = { id: 'p1', amount: 10, method: 'ach', bucket: 'other', paid_date: '2026-11-03', location_id: 'loc-9' };
eq(candidateDay(snap), '2026-11-03');
eq(candidateBucket(snap), 'other', 'snapshot bucket field used');
eq(candidateLocationId(snap), 'loc-9');
const modelRow = { id: 'p2', amount: 5, method: 'card', _day: '2026-11-04', _bucket: 'card', _location_id: 'L2' };
eq(candidateDay(modelRow), '2026-11-04', 'model _day wins');
eq(candidateBucket(modelRow), 'card');
eq(candidateLocationId(modelRow), 'L2');
eq(candidateBucket({ method: 'financing' }), 'other', 'raw method folds to bucket');
eq(candidateBucket({ method: 'card' }), 'card');
eq(candidateDay({ created_date: '2026-11-02T15:00:00Z' }), '2026-11-02', 'created_date fallback');
eq(candidateLocationId({ location: 'Front Desk' }), 'Front Desk', 'free-text location falls through');

// --- expectedBuckets: per-bucket cents + counts over a selection
const pool = [
  { id: 'c1', amount: 100.10, method: 'cash' },
  { id: 'c2', amount: 50.25, method: 'check' },
  { id: 'c3', amount: 200, method: 'card' },
  { id: 'c4', amount: 30, method: 'ach' },
  { id: 'c5', amount: 25, method: 'cash' },
];
const exp = expectedBuckets(pool);
eq(exp.buckets.cash.expectedCents, 12510, 'cash sums in cents');
eq(exp.buckets.cash.count, 2);
eq(exp.buckets.check.expectedCents, 5025);
eq(exp.buckets.other.expectedCents, 3000, 'ach folds into other');
eq(exp.buckets.card.count, 1);
eq(exp.totalCents, 40535);
eq(exp.count, 5);
deq(expectedBuckets(undefined).totalCents, 0, 'empty input safe');
eq(expectedBuckets([{ amount: 0.1, method: 'card' }, { amount: 0.2, method: 'card' }]).totalCents, 30,
  'float cents never drift');

// --- resolveCounted: blank → expected, drafts → cents, submit map in dollars
const r1 = resolveCounted({ cash: '', check: '', card: '', other: '' }, exp);
eq(r1.allBlank, true);
eq(r1.collectedCents, 40535, 'all blank → collected = expected');
deq(r1.counted, { cash: 125.10, check: 50.25, card: 200, other: 30 }, 'submit map in dollars');
const r2 = resolveCounted({ cash: '120', check: '', card: '', other: '' }, exp);
eq(r2.allBlank, false);
eq(r2.counted.cash, 120);
eq(r2.counted.check, 50.25, 'untouched bucket still resolves to expected');
eq(r2.collectedCents, 40025);
const r3 = resolveCounted({ cash: '0' }, expectedBuckets([]));
eq(r3.counted.cash, 0, 'explicit zero stays zero — not treated as blank');
eq(r3.allBlank, false);

// --- varianceCents: collected + adjustments − expected
eq(varianceCents(10000, 10000, 0), 0);
eq(varianceCents(10000, 9500, 0), -500, 'short');
eq(varianceCents(10000, 10500, 0), 500, 'over');
eq(varianceCents(10000, 9500, 300), -200, 'partial adjustment coverage');

// --- adjustmentDrafts / adjustmentsCentsOf
deq(adjustmentDrafts('', ''), []);
deq(adjustmentDrafts('0', 'ignored'), [], 'zero amount → no rows, reason dropped');
deq(adjustmentDrafts('-2.50', 'bank fee'), [{ amount: -2.5, reason: 'bank fee' }]);
deq(adjustmentDrafts('10.005', 'over'), [{ amount: 10.01, reason: 'over' }], 'cent-exact');
eq(adjustmentsCentsOf(adjustmentDrafts('10', 'a')), 1000);
eq(adjustmentsCentsOf([{ amount: 10 }, { amount: -3 }]), 700);

// --- buildCandidateFilters / buildBatchFilters
deq(buildCandidateFilters({}), {}, 'blank filters dropped entirely');
deq(buildCandidateFilters({ locationId: ' loc-9 ', method: 'CASH', dateStart: '2026-11-01', dateEnd: '2026-11-05T00:00:00Z' }),
  { location_id: 'loc-9', method: 'cash', date_start: '2026-11-01', date_end: '2026-11-05' });
deq(buildCandidateFilters({ method: 'Financing' }), { method: 'financing' }, 'raw method lowercased');
deq(buildBatchFilters({ status: 'Reopened', limit: 9999 }),
  { status: 'reopened', limit: 500 }, 'status lowercased, limit capped at 500');
deq(buildBatchFilters({ dateStart: '2026-11-01' }), { date_start: '2026-11-01', limit: 250 });

// --- buildClosePayload: pinned ids + counted map + itemized adjustments
const payload = buildClosePayload({
  paymentIds: ['p1', ' p2 ', ''],
  locationId: 'loc-1', locationName: 'Main', name: 'Register close',
  counted: { cash: 125.10, check: 50.25, card: 200, other: 30 },
  adjustments: [{ amount: -3, reason: 'drawer loan' }],
  notes: 'bag 12', creationKey: 'recon:test:1',
});
eq(payload.action, 'close_batch');
eq(payload.creation_request_key, 'recon:test:1');
deq(payload.payment_ids, ['p1', 'p2'], 'ids pinned for the retry-safe close');
eq(payload.location_id, 'loc-1');
eq(payload.location, 'Main');
eq(payload.name, 'Register close');
deq(payload.counted, { cash: 125.10, check: 50.25, card: 200, other: 30 });
deq(payload.cash_adjustments, [{ amount: -3, reason: 'drawer loan', note: '' }]);
eq(payload.notes, 'bag 12');
const sparse = buildClosePayload({ creationKey: 'k' });
deq(Object.keys(sparse).sort(), ['action', 'creation_request_key'], 'empties dropped → backend defaults');
ok(!('payment_ids' in sparse), 'no ids → filter-driven close path');
deq(buildClosePayload({ paymentIds: [], counted: { cash: 5 } }).counted,
  { cash: 5, check: 0, card: 0, other: 0 }, 'counted map always spans all four buckets');

// --- reopen guards mirror the backend contract
ok(isAdminUser({ role: 'admin' }));
ok(isAdminUser({ role: 'Admin' }), 'role check case-insensitive');
ok(isAdminUser({ is_full_admin: true }), 'is_full_admin satisfies the gate');
ok(!isAdminUser({ role: 'manager' }));
ok(!isAdminUser(null));
ok(canReopenBatch({ role: 'admin' }, { status: 'closed' }));
ok(!canReopenBatch({ role: 'admin' }, { status: 'reopened' }), 'reopened stub is read-only');
ok(!canReopenBatch({ role: 'user' }, { status: 'closed' }), 'non-admin cannot reopen');
ok(validReopenReason('abc'), '3 chars minimum');
ok(validReopenReason('  recount  '));
ok(!validReopenReason('ab'));
ok(!validReopenReason('   '));
ok(!validReopenReason(''));

// --- JSX syntax check: the three new components + the modified page parse
for (const f of [
  'BatchList.jsx', 'BatchDetail.jsx', 'CloseBatchDialog.jsx',
]) {
  buildSync({
    entryPoints: [resolve(here, `../src/components/reconciliation/${f}`)],
    bundle: false, loader: { '.jsx': 'jsx' },
    outfile: resolve(here, `.tmp-${f}.js`), logLevel: 'silent', write: true,
  });
  rmSync(resolve(here, `.tmp-${f}.js`), { force: true });
  n++;
}
buildSync({
  entryPoints: [resolve(here, '../src/pages/Reconciliation.jsx')],
  bundle: false, loader: { '.jsx': 'jsx' },
  outfile: resolve(here, '.tmp-Reconciliation.jsx.js'), logLevel: 'silent', write: true,
});
rmSync(resolve(here, '.tmp-Reconciliation.jsx.js'), { force: true });
n++;

rmSync(out, { force: true });

console.log(`PASS reconciliation-ui (${n} asserts)`);
