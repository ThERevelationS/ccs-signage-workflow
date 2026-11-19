import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// D-03 + D-04 + D-07 — Job workspace tab model / Order Details margin /
// actions-row gating. Bundles the four pure models + profitability.js for the
// cent-exact parity check (same esbuild convention as test-job-workspace.mjs).

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-jwt-stub.mjs');
const outs = {
  tabs: resolve(here, '.tmp-jwt-tabs.mjs'),
  details: resolve(here, '.tmp-jwt-details.mjs'),
  actions: resolve(here, '.tmp-jwt-actions.mjs'),
  invoice: resolve(here, '.tmp-jwt-invoice.mjs'),
  slip: resolve(here, '.tmp-jwt-slip.mjs'),
  prof: resolve(here, '.tmp-jwt-prof.mjs'),
};
writeFileSync(stub, 'export const base44 = {}; export const staffEntities = {}; export default {};\n');
const build = (entry, outfile) => buildSync({
  entryPoints: [resolve(here, entry)],
  bundle: true, format: 'esm', outfile, logLevel: 'silent',
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub },
});

build('../src/components/jobs/jobWorkspaceTabsModel.js', outs.tabs);
build('../src/components/jobs/orderDetailsModel.js', outs.details);
build('../src/components/jobs/jobActionsModel.js', outs.actions);
build('../src/components/jobs/invoicePrintTemplate.js', outs.invoice);
build('../src/components/jobs/packingSlipTemplate.js', outs.slip);
build('../src/components/estimator/profitability.js', outs.prof);

const tabs = await import(pathToFileURL(outs.tabs).href);
const details = await import(pathToFileURL(outs.details).href);
const actions = await import(pathToFileURL(outs.actions).href);
const invoice = await import(pathToFileURL(outs.invoice).href);
const slip = await import(pathToFileURL(outs.slip).href);
const { computeEstimateProfitability } = await import(pathToFileURL(outs.prof).href);

const {
  JOB_WORKSPACE_TABS, JOB_WORKSPACE_TAB_KEYS, DEFAULT_JOB_WORKSPACE_TAB,
  LAZY_ACTIVITY_TABS, resolveWorkspaceTab, tabNeedsActivityFeed,
  orderContactFields, addressInfoGroups, orderNoteRows, orderNoteCounts,
  productOverrideRows, isOverrideEvent, overrideEventRows,
  statusHistoryEvents, conversionEvents, workspaceOrderHistoryFeed,
  workspaceTabBadges,
} = tabs;
const {
  productSellCents, productCostCents, productMarginRows, orderMarginSummary,
  toCents, fromCents, marginPctOf,
} = details;
const {
  JOB_WORKSPACE_ACTIONS, JOB_WORKSPACE_ACTION_KEYS, actionStates, actionStateMap,
  liveInvoices, payableInvoices, primaryInvoice, userRole,
} = actions;
const {
  normalizeInvoiceViewSettings, DEFAULT_INVOICE_VIEW_SETTINGS,
  INVOICE_VIEW_SETTING_OPTIONS, buildInvoicePrintModel, renderInvoicePrintHtml,
} = invoice;
const { renderPackingSlipHtml } = slip;

