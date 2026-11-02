// Per-user defaults model — pure TS, ZERO imports (K-12 /
// ESTIMATOR_MASTERPLAN). Safe to bundle into Deno functions
// (base44/functions/*), frontend modules, and Node test harnesses. No I/O
// anywhere in this module — callers load/persist rows and these functions
// decide WHAT the effective per-user defaults are.
//
// Consolidates the three per-user preference surfaces already half-wired in
// the app:
//   * timezone (backlog 488 — src/components/estimator/userDateDisplay.js
//     reads prefs.locale.timezone via resolveUserTimeZone/formatInUserTz)
//   * default view per page (backlog 481 — pipeline.defaultView +
//     navigation.landingPage in the workspace-prefs blob; SavedQueueView
//     is_default/default_for_user claims are the deeper per-view layer this
//     module does NOT replace — it owns the simpler "open this route for
//     that page key" map)
//   * date display formats (this module adds the date_format/time_format
//     knobs userDateDisplay's pattern presets never exposed)
//
// ── PREFS HOST ────────────────────────────────────────────────────────────
// UserWorkspacePreferences (base44/entities/UserWorkspacePreferences.jsonc):
// backend-only RLS (role 'timeclock_backend_only'), one row per user_email,
// ALL access via the deployed workspacePrefsAction function —
//   'prefs_get'    → {prefs, profiles, schema_version, updated_date}
//   'prefs_update' → {request_id, prefs, profiles} REPLACES the whole
//                    `preferences` blob; idempotent on last_request_id;
//                    first-create dedupe key 'uwp:<email>'; 64KB cap.
// Blob schema_version 1; overall shape is owned client-side by
// src/components/layout/workspacePrefs.js (defaultPrefs/migratePrefs). This
// module owns ONE SUBTREE of that blob (see PREFS_PATHS):
//
//   preferences.locale.timezone      IANA tz, '' = unset   — EXISTS already
//   preferences.locale.date_format   DATE_FORMATS member   — new
//   preferences.locale.time_format   TIME_FORMATS member   — new
//   preferences.default_queue_view   DEFAULT_QUEUE_VIEWS   — new
//   preferences.default_pages        { page_key: '/Route' }— new
//   preferences.notifications        { in_app, email, digest } — new
//
// userDefaultsPatch() returns the SANITIZED WRITE-ROW for that host — its
// `preferences` field is a MERGE FRAGMENT: callers deep-merge it into the
// loaded prefs blob (workspacePrefs deepMerge / updatePrefs / patchPrefs)
// before prefs_update. Never send the fragment AS the blob — prefs_update
// replaces wholesale and would destroy the other subtrees (appearance,
// navigation, pipeline, workflow).
//
// ── RESOLUTION ORDER ──────────────────────────────────────────────────────
// Three tiers per field: USER_DEFAULTS (terminal fallback) ← shop_defaults
// (company overrides sourced from GlobalSettings/QuoteDefaults — e.g.
// QuoteDefaults.display_timezone) ← user raw (the stored prefs subtree).
// Unknown keys are dropped; enum fields validate against their registry;
// timezone validates against KNOWN_TIMEZONES — the ~15 US/common zones —
// so an unlisted/typo'd IANA name resolves to the shop tier instead of
// silently re-pointing every render at a zone the shop never reviewed.
//
// Shop timezone = 'America/New_York'. Evidence: timeClockAction
// COMPANY_TIME_ZONE, shared TIME_CLOCK_COMPANY_TIME_ZONE,
// src/components/timeclock/timeClockCompanyTime.js, and every fleet
// function's todayEastern all hardcode Eastern — the shop is Ohio-based
// (ohioIdentityTypeCorrectionProposals). GlobalSettings carries NO
// timezone setting_key (schema is generic setting_key/setting_value plus
// hoursOfOperation/emailDelivery/etc); QuoteDefaults.display_timezone is
// the operator-settable company display override — pass it as
// shop_defaults.timezone when available.

// ---------------------------------------------------------------------------
// Registries.
// ---------------------------------------------------------------------------

