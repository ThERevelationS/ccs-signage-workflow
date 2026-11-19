import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-crm-event-queue.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/crm/crmEventQueueModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  FOLLOW_UP_TYPE_LABEL,
  QUEUE_GROUP_ORDER,
  indexEventTypes,
  eventTypeOptions,
  isQueueEvent,
  isEventComplete,
  completeEventPayload,
  resolveAssigneeName,
  queueRows,
  distinctQueueAssignees,
  filterQueue,
  sortQueue,
  groupQueueRows,
  legacyEventTypeFor,
  buildCreateEventFields,
  isEstimateFollowUpLabel,
  followUpEventType,
  suggestFollowUpEvents,
} = await import(pathToFileURL(out).href);

const TYPES = [
  { id: 't-call-fu', channel: 'call', label: 'Estimate Follow Up', sort: 20, status: 'active' },
  { id: 't-call-pros', channel: 'call', label: 'Prospecting', sort: 30, status: 'active' },
  { id: 't-visit-survey', channel: 'visit', label: 'Site Survey', sort: 90, status: 'active' },
  { id: 't-custom', channel: 'visit', label: 'Lunch & Learn', sort: 120, status: 'active', is_custom: true },
  { id: 't-arch', channel: 'call', label: 'Old Type', sort: 5, status: 'archived' },
];
const USERS = [{ email: 'kim@x.com', full_name: 'Kim Seller' }, { email: 'sam@x.com', full_name: 'Sam Seller' }];
const NOW = new Date('2026-03-10T15:00:00Z');

// --- Type index / options ----------------------------------------------------
{
  const idx = indexEventTypes(TYPES);
  assert.equal(idx.byId.get('t-call-fu').label, 'Estimate Follow Up', 'type index resolves by id');
  assert.ok(idx.byId.has('t-arch'), 'archived types stay indexed for display');
  const opts = eventTypeOptions(TYPES);
  assert.deepEqual(opts.map((t) => t.id), ['t-call-fu', 't-call-pros', 't-visit-survey', 't-custom'],
    'options are active-only in sort order');
}
assert.equal(isEstimateFollowUpLabel('Estimate Follow Up'), true);
assert.equal(isEstimateFollowUpLabel('EstimateFollowUp'), true);
assert.equal(isEstimateFollowUpLabel('Call: Estimate Follow Up'), true);
assert.equal(isEstimateFollowUpLabel('E-Mail: Follow Up'), false, 'plain follow-up is not estimate-follow-up');
assert.equal(isEstimateFollowUpLabel('E-Mail: Estimate'), false, 'estimate email is not estimate-follow-up');
assert.equal(followUpEventType(TYPES)?.id, 't-call-fu', 'follow-up type resolves from registry');
assert.equal(legacyEventTypeFor('call', 'Estimate Follow Up'), 'Call: Estimate Follow Up', 'channel+label maps back to enum event_type');
assert.equal(legacyEventTypeFor('visit', 'Lunch & Learn'), '', 'custom labels have no legacy enum');

// --- queueRows normalization --------------------------------------------------
const ACTS = [
  { id: 'a1', event_type_id: 't-call-fu', event_type: 'Call: Estimate Follow Up', subject: 'Ask about PO', company_name: 'Acme', contact_name: 'Amy', customer_id: 'c1', assigned_to: 'kim@x.com', due_at: '2026-03-08T17:00:00Z', created_date: '2026-03-01T00:00:00Z' },
  { id: 'a2', event_type_id: 't-visit-survey', event_type: 'Visit: Site Survey', company_name: 'Beta Co', assigned_to: 'sam@x.com', due_at: '2026-03-10T18:00:00Z', created_date: '2026-03-02T00:00:00Z' },
  { id: 'a3', event_type: 'Call: Prospecting', contact_name: 'Cid', assigned_to: 'kim@x.com', created_date: '2026-03-03T00:00:00Z' },
  { id: 'a4', event_type_id: 't-gone', event_type: 'note', subject: 'Deleted type row', assigned_to: 'sam@x.com', due_at: '2026-03-15T17:00:00Z', created_date: '2026-03-04T00:00:00Z' },
  { id: 'a5', event_type: 'stage_changed', summary: 'audit noise', created_date: '2026-03-05T00:00:00Z' },
  { id: 'a6', event_type_id: 't-call-pros', event_type: 'Call: Prospecting', company_name: 'Done Co', assigned_to: 'kim@x.com', due_at: '2026-03-09T17:00:00Z', completed_at: '2026-03-09T18:00:00Z', completed_by: 'kim@x.com', status: 'completed', created_date: '2026-03-06T00:00:00Z' },
];

