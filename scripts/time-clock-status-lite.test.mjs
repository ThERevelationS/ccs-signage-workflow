import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusLite } from '../base44/shared/timeClockStatusLite.ts';

const WRITE_METHODS = ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'bulkCreate'];

function stubEntity(rows = {}) {
  const calls = [];
  const byId = rows.byId || {};
  const byFilter = rows.byFilter || [];
  const entity = new Proxy({}, {
    get(_t, prop) {
      if (WRITE_METHODS.includes(prop)) {
        return () => { throw new Error(`write method ${prop} must never be called`); };
      }
      if (prop === 'filter') {
        return async (query) => {
          calls.push({ method: 'filter', args: [query] });
          return Array.isArray(byFilter) ? byFilter : byFilter(query);
        };
      }
      if (prop === 'get') {
        return async (id) => {
          calls.push({ method: 'get', args: [id] });
          return byId[id] || null;
        };
      }
      return async () => { calls.push({ method: String(prop), args: [] }); return []; };
    },
  });
  return { entity, calls };
}

function makeHelpers() {
  return {
    publicEmployee: (target) => ({ id: target.id, email: target.email, full_name: target.full_name, role: target.role }),
    breakStatusOf: (state) => {
      const v = String(state?.break_status || 'working');
      return ['working', 'starting_break', 'on_break', 'ending_break'].includes(v) ? v : 'working';
    },
    workPauseStatusOf: (state) => {
      const v = String(state?.work_pause_status || 'working');
      return ['working', 'pausing', 'paused', 'resuming'].includes(v) ? v : 'working';
    },
    laborStatusOf: (state) => {
      const v = String(state?.labor_status || 'idle');
      return ['idle', 'starting', 'changing', 'stopping'].includes(v) ? v : 'idle';
    },
    breakSummaryForEntry: async () => ({ count: 1, total_minutes: 15, paid_minutes: 15, unpaid_minutes: 0 }),
    workPauseSummaryForEntry: async () => ({ count: 1, total_minutes: 5 }),
    dateKeyInCompanyTime: (value) => new Date(value).toISOString().slice(0, 10),
    MISSED_PUNCH_PROMPT_MS: 18 * 60 * 60 * 1000,
    MISSED_PUNCH_REPROMPT_MS: 8 * 60 * 60 * 1000,
    asEmail: (v) => String(v || '').trim().toLowerCase(),
  };
}

function makeWorld(state, extras = {}) {
  const stateE = stubEntity({ byFilter: state === undefined ? [] : [state] });
  const entryE = stubEntity({ byId: extras.entries || {} });
  const breakE = stubEntity({ byId: extras.breaks || {} });
  const pauseE = stubEntity({ byId: extras.pauses || {} });
  const target = extras.target || { id: 'u1', email: 'a@x.com', full_name: 'A', can_work_pause: true, employment_type: 'hourly' };
  const run = () => buildStatusLite({
    stateEntity: stateE.entity, entryEntity: entryE.entity,
    breakEntity: breakE.entity, workPauseEntity: pauseE.entity,
    target, helpers: makeHelpers(),
  });
  const allCalls = [...stateE.calls];
  return { run, stateE, entryE, breakE, pauseE, allCalls };
}

function assertFull(result) {
  assert.equal(result.success, true);
  assert.equal(result.lite, true);
  assert.equal(result.requires_full_status, true);
}

test('no state rows -> FULL', async () => {
  const { run } = makeWorld(undefined);
  assertFull(await run());
});

test('two state rows -> FULL', async () => {
  const stateE = stubEntity({ byFilter: [{ id: 's1' }, { id: 's2' }] });
  const result = await buildStatusLite({
    stateEntity: stateE.entity, entryEntity: stubEntity().entity,
    breakEntity: stubEntity().entity, workPauseEntity: stubEntity().entity,
    target: { id: 'u1', email: 'a@x.com' }, helpers: makeHelpers(),
  });
  assertFull(result);
});

test('each transition condition -> FULL', async () => {
  const cases = [
    { status: 'clocking_in' },
    { status: 'clocking_out' },
    { status: 'clocked_in', active_entry_id: 'e1', break_status: 'starting_break' },
    { status: 'clocked_in', active_entry_id: 'e1', break_status: 'ending_break' },
    { status: 'clocked_in', active_entry_id: 'e1', work_pause_status: 'pausing' },
    { status: 'clocked_in', active_entry_id: 'e1', work_pause_status: 'resuming' },
    { status: 'clocked_in', active_entry_id: 'e1', labor_status: 'starting' },
    { status: 'clocked_in', active_entry_id: 'e1', labor_status: 'changing' },
    { status: 'clocked_in', active_entry_id: 'e1', labor_status: 'stopping' },
    { status: 'clocked_in', active_entry_id: 'e1', correction_create_status: 'creating' },
  ];
  for (const state of cases) {
    const { run } = makeWorld(state, {
      entries: { e1: { id: 'e1', status: 'clocked_in', user_email: 'a@x.com', clock_in: new Date().toISOString() } },
    });
    const result = await run();
    assertFull(result);
    assert.equal(result.status, undefined, `leaked status for ${JSON.stringify(state)}`);
  }
});

