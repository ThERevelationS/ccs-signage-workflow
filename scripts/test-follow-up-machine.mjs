import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-follow-up-machine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/followUpMachine.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  FOLLOW_UP_STAGES, FOLLOW_UP_DEFAULTS, FOLLOW_UP_TERMINAL_STATUSES,
  followUpState, followUpAnchor, nextStage, markAnswered, cancelFollowUp,
  resolveFollowUpConfig,
} = await import(pathToFileURL(out).href);

const apply = (record, patch) => ({ ...record, follow_up_state: patch });
const SENT = '2026-11-02'; // anchor date (local midnight convention)

// --- vocabulary + defaults ---------------------------------------------------
assert.deepEqual(FOLLOW_UP_STAGES, ['none', 'fu1_sent', 'fu2_sent', 'answered', 'closed']);
assert.equal(FOLLOW_UP_DEFAULTS.fu1_delay_days, 7);
assert.equal(FOLLOW_UP_DEFAULTS.fu2_delay_days, 14);
assert.equal(FOLLOW_UP_DEFAULTS.fu2_after_fu1_days, 7);
assert.ok(FOLLOW_UP_TERMINAL_STATUSES.includes('approved'));
assert.ok(FOLLOW_UP_TERMINAL_STATUSES.includes('converted'));

// --- followUpState normalization ----------------------------------------------
assert.deepEqual(followUpState({}), {
  stage: 'none', last_sent_at: null, next_due_at: null, anchor_at: null,
  fu1_sent_at: null, fu2_sent_at: null, answered_at: null, closed_reason: null,
});
{
  const s = followUpState({
    follow_up_state: { stage: 'fu1_sent', last_sent_at: '2026-11-09T05:00:00.000Z', next_due_at: '2026-11-16' },
  });
  assert.equal(s.stage, 'fu1_sent');
  assert.equal(s.last_sent_at, '2026-11-09T05:00:00.000Z');
  assert.ok(s.next_due_at.startsWith('2026-11-16'), 'date-only next_due normalizes to ISO');
}
// Legacy flat fields normalize identically.
{
  const s = followUpState({
    follow_up_stage: 'fu2_sent',
    follow_up_last_sent_at: '2026-11-16T05:00:00.000Z',
    follow_up_next_due_at: '2026-11-30',
  });
  assert.equal(s.stage, 'fu2_sent');
  assert.equal(s.last_sent_at, '2026-11-16T05:00:00.000Z');
  assert.ok(s.next_due_at.startsWith('2026-11-30'));
}
// Stored object wins over flat fields; flats backfill keys the object lacks.
{
  const s = followUpState({
    follow_up_state: { stage: 'answered' },
    follow_up_stage: 'fu1_sent',
    follow_up_last_sent_at: '2026-11-09T05:00:00.000Z',
  });
  assert.equal(s.stage, 'answered', 'object stage beats flat stage');
  assert.equal(s.last_sent_at, '2026-11-09T05:00:00.000Z', 'flat backfills missing object key');
}
// Invalid + alias spellings.
assert.equal(followUpState({ follow_up_stage: 'bogus' }).stage, 'none');
assert.equal(followUpState({ follow_up_stage: 'fu1' }).stage, 'fu1_sent');
assert.equal(followUpState({ follow_up_state: { stage: 'replied' } }).stage, 'answered');

// --- status gate ---------------------------------------------------------------
assert.equal(nextStage({ record: { status: 'draft', quote_issue_date: SENT }, now: '2026-12-01' }).action, 'none');
assert.match(nextStage({ record: { status: 'draft' }, now: '2026-12-01' }).reason, /status_gate/);
for (const status of ['approved', 'declined', 'converted', 'archived', 'cancelled']) {
  const r = nextStage({ record: { status, quote_issue_date: SENT }, now: '2026-11-05' });
  assert.equal(r.action, 'close', `${status} closes an open sequence`);
  assert.equal(r.patch.stage, 'closed');
  assert.equal(r.patch.closed_reason, status);
  assert.equal(r.patch.next_due_at, null);
  // Closed once — subsequent evaluations are no-ops.
  const again = nextStage({ record: apply({ status, quote_issue_date: SENT }, r.patch), now: '2026-11-06' });
  assert.equal(again.action, 'none', `${status} closes exactly once`);
  assert.equal(again.reason, 'already_closed');
}
// Answered wins over a terminal status (keeps the answered signal).
{
  const rec = apply({ status: 'sent', quote_issue_date: SENT }, markAnswered({ status: 'sent' }, '2026-11-10'));
  const r = nextStage({ record: { ...rec, status: 'approved' }, now: '2026-11-11' });
  assert.equal(r.action, 'none');
  assert.equal(r.reason, 'already_answered');
}
// Missing now is refused, never reads the clock.
assert.equal(nextStage({ record: { status: 'sent' } }).reason, 'now_invalid');

