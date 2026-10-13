import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shouldUnlinkOrderJobForTypedCustomer,
  orderAfterTypedCustomerName,
  pendingAfterManualCustomerBlur,
} from '../src/components/orders/orderCustomerAssociationSafety.mjs';
import { isStaleVerifiedOrderCustomerBlur } from '../src/components/orders/orderCustomerBlurSafety.mjs';

const linked = { id: 'order-1', customer_name: 'Original Customer', work_order_id: 'permanent-job-101', description: 'Print panels' };
assert.equal(shouldUnlinkOrderJobForTypedCustomer(linked, 'Original Customer'), false);
assert.equal(shouldUnlinkOrderJobForTypedCustomer(linked, 'Different Customer'), true);
assert.deepEqual(orderAfterTypedCustomerName(linked, 'Different Customer'), {
  ...linked, customer_name: 'Different Customer', work_order_id: '',
});
assert.equal(orderAfterTypedCustomerName(linked, 'Original Customer').work_order_id, 'permanent-job-101');
assert.equal(orderAfterTypedCustomerName({ ...linked, work_order_id: '' }, 'Different Customer').work_order_id, '');
console.log('PASS changing an associated Order name immediately unlinks its old job in the UI; unchanged names preserve links');

const queued = pendingAfterManualCustomerBlur({
  baseline: linked,
  pending: { vendor: 'Vendor A' },
  customerName: 'Different Customer',
  unlinkJob: true,
});
assert.deepEqual(queued, { vendor: 'Vendor A', customer_name: 'Different Customer', work_order_id: '' });
assert.deepEqual(pendingAfterManualCustomerBlur({
  baseline: linked, pending: { work_order_id: 'newly-chosen-job', customer_name: 'Temporary' },
  customerName: 'Manually Typed Name', unlinkJob: true,
}), { customer_name: 'Manually Typed Name', work_order_id: '' });
assert.deepEqual(pendingAfterManualCustomerBlur({
  baseline: linked, pending: { date_needed: '2026-11-01' },
  customerName: 'Original Customer', unlinkJob: false,
}), { date_needed: '2026-11-01' });
assert.deepEqual(pendingAfterManualCustomerBlur({
  baseline: linked, pending: { customer_name: 'Temporary', vendor: 'Vendor A' },
  customerName: 'Original Customer', unlinkJob: true,
}), { vendor: 'Vendor A', work_order_id: '' });
console.log('PASS blur stages customer name and permanent association removal atomically; other Order edits remain intact');

// Job selection after a manual unlink replaces BOTH pending association
// fields, and the old blurred search string cannot undo the verified choice.
const chosen = { customerName: 'Verified Job Client', workOrderId: 'new-permanent-job' };
const selectedPending = { ...queued, customer_name: chosen.customerName, work_order_id: chosen.workOrderId };
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: chosen, blurValue: 'Different Customer' }), true);
assert.deepEqual(selectedPending, { vendor: 'Vendor A', customer_name: 'Verified Job Client', work_order_id: 'new-permanent-job' });
console.log('PASS verified active-job selection can relink, and delayed customer blur cannot restore an old name');

// Check the actual handlers, not just helper behavior.
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const picker = ui.slice(ui.indexOf('{/* Customer Name with Work Order Link */}'), ui.indexOf('{/* Request Type */}'));
const typing = picker.slice(picker.indexOf('onChange={(e) => {'), picker.indexOf('onBlur={(event) => {', picker.indexOf('onChange={(e) => {')));
const blur = picker.slice(picker.indexOf('onBlur={(event) => {', picker.indexOf('onChange={(e) => {')), picker.indexOf('onFocus={(e) => {'));
const select = picker.slice(picker.indexOf('onClick={async () => {'));
assert.match(typing, /shouldUnlinkOrderJobForTypedCustomer\(order, val\)/);
assert.match(typing, /manuallyUnlinkedCustomerOrderIdsRef\.current\.add\(order\.id\)/);
assert.match(typing, /orderAfterTypedCustomerName\(o, val\)/);
assert.match(blur, /isStaleVerifiedOrderCustomerBlur\(/);
assert.match(blur, /if \(!staleSelectedName\)/);
assert.match(blur, /pendingAfterManualCustomerBlur\(\{/);
assert.match(blur, /unlinkJob: unlinkedJob/);
assert.match(blur, /pendingChangesRef\.current\[order\.id\] = pending/);
assert.match(blur, /manuallyUnlinkedCustomerOrderIdsRef\.current\.delete\(order\.id\)/);
assert.match(select, /customer_name: latest\.client_name,\s*work_order_id: latest\.id/);
assert.match(select, /manuallyUnlinkedCustomerOrderIdsRef\.current\.delete\(order\.id\)/);
assert.match(ui, /manuallyUnlinkedCustomerOrderIdsRef\.current\.delete\(target\.id\)/);
const update = ui.slice(ui.indexOf('const updateOrder = (orderId, field, value, skipHistory = false) => {'), ui.indexOf('const persistImmediateOrderFields'));
assert.match(update, /field === 'customer_name' &&\s*\(shouldUnlinkOrderJobForTypedCustomer\(currentOrder, value\) \|\|\s*manuallyUnlinkedCustomerOrderIdsRef\.current\.has\(orderId\)\)/);
assert.match(update, /\[field\]: value, \.\.\.\(unlinkCustomerJob \? \{ work_order_id: '' \} : \{\}\)/);
assert.match(ui, /onClear=\{\(\) => clearCell\(contextMenu\.order\.id, contextMenu\.fieldName\)\}/);
assert.match(ui, /const clearCell = \(orderId, fieldName\) => \{\s*updateOrder\(orderId, fieldName, ""\)/);
console.log('PASS Order Form typing, context-menu Clear, and verified job selection keep the customer/job association consistent');
