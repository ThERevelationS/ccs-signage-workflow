import { opportunityBridgeReceiptKey } from './opportunityBridgeExecutionPlan.mjs';
import { cleanBridgeValue, sha256Hex, stableCanonicalJson } from './opportunityBridgeIntegrity.mjs';

export const OPPORTUNITY_BRIDGE_RECEIPT_PERSISTENCE = Object.freeze({
  VERSION: '0S-v1',
  SCHEMA_NAME: 'OpportunityBridgeOperationReceipt',
  ACTIVE: true,
  PRODUCTION_APPLY_WIRED: false,
});

const VALID_STATUSES = new Set([
  'planned',
  'started',
  'opportunity_ready',
  'linked',
  'already_linked',
  'held',
  'failed',
  'cancelled',
]);

const clean = cleanBridgeValue;

function requireAdapter(adapter = {}) {
  for (const method of ['findByOperationKey', 'createReceipt', 'updateReceiptIfCurrent']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new Error(`Opportunity bridge receipt adapter requires ${method}().`);
    }
  }
  return adapter;
}

export function validateOpportunityBridgeReceiptIdentity(receipt = {}) {
  const operationKey = clean(receipt?.operation_key);
  const workOrderId = clean(receipt?.work_order_id);
  const creationKey = clean(receipt?.opportunity_creation_request_key);
  const expectedKey = opportunityBridgeReceiptKey(workOrderId);
  const errors = [];
  if (!operationKey) errors.push('missing_operation_key');
  if (!workOrderId) errors.push('missing_work_order_id');
  if (!expectedKey || operationKey !== expectedKey) errors.push('operation_key_mismatch');
  if (!creationKey || creationKey !== operationKey) errors.push('opportunity_creation_request_key_mismatch');
  if (!clean(receipt?.proposal_fingerprint)) errors.push('missing_proposal_fingerprint');
  if (!clean(receipt?.pilot_review_fingerprint)) errors.push('missing_pilot_review_fingerprint');
  if (!receipt?.proposal_snapshot || typeof receipt.proposal_snapshot !== 'object' || Array.isArray(receipt.proposal_snapshot)) errors.push('missing_proposal_snapshot');
  if (!VALID_STATUSES.has(clean(receipt?.status))) errors.push('invalid_status');
  return errors;
}

export function summarizeOpportunityBridgeReceiptLedger(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const keyCounts = new Map();
  let invalidIdentityCount = 0;
  let unresolvedCount = 0;

  for (const row of list) {
    const key = clean(row?.operation_key);
    if (key) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    if (validateOpportunityBridgeReceiptIdentity(row).length) invalidIdentityCount += 1;
    if (['planned','started','opportunity_ready','held','failed'].includes(clean(row?.status))) {
      unresolvedCount += 1;
    }
  }

  const duplicateOperationKeys = [...keyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([operation_key, count]) => ({ operation_key, count }));

  return {
    total:list.length,
    duplicate_operation_keys:duplicateOperationKeys,
    duplicate_operation_key_count:duplicateOperationKeys.length,
    invalid_identity_count:invalidIdentityCount,
    unresolved_count:unresolvedCount,
    anomaly_count:duplicateOperationKeys.length + invalidIdentityCount,
  };
}

function proposalSummary(planRow = {}) {
  const proposal = planRow?.proposed_opportunity || {};
  return {
    action:clean(planRow?.action),
    sales_scope:clean(planRow?.sales_scope),
    evidence_strength:clean(planRow?.evidence_strength),
    customer_id:clean(planRow?.anchors?.customer_id || proposal?.customer_id),
    stage:clean(proposal?.stage),
    title:clean(proposal?.title),
  };
}

export async function fingerprintOpportunityBridgePlanRow(planRow = {}) {
  return {
    proposal_fingerprint: await sha256Hex(planRow?.proposed_opportunity || {}),
    source_snapshot_fingerprint: await sha256Hex(planRow?.source_snapshot || {}),
  };
}

function sameReceiptProposal(receipt, fingerprints) {
  return clean(receipt?.proposal_fingerprint) === fingerprints.proposal_fingerprint;
}

function sameReceiptPlan(receipt, planRow, fingerprints) {
  return sameReceiptProposal(receipt, fingerprints) &&
    stableCanonicalJson(receipt?.source_snapshot || {}) === stableCanonicalJson(planRow?.source_snapshot || {});
}

function terminalReceiptStatus(receipt = {}) {
  return ['linked','already_linked'].includes(clean(receipt?.status));
}

function duplicateAttempt(receipt, attemptId) {
  return (Array.isArray(receipt?.attempt_history) ? receipt.attempt_history : [])
    .find((attempt) => clean(attempt?.attempt_id) === attemptId);
}

