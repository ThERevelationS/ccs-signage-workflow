// Synthetic-only credential-surface fencing regression for Time Clock.
// Covers UserQRCode badge reads/rotation and TimeClockLoginDialog login
// attempts, plus contract checks on QuickClockSection manual login and
// UserSettingsTab password reset. No live Base44 calls or production records.
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
const buttons = (renderer) => renderer.root.findAll((n) => n.type === 'button');
const buttonByText = (renderer, needle) =>
  buttons(renderer).find((b) => textOf(b).includes(needle));

// ---------- shared module mocks ----------
const icon = () => React.createElement('svg');
const passthrough = (name) => ({ children }) => React.createElement('div', { 'data-mock': name }, children);
const Button = ({ children, onClick, disabled, type }) =>
  React.createElement('button', { onClick, disabled, type }, children);
const DialogCtx = React.createContext(null);
const uiDialogMocks = {
  Dialog: ({ open, onOpenChange, children }) =>
    React.createElement(DialogCtx.Provider, { value: { open, onOpenChange } }, children),
  DialogTrigger: ({ children }) => {
    const Trigger = () => {
      const ctx = React.useContext(DialogCtx);
      return React.cloneElement(React.Children.only(children), {
        onClick: () => ctx?.onOpenChange?.(true),
      });
    };
    return React.createElement(Trigger);
  },
  DialogContent: passthrough('DialogContent'),
  DialogHeader: passthrough('DialogHeader'),
  DialogTitle: passthrough('DialogTitle'),
  DialogDescription: passthrough('DialogDescription'),
};
const alertDialogMocks = {
  AlertDialog: passthrough('AlertDialog'),
  AlertDialogAction: ({ children, onClick, disabled }) =>
    React.createElement('button', { onClick, disabled }, children),
  AlertDialogCancel: ({ children, onClick, disabled }) =>
    React.createElement('button', { onClick, disabled }, children),
  AlertDialogContent: passthrough('AlertDialogContent'),
  AlertDialogDescription: passthrough('AlertDialogDescription'),
  AlertDialogFooter: passthrough('AlertDialogFooter'),
  AlertDialogHeader: passthrough('AlertDialogHeader'),
  AlertDialogTitle: passthrough('AlertDialogTitle'),
};

const loadComponent = (path, extraMocks, contextExtra = {}) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (id) => extraMocks[id] || require(id),
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

// ============================================================
// UserQRCode
// ============================================================
const qrCalls = [];
const sessionStore = new Map();
const sessionStorageMock = {
  getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
  setItem: (k, v) => sessionStore.set(k, String(v)),
  removeItem: (k) => sessionStore.delete(k),
};
const UserQRCode = loadComponent('../src/components/timeclock/UserQRCode.jsx', {
  '@/api/base44Client': { base44: { functions: { invoke: (fn, payload) => new Promise((resolve, reject) => {
    assert.equal(fn, 'issueTimeClockBadge'); qrCalls.push({ payload, resolve, reject });
  }) } } },
  'qrcode.react': { QRCodeSVG: ({ value }) => React.createElement('span', null, `QR[${value}]`) },
  '@/components/ui/button': { Button },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/ui/dialog': uiDialogMocks,
  '@/components/ui/alert-dialog': alertDialogMocks,
}, { sessionStorage: sessionStorageMock });
assert.equal(typeof UserQRCode, 'function');

const alice = { email: 'alice@synthetic.invalid', full_name: 'Alice Worker', username: 'alice' };
const bob = { email: 'bob@synthetic.invalid', full_name: 'Bob Worker', username: 'bob' };
const badgeFor = (email, version) => ({ data: {
  success: true, badge_code: `TIMECLOCK2:${email}:v${version}`, badge_version: version,
} });
const qrEl = (user, token = `token-${user.email}`) => React.createElement(UserQRCode, { user, sessionToken: token });
const rotationKey = (email) => `ccs_timeclock_badge_rotate:${email.trim().toLowerCase()}`;

