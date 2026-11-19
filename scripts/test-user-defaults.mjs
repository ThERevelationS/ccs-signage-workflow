import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-user-defaults.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/userDefaultsModel.ts')],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const {
  USER_DEFAULTS,
  USER_DEFAULT_FIELDS,
  KNOWN_TIMEZONES,
  DATE_FORMATS,
  TIME_FORMATS,
  DEFAULT_QUEUE_VIEWS,
  KNOWN_PAGE_KEYS,
  PREFS_PATHS,
  isKnownTimeZone,
  isValidTimeZone,
  isValidDefaultRoute,
  userDefaultsFromPrefs,
  normalizeUserDefaults,
  resolveTimezone,
  formatDateFor,
  defaultPageFor,
  userDefaultsPatch,
  validateUserDefaults,
} = await import(pathToFileURL(out).href);

let n = 0;
const t = (fn) => { fn(); n += 1; };

// ── Registry shape ────────────────────────────────────────────────────────
t(() => assert.equal(USER_DEFAULTS.timezone, 'America/New_York', 'shop default tz = Eastern (codebase convention)'));
t(() => assert.equal(USER_DEFAULTS.date_format, 'MM/DD/YYYY'));
t(() => assert.equal(USER_DEFAULTS.time_format, '12h'));
t(() => assert.equal(USER_DEFAULTS.default_queue_view, 'my_queue'));
t(() => assert.deepEqual(USER_DEFAULTS.default_pages, { dashboard: '/MainWorkflow', financials: '/Financials' }));
t(() => assert.deepEqual(USER_DEFAULTS.notifications, { in_app: true, email: true, digest: true }));
t(() => assert.ok(KNOWN_TIMEZONES.length >= 12 && KNOWN_TIMEZONES.length <= 20, '~15-zone allowlist'));
t(() => assert.ok(KNOWN_TIMEZONES.includes('America/New_York') && KNOWN_TIMEZONES.includes('UTC')));
t(() => assert.equal(USER_DEFAULT_FIELDS.length, 6));
t(() => assert.equal(PREFS_PATHS.timezone, 'locale.timezone', 'timezone path matches userDateDisplay convention'));

// ── Field guards ──────────────────────────────────────────────────────────
t(() => assert.ok(isKnownTimeZone('America/Chicago') && !isKnownTimeZone('Europe/London'), 'allowlist membership'));
t(() => assert.ok(isValidTimeZone('Europe/London') && !isValidTimeZone('Mars/Olympus'), 'Intl validity check'));
t(() => assert.ok(isValidDefaultRoute('/MainWorkflow') && isValidDefaultRoute('/a/b-c_2')));
t(() => assert.ok(!isValidDefaultRoute('https://evil.com') && !isValidDefaultRoute('//host') && !isValidDefaultRoute('noslash') && !isValidDefaultRoute('/x.js'), 'route shape fail-closed'));

// ── normalizeUserDefaults — tiering, allowlists, unwrapping ───────────────
t(() => assert.deepEqual(normalizeUserDefaults(null), { ...USER_DEFAULTS, default_pages: { ...USER_DEFAULTS.default_pages }, notifications: { ...USER_DEFAULTS.notifications } }, 'empty → defaults'));
t(() => assert.equal(normalizeUserDefaults({ timezone: 'America/Chicago' }).timezone, 'America/Chicago', 'user tier wins'));
t(() => assert.equal(normalizeUserDefaults({}, { shop_defaults: { timezone: 'America/Denver' } }).timezone, 'America/Denver', 'shop middle tier'));
t(() => assert.equal(
  normalizeUserDefaults({ timezone: 'America/Chicago' }, { shop_defaults: { timezone: 'America/Denver' } }).timezone,
  'America/Chicago', 'user beats shop'));
t(() => {
  const row = normalizeUserDefaults({ timezone: 'America/Chicago', hacker: 'x', nested: { a: 1 } });
  assert.equal('hacker' in row || 'nested' in row, false, 'unknown keys dropped');
});
t(() => assert.equal(normalizeUserDefaults({ date_format: 'bogus' }).date_format, 'MM/DD/YYYY', 'invalid enum falls through'));
t(() => assert.equal(
  normalizeUserDefaults({ date_format: 'bogus' }, { shop_defaults: { date_format: 'YYYY-MM-DD' } }).date_format,
  'YYYY-MM-DD', 'invalid user enum → shop tier'));
