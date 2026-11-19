// w-54 contract test — B-14 (Estimate→WO product seeding) + D-06 (conversion
// history events) in src/components/estimator/workOrderConversion.js.
//
//   B-14: seeded products[] carry canonical initial operational_status
//         (order_review from productStatusModel.OPERATIONAL_STATUS_SET[0]),
//         dual due dates computed from part leads through
//         computeProductDueDate/computeOrderDueDate (design_lead_days →
//         design_due_date, product_lead_days → product_due_date, max across
//         the line's resolved parts), responsibility from line → estimate
//         defaults, and name/qty/price carried — all existing fields intact.
//   D-06: conversion_events[] on the WO payload match the ProductActivity
//         entity shape (event_type 'conversion', label per spec, actor_type
//         'staff', actor_label, occurred_at) and merge append-only by
//         creation_request_key; buildConversionEvent exported for tests.
//
// Same esbuild-stub pattern as test-due-date-wiring.mjs: the conversion module
// + the two shared TS models bundle for real; every other import stubs empty.

import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { build, transformSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const convPath = resolve(root, 'src/components/estimator/workOrderConversion.js');
const convSrc = readFileSync(convPath, 'utf8');

let passed = 0;
const check = (fn, label) => { fn(); passed += 1; };
const eq = (a, b, label) => check(() => assert.equal(a, b, label), label);
const ok = (v, label) => check(() => assert.ok(v, label), label);

// --- source-level wiring -----------------------------------------------------
eq(
  /from\s+["']\.\.\/\.\.\/\.\.\/base44\/shared\/dueDateEngine\.ts["']/.test(convSrc),
  true, 'engine import still uses the relative base44/shared .ts path (w-32 intact)');
check(() => assert.match(convSrc, /import\s*\{[^}]*\brecalcOnProofApproval\b[^}]*\}\s*from/s),
  'recalcOnProofApproval import intact (w-32)');
check(() => assert.match(convSrc, /import\s*\{[^}]*\bcomputeProductDueDate\b[^}]*\}\s*from/s),
  'computeProductDueDate imported');
check(() => assert.match(convSrc, /import\s*\{[^}]*\bcomputeOrderDueDate\b[^}]*\}\s*from/s),
  'computeOrderDueDate imported for the order rollup');
check(() => assert.match(convSrc, /import\s*\{[^}]*\bOPERATIONAL_STATUS_SET\b[^}]*\}\s*from\s+["']\.\.\/\.\.\/\.\.\/base44\/shared\/productStatusModel\.ts["']/s),
  'canonical status vocabulary imported from productStatusModel.ts');
eq(/conversion_events:\s*mergeConversionEvents/.test(convSrc), true,
  'WO payload emits conversion_events via the append-only merge');
eq(/export function buildConversionEvent\(\{ estimate = \{\}, workOrder = null/.test(convSrc), true,
  'buildConversionEvent exported with the spec signature');
transformSync(convSrc, { loader: 'js' }); passed += 1; // esbuild syntax clean

// --- real bundle under Node --------------------------------------------------
const stubImports = {
  name: 'w54-stub-imports',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      if (args.path.includes('dueDateEngine')) return null;
      if (args.path.includes('productStatusModel')) return null;
      // customerPricing + moduleRegistry are import-free pure helpers the
      // product builder calls — bundle the real code, not stubs.
      if (args.path.includes('customerPricing')) return null;
      if (args.path.includes('moduleRegistry')) return null;
      if (/workOrderConversion(\.js)?$/.test(args.path)) return null;
      return { path: args.path, namespace: 'w54-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'w54-stub' }, () => ({
      contents: 'module.exports = {};', loader: 'js',
    }));
  },
};

const convOut = resolve(here, '.tmp-w54-conv.mjs');
await build({ entryPoints: [convPath], bundle: true, format: 'esm', outfile: convOut, plugins: [stubImports], logLevel: 'silent' });
const conv = await import(pathToFileURL(convOut).href);

