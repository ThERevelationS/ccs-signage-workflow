// Synthetic-only regression harness. Never connects to live Base44 records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, webcrypto } from 'node:crypto';
import { transformSync } from 'esbuild';

const secret = 'synthetic-session-signing-key';
const source = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');
const compiled = transformSync(
  source.replace("import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';",
    'const createClientFromRequest = globalThis.__syntheticClient;'),
  { loader: 'ts', format: 'cjs', target: 'es2022' },
).code;

const administrator = { id: 'synthetic-admin', email: 'admin@synthetic.invalid', full_name: 'Synthetic Admin', role: 'admin' };
const employee = { id: 'synthetic-employee', email: 'worker@synthetic.invalid', full_name: 'Synthetic Employee', role: 'employee' };
let revision = 0;
const clone = (value) => value == null ? value : structuredClone(value);
function matches(row, query = {}) {
  return Object.entries(query).every(([key, value]) => {
    const actual = row[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).every(([operator, operand]) => {
        if (operator === '$ne') return actual !== operand;
        if (operator === '$in') return operand.some((item) => actual === item || (actual == null && item == null));
        if (operator === '$nin') return !operand.includes(actual);
        throw new Error('Unsupported synthetic operator: ' + operator);
      });
    }
    return actual === value || (actual == null && value == null);
  });
}
function setup({ entryCount = 1, serverNow = null } = {}) {
  revision = 0;
  // Inject only the backend wall-clock constructor for company-day boundary
  // acceptance; retain real Date.now() for session validation and lock ages.
  const ServerDate = serverNow ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [serverNow])); }
    static now() { return Date.now(); }
  } : Date;
  const rows = {
    AuthorizedEmail: [administrator, employee].map(clone),
    TimeClockEmployeeState: [administrator, employee].map((user) => ({
      id: 'state-' + user.id, user_email: user.email, status: 'clocked_out',
      break_status: 'working', work_pause_status: 'working', labor_status: 'idle',
      correction_create_status: 'idle', updated_date: '2026-09-20T00:00:00.000Z',
    })),
    TimeClockPayPeriod: [{
      id: 'synthetic-period', label: 'Synthetic Review Period', start_date: '2026-09-20',
      end_date: '2026-09-26', status: 'review', last_request_id: '',
      updated_date: '2026-09-20T00:00:00.000Z',
    }],
    TimeEntry: Array.from({ length: entryCount }, (_, i) => ({
      id: 'synthetic-entry-' + i, user_email: employee.email, status: 'clocked_out',
      clock_in: '2026-09-20T14:00:00.000Z', clock_out: '2026-09-20T22:00:00.000Z',
      approval_status: 'approved', total_hours: 8, updated_date: '2026-09-20T00:00:00.000Z',
    })),
    TimeClockAudit: [], TimeClockCorrectionRequest: [],
  };
  let beforeUpdate = null;
  let afterRowUpdate = null;
  const modelFor = (entityName) => ({
    async filter(query) { return clone((rows[entityName] || []).filter((row) => matches(row, query))); },
    async get(id) { return clone((rows[entityName] || []).find((row) => row.id === id) || null); },
    async create(data) {
      const item = { ...clone(data), id: 'synthetic-' + entityName + '-' + (++revision),
        updated_date: new Date(Date.now() + revision).toISOString() };
      (rows[entityName] ||= []).push(item);
      return clone(item);
    },
    async updateMany(query, update) {
      if (beforeUpdate) await beforeUpdate(entityName, query, update);
      let updated = 0;
      for (const row of rows[entityName] || []) {
        if (!matches(row, query)) continue;
        for (const [key, val] of Object.entries(update.$set || {})) row[key] = clone(val);
        for (const key of Object.keys(update.$unset || {})) delete row[key];
        row.updated_date = new Date(Date.now() + ++revision).toISOString();
        updated++;
        if (afterRowUpdate) await afterRowUpdate(entityName, query, update, row);
      }
      return { updated };
    },
  });
  const entities = new Proxy({}, { get(_unused, name) { return modelFor(name); } });
  const client = { asServiceRole: { entities } };
  let handler = null;
  const context = vm.createContext({
    __syntheticClient: () => client,
    Deno: { serve: (fn) => { handler = fn; }, env: { get: (key) => key === 'SESSION_SIGNING_SECRET' ? secret : '' } },
    crypto: webcrypto, TextEncoder, TextDecoder, Response, Request, btoa, atob,
    Date: ServerDate, console: { error: () => {} },
  });
  vm.runInContext(compiled, context, { filename: 'synthetic-time-clock-handler.js' });
  assert.equal(typeof handler, 'function');
  const payload = Buffer.from(JSON.stringify({
    email: administrator.email, iat: Date.now() - 1000, exp: Date.now() + 60_000,
  })).toString('base64url');
  const session_token = payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
  async function invoke(body) {
    const response = await handler({ json: async () => ({ ...body, session_token }) });
    return { status: response.status, body: await response.json() };
  }
  async function action(decision, request_id, note = '') {
    return invoke({
      action: 'pay_period_status', decision, request_id, note,
      pay_period_id: 'synthetic-period',
    });
  }
  async function clockIn(request_id) {
    return invoke({ action: 'clock_in', request_id, target_email: employee.email });
  }
  return {
    rows, action, clockIn, invoke,
    setBeforeUpdate(fn) { beforeUpdate = fn; },
    setAfterRowUpdate(fn) { afterRowUpdate = fn; },
    period: () => rows.TimeClockPayPeriod[0],
    entryLocks: () => rows.TimeEntry.filter((row) => row.pay_period_id === 'synthetic-period'),
    audit: (req) => rows.TimeClockAudit.filter((row) => row.request_id === req),
  };
}
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const finalizeRequest = 'synthetic-finalize-001';

