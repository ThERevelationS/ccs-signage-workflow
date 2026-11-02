// Contract checks for masterplan items on the queue surface:
//   C-02  product-granularity rows — order# + product position ("INV-14022
//         3/3"), product label, company, product name, status/substatus,
//         both due dates, responsibility color, priority on every row.
//   B-05  numeric priority 1-99 — "priority" sort option: ascending, unset
//         last, earliest due breaks ties; priority rides the row for the badge.
//   B-06  dual due dates — designDue + productDue on the row, per-date
//         overdue flags via daysPastDue; dueField lens still feeds `due`.
//   C-05  proof lookup chip — per-row proof status + proof_version fields
//         and the shared proofBadge() descriptor the chip renders.
//
// Bundles productQueueModel.js directly (import-free) and proofModel.js with
// the same stub aliases test-proof-workflow.mjs uses.
//
// Run: node scripts/test-queue-rows.mjs  →  prints "PASS queue-rows"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outModel = resolve(here, '.tmp-qrows-model.mjs');
const outProof = resolve(here, '.tmp-qrows-proof.mjs');
const stub = resolve(here, '.tmp-qrows-stub.mjs');

buildSync({
  entryPoints: [resolve(here, '../src/components/queues/productQueueModel.js')],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent',
});
writeFileSync(stub, 'export const base44 = {}; export const staffEntities = {}; export const NotificationTriggers = {}; export function saveTrackedFields() {}; export default {};\n');
buildSync({
  entryPoints: [resolve(here, '../src/components/proofs/proofModel.js')],
  bundle: true, format: 'esm', outfile: outProof, logLevel: 'silent',
  alias: {
    '@/api/base44Client': stub,
    '@/components/staff/staffEntities': stub,
    '@/components/workflow/NotificationService': stub,
    '@/components/shared/trackedFieldPersistence': stub,
  },
});

const {
  flattenQueueRows, filterQueueRows, sortQueueRows, daysPastDue,
  parseQueueFilters, serializeQueueFilters, DEFAULT_QUEUE_FILTERS, QUEUE_SORTS,
} = await import(pathToFileURL(outModel).href);
const { proofBadge } = await import(pathToFileURL(outProof).href);

const NOW = new Date(2026, 10, 10, 12, 0, 0); // Nov 10 2026, local noon

const wo = (over = {}, products = []) => ({
  id: 'wo1', title: 'WO-1', current_stage: 'production', products, ...over,
});

// --- C-02: product-granularity rows -----------------------------------------

{
  const rows = flattenQueueRows([
    wo({ corbridge_invoice_number: 'INV-14022', client_name: 'Acme Signs' }, [
      { id: 'a', description: 'Pylon face' },
      { id: 'b', description: 'Channel letters' },
      { id: 'c', description: 'Vinyl banner' },
    ]),
  ]);
  assert.equal(rows.length, 3, 'three products → three rows');
  assert.deepEqual(rows.map((r) => r.position), ['1/3', '2/3', '3/3'], 'position labels i/N');
  assert.deepEqual(rows.map((r) => r.positionIndex), [1, 2, 3], 'positionIndex = idx+1');
  assert.ok(rows.every((r) => r.total_products === 3 && r.totalProducts === 3), 'total_products on every row');
  assert.equal(rows[0].ref, 'INV-14022', 'order # from corbridge_invoice_number');
  assert.equal(rows[0].company, 'Acme Signs');
  assert.equal(rows[0].productName, 'Pylon face');
  // The "WO# · i/N" render contract is composed from ref + position.
  assert.equal(`${rows[2].ref} · ${rows[2].position}`, 'INV-14022 · 3/3');
}

// Fulfilled products keep their slots — positions stay honest about the WO.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a' },
    { id: 'b', fulfillment_state: 'installed' },
    { id: 'c' },
  ])]);
  assert.deepEqual(rows.map((r) => r.position), ['1/3', '3/3'], 'excluded product keeps its slot');
  assert.ok(rows.every((r) => r.total_products === 3));
}

// Single-product order still gets the 1/1 label.
{
  const [row] = flattenQueueRows([wo({ id: 'w9' }, [{ id: 'x' }])]);
  assert.equal(row.position, '1/1');
  assert.equal(row.total_products, 1);
}

