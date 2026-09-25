import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
console.log('PASS open-only default and accessible history use Date Received, not stale Pending status');

assert.deepEqual(orderStatusFromPulledDates({ date_received: '2026-09-25' }, { status: 'pending' }, false),
  { date_received: '2026-09-25', status: 'received' });
assert.deepEqual(orderStatusFromPulledDates({ date_ordered: '2026-09-23' }, null, false),
  { date_ordered: '2026-09-23', status: 'ordered' });
assert.deepEqual(orderStatusFromPulledDates({}, null, false), { status: 'pending' });
assert.deepEqual(orderStatusFromPulledDates({}, { status: 'cancelled' }, false), {});
assert.deepEqual(orderStatusFromPulledDates({}, { date_received: '2026-09-25', status: 'received' }, false), {});
assert.deepEqual(orderStatusFromPulledDates({ status: 'cancelled' }, null, true), { status: 'cancelled' });
console.log('PASS Order pull derives receipt state but never clears existing dates, cancelled Orders or explicit bound status');

const ui = readFileSync(new URL('../src/pages/OrderForm.jsx', import.meta.url), 'utf8');
const spreadsheet = readFileSync(new URL('../src/components/orders/OrderSpreadsheet.jsx', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../src/components/orders/OrderMobileCards.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
assert.match(ui, /useState\("not_received"\)/);
assert.match(ui, /value="all_with_received"/);
assert.match(ui, /order_form_filter === "all" \? "not_received"/);
assert.match(spreadsheet, /orderMatchesReceivedFilter\(order, filterStatus\)/);
assert.match(spreadsheet, /effectiveOrderStatus\(a\)/);
assert.match(mobile, /effectiveOrderStatus\(order\)/);
assert.match(backend, /dataset === 'orders'\) \{\s*Object\.assign\(fieldValues, orderStatusFromPulledDates/);
console.log('PASS main Order Form, mobile display and Order-only backend pull are wired consistently');
