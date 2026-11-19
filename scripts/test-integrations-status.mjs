import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-integrations-status.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/integrationsStatusModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  INTEGRATION_CATALOG, INTEGRATION_CATEGORIES, INTEGRATION_STATUSES,
  INTEGRATION_STATUS_LABELS, INTEGRATION_SETTINGS_KEYS, INTEGRATION_PROBES,
  catalogEntry, settingRowFor, settingValueFor, settingsRowValue,
  normalizeProbeResult, resolveIntegrationStatus, resolveAllIntegrations,
  groupIntegrationsByCategory, countIntegrationsByStatus,
} = await import(pathToFileURL(out).href);

let N = 0;
const ok = (...a) => { N++; return assert.ok(...a); };
const eq = (...a) => { N++; return assert.equal(...a); };
const deq = (...a) => { N++; return assert.deepEqual(...a); };
const match = (...a) => { N++; return assert.match(...a); };

const statusOf = (key, settings = {}, fns = {}) =>
  resolveIntegrationStatus({ key, settings, function_statuses: fns });

const SOURCES = new Set(['configured', 'credential', 'native', 'absent']);
const MODES = new Set(['native', 'absent', 'unverifiable', 'settings', 'probe', 'probe_else_settings', 'probe_and_settings']);
const CATS = new Set(INTEGRATION_CATEGORIES.map((c) => c.id));

// ===========================================================================
// Catalog integrity — every discovered service has a well-formed entry.
// ===========================================================================
ok(Array.isArray(INTEGRATION_CATALOG) && INTEGRATION_CATALOG.length >= 15, 'catalog has ≥15 entries');
const keys = INTEGRATION_CATALOG.map((e) => e.key);
eq(new Set(keys).size, keys.length, 'no duplicate catalog keys');
for (const e of INTEGRATION_CATALOG) {
  ok(typeof e.key === 'string' && e.key.length > 0, `entry key ${e.key}`);
  ok(typeof e.label === 'string' && e.label.length > 0, `entry label ${e.key}`);
  ok(CATS.has(e.category), `category valid: ${e.key} -> ${e.category}`);
  ok(SOURCES.has(e.source), `source valid: ${e.key} -> ${e.source}`);
  ok(MODES.has(e.resolver?.mode), `resolver mode valid: ${e.key} -> ${e.resolver?.mode}`);
}
// source/mode coherence
for (const e of INTEGRATION_CATALOG) {
  if (e.source === 'native') eq(e.resolver.mode, 'native', `native source -> native mode: ${e.key}`);
  if (e.source === 'absent') eq(e.resolver.mode, 'absent', `absent source -> absent mode: ${e.key}`);
  if (e.resolver.mode === 'probe' || e.resolver.mode === 'probe_else_settings' || e.resolver.mode === 'probe_and_settings') {
    ok(typeof e.resolver.probe?.fn === 'string' && e.resolver.probe.fn.length > 0, `probe fn declared: ${e.key}`);
  }
}

// Required services from the service-map audit — connected vs absent surface.
const MUST = {
  quickbooks_online: 'credential', smartsheet: 'credential', corebridge_erp: 'absent',
  google_drive: 'credential', google_maps_platform: 'credential', google_geocoding: 'credential',
  email_delivery: 'configured', gmail_connector: 'credential', customer_portal: 'native',
  bouncie: 'credential', zapier: 'absent', merchant_provider: 'absent',
  planprophet: 'absent', sign_pack: 'absent', b2_portal: 'absent',
  base44_ai: 'native', nominatim_osm: 'native', us_census_geocoder: 'native',
  cagis: 'native', permitting_research_api: 'credential', workflow_engine: 'native',
};
for (const [key, source] of Object.entries(MUST)) {
  const e = catalogEntry(key);
  ok(!!e, `cataloged: ${key}`);
  eq(e?.source, source, `source of ${key}`);
}
// Every catalog entry's category exists in category metadata (grouping works).
eq(INTEGRATION_CATEGORIES.every((c) => typeof c.id === 'string' && typeof c.label === 'string'), true, 'categories well-formed');
eq(INTEGRATION_STATUSES.length, 6, 'six status values');
ok(INTEGRATION_STATUSES.every((s) => typeof INTEGRATION_STATUS_LABELS[s] === 'string'), 'all statuses labelled');

