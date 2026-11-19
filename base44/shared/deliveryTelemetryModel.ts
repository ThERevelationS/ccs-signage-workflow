// Notification delivery telemetry — ESTIMATOR_MASTERPLAN WS-H / item H-14.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// delivery / templateRender / paymentReminderModel / statementBatchModel /
// vendorNotifyModel.
//
// H-01's buildDeliveryPlan routes every outbound event through an external
// lane — 'email' when GlobalSettings.emailDelivery.enabled === true, else
// 'smartsheet' — while 'internal' (the Notification row itself) always rides
// along (alwaysInternal). Before H-14 the row recorded NOTHING about how the
// external delivery went; this model stamps telemetry fields onto the row so
// the wiring layer (followUpSweepAction, statement/email batch jobs,
// notificationAction) records outcomes uniformly in BOTH modes and admins
// can roll up delivery health per channel. It preps for real mail telemetry
// (provider webhooks — backlog 242/246/296): when email is re-enabled the
// same fields carry provider receipts instead of adapter outcomes.
//
// Stamped fields (Notification.jsonc additions — field spec in the item
// report; the schema lands separately from this zero-import model):
//   delivery_channel       'email' | 'smartsheet' | 'internal'
//   delivery_status        'delivered' | 'failed' | 'skipped' | 'queued'
//   delivery_attempted_at  ISO timestamp of the latest stamp/attempt
//   delivered_at           ISO timestamp — set only while the last attempt
//                          resolved 'delivered'
//   delivery_error         PII-stripped error text, ≤500 chars
//   delivery_attempts      counter — every telemetryPatch re-stamp is +1
//   last_delivery_at       ISO timestamp of the latest telemetry stamp
//
// Stamp semantics:
//   delivered === true (or 'delivered')  → 'delivered' + delivered_at
//   'skipped'                            → 'skipped'   (e.g. dedupe'd,
//                                          missing recipient, flag off)
//   'queued'                             → 'queued'    (batch pending — the
//                                          stamp time is the enqueue time)
//   anything else incl. bare false       → 'failed'    (fail-closed — never
//                                          claim delivery w/o explicit true)
// delivery_attempted_at is set on EVERY stamp (for 'queued' it records when
// the event was queued). delivery_error is stored whenever supplied and
// non-empty after PII stripping — a delivered row may carry a soft warning.
//
// Idempotent re-stamp: telemetryPatch is an entity.update payload — the same
// patch applied twice lands the same stored state (stamps overwrite, never
// append/duplicate). Each NEW attempt bumps delivery_attempts (prev||0)+1
// and refreshes last_delivery_at, so retry loops leave an honest trail. A
// failed re-stamp does NOT clear a prior delivered_at — patch keys are
// absent rather than nulled, so last-success history survives until a later
// delivered stamp overwrites it (writers wanting a hard clear pass
// delivered_at:'' in overrides — see telemetryPatch note).
//
// PII hygiene: delivery errors come from send layers (SMTP replies, webhook
// bodies) that routinely embed recipient addresses, tracking URLs, and
// bearer/api tokens. stripTelemetryPii removes emails, http(s) URLs, Bearer
// strings, JWTs, long token runs, and secret key=value pairs BEFORE the text
// is truncated, so a truncated fragment can't leak half a credential.
// deliveryStamp caps at DELIVERY_ERROR_MAX (500); redactTelemetryError —
// the standalone export for callers pre-sanitizing their own strings — caps
// tighter at REDACTED_ERROR_MAX (200).
//
// API:
//   DELIVERY_CHANNELS / DELIVERY_STATUSES
//   DELIVERY_ERROR_MAX / REDACTED_ERROR_MAX / STATS_TOP_ERRORS
//   normalizeDeliveryChannel(ch)   — known channel or ''
//   toDeliveryIso(now)             — Date|ms|ISO-string → ISO string
//   redactTelemetryError(err)      — PII strip + 200-char cap
//   deliveryStamp(channel, {now, delivered, status?, error?, delivered_at?})
//     → {delivery_channel, delivery_attempted_at, delivery_status,
//        delivered_at?, delivery_error?}
//   channelFromPlan(plan)          — external lane a buildDeliveryPlan result
//                                    chose ('internal' fallback)
//   telemetryPatch(notification, result)
//     → entity.update patch: stamp fields + delivery_attempts + last_delivery_at
//   deliveryStats(notifications, {from, to})
//     → {by_channel, sent, delivered, delivery_rate, error_top}

