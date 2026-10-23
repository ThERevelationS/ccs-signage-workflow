// Synthetic-only read-scope and enrollment fencing regression for Time Clock.
// Covers PTOBalanceView per-employee read fencing, TimeClockShiftDetail
// per-entry read fencing, and FaceEnrollmentDialog capture-to-record identity
// binding + stale-save suppression. No live Base44 calls or production records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
const textOf = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.children);
};
const allText = (renderer) => textOf(renderer.root);
const buttons = (renderer) => renderer.root.findAll((n) => n.type === 'button');
const buttonByText = (renderer, needle) =>
  buttons(renderer).find((b) => textOf(b).includes(needle));

const icon = () => React.createElement('svg');
const iconModule = new Proxy({}, { get: () => icon });
const passthrough = (name) => ({ children }) => React.createElement('div', { 'data-mock': name }, children);
const Button = ({ children, onClick, disabled, type }) =>
  React.createElement('button', { onClick, disabled, type }, children);
const DialogCtx = React.createContext(null);
const uiDialogMocks = {
  Dialog: ({ open, onOpenChange, children }) =>
    React.createElement(DialogCtx.Provider, { value: { open, onOpenChange } }, children),
  DialogContent: passthrough('DialogContent'),
  DialogHeader: passthrough('DialogHeader'),
  DialogTitle: passthrough('DialogTitle'),
  DialogDescription: passthrough('DialogDescription'),
};
const uiMocks = {
  '@/components/ui/button': { Button },
  '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', null, children) },
  '@/components/ui/progress': { Progress: () => React.createElement('div') },
  '@/components/ui/dialog': uiDialogMocks,
  'lucide-react': iconModule,
  'date-fns': { format: () => '', parseISO: (v) => new Date(v) },
};

const loadComponent = (path, extraMocks, contextExtra = {}) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (id) => (id in extraMocks ? extraMocks[id] : require(id)),
    console, window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    document: { visibilityState: 'visible', createElement: () => ({ getContext: () => null, click() {}, setAttribute() {}, style: {} }), addEventListener() {}, removeEventListener() {}, body: { appendChild() {}, removeChild() {} } },
    Date, Math, Promise, Object, Number, String, Map, Set, JSON, Array, Boolean, Error,
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {},
    CustomEvent: class { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } },
    ...contextExtra,
  }, { filename: path.split('/').pop() });
  return module.exports.default;
};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// ============================================================
// PTOBalanceView — per-employee read fencing
// ============================================================
const USER_A = { id: 'u-a', email: 'amy@example.com', full_name: 'Amy A' };
const USER_B = { id: 'u-b', email: 'brian@example.com', full_name: 'Brian B' };
const BAL_A = { id: 'bal-a', user_email: 'amy@example.com', policy_id: 'pol-a', vacation_hours: 8 };
const BAL_B = { id: 'bal-b', user_email: 'brian@example.com', policy_id: 'pol-b', vacation_hours: 4 };
const POLICY_A = { id: 'pol-a', name: 'POLICY-A', time_off_types: [] };
const POLICY_B = { id: 'pol-b', name: 'POLICY-B', time_off_types: [] };

