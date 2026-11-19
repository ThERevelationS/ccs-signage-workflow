import assert from 'node:assert/strict';
import { createFoundationSyncAttempt, foundationSyncRecoveryState, assertFoundationBuilderAcknowledgment } from '../src/components/estimator/foundation/foundationSyncRecovery.js';

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };
const throws = (fn, re, n) => { try { fn(); failed++; console.error('FAIL', n); } catch (e) { assert.ok(re.test(e.message), n + ' msg'); } };

const proj = (over = {}) => ({ id: 'p1', updated_date: 'v2', project_name: 'X', ...over });
const est = (over = {}) => ({ id: 'e1', line_items: [], ...over });
const line = (over = {}) => ({ module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v2', ...over });
const attempt = () => createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'k1', requestedAt: '2026-11-05T00:00:00.000Z' });

await ok('createFoundationSyncAttempt shape', async () => {
  const a = attempt();
  assert.deepEqual(a, { schema_version: 1, key: 'k1', source_project_id: 'p1', estimate_id: 'e1', requested_at: '2026-11-05T00:00:00.000Z' });
});
await ok('attempt validation rejects bad inputs', async () => {
  throws(() => createFoundationSyncAttempt({ sourceId: '', estimateId: 'e1', key: 'k', requestedAt: '2026-01-01T00:00:00Z' }), /source project id/, 'empty source');
  throws(() => createFoundationSyncAttempt({ sourceId: 'p', estimateId: '', key: 'k', requestedAt: '2026-01-01T00:00:00Z' }), /estimate id/, 'empty estimate');
  throws(() => createFoundationSyncAttempt({ sourceId: 'p', estimateId: 'e', key: 'x'.repeat(201), requestedAt: '2026-01-01T00:00:00Z' }), /key/, 'long key');
  throws(() => createFoundationSyncAttempt({ sourceId: 'p', estimateId: 'e', key: 'k', requestedAt: 'not-a-date' }), /ISO timestamp/, 'bad ts');
});
await ok('no marker + no pending -> none', async () => {
  const r = foundationSyncRecoveryState({ project: proj(), estimateId: 'e1', estimate: est({ line_items: [line()] }) });
  assert.equal(r.status, 'none');
});
await ok('no marker + pending line -> pending', async () => {
  const r = foundationSyncRecoveryState({ project: proj(), estimateId: 'e1', estimate: est({ line_items: [line({ price_acceptance_pending: { key: 'k' } })] }) });
  assert.equal(r.status, 'pending');
});
await ok('valid attempt + exact snapshot -> acknowledged', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const e = est({ line_items: [line()] });
  const r = foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e });
  assert.equal(r.status, 'acknowledged');
});
await ok('attempt + snapshot mismatch -> pending', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const e = est({ line_items: [line({ updated_date_snapshot: 'v1' })] });
  const r = foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e });
  assert.equal(r.status, 'pending');
});
await ok('attempt + missing line -> pending', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const r = foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: est() });
  assert.equal(r.status, 'pending');
});
await ok('attempt wrong module line -> pending', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const e = est({ line_items: [line({ module_key: 'brick_stone' })] });
  assert.equal(foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e }).status, 'pending');
});
await ok('attempt foreign estimate -> mismatch', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const e = est({ id: 'e9', line_items: [line()] });
  assert.equal(foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e }).status, 'mismatch');
});
await ok('attempt different estimate_id -> mismatch', async () => {
  const a = attempt(); a.estimate_id = 'e9';
  const p = proj({ builder_sync_attempt: a });
  const e = est({ line_items: [line()] });
  assert.equal(foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e }).status, 'mismatch');
});
await ok('standalone with linked receipt -> mismatch', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  assert.equal(foundationSyncRecoveryState({ project: p, estimateId: '', estimate: null }).status, 'mismatch');
});
await ok('malformed/future/array receipt -> unsupported', async () => {
  for (const bad of [{ schema_version: 2 }, 'x', [1], { schema_version: 1, key: 'k' }]) {
    const r = foundationSyncRecoveryState({ project: proj({ builder_sync_attempt: bad }), estimateId: 'e1', estimate: est({ line_items: [line()] }) });
    assert.equal(r.status, 'unsupported', JSON.stringify(bad));
  }
});
await ok('pending price_acceptance prevents ACK', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const e = est({ line_items: [line({ price_acceptance_pending: { key: 'k' } })] });
  assert.equal(foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e }).status, 'pending');
});
await ok('original objects unchanged (no mutation)', async () => {
  const p = proj({ builder_sync_attempt: attempt() });
  const e = est({ line_items: [line()] });
  const before = JSON.stringify([p, e]);
  foundationSyncRecoveryState({ project: p, estimateId: 'e1', estimate: e });
  assert.equal(JSON.stringify([p, e]), before);
});
await ok('assertFoundationBuilderAcknowledgment valid line', async () => {
  assertFoundationBuilderAcknowledgment({ sourceProject: proj(), estimateId: 'e1', line: line() });
});
await ok('assert rejects stale snapshot', async () => {
  throws(() => assertFoundationBuilderAcknowledgment({ sourceProject: proj(), estimateId: 'e1', line: line({ updated_date_snapshot: 'v1' }) }), /not yet synchronized/, 'stale');
});
await ok('assert rejects pending mutation', async () => {
  throws(() => assertFoundationBuilderAcknowledgment({ sourceProject: proj(), estimateId: 'e1', line: line({ price_acceptance_pending: { key: 'k' } }) }), /not yet synchronized/, 'pending');
});
await ok('assert rejects wrong module/id/estimate', async () => {
  throws(() => assertFoundationBuilderAcknowledgment({ sourceProject: proj(), estimateId: 'e1', line: line({ module_key: 'brick_stone' }) }), /not yet synchronized/, 'module');
  throws(() => assertFoundationBuilderAcknowledgment({ sourceProject: proj(), estimateId: 'e1', line: line({ project_id: 'p9' }) }), /not yet synchronized/, 'id');
  throws(() => assertFoundationBuilderAcknowledgment({ sourceProject: proj(), estimateId: 'e1', line: line({ estimate_id: 'e9' }) }), /not yet synchronized/, 'estimate');
});
await ok('creator rejects non-ISO timestamps', async () => {
  for (const bad of ['1', 'not-a-date', '02/30/2026', 'T00:00', '2026-11-05']) {
    throws(() => createFoundationSyncAttempt({ sourceId: 'p', estimateId: 'e', key: 'k', requestedAt: bad }), /ISO timestamp/, 'ts:' + bad);
  }
});
await ok('validator rejects empty key/oversize/invalid ts/bad version', async () => {
  const base = { schema_version: 1, key: 'k', source_project_id: 'p1', estimate_id: 'e1', requested_at: '2026-11-05T00:00:00.000Z' };
  const cases = [
    { ...base, key: '' }, { ...base, key: '   ' }, { ...base, key: 'x'.repeat(201) },
    { ...base, source_project_id: 'x'.repeat(201) }, { ...base, estimate_id: 'x'.repeat(201) },
    { ...base, requested_at: '1' }, { ...base, requested_at: 'garbage' }, { ...base, requested_at: '2026-11-05' },
    { ...base, schema_version: 2 }, { ...base, schema_version: '1' },
  ];
  for (const c of cases) {
    const r = foundationSyncRecoveryState({ project: proj({ builder_sync_attempt: c }), estimateId: 'e1', estimate: est({ line_items: [line()] }) });
    assert.equal(r.status, 'unsupported', JSON.stringify(c));
  }
  const good = foundationSyncRecoveryState({ project: proj({ builder_sync_attempt: base }), estimateId: 'e1', estimate: est({ line_items: [line()] }) });
  assert.equal(good.status, 'acknowledged');
});
console.log(`PASS sync-recovery passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
