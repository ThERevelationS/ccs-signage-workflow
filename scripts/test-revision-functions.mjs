import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  installDeno, fakeRequest, responseOf, makeEntity, makeSessionToken,
  writeSdkStub, setStubEntities, setAuthMe, bundleFunction, importBundled,
} from './lib/backendFunctionTestKit.mjs';

// Backlog §16 #385 + #398 + #399:
// - opportunityWorkspaceAction session-error -> 401 (no auth.me fallback; the
//   sign-shop session is the only gate on the workspace function).
// - ensureOpenEstimateRevision dual-auth (C2-F): sign-shop session token OR
//   plain request-context auth.me() — both must unblock the write; neither -> 401.
// - updateEstimateRevisionAudit expected_estimate_updated_date CAS (B6): a
//   moved estimate fails the completion with 409 instead of writing over it.

const here = dirname(fileURLToPath(import.meta.url));
const getHandler = installDeno();

const stubFile = resolve(here, '.tmp-sdk-stub-revfns.mjs');
writeSdkStub(stubFile, {});

const outEnsure = resolve(here, '.tmp-fn-ensureOpenEstimateRevision.mjs');
const outAudit = resolve(here, '.tmp-fn-updateEstimateRevisionAudit.mjs');
const outWorkspace = resolve(here, '.tmp-fn-opportunityWorkspaceAction.mjs');
bundleFunction({ here, entry: '../base44/functions/ensureOpenEstimateRevision/entry.ts', stubFile, outFile: outEnsure });
await importBundled(outEnsure);
const ensureHandler = getHandler();
bundleFunction({ here, entry: '../base44/functions/updateEstimateRevisionAudit/entry.ts', stubFile, outFile: outAudit });
await importBundled(outAudit);
const auditHandler = getHandler();
bundleFunction({ here, entry: '../base44/functions/opportunityWorkspaceAction/entry.ts', stubFile, outFile: outWorkspace });
await importBundled(outWorkspace);
const workspaceHandler = getHandler();

const SESSION_EMAIL = 'staff@example.com';
const token = makeSessionToken(SESSION_EMAIL);

const freshEntities = ({ estimate = null, revisions = [] } = {}) => ({
  AuthorizedEmail: makeEntity([{ id: 'u1', email: SESSION_EMAIL, role: 'staff' }]),
  UserSession: makeEntity([]),
  AllInOneEstimate: makeEntity(estimate ? [estimate] : []),
  EstimateRevision: makeEntity(revisions),
});

const estimate = { id: 'e1', status: 'sent', quote_version: 1, updated_date: 'v1', line_items: [] };
const openRevision = {
  id: 'rev-1', estimate_id: 'e1', revision_status: 'open', revision_type: 'manual_revision',
  revision_number: 1, updated_date: 'rv1', estimate_snapshot_before: { status: 'sent', quote_total: 100 },
};