async function ptoScenario() {
  const loaderCalls = [];
  const loaderQueue = [];
  const policyCalls = [];
  const policyQueue = [];
  const entitiesProxy = new Proxy({}, {
    get: (_t, name) => (name === 'PTOPolicy'
      ? { filter: (q) => { policyCalls.push(q); const d = deferred(); policyQueue.push(d); return d.promise; } }
      : { filter: () => Promise.resolve([]) }),
  });
  const base44Mock = { entities: entitiesProxy };
  const PTOBalanceView = loadComponent('../src/components/timeclock/PTOBalanceView.jsx', {
    ...uiMocks,
    '@/api/base44Client': { base44: base44Mock },
    '@/components/estimator/loadAllEntityRows': {
      loadAllEntityRows: (args) => { loaderCalls.push(args); const d = deferred(); loaderQueue.push(d); return d.promise; },
    },
  });

  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(PTOBalanceView, { currentUser: USER_A })); });
  // A's load issues two loader calls (balance + requests).
  assert.equal(loaderCalls.length, 2, 'A load should issue two loader calls');

  // Switch to B before A resolves.
  await act(async () => { renderer.update(React.createElement(PTOBalanceView, { currentUser: USER_B })); });
  assert.equal(loaderCalls.length, 4, 'B load should issue two more loader calls');

  // Resolve A's calls — stale scope must not apply.
  await act(async () => {
    loaderQueue[0].resolve([BAL_A]);
    loaderQueue[1].resolve([]);
    await flush();
  });
  assert.ok(!allText(renderer).includes('POLICY-A'), 'A policy must never render under B');
  assert.ok(!allText(renderer).includes('No PTO policy assigned'), 'stale empty state must not apply under B');
  // B's policy id should be requested once B's balance resolves.
  await act(async () => {
    loaderQueue[2].resolve([BAL_B]);
    loaderQueue[3].resolve([]);
    await flush();
  });
  assert.equal(policyCalls.length, 1, 'only B policy should be fetched');
  assert.equal(policyCalls[0].id, 'pol-b');
  await act(async () => { policyQueue[0].resolve([POLICY_B]); await flush(); });
  assert.ok(allText(renderer).includes('POLICY-B'), 'B policy must render');
  assert.ok(!allText(renderer).includes('POLICY-A'));

  // Even a superseded A resolution arriving after B applied must not overwrite.
  renderer.unmount();
  return 'PTOBalanceView: in-flight read for employee A cannot apply under employee B';
}

async function ptoStaleAfterApplyScenario() {
  const loaderQueue = [];
  const policyQueue = [];
  const entitiesProxy = new Proxy({}, {
    get: (_t, name) => (name === 'PTOPolicy'
      ? { filter: () => { const d = deferred(); policyQueue.push(d); return d.promise; } }
      : { filter: () => Promise.resolve([]) }),
  });
  const PTOBalanceView = loadComponent('../src/components/timeclock/PTOBalanceView.jsx', {
    ...uiMocks,
    '@/api/base44Client': { base44: { entities: entitiesProxy } },
    '@/components/estimator/loadAllEntityRows': {
      loadAllEntityRows: () => { const d = deferred(); loaderQueue.push(d); return d.promise; },
    },
  });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(PTOBalanceView, { currentUser: USER_A })); });
  await act(async () => { renderer.update(React.createElement(PTOBalanceView, { currentUser: USER_B })); });
  // Resolve B first, then a very-late A resolution — scope must still block it.
  await act(async () => { loaderQueue[2].resolve([BAL_B]); loaderQueue[3].resolve([]); await flush(); });
  await act(async () => { policyQueue[0].resolve([POLICY_B]); await flush(); });
  await act(async () => { loaderQueue[0].resolve([BAL_A]); loaderQueue[1].resolve([]); await flush(); });
  assert.ok(allText(renderer).includes('POLICY-B'), 'B state must survive a late A resolution');
  assert.ok(!allText(renderer).includes('POLICY-A'));
  renderer.unmount();
  return 'PTOBalanceView: late A resolution cannot overwrite applied B state';
}

// ============================================================
// TimeClockShiftDetail — per-entry read fencing
// ============================================================
const ENTRY_A = { id: 'entry-a', user_email: 'amy@example.com', pay_period_id: null, job_allocations: [] };
const ENTRY_B = { id: 'entry-b', user_email: 'brian@example.com', pay_period_id: null, job_allocations: [] };

