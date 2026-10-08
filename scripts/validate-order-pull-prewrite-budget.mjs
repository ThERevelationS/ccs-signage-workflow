import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORDER_PULL_PREWRITE_BUDGET_MS, orderPullPrewriteBudget, ORDER_PULL_POSTWRITE_BUDGET_MS, assertOrderPullContinuationBudget } from '../base44/shared/smartsheetOrderPullPrewriteBudget.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

const b = ORDER_PULL_PREWRITE_BUDGET_MS;
assert.equal(b, 180000);
assert.equal(orderPullPrewriteBudget({ startedAtMs: 100, nowMs: 100 }).allowed, true);
assert.equal(orderPullPrewriteBudget({ startedAtMs: 100, nowMs: b + 99 }).allowed, true);
const atLimit = orderPullPrewriteBudget({ startedAtMs: 100, nowMs: b + 100 });
assert.equal(atLimit.allowed, false);
assert.equal(atLimit.elapsedMs, b);
assert.equal(atLimit.budgetMs, b);
assert.match(atLimit.reason, /No Orders were changed/);
assert.equal(orderPullPrewriteBudget({ startedAtMs: 100, nowMs: b + 101 }).allowed, false);
for (const item of [
  { startedAtMs: NaN, nowMs: 200 },
  { startedAtMs: 100, nowMs: NaN },
  { startedAtMs: 200, nowMs: 100 },
  { startedAtMs: 100, nowMs: 200, budgetMs: 0 },
]) assert.equal(orderPullPrewriteBudget(item).allowed, false);
console.log('PASS elapsed-time boundary fails closed before writes, including invalid timing');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const pullStart = backend.indexOf('async function pullDataset(');
const pushStart = backend.indexOf('async function pushDataset(');
assert.ok(pullStart >= 0 && pushStart > pullStart);
const pull = backend.slice(pullStart, pushStart);
assert.match(pull, /const orderPullStartedAtMs = dataset === 'orders' \? Date\.now\(\) : 0/);
assert.match(pull, /const prewriteBudget = orderPullPrewriteBudget\(\{ startedAtMs: orderPullStartedAtMs, nowMs: Date\.now\(\) \}\)/);
assert.match(pull, /if \(!prewriteBudget\.allowed\) return \{[\s\S]*?skipped: true/);
const budgetAt = pull.indexOf('const prewriteBudget = orderPullPrewriteBudget(');
const afterMatch = pull.indexOf('for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++)');
const firstCreate = pull.indexOf('bulkCreate(batch)');
const firstBusinessWrite = pull.indexOf('bulkUpdate(payload)');
const firstMetadataWrite = pull.indexOf('bulkUpdate(batch)');
assert.ok(afterMatch >= 0 && afterMatch < budgetAt);
assert.ok(budgetAt < firstCreate && budgetAt < firstBusinessWrite && budgetAt < firstMetadataWrite);
assert.match(pull, /if \(dataset === 'sales' && allRows\.length > massLimit\)/);
assert.match(pull, /const changeLimit = orderPullChangeLimit\(\{ proposedUpdates: toUpdate\.length/);
assert.match(pull, /unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount/);
assert.match(backend, /orderRunRequiresReview\(results\)/);
console.log('PASS Order-only time guard is after full matching and before every write; skipped run requires review');

assert.equal(ORDER_PULL_POSTWRITE_BUDGET_MS, 240000);
assert.ok(ORDER_PULL_POSTWRITE_BUDGET_MS > ORDER_PULL_PREWRITE_BUDGET_MS);
assert.equal(assertOrderPullContinuationBudget({ startedAtMs: 100, nowMs: 100 }).elapsedMs, 0);
assert.equal(assertOrderPullContinuationBudget({ startedAtMs: 100, nowMs: 100 + ORDER_PULL_POSTWRITE_BUDGET_MS - 1 }).budgetMs, ORDER_PULL_POSTWRITE_BUDGET_MS);
for (const timings of [
  { startedAtMs: 100, nowMs: 100 + ORDER_PULL_POSTWRITE_BUDGET_MS },
  { startedAtMs: 100, nowMs: 100 + ORDER_PULL_POSTWRITE_BUDGET_MS + 1 },
  { startedAtMs: 300, nowMs: 100 },
  { startedAtMs: Number.NaN, nowMs: 300 },
  { startedAtMs: 100, nowMs: 300, budgetMs: 0 },
]) {
  assert.throws(() => assertOrderPullContinuationBudget({ ...timings, stage: 'snapshot verification' }),
    err => /snapshot verification/.test(err.message) &&
      /Earlier Base44 updates may already have been applied/.test(err.message) &&
      /review the pull before retrying/.test(err.message) &&
      !/No Orders were changed/.test(err.message));
}
let blockedError = '';
try {
  assertOrderPullContinuationBudget({ startedAtMs: 100, nowMs: 100 + ORDER_PULL_POSTWRITE_BUDGET_MS, stage: 'business verification' });
} catch (error) {
  blockedError = error.message;
}
assert.ok(blockedError);
assert.equal(orderRunRequiresReview([{ dataset: 'orders', direction: 'pull', skipped: true, reason: blockedError }]), true);
assert.equal(orderRunRequiresReview([{ dataset: 'sales', direction: 'pull', skipped: false }]), false);
console.log('PASS post-write cutoff stops safely and explicitly treats earlier writes as uncertain');

const continuationCalls = pull.match(/assertOrderPullContinuationBudget\(\{/g) || [];
assert.equal(continuationCalls.length, 5, 'Order-only continuation checks must cover five write/verification boundaries');
for (const stage of [
  'the next Order business-field batch',
  'the next Order date/text verification',
  'the Order business-field read-back',
  'the next Order sync snapshot batch',
  'the final Order sync metadata read-back',
]) assert.ok(pull.includes(`stage: '${stage}'`));
assert.match(pull, /if \(dataset === 'orders'\) assertOrderPullContinuationBudget\(\{[\s\S]*?stage: 'the next Order business-field batch'/);
assert.match(pull, /if \(dataset === 'orders'\) assertOrderPullContinuationBudget\(\{[\s\S]*?stage: 'the next Order sync snapshot batch'/);
assert.match(pull, /if \(dataset === 'orders'\) assertOrderPullContinuationBudget\(\{[\s\S]*?stage: 'the final Order sync metadata read-back'/);
assert.ok(pull.indexOf("stage: 'the Order business-field read-back'") < pull.indexOf('const actualRows = await loadOrderPullReadbackRows('));
assert.ok(pull.indexOf("stage: 'the final Order sync metadata read-back'") < pull.indexOf('const readCompleteMetadata = () => loadAllEntityRows('));
assert.match(backend, /results.push\(\{ dataset, \.\.\.\(activeDirection \? \{ direction: activeDirection \} : \{\}\), skipped: true, reason:/);
console.log('PASS Order-only continuation gates precede large reads and writes; coordinator catches aborted partial pulls');