// --- scenario: an in-flight badge read cannot bleed across an employee switch ---
{
  qrCalls.length = 0; sessionStore.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(qrEl(alice)); await flush(); });
  assert.equal(qrCalls.length, 0, 'no badge read until the dialog opens');
  await act(async () => { buttonByText(renderer, 'QR Badge').props.onClick(); await flush(); });
  assert.equal(qrCalls.length, 1);
  assert.equal(qrCalls[0].payload.target_email, alice.email);
  assert.equal(qrCalls[0].payload.rotate, false);

  await act(async () => { renderer.update(qrEl(bob)); await flush(); });
  assert.equal(qrCalls.length, 2, 'an employee switch must issue a fresh badge read');
  assert.equal(qrCalls[1].payload.target_email, bob.email);
  assert.equal(qrCalls[1].payload.session_token, `token-${bob.email}`);

  await act(async () => { qrCalls[0].resolve(badgeFor(alice.email, 1)); await flush(); });
  assert.ok(!textOf(renderer.toJSON()).includes('TIMECLOCK2'),
    "alice's stale badge response must not render in bob's card");

  await act(async () => { qrCalls[1].resolve(badgeFor(bob.email, 3)); await flush(); });
  assert.ok(textOf(renderer.toJSON()).includes(`TIMECLOCK2:${bob.email}:v3`));
  renderer.unmount();
}
console.log('PASS an in-flight badge read cannot bleed across an employee switch');

// --- scenario: an older overlapping badge read cannot overwrite a newer badge ---
{
  qrCalls.length = 0; sessionStore.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(qrEl(alice)); await flush(); });
  await act(async () => { buttonByText(renderer, 'QR Badge').props.onClick(); await flush(); });
  assert.equal(qrCalls.length, 1);

  // User rotates while the view read is still in flight.
  await act(async () => { buttonByText(renderer, 'Replace Badge').props.onClick(); await flush(); });
  const replaceActions = buttons(renderer).filter((b) => textOf(b).includes('Replace Badge'));
  await act(async () => { await replaceActions[replaceActions.length - 1].props.onClick({ preventDefault() {} }); await flush(); });
  assert.equal(qrCalls.length, 2, 'rotation issues a second request');
  assert.equal(qrCalls[1].payload.rotate, true);
  const rotateRequestId = qrCalls[1].payload.request_id;
  assert.ok(rotateRequestId.length >= 8);
  assert.equal(sessionStore.get(rotationKey(alice.email)), rotateRequestId);

  await act(async () => { qrCalls[1].resolve({ data: { success: true, badge_code: `TIMECLOCK2:${alice.email}:v2`, badge_version: 2, rotated: true } }); await flush(); });
  assert.equal(sessionStore.get(rotationKey(alice.email)), undefined, 'a confirmed rotation clears its own request id');
  assert.ok(textOf(renderer.toJSON()).includes(`TIMECLOCK2:${alice.email}:v2`));

  await act(async () => { qrCalls[0].resolve(badgeFor(alice.email, 1)); await flush(); });
  const text = textOf(renderer.toJSON());
  assert.ok(text.includes(`TIMECLOCK2:${alice.email}:v2`), 'the superseded view read must not restore the old badge');
  assert.ok(!text.includes(`TIMECLOCK2:${alice.email}:v1`));
  renderer.unmount();
}
console.log('PASS a superseded badge read cannot overwrite a newer rotated badge');

// --- scenario: a delayed rotation ack cannot clear a newer persisted request id ---
{
  qrCalls.length = 0; sessionStore.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(qrEl(alice)); await flush(); });
  await act(async () => { buttonByText(renderer, 'QR Badge').props.onClick(); await flush(); });
  assert.equal(qrCalls.length, 1);
  await act(async () => { qrCalls[0].resolve(badgeFor(alice.email, 1)); await flush(); });

  await act(async () => { buttonByText(renderer, 'Replace Badge').props.onClick(); await flush(); });
  const replaceActions = buttons(renderer).filter((b) => textOf(b).includes('Replace Badge'));
  await act(async () => { await replaceActions[replaceActions.length - 1].props.onClick({ preventDefault() {} }); await flush(); });
  assert.equal(qrCalls.length, 2);
  const r1 = qrCalls[1].payload.request_id;
  assert.equal(sessionStore.get(rotationKey(alice.email)), r1);

  // Simulate a newer retry of the rotation persisted after a reload boundary.
  sessionStore.set(rotationKey(alice.email), 'r2-newer-request');
  await act(async () => { qrCalls[1].resolve({ data: { success: true, badge_code: `TIMECLOCK2:${alice.email}:v9`, badge_version: 9, rotated: true } }); await flush(); });
  assert.equal(sessionStore.get(rotationKey(alice.email)), 'r2-newer-request',
    'a delayed rotation acknowledgement must not clear a newer persisted request id');
  renderer.unmount();
}
console.log('PASS a delayed rotation acknowledgement cannot clear a newer request id');

