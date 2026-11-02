// Saved report runs — ESTIMATOR_MASTERPLAN WS-J / item J-09.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// digestBatchModel / paymentReminderModel / alertSubscriptionsModel /
// delivery.
//
// Report run history + parameter persistence + re-run + scheduled digest
// delivery via H-13 (digestBatchModel). The reportEngine (J-01,
// src/components/reports/reportEngine.js) owns definitions and run();
// THIS model owns the records that persistence wiring writes:
//
//   ReportRun        — one row per executed run. params_snapshot is the
//                      CANONICAL JSON string (sorted keys, JSON.stringify
//                      semantics) so identical param states serialize
//                      identically — the same contract savedViewsModel
//                      documents for queue filters. params_hash is the
//                      FNV-1a (32-bit, base36) hash of that canonical
//                      string — parity copy of digestBatchModel.stableHash.
//                      creation_request_key is deterministic:
//                      'rptrun:<report_id>:<params_hash>:<day-ms>' where
//                      <day-ms> is the LOCAL-midnight epoch ms of the run
//                      day (repo local-calendar-day convention, same as
//                      paymentReminderModel/digestBatchModel day keys).
//                      Consequence: re-running the same report with the
//                      same params on the same day reuses the key — the
//                      idempotent-create layer treats it as a retry and
//                      serves the existing row; a new day or new params
//                      produces a new history row. Callers that want a
//                      row per click must salt the key themselves.
//
//   ScheduledReport  — one row per saved schedule. scheduledReportPatch()
//                      emits the create/update payload: report_id, params
//                      (canonical object), user_email, delivery
//                      ('digest'|'immediate'), cron_hint, enabled,
//                      last_run_at, next_run_at, plus params_hash +
//                      creation_request_key extras
//                      ('rptsched:<user>:<report>:<params_hash>').
//
// Schedule math (nextRunAt) — cron_hint is a named hint, not a raw cron
// expression (cronSchedule.mjs owns full cron for workflows). Canonical
// hints: 'daily' | 'weekly_<dow>' | 'monthly_<dom>'; the spec'd members
// are 'daily', 'weekly_mon', 'monthly_1'. All math is LOCAL wall-clock
// and strictly-after the anchor instant (a schedule created on its own
// firing slot rolls to the next occurrence):
//   daily          → next day, same wall time.
//   weekly_<dow>   → next date whose getDay() matches (1–7 days out),
//                    same wall time.
//   monthly_<dom>  → next month/day-<dom> strictly after the anchor, same
//                    wall time; dom CLAMPS to the month length (31 → Feb
//                    28/29) and each month clamps independently, so a
//                    monthly_31 anchored Jan 31 runs Feb 28 then Mar 31 —
//                    the clamp does not cascade.
// Unknown/blank hints normalize to 'daily' — fail-visible (a typo'd
// stored hint still delivers), never silently dead.
//
// 'digest' delivery means the run result lands inside the user's H-13
// once-a-day digest row (digest:<user>:<YYYY-MM-DD>) as a line item —
// reportRunDigestItem() emits exactly the {title, deep_link, kind} shape
// digestBatchModel.digestItemFor/composeDigest consume; deep_link rides
// the shareable '/OpsReports?report=<id>' convention OpsReports.jsx
// resolves. 'immediate' is the feed lane.
//
// Dates: `now`/`from`/`last_run_at` accept Date, epoch ms, ISO datetimes,
// or 'YYYY-MM-DD' (parsed as LOCAL midnight — repo convention, same as
// reportEngine.parseReportDate). `now` is always injectable — the model
// never reads the clock except as an explicit fallback.
//
// API:
//   REPORT_RUN_KEY_PREFIX / SCHEDULED_REPORT_KEY_PREFIX /
//     REPORT_RUN_DELIVERIES / SCHEDULE_HINTS / REPORT_RUN_DIGEST_KIND /
//     REPORT_DEEP_LINK_BASE / HISTORY_LIMIT_DEFAULT
//   canonicalParams(params)            — JSON-safe object, deep-sorted keys
//   canonicalParamsJson(params)        — canonical JSON string (sorted keys)
//   paramsHash(params)                 — FNV-1a → base36 (key-order safe)
//   paramSignature(params)             — 'k=v&k=v' canonical text
//   reportRunDayMs(now)                — local-midnight epoch ms (key part)
//   runRecord(report_id, params, {actor_id, now, row_count, duration_ms})
//   savedViewFor(report_id, params)    — {name, report_id, params}
//   parseRunParams(record)             — params_snapshot string | params obj
//   rerunSpec(run_record)              — {report_id, params} replay input
//   normalizeCronHint(hint)            — canonical hint ('daily' fallback)
//   nextRunAt(cron_hint, from)         — next scheduled instant, ISO
//   scheduledReportPatch({report_id, params, user, delivery, cron_hint,
//                         enabled?, last_run_at?, now?})
//   scheduledRunsDue(rows, {now})      — enabled && next_run_at <= now
//   scheduledReportRunStamp(schedule, {now}) → {last_run_at, next_run_at}
//   historyRows(runs, {report_id?, user?, limit?}) — newest-first
//   reportRunDigestItem(record, {report_name?}) — H-13 digest line item