export type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM D, YYYY';
export type TimeFormat = '12h' | '24h';
export type QueueView = 'my_queue' | 'team_queue' | 'all';
export type TimezoneSource = 'user' | 'shop' | 'fallback';

export interface NotificationsDefaults {
  in_app: boolean;
  email: boolean;
  digest: boolean;
}

export interface UserDefaultsRow {
  timezone: string;
  date_format: DateFormat;
  time_format: TimeFormat;
  default_queue_view: QueueView;
  default_pages: Record<string, string>;
  notifications: NotificationsDefaults;
}

/** Terminal fallback row — the shop defaults. Frozen: callers never mutate. */
export const USER_DEFAULTS: Readonly<UserDefaultsRow> = Object.freeze({
  timezone: 'America/New_York',
  date_format: 'MM/DD/YYYY',
  time_format: '12h',
  default_queue_view: 'my_queue',
  default_pages: Object.freeze({ dashboard: '/MainWorkflow', financials: '/Financials' }) as Record<string, string>,
  notifications: Object.freeze({ in_app: true, email: true, digest: true }) as NotificationsDefaults,
});

/** Top-level fields of the defaults row — unknown keys are dropped on merge. */
export const USER_DEFAULT_FIELDS: ReadonlyArray<string> = Object.freeze([
  'timezone',
  'date_format',
  'time_format',
  'default_queue_view',
  'default_pages',
  'notifications',
]);

/** Notification toggles inside USER_DEFAULTS.notifications. */
export const NOTIFICATION_KEYS: ReadonlyArray<string> = Object.freeze(['in_app', 'email', 'digest']);

export const DATE_FORMATS: ReadonlyArray<DateFormat> = Object.freeze([
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY-MM-DD',
  'MMM D, YYYY',
]);

export const TIME_FORMATS: ReadonlyArray<TimeFormat> = Object.freeze(['12h', '24h']);

export const DEFAULT_QUEUE_VIEWS: ReadonlyArray<QueueView> = Object.freeze([
  'my_queue',
  'team_queue',
  'all',
]);

// The known-IANA allowlist resolveTimezone validates against — the ~15 US /
// common shop-relevant zones (a superset of the EstimatorSettings datalist).
// Deliberately small: a user-entered zone outside this list does not error,
// it just resolves to the shop tier so rendering stays shop-consistent.
export const KNOWN_TIMEZONES: ReadonlyArray<string> = Object.freeze([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Boise',
  'America/Anchorage',
  'America/Juneau',
  'America/Indiana/Indianapolis',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'UTC',
]);

// Page keys the default_pages map recognizes — used for validation WARNINGS
// only (unlisted keys still store: page keys may grow). Values are the
// canonical routes the workspace nav serves; USER_DEFAULTS.default_pages is
// a subset.
export const KNOWN_PAGE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  dashboard: '/MainWorkflow',
  main_workflow: '/MainWorkflow',
  my_workflow: '/MyWorkflow',
  financials: '/Financials',
  invoices: '/Invoices',
  sales_pipeline: '/SalesPipeline',
  opportunities: '/Opportunities',
  estimator_queues: '/EstimatorQueues',
  production: '/Production',
  permitting: '/Permitting',
  timeclock: '/TimeClock',
  sop: '/SOP',
});

// Where each defaults field lives inside the workspace-prefs blob — the
// wiring map for workspacePrefs.js updatePrefs paths and for any backend
// that needs to read the stored subtree directly.
export const PREFS_PATHS: Readonly<Record<string, string>> = Object.freeze({
  timezone: 'locale.timezone',
  date_format: 'locale.date_format',
  time_format: 'locale.time_format',
  default_queue_view: 'default_queue_view',
  default_pages: 'default_pages',
  notifications: 'notifications',
});

const NOTIFICATION_KEY_SET = new Set(NOTIFICATION_KEYS);
const KNOWN_TIMEZONE_SET = new Set(KNOWN_TIMEZONES);
const DATE_FORMAT_SET = new Set<string>(DATE_FORMATS);
const TIME_FORMAT_SET = new Set<string>(TIME_FORMATS);
const QUEUE_VIEW_SET = new Set<string>(DEFAULT_QUEUE_VIEWS);

