import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-estimate-reports.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/estimateReports.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  ESTIMATE_STATUSES, ESTIMATE_OPEN_STATUSES, ESTIMATE_TERMINAL_STATUSES,
  ESTIMATE_AGE_BUCKETS, ESTIMATE_AGE_BUCKET_LABELS, estimateAgeBucket,
  ESTIMATE_ACTIVITY_EVENTS, ESTIMATE_ACTIVITY_EVENT_LABELS,
  isLiveEstimate, isOpenEstimate, estimateTotalCents,
  estimateSentDay, conversionInfo, estimateRows,
  activityRows, conversionSalespersonRows, rollupEstimateRows,
  ESTIMATE_REPORTS, ESTIMATE_REPORTS_BY_ID,
} = await import(pathToFileURL(out).href);

// The real J-01 engine (w-49) — spec-shape contract validated by pushing
// every estimate spec through defineReport + runReport.
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport, rowsToCsv } = engine;

const AS_OF = '2026-11-15';
const NOW = new Date(2026, 10, 15, 12, 0, 0);
const NOV = { preset: 'custom', from: '2026-11-01', to: '2026-11-30' }; // Nov window

const CUSTOMERS = {
  c1: {
    id: 'c1', company_name: 'Acme Sign Co', industry_type: 'Retail',
    customer_type: 'Wholesale', origination_path: 'Networking Group : BNI - Carl',
    customer_origination: 'BNI', salesperson: 'HouseRep',
  },
  c2: { id: 'c2', name: 'Beta Works', industry_type: 'Construction', customer_type: 'Contractor', customer_origination: 'Referral' },
  c3: { id: 'c3', company: 'Cedar LLC', industry_type: 'Retail', customer_type: 'Retail' },
};
const WORK_ORDERS = {
  wo1: { id: 'wo1', created_date: '2026-11-06' },
  wo2: { id: 'wo2', created_date: '2026-11-02' },
  wo3: { id: 'wo3', created_date: '2026-11-08' },
};
const est = (over = {}) => ({
  id: 'e?', estimate_number: 'EST-?', project_name: 'Job', status: 'sent',
  customer_id: 'c1', created_date: '2026-11-01', quote_total: 100, ...over,
});

// --- main fixture: Nov window members + Oct/Sep created conversions ---------
const ESTIMATES = [
  // Sam — sent in window, not converted
  est({ id: 'e1', estimate_number: 'EST-1001', salesperson: 'Sam', entered_by_display: 'Brett', created_date: '2026-11-02', quote_issue_date: '2026-11-03', quote_total: 1000 }),
  // Sam — Oct-created, converted Nov 5 via conversion REVISION (beats wo created_date)
  est({
    id: 'e2', estimate_number: 'EST-1002', salesperson: 'Sam', entered_by_display: 'Brett',
    status: 'approved', work_order_id: 'wo1', created_date: '2026-10-20',
    quote_issue_date: '2026-10-25', accepted_at: '2026-11-05T15:00:00Z', quote_total: 2000,
  }),
  // Jo — draft in window, never sent
  est({ id: 'e3', estimate_number: 'EST-1003', customer_id: 'c2', salesperson: 'Jo', entered_by_display: 'Ana', status: 'draft', created_date: '2026-11-10', quote_total: 300 }),
  // Jo — sent Oct, converted Nov 2 via bare WO link (sent_day uses sent_at ladder)
  est({
    id: 'e4', estimate_number: 'EST-1004', customer_id: 'c2', salesperson: 'Jo', entered_by_display: 'Ana',
    work_order_id: 'wo2', created_date: '2026-10-05', sent_at: '2026-10-10', quote_total: 400,
  }),
  // Sam — sent in window
  est({ id: 'e5', estimate_number: 'EST-1005', salesperson: 'Sam', entered_by_display: 'Brett', created_date: '2026-11-03', quote_issue_date: '2026-11-04', quote_total: 500 }),
  // Lee — Oct-created, converted Nov 8 via wo3 created_date
  est({
    id: 'e6', estimate_number: 'EST-1006', customer_id: 'c3', salesperson: 'Lee', entered_by_display: 'Ana',
    status: 'approved', work_order_id: 'wo3', created_date: '2026-10-15',
    sent_date: '2026-10-16', accepted_at: '2026-11-08T09:00:00Z', quote_total: 800,
  }),
  // Lee — sent in window
  est({ id: 'e7', estimate_number: 'EST-1007', customer_id: 'c3', salesperson: 'Lee', entered_by_display: 'Brett', created_date: '2026-11-01', quote_issue_date: '2026-11-02', quote_total: 750 }),
  // Lee — legacy 'converted' status + converted_at stamp (Nov 10)
  est({ id: 'e8', estimate_number: 'EST-1008', customer_id: 'c3', salesperson: 'Lee', entered_by_display: 'Brett', status: 'converted', created_date: '2026-09-01', converted_at: '2026-11-10T12:00:00Z', quote_total: 1200 }),
  // no salesperson — approved + WO link to a WO NOT in the lookup → accepted_at anchor
  est({ id: 'e9', estimate_number: 'EST-1009', customer_id: 'c2', status: 'approved', work_order_id: 'woX', created_date: '2026-10-01', accepted_at: '2026-11-11', quote_total: 600 }),
  // excluded rows (x1/x2 terminal but LIVE — they join created-basis rollups on c2, no rep)
  est({ id: 'x1', customer_id: 'c2', status: 'cancelled', created_date: '2026-11-05', cancelled_at: '2026-11-12' }),
  est({ id: 'x2', customer_id: 'c2', status: 'archived', created_date: '2026-11-05', archived_at: '2026-11-13' }),
  est({ id: 'x3', deleted: true }),
  est({ id: 'x4', is_template: true }),
  est({ id: 'x5', status: 'void' }),
];
const REVISIONS = [
  { id: 'r1', estimate_id: 'e2', revision_type: 'conversion', revision_status: 'completed', completed_at: '2026-11-05T10:00:00Z' },
  { id: 'r2', estimate_id: 'ghost', revision_type: 'conversion', completed_at: '2026-11-07T10:00:00Z' }, // orphan — must not count
];
const data = { estimates: ESTIMATES, customers: Object.values(CUSTOMERS), revisions: REVISIONS, work_orders: Object.values(WORK_ORDERS) };

