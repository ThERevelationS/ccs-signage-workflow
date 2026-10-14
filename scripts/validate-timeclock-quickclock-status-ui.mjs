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

await act(async () => { events.get('focus')(); });
const secondRecoveryStatusIndex = calls.length - 1;
assert.equal(calls[secondRecoveryStatusIndex].payload.action, 'status');
await act(async () => {
  calls[secondRecoveryStatusIndex].resolve(status(second, 'break-in-flight-second'));
});
const secondBreakDialog = renderer.root.findAll((node) =>
  typeof node.props?.onStartBreak === 'function')[0];
assert.ok(secondBreakDialog);
let interruptedBreak;
await act(async () => {
  interruptedBreak = secondBreakDialog.props.onStartBreak({ breakType: 'lunch', isPaid: false });
});
const oldBreakCallIndex = calls.length - 1;
assert.equal(calls[oldBreakCallIndex].payload.action, 'break_start');
assert.equal(calls[oldBreakCallIndex].payload.target_email, second.email);
assert.equal(calls[oldBreakCallIndex].payload.is_paid, false);
assert.ok(calls[oldBreakCallIndex].payload.request_id);

await act(async () => {
  renderer.update(React.createElement(QuickClockSection, {
    allUsers: [first, second], employeeSessionToken: 'session-first-return', employeeSessionUser: first,
  }));
});
assert.equal(calls.at(-1).payload.action, 'status',
  'New employee session must independently refresh even if prior employee break remains in flight');
assert.equal(calls.at(-1).payload.target_email, first.email);
const firstStatusIndex = calls.length - 1;
await act(async () => { calls[firstStatusIndex].resolve(status(first, 'first-current-shift')); });
const firstBreakDialog = renderer.root.findAll((node) =>
  typeof node.props?.onStartBreak === 'function')[0];
assert.ok(firstBreakDialog);
assert.equal(firstBreakDialog.props.breakStatus, 'working');
await act(async () => {
  calls[oldBreakCallIndex].resolve({ data: {
    success: true, status: 'clocked_in', user: second, break_status: 'on_break',
    break: { id: 'old-second-lunch', user_email: second.email, break_type: 'lunch', is_paid: false },
    break_summary: { count: 1, unpaid_minutes: 10, total_minutes: 10, paid_minutes: 0 },
    entry: { id: 'break-in-flight-second', user_email: second.email },
  } });
  await interruptedBreak;
});
const currentDialog = renderer.root.findAll((node) =>
  typeof node.props?.onStartBreak === 'function')[0];
assert.ok(currentDialog);
assert.equal(currentDialog.props.timeEntry.id, 'first-current-shift');
assert.equal(currentDialog.props.breakStatus, 'working',
  'Old employee break acknowledgement must not put new employee on break');
assert.equal(currentDialog.props.activeBreak, null);
console.log('PASS previous employee break completion never contaminates new employee state');

const firstDialog = () => renderer.root.findAll((node) =>
  typeof node.props?.onStartBreak === 'function')[0];
assert.equal(firstDialog().props.breakStatus, 'working');
let failedLunch;
await act(async () => {
  failedLunch = firstDialog().props.onStartBreak({ breakType: 'lunch', isPaid: false });
});
const firstLunchIndex = calls.length - 1;
assert.equal(calls[firstLunchIndex].payload.action, 'break_start');
const originalLunchRequest = calls[firstLunchIndex].payload.request_id;
await act(async () => {
  calls[firstLunchIndex].reject(new Error('Synthetic lost break start acknowledgement'));
  await assert.rejects(failedLunch, /Synthetic lost break start acknowledgement/);
});
assert.equal(firstDialog().props.breakStatus, 'working',
  'Failed break acknowledgement must not appear as successful');
let retriedLunch;
await act(async () => {
  retriedLunch = firstDialog().props.onStartBreak({ breakType: 'lunch', isPaid: false });
});
const secondLunchIndex = calls.length - 1;
assert.equal(calls[secondLunchIndex].payload.request_id, originalLunchRequest,
  'Uncertain break start must retry with its original request identity');
await act(async () => {
  calls[secondLunchIndex].resolve({ data: {
    success: true, user: first, status: 'clocked_in', break_status: 'on_break',
    break: { id: 'first-current-lunch', user_email: first.email, is_paid: false, break_type: 'lunch' },
    break_summary: { count: 1, total_minutes: 2, unpaid_minutes: 2, paid_minutes: 0 },
    entry: { id: 'first-current-shift', user_email: first.email },
  } });
  await retriedLunch;
});
assert.equal(firstDialog().props.breakStatus, 'on_break');
assert.equal(firstDialog().props.activeBreak.id, 'first-current-lunch');
console.log('PASS interrupted unpaid break retries exact request and preserves active break');

