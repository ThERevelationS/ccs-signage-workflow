import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowScheduleManager } from '../base44/shared/workflowScheduleManager.ts';

const APP = 'app-1';
const TOKEN = 'secret-token-123';

function workflow({ id = 'w1', cron = '*/15 * * * *', timezone = 'UTC', status = 'active', triggerExtra = {} } = {}) {
  return {
    id, name: 'Job ' + id, description: 'd', status, status_reason: null,
    trigger: {
      condition: null,
      config: {
        trigger_type: 'scheduled', schedule_mode: 'recurring',
        cron_expression: cron, timezone, ends_type: 'never', ends_on_date: null,
        ends_after_count: null, events: [],
        ...triggerExtra,
      },
    },
    definition: { secret: 'do-not-send' },
    total_runs: 10, consecutive_failures: 0,
    last_run_at: '2026-06-01T00:00:00Z', last_run_status: 'success',
  };
}

function makeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const result = handler(url, init, calls.length);
    if (result instanceof Error) throw result;
    return result;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function makeHistory() {
  const rows = [];
  return {
    rows,
    async filter(query, sort, limit = 500, skip = 0) {
      let out = rows.filter((r) => Object.entries(query || {}).every(([k, v]) => r[k] === v));
      out = [...out].sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
      return out.slice(skip, skip + limit);
    },
    async create(data) {
      const row = { id: `h${rows.length + 1}`, created_date: new Date().toISOString(), ...data };
      rows.push(row);
      return row;
    },
  };
}

function manager(fetchImpl, historyEntity, { token = TOKEN, sleep } = {}) {
  const sleeps = [];
  const mgr = createWorkflowScheduleManager({
    fetchImpl, token, appId: APP, historyEntity,
    now: () => new Date('2026-06-01T12:00:00Z'),
    sleep: sleep || ((ms) => { sleeps.push(ms); return Promise.resolve(); }),
  });
  return { mgr, sleeps };
}

test('updateSchedule PUT body only contains trigger, preserves other trigger fields, never definition', async () => {
  let applied = false;
  const fetchImpl = makeFetch((_url, init) => {
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body), ['trigger']);
      assert.ok(!('definition' in body));
      assert.equal(body.trigger.condition, null);
      assert.equal(body.trigger.config.ends_type, 'never');
      assert.equal(body.trigger.config.cron_expression, '30 9 * * *');
      assert.equal(body.trigger.config.timezone, 'America/Chicago');
      applied = true;
      return jsonResponse(200, workflow({ cron: '30 9 * * *', timezone: 'America/Chicago' }));
    }
    return jsonResponse(200, applied ? workflow({ cron: '30 9 * * *', timezone: 'America/Chicago' }) : workflow());
  });
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history);
  const result = await mgr.updateSchedule({
    workflow_id: 'w1', cron_expression: '30 9 * * *', timezone: 'America/Chicago',
    expected_cron: '*/15 * * * *', expected_timezone: 'UTC',
    request_id: 'req-12345678',
  }, { email: 'admin@x.com', full_name: 'Admin' });
  assert.equal(result.row.cron, '30 9 * * *');
  const appliedRow = history.rows.find((r) => r.outcome === 'applied');
  assert.equal(appliedRow.request_id, 'req-12345678');
  assert.equal(appliedRow.previous_cron, '*/15 * * * *');
  assert.equal(appliedRow.new_cron, '30 9 * * *');
  assert.equal(appliedRow.actor_email, 'admin@x.com');
  assert.ok(appliedRow.verified_at);
});

test('conflict writes conflict history and throws 409 with no PUT', async () => {
  const fetchImpl = makeFetch(() => jsonResponse(200, workflow({ cron: '0 5 * * *' })));
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history);
  await assert.rejects(
    () => mgr.updateSchedule({
      workflow_id: 'w1', cron_expression: '30 9 * * *', timezone: 'UTC',
      expected_cron: '*/15 * * * *', expected_timezone: 'UTC', request_id: 'req-conflict',
    }),
    (err) => err.status === 409 && err.code === 'conflict' && /changed in Base44/.test(err.message),
  );
  assert.equal(history.rows.length, 1);
  assert.equal(history.rows[0].outcome, 'conflict');
  assert.ok(!fetchImpl.calls.some((c) => c.init.method === 'PUT'));
});

test('post-PUT verification mismatch writes failed and throws 502', async () => {
  const fetchImpl = makeFetch((url, init) => {
    if (init.method === 'PUT') return jsonResponse(200, {});
    // second GET returns stale schedule
    return jsonResponse(200, workflow({ cron: '*/15 * * * *' }));
  });
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history);
  await assert.rejects(
    () => mgr.updateSchedule({
      workflow_id: 'w1', cron_expression: '30 9 * * *', timezone: 'UTC',
      expected_cron: '*/15 * * * *', expected_timezone: 'UTC', request_id: 'req-failver',
    }),
    (err) => err.status === 502 && /did not keep/.test(err.message),
  );
  assert.equal(history.rows.at(-1).outcome, 'failed');
});