const DAY_MS = 86400000;

export const REPORT_RUN_KEY_PREFIX = 'rptrun';
export const SCHEDULED_REPORT_KEY_PREFIX = 'rptsched';
export const REPORT_RUN_DELIVERIES = ['digest', 'immediate'] as const;

// Canonical spec'd hints — normalizeCronHint also accepts the generalized
// weekly_<dow> / monthly_<dom> family these are members of.
export const SCHEDULE_HINTS = ['daily', 'weekly_mon', 'monthly_1'] as const;

// Digest line-item kind for a delivered scheduled-run result. Outside
// DIGEST_KIND_LABELS, so digests humanize it ('Scheduled report') unless
// the registry grows a label.
export const REPORT_RUN_DIGEST_KIND = 'scheduled_report';

// OpsReports.jsx resolves ?report=<key> — the shareable report deep link.
export const REPORT_DEEP_LINK_BASE = '/OpsReports';

export const HISTORY_LIMIT_DEFAULT = 50;
export const HISTORY_LIMIT_MAX = 500;

const clean = (v: any): string => String(v ?? '').trim();
const lower = (v: any): string => clean(v).toLowerCase();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => (Array.isArray(v) ? v : []);

const nonNegInt = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

const humanize = (key: any): string =>
  clean(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// dates — local-calendar convention (reportEngine/paymentReminder parity)
// ---------------------------------------------------------------------------

// 'YYYY-MM-DD' parses as LOCAL midnight; everything else defers to Date.
// Null for unparseable input.
function toDate(value: any): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = clean(value);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// The day anchor embedded in runRecord's creation_request_key — the
// local-midnight epoch ms of the run day. Exported so callers/tests can
// predict a key without re-deriving the convention.
export function reportRunDayMs(now: any = new Date()): number {
  return startOfLocalDay(toDate(now) ?? new Date()).getTime();
}

// ---------------------------------------------------------------------------
// canonical params + stable hash
// ---------------------------------------------------------------------------

// JSON.stringify semantics with sorted object keys: undefined/function/
// symbol values drop from objects and become null inside arrays; non-
// finite numbers serialize null; toJSON() hooks honored first — identical
// output for the same logical state regardless of key insertion order.
function canon(v: any): string | undefined {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'object') {
    if (typeof (v as any).toJSON === 'function') return canon((v as any).toJSON());
    if (Array.isArray(v)) return `[${v.map((x) => canon(x) ?? 'null').join(',')}]`;
    const parts: string[] = [];
    for (const k of Object.keys(v).sort()) {
      const c = canon((v as any)[k]);
      if (c !== undefined) parts.push(`${JSON.stringify(k)}:${c}`);
    }
    return `{${parts.join(',')}}`;
  }
  return undefined; // undefined / function / symbol — JSON.stringify drops these
}

// Canonical JSON string of a params object — deep-sorted keys, JSON-safe.
// Params are objects in this system; non-object input canonizes to '{}'
// (never crashes a write path on junk).
export function canonicalParamsJson(params: any): string {
  if (!isObj(params)) return '{}';
  return canon(params) ?? '{}';
}

// The canonical params OBJECT — JSON.parse of the canonical string, so
// the result is deep JSON-safe (undefined/functions dropped, Dates → ISO
// strings) with deterministically-ordered keys.
export function canonicalParams(params: any): Record<string, any> {
  return JSON.parse(canonicalParamsJson(params));
}

