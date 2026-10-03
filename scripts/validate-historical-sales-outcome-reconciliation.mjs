import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HISTORICAL_SALES_RECONCILIATION,
  buildHistoricalSalesReconciliationAudit,
  historicalSalesOutcomeEvidence,
  historicalTerminalTaskFamily,
  historicalTerminalTaskSubtype,
  isValidHistoricalDate,
  reconcileHistoricalSalesOutcome,
  summarizeTerminalTaskReversals,
} from '../base44/shared/historicalSalesOutcomeReconciliation.mjs';

assert.equal(historicalTerminalTaskFamily('Completed Sale'), 'completed_sale');
assert.equal(historicalTerminalTaskFamily('Lost - We took too long'), 'lost');
assert.equal(historicalTerminalTaskFamily('Closed - Did not Lose'), 'closed');
assert.equal(historicalTerminalTaskSubtype('Closed - Attempted Follow-up/No Response'), 'closed_no_response');
assert.equal(historicalTerminalTaskSubtype('Closed - Did not Lose'), 'closed_did_not_lose');
assert.equal(isValidHistoricalDate('2026-10-03'), true);
assert.equal(isValidHistoricalDate('2026-02-30'), false);
assert.equal(isValidHistoricalDate('10/03/2026'), false);

{
  const result = reconcileHistoricalSalesOutcome({
    id:'won-1', in_pipeline:true, sales_status:'lead',
    current_task_description:'Completed Sale',
    date_order_created:'2025-06-12',
  });
  assert.equal(result.decision, HISTORICAL_SALES_RECONCILIATION.DETERMINISTIC_WON);
  assert.equal(result.proposed_stage, 'won');
  assert.equal(result.safe_for_bridge, true);
}

{
  const result = reconcileHistoricalSalesOutcome({
    id:'completed-no-order', in_pipeline:true, sales_status:'lead',
    current_task_description:'Completed Sale',
    est_inv_at:'12345', estimate_amount:5000, date_estimate_sent:'2025-06-01',
    project_install_date:'2025-07-01', permit_number:'P-1',
  });
  assert.equal(result.decision, HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW);
  assert.ok(result.reasons.includes('completed_sale_task_not_authoritative_without_valid_order_created'));
  assert.deepEqual(
    historicalSalesOutcomeEvidence({
      est_inv_at:'12345', estimate_amount:5000, date_estimate_sent:'2025-06-01',
      project_install_date:'2025-07-01', permit_number:'P-1',
    }).weak_context_fields,
    ['est_inv_at','estimate_amount','date_estimate_sent','project_install_date','permit_evidence'],
    'Weak contextual fields must never silently promote a historical outcome.'
  );
}

{
  const result = reconcileHistoricalSalesOutcome({
    id:'lost-no-authority', in_pipeline:true, sales_status:'lead',
    current_task_description:'Lost - We took too long',
    est_inv_at:'12346', estimate_amount:3000,
  });
  assert.equal(result.decision, HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW);
  assert.equal(result.proposed_stage, '');
  assert.ok(result.reasons.includes('lost_task_lacks_authoritative_loss_evidence'));
}

{
  const result = reconcileHistoricalSalesOutcome({
    id:'lost-with-order', in_pipeline:true, sales_status:'lead',
    current_task_description:'Lost',
    date_order_created:'2025-08-01',
  });
  assert.equal(result.decision, HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW);
  assert.ok(result.reasons.includes('lost_task_conflicts_with_order_created'));
}

for (const task of ['Closed - Did not Lose', 'Closed - Attempted Follow-up/No Response']) {
  const result = reconcileHistoricalSalesOutcome({
    id:task, in_pipeline:true, sales_status:'lead',
    current_task_description:task,
  });
  assert.equal(result.decision, HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW);
  assert.ok(result.reasons.includes('closed_task_has_no_authoritative_outcome'));
}

{
  const result = reconcileHistoricalSalesOutcome({
    id:'bad-date', in_pipeline:true, sales_status:'lead',
    current_task_description:'Completed Sale',
    date_order_created:'2025-02-30',
  });
  assert.equal(result.decision, HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW);
  assert.ok(result.reasons.includes('invalid_order_created_date'));
}

{
  const history = [
    { entity_type:'WorkOrder', field_name:'current_task_description', old_value:'Lost', new_value:'WIP - Installation' },
    { entity_type:'WorkOrder', field_name:'current_task_description', old_value:'Completed Sale', new_value:'SIPs' },
    { entity_type:'WorkOrder', field_name:'current_task_description', old_value:'Follow Up', new_value:'Lost' },
  ];
  const reversals = summarizeTerminalTaskReversals(history);
  assert.equal(reversals.count, 2);
  assert.deepEqual(reversals.by_old_family, { lost:1, completed_sale:1 });
}

{
  const workOrders = [
    { id:'1', in_pipeline:true, sales_status:'lead', current_task_description:'Completed Sale', date_order_created:'2025-01-02' },
    { id:'2', in_pipeline:true, sales_status:'lead', current_task_description:'Completed Sale' },
    { id:'3', in_pipeline:true, sales_status:'lead', current_task_description:'Lost' },
    { id:'4', in_pipeline:true, sales_status:'lead', current_task_description:'Closed - Did not Lose' },
    { id:'5', in_pipeline:true, sales_status:'lead', current_task_description:'Follow up' },
  ];
  const audit = buildHistoricalSalesReconciliationAudit(workOrders);
  assert.equal(audit.summary.conflicts, 4);
  assert.equal(audit.summary.deterministic_won, 1);
  assert.equal(audit.summary.manual_review, 3);
  assert.deepEqual(audit.summary.by_family, { completed_sale:2, lost:1, closed:1 });
}

const conversionSource = fs.readFileSync(
  new URL('../src/components/estimator/workOrderConversion.js', import.meta.url),
  'utf8'
);
assert(/sales_status:\s*["']won["']/.test(conversionSource),
  'Approved Estimate conversion must still mark the WorkOrder won.');
assert(/date_order_created:\s*firstNonBlank\(existing\?\.date_order_created,\s*conversionDate\)/.test(conversionSource),
  'Approved Estimate conversion must still preserve/set Date Order Created alongside won status.');

const vocabularySource = fs.readFileSync(
  new URL('../src/components/admin/smartsheetVocabularyReviewModel.js', import.meta.url),
  'utf8'
);
assert(vocabularySource.includes('A label such as Lost or Completed Sale in Current Task is NOT an authoritative sales outcome.'),
  'Historical reconciliation must preserve the existing rule that terminal task text alone is not authoritative.');

console.log('Historical Sales outcome reconciliation validation: PASS');
