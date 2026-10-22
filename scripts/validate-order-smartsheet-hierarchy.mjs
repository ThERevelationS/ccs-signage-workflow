import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActiveOrderCustomerJob, filterOrderCustomerJobs } from '../src/components/orders/orderCustomerJobPicker.mjs';

const schema = JSON.parse(readFileSync('base44/entities/WorkOrder.jsonc', 'utf8'));
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8').replace(/\r\n/g, '\n');
const syncUtils = readFileSync('base44/shared/smartsheetSyncUtils.ts', 'utf8').replace(/\r\n/g, '\n');

assert.equal(schema.properties.smartsheet_parent_row_id.type, 'string');
assert.match(schema.properties.smartsheet_parent_row_id.description, /parent-row identity/i);
console.log('PASS WorkOrder has a stable Smartsheet parent-row metadata field');

assert.match(syncUtils, /parent_id: row\?\.parentId \? String\(row\.parentId\) : ''/);
assert.match(backend, /const salesParentRowId = dataset === 'sales' && \/\^\\d\+\$\/\.test\(cleanText\(row\?\.parent_id, 40\)\)/);
assert.match(backend, /cleanText\(existing\?\.smartsheet_parent_row_id, 40\) === salesParentRowId/);
assert.match(backend, /dataset === 'sales' \? \{ smartsheet_parent_row_id: salesParentRowId \} : \{\}/);
assert.match(backend, /newRecord\.smartsheet_parent_row_id = salesParentRowId/);

const hierarchySlice = backend.slice(
  backend.indexOf("const salesParentRowId = dataset === 'sales'"),
  backend.indexOf('let createdCount = 0;'),
);
assert.doesNotMatch(hierarchySlice, /is_rider\s*:/);
assert.doesNotMatch(hierarchySlice, /parent_work_order_id\s*:/);
console.log('PASS Workflow pulls preserve hierarchy metadata without rewriting Fleet/Sales rider relationships');

const base = {
  id: 'root', client_name: 'Example Co', title: 'Main sign',
  current_stage: 'production', sales_status: 'won', completed: false, deleted: false,
  is_rider: false, smartsheet_row_id: '111', smartsheet_sheet_id: '222',
};
const child = {
  ...base, id: 'child', client_name: 'Example Co - Automatic Rider',
  smartsheet_row_id: '333', smartsheet_parent_row_id: '111',
};
assert.equal(isActiveOrderCustomerJob(base), true);
assert.equal(isActiveOrderCustomerJob(child), false);
assert.deepEqual(filterOrderCustomerJobs([base, child], 'Example Co').map(row => row.id), ['root']);
console.log('PASS Order picker treats permanent Smartsheet hierarchy as authoritative and shows only the top-level active job');

const malformed = { ...child, id: 'malformed', smartsheet_parent_row_id: 'not-numeric' };
assert.equal(isActiveOrderCustomerJob(malformed), true);
console.log('PASS malformed hierarchy metadata does not silently hide a job');
