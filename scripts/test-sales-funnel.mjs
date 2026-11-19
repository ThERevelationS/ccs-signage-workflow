import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-sales-funnel.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/salesFunnelModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  FUNNEL_TILES, FUNNEL_TILE_KEYS,
  funnelCounts, funnelConversionRates, funnelDelta, funnelTileRows,
  orderLifecycleState, isOrderRecord, orderReachedBuilt, orderReachedCompleted,
  orderEventDays, orderPlacedDay, orderBuiltDay, orderCompletedDay, orderClosedDay,
  orderVoidedDay, orderValueCents,
  isLiveEstimate, conversionInfo, estimateCancelledDay, estimateCreatedDay,
  estimateTotalCents, isLiveCustomer, customerCreatedDay,
} = await import(pathToFileURL(out).href);

// --- fixtures ---------------------------------------------------------------
// Window under test: November 2026.
const WIN = { from: '2026-11-01', to: '2026-11-30' };

const cust = (over = {}) => ({ id: 'c?', name: 'Acme', ...over });
const CUSTOMERS = [
  cust({ id: 'c1', created_date: '2026-11-05' }),                    // in window
  cust({ id: 'c2', created_date: '2026-10-15' }),                    // prior month — out
  cust({ id: 'c3', created_date: '2026-11-05', deleted: true }),     // deleted — out
  cust({ id: 'c4', created_date: '2026-11-06', merged_into_customer_id: 'c1' }), // merge stub — out
  cust({ id: 'c5', created_at: '2026-11-20T10:00:00Z' }),            // created_at fallback — in
  cust({ id: 'c6' }),                                              // undated — bounded out, unbounded in
];

const est = (over = {}) => ({ id: 'e?', status: 'sent', client_name: 'Acme', ...over });
const ESTIMATES = [
  est({ id: 'e1', created_date: '2026-11-03', quote_total: 1000 }),
  est({ id: 'e2', created_date: '2026-10-01' }),                                        // out
  est({ id: 'e3', created_date: '2026-11-03', is_template: true }),                     // template — out
  est({ id: 'e4', created_date: '2026-11-03', deleted: true }),                         // voidish — out
  est({ id: 'e5', created_date: '2026-11-10', quote_total: 500, cancelled_at: '2026-11-15' }),
  est({ id: 'e6', created_date: '2026-10-01', status: 'cancelled', updated_date: '2026-11-12' }), // updated fallback
  est({ id: 'e7', created_date: '2026-11-01', quote_total: 250, status: 'draft',        // cancelled then reopened — event counts
        status_history: [{ at: '2026-11-08T09:00:00Z', field: 'status', from: 'sent', to: 'cancelled', by: 'sam' }] }),
  est({ id: 'e8', created_date: '2026-11-02', quote_total: 2000, converted_at: '2026-11-18T12:00:00Z' }),
  est({ id: 'e9', created_date: '2026-10-05', status: 'approved', work_order_id: 'w-conv' }),     // day = wo.created 11-09
  est({ id: 'e10', created_date: '2026-11-15', quote_total: 750, sales_stage: 'won',
        sales_stage_changed_at: '2026-11-22T08:00:00Z' }),                               // converted on stage-change day
  est({ id: 'e11', created_date: '2026-09-20', status: 'sent', work_order_id: 'w-old' }),// conversion anchored to wo.created 10-01 — out
  est({ id: 'e12', created_date: '2026-09-01', status: 'cancelled', updated_date: '2026-09-15' }), // cancelled out of window
  est({ id: 'e13', created_date: '2026-11-03', status: 'void' }),                        // voidish — out
  est({ id: 'e14', status: 'sent' }),                                                    // undated — bounded out, unbounded created+1
];

