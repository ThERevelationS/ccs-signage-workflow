import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-production-reports.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/productionReports.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  WIP_STATUSES, TERMINAL_STATUSES, OPERATIONAL_STATUS_LABELS,
  WORK_ORDER_STAGES, DISPOSITION_LABELS, NO_STATUS_KEY,
  canonicalStatus, isWipStatus, isTerminalStatus, isOpenProduct, isBuiltPhaseProduct,
  productValueCents, productPriority, salespersonFor, builtDay, dispositionFor,
  siteAddressLines, productPartRows, wipProductRows, wipByStatusRows,
  wipByResponsibilityRows, partNeededRows,
  PRODUCTION_REPORTS, PRODUCTION_REPORTS_BY_ID,
} = await import(pathToFileURL(out).href);

// The real J-01 engine (w-49) — every spec goes through defineReport + runReport.
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport, rowsToCsv, formatCellValue } = engine;

const NOW = new Date(2026, 10, 15, 12, 0, 0); // 2026-11-15 noon local
const AS_OF = '2026-11-15';

// --- fixtures -----------------------------------------------------------------
const prod = (over = {}) => ({
  id: 'p?', description: 'Monument Sign', operational_status: 'in_production',
  quantity: 1, quoted_total: 1000, ...over,
});
const wo = (over = {}) => ({
  id: 'wo?', title: 'WO-?', client_name: 'Acme Sign Co',
  current_stage: 'production', sales_rep: 'Sam',
  products: [], ...over,
});

const WOS = [
  wo({
    id: 'w1', title: 'WO-1001', sales_rep: 'Sam', current_stage: 'production',
    fulfillment_method: 'installation', install_location: '120 Main St',
    address_line_2: 'Suite 4', township_city: 'Milford', county: 'Clermont',
    project_install_date: '2026-11-20', date_order_created: '2026-10-01',
    products: [
      prod({ id: 'p1', operational_status: 'in_production', quoted_total: 2400, responsibility: 'Fabrication', priority: 5 }),
      prod({ id: 'p2', operational_status: 'design_review', quoted_total: 800, responsibility: 'Design', priority: 12,
             parts: [{ part_id: 'part-a', part_name: 'ACM Panel', quantity: 2, unit: 'sheet', unit_cost: 45, vendor_name: 'MetalWorks', width_in: 48, height_in: 96 }] }),
      prod({ id: 'p3', operational_status: 'built', quoted_total: 500, fulfillment_state: 'awaiting_installation',
             fulfillment_method: 'installation',
             status_history: [{ at: '2026-11-10T14:00:00Z', field: 'operational_status', from: 'in_production', to: 'built', by: 'shop' }] }),
    ],
  }),
  wo({
    id: 'w2', title: 'WO-1002', sales_rep: 'Jo', current_stage: 'design',
    fulfillment_method: 'shipping', install_location: '8 Elm Ave',
    date_order_created: '2026-11-01',
    products: [
      prod({ id: 'p4', operational_status: 'proof_approved', quoted_total: 1500, responsibility: 'Fabrication',
             line_items: [{ part_name: 'Vinyl Roll', qty: 1.5, uom: 'roll', extended_cost: 90 }] }),
      prod({ id: 'p5', operational_status: 'awaiting_proof_approval', quoted_total: 300, responsibility: '', priority: 99 }),
    ],
  }),
  wo({
    id: 'w3', title: 'WO-1003', sales_rep: '', current_stage: 'installation',
    install_location: '77 River Rd', date_order_created: '2026-09-15',
    products: [
      // Reached built via fulfillment transition (no explicit built stamp) —
      // then went out the door (picked_up = terminal fulfillment).
      prod({ id: 'p6', operational_status: 'completed', quoted_total: 700,
             fulfillment_state: 'picked_up', fulfillment_method: 'pickup',
             status_history: [
               { at: '2026-10-20T10:00:00Z', field: 'fulfillment_state', from: 'none', to: 'awaiting_pickup', by: 'shop' },
               { at: '2026-11-02T10:00:00Z', field: 'fulfillment_state', from: 'awaiting_pickup', to: 'picked_up', by: 'desk' },
             ] }),
      // Built and still waiting (no stamps at all — changed_at is the proxy).
      prod({ id: 'p7', operational_status: 'built', quoted_total: 200,
             fulfillment_state: 'awaiting_pickup', fulfillment_method: 'pickup',
             operational_status_changed_at: '2026-11-12T09:00:00Z' }),
      // Unclassified status — open but not in the locked WIP set.
      prod({ id: 'p8', operational_status: '', quoted_total: 150 }),
    ],
  }),
  // Terminal-status products — none of these may appear in WIP reports.
  wo({
    id: 'w4', title: 'WO-1004', sales_rep: 'Sam', current_stage: 'completed',
    completed: true, products: [prod({ id: 'p9', operational_status: 'in_production' })],
  }),
  wo({
    id: 'w5', title: 'WO-1005', deleted: true, products: [prod({ id: 'p10' })],
  }),
  wo({
    id: 'w6', title: 'WO-1006', current_stage: 'completed', sales_rep: 'Sam',
    products: [
      prod({ id: 'p11', operational_status: 'voided' }),
      prod({ id: 'p12', operational_status: 'completed' }),
      prod({ id: 'p13', operational_status: 'vended' }), // legacy built alias → terminal
    ],
  }),
];