// Deterministic FNV-1a (32-bit) → base36 — parity copy of
// digestBatchModel.stableHash. No crypto import: crypto.subtle is async
// and unavailable sync in some targets; this is stable everywhere.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Stable hash of a params state — object key order does NOT matter.
export function paramsHash(params: any): string {
  return fnv1a(canonicalParamsJson(params));
}

const sigValue = (v: any): string => {
  if (Array.isArray(v)) return v.map(sigValue).filter((x) => x !== '').join('|');
  if (isObj(v)) return canon(v) ?? '';
  if (v === null || v === undefined) return '';
  return clean(v);
};

// 'k=v&k=v' canonical text — sorted keys, compact value rendering
// (arrays join '|', objects serialize canonically). Used for view-name
// suggestions and human-readable param echoes.
export function paramSignature(params: any): string {
  const p = canonicalParams(params);
  return Object.keys(p)
    .map((k) => `${k}=${sigValue(p[k])}`)
    .join('&');
}

// ---------------------------------------------------------------------------
// runRecord — the ReportRun row one executed run persists
// ---------------------------------------------------------------------------

// Params for runRecord: {actor_id?, now?, row_count?, duration_ms?}.
// actor_id also tolerates run_by/user_email/user/actor spellings; now is
// injectable (Date | ms | ISO | 'YYYY-MM-DD'); missing/unparseable now
// falls back to the real clock.
export function runRecord(report_id: any, params: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const id = clean(report_id);
  const snapshot = canonicalParamsJson(params);
  const hash = paramsHash(params);
  const at = toDate(o.now) ?? new Date();
  const actor = lower(o.actor_id ?? o.run_by ?? o.user_email ?? o.user ?? o.actor);
  const dayMs = reportRunDayMs(at);
  return {
    report_id: id,
    params_snapshot: snapshot,
    params_hash: hash,
    run_by: actor,
    run_at: at.toISOString(),
    row_count: nonNegInt(o.row_count),
    duration_ms: nonNegInt(o.duration_ms),
    creation_request_key: `${REPORT_RUN_KEY_PREFIX}:${id}:${hash}:${dayMs}`,
  };
}

// ---------------------------------------------------------------------------
// savedViewFor — name suggestion + canonical params for a saved view
// ---------------------------------------------------------------------------

// {name, report_id, params} — the name is a suggestion the caller may
// override: '<Humanized Report Id>' plus the param signature when any
// params are set ('Sales By Customer — basis=created&range=this_month').
export function savedViewFor(report_id: any, params: any) {
  const id = clean(report_id);
  const p = canonicalParams(params);
  const sig = paramSignature(p);
  const base = humanize(id) || 'Report';
  const name = sig ? `${base} — ${sig}` : base;
  return { name: name.slice(0, 140), report_id: id, params: p };
}

// ---------------------------------------------------------------------------
// rerunSpec — replay input for reportEngine.runReport(def, {params, data})
// ---------------------------------------------------------------------------

// Tolerates both stored spellings: params_snapshot (canonical JSON
// STRING, this model's shape) and params (object rows from other
// writers). Always returns a plain object — {} on junk.
export function parseRunParams(record: any): Record<string, any> {
  const r = isObj(record) ? record : {};
  const raw = r.params ?? r.params_snapshot;
  if (isObj(raw)) return canonicalParams(raw);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(clean(raw));
      return isObj(parsed) ? canonicalParams(parsed) : {};
    } catch {
      return {};
    }
  }
  return {};
}

// {report_id, params} — feed report_id to the catalog lookup and params
// straight into runReport's params arg. A re-run reproduces the original
// resolution because the snapshot carried the exact input state.
export function rerunSpec(run_record: any) {
  const r = isObj(run_record) ? run_record : {};
  return { report_id: clean(r.report_id), params: parseRunParams(r) };
}

// ---------------------------------------------------------------------------
// schedule hints + next-run math (ScheduledReport)
// ---------------------------------------------------------------------------

