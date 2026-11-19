import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-crm-suggestion.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/crmSuggestionModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  SUGGESTION_KIND,
  SUGGESTION_STAGES,
  SUGGESTION_THRESHOLDS_DAYS,
  RECENT_EVENT_DAYS,
  SUGGESTION_STATUS,
  FOLLOW_UP_TYPE_LABEL,
  FOLLOW_UP_EVENT_TYPE,
  SENT_ANCHOR_FIELDS,
  suggestionKey,
  sentAnchor,
  daysSinceSent,
  stageForDays,
  isEstimateFollowUpLabel,
  suggestFollowUps,
  suggestionRow,
  confirmSuggestion,
  dismissSuggestion,
  pendingSuggestions,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-20T15:00:00Z';
const NOW_MS = Date.parse(NOW);
const NOW_ISO = new Date(NOW_MS).toISOString(); // toISOString() normalizes to .000Z
const dayIso = (daysAgo) => new Date(NOW_MS - daysAgo * 86400000).toISOString();

const EST = (id, daysAgo, extra = {}) => ({
  id,
  status: 'sent',
  estimate_number: `Q-${id}`,
  client_name: `Customer ${id}`,
  customer_id: `cust-${id}`,
  contact_name: `Contact ${id}`,
  salesperson: 'sam@x.com',
  opportunity_id: `opp-${id}`,
  sent_at: dayIso(daysAgo),
  ...extra,
});

// --- constants / vocabulary ---------------------------------------------------
assert.equal(SUGGESTION_KIND, 'estimate_follow_up_suggestion');
assert.deepEqual(SUGGESTION_STAGES, ['first', 'second', 'stale']);
assert.deepEqual(SUGGESTION_THRESHOLDS_DAYS, { first: 3, second: 7, stale: 14 });
assert.equal(RECENT_EVENT_DAYS, 7, 'recent-event window mirrors fu2_after_fu1_days');
assert.deepEqual(SUGGESTION_STATUS, ['pending', 'confirmed', 'dismissed']);
assert.equal(FOLLOW_UP_TYPE_LABEL, 'EstimateFollowUp');
assert.equal(FOLLOW_UP_EVENT_TYPE, 'Call: Estimate Follow Up');
assert.ok(SENT_ANCHOR_FIELDS.indexOf('quote_issue_date') > SENT_ANCHOR_FIELDS.indexOf('sent_at'),
  'sent_at wins over quote_issue_date in the anchor chain');
assert.equal(suggestionKey('e1', 'first'), 'sug:e1:first');

// --- anchor math + thresholds ---------------------------------------------------
{
  const est = { sent_at: '2026-11-10', quote_issue_date: '2026-01-01' };
  const a = sentAnchor(est);
  assert.equal(a.field, 'sent_at', 'sent_at anchor wins');
  assert.equal(daysSinceSent({ sent_at: dayIso(9) }, NOW), 9);
  assert.equal(daysSinceSent({ quote_issue_date: dayIso(4) }, NOW), 4, 'quote_issue_date fallback');
  assert.equal(
    daysSinceSent({ sent_at: dayIso(30), follow_up_state: { anchor_at: dayIso(6) } }, NOW),
    6, 'persisted follow_up_state.anchor_at wins over sent_at',
  );
  assert.equal(daysSinceSent({}, NOW), null, 'no anchor → null');
  assert.equal(daysSinceSent({ sent_at: '2027-01-01' }, NOW), 0, 'future anchor floors at 0');
  assert.equal(stageForDays(2), null);
  assert.equal(stageForDays(3), 'first');
  assert.equal(stageForDays(7), 'second');
  assert.equal(stageForDays(14), 'stale');
  assert.equal(stageForDays(40), 'stale', 'highest stage reached wins');
}
assert.equal(isEstimateFollowUpLabel('Call: Estimate Follow Up'), true);
assert.equal(isEstimateFollowUpLabel('E-Mail: Follow Up'), false);