// ============================================================================
// Fixture — a converted order: estimate-linked products, one explicit cost,
// one costless row, one overridden product, embedded status history +
// conversion events, notes in all channels.
// ============================================================================
const wo = {
  id: 'wo1',
  estimate_id: 'est1',
  opportunity_id: 'opp1',
  corbridge_invoice_number: 'INV-1001',
  client_name: 'Acme Signs',
  customer_id: 'cust1',
  contact_name: 'Jamie Site',
  contact_email: 'jamie@acme.test',
  contact_phone: '555-0100',
  additional_contact: 'Pat Backup',
  representative: 'Jamie Site',
  sales_rep: 'Dana Sales',
  project_manager: 'PM Pete',
  entered_by: 'estimator@shop.test',
  install_location: '120 Main St',
  address_line_2: 'Suite 4',
  township_city: 'Springfield',
  county: 'Sangamon',
  zip: '62701',
  billing_address: '1 Billing Way',
  current_stage: 'production',
  notes: [
    { id: 'n1', text: 'Customer wants blue accents', created_by: 'dana@shop.test', timestamp: '2026-10-20T09:00:00Z', completed: false },
  ],
  work_notes: [
    { id: 'w1', type: 'production', text: 'Use 3M vinyl only', author: 'shop@x.test', created_at: '2026-10-21T10:00:00Z' },
  ],
  products: [
    { id: 'p1', description: 'Channel Letters', module_key: 'channel_letter',
      estimate_line_id: 'L1', quantity: 2, quoted_unit_price: 1200, quoted_total: 2400,
      overridden: true, overridden_at: '2026-10-22T14:00:00Z', overridden_by: 'dana@shop.test',
      override_edits: [{ field: 'quoted_unit_price', from: 1100, to: 1200 }],
      status_history: [
        { at: '2026-10-28T10:00:00Z', field: 'operational_status', from: 'order_review', to: 'in_design', by: 'ann@x.test' },
        { at: '2026-10-30T09:00:00Z', field: 'operational_status', from: 'in_design', to: 'in_production', by: 'bob@x.test' },
      ],
      notes: [
        { channel: 'production', text: 'Raceway mount', author: 'shop@x.test', created_at: '2026-10-23T08:00:00Z', id: 'pn1' },
        { channel: 'vendor', text: 'Vendor needs artwork by Fri', author: 'dana@shop.test', created_at: '2026-10-24T08:00:00Z', id: 'pn2' },
      ] },
    { id: 'p2', description: 'Monument Panel', estimate_line_id: 'L2',
      quantity: 3, quoted_unit_price: 500,
      status_history: [] },
    { id: 'p3', description: 'Install Labor', ext_cost: 300, quantity: 1, quoted_total: 400 },
    { id: 'p4', description: 'TBD Signage', quantity: 1, quoted_total: 250 },
  ],
  conversion_events: [
    { id: 'ce1', schema_version: 1, event_type: 'conversion',
      label: 'Estimate Converted to Order - via product status (in_production)',
      actor_type: 'system', actor_label: 'system', occurred_at: '2026-10-25T12:00:00Z',
      product_label: 'Channel Letters' },
  ],
};

const estimate = {
  id: 'est1',
  line_items: [
    { line_id: 'L1', builder_product_id: 'bp1', total_snapshot: 600, customer_quantity: 2 },
    { line_id: 'L2', builder_product_id: 'bp2', total_snapshot: 300, customer_quantity: 3 },
  ],
};

const admin = { email: 'admin@shop.test', role: 'admin' };
const staff = { email: 'staff@shop.test', role: 'staff' };
const SESSION = 'tok-1';

// ============================================================================
// D-03 — tab registry completeness
// ============================================================================
assert.equal(JOB_WORKSPACE_TABS.length, 7, 'exactly seven tabs');
assert.deepEqual(JOB_WORKSPACE_TAB_KEYS,
  ['products', 'contact', 'address', 'notes', 'history', 'overrides', 'payments'],
  'tab order matches the CoreBridge strip');
assert.deepEqual(JOB_WORKSPACE_TABS.map((t) => t.label),
  ['Products', 'Order Contact', 'Address Info', 'Notes', 'Order History', 'Overrides', 'Payments']);
assert.equal(DEFAULT_JOB_WORKSPACE_TAB, 'products');
assert.deepEqual([...LAZY_ACTIVITY_TABS].sort(), ['history', 'overrides'],
  'only history + overrides are lazy');
// ?tab= resolution + CoreBridge-name aliases + safe fallback.
assert.equal(resolveWorkspaceTab('order_history'), 'history');
assert.equal(resolveWorkspaceTab('Address Info'), 'address');
assert.equal(resolveWorkspaceTab('order-contact'), 'contact');
assert.equal(resolveWorkspaceTab('payments'), 'payments');
assert.equal(resolveWorkspaceTab('bogus'), 'products', 'unknown tab falls back');
assert.equal(resolveWorkspaceTab(''), 'products');
assert.equal(tabNeedsActivityFeed('history'), true);
assert.equal(tabNeedsActivityFeed('overrides'), true);
assert.equal(tabNeedsActivityFeed('products'), false);
assert.equal(tabNeedsActivityFeed('payments'), false, 'payments reuses the mounted financials read');

