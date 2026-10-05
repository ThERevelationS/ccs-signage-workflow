// Synthetic-only regression harness. Never connects to live Base44 records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

const secret = 'synthetic-session-signing-key';
const staleMonitorWorkflow = readFileSync(new URL('../base44/workflows/Time Clock Stale Shift Monitor.jsonc', import.meta.url), 'utf8');
const staleMonitorCapability = staleMonitorWorkflow.match(/"_workflow_capability"\s*:\s*"([^"]+)"/)?.[1] || '';
assert.ok(staleMonitorCapability, 'Synthetic stale-shift monitor workflow capability must be present');
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
    TimeClockPayPeriodCreateGate: [{
      id: 'synthetic-period-gate', scope: 'company', status: 'idle',
      request_id: '', payload_hash: '', claim_token: '', updated_date: '2026-09-20T00:00:00.000Z',
    }],
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
    TimeClockAudit: [], TimeClockCorrectionRequest: [], TimeClockPunchException: [],
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


test('two initial idle snapshots cannot both claim the pay-period CAS gate', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  let waiting = 0;
  let releaseClaims;
  const bothWaiting = new Promise((resolve) => { releaseClaims = resolve; });
  h.setBeforeUpdate(async (name, _query, update) => {
    if (name === 'TimeClockPayPeriodCreateGate' && update.$set?.status === 'creating') {
      waiting += 1;
      if (waiting === 2) releaseClaims();
      await bothWaiting;
    }
  });
  const [one, two] = await Promise.all([
    h.invoke({ action: 'pay_period_create', request_id: 'both-read-idle-one-001',
      label: 'First idle snapshot', start_date: '2026-10-01', end_date: '2026-10-14' }),
    h.invoke({ action: 'pay_period_create', request_id: 'both-read-idle-two-001',
      label: 'Second idle snapshot', start_date: '2026-10-08', end_date: '2026-10-21' }),
  ]);
  assert.deepEqual([one.status, two.status].sort(), [200, 409]);
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.rows.TimeClockPayPeriodCreateGate[0].status, 'idle');
});

test('simultaneous overlapping creates serialize on the shared backend gate', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  let gateEntered;
  const entered = new Promise((resolve) => { gateEntered = resolve; });
  let releaseFirst;
  h.setAfterRowUpdate(async (name, _query, _update, row) => {
    if (name === 'TimeClockPayPeriodCreateGate' && row.status === 'creating' &&
        row.request_id === 'parallel-first-001') {
      gateEntered();
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
  });
  const firstRequest = { action: 'pay_period_create', request_id: 'parallel-first-001',
    label: 'First concurrent period', start_date: '2026-10-01', end_date: '2026-10-14' };
  const secondRequest = { action: 'pay_period_create', request_id: 'parallel-second-001',
    label: 'Overlapping concurrent period', start_date: '2026-10-08', end_date: '2026-10-21' };
  const firstPromise = h.invoke(firstRequest);
  await entered;
  const competing = await h.invoke(secondRequest);
  assert.equal(competing.status, 409, JSON.stringify(competing.body));
  assert.match(competing.body.error, /Another pay-period creation/);
  assert.equal(h.rows.TimeClockPayPeriod.length, 0);
  releaseFirst();
  const first = await firstPromise;
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const retried = await h.invoke(secondRequest);
  assert.equal(retried.status, 409, JSON.stringify(retried.body));
  assert.match(retried.body.error, /overlaps/);
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.rows.TimeClockPayPeriodCreateGate[0].status, 'idle');
});

test('missing or duplicate pay-period coordinator fails closed without writing records', async () => {
  for (const gates of [[], [
    { id: 'gate-one', scope: 'company', status: 'idle' },
    { id: 'gate-two', scope: 'company', status: 'idle' },
  ]]) {
    const h = setup({ entryCount: 0 });
    h.rows.TimeClockPayPeriod = [];
    h.rows.TimeClockPayPeriodCreateGate = gates;
    const result = await h.invoke({ action: 'pay_period_create', request_id: 'missing-coordinator-001',
      label: 'Should not create', start_date: '2026-10-01', end_date: '2026-10-14' });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.match(result.body.error, /coordinator.*missing or ambiguous/);
    assert.equal(h.rows.TimeClockPayPeriod.length, 0);
    assert.equal(h.rows.TimeClockAudit.length, 0);
  }
});

test('unclean idle coordinator blocks creation without overwriting unresolved metadata', async () => {
  for (const stale of [
    { request_id: 'unresolved-old-request' },
    { payload_hash: 'unresolved-hash' },
    { claim_token: 'unresolved-token' },
    { started_at: '2026-09-27T12:00:00.000Z' },
  ]) {
    const h = setup({ entryCount: 0 });
    h.rows.TimeClockPayPeriod = [];
    Object.assign(h.rows.TimeClockPayPeriodCreateGate[0], stale);
    const original = structuredClone(h.rows.TimeClockPayPeriodCreateGate[0]);
    const response = await h.invoke({
      action: 'pay_period_create', request_id: 'unclean-idle-attempt-001',
      label: 'Must not create', start_date: '2026-10-01', end_date: '2026-10-14',
    });
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.match(response.body.error, /stale lock metadata/);
    assert.deepEqual(h.rows.TimeClockPayPeriodCreateGate[0], original);
    assert.equal(h.rows.TimeClockPayPeriod.length, 0);
    assert.equal(h.rows.TimeClockAudit.length, 0);
  }
});

test('a mismatched confirmed audit cannot turn an exact retry into success', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  const payload = { action: 'pay_period_create', request_id: 'wrong-confirmed-audit-id-001',
    label: 'Recorded once', start_date: '2026-10-01', end_date: '2026-10-14' };
  const created = await h.invoke(payload);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  h.audit(payload.request_id)[0].details.pay_period_id = 'wrong-period';
  const retry = await h.invoke(payload);
  assert.equal(retry.status, 409, JSON.stringify(retry.body));
  assert.match(retry.body.error, /audit does not confirm the exact period/);
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.rows.TimeClockPayPeriodCreateGate[0].status, 'idle');
});

test('corrupt confirmed audit leaves a held coordinator locked for investigation', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  const payload = { action: 'pay_period_create', request_id: 'held-wrong-audit-id-001',
    label: 'Held record', start_date: '2026-10-01', end_date: '2026-10-14' };
  const created = await h.invoke(payload);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const audit = h.audit(payload.request_id)[0];
  const gate = h.rows.TimeClockPayPeriodCreateGate[0];
  Object.assign(gate, { status: 'creating', request_id: payload.request_id,
    payload_hash: audit.details.payload_hash, claim_token: 'held-corrupt-audit-token',
    started_at: '2026-09-27T12:00:00.000Z' });
  audit.details.pay_period_id = 'wrong-period';
  const retry = await h.invoke(payload);
  assert.equal(retry.status, 409, JSON.stringify(retry.body));
  assert.equal(gate.status, 'creating');
  assert.equal(gate.claim_token, 'held-corrupt-audit-token');
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
});

test('interrupted pay-period audit finalization retains the gate until exact-request recovery', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  const payload = { action: 'pay_period_create', request_id: 'interrupted-period-create-001',
    label: 'Interrupted create', start_date: '2026-10-01', end_date: '2026-10-14' };
  h.setBeforeUpdate((name, _query, update) => {
    if (name === 'TimeClockAudit' && update.$set?.outcome === 'confirmed') {
      throw new Error('Synthetic audit-write interruption');
    }
  });
  const interrupted = await h.invoke(payload);
  assert.equal(interrupted.status, 500, JSON.stringify(interrupted.body));
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.rows.TimeClockPayPeriodCreateGate[0].status, 'creating');
  assert.equal(h.audit(payload.request_id)[0].outcome, 'pending');
  const competing = await h.invoke({ ...payload, request_id: 'competing-during-recovery-001',
    label: 'Competing period', start_date: '2026-10-08', end_date: '2026-10-21' });
  assert.equal(competing.status, 409, JSON.stringify(competing.body));
  h.setBeforeUpdate(null);
  const recovered = await h.invoke(payload);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.reused, true);
  assert.equal(h.audit(payload.request_id)[0].outcome, 'confirmed');
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.rows.TimeClockPayPeriodCreateGate[0].status, 'idle');
});

