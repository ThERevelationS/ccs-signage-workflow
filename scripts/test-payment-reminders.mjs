// Unit checks for base44/shared/paymentReminderModel.ts (masterplan H-07):
// payment-due-5-day reminder on invoice due_date−5 + past-due cadence
// variant, with reminder_log dedupe. esbuild-bundle pattern — same as
// test-fulfillment.mjs / test-follow-up-machine.mjs.
//
// Run: node scripts/test-payment-reminders.mjs  →  prints "PASS payment-reminders"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-payment-reminder-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/paymentReminderModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  REMINDER_KINDS,
  REMINDER_TEMPLATE_KEYS,
  REMINDER_DEFAULTS,
  REMINDER_INELIGIBLE_STATUSES,
  REMINDER_LOG_MAX,
  resolveReminderConfig,
  openInvoiceBalance,
  daysPastDue,
  daysUntilDue,
  reminderSchedule,
  reminderDedupeKey,
  reminderLogEntries,
  alreadyReminded,
  invoicesNeedingReminder,
  reminderPatch,
} = await import(pathToFileURL(out).href);

const inv = (over = {}) => ({
  id: 'inv1',
  invoice_number: 'INV-1001',
  status: 'sent',
  balance_due: 250,
  total: 250,
  due_date: '2026-06-15',
  ...over,
});

// Local start-of-day ISO for an expected due_at.
const sod = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toISOString();
};

// ---------------------------------------------------------------------------
// vocabulary + config
// ---------------------------------------------------------------------------
assert.deepEqual([...REMINDER_KINDS], ['payment_due_5day', 'payment_past_due'], 'reminder kind set');
assert.equal(REMINDER_TEMPLATE_KEYS.payment_due_5day, 'payment_due_5day', 'T-5 renders through the seeded template key');
assert.equal(REMINDER_TEMPLATE_KEYS.payment_past_due, 'payment_past_due', 'past-due renders through the variant template key');
assert.deepEqual([...REMINDER_INELIGIBLE_STATUSES], ['draft', 'paid', 'void'], 'ineligible status set matches Invoice.jsonc enum');
assert.deepEqual(resolveReminderConfig(), { due_soon_days: 5, past_due_cadence_days: 7 }, 'config defaults');
assert.deepEqual(
  resolveReminderConfig({ due_soon_days: 3, past_due_cadence_days: 14 }),
  { due_soon_days: 3, past_due_cadence_days: 14 },
  'config overrides',
);
assert.equal(resolveReminderConfig({ past_due_cadence_days: 0 }).past_due_cadence_days, 1, 'cadence clamps to >=1 (no daily re-send)');
assert.equal(resolveReminderConfig({ due_soon_days: -2 }).due_soon_days, 0, 'due_soon clamps to >=0');
assert.equal(resolveReminderConfig({ past_due_cadence_days: 'junk' }).past_due_cadence_days, 7, 'non-finite cadence falls back');

// ---------------------------------------------------------------------------
// openInvoiceBalance — truth field then derived fallback
// ---------------------------------------------------------------------------
assert.equal(openInvoiceBalance(inv()), 250, 'balance_due is truth');
assert.equal(openInvoiceBalance({ total: 300, amount_paid: 100 }), 200, 'derived total − amount_paid');
assert.equal(openInvoiceBalance({ balance_due: -5 }), 0, 'negative clamps to 0');
assert.equal(openInvoiceBalance({}), 0, 'empty invoice → 0');

// ---------------------------------------------------------------------------
// day math
// ---------------------------------------------------------------------------
assert.equal(daysPastDue(inv(), '2026-06-15'), 0, 'due date itself is 0 days past due');
assert.equal(daysPastDue(inv(), '2026-06-16'), 1, 'day after due = 1 past due');
assert.equal(daysUntilDue(inv(), '2026-06-10'), 5, '5 days until due');
assert.equal(daysPastDue({ due_date: 'junk' }, '2026-06-16'), null, 'unparseable due → null');