// C-02 — both due dates, responsibility color, status/substatus ride the row.
{
  const [r] = flattenQueueRows([wo({}, [{
    id: 'a',
    design_due_date: '2026-11-08',
    product_due_date: '2026-11-20',
    responsibility: 'Design dept',
    responsibility_color: '#aa33ff',
    operational_status: 'in_design',
    operational_substatus: 'rev 2',
  }])]);
  assert.equal(r.designDue, '2026-11-08');
  assert.equal(r.productDue, '2026-11-20');
  assert.equal(r.responsibility, 'Design dept');
  assert.equal(r.responsibilityColor, '#aa33ff', 'responsibility color snapshot on the row');
  assert.equal(r.status, 'in_design');
  assert.equal(r.substatus, 'rev 2');
}

// --- B-05: numeric priority + priority sort ---------------------------------

{
  const [cb, legacy, unset] = flattenQueueRows([wo({}, [
    { id: 'a', priority: 5, queue_priority: 9 },
    { id: 'b', queue_priority: 7 },
    { id: 'c' },
  ])]);
  assert.equal(cb.priority, 5, 'CB 1-99 priority wins over queue_priority');
  assert.equal(legacy.priority, 7, 'queue_priority fallback');
  assert.equal(unset.priority, 0, 'unset priority reads 0');
  assert.equal(cb.queuePriority, 9, 'queue_priority still emitted raw');
}

// "priority" sort: ascending 1-99; unset always last (own due order); due ties.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a', priority: 5, product_due_date: '2026-11-01' },
    { id: 'b', priority: 1, product_due_date: '2026-12-01' },
    { id: 'c', product_due_date: '2026-10-01' }, // unset, earliest due
    { id: 'd', priority: 3, product_due_date: '2026-11-15' },
    { id: 'e' },                               // unset, undated
  ])]);
  assert.deepEqual(sortQueueRows(rows, 'priority').map((r) => r.productId),
    ['b', 'd', 'a', 'c', 'e'], 'asc 1-99, unset last');
}

// A lone set priority still beats every unset row regardless of due.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a', product_due_date: '2026-11-02' },
    { id: 'b', priority: 99, product_due_date: '2026-12-31' },
    { id: 'c', product_due_date: '2026-11-01' },
  ])]);
  assert.deepEqual(sortQueueRows(rows, 'priority').map((r) => r.productId),
    ['b', 'c', 'a'], 'set beats unset regardless of due');
}

// Priority ties fall to earliest due.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a', priority: 2, product_due_date: '2026-11-20' },
    { id: 'b', priority: 2, product_due_date: '2026-11-05' },
  ])]);
  assert.deepEqual(sortQueueRows(rows, 'priority').map((r) => r.productId), ['b', 'a'],
    'same priority → earliest due first');
}

// Default sort keeps the legacy order (priority desc, then due); unknown keys
// fall back to it.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a', queue_priority: 1, product_due_date: '2026-11-12' },
    { id: 'b', queue_priority: 9, product_due_date: '2026-11-08' },
    { id: 'c' },
  ])]);
  assert.deepEqual(sortQueueRows(rows).map((r) => r.productId), ['b', 'a', 'c']);
  assert.deepEqual(sortQueueRows(rows, 'bogus').map((r) => r.productId), ['b', 'a', 'c']);
}

// "due" sort — pure earliest-due-first; undated last.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a', product_due_date: '2026-11-12' },
    { id: 'b', product_due_date: '2026-11-01' },
    { id: 'c' },
  ])]);
  assert.deepEqual(sortQueueRows(rows, 'due').map((r) => r.productId), ['b', 'a', 'c']);
}

// The sort option rides the filter object → URL params + saved views.
{
  assert.ok(QUEUE_SORTS.some((s) => s.key === 'priority'), 'QUEUE_SORTS exposes "priority"');
  assert.equal(DEFAULT_QUEUE_FILTERS.sort, 'default');
  const f = parseQueueFilters(new URLSearchParams('sort=priority&due=today'));
  assert.equal(f.sort, 'priority');
  assert.equal(serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, sort: 'priority' }).sort, 'priority');
  assert.equal('sort' in serializeQueueFilters(DEFAULT_QUEUE_FILTERS), false,
    'default sort stays out of the URL');
  const round = parseQueueFilters(new URLSearchParams(
    serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, sort: 'priority' })));
  assert.equal(round.sort, 'priority', 'sort survives the URL round trip');
  assert.equal(parseQueueFilters(new URLSearchParams('sort=nonsense')).sort, 'default',
    'unknown sort falls back to default');
}

