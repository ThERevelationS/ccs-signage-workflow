// Payment-due reminders — ESTIMATOR_MASTERPLAN WS-H / item H-07.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// followUpMachine / proofFollowUpModel / delivery.
//
// Two reminder kinds (REMINDER_KINDS):
//   payment_due_5day  — the H-02 seeded NotificationTemplate
//                       (kind+key 'payment_due_5day'). Fires when `today`
//                       lands inside the inclusive window [due_date−5,
//                       due_date] — i.e. ON the T−5 boundary day in the
//                       normal sweep, with catch-up through the due date if
//                       an earlier sweep was skipped.
//   payment_past_due  — the past-due variant (staff-authored template key
//                       'payment_past_due', NotificationTemplate kind
//                       'custom'). Fires once the invoice is unpaid past
//                       due_date, then re-fires once per cadence window of
//                       cfg.past_due_cadence_days (default 7), not daily.
//
// Eligibility (both kinds): open balance > 0 AND invoice.status NOT in
// {draft, paid, void} — the full Invoice.jsonc enum is
// draft|sent|partially_paid|paid|void, so 'sent' and 'partially_paid' (and
// any future/unknown status) are reminder-eligible. A missing status reads
// as the entity default 'draft'. Open balance uses the server-maintained
// balance_due when finite, else total − amount_paid (mirrors
// fulfillmentModel.openBalance) — rows predating balance_due still gate
// correctly.
//
// Schedule truth vs send history are separate concerns:
//   reminderSchedule()  — pure timing: which kind is due NOW (kind), when
//                         its window opened (due_at), whether the invoice
//                         can receive reminders at all (eligible), and a
//                         machine-readable reason.
//   alreadyReminded()   — history: reads invoice.reminder_log[] entries
//                         ({kind, sent_at, dedupe_key}); the sweeper
//                         persists each send via reminderPatch().
//   invoicesNeedingReminder() — schedule ∧ eligible ∧ ¬reminded → the
//                         rows a sweep should act on, each carrying the
//                         dedupe_key the sender must stamp.
//
// Dedupe scheme (reminderDedupeKey):
//   payment_due_5day → payrem:<invoice_id>:payment_due_5day:<YYYY-MM-DD>
//       Local calendar day of the evaluation. alreadyReminded ALSO matches
//       any prior payment_due_5day log entry regardless of key — the T−5
//       reminder is once-ever per invoice, so two same-day runs dedupe and
//       a catch-up day inside the window can't re-fire it.
//   payment_past_due → payrem:<invoice_id>:payment_past_due:b<N>
//       N = floor(daysPastDue / cadence_days) — the cadence bucket, not a
//       date. Every evaluation inside one bucket yields the same key, so
//       repeat sweeps dedupe; the next bucket produces a new key and the
//       reminder re-sends on cadence (never daily). Bucket 0 covers
//       daysPastDue 1..cadence−1 (day 0 = due date itself is still
//       payment_due_5day window, not past due); bucket k≥1 covers
//       k·cadence .. k·cadence+cadence−1.
//   <invoice_id> is invoice.id, falling back to invoice_number, else
//   'unknown' — deterministic even on unsaved rows.
//
// reminderPatch() returns the entity patch the caller persists (CAS
// updateMany in the sweep): reminder_log append {kind, sent_at,
// dedupe_key} + last_reminder_at (+ last_reminder_kind display hint).
// reminder_log is capped at REMINDER_LOG_MAX entries — oldest rows drop
// first; a dropped T−5 entry can never re-arm (that window is long past by
// then) and past-due dedupe only ever needs the current bucket's key.
//
// Dates: inputs may be ISO datetimes, date-only 'YYYY-MM-DD' (parsed as
// LOCAL midnight — repo convention, matches followUpMachine/dueDateEngine),
// epoch ms, or Date. All day comparisons are local-calendar-day; outputs
// are full ISO UTC strings. `now` is always injectable — the model never
// reads the clock.
//
// API:
//   REMINDER_KINDS / REMINDER_TEMPLATE_KEYS / REMINDER_DEFAULTS
//   REMINDER_INELIGIBLE_STATUSES / REMINDER_LOG_MAX
//   resolveReminderConfig(cfg?)        — {due_soon_days:5, past_due_cadence_days:7} + clamps
//   openInvoiceBalance(invoice)        — balance_due else total − amount_paid, ≥0
//   daysPastDue(invoice, now)          — local-day diff, null when unparseable
//   daysUntilDue(invoice, now)         — same, positive while due is ahead
//   reminderSchedule(invoice, {now, cfg?})
//     → {kind, due_at, eligible, reason, days_past_due?, days_until_due?, cadence_bucket?}
//   reminderDedupeKey(invoice, kind, {now, cfg?}) → 'payrem:…' string
//   reminderLogEntries(invoice)        — reminder_log rows (array or [])
//   alreadyReminded(invoice, kind, {now, cfg?}) → bool
//   invoicesNeedingReminder(invoices, {now, cfg?})
//     → [{invoice, kind, dedupe_key, due_at}]
//   reminderPatch(invoice, kind, {now, cfg?})
//     → {reminder_log, last_reminder_at, last_reminder_kind}

