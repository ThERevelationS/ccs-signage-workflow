// Synthetic-only component acceptance for overlapping employee status fetches.
// Never invokes production Base44 endpoints or creates real time records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const source = readFileSync(new URL('../src/components/timeclock/QuickClockSection.jsx', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const require = createRequire(import.meta.url);
const calls = [];
const timers = new Map();
let nextTimerId = 0;
const events = new Map();
const docEvents = new Map();
const fakeWindow = {
  addEventListener(name, listener) { events.set(name, listener); },
  removeEventListener(name, listener) { if (events.get(name) === listener) events.delete(name); },
};
const fakeDocument = {
  visibilityState: 'visible',
  addEventListener(name, listener) { docEvents.set(name, listener); },
  removeEventListener(name, listener) { if (docEvents.get(name) === listener) docEvents.delete(name); },
};
const icon = () => React.createElement('svg');
const Button = ({ children, ...props }) => React.createElement('button', {
  disabled: props.disabled, onClick: props.onClick, title: props.title,
}, children);
const Input = (props) => React.createElement('input', { value: props.value, onChange: props.onChange });
const pop = (name) => function MockedComponent(props) {
  return React.createElement('section', { 'data-dialog': name, 'data-entry-id': props.timeEntry?.id || '' });
};
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => ({
    '@/api/base44Client': { base44: { functions: {
      invoke: (functionName, payload) => new Promise((resolve, reject) => {
        assert.equal(functionName, 'timeClockAction');
        calls.push({ payload, resolve, reject });
      }),
    } } },
    '@/components/auth/EmailGate': { useAuth: () => ({ sessionToken: '', currentUser: null }) },
    '@/components/ui/button': { Button },
    '@/components/ui/input': { Input },
    'lucide-react': Object.fromEntries(
      ['Camera','Clock','Loader2','Play','QrCode','Square','User','X'].map((name) => [name, icon])),
    '@/components/timeclock/ClockOutDialog': pop('clock_out'),
    '@/components/timeclock/MissedPunchResolutionDialog': pop('missed_punch'),
    '@/components/timeclock/LateClockInReviewDialog': pop('late_clock_in'),
    '@/components/timeclock/WorkPauseOverlay': pop('work_pause'),
    '@/components/timeclock/faceScanRuntime': {
      createFaceMatcher: () => () => null,
      detectDetailedFace: async () => null,
      loadFaceModelsOnce: async () => {},
    },
    'html5-qrcode': { Html5Qrcode: class {} },
  })[id] || require(id),
  console, Promise, Date, Math, crypto: globalThis.crypto,
  window: fakeWindow, document: fakeDocument,
  setTimeout: (callback, ms) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, ms });
    return id;
  },
  clearTimeout: (id) => { timers.delete(id); },
  setInterval: () => 1, clearInterval: () => {},
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}, { filename: 'synthetic-quick-clock-component.js' });
const QuickClockSection = module.exports.default;
const first = { email: 'first@synthetic.invalid', full_name: 'First Test Employee' };
const second = { email: 'second@synthetic.invalid', full_name: 'Second Test Employee' };
const status = (user, id) => ({
  data: { success: true, user, status: 'clocked_in', entry: {
    id, user_email: user.email, status: 'clocked_in', clock_in: '2026-10-13T12:00:00.000Z',
  }, break_status: 'working', work_pause_status: 'working', work_pause_allowed: false },
});
const visible = (tree) => JSON.stringify(tree.toJSON());
let renderer;
await act(async () => {
  renderer = TestRenderer.create(React.createElement(QuickClockSection, {
    allUsers: [first, second], employeeSessionToken: 'session-first', employeeSessionUser: first,
  }));
});
assert.equal(calls.length, 1);
assert.equal(calls[0].payload.action, 'status');
assert.equal(calls[0].payload.target_email, first.email);

await act(async () => {
  renderer.update(React.createElement(QuickClockSection, {
    allUsers: [first, second], employeeSessionToken: 'session-second', employeeSessionUser: second,
  }));
});
assert.equal(calls.length, 2);
assert.equal(calls[1].payload.target_email, second.email);
await act(async () => { calls[1].resolve(status(second, 'second-active-shift')); });
assert.match(visible(renderer), /second-active-shift/);
await act(async () => { calls[0].resolve(status(first, 'old-first-shift')); });
assert.doesNotMatch(visible(renderer), /old-first-shift/,
  'Late prior employee session must not replace new employee shift');
