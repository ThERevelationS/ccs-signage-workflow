import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPPORTUNITY_BRIDGE_SIMULATION,
  OpportunityBridgeSimulationRequestError,
  parseOpportunityBridgeSimulationRequest,
  selectOpportunityBridgeSimulationRows,
} from '../base44/shared/opportunityBridgeSimulationPolicy.mjs';

{
  const request = parseOpportunityBridgeSimulationRequest({});
  assert.equal(request.mode, 'simulation');
  assert.equal(request.limit, 10);
  assert.deepEqual(request.actions, ['proposed_create','proposed_recover_link','already_linked']);
  assert.equal(request.write_capability, false);
}

{
  const request = parseOpportunityBridgeSimulationRequest({ limit:999, work_order_ids:['wo1','wo2'], actions:['hold'] });
  assert.equal(request.limit, OPPORTUNITY_BRIDGE_SIMULATION.MAX_LIMIT);
  assert.deepEqual(request.work_order_ids, ['wo1','wo2']);
  assert.deepEqual(request.actions, ['hold']);
}

for (const body of [
  { mode:'apply' },
  { mode:'write' },
  { dry_run:false },
  { simulate:false },
  { apply:true },
  { write:true },
  { execute:true },
  { commit:true },
  { opportunity_payload:{ title:'Injected' } },
  { proposed_opportunity:{ title:'Injected' } },
]) {
  assert.throws(
    () => parseOpportunityBridgeSimulationRequest(body),
    OpportunityBridgeSimulationRequestError,
    `Expected write-shaped request to be rejected: ${JSON.stringify(body)}`,
  );
}

assert.throws(
  () => parseOpportunityBridgeSimulationRequest({ work_order_ids:Array.from({length:26},(_,i)=>`wo-${i}`) }),
  OpportunityBridgeSimulationRequestError,
);
assert.throws(
  () => parseOpportunityBridgeSimulationRequest({ work_order_ids:['wo1','wo1'] }),
  OpportunityBridgeSimulationRequestError,
);
assert.throws(
  () => parseOpportunityBridgeSimulationRequest({ actions:['proposed_create','delete_everything'] }),
  OpportunityBridgeSimulationRequestError,
);

{
  const rows = [
    { work_order_id:'wo1', action:'proposed_create' },
    { work_order_id:'wo2', action:'hold' },
    { work_order_id:'wo3', action:'already_linked' },
  ];
  const selected = selectOpportunityBridgeSimulationRows(rows, {
    limit:25,
    work_order_ids:['wo2','wo3'],
    actions:['hold','already_linked'],
  });
  assert.deepEqual(selected.map((row)=>row.work_order_id), ['wo2','wo3']);
}

const endpointPath = new URL('../base44/functions/opportunityBridgeSimulation/entry.ts', import.meta.url);
const source = fs.readFileSync(endpointPath, 'utf8');

assert(source.includes('actor.role !== "admin"'), 'Simulation endpoint must remain admin-only.');
assert(source.includes('simulation_only:true'), 'Simulation endpoint must explicitly identify simulation mode.');
assert(source.includes('write_capability:false'), 'Simulation endpoint must explicitly report no write capability.');
assert(source.includes('apply_path_enabled:false'), 'Simulation endpoint must explicitly report apply path disabled.');
assert(source.includes('buildOpportunityBridgeDryRunPlan'), 'Backend must compute proposals from trusted live reads.');
assert(source.includes('evaluateOpportunityBridgeProductionReadiness'), 'Backend must compute the read-only production readiness gate.');
assert(source.includes('OpportunityBridgeOperationReceipt'), 'Simulation must read the activated durable receipt ledger.');
assert(source.includes('summarizeOpportunityBridgeReceiptLedger'), 'Simulation must summarize durable receipt identity state.');
assert(source.includes('receiptSchemaActivated:true'), 'Simulation must report the durable receipt schema as activated.');
assert(source.includes('secondaryConfirmationConfigured:confirmationContract.configured === true'), 'Simulation must report the configured secondary-confirmation contract.');
assert(source.includes('buildOpportunityBridgeSecondaryConfirmationBinding'), 'Simulation must prove exact run/batch confirmation binding without enabling apply.');
assert(source.includes('secondary_confirmation_contract:confirmationContract'), 'Simulation response must include the secondary-confirmation contract.');
assert(source.includes('secondary_confirmation_binding:confirmationBinding'), 'Simulation response must include only the non-secret confirmation binding metadata.');
assert(source.includes('rollout_run_id:rolloutRunId'), 'Simulation response must bind readiness to a server-generated rollout run id.');
assert(!source.includes('required_phrase:'), 'Simulation endpoint must not expose the confirmation phrase.');
assert(source.includes('readiness,'), 'Simulation response must include the readiness checklist.');
assert(source.includes('generated_at:generatedAt'), 'Simulation response must include the server plan timestamp.');
assert(!source.includes('opportunityBridgeApplyEngine'), 'Simulation endpoint must not import the apply engine.');
assert(!source.includes('executeOpportunityBridgePlanRow'), 'Simulation endpoint must not expose the apply executor.');

for (const forbidden of [
  /\.create\s*\(/,
  /\.update\s*\(/,
  /\.updateMany\s*\(/,
  /\.delete\s*\(/,
  /\.deleteMany\s*\(/,
  /\.bulkCreate\s*\(/,
]) {
  assert(!forbidden.test(source), `Simulation endpoint contains forbidden write call: ${forbidden}`);
}

assert(/WorkOrder[^\n]*=.*asServiceRole\.entities\.WorkOrder/.test(source));
assert(/Customer[^\n]*=.*asServiceRole\.entities\.Customer/.test(source));
assert(/Estimate[^\n]*=.*asServiceRole\.entities\.AllInOneEstimate/.test(source));
assert(/Opportunity[^\n]*=.*asServiceRole\.entities\.Opportunity/.test(source));
assert(/Receipt[^\n]*=.*asServiceRole\.entities\.OpportunityBridgeOperationReceipt/.test(source));

console.log('Opportunity bridge simulation-only endpoint validation: PASS');
