import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-data-export.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/dataExportModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  EXPORT_DATASETS, EXPORT_SYSTEM_FIELDS, FIELD_DENYLIST, SENSITIVE_SAFE_LIST,
  datasetFor, classifyFieldSensitive, exportableFields, rowsToCsv, csvCellText,
  shaHint, exportManifest, exportAuditEvent,
} = await import(pathToFileURL(out).href);

// --- dataset registry --------------------------------------------------------
assert.equal(EXPORT_DATASETS.length, 7, 'seven export datasets');
assert.deepEqual(
  EXPORT_DATASETS.map((d) => d.key),
  ['estimates', 'customers', 'work_orders', 'invoices', 'payments', 'parts', 'contacts'],
);
assert.deepEqual(
  EXPORT_DATASETS.map((d) => d.entity),
  ['AllInOneEstimate', 'Customer', 'WorkOrder', 'Invoice', 'Payment', 'Inventory', 'CustomerContact'],
);
assert.ok(EXPORT_DATASETS.every((d) => Array.isArray(d.fields) && d.fields.length > 5), 'every dataset has a field allowlist');
assert.ok(EXPORT_DATASETS.every((d) => d.fields[0] === 'id'), 'id leads every allowlist');
assert.ok(
  EXPORT_DATASETS.every((d) => EXPORT_SYSTEM_FIELDS.every((f) => d.fields.includes(f))),
  'system fields present on every dataset',
);
assert.equal(datasetFor('estimates').entity, 'AllInOneEstimate');
assert.equal(datasetFor('Customer').key, 'customers', 'lookup by entity name works');
assert.equal(datasetFor('nope'), null);

// --- sensitivity classification ---------------------------------------------
assert.equal(classifyFieldSensitive('password_hash'), true);
assert.equal(classifyFieldSensitive('onboarding_token'), true);
assert.equal(classifyFieldSensitive('api_key'), true, 'credential key denied');
assert.equal(classifyFieldSensitive('private_key'), true);
assert.equal(classifyFieldSensitive('license_key'), true, 'license key is a credential key');
assert.equal(classifyFieldSensitive('session_not_before'), true);
assert.equal(classifyFieldSensitive('passwordResetToken'), true, 'camelCase secret caught');
assert.equal(classifyFieldSensitive('salt'), true);
assert.equal(classifyFieldSensitive('access_token_secret'), true);
assert.equal(classifyFieldSensitive('key'), true, 'bare key denied by heuristic');
assert.equal(classifyFieldSensitive('oauth_token'), true);
// safe-list overrides — identity/idempotency keys keep re-import fidelity
assert.equal(classifyFieldSensitive('creation_request_key'), false);
assert.equal(classifyFieldSensitive('estimator_creation_key'), false);
assert.equal(classifyFieldSensitive('part_key'), false);
assert.equal(classifyFieldSensitive('estimate_key'), false, 'safe *_key prefix');
assert.equal(classifyFieldSensitive('idempotency_key'), false);
// non-secret look-alikes stay exportable
assert.equal(classifyFieldSensitive('authority_role'), false, 'authority is not auth');
assert.equal(classifyFieldSensitive('job_authority'), false);
assert.equal(classifyFieldSensitive('tax_id_number'), false);
assert.equal(classifyFieldSensitive('pay_url'), false);
assert.equal(classifyFieldSensitive('keyboard_shortcut'), false, 'key inside a word is not a segment');
assert.equal(classifyFieldSensitive(''), false);
assert.ok(SENSITIVE_SAFE_LIST.has('creation_request_key'));
assert.ok(FIELD_DENYLIST.AuthorizedEmail.includes('password_hash'), 'staffDataRead parity denylist');

// --- exportableFields: registry allowlist + deny rules -----------------------
const estFields = exportableFields('AllInOneEstimate');
assert.ok(estFields.includes('creation_request_key'), 'idempotency key survives heuristic');
assert.ok(estFields.includes('line_items'));
assert.ok(!estFields.includes('pipeline_sync_pending'), 'transient sync flag excluded');
assert.ok(!estFields.includes('pipeline_sync_error'), 'transient sync error excluded');
assert.equal(estFields[0], 'id');
const custFields = exportableFields('Customer');
assert.ok(custFields.includes('estimator_creation_key'), 'customer creation key survives');
assert.ok(custFields.includes('tax_id_number'), 'business PII stays in admin export');
assert.ok(new Set(estFields).size === estFields.length, 'no duplicate fields');