const rows = queueRows(ACTS, { eventTypes: TYPES, users: USERS, now: NOW });
assert.deepEqual(rows.map((r) => r.id), ['a1', 'a2', 'a3', 'a4'], 'open-only by default; audit rows excluded');
assert.equal(rows[0].type_id, 't-call-fu');
assert.equal(rows[0].type_label, 'Estimate Follow Up', 'type label resolves from CrmEventType');
assert.equal(rows[0].title, 'Ask about PO', 'subject wins over type label');
assert.equal(rows[0].customer_name, 'Acme');
assert.equal(rows[0].assignee_name, 'Kim Seller', 'users resolve assignee display names');
assert.equal(rows[0].overdue, true, 'past-due open row flags overdue');
assert.equal(rows[1].title, 'Site Survey', 'title falls back to type label');
assert.equal(rows[1].overdue, false, 'due later today is not overdue');
assert.equal(rows[2].type_id, 't-call-pros', 'legacy event_type resolves typed id by channel+label alias');
assert.equal(rows[2].type_label, 'Prospecting');
assert.equal(rows[2].customer_name, 'Cid', 'customer_name falls back to contact');
assert.equal(rows[3].type_id, 't-gone', 'unknown type_id rows still queue');
assert.equal(rows[3].type_label, 'Event', 'missing type never surfaces an audit value as label');
const all = queueRows(ACTS, { eventTypes: TYPES, now: NOW, includeCompleted: true });
assert.equal(all.length, 5, 'includeCompleted keeps closed rows');
assert.equal(all.find((r) => r.id === 'a6').open, false);
assert.deepEqual(queueRows(null), [], 'null input is safe');
assert.equal(isQueueEvent(ACTS[4], TYPES), false, 'audit rows are not queue events');
assert.equal(isQueueEvent({ event_type: 'note', summary: 'audit' }, TYPES), false, 'note audit rows excluded');
assert.equal(isQueueEvent({ event_type: 'Lunch & Learn' }, TYPES), true, 'custom label-valued event_type still queues');
assert.equal(queueRows([{ id: 'x', event_type: 'Lunch & Learn', assigned_to: 'a' }], { eventTypes: [], now: NOW })[0].type_label,
  'Lunch & Learn', 'non-audit event_type survives an empty registry');
assert.deepEqual(distinctQueueAssignees(rows), ['kim@x.com', 'sam@x.com'], 'assignee list is distinct + sorted');
assert.equal(resolveAssigneeName('kim@x.com', USERS), 'Kim Seller');
assert.equal(resolveAssigneeName('nobody@x.com', USERS), 'nobody@x.com', 'unmatched assignee passes through');

// --- isEventComplete -----------------------------------------------------------
assert.equal(isEventComplete({ completed_by: 'kim@x.com' }), true, 'completed_by closes');
assert.equal(isEventComplete({ completed_at: '2026-03-01T00:00:00Z' }), true, 'completed_at closes');
assert.equal(isEventComplete({ status: 'completed' }), true, 'status=completed closes');
assert.equal(isEventComplete({ outcome: 'cancelled' }), true, 'cancelled outcome closes');
assert.equal(isEventComplete({ status: 'open' }), false, 'open status stays open');
assert.equal(isEventComplete(null), false, 'null row is safe');