test('a completed create with lost lock-release acknowledgement can be safely reclaimed', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  const request_id = 'completed-create-lost-release-001';
  const first = await h.invoke({ action: 'pay_period_create', request_id,
    label: 'Already created', start_date: '2026-10-01', end_date: '2026-10-14' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const gate = h.rows.TimeClockPayPeriodCreateGate[0];
  Object.assign(gate, { status: 'creating', request_id,
    payload_hash: h.audit(request_id)[0].details.payload_hash,
    claim_token: 'synthetic-lost-ack-token', started_at: new Date().toISOString() });
  const next = await h.invoke({ action: 'pay_period_create',
    request_id: 'after-completed-recovery-001', label: 'Next adjacent',
    start_date: '2026-10-15', end_date: '2026-10-28' });
  assert.equal(next.status, 200, JSON.stringify(next.body));
  assert.equal(h.rows.TimeClockPayPeriod.length, 2);
  assert.equal(gate.status, 'idle');
});

test('ordinary pay-period create is audited and exact retry reuses one period', async () => {
  const h = setup({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  const request_id = 'create-empty-period-001';
  const payload = { action: 'pay_period_create', request_id, label: 'New period',
    start_date: '2026-09-27', end_date: '2026-10-10' };
  const created = await h.invoke(payload);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.rows.TimeClockPayPeriod[0].status, 'open');
  assert.equal(h.audit(request_id).length, 1);
  assert.equal(h.audit(request_id)[0].outcome, 'confirmed');
  const reused = await h.invoke(payload);
  assert.equal(reused.status, 200, JSON.stringify(reused.body));
  assert.equal(reused.body.reused, true);
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  assert.equal(h.audit(request_id).length, 1);
});

test('adjacent pay periods remain allowed; inclusive overlap is blocked', async () => {
  const h = setup({ entryCount: 0 });
  const adjacent = await h.invoke({ action: 'pay_period_create',
    request_id: 'adjacent-period-create-001', label: 'Adjacent period',
    start_date: '2026-09-27', end_date: '2026-10-03' });
  assert.equal(adjacent.status, 200, JSON.stringify(adjacent.body));
  const overlapping = await h.invoke({ action: 'pay_period_create',
    request_id: 'overlapping-period-create-001', label: 'Overlapping period',
    start_date: '2026-09-26', end_date: '2026-09-29' });
  assert.equal(overlapping.status, 409, JSON.stringify(overlapping.body));
  assert.match(overlapping.body.error, /overlaps/);
  assert.equal(h.rows.TimeClockPayPeriod.length, 2);
  assert.equal(h.audit('overlapping-period-create-001').length, 0);
});

test('malformed historical period fails closed without creating or rewriting records', async () => {
  for (const [start, end] of [
    ['2026-09-31', '2026-10-02'], ['2026-09-20', 'not-a-date'],
    ['2026-10-02', '2026-09-20'], ['', '2026-10-02'],
  ]) {
    const h = setup({ entryCount: 0 });
    Object.assign(h.period(), { start_date: start, end_date: end });
    const original = structuredClone(h.period());
    const result = await h.invoke({ action: 'pay_period_create',
      request_id: 'invalid-existing-period-001', label: 'Should be blocked',
      start_date: '2026-10-04', end_date: '2026-10-10' });
    assert.equal(result.status, 409, JSON.stringify({ start, end, body: result.body }));
    assert.match(result.body.error, /existing pay period.*invalid date boundaries/i);
    assert.equal(h.rows.TimeClockPayPeriod.length, 1);
    assert.deepEqual(h.period(), original);
    assert.equal(h.audit('invalid-existing-period-001').length, 0);
  }
});

test('pending create audit is blocked on invalid existing dates and cannot be reused', async () => {
  const h = setup({ entryCount: 0 });
  const request_id = 'pending-invalid-period-create-001';
  Object.assign(h.period(), { start_date: 'not-a-date' });
  h.rows.TimeClockAudit.push({ id: 'synthetic-pending-create-audit',
    action: 'pay_period_create', outcome: 'pending', request_id,
    details: { label: 'Pending test', start_date: '2026-10-04',
      end_date: '2026-10-10' } });
  const payload = { action: 'pay_period_create', request_id,
    label: 'Pending test', start_date: '2026-10-04', end_date: '2026-10-10' };
  const blocked = await h.invoke(payload);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(h.audit(request_id)[0].outcome, 'blocked');
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
  const retry = await h.invoke(payload);
  assert.equal(retry.status, 409);
  assert.equal(h.rows.TimeClockPayPeriod.length, 1);
});

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

test('finalized payroll snapshot binds exact locked entry and approval evidence', async () => {
  const h = setup({ entryCount: 2 });
  const requestId = 'snapshot-bound-finalize-001';
  const first = await h.action('finalize', requestId);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(h.period().finalized_summary.snapshot_version, 3);
  assert.match(h.period().finalized_summary.previous_history_hash, /^[a-f0-9]{64}$/);
  assert.match(h.period().finalized_summary.snapshot_chain_hash, /^[a-f0-9]{64}$/);
  assert.match(h.period().finalized_summary.entry_snapshot_hash, /^[a-f0-9]{64}$/);
  assert.equal(h.period().finalized_summary.shift_manifest_hash, h.period().finalized_summary.entry_snapshot_hash);
  assert.equal(h.period().finalized_summary.shift_manifest.length, 2);

  // A finalized row must not be able to drift while an exact lost-response retry
  // silently confirms the old finalization.
  h.entryLocks()[0].total_hours = Number(h.entryLocks()[0].total_hours || 0) + 0.25;
  const retry = await h.action('finalize', requestId);
  assert.equal(retry.status, 409, JSON.stringify(retry.body));
  assert.match(retry.body.error, /payroll snapshot no longer matches/i);
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

test('reopen retires the prior payroll snapshot and re-finalize replaces it authoritatively', async () => {
  const h = setup();
  const firstRequest = 'snapshot-lifecycle-first-001';
  const reopenRequest = 'snapshot-lifecycle-reopen-001';
  const secondRequest = 'snapshot-lifecycle-second-001';

  assert.equal((await h.action('finalize', firstRequest)).status, 200);
  const firstSummary = structuredClone(h.period().finalized_summary);
  assert.equal(firstSummary.snapshot_active, true);
  assert.equal(firstSummary.request_id, firstRequest);

  const reopened = await h.action('reopen', reopenRequest, 'Payroll correction review');
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  assert.equal(h.period().status, 'review');
  assert.equal(h.period().finalized_summary.snapshot_active, false);
  assert.equal(h.period().finalized_summary.invalidated_by_reopen_request_id, reopenRequest);
  assert.equal(h.period().finalized_summary.request_id, firstRequest);
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.period().finalized_summary_history.length, 1);
  assert.equal(h.period().finalized_summary_history[0].request_id, firstRequest);
  assert.equal(h.period().finalized_summary_history[0].invalidated_by_reopen_request_id, reopenRequest);
  assert.equal(h.period().finalized_summary_history[0].snapshot_version, 3);
  assert.deepEqual(h.period().finalized_summary_history[0].shift_manifest, firstSummary.shift_manifest);
  assert.equal(h.period().finalized_summary_history[0].shift_manifest_hash, firstSummary.entry_snapshot_hash);

  assert.equal((await h.action('finalize', secondRequest)).status, 200);
  assert.equal(h.period().status, 'finalized');
  assert.equal(h.period().finalized_summary.snapshot_active, true);
  assert.equal(h.period().finalized_summary.request_id, secondRequest);
  assert.equal(h.period().finalized_summary.invalidated_by_reopen_request_id, undefined);
  assert.equal(h.period().finalized_summary_history.length, 1);

  const staleRetry = await h.action('finalize', firstRequest);
  assert.equal(staleRetry.status, 409, JSON.stringify(staleRetry.body));
  assert.equal(h.period().finalized_summary.request_id, secondRequest);
  assert.equal(h.period().finalized_summary.snapshot_active, true);

  const secondReopen = 'snapshot-lifecycle-reopen-002';
  assert.equal((await h.action('reopen', secondReopen, 'Second payroll correction')).status, 200);
  assert.equal(h.period().finalized_summary_history.length, 2);
  assert.deepEqual(h.period().finalized_summary_history.map((item) => item.request_id), [firstRequest, secondRequest]);
  assert.equal(h.period().finalized_summary_history[1].invalidated_by_reopen_request_id, secondReopen);
  assert.equal((await h.action('reopen', secondReopen, 'Second payroll correction')).status, 200);
  assert.equal(h.period().finalized_summary_history.length, 2);
});

test('snapshot chain detects altered historical payroll provenance before reopen', async () => {
  const h = setup();
  assert.equal((await h.action('finalize', 'chain-first-finalize-001')).status, 200);
  assert.equal((await h.action('reopen', 'chain-first-reopen-001', 'First correction')).status, 200);
  assert.equal((await h.action('finalize', 'chain-second-finalize-001')).status, 200);
  assert.equal(h.period().finalized_summary.snapshot_version, 3);
  assert.equal(h.period().finalized_summary_history.length, 1);

  h.period().finalized_summary_history[0].invalidation_reason = 'tampered reason';
  const blocked = await h.action('reopen', 'chain-second-reopen-001', 'Second correction');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /history integrity failed/i);
  assert.equal(h.period().status, 'finalized');
  assert.equal(h.entryLocks().length, 1);
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
  // Keep the authoritative punch within the period being finalized; a shift
  // starting after its end date is correctly excluded from that period.
  const h = setup({ serverNow: '2026-09-25T14:00:00.000Z' });
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

test('an overnight active shift still blocks finalizing its original company-local day', async () => {
  // The server is already on Sep 27 in New York, but this open shift began
  // at 11:59 PM on Sep 26 and still overlaps the period ending Sep 26.
  const h = setup({ entryCount: 0, serverNow: '2026-09-27T04:10:00.000Z' });
  h.rows.TimeEntry.push({
    id: 'synthetic-overnight-active', user_email: employee.email,
    status: 'clocked_in', clock_in: '2026-09-27T03:59:00.000Z',
    updated_date: '2026-09-27T04:00:00.000Z',
  });
  const result = await h.action('finalize', 'overnight-active-finalize-001');
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.readiness.active_shift_count, 1);
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.audit('overnight-active-finalize-001')[0].outcome, 'blocked');
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

test('interrupted Clock In preserves its original trusted punch after closed-period rejection and reopen', async () => {
  // A pending transition older than five real minutes is legitimately rolled
  // back by recoverTransition, so keep this synthetic pending action fresh.
  const originalPunch = new Date(Date.now() - 30_000).toISOString();
  const laterServerNow = new Date(Date.now() + 30_000).toISOString();
  const h = setup({ entryCount: 0, serverNow: laterServerNow });
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(originalPunch));
  const part = (type) => parts.find((item) => item.type === type).value;
  const originalDay = `${part('year')}-${part('month')}-${part('day')}`;
  Object.assign(h.period(), { status: 'finalized', start_date: originalDay, end_date: originalDay });
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(state, {
    status: 'clocking_in', last_request_id: 'old-pending-clockin-001', pending_started_at: originalPunch,
  });
  const blocked = await h.clockIn('old-pending-clockin-001');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.finalized_pay_period_id, 'synthetic-period');
  assert.equal(h.rows.TimeEntry.length, 0);
  assert.equal(state.status, 'clocking_in');
  assert.equal(state.pending_started_at, originalPunch);
  assert.equal(state.correction_create_status, 'idle');
  h.period().status = 'review';
  const recovered = await h.clockIn('old-pending-clockin-001');
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.entry.clock_in, originalPunch);
});

function setupStaleMissedPunch({ serverNow = '2026-09-29T12:00:00.000Z', clockIn = '2026-09-28T10:00:00.000Z' } = {}) {
  const h = setup({ entryCount: 1, serverNow });
  h.rows.TimeClockPayPeriod = [];
  const entry = h.rows.TimeEntry[0];
  Object.assign(entry, {
    status: 'clocked_in', clock_in: clockIn, approval_status: 'unreviewed',
    lunch_minutes: 0, job_allocations: [], clock_source: 'server',
  });
  delete entry.clock_out;
  delete entry.total_hours;
  delete entry.pay_period_id;
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(state, {
    status: 'clocked_in', active_entry_id: entry.id,
    break_status: 'working', active_break_id: null,
    work_pause_status: 'working', active_work_pause_id: null,
    labor_status: 'idle',
  });
  return h;
}

test('scheduled stale-shift monitor rejects ordinary authenticated calls without its workflow capability', async () => {
  const h = setupStaleMissedPunch();
  const before = structuredClone(h.rows.TimeEntry[0]);
  const noCapability = await h.invoke({ action: 'monitor_stale_shifts' });
  assert.equal(noCapability.status, 403, JSON.stringify(noCapability.body));
  const wrongCapability = await h.invoke({
    action: 'monitor_stale_shifts',
    _workflow_capability: 'wrong_capability_but_long_enough_for_format_1234567890',
  });
  assert.equal(wrongCapability.status, 403, JSON.stringify(wrongCapability.body));
  assert.deepEqual(h.rows.TimeEntry[0], before);
  assert.equal(h.rows.TimeClockPunchException.length, 0);
  assert.equal(h.rows.TimeClockAudit.length, 0);
});

test('scheduled stale-shift monitor creates one audited open case without changing the punch and is idempotent', async () => {
  const h = setupStaleMissedPunch();
  const before = structuredClone(h.rows.TimeEntry[0]);
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);

  const first = await h.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.stale, 1);
  assert.equal(first.body.created, 1);
  assert.equal(first.body.errors, 0);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  const punchCase = h.rows.TimeClockPunchException[0];
  assert.equal(punchCase.case_key, `missed_clock_out:${before.id}`);
  assert.equal(punchCase.exception_type, 'missed_clock_out');
  assert.equal(punchCase.status, 'open');
  assert.equal(punchCase.detected_clock_in, before.clock_in);
  assert.equal(punchCase.original_snapshot.clock_in, before.clock_in);
  assert.match(punchCase.resolution_note, /No punch time was changed/);
  assert.equal(h.rows.TimeEntry[0].clock_in, before.clock_in);
  assert.equal(h.rows.TimeEntry[0].clock_out, undefined);
  assert.equal(h.rows.TimeEntry[0].status, 'clocked_in');
  assert.equal(state.status, 'clocked_in');
  assert.equal(state.active_entry_id, before.id);
  assert.equal(state.correction_create_status, 'idle');

  const monitorAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'punch_exception' && row.details?.source === 'scheduled_stale_shift_monitor'
  );
  assert.equal(monitorAudits.length, 1);
  assert.equal(monitorAudits[0].authentication_method, 'system');
  assert.equal(monitorAudits[0].actor_role, 'system');
  assert.equal(monitorAudits[0].details.punch_times_changed, false);
  assert.equal(monitorAudits[0].details.punch_exception_id, punchCase.id);

  const retry = await h.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.created, 0);
  assert.equal(retry.body.existing, 1);
  assert.equal(retry.body.errors, 0);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.details?.source === 'scheduled_stale_shift_monitor').length, 1);
});

