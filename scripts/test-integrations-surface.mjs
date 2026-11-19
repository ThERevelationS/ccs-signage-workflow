// Unit checks for the K-08 integrations status surface —
// src/components/estimator/IntegrationsSurface.jsx.
//
// The component embeds a pure catalog module (zero service imports): an
// ordered descriptor list plus resolveIntegrationStatus(descriptor, settings)
// → {state:'connected'|'configured'|'blocked-credentials'|'disabled'|
// 'unconfigured', detail}. This harness esbuild-bundles the .jsx (react and
// lucide-react resolve from node_modules like every other Vite-era import)
// and asserts catalog completeness, the per-state resolution matrix,
// descriptor hygiene, carrier normalization, cross-key rules and stable
// group ordering.
//
// Run: node scripts/test-integrations-surface.mjs  →  prints "PASS integrations-surface (N asserts)"

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-integrations-surface.mjs');
// React / lucide are view-layer deps the harness never renders — stub them to
// a tiny CJS proxy so the bundle stays dependency-free (esbuild's ESM→CJS
// interop turns every named/default import into a property get on the proxy).
const uiStub = {
  name: 'test-ui-stubs',
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react\/jsx-runtime|lucide-react)$/ }, (a) => ({ path: a.path, namespace: 'uistub' }));
    b.onLoad({ filter: /.*/, namespace: 'uistub' }, () => ({
      contents: 'module.exports = new Proxy(function(){return null}, { get: (t, p) => (p === "__esModule" ? true : () => null) });',
      loader: 'js',
    }));
  },
};
await build({
  entryPoints: [resolve(here, '../src/components/estimator/IntegrationsSurface.jsx')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  plugins: [uiStub],
});
const {
  INTEGRATIONS,
  INTEGRATION_STATES,
  INTEGRATION_STATE_LABELS,
  INTEGRATION_CATEGORIES,
  INTEGRATION_SETTINGS_KEYS,
  normalizeSettingsRows,
  lookupSettingRow,
  settingValueFor,
  resolveIntegrationStatus,
  resolveAllIntegrations,
  groupIntegrationsByCategory,
  countByState,
} = await import(pathToFileURL(out).href);

let n = 0;
const ok = (cond, msg) => { n += 1; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n += 1; assert.equal(a, b, msg); };
const deepEq = (a, b, msg) => { n += 1; assert.deepEqual(a, b, msg); };
const match = (a, re, msg) => { n += 1; assert.match(a, re, msg); };

const byKey = (key) => INTEGRATIONS.find((d) => d.key === key);
const stateOf = (key, settings = {}) => resolveIntegrationStatus(byKey(key), settings);
const row = (setting_key, setting_value) => ({ setting_key, setting_value });
const kvRow = (key, value) => ({ key, value });

// ===========================================================================
// Descriptor hygiene — every descriptor carries the required fields.
// ===========================================================================
ok(Array.isArray(INTEGRATIONS) && INTEGRATIONS.length >= 13, 'catalog has ≥13 descriptors');
const keys = INTEGRATIONS.map((d) => d.key);
eq(new Set(keys).size, keys.length, 'descriptor keys unique');
const catIds = new Set(INTEGRATION_CATEGORIES.map((c) => c.id));
for (const d of INTEGRATIONS) {
  ok(typeof d.key === 'string' && d.key.length > 0, `key present: ${d.key}`);
  ok(typeof d.name === 'string' && d.name.length > 0, `name present: ${d.key}`);
  ok(catIds.has(d.category), `category valid: ${d.key} -> ${d.category}`);
  ok(typeof d.description === 'string' && d.description.length > 0, `description present: ${d.key}`);
  ok(typeof d.settingsPath === 'string' || typeof d.docsPath === 'string', `pointer present: ${d.key}`);
  ok(
    typeof d.statusResolver === 'function' || (d.statusResolver && typeof d.statusResolver === 'object'),
    `statusResolver declared: ${d.key}`,
  );
  if (typeof d.statusResolver === 'object') {
    ok(Array.isArray(d.statusResolver.keys), `resolver keys array: ${d.key}`);
    ok(Array.isArray(d.statusResolver.rules) && d.statusResolver.rules.length > 0, `resolver rules non-empty: ${d.key}`);
    for (const rule of d.statusResolver.rules) {
      ok(INTEGRATION_STATES.includes(rule.state), `rule state valid: ${d.key} -> ${rule.state}`);
    }
  }
}
eq(INTEGRATION_STATES.length, 5, 'five-state vocabulary');
deepEq(INTEGRATION_STATES, ['connected', 'configured', 'blocked-credentials', 'disabled', 'unconfigured'], 'state order stable');
ok(INTEGRATION_STATES.every((s) => typeof INTEGRATION_STATE_LABELS[s] === 'string' && INTEGRATION_STATE_LABELS[s].length > 0), 'every state labelled');
ok(INTEGRATION_CATEGORIES.every((c) => typeof c.id === 'string' && typeof c.label === 'string' && c.id && c.label), 'categories well-formed');

// Required minimum coverage (K-08 brief).
for (const key of [
  'smartsheet', 'quickbooks', 'email_delivery', 'google_drive',
  'broadcast_messaging', 'jurisdiction_research', 'customer_portal',
  'follow_up_sweep', 'notification_delivery', 'time_clock', 'audit_log',
]) {
  ok(!!byKey(key), `required descriptor: ${key}`);
}

// ===========================================================================
// Catalog completeness — every descriptor resolves under empty settings AND
// under a populated settings map; every result is a valid labelled state.
// ===========================================================================
const POPULATED = {
  smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: true, observation_mode: false, sales: { mirror_enabled: true, pull_enabled: true }, orders: { mirror_enabled: false } }),
  qbo: row('qbo', { realm_id: '9341', refresh_token_ref: 'sec://t', connected_at: '2026-01-01' }),
  emailDelivery: row('emailDelivery', { enabled: true, authorized_domains: ['ccs.com'] }),
  driveConfig: row('driveConfig', { jobs_root_folder_id: 'abc' }),
  automations_paused: row('automations_paused', { paused: false }),
  jurisdiction_monitoring: row('jurisdiction_monitoring', { notification_emails: ['ops@ccs.com'] }),
  notificationQuietHours: row('notificationQuietHours', { enabled: false }),
  timeclockFeatures: kvRow('timeclockFeatures', { experimental: false, announcements: true }),
};
for (const d of INTEGRATIONS) {
  for (const [label, settings] of [['empty', {}], ['populated', POPULATED]]) {
    const r = resolveIntegrationStatus(d, settings);
    ok(INTEGRATION_STATES.includes(r.state), `${d.key} resolves (${label})`);
    ok(typeof r.detail === 'string' && r.detail.length > 0, `${d.key} detail non-empty (${label})`);
    eq(r.key, d.key, `${d.key} result echoes key (${label})`);
  }
}

