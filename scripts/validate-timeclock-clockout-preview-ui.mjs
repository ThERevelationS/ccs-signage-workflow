// Isolated renderer acceptance for Clock Out labor preview and allocation drafts.
// Uses deferred mock promises. Never sends a live Base44 request.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const source = readFileSync(new URL('../src/components/timeclock/ClockOutDialog.jsx', import.meta.url), 'utf8');
const transformed = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const require = createRequire(import.meta.url);
const passthrough = ({ children, ...props }) => React.createElement('section', {
  'data-component': 'layout', 'data-open': props.open,
}, children);
const Btn = ({ children, onClick, disabled }) =>
  React.createElement('button', { onClick, disabled }, children);
const Input = ({ value, onChange, placeholder }) =>
  React.createElement('input', { value, onChange, placeholder });
const Label = ({ children }) => React.createElement('label', null, children);
const icons = ['Search','Plus','Trash2','Clock','Coffee','Briefcase','Home','FileText','Loader2','Pause'];
const module = { exports: {} };
const mocks = {
  '@/api/base44Client': { base44: { entities: { WorkOrder: {} } } },
  '@/components/ui/dialog': {
    Dialog: passthrough, DialogContent: passthrough, DialogHeader: passthrough, DialogTitle: passthrough,
  },
  '@/components/ui/button': { Button: Btn },
  '@/components/ui/input': { Input },
  '@/components/ui/label': { Label },
  '@/components/ui/select': {
    Select: passthrough, SelectContent: passthrough, SelectItem: passthrough,
    SelectTrigger: passthrough, SelectValue: passthrough,
  },
  '@/components/ui/textarea': { Textarea: Input },
  'lucide-react': Object.fromEntries(icons.map((name) => [name, () => React.createElement('svg')])),
  '@/components/estimator/loadAllEntityRows': { loadAllEntityRows: async () => [] },
  '@/components/timeclock/CurrentWorkCard': () => React.createElement('aside'),
};
vm.runInNewContext(transformed, {
  module, exports: module.exports,
  require: (id) => mocks[id] || require(id),
  console, Date, Math, Promise, Number, String,
  setInterval: () => 1, clearInterval: () => {},
  setTimeout: () => 1, clearTimeout: () => {},
}, {filename:'synthetic-clockout-preview.js'});
const ClockOutDialog = module.exports.default;
const calls = [];
const owner = (email, id) => ({ id, user_email: email, status:'clocked_in',
  clock_in:'2026-10-14T12:00:00.000Z' });
const first = owner('first@synthetic.invalid','shift-first');
const second = owner('second@synthetic.invalid','shift-second');
const preview = (label, id) => ({ preview: {
  generated_at:'2026-10-14T14:00:00.000Z',
  elapsed_minutes: 120, tracked_minutes: 70, segment_count:1, tracked_unpaid_minutes:0,
  work_pause_minutes:0, suggested_allocations:[{
    work_order_id: id, work_order_title: label, client_name:'Synthetic',
    minutes:70, hours:70/60, is_inhouse:false,
  }],
} });
const fetchPreview = () => new Promise((resolve, reject) => calls.push({ resolve, reject }));
const propsFor = (entry, overrides={}) => ({
  isOpen:true, timeEntry:entry, onClose:()=>{}, onClockOut:async()=>{},
  onLoadLaborAllocationPreview:fetchPreview,
  ...overrides,
});
const renderedText = (renderer) => JSON.stringify(renderer.toJSON());
const childText = (child) => {
  if (typeof child === 'string' || typeof child === 'number') return String(child);
  if (Array.isArray(child)) return child.map(childText).join(' ');
  if (React.isValidElement(child)) return childText(child.props.children);
  return '';
};
const clickButton = (renderer, label) => {
  const btn = renderer.root.findAllByType(Btn).find((x) =>
    childText(x.props.children).includes(label));
  assert.ok(btn, `Missing button: ${label}`);
  return btn.props.onClick;
};
let tree;
await act(async () => { tree = TestRenderer.create(React.createElement(ClockOutDialog, propsFor(first))); });
assert.equal(calls.length,1,'First shift loads first preview');
await act(async () => { tree.update(React.createElement(ClockOutDialog, propsFor(second))); });
assert.equal(calls.length,2,'Second shift should not be blocked by first shift preview');
await act(async () => { calls[1].resolve(preview('Second Shift Work', 'second-job')); });
assert.match(renderedText(tree), /Second Shift Work/);
await act(async () => { calls[0].resolve(preview('First Shift Work', 'first-job')); });
assert.match(renderedText(tree), /Second Shift Work/);
assert.doesNotMatch(renderedText(tree), /First Shift Work/,
  'Prior shift preview may not replace another employee\'s suggested allocations');
