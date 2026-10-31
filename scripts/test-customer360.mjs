import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Static contract checks for the `customer_workspace` action in
// base44/functions/opportunityWorkspaceAction/entry.ts — the Customer 360
// workspace page codes against this exact response shape, so the action
// string, parameter aliases, response keys, totals fields, caps and entity
// bindings are all asserted here.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../base44/functions/opportunityWorkspaceAction/entry.ts'), 'utf8');

// The action must be registered in the router like every sibling action.
assert.match(src, /action === "customer_workspace"/, 'customer_workspace action is registered');

// Scope all following checks to the action's own block (it is the last
// action before the unsupported-action throw).
const start = src.indexOf('action === "customer_workspace"');
assert.ok(start > 0, 'customer_workspace block exists');
const block = src.slice(start, src.indexOf('Unsupported opportunity workspace action'));
assert.ok(block.length > 500, 'customer_workspace block has substance');

// Accepts {customer_id} with `id` as an alias; missing id and unknown
// customer keep the sibling error shape ({error} + 4xx via throw bad()).
assert.match(block, /body\?\.customer_id \|\| body\?\.id/, 'accepts customer_id or id alias');
assert.match(block, /throw bad\("customer_id is required\."/, 'missing id -> 400');
assert.match(block, /throw bad\("Customer not found\.", 404\)/, 'unknown customer -> 404');

// Every documented response list key is produced (the `lists` map holds them
// and Response.json spreads the capped result next to customer/totals).
for (const key of [
  'contacts', 'locations', 'opportunities', 'estimates', 'work_orders',
  'invoices', 'payments', 'purchase_orders', 'change_orders', 'activities',
]) {
  assert.match(block, new RegExp(`${key}:`), `response list "${key}" is produced`);
}
assert.match(block, /Response\.json\(\{ success: true, action, customer, \.\.\.capped, totals, truncated \}\)/,
  'response returns { success, action, customer, ...lists, totals, truncated }');

// Totals carries the documented fields.
for (const field of [
  'estimate_count', 'estimate_value', 'open_estimate_value', 'work_order_count',
  'invoiced', 'paid', 'balance', 'open_po_count', 'open_activity_count',
]) {
  assert.match(block, new RegExp(`${field}:`), `totals.${field} is computed`);
}

// Lists are capped (500 default, 50 for activities) and every list reports a
// truncated flag.
assert.match(block, /LIST_CAP = 500/, 'list cap of 500');
assert.match(block, /ACTIVITY_CAP = 50/, 'activity cap of 50');
assert.match(block, /truncated\[key\] = items\.length > cap/, 'per-list truncated flag');

// Every list sorts newest-first by created_date.
assert.match(block, /descCreated/, 'desc created_date sort comparator used');
assert.match(block, /"-created_date"/, 'desc created_date requested from entity API');

// The entities the task requires are queried with customer-ish fields.
for (const entity of [
  'CustomerContact', 'CustomerLocation', 'Opportunity', 'Estimate',
  'WorkOrder', 'Invoice', 'Payment', 'ChangeOrder', 'PurchaseOrder', 'Activity',
]) {
  assert.match(block, new RegExp(`${entity}\\.filter`), `${entity} is queried`);
}
assert.match(block, /Customer\.get\(customerId\)/, 'Customer record is loaded by id');

// Entities without a customer column link through document ids:
// purchase orders via opportunity/estimate/work order ids, activities via
// opportunity ids.
assert.match(block, /opportunityIds\.has\(clean\(p\?\.opportunity_id\)\)/, 'POs match opportunity linkage');
assert.match(block, /estimateIds\.has\(clean\(p\?\.estimate_id\)\)/, 'POs match estimate linkage');
assert.match(block, /workOrderIds\.has\(clean\(p\?\.work_order_id\)\)/, 'POs match work order linkage');
assert.match(block, /opportunityIds\.has\(clean\(a\?\.opportunity_id\)\)/, 'activities match opportunity linkage');

// invoicingAction semantics: void invoices are excluded from money totals and
// deleted/void rows never reach the lists.
assert.match(block, /clean\(i\?\.status\) !== "void"/, 'void invoices excluded from totals');
assert.match(block, /e\?\.deleted !== true/, 'deleted estimates excluded');
assert.match(block, /w\?\.deleted !== true/, 'deleted work orders excluded');
assert.match(block, /clean\(p\?\.status\) !== "void"/, 'void payments excluded');

console.log('PASS customer360');