const {
  buildEstimateWorkOrderProducts, buildConvertedWorkOrderFields,
  resolveEstimateLineParts, loadEstimateConversionParts,
  buildConversionEvent, buildConversionEvents, mergeConversionEvents,
  INITIAL_OPERATIONAL_STATUS, mergeWorkOrderProducts,
} = conv;
for (const fn of [buildEstimateWorkOrderProducts, buildConvertedWorkOrderFields,
  resolveEstimateLineParts, loadEstimateConversionParts,
  buildConversionEvent, buildConversionEvents, mergeConversionEvents]) {
  eq(typeof fn, 'function', `${fn?.name || 'export'} is exported`);
}
eq(INITIAL_OPERATIONAL_STATUS, 'order_review', 'canonical initial status = order_review');

// --- fixtures -----------------------------------------------------------------
const ANCHOR = '2026-11-02'; // Monday — engine uses calendar days without a clock
const NOW = '2026-11-02T15:04:05.000Z';

const estimate = {
  id: 'est-1', estimate_number: 'EST-1001', status: 'approved',
  project_name: 'ZZ Test Signage', client_name: 'ZZ Test Customer',
  default_responsibility: 'Sales Center',
  line_items: [
    {
      line_id: 'L1', builder_product_id: 'bp-1', module_key: 'channel_letters',
      client_product_name: 'Channel Letters', customer_quantity: 2,
      customer_description: 'Front-lit set', product_notes: 'verify depth',
      designer: 'Dee', assigned_to: 'Amy', queue_priority: 7,
    },
    {
      line_id: 'L2', builder_product_id: 'bp-2', module_key: 'foundation',
      client_product_name: 'Monument Base', customer_quantity: 1,
      operational_status: 'awaiting_proof_approval',
      customer_facing_status: 'Custom label kept',
    },
  ],
};

// BuilderPart-shaped pool — design/product flat leads, A-03 style.
const parts = [
  { id: 'pt-1', builder_product_id: 'bp-1', estimate_id: 'est-1', part_name: 'Letters', design_lead_days: 3, product_lead_days: 10 },
  { id: 'pt-2', builder_product_id: 'bp-1', estimate_id: 'est-1', part_name: 'Raceway', design_lead_days: 5, product_lead_days: 4 },
  { id: 'pt-3', builder_product_id: 'bp-2', estimate_id: 'est-1', part_name: 'Concrete', design_lead_days: 1, product_lead_days: 20 },
  { id: 'pt-x', builder_product_id: 'bp-9', estimate_id: 'est-1', part_name: 'Foreign', design_lead_days: 99, product_lead_days: 99 },
];

const pricing = {
  quoteTotal: 2300,
  sections: [
    { line_id: 'L1', quantity: 2, unitRaw: 550, adjusted: 1100 },
    { line_id: 'L2', quantity: 1, unitRaw: 1200, adjusted: 1200 },
  ],
  parts,
};

// --- B-14: seeded product rows -------------------------------------------------
const seeded = buildEstimateWorkOrderProducts(estimate, pricing, { anchor_date: ANCHOR });
eq(seeded.length, 2, 'one seeded product per estimate line');

const p1 = seeded.find((p) => p.estimate_line_id === 'L1');
const p2 = seeded.find((p) => p.estimate_line_id === 'L2');
ok(p1 && p2, 'both lines resolved by estimate_line_id');

eq(p1.id, 'bp-1', 'product id = builder_product_id');
eq(p1.description, 'Channel Letters', 'product name carried');
eq(p1.quantity, 2, 'quantity carried from priced line');
eq(p1.quoted_unit_price, 550, 'quoted_unit_price from priced section');
eq(p1.quoted_total, 1100, 'quoted_total from priced section');
eq(p1.module_key, 'channel_letters', 'module_key carried');
eq(p1.customer_description, 'Front-lit set', 'customer_description carried');
eq(p1.estimator_notes, 'verify depth', 'estimator_notes carried');
eq(p1.builder_product_id, 'bp-1', 'builder_product_id carried');

eq(p1.operational_status, 'order_review', 'blank line status seeds order_review');
eq(p2.operational_status, 'awaiting_proof_approval', 'explicit line status preserved');
eq(p1.customer_facing_status, 'Order Review', 'seeded status gets canonical customer label');
eq(p2.customer_facing_status, 'Custom label kept', 'explicit customer_facing_status wins');

// Dual dates — max across the line's pool-resolved parts, calendar days.
eq(p1.design_due_date, '2026-11-07', 'design_due_date = anchor + max(design_lead_days 3,5)=5');
eq(p1.product_due_date, '2026-11-12', 'product_due_date = anchor + max(product_lead_days 10,4)=10');
eq(p2.design_due_date, '2026-11-03', 'L2 design date from its 1-day part');
eq(p2.product_due_date, '2026-11-22', 'L2 product date from its 20-day part (foreign part excluded)');