test('setStatus no-op when already desired: no toggle, no history', async () => {
  const fetchImpl = makeFetch(() => jsonResponse(200, workflow({ status: 'active' })));
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history);
  const result = await mgr.setStatus({
    workflow_id: 'w1', desired_status: 'active', expected_status: 'active', request_id: 'req-noop0000',
  });
  assert.equal(result.row.status, 'active');
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('toggle-status')));
  assert.equal(history.rows.length, 0);
});

test('setStatus toggles and verifies', async () => {
  let status = 'active';
  const fetchImpl = makeFetch((url, init) => {
    if (init.method === 'POST' && url.includes('toggle-status')) {
      status = 'inactive';
      return jsonResponse(200, { workflow_id: 'w1', status: 'inactive' });
    }
    return jsonResponse(200, workflow({ status }));
  });
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history);
  const result = await mgr.setStatus({
    workflow_id: 'w1', desired_status: 'inactive', expected_status: 'active', request_id: 'req-toggle1',
  });
  assert.equal(result.row.status, 'inactive');
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('/toggle-status?status=inactive')));
  assert.equal(history.rows[0].outcome, 'applied');
  assert.equal(history.rows[0].action, 'status_change');
});

test('request_id replay returns prior result without calling Base44', async () => {
  let applied = false;
  const fetchImpl = makeFetch((_url, init) => {
    if (init.method === 'PUT') applied = true;
    return jsonResponse(200, applied ? workflow({ cron: '30 9 * * *' }) : workflow());
  });
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history);
  await mgr.updateSchedule({
    workflow_id: 'w1', cron_expression: '30 9 * * *', timezone: 'UTC',
    expected_cron: '*/15 * * * *', expected_timezone: 'UTC', request_id: 'req-replay1',
  });
  const callsAfterApply = fetchImpl.calls.length;
  const replay = await mgr.updateSchedule({
    workflow_id: 'w1', cron_expression: '30 9 * * *', timezone: 'UTC',
    expected_cron: '*/15 * * * *', expected_timezone: 'UTC', request_id: 'req-replay1',
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.cron, '30 9 * * *');
  assert.equal(fetchImpl.calls.length, callsAfterApply);
});

test('missing token throws 503 not_configured and makes zero fetch calls', async () => {
  const fetchImpl = makeFetch(() => jsonResponse(200, []));
  const { mgr } = manager(fetchImpl, makeHistory(), { token: '' });
  await assert.rejects(
    () => mgr.list(),
    (err) => err.status === 503 && err.code === 'not_configured' && !err.message.includes(TOKEN),
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('token never appears in errors or console output', async () => {
  const messages = [];
  const origError = console.error;
  console.error = (...args) => messages.push(args.join(' '));
  try {
    const fetchImpl = makeFetch(() => jsonResponse(401, { error: 'unauthorized' }));
    const { mgr } = manager(fetchImpl, makeHistory());
    await assert.rejects(() => mgr.list(), (err) => {
      assert.equal(err.code, 'base44_auth');
      assert.ok(!err.message.includes(TOKEN));
      return true;
    });
    // Force a 500-type failure body leak check too.
    const fetchImpl2 = makeFetch(() => jsonResponse(500, `boom ${TOKEN}`));
    const { mgr: mgr2 } = manager(fetchImpl2, makeHistory());
    await assert.rejects(() => mgr2.list(), (err) => {
      assert.ok(!err.message.includes(TOKEN));
      return true;
    });
  } finally {
    console.error = origError;
  }
  assert.ok(!messages.join(' ').includes(TOKEN));
});

test('429 then 200 performs exactly one retry with sleep', async () => {
  const sleeps = [];
  let n = 0;
  const fetchImpl = makeFetch(() => {
    n += 1;
    if (n === 1) return jsonResponse(429, 'slow down', { 'retry-after': '2' });
    return jsonResponse(200, []);
  });
  const history = makeHistory();
  const { mgr } = manager(fetchImpl, history, {
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
  });
  const rows = await mgr.list();
  assert.equal(fetchImpl.calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
  assert.deepEqual(rows, []);
});

test('429 twice -> base44_busy 503', async () => {
  const fetchImpl = makeFetch(() => jsonResponse(429, 'slow down'));
  const { mgr } = manager(fetchImpl, makeHistory());
  await assert.rejects(() => mgr.list(), (err) => err.status === 503 && err.code === 'base44_busy');
  assert.equal(fetchImpl.calls.length, 2);
});

test('validation rejects */2 schedule before any fetch', async () => {
  const fetchImpl = makeFetch(() => jsonResponse(200, workflow()));
  const { mgr } = manager(fetchImpl, makeHistory());
  await assert.rejects(
    () => mgr.updateSchedule({
      workflow_id: 'w1', cron_expression: '*/2 * * * *', timezone: 'UTC',
      expected_cron: '*/15 * * * *', expected_timezone: 'UTC', request_id: 'req-badsched',
    }),
    (err) => err.status === 400 && /every 5 minutes/.test(err.message),
  );
  assert.equal(fetchImpl.calls.length, 0);
});
