import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planOrderRequestorContactAppend,
  orderRequestorOptionsPreserved,
  sharedOrderRequestorColumnId,
  buildSharedOrderContactCell,
  readSharedOrderRequestor,
} from '../base44/shared/smartsheetOrderContact.mjs';

const existing = [
  { email: 'brett@example.com', name: 'Brett' },
  { email: 'twyla@example.com', name: 'Twyla' },
];
const newUser = { email: 'HARDWARE@example.com', full_name: 'Hardware Manager' };
const first = planOrderRequestorContactAppend(existing, newUser);
assert.equal(first.changed, true);
assert.deepEqual(first.options, [...existing, { email: 'hardware@example.com', name: 'Hardware Manager' }]);
assert.equal(orderRequestorOptionsPreserved(existing, first.options), true);
assert.equal(orderRequestorOptionsPreserved(first.options, existing), false);
assert.deepEqual(existing, [
  { email: 'brett@example.com', name: 'Brett' },
  { email: 'twyla@example.com', name: 'Twyla' },
]);
const second = planOrderRequestorContactAppend(first.options, newUser);
assert.equal(second.changed, false);
assert.deepEqual(second.options, first.options);
const old = planOrderRequestorContactAppend(existing, { email: 'BRETT@example.com', full_name: 'Brett Heinlein' });
assert.equal(old.changed, false);
assert.equal(old.options[0].name, 'Brett');
assert.throws(() => planOrderRequestorContactAppend(existing, { email: 'bad', full_name: 'No Email' }), /valid email/);
assert.throws(() => planOrderRequestorContactAppend(existing, { email: 'person@example.com', full_name: '' }), /full name/);
assert.throws(() => planOrderRequestorContactAppend(
  [{ email: 'a@example.com', name: 'One' }, { email: 'A@example.com', name: 'Two' }],
  newUser,
), /duplicate contact emails/);
assert.equal(sharedOrderRequestorColumnId({ requestor_name: '345', requestor_email: '345' }), '345');
assert.equal(sharedOrderRequestorColumnId({ requestor_name: '345', requestor_email: '346' }), '');
assert.deepEqual(buildSharedOrderContactCell({ requestor_email: 'hardware@example.com', requestor_name: 'Hardware Manager' }, '345'), {
  columnId: '345', value: 'hardware@example.com', displayValue: 'Hardware Manager',
});
assert.deepEqual(readSharedOrderRequestor({ value: 'hardware@example.com', displayValue: 'Hardware Manager' }), {
  name: 'Hardware Manager', email: 'hardware@example.com',
});
console.log('PASS Order contact options add once by email; preserve historical labels and original cell translation');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const admin = readFileSync('src/components/admin/UserManagement.jsx', 'utf8');
assert.match(backend, /if \(action === 'order_requestor_contact_sync'\)/);
assert.match(backend, /adminActor\?\.role !== 'admin'/);
assert.match(backend, /AuthorizedEmail\.filter\(\{ email: requestedEmail \}\)/);
assert.match(backend, /sharedOrderRequestorColumnId\(profile\?\.column_bindings\)/);
assert.match(backend, /type: 'CONTACT_LIST', contactOptions: plan\.options/);
assert.match(backend, /orderRequestorOptionsPreserved\(plan\.options, verifiedOptions\)/);
assert.match(backend, /smartsheetWriteNoTimeoutRetry\('PUT', columnPath, token/);
assert.match(admin, /const inviteResult = await createAuthorizedUserAdmin/);
assert.ok(admin.indexOf('action: "order_requestor_contact_sync"') > admin.indexOf('const inviteResult = await createAuthorizedUserAdmin'));
assert.match(admin, /Order Requestor Smartsheet sync needs attention/);
console.log('PASS admin user creation appends only Order Requestor contact with verified permanent-column write');
