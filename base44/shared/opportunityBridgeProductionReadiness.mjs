import { reconcileHistoricalSalesOutcome } from './historicalSalesOutcomeReconciliation.mjs';

const clean = (value) => String(value ?? '').trim();

export const OPPORTUNITY_BRIDGE_PRODUCTION_POLICY = Object.freeze({
  VERSION: '0U-v1',
  APPLY_ENABLED: true,
  FIRST_BATCH_SIZE: 1,
  MAX_BATCH_SIZE: 5,
  PLAN_MAX_AGE_MS: 5 * 60 * 1000,
  STOP_ON_FIRST_NON_SUCCESS: true,
  REQUIRE_ADMIN_ROLE: true,
  REQUIRE_SECONDARY_CONFIRMATION: true,
  REQUIRE_FRESH_REPLAN_BEFORE_EACH_BATCH: true,
  ROLLBACK_POLICY: 'forward_correction_only',
  RETRY_POLICY: 'replan_and_reconcile_before_retry',
  RECEIPT_SCHEMA_NAME: 'OpportunityBridgeOperationReceipt',
  RECEIPT_PERSISTENCE_ACTIVE: true,
  SECONDARY_CONFIRMATION_CONFIGURED: true,
  GUARDED_PRODUCTION_EXECUTOR_WIRED: true,
  EXPLICIT_PILOT_AUTHORIZATION_REQUIRED: true,
  AUTHORIZED_PILOT_REVIEW_FINGERPRINT: 'bca66b326527a614f77e05590d14d4171bfb3233af1e9159a6a089bca5425969',
});

const RECEIPT_ANOMALY_STATES = new Set([
  'duplicate_identity',
  'identity_conflict',
  'incomplete_existing_identity',
  'invalid_source_identity',
]);

const UNEXPECTED_LINK_REASONS = new Set([
  'work_order_opportunity_link_conflict',
  'work_order_already_links_unmatched_opportunity',
  'missing_linked_opportunity',
  'opportunity_work_order_conflict',
  'estimate_already_links_other_opportunity',
]);

export function historicalBridgeRuleContractPasses() {
  const won = reconcileHistoricalSalesOutcome({
    id:'fixture-won',
    in_pipeline:true,
    sales_status:'lead',
    current_task_description:'Completed Sale',
    date_order_created:'2026-01-15',
  });
  const completedWithoutOrder = reconcileHistoricalSalesOutcome({
    id:'fixture-hold-completed',
    in_pipeline:true,
    sales_status:'lead',
    current_task_description:'Completed Sale',
    date_order_created:'',
  });
  const lost = reconcileHistoricalSalesOutcome({
    id:'fixture-hold-lost',
    in_pipeline:true,
    sales_status:'lead',
    current_task_description:'Lost - no response',
    date_order_created:'',
  });

  return won?.safe_for_bridge === true &&
    won?.proposed_stage === 'won' &&
    (won?.reasons || []).includes('completed_sale_plus_valid_order_created') &&
    completedWithoutOrder?.safe_for_bridge === false &&
    lost?.safe_for_bridge === false;
}

export function selectOpportunityBridgeFirstBatch(rows = [], size = OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.FIRST_BATCH_SIZE) {
  const limit = Math.max(0, Math.min(Number(size) || 0, OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.MAX_BATCH_SIZE));
  return (Array.isArray(rows) ? rows : [])
    .filter((row) =>
      row?.action === 'proposed_create' &&
      row?.sales_scope === 'current' &&
      row?.receipt_state === 'clear' &&
      row?.evidence_strength === 'strong_stable_anchor' &&
      clean(row?.anchors?.customer_id) &&
      !row?.historical_reconciliation
    )
    .sort((a, b) => clean(a?.work_order_id).localeCompare(clean(b?.work_order_id)))
    .slice(0, limit);
}

function planAgeMs(generatedAt, now) {
  const generated = Date.parse(clean(generatedAt));
  const current = Date.parse(clean(now));
  if (!Number.isFinite(generated) || !Number.isFinite(current)) return Number.POSITIVE_INFINITY;
  return Math.max(0, current - generated);
}