// ===========================================================================
// Settings carriers — array rows, Map, object map, single row, key/value rows.
// ===========================================================================
eq(stateOf('email_delivery', [row('emailDelivery', { enabled: true })]).state, 'connected', 'array-of-rows carrier');
eq(stateOf('email_delivery', new Map([['emailDelivery', { enabled: true }]])).state, 'connected', 'Map carrier');
eq(stateOf('email_delivery', { emailDelivery: { enabled: true } }).state, 'connected', 'object-map bare value');
eq(stateOf('email_delivery', row('emailDelivery', { enabled: true })).state, 'connected', 'single bare row');
eq(stateOf('time_clock', [kvRow('timeclockFeatures', { experimental: true })]).state, 'connected', 'key/value row convention');
eq(lookupSettingRow([row('a', 1), row('b', 2)], 'b').setting_value, 2, 'lookup picks matching row');
eq(settingValueFor(row('x', { a: 1 })).a, 1, 'setting_value unwrap');
eq(settingValueFor(kvRow('x', { a: 2 })).a, 2, 'key/value unwrap');
eq(settingValueFor({ a: 3 }).a, 3, 'bare value passthrough');
eq(settingValueFor('plain'), 'plain', 'primitive passthrough');
const norm = normalizeSettingsRows({ qbo: row('qbo', {}), stray: { enabled: true } });
ok(norm instanceof Map && norm.get('qbo').setting_key === 'qbo', 'normalize → Map keyed by setting_key');
eq(normalizeSettingsRows(undefined).size, 0, 'undefined settings → empty map');
eq(normalizeSettingsRows([{ no_key: true }, row('k', 1)]).size, 1, 'keyless array entries skipped');
eq(normalizeSettingsRows({}).size, 0, 'empty object → empty map');

