// Synthetic-only regression harness. Never connects to live Base44 records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, normalizedPayrollMembershipFromAudit, payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence } from '../base44/shared/timeClockPayrollMembershipEvidence.mjs';

const secret = 'synthetic-session-signing-key';
const staleMonitorWorkflow = readFileSync(new URL('../base44/workflows/Time Clock Stale Shift Monitor.jsonc', import.meta.url), 'utf8');
const staleMonitorCapabilitySecret = 'WORKFLOW_CAPABILITY_TIME_CLOCK_STALE_SHIFT_MONITOR';
assert.equal(
  staleMonitorWorkflow.match(/"_workflow_capability"\s*:\s*"([^"]+)"/)?.[1],
  '${secret:' + staleMonitorCapabilitySecret + '}',
  'Stale-shift monitor workflow must reference its deploy-time secret, never a raw capability',
);
const staleMonitorCapability = 'synthetic-stale-shift-monitor-capability-0123456789abcdef';
const capabilitySource = readFileSync(new URL('../base44/shared/workflowInvocationCapability.ts', import.meta.url), 'utf8')
  .replace(/^export /gm, '');
const syntheticEnv = {
  SESSION_SIGNING_SECRET: secret,
  [staleMonitorCapabilitySecret]: staleMonitorCapability,
};
const source = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');
const compiled = transformSync(
  source
    .replace("import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';",
      'const createClientFromRequest = globalThis.__syntheticClient;')
    .replace("import { withEmployeeAccessReads } from '../../shared/employeeAccessReads.ts';",
      'const withEmployeeAccessReads = (client) => client;')
    .replace("import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';",
      'const withEntityRateLimitRetry = (client) => client;')
    .replace("import { buildStatusLite } from '../../shared/timeClockStatusLite.ts';",
      'const buildStatusLite = () => ({ requires_full_status: true });')
    .replace("import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';",
      'const processWorkflowTriggerEvent = async (args) => { const { base44: _ignored, ...rest } = args || {}; globalThis.__emittedWorkflowEvents.push(JSON.parse(JSON.stringify(rest))); };')
    .replace("import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';",
      () => `const { hasWorkflowInvocationCapability } = (() => {\n${capabilitySource}\nreturn { hasWorkflowInvocationCapability };\n})();`)
    .replace("import { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, normalizedPayrollMembershipFromAudit, payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence } from '../../shared/timeClockPayrollMembershipEvidence.mjs';",
      'const { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, normalizedPayrollMembershipFromAudit, payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence } = globalThis.__payrollMembershipEvidence;'),
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
        if (operator === '$gte') return actual >= operand;
        if (operator === '$lte') return actual <= operand;
        throw new Error('Unsupported synthetic operator: ' + operator);
      });
    }
    return actual === value || (actual == null && value == null);
  });
}
function setup({ entryCount = 1, serverNow = null, auditIdForRequest = null } = {}) {
  revision = 0;
  // Inject only the backend wall-clock constructor for company-day boundary
  // acceptance; retain real Date.now() for session validation and lock ages.
  // Tests spanning generations can advance the synthetic server timestamp.
  let syntheticServerNow = serverNow;
  const ServerDate = serverNow ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [syntheticServerNow])); }
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
    TimeClockAdminCorrectionGate: [{
      id: 'synthetic-manager-correction-gate', scope: 'company', status: 'idle',
      request_id: '', time_entry_id: '', payload_hash: '', claim_token: '',
      started_at: null, updated_date: '2026-09-20T00:00:00.000Z',
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
  const emittedEvents = [];
  const modelFor = (entityName) => ({
    async filter(query) { return clone((rows[entityName] || []).filter((row) => matches(row, query))); },
    async get(id) { return clone((rows[entityName] || []).find((row) => row.id === id) || null); },
    async create(data) {
      const item = { ...clone(data), id: 'synthetic-' + entityName + '-' + (++revision),
        updated_date: new Date(Date.now() + revision).toISOString() };
      // Opaque Base44 IDs are not chronological. Fixture-only overrides test
      // same-time ordering without fabricating any actual audit payloads.
      if (entityName === 'TimeClockAudit' && typeof auditIdForRequest === 'function') {
        const opaqueId = auditIdForRequest(String(data.request_id || ''));
        if (opaqueId) {
          assert.equal((rows.TimeClockAudit || []).some((audit) => audit.id === opaqueId), false);
          item.id = opaqueId;
        }
      }
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
    __emittedWorkflowEvents: emittedEvents,
    __payrollMembershipEvidence: { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, normalizedPayrollMembershipFromAudit, payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence },
    Deno: { serve: (fn) => { handler = fn; }, env: { get: (key) => syntheticEnv[key] || '' } },
    crypto: webcrypto, TextEncoder, TextDecoder, Response, Request, btoa, atob,
    Date: ServerDate, console: { error: () => {} },
  });
  vm.runInContext(compiled, context, { filename: 'synthetic-time-clock-handler.js' });
  assert.equal(typeof handler, 'function');
  const sessionTokenFor = (user) => {
    const payload = Buffer.from(JSON.stringify({
      email: user.email, iat: Date.now() - 1000, exp: Date.now() + 60_000,
    })).toString('base64url');
    return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
  };
  const session_token = sessionTokenFor(administrator);
  async function invokeAs(user, body) {
    const response = await handler({ json: async () => ({ ...body, session_token: sessionTokenFor(user) }) });
    return { status: response.status, body: await response.json() };
  }
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
    rows, action, clockIn, invoke, invokeAs, emittedEvents,
    setServerNow(value) {
      if (!serverNow || !Number.isFinite(Date.parse(String(value || '')))) {
        throw new Error('A valid synthetic server time is required');
      }
      syntheticServerNow = String(value);
    },
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

test('finalization gate wins and a concurrent direct admin correction cannot mutate the shift', async () => {
  const h = setup();
  const entry = h.rows.TimeEntry[0];
  const loadedVersion = entry.updated_date;
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

  const finalizing = h.action('finalize', 'finalize-blocks-admin-correction-001');
  await gateHeld;
  const blockedCorrection = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'blocked-by-finalization-correction-001', entry_id: entry.id,
    expected_updated_date: loadedVersion, reason: 'Concurrent correction must wait',
    correction: {
      clock_in: '2026-09-20T14:05:00.000Z', clock_out: '2026-09-20T22:05:00.000Z',
      lunch_minutes: 0, notes: 'Must not land during finalization', job_allocations: [],
    },
  });
  assert.equal(blockedCorrection.status, 409, JSON.stringify(blockedCorrection.body));
  assert.match(blockedCorrection.body.error, /Another correction submission or shift approval|being processed/i);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);
  releaseGate();
  const finalized = await finalizing;
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  assert.equal(h.period().status, 'finalized');
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');
  assert.equal(h.rows.TimeEntry[0].pay_period_id, h.period().id);
});

test('direct admin correction gate wins and finalization retries into an unapproved-shift block', async () => {
  const h = setup();
  const entry = h.rows.TimeEntry[0];
  const loadedVersion = entry.updated_date;
  let releaseGate;
  let reachedGate;
  const gateHeld = new Promise((resolve) => { reachedGate = resolve; });
  const continueCorrection = new Promise((resolve) => { releaseGate = resolve; });
  let paused = false;
  h.setAfterRowUpdate(async (entity, _query, update, row) => {
    if (!paused && entity === 'TimeClockEmployeeState' && row.user_email === employee.email &&
        update.$set?.correction_create_time_entry_id === entry.id &&
        update.$set?.correction_create_request_id === 'correction-wins-finalize-race-001') {
      paused = true;
      reachedGate();
      await continueCorrection;
    }
  });

  const correcting = h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'correction-wins-finalize-race-001', entry_id: entry.id,
    expected_updated_date: loadedVersion, reason: 'Correction discovered before payroll commit',
    correction: {
      clock_in: '2026-09-20T14:10:00.000Z', clock_out: '2026-09-20T22:10:00.000Z',
      lunch_minutes: 0, notes: 'Needs fresh manager review', job_allocations: [],
    },
  });
  await gateHeld;
  const firstFinalize = await h.action('finalize', 'correction-wins-finalize-001');
  assert.equal(firstFinalize.status, 409, JSON.stringify(firstFinalize.body));
  assert.match(firstFinalize.body.error, /correction|approval is in progress|action finishes/i);
  releaseGate();
  const corrected = await correcting;
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'needs_review');
  assert.equal(h.rows.TimeEntry[0].pay_period_id, undefined);

  h.setAfterRowUpdate(null);
  const retry = await h.action('finalize', 'correction-wins-finalize-001');
  assert.equal(retry.status, 409, JSON.stringify(retry.body));
  assert.match(retry.body.error, /unapproved shift/i);
  assert.equal(h.period().status, 'review');
  assert.equal(h.entryLocks().length, 0);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 1);
  assert.equal(h.audit('correction-wins-finalize-001')[0].outcome, 'blocked');
});

test('finalized pay-period lock blocks direct admin correction before audit or mutation gate creation', async () => {
  const h = setup();
  const finalized = await h.action('finalize', 'lock-before-correction-finalize-001');
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  const locked = h.rows.TimeEntry[0];
  assert.equal(locked.pay_period_id, h.period().id);
  const correction = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'locked-period-admin-correction-001', entry_id: locked.id,
    expected_updated_date: locked.updated_date, reason: 'Should require payroll reopen',
    correction: {
      clock_in: locked.clock_in, clock_out: locked.clock_out,
      lunch_minutes: 0, notes: 'Must remain locked', job_allocations: [],
    },
  });
  assert.equal(correction.status, 409, JSON.stringify(correction.body));
  assert.match(correction.body.error, /locked by a finalized pay period|Reopen/i);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');
});

test('pay-period reopen holds mutation gates until payroll snapshot invalidation exists', async () => {
  const h = setup();
  const finalized = await h.action('finalize', 'reopen-window-finalize-001');
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  let releaseUnlock;
  let reachedUnlockedRow;
  const unlockedRowVisible = new Promise((resolve) => { reachedUnlockedRow = resolve; });
  const continueReopen = new Promise((resolve) => { releaseUnlock = resolve; });
  let paused = false;
  h.setAfterRowUpdate(async (entity, _query, update, row) => {
    if (!paused && entity === 'TimeEntry' && update.$unset?.pay_period_id !== undefined && row.id === 'synthetic-entry-0') {
      paused = true;
      reachedUnlockedRow();
      await continueReopen;
    }
  });

  const reopening = h.action('reopen', 'reopen-window-001', 'Correct payroll shift');
  await unlockedRowVisible;
  const temporarilyUnlocked = h.rows.TimeEntry[0];
  assert.equal(temporarilyUnlocked.pay_period_id, undefined);
  const blockedCorrection = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'reopen-window-blocked-correction-001', entry_id: temporarilyUnlocked.id,
    expected_updated_date: temporarilyUnlocked.updated_date, reason: 'Must wait for reopen invalidation',
    correction: {
      clock_in: '2026-09-20T14:05:00.000Z', clock_out: '2026-09-20T22:05:00.000Z',
      lunch_minutes: 0, notes: 'Blocked during reopen causal window', job_allocations: [],
    },
  });
  assert.equal(blockedCorrection.status, 409, JSON.stringify(blockedCorrection.body));
  assert.match(blockedCorrection.body.error, /Another correction submission or shift approval|being processed/i);
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);

  releaseUnlock();
  const reopened = await reopening;
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  assert.equal(h.period().status, 'review');
  const invalidatedAt = h.period().finalized_summary?.invalidated_at;
  assert.ok(invalidatedAt);
  assert.equal(h.period().finalized_summary?.invalidated_by_reopen_request_id, 'reopen-window-001');
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');

  h.setAfterRowUpdate(null);
  const freshEntry = h.rows.TimeEntry[0];
  const correctionAfterReopen = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'reopen-window-after-correction-001', entry_id: freshEntry.id,
    expected_updated_date: freshEntry.updated_date, reason: 'Correction after audited reopen boundary',
    correction: {
      clock_in: '2026-09-20T14:15:00.000Z', clock_out: '2026-09-20T22:15:00.000Z',
      lunch_minutes: 0, notes: 'Inside next payroll generation causal window', job_allocations: [],
    },
  });
  assert.equal(correctionAfterReopen.status, 200, JSON.stringify(correctionAfterReopen.body));
  const correctionAudit = h.rows.TimeClockAudit.find((row) => row.action === 'admin_correction' && row.request_id === 'reopen-window-after-correction-001');
  assert.ok(correctionAudit?.server_timestamp);
  assert.ok(Date.parse(correctionAudit.server_timestamp) >= Date.parse(invalidatedAt));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'needs_review');
});

test('cross-pay-period direct correction requires both finalized periods reopened and preserves removed/added generation provenance', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod.push({
    id: 'synthetic-destination-period', label: 'Synthetic Destination Period',
    start_date: '2026-09-27', end_date: '2026-10-03', status: 'review', last_request_id: '',
    updated_date: '2026-09-20T00:00:00.000Z',
  });
  const periodAction = (pay_period_id, decision, request_id, note = '') => h.invoke({
    action: 'pay_period_status', pay_period_id, decision, request_id, note,
  });
  h.rows.TimeEntry[0].approval_status = 'needs_review';
  const initialEntry = h.rows.TimeEntry[0];
  const initialApproval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'cross-period-initial-approval-001', entry_id: initialEntry.id,
    expected_updated_date: initialEntry.updated_date, decision: 'approve', note: 'Initial independent manager review',
  });
  assert.equal(initialApproval.status, 200, JSON.stringify(initialApproval.body));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');

  const sourceFinalized = await periodAction('synthetic-period', 'finalize', 'cross-period-source-finalize-001');
  assert.equal(sourceFinalized.status, 200, JSON.stringify(sourceFinalized.body));
  const destinationFinalized = await periodAction('synthetic-destination-period', 'finalize', 'cross-period-destination-finalize-001');
  assert.equal(destinationFinalized.status, 200, JSON.stringify(destinationFinalized.body));

  const sourceReopened = await periodAction('synthetic-period', 'reopen', 'cross-period-source-reopen-001', 'Move corrected shift to adjacent period');
  assert.equal(sourceReopened.status, 200, JSON.stringify(sourceReopened.body));
  const unlockedSourceEntry = h.rows.TimeEntry[0];
  const blockedByDestination = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'cross-period-blocked-destination-001', entry_id: unlockedSourceEntry.id,
    expected_updated_date: unlockedSourceEntry.updated_date, reason: 'Move shift to corrected company date',
    correction: {
      clock_in: '2026-09-27T14:00:00.000Z', clock_out: '2026-09-27T22:00:00.000Z',
      lunch_minutes: 0, notes: 'Corrected into adjacent payroll period', job_allocations: [],
    },
  });
  assert.equal(blockedByDestination.status, 409, JSON.stringify(blockedByDestination.body));
  assert.match(blockedByDestination.body.error, /corrected Clock In belongs to finalized pay period|Reopen that destination period/i);
  assert.equal(blockedByDestination.body.finalized_pay_period_id, 'synthetic-destination-period');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');

  const destinationReopened = await periodAction('synthetic-destination-period', 'reopen', 'cross-period-destination-reopen-001', 'Accept corrected shift from adjacent period');
  assert.equal(destinationReopened.status, 200, JSON.stringify(destinationReopened.body));
  const entryBeforeCorrection = h.rows.TimeEntry[0];
  const corrected = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'cross-period-correction-001', entry_id: entryBeforeCorrection.id,
    expected_updated_date: entryBeforeCorrection.updated_date, reason: 'Move shift to corrected company date',
    correction: {
      clock_in: '2026-09-27T14:00:00.000Z', clock_out: '2026-09-27T22:00:00.000Z',
      lunch_minutes: 0, notes: 'Corrected into adjacent payroll period', job_allocations: [],
    },
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  const movedEntry = h.rows.TimeEntry[0];
  assert.equal(movedEntry.clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(movedEntry.approval_status, 'needs_review');
  assert.equal(movedEntry.pay_period_id, undefined);
  const correctionAudit = h.rows.TimeClockAudit.find((row) => row.action === 'admin_correction' && row.request_id === 'cross-period-correction-001');
  assert.equal(correctionAudit.details.original.clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(correctionAudit.details.corrected.clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(correctionAudit.details.payroll_membership.company_date, '2026-09-27');

  const approved = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'cross-period-approval-001', entry_id: movedEntry.id,
    expected_updated_date: movedEntry.updated_date, decision: 'approve', note: 'Reviewed after period move',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');

  const sourceRefinalized = await periodAction('synthetic-period', 'finalize', 'cross-period-source-refinalize-001');
  assert.equal(sourceRefinalized.status, 200, JSON.stringify(sourceRefinalized.body));
  const sourcePeriod = h.rows.TimeClockPayPeriod.find((row) => row.id === 'synthetic-period');
  assert.equal(sourcePeriod.finalized_summary.shift_manifest.length, 0);
  assert.equal(sourcePeriod.finalized_summary.generation_changes.length, 1);
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].time_entry_id, movedEntry.id);
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].change_type, 'removed');
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].action_provenance.action, 'admin_correction');
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].action_provenance.semantic_before_clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].action_provenance.semantic_after_clock_in, '2026-09-27T14:00:00.000Z');

  const destinationRefinalized = await periodAction('synthetic-destination-period', 'finalize', 'cross-period-destination-refinalize-001');
  assert.equal(destinationRefinalized.status, 200, JSON.stringify(destinationRefinalized.body));
  const destinationPeriod = h.rows.TimeClockPayPeriod.find((row) => row.id === 'synthetic-destination-period');
  assert.equal(destinationPeriod.finalized_summary.shift_manifest.length, 1);
  assert.equal(destinationPeriod.finalized_summary.shift_manifest[0].id, movedEntry.id);
  assert.equal(destinationPeriod.finalized_summary.generation_changes.length, 1);
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].change_type, 'added');
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].action_provenance.action, 'admin_correction');
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].action_provenance.semantic_before_clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].action_provenance.semantic_after_clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(h.rows.TimeEntry[0].pay_period_id, 'synthetic-destination-period');

  const sourceVerify = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'synthetic-period', request_id: 'cross-period-source-verify-001' });
  const destinationVerify = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'synthetic-destination-period', request_id: 'cross-period-destination-verify-001' });
  assert.equal(sourceVerify.status, 200, JSON.stringify(sourceVerify.body));
  assert.equal(sourceVerify.body.verified, true, JSON.stringify(sourceVerify.body));
  assert.equal(destinationVerify.status, 200, JSON.stringify(destinationVerify.body));
  assert.equal(destinationVerify.body.verified, true, JSON.stringify(destinationVerify.body));
});

test('cross-pay-period employee correction approval requires destination reopen and preserves payroll provenance', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod.push({
    id: 'employee-destination-period', label: 'Employee Destination Period',
    start_date: '2026-09-27', end_date: '2026-10-03', status: 'review', last_request_id: '',
    updated_date: '2026-09-20T00:00:00.000Z',
  });
  const periodAction = (pay_period_id, decision, request_id, note = '') => h.invoke({
    action: 'pay_period_status', pay_period_id, decision, request_id, note,
  });

  h.rows.TimeEntry[0].approval_status = 'needs_review';
  const initialEntry = h.rows.TimeEntry[0];
  const initialApproval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'employee-cross-initial-approval-001', entry_id: initialEntry.id,
    expected_updated_date: initialEntry.updated_date, decision: 'approve', note: 'Initial independent manager review',
  });
  assert.equal(initialApproval.status, 200, JSON.stringify(initialApproval.body));

  const sourceFinalized = await periodAction('synthetic-period', 'finalize', 'employee-cross-source-finalize-001');
  assert.equal(sourceFinalized.status, 200, JSON.stringify(sourceFinalized.body));
  const destinationFinalized = await periodAction('employee-destination-period', 'finalize', 'employee-cross-destination-finalize-001');
  assert.equal(destinationFinalized.status, 200, JSON.stringify(destinationFinalized.body));
  const sourceReopened = await periodAction('synthetic-period', 'reopen', 'employee-cross-source-reopen-001', 'Employee requested adjacent-period correction');
  assert.equal(sourceReopened.status, 200, JSON.stringify(sourceReopened.body));

  const unlockedEntry = h.rows.TimeEntry[0];
  const submitted = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'employee-cross-submit-001', entry_id: unlockedEntry.id,
    expected_updated_date: unlockedEntry.updated_date, reason: 'Clock In belongs on the next company date',
    requested_changes: {
      clock_in: '2026-09-27T14:00:00.000Z', clock_out: '2026-09-27T22:00:00.000Z',
      lunch_minutes: 0, notes: 'Employee requested adjacent payroll period correction',
    },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  let request = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'employee-cross-submit-001');
  assert.ok(request?.id);
  assert.equal(request.status, 'pending');
  assert.equal(h.rows.TimeEntry[0].approval_status, 'needs_review');
  assert.equal(h.rows.TimeEntry[0].clock_in, '2026-09-20T14:00:00.000Z');

  const blockedReview = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'employee-cross-review-blocked-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date, decision: 'approve',
    reason: 'Employee correction is accurate',
  });
  assert.equal(blockedReview.status, 409, JSON.stringify(blockedReview.body));
  assert.equal(blockedReview.body.finalized_pay_period_id, 'employee-destination-period');
  assert.match(blockedReview.body.error, /approved Clock In belongs to finalized pay period|Reopen that destination period/i);
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  assert.equal(request.status, 'pending');
  assert.equal(h.rows.TimeEntry[0].clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' && row.request_id === 'employee-cross-review-blocked-001').length, 0);
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');

  const destinationReopened = await periodAction('employee-destination-period', 'reopen', 'employee-cross-destination-reopen-001', 'Accept employee correction into this period');
  assert.equal(destinationReopened.status, 200, JSON.stringify(destinationReopened.body));
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  const reviewed = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'employee-cross-review-approved-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date, decision: 'approve',
    reason: 'Employee correction is accurate',
  });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  const movedEntry = h.rows.TimeEntry[0];
  assert.equal(request.status, 'approved');
  assert.equal(movedEntry.clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(movedEntry.approval_status, 'needs_review');
  assert.equal(movedEntry.last_correction_request_id, request.id);
  assert.equal(movedEntry.pay_period_id, undefined);
  const appliedAudit = h.rows.TimeClockAudit.find((row) => row.id === request.applied_audit_id);
  assert.equal(appliedAudit.action, 'admin_correction');
  assert.equal(appliedAudit.details.original.clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(appliedAudit.details.corrected.clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(appliedAudit.details.payroll_membership.company_date, '2026-09-27');
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');

  const finalApproval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'employee-cross-final-approval-001', entry_id: movedEntry.id,
    expected_updated_date: movedEntry.updated_date, decision: 'approve', note: 'Reviewed after employee correction',
  });
  assert.equal(finalApproval.status, 200, JSON.stringify(finalApproval.body));
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');

  const sourceRefinalized = await periodAction('synthetic-period', 'finalize', 'employee-cross-source-refinalize-001');
  assert.equal(sourceRefinalized.status, 200, JSON.stringify(sourceRefinalized.body));
  const sourcePeriod = h.rows.TimeClockPayPeriod.find((row) => row.id === 'synthetic-period');
  assert.equal(sourcePeriod.finalized_summary.shift_manifest.length, 0);
  assert.equal(sourcePeriod.finalized_summary.generation_changes.length, 1);
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].change_type, 'removed');
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].correction_provenance.correction_request_id, request.id);
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].correction_provenance.requested_clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(sourcePeriod.finalized_summary.generation_changes[0].correction_provenance.corrected_clock_in, '2026-09-27T14:00:00.000Z');

  const destinationRefinalized = await periodAction('employee-destination-period', 'finalize', 'employee-cross-destination-refinalize-001');
  assert.equal(destinationRefinalized.status, 200, JSON.stringify(destinationRefinalized.body));
  const destinationPeriod = h.rows.TimeClockPayPeriod.find((row) => row.id === 'employee-destination-period');
  assert.equal(destinationPeriod.finalized_summary.shift_manifest.length, 1);
  assert.equal(destinationPeriod.finalized_summary.shift_manifest[0].id, movedEntry.id);
  assert.equal(destinationPeriod.finalized_summary.generation_changes.length, 1);
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].change_type, 'added');
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].correction_provenance.correction_request_id, request.id);
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].correction_provenance.requested_clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(destinationPeriod.finalized_summary.generation_changes[0].correction_provenance.corrected_clock_in, '2026-09-27T14:00:00.000Z');
  assert.equal(h.rows.TimeEntry[0].pay_period_id, 'employee-destination-period');

  const sourceVerify = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'synthetic-period', request_id: 'employee-cross-source-verify-001' });
  const destinationVerify = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'employee-destination-period', request_id: 'employee-cross-destination-verify-001' });
  assert.equal(sourceVerify.status, 200, JSON.stringify(sourceVerify.body));
  assert.equal(sourceVerify.body.verified, true, JSON.stringify(sourceVerify.body));
  assert.equal(destinationVerify.status, 200, JSON.stringify(destinationVerify.body));
  assert.equal(destinationVerify.body.verified, true, JSON.stringify(destinationVerify.body));
});