// --- Order Contact tab -------------------------------------------------------
{
  const fields = Object.fromEntries(orderContactFields(wo).map((f) => [f.key, f]));
  assert.equal(fields.customer.value, 'Acme Signs');
  assert.equal(fields.contact_name.value, 'Jamie Site');
  assert.equal(fields.contact_email.value, 'jamie@acme.test');
  assert.equal(fields.additional_contact.value, 'Pat Backup');
  assert.equal(fields.salesperson.value, 'Dana Sales');
  assert.equal(fields.project_manager.value, 'PM Pete');
  assert.equal(fields.entered_by.value, 'estimator@shop.test');
  assert.equal(fields.contact_name.missing, false);
  const sparse = Object.fromEntries(orderContactFields({ id: 'x' }).map((f) => [f.key, f]));
  assert.equal(sparse.contact_name.missing, true, 'absent fields flagged missing, never fabricated');
}

// --- Address Info tab --------------------------------------------------------
{
  const groups = addressInfoGroups(wo);
  assert.equal(groups[0].key, 'site');
  assert.equal(groups[0].attention, 'Jamie Site');
  assert.ok(groups[0].lines.includes('120 Main St'));
  assert.ok(groups[0].lines.includes('Suite 4'));
  assert.equal(groups[0].lines.at(-1), 'Springfield, Sangamon 62701',
    'city/state/zip line resolves township_city + county + zip chain');
  assert.equal(groups[1].key, 'billing');
  assert.deepEqual(groups[1].lines, ['1 Billing Way']);
  assert.equal(groups.length, 2, 'no ship-to block without ship-to fields (packing-slip rule)');
  const withShip = addressInfoGroups({ ...wo, ship_to_name: 'Drop Yard', ship_to_address: '9 Dock Rd' });
  assert.equal(withShip.length, 3);
  assert.deepEqual(withShip[2].lines, ['9 Dock Rd']);
  assert.equal(addressInfoGroups({ id: 'x' })[0].missing, true);
}

// --- Notes tab ----------------------------------------------------------------
{
  const rows = orderNoteRows(wo);
  assert.equal(rows.length, 4, 'order + work + 2 product notes');
  const scopes = rows.map((r) => r.scope).sort();
  assert.deepEqual(scopes, ['order', 'product', 'product', 'work']);
  // jobWorkspace surface sees ALL channels — including vendor (fail-closed
  // surfaces like portals would hide it).
  const vendor = rows.find((r) => r.channel === 'vendor');
  assert.ok(vendor, 'vendor-channel note visible on the workspace surface');
  assert.equal(vendor.product, 'Channel Letters');
  assert.equal(rows[0].at >= rows.at(-1).at, true, 'newest first');
  const counts = orderNoteCounts(wo);
  assert.equal(counts.total, 4);
  assert.equal(counts.by_scope.product, 2);
  // Portal surface would NOT see the production/vendor product notes —
  // proves the channel gate runs through notesForSurface.
  assert.equal(orderNoteRows(wo, { surface: 'portal' }).length, 2,
    'portal sees order+work notes but zero product notes (no customer channel)');
}

// --- Overrides tab -------------------------------------------------------------
{
  const flagged = productOverrideRows(wo);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].name, 'Channel Letters');
  assert.equal(flagged[0].badge, 'Overridden during order entry');
  assert.ok(flagged[0].tooltip.includes('dana@shop.test'), 'tooltip names the actor');
  assert.equal(flagged[0].edits.length, 1);
  assert.equal(productOverrideRows({ products: [{ id: 'x' }] }).length, 0);

  assert.equal(isOverrideEvent({ event_type: 'price_override' }), true);
  assert.equal(isOverrideEvent({ event_type: 'override' }), true);
  assert.equal(isOverrideEvent({ details: { override_type: 'price_override' } }), true);
  assert.equal(isOverrideEvent({ event_type: 'status_change' }), false);

  const evts = overrideEventRows([
    { id: 'e1', event_type: 'price_override', product_label: 'Channel Letters',
      from_value: 1100, to_value: 1200, actor_label: 'dana@shop.test',
      occurred_at: '2026-10-22T14:00:00Z' },
    { id: 'e2', event_type: 'status_change', occurred_at: '2026-10-22T15:00:00Z' },
  ]);
  assert.equal(evts.length, 1, 'status noise filtered out of the override feed');
  assert.equal(evts[0].product, 'Channel Letters');
  assert.equal(evts[0].from, 1100);
}

