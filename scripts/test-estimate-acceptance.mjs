import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  installDeno, fakeRequest, responseOf, makeEntity, makeSessionToken,
  writeSdkStub, setStubEntities, bundleFunction, importBundled,
} from './lib/backendFunctionTestKit.mjs';

// Backlog §16 #379 + #397: recordEstimateAcceptance — stub entities +
// dedupe-by-version (reused:true on an existing active acceptance for the
// same quote_version) and canonicalAcceptance earliest-created-wins
// (a concurrent duplicate is discarded for the earlier canonical row).

const here = dirname(fileURLToPath(import.meta.url));
const getHandler = installDeno();

const stubFile = resolve(here, '.tmp-sdk-stub-acceptance.mjs');
writeSdkStub(stubFile, {});
const out = resolve(here, '.tmp-fn-recordEstimateAcceptance.mjs');
bundleFunction({ here, entry: '../base44/functions/recordEstimateAcceptance/entry.ts', stubFile, outFile: out });
setStubEntities({});
await importBundled(out);
const handler = getHandler();
assert.equal(typeof handler, 'function', 'Deno.serve handler captured');

const SESSION_EMAIL = 'staff@example.com';
const token = makeSessionToken(SESSION_EMAIL);

const freshEntities = () => ({
  AuthorizedEmail: makeEntity([{ id: 'u1', email: SESSION_EMAIL, role: 'staff', full_name: 'Staff' }]),
  UserSession: makeEntity([]),
  AllInOneEstimate: makeEntity([]),
  EstimateAcceptance: makeEntity([]),
  EstimateQuoteDelivery: makeEntity([]),
  EstimatingRequest: makeEntity([]),
});
setStubEntities(freshEntities());

const sentEstimate = (over = {}) => ({
  id: 'e1', status: 'sent', quote_version: 2, quote_total: 500,
  order_contact: 'Jane Buyer', updated_date: 'v1', customer_id: '', ...over,
});

const recordBody = (over = {}) => ({
  session_token: token,
  estimate_id: 'e1',
  quote_version: 2,
  accepted_by_name: 'Jane Buyer',
  accepted_at: new Date(Date.now() - 60000).toISOString(),
  acceptance_method: 'signed_quote',
  ...over,
});

// ---------- Auth gate: no/invalid session -> 401 ----------
{
  const r = await handler(fakeRequest(recordBody({ session_token: '' })));
  const { status, data } = await responseOf(r);
  assert.equal(status, 401, 'missing session token -> 401');
  assert.match(data.error, /Authentication/i);
  const r2 = await handler(fakeRequest(recordBody({ session_token: 'bad.token' })));
  assert.equal(r2.status, 401, 'invalid signature -> 401');
}

// ---------- Validation: bad method, future date, wrong status/version ----------
{
  setStubEntities(freshEntities());
  const bad = await handler(fakeRequest(recordBody({ acceptance_method: 'telepathy' })));
  assert.equal(bad.status, 400, 'unknown acceptance method rejected');
  const future = await handler(fakeRequest(recordBody({ accepted_at: new Date(Date.now() + 3600000).toISOString() })));
  assert.equal(future.status, 400, 'future acceptance date rejected');
}

{
  const entities = freshEntities();
  entities.AllInOneEstimate = makeEntity([sentEstimate({ status: 'draft' })]);
  setStubEntities(entities);
  const r = await handler(fakeRequest(recordBody()));
  assert.equal(r.status, 409, 'draft estimate cannot record acceptance');
}

{
  const entities = freshEntities();
  entities.AllInOneEstimate = makeEntity([sentEstimate({ quote_version: 1 })]);
  setStubEntities(entities);
  const r = await handler(fakeRequest(recordBody({ quote_version: 2 })));
  assert.equal(r.status, 409, 'stale quote_version rejected');
}

// ---------- Happy path: creates an immutable acceptance row ----------
{
  const entities = freshEntities();
  entities.AllInOneEstimate = makeEntity([sentEstimate()]);
  setStubEntities(entities);
  const r = await handler(fakeRequest(recordBody()));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200);
  assert.equal(data.reused, false, 'first acceptance is fresh');
  assert.equal(data.acceptance.quote_version, 2);
  assert.equal(data.acceptance.quote_issue_key, 'estimate:e1:quote:v2');
  assert.equal(data.acceptance.accepted_by_name, 'Jane Buyer');
  assert.equal(entities.EstimateAcceptance.rows.length, 1, 'one acceptance row persisted');
  // Mirror fields land on the estimate via updateMany.
  assert.ok(entities.AllInOneEstimate.rows[0].accepted_by_name, 'estimate mirror fields patched');
}

// ---------- Dedupe-by-version: an active acceptance for this version is reused ----------
{
  const entities = freshEntities();
  entities.AllInOneEstimate = makeEntity([sentEstimate()]);
  const prior = { id: 'acc-prior', estimate_id: 'e1', quote_version: 2, accepted_by_name: 'Jane Buyer', status: 'accepted', created_date: '2026-01-01T00:00:00Z', updated_date: 'a1' };
  entities.EstimateAcceptance = makeEntity([prior]);
  setStubEntities(entities);
  const r = await handler(fakeRequest(recordBody()));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200);
  assert.equal(data.reused, true, 'existing acceptance deduped');
  assert.equal(data.acceptance.id, 'acc-prior');
  assert.equal(entities.EstimateAcceptance.rows.length, 1, 'no duplicate row written');
}

// ---------- Superseded rows never block a fresh acceptance ----------
{
  const entities = freshEntities();
  entities.AllInOneEstimate = makeEntity([sentEstimate()]);
  entities.EstimateAcceptance = makeEntity([
    { id: 'acc-old', estimate_id: 'e1', quote_version: 2, status: 'superseded', superseded_at: '2026-01-02T00:00:00Z', created_date: '2026-01-01T00:00:00Z' },
  ]);
  setStubEntities(entities);
  const r = await handler(fakeRequest(recordBody()));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200);
  assert.equal(data.reused, false, 'superseded row does not dedupe');
  assert.equal(entities.EstimateAcceptance.rows.length, 2, 'new row written alongside superseded history');
}

// ---------- canonicalAcceptance: earliest-created wins a concurrent race ----------
{
  const entities = freshEntities();
  entities.AllInOneEstimate = makeEntity([sentEstimate()]);
  // The concurrent row lands between the pre-check filter and the post-create
  // re-read: hide it on the first filter call only.
  const concurrent = { id: 'acc-earlier', estimate_id: 'e1', quote_version: 2, accepted_by_name: 'Jane Buyer', status: 'accepted', created_date: '2026-01-01T00:00:00Z', updated_date: 'a1' };
  const base = makeEntity([concurrent]);
  let filterCalls = 0;
  const realFilter = base.filter;
  base.filter = async (...args) => { filterCalls += 1; return filterCalls === 1 ? [] : realFilter(...args); };
  entities.EstimateAcceptance = base;
  setStubEntities(entities);
  const r = await handler(fakeRequest(recordBody()));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200);
  assert.equal(data.reused, true);
  assert.equal(data.concurrent_duplicate_discarded, true, 'race resolved by discarding the later row');
  assert.equal(data.acceptance.id, 'acc-earlier', 'earliest-created acceptance is canonical');
  assert.equal(entities.EstimateAcceptance.rows.length, 1, 'losing duplicate deleted');
  assert.equal(entities.EstimateAcceptance.rows[0].id, 'acc-earlier');
}

rmSync(stubFile, { force: true });
rmSync(out, { force: true });
console.log('PASS estimate acceptance function (16 cases)');
process.exit(0);