test('ordinary finalization, audit, and exact-request reuse', async () => {
  const h = setup({ entryCount: 2 });
  const first = await h.action('finalize', finalizeRequest);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(h.period().status, 'finalized');
  assert.equal(h.entryLocks().length, 2);
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'confirmed');
  const retry = await h.action('finalize', finalizeRequest);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.reused, true);
  assert.equal(h.audit(finalizeRequest).length, 1);
});

test('partial entry writes recover using exactly the original lock marker', async () => {
  const h = setup({ entryCount: 2 });
  let interrupt = true;
  h.setAfterRowUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeEntry' && update.$set?.pay_period_id) {
      interrupt = false; throw new Error('Synthetic write interruption');
    }
  });
  assert.equal((await h.action('finalize', finalizeRequest)).status, 500);
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 1);
  const originalStamp = h.entryLocks()[0].pay_period_locked_at;
  const retry = await h.action('finalize', finalizeRequest);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(h.entryLocks().length, 2);
  assert.ok(h.entryLocks().every((row) => row.pay_period_locked_at === originalStamp));
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'confirmed');
});

test('conflicting finalization and reopen cannot overtake a staged request', async () => {
  const h = setup();
  let interrupt = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeClockPayPeriod' && update.$set?.status === 'finalized') {
      interrupt = false; throw new Error('Synthetic period commit interruption');
    }
  });
  assert.equal((await h.action('finalize', finalizeRequest)).status, 500);
  assert.equal(h.entryLocks().length, 1);
  assert.equal((await h.action('finalize', 'another-finalize-001')).status, 409);
  assert.equal((await h.action('reopen', 'another-reopen-001', 'Correction needed')).status, 409);
  assert.equal(h.audit('another-finalize-001').length, 0);
  assert.equal((await h.action('finalize', finalizeRequest)).status, 200);
});

test('an unresolved correction rolls back earlier staged locks before blocking', async () => {
  const h = setup();
  let interrupt = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeClockPayPeriod' && update.$set?.status === 'finalized') {
      interrupt = false; throw new Error('Synthetic period commit interruption');
    }
  });
  assert.equal((await h.action('finalize', finalizeRequest)).status, 500);
  h.rows.TimeClockCorrectionRequest.push({
    id: 'synthetic-correction', status: 'pending', time_entry_id: h.rows.TimeEntry[0].id,
  });
  const retry = await h.action('finalize', finalizeRequest);
  assert.equal(retry.status, 409);
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'blocked');
});

test('committed period with interrupted audit confirms on exact retry', async () => {
  const h = setup();
  let interrupt = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeClockAudit' && update.$set?.outcome === 'confirmed') {
      interrupt = false; throw new Error('Synthetic audit interruption');
    }
  });
  assert.equal((await h.action('finalize', finalizeRequest)).status, 500);
  assert.equal(h.period().status, 'finalized');
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'pending');
  assert.equal((await h.action('reopen', 'reopen-before-audit-001', 'Review needed')).status, 409);
  const retry = await h.action('finalize', finalizeRequest);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'confirmed');
});

