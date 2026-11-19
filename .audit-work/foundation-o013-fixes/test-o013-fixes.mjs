// O-013 fix verification — bundles the REAL remote gateway/function modules
// (fresh pulls under remote/) and the fixed candidates under fixed/, then
// proves each fixed call now uses an allowed op/auth path:
//
//   F-2  staffEntities.AllInOneEstimate.update() -> 403 (RED baseline),
//        updateMany({id,updated_date},{$set}) -> 200 (GREEN) — driven
//        end-to-end through the REAL staffEntities client facade into the
//        REAL staffEntityWrite gateway bundle.
//   F-3  updateEstimateRevisionAudit complete_manual_revision: caller-scoped
//        AllInOneEstimate.get -> 404 for every actor (RED baseline bundle),
//        asServiceRole read -> 200 (GREEN fixed bundle).
//   F-4  AdminAuditLog read via staffEntities -> staffDataRead ADMIN_READABLE:
//        admin -> 200 rows, staff -> denied->[] (GREEN through the REAL
//        staffEntities batch path into the REAL staffDataRead bundle).
//
// Run: node .audit-work/foundation-o013-fixes/test-o013-fixes.mjs
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = (p) => path.join(here, 'remote', p);
const F = (p) => path.join(here, 'fixed', p);

let passed = 0, failed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok', name); }
  catch (e) { failed++; console.error('  FAIL', name, '-', e.message); }
};

// ---------------------------------------------------------------------------
// Shared stubs + bundling helpers (same pattern as scripts/test-foundation-*).
// ---------------------------------------------------------------------------
const STUBS = {
  // The SDK client handed to Deno functions. `entities` is the CALLER-scoped
  // lane — simulates backend-only RLS by rejecting every access; the service
  // lane is the in-memory store the gateways actually use post-auth.
  sdk: `export function createClientFromRequest() {
    const denied = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => { const e = new Error('denied by RLS'); e.status = 403; throw e; } }) });
    globalThis.__base44 = {
      entities: denied,
      asServiceRole: { entities: globalThis.__SVC_ENTITIES__ },
      auth: { me: async () => globalThis.__PLATFORM_USER__ ?? null },
      integrations: { Core: {} },
    };
    return globalThis.__base44;
  }`,
  signShopSession: `export function authenticateSignShopSession(_c, _t) {
    if (!globalThis.__USER__) { const e = new Error('unauthorized'); e.status = 401; throw e; }
    return Promise.resolve(globalThis.__USER__);
  }`,
  fleetStaffSession: `export function resolveFleetStaffUser(_c, _t) {
    return Promise.resolve(globalThis.__USER__ ?? null);
  }`,
  retry: `export function withEntityRateLimitRetry(c) { return c; }
    export function entityCallIsolateStats() { return { calls: 0 }; }`,
  fleetInvoke: `export function isFleetCoolingDown() { return false; }
    export async function invokeFleet(name, payload) { return globalThis.__invokeFleet(name, payload); }`,
  emailGate: `export function getSessionToken() { return globalThis.__SESSION_TOKEN__ ?? null; }`,
  rateLimitCooldown: `export function noteRateLimit() {} export function isAppCoolingDown() { return false; }`,
};