test('approve_modified cross-period correction uses manager-edited destination and freezes employee-versus-manager provenance', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod.push({
    id: 'modified-destination-period', label: 'Modified Destination Period',
    start_date: '2026-09-27', end_date: '2026-10-03', status: 'review', last_request_id: '',
    updated_date: '2026-09-20T00:00:00.000Z',
  });
  const periodAction = (pay_period_id, decision, request_id, note = '') => h.invoke({
    action: 'pay_period_status', pay_period_id, decision, request_id, note,
  });

  h.rows.TimeEntry[0].approval_status = 'needs_review';
  const initialEntry = h.rows.TimeEntry[0];
  const initialApproval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'modified-cross-initial-approval-001', entry_id: initialEntry.id,
    expected_updated_date: initialEntry.updated_date, decision: 'approve', note: 'Initial independent manager review',
  });
  assert.equal(initialApproval.status, 200, JSON.stringify(initialApproval.body));
  assert.equal((await periodAction('synthetic-period', 'finalize', 'modified-cross-source-finalize-001')).status, 200);
  assert.equal((await periodAction('modified-destination-period', 'finalize', 'modified-cross-destination-finalize-001')).status, 200);
  const sourceReopened = await periodAction('synthetic-period', 'reopen', 'modified-cross-source-reopen-001', 'Review employee correction with manager edits');
  assert.equal(sourceReopened.status, 200, JSON.stringify(sourceReopened.body));

  const unlockedEntry = h.rows.TimeEntry[0];
  const submitted = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'modified-cross-submit-001', entry_id: unlockedEntry.id,
    expected_updated_date: unlockedEntry.updated_date, reason: 'Employee thinks the start should be one hour later',
    requested_changes: {
      clock_in: '2026-09-20T15:00:00.000Z', clock_out: '2026-09-20T23:00:00.000Z',
      lunch_minutes: 15, notes: 'Employee proposal remains in the source pay period',
    },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  let request = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'modified-cross-submit-001');
  assert.ok(request?.id);
  assert.equal(request.status, 'pending');
  assert.equal(request.requested_changes.clock_in, '2026-09-20T15:00:00.000Z');

  const managerCorrection = {
    clock_in: '2026-09-27T16:30:00.000Z',
    clock_out: '2026-09-28T00:30:00.000Z',
    lunch_minutes: 30,
    notes: 'Manager applied corrected date and lunch after review',
  };
  const blockedModified = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'modified-cross-review-blocked-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date, decision: 'approve_modified',
    reason: 'Manager verified a different company date', correction: managerCorrection,
  });
  assert.equal(blockedModified.status, 409, JSON.stringify(blockedModified.body));
  assert.equal(blockedModified.body.finalized_pay_period_id, 'modified-destination-period');
  assert.match(blockedModified.body.error, /approved Clock In belongs to finalized pay period|Reopen that destination period/i);
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  assert.equal(request.status, 'pending');
  assert.equal(h.rows.TimeEntry[0].clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' && row.request_id === 'modified-cross-review-blocked-001').length, 0);

  const destinationReopened = await periodAction('modified-destination-period', 'reopen', 'modified-cross-destination-reopen-001', 'Accept manager-adjusted employee correction');
  assert.equal(destinationReopened.status, 200, JSON.stringify(destinationReopened.body));
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  const approvedModified = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'modified-cross-review-approved-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date, decision: 'approve_modified',
    reason: 'Manager verified a different company date', correction: managerCorrection,
  });
  assert.equal(approvedModified.status, 200, JSON.stringify(approvedModified.body));
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  const movedEntry = h.rows.TimeEntry[0];
  assert.equal(request.status, 'approved_modified');
  assert.equal(request.review_decision, 'approve_modified');
  assert.equal(movedEntry.clock_in, managerCorrection.clock_in);
  assert.equal(movedEntry.clock_out, managerCorrection.clock_out);
  assert.equal(movedEntry.lunch_minutes, 30);
  assert.equal(movedEntry.notes, managerCorrection.notes);
  assert.equal(movedEntry.approval_status, 'needs_review');
  const appliedAudit = h.rows.TimeClockAudit.find((row) => row.id === request.applied_audit_id);
  const correctionRequestAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === request.request_id && row.time_entry_id === request.time_entry_id,
  );
  const correctionReviewAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_review' && row.request_id === request.review_request_id && row.time_entry_id === request.time_entry_id,
  );
  assert.ok(correctionRequestAudit?.id);
  assert.equal(correctionRequestAudit.outcome, 'confirmed');
  assert.equal(correctionRequestAudit.user_email, employee.email);
  assert.equal(correctionRequestAudit.actor_email, employee.email);
  assert.equal(correctionRequestAudit.authentication_method, 'session');
  assert.equal(correctionRequestAudit.reason, request.employee_reason);
  assert.equal(correctionRequestAudit.details.correction_request_id, request.id);
  assert.equal(correctionRequestAudit.details.requested_changes.clock_in, request.requested_changes.clock_in);
  assert.equal(correctionRequestAudit.details.requested_changes.clock_out, request.requested_changes.clock_out);
  assert.ok(correctionRequestAudit.details.payload_hash);
  assert.ok(correctionReviewAudit?.id);
  assert.equal(correctionReviewAudit.outcome, 'confirmed');
  assert.equal(correctionReviewAudit.details.correction_request_id, request.id);
  assert.equal(correctionReviewAudit.details.decision, 'approved_modified');
  assert.equal(correctionReviewAudit.details.applied_audit_id, request.applied_audit_id);
  assert.equal(correctionReviewAudit.details.review_payload_hash, request.review_payload_hash);
  assert.equal(appliedAudit.details.original.clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(appliedAudit.details.corrected.clock_in, managerCorrection.clock_in);
  assert.equal(appliedAudit.details.corrected.clock_out, managerCorrection.clock_out);
  assert.equal(appliedAudit.details.corrected.lunch_minutes, 30);
  assert.equal(appliedAudit.details.corrected.notes, managerCorrection.notes);
  assert.equal(appliedAudit.details.payroll_membership.company_date, '2026-09-27');

  const finalApproval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'modified-cross-final-approval-001', entry_id: movedEntry.id,
    expected_updated_date: movedEntry.updated_date, decision: 'approve', note: 'Reviewed manager-adjusted correction',
  });
  assert.equal(finalApproval.status, 200, JSON.stringify(finalApproval.body));

  const originalSubmissionPayloadHash = correctionRequestAudit.details.payload_hash;
  correctionRequestAudit.details.payload_hash = 'tampered-before-payroll-finalization';
  const blockedSourceRefinalize = await periodAction('synthetic-period', 'finalize', 'modified-cross-source-refinalize-bad-submission-001');
  assert.equal(blockedSourceRefinalize.status, 409, JSON.stringify(blockedSourceRefinalize.body));
  assert.match(blockedSourceRefinalize.body.error, /submission evidence/i);
  correctionRequestAudit.details.payload_hash = originalSubmissionPayloadHash;
  assert.equal(h.rows.TimeClockPayPeriod.find((row) => row.id === 'synthetic-period').status, 'review');

  const sourceRefinalized = await periodAction('synthetic-period', 'finalize', 'modified-cross-source-refinalize-bad-submission-001');
  assert.equal(sourceRefinalized.status, 200, JSON.stringify(sourceRefinalized.body));
  const destinationRefinalized = await periodAction('modified-destination-period', 'finalize', 'modified-cross-destination-refinalize-001');
  assert.equal(destinationRefinalized.status, 200, JSON.stringify(destinationRefinalized.body));
  const sourcePeriod = h.rows.TimeClockPayPeriod.find((row) => row.id === 'synthetic-period');
  const destinationPeriod = h.rows.TimeClockPayPeriod.find((row) => row.id === 'modified-destination-period');
  assert.equal(sourcePeriod.finalized_summary.snapshot_version, 28);
  assert.equal(destinationPeriod.finalized_summary.snapshot_version, 28);
  const sourceChange = sourcePeriod.finalized_summary.generation_changes[0];
  const destinationChange = destinationPeriod.finalized_summary.generation_changes[0];
  assert.equal(sourceChange.change_type, 'removed');
  assert.equal(destinationChange.change_type, 'added');
  for (const change of [sourceChange, destinationChange]) {
    assert.equal(change.correction_provenance.correction_request_id, request.id);
    assert.equal(change.correction_provenance.request_kind, 'standard');
    assert.equal(change.correction_provenance.submission_audit_id, correctionRequestAudit.id);
    assert.equal(change.correction_provenance.submission_audit_outcome, correctionRequestAudit.outcome);
    assert.equal(change.correction_provenance.submission_audit_at, correctionRequestAudit.server_timestamp);
    assert.equal(change.correction_provenance.submission_actor_role, correctionRequestAudit.actor_role);
    assert.equal(change.correction_provenance.submission_authentication_method, correctionRequestAudit.authentication_method);
    assert.equal(change.correction_provenance.submission_payload_hash, correctionRequestAudit.details.payload_hash);
    assert.equal(change.correction_provenance.review_decision, 'approve_modified');
    assert.equal(change.correction_provenance.requested_clock_in, '2026-09-20T15:00:00.000Z');
    assert.equal(change.correction_provenance.requested_clock_out, '2026-09-20T23:00:00.000Z');
    assert.equal(change.correction_provenance.requested_lunch_minutes, 15);
    assert.equal(change.correction_provenance.requested_notes, 'Employee proposal remains in the source pay period');
    assert.equal(change.correction_provenance.corrected_clock_in, managerCorrection.clock_in);
    assert.equal(change.correction_provenance.corrected_clock_out, managerCorrection.clock_out);
    assert.equal(change.correction_provenance.corrected_lunch_minutes, 30);
    assert.equal(change.correction_provenance.corrected_notes, managerCorrection.notes);
  }
  assert.equal(h.rows.TimeEntry[0].pay_period_id, 'modified-destination-period');

  const sourceVerify = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'synthetic-period', request_id: 'modified-cross-source-verify-001' });
  const destinationVerify = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'modified-destination-period', request_id: 'modified-cross-destination-verify-001' });
  assert.equal(sourceVerify.status, 200, JSON.stringify(sourceVerify.body));
  assert.equal(sourceVerify.body.verified, true, JSON.stringify(sourceVerify.body));
  assert.equal(destinationVerify.status, 200, JSON.stringify(destinationVerify.body));
  assert.equal(destinationVerify.body.verified, true, JSON.stringify(destinationVerify.body));

  let tamperSequence = 0;
  const expectHistoryTamperFailure = async (payPeriodId, label) => {
    tamperSequence += 1;
    const verified = await h.invoke({
      action: 'pay_period_history_verify', pay_period_id: payPeriodId,
      request_id: `modified-cross-tamper-${tamperSequence}`,
    });
    assert.equal(verified.status, 200, `${label}: ${JSON.stringify(verified.body)}`);
    assert.equal(verified.body.verified, false, `${label} was not detected: ${JSON.stringify(verified.body)}`);
  };
  const tamperField = async (target, field, tamperedValue, payPeriodId, label) => {
    const originalValue = clone(target[field]);
    target[field] = clone(tamperedValue);
    try { await expectHistoryTamperFailure(payPeriodId, label); }
    finally { target[field] = originalValue; }
  };
  const expectBothHistoriesTamperFailure = async (label) => {
    await expectHistoryTamperFailure('synthetic-period', `${label} (source removed)`);
    await expectHistoryTamperFailure('modified-destination-period', `${label} (destination added)`);
  };

  for (const [field, value] of [
    ['clock_in', '2026-09-20T15:05:00.000Z'],
    ['clock_out', '2026-09-20T23:05:00.000Z'],
    ['lunch_minutes', 16],
    ['notes', 'tampered employee request'],
  ]) {
    await tamperField(request.requested_changes, field, value, 'synthetic-period', `CorrectionRequest requested_changes.${field}`);
  }
  for (const [field, value] of [
    ['review_decision', 'approve'],
    ['review_request_id', 'tampered-review-request-id'],
    ['reviewer_email', 'other-admin@synthetic.invalid'],
    ['reviewed_at', '2026-09-25T12:34:56.000Z'],
    ['reviewer_reason', 'tampered reviewer reason'],
  ]) {
    await tamperField(request, field, value, 'synthetic-period', `CorrectionRequest ${field}`);
  }
  await tamperField(request, 'status', 'approved', 'synthetic-period', 'CorrectionRequest decision/status binding');
  await tamperField(request, 'applied_audit_id', 'tampered-audit-id', 'synthetic-period', 'CorrectionRequest applied audit ID');
  await tamperField(request.original_snapshot, 'updated_date', '2026-09-20T13:59:59.000Z', 'synthetic-period', 'CorrectionRequest original submission TimeEntry version');

  for (const [field, value] of [
    ['clock_in', '2026-09-27T16:35:00.000Z'],
    ['clock_out', '2026-09-28T00:35:00.000Z'],
    ['lunch_minutes', 31],
    ['notes', 'tampered applied correction'],
  ]) {
    await tamperField(appliedAudit.details.corrected, field, value, 'synthetic-period', `admin_correction corrected.${field}`);
  }
  await tamperField(appliedAudit, 'request_id', 'tampered-applied-request-id', 'synthetic-period', 'admin_correction request ID');
  await tamperField(appliedAudit, 'actor_email', 'other-admin@synthetic.invalid', 'synthetic-period', 'admin_correction reviewer identity binding');
  await tamperField(appliedAudit.details, 'review_payload_hash', 'tampered-review-payload-hash', 'synthetic-period', 'admin_correction review payload binding');

  const tamperSubmissionAuditField = async (target, field, tamperedValue, label) => {
    const originalValue = clone(target[field]);
    target[field] = clone(tamperedValue);
    try { await expectBothHistoriesTamperFailure(label); }
    finally { target[field] = originalValue; }
  };
  for (const [field, value] of [
    ['outcome', 'blocked'],
    ['request_id', 'tampered-submission-request-id'],
    ['user_email', 'other-worker@synthetic.invalid'],
    ['actor_email', 'other-worker@synthetic.invalid'],
    ['actor_role', 'badge'],
    ['authentication_method', 'badge'],
    ['server_timestamp', '2026-09-29T12:34:56.000Z'],
    ['reason', 'tampered employee submission reason'],
  ]) {
    await tamperSubmissionAuditField(correctionRequestAudit, field, value, `correction_request audit ${field}`);
  }
  for (const [field, value] of [
    ['correction_request_id', 'tampered-correction-request-id'],
    ['payload_hash', 'tampered-submission-payload-hash'],
  ]) {
    await tamperSubmissionAuditField(correctionRequestAudit.details, field, value, `correction_request audit details.${field}`);
  }
  for (const [field, value] of [
    ['clock_in', '2026-09-20T15:05:00.000Z'],
    ['clock_out', '2026-09-20T23:05:00.000Z'],
    ['lunch_minutes', 16],
    ['notes', 'tampered submission audit request'],
  ]) {
    await tamperSubmissionAuditField(correctionRequestAudit.details.requested_changes, field, value, `correction_request audit requested_changes.${field}`);
  }
  const submissionAuditIndex = h.rows.TimeClockAudit.findIndex((row) => row.id === correctionRequestAudit.id);
  const [removedSubmissionAudit] = h.rows.TimeClockAudit.splice(submissionAuditIndex, 1);
  try { await expectBothHistoriesTamperFailure('missing correction_request audit'); }
  finally { h.rows.TimeClockAudit.splice(submissionAuditIndex, 0, removedSubmissionAudit); }
  h.rows.TimeClockAudit.push({ ...clone(correctionRequestAudit), id: 'synthetic-duplicate-correction-request-audit' });
  try { await expectBothHistoriesTamperFailure('duplicate correction_request audit'); }
  finally { h.rows.TimeClockAudit.pop(); }

  const tamperCorrectionReviewField = async (target, field, tamperedValue, label) => {
    const originalValue = clone(target[field]);
    target[field] = clone(tamperedValue);
    try { await expectBothHistoriesTamperFailure(label); }
    finally { target[field] = originalValue; }
  };
  for (const [field, value] of [
    ['outcome', 'blocked'],
    ['request_id', 'tampered-review-audit-request-id'],
    ['user_email', 'other-worker@synthetic.invalid'],
    ['actor_email', 'other-admin@synthetic.invalid'],
    ['actor_role', 'employee'],
    ['authentication_method', 'badge'],
    ['server_timestamp', '2026-09-25T12:34:56.000Z'],
    ['reason', 'tampered correction review reason'],
  ]) {
    await tamperCorrectionReviewField(correctionReviewAudit, field, value, `correction_review audit ${field}`);
  }
  for (const [field, value] of [
    ['correction_request_id', 'tampered-correction-request-id'],
    ['decision', 'approved'],
    ['applied_audit_id', 'tampered-applied-audit-id'],
    ['review_payload_hash', 'tampered-review-payload-hash'],
  ]) {
    await tamperCorrectionReviewField(correctionReviewAudit.details, field, value, `correction_review audit details.${field}`);
  }
  const reviewAuditIndex = h.rows.TimeClockAudit.findIndex((row) => row.id === correctionReviewAudit.id);
  const [removedReviewAudit] = h.rows.TimeClockAudit.splice(reviewAuditIndex, 1);
  try { await expectBothHistoriesTamperFailure('missing correction_review audit'); }
  finally { h.rows.TimeClockAudit.splice(reviewAuditIndex, 0, removedReviewAudit); }
  h.rows.TimeClockAudit.push({ ...clone(correctionReviewAudit), id: 'synthetic-duplicate-correction-review-audit' });
  try { await expectBothHistoriesTamperFailure('duplicate correction_review audit'); }
  finally { h.rows.TimeClockAudit.pop(); }

  const provenanceTamperCases = [
    ['request_kind', 'missed_clock_out'],
    ['submission_audit_id', 'tampered-frozen-submission-audit-id'],
    ['submission_audit_outcome', 'recovered'],
    ['submission_audit_at', '2026-09-29T12:34:56.000Z'],
    ['submission_actor_role', 'badge'],
    ['submission_authentication_method', 'badge'],
    ['submission_payload_hash', 'tampered-frozen-submission-payload-hash'],
    ['requested_clock_in', '2026-09-20T15:05:00.000Z'],
    ['requested_clock_out', '2026-09-20T23:05:00.000Z'],
    ['requested_lunch_minutes', 16],
    ['requested_notes', 'tampered frozen request'],
    ['corrected_clock_in', '2026-09-27T16:35:00.000Z'],
    ['corrected_clock_out', '2026-09-28T00:35:00.000Z'],
    ['corrected_lunch_minutes', 31],
    ['corrected_notes', 'tampered frozen applied result'],
    ['applied_audit_id', 'tampered-frozen-audit-id'],
    ['applied_audit_request_id', 'tampered-frozen-audit-request-id'],
  ];
  for (const [payPeriodId, change, side] of [
    ['synthetic-period', sourceChange, 'source removed'],
    ['modified-destination-period', destinationChange, 'destination added'],
  ]) {
    for (const [field, value] of provenanceTamperCases) {
      await tamperField(change.correction_provenance, field, value, payPeriodId, `${side} correction_provenance.${field}`);
    }
    for (const [requiredField, versionLabel] of [['reviewed_by', 'v24'], ['submission_audit_id', 'v25']]) {
      const originalValue = change.correction_provenance[requiredField];
      delete change.correction_provenance[requiredField];
      try { await expectHistoryTamperFailure(payPeriodId, `${side} missing ${versionLabel} correction_provenance.${requiredField}`); }
      finally { change.correction_provenance[requiredField] = originalValue; }
    }
  }

  const sourceVerifyAfterTamperChecks = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'synthetic-period', request_id: 'modified-cross-source-verify-after-tamper-001' });
  const destinationVerifyAfterTamperChecks = await h.invoke({ action: 'pay_period_history_verify', pay_period_id: 'modified-destination-period', request_id: 'modified-cross-destination-verify-after-tamper-001' });
  assert.equal(sourceVerifyAfterTamperChecks.body.verified, true, JSON.stringify(sourceVerifyAfterTamperChecks.body));
  assert.equal(destinationVerifyAfterTamperChecks.body.verified, true, JSON.stringify(destinationVerifyAfterTamperChecks.body));
});