// ---------------------------------------------------------------------------
// T-5 boundary — window [due−5, due] inclusive
// ---------------------------------------------------------------------------
let s = reminderSchedule(inv(), { now: '2026-06-09' });
assert.equal(s.kind, null, 'T-6: nothing due yet');
assert.equal(s.eligible, true, 'T-6: invoice still eligible');
assert.equal(s.reason, 'not_yet_due');
assert.equal(s.due_at, sod('2026-06-10'), 'T-6: due_at previews the upcoming T-5 instant');

s = reminderSchedule(inv(), { now: '2026-06-10' });
assert.equal(s.kind, 'payment_due_5day', 'T-5 boundary day fires payment_due_5day');
assert.equal(s.reason, 'due_soon');
assert.equal(s.due_at, sod('2026-06-10'), 'T-5 due_at is the T-5 instant');
assert.equal(s.days_until_due, 5);

s = reminderSchedule(inv(), { now: '2026-06-13' });
assert.equal(s.kind, 'payment_due_5day', 'T-2 catch-up still inside the window');

s = reminderSchedule(inv(), { now: '2026-06-15' });
assert.equal(s.kind, 'payment_due_5day', 'due date itself is the inclusive window end (not yet past due)');

s = reminderSchedule(inv(), { now: '2026-06-16' });
assert.equal(s.kind, 'payment_past_due', 'due+1 crosses into past-due — T-5 window closed');
assert.equal(s.reason, 'past_due');

// due_soon_days override moves the window.
s = reminderSchedule(inv(), { now: '2026-06-12', cfg: { due_soon_days: 2 } });
assert.equal(s.kind, null, 'T-3 is outside a 2-day due_soon window');
s = reminderSchedule(inv(), { now: '2026-06-13', cfg: { due_soon_days: 2 } });
assert.equal(s.kind, 'payment_due_5day', 'T-2 inside a 2-day due_soon window');

// ---------------------------------------------------------------------------
// past-due cadence buckets — floor(dpd/cadence)
// ---------------------------------------------------------------------------
const pd = (now, cfg) => reminderSchedule(inv(), { now, cfg });
assert.equal(pd('2026-06-16').cadence_bucket, 0, 'dpd 1 → bucket 0');
assert.equal(pd('2026-06-21').cadence_bucket, 0, 'dpd 6 → still bucket 0');
assert.equal(pd('2026-06-22').cadence_bucket, 1, 'dpd 7 → bucket 1');
assert.equal(pd('2026-06-28').cadence_bucket, 1, 'dpd 13 → bucket 1');
assert.equal(pd('2026-06-29').cadence_bucket, 2, 'dpd 14 → bucket 2');
assert.equal(pd('2026-06-18', { past_due_cadence_days: 3 }).cadence_bucket, 1, 'custom cadence 3: dpd 3 → bucket 1');
assert.equal(pd('2026-06-16').due_at, sod('2026-06-16'), 'bucket 0 window opened due+1');
assert.equal(pd('2026-06-22').due_at, sod('2026-06-22'), 'bucket 1 window opened due+7');