export function evaluateOpportunityBridgeProductionReadiness({
  plan = {},
  generatedAt = '',
  now = new Date().toISOString(),
  receiptSchemaActivated = false,
  receiptLedgerSummary = null,
  secondaryConfirmationConfigured = false,
  secondaryConfirmationContract = null,
} = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const summary = plan?.summary || {};

  const receiptAnomalies = rows.filter((row) =>
    RECEIPT_ANOMALY_STATES.has(clean(row?.receipt_state)) ||
    (row?.reasons || []).some((reason) => clean(reason).startsWith('receipt_'))
  );

  const unexpectedLinks = rows.filter((row) =>
    (row?.reasons || []).some((reason) => UNEXPECTED_LINK_REASONS.has(clean(reason)))
  );

  const applyEligibleRows = rows.filter((row) =>
    ['proposed_create','proposed_recover_link','already_linked'].includes(clean(row?.action))
  );
  const heldOrExcludedInsideApply = applyEligibleRows.filter((row) =>
    ['hold','excluded'].includes(clean(row?.action))
  );

  const firstBatch = selectOpportunityBridgeFirstBatch(rows);
  const age = planAgeMs(generatedAt, now);

  const checks = [
    {
      key:'fresh_plan',
      pass: age <= OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.PLAN_MAX_AGE_MS,
      detail:Number.isFinite(age) ? `Plan age ${Math.round(age / 1000)}s` : 'Plan timestamp unavailable',
    },
    {
      key:'no_receipt_identity_anomalies',
      pass:receiptAnomalies.length === 0,
      detail:`${receiptAnomalies.length} receipt identity anomalies`,
    },
    {
      key:'no_unexpected_opportunity_links',
      pass:unexpectedLinks.length === 0,
      detail:`${unexpectedLinks.length} unexpected/conflicting Opportunity links`,
    },
    {
      key:'held_rows_excluded_from_apply',
      pass:heldOrExcludedInsideApply.length === 0,
      detail:`${Number(summary?.held || 0)} held rows remain outside apply eligibility`,
    },
    {
      key:'historical_reconciliation_rule_unchanged',
      pass:historicalBridgeRuleContractPasses(),
      detail:'Completed Sale + valid Order Created => Won; unsupported Completed/Lost/Closed remain review-only',
    },
    {
      key:'first_batch_available',
      pass:firstBatch.length === OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.FIRST_BATCH_SIZE,
      detail:`${firstBatch.length}/${OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.FIRST_BATCH_SIZE} extra-conservative first-batch candidates available`,
    },
    {
      key:'durable_receipt_schema_activated',
      pass:receiptSchemaActivated === true && OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.RECEIPT_PERSISTENCE_ACTIVE === true,
      detail:receiptSchemaActivated
        ? `Durable receipt ledger activated (${Number(receiptLedgerSummary?.total || 0)} records)`
        : 'Receipt ledger is not activated',
    },
    {
      key:'durable_receipt_ledger_identity_clean',
      pass:receiptSchemaActivated === true && receiptLedgerSummary != null && Number(receiptLedgerSummary?.anomaly_count || 0) === 0,
      detail:receiptLedgerSummary == null
        ? 'Receipt ledger identity summary unavailable'
        : `${Number(receiptLedgerSummary?.anomaly_count || 0)} durable receipt identity anomalies; ${Number(receiptLedgerSummary?.unresolved_count || 0)} unresolved receipts`,
    },
    {
      key:'durable_receipt_ledger_reconciled',
      pass:receiptSchemaActivated === true && receiptLedgerSummary != null && Number(receiptLedgerSummary?.unresolved_count || 0) === 0,
      detail:receiptLedgerSummary == null
        ? 'Receipt ledger reconciliation summary unavailable'
        : `${Number(receiptLedgerSummary?.unresolved_count || 0)} unresolved receipts require reconciliation before retry/apply`,
    },
    {
      key:'secondary_confirmation_configured',
      pass:secondaryConfirmationConfigured === true &&
        OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.SECONDARY_CONFIRMATION_CONFIGURED === true &&
        secondaryConfirmationContract?.configured === true,
      detail:secondaryConfirmationConfigured && secondaryConfirmationContract?.configured
        ? `Secondary confirmation configured (${clean(secondaryConfirmationContract?.mode) || 'server-bound'})`
        : 'Secondary confirmation not configured',
    },
    {
      key:'guarded_production_executor_wired',
      pass:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.GUARDED_PRODUCTION_EXECUTOR_WIRED === true,
      detail:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.GUARDED_PRODUCTION_EXECUTOR_WIRED
        ? 'Guarded executor and exact one-record pre-pilot authorization path are wired'
        : 'Guarded executor is not wired',
    },
    {
      key:'explicit_pilot_authorization_present',
      pass:clean(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT) !== '',
      detail:clean(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT)
        ? 'An exact pilot review fingerprint is explicitly authorized in source'
        : 'No exact pilot review fingerprint is authorized; review/Continue does not authorize a production write',
    },
    {
      key:'production_apply_enabled',
      pass:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED === true,
      detail:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED ? 'Production apply enabled' : 'Production apply is hard-disabled in source',
    },
  ];

  const technicalChecks = checks.filter((check) =>
    !['durable_receipt_schema_activated','durable_receipt_ledger_identity_clean','durable_receipt_ledger_reconciled','secondary_confirmation_configured','guarded_production_executor_wired','explicit_pilot_authorization_present','production_apply_enabled'].includes(check.key)
  );
  const rolloutChecks = checks.filter((check) => !technicalChecks.includes(check));

  return {
    policy_version:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.VERSION,
    decision:checks.every((check) => check.pass) ? 'GO' : 'NO_GO',
    technical_ready:technicalChecks.every((check) => check.pass),
    rollout_ready:rolloutChecks.every((check) => check.pass),
    checks,
    first_batch: firstBatch.map((row) => ({
      work_order_id:clean(row?.work_order_id),
      receipt_key:clean(row?.receipt_key),
      customer_id:clean(row?.anchors?.customer_id),
      sales_scope:clean(row?.sales_scope),
      evidence_strength:clean(row?.evidence_strength),
      action:clean(row?.action),
    })),
    policy:{
      first_batch_size:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.FIRST_BATCH_SIZE,
      max_batch_size:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.MAX_BATCH_SIZE,
      stop_on_first_non_success:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.STOP_ON_FIRST_NON_SUCCESS,
      require_admin_role:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.REQUIRE_ADMIN_ROLE,
      require_secondary_confirmation:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.REQUIRE_SECONDARY_CONFIRMATION,
      require_fresh_replan_before_each_batch:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.REQUIRE_FRESH_REPLAN_BEFORE_EACH_BATCH,
      rollback_policy:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.ROLLBACK_POLICY,
      retry_policy:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.RETRY_POLICY,
      receipt_schema_name:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.RECEIPT_SCHEMA_NAME,
      receipt_persistence_active:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.RECEIPT_PERSISTENCE_ACTIVE,
      secondary_confirmation_configured:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.SECONDARY_CONFIRMATION_CONFIGURED,
      guarded_production_executor_wired:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.GUARDED_PRODUCTION_EXECUTOR_WIRED,
      explicit_pilot_authorization_required:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.EXPLICIT_PILOT_AUTHORIZATION_REQUIRED,
      authorized_pilot_review_fingerprint:clean(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT),
      apply_enabled:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED,
    },
  };
}