let pendingBreakEnd;
await act(async () => { pendingBreakEnd = firstDialog().props.onEndBreak(); });
const oldBreakEndIndex = calls.length - 1;
assert.equal(calls[oldBreakEndIndex].payload.action, 'break_end');
await act(async () => {
  renderer.update(React.createElement(QuickClockSection, {
    allUsers: [first, second], employeeSessionToken: 'session-second-new', employeeSessionUser: second,
  }));
});
const secondStatusIndex = calls.length - 1;
assert.equal(calls[secondStatusIndex].payload.action, 'status');
assert.equal(calls[secondStatusIndex].payload.target_email, second.email);
await act(async () => { calls[secondStatusIndex].resolve(status(second, 'second-break-free')); });
assert.equal(firstDialog().props.breakStatus, 'working');
await act(async () => {
  calls[oldBreakEndIndex].resolve({ data: {
    success: true, user: first, status: 'clocked_in', break_status: 'working',
    break_summary: { count: 1, unpaid_minutes: 12, total_minutes: 12, paid_minutes: 0 },
    entry: { id: 'first-current-shift', user_email: first.email },
  } });
  await pendingBreakEnd;
});
assert.equal(firstDialog().props.timeEntry.id, 'second-break-free');
assert.equal(firstDialog().props.breakStatus, 'working');
assert.equal(firstDialog().props.breakSummary.unpaid_minutes, 0,
  'Previous employee End Break confirmation must not contaminate next employee totals');
console.log('PASS prior employee End Break acknowledgement cannot replace new employee totals');