test('reopen interruption recovers and later finalization locks survive old retries', async () => {
  const h = setup();
  assert.equal((await h.action('finalize', finalizeRequest)).status, 200);
  let interrupt = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeEntry' && update.$unset?.pay_period_id !== undefined) {
      interrupt = false; throw new Error('Synthetic unlock interruption');
    }
  });
  assert.equal((await h.action('reopen', 'synthetic-reopen-001', 'Manager correction')).status, 500);
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 1);
  assert.equal((await h.action('reopen', 'synthetic-reopen-001', 'Manager correction')).status, 200);
  assert.equal(h.entryLocks().length, 0);
  assert.equal((await h.action('finalize', 'second-finalize-001')).status, 200);
  const newerStamp = h.entryLocks()[0].pay_period_locked_at;
  assert.equal((await h.action('reopen', 'synthetic-reopen-001', 'Manager correction')).status, 409);
  assert.equal(h.entryLocks()[0].pay_period_locked_at, newerStamp);
});

test('a broken committed lock snapshot refuses exact-request audit confirmation', async () => {
  const h = setup();
  let interrupt = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeClockAudit' && update.$set?.outcome === 'confirmed') {
      interrupt = false; throw new Error('Synthetic audit interruption');
    }
  });
  assert.equal((await h.action('finalize', finalizeRequest)).status, 500);
  h.entryLocks()[0].approval_status = 'needs_review';
  const retry = await h.action('finalize', finalizeRequest);
  assert.equal(retry.status, 409);
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'pending');
});

test('a losing period claim blocks its own orphan audit before any entry locks', async () => {
  const h = setup();
  let compete = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (compete && entity === 'TimeClockPayPeriod' && update.$set?.last_request_id === finalizeRequest) {
      compete = false;
      h.period().last_request_id = 'synthetic-winner-001';
      h.period().updated_date = '2026-09-20T00:00:01.000Z';
      h.rows.TimeClockAudit.push({
        id: 'winner-audit', action: 'pay_period_status', request_id: 'synthetic-winner-001',
        outcome: 'pending', details: { decision: 'finalize', pay_period_id: h.period().id },
      });
    }
  });
  const loser = await h.action('finalize', finalizeRequest);
  assert.equal(loser.status, 409);
  assert.equal(h.audit(finalizeRequest)[0].outcome, 'blocked');
  assert.equal(h.audit(finalizeRequest)[0].details.blocked_reason, 'period_claim_lost');
  assert.equal(h.entryLocks().length, 0);
});

test('pending reopen audit prevents a new finalization from overtaking unlock recovery', async () => {
  const h = setup();
  assert.equal((await h.action('finalize', finalizeRequest)).status, 200);
  let interrupt = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (interrupt && entity === 'TimeEntry' && update.$unset?.pay_period_id !== undefined) {
      interrupt = false; throw new Error('Synthetic reopen unlock interruption');
    }
  });
  assert.equal((await h.action('reopen', 'pending-reopen-001', 'Manager correction')).status, 500);
  assert.equal((await h.action('finalize', 'overtaking-finalize-001')).status, 409);
  assert.equal(h.audit('overtaking-finalize-001').length, 0);
  assert.equal((await h.action('reopen', 'pending-reopen-001', 'Manager correction')).status, 200);
  assert.equal((await h.action('finalize', 'later-finalize-001')).status, 200);
});

test('a losing concurrent reopen leaves no pending audit and does not unlock', async () => {
  const h = setup();
  assert.equal((await h.action('finalize', finalizeRequest)).status, 200);
  let compete = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (compete && entity === 'TimeClockPayPeriod' && update.$set?.reopened_at) {
      compete = false;
      h.period().status = 'review';
      h.period().last_request_id = 'synthetic-winning-reopen-001';
      h.period().updated_date = '2026-09-20T00:00:01.000Z';
      h.rows.TimeClockAudit.push({
        id: 'winning-reopen-audit', action: 'pay_period_status',
        request_id: 'synthetic-winning-reopen-001', outcome: 'pending',
        details: { decision: 'reopen', pay_period_id: h.period().id },
      });
    }
  });
  const loser = await h.action('reopen', 'synthetic-losing-reopen-001', 'Manager correction');
  assert.equal(loser.status, 409);
  assert.equal(h.audit('synthetic-losing-reopen-001')[0].outcome, 'blocked');
  assert.equal(h.audit('synthetic-losing-reopen-001')[0].details.blocked_reason, 'reopen_claim_lost');
  assert.equal(h.entryLocks().length, 1);
});

