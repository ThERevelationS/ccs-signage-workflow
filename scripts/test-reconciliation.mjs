import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-reconciliation.mjs');
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

console.log('PASS reconciliation (45 assertions)');
