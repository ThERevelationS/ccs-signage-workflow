import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';
import { salesRunRequiresReview } from '../base44/shared/smartsheetSalesSafety.mjs';

const complete = [{ dataset: 'orders', direction: 'pull', rows_examined: 1677,
  updated: 0, unchanged_skipped: 1675, errors: 0, snapshot_write_failures: 0 }];
assert.equal(orderRunRequiresReview(complete), false);
assert.equal(orderRunRequiresReview([{ dataset: 'orders', skipped: true,
  reason: 'Mirror intentionally disabled' }]), false);
assert.equal(orderRunRequiresReview([{ dataset: 'sales', direction: 'pull',
  skipped: true, errors: 2 }]), false);
assert.equal(salesRunRequiresReview([{ dataset: 'sales', direction: 'pull',
  skipped: true }]), true);
console.log('PASS completed Orders and intentionally disabled datasets do not cause false reviews');

for (const failure of [
  { direction: 'pull', skipped: true, date_translation_invalid: 175 },
  { direction: 'push', skipped: true, reason: 'Verified backup unavailable' },
  { direction: 'pull', errors: 1 },
  { direction: 'pull', snapshot_write_failures: 100 },
  { direction: 'pull', unlinked_smartsheet_rows_flagged_for_review: 2, unlinked_row_ids: ['103', '104'] },
  { direction: 'push', conflicts: 1 },
  { direction: 'pull', orphans_flagged_for_review: 1 },
  { direction: 'pull', duplicate_groups_flagged_for_review: 1 },
  { direction: 'pull', create_attempts_need_review: 1 },
  { direction: 'pull', duplicate_order_row_links: 1 },
]) {
  assert.equal(orderRunRequiresReview([{ dataset: 'orders', ...failure }]), true,
    `Order failure not surfaced: ${JSON.stringify(failure)}`);
}
assert.equal(orderRunRequiresReview(null), false);
console.log('PASS blocked, partial and ambiguous Order sync results always require review');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(backend, /const runNeedsReview = salesRunRequiresReview\(results\) \|\| orderRunRequiresReview\(results\)/);
assert.match(backend, /status: runNeedsReview \? 'needs_review' : 'completed'/);
assert.match(backend, /sync_complete: !runNeedsReview/);
assert.match(backend, /\.\.\.\(activeDirection \? \{ direction: activeDirection \} : \{\}\)/);
assert.match(backend, /snapshotWriteFailures \+= batch\.length/);
assert.match(backend, /updatedCount = Math\.max\(0, updatedCount - batch\.length\)/);
assert.match(backend, /snapshot_write_failures: snapshotWriteFailures/);
assert.match(backend, /Order sync metadata was not confirmed/);
assert.match(backend, /errors\.push\(`Order sync metadata was not confirmed/);
const salesPath = backend.slice(backend.indexOf('if (dataset === \'sales\') {'),
  backend.indexOf('// Order-only date preflight'));
assert.doesNotMatch(salesPath, /orderRunRequiresReview/);
console.log('PASS backend records Order metadata failures and coordinator cannot falsely mark a failed Order run complete');

const settings = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
assert.match(settings, /syncResult\.needs_review \? "Sync needs review" : "Sync results"/);
assert.match(widget, /hasReviewNeeded \? "Sync needs review"/);
assert.doesNotMatch(settings, /attempted Sales stage/);
assert.doesNotMatch(widget, /attempted Sales stage/);
console.log('PASS shared sync surfaces describe both Sales and Order review without misleading completion');
