import assert from 'node:assert/strict';
import { getSalesRecordClassification } from '../src/components/sales/salesRecordScopes.js';
import {
  OPPORTUNITY_BRIDGE_DECISIONS,
  buildOpportunityBridgeAudit,
  classifyWorkOrderSalesScope,
  opportunityStageFromWorkOrder,
  proposedOpportunityFromWorkOrder,
} from '../base44/shared/opportunityBridgeAudit.mjs';

const parityFixtures = [
  { id:'current', in_pipeline:true, completed:false, sales_status:'lead', client_name:'A', title:'A' },
  { id:'quoted', in_pipeline:true, completed:false, sales_status:'quoted', client_name:'B', title:'B' },
  { id:'outcome', in_pipeline:true, completed:false, sales_status:'won', client_name:'C', title:'C' },
  { id:'legacy', in_pipeline:false, completed:true, current_task_description:'Lost - no response', client_name:'D', title:'D' },
  { id:'other', in_pipeline:false, completed:true, current_task_description:'Installed', client_name:'E', title:'E' },
];
for (const row of parityFixtures) {
  const bridgeScope = classifyWorkOrderSalesScope(row);
  const existing = getSalesRecordClassification(row);
  const normalizedBridge = bridgeScope === 'legacy_history' ? 'legacy_history' : bridgeScope;
  assert.equal(normalizedBridge, existing, `Sales scope parity failed for ${row.id}`);
}

assert.equal(opportunityStageFromWorkOrder({ in_pipeline:true, sales_status:'lead' }, 'current'), 'new');
assert.equal(opportunityStageFromWorkOrder({ in_pipeline:true, sales_status:'quoted' }, 'current'), 'quoted');
assert.equal(opportunityStageFromWorkOrder({ in_pipeline:true, sales_status:'follow_up' }, 'current'), 'follow_up');
assert.equal(opportunityStageFromWorkOrder({ in_pipeline:true, sales_status:'on_hold' }, 'current'), 'on_hold');
assert.equal(opportunityStageFromWorkOrder({ in_pipeline:true, sales_status:'won' }, 'outcome'), 'won');
assert.equal(opportunityStageFromWorkOrder({ in_pipeline:false, current_task_description:'Completed Sale - paid' }, 'legacy_history'), 'won');
assert.equal(opportunityStageFromWorkOrder({ in_pipeline:false, current_task_description:'Closed - no response' }, 'legacy_history'), '');

{
  const source = {
    id:'wo-preserve',
    in_pipeline:true,
    completed:false,
    sales_status:'follow_up',
    title:'Monument Sign',
    client_name:'Example Customer',
    description:'Replace monument faces',
    sales_rep:'Brett Heinlein',
    lead_source:'Repeat Customer',
    origination:'Phone',
    current_task_description:'Call customer Friday',
    current_task_deadline:'2026-10-09',
    current_task_assigned_to:'Brett Heinlein',
    permitting:'maybe',
    install_yes:true,
    removal_no:true,
    electrical_city:true,
    customer_is_tenant:true,
    estimate_id:'est1',
    customer_id:'cust1',
    smartsheet_sheet_id:'8702703019812740',
    smartsheet_row_id:'123456789',
    sales_import_source_id:'legacy-row-1',
    date_initial_contact:'2026-10-01',
    date_estimate_sent:'2026-10-02',
    budget_less_than:5000,
    contact_name:'Alex',
    contact_email:'alex@example.com',
    contact_phone:'555-0100',
    sales_stage_changed_at:'2026-10-02T10:00:00.000Z',
    sales_last_activity_at:'2026-10-02T11:00:00.000Z',
  };
  const proposed = proposedOpportunityFromWorkOrder(source, {
    resolvedCustomerId:'cust1',
    customerResolutionSource:'work_order_customer_id',
  });
  assert.equal(proposed.compatibility_work_order_id, source.id);
  assert.equal(proposed.stage, 'follow_up');
  assert.equal(proposed.salesperson, source.sales_rep);
  assert.equal(proposed.lead_source, source.lead_source);
  assert.equal(proposed.origination, source.origination);
  assert.equal(proposed.next_action, source.current_task_description);
  assert.equal(proposed.next_action_due, source.current_task_deadline);
  assert.equal(proposed.next_action_assignee, source.current_task_assigned_to);
  assert.equal(proposed.customer_id, 'cust1');
  assert.equal(proposed.source_summary.budget_less_than, 5000, 'budget_less_than must be preserved raw, not silently reinterpreted as budget_amount');
  assert.equal(Object.hasOwn(proposed, 'budget_amount'), false);
}

{
  const customers = [
    { id:'cust1', company_name:'Canonical One', legacy_client_names:['Approved Alias'] },
  ];
  const estimates = [
    { id:'est1', work_order_id:'wo1', customer_id:'cust1' },
  ];
  const workOrders = [
    {
      id:'wo1', in_pipeline:true, completed:false, sales_status:'quoted',
      title:'Project', client_name:'Approved Alias', estimate_id:'est1',
      smartsheet_sheet_id:'8702703019812740', smartsheet_row_id:'111',
      lead_source:'Web', sales_rep:'Megan', current_task_description:'Follow up',
    },
  ];
  const audit = buildOpportunityBridgeAudit({ workOrders, customers, estimates, opportunities:[] });
  assert.equal(audit.summary.safe_auto_bridge, 1);
  assert.equal(audit.summary.manual_review, 0);
  assert.equal(audit.rows[0].anchors.customer_id, 'cust1');
  assert.equal(audit.rows[0].anchors.customer_resolution_source, 'approved_legacy_client_name');
  assert.equal(audit.rows[0].evidence_strength, 'strong_stable_anchor');
}