const PAGE_KEY_RE = /^[a-z0-9][a-z0-9_]{0,39}$/;
// '/Route' or '/a/b-c' — leading slash, no scheme/host, no dots (blocks
// '../x', 'x.js', '//evil'), no whitespace.
const ROUTE_RE = /^\/[A-Za-z0-9][A-Za-z0-9_\-/]{0,199}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const cleanStr = (v: unknown, max = 500): string => String(v ?? '').trim().slice(0, max);

// ---------------------------------------------------------------------------
// Field readers + extractors.
// ---------------------------------------------------------------------------

/** Is `tz` on the reviewed US/common allowlist? */
export function isKnownTimeZone(tz: unknown): boolean {
  return KNOWN_TIMEZONE_SET.has(cleanStr(tz, 100));
}

/** Is `tz` a zone Intl can actually render (superset check — validateUserDefaults
 *  uses this to WARN on valid-but-unlisted zones rather than error). */
export function isValidTimeZone(tz: unknown): boolean {
  const s = cleanStr(tz, 100);
  if (!s) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s });
    return true;
  } catch {
    return false;
  }
}

export function isValidDefaultRoute(route: unknown): boolean {
  const s = cleanStr(route, 220);
  return ROUTE_RE.test(s) && !s.includes('//');
}

const normPageKey = (v: unknown): string => cleanStr(v, 48).toLowerCase();

// Accepts the flexible raw shapes callers hold and returns the flat
// USER_DEFAULTS-shaped subset actually present (no defaults filled in —
// absence is meaningful for patches). Unwraps, in order:
//   * an entity row / action response  { preferences: {...} } / {prefs: {...}}
//   * the full prefs blob             { locale: {timezone, ...}, ... }
//   * the flat defaults row           { timezone, date_format, ... }
// locale.* wins over a flat twin when both appear (blob is the real store).
function extractPresent(raw: unknown): Record<string, unknown> {
  let src: any = raw;
  if (isObj(src) && isObj(src.preferences)) src = src.preferences;
  else if (isObj(src) && isObj(src.prefs)) src = src.prefs;
  if (!isObj(src)) return {};

  const out: Record<string, unknown> = {};
  const locale = isObj(src.locale) ? src.locale : {};

  if (Object.prototype.hasOwnProperty.call(src, 'timezone')) out.timezone = src.timezone;
  if (Object.prototype.hasOwnProperty.call(locale, 'timezone')) out.timezone = locale.timezone;
  if (Object.prototype.hasOwnProperty.call(src, 'date_format')) out.date_format = src.date_format;
  if (Object.prototype.hasOwnProperty.call(locale, 'date_format')) out.date_format = locale.date_format;
  if (Object.prototype.hasOwnProperty.call(src, 'time_format')) out.time_format = src.time_format;
  if (Object.prototype.hasOwnProperty.call(locale, 'time_format')) out.time_format = locale.time_format;
  if (Object.prototype.hasOwnProperty.call(src, 'default_queue_view')) out.default_queue_view = src.default_queue_view;
  if (Object.prototype.hasOwnProperty.call(src, 'default_pages')) out.default_pages = src.default_pages;
  if (Object.prototype.hasOwnProperty.call(src, 'notifications')) out.notifications = src.notifications;
  return out;
}

/** Pull the defaults-shaped raw subset out of a loaded prefs blob (or an
 *  entity row / prefs_get response). Returns flat USER_DEFAULTS-shaped
 *  fields — only the ones present. */
export function userDefaultsFromPrefs(prefs: unknown): Record<string, unknown> {
  return extractPresent(prefs);
}

// ---------------------------------------------------------------------------
// Per-field normalization — each returns undefined when the candidate is
// absent/invalid so the caller falls through to the next tier.
// ---------------------------------------------------------------------------

const normTimezone = (v: unknown): string | undefined => {
  const s = cleanStr(v, 100);
  return s && KNOWN_TIMEZONE_SET.has(s) ? s : undefined;
};

const normDateFormat = (v: unknown): DateFormat | undefined => {
  const s = cleanStr(v, 32);
  return DATE_FORMAT_SET.has(s) ? (s as DateFormat) : undefined;
};