// --- suggestFollowUps: status gate + thresholds --------------------------------
{
  const rows = suggestFollowUps([
    EST('e-draft', 30, { status: 'draft' }),
    EST('e-young', 2),
    EST('e-first', 4),
    EST('e-second', 9),
    EST('e-stale', 20),
    EST('e-appr', 30, { status: 'approved' }),
  ], { now: NOW });
  assert.deepEqual(rows.map((r) => r.estimate_id), ['e-stale', 'e-second', 'e-first'],
    'only sent estimates past threshold, most-stale first');
  assert.equal(rows[0].due_stage, 'stale');
  assert.equal(rows[1].due_stage, 'second');
  assert.equal(rows[2].due_stage, 'first');
  assert.equal(rows[0].suggestion_key, 'sug:e-stale:stale');
  assert.equal(rows[0].days_since_sent, 20);
  assert.equal(rows[0].customer_id, 'cust-e-stale');
  assert.equal(rows[0].estimate_number, 'Q-e-stale');
  assert.equal(rows[0].customer_name, 'Customer e-stale');
  assert.equal(rows[0].deep_link, '/EstimateDetail?id=e-stale');
  assert.equal(rows[0].kind, SUGGESTION_KIND);
  assert.ok(rows[0].reason.includes('Q-e-stale'), 'reason names the estimate');
  assert.ok(Date.parse(rows[0].due_at) <= NOW_MS, 'due_at is the instant the stage came due');
}

// --- suggestFollowUps: dedupe via existing suggestions --------------------------
{
  const est = EST('e9', 9);
  const pendingSame = suggestionRow(
    { suggestion_key: 'sug:e9:first', estimate_id: 'e9', due_stage: 'first', days_since_sent: 4 },
    { actor_id: 'sys', now: dayIso(5) },
  );
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_suggestions: [pendingSame] }).length,
    0, 'any pending suggestion for the estimate suppresses re-suggest (no stacked stages)',
  );
  const dismissedSecond = { ...pendingSame, suggestion_key: 'sug:e9:second', due_stage: 'second', status: 'dismissed' };
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_suggestions: [dismissedSecond] }).length,
    0, 'dismissed same-key stage never re-suggests',
  );
  // Dismissed 'first' does NOT block the later 'second' escalation.
  const dismissedFirst = { ...pendingSame, status: 'dismissed' };
  const again = suggestFollowUps([est], { now: NOW, existing_suggestions: [dismissedFirst] });
  assert.equal(again.length, 1, 'dismissed earlier stage still allows the next escalation');
  assert.equal(again[0].suggestion_key, 'sug:e9:second');
  // Non-suggestion rows in the list are ignored.
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_suggestions: [{ kind: 'other', status: 'pending', estimate_id: 'e9' }] }).length,
    1, 'foreign rows are not suggestion dedupe hits',
  );
}

// --- suggestFollowUps: dedupe via existing events --------------------------------
{
  const est = EST('e7', 12);
  const openEvent = {
    event_type: 'Call: Estimate Follow Up',
    status: 'open',
    details: { estimate_id: 'e7' },
    due_at: dayIso(-2),
  };
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_events: [openEvent] }).length,
    0, 'open EstimateFollowUp event touching the estimate suppresses',
  );
  const recentDone = {
    event_type: 'Call: Estimate Follow Up',
    status: 'completed',
    completed_at: dayIso(3),
    details: { estimate_id: 'e7' },
  };
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_events: [recentDone] }).length,
    0, 'follow-up completed inside the recent window suppresses',
  );
  const oldDone = { ...recentDone, completed_at: dayIso(10) };
  const re = suggestFollowUps([est], { now: NOW, existing_events: [oldDone] });
  assert.equal(re.length, 1, 'follow-up older than the recent window re-suggests');
  const unrelated = { event_type: 'Call: Prospecting', status: 'open', details: { estimate_id: 'e7' } };
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_events: [unrelated] }).length,
    1, 'non-follow-up events do not suppress',
  );
  const otherEst = { event_type: 'Call: Estimate Follow Up', status: 'open', details: { estimate_id: 'zzz' } };
  assert.equal(
    suggestFollowUps([est], { now: NOW, existing_events: [otherEst] }).length,
    1, 'open follow-up on a DIFFERENT estimate does not suppress',
  );
}

// --- suggestFollowUps: terminal machine state + no anchor ------------------------
{
  assert.equal(
    suggestFollowUps([EST('e-ans', 30, { follow_up_state: { stage: 'answered' } })], { now: NOW }).length,
    0, 'answered suppresses suggestions',
  );
  assert.equal(
    suggestFollowUps([EST('e-closed', 30, { follow_up_state: { stage: 'closed' } })], { now: NOW }).length,
    0, 'closed suppresses suggestions',
  );
  assert.equal(
    suggestFollowUps([EST('e-fu2', 30, { follow_up_state: { stage: 'fu2_sent' } })], { now: NOW }).length,
    1, 'fu2_sent still suggests — drip done, human takeover point',
  );
  assert.equal(suggestFollowUps([{ id: 'e-nodate', status: 'sent' }], { now: NOW }).length, 0,
    'sent estimate with no usable anchor is skipped');
  assert.deepEqual(suggestFollowUps([EST('e1', 30)], { now: 'not-a-date' }), [], 'invalid now → []');
}

