import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OpportunityFoundationCreateAmbiguityError,
  OpportunityFoundationFieldConflictError,
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  foundationCreationKeyQuery,
  foundationRelationshipErrors,
  replaceEstimatingRequestFieldsIfUnchanged,
  replaceFoundationFieldsIfUnchanged,
} from '../base44/shared/opportunityFoundationPersistence.mjs';

const readSchema = (name) => JSON.parse(fs.readFileSync(new URL(`../base44/entities/${name}.jsonc`, import.meta.url), 'utf8'));
const opportunity = readSchema('Opportunity');
const intake = readSchema('OpportunityIntake');
const request = readSchema('EstimatingRequest');
const workOrder = readSchema('WorkOrder');
const estimate = readSchema('AllInOneEstimate');

assert.equal(opportunity.properties.creation_request_key.type, 'string');
assert.ok(opportunity.required.includes('creation_request_key'));
assert.deepEqual(opportunity.properties.stage.enum, ['new','qualified','estimating','quoted','follow_up','on_hold','won','lost']);
assert.equal(intake.properties.opportunity_id.type, 'string');
assert.ok(!intake.required.includes('opportunity_id'), 'Intake must be capturable before Opportunity resolution.');
assert.ok(intake.properties.source_type.enum.includes('smartsheet'));
assert.ok(intake.properties.source_type.enum.includes('historical'));
assert.ok(request.required.includes('opportunity_id'));
assert.equal(request.properties.handoff_snapshot.additionalProperties, true);

for (const [schema, role] of [
  [opportunity, '__opportunity_backend_only__'],
  [intake, '__opportunity_intake_backend_only__'],
  [request, '__estimating_request_backend_only__'],
]) {
  for (const action of ['create','read','update','delete']) {
    assert.equal(schema.rls[action].user_condition.role, role, `${schema.name} ${action} must remain backend-only during dormant foundation phase.`);
  }
}

for (const field of ['opportunity_id','estimating_request_id']) {
  assert.equal(workOrder.properties[field].type, 'string');
  assert.ok(!workOrder.required.includes(field), `WorkOrder.${field} must be nullable/additive.`);
  assert.equal(estimate.properties[field].type, 'string');
  assert.ok(!estimate.required.includes(field), `AllInOneEstimate.${field} must be nullable/additive.`);
}

assert.deepEqual(foundationCreationKeyQuery(' abc '), { creation_request_key: 'abc' });
assert.throws(() => foundationCreationKeyQuery(''), /creation_request_key/);

function makeEntity(seed = []) {
  let seq = seed.length;
  const rows = new Map(seed.map((row) => [row.id, structuredClone(row)]));
  return {
    rows,
    async create(data) {
      seq += 1;
      const row = { ...structuredClone(data), id: `r${seq}`, updated_date: `v${seq}`, created_date: `c${seq}` };
      rows.set(row.id, row);
      return structuredClone(row);
    },
    async get(id) {
      const row = rows.get(id);
      return row ? structuredClone(row) : null;
    },
    async updateMany(query, update) {
      const row = rows.get(query.id);
      if (!row || row.updated_date !== query.updated_date) return { updated: 0 };
      seq += 1;
      const saved = { ...row, ...structuredClone(update.$set), updated_date: `v${seq}` };
      rows.set(saved.id, saved);
      return { updated: 1 };
    },
  };
}

{
  const entity = makeEntity();
  const data = { creation_request_key: 'opp-create-1', title: 'Test' };
  const result = await createFoundationRecordWithRecovery({
    entity,
    data,
    readMatches: async () => [...entity.rows.values()].filter((r) => r.creation_request_key === data.creation_request_key),
    settleMs: 0,
  });
  assert.equal(result.status, 'created');
  const retry = await createFoundationRecordWithRecovery({
    entity,
    data,
    readMatches: async () => [...entity.rows.values()].filter((r) => r.creation_request_key === data.creation_request_key),
    settleMs: 0,
  });
  assert.equal(retry.status, 'reused');
  assert.equal(entity.rows.size, 1);
}