// ===========================================================================
// Status matrix — CONNECTED
// ===========================================================================
const SM_ARMED = { smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: true, observation_mode: false, orders: { mirror_enabled: true, push_enabled: true } }) };
eq(stateOf('smartsheet', SM_ARMED).state, 'connected', 'smartsheet armed → connected');
const QBO_LIVE = { qbo: row('qbo', { realm_id: 'r', refresh_token_ref: 't', connected_at: '2026-01-01T00:00:00Z' }) };
eq(stateOf('quickbooks', QBO_LIVE).state, 'connected', 'qbo creds + handshake → connected');
match(stateOf('quickbooks', QBO_LIVE).detail, /handshake/i, 'qbo connected detail mentions handshake');
eq(stateOf('email_delivery', { emailDelivery: row('emailDelivery', { enabled: true }) }).state, 'connected', 'email enabled → connected');
eq(stateOf('broadcast_messaging', {}).state, 'connected', 'broadcasts built-in → connected');
eq(stateOf('notification_delivery', {}).state, 'connected', 'notifications built-in → connected');
eq(stateOf('notification_delivery', { notificationQuietHours: row('notificationQuietHours', { enabled: true, start: '20:00', end: '07:00' }) }).state, 'connected', 'quiet-hours on → still connected');
eq(stateOf('customer_portal', {}).state, 'connected', 'portal built-in → connected');
match(stateOf('customer_portal', {}).detail, /pay_url|not wired|messages/i, 'portal detail notes email/pay lane');
eq(stateOf('customer_portal', { emailDelivery: row('emailDelivery', { enabled: true }) }).detail.includes('email'), true, 'portal notes email lane when enabled');
eq(stateOf('follow_up_sweep', {}).state, 'connected', 'sweep built-in → connected');
match(stateOf('follow_up_sweep', {}).detail, /internal notifications|email lane off/i, 'sweep detail notes internal lane');
eq(stateOf('scheduled_workflows', {}).state, 'connected', 'workflows no pause row → connected');
eq(stateOf('scheduled_workflows', { automations_paused: row('automations_paused', { paused: false }) }).state, 'connected', 'paused=false → connected');
eq(stateOf('jurisdiction_research', {}).state, 'connected', 'research agent built-in → connected');
eq(stateOf('jurisdiction_research', { jurisdiction_monitoring: row('jurisdiction_monitoring', { notification_emails: ['a@b.co'] }) }).state, 'connected', 'monitoring recipients → connected');
match(stateOf('jurisdiction_research', { jurisdiction_monitoring: row('jurisdiction_monitoring', { notification_emails: ['a@b.co'] }) }).detail, /recipient/i, 'monitoring detail mentions recipients');
eq(stateOf('time_clock', {}).state, 'connected', 'time clock defaults → connected');
match(stateOf('time_clock', {}).detail, /defaults/i, 'time clock detail notes defaults');
eq(stateOf('time_clock', { timeclockFeatures: kvRow('timeclockFeatures', { dual_ring: false }) }).state, 'connected', 'time clock flags row → connected');
eq(stateOf('audit_log', {}).state, 'connected', 'audit log always → connected');
eq(stateOf('google_drive', {}).state, 'connected', 'drive platform connector → connected');
match(stateOf('google_drive', {}).detail, /CCS Jobs|platform-managed/i, 'drive detail explains auto root');