test('scheduled stale-shift monitor preserves ordinary overnight and freshly acknowledged long shifts', async () => {
  const overnight = setupStaleMissedPunch({
    serverNow: '2026-09-29T05:00:00.000Z',
    clockIn: '2026-09-28T11:30:00.000Z',
  });
  const overnightRun = await overnight.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  assert.equal(overnightRun.status, 200, JSON.stringify(overnightRun.body));
  assert.equal(overnightRun.body.stale, 0);
  assert.equal(overnightRun.body.created, 0);
  assert.equal(overnight.rows.TimeClockPunchException.length, 0);
  assert.equal(overnight.rows.TimeEntry[0].status, 'clocked_in');

  const acknowledged = setupStaleMissedPunch();
  acknowledged.rows.TimeEntry[0].stale_shift_acknowledged_at = '2026-09-29T08:00:00.000Z';
  const acknowledgedRun = await acknowledged.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  assert.equal(acknowledgedRun.status, 200, JSON.stringify(acknowledgedRun.body));
  assert.equal(acknowledgedRun.body.acknowledged, 1);
  assert.equal(acknowledgedRun.body.created, 0);
  assert.equal(acknowledged.rows.TimeClockPunchException.length, 0);
  assert.equal(acknowledged.rows.TimeEntry[0].status, 'clocked_in');
});