const prod = (over = {}) => ({ id: 'p?', description: 'Sign', operational_status: 'in_production', quantity: 1, ...over });
const wo = (over = {}) => ({ id: 'w?', title: 'WO-?', client_name: 'Acme', current_stage: 'production', products: [], ...over });
const WORK_ORDERS = [
  // w1 — placed + built via product status_history stamp.
  wo({ id: 'w1', date_order_created: '2026-11-02', estimate_amount: 1200, products: [
    prod({ id: 'p1', operational_status: 'built', quoted_total: 400,
           status_history: [{ at: '2026-11-10T14:00:00Z', field: 'operational_status', from: 'in_production', to: 'built', by: 'shop' }] }),
  ]}),
  // w2 — built implied by fulfillment awaiting; day via changed_at proxy.
  wo({ id: 'w2', created_date: '2026-11-05T09:00:00Z', products: [
    prod({ id: 'p2', operational_status: 'in_production', quoted_total: 300,
           fulfillment_state: 'awaiting_installation',
           operational_status_changed_at: '2026-11-12T09:00:00Z' }),
    prod({ id: 'p3', operational_status: 'design_review', quoted_total: 200 }),
  ]}),
  // w3 — October order completed in November (placed out, completed+built in).
  wo({ id: 'w3', date_order_created: '2026-10-20', completed: true,
       current_stage: 'completed', completed_at: '2026-11-14T18:00:00Z' }),
  // w4 — placed + closed in window (completed/built bound by close day).
  wo({ id: 'w4', date_order_created: '2026-11-01', closed: true,
       closed_at: '2026-11-25T17:00:00Z', total: 800 }),
  // w5 — sales-lost pipeline row: never an order.
  wo({ id: 'w5', sales_status: 'lost', created_date: '2026-11-03' }),
  // w6 — voided pre-completion (WIP products, explicit voided_at).
  wo({ id: 'w6', lifecycle_state: 'voided', date_order_created: '2026-11-04',
       voided_at: '2026-11-16T11:00:00Z', estimate_amount: 100,
       products: [prod({ id: 'p4', operational_status: 'in_production' })] }),
  // w7 — deleted flag = voided per E-06; void day via updated_date fallback.
  wo({ id: 'w7', deleted: true, created_date: '2026-11-06', updated_date: '2026-11-19T10:00:00Z',
       estimate_amount: 50, products: [prod({ id: 'p5', operational_status: 'order_review' })] }),
  // w8 — voided post-completion via completed flag (no day evidence → built/completed undated).
  wo({ id: 'w8', lifecycle_state: 'voided', completed: true, date_order_created: '2026-10-15',
       voided_at: '2026-11-21T09:00:00Z', estimate_amount: 200 }),
  // w9 — voided post-completion via product built evidence; built day counts too.
  wo({ id: 'w9', voided: true, voided_date: '2026-11-24', date_order_created: '2026-11-03',
       products: [prod({ id: 'p6', operational_status: 'built', quoted_total: 400,
                        status_history: [{ at: '2026-11-08T10:00:00Z', field: 'operational_status', from: 'in_production', to: 'built', by: 'shop' }] })] }),
  // w10 — neutral-closed pipeline row, never won: not an order.
  wo({ id: 'w10', sales_neutral_closed_at: '2026-11-07T12:00:00Z', sales_status: 'lead',
       created_date: '2026-11-07' }),
  // w11 — neutral-closed BUT won: still an order (won first, archived later).
  wo({ id: 'w11', sales_neutral_closed_at: '2026-11-28T12:00:00Z', sales_status: 'won',
       date_order_created: '2026-11-08', estimate_amount: 600 }),
  // w12 — completed w/o stamps: updated_date is the lower bound.
  wo({ id: 'w12', current_stage: 'completed', completed: true,
       created_date: '2026-11-10', updated_date: '2026-11-27T15:00:00Z', estimate_amount: 900 }),
  // w13 — plain in-progress order: placed only.
  wo({ id: 'w13', date_order_created: '2026-11-20', estimate_amount: 150,
       products: [prod({ id: 'p7', operational_status: 'in_production' })] }),
  // w-old — October order; exists only to anchor e11's conversion day.
  wo({ id: 'w-old', created_date: '2026-10-01', date_order_created: '2026-10-01' }),
  // w-conv — order e9 converted into (created 11-09).
  wo({ id: 'w-conv', created_date: '2026-11-09T10:00:00Z' }),
  // w-undated — no day evidence anywhere: bounded out, unbounded placed+1.
  wo({ id: 'w-undated', current_stage: 'production' }),
];