// --- full stage walk: none → fu1 → fu2 → complete ------------------------------
const estimate = { status: 'sent', quote_issue_date: SENT };
assert.equal(nextStage({ record: estimate, now: '2026-11-08T12:00:00' }).reason, 'fu1_not_due');
assert.equal(nextStage({ record: estimate, now: '2026-11-08T23:59:59' }).action, 'none', '1ms before the 7-day boundary is not due');
{
  const r1 = nextStage({ record: estimate, now: '2026-11-09' });
  assert.equal(r1.action, 'send_fu1', 'day-7 boundary is due (inclusive)');
  assert.equal(r1.reason, 'fu1_due');
  assert.equal(r1.patch.stage, 'fu1_sent');
  assert.equal(r1.patch.last_sent_at, new Date('2026-11-09T00:00:00').toISOString());
  assert.equal(r1.patch.next_due_at, new Date('2026-11-16T00:00:00').toISOString(), 'next_due = now + fu2_after_fu1_days');
  assert.ok(r1.patch.anchor_at.startsWith('2026-11-02'), 'anchor frozen into state');
  assert.equal(r1.patch.fu1_sent_at, r1.patch.last_sent_at);

  // Idempotent — second evaluation the same day on the patched record.
  const rec1 = apply(estimate, r1.patch);
  const rerun = nextStage({ record: rec1, now: '2026-11-09' });
  assert.equal(rerun.action, 'none', 'same-day re-evaluation never re-fires');
  assert.equal(rerun.reason, 'fu2_not_due');
  assert.equal(nextStage({ record: rec1, now: '2026-11-15' }).action, 'none');
  assert.equal(nextStage({ record: rec1, now: '2026-11-15T23:59:59' }).action, 'none', '1ms before FU2 due');

  const r2 = nextStage({ record: rec1, now: '2026-11-16' });
  assert.equal(r2.action, 'send_fu2');
  assert.equal(r2.reason, 'fu2_due:next_due_at');
  assert.equal(r2.patch.stage, 'fu2_sent');
  assert.equal(r2.patch.next_due_at, null, 'sequence over — nothing left scheduled');
  assert.equal(r2.patch.fu1_sent_at, r1.patch.fu1_sent_at, 'FU1 timestamp preserved');
  assert.equal(r2.patch.fu2_sent_at, new Date('2026-11-16T00:00:00').toISOString());

  const rec2 = apply(rec1, r2.patch);
  const done = nextStage({ record: rec2, now: '2026-12-01' });
  assert.equal(done.action, 'none');
  assert.equal(done.reason, 'sequence_complete');
}

// --- fu2 recovery when next_due_at is missing -----------------------------------
{
  const rec = {
    status: 'sent', quote_issue_date: SENT,
    follow_up_state: { stage: 'fu1_sent', last_sent_at: '2026-11-09T00:00:00', next_due_at: null },
  };
  // due = max(anchor+14d, last+7d) = 2026-11-16 both ways here.
  const early = nextStage({ record: rec, now: '2026-11-15' });
  assert.equal(early.action, 'none');
  const r = nextStage({ record: rec, now: '2026-11-16' });
  assert.equal(r.action, 'send_fu2');
  assert.equal(r.reason, 'fu2_due:recovered');
}
// Recovery uses the later bound: FU1 sent very late still waits the spacing.
{
  const rec = {
    status: 'sent', quote_issue_date: SENT,
    follow_up_state: { stage: 'fu1_sent', last_sent_at: '2026-11-20T00:00:00', next_due_at: null },
  };
  // anchor+14d = 11-16 (past), fu1+7d = 11-27 → due 11-27, not "immediately".
  assert.equal(nextStage({ record: rec, now: '2026-11-21' }).action, 'none', 'late FU1 keeps the 7-day spacing');
  assert.equal(nextStage({ record: rec, now: '2026-11-27' }).action, 'send_fu2');
}

// --- partial-write cooldown guard -------------------------------------------------
{
  const rec = {
    status: 'sent', quote_issue_date: '2026-10-01',
    follow_up_state: { stage: 'none', last_sent_at: '2026-11-09T00:00:00' },
  };
  const r = nextStage({ record: rec, now: '2026-11-12' });
  assert.equal(r.action, 'none', 'lost stage marker does not re-fire inside the spacing window');
  assert.equal(r.reason, 'fu1_cooldown');
  assert.equal(nextStage({ record: rec, now: '2026-11-16' }).action, 'send_fu1', 'cooldown expires — stale stage can recover');
}