t(() => assert.equal(normalizeUserDefaults({ timezone: 'Europe/London' }).timezone, 'America/New_York', 'unlisted IANA tz → default'));
t(() => assert.equal(normalizeUserDefaults({ locale: { timezone: 'America/Phoenix', date_format: 'DD/MM/YYYY' } }).timezone, 'America/Phoenix', 'blob subtree unwraps'));
t(() => assert.equal(
  normalizeUserDefaults({ preferences: { locale: { timezone: 'America/Anchorage' } } }).timezone,
  'America/Anchorage', 'entity-row {preferences} unwraps'));
t(() => {
  const row = normalizeUserDefaults({ default_pages: { dashboard: '/MyWorkflow', custom_page: '/Custom' } });
  assert.equal(row.default_pages.dashboard, '/MyWorkflow', 'page override');
  assert.equal(row.default_pages.financials, '/Financials', 'unset page keeps default');
  assert.equal(row.default_pages.custom_page, '/Custom', 'custom key stores');
});
t(() => {
  const row = normalizeUserDefaults({ default_pages: { dashboard: 'https://evil.com', Financials: '/Invoices' } });
  assert.equal(row.default_pages.dashboard, '/MainWorkflow', 'bad route dropped → default');
  assert.equal(row.default_pages.financials, '/Invoices', 'page key lowercased');
});
t(() => {
  const row = normalizeUserDefaults({ notifications: { email: false, digest: 0, sms: true } });
  assert.deepEqual(row.notifications, { in_app: true, email: false, digest: true }, 'per-key bool merge; non-bool + unknown dropped');
});
t(() => assert.equal(normalizeUserDefaults({ default_queue_view: 'team_queue' }).default_queue_view, 'team_queue'));
t(() => assert.equal(normalizeUserDefaults({ default_queue_view: 'everything' }).default_queue_view, 'my_queue', 'bad queue view → default'));
t(() => assert.deepEqual(
  userDefaultsFromPrefs({ preferences: { locale: { timezone: 'America/Boise', date_format: 'YYYY-MM-DD' }, notifications: { digest: false } } }),
  { timezone: 'America/Boise', date_format: 'YYYY-MM-DD', notifications: { digest: false } },
  'userDefaultsFromPrefs extracts flat row'));

// ── resolveTimezone — the user → shop → fallback chain ───────────────────
t(() => assert.deepEqual(resolveTimezone({ timezone: 'America/Chicago' }, null), { iana: 'America/Chicago', source: 'user' }));
t(() => assert.deepEqual(resolveTimezone({ locale: { timezone: 'America/Phoenix' } }, null).iana, 'America/Phoenix', 'blob locale unwraps'));
t(() => assert.deepEqual(resolveTimezone({ timezone: 'Europe/London' }, 'America/Denver'), { iana: 'America/Denver', source: 'shop' }, 'unlisted user tz → shop'));
t(() => assert.deepEqual(resolveTimezone({}, { display_timezone: 'America/Chicago' }), { iana: 'America/Chicago', source: 'shop' }, 'QuoteDefaults display_timezone reads as shop'));
t(() => assert.deepEqual(resolveTimezone({ timezone: '' }, { timezone: 'Not/AZone' }), { iana: 'America/New_York', source: 'fallback' }, 'both bad → fallback'));
t(() => assert.deepEqual(resolveTimezone(null, null), { iana: 'America/New_York', source: 'fallback' }));
t(() => assert.ok(KNOWN_TIMEZONES.includes(resolveTimezone({ timezone: 'junk' }, { timezone: 'also junk' }).iana), 'fallback iana always renderable'));