test('scheduled stale-shift monitor serializes against employee missed-punch recovery without duplicate cases', async () => {
  const h = setupStaleMissedPunch();
  let monitorClaimed;
  const claimed = new Promise((resolve) => { monitorClaimed = resolve; });
  let releaseMonitor;
  h.setAfterRowUpdate(async (name, _query, _update, row) => {
    if (name === 'TimeClockEmployeeState' && row.correction_create_status === 'creating' &&
        String(row.correction_create_request_id || '').startsWith('stale-monitor-')) {
      monitorClaimed();
      await new Promise((resolve) => { releaseMonitor = resolve; });
    }
  });

  const monitorPromise = h.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  await claimed;
  const competingEmployee = await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'employee-during-monitor-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  assert.equal(competingEmployee.status, 409, JSON.stringify(competingEmployee.body));
  assert.match(competingEmployee.body.error, /correction submission|processed/i);
  assert.equal(h.rows.TimeClockPunchException.length, 0);

  releaseMonitor();
  const monitor = await monitorPromise;
  assert.equal(monitor.status, 200, JSON.stringify(monitor.body));
  assert.equal(monitor.body.created, 1);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  h.setAfterRowUpdate(null);

  const employeeRetry = await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'employee-during-monitor-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  assert.equal(employeeRetry.status, 200, JSON.stringify(employeeRetry.body));
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  assert.equal(h.rows.TimeClockPunchException[0].status, 'pending_manager_review');
  assert.equal(h.rows.TimeEntry[0].status, 'needs_resolution');
});

test('scheduled stale-shift monitor recovers a persisted case with stranded exact monitor gate and missing audit', async () => {
  const h = setupStaleMissedPunch();
  const first = await h.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const punchCase = h.rows.TimeClockPunchException[0];
  const monitorAudit = h.rows.TimeClockAudit.find((row) => row.details?.source === 'scheduled_stale_shift_monitor');
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  assert.ok(punchCase?.id && monitorAudit?.id);

  h.rows.TimeClockAudit = h.rows.TimeClockAudit.filter((row) => row.id !== monitorAudit.id);
  Object.assign(state, {
    correction_create_status: 'creating',
    correction_create_request_id: monitorAudit.request_id,
    correction_create_time_entry_id: `punch_exception:${h.rows.TimeEntry[0].id}`,
    correction_create_payload_hash: monitorAudit.details.payload_hash,
    correction_create_claim_token: 'synthetic-stranded-monitor-token',
    correction_create_started_at: '2026-09-29T11:00:00.000Z',
  });

  const recovered = await h.invoke({
    action: 'monitor_stale_shifts', _workflow_capability: staleMonitorCapability,
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.existing, 1);
  assert.equal(recovered.body.errors, 0);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.details?.source === 'scheduled_stale_shift_monitor').length, 1);
  assert.equal(state.correction_create_status, 'idle');
});

test('long cross-date shift prompts without mutating the active punch', async () => {
  const h = setupStaleMissedPunch();
  const before = structuredClone(h.rows.TimeEntry[0]);
  const status = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(status.body.requires_punch_resolution, true);
  assert.equal(status.body.punch_resolution.type, 'missed_clock_out');
  assert.equal(status.body.punch_resolution.self_service_blocked, false);
  assert.equal(h.rows.TimeEntry[0].status, before.status);
  assert.equal(h.rows.TimeEntry[0].clock_in, before.clock_in);
  assert.equal(h.rows.TimeEntry[0].clock_out, undefined);
  assert.equal(h.rows.TimeClockPunchException.length, 0);
});

test('ordinary overnight shift under 18 hours is preserved without a missed-punch prompt', async () => {
  const h = setupStaleMissedPunch({
    serverNow: '2026-09-29T03:00:00.000Z',
    clockIn: '2026-09-28T10:00:00.000Z',
  });
  const status = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.notEqual(status.body.requires_punch_resolution, true);
  assert.equal(h.rows.TimeEntry[0].status, 'clocked_in');
});

test('Worked Through preserves the original continuous shift with an exact audit', async () => {
  const h = setupStaleMissedPunch();
  const originalClockIn = h.rows.TimeEntry[0].clock_in;
  const payload = {
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'worked-through-acceptance-001', response: 'worked_through',
  };
  const first = await h.invoke(payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.worked_through, true);
  assert.equal(h.rows.TimeEntry[0].status, 'clocked_in');
  assert.equal(h.rows.TimeEntry[0].clock_in, originalClockIn);
  assert.equal(h.rows.TimeEntry[0].clock_out, undefined);
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).status, 'clocked_in');
  assert.equal(h.rows.TimeClockCorrectionRequest.length, 0);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  assert.equal(h.rows.TimeClockPunchException[0].status, 'worked_through');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'punch_exception').length, 1);
  const acknowledgedAt = h.rows.TimeEntry[0].stale_shift_acknowledged_at;
  const retry = await h.invoke(payload);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.reused, true);
  assert.equal(h.rows.TimeEntry[0].stale_shift_acknowledged_at, acknowledgedAt);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
});

test('active Current Work blocks self-service missed Clock Out but still reports the stale shift', async () => {
  const h = setupStaleMissedPunch();
  h.rows.TimeClockLaborSegment = [{
    id: 'active-labor-001', user_email: employee.email, time_entry_id: h.rows.TimeEntry[0].id,
    status: 'active', started_at: '2026-09-29T08:00:00.000Z',
  }];
  const status = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(status.body.requires_punch_resolution, true);
  assert.equal(status.body.punch_resolution.self_service_blocked, true);
  assert.match(status.body.punch_resolution.self_service_blocked_reason, /Current Work/);
  const blocked = await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'blocked-current-work-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /Current Work/);
  assert.equal(h.rows.TimeEntry[0].status, 'clocked_in');
  assert.equal(h.rows.TimeClockCorrectionRequest.length, 0);
});

test('missed Clock Out detaches old shift without fabricating time and permits a fresh Clock In', async () => {
  const h = setupStaleMissedPunch();
  const payload = {
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'missed-clock-out-acceptance-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  };
  const resolved = await h.invoke(payload);
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.punch_resolution_pending, true);
  const oldEntry = h.rows.TimeEntry[0];
  assert.equal(oldEntry.status, 'needs_resolution');
  assert.equal(oldEntry.clock_out, undefined);
  assert.equal(oldEntry.approval_status, 'needs_review');
  const employeeState = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  assert.equal(employeeState.status, 'clocked_out');
  assert.equal(employeeState.active_entry_id, null);
  assert.equal(h.rows.TimeClockPunchException[0].status, 'pending_manager_review');
  assert.equal(h.rows.TimeClockCorrectionRequest.length, 1);
  assert.equal(h.rows.TimeClockCorrectionRequest[0].request_kind, 'missed_clock_out');
  assert.equal(h.rows.TimeClockCorrectionRequest[0].requested_changes.clock_out, '2026-09-28T22:00:00.000Z');

  const returnStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(returnStatus.status, 200, JSON.stringify(returnStatus.body));
  assert.equal(returnStatus.body.status, 'clocked_out');
  assert.equal(returnStatus.body.unresolved_punch_review.count, 1);
  assert.equal(returnStatus.body.unresolved_punch_review.has_integrity_issue, false);
  assert.equal(returnStatus.body.unresolved_punch_review.items[0].review_state, 'awaiting_manager_review');
  assert.equal(returnStatus.body.unresolved_punch_review.items[0].time_entry_id, oldEntry.id);
  assert.equal(returnStatus.body.unresolved_punch_review.items[0].reported_clock_out, '2026-09-28T22:00:00.000Z');

  const retried = await h.invoke(payload);
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.reused, true);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  assert.equal(h.rows.TimeClockCorrectionRequest.length, 1);

  const freshClockIn = await h.clockIn('fresh-after-missed-001');
  assert.equal(freshClockIn.status, 200, JSON.stringify(freshClockIn.body));
  assert.equal(freshClockIn.body.status, 'clocked_in');
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'needs_resolution').length, 1);
  assert.equal(h.rows.TimeEntry.filter((row) => row.status === 'clocked_in').length, 1);
  const activeReturnStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(activeReturnStatus.body.status, 'clocked_in');
  assert.equal(activeReturnStatus.body.unresolved_punch_review.count, 1);
  assert.equal(activeReturnStatus.body.unresolved_punch_review.items[0].review_state, 'awaiting_manager_review');
});

