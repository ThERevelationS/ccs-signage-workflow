import assert from 'node:assert/strict';
import { assignMissingEstimateNumber, needsEstimateNumber, numberForEstimateAttempt } from '../src/components/estimator/estimateNumberAssignment.js';
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from '../src/components/estimator/estimatePersistence.js';

{
  const attempt = { estimateNumber: '' };
  let issues = 0;
  const issue = async () => { issues++; return { data: { number: 'EST-1' } }; };
  assert.equal(await numberForEstimateAttempt(attempt, issue), 'EST-1');
  assert.equal(await numberForEstimateAttempt(attempt, issue), 'EST-1');
  assert.equal(issues, 1, 'a retry reuses the creation attempt number');
  await assert.rejects(numberForEstimateAttempt({ estimateNumber: '' }, async () => ({})), /could not be issued/);
  const concurrent = { estimateNumber: '' };
  let resolveIssue;
  let concurrentIssues = 0;
  const pendingIssue = () => { concurrentIssues++; return new Promise((resolve) => { resolveIssue = resolve; }); };
  const first = numberForEstimateAttempt(concurrent, pendingIssue);
  const second = numberForEstimateAttempt(concurrent, pendingIssue);
  await Promise.resolve();
  resolveIssue({ number: 'EST-2' });
  assert.deepEqual(await Promise.all([first, second]), ['EST-2', 'EST-2']);
  assert.equal(concurrentIssues, 1, 'overlapping calls issue only one number');
}

function fixture(overrides = {}, onUpdate) {
  let row = { id: 'estimate', status: 'draft', deleted: false, estimate_number: '', updated_date: 'v1', ...overrides };
  let issued = 0;
  let writes = 0;
  const entity = {
    get: async () => ({ ...row }),
    updateMany: async (query, update) => {
      writes++;
      if (onUpdate) {
        const changed = onUpdate({ ...row });
        if (changed) row = changed;
      }
      if (query.id !== row.id || query.updated_date !== row.updated_date) return { updated: 0 };
      row = { ...row, ...update.$set, updated_date: 'v2' };
      return { updated: 1 };
    },
  };
  const run = () => assignMissingEstimateNumber({
    entity, estimateId: 'estimate',
    issueNumber: async () => { issued++; return 'EST-123'; },
    saveNumber: (current, number) => {
      const nextFields = { estimate_number: number };
      return replaceEstimateFieldsIfUnchanged({
        entity, estimateId: current.id, nextFields,
        expectedFields: expectedEstimateFields(current, nextFields),
        guardFields: { status: current.status, deleted: current.deleted },
        maxAttempts: 1,
      });
    },
  });
  return { run, counts: () => ({ issued, writes }), row: () => row };
}

{
  const f = fixture();
  assert.equal((await f.run()).estimate_number, 'EST-123');
  assert.deepEqual(f.counts(), { issued: 1, writes: 1 });
}
for (const overrides of [{ status: 'archived' }, { deleted: true }, { estimate_number: 'EXISTING' }]) {
  const f = fixture(overrides);
  assert.equal(needsEstimateNumber(await f.run()), false);
  assert.deepEqual(f.counts(), { issued: 0, writes: 0 });
}
{
  const f = fixture({}, (row) => ({ ...row, estimate_number: 'OTHER', updated_date: 'v-other' }));
  assert.equal((await f.run()).estimate_number, 'OTHER');
  assert.equal(f.row().estimate_number, 'OTHER');
  assert.deepEqual(f.counts(), { issued: 1, writes: 1 });
}
for (const change of [{ status: 'archived' }, { deleted: true }]) {
  const f = fixture({}, (row) => ({ ...row, ...change, updated_date: 'v-other' }));
  await f.run();
  assert.equal(f.row().estimate_number, '');
  assert.deepEqual(f.counts(), { issued: 1, writes: 1 });
}
{
  const f = fixture({}, (row) => ({ ...row, project_name: 'Changed', updated_date: 'v-other' }));
  await assert.rejects(f.run(), (error) => error.latestEstimate.project_name === 'Changed');
  assert.equal(f.row().estimate_number, '');
  assert.deepEqual(f.counts(), { issued: 1, writes: 1 });
}
console.log('PASS estimate number assignment: eligibility, CAS, races, and conflict reload');