const stubPlugin = (extra = {}) => ({
  name: 'stubs',
  setup(b) {
    const map = {
      '@base44/sdk': 'sdk',
      'signShopSession': 'signShopSession',
      'fleetStaffSession': 'fleetStaffSession',
      'entityRateLimitRetry': 'retry',
      'fleet/fleetInvoke': 'fleetInvoke',
      'auth/EmailGate': 'emailGate',
      'rateLimitCooldown': 'rateLimitCooldown',
      ...extra,
    };
    b.onResolve({ filter: /.*/ }, (a) => {
      for (const [needle, stub] of Object.entries(map)) {
        if (a.path.includes(needle)) return { path: stub, namespace: 'stub' };
      }
      // shared/*.ts imports inside function entries resolve to the pulled
      // remote copies so the REAL shared modules are exercised.
      const m = a.path.match(/shared\/([^'"]+)$/);
      if (m) {
        const p = R('base44_shared_' + m[1].replace(/\//g, '_'));
        if (fs.existsSync(p)) return { path: p };
      }
      return undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'ts' }));
  },
});

const handlers = new Map();
let bundleSeq = 0;
async function bundleHandler(entry, extra = {}) {
  const out = await esbuild.build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
    write: false, plugins: [stubPlugin(extra)], logLevel: 'silent',
  });
  const tmp = path.join(os.tmpdir(), `o013-${process.pid}-${bundleSeq++}.mjs`);
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  const key = Symbol('deno');
  const realDeno = globalThis.Deno;
  globalThis.Deno = { serve: (h) => handlers.set(key, h) };
  await import(pathToFileURL(tmp).href);
  globalThis.Deno = realDeno;
  return handlers.get(key);
}

const req = (body) => new Request('http://x/', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const call = (handler, body) => handler(req(body)).then((r) => r.json().then((j) => ({ status: r.status, body: j })));

// --- In-memory entity store (service-role lane) ------------------------------
const store = {};
const rows = (t) => (store[t] ??= []);
const mkEntity = (t) => ({
  create: async (d) => { const r = { id: `id${rows(t).length + 1}`, created_date: 'c', updated_date: 'v1', ...d }; rows(t).push(r); return r; },
  get: async (i) => rows(t).find((r) => r.id === i) || null,
  filter: async (q, sort, limit, skip) => {
    let out = rows(t).filter((r) => Object.entries(q || {}).every(([k, v]) => r[k] === v));
    if (typeof sort === 'string' && sort) {
      const f = sort.replace(/^-/, '');
      out = [...out].sort((a, b) => String(a[f] ?? '').localeCompare(String(b[f] ?? '')));
      if (sort.startsWith('-')) out.reverse();
    }
    return out.slice(skip || 0, (skip || 0) + (limit || 100));
  },
  list: async (sort, limit, skip) => mkEntity(t).filter({}, sort, limit, skip),
  update: async (i, d) => { const r = rows(t).find((x) => x.id === i); if (r) Object.assign(r, d); return r; },
  updateMany: async (q, u) => {
    let n = 0; const patch = (u && u.$set) || {};
    for (const r of rows(t)) {
      if ((!q.id || r.id === q.id) && (!q.updated_date || r.updated_date === q.updated_date)) { Object.assign(r, patch); n++; }
    }
    return { updated: n };
  },
  delete: async (i) => { const k = rows(t).findIndex((r) => r.id === i); if (k >= 0) rows(t).splice(k, 1); },
  deleteMany: async (q) => { const b = rows(t).length; store[t] = rows(t).filter((r) => r.id !== q.id); return { deleted: b - rows(t).length }; },
  count: async (q) => rows(t).filter((r) => Object.entries(q || {}).every(([k, v]) => r[k] === v)).length,
});
globalThis.__SVC_ENTITIES__ = new Proxy({}, { get: (_, t) => mkEntity(String(t)) });
globalThis.__USER__ = { id: 'u1', email: 'staff@x.co', role: 'user' };
globalThis.__PLATFORM_USER__ = null;
globalThis.__SESSION_TOKEN__ = 'tok';

// ---------------------------------------------------------------------------
console.log('== O-013 fix verification ==');

// 1) REAL write gateway — prove .update dies and anchored updateMany lands. --
const sew = await bundleHandler(R('base44_functions_staffEntityWrite_entry.ts'));

await ok('RED  gateway: op=update AllInOneEstimate -> 403 (the old call shape)', async () => {
  const r = await call(sew, { entity: 'AllInOneEstimate', op: 'update', id: 'e1', data: { status: 'sent' } });
  assert.equal(r.status, 403);
});

await ok('GREEN gateway: updateMany quote_expired -> 200 updated:1', async () => {
  store.AllInOneEstimate = [{ id: 'e1', updated_date: 'v1', status: 'sent', quote_expired: false }];
  const r = await call(sew, {
    entity: 'AllInOneEstimate', op: 'updateMany', id: 'e1',
    query: { id: 'e1', updated_date: 'v1' }, update: { $set: { quote_expired: true } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.updated, 1);
  assert.equal(rows('AllInOneEstimate')[0].quote_expired, true);
});

await ok('GREEN gateway: updateMany status -> 200 updated:1', async () => {
  store.AllInOneEstimate = [{ id: 'e1', updated_date: 'v1', status: 'draft' }];
  const r = await call(sew, {
    entity: 'AllInOneEstimate', op: 'updateMany', id: 'e1',
    query: { id: 'e1', updated_date: 'v1' }, update: { $set: { status: 'sent' } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.updated, 1);
  assert.equal(rows('AllInOneEstimate')[0].status, 'sent');
});

await ok('GREEN gateway: updateMany archive fields -> 200 updated:1', async () => {
  store.AllInOneEstimate = [{ id: 'e2', updated_date: 'v9', status: 'draft' }];
  const r = await call(sew, {
    entity: 'AllInOneEstimate', op: 'updateMany', id: 'e2',
    query: { id: 'e2', updated_date: 'v9' },
    update: { $set: { status: 'archived', archived_at: 't', archived_reason: 'Merged into #1' } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.updated, 1);
  assert.equal(rows('AllInOneEstimate')[0].status, 'archived');
});

await ok('contract: stale anchor -> updated:0 (drives the bulk-status failure check)', async () => {
  store.AllInOneEstimate = [{ id: 'e3', updated_date: 'v-new', status: 'draft' }];
  const r = await call(sew, {
    entity: 'AllInOneEstimate', op: 'updateMany', id: 'e3',
    query: { id: 'e3', updated_date: 'v-old' }, update: { $set: { status: 'sent' } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.updated, 0, 'zero-match is a silent 200 — caller must check result.updated');
  assert.equal(rows('AllInOneEstimate')[0].status, 'draft', 'row untouched');
});

await ok('contract: missing updated_date anchor -> 400 (never an unanchored write)', async () => {
  const r = await call(sew, {
    entity: 'AllInOneEstimate', op: 'updateMany', id: 'e3',
    query: { id: 'e3' }, update: { $set: { status: 'sent' } },
  });
  assert.equal(r.status, 400);
});

// 2) REAL staffEntities client -> REAL gateway (end-to-end call shape). -------
const staffMod = await (async () => {
  const out = await esbuild.build({
    entryPoints: [R('src_components_staff_staffEntities.js')],
    bundle: true, format: 'esm', platform: 'node', write: false,
    plugins: [stubPlugin()], logLevel: 'silent',
  });
  const tmp = path.join(os.tmpdir(), `o013-${process.pid}-staff.mjs`);
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
})();
const { staffEntities } = staffMod;

// Route the client's invokes into the real gateway handlers.
const sdr = await bundleHandler(R('base44_functions_staffDataRead_entry.ts'));
globalThis.__invokeFleet = async (name, payload) => {
  const h = name === 'staffEntityWrite' ? sew : name === 'staffDataRead' ? sdr : null;
  if (!h) throw new Error('unexpected invoke ' + name);
  const res = await call(h, { session_token: 'tok', ...payload });
  if (res.status >= 400) throw Object.assign(new Error(res.body?.error || 'invoke failed'), { status: res.status });
  return res.body;
};

await ok('RED e2e: staffEntities.AllInOneEstimate.update -> 403 through real gateway', async () => {
  await assert.rejects(
    () => staffEntities.AllInOneEstimate.update('e1', { status: 'sent' }),
    (e) => e.status === 403,
  );
});

await ok('GREEN e2e: staffEntities updateMany(anchor,$set) -> result.updated===1', async () => {
  store.AllInOneEstimate = [{ id: 'e5', updated_date: 'v5', status: 'draft' }];
  const result = await staffEntities.AllInOneEstimate.updateMany(
    { id: 'e5', updated_date: 'v5' }, { $set: { status: 'sent' } },
  );
  assert.equal(result?.updated, 1);
  assert.equal(rows('AllInOneEstimate')[0].status, 'sent');
});

// 3) F-4 — REAL staffEntities.AdminAuditLog.filter -> REAL staffDataRead. -----
await ok('GREEN e2e: admin reads AdminAuditLog rows via staffEntities (batch path)', async () => {
  store.AdminAuditLog = [
    { id: 'a1', at: '2026-11-01T00:00:00Z', action: 'update_user', actor_email: 'admin@x.co' },
    { id: 'a2', at: '2026-11-02T00:00:00Z', action: 'revoke_session', actor_email: 'admin@x.co' },
  ];
  globalThis.__USER__ = { id: 'u0', email: 'admin@x.co', role: 'admin' };
  globalThis.__SESSION_TOKEN__ = 'tok-admin';
  const out = await staffEntities.AdminAuditLog.filter({}, '-at', 150);
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 2, JSON.stringify(out));
  assert.equal(out[0].id, 'a2', 'sorted -at');
});

await ok('fail-closed: staff (non-admin) AdminAuditLog read -> denied -> []', async () => {
  // A different user means a different session token — the client's 30s read
  // cache and denied-scope are keyed by token, so this can never see the
  // admin's rows.
  globalThis.__USER__ = { id: 'u1', email: 'staff@x.co', role: 'user' };
  globalThis.__SESSION_TOKEN__ = 'tok-staff';
  const out = await staffEntities.AdminAuditLog.filter({}, '-at', 150);
  assert.deepEqual(out, [], 'non-admin resolves empty, never rows');
  globalThis.__SESSION_TOKEN__ = 'tok';
});

await ok('fail-closed: staffDataRead AdminAuditLog without session -> 401', async () => {
  globalThis.__USER__ = null;
  const r = await call(sdr, { entity: 'AdminAuditLog', query: {}, sort: '-at', limit: 150 });
  assert.equal(r.status, 401);
  globalThis.__USER__ = { id: 'u1', email: 'staff@x.co', role: 'user' };
});

// 4) F-3 — updateEstimateRevisionAudit: baseline 404 vs fixed 200. ------------
const revisionFixture = () => {
  store.EstimateRevision = [{
    id: 'r1', estimate_id: 'e9', revision_status: 'open', revision_type: 'manual_revision',
    updated_date: 'rv1', previous_status: 'draft',
    estimate_snapshot_before: { status: 'draft', quote_total: 100 },
  }];
  store.AllInOneEstimate = [{ id: 'e9', status: 'sent', quote_total: 250, total_cost: 80, quote_version: 2, updated_date: 'ev1' }];
};

const ueraBase = await bundleHandler(R('updateEstimateRevisionAudit_entry.ts'));
const ueraFixed = await bundleHandler(F('base44/functions/updateEstimateRevisionAudit/entry.ts'));

await ok('RED  baseline fn: complete_manual_revision -> 404 (caller-scoped read dead)', async () => {
  revisionFixture();
  const r = await call(ueraBase, { action: 'complete_manual_revision', estimate_id: 'e9', revision_id: 'r1' });
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.match(r.body.error, /could not be verified/);
});

await ok('GREEN fixed fn: complete_manual_revision -> 200 revision completed', async () => {
  revisionFixture();
  const r = await call(ueraFixed, { action: 'complete_manual_revision', estimate_id: 'e9', revision_id: 'r1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reused, false);
  assert.equal(r.body.revision.revision_status, 'completed');
  assert.equal(r.body.revision.quote_version, 2);
  assert.equal(r.body.revision.new_status, 'sent');
  assert.ok(r.body.revision.completed_at, 'completed_at stamped');
});

await ok('GREEN fixed fn: attach_delivery_evidence regression -> 200', async () => {
  const { estimateQuoteIssueKey } = await import(pathToFileURL(R('base44_shared_estimateRevisionAudit.ts')).href);
  const key = estimateQuoteIssueKey('e9', 3);
  store.EstimateRevision = [{
    id: 'r2', estimate_id: 'e9', revision_status: 'completed', revision_type: 'quote_issue',
    updated_date: 'rv2', quote_issue_key: key, quote_version: 3,
    estimate_snapshot_before: { quote_version: 2 }, estimate_snapshot_after: { quote_version: 3 },
  }];
  const r = await call(ueraFixed, {
    action: 'attach_delivery_evidence', estimate_id: 'e9', quote_version: 3,
    delivery_evidence: { gmail_message_id: 'gm1', sent_at: '2026-11-03T10:00:00Z' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reused, false);
  assert.equal(r.body.revision.delivery_evidence.gmail_message_id, 'gm1');
});

// 5) F-2c — the merge-archive path emits the gateway-legal op end-to-end. -----
const { replaceEstimateFieldsIfUnchanged, expectedEstimateFields } = await (async () => {
  const out = await esbuild.build({
    entryPoints: [R('estimatePersistence.js')], bundle: true, format: 'esm',
    platform: 'node', write: false, logLevel: 'silent',
  });
  const tmp = path.join(os.tmpdir(), `o013-${process.pid}-ep.mjs`);
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
})();

await ok('GREEN e2e: replaceEstimateFieldsIfUnchanged archive -> real gateway write lands', async () => {
  store.AllInOneEstimate = [{
    id: 'sec1', updated_date: 'sv1', status: 'calculated',
    archived_at: undefined, archived_reason: undefined,
  }];
  const secondary = { ...(rows('AllInOneEstimate')[0]) };
  const fields = { status: 'archived', archived_at: 'now', archived_reason: 'Merged into #7' };
  await replaceEstimateFieldsIfUnchanged({
    entity: staffEntities.AllInOneEstimate,   // REAL client facade
    estimateId: secondary.id,
    expectedFields: expectedEstimateFields(secondary, fields),
    guardFields: { updated_date: secondary.updated_date },
    nextFields: fields,
    label: 'Estimate merge archive',
  });
  // The write landed through the real gateway — the store is source of truth.
  // (The helper's own post-write re-read can hit staffDataRead's 45s response
  // cache and return the pre-write row — pre-existing gateway behavior every
  // CAS caller already lives with; the merge path keeps its intended
  // secondaryAfter for the audit snapshot instead of trusting that re-read.)
  assert.equal(rows('AllInOneEstimate')[0].status, 'archived');
  assert.equal(rows('AllInOneEstimate')[0].archived_reason, 'Merged into #7');
});

await ok('e2e: merge-archive on a drifted row throws (reaches the alert path)', async () => {
  store.AllInOneEstimate = [{ id: 'sec2', updated_date: 'sv-new', status: 'sent' }];
  const secondary = { id: 'sec2', updated_date: 'sv-old', status: 'calculated' };
  const fields = { status: 'archived', archived_at: 'now', archived_reason: 'x' };
  await assert.rejects(
    () => replaceEstimateFieldsIfUnchanged({
      entity: staffEntities.AllInOneEstimate,
      estimateId: secondary.id,
      expectedFields: expectedEstimateFields(secondary, fields),
      guardFields: { updated_date: secondary.updated_date },
      nextFields: fields,
      label: 'Estimate merge archive',
    }),
    /changed in another session|could not verify|repeatedly/,
  );
});

// 6) Static checks on the fixed candidates -----------------------------------
const read = (p) => fs.readFileSync(p, 'utf8');
await ok('static: no staffEntities.AllInOneEstimate.update( call remains', async () => {
  for (const p of ['fixed/src/pages/EstimatorQueues.jsx', 'fixed/src/pages/EstimateDetail.jsx']) {
    const src = read(path.join(here, p));
    const bad = src.match(/staffEntities\.AllInOneEstimate\.update\s*\(/g);
    assert.equal(bad, null, `${p} still calls the denied op`);
  }
});

await ok('static: fixed panel imports staffEntities and no raw AdminAuditLog call', async () => {
  const src = read(F('src/components/estimator/EstimatorAuditPanel.jsx'));
  assert.match(src, /import \{ staffEntities \} from "@\/components\/staff\/staffEntities";/);
  assert.match(src, /staffEntities\.AdminAuditLog\.filter/);
  assert.equal(src.match(/base44\.entities\.AdminAuditLog/g), null);
});

await ok('static: fixed uera reads AllInOneEstimate via asServiceRole', async () => {
  const src = read(F('base44/functions/updateEstimateRevisionAudit/entry.ts'));
  assert.equal(src.match(/base44\.entities\.AllInOneEstimate/g), null);
  assert.match(src, /base44\.asServiceRole\.entities\.AllInOneEstimate/);
  assert.equal(src.match(/EstimateUser/g), null, 'no caller-scope handle left');
});

// 7) Syntax-check every fixed file with esbuild. ------------------------------
await ok('syntax: fixed files transform cleanly', async () => {
  for (const [p, loader] of [
    ['src/pages/EstimatorQueues.jsx', 'jsx'],
    ['src/pages/EstimateDetail.jsx', 'jsx'],
    ['src/components/estimator/EstimatorAuditPanel.jsx', 'jsx'],
    ['base44/functions/updateEstimateRevisionAudit/entry.ts', 'ts'],
  ]) {
    await esbuild.transform(read(F(p)), { loader });
  }
});

console.log(`\nO-013 fixes: passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
