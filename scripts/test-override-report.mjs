// F-26 contract test: price-lock override audit report — event acceptance
// (literal price_override + entity-variant override/price_fields), per-edit
// normalization, cent-safe delta math, since/until windows, salesperson
// grouping, summary, reason breakdown, flat report rows.
// Fixtures are built through the REAL D-11 producer
// (orderEntryOverrideModel.overrideHistoryRow) so the consumer/producer
// contract is asserted, not a hand-rolled shape.
// Run: node scripts/test-override-report.mjs
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

buildSync({
  entryPoints: [
    resolve(root, 'src/components/reports/overrideReportModel.js'),
    resolve(root, 'src/components/jobs/orderEntryOverrideModel.js'),
  ],
  bundle: true, format: 'esm', splitting: true,
  outdir: resolve(here, '.tmp-override-report-out'), logLevel: 'silent',
});
const m = await import(pathToFileURL(resolve(here, '.tmp-override-report-out/reports/overrideReportModel.js')).href);
const prod = await import(pathToFileURL(resolve(here, '.tmp-override-report-out/jobs/orderEntryOverrideModel.js')).href);
const {
  overrideRows, overridesBySalesperson, overrideSummary, reasonBreakdown,
  overrideReportRows, isPriceOverrideEvent, UNSPECIFIED_REASON,
} = m;

const ROW_KEYS = [
  'occurred_at', 'actor', 'actor_type', 'work_order_id', 'product_id',
  'product_label', 'field', 'from_value', 'to_value', 'delta', 'delta_pct', 'reason',
];

const converted = {
  id: 'p1', work_order_id: 'wo-9', description: 'Channel Letters',
  estimate_line_id: 'L1', unit_price: 100, quantity: 3,
};

// === Fixtures ================================================================
// evA — literal D-11 row, single edit, reason in note.
const evA = prod.overrideHistoryRow({
  product: converted,
  edits: [{ field: 'unit_price', from: 100, to: 120 }],
  actor: 'Brett H', actorType: 'staff',
  now: '2026-11-02T07:19:35.000Z', note: 'Customer price match',
});
// evB — entity-variant 'override' (asEntityEvent) carrying details.price_fields,
// multi-edit → explodes into two normalized rows. No note → blank reason.
const evB = prod.overrideHistoryRow({
  product: { id: 'p2', work_order_id: 'wo-9', description: 'Banner' },
  edits: [
    { field: 'unit_price', from: 50, to: 45 },
    { field: 'quantity', from: 2, to: 5 },
  ],
  actor: 'Sam W', actorType: 'staff',
  now: '2026-11-03T10:00:00.000Z', asEntityEvent: true,
});
// evC — B-11 STATUS override: event_type 'override' but override_type 'status'
// and NO details.price_fields → must be rejected (ops history, not money trail).
const evC = {
  work_order_id: 'wo-9', product_id: 'p1', event_type: 'override',
  actor_label: 'Brett H', actor_type: 'staff',
  occurred_at: '2026-11-03T12:00:00.000Z', note: 'Liability waiver',
  details: { field: 'operational_status', override_type: 'status' },
};
// evD — non-override event → rejected.
const evD = {
  work_order_id: 'wo-9', product_id: 'p1', event_type: 'status_change',
  actor_label: 'Brett H', actor_type: 'staff', occurred_at: '2026-11-03T13:00:00.000Z',
};
// evE — price_override with no edits[] → fallback single row from
// details.field + row from/to (from=0 → delta_pct null).
const evE = {
  work_order_id: 'wo-7', product_id: 'p9', product_label: 'ACM Panel',
  event_type: 'price_override', actor_label: 'Brett H', actor_type: 'staff',
  occurred_at: '2026-11-04T09:00:00.000Z', from_value: '0', to_value: '10',
  note: 'Discount approved', details: { field: 'discount_pct' },
};
// evF — 'override' accepted via details.override_type tag (no price_fields array).
const evF = {
  work_order_id: 'wo-8', product_id: 'p5', product_label: 'Vinyl',
  event_type: 'override', actor_label: 'Pat Q', actor_type: 'staff',
  occurred_at: '2026-11-05T08:00:00.000Z',
  details: { override_type: 'price_override', edits: [{ field: 'price', from: 10, to: 12 }] },
};
// evG — details.reason wins over note; cent-noise edit 100 → 100.01.
const evG = {
  work_order_id: 'wo-9', product_id: 'p1', product_label: 'Channel Letters',
  event_type: 'price_override', actor_label: 'Sam W', actor_type: 'staff',
  occurred_at: '2026-11-06T11:00:00.000Z', note: 'a note',
  details: { reason: 'manager approved', edits: [{ field: 'unit_price', from: 100, to: 100.01 }] },
};
// evH — undated row, blank actor_label + system actor_type, blank from-side.
const evH = {
  work_order_id: 'wo-10', product_id: 'p6',
  event_type: 'price_override', actor_label: '', actor_type: 'system',
  occurred_at: '',
  details: { edits: [{ field: 'unit_price', from: '', to: '5' }] },
};
// 'override' with EMPTY price_fields → rejected.
const evEmpty = {
  event_type: 'override', actor_label: 'X', occurred_at: '2026-11-03T00:00:00.000Z',
  details: { price_fields: [], edits: [{ field: 'quantity', from: 1, to: 2 }] },
};