// Derived collections
ok(INTEGRATION_SETTINGS_KEYS.includes('qbo'), 'settings keys include qbo');
ok(INTEGRATION_SETTINGS_KEYS.includes('smartsheetSyncConfig'), 'settings keys include smartsheetSyncConfig');
ok(INTEGRATION_SETTINGS_KEYS.includes('emailDelivery'), 'settings keys include emailDelivery');
ok(INTEGRATION_SETTINGS_KEYS.includes('driveConfig') && INTEGRATION_SETTINGS_KEYS.includes('googleDriveConfig'), 'drive keys + alt');
eq(new Set(INTEGRATION_PROBES.map((p) => p.fn)).size, INTEGRATION_PROBES.length, 'probe fns deduped');
ok(INTEGRATION_PROBES.some((p) => p.fn === 'quickbooksExport' && p.payload.action === 'status'), 'qbo probe payload');
ok(INTEGRATION_PROBES.some((p) => p.fn === 'smartsheetSyncAction' && p.payload.action === 'status'), 'smartsheet probe payload');
ok(INTEGRATION_PROBES.some((p) => p.fn === 'checkGmailConnection'), 'gmail probe');
ok(INTEGRATION_PROBES.some((p) => p.fn === 'bouncieStatus'), 'bouncie probe');
ok(INTEGRATION_PROBES.some((p) => p.fn === 'getGoogleMapsKey'), 'maps probe');
eq(INTEGRATION_PROBES.every((p) => catalogEntry(p.key)?.resolver.probe?.fn === p.fn), true, 'probe inputs reference catalog resolvers');

// ===========================================================================
// Helpers
// ===========================================================================
deq(settingValueFor({ setting_key: 'x', setting_value: { a: 1 } }), { a: 1 }, 'row unwrap');
eq(settingValueFor({ a: 2 }).a, 2, 'bare value passthrough');
eq(settingRowFor({ qbo: { setting_value: { realm_id: 'r' } } }, 'qbo').setting_value.realm_id, 'r', 'row lookup');
eq(settingRowFor(new Map([['qbo', 'v']]), 'qbo'), 'v', 'map lookup');
const sv = settingsRowValue({ driveConfig: { setting_value: { jobs_root_folder_id: 'abc' } } }, { key: 'googleDriveConfig', alt_keys: ['driveConfig'] });
// alt key resolution prefers declared key first, falls to alt
eq(settingsRowValue({ googleDriveConfig: { root_folder_id: 'x' } }, { key: 'driveConfig', alt_keys: ['googleDriveConfig'] }).row.root_folder_id, 'x', 'alt key fallback');

// normalizeProbeResult
eq(normalizeProbeResult(undefined).state, 'absent', 'probe absent');
eq(normalizeProbeResult(new Error('boom')).state, 'error', 'probe Error');
eq(normalizeProbeResult({ __error: 'bad' }).state, 'error', 'probe __error');
eq(normalizeProbeResult({ ok: false, error: 'nope' }).state, 'error', 'probe ok:false');
eq(normalizeProbeResult({ status: 200, data: { connected: true } }).body.connected, true, 'envelope unwrap');
eq(normalizeProbeResult({ connected: true }).state, 'ok', 'raw body');

// ===========================================================================
// Resolution — native / absent / unverifiable
// ===========================================================================
eq(statusOf('base44_ai').status, 'native', 'AI native');
eq(statusOf('customer_portal').status, 'native', 'portal native');
eq(statusOf('zapier').status, 'unavailable', 'zapier unavailable');
eq(statusOf('merchant_provider').status, 'unavailable', 'merchant unavailable');
eq(statusOf('planprophet').status, 'unavailable', 'planprophet unavailable');
eq(statusOf('corebridge_erp').status, 'unavailable', 'corebridge unavailable');
match(statusOf('corebridge_erp').detail, /retired|410|api_disabled/i, 'corebridge detail explains retirement');
eq(statusOf('google_geocoding').status, 'unknown', 'geocoding unverifiable');
eq(statusOf('permitting_research_api').status, 'unknown', 'permitting proxy unverifiable');
eq(statusOf('not_a_service').status, 'unknown', 'unknown key -> unknown');