// ── formatDateFor — format + timezone honoring ────────────────────────────
// 2026-06-15T03:30:00Z: UTC → Jun 15; America/New_York (EDT, UTC-4) → Jun 14.
t(() => assert.equal(formatDateFor('2026-06-15T03:30:00Z', { timezone: 'UTC' }), '06/15/2026'));
t(() => assert.equal(formatDateFor('2026-06-15T03:30:00Z', { timezone: 'America/New_York' }), '06/14/2026', 'tz shifts the calendar day'));
t(() => assert.equal(formatDateFor('2026-06-15T15:00:00Z', { timezone: 'UTC', date_format: 'DD/MM/YYYY' }), '15/06/2026'));
t(() => assert.equal(formatDateFor('2026-06-15T15:00:00Z', { timezone: 'UTC', date_format: 'YYYY-MM-DD' }), '2026-06-15'));
t(() => assert.equal(formatDateFor('2026-06-15T15:00:00Z', { timezone: 'UTC', date_format: 'MMM D, YYYY' }), 'Jun 15, 2026'));
t(() => assert.equal(formatDateFor('2026-06-15T15:00:00Z', { timezone: 'UTC', time_format: '12h' }, { with_time: true }), '06/15/2026 3:00 PM'));
t(() => assert.equal(formatDateFor('2026-06-15T15:04:00Z', { timezone: 'UTC', time_format: '24h' }, { with_time: true }), '06/15/2026 15:04'));
t(() => assert.equal(formatDateFor('2026-06-15T03:30:00Z', { timezone: 'America/New_York', time_format: '12h' }, { with_time: true }), '06/14/2026 11:30 PM', 'tz applies to time too'));
// Bare stamps render literally — NO tz math (house no-day-shift rule).
t(() => assert.equal(formatDateFor('2026-06-15', { timezone: 'America/New_York' }), '06/15/2026', 'bare stamp never tz-shifts'));
t(() => assert.equal(formatDateFor('2026-06-15', { timezone: 'UTC', date_format: 'DD/MM/YYYY' }), '15/06/2026'));
t(() => assert.equal(formatDateFor('2026-06-15', { timezone: 'UTC', date_format: 'MMM D, YYYY' }), 'Jun 15, 2026'));
t(() => assert.equal(formatDateFor('garbage', {}), '', 'unparseable → empty'));
t(() => assert.equal(formatDateFor(null, {}), '', 'null → empty'));
t(() => {
  // Shop tier supplies the zone when the user row has none.
  const rendered = formatDateFor('2026-06-15T03:30:00Z', {}, { shop: { display_timezone: 'UTC' } });
  assert.equal(rendered, '06/15/2026', 'shop display_timezone drives render when user unset');
});
t(() => {
  const rendered = formatDateFor('2026-01-05T12:00:00Z', { locale: { timezone: 'UTC', date_format: 'DD/MM/YYYY' } });
  assert.equal(rendered, '05/01/2026', 'blob-shaped defaults honored');
});

// ── defaultPageFor ────────────────────────────────────────────────────────
t(() => assert.equal(defaultPageFor(null, 'dashboard'), '/MainWorkflow', 'default route'));
t(() => assert.equal(defaultPageFor(null, 'financials'), '/Financials'));
t(() => assert.equal(defaultPageFor({ default_pages: { dashboard: '/MyWorkflow' } }, 'dashboard'), '/MyWorkflow', 'user override'));
t(() => assert.equal(defaultPageFor({ default_pages: { financials: '/Invoices' } }, 'FINANCIALS'), '/Invoices', 'key normalizes'));
t(() => assert.equal(defaultPageFor({ default_pages: { dashboard: 'https://evil.com' } }, 'dashboard'), '/MainWorkflow', 'unsafe route → default'));
t(() => assert.equal(defaultPageFor(null, 'nonexistent'), '', 'unmapped key → empty'));
t(() => assert.equal(defaultPageFor(null, '!!bad key!!'), '', 'invalid key → empty'));