test('destination finalization gate wins over a simultaneous employee correction review', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod.push({
    id: 'employee-race-destination', label: 'Employee Race Destination',
    start_date: '2026-09-27', end_date: '2026-10-03', status: 'review', last_request_id: '',
    updated_date: '2026-09-20T00:00:00.000Z',
  });
  const entry = h.rows.TimeEntry[0];
  const submitted = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'employee-race-submit-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Move this shift into the adjacent payroll period',
    requested_changes: {
      clock_in: '2026-09-27T14:00:00.000Z', clock_out: '2026-09-27T22:00:00.000Z',
      lunch_minutes: 0, notes: 'Synthetic race correction',
    },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  let request = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'employee-race-submit-001');
  assert.ok(request?.id);

  let gateEntered;
  const entered = new Promise((resolve) => { gateEntered = resolve; });
  let releaseFinalization;
  h.setAfterRowUpdate(async (entity, _query, update, row) => {
    if (entity === 'TimeClockEmployeeState' && update.$set?.correction_create_status === 'creating' &&
        row.user_email === employee.email && row.correction_create_time_entry_id === 'pay_period:employee-race-destination') {
      gateEntered();
      await new Promise((resolve) => { releaseFinalization = resolve; });
    }
  });

  const finalizePromise = h.invoke({
    action: 'pay_period_status', pay_period_id: 'employee-race-destination', decision: 'finalize',
    request_id: 'employee-race-destination-finalize-001', note: '',
  });
  await entered;
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  const competingReview = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'employee-race-review-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date, decision: 'approve',
    reason: 'Employee correction is accurate',
  });
  assert.equal(competingReview.status, 409, JSON.stringify(competingReview.body));
  assert.match(competingReview.body.error, /Another correction submission|employee mutation gate|being processed|current action/i);
  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  assert.equal(request.status, 'pending');
  assert.equal(h.rows.TimeEntry[0].clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' && row.request_id === 'employee-race-review-001').length, 0);

  releaseFinalization();
  const finalized = await finalizePromise;
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  assert.equal(h.rows.TimeClockPayPeriod.find((row) => row.id === 'employee-race-destination').status, 'finalized');

  request = h.rows.TimeClockCorrectionRequest.find((row) => row.id === request.id);
  const blockedAfterFinalize = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'employee-race-review-after-finalize-001', correction_request_id: request.id,
    expected_request_updated_date: request.updated_date, decision: 'approve',
    reason: 'Employee correction is accurate',
  });
  assert.equal(blockedAfterFinalize.status, 409, JSON.stringify(blockedAfterFinalize.body));
  assert.equal(blockedAfterFinalize.body.finalized_pay_period_id, 'employee-race-destination');
  assert.equal(h.rows.TimeEntry[0].clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');
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

test('v26 missed Clock Out payroll provenance binds Punch Exception and employee punch-response evidence', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-29T12:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  const initialFinalized = await h.action('finalize', 'v26-missed-initial-finalize-001');
  assert.equal(initialFinalized.status, 200, JSON.stringify(initialFinalized.body));
  const reopened = await h.action('reopen', 'v26-missed-reopen-001', 'Investigate missed Clock Out before payroll');
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));

  const staleEntry = {
    id: 'v26-missed-entry', user_email: employee.email, user_name: employee.full_name,
    status: 'clocked_in', clock_in: '2026-09-28T10:00:00.000Z', approval_status: 'unreviewed',
    lunch_minutes: 0, job_allocations: [], clock_source: 'server',
    updated_date: '2026-09-28T10:00:00.000Z',
  };
  h.rows.TimeEntry.push(staleEntry);
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(state, {
    status: 'clocked_in', active_entry_id: staleEntry.id,
    break_status: 'working', active_break_id: null,
    work_pause_status: 'working', active_work_pause_id: null,
    labor_status: 'idle',
  });

  const sourceRequestId = 'v26-missed-source-001';
  const resolved = await h.invokeAs(employee, {
    action: 'resolve_punch_exception', target_email: employee.email,
    request_id: sourceRequestId, response: 'missed_clock_out',
    claimed_clock_out: '2026-09-28T22:00:00.000Z',
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  const correction = h.rows.TimeClockCorrectionRequest[0];
  const punchCase = h.rows.TimeClockPunchException[0];
  const punchAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'punch_exception' && row.request_id === sourceRequestId && row.time_entry_id === staleEntry.id,
  );
  assert.ok(correction?.id);
  assert.ok(punchCase?.id);
  assert.ok(punchAudit?.id);
  assert.equal(correction.request_kind, 'missed_clock_out');
  assert.equal(punchCase.status, 'pending_manager_review');
  assert.equal(punchAudit.details.response, 'missed_clock_out');
  assert.equal(punchAudit.details.claimed_clock_out, '2026-09-28T22:00:00.000Z');

  const correctionApproved = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v26-missed-review-001', correction_request_id: correction.id,
    expected_request_updated_date: correction.updated_date,
    decision: 'approve', reason: 'Verified reported missed Clock Out',
  });
  assert.equal(correctionApproved.status, 200, JSON.stringify(correctionApproved.body));
  assert.equal(punchCase.status, 'resolved');
  assert.equal(punchCase.resolution_audit_id, correction.applied_audit_id);

  const correctedEntry = h.rows.TimeEntry.find((row) => row.id === staleEntry.id);
  const shiftApproved = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v26-missed-shift-approval-001', entry_id: correctedEntry.id,
    expected_updated_date: correctedEntry.updated_date,
    decision: 'approve', note: 'Final shift approval after missed Clock Out correction',
  });
  assert.equal(shiftApproved.status, 200, JSON.stringify(shiftApproved.body));

  const originalPunchHash = punchAudit.details.payload_hash;
  punchAudit.details.payload_hash = 'tampered-before-v26-finalization';
  const blockedFinalize = await h.action('finalize', 'v26-missed-refinalize-001');
  assert.equal(blockedFinalize.status, 409, JSON.stringify(blockedFinalize.body));
  assert.match(blockedFinalize.body.error, /origin evidence/i);
  punchAudit.details.payload_hash = originalPunchHash;

  const refinalized = await h.action('finalize', 'v26-missed-refinalize-001');
  assert.equal(refinalized.status, 200, JSON.stringify(refinalized.body));
  assert.equal(period.finalized_summary.snapshot_version, 28);
  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const change = period.finalized_summary.generation_changes[0];
  assert.equal(change.change_type, 'added');
  const provenance = change.correction_provenance;
  assert.equal(provenance.request_kind, 'missed_clock_out');
  assert.equal(provenance.punch_exception_id, punchCase.id);
  assert.equal(provenance.punch_case_key, punchCase.case_key);
  assert.equal(provenance.punch_exception_status, 'resolved');
  assert.equal(provenance.punch_employee_response, 'missed_clock_out');
  assert.equal(provenance.punch_claimed_clock_out, '2026-09-28T22:00:00.000Z');
  assert.equal(provenance.punch_resolution_audit_id, correction.applied_audit_id);
  assert.equal(provenance.punch_response_audit_id, punchAudit.id);
  assert.equal(provenance.punch_response_audit_outcome, punchAudit.outcome);
  assert.equal(provenance.punch_response_audit_at, punchAudit.server_timestamp);
  assert.equal(provenance.punch_response_actor_role, punchAudit.actor_role);
  assert.equal(provenance.punch_response_authentication_method, punchAudit.authentication_method);
  assert.equal(provenance.punch_response_payload_hash, punchAudit.details.payload_hash);
  assert.ok(provenance.punch_original_snapshot_hash);

  const verified = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: 'v26-missed-verify-001',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  let tamperSequence = 0;
  const expectTamperFailure = async (label) => {
    tamperSequence += 1;
    const result = await h.invoke({
      action: 'pay_period_history_verify', pay_period_id: period.id,
      request_id: `v26-missed-tamper-${tamperSequence}`,
    });
    assert.equal(result.status, 200, `${label}: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.verified, false, `${label} was not detected: ${JSON.stringify(result.body)}`);
  };
  const tamperField = async (target, field, value, label) => {
    const original = clone(target[field]);
    target[field] = clone(value);
    try { await expectTamperFailure(label); }
    finally { target[field] = original; }
  };

  for (const [field, value] of [
    ['case_key', 'missed_clock_out:other-entry'],
    ['status', 'pending_manager_review'],
    ['employee_response', 'worked_through'],
    ['claimed_clock_out', '2026-09-28T22:05:00.000Z'],
    ['request_id', 'tampered-punch-request-id'],
    ['correction_request_id', 'tampered-correction-id'],
    ['resolution_audit_id', 'tampered-resolution-audit-id'],
    ['detected_clock_in', '2026-09-28T10:05:00.000Z'],
  ]) {
    await tamperField(punchCase, field, value, `PunchException ${field}`);
  }
  await tamperField(punchCase.original_snapshot, 'clock_in', '2026-09-28T10:05:00.000Z', 'PunchException original snapshot');

  for (const [field, value] of [
    ['outcome', 'blocked'],
    ['user_email', 'other-worker@synthetic.invalid'],
    ['actor_email', 'other-worker@synthetic.invalid'],
    ['actor_role', 'badge'],
    ['authentication_method', 'badge'],
    ['server_timestamp', '2026-09-30T12:00:00.000Z'],
    ['reason', 'tampered missed punch reason'],
  ]) {
    await tamperField(punchAudit, field, value, `punch_exception audit ${field}`);
  }
  for (const [field, value] of [
    ['payload_hash', 'tampered-punch-payload-hash'],
    ['punch_exception_id', 'tampered-punch-exception-id'],
    ['correction_request_id', 'tampered-correction-id'],
    ['response', 'worked_through'],
    ['claimed_clock_out', '2026-09-28T22:05:00.000Z'],
  ]) {
    await tamperField(punchAudit.details, field, value, `punch_exception audit details.${field}`);
  }
  await tamperField(punchAudit.details.original_snapshot, 'clock_in', '2026-09-28T10:05:00.000Z', 'punch_exception audit original snapshot');
  await tamperField(correction, 'request_kind', 'standard', 'CorrectionRequest request_kind');
  await tamperField(correction, 'punch_exception_id', 'tampered-punch-exception-id', 'CorrectionRequest punch_exception_id');

  const punchAuditIndex = h.rows.TimeClockAudit.findIndex((row) => row.id === punchAudit.id);
  const [removedPunchAudit] = h.rows.TimeClockAudit.splice(punchAuditIndex, 1);
  try { await expectTamperFailure('missing employee punch-response audit'); }
  finally { h.rows.TimeClockAudit.splice(punchAuditIndex, 0, removedPunchAudit); }
  h.rows.TimeClockAudit.push({ ...clone(punchAudit), id: 'synthetic-duplicate-v26-punch-response-audit' });
  try { await expectTamperFailure('duplicate employee punch-response audit'); }
  finally { h.rows.TimeClockAudit.pop(); }

  for (const [field, value] of [
    ['request_kind', 'standard'],
    ['punch_exception_id', 'tampered-frozen-punch-exception-id'],
    ['punch_case_key', 'missed_clock_out:other-entry'],
    ['punch_exception_status', 'pending_manager_review'],
    ['punch_employee_response', 'worked_through'],
    ['punch_claimed_clock_out', '2026-09-28T22:05:00.000Z'],
    ['punch_resolution_audit_id', 'tampered-frozen-resolution-audit-id'],
    ['punch_response_audit_id', 'tampered-frozen-punch-audit-id'],
    ['punch_response_audit_outcome', 'recovered'],
    ['punch_response_audit_at', '2026-09-30T12:00:00.000Z'],
    ['punch_response_actor_role', 'badge'],
    ['punch_response_authentication_method', 'badge'],
    ['punch_response_payload_hash', 'tampered-frozen-punch-hash'],
    ['punch_original_snapshot_hash', 'tampered-frozen-original-snapshot-hash'],
  ]) {
    await tamperField(provenance, field, value, `v26 correction_provenance.${field}`);
  }
  const originalRequired = provenance.punch_response_audit_id;
  delete provenance.punch_response_audit_id;
  try { await expectTamperFailure('missing v26 punch_response_audit_id'); }
  finally { provenance.punch_response_audit_id = originalRequired; }

  const verifiedAfterTamper = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: 'v26-missed-verify-after-tamper-001',
  });
  assert.equal(verifiedAfterTamper.body.verified, true, JSON.stringify(verifiedAfterTamper.body));
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
  // A terminal review with a mismatched TimeEntry must fail closed AND leave
  // the company coordinator claimed, not silently authorize another review.
  assert.equal(result.status, 500, JSON.stringify(result.body));
  assert.match(result.body.error, /could not be completed safely/i);
  assert.equal(h.rows.TimeClockCorrectionRequest[0].status, 'approved');
  assert.equal(h.rows.TimeClockPunchException[0].status, 'resolved');
  assert.equal(h.rows.TimeEntry[0].approval_status, 'approved');
  assert.equal(h.rows.TimeClockAdminCorrectionGate[0].status, 'creating');
  assert.equal(h.rows.TimeClockAdminCorrectionGate[0].request_id, 'convergence-review-001');
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

for (const managerCorrectionCount of [0, 1, 2]) {
const managerCorrected = managerCorrectionCount > 0;
const correctionLabel = managerCorrectionCount === 2
  ? ' after two audited manager corrections'
  : managerCorrected ? ' after audited manager correction' : '';
test(`v27 late-day missed Clock In payroll provenance binds employee attestation and manager approval${correctionLabel}`, async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  if (!managerCorrected) {
  const initialFinalized = await h.action('finalize', 'v27-late-initial-finalize-001');
  assert.equal(initialFinalized.status, 200, JSON.stringify(initialFinalized.body));
  const reopened = await h.action('reopen', 'v27-late-payroll-reopen-001', 'Reconcile employee-reported missed Clock In');
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));

  }
  const recoveryRequestId = 'v27-late-source-001';
  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: recoveryRequestId, claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entryId = recovered.body.entry.id;
  const punchCase = h.rows.TimeClockPunchException.find((row) => row.id === recovered.body.punch_exception.id);
  const clockInAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'clock_in' && row.request_id === recoveryRequestId && row.time_entry_id === entryId
  );
  const punchAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'punch_exception' && row.request_id === recoveryRequestId && row.time_entry_id === entryId
  );
  assert.ok(punchCase?.id);
  assert.ok(clockInAudit?.id);
  assert.ok(punchAudit?.id);
  assert.equal(clockInAudit.actor_email, employee.email);
  assert.equal(punchAudit.actor_email, employee.email);

  const clockOut = await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-late-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Synthetic v27 missed Clock In payroll validation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));
  const completed = h.rows.TimeEntry.find((row) => row.id === entryId);
  assert.equal(completed.status, 'clocked_out');
  assert.equal(completed.approval_status, 'needs_review');

  const correctionAudits = [];
  if (managerCorrected) {
    const correctionPayload = {
      action: 'admin_correct_entry', target_email: employee.email,
      request_id: 'v27-late-manager-correction-001', entry_id: completed.id,
      expected_updated_date: completed.updated_date, reason: 'Manager verified arrival fifteen minutes after employee claim',
      correction: {
        clock_in: '2026-09-28T12:15:00.000Z', clock_out: completed.clock_out,
        lunch_minutes: 0, notes: 'Audited payroll time differs from original employee attestation',
        job_allocations: [{ hours: 7, minutes: 45, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
      },
    };
    const unauthorized = await h.invokeAs(employee, correctionPayload);
    assert.equal(unauthorized.status, 403, JSON.stringify(unauthorized.body));
    const corrected = await h.invoke(correctionPayload);
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    const retry = await h.invoke(correctionPayload);
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    const audits = h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' && row.request_id === correctionPayload.request_id);
    assert.equal(audits.length, 1);
    correctionAudits.push(audits[0]);
    assert.equal(correctionAudits[0].details.original.clock_in, '2026-09-28T12:00:00.000Z');
    assert.equal(correctionAudits[0].details.corrected.clock_in, correctionPayload.correction.clock_in);
    assert.equal(completed.clock_in, correctionPayload.correction.clock_in);

    if (managerCorrectionCount === 2) {
      const secondCorrectionPayload = {
        action: 'admin_correct_entry', target_email: employee.email,
        request_id: 'v27-late-manager-correction-002', entry_id: completed.id,
        expected_updated_date: completed.updated_date, reason: 'Manager rechecked arrival and corrected payroll time again',
        correction: {
          clock_in: '2026-09-28T12:30:00.000Z', clock_out: completed.clock_out,
          lunch_minutes: 0, notes: 'Second audited manager correction after employee attestation',
          job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
        },
      };
      const secondCorrected = await h.invoke(secondCorrectionPayload);
      assert.equal(secondCorrected.status, 200, JSON.stringify(secondCorrected.body));
      const secondRetry = await h.invoke(secondCorrectionPayload);
      assert.equal(secondRetry.status, 200, JSON.stringify(secondRetry.body));
      const secondAudits = h.rows.TimeClockAudit.filter((row) =>
        row.action === 'admin_correction' && row.request_id === secondCorrectionPayload.request_id
      );
      assert.equal(secondAudits.length, 1);
      correctionAudits.push(secondAudits[0]);
      assert.equal(correctionAudits[1].details.original.clock_in, '2026-09-28T12:15:00.000Z');
      assert.equal(correctionAudits[1].details.corrected.clock_in, '2026-09-28T12:30:00.000Z');
      assert.equal(completed.clock_in, '2026-09-28T12:30:00.000Z');
    }

    assert.equal(completed.approval_status, 'needs_review');
    assert.equal(punchCase.claimed_clock_in, '2026-09-28T12:00:00.000Z');
    const unapprovedFinalize = await h.action('finalize', 'v27-late-unapproved-finalize-001');
    assert.equal(unapprovedFinalize.status, 409, JSON.stringify(unapprovedFinalize.body));
  }
  const correctionAudit = correctionAudits.at(-1) || null;

  const approved = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-late-manager-approval-001', entry_id: completed.id,
    expected_updated_date: completed.updated_date, decision: 'approve',
    note: 'Verified employee-reported missed Clock In for payroll',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const approvedEntry = h.rows.TimeEntry.find((row) => row.id === entryId);
  const approvalAudit = h.rows.TimeClockAudit.find((row) => row.id === approved.body.audit_id);
  assert.equal(approvedEntry.approval_status, 'approved');
  assert.ok(approvalAudit?.id);
  assert.equal(punchCase.status, 'resolved');
  assert.equal(punchCase.resolution_audit_id, approvalAudit.id);

  const originalPunchHash = punchAudit.details.payload_hash;
  punchAudit.details.payload_hash = 'tampered-before-v27-finalization';
  const blockedFinalize = await h.action('finalize', 'v27-late-refinalize-001');
  assert.equal(blockedFinalize.status, 409, JSON.stringify(blockedFinalize.body));
  assert.match(blockedFinalize.body.error, /missed Clock In evidence/i);
  punchAudit.details.payload_hash = originalPunchHash;

  const refinalized = await h.action('finalize', 'v27-late-refinalize-001');
  assert.equal(refinalized.status, 200, JSON.stringify(refinalized.body));
  assert.equal(period.finalized_summary.snapshot_version, 28);
  assert.equal(period.finalized_summary.shift_manifest.length, 1);
  const manifestRow = period.finalized_summary.shift_manifest[0];
  const provenance = manifestRow.late_clock_in_provenance;
  assert.equal(manifestRow.clock_source, managerCorrected ? 'admin_correction' : 'employee_attested_missed_clock_in');
  assert.equal(manifestRow.clock_in_request_id, recoveryRequestId);
  assert.equal(manifestRow.punch_exception_id, punchCase.id);
  assert.equal(manifestRow.missed_clock_in_reported_at, approvedEntry.missed_clock_in_reported_at);
  assert.equal(provenance.source, 'employee_attested_missed_clock_in');
  assert.equal(provenance.request_id, recoveryRequestId);
  assert.equal(provenance.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(provenance.payroll_clock_in_at_finalization, approvedEntry.clock_in);
  const expectedPayrollClockIn = managerCorrectionCount === 2
    ? '2026-09-28T12:30:00.000Z'
    : managerCorrected ? '2026-09-28T12:15:00.000Z' : '2026-09-28T12:00:00.000Z';
  assert.equal(provenance.payroll_clock_in_at_finalization, expectedPayrollClockIn);
  if (managerCorrectionCount === 1) {
    assert.equal(provenance.payroll_correction_evidence.correction_chain, undefined);
  }
  if (managerCorrectionCount === 2) {
    assert.deepEqual(
      provenance.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
      correctionAudits.map((row) => row.id),
    );
  }
  const finalizeRetry = await h.action('finalize', 'v27-late-refinalize-001');
  assert.equal(finalizeRetry.status, 200, JSON.stringify(finalizeRetry.body));
  assert.equal(period.finalized_summary.shift_manifest.length, 1);
  assert.equal(provenance.company_date, '2026-09-28');
  assert.equal(provenance.punch_exception_id, punchCase.id);
  assert.equal(provenance.punch_case_key, punchCase.case_key);
  assert.equal(provenance.punch_case_status_at_finalization, 'resolved');
  assert.equal(provenance.punch_employee_response, 'missed_clock_in');
  assert.equal(provenance.clock_in_audit_id, clockInAudit.id);
  assert.equal(provenance.punch_audit_id, punchAudit.id);
  assert.equal(provenance.punch_payload_hash, punchAudit.details.payload_hash);
  assert.equal(provenance.manager_approval_audit_id, approvalAudit.id);
  assert.equal(provenance.manager_approval_request_id, approvedEntry.approval_request_id);
  assert.ok(provenance.punch_original_snapshot_hash);

  const verify = async (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v27-late-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  let tamperSequence = 0;
  const expectTamperFailure = async (label) => {
    tamperSequence += 1;
    const result = await verify(`v27-late-tamper-${tamperSequence}`);
    assert.equal(result.status, 200, `${label}: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.verified, false, `${label} was not detected: ${JSON.stringify(result.body)}`);
  };
  const tamperField = async (target, field, value, label) => {
    const original = clone(target[field]);
    target[field] = clone(value);
    try { await expectTamperFailure(label); }
    finally { target[field] = original; }
  };

  if (managerCorrected) {
    await tamperField(approvedEntry, 'clock_in', '2026-09-28T12:00:00.000Z', 'payroll Clock In reverted to employee claim');
    await tamperField(correctionAudit.details.corrected, 'clock_in', '2026-09-28T12:00:00.000Z', 'manager correction final Clock In');
    await tamperField(correctionAudit, 'actor_email', employee.email, 'manager correction actor');
  }
  if (managerCorrectionCount === 2) {
    await tamperField(
      correctionAudits[0].details.corrected, 'clock_in', '2026-09-28T12:10:00.000Z',
      'intermediate manager correction Clock In',
    );
    await tamperField(
      provenance.payroll_correction_evidence.correction_chain[0], 'evidence_hash', 'tampered-chain-hash',
      'frozen intermediate manager correction evidence',
    );
  }

  for (const [field, value] of [
    ['clock_source', 'server'],
    ['clock_in_request_id', 'tampered-clock-in-request'],
    ['punch_exception_id', 'tampered-punch-exception-id'],
    ['missed_clock_in_reported_at', '2026-09-28T20:05:00.000Z'],
  ]) {
    await tamperField(approvedEntry, field, value, `TimeEntry ${field}`);
  }

  for (const [field, value] of [
    ['case_key', 'late_clock_in:other-entry'],
    ['user_email', 'other-worker@synthetic.invalid'],
    ['time_entry_id', 'other-entry'],
    ['exception_type', 'missed_clock_out'],
    ['status', 'pending_manager_review'],
    ['employee_response', 'worked_through'],
    ['claimed_clock_in', '2026-09-28T12:05:00.000Z'],
    ['request_id', 'tampered-request-id'],
    ['detected_clock_in', '2026-09-28T12:05:00.000Z'],
    ['detected_at', '2026-09-28T20:05:00.000Z'],
    ['submitted_at', '2026-09-28T20:05:00.000Z'],
    ['resolution_audit_id', 'tampered-resolution-audit-id'],
  ]) {
    await tamperField(punchCase, field, value, `PunchException ${field}`);
  }
  await tamperField(punchCase.original_snapshot, 'missing_clock_in', false, 'PunchException original missing_clock_in');
  await tamperField(punchCase.original_snapshot, 'detected_at', '2026-09-28T20:05:00.000Z', 'PunchException original detected_at');
  await tamperField(punchCase.original_snapshot, 'company_date', '2026-09-27', 'PunchException original company_date');

  for (const [field, value] of [
    ['outcome', 'blocked'],
    ['actor_email', 'other-worker@synthetic.invalid'],
    ['actor_role', 'badge'],
    ['authentication_method', 'badge'],
    ['server_timestamp', '2026-09-28T20:05:00.000Z'],
    ['reason', 'tampered Clock In audit reason'],
  ]) {
    await tamperField(clockInAudit, field, value, `clock_in audit ${field}`);
  }
  for (const [field, value] of [
    ['clock_source', 'server'],
    ['employee_attested_clock_in', '2026-09-28T12:05:00.000Z'],
    ['reported_at', '2026-09-28T20:05:00.000Z'],
  ]) {
    await tamperField(clockInAudit.details, field, value, `clock_in audit details.${field}`);
  }
  await tamperField(clockInAudit.details.payroll_membership, 'company_date', '2026-09-27', 'clock_in audit payroll company date');

  for (const [field, value] of [
    ['outcome', 'blocked'],
    ['actor_email', 'other-worker@synthetic.invalid'],
    ['actor_role', 'badge'],
    ['authentication_method', 'badge'],
    ['server_timestamp', '2026-09-28T20:05:00.000Z'],
    ['reason', 'tampered punch audit reason'],
  ]) {
    await tamperField(punchAudit, field, value, `punch_exception audit ${field}`);
  }
  for (const [field, value] of [
    ['payload_hash', 'tampered-payload-hash'],
    ['punch_exception_id', 'tampered-punch-exception-id'],
    ['response', 'worked_through'],
    ['claimed_clock_in', '2026-09-28T12:05:00.000Z'],
    ['company_date', '2026-09-27'],
  ]) {
    await tamperField(punchAudit.details, field, value, `punch_exception audit details.${field}`);
  }

  for (const [field, value] of [
    ['outcome', 'blocked'],
    ['actor_email', 'other-manager@synthetic.invalid'],
    ['actor_role', 'employee'],
    ['authentication_method', 'badge'],
    ['server_timestamp', '2026-09-28T20:05:00.000Z'],
  ]) {
    await tamperField(approvalAudit, field, value, `approval audit ${field}`);
  }
  await tamperField(approvalAudit.details, 'decision', 'reopen', 'approval audit decision');

  for (const [row, label] of [
    [clockInAudit, 'clock_in'],
    [punchAudit, 'punch_exception'],
    [approvalAudit, 'time_approval'],
  ]) {
    const index = h.rows.TimeClockAudit.findIndex((audit) => audit.id === row.id);
    const [removed] = h.rows.TimeClockAudit.splice(index, 1);
    try { await expectTamperFailure(`missing ${label} audit`); }
    finally { h.rows.TimeClockAudit.splice(index, 0, removed); }
    h.rows.TimeClockAudit.push({ ...clone(row), id: `synthetic-duplicate-${label}-audit` });
    try { await expectTamperFailure(`duplicate ${label} audit`); }
    finally { h.rows.TimeClockAudit.pop(); }
  }

  for (const [field, value] of [
    ['claimed_clock_in', '2026-09-28T12:05:00.000Z'],
    ['payroll_clock_in_at_finalization', '2026-09-28T12:05:00.000Z'],
    ['punch_exception_id', 'tampered-frozen-punch-id'],
    ['clock_in_audit_id', 'tampered-frozen-clock-in-audit-id'],
    ['punch_audit_id', 'tampered-frozen-punch-audit-id'],
    ['punch_payload_hash', 'tampered-frozen-payload-hash'],
    ['manager_approval_audit_id', 'tampered-frozen-approval-id'],
    ['punch_original_snapshot_hash', 'tampered-frozen-original-snapshot-hash'],
  ]) {
    await tamperField(provenance, field, value, `frozen late_clock_in_provenance.${field}`);
  }

  const verifiedAfterTamper = await verify('v27-late-verify-after-tamper-001');
  assert.equal(verifiedAfterTamper.body.verified, true, JSON.stringify(verifiedAfterTamper.body));

  const reopenedPayroll = await h.action('reopen', 'v27-late-payroll-reopen-002', 'Recheck missed Clock In after finalized history');
  assert.equal(reopenedPayroll.status, 200, JSON.stringify(reopenedPayroll.body));
  const entryAfterReopen = h.rows.TimeEntry.find((row) => row.id === entryId);
  const reopenedShift = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-late-shift-reopen-001', entry_id: entryAfterReopen.id,
    expected_updated_date: entryAfterReopen.updated_date, decision: 'reopen',
    note: 'Recheck reconstructed missed Clock In after payroll reopen',
  });
  assert.equal(reopenedShift.status, 200, JSON.stringify(reopenedShift.body));
  assert.equal(punchCase.status, 'pending_manager_review');

  const historicalVerified = await verify('v27-late-retired-verify-001');
  assert.equal(historicalVerified.status, 200, JSON.stringify(historicalVerified.body));
  assert.equal(historicalVerified.body.verified, true, JSON.stringify(historicalVerified.body));
});

}

test('v27 missed Clock In correction lineage survives approve and reopen between manager corrections', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-review-chain-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);
  const punchCase = h.rows.TimeClockPunchException.find((row) => row.id === recovered.body.punch_exception.id);

  const clockOut = await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-review-chain-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Synthetic review-boundary lineage validation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));

  const correctionB = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v27-review-chain-correction-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager verified first corrected arrival',
    correction: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'First manager correction before review reopen',
      job_allocations: [{ hours: 7, minutes: 45, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  });
  assert.equal(correctionB.status, 200, JSON.stringify(correctionB.body));
  const correctionBAudit = h.rows.TimeClockAudit.find((row) => row.id === correctionB.body.audit_id);
  assert.equal(correctionBAudit.details.original.clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(correctionBAudit.details.corrected.clock_in, '2026-09-28T12:15:00.000Z');

  const approvalB = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-review-chain-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'First approval before re-review',
  });
  assert.equal(approvalB.status, 200, JSON.stringify(approvalB.body));
  const approvalBAudit = h.rows.TimeClockAudit.find((row) => row.id === approvalB.body.audit_id);
  assert.equal(entry.approval_status, 'approved');
  assert.equal(punchCase.status, 'resolved');

  const reopenB = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-review-chain-reopen-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'New arrival evidence requires another correction',
  });
  assert.equal(reopenB.status, 200, JSON.stringify(reopenB.body));
  const reopenBAudit = h.rows.TimeClockAudit.find((row) => row.id === reopenB.body.audit_id);
  assert.equal(entry.approval_status, 'needs_review');
  assert.equal(punchCase.status, 'pending_manager_review');

  const correctionCRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v27-review-chain-correction-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager verified second corrected arrival',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Second manager correction after approval reopen',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const correctionC = await h.invoke(correctionCRequest);
  assert.equal(correctionC.status, 200, JSON.stringify(correctionC.body));
  const correctionCRetry = await h.invoke(correctionCRequest);
  assert.equal(correctionCRetry.status, 200, JSON.stringify(correctionCRetry.body));
  const correctionCAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'admin_correction' && row.request_id === correctionCRequest.request_id
  );
  assert.equal(correctionCAudits.length, 1);
  const correctionCAudit = correctionCAudits[0];
  assert.equal(correctionCAudit.details.original.clock_in, '2026-09-28T12:15:00.000Z');
  assert.equal(correctionCAudit.details.corrected.clock_in, '2026-09-28T12:30:00.000Z');

  const approvalC = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-review-chain-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Final reviewed payroll arrival',
  });
  assert.equal(approvalC.status, 200, JSON.stringify(approvalC.body));
  const approvalCAudit = h.rows.TimeClockAudit.find((row) => row.id === approvalC.body.audit_id);
  assert.equal(entry.approval_status, 'approved');
  assert.equal(punchCase.status, 'resolved');

  const finalized = await h.action('finalize', 'v27-review-chain-finalize-001');
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  const provenance = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.equal(provenance.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(provenance.payroll_clock_in_at_finalization, '2026-09-28T12:30:00.000Z');
  assert.equal(provenance.manager_approval_audit_id, approvalCAudit.id);
  assert.deepEqual(
    provenance.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [correctionBAudit.id, correctionCAudit.id],
  );
  assert.deepEqual(
    provenance.payroll_correction_evidence.review_transition_chain.map((row) => row.audit_id),
    [approvalBAudit.id, reopenBAudit.id],
  );

  const verified = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id,
    request_id: 'v27-review-chain-verify-001',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalIntermediate = correctionBAudit.details.corrected.clock_in;
  correctionBAudit.details.corrected.clock_in = '2026-09-28T12:10:00.000Z';
  const tampered = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id,
    request_id: 'v27-review-chain-tamper-001',
  });
  assert.equal(tampered.status, 200, JSON.stringify(tampered.body));
  assert.equal(tampered.body.verified, false, JSON.stringify(tampered.body));
  correctionBAudit.details.corrected.clock_in = originalIntermediate;

  const originalReopenDecision = reopenBAudit.details.decision;
  reopenBAudit.details.decision = 'approve';
  const tamperedReview = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id,
    request_id: 'v27-review-chain-tamper-review-001',
  });
  assert.equal(tamperedReview.status, 200, JSON.stringify(tamperedReview.body));
  assert.equal(tamperedReview.body.verified, false, JSON.stringify(tamperedReview.body));
  reopenBAudit.details.decision = originalReopenDecision;

  const frozenReviewEvidence = provenance.payroll_correction_evidence.review_transition_chain[0];
  const originalReviewHash = frozenReviewEvidence.evidence_hash;
  frozenReviewEvidence.evidence_hash = 'tampered-review-transition-hash';
  const tamperedFrozenReview = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id,
    request_id: 'v27-review-chain-tamper-frozen-review-001',
  });
  assert.equal(tamperedFrozenReview.status, 200, JSON.stringify(tamperedFrozenReview.body));
  assert.equal(tamperedFrozenReview.body.verified, false, JSON.stringify(tamperedFrozenReview.body));
  frozenReviewEvidence.evidence_hash = originalReviewHash;
});

test('v27 missed Clock In lineage preserves retired B and current C across payroll reopen and refinalize', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-generation-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  const clockOut = await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-generation-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Synthetic payroll-generation lineage validation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));

  const correctionB = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v27-generation-correction-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'First payroll generation correction',
    correction: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation one corrected payroll time',
      job_allocations: [{ hours: 7, minutes: 45, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  });
  assert.equal(correctionB.status, 200, JSON.stringify(correctionB.body));
  const correctionBAudit = h.rows.TimeClockAudit.find((row) => row.id === correctionB.body.audit_id);

  const approveB = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-generation-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve generation one corrected shift',
  });
  assert.equal(approveB.status, 200, JSON.stringify(approveB.body));
  const approveBAudit = h.rows.TimeClockAudit.find((row) => row.id === approveB.body.audit_id);

  const firstFinalize = await h.action('finalize', 'v27-generation-finalize-b-001');
  assert.equal(firstFinalize.status, 200, JSON.stringify(firstFinalize.body));
  const firstProvenance = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);
  assert.equal(firstProvenance.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(firstProvenance.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(firstProvenance.payroll_correction_evidence.audit_id, correctionBAudit.id);

  const payrollReopen = await h.action(
    'reopen', 'v27-generation-payroll-reopen-001',
    'New evidence requires payroll and shift re-review',
  );
  assert.equal(payrollReopen.status, 200, JSON.stringify(payrollReopen.body));
  const payrollReopenAudit = h.rows.TimeClockAudit.find((row) => row.id === payrollReopen.body.audit_id);
  assert.equal(period.finalized_summary_history.length, 1);

  const shiftReopen = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-generation-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Reopen shift for newly verified arrival evidence',
  });
  assert.equal(shiftReopen.status, 200, JSON.stringify(shiftReopen.body));
  const shiftReopenAudit = h.rows.TimeClockAudit.find((row) => row.id === shiftReopen.body.audit_id);

  const correctionCRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v27-generation-correction-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Second payroll generation correction',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation two corrected payroll time',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const correctionC = await h.invoke(correctionCRequest);
  assert.equal(correctionC.status, 200, JSON.stringify(correctionC.body));
  const correctionCRetry = await h.invoke(correctionCRequest);
  assert.equal(correctionCRetry.status, 200, JSON.stringify(correctionCRetry.body));
  const correctionCAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'admin_correction' && row.request_id === correctionCRequest.request_id
  );
  assert.equal(correctionCAudits.length, 1);
  const correctionCAudit = correctionCAudits[0];

  const approveC = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-generation-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve generation two corrected shift',
  });
  assert.equal(approveC.status, 200, JSON.stringify(approveC.body));

  const secondFinalize = await h.action('finalize', 'v27-generation-finalize-c-001');
  assert.equal(secondFinalize.status, 200, JSON.stringify(secondFinalize.body));
  const secondFinalizeRetry = await h.action('finalize', 'v27-generation-finalize-c-001');
  assert.equal(secondFinalizeRetry.status, 200, JSON.stringify(secondFinalizeRetry.body));
  assert.equal(period.finalized_summary_history.length, 1);

  const retiredProvenance = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentProvenance = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredProvenance, firstProvenance);
  assert.equal(retiredProvenance.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(retiredProvenance.payroll_correction_evidence.audit_id, correctionBAudit.id);
  assert.equal(currentProvenance.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(currentProvenance.payroll_clock_in_at_finalization, '2026-09-28T12:30:00.000Z');
  assert.equal(currentProvenance.payroll_correction_evidence.audit_id, correctionCAudit.id);
  assert.deepEqual(
    currentProvenance.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [correctionBAudit.id, correctionCAudit.id],
  );
  assert.deepEqual(
    currentProvenance.payroll_correction_evidence.review_transition_chain.map((row) => row.audit_id),
    [approveBAudit.id, shiftReopenAudit.id],
  );
  assert.equal(
    currentProvenance.payroll_correction_evidence.payroll_generation_bridge.reopen_request_id,
    'v27-generation-payroll-reopen-001',
  );
  assert.equal(
    currentProvenance.payroll_correction_evidence.payroll_generation_bridge.reopen_audit_id,
    payrollReopenAudit.id,
  );

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v27-generation-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalReopenDecision = payrollReopenAudit.details.decision;
  payrollReopenAudit.details.decision = 'review';
  const tamperedReopen = await verify('v27-generation-tamper-reopen-001');
  assert.equal(tamperedReopen.status, 200, JSON.stringify(tamperedReopen.body));
  assert.equal(tamperedReopen.body.verified, false, JSON.stringify(tamperedReopen.body));
  payrollReopenAudit.details.decision = originalReopenDecision;

  const frozenBridge = currentProvenance.payroll_correction_evidence.payroll_generation_bridge;
  const originalBridgeHash = frozenBridge.reopen_audit_evidence_hash;
  frozenBridge.reopen_audit_evidence_hash = 'tampered-payroll-generation-bridge-hash';
  const tamperedFrozenBridge = await verify('v27-generation-tamper-frozen-bridge-001');
  assert.equal(tamperedFrozenBridge.status, 200, JSON.stringify(tamperedFrozenBridge.body));
  assert.equal(tamperedFrozenBridge.body.verified, false, JSON.stringify(tamperedFrozenBridge.body));
  frozenBridge.reopen_audit_evidence_hash = originalBridgeHash;
});