// w-8 fields preserved.
eq(p1.designer, 'Dee', 'designer preserved');
eq(p1.assigned_to, 'Amy', 'assigned_to preserved');
eq(p1.queue_priority, 7, 'queue_priority preserved');
eq(p1.responsibility, 'Sales Center', 'responsibility falls back to estimate.default_responsibility');
eq(p1.proof_status, 'none', 'proof_status default intact');
eq(p1.fulfillment_state, 'none', 'fulfillment_state default intact');

// Responsibility fallback chain.
{
  const lineResp = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [{ ...estimate.line_items[0], responsibility: 'Fab Crew' }] },
    pricing, { anchor_date: ANCHOR },
  );
  eq(lineResp[0].responsibility, 'Fab Crew', 'line.responsibility beats estimate default');
  const salesResp = buildEstimateWorkOrderProducts(
    { ...estimate, default_responsibility: '', sales_responsibility: 'CSR Team', line_items: [estimate.line_items[0]] },
    pricing, { anchor_date: ANCHOR },
  );
  eq(salesResp[0].responsibility, 'CSR Team', 'estimate.sales_responsibility fallback');
  const optResp = buildEstimateWorkOrderProducts(
    { id: 'e', line_items: [estimate.line_items[0]] },
    {}, { anchor_date: ANCHOR, default_responsibility: 'Install Dept' },
  );
  eq(optResp[0].responsibility, 'Install Dept', 'options.default_responsibility fallback');
}

// Parts resolution variants.
{
  // options.parts beats pricing.parts; embedded line.parts beats the pool.
  const viaOptions = buildEstimateWorkOrderProducts(estimate, {}, { anchor_date: ANCHOR, parts });
  eq(viaOptions[0].product_due_date, '2026-11-12', 'options.parts pool resolves the same dates');
  const embedded = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [{ ...estimate.line_items[0], parts: [{ part_name: 'Emb', design_lead_days: 2, product_lead_days: 6 }] }] },
    pricing, { anchor_date: ANCHOR },
  );
  eq(embedded[0].product_due_date, '2026-11-08', 'embedded line.parts beat the pool');
  eq(embedded[0].design_due_date, '2026-11-04', 'embedded design lead applies');
  const byLineId = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [estimate.line_items[0]] },
    { parts: [{ id: 'pl', estimate_line_id: 'L1', design_lead_days: 8, product_lead_days: 9 }] },
    { anchor_date: ANCHOR },
  );
  eq(byLineId[0].product_due_date, '2026-11-11', 'pool parts match on estimate_line_id too');
  const inactive = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [estimate.line_items[0]] },
    { parts: [
      { id: 'a', builder_product_id: 'bp-1', product_lead_days: 30, is_active: false },
      { id: 'b', builder_product_id: 'bp-1', product_lead_days: 7 },
    ] },
    { anchor_date: ANCHOR },
  );
  eq(inactive[0].product_due_date, '2026-11-09', 'is_active:false parts never contribute lead');
  eq(resolveEstimateLineParts(estimate.line_items[0], parts).length, 2, 'resolveEstimateLineParts slices the line pool');
  eq(resolveEstimateLineParts({ line_id: 'zz' }, parts).length, 0, 'no refs → no parts');
  // No parts → carried (w-32-imported) dates survive untouched.
  const carried = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [{ ...estimate.line_items[0], product_due_date: '2026-12-25', design_due_date: '2026-12-10' }] },
    {}, { anchor_date: ANCHOR },
  );
  eq(carried[0].product_due_date, '2026-12-25', 'no parts → carried product_due_date kept');
  eq(carried[0].design_due_date, '2026-12-10', 'no parts → carried design_due_date kept');
  // Hard due date holds the stored date against computed leads.
  const hard = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [{ ...estimate.line_items[0], hard_due_date: true, product_due_date: '2026-11-05' }] },
    pricing, { anchor_date: ANCHOR },
  );
  eq(hard[0].product_due_date, '2026-11-05', 'hard_due_date holds the stored date');
  // Tier fields: additional = std + add.
  const tiered = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [estimate.line_items[0]] },
    { parts: [{ builder_product_id: 'bp-1', design_std_days: 2, design_add_days: 3, product_std_days: 10, product_add_days: 5 }] },
    { anchor_date: ANCHOR, tier: 'additional' },
  );
  eq(tiered[0].product_due_date, '2026-11-17', 'additional tier = std+add for production');
  eq(tiered[0].design_due_date, '2026-11-07', 'additional tier = std+add for design');
  // "none" line status folds to order_review too.
  const noneStatus = buildEstimateWorkOrderProducts(
    { ...estimate, line_items: [{ ...estimate.line_items[0], operational_status: 'none' }] },
    pricing, { anchor_date: ANCHOR },
  );
  eq(noneStatus[0].operational_status, 'order_review', "'none' line status seeds order_review");
}

