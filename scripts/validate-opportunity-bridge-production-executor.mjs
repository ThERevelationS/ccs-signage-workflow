import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOpportunityBridgeDryRunPlan } from '../base44/shared/opportunityBridgeDryRunPlanner.mjs';
import {
  OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR,
  evaluateOpportunityBridgePilotAuthorization,
  executeGuardedOpportunityBridgePilot,
} from '../base44/shared/opportunityBridgeProductionExecutor.mjs';
import {
  buildOpportunityBridgeSecondaryConfirmationBinding,
} from '../base44/shared/opportunityBridgeSecondaryConfirmation.mjs';
import {
  claimOpportunityBridgeReceipt,
} from '../base44/shared/opportunityBridgeReceiptPersistence.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const actor = { id:'admin-1', email:'admin@example.com', role:'admin' };
const planGeneratedAt = '2026-10-07T20:00:00.000Z';
const now = '2026-10-07T20:01:00.000Z';

function makeState() {
  return {
    workOrder:{
      id:'wo-pilot',
      title:'Pilot Sign',
      client_name:'Pilot Customer',
      customer_id:'cust-1',
      in_pipeline:true,
      completed:false,
      deleted:false,
      is_rider:false,
      sales_status:'lead',
      current_task_description:'Follow up',
      date_order_created:'',
      smartsheet_sheet_id:'8702703019812740',
      smartsheet_row_id:'123456789',
      estimate_id:null,
      opportunity_id:null,
      updated_date:'2026-10-07T19:59:00.000Z',
    },
    customers:[{
      id:'cust-1',
      company_name:'Pilot Customer',
      legacy_client_names:['Pilot Customer'],
    }],
    opportunities:[],
    receipts:[],
    tick:0,
  };
}

function currentPlan(state) {
  return buildOpportunityBridgeDryRunPlan({
    workOrders:[clone(state.workOrder)],
    customers:clone(state.customers),
    estimates:[],
    opportunities:clone(state.opportunities),
  });
}

function makeApplyAdapter(state) {
  return {
    async getWorkOrder(id) {
      return id === state.workOrder.id ? clone(state.workOrder) : null;
    },
    async findOpportunities({ workOrderId, receiptKey }) {
      return clone(state.opportunities.filter((row) =>
        String(row.creation_request_key || '') === String(receiptKey || '') ||
        String(row.compatibility_work_order_id || '') === String(workOrderId || '')
      ));
    },
    async createOpportunity(payload) {
      const row = {
        ...clone(payload),
        id:`opp-${state.opportunities.length + 1}`,
        created_date:'2026-10-07T20:01:01.000Z',
        updated_date:'2026-10-07T20:01:01.000Z',
      };
      state.opportunities.push(row);
      return clone(row);
    },
    async getOpportunity(id) {
      const row = state.opportunities.find((item) => item.id === id);
      return row ? clone(row) : null;
    },
    async linkWorkOrderIfUnchanged({ workOrderId, opportunityId, expectedSnapshot }) {
      assert.equal(workOrderId, state.workOrder.id);
      assert.equal(state.workOrder.updated_date, expectedSnapshot.updated_date);
      assert.equal(String(state.workOrder.opportunity_id || ''), String(expectedSnapshot.opportunity_id || ''));
      state.tick += 1;
      state.workOrder = {
        ...state.workOrder,
        opportunity_id:opportunityId,
        updated_date:`2026-10-07T20:01:0${state.tick + 1}.000Z`,
      };
      return clone(state.workOrder);
    },
  };
}

function makeReceiptAdapter(state) {
  let version = 0;
  const nextVersion = () => `receipt-v${++version}`;
  return {
    async findByOperationKey(operationKey) {
      return clone(state.receipts.filter((row) => row.operation_key === operationKey));
    },
    async createReceipt(payload) {
      const row = {
        ...clone(payload),
        id:`receipt-${state.receipts.length + 1}`,
        created_date:nextVersion(),
        updated_date:nextVersion(),
      };
      state.receipts.push(row);
      return clone(row);
    },
    async updateReceiptIfCurrent({ id, expectedUpdatedDate, patch }) {
      const row = state.receipts.find((item) => item.id === id);
      if (!row || row.updated_date !== expectedUpdatedDate) return null;
      Object.assign(row, clone(patch), { updated_date:nextVersion() });
      return clone(row);
    },
  };
}

