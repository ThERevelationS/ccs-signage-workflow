import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderHistoryLayout } from '../src/components/orders/orderHistoryLayout.js';
import {
  effectiveOrderStatus, orderMatchesReceivedFilter, orderStatusFromPulledDates,
} from '../base44/shared/smartsheetOrderReceivedState.mjs';

const liveShape = [
  ...Array.from({ length: 126 }, (_, i) => ({ id: `open-${i}`, status: 'pending' })),
  ...Array.from({ length: 1549 }, (_, i) => ({ id: `dated-${i}`, status: 'pending', date_received: '2026-09-25' })),
];
assert.equal(liveShape.filter(order => orderMatchesReceivedFilter(order, 'not_received')).length, 126);
assert.equal(liveShape.filter(order => orderMatchesReceivedFilter(order, 'received')).length, 1549);
assert.equal(liveShape.filter(order => orderMatchesReceivedFilter(order, 'all_with_received')).length, 1675);
assert.equal(effectiveOrderStatus(liveShape[126]), 'received');
assert.equal(effectiveOrderStatus({ status: 'pending', date_ordered: '2026-09-23' }), 'ordered');
assert.equal(effectiveOrderStatus({ status: 'cancelled' }), 'cancelled');
assert.equal(orderMatchesReceivedFilter({ status: 'pending', date_ordered: '2026-09-23' }, 'ordered'), true);
assert.equal(orderMatchesReceivedFilter({ status: 'pending', date_received: '2026-09-25' }, 'pending'), false);
assert.equal(effectiveOrderStatus({ receipt_option: 'In Stock', status: 'pending' }), 'received');
assert.equal(orderMatchesReceivedFilter({ receipt_option: 'In Stock' }, 'not_received'), false);
assert.equal(orderMatchesReceivedFilter({ receipt_option: 'Backordered' }, 'not_received'), false);
assert.equal(orderMatchesReceivedFilter({ receipt_option: 'Backordered' }, 'received'), true);
assert.equal(orderMatchesReceivedFilter({ receipt_option: 'Stock', status: 'pending' }, 'received'), true);
assert.deepEqual(orderStatusFromPulledDates({ receipt_option: 'In Stock' }, null, false),
  { receipt_option: 'In Stock', status: 'received' });
for (const option of ['Stock', 'stock', 'Ordered Kit', 'N/A', 'Backordered', 'In House']) {
  assert.deepEqual(
    orderStatusFromPulledDates({ date_received: '', receipt_option: option },
      { date_received: '2026-09-20', date_ordered: '2026-09-18', status: 'received' }, false),
    { date_received: '', receipt_option: option, status: 'received' },
    `Smartsheet receipt option ${option} must not revert a received Order to Pending/Ordered`);
}
assert.deepEqual(orderStatusFromPulledDates({ date_received: '', receipt_option: 'Stock' },
  { status: 'pending' }, true), { date_received: '', receipt_option: 'Stock' });
console.log('PASS Date Received and nonempty receipt options enter History; stale status alone stays open');

assert.deepEqual(orderStatusFromPulledDates({ date_received: '2026-09-25' }, { status: 'pending' }, false),
  { date_received: '2026-09-25', status: 'received' });
assert.deepEqual(orderStatusFromPulledDates({ date_ordered: '2026-09-23' }, null, false),
  { date_ordered: '2026-09-23', status: 'ordered' });
assert.deepEqual(orderStatusFromPulledDates({}, null, false), { status: 'pending' });
assert.deepEqual(orderStatusFromPulledDates({}, { status: 'cancelled' }, false), {});
assert.deepEqual(orderStatusFromPulledDates({}, { date_received: '2026-09-25', status: 'received' }, false), {});
assert.deepEqual(orderStatusFromPulledDates({ status: 'cancelled' }, null, true), { status: 'cancelled' });
console.log('PASS Order pull derives receipt state but never clears existing dates, cancelled Orders or explicit bound status');