const RESP_REGISTRY = [
  { name: 'Design', status: 'active', sort: 20, type: 'department' },
  { name: 'Fabrication', status: 'active', sort: 10, type: 'department' },
];
const DATA = { work_orders: WOS, responsibilities: RESP_REGISTRY };

// --- vocabulary ----------------------------------------------------------------
assert.deepEqual([...TERMINAL_STATUSES], ['built', 'completed', 'voided']);
assert.equal(WIP_STATUSES.length, 12, '12 WIP statuses incl. proof_changes_requested');
assert.ok(WIP_STATUSES.includes('proof_changes_requested'));
assert.equal(canonicalStatus(' In Design '), 'design_review', 'legacy alias folds');
assert.equal(canonicalStatus('install_or_removal_only'), 'install_removal_only');
assert.equal(canonicalStatus('vended'), 'built', 'vended held the built slot → terminal');
assert.equal(canonicalStatus('Awaiting Proof Approval'), 'awaiting_proof_approval');
assert.equal(isWipStatus('in_design'), true, 'legacy WIP alias is still WIP');
assert.equal(isWipStatus('vended'), false);
assert.equal(isTerminalStatus('vended'), true);
assert.equal(isOpenProduct(prod({ operational_status: 'none' })), true, 'unclassified status is open, not terminal');
assert.equal(isOpenProduct(prod({ operational_status: 'built' })), false);

// --- value + priority + salesperson derivations --------------------------------
assert.equal(productValueCents(prod({ quoted_total: 12.34 })), 1234);
assert.equal(productValueCents(prod({ quoted_total: undefined, quoted_unit_price: 25, quantity: 4 })), 10000, 'unit × qty fallback');
assert.equal(productPriority(prod({ priority: 7 })), 7);
assert.equal(productPriority(prod({ priority: 0, queue_priority: 42 })), 42, 'queue_priority fallback');
assert.equal(productPriority(prod({})), 0, 'unset → 0');
assert.equal(salespersonFor(wo({ sales_rep: '', salesperson: 'Pat' })), 'Pat');
assert.equal(salespersonFor(wo({ sales_rep: '', salesperson_email: 'k@x.io' })), 'k@x.io');

