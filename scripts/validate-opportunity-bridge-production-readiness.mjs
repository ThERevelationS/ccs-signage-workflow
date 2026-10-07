import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPPORTUNITY_BRIDGE_PRODUCTION_POLICY,
  evaluateOpportunityBridgeProductionReadiness,
  historicalBridgeRuleContractPasses,
  selectOpportunityBridgeFirstBatch,
} from '../base44/shared/opportunityBridgeProductionReadiness.mjs';

const safeRow = (id, overrides = {}) => ({
  work_order_id:id,
  action:'proposed_create',
  sales_scope:'current',
  receipt_state:'clear',
  evidence_strength:'strong_stable_anchor',
  receipt_key:`workorder:${id}:opportunity:v1`,
  anchors:{ customer_id:`customer-${id}` },
  reasons:[],
  historical_reconciliation:null,
  ...overrides,
});

assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.VERSION, '0T-v1');
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED, false);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.RECEIPT_PERSISTENCE_ACTIVE, true);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.SECONDARY_CONFIRMATION_CONFIGURED, true);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.GUARDED_PRODUCTION_EXECUTOR_WIRED, true);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.FIRST_BATCH_SIZE, 1);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.MAX_BATCH_SIZE, 5);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.STOP_ON_FIRST_NON_SUCCESS, true);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.ROLLBACK_POLICY, 'forward_correction_only');
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.RETRY_POLICY, 'replan_and_reconcile_before_retry');
assert.equal(historicalBridgeRuleContractPasses(), true);

{
  const rows = [
    safeRow('wo-5'),
    safeRow('wo-2'),
    safeRow('wo-4'),
    safeRow('wo-1'),
    safeRow('wo-3'),
    safeRow('wo-6'),
    safeRow('historical', {
      historical_reconciliation:{ decision:'deterministic_won' },
    }),
    safeRow('unresolved', { anchors:{ customer_id:'' } }),
    safeRow('weak', { evidence_strength:'source_work_order_only' }),
    { ...safeRow('held'), action:'hold', reasons:['manual_review'] },
  ];
  const first = selectOpportunityBridgeFirstBatch(rows);
  assert.deepEqual(first.map((row) => row.work_order_id), ['wo-1']);
}

{
  const rows = Array.from({length:5}, (_,i) => safeRow(`wo-${i+1}`));
  rows.push({
    work_order_id:'held-1',
    action:'hold',
    receipt_state:'clear',
    sales_scope:'current',
    reasons:['open_status_terminal_task_conflict'],
  });
  const generatedAt='2026-10-04T18:00:00.000Z';
  const readiness = evaluateOpportunityBridgeProductionReadiness({
    plan:{
      rows,
      summary:{
        sales_candidates:6,
        proposed_create:5,
        proposed_recover_link:0,
        already_linked:0,
        held:1,
        excluded:0,
        historical_deterministic_won:0,
      },
    },
    generatedAt,
    now:'2026-10-04T18:01:00.000Z',
    receiptSchemaActivated:false,
    secondaryConfirmationConfigured:false,
  });

  assert.equal(readiness.technical_ready, true);
  assert.equal(readiness.rollout_ready, false);
  assert.equal(readiness.decision, 'NO_GO');
  assert.equal(readiness.first_batch.length, 1);
  assert.equal(readiness.checks.find((check)=>check.key==='durable_receipt_schema_activated').pass, false);
  assert.equal(readiness.checks.find((check)=>check.key==='durable_receipt_ledger_identity_clean').pass, false);
  assert.equal(readiness.checks.find((check)=>check.key==='secondary_confirmation_configured').pass, false);
  assert.equal(readiness.checks.find((check)=>check.key==='production_apply_enabled').pass, false);
}

{
  const rows = Array.from({length:5}, (_,i) => safeRow(`wo-${i+1}`));
  const readiness = evaluateOpportunityBridgeProductionReadiness({
    plan:{ rows, summary:{ held:0 } },
    generatedAt:'2026-10-07T18:00:00.000Z',
    now:'2026-10-07T18:01:00.000Z',
    receiptSchemaActivated:true,
    receiptLedgerSummary:{ total:0, anomaly_count:0, unresolved_count:0 },
    secondaryConfirmationConfigured:true,
    secondaryConfirmationContract:{ configured:true, mode:'typed_exact_batch_phrase' },
  });
  assert.equal(readiness.technical_ready, true);
  assert.equal(readiness.rollout_ready, false, 'Production apply must remain the final locked rollout gate.');
  assert.equal(readiness.decision, 'NO_GO');
  assert.equal(readiness.checks.find((check)=>check.key==='durable_receipt_schema_activated').pass, true);
  assert.equal(readiness.checks.find((check)=>check.key==='durable_receipt_ledger_identity_clean').pass, true);
  assert.equal(readiness.checks.find((check)=>check.key==='secondary_confirmation_configured').pass, true);
  assert.equal(readiness.checks.find((check)=>check.key==='guarded_production_executor_wired').pass, true);
  assert.equal(readiness.checks.find((check)=>check.key==='production_apply_enabled').pass, false);
}

