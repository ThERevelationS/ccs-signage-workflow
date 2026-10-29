// Synthetic-only EmployeeTodayCard status-read fencing regression.
// No live Base44 function calls or production records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const source = readFileSync(new URL('../src/components/timeclock/EmployeeTodayCard.jsx', import.meta.url), 'utf8');

// ---------- static contract: reads are fenced by sequence, scope, and identity ----------
assert.match(source, /const statusSeqRef = useRef\(0\)/);
assert.match(source, /statusScopeRef\.current = `\$\{sessionToken \|\| ""\}\|\$\{String\(user\?\.email \|\| ""\)\.trim\(\)\.toLowerCase\(\)\}`/);
assert.match(source, /const requestSeq = \+\+statusSeqRef\.current/);
assert.match(source, /if \(requestSeq !== statusSeqRef\.current \|\| statusScopeRef\.current !== requestScope\) return;/);
assert.match(source, /String\(data\?\.user\?\.email \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== requestEmail\) return;/);
assert.match(source, /statusSeqRef\.current \+= 1;/);
assert.match(source, /setStatusData\(null\)/);
console.log('PASS status reads are fenced by request sequence, session/employee scope, and response identity');

// ---------- behavioural harness ----------
const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const require = createRequire(import.meta.url);
const calls = [], listeners = new Map();
const windowStub = {
  addEventListener(name, callback) { listeners.set(name, callback); },
  removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  dispatchEvent(event) { listeners.get(event.type)?.(event); },
};
const icon = () => React.createElement('svg');
const Badge = ({ children }) => React.createElement('span', null, children);
const Button = ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children);
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => ({
    '@/api/base44Client': { base44: { functions: { invoke: (fn, payload) => new Promise((resolve, reject) => {
      assert.equal(fn, 'timeClockAction'); calls.push({ payload, resolve, reject });
    }) } } },
    '@/components/ui/badge': { Badge },
    '@/components/ui/button': { Button },
    '@/lib/usePolling': { usePolling: () => {} },
    'lucide-react': new Proxy({}, { get: () => icon }),
  })[id] || require(id),
  console, window: windowStub, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  Date, Math, Promise, Object, Number, String, Map, Set, JSON, Array, Boolean,
  setTimeout: () => 1, clearTimeout: () => {},
  setInterval: () => 1, clearInterval: () => {},
  localStorage: { setItem() {}, getItem: () => null, removeItem() {} },
  CustomEvent: class { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } },
}, { filename: 'synthetic-employee-today-card.js' });
const Card = module.exports.default;
assert.equal(typeof Card, 'function');

const alice = { email: 'alice@synthetic.invalid', full_name: 'Alice Worker' };
const bob = { email: 'bob@synthetic.invalid', full_name: 'Bob Worker' };
const workingStatus = (user, id = 'a') => ({ data: {
  success: true, status: 'clocked_in', work_pause_status: 'working', break_status: 'working', user,
  entry: { id: `entry-${id}`, user_email: user.email, clock_in: '2026-10-22T08:00:00.000Z' },
  break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
  work_pause_summary: { count: 0, total_minutes: 0 },
} });
const pausedStatus = (user, id = 'a') => ({ data: {
  success: true, status: 'clocked_in', work_pause_status: 'paused', break_status: 'working', user,
  entry: { id: `entry-${id}`, user_email: user.email, clock_in: '2026-10-22T08:00:00.000Z' },
  active_work_pause: { id: `pause-${id}`, user_email: user.email, started_at: '2026-10-22T09:00:00.000Z' },
  break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
  work_pause_summary: { count: 0, total_minutes: 0 },
} });
const propsFor = (user) => ({ user, sessionToken: `token-${user.email}`, timeEntries: [], correctionRequests: [] });
const elementFor = (user) => React.createElement(Card, propsFor(user));

const textOf = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.children);
};

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