// --- scenario: a superseded rotation cannot release the loading flags of a newer call ---
{
  qrCalls.length = 0; sessionStore.clear();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(qrEl(alice)); await flush(); });
  await act(async () => { buttonByText(renderer, 'QR Badge').props.onClick(); await flush(); });
  assert.equal(qrCalls.length, 1);
  await act(async () => { qrCalls[0].resolve(badgeFor(alice.email, 1)); await flush(); });

  await act(async () => { buttonByText(renderer, 'Replace Badge').props.onClick(); await flush(); });
  const replaceActions = buttons(renderer).filter((b) => textOf(b).includes('Replace Badge'));
  await act(async () => { await replaceActions[replaceActions.length - 1].props.onClick({ preventDefault() {} }); await flush(); });
  assert.equal(qrCalls.length, 2);

  // Switch employees while the rotation is in flight.
  await act(async () => { renderer.update(qrEl(bob)); await flush(); });
  await act(async () => { qrCalls[1].resolve({ data: { success: true, badge_code: `TIMECLOCK2:${alice.email}:v2`, badge_version: 2, rotated: true } }); await flush(); });
  const text = textOf(renderer.toJSON());
  assert.ok(!text.includes(`TIMECLOCK2:${alice.email}`), "alice's rotated badge must not render under bob");
  assert.ok(!text.includes('TIMECLOCK2'), 'no badge should render for bob until his read resolves');
  renderer.unmount();
}
console.log('PASS a superseded rotation acknowledgement cannot apply or release newer state');

// ============================================================
// TimeClockLoginDialog
// ============================================================
const loginCalls = [];
const TimeClockLoginDialog = loadComponent('../src/components/timeclock/TimeClockLoginDialog.jsx', {
  '@/api/base44Client': { base44: { functions: { invoke: (fn, payload) => new Promise((resolve, reject) => {
    assert.equal(fn, 'verifyLogin'); loginCalls.push({ payload, resolve, reject });
  }) } } },
  '@/components/ui/dialog': uiDialogMocks,
  '@/components/ui/button': { Button },
  '@/components/ui/input': { Input: ({ id, value, onChange, type }) => React.createElement('input', { id, value, type, onChange }) },
  '@/components/ui/label': { Label: ({ children, htmlFor }) => React.createElement('label', { htmlFor }, children) },
  'lucide-react': new Proxy({}, { get: () => icon }),
});
assert.equal(typeof TimeClockLoginDialog, 'function');

const loginEl = (isOpen, onLogin) => React.createElement(TimeClockLoginDialog, {
  isOpen, onClose: () => {}, onLogin, allUsers: [],
});
const submitLogin = async (renderer, username, password) => {
  const inputs = renderer.root.findAll((n) => n.type === 'input');
  inputs.find((n) => n.props.id === 'tc-username').props.onChange({ target: { value: username } });
  inputs.find((n) => n.props.id === 'tc-password').props.onChange({ target: { value: password } });
  await flush();
  renderer.root.find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
};

// --- scenario: closing the dialog invalidates an in-flight login ---
{
  loginCalls.length = 0;
  const logins = [];
  let renderer;
  await act(async () => { renderer = TestRenderer.create(loginEl(true, (u, t) => logins.push({ u, t }))); await flush(); });
  await act(async () => { await submitLogin(renderer, 'alice', 'pw'); });
  assert.equal(loginCalls.length, 1);

  await act(async () => { renderer.update(loginEl(false, (u, t) => logins.push({ u, t }))); await flush(); });
  await act(async () => { loginCalls[0].resolve({ data: { success: true, user: { email: alice.email }, token: 'tok-a' } }); await flush(); });
  assert.equal(logins.length, 0, 'a dismissed login attempt must not sign the employee in');

  await act(async () => { renderer.update(loginEl(true, (u, t) => logins.push({ u, t }))); await flush(); });
  await act(async () => { await submitLogin(renderer, 'alice', 'pw'); });
  assert.equal(loginCalls.length, 2, 'a reopened dialog issues a fresh login attempt');
  await act(async () => { loginCalls[1].resolve({ data: { success: true, user: { email: alice.email }, token: 'tok-a2' } }); await flush(); });
  assert.equal(logins.length, 1);
  assert.equal(logins[0].t, 'tok-a2');
  renderer.unmount();
}
console.log('PASS a dismissed Time Clock login cannot sign in after the dialog closes');

