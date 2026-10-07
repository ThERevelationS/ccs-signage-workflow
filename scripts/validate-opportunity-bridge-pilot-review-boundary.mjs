import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPPORTUNITY_BRIDGE_PILOT_REVIEW,
  buildOpportunityBridgePilotReview,
} from '../base44/shared/opportunityBridgePilotReview.mjs';
import { OPPORTUNITY_BRIDGE_PRODUCTION_POLICY } from '../base44/shared/opportunityBridgeProductionReadiness.mjs';

const planRow = {
  work_order_id:'wo-review',
  receipt_key:'workorder:wo-review:opportunity:v1',
  action:'proposed_create',
  sales_scope:'current',
  evidence_strength:'strong_stable_anchor',
  anchors:{
    customer_id:'customer-review',
    customer_resolution_source:'approved_legacy_client_name',
  },
  source_snapshot:{
    id:'wo-review',
    opportunity_id:'',
    sales_status:'lead',
    in_pipeline:true,
    current_task_description:'Follow up',
    date_order_created:'2026-02-27',
    updated_date:'2026-10-07T20:00:00.000Z',
  },
  proposed_opportunity:{
    creation_request_key:'workorder:wo-review:opportunity:v1',
    customer_display_name:'Review Customer',
    compatibility_work_order_id:'wo-review',
    title:'Review Sign',
    stage:'new',
    customer_id:'customer-review',
    source_summary:{
      bridge_source:'workorder',
      work_order_id:'wo-review',
      sales_scope:'current',
      work_order_customer_id:'',
      resolved_customer_source:'approved_legacy_client_name',
    },
  },
};

const customer = {
  id:'customer-review',
  company_name:'Review Customer',
  legacy_client_names:['Review Customer'],
};

const receiptLedgerSummary = { total:0, anomaly_count:0, unresolved_count:0 };
const base = await buildOpportunityBridgePilotReview({
  planRow,
  customer,
  durableReceipts:[],
  opportunities:[],
  receiptLedgerSummary,
});

assert.equal(OPPORTUNITY_BRIDGE_PILOT_REVIEW.VERSION, '0U-v1');
assert.equal(OPPORTUNITY_BRIDGE_PILOT_REVIEW.EXPLICIT_USER_AUTHORIZATION_REQUIRED, true);
assert.equal(OPPORTUNITY_BRIDGE_PILOT_REVIEW.REVIEW_IS_NOT_EXECUTION_AUTHORIZATION, true);
assert.match(base.review_fingerprint, /^[a-f0-9]{64}$/);
assert.equal(base.manifest.work_order_id, 'wo-review');
assert.equal(base.manifest.customer_evidence.customer_id, 'customer-review');
assert.equal(base.manifest.customer_evidence.resolution_source, 'approved_legacy_client_name');
assert.equal(base.manifest.durable_receipt_evidence.matching_receipt_count, 0);
assert.equal(base.manifest.opportunity_evidence.matching_opportunity_count, 0);
assert.equal(base.manifest.ledger_state.anomaly_count, 0);
assert.equal(base.manifest.ledger_state.unresolved_count, 0);

const repeat = await buildOpportunityBridgePilotReview({
  planRow:JSON.parse(JSON.stringify(planRow)),
  customer:JSON.parse(JSON.stringify(customer)),
  durableReceipts:[],
  opportunities:[],
  receiptLedgerSummary:{ ...receiptLedgerSummary },
});
assert.equal(repeat.review_fingerprint, base.review_fingerprint, 'Exact review fingerprint must be deterministic.');

for (const [label, input] of [
  ['source snapshot change', {
    planRow:{ ...planRow, source_snapshot:{ ...planRow.source_snapshot, updated_date:'2026-10-07T20:00:01.000Z' } },
    customer,
    durableReceipts:[],
    opportunities:[],
    receiptLedgerSummary,
  }],
  ['proposal change', {
    planRow:{ ...planRow, proposed_opportunity:{ ...planRow.proposed_opportunity, title:'Changed Review Sign' } },
    customer,
    durableReceipts:[],
    opportunities:[],
    receiptLedgerSummary,
  }],
  ['customer evidence change', {
    planRow,
    customer:{ ...customer, legacy_client_names:['Review Customer','Other Alias'] },
    durableReceipts:[],
    opportunities:[],
    receiptLedgerSummary,
  }],
  ['durable receipt appearance', {
    planRow,
    customer,
    durableReceipts:[{
      id:'receipt-1',
      operation_key:planRow.receipt_key,
      status:'planned',
    }],
    opportunities:[],
    receiptLedgerSummary:{ total:1, anomaly_count:0, unresolved_count:1 },
  }],
  ['opportunity identity appearance', {
    planRow,
    customer,
    durableReceipts:[],
    opportunities:[{
      id:'opp-1',
      creation_request_key:planRow.receipt_key,
      compatibility_work_order_id:planRow.work_order_id,
    }],
    receiptLedgerSummary,
  }],
]) {
  const changed = await buildOpportunityBridgePilotReview(input);
  assert.notEqual(changed.review_fingerprint, base.review_fingerprint, label);
}

assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.VERSION, '0U-v1');
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.EXPLICIT_PILOT_AUTHORIZATION_REQUIRED, true);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT, '');
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED, false);

const endpoint = fs.readFileSync(new URL('../base44/functions/opportunityBridgeProductionApply/entry.ts', import.meta.url), 'utf8');
assert(endpoint.includes('buildOpportunityBridgePilotReview'));
assert(endpoint.includes('source_authorization_matches_fresh_review:sourceAuthorized'));
assert(endpoint.includes('review_response_is_not_execution_authorization:action === "prepare_pilot"'));
assert(endpoint.includes('confirmation_phrase:authorizedPreparation ? binding?.required_phrase || "" : ""'));
assert(endpoint.includes('action === "prepare_authorized_pilot"'));
assert(endpoint.includes('OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT'));
assert(endpoint.includes('requestedReviewFingerprint'));
assert(endpoint.includes('approvedPilotReviewFingerprint:clean(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT)'));

const executor = fs.readFileSync(new URL('../base44/shared/opportunityBridgeProductionExecutor.mjs', import.meta.url), 'utf8');
assert(executor.includes("'requested_review_matches_fresh_candidate'"));
assert(executor.includes("'explicit_user_authorization_source_bound'"));
assert(executor.indexOf("'explicit_user_authorization_source_bound'") < executor.indexOf("'secondary_confirmation_exact'"));

console.log('Opportunity bridge exact pilot review + explicit authorization boundary: PASS');