async function bindingFor(plan, runId = 'run-pilot') {
  const row = plan.rows.find((item) => item.work_order_id === 'wo-pilot');
  assert(row, 'Expected pilot plan row.');
  assert.equal(row.action, 'proposed_create');
  assert.equal(row.evidence_strength, 'strong_stable_anchor');
  return buildOpportunityBridgeSecondaryConfirmationBinding({
    runId,
    planGeneratedAt,
    batchRows:[row],
    actor,
  });
}

assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.VERSION, '0T-v1');
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.PILOT_BATCH_SIZE, 1);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.REQUIRE_EXACT_FIRST_BATCH, true);
assert.equal(OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.PRODUCTION_APPLY_WIRED, true);

{
  const state = makeState();
  const plan = currentPlan(state);
  const binding = await bindingFor(plan);
  const authorization = await evaluateOpportunityBridgePilotAuthorization({
    plan,
    planGeneratedAt,
    now,
    requestedWorkOrderId:'wo-pilot',
    actor,
    confirmationBinding:binding,
    confirmationPhrase:binding.required_phrase,
    receiptLedgerSummary:{ total:0, anomaly_count:0, unresolved_count:0 },
    applyEnabled:false,
  });
  assert.equal(authorization.authorized, false);
  assert.equal(authorization.decision, 'LOCKED');
  assert.equal(authorization.checks.find((item) => item.key === 'production_apply_enabled').pass, false);

  const result = await executeGuardedOpportunityBridgePilot({
    plan,
    planGeneratedAt,
    requestedWorkOrderId:'wo-pilot',
    actor,
    confirmationBinding:binding,
    confirmationPhrase:binding.required_phrase,
    receiptLedgerSummary:{ total:0, anomaly_count:0, unresolved_count:0 },
    applyEnabled:false,
    applyAdapter:makeApplyAdapter(state),
    receiptAdapter:makeReceiptAdapter(state),
    now,
  });
  assert.equal(result.success, false);
  assert.equal(result.status, 'locked');
  assert.equal(result.write_attempted, false);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.opportunities.length, 0);
  assert.equal(String(state.workOrder.opportunity_id || ''), '');
}

for (const variation of ['wrong_record','wrong_phrase','stale_plan','receipt_anomaly','wrong_actor']) {
  const state = makeState();
  const plan = currentPlan(state);
  const binding = await bindingFor(plan, `run-${variation}`);
  const input = {
    plan,
    planGeneratedAt,
    now,
    requestedWorkOrderId:'wo-pilot',
    actor,
    confirmationBinding:binding,
    confirmationPhrase:binding.required_phrase,
    receiptLedgerSummary:{ total:0, anomaly_count:0, unresolved_count:0 },
    applyEnabled:true,
    applyAdapter:makeApplyAdapter(state),
    receiptAdapter:makeReceiptAdapter(state),
  };
  if (variation === 'wrong_record') input.requestedWorkOrderId = 'wo-other';
  if (variation === 'wrong_phrase') input.confirmationPhrase = 'WRONG';
  if (variation === 'stale_plan') input.now = '2026-10-07T20:06:00.001Z';
  if (variation === 'receipt_anomaly') input.receiptLedgerSummary = { total:2, anomaly_count:1, unresolved_count:0 };
  if (variation === 'wrong_actor') input.actor = { id:'admin-2', email:'other@example.com', role:'admin' };

  const result = await executeGuardedOpportunityBridgePilot(input);
  assert.equal(result.success, false, variation);
  assert.equal(result.status, 'locked', variation);
  assert.equal(result.write_attempted, false, variation);
  assert.equal(state.receipts.length, 0, variation);
  assert.equal(state.opportunities.length, 0, variation);
  assert.equal(String(state.workOrder.opportunity_id || ''), '', variation);
}

