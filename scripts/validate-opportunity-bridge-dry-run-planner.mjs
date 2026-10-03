import assert from 'node:assert/strict';
import {
  OPPORTUNITY_BRIDGE_DRY_RUN,
  bridgeSourceSnapshotsEqual,
  buildOpportunityBridgeDryRunPlan,
  opportunityBridgeReceiptState,
} from '../base44/shared/opportunityBridgeDryRunPlanner.mjs';
import { bridgeSourceSnapshot } from '../base44/shared/opportunityBridgeExecutionPlan.mjs';

const customer = { id:'cust1', company_name:'Acme', legacy_client_names:['Acme Legacy'] };

{
  const workOrder = {
    id:'safe-1', title:'Safe', client_name:'Acme Legacy',
    in_pipeline:true, completed:false, sales_status:'lead',
    current_task_description:'Follow up with customer',
    smartsheet_sheet_id:'10', smartsheet_row_id:'11',
    updated_date:'2026-10-03T12:00:00Z',
  };
  const plan = buildOpportunityBridgeDryRunPlan({ workOrders:[workOrder], customers:[customer] });
  assert.equal(plan.summary.proposed_create, 1);
  assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_CREATE);
  assert.equal(plan.rows[0].proposed_opportunity.creation_request_key, 'workorder:safe-1:opportunity:v1');
  assert.equal(plan.rows[0].proposed_opportunity.compatibility_work_order_id, 'safe-1');
}

{
  const workOrder = {
    id:'hist-won', title:'Historical Won', client_name:'Historical',
    in_pipeline:true, completed:false, sales_status:'lead',
    current_task_description:'Completed Sale',
    date_order_created:'2025-05-01',
    smartsheet_sheet_id:'10', smartsheet_row_id:'12',
    updated_date:'2026-10-03T12:00:00Z',
  };
  const plan = buildOpportunityBridgeDryRunPlan({ workOrders:[workOrder] });
  assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_CREATE);
  assert.equal(plan.rows[0].proposed_opportunity.stage, 'won');
  assert.equal(plan.rows[0].historical_reconciliation.decision, 'deterministic_won');
  assert.equal(plan.rows[0].proposed_opportunity.source_summary.historical_reconciliation.version, 1);
  assert.equal(plan.rows[0].proposed_opportunity.source_summary.sales_status, 'lead');
}

{
  for (const task of ['Lost', 'Closed - Attempted Follow-up/No Response', 'Completed Sale']) {
    const workOrder = {
      id:`hold-${task}`, title:'Held', client_name:'Held',
      in_pipeline:true, completed:false, sales_status:'lead',
      current_task_description:task,
      smartsheet_sheet_id:'20', smartsheet_row_id:String(Math.abs(task.length + 100)),
      updated_date:'2026-10-03T12:00:00Z',
    };
    const plan = buildOpportunityBridgeDryRunPlan({ workOrders:[workOrder] });
    assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.HOLD);
  }
}

{
  const source = {
    id:'stale-1', title:'Source', client_name:'Source',
    in_pipeline:true, completed:false, sales_status:'lead',
    current_task_description:'Follow up',
    smartsheet_sheet_id:'30', smartsheet_row_id:'31',
    updated_date:'2026-10-03T12:00:00Z',
  };
  const expected = bridgeSourceSnapshot(source);
  assert.equal(bridgeSourceSnapshotsEqual(expected, source), true);
  const changed = { ...source, current_task_description:'New task', updated_date:'2026-10-03T12:01:00Z' };
  assert.equal(bridgeSourceSnapshotsEqual(expected, changed), false);
  const plan = buildOpportunityBridgeDryRunPlan({
    workOrders:[changed],
    expectedSourceSnapshots:{ 'stale-1': expected },
  });
  assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.HOLD);
  assert.deepEqual(plan.rows[0].reasons, ['stale_source_snapshot']);
}

{
  const opportunities = [
    { id:'opp1', creation_request_key:'workorder:wo1:opportunity:v1', compatibility_work_order_id:'wo1' },
    { id:'opp2', creation_request_key:'workorder:wo1:opportunity:v1', compatibility_work_order_id:'wo2' },
  ];
  assert.equal(opportunityBridgeReceiptState(opportunities, 'wo1').state, 'duplicate_identity');
}

{
  const opportunities = [
    { id:'opp1', creation_request_key:'workorder:wo1:opportunity:v1', compatibility_work_order_id:'wo2' },
    { id:'opp2', creation_request_key:'workorder:wo2:opportunity:v1', compatibility_work_order_id:'wo1' },
  ];
  assert.equal(opportunityBridgeReceiptState(opportunities, 'wo1').state, 'identity_conflict');
}

{
  const opportunities = [
    { id:'opp1', creation_request_key:'workorder:wo1:opportunity:v1', compatibility_work_order_id:'' },
  ];
  assert.equal(opportunityBridgeReceiptState(opportunities, 'wo1').state, 'incomplete_existing_identity');
}

{
  const workOrder = {
    id:'recover-1', title:'Recover', client_name:'Recover',
    in_pipeline:true, completed:false, sales_status:'lead',
    current_task_description:'Follow up',
    smartsheet_sheet_id:'40', smartsheet_row_id:'41',
    updated_date:'2026-10-03T12:00:00Z',
  };
  const opportunity = {
    id:'opp-recover',
    creation_request_key:'workorder:recover-1:opportunity:v1',
    compatibility_work_order_id:'recover-1',
  };
  const plan = buildOpportunityBridgeDryRunPlan({ workOrders:[workOrder], opportunities:[opportunity] });
  assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_RECOVER_LINK);
  assert.equal(plan.rows[0].existing_opportunity_id, 'opp-recover');
}

{
  const workOrder = {
    id:'linked-1', title:'Linked', client_name:'Linked',
    in_pipeline:true, completed:false, sales_status:'lead',
    current_task_description:'Follow up',
    smartsheet_sheet_id:'50', smartsheet_row_id:'51',
    opportunity_id:'opp-linked',
    updated_date:'2026-10-03T12:00:00Z',
  };
  const opportunity = {
    id:'opp-linked',
    creation_request_key:'workorder:linked-1:opportunity:v1',
    compatibility_work_order_id:'linked-1',
  };
  const plan = buildOpportunityBridgeDryRunPlan({ workOrders:[workOrder], opportunities:[opportunity] });
  assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.ALREADY_LINKED);
}

{
  const shell = {
    id:'shell', title:'Smartsheet row 123', client_name:'Unknown',
    in_pipeline:true, completed:false, sales_status:'lead',
    smartsheet_row_id:'123',
  };
  const plan = buildOpportunityBridgeDryRunPlan({ workOrders:[shell] });
  assert.equal(plan.rows[0].action, OPPORTUNITY_BRIDGE_DRY_RUN.EXCLUDED);
}

console.log('Opportunity bridge full dry-run planner validation: PASS');