// --- built-day resolution chain -------------------------------------------------
{
  // 1. explicit status_history built stamp wins
  assert.equal(
    builtDay(prod({ operational_status: 'completed',
      status_history: [{ at: '2026-10-05T08:00:00Z', field: 'operational_status', to: 'built' }] })),
    '2026-10-05');
  // 2. currently built → changed_at proxy
  assert.equal(
    builtDay(prod({ operational_status: 'built', operational_status_changed_at: '2026-11-12T09:00:00Z' })),
    '2026-11-12');
  // 3. earliest fulfillment transition implies built
  assert.equal(
    builtDay(prod({ operational_status: 'completed',
      status_history: [
        { at: '2026-10-20T10:00:00Z', field: 'fulfillment_state', to: 'awaiting_pickup' },
        { at: '2026-11-02T10:00:00Z', field: 'fulfillment_state', to: 'picked_up' },
      ] })),
    '2026-10-20');
  // 4. no evidence → undated, never fabricated
  assert.equal(builtDay(prod({ operational_status: 'in_production' })), '');
  // 'vended' stamps fold to built
  assert.equal(
    builtDay(prod({ operational_status: 'completed',
      status_history: [{ at: '2026-09-30T00:00:00Z', field: 'operational_status', to: 'vended' }] })),
    '2026-09-30');
}

// --- WIP membership: terminals + dead orders out --------------------------------
const wip = wipProductRows(WOS);
const wipIds = wip.map((r) => r.product_id);
assert.deepEqual(wipIds.sort(), ['p1', 'p2', 'p4', 'p5', 'p8'],
  'WIP rows = open products on open orders; built/completed/voided/vended + deleted/completed orders out');
assert.equal(wip.find((r) => r.product_id === 'p8').status, NO_STATUS_KEY, 'blank status → no_status bucket');
assert.equal(wip.find((r) => r.product_id === 'p2').status, 'design_review');
assert.equal(wip.find((r) => r.product_id === 'p1').priority, 5);

// strict WIP membership drops the unclassified row
assert.equal(wipProductRows(WOS, { strictWip: true }).length, 4);

// --- wip_by_product_status -------------------------------------------------------
const defs = PRODUCTION_REPORTS.map((s) => defineReport(s));
assert.equal(PRODUCTION_REPORTS.length, 8);
assert.deepEqual(
  Object.keys(PRODUCTION_REPORTS_BY_ID).sort(),
  ['addresses_by_disposition', 'built_report', 'part_amount_needed', 'wip_by_built_date',
   'wip_by_order_status', 'wip_by_product_status', 'wip_by_responsibility', 'wip_by_salesperson']);
for (const d of defs) {
  assert.equal(d.category, 'production');
  assert.ok(Object.isFrozen(d));
}

const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
{
  const res = runReport(byId.wip_by_product_status, { params: {}, data: DATA, now: NOW });
  assert.equal(res.meta.reportId, 'wip_by_product_status');
  assert.deepEqual(res.rows.map((r) => r.status),
    ['awaiting_proof_approval', 'proof_approved', 'in_production', 'design_review', 'no_status'],
    'canonical WIP declaration order, no_status last');
  const prod1 = res.rows.find((r) => r.status === 'in_production');
  assert.equal(prod1.product_count, 1);
  assert.equal(prod1.value, 2400, 'quoted_total → dollars at boundary');
  assert.equal(prod1.value_cents, 240000, 'cent extras preserved');
  assert.equal(res.summary.totals.product_count, 5);
  assert.equal(res.summary.totals.order_count, 3, 'distinct orders across status groups');
  // status filter narrows to one status
  const only = runReport(byId.wip_by_product_status, {
    params: { statuses: ['design_review'] }, data: DATA, now: NOW });
  assert.deepEqual(only.rows.map((r) => r.status), ['design_review']);
}

// --- wip_by_order_status -----------------------------------------------------------
{
  const res = runReport(byId.wip_by_order_status, { params: {}, data: DATA, now: NOW });
  assert.deepEqual(res.rows.map((r) => r.stage), ['design', 'production', 'installation', 'completed'],
    'stage order canonical; w4 (order completed) excluded; open w6 lands at completed stage');
  const prodn = res.rows.find((r) => r.stage === 'production');
  assert.equal(prodn.order_count, 1);
  assert.equal(prodn.product_count, 3, 'all products on the open order counted');
  assert.equal(prodn.open_product_count, 2, 'built p3 is not open-product (terminal ops status)');
  assert.equal(prodn.value, 3700, '2400+800+500');
  const inst = res.rows.find((r) => r.stage === 'installation');
  assert.equal(inst.open_product_count, 1, 'only p8 is open on w3 (completed/picked_up + built out)');
  assert.equal(res.rows.find((r) => r.stage === 'completed').open_product_count, 0,
    'w6 open order with all-terminal products reports zero open products');
}