test('missed Clock Out rejects impossible times before creating recovery records', async () => {
  for (const claimedClockOut of [
    '2026-09-28T09:00:00.000Z',
    '2026-09-30T09:00:00.000Z',
    'not-a-date',
  ]) {
    const h = setupStaleMissedPunch();
    const result = await h.invoke({
      action: 'resolve_punch_exception', target_email: employee.email,
      request_id: 'invalid-missed-punch-001', response: 'missed_clock_out', claimed_clock_out: claimedClockOut,
    });
    assert.ok([400, 409].includes(result.status), JSON.stringify(result.body));
    assert.equal(h.rows.TimeEntry[0].status, 'clocked_in');
    assert.equal(h.rows.TimeClockPunchException.length, 0);
    assert.equal(h.rows.TimeClockCorrectionRequest.length, 0);
  }
});

test('manager approval completes the unresolved shift while rejection leaves it unresolved', async () => {
  const approveHarness = setupStaleMissedPunch();
  await approveHarness.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'approve-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  const approveRequest = approveHarness.rows.TimeClockCorrectionRequest[0];
  const approved = await approveHarness.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'approve-review-001', correction_request_id: approveRequest.id,
    expected_request_updated_date: approveRequest.updated_date,
    decision: 'approve', reason: 'Verified employee reported time',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approveHarness.rows.TimeEntry[0].status, 'clocked_out');
  assert.equal(approveHarness.rows.TimeEntry[0].clock_out, '2026-09-28T22:00:00.000Z');
  assert.equal(approveHarness.rows.TimeEntry[0].approval_status, 'needs_review');
  assert.equal(approveHarness.rows.TimeClockPunchException[0].status, 'resolved');
  assert.equal(approved.body.entry.id, approveHarness.rows.TimeEntry[0].id);
  assert.equal(approved.body.entry.approval_status, 'needs_review');

  const postCorrectionStatus = await approveHarness.invoke({ action: 'status', target_email: employee.email });
  assert.equal(postCorrectionStatus.status, 200, JSON.stringify(postCorrectionStatus.body));
  assert.equal(postCorrectionStatus.body.unresolved_punch_review, undefined);
  assert.equal(postCorrectionStatus.body.pending_shift_review.count, 1);
  assert.equal(postCorrectionStatus.body.pending_shift_review.has_integrity_issue, false);
  assert.equal(postCorrectionStatus.body.pending_shift_review.items[0].review_state, 'awaiting_shift_approval');
  assert.equal(postCorrectionStatus.body.pending_shift_review.items[0].time_entry_id, approveHarness.rows.TimeEntry[0].id);

  const reviewableEntry = approveHarness.rows.TimeEntry[0];
  const shiftApproved = await approveHarness.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'approve-shift-after-correction-001', entry_id: reviewableEntry.id,
    expected_updated_date: reviewableEntry.updated_date,
    decision: 'approve', note: 'Final shift review after missed-punch correction',
  });
  assert.equal(shiftApproved.status, 200, JSON.stringify(shiftApproved.body));
  assert.equal(approveHarness.rows.TimeEntry[0].approval_status, 'approved');
  const settledStatus = await approveHarness.invoke({ action: 'status', target_email: employee.email });
  assert.equal(settledStatus.status, 200, JSON.stringify(settledStatus.body));
  assert.equal(settledStatus.body.unresolved_punch_review, undefined);
  assert.equal(settledStatus.body.pending_shift_review, undefined);

  const rejectHarness = setupStaleMissedPunch();
  await rejectHarness.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'reject-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  const rejectRequest = rejectHarness.rows.TimeClockCorrectionRequest[0];
  const rejected = await rejectHarness.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'reject-review-001', correction_request_id: rejectRequest.id,
    expected_request_updated_date: rejectRequest.updated_date,
    decision: 'reject', reason: 'Needs clarification',
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejectHarness.rows.TimeEntry[0].status, 'needs_resolution');
  assert.equal(rejectHarness.rows.TimeEntry[0].clock_out, undefined);
  assert.equal(rejectHarness.rows.TimeClockPunchException[0].status, 'rejected');
  assert.equal(rejected.body.entry.id, rejectHarness.rows.TimeEntry[0].id);
  assert.equal(rejected.body.entry.status, 'needs_resolution');
});

test('missed Clock Out review fails closed before mutation when correction and Punch Exception linkage disagree', async () => {
  const h = setupStaleMissedPunch();
  await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'link-integrity-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  const request = h.rows.TimeClockCorrectionRequest[0];
  const punchCase = h.rows.TimeClockPunchException[0];
  punchCase.correction_request_id = 'wrong-correction-link';
  const beforeEntry = structuredClone(h.rows.TimeEntry[0]);
  const returnStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(returnStatus.status, 200, JSON.stringify(returnStatus.body));
  assert.equal(returnStatus.body.unresolved_punch_review.count, 1);
  assert.equal(returnStatus.body.unresolved_punch_review.has_integrity_issue, true);
  assert.equal(returnStatus.body.unresolved_punch_review.items[0].review_state, 'needs_manager_investigation');

  const blocked = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'link-integrity-review-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date,
    decision: 'approve', reason: 'Would otherwise approve',
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /Punch Exception|investigation/i);
  assert.equal(request.status, 'pending');
  assert.deepEqual(h.rows.TimeEntry[0], beforeEntry);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'correction_review').length, 0);
});

test('exact approval retry repairs Punch Exception finalization interrupted after the TimeEntry and review were saved', async () => {
  const h = setupStaleMissedPunch();
  await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'approve-reconcile-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  const request = h.rows.TimeClockCorrectionRequest[0];
  const reviewPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'approve-reconcile-review-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date,
    decision: 'approve', reason: 'Verified reported Clock Out',
  };
  let failOnce = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (failOnce && entity === 'TimeClockPunchException' && update.$set?.status === 'resolved') {
      failOnce = false;
      throw new Error('synthetic interruption after review save');
    }
  });

  const interrupted = await h.invoke(reviewPayload);
  assert.equal(interrupted.status, 500, JSON.stringify(interrupted.body));
  assert.equal(h.rows.TimeClockCorrectionRequest[0].status, 'approved');
  assert.equal(h.rows.TimeEntry[0].status, 'clocked_out');
  assert.equal(h.rows.TimeEntry[0].clock_out, '2026-09-28T22:00:00.000Z');
  assert.equal(h.rows.TimeClockPunchException[0].status, 'pending_manager_review');

  h.setBeforeUpdate(null);
  const recovered = await h.invoke(reviewPayload);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.reused, true);
  assert.equal(h.rows.TimeClockCorrectionRequest[0].status, 'approved');
  assert.equal(h.rows.TimeClockPunchException[0].status, 'resolved');
  assert.equal(
    h.rows.TimeClockPunchException[0].resolution_audit_id,
    h.rows.TimeClockCorrectionRequest[0].applied_audit_id,
  );
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 1);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'correction_review').length, 1);
});

