import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

const baselineOnly = process.argv.includes('--baseline');
const ENTRY = baselineOnly
  ? '.audit-work/foundation-save01/before/staffEntityWrite.entry.remote.lf.ts'
  : 'base44/functions/staffEntityWrite/entry.ts';
if (baselineOnly && !fs.existsSync(ENTRY)) { console.error('baseline snapshot missing:', ENTRY); process.exit(2); }

const STUBS = {
  sdk: `export function createClientFromRequest(req){ const entities = globalThis.__ENTITIES__; globalThis.__base44 = { entities, asServiceRole: { entities }, auth: { me: async () => globalThis.__USER__ }, integrations: { Core: {} } }; return globalThis.__base44; }`,
  session: `export function authenticateSignShopSession(_client, _token){ if (!globalThis.__USER__) { const e = new Error('unauthorized'); e.status = 401; throw e; } return Promise.resolve(globalThis.__USER__); }`,
  retry: `export function withEntityRateLimitRetry(client){ return client; }`,
};
const plugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /signShopSession/ }, () => ({ path: 'session', namespace: 'stub' }));
    b.onResolve({ filter: /entityRateLimitRetry/ }, () => ({ path: 'retry', namespace: 'stub' }));
    b.onResolve({ filter: /@base44\/sdk/ }, () => ({ path: 'sdk', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'ts' }));
  },
};
const out = await esbuild.build({
  entryPoints: [path.resolve(ENTRY)],
  bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin],
});
let handler;
globalThis.Deno = { serve: h => { handler = h; } };
const tmp = path.join(os.tmpdir(), 'sew-bundle-' + process.pid + '.mjs');
fs.writeFileSync(tmp, out.outputFiles[0].text);
await import(pathToFileURL(tmp).href);

const entities = {};
const rows = t => (entities[t] ??= []);
const mk = t => ({
  create: async d => { const r = { id: 'id' + (rows(t).length + 1), ...d }; rows(t).push(r); return r; },
  get: async i => rows(t).find(r => r.id === i) || null,
  filter: async q => rows(t).filter(r => Object.entries(q || {}).every(([k, v]) => r[k] === v)),
  update: async (i, d) => { const r = rows(t).find(x => x.id === i); if (r) Object.assign(r, d); return r; },
  updateMany: async (q, u) => { let n = 0; const patch = (u && u.$set) || {}; for (const r of rows(t)) if ((!q.id || r.id === q.id) && (!q.updated_date || r.updated_date === q.updated_date)) { Object.assign(r, patch); n++; } return { updated: n }; },
  deleteMany: async q => { const before = rows(t).length; entities[t] = rows(t).filter(r => r.id !== q.id); return { deleted: before - rows(t).length }; },
});
globalThis.__ENTITIES__ = new Proxy({}, { get: (_, t) => mk(t) });
globalThis.__USER__ = { id: 'staff1', role: 'staff', email: 's@x.co' };
const req = body => new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const call = body => handler(req(body)).then(r => r.json().then(j => ({ status: r.status, body: j })));

if (baselineOnly) {
  await ok('baseline: FoundationProject create -> 403', async () => {
    const r = await call({ entity: 'FoundationProject', op: 'create', data: { project_name: 'T' } });
    assert.equal(r.status, 403);
  });
  await ok('baseline: FoundationProject updateMany -> 403', async () => {
    const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { $set: { a: 2 } } });
    assert.equal(r.status, 403);
  });
  console.log(`BASELINE write-gateway passed=${passed} failed=${failed}`);
  process.exit(failed ? 1 : 0);
}

