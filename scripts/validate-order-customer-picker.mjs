import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterOrderCustomerJobs, isActiveOrderCustomerJob, cleanOrderJobTitle, orderCustomerJobSubtitle, verifyActiveOrderCustomerJob } from '../src/components/orders/orderCustomerJobPicker.mjs';

const job = (id, overrides = {}) => ({
  id, client_name: 'Advantage Storage', title: 'Self Storage sign',
  description: 'Lobby and exterior', current_stage: 'production',
  sales_status: 'won', completed: false, deleted: false,
  is_rider: false, ...overrides,
});
const rows = [
  job('active'),
  job('open-lead', { sales_status: 'lead', current_stage: 'estimating' }),
  job('pending-install', { current_stage: 'installation' }),
  job('lost', { sales_status: 'lost' }),
  job('mixed-case-lost', { sales_status: ' LOST ' }),
  job('completed', { completed: true }),
  job('completed-stage', { current_stage: 'completed', completed: false }),
  job('closed-stage', { current_stage: 'closed' }),
  job('closed-status', { status: 'Closed' }),
  job('closed-sales', { sales_status: 'closed' }),
  job('closed-flag', { closed: true }),
  job('deleted', { deleted: true }),
  job('rider', { is_rider: true }),
  job('legacy-lost', { in_pipeline: false, current_task_description: 'Lost to competitor' }),
  job('legacy-completed', { current_task_description: 'Completed sale - done' }),
  job('legacy-closed', { current_task_description: 'Closed account' }),
  job('modern-active', { in_pipeline: true, current_task_description: 'Closed paperwork', sales_status: 'won' }),
  job('no-id', { id: null }),
];
const expected = ['active', 'open-lead', 'pending-install', 'modern-active'];
assert.deepEqual(rows.filter(isActiveOrderCustomerJob).map(x => x.id), expected);
assert.deepEqual(filterOrderCustomerJobs(rows, '').map(x => x.id), expected);
assert.deepEqual(filterOrderCustomerJobs(rows, 'advantage exterior').map(x => x.id), expected);
assert.deepEqual(filterOrderCustomerJobs(rows, 'unrelated'), []);
assert.deepEqual(filterOrderCustomerJobs(null, 'advantage'), []);
assert.equal(filterOrderCustomerJobs(rows, 'advantage', 2).length, 2);
assert.equal(isActiveOrderCustomerJob(job('won-active', { sales_status: 'won', close_date: '2026-09-25' })), true);
console.log('PASS only nonterminal active main jobs appear; historical closed and lost states excluded without hiding active won jobs');

// Read-only production-shaped fixtures: all three Sunrise rows are marked
// Lead/estimating by the importer, but only one has an active WIP task.
const sunrise = [
  job('completed-1', { client_name: 'Sunrise Treatment Center', title: '2026-04-24',
    current_stage: 'estimating', sales_status: 'lead', in_pipeline: true, current_task_description: 'Completed Sale' }),
  job('wip', { client_name: 'Sunrise Treatment Center', title: '2026-10-14',
    current_stage: 'estimating', sales_status: 'lead', in_pipeline: true, current_task_description: 'WIP - Production/Fabrication' }),
  job('completed-2', { client_name: 'Sunrise Treatment Center', title: 'Smartsheet row 4456987745249156',
    current_stage: 'estimating', sales_status: 'lead', in_pipeline: true, current_task_description: 'Completed Sale' }),
];
assert.deepEqual(filterOrderCustomerJobs(sunrise, 'Sunrise Treatment').map(x => x.id), ['wip']);
assert.deepEqual(filterOrderCustomerJobs(sunrise.slice(0, 1).concat(sunrise.slice(2)), 'Sunrise'), []);
assert.equal(cleanOrderJobTitle('Smartsheet row 4456987745249156'), '');
assert.equal(cleanOrderJobTitle('Imported from Smartsheet row 4456987745249156'), '');
assert.equal(cleanOrderJobTitle('Swarovski wall sign'), 'Swarovski wall sign');
assert.equal(orderCustomerJobSubtitle({ title: 'Smartsheet row 4456987745249156', description: '', current_task_description: 'WIP - Production/Fabrication' }),
  'Current task: WIP - Production/Fabrication');
assert.equal(orderCustomerJobSubtitle({ title: 'Smartsheet row 4456987745249156' }), 'No project title');
assert.equal(orderCustomerJobSubtitle({ title: 'Smartsheet row 4456987745249156', description: 'Acrylic panel' }), 'Acrylic panel');
assert.deepEqual(filterOrderCustomerJobs([job('placeholder', {title: 'Smartsheet row 4456987745249156', description: ''})], '4456987745249156'), []);
console.log('PASS Sunrise live-shaped examples leave one WIP job; fabricated Smartsheet IDs cannot display as project titles');

const expectedId = 'permanent-job-id';
const activeEntity = { get: async (id) => job(id, { current_task_description: 'WIP - Production' }) };
const closedEntity = { get: async (id) => job(id, { in_pipeline: true, sales_status: 'lead', current_task_description: 'Completed Sale' }) };
assert.equal((await verifyActiveOrderCustomerJob(activeEntity, expectedId)).eligible, true);
assert.equal((await verifyActiveOrderCustomerJob(closedEntity, expectedId)).eligible, false);
assert.equal((await verifyActiveOrderCustomerJob({ get: async () => job('wrong-id') }, expectedId)).eligible, false);
assert.equal((await verifyActiveOrderCustomerJob({ get: async () => null }, expectedId)).eligible, false);
await assert.rejects(verifyActiveOrderCustomerJob({ get: async () => { throw new Error('read failed'); } }, expectedId), /read failed/);
await assert.rejects(verifyActiveOrderCustomerJob({}, expectedId), /unavailable/);
console.log('PASS permanent-ID selection revalidates active status and fails closed on stale, missing, mismatched and failed reads');

const ui = readFileSync(new URL('../src/components/orders/OrderSpreadsheet.jsx', import.meta.url), 'utf8');
assert.match(ui, /filterOrderCustomerJobs\(workOrders, searchTerm\)/);
assert.match(ui, /getFilteredWorkOrders\(customerSearch\)\.map\(wo =>/);
assert.match(ui, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
assert.match(ui, /activeCustomerPickerRef\.current\?\.contains\(event\.target\)/);
assert.match(ui, /event\.relatedTarget && !event\.currentTarget\.contains\(event\.relatedTarget\)/);
assert.match(ui, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(ui, /onClick=\{\(event\) => \{\s*setCustomerSearch\(event\.currentTarget\.value\);\s*setShowCustomerDropdown\(order\.id\)/);
assert.match(ui, /onKeyDown=\{\(event\) => \{\s*if \(event\.key === "Escape"\)/);
assert.match(ui, /onClick=\{async \(\) => \{/);
assert.match(ui, /verifyActiveOrderCustomerJob\(WorkOrder, wo\.id\)/);
assert.match(ui, /if \(!eligible\)/);
assert.match(ui, /customerSelectionInFlightRef\.current/);
assert.match(ui, /orderCustomerJobSubtitle\(wo\)/);
assert.match(ui, /setOrders\(prev => prev\.map\(o => o\.id === order\.id \? \{/);
assert.match(ui, /pendingChangesRef\.current\[order\.id\] =/);
assert.doesNotMatch(ui.slice(ui.indexOf('{/* Customer Name with Work Order Link */}'),
  ui.indexOf('{/* Request Type */}')), /setTimeout\(/);
console.log('PASS picker opens on focus, stays open for internal pointer/focus, and closes on outside/Escape/selection without a blur timer');