test('exact rejection retry repairs Punch Exception finalization interrupted after the review was saved', async () => {
  const h = setupStaleMissedPunch();
  await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'reject-reconcile-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  const request = h.rows.TimeClockCorrectionRequest[0];
  const reviewPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'reject-reconcile-review-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date,
    decision: 'reject', reason: 'Employee needs to clarify the reported time',
  };
  let failOnce = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (failOnce && entity === 'TimeClockPunchException' && update.$set?.status === 'rejected') {
      failOnce = false;
      throw new Error('synthetic interruption after rejection save');
    }
  });

  const interrupted = await h.invoke(reviewPayload);
  assert.equal(interrupted.status, 500, JSON.stringify(interrupted.body));
  assert.equal(h.rows.TimeClockCorrectionRequest[0].status, 'rejected');
  assert.equal(h.rows.TimeEntry[0].status, 'needs_resolution');
  assert.equal(h.rows.TimeClockPunchException[0].status, 'pending_manager_review');

  h.setBeforeUpdate(null);
  const recovered = await h.invoke(reviewPayload);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.reused, true);
  assert.equal(h.rows.TimeClockPunchException[0].status, 'rejected');
  const reviewAudit = h.rows.TimeClockAudit.find((row) => row.action === 'correction_review' && row.request_id === reviewPayload.request_id);
  assert.ok(reviewAudit?.id);
  assert.equal(h.rows.TimeClockPunchException[0].resolution_audit_id, reviewAudit.id);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'correction_review').length, 1);
});

test('terminal correction review fails closed if final TimeEntry convergence is lost before success', async () => {
  const h = setupStaleMissedPunch();
  await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'convergence-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  const request = h.rows.TimeClockCorrectionRequest[0];
  let corruptOnce = true;
  h.setBeforeUpdate((entity, _query, update) => {
    if (corruptOnce && entity === 'TimeClockPunchException' && update.$set?.status === 'resolved') {
      corruptOnce = false;
      h.rows.TimeEntry[0].approval_status = 'approved';
    }
  });
  const result = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'convergence-review-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date,
    decision: 'approve', reason: 'Verified reported Clock Out',
  });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.match(result.body.error, /converg|investigation/i);
  assert.equal(h.rows.TimeClockCorrectionRequest[0].status, 'approved');
  assert.equal(h.rows.TimeClockPunchException[0].status, 'resolved');
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');
});

test('stale applied review recovery preserves exact retry audit binding', async () => {
  const sourceSlice = source.slice(source.indexOf("if (staleApplied)"), source.indexOf("if (staleAudit?.id && ['confirmed'"));
  assert.match(sourceSlice, /review_payload_hash: previousReviewHash/);
  assert.match(sourceSlice, /recovered_after_review_save: true/);
  assert.match(sourceSlice, /reconcileMissedClockOutTerminal\(recoveredRequest, staleAudit\.id\)/);
});

test('late-day clock action intent prompts for a possible missed Clock In without inventing a shift', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [];

  const passiveStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(passiveStatus.status, 200, JSON.stringify(passiveStatus.body));
  assert.notEqual(passiveStatus.body.requires_late_clock_in_review, true);
  assert.equal(h.rows.TimeEntry.length, 0);

  const actionStatus = await h.invoke({
    action: 'status', target_email: employee.email, clock_action_intent: true,
  });
  assert.equal(actionStatus.status, 200, JSON.stringify(actionStatus.body));
  assert.equal(actionStatus.body.status, 'clocked_out');
  assert.equal(actionStatus.body.requires_late_clock_in_review, true);
  assert.equal(actionStatus.body.late_clock_in_review.type, 'late_clock_in');
  assert.equal(actionStatus.body.late_clock_in_review.company_date, '2026-09-28');
  assert.equal(h.rows.TimeEntry.length, 0);
  assert.equal(h.rows.TimeClockPunchException.length, 0);
});

test('late-day missed Clock In recovery reconstructs one auditable Needs Review shift and exact retry is idempotent', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [];
  const payload = {
    action: 'recover_missed_clock_in',
    target_email: employee.email,
    request_id: 'late-clock-in-recovery-001',
    claimed_clock_in: '2026-09-28T12:00:00.000Z',
  };

  const first = await h.invoke(payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.recovered_missed_clock_in, true);
  assert.equal(first.body.status, 'clocked_in');
  assert.equal(h.rows.TimeEntry.length, 1);
  const entry = h.rows.TimeEntry[0];
  assert.equal(entry.clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(entry.clock_source, 'employee_attested_missed_clock_in');
  assert.equal(entry.status, 'clocked_in');
  assert.equal(entry.approval_status, 'needs_review');
  assert.ok(entry.missed_clock_in_reported_at);
  assert.ok(entry.punch_exception_id);

  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  assert.equal(state.status, 'clocked_in');
  assert.equal(state.active_entry_id, entry.id);

  assert.equal(h.rows.TimeClockPunchException.length, 1);
  const punchCase = h.rows.TimeClockPunchException[0];
  assert.equal(punchCase.exception_type, 'late_clock_in');
  assert.equal(punchCase.status, 'pending_manager_review');
  assert.equal(punchCase.employee_response, 'missed_clock_in');
  assert.equal(punchCase.claimed_clock_in, entry.clock_in);

  const restoredActive = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(restoredActive.status, 200, JSON.stringify(restoredActive.body));
  assert.equal(restoredActive.body.status, 'clocked_in');
  assert.equal(restoredActive.body.entry.id, entry.id);
  assert.equal(restoredActive.body.entry.clock_source, 'employee_attested_missed_clock_in');
  assert.equal(restoredActive.body.entry.approval_status, 'needs_review');
  assert.equal(h.rows.TimeClockPunchException[0].status, 'pending_manager_review');

  const clockInAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'clock_in' && row.request_id === payload.request_id
  );
  const punchAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'punch_exception' && row.request_id === payload.request_id
  );
  assert.equal(clockInAudits.length, 1);
  assert.equal(clockInAudits[0].server_timestamp, entry.missed_clock_in_reported_at);
  assert.equal(punchAudits.length, 1);

  const retry = await h.invoke(payload);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.recovered_missed_clock_in, true);
  assert.equal(h.rows.TimeEntry.length, 1);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'clock_in' && row.request_id === payload.request_id).length, 1);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'punch_exception' && row.request_id === payload.request_id).length, 1);

  const mismatchedRetry = await h.invoke({ ...payload, claimed_clock_in: '2026-09-28T13:00:00.000Z' });
  assert.equal(mismatchedRetry.status, 409, JSON.stringify(mismatchedRetry.body));
  assert.match(mismatchedRetry.body.error, /request id|different Clock In/i);
  assert.equal(h.rows.TimeEntry.length, 1);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
});