// ── userDefaultsPatch — sanitized write-row for the prefs host ───────────
t(() => {
  const row = userDefaultsPatch('  Sam@Example.COM ', { timezone: 'America/Chicago' });
  assert.equal(row.user_email, 'sam@example.com', 'email normalized');
  assert.equal(row.schema_version, 1);
  assert.deepEqual(row.preferences, { locale: { timezone: 'America/Chicago' } }, 'merge fragment at locale.*');
  assert.deepEqual(row.dropped, []);
});
t(() => {
  const row = userDefaultsPatch('a@b.co', { timezone: 'Europe/London', bogus: 1 });
  assert.equal(row.preferences.locale, undefined, 'invalid tz not written');
  assert.equal(row.dropped.length, 1, 'one drop reported');
  assert.equal(row.dropped[0].field, 'timezone', 'dropped records field');
});
t(() => {
  const row = userDefaultsPatch('a@b.co', { timezone: '' });
  assert.equal(row.preferences.locale.timezone, '', 'empty tz = explicit clear');
});
t(() => {
  const row = userDefaultsPatch('a@b.co', { locale: { date_format: 'DD/MM/YYYY' }, notifications: { email: false }, request_id: 'x' }, { request_id: 'req-9' });
  assert.equal(row.preferences.locale.date_format, 'DD/MM/YYYY', 'blob-shaped patch unwraps');
  assert.deepEqual(row.preferences.notifications, { email: false });
  assert.equal(row.last_request_id, 'req-9', 'request_id echoes for prefs_update');
});
t(() => {
  const row = userDefaultsPatch('a@b.co', { notifications: { email: 'yes' }, default_pages: { dashboard: 'javascript:x' } });
  assert.equal(row.preferences.notifications, undefined);
  assert.equal(row.preferences.default_pages, undefined);
  assert.equal(row.dropped.length, 2, 'both invalid fields reported');
});
t(() => {
  const row = userDefaultsPatch('a@b.co', {});
  assert.deepEqual(row.preferences, {}, 'empty patch → empty fragment (no clobber)');
});

// ── validateUserDefaults — pre-flight errors + warnings ──────────────────
t(() => assert.deepEqual(validateUserDefaults({ timezone: 'America/Chicago', date_format: 'DD/MM/YYYY' }), { errors: [], warnings: [] }, 'clean patch'));
t(() => assert.equal(validateUserDefaults({ timezone: 'Mars/Olympus' }).errors.length, 1, 'junk tz → error'));
t(() => {
  const v = validateUserDefaults({ timezone: 'Europe/London' });
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 1, 'real-but-unlisted tz → warning');
});
t(() => assert.equal(validateUserDefaults({ date_format: 'DD-MM-YYYY' }).errors.length, 1, 'bad date_format → error'));
t(() => assert.equal(validateUserDefaults({ time_format: '13h' }).errors.length, 1, 'bad time_format → error'));
t(() => assert.equal(validateUserDefaults({ default_queue_view: 'mine' }).errors.length, 1, 'bad queue view → error'));
t(() => assert.equal(validateUserDefaults({ default_pages: { dashboard: 'not-a-route' } }).errors.length, 1, 'bad route → error'));
t(() => {
  const v = validateUserDefaults({ default_pages: { mystery: '/Somewhere' } });
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 1, 'unregistered page key → warning');
});
t(() => {
  const v = validateUserDefaults({ unknown_thing: 1 });
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 1, 'unknown top-level key → warning');
});
t(() => assert.equal(validateUserDefaults({ notifications: { email: 'yes' } }).errors.length, 1, 'non-bool toggle → error'));
t(() => {
  const v = validateUserDefaults({ notifications: { sms: true } });
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 1, 'unknown toggle → warning');
});
t(() => {
  // Round-trip: a UI patch validated → sanitized → merged row reads back.
  const patch = { timezone: 'America/Denver', date_format: 'YYYY-MM-DD', default_pages: { dashboard: '/MyWorkflow' } };
  assert.deepEqual(validateUserDefaults(patch), { errors: [], warnings: [] });
  const row = userDefaultsPatch('u@x.co', patch);
  assert.equal(row.dropped.length, 0);
  const merged = normalizeUserDefaults({ preferences: { ...row.preferences, locale: { ...row.preferences.locale } } });
  assert.equal(merged.timezone, 'America/Denver');
  assert.equal(merged.date_format, 'YYYY-MM-DD');
  assert.equal(defaultPageFor({ default_pages: merged.default_pages }, 'dashboard'), '/MyWorkflow');
});

console.log(`PASS user-defaults (${n} assertion groups)`);
