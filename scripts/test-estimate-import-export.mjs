import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Stubs: entities + SDK + staff gateway — the helpers take injectable deps for
// real work, these stubs only satisfy the module graph.
const stub = resolve(here, '.tmp-entities-eie.mjs');
writeFileSync(stub, `
export const AllInOneEstimate = { filter: async () => [], list: async () => [] };
export const BuilderPart = { filter: async () => [], list: async () => [], get: async () => null };
export const BuilderPartGroup = { filter: async () => [], list: async () => [] };
export const BuilderProduct = { filter: async () => [], list: async () => [] };
export const PartTemplate = { filter: async () => [], list: async () => [] };
export const ProjectTemplate = { filter: async () => [], list: async () => [] };
export const Customer = { filter: async () => [], list: async () => [] };
`);
const sdkStub = resolve(here, '.tmp-sdk-eie.mjs');
writeFileSync(sdkStub, `
const proxy = new Proxy({}, { get: () => async () => ({ data: {} }) });
export const base44 = {
  entities: new Proxy({}, { get: () => ({ filter: async () => [], list: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}) }) }),
  functions: proxy,
  integrations: proxy,
  auth: new Proxy({}, { get: () => async () => null }),
  asServiceRole: { entities: new Proxy({}, { get: () => ({ filter: async () => [], list: async () => [], create: async () => ({}), update: async () => ({}) }) }) },
};
export const isRetryableFunction = () => false;
export const requestGovernor = {};
`);
const staffStub = resolve(here, '.tmp-staff-eie.mjs');
writeFileSync(staffStub, `
const emptyEntity = () => ({ filter: async () => [], list: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}) });
export const staffEntities = new Proxy({}, { get: (t, k) => (k === 'updateMany' ? async () => ({}) : emptyEntity()) });
export const staffEntityWrite = {};
export const staffDataRead = {};
export const updateMany = async () => ({});
`);

const virtualEntry = resolve(here, '.tmp-eie-entry.mjs');
writeFileSync(virtualEntry, `
export * from '../src/components/estimator/importEstimates.js';
export * from '../src/components/estimator/exportEstimates.js';
`);
const out = resolve(here, '.tmp-eie-bundle.mjs');
buildSync({
  entryPoints: [virtualEntry],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: {
    '@/entities/all': stub,
    '@/api/entities': stub,
    '@/api/gatedEntities': stub,
    '@/api/base44Client': sdkStub,
    '@/components/staff/staffEntities': staffStub,
  },
  define: { 'import.meta.env': '{}' },
});

const imp = await import(pathToFileURL(out).href);
rmSync(stub, { force: true }); rmSync(sdkStub, { force: true });
rmSync(staffStub, { force: true }); rmSync(out, { force: true });
rmSync(virtualEntry, { force: true });

const {
  parseCsvRows, csvRecords,
  sanitizeEstimateForImport, parseEstimateImportJson, resolveImportCustomer,
  mapLegacyEstimateToAio, mapLineItemsCsv, mergeLineItems, appendLineItemsToEstimate,
  mapPartsLibraryCsv, importPartsLibraryRows,
  templateImportableSections, buildCopiedBomPackages,
  importEstimateRecord, copyProductBomToProduct,
  ESTIMATE_EXPORT_FORMAT,
} = imp;
const {
  buildEstimateExportDocument, buildEstimatesBackupDocument, estimateExportFilename,
  exportEstimatesCsvRows, exportChangeOrdersCsvRows, exportEstimateCostingCsvRows,
  buildStandaloneQuoteHtml,
} = imp;