{
  const rows = Array.from({length:5}, (_,i) => safeRow(`wo-${i+1}`));
  rows.push({
    work_order_id:'bad-receipt',
    action:'hold',
    sales_scope:'current',
    receipt_state:'duplicate_identity',
    reasons:['receipt_duplicate_identity'],
  });
  const readiness = evaluateOpportunityBridgeProductionReadiness({
    plan:{ rows, summary:{ held:1 } },
    generatedAt:'2026-10-04T18:00:00.000Z',
    now:'2026-10-04T18:00:30.000Z',
  });
  assert.equal(readiness.technical_ready, false);
  assert.equal(readiness.checks.find((check)=>check.key==='no_receipt_identity_anomalies').pass, false);
}

{
  const rows = Array.from({length:5}, (_,i) => safeRow(`wo-${i+1}`));
  rows.push({
    work_order_id:'bad-link',
    action:'hold',
    sales_scope:'current',
    receipt_state:'clear',
    reasons:['work_order_already_links_unmatched_opportunity'],
  });
  const readiness = evaluateOpportunityBridgeProductionReadiness({
    plan:{ rows, summary:{ held:1 } },
    generatedAt:'2026-10-04T18:00:00.000Z',
    now:'2026-10-04T18:00:30.000Z',
  });
  assert.equal(readiness.technical_ready, false);
  assert.equal(readiness.checks.find((check)=>check.key==='no_unexpected_opportunity_links').pass, false);
}

{
  const rows = Array.from({length:5}, (_,i) => safeRow(`wo-${i+1}`));
  const readiness = evaluateOpportunityBridgeProductionReadiness({
    plan:{ rows, summary:{ held:0 } },
    generatedAt:'2026-10-04T17:00:00.000Z',
    now:'2026-10-04T18:00:00.000Z',
  });
  assert.equal(readiness.checks.find((check)=>check.key==='fresh_plan').pass, false);
}

const proposedSchemaPath = new URL('../docs/corebridge/proposed/OpportunityBridgeOperationReceipt.jsonc', import.meta.url);
const proposedSchema = JSON.parse(fs.readFileSync(proposedSchemaPath, 'utf8'));
assert.equal(proposedSchema.name, 'OpportunityBridgeOperationReceipt');
assert(proposedSchema.description.includes('not an active Base44 entity'));
assert.equal(proposedSchema.properties.operation_key.type, 'string');
assert.equal(proposedSchema.properties.source_snapshot.type, 'object');
assert.equal(proposedSchema.properties.proposal_fingerprint.type, 'string');
assert.equal(proposedSchema.properties.attempt_history.type, 'array');
assert.equal(proposedSchema.rls.create.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(proposedSchema.rls.update.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(proposedSchema.rls.delete.user_condition.role, '__opportunity_bridge_server_only__');

const activeEntityPath = new URL('../base44/entities/OpportunityBridgeOperationReceipt.jsonc', import.meta.url);
assert.equal(fs.existsSync(activeEntityPath), true, '0S must activate the durable receipt entity.');
const activeSchema = JSON.parse(fs.readFileSync(activeEntityPath, 'utf8'));
assert.equal(activeSchema.name, 'OpportunityBridgeOperationReceipt');
assert(!activeSchema.description.includes('PROPOSED 0R CONTRACT ONLY'));
assert.equal(activeSchema.properties.operation_key.type, 'string');
assert.equal(activeSchema.properties.attempt_history.type, 'array');
assert.equal(activeSchema.rls.create.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(activeSchema.rls.read.user_condition.role, 'admin');
assert.equal(activeSchema.rls.update.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(activeSchema.rls.delete.user_condition.role, '__opportunity_bridge_server_only__');

console.log('Opportunity bridge production readiness gate validation: PASS');