// --- completeEventPayload -------------------------------------------------------
{
  const p = completeEventPayload({ row: rows[0], userEmail: 'kim@x.com', now: new Date('2026-03-10T16:00:00Z') });
  assert.deepEqual(p, { completed_at: '2026-03-10T16:00:00.000Z', completed_by: 'kim@x.com', status: 'completed' },
    'payload is exactly completed_at + completed_by + status');
  const withOutcome = completeEventPayload({ row: rows[0], userEmail: 'sam@x.com', now: NOW, outcome: 'Left_Message' });
  assert.equal(withOutcome.outcome, 'left_message', 'optional outcome normalizes to lower case');
  assert.match(completeEventPayload({ userEmail: 'k' }).completed_at, /^\d{4}-\d{2}-\d{2}T/, 'default now stamps ISO');
}

// --- filterQueue ------------------------------------------------------------------
assert.deepEqual(filterQueue(all, { salesperson: 'KIM@x.com' }).map((r) => r.id), ['a1', 'a3', 'a6'], 'salesperson filter is case-insensitive');
assert.deepEqual(filterQueue(all, { typeId: 't-call-fu' }).map((r) => r.id), ['a1'], 'typeId matches typed rows');
assert.deepEqual(filterQueue(all, { typeId: 'prospecting' }).map((r) => r.id), ['a3', 'a6'], 'typeId matches labels for untyped rows');
assert.deepEqual(filterQueue(all, { overdueOnly: true, now: NOW }).map((r) => r.id), ['a1'], 'overdueOnly keeps past-due open rows');
assert.deepEqual(filterQueue(all, { openOnly: true }).map((r) => r.id), ['a1', 'a2', 'a3', 'a4'], 'openOnly drops completed');
assert.deepEqual(filterQueue(all, { salesperson: 'sam@x.com', typeId: 't-visit-survey', openOnly: true }).map((r) => r.id), ['a2'], 'combined filters');
assert.deepEqual(filterQueue(null, { salesperson: 'x' }), [], 'null rows are safe');

// --- sortQueue ----------------------------------------------------------------------
const sorted = sortQueue(all, { now: NOW });
assert.deepEqual(sorted.map((r) => r.id), ['a1', 'a6', 'a2', 'a4', 'a3'],
  'overdue first, then strict due_at asc, undated last');
const before = all.map((r) => r.id).join(',');
sortQueue(all, { now: NOW });
assert.equal(all.map((r) => r.id).join(','), before, 'sortQueue does not mutate input');

// --- groupQueueRows -----------------------------------------------------------------
{
  const g = groupQueueRows(sortQueue(all, { now: NOW }), { now: NOW });
  assert.deepEqual(g.overdue.map((r) => r.id), ['a1'], 'overdue bucket');
  assert.deepEqual(g.today.map((r) => r.id), ['a2'], 'today bucket');
  assert.deepEqual(g.upcoming.map((r) => r.id), ['a4'], 'upcoming bucket');
  assert.deepEqual(g.nodate.map((r) => r.id), ['a3'], 'no-date bucket');
  assert.deepEqual(g.completed.map((r) => r.id), ['a6'], 'completed rows land in their own bucket');
  assert.deepEqual(QUEUE_GROUP_ORDER, ['overdue', 'today', 'upcoming', 'nodate'], 'group order is fixed');
}

// --- buildCreateEventFields ------------------------------------------------------------
{
  const f = buildCreateEventFields({
    typeId: 't-call-fu', typeLabel: 'Estimate Follow Up', channel: 'call',
    title: '', dueAt: '2026-03-12T23:59:59.000Z', assignee: 'kim@x.com', actor: 'kim@x.com',
    customerId: 'c1', customerName: 'Acme', estimateId: 'e9',
  });
  assert.equal(f.event_type_id, 't-call-fu');
  assert.equal(f.event_type, 'Call: Estimate Follow Up', 'enum-safe event_type from channel+label');
  assert.equal(f.summary, 'Estimate Follow Up', 'summary falls back to type label');
  assert.equal(f.status, 'open');
  assert.equal(f.completed_at, '');
  assert.equal(f.details.estimate_id, 'e9', 'estimate link rides in details');
  const custom = buildCreateEventFields({ typeId: 't-custom', typeLabel: 'Lunch & Learn', channel: 'visit', title: 'Lunch' });
  assert.equal(custom.event_type, 'note', 'custom types get enum-safe fallback');
  assert.equal(custom.subject, 'Lunch');
}