test('finalization gate wins and a concurrent Clock In cannot create a shift', async () => {
  const h = setup();
  let releaseGate;
  let reachedGate;
  const gateHeld = new Promise((resolve) => { reachedGate = resolve; });
  const continueFinalization = new Promise((resolve) => { releaseGate = resolve; });
  let paused = false;
  h.setAfterRowUpdate(async (entity, _query, update, row) => {
    if (!paused && entity === 'TimeClockEmployeeState' && row.user_email === employee.email &&
        update.$set?.correction_create_time_entry_id === 'pay_period:synthetic-period') {
      paused = true;
      reachedGate();
      await continueFinalization;
    }
  });

  const finalizing = h.action('finalize', 'gate-wins-finalize-001');
  await gateHeld;
  const clockIn = await h.clockIn('blocked-clock-in-001');
  assert.equal(clockIn.status, 409, JSON.stringify(clockIn.body));
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'clocked_in').length, 0);
  releaseGate();
  const finalized = await finalizing;
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
});

test('Clock In gate wins and finalization retries into an active-shift block', async () => {
  const h = setup();
  let releaseGate;
  let reachedGate;
  const gateHeld = new Promise((resolve) => { reachedGate = resolve; });
  const continueClockIn = new Promise((resolve) => { releaseGate = resolve; });
  let paused = false;
  h.setAfterRowUpdate(async (entity, _query, update, row) => {
    if (!paused && entity === 'TimeClockEmployeeState' && row.user_email === employee.email &&
        String(update.$set?.correction_create_time_entry_id || '').startsWith('clock_in:')) {
      paused = true;
      reachedGate();
      await continueClockIn;
    }
  });

  const clockingIn = h.clockIn('gate-wins-clockin-001');
  await gateHeld;
  const firstFinalize = await h.action('finalize', 'clockin-wins-finalize-001');
  assert.equal(firstFinalize.status, 409, JSON.stringify(firstFinalize.body));
  releaseGate();
  const clockedIn = await clockingIn;
  assert.equal(clockedIn.status, 200, JSON.stringify(clockedIn.body));
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'clocked_in').length, 1);

  h.setAfterRowUpdate(null);
  const retry = await h.action('finalize', 'clockin-wins-finalize-001');
  assert.equal(retry.status, 409, JSON.stringify(retry.body));
  assert.equal(h.audit('clockin-wins-finalize-001')[0].outcome, 'blocked');
});

test('post-gate resnapshot catches a newly completed unapproved shift', async () => {
  const h = setup();
  let injected = false;
  h.setAfterRowUpdate((entity, _query, update, row) => {
    if (!injected && entity === 'TimeClockEmployeeState' && row.user_email === administrator.email &&
        update.$set?.correction_create_time_entry_id === 'pay_period:synthetic-period') {
      injected = true;
      h.rows.TimeEntry.push({
        id: 'arrived-during-finalization', user_email: employee.email, status: 'clocked_out',
        clock_in: '2026-09-21T14:00:00.000Z', clock_out: '2026-09-21T14:05:00.000Z',
        approval_status: 'unreviewed', total_hours: 0.08,
        updated_date: '2026-09-21T14:05:01.000Z',
      });
    }
  });
  const result = await h.action('finalize', 'resnapshot-finalize-001');
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.audit('resnapshot-finalize-001')[0].outcome, 'blocked');
  assert.equal(h.audit('resnapshot-finalize-001')[0].details.blocked_reason, 'readiness_changed_after_employee_gates');
});