const DATA = { customers: CUSTOMERS, estimates: ESTIMATES, workOrders: WORK_ORDERS };
const counts = funnelCounts(DATA, WIN);

// --- tile vocabulary ----------------------------------------------------------
assert.equal(FUNNEL_TILES.length, 10, 'FUNNEL_TILES has 10 entries');
assert.deepEqual(
  [...FUNNEL_TILE_KEYS],
  ['new_customers', 'estimates_created', 'estimates_cancelled', 'estimates_converted',
   'orders_placed', 'orders_built', 'orders_completed', 'orders_closed',
   'voided_pre_completion', 'voided_post_completion'],
  'tile keys in declaration order',
);
assert.ok(FUNNEL_TILES.every((t) => t.label && t.icon && t.tone), 'every tile has label/icon/tone');

// --- counts object shape ------------------------------------------------------
assert.deepEqual(Object.keys(counts).sort(), [...FUNNEL_TILE_KEYS].sort(), 'counts covers every tile');
assert.ok(Object.values(counts).every((t) => typeof t.count === 'number'), 'every tile carries a count');

// --- new_customers ------------------------------------------------------------
assert.equal(counts.new_customers.count, 2, 'new_customers: created_date+created_at in window, deleted/stub/undated out');
assert.equal(counts.new_customers.total_cents, undefined, 'new_customers carries no money dim');

// --- estimates ----------------------------------------------------------------
assert.equal(counts.estimates_created.count, 5, 'estimates_created: e1,e5,e7,e8,e10 (template/voidish/out-of-window excluded)');
assert.equal(counts.estimates_created.total_cents, 450000, 'estimates_created sums quote_total cents');
assert.equal(counts.estimates_cancelled.count, 3, 'estimates_cancelled: cancelled_at, updated fallback, reopened history event');
assert.equal(counts.estimates_converted.count, 3, 'estimates_converted: converted_at, approved+wo, sales_stage won');
assert.equal(counts.estimates_converted.total_cents, 200000 + 75000 + 0, 'converted totals: e8+e10 (e9 unpriced)');

// --- orders -------------------------------------------------------------------
assert.equal(counts.orders_placed.count, 10, 'orders_placed: w1,w2,w4,w6,w7,w9,w11,w12,w13,w-conv (lost/neutral/undated out)');
assert.equal(counts.orders_placed.total_cents, 470000, 'orders_placed sums order value cents');
assert.equal(counts.orders_built.count, 6, 'orders_built: w1 stamp, w2 fulfillment, w3/w4/w12 completion-bound, w9 voided-built');
assert.equal(counts.orders_completed.count, 3, 'orders_completed: w3 stamp, w4 close-bound, w12 updated-bound');
assert.equal(counts.orders_completed.total_cents, 80000 + 90000, 'completed totals: w4+w12 (w3 unpriced)');
assert.equal(counts.orders_closed.count, 1, 'orders_closed: w4 closed_at in window');
assert.equal(counts.orders_closed.total_cents, 80000, 'closed total: w4 total');
assert.equal(counts.voided_pre_completion.count, 2, 'pre-completion voids: w6 lifecycle, w7 deleted flag');
assert.equal(counts.voided_pre_completion.total_cents, 10000 + 5000, 'pre-void totals');
assert.equal(counts.voided_post_completion.count, 2, 'post-completion voids: w8 completed flag, w9 built evidence');
assert.equal(counts.voided_post_completion.total_cents, 20000 + 40000, 'post-void totals');

// --- event-day evidence chains -------------------------------------------------
const ev9 = orderEventDays(WORK_ORDERS.find((w) => w.id === 'w9'));
assert.equal(ev9.built, '2026-11-08', 'w9 built day from product history stamp');
assert.equal(ev9.voided, '2026-11-24', 'w9 void day from voided_date');
assert.equal(ev9.reached_built, true, 'w9 reached built → post-completion void');

const ev8 = orderEventDays(WORK_ORDERS.find((w) => w.id === 'w8'));
assert.equal(ev8.reached_built, true, 'w8 completed flag ⇒ reached built');
assert.equal(ev8.built, '', 'w8 built day honestly undated (voided ⇒ no updated/created fallback)');
assert.equal(ev8.completed, '', 'w8 completed day honestly undated on a voided row');

