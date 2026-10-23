import test from 'node:test';
import assert from 'node:assert/strict';
import { jitteredDelay, shouldRunFocusRefresh } from '../src/lib/pollingSchedule.mjs';

test('jitteredDelay returns the lower bound when rand is 0', () => {
  assert.equal(jitteredDelay(10000, 0.2, () => 0), 8000);
});

test('jitteredDelay returns the base when rand is 0.5', () => {
  assert.equal(jitteredDelay(10000, 0.2, () => 0.5), 10000);
});

test('jitteredDelay stays under the upper bound when rand is 0.999', () => {
  const value = jitteredDelay(10000, 0.2, () => 0.999);
  assert.ok(value >= 8000);
  assert.ok(value <= 12000);
});

test('jitteredDelay stays within bounds across random values', () => {
  for (const rand of [0.1, 0.25, 0.75, 0.9]) {
    const value = jitteredDelay(5000, 0.2, () => rand);
    assert.ok(value >= 4000, `${value} below lower bound`);
    assert.ok(value <= 6000, `${value} above upper bound`);
  }
});

test('jitteredDelay with jitter 0 returns the base delay', () => {
  for (const rand of [0, 0.3, 0.999]) {
    assert.equal(jitteredDelay(7000, 0, () => rand), 7000);
  }
});

test('jitteredDelay defaults to jitter 0.2', () => {
  assert.equal(jitteredDelay(10000, undefined, () => 0), 8000);
  assert.equal(jitteredDelay(10000, undefined, () => 0.5), 10000);
});

test('shouldRunFocusRefresh enforces the minimum gap', () => {
  assert.equal(shouldRunFocusRefresh(1000, 16000, 15000), true);
  assert.equal(shouldRunFocusRefresh(1000, 15999, 15000), false);
  assert.equal(shouldRunFocusRefresh(0, 15000, 15000), true);
});