console.log('PASS prior shift preview cannot overwrite newly restored employee shift');

await act(async () => { clickButton(tree, 'In House')(); });
assert.match(renderedText(tree), /In House Projects/);
await act(async () => { clickButton(tree, 'Refresh')(); });
assert.equal(calls.length,3);
await act(async () => { calls[2].resolve(preview('Late Auto Preview', 'late-job')); });
assert.match(renderedText(tree), /In House Projects/);
assert.doesNotMatch(renderedText(tree), /Late Auto Preview/,
  'Refresh may update suggestions but must not silently replace employee allocations');
console.log('PASS refreshed suggestions do not overwrite employee-edited allocations');

await act(async () => { clickButton(tree, 'Refresh')(); });
assert.equal(calls.length,4);
await act(async () => {
  tree.update(React.createElement(ClockOutDialog, propsFor(second, {isOpen:false})));
});
await act(async () => { tree.update(React.createElement(ClockOutDialog, propsFor(second))); });
assert.equal(calls.length,5,'Reopening same shift should launch a fresh preview');
assert.match(renderedText(tree), /In House Projects/,
  'Reopening the same shift must retain manually entered allocation drafts');
await act(async () => { calls[4].resolve(preview('Latest Same Shift', 'second-new')); });
await act(async () => { calls[3].resolve(preview('Old Before Dialog Closed', 'old-close')); });
assert.match(renderedText(tree), /In House Projects/);
await act(async () => { clickButton(tree, 'Apply Tracked Suggestions')(); });
assert.match(renderedText(tree), /Latest Same Shift/,
  'Explicit Apply Suggestions must use the latest open-cycle preview');
assert.doesNotMatch(renderedText(tree), /Old Before Dialog Closed/,
  'Pending preview from a closed dialog must not overwrite later same-shift refresh');
console.log('PASS close and reopen preserves draft, and deliberate Apply uses newest preview');

await act(async () => { tree.update(React.createElement(ClockOutDialog, propsFor(first))); });
assert.equal(calls.length,6);
await act(async () => { calls[5].resolve(preview('Fresh First Shift', 'first-fresh')); });
assert.match(renderedText(tree), /Fresh First Shift/);
assert.doesNotMatch(renderedText(tree), /Latest Same Shift|In House Projects|Second Shift Work/,
  'Switching shifts must reset previous employee draft allocations');
console.log('PASS shift transition clears prior employee drafts and accepts only its fresh preview');

await act(async () => { clickButton(tree, 'In House')(); });
assert.match(renderedText(tree), /In House Projects/);
const beforeMissingService = calls.length;
await act(async () => {
  tree.update(React.createElement(ClockOutDialog, propsFor(second, {
    onLoadLaborAllocationPreview: null,
  })));
});
assert.equal(calls.length, beforeMissingService);
assert.doesNotMatch(renderedText(tree), /Fresh First Shift|In House Projects/,
  'Switching employees must clear prior allocations even without a preview service');
console.log('PASS shift change clears drafts when suggestion service is unavailable');

await act(async () => { tree.unmount(); });