async function strandedCompletedClockIn() {
  const h = setup();
  const requestId = 'stranded-clockin-001';
  const encoded = new TextEncoder().encode(JSON.stringify({ action: 'clock_in', user_email: employee.email }));
  const digest = await webcrypto.subtle.digest('SHA-256', encoded);
  const payloadHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  // After this synthetic period, so only the outstanding gate can block finalization.
  const entry = {
    id: 'stranded-clockin-entry', user_email: employee.email, user_name: employee.full_name,
    status: 'clocked_in', clock_in: '2026-09-27T15:00:00.000Z',
    clock_in_request_id: requestId, clock_source: 'server',
    updated_date: '2026-09-27T15:00:01.000Z',
  };
  h.rows.TimeEntry.push(entry);
  Object.assign(state, {
    status: 'clocked_in', active_entry_id: entry.id, last_request_id: requestId,
    correction_create_status: 'creating', correction_create_request_id: requestId,
    correction_create_time_entry_id: `clock_in:${employee.email}`,
    correction_create_payload_hash: payloadHash, correction_create_claim_token: 'stranded-token',
    correction_create_started_at: '2026-09-21T15:00:00.000Z',
  });
  const goodAudit = {
    id: 'synthetic-committed-clockin-audit', action: 'clock_in', request_id: requestId,
    time_entry_id: entry.id, user_email: employee.email, outcome: 'confirmed',
    server_timestamp: entry.clock_in,
  };
  return { h, state, entry, requestId, goodAudit };
}

test('completed Clock In releases stranded gate only with its confirmed audit', async () => {
  const { h, state, requestId, goodAudit } = await strandedCompletedClockIn();
  h.rows.TimeClockAudit.push(goodAudit);
  const retry = await h.clockIn(requestId);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.status, 'already_clocked_in');
  assert.equal(state.correction_create_status, 'idle');
  assert.equal(state.correction_create_request_id, '');
});

test('missing Clock In audit retains gate and blocks unrelated finalization until recovered', async () => {
  const { h, state, requestId, goodAudit } = await strandedCompletedClockIn();
  assert.equal((await h.clockIn(requestId)).status, 200);
  assert.equal(state.correction_create_status, 'creating');
  const blocked = await h.action('finalize', 'missing-clockin-audit-finalize-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(h.entryLocks().length, 0);
  h.rows.TimeClockAudit.push(goodAudit);
  assert.equal((await h.clockIn(requestId)).status, 200);
  assert.equal(state.correction_create_status, 'idle');
  const finalized = await h.action('finalize', 'missing-clockin-audit-finalize-001');
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
});

test('pending or mismatched Clock In audit cannot release completed gate', async () => {
  for (const badAudit of [
    { outcome: 'pending' },
    { outcome: 'blocked' },
    { user_email: 'other@synthetic.invalid' },
    { server_timestamp: '2026-09-27T15:01:00.000Z' },
  ]) {
    const { h, state, requestId, goodAudit } = await strandedCompletedClockIn();
    h.rows.TimeClockAudit.push({ ...goodAudit, ...badAudit });
    const retry = await h.clockIn(requestId);
    assert.equal(retry.status, 200, JSON.stringify({ badAudit, response: retry.body }));
    assert.equal(state.correction_create_status, 'creating', JSON.stringify(badAudit));
  }
});

test('archived historical active rows remain untouched and do not block finalization', async () => {
  const h = setup();
  const archived = [
    { id: 'archived-old-server', archived_test_data: true, clock_in: '2026-09-11T10:40:00.349Z' },
    { id: 'archived-old-legacy', archived_test_data: true, clock_in: '2026-03-06T17:10:51.905Z' },
    { id: 'archived-by-admin', archived_admin: true, clock_in: '2026-09-20T13:00:00.000Z' },
  ].map((entry) => ({
    ...entry, user_email: employee.email, status: 'clocked_in',
    updated_date: '2026-09-11T10:41:17.972Z',
  }));
  h.rows.TimeEntry.push(...archived);
  const originals = structuredClone(archived);
  const finalized = await h.action('finalize', 'archived-legacy-finalize-001');
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  assert.equal(h.period().status, 'finalized');
  assert.equal(h.entryLocks().length, 1);
  assert.equal(h.period().finalized_summary.entry_count, 1);
  assert.deepEqual(h.rows.TimeEntry.slice(1), originals);
});

test('archived historical active entry does not block a new Clock In', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeEntry.push({
    id: 'archived-legacy-clockin', user_email: employee.email,
    status: 'clocked_in', clock_in: '2026-03-06T17:10:51.905Z',
    archived_test_data: true, updated_date: '2026-09-11T02:43:15.754Z',
  });
  const response = await h.clockIn('archived-legacy-new-clockin-001');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, 'clocked_in');
  assert.equal(h.rows.TimeEntry[0].archived_test_data, true);
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'clocked_in' && !row.archived_test_data).length, 1);
});