const normTimeFormat = (v: unknown): TimeFormat | undefined => {
  const s = cleanStr(v, 8);
  return TIME_FORMAT_SET.has(s) ? (s as TimeFormat) : undefined;
};

const normQueueView = (v: unknown): QueueView | undefined => {
  const s = cleanStr(v, 32);
  return QUEUE_VIEW_SET.has(s) ? (s as QueueView) : undefined;
};

// Merge a raw default_pages map into `base`: keys normalized lowercase,
// routes shape-validated; invalid pairs skipped. Returns a fresh object.
const normDefaultPages = (v: unknown, base: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = { ...base };
  if (!isObj(v)) return out;
  for (const [k, route] of Object.entries(v)) {
    const key = normPageKey(k);
    if (!key || !PAGE_KEY_RE.test(key)) continue;
    const r = cleanStr(route, 220);
    if (!isValidDefaultRoute(r)) continue;
    out[key] = r;
  }
  return out;
};

// Merge a raw notifications map into `base`: only true booleans override.
const normNotifications = (v: unknown, base: NotificationsDefaults): NotificationsDefaults => {
  const out: NotificationsDefaults = { ...base };
  if (!isObj(v)) return out;
  for (const key of NOTIFICATION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(v, key) && typeof v[key] === 'boolean') {
      (out as any)[key] = v[key];
    }
  }
  return out;
};

// One-tier merge: apply the recognized present fields of `src` over `base`.
function mergeTier(base: UserDefaultsRow, src: Record<string, unknown>): UserDefaultsRow {
  const out: UserDefaultsRow = {
    ...base,
    default_pages: { ...base.default_pages },
    notifications: { ...base.notifications },
  };
  const tz = normTimezone(src.timezone);
  if (tz !== undefined) out.timezone = tz;
  const df = normDateFormat(src.date_format);
  if (df !== undefined) out.date_format = df;
  const tf = normTimeFormat(src.time_format);
  if (tf !== undefined) out.time_format = tf;
  const qv = normQueueView(src.default_queue_view);
  if (qv !== undefined) out.default_queue_view = qv;
  out.default_pages = normDefaultPages(src.default_pages, out.default_pages);
  out.notifications = normNotifications(src.notifications, out.notifications);
  return out;
}

// ---------------------------------------------------------------------------
// normalizeUserDefaults — the merged effective row.
// ---------------------------------------------------------------------------

/**
 * Resolve the effective per-user defaults row.
 *   raw            — user prefs subtree / flat defaults row / entity row /
 *                    prefs_get response (extractPresent unwraps all of them)
 *   {shop_defaults}— company-tier overrides, same accepted shapes
 *                    (e.g. {timezone: quoteDefaults.display_timezone})
 * Chain: USER_DEFAULTS ← shop_defaults ← raw. Unknown keys dropped;
 * enum-like fields validated (invalid values fall to the lower tier);
 * timezone validated against KNOWN_TIMEZONES.
 */
export function normalizeUserDefaults(raw: unknown, { shop_defaults }: { shop_defaults?: unknown } = {}): UserDefaultsRow {
  let row: UserDefaultsRow = {
    ...USER_DEFAULTS,
    default_pages: { ...USER_DEFAULTS.default_pages },
    notifications: { ...USER_DEFAULTS.notifications },
  };
  if (shop_defaults !== undefined && shop_defaults !== null) {
    row = mergeTier(row, extractPresent(shop_defaults));
  }
  row = mergeTier(row, extractPresent(raw));
  return row;
}

// ---------------------------------------------------------------------------
// resolveTimezone — user → shop → fallback chain.
// ---------------------------------------------------------------------------

const readTimezoneField = (src: unknown): string => {
  const fields = extractPresent(src);
  return cleanStr(fields.timezone, 100);
};

// Shop tz may arrive as a bare string ('America/New_York'), a QuoteDefaults
// row ({display_timezone}), a defaults row ({timezone}), or a shop_defaults
// blob — check the keys in priority order.
const readShopTimezone = (shop: unknown): string => {
  if (typeof shop === 'string') return cleanStr(shop, 100);
  if (!isObj(shop)) return '';
  for (const key of ['timezone', 'display_timezone', 'shop_timezone', 'company_timezone']) {
    const v = cleanStr(shop[key], 100);
    if (v) return v;
  }
  return readTimezoneField(shop);
};

