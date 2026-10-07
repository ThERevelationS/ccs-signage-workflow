import { executeOpportunityBridgePlanRow, OPPORTUNITY_BRIDGE_APPLY_STATUS } from './opportunityBridgeApplyEngine.mjs';
import { selectOpportunityBridgeFirstBatch } from './opportunityBridgeProductionReadiness.mjs';
import {
  appendOpportunityBridgeReceiptAttempt,
  claimOpportunityBridgeReceipt,
} from './opportunityBridgeReceiptPersistence.mjs';
import {
  OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION,
  verifyOpportunityBridgeSecondaryConfirmation,
} from './opportunityBridgeSecondaryConfirmation.mjs';

const clean = (value) => String(value ?? '').trim();

export const OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR = Object.freeze({
  VERSION:'0T-v1',
  PILOT_BATCH_SIZE:1,
  REQUIRE_EXACT_FIRST_BATCH:true,
  REQUIRE_CLEAN_RECEIPT_LEDGER:true,
  STOP_ON_FIRST_NON_SUCCESS:true,
  PRODUCTION_APPLY_WIRED:true,
});

function check(key, pass, detail) {
  return { key, pass:pass === true, detail };
}

function planAgeMs(planGeneratedAt, now) {
  const generated = Date.parse(clean(planGeneratedAt));
  const current = Date.parse(clean(now));
  if (!Number.isFinite(generated) || !Number.isFinite(current)) return Number.POSITIVE_INFINITY;
  return Math.max(0, current - generated);
}

export async function evaluateOpportunityBridgePilotAuthorization({
  plan = {},
  planGeneratedAt = '',
  now = new Date().toISOString(),
  requestedWorkOrderId = '',
  actor = {},
  confirmationBinding = null,
  confirmationPhrase = '',
  receiptLedgerSummary = null,
  applyEnabled = false,
} = {}) {
  const firstBatch = selectOpportunityBridgeFirstBatch(plan?.rows || []);
  const expected = firstBatch[0] || null;
  const requested = clean(requestedWorkOrderId);
  const ageMs = planAgeMs(planGeneratedAt, now);
  const receiptSummary = receiptLedgerSummary || {};
  const actorIsAdmin = clean(actor?.role).toLowerCase() === 'admin' && clean(actor?.id) && clean(actor?.email);
  const exactCandidate = Boolean(
    expected &&
    requested &&
    clean(expected?.work_order_id) === requested &&
    firstBatch.length === OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.PILOT_BATCH_SIZE
  );

  let confirmation = { ok:false, reason:'confirmation_not_checked' };
  if (exactCandidate && actorIsAdmin && confirmationBinding) {
    confirmation = await verifyOpportunityBridgeSecondaryConfirmation({
      binding:confirmationBinding,
      providedPhrase:confirmationPhrase,
      actor,
      batchRows:[expected],
      now,
    });
  }

  const checks = [
    check(
      'production_apply_enabled',
      applyEnabled === true,
      applyEnabled ? 'Production apply kill switch is enabled.' : 'Production apply kill switch is hard-disabled.'
    ),
    check(
      'exact_single_record_pilot',
      firstBatch.length === OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.PILOT_BATCH_SIZE,
      `${firstBatch.length}/${OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.PILOT_BATCH_SIZE} exact pilot candidates selected.`
    ),
    check(
      'requested_record_is_current_first_batch',
      exactCandidate,
      expected
        ? `Requested ${requested || 'none'}; current first pilot candidate is ${clean(expected.work_order_id)}.`
        : 'No current first pilot candidate is available.'
    ),
    check(
      'fresh_plan',
      ageMs <= OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.MAX_AGE_MS,
      Number.isFinite(ageMs) ? `Plan age ${Math.round(ageMs / 1000)}s.` : 'Plan timestamp unavailable.'
    ),
    check(
      'admin_actor',
      Boolean(actorIsAdmin),
      actorIsAdmin ? 'Exact authenticated admin actor is present.' : 'Authenticated admin actor is required.'
    ),
    check(
      'durable_receipt_ledger_clean',
      receiptLedgerSummary != null && Number(receiptSummary?.anomaly_count || 0) === 0,
      receiptLedgerSummary == null
        ? 'Durable receipt ledger summary unavailable.'
        : `${Number(receiptSummary?.anomaly_count || 0)} durable receipt identity anomalies; ${Number(receiptSummary?.unresolved_count || 0)} unresolved receipts.`
    ),
    check(
      'secondary_confirmation_exact',
      confirmation?.ok === true,
      confirmation?.ok === true
        ? 'Secondary confirmation matches the exact actor, rollout run, fresh plan and one-record batch.'
        : `Secondary confirmation blocked: ${clean(confirmation?.reason) || 'not_verified'}.`
    ),
  ];

  const authorized = checks.every((item) => item.pass);
  return {
    version:OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.VERSION,
    authorized,
    decision:authorized ? 'AUTHORIZED' : 'LOCKED',
    checks,
    requested_work_order_id:requested,
    candidate:expected ? {
      work_order_id:clean(expected?.work_order_id),
      receipt_key:clean(expected?.receipt_key),
      action:clean(expected?.action),
      sales_scope:clean(expected?.sales_scope),
      evidence_strength:clean(expected?.evidence_strength),
      customer_id:clean(expected?.anchors?.customer_id),
    } : null,
    confirmation: {
      ok:confirmation?.ok === true,
      reason:clean(confirmation?.reason),
      confirmation_fingerprint:clean(confirmation?.confirmation_fingerprint),
      run_id:clean(confirmation?.run_id),
      batch_fingerprint:clean(confirmation?.batch_fingerprint),
    },
    plan_age_ms:Number.isFinite(ageMs) ? ageMs : null,
    apply_enabled:applyEnabled === true,
  };
}

