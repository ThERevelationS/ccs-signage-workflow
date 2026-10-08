import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPPORTUNITY_BRIDGE_PILOT_VERIFICATION,
  verifyOpportunityBridgePilotOutcome,
} from '../base44/shared/opportunityBridgePilotVerification.mjs';

const reviewFingerprint = 'review-fingerprint-pilot';
const workOrderId = 'wo-pilot';
const operationKey = 'workorder:wo-pilot:opportunity:v1';

const proposal = {
  creation_request_key:operationKey,
  compatibility_work_order_id:workOrderId,
  customer_id:'customer-1',
  customer_display_name:'Pilot Customer',
  title:'Pilot Sign',
  stage:'new',
  salesperson:'Aidin',
  lead_source:'Return Client',
};

const opportunity = {
  ...proposal,
  id:'opp-1',
  created_date:'2026-10-08T19:00:00.000Z',
  updated_date:'2026-10-08T19:00:00.000Z',
};

const workOrder = {
  id:workOrderId,
  opportunity_id:'opp-1',
  updated_date:'2026-10-08T19:00:01.000Z',
};

const receipt = {
  id:'receipt-1',
  schema_version:1,
  operation_key:operationKey,
  run_id:'run-1',
  work_order_id:workOrderId,
  opportunity_id:'opp-1',
  opportunity_creation_request_key:operationKey,
  status:'linked',
  source_snapshot:{
    id:workOrderId,
    opportunity_id:'',
    sales_status:'lead',
    in_pipeline:true,
    current_task_description:'Follow up',
    date_order_created:'2026-02-27',
    updated_date:'2026-10-08T18:59:00.000Z',
  },
  proposal_fingerprint:'f'.repeat(64),
  pilot_review_fingerprint:reviewFingerprint,
  proposal_snapshot:proposal,
  proposal_summary:{ action:'proposed_create', customer_id:'customer-1', stage:'new', title:'Pilot Sign' },
  attempt_count:2,
  actor_user_id:'admin-1',
  actor_email:'admin@example.com',
  secondary_confirmation_fingerprint:'c'.repeat(64),
  started_at:'2026-10-08T19:00:00.000Z',
  last_attempt_at:'2026-10-08T19:00:02.000Z',
  applied_at:'2026-10-08T19:00:02.000Z',
  result_code:'bridge_linked',
  attempt_history:[
    {
      attempt_id:'run-1:wo-pilot:started',
      run_id:'run-1',
      at:'2026-10-08T19:00:00.000Z',
      status:'started',
      result_code:'pilot_execution_started',
      opportunity_id:'',
      source_snapshot_fingerprint:'s'.repeat(64),
      note:'started',
    },
    {
      attempt_id:'run-1:wo-pilot:result',
      run_id:'run-1',
      at:'2026-10-08T19:00:02.000Z',
      status:'linked',
      result_code:'bridge_linked',
      opportunity_id:'opp-1',
      source_snapshot_fingerprint:'s'.repeat(64),
      note:'linked',
    },
  ],
};

assert.equal(OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.VERSION, '0U-v1');
assert.equal(OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.READ_ONLY, true);

{
  const result = verifyOpportunityBridgePilotOutcome({
    workOrderId,
    expectedReviewFingerprint:reviewFingerprint,
    workOrder:{ id:workOrderId, opportunity_id:'' },
    opportunities:[],
    receipts:[],
  });
  assert.equal(result.outcome, 'not_started');
  assert.equal(result.verified, false);
}

{
  const result = verifyOpportunityBridgePilotOutcome({
    workOrderId,
    expectedReviewFingerprint:reviewFingerprint,
    workOrder,
    opportunities:[opportunity],
    receipts:[receipt],
  });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.verified, true);
  assert(result.checks.every((item) => item.pass));
}

