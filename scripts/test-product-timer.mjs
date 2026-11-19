// B-09 contract test: WorkOrderTimeEntry entity shape, idempotent timer
// start/stop payloads, running-entry detection, per-product/per-user/
// per-department rollups, and the products[] time-field sync. Pure model —
// esbuild-bundled under Node. Run: node scripts/test-product-timer.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

buildSync({
  entryPoints: [resolve(root, 'src/components/jobs/productTimerModel.js')],
  bundle: true, format: 'esm',
  outdir: resolve(here, '.tmp-timer-out'), logLevel: 'silent',
});
const timer = await import(pathToFileURL(resolve(here, '.tmp-timer-out/productTimerModel.js')).href);
const {
  TIME_ENTRY_DEPARTMENTS, TIME_ENTRY_SOURCES, TIME_ENTRY_STATUSES,
  DEPARTMENT_TIME_FIELD, DEFAULT_DEPARTMENT,
  isRunning, openEntryFor, openEntriesForUser,
  startRequestKey, startPayload, stopPayload, elapsedSeconds,
  summarizeProductTime, syncProductTimeFields,
  formatDuration, labelForProduct, departmentForProduct, normalizeDepartment,
} = timer;

// === Entity shape (CrmEventType/ProductActivity conventions) =================
const entity = JSON.parse(
  readFileSync(resolve(root, 'base44/entities/WorkOrderTimeEntry.jsonc'), 'utf8'),
);
assert.equal(entity.name, 'WorkOrderTimeEntry');
assert.equal(entity.type, 'object');
for (const f of [
  'work_order_id', 'product_id', 'user_email', 'department', 'started_at',
  'stopped_at', 'duration_seconds', 'source', 'note', 'status',
  'schema_version', 'creation_request_key',
]) {
  assert.ok(entity.properties[f], `entity missing ${f}`);
}
assert.deepEqual(entity.properties.department.enum, [...TIME_ENTRY_DEPARTMENTS],
  'entity department enum matches model vocabulary');
assert.deepEqual(entity.properties.department.enum,
  ['design', 'production', 'fabrication', 'installation']);
assert.deepEqual(entity.properties.source.enum, [...TIME_ENTRY_SOURCES]);
assert.deepEqual(entity.properties.status.enum, [...TIME_ENTRY_STATUSES]);
assert.equal(entity.properties.duration_seconds.type, 'number');
assert.equal(entity.properties.started_at.type, 'string');
assert.equal(entity.properties.stopped_at.type, 'string');
assert.equal(entity.properties.user_email.type, 'string');
for (const f of ['work_order_id', 'product_id', 'user_email', 'department', 'started_at']) {
  assert.ok(entity.required.includes(f), `required ${f}`);
}
for (const op of ['create', 'read', 'update', 'delete']) {
  assert.match(entity.rls[op].user_condition.role, /backend_only/, `rls ${op} backend-only`);
}

// === Fixtures ================================================================
const NOW = '2026-11-02T07:19:35.000Z';
const entries = [
  { id: 'e1', work_order_id: 'wo-1', product_id: 'prod-1', user_email: 'amy@shop.com',
    department: 'design', started_at: '2026-11-01T09:00:00Z', stopped_at: '2026-11-01T10:00:00Z',
    duration_seconds: 3600, source: 'timer', status: 'active' },
  { id: 'e2', work_order_id: 'wo-1', product_id: 'prod-1', user_email: 'bob@shop.com',
    department: 'production', started_at: '2026-11-01T10:00:00Z', stopped_at: '2026-11-01T10:30:00Z',
    duration_seconds: 1800, source: 'timer', status: 'active' },
  { id: 'e3', work_order_id: 'wo-1', product_id: 'prod-1', user_email: 'amy@shop.com',
    department: 'fabrication', started_at: '2026-11-01T11:00:00Z', stopped_at: '2026-11-01T11:15:00Z',
    duration_seconds: 900, source: 'manual', status: 'active' },
  { id: 'e4', work_order_id: 'wo-1', product_id: 'prod-2', user_email: 'amy@shop.com',
    department: 'design', started_at: '2026-11-01T12:00:00Z', stopped_at: '2026-11-01T12:10:00Z',
    duration_seconds: 600, source: 'timer', status: 'active' },
  { id: 'e5', work_order_id: 'wo-1', product_id: 'prod-1', user_email: 'amy@shop.com',
    department: 'installation', started_at: '2026-11-01T13:00:00Z', stopped_at: '2026-11-01T13:20:00Z',
    duration_seconds: 1200, source: 'timer', status: 'voided' },
  { id: 'e6', work_order_id: 'wo-1', product_id: 'prod-1', user_email: 'bob@shop.com',
    department: 'production', started_at: '2026-11-02T07:00:00Z', stopped_at: '',
    duration_seconds: 0, source: 'timer', status: 'active' },
  { id: 'e7', work_order_id: 'wo-1', product_id: 'prod-3', user_email: 'bob@shop.com',
    department: 'installation', started_at: '2026-11-02T06:00:00Z', stopped_at: '',
    duration_seconds: 0, source: 'timer', status: 'active' },
];