export async function claimOpportunityBridgeReceipt({
  adapter,
  planRow,
  runId,
  actor = {},
  secondaryConfirmationFingerprint = '',
  pilotReviewFingerprint = '',
} = {}) {
  const store = requireAdapter(adapter);
  const workOrderId = clean(planRow?.work_order_id);
  const operationKey = opportunityBridgeReceiptKey(workOrderId);
  const plannedKey = clean(planRow?.receipt_key);
  const rolloutRunId = clean(runId);
  const actorUserId = clean(actor?.id);
  const actorEmail = clean(actor?.email);
  const exactPilotReviewFingerprint = clean(pilotReviewFingerprint);

  if (!workOrderId || !operationKey || plannedKey !== operationKey) {
    return { ok:false, state:'held', reason:'invalid_plan_receipt_identity' };
  }
  if (!rolloutRunId) return { ok:false, state:'held', reason:'missing_run_id' };
  if (!exactPilotReviewFingerprint) return { ok:false, state:'held', reason:'missing_pilot_review_fingerprint' };

  const fingerprints = await fingerprintOpportunityBridgePlanRow(planRow);
  const before = await store.findByOperationKey(operationKey);
  if (!Array.isArray(before)) throw new Error('Opportunity bridge receipt lookup did not return a record list.');
  if (before.length > 1) {
    return { ok:false, state:'held', reason:'duplicate_receipt_identity', matching_ids:before.map((row) => clean(row?.id)).filter(Boolean) };
  }

  if (before.length === 1) {
    const existing = before[0];
    const identityErrors = validateOpportunityBridgeReceiptIdentity(existing);
    if (identityErrors.length) return { ok:false, state:'held', reason:'receipt_identity_invalid', identity_errors:identityErrors, receipt:existing };
    if (clean(existing?.pilot_review_fingerprint) !== exactPilotReviewFingerprint) {
      return { ok:false, state:'held', reason:'receipt_review_fingerprint_mismatch', receipt:existing };
    }
    if (terminalReceiptStatus(existing) && sameReceiptProposal(existing, fingerprints)) {
      return { ok:true, state:'terminal_existing', ownership:false, receipt:existing, fingerprints };
    }
    if (!sameReceiptPlan(existing, planRow, fingerprints)) {
      return { ok:false, state:'held', reason:'receipt_plan_mismatch', receipt:existing };
    }
    return { ok:true, state:'existing', ownership:false, receipt:existing, fingerprints };
  }

  const payload = {
    schema_version:1,
    operation_key:operationKey,
    run_id:rolloutRunId,
    work_order_id:workOrderId,
    opportunity_creation_request_key:operationKey,
    status:'planned',
    source_snapshot:planRow?.source_snapshot || {},
    proposal_fingerprint:fingerprints.proposal_fingerprint,
    pilot_review_fingerprint:exactPilotReviewFingerprint,
    proposal_snapshot:planRow?.proposed_opportunity || {},
    proposal_summary:proposalSummary(planRow),
    attempt_count:0,
    actor_user_id:actorUserId,
    actor_email:actorEmail,
    secondary_confirmation_fingerprint:clean(secondaryConfirmationFingerprint),
    attempt_history:[],
  };

  let createError = null;
  try {
    await store.createReceipt(payload);
  } catch (error) {
    createError = error;
  }

  const after = await store.findByOperationKey(operationKey);
  if (!Array.isArray(after)) throw new Error('Opportunity bridge receipt recovery lookup did not return a record list.');
  if (after.length !== 1) {
    return {
      ok:false,
      state:'held',
      reason:after.length > 1 ? 'duplicate_receipt_identity' : 'receipt_create_outcome_unverifiable',
      matching_ids:after.map((row) => clean(row?.id)).filter(Boolean),
      error_message:clean(createError?.message),
    };
  }

  const receipt = after[0];
  const identityErrors = validateOpportunityBridgeReceiptIdentity(receipt);
  if (identityErrors.length) return { ok:false, state:'held', reason:'receipt_identity_invalid', identity_errors:identityErrors, receipt };
  if (clean(receipt?.pilot_review_fingerprint) !== exactPilotReviewFingerprint) {
    return { ok:false, state:'held', reason:'receipt_review_fingerprint_mismatch', receipt };
  }
  if (!sameReceiptPlan(receipt, planRow, fingerprints)) return { ok:false, state:'held', reason:'receipt_plan_mismatch', receipt };

  return {
    ok:true,
    state:createError ? 'created_recovered_after_error' : 'created_verified',
    ownership:true,
    receipt,
    fingerprints,
  };
}