async function shiftDetailScenario() {
  const filterCalls = [];
  const entitiesProxy = new Proxy({}, {
    get: (_t, name) => ({ filter: (q) => {
      if (name === 'TimeClockPayPeriod') return Promise.resolve([]);
      const d = deferred();
      filterCalls.push({ entity: name, query: q, d });
      return d.promise;
    } }),
  });
  const ShiftDetail = loadComponent('../src/components/timeclock/TimeClockShiftDetail.jsx', {
    ...uiMocks,
    '@/api/base44Client': { base44: { entities: entitiesProxy } },
  });
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ShiftDetail, { entry: ENTRY_A, open: true, onOpenChange: () => {} }));
  });
  const aCalls = filterCalls.filter((c) => c.query?.time_entry_id === 'entry-a');
  assert.ok(aCalls.length >= 5, 'entry A detail read should fan out per entity');

  // Switch the entry prop before A's reads resolve.
  await act(async () => {
    renderer.update(React.createElement(ShiftDetail, { entry: ENTRY_B, open: true, onOpenChange: () => {} }));
  });
  const bCalls = filterCalls.filter((c) => c.query?.time_entry_id === 'entry-b');
  assert.ok(bCalls.length >= 5, 'entry B detail read should issue fresh queries');

  // Resolve A's calls with poisoned corrections — stale scope must not apply.
  await act(async () => {
    for (const c of aCalls) {
      c.d.resolve(c.entity === 'TimeClockCorrectionRequest'
        ? [{ id: 'cr-a', employee_reason: 'STALE-A-CORRECTION', requested_at: '2024-01-01' }]
        : []);
    }
    await flush();
  });
  assert.ok(!allText(renderer).includes('STALE-A-CORRECTION'), 'entry A corrections must not render under entry B');

  // Resolve B's calls — fresh scope applies normally.
  await act(async () => {
    for (const c of bCalls) {
      c.d.resolve(c.entity === 'TimeClockCorrectionRequest'
        ? [{ id: 'cr-b', employee_reason: 'FRESH-B-CORRECTION', requested_at: '2024-01-02' }]
        : []);
    }
    await flush();
  });
  assert.ok(allText(renderer).includes('FRESH-B-CORRECTION'), 'entry B corrections must render');

  // Closing invalidates: resolve another late A batch then close — state stays.
  await act(async () => {
    renderer.update(React.createElement(ShiftDetail, { entry: ENTRY_B, open: false, onOpenChange: () => {} }));
  });
  assert.ok(!allText(renderer).includes('FRESH-B-CORRECTION'), 'closed dialog clears scoped state');
  renderer.unmount();
  return 'TimeClockShiftDetail: in-flight detail for entry A cannot apply under entry B';
}

// ============================================================
// FaceEnrollmentDialog — capture-to-record binding + stale save
// ============================================================
const FACE = [{ d: 1 }, { d: 2 }, { d: 3 }];

async function faceIdentityMismatchScenario() {
  const persistCalls = [];
  const FaceEnrollmentDialog = loadComponent('../src/components/timeclock/FaceEnrollmentDialog.jsx', {
    ...uiMocks,
    '@/api/base44Client': { base44: { entities: new Proxy({}, { get: () => ({}) }) } },
    './FaceRecognition': ({ onEnrollCapture }) =>
      React.createElement('button', { onClick: () => onEnrollCapture?.(FACE) }, 'capture-face'),
    '@/components/admin/authorizedEmailPersistence': {
      updateAuthorizedEmailIfUnchanged: (args) => { persistCalls.push(args); return Promise.resolve({ updated: true }); },
    },
  });
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(FaceEnrollmentDialog, {
      isOpen: true, onClose: () => {}, user: USER_A, onSuccess: () => {},
    }));
  });
  await act(async () => { buttonByText(renderer, 'capture-face').props.onClick(); await flush(); });
  // Employee prop switches after capture — the face belongs to A.
  await act(async () => {
    renderer.update(React.createElement(FaceEnrollmentDialog, {
      isOpen: true, onClose: () => {}, user: USER_B, onSuccess: () => {},
    }));
  });
  await act(async () => { buttonByText(renderer, 'Save Face Data').props.onClick(); await flush(); });
  assert.equal(persistCalls.length, 0, 'capture for A must never be written to B record');
  assert.ok(allText(renderer).includes('different employee'), 'identity mismatch must fail closed with an explanation');
  renderer.unmount();
  return 'FaceEnrollmentDialog: captured face data cannot be bound to a different employee record';
}