test('steady clocked_out -> lite shape', async () => {
  const { run } = makeWorld({ id: 's1', status: 'clocked_out' });
  const r = await run();
  assert.equal(r.success, true);
  assert.equal(r.lite, true);
  assert.equal(r.status, 'clocked_out');
  assert.equal(r.entry, null);
  assert.equal(r.break_status, 'working');
  assert.deepEqual(r.break_summary, { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
  assert.equal(r.work_pause_status, 'working');
  assert.deepEqual(r.work_pause_summary, { count: 0, total_minutes: 0 });
  assert.equal(r.work_pause_allowed, true);
  assert.equal(r.employment_type, 'hourly');
  assert.equal(r.requires_full_status, undefined);
  assert.equal(r.unresolved_punch_review, undefined);
});

test('steady clocked_in paused -> lite shape with active_work_pause', async () => {
  const now = new Date().toISOString();
  const { run } = makeWorld(
    { id: 's1', status: 'clocked_in', active_entry_id: 'e1', work_pause_status: 'paused', active_work_pause_id: 'p1' },
    {
      entries: { e1: { id: 'e1', status: 'clocked_in', user_email: 'a@x.com', clock_in: now } },
      pauses: { p1: { id: 'p1', status: 'active', user_email: 'a@x.com', time_entry_id: 'e1' } },
    },
  );
  const r = await run();
  assert.equal(r.status, 'clocked_in');
  assert.equal(r.entry.id, 'e1');
  assert.equal(r.work_pause_status, 'paused');
  assert.equal(r.active_work_pause.id, 'p1');
  assert.deepEqual(r.work_pause_summary, { count: 1, total_minutes: 5 });
  assert.equal(r.labor_summary, undefined);
  assert.equal(r.active_labor, undefined);
});

test('entry mismatch -> FULL', async () => {
  const { run } = makeWorld(
    { id: 's1', status: 'clocked_in', active_entry_id: 'e1' },
    { entries: { e1: { id: 'e1', status: 'clocked_out', user_email: 'a@x.com' } } },
  );
  assertFull(await run());

  const { run: run2 } = makeWorld(
    { id: 's1', status: 'clocked_in', active_entry_id: 'e1' },
    { entries: { e1: { id: 'e1', status: 'clocked_in', user_email: 'other@x.com' } } },
  );
  assertFull(await run2());

  const { run: run3 } = makeWorld(
    { id: 's1', status: 'clocked_in', active_entry_id: 'e1' },
    { entries: {} },
  );
  assertFull(await run3());
});

test('missed punch -> FULL', async () => {
  const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // >18h ago, crosses date
  const { run } = makeWorld(
    { id: 's1', status: 'clocked_in', active_entry_id: 'e1' },
    { entries: { e1: { id: 'e1', status: 'clocked_in', user_email: 'a@x.com', clock_in: old } } },
  );
  assertFull(await run());
});

test('break record mismatch -> FULL', async () => {
  const now = new Date().toISOString();
  const { run } = makeWorld(
    { id: 's1', status: 'clocked_in', active_entry_id: 'e1', break_status: 'on_break', active_break_id: 'b1' },
    {
      entries: { e1: { id: 'e1', status: 'clocked_in', user_email: 'a@x.com', clock_in: now } },
      breaks: { b1: { id: 'b1', status: 'completed', user_email: 'a@x.com', time_entry_id: 'e1' } },
    },
  );
  assertFull(await run());
});

test('zero write calls and only read methods used in all paths', async () => {
  const now = new Date().toISOString();
  const worlds = [
    makeWorld({ id: 's1', status: 'clocked_out' }),
    makeWorld({ id: 's1', status: 'clocked_in', active_entry_id: 'e1', work_pause_status: 'paused', active_work_pause_id: 'p1' }, {
      entries: { e1: { id: 'e1', status: 'clocked_in', user_email: 'a@x.com', clock_in: now } },
      pauses: { p1: { id: 'p1', status: 'active', user_email: 'a@x.com', time_entry_id: 'e1' } },
    }),
    makeWorld({ id: 's1', status: 'clocking_in' }),
  ];
  for (const w of worlds) {
    await w.run();
    for (const stub of [w.stateE, w.entryE, w.breakE, w.pauseE]) {
      for (const c of stub.calls) assert.ok(!WRITE_METHODS.includes(c.method), `write call ${c.method}`);
    }
  }
});