// ---------- #385: workspace session guard -> 401 ----------
{
  const r = await workspaceHandler(fakeRequest({ action: 'attention_feed', session_token: '' }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 401, 'missing session -> 401');
  assert.match(data.error, /Authentication required/i);
  const r2 = await workspaceHandler(fakeRequest({ action: 'attention_feed', session_token: 'forged.token' }));
  assert.equal(r2.status, 401, 'forged signature -> 401');
  // A VALID session reaches action dispatch — unknown action -> 400, not 401.
  setStubEntities(freshEntities({ estimate }));
  const r3 = await workspaceHandler(fakeRequest({ action: 'bogus_action', session_token: token }));
  assert.equal(r3.status, 400, 'valid session passes auth; bad action -> 400');
}

// ---------- #398: ensureOpenEstimateRevision dual-auth ----------
// Path 1 — no session token + auth.me() resolves a user -> write proceeds.
{
  setStubEntities(freshEntities({ estimate }));
  setAuthMe({ id: 'u2', email: 'builder@example.com' });
  const r = await ensureHandler(fakeRequest({ estimate_id: 'e1', reason: 'edit sent estimate' }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200, 'auth.me fallback unblocks the write');
  assert.equal(data.revision.revision_status, 'open');
  assert.equal(data.revision.reason, 'edit sent estimate');
  assert.equal(data.reused, false);
  setAuthMe(null);
}

// Path 2 — no session token + auth.me() null -> 401.
{
  setStubEntities(freshEntities({ estimate }));
  setAuthMe(null);
  const r = await ensureHandler(fakeRequest({ estimate_id: 'e1', reason: 'edit' }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 401, 'no session + no request-context auth -> 401');
  assert.match(data.error, /Authentication required/i);
}

// Path 3 — valid sign-shop session token -> session path (auth.me never needed).
{
  setStubEntities(freshEntities({ estimate }));
  setAuthMe(() => { throw new Error('auth.me must not be called'); });
  const r = await ensureHandler(fakeRequest({ estimate_id: 'e1', reason: 'edit', session_token: token }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200, 'session-token path authenticates without auth.me');
  assert.equal(data.revision.revision_status, 'open');
  setAuthMe(null);
}

// Idempotent: an already-open canonical revision is reused, never duplicated.
{
  setStubEntities(freshEntities({ estimate, revisions: [{ ...openRevision }] }));
  const r = await ensureHandler(fakeRequest({ estimate_id: 'e1', reason: 'again', session_token: token }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200);
  assert.equal(data.reused, true, 'existing open revision reused');
  assert.equal(data.revision.id, 'rev-1');
}

// ---------- #399: complete_manual_revision expected_estimate_updated_date CAS ----------
// Estimate moved since load -> 409, revision stays open.
{
  const entities = freshEntities({ estimate: { ...estimate, updated_date: 'v-moved' }, revisions: [{ ...openRevision }] });
  setStubEntities(entities);
  const r = await auditHandler(fakeRequest({
    session_token: token,
    action: 'complete_manual_revision',
    estimate_id: 'e1',
    revision_id: 'rev-1',
    expected_estimate_updated_date: 'v1',
  }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 409, 'moved estimate -> 409');
  assert.match(data.error, /changed in another session/i);
  assert.equal(entities.EstimateRevision.rows[0].revision_status, 'open', 'revision left open on conflict');
}

// Anchors match -> revision completes with the post-write snapshot.
{
  const entities = freshEntities({ estimate: { ...estimate, status: 'sent', quote_total: 250 }, revisions: [{ ...openRevision }] });
  setStubEntities(entities);
  const r = await auditHandler(fakeRequest({
    session_token: token,
    action: 'complete_manual_revision',
    estimate_id: 'e1',
    revision_id: 'rev-1',
    expected_estimate_updated_date: 'v1',
    expected_revision_updated_date: 'rv1',
  }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200, 'matching anchors complete the revision');
  assert.equal(data.revision.revision_status, 'completed');
  assert.equal(data.reused, false);
  assert.ok(data.revision.completed_at, 'completed_at stamped');
  assert.ok(Array.isArray(data.revision.change_summary), 'change summary recorded');
}

// Same request replayed -> already-completed revision converges (reused).
{
  const entities = freshEntities({ estimate, revisions: [{ ...openRevision, revision_status: 'completed' }] });
  setStubEntities(entities);
  const r = await auditHandler(fakeRequest({
    session_token: token,
    action: 'complete_manual_revision',
    estimate_id: 'e1',
    revision_id: 'rev-1',
  }));
  const { status, data } = await responseOf(r);
  assert.equal(status, 200);
  assert.equal(data.reused, true, 'completed revision is idempotent');
}

rmSync(stubFile, { force: true });
rmSync(outEnsure, { force: true });
rmSync(outAudit, { force: true });
rmSync(outWorkspace, { force: true });
console.log('PASS revision + workspace function guards (17 cases)');
process.exit(0);