// --- markAnswered / cancelFollowUp --------------------------------------------------
{
  const sent = apply(estimate, { stage: 'fu1_sent', last_sent_at: '2026-11-09T00:00:00Z', next_due_at: '2026-11-16T00:00:00Z', anchor_at: '2026-11-02T05:00:00Z', fu1_sent_at: '2026-11-09T00:00:00Z' });
  const p = markAnswered(sent, '2026-11-12');
  assert.equal(p.stage, 'answered');
  assert.equal(p.next_due_at, null);
  assert.ok(p.answered_at.startsWith('2026-11-12'));
  assert.equal(p.last_sent_at, '2026-11-09T00:00:00.000Z', 'send history kept');
  assert.equal(nextStage({ record: apply(sent, p), now: '2026-11-20' }).reason, 'already_answered');
}
{
  const p = cancelFollowUp({ follow_up_state: { stage: 'fu1_sent', last_sent_at: '2026-11-09T00:00:00Z' } }, 'customer_opted_out');
  assert.equal(p.stage, 'closed');
  assert.equal(p.closed_reason, 'customer_opted_out');
  assert.equal(p.next_due_at, null);
  assert.equal(p.last_sent_at, '2026-11-09T00:00:00.000Z');
}

// --- cfg knobs + reuse hooks -----------------------------------------------------
assert.equal(nextStage({ record: estimate, now: '2026-11-05', cfg: { fu1_delay_days: 3 } }).action, 'send_fu1');
assert.equal(nextStage({ record: estimate, now: '2026-11-02', cfg: { fu1_delay_days: 0 } }).action, 'send_fu1', 'zero delay fires immediately');
{
  const r = nextStage({ record: estimate, now: '2026-11-09', cfg: { fu2_after_fu1_days: 10 } });
  assert.equal(r.patch.next_due_at, new Date('2026-11-19T00:00:00').toISOString(), 'custom spacing honored');
}
// Proof-follow-up reuse: different status field, gate values, and anchor.
{
  const proofCfg = { status_field: 'proof_status', sent_statuses: ['awaiting_approval'], terminal_statuses: ['approved'], anchor_field: 'proof_sent_at' };
  const proof = { proof_status: 'awaiting_approval', proof_sent_at: '2026-11-01' };
  assert.equal(nextStage({ record: proof, now: '2026-11-08', cfg: proofCfg }).action, 'send_fu1');
  assert.equal(nextStage({ record: proof, now: '2026-11-08' }).action, 'none', 'default cfg ignores non-status fields');
  const approved = nextStage({ record: { ...proof, proof_status: 'approved' }, now: '2026-11-08', cfg: proofCfg });
  assert.equal(approved.action, 'close');
}

// --- anchor resolution -----------------------------------------------------------
{
  assert.equal(followUpAnchor({ status: 'sent', sent_at: '2026-11-01T15:00:00Z' }).field, 'sent_at');
  assert.equal(followUpAnchor({ status: 'sent', quote_issue_date: '2026-11-02' }).field, 'quote_issue_date');
  assert.equal(followUpAnchor({ status: 'sent', created_date: '2026-10-20' }).field, 'created_date');
  assert.equal(followUpAnchor({ status: 'sent', custom_date: '2026-11-03' }, { anchor_field: 'custom_date' }).field, 'custom_date');
  const frozen = followUpAnchor({ status: 'sent', quote_issue_date: '2026-11-02', follow_up_state: { anchor_at: '2026-10-30T04:00:00Z' } });
  assert.equal(frozen.field, 'follow_up_state.anchor_at', 'persisted anchor wins over record fields');
}
assert.equal(nextStage({ record: { status: 'sent' }, now: '2026-12-01' }).reason, 'anchor_missing', 'no anchor → cannot schedule FU1');

// --- alternate `now` inputs ---------------------------------------------------------
assert.equal(nextStage({ record: estimate, now: new Date('2026-11-09T00:00:00').getTime() }).action, 'send_fu1', 'epoch ms now accepted');
assert.equal(nextStage({ record: estimate, now: new Date('2026-11-09T00:00:00') }).action, 'send_fu1', 'Date now accepted');

// --- resolveFollowUpConfig -----------------------------------------------------------
{
  const c = resolveFollowUpConfig({ fu1_delay_days: -3, fu2_delay_days: 'bogus' });
  assert.equal(c.fu1_delay_days, 0, 'negative clamps to 0');
  assert.equal(c.fu2_delay_days, 14, 'non-finite falls back to default');
  assert.equal(c.status_field, 'status');
}

rmSync(out, { force: true });
console.log('PASS follow-up-machine');
