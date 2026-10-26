// Synthetic-only smoke test for the time-off decision flow. Runs the REAL
// timeClockAction handler against in-memory fixtures: no live Base44 records,
// no hosted auth, no outside-origin calls. Verifies list/decision behavior,
// permission boundaries, optimistic concurrency, audit idempotency, and that
// each confirmed decision emits exactly one automation event.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setupSyntheticTimeClock } from './validate-timeclock-pay-period-recovery.mjs';

const source = readFileSync('base44/functions/timeClockAction/entry.ts', 'utf8');
const administrator = { id: 'synthetic-admin', email: 'admin@synthetic.invalid', full_name: 'Synthetic Admin', role: 'admin' };
const employee = { id: 'synthetic-employee', email: 'worker@synthetic.invalid', full_name: 'Synthetic Employee', role: 'employee' };
const other = { id: 'synthetic-other', email: 'other@synthetic.invalid', full_name: 'Other Employee', role: 'employee' };

function requestRow(overrides = {}) {
  return {
    id: 'tor-' + Math.random().toString(36).slice(2, 10),
    user_email: employee.email,
    user_name: employee.full_name,
    request_type: 'vacation',
    start_date: '2026-11-02',
    end_date: '2026-11-03',
    hours_requested: 16,
    reason: 'synthetic smoke test',
    status: 'pending',
    archived_test_data: false,
    updated_date: '2026-10-26T00:00:00.000Z',
    created_date: '2026-10-25T00:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const h = setupSyntheticTimeClock({ entryCount: 0 });
  h.rows.AuthorizedEmail.push(structuredClone(other));
  h.rows.TimeOffRequest = [];
  return h;
}

const adminDecide = (h, over) => h.invokeAs(administrator, {
  action: 'time_off_decision', request_id: 'dec-' + Math.random().toString(36).slice(2, 12),
  target_email: employee.email, ...over,
});
const ownDecide = (h, over) => h.invokeAs(employee, {
  action: 'time_off_decision', request_id: 'dec-' + Math.random().toString(36).slice(2, 12), ...over,
});
const emitted = (h) => h.emittedEvents.map((e) => e.payload?.event_type);

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// --- Source-level guards the fixture cannot exercise (badge identity) ---------
test('badge actors are rejected from both new actions in source', () => {
  const listBlock = source.slice(source.indexOf("if (action === 'list_time_off_requests')"));
  assert.match(listBlock.slice(0, 700), /actor\.role === 'badge'/);
  const decideBlock = source.slice(source.indexOf("if (action === 'time_off_decision')"));
  assert.match(decideBlock.slice(0, 700), /actor\.role === 'badge'/);
});

// --- list_time_off_requests ---------------------------------------------------
test('admin scope lists pending and approved, excludes archived and decided', async () => {
  const h = setup();
  const pending = requestRow({ id: 'tor-pending' });
  const approved = requestRow({ id: 'tor-approved', status: 'approved' });
  const denied = requestRow({ id: 'tor-denied', status: 'denied' });
  const cancelled = requestRow({ id: 'tor-cancelled', status: 'cancelled' });
  const archived = requestRow({ id: 'tor-archived', archived_test_data: true });
  h.rows.TimeOffRequest.push(pending, approved, denied, cancelled, archived);
  const res = await h.invokeAs(administrator, {
    action: 'list_time_off_requests', scope: 'admin', request_id: 'list-0001',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const ids = res.body.requests.map((r) => r.id).sort();
  assert.deepEqual(ids, ['tor-approved', 'tor-pending']);
});

test('employee scope lists only own requests and excludes archived', async () => {
  const h = setup();
  h.rows.TimeOffRequest.push(
    requestRow({ id: 'tor-own', user_email: employee.email }),
    requestRow({ id: 'tor-other', user_email: other.email }),
    requestRow({ id: 'tor-arch', user_email: employee.email, archived_test_data: true }),
  );
  const res = await h.invokeAs(employee, { action: 'list_time_off_requests', request_id: 'list-0002' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.requests.map((r) => r.id), ['tor-own']);
});

// --- time_off_decision: happy paths -------------------------------------------
test('admin approval sets status, metadata, confirmed audit, and emits once', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-approve' });
  h.rows.TimeOffRequest.push(req);
  const res = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved',
    expected_updated_date: req.updated_date, admin_notes: 'Enjoy the break',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = h.rows.TimeOffRequest.find((r) => r.id === req.id);
  assert.equal(saved.status, 'approved');
  assert.equal(saved.approved_by, administrator.email);
  assert.ok(saved.approved_date, 'approved_date must be populated');
  assert.equal(saved.admin_notes, 'Enjoy the break');
  assert.deepEqual(emitted(h), ['time_off_approved']);
  const audit = h.rows.TimeClockAudit.find((a) => a.action === 'time_off_decision');
  assert.ok(audit?.id, 'decision audit must exist');
  assert.equal(audit.outcome, 'confirmed');
});

test('admin denial emits time_off_denied exactly once', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-deny' });
  h.rows.TimeOffRequest.push(req);
  const res = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'denied',
    expected_updated_date: req.updated_date, admin_notes: 'Coverage conflict',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(h.rows.TimeOffRequest[0].status, 'denied');
  assert.deepEqual(emitted(h), ['time_off_denied']);
});

test('employee can cancel their own pending request', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-cancel-pending' });
  h.rows.TimeOffRequest.push(req);
  const res = await ownDecide(h, {
    time_off_request_id: req.id, decision: 'cancelled',
    expected_updated_date: req.updated_date,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(h.rows.TimeOffRequest[0].status, 'cancelled');
  assert.equal(h.rows.TimeOffRequest[0].approved_by, employee.email);
  assert.deepEqual(emitted(h), ['time_off_cancelled']);
});

test('employee can cancel their own approved request', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-cancel-approved', status: 'approved', approved_by: administrator.email });
  h.rows.TimeOffRequest.push(req);
  const res = await ownDecide(h, {
    time_off_request_id: req.id, decision: 'cancelled',
    expected_updated_date: req.updated_date,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(h.rows.TimeOffRequest[0].status, 'cancelled');
  assert.deepEqual(emitted(h), ['time_off_cancelled']);
});

// --- permission boundaries ------------------------------------------------------
test('employee cannot approve or deny any request', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-emp-approve' });
  h.rows.TimeOffRequest.push(req);
  for (const decision of ['approved', 'denied']) {
    const res = await ownDecide(h, {
      time_off_request_id: req.id, decision, expected_updated_date: req.updated_date,
    });
    assert.equal(res.status, 403, JSON.stringify(res.body));
  }
  assert.equal(h.rows.TimeOffRequest[0].status, 'pending');
  assert.deepEqual(emitted(h), []);
});

test('employee cannot cancel another employee request', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-foreign', user_email: other.email });
  h.rows.TimeOffRequest.push(req);
  const res = await ownDecide(h, {
    time_off_request_id: req.id, decision: 'cancelled',
    expected_updated_date: req.updated_date,
  });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(h.rows.TimeOffRequest[0].status, 'pending');
  assert.deepEqual(emitted(h), []);
});

// --- validation and concurrency -------------------------------------------------
test('missing identifiers and invalid decisions are rejected', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-valid' });
  h.rows.TimeOffRequest.push(req);
  const missingId = await adminDecide(h, {
    decision: 'approved', expected_updated_date: req.updated_date,
  });
  assert.equal(missingId.status, 400);
  const missingVersion = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved',
  });
  assert.equal(missingVersion.status, 400);
  const badDecision = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'maybe', expected_updated_date: req.updated_date,
  });
  assert.equal(badDecision.status, 400);
  const missing = await adminDecide(h, {
    time_off_request_id: 'tor-does-not-exist', decision: 'approved',
    expected_updated_date: req.updated_date,
  });
  assert.equal(missing.status, 404);
  assert.equal(h.rows.TimeOffRequest[0].status, 'pending');
  assert.deepEqual(emitted(h), []);
});