test('genuine unarchived orphaned active shift blocks period finalization', async () => {
  const h = setup();
  h.rows.TimeEntry.push({
    id: 'genuine-unarchived-orphan', user_email: employee.email, status: 'clocked_in',
    clock_in: '2026-09-21T14:00:00.000Z', updated_date: '2026-09-21T14:00:01.000Z',
  });
  const blocked = await h.action('finalize', 'unarchived-orphan-finalize-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.readiness.active_shift_count, 1);
  assert.equal(blocked.body.readiness.invalid_active_clock_in_count, 0);
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.audit('unarchived-orphan-finalize-001')[0].outcome, 'blocked');
});

test('malformed or absent live active clock-in blocks finalization with audit evidence', async () => {
  for (const [name, clockIn] of [['missing', null], ['malformed', 'not-a-timestamp']]) {
    const h = setup();
    h.rows.TimeEntry.push({
      id: 'invalid-active-' + name, user_email: employee.email, status: 'clocked_in',
      clock_in: clockIn, updated_date: '2026-09-21T14:00:01.000Z',
    });
    const request = 'invalid-active-finalize-' + name + '-001';
    const result = await h.action('finalize', request);
    assert.equal(result.status, 409, JSON.stringify({ name, result }));
    assert.equal(result.body.readiness.active_shift_count, 1);
    assert.equal(result.body.readiness.invalid_active_clock_in_count, 1);
    assert.match(result.body.error, /invalid clock-in timestamp/);
    assert.equal(h.period().status, 'review');
    assert.equal(h.entryLocks().length, 0);
    assert.equal(h.audit(request)[0].outcome, 'blocked');
    assert.equal(h.audit(request)[0].details.invalid_active_clock_in_count, 1);
  }
});

test('post-gate snapshot catches newly arriving active shift with invalid clock-in', async () => {
  const h = setup();
  let injected = false;
  h.setAfterRowUpdate((entity, _query, update, row) => {
    if (!injected && entity === 'TimeClockEmployeeState' && row.user_email === administrator.email &&
        update.$set?.correction_create_time_entry_id === 'pay_period:synthetic-period') {
      injected = true;
      h.rows.TimeEntry.push({
        id: 'invalid-postgate-arrival', user_email: employee.email,
        status: 'clocked_in', clock_in: '', updated_date: '2026-09-21T14:00:01.000Z',
      });
    }
  });
  const request = 'invalid-postgate-finalize-001';
  const result = await h.action('finalize', request);
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.match(result.body.error, /invalid clock-in timestamp/);
  assert.equal(h.audit(request)[0].details.blocked_reason, 'readiness_changed_after_employee_gates');
  assert.equal(h.audit(request)[0].details.invalid_active_clock_in_count, 1);
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.rows.TimeClockEmployeeState.filter((row) => row.correction_create_status === 'creating').length, 0);
});

test('Clock In on a finalized company-local date is denied before creating any shift', async () => {
  const h = setup({ serverNow: '2026-09-26T14:00:00.000Z' });
  assert.equal((await h.action('finalize', 'closed-day-finalize-001')).status, 200);
  const previousEntryCount = h.rows.TimeEntry.length;
  const blocked = await h.clockIn('closed-day-clock-in-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.finalized_pay_period_id, 'synthetic-period');
  assert.match(blocked.body.error, /2026-09-26.*finalized pay period/);
  assert.equal(h.rows.TimeEntry.length, previousEntryCount);
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  assert.equal(state.status, 'clocked_out');
  assert.equal(state.correction_create_status, 'idle');
  assert.equal(h.audit('closed-day-clock-in-001').length, 0);
  const retry = await h.clockIn('closed-day-clock-in-001');
  assert.equal(retry.status, 409);
  assert.equal(h.rows.TimeEntry.length, previousEntryCount);
});

test('audited reopen permits a retried Clock In and then active-shift readiness blocks re-finalization', async () => {
  const h = setup({ serverNow: '2026-09-26T14:00:00.000Z' });
  assert.equal((await h.action('finalize', 'reopen-clockin-finalize-001')).status, 200);
  const clockRequest = 'reopen-clockin-request-001';
  assert.equal((await h.clockIn(clockRequest)).status, 409);
  const reopened = await h.action('reopen', 'reopen-before-clockin-001', 'Shift was not yet started');
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 0);
  const clockedIn = await h.clockIn(clockRequest);
  assert.equal(clockedIn.status, 200, JSON.stringify(clockedIn.body));
  assert.equal(clockedIn.body.entry.clock_in, '2026-09-26T14:00:00.000Z');
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'clocked_in').length, 1);
  assert.equal((await h.action('finalize', 'reopened-period-refinalize-001')).status, 409);
});

