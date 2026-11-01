import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-base44-stub.mjs');
import { writeFileSync, rmSync } from 'node:fs';
// NOTE: esbuild inlines this stub into the bundle — the bundle's module object
// is NOT the same instance as an import() of this file. Anything the test
// overrides per-case must go through globalThis, which both copies share.
writeFileSync(stub, `
globalThis.__revisionRows = [];
globalThis.__revisionFilter = null; // test hook: (query, sort, limit, skip) => rows|throw
globalThis.__invokeCalls = [];
globalThis.__invokeResults = {}; // fnName -> response object, or Error to throw
export const base44 = {
  entities: { EstimateRevision: {
    filter: async (...args) => globalThis.__revisionFilter
      ? globalThis.__revisionFilter(...args)
      : (globalThis.__revisionRows || []).slice(),
    create: async (d) => ({ ...d, id: 'new' }),
    get: async () => null,
    updateMany: async () => ({ updated: 0 }),
  }},
  functions: { invoke: async (fn, body) => {
    globalThis.__invokeCalls.push({ fn, body });
    const r = globalThis.__invokeResults[fn];
    if (r instanceof Error) throw r;
    return r !== undefined ? r : { data: {} };
  } },
};
`);
const out = resolve(here, '.tmp-revision-service.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/estimateRevisionService.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub },
});
const svc = await import(pathToFileURL(out).href);
const calls = globalThis.__invokeCalls;
const results = globalThis.__invokeResults;

// getOpenEstimateRevision: latest open revision wins.
globalThis.__revisionRows = [
  { id: 'r1', estimate_id: 'e1', revision_status: 'open', revision_number: 1 },
  { id: 'r2', estimate_id: 'e1', revision_status: 'open', revision_number: 2 },
];
const open = await svc.getOpenEstimateRevision('e1');
assert.ok(open?.id, 'open revision returned');
assert.equal(await svc.getOpenEstimateRevision(''), null, 'missing id -> null');

// getOpenEstimateRevision issues ONE bounded filtered read with limit: 50 (#383).
{
  const filterCalls = [];
  globalThis.__revisionFilter = async (q, sort, limit, skip) => { filterCalls.push({ q, sort, limit, skip }); return []; };
  assert.equal(await svc.getOpenEstimateRevision('e1'), null);
  assert.equal(filterCalls.length, 1, 'one filtered read');
  assert.equal(filterCalls[0].limit, 50, 'open-revision read bounded at 50');
  assert.deepEqual(filterCalls[0].q, { estimate_id: 'e1', revision_status: 'open' }, 'query scoped to this estimate + open');
  assert.equal(filterCalls[0].sort, '-revision_number', 'newest revision first');
  globalThis.__revisionFilter = null;
}

// listEstimateRevisions: sorted desc by revision_number.
globalThis.__revisionRows = [
  { id: 'r1', estimate_id: 'e1', revision_status: 'completed', revision_number: 1 },
  { id: 'r3', estimate_id: 'e1', revision_status: 'completed', revision_number: 3 },
  { id: 'r2', estimate_id: 'e1', revision_status: 'completed', revision_number: 2 },
];
const list = await svc.listEstimateRevisions('e1');
assert.deepEqual(list.map((r) => r.revision_number), [3, 2, 1], 'descending revision order');
assert.deepEqual(await svc.listEstimateRevisions(''), [], 'missing id -> empty');

// listEstimateRevisions strict vs non-strict on a read failure (#384).
{
  globalThis.__revisionFilter = async () => { throw new Error('read denied'); };
  assert.deepEqual(await svc.listEstimateRevisions('e1'), [], 'non-strict swallows read failures');
  await assert.rejects(svc.listEstimateRevisions('e1', { strict: true }), /read denied/, 'strict propagates');
  globalThis.__revisionFilter = null;
}

// ---------- #395: startEstimateRevision / completeEstimateRevision ----------

// Validation: no estimate / no reason fail before any backend call.
globalThis.__revisionRows = [];
calls.length = 0;
await assert.rejects(svc.startEstimateRevision({ estimate: null, reason: 'x' }), /Estimate is required/);
await assert.rejects(svc.startEstimateRevision({ estimate: { id: 'e1' }, reason: '  ' }), /reason is required/);
assert.equal(calls.length, 0, 'no backend call on validation failure');

