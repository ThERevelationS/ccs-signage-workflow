import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isStaleVerifiedOrderCustomerBlur } from '../src/components/orders/orderCustomerBlurSafety.mjs';

// A user typed a search term, chose a verified Work Order, and then the
// previous input emits a delayed blur with its pre-selection DOM value.
const selection = { customerName: 'Acme Signs', workOrderId: 'work-order-987' };
const pending = { customer_name: selection.customerName, work_order_id: selection.workOrderId };
const simulateBlur = (inputName, verifiedChoice, baselineName = 'Original Customer') => {
  if (!isStaleVerifiedOrderCustomerBlur({ selection: verifiedChoice, blurValue: inputName }) &&
      inputName !== baselineName) {
    pending.customer_name = inputName;
  }
};
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection, blurValue: 'Ac' }), true);
simulateBlur('Ac', selection);
assert.deepEqual(pending, { customer_name: 'Acme Signs', work_order_id: 'work-order-987' });
console.log('PASS delayed pre-selection blur cannot mix old customer name with verified permanent Work Order ID');

// Delayed blur must also be ignored after autosave cleared pending fields.
const alreadySaved = {};
const persistedName = 'Acme Signs';
if (!isStaleVerifiedOrderCustomerBlur({ selection, blurValue: 'Ac' })) {
  alreadySaved.customer_name = 'Ac';
}
assert.deepEqual(alreadySaved, {});
assert.equal(persistedName, 'Acme Signs');
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection, blurValue: 'Acme Signs' }), false);
console.log('PASS delayed blur after Base44 autosave cannot requeue an obsolete customer name');

// Intentional typing invalidates only that row's selection marker. Other rows'
// verified selections remain protected, and normal blur still captures typing.
const byOrderId = new Map([
  ['order-1', selection],
  ['order-2', { customerName: 'Other Customer', workOrderId: 'job-2' }],
]);
byOrderId.delete('order-1'); // Customer Input onChange on first row
assert.equal(isStaleVerifiedOrderCustomerBlur({
  selection: byOrderId.get('order-1'), blurValue: 'New intended name',
}), false);
assert.equal(isStaleVerifiedOrderCustomerBlur({
  selection: byOrderId.get('order-2'), blurValue: 'Old search',
}), true);
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: null, blurValue: 'normal' }), false);
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: { customerName: 'Acme', workOrderId: '' }, blurValue: 'Old' }), false);
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: { customerName: 5, workOrderId: 'job' }, blurValue: 'Old' }), false);
console.log('PASS deliberate edits and unrelated Orders still use normal blur handling');

// Ensure actual source installs this narrow gate in the right order. Check
// protected association is recorded before marking a selection, and the gate
// is evaluated before mutating pending customer fields.
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const customer = ui.slice(ui.indexOf('{/* Customer Name with Work Order Link */}'), ui.indexOf('{/* Request Type */}'));
const input = customer.slice(customer.indexOf('<Input'), customer.indexOf('{order.work_order_id &&'));
const picker = customer.slice(customer.indexOf('onClick={async () => {'));
const typedReset = input.indexOf('verifiedCustomerSelectionRef.current.delete(order.id)');
const typedUpdate = input.indexOf('setOrders(prev =>');
const blurGate = input.indexOf('isStaleVerifiedOrderCustomerBlur({');
const blurWrite = input.indexOf('pendingChangesRef.current[order.id] =');
assert.ok(typedReset > 0 && typedReset < typedUpdate && blurGate > typedUpdate && blurGate < blurWrite);
assert.match(input, /if \(!staleSelectedName && customerName !==/);
assert.match(input, /if \(customerNameDraftOrderRef.current === order.id\) customerNameDraftOrderRef.current = null/);
const verifiedWrite = picker.indexOf('pendingChangesRef.current[order.id] = {');
const linkWrite = picker.indexOf('work_order_id: latest.id', verifiedWrite);
const selectionSave = picker.indexOf('verifiedCustomerSelectionRef.current.set(order.id', linkWrite);
const closePicker = picker.indexOf('setShowCustomerDropdown(null)', selectionSave);
assert.ok(verifiedWrite > 0 && linkWrite > verifiedWrite && selectionSave > linkWrite && closePicker > selectionSave);
assert.match(ui, /verifiedCustomerSelectionRef\.current\.delete\(target\.id\)/);
assert.match(picker, /orderLocalEditGenerationRef\.current !== selectionEditGeneration/);
console.log('PASS Order UI protects verified association before blur, preserves pending changes, and resets only deliberate edits');
