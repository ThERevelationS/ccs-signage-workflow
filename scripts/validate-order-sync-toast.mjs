import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderSyncToastState, ORDER_SYNC_SUCCESS_VISIBLE_MS } from '../src/components/orders/orderSyncToastModel.js';

const finishedAt = '2026-09-25T18:00:00.000Z';
const t = Date.parse(finishedAt);
const success = { status: 'completed', completed_at: finishedAt,
  results: [{ dataset: 'orders', direction: 'pull', created: 0, updated: 1675, errors: 0 }] };
assert.equal(ORDER_SYNC_SUCCESS_VISIBLE_MS, 9000);
assert.deepEqual(orderSyncToastState(success, t + 100), {
  key: finishedAt, compact: true, expiresAt: t + 9000, visible: true,
});
assert.equal(orderSyncToastState(success, t + 8999).visible, true);
assert.equal(orderSyncToastState(success, t + 9000).visible, false);
assert.equal(orderSyncToastState(success, t + 6 * 60 * 60 * 1000).visible, false);
console.log('PASS successful Order sync expires nine seconds after completion; six-hour-old completion never reopens');

for (const failure of [
  { ...success, status: 'needs_review', needs_review: true },
  { ...success, results: [{ dataset: 'orders', errors: 1, updated: 5 }] },
  { ...success, results: [{ dataset: 'orders', skipped: true, reason: 'API failed' }] },
  { ...success, results: [{ dataset: 'orders', conflicts: 1, updated: 5 }] },
  { ...success, results: [] },
  { ...success, completed_at: 'invalid' },
  { status: 'running', started_at: finishedAt, results: [] },
  { status: 'failed', completed_at: finishedAt, results: [{ dataset: 'orders' }] },
]) {
  assert.equal(orderSyncToastState(failure, t + 100).compact, false);
  assert.equal(orderSyncToastState(failure, t + 100).visible, false);
}
console.log('PASS review, errors, skipped stages, conflicts, malformed dates and running status never auto-dismiss');

const nextRun = { ...success, completed_at: new Date(t + 15 * 60 * 1000).toISOString() };
assert.notEqual(orderSyncToastState(success).key, orderSyncToastState(nextRun).key);
console.log('PASS each completion receives a distinct dismissal identity');

const widget = readFileSync(new URL('../src/components/admin/SmartsheetSyncWidget.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/Layout.jsx', import.meta.url), 'utf8');
assert.match(layout, /compactOrderForm=\{location\.pathname\.replace\(/);
assert.match(layout, /=== '\/orderform'/);
assert.match(widget, /orderSyncToastState\(status\)/);
assert.match(widget, /setTimeout\(\(\) => setDismissedOrderRun\(orderToast\.key\), delay\)/);
assert.match(widget, /!orderToast\.visible/);
assert.match(widget, /!hasErrors && !hasSkipped/);
assert.match(widget, /w-\[min\(440px,calc\(100vw-24px\)\)\]/);
assert.match(widget, /aria-label="Dismiss sync notification"/);
assert.match(widget, /!isRunning && !isStale && !status\?\.completed_at/);
console.log('PASS compact UI and timer are Order Form-only; other pages retain original widget');