// ---------------------------------------------------------------------------
// eligibility table — status enum + open balance + due_date + now
// ---------------------------------------------------------------------------
for (const st of ['paid', 'void', 'draft']) {
  const r = reminderSchedule(inv({ status: st }), { now: '2026-06-10' });
  assert.equal(r.eligible, false, `status ${st} ineligible`);
  assert.equal(r.reason, `status_${st}`);
  assert.equal(r.kind, null);
}
assert.equal(reminderSchedule(inv({ status: '' }), { now: '2026-06-10' }).reason, 'status_draft', 'missing status reads as entity default draft');
for (const st of ['sent', 'partially_paid']) {
  assert.equal(reminderSchedule(inv({ status: st }), { now: '2026-06-10' }).eligible, true, `status ${st} eligible`);
}
assert.equal(reminderSchedule(inv({ balance_due: 0 }), { now: '2026-06-10' }).reason, 'no_open_balance', 'zero balance → no reminder');
assert.equal(reminderSchedule(inv({ balance_due: -10 }), { now: '2026-06-10' }).reason, 'no_open_balance', 'negative balance → no reminder');
assert.equal(
  reminderSchedule(inv({ balance_due: undefined, total: 300, amount_paid: 300 }), { now: '2026-06-10' }).reason,
  'no_open_balance',
  'derived zero balance → no reminder',
);
assert.equal(
  reminderSchedule(inv({ balance_due: undefined, total: 300, amount_paid: 100 }), { now: '2026-06-10' }).kind,
  'payment_due_5day',
  'derived open balance still schedules',
);
{
  const r = reminderSchedule(inv({ due_date: '' }), { now: '2026-06-10' });
  assert.equal(r.eligible, true, 'undated invoice is still eligible');
  assert.equal(r.kind, null);
  assert.equal(r.reason, 'due_date_missing');
}
assert.equal(reminderSchedule(inv(), { now: 'not-a-date' }).reason, 'now_invalid', 'bad now → now_invalid');
assert.equal(reminderSchedule(inv(), { now: 'not-a-date' }).eligible, false);
assert.equal(reminderSchedule(null, { now: '2026-06-10' }).reason, 'invoice_missing', 'null invoice → invoice_missing');

// ---------------------------------------------------------------------------
// reminderDedupeKey — per-day for T-5, per-bucket for past-due
// ---------------------------------------------------------------------------
assert.equal(
  reminderDedupeKey(inv(), 'payment_due_5day', { now: '2026-06-10' }),
  'payrem:inv1:payment_due_5day:2026-06-10',
  'T-5 key is payrem:<id>:<kind>:<YYYY-MM-DD>',
);
assert.equal(
  reminderDedupeKey(inv(), 'payment_due_5day', { now: '2026-06-10T19:30:00' }),
  'payrem:inv1:payment_due_5day:2026-06-10',
  'T-5 key uses the local calendar day',
);
assert.equal(
  reminderDedupeKey(inv(), 'payment_past_due', { now: '2026-06-16' }),
  'payrem:inv1:payment_past_due:b0',
  'past-due key carries the cadence bucket',
);
assert.equal(
  reminderDedupeKey(inv(), 'payment_past_due', { now: '2026-06-21' }),
  'payrem:inv1:payment_past_due:b0',
  'same bucket different day → same key (cadence, not daily)',
);
assert.equal(
  reminderDedupeKey(inv(), 'payment_past_due', { now: '2026-06-22' }),
  'payrem:inv1:payment_past_due:b1',
  'next bucket → new key (cadence re-send)',
);
assert.equal(
  reminderDedupeKey(inv({ id: '', invoice_number: 'INV-9' }), 'payment_due_5day', { now: '2026-06-10' }),
  'payrem:INV-9:payment_due_5day:2026-06-10',
  'id falls back to invoice_number',
);

// ---------------------------------------------------------------------------
// alreadyReminded — reminder_log history
// ---------------------------------------------------------------------------
const sentAt = '2026-06-10';
const loggedT5 = inv({ reminder_log: [{ kind: 'payment_due_5day', sent_at: '2026-06-10T14:00:00.000Z', dedupe_key: 'payrem:inv1:payment_due_5day:2026-06-10' }] });
assert.equal(alreadyReminded(loggedT5, 'payment_due_5day', { now: sentAt }), true, 'same-day key match suppresses');
assert.equal(alreadyReminded(loggedT5, 'payment_due_5day', { now: '2026-06-11' }), true, 'T-5 is once-ever — any prior entry suppresses, any day');
assert.equal(alreadyReminded(loggedT5, 'payment_past_due', { now: '2026-06-16' }), false, 'a T-5 entry does not suppress the past-due kind');

