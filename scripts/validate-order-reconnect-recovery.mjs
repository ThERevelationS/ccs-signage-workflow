import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { durablePendingOrderIds } from '../src/components/orders/orderSyncReconnect.mjs';
import { orderSaveSyncStatus } from '../src/components/orders/orderSaveSyncStatus.mjs';

assert.deepEqual(durablePendingOrderIds([
  { id: 'a', smartsheet_pending_local_sync: true },
  { id: 'b', smartsheet_pending_local_sync: false },
  { id: 'a', smartsheet_pending_local_sync: true },
  { id: 'c', smartsheet_pending_local_sync: true, deleted: true },
  { id: ' d ', smartsheet_pending_local_sync: true },
  { id: '', smartsheet_pending_local_sync: true },
]), ['a', 'd']);
console.log('PASS reload/reopen derives the Retry Sync queue only from durable active Order markers');

const pendingIndicator = orderSaveSyncStatus({ pendingSyncCount: 2 });
assert.equal(pendingIndicator.kind, 'pending');
assert.equal(pendingIndicator.text, '2 saved · waiting to sync');
console.log('PASS reopened Order Form visibly reports durable rows still waiting for Smartsheet');

const spreadsheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');

assert.match(spreadsheet, /const durablePendingIds = new Set\(durablePendingOrderIds\(ordersData\)\)/);
assert.match(spreadsheet, /pendingSyncIdsRef\.current = durablePendingIds/);
assert.match(spreadsheet, /setPendingSyncCount\(durablePendingIds\.size\)/);
assert.match(spreadsheet, /window\.addEventListener\('online', refreshAuthoritativeOrders\)/);
assert.match(spreadsheet, /window\.addEventListener\('focus', refreshAuthoritativeOrders\)/);
assert.match(spreadsheet, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/);
assert.match(spreadsheet, /if \(pendingSyncCount <= 0\) return undefined/);
assert.match(spreadsheet, /setInterval\(\(\) => loadData\(false\), 30000\)/);
console.log('PASS reconnect/focus/visibility and active durable-pending polling refresh authoritative Order markers promptly');

assert.match(widget, /const \[statusReadError, setStatusReadError\] = useState\(false\)/);
assert.match(widget, /setStatusReadError\(false\)/);
assert.match(widget, /setStatusReadError\(true\)/);
assert.match(widget, /window\.addEventListener\('online', refresh\)/);
assert.match(widget, /window\.addEventListener\('focus', refresh\)/);
assert.match(widget, /document\.addEventListener\('visibilitychange', refreshVisible\)/);
assert.match(widget, /const reconnectingStatus = Boolean\(statusReadError && interpretedStatus\.isRunning\)/);
assert.match(widget, /const isStale = !statusReadError &&/);
assert.match(widget, /const canRecoverStaleOrderRun = !statusReadError &&/);
assert.match(widget, /Reconnecting to sync status/);
assert.match(widget, /last known backend run remains authoritative/);
console.log('PASS a browser/network read failure shows reconnecting state and cannot falsely offer stale-run recovery');

const savedOrdersAction = backend.slice(
  backend.indexOf("if (action === 'push_saved_orders')"),
  backend.indexOf("if (action === 'push_saved_sales')"),
);
assert.match(savedOrdersAction, /saveSyncStatusForRun\(base44, \{[\s\S]*status: 'running'/);
assert.match(savedOrdersAction, /progress_updated_at: new Date\(\)\.toISOString\(\)/);
assert.match(savedOrdersAction, /const needsReview = orderRunRequiresReview\(\[result\]\)/);
assert.match(savedOrdersAction, /status: needsReview \? 'needs_review' : 'completed'/);
assert.match(savedOrdersAction, /results: \[result\]/);
console.log('PASS reopened tabs can reconstruct the authoritative running/completed/review outcome from persisted backend status');

assert.match(spreadsheet, /const verificationLoaded = await loadData\(false\)/);
assert.match(spreadsheet, /const unresolvedTargets = syncTargets\.filter\(\(\{ id \}\) => pendingSyncIdsRef\.current\.has\(id\)\)/);
console.log('PASS lost-response recovery still re-reads durable markers before asking the user to Retry Sync');