// === constants ===
assert.deepEqual(ESTIMATE_OPEN_STATUSES, ['draft', 'calculated', 'sent']);
assert.ok(ESTIMATE_TERMINAL_STATUSES.includes('converted') && ESTIMATE_TERMINAL_STATUSES.includes('won'), 'legacy converted spellings are terminal');
assert.ok(ESTIMATE_STATUSES.includes('calculated'), 'canonical entity enum order');

// === estimateAgeBucket boundaries ===
assert.equal(estimateAgeBucket(0), '0-7');
assert.equal(estimateAgeBucket(7), '0-7');
assert.equal(estimateAgeBucket(8), '8-14');
assert.equal(estimateAgeBucket(14), '8-14');
assert.equal(estimateAgeBucket(15), '15-30');
assert.equal(estimateAgeBucket(30), '15-30');
assert.equal(estimateAgeBucket(31), '31-60');
assert.equal(estimateAgeBucket(60), '31-60');
assert.equal(estimateAgeBucket(61), '61-90');
assert.equal(estimateAgeBucket(90), '61-90');
assert.equal(estimateAgeBucket(91), '90+');
assert.equal(estimateAgeBucket(NaN), '0-7', 'non-finite age → freshest bucket');
assert.deepEqual(ESTIMATE_AGE_BUCKETS, ['0-7', '8-14', '15-30', '31-60', '61-90', '90+']);
assert.equal(ESTIMATE_AGE_BUCKET_LABELS['90+'], 'Over 90 days');

