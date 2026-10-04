import assert from 'node:assert/strict';
import {
  OPPORTUNITY_BRIDGE_APPLY_STATUS,
  executeOpportunityBridgePlanRow,
} from '../base44/shared/opportunityBridgeApplyEngine.mjs';
import { buildOpportunityBridgeDryRunPlan } from '../base44/shared/opportunityBridgeDryRunPlanner.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const nextVersion = (current, tick) => {
  const base = Date.parse(current || '2026-10-04T00:00:00.000Z') || Date.parse('2026-10-04T00:00:00.000Z');
  return new Date(base + tick * 1000).toISOString();
};

function makeWorkOrder(overrides = {}) {
  return {
    id:'wo-1',
    title:'Channel Letters',
    client_name:'Example Customer',
    in_pipeline:true,
    completed:false,
    sales_status:'lead',
    current_task_description:'Follow up with customer',
    date_order_created:'',
    smartsheet_sheet_id:'8702703019812740',
    smartsheet_row_id:'123456789',
    opportunity_id:'',
    updated_date:'2026-10-04T00:00:00.000Z',
    ...overrides,
  };
}

function makePlan(workOrder, opportunities = []) {
  const plan = buildOpportunityBridgeDryRunPlan({
    workOrders:[clone(workOrder)],
    customers:[],
    estimates:[],
    opportunities:clone(opportunities),
  });
  const row = plan.rows.find((item) => item.work_order_id === workOrder.id);
  assert(row, 'Expected a dry-run row for the WorkOrder.');
  return row;
}

function makeAdapter({ workOrder, opportunities = [], throwAfterCreate = false, throwAfterLink = false, afterCreate = null } = {}) {
  let wo = clone(workOrder);
  let opps = clone(opportunities);
  let tick = 1;
  let nextOpportunityId = opps.length + 1;
  let createThrowPending = throwAfterCreate;
  let linkThrowPending = throwAfterLink;

  const bumpWorkOrder = (patch = {}) => {
    wo = { ...wo, ...clone(patch), updated_date:nextVersion(wo.updated_date, tick++) };
    return clone(wo);
  };

  return {
    get state() {
      return { workOrder:clone(wo), opportunities:clone(opps) };
    },
    mutateWorkOrder: bumpWorkOrder,
    async getWorkOrder(id) {
      return id === wo.id ? clone(wo) : null;
    },
    async findOpportunities({ workOrderId, receiptKey }) {
      return clone(opps.filter((opp) =>
        String(opp.creation_request_key || '') === String(receiptKey || '') ||
        String(opp.compatibility_work_order_id || '') === String(workOrderId || '')
      ));
    },
    async createOpportunity(payload) {
      const created = {
        ...clone(payload),
        id:`opp-${nextOpportunityId++}`,
        created_date:'2026-10-04T00:01:00.000Z',
        updated_date:'2026-10-04T00:01:00.000Z',
      };
      opps.push(created);
      if (typeof afterCreate === 'function') await afterCreate({ bumpWorkOrder, created:clone(created) });
      if (createThrowPending) {
        createThrowPending = false;
        throw new Error('Simulated lost create acknowledgement');
      }
      return clone(created);
    },
    async getOpportunity(id) {
      const found = opps.find((opp) => opp.id === id);
      return found ? clone(found) : null;
    },
    async linkWorkOrderIfUnchanged({ workOrderId, opportunityId, expectedSnapshot }) {
      if (workOrderId !== wo.id) throw new Error('WorkOrder missing');
      for (const [field, expected] of Object.entries(expectedSnapshot || {})) {
        if (field === 'opportunity_id') {
          if (String(wo.opportunity_id || '') !== String(expected || '')) throw new Error('Opportunity link changed');
        } else if (wo[field] !== expected) {
          throw new Error(`WorkOrder changed: ${field}`);
        }
      }
      wo = { ...wo, opportunity_id:opportunityId, updated_date:nextVersion(wo.updated_date, tick++) };
      if (linkThrowPending) {
        linkThrowPending = false;
        throw new Error('Simulated lost link acknowledgement');
      }
      return clone(wo);
    },
  };
}