export const REMINDER_KINDS = ['payment_due_5day', 'payment_past_due'] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

// NotificationTemplate.key each reminder kind renders through in the H-03
// template engine. 'payment_due_5day' is the seeded CoreBridge slot (H-02);
// 'payment_past_due' is the past-due variant key (kind 'custom' — a
// staff-authored template row keyed for the sweep to look up).
export const REMINDER_TEMPLATE_KEYS: Record<ReminderKind, string> = {
  payment_due_5day: 'payment_due_5day',
  payment_past_due: 'payment_past_due',
};

export const REMINDER_DEFAULTS = {
  // Days before due_date the 'payment_due_5day' window opens (T−5).
  due_soon_days: 5,
  // Days between past-due reminder sends (cadence bucket width).
  past_due_cadence_days: 7,
};

// Invoice.status values that can never carry a payment reminder
// (Invoice.jsonc enum draft|sent|partially_paid|paid|void).
export const REMINDER_INELIGIBLE_STATUSES = ['draft', 'paid', 'void'] as const;

// reminder_log entry cap — see header (dedupe only needs the current
// cadence bucket's key; older rows are audit history).
export const REMINDER_LOG_MAX = 100;

export const REMINDER_LOG_FIELD = 'reminder_log';
export const REMINDER_LAST_SENT_FIELD = 'last_reminder_at';

const DAY_MS = 24 * 60 * 60 * 1000;

const clean = (v: any): string => String(v ?? '').trim();

const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Any parseable input → epoch ms; date-only parses as LOCAL midnight (bare
// `new Date(str)` would be UTC — repo convention matches followUpMachine,
// dueDateEngine, fulfillmentModel.parseLocalDate).
const toInstant = (value: any): number | null => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const v = clean(value);
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
};

const toIso = (t: number): string => new Date(t).toISOString();