const DOW: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const DOW_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Canonical hint: 'daily' | 'weekly_<sun..sat>' | 'monthly_<1..31>'.
// Aliases tolerated ('day', 'weekly', 'monthly', full weekday names,
// space/dash separators). Unknown/blank → 'daily' (fail-visible).
export function normalizeCronHint(hint: any): string {
  const h = lower(hint).replace(/[\s\-]+/g, '_');
  if (!h) return 'daily';
  if (h === 'daily' || h === 'day' || h === 'every_day') return 'daily';
  if (h === 'weekly' || h === 'week' || h === 'every_week') return 'weekly_mon';
  const w = /^weekly_([a-z]+)$/.exec(h);
  if (w && DOW[w[1]] !== undefined) return `weekly_${DOW_ABBR[DOW[w[1]]]}`;
  if (h === 'monthly' || h === 'month' || h === 'every_month') return 'monthly_1';
  const m = /^monthly_(\d{1,2})$/.exec(h);
  if (m) {
    const dom = Number(m[1]);
    if (dom >= 1 && dom <= 31) return `monthly_${dom}`;
  }
  return 'daily';
}

// Next scheduled instant STRICTLY after `from`, at `from`'s local wall
// time — ISO string. daily → +1 day; weekly_<dow> → the next matching
// weekday (a match on from-date rolls +7 because the instant must be
// strictly later); monthly_<dom> → the next month whose clamped dom is
// strictly later (clamped to month length — see header, no cascade).
export function nextRunAt(cron_hint: any, from: any = new Date()): string {
  const base = toDate(from) ?? new Date();
  const hint = normalizeCronHint(cron_hint);
  const H = base.getHours();
  const M = base.getMinutes();
  const S = base.getSeconds();
  const MS = base.getMilliseconds();
  const cand = (y: number, mo: number, d: number) => new Date(y, mo, d, H, M, S, MS);

  if (hint === 'daily') {
    return cand(base.getFullYear(), base.getMonth(), base.getDate() + 1).toISOString();
  }
  const w = /^weekly_([a-z]{3})$/.exec(hint);
  if (w) {
    const dow = DOW[w[1]];
    for (let n = 1; n <= 7; n++) {
      const c = cand(base.getFullYear(), base.getMonth(), base.getDate() + n);
      if (c.getDay() === dow) return c.toISOString();
    }
  }
  const m = /^monthly_(\d{1,2})$/.exec(hint);
  if (m) {
    const dom = Number(m[1]);
    for (let n = 0; n < 15; n++) {
      const monthIdx = base.getMonth() + n;
      const yy = base.getFullYear() + Math.floor(monthIdx / 12);
      const mm = monthIdx % 12;
      const daysIn = new Date(yy, mm + 1, 0).getDate();
      const c = cand(yy, mm, Math.min(dom, daysIn));
      if (c.getTime() > base.getTime()) return c.toISOString();
    }
  }
  // Unreachable while normalizeCronHint falls back to 'daily'; kept as a
  // safe floor so a future hint can never crash the sweep.
  return new Date(base.getTime() + DAY_MS).toISOString();
}

const SCHEDULE_DELIVERY_ALIASES: Record<string, 'digest' | 'immediate'> = {
  digest: 'digest',
  daily: 'digest',
  daily_digest: 'digest',
  batched: 'digest',
  batch: 'digest',
  immediate: 'immediate',
  now: 'immediate',
  instant: 'immediate',
  inline: 'immediate',
};

// 'digest' default — the item is scheduled DIGEST delivery; unknown
// values land in the digest lane (catchable at the daily send) rather
// than firing immediate sends.
function normalizeScheduleDelivery(v: any): 'digest' | 'immediate' {
  return SCHEDULE_DELIVERY_ALIASES[lower(v).replace(/[\s\-]+/g, '_')] ?? 'digest';
}

// The ScheduledReport create/update payload. `params` stores the
// canonical OBJECT (entity object column — filterable), params_hash +
// creation_request_key ride along as deterministic extras. next_run_at
// anchors on last_run_at when supplied (a re-saved schedule resumes its
// cadence from the last firing, catching up if that slot already passed)
// and on now otherwise.
export function scheduledReportPatch(input: any = {}) {
  const o = isObj(input) ? input : {};
  const id = clean(o.report_id);
  const p = canonicalParams(o.params);
  const hash = paramsHash(p);
  const user = lower(o.user ?? o.user_email ?? o.actor_id ?? o.owner_email);
  const delivery = normalizeScheduleDelivery(o.delivery);
  const hint = normalizeCronHint(o.cron_hint);
  const now = toDate(o.now) ?? new Date();
  const lastRun = toDate(o.last_run_at);
  return {
    report_id: id,
    params: p,
    params_hash: hash,
    user_email: user,
    delivery,
    cron_hint: hint,
    enabled: o.enabled === undefined ? true : o.enabled === true,
    last_run_at: lastRun ? lastRun.toISOString() : null,
    next_run_at: nextRunAt(hint, lastRun ?? now),
    creation_request_key:
      `${SCHEDULED_REPORT_KEY_PREFIX}:${user || 'anon'}:${id}:${hash}`,
  };
}