// loadEstimateConversionParts — estimate_id path then builder_product_id fallback.
{
  const calls = [];
  const coveredEntity = {
    filter: async (q) => {
      calls.push(q);
      if (q.estimate_id === 'est-1') return [parts[0]];
      if (q.builder_product_id === 'bp-1') return [parts[0], parts[1]];
      if (q.builder_product_id === 'bp-2') return [parts[2]];
      return [];
    },
  };
  const covered = await loadEstimateConversionParts(estimate, { entity: coveredEntity });
  eq(covered.length, 2, 'estimate_id-covered products skip the product fallback');
  eq(calls.filter((q) => q.builder_product_id === 'bp-1').length, 0, 'covered bp-1 never re-fetches');
  eq(calls.filter((q) => q.builder_product_id === 'bp-2').length, 1, 'uncovered bp-2 falls back to product fetch');

  const legacyEntity = {
    filter: async (q) => {
      if (q.estimate_id === 'est-1') return [];
      if (q.builder_product_id === 'bp-1') return [parts[0], parts[1]];
      if (q.builder_product_id === 'bp-2') return [parts[2]];
      return [];
    },
  };
  const legacy = await loadEstimateConversionParts(estimate, { entity: legacyEntity });
  eq(legacy.length, 3, 'legacy parts resolve through builder_product_id fallback');
  eq(legacy.some((p) => p.id === 'pt-x'), false, 'unrelated product parts excluded');
  eq((await loadEstimateConversionParts(estimate, { entity: {} })).length, 0, 'missing entity → empty pool');

  // O-014 B-4: a transient filter failure propagates (fail-closed) rather than
  // silently seeding a conversion parts pool missing rows.
  const failingEntity = { filter: async () => { throw new Error('transient 500'); } };
  await assert.rejects(
    loadEstimateConversionParts(estimate, { entity: failingEntity }),
    /transient 500/,
    'transient filter failure propagates instead of silently returning an empty pool',
  );
}

// --- B-14/D-06: converted WO fields ---------------------------------------------
const stamped = seeded.map((p) => ({ ...p, source_estimate_id: 'est-1', source_estimate_number: 'EST-1001' }));
const fields = buildConvertedWorkOrderFields({
  estimate, pricing, existing: null, products: stamped,
  conversionDate: ANCHOR, verifiedCustomerId: 'cust-9', actor: 'Brett H', now: NOW,
});
eq(fields.due_date, '2026-11-22', 'order due_date = max product due date');
eq(fields.customer_id, 'cust-9', 'verified customer id carried');
eq(fields.sales_status, 'won', 'sales_status won');
eq(fields.estimate_id, 'est-1', 'estimate link carried');
ok(Array.isArray(fields.products) && fields.products.length === 2, 'products array on payload');

// Existing-WO merge: later existing due holds, earlier gets pushed forward.
{
  const later = buildConvertedWorkOrderFields({ estimate, existing: { due_date: '2026-12-01' }, products: stamped, actor: 'B', now: NOW });
  eq(later.due_date, '2026-12-01', 'later existing due_date never pulled earlier');
  const earlier = buildConvertedWorkOrderFields({ estimate, existing: { due_date: '2026-11-10' }, products: stamped, actor: 'B', now: NOW });
  eq(earlier.due_date, '2026-11-22', 'earlier existing due pushed forward to max product');
}