// --- wip_by_salesperson -------------------------------------------------------------
{
  const res = runReport(byId.wip_by_salesperson, { params: {}, data: DATA, now: NOW });
  const sam = res.rows.find((r) => r.salesperson === 'Sam');
  assert.equal(sam.product_count, 2, 'Sam owns p1+p2 on w1');
  assert.equal(sam.value, 3200);
  const un = res.rows.find((r) => r.salesperson === '(unassigned)');
  assert.equal(un.product_count, 1, 'p8 (w3, no rep)');
  assert.equal(res.rows.find((r) => r.salesperson === 'Jo').product_count, 2);
  assert.equal(res.summary.totals.order_count, 3);
}

// --- wip_by_responsibility ------------------------------------------------------------
{
  const res = runReport(byId.wip_by_responsibility, { params: {}, data: DATA, now: NOW });
  assert.deepEqual(res.rows.map((r) => r.responsibility),
    ['Fabrication', 'Design', '(no responsibility)'],
    'registry sort order (Fab sort 10 < Design 20), unassigned last');
  const fab = res.rows[0];
  assert.equal(fab.product_count, 2, 'p1 + p4');
  assert.equal(fab.min_priority, 5, 'best (lowest) 1-99 priority');
  assert.equal(fab.avg_priority, 5, 'only p1 is prioritized; unprioritized rows never pollute the avg');
  assert.equal(fab.prioritized_count, 1);
  assert.equal(res.rows[1].min_priority, 12, 'Design group holds p2 priority 12');
  const none = res.rows[2];
  assert.equal(none.product_count, 2, 'p5 + p8 have no responsibility');
  assert.equal(none.min_priority, 99);
  // no registry → alphabetical, unassigned still last
  const plain = wipByResponsibilityRows(wip, []);
  assert.deepEqual(plain.map((r) => r.responsibility), ['Design', 'Fabrication', '(no responsibility)']);
}

// --- built-phase membership + wip_by_built_date ---------------------------------------
assert.equal(isBuiltPhaseProduct(prod({ operational_status: 'built' })), true);
assert.equal(isBuiltPhaseProduct(prod({ operational_status: 'in_production', fulfillment_state: 'awaiting_shipping' })), true);
assert.equal(isBuiltPhaseProduct(prod({ operational_status: 'built', fulfillment_state: 'picked_up' })), false, 'left the shop');
assert.equal(isBuiltPhaseProduct(prod({ operational_status: 'completed', fulfillment_state: 'awaiting_pickup' })), false, 'ops completed wins');

{
  const res = runReport(byId.wip_by_built_date, {
    params: { as_of: AS_OF, date_range: { preset: 'custom' } }, data: DATA, now: NOW });
  assert.deepEqual(res.rows.map((r) => r.built_date), ['2026-11-10', '2026-11-12', '(undated)'],
    'built-phase products grouped by built day; vended p13 has no built evidence → (undated)');
  assert.equal(res.rows[0].product_count, 1);
  assert.equal(res.rows[0].max_days_waiting, 5, 'Nov 10 → Nov 15');
  assert.equal(res.rows[1].max_days_waiting, 3);
  // bounded range drops out-of-window days
  const win = runReport(byId.wip_by_built_date, {
    params: { as_of: AS_OF, date_range: { preset: 'custom', from: '2026-11-11', to: '2026-11-30' } },
    data: DATA, now: NOW });
  assert.deepEqual(win.rows.map((r) => r.built_date), ['2026-11-12']);
}

