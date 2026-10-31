import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-b44-stub.mjs');
writeFileSync(stub, `
export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }) } };
`);
const bundlePath = resolve(here, '.tmp-dup-est.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/estimateCreationService.js')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
  alias: { '@/api/base44Client': stub },
});
const { buildDuplicateEstimate, buildSplitEstimate, splitEstimate } = await import(pathToFileURL(bundlePath).href);

const source = {
  id: 'est-1',
  created_date: '2026-01-01T00:00:00Z',
  updated_date: '2026-01-02T00:00:00Z',
  created_by: 'a@b.com',
  estimate_number: 'EST-1042',
  status: 'sent',
  quote_version: 3,
  work_order_id: 'wo-9',
  internal_approval: { approved_by_email: 'm@x.com' },
  deleted: false,
  sent_at: '2026-01-05T00:00:00Z',
  accepted_at: '2026-01-06T00:00:00Z',
  quote_issue_date: '2026-01-05',
  quote_issue_key: 'estimate:est-1:quote:v3',
  pipeline_sync_pending: false,
  creation_request_key: 'k-abc',
  project_name: 'Monument sign — Riverside',
  client_name: 'Riverside Properties',
  customer_id: 'cust-7',
  quote_total: 14250,
  line_items: [{ key: 'sec-1', client_product_name: 'Channel letters', total_snapshot: 9000 }],
  tax_rate: 0.0875,
  discount_percent: 5,
  terms: 'Net 30',
};

const lifecycleFields = {
  cancel_reason: 'Customer cancelled',
  cancelled_at: '2026-01-07T00:00:00Z',
  archived_at: '2026-01-08T00:00:00Z',
  archived_reason: 'Superseded',
  is_template: true,
  split_from_estimate_id: 'older-parent',
  edit_reason: 'Previous revision',
  last_product_removal_key: 'old-receipt',
  last_product_removal_line_id: 'removed-line',
  last_product_removal_at: '2026-01-06T00:00:00Z',
};
Object.assign(source, lifecycleFields);
const clone = buildDuplicateEstimate(source);
for (const key of Object.keys(lifecycleFields)) {
  assert.equal(clone[key], undefined, `${key} must not leak into a fresh draft`);
}

for (const k of ['id','created_date','updated_date','created_by','work_order_id','internal_approval','deleted','sent_at','accepted_at','quote_issue_date','quote_issue_key','pipeline_sync_pending','creation_request_key','quote_version']) {
  assert.equal(clone[k], undefined, `${k} must be dropped (got ${clone[k]})`);
}
assert.equal(clone.status, 'draft', 'clone is a fresh draft');
assert.equal(clone.estimate_number, '', 'new number assigned server-side');

assert.equal(clone.project_name, 'Monument sign — Riverside');
assert.equal(clone.customer_id, 'cust-7');
assert.equal(clone.quote_total, 14250);
assert.deepEqual(clone.line_items, source.line_items, 'sections cloned');
assert.equal(clone.tax_rate, 0.0875);
assert.equal(clone.discount_percent, 5);

const c2 = buildDuplicateEstimate({ ...source, _server: { x: 1 }, _row: { y: 2 } });
assert.equal(c2._server, undefined); assert.equal(c2._row, undefined);

const splitSource = {
  ...source,
  line_items: [
    { line_id: 'line-1', id: 'different-id', client_product_name: 'Letters' },
    { builder_product_id: 'builder-2' },
    { project_id: 'project-3' },
    { client_product_name: 'Legacy line' },
  ],
};
const beforeSplit = JSON.stringify(splitSource);
for (const [index, key] of ['line-1', 'builder-2', 'project-3', 'i3'].entries()) {
  const split = buildSplitEstimate(splitSource, { lineItemIds: [key] });
  assert.deepEqual(split.line_items, [splitSource.line_items[index]]);
  assert.equal(split.status, 'draft');
  assert.equal(split.estimate_number, '');
  assert.equal(split.split_from_estimate_id, source.id);
}
assert.equal(JSON.stringify(splitSource), beforeSplit, 'split leaves the source unchanged');
assert.throws(() => buildSplitEstimate(splitSource, { lineItemIds: ['missing'] }), /Reload/);
assert.throws(() => buildSplitEstimate(splitSource), /Reload/);
assert.throws(() => buildSplitEstimate({
  ...source, line_items: [{ line_id: 'same' }, { line_id: 'same' }],
}, { lineItemIds: ['same'] }), /ambiguous/);
await assert.rejects(
  splitEstimate({ source: splitSource, lineItemIds: ['missing'], sessionToken: 'synthetic' }),
  /Reload/,
  'invalid selection must fail before calling the creation API',
);

// Numbering choice: "same" keeps the source number, default/"new" blanks it.
assert.equal(buildDuplicateEstimate(source, { keepEstimateNumber: true }).estimate_number, 'EST-1042');
assert.equal(buildDuplicateEstimate(source, { keepEstimateNumber: true }).status, 'draft');
assert.equal(buildDuplicateEstimate(source, { keepEstimateNumber: false }).estimate_number, '');
assert.equal(buildDuplicateEstimate({ ...source, estimate_number: '' }, { keepEstimateNumber: true }).estimate_number, '');

rmSync(stub, { force: true });
rmSync(bundlePath, { force: true });
console.log('PASS duplicate estimate builder and split selection regression cases');
process.exit(0);