// === isRunning / openEntryFor / openEntriesForUser ============================
assert.equal(isRunning(entries[5]), true, 'active + started + empty stopped_at is running');
assert.equal(isRunning(entries[0]), false, 'stopped row is not running');
assert.equal(isRunning(entries[4]), false, 'voided row is never running');
assert.equal(isRunning({ status: 'active', started_at: '', stopped_at: '' }), false, 'no start = not running');
assert.equal(isRunning(null), false);
assert.equal(isRunning({ started_at: NOW }), true, 'missing status counts as active');

assert.equal(openEntryFor('bob@shop.com', 'prod-1', entries)?.id, 'e6', 'finds the running row');
assert.equal(openEntryFor('BOB@Shop.com', 'prod-1', entries)?.id, 'e6', 'email match is case-insensitive');
assert.equal(openEntryFor({ email: 'bob@shop.com' }, 'prod-1', entries)?.id, 'e6', 'accepts a user object');
assert.equal(openEntryFor('amy@shop.com', 'prod-1', entries), null, 'no running row for amy on prod-1');
assert.equal(openEntryFor('bob@shop.com', 'prod-2', entries), null, 'running row is on another product');
assert.equal(openEntryFor('', 'prod-1', entries), null, 'blank user yields null');
assert.equal(openEntryFor('bob@shop.com', '', entries), null, 'blank product yields null');

assert.deepEqual(openEntriesForUser('bob@shop.com', entries).map((e) => e.id).sort(), ['e6', 'e7'],
  'all running rows for the user, any product');
assert.deepEqual(openEntriesForUser('nobody@shop.com', entries), []);

// === Idempotent startRequestKey ==============================================
const keyInput = { workOrderId: 'wo-1', productId: 'prod-1', userEmail: 'amy@shop.com', now: NOW };
assert.equal(startRequestKey(keyInput), 'wo-1:prod-1:amy@shop.com:202611020719',
  'key = ${wo}:${prod}:${user}:${yyyymmddhhmm}');
assert.equal(startRequestKey(keyInput), startRequestKey({ ...keyInput }),
  'same inputs → same key (double-click dedupes)');
assert.equal(
  startRequestKey({ ...keyInput, now: '2026-11-02T07:19:59.000Z' }),
  'wo-1:prod-1:amy@shop.com:202611020719',
  'same minute → same bucket (lost-create retry is safe)',
);
assert.notEqual(
  startRequestKey({ ...keyInput, now: '2026-11-02T07:20:00.000Z' }),
  startRequestKey(keyInput),
  'next minute → new bucket (a deliberate re-start can create)',
);
assert.equal(
  startRequestKey({ ...keyInput, userEmail: 'Amy@Shop.com' }),
  'wo-1:prod-1:amy@shop.com:202611020719',
  'email lowercased in the key',
);

// === startPayload =============================================================
const sp = startPayload({ workOrderId: 'wo-1', productId: 'prod-1', userEmail: 'Amy@Shop.com', department: 'design', now: NOW });
assert.equal(sp.schema_version, 1);
assert.equal(sp.creation_request_key, 'wo-1:prod-1:amy@shop.com:202611020719');
assert.equal(sp.work_order_id, 'wo-1');
assert.equal(sp.product_id, 'prod-1');
assert.equal(sp.user_email, 'amy@shop.com', 'user_email normalized lowercase');
assert.equal(sp.department, 'design');
assert.equal(sp.started_at, NOW);
assert.equal(sp.stopped_at, '', 'starts running — empty stopped_at');
assert.equal(sp.duration_seconds, 0);
assert.equal(sp.source, 'timer', 'default source is timer');
assert.equal(sp.status, 'active');
assert.equal(sp.note, '');
assert.equal(startPayload({ ...keyInput, department: 'bogus' }).department, DEFAULT_DEPARTMENT,
  'unknown department normalizes to the default bucket');
assert.equal(startPayload({ ...keyInput, department: 'DESIGN' }).department, 'design');
assert.equal(startPayload({ ...keyInput, source: 'manual' }).source, 'manual');
assert.equal(startPayload({ ...keyInput, source: 'bogus' }).source, 'timer');

// === stopPayload / elapsedSeconds =============================================
{
  const p = stopPayload(
    { started_at: '2026-11-02T06:17:20.000Z' },
    '2026-11-02T07:19:35.000Z',
  );
  assert.equal(p.stopped_at, '2026-11-02T07:19:35.000Z');
  assert.equal(p.duration_seconds, 3735, '1h 2m 15s elapsed');
  assert.deepEqual(Object.keys(p).sort(), ['duration_seconds', 'stopped_at'],
    'stop payload carries only the two stamped fields');
}
assert.equal(stopPayload({ started_at: '2026-11-02T08:00:00Z' }, '2026-11-02T07:00:00Z').duration_seconds, 0,
  'negative drift clamps to 0');