const submitCalls = [];
const submitted = [];
const submitPreview = () => new Promise((resolve, reject) => submitCalls.push({resolve, reject}));
const submissionProps = (entry, extra={}) => propsFor(entry, {
  onLoadLaborAllocationPreview: submitPreview,
  onClockOut: async (data) => { submitted.push(data); },
  ...extra,
});
const editableLunch = (renderer) => renderer.root.findAllByType(Input).find((node) =>
  node.props.placeholder === 'Enter 0 if none');
const clickClockOut = (renderer) => clickButton(renderer, 'Clock Out');
let submissionTree;
await act(async () => {
  submissionTree = TestRenderer.create(React.createElement(ClockOutDialog, submissionProps(first)));
});
assert.equal(submitCalls.length, 1);
const reconciled = (label, id, elapsedMinutes = 70) => {
  const result = preview(label, id);
  result.preview.elapsed_minutes = elapsedMinutes;
  return result;
};
await act(async () => { submitCalls[0].resolve(reconciled('Ready for submission', 'first-submit')); });
assert.ok(editableLunch(submissionTree));
await act(async () => { editableLunch(submissionTree).props.onChange({target:{value:'0'}}); });
let completedClockOut;
await act(async () => { completedClockOut = clickClockOut(submissionTree)(); });
assert.equal(submitCalls.length, 2, 'Clock Out requires a fresh server reconciliation');
await act(async () => {
  submitCalls[1].resolve(reconciled('Ready for submission', 'first-submit'));
  await completedClockOut;
});
assert.equal(submitted.length, 1,
  'Valid confirmed reconciliation must allow Clock Out with preserved allocations');
assert.equal(submitted[0].jobAllocations[0].work_order_id, 'first-submit');
console.log('PASS final server reconciliation accepts unchanged manually reviewed allocations');

await act(async () => {
  submissionTree.update(React.createElement(ClockOutDialog, submissionProps(second)));
});
assert.equal(submitCalls.length, 3);
await act(async () => { submitCalls[2].resolve(reconciled('Second prepared', 'second-submit')); });
await act(async () => { editableLunch(submissionTree).props.onChange({target:{value:'0'}}); });
let priorPendingOut;
await act(async () => { priorPendingOut = clickClockOut(submissionTree)(); });
assert.equal(submitCalls.length, 4);
await act(async () => {
  submissionTree.update(React.createElement(ClockOutDialog, submissionProps(first)));
});
assert.equal(submitCalls.length, 5);
await act(async () => { submitCalls[4].resolve(reconciled('First restored', 'first-restored')); });
const countBeforeLate = submitted.length;
await act(async () => {
  submitCalls[3].resolve(reconciled('Outdated second', 'second-submit'));
  await priorPendingOut;
});
assert.equal(submitted.length, countBeforeLate,
  'Final reconciliation from prior employee must never submit a stale Clock Out');
assert.match(renderedText(submissionTree), /First restored/);
assert.doesNotMatch(renderedText(submissionTree), /Outdated second/);
console.log('PASS previous employee final reconciliation cannot submit or replace new shift');

await act(async () => { submissionTree.unmount(); });

const guardedCalls = [];
const guardedSubmitted = [];
const guardedPreview = () => new Promise((resolve, reject) => guardedCalls.push({resolve, reject}));
const guardedProps = (entry, extra={}) => propsFor(entry, {
  onLoadLaborAllocationPreview: guardedPreview,
  onClockOut: async (data) => { guardedSubmitted.push(data); },
  ...extra,
});
let guardedTree;
await act(async () => {
  guardedTree = TestRenderer.create(React.createElement(ClockOutDialog, guardedProps(first)));
});
await act(async () => { guardedCalls[0].resolve(reconciled('Manually reviewed', 'guarded-job')); });
await act(async () => { editableLunch(guardedTree).props.onChange({target:{value:'0'}}); });
let pendingDouble;
await act(async () => {
  pendingDouble = clickClockOut(guardedTree)();
  clickClockOut(guardedTree)();
});
assert.equal(guardedCalls.length, 2, 'Same-tick double Clock Out must only send one final preview request');
await act(async () => { clickButton(guardedTree, 'In House')(); });
assert.match(renderedText(guardedTree), /In House Projects/);
await act(async () => {
  guardedCalls[1].resolve(reconciled('Manually reviewed', 'guarded-job'));
  await pendingDouble;
});
assert.equal(guardedSubmitted.length, 0,
  'Employee allocations edited after reconciliation begins must not be submitted from stale draft');