assert.match(visible(renderer), /second-active-shift/);
console.log('PASS switching employee sessions ignores late status from prior employee');

await act(async () => { events.get('focus')(); });
assert.equal(calls.length, 3);
await act(async () => { events.get('focus')(); });
assert.equal(calls.length, 4);
await act(async () => { calls[3].resolve({ data: {
  success: true, user: second, status: 'clocked_out',
} }); });
assert.doesNotMatch(visible(renderer), /second-active-shift/);
await act(async () => { calls[2].resolve(status(second, 'older-second-shift')); });
assert.doesNotMatch(visible(renderer), /older-second-shift/,
  'Older same-session response must not reopen already closed clock-out dialog');
console.log('PASS overlapping status refreshes accept only latest request');

await act(async () => { events.get('focus')(); });
assert.equal(calls.length, 5);
await act(async () => { calls[4].resolve(status(second, 'shift-ready-to-close')); });
assert.match(visible(renderer), /shift-ready-to-close/);
const dialog = renderer.root.findAll((node) => typeof node.props?.onClockOut === 'function')[0];
assert.ok(dialog, 'Expected a clock-out dialog connected to the authoritative active shift');

await act(async () => { events.get('focus')(); });
assert.equal(calls.length, 6, 'Passive status refresh should be in flight before punch');
const finish = dialog.props.onClockOut({
  lunchMinutes: 0, jobAllocations: [], notes: 'Synthetic clock-out acceptance',
});
assert.equal(calls.length, 7);
assert.equal(calls[6].payload.action, 'clock_out');
await act(async () => { events.get('focus')(); });
assert.equal(calls.length, 7,
  'Passive status request must not launch while authoritative Clock Out is underway');
await act(async () => { calls[6].resolve({ data: {
  success: true, user: second, status: 'clocked_out', entry: {
    id: 'shift-ready-to-close', clock_out: '2026-10-13T21:00:00.000Z',
  },
} }); await finish; });
assert.doesNotMatch(visible(renderer), /shift-ready-to-close/,
  'Confirmed Clock Out must close the shift dialog');
await act(async () => { calls[5].resolve(status(second, 'stale-before-clock-out')); });
assert.doesNotMatch(visible(renderer), /stale-before-clock-out/,
  'Pre-punch status response must not reopen clock-out after a confirmed action');
console.log('PASS in-flight Clock Out suppresses passive refresh and fences old status replies');

const oldReset = [...timers.entries()].find(([, timer]) => timer.ms === 2500);
assert.ok(oldReset, 'Clock Out should have scheduled a delayed display cleanup');
await act(async () => { events.get('focus')(); });
assert.equal(calls.length, 8);
await act(async () => { calls[7].resolve(status(second, 'freshly-restored-new-active-shift')); });
assert.match(visible(renderer), /freshly-restored-new-active-shift/);
await act(async () => {
  if (timers.has(oldReset[0])) {
    timers.delete(oldReset[0]);
    await oldReset[1].callback();
  }
});
assert.match(visible(renderer), /freshly-restored-new-active-shift/,
  'Cleanup from a previous Clock Out must not clear a newer server-restored active shift');
console.log('PASS delayed prior punch cleanup preserves newly restored authoritative shift');

const restoredDialog = renderer.root.findAll((node) =>
  typeof node.props?.onClockOut === 'function')[0];
assert.ok(restoredDialog);
const secondOut = restoredDialog.props.onClockOut({
  lunchMinutes: 0, jobAllocations: [], notes: 'Synthetic normal cleanup acceptance',
});
assert.equal(calls.length, 9);
assert.equal(calls[8].payload.action, 'clock_out');
await act(async () => {
  calls[8].resolve({ data: {
    success: true, user: second, status: 'clocked_out',
    entry: { id: 'freshly-restored-new-active-shift', clock_out: '2026-10-13T21:30:00.000Z' },
  } });
  await secondOut;
});
const normalReset = [...timers.entries()].find(([, timer]) => timer.ms === 2500);
assert.ok(normalReset, 'Normal Clock Out must still schedule cleanup');
await act(async () => {
  timers.delete(normalReset[0]);
  await normalReset[1].callback();
});
assert.doesNotMatch(visible(renderer), /freshly-restored-new-active-shift/,
  'Normal post-punch cleanup should clear completed shift details');
console.log('PASS ordinary confirmed Clock Out still resets the kiosk when no newer state exists');

await act(async () => { renderer.unmount(); });
console.log('PASS 5/5 Time Clock Quick Clock async status acceptance cases');