function attemptPatch(receipt, attempt = {}, now) {
  const status = clean(attempt?.status);
  if (!VALID_STATUSES.has(status)) throw new Error('Opportunity bridge receipt attempt has an invalid status.');
  const at = clean(attempt?.at) || now;
  const attemptId = clean(attempt?.attempt_id);
  const runId = clean(attempt?.run_id);
  if (!attemptId || !runId) throw new Error('Opportunity bridge receipt attempt requires attempt_id and run_id.');

  const historyEntry = {
    attempt_id:attemptId,
    run_id:runId,
    at,
    status,
    result_code:clean(attempt?.result_code),
    opportunity_id:clean(attempt?.opportunity_id),
    source_snapshot_fingerprint:clean(attempt?.source_snapshot_fingerprint),
    note:clean(attempt?.note),
  };

  const history = [...(Array.isArray(receipt?.attempt_history) ? receipt.attempt_history : []), historyEntry];
  const patch = {
    run_id:runId,
    status,
    attempt_count:Number(receipt?.attempt_count || 0) + 1,
    actor_user_id:clean(attempt?.actor_user_id || receipt?.actor_user_id),
    actor_email:clean(attempt?.actor_email || receipt?.actor_email),
    secondary_confirmation_fingerprint:clean(attempt?.secondary_confirmation_fingerprint || receipt?.secondary_confirmation_fingerprint),
    last_attempt_at:at,
    result_code:clean(attempt?.result_code),
    result_summary:attempt?.result_summary || {},
    error_message:clean(attempt?.error_message),
    attempt_history:history,
  };
  if (status === 'started') patch.started_at = at;
  if (status === 'linked' || status === 'already_linked') patch.applied_at = at;
  if (status === 'held') patch.held_at = at;
  if (status === 'failed') patch.failed_at = at;
  if (clean(attempt?.opportunity_id)) patch.opportunity_id = clean(attempt.opportunity_id);
  return { patch, historyEntry };
}

export async function appendOpportunityBridgeReceiptAttempt({
  adapter,
  operationKey,
  expectedUpdatedDate,
  attempt,
  now = new Date().toISOString(),
} = {}) {
  const store = requireAdapter(adapter);
  const key = clean(operationKey);
  const expected = clean(expectedUpdatedDate);
  if (!key || !expected) return { ok:false, state:'held', reason:'receipt_version_required' };

  const rows = await store.findByOperationKey(key);
  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok:false, state:'held', reason:rows?.length > 1 ? 'duplicate_receipt_identity' : 'receipt_missing' };
  }
  const current = rows[0];
  const identityErrors = validateOpportunityBridgeReceiptIdentity(current);
  if (identityErrors.length) return { ok:false, state:'held', reason:'receipt_identity_invalid', identity_errors:identityErrors, receipt:current };
  if (clean(current?.updated_date) !== expected) return { ok:false, state:'conflict', reason:'receipt_changed', receipt:current };

  const attemptId = clean(attempt?.attempt_id);
  const prior = duplicateAttempt(current, attemptId);
  if (prior) {
    if (stableCanonicalJson(prior) === stableCanonicalJson({
      attempt_id:attemptId,
      run_id:clean(attempt?.run_id),
      at:clean(attempt?.at) || now,
      status:clean(attempt?.status),
      result_code:clean(attempt?.result_code),
      opportunity_id:clean(attempt?.opportunity_id),
      source_snapshot_fingerprint:clean(attempt?.source_snapshot_fingerprint),
      note:clean(attempt?.note),
    })) {
      return { ok:true, state:'attempt_already_recorded', receipt:current };
    }
    return { ok:false, state:'conflict', reason:'attempt_id_conflict', receipt:current };
  }

  const { patch, historyEntry } = attemptPatch(current, attempt, now);
  let updateError = null;
  let updated = null;
  try {
    updated = await store.updateReceiptIfCurrent({
      id:clean(current.id),
      expectedUpdatedDate:expected,
      patch,
    });
  } catch (error) {
    updateError = error;
  }

  const after = await store.findByOperationKey(key);
  if (!Array.isArray(after) || after.length !== 1) {
    return { ok:false, state:'held', reason:after?.length > 1 ? 'duplicate_receipt_identity' : 'receipt_update_outcome_unverifiable' };
  }
  const recovered = after[0];
  const persisted = duplicateAttempt(recovered, historyEntry.attempt_id);
  if (persisted && stableCanonicalJson(persisted) === stableCanonicalJson(historyEntry)) {
    return {
      ok:true,
      state:updateError || !updated ? 'attempt_recovered_after_error' : 'attempt_recorded',
      receipt:recovered,
    };
  }
  if (updateError) {
    return { ok:false, state:'held', reason:'receipt_update_outcome_unverifiable', error_message:clean(updateError?.message), receipt:recovered };
  }
  return { ok:false, state:'conflict', reason:'receipt_changed', receipt:recovered };
}

export function createBase44OpportunityBridgeReceiptAdapter(entity) {
  if (!entity) throw new Error('Opportunity bridge receipt entity is required.');
  return {
    findByOperationKey(operationKey) {
      return entity.filter({ operation_key:clean(operationKey) }, '-created_date', 10);
    },
    createReceipt(payload) {
      return entity.create(payload);
    },
    async updateReceiptIfCurrent({ id, expectedUpdatedDate, patch }) {
      const result = await entity.updateMany(
        { id:clean(id), updated_date:clean(expectedUpdatedDate) },
        { $set:patch },
      );
      if (!result || result.updated !== 1) return null;
      return entity.get(clean(id));
    },
  };
}