// --- Order History tab ----------------------------------------------------------
{
  const statusEvts = statusHistoryEvents(wo);
  assert.equal(statusEvts.length, 2);
  assert.equal(statusEvts[0].product_name, 'Channel Letters');
  assert.equal(conversionEvents(wo).length, 1);

  const feed = workspaceOrderHistoryFeed(wo, {
    productEvents: [
      { id: 'pa1', event_type: 'price_override', product_label: 'Channel Letters',
        occurred_at: '2026-10-22T14:00:00Z', actor_label: 'dana@shop.test', actor_type: 'staff',
        label: 'Price override: quoted_unit_price' },
      // duplicate of the embedded conversion event — must dedupe by id/key
      { id: 'ce1', event_type: 'conversion', occurred_at: '2026-10-25T12:00:00Z', label: 'dup' },
    ],
    activities: [
      { id: 'a1', summary: 'Customer called about install', occurred_at: '2026-10-26T10:00:00Z',
        actor: 'dana@shop.test', actor_type: 'staff' },
    ],
    payments: [
      { id: 'pay1', amount: 500, method: 'check', status: 'recorded', paid_date: '2026-10-29T00:00:00Z' },
    ],
  });
  // 2 status + 1 conversion + 1 ProductActivity + 1 activity + 1 payment = 6
  // (the 'ce1' duplicate collapses).
  assert.equal(feed.length, 6, `merged feed dedupes (got ${feed.length})`);
  const types = feed.map((r) => r.event_type);
  assert.ok(types.includes('price_override'));
  assert.ok(types.includes('conversion'));
  assert.ok(types.includes('payment'));
  assert.ok(feed[0].occurred_at <= feed.at(-1).occurred_at, 'chronological');
  assert.ok(feed.every((r) => ['staff', 'customer', 'vendor', 'system'].includes(r.actor_type)));
}

// --- Tab badges -----------------------------------------------------------------
{
  const badges = workspaceTabBadges(wo, { payments: [{ id: 'p' }] });
  assert.equal(badges.products, 4);
  assert.equal(badges.notes, 4);
  assert.equal(badges.overrides, 1);
  assert.equal(badges.payments, 1);
}

// ============================================================================
// D-04 — margin model: cent-exact + profitability.js parity
// ============================================================================

// Sell side: quoted_total wins; unit×qty fallback; null never invents $0.
assert.equal(productSellCents(wo.products[0]), 240000);
assert.equal(productSellCents(wo.products[1]), 150000, 'unit price × qty');
assert.equal(productSellCents({ quantity: 2 }), null);
assert.equal(productSellCents({ quoted_total: 0 }), 0, 'a comped $0 line is real');

// Cost-basis precedence per product.
{
  assert.deepEqual(productCostCents(wo.products[2]), { cents: 30000, basis: 'product', uncosted_parts: 0 },
    'explicit ext_cost wins');
  const c1 = productCostCents(wo.products[0], { estimate });
  assert.equal(c1.cents, 120000, 'estimate line: 600 × qty 2');
  assert.equal(c1.basis, 'estimate');
  const c2 = productCostCents(wo.products[1], { estimate });
  assert.equal(c2.cents, 90000, 'estimate line: 300 × qty 3');
  const c4 = productCostCents(wo.products[3], { estimate });
  assert.equal(c4.cents, null, 'unresolved cost stays null — never a fake $0');
  // Parts manifest basis: WO materials[] referenced by the product.
  const woParts = {
    products: [{ id: 'px', quantity: 1, parts: [{ part_type: 'material', quantity: 2, unit_cost: 50 }] }],
  };
  const cp = productCostCents(woParts.products[0]);
  assert.equal(cp.basis, 'parts');
  assert.equal(cp.cents, 10000);
  // Explicit cost beats parts.
  const cx = productCostCents({ ext_cost: 10, parts: [{ part_type: 'material', quantity: 2, unit_cost: 50 }] });
  assert.equal(cx.basis, 'product');
}

