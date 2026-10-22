import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_PULL_EVIDENCE_SETTING_KEY,
  assertNoUnresolvedOrderPullEvidence,
  verifyCompletedOrderPullEvidence,
} from '../base44/shared/smartsheetOrderPullEvidenceStore.mjs';

// A mock GlobalSettings entity honoring the conditional updateMany contract
// ({id, setting_key, updated_date} guard) used by the evidence store.
function mockEntity(initial, { staleRead = false } = {}) {
  const record = { ...initial };
  // staleRead simulates a concurrent write landing between the caller's last
  // read and this conditional write: reads surface an older updated_date.
  const read = () => ({ ...record, ...(staleRead ? { updated_date: 'stale' } : {}) });
  return {
    record,
    async filter(query) {
      return record.setting_key === query?.setting_key ? [read()] : [];
    },
    async get(id) {
      return String(record.id) === String(id) ? read() : null;
    },
    async updateMany(query, update) {
      const match = String(record.id) === String(query?.id) &&
        record.setting_key === query?.setting_key &&
        record.updated_date === query?.updated_date;
      if (!match) return { updated: 0 };
      Object.assign(record, update?.$set || {});
      return { updated: 1 };
    },
    async create() {
      throw new Error('unexpected create');
    },
  };
}

const runStartedAt = '2026-10-22T14:39:28.165Z';
const unresolvedValue = {
  state: 'unresolved', run_started_at: runStartedAt,
  smartsheet_sheet_id: '4963691473987460',
  batch_evidence: { attempted_batches: 1, recent_batches: [{}] },
};

// Unresolved evidence blocks new pulls; a mismatched run cannot resolve it.
{
  const entity = mockEntity({
    id: 'ev1', setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY,
    updated_date: '2026-10-22T14:40:56.939', setting_value: unresolvedValue,
  });
  await assert.rejects(() => assertNoUnresolvedOrderPullEvidence(entity), /unresolved|Review/);
  await assert.rejects(() => verifyCompletedOrderPullEvidence(entity, { startedAt: '2026-10-22T15:00:00Z' }),
    /does not match|unresolved/);
  assert.equal(entity.record.setting_value.state, 'unresolved');
  console.log('PASS unresolved evidence blocks pulls and rejects a different run identity');
}

// The exact run completes through the guarded write and then allows pulls.
{
  const entity = mockEntity({
    id: 'ev1', setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY,
    updated_date: '2026-10-22T14:40:56.939', setting_value: unresolvedValue,
  });
  const resolved = await verifyCompletedOrderPullEvidence(entity, { startedAt: runStartedAt });
  assert.equal(resolved.state, 'verified_complete');
  assert.ok(Number.isFinite(Date.parse(resolved.verified_at)));
  assert.equal(resolved.run_started_at, runStartedAt);
  assert.equal(resolved.batch_evidence.attempted_batches, 1);
  await assertNoUnresolvedOrderPullEvidence(entity);
  console.log('PASS exact run identity flips evidence to verified_complete and unblocks pulls');
}

// A stale concurrent writer loses the conditional update; evidence stays put.
{
  const entity = mockEntity({
    id: 'ev1', setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY,
    updated_date: '2026-10-22T16:00:00.000', setting_value: unresolvedValue,
  }, { staleRead: true });
  await assert.rejects(() => verifyCompletedOrderPullEvidence(entity, { startedAt: runStartedAt }),
    /was not saved|does not match|unresolved/);
  assert.equal(entity.record.setting_value.state, 'unresolved');
  console.log('PASS concurrent evidence changes fail the conditional write instead of overwriting');
}

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const begin = backend.indexOf("if (action === 'resolve_unresolved_order_pull_evidence')");
const end = backend.indexOf("if (action === 'recover_stale_order_run')", begin);
assert.ok(begin > 0 && end > begin, 'resolution action must sit beside the review handlers');
const action = backend.slice(begin, end);
assert.match(action, /hasSessionToken/);
assert.match(action, /adminActor\?\.role !== 'admin'/);
assert.match(action, /body\?\.confirm_reviewed !== true/);
assert.match(action, /evidence\?\.state !== 'unresolved'/);
assert.match(action, /evidence\?\.run_started_at !== runStartedAt/);
assert.match(action, /older_batches_omitted/);
assert.match(action, /planUnresolvedOrderBatchReview\(evidence,/);
assert.match(action, /query: \{ id: \{ \$in: pairs\.map/);
assert.match(action, /order\.deleted/);
assert.match(action, /order\.smartsheet_row_id \?\? ''\) !== pair\.rowId/);
assert.match(action, /verifyCompletedOrderPullEvidence\(\s*base44\.asServiceRole\.entities\.GlobalSettings, \{ startedAt: runStartedAt \}\)/);
assert.match(action, /evidence_state: resolved\.state/);
assert.doesNotMatch(action, /\.bulkUpdate\(|\.create\(|\.delete\(|claimInvocationRun\(|smartsheetPost|smartsheetPut/);
assert.match(backend, /'resolve_unresolved_order_pull_evidence'/);
console.log('PASS resolution action is admin-gated, identity-checked, link-verified, and never replays writes');

const relinkBegin = backend.indexOf("if (action === 'relink_order_smartsheet_row')");
const relinkEnd = backend.indexOf("if (action === 'recover_stale_order_run')", relinkBegin);
assert.ok(relinkBegin > 0 && relinkEnd > relinkBegin, 'relink action must sit beside the other admin actions');
const relink = backend.slice(relinkBegin, relinkEnd);
assert.match(relink, /hasSessionToken/);
assert.match(relink, /adminActor\?\.role !== 'admin'/);
assert.match(relink, /body\?\.confirm_relink !== true/);
assert.match(relink, /currentRowId === newRowId/);
assert.match(relink, /String\(order\.smartsheet_row_id \?\? ''\) !== currentRowId/);
assert.match(relink, /smartsheetGet\(`\/sheets\/\$\{sheetId\}\/rows\/\$\{newRowId\}`, token\)/);
assert.match(relink, /Order\.filter\(\{ smartsheet_row_id: newRowId \}\)/);
assert.match(relink, /record\.deleted !== true/);
assert.match(relink, /\{ id: orderId, smartsheet_row_id: currentRowId, updated_date: order\.updated_date \}/);
assert.match(relink, /\$set: \{ smartsheet_row_id: newRowId \}/);
assert.match(relink, /String\(verified\?\.smartsheet_row_id \?\? ''\) !== newRowId/);
assert.doesNotMatch(relink, /customer_name.*===|bulkUpdate\(|\.create\(|\.delete\(|smartsheetPut|smartsheetPost/);
assert.match(backend, /'relink_order_smartsheet_row'/);
console.log('PASS relink action is admin-gated, permanent-ID-only, remote-verified, duplicate-guarded, and write-scoped');

const panel = readFileSync('src/components/orders/OrderIndependentPullEvidence.jsx', 'utf8');
assert.match(panel, /action: 'resolve_unresolved_order_pull_evidence'/);
assert.match(panel, /confirm_reviewed: true/);
assert.match(panel, /view\.entries\.every\(batch => reviewedBatches\.has\(batch\.number\)\)/);
assert.match(panel, /Mark reviewed and resolve/);
assert.match(panel, /Review every recorded batch above before resolving/);
assert.match(panel, /data\.evidence_state !== 'verified_complete'/);
assert.equal((panel.match(/setReviewedBatches\(new Set\(\)\)/g) || []).length >= 3, true);
console.log('PASS resolution UI requires a completed review of every recorded batch and resets on evidence change');