// === conversion detection: precedence ladder ===
assert.equal(conversionInfo(est({ status: 'sent' })).converted, false, 'plain sent is not converted');
assert.equal(conversionInfo(est({ status: 'approved' })).converted, false, 'approved without WO link is not converted');
assert.equal(conversionInfo(est({ status: 'approved', work_order_id: 'wo9' })).via, 'approved+wo', 'canonical: approved + linked WO');
assert.equal(conversionInfo(est({ status: 'sent', work_order_id: 'wo9' })).via, 'work_order_link', 'bare WO link is the weakest signal');
assert.equal(conversionInfo(est({ status: 'sent', sales_stage: 'won' })).via, 'sales_stage_won', 'pipeline mirror won');
assert.equal(conversionInfo(est({ status: 'converted' })).via, 'status', 'legacy converted status');
assert.equal(conversionInfo(est({ status: 'won' })).via, 'status', 'legacy won status');
assert.equal(conversionInfo(est({ status: 'sent', converted_to_work_order: true })).via, 'converted_flag', 'flag beats status check order');
assert.equal(conversionInfo(est({ status: 'converted', converted_to_work_order: true })).via, 'converted_flag', 'flag precedes status spelling');
assert.equal(conversionInfo(est({ status: 'converted', converted_at: '2026-11-04' })).via, 'converted_at', 'explicit stamp wins over every other signal');
assert.equal(
  conversionInfo(est({ status: 'approved', work_order_id: 'wo9', sales_stage: 'won' })).via,
  'approved+wo', 'approved+wo precedes the sales_stage mirror'
);

// === converted_day ladder ===
{
  // revision completed_at beats work-order created_date
  const c = conversionInfo(
    est({ status: 'approved', work_order_id: 'wo1', accepted_at: '2026-11-09' }),
    { revisions: [{ revision_type: 'conversion', completed_at: '2026-11-05' }], workOrdersById: WORK_ORDERS }
  );
  assert.equal(c.day, '2026-11-05', 'conversion revision completed_at wins the day ladder');
  // work order created_date beats accepted_at
  const c2 = conversionInfo(est({ status: 'approved', work_order_id: 'wo1', accepted_at: '2026-11-09' }), { workOrdersById: WORK_ORDERS });
  assert.equal(c2.day, '2026-11-06', 'WO created_date when no conversion revision');
  // accepted_at when the linked WO is not in the lookup
  const c3 = conversionInfo(est({ status: 'approved', work_order_id: 'woMissing', accepted_at: '2026-11-11' }), { workOrdersById: WORK_ORDERS });
  assert.equal(c3.day, '2026-11-11', 'accepted_at when WO row unavailable');
  // sales_stage_changed_at then updated_date
  const c4 = conversionInfo(est({ status: 'sent', sales_stage: 'won', sales_stage_changed_at: '2026-11-03' }), {});
  assert.equal(c4.day, '2026-11-03', 'sales_stage_changed_at anchors won-stage conversions');
}

// === sent_day ladder ===
assert.equal(estimateSentDay(est({ quote_issue_date: '2026-11-01', sent_at: '2026-10-05' })), '2026-11-01', 'quote_issue_date canonical');
assert.equal(estimateSentDay(est({ sent_at: '2026-10-05T10:00:00Z' })), '2026-10-05', 'sent_at alias');
assert.equal(estimateSentDay(est({ sent_date: '2026-10-06' })), '2026-10-06', 'sent_date alias');
assert.equal(
  estimateSentDay(est({ status_history: [{ at: '2026-10-09', field: 'status', to: 'sent' }, { at: '2026-10-03', field: 'status', to: 'sent' }] })),
  '2026-10-03', 'earliest history transition-to-sent'
);
assert.equal(estimateSentDay(est({ status: 'sent', follow_up_state: { anchor_at: '2026-10-07' } })), '2026-10-07', 'stored follow-up anchor');
assert.equal(estimateSentDay(est({ status: 'sent', updated_date: '2026-10-20' })), '2026-10-20', 'updated_date lower-bound for unstamped sent rows');
assert.equal(estimateSentDay(est({ status: 'draft', created_date: '2026-10-20' })), '', 'draft was never sent');