test('v27 missed Clock In lineage survives three payroll generations B C D', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-generation3-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  const clockOut = await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-generation3-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Three-generation lineage validation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));

  const correct = async (requestId, clockIn, hours, minutes, reason) => {
    const request = {
      action: 'admin_correct_entry', target_email: employee.email, request_id: requestId, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason,
      correction: {
        clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0, notes: reason,
        job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
      },
    };
    const result = await h.invoke(request);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const retry = await h.invoke(request);
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    const audits = h.rows.TimeClockAudit.filter((row) =>
      row.action === 'admin_correction' && row.request_id === requestId
    );
    assert.equal(audits.length, 1);
    return audits[0];
  };
  const approve = async (requestId, note) => {
    const result = await h.invoke({
      action: 'admin_set_entry_approval', target_email: employee.email, request_id: requestId,
      entry_id: entry.id, expected_updated_date: entry.updated_date, decision: 'approve', note,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return h.rows.TimeClockAudit.find((row) => row.id === result.body.audit_id);
  };
  const reopenShift = async (requestId, note) => {
    const result = await h.invoke({
      action: 'admin_set_entry_approval', target_email: employee.email, request_id: requestId,
      entry_id: entry.id, expected_updated_date: entry.updated_date, decision: 'reopen', note,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return h.rows.TimeClockAudit.find((row) => row.id === result.body.audit_id);
  };

  const correctionB = await correct(
    'v27-generation3-correct-b-001', '2026-09-28T12:15:00.000Z', 7, 45, 'Generation B correction',
  );
  const approveB = await approve('v27-generation3-approve-b-001', 'Approve B');
  const finalizeB = await h.action('finalize', 'v27-generation3-finalize-b-001');
  assert.equal(finalizeB.status, 200, JSON.stringify(finalizeB.body));
  const generationBProvenance = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  const reopenPayroll1 = await h.action(
    'reopen', 'v27-generation3-payroll-reopen-1-001', 'Move B to C',
  );
  assert.equal(reopenPayroll1.status, 200, JSON.stringify(reopenPayroll1.body));
  const reopenPayroll1Audit = h.rows.TimeClockAudit.find((row) => row.id === reopenPayroll1.body.audit_id);
  const reopenShift1 = await reopenShift('v27-generation3-shift-reopen-1-001', 'Reopen for C');

  const correctionC = await correct(
    'v27-generation3-correct-c-001', '2026-09-28T12:30:00.000Z', 7, 30, 'Generation C correction',
  );
  const approveC = await approve('v27-generation3-approve-c-001', 'Approve C');
  const finalizeC = await h.action('finalize', 'v27-generation3-finalize-c-001');
  assert.equal(finalizeC.status, 200, JSON.stringify(finalizeC.body));
  const generationCProvenance = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  const reopenPayroll2 = await h.action(
    'reopen', 'v27-generation3-payroll-reopen-2-001', 'Move C to D',
  );
  assert.equal(reopenPayroll2.status, 200, JSON.stringify(reopenPayroll2.body));
  const reopenPayroll2Audit = h.rows.TimeClockAudit.find((row) => row.id === reopenPayroll2.body.audit_id);
  const reopenShift2 = await reopenShift('v27-generation3-shift-reopen-2-001', 'Reopen for D');

  const correctionD = await correct(
    'v27-generation3-correct-d-001', '2026-09-28T12:45:00.000Z', 7, 15, 'Generation D correction',
  );
  const approveD = await approve('v27-generation3-approve-d-001', 'Approve D');
  const finalizeD = await h.action('finalize', 'v27-generation3-finalize-d-001');
  assert.equal(finalizeD.status, 200, JSON.stringify(finalizeD.body));
  const finalizeDRetry = await h.action('finalize', 'v27-generation3-finalize-d-001');
  assert.equal(finalizeDRetry.status, 200, JSON.stringify(finalizeDRetry.body));
  assert.equal(period.finalized_summary_history.length, 2);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const retiredC = period.finalized_summary_history[1].shift_manifest[0].late_clock_in_provenance;
  const currentD = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationBProvenance);
  assert.deepEqual(retiredC, generationCProvenance);
  assert.equal(retiredB.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(retiredB.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(retiredB.payroll_correction_evidence.audit_id, correctionB.id);
  assert.equal(retiredC.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(retiredC.payroll_clock_in_at_finalization, '2026-09-28T12:30:00.000Z');
  assert.equal(retiredC.payroll_correction_evidence.audit_id, correctionC.id);
  assert.equal(currentD.claimed_clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(currentD.payroll_clock_in_at_finalization, '2026-09-28T12:45:00.000Z');
  assert.equal(currentD.payroll_correction_evidence.audit_id, correctionD.id);
  assert.deepEqual(
    currentD.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [correctionB.id, correctionC.id, correctionD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.review_transition_chain.map((row) => row.audit_id),
    [approveB.id, reopenShift1.id, approveC.id, reopenShift2.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.payroll_generation_bridge_chain.map((row) => row.reopen_request_id),
    ['v27-generation3-payroll-reopen-1-001', 'v27-generation3-payroll-reopen-2-001'],
  );
  assert.equal(
    currentD.payroll_correction_evidence.payroll_generation_bridge.reopen_audit_id,
    reopenPayroll2Audit.id,
  );
  assert.equal(
    currentD.payroll_correction_evidence.payroll_generation_bridge_chain[0].reopen_audit_id,
    reopenPayroll1Audit.id,
  );
  assert.equal(currentD.manager_approval_audit_id, approveD.id);

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v27-generation3-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalOlderReopenDecision = reopenPayroll1Audit.details.decision;
  reopenPayroll1Audit.details.decision = 'review';
  const tamperedOlderReopen = await verify('v27-generation3-tamper-old-reopen-001');
  assert.equal(tamperedOlderReopen.status, 200, JSON.stringify(tamperedOlderReopen.body));
  assert.equal(tamperedOlderReopen.body.verified, false, JSON.stringify(tamperedOlderReopen.body));
  reopenPayroll1Audit.details.decision = originalOlderReopenDecision;

  const olderFrozenBridge = currentD.payroll_correction_evidence.payroll_generation_bridge_chain[0];
  const originalOlderBridgeHash = olderFrozenBridge.reopen_audit_evidence_hash;
  olderFrozenBridge.reopen_audit_evidence_hash = 'tampered-older-generation-bridge-hash';
  const tamperedOlderFrozenBridge = await verify('v27-generation3-tamper-old-frozen-bridge-001');
  assert.equal(tamperedOlderFrozenBridge.status, 200, JSON.stringify(tamperedOlderFrozenBridge.body));
  assert.equal(tamperedOlderFrozenBridge.body.verified, false, JSON.stringify(tamperedOlderFrozenBridge.body));
  olderFrozenBridge.reopen_audit_evidence_hash = originalOlderBridgeHash;
});

test('v27 mixed employee correction review then direct admin correction preserves both mechanisms', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-mixed-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  const clockOut = await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-mixed-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Mixed correction provenance validation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));

  const submitted = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v27-mixed-submit-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee reports arrival ten minutes later',
    requested_changes: {
      clock_in: '2026-09-28T12:10:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee requested corrected start',
    },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  const correctionRequest = h.rows.TimeClockCorrectionRequest.find((row) =>
    row.request_id === 'v27-mixed-submit-001'
  );
  assert.ok(correctionRequest?.id);

  const reviewed = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v27-mixed-review-001', correction_request_id: correctionRequest.id,
    expected_request_updated_date: correctionRequest.updated_date, decision: 'approve_modified',
    reason: 'Manager verified fifteen minutes later',
    correction: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Manager modified employee request',
    },
  });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  const appliedAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewed.body.audit_id);
  const reviewAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewed.body.review_audit_id);
  const submissionAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === 'v27-mixed-submit-001'
  );
  assert.ok(appliedAudit?.id);
  assert.ok(reviewAudit?.id);
  assert.ok(submissionAudit?.id);
  assert.equal(entry.clock_in, '2026-09-28T12:15:00.000Z');

  const approvedB = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-mixed-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve employee correction review result',
  });
  assert.equal(approvedB.status, 200, JSON.stringify(approvedB.body));

  const finalizedB = await h.action('finalize', 'v27-mixed-finalize-b-001');
  assert.equal(finalizedB.status, 200, JSON.stringify(finalizedB.body));
  const firstProvenance = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);
  assert.equal(firstProvenance.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  const firstEmployeeReviewEvidence =
    firstProvenance.payroll_correction_evidence.employee_correction_review_chain;
  assert.equal(firstEmployeeReviewEvidence.length, 1);
  assert.equal(firstEmployeeReviewEvidence[0].applied_audit_id, appliedAudit.id);
  assert.equal(firstEmployeeReviewEvidence[0].correction_request_id, correctionRequest.id);
  assert.equal(firstEmployeeReviewEvidence[0].submission_audit_id, submissionAudit.id);
  assert.equal(firstEmployeeReviewEvidence[0].review_audit_id, reviewAudit.id);

  const payrollReopen = await h.action(
    'reopen', 'v27-mixed-payroll-reopen-001', 'New manager evidence for later arrival',
  );
  assert.equal(payrollReopen.status, 200, JSON.stringify(payrollReopen.body));

  const shiftReopen = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-mixed-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen for direct correction',
  });
  assert.equal(shiftReopen.status, 200, JSON.stringify(shiftReopen.body));

  const direct = await h.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v27-mixed-direct-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Direct manager correction after payroll reopen',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction after employee-request generation',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  });
  assert.equal(direct.status, 200, JSON.stringify(direct.body));
  const directAudit = h.rows.TimeClockAudit.find((row) => row.id === direct.body.audit_id);

  const approvedC = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-mixed-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve direct manager correction',
  });
  assert.equal(approvedC.status, 200, JSON.stringify(approvedC.body));

  const finalizedC = await h.action('finalize', 'v27-mixed-finalize-c-001');
  assert.equal(finalizedC.status, 200, JSON.stringify(finalizedC.body));
  const finalizedCRetry = await h.action('finalize', 'v27-mixed-finalize-c-001');
  assert.equal(finalizedCRetry.status, 200, JSON.stringify(finalizedCRetry.body));

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentC = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, firstProvenance);
  assert.equal(retiredB.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(currentC.payroll_clock_in_at_finalization, '2026-09-28T12:30:00.000Z');
  assert.deepEqual(
    currentC.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [appliedAudit.id, directAudit.id],
  );
  assert.equal(currentC.payroll_correction_evidence.employee_correction_review_chain.length, 1);
  assert.equal(
    currentC.payroll_correction_evidence.employee_correction_review_chain[0].correction_request_id,
    correctionRequest.id,
  );

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v27-mixed-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalSubmissionHash = submissionAudit.details.payload_hash;
  submissionAudit.details.payload_hash = 'tampered-mixed-submission-hash';
  const tamperedSubmission = await verify('v27-mixed-tamper-submission-001');
  assert.equal(tamperedSubmission.status, 200, JSON.stringify(tamperedSubmission.body));
  assert.equal(tamperedSubmission.body.verified, false, JSON.stringify(tamperedSubmission.body));
  submissionAudit.details.payload_hash = originalSubmissionHash;

  const originalReviewHash = reviewAudit.details.review_payload_hash;
  reviewAudit.details.review_payload_hash = 'tampered-mixed-review-hash';
  const tamperedReview = await verify('v27-mixed-tamper-review-001');
  assert.equal(tamperedReview.status, 200, JSON.stringify(tamperedReview.body));
  assert.equal(tamperedReview.body.verified, false, JSON.stringify(tamperedReview.body));
  reviewAudit.details.review_payload_hash = originalReviewHash;

  const originalRequestedClockIn = correctionRequest.requested_changes.clock_in;
  correctionRequest.requested_changes.clock_in = '2026-09-28T12:05:00.000Z';
  const tamperedRequest = await verify('v27-mixed-tamper-request-001');
  assert.equal(tamperedRequest.status, 200, JSON.stringify(tamperedRequest.body));
  assert.equal(tamperedRequest.body.verified, false, JSON.stringify(tamperedRequest.body));
  correctionRequest.requested_changes.clock_in = originalRequestedClockIn;

  const frozenEvidence = currentC.payroll_correction_evidence.employee_correction_review_chain[0];
  const originalFrozenSubmissionHash = frozenEvidence.submission_audit_evidence_hash;
  frozenEvidence.submission_audit_evidence_hash = 'tampered-frozen-employee-correction-evidence';
  const tamperedFrozenEvidence = await verify('v27-mixed-tamper-frozen-evidence-001');
  assert.equal(tamperedFrozenEvidence.status, 200, JSON.stringify(tamperedFrozenEvidence.body));
  assert.equal(tamperedFrozenEvidence.body.verified, false, JSON.stringify(tamperedFrozenEvidence.body));
  frozenEvidence.submission_audit_evidence_hash = originalFrozenSubmissionHash;
});

test('v27 reverse mixed direct admin correction then employee correction review preserves both mechanisms', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, {
    start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '',
  });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-reverse-mixed-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  const clockOut = await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-reverse-mixed-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Reverse mixed correction provenance validation',
  });
  assert.equal(clockOut.status, 200, JSON.stringify(clockOut.body));

  const directBRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v27-reverse-mixed-direct-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Direct manager correction before first payroll generation',
    correction: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager generation B correction',
      job_allocations: [{ hours: 7, minutes: 45, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directB = await h.invoke(directBRequest);
  assert.equal(directB.status, 200, JSON.stringify(directB.body));
  const directBRetry = await h.invoke(directBRequest);
  assert.equal(directBRetry.status, 200, JSON.stringify(directBRetry.body));
  const directBAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'admin_correction' && row.request_id === directBRequest.request_id
  );
  assert.equal(directBAudits.length, 1);
  const directBAudit = directBAudits[0];

  const approveB = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-reverse-mixed-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve direct manager generation B correction',
  });
  assert.equal(approveB.status, 200, JSON.stringify(approveB.body));

  const finalizeB = await h.action('finalize', 'v27-reverse-mixed-finalize-b-001');
  assert.equal(finalizeB.status, 200, JSON.stringify(finalizeB.body));
  const firstProvenance = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);
  assert.equal(firstProvenance.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(firstProvenance.payroll_correction_evidence.audit_id, directBAudit.id);
  assert.equal(firstProvenance.payroll_correction_evidence.employee_correction_review_chain, undefined);

  const payrollReopen = await h.action(
    'reopen', 'v27-reverse-mixed-payroll-reopen-001',
    'Employee later supplies a reviewed correction',
  );
  assert.equal(payrollReopen.status, 200, JSON.stringify(payrollReopen.body));
  const payrollReopenAudit = h.rows.TimeClockAudit.find((row) => row.id === payrollReopen.body.audit_id);

  const shiftReopen = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-reverse-mixed-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Reopen for employee correction request',
  });
  assert.equal(shiftReopen.status, 200, JSON.stringify(shiftReopen.body));

  const submitted = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v27-reverse-mixed-submit-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee reports arrival twenty minutes later',
    requested_changes: {
      clock_in: '2026-09-28T12:35:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee correction request in generation C',
    },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  const correctionRequest = h.rows.TimeClockCorrectionRequest.find((row) =>
    row.request_id === 'v27-reverse-mixed-submit-c-001'
  );
  assert.ok(correctionRequest?.id);
  const submissionAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === correctionRequest.request_id
  );
  assert.ok(submissionAudit?.id);

  const reviewRequest = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v27-reverse-mixed-review-c-001', correction_request_id: correctionRequest.id,
    expected_request_updated_date: correctionRequest.updated_date, decision: 'approve_modified',
    reason: 'Manager verified thirty minutes later',
    correction: {
      clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Manager modified employee generation C request',
    },
  };
  const reviewed = await h.invoke(reviewRequest);
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  const reviewedRetry = await h.invoke(reviewRequest);
  assert.equal(reviewedRetry.status, 200, JSON.stringify(reviewedRetry.body));
  const appliedAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewed.body.audit_id);
  const reviewAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewed.body.review_audit_id);
  assert.ok(appliedAudit?.id);
  assert.ok(reviewAudit?.id);
  assert.equal(entry.clock_in, '2026-09-28T12:45:00.000Z');

  const approveC = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-reverse-mixed-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve employee-reviewed generation C correction',
  });
  assert.equal(approveC.status, 200, JSON.stringify(approveC.body));

  const finalizeC = await h.action('finalize', 'v27-reverse-mixed-finalize-c-001');
  assert.equal(finalizeC.status, 200, JSON.stringify(finalizeC.body));
  const finalizeCRetry = await h.action('finalize', 'v27-reverse-mixed-finalize-c-001');
  assert.equal(finalizeCRetry.status, 200, JSON.stringify(finalizeCRetry.body));

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentC = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, firstProvenance);
  assert.equal(retiredB.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(currentC.payroll_clock_in_at_finalization, '2026-09-28T12:45:00.000Z');
  assert.deepEqual(
    currentC.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [directBAudit.id, appliedAudit.id],
  );
  assert.equal(currentC.payroll_correction_evidence.employee_correction_review_chain.length, 1);
  assert.equal(
    currentC.payroll_correction_evidence.employee_correction_review_chain[0].correction_request_id,
    correctionRequest.id,
  );
  assert.equal(
    currentC.payroll_correction_evidence.employee_correction_review_chain[0].submission_audit_id,
    submissionAudit.id,
  );
  assert.equal(
    currentC.payroll_correction_evidence.employee_correction_review_chain[0].review_audit_id,
    reviewAudit.id,
  );
  assert.equal(
    currentC.payroll_correction_evidence.payroll_generation_bridge.reopen_audit_id,
    payrollReopenAudit.id,
  );

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v27-reverse-mixed-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalSubmissionHash = submissionAudit.details.payload_hash;
  submissionAudit.details.payload_hash = 'tampered-reverse-mixed-submission-hash';
  const tamperedSubmission = await verify('v27-reverse-mixed-tamper-submission-001');
  assert.equal(tamperedSubmission.status, 200, JSON.stringify(tamperedSubmission.body));
  assert.equal(tamperedSubmission.body.verified, false, JSON.stringify(tamperedSubmission.body));
  submissionAudit.details.payload_hash = originalSubmissionHash;

  const originalDirectBActor = directBAudit.actor_email;
  directBAudit.actor_email = employee.email;
  const tamperedDirect = await verify('v27-reverse-mixed-tamper-direct-b-001');
  assert.equal(tamperedDirect.status, 200, JSON.stringify(tamperedDirect.body));
  assert.equal(tamperedDirect.body.verified, false, JSON.stringify(tamperedDirect.body));
  directBAudit.actor_email = originalDirectBActor;
});

test('v27 two employee correction reviews across payroll generations preserve both review branches', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-double-employee-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);
  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-double-employee-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Double employee correction-review lineage validation',
  })).status, 200);

  const employeeReview = async (suffix, requestedClockIn, approvedClockIn) => {
    const submitId = `v27-double-employee-submit-${suffix}-001`;
    const reviewId = `v27-double-employee-review-${suffix}-001`;
    const submitted = await h.invokeAs(employee, {
      action: 'submit_correction_request', target_email: employee.email,
      request_id: submitId, entry_id: entry.id, expected_updated_date: entry.updated_date,
      reason: `Employee generation ${suffix} correction`,
      requested_changes: { clock_in: requestedClockIn, clock_out: entry.clock_out, lunch_minutes: 0, notes: `Employee ${suffix}` },
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const request = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === submitId);
    const submissionAudit = h.rows.TimeClockAudit.find((row) => row.action === 'correction_request' && row.request_id === submitId);
    const reviewPayload = {
      action: 'review_correction_request', target_email: employee.email,
      request_id: reviewId, correction_request_id: request.id,
      expected_request_updated_date: request.updated_date, decision: 'approve_modified',
      reason: `Manager generation ${suffix} verification`,
      correction: { clock_in: approvedClockIn, clock_out: entry.clock_out, lunch_minutes: 0, notes: `Manager ${suffix}` },
    };
    const reviewed = await h.invoke(reviewPayload);
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
    assert.equal((await h.invoke(reviewPayload)).status, 200);
    return {
      request, submissionAudit,
      reviewAudit: h.rows.TimeClockAudit.find((row) => row.id === reviewed.body.review_audit_id),
      appliedAudit: h.rows.TimeClockAudit.find((row) => row.id === reviewed.body.audit_id),
    };
  };

  const first = await employeeReview('b', '2026-09-28T12:10:00.000Z', '2026-09-28T12:15:00.000Z');
  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-double-employee-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve generation B',
  })).status, 200);
  assert.equal((await h.action('finalize', 'v27-double-employee-finalize-b-001')).status, 200);
  const firstProvenance = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  assert.equal((await h.action(
    'reopen', 'v27-double-employee-payroll-reopen-001', 'Second employee correction',
  )).status, 200);
  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-double-employee-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen for second employee correction',
  })).status, 200);

  const second = await employeeReview('c', '2026-09-28T12:35:00.000Z', '2026-09-28T12:45:00.000Z');
  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-double-employee-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve generation C',
  })).status, 200);
  assert.equal((await h.action('finalize', 'v27-double-employee-finalize-c-001')).status, 200);
  assert.equal((await h.action('finalize', 'v27-double-employee-finalize-c-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentC = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, firstProvenance);
  assert.deepEqual(
    currentC.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [first.appliedAudit.id, second.appliedAudit.id],
  );
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.correction_request_id),
    [first.request.id, second.request.id],
  );
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.submission_audit_id),
    [first.submissionAudit.id, second.submissionAudit.id],
  );
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.review_audit_id),
    [first.reviewAudit.id, second.reviewAudit.id],
  );

  const verify = (requestId) => h.invoke({ action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId });
  assert.equal((await verify('v27-double-employee-verify-001')).body.verified, true);

  const firstHash = first.submissionAudit.details.payload_hash;
  first.submissionAudit.details.payload_hash = 'tampered-first-employee-submission';
  assert.equal((await verify('v27-double-employee-tamper-first-001')).body.verified, false);
  first.submissionAudit.details.payload_hash = firstHash;

  const secondHash = second.reviewAudit.details.review_payload_hash;
  second.reviewAudit.details.review_payload_hash = 'tampered-second-manager-review';
  assert.equal((await verify('v27-double-employee-tamper-second-001')).body.verified, false);
  second.reviewAudit.details.review_payload_hash = secondHash;
});

test('v27 employee correction approve then approve_modified preserve distinct requested and payroll lineage', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-approval-modes-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);
  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-approval-modes-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Approve-mode lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v27-approval-modes-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee generation B exact correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee exact generation B request',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v27-approval-modes-submit-b-001');

  const reviewBPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v27-approval-modes-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager approves employee time exactly',
  };
  const reviewB = await h.invoke(reviewBPayload);
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));
  assert.equal((await h.invoke(reviewBPayload)).status, 200);
  const appliedB = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.audit_id);
  const reviewBAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.review_audit_id);
  const submissionB = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestB.request_id
  );
  assert.equal(requestB.status, 'approved');
  assert.equal(requestB.review_decision, 'approve');
  assert.equal(entry.clock_in, requestB.requested_changes.clock_in);
  assert.equal(appliedB.details.corrected.clock_in, requestB.requested_changes.clock_in);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-approval-modes-shift-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve exact employee correction',
  })).status, 200);
  assert.equal((await h.action('finalize', 'v27-approval-modes-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);
  assert.equal(generationB.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');

  assert.equal((await h.action(
    'reopen', 'v27-approval-modes-payroll-reopen-001', 'Employee supplies a later revised correction',
  )).status, 200);
  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-approval-modes-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen for modified employee correction',
  })).status, 200);

  const submitC = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v27-approval-modes-submit-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee generation C later correction',
    requested_changes: {
      clock_in: '2026-09-28T12:35:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee generation C request',
    },
  });
  assert.equal(submitC.status, 200, JSON.stringify(submitC.body));
  const requestC = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v27-approval-modes-submit-c-001');

  const reviewCPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v27-approval-modes-review-c-001', correction_request_id: requestC.id,
    expected_request_updated_date: requestC.updated_date, decision: 'approve_modified',
    reason: 'Manager adjusts employee requested time',
    correction: {
      clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Manager adjusted generation C request',
    },
  };
  const reviewC = await h.invoke(reviewCPayload);
  assert.equal(reviewC.status, 200, JSON.stringify(reviewC.body));
  assert.equal((await h.invoke(reviewCPayload)).status, 200);
  const appliedC = h.rows.TimeClockAudit.find((row) => row.id === reviewC.body.audit_id);
  const reviewCAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewC.body.review_audit_id);
  const submissionC = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestC.request_id
  );
  assert.equal(requestC.status, 'approved_modified');
  assert.equal(requestC.review_decision, 'approve_modified');
  assert.equal(requestC.requested_changes.clock_in, '2026-09-28T12:35:00.000Z');
  assert.equal(entry.clock_in, '2026-09-28T12:45:00.000Z');
  assert.notEqual(entry.clock_in, requestC.requested_changes.clock_in);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-approval-modes-shift-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve modified employee correction',
  })).status, 200);
  assert.equal((await h.action('finalize', 'v27-approval-modes-finalize-c-001')).status, 200);
  assert.equal((await h.action('finalize', 'v27-approval-modes-finalize-c-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentC = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentC.payroll_clock_in_at_finalization, '2026-09-28T12:45:00.000Z');
  assert.deepEqual(
    currentC.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [appliedB.id, appliedC.id],
  );
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.correction_request_id),
    [requestB.id, requestC.id],
  );
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.submission_audit_id),
    [submissionB.id, submissionC.id],
  );
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.review_audit_id),
    [reviewBAudit.id, reviewCAudit.id],
  );

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  assert.equal((await verify('v27-approval-modes-verify-001')).body.verified, true);

  const originalBDecision = requestB.review_decision;
  requestB.review_decision = 'approve_modified';
  assert.equal((await verify('v27-approval-modes-tamper-b-decision-001')).body.verified, false);
  requestB.review_decision = originalBDecision;

  const originalCRequestedClock = requestC.requested_changes.clock_in;
  requestC.requested_changes.clock_in = '2026-09-28T12:45:00.000Z';
  assert.equal((await verify('v27-approval-modes-tamper-c-requested-001')).body.verified, false);
  requestC.requested_changes.clock_in = originalCRequestedClock;
});

test('v27 rejected employee correction stays audit-only before later approved payroll correction', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v27-reject-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);
  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v27-reject-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Rejected correction lineage validation',
  })).status, 200);

  const rejectedSubmit = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v27-reject-submit-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee first correction attempt',
    requested_changes: {
      clock_in: '2026-09-28T12:10:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'First correction should be rejected',
    },
  });
  assert.equal(rejectedSubmit.status, 200, JSON.stringify(rejectedSubmit.body));
  const rejectedRequest = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v27-reject-submit-001');
  const rejectedSubmissionAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === rejectedRequest.request_id
  );
  const rejectReviewPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v27-reject-review-001', correction_request_id: rejectedRequest.id,
    expected_request_updated_date: rejectedRequest.updated_date, decision: 'reject',
    reason: 'Employee needs better supporting information',
  };
  const rejectedReview = await h.invoke(rejectReviewPayload);
  assert.equal(rejectedReview.status, 200, JSON.stringify(rejectedReview.body));
  assert.equal((await h.invoke(rejectReviewPayload)).status, 200);
  const rejectedReviewAudit = h.rows.TimeClockAudit.find((row) => row.id === rejectedReview.body.review_audit_id);
  assert.equal(rejectedRequest.status, 'rejected');
  assert.equal(rejectedRequest.review_decision, 'reject');
  assert.equal(rejectedRequest.applied_audit_id, undefined);
  assert.equal(entry.clock_in, '2026-09-28T12:00:00.000Z');

  const approvedSubmit = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v27-reject-submit-002', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee submits corrected supported time',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Second correction is supported',
    },
  });
  assert.equal(approvedSubmit.status, 200, JSON.stringify(approvedSubmit.body));
  const approvedRequest = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v27-reject-submit-002');
  const approveReviewPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v27-reject-review-002', correction_request_id: approvedRequest.id,
    expected_request_updated_date: approvedRequest.updated_date, decision: 'approve',
    reason: 'Manager verifies second employee correction',
  };
  const approvedReview = await h.invoke(approveReviewPayload);
  assert.equal(approvedReview.status, 200, JSON.stringify(approvedReview.body));
  assert.equal((await h.invoke(approveReviewPayload)).status, 200);
  const approvedAppliedAudit = h.rows.TimeClockAudit.find((row) => row.id === approvedReview.body.audit_id);
  const approvedReviewAudit = h.rows.TimeClockAudit.find((row) => row.id === approvedReview.body.review_audit_id);
  const approvedSubmissionAudit = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === approvedRequest.request_id
  );
  assert.equal(approvedRequest.status, 'approved');
  assert.equal(entry.clock_in, '2026-09-28T12:15:00.000Z');

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v27-reject-shift-approve-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve shift after supported employee correction',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v27-reject-finalize-001')).status, 200);
  assert.equal((await h.action('finalize', 'v27-reject-finalize-001')).status, 200);

  const provenance = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.equal(provenance.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(provenance.payroll_correction_evidence.audit_id, approvedAppliedAudit.id);
  assert.deepEqual(
    provenance.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.correction_request_id),
    [approvedRequest.id],
  );
  assert.deepEqual(
    provenance.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.submission_audit_id),
    [approvedSubmissionAudit.id],
  );
  assert.deepEqual(
    provenance.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.review_audit_id),
    [approvedReviewAudit.id],
  );
  assert.equal(
    provenance.payroll_correction_evidence.employee_correction_review_chain.some((row) =>
      row.correction_request_id === rejectedRequest.id ||
      row.submission_audit_id === rejectedSubmissionAudit.id ||
      row.review_audit_id === rejectedReviewAudit.id
    ),
    false,
  );

  assert.equal(h.rows.TimeClockCorrectionRequest.find((row) => row.id === rejectedRequest.id).status, 'rejected');
  assert.ok(h.rows.TimeClockAudit.find((row) => row.id === rejectedSubmissionAudit.id));
  assert.ok(h.rows.TimeClockAudit.find((row) => row.id === rejectedReviewAudit.id));

  const verified = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: 'v27-reject-verify-001',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));
});