// Channel vocabulary mirrors delivery.ts DELIVERY_CHANNELS (H-01) — kept as
// a literal twin because this file must stay zero-import. 'internal' is the
// always-on lane; 'email' is live only while emailDelivery.enabled===true.
export const DELIVERY_CHANNELS = ['email', 'smartsheet', 'internal'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const DELIVERY_STATUSES = ['delivered', 'failed', 'skipped', 'queued'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// delivery_error storage cap (deliveryStamp) and the tighter cap
// redactTelemetryError applies for direct callers.
export const DELIVERY_ERROR_MAX = 500;
export const REDACTED_ERROR_MAX = 200;
// Admin rollup keeps the N most common distinct error strings.
export const STATS_TOP_ERRORS = 10;

const CHANNEL_SET: ReadonlySet<string> = new Set(DELIVERY_CHANNELS);
const STATUS_SET: ReadonlySet<string> = new Set(DELIVERY_STATUSES);

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------------------
// small normalizers
// ---------------------------------------------------------------------------

// Known channel lowercased, else '' — never throws, never invents lanes.
export function normalizeDeliveryChannel(channel: any): DeliveryChannel | '' {
  const c = clean(channel).toLowerCase();
  return CHANNEL_SET.has(c) ? (c as DeliveryChannel) : '';
}

// ISO-normalize a clock value: Date → toISOString, finite ms number →
// toISOString, non-empty string passes through verbatim (caller's precision
// preserved — Notification date-time fields are stored strings), empty →
// the current time. Tests pass explicit `now` for determinism.
export function toDeliveryIso(now: any): string {
  if (now instanceof Date) {
    const t = now.getTime();
    if (Number.isFinite(t)) return now.toISOString();
  }
  if (typeof now === 'number' && Number.isFinite(now)) {
    return new Date(now).toISOString();
  }
  const s = clean(now);
  if (s) return s;
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// PII redaction
// ---------------------------------------------------------------------------

// Order matters: URLs first (they can embed emails + query tokens), Bearer
// before key=value ('authorization: Bearer <jwt>' redacts the jwt via the
// Bearer arm, not by eating 'Bearer' as a kv value), secrets before the
// generic long-token run so 'api_key=<40hex>' reports 'api_key=[redacted]'.
const URL_RE = /https?:\/\/[^\s)>'"\]]+/gi;
const BEARER_RE = /\bBearer\s+[^\s,;'"]+/gi;
const SECRET_KV_RE =
  /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|secret|token|password|passwd|pwd|authorization|private[_-]?key)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g;
// Unbroken 32+ char alnum runs — hex keys, base64url segments, opaque ids.
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

// Error objects surface .message; everything else stringifies.
function errorText(err: any): string {
  if (err === undefined || err === null) return '';
  if (typeof err === 'object' && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return String(err);
}

// Strip PII shapes without truncating — shared by deliveryStamp (500 cap)
// and redactTelemetryError (200 cap).
function stripTelemetryPii(text: any): string {
  let s = errorText(text);
  if (!s) return '';
  s = s.replace(URL_RE, '[url]');
  s = s.replace(BEARER_RE, 'Bearer [token]');
  s = s.replace(SECRET_KV_RE, (m: string, key: string, sep: string, val: string) =>
    // 'Authorization: Bearer <jwt>' — the Bearer arm already redacted the
    // token; 'Bearer' is the scheme word, not the secret value.
    /^Bearer$/i.test(val) ? m : `${key}${sep}[redacted]`);
  s = s.replace(EMAIL_RE, '[email]');
  s = s.replace(JWT_RE, '[token]');
  s = s.replace(LONG_TOKEN_RE, '[token]');
  return s;
}

// Public redaction — strips emails/tokens/URLs/secret kv pairs and keeps the
// first REDACTED_ERROR_MAX (200) chars. Never throws; null/undefined → ''.
export function redactTelemetryError(err: any): string {
  return stripTelemetryPii(err).slice(0, REDACTED_ERROR_MAX);
}

// ---------------------------------------------------------------------------
// stamp
// ---------------------------------------------------------------------------

export interface DeliveryStamp {
  delivery_channel: DeliveryChannel;
  delivery_attempted_at: string;
  delivery_status: DeliveryStatus;
  delivered_at?: string;
  delivery_error?: string;
}

// Resolve the outcome word. Explicit truthy 'delivered' forms win; the
// status-string forms cover skipped/queued/failed; EVERYTHING else —
// false, undefined, garbage strings, numbers — resolves 'failed'
// (fail-closed: never stamp 'delivered' without an explicit delivered===true
// or the literal word).
function resolveDeliveryStatus(delivered: any): DeliveryStatus {
  if (delivered === true) return 'delivered';
  const s = clean(delivered).toLowerCase();
  if (STATUS_SET.has(s)) return s as DeliveryStatus;
  return 'failed';
}

// Stamp one delivery outcome. `channel` normalizes via
// normalizeDeliveryChannel with 'internal' as the floor (the internal row
// always lands). opts:
//   now           — stamp clock (Date|ms|ISO string; default current time)
//   delivered     — true | 'delivered' | 'failed' | 'skipped' | 'queued' |
//                   false/empty (→ 'failed')
//   status        — alias consulted when delivered is undefined
//   error         — stored PII-stripped, ≤500 chars, whenever non-empty
//   delivered_at  — override the delivered timestamp (provider receipt time)
export function deliveryStamp(channel: any, opts: any = {}): DeliveryStamp {
  const o = isObj(opts) ? opts : {};
  const now = toDeliveryIso(o.now);
  const outcome = o.delivered !== undefined && o.delivered !== null ? o.delivered : o.status;
  const status = resolveDeliveryStatus(outcome);

  const stamp: DeliveryStamp = {
    delivery_channel: normalizeDeliveryChannel(channel) || 'internal',
    delivery_attempted_at: now,
    delivery_status: status,
  };
  if (status === 'delivered') {
    const explicit =
      o.delivered_at !== undefined && o.delivered_at !== null
        ? toDeliveryIso(o.delivered_at)
        : '';
    stamp.delivered_at = explicit || now;
  }
  const err = stripTelemetryPii(o.error).slice(0, DELIVERY_ERROR_MAX);
  if (err) stamp.delivery_error = err;
  return stamp;
}

// ---------------------------------------------------------------------------
// plan → channel
// ---------------------------------------------------------------------------

// Which lane a buildDeliveryPlan (H-01) result chose — for stamping the
// Notification row with the EXTERNAL channel, 'internal' when no external
// lane ran. Resolution order: explicit plan.channel → first non-internal
// entry of plan.channels[] → 'internal' if channels[] names it → payload
// sniffing (plan.email / plan.smartsheetRow for hand-rolled plan-likes) →
// 'internal' (the always-on floor; never throws on null/garbage plans).
export function channelFromPlan(plan: any): DeliveryChannel {
  const p = isObj(plan) ? plan : {};
  const direct = normalizeDeliveryChannel(p.channel);
  if (direct) return direct;
  const chans = list(p.channels);
  for (const c of chans) {
    const ch = normalizeDeliveryChannel(c);
    if (ch && ch !== 'internal') return ch;
  }
  for (const c of chans) {
    if (normalizeDeliveryChannel(c) === 'internal') return 'internal';
  }
  if (isObj(p.email)) return 'email';
  if (isObj(p.smartsheetRow)) return 'smartsheet';
  return 'internal';
}

// ---------------------------------------------------------------------------
// telemetryPatch — the entity.update payload
// ---------------------------------------------------------------------------

// Merge a delivery outcome into the Notification row's telemetry fields.
// `result` is the wiring layer's outcome object:
//   { channel?, plan?, delivered?/status?, error?, now?, delivered_at? }
// Channel precedence: explicit result.channel → channelFromPlan(result.plan)
// → the row's existing delivery_channel → 'internal'. (A supplied plan
// decides even when it resolves 'internal' — the new attempt's lane, not
// history, is what gets stamped.)
//
// Returns ONLY telemetry field updates — spread-ready for
// entities.Notification.update(id, patch). delivery_attempts is
// max(0, floor(prev||0)) + 1 and last_delivery_at mirrors the new attempt's
// stamp time, so each re-stamp records an honest attempt count. A failed
// re-stamp leaves delivered_at ABSENT from the patch — a prior success's
// delivered_at stays on the row as last-delivered history rather than being
// nulled (last-write-wins patch semantics; writers needing a hard clear set
// patch.delivered_at = '' themselves).
export function telemetryPatch(notification: any, result: any = {}): any {
  const r = isObj(result) ? result : {};
  const prev = isObj(notification) ? notification : {};
  const channel =
    normalizeDeliveryChannel(r.channel) ||
    (r.plan !== undefined && r.plan !== null ? channelFromPlan(r.plan) : '') ||
    normalizeDeliveryChannel(prev.delivery_channel) ||
    'internal';

  const stamp = deliveryStamp(channel, {
    now: r.now,
    delivered: r.delivered !== undefined && r.delivered !== null ? r.delivered : r.status,
    error: r.error !== undefined && r.error !== null ? r.error : r.err,
    delivered_at: r.delivered_at !== undefined ? r.delivered_at : r.deliveredAt,
  });

  const prevAttempts = Number(prev.delivery_attempts);
  const attempts = (Number.isFinite(prevAttempts) ? Math.max(0, Math.floor(prevAttempts)) : 0) + 1;

  return {
    ...stamp,
    delivery_attempts: attempts,
    last_delivery_at: stamp.delivery_attempted_at,
  };
}

// ---------------------------------------------------------------------------
// deliveryStats — the admin telemetry rollup
// ---------------------------------------------------------------------------

export interface ChannelDeliveryStat {
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
}

export interface DeliveryStatsResult {
  by_channel: Record<string, ChannelDeliveryStat>;
  sent: number;
  delivered: number;
  delivery_rate: number;
  error_top: Array<{ error: string; count: number }>;
}

// Parse a window bound to ms. Date-only 'YYYY-MM-DD' `to` bounds extend to
// end-of-day UTC so a {from:'D',to:'D'} batch check covers the whole day.
function boundMs(v: any, endOfDay = false): number | undefined {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = clean(v);
  if (!s) return undefined;
  let t = Date.parse(s);
  if (!Number.isFinite(t)) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(s)) t += 24 * 60 * 60 * 1000 - 1;
  return t;
}

const emptyChannelStat = (): ChannelDeliveryStat => ({
  sent: 0,
  delivered: 0,
  failed: 0,
  skipped: 0,
});

// Roll stamped Notification rows into per-channel counters.
//   by_channel[ch] = {sent, delivered, failed, skipped} — all
//     DELIVERY_CHANNELS keys always present (zero-filled); unknown stored
//     channels get their own bucket. 'sent' counts rows that carry a stamp
//     (delivery_attempted_at / delivery_attempts / delivery_status present);
//     unstamped rows are invisible. 'queued' stamps count toward sent only.
//   delivery_rate = delivered / sent across all channels, 0–1 rounded to 4
//     decimals (0 when nothing sent).
//   error_top = most common distinct delivery_error strings among FAILED
//     rows in-window, [{error, count}] count-desc then alpha, top
//     STATS_TOP_ERRORS. (Errors on delivered rows are warnings, not stats.)
// Window {from,to} anchors on delivery_attempted_at → last_delivery_at →
// delivered_at; when a bound exists, rows with unparseable anchors drop out
// (can't be placed in the window).
export function deliveryStats(notifications: any, opts: any = {}): DeliveryStatsResult {
  const rows = list(notifications);
  const o = isObj(opts) ? opts : {};
  const fromMs = boundMs(o.from);
  const toMs = boundMs(o.to, true);
  const windowed = fromMs !== undefined || toMs !== undefined;

  const by_channel: Record<string, ChannelDeliveryStat> = {};
  for (const ch of DELIVERY_CHANNELS) by_channel[ch] = emptyChannelStat();

  const errorCounts = new Map<string, number>();
  let sent = 0;
  let delivered = 0;

  for (const row of rows) {
    if (!isObj(row)) continue;
    const statusRaw = clean(row.delivery_status).toLowerCase();
    const attempts = Number(row.delivery_attempts);
    const stamped =
      !!clean(row.delivery_attempted_at) ||
      !!clean(row.last_delivery_at) ||
      (Number.isFinite(attempts) && attempts > 0) ||
      STATUS_SET.has(statusRaw);
    if (!stamped) continue;

    const anchor =
      clean(row.delivery_attempted_at) ||
      clean(row.last_delivery_at) ||
      clean(row.delivered_at);
    const anchorMs = boundMs(anchor);
    if (windowed) {
      if (anchorMs === undefined) continue;
      if (fromMs !== undefined && anchorMs < fromMs) continue;
      if (toMs !== undefined && anchorMs > toMs) continue;
    }

    const ch = normalizeDeliveryChannel(row.delivery_channel) || 'internal';
    const bucket = by_channel[ch] || (by_channel[ch] = emptyChannelStat());
    bucket.sent += 1;
    sent += 1;

    // Infer 'delivered' from a stored delivered_at when status is absent;
    // other status-less rows count toward sent only (don't invent failures).
    const status: DeliveryStatus | '' = STATUS_SET.has(statusRaw)
      ? (statusRaw as DeliveryStatus)
      : clean(row.delivered_at)
        ? 'delivered'
        : '';
    if (status === 'delivered') {
      bucket.delivered += 1;
      delivered += 1;
    } else if (status === 'failed') {
      bucket.failed += 1;
      const e = clean(row.delivery_error);
      if (e) errorCounts.set(e, (errorCounts.get(e) || 0) + 1);
    } else if (status === 'skipped') {
      bucket.skipped += 1;
    }
    // 'queued' / '' → sent only.
  }

  const error_top = [...errorCounts.entries()]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count || (a.error < b.error ? -1 : a.error > b.error ? 1 : 0))
    .slice(0, STATS_TOP_ERRORS);

  return {
    by_channel,
    sent,
    delivered,
    delivery_rate: sent > 0 ? Math.round((delivered / sent) * 10000) / 10000 : 0,
    error_top,
  };
}
