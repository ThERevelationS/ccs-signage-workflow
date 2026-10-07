import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OPPORTUNITY_BRIDGE_PRODUCTION_POLICY } from '../base44/shared/opportunityBridgeProductionReadiness.mjs';
import {
  OPPORTUNITY_BRIDGE_RECEIPT_PERSISTENCE,
  appendOpportunityBridgeReceiptAttempt,
  claimOpportunityBridgeReceipt,
  summarizeOpportunityBridgeReceiptLedger,
} from '../base44/shared/opportunityBridgeReceiptPersistence.mjs';
import {
  OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION,
  buildOpportunityBridgeSecondaryConfirmationBinding,
  describeOpportunityBridgeSecondaryConfirmationContract,
  verifyOpportunityBridgeSecondaryConfirmation,
} from '../base44/shared/opportunityBridgeSecondaryConfirmation.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function memoryAdapter({ loseNextCreateAck = false, loseNextUpdateAck = false } = {}) {
  const rows = [];
  let version = 0;
  const stamp = () => `v${++version}`;
  return {
    rows,
    async findByOperationKey(operationKey) {
      return clone(rows.filter((row) => row.operation_key === operationKey));
    },
    async createReceipt(payload) {
      const row = { ...clone(payload), id:`receipt-${rows.length + 1}`, created_date:stamp(), updated_date:stamp() };
      rows.push(row);
      if (loseNextCreateAck) {
        loseNextCreateAck = false;
        throw new Error('simulated lost create acknowledgement');
      }
      return clone(row);
    },
    async updateReceiptIfCurrent({ id, expectedUpdatedDate, patch }) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.updated_date !== expectedUpdatedDate) return null;
      Object.assign(row, clone(patch), { updated_date:stamp() });
      if (loseNextUpdateAck) {
        loseNextUpdateAck = false;
        throw new Error('simulated lost update acknowledgement');
      }
      return clone(row);
    },
  };
}

const actor = { id:'admin-1', email:'admin@example.com', role:'admin' };
const planGeneratedAt = '2026-10-07T18:00:00.000Z';
const runId = 'run-0s-test';
const planRow = {
  work_order_id:'wo-1',
  receipt_key:'workorder:wo-1:opportunity:v1',
  action:'proposed_create',
  sales_scope:'current',
  receipt_state:'clear',
  evidence_strength:'strong_stable_anchor',
  anchors:{ customer_id:'customer-1' },
  source_snapshot:{ id:'wo-1', updated_date:'source-v1', client_name:'Example' },
  proposed_opportunity:{
    creation_request_key:'workorder:wo-1:opportunity:v1',
    compatibility_work_order_id:'wo-1',
    customer_id:'customer-1',
    title:'Example Sign',
    stage:'new',
  },
};

assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED, false);
assert.equal(OPPORTUNITY_BRIDGE_RECEIPT_PERSISTENCE.ACTIVE, true);
assert.equal(OPPORTUNITY_BRIDGE_RECEIPT_PERSISTENCE.PRODUCTION_APPLY_WIRED, false);
assert.equal(OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.CONFIGURED, true);
assert.equal(OPPORTUNITY_BRIDGE_SECONDARY_CONFIRMATION.STORE_CONFIRMATION_SECRET, false);
assert.equal(summarizeOpportunityBridgeReceiptLedger([]).total, 0);

const binding = await buildOpportunityBridgeSecondaryConfirmationBinding({
  runId,
  planGeneratedAt,
  batchRows:[planRow],
  actor,
});
assert.equal(binding.run_id, runId);
assert.equal(binding.batch_size, 1);
assert.match(binding.batch_fingerprint, /^[a-f0-9]{64}$/);
assert.match(binding.confirmation_fingerprint, /^[a-f0-9]{64}$/);
assert(binding.required_phrase.includes(runId));