// The virtual History header must not shift real Order IDs, indexes or exports.
const splitOrders = [
  { id: 'open', status: 'pending' },
  { id: 'ordered', status: 'ordered', date_ordered: '2026-09-24' },
  { id: 'stock', status: 'pending', receipt_option: 'Stock' },
  { id: 'backordered', status: 'pending', receipt_option: 'Backordered' },
  { id: 'dated', date_received: '2026-09-24' },
];
const split = orderHistoryLayout(splitOrders, 'all_with_received');
assert.equal(split.split, true);
assert.deepEqual([split.openCount, split.receivedCount, split.historyVirtualIndex, split.virtualCount], [2, 3, 2, 6]);
assert.deepEqual([0, 1, 3, 4, 5].map(i => splitOrders[split.orderIndexAtVirtual(i)].id),
  ['open', 'ordered', 'stock', 'backordered', 'dated']);
assert.equal(orderMatchesReceivedFilter(splitOrders[1], 'open_only'), true);
assert.equal(orderMatchesReceivedFilter(splitOrders[2], 'open_only'), false);
assert.equal(orderMatchesReceivedFilter(splitOrders[1], 'received'), false);
assert.equal(orderMatchesReceivedFilter(splitOrders[2], 'received'), true);
const openOnly = orderHistoryLayout(splitOrders.slice(0, 2), 'all_with_received');
assert.deepEqual([openOnly.openCount, openOnly.receivedCount, openOnly.historyVirtualIndex, openOnly.virtualCount],
  [2, 0, null, 2]);
const historyOnly = orderHistoryLayout(splitOrders.slice(2), 'all_with_received');
assert.deepEqual([historyOnly.openCount, historyOnly.receivedCount, historyOnly.historyVirtualIndex, historyOnly.virtualCount],
  [0, 3, 0, 4]);
const selectedOpen = orderHistoryLayout(splitOrders.slice(0, 2), 'open_only');
assert.deepEqual([selectedOpen.split, selectedOpen.historyVirtualIndex, selectedOpen.virtualCount], [false, null, 2]);
const empty = orderHistoryLayout([], 'all_with_received');
assert.deepEqual([empty.openCount, empty.receivedCount, empty.historyVirtualIndex, empty.virtualCount], [0, 0, null, 0]);
console.log('PASS default split layout, virtual History divider and zero/open/history-only cases');

const ui = readFileSync(new URL('../src/pages/OrderForm.jsx', import.meta.url), 'utf8');
const spreadsheet = readFileSync(new URL('../src/components/orders/OrderSpreadsheet.jsx', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../src/components/orders/OrderMobileCards.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
assert.match(ui, /useState\("all_with_received"\)/);
assert.match(ui, /value="open_only"/);
assert.match(ui, /value="all_with_received"/);
assert.match(ui, /\["all", "not_received"\]\.includes\(me\.order_form_filter\)/);
assert.match(spreadsheet, /orderHistoryLayout\(filteredOrders, filterStatus\)/);
assert.match(spreadsheet, /key="received-history-heading"/);
assert.match(spreadsheet, /historyLayout\.orderIndexAtVirtual\(virtualRow\.index\)/);
assert.match(spreadsheet, /historyLayout\.virtualCount/);
assert.match(spreadsheet, /Jump to received history/);
assert.match(spreadsheet, /border-t-2 border-slate-300 bg-slate-100/);
assert.match(mobile, /aria-label="Open orders"/);
assert.match(mobile, /aria-label="Received order history"/);
assert.doesNotMatch(mobile, /All Orders — Not Received|History — Received/);
assert.match(mobile, /separateHistory/);
assert.match(spreadsheet, /orderMatchesReceivedFilter\(order, filterStatus\)/);
assert.match(spreadsheet, /effectiveOrderStatus\(a\)/);
assert.match(mobile, /effectiveOrderStatus\(order\)/);
assert.match(mobile, /order\.receipt_option/);
assert.match(spreadsheet, /localStorage\.setItem\('orderReceiptOptions'/);
assert.match(spreadsheet, /receipt_option: option/);
assert.match(spreadsheet, /date_received: dateStr, receipt_option: ''/);
assert.match(backend, /dataset === 'orders'\) \{\s*Object\.assign\(fieldValues, orderStatusFromPulledDates/);
assert.match(backend, /record\.date_needed_option && !record\.date_needed/);
assert.match(backend, /record\.date_ordered_option && !record\.date_ordered/);
assert.match(backend, /record\.receipt_option && !record\.date_received/);
console.log('PASS main Order Form, mobile display and Order-only backend pull are wired consistently');