test('late-day missed Clock In recovery rejects early-day use, old dates, future times, and existing active work', async () => {
  const beforeCutoff = setup({ entryCount: 0, serverNow: '2026-09-28T18:59:00.000Z' });
  beforeCutoff.rows.TimeClockPayPeriod = [];
  const noPrompt = await beforeCutoff.invoke({
    action: 'status', target_email: employee.email, clock_action_intent: true,
  });
  assert.equal(noPrompt.status, 200, JSON.stringify(noPrompt.body));
  assert.notEqual(noPrompt.body.requires_late_clock_in_review, true);
  const blockedEarly = await beforeCutoff.invoke({
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'late-clock-in-too-early-001',
    claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(blockedEarly.status, 409, JSON.stringify(blockedEarly.body));
  assert.equal(beforeCutoff.rows.TimeEntry.length, 0);

  for (const claimedClockIn of ['2026-09-27T12:00:00.000Z', '2026-09-29T12:00:00.000Z', 'not-a-date']) {
    const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
    h.rows.TimeClockPayPeriod = [];
    const blocked = await h.invoke({
      action: 'recover_missed_clock_in', target_email: employee.email,
      request_id: 'late-clock-in-invalid-001',
      claimed_clock_in: claimedClockIn,
    });
    assert.ok([400, 409].includes(blocked.status), JSON.stringify(blocked.body));
    assert.equal(h.rows.TimeEntry.length, 0);
    assert.equal(h.rows.TimeClockPunchException.length, 0);
  }

  const active = setup({ entryCount: 1, serverNow: '2026-09-28T20:00:00.000Z' });
  active.rows.TimeClockPayPeriod = [];
  const activeEntry = active.rows.TimeEntry[0];
  Object.assign(activeEntry, {
    user_email: employee.email,
    status: 'clocked_in',
    clock_in: '2026-09-28T12:00:00.000Z',
    clock_source: 'server',
  });
  const activeState = active.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(activeState, { status: 'clocked_in', active_entry_id: activeEntry.id });
  const blockedActive = await active.invoke({
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'late-clock-in-active-001',
    claimed_clock_in: '2026-09-28T11:00:00.000Z',
  });
  assert.equal(blockedActive.status, 409, JSON.stringify(blockedActive.body));
  assert.match(blockedActive.body.error, /active shift|state changed/i);
  assert.equal(active.rows.TimeEntry.length, 1);
});

test('reconstructed missed Clock In remains Needs Review through Clock Out until manager approval resolves its exception', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [];

  const recovered = await h.invoke({
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'late-clock-in-through-approval-001',
    claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entryId = recovered.body.entry.id;
  const punchCaseId = recovered.body.punch_exception.id;

  const clockOut = await h.invoke({
    action: 'clock_out', target_email: employee.email,
    request_id: 'late-clock-in-clock-out-001',
    lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Synthetic missed Clock In reconciliation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));
  const completed = h.rows.TimeEntry.find((row) => row.id === entryId);
  assert.equal(completed.status, 'clocked_out');
  assert.equal(completed.clock_source, 'employee_attested_missed_clock_in');
  assert.equal(completed.approval_status, 'needs_review');
  assert.ok(completed.clock_out);
  const stillPending = h.rows.TimeClockPunchException.find((row) => row.id === punchCaseId);
  assert.equal(stillPending.status, 'pending_manager_review');

  const pendingStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(pendingStatus.status, 200, JSON.stringify(pendingStatus.body));
  assert.equal(pendingStatus.body.unresolved_punch_review, undefined);
  assert.equal(pendingStatus.body.pending_shift_review.count, 1);
  assert.equal(pendingStatus.body.pending_shift_review.missed_clock_in_count, 1);
  assert.equal(pendingStatus.body.pending_shift_review.corrected_shift_count, 0);
  assert.equal(pendingStatus.body.pending_shift_review.has_integrity_issue, false);
  assert.equal(pendingStatus.body.pending_shift_review.items[0].review_kind, 'missed_clock_in');
  assert.equal(pendingStatus.body.pending_shift_review.items[0].review_state, 'awaiting_shift_approval');
  assert.equal(pendingStatus.body.pending_shift_review.items[0].punch_exception_id, punchCaseId);

  const approved = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'late-clock-in-manager-approval-001',
    entry_id: completed.id,
    expected_updated_date: completed.updated_date,
    decision: 'approve',
    note: 'Verified employee-reported arrival',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const approvedEntry = h.rows.TimeEntry.find((row) => row.id === entryId);
  const resolvedCase = h.rows.TimeClockPunchException.find((row) => row.id === punchCaseId);
  assert.equal(approvedEntry.approval_status, 'approved');
  assert.equal(resolvedCase.status, 'resolved');
  assert.equal(resolvedCase.resolution_audit_id, approved.body.audit_id);
  const settledStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(settledStatus.status, 200, JSON.stringify(settledStatus.body));
  assert.equal(settledStatus.body.pending_shift_review, undefined);
  assert.equal(settledStatus.body.unresolved_punch_review, undefined);

  const reopened = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'late-clock-in-manager-reopen-001',
    entry_id: approvedEntry.id,
    expected_updated_date: approvedEntry.updated_date,
    decision: 'reopen',
    note: 'Recheck reconstructed arrival before payroll',
  });
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  const reopenedEntry = h.rows.TimeEntry.find((row) => row.id === entryId);
  const reopenedCase = h.rows.TimeClockPunchException.find((row) => row.id === punchCaseId);
  assert.equal(reopenedEntry.approval_status, 'needs_review');
  assert.equal(reopenedCase.status, 'pending_manager_review');
  const reopenedStatus = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(reopenedStatus.body.pending_shift_review.count, 1);
  assert.equal(reopenedStatus.body.pending_shift_review.missed_clock_in_count, 1);
  assert.equal(reopenedStatus.body.pending_shift_review.items[0].review_state, 'awaiting_shift_approval');
});

test('reconstructed missed Clock In status fails closed when its Punch Exception linkage is inconsistent', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [];
  const recovered = await h.invoke({
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'late-clock-in-linkage-source-001',
    claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const clockOut = await h.invoke({
    action: 'clock_out', target_email: employee.email,
    request_id: 'late-clock-in-linkage-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: '',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));
  h.rows.TimeClockPunchException[0].claimed_clock_in = '2026-09-28T13:00:00.000Z';
  const status = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(status.body.pending_shift_review.count, 1);
  assert.equal(status.body.pending_shift_review.has_integrity_issue, true);
  assert.equal(status.body.pending_shift_review.items[0].review_kind, 'missed_clock_in');
  assert.equal(status.body.pending_shift_review.items[0].review_state, 'needs_manager_investigation');
});

test('late-day missed Clock In recovery cannot reconstruct time inside a finalized pay period', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [{
    id: 'closed-today', label: 'Closed Today', start_date: '2026-09-28', end_date: '2026-09-28',
    status: 'finalized', updated_date: '2026-09-28T18:00:00.000Z',
  }];
  const blocked = await h.invoke({
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'late-clock-in-finalized-period-001',
    claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.finalized_pay_period_id, 'closed-today');
  assert.equal(h.rows.TimeEntry.length, 0);
  assert.equal(h.rows.TimeClockPunchException.length, 0);
  assert.equal(h.rows.TimeClockAudit.length, 0);
});

test('needs_resolution remains a pay-period finalization blocker', async () => {
  const h = setupStaleMissedPunch();
  await h.invoke({
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: 'period-block-source-001', response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  h.rows.TimeClockPayPeriod = [{
    id: 'unresolved-period', label: 'Unresolved Punch Period',
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review',
    updated_date: '2026-09-29T00:00:00.000Z',
  }];
  const blocked = await h.invoke({
    action: 'pay_period_status', target_email: employee.email,
    request_id: 'period-block-review-001', pay_period_id: 'unresolved-period',
    decision: 'finalize', note: '',
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /active shift|readiness/i);
  assert.equal(h.rows.TimeEntry[0].status, 'needs_resolution');
});

test('v4 payroll snapshot preserves approving manager and approval server time', async () => {
  const h = setup();
  const entry = h.rows.TimeEntry[0];
  entry.approval_request_id = 'synthetic-provenance-approval';
  h.rows.TimeClockAudit.push({
    id: 'synthetic-provenance-audit', action: 'time_approval', outcome: 'confirmed',
    request_id: entry.approval_request_id, time_entry_id: entry.id,
    user_email: entry.user_email, actor_email: administrator.email,
    server_timestamp: '2026-09-20T23:00:00.000Z',
  });
  const result = await h.action('finalize', 'provenance-finalize-001');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(h.period().finalized_summary.snapshot_version, 4);
  const evidence = h.period().finalized_summary.shift_manifest[0].approval_evidence;
  assert.equal(evidence.approved_by, administrator.email);
  assert.equal(evidence.approved_at, '2026-09-20T23:00:00.000Z');
});

test('pay-period finalization requires audit evidence for request-marked approvals', async () => {
  const h = setup();
  const entry = h.rows.TimeEntry[0];
  entry.approval_status = 'approved';
  entry.approval_request_id = 'synthetic-no-audit';
  const result = await h.invoke({ action: 'pay_period_status', target_email: employee.email, request_id: 'evidence-check-001', pay_period_id: 'synthetic-period', decision: 'finalize', note: '' });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 0);
  const blockedAudit = h.audit('evidence-check-001')[0];
  assert.equal(blockedAudit.details.approval_evidence_missing_count, 1);
});

test('simultaneous shift approvals serialize to one winner and exact retry reuses one audit', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod = [];
  const entry = h.rows.TimeEntry[0];
  entry.approval_status = 'needs_review';
  delete entry.approved_at;
  delete entry.approved_by;
  delete entry.approval_request_id;
  const loadedVersion = entry.updated_date;
  let releaseFirst;
  let firstReachedWrite;
  let paused = false;
  const reachedWrite = new Promise((resolve) => { firstReachedWrite = resolve; });
  h.setBeforeUpdate(async (name, _query, update) => {
    if (!paused && name === 'TimeEntry' && update.$set?.approval_status === 'approved') {
      paused = true;
      firstReachedWrite();
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
  });
  const firstRequest = {
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'parallel-shift-approval-one-001', entry_id: entry.id,
    expected_updated_date: loadedVersion, decision: 'approve', note: 'First manager review',
  };
  const secondRequest = {
    ...firstRequest,
    request_id: 'parallel-shift-approval-two-001', note: 'Competing manager review',
  };
  const firstPromise = h.invoke(firstRequest);
  await reachedWrite;
  const second = await h.invoke(secondRequest);
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.match(second.body.error, /Another correction submission or approval|review state changed|already approved/i);
  releaseFirst();
  const first = await firstPromise;
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');
  assert.equal(h.rows.TimeEntry[0].approval_request_id, firstRequest.request_id);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'time_approval').length, 1);
  const retry = await h.invoke(firstRequest);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.reused, true);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'time_approval').length, 1);
});

test('fresh duplicate approve and reopen requests are rejected after review state changes', async () => {
  const approveHarness = setup();
  approveHarness.rows.TimeClockPayPeriod = [];
  const approveEntry = approveHarness.rows.TimeEntry[0];
  approveEntry.approval_status = 'needs_review';
  const firstApprove = await approveHarness.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'state-transition-approve-one-001', entry_id: approveEntry.id,
    expected_updated_date: approveEntry.updated_date, decision: 'approve', note: 'Reviewed once',
  });
  assert.equal(firstApprove.status, 200, JSON.stringify(firstApprove.body));
  const approvedEntry = approveHarness.rows.TimeEntry[0];
  const duplicateApprove = await approveHarness.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'state-transition-approve-two-001', entry_id: approvedEntry.id,
    expected_updated_date: approvedEntry.updated_date, decision: 'approve', note: 'Must not overwrite approval',
  });
  assert.equal(duplicateApprove.status, 409, JSON.stringify(duplicateApprove.body));
  assert.match(duplicateApprove.body.error, /already approved|review state changed/i);
  assert.equal(approveHarness.rows.TimeClockAudit.filter((row) => row.action === 'time_approval').length, 1);

  const reopenHarness = setup();
  reopenHarness.rows.TimeClockPayPeriod = [];
  const reopenEntry = reopenHarness.rows.TimeEntry[0];
  const firstReopen = await reopenHarness.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'state-transition-reopen-one-001', entry_id: reopenEntry.id,
    expected_updated_date: reopenEntry.updated_date, decision: 'reopen', note: 'Needs another review',
  });
  assert.equal(firstReopen.status, 200, JSON.stringify(firstReopen.body));
  const reopenedEntry = reopenHarness.rows.TimeEntry[0];
  const duplicateReopen = await reopenHarness.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'state-transition-reopen-two-001', entry_id: reopenedEntry.id,
    expected_updated_date: reopenedEntry.updated_date, decision: 'reopen', note: 'Must not rewrite reopen',
  });
  assert.equal(duplicateReopen.status, 409, JSON.stringify(duplicateReopen.body));
  assert.match(duplicateReopen.body.error, /no longer approved|Reload/i);
  assert.equal(reopenHarness.rows.TimeClockAudit.filter((row) => row.action === 'time_approval').length, 1);
});