for (const [label, mutate] of [
  ['wrong review fingerprint', ({ receipt:row }) => ({ receipt:{ ...row, pilot_review_fingerprint:'different-review' } })],
  ['duplicate receipt', ({ receipt:row }) => ({ receipts:[row, { ...row, id:'receipt-2' }] })],
  ['duplicate opportunity', ({ opportunity:row }) => ({ opportunities:[row, { ...row, id:'opp-2' }] })],
  ['broken WorkOrder link', ({ workOrder:row }) => ({ workOrder:{ ...row, opportunity_id:'opp-other' } })],
  ['proposal drift', ({ opportunity:row }) => ({ opportunity:{ ...row, title:'Changed after pilot' } })],
  ['nonterminal receipt', ({ receipt:row }) => ({ receipt:{ ...row, status:'held', applied_at:'' } })],
  ['receipt Opportunity mismatch', ({ receipt:row }) => ({ receipt:{ ...row, opportunity_id:'opp-other' } })],
  ['attempt history mismatch', ({ receipt:row }) => ({ receipt:{ ...row, attempt_count:3 } })],
  ['missing terminal attempt', ({ receipt:row }) => ({
    receipt:{ ...row, attempt_count:1, attempt_history:[row.attempt_history[0]] },
  })],
]) {
  const base = {
    workOrder:{ ...workOrder },
    opportunity:{ ...opportunity },
    receipt:JSON.parse(JSON.stringify(receipt)),
  };
  const change = mutate(base) || {};
  const result = verifyOpportunityBridgePilotOutcome({
    workOrderId,
    expectedReviewFingerprint:reviewFingerprint,
    workOrder:change.workOrder || base.workOrder,
    opportunities:change.opportunities || [change.opportunity || base.opportunity],
    receipts:change.receipts || [change.receipt || base.receipt],
  });
  assert.equal(result.verified, false, label);
  assert.equal(result.outcome, 'held', label);
  assert(result.checks.some((item) => !item.pass), label);
}

{
  const result = verifyOpportunityBridgePilotOutcome({
    workOrderId,
    expectedReviewFingerprint:'',
    workOrder,
    opportunities:[opportunity],
    receipts:[receipt],
  });
  assert.equal(result.outcome, 'held');
  assert.equal(result.verified, false);
  assert.equal(result.checks[0].key, 'verification_input_complete');
}

const endpoint = fs.readFileSync(new URL('../base44/functions/opportunityBridgePilotVerification/entry.ts', import.meta.url), 'utf8');
assert(endpoint.includes('actor.role !== "admin"'), 'Verification endpoint must remain admin-only.');
assert(endpoint.includes('read_only:true'), 'Verification endpoint must explicitly report read-only mode.');
assert(endpoint.includes('write_capability:false'), 'Verification endpoint must explicitly report no write capability.');
assert(endpoint.includes('verifyOpportunityBridgePilotOutcome'), 'Verification endpoint must use the shared independent verifier.');
assert(endpoint.includes('OpportunityBridgeOperationReceipt'), 'Verification endpoint must read durable receipts.');
assert(endpoint.includes('creation_request_key:operationKey'), 'Verification endpoint must read Opportunity by permanent receipt identity.');
assert(endpoint.includes('compatibility_work_order_id:workOrderId'), 'Verification endpoint must read Opportunity by WorkOrder compatibility identity.');
assert(!endpoint.includes('executeOpportunityBridgePlanRow'), 'Verification endpoint must not execute the apply engine.');
assert(!endpoint.includes('executeGuardedOpportunityBridgePilot'), 'Verification endpoint must not execute the production executor.');

for (const forbidden of [
  /\.create\s*\(/,
  /\.update\s*\(/,
  /\.updateMany\s*\(/,
  /\.delete\s*\(/,
  /\.deleteMany\s*\(/,
  /\.bulkCreate\s*\(/,
]) {
  assert(!forbidden.test(endpoint), `Verification endpoint contains forbidden write call: ${forbidden}`);
}

const schema = JSON.parse(fs.readFileSync(new URL('../base44/entities/OpportunityBridgeOperationReceipt.jsonc', import.meta.url), 'utf8'));
assert(schema.required.includes('pilot_review_fingerprint'));
assert(schema.required.includes('proposal_snapshot'));
assert.equal(schema.properties.pilot_review_fingerprint.type, 'string');
assert.equal(schema.properties.proposal_snapshot.type, 'object');

console.log('Opportunity bridge post-pilot read-only verification contract: PASS');