test('archived test requests cannot be decided', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-archived-decision', archived_test_data: true });
  h.rows.TimeOffRequest.push(req);
  const res = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved', expected_updated_date: req.updated_date,
  });
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(h.rows.TimeOffRequest[0].status, 'pending');
  assert.deepEqual(emitted(h), []);
});

test('stale expected_updated_date fails closed without emitting', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-stale' });
  h.rows.TimeOffRequest.push(req);
  const res = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved',
    expected_updated_date: '1999-01-01T00:00:00.000Z',
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(h.rows.TimeOffRequest[0].status, 'pending');
  assert.equal(h.rows.TimeClockAudit.length, 0, 'no audit intent should persist for a stale version');
  assert.deepEqual(emitted(h), []);
});

test('deciding an already-decided request fails closed', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-redenied', status: 'denied' });
  h.rows.TimeOffRequest.push(req);
  const res = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved', expected_updated_date: req.updated_date,
  });
  assert.equal(res.status, 409);
  const cancelledRes = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'cancelled', expected_updated_date: req.updated_date,
  });
  assert.equal(cancelledRes.status, 409);
  assert.equal(h.rows.TimeOffRequest[0].status, 'denied');
  assert.deepEqual(emitted(h), []);
});

test('replayed identical decision reuses the confirmed audit without re-emitting', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-replay' });
  const loadedVersion = req.updated_date;
  h.rows.TimeOffRequest.push(req);
  const request_id = 'dec-replay-0001';
  const first = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved',
    expected_updated_date: loadedVersion, admin_notes: 'same', request_id,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  // A genuine idempotent replay resends the identical payload. The fixture row
  // is mutated in place, so req.updated_date after the first call would model
  // a refetched client — a different version token, not a replay.
  const second = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved',
    expected_updated_date: loadedVersion, admin_notes: 'same', request_id,
  });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.reused, true);
  assert.equal(h.rows.TimeClockAudit.filter((a) => a.action === 'time_off_decision').length, 1);
  assert.deepEqual(emitted(h), ['time_off_approved'], 'replay must not emit a second event');
});

test('same request_id with different payload fails closed', async () => {
  const h = setup();
  const req = requestRow({ id: 'tor-mismatch' });
  h.rows.TimeOffRequest.push(req);
  const request_id = 'dec-mismatch-001';
  const first = await adminDecide(h, {
    time_off_request_id: req.id, decision: 'approved',
    expected_updated_date: req.updated_date, request_id,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const other2 = requestRow({ id: 'tor-mismatch-2' });
  h.rows.TimeOffRequest.push(other2);
  const second = await adminDecide(h, {
    time_off_request_id: other2.id, decision: 'denied',
    expected_updated_date: other2.updated_date, request_id,
  });
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(h.rows.TimeOffRequest.find((r) => r.id === other2.id).status, 'pending');
});

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name, error); process.exitCode = 1; }
  }
  if (!process.exitCode) console.log(`PASS ${tests.length}/${tests.length} time-off decision scenarios`);
}
