import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderPullChangeLimit } from '../base44/shared/smartsheetOrderPullChangeLimit.mjs';

assert.deepEqual(orderPullChangeLimit({ proposedUpdates: 2, configuredLimit: 25 }), {
  allowed: true, limit: 25, proposedUpdates: 2,
});
assert.equal(orderPullChangeLimit({ proposedUpdates: 25, configuredLimit: 25 }).allowed, true);
const oversized = orderPullChangeLimit({ proposedUpdates: 26, configuredLimit: 25 });
assert.equal(oversized.allowed, false);
assert.match(oversized.reason, /No Orders were changed/);
assert.equal(orderPullChangeLimit({ proposedUpdates: 0, configuredLimit: 25 }).allowed, true);
assert.equal(orderPullChangeLimit({ proposedUpdates: 1684, configuredLimit: 10000 }).allowed, true);
assert.equal(orderPullChangeLimit({ proposedUpdates: -1, configuredLimit: 25 }).allowed, false);
assert.equal(orderPullChangeLimit({ proposedUpdates: Number.NaN, configuredLimit: 25 }).allowed, false);
console.log('PASS a large downloaded Order sheet with a small update set is allowed, while oversized/invalid change sets fail closed');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const shared = readFileSync('base44/shared/smartsheetFieldMerge.ts', 'utf8');
const pullStart = backend.indexOf('async function pullDataset(');
const pushStart = backend.indexOf('async function pushDataset(');
assert.ok(pullStart >= 0 && pushStart > pullStart);
const pull = backend.slice(pullStart, pushStart);
assert.match(pull, /if \(dataset === 'sales' && allRows\.length > massLimit\)/);
assert.doesNotMatch(pull, /if \(allRows\.length > massLimit\)/);
assert.match(pull, /orderPullChangeLimit\(\{ proposedUpdates: toUpdate\.length, configuredLimit: massLimit \}\)/);
const limitGuard = pull.indexOf('orderPullChangeLimit({ proposedUpdates: toUpdate.length');
const matchingLoop = pull.indexOf('for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++)');
const firstCreate = pull.indexOf('bulkCreate(batch)');
const firstUpdate = pull.indexOf('bulkUpdate(payload)');
const firstSnapshotWrite = pull.indexOf('bulkUpdate(batch)');
assert.ok(matchingLoop > 0 && matchingLoop < limitGuard);
assert.ok(limitGuard < firstCreate && limitGuard < firstUpdate && limitGuard < firstSnapshotWrite,
  'All Order writes must occur after the full change-count preflight');
assert.match(pull, /skipped: true,[\s\S]*?planned_order_updates: toUpdate\.length/);
assert.match(pull, /unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount/);
assert.match(shared, /export async function recordFieldPullHolds[\s\S]*?\n\}/);
const noOpHolds = shared.split('export async function recordFieldPullHolds')[1].split('export async function applyMergedLocalFields')[0];
assert.doesNotMatch(noOpHolds, /\.update\(|\.create\(|\.upsert\(|\.delete\(/);
console.log('PASS full Order preflight runs after matching and before any write, preserving Sales sheet guard and pending-Order holds');
