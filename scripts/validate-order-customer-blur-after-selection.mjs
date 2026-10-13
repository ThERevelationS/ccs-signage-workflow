import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isStaleVerifiedOrderCustomerBlur } from '../src/components/orders/orderCustomerBlurSafety.mjs';

const choice = { customerName: 'Acme Signs', workOrderId: 'permanent-job-987' };
const pending = { customer_name: choice.customerName, work_order_id: choice.workOrderId };
const blur = (name, selected = choice) => {
  if (!isStaleVerifiedOrderCustomerBlur({ selection: selected, blurValue: name })) {
    pending.customer_name = name;
  }
};
blur('Ac'); // old search text arrives AFTER selection
assert.deepEqual(pending, { customer_name: 'Acme Signs', work_order_id: 'permanent-job-987' });
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: choice, blurValue: 'Acme Signs' }), false);
console.log('PASS delayed blur cannot corrupt a verified customer/work-order association');

const afterAutosave = {};
if (!isStaleVerifiedOrderCustomerBlur({ selection: choice, blurValue: 'Ac' })) {
  afterAutosave.customer_name = 'Ac';
}
assert.deepEqual(afterAutosave, {});
const selections = new Map([['a', choice], ['b', { customerName: 'Beta', workOrderId: 'job-b' }]]);
selections.delete('a'); // deliberate new typing removes only this Order marker
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: selections.get('a'), blurValue: 'New typing' }), false);
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: selections.get('b'), blurValue: 'Old Beta' }), true);
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: null, blurValue: 'Manual name' }), false);
assert.equal(isStaleVerifiedOrderCustomerBlur({ selection: { customerName: 'Acme', workOrderId: '' }, blurValue: 'Old' }), false);
console.log('PASS post-save stale blur blocked; deliberate typing and unrelated rows retain normal handling');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const customer = ui.slice(ui.indexOf('{/* Customer Name with Work Order Link */}'), ui.indexOf('{/* Request Type */}'));
const input = customer.slice(customer.indexOf('<Input'), customer.indexOf('{order.work_order_id &&'));
const picker = customer.slice(customer.indexOf('onClick={async () => {'));
const reset = input.indexOf('verifiedCustomerSelectionRef.current.delete(order.id)');
const type = input.indexOf('setOrders(prev =>');
const gate = input.indexOf('isStaleVerifiedOrderCustomerBlur({');
const pendingWrite = input.indexOf('pendingChangesRef.current[order.id] =');
assert.ok(reset >= 0 && type > reset && gate > type && pendingWrite > gate);
assert.match(input, /if \(!staleSelectedName && customerName !==/);
const chosenPending = picker.indexOf('pendingChangesRef.current[order.id] = {');
const permanentId = picker.indexOf('work_order_id: latest.id', chosenPending);
const guard = picker.indexOf('verifiedCustomerSelectionRef.current.set(order.id', permanentId);
const close = picker.indexOf('setShowCustomerDropdown(null)', guard);
assert.ok(chosenPending >= 0 && permanentId > chosenPending && guard > permanentId && close > guard);
assert.match(ui, /verifiedCustomerSelectionRef\.current\.delete\(target\.id\)/);
assert.match(picker, /orderLocalEditGenerationRef\.current !== selectionEditGeneration/);
console.log('PASS source writes verified pair first, ignores old blur, preserves newer edits and cleans up deleted rows');
