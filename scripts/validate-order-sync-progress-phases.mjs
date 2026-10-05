import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderSyncLiveProgress, orderSyncPhaseLabel } from '../src/components/orders/orderSyncLiveProgress.mjs';
import { retrySmartsheetCall } from '../base44/shared/smartsheetLegacyTransport.ts';

assert.equal(orderSyncPhaseLabel('waiting_rate_limit'), 'Waiting for Smartsheet');
assert.equal(orderSyncPhaseLabel('retrying'), 'Retrying Smartsheet');
assert.equal(orderSyncPhaseLabel('verifying'), 'Verifying Smartsheet');
assert.equal(orderSyncPhaseLabel('confirming'), 'Confirming Base44');
assert.equal(orderSyncPhaseLabel('needs_review'), 'Needs review');
assert.equal(orderSyncPhaseLabel('unknown'), '');

const view = orderSyncLiveProgress({
  status: 'running',
  total_steps: 4,
  completed_steps: 3,
  progress_dataset: 'orders',
  progress_phase: 'waiting_rate_limit',
  progress_current: 5,
  progress_total: 5,
  progress_fraction: 0.54,
  progress_item_label: 'Waiting for Smartsheet',
  progress_detail: 'Rate limited: waiting 10s before write retry 1/3',
  progress_updated_at: '2026-10-05T01:40:00.000Z',
}, { enabled: true, now: Date.parse('2026-10-05T01:40:01.000Z') });
assert.equal(view.phaseLabel, 'Waiting for Smartsheet');
assert.equal(view.percent, 88.5);
assert.equal(view.detail, 'Rate limited: waiting 10s before write retry 1/3');
assert.equal(view.stalled, false);
console.log('PASS explicit backend phase fraction keeps granular progress moving during rate-limit wait');

{
  let calls = 0;
  const events = [];
  const result = await retrySmartsheetCall(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('rate limited'), { upstreamStatus: 429, retryAfter: 0.001 });
    return 'ok';
  }, {
    retryTimeout: false,
    maxRateLimitRetries: 3,
    maxRateLimitWaitSeconds: 30,
    onRateLimitWait: async event => events.push(['wait', event.attempt, event.waitSeconds]),
    onRateLimitRetry: async event => events.push(['retry', event.attempt, event.waitSeconds]),
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(events.map(event => event.slice(0, 2)), [['wait', 1], ['retry', 1]]);
  console.log('PASS transport emits live wait and retry lifecycle callbacks around a safe 429 retry');
}

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const transport = readFileSync('base44/shared/smartsheetLegacyTransport.ts', 'utf8');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');

assert.match(transport, /onRateLimitWait = null/);
assert.match(transport, /onRateLimitRetry = null/);
assert.match(transport, /await onRateLimitWait\(\{ attempt: rateLimitRetries, waitSeconds: backoffSeconds, retryAfterSeconds \}\)/);
assert.match(transport, /await onRateLimitRetry\(\{ attempt: rateLimitRetries, waitSeconds: backoffSeconds \}\)/);

for (const phase of ['backup','reading','writing','waiting_rate_limit','retrying','verifying','confirming','needs_review']) {
  assert.match(backend, new RegExp("phase: '" + phase + "'"));
}
assert.match(backend, /phase: \/\^\\d\+\$\/\.test\(rowId\) \? 'checking' : 'create'/);
assert.match(backend, /Smartsheet rate limit: waiting \$\{waitSeconds\}s before create retry \$\{attempt\}\/3/);
assert.match(backend, /Rate limited: waiting \$\{waitSeconds\}s before write retry \$\{attempt\}\/3/);
assert.match(backend, /Verifying Smartsheet row \$\{verification\.rowId\} · \$\{verifyIndex \+ 1\}\/\$\{remoteChecks\.length\}/);
assert.match(backend, /Saving verified sync metadata in Base44 with version protection/);
assert.match(backend, /progress_fraction: Number\.isFinite\(Number\(progress\?\.fraction\)\)/);
assert.match(backend, /Order sync needs review/);
console.log('PASS Order backend publishes write, backoff, retry, verification, Base44 confirmation and review stages');

assert.match(widget, /const progressPhaseLabel = reconnectingStatus \? 'Reconnecting to sync status' : orderProgress\.phaseLabel/);
assert.match(widget, /progressPhaseLabel \|\| currentStepLabel/);
assert.match(widget, /isRunning && progressDetail/);
assert.match(widget, /\{progressDetail\}/);
console.log('PASS compact Order sync toast shows the live phase and detailed current operation');

const salesCreate = backend.match(/const result = await smartsheetWrite\('POST', `\/sheets\/\$\{sheetId\}\/rows`/)?.[0];
assert.ok(salesCreate, 'Sales create should remain on its existing transport');
console.log('PASS Sales write path remains outside the Order-only progress/retry hooks');