// === estimateRows: membership, dims, age ===
const rows = estimateRows(ESTIMATES, { asOf: AS_OF, customersById: CUSTOMERS, revisions: REVISIONS, workOrdersById: WORK_ORDERS });
assert.equal(rows.length, 11, 'only x3 deleted / x4 template / x5 void drop — cancelled+archived stay live');
const byId = Object.fromEntries(rows.map((r) => [r.estimate_id, r]));
assert.equal(byId.e2.converted, true);
assert.equal(byId.e2.converted_via, 'approved+wo');
assert.equal(byId.e2.converted_day, '2026-11-05', 'conversion revision completed_at anchors e2');
assert.equal(byId.e2.days_to_convert, 16, 'Oct 20 → Nov 5 = 16 days');
assert.equal(byId.e4.converted_via, 'work_order_link');
assert.equal(byId.e4.converted_day, '2026-11-02', 'wo2 created_date anchors e4');
assert.equal(byId.e4.days_to_convert, 28);
assert.equal(byId.e6.days_to_convert, 24, 'Oct 15 → Nov 8');
assert.equal(byId.e8.converted_via, 'converted_at');
assert.equal(byId.e8.days_to_convert, 70, 'Sep 1 → Nov 10');
assert.equal(byId.e9.converted_day, '2026-11-11', 'accepted_at when WO row not injected');
assert.equal(byId.e1.converted, false);
assert.equal(byId.e3.customer_name, 'Beta Works', 'customer name lookup');
assert.equal(byId.e3.industry, 'Construction', 'industry via linked customer');
assert.equal(byId.e1.origination, 'Networking Group : BNI - Carl', 'origination_path preferred over flat label');
assert.equal(byId.e3.origination, 'Referral', 'customer_origination flat fallback');
assert.equal(byId.e7.origination, '', 'no origination → blank group key');
assert.equal(byId.e3.customer_type, 'Contractor');
assert.equal(byId.e1.entered_by, 'Brett', 'entered_by_display is the Entered By stamp');
assert.equal(byId.e3.age_days, 5, 'Nov 10 → Nov 15 as-of');
assert.equal(byId.e1.age_bucket, '8-14', '13 days old');
assert.equal(byId.e3.age_bucket, '0-7');
assert.equal(byId.e1.sent_day, '2026-11-03');
assert.equal(byId.e4.sent_day, '2026-10-10', 'sent_at ladder');
assert.equal(byId.x1.status, 'cancelled', 'cancelled rows remain live/reportable');
assert.equal(estimateRows([est({ is_template: true }), est({ deleted: true }), est({ status: 'void' })]).length, 0, 'template/deleted/void excluded');

// === conversionSalespersonRows: verify formula converted ÷ sent in window ===
const convRows = conversionSalespersonRows(rows, { from: '2026-11-01', to: '2026-11-30' });
const convByRep = Object.fromEntries(convRows.map((r) => [r.salesperson, r]));
assert.equal(convByRep.Sam.sent_count, 2, 'Sam sent e1+e5 in Nov');
assert.equal(convByRep.Sam.converted_count, 1, 'Sam converted e2 in Nov');
assert.equal(convByRep.Sam.conversion_rate, 0.5, '1 converted ÷ 2 sent');
assert.equal(convByRep.Sam.avg_days_to_convert, 16);
assert.equal(convByRep.Sam.sent_cents, 150000, 'sent value = e1 $1000 + e5 $500');
assert.equal(convByRep.Jo.sent_count, 0, 'e4 was sent in Oct — outside the window');
assert.equal(convByRep.Jo.converted_count, 1, 'e4 converted Nov 2 still counts');
assert.equal(convByRep.Jo.conversion_rate, 0, 'div-zero guarded — never Infinity/NaN');
assert.equal(convByRep.Lee.sent_count, 1, 'only e7 sent in Nov');
assert.equal(convByRep.Lee.converted_count, 2, 'e6 + e8 both converted in Nov');
assert.equal(convByRep.Lee.conversion_rate, 2, 'rate can exceed 1.0 — reported honestly');
assert.equal(convByRep.Lee.avg_days_to_convert, 47, '(24+70)/2');
assert.equal(convByRep['(unassigned)'].converted_count, 1, 'e9 groups under (unassigned)');
assert.equal(convRows[0].salesperson, 'Lee', 'sorted converted_count desc');
{
  const totSent = convRows.reduce((s, r) => s + r.sent_count, 0);
  const totConv = convRows.reduce((s, r) => s + r.converted_count, 0);
  assert.equal(totSent, 3, 'window sent total = e1+e5+e7');
  assert.equal(totConv, 5, 'window converted total = e2+e4+e6+e8+e9');
}