{
  const workOrders = [
    { id:'wo1', in_pipeline:true, completed:false, sales_status:'lead', title:'A', client_name:'A', estimate_id:'dup' },
    { id:'wo2', in_pipeline:true, completed:false, sales_status:'lead', title:'B', client_name:'B', estimate_id:'dup' },
  ];
  const audit = buildOpportunityBridgeAudit({ workOrders, estimates:[{ id:'dup' }] });
  assert.equal(audit.summary.manual_review, 2);
  assert.ok(audit.rows.every((row) => row.review_reasons.includes('duplicate_estimate_id')));
}

{
  const workOrders = [
    { id:'wo1', in_pipeline:true, completed:false, sales_status:'lead', title:'A', client_name:'A', smartsheet_sheet_id:'10', smartsheet_row_id:'20' },
    { id:'wo2', in_pipeline:true, completed:false, sales_status:'lead', title:'B', client_name:'B', smartsheet_sheet_id:'10', smartsheet_row_id:'20' },
  ];
  const audit = buildOpportunityBridgeAudit({ workOrders });
  assert.equal(audit.summary.manual_review, 2);
  assert.ok(audit.rows.every((row) => row.review_reasons.includes('duplicate_smartsheet_identity')));
}

{
  const workOrders = [{
    id:'wo1', in_pipeline:true, completed:false, sales_status:'lead',
    title:'Historical looking row', client_name:'Client',
    current_task_description:'Completed Sale',
    smartsheet_sheet_id:'10', smartsheet_row_id:'21',
  }];
  const audit = buildOpportunityBridgeAudit({ workOrders });
  assert.equal(audit.rows[0].sales_scope, 'legacy_history');
  assert.equal(audit.rows[0].decision, OPPORTUNITY_BRIDGE_DECISIONS.MANUAL_REVIEW);
  assert.ok(audit.rows[0].review_reasons.includes('legacy_smartsheet_terminal_task_requires_review'));
}

{
  const workOrders = [{
    id:'wo1', in_pipeline:false, completed:true,
    title:'Old row', client_name:'Client', current_task_description:'Closed - no response',
  }];
  const audit = buildOpportunityBridgeAudit({ workOrders });
  assert.equal(audit.rows[0].sales_scope, 'legacy_history');
  assert.equal(audit.rows[0].decision, OPPORTUNITY_BRIDGE_DECISIONS.MANUAL_REVIEW);
  assert.ok(audit.rows[0].review_reasons.includes('legacy_closed_stage_ambiguous'));
}

{
  const workOrders = [{
    id:'wo1', in_pipeline:true, completed:false, sales_status:'lead',
    title:'Unresolved Customer', client_name:'No approved mapping',
  }];
  const audit = buildOpportunityBridgeAudit({ workOrders, customers:[] });
  assert.equal(audit.rows[0].decision, OPPORTUNITY_BRIDGE_DECISIONS.SAFE_AUTO);
  assert.equal(audit.rows[0].anchors.customer_resolution_source, 'unresolved_allowed');
  assert.equal(audit.rows[0].proposed_opportunity.customer_id, undefined);
}

{
  const workOrders = [{
    id:'wo1', in_pipeline:true, completed:false, sales_status:'lead',
    title:'Name-only match must stay unresolved', client_name:'Exact Company Name',
    contact_email:'same@example.com', contact_phone:'555-0101',
  }];
  const customers = [{
    id:'cust-name-only', company_name:'Exact Company Name',
    contact_email:'same@example.com', contact_office_phone:'555-0101',
    legacy_client_names:[],
  }];
  const audit = buildOpportunityBridgeAudit({ workOrders, customers });
  assert.equal(audit.rows[0].anchors.customer_resolution_source, 'unresolved_allowed');
  assert.equal(audit.rows[0].proposed_opportunity.customer_id, undefined, 'Name/email/phone alone must not create an authoritative Customer link.');
}

{
  const workOrders = [{
    id:'wo1', in_pipeline:true, completed:false, sales_status:'lead',
    title:'Broken customer', client_name:'Client', customer_id:'missing',
  }];
  const audit = buildOpportunityBridgeAudit({ workOrders, customers:[] });
  assert.equal(audit.rows[0].decision, OPPORTUNITY_BRIDGE_DECISIONS.MANUAL_REVIEW);
  assert.ok(audit.rows[0].review_reasons.includes('missing_customer_id_target'));
}

{
  const workOrders = [{
    id:'wo1', in_pipeline:true, completed:false, sales_status:'won',
    title:'Won', client_name:'Client', opportunity_id:'opp1',
  }];
  const opportunities = [{ id:'opp1', compatibility_work_order_id:'wo1' }];
  const audit = buildOpportunityBridgeAudit({ workOrders, opportunities });
  assert.equal(audit.rows[0].decision, OPPORTUNITY_BRIDGE_DECISIONS.ALREADY_LINKED);
}

{
  const shell = {
    id:'shell', in_pipeline:true, completed:false, sales_status:'lead',
    client_name:'Unknown', title:'Smartsheet row 123', smartsheet_row_id:'123',
  };
  const audit = buildOpportunityBridgeAudit({ workOrders:[shell] });
  assert.equal(audit.rows[0].decision, OPPORTUNITY_BRIDGE_DECISIONS.SMARTSHEET_SHELL);
}

console.log('Opportunity bridge dry-run validation: PASS');