const feed = [evA, evB, evC, evD, evE, evF, evG, evH, evEmpty];

// === isPriceOverrideEvent ======================================================
assert.equal(isPriceOverrideEvent(evA), true, 'literal price_override accepted');
assert.equal(isPriceOverrideEvent(evB), true, 'entity override + price_fields accepted');
assert.equal(isPriceOverrideEvent(evF), true, 'override_type=price_override accepted');
assert.equal(isPriceOverrideEvent(evC), false, 'status override rejected');
assert.equal(isPriceOverrideEvent(evD), false, 'status_change rejected');
assert.equal(isPriceOverrideEvent(evEmpty), false, 'empty price_fields rejected');
assert.equal(isPriceOverrideEvent(null), false);

// === overrideRows — acceptance + shape =========================================
const rows = overrideRows(feed);
assert.equal(rows.length, 7, '7 normalized rows: 1+2+1+1+1+1 (evC/evD/evEmpty out)');
assert.equal(evB.event_type, 'override', 'fixture really is the entity variant');
assert.equal(rows.length, overrideRows(feed).length, 'pure — no input mutation');

// feed order: newest first, undated last
assert.deepEqual(rows.map((r) => r.occurred_at), [
  '2026-11-06T11:00:00.000Z', // evG
  '2026-11-05T08:00:00.000Z', // evF
  '2026-11-04T09:00:00.000Z', // evE
  '2026-11-03T10:00:00.000Z', // evB edit 1
  '2026-11-03T10:00:00.000Z', // evB edit 2
  '2026-11-02T07:19:35.000Z', // evA
  '',                          // evH undated sinks last
]);
const evBFields = rows.filter((r) => r.product_id === 'p2').map((r) => r.field);
assert.deepEqual(evBFields, ['unit_price', 'quantity'], 'multi-edit event explodes one row per edit');

// exact normalized key shape
for (const r of rows) {
  assert.deepEqual(Object.keys(r).sort(), [...ROW_KEYS].sort(), 'normalized row key set');
}

// evA field-level values — from/to are the RAW edit values (numbers)
const rA = rows.find((r) => r.reason === 'Customer price match');
assert.equal(rA.actor, 'Brett H');
assert.equal(rA.actor_type, 'staff');
assert.equal(rA.work_order_id, 'wo-9');
assert.equal(rA.product_id, 'p1');
assert.equal(rA.product_label, 'Channel Letters');
assert.equal(rA.field, 'unit_price');
assert.strictEqual(rA.from_value, 100);
assert.strictEqual(rA.to_value, 120);
assert.equal(rA.delta, 20);
assert.equal(rA.delta_pct, 0.2, 'delta_pct is a fraction (percent column format)');

// evB deltas: down-move -5 → -0.1 pct; qty 2→5 → +3, +1.5 pct
const rPrice = rows.find((r) => r.product_id === 'p2' && r.field === 'unit_price');
assert.equal(rPrice.delta, -5);
assert.equal(rPrice.delta_pct, -0.1);
const rQty = rows.find((r) => r.product_id === 'p2' && r.field === 'quantity');
assert.equal(rQty.delta, 3);
assert.equal(rQty.delta_pct, 1.5);

// evG: details.reason precedence + cent-safe delta (never 0.010000000000005)
const rG = rows.find((r) => r.field === 'unit_price' && r.actor === 'Sam W');
assert.equal(rG.reason, 'manager approved', 'details.reason wins over note');
assert.equal(rG.delta, 0.01, 'cent-safe delta');
assert.ok(Math.abs(rG.delta - 0.01) < 1e-12);

// evE: fallback row — details.field + row from/to; from=0 → delta_pct null
const rE = rows.find((r) => r.work_order_id === 'wo-7');
assert.equal(rE.field, 'discount_pct');
assert.equal(rE.from_value, '0');
assert.equal(rE.to_value, '10');
assert.equal(rE.delta, 10);
assert.equal(rE.delta_pct, null, 'delta_pct null when from is zero');

// evH: actor fallback + blank-side delta null
const rH = rows.find((r) => r.work_order_id === 'wo-10');
assert.equal(rH.actor, 'system', 'actor falls back to actor_type');
assert.equal(rH.delta, null, 'blank from-side → delta null');
assert.equal(rH.delta_pct, null);

