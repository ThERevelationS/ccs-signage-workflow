import { cleanBridgeValue, sha256Hex, stableCanonicalJson } from './opportunityBridgeIntegrity.mjs';

const clean = cleanBridgeValue;

export const OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION = Object.freeze({
  VERSION:'0S-v1',
  CONFIGURED:true,
  MODE:'typed_exact_batch_phrase',
  MAX_AGE_MS:5 * 60 * 1000,
  REQUIRE_ADMIN_ROLE:true,
  REQUIRE_EXACT_ACTOR:true,
  REQUIRE_EXACT_BATCH:true,
  STORE_CONFIRMATION_SECRET:false,
});

function canonicalBatchRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    work_order_id:clean(row?.work_order_id),
    receipt_key:clean(row?.receipt_key),
    action:clean(row?.action),
    source_snapshot:row?.source_snapshot || {},
    proposed_opportunity:row?.proposed_opportunity || {},
  }));
}

function actorBinding(actor = {}) {
  return {
    id:clean(actor?.id),
    email:clean(actor?.email).toLowerCase(),
    role:clean(actor?.role).toLowerCase(),
  };
}

export async function buildOpportunityBridgeSecondaryConfirmationBinding({
  runId,
  planGeneratedAt,
  batchRows,
  actor,
} = {}) {
  const rolloutRunId = clean(runId);
  const generatedAt = clean(planGeneratedAt);
  const boundActor = actorBinding(actor);
  const rows = canonicalBatchRows(batchRows);

  if (!rolloutRunId) throw new Error('Opportunity bridge secondary confirmation requires a rollout run id.');
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Opportunity bridge secondary confirmation requires a valid plan timestamp.');
  }
  if (boundActor.role !== 'admin' || !boundActor.id || !boundActor.email) {
    throw new Error('Opportunity bridge secondary confirmation requires the exact authenticated admin actor.');
  }
  if (!rows.length) throw new Error('Opportunity bridge secondary confirmation requires a nonempty exact batch.');
  for (const row of rows) {
    if (!row.work_order_id || !row.receipt_key || !row.action) {
      throw new Error('Opportunity bridge secondary confirmation batch rows require work_order_id, receipt_key and action.');
    }
  }

  const batchFingerprint = await sha256Hex(rows);
  const confirmationFingerprint = await sha256Hex({
    version:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.VERSION,
    run_id:rolloutRunId,
    plan_generated_at:generatedAt,
    batch_fingerprint:batchFingerprint,
    actor:boundActor,
  });
  const phrase = `CONFIRM OPPORTUNITY BRIDGE ${rolloutRunId} ${batchFingerprint.slice(0, 12)}`;

  return {
    version:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.VERSION,
    mode:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.MODE,
    run_id:rolloutRunId,
    plan_generated_at:generatedAt,
    batch_fingerprint:batchFingerprint,
    confirmation_fingerprint:confirmationFingerprint,
    actor:boundActor,
    batch_size:rows.length,
    required_phrase:phrase,
    expires_at:new Date(Date.parse(generatedAt) + OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.MAX_AGE_MS).toISOString(),
  };
}

export async function verifyOpportunityBridgeSecondaryConfirmation({
  binding,
  providedPhrase,
  actor,
  batchRows,
  now = new Date().toISOString(),
} = {}) {
  if (!binding || typeof binding !== 'object') return { ok:false, reason:'missing_confirmation_binding' };
  const currentActor = actorBinding(actor);
  if (currentActor.role !== 'admin') return { ok:false, reason:'admin_role_required' };
  if (currentActor.id !== clean(binding?.actor?.id) || currentActor.email !== clean(binding?.actor?.email).toLowerCase()) {
    return { ok:false, reason:'confirmation_actor_mismatch' };
  }

  const currentTime = Date.parse(clean(now));
  const generatedTime = Date.parse(clean(binding?.plan_generated_at));
  if (!Number.isFinite(currentTime) || !Number.isFinite(generatedTime) ||
      currentTime < generatedTime ||
      currentTime - generatedTime > OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.MAX_AGE_MS) {
    return { ok:false, reason:'confirmation_expired' };
  }

  const rebuilt = await buildOpportunityBridgeSecondaryConfirmationBinding({
    runId:binding?.run_id,
    planGeneratedAt:binding?.plan_generated_at,
    batchRows,
    actor:currentActor,
  });
  if (rebuilt.batch_fingerprint !== clean(binding?.batch_fingerprint) ||
      rebuilt.confirmation_fingerprint !== clean(binding?.confirmation_fingerprint)) {
    return { ok:false, reason:'confirmation_batch_mismatch' };
  }
  if (clean(providedPhrase) !== rebuilt.required_phrase) {
    return { ok:false, reason:'confirmation_phrase_mismatch' };
  }

  return {
    ok:true,
    reason:'',
    confirmation_fingerprint:rebuilt.confirmation_fingerprint,
    run_id:rebuilt.run_id,
    batch_fingerprint:rebuilt.batch_fingerprint,
  };
}

export function describeOpportunityBridgeSecondaryConfirmationContract() {
  return {
    configured:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.CONFIGURED,
    version:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.VERSION,
    mode:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.MODE,
    max_age_ms:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.MAX_AGE_MS,
    requires_admin_role:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.REQUIRE_ADMIN_ROLE,
    requires_exact_actor:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.REQUIRE_EXACT_ACTOR,
    requires_exact_batch:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.REQUIRE_EXACT_BATCH,
    stores_confirmation_secret:OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.STORE_CONFIRMATION_SECRET,
    binds:[
      'run_id',
      'plan_generated_at',
      'batch_fingerprint',
      'actor_user_id',
      'actor_email',
    ],
  };
}

export function sameOpportunityBridgeConfirmationBinding(a = {}, b = {}) {
  return stableCanonicalJson({
    run_id:clean(a?.run_id),
    plan_generated_at:clean(a?.plan_generated_at),
    batch_fingerprint:clean(a?.batch_fingerprint),
    confirmation_fingerprint:clean(a?.confirmation_fingerprint),
    actor:a?.actor || {},
  }) === stableCanonicalJson({
    run_id:clean(b?.run_id),
    plan_generated_at:clean(b?.plan_generated_at),
    batch_fingerprint:clean(b?.batch_fingerprint),
    confirmation_fingerprint:clean(b?.confirmation_fingerprint),
    actor:b?.actor || {},
  });
}
