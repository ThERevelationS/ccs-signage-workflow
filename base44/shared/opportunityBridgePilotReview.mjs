import { cleanBridgeValue, sha256Hex } from './opportunityBridgeIntegrity.mjs';

const clean = cleanBridgeValue;

export const OPPORTUNITY_BRIDGE_PILOT_REVIEW = Object.freeze({
  VERSION:'0U-v1',
  EXPLICIT_USER_AUTHORIZATION_REQUIRED:true,
  APPROVAL_BINDS_EXACT_REVIEW_FINGERPRINT:true,
  REVIEW_IS_NOT_EXECUTION_AUTHORIZATION:true,
});

function customerEvidence(planRow = {}, customer = null) {
  return {
    customer_id:clean(planRow?.anchors?.customer_id),
    customer_display_name:clean(customer?.company_name || planRow?.proposed_opportunity?.customer_display_name),
    resolution_source:clean(planRow?.anchors?.customer_resolution_source),
    work_order_customer_id:clean(planRow?.proposed_opportunity?.source_summary?.work_order_customer_id),
    approved_legacy_client_names:Array.isArray(customer?.legacy_client_names)
      ? customer.legacy_client_names.map(clean).filter(Boolean)
      : [],
  };
}

function durableReceiptEvidence(planRow = {}, durableReceipts = []) {
  const key = clean(planRow?.receipt_key);
  const matches = (Array.isArray(durableReceipts) ? durableReceipts : [])
    .filter((row) => clean(row?.operation_key) === key);
  return {
    operation_key:key,
    matching_receipt_count:matches.length,
    matching_receipt_ids:matches.map((row) => clean(row?.id)).filter(Boolean).sort(),
    matching_receipt_statuses:matches.map((row) => clean(row?.status)).filter(Boolean).sort(),
  };
}

function opportunityEvidence(planRow = {}, opportunities = []) {
  const workOrderId = clean(planRow?.work_order_id);
  const key = clean(planRow?.receipt_key);
  const matches = (Array.isArray(opportunities) ? opportunities : [])
    .filter((row) =>
      clean(row?.creation_request_key) === key ||
      clean(row?.compatibility_work_order_id) === workOrderId
    );
  return {
    matching_opportunity_count:matches.length,
    matching_opportunity_ids:matches.map((row) => clean(row?.id)).filter(Boolean).sort(),
    work_order_current_opportunity_id:clean(planRow?.source_snapshot?.opportunity_id),
  };
}

export function buildOpportunityBridgePilotReviewManifest({
  planRow,
  customer = null,
  durableReceipts = [],
  opportunities = [],
  receiptLedgerSummary = null,
} = {}) {
  if (!planRow || typeof planRow !== 'object') {
    throw new Error('Opportunity bridge pilot review requires an exact plan row.');
  }

  return {
    version:OPPORTUNITY_BRIDGE_PILOT_REVIEW.VERSION,
    work_order_id:clean(planRow?.work_order_id),
    receipt_key:clean(planRow?.receipt_key),
    action:clean(planRow?.action),
    sales_scope:clean(planRow?.sales_scope),
    evidence_strength:clean(planRow?.evidence_strength),
    source_snapshot:planRow?.source_snapshot || {},
    proposed_opportunity:planRow?.proposed_opportunity || {},
    customer_evidence:customerEvidence(planRow, customer),
    durable_receipt_evidence:durableReceiptEvidence(planRow, durableReceipts),
    opportunity_evidence:opportunityEvidence(planRow, opportunities),
    ledger_state:{
      total:Number(receiptLedgerSummary?.total || 0),
      anomaly_count:Number(receiptLedgerSummary?.anomaly_count || 0),
      unresolved_count:Number(receiptLedgerSummary?.unresolved_count || 0),
    },
  };
}

export async function fingerprintOpportunityBridgePilotReview(manifest = {}) {
  return sha256Hex(manifest);
}

export async function buildOpportunityBridgePilotReview(input = {}) {
  const manifest = buildOpportunityBridgePilotReviewManifest(input);
  return {
    manifest,
    review_fingerprint:await fingerprintOpportunityBridgePilotReview(manifest),
    explicit_user_authorization_required:OPPORTUNITY_BRIDGE_PILOT_REVIEW.EXPLICIT_USER_AUTHORIZATION_REQUIRED,
    review_is_not_execution_authorization:OPPORTUNITY_BRIDGE_PILOT_REVIEW.REVIEW_IS_NOT_EXECUTION_AUTHORIZATION,
  };
}
