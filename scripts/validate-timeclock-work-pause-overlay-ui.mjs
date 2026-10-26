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
// Stable context stub: refresh identity churn would re-run the overlay's
// status effect and reset pause state on every render.
const statusContextStub = { isFallback: true, version: 0, refresh: async () => null, sharedStatus: null };
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => ({
    '@/api/base44Client': { base44: { functions: { invoke: (fn, payload) => new Promise((resolve, reject) => {
      assert.equal(fn, 'timeClockAction'); calls.push({ payload, resolve, reject });
    }) } } },
    '@/components/auth/EmailGate': { useAuth: () => ({ currentUser: null, sessionToken: '' }) },
    '@/components/ui/button': { Button },
    '@/components/timeclock/TimeClockStatusContext': { useTimeClockStatus: () => statusContextStub },
    '@/lib/usePolling': { usePolling: () => {} },
    'framer-motion': { motion: new Proxy({}, { get: () => (props) => React.createElement('div', props, props?.children) }), useReducedMotion: () => false },
    'date-fns': { format: () => '' },
    '@/components/motion/motion': { duration: { ui: 0.18 }, easing: { decelerate: [0, 0, 0.2, 1] }, spring: { soft: { type: 'spring' } } },
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

const completedResumes = [];
await act(async () => {
  renderer.update(React.createElement(Overlay, {
    ...propsFor(second, 'session-B'), onResumed: (data) => completedResumes.push(data),
  }));
});
const resumeButton = renderer.root.findAllByType(Button).find((node) =>
  [node.props.children].flat(Infinity).includes('Resume Work'));
assert.ok(resumeButton, 'Paused employee must have Resume Work action');
const beforeResume = calls.length;
let pendingResume;
await act(async () => { pendingResume = resumeButton.props.onClick(); });
assert.equal(calls.length, beforeResume + 1);
assert.equal(calls.at(-1).payload.action, 'work_pause_resume');
assert.equal(calls.at(-1).payload.target_email, second.email);
const pendingIndex = calls.length - 1;
await act(async () => {
  renderer.update(React.createElement(Overlay, {
    ...propsFor(first, 'session-A'), onResumed: (data) => completedResumes.push(data),
  }));
});
assert.equal(calls.at(-1).payload.target_email, first.email);
await act(async () => { calls.at(-1).resolve(paused(first, 'current-A')); });
assert.match(visible(renderer), /WORK PAUSED/);
await act(async () => {
  calls[pendingIndex].resolve({ data: {
    success: true, status: 'clocked_in', work_pause_status: 'working',
    user: second, entry: { user_email: second.email },
  } });
  await pendingResume;
});
assert.match(visible(renderer), /WORK PAUSED/,
  'Resume response from previous session must never dismiss a different employee pause');
assert.equal(completedResumes.length, 0,
  'Stale Resume response must not emit confirmation to the current screen');
console.log('PASS previous session Resume Work acknowledgement cannot update another employee');

await act(async () => { renderer.unmount(); });

let retryRenderer;
const retryResumes = [];
const retryStart = calls.length;
await act(async () => {
  retryRenderer = TestRenderer.create(React.createElement(Overlay, {
    ...propsFor(second, 'session-retry'),
    onResumed: (data) => retryResumes.push(data),
  }));
});
assert.equal(calls.length, retryStart + 1);
await act(async () => { calls.at(-1).resolve(paused(second, 'retry')); });
assert.match(visible(retryRenderer), /WORK PAUSED/);
const resumeControl = () => retryRenderer.root.findAllByType(Button).find((node) =>
  [node.props.children].flat(Infinity).includes('Resume Work'));
let failedResume;
await act(async () => { failedResume = resumeControl().props.onClick(); });
const originalResumeId = calls.at(-1).payload.request_id;
assert.ok(originalResumeId);
assert.equal(calls.at(-1).payload.action, 'work_pause_resume');
await act(async () => {
  calls.at(-1).reject(new Error('Synthetic interrupted acknowledgement'));
  await failedResume;
});
assert.match(visible(retryRenderer), /WORK PAUSED/);
assert.match(visible(retryRenderer), /Synthetic interrupted acknowledgement/);
let exactRetry;
await act(async () => { exactRetry = resumeControl().props.onClick(); });
assert.equal(calls.at(-1).payload.request_id, originalResumeId,
  'Uncertain Work Pause resume retries must keep their exact original request ID');
await act(async () => {
  calls.at(-1).resolve({ data: {
    success: true, status: 'clocked_in', work_pause_status: 'working',
    user: second, entry: { user_email: second.email },
  } });
  await exactRetry;
});
assert.equal(retryResumes.length, 1);
assert.doesNotMatch(visible(retryRenderer), /WORK PAUSED/);
const refreshedAfterResume = calls.at(-1);
assert.equal(refreshedAfterResume.payload.action, 'status');
await act(async () => { refreshedAfterResume.resolve(working(second)); });
assert.doesNotMatch(visible(retryRenderer), /WORK PAUSED/);
console.log('PASS lost Resume Work acknowledgement retries same request and normal success clears guard');
await act(async () => { retryRenderer.unmount(); });

let identityRenderer;
const identityStart = calls.length;
await act(async () => {
  identityRenderer = TestRenderer.create(React.createElement(Overlay, propsFor(first, 'session-ident-A')));
});
assert.equal(calls.length, identityStart + 1);
await act(async () => {
  identityRenderer.update(React.createElement(Overlay, propsFor(second, 'session-ident-B')));
});
assert.equal(calls.length, identityStart + 2);
await act(async () => { calls[identityStart + 1].resolve(working(second)); });
assert.doesNotMatch(visible(identityRenderer), /WORK PAUSED/);
await act(async () => { calls[identityStart].resolve(paused(first, 'stale-other-employee')); });
assert.doesNotMatch(visible(identityRenderer), /WORK PAUSED/,
  'Stale previous-employee response must not show a pause guard when the current employee is working');
console.log('PASS old employee paused status cannot reopen guard for newly signed-in working employee');
await act(async () => { identityRenderer.unmount(); });

// A change event carries only an invalidation signal now: while a Resume
// acknowledgement is outstanding the payload may not clear the guard, and the
// deferred invalidation re-verifies status once the request settles.
let fenceRenderer;
const fenceStart = calls.length;
await act(async () => {
  fenceRenderer = TestRenderer.create(React.createElement(Overlay, propsFor(first, 'session-fence-A')));
});
assert.equal(calls.length, fenceStart + 1);
await act(async () => { calls.at(-1).resolve(paused(first, 'fence-A')); });
assert.match(visible(fenceRenderer), /WORK PAUSED/);
const fenceResume = () => fenceRenderer.root.findAllByType(Button).find((node) =>
  [node.props.children].flat(Infinity).includes('Resume Work'));
let fenceAttempt;
await act(async () => { fenceAttempt = fenceResume().props.onClick(); });
const fenceResumeIndex = calls.length - 1;
assert.equal(calls[fenceResumeIndex].payload.action, 'work_pause_resume');
await act(async () => {
  listeners.get('ccs-timeclock-work-pause-changed')({
    detail: { success: true, status: 'clocked_in', work_pause_status: 'working',
      user: first, entry: { user_email: first.email } },
  });
});
assert.match(visible(fenceRenderer), /WORK PAUSED/,
  'A working event payload may not clear the guard while Resume is in flight');
assert.equal(calls.length, fenceResumeIndex + 1,
  'Invalidation during an in-flight Resume is deferred, not dropped');
await act(async () => {
  calls[fenceResumeIndex].reject(new Error('Synthetic lost acknowledgement'));
  await fenceAttempt;
});
assert.match(visible(fenceRenderer), /WORK PAUSED/);
assert.equal(calls.at(-1).payload.action, 'status',
  'The deferred invalidation must re-verify status after the Resume settles');
await act(async () => { calls.at(-1).resolve(working(first)); });
assert.doesNotMatch(visible(fenceRenderer), /WORK PAUSED/);
console.log('PASS same-employee event during Resume only invalidates; settled request re-verifies status');
await act(async () => { fenceRenderer.unmount(); });

// A paused payload for a working employee is unverified: it may trigger a
// status read but must never fabricate the guard by itself.
let passiveRenderer;
const passiveStart = calls.length;
await act(async () => {
  passiveRenderer = TestRenderer.create(React.createElement(Overlay, propsFor(second, 'session-passive-B')));
});
assert.equal(calls.length, passiveStart + 1);
await act(async () => { calls.at(-1).resolve(working(second)); });
assert.doesNotMatch(visible(passiveRenderer), /WORK PAUSED/);
const beforePassiveEvent = calls.length;
await act(async () => {
  listeners.get('ccs-timeclock-work-pause-changed')({
    detail: { success: true, status: 'clocked_in', work_pause_status: 'paused',
      user: second, entry: { user_email: second.email },
      active_work_pause: { id: 'pause-unverified', started_at: '2026-10-13T13:00:00.000Z' } },
  });
});
assert.equal(calls.length, beforePassiveEvent + 1);
assert.equal(calls.at(-1).payload.action, 'status',
  'A pause-changed event must trigger verification, not trusted state');
assert.doesNotMatch(visible(passiveRenderer), /WORK PAUSED/,
  'Event payload alone may not open the paused guard');
await act(async () => { calls.at(-1).resolve(working(second)); });
assert.doesNotMatch(visible(passiveRenderer), /WORK PAUSED/);
console.log('PASS unverified paused event payload cannot fabricate the guard');
await act(async () => { passiveRenderer.unmount(); });
console.log('PASS 8/8 Work Pause overlay session/refresh/event scenarios');