// === rollupEstimateRows: created-basis membership ===
const roll = rollupEstimateRows(rows, {
  from: '2026-11-01', to: '2026-11-30',
  key: (r) => r.salesperson, label: (r) => r.salesperson,
});
const rollByRep = Object.fromEntries(roll.groups.map((g) => [g.key, g]));
assert.equal(roll.groups.length, 4, 'Sam / Jo / Lee / (unassigned) — x1+x2 group under no-rep');
assert.equal(rollByRep.Sam.estimate_count, 2, 'e1+e5 created in Nov');
assert.equal(rollByRep.Jo.estimate_count, 1, 'only e3 (e4 was created Oct 5)');
assert.equal(rollByRep.Lee.estimate_count, 1, 'only e7');
assert.equal(rollByRep['(unassigned)'].estimate_count, 2, 'x1+x2 cancelled/archived are still created-basis members');
assert.equal(rollByRep.Sam.total_cents, 150000);
assert.equal(rollByRep.Sam.sent_count, 2, 'both Nov members sent in Nov');
assert.equal(rollByRep.Sam.converted_count, 0, 'e2 converted in Nov but is NOT a member (created Oct)');
assert.equal(roll.grand.estimate_count, 6);
assert.equal(roll.grand.total_cents, 275000, '$1000+$300+$500+$750+x1 $100+x2 $100');
assert.ok(roll.groups[0].total_cents >= roll.groups[1].total_cents, 'sorted total desc');

// === activityRows: source precedence + window bounds ===
{
  const actEstimates = [
    // stamps only: created + sent in window
    est({ id: 'a1', estimate_number: 'A1', created_date: '2026-11-02', quote_issue_date: '2026-11-03' }),
    // status_history repeat transitions: sent→draft→sent = 2 sent + 1 reopened
    est({
      id: 'a2', estimate_number: 'A2', status: 'sent', created_date: '2026-11-05',
      status_history: [
        { at: '2026-11-06', field: 'status', from: 'draft', to: 'sent' },
        { at: '2026-11-08', field: 'status', from: 'sent', to: 'draft' },
        { at: '2026-11-09', field: 'status', from: 'draft', to: 'sent' },
      ],
    }),
    // revision covers approved; manual_revision → revised; accepted_at must NOT double-count
    est({ id: 'a3', estimate_number: 'A3', status: 'approved', created_date: '2026-11-01', accepted_at: '2026-11-07' }),
    // Oct-created, cancelled in Nov — created NOT in window
    est({ id: 'a4', estimate_number: 'A4', status: 'cancelled', created_date: '2026-10-28', cancelled_at: '2026-11-12' }),
  ];
  const actRevisions = [
    { estimate_id: 'a3', revision_type: 'status_transition', new_status: 'approved', completed_at: '2026-11-07T12:00:00Z' },
    { estimate_id: 'a3', revision_type: 'manual_revision', completed_at: '2026-11-09T12:00:00Z' },
    { estimate_id: 'ghost', revision_type: 'status_transition', new_status: 'sent', completed_at: '2026-11-05' },
  ];
  const actRows = estimateRows(actEstimates, { asOf: AS_OF, revisions: actRevisions });
  const act = activityRows(actRows, { from: '2026-11-01', to: '2026-11-30' });
  const byEvent = Object.fromEntries(act.map((r) => [r.event_type, r]));
  assert.deepEqual(act.map((r) => r.event_type), ['created', 'sent', 'approved', 'revised', 'reopened', 'cancelled'], 'canonical order, zero-count types omitted');
  assert.equal(byEvent.created.estimate_count, 3, 'a1+a2+a3 created in Nov; a4 created Oct 28 is outside');
  assert.equal(byEvent.sent.event_count, 3, 'a1 stamp + a2 history ×2');
  assert.equal(byEvent.sent.estimate_count, 2, 'distinct estimates that sent');
  assert.equal(byEvent.reopened.event_count, 1, 'a2 sent→draft');
  assert.equal(byEvent.approved.event_count, 1, 'a3 revision — accepted_at stamp deduped, not double-counted');
  assert.equal(byEvent.revised.event_count, 1, 'a3 manual_revision');
  assert.equal(byEvent.cancelled.event_count, 1, 'a4 cancelled in window');
  assert.equal(byEvent.converted, undefined, 'ghost-estimate revision ignored + no conversions');
}

// === spec shape: all 9 pass the real engine contract ===
assert.equal(ESTIMATE_REPORTS.length, 9);
assert.deepEqual(
  Object.keys(ESTIMATE_REPORTS_BY_ID).sort(),
  [
    'conversions_by_salesperson', 'estimate_activity', 'estimates_by_customer',
    'estimates_by_customer_type', 'estimates_by_entered_by', 'estimates_by_industry',
    'estimates_by_origination', 'estimates_by_salesperson', 'estimates_current',
  ]
);
const defs = ESTIMATE_REPORTS.map((s) => defineReport(s)); // throws on violation
for (const d of defs) {
  assert.equal(d.category, 'estimates');
  assert.ok(Object.isFrozen(d));
}