// --- D-06: conversion_events on the payload ------------------------------------
const events = fields.conversion_events;
ok(Array.isArray(events), 'conversion_events is an array');
eq(events.length, 2, 'one conversion event per seeded product');
eq(events[0].event_type, 'conversion', "event_type 'conversion'");
eq(events[0].label, 'Estimate Converted to Order - via product status (APPROVED)', 'spec label text');
eq(events[0].actor_type, 'staff', 'actor_type staff');
eq(events[0].actor_label, 'Brett H', 'actor_label from actor');
eq(events[0].occurred_at, NOW, 'occurred_at uses injected now');
eq(events[0].work_order_id, '', 'new-WO event leaves work_order_id for the persist path');
eq(new Set(events.map((e) => e.product_id)).size, 2, 'per-product events carry distinct product_id');
eq(events[0].product_label, 'Channel Letters', 'product_label captured');
eq(events[0].from_value, 'EST-1001', 'from_value = estimate number');
eq(events[0].details.estimate_id, 'est-1', 'details carry estimate_id');
eq(events[0].details.source, 'estimate_conversion', 'details tag the source');

// Shape parity with the ProductActivity entity.
{
  const ent = JSON.parse(readFileSync(resolve(root, 'base44/entities/ProductActivity.jsonc'), 'utf8'));
  for (const key of ent.required) ok(key in events[0], `required key emitted: ${key}`);
  ok(ent.properties.event_type.enum.includes(events[0].event_type), 'event_type within entity enum');
  ok(ent.properties.actor_type.enum.includes(events[0].actor_type), 'actor_type within entity enum');
  ok(typeof events[0].occurred_at === 'string' && !Number.isNaN(Date.parse(events[0].occurred_at)), 'occurred_at parseable ISO');
  ok(events[0].details && typeof events[0].details === 'object', 'details object emitted');
  ok(events[0].creation_request_key.includes('est-1'), 'creation_request_key ties to the estimate');
}

// buildConversionEvent direct + status rendering.
{
  const evt = buildConversionEvent({ estimate, workOrder: { id: 'wo-7', title: 'Job 7' }, actor: { label: 'Rep A', type: 'system' }, now: NOW });
  eq(evt.work_order_id, 'wo-7', 'work_order_id stamped from the WO');
  eq(evt.to_value, 'Job 7', 'to_value = WO title');
  eq(evt.actor_type, 'system', 'object actor honored');
  const noStatus = buildConversionEvent({ estimate: { id: 'e2', status: '' }, now: NOW });
  eq(noStatus.label, 'Estimate Converted to Order - via product status (APPROVED)', 'blank status defaults to APPROVED');
}

// Merge path: foreign products emit no events; existing events preserved.
{
  const foreign = [
    { id: 'bp-0', description: 'Other job product', source_estimate_id: 'est-0' },
    ...stamped,
  ];
  const existing = {
    id: 'wo-5', title: 'Shared Job',
    conversion_events: [{ creation_request_key: 'prior:1', event_type: 'note', note: 'earlier' }],
  };
  const merged = buildConvertedWorkOrderFields({
    estimate, existing, products: mergeWorkOrderProducts(foreign.slice(0, 1), stamped),
    actor: 'K', now: NOW,
  });
  eq(merged.conversion_events.length, 3, 'existing event preserved + two new appended');
  eq(merged.conversion_events[0].note, 'earlier', 'existing history row untouched');
  ok(merged.conversion_events.slice(1).every((e) => e.work_order_id === 'wo-5'), 'merge path stamps the WO id on events');
  ok(merged.conversion_events.slice(1).every((e) => e.product_id !== 'bp-0'), 'foreign product emits no event');
  // Rebuild over already-merged events: creation_request_key dedupes.
  const rebuilt = mergeConversionEvents(merged.conversion_events,
    buildConversionEvents({ estimate, workOrder: existing, products: stamped, actor: 'K', now: NOW }));
  eq(rebuilt.length, 3, 'creation_request_key dedupes rebuilt events');
}

// No matching products → a single order-level event still lands.
{
  const bare = buildConversionEvents({ estimate: { id: 'est-9', estimate_number: 'E-9', status: 'approved' }, workOrder: { id: 'w1' }, products: [], actor: '', now: NOW });
  eq(bare.length, 1, 'order-level fallback event emitted');
  eq(bare[0].product_id, '', 'fallback event is order-scoped');
  eq(bare[0].label, 'Estimate Converted to Order - via product status (APPROVED)', 'fallback keeps the spec label');
}

rmSync(convOut, { force: true });
console.log(`PASS conversion-seeding (${passed} asserts)`);
