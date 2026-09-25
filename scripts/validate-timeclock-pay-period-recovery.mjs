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
function setup({ entryCount = 1 } = {}) {
  revision = 0;
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
    console: { error: () => {} },
  });
  vm.runInContext(compiled, context, { filename: 'synthetic-time-clock-handler.js' });
  assert.equal(typeof handler, 'function');
  const payload = Buffer.from(JSON.stringify({
    email: administrator.email, iat: Date.now() - 1000, exp: Date.now() + 60_000,
  })).toString('base64url');
  const session_token = payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
  async function action(decision, request_id, note = '') {
    const response = await handler({ json: async () => ({
      action: 'pay_period_status', decision, request_id, note,
      pay_period_id: 'synthetic-period', session_token,
    }) });
    return { status: response.status, body: await response.json() };
  }
  return {
    rows, action,
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

for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name, error); process.exitCode = 1; }
}
if (!process.exitCode) console.log('PASS ' + tests.length + '/' + tests.length + ' Time Clock synthetic recovery scenarios');