// Per-product rows + order rollup.
{
  const rows = productMarginRows(wo, { estimate });
  assert.equal(rows.length, 4);
  const [r1, r2, r3, r4] = rows;
  assert.equal(r1.sell_cents, 240000);
  assert.equal(r1.cost_cents, 120000);
  assert.equal(r1.margin_cents, 120000);
  assert.equal(r1.margin_pct, 50);
  assert.equal(r1.overridden, true);
  assert.equal(r1.override_badge, 'Overridden during order entry');
  assert.equal(r2.sell_cents, 150000);
  assert.equal(r2.margin_cents, 60000);
  assert.equal(r3.cost_basis, 'product');
  assert.equal(r3.margin_cents, 10000);
  assert.equal(r4.cost_cents, null);
  assert.equal(r4.margin_cents, null, 'unresolved rows contribute no margin, not $0');
  assert.equal(r4.overridden, false);

  const s = orderMarginSummary(rows, { workOrder: wo });
  assert.equal(s.sell_cents, 455000, '2400 + 1500 + 400 + 250 in cents');
  assert.equal(s.cost_cents, 240000, '1200 + 900 + 300 in cents');
  assert.equal(s.margin_cents, 215000);
  assert.equal(s.resolved_products, 3);
  assert.equal(s.unresolved_products, 1);
  assert.equal(s.partial, true, 'partial flag when any product cost is unresolved');
  assert.ok(Math.abs(s.margin_pct - (215000 / 455000) * 100) < 0.005);
  assert.ok(Math.abs(s.markup_pct - (215000 / 240000) * 100) < 0.005);

  // Cent-exact parity with profitability.js on the estimate-linked subset:
  // estimate basis = Σ total_snapshot × customer_quantity =
  // acceptedInternalEstimateCost(line_items); revenue basis = product quoted
  // sum with no discount/contingency.
  const linkedWo = { ...wo, products: [wo.products[0], wo.products[1]] };
  const linkedRows = productMarginRows(linkedWo, { estimate });
  const linkedSummary = orderMarginSummary(linkedRows);
  const prof = computeEstimateProfitability(estimate, { subtotal: 3900, discount: 0, contingency: 0 });
  assert.equal(linkedSummary.cost_cents, toCents(prof.internalCost),
    'internal cost parity: Σ total_snapshot × customer_quantity, cent-exact');
  assert.equal(linkedSummary.margin_cents, toCents(prof.grossProfit),
    'gross profit parity, cent-exact');
  assert.ok(Math.abs(linkedSummary.margin_pct - prof.grossMarginPercent) < 0.005, 'margin% parity');
  assert.ok(Math.abs(linkedSummary.markup_pct - prof.markupOnCostPercent) < 0.005, 'markup% parity');

  // toCents rounding convention: half AWAY FROM ZERO, float-dust safe
  // (marginModel.ts line 173 convention — the sign-carrying epsilon makes
  // ±x.xx5 land on the away-from-zero side in both directions).
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(marginPctOf(0, 0), 0, 'zero sell → 0%, never NaN');
}

// ============================================================================
// D-07 — actions registry + role × status × confirm gating matrix
// ============================================================================
assert.equal(JOB_WORKSPACE_ACTIONS.length, 7, 'exactly seven actions');
assert.deepEqual(JOB_WORKSPACE_ACTION_KEYS,
  ['edit', 'clone', 'print_email_invoice', 'packing_slip', 'invoice_view_settings', 'void', 'enter_payment']);
assert.deepEqual(JOB_WORKSPACE_ACTIONS.map((a) => a.label),
  ['Edit', 'Clone', 'Print/Email Invoice', 'Packing Slip', 'Invoice View Settings', 'Void', 'Enter Payment']);