/**
 * Effective IANA zone for rendering THIS user's datetimes.
 *   { iana, source } — 'user'    the user's own allowlisted pick won;
 *                      'shop'    company default (QuoteDefaults/shop tz);
 *                      'fallback' USER_DEFAULTS.timezone — always allowlisted,
 *                                 so the returned iana is always renderable.
 */
export function resolveTimezone(user: unknown, shop: unknown): { iana: string; source: TimezoneSource } {
  const userTz = readTimezoneField(user);
  if (userTz && KNOWN_TIMEZONE_SET.has(userTz)) return { iana: userTz, source: 'user' };
  const shopTz = readShopTimezone(shop);
  if (shopTz && KNOWN_TIMEZONE_SET.has(shopTz)) return { iana: shopTz, source: 'shop' };
  return { iana: USER_DEFAULTS.timezone, source: 'fallback' };
}

// ---------------------------------------------------------------------------
// formatDateFor — date/time display honoring the user's defaults.
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BARE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// One cached Intl formatter per (tz|want12) — same pattern as
// quoteLifecycle's _tzCache.
const fmtCache: Record<string, Intl.DateTimeFormat | null> = {};
const partsFormatter = (iana: string, withTime: boolean, hour12: boolean): Intl.DateTimeFormat | null => {
  const key = `${iana}|${withTime ? 't' : 'd'}|${hour12 ? '12' : '24'}`;
  if (fmtCache[key] !== undefined) return fmtCache[key];
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: iana,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    if (withTime) {
      opts.hour = '2-digit';
      opts.minute = '2-digit';
      opts.hour12 = hour12;
    }
    fmtCache[key] = new Intl.DateTimeFormat('en-US', opts);
  } catch {
    fmtCache[key] = null;
  }
  return fmtCache[key];
};

const monthNameFormatter = (iana: string): Intl.DateTimeFormat | null => {
  const key = `${iana}|mon`;
  if (fmtCache[key] !== undefined) return fmtCache[key];
  try {
    fmtCache[key] = new Intl.DateTimeFormat('en-US', { timeZone: iana, month: 'short' });
  } catch {
    fmtCache[key] = null;
  }
  return fmtCache[key];
};

const partsMap = (fmt: Intl.DateTimeFormat, d: Date): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
};

// Assemble a calendar date (y, m, d, monthName) per the date_format.
const renderDate = (yyyy: string, mm: string, dd: string, monName: string, dayNum: string, fmt: DateFormat): string => {
  switch (fmt) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'MMM D, YYYY':
      return `${monName} ${dayNum}, ${yyyy}`;
    case 'MM/DD/YYYY':
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
};

export interface FormatDateOptions {
  /** append the time component per the user's time_format */
  with_time?: boolean;
  /** shop-tier tz (string or {display_timezone|timezone}) for resolveTimezone */
  shop?: unknown;
}

/**
 * Display string honoring the user's date_format + timezone.
 *   value          — ISO instant, Date, epoch ms, or a bare 'YYYY-MM-DD'
 *                    stamp. A bare stamp is a CALENDAR DATE: it renders its
 *                    literal y/m/d in the chosen format with NO timezone
 *                    math (house rule — stored dates never shift a day in
 *                    western zones; an ISO instant is a point in time and
 *                    legitimately converts across zones).
 *   user_defaults  — a normalized UserDefaultsRow, or any raw shape
 *                    extractPresent accepts (timezone + date_format read
 *                    through the same unwrap; invalid → USER_DEFAULTS).
 * Returns '' on unparseable input.
 */