const ev12 = orderEventDays(WORK_ORDERS.find((w) => w.id === 'w12'));
assert.equal(ev12.completed, '2026-11-27', 'w12 completed day via updated_date bound');
assert.equal(ev12.built, '2026-11-27', 'w12 built day bounded by completion');

const ev3 = orderEventDays(WORK_ORDERS.find((w) => w.id === 'w3'));
assert.equal(ev3.built, '2026-11-14', 'w3 built day = completed day (completion implies built)');

assert.equal(orderVoidedDay(WORK_ORDERS.find((w) => w.id === 'w7')), '2026-11-19', 'w7 void day via updated_date fallback');
assert.equal(orderClosedDay(WORK_ORDERS.find((w) => w.id === 'w4')), '2026-11-25', 'w4 closed day via closed_at');
assert.equal(orderPlacedDay(WORK_ORDERS.find((w) => w.id === 'w2')), '2026-11-05', 'w2 placed day via created_date rung');

// --- window behavior ------------------------------------------------------------
const boundary = funnelCounts(DATA, { from: '2026-11-01', to: '2026-11-01' });
assert.equal(boundary.orders_placed.count, 1, 'boundary-inclusive: only w4 placed on 11-01');
const bareDay = funnelCounts(DATA, '2026-11-02');
assert.equal(bareDay.orders_placed.count, 1, 'bare-day param → same-day window (w1)');
const dateBounds = funnelCounts(DATA, { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) });
assert.equal(dateBounds.orders_placed.count, 10, 'Date bounds resolve to local days — same count');
const unbounded = funnelCounts(DATA, {});
assert.equal(unbounded.new_customers.count, 4, 'unbounded keeps undated + out-of-window customers');
assert.equal(unbounded.estimates_created.count, 11, 'unbounded keeps undated + out-of-window estimates');
assert.equal(unbounded.orders_placed.count, 14, 'unbounded counts every order record');
assert.equal(unbounded.orders_built.count, 7, 'unbounded keeps w8 (reached built, day honestly undated)');
assert.equal(unbounded.estimates_converted.count, 4, 'unbounded keeps e11 (conversion anchored to October WO)');

// --- conversion detection (J-07 parity spot checks) -----------------------------
const conv9 = conversionInfo(ESTIMATES.find((e) => e.id === 'e9'), { workOrdersById: WORK_ORDERS });
assert.equal(conv9.via, 'approved+wo', 'e9 conversion via approved+work_order_id');
assert.equal(conv9.day, '2026-11-09', 'e9 conversion day = linked WO created_date');
const conv8 = conversionInfo(ESTIMATES.find((e) => e.id === 'e8'), { workOrdersById: WORK_ORDERS });
assert.equal(conv8.via, 'converted_at', 'converted_at stamp wins precedence');
assert.equal(estimateCancelledDay(ESTIMATES.find((e) => e.id === 'e7')), '2026-11-08', 'cancelled day from status_history even when reopened');
assert.equal(estimateCancelledDay(ESTIMATES.find((e) => e.id === 'e6')), '2026-11-12', 'cancelled day via updated fallback on cancelled status');

// --- lifecycle + eligibility ----------------------------------------------------
assert.equal(orderLifecycleState({ deleted: true }), 'voided', 'deleted flag → voided (E-06)');
assert.equal(orderLifecycleState({ closed: true }), 'closed', 'closed flag → closed');
assert.equal(orderLifecycleState({ current_stage: 'completed' }), 'completed', 'stage completed → completed');
assert.equal(orderLifecycleState({ status: 'cancelled' }), 'voided', 'status cancelled → voided');
assert.equal(isOrderRecord({ sales_status: 'lost' }), false, 'sales-lost never an order');
assert.equal(isOrderRecord({ sales_neutral_closed_at: 'x', sales_status: 'lead' }), false, 'neutral-closed non-won not an order');
assert.equal(isOrderRecord({ sales_neutral_closed_at: 'x', sales_status: 'won' }), true, 'won then neutral-closed stays an order');
assert.equal(isOrderRecord({ lifecycle_state: 'voided' }), true, 'voided orders stay in the funnel');