// === estimates_current via engine ===
{
  const res = runReport(ESTIMATE_REPORTS_BY_ID.estimates_current, {
    params: { as_of: AS_OF }, data, now: NOW,
  });
  assert.equal(res.meta.reportId, 'estimates_current');
  assert.equal(res.rows.length, 4, 'open pipeline: e1+e3+e5+e7 — e4 is sent-status but converted (decided)');
  assert.equal(res.rows[0].estimate_number, 'EST-1007', 'sorted by age desc — e7 is 14 days');
  assert.equal(res.rows[0].age_bucket, '8-14');
  assert.equal(res.rows[0].total, 750, 'dollars at the boundary');
  assert.equal(res.rows[0].total_cents, 75000, 'cent extras preserved');
  assert.equal(res.summary.totals.total, 2550, '$1000+$300+$500+$750');
  // explicit status pick overrides the open+unconverted default
  const picked = runReport(ESTIMATE_REPORTS_BY_ID.estimates_current, {
    params: { as_of: AS_OF, statuses: ['sent'] }, data, now: NOW,
  });
  assert.equal(picked.rows.length, 4, 'explicit sent pick includes converted-but-sent e4');
  assert.ok(picked.rows.some((r) => r.estimate_id === 'e4'));
  // salesperson text filter
  const samOnly = runReport(ESTIMATE_REPORTS_BY_ID.estimates_current, {
    params: { as_of: AS_OF, salesperson: 'sam' }, data, now: NOW,
  });
  assert.equal(samOnly.rows.length, 2, 'case-insensitive salesperson filter');
}

// === estimate_activity via engine ===
{
  const res = runReport(ESTIMATE_REPORTS_BY_ID.estimate_activity, {
    params: { date_range: NOV }, data, now: NOW,
  });
  const byEvent = Object.fromEntries(res.rows.map((r) => [r.event_type, r]));
  assert.equal(byEvent.created.estimate_count, 6, 'e1+e3+e5+e7+x1+x2 created in Nov (e2/e4/e6/e9 Oct, e8 Sep)');
  assert.equal(byEvent.sent.estimate_count, 3, 'e1+e5+e7 sent in Nov');
  assert.equal(byEvent.converted.estimate_count, 5, 'e2+e4+e6+e8+e9 converted in Nov');
  assert.equal(byEvent.approved.estimate_count, 3, 'e2+e6+e9 accepted in Nov');
  assert.equal(byEvent.cancelled.event_count, 1, 'x1 cancelled Nov 12');
  assert.equal(byEvent.archived.event_count, 1, 'x2 archived Nov 13');
  assert.equal(byEvent.sent.event_count, 3, 'one stamp per estimate — no history in this fixture');
  const onlySent = runReport(ESTIMATE_REPORTS_BY_ID.estimate_activity, {
    params: { date_range: NOV, events: ['sent'] }, data, now: NOW,
  });
  assert.deepEqual(onlySent.rows.map((r) => r.event_type), ['sent'], 'events multiselect filter');
}

// === conversions_by_salesperson via engine ===
{
  const res = runReport(ESTIMATE_REPORTS_BY_ID.conversions_by_salesperson, {
    params: { date_range: NOV }, data, now: NOW,
  });
  assert.equal(res.rows.length, 4, 'Sam/Jo/Lee/(unassigned)');
  const sam = res.rows.find((r) => r.salesperson === 'Sam');
  assert.equal(sam.conversion_rate, 0.5);
  assert.equal(sam.converted_total, 2000, 'converted value in dollars');
  const lee = res.rows.find((r) => r.salesperson === 'Lee');
  assert.equal(lee.conversion_rate, 2, 'rate > 1 surfaces when conversions outnumber sends');
  assert.equal(res.summary.totals.converted_count, 5);
  assert.equal(res.summary.totals.sent_count, 3);
  assert.ok(Math.abs(res.summary.totals.conversion_rate - 5 / 3) < 1e-9, 'total rate = 5÷3');
  assert.equal(res.summary.totals.avg_days_to_convert, 35.8, '(16+28+24+70+41)/5 weighted across reps');
}