// Local calendar-day start for an instant — all due/past-due comparisons
// are day-grained, not instant-grained.
const startOfDayMs = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Local 'YYYY-MM-DD' — the day component embedded in dedupe keys must match
// the same local-day arithmetic the schedule uses (a 'YYYY-MM-DD' input
// parsed local-midnight round-trips to itself).
const dayKey = (t: number): string => {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

// Whole local days from earlier → later (Math.round absorbs DST ±1h).
const localDayDiff = (laterMs: number, earlierMs: number): number =>
  Math.round((startOfDayMs(laterMs) - startOfDayMs(earlierMs)) / DAY_MS);

const intOr = (v: any, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

// cfg resolution — caller keys win; non-finite → defaults;
// due_soon_days clamps ≥0, past_due_cadence_days clamps ≥1 (a 0-day cadence
// would make every past-due day a new bucket = daily sends).
export function resolveReminderConfig(cfg: any = {}) {
  const c = isObj(cfg) ? cfg : {};
  return {
    due_soon_days: Math.max(0, intOr(c.due_soon_days, REMINDER_DEFAULTS.due_soon_days)),
    past_due_cadence_days: Math.max(
      1,
      intOr(c.past_due_cadence_days, REMINDER_DEFAULTS.past_due_cadence_days),
    ),
  };
}

// Open collectible balance: balance_due is the server-maintained truth;
// fall back to total − amount_paid for rows predating the field. Never
// negative — an overpaid/credited invoice has nothing to remind about.
export function openInvoiceBalance(invoice: any): number {
  const balance = Number(invoice?.balance_due);
  if (Number.isFinite(balance)) return Math.max(0, balance);
  const total = Number(invoice?.total);
  const paid = Number(invoice?.amount_paid);
  if (Number.isFinite(total) || Number.isFinite(paid)) {
    return Math.max(0, (Number.isFinite(total) ? total : 0) - (Number.isFinite(paid) ? paid : 0));
  }
  return 0;
}

// Local days since due_date (positive once due is strictly past — due today
// is 0, not past due). null when either side can't parse.
export function daysPastDue(invoice: any, now: any): number | null {
  const dueMs = toInstant(invoice?.due_date);
  const nowMs = toInstant(now);
  if (dueMs === null || nowMs === null) return null;
  return localDayDiff(nowMs, dueMs);
}

// Local days until due_date (positive while due is ahead).
export function daysUntilDue(invoice: any, now: any): number | null {
  const d = daysPastDue(invoice, now);
  return d === null ? null : -d;
}

const normStatus = (v: any): string => clean(v).toLowerCase();

// Past-due cadence bucket for an invoice at `now` — floor(dpd/cadence) per
// the H-07 spec; missing dates / not-yet-past-due collapse to bucket 0 so
// the key stays deterministic.
const pastDueBucket = (invoice: any, nowMs: number | null, cadence: number): number => {
  if (nowMs === null) return 0;
  const dueMs = toInstant(invoice?.due_date);
  if (dueMs === null) return 0;
  const dpd = Math.max(0, localDayDiff(nowMs, dueMs));
  return Math.floor(dpd / cadence);
};

// Schedule for one invoice: which reminder kind is due at `now`, the
// instant its window opened, whether the invoice is reminder-eligible at
// all, and why. `kind` is null when nothing is currently due; `due_at` then
// still carries the upcoming T−5 instant when one is scheduled.
//
// reasons: 'invoice_missing' | 'now_invalid' | 'status_draft' |
// 'status_paid' | 'status_void' | 'no_open_balance' | 'due_date_missing' |
// 'due_soon' | 'past_due' | 'not_yet_due'.
export function reminderSchedule(invoice: any, { now, cfg }: any = {}) {
  const resolved = resolveReminderConfig(cfg);
  const nowMs = toInstant(now);
  if (nowMs === null) {
    return { kind: null, due_at: null, eligible: false, reason: 'now_invalid' };
  }
  if (!isObj(invoice)) {
    return { kind: null, due_at: null, eligible: false, reason: 'invoice_missing' };
  }
  // Missing status reads as the entity default 'draft' — an unsent draft
  // never reminds.
  const status = normStatus(invoice.status) || 'draft';
  if ((REMINDER_INELIGIBLE_STATUSES as readonly string[]).includes(status)) {
    return { kind: null, due_at: null, eligible: false, reason: `status_${status}` };
  }
  if (openInvoiceBalance(invoice) <= 0) {
    return { kind: null, due_at: null, eligible: false, reason: 'no_open_balance' };
  }
  const dueMs = toInstant(invoice.due_date);
  if (dueMs === null) {
    return { kind: null, due_at: null, eligible: true, reason: 'due_date_missing' };
  }

  const todayMs = startOfDayMs(nowMs);
  const dueDayMs = startOfDayMs(dueMs);
  const dpd = Math.round((todayMs - dueDayMs) / DAY_MS); // >0 → past due
  const t5Ms = dueDayMs - resolved.due_soon_days * DAY_MS;

  if (dpd >= 1) {
    const cadence = resolved.past_due_cadence_days;
    const bucket = Math.floor(dpd / cadence);
    // Window-open day for the current bucket: bucket 0 opens the day after
    // due_date (dpd 0 is still the T−5 window); bucket k≥1 opens k·cadence
    // days after due.
    const windowStartMs = dueDayMs + (bucket === 0 ? 1 : bucket * cadence) * DAY_MS;
    return {
      kind: 'payment_past_due' as ReminderKind,
      due_at: toIso(windowStartMs),
      eligible: true,
      reason: 'past_due',
      days_past_due: dpd,
      cadence_bucket: bucket,
    };
  }
  if (todayMs >= t5Ms) {
    // Inclusive T−5 window [due−N, due]: fires on the boundary day, catches
    // up through the due date when earlier sweeps were skipped.
    return {
      kind: 'payment_due_5day' as ReminderKind,
      due_at: toIso(t5Ms),
      eligible: true,
      reason: 'due_soon',
      days_until_due: -dpd,
    };
  }
  return {
    kind: null,
    due_at: toIso(t5Ms), // upcoming T−5 instant — informative, not yet due
    eligible: true,
    reason: 'not_yet_due',
    days_until_due: -dpd,
  };
}

// Deterministic dedupe identity for one send. 'payrem:<id>:<kind>:<day>'
// for the T−5 kind (per-day dedupe), 'payrem:<id>:payment_past_due:b<N>'
// for the past-due kind (per-cadence-bucket dedupe — see header). `now`
// invalid → a 'nodate'/'b0' key that can only match an equally malformed
// logged entry, never a real send.
export function reminderDedupeKey(invoice: any, kind: any, { now, cfg }: any = {}): string {
  const id = clean(invoice?.id) || clean(invoice?.invoice_number) || 'unknown';
  const k = clean(kind) || 'unknown';
  if (k === 'payment_past_due') {
    const resolved = resolveReminderConfig(cfg);
    const nowMs = toInstant(now);
    const bucket = pastDueBucket(invoice, nowMs, resolved.past_due_cadence_days);
    return `payrem:${id}:${k}:b${bucket}`;
  }
  const nowMs = toInstant(now);
  const day = nowMs === null ? 'nodate' : dayKey(nowMs);
  return `payrem:${id}:${k}:${day}`;
}

// Stored reminder_log rows (normalized enough to match on): array or [].
// Entry shape written by reminderPatch: {kind, sent_at, dedupe_key}.
export function reminderLogEntries(invoice: any): any[] {
  const log = invoice?.[REMINDER_LOG_FIELD];
  return Array.isArray(log) ? log.filter(isObj) : [];
}

// True when this invoice's reminder_log already records an equivalent send:
//   - any entry carrying THIS evaluation's dedupe_key (same day for T−5,
//     same cadence bucket for past-due), or
//   - for payment_due_5day, ANY prior entry of that kind — the T−5 reminder
//     is once-ever per invoice, so a logged send on an earlier window day
//     still suppresses a catch-up fire later in the window.
// Past-due entries from older buckets intentionally do NOT match — that's
// the cadence re-send.
export function alreadyReminded(invoice: any, kind: any, { now, cfg }: any = {}): boolean {
  if (!isObj(invoice)) return false;
  const k = clean(kind);
  if (!k) return false;
  const key = reminderDedupeKey(invoice, k, { now, cfg });
  for (const entry of reminderLogEntries(invoice)) {
    const entryKey = clean(entry?.dedupe_key);
    if (entryKey && entryKey === key) return true;
    if (k === 'payment_due_5day' && clean(entry?.kind) === 'payment_due_5day') return true;
  }
  return false;
}

// The sweep's work list: every invoice whose schedule currently demands a
// send (eligible + kind due now) that history hasn't already recorded.
// Rows: {invoice, kind, dedupe_key, due_at} — dedupe_key is what the sender
// stamps into the Notification row AND what reminderPatch logs.
export function invoicesNeedingReminder(invoices: any, { now, cfg }: any = {}) {
  const list = Array.isArray(invoices) ? invoices : invoices ? [invoices] : [];
  const rows: any[] = [];
  for (const invoice of list) {
    const s = reminderSchedule(invoice, { now, cfg });
    if (!s.eligible || !s.kind) continue;
    if (alreadyReminded(invoice, s.kind, { now, cfg })) continue;
    rows.push({
      invoice,
      kind: s.kind,
      dedupe_key: reminderDedupeKey(invoice, s.kind, { now, cfg }),
      due_at: s.due_at,
    });
  }
  return rows;
}

// Entity patch recording one sent reminder: reminder_log append
// {kind, sent_at, dedupe_key} + last_reminder_at (+ last_reminder_kind).
// Unconditional — the caller evaluates schedule/history first (H-05's
// claim-then-deliver ordering persists this patch BEFORE attempting
// delivery, so a failed send can never double-send). Stored log is
// preserved verbatim and capped at REMINDER_LOG_MAX (oldest drop first).
export function reminderPatch(invoice: any, kind: any, { now, cfg }: any = {}) {
  const nowMs = toInstant(now) ?? Date.now();
  const sentAt = toIso(nowMs);
  const k = clean(kind);
  const entry = {
    kind: k,
    sent_at: sentAt,
    dedupe_key: reminderDedupeKey(invoice, k, { now, cfg }),
  };
  const stored = Array.isArray(invoice?.[REMINDER_LOG_FIELD]) ? invoice[REMINDER_LOG_FIELD] : [];
  const reminder_log = [...stored, entry].slice(-REMINDER_LOG_MAX);
  return {
    [REMINDER_LOG_FIELD]: reminder_log,
    [REMINDER_LAST_SENT_FIELD]: sentAt,
    last_reminder_kind: k || null,
  };
}
