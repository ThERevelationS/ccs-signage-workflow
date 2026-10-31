import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-crm-events.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/crm/crmEventsModel.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const {
  CRM_EVENT_TYPES,
  CRM_EVENT_OUTCOMES,
  eventLabel,
  eventName,
  isCrmEvent,
  isOpenEvent,
  isOverdue,
  eventsForQueue,
  distinctAssignees,
  markEventCompletePatch,
  newCrmEventFields,
} = await import(pathToFileURL(out).href);

// --- Taxonomy completeness -------------------------------------------------
assert.equal(CRM_EVENT_TYPES.length, 19, 'taxonomy covers all 19 CoreBridge event types');
for (const t of [
  'Call: Accounts Receivable', 'Call: Collections', 'Call: Estimate Follow Up',
  'Call: Install Scheduling', 'Call: Post delivery follow up', 'Call: Proof',
  'Call: Prospecting', 'Call: Sales Follow Up', 'Consultation',
  'E-Mail: Estimate', 'E-Mail: Follow Up', 'E-Mail: Information Request',
  'ReDo Work', 'Visit: Installation', 'Visit: Networking/Marketing',
  'Visit: Sales Appointment', 'Visit: Sales Cold Call',
  'Visit: Sales Relationship', 'Visit: Site Survey',
]) {
  assert.ok(CRM_EVENT_TYPES.includes(t), `taxonomy includes "${t}"`);
}
assert.equal(new Set(CRM_EVENT_TYPES).size, 19, 'taxonomy has no duplicates');
assert.equal(eventLabel('Call: Prospecting'), 'Call: Prospecting');
assert.equal(eventLabel(''), 'Event', 'blank type gets a fallback label');

// --- Open/closed classification ---------------------------------------------
const auditRow = { event_type: 'stage_changed', summary: 'moved' };
assert.equal(isCrmEvent(auditRow), false, 'audit rows are not CRM events');
assert.equal(isOpenEvent(auditRow), false, 'audit rows are never open queue events');
assert.equal(isOpenEvent({ event_type: 'Call: Prospecting' }), true, 'typed row with no stamp is open');
assert.equal(isOpenEvent({ event_type: 'Visit: Site Survey', completed_at: '2026-01-01T00:00:00Z', outcome: 'completed' }), false, 'stamped row is closed');
assert.equal(isOpenEvent({ event_type: 'Call: Proof', outcome: 'cancelled' }), false, 'cancelled outcome closes without a stamp');
assert.equal(isOpenEvent({ event_type: 'Call: Proof', outcome: 'no_answer' }), true, 'no_answer alone does not close');
assert.equal(isOpenEvent({ event_type: 'Note' }), false, 'non-taxonomy types excluded');

// --- Queue filtering + ordering ---------------------------------------------
const rows = [
  { id: 'a', event_type: 'Call: Prospecting', contact_name: 'Amy', company_name: 'Acme', assigned_to: 'kim@x.com', due_at: '2026-02-10T17:00:00Z', created_date: '2026-02-01T00:00:00Z' },
  { id: 'b', event_type: 'Visit: Site Survey', contact_name: 'Bob', company_name: 'Beta Co', assigned_to: 'sam@x.com', due_at: '2026-01-05T17:00:00Z', created_date: '2026-01-02T00:00:00Z' },
  { id: 'c', event_type: 'E-Mail: Follow Up', contact_name: 'Cid', company_name: 'Acme', assigned_to: 'kim@x.com', created_date: '2026-01-03T00:00:00Z' },
  { id: 'd', event_type: 'Call: Sales Follow Up', contact_name: 'Dee', company_name: 'Delta', assigned_to: 'kim@x.com', due_at: '2026-01-20T17:00:00Z', completed_at: '2026-01-20T18:00:00Z', outcome: 'completed', created_date: '2026-01-04T00:00:00Z' },
  { id: 'e', event_type: 'created', summary: 'audit noise', created_date: '2026-01-05T00:00:00Z' },
];