// The two additions the brief called out are present.
assert.ok(JOB_WORKSPACE_ACTION_KEYS.includes('packing_slip'));
assert.ok(JOB_WORKSPACE_ACTION_KEYS.includes('invoice_view_settings'));
const voidDef = JOB_WORKSPACE_ACTIONS.find((a) => a.key === 'void');
assert.deepEqual(voidDef.roles, ['admin'], 'void is role-gated to admin');
assert.equal(voidDef.confirm, 'reason', 'void is confirm-guarded with a required reason');
assert.equal(voidDef.dangerous, true);

const sentInv = { id: 'i1', work_order_id: 'wo1', status: 'sent', total: 1000, amount_paid: 200, balance_due: 800, invoice_number: 'INV-9' };
const paidInv = { id: 'i2', work_order_id: 'wo1', status: 'paid', total: 500, amount_paid: 500, balance_due: 0 };
const voidInv = { id: 'i3', work_order_id: 'wo1', status: 'void', total: 99 };

const ctx = (over = {}) => ({
  user: admin, sessionToken: SESSION, workOrder: wo,
  invoices: [sentInv], payments: [], financialsLoaded: true, ...over,
});

// role × status matrix for void + payment.
{
  // staff cannot even SEE void (role gate).
  let m = actionStateMap(ctx({ user: staff }));
  assert.equal(m.void.visible, false, 'staff sees no Void button');
  assert.equal(m.void.enabled, false);

  // signed out: every session-needing action disables with a reason.
  m = actionStateMap(ctx({ sessionToken: '' }));
  for (const k of ['clone', 'print_email_invoice', 'void', 'enter_payment']) {
    assert.equal(m[k].enabled, false, `${k} disabled signed-out`);
    assert.ok(m[k].reason, `${k} carries a reason`);
  }
  assert.equal(m.edit.enabled, true, 'edit needs no session');
  assert.equal(m.packing_slip.enabled, true, 'packing slip renders offline');
  assert.equal(m.invoice_view_settings.enabled, true);

  // terminal states: void disabled.
  m = actionStateMap(ctx({ workOrder: { ...wo, lifecycle_state: 'closed' } }));
  assert.equal(m.void.enabled, false, 'closed order cannot be voided');
  m = actionStateMap(ctx({ workOrder: { ...wo, lifecycle_state: 'voided' } }));
  assert.equal(m.void.enabled, false, 'already-voided cannot re-void');
  m = actionStateMap(ctx({ workOrder: { ...wo, deleted: true } }));
  assert.equal(m.void.enabled, false, 'deleted resolves voided → disabled');

  // happy path: admin + session + live order → enabled.
  m = actionStateMap(ctx());
  assert.equal(m.void.visible, true);
  assert.equal(m.void.enabled, true);

  // money held → enabled but warns (refund AR before voiding).
  m = actionStateMap(ctx({ invoices: [paidInv] }));
  assert.equal(m.void.enabled, true);
  assert.ok(m.void.warn.includes('500'), 'paid money surfaces a warn note');

  // enter_payment needs an open balance on a live invoice.
  m = actionStateMap(ctx());
  assert.equal(m.enter_payment.enabled, true);
  assert.equal(m.enter_payment.invoice_count, 1);
  m = actionStateMap(ctx({ invoices: [paidInv] }));
  assert.equal(m.enter_payment.enabled, false, 'no open balance → disabled');
  m = actionStateMap(ctx({ invoices: [voidInv] }));
  assert.equal(m.enter_payment.enabled, false, 'void invoices are not payable');
  m = actionStateMap(ctx({ invoices: [{ ...sentInv, status: 'draft' }] }));
  assert.equal(m.enter_payment.enabled, false, 'draft invoices are not payable');
  m = actionStateMap(ctx({ invoices: [] }));
  assert.equal(m.enter_payment.enabled, false);

  // print_email_invoice needs a live non-draft invoice.
  m = actionStateMap(ctx());
  assert.equal(m.print_email_invoice.enabled, true);
  m = actionStateMap(ctx({ invoices: [{ ...sentInv, status: 'draft' }] }));
  assert.equal(m.print_email_invoice.enabled, false, 'draft-only → disabled');
  m = actionStateMap(ctx({ invoices: [] }));
  assert.equal(m.print_email_invoice.enabled, false, 'no invoice → disabled');

  // clone needs a source estimate.
  m = actionStateMap(ctx());
  assert.equal(m.clone.enabled, true);
  m = actionStateMap(ctx({ workOrder: { ...wo, estimate_id: '' } }));
  assert.equal(m.clone.enabled, false, 'no estimate to clone');

  // packing slip needs at least one product (incl. legacy product_N fields).
  m = actionStateMap(ctx({ workOrder: { ...wo, products: [] } }));
  assert.equal(m.packing_slip.enabled, false);
  m = actionStateMap(ctx({ workOrder: { ...wo, products: [], product_1: 'Legacy Sign' } }));
  assert.equal(m.packing_slip.enabled, true, 'legacy product_1 counts');

  // while the financials query is still resolving, invoice actions wait —
  // they never gate on a half-loaded invoice list.
  m = actionStateMap(ctx({ financialsLoaded: false }));
  assert.equal(m.enter_payment.enabled, false);
  assert.equal(m.print_email_invoice.enabled, false);

  // invoice helpers.
  assert.equal(liveInvoices(wo, [sentInv, voidInv, { ...sentInv, id: 'i9', work_order_id: 'woX' }]).length, 1);
  assert.equal(payableInvoices(wo, [sentInv, paidInv]).length, 1);
  assert.equal(primaryInvoice(wo, [paidInv, sentInv]).id, 'i1', 'open balance wins');
  assert.equal(userRole(admin), 'admin');
  assert.equal(userRole(staff), 'staff');
  assert.equal(userRole({ email: 'x' }), 'staff');
}