// --- addresses_by_disposition ---------------------------------------------------------
{
  const res = runReport(byId.addresses_by_disposition, { params: {}, data: DATA, now: NOW });
  assert.deepEqual(res.rows.map((r) => r.disposition_label),
    ['Pickup', 'Installation', 'Shipping', '(unassigned)', '(unassigned)'],
    'method order; unassigned rows last (w3 methodless product + w6 vended product)');
  const pickup = res.rows.find((r) => r.disposition === 'pickup');
  assert.equal(pickup.order_ref, 'WO-1003');
  assert.equal(pickup.address, '77 River Rd');
  const inst = res.rows.find((r) => r.disposition === 'installation');
  assert.equal(inst.address, '120 Main St, Suite 4, Milford, Clermont');
  assert.equal(inst.product_count, 3, 'p1+p2 unfulfilled + p3 awaiting_installation share the method');
  const ship = res.rows.find((r) => r.disposition === 'shipping');
  assert.equal(ship.address, '8 Elm Ave');
  // disposition filter
  const onlyShip = runReport(byId.addresses_by_disposition, {
    params: { dispositions: ['shipping'] }, data: DATA, now: NOW });
  assert.equal(onlyShip.rows.length, 1);
  assert.equal(onlyShip.rows[0].disposition, 'shipping');
  // siteAddressLines billing fallback
  assert.deepEqual(siteAddressLines(wo({ install_location: '', billing_address: 'PO Box 9' })), ['PO Box 9']);
  assert.equal(dispositionFor(wo({ fulfillment_method: 'delivery' }), prod({ fulfillment_method: 'pickup' })), 'pickup', 'product method beats order method');
  assert.equal(dispositionFor(wo({ fulfillment_method: 'delivery' }), prod({ fulfillment_state: 'awaiting_shipping' })), 'shipping', 'state-implied beats order default');
}

// --- built_report -----------------------------------------------------------------------
{
  const res = runReport(byId.built_report, {
    params: { date_range: { preset: 'custom', from: '2026-10-01', to: '2026-11-30' } },
    data: DATA, now: NOW });
  assert.deepEqual(res.rows.map((r) => [r.built_date, r.product_id]),
    [['2026-10-20', 'p6'], ['2026-11-10', 'p3'], ['2026-11-12', 'p7']],
    'built transitions in period incl. the since-picked-up p6 (fulfillment stamp = built evidence)');
  const p6 = res.rows[0];
  assert.equal(p6.days_to_build, 35, 'Sep 15 → Oct 20');
  assert.equal(p6.disposition_label, 'Pickup');
  assert.equal(res.rows[1].days_to_build, 40, 'Oct 1 → Nov 10');
  assert.equal(res.summary.totals.value, 1400, '700+500+200');
  // outside the window → gone
  const narrow = runReport(byId.built_report, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' } },
    data: DATA, now: NOW });
  assert.deepEqual(narrow.rows.map((r) => r.product_id), ['p3', 'p7']);
  // completed order (w4) still reports — its products were built… but p9 has no built evidence → nothing
  const w4only = runReport(byId.built_report, {
    params: { date_range: { preset: 'custom' } },
    data: { work_orders: [WOS[3]] }, now: NOW });
  assert.equal(w4only.rows.length, 0, 'no built evidence → no rows (never fabricated)');
}

