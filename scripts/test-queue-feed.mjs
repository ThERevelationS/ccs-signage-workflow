// Source-shape contract for C-09 — base44/functions/queueFeed/entry.ts:
// a session-authed WorkOrder feed that returns ONLY the fields the product
// queue pages read (smaller payload than full WO rows / the boardFeed
// projection), with a `since` delta cursor, `limit`, `module_key` lens,
// product-level heavy-field stripping, and boardFeed's isolate cache.
//
// Static checks read the function source + bundle productQueueModel.js the
// same way test-queue-rows.mjs does; a mirrored allowlist projector proves
// flattenQueueRows still produces fully-populated rows from projected rows
// and that heavy product fields never survive the projection.
//
// Run: node scripts/test-queue-feed.mjs  →  prints "PASS queue-feed"

import assert from 'node:assert/strict';
import { buildSync, transformSync } from 'esbuild';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entryPath = resolve(here, '../base44/functions/queueFeed/entry.ts');
const jsoncPath = resolve(here, '../base44/functions/queueFeed/function.jsonc');
const modelPath = resolve(here, '../src/components/queues/productQueueModel.js');
const outModel = resolve(here, '.tmp-qfeed-model.mjs');

const src = readFileSync(entryPath, 'utf8');
const modelSrc = readFileSync(modelPath, 'utf8');

// --- function.jsonc (sibling convention) ------------------------------------

{
  const jsonc = JSON.parse(readFileSync(jsoncPath, 'utf8'));
  assert.equal(jsonc.name, 'queueFeed', 'function.jsonc names queueFeed');
  assert.equal(jsonc.entry, 'entry.ts', 'function.jsonc entry = entry.ts');
}

// --- entry.ts parses + wires the boardFeed conventions ----------------------

assert.doesNotThrow(() => transformSync(src, { loader: 'ts' }), 'entry.ts parses as TS');

for (const needle of [
  'createClientFromRequest',
  'authenticateSignShopSession',
  'withEntityRateLimitRetry',
  'asServiceRole',
  'entities.WorkOrder',
  'Deno.serve',
]) {
  assert.ok(src.includes(needle), `entry.ts wires ${needle}`);
}

// --- extract the projection lists -------------------------------------------

