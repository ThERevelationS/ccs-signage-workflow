import { opportunityBridgeReceiptKey } from './opportunityBridgeExecutionPlan.mjs';
import { opportunityMatchesBridgeProposal } from './opportunityBridgeApplyEngine.mjs';
import { validateOpportunityBridgeReceiptIdentity } from './opportunityBridgeReceiptPersistence.mjs';

const clean = (value) => String(value ?? '').trim();

export const OPPORTUNITY_BRIDGE_PILOT_VERIFICATION = Object.freeze({
  VERSION:'0U-v1',
  TERMINAL_STATUSES:['linked','already_linked'],
  OUTCOME_VERIFIED:'verified',
  OUTCOME_NOT_STARTED:'not_started',
  OUTCOME_HELD:'held',
  READ_ONLY:true,
});

function check(key, pass, detail) {
  return { key, pass:pass === true, detail };
}

function matchingOpportunities(opportunities, workOrderId, operationKey) {
  return (Array.isArray(opportunities) ? opportunities : []).filter((row) =>
    clean(row?.creation_request_key) === operationKey ||
    clean(row?.compatibility_work_order_id) === workOrderId
  );
}

function matchingReceipts(receipts, operationKey) {
  return (Array.isArray(receipts) ? receipts : [])
    .filter((row) => clean(row?.operation_key) === operationKey);
}

function terminalAttemptChecks(receipt = {}, opportunityId = '') {
  const history = Array.isArray(receipt?.attempt_history) ? receipt.attempt_history : [];
  const last = history.at(-1) || null;
  return {
    history,
    last,
    has_started:history.some((item) => clean(item?.status) === 'started'),
    count_matches:Number(receipt?.attempt_count || 0) === history.length,
    terminal_matches:Boolean(last) &&
      clean(last?.status) === clean(receipt?.status) &&
      clean(last?.opportunity_id) === opportunityId,
  };
}