// ---------- scenario: employee switch cannot bleed the previous employee's status ----------
{
  calls.length = 0;
  let renderer;
  await act(async () => { renderer = TestRenderer.create(elementFor(alice)); await flush(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.action, 'status');
  assert.equal(calls[0].payload.target_email, alice.email);

  await act(async () => { renderer.update(elementFor(bob)); await flush(); });
  assert.equal(calls.length, 2, 'an employee switch must issue a new status read');
  assert.equal(calls[1].payload.target_email, bob.email);
  assert.equal(calls[1].payload.session_token, `token-${bob.email}`);
  assert.ok(textOf(renderer.toJSON()).includes('Clocked Out'), "the previous employee's status must be cleared on switch");

  await act(async () => { calls[0].resolve(pausedStatus(alice)); await flush(); });
  assert.ok(!textOf(renderer.toJSON()).includes('Work Paused'), "alice's stale response must not surface in bob's card");
  assert.ok(textOf(renderer.toJSON()).includes('Clocked Out'));

  await act(async () => { calls[1].resolve(workingStatus(bob)); await flush(); });
  assert.ok(textOf(renderer.toJSON()).includes('Working'), "bob's verified status must display");

  renderer.unmount();
}
console.log('PASS an employee switch cannot bleed the previous employee\u2019s in-flight status read');

// ---------- scenario: an older overlapping read cannot overwrite a newer one ----------
{
  calls.length = 0; listeners.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(elementFor(alice)); await flush(); });
  assert.equal(calls.length, 1);

  await act(async () => {
    windowStub.dispatchEvent({ type: 'ccs-timeclock-work-pause-changed' });
    await flush();
  });
  assert.equal(calls.length, 2, 'a pause-change event must trigger a fresh status read');

  await act(async () => { calls[1].resolve(pausedStatus(alice, 'new')); await flush(); });
  assert.ok(textOf(renderer.toJSON()).includes('Work Paused'));

  await act(async () => { calls[0].resolve(workingStatus(alice, 'old')); await flush(); });
  assert.ok(textOf(renderer.toJSON()).includes('Work Paused'),
    'the older overlapping read must not overwrite the newer verified status');

  renderer.unmount();
}
console.log('PASS an older overlapping status read cannot overwrite a newer verified status');

// ---------- scenario: a response for a different employee is rejected outright ----------
{
  calls.length = 0;
  let renderer;
  await act(async () => { renderer = TestRenderer.create(elementFor(alice)); await flush(); });
  assert.equal(calls.length, 1);

  await act(async () => { calls[0].resolve(workingStatus(bob)); await flush(); });
  const text = textOf(renderer.toJSON());
  assert.ok(!text.includes('Working'), 'a response identifying a different employee must not be applied');
  assert.ok(text.includes('Clocked Out'));

  renderer.unmount();
}
console.log('PASS a status response identifying a different employee fails closed');

// ---------- scenario: a superseded read cannot surface its error over a newer read ----------
{
  calls.length = 0; listeners.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(elementFor(alice)); await flush(); });
  assert.equal(calls.length, 1);

  await act(async () => {
    windowStub.dispatchEvent({ type: 'ccs-timeclock-work-pause-changed' });
    await flush();
  });
  assert.equal(calls.length, 2);

  await act(async () => {
    calls[0].reject(Object.assign(new Error('stale network failure'), { response: { data: { error: 'stale network failure' } } }));
    await flush();
  });
  assert.ok(!textOf(renderer.toJSON()).includes('stale network failure'),
    'a superseded read must not project its error over the newer pending read');

  await act(async () => { calls[1].resolve(workingStatus(alice)); await flush(); });
  const text = textOf(renderer.toJSON());
  assert.ok(text.includes('Working'));
  assert.ok(!text.includes('stale network failure'));

  renderer.unmount();
}
console.log('PASS a superseded status read cannot project its error over a newer read');

// ---------- scenario: stale read cannot clear the loading flag of a newer read ----------
{
  calls.length = 0; listeners.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(elementFor(alice)); await flush(); });
  assert.equal(calls.length, 1);

  await act(async () => {
    windowStub.dispatchEvent({ type: 'ccs-timeclock-work-pause-changed' });
    await flush();
  });
  assert.equal(calls.length, 2);

  await act(async () => { calls[0].resolve(workingStatus(alice, 'old')); await flush(); });
  const refreshButton = renderer.root.findAll(node => node.type === 'button')[0];
  assert.equal(refreshButton.props.disabled, true,
    'the stale read must not release the loading state owned by the newer read');
  assert.ok(!textOf(renderer.toJSON()).includes('Working'));

  await act(async () => { calls[1].resolve(workingStatus(alice, 'new')); await flush(); });
  assert.equal(renderer.root.findAll(node => node.type === 'button')[0].props.disabled, false);
  assert.ok(textOf(renderer.toJSON()).includes('Working'));

  renderer.unmount();
}
console.log('PASS a superseded status read cannot release the loading flag owned by a newer read');

console.log('PASS 6/6 Employee Today Card status-read fencing scenarios');