test('direct admin correction remains Needs Review and final approval is bound to its confirmed correction audit', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod = [];
  const original = h.rows.TimeEntry[0];
  const corrected = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'direct-admin-correction-001', entry_id: original.id,
    expected_updated_date: original.updated_date,
    reason: 'Correct verified punch time',
    correction: {
      clock_in: '2026-09-20T14:05:00.000Z',
      clock_out: '2026-09-20T22:05:00.000Z',
      lunch_minutes: 0,
      notes: 'Verified by manager',
      job_allocations: [],
    },
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  const saved = h.rows.TimeEntry[0];
  assert.equal(saved.status, 'clocked_out');
  assert.equal(saved.clock_source, 'admin_correction');
  assert.equal(saved.approval_status, 'needs_review');
  assert.equal(saved.last_correction_request_id, 'direct-admin-correction-001');
  const correctionAudit = h.rows.TimeClockAudit.find((row) => row.action === 'admin_correction' && row.request_id === 'direct-admin-correction-001');
  assert.ok(correctionAudit?.id);
  assert.ok(['confirmed', 'recovered'].includes(correctionAudit.outcome));

  const status = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(status.body.pending_shift_review.count, 1);
  assert.equal(status.body.pending_shift_review.direct_admin_correction_count, 1);
  assert.equal(status.body.pending_shift_review.corrected_shift_count, 0);
  assert.equal(status.body.pending_shift_review.has_integrity_issue, false);
  assert.equal(status.body.pending_shift_review.items[0].review_kind, 'direct_admin_correction');
  assert.equal(status.body.pending_shift_review.items[0].admin_correction_audit_id, correctionAudit.id);

  const approved = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'direct-admin-final-approval-001', entry_id: saved.id,
    expected_updated_date: saved.updated_date,
    decision: 'approve', note: 'Reviewed corrected shift',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');
  const settled = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(settled.body.pending_shift_review, undefined);
});

test('direct admin correction with mismatched audit evidence fails closed before final shift approval', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod = [];
  const original = h.rows.TimeEntry[0];
  const corrected = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'direct-admin-bad-audit-001', entry_id: original.id,
    expected_updated_date: original.updated_date,
    reason: 'Correct verified punch time',
    correction: {
      clock_in: '2026-09-20T14:10:00.000Z',
      clock_out: '2026-09-20T22:10:00.000Z',
      lunch_minutes: 0,
      notes: 'Verified by manager',
      job_allocations: [],
    },
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  const saved = h.rows.TimeEntry[0];
  const correctionAudit = h.rows.TimeClockAudit.find((row) => row.action === 'admin_correction' && row.request_id === 'direct-admin-bad-audit-001');
  correctionAudit.details.corrected.clock_out = '2026-09-20T21:00:00.000Z';

  const status = await h.invoke({ action: 'status', target_email: employee.email });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(status.body.pending_shift_review.count, 1);
  assert.equal(status.body.pending_shift_review.direct_admin_correction_count, 1);
  assert.equal(status.body.pending_shift_review.has_integrity_issue, true);
  assert.equal(status.body.pending_shift_review.items[0].review_state, 'needs_manager_investigation');

  const blocked = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'direct-admin-bad-audit-approval-001', entry_id: saved.id,
    expected_updated_date: saved.updated_date,
    decision: 'approve', note: 'Must not approve mismatched evidence',
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /correction evidence|applied correction audit|Admin investigation/i);
  assert.equal(h.rows.TimeEntry[0].approval_status, 'needs_review');
});

test('final corrected-shift approval is bound to terminal correction evidence', async () => {
  const approvalSlice = source.slice(source.indexOf('const verifyResolvedCorrectionForApproval'), source.indexOf('if (action === \'admin_archive_entry\')'));
  assert.match(approvalSlice, /approved_modified/);
  assert.match(approvalSlice, /applied_audit_id/);
  assert.match(source, /const correctionAuditMatchesRecord/);
  assert.match(source, /details\?\.corrected/);
  assert.match(approvalSlice, /correction_request_id/);
  assert.match(approvalSlice, /directAudits/);
  assert.match(approvalSlice, /verifyResolvedCorrectionForApproval\(entry\)/);
  assert.match(approvalSlice, /verifyResolvedCorrectionForApproval\(savedEntry\)/);
});

// Export the same real backend VM for isolated browser acceptance. Test registration
// has no side effects against live Base44; execute the CLI suite only when direct.
export { setup as setupSyntheticTimeClock };
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name, error); process.exitCode = 1; }
  }
  if (!process.exitCode) console.log('PASS ' + tests.length + '/' + tests.length + ' Time Clock synthetic recovery scenarios');
}