export function formatDateFor(value: unknown, user_defaults: unknown, opts: FormatDateOptions = {}): string {
  // null/undefined/'' have no display meaning — '' (never `new Date(null)`
  // epoch-0 renders).
  if (value === null || value === undefined || value === '') return '';
  const defaults = normalizeUserDefaults(user_defaults, { shop_defaults: opts.shop });
  const fmt: DateFormat = defaults.date_format;
  const tf: TimeFormat = defaults.time_format;
  const withTime = opts.with_time === true;

  // Bare 'YYYY-MM-DD' — literal calendar-date render, zone-free.
  if (typeof value === 'string') {
    const m = BARE_DATE_RE.exec(value.trim());
    if (m) {
      const y = m[1];
      const mo = m[2];
      const dy = m[3];
      const monName = MONTHS_SHORT[Math.max(0, Math.min(11, Number(mo) - 1))];
      return renderDate(y, mo, dy, monName, String(Number(dy)), fmt);
    }
  }

  const d = value instanceof Date ? value : new Date(value as any);
  if (Number.isNaN(d.getTime())) return '';

  const { iana } = resolveTimezone(user_defaults, opts.shop);
  const pf = partsFormatter(iana, withTime, tf === '12h');
  if (!pf) {
    // Runtime without tz data — degrade to local rendering, never throw.
    const months = MONTHS_SHORT[d.getMonth()];
    const datePart = renderDate(
      String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
      months,
      String(d.getDate()),
      fmt,
    );
    if (!withTime) return datePart;
    return `${datePart} ${d.toLocaleTimeString('en-US', { hour12: tf === '12h', hour: '2-digit', minute: '2-digit' })}`;
  }

  const parts = partsMap(pf, d);
  let monName = '';
  if (fmt === 'MMM D, YYYY') {
    const mf = monthNameFormatter(iana);
    if (mf) monName = mf.format(d);
    if (!monName) monName = MONTHS_SHORT[Number(parts.month) - 1] || parts.month;
  }
  const datePart = renderDate(
    parts.year,
    parts.month,
    parts.day,
    monName,
    String(Number(parts.day)),
    fmt,
  );
  if (!withTime) return datePart;

  const hour = parts.hour || '';
  const minute = parts.minute || '';
  if (!hour || !minute) return datePart;
  if (tf === '12h') {
    const ap = (parts.dayPeriod || '').toUpperCase();
    return `${datePart} ${Number(hour)}:${minute}${ap ? ` ${ap}` : ''}`;
  }
  return `${datePart} ${hour}:${minute}`;
}

// ---------------------------------------------------------------------------
// defaultPageFor — the per-page default route.
// ---------------------------------------------------------------------------

/**
 * The route to open for `page_key` for this user.
 *   user     — prefs blob / defaults row / entity row (extractPresent).
 *   page_key — e.g. 'dashboard', 'financials' (normalized lowercase).
 * Returns the user's configured route when present and route-shaped, else
 * the USER_DEFAULTS.default_pages entry for the key, else ''. Always '' or a
 * '/Route' string — never an external URL (isValidDefaultRoute).
 */
export function defaultPageFor(user: unknown, page_key: unknown): string {
  const key = normPageKey(page_key);
  if (!key || !PAGE_KEY_RE.test(key)) return '';
  const fields = extractPresent(user);
  if (isObj(fields.default_pages)) {
    const candidate = cleanStr((fields.default_pages as any)[key], 220);
    if (candidate && isValidDefaultRoute(candidate)) return candidate;
  }
  const fallback = (USER_DEFAULTS.default_pages as Record<string, string>)[key];
  return fallback && isValidDefaultRoute(fallback) ? fallback : '';
}

// ---------------------------------------------------------------------------
// userDefaultsPatch — sanitized write-row for the prefs host.
// ---------------------------------------------------------------------------

export interface UserDefaultsPatchResult {
  /** normalized prefs-host key (UserWorkspacePreferences.user_email) */
  user_email: string;
  schema_version: number;
  /** echoes request_id so the caller can stamp prefs_update idempotency */
  last_request_id: string;
  /**
   * MERGE FRAGMENT — deep-merge into the loaded prefs blob before calling
   * workspacePrefsAction prefs_update. Contains ONLY the supplied+valid
   * fields, at their PREFS_PATHS locations.
   */
  preferences: Record<string, unknown>;
  /** supplied fields that failed validation and were dropped */
  dropped: Array<{ field: string; reason: string }>;
}