test('Eastern Time midnight boundary honors the company date, not UTC', async () => {
  const beforeMidnight = setup({ serverNow: '2026-09-27T03:59:59.000Z' });
  assert.equal((await beforeMidnight.action('finalize', 'midnight-before-finalize-001')).status, 200);
  const blocked = await beforeMidnight.clockIn('midnight-before-clockin-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /2026-09-26/);

  const afterMidnight = setup({ serverNow: '2026-09-27T04:00:00.000Z' });
  assert.equal((await afterMidnight.action('finalize', 'midnight-after-finalize-001')).status, 200);
  const allowed = await afterMidnight.clockIn('midnight-after-clockin-001');
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal(allowed.body.entry.clock_in, '2026-09-27T04:00:00.000Z');
  assert.equal(afterMidnight.period().status, 'finalized');
  assert.equal(afterMidnight.entryLocks().length, 1);
});

test('Clock In checks every finalized period, including a consecutive closed period', async () => {
  const h = setup({ serverNow: '2026-09-27T14:00:00.000Z' });
  assert.equal((await h.action('finalize', 'consecutive-first-finalize-001')).status, 200);
  h.rows.TimeClockPayPeriod.push({
    id: 'next-finalized-period', label: 'Consecutive Closed Period',
    start_date: '2026-09-27', end_date: '2026-09-28', status: 'finalized',
    updated_date: '2026-09-27T12:00:00.000Z',
  });
  const blocked = await h.clockIn('consecutive-clockin-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.finalized_pay_period_id, 'next-finalized-period');
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'clocked_in').length, 0);
});

test('malformed finalized boundaries fail closed before employee state or shift changes', async () => {
  for (const [start, end] of [
    ['2026-09-31', '2026-10-02'], ['2026-10-02', '2026-09-20'],
    ['2026-09-20', 'not-a-date'],
  ]) {
    const h = setup({ entryCount: 0, serverNow: '2026-09-27T14:00:00.000Z' });
    Object.assign(h.period(), { status: 'finalized', start_date: start, end_date: end });
    const blocked = await h.clockIn('invalid-closed-period-001');
    assert.equal(blocked.status, 409, JSON.stringify({ start, end, blocked: blocked.body }));
    assert.match(blocked.body.error, /invalid date boundaries/);
    assert.equal(h.rows.TimeEntry.length, 0);
    const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
    assert.equal(state.status, 'clocked_out');
    assert.equal(state.correction_create_status, 'idle');
  }
});

test('interrupted Clock In uses original trusted punch day when retrying against a finalized period', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-27T04:01:00.000Z' });
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(state, {
    status: 'clocking_in', last_request_id: 'old-pending-clockin-001',
    pending_started_at: '2026-09-27T03:59:00.000Z',
  });
  h.period().status = 'finalized';
  const blocked = await h.clockIn('old-pending-clockin-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.finalized_pay_period_id, 'synthetic-period');
  assert.equal(h.rows.TimeEntry.length, 0);
  assert.equal(state.status, 'clocking_in');
  assert.equal(state.pending_started_at, '2026-09-27T03:59:00.000Z');
  assert.equal(state.correction_create_status, 'idle');
  h.period().status = 'review';
  const recovered = await h.clockIn('old-pending-clockin-001');
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.entry.clock_in, '2026-09-27T03:59:00.000Z');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name, error); process.exitCode = 1; }
}
if (!process.exitCode) console.log('PASS ' + tests.length + '/' + tests.length + ' Time Clock synthetic recovery scenarios');
