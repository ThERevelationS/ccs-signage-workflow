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
const savedSessionData = new Map();
let blockClockOutRecoveryStorage = false;
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
  sessionStorage: {
    getItem: (key) => savedSessionData.get(key) || null,
    setItem: (key, value) => {
      if (blockClockOutRecoveryStorage && key.startsWith('ccs_timeclock_pending_clock_out:')) {
        throw new Error('Synthetic browser denies pending Clock Out storage');
      }
      savedSessionData.set(key, String(value));
    },
    removeItem: (key) => { savedSessionData.delete(key); },
  },
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

let invalidatedLabor;
await act(async () => { invalidatedLabor = laborDialog().props.onStartLabor({ activityType: 'cnc' }); });
const invalidatedLaborIndex = calls.length - 1;
assert.equal(calls[invalidatedLaborIndex].payload.action, 'labor_start');
let supersedingBreak;
await act(async () => {
  supersedingBreak = laborDialog().props.onStartBreak({ breakType: 'break', isPaid: true });
});
const supersedingBreakIndex = calls.length - 1;
await act(async () => {
  calls[supersedingBreakIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in', break_status: 'on_break',
    break: { id: 'newer-break', is_paid: true, user_email: second.email },
    active_labor: null, labor_summary: { count: 3, total_minutes: 22 },
    break_summary: { count: 3, total_minutes: 16, paid_minutes: 16, unpaid_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await supersedingBreak;
});
await act(async () => {
  calls[invalidatedLaborIndex].reject(new Error('Obsolete Current Work failure'));
  await assert.rejects(invalidatedLabor, /Obsolete Current Work failure/);
});
assert.equal(laborDialog().props.activeLabor, null);
assert.equal(laborDialog().props.breakStatus, 'on_break');
assert.doesNotMatch(visible(renderer), /Obsolete Current Work failure/,
  'Older labor failure must not show an obsolete warning after the server confirms Break Start');
console.log('PASS superseded Current Work failure cannot overwrite newer Break Start feedback');
let endSupersedingBreak;
await act(async () => { endSupersedingBreak = laborDialog().props.onEndBreak(); });
const endSupersedingIndex = calls.length - 1;
await act(async () => {
  calls[endSupersedingIndex].resolve({ data: {
    success: true, user: second, status: 'clocked_in', break_status: 'working',
    active_labor: null, labor_summary: { count: 3, total_minutes: 22 },
    break_summary: { count: 3, total_minutes: 20, paid_minutes: 20, unpaid_minutes: 0 },
    entry: { id: 'second-break-free', user_email: second.email },
  } });
  await endSupersedingBreak;
});
assert.equal(laborDialog().props.breakStatus, 'working');

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

const oldClockOutDialog = renderer.root.findAll((node) =>
  typeof node.props?.onClockOut === 'function')[0];
assert.ok(oldClockOutDialog);
const originalPayload = {
  lunchMinutes: 0,
  jobAllocations: [{ work_order_id: 'synthetic-original-job', minutes: 45 }],
  notes: 'Original confirmation contents',
};
let interruptedOut;
await act(async () => { interruptedOut = oldClockOutDialog.props.onClockOut(originalPayload); });
const uncertainOutIndex = calls.length - 1;
assert.equal(calls[uncertainOutIndex].payload.action, 'clock_out');
const originalOutRequestId = calls[uncertainOutIndex].payload.request_id;
await act(async () => {
  calls[uncertainOutIndex].reject(new Error('Synthetic Clock Out lost acknowledgement'));
  await assert.rejects(interruptedOut, /Synthetic Clock Out lost acknowledgement/);
});
assert.match(visible(renderer), /first-available-work/);
assert.ok(originalOutRequestId);
let retryOut;
await act(async () => { retryOut = oldClockOutDialog.props.onClockOut(originalPayload); });
const retryOutIndex = calls.length - 1;
assert.equal(calls[retryOutIndex].payload.request_id, originalOutRequestId);
assert.deepEqual(calls[retryOutIndex].payload.job_allocations, calls[uncertainOutIndex].payload.job_allocations);
assert.equal(calls[retryOutIndex].payload.notes, calls[uncertainOutIndex].payload.notes);
await act(async () => {
  calls[retryOutIndex].resolve({ data: {
    success: true, status: 'already_clocked_out', reused: true, user: first,
    entry: { id: 'first-available-work', clock_out:'2026-10-14T20:00:00.000Z' },
  } });
  await retryOut;
});
assert.doesNotMatch(visible(renderer), /first-available-work/);
console.log('PASS lost Clock Out acknowledgement replays original id and payload exactly');

await act(async () => { events.get('focus')(); });
const statusAfterRetryIndex = calls.length - 1;
assert.equal(calls[statusAfterRetryIndex].payload.action, 'status');
await act(async () => { calls[statusAfterRetryIndex].resolve(status(first, 'first-new-shift')); });
const pendingDialog = renderer.root.findAll((node) => typeof node.props?.onClockOut === 'function')[0];
assert.ok(pendingDialog);
let olderClockOut;
await act(async () => { olderClockOut = pendingDialog.props.onClockOut(originalPayload); });
const olderOutIndex = calls.length - 1;
assert.equal(calls[olderOutIndex].payload.action, 'clock_out');
await act(async () => {
  renderer.update(React.createElement(QuickClockSection, {
    allUsers: [first, second], employeeSessionToken: 'session-second-clockout', employeeSessionUser: second,
  }));
});
const secondStatus = calls.length - 1;
assert.equal(calls[secondStatus].payload.action, 'status');
await act(async () => { calls[secondStatus].resolve(status(second, 'second-not-clocked-out')); });
await act(async () => {
  calls[olderOutIndex].resolve({ data: {
    success:true, status:'clocked_out', user:first,
    entry:{id:'first-new-shift',clock_out:'2026-10-14T20:30:00.000Z'},
  } });
  await olderClockOut;
});
assert.match(visible(renderer), /second-not-clocked-out/,
  'Late prior employee Clock Out must never dismiss the new employee active shift');
console.log('PASS late prior-employee Clock Out success cannot close new employee dialog');

await act(async () => { renderer.unmount(); });

let reloadRenderer;
const reloadSessionProps = {
  allUsers:[first,second], employeeSessionToken:'reloaded-signed-first',
  employeeSessionUser:first,
};
await act(async () => {
  reloadRenderer = TestRenderer.create(React.createElement(QuickClockSection, reloadSessionProps));
});
const freshStatusIndex = calls.length - 1;
assert.equal(calls[freshStatusIndex].payload.action, 'status');
await act(async () => { calls[freshStatusIndex].resolve(status(first, 'reloaded-uncertain-shift')); });
const reloadedDialog = () => reloadRenderer.root.findAll((node) =>
  typeof node.props?.onClockOut === 'function')[0];
assert.ok(reloadedDialog());
const reloadPayload = {
  lunchMinutes:0,
  jobAllocations:[{work_order_id:'reloaded-job', minutes:45}],
  notes:'Exact original post-reload body',
};
let awaiting;
await act(async () => { awaiting = reloadedDialog().props.onClockOut(reloadPayload); });
const pendingIndex = calls.length - 1;
const originalId = calls[pendingIndex].payload.request_id;
assert.equal(calls[pendingIndex].payload.action, 'clock_out');
assert.ok(originalId);
assert.ok([...savedSessionData.keys()].some((key) => key.includes('clock_out')),
  'Pending Clock Out recovery must be persisted before making its backend call');
await act(async () => {
  calls[pendingIndex].reject(new Error('Page unload before Clock Out acknowledgement'));
  await assert.rejects(awaiting, /Page unload/);
  reloadRenderer.unmount();
});
await act(async () => {
  reloadRenderer = TestRenderer.create(React.createElement(QuickClockSection, reloadSessionProps));
});
const restoredStatusIndex = calls.length - 1;
assert.equal(calls[restoredStatusIndex].payload.action, 'status');
await act(async () => { calls[restoredStatusIndex].resolve(status(first, 'reloaded-uncertain-shift')); });
const restoredRecovery = reloadedDialog().props.pendingClockOutRecovery;
assert.ok(restoredRecovery, 'Reload must restore pending Clock Out for same verified shift');
assert.equal(restoredRecovery.requestId, originalId);
assert.equal(restoredRecovery.body.notes, reloadPayload.notes);
assert.equal(restoredRecovery.body.job_allocations[0].work_order_id, 'reloaded-job');
await act(async () => {
  reloadRenderer.update(React.createElement(QuickClockSection, {
    allUsers:[first,second], employeeSessionToken:'verified-second-only', employeeSessionUser:second,
  }));
});
const secondReloadIndex = calls.length - 1;
assert.equal(calls[secondReloadIndex].payload.action, 'status');
await act(async () => { calls[secondReloadIndex].resolve(status(second, 'verified-second-shift')); });
assert.equal(reloadedDialog().props.pendingClockOutRecovery, null);
assert.equal(reloadedDialog().props.timeEntry.id, 'verified-second-shift');
assert.ok(savedSessionData.has(`ccs_timeclock_pending_clock_out:${first.email}`),
  'Other employee must neither see nor delete the original employee pending punch');
await act(async () => {
  reloadRenderer.update(React.createElement(QuickClockSection, reloadSessionProps));
});
const returnFirstIndex = calls.length - 1;
assert.equal(calls[returnFirstIndex].payload.action, 'status');
await act(async () => { calls[returnFirstIndex].resolve(status(first, 'reloaded-uncertain-shift')); });
assert.equal(reloadedDialog().props.pendingClockOutRecovery.requestId, originalId);
console.log('PASS pending reload recovery stays scoped to its original verified employee and shift');
let recovered;
await act(async () => { recovered = reloadedDialog().props.onClockOut(reloadPayload); });
const replayIndex = calls.length - 1;
assert.equal(calls[replayIndex].payload.request_id, originalId);
assert.deepEqual(calls[replayIndex].payload.job_allocations, calls[pendingIndex].payload.job_allocations);
await act(async () => {
  calls[replayIndex].resolve({data: {
    success:true, status:'already_clocked_out', reused:true,
    user:first, entry:{id:'reloaded-uncertain-shift',clock_out:'2026-10-14T21:00:00.000Z'},
  }});
  await recovered;
});
assert.doesNotMatch(visible(reloadRenderer), /reloaded-uncertain-shift/);
assert.ok(!savedSessionData.has(`ccs_timeclock_pending_clock_out:${first.email}`) &&
  !savedSessionData.has(`ccs_timeclock_request:clock_out:${first.email}`),
  'Confirmed recovered punch must remove its own persisted payload and id; remaining keys: ' +
    [...savedSessionData.keys()].join(', '));
console.log('PASS full reload restores same-employee exact Clock Out request and clears on confirmation');
await act(async () => { reloadRenderer.unmount(); });

let completedRenderer;
await act(async () => { completedRenderer = TestRenderer.create(React.createElement(QuickClockSection, reloadSessionProps)); });
const completeInitIndex = calls.length - 1;
await act(async () => { calls[completeInitIndex].resolve(status(first, 'already-complete-shift')); });
const completedDialog = completedRenderer.root.findAll((node) => typeof node.props?.onClockOut === 'function')[0];
assert.ok(completedDialog);
let lostAfterCommit;
await act(async () => { lostAfterCommit = completedDialog.props.onClockOut(reloadPayload); });
const completeRequestIndex = calls.length - 1;
await act(async () => {
  calls[completeRequestIndex].reject(new Error('Network dropped after backend committed Clock Out'));
  await assert.rejects(lostAfterCommit, /Network dropped/);
});
assert.ok(savedSessionData.has(`ccs_timeclock_pending_clock_out:${first.email}`));
await act(async () => { completedRenderer.unmount(); });
await act(async () => { completedRenderer = TestRenderer.create(React.createElement(QuickClockSection, reloadSessionProps)); });
const verifyCompleteIndex = calls.length - 1;
assert.equal(calls[verifyCompleteIndex].payload.action, 'status');
await act(async () => {
  calls[verifyCompleteIndex].resolve({data:{success:true,user:first,status:'clocked_out'}});
});
assert.equal(completedRenderer.root.findAll((node) => typeof node.props?.onClockOut === 'function').length,0);
assert.ok(!savedSessionData.has(`ccs_timeclock_pending_clock_out:${first.email}`));
assert.ok(!savedSessionData.has(`ccs_timeclock_request:clock_out:${first.email}`));
console.log('PASS authoritative completed status clears interrupted Clock Out recovery on reload');
await act(async () => { completedRenderer.unmount(); });

let blockedRenderer;
await act(async () => { blockedRenderer = TestRenderer.create(React.createElement(QuickClockSection, reloadSessionProps)); });
const storageStatusIndex = calls.length - 1;
await act(async () => { calls[storageStatusIndex].resolve(status(first, 'browser-storage-blocked-shift')); });
const blockedDialog = blockedRenderer.root.findAll((node) => typeof node.props?.onClockOut === 'function')[0];
assert.ok(blockedDialog);
const beforeStorageBlock = calls.length;
blockClockOutRecoveryStorage = true;
let blockError;
await act(async () => {
  blockError = blockedDialog.props.onClockOut(reloadPayload);
  await assert.rejects(blockError, /cannot preserve the original Clock Out/);
});
blockClockOutRecoveryStorage = false;
assert.equal(calls.length, beforeStorageBlock,
  'Storage-disabled browser must not send Clock Out with unrecoverable retry details');
console.log('PASS unavailable recovery storage fails closed before any official Clock Out request');
await act(async () => { blockedRenderer.unmount(); });

// A new shift returned by authoritative status must invalidate BOTH persisted
// and in-memory Clock Out request ids from the earlier, uncertain shift.
savedSessionData.delete(`ccs_timeclock_request:clock_out:${second.email}`);
savedSessionData.delete(`ccs_timeclock_pending_clock_out:${second.email}`);
let shiftChangeRenderer;
await act(async () => {
  shiftChangeRenderer = TestRenderer.create(React.createElement(QuickClockSection, {
    allUsers:[first,second], employeeSessionToken:'second-shift-recovery', employeeSessionUser:second,
  }));
});
const changeInitialStatusIndex = calls.length - 1;
await act(async () => {
  calls[changeInitialStatusIndex].resolve(status(second, 'second-old-uncertain-entry'));
});
const shiftChangeDialog = () => shiftChangeRenderer.root.findAll((node) =>
  typeof node.props?.onClockOut === 'function')[0];
const shiftChangePayload = {
  lunchMinutes:0, jobAllocations:[{work_order_id:'new-job',minutes:45}],
  notes:'Synthetic old/new shift identity separation',
};
let oldShiftOut;
await act(async () => { oldShiftOut = shiftChangeDialog().props.onClockOut(shiftChangePayload); });
const oldShiftOutIndex = calls.length - 1;
const oldShiftRequestId = calls[oldShiftOutIndex].payload.request_id;
await act(async () => {
  calls[oldShiftOutIndex].reject(new Error('Old shift confirmation lost'));
  await assert.rejects(oldShiftOut,/Old shift confirmation lost/);
});
assert.ok(savedSessionData.has(`ccs_timeclock_pending_clock_out:${second.email}`));
await act(async () => { events.get('focus')(); });
const newShiftStatusIndex = calls.length - 1;
assert.equal(calls[newShiftStatusIndex].payload.action,'status');
await act(async () => {
  calls[newShiftStatusIndex].resolve(status(second, 'second-new-server-verified-entry'));
});
assert.equal(shiftChangeDialog().props.timeEntry.id,'second-new-server-verified-entry');
assert.equal(shiftChangeDialog().props.pendingClockOutRecovery,null);
assert.equal(savedSessionData.has(`ccs_timeclock_pending_clock_out:${second.email}`),false);
assert.equal(savedSessionData.has(`ccs_timeclock_request:clock_out:${second.email}`),false);
let newShiftOut;
await act(async () => { newShiftOut = shiftChangeDialog().props.onClockOut(shiftChangePayload); });
const newShiftOutIndex = calls.length - 1;
assert.equal(calls[newShiftOutIndex].payload.action,'clock_out');
assert.notEqual(calls[newShiftOutIndex].payload.request_id,oldShiftRequestId,
  'New authoritative shift must use a new Clock Out request identity after stale recovery is cleared');
await act(async () => {
  calls[newShiftOutIndex].resolve({data:{
    success:true,status:'clocked_out',user:second,
    entry:{id:'second-new-server-verified-entry',clock_out:'2026-10-15T22:00:00.000Z'},
  }});
  await newShiftOut;
});
console.log('PASS new authoritative shift never inherits previous uncertain Clock Out request ID');
await act(async () => { shiftChangeRenderer.unmount(); });

// An old in-flight Clock Out from a replaced session must not delete the new
// request's recovery snapshot when its delayed acknowledgement finally arrives.
let overlapRenderer;
await act(async () => {
  overlapRenderer = TestRenderer.create(React.createElement(QuickClockSection, {
    allUsers:[first,second], employeeSessionToken:'old-device-session', employeeSessionUser:second,
  }));
});
const overlapInitialIndex = calls.length - 1;
await act(async () => { calls[overlapInitialIndex].resolve(status(second,'first-overlap-entry')); });
const overlapDialog = () => overlapRenderer.root.findAll((node) =>
  typeof node.props?.onClockOut === 'function')[0];
let oldOverlapOut;
await act(async () => { oldOverlapOut = overlapDialog().props.onClockOut(shiftChangePayload); });
const oldOverlapIndex = calls.length - 1;
const oldOverlapId = calls[oldOverlapIndex].payload.request_id;
await act(async () => {
  overlapRenderer.update(React.createElement(QuickClockSection, {
    allUsers:[first,second], employeeSessionToken:'new-device-session', employeeSessionUser:second,
  }));
});
const overlapNewStatusIndex = calls.length - 1;
assert.equal(calls[overlapNewStatusIndex].payload.action,'status');
await act(async () => { calls[overlapNewStatusIndex].resolve(status(second,'second-overlap-entry')); });
let newOverlapOut;
await act(async () => { newOverlapOut = overlapDialog().props.onClockOut(shiftChangePayload); });
const newOverlapIndex = calls.length - 1;
const newOverlapId = calls[newOverlapIndex].payload.request_id;
assert.notEqual(newOverlapId,oldOverlapId);
await act(async () => {
  calls[oldOverlapIndex].resolve({data:{
    success:true,status:'clocked_out',user:second,
    entry:{id:'first-overlap-entry',clock_out:'2026-10-15T21:00:00.000Z'},
  }});
  await oldOverlapOut;
});
assert.equal(savedSessionData.get(`ccs_timeclock_request:clock_out:${second.email}`),newOverlapId,
  'Old acknowledgement cannot delete the newer shift request id');
const newOverlapSnapshot = JSON.parse(savedSessionData.get(`ccs_timeclock_pending_clock_out:${second.email}`));
assert.equal(newOverlapSnapshot.requestId,newOverlapId,
  'Old acknowledgement cannot delete the newer shift recovery body');
assert.match(visible(overlapRenderer),/second-overlap-entry/,
  'Prior shift success must not dismiss a newer shift');
await act(async () => {
  calls[newOverlapIndex].resolve({data:{
    success:true,status:'clocked_out',user:second,
    entry:{id:'second-overlap-entry',clock_out:'2026-10-15T22:00:00.000Z'},
  }});
  await newOverlapOut;
});
assert.equal(savedSessionData.has(`ccs_timeclock_request:clock_out:${second.email}`),false);
assert.equal(savedSessionData.has(`ccs_timeclock_pending_clock_out:${second.email}`),false);
console.log('PASS previous session late Clock Out cannot delete newer shift request or recovery data');
await act(async () => { overlapRenderer.unmount(); });
console.log('PASS 22/22 Time Clock Quick Clock async status acceptance cases');