{
  const entity = makeEntity([
    { id:'a', creation_request_key:'dup', updated_date:'1' },
    { id:'b', creation_request_key:'dup', updated_date:'2' },
  ]);
  await assert.rejects(
    createFoundationRecordWithRecovery({
      entity,
      data:{ creation_request_key:'dup', title:'Duplicate' },
      readMatches: async () => [...entity.rows.values()].filter((r) => r.creation_request_key === 'dup'),
      settleMs:0,
    }),
    (error) => error instanceof OpportunityFoundationCreateAmbiguityError && error.code === 'OPPORTUNITY_FOUNDATION_CREATE_AMBIGUOUS'
  );
  assert.equal(entity.rows.size, 2, 'Ambiguous duplicate rows must never be auto-deleted.');
}

{
  const entity = makeEntity();
  const originalCreate = entity.create;
  entity.create = async (data) => {
    await originalCreate(data);
    throw new Error('response lost');
  };
  const result = await createFoundationRecordWithRecovery({
    entity,
    data:{ creation_request_key:'recover-1', title:'Recovered' },
    readMatches: async () => [...entity.rows.values()].filter((r) => r.creation_request_key === 'recover-1'),
    settleMs:0,
  });
  assert.equal(result.status, 'recovered');
  assert.equal(entity.rows.size, 1);
}

{
  const entity = makeEntity([{ id:'opp1', title:'Before', updated_date:'v1' }]);
  const current = await entity.get('opp1');
  const saved = await replaceFoundationFieldsIfUnchanged({
    entity,
    recordId:'opp1',
    expectedFields:expectedFoundationFields(current, { title:'After' }),
    nextFields:{ title:'After' },
  });
  assert.equal(saved.title, 'After');
}

{
  const entity = makeEntity([{ id:'opp1', title:'Concurrent', updated_date:'v1' }]);
  await assert.rejects(
    replaceFoundationFieldsIfUnchanged({
      entity,
      recordId:'opp1',
      expectedFields:{ title:'Before' },
      nextFields:{ title:'After' },
    }),
    (error) => error instanceof OpportunityFoundationFieldConflictError && error.code === 'OPPORTUNITY_FOUNDATION_FIELD_CONFLICT'
  );
  assert.equal((await entity.get('opp1')).title, 'Concurrent');
}

{
  const entity = makeEntity([{
    id:'req1',
    status:'ready',
    handoff_snapshot:{ customer:'Frozen Co' },
    handoff_snapshot_version:1,
    updated_date:'v1',
  }]);
  await assert.rejects(
    replaceEstimatingRequestFieldsIfUnchanged({
      entity,
      recordId:'req1',
      expectedFields:{ handoff_snapshot:{ customer:'Frozen Co' } },
      nextFields:{ handoff_snapshot:{ customer:'Changed Co' } },
    }),
    (error) => error instanceof OpportunityFoundationFieldConflictError && /frozen/.test(error.message)
  );
}

{
  const errors = foundationRelationshipErrors({
    opportunity:{ id:'opp1' },
    intake:{ opportunity_id:'opp1' },
    estimatingRequest:{ id:'req1', opportunity_id:'opp1' },
    workOrder:{ opportunity_id:'opp1', estimating_request_id:'req1' },
    estimate:{ opportunity_id:'opp1', estimating_request_id:'req1' },
  });
  assert.deepEqual(errors, []);

  const bad = foundationRelationshipErrors({
    opportunity:{ id:'opp1' },
    estimatingRequest:{ id:'req1', opportunity_id:'opp2' },
    workOrder:{ opportunity_id:'opp1', estimating_request_id:'req2' },
  });
  assert.equal(bad.length, 2);
}

console.log('Opportunity foundation validation: PASS');