// ---------------------------------------------------------------------------
// CSV parser basics
// ---------------------------------------------------------------------------
assert.deepEqual(parseCsvRows('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
assert.deepEqual(parseCsvRows('name,note\n"x, y","said ""hi""'), [['name', 'note'], ['x, y', 'said "hi"']]);
assert.deepEqual(parseCsvRows('a,b\r\n1,2\r\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
assert.deepEqual(parseCsvRows('﻿a,b\n1,2'), [['a', 'b'], ['1', '2']], 'BOM stripped');
const rec = csvRecords('Name,Unit Cost\nPart A,3.50\n\nPart B,1');
assert.equal(rec.records.length, 2);
assert.equal(rec.records[0].row, 2, 'spreadsheet row number preserved');
assert.equal(rec.records[0].data.unit_cost, '3.50');

// ---------------------------------------------------------------------------
// #451 — estimate JSON export → re-import round-trip
// ---------------------------------------------------------------------------
const exported = buildEstimateExportDocument({
  id: 'est_1', estimate_number: 'E-1001', project_name: 'Pylon Sign',
  client_name: 'Acme Corp', status: 'sent', quote_total: 4200,
  line_items: [{ line_id: 'l1', client_product_name: 'Pylon', customer_price_snapshot: 4200 }],
  work_order_id: 'wo_9', sent_at: '2025-01-01',
});
assert.equal(exported.format, ESTIMATE_EXPORT_FORMAT);
const parsed = parseEstimateImportJson(JSON.parse(JSON.stringify(exported)));
assert.equal(parsed.format, 'native');
assert.equal(parsed.estimates.length, 1);
const sanitized = sanitizeEstimateForImport(parsed.estimates[0]);
assert.equal(sanitized.id, undefined, 'identity stripped');
assert.equal(sanitized.estimate_number, '', 'estimate number cleared');
assert.equal(sanitized.status, 'draft', 'lands as draft');
assert.equal(sanitized.work_order_id, undefined, 'lifecycle link stripped');
assert.equal(sanitized.sent_at, undefined, 'audit stamp stripped');
assert.equal(sanitized.project_name, 'Pylon Sign');
assert.equal(sanitized.line_items.length, 1, 'line items survive round-trip');

// Backup file parses to multiple estimates.
const backup = buildEstimatesBackupDocument([{ project_name: 'A' }, { project_name: 'B' }]);
const parsedBackup = parseEstimateImportJson(backup);
assert.equal(parsedBackup.format, 'backup');
assert.equal(parsedBackup.estimates.length, 2);

// Bare estimate field bag is the lenient fallback.
assert.equal(parseEstimateImportJson({ project_name: 'X', line_items: [] }).format, 'bare');
assert.throws(() => parseEstimateImportJson([1, 2, 3]), /JSON object/);
assert.equal(estimateExportFilename({ estimate_number: 'E-1001', project_name: 'Pylon Sign!' }), 'E-1001-Pylon-Sign.json');

// importEstimateRecord: native shape imports through injected ensureNewEstimate.
{
  const seen = [];
  const res = await importEstimateRecord({
    raw: { project_name: 'Pylon', client_name: 'Acme Corp', line_items: [{ line_id: 'a' }], status: 'accepted' },
    format: 'native',
    customers: [{ id: 'cust_1', company_name: 'Acme Corp' }],
    ensureNewEstimateFn: async ({ estimate }) => { seen.push(estimate); return { ...estimate, id: 'new_est' }; },
    creationKey: 'k1',
  });
  assert.equal(res.estimate.id, 'new_est');
  assert.equal(res.resolution, 'exact');
  assert.equal(seen[0].customer_id, 'cust_1', 'exact customer linked');
  assert.equal(seen[0].status, 'draft');
}

// #460 — fuzzy match requires confirmation; ambiguous never auto-links.
{
  const res = await importEstimateRecord({
    raw: { project_name: 'P', client_name: 'Acme', line_items: [] },
    format: 'native',
    customers: [{ id: 'c1', company_name: 'Acme Corporation' }, { id: 'c2', company_name: 'Beta' }],
    confirmFuzzyMatch: async () => true,
    ensureNewEstimateFn: async ({ estimate }) => estimate,
    creationKey: 'k',
  });
  assert.equal(res.resolution, 'fuzzy');
  assert.equal(res.estimate.customer_id, 'c1', 'confirmed fuzzy links');
}
{
  const res = await importEstimateRecord({
    raw: { project_name: 'P', client_name: 'Acme', line_items: [] },
    format: 'native',
    customers: [{ id: 'c1', company_name: 'Acme Corporation' }, { id: 'c2', company_name: 'Beta' }],
    confirmFuzzyMatch: async () => false,
    ensureNewEstimateFn: async ({ estimate }) => estimate,
    creationKey: 'k',
  });
  assert.equal(res.estimate.customer_id, undefined, 'declined fuzzy stays unlinked');
}
assert.equal(resolveImportCustomer({ name: 'Ac', customers: [{ id: 'a', company_name: 'Action Signs' }, { id: 'b', company_name: 'Ace Electric' }] }).status, 'ambiguous');
assert.equal(resolveImportCustomer({ name: '', customers: [] }).status, 'none');

// ---------------------------------------------------------------------------
// #455 — legacy/BOM estimate → aio payload
// ---------------------------------------------------------------------------
{
  const { payload, lineItems, dropped } = mapLegacyEstimateToAio({
    customer: 'Legacy Co', project: 'Monument',
    bom: [
      { name: 'Cabinet', qty: '2', unit_cost: '100', unit_price: '250', section: 'Main' },
      { qty: '1' }, // dropped — no name
    ],
  });
  assert.equal(payload.client_name, 'Legacy Co');
  assert.equal(lineItems.length, 1);
  assert.equal(dropped.length, 1);
  assert.equal(lineItems[0].total_snapshot, 100);
  assert.equal(lineItems[0].customer_price_snapshot, 250);
  assert.equal(lineItems[0].imported_source, 'legacy_estimate_import');
  assert.ok(lineItems[0].line_id, 'line_id assigned');
}
assert.throws(() => mapLegacyEstimateToAio({ customer: 'X' }), /No importable line items/);
assert.throws(() => mapLegacyEstimateToAio('nope'), /JSON object/);

// ---------------------------------------------------------------------------
// #473 — line-items CSV → merge into estimate via CAS
// ---------------------------------------------------------------------------
{
  const { lineItems, dropped } = mapLineItemsCsv(
    'Section,Name,Qty,Unit Cost,Unit Price\nPylon,Cabinet,2,100,260\nPylon,,9,9,9\nRaceway,LED modules,10,5,12'
  );
  assert.equal(lineItems.length, 2);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].row, 3, 'dropped row reports spreadsheet row');
  assert.equal(lineItems[1].product_category, 'Raceway');
  assert.equal(lineItems[1].total_snapshot, 5);
}
{
  const merged = mergeLineItems([{ line_id: 'x' }], [{ line_id: 'x' }, { line_id: 'y' }]);
  assert.equal(merged.length, 3);
  assert.equal(new Set(merged.map((l) => l.line_id)).size, 3, 'colliding line_ids uniquified');
}
{
  let replaceCall = null;
  await appendLineItemsToEstimate({
    estimate: { id: 'e1', updated_date: '2025-01-01', line_items: [{ line_id: 'old' }] },
    lineItems: [{ line_id: 'new', client_product_name: 'Cab' }],
    replaceFn: async (args) => { replaceCall = args; return { ok: true }; },
  });
  assert.equal(replaceCall.estimateId, 'e1');
  assert.equal(replaceCall.nextFields.line_items.length, 2, 'appends, does not replace');
  assert.deepEqual(replaceCall.guardFields, { updated_date: '2025-01-01' }, 'CAS guard on updated_date');
}
await assert.rejects(() => appendLineItemsToEstimate({ estimate: {}, lineItems: [{}] }), /not loaded/);

// ---------------------------------------------------------------------------
// #453 — parts library CSV → idempotent PartTemplate payloads
// ---------------------------------------------------------------------------
{
  const { templates, dropped } = mapPartsLibraryCsv(
    'Name,Type,Unit,Unit Cost,Unit Price,Qty,Supplier,SKU,Category\nLED Module,electrical,each,4,9,10,GE,LED-9,Lighting\n,stuff,each,1,1,1,,,'
  );
  assert.equal(templates.length, 1);
  assert.equal(dropped.length, 1);
  const t = templates[0];
  assert.equal(t.data.template_type, 'part');
  assert.equal(t.data.part_snapshot.part_name, 'LED Module');
  assert.equal(t.data.part_snapshot.frozen_extended_customer_price, 90);
  assert.ok(t.data.template_family_key, 'family key assigned');
  assert.ok(t.idempotencyKey.startsWith('parts_library_csv:'), 'deterministic key');
}
// Same CSV → same key (idempotent); different content → different key.
{
  const a = mapPartsLibraryCsv('Name,Unit Cost\nBolt,1');
  const b = mapPartsLibraryCsv('Name,Unit Cost\nBolt,1');
  const c = mapPartsLibraryCsv('Name,Unit Cost\nBolt,2');
  assert.equal(a.templates[0].idempotencyKey, b.templates[0].idempotencyKey);
  assert.notEqual(a.templates[0].idempotencyKey, c.templates[0].idempotencyKey);
}
// importPartsLibraryRows: existing rows reported, new rows created.
{
  const store = new Set();
  const entity = { filter: async ({ idempotency_key }) => (store.has(idempotency_key) ? [{ idempotency_key }] : []) };
  let creates = 0;
  const createFn = async ({ key }) => { store.add(key); creates += 1; return { id: `p${creates}` }; };
  const templates = mapPartsLibraryCsv('Name,Unit Cost\nBolt,1\nNut,2').templates;
  const first = await importPartsLibraryRows({ templates, entity, createFn });
  assert.equal(first.created, 2);
  const second = await importPartsLibraryRows({ templates, entity, createFn });
  assert.equal(second.existing, 2, 're-run reports existing, creates nothing');
  assert.equal(second.created, 0);
}

// ---------------------------------------------------------------------------
// #467 — template sections only instantiate when the seam exists
// ---------------------------------------------------------------------------
assert.equal(templateImportableSections({ project_data: {} }).length, 0, 'no seam → empty');
assert.equal(templateImportableSections(null).length, 0);
{
  const sections = templateImportableSections({
    id: 't1', module_key: 'channel_letter',
    project_data: { sections: [{ name: 'Front sign', unit_price: 500, qty: 1 }, { name: 'Rear sign' }] },
  });
  assert.equal(sections.length, 2);
  assert.equal(sections[0].client_product_name, 'Front sign');
  assert.equal(sections[0].customer_price_snapshot, 500);
  assert.equal(sections[0].imported_source, 'project_template:t1');
}

// ---------------------------------------------------------------------------
// #464 — BOM copy packages clone groups+parts (fresh keys via service)
// ---------------------------------------------------------------------------
{
  const packages = buildCopiedBomPackages({
    groups: [
      { id: 'g1', group_name: 'Cabinet', sort_order: 0 },
      { id: 'g2', group_name: 'Old', is_active: false },
    ],
    parts: [
      { id: 'p1', part_name: 'Face', part_group_id: 'g1', sort_order: 1 },
      { id: 'p2', part_name: 'Return', part_group_id: 'g1', sort_order: 0 },
      { id: 'p3', part_name: 'Loose part', sort_order: 0 },
      { id: 'p4', part_name: 'Dead', part_group_id: 'g2' },
      { id: 'p5', part_name: 'Inactive', is_active: false },
    ],
  });
  const groupPkg = packages.find((p) => p.itemType === 'part_group');
  assert.equal(groupPkg.payload.parts.length, 2, 'inactive/orphaned groups excluded, parts sorted into group');
  assert.equal(groupPkg.payload.parts[0].part_name, 'Return', 'sort_order respected');
  assert.equal(groupPkg.payload.group.snapshot_source_group_id, 'g1');
  const loose = packages.filter((p) => p.itemType === 'part');
  assert.equal(loose.length, 2, 'loose part + active part of inactive group');
  assert.deepEqual(loose.map((p) => p.itemName).sort(), ['Dead', 'Loose part'], 'p4 survives as loose (its group g2 is inactive)');
  assert.notEqual(groupPkg.payload.group.id, undefined, 'clone keeps data (service re-keys)');
}
await assert.rejects(
  () => copyProductBomToProduct({ estimateId: 'e1', sourceBuilderProductId: 's1' }),
  /Source and target/
);

// ---------------------------------------------------------------------------
// #452 — bulk estimates CSV rows
// ---------------------------------------------------------------------------
{
  const { headers, rows } = exportEstimatesCsvRows([
    { id: 'e1', estimate_number: 'E-1', project_name: 'A', client_name: 'Cust', status: 'draft', quote_total: 100, line_items: [{ a: 1 }] },
    { id: 'e2', estimate_number: 'E-2' },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(headers.includes('Estimate #'));
  assert.equal(rows[0][headers.indexOf('Quote Total')], 100);
}

// ---------------------------------------------------------------------------
// #465 — change-orders CSV rows
// ---------------------------------------------------------------------------
{
  const { headers, rows } = exportChangeOrdersCsvRows([
    { id: 'co1', change_order_number: 'CO-7', title: 'Add vinyl', status: 'approved', amount: 350 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][headers.indexOf('Amount')], 350);
}

// ---------------------------------------------------------------------------
// #474 — job-costing breakdown CSV rows
// ---------------------------------------------------------------------------
{
  const { headers, rows } = exportEstimateCostingCsvRows({
    estimate: { id: 'e1', quote_total: 600, line_items: [{ builder_product_id: 'prod1', client_product_name: 'Pylon', customer_quantity: 2, customer_price_snapshot: 300, total_snapshot: 100 }] },
    products: [{ id: 'prod1' }],
    parts: [
      { id: 'p1', builder_product_id: 'prod1', part_name: 'Face', quantity: 2, frozen_extended_cost: 80, frozen_extended_customer_price: 200, sort_order: 0 },
      { id: 'p2', builder_product_id: 'prod1', part_name: 'Skip me', is_active: false },
    ],
    groups: [],
  });
  const partRow = rows.find((r) => r[1] === 'Face');
  assert.equal(partRow[7], 80, 'extended cost');
  assert.equal(partRow[9], 200, 'customer extended');
  assert.equal(partRow[10], 120, 'margin $');
  assert.ok(!rows.some((r) => r[1] === 'Skip me'), 'inactive parts excluded');
  const totalRow = rows.find((r) => r[3] === 'estimate_total');
  assert.equal(totalRow[9], 600);
  assert.ok(headers.includes('Margin %'));
}

// ---------------------------------------------------------------------------
// #461 — standalone quote HTML
// ---------------------------------------------------------------------------
{
  const html = buildStandaloneQuoteHtml({
    estimate: {
      estimate_number: 'E-7', project_name: 'Pylon', client_name: 'Acme <Corp>',
      company_name: 'CCS', quote_title: 'Proposal', quote_total: 100,
      scope_inclusions: 'Install\nPermits',
    },
    pricing: { subtotal: 100, quoteTotal: 100 },
    quoteRows: [{ name: 'Pylon <main>', amount: 100, description: 'Aluminum' }],
  });
  assert.ok(html.startsWith('<!doctype html>'), 'self-contained document');
  assert.ok(html.includes('window.print'), 'print affordance');
  assert.ok(html.includes('Acme &lt;Corp&gt;'), 'HTML escaped');
  assert.ok(html.includes('Pylon &lt;main&gt;'));
  assert.ok(html.includes('Install'));
  assert.ok(!html.includes('internal_cost'), 'no internal fields leak');
}

console.log('PASS estimate import/export (~55 assertions)');