// ===========================================================================
// Resolution — settings mode
// ===========================================================================
const EMAIL_ON = { emailDelivery: { setting_key: 'emailDelivery', setting_value: { enabled: true, authorized_domains: ['ccs.com'] } } };
const EMAIL_OFF = { emailDelivery: { setting_key: 'emailDelivery', setting_value: { enabled: false } } };
const EMAIL_NOFLAG = { emailDelivery: { setting_key: 'emailDelivery', setting_value: { authorized_domains: ['x.com'] } } };
eq(statusOf('email_delivery', EMAIL_ON).status, 'connected', 'email enabled -> connected');
eq(statusOf('email_delivery', EMAIL_OFF).status, 'partial', 'email disabled -> partial');
eq(statusOf('email_delivery', EMAIL_NOFLAG).status, 'partial', 'email missing flag -> partial');
eq(statusOf('email_delivery', {}).status, 'not_configured', 'no emailDelivery row -> not_configured');
match(statusOf('email_delivery', EMAIL_OFF).detail, /master switch|disabled/i, 'disabled detail explains');

// google drive — optional pin + platform-managed token
const DRIVE_PIN = { driveConfig: { setting_value: { jobs_root_folder_id: 'abc123' } } };
eq(statusOf('google_drive', DRIVE_PIN).status, 'partial', 'drive pinned -> partial (token unverifiable)');
eq(statusOf('google_drive', {}).status, 'unknown', 'no drive row -> unknown (connector invisible)');
const DRIVE_ALT = { googleDriveConfig: { setting_value: { root_folder_id: 'r1' } } };
eq(statusOf('google_drive', DRIVE_ALT).status, 'partial', 'drive alt key -> partial');

// ===========================================================================
// Resolution — probe mode
// ===========================================================================
eq(statusOf('gmail_connector', {}, { checkGmailConnection: { connected: true, email: 'shop@ccs.com' } }).status, 'connected', 'gmail connected');
match(statusOf('gmail_connector', {}, { checkGmailConnection: { connected: true, email: 'shop@ccs.com' } }).detail, /shop@ccs\.com/, 'gmail detail shows account');
eq(statusOf('gmail_connector', {}, { checkGmailConnection: { connected: false } }).status, 'not_configured', 'gmail unlinked -> not_configured');
eq(statusOf('gmail_connector', {}, { checkGmailConnection: { __error: 'hiccup' } }).status, 'unknown', 'gmail probe error -> unknown');
eq(statusOf('gmail_connector', {}, {}).status, 'unknown', 'gmail probe not run -> unknown');

// bouncie — degraded detection
eq(statusOf('bouncie', {}, { bouncieStatus: { connected: true, apiHealthy: true, needsReconnect: false } }).status, 'connected', 'bouncie healthy');
eq(statusOf('bouncie', {}, { bouncieStatus: { connected: true, needsReconnect: true } }).status, 'partial', 'bouncie needs reconnect -> partial');
eq(statusOf('bouncie', {}, { bouncieStatus: { connected: true, apiHealthy: false } }).status, 'partial', 'bouncie api unhealthy -> partial');
eq(statusOf('bouncie', {}, { bouncieStatus: { connected: false } }).status, 'not_configured', 'bouncie unlinked');
eq(statusOf('bouncie', {}, { bouncieStatus: new Error('busy') }).status, 'unknown', 'bouncie probe error -> unknown');

// maps key — 503 message maps to not_configured via regex
eq(statusOf('google_maps_platform', {}, { getGoogleMapsKey: { apiKey: 'AIza' } }).status, 'connected', 'maps key present');
eq(statusOf('google_maps_platform', {}, { getGoogleMapsKey: { __error: 'Google Maps is not configured' } }).status, 'not_configured', 'maps 503 -> not_configured');
eq(statusOf('google_maps_platform', {}, { getGoogleMapsKey: { error: 'Google Maps is not configured' } }).status, 'not_configured', 'maps error body -> not_configured');
eq(statusOf('google_maps_platform', {}, { getGoogleMapsKey: { __error: 'rate limit' } }).status, 'unknown', 'maps other error -> unknown');