export function verifyOpportunityBridgePilotOutcome({
  workOrderId,
  expectedReviewFingerprint,
  workOrder = null,
  opportunities,
  receipts,
} = {}) {
  const id = clean(workOrderId);
  const expectedReview = clean(expectedReviewFingerprint);
  const operationKey = opportunityBridgeReceiptKey(id);
  const receiptMatches = matchingReceipts(receipts, operationKey);
  const opportunityMatches = matchingOpportunities(opportunities, id, operationKey);
  const linkedOpportunityId = clean(workOrder?.opportunity_id);

  if (!id || !operationKey || !expectedReview) {
    return {
      version:OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.VERSION,
      outcome:OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.OUTCOME_HELD,
      verified:false,
      checks:[check('verification_input_complete', false, 'WorkOrder id and exact review fingerprint are required.')],
      operation_key:operationKey || '',
    };
  }

  if (
    receiptMatches.length === 0 &&
    opportunityMatches.length === 0 &&
    !linkedOpportunityId
  ) {
    return {
      version:OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.VERSION,
      outcome:OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.OUTCOME_NOT_STARTED,
      verified:false,
      checks:[
        check('work_order_exists', Boolean(workOrder?.id), workOrder?.id ? 'WorkOrder exists.' : 'WorkOrder missing.'),
        check('receipt_absent', true, 'No durable bridge receipt exists for this operation key.'),
        check('opportunity_absent', true, 'No matching Opportunity exists for this operation key.'),
        check('work_order_unlinked', true, 'WorkOrder has no Opportunity link.'),
      ],
      operation_key:operationKey,
      work_order_id:id,
      expected_review_fingerprint:expectedReview,
      receipt_count:0,
      opportunity_count:0,
    };
  }

  const receipt = receiptMatches.length === 1 ? receiptMatches[0] : null;
  const opportunity = opportunityMatches.length === 1 ? opportunityMatches[0] : null;
  const opportunityId = clean(opportunity?.id);
  const receiptIdentityErrors = receipt ? validateOpportunityBridgeReceiptIdentity(receipt) : [];
  const terminalStatus = OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.TERMINAL_STATUSES.includes(clean(receipt?.status));
  const attempts = terminalAttemptChecks(receipt || {}, opportunityId);

  const checks = [
    check(
      'work_order_exists',
      Boolean(workOrder?.id) && clean(workOrder?.id) === id,
      workOrder?.id ? 'Exact WorkOrder exists.' : 'WorkOrder is missing.'
    ),
    check(
      'exactly_one_durable_receipt',
      receiptMatches.length === 1,
      `${receiptMatches.length} durable receipts found for ${operationKey}.`
    ),
    check(
      'receipt_identity_valid',
      Boolean(receipt) && receiptIdentityErrors.length === 0,
      receipt
        ? (receiptIdentityErrors.length ? `Receipt identity errors: ${receiptIdentityErrors.join(', ')}.` : 'Durable receipt identity is valid.')
        : 'No single durable receipt available.'
    ),
    check(
      'review_fingerprint_exact',
      Boolean(receipt) && clean(receipt?.pilot_review_fingerprint) === expectedReview,
      receipt
        ? `Stored review fingerprint ${clean(receipt?.pilot_review_fingerprint) || 'missing'}.`
        : 'No single durable receipt available.'
    ),
    check(
      'receipt_terminal',
      Boolean(receipt) && terminalStatus,
      receipt ? `Receipt status ${clean(receipt?.status) || 'missing'}.` : 'No single durable receipt available.'
    ),
    check(
      'exactly_one_matching_opportunity',
      opportunityMatches.length === 1,
      `${opportunityMatches.length} Opportunities match the permanent bridge identity.`
    ),
    check(
      'opportunity_identity_exact',
      Boolean(opportunity) &&
        clean(opportunity?.creation_request_key) === operationKey &&
        clean(opportunity?.compatibility_work_order_id) === id,
      opportunity ? 'Opportunity permanent bridge identity is exact.' : 'No single matching Opportunity available.'
    ),
    check(
      'opportunity_matches_frozen_proposal',
      Boolean(opportunity) &&
        Boolean(receipt?.proposal_snapshot) &&
        opportunityMatchesBridgeProposal(opportunity, receipt.proposal_snapshot),
      opportunity && receipt?.proposal_snapshot
        ? 'Live Opportunity matches the exact frozen approved proposal payload.'
        : 'Opportunity or frozen proposal snapshot unavailable.'
    ),
    check(
      'work_order_link_exact',
      Boolean(opportunityId) && linkedOpportunityId === opportunityId,
      `WorkOrder opportunity_id ${linkedOpportunityId || 'blank'}; expected ${opportunityId || 'none'}.`
    ),
    check(
      'receipt_opportunity_exact',
      Boolean(opportunityId) && clean(receipt?.opportunity_id) === opportunityId,
      receipt ? `Receipt opportunity_id ${clean(receipt?.opportunity_id) || 'blank'}.` : 'No single durable receipt available.'
    ),
    check(
      'receipt_attempt_history_consistent',
      Boolean(receipt) &&
        attempts.has_started &&
        attempts.count_matches &&
        attempts.terminal_matches,
      receipt
        ? `attempt_count ${Number(receipt?.attempt_count || 0)}; history ${attempts.history.length}; last status ${clean(attempts.last?.status) || 'none'}.`
        : 'No single durable receipt available.'
    ),
    check(
      'receipt_applied_timestamp_present',
      Boolean(receipt) && Boolean(clean(receipt?.applied_at)),
      receipt ? `applied_at ${clean(receipt?.applied_at) || 'missing'}.` : 'No single durable receipt available.'
    ),
  ];

  const verified = checks.every((item) => item.pass);
  return {
    version:OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.VERSION,
    outcome:verified
      ? OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.OUTCOME_VERIFIED
      : OPPORTUNITY_BRIDGE_PILOT_VERIFICATION.OUTCOME_HELD,
    verified,
    operation_key:operationKey,
    work_order_id:id,
    expected_review_fingerprint:expectedReview,
    receipt_count:receiptMatches.length,
    opportunity_count:opportunityMatches.length,
    receipt_id:clean(receipt?.id),
    receipt_status:clean(receipt?.status),
    opportunity_id:opportunityId,
    work_order_opportunity_id:linkedOpportunityId,
    checks,
  };
}
