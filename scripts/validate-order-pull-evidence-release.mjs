import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderPullWritesVerified, orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

// Review items are routine on a live sheet: they must still mark the run as
// needing review, but they must NOT keep the pull write-evidence gate locked.
const cleanPull = {
  dataset: 'orders', direction: 'pull', created: 2, updated: 5,
  errors: 0, business_field_write_failures: 0, snapshot_write_failures: 0,
  create_verification_failures: 0,
  conflicts: 1,
  unlinked_smartsheet_rows_flagged_for_review: 3,
  unlinked_row_ids: ['11', '22', '33'],
  orphans_flagged_for_review: 1,
  duplicate_groups_flagged_for_review: 1,
  missing_permanent_row_links: 2,
};
assert.equal(orderPullWritesVerified(cleanPull), true,
  'a verified pull with routine review items must release the evidence gate');
assert.equal(orderRunRequiresReview([cleanPull]), true,
  'review items still mark the run as needing review for status classification');

for (const variant of [
  { ...cleanPull, skipped: true },
  { ...cleanPull, errors: 1 },
  { ...cleanPull, business_field_write_failures: 1 },
  { ...cleanPull, snapshot_write_failures: 1 },
  { ...cleanPull, create_verification_failures: 1 },
  { ...cleanPull, direction: 'push' },
  { ...cleanPull, dataset: 'sales' },
  { ...cleanPull, dataset: 'orders', direction: 'pull', errors: 'bad' },
]) {
  assert.equal(orderPullWritesVerified(variant), false,
    `gate must stay locked for ${JSON.stringify(variant.errors ?? variant.skipped ?? variant.direction)}`);
}
console.log('PASS pull write-evidence release ignores review items but stays locked on any write failure');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(backend, /orderPullWritesVerified\(pullResult\)/,
  'the evidence gate release must use orderPullWritesVerified');
assert.doesNotMatch(backend, /lastOrderPullBatchEvidence && !orderRunRequiresReview\(\[pullResult\]\)/,
  'the evidence gate must no longer require zero review items');
assert.ok(backend.includes("import { orderRunRequiresReview, orderPullWritesVerified } from '../../shared/smartsheetOrderRunSafety.mjs'"));
console.log('PASS entry.ts releases the Order pull evidence gate on verified writes only');
