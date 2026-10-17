// Synthetic-only Global Work Pause control event/session regression.
// No live Base44 endpoints or Time Clock records are used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const source = readFileSync(new URL('../src/components/timeclock/GlobalWorkPauseControl.jsx', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const require = createRequire(import.meta.url);
const calls = [];
const listeners = new Map();
const storage = new Map();
let authSession = {
  currentUser: { email: 'first@synthetic.invalid' },
  sessionToken: 'signed-session-A',
};
const windowStub = {
  addEventListener(name, callback) { listeners.set(name, callback); },
  removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  dispatchEvent(event) { listeners.get(event.type)?.(event); },
};
const icon = () => React.createElement('svg');
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => ({
    '@/api/base44Client': { base44: { functions: { invoke: (name, payload) => new Promise((resolve, reject) => {
      assert.equal(name, 'timeClockAction');
      calls.push({ payload, resolve, reject });
    }) } } },
    '@/components/auth/EmailGate': { useAuth: () => authSession },
    'lucide-react': { Loader2: icon, Pause: icon, Play: icon },
  })[id] || require(id),
  console, Promise, Date, Math, Object, Number, String, Map, Set,
  window: windowStub, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  setInterval: () => 1, clearInterval: () => {},
  sessionStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  localStorage: { setItem() {} },
  CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
}, { filename: 'synthetic-global-work-pause-control.js' });

const Control = module.exports.default;
const renderer = await act(async () => TestRenderer.create(React.createElement(Control)));
assert.equal(calls.length, 1);
assert.equal(calls[0].payload.action, 'status');
assert.equal(calls[0].payload.target_email, 'first@synthetic.invalid');
await act(async () => { calls[0].resolve({ data: {
  success: true, user: { email: 'first@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/);

await act(async () => {
  windowStub.dispatchEvent(new CustomEvent('ccs-timeclock-work-pause-changed', { detail: {
    success: true, user: { email: 'second@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'paused', active_work_pause: { id: 'foreign-pause' },
    work_pause: { id: 'foreign-pause' },
  } }));
});
assert.equal(calls.length, 2, 'Change events should trigger an authoritative signed-session refresh');
assert.equal(calls[1].payload.action, 'status');
assert.equal(calls[1].payload.target_email, 'first@synthetic.invalid');
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/,
  'An event payload for another employee must not show Resume Work while signed-session status is unresolved');
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Resume Work/);
console.log('PASS foreign Work Pause change event cannot replace signed employee status');
await act(async () => { calls[1].resolve({ data: {
  success: true, user: { email: 'first@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Resume Work/);
console.log('PASS foreign Work Pause event cannot replace signed employee status');

authSession = {
  currentUser: { email: 'second@synthetic.invalid' },
  sessionToken: 'signed-session-B',
};
await act(async () => { renderer.update(React.createElement(Control)); });
assert.equal(calls.length, 3, 'Switching signed employees must refresh status for the new identity');
assert.equal(calls[2].payload.action, 'status');
assert.equal(calls[2].payload.target_email, 'second@synthetic.invalid');
assert.equal(renderer.toJSON(), null,
  'The prior employee Work Pause control must not remain visible while the new employee status is unresolved');
await act(async () => { calls[2].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' }, status: 'clocked_out',
} }); });
assert.equal(renderer.toJSON(), null);
console.log('PASS prior employee Work Pause control is hidden during account switch');
console.log('PASS 2/2 Global Work Pause session/event scenarios');