{
  const workOrder = makeWorkOrder();
  const planRow = makePlan(workOrder);
  const adapter = makeAdapter({ workOrder });
  const first = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(first.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED);
  assert.equal(first.result_code, 'bridge_linked');
  assert.equal(adapter.state.opportunities.length, 1);
  assert.equal(adapter.state.workOrder.opportunity_id, adapter.state.opportunities[0].id);

  const second = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(second.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.ALREADY_LINKED);
  assert.equal(second.result_code, 'bridge_already_linked');
  assert.equal(adapter.state.opportunities.length, 1, 'Repeated execution must not create another Opportunity.');
}

{
  const workOrder = makeWorkOrder({ id:'wo-create-timeout', smartsheet_row_id:'200' });
  const planRow = makePlan(workOrder);
  const adapter = makeAdapter({ workOrder, throwAfterCreate:true });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED);
  assert.equal(result.create_status, 'created_recovered_after_error');
  assert.equal(adapter.state.opportunities.length, 1);
}

{
  const workOrder = makeWorkOrder({ id:'wo-link-timeout', smartsheet_row_id:'201' });
  const planRow = makePlan(workOrder);
  const adapter = makeAdapter({ workOrder, throwAfterLink:true });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED);
  assert.equal(result.result_code, 'bridge_link_recovered_after_error');
  assert.equal(adapter.state.opportunities.length, 1);
  assert.equal(adapter.state.workOrder.opportunity_id, adapter.state.opportunities[0].id);
}

{
  const workOrder = makeWorkOrder({ id:'wo-stale', smartsheet_row_id:'202' });
  const planRow = makePlan(workOrder);
  const adapter = makeAdapter({ workOrder });
  adapter.mutateWorkOrder({ current_task_description:'Changed by another user' });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.HELD);
  assert.equal(result.result_code, 'stale_source_snapshot');
  assert.equal(adapter.state.opportunities.length, 0);
}

{
  const workOrder = makeWorkOrder({ id:'wo-race-after-create', smartsheet_row_id:'203' });
  const planRow = makePlan(workOrder);
  const adapter = makeAdapter({
    workOrder,
    afterCreate:({ bumpWorkOrder }) => bumpWorkOrder({ sales_status:'quoted' }),
  });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.HELD);
  assert.equal(result.result_code, 'stale_source_snapshot_before_link');
  assert.equal(adapter.state.opportunities.length, 1, 'Created receipt is preserved for recovery; it is not deleted.');
  assert.equal(adapter.state.workOrder.opportunity_id, '');
}

{
  const workOrder = makeWorkOrder({ id:'wo-duplicate', smartsheet_row_id:'204' });
  const planRow = makePlan(workOrder);
  const payload = planRow.proposed_opportunity;
  const opportunities = [
    { ...clone(payload), id:'dup-1' },
    { ...clone(payload), id:'dup-2' },
  ];
  const adapter = makeAdapter({ workOrder, opportunities });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.HELD);
  assert.equal(result.result_code, 'receipt_duplicate_identity');
  assert.equal(adapter.state.opportunities.length, 2, 'Duplicate records must never be auto-deleted.');
}

{
  const workOrder = makeWorkOrder({ id:'wo-recover-existing', smartsheet_row_id:'205' });
  const planRow = makePlan(workOrder);
  const existing = { ...clone(planRow.proposed_opportunity), id:'existing-1' };
  const adapter = makeAdapter({ workOrder, opportunities:[existing] });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED);
  assert.equal(result.create_status, 'reused_preflight');
  assert.equal(adapter.state.opportunities.length, 1);
  assert.equal(adapter.state.workOrder.opportunity_id, 'existing-1');
}

{
  const workOrder = makeWorkOrder({ id:'wo-wrong-existing', smartsheet_row_id:'206' });
  const planRow = makePlan(workOrder);
  const existing = { ...clone(planRow.proposed_opportunity), id:'wrong-1', stage:'lost' };
  const adapter = makeAdapter({ workOrder, opportunities:[existing] });
  const result = await executeOpportunityBridgePlanRow({ planRow, adapter });
  assert.equal(result.status, OPPORTUNITY_BRIDGE_APPLY_STATUS.HELD);
  assert.equal(result.result_code, 'existing_opportunity_differs_from_proposal');
  assert.equal(adapter.state.workOrder.opportunity_id, '');
}

console.log('Opportunity bridge nonproduction apply harness: PASS');