// --- B-06: dual due dates + independent overdue flags ------------------------

{
  assert.equal(daysPastDue('2026-11-05', NOW), 5);
  assert.equal(daysPastDue('2026-11-10', NOW), 0, 'due today is not overdue');
  assert.equal(daysPastDue('2026-11-11', NOW), 0);
  assert.equal(daysPastDue('', NOW), 0);
  const [r] = flattenQueueRows([wo({}, [{
    id: 'a', design_due_date: '2026-11-05', product_due_date: '2026-11-20',
  }])]);
  assert.equal(daysPastDue(r.designDue, NOW), 5, 'design date overdue on its own');
  assert.equal(daysPastDue(r.productDue, NOW), 0, 'product date still future');
  const [r2] = flattenQueueRows([wo({}, [{
    id: 'b', design_due_date: '2026-12-01', product_due_date: '2026-11-01',
  }])]);
  assert.equal(daysPastDue(r2.designDue, NOW), 0);
  assert.equal(daysPastDue(r2.productDue, NOW), 9, 'product date overdue independently');
}

// dueField lens still selects which date feeds `due` and the due presets.
{
  const products = [{ id: 'a', design_due_date: '2026-11-05', product_due_date: '2026-12-01' }];
  const [designRow] = flattenQueueRows([wo({}, products)], { dueField: 'design_due_date' });
  const [productRow] = flattenQueueRows([wo({}, products)], { dueField: 'product_due_date' });
  assert.equal(designRow.due, '2026-11-05', 'design lens → due = design_due_date');
  assert.equal(productRow.due, '2026-12-01', 'product lens → due = product_due_date');
  // The same product is past due under the design lens but not the product lens.
  assert.equal(
    filterQueueRows([designRow], { ...DEFAULT_QUEUE_FILTERS, duePreset: 'past_due' }, NOW).length,
    1, 'design lens → past_due sees the design date');
  assert.equal(
    filterQueueRows([productRow], { ...DEFAULT_QUEUE_FILTERS, duePreset: 'past_due' }, NOW).length,
    0, 'product lens → future product date not past due');
  // Both raw dates stay on the row regardless of lens.
  assert.equal(designRow.productDue, '2026-12-01');
  assert.equal(productRow.designDue, '2026-11-05');
}

// --- C-05: proof lookup chip -------------------------------------------------

// Row carries the proof fields the chip needs.
{
  const [r] = flattenQueueRows([wo({}, [{
    id: 'a', proof_status: 'awaiting_approval', proof_version: 2,
    proof_file_url: 'https://x/v2.pdf',
  }])]);
  assert.equal(r.proof, 'awaiting_approval');
  assert.equal(r.proofVersion, 2);
  assert.equal(r.proofApprovedVersion, 0);
  const badge = proofBadge(r.product);
  assert.equal(badge.key, 'awaiting');
  assert.equal(badge.label, 'Awaiting v2');
  assert.equal(badge.tone, 'wip');
}

// Chip state mapping across the states the queue surfaces.
{
  const approved = proofBadge({
    proof_status: 'approved', proof_version: 2, proof_approved_version: 2,
    proof_file_url: 'https://x/v2.pdf',
  });
  assert.equal(approved.key, 'approved');
  assert.equal(approved.label, 'Approved v2', 'chip shows the approved version');
  const none = proofBadge({});
  assert.equal(none.key, 'none');
  assert.equal(none.label, 'No proof');
  const stale = proofBadge({
    proof_status: 'approved', proof_version: 3, proof_approved_version: 1,
    proof_file_url: 'https://x/v3.pdf',
  });
  assert.equal(stale.key, 'stale', 'newer version than the approval → stale');
  assert.equal(proofBadge({ proof_status: 'revision_requested' }).key, 'revision');
  assert.equal(proofBadge({ proof_status: 'draft' }).key, 'draft');
  assert.equal(proofBadge({ proof_status: 'draft' }).label, 'Draft v1');
  assert.equal(
    proofBadge({ proof_status: 'sent', proof_version: 1, proof_file_url: 'https://x/v1.pdf' }).key,
    'awaiting', 'sent still waits on the customer');
}

rmSync(outModel);
rmSync(outProof);
rmSync(stub);
console.log('PASS queue-rows');