// === overrideRows — since/until windows ========================================
assert.equal(overrideRows(feed, { since: '2026-11-03' }).length, 5,
  'since drops evA (11-02) and undated evH');
assert.equal(overrideRows(feed, { until: '2026-11-02' }).length, 1,
  'until bare date is day-inclusive — keeps same-day 07:19 event');
assert.equal(overrideRows(feed, { since: '2026-11-03', until: '2026-11-04' }).length, 3,
  'bounded window keeps evB pair + evE');
assert.equal(overrideRows([evH]).length, 1, 'unbounded keeps undated rows');
assert.deepEqual(overrideRows(null), [], 'non-array input → []');
assert.deepEqual(overrideRows('junk'), []);

// === overridesBySalesperson =====================================================
const groups = overridesBySalesperson(rows);
assert.deepEqual(groups.map((g) => g.actor), ['Sam W', 'Brett H', 'Pat Q', 'system'],
  'count desc, alpha tiebreak');
const sam = groups[0];
assert.equal(sam.count, 3);
assert.equal(sam.total_delta, -1.99, 'signed net: -5 + 3 + 0.01');
assert.equal(sam.total_delta_abs, 8.01, 'abs volume: 5 + 3 + 0.01');
assert.equal(sam.biggest_abs, 5);
assert.equal(sam.rows.length, 3, 'group keeps normalized rows');
const brett = groups[1];
assert.equal(brett.count, 2);
assert.equal(brett.total_delta, 30);
const sys = groups.find((g) => g.actor === 'system');
assert.equal(sys.count, 1);
assert.equal(sys.total_delta_abs, 0, 'null-delta rows count, add no volume');
assert.deepEqual(overridesBySalesperson([]), []);

// === overrideSummary ============================================================
const sum = overrideSummary(rows);
assert.equal(sum.total, 7);
assert.equal(sum.unique_actors, 4);
assert.equal(sum.unique_orders, 4, 'wo-9, wo-7, wo-8, wo-10');
assert.equal(sum.total_delta, 30.01);
assert.equal(sum.avg_abs_delta, 6.6683, 'avg |delta| over the 6 numeric rows');
assert.equal(sum.period.first, '2026-11-02T07:19:35.000Z');
assert.equal(sum.period.last, '2026-11-06T11:00:00.000Z');
const emptySum = overrideSummary([]);
assert.equal(emptySum.total, 0);
assert.equal(emptySum.avg_abs_delta, null);
assert.deepEqual(emptySum.period, { first: null, last: null });

// === reasonBreakdown ============================================================
const reasons = reasonBreakdown(rows);
assert.equal(UNSPECIFIED_REASON, 'unspecified');
assert.equal(reasons[UNSPECIFIED_REASON], 4, 'evB x2 + evF + evH have no reason');
assert.equal(reasons['Customer price match'], 1);
assert.equal(reasons['Discount approved'], 1);
assert.equal(reasons['manager approved'], 1);
assert.equal(Object.keys(reasons)[0], UNSPECIFIED_REASON, 'sorted count desc');
assert.deepEqual(reasonBreakdown([]), {});

// === overrideReportRows ==========================================================
const flat = overrideReportRows(rows);
assert.equal(flat.length, 7);
const fG = flat[0];
assert.equal(fG.date, '2026-11-06T11:00:00.000Z', 'date carries raw occurred_at');
assert.equal(fG.actor, 'Sam W');
assert.equal(fG.order_label, 'WO wo-9');
assert.equal(fG.order_href, '/JobWorkspace?wo=wo-9', 'deep link to the job workspace');
assert.equal(fG.product, 'Channel Letters');
assert.equal(fG.field, 'unit_price');
assert.strictEqual(fG.from, 100);
assert.strictEqual(fG.to, 100.01);
assert.equal(fG.delta, 0.01);
assert.equal(fG.reason, 'manager approved');
const fB = flat.find((r) => r.field === 'quantity');
assert.equal(fB.reason, UNSPECIFIED_REASON, 'blank reason → unspecified in flat rows');
const fH = flat.find((r) => r.work_order_id === 'wo-10');
assert.equal(fH.order_label, 'WO wo-10');
assert.equal(fH.product, 'p6', 'product falls back to product_id');
const noWo = overrideReportRows([{ actor: 'X', field: 'price', from_value: 1, to_value: 2, delta: 1 }]);
assert.equal(noWo[0].order_label, '—', 'orderless row renders em dash');
assert.equal(noWo[0].order_href, '');
assert.deepEqual(overrideReportRows(null), []);

rmSync(resolve(here, '.tmp-override-report-out'), { recursive: true, force: true });
console.log('PASS override-report');
