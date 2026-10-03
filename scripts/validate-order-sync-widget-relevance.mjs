import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderFormSyncStatusRelevant } from '../src/components/orders/orderSyncWidgetRelevance.mjs';

assert.equal(orderFormSyncStatusRelevant(null), false);
assert.equal(orderFormSyncStatusRelevant({ status: 'running', progress_dataset: 'sales', current_step_label: 'Sales Pipeline → Smartsheet', results: [] }), false);
assert.equal(orderFormSyncStatusRelevant({ status: 'running', progress_dataset: 'orders', current_step_label: 'Order Form → Smartsheet', results: [] }), true);
assert.equal(orderFormSyncStatusRelevant({ status: 'running', current_step_label: 'Order Form → Smartsheet', results: [] }), true);
assert.equal(orderFormSyncStatusRelevant({ status: 'running', progress_dataset: 'sales', current_step_label: 'Sales Pipeline → Smartsheet', results: [{ dataset: 'orders', direction: 'pull' }] }), false);
assert.equal(orderFormSyncStatusRelevant({ status: 'needs_review', results: [{ dataset: 'orders', skipped: true }] }), true);
assert.equal(orderFormSyncStatusRelevant({ status: 'completed', results: [{ dataset: 'sales' }] }), false);
assert.equal(orderFormSyncStatusRelevant({ status: 'completed', results: [{ dataset: 'sales' }, { dataset: 'orders' }] }), true);
console.log('PASS Order Form sync widget ignores unrelated running Sales stages and shows Order results/stages only');

const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
assert.match(widget, /orderFormSyncStatusRelevant/);
assert.match(widget, /if \(compactOrderForm && !orderFormSyncStatusRelevant\(status\)\) return null/);
assert.match(widget, /staleSales/);
assert.match(widget, /recover_stale_sales_run/);
console.log('PASS Order-only relevance filter preserves concurrent shared Sales recovery logic');
