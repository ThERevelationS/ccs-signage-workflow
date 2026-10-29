import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyPriorUncertainOrderPull } from '../base44/shared/smartsheetOrderPriorUncertainPull.mjs';

const evidence = {
  attempted_batches: 2,
  acknowledged_unverified_batches: 1,
  write_uncertain_batches: 1,
  recent_batches: [
    { batch_number: 1, state: 'acknowledged_unverified', base44_order_ids: ['order-a'], smartsheet_row_ids: ['1001'] },
    { batch_number: 2, state: 'write_uncertain', base44_order_ids: ['order-b'], smartsheet_row_ids: ['1002'] },
  ],
};
const prior = {
  status: 'needs_review', progress_dataset: 'orders', progress_direction: 'pull',
  order_pull_batch_evidence: evidence, started_at: '2026-10-08T12:00:00.000Z',
  results: [{ dataset: 'orders', direction: 'pull', skipped: true, outcome_unverified: true }],
};
const classify = (previous, requested = true) =>
  classifyPriorUncertainOrderPull(previous, { orderPullRequested: requested });
const blocked = classify(prior);
assert.equal(blocked.blocked, true);
assert.equal(blocked.attemptedBatches, 2);
assert.match(blocked.reason, /Permanent Base44 and Smartsheet row evidence is preserved/);
assert.match(blocked.reason, /No automatic retry was started/);
assert.equal(classify({ ...prior, status: 'failed' }).blocked, true);
assert.equal(classify({ ...prior, recovered_stale_run: true }).blocked, true);
assert.equal(classify({ ...prior, order_pull_batch_evidence: { recent_batches: evidence.recent_batches } }).blocked, true,
  'Missing count cannot bypass the recent attempted-ID evidence');
assert.equal(classify({ ...prior, status: 'completed' }).blocked, false,
  'A fully completed and verified previous pull does not block the next');
assert.equal(classify({ ...prior, status: 'running' }).blocked, false,
  'Existing running-coordinator guard remains responsible for active runs');
assert.equal(classify({ ...prior, order_pull_batch_evidence: null }).blocked, false);
assert.equal(classify({ ...prior, order_pull_batch_evidence: { attempted_batches: 0, recent_batches: [] } }).blocked, false);
assert.equal(classify(null).blocked, false);
assert.equal(classify(prior, false).blocked, false,
  'Sales-only and unrelated coordinator consumers are unchanged');
assert.equal(classify({ ...prior, results: [], status: 'needs_review' }).blocked, true,
  'An interrupted pull may have no completed results but retains batch evidence');
const verifiedForRun = { state: 'verified_complete', run_started_at: prior.started_at };
assert.equal(classifyPriorUncertainOrderPull(prior, { orderPullRequested: true, verifiedEvidence: verifiedForRun }).blocked, false,
  'Independent verified-complete evidence for the same run releases the gate');
assert.equal(classifyPriorUncertainOrderPull(prior, {
  orderPullRequested: true,
  verifiedEvidence: { state: 'verified_complete', run_started_at: '2026-10-08T13:00:00.000Z' },
}).blocked, true, 'Verified evidence for a different run must not release the gate');
assert.equal(classifyPriorUncertainOrderPull(prior, {
  orderPullRequested: true,
  verifiedEvidence: { state: 'unresolved', run_started_at: prior.started_at },
}).blocked, true, 'Unresolved independent evidence still blocks');
assert.equal(classifyPriorUncertainOrderPull({ ...prior, started_at: undefined }, {
  orderPullRequested: true, verifiedEvidence: verifiedForRun,
}).blocked, true, 'Missing run identity cannot be matched to verified evidence');
console.log('PASS uncertain prior Order pull blocks new Order pulls while preserving prior status, completed runs and Sales-only claims');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const claimStart = backend.indexOf('async function claimSyncRun(');
const claimEnd = backend.indexOf('const ALERT_SETTING_KEY', claimStart);
assert.ok(claimStart > -1 && claimEnd > claimStart);
const claim = backend.slice(claimStart, claimEnd);
const priorCheck = claim.indexOf('classifyPriorUncertainOrderPull(current,');
const guard = claim.indexOf('if (priorOrderPull.blocked)');
const overwrite = claim.indexOf('entities.GlobalSettings.updateMany(');
assert.ok(priorCheck > 0 && guard > priorCheck && overwrite > guard,
  'Prior evidence must be checked before replacing the coordinator status');
assert.match(claim, /orderPullRequested: status\?\.order_pull_requested === true/);
assert.match(claim, /readOrderPullEvidenceStore\(base44\.asServiceRole\.entities\.GlobalSettings\)/,
  'A blocked prior must consult independent verified evidence before refusing');
assert.match(claim, /verifiedEvidence: evidenceRecord\?\.setting_value/);
assert.match(claim, /throw Object\.assign\(new Error\(priorOrderPull\.reason\), \{ status: 409 \}\)/);
const main = backend.slice(backend.indexOf("if (action === 'run_sync' || action === 'push_dataset' || action === 'pull_dataset')"));
assert.match(main, /order_pull_requested: steps\.some\(step => step\.dataset === 'orders' && step\.direction === 'pull'\)/);
assert.match(backend, /action === 'pull_dataset' && body\?\.dataset === 'orders'/);
assert.match(claim, /if \(currentIsOrderRun\)/);
console.log('PASS Order pull and combined Order-containing runs are preflight-guarded before CAS claim; Sales-only flows preserved');