assert.equal(stopPayload({ started_at: 'bogus' }, NOW).duration_seconds, 0,
  'unparseable start stops cleanly at 0');
assert.equal(elapsedSeconds(entries[0]), 3600, 'stopped row reports stored duration');
assert.equal(elapsedSeconds({ started_at: '2026-11-01T09:00:00Z', stopped_at: '2026-11-01T10:00:00Z', status: 'active' }), 3600,
  'stopped row without stored duration recomputes');
assert.equal(elapsedSeconds(entries[5], NOW), 1175, 'running row measures against now');
assert.equal(elapsedSeconds(entries[5]), 0, 'running row without now reports stored duration');

// === summarizeProductTime =====================================================
const all = summarizeProductTime(entries, { now: NOW });
assert.equal(all.total_seconds, 12850, 'prod-1 7475 + prod-2 600 + prod-3 4775 running');
assert.equal(all.entry_count, 6, 'voided row excluded from the count');
assert.equal(all.running_count, 2);
assert.equal(all.running_seconds, 5950, '1175 (prod-1) + 4775 (prod-3) live elapsed');
assert.equal(all.by_product['prod-1'], 7475);
assert.equal(all.by_product['prod-2'], 600);
assert.equal(all.by_product['prod-3'], 4775);
assert.equal(all.by_user['amy@shop.com'], 5100, '3600 + 900 + 600 — voided install excluded');
assert.equal(all.by_user['bob@shop.com'], 7750, '1800 + 1175 + 4775');
assert.deepEqual(all.by_department, {
  design: 4200, production: 2975, fabrication: 900, installation: 4775,
}, 'per-department rollup — voided install excluded, running install counted');

const noNow = summarizeProductTime(entries);
assert.equal(noNow.by_product['prod-1'], 6300, 'running rows contribute 0 without now');
assert.equal(noNow.running_count, 2, 'running rows still counted as open sessions');

const prodOnly = summarizeProductTime(entries.filter((e) => e.product_id === 'prod-1'), { now: NOW });
assert.equal(prodOnly.total_seconds, 7475);
assert.equal(prodOnly.by_department.installation, 0, 'all four enum keys present even at 0');
assert.deepEqual(summarizeProductTime([]).by_department, {
  design: 0, production: 0, fabrication: 0, installation: 0,
});
assert.deepEqual(summarizeProductTime(null).by_product, {});

// === syncProductTimeFields (A-17 products[] patch) =============================
const syncNow = syncProductTimeFields({ id: 'prod-1' }, entries, { now: NOW });
assert.deepEqual(syncNow, { design_time_seconds: 3600, production_time_seconds: 3875 },
  'design→design_time_seconds; production+fabrication+installation→production_time_seconds');
assert.deepEqual(Object.keys(syncNow).sort(), ['design_time_seconds', 'production_time_seconds'],
  'patch carries exactly the two A-17 fields');
const syncIdle = syncProductTimeFields({ id: 'prod-1' }, entries);
assert.deepEqual(syncIdle, { design_time_seconds: 3600, production_time_seconds: 2700 },
  'without now the running session is not yet banked');
assert.deepEqual(syncProductTimeFields('prod-2', entries, { now: NOW }),
  { design_time_seconds: 600, production_time_seconds: 0 },
  'accepts a bare product id; other products excluded');
assert.deepEqual(syncProductTimeFields({ id: 'prod-9' }, entries, { now: NOW }),
  { design_time_seconds: 0, production_time_seconds: 0 }, 'no rows → zeroed patch, not nulls');
assert.deepEqual(syncProductTimeFields(null, entries), { design_time_seconds: 0, production_time_seconds: 0 });
assert.deepEqual(DEPARTMENT_TIME_FIELD, {
  design: 'design_time_seconds',
  production: 'production_time_seconds',
  fabrication: 'production_time_seconds',
  installation: 'production_time_seconds',
});

// === Display helpers ===========================================================
assert.equal(formatDuration(0), '0:00:00');
assert.equal(formatDuration(65), '0:01:05');
assert.equal(formatDuration(3735), '1:02:15');
assert.equal(formatDuration(97200), '27:00:00', 'hours stay unpadded');
assert.equal(departmentForProduct({ responsibility: 'Fabrication' }), 'fabrication');
assert.equal(departmentForProduct({ department: 'design', responsibility: 'production' }), 'design',
  'explicit department wins over responsibility');
assert.equal(departmentForProduct({}), DEFAULT_DEPARTMENT);
assert.equal(normalizeDepartment('Installation'), 'installation');
assert.equal(normalizeDepartment('bogus'), DEFAULT_DEPARTMENT);
assert.equal(labelForProduct({ description: 'Channel Letters' }), 'Channel Letters');
assert.equal(labelForProduct({ id: 'prod-7' }), 'prod-7', 'falls back to the id on sparse rows');

rmSync(resolve(here, '.tmp-timer-out'), { recursive: true, force: true });
console.log('PASS product-timer');