// Scheduled rows due to fire: enabled !== false && next_run_at parses &&
// <= now. Sorted by next_run_at ascending so the oldest debt runs first.
export function scheduledRunsDue(rows: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const now = toDate(o.now) ?? new Date();
  return list(rows)
    .filter((r) => isObj(r) && r.enabled !== false && r.enabled !== 'false')
    .map((r) => ({ row: r, due_ms: toDate(r.next_run_at)?.getTime() ?? null }))
    .filter((x): x is { row: any; due_ms: number } => x.due_ms !== null && x.due_ms <= now.getTime())
    .sort((a, b) => a.due_ms - b.due_ms)
    .map((x) => x.row);
}

// The advance patch a sweep persists after firing a schedule: stamps
// last_run_at = now and recomputes next_run_at from now (not from the
// missed slot — a sweep that ran late resumes on the NEXT cadence
// boundary, it does not drip-feed catch-up runs).
export function scheduledReportRunStamp(schedule: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const s = isObj(schedule) ? schedule : {};
  const now = toDate(o.now) ?? new Date();
  return {
    last_run_at: now.toISOString(),
    next_run_at: nextRunAt(s.cron_hint, now),
  };
}

// ---------------------------------------------------------------------------
// historyRows — newest-first run history
// ---------------------------------------------------------------------------

// Sorted newest-first: run_at (falling back to created_date) descending,
// ties break on created_date then id descending so the order is stable.
// Filters: report_id exact match; user matches run_by/user_email/
// actor_id/user case-insensitively. limit defaults to
// HISTORY_LIMIT_DEFAULT, clamps to HISTORY_LIMIT_MAX; limit 0 → [].
export function historyRows(runs: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const rid = clean(o.report_id);
  const user = lower(o.user ?? o.user_email ?? o.run_by);
  const lim = Number(o.limit);
  const limit = Number.isFinite(lim)
    ? Math.min(HISTORY_LIMIT_MAX, Math.max(0, Math.trunc(lim)))
    : HISTORY_LIMIT_DEFAULT;
  const rows = list(runs).filter((r) => {
    if (!isObj(r)) return false;
    if (rid && clean(r.report_id) !== rid) return false;
    if (user) {
      const u = lower(r.run_by ?? r.user_email ?? r.actor_id ?? r.user);
      if (u !== user) return false;
    }
    return true;
  });
  const ts = (r: any): number =>
    toDate(r.run_at)?.getTime() ?? toDate(r.created_date)?.getTime() ?? Number.NEGATIVE_INFINITY;
  rows.sort((a, b) => {
    const d = ts(b) - ts(a);
    if (d && Number.isFinite(d)) return d;
    if (d === Infinity) return 1;
    if (d === -Infinity) return -1;
    const ca = clean(a.created_date);
    const cb = clean(b.created_date);
    if (ca !== cb) return cb.localeCompare(ca);
    return clean(b.id).localeCompare(clean(a.id));
  });
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// reportRunDigestItem — H-13 digest delivery bridge
// ---------------------------------------------------------------------------

// The line item a delivered run contributes to the user's daily digest:
// exactly the {title, deep_link, kind} shape digestBatchModel
// digestItemFor/composeDigest consume. deep_link rides the shareable
// '/OpsReports?report=<id>' convention; opts.report_name overrides the
// humanized-id title base, row_count appends ' — N rows' when finite.
export function reportRunDigestItem(record: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const r = isObj(record) ? record : {};
  const rid = clean(r.report_id);
  const name = clean(o.report_name) || humanize(rid) || 'Report';
  const rows = Number(r.row_count);
  const countText = Number.isFinite(rows) ? ` — ${rows} row${rows === 1 ? '' : 's'}` : '';
  return {
    title: `${name} ready${countText}`,
    deep_link: rid ? `${REPORT_DEEP_LINK_BASE}?report=${encodeURIComponent(rid)}` : REPORT_DEEP_LINK_BASE,
    kind: REPORT_RUN_DIGEST_KIND,
  };
}
