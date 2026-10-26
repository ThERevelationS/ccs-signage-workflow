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
const dispatchedEvents = [];
const storage = new Map();
let failStorageWrites = false;
let authSession = {
  currentUser: { email: 'first@synthetic.invalid' },
  sessionToken: 'signed-session-A',
};
const windowStub = {
  addEventListener(name, callback) { listeners.set(name, callback); },
  removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  dispatchEvent(event) { dispatchedEvents.push(event); listeners.get(event.type)?.(event); },
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
    '@/components/timeclock/WorkPauseMenu': ({ open, onToggle, onClose }) =>
      open ? React.createElement('button', { 'data-menu-toggle': true, onClick: () => { const r = onToggle(); if (onClose) onClose(); return r; } }) : null,
    '@/components/timeclock/TimeClockStatusContext': { useTimeClockStatus: () => ({
      version: 0,
      refresh: (() => {
        let inFlight = null;
        return ({ force } = {}) => {
          if (!force && inFlight) return inFlight;
          inFlight = new Promise((resolve, reject) => {
            calls.push({ payload: { action: 'status', session_token: authSession.sessionToken, target_email: String(authSession.currentUser?.email || '').trim().toLowerCase() }, resolve, reject });
          }).then((r) => r?.data || r).finally(() => { inFlight = null; });
          return inFlight;
        };
      })(),
    }) },
    'lucide-react': { Loader2: icon, Pause: icon, Play: icon },
  })[id] || require(id),
  console, Promise, Date, Math, Object, Number, String, Map, Set,
  window: windowStub, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  setInterval: () => 1, clearInterval: () => {},
  sessionStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => {
      if (failStorageWrites) throw new Error('Synthetic session storage write failure');
      storage.set(key, String(value));
    },
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