// Existing open revision short-circuits — the backend create is never invoked.
globalThis.__revisionRows = [{ id: 'r-open', estimate_id: 'e1', revision_status: 'open', revision_number: 4 }];
calls.length = 0;
{
  const rev = await svc.startEstimateRevision({ estimate: { id: 'e1', updated_date: 'v1' }, reason: 'edit' });
  assert.equal(rev.id, 'r-open', 'existing open revision returned');
  assert.equal(calls.length, 0, 'no ensureOpenEstimateRevision invoke when one exists');
}

// Fresh start: ensureOpenEstimateRevision invoked with the CAS anchor + reason.
globalThis.__revisionRows = [];
calls.length = 0;
results.ensureOpenEstimateRevision = { data: { revision: { id: 'r-new', revision_status: 'open', revision_number: 1 }, reused: false } };
{
  const rev = await svc.startEstimateRevision({
    estimate: { id: 'e1', updated_date: 'v9' }, reason: 'price change', sessionToken: 'tok',
  });
  assert.equal(rev.id, 'r-new');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'ensureOpenEstimateRevision');
  assert.equal(calls[0].body.estimate_id, 'e1');
  assert.equal(calls[0].body.expected_estimate_updated_date, 'v9', 'estimate version forwarded as CAS anchor');
  assert.equal(calls[0].body.reason, 'price change');
  assert.equal(calls[0].body.session_token, 'tok');
}

// Backend error + unverifiable response propagate instead of fabricating a revision.
calls.length = 0;
results.ensureOpenEstimateRevision = { data: { error: 'Estimate changed in another session' } };
await assert.rejects(
  svc.startEstimateRevision({ estimate: { id: 'e1' }, reason: 'x' }),
  /changed in another session/, 'backend error propagates');
results.ensureOpenEstimateRevision = { data: {} };
await assert.rejects(
  svc.startEstimateRevision({ estimate: { id: 'e1' }, reason: 'x' }),
  /could not be verified/, 'revision-less success still fails closed');
delete results.ensureOpenEstimateRevision;

// completeEstimateRevision: missing revision -> null, missing estimate -> throw.
assert.equal(await svc.completeEstimateRevision({ revision: null, estimate: { id: 'e1' } }), null);
await assert.rejects(svc.completeEstimateRevision({ revision: { id: 'r1' }, estimate: null }), /Estimate is required/);

// No session token -> graceful skip (audit write deferred, transition unaffected).
calls.length = 0;
assert.equal(await svc.completeEstimateRevision({ revision: { id: 'r1', estimate_id: 'e1' }, estimate: { id: 'e1' }, sessionToken: '' }), null,
  'no session -> skipped, not failed');
assert.equal(calls.length, 0, 'no backend call without a session token');

// Happy path: updateEstimateRevisionAudit complete_manual_revision invoked with CAS anchors.
calls.length = 0;
results.updateEstimateRevisionAudit = { data: { revision: { id: 'r1', revision_status: 'completed' } } };
{
  const rev = await svc.completeEstimateRevision({
    revision: { id: 'r1', estimate_id: 'e1', updated_date: 'rv7' },
    estimate: { id: 'e1' },
    sessionToken: 'tok',
  });
  assert.equal(rev.revision_status, 'completed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'updateEstimateRevisionAudit');
  assert.equal(calls[0].body.action, 'complete_manual_revision');
  assert.equal(calls[0].body.estimate_id, 'e1');
  assert.equal(calls[0].body.revision_id, 'r1');
  assert.equal(calls[0].body.expected_revision_updated_date, 'rv7', 'revision version forwarded as CAS anchor');
  assert.equal(calls[0].body.session_token, 'tok');
}

// Completion errors propagate.
results.updateEstimateRevisionAudit = { data: { error: 'revision moved' } };
await assert.rejects(
  svc.completeEstimateRevision({ revision: { id: 'r1', estimate_id: 'e1' }, estimate: { id: 'e1' }, sessionToken: 't' }),
  /revision moved/, 'backend completion error propagates');
delete results.updateEstimateRevisionAudit;

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS revision service (38 cases)');
process.exit(0);