test('v28 rejected post-reopen employee correction cannot disturb prior finalized payroll lineage', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-post-reject-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-post-reject-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Post-reopen rejection lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-post-reject-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Supported generation B employee correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation B employee correction',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-post-reject-submit-b-001');

  const reviewBPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-post-reject-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager verifies generation B employee correction',
  };
  const reviewB = await h.invoke(reviewBPayload);
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));
  assert.equal((await h.invoke(reviewBPayload)).status, 200);
  const appliedB = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.audit_id);

  const approveB = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-post-reject-shift-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve generation B employee correction',
  });
  assert.equal(approveB.status, 200, JSON.stringify(approveB.body));

  assert.equal((await h.action('finalize', 'v28-post-reject-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);
  const generationBApproval = clone(period.finalized_summary.shift_manifest[0].approval_evidence);
  assert.equal(period.finalized_summary.snapshot_version, 28);

  assert.equal((await h.action(
    'reopen', 'v28-post-reject-payroll-reopen-001',
    'Review later employee request without changing accepted payroll time',
  )).status, 200);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-post-reject-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Reopen shift to review later employee request',
  })).status, 200);

  const submitC = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-post-reject-submit-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee later asks for unsupported change',
    requested_changes: {
      clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Unsupported later correction',
    },
  });
  assert.equal(submitC.status, 200, JSON.stringify(submitC.body));
  const requestC = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-post-reject-submit-c-001');
  const submissionC = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestC.request_id
  );

  const rejectCPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-post-reject-review-c-001', correction_request_id: requestC.id,
    expected_request_updated_date: requestC.updated_date, decision: 'reject',
    reason: 'Manager cannot verify the later requested time',
  };
  const rejectC = await h.invoke(rejectCPayload);
  assert.equal(rejectC.status, 200, JSON.stringify(rejectC.body));
  assert.equal((await h.invoke(rejectCPayload)).status, 200);
  const rejectCAudit = h.rows.TimeClockAudit.find((row) => row.id === rejectC.body.review_audit_id);
  assert.equal(requestC.status, 'rejected');
  assert.equal(requestC.applied_audit_id, undefined);
  assert.equal(entry.clock_in, '2026-09-28T12:15:00.000Z');

  const approveC = await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-post-reject-shift-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Reapprove unchanged generation B time after rejecting later request',
  });
  assert.equal(approveC.status, 200, JSON.stringify(approveC.body));

  assert.equal((await h.action('finalize', 'v28-post-reject-finalize-c-001')).status, 200);
  assert.equal((await h.action('finalize', 'v28-post-reject-finalize-c-001')).status, 200);
  assert.equal(period.finalized_summary.snapshot_version, 28);
  assert.equal(period.finalized_summary.generation_changes.length, 0);
  assert.equal(period.finalized_summary.generation_change_count, 0);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentRow = period.finalized_summary.shift_manifest[0];
  const currentC = currentRow.late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentC.payroll_clock_in_at_finalization, '2026-09-28T12:15:00.000Z');
  assert.equal(currentC.payroll_correction_evidence.audit_id, appliedB.id);
  assert.deepEqual(
    currentC.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.correction_request_id),
    [requestB.id],
  );
  assert.equal(
    currentC.payroll_correction_evidence.employee_correction_review_chain.some((row) =>
      row.correction_request_id === requestC.id ||
      row.submission_audit_id === submissionC.id ||
      row.review_audit_id === rejectCAudit.id
    ),
    false,
  );

  assert.notEqual(currentRow.approval_evidence.id, generationBApproval.id);
  assert.equal(currentRow.approval_evidence.id, approveC.body.audit_id);
  assert.equal(h.rows.TimeClockCorrectionRequest.find((row) => row.id === requestC.id).status, 'rejected');
  assert.ok(h.rows.TimeClockAudit.find((row) => row.id === submissionC.id));
  assert.ok(h.rows.TimeClockAudit.find((row) => row.id === rejectCAudit.id));

  const verified = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: 'v28-post-reject-verify-001',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));
});

test('v28 rejected employee request cannot contaminate later direct correction in same reopened generation', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-reject-direct-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-reject-direct-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Reject then direct correction lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-reject-direct-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Supported generation B employee correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation B accepted correction',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-reject-direct-submit-b-001');

  const reviewB = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-reject-direct-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager verifies generation B correction',
  });
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-reject-direct-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve generation B shift',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-reject-direct-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  assert.equal((await h.action(
    'reopen', 'v28-reject-direct-payroll-reopen-001',
    'Review later request then apply manager correction',
  )).status, 200);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-reject-direct-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Reopen for later employee request',
  })).status, 200);

  const submitC = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-reject-direct-submit-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Unsupported employee generation C request',
    requested_changes: {
      clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Unsupported later request',
    },
  });
  assert.equal(submitC.status, 200, JSON.stringify(submitC.body));
  const requestC = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-reject-direct-submit-c-001');
  const submissionC = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestC.request_id
  );

  const rejectC = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-reject-direct-review-c-001', correction_request_id: requestC.id,
    expected_request_updated_date: requestC.updated_date, decision: 'reject',
    reason: 'Manager rejects unsupported employee time',
  });
  assert.equal(rejectC.status, 200, JSON.stringify(rejectC.body));
  const rejectCAudit = h.rows.TimeClockAudit.find((row) => row.id === rejectC.body.review_audit_id);
  assert.equal(requestC.status, 'rejected');
  assert.equal(entry.clock_in, '2026-09-28T12:15:00.000Z');

  const directDRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v28-reject-direct-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager independently verifies a different payroll time',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction D after rejecting C',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directD = await h.invoke(directDRequest);
  assert.equal(directD.status, 200, JSON.stringify(directD.body));
  assert.equal((await h.invoke(directDRequest)).status, 200);
  const directDAudit = h.rows.TimeClockAudit.find((row) => row.id === directD.body.audit_id);
  assert.ok(directDAudit?.id);
  assert.equal(entry.clock_in, '2026-09-28T12:30:00.000Z');

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-reject-direct-approve-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve direct correction D',
  })).status, 200);

  const finalizeD = await h.action('finalize', 'v28-reject-direct-finalize-d-001');
  assert.equal(finalizeD.status, 200, JSON.stringify(finalizeD.body));
  assert.equal((await h.action('finalize', 'v28-reject-direct-finalize-d-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentD = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentD.payroll_clock_in_at_finalization, '2026-09-28T12:30:00.000Z');
  assert.deepEqual(
    currentD.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [reviewB.body.audit_id, directDAudit.id],
  );
  assert.equal(
    currentD.payroll_correction_evidence.employee_correction_review_chain.some((row) =>
      row.correction_request_id === requestC.id ||
      row.submission_audit_id === submissionC.id ||
      row.review_audit_id === rejectCAudit.id
    ),
    false,
  );

  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const generationChange = period.finalized_summary.generation_changes[0];
  assert.equal(generationChange.time_entry_id, entry.id);
  assert.equal(generationChange.change_type, 'changed');
  assert.equal(generationChange.action_provenance.audit_id, directDAudit.id);
  assert.equal(generationChange.correction_provenance, undefined);

  const verified = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: 'v28-reject-direct-verify-001',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));
});

test('v28 later rejected employee request cannot displace prior direct correction in same reopened generation', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-direct-reject-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-direct-reject-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Direct then rejected request lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-direct-reject-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Supported generation B employee correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation B accepted correction',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-direct-reject-submit-b-001');

  const reviewB = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-direct-reject-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager verifies generation B correction',
  });
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-reject-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve generation B shift',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-direct-reject-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  assert.equal((await h.action(
    'reopen', 'v28-direct-reject-payroll-reopen-001',
    'Apply direct manager correction then review later employee request',
  )).status, 200);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-reject-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Reopen for direct correction',
  })).status, 200);

  const directCRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v28-direct-reject-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager independently verifies generation C payroll time',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction C',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directC = await h.invoke(directCRequest);
  assert.equal(directC.status, 200, JSON.stringify(directC.body));
  assert.equal((await h.invoke(directCRequest)).status, 200);
  const directCAudit = h.rows.TimeClockAudit.find((row) => row.id === directC.body.audit_id);
  assert.ok(directCAudit?.id);
  assert.equal(entry.clock_in, '2026-09-28T12:30:00.000Z');

  const submitD = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-direct-reject-submit-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Unsupported later employee request after direct correction C',
    requested_changes: {
      clock_in: '2026-09-28T12:50:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Unsupported later employee request D',
    },
  });
  assert.equal(submitD.status, 200, JSON.stringify(submitD.body));
  const requestD = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-direct-reject-submit-d-001');
  const submissionD = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestD.request_id
  );

  const rejectDPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-direct-reject-review-d-001', correction_request_id: requestD.id,
    expected_request_updated_date: requestD.updated_date, decision: 'reject',
    reason: 'Manager rejects unsupported later employee request',
  };
  const rejectD = await h.invoke(rejectDPayload);
  assert.equal(rejectD.status, 200, JSON.stringify(rejectD.body));
  assert.equal((await h.invoke(rejectDPayload)).status, 200);
  const rejectDAudit = h.rows.TimeClockAudit.find((row) => row.id === rejectD.body.review_audit_id);
  assert.equal(requestD.status, 'rejected');
  assert.equal(requestD.applied_audit_id, undefined);
  assert.equal(entry.clock_in, '2026-09-28T12:30:00.000Z');

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-reject-approve-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve direct correction C after rejecting D',
  })).status, 200);

  const finalizeC = await h.action('finalize', 'v28-direct-reject-finalize-c-001');
  assert.equal(finalizeC.status, 200, JSON.stringify(finalizeC.body));
  assert.equal((await h.action('finalize', 'v28-direct-reject-finalize-c-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentC = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentC.payroll_clock_in_at_finalization, '2026-09-28T12:30:00.000Z');
  assert.deepEqual(
    currentC.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [reviewB.body.audit_id, directCAudit.id],
  );
  assert.equal(
    currentC.payroll_correction_evidence.employee_correction_review_chain.some((row) =>
      row.correction_request_id === requestD.id ||
      row.submission_audit_id === submissionD.id ||
      row.review_audit_id === rejectDAudit.id
    ),
    false,
  );

  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const generationChange = period.finalized_summary.generation_changes[0];
  assert.equal(generationChange.time_entry_id, entry.id);
  assert.equal(generationChange.change_type, 'changed');
  assert.equal(generationChange.action_provenance.audit_id, directCAudit.id);
  assert.equal(generationChange.correction_provenance, undefined);

  const verified = await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: 'v28-direct-reject-verify-001',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));
});

async function exerciseV28MixedEmployeeManagerGenerations({ thirdGeneration = false, sameTimestampThirdGeneration = false }) {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-direct-employee-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-direct-employee-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Direct then employee-approved lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-direct-employee-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Supported generation B employee correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation B accepted correction',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-direct-employee-submit-b-001');
  const submissionB = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestB.request_id
  );

  const reviewB = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-direct-employee-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager verifies generation B correction',
  });
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));
  const reviewBAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.review_audit_id);
  const appliedB = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.audit_id);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-employee-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve generation B shift',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-direct-employee-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  assert.equal((await h.action(
    'reopen', 'v28-direct-employee-payroll-reopen-001',
    'Apply direct correction then review later employee request',
  )).status, 200);
  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-employee-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen for direct correction C',
  })).status, 200);

  const directCRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v28-direct-employee-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager independently verifies intermediate payroll time',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction C',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directC = await h.invoke(directCRequest);
  assert.equal(directC.status, 200, JSON.stringify(directC.body));
  assert.equal((await h.invoke(directCRequest)).status, 200);
  const directCAudit = h.rows.TimeClockAudit.find((row) => row.id === directC.body.audit_id);
  assert.ok(directCAudit?.id);

  const submitD = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-direct-employee-submit-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee requests later correction after direct C',
    requested_changes: {
      clock_in: '2026-09-28T12:40:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee request D after direct C',
    },
  });
  assert.equal(submitD.status, 200, JSON.stringify(submitD.body));
  const requestD = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-direct-employee-submit-d-001');
  const submissionD = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestD.request_id
  );

  const reviewDPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-direct-employee-review-d-001', correction_request_id: requestD.id,
    expected_request_updated_date: requestD.updated_date, decision: 'approve_modified',
    reason: 'Manager adjusts the employee request to verified final payroll time',
    correction: {
      clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Manager-approved modified D after direct C',
    },
  };
  const reviewD = await h.invoke(reviewDPayload);
  assert.equal(reviewD.status, 200, JSON.stringify(reviewD.body));
  assert.equal((await h.invoke(reviewDPayload)).status, 200);
  const reviewDAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewD.body.review_audit_id);
  const appliedD = h.rows.TimeClockAudit.find((row) => row.id === reviewD.body.audit_id);
  assert.equal(requestD.status, 'approved_modified');
  assert.equal(requestD.requested_changes.clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(entry.clock_in, '2026-09-28T12:45:00.000Z');

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-employee-approve-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve final employee-reviewed D',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-direct-employee-finalize-d-001')).status, 200);
  assert.equal((await h.action('finalize', 'v28-direct-employee-finalize-d-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentD = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentD.payroll_clock_in_at_finalization, '2026-09-28T12:45:00.000Z');
  assert.deepEqual(
    currentD.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [appliedB.id, directCAudit.id, appliedD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.correction_request_id),
    [requestB.id, requestD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.submission_audit_id),
    [submissionB.id, submissionD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.review_audit_id),
    [reviewBAudit.id, reviewDAudit.id],
  );

  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const generationChange = period.finalized_summary.generation_changes[0];
  assert.equal(generationChange.time_entry_id, entry.id);
  assert.equal(generationChange.change_type, 'changed');
  assert.equal(generationChange.correction_provenance.correction_request_id, requestD.id);
  assert.equal(generationChange.correction_provenance.applied_audit_id, appliedD.id);
  assert.equal(generationChange.correction_provenance.requested_clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(generationChange.correction_provenance.corrected_clock_in, '2026-09-28T12:45:00.000Z');
  assert.equal(generationChange.action_provenance, undefined);

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v28-direct-employee-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalIntermediateClock = directCAudit.details.corrected.clock_in;
  directCAudit.details.corrected.clock_in = '2026-09-28T12:31:00.000Z';
  const tampered = await verify('v28-direct-employee-tamper-c-001');
  assert.equal(tampered.status, 200, JSON.stringify(tampered.body));
  assert.equal(tampered.body.verified, false, JSON.stringify(tampered.body));
  directCAudit.details.corrected.clock_in = originalIntermediateClock;
  if (!thirdGeneration) return;

  // Direct manager corrections follow the employee-reviewed generation;
  // original employee submission and review evidence stays frozen in history.
  const generationBHistory = clone(period.finalized_summary_history[0]);
  const generationD = clone(period.finalized_summary);
  const ok = async (call) => {
    const result = await call;
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  if (!sameTimestampThirdGeneration) h.setServerNow('2026-09-28T20:01:00.000Z');
  await ok(h.action('reopen', 'v28-mixed-g3-reopen-period', 'Audit third-generation manager adjustments'));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-mixed-g3-reopen-shift', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Reopen for third-generation corrections',
  }));
  const direct = async (letter, clockIn, hours, minutes) => {
    const request = {
      action: 'admin_correct_entry', target_email: employee.email,
      request_id: 'v28-mixed-g3-' + letter, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason: 'Review third-generation ' + letter,
      correction: {
        clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0,
        notes: 'Manager adjustment ' + letter,
        job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
      },
    };
    const response = await ok(h.invoke(request));
    await ok(h.invoke(request));
    return h.rows.TimeClockAudit.find((row) => row.id === response.audit_id);
  };
  if (!sameTimestampThirdGeneration) h.setServerNow('2026-09-28T20:02:00.000Z');
  const auditE = await direct('e', '2026-09-28T12:55:00.000Z', 7, 5);
  if (!sameTimestampThirdGeneration) h.setServerNow('2026-09-28T20:03:00.000Z');
  const auditF = await direct('f', '2026-09-28T13:05:00.000Z', 6, 55);
  if (!sameTimestampThirdGeneration) h.setServerNow('2026-09-28T20:04:00.000Z');
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-mixed-g3-approve-f', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve terminal F',
  }));
  if (sameTimestampThirdGeneration) {
    // Ambiguous audit ordering must not permit an unverified payroll snapshot.
    const prior = clone(period.finalized_summary);
    const history = clone(period.finalized_summary_history);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const denied = await h.action('finalize', 'v28-mixed-g3-finalize-f');
      assert.equal(denied.status, 409, JSON.stringify(denied.body));
      assert.deepEqual(period.finalized_summary, prior);
      assert.deepEqual(period.finalized_summary_history, history);
    }
    return;
  }
  h.setServerNow('2026-09-28T20:05:00.000Z');
  await ok(h.action('finalize', 'v28-mixed-g3-finalize-f'));
  await ok(h.action('finalize', 'v28-mixed-g3-finalize-f'));
  assert.equal(period.finalized_summary_history.length, 2);
  assert.deepEqual(period.finalized_summary_history[0], generationBHistory);
  const retiredD = period.finalized_summary_history[1];
  assert.deepEqual(retiredD.shift_manifest, generationD.shift_manifest);
  assert.deepEqual(retiredD.generation_changes, generationD.generation_changes);
  assert.equal(retiredD.generation_changes_hash, generationD.generation_changes_hash);
  assert.equal(retiredD.snapshot_chain_hash, generationD.snapshot_chain_hash);
  const thirdChange = period.finalized_summary.generation_changes[0];
  assert.equal(period.finalized_summary.generation_changes.length, 1);
  assert.equal(thirdChange.action_provenance.audit_id, auditF.id);
  assert.equal(thirdChange.action_provenance.unique_direct_semantic_suffix, true);
  assert.equal(thirdChange.action_provenance.semantic_suffix_start_audit_id, auditE.id);
  assert.deepEqual(thirdChange.causal_chain.filter((row) => row.action === 'admin_correction')
    .map((row) => row.audit_id).slice(-2), [auditE.id, auditF.id]);
  const verifyG3 = async (request_id) => {
    const result = await verify(request_id);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const verifiedG3 = await verifyG3('v28-mixed-g3-verify-001');
  assert.equal(verifiedG3.verified, true, JSON.stringify(verifiedG3));
  assert.equal((await verifyG3('v28-mixed-g3-verify-001')).verified, true);

  const originalHash = reviewDAudit.details.review_payload_hash;
  assert.ok(originalHash);
  reviewDAudit.details.review_payload_hash = 'f'.repeat(64);
  assert.equal((await verifyG3('v28-mixed-g3-tamper-retired-review')).verified, false);
  reviewDAudit.details.review_payload_hash = originalHash;

  const originalSubmissionHash = submissionD.details?.payload_hash;
  assert.ok(originalSubmissionHash);
  submissionD.details.payload_hash = 'e'.repeat(64);
  assert.equal((await verifyG3('v28-mixed-g3-tamper-retired-submission')).verified, false);
  submissionD.details.payload_hash = originalSubmissionHash;

  const frozenProvenance = retiredD.generation_changes[0].correction_provenance;
  const savedAppliedAuditId = frozenProvenance.applied_audit_id;
  assert.equal(savedAppliedAuditId, appliedD.id);
  frozenProvenance.applied_audit_id = auditF.id;
  assert.equal((await verifyG3('v28-mixed-g3-tamper-frozen-applied-id')).verified, false);
  frozenProvenance.applied_audit_id = savedAppliedAuditId;

  assert.equal((await verifyG3('v28-mixed-g3-restored')).verified, true);
}

test('v28 later employee approve_modified supersedes prior direct correction in same reopened generation', async () => {
  await exerciseV28MixedEmployeeManagerGenerations({ thirdGeneration: false });
});

test('v28 mixed employee and manager corrections across three generations preserve retired approval evidence', async () => {
  await exerciseV28MixedEmployeeManagerGenerations({ thirdGeneration: true });
});

test('v28 mixed multi-generation corrections with indistinguishable timestamps remain fail-closed', async () => {
  await exerciseV28MixedEmployeeManagerGenerations({ thirdGeneration: true, sameTimestampThirdGeneration: true });
});

test('v28 later employee approve exact supersedes prior direct correction in same reopened generation', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-direct-exact-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-direct-exact-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Direct then exact employee approval lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-direct-exact-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Supported generation B employee correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation B accepted correction',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-direct-exact-submit-b-001');
  const submissionB = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestB.request_id
  );

  const reviewB = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-direct-exact-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager verifies generation B correction',
  });
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));
  const reviewBAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.review_audit_id);
  const appliedB = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.audit_id);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-exact-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve generation B shift',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-direct-exact-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  assert.equal((await h.action(
    'reopen', 'v28-direct-exact-payroll-reopen-001',
    'Apply direct correction then review exact employee request',
  )).status, 200);
  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-exact-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen for direct correction C',
  })).status, 200);

  const directCRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v28-direct-exact-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager independently verifies intermediate payroll time',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction C',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directC = await h.invoke(directCRequest);
  assert.equal(directC.status, 200, JSON.stringify(directC.body));
  assert.equal((await h.invoke(directCRequest)).status, 200);
  const directCAudit = h.rows.TimeClockAudit.find((row) => row.id === directC.body.audit_id);
  assert.ok(directCAudit?.id);
  assert.equal(entry.clock_in, '2026-09-28T12:30:00.000Z');

  const submitD = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-direct-exact-submit-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee requests exact final correction after direct C',
    requested_changes: {
      clock_in: '2026-09-28T12:40:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee exact request D after direct C',
    },
  });
  assert.equal(submitD.status, 200, JSON.stringify(submitD.body));
  const requestD = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-direct-exact-submit-d-001');
  const submissionD = h.rows.TimeClockAudit.find((row) =>
    row.action === 'correction_request' && row.request_id === requestD.request_id
  );

  const reviewDPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-direct-exact-review-d-001', correction_request_id: requestD.id,
    expected_request_updated_date: requestD.updated_date, decision: 'approve',
    reason: 'Manager verifies the employee final time exactly as submitted',
  };
  const reviewD = await h.invoke(reviewDPayload);
  assert.equal(reviewD.status, 200, JSON.stringify(reviewD.body));
  assert.equal((await h.invoke(reviewDPayload)).status, 200);
  const reviewDAudit = h.rows.TimeClockAudit.find((row) => row.id === reviewD.body.review_audit_id);
  const appliedD = h.rows.TimeClockAudit.find((row) => row.id === reviewD.body.audit_id);
  assert.equal(requestD.status, 'approved');
  assert.equal(requestD.review_decision, 'approve');
  assert.equal(requestD.requested_changes.clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(entry.clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(appliedD.details.corrected.clock_in, requestD.requested_changes.clock_in);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-direct-exact-approve-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve',
    note: 'Approve final exact employee-reviewed D',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-direct-exact-finalize-d-001')).status, 200);
  assert.equal((await h.action('finalize', 'v28-direct-exact-finalize-d-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentD = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentD.payroll_clock_in_at_finalization, '2026-09-28T12:40:00.000Z');
  assert.deepEqual(
    currentD.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [appliedB.id, directCAudit.id, appliedD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.correction_request_id),
    [requestB.id, requestD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.submission_audit_id),
    [submissionB.id, submissionD.id],
  );
  assert.deepEqual(
    currentD.payroll_correction_evidence.employee_correction_review_chain.map((row) => row.review_audit_id),
    [reviewBAudit.id, reviewDAudit.id],
  );

  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const generationChange = period.finalized_summary.generation_changes[0];
  assert.equal(generationChange.time_entry_id, entry.id);
  assert.equal(generationChange.change_type, 'changed');
  assert.equal(generationChange.correction_provenance.correction_request_id, requestD.id);
  assert.equal(generationChange.correction_provenance.review_decision, 'approve');
  assert.equal(generationChange.correction_provenance.applied_audit_id, appliedD.id);
  assert.equal(generationChange.correction_provenance.requested_clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(generationChange.correction_provenance.corrected_clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(generationChange.action_provenance, undefined);

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v28-direct-exact-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalIntermediateClock = directCAudit.details.corrected.clock_in;
  directCAudit.details.corrected.clock_in = '2026-09-28T12:31:00.000Z';
  const tampered = await verify('v28-direct-exact-tamper-c-001');
  assert.equal(tampered.status, 200, JSON.stringify(tampered.body));
  assert.equal(tampered.body.verified, false, JSON.stringify(tampered.body));
  directCAudit.details.corrected.clock_in = originalIntermediateClock;
});

test('v28 two direct corrections before later employee approve_modified preserve unique semantic suffix', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });

  const recovered = await h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-two-direct-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.body.entry.id);

  assert.equal((await h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-two-direct-clock-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    notes: 'Two direct corrections then employee review lineage validation',
  })).status, 200);

  const submitB = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-two-direct-submit-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Supported generation B employee correction',
    requested_changes: {
      clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Generation B accepted correction',
    },
  });
  assert.equal(submitB.status, 200, JSON.stringify(submitB.body));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-two-direct-submit-b-001');

  const reviewB = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-two-direct-review-b-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Manager verifies generation B correction',
  });
  assert.equal(reviewB.status, 200, JSON.stringify(reviewB.body));
  const appliedB = h.rows.TimeClockAudit.find((row) => row.id === reviewB.body.audit_id);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-two-direct-approve-b-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve generation B shift',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-two-direct-finalize-b-001')).status, 200);
  const generationB = clone(period.finalized_summary.shift_manifest[0].late_clock_in_provenance);

  assert.equal((await h.action(
    'reopen', 'v28-two-direct-payroll-reopen-001',
    'Apply two direct corrections before later employee review',
  )).status, 200);

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-two-direct-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen for direct corrections C and D',
  })).status, 200);

  const directCRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v28-two-direct-c-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager verifies first intermediate payroll time',
    correction: {
      clock_in: '2026-09-28T12:30:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction C',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directC = await h.invoke(directCRequest);
  assert.equal(directC.status, 200, JSON.stringify(directC.body));
  assert.equal((await h.invoke(directCRequest)).status, 200);
  const directCAudit = h.rows.TimeClockAudit.find((row) => row.id === directC.body.audit_id);
  assert.equal(entry.clock_in, '2026-09-28T12:30:00.000Z');

  const directDRequest = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v28-two-direct-d-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Manager verifies second intermediate payroll time',
    correction: {
      clock_in: '2026-09-28T12:35:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Direct manager correction D',
      job_allocations: [{ hours: 7, minutes: 25, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
    },
  };
  const directD = await h.invoke(directDRequest);
  assert.equal(directD.status, 200, JSON.stringify(directD.body));
  assert.equal((await h.invoke(directDRequest)).status, 200);
  const directDAudit = h.rows.TimeClockAudit.find((row) => row.id === directD.body.audit_id);
  assert.equal(entry.clock_in, '2026-09-28T12:35:00.000Z');

  const submitE = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-two-direct-submit-e-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Employee requests final correction after direct C and D',
    requested_changes: {
      clock_in: '2026-09-28T12:40:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Employee request E after two direct corrections',
    },
  });
  assert.equal(submitE.status, 200, JSON.stringify(submitE.body));
  const requestE = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-two-direct-submit-e-001');

  const reviewEPayload = {
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-two-direct-review-e-001', correction_request_id: requestE.id,
    expected_request_updated_date: requestE.updated_date, decision: 'approve_modified',
    reason: 'Manager adjusts employee request to verified final payroll time',
    correction: {
      clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Manager-approved modified E after C and D',
    },
  };
  const reviewE = await h.invoke(reviewEPayload);
  assert.equal(reviewE.status, 200, JSON.stringify(reviewE.body));
  assert.equal((await h.invoke(reviewEPayload)).status, 200);
  const appliedE = h.rows.TimeClockAudit.find((row) => row.id === reviewE.body.audit_id);
  assert.equal(entry.clock_in, '2026-09-28T12:45:00.000Z');

  assert.equal((await h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-two-direct-approve-e-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve final employee-reviewed E',
  })).status, 200);

  assert.equal((await h.action('finalize', 'v28-two-direct-finalize-e-001')).status, 200);
  assert.equal((await h.action('finalize', 'v28-two-direct-finalize-e-001')).status, 200);

  const retiredB = period.finalized_summary_history[0].shift_manifest[0].late_clock_in_provenance;
  const currentE = period.finalized_summary.shift_manifest[0].late_clock_in_provenance;
  assert.deepEqual(retiredB, generationB);
  assert.equal(currentE.payroll_clock_in_at_finalization, '2026-09-28T12:45:00.000Z');
  assert.deepEqual(
    currentE.payroll_correction_evidence.correction_chain.map((row) => row.audit_id),
    [appliedB.id, directCAudit.id, directDAudit.id, appliedE.id],
  );

  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const generationChange = period.finalized_summary.generation_changes[0];
  assert.equal(generationChange.change_type, 'changed');
  assert.equal(generationChange.correction_provenance.correction_request_id, requestE.id);
  assert.equal(generationChange.correction_provenance.applied_audit_id, appliedE.id);
  assert.equal(generationChange.correction_provenance.requested_clock_in, '2026-09-28T12:40:00.000Z');
  assert.equal(generationChange.correction_provenance.corrected_clock_in, '2026-09-28T12:45:00.000Z');

  const verify = (requestId) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id: requestId,
  });
  const verified = await verify('v28-two-direct-verify-001');
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true, JSON.stringify(verified.body));

  const originalC = directCAudit.details.corrected.clock_in;
  directCAudit.details.corrected.clock_in = '2026-09-28T12:31:00.000Z';
  const tamperedC = await verify('v28-two-direct-tamper-c-001');
  assert.equal(tamperedC.body.verified, false, JSON.stringify(tamperedC.body));
  directCAudit.details.corrected.clock_in = originalC;

  const originalD = directDAudit.details.corrected.clock_in;
  directDAudit.details.corrected.clock_in = '2026-09-28T12:36:00.000Z';
  const tamperedD = await verify('v28-two-direct-tamper-d-001');
  assert.equal(tamperedD.body.verified, false, JSON.stringify(tamperedD.body));
  directDAudit.details.corrected.clock_in = originalD;
});