authSession = {
  currentUser: { email: 'first@synthetic.invalid' },
  sessionToken: 'signed-session-A',
};
await act(async () => { renderer.update(React.createElement(Control)); });
assert.equal(calls.length, 4);
await act(async () => { calls[3].resolve({ data: {
  success: true, user: { email: 'first@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
let pendingOldAction;
await act(async () => { renderer.root.findByType('button').props.onClick(); });
await act(async () => {
  pendingOldAction = renderer.root.findAllByType('button').find((b) => b.props['data-menu-toggle']).props.onClick();
});
assert.equal(calls.length, 5);
assert.equal(calls[4].payload.action, 'work_pause_start');
assert.equal(renderer.root.findByType('button').props.disabled, true);

authSession = {
  currentUser: { email: 'second@synthetic.invalid' },
  sessionToken: 'signed-session-B',
};
await act(async () => { renderer.update(React.createElement(Control)); });
assert.equal(calls.length, 6);
assert.equal(calls[5].payload.action, 'status');
await act(async () => { calls[5].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
assert.equal(renderer.root.findByType('button').props.disabled, false,
  'A pending previous-employee Work Pause request must not disable the current employee control');
console.log('PASS previous employee pending action cannot disable current employee control');

await act(async () => {
  calls[4].reject(new Error('Synthetic previous employee action failure'));
  await pendingOldAction;
});
assert.equal(calls.length, 6,
  'A stale action failure must not launch another status request for the previous employee');
const currentButton = renderer.root.findByType('button');
assert.equal(currentButton.props.disabled, false);
assert.doesNotMatch(currentButton.props.title, /Synthetic previous employee action failure/,
  'A previous employee error must not replace the current employee control message');
console.log('PASS late previous employee failure leaves current control usable and error-free');

authSession = {
  currentUser: { email: 'first@synthetic.invalid' },
  sessionToken: 'signed-session-A2',
};
await act(async () => { renderer.update(React.createElement(Control)); });
assert.equal(calls.length, 7);
await act(async () => { calls[6].resolve({ data: {
  success: true, user: { email: 'first@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
let pendingOldSuccess;
await act(async () => { renderer.root.findByType('button').props.onClick(); });
await act(async () => {
  pendingOldSuccess = renderer.root.findAllByType('button').find((b) => b.props['data-menu-toggle']).props.onClick();
});
assert.equal(calls.length, 8);
assert.equal(calls[7].payload.action, 'work_pause_start');

authSession = {
  currentUser: { email: 'second@synthetic.invalid' },
  sessionToken: 'signed-session-B',
};
await act(async () => { renderer.update(React.createElement(Control)); });
assert.equal(calls.length, 9);
assert.equal(calls[8].payload.target_email, 'second@synthetic.invalid');
await act(async () => {
  calls[7].resolve({ data: {
    success: true, user: { email: 'first@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
    work_pause: { id: 'synthetic-late-success-pause' },
  } });
  await pendingOldSuccess;
});
assert.equal(calls.length, 10,
  'A previous employee success should notify current sessions without launching a stale status request');
assert.equal(calls[9].payload.action, 'status');
assert.equal(calls[9].payload.target_email, 'second@synthetic.invalid');
await act(async () => { calls[9].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Resume Work/);
assert.equal(renderer.root.findByType('button').props.disabled, false);
console.log('PASS late previous employee success refreshes current identity without canceling it');

await act(async () => {
  windowStub.dispatchEvent(new CustomEvent('ccs-timeclock-work-pause-changed', { detail: {
    success: true, user: { email: 'first@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'paused', active_work_pause: { id: 'foreign-event-pause' },
  } }));
});
assert.equal(calls.length, 11);
assert.equal(calls[10].payload.target_email, 'second@synthetic.invalid');
await act(async () => { calls[10].resolve({ data: {
  success: true, user: { email: 'first@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
  active_work_pause: { id: 'foreign-response-pause' }, break_status: 'working',
} }); });
assert.equal(renderer.toJSON(), null,
  'A successful status response for a different employee must fail closed instead of exposing their Work Pause state');
console.log('PASS mismatched status identity fails closed');

await act(async () => {
  windowStub.dispatchEvent(new CustomEvent('ccs-timeclock-work-pause-changed', { detail: null }));
});
assert.equal(calls.length, 12);
assert.equal(calls[11].payload.target_email, 'second@synthetic.invalid');
await act(async () => { calls[11].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/);
let pendingCurrentAction;
await act(async () => {
  pendingCurrentAction = renderer.root.findByType('button').props.onClick();
});
assert.equal(calls.length, 13);
assert.equal(calls[12].payload.action, 'work_pause_start');
await act(async () => {
  calls[12].resolve({ data: {
    success: true, user: { email: 'second@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
    work_pause: { id: 'current-employee-pause' },
  } });
  await pendingCurrentAction;
});
assert.equal(calls.length, 14,
  'A confirmed Work Pause action should schedule exactly one authoritative status refresh');
assert.equal(calls[13].payload.action, 'status');
assert.equal(calls[13].payload.target_email, 'second@synthetic.invalid');
await act(async () => { calls[13].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
  active_work_pause: { id: 'current-employee-pause' }, break_status: 'working',
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /Resume Work/);
console.log('PASS confirmed action triggers one status refresh');
let pendingMismatchedAck;
await act(async () => {
  pendingMismatchedAck = renderer.root.findByType('button').props.onClick();
});
assert.equal(calls.length, 15);
assert.equal(calls[14].payload.action, 'work_pause_resume');
const expectedResumeRequestId = calls[14].payload.request_id;
assert.ok(expectedResumeRequestId);
await act(async () => {
  calls[14].resolve({ data: {
    success: true, user: { email: 'first@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true,
  } });
  await pendingMismatchedAck;
});
assert.equal(calls.length, 16, 'A mismatched action acknowledgement should trigger an authoritative signed-session refresh');
assert.equal(calls[15].payload.action, 'status');
assert.equal(calls[15].payload.target_email, 'second@synthetic.invalid');
assert.equal(dispatchedEvents.at(-1).detail, null,
  'A mismatched acknowledgement must broadcast only an invalidation signal, never the returned employee data');
assert.equal(storage.get('ccs_timeclock_request:work_pause_resume:second@synthetic.invalid'), expectedResumeRequestId,
  'A mismatched successful acknowledgement must retain its exact request ID until authoritative status verifies the action');
const guardedButton = renderer.root.findByType('button');
assert.equal(guardedButton.props.disabled, true,
  'An identity-mismatched acknowledgement must keep the last known Work Pause state guarded until status is verified');
assert.match(JSON.stringify(renderer.toJSON()), /Resume Work/);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Pause Work/,
  'A mismatched acknowledgement must not apply another employee\'s returned state');
await act(async () => { calls[15].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
const verifiedButton = renderer.root.findByType('button');
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/);
assert.equal(verifiedButton.props.disabled, false);
assert.equal(storage.has('ccs_timeclock_request:work_pause_resume:second@synthetic.invalid'), false,
  'A signed-employee status response should clear the recovered Work Pause request ID');
let pendingMismatchedStart;
await act(async () => {
  pendingMismatchedStart = renderer.root.findByType('button').props.onClick();
});
assert.equal(calls.length, 17);
assert.equal(calls[16].payload.action, 'work_pause_start');
const expectedStartRequestId = calls[16].payload.request_id;
await act(async () => {
  calls[16].resolve({ data: {
    success: true, user: { email: 'first@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
    work_pause: { id: 'foreign-ack-pause' },
  } });
  await pendingMismatchedStart;
});
assert.equal(calls.length, 18);
assert.equal(calls[17].payload.action, 'status');
assert.equal(calls[17].payload.target_email, 'second@synthetic.invalid');
assert.equal(storage.get('ccs_timeclock_request:work_pause_start:second@synthetic.invalid'), expectedStartRequestId,
  'A mismatched start acknowledgement must retain the exact request ID while status is uncertain');
assert.equal(dispatchedEvents.at(-1).detail, null);
const guardedStartButton = renderer.root.findByType('button');
assert.equal(guardedStartButton.props.disabled, true);
assert.match(JSON.stringify(renderer.toJSON()), /Pause Work/);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Resume Work/,
  'A mismatched start acknowledgement must not expose the foreign employee pause state');
await act(async () => {
  calls[17].reject(new Error('Synthetic authoritative status refresh failure'));
  await Promise.resolve();
});
const failedRefreshButton = renderer.root.findByType('button');
assert.equal(failedRefreshButton.props.disabled, true,
  'A failed authoritative refresh must leave the Work Pause control guarded');
assert.match(failedRefreshButton.props.title, /Synthetic authoritative status refresh failure/);
assert.equal(storage.get('ccs_timeclock_request:work_pause_start:second@synthetic.invalid'), expectedStartRequestId,
  'A failed authoritative refresh must leave the original request ID available for safe recovery');
console.log('PASS mismatched Work Pause action acknowledgement stays isolated and retries safely');
await act(async () => {
  windowStub.dispatchEvent(new CustomEvent('ccs-timeclock-work-pause-changed', { detail: null }));
});
assert.equal(calls.length, 19);
await act(async () => { calls[18].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
assert.equal(renderer.root.findByType('button').props.disabled, false);
failStorageWrites = true;
let storageBlockedAction;
await act(async () => { storageBlockedAction = renderer.root.findByType('button').props.onClick(); });
assert.equal(calls.length, 19,
  'Work Pause must not be sent when the exact request ID cannot be safely retained in session storage');
await storageBlockedAction;
assert.match(renderer.root.findByType('button').props.title, /session storage|retry request/i,
  'The employee should see why Work Pause was not submitted');
console.log('PASS storage failure prevents Work Pause mutation without a durable retry ID');

failStorageWrites = false;
await act(async () => {
  windowStub.dispatchEvent(new CustomEvent('ccs-timeclock-work-pause-changed', { detail: null }));
});
assert.equal(calls.length, 20);
await act(async () => { calls[19].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'working', work_pause_allowed: true, break_status: 'working',
} }); });
let pendingSupersededStart;
await act(async () => { pendingSupersededStart = renderer.root.findByType('button').props.onClick(); });
assert.equal(calls.length, 21);
assert.equal(calls[20].payload.action, 'work_pause_start');
const staleActionRequestId = calls[20].payload.request_id;
assert.ok(staleActionRequestId);
await act(async () => {
  windowStub.dispatchEvent(new CustomEvent('ccs-timeclock-work-pause-changed', { detail: null }));
});
assert.equal(calls.length, 22);
await act(async () => { calls[21].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
  active_work_pause: { id: 'newer-authoritative-pause' }, break_status: 'working',
} }); });
const pauseRequestKey = 'ccs_timeclock_request:work_pause_start:second@synthetic.invalid';
const newerPauseRequestId = 'synthetic-newer-pause-request';
storage.set(pauseRequestKey, newerPauseRequestId);
await act(async () => {
  calls[20].resolve({ data: {
    success: true, user: { email: 'second@synthetic.invalid' },
    status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
    work_pause: { id: 'stale-ack-pause' }, break_status: 'working',
  } });
  await pendingSupersededStart;
});
assert.equal(calls.length, 23,
  'A superseded acknowledgement should trigger signed-session status reconciliation');
assert.equal(calls[22].payload.action, 'status');
assert.equal(storage.get(pauseRequestKey), newerPauseRequestId,
  'A stale acknowledgement must retain a newer request ID');
assert.equal(dispatchedEvents.at(-1).detail, null,
  'A stale acknowledgement should publish only an invalidation signal, never its stale state');
await act(async () => { calls[22].resolve({ data: {
  success: true, user: { email: 'second@synthetic.invalid' },
  status: 'clocked_in', work_pause_status: 'paused', work_pause_allowed: true,
  active_work_pause: { id: 'newer-authoritative-pause' }, break_status: 'working',
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /Resume Work/);
assert.equal(storage.has(pauseRequestKey), false,
  'Only authoritative status reconciliation may clear the retained request');
console.log('PASS stale Work Pause acknowledgement cannot replace newer state or clear a newer request');
console.log('PASS 10/10 Global Work Pause session/event scenarios');