function receiptAttemptId(runId, workOrderId, phase) {
  return `${clean(runId)}:${clean(workOrderId)}:${clean(phase)}`;
}

async function appendAttempt({
  receiptAdapter,
  receipt,
  runId,
  actor,
  confirmationFingerprint,
  sourceSnapshotFingerprint,
  phase,
  status,
  resultCode,
  opportunityId = '',
  resultSummary = {},
  errorMessage = '',
  note = '',
  now,
}) {
  return appendOpportunityBridgeReceiptAttempt({
    adapter:receiptAdapter,
    operationKey:clean(receipt?.operation_key),
    expectedUpdatedDate:clean(receipt?.updated_date),
    now,
    attempt:{
      attempt_id:receiptAttemptId(runId, receipt?.work_order_id, phase),
      run_id:runId,
      at:now,
      status,
      result_code:resultCode,
      opportunity_id:opportunityId,
      source_snapshot_fingerprint:sourceSnapshotFingerprint,
      actor_user_id:clean(actor?.id),
      actor_email:clean(actor?.email),
      secondary_confirmation_fingerprint:confirmationFingerprint,
      result_summary:resultSummary,
      error_message:errorMessage,
      note,
    },
  });
}

export async function executeGuardedOpportunityBridgePilot({
  plan = {},
  planGeneratedAt = '',
  requestedWorkOrderId = '',
  actor = {},
  confirmationBinding = null,
  confirmationPhrase = '',
  receiptLedgerSummary = null,
  applyEnabled = false,
  applyAdapter,
  receiptAdapter,
  now = new Date().toISOString(),
} = {}) {
  const authorization = await evaluateOpportunityBridgePilotAuthorization({
    plan,
    planGeneratedAt,
    now,
    requestedWorkOrderId,
    actor,
    confirmationBinding,
    confirmationPhrase,
    receiptLedgerSummary,
    applyEnabled,
  });

  if (!authorization.authorized) {
    return {
      success:false,
      status:'locked',
      write_attempted:false,
      authorization,
      result:null,
    };
  }

  const planRow = (plan?.rows || []).find((row) => clean(row?.work_order_id) === clean(requestedWorkOrderId));
  if (!planRow) {
    return {
      success:false,
      status:'locked',
      write_attempted:false,
      authorization:{ ...authorization, authorized:false, decision:'LOCKED' },
      result:null,
    };
  }

  const runId = clean(confirmationBinding?.run_id);
  const confirmationFingerprint = clean(authorization?.confirmation?.confirmation_fingerprint);
  const claim = await claimOpportunityBridgeReceipt({
    adapter:receiptAdapter,
    planRow,
    runId,
    actor,
    secondaryConfirmationFingerprint:confirmationFingerprint,
  });
  if (!claim?.ok || !claim?.receipt?.id) {
    return {
      success:false,
      status:'held',
      write_attempted:true,
      authorization,
      receipt_claim:claim,
      result:null,
    };
  }

  if (claim.state === 'terminal_existing') {
    const verified = await executeOpportunityBridgePlanRow({ planRow, adapter:applyAdapter });
    const converged = [OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED, OPPORTUNITY_BRIDGE_APPLY_STATUS.ALREADY_LINKED]
      .includes(verified?.status);
    return {
      success:converged,
      status:converged ? OPPORTUNITY_BRIDGE_APPLY_STATUS.ALREADY_LINKED : 'held',
      write_attempted:false,
      authorization,
      receipt_claim:claim,
      receipt_started:null,
      receipt_finished:null,
      result:verified,
      replay_converged:converged,
    };
  }

  const startedAt = now;
  const started = await appendAttempt({
    receiptAdapter,
    receipt:claim.receipt,
    runId,
    actor,
    confirmationFingerprint,
    sourceSnapshotFingerprint:claim?.fingerprints?.source_snapshot_fingerprint || '',
    phase:'started',
    status:'started',
    resultCode:'pilot_execution_started',
    note:'Exact one-record guarded pilot execution started.',
    now:startedAt,
  });
  if (!started?.ok || !started?.receipt?.id) {
    return {
      success:false,
      status:'held',
      write_attempted:true,
      authorization,
      receipt_claim:claim,
      receipt_started:started,
      result:null,
    };
  }

  let result;
  let executionError = null;
  try {
    result = await executeOpportunityBridgePlanRow({ planRow, adapter:applyAdapter });
  } catch (error) {
    executionError = error;
    result = null;
  }

  const latestReceipt = started.receipt;
  const finalStatus = executionError
    ? 'failed'
    : result?.status === OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED
      ? 'linked'
      : result?.status === OPPORTUNITY_BRIDGE_APPLY_STATUS.ALREADY_LINKED
        ? 'already_linked'
        : 'held';
  const finalCode = executionError
    ? 'pilot_executor_exception'
    : clean(result?.result_code) || 'pilot_result_unknown';

  const finished = await appendAttempt({
    receiptAdapter,
    receipt:latestReceipt,
    runId,
    actor,
    confirmationFingerprint,
    sourceSnapshotFingerprint:claim?.fingerprints?.source_snapshot_fingerprint || '',
    phase:'result',
    status:finalStatus,
    resultCode:finalCode,
    opportunityId:clean(result?.opportunity_id),
    resultSummary:result || {},
    errorMessage:clean(executionError?.message),
    note:executionError ? 'Guarded pilot executor threw; receipt preserved for reconciliation.' : 'Guarded pilot executor result recorded.',
    now,
  });

  const successfulBusinessResult = !executionError &&
    [OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED, OPPORTUNITY_BRIDGE_APPLY_STATUS.ALREADY_LINKED].includes(result?.status);
  const receiptRecorded = finished?.ok === true;

  return {
    success:successfulBusinessResult && receiptRecorded,
    status:successfulBusinessResult && receiptRecorded ? result.status : 'held',
    write_attempted:true,
    authorization,
    receipt_claim:claim,
    receipt_started:started,
    receipt_finished:finished,
    result,
    error_message:clean(executionError?.message),
  };
}