// ===========================================================================
// Status matrix — CONFIGURED
// ===========================================================================
eq(
  stateOf('smartsheet', { smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: true, observation_mode: true }) }).state,
  'configured', 'smartsheet observation mode → configured',
);
match(
  stateOf('smartsheet', { smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: true, observation_mode: true }) }).detail,
  /observation/i, 'observation detail explains read-only',
);
eq(
  stateOf('smartsheet', { smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: true, observation_mode: false }) }).state,
  'configured', 'smartsheet enabled, no mirror → configured',
);
eq(stateOf('quickbooks', { qbo: row('qbo', { realm_id: 'r', refresh_token_ref: 't' }) }).state, 'configured', 'qbo creds, no handshake → configured');
match(stateOf('quickbooks', { qbo: row('qbo', { realm_id: 'r', refresh_token_ref: 't' }) }).detail, /dry-run|first-connect/i, 'qbo configured detail explains gating');
eq(stateOf('google_drive', { driveConfig: row('driveConfig', { jobs_root_folder_id: 'abc' }) }).state, 'configured', 'drive root pinned → configured');
eq(stateOf('google_drive', { googleDriveConfig: row('googleDriveConfig', { root_folder_id: 'r1' }) }).state, 'configured', 'drive alt key + pin → configured');
eq(stateOf('google_drive', { driveConfig: row('driveConfig', { other: 1 }) }).state, 'configured', 'drive row w/o pin → configured');
eq(stateOf('email_delivery', { emailDelivery: row('emailDelivery', { authorized_domains: ['x.co'] }) }).state, 'configured', 'email row, flag unset → configured');
eq(stateOf('scheduled_workflows', { automations_paused: row('automations_paused', { note: 'x' }) }).state, 'configured', 'pause row w/o flag → configured');

// ===========================================================================
// Status matrix — BLOCKED-CREDENTIALS
// ===========================================================================
eq(stateOf('quickbooks', {}).state, 'blocked-credentials', 'qbo no row → blocked-credentials');
match(stateOf('quickbooks', {}).detail, /realm_id|refresh_token_ref|Intuit/i, 'qbo blocked detail names the gap');
const rQboThin = stateOf('quickbooks', { qbo: row('qbo', { realm_id: 'r' }) });
eq(rQboThin.state, 'blocked-credentials', 'qbo thin row → blocked-credentials');
match(rQboThin.detail, /Missing: refresh_token_ref/, 'qbo missing list names refresh_token_ref');
ok(!/Missing: realm_id/.test(rQboThin.detail), 'present realm_id not listed missing');
deepEq(rQboThin.evidence.missing, ['refresh_token_ref'], 'evidence.missing carries field names');
const rQboEmpty = stateOf('quickbooks', { qbo: row('qbo', {}) });
eq(rQboEmpty.state, 'blocked-credentials', 'qbo empty row → blocked-credentials');
match(rQboEmpty.detail, /Missing: realm_id, refresh_token_ref/, 'both missing fields listed');
eq(stateOf('quickbooks', { qbo: row('qbo', { company_name: 'CCS' }) }).state, 'blocked-credentials', 'qbo row w/o creds → blocked');