async function exerciseV28AmbiguousCorrectionSuffix({ withDirectD }) {
  // Both B → C → B → D → E and B → C → B → E have two valid
  // generation-before → generation-after suffixes, including the direct-terminal case.
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });
  const ok = async (promise) => {
    const result = await promise;
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const recovered = await ok(h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'v28-amb-source-001', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  }));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.entry.id);
  await ok(h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email,
    request_id: 'v28-amb-out-001', lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
  }));
  await ok(h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-amb-b-submit-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Original arrival correction B',
    requested_changes: { clock_in: '2026-09-28T12:15:00.000Z', clock_out: entry.clock_out, lunch_minutes: 0 },
  }));
  const requestB = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-amb-b-submit-001');
  await ok(h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-amb-b-review-001', correction_request_id: requestB.id,
    expected_request_updated_date: requestB.updated_date, decision: 'approve',
    reason: 'Verified original payroll baseline B',
  }));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-amb-b-approve-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve B',
  }));
  await ok(h.action('finalize', 'v28-amb-b-finalize-001'));
  await ok(h.action('reopen', 'v28-amb-reopen-001', 'Review subsequent corrections'));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-amb-shift-reopen-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Allow audited corrections',
  }));

  const direct = async (letter, clockIn, hours, minutes) => {
    const result = await ok(h.invoke({
      action: 'admin_correct_entry', target_email: employee.email,
      request_id: 'v28-amb-direct-' + letter, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason: 'Manager verified intermediate time ' + letter,
      correction: {
        clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0,
        notes: 'Direct manager correction ' + letter,
        job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
      },
    }));
    return h.rows.TimeClockAudit.find((row) => row.id === result.audit_id);
  };
  const auditC = await direct('c', '2026-09-28T12:30:00.000Z', 7, 30);
  const auditReturnB = await direct('return-b', '2026-09-28T12:15:00.000Z', 7, 45);
  const auditD = withDirectD ? await direct('d', '2026-09-28T12:35:00.000Z', 7, 25) : null;

  await ok(h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v28-amb-e-submit-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Request final arrival time E',
    requested_changes: { clock_in: '2026-09-28T12:40:00.000Z', clock_out: entry.clock_out, lunch_minutes: 0 },
  }));
  const requestE = h.rows.TimeClockCorrectionRequest.find((row) => row.request_id === 'v28-amb-e-submit-001');
  const reviewedE = await ok(h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: 'v28-amb-e-review-001', correction_request_id: requestE.id,
    expected_request_updated_date: requestE.updated_date, decision: 'approve_modified',
    reason: 'Verified employee final time E',
    correction: { clock_in: '2026-09-28T12:45:00.000Z', clock_out: entry.clock_out, lunch_minutes: 0 },
  }));
  const auditE = h.rows.TimeClockAudit.find((row) => row.id === reviewedE.audit_id);
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-amb-e-approve-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve E',
  }));
  await ok(h.action('finalize', 'v28-amb-e-finalize-001'));

  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const change = period.finalized_summary.generation_changes[0];
  assert.equal(change.change_type, 'changed');
  assert.equal(change.correction_provenance.applied_audit_id, auditE.id);
  const correctionIds = change.causal_chain
    .filter((link) => link.action === 'admin_correction').map((link) => link.audit_id);
  const expectedIds = [auditC.id, auditReturnB.id, ...(auditD ? [auditD.id] : []), auditE.id];
  assert.deepEqual(correctionIds.slice(-expectedIds.length), expectedIds);
  const audits = correctionIds.map((id) => h.rows.TimeClockAudit.find((row) => row.id === id));
  const semantic = (value) =>
    [String(value?.clock_in || ''), String(value?.clock_out || ''), Number(value?.total_hours || 0)];
  // Confirm exactly two independently valid suffixes, not merely an unrelated
  // verifier failure such as missing audits or malformed causal-chain entries.
  const starts = [];
  for (let start = 0; start < audits.length; start += 1) {
    let state = semantic(change.before);
    let valid = true;
    for (let i = start; i < audits.length; i += 1) {
      const original = semantic(audits[i].details.original);
      if (original.some((part, j) => part !== state[j])) { valid = false; break; }
      state = semantic(audits[i].details.corrected);
    }
    if (valid && state.every((part, j) => part === semantic(change.after)[j])) starts.push(start);
  }
  assert.equal(starts.length, 2, 'fixture requires exactly two valid B-to-E suffixes');
  assert.ok(starts[0] < starts[1]);
  const verify = (request_id) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id,
  });
  const first = await ok(verify('v28-amb-verify-001'));
  assert.equal(first.verified, false, JSON.stringify(first));
  const retry = await ok(verify('v28-amb-verify-001'));
  assert.equal(retry.verified, false, JSON.stringify(retry));
}

test('v28 two complete semantic suffixes fail closed after correction returns to baseline', async () => {
  await exerciseV28AmbiguousCorrectionSuffix({ withDirectD: true });
});

test('v28 direct-terminal payroll delta cannot bypass dual semantic suffix rejection', async () => {
  await exerciseV28AmbiguousCorrectionSuffix({ withDirectD: false });
});

async function exerciseV28DirectManagerSemanticSuffix({ returnToBaseline, thirdGeneration = false }) {
  // All audits come from legitimate synthetic backend actions.
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const period = h.period();
  Object.assign(period, { start_date: '2026-09-28', end_date: '2026-09-28', status: 'review', last_request_id: '' });
  const prefix = returnToBaseline ? 'v28-mgr-amb' : 'v28-mgr-unique';
  const ok = async (call) => {
    const result = await call;
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const recovered = await ok(h.invokeAs(employee, {
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: prefix + '-source', claimed_clock_in: '2026-09-28T12:00:00.000Z',
  }));
  const entry = h.rows.TimeEntry.find((row) => row.id === recovered.entry.id);
  await ok(h.invokeAs(employee, {
    action: 'clock_out', target_email: employee.email, request_id: prefix + '-out',
    lunch_minutes: 0,
    job_allocations: [{ hours: 8, minutes: 0, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
  }));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: prefix + '-approve-b', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve B',
  }));
  await ok(h.action('finalize', prefix + '-finalize-b'));
  await ok(h.action('reopen', prefix + '-reopen-period', 'Review manager corrections'));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: prefix + '-reopen-shift', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Prepare corrections',
  }));
  const direct = async (letter, clockIn, hours, minutes) => {
    const request = {
      action: 'admin_correct_entry', target_email: employee.email,
      request_id: prefix + '-' + letter, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason: 'Manager verifies ' + letter,
      correction: {
        clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0,
        notes: 'Direct ' + letter,
        job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
      },
    };
    const result = await ok(h.invoke(request));
    assert.equal((await h.invoke(request)).status, 200, 'Exact retry must be idempotent');
    return h.rows.TimeClockAudit.find((row) => row.id === result.audit_id);
  };
  const auditC = await direct('c', '2026-09-28T12:30:00.000Z', 7, 30);
  const auditReturnB = returnToBaseline
    ? await direct('return-b', '2026-09-28T12:00:00.000Z', 8, 0)
    : null;
  const auditD = await direct('d', '2026-09-28T12:45:00.000Z', 7, 15);
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: prefix + '-approve-d', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve terminal D',
  }));
  // A unique manager correction chain must finalize and verify; an ambiguous
  // return-to-baseline chain must remain fail-closed.
  assert.equal(auditC.details.original.clock_in, '2026-09-28T12:00:00.000Z');
  assert.equal(auditC.details.corrected.clock_in, '2026-09-28T12:30:00.000Z');
  if (returnToBaseline) {
    assert.equal(auditReturnB.details.original.clock_in, '2026-09-28T12:30:00.000Z');
    assert.equal(auditReturnB.details.corrected.clock_in, '2026-09-28T12:00:00.000Z');
  }
  assert.equal(auditD.details.original.clock_in,
    returnToBaseline ? '2026-09-28T12:00:00.000Z' : '2026-09-28T12:30:00.000Z');
  assert.equal(auditD.details.corrected.clock_in, '2026-09-28T12:45:00.000Z');
  assert.equal(entry.clock_in, '2026-09-28T12:45:00.000Z');

  const frozenSummary = clone(period.finalized_summary);
  const frozenHistory = clone(period.finalized_summary_history);
  const beforeStatus = period.status;
  const attempt = () => h.action('finalize', prefix + '-finalize-d');
  if (returnToBaseline) {
    const blocked = await attempt();
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.equal(blocked.body.success, false);
    assert.deepEqual(period.finalized_summary, frozenSummary, 'Finalized payroll must not be replaced');
    assert.deepEqual(period.finalized_summary_history, frozenHistory, 'Historical generations must not change');
    assert.equal(period.status, beforeStatus, 'Blocked finalization must preserve pay-period state');
    const retry = await attempt();
    assert.equal(retry.status, 409, JSON.stringify(retry.body));
    assert.deepEqual(period.finalized_summary, frozenSummary);
    assert.deepEqual(period.finalized_summary_history, frozenHistory);
    return;
  }
  await ok(attempt());
  await ok(attempt());
  assert.equal(period.finalized_summary.generation_changes.length, 1);
  const change = period.finalized_summary.generation_changes[0];
  assert.equal(change.change_type, 'changed');
  assert.equal(change.action_provenance.audit_id, auditD.id);
  assert.equal(change.correction_provenance, undefined);
  assert.equal(change.action_provenance.unique_direct_semantic_suffix, true);
  const directIds = change.causal_chain.filter((link) => link.action === 'admin_correction')
    .map((link) => link.audit_id);
  assert.deepEqual(directIds.slice(-2), [auditC.id, auditD.id]);
  const historyVerify = (request_id) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id,
  });
  const verified = await ok(historyVerify(prefix + '-verify-001'));
  assert.equal(verified.verified, true, JSON.stringify(verified));
  const savedClock = auditC.details.corrected.clock_in;
  auditC.details.corrected.clock_in = '2026-09-28T12:31:00.000Z';
  const tampered = await ok(historyVerify(prefix + '-tampered-001'));
  assert.equal(tampered.verified, false, JSON.stringify(tampered));
  auditC.details.corrected.clock_in = savedClock;
  if (!thirdGeneration) return;

  // Preserve both older snapshots while a third payroll generation is formed
  // by another independently verified pair of direct manager corrections.
  const firstRetired = clone(period.finalized_summary_history[0]);
  const secondGeneration = clone(period.finalized_summary);
  await ok(h.action('reopen', prefix + '-reopen-third-period', 'Review third-generation corrections'));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: prefix + '-reopen-third-shift', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen',
    note: 'Third-generation audited corrections',
  }));
  const auditE = await direct('e', '2026-09-28T12:55:00.000Z', 7, 5);
  const auditF = await direct('f', '2026-09-28T13:05:00.000Z', 6, 55);
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: prefix + '-approve-f', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve terminal F',
  }));
  await ok(h.action('finalize', prefix + '-finalize-f'));
  await ok(h.action('finalize', prefix + '-finalize-f'));
  assert.equal(period.finalized_summary_history.length, 2);
  assert.deepEqual(period.finalized_summary_history[0], firstRetired,
    'First-generation frozen history must remain unchanged');
  const retiredSecond = period.finalized_summary_history[1];
  assert.deepEqual(retiredSecond.shift_manifest, secondGeneration.shift_manifest);
  assert.deepEqual(retiredSecond.generation_changes, secondGeneration.generation_changes);
  assert.equal(retiredSecond.generation_changes_hash, secondGeneration.generation_changes_hash);
  assert.equal(retiredSecond.snapshot_chain_hash, secondGeneration.snapshot_chain_hash);
  const thirdChange = period.finalized_summary.generation_changes[0];
  assert.equal(period.finalized_summary.generation_changes.length, 1);
  assert.equal(thirdChange.action_provenance.audit_id, auditF.id);
  assert.equal(thirdChange.action_provenance.unique_direct_semantic_suffix, true);
  assert.equal(thirdChange.action_provenance.semantic_suffix_start_audit_id, auditE.id);
  assert.deepEqual(thirdChange.causal_chain.filter((link) => link.action === 'admin_correction')
    .map((link) => link.audit_id).slice(-2), [auditE.id, auditF.id]);
  const thirdVerify = await ok(historyVerify(prefix + '-third-verify-001'));
  assert.equal(thirdVerify.verified, true, JSON.stringify(thirdVerify));
  const thirdRetry = await ok(historyVerify(prefix + '-third-verify-001'));
  assert.equal(thirdRetry.verified, true, JSON.stringify(thirdRetry));
  // An old correction from the retired second generation must still be
  // authenticated after the third generation has become active.
  auditC.details.corrected.clock_in = '2026-09-28T12:31:00.000Z';
  const tamperedRetired = await ok(historyVerify(prefix + '-third-tampered-retired-001'));
  assert.equal(tamperedRetired.verified, false, JSON.stringify(tamperedRetired));
  auditC.details.corrected.clock_in = savedClock;

  // The frozen second-generation suffix pointer itself is payroll evidence:
  // a later generation must not make an altered pointer appear trustworthy.
  const priorSuffix = retiredSecond.generation_changes[0].action_provenance;
  const savedStartId = priorSuffix.semantic_suffix_start_audit_id;
  assert.equal(savedStartId, auditC.id);
  priorSuffix.semantic_suffix_start_audit_id = auditF.id;
  const alteredFrozenStart = await ok(historyVerify(prefix + '-third-altered-frozen-start-001'));
  assert.equal(alteredFrozenStart.verified, false, JSON.stringify(alteredFrozenStart));
  priorSuffix.semantic_suffix_start_audit_id = savedStartId;

  const savedTerminalOriginal = auditF.details.original.clock_in;
  auditF.details.original.clock_in = '2026-09-28T12:56:00.000Z';
  const alteredCurrentTerminal = await ok(historyVerify(prefix + '-third-altered-terminal-001'));
  assert.equal(alteredCurrentTerminal.verified, false, JSON.stringify(alteredCurrentTerminal));
  auditF.details.original.clock_in = savedTerminalOriginal;
  const restored = await ok(historyVerify(prefix + '-third-restored-001'));
  assert.equal(restored.verified, true, JSON.stringify(restored));
}

test('v28 uniquely reconstructable multi-direct manager correction finalizes with auditable semantic suffix', async () => {
  await exerciseV28DirectManagerSemanticSuffix({ returnToBaseline: false });
});

test('v28 three generations preserve and verify retired direct-manager semantic suffix evidence', async () => {
  await exerciseV28DirectManagerSemanticSuffix({ returnToBaseline: false, thirdGeneration: true });
});

test('v28 manager-only return-to-baseline correction cannot bypass missed-punch provenance finalization gate', async () => {
  await exerciseV28DirectManagerSemanticSuffix({ returnToBaseline: true });
});

test('v28 manager-only ambiguous semantic suffix blocks payroll finalization for a normal server shift', async () => {
  // A normal (non-missed-punch) shift ensures the suffix ambiguity check,
  // rather than an unrelated missed-punch gate, rejects B→C→B→D.
  const h = setup({ entryCount: 1, serverNow: '2026-09-20T22:00:00.000Z' });
  const period = h.period();
  const entry = h.rows.TimeEntry[0];
  entry.approval_status = 'unreviewed';
  const ok = async (call) => {
    const result = await call;
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-normal-amb-approve-b', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve original B',
  }));
  await ok(h.action('finalize', 'v28-normal-amb-finalize-b'));
  await ok(h.action('reopen', 'v28-normal-amb-reopen-period', 'Review auditable direct corrections'));
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-normal-amb-reopen-shift', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen shift for corrections',
  }));
  const direct = async (letter, clockIn, hours, minutes) => {
    const request = {
      action: 'admin_correct_entry', target_email: employee.email,
      request_id: 'v28-normal-amb-' + letter, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason: 'Manager verifies ' + letter,
      correction: {
        clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0,
        notes: 'Direct ' + letter,
        job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
      },
    };
    const result = await ok(h.invoke(request));
    assert.equal((await h.invoke(request)).status, 200);
    return h.rows.TimeClockAudit.find((row) => row.id === result.audit_id);
  };
  const c = await direct('c', '2026-09-20T14:30:00.000Z', 7, 30);
  const backB = await direct('back-b', '2026-09-20T14:00:00.000Z', 8, 0);
  const d = await direct('d', '2026-09-20T14:45:00.000Z', 7, 15);
  assert.equal(c.details.original.clock_in, '2026-09-20T14:00:00.000Z');
  assert.equal(c.details.corrected.clock_in, backB.details.original.clock_in);
  assert.equal(backB.details.corrected.clock_in, d.details.original.clock_in);
  const normalized = (value) => [value?.clock_in || '', value?.clock_out || '', Number(value?.total_hours || 0)];
  const audits = [c, backB, d];
  const before = { clock_in: '2026-09-20T14:00:00.000Z', clock_out: entry.clock_out, total_hours: 8 };
  const after = { clock_in: entry.clock_in, clock_out: entry.clock_out, total_hours: entry.total_hours };
  let matchingSuffixes = 0;
  for (let start = 0; start < audits.length; start++) {
    let state = normalized(before);
    let matches = true;
    for (let index = start; index < audits.length; index++) {
      if (normalized(audits[index].details.original).some((value, j) => value !== state[j])) {
        matches = false;
        break;
      }
      state = normalized(audits[index].details.corrected);
    }
    if (matches && state.every((value, j) => value === normalized(after)[j])) matchingSuffixes++;
  }
  assert.equal(matchingSuffixes, 2, 'Fixture must contain two distinct valid suffixes');
  await ok(h.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'v28-normal-amb-approve-d', entry_id: entry.id,
    expected_updated_date: entry.updated_date, decision: 'approve', note: 'Review D',
  }));
  const summaryBefore = clone(period.finalized_summary);
  const historyBefore = clone(period.finalized_summary_history);
  const attempt = () => h.action('finalize', 'v28-normal-amb-finalize-d');
  for (let retry = 0; retry < 2; retry++) {
    const blocked = await attempt();
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.match(String(blocked.body.error || ''), /ambiguous direct-manager correction history/i);
    assert.deepEqual(period.finalized_summary, summaryBefore);
    assert.deepEqual(period.finalized_summary_history, historyBefore);
  }
});

async function exerciseV28OpaqueCorrectionOrdering({ includeDuplicates = false }) {
  for (const scenario of includeDuplicates
    ? ['duplicate-c', 'duplicate-d', 'conflicting-c', 'cross-entry-c']
    : ['ordered', 'tied']) {
    const tied = scenario === 'tied';
    const prefix = 'v28-opaque-' + scenario;
    const h = setup({
      entryCount: 1, serverNow: '2026-09-20T22:00:00.000Z',
      auditIdForRequest: (id) => id === prefix + '-c' ? prefix + '-z-first' :
        id === prefix + '-d' ? prefix + '-a-second' : null,
    });
    const entry = h.rows.TimeEntry[0];
    const period = h.period();
    entry.approval_status = 'unreviewed';
    const ok = async (promise) => {
      const result = await promise;
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    };
    await ok(h.invoke({
      action: 'admin_set_entry_approval', target_email: employee.email,
      request_id: prefix + '-approve-b', entry_id: entry.id,
      expected_updated_date: entry.updated_date, decision: 'approve', note: 'Original B',
    }));
    await ok(h.action('finalize', prefix + '-finalize-b'));
    h.setServerNow('2026-09-20T22:01:00.000Z');
    await ok(h.action('reopen', prefix + '-reopen-period', 'Audited manager corrections'));
    await ok(h.invoke({
      action: 'admin_set_entry_approval', target_email: employee.email,
      request_id: prefix + '-reopen-shift', entry_id: entry.id,
      expected_updated_date: entry.updated_date, decision: 'reopen', note: 'Reopen B',
    }));
    const direct = async (letter, clockIn, hours, minutes) => {
      const request = {
        action: 'admin_correct_entry', target_email: employee.email,
        request_id: prefix + '-' + letter, entry_id: entry.id,
        expected_updated_date: entry.updated_date, reason: 'Verify ' + letter,
        correction: {
          clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0,
          notes: 'Direct ' + letter,
          job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }],
        },
      };
      const result = await ok(h.invoke(request));
      await ok(h.invoke(request));
      const auditRows = h.rows.TimeClockAudit.filter((row) => row.request_id === request.request_id);
      assert.equal(auditRows.length, 1, 'Exact retry must not duplicate the correction');
      assert.equal(result.audit_id, auditRows[0].id);
      return auditRows[0];
    };
    h.setServerNow('2026-09-20T22:02:00.000Z');
    const c = await direct('c', '2026-09-20T14:30:00.000Z', 7, 30);
    if (!tied) h.setServerNow('2026-09-20T22:03:00.000Z');
    const d = await direct('d', '2026-09-20T14:45:00.000Z', 7, 15);
    assert.ok(c.id.localeCompare(d.id) > 0, 'IDs must sort opposite to actual correction sequence');
    assert.equal(c.server_timestamp === d.server_timestamp, tied);
    assert.equal(c.details.corrected.clock_in, d.details.original.clock_in);
    h.setServerNow('2026-09-20T22:04:00.000Z');
    await ok(h.invoke({
      action: 'admin_set_entry_approval', target_email: employee.email,
      request_id: prefix + '-approve-d', entry_id: entry.id,
      expected_updated_date: entry.updated_date, decision: 'approve', note: 'Approve D',
    }));
    if (includeDuplicates) {
      // Insert conflicting immutable evidence after manager review to test
      // finalization independently of the earlier approval protection.
      const source = scenario === 'duplicate-d' ? d : c;
      const duplicate = { ...clone(source), id: prefix + '-extra-confirmed' };
      if (scenario === 'cross-entry-c') {
        duplicate.time_entry_id = prefix + '-other-shift';
        duplicate.user_email = 'other-worker@synthetic.invalid';
      }
      if (scenario === 'conflicting-c') {
        duplicate.details.corrected.clock_in = '2026-09-20T14:31:00.000Z';
        duplicate.details.corrected.total_hours = 7.483333333333333;
      }
      h.rows.TimeClockAudit.push(duplicate);
      assert.equal(h.rows.TimeClockAudit.filter((row) => row.request_id === source.request_id).length, 2,
        'Fixture requires two confirmed rows with one exact request ID and timestamp');
      assert.equal(duplicate.server_timestamp, source.server_timestamp);
    }
    const previousSnapshot = clone(period.finalized_summary);
    const previousHistory = clone(period.finalized_summary_history);
    const previousStatus = period.status;
    h.setServerNow('2026-09-20T22:05:00.000Z');
    const finalize = () => h.action('finalize', prefix + '-finalize-d');
    if (tied || includeDuplicates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const denied = await finalize();
        assert.equal(denied.status, 409, JSON.stringify(denied.body));
        if (tied) assert.match(String(denied.body.error || ''), /ambiguous direct-manager correction history/i);
        assert.deepEqual(period.finalized_summary, previousSnapshot);
        assert.deepEqual(period.finalized_summary_history, previousHistory);
        assert.equal(period.status, previousStatus);
      }
      continue;
    }
    await ok(finalize());
    await ok(finalize());
    const change = period.finalized_summary.generation_changes[0];
    assert.equal(period.finalized_summary.generation_changes.length, 1);
    assert.equal(change.action_provenance.unique_direct_semantic_suffix, true);
    assert.equal(change.action_provenance.semantic_suffix_start_audit_id, c.id);
    assert.equal(change.action_provenance.audit_id, d.id);
    assert.deepEqual(change.causal_chain.filter((row) => row.action === 'admin_correction')
      .map((row) => row.audit_id), [c.id, d.id]);
    const verify = (request_id) => h.invoke({
      action: 'pay_period_history_verify', pay_period_id: period.id, request_id,
    });
    const checked = await ok(verify(prefix + '-verify'));
    assert.equal(checked.verified, true, JSON.stringify(checked));

    // A duplicate appearing after a valid snapshot must invalidate historical
    // verification, not silently rewrite any frozen payroll generation.
    const frozenCurrent = clone(period.finalized_summary);
    const frozenHistory = clone(period.finalized_summary_history);
    const duplicate = { ...clone(c), id: prefix + '-post-finalization-duplicate-c' };
    h.rows.TimeClockAudit.push(duplicate);
    assert.equal((await ok(verify(prefix + '-verify-post-duplicate'))).verified, false);
    assert.deepEqual(period.finalized_summary, frozenCurrent);
    assert.deepEqual(period.finalized_summary_history, frozenHistory);
    h.rows.TimeClockAudit.splice(h.rows.TimeClockAudit.indexOf(duplicate), 1);
    assert.equal((await ok(verify(prefix + '-verify-restored'))).verified, true);

    // The end boundary is intentionally exclusive for unknown new IDs.
    // A repeated confirmed request at that exact boundary must nevertheless
    // invalidate the frozen correction evidence rather than be ignored.
    const boundaryDuplicate = {
      ...clone(c), id: prefix + '-post-finalize-equal-time-duplicate',
      server_timestamp: String(period.finalized_summary.lock_timestamp || ''),
    };
    assert.ok(boundaryDuplicate.server_timestamp);
    h.rows.TimeClockAudit.push(boundaryDuplicate);
    const boundaryVerification = await ok(verify(prefix + '-verify-equal-finalize-boundary'));
    assert.equal(boundaryVerification.verified, false,
      'A repeated confirmed correction request at the finalization timestamp must not escape verification');
    assert.deepEqual(period.finalized_summary, frozenCurrent);
    assert.deepEqual(period.finalized_summary_history, frozenHistory);
    h.rows.TimeClockAudit.splice(h.rows.TimeClockAudit.indexOf(boundaryDuplicate), 1);
    assert.equal((await ok(verify(prefix + '-verify-boundary-restored'))).verified, true);

    // A confirmed admin_correction with the same idempotency request ID
    // must not be accepted as a different shift's unrelated audit.
    // Keep the duplicate at the exact lock boundary so ordinary generation
    // reconciliation does not accidentally detect it for a separate reason.
    const otherShiftDuplicate = {
      ...clone(c), id: prefix + '-other-shift-equal-finalize-duplicate',
      time_entry_id: prefix + '-foreign-shift',
      user_email: 'different-worker@synthetic.invalid',
      server_timestamp: String(period.finalized_summary.lock_timestamp || ''),
    };
    h.rows.TimeClockAudit.push(otherShiftDuplicate);
    const crossShift = await ok(verify(prefix + '-verify-cross-shift-request-collision'));
    assert.equal(crossShift.verified, false,
      'A confirmed correction request ID reused for another shift must invalidate frozen provenance');
    assert.deepEqual(period.finalized_summary, frozenCurrent);
    assert.deepEqual(period.finalized_summary_history, frozenHistory);
    h.rows.TimeClockAudit.splice(h.rows.TimeClockAudit.indexOf(otherShiftDuplicate), 1);
    assert.equal((await ok(verify(prefix + '-verify-cross-shift-restored'))).verified, true);

    // Reopening retires the finalized second generation. Its exact reopen
    // boundary must not hide a duplicate of an earlier frozen request.
    h.setServerNow('2026-09-20T22:06:00.000Z');
    await ok(h.action('reopen', prefix + '-reopen-third',
      'Verify historic correction evidence across reopen timestamp'));
    assert.equal(period.finalized_summary_history.length, 2);
    const retiredSecond = period.finalized_summary_history[1];
    const frozenReopenedHistory = clone(period.finalized_summary_history);
    assert.equal((await ok(verify(prefix + '-verify-retired-before-duplicate'))).verified, true);
    const reopenDuplicate = {
      ...clone(c), id: prefix + '-equal-reopen-boundary-duplicate',
      server_timestamp: String(retiredSecond.invalidated_at || ''),
    };
    assert.ok(reopenDuplicate.server_timestamp);
    h.rows.TimeClockAudit.push(reopenDuplicate);
    for (let retry = 0; retry < 2; retry += 1) {
      assert.equal((await ok(verify(prefix + '-verify-equal-reopen-boundary-' + retry))).verified, false);
      assert.deepEqual(period.finalized_summary_history, frozenReopenedHistory);
    }
    h.rows.TimeClockAudit.splice(h.rows.TimeClockAudit.indexOf(reopenDuplicate), 1);
    assert.equal((await ok(verify(prefix + '-verify-reopen-boundary-restored'))).verified, true);
  }
}

