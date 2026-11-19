import assert from 'node:assert/strict';
import { createFoundationSaveSession } from '../src/components/estimator/foundation/foundationSaveSession.js';

let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '-', e.message); } };
const deferred = () => { let r; const p = new Promise(res => { r = res; }); return { p, resolve: r }; };
const ctx = (over = {}) => ({ sourceId: 'p1', editRevision: 1, loaded: true, ...over });

await ok('saved not_required', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ id: 'p1', updated_date: 'v2' }), syncBuilder: null });
  assert.equal(o.status, 'saved'); assert.equal(o.builderSync, 'not_required'); assert.equal(o.sourceSaved, true); assert.equal(o.sourceVersion, 'v2');
});
await ok('saved synced', async () => {
  const s = createFoundationSaveSession();
  let synced = 0;
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ id: 'p1', updated_date: 'v2' }), syncBuilder: async () => { synced++; } });
  assert.equal(o.status, 'saved'); assert.equal(o.builderSync, 'synced'); assert.equal(synced, 1);
});
await ok('source failed no builder', async () => {
  const s = createFoundationSaveSession();
  let synced = 0;
  const err = new Error('network down');
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => { throw err; }, syncBuilder: async () => { synced++; } });
  assert.equal(o.status, 'failed'); assert.equal(o.sourceSaved, false); assert.equal(synced, 0); assert.equal(o.error, err);
});
await ok('409 conflict classified', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => { const e = new Error('record changed by another session'); e.status = 409; throw e; }, syncBuilder: null });
  assert.equal(o.status, 'conflict');
});
await ok('builder failure -> partial', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ id: 'p1', updated_date: 'v2' }), syncBuilder: async () => { throw new Error('builder down'); } });
  assert.equal(o.status, 'partial'); assert.equal(o.sourceSaved, true); assert.equal(o.builderSync, 'pending'); assert.equal(o.sourceVersion, 'v2'); assert.ok(o.warnings.includes('builder_sync_failed'));
});
await ok('same-tick run promise identity + one write', async () => {
  const s = createFoundationSaveSession();
  let writes = 0;
  const d = deferred();
  const args = { sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => { writes++; await d.p; return { id: 'p1', updated_date: 'v2' }; }, syncBuilder: null };
  const r1 = s.run(args), r2 = s.run(args);
  assert.equal(r1, r2);
  d.resolve();
  const [o1, o2] = await Promise.all([r1, r2]);
  assert.equal(o1.status, 'saved'); assert.equal(o1, o2); assert.equal(writes, 1);
});
await ok('edit during await -> superseded keeps ack', async () => {
  const s = createFoundationSaveSession();
  let cur = ctx();
  const d = deferred();
  const p = s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => cur, saveSource: async () => { cur = ctx({ editRevision: 2 }); await d.p; return { id: 'p1', updated_date: 'v2' }; }, syncBuilder: null });
  d.resolve();
  const o = await p;
  assert.equal(o.status, 'superseded'); assert.equal(o.sourceSaved, true); assert.equal(o.sourceVersion, 'v2');
});
await ok('route change before write -> no call', async () => {
  const s = createFoundationSaveSession();
  let writes = 0, cur = ctx({ sourceId: 'p2' });
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => cur, saveSource: async () => { writes++; return {}; }, syncBuilder: null });
  assert.equal(o.status, 'superseded'); assert.equal(writes, 0); assert.equal(o.sourceSaved, false);
});
await ok('route after write -> superseded pending', async () => {
  const s = createFoundationSaveSession();
  let cur = ctx();
  const d = deferred();
  const p = s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => cur, saveSource: async () => { cur = ctx({ sourceId: 'p9' }); await d.p; return { id: 'p1', updated_date: 'v2' }; }, syncBuilder: async () => {} });
  d.resolve();
  const o = await p;
  assert.equal(o.status, 'superseded'); assert.equal(o.sourceSaved, true); assert.equal(o.builderSync, 'pending');
});
await ok('loaded false -> superseded', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx({ loaded: false }), saveSource: async () => ({}), syncBuilder: null });
  assert.equal(o.status, 'superseded');
});
await ok('sequential attempts allowed after settle', async () => {
  const s = createFoundationSaveSession();
  const o1 = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ id: 'p1', updated_date: 'v2' }), syncBuilder: null });
  const o2 = await s.run({ sourceId: 'p1', editRevision: 2, getCurrent: () => ctx({ editRevision: 2 }), saveSource: async () => ({ id: 'p1', updated_date: 'v3' }), syncBuilder: null });
  assert.equal(o1.status, 'saved'); assert.equal(o2.status, 'saved'); assert.notEqual(o1, o2);
  assert.equal(s.isSaving(), false);
});
await ok('changed-in-another-session literal -> conflict', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => { throw new Error('Foundation project changed in another session. Reload it before saving.'); }, syncBuilder: null });
  assert.equal(o.status, 'conflict');
});
await ok('missing id -> failed unverified', async () => {
  const s = createFoundationSaveSession();
  let synced = 0;
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ updated_date: 'v2' }), syncBuilder: async () => { synced++; } });
  assert.equal(o.status, 'failed'); assert.equal(o.sourceSaved, false); assert.equal(synced, 0);
});
await ok('wrong id -> failed unverified', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ id: 'pX', updated_date: 'v2' }), syncBuilder: null });
  assert.equal(o.status, 'failed'); assert.equal(o.sourceSaved, false);
});
await ok('missing version -> failed unverified', async () => {
  const s = createFoundationSaveSession();
  const o = await s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => ({ id: 'p1' }), syncBuilder: null });
  assert.equal(o.status, 'failed'); assert.equal(o.sourceSaved, false);
});
await ok('edit during builder await -> superseded synced', async () => {
  const s = createFoundationSaveSession();
  let cur = ctx();
  const d = deferred();
  const p = s.run({ sourceId: 'p1', editRevision: 1, getCurrent: () => cur, saveSource: async () => ({ id: 'p1', updated_date: 'v2' }), syncBuilder: async () => { cur = ctx({ editRevision: 2 }); await d.p; } });
  d.resolve();
  const o = await p;
  assert.equal(o.status, 'superseded'); assert.equal(o.sourceSaved, true); assert.equal(o.builderSync, 'synced');
});
await ok('inFlight installed before callbacks', async () => {
  const s = createFoundationSaveSession();
  let nested = null;
  const args = { sourceId: 'p1', editRevision: 1, getCurrent: () => ctx(), saveSource: async () => { nested = s.run(args); return { id: 'p1', updated_date: 'v2' }; }, syncBuilder: null };
  const outer = s.run(args);
  const o = await outer;
  assert.equal(o.status, 'saved');
  assert.equal(nested, outer);
});
console.log(`PASS save-session passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