// ===========================================================================
// Status matrix — DISABLED
// ===========================================================================
eq(stateOf('smartsheet', { smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: false }) }).state, 'disabled', 'smartsheet kill switch → disabled');
match(stateOf('smartsheet', { smartsheetSyncConfig: row('smartsheetSyncConfig', { global_enabled: false }) }).detail, /kill switch/i, 'disabled detail names kill switch');
eq(stateOf('smartsheet', { smartsheetSyncConfig: row('smartsheetSyncConfig', { observation_mode: false }) }).state, 'disabled', 'smartsheet flag unset → treated off → disabled');
eq(stateOf('email_delivery', { emailDelivery: row('emailDelivery', { enabled: false }) }).state, 'disabled', 'email master switch off → disabled');
match(stateOf('email_delivery', { emailDelivery: row('emailDelivery', { enabled: false }) }).detail, /OFF|fail-closed/i, 'email disabled detail explains lanes');
eq(stateOf('scheduled_workflows', { automations_paused: row('automations_paused', { paused: true }) }).state, 'disabled', 'automations_paused → disabled');
eq(stateOf('follow_up_sweep', { automations_paused: row('automations_paused', { paused: true }) }).state, 'disabled', 'paused → sweep disabled');
match(stateOf('follow_up_sweep', { automations_paused: row('automations_paused', { paused: true }) }).detail, /manual admin runs/i, 'sweep disabled detail notes manual runs');
eq(stateOf('corebridge_erp', {}).state, 'disabled', 'corebridge retired → disabled');
match(stateOf('corebridge_erp', {}).detail, /410|retired|api_disabled/i, 'corebridge detail explains retirement');
eq(stateOf('corebridge_erp', { anything: row('anything', {}) }).state, 'disabled', 'corebridge ignores unrelated rows');

// ===========================================================================
// Status matrix — UNCONFIGURED
// ===========================================================================
eq(stateOf('smartsheet', {}).state, 'unconfigured', 'smartsheet no row → unconfigured');
eq(stateOf('email_delivery', {}).state, 'unconfigured', 'email no row → unconfigured');
match(stateOf('email_delivery', {}).detail, /sendEmail|503|fail/i, 'email unconfigured detail notes 503 stub');
const rUndef = resolveIntegrationStatus(undefined, {});
eq(rUndef.state, 'unconfigured', 'missing descriptor → unconfigured');
match(rUndef.detail, /resolver/i, 'missing descriptor detail explains');
const rNoResolver = resolveIntegrationStatus({ key: 'x', name: 'X', category: 'sync' }, {});
eq(rNoResolver.state, 'unconfigured', 'descriptor w/o resolver → unconfigured');

// ===========================================================================
// Cross-key rules + evidence
// ===========================================================================
eq(
  stateOf('follow_up_sweep', { emailDelivery: row('emailDelivery', { enabled: true }) }).state,
  'connected', 'sweep reads emailDelivery cross-key',
);
match(
  stateOf('follow_up_sweep', { emailDelivery: row('emailDelivery', { enabled: true }) }).detail,
  /email customers/i, 'sweep cross-key detail notes customer emails',
);
eq(
  stateOf('follow_up_sweep', {
    automations_paused: row('automations_paused', { paused: true }),
    emailDelivery: row('emailDelivery', { enabled: true }),
  }).state,
  'disabled', 'pause wins over email lane (rule order)',
);
const rEmailOn = stateOf('email_delivery', { emailDelivery: row('emailDelivery', { enabled: true }) });
eq(rEmailOn.evidence.settings_row, true, 'evidence flags found row');
eq(rEmailOn.evidence.settings_key, 'emailDelivery', 'evidence reports which key matched');
eq(stateOf('smartsheet', {}).evidence.settings_row, false, 'evidence flags absent row');

// ===========================================================================
// Function-form resolver (escape hatch)
// ===========================================================================
const fnDescriptor = {
  key: 'fn_test', name: 'Fn', category: 'sync',
  statusResolver: (settings) => (settings?.flag === true ? { state: 'connected', detail: 'fn ok' } : 'disabled'),
};
eq(resolveIntegrationStatus(fnDescriptor, { flag: true }).state, 'connected', 'fn resolver object return');
eq(resolveIntegrationStatus(fnDescriptor, { flag: true }).detail, 'fn ok', 'fn resolver detail');
eq(resolveIntegrationStatus(fnDescriptor, { flag: false }).state, 'disabled', 'fn resolver bare-state return');
const badFn = { key: 'bad', name: 'Bad', category: 'sync', statusResolver: () => { throw new Error('nope'); } };
eq(resolveIntegrationStatus(badFn, {}).state, 'unconfigured', 'throwing fn resolver → unconfigured');