{
  const verified = await verifyOpportunityBridgeSecondaryConfirmation({
    binding,
    providedPhrase:binding.required_phrase,
    actor,
    batchRows:[planRow],
    now:'2026-10-07T18:01:00.000Z',
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.confirmation_fingerprint, binding.confirmation_fingerprint);
}

assert.equal((await verifyOpportunityBridgeSecondaryConfirmation({
  binding,
  providedPhrase:'CONFIRM SOMETHING ELSE',
  actor,
  batchRows:[planRow],
  now:'2026-10-07T18:01:00.000Z',
})).reason, 'confirmation_phrase_mismatch');

assert.equal((await verifyOpportunityBridgeSecondaryConfirmation({
  binding,
  providedPhrase:binding.required_phrase,
  actor:{ ...actor, id:'admin-2' },
  batchRows:[planRow],
  now:'2026-10-07T18:01:00.000Z',
})).reason, 'confirmation_actor_mismatch');

assert.equal((await verifyOpportunityBridgeSecondaryConfirmation({
  binding,
  providedPhrase:binding.required_phrase,
  actor,
  batchRows:[{ ...planRow, work_order_id:'wo-2', receipt_key:'workorder:wo-2:opportunity:v1' }],
  now:'2026-10-07T18:01:00.000Z',
})).reason, 'confirmation_batch_mismatch');

assert.equal((await verifyOpportunityBridgeSecondaryConfirmation({
  binding,
  providedPhrase:binding.required_phrase,
  actor,
  batchRows:[planRow],
  now:'2026-10-07T18:06:00.001Z',
})).reason, 'confirmation_expired');

{
  const contract = describeOpportunityBridgeSecondaryConfirmationContract();
  assert.equal(contract.configured, true);
  assert.equal(contract.requires_exact_batch, true);
  assert.equal(contract.requires_exact_actor, true);
  assert.equal(contract.stores_confirmation_secret, false);
  assert(contract.binds.includes('run_id'));
  assert(contract.binds.includes('batch_fingerprint'));
}

{
  const adapter = memoryAdapter({ loseNextCreateAck:true });
  const claimed = await claimOpportunityBridgeReceipt({
    adapter,
    planRow,
    runId,
    actor,
    secondaryConfirmationFingerprint:binding.confirmation_fingerprint,
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.state, 'created_recovered_after_error');
  assert.equal(adapter.rows.length, 1);
  assert.equal(adapter.rows[0].secondary_confirmation_fingerprint, binding.confirmation_fingerprint);

  const retry = await claimOpportunityBridgeReceipt({
    adapter,
    planRow,
    runId:'run-retry',
    actor,
    secondaryConfirmationFingerprint:binding.confirmation_fingerprint,
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.state, 'existing');
  assert.equal(adapter.rows.length, 1, 'retry must not create a second receipt');

  const mismatch = await claimOpportunityBridgeReceipt({
    adapter,
    planRow:{ ...planRow, proposed_opportunity:{ ...planRow.proposed_opportunity, title:'Changed proposal' } },
    runId:'run-replan',
    actor,
    secondaryConfirmationFingerprint:binding.confirmation_fingerprint,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'receipt_plan_mismatch');

  const receiptBeforeAttempt = (await adapter.findByOperationKey(planRow.receipt_key))[0];
  const attempt = {
    attempt_id:'attempt-1',
    run_id:runId,
    at:'2026-10-07T18:01:30.000Z',
    status:'started',
    result_code:'nonproduction_harness',
    source_snapshot_fingerprint:claimed.fingerprints.source_snapshot_fingerprint,
    actor_user_id:actor.id,
    actor_email:actor.email,
    secondary_confirmation_fingerprint:binding.confirmation_fingerprint,
    note:'Harness only; no Opportunity or WorkOrder mutation.',
  };
  const recorded = await appendOpportunityBridgeReceiptAttempt({
    adapter,
    operationKey:planRow.receipt_key,
    expectedUpdatedDate:receiptBeforeAttempt.updated_date,
    attempt,
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.state, 'attempt_recorded');
  assert.equal(recorded.receipt.attempt_count, 1);
  assert.equal(recorded.receipt.attempt_history.length, 1);

  const idempotentRetry = await appendOpportunityBridgeReceiptAttempt({
    adapter,
    operationKey:planRow.receipt_key,
    expectedUpdatedDate:recorded.receipt.updated_date,
    attempt,
  });
  assert.equal(idempotentRetry.ok, true);
  assert.equal(idempotentRetry.state, 'attempt_already_recorded');
  assert.equal(idempotentRetry.receipt.attempt_count, 1);

  const stale = await appendOpportunityBridgeReceiptAttempt({
    adapter,
    operationKey:planRow.receipt_key,
    expectedUpdatedDate:'stale-version',
    attempt:{ ...attempt, attempt_id:'attempt-2', at:'2026-10-07T18:02:00.000Z' },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'receipt_changed');
}

{
  const adapter = memoryAdapter({ loseNextUpdateAck:true });
  const claimed = await claimOpportunityBridgeReceipt({
    adapter,
    planRow,
    runId,
    actor,
    secondaryConfirmationFingerprint:binding.confirmation_fingerprint,
  });
  const attempt = {
    attempt_id:'attempt-lost-ack',
    run_id:runId,
    at:'2026-10-07T18:02:00.000Z',
    status:'started',
    result_code:'lost_ack_harness',
    source_snapshot_fingerprint:claimed.fingerprints.source_snapshot_fingerprint,
  };
  const recovered = await appendOpportunityBridgeReceiptAttempt({
    adapter,
    operationKey:planRow.receipt_key,
    expectedUpdatedDate:claimed.receipt.updated_date,
    attempt,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state, 'attempt_recovered_after_error');
  assert.equal(recovered.receipt.attempt_count, 1);
}

{
  const valid = {
    id:'a',
    operation_key:'workorder:wo-a:opportunity:v1',
    work_order_id:'wo-a',
    opportunity_creation_request_key:'workorder:wo-a:opportunity:v1',
    status:'planned',
    proposal_fingerprint:'f'.repeat(64),
  };
  const summary = summarizeOpportunityBridgeReceiptLedger([valid, { ...valid, id:'b' }]);
  assert.equal(summary.duplicate_operation_key_count, 1);
  assert.equal(summary.anomaly_count, 1);
}

const activeSchema = JSON.parse(fs.readFileSync(new URL('../base44/entities/OpportunityBridgeOperationReceipt.jsonc', import.meta.url), 'utf8'));
assert.equal(activeSchema.name, 'OpportunityBridgeOperationReceipt');
assert.equal(activeSchema.rls.create.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(activeSchema.rls.update.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(activeSchema.rls.delete.user_condition.role, '__opportunity_bridge_server_only__');
assert.equal(activeSchema.rls.read.user_condition.role, 'admin');

console.log('Opportunity bridge 0S receipt + confirmation foundation harness: PASS');