assert.match(renderedText(guardedTree), /allocations changed during server reconciliation/);
assert.match(renderedText(guardedTree), /In House Projects/,
  'Interrupted reconciliation must retain all manually edited allocations');
console.log('PASS same-tick duplicate and midflight draft edit fail closed with draft preserved');

await act(async () => {
  guardedTree.update(React.createElement(ClockOutDialog, guardedProps(second)));
});
assert.equal(guardedCalls.length, 3);
await act(async () => { guardedCalls[2].resolve(reconciled('Changed server totals', 'changed-job')); });
await act(async () => { editableLunch(guardedTree).props.onChange({target:{value:'0'}}); });
let changedTotals;
await act(async () => { changedTotals = clickClockOut(guardedTree)(); });
assert.equal(guardedCalls.length, 4);
await act(async () => {
  guardedCalls[3].resolve(reconciled('Changed server totals', 'changed-job', 90));
  await changedTotals;
});
assert.equal(guardedSubmitted.length, 0,
  'Shift duration change beyond reconciliation tolerance must never clock out');
assert.match(renderedText(guardedTree), /remains|over-allocated/,
  'Employee must be prompted to reconcile the new authoritative minutes');
assert.match(renderedText(guardedTree), /Changed server totals/,
  'Updated authoritative server preview must be shown without erasing the draft');
console.log('PASS changed authoritative totals block submission and retain allocations');

await act(async () => { guardedTree.unmount(); });

const lostCalls = [];
const sentPayloads = [];
let confirmCount = 0;
const lostPreview = () => new Promise((resolve, reject) => lostCalls.push({ resolve, reject }));
const lostAck = async (data) => {
  sentPayloads.push(JSON.parse(JSON.stringify(data)));
  if (++confirmCount === 1) {
    const err = new Error('Clock Out acknowledgement interrupted');
    err.ambiguousOutcome = true;
    throw err;
  }
  return { success: true };
};
let lostTree;
await act(async () => {
  lostTree = TestRenderer.create(React.createElement(ClockOutDialog, propsFor(first, {
    onLoadLaborAllocationPreview: lostPreview, onClockOut: lostAck,
  })));
});
await act(async () => { lostCalls[0].resolve(reconciled('Retry-safe work', 'retry-job')); });
await act(async () => { editableLunch(lostTree).props.onChange({target:{value:'0'}}); });
let lostFirst;
await act(async () => { lostFirst = clickClockOut(lostTree)(); });
assert.equal(lostCalls.length, 2);
await act(async () => {
  lostCalls[1].resolve(reconciled('Retry-safe work', 'retry-job'));
  await lostFirst;
});
assert.equal(sentPayloads.length, 1);
assert.match(renderedText(lostTree), /Clock Out acknowledgement interrupted/);
await act(async () => { editableLunch(lostTree).props.onChange({target:{value:'5'}}); });
let unsafeRetry;
await act(async () => { unsafeRetry = clickClockOut(lostTree)(); await unsafeRetry; });
assert.equal(sentPayloads.length, 1);
assert.equal(lostCalls.length, 2);
assert.match(renderedText(lostTree), /earlier Clock Out is unconfirmed/,
  'Edited draft must not replace an uncertain Clock Out payload');
assert.match(renderedText(lostTree), /Retry-safe work/,
  'Employee draft should remain intact after an unsafe retry is refused');
console.log('PASS uncertain Clock Out blocks edited allocations until original draft restored');
await act(async () => { editableLunch(lostTree).props.onChange({target:{value:'0'}}); });
let lostRetry;
await act(async () => { lostRetry = clickClockOut(lostTree)(); });
assert.equal(lostCalls.length, 2,
  'Uncertain Clock Out retry must not regenerate authoritative reconciliation');