// --- suggestionRow ---------------------------------------------------------------
{
  const sug = suggestFollowUps([EST('e5', 8)], { now: NOW })[0];
  const row = suggestionRow(sug, { actor_id: 'agent@x.com', now: NOW });
  assert.equal(row.kind, SUGGESTION_KIND);
  assert.equal(row.status, 'pending');
  assert.equal(row.suggestion_key, 'sug:e5:second');
  assert.equal(row.estimate_id, 'e5');
  assert.equal(row.actor, 'agent@x.com');
  assert.equal(row.suggested_at, NOW_ISO);
  assert.equal(row.assignee, 'sam@x.com', 'salesperson carries through as assignee');
  assert.equal(row.confirmed_at, '');
  assert.equal(row.dismiss_reason, '');
}

// --- confirmSuggestion: two-write contract ---------------------------------------
{
  const sug = suggestFollowUps([EST('e3', 10)], { now: NOW })[0];
  const { event, suggestion_patch } = confirmSuggestion(sug, { actor_id: 'kim@x.com', now: NOW });
  assert.equal(suggestion_patch.status, 'confirmed');
  assert.equal(suggestion_patch.confirmed_by, 'kim@x.com');
  assert.equal(suggestion_patch.confirmed_at, NOW_ISO);
  assert.equal(event.event_type, 'Call: Estimate Follow Up', 'event write is OpportunityActivity-enum safe');
  assert.equal(event.details.type_label, 'EstimateFollowUp');
  assert.equal(event.details.suggestion_key, 'sug:e3:second');
  assert.equal(event.details.estimate_id, 'e3');
  assert.equal(event.source, 'auto_followup');
  assert.equal(event.status, 'open');
  assert.equal(event.customer_id, 'cust-e3');
  assert.equal(event.company_name, 'Customer e3');
  assert.equal(event.assigned_to, 'sam@x.com', 'event inherits the estimate salesperson');
  assert.equal(event.due_at, NOW_ISO);
  assert.ok(event.subject.includes('Q-e3'), 'event subject names the estimate');
  // Materialized event suppresses the same estimate on the next scan.
  assert.equal(
    suggestFollowUps([EST('e3', 10)], { now: NOW, existing_events: [event] }).length,
    0, 'confirmed event closes the suggestion loop on the next scan',
  );
}

// --- dismissSuggestion -----------------------------------------------------------
{
  const { suggestion_patch } = dismissSuggestion(
    { suggestion_key: 'sug:e4:first' },
    { actor_id: 'kim@x.com', now: NOW, reason: 'customer already replied by phone' },
  );
  assert.deepEqual(suggestion_patch, {
    status: 'dismissed',
    dismissed_by: 'kim@x.com',
    dismissed_at: NOW_ISO,
    dismiss_reason: 'customer already replied by phone',
  });
}

// --- pendingSuggestions ------------------------------------------------------------
{
  const mk = (id, stage, days, extra = {}) => ({
    kind: SUGGESTION_KIND,
    suggestion_key: `sug:${id}:${stage}`,
    status: 'pending',
    estimate_id: id,
    due_stage: stage,
    days_since_sent: days,
    assignee: 'sam@x.com',
    suggested_at: dayIso(days),
    ...extra,
  });
  const rows = [
    mk('a', 'first', 4),
    mk('b', 'stale', 20),
    mk('c', 'second', 9, { status: 'confirmed' }),
    mk('d', 'second', 8, { assignee: 'kim@x.com' }),
    { kind: 'other', status: 'pending', estimate_id: 'zz' },
  ];
  const all = pendingSuggestions(rows, {});
  assert.deepEqual(all.map((r) => r.estimate_id), ['b', 'd', 'a'],
    'pending only, most-stale first (20 > 8 > 4), foreign rows dropped');
  const sam = pendingSuggestions(rows, { user_email: 'SAM@x.com' });
  assert.deepEqual(sam.map((r) => r.estimate_id), ['b', 'a'], 'assignee filter is case-insensitive');
  assert.equal(pendingSuggestions('junk', {}).length, 0, 'non-array input → []');
  assert.equal(pendingSuggestions([], {}).length, 0);
}

rmSync(out, { force: true });
console.log('PASS crm-suggestion');