let paidStart;
await act(async () => {
  paidStart = firstDialog().props.onStartBreak({ breakType: 'break', isPaid: true });
});
const paidStartIndex = calls.length - 1;
assert.equal(calls[paidStartIndex].payload.action, 'break_start');
assert.equal(calls[paidStartIndex].payload.is_paid, true);
await act(async () => {
  calls[paidStartIndex].resolve({ data: {
    success: true, status: 'clocked_in', user: second, break_status: 'on_break',
    break: { id: 'paid-break-second', is_paid: true, break_type: 'break', user_email: second.email },
    break_summary: { count: 1, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await paidStart;
});
assert.equal(firstDialog().props.breakStatus, 'on_break');
assert.equal(firstDialog().props.activeBreak.is_paid, true);
let paidEnd;
await act(async () => { paidEnd = firstDialog().props.onEndBreak(); });
const paidEndIndex = calls.length - 1;
assert.equal(calls[paidEndIndex].payload.action, 'break_end');
await act(async () => {
  calls[paidEndIndex].resolve({ data: {
    success: true, status: 'clocked_in', user: second, break_status: 'working',
    break_summary: { count: 1, total_minutes: 8, paid_minutes: 8, unpaid_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await paidEnd;
});
assert.equal(firstDialog().props.breakStatus, 'working');
assert.equal(firstDialog().props.activeBreak, null);
assert.equal(firstDialog().props.breakSummary.paid_minutes, 8);
assert.equal(firstDialog().props.breakSummary.unpaid_minutes, 0);
console.log('PASS paid break normal start/end preserves server paid versus unpaid totals');

const laborDialog = () => renderer.root.findAll((node) =>
  typeof node.props?.onStartLabor === 'function')[0];
assert.ok(laborDialog());
let laborBeforeBreak;
await act(async () => {
  laborBeforeBreak = laborDialog().props.onStartLabor({ activityType: 'fabrication' });
});
const laborBeforeBreakCall = calls.length - 1;
assert.equal(calls[laborBeforeBreakCall].payload.action, 'labor_start');
assert.equal(calls[laborBeforeBreakCall].payload.target_email, second.email);
let breakAfterLabor;
await act(async () => {
  breakAfterLabor = laborDialog().props.onStartBreak({ breakType: 'break', isPaid: true });
});
const breakAfterLaborCall = calls.length - 1;
assert.equal(calls[breakAfterLaborCall].payload.action, 'break_start');
await act(async () => {
  calls[breakAfterLaborCall].resolve({ data: {
    success: true, user: second, status: 'clocked_in', break_status: 'on_break',
    break: { id: 'break-after-labor', user_email: second.email, is_paid: true },
    active_labor: null, labor_summary: { count: 1, total_minutes: 7 },
    break_summary: { count: 2, total_minutes: 8, paid_minutes: 8, unpaid_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await breakAfterLabor;
});
assert.equal(laborDialog().props.breakStatus, 'on_break');
assert.equal(laborDialog().props.activeLabor, null);
await act(async () => {
  calls[laborBeforeBreakCall].resolve({ data: {
    success: true, user: second, status: 'clocked_in',
    active_labor: { id: 'older-labor-before-break', activity_type: 'fabrication', user_email: second.email },
    labor_summary: { count: 0, total_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await laborBeforeBreak;
});
assert.equal(laborDialog().props.activeLabor, null,
  'An older labor acknowledgement must not revive Current Work after a confirmed Break Start');
assert.equal(laborDialog().props.laborSummary.total_minutes, 7,
  'Older labor summary must not overwrite the newer break transition');
console.log('PASS late Current Work acknowledgement cannot revive labor during a break');

let resumeAfterBreak;
await act(async () => { resumeAfterBreak = laborDialog().props.onEndBreak(); });
const breakFinishIndex = calls.length - 1;
assert.equal(calls[breakFinishIndex].payload.action, 'break_end');
await act(async () => {
  calls[breakFinishIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in', break_status: 'working',
    active_labor: null, labor_summary: { count: 1, total_minutes: 7 },
    break_summary: { count: 2, total_minutes: 15, paid_minutes: 15, unpaid_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await resumeAfterBreak;
});
assert.equal(laborDialog().props.breakStatus, 'working');

let uncertainLabor;
await act(async () => { uncertainLabor = laborDialog().props.onStartLabor({ activityType: 'design' }); });
const uncertainLaborIndex = calls.length - 1;
assert.equal(calls[uncertainLaborIndex].payload.action, 'labor_start');
const originalLaborId = calls[uncertainLaborIndex].payload.request_id;
assert.ok(originalLaborId);
await act(async () => {
  calls[uncertainLaborIndex].reject(new Error('Synthetic Current Work lost acknowledgement'));
  await assert.rejects(uncertainLabor, /Synthetic Current Work lost acknowledgement/);
});
assert.equal(laborDialog().props.activeLabor, null, 'Unknown labor write must never show as successful');
let retriedLabor;
await act(async () => { retriedLabor = laborDialog().props.onStartLabor({ activityType: 'design' }); });
const laborRetryIndex = calls.length - 1;
assert.equal(calls[laborRetryIndex].payload.request_id, originalLaborId);
await act(async () => {
  calls[laborRetryIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in',
    active_labor: { id: 'design-work', activity_type: 'design', user_email: second.email },
    labor_summary: { count: 1, total_minutes: 7 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await retriedLabor;
});
assert.equal(laborDialog().props.activeLabor.id, 'design-work');
console.log('PASS interrupted Current Work start retains request identity and confirms one segment');

let changedLabor;
await act(async () => { changedLabor = laborDialog().props.onChangeLabor({ activityType: 'installation' }); });
const changedLaborIndex = calls.length - 1;
assert.equal(calls[changedLaborIndex].payload.action, 'labor_change');
await act(async () => {
  calls[changedLaborIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in',
    active_labor: { id: 'installation-work', activity_type: 'installation', user_email: second.email },
    labor_summary: { count: 2, total_minutes: 12 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await changedLabor;
});
assert.equal(laborDialog().props.activeLabor.id, 'installation-work');
let stoppedLabor;
await act(async () => { stoppedLabor = laborDialog().props.onStopLabor(); });
const stoppedLaborIndex = calls.length - 1;
assert.equal(calls[stoppedLaborIndex].payload.action, 'labor_stop');
await act(async () => {
  calls[stoppedLaborIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in',
    active_labor: null,
    labor_summary: { count: 2, total_minutes: 19 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await stoppedLabor;
});
assert.equal(laborDialog().props.activeLabor, null);
assert.equal(laborDialog().props.laborSummary.total_minutes, 19);
console.log('PASS Current Work change and stop keep authoritative labor summary');

let oldLabor;
await act(async () => { oldLabor = laborDialog().props.onStartLabor({ activityType: 'fabrication' }); });
const oldLaborIndex = calls.length - 1;
assert.equal(calls[oldLaborIndex].payload.action, 'labor_start');
await act(async () => {
  renderer.update(React.createElement(QuickClockSection, {
    allUsers: [first, second], employeeSessionToken: 'session-first-current', employeeSessionUser: first,
  }));
});
const currentStatusIndex = calls.length - 1;
assert.equal(calls[currentStatusIndex].payload.action, 'status');
assert.equal(calls[currentStatusIndex].payload.target_email, first.email);
await act(async () => { calls[currentStatusIndex].resolve(status(first, 'first-available-work')); });
assert.equal(laborDialog().props.activeLabor, null);
await act(async () => {
  calls[oldLaborIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in',
    active_labor: { id: 'second-stale-labor', activity_type: 'fabrication', user_email: second.email },
    labor_summary: { count: 2, total_minutes: 19 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await oldLabor;
});
assert.equal(laborDialog().props.timeEntry.id, 'first-available-work');
assert.equal(laborDialog().props.activeLabor, null);
assert.equal(laborDialog().props.laborSummary.total_minutes, 0);
console.log('PASS prior employee Current Work acknowledgement cannot replace new session data');

await act(async () => { renderer.unmount(); });
console.log('PASS 13/13 Time Clock Quick Clock async status acceptance cases');