await ok('staff create FoundationProject 200', async () => {
  entities.FoundationProject = [];
  const r = await call({ entity: 'FoundationProject', op: 'create', data: { project_name: 'T' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.record.project_name, 'T');
});
await ok('CAS updateMany match -> updated 1', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { $set: { a: 2 } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.updated, 1);
});
await ok('stale updated_date -> updated 0, no overwrite', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v9', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { $set: { a: 2 } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.updated, 0);
  assert.equal(entities.FoundationProject[0].a, 1);
});
await ok('unauth -> 401', async () => {
  globalThis.__USER__ = null;
  const r = await call({ entity: 'FoundationProject', op: 'create', data: {} });
  assert.equal(r.status, 401);
  globalThis.__USER__ = { id: 'staff1', role: 'staff', email: 's@x.co' };
});
await ok('Foundation update/delete/deleteMany -> 403', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  for (const op of ['update', 'delete', 'deleteMany']) {
    const r = await call({ entity: 'FoundationProject', op, id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { $set: { a: 1 } }, data: { a: 1 } });
    assert.equal(r.status, 403, op + ':' + r.status);
  }
});
await ok('non-$set update shape -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { a: 2 } });
  assert.equal(r.status, 400);
});
await ok('missing updated_date in query -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1' }, update: { $set: { a: 2 } } });
  assert.equal(r.status, 400);
});
await ok('extra query key -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1', a: 1 }, update: { $set: { a: 2 } } });
  assert.equal(r.status, 400);
});
await ok('operator object in query value -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: { $ne: 'v1' } }, update: { $set: { a: 2 } } });
  assert.equal(r.status, 400);
  assert.equal(entities.FoundationProject[0].a, 1);
});
await ok('non-string query values (array/number/null) -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  for (const v of [['v1'], 5, null]) {
    const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: v }, update: { $set: { a: 9 } } });
    assert.equal(r.status, 400, JSON.stringify(v) + ':' + r.status);
  }
  assert.equal(entities.FoundationProject[0].a, 1);
});
await ok('query id mismatch body id -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'other', updated_date: 'v1' }, update: { $set: { a: 2 } } });
  assert.equal(r.status, 400);
});
await ok('nested $ in patch -> 400', async () => {
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  const r = await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { $set: { nested: { $where: 1 } } } });
  assert.equal(r.status, 400);
});
await ok('nested $ in data -> 400', async () => {
  entities.FoundationProject = [];
  const r = await call({ entity: 'FoundationProject', op: 'create', data: { project_name: 'T', meta: { $set: 1 } } });
  assert.equal(r.status, 400);
});
await ok('all 4 system fields stripped create+patch', async () => {
  entities.FoundationProject = [];
  const r = await call({ entity: 'FoundationProject', op: 'create', data: { project_name: 'T', id: 'spoof', created_by: 'evil@x', updated_date: 'zz', created_date: 'yy' } });
  const rec = (r.body && r.body.record) || {};
  assert.notEqual(rec.id, 'spoof'); assert.equal(rec.created_by, undefined); assert.equal(rec.updated_date, undefined); assert.equal(rec.created_date, undefined);
  entities.FoundationProject = [{ id: 'id1', updated_date: 'v1', a: 1 }];
  await call({ entity: 'FoundationProject', op: 'updateMany', id: 'id1', query: { id: 'id1', updated_date: 'v1' }, update: { $set: { created_by: 'evil@x', updated_date: 'zz', created_date: 'yy', id: 'spoof', a: 3 } } });
  const row = entities.FoundationProject[0];
  assert.equal(row.a, 3); assert.equal(row.updated_date, 'v1'); assert.equal(row.created_by, undefined); assert.equal(row.created_date, undefined); assert.equal(row.id, 'id1');
});
await ok('unknown entity -> 403', async () => {
  const r = await call({ entity: 'NopeEntity', op: 'create', data: {} });
  assert.equal(r.status, 403);
});
await ok('TaxGroup nonadmin -> 403', async () => {
  const r = await call({ entity: 'TaxGroup', op: 'create', data: { group_name: 'x', tax_percent: 7 } });
  assert.equal(r.status, 403);
});
await ok('LaborLevel nonadmin -> 403', async () => {
  const r = await call({ entity: 'LaborLevel', op: 'create', data: { level_name: 'x' } });
  assert.equal(r.status, 403);
});
try { fs.rmSync(tmp, { force: true }); } catch { }
console.log(`PASS write-gateway passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