test('v28 direct correction ordering uses server time, never opaque IDs, and equal-time reversal fails closed', async () => {
  await exerciseV28OpaqueCorrectionOrdering({ includeDuplicates: false });
});

test('v28 duplicate or conflicting confirmed correction audits with same request and timestamp fail closed', async () => {
  await exerciseV28OpaqueCorrectionOrdering({ includeDuplicates: true });
});

test('v28 manager correction request IDs cannot be reused across shifts or employees', async () => {
  for (const differentEmployee of [false, true]) {
    const h = setup({ entryCount: 2, serverNow: '2026-09-22T21:00:00.000Z' });
    const [first, second] = h.rows.TimeEntry;
    const prefix = differentEmployee ? 'v28-cross-employee-request' : 'v28-cross-shift-request';
    second.clock_in = '2026-09-21T14:00:00.000Z';
    second.clock_out = '2026-09-21T22:00:00.000Z';
    if (differentEmployee) {
      const other = { id: 'synthetic-other-employee', email: 'other-worker@synthetic.invalid',
        full_name: 'Other Worker', role: 'employee' };
      h.rows.AuthorizedEmail.push(other);
      h.rows.TimeClockEmployeeState.push({
        id: 'state-' + other.id, user_email: other.email, status: 'clocked_out',
        break_status: 'working', work_pause_status: 'working', labor_status: 'idle',
        correction_create_status: 'idle', updated_date: '2026-09-20T00:00:00.000Z',
      });
      second.user_email = other.email;
    }
    const request_id = prefix + '-same-request';
    const correctionFor = (entry, clockIn, ownRequestId) => ({
      action: 'admin_correct_entry', target_email: entry.user_email,
      request_id: ownRequestId, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason: 'Manager confirmed original punch',
      correction: {
        clock_in: clockIn, clock_out: entry.clock_out, lunch_minutes: 0,
        notes: 'Manager synthetic adjustment',
        job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true,
          inhouse_task: 'Synthetic shop work' }],
      },
    });
    const firstRequest = correctionFor(first, '2026-09-20T14:30:00.000Z', request_id);
    const firstResult = await h.invoke(firstRequest);
    assert.equal(firstResult.status, 200, JSON.stringify(firstResult.body));
    assert.equal((await h.invoke(firstRequest)).status, 200, 'Exact same-entry retry remains idempotent');
    const savedOther = clone(second);
    const secondRequest = correctionFor(second, '2026-09-21T14:30:00.000Z', request_id);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const blocked = await h.invoke(secondRequest);
      assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
      assert.match(String(blocked.body.error || ''), /another employee or shift/i);
      assert.deepEqual(second, savedOther, 'Cross-entry request collision cannot change time');
      const confirmed = h.rows.TimeClockAudit.filter((row) =>
        row.action === 'admin_correction' && row.request_id === request_id);
      assert.equal(confirmed.length, 1, 'Cross-entry request collision cannot create a second audit');
      assert.equal(confirmed[0].time_entry_id, first.id);
    }
    const independent = correctionFor(second, '2026-09-21T14:30:00.000Z', prefix + '-new-request');
    const allowed = await h.invoke(independent);
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    assert.equal(second.clock_in, '2026-09-21T14:30:00.000Z');
  }
});

test('v29 company coordinator permits only one simultaneous cross-employee correction request owner', async () => {
  // Both employees acquire independent mutation locks before racing for the
  // single company-wide CAS. Exactly one may commit the shared request ID.
  const h = setup({ entryCount: 2, serverNow: '2026-09-22T21:00:00.000Z' });
  const [first, second] = h.rows.TimeEntry;
  first.approval_status = 'unreviewed';
  second.approval_status = 'unreviewed';
  const other = { id: 'synthetic-race-worker', email: 'race-worker@synthetic.invalid',
    full_name: 'Synthetic Race Worker', role: 'employee' };
  h.rows.AuthorizedEmail.push(other);
  h.rows.TimeClockEmployeeState.push({
    id: 'state-' + other.id, user_email: other.email, status: 'clocked_out',
    break_status: 'working', work_pause_status: 'working', labor_status: 'idle',
    correction_create_status: 'idle', updated_date: '2026-09-20T00:00:00.000Z',
  });
  second.user_email = other.email;
  second.clock_in = '2026-09-21T14:00:00.000Z';
  second.clock_out = '2026-09-21T22:00:00.000Z';
  const request_id = 'v28-race-shared-admin-request';
  let claimed = 0;
  let releaseBoth;
  const bothClaimed = new Promise((resolve) => { releaseBoth = resolve; });
  h.setAfterRowUpdate(async (name, _query, _update, row) => {
    if (name !== 'TimeClockEmployeeState' ||
        row.correction_create_status !== 'creating' ||
        row.correction_create_request_id !== request_id) return;
    claimed += 1;
    if (claimed === 2) releaseBoth();
    await Promise.race([
      bothClaimed,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error(
        'Race harness failed to reach two independent correction gates')), 3000)),
    ]);
  });
  const correct = (entry, clock_in) => h.invoke({
    action: 'admin_correct_entry', request_id, target_email: entry.user_email,
    entry_id: entry.id, expected_updated_date: entry.updated_date,
    reason: 'Synthetic concurrent admin correction',
    correction: { clock_in, clock_out: entry.clock_out, lunch_minutes: 0,
      notes: 'Race fixture', job_allocations: [
        { hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' },
      ] },
  });
  const [a, b] = await Promise.all([
    correct(first, '2026-09-20T14:30:00.000Z'),
    correct(second, '2026-09-21T14:30:00.000Z'),
  ]);
  assert.equal(claimed, 2, 'Both employees passed separate CAS locks');
  const successful = [a, b].filter((result) => result.status === 200);
  const persisted = h.rows.TimeClockAudit.filter((audit) =>
    audit.action === 'admin_correction' && audit.request_id === request_id &&
    ['confirmed', 'recovered'].includes(audit.outcome));
  assert.equal(successful.length, 1,
    'Company CAS must allow exactly one winner of an identical request ID');
  assert.equal([a, b].filter((result) => result.status === 409).length, 1);
  assert.equal(persisted.length, 1, 'No duplicate confirmed cross-employee audit may be created');
  assert.equal(first.clock_in === '2026-09-20T14:30:00.000Z',
    persisted[0].time_entry_id === first.id);
  assert.equal(second.clock_in === '2026-09-21T14:30:00.000Z',
    persisted[0].time_entry_id === second.id);
  assert.equal(h.rows.TimeClockAdminCorrectionGate[0].status, 'idle',
    'Completed winner must release company coordinator');
  // A rejected request must not poison unrelated payroll finalization.
  const managerApprovals = await Promise.all([first, second].map((entry, index) =>
    h.invoke({
      action: 'admin_set_entry_approval', target_email: entry.user_email,
      request_id: 'v28-race-approval-' + index, entry_id: entry.id,
      expected_updated_date: entry.updated_date, decision: 'approve',
      note: 'Investigate duplicate request provenance',
    })));
  assert.ok(managerApprovals.every((result) => [200, 409].includes(result.status)));
  const finalSnapshot = clone(h.period());
  const payrollResult = await h.action('finalize', 'v29-race-finalize-001');
  assert.equal(payrollResult.status, 200, JSON.stringify(payrollResult.body));
  assert.equal(h.period().status, 'finalized');
  assert.deepEqual(h.period().finalized_summary_history, finalSnapshot.finalized_summary_history);
  assert.equal((await h.invoke({
    action: 'pay_period_history_verify', pay_period_id: h.period().id,
    request_id: 'v29-race-history-verify',
  })).body.verified, true);
});

test('v28 first-generation payroll history rejects later cross-employee reuse of a frozen manager request', async () => {
  const h = setup({ entryCount: 2, serverNow: '2026-09-20T22:00:00.000Z' });
  const [first, second] = h.rows.TimeEntry;
  first.approval_status = 'unreviewed';
  second.approval_status = 'unreviewed';
  const period = h.period();
  const correctionId = 'v28-first-history-correction';
  const corrected = await h.invoke({
    action: 'admin_correct_entry', request_id: correctionId,
    target_email: first.user_email, entry_id: first.id,
    expected_updated_date: first.updated_date, reason: 'Verify original shift',
    correction: {
      clock_in: '2026-09-20T14:30:00.000Z',
      clock_out: first.clock_out, lunch_minutes: 0,
      notes: 'Synthetic first generation correction',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true,
        inhouse_task: 'Synthetic shop work' }],
    },
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  const approval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: first.user_email,
    request_id: 'v28-first-history-approve', entry_id: first.id,
    expected_updated_date: first.updated_date, decision: 'approve',
    note: 'Verified synthetic correction',
  });
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  const secondApproval = await h.invoke({
    action: 'admin_set_entry_approval', target_email: second.user_email,
    request_id: 'v28-first-history-approve-second', entry_id: second.id,
    expected_updated_date: second.updated_date, decision: 'approve',
    note: 'Approve unaffected synthetic shift independently',
  });
  assert.equal(secondApproval.status, 200, JSON.stringify(secondApproval.body));
  const finalized = await h.action('finalize', 'v28-first-history-finalize');
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  const verified = (request_id) => h.invoke({
    action: 'pay_period_history_verify', pay_period_id: period.id, request_id,
  });
  const before = await verified('v28-first-history-before');
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.verified, true, JSON.stringify(before.body));
  const immutableSnapshot = clone(period.finalized_summary);
  const original = h.rows.TimeClockAudit.find((row) =>
    row.action === 'admin_correction' && row.request_id === correctionId);
  assert.ok(original?.id);
  const collision = { ...clone(original),
    id: 'v28-first-history-foreign-confirmed-duplicate',
    time_entry_id: second.id,
    server_timestamp: String(period.finalized_summary.lock_timestamp),
  };
  h.rows.TimeClockAudit.push(collision);
  const rejected = await verified('v28-first-history-cross-entry-collision');
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.verified, false, JSON.stringify(rejected.body));
  assert.deepEqual(period.finalized_summary, immutableSnapshot);
  h.rows.TimeClockAudit.splice(h.rows.TimeClockAudit.indexOf(collision), 1);
  const restored = await verified('v28-first-history-restored');
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.verified, true, JSON.stringify(restored.body));
});

test('v29 manager correction coordinator fails closed when missing, duplicated, or uncertain', async () => {
  for (const mode of ['missing', 'duplicate', 'dirty-idle', 'unsettled']) {
    const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
    const entry = h.rows.TimeEntry[0];
    const gate = h.rows.TimeClockAdminCorrectionGate[0];
    if (mode === 'missing') h.rows.TimeClockAdminCorrectionGate = [];
    if (mode === 'duplicate') h.rows.TimeClockAdminCorrectionGate.push({ ...clone(gate), id: 'unexpected-second-company-coordinator' });
    if (mode === 'dirty-idle') gate.request_id = 'stale-idle-request';
    if (mode === 'unsettled') {
      Object.assign(gate, { status: 'creating', request_id: 'old-uncertain-request',
        time_entry_id: entry.id, payload_hash: 'synthetic-held-hash',
        claim_token: 'synthetic-held-claim', started_at: '2026-09-22T20:00:00.000Z' });
      h.rows.TimeClockAudit.push({
        id: 'synthetic-unsettled-audit', action: 'admin_correction', outcome: 'pending',
        request_id: gate.request_id, time_entry_id: entry.id, user_email: entry.user_email,
        server_timestamp: '2026-09-22T20:00:00.000Z',
        details: { payload_hash: gate.payload_hash },
      });
    }
    const before = clone(entry);
    const response = await h.invoke({
      action: 'admin_correct_entry', target_email: entry.user_email,
      request_id: 'v29-coordinator-fails-closed-' + mode, entry_id: entry.id,
      expected_updated_date: entry.updated_date, reason: 'Synthetic coordinator inspection',
      correction: { clock_in: '2026-09-20T14:30:00.000Z', clock_out: entry.clock_out,
        lunch_minutes: 0, notes: 'Coordinator negative fixture',
        job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true, inhouse_task: 'Synthetic shop work' }] },
    });
    assert.equal(response.status, 409, mode + ' ' + JSON.stringify(response.body));
    assert.deepEqual(entry, before, mode + ' cannot modify payroll time');
    assert.equal(h.rows.TimeClockAudit.filter((audit) =>
      audit.request_id === 'v29-coordinator-fails-closed-' + mode).length, 0);
    assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === entry.user_email)
      .correction_create_status, 'idle');
  }
});

test('v29 abandoned settled correction coordinator recovers from authoritative evidence', async () => {
  const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
  const entry = h.rows.TimeEntry[0];
  const correction = (id, clock_in, hours, minutes) => h.invoke({
    action: 'admin_correct_entry', target_email: entry.user_email,
    request_id: id, entry_id: entry.id, expected_updated_date: entry.updated_date,
    reason: 'Manager validates synthetic correction ' + id,
    correction: { clock_in, clock_out: entry.clock_out, lunch_minutes: 0,
      notes: 'Coordinator recovery case', job_allocations: [
        { hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }] },
  });
  const firstId = 'v29-recovery-first';
  const first = await correction(firstId, '2026-09-20T14:30:00.000Z', 7, 30);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const audit = h.rows.TimeClockAudit.find((row) => row.request_id === firstId && row.action === 'admin_correction');
  assert.equal(audit.outcome, 'confirmed');
  const gate = h.rows.TimeClockAdminCorrectionGate[0];
  assert.equal(gate.status, 'idle');
  Object.assign(gate, { status: 'creating', request_id: firstId,
    time_entry_id: entry.id, payload_hash: audit.details.payload_hash,
    claim_token: 'synthetic-lost-release-ack', started_at: '2026-09-22T20:00:00.000Z' });
  assert.equal(entry.last_correction_request_id, firstId);
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === entry.user_email)
    ?.correction_create_status, 'idle');
  assert.equal(h.rows.TimeClockAudit.filter((row) =>
    row.action === 'admin_correction' && row.request_id === firstId).length, 1);
  const next = await correction('v29-recovery-followup', '2026-09-20T14:45:00.000Z', 7, 15);
  assert.equal(next.status, 200, JSON.stringify(next.body));
  assert.equal(gate.status, 'idle');
  assert.equal(gate.request_id, '');
  assert.equal(entry.clock_in, '2026-09-20T14:45:00.000Z');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' &&
    ['confirmed', 'recovered'].includes(row.outcome)).length, 2);
});

test('v29 independent employees can retry distinct manager corrections after company CAS contention', async () => {
  const h = setup({ entryCount: 2, serverNow: '2026-09-22T21:00:00.000Z' });
  const [first, second] = h.rows.TimeEntry;
  const other = { id: 'synthetic-parallel-other', email: 'parallel-worker@synthetic.invalid',
    full_name: 'Parallel Worker', role: 'employee' };
  h.rows.AuthorizedEmail.push(other);
  h.rows.TimeClockEmployeeState.push({ id: 'state-' + other.id,
    user_email: other.email, status: 'clocked_out', break_status: 'working',
    work_pause_status: 'working', labor_status: 'idle',
    correction_create_status: 'idle', updated_date: '2026-09-20T00:00:00.000Z' });
  second.user_email = other.email;
  second.clock_in = '2026-09-21T14:00:00.000Z';
  second.clock_out = '2026-09-21T22:00:00.000Z';
  const correct = (entry, id, time) => h.invoke({
    action: 'admin_correct_entry', target_email: entry.user_email, request_id: id,
    entry_id: entry.id, expected_updated_date: entry.updated_date,
    reason: 'Synthetic parallel independent manager correction',
    correction: { clock_in: time, clock_out: entry.clock_out, lunch_minutes: 0,
      notes: 'Independent worker edit',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true,
        inhouse_task: 'Synthetic shop work' }] },
  });
  let signalClaimed;
  const claimed = new Promise((resolve) => { signalClaimed = resolve; });
  let finishFirst;
  const released = new Promise((resolve) => { finishFirst = resolve; });
  h.setAfterRowUpdate(async (entity, _query, _update, row) => {
    if (entity !== 'TimeClockAdminCorrectionGate' || row.status !== 'creating' ||
        row.request_id !== 'v29-independent-a') return;
    signalClaimed();
    await Promise.race([
      released,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error(
        'Synthetic independent correction contention did not release')), 4000)),
    ]);
  });
  const initial = correct(first, 'v29-independent-a', '2026-09-20T14:30:00.000Z');
  await claimed;
  const blocked = await correct(second, 'v29-independent-b', '2026-09-21T14:30:00.000Z');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(second.clock_in, '2026-09-21T14:00:00.000Z');
  assert.equal(h.rows.TimeClockAudit.some((row) => row.request_id === 'v29-independent-b'), false);
  finishFirst();
  const firstResult = await initial;
  assert.equal(firstResult.status, 200, JSON.stringify(firstResult.body));
  h.setAfterRowUpdate(null);
  const retry = await correct(second, 'v29-independent-b', '2026-09-21T14:30:00.000Z');
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(second.clock_in, '2026-09-21T14:30:00.000Z');
  assert.equal(h.rows.TimeClockAdminCorrectionGate[0].status, 'idle');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' &&
    ['confirmed', 'recovered'].includes(row.outcome)).length, 2);
});

test('v29 abandoned company coordinator does not trust missing or mismatched settled audits', async () => {
  for (const fault of ['missing-audit', 'wrong-hash', 'wrong-owner', 'wrong-corrected-clock']) {
    const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
    const entry = h.rows.TimeEntry[0];
    const correction = (id, clockIn, hours, minutes) => h.invoke({
      action: 'admin_correct_entry', target_email: entry.user_email, request_id: id,
      entry_id: entry.id, expected_updated_date: entry.updated_date,
      reason: 'Audited coordinator evidence fixture',
      correction: { clock_in: clockIn, clock_out: entry.clock_out,
        lunch_minutes: 0, notes: 'Coordinator evidence fixture',
        job_allocations: [{ hours, minutes, is_inhouse: true, inhouse_task: 'Synthetic shop work' }] },
    });
    const oldRequestId = 'v29-evidence-first-' + fault;
    const globalGate = h.rows.TimeClockAdminCorrectionGate[0];
    if (fault === 'missing-audit') {
      // No audit means the interrupted operation has no authoritative
      // resolution evidence; do not assume absence proves it never wrote.
      Object.assign(globalGate, { status: 'creating', request_id: oldRequestId,
        time_entry_id: entry.id, payload_hash: 'unknown-pre-write-intent-hash',
        claim_token: 'synthetic-uncertain-no-audit', started_at: '2026-09-22T20:00:00.000Z' });
    } else {
      const first = await correction(oldRequestId, '2026-09-20T14:30:00.000Z', 7, 30);
      assert.equal(first.status, 200, fault + JSON.stringify(first.body));
      const oldAudit = h.rows.TimeClockAudit.find((audit) => audit.request_id === oldRequestId);
      assert.ok(oldAudit?.id);
      Object.assign(globalGate, { status: 'creating', request_id: oldRequestId,
        time_entry_id: entry.id, payload_hash: oldAudit.details.payload_hash,
        claim_token: 'synthetic-completed-ack-lost', started_at: '2026-09-22T20:00:00.000Z' });
      if (fault === 'wrong-hash') oldAudit.details.payload_hash = 'mismatched-hash';
      if (fault === 'wrong-owner') oldAudit.user_email = 'different-employee@synthetic.invalid';
      if (fault === 'wrong-corrected-clock') oldAudit.details.corrected.clock_in = '2026-09-20T15:30:00.000Z';
    }
    const before = clone(entry);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await correction('v29-evidence-next-' + fault, '2026-09-20T14:45:00.000Z', 7, 15);
      assert.equal(result.status, 409, fault + JSON.stringify(result.body));
      assert.match(String(result.body.error || ''), /coordinator|uncertain|investigation/i);
      assert.deepEqual(entry, before, fault + ' cannot change time on ambiguous recovery');
      assert.equal(globalGate.status, 'creating');
      assert.equal(globalGate.request_id, oldRequestId);
      assert.equal(h.rows.TimeClockAudit.some((audit) => audit.request_id === 'v29-evidence-next-' + fault), false);
    }
  }
});

test('v29 rejected entry CAS preserves correction audit binding and releases coordinator', async () => {
  const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
  const entry = h.rows.TimeEntry[0];
  const requestId = 'v29-entry-race-blocked';
  const clockInBefore = entry.clock_in;
  let interfered = false;
  h.setBeforeUpdate((entity, _query, update) => {
    if (entity === 'TimeEntry' && !interfered &&
        update.$set?.clock_source === 'admin_correction') {
      interfered = true;
      entry.updated_date = '2026-09-22T21:01:00.000Z';
    }
  });
  const requested = await h.invoke({
    action: 'admin_correct_entry', target_email: entry.user_email, request_id: requestId,
    entry_id: entry.id, expected_updated_date: '2026-09-20T00:00:00.000Z',
    reason: 'Reject stale synthetic edit with a retained audit hash',
    correction: { clock_in: '2026-09-20T14:30:00.000Z',
      clock_out: entry.clock_out, lunch_minutes: 0, notes: 'Stale write fixture',
      job_allocations: [{ hours: 7, minutes: 30, is_inhouse: true,
        inhouse_task: 'Synthetic shop work' }] },
  });
  assert.equal(interfered, true, 'Fixture must race after the company CAS claim');
  assert.equal(requested.status, 409, JSON.stringify(requested.body));
  assert.equal(entry.clock_in, clockInBefore, 'Failed correction must preserve time');
  const audit = h.rows.TimeClockAudit.find((row) => row.request_id === requestId &&
    row.action === 'admin_correction');
  assert.ok(audit?.id);
  assert.equal(audit.outcome, 'blocked');
  assert.ok(audit.details?.payload_hash,
    'Blocked audit must retain immutable request payload binding');
  assert.equal(h.rows.TimeClockAdminCorrectionGate[0].status, 'idle',
    'Confirmed failed CAS cannot strand company coordinator');
  h.setBeforeUpdate(null);
  const retryWithNewId = await h.invoke({
    action: 'admin_correct_entry', target_email: entry.user_email,
    request_id: 'v29-entry-race-fresh', entry_id: entry.id,
    expected_updated_date: entry.updated_date,
    reason: 'Fresh independently audited correction after failed CAS',
    correction: { clock_in: '2026-09-20T14:45:00.000Z',
      clock_out: entry.clock_out, lunch_minutes: 0, notes: 'Fresh corrected edit',
      job_allocations: [{ hours: 7, minutes: 15, is_inhouse: true,
        inhouse_task: 'Synthetic shop work' }] },
  });
  assert.equal(retryWithNewId.status, 200, JSON.stringify(retryWithNewId.body));
  assert.equal(entry.clock_in, '2026-09-20T14:45:00.000Z');
});

test('v29 reviewed employee correction refuses a manager audit request ID already owned by another shift', async () => {
  const h = setup({ entryCount: 2, serverNow: '2026-09-22T21:00:00.000Z' });
  const [first, second] = h.rows.TimeEntry;
  const secondEmployee = { id: 'synthetic-reviewed-other', email: 'reviewed-other@synthetic.invalid',
    full_name: 'Reviewed Other', role: 'employee' };
  h.rows.AuthorizedEmail.push(secondEmployee);
  h.rows.TimeClockEmployeeState.push({ id: 'state-' + secondEmployee.id,
    user_email: secondEmployee.email, status: 'clocked_out',
    break_status: 'working', work_pause_status: 'working',
    labor_status: 'idle', correction_create_status: 'idle',
    updated_date: '2026-09-20T00:00:00.000Z' });
  second.user_email = secondEmployee.email;
  second.clock_in = '2026-09-21T14:00:00.000Z';
  second.clock_out = '2026-09-21T22:00:00.000Z';
  const submit = (person, entry, suffix, targetClock) => h.invokeAs(person, {
    action: 'submit_correction_request', target_email: person.email,
    request_id: 'v29-review-global-submit-' + suffix,
    entry_id: entry.id, expected_updated_date: entry.updated_date,
    reason: 'Employee corrects a synthetic shift clock in',
    requested_changes: { clock_in: targetClock, clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Synthetic correction identity test' },
  });
  const firstSubmission = await submit(employee, first, 'first', '2026-09-20T14:30:00.000Z');
  assert.equal(firstSubmission.status, 200, JSON.stringify(firstSubmission.body));
  const secondSubmission = await submit(secondEmployee, second, 'second', '2026-09-21T14:30:00.000Z');
  assert.equal(secondSubmission.status, 200, JSON.stringify(secondSubmission.body));
  const firstRequest = h.rows.TimeClockCorrectionRequest.find((row) => row.time_entry_id === first.id);
  const secondRequest = h.rows.TimeClockCorrectionRequest.find((row) => row.time_entry_id === second.id);
  assert.ok(firstRequest?.id && secondRequest?.id);
  const sharedReviewId = 'v29-global-reviewed-shared-id';
  const review = (person, request, reviewId) => h.invoke({
    action: 'review_correction_request', target_email: person.email,
    correction_request_id: request.id, expected_request_updated_date: request.updated_date,
    request_id: reviewId, decision: 'approve',
    reason: 'Manager approves verified synthetic employee correction',
  });
  const firstReview = await review(employee, firstRequest, sharedReviewId);
  assert.equal(firstReview.status, 200, JSON.stringify(firstReview.body));
  const secondBefore = clone(second);
  const secondReview = await review(secondEmployee, secondRequest, sharedReviewId);
  assert.equal(secondReview.status, 409, JSON.stringify(secondReview.body));
  assert.match(String(secondReview.body.error || ''), /another|conflict|request id|audit|investigation/i);
  assert.equal(second.clock_in, secondBefore.clock_in,
    'Conflicting second review must not alter another employee time');
  assert.equal(h.rows.TimeClockAudit.filter((row) =>
    row.action === 'admin_correction' && row.request_id === sharedReviewId).length, 1,
    'No cross-employee duplicate confirmed correction audit');
  const refreshedRequest = h.rows.TimeClockCorrectionRequest.find((row) => row.id === secondRequest.id);
  assert.equal(refreshedRequest.status, 'pending',
    'A foreign manager-review ID must not claim or finalize this employee correction');
  const rejectedWithForeignId = await h.invoke({
    action: 'review_correction_request', target_email: secondEmployee.email,
    correction_request_id: refreshedRequest.id,
    expected_request_updated_date: refreshedRequest.updated_date,
    request_id: sharedReviewId, decision: 'reject',
    reason: 'Synthetic rejected review reuses a foreign manager identity',
  });
  assert.equal(rejectedWithForeignId.status, 409, JSON.stringify(rejectedWithForeignId.body));
  assert.equal(refreshedRequest.status, 'pending');
  assert.equal(second.clock_in, secondBefore.clock_in);
  const unrelatedReview = await review(secondEmployee, refreshedRequest, 'v29-global-reviewed-unique-second');
  assert.equal(unrelatedReview.status, 200, JSON.stringify(unrelatedReview.body));
  assert.equal(second.clock_in, '2026-09-21T14:30:00.000Z');
});

test('v29 concurrent cross-employee review IDs have exactly one authoritative winner', async () => {
  const h = setup({ entryCount: 2, serverNow: '2026-09-22T21:00:00.000Z' });
  const [first, second] = h.rows.TimeEntry;
  const other = { id: 'review-race-other', email: 'review-race@synthetic.invalid',
    full_name: 'Review Race Worker', role: 'employee' };
  h.rows.AuthorizedEmail.push(other);
  h.rows.TimeClockEmployeeState.push({ id: 'state-' + other.id,
    user_email: other.email, status: 'clocked_out', break_status: 'working',
    work_pause_status: 'working', labor_status: 'idle',
    correction_create_status: 'idle', updated_date: '2026-09-20T00:00:00.000Z' });
  second.user_email = other.email;
  second.clock_in = '2026-09-21T14:00:00.000Z';
  second.clock_out = '2026-09-21T22:00:00.000Z';
  const submit = (person, entry, suffix, desired) => h.invokeAs(person, {
    action: 'submit_correction_request', target_email: person.email,
    request_id: 'v29-race-submit-' + suffix, entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Synthetic correction review race',
    requested_changes: { clock_in: desired, clock_out: entry.clock_out,
      lunch_minutes: 0, notes: 'Synthetic review CAS' },
  });
  const [firstSubmit, secondSubmit] = await Promise.all([
    submit(employee, first, 'a', '2026-09-20T14:30:00.000Z'),
    submit(other, second, 'b', '2026-09-21T14:30:00.000Z'),
  ]);
  assert.equal(firstSubmit.status, 200, JSON.stringify(firstSubmit.body));
  assert.equal(secondSubmit.status, 200, JSON.stringify(secondSubmit.body));
  const [firstReq, secondReq] = [first, second].map((entry) =>
    h.rows.TimeClockCorrectionRequest.find((row) => row.time_entry_id === entry.id));
  assert.ok(firstReq?.id && secondReq?.id);
  const shared = 'v29-concurrent-manager-review-identity';
  let firstClaimed;
  const firstHasGate = new Promise((resolve) => { firstClaimed = resolve; });
  let releaseFirst;
  const allowFirstToProceed = new Promise((resolve) => { releaseFirst = resolve; });
  let claims = 0;
  h.setAfterRowUpdate(async (entity, _query, update, row) => {
    if (entity !== 'TimeClockAdminCorrectionGate' || update.$set?.status !== 'creating' ||
        row.request_id !== shared) return;
    claims += 1;
    firstClaimed();
    await Promise.race([allowFirstToProceed,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error(
        'Synthetic held company coordinator did not get released')), 3500))]);
  });
  const review = (person, correction) => h.invoke({
    action: 'review_correction_request', request_id: shared, target_email: person.email,
    correction_request_id: correction.id,
    expected_request_updated_date: correction.updated_date,
    decision: 'approve', reason: 'Manager confirms synthetic correction',
  });
  const initial = review(employee, firstReq);
  await firstHasGate;
  const competing = await review(other, secondReq);
  assert.equal(competing.status, 409, JSON.stringify(competing.body));
  releaseFirst();
  const winner = await initial;
  assert.equal(winner.status, 200, JSON.stringify(winner.body));
  assert.equal(claims, 1, 'Only one company coordinator claim may be active');
  const responses = [winner, competing];
  const audits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'admin_correction' && row.request_id === shared &&
    ['confirmed', 'recovered'].includes(row.outcome));
  assert.equal(audits.length, 1, 'Cross-employee review cannot produce duplicate correction audits');
  const settledCount = [firstReq, secondReq].filter((row) =>
    h.rows.TimeClockCorrectionRequest.find((r) => r.id === row.id)?.status === 'approved').length;
  assert.equal(settledCount, 1);
});