// --- scenario: a superseded login cannot surface its error over a newer attempt ---
{
  loginCalls.length = 0;
  let renderer;
  await act(async () => { renderer = TestRenderer.create(loginEl(true, () => {})); await flush(); });
  await act(async () => { await submitLogin(renderer, 'alice', 'pw'); });
  assert.equal(loginCalls.length, 1);

  // Close and reopen: the first attempt is superseded.
  await act(async () => { renderer.update(loginEl(false, () => {})); await flush(); });
  await act(async () => { renderer.update(loginEl(true, () => {})); await flush(); });
  await act(async () => { await submitLogin(renderer, 'alice', 'pw'); });
  assert.equal(loginCalls.length, 2);

  await act(async () => {
    loginCalls[0].reject(Object.assign(new Error('stale login failure'), { response: { data: { error: 'stale login failure' } } }));
    await flush();
  });
  assert.ok(!textOf(renderer.toJSON()).includes('stale login failure'),
    'a superseded login must not project its error over the newer attempt');

  await act(async () => { loginCalls[1].resolve({ data: { success: false, error: 'Invalid username or password' } }); await flush(); });
  assert.ok(textOf(renderer.toJSON()).includes('Invalid username or password'));
  renderer.unmount();
}
console.log('PASS a superseded login attempt cannot project its error over a newer attempt');

// ============================================================
// Contract checks on the remaining credential surfaces
// ============================================================
const qcSource = readFileSync(new URL('../src/components/timeclock/QuickClockSection.jsx', import.meta.url), 'utf8');
assert.match(qcSource, /const identifyFlowSeqRef = useRef\(0\)/);
const manualSubmit = qcSource.slice(qcSource.indexOf('const handleManualSubmit = async () => {'),
  qcSource.indexOf('const applyBreakResponse'));
assert.match(manualSubmit, /const identifySeq = \+\+identifyFlowSeqRef\.current/);
assert.match(manualSubmit, /const requestEpoch = workViewEpochRef\.current/);
assert.match(manualSubmit, /if \(!stillCurrent\(\)\) return;/);
assert.match(manualSubmit, /if \(stillCurrent\(\)\) setIsLoading\(false\)/);
for (const anchor of ['const startManualMode = async', 'const startFaceMode = async',
    'const startQrMode = async', 'const handleFaceRecognized = async', 'const handleQrDecoded = async']) {
  const body = qcSource.slice(qcSource.indexOf(anchor), qcSource.indexOf(anchor) + 400);
  assert.match(body, /identifyFlowSeqRef\.current \+= 1/, `${anchor} must supersede pending identity attempts`);
}
console.log('PASS Quick Clock manual login is fenced to the newest identify flow and work view epoch');

const settingsSource = readFileSync(new URL('../src/components/timeclock/UserSettingsTab.jsx', import.meta.url), 'utf8');
assert.match(settingsSource, /const resetSeqRef = useRef\(0\)/);
assert.match(settingsSource, /resetScopeRef\.current = `\$\{sessionToken \|\| ""\}\|\$\{String\(currentUser\?\.email \|\| ""\)\.trim\(\)\.toLowerCase\(\)\}`/);
const resetHandler = settingsSource.slice(settingsSource.indexOf('const handleSendPasswordReset = async () => {'),
  settingsSource.indexOf('const hasFaceData'));
assert.match(resetHandler, /const stillCurrent = \(\)/);
assert.ok((resetHandler.match(/stillCurrent\(\)/g) || []).length >= 4,
  'the reset handler must gate success, error, timer, and loading paths');
console.log('PASS password-reset issue is fenced to the newest request and employee scope');

const qrSource = readFileSync(new URL('../src/components/timeclock/UserQRCode.jsx', import.meta.url), 'utf8');
assert.match(qrSource, /function clearBadgeRotationRequest\(email, expectedRequestId = ""\)/);
assert.match(qrSource, /const badgeSeqRef = useRef\(0\)/);
assert.match(qrSource, /if \(!stillCurrent\(\)\) return;/);
console.log('PASS badge storage cleanup is request-ID fenced and badge reads are sequence/scope fenced');

console.log('PASS 9/9 Time Clock credential-surface fencing groups');
