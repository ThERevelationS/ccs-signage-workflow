import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildSync, transformSync } from 'esbuild';

function loadShared(path) {
  const source = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const module = { exports: {} };
  runInNewContext(source, { module, exports: module.exports, console, Date, Map, Set });
  return module.exports;
}
const paged = loadShared('base44/shared/pagedEntityRows.ts');
const source = transformSync(readFileSync('base44/functions/corebridgeSyncLock/entry.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;

function fixture(initial = []) {
  const rows = structuredClone(initial);
  let version = 0, handler;
  const entity = {
    async filter(query, sort, limit, skip) {
      if (typeof sort === 'object') throw new Error('options-object reads are not supported');
      return structuredClone(rows.filter((row) => row.setting_key === query.setting_key).slice(skip || 0, (skip || 0) + limit));
    },
    async create(data) {
      const row = { ...structuredClone(data), id: `row-${rows.length + 1}`, updated_date: `v${++version}` };
      rows.push(row);
      return structuredClone(row);
    },
    async updateMany(query, update) {
      const row = rows.find((item) => item.id === query.id && item.updated_date === query.updated_date);
      if (!row) return { updated: 0 };
      Object.assign(row, structuredClone(update.$set), { updated_date: `v${++version}` });
      return { updated: 1 };
    },
  };
  const sdk = { asServiceRole: { entities: { GlobalSettings: entity } } };
  const imports = {
    'npm:@base44/sdk@0.8.53': { createClientFromRequest: () => sdk },
    '../../shared/entityRateLimitRetry.ts': { withEntityRateLimitRetry: (value) => value },
    '../../shared/signShopSession.ts': { authenticateSignShopSession: async (_sdk, token) => {
      if (!token) throw Object.assign(new Error('Unauthenticated'), { status: 401 });
      return { role: token === 'admin' ? 'admin' : 'staff' };
    } },
    '../../shared/pagedEntityRows.ts': paged,
  };
  runInNewContext(source, {
    require: (name) => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; },
    module: { exports: {} }, exports: {}, Deno: { serve: (fn) => { handler = fn; } },
    Response, console, Date, Map, Set, Object, Number, String, Array, Error,
  });
  return {
    rows, entity,
    async invoke(action, runId, token = 'admin') {
      const response = await handler(new Request('https://example.test', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, run_id: runId, session_token: token }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

{
  const app = fixture([{ id: 'row', setting_key: 'corebridge_sync_lock', setting_value: {}, updated_date: 'v0' }]);
  const claims = await Promise.all([app.invoke('claim', 'one'), app.invoke('claim', 'two')]);
  assert.equal(claims.filter((item) => item.body.acquired).length, 1);
  const winner = claims[0].body.acquired ? 'one' : 'two';
  const loser = winner === 'one' ? 'two' : 'one';
  assert.equal((await app.invoke('heartbeat', loser)).body.acquired, false);
  assert.equal((await app.invoke('release', loser)).body.released, undefined);
  assert.equal((await app.invoke('heartbeat', winner)).body.acquired, true);
  app.rows[0].setting_value.expires_at = '2000-01-01T00:00:00.000Z';
  assert.equal((await app.invoke('claim', loser)).body.acquired, true);
  assert.equal((await app.invoke('release', loser)).body.released, true);
  assert.equal((await app.invoke('claim', winner)).body.acquired, true);
  assert.equal((await app.invoke('claim', 'three', 'staff')).status, 403);
  assert.equal((await app.invoke('status', '', '')).status, 401);
}
{
  const app = fixture([
    { id: 'z', setting_key: 'corebridge_sync_lock', setting_value: {}, updated_date: 'v0' },
    { id: 'a', setting_key: 'corebridge_sync_lock', setting_value: {}, updated_date: 'v0' },
  ]);
  const status = await app.invoke('status');
  assert.equal(status.body.canonical_id, 'a');
  assert.deepEqual(status.body.duplicate_ids, ['z']);
  const claim = await app.invoke('claim', 'one');
  assert.equal(claim.body.acquired, true);
  assert.equal(app.rows.find((row) => row.id === 'a').setting_value.run_id, 'one');
  assert.deepEqual(app.rows.find((row) => row.id === 'z').setting_value, {});
}
{
  const app = fixture();
  let unblockCreate, createdWaiting;
  const waiting = new Promise((resolve) => { createdWaiting = resolve; });
  const gate = new Promise((resolve) => { unblockCreate = resolve; });
  const original = app.entity.create;
  let calls = 0;
  app.entity.create = async (data) => {
    calls++;
    if (calls === 1) {
      createdWaiting();
      await gate;
      const row = await original(data);
      app.rows.find((item) => item.id === row.id).id = 'a';
      return { ...row, id: 'a' };
    }
    const row = await original(data);
    app.rows.find((item) => item.id === row.id).id = 'z';
    return { ...row, id: 'z' };
  };
  const slow = app.invoke('claim', 'slow');
  await waiting;
  const first = await app.invoke('claim', 'first');
  assert.equal(first.body.acquired, true);
  unblockCreate();
  const second = await slow;
  assert.equal(second.body.acquired, false);
  assert.equal(second.body.reason, 'already_running');
}
console.log('PASS corebridgeSyncLock authorization, CAS concurrency, expiry, ownership, duplicate election and delayed-create race');