const open = eventsForQueue(rows);
assert.deepEqual(open.map((r) => r.id), ['b', 'a', 'c'], 'open-only queue sorts due asc, blanks last, audit rows excluded');
assert.deepEqual(eventsForQueue(rows, { includeCompleted: true }).map((r) => r.id), ['b', 'd', 'a', 'c'], 'completed rows appear when toggled, still sorted by due_at');
assert.deepEqual(eventsForQueue(rows, { type: 'Call: Prospecting' }).map((r) => r.id), ['a'], 'type filter is exact');
assert.deepEqual(eventsForQueue(rows, { type: 'note' }).map((r) => r.id), [], 'audit types can never be selected');
assert.deepEqual(eventsForQueue(rows, { assignedTo: 'sam@x.com' }).map((r) => r.id), ['b'], 'salesperson filter');
assert.deepEqual(eventsForQueue(rows, { search: 'acme' }).map((r) => r.id), ['a', 'c'], 'search matches company');
assert.deepEqual(eventsForQueue(rows, { search: 'site survey' }).map((r) => r.id), ['b'], 'search matches event type text');
assert.deepEqual(eventsForQueue(rows, { search: 'beta' }).map((r) => r.id), ['b'], 'search matches company partial');
assert.deepEqual(eventsForQueue(rows, { assignedTo: 'kim@x.com', search: 'cid' }).map((r) => r.id), ['c'], 'combined filters');
assert.deepEqual(eventsForQueue(null), [], 'null input is safe');

assert.deepEqual(distinctAssignees(rows), ['kim@x.com', 'sam@x.com'], 'assignee dropdown lists distinct CRM assignees only');

// Overdue: open + past due_at; closed or blank-due rows never flag.
const now = new Date('2026-02-01T00:00:00Z');
assert.equal(isOverdue(rows[1], now), true, 'past-due open event is overdue');
assert.equal(isOverdue(rows[0], now), false, 'future-due event is not overdue');
assert.equal(isOverdue(rows[2], now), false, 'blank due date is not overdue');
assert.equal(isOverdue(rows[3], now), false, 'closed event is not overdue');

// --- Completion patch shape ---------------------------------------------------
const stamp = new Date('2026-03-01T12:00:00Z');
assert.deepEqual(markEventCompletePatch('completed', stamp), { completed_at: '2026-03-01T12:00:00.000Z', outcome: 'completed' });
assert.deepEqual(markEventCompletePatch('Left_Message', stamp), { completed_at: '2026-03-01T12:00:00.000Z', outcome: 'left_message' }, 'outcome normalizes to lower case');
assert.equal(markEventCompletePatch('', stamp).outcome, 'completed', 'blank outcome defaults to completed');
assert.ok(CRM_EVENT_OUTCOMES.includes('cancelled'), 'cancelled is a close-out outcome');

// --- New-event field payload ---------------------------------------------------
const fields = newCrmEventFields({
  eventType: 'Call: Estimate Follow Up', contactName: 'Amy', companyName: 'Acme',
  customerId: 'cust1', assignedTo: 'kim@x.com', dueAt: '2026-03-05T23:59:59.000Z', actor: 'kim@x.com',
});
assert.equal(fields.event_type, 'Call: Estimate Follow Up');
assert.equal(fields.summary, 'Call: Estimate Follow Up', 'summary falls back to the type label');
assert.equal(fields.subject, '');
assert.equal(fields.customer_id, 'cust1');
assert.equal(fields.opportunity_id, '', 'opportunity link stays optional');
assert.equal(fields.source, 'manual');
assert.equal(fields.completed_at, '');
assert.equal(eventName(fields), 'Call: Estimate Follow Up');
assert.equal(eventName({ ...fields, subject: 'Ask about PO' }), 'Ask about PO', 'explicit subject wins');
assert.throws(() => newCrmEventFields({ eventType: 'created' }), /Unknown CRM event type/, 'audit types rejected for new events');

console.log('PASS crm-events (taxonomy, classification, queue filtering/sorting, completion patch)');
