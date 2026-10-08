import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { syncQueueRetryKind } from '../src/components/admin/syncRequestQueuePolicy.mjs';
import { retrySmartsheetCall } from '../base44/shared/smartsheetLegacyTransport.ts';

assert.equal(syncQueueRetryKind({ status: 409, message: 'Another Order Save & Sync is already running.' }), 'coordinator_busy');
assert.equal(syncQueueRetryKind({ response: { status: 429 }, message: 'rate limit' }), 'rate_limit');
assert.equal(syncQueueRetryKind({ status: 500, message: 'rate limit text only' }), 'rate_limit');
assert.equal(syncQueueRetryKind({ status: 409, message: 'The existing Order sync is stale and must be closed for review.' }), 'none');
assert.equal(syncQueueRetryKind({ status: 500, message: 'server failure' }), 'none');
console.log('PASS queue policy distinguishes coordinator contention from rate limits and stale-run review');

{
  let calls = 0;
  await assert.rejects(
    retrySmartsheetCall(async () => {
      calls++;
      throw Object.assign(new Error('rate limited'), { upstreamStatus: 429, retryAfter: 31 });
    }, { retryTimeout: false, maxRateLimitRetries: 3, maxRateLimitWaitSeconds: 30 }),
    /rate limited/,
  );
  assert.equal(calls, 1);
  console.log('PASS Order write does not retry before a Retry-After longer than its bounded safe wait');
}

{
  let calls = 0;
  const result = await retrySmartsheetCall(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('rate limited'), { upstreamStatus: 429, retryAfter: 0.001 });
    return 'ok';
  }, { retryTimeout: false, maxRateLimitRetries: 3, maxRateLimitWaitSeconds: 30 });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  console.log('PASS short definitive 429 backoff stays inside one serialized backend invocation');
}

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const transport = readFileSync('base44/shared/smartsheetLegacyTransport.ts', 'utf8');
const queue = readFileSync('src/components/admin/syncRequestQueue.js', 'utf8');
const orderClient = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
const spreadsheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');

const claim = backend.slice(
  backend.indexOf('async function claimSyncRun'),
  backend.indexOf('const ALERT_SETTING_KEY'),
);
assert.match(claim, /currentIsOrderRun/);
assert.match(claim, /current\?\.action === 'push_saved_orders'/);
assert.match(claim, /Another Order Save & Sync is already running/);
assert.match(claim, /stale and must be closed for review before another sync can start/);
assert.ok(
  claim.indexOf('if (currentIsOrderRun)') < claim.indexOf('const abandoned ='),
  'Order serialization guard must run before legacy abandoned-run reclaim logic'
);
console.log('PASS concurrent users cannot reclaim an active Order coordinator during 429 backoff');

assert.match(transport, /maxRateLimitWaitSeconds = Number\.POSITIVE_INFINITY/);
assert.match(transport, /if \(backoffSeconds > maxRateLimitWaitSeconds\) throw error/);
assert.match(transport, /maxRateLimitWaitSeconds: 30/);
assert.match(transport, /maxRateLimitRetries: 3/);
console.log('PASS Order transport bounds individual 429 waits without changing legacy defaults');

assert.match(queue, /let tail = Promise\.resolve\(\)/);
assert.match(queue, /const next = tail\.then\(\(\) => run\(payload, options\)\)/);
assert.match(queue, /retryRateLimit = true/);
assert.match(queue, /retryCoordinatorBusy = true/);
assert.match(orderClient, /retryRateLimit: false/);
assert.match(orderClient, /retryCoordinatorBusy: true/);
assert.match(spreadsheet, /if \(syncInFlightRef\.current \|\| saveInFlightRef\.current \|\| dateNeededSaveInFlightRef\.current\) return false/);
console.log('PASS same-browser clicks serialize, Order actions do not replay wholesale after 429, and coordinator-busy retries remain patient');

const savedOrdersAction = backend.slice(
  backend.indexOf("if (action === 'push_saved_orders')"),
  backend.indexOf("if (action === 'push_saved_sales')"),
);
assert.match(savedOrdersAction, /await claimInvocationRun\(/);
assert.match(savedOrdersAction, /assertRunOwnership: async \(\) => assertSyncRunOwnership\(base44, startedAt\)/);
console.log('PASS each explicit Order Save & Sync owns one backend coordinator through its write lifecycle');