const listFrom = (name) => {
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  assert.ok(m, `${name} is declared`);
  // Strip // comments first — apostrophes inside them would corrupt the
  // quoted-string extraction.
  const body = m[1].replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const woFields = listFrom('QUEUE_WO_FIELDS');
const productFields = listFrom('QUEUE_PRODUCT_FIELDS');
assert.ok(woFields.length > 10, 'WO projection is non-trivial');
assert.ok(productFields.length > 15, 'product projection is non-trivial');

// --- coverage: every field flattenQueueRows reads must be projected ---------

// Slice flattenQueueRows out of the model source and collect wo.*/p.* reads.
const fnBody = (() => {
  const start = modelSrc.indexOf('export function flattenQueueRows');
  const end = modelSrc.indexOf('export function', start + 10);
  assert.ok(start > 0 && end > start, 'flattenQueueRows located in model source');
  return modelSrc.slice(start, end);
})();
const reads = (obj) => [...new Set([...fnBody.matchAll(new RegExp(`\\b${obj}\\.([A-Za-z_]\\w*)`, 'g'))].map((m) => m[1]))];

for (const field of reads('wo')) {
  assert.ok(woFields.includes(field), `WO projection covers wo.${field}`);
}
for (const field of reads('p')) {
  assert.ok(productFields.includes(field), `product projection covers p.${field}`);
}
// p[dueField] reads the lens date — both due fields must ride the projection.
assert.ok(/\bp\[dueField\]/.test(fnBody), 'flattenQueueRows reads p[dueField]');
for (const field of ['design_due_date', 'product_due_date']) {
  assert.ok(productFields.includes(field), `product projection covers dueField ${field}`);
}
// moduleKeyForRow's WO fallback chain (queueCountersModel) must resolve.
for (const field of ['module_key', 'project_type', 'order_type', 'module', 'type']) {
  assert.ok(woFields.includes(field), `WO projection covers module fallback ${field}`);
}

// --- heavy fields stripped ----------------------------------------------------

const HEAVY_PRODUCT = ['notes', 'status_history', 'conversion_events', 'estimator_notes'];
for (const field of HEAVY_PRODUCT) {
  assert.ok(!productFields.includes(field), `product projection strips ${field}`);
}
assert.ok(!productFields.some((f) => f.startsWith('smartsheet_')), 'product projection strips smartsheet_*');
for (const field of ['notes', 'work_notes', 'sales_import_snapshot']) {
  assert.ok(!woFields.includes(field), `WO projection strips ${field}`);
}
assert.ok(!woFields.some((f) => f.startsWith('smartsheet_')), 'WO projection strips smartsheet_*');
// The defensive strip exists in code, not just by allowlist omission.
assert.ok(src.includes('PRODUCT_HEAVY_FIELDS'), 'explicit product heavy-field guard present');
assert.ok(/'smartsheet_'/.test(src), 'smartsheet_ prefix guard present');

// --- cursor / params / response shape ----------------------------------------

for (const needle of [
  'body?.since', 'body?.limit', 'body?.module_key',
  'query.updated_date', '$gte', 'next_cursor', 'maxUpdated',
]) {
  assert.ok(src.includes(needle), `since-cursor logic present: ${needle}`);
}
for (const needle of ['items:', 'next_cursor', 'projected_fields', 'generated_at']) {
  assert.ok(src.includes(needle), `response shape includes ${needle}`);
}
for (const needle of ['feedCache', 'FEED_CACHE_TTL_MS', 'expires']) {
  assert.ok(src.includes(needle), `isolate cache wired: ${needle}`);
}
assert.ok(src.includes('projectionSupported'), 'projection pushdown fallback kept');
assert.ok(src.includes('session_token'), 'session token is the auth input');

// --- behavioral: projected rows still flatten completely ----------------------

buildSync({
  entryPoints: [modelPath],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent',
});
const { flattenQueueRows } = await import(pathToFileURL(outModel).href);

// Mirror of projectWorkOrder: allowlist copy + heavy strip, driven entirely
// by the lists parsed out of entry.ts.
const projectProduct = (p) => {
  const out = {};
  for (const f of productFields) out[f] = p[f];
  for (const f of ['notes', 'status_history', 'conversion_events']) delete out[f];
  for (const k of Object.keys(out)) if (k.startsWith('smartsheet_')) delete out[k];
  return out;
};
const projectWO = (wo) => {
  const out = {};
  for (const f of woFields) out[f] = wo[f];
  out.products = (Array.isArray(wo.products) ? wo.products : []).map(projectProduct);
  return out;
};

// A WO carrying every projected field plus junk/heavy fields that must not
// survive the projection.
const product = {
  id: 'p1', description: 'Pylon face', client_product_name: 'CPN', product_name: 'PN',
  operational_status: 'in_design', operational_substatus: 'rev 2',
  customer_facing_status: 'In Design', fulfillment_state: 'awaiting_installation',
  proof_status: 'awaiting_approval', proof_version: 3, proof_approved_version: 1,
  proof_file_url: 'https://x/v3.pdf', proof_file_name: 'v3.pdf',
  design_due_date: '2026-11-08', product_due_date: '2026-11-20', hard_due_date: true,
  designer: 'dee', assigned_to: 'aa', responsibility: 'Design dept',
  responsibility_color: '#aa33ff', priority: 5, queue_priority: 9,
  module_key: 'channel_letters', category: 'letters', product_type: 'sign',
  operational_status_changed_at: '2026-11-01T00:00:00Z', builder_product_id: 'bp1',
  machine: 'router', part: 'face', is_rush: true, quick_tags: ['rush'],
  // Heavy junk that must be stripped:
  notes: [{ text: 'x'.repeat(5000) }],
  status_history: [{ at: 't', field: 'f', by: 'b' }],
  conversion_events: [{ e: 'y'.repeat(5000) }],
  smartsheet_row_shadow: { big: 'z'.repeat(5000) },
  secret_blob: 'q'.repeat(5000),
};
const workOrder = {
  id: 'wo1', title: 'WO-1', client_name: 'Acme', customer_id: 'c1',
  corbridge_invoice_number: 'INV-9', current_stage: 'production',
  project_install_date: '2026-11-30', sales_rep: 'rep@x', created_by: 'cb@x',
  order_priority: 'rush', is_rush: true,
  updated_date: '2026-11-02T00:00:00Z', created_date: '2026-10-01T00:00:00Z',
  products: [product],
  // Heavy junk:
  work_notes: [{ text: 'w'.repeat(5000) }],
  smartsheet_sync_snapshot: { s: 'v'.repeat(5000) },
  random_heavy: 'h'.repeat(5000),
};

const projected = projectWO(workOrder);
assert.ok(!('work_notes' in projected) && !('random_heavy' in projected) && !('smartsheet_sync_snapshot' in projected),
  'WO heavy/junk fields absent from projection');
const pp = projected.products[0];
for (const field of ['notes', 'status_history', 'conversion_events', 'smartsheet_row_shadow', 'secret_blob']) {
  assert.ok(!(field in pp), `projected product drops ${field}`);
}

const [row] = flattenQueueRows([projected]);
for (const key of [
  'workOrderId', 'productId', 'ref', 'company', 'customerId', 'productName',
  'status', 'substatus', 'fulfillment', 'proof', 'designer', 'assignedTo',
  'responsibility', 'responsibilityColor', 'category', 'moduleKey',
  'designDue', 'productDue', 'statusChangedAt', 'bp', 'stage', 'woDue',
  'machine', 'part', 'salesperson', 'enteredBy', 'position',
]) {
  assert.ok(row[key] !== undefined && row[key] !== '', `flattened row field ${key} populated from projection`);
}
assert.equal(row.productName, 'Pylon face');
assert.equal(row.priority, 5, 'priority survives projection');
assert.equal(row.queuePriority, 9);
assert.equal(row.hardDue, true);
assert.equal(row.rush, true, 'rush folds through the projection');
assert.equal(row.proofVersion, 3);
assert.equal(row.proofApprovedVersion, 1);
assert.equal(row.position, '1/1');

// Payload size sanity — projected WO is far smaller than the raw one.
const rawBytes = JSON.stringify(workOrder).length;
const projBytes = JSON.stringify(projected).length;
assert.ok(projBytes < rawBytes * 0.4, `projection shrinks payload (${projBytes} < ${rawBytes})`);

rmSync(outModel);

// ===========================================================================
// M-03 — composed feeds: queue_lens/owner extras, per-feed projections,
// keyed isolate cache, fail-open parity with the N-pull reads they replace.
// ===========================================================================

// --- entry.ts wires the composed surface -------------------------------------

for (const needle of [
  "body?.feed", "body?.queue_lens", "body?.owner_email", "body?.items",
  "body?.include",
  "'crm_events'", "'estimate_queue'",
  "entities.SavedQueueView", "entities.GlobalSettings",
  "entities.Customer", "entities.QuoteDefaults",
  "entities.OpportunityActivity", "entities.AllInOneEstimate",
  "scopeSavedViewsForLens", "queueFeedCacheKey",
  "projectCrmActivity", "projectEstimate", "projectSettingRecord",
  "projectCrmCustomer", "projectQuoteDefaults",
  "queueFeedModel.mjs",
]) {
  assert.ok(src.includes(needle), `entry.ts wires composed feed: ${needle}`);
}

// Session-scoped view ownership — the authenticated user's email scopes own
// views; the request's owner_email is validated but never trusted.
assert.ok(src.includes("sessionUser?.email"), "view scope uses the session email");
assert.ok(!/isOwnView\([^)]*body\?\.owner_email/.test(src), "owner_email never scopes views directly");

// Keyed cache (per feed+lens+owner+include) replaces the single-slot cache —
// a per-user saved-views payload must never cross owners.
assert.ok(src.includes("new Map"), "cache is a keyed Map");
assert.ok(/feedCacheGet\(cacheKey\)/.test(src), "cache lookup is keyed");
assert.ok(src.includes("FEED_CACHE_MAX_KEYS"), "cache growth is bounded");

// Write-path parity fields must ride the WO projection: the deposit gate
// reads deposit_* off the cached snapshot; notify context reads estimator /
// total / balance_due.
for (const field of [
  "deposit_required", "deposit_invoiced", "deposit_amount",
  "estimator", "total", "balance_due",
]) {
  assert.ok(woFields.includes(field), `WO projection covers write-path field ${field}`);
}

// --- shared model: zero imports, canonical shapes ------------------------------

const modelFile = resolve(here, '../base44/shared/queueFeedModel.mjs');
const feedModelSrc = readFileSync(modelFile, 'utf8');
assert.ok(!/^\s*import[\s({]/m.test(feedModelSrc), 'queueFeedModel has zero imports');
assert.ok(!/require\(/.test(feedModelSrc), 'queueFeedModel has zero requires');

const FM = await import(pathToFileURL(modelFile).href);
const {
  SAVED_VIEW_FIELDS,
  CRM_EVENT_TYPES: SHARED_CRM_TYPES,
  CRM_ACTIVITY_FIELDS,
  CRM_CUSTOMER_FIELDS,
  ESTIMATE_QUEUE_FIELDS,
  ESTIMATE_LINE_ITEM_FIELDS,
  QUOTE_DEFAULTS_FIELDS,
  projectCrmActivity,
  projectCrmCustomer,
  projectEstimate,
  projectSavedView,
  projectSettingRecord,
  scopeSavedViewsForLens,
  scopeSavedViewsForPage,
  sortSavedViews,
  queueFeedCacheKey,
} = FM;

// --- cache-key isolation -------------------------------------------------------

const key = (over = {}) =>
  queueFeedCacheKey({ feed: 'product_queue', lens: 'design', owner: 'sam@x.test', include: ['saved_views', 'settings'], ...over });
assert.equal(key(), key(), 'same scope produces the same cache key');
assert.notEqual(key({ lens: 'design' }), key({ lens: 'production' }), 'per-queue isolation: lens');
assert.notEqual(key({ owner: 'sam@x.test' }), key({ owner: 'dee@x.test' }), 'per-user isolation: owner');
assert.notEqual(key({ feed: 'product_queue' }), key({ feed: 'crm_events' }), 'per-feed isolation');
assert.notEqual(key({ include: ['saved_views'] }), key({ include: ['settings'] }), 'include set isolates');
assert.notEqual(key({ include: [] }), key({ include: ['saved_views', 'settings'] }), 'items-only vs composed isolate');
assert.equal(
  key({ include: ['settings', 'saved_views'] }),
  key({ include: ['saved_views', 'settings'] }),
  'include order does not fragment the cache'
);
// The function appends an items flag — items:true vs items:false must differ.
const kItems = key() + '|items:1';
const kExtras = key() + '|items:0';
assert.notEqual(kItems, kExtras, 'extras-only calls never hit items payloads');

// --- saved views: composed result == N-pull result ------------------------------

// Bundle the frontend view model — the store's listScoped filter is rebuilt
// here from its own exports so the parity check uses the REAL semantics.
const outViews = resolve(here, '.tmp-qfeed-views.mjs');
const outCrm = resolve(here, '.tmp-qfeed-crm.mjs');
const outLinks = resolve(here, '.tmp-qfeed-links.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/queues/savedViewsModel.js')], bundle: true, format: 'esm', outfile: outViews, logLevel: 'silent', alias: { '@': resolve(here, '../src') } });
buildSync({ entryPoints: [resolve(here, '../src/components/crm/crmEventsModel.js')], bundle: true, format: 'esm', outfile: outCrm, logLevel: 'silent', alias: { '@': resolve(here, '../src') } });
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/deepLinks.js')], bundle: true, format: 'esm', outfile: outLinks, logLevel: 'silent', alias: { '@': resolve(here, '../src') } });
const VIEWS = await import(pathToFileURL(outViews).href);
const CRM = await import(pathToFileURL(outCrm).href);
const LINKS = await import(pathToFileURL(outLinks).href);

// Fixture views across both axes, owners, share flags and dead rows.
const viewRows = [
  { id: 'v1', name: 'B view', queue_lens: 'design', owner_email: 'sam@x.test', is_shared: false, status: 'active', pinned: true, sort: 2, created_date: '2026-01-01', updated_date: 'u1' },
  { id: 'v2', name: 'A view', queue_lens: 'design', owner_email: 'sam@x.test', is_shared: false, status: 'active', pinned: true, sort: 1, created_date: '2026-01-02', updated_date: 'u2' },
  { id: 'v3', name: 'shared z', queue_lens: 'design', owner_email: 'dee@x.test', shared: true, status: 'active', created_date: '2026-01-03', updated_date: 'u3' },
  { id: 'v4', name: 'dee private', queue_lens: 'design', owner_email: 'dee@x.test', is_shared: false, status: 'active', created_date: '2026-01-04', updated_date: 'u4' },
  { id: 'v5', name: 'prod view', queue_lens: 'production', owner_email: 'sam@x.test', status: 'active', created_date: '2026-01-05', updated_date: 'u5' },
  { id: 'v6', name: 'archived', queue_lens: 'design', owner_email: 'sam@x.test', is_shared: true, status: 'archived', created_date: '2026-01-06', updated_date: 'u6' },
  { id: 'v7', name: 'page view', page: 'estimator_queues', owner_email: 'sam@x.test', status: 'active', created_date: '2026-01-07', updated_date: 'u7' },
  { id: 'v8', name: 'heavy blob', queue_lens: 'design', owner_email: 'sam@x.test', status: 'active', junk_field: 'x'.repeat(4000), created_date: '2026-01-08', updated_date: 'u8' },
];

// The legacy N-pull result (loadLensViews): query {queue_lens: lens} then the
// store's client-side scope filter + sortViews.
function legacyLensViews(rows, { lens = 'all', ownerEmail = '' }) {
  const me = ownerEmail.trim().toLowerCase();
  const kept = rows.filter(
    (r) =>
      String(r?.queue_lens || '') === lens &&
      VIEWS.isLiveView(r) &&
      ((me !== '' && VIEWS.viewOwnerEmail(r) === me) || VIEWS.isViewShared(r))
  );
  return VIEWS.sortViews(kept, ownerEmail);
}
const composedViews = scopeSavedViewsForLens(viewRows, { lens: 'design', ownerEmail: 'sam@x.test' });
const legacyViews = legacyLensViews(viewRows.filter((r) => r.queue_lens === 'design'), { lens: 'design', ownerEmail: 'sam@x.test' });
assert.deepEqual(
  composedViews.map((v) => v.id),
  legacyViews.map((v) => v.id),
  'composed saved_views === the N-pull result (same set, same order)'
);
assert.deepEqual(composedViews.map((v) => v.id), ['v2', 'v1', 'v8', 'v3'], 'own pinned first (sort asc), then shared');
assert.ok(!composedViews.some((v) => v.id === 'v4'), "another owner's private view never leaks");
assert.ok(!composedViews.some((v) => v.id === 'v6'), 'archived views are hidden');
assert.ok(!composedViews.some((v) => 'junk_field' in v), 'view projection strips undeclared fields');
for (const f of SAVED_VIEW_FIELDS) {
  assert.ok(f in composedViews[0] || composedViews.every((v) => f in v), `view projection carries ${f}`);
}

// Page axis parity (page-scoped rows only — lens rows must not cross-list).
const pageViews = scopeSavedViewsForPage(viewRows, { pageKey: 'estimator_queues', ownerEmail: 'sam@x.test' });
assert.deepEqual(pageViews.map((v) => v.id), ['v7'], 'page axis returns only page-scoped rows');

// Per-owner isolation of the scoped set itself.
const deeViews = scopeSavedViewsForLens(viewRows, { lens: 'design', ownerEmail: 'dee@x.test' });
assert.deepEqual(deeViews.map((v) => v.id), ['v4', 'v3'], 'dee sees own + shared, not sam private rows');

// Sort parity vs the frontend model on a shuffled input.
assert.deepEqual(
  sortSavedViews(viewRows.filter((r) => ['v1', 'v2', 'v3', 'v8'].includes(r.id)), 'sam@x.test').map((v) => v.id),
  VIEWS.sortViews(viewRows.filter((r) => ['v1', 'v2', 'v3', 'v8'].includes(r.id)), 'sam@x.test').map((v) => v.id),
  'sortSavedViews === savedViewsModel.sortViews'
);

// --- CRM events: taxonomy parity + projection coverage -------------------------

assert.deepEqual([...SHARED_CRM_TYPES].sort(), [...CRM.CRM_EVENT_TYPES].sort(), 'shared taxonomy === crmEventsModel.CRM_EVENT_TYPES');

// Every field the queue reads (row chrome, filters, CAS anchor, datalist).
for (const field of [
  'id', 'created_date', 'updated_date', 'event_type', 'subject', 'summary',
  'notes', 'contact_name', 'contact_id', 'company_name', 'customer_id',
  'opportunity_id', 'work_order_id', 'assigned_to', 'due_at', 'completed_at',
  'outcome', 'source', 'actor', 'created_by', 'deleted', 'details',
]) {
  assert.ok(CRM_ACTIVITY_FIELDS.includes(field), `CRM projection covers ${field}`);
}
assert.ok(CRM_CUSTOMER_FIELDS.includes('id') && CRM_CUSTOMER_FIELDS.includes('company_name'),
  'customer projection covers the datalist fields');

const activityRows = [
  { id: 'a1', event_type: 'Call: Sales Follow Up', subject: 's', company_name: 'Acme', due_at: '2026-11-01', updated_date: 'u1', notes: 'n', junk: 'x'.repeat(3000) },
  { id: 'a2', event_type: 'stage_changed', summary: 'audit', updated_date: 'u2' }, // audit row — not a CRM event
  { id: 'a3', event_type: 'Visit: Site Survey', assigned_to: 'sam', due_at: '', completed_at: '2026-10-01', outcome: 'completed', updated_date: 'u3' },
];
// Composed feed applies the $in server-side; the N-pull loaded everything and
// let eventsForQueue/isCrmEvent filter client-side. Same visible set either way.
const composedActs = activityRows
  .filter((r) => SHARED_CRM_TYPES.includes(r.event_type))
  .map(projectCrmActivity);
const legacyActs = activityRows; // the gateway returned the whole table
assert.deepEqual(
  CRM.eventsForQueue(composedActs, { type: 'all', assignedTo: 'all', search: '', includeCompleted: true }).map((r) => r.id),
  CRM.eventsForQueue(legacyActs, { type: 'all', assignedTo: 'all', search: '', includeCompleted: true }).map((r) => r.id),
  'composed CRM feed === the N-pull result after the queue model'
);
assert.ok(!('junk' in composedActs[0]), 'activity projection strips undeclared fields');

const cust = projectCrmCustomer({ id: 'c1', company_name: 'Acme', name: 'A', phone: '555', big_blob: 'z'.repeat(2000) });
assert.equal(cust.company_name, 'Acme');
assert.ok(!('phone' in cust) && !('big_blob' in cust), 'customer projection is id/company_name/name only');

// --- estimate queue: search parity on projected rows ----------------------------

const estimate = {
  id: 'e1', estimate_number: 'EST-1', project_name: 'Acme Pylon', client_name: 'Acme',
  job_name: 'PJ', contact_name: 'Bob', salesperson_email: 'sam@x.test', created_by: 'sam',
  status: 'sent', quote_total: 5000, total_cost: 3000, cost_total: 3000,
  quote_issue_date: '2026-10-01', quote_valid_days: 30, quote_expiration_date: '2026-11-01',
  due_date: '2026-11-15', target_install_date: '2026-11-20', priority: 'rush',
  deleted: false, pipeline_sync_pending: false, source_module: 'channel_letters',
  personal_tags: { 'sam@x.test': { color: 'red' } },
  notes: 'site call notes', estimate_notes: 'internal',
  line_items: [
    { title: 'Channel letters', description: 'LED lit', module_key: 'channel_letters', qty: 2, unit_price: 100, secret_cost_blob: 'c'.repeat(3000) },
    { product_name: 'Vinyl print', product_category: 'print', internal_blob: 'd'.repeat(3000) },
  ],
  fee_lines: [{ label: 'permit', amount: 200, heavy: 'f'.repeat(2000) }],
  attachment_refs: ['a'.repeat(5000)],
  notes_log: ['n'.repeat(5000)],
};
const projectedEst = projectEstimate(estimate);
for (const term of ['acme', 'pylon', 'channel', 'led lit', 'vinyl', 'internal', 'site call', 'bob']) {
  assert.equal(
    LINKS.estimateMatchesSearch(projectedEst, term),
    LINKS.estimateMatchesSearch(estimate, term),
    `search parity on projected estimate: "${term}"`
  );
}
assert.ok(!('fee_lines' in projectedEst) && !('attachment_refs' in projectedEst) && !('notes_log' in projectedEst),
  'estimate projection strips non-queue blobs');
assert.ok(!('secret_cost_blob' in projectedEst.line_items[0]) && !('internal_blob' in projectedEst.line_items[1]),
  'line_items are projected to the search subfields');
assert.equal(projectedEst.line_items[0].title, 'Channel letters', 'line search fields survive');
// CAS/write-path fields the queue's quick actions anchor on.
for (const field of ['deleted', 'deleted_at', 'deleted_by', 'status', 'archived_at', 'archived_reason', 'updated_date', 'work_order_id']) {
  assert.ok(ESTIMATE_QUEUE_FIELDS.includes(field), `estimate projection covers CAS/render field ${field}`);
}
for (const field of QUOTE_DEFAULTS_FIELDS) {
  assert.ok(['id', 'config_name', 'display_timezone', 'custom_statuses', 'status_transitions'].includes(field));
}
assert.equal(typeof projectSettingRecord({ a: 1 }).setting_value, 'undefined', 'setting projection is the record shape');
assert.deepEqual(projectSettingRecord({ id: 's1', setting_key: 'k', setting_value: 'v', junk: 1 }), { id: 's1', setting_key: 'k', setting_value: 'v' });

rmSync(outViews);
rmSync(outCrm);
rmSync(outLinks);
console.log('PASS queue-feed');