await act(async () => { await lostRetry; });
assert.equal(sentPayloads.length, 2);
assert.deepEqual(sentPayloads[1], sentPayloads[0],
  'Uncertain retry must reuse exactly the same submitted lunch, allocations, and notes');
console.log('PASS interrupted Clock Out retries identical payload without new preview');

await act(async () => { lostTree.unmount(); });

const reloadCalls = [];
const reloadSubmissions = [];
const pendingRecovery = {
  version: 1, email:first.user_email, entryId:first.id, requestId:'synthetic-reload-request',
  body: {
    lunch_minutes: 0,
    notes:'Original restored notes',
    job_allocations:[{
      work_order_id:'persisted-job', work_order_title:'Persisted original work',
      client_name:'Synthetic', minutes:70, hours:70/60, is_inhouse:false,
    }],
  },
};
const reloadFetch = () => new Promise((resolve, reject) => reloadCalls.push({resolve, reject}));
let recoveryTree;
await act(async () => {
  recoveryTree = TestRenderer.create(React.createElement(ClockOutDialog, propsFor(first, {
    pendingClockOutRecovery:pendingRecovery,
    onLoadLaborAllocationPreview:reloadFetch,
    onClockOut:async (data) => { reloadSubmissions.push(JSON.parse(JSON.stringify(data))); },
  })));
});
assert.equal(reloadCalls.length, 1);
assert.match(renderedText(recoveryTree), /Retry Original Clock Out/);
assert.match(renderedText(recoveryTree), /Persisted original work/);
await act(async () => { reloadCalls[0].resolve(reconciled('Newly tracked server work','new-server-job',90)); });
assert.doesNotMatch(renderedText(recoveryTree), /Newly tracked server work/,
  'New server preview must not auto-replace a recovery draft');
await act(async () => { editableLunch(recoveryTree).props.onChange({target:{value:'5'}}); });
let blockedRecovery;
await act(async () => {
  blockedRecovery = clickButton(recoveryTree,'Retry Original Clock Out')();
  await blockedRecovery;
});
assert.equal(reloadSubmissions.length, 0);
assert.match(renderedText(recoveryTree), /earlier Clock Out is unconfirmed/);
await act(async () => { editableLunch(recoveryTree).props.onChange({target:{value:'0'}}); });
let completedRecovery;
await act(async () => {
  completedRecovery = clickButton(recoveryTree,'Retry Original Clock Out')();
  await completedRecovery;
});
assert.equal(reloadCalls.length, 1,
  'Confirmed server snapshot already exists; exact retry needs no further preview');
assert.equal(reloadSubmissions.length, 1);
assert.equal(reloadSubmissions[0].notes, pendingRecovery.body.notes);
assert.equal(reloadSubmissions[0].jobAllocations[0].work_order_id, 'persisted-job');
console.log('PASS reload dialog restores exact original allocations; changed draft fails closed');

await act(async () => { recoveryTree.update(React.createElement(ClockOutDialog, propsFor(second, {
  pendingClockOutRecovery:pendingRecovery,
  onLoadLaborAllocationPreview:reloadFetch,
  onClockOut:async (data) => { reloadSubmissions.push(data); },
}))); });
assert.equal(reloadCalls.length, 2);
assert.doesNotMatch(renderedText(recoveryTree), /Persisted original work|Original restored notes/,
  'Other employee shift may not display prior shift recovery details');
assert.doesNotMatch(renderedText(recoveryTree), /Retry Original Clock Out/,
  'Other employee cannot invoke the original pending punch');
console.log('PASS recovery details and button are not visible in another employee shift');
await act(async () => { reloadCalls[1].resolve(reconciled('Other employee work','other-work')); });
await act(async () => { recoveryTree.unmount(); });
console.log('PASS 13/13 Clock Out preview and allocation draft scenarios');