const loggedB0 = inv({ reminder_log: [{ kind: 'payment_past_due', sent_at: '2026-06-16T14:00:00.000Z', dedupe_key: 'payrem:inv1:payment_past_due:b0' }] });
assert.equal(alreadyReminded(loggedB0, 'payment_past_due', { now: '2026-06-18' }), true, 'same bucket suppresses mid-window');
assert.equal(alreadyReminded(loggedB0, 'payment_past_due', { now: '2026-06-22' }), false, 'next bucket not suppressed — cadence re-send');
assert.equal(alreadyReminded(inv(), 'payment_due_5day', { now: sentAt }), false, 'empty log → not reminded');
assert.equal(alreadyReminded(inv({ reminder_log: 'garbage' }), 'payment_due_5day', { now: sentAt }), false, 'malformed log → not reminded, never throws');
assert.equal(alreadyReminded(null, 'payment_due_5day', { now: sentAt }), false, 'null invoice → false');

// ---------------------------------------------------------------------------
// reminderPatch — append {kind, sent_at, dedupe_key} + last_reminder_at
// ---------------------------------------------------------------------------
const p1 = reminderPatch(inv(), 'payment_due_5day', { now: '2026-06-10T14:00:00' });
assert.equal(p1.reminder_log.length, 1, 'patch appends one log row');
assert.deepEqual(
  Object.keys(p1.reminder_log[0]).sort(),
  ['dedupe_key', 'kind', 'sent_at'],
  'log row shape {kind, sent_at, dedupe_key}',
);
assert.equal(p1.reminder_log[0].kind, 'payment_due_5day');
assert.equal(p1.reminder_log[0].dedupe_key, 'payrem:inv1:payment_due_5day:2026-06-10');
assert.equal(p1.last_reminder_at, p1.reminder_log[0].sent_at, 'last_reminder_at mirrors the sent stamp');
assert.equal(p1.last_reminder_kind, 'payment_due_5day');
assert.match(p1.reminder_log[0].sent_at, /T.*Z$/, 'sent_at is a full ISO UTC string');

const applied = { ...inv(), ...p1 };
const p2 = reminderPatch(applied, 'payment_past_due', { now: '2026-06-22T09:00:00' });
assert.equal(p2.reminder_log.length, 2, 'second patch preserves prior entries');
assert.equal(p2.reminder_log[0].kind, 'payment_due_5day', 'older entry kept in order');
assert.equal(p2.reminder_log[1].dedupe_key, 'payrem:inv1:payment_past_due:b1');

const patchedBadLog = reminderPatch(inv({ reminder_log: 'garbage' }), 'payment_due_5day', { now: '2026-06-10' });
assert.equal(patchedBadLog.reminder_log.length, 1, 'malformed stored log replaced with a fresh array');
assert.equal(patchedBadLog.reminder_log[0].kind, 'payment_due_5day');

const fullLog = inv({ reminder_log: Array.from({ length: REMINDER_LOG_MAX }, (_, i) => ({ kind: 'payment_past_due', sent_at: `2026-01-01T00:00:0${i % 10}Z`, dedupe_key: `k${i}` })) });
const pCap = reminderPatch(fullLog, 'payment_past_due', { now: '2026-06-22' });
assert.equal(pCap.reminder_log.length, REMINDER_LOG_MAX, `log caps at REMINDER_LOG_MAX (${REMINDER_LOG_MAX})`);
assert.equal(pCap.reminder_log[pCap.reminder_log.length - 1].dedupe_key, 'payrem:inv1:payment_past_due:b1', 'newest entry survives the cap');
assert.equal(pCap.reminder_log[0].dedupe_key, 'k1', 'oldest entry dropped first');

