import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORDER_PULL_PREWRITE_BUDGET_MS, orderPullPrewriteBudget } from '../base44/shared/smartsheetOrderPullPrewriteBudget.mjs';

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