// --- part_amount_needed ------------------------------------------------------------------
{
  // embedded part list resolution
  const p2rows = productPartRows(WOS[0].products[1], WOS[0]);
  assert.equal(p2rows.source, 'parts');
  assert.equal(p2rows.rows[0].part_name, 'ACM Panel');
  // materials[] manifest fallback
  const manifestWo = wo({
    id: 'wm', title: 'WO-M', products: [prod({ id: 'pm', builder_product_id: 'bp9', quantity: 2 })],
    materials: [
      { builder_product_id: 'bp9', part_name: 'LED Module', quantity: 4, unit: 'ea', unit_cost: 10, vendor_id: 'v-77' },
      { builder_product_id: 'other', part_name: 'Nope', quantity: 99 },
    ],
  });
  const mrows = productPartRows(manifestWo.products[0], manifestWo);
  assert.equal(mrows.source, 'materials');
  assert.equal(mrows.rows.length, 1, 'only the linked manifest row');

  const res = runReport(byId.part_amount_needed, {
    params: { date_range: { preset: 'custom' } }, data: DATA, now: NOW });
  const acm = res.rows.find((r) => r.part === 'ACM Panel');
  assert.equal(acm.needed, 2, 'qty 2 × product qty 1');
  assert.equal(acm.open_products, 1);
  assert.equal(acm.vendor, 'MetalWorks');
  assert.equal(acm.dimensions, '48 × 96');
  assert.equal(acm.needed_value, 90, '2 sheets × $45');
  const vinyl = res.rows.find((r) => r.part === 'Vinyl Roll');
  assert.equal(vinyl.needed, 1.5, 'fractional qty survives');
  assert.equal(vinyl.unit, 'roll');
  assert.equal(vinyl.needed_value, 90, 'extended_cost');

  // qty × open count across products
  const multi = [
    wo({ id: 'm1', title: 'M1', products: [
      prod({ id: 'a', operational_status: 'in_production', quantity: 3,
             parts: [{ part_name: 'Alum Rail', quantity: 2, unit: 'ea', unit_cost: 5 }] }),
      prod({ id: 'b', operational_status: 'design_review', quantity: 1,
             parts: [{ part_name: 'Alum Rail', quantity: 2, unit: 'ea', unit_cost: 5 }] }),
      prod({ id: 'c', operational_status: 'built', // terminal → excluded
             parts: [{ part_name: 'Alum Rail', quantity: 50 }] }),
    ] }),
  ];
  const need = partNeededRows(multi, {});
  assert.equal(need.length, 1, 'same part across products collapses to one row');
  assert.equal(need[0].needed, 8, '2×3 + 2×1; built product contributes nothing');
  assert.equal(need[0].open_products, 2);
  assert.equal(need[0].needed_cents, 4000, '$5 × 8');

  // demand-status narrowing: statuses param restricts membership
  const des = partNeededRows(multi, { statuses: ['design_review'] });
  assert.equal(des[0].needed, 2, 'only the design_review product');

  // date-basis filter: due basis uses product_due_date
  const dated = [
    wo({ id: 'd1', title: 'D1', products: [
      prod({ id: 'x', operational_status: 'in_production', product_due_date: '2026-11-20',
             parts: [{ part_name: 'Face', quantity: 1 }] }),
      prod({ id: 'y', operational_status: 'in_production', product_due_date: '2026-12-20',
             parts: [{ part_name: 'Face', quantity: 5 }] }),
    ] }),
  ];
  const dueWin = partNeededRows(dated, { basis: 'due', range: { from: '2026-11-01', to: '2026-11-30' } });
  assert.equal(dueWin[0].needed, 1, 'only the Nov-due product counts');
  const creWin = partNeededRows([
    wo({ id: 'd2', title: 'D2', date_order_created: '2026-12-05', products: [
      prod({ id: 'z', operational_status: 'in_production', parts: [{ part_name: 'Face', quantity: 7 }] }),
    ] }),
  ], { basis: 'created', range: { from: '2026-11-01', to: '2026-11-30' } });
  assert.equal(creWin.length, 0, 'Dec-created order out of the created-date window');
}

// --- engine interop ----------------------------------------------------------------------
{
  const res = runReport(byId.built_report, {
    params: { date_range: { preset: 'custom' } }, data: DATA, now: NOW });
  const csv = rowsToCsv(res.columns, res.rows);
  assert.ok(csv.includes('WO-1001'), 'CSV emits built rows');
  assert.equal(res.meta.category, 'production');
  assert.equal(formatCellValue(0.5, { format: 'percent' }), '50.0%');
  assert.equal(formatCellValue(2400, { format: 'money' }), '$2,400.00');
}

rmSync(out, { force: true });
console.log('PASS production-reports');
