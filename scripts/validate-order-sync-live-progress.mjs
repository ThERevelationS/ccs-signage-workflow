import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  orderSyncLiveProgress,
  ORDER_SYNC_HEARTBEAT_STALE_MS,
} from '../src/components/orders/orderSyncLiveProgress.mjs';

const now = Date.parse('2026-09-28T23:30:00.000Z');
const running = {
  status: 'running',
  total_steps: 4,
  completed_steps: 3,
  progress_dataset: 'orders',
  progress_direction: 'push',
  progress_current: 418,
  progress_total: 1675,
  progress_item_label: '#418 · New Cincy Inc. · Wall sign',
  progress_detail: 'Checking and updating Smartsheet row 123456',
  progress_updated_at: new Date(now - 1500).toISOString(),
};
const view = orderSyncLiveProgress(running, { enabled: true, now });
assert.equal(view.show, true);
assert.equal(view.current, 418);
assert.equal(view.total, 1675);
assert.equal(view.percent, 81.2);
assert.equal(view.itemLabel, '#418 · New Cincy Inc. · Wall sign');
assert.equal(view.stalled, false);
console.log('PASS 3/4 stage progress becomes granular fractional Order progress instead of staying at 75%');

const finishedCurrentStep = orderSyncLiveProgress({
  ...running, progress_current: 1675,
}, { enabled: true, now });
assert.equal(finishedCurrentStep.percent, 99.9);
console.log('PASS a still-running sync never claims 100% before coordinator completion');

assert.equal(ORDER_SYNC_HEARTBEAT_STALE_MS, 5 * 60 * 1000);
assert.equal(orderSyncLiveProgress({
  ...running, progress_updated_at: new Date(now - ORDER_SYNC_HEARTBEAT_STALE_MS).toISOString(),
}, { enabled: true, now }).stalled, false);
assert.equal(orderSyncLiveProgress({
  ...running, progress_updated_at: new Date(now - ORDER_SYNC_HEARTBEAT_STALE_MS - 1).toISOString(),
}, { enabled: true, now }).stalled, true);
assert.equal(orderSyncLiveProgress({
  ...running, progress_updated_at: 'invalid',
}, { enabled: true, now }).stalled, true);
assert.equal(orderSyncLiveProgress(running, { enabled: false, now }).show, false);
assert.equal(orderSyncLiveProgress(running, { enabled: false, now }).stalled, false);
const longRunningSalesStage = {
  status: 'running',
  total_steps: 4,
  completed_steps: 0,
  current_step_label: 'Sales Pipeline → Smartsheet',
  started_at: new Date(now - ORDER_SYNC_HEARTBEAT_STALE_MS - 60_000).toISOString(),
  updated_at: new Date(now - ORDER_SYNC_HEARTBEAT_STALE_MS - 60_000).toISOString(),
};
assert.equal(orderSyncLiveProgress(longRunningSalesStage, { enabled: true, now }).show, false);
assert.equal(orderSyncLiveProgress(longRunningSalesStage, { enabled: true, now }).stalled, false);
console.log('PASS Order Form applies the five-minute heartbeat timeout only to Order progress, not long-running Sales stages');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');

assert.match(backend, /onlyPendingOrderRecords: action === 'run_sync'/);
assert.match(backend, /records = records\.filter\(\(record: any\) => record\?\.smartsheet_pending_local_sync === true\)/);
assert.match(backend, /orderPushTimeBudgetMs: 4 \* 60 \* 1000/);
assert.match(backend, /reportOrderProgress: async \(progress: any\) => saveSyncStatus/);
assert.match(backend, /progress_current: Number\(progress\?\.current\) \|\| 0/);
assert.match(backend, /progress_item_label: cleanText\(progress\?\.item_label, 220\)/);
assert.match(backend, /progress_smartsheet_row_id: cleanText\(progress\?\.smartsheet_row_id, 40\)/);
assert.match(backend, /Order push paused safely after \$\{orderProcessedCount\} of \$\{pendingRecords\.length\}/);
assert.match(backend, /time_budget_reached: true/);
assert.match(backend, /Remaining Orders stay queued for the next sync/);
console.log('PASS combined Order sync pushes only durable local edits, emits row-level heartbeat data, and stops safely before platform timeout');

assert.match(widget, /compactOrderForm && status\?\.status === 'running' \? 1000 : 5000/);
assert.match(widget, /orderSyncLiveProgress\(status, \{ enabled: compactOrderForm \}\)/);
assert.match(widget, /\$\{progressCurrent\.toLocaleString\(\)\} \/ \$\{progressTotal\.toLocaleString\(\)\} line items/);
assert.match(widget, /progressItemLabel/);
assert.match(widget, /progressDetail/);
assert.match(widget, /aria-live="polite"/);
console.log('PASS Order Form polls active sync every second and displays the exact current line item and live line-item count');
