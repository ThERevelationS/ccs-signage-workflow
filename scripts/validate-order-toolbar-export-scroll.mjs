import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUseOrderExport } from '../base44/shared/orderExportAccess.mjs';

const read = path => readFileSync(path, 'utf8');
const schema = JSON.parse(read('base44/entities/AuthorizedEmail.jsonc'));
const page = read('src/pages/OrderForm.jsx');
const spreadsheet = read('src/components/orders/OrderSpreadsheet.jsx');
const adminUsers = read('src/components/admin/UserManagement.jsx');
const userBackend = read('base44/functions/manageAuthorizedUsers/entry.ts');
const login = read('base44/functions/verifyLogin/entry.ts');
const session = read('base44/functions/verifySession/entry.ts');
const review = read('src/components/orders/OrderReviewTools.jsx');
const syncAdmin = read('src/components/admin/SmartsheetSyncSettings.jsx');

assert.equal(schema.properties.can_order_export.type, 'boolean');
assert.equal(schema.properties.can_order_export.default, false);
assert.equal(canUseOrderExport({ role: 'admin', can_order_export: true }), true);
for (const actor of [
  null, {}, { role: 'admin' }, { role: 'admin', can_order_export: false },
  { role: 'admin', can_import_export: true }, { role: 'user', can_order_export: true },
  { role: 'user', can_import_export: true },
]) assert.equal(canUseOrderExport(actor), false, 'Unassigned users and non-admins never see Export');
assert.match(adminUsers, /formData\.role === "admin" && \([\s\S]*?admin-order-form-export/);
assert.match(adminUsers, /can_order_export: val === 'admin' \? formData\.can_order_export : false/);
assert.match(userBackend, /can_order_export: row\?\.role === 'admin' && row\?\.can_order_export === true/);
assert.match(userBackend, /can_order_export: role === 'admin' && input\?\.can_order_export === true/);
assert.match(userBackend, /if \(desired\.role === 'user'\) desired\.can_order_export = false/);
assert.match(userBackend, /legacyUnsetOrderExport/);
for (const source of [login, session]) assert.match(source, /can_order_export: user\.role === 'admin' && user\.can_order_export === true/);
assert.match(page, /const canOrderExport = canUseOrderExport\(currentUser\)/);
assert.match(page, /\{canOrderExport && \(\s*<Button[\s\S]*?Export/);
assert.match(page, /canOrderExport=\{canOrderExport\}/);
assert.match(spreadsheet, /if \(!canOrderExport \|\| !canUseOrderExport\(currentUser\)\) \{/);
console.log('PASS Order Export is default OFF, admin-only, independently assigned and guarded at the button and export method');

for (const text of ['Review emails', 'Review sync attempts', 'Review dates']) {
  assert.ok(!page.includes(text), text + ' must not clutter the Order Form toolbar');
  assert.ok(review.includes(text), text + ' must remain available to authorized admin diagnostics');
}
assert.match(review, /if \(!sessionToken\) return null/);
assert.match(review, /<OrderRequestorEmailReview/);
assert.match(review, /<OrderCreateAttemptReview/);
assert.match(review, /<OrderDateParityReview/);
assert.match(syncAdmin, /<OrderReviewTools sessionToken=\{sessionToken\}/);
console.log('PASS review buttons are removed from Order Form without losing admin-only diagnostics');

assert.match(page, /<PullToRefresh/);
assert.match(page, /className="min-h-full p-4 pb-20 sm:p-6 flex flex-col"/);
assert.match(page, /className="w-full min-w-0 flex flex-col"/);
assert.doesNotMatch(page, /className="h-full overflow-hidden p-4/);
assert.doesNotMatch(page, /flex-1 flex flex-col overflow-hidden/);
assert.match(page, /flex flex-wrap items-center gap-2/);
const pull = read('src/components/mobile/PullToRefresh.jsx');
assert.match(pull, /className="h-full overflow-y-auto"/);
assert.doesNotMatch(pull, /preventDefault\(/);
console.log('PASS mobile Order Form no longer traps card content inside nested overflow-hidden containers');
