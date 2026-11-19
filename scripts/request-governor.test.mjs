import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGovernor, isPlatformRateLimit, rateLimitStatus } from '../src/api/requestGovernor.mjs';

const err429 = () => Object.assign(new Error('too many requests'), { status: 429 });

function fakeSleep(record) {
  return (ms) => { record.push(ms); return Promise.resolve(); };
}

test('run never exceeds maxConcurrent and limitConcurrency:false bypasses the cap', async () => {
  const delays = [];
  const governor = createRequestGovernor({ maxConcurrent: 3, sleep: fakeSleep(delays) });
  let active = 0;
  let peak = 0;
  const work = () => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 5));
    active -= 1;
    return 'ok';
  };
  await Promise.all(Array.from({ length: 20 }, () => governor.run('limited', work())));
  assert.equal(peak, 3);
  assert.equal(governor.stats.inFlight, 0);
  assert.equal(governor.stats.queued, 0);

  active = 0;
  peak = 0;
  await Promise.all(Array.from({ length: 10 }, () =>
    governor.run('unlimited', work(), { limitConcurrency: false })));
  assert.ok(peak > 3, `expected bypass to exceed cap, peak=${peak}`);
});

test('429 twice then success resolves with two recorded retries and backoff delays', async () => {
  const delays = [];
  const governor = createRequestGovernor({ sleep: fakeSleep(delays), rand: () => 0.5 });
  let calls = 0;
  const result = await governor.run('flaky', async () => {
    calls += 1;
    if (calls <= 2) throw err429();
    return 'done';
  }, { retryOnRateLimit: true });
  assert.equal(result, 'done');
  assert.equal(governor.stats.retries, 2);
  assert.deepEqual(delays, [1000, 2000]);
});

test('429 forever rejects after maxRetries with ccsGovernorRetried and gaveUp', async () => {
  const delays = [];
  const governor = createRequestGovernor({ sleep: fakeSleep(delays), rand: () => 0.5 });
  await assert.rejects(
    governor.run('always', () => { throw err429(); }, { retryOnRateLimit: true }),
    (err) => {
      assert.equal(err.ccsGovernorRetried, 4);
      return true;
    });
  assert.equal(governor.stats.retries, 4);
  assert.equal(governor.stats.gaveUp, 1);
  assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
});

test('429 with retryOnRateLimit:false rejects immediately without sleeping', async () => {
  const delays = [];
  const governor = createRequestGovernor({ sleep: fakeSleep(delays) });
  await assert.rejects(governor.run('noretry', () => { throw err429(); }));
  assert.deepEqual(delays, []);
  assert.equal(governor.stats.rateLimited, 1);
  assert.equal(governor.stats.retries, 0);
});

test('non-rate-limit errors are not retried', async () => {
  const delays = [];
  const governor = createRequestGovernor({ sleep: fakeSleep(delays) });
  let calls = 0;
  await assert.rejects(
    governor.run('boom', () => { calls += 1; throw new Error('server exploded'); }, { retryOnRateLimit: true }),
    /server exploded/);
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
  assert.equal(governor.stats.rateLimited, 0);
});

test('message-only rate limit errors are detected', () => {
  assert.equal(isPlatformRateLimit(new Error('Rate limit exceeded')), true);
  assert.equal(isPlatformRateLimit({ response: { data: { error: 'Too many requests' } } }), true);
  assert.equal(isPlatformRateLimit(new Error('other')), false);
  assert.equal(rateLimitStatus({ response: { status: 429 } }), 429);
});

test('stats.byLabel counts runs per label', async () => {
  const governor = createRequestGovernor({ sleep: fakeSleep([]) });
  await governor.run('a', () => 1);
  await governor.run('a', () => 2);
  await governor.run('b', () => 3);
  assert.equal(governor.stats.byLabel.a, 2);
  assert.equal(governor.stats.byLabel.b, 1);
  assert.equal(governor.stats.total, 3);
});