// ---------------------------------------------------------------------------
// invoicesNeedingReminder — schedule ∧ eligible ∧ ¬reminded
// ---------------------------------------------------------------------------
let rows = invoicesNeedingReminder([inv()], { now: '2026-06-10' });
assert.equal(rows.length, 1, 'T-5 day produces a row');
assert.equal(rows[0].kind, 'payment_due_5day');
assert.equal(rows[0].dedupe_key, 'payrem:inv1:payment_due_5day:2026-06-10');
assert.equal(rows[0].invoice.id, 'inv1');
assert.equal(rows[0].due_at, sod('2026-06-10'), 'row carries the schedule due_at');

// Two same-day runs = one send: apply the patch the sender would stamp.
const afterSend = { ...inv(), ...reminderPatch(inv(), 'payment_due_5day', { now: '2026-06-10' }) };
assert.equal(invoicesNeedingReminder([afterSend], { now: '2026-06-10' }).length, 0, 'second same-day run dedupes');
assert.equal(invoicesNeedingReminder([afterSend], { now: '2026-06-11' }).length, 0, 'catch-up day also dedupes — T-5 fires once');

// Past-due cadence: send b0, mid-window dedupes, next bucket re-sends.
const afterB0 = { ...inv(), ...reminderPatch(inv(), 'payment_past_due', { now: '2026-06-16' }) };
assert.equal(invoicesNeedingReminder([afterB0], { now: '2026-06-18' }).length, 0, 'same cadence bucket dedupes mid-window');
rows = invoicesNeedingReminder([afterB0], { now: '2026-06-22' });
assert.equal(rows.length, 1, 'next cadence bucket re-sends');
assert.equal(rows[0].kind, 'payment_past_due');
assert.equal(rows[0].dedupe_key, 'payrem:inv1:payment_past_due:b1');

// Mixed batch — only due + eligible rows.
const batch = [
  inv({ id: 'a', due_date: '2026-06-15' }),                          // T-5 → due
  inv({ id: 'b', due_date: '2026-06-20' }),                          // T-10 → not yet
  inv({ id: 'c', due_date: '2026-06-15', status: 'paid' }),          // paid → skip
  inv({ id: 'd', due_date: '2026-06-15', status: 'void' }),          // void → skip
  inv({ id: 'e', due_date: '2026-06-15', status: 'draft' }),         // draft → skip
  inv({ id: 'f', due_date: '2026-06-15', balance_due: 0 }),          // no balance → skip
  inv({ id: 'g', due_date: '2026-06-01' }),                          // past due b1 → due
  inv({ id: 'h', due_date: '' }),                                    // undated → skip
];
rows = invoicesNeedingReminder(batch, { now: '2026-06-10' });
assert.deepEqual(rows.map((r) => r.invoice.id), ['a', 'g'], 'only due + eligible invoices produce rows');
assert.deepEqual(rows.map((r) => r.kind), ['payment_due_5day', 'payment_past_due'], 'kinds follow the schedule');
assert.deepEqual(rows.map((r) => r.dedupe_key), [
  'payrem:a:payment_due_5day:2026-06-10',
  'payrem:g:payment_past_due:b1',
], 'row dedupe keys match reminderDedupeKey output');

assert.equal(invoicesNeedingReminder([], { now: '2026-06-10' }).length, 0, 'empty list → no rows');
assert.equal(invoicesNeedingReminder(inv(), { now: '2026-06-10' }).length, 1, 'single non-array invoice works');
assert.equal(invoicesNeedingReminder(null, { now: '2026-06-10' }).length, 0, 'null input → no rows');

// reminderSchedule ignores history (schedule truth), needing consults it.
assert.equal(reminderSchedule(loggedT5, { now: '2026-06-11' }).kind, 'payment_due_5day', 'schedule still reports the window on a logged invoice');
assert.equal(reminderLogEntries(loggedT5).length, 1, 'reminderLogEntries reads stored rows');
assert.equal(reminderLogEntries(inv({ reminder_log: [null, 'x', { kind: 'k' }] })).length, 1, 'reminderLogEntries filters non-object rows');

rmSync(out);
console.log('PASS payment-reminders');