// === by-X rollups via engine ===
{
  const cust = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_customer, {
    params: { date_range: NOV }, data, now: NOW,
  });
  assert.equal(cust.rows.length, 3, 'c1/c2/c3');
  const c1 = cust.rows.find((r) => r.customer_name === 'Acme Sign Co');
  assert.equal(c1.estimate_count, 2, 'e1+e5');
  assert.equal(c1.total, 1500);
  assert.equal(c1.sent_count, 2);
  const c2 = cust.rows.find((r) => r.customer_name === 'Beta Works');
  assert.equal(c2.estimate_count, 3, 'e3+x1+x2 — terminal rows still count as written estimates');
  assert.equal(cust.summary.totals.total, 2750, 'created-in-window total across customers');

  const rep = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_salesperson, {
    params: { date_range: NOV }, data, now: NOW,
  });
  const sam = rep.rows.find((r) => r.salesperson === 'Sam');
  assert.equal(sam.estimate_count, 2);
  assert.equal(sam.conversion_rate, 0, 'no Nov-created member converted in Nov');

  const entered = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_entered_by, {
    params: { date_range: NOV }, data, now: NOW,
  });
  const brett = entered.rows.find((r) => r.entered_by === 'Brett');
  assert.equal(brett.estimate_count, 3, 'e1+e5+e7');
  assert.equal(brett.total, 2250);
  const ana = entered.rows.find((r) => r.entered_by === 'Ana');
  assert.equal(ana.estimate_count, 1, 'e3 — e4/e6 were created in Oct');

  const ind = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_industry, {
    params: { date_range: NOV }, data, now: NOW,
  });
  const retail = ind.rows.find((r) => r.industry === 'Retail');
  assert.equal(retail.estimate_count, 3, 'c1+c3 estimates (e1,e5,e7)');
  assert.equal(retail.total, 2250);
  const construction = ind.rows.find((r) => r.industry === 'Construction');
  assert.equal(construction.estimate_count, 3, 'e3+x1+x2 all sit on c2');

  const orig = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_origination, {
    params: { date_range: NOV }, data, now: NOW,
  });
  const bni = orig.rows.find((r) => r.origination === 'Networking Group : BNI - Carl');
  assert.equal(bni.estimate_count, 2, 'e1+e5 under the hierarchical path');
  const referral = orig.rows.find((r) => r.origination === 'Referral');
  assert.equal(referral.estimate_count, 3, 'e3+x1+x2 under the flat c2 origination');
  const unassigned = orig.rows.find((r) => r.origination === '(unassigned)');
  assert.equal(unassigned.estimate_count, 1, 'c3 has no origination → (unassigned)');

  const ctype = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_customer_type, {
    params: { date_range: NOV }, data, now: NOW,
  });
  assert.equal(ctype.rows.find((r) => r.customer_type === 'Wholesale').estimate_count, 2);
  assert.equal(ctype.rows.find((r) => r.customer_type === 'Retail').estimate_count, 1);
  assert.equal(ctype.rows.find((r) => r.customer_type === 'Contractor').estimate_count, 3);

  // window membership is created-date basis — last_month sees the Oct cohort
  const oct = runReport(ESTIMATE_REPORTS_BY_ID.estimates_by_salesperson, {
    params: { date_range: { preset: 'custom', from: '2026-10-01', to: '2026-10-31' } }, data, now: NOW,
  });
  const octSam = oct.rows.find((r) => r.salesperson === 'Sam');
  assert.equal(octSam.estimate_count, 1, 'only e2 was created in Oct');
  assert.equal(octSam.converted_count, 0, 'e2 converted in Nov — outside the Oct window');
}

// === engine interop: CSV ===
{
  const res = runReport(ESTIMATE_REPORTS_BY_ID.estimates_current, {
    params: { as_of: AS_OF }, data, now: NOW,
  });
  const csv = rowsToCsv(res.columns, res.rows);
  assert.ok(csv.split('\n')[0].includes('Estimate #'), 'CSV header');
  assert.ok(csv.includes('EST-1001'), 'CSV carries estimate rows');
}

rmSync(out, { force: true });
console.log('PASS estimate-reports');
