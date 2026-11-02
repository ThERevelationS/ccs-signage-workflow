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
console.log('PASS queue-feed');
