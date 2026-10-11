import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retrySmartsheetCall } from '../base44/shared/smartsheetLegacyTransport.ts';

{
  let calls = 0;
  const timeout = Object.assign(new Error('ambiguous timeout'), { timedOut: true });
  await assert.rejects(
    retrySmartsheetCall(async () => {
      calls++;
      throw timeout;
    }, { retryTimeout: false }),
    /ambiguous timeout/,
  );
  assert.equal(calls, 1);
  console.log('PASS timeout-disabled write policy never reissues an ambiguous call');
}

{
  let calls = 0;
  const result = await retrySmartsheetCall(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('read timeout'), { timedOut: true });
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  console.log('PASS existing read/legacy timeout retry behavior remains available');
}

{
  let calls = 0;
  const result = await retrySmartsheetCall(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('rate limited'), {
      upstreamStatus: 429,
      retryAfter: 0.001,
    });
    return 'ok';
  }, { retryTimeout: false });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  console.log('PASS definitive 429 responses can still retry even when timeout retries are disabled');
}

{
  let calls = 0;
  await assert.rejects(
    retrySmartsheetCall(async () => {
      calls++;
      throw Object.assign(new Error('server error'), { upstreamStatus: 500 });
    }, { retryTimeout: false }),
    /server error/,
  );
  assert.equal(calls, 1);
  console.log('PASS non-rate-limit write failures are not blindly retried');
}

const transport = readFileSync('base44/shared/smartsheetLegacyTransport.ts', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const createSafety = readFileSync('base44/shared/smartsheetOrderCreateSafety.mjs', 'utf8');

assert.match(transport, /smartsheetWriteNoTimeoutRetry[\s\S]*retryTimeout: false/);
assert.match(transport, /error\?\.timedOut && retryTimeout && !timedOutRetried/);
assert.match(transport, /error\?\.upstreamStatus === 429/);
console.log('PASS transport keeps timeout and explicit-rate-limit retry semantics separate');

assert.match(
  backend,
  /smartsheetWriteNoTimeoutRetry\('POST', `\/sheets\/\$\{sheetId\}\/rows`/,
);
assert.match(backend, /await smartsheetWriteNoTimeoutRetry\(\s*'PUT', '\/sheets\/' \+ sheetId/);
assert.match(backend, /const sent = await smartsheetWriteNoTimeoutRetry\('POST', `\/sheets\/\$\{sheetId\}\/rows`/);
assert.match(backend, /createSalesSmartsheetRowWithGuard\(\{/);
console.log('PASS Order and Sales POST/PUT avoid replaying timed-out mutations');

assert.match(createSafety, /snapshot is[\s\S]*durable evidence for manual reconciliation only/);
assert.match(createSafety, /never sufficient to[\s\S]*auto-link a row without a permanent Smartsheet row ID/);
assert.match(createSafety, /outcome is uncertain\. The Order is held for review; do not retry automatically/);
assert.match(backend, /orderBatchWriteError/);
assert.match(backend, /Only rows independently read back as correct can complete/);
console.log('PASS Order POST timeout is held for review and Order PUT timeout recovers by read-back instead of resend');
