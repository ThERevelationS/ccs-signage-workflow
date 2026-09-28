import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterOrderCustomerJobs, isActiveOrderCustomerJob, cleanOrderJobTitle, orderCustomerJobSubtitle, verifyActiveOrderCustomerJob, orderAutomaticRiderShadowIds } from '../src/components/orders/orderCustomerJobPicker.mjs';

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
  job('smartsheet-child', { smartsheet_parent_row_id: '1234567890' }),
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
assert.equal(isActiveOrderCustomerJob(job('hierarchy-child', { smartsheet_parent_row_id: '8533271213768580' })), false);
assert.equal(isActiveOrderCustomerJob(job('malformed-parent-metadata', { smartsheet_parent_row_id: 'not-a-row-id' })), true);
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

// Live-shaped New Cincy example: the Workflow sheet's automatic child/rider row
// was historically imported as another top-level WorkOrder because hierarchy
// metadata was not persisted. The Order picker must show only the root job.
const newCincyRoot = job('new-cincy-root', {
  client_name: 'New Cincy Inc.', title: 'Smartsheet row 8533271213768580',
  current_task_description: 'WIP - Production/Fabrication', estimate_amount: 5160.08,
  smartsheet_sheet_id: '8702703019812740', smartsheet_row_id: '8533271213768580',
});
const newCincyShadow = job('new-cincy-shadow', {
  client_name: 'New Cincy Inc - P&P Reface, Wall Sign, Reskin Awning', title: '2026-09-29',
  current_task_description: 'WIP - Production/Fabrication', estimate_amount: 5160.08,
  smartsheet_sheet_id: '8702703019812740', smartsheet_row_id: '4979196880813956',
});
assert.deepEqual([...orderAutomaticRiderShadowIds([newCincyRoot, newCincyShadow])], ['new-cincy-shadow']);
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, newCincyShadow], 'New Cincy').map(x => x.id), ['new-cincy-root']);
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, { ...newCincyShadow, smartsheet_parent_row_id: '8533271213768580' }], 'New Cincy').map(x => x.id), ['new-cincy-root']);
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, newCincyShadow], 'P&P'), []);
console.log('PASS New Cincy automatic rider shadow is suppressed while the one active root job remains');

// Never collapse legitimate same-customer jobs from name alone.
const legitDifferentAmount = { ...newCincyShadow, id: 'legit-amount', estimate_amount: 6000 };
const legitDifferentTask = { ...newCincyShadow, id: 'legit-task', current_task_description: 'Permit Review' };
const rootWithRealTitle = { ...newCincyRoot, id: 'root-real-title', title: 'Main monument sign' };
const childForRealTitle = { ...newCincyShadow, id: 'child-real-title' };
const otherSheet = { ...newCincyShadow, id: 'other-sheet', smartsheet_sheet_id: '999999' };
const unsynced = { ...newCincyShadow, id: 'unsynced', smartsheet_row_id: null, smartsheet_sheet_id: null };
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, legitDifferentAmount], 'New Cincy').map(x => x.id), ['new-cincy-root', 'legit-amount']);
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, legitDifferentTask], 'New Cincy').map(x => x.id), ['new-cincy-root', 'legit-task']);
assert.deepEqual(filterOrderCustomerJobs([rootWithRealTitle, childForRealTitle], 'New Cincy').map(x => x.id), ['root-real-title', 'child-real-title']);
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, otherSheet], 'New Cincy').map(x => x.id), ['new-cincy-root', 'other-sheet']);
assert.deepEqual(filterOrderCustomerJobs([newCincyRoot, unsynced], 'New Cincy').map(x => x.id), ['new-cincy-root', 'unsynced']);
assert.deepEqual(filterOrderCustomerJobs([{ ...newCincyRoot, current_task_description: 'Completed Sale' }, newCincyShadow], 'New Cincy').map(x => x.id), ['new-cincy-shadow']);
console.log('PASS automatic-rider compatibility rule does not hide legitimate distinct, unsynced, other-sheet, or orphaned active jobs');

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
