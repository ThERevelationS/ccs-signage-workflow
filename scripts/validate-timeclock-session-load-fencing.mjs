// Synthetic-only session-load fencing regression for the Time Clock page.
// Covers loadData employee/session scoping so an in-flight read for employee A
// cannot apply entries, time-off requests, corrections, or loading state after
// logout or an employee switch. No live Base44 calls or production records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
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
const uiFallback = new Proxy({}, {
  get: (_t, name) => (name === 'Button' ? Button
    : name === 'Textarea' ? () => React.createElement('textarea')
    : name === 'Input' ? () => React.createElement('input')
    : passthrough(String(name))),
});
const dateFnsMock = {
  format: () => 'Jan 1, 2024',
  parseISO: (v) => new Date(v),
  startOfWeek: (d) => d,
  endOfWeek: (d) => d,
  addWeeks: (d) => d,
  subWeeks: (d) => d,
  isWithinInterval: () => true,
};

const loadComponent = (path, extraMocks, contextExtra = {}) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (id) => {
      if (id in extraMocks) return extraMocks[id];
      if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
        const real = require(id);
        return new Proxy(real, {
          get: (t, name) => {
            if (name === 'jsx' || name === 'jsxs' || name === 'jsxDEV') {
              return (type, props, ...rest) => {
                if (type === undefined || (typeof type === 'object' && type !== null)) {
                  throw new Error(`JSX type invalid: ${JSON.stringify(props, (k, v) => typeof v === 'function' ? 'fn' : v)?.slice(0, 400)}`);
                }
                return t[name](type, props, ...rest);
              };
            }
            return t[name];
          },
        });
      }
      if (id.startsWith('@/components/ui/')) return uiFallback;
      if (id.startsWith('@/components/')) return new Proxy({}, { get: (_t, name) => passthrough(String(name)) });
      return require(id);
    },
    console, window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    document: { visibilityState: 'visible', createElement: () => ({ getContext: () => null, click() {}, setAttribute() {}, style: {} }), addEventListener() {}, removeEventListener() {}, body: { appendChild() {}, removeChild() {} } },
    Date, Math, Promise, Object, Number, String, Map, Set, JSON, Array, Boolean, Error,
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {},
    CustomEvent: class { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ...contextExtra,
  }, { filename: path.split('/').pop() });
  return module.exports.default;
};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const USER_A = { id: 'u-a', email: 'amy@example.com', full_name: 'Amy A' };
const USER_B = { id: 'u-b', email: 'brian@example.com', full_name: 'Brian B' };
const ENTRY_A = { id: 'e-a', user_email: 'amy@example.com', status: 'clocked_out', clock_in: '2024-01-01T08:00:00Z', notes: 'A-STALE-NOTE', job_allocations: [] };
const ENTRY_B = { id: 'e-b', user_email: 'brian@example.com', status: 'clocked_out', clock_in: '2024-01-01T08:00:00Z', notes: 'B-FRESH-NOTE', job_allocations: [] };

async function sessionSwitchScenario() {
  const loaderCalls = [];
  const loaderQueue = [];
  const invokeCalls = [];
  const correctionQueue = [];
  const base44Mock = {
    entities: new Proxy({}, { get: () => ({ filter: () => Promise.resolve([]) }) }),
    functions: {
      invoke: (fn, body) => {
        invokeCalls.push({ fn, body });
        if (body?.action === 'list_correction_requests') {
          const d = deferred();
          correctionQueue.push(d);
          return d.promise;
        }
        return Promise.resolve({ success: true, user: { email: body?.target_email }, entry: null });
      },
    },
  };
  const TimeClockPage = loadComponent('../src/pages/TimeClock.jsx', {
    '@/api/base44Client': { base44: base44Mock },
    'lucide-react': iconModule,
    'date-fns': dateFnsMock,
    '@/components/auth/EmailGate': {
      useAuth: () => ({ currentUser: null, sessionToken: '' }),
      getStoredAdminSettingsCapability: () => '',
      hasStoredAdminSettingsAuthorization: () => false,
      storeAdminSettingsAuthorization: () => {},
    },
    '@/components/estimator/loadAllEntityRows': {
      loadAllEntityRows: (args) => { loaderCalls.push(args); const d = deferred(); loaderQueue.push(d); return d.promise; },
    },
    '@/components/timeclock/TimeClockLoginDialog': ({ onLogin }) =>
      React.createElement('button', { onClick: () => onLogin?.(window.__LOGIN_USER, window.__LOGIN_TOKEN) }, 'do-login'),
  }, {
    // exposed for the scenario below
  });

  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(TimeClockPage)); });
  } catch (e) {
    console.log('BAD JSX TYPES:', JSON.stringify(globalThis.__badJsx || []));
    throw e;
  }
  // Release the mount-time user-list load so the gate UI renders.
  await act(async () => { loaderQueue.forEach((d) => d.resolve([])); loaderQueue.length = 0; await flush(); });

  // Log in as employee A.
  globalThis.window = globalThis.window || {};
  const loginBtn = buttonByText(renderer, 'Login for Full Access');
  assert.ok(loginBtn, 'login button should render on mount');
  await act(async () => { loginBtn.props.onClick(); await flush(); });
  const doLogin = () => buttonByText(renderer, 'do-login');
  const invokeAs = async (user, token) => {
    globalThis.window.__LOGIN_USER = user;
    globalThis.window.__LOGIN_TOKEN = token;
    await act(async () => { doLogin().props.onClick(); await flush(); });
  };
  await invokeAs(USER_A, 'tok-a');
  const aCalls = loaderCalls.filter((c) => String(c.query?.user_email || '') === 'amy@example.com');
  assert.ok(aCalls.length >= 2, 'A session should issue employee-scoped entry/request reads');

  // Log out while A's reads are still in flight.
  await act(async () => { buttonByText(renderer, 'Logout').props.onClick(); await flush(); });

  // Resolve A's pending reads — nothing may apply after the session closed.
  await act(async () => {
    for (const d of loaderQueue) d.resolve([ENTRY_A]);
    for (const d of correctionQueue) d.resolve({ success: true, requests: [{ id: 'cr-a', employee_reason: 'A-STALE-CORRECTION' }] });
    await flush();
  });
  assert.ok(!allText(renderer).includes('A-STALE-NOTE'), 'A entries must not render after logout');
  assert.ok(!allText(renderer).includes('A-STALE-CORRECTION'), 'A corrections must not render after logout');

  // Log in as employee B; B's reads resolve normally.
  await act(async () => { buttonByText(renderer, 'Login for Full Access').props.onClick(); await flush(); });
  const loaderBefore = loaderCalls.length;
  const queueBefore = loaderQueue.length;
  const corrBefore = correctionQueue.length;
  await invokeAs(USER_B, 'tok-b');
  const bCalls = loaderCalls.slice(loaderBefore).filter((c) => String(c.query?.user_email || '') === 'brian@example.com');
  assert.ok(bCalls.length >= 2, 'B session should issue fresh employee-scoped reads');
  await act(async () => {
    for (const d of loaderQueue.slice(queueBefore)) d.resolve([ENTRY_B]);
    for (const d of correctionQueue.slice(corrBefore)) d.resolve({ success: true, requests: [{ id: 'cr-b', employee_reason: 'B-CORRECTION' }] });
    await flush();
  });
  assert.ok(allText(renderer).includes('B-FRESH-NOTE'), 'B entries must render for B session');
  renderer.unmount();
  return 'TimeClock page: in-flight reads for employee A cannot apply after logout or employee switch';
}

