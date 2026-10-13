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
  setTimeout: () => 1, clearTimeout: () => {},
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

await act(async () => { renderer.unmount(); });
console.log('PASS 2/2 Time Clock Quick Clock async status acceptance cases');