/**
 * Sanitize a partial defaults patch into a write-row for
 * UserWorkspacePreferences. Only fields actually present in `patch` are
 * included — a timezone-only save cannot clobber notifications. Pass
 * {request_id} in opts; it lands in last_request_id for prefs_update
 * idempotency.
 */
export function userDefaultsPatch(
  user_id: unknown,
  patch: unknown,
  { request_id }: { request_id?: unknown } = {},
): UserDefaultsPatchResult {
  const user_email = cleanStr(user_id, 200).toLowerCase();
  const present = extractPresent(patch);
  const dropped: Array<{ field: string; reason: string }> = [];

  const locale: Record<string, unknown> = {};
  const preferences: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(present, 'timezone')) {
    const tz = normTimezone(present.timezone);
    if (tz !== undefined) locale.timezone = tz;
    else {
      const s = cleanStr(present.timezone, 100);
      // '' is an explicit "clear my override" — write it through.
      if (s === '') locale.timezone = '';
      else dropped.push({ field: 'timezone', reason: `not on the reviewed zone list: "${s}"` });
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, 'date_format')) {
    const df = normDateFormat(present.date_format);
    if (df !== undefined) locale.date_format = df;
    else dropped.push({ field: 'date_format', reason: `not one of ${DATE_FORMATS.join(' | ')}` });
  }
  if (Object.prototype.hasOwnProperty.call(present, 'time_format')) {
    const tf = normTimeFormat(present.time_format);
    if (tf !== undefined) locale.time_format = tf;
    else dropped.push({ field: 'time_format', reason: `not one of ${TIME_FORMATS.join(' | ')}` });
  }
  if (Object.prototype.hasOwnProperty.call(present, 'default_queue_view')) {
    const qv = normQueueView(present.default_queue_view);
    if (qv !== undefined) preferences.default_queue_view = qv;
    else dropped.push({ field: 'default_queue_view', reason: `not one of ${DEFAULT_QUEUE_VIEWS.join(' | ')}` });
  }
  if (Object.prototype.hasOwnProperty.call(present, 'default_pages')) {
    const cleaned = normDefaultPages(present.default_pages, {});
    if (Object.keys(cleaned).length) preferences.default_pages = cleaned;
    if (isObj(present.default_pages)) {
      for (const [k, v] of Object.entries(present.default_pages as Record<string, unknown>)) {
        const key = normPageKey(k);
        if (!key || !PAGE_KEY_RE.test(key) || !isValidDefaultRoute(v)) {
          dropped.push({ field: `default_pages.${k}`, reason: 'invalid page key or route (routes must be in-app "/Path")' });
        }
      }
    } else {
      dropped.push({ field: 'default_pages', reason: 'not an object map of page_key → route' });
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, 'notifications')) {
    const notif = present.notifications;
    if (isObj(notif)) {
      const out: Record<string, boolean> = {};
      for (const key of Object.keys(notif)) {
        if (!NOTIFICATION_KEY_SET.has(key)) {
          dropped.push({ field: `notifications.${key}`, reason: `not one of ${NOTIFICATION_KEYS.join(' | ')}` });
          continue;
        }
        if (typeof notif[key] !== 'boolean') {
          dropped.push({ field: `notifications.${key}`, reason: 'must be a boolean' });
          continue;
        }
        out[key] = notif[key] as boolean;
      }
      if (Object.keys(out).length) preferences.notifications = out;
    } else {
      dropped.push({ field: 'notifications', reason: 'not an object of boolean toggles' });
    }
  }

  if (Object.keys(locale).length) preferences.locale = locale;

  return {
    user_email,
    schema_version: 1,
    last_request_id: cleanStr(request_id, 120),
    preferences,
    dropped,
  };
}

// ---------------------------------------------------------------------------
// validateUserDefaults — pre-flight for a settings UI.
// ---------------------------------------------------------------------------

export interface UserDefaultsValidation {
  errors: string[];
  warnings: string[];
}