test('v29 manager review company coordinator blocks missing, duplicated, and held setup', async () => {
  for (const mode of ['missing', 'duplicate', 'held']) {
    const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
    const entry = h.rows.TimeEntry[0];
    const submitted = await h.invokeAs(employee, {
      action: 'submit_correction_request', target_email: employee.email,
      request_id: 'v29-review-setup-submit-' + mode, entry_id: entry.id,
      expected_updated_date: entry.updated_date,
      reason: 'Synthetic manager review CAS setup',
      requested_changes: { clock_in: '2026-09-20T14:30:00.000Z',
        clock_out: entry.clock_out, lunch_minutes: 0,
        notes: 'Review coordinator test' },
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const correction = h.rows.TimeClockCorrectionRequest[0];
    const gate = h.rows.TimeClockAdminCorrectionGate[0];
    if (mode === 'missing') h.rows.TimeClockAdminCorrectionGate = [];
    if (mode === 'duplicate') h.rows.TimeClockAdminCorrectionGate.push({
      ...clone(gate), id: 'synthetic-extra-manager-coordinator' });
    if (mode === 'held') Object.assign(gate, {
      status: 'creating', request_id: 'unsettled-prior-review',
      time_entry_id: 'review:unsettled-prior-correction',
      payload_hash: 'unsettled-review-hash', claim_token: 'unsettled-review-token',
      started_at: '2026-09-22T20:00:00.000Z' });
    const entryBefore = clone(entry);
    const review = await h.invoke({
      action: 'review_correction_request', target_email: employee.email,
      request_id: 'v29-review-setup-manager-' + mode,
      correction_request_id: correction.id,
      expected_request_updated_date: correction.updated_date,
      decision: 'reject', reason: 'Synthetic reviewer rejects this time change',
    });
    assert.equal(review.status, 409, mode + JSON.stringify(review.body));
    assert.equal(correction.status, 'pending');
    assert.deepEqual(entry, entryBefore);
    assert.equal(h.rows.TimeClockAudit.filter((audit) =>
      audit.action === 'correction_review' &&
      audit.request_id === 'v29-review-setup-manager-' + mode).length, 0);
  }
});

test('v29 completed manager review recovers a lost company coordinator release', async () => {
  const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
  const entry = h.rows.TimeEntry[0];
  const submission = await h.invokeAs(employee, {
    action: 'submit_correction_request', target_email: employee.email,
    request_id: 'v29-review-recovery-submit', entry_id: entry.id,
    expected_updated_date: entry.updated_date,
    reason: 'Synthetic correction for manager release recovery',
    requested_changes: { clock_in: '2026-09-20T14:30:00.000Z',
      clock_out: entry.clock_out, lunch_minutes: 0, notes: 'Recovered reviewer evidence' },
  });
  assert.equal(submission.status, 200, JSON.stringify(submission.body));
  const correction = h.rows.TimeClockCorrectionRequest[0];
  const reviewId = 'v29-review-recovery-decision';
  const approved = await h.invoke({
    action: 'review_correction_request', target_email: employee.email,
    request_id: reviewId, correction_request_id: correction.id,
    expected_request_updated_date: correction.updated_date,
    decision: 'approve', reason: 'Manager confirms original synthetic time correction',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const gate = h.rows.TimeClockAdminCorrectionGate[0];
  assert.equal(gate.status, 'idle');
  const reviewEvidence = h.rows.TimeClockAudit.find((a) =>
    a.action === 'correction_review' && a.request_id === reviewId);
  assert.ok(reviewEvidence?.id && reviewEvidence.details?.review_payload_hash);
  Object.assign(gate, {
    status: 'creating', request_id: reviewId,
    time_entry_id: 'review:' + correction.id,
    payload_hash: reviewEvidence.details.review_payload_hash,
    claim_token: 'synthetic-ack-lost-review', started_at: '2026-09-22T20:00:00.000Z',
  });
  const nextPayload = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'v29-review-after-recovered-ack',
    entry_id: entry.id, expected_updated_date: entry.updated_date,
    reason: 'Independent manager adjustment after recovered review claim',
    correction: { clock_in: '2026-09-20T14:45:00.000Z',
      clock_out: entry.clock_out, lunch_minutes: 0,
      notes: 'Independent post-review time change',
      job_allocations: [{ hours: 7, minutes: 15, is_inhouse: true,
        inhouse_task: 'Synthetic shop work' }] },
  };
  const applied = h.rows.TimeClockAudit.find((a) =>
    a.action === 'admin_correction' && a.request_id === reviewId);
  assert.ok(applied?.details?.corrected);
  const originalClockIn = applied.details.corrected.clock_in;
  applied.details.corrected.clock_in = '2026-09-20T14:59:00.000Z';
  const rejected = await h.invoke(nextPayload);
  assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
  assert.equal(gate.status, 'creating', 'Mismatched applied audit cannot release review coordinator');
  assert.equal(entry.clock_in, '2026-09-20T14:30:00.000Z');
  applied.details.corrected.clock_in = originalClockIn;
  const next = await h.invoke(nextPayload);
  assert.equal(next.status, 200, JSON.stringify(next.body));
  assert.equal(gate.status, 'idle');
  assert.equal(gate.request_id, '');
  assert.equal(entry.clock_in, '2026-09-20T14:45:00.000Z');
  assert.equal(h.rows.TimeClockAudit.filter((audit) =>
    audit.action === 'admin_correction' &&
    ['confirmed', 'recovered'].includes(audit.outcome)).length, 2);
});

test('v30 manager correction coordinator diagnostics remain read-only and session-admin-only', async () => {
  const h = setup({ entryCount: 1, serverNow: '2026-09-22T21:00:00.000Z' });
  const diagnostic = () => h.invoke({
    action: 'admin_correction_gate_diagnostics', target_email: employee.email,
  });
  const frozen = () => clone(h.rows);
  const initial = frozen();
  const denied = await h.invokeAs(employee, {
    action: 'admin_correction_gate_diagnostics', target_email: employee.email,
  });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));
  assert.deepEqual(h.rows, initial, 'Unauthorized diagnostics must not change records');
  const ready = await diagnostic();
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  assert.equal(ready.body.coordinator_state, 'ready');
  assert.equal(ready.body.read_only, true);
  assert.equal(ready.body.record_count, 1);
  assert.deepEqual(h.rows, initial, 'Idle diagnostics must not trigger state recovery writes');
  const stateRows = h.rows.TimeClockEmployeeState;
  h.rows.TimeClockEmployeeState = [];
  const absentState = await diagnostic();
  assert.equal(absentState.body.coordinator_state, 'ready');
  assert.equal(h.rows.TimeClockEmployeeState.length, 0,
    'Viewing diagnostics must not initialize or recover employee state');
  h.rows.TimeClockEmployeeState = stateRows;

  const gate = h.rows.TimeClockAdminCorrectionGate[0];
  h.rows.TimeClockAdminCorrectionGate = [];
  const missingBefore = frozen();
  const missing = await diagnostic();
  assert.equal(missing.status, 200);
  assert.equal(missing.body.coordinator_state, 'invalid_setup');
  assert.equal(missing.body.record_count, 0);
  assert.deepEqual(h.rows, missingBefore);
  h.rows.TimeClockAdminCorrectionGate = [gate, { ...clone(gate), id: 'another-synthetic-company-gate' }];
  const duplicateBefore = frozen();
  const duplicate = await diagnostic();
  assert.equal(duplicate.body.coordinator_state, 'invalid_setup');
  assert.equal(duplicate.body.record_count, 2);
  assert.deepEqual(h.rows, duplicateBefore);
  h.rows.TimeClockAdminCorrectionGate = [gate];
  gate.status = 'idle';
  gate.request_id = 'dirty-idle-request';
  const invalidBefore = frozen();
  const invalid = await diagnostic();
  assert.equal(invalid.body.coordinator_state, 'invalid_state');
  assert.deepEqual(h.rows, invalidBefore);
  gate.request_id = '';

  const entry = h.rows.TimeEntry[0];
  const directId = 'v30-read-only-held-direct';
  Object.assign(gate, { status: 'creating', request_id: directId,
    time_entry_id: entry.id, payload_hash: 'synthetic-direct-hash',
    claim_token: 'synthetic-confidential-claim-token',
    started_at: '2026-09-22T20:00:00.000Z' });
  h.rows.TimeClockAudit.push({
    id: 'synthetic-diagnostic-audit', action: 'admin_correction',
    outcome: 'pending', request_id: directId, time_entry_id: entry.id,
    user_email: entry.user_email, actor_role: 'admin',
    details: { payload_hash: gate.payload_hash },
  });
  const heldBefore = frozen();
  const held = await diagnostic();
  assert.equal(held.status, 200, JSON.stringify(held.body));
  assert.equal(held.body.coordinator_state, 'claimed');
  assert.equal(held.body.claim_kind, 'direct_manager_correction');
  assert.equal(held.body.correction_audit.count, 1);
  assert.equal(held.body.correction_audit.outcomes[0], 'pending');
  assert.equal(held.body.entry_found, true);
  assert.equal(held.body.entry_request_marker_matches, false);
  assert.equal(JSON.stringify(held.body).includes(gate.claim_token), false,
    'Diagnostic output must never expose secret claim tokens');
  assert.equal(JSON.stringify(held.body).includes(gate.payload_hash), false,
    'Diagnostic output must never expose payload hashes');
  assert.deepEqual(h.rows, heldBefore, 'Held coordinator diagnostics cannot repair, release, or rewrite records');

  const reviewId = 'v30-read-only-review-claim';
  const request = { id: 'synthetic-diagnostic-review', time_entry_id: entry.id,
    user_email: entry.user_email, status: 'reviewing',
    review_request_id: reviewId, review_payload_hash: 'synthetic-review-hash' };
  h.rows.TimeClockCorrectionRequest.push(request);
  Object.assign(gate, { request_id: reviewId, time_entry_id: 'review:' + request.id,
    payload_hash: request.review_payload_hash });
  const heldReviewBefore = frozen();
  const review = await diagnostic();
  assert.equal(review.body.coordinator_state, 'claimed');
  assert.equal(review.body.claim_kind, 'manager_review');
  assert.equal(review.body.correction_request_status, 'reviewing');
  assert.equal(review.body.review_request_binding_matches, true);
  assert.equal(review.body.correction_audit.count, 0);
  assert.equal(review.body.correction_audit.ownership_matches, false);
  assert.equal(review.body.review_audit.count, 0);
  assert.equal(review.body.review_audit.ownership_matches, false);
  assert.deepEqual(h.rows, heldReviewBefore, 'Review diagnostics never complete a pending review');
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

test('direct admin correction and shift approval serialize on the same employee mutation gate', async () => {
  const correctionWins = setup();
  correctionWins.rows.TimeClockPayPeriod = [];
  const correctionEntry = correctionWins.rows.TimeEntry[0];
  correctionEntry.approval_status = 'needs_review';
  delete correctionEntry.approved_at;
  delete correctionEntry.approved_by;
  delete correctionEntry.approval_request_id;
  const loadedVersion = correctionEntry.updated_date;
  let releaseCorrection;
  let correctionReachedWrite;
  let correctionPaused = false;
  const correctionAtWrite = new Promise((resolve) => { correctionReachedWrite = resolve; });
  correctionWins.setBeforeUpdate(async (name, _query, update) => {
    if (!correctionPaused && name === 'TimeEntry' && update.$set?.last_correction_request_id === 'race-admin-correction-001') {
      correctionPaused = true;
      correctionReachedWrite();
      await new Promise((resolve) => { releaseCorrection = resolve; });
    }
  });
  const correctionPromise = correctionWins.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'race-admin-correction-001', entry_id: correctionEntry.id,
    expected_updated_date: loadedVersion, reason: 'Concurrent verified correction',
    correction: {
      clock_in: '2026-09-20T14:05:00.000Z', clock_out: '2026-09-20T22:05:00.000Z',
      lunch_minutes: 0, notes: 'Concurrent correction', job_allocations: [],
    },
  });
  await correctionAtWrite;
  const blockedApproval = await correctionWins.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'race-approval-loser-001', entry_id: correctionEntry.id,
    expected_updated_date: loadedVersion, decision: 'approve', note: 'Must wait for correction',
  });
  assert.equal(blockedApproval.status, 409, JSON.stringify(blockedApproval.body));
  assert.match(blockedApproval.body.error, /Another correction submission or approval|being processed/i);
  assert.equal(correctionWins.rows.TimeClockAudit.filter((row) => row.action === 'time_approval').length, 0);
  releaseCorrection();
  const corrected = await correctionPromise;
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(correctionWins.rows.TimeEntry[0].approval_status, 'needs_review');
  assert.equal(correctionWins.rows.TimeEntry[0].last_correction_request_id, 'race-admin-correction-001');
  assert.equal(correctionWins.rows.TimeClockEmployeeState[0].correction_create_status, 'idle');

  const approvalWins = setup();
  approvalWins.rows.TimeClockPayPeriod = [];
  const approvalEntry = approvalWins.rows.TimeEntry[0];
  approvalEntry.approval_status = 'needs_review';
  delete approvalEntry.approved_at;
  delete approvalEntry.approved_by;
  delete approvalEntry.approval_request_id;
  const approvalVersion = approvalEntry.updated_date;
  let releaseApproval;
  let approvalReachedWrite;
  let approvalPaused = false;
  const approvalAtWrite = new Promise((resolve) => { approvalReachedWrite = resolve; });
  approvalWins.setBeforeUpdate(async (name, _query, update) => {
    if (!approvalPaused && name === 'TimeEntry' && update.$set?.approval_status === 'approved') {
      approvalPaused = true;
      approvalReachedWrite();
      await new Promise((resolve) => { releaseApproval = resolve; });
    }
  });
  const approvalPromise = approvalWins.invoke({
    action: 'admin_set_entry_approval', target_email: employee.email,
    request_id: 'race-approval-winner-001', entry_id: approvalEntry.id,
    expected_updated_date: approvalVersion, decision: 'approve', note: 'Concurrent manager approval',
  });
  await approvalAtWrite;
  const blockedCorrection = await approvalWins.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'race-correction-loser-001', entry_id: approvalEntry.id,
    expected_updated_date: approvalVersion, reason: 'Must wait for approval',
    correction: {
      clock_in: '2026-09-20T14:10:00.000Z', clock_out: '2026-09-20T22:10:00.000Z',
      lunch_minutes: 0, notes: 'Must be blocked', job_allocations: [],
    },
  });
  assert.equal(blockedCorrection.status, 409, JSON.stringify(blockedCorrection.body));
  assert.match(blockedCorrection.body.error, /Another correction submission or shift approval|being processed/i);
  assert.equal(approvalWins.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 0);
  releaseApproval();
  const approved = await approvalPromise;
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approvalWins.rows.TimeEntry[0].approval_status, 'approved');
  assert.equal(approvalWins.rows.TimeClockEmployeeState[0].correction_create_status, 'idle');

  const approvedVersion = approvalWins.rows.TimeEntry[0].updated_date;
  const afterApprovalCorrection = await approvalWins.invoke({
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'race-correction-after-approval-001', entry_id: approvalEntry.id,
    expected_updated_date: approvedVersion, reason: 'Correction discovered after approval',
    correction: {
      clock_in: '2026-09-20T14:15:00.000Z', clock_out: '2026-09-20T22:15:00.000Z',
      lunch_minutes: 0, notes: 'Approval must be invalidated', job_allocations: [],
    },
  });
  assert.equal(afterApprovalCorrection.status, 200, JSON.stringify(afterApprovalCorrection.body));
  const correctedAfterApproval = approvalWins.rows.TimeEntry[0];
  assert.equal(correctedAfterApproval.approval_status, 'needs_review');
  assert.equal(correctedAfterApproval.approval_request_id, undefined);
  assert.equal(correctedAfterApproval.approved_at, undefined);
  assert.equal(correctedAfterApproval.approved_by, undefined);
  assert.equal(correctedAfterApproval.last_correction_request_id, 'race-correction-after-approval-001');
  assert.equal(approvalWins.rows.TimeClockAudit.filter((row) => row.action === 'time_approval').length, 1);
  assert.equal(approvalWins.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction').length, 1);
  assert.equal(approvalWins.rows.TimeClockEmployeeState[0].correction_create_status, 'idle');
});

test('exact direct admin correction retry releases a stranded shared mutation gate after saved correction', async () => {
  const h = setup();
  h.rows.TimeClockPayPeriod = [];
  const entry = h.rows.TimeEntry[0];
  const payload = {
    action: 'admin_correct_entry', target_email: employee.email,
    request_id: 'direct-admin-gate-recovery-001', entry_id: entry.id,
    expected_updated_date: entry.updated_date, reason: 'Verified correction with interrupted gate release',
    correction: {
      clock_in: '2026-09-20T14:20:00.000Z', clock_out: '2026-09-20T22:20:00.000Z',
      lunch_minutes: 0, notes: 'Gate recovery test', job_allocations: [],
    },
  };
  let failRelease = true;
  h.setBeforeUpdate((entity, query, update) => {
    if (failRelease && entity === 'TimeClockEmployeeState' &&
        query.correction_create_request_id === payload.request_id &&
        update.$set?.correction_create_status === 'idle') {
      failRelease = false;
      const gateRow = h.rows.TimeClockEmployeeState.find((row) => row.id === query.id);
      gateRow.updated_date = '2026-09-20T00:00:59.999Z';
    }
  });
  const interrupted = await h.invoke(payload);
  assert.equal(interrupted.status, 500, JSON.stringify(interrupted.body));
  assert.equal(h.rows.TimeEntry[0].last_correction_request_id, payload.request_id);
  assert.equal(h.rows.TimeEntry[0].approval_status, 'needs_review');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' && row.request_id === payload.request_id).length, 1);
  assert.equal(h.rows.TimeClockAudit.find((row) => row.action === 'admin_correction' && row.request_id === payload.request_id)?.outcome, 'confirmed');
  const heldGate = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  assert.equal(heldGate.correction_create_status, 'creating');
  assert.equal(heldGate.correction_create_request_id, payload.request_id);

  h.setBeforeUpdate(null);
  const recovered = await h.invoke(payload);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.reused, true);
  assert.equal(h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email).correction_create_status, 'idle');
  assert.equal(h.rows.TimeClockAudit.filter((row) => row.action === 'admin_correction' && row.request_id === payload.request_id).length, 1);
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

test('employee-reported missed Clock In works before the late-day cutoff, flags manager review, and retries idempotently', async () => {
  const h = setup({ entryCount: 0, serverNow: '2026-09-28T14:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [];

  const blockedRecover = await h.invoke({
    action: 'recover_missed_clock_in', target_email: employee.email,
    request_id: 'recover-too-early-001', claimed_clock_in: '2026-09-28T12:30:00.000Z',
  });
  assert.equal(blockedRecover.status, 409, JSON.stringify(blockedRecover.body));
  assert.equal(h.rows.TimeEntry.length, 0);

  const payload = {
    action: 'report_missed_clock_in', target_email: employee.email,
    request_id: 'report-missed-clock-in-001',
    claimed_clock_in: '2026-09-28T12:30:00.000Z',
  };
  const first = await h.invoke(payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.recovered_missed_clock_in, true);
  assert.equal(first.body.status, 'clocked_in');
  assert.equal(h.rows.TimeEntry.length, 1);
  const entry = h.rows.TimeEntry[0];
  assert.equal(entry.clock_in, '2026-09-28T12:30:00.000Z');
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
  assert.equal(punchCase.claimed_clock_in, entry.clock_in);
  assert.match(punchCase.resolution_note, /Quick Clock arrival-time prompt/);

  const retry = await h.invoke(payload);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.recovered_missed_clock_in, true);
  assert.equal(h.rows.TimeEntry.length, 1);
  assert.equal(h.rows.TimeClockPunchException.length, 1);

  const mismatchedRetry = await h.invoke({ ...payload, claimed_clock_in: '2026-09-28T13:00:00.000Z' });
  assert.equal(mismatchedRetry.status, 409, JSON.stringify(mismatchedRetry.body));
  assert.equal(h.rows.TimeEntry.length, 1);
  assert.equal(h.rows.TimeClockPunchException.length, 1);
});

test('employee-reported missed Clock In rejects future times, wrong-day claims, and active shifts', async () => {
  const future = setup({ entryCount: 0, serverNow: '2026-09-28T14:00:00.000Z' });
  future.rows.TimeClockPayPeriod = [];
  const blockedFuture = await future.invoke({
    action: 'report_missed_clock_in', target_email: employee.email,
    request_id: 'report-missed-future-001', claimed_clock_in: '2026-09-28T20:00:00.000Z',
  });
  assert.ok([400, 409].includes(blockedFuture.status), JSON.stringify(blockedFuture.body));
  assert.equal(future.rows.TimeEntry.length, 0);

  const wrongDay = setup({ entryCount: 0, serverNow: '2026-09-28T14:00:00.000Z' });
  wrongDay.rows.TimeClockPayPeriod = [];
  const blockedDay = await wrongDay.invoke({
    action: 'report_missed_clock_in', target_email: employee.email,
    request_id: 'report-missed-wrongday-001', claimed_clock_in: '2026-09-27T20:00:00.000Z',
  });
  assert.ok([400, 409].includes(blockedDay.status), JSON.stringify(blockedDay.body));
  assert.equal(wrongDay.rows.TimeEntry.length, 0);
  assert.equal(wrongDay.rows.TimeClockPunchException.length, 0);

  const active = setup({ entryCount: 1, serverNow: '2026-09-28T14:00:00.000Z' });
  active.rows.TimeClockPayPeriod = [];
  const activeEntry = active.rows.TimeEntry[0];
  Object.assign(activeEntry, {
    status: 'clocked_in', clock_in: '2026-09-28T12:00:00.000Z', clock_out: null,
  });
  const activeState = active.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(activeState, { status: 'clocked_in', active_entry_id: activeEntry.id });
  const blockedActive = await active.invoke({
    action: 'report_missed_clock_in', target_email: employee.email,
    request_id: 'report-missed-active-001', claimed_clock_in: '2026-09-28T11:00:00.000Z',
  });
  assert.equal(blockedActive.status, 409, JSON.stringify(blockedActive.body));
  assert.match(blockedActive.body.error, /active shift|state changed/i);
  assert.equal(active.rows.TimeEntry.length, 1);
});

test('missed Work Pause report records one completed employee-attested pause and retries idempotently', async () => {
  const h = setup({ entryCount: 1, serverNow: '2026-09-28T20:00:00.000Z' });
  h.rows.TimeClockPayPeriod = [];
  const entry = h.rows.TimeEntry[0];
  Object.assign(entry, {
    status: 'clocked_in', clock_in: '2026-09-28T13:00:00.000Z', clock_out: null,
  });
  const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
  Object.assign(state, { status: 'clocked_in', active_entry_id: entry.id });
  h.rows.AuthorizedEmail.find((row) => row.email === employee.email).can_work_pause = true;

  const payload = {
    action: 'work_pause_report_missed', target_email: employee.email,
    request_id: 'missed-work-pause-001',
    started_at: '2026-09-28T17:00:00.000Z', resumed_at: '2026-09-28T17:30:00.000Z',
    note: 'Forgot to log a truck run',
  };
  const first = await h.invokeAs(employee, payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.work_pause_status, 'working');
  assert.equal(h.rows.TimeClockWorkPause.length, 1);
  const pauseRow = h.rows.TimeClockWorkPause[0];
  assert.equal(pauseRow.status, 'completed');
  assert.equal(pauseRow.source, 'employee_attested_missed');
  assert.equal(pauseRow.started_at, payload.started_at);
  assert.equal(pauseRow.resumed_at, payload.resumed_at);
  assert.equal(pauseRow.duration_minutes, 30);
  assert.equal(pauseRow.start_request_id, payload.request_id);
  assert.equal(first.body.work_pause.id, pauseRow.id);
  assert.equal(first.body.work_pause_summary.count, 1);

  const pauseAudits = h.rows.TimeClockAudit.filter((row) =>
    row.action === 'work_pause_report_missed' && row.request_id === payload.request_id
  );
  assert.equal(pauseAudits.length, 1);
  assert.equal(pauseAudits[0].time_entry_id, entry.id);

  const retry = await h.invokeAs(employee, payload);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.reused, true);
  assert.equal(h.rows.TimeClockWorkPause.length, 1);

  const mismatchedRetry = await h.invokeAs(employee, { ...payload, started_at: '2026-09-28T17:15:00.000Z' });
  assert.equal(mismatchedRetry.status, 409, JSON.stringify(mismatchedRetry.body));
  assert.equal(h.rows.TimeClockWorkPause.length, 1);
});

test('missed Work Pause report rejects invalid windows, wrong actors, and inactive shifts', async () => {
  const buildActive = (canWorkPause = true) => {
    const h = setup({ entryCount: 1, serverNow: '2026-09-28T20:00:00.000Z' });
    h.rows.TimeClockPayPeriod = [];
    const entry = h.rows.TimeEntry[0];
    Object.assign(entry, {
      status: 'clocked_in', clock_in: '2026-09-28T13:00:00.000Z', clock_out: null,
    });
    const state = h.rows.TimeClockEmployeeState.find((row) => row.user_email === employee.email);
    Object.assign(state, { status: 'clocked_in', active_entry_id: entry.id });
    h.rows.AuthorizedEmail.find((row) => row.email === employee.email).can_work_pause = canWorkPause;
    return h;
  };
  const base = {
    action: 'work_pause_report_missed', target_email: employee.email,
    request_id: 'missed-work-pause-reject-001',
    started_at: '2026-09-28T17:00:00.000Z', resumed_at: '2026-09-28T17:30:00.000Z',
  };

  const notClockedIn = setup({ entryCount: 0, serverNow: '2026-09-28T20:00:00.000Z' });
  const blockedOut = await notClockedIn.invokeAs(employee, base);
  assert.equal(blockedOut.status, 409, JSON.stringify(blockedOut.body));

  const noFeature = buildActive(false);
  const blockedFeature = await noFeature.invokeAs(employee, base);
  assert.equal(blockedFeature.status, 403, JSON.stringify(blockedFeature.body));

  const badOrder = buildActive();
  const blockedOrder = await badOrder.invokeAs(employee, { ...base, resumed_at: '2026-09-28T16:00:00.000Z' });
  assert.equal(blockedOrder.status, 400, JSON.stringify(blockedOrder.body));
  assert.equal((badOrder.rows.TimeClockWorkPause || []).length, 0);

  const beforeClockIn = buildActive();
  const blockedBefore = await beforeClockIn.invokeAs(employee, { ...base, started_at: '2026-09-28T12:00:00.000Z', resumed_at: '2026-09-28T12:30:00.000Z' });
  assert.equal(blockedBefore.status, 400, JSON.stringify(blockedBefore.body));

  const tooLong = buildActive();
  const blockedLong = await tooLong.invokeAs(employee, { ...base, started_at: '2026-09-28T13:30:00.000Z', resumed_at: '2026-09-29T02:30:00.000Z' });
  assert.equal(blockedLong.status, 400, JSON.stringify(blockedLong.body));
  assert.equal((tooLong.rows.TimeClockWorkPause || []).length, 0);

  const adminActor = buildActive();
  const blockedActor = await adminActor.invoke(base);
  assert.equal(blockedActor.status, 403, JSON.stringify(blockedActor.body));
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