// --- suggestFollowUpEvents --------------------------------------------------------------
const EST = (id, daysAgo, extra = {}) => ({
  id, status: 'sent', sent_at: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
  estimate_number: `Q-${id}`, client_name: `Client ${id}`, customer_id: `cust-${id}`,
  salesperson: 'kim@x.com', ...extra,
});
{
  const sug = suggestFollowUpEvents(
    [EST('e1', 9), EST('e2', 3), EST('e3', 8, { status: 'approved' }), EST('e1', 9)],
    { now: NOW, staleDays: 7, eventTypes: TYPES, users: USERS },
  );
  assert.equal(sug.length, 1, 'only stale sent estimates suggest; dupes collapse');
  assert.equal(sug[0].suggestion, true);
  assert.equal(sug[0].type_label, FOLLOW_UP_TYPE_LABEL);
  assert.equal(FOLLOW_UP_TYPE_LABEL, 'EstimateFollowUp');
  assert.equal(sug[0].type_id, 't-call-fu', 'suggestion resolves follow-up type id');
  assert.equal(sug[0].estimate_id, 'e1');
  assert.equal(sug[0].stale_days, 9);
  assert.equal(sug[0].assignee, 'kim@x.com');
  assert.equal(sug[0].source, 'auto_followup');
  assert.equal(sug[0].open, true);
}

// Dedupe: existing OPEN follow-up event suppresses the suggestion.
{
  const ests = [EST('e4', 10, { opportunity_id: 'opp-4' })];
  const openFu = [{ id: 'ev1', event_type_id: 't-call-fu', estimate_id: 'e4' }];
  assert.equal(suggestFollowUpEvents(ests, { now: NOW, existingEvents: openFu, eventTypes: TYPES }).length, 0,
    'open follow-up by estimate_id suppresses');
  const openFuOpp = [{ id: 'ev2', event_type: 'Call: Estimate Follow Up', opportunity_id: 'opp-4' }];
  assert.equal(suggestFollowUpEvents(ests, { now: NOW, existingEvents: openFuOpp, eventTypes: TYPES }).length, 0,
    'open follow-up by shared opportunity_id suppresses');
  const doneFu = [{ id: 'ev3', event_type_id: 't-call-fu', estimate_id: 'e4', completed_at: '2026-03-01T00:00:00Z' }];
  assert.equal(suggestFollowUpEvents(ests, { now: NOW, existingEvents: doneFu, eventTypes: TYPES }).length, 1,
    'completed follow-up does NOT suppress re-suggestion');
  const otherFu = [{ id: 'ev4', event_type_id: 't-call-fu', estimate_id: 'other' }];
  assert.equal(suggestFollowUpEvents(ests, { now: NOW, existingEvents: otherFu, eventTypes: TYPES }).length, 1,
    'follow-up on a different estimate does not suppress');
  const otherType = [{ id: 'ev5', event_type_id: 't-call-pros', estimate_id: 'e4' }];
  assert.equal(suggestFollowUpEvents(ests, { now: NOW, existingEvents: otherType, eventTypes: TYPES }).length, 1,
    'non-follow-up events on the estimate do not suppress');
}

// Boundary + ordering semantics.
{
  const boundary = suggestFollowUpEvents([EST('e5', 7)], { now: NOW, staleDays: 7 });
  assert.equal(boundary.length, 0, 'exactly staleDays old is not yet "older than"');
  const two = suggestFollowUpEvents([EST('e6', 8), EST('e7', 12)], { now: NOW });
  assert.deepEqual(two.map((s) => s.estimate_id), ['e7', 'e6'], 'most-stale sorts first');
  const noStamp = suggestFollowUpEvents([{ id: 'e8', status: 'sent' }], { now: NOW });
  assert.equal(noStamp.length, 0, 'sent estimate with no usable timestamp is skipped');
}

rmSync(out, { force: true });
console.log('PASS crm-event-queue');