async function overlappingLoadsScenario() {
  const loaderQueue = [];
  const TimeClockPage = loadComponent('../src/pages/TimeClock.jsx', {
    '@/api/base44Client': {
      base44: {
        entities: new Proxy({}, { get: () => ({ filter: () => Promise.resolve([]) }) }),
        functions: { invoke: (fn, body) => Promise.resolve({ success: true, user: { email: body?.target_email }, entry: null, requests: [] }) },
      },
    },
    'lucide-react': iconModule,
    'date-fns': dateFnsMock,
    '@/components/auth/EmailGate': {
      useAuth: () => ({ currentUser: null, sessionToken: '' }),
      getStoredAdminSettingsCapability: () => '',
      hasStoredAdminSettingsAuthorization: () => false,
      storeAdminSettingsAuthorization: () => {},
    },
    '@/components/estimator/loadAllEntityRows': {
      loadAllEntityRows: () => { const d = deferred(); loaderQueue.push(d); return d.promise; },
    },
    '@/components/timeclock/TimeClockLoginDialog': ({ onLogin }) =>
      React.createElement('button', { onClick: () => onLogin?.(USER_B, 'tok-b') }, 'do-login'),
  });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(TimeClockPage)); });
  await act(async () => { loaderQueue.forEach((d) => d.resolve([])); loaderQueue.length = 0; await flush(); });
  await act(async () => { buttonByText(renderer, 'Login for Full Access').props.onClick(); await flush(); });
  await act(async () => { buttonByText(renderer, 'do-login').props.onClick(); await flush(); });
  // Trigger a second refresh ("Reload latest") while the first is in flight.
  const reload = buttonByText(renderer, 'Reload latest');
  assert.ok(reload, 'reload button should exist once logged in');
  await act(async () => { reload.props.onClick(); await flush(); });
  // Resolve the stale first batch (first two calls) with poisoned data after
  // the newer batch (last two calls) already applied.
  await act(async () => {
    for (const d of loaderQueue.slice(2)) d.resolve([ENTRY_B]);
    await flush();
  });
  await act(async () => {
    for (const d of loaderQueue.slice(0, 2)) d.resolve([ENTRY_A]);
    await flush();
  });
  assert.ok(allText(renderer).includes('B-FRESH-NOTE'), 'newer read must win');
  assert.ok(!allText(renderer).includes('A-STALE-NOTE'), 'superseded read must not overwrite');
  renderer.unmount();
  return 'TimeClock page: overlapping refreshes accept only the newest request';
}

// ============================================================
const source = readFileSync(new URL('../src/pages/TimeClock.jsx', import.meta.url), 'utf8');
function contractChecks() {
  assert.match(source, /dataSeqRef/, 'loadData needs a request sequence');
  assert.match(source, /dataScopeRef/, 'loadData needs a session scope reference');
  assert.match(source, /\$\{timeClockSessionToken\}\|\$\{String\(loggedInUser/, 'scope must include token and email');
  assert.match(source, /if \(!current\(\)\) return;/, 'loadData must gate stale results');
  assert.match(source, /session_token: requestToken/, 'correction read must use the captured session token');
  assert.match(source, /if \(current\(\)\) setIsLoading\(false\)/, 'loading release must be fenced');
  return 'static session-load fencing contracts verified';
}

const results = [];
for (const scenario of [sessionSwitchScenario, overlappingLoadsScenario, contractChecks]) {
  results.push(await scenario());
}
for (const label of results) console.log(`PASS ${label}`);
console.log(`Time Clock session-load fencing: ${results.length}/${results.length} scenarios pass`);
