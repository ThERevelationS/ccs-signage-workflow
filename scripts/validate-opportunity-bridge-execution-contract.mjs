import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPPORTUNITY_BRIDGE_EXECUTION,
  opportunityBridgeReceiptKey,
  bridgeSourceSnapshot,
} from '../base44/shared/opportunityBridgeExecutionPlan.mjs';

assert.equal(opportunityBridgeReceiptKey('wo-123'), 'workorder:wo-123:opportunity:v1');
assert.equal(opportunityBridgeReceiptKey(''), '');
assert.equal(OPPORTUNITY_BRIDGE_EXECUTION.CREATE, 'proposed_create');
assert.equal(OPPORTUNITY_BRIDGE_EXECUTION.HOLD, 'hold');

const source = {
  id:'wo-1',
  opportunity_id:'',
  sales_status:'lead',
  in_pipeline:true,
  current_task_description:'Completed Sale',
  date_order_created:'2025-01-02',
  updated_date:'2026-10-03T12:00:00Z',
  client_name:'Preserved Customer',
  estimate_amount:1234,
};
const snap = bridgeSourceSnapshot(source);
assert.deepEqual(Object.keys(snap), [
  'id','opportunity_id','customer_id','estimate_id','sales_status','in_pipeline',
  'current_task_description','date_order_created','smartsheet_sheet_id',
  'smartsheet_row_id','sales_import_source_id','updated_date'
]);
assert.equal(snap.sales_status, 'lead');
assert.equal(snap.current_task_description, 'Completed Sale');
assert.equal(snap.date_order_created, '2025-01-02');
assert.equal(Object.hasOwn(snap, 'client_name'), false);
assert.equal(Object.hasOwn(snap, 'estimate_amount'), false);

const opportunitySchema = fs.readFileSync(new URL('../base44/entities/Opportunity.jsonc', import.meta.url), 'utf8');
assert(opportunitySchema.includes('"creation_request_key"'));
assert(opportunitySchema.includes('"compatibility_work_order_id"'));

const workOrderSchema = fs.readFileSync(new URL('../base44/entities/WorkOrder.jsonc', import.meta.url), 'utf8');
assert(workOrderSchema.includes('"opportunity_id"'));

console.log('Opportunity bridge execution contract validation: PASS');