/**
 * Check a raw patch (either flat or blob-subtree shaped) WITHOUT writing.
 * errors   — values that userDefaultsPatch would drop (invalid enum, bad
 *            route, non-boolean toggle).
 * warnings — values that store but degrade: valid-IANA-but-unlisted zones
 *            resolve to the shop tier instead; unknown page keys store but
 *            no built-in surface reads them yet; unknown top-level keys are
 *            dropped by normalization.
 */
export function validateUserDefaults(patch: unknown): UserDefaultsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const present = extractPresent(patch);

  // Unknown top-level keys in the ORIGINAL patch (extractPresent already
  // filtered to known ones — diff to find what was ignored).
  if (isObj(patch)) {
    const src: any = isObj(patch.preferences) ? patch.preferences : isObj(patch.prefs) ? patch.prefs : patch;
    for (const key of Object.keys(src)) {
      if (key === 'locale') continue;
      if (!(USER_DEFAULT_FIELDS as readonly string[]).includes(key)) {
        warnings.push(`Unknown preference key "${key}" is ignored by normalization.`);
      }
    }
    if (isObj(src.locale)) {
      for (const key of Object.keys(src.locale)) {
        if (!['timezone', 'date_format', 'time_format'].includes(key)) {
          warnings.push(`Unknown locale key "locale.${key}" is ignored by normalization.`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(present, 'timezone')) {
    const tz = cleanStr(present.timezone, 100);
    if (tz && !KNOWN_TIMEZONE_SET.has(tz)) {
      if (isValidTimeZone(tz)) {
        warnings.push(`Timezone "${tz}" is a real IANA zone but outside the shop's reviewed list — it will resolve to the shop timezone (${USER_DEFAULTS.timezone}) until the list is extended.`);
      } else {
        errors.push(`Timezone "${tz}" is not a recognized IANA zone — try e.g. ${KNOWN_TIMEZONES.slice(0, 4).join(', ')}.`);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, 'date_format')) {
    const v = cleanStr(present.date_format, 32);
    if (!DATE_FORMAT_SET.has(v)) errors.push(`date_format "${v}" is not one of ${DATE_FORMATS.join(' | ')}.`);
  }
  if (Object.prototype.hasOwnProperty.call(present, 'time_format')) {
    const v = cleanStr(present.time_format, 8);
    if (!TIME_FORMAT_SET.has(v)) errors.push(`time_format "${v}" is not one of ${TIME_FORMATS.join(' | ')}.`);
  }
  if (Object.prototype.hasOwnProperty.call(present, 'default_queue_view')) {
    const v = cleanStr(present.default_queue_view, 32);
    if (!QUEUE_VIEW_SET.has(v)) errors.push(`default_queue_view "${v}" is not one of ${DEFAULT_QUEUE_VIEWS.join(' | ')}.`);
  }
  if (Object.prototype.hasOwnProperty.call(present, 'default_pages')) {
    if (!isObj(present.default_pages)) {
      errors.push('default_pages must be an object map of page_key → "/Route".');
    } else {
      for (const [k, v] of Object.entries(present.default_pages as Record<string, unknown>)) {
        const key = normPageKey(k);
        if (!key || !PAGE_KEY_RE.test(key)) {
          errors.push(`default_pages key "${k}" is not a valid page key (lowercase snake, 1-40 chars).`);
          continue;
        }
        if (!isValidDefaultRoute(v)) {
          errors.push(`default_pages.${key} route "${cleanStr(v, 60)}" is not an in-app "/Path" route.`);
          continue;
        }
        if (!(key in KNOWN_PAGE_KEYS)) {
          warnings.push(`default_pages.${key} stores fine, but "${key}" is not a registered page key — no built-in surface reads it yet.`);
        }
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, 'notifications')) {
    const notif = present.notifications;
    if (!isObj(notif)) {
      errors.push('notifications must be an object of boolean toggles.');
    } else {
      for (const [k, v] of Object.entries(notif)) {
        if (!NOTIFICATION_KEY_SET.has(k)) {
          warnings.push(`notifications.${k} is not a known toggle (${NOTIFICATION_KEYS.join(' | ')}) — it is dropped by normalization.`);
        } else if (typeof v !== 'boolean') {
          errors.push(`notifications.${k} must be true or false.`);
        }
      }
    }
  }

  return { errors, warnings };
}