// schema pruning — allowlist fields missing from schema drop out (drift safety)
const pruned = exportableFields('CustomerContact', {
  properties: { first_name: {}, last_name: {}, creation_request_key: {} },
});
assert.deepEqual(pruned, ['id', 'created_date', 'updated_date', 'creation_request_key', 'first_name', 'last_name'],
  'system fields pass schema filter; missing allowlist fields pruned; allowlist order kept');

// registered entity + hostile schema → allowlist∩schema, secrets never arrive
const hostile = exportableFields('Payment', {
  properties: {
    amount: {}, method: {}, creation_request_key: {},
    api_key: {}, password_hash: {}, secret_token: {},
  },
});
assert.deepEqual(hostile, ['id', 'created_date', 'updated_date', 'creation_request_key', 'amount', 'method'],
  'allowlist∩schema in allowlist order; non-allowlisted names ignored');

// unregistered entity → schema order, heuristic filtered
const unknown = exportableFields('Widget', {
  properties: { widget_name: {}, api_secret: {}, notes: {} },
});
assert.deepEqual(unknown, ['widget_name', 'notes'], 'unregistered entity exports schema minus secrets');

// entity denylist beats the schema
const denied = exportableFields('AuthorizedEmail', {
  properties: { email: {}, password_hash: {}, session_not_before: {}, role: {} },
});
assert.deepEqual(denied, ['email', 'role'], 'FIELD_DENYLIST strips named secrets');

// fail-closed: unknown entity + no schema → []
assert.deepEqual(exportableFields('Widget'), []);
assert.deepEqual(exportableFields(''), []);

// entity_json as a JSON string is accepted
const viaString = exportableFields('Widget2', JSON.stringify({ properties: { a: {}, token_x: {} } }));
assert.deepEqual(viaString, ['a']);

// --- rowsToCsv ---------------------------------------------------------------
const csv = rowsToCsv(
  [
    {
      id: 'e1', project_name: 'Lobby "Glow" Sign, Phase 1',
      notes: 'line one\nline two', total: 1234.5, rush: true, empty: null,
      tags: ['pylon', 'rebrand'],
      line_items: [{ line_id: 'l1', qty: 2 }],
      missing: undefined,
    },
    { id: 'e2', project_name: 'plain', notes: '', total: 0, rush: false, tags: [], line_items: [] },
  ],
  ['id', 'project_name', 'notes', 'total', 'rush', 'empty', 'tags', 'line_items', 'missing'],
);
const lines = csv.split('\r\n');
assert.equal(lines.length, 3, 'header + 2 rows');
assert.equal(lines[0], 'id,project_name,notes,total,rush,empty,tags,line_items,missing');
assert.ok(lines[1].startsWith('e1,"Lobby ""Glow"" Sign, Phase 1","line one\nline two",1234.5,true,,'),
  'quotes doubled, comma forces quoting, embedded newline quoted');
assert.ok(lines[1].includes('pylon; rebrand'), 'scalar array joins with ; ');
assert.ok(lines[1].includes('[{""line_id"":""l1"",""qty"":2}]'), 'object array → JSON string (quoted)');
assert.equal(lines[2], 'e2,plain,,0,false,,,,', 'empties + empty arrays serialize empty');
assert.ok(!csv.endsWith('\r\n'), 'no trailing newline');

// field inference when `fields` omitted
const inferred = rowsToCsv([{ b: 1, a: 'x' }, { a: 'y', c: true }]);
assert.equal(inferred.split('\r\n')[0], 'b,a,c', 'union of row keys, first-seen order');
assert.equal(rowsToCsv([], ['a', 'b']), 'a,b', 'header only for empty rows');