// ===========================================================================
// Resolution — probe_else_settings (QBO)
// ===========================================================================
const QBO_FULL = { qbo: { setting_key: 'qbo', setting_value: { realm_id: '9341', refresh_token_ref: 'sec://t', company_name: 'CCS' } } };
const QBO_THIN = { qbo: { setting_value: { realm_id: '9341' } } };
eq(statusOf('quickbooks_online', QBO_FULL).status, 'connected', 'qbo settings complete -> connected');
eq(statusOf('quickbooks_online', QBO_THIN).status, 'partial', 'qbo partial row -> partial');
eq(statusOf('quickbooks_online', {}).status, 'not_configured', 'qbo no row -> not_configured');
const QBO_CONN = { connection: { connected: true, company_name: 'CCS', environment: 'sandbox' } };
const rQbo = statusOf('quickbooks_online', {}, { quickbooksExport: QBO_CONN });
eq(rQbo.status, 'connected', 'qbo probe connected');
match(rQbo.detail, /Company: CCS/, 'qbo detail shows company');
const QBO_BLOCKED = { connection: { connected: false, blocked: true, missing: ['realm_id', 'refresh_token_ref'] } };
const rQboB = statusOf('quickbooks_online', {}, { quickbooksExport: QBO_BLOCKED });
eq(rQboB.status, 'not_configured', 'qbo blocked -> not_configured');
match(rQboB.detail, /realm_id/, 'qbo detail lists missing');
eq(statusOf('quickbooks_online', QBO_FULL, { quickbooksExport: { __error: 'timeout' } }).status, 'unknown', 'qbo probe error -> unknown (not guessed)');
eq(statusOf('quickbooks_online', {}, { quickbooksExport: { __error: 'credentials not configured for call' } }).status, 'not_configured', 'qbo error regex -> not_configured');

// ===========================================================================
// Resolution — probe_and_settings (Smartsheet)
// ===========================================================================
const SM_CFG = { smartsheetSyncConfig: { setting_key: 'smartsheetSyncConfig', setting_value: { global_enabled: true, orders: { mirror_enabled: true } } } };
const SM_OFF = { smartsheetSyncConfig: { setting_value: { global_enabled: false } } };
eq(statusOf('smartsheet', SM_CFG, { smartsheetSyncAction: { configured: true } }).status, 'connected', 'smartsheet token+config -> connected');
eq(statusOf('smartsheet', {}, { smartsheetSyncAction: { configured: true } }).status, 'partial', 'token w/o config row -> partial');
eq(statusOf('smartsheet', SM_OFF, { smartsheetSyncAction: { configured: true } }).status, 'partial', 'config disabled -> partial');
eq(statusOf('smartsheet', {}, { smartsheetSyncAction: { configured: false } }).status, 'not_configured', 'no token -> not_configured');
eq(statusOf('smartsheet', SM_CFG).status, 'partial', 'config row only (probe absent) -> partial');
eq(statusOf('smartsheet', {}).status, 'not_configured', 'nothing -> not_configured');
eq(statusOf('smartsheet', SM_CFG, { smartsheetSyncAction: { __error: 'down' } }).status, 'unknown', 'smartsheet probe error -> unknown');

// ===========================================================================
// Collections
// ===========================================================================
const ALL = resolveAllIntegrations({ settings: EMAIL_ON, function_statuses: { checkGmailConnection: { connected: true, email: 'a@b.co' } } });
eq(ALL.length, INTEGRATION_CATALOG.length, 'resolveAll covers catalog');
ok(ALL.every((r) => INTEGRATION_STATUSES.includes(r.status) && r.entry && typeof r.detail === 'string'), 'resolveAll rows shaped');
const GROUPED = groupIntegrationsByCategory(ALL);
ok(GROUPED.length >= 6, 'grouped categories');
eq(GROUPED.reduce((n, g) => n + g.items.length, 0), ALL.length, 'grouping loses nothing');
ok(GROUPED.every((g) => g.items.every((i) => i.entry.category === g.category.id)), 'groups homogeneous');
const COUNTS = countIntegrationsByStatus(ALL);
eq(Object.values(COUNTS).reduce((a, b) => a + b, 0), ALL.length, 'status counts sum to catalog');
eq(COUNTS.unavailable, 6, 'six absent services (merchant, corebridge, sign_pack, zapier, planprophet, b2_portal)');
eq(COUNTS.native, 6, 'six native entries');
eq(countIntegrationsByStatus([]).connected, 0, 'empty counts safe');
eq(resolveAllIntegrations({}).length, INTEGRATION_CATALOG.length, 'empty args safe');

rmSync(out, { force: true });
console.log(`PASS integrations-status (${N} assertions)`);
