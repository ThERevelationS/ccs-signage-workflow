// Synthetic-only Work Pause overlay session, refresh and event ordering regression.
// No live Base44 function calls or production records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const source = readFileSync(new URL('../src/components/timeclock/WorkPauseOverlay.jsx', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const require = createRequire(import.meta.url);
const calls = [], listeners = new Map();
const windowStub = {
  addEventListener(name, callback) { listeners.set(name, callback); },
  removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  dispatchEvent(event) { listeners.get(event.type)?.(event); },
};
const documentStub = { visibilityState: 'visible',
  addEventListener() {}, removeEventListener() {},
};
const icon = () => React.createElement('svg');
const Button = ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children);
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => ({
    '@/api/base44Client': { base44: { functions: { invoke: (fn, payload) => new Promise((resolve, reject) => {
      assert.equal(fn, 'timeClockAction'); calls.push({ payload, resolve, reject });
    }) } } },
    '@/components/auth/EmailGate': { useAuth: () => ({ currentUser: null, sessionToken: '' }) },
    '@/components/ui/button': { Button },
    'lucide-react': Object.fromEntries(['Clock3', 'Loader2', 'Pause', 'Play', 'X'].map((name) => [name, icon])),
  })[id] || require(id),
  console, window: windowStub, document: documentStub,
  Date, Math, Promise, Object, Number, String, Map, Set,
  setTimeout: () => 1, clearTimeout: () => {},
  setInterval: () => 1, clearInterval: () => {},
  localStorage: { setItem() {} },
  CustomEvent: class { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } },
}, { filename: 'synthetic-work-pause-overlay.js' });
const Overlay = module.exports.default;
assert.equal(typeof Overlay, 'function');

const first = { email: 'first@synthetic.invalid', full_name: 'First Worker' };
const second = { email: 'second@synthetic.invalid', full_name: 'Second Worker' };
const paused = (user, id) => ({ data: {
  success: true, status: 'clocked_in', work_pause_status: 'paused',
  user, entry: { id: `entry-${id}`, user_email: user.email, clock_in: '2026-10-13T12:00:00.000Z' },
  active_work_pause: { id: `pause-${id}`, user_email: user.email, started_at: '2026-10-13T13:00:00.000Z' },
  work_pause_summary: { total_minutes: 0 },
  break_summary: { unpaid_minutes: 0 },
} });
const working = (user) => ({ data: {
  success: true, status: 'clocked_in', work_pause_status: 'working', user,
  entry: { id: 'entry-working', user_email: user.email },
} });
const propsFor = (user, token) => ({
  userOverride: user, credentialOverride: { sessionToken: token },
});
const visible = (tree) => JSON.stringify(tree.toJSON());
let renderer;
await act(async () => {
  renderer = TestRenderer.create(React.createElement(Overlay, propsFor(first, 'session-A')));
});
assert.equal(calls.length, 1);
assert.equal(calls[0].payload.action, 'status');
assert.equal(calls[0].payload.target_email, first.email);

await act(async () => {
  renderer.update(React.createElement(Overlay, propsFor(second, 'session-B')));
});
assert.equal(calls.length, 2);
assert.equal(calls[1].payload.target_email, second.email);
await act(async () => { calls[1].resolve(paused(second, 'B')); });
assert.match(visible(renderer), /WORK PAUSED/);
assert.match(visible(renderer), /Resume Work/);
await act(async () => { calls[0].resolve(paused(first, 'A')); });
assert.doesNotMatch(visible(renderer), /pause-A|First Worker/,
  'Late status from a different employee must not overwrite the new employee Work Pause');
assert.match(visible(renderer), /WORK PAUSED/);
console.log('PASS previous employee status cannot overwrite new Work Pause session');

await act(async () => { listeners.get('focus')(); });
assert.equal(calls.length, 3);
await act(async () => { listeners.get('focus')(); });
assert.equal(calls.length, 4);
await act(async () => { calls[3].resolve(working(second)); });
assert.doesNotMatch(visible(renderer), /WORK PAUSED/);
await act(async () => { calls[2].resolve(paused(second, 'stale')); });
assert.doesNotMatch(visible(renderer), /WORK PAUSED/,
  'Older paused status must not reopen guard after newer working confirmation');
console.log('PASS overlapping Work Pause refreshes accept only latest authoritative state');

await act(async () => { listeners.get('focus')(); });
assert.equal(calls.length, 5);
await act(async () => { calls[4].resolve(paused(second, 'latest')); });
assert.match(visible(renderer), /WORK PAUSED/);
const beforeForeignEvent = visible(renderer);
await act(async () => {
  listeners.get('ccs-timeclock-work-pause-changed')({
    detail: { success: true, status: 'clocked_in', work_pause_status: 'working',
      user: first, entry: { user_email: first.email } },
  });
});
assert.match(visible(renderer), /WORK PAUSED/,
  'Another employee Resume Work event may not dismiss this employee paused guard');
// It may schedule a fresh status query; complete that harmlessly.
if (calls.length > 5) await act(async () => { calls.at(-1).resolve(paused(second, 'latest')); });
assert.match(visible(renderer), /WORK PAUSED/);
assert.ok(beforeForeignEvent.includes('WORK PAUSED'));
console.log('PASS foreign employee pause event cannot dismiss authoritative paused guard');
await act(async () => { renderer.unmount(); });
console.log('PASS 3/3 Work Pause overlay session/refresh/event scenarios');