// csvCellText unit edges
assert.equal(csvCellText(null), '');
assert.equal(csvCellText({ a: 1 }), '{"a":1}');
assert.equal(csvCellText(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
assert.equal(csvCellText(NaN), '');

// --- manifest ----------------------------------------------------------------
const manifest = exportManifest(
  [
    { key: 'estimates', entity: 'AllInOneEstimate', row_count: 42, fields: exportableFields('AllInOneEstimate') },
    { dataset: datasetFor('payments'), rows: [{ id: 'p1' }, { id: 'p2' }] },
    { entity: 'Widget', row_count: 3 },
  ],
  { actor_id: 'admin@ccs.com', now: '2026-11-03T12:00:00Z', rand: 'abc123' },
);
assert.equal(manifest.export_key, 'export:1793707200000:abc123', 'export:<epoch-ms>:<rand>');
assert.equal(manifest.requested_by, 'admin@ccs.com');
assert.equal(manifest.requested_at, '2026-11-03T12:00:00.000Z');
assert.equal(manifest.format, 'csv');
assert.equal(manifest.dataset_count, 3);
assert.equal(manifest.row_total, 47, 'row_total sums datasets');
assert.equal(manifest.datasets[1].key, 'payments');
assert.equal(manifest.datasets[1].row_count, 2, 'row count derives from rows array');
assert.equal(manifest.datasets[1].fields_count, datasetFor('payments').fields.length,
  'registry fields fill in for dataset entries');
assert.match(manifest.datasets[0].sha_hint, /^[0-9a-f]{8}$/, 'sha_hint is 8-hex');
// deterministic hint, changes with content
const m2 = exportManifest([{ key: 'estimates', entity: 'AllInOneEstimate', row_count: 42, fields: exportableFields('AllInOneEstimate') }], { now: '2026-11-03T12:00:00Z', rand: 'x' });
const m3 = exportManifest([{ key: 'estimates', entity: 'AllInOneEstimate', row_count: 43, fields: exportableFields('AllInOneEstimate') }], { now: '2026-11-03T12:00:00Z', rand: 'x' });
assert.equal(m2.datasets[0].sha_hint, manifest.datasets[0].sha_hint, 'same content → same hint');
assert.notEqual(m2.datasets[0].sha_hint, m3.datasets[0].sha_hint, 'row count changes hint');
assert.equal(shaHint('abc'), shaHint('abc'));
assert.notEqual(shaHint('abc'), shaHint('abd'));
// export_key differs across invocations without injected rand
const r1 = exportManifest([], {}).export_key;
const r2 = exportManifest([], {}).export_key;
assert.match(r1, /^export:\d+:[a-z0-9]{2,}$/, 'export_key carries random suffix');
assert.match(r2, /^export:\d+:[a-z0-9]{2,}$/);
assert.equal(manifest.datasets[2].key, 'widget', 'unregistered entity falls back to lowercased name');

// --- audit event --------------------------------------------------------------
const event = exportAuditEvent(manifest, { actor_id: 'admin@ccs.com', now: '2026-11-03T12:00:00Z' });
assert.equal(event.action, 'data_export');
assert.equal(event.actor_email, 'admin@ccs.com');
assert.equal(event.target_email, '');
assert.equal(event.at, '2026-11-03T12:00:00.000Z');
const detail = JSON.parse(event.detail);
assert.equal(detail.event, 'data_export');
assert.equal(detail.export_key, 'export:1793707200000:abc123');
assert.equal(detail.dataset_count, 3);
assert.equal(detail.row_total, 47);
assert.equal(detail.datasets.length, 3);
assert.deepEqual(Object.keys(detail.datasets[0]).sort(), ['entity', 'fields_count', 'key', 'row_count', 'sha_hint']);
// falls back to manifest.requested_by + recomputes counts
const ev2 = exportAuditEvent({ requested_by: 'sys@ccs.com', datasets: [{ key: 'x', entity: 'Y', row_count: 5 }] }, { now: '2026-11-03T12:00:00Z' });
assert.equal(ev2.actor_email, 'sys@ccs.com');
assert.equal(JSON.parse(ev2.detail).row_total, 5);

rmSync(out, { force: true });
console.log('PASS data-export');