// --- rates -----------------------------------------------------------------------
const rates = funnelConversionRates(counts);
assert.equal(rates.est_to_order_rate, 0.6, 'est_to_order_rate = 3/5');
assert.equal(rates.order_completion_rate, 0.3, 'order_completion_rate = 3/10 round4');
assert.equal(rates.void_rate_pre, 0.2, 'void_rate_pre = 2/10');
assert.equal(rates.void_rate_post, 0.2, 'void_rate_post = 2/10');
const zeroRates = funnelConversionRates({});
assert.deepEqual(zeroRates, { est_to_order_rate: 0, order_completion_rate: 0, void_rate_pre: 0, void_rate_post: 0 }, 'rates guard div-zero');

// --- delta -------------------------------------------------------------------------
const PRIOR = {
  orders_placed: { count: 6, total_cents: 400000 },
  new_customers: { count: 0 },
  voided_pre_completion: { count: 4 },
};
const delta = funnelDelta(counts, PRIOR);
assert.deepEqual(delta.orders_placed, { count_delta: 4, pct_delta: 0.6667, total_cents_delta: 70000 }, 'delta: +4 placed (+66.67%, +$700)');
assert.equal(delta.new_customers.count_delta, 2, 'delta: +2 new customers');
assert.equal(delta.new_customers.pct_delta, null, 'pct_delta null vs zero baseline');
assert.deepEqual(delta.voided_pre_completion, { count_delta: -2, pct_delta: -0.5, total_cents_delta: 15000 }, 'delta: -2 pre-voids (-50%)');
assert.equal(Object.keys(delta).length, 10, 'delta covers every tile');

// --- display rows --------------------------------------------------------------------
const rowsNoPrior = funnelTileRows(counts);
assert.equal(rowsNoPrior.length, 10, 'tile rows in FUNNEL_TILES order');
assert.equal(rowsNoPrior[0].key, 'new_customers');
assert.equal(rowsNoPrior[0].label, 'New Customers');
assert.equal(rowsNoPrior[0].icon, 'UserPlus');
assert.equal(rowsNoPrior[0].tone, 'info');
assert.equal(rowsNoPrior[0].count, 2);
assert.ok(!('total' in rowsNoPrior[0]), 'count-only tile omits total');
assert.ok(!('delta' in rowsNoPrior[0]), 'delta omitted without prior');
const placedRow = rowsNoPrior.find((r) => r.key === 'orders_placed');
assert.equal(placedRow.total, 4700, 'row total renders dollars');
assert.equal(placedRow.total_cents, 470000, 'row keeps cents for drilldown');
const rowsWithPrior = funnelTileRows(counts, { prior: PRIOR });
assert.deepEqual(rowsWithPrior.find((r) => r.key === 'orders_placed').delta,
  { count_delta: 4, pct_delta: 0.6667, total_cents_delta: 70000 }, 'prior attaches delta to rows');
assert.equal(rowsWithPrior.find((r) => r.key === 'voided_post_completion').tone, 'negative', 'void tiles tone negative');

// --- helper spot checks -----------------------------------------------------------------
assert.equal(orderValueCents({ estimate_amount: 12.34 }), 1234, 'orderValueCents estimate_amount rung');
assert.equal(orderValueCents({ products: [{ quoted_total: 10 }, { quoted_unit_price: 5, quantity: 2 }] }), 2000, 'orderValueCents product sum');
assert.equal(estimateTotalCents({ quote_total: 42 }), 4200, 'estimateTotalCents quote_total wins');
assert.equal(isLiveEstimate({ is_template: true }), false, 'templates are not live estimates');
assert.equal(isLiveCustomer({ deleted: true }), false, 'deleted customer not live');
assert.equal(customerCreatedDay({ created_at: '2026-11-20T10:00:00Z' }), '2026-11-20', 'customerCreatedDay created_at rung');
assert.equal(orderReachedCompleted({ completed: true, lifecycle_state: 'voided' }), true, 'completed flag on voided row = post-completion evidence');
assert.equal(orderReachedBuilt({ products: [{ operational_status: 'in_production' }] }), false, 'WIP product = not built');

rmSync(out, { force: true });
console.log('PASS sales-funnel');