// ===========================================================================
// Derived collections + stable ordering
// ===========================================================================
ok(INTEGRATION_SETTINGS_KEYS.includes('smartsheetSyncConfig'), 'settings keys include smartsheetSyncConfig');
ok(INTEGRATION_SETTINGS_KEYS.includes('qbo'), 'settings keys include qbo');
ok(INTEGRATION_SETTINGS_KEYS.includes('emailDelivery'), 'settings keys include descriptor + cross-key emailDelivery');
ok(INTEGRATION_SETTINGS_KEYS.includes('driveConfig') && INTEGRATION_SETTINGS_KEYS.includes('googleDriveConfig'), 'drive keys + alt');
ok(INTEGRATION_SETTINGS_KEYS.includes('automations_paused'), 'settings keys include automations_paused');
ok(INTEGRATION_SETTINGS_KEYS.includes('jurisdiction_monitoring'), 'settings keys include jurisdiction_monitoring');
ok(INTEGRATION_SETTINGS_KEYS.includes('notificationQuietHours'), 'settings keys include notificationQuietHours');
ok(INTEGRATION_SETTINGS_KEYS.includes('timeclockFeatures'), 'settings keys include timeclockFeatures');
eq(new Set(INTEGRATION_SETTINGS_KEYS).size, INTEGRATION_SETTINGS_KEYS.length, 'settings keys deduped');

const ALL = resolveAllIntegrations(POPULATED);
eq(ALL.length, INTEGRATIONS.length, 'resolveAll covers catalog');
deepEq(ALL.map((r) => r.key), keys, 'resolveAll preserves catalog order');
ok(ALL.every((r) => INTEGRATION_STATES.includes(r.state) && r.descriptor === byKey(r.key)), 'resolveAll rows shaped');

const G1 = groupIntegrationsByCategory(ALL);
const G2 = groupIntegrationsByCategory(resolveAllIntegrations(POPULATED));
deepEq(G1.map((g) => g.category.id), G2.map((g) => g.category.id), 'group order deterministic across calls');
// Category sequence is exactly the declared order, minus empty groups.
deepEq(
  G1.map((g) => g.category.id),
  INTEGRATION_CATEGORIES.map((c) => c.id).filter((id) => ALL.some((r) => r.descriptor.category === id)),
  'groups follow declared category order',
);
// Items inside a group preserve catalog order.
for (const g of G1) {
  deepEq(
    g.items.map((i) => i.key),
    keys.filter((k) => byKey(k).category === g.category.id),
    `catalog order inside ${g.category.id}`,
  );
}
eq(G1.reduce((sum, g) => sum + g.items.length, 0), ALL.length, 'grouping loses nothing');
ok(G1.every((g) => g.items.every((i) => i.descriptor.category === g.category.id)), 'groups homogeneous');
// Six categories × the catalog — every declared group is non-empty today.
eq(G1.length, INTEGRATION_CATEGORIES.length, 'every declared category has items');
deepEq(groupIntegrationsByCategory([]), [], 'empty input → no groups');

const COUNTS = countByState(ALL);
eq(Object.values(COUNTS).reduce((a, b) => a + b, 0), ALL.length, 'state counts sum to catalog');
eq(countByState([]).connected, 0, 'empty counts safe');
// Spot-check the populated matrix lands where the per-descriptor asserts said.
eq(stateOf('smartsheet', POPULATED).state, 'connected', 'populated smartsheet → connected');
eq(stateOf('quickbooks', POPULATED).state, 'connected', 'populated qbo → connected');
eq(stateOf('email_delivery', POPULATED).state, 'connected', 'populated email → connected');
eq(stateOf('google_drive', POPULATED).state, 'configured', 'populated drive pin → configured');
eq(stateOf('follow_up_sweep', POPULATED).state, 'connected', 'populated sweep → connected (paused:false + email on)');

rmSync(out, { force: true });
console.log(`PASS integrations-surface (${n} asserts)`);