async function faceStaleSaveScenario() {
  const persist = deferred();
  let successCalls = 0;
  let closeCalls = 0;
  const FaceEnrollmentDialog = loadComponent('../src/components/timeclock/FaceEnrollmentDialog.jsx', {
    ...uiMocks,
    '@/api/base44Client': { base44: { entities: new Proxy({}, { get: () => ({}) }) } },
    './FaceRecognition': ({ onEnrollCapture }) =>
      React.createElement('button', { onClick: () => onEnrollCapture?.(FACE) }, 'capture-face'),
    '@/components/admin/authorizedEmailPersistence': {
      updateAuthorizedEmailIfUnchanged: () => persist.promise,
    },
  });
  let renderer;
  const props = () => ({
    isOpen: true, user: USER_A,
    onClose: () => { closeCalls += 1; },
    onSuccess: () => { successCalls += 1; },
  });
  await act(async () => { renderer = TestRenderer.create(React.createElement(FaceEnrollmentDialog, props())); });
  await act(async () => { buttonByText(renderer, 'capture-face').props.onClick(); await flush(); });
  await act(async () => { buttonByText(renderer, 'Save Face Data').props.onClick(); await flush(); });
  // Dialog closes while the save is in flight.
  await act(async () => { buttonByText(renderer, 'Cancel').props.onClick(); await flush(); });
  assert.equal(closeCalls, 1);
  // Late save acknowledgement must not set saved state or fire callbacks.
  await act(async () => { persist.resolve({ updated: true }); await flush(); });
  assert.equal(successCalls, 0, 'stale save ack must not call onSuccess');
  assert.equal(closeCalls, 1, 'stale save ack must not call onClose again');
  assert.ok(!allText(renderer).includes('Face Enrolled Successfully'), 'stale save ack must not set saved state');
  renderer.unmount();
  return 'FaceEnrollmentDialog: save acknowledgement after close cannot fire completion callbacks';
}

// ============================================================
// Static fencing contracts
// ============================================================
const ptoSource = readFileSync(new URL('../src/components/timeclock/PTOBalanceView.jsx', import.meta.url), 'utf8');
const shiftSource = readFileSync(new URL('../src/components/timeclock/TimeClockShiftDetail.jsx', import.meta.url), 'utf8');
const faceSource = readFileSync(new URL('../src/components/timeclock/FaceEnrollmentDialog.jsx', import.meta.url), 'utf8');
const reportsSource = readFileSync(new URL('../src/components/timeclock/TimeClockReportsDashboard.jsx', import.meta.url), 'utf8');
const auditSource = readFileSync(new URL('../src/components/timeclock/TimeClockAuditTrail.jsx', import.meta.url), 'utf8');

function contractChecks() {
  // PTOBalanceView fencing contracts.
  assert.match(ptoSource, /balanceSeqRef/, 'PTOBalanceView needs a request sequence');
  assert.match(ptoSource, /balanceScopeRef/, 'PTOBalanceView needs a scope reference');
  assert.match(ptoSource, /if \(!current\(\)\) return;/, 'PTOBalanceView must gate stale results');
  assert.match(ptoSource, /if \(current\(\)\) setIsLoading\(false\)/, 'PTOBalanceView loading release must be fenced');
  // Shift detail fencing contracts.
  assert.match(shiftSource, /detailSeqRef/, 'ShiftDetail needs a request sequence');
  assert.match(shiftSource, /detailScopeRef\.current = entryId/, 'ShiftDetail must scope reads to the entry');
  assert.match(shiftSource, /if \(!current\(\)\) return;/, 'ShiftDetail must gate stale results');
  assert.match(shiftSource, /if \(current\(\)\) setLoading\(false\)/, 'ShiftDetail loading release must be fenced');
  // Face enrollment contracts.
  assert.match(faceSource, /capturedForRef\.current !== recordEmail/, 'face capture must be bound to the record employee');
  assert.match(faceSource, /saveSeqRef/, 'face save needs a request sequence');
  assert.match(faceSource, /completionTimerRef\.current = setTimeout/, 'completion callback must be tracked and cancellable');
  assert.match(faceSource, /clearTimeout\(completionTimerRef\.current\)/, 'close must cancel the pending completion callback');
  // Reporting/audit surfaces.
  assert.match(reportsSource, /mountedRef/, 'ReportsDashboard needs an unmount guard');
  assert.match(auditSource, /requestSequenceRef/, 'AuditTrail keeps its existing sequence fencing');
  assert.match(auditSource, /mountedRef/, 'AuditTrail keeps its existing mount fencing');
  return 'static fencing contracts verified';
}

// ============================================================
const results = [];
for (const scenario of [
  ptoScenario,
  ptoStaleAfterApplyScenario,
  shiftDetailScenario,
  faceIdentityMismatchScenario,
  faceStaleSaveScenario,
  contractChecks,
]) {
  results.push(await scenario());
}
for (const label of results) console.log(`PASS ${label}`);
console.log(`Time Clock read-scope fencing: ${results.length}/${results.length} scenarios pass`);