// ============================================================================
// Invoice print + view settings + packing slip presence
// ============================================================================
{
  const s = normalizeInvoiceViewSettings({ show_internal: true, bogus: 1, itemize: 'yes' });
  assert.equal(s.show_internal, true);
  assert.equal(s.itemize, true, 'non-boolean falls back to default');
  assert.equal('bogus' in s, false, 'unknown keys dropped');
  assert.deepEqual(Object.keys(s), Object.keys(DEFAULT_INVOICE_VIEW_SETTINGS));
  assert.equal(INVOICE_VIEW_SETTING_OPTIONS.length, 4);
  assert.equal(DEFAULT_INVOICE_VIEW_SETTINGS.show_internal, false,
    'internal figures are opt-in — never default onto a customer document');

  const model = buildInvoicePrintModel(sentInv, {
    workOrder: wo,
    company: { name: 'CCS Signage', phone: '555-0000' },
    settings: null,
    payments: [{ id: 'p1', amount: 200, method: 'check', payment_date: '2026-10-29' }],
  });
  assert.equal(model.invoice_number, 'INV-9');
  assert.equal(model.customer_name, 'Acme Signs');
  assert.equal(model.balance_due, 800, 'total − payments model balances');
  assert.equal(model.payments.length, 1);
  assert.ok(model.ship_to, 'ship-to block on by default');

  const collapsed = buildInvoicePrintModel(sentInv, { workOrder: wo, settings: { itemize: false } });
  assert.equal(collapsed.line_items.length, 1, 'itemize off → single total row');

  const html = renderInvoicePrintHtml(model);
  assert.ok(html.includes('INV-9'));
  assert.ok(html.includes('Balance Due'));
  assert.ok(!html.includes('STAFF COPY'), 'no internal banner by default');
  const staffHtml = renderInvoicePrintHtml(buildInvoicePrintModel(sentInv, { settings: { show_internal: true } }));
  assert.ok(staffHtml.includes('STAFF COPY'), 'internal view banners itself');
  assert.ok(staffHtml.includes('>Cost<'), 'internal column prints when opted in');

  // Packing slip: the no-money rule still holds through the WO fixture.
  const slipHtml = renderPackingSlipHtml(wo);
  assert.ok(slipHtml.includes('Packing Slip'));
  assert.ok(slipHtml.includes('Channel Letters'));
  assert.ok(!/\$\d/.test(slipHtml.replace(/\$\{[^}]*\}/g, '')),
    'packing slip never prints a dollar amount');
}

console.log('PASS job-workspace-tabs (D-03 tabs / D-04 margin / D-07 actions)');

for (const f of [stub, ...Object.values(outs)]) { try { rmSync(f); } catch { /* best effort */ } }