{
  const state = makeState();
  const plan = currentPlan(state);
  const binding = await bindingFor(plan, 'run-success');
  const applyAdapter = makeApplyAdapter(state);
  const receiptAdapter = makeReceiptAdapter(state);

  const result = await executeGuardedOpportunityBridgePilot({
    plan,
    planGeneratedAt,
    requestedWorkOrderId:'wo-pilot',
    actor,
    confirmationBinding:binding,
    confirmationPhrase:binding.required_phrase,
    receiptLedgerSummary:{ total:0, anomaly_count:0, unresolved_count:0 },
    applyEnabled:true,
    applyAdapter,
    receiptAdapter,
    now,
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'linked');
  assert.equal(result.write_attempted, true);
  assert.equal(state.opportunities.length, 1);
  assert.equal(state.workOrder.opportunity_id, state.opportunities[0].id);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].status, 'linked');
  assert.equal(state.receipts[0].attempt_count, 2);
  assert.deepEqual(state.receipts[0].attempt_history.map((item) => item.status), ['started','linked']);
  assert.equal(state.receipts[0].secondary_confirmation_fingerprint, binding.confirmation_fingerprint);
  assert.equal(JSON.stringify(state.receipts[0]).includes(binding.required_phrase), false, 'Confirmation phrase must never be persisted.');

  const terminalClaim = await claimOpportunityBridgeReceipt({
    adapter:receiptAdapter,
    planRow:{
      ...plan.rows.find((item) => item.work_order_id === 'wo-pilot'),
      source_snapshot:{
        ...plan.rows.find((item) => item.work_order_id === 'wo-pilot').source_snapshot,
        opportunity_id:state.workOrder.opportunity_id,
        updated_date:state.workOrder.updated_date,
      },
    },
    runId:'run-terminal-retry',
    actor,
    secondaryConfirmationFingerprint:binding.confirmation_fingerprint,
  });
  assert.equal(terminalClaim.ok, true);
  assert.equal(terminalClaim.state, 'terminal_existing', 'Terminal receipt must converge despite the expected post-link source snapshot change.');

  const replanned = currentPlan(state);
  const replayRow = replanned.rows.find((item) => item.work_order_id === 'wo-pilot');
  assert.equal(replayRow.action, 'already_linked');
  const replayBinding = await buildOpportunityBridgeSecondaryConfirmationBinding({
    runId:'run-replay',
    planGeneratedAt:'2026-10-07T20:02:00.000Z',
    batchRows:[replayRow],
    actor,
  });

  // A completed record is no longer a proposed-create first pilot candidate.
  // Replaying through the production pilot selector must therefore stay locked.
  const replay = await executeGuardedOpportunityBridgePilot({
    plan:replanned,
    planGeneratedAt:'2026-10-07T20:02:00.000Z',
    requestedWorkOrderId:'wo-pilot',
    actor,
    confirmationBinding:replayBinding,
    confirmationPhrase:replayBinding.required_phrase,
    receiptLedgerSummary:{ total:1, anomaly_count:0, unresolved_count:0 },
    applyEnabled:true,
    applyAdapter,
    receiptAdapter,
    now:'2026-10-07T20:02:30.000Z',
  });
  assert.equal(replay.success, false);
  assert.equal(replay.status, 'locked');
  assert.equal(replay.write_attempted, false);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.opportunities.length, 1);
}

const endpoint = fs.readFileSync(new URL('../base44/functions/opportunityBridgeProductionApply/entry.ts', import.meta.url), 'utf8');
assert(endpoint.includes('action === "prepare_pilot"'));
assert(endpoint.includes('action === "apply_pilot"') || endpoint.includes('["prepare_pilot","apply_pilot"]'));
assert(endpoint.includes('OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED'));
assert(endpoint.includes('applyEnabled:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED'));
assert(!endpoint.includes('applyEnabled:body'));
assert(!endpoint.includes('body?.apply_enabled'));
assert(endpoint.includes('buildOpportunityBridgeDryRunPlan'));
assert(endpoint.includes('selectOpportunityBridgeFirstBatch'));
assert(endpoint.includes('createBase44OpportunityBridgeReceiptAdapter'));
assert(endpoint.includes('executeGuardedOpportunityBridgePilot'));
assert(endpoint.includes('actor.role !== "admin"'));
assert(endpoint.includes('write_attempted:false'));
assert(endpoint.includes('WorkOrder.updateMany'));
assert(endpoint.includes('Opportunity.create'));
assert(endpoint.includes('updated_date:expectedUpdatedDate'));

console.log('Opportunity bridge guarded production executor + pre-pilot harness: PASS');
