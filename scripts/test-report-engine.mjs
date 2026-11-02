import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-report-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/reports/reportEngine.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  REPORT_CATEGORIES, PARAM_TYPES, DATE_BASIS_OPTIONS, DATE_RANGE_PRESETS,
  VOID_POLICIES, defineReport, standardReportParams, runReport,
  resolveDateRange, filterByDateRange, voidPolicyFilter, isVoidRow,
  rowsToCsv, formatCellValue, parseReportDate,
} = await import(pathToFileURL(out).href);

// Deterministic clock: Wednesday 2026-11-04 15:30 local.
const NOW = new Date(2026, 10, 4, 15, 30, 0);
const dk = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const key = (d) => dk(d.getFullYear(), d.getMonth() + 1, d.getDate());

// --- constants -----------------------------------------------------------------
assert.deepEqual(REPORT_CATEGORIES, ['customers', 'sales', 'production', 'estimates', 'financial', 'activity']);
assert.deepEqual(DATE_BASIS_OPTIONS, ['created', 'completed', 'built']);
assert.deepEqual(VOID_POLICIES, ['exclude', 'include', 'only']);
assert.deepEqual(DATE_RANGE_PRESETS, ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'this_year', 'custom']);
assert.ok(PARAM_TYPES.includes('date_range') && PARAM_TYPES.includes('date_basis') && PARAM_TYPES.includes('multiselect'));

// --- defineReport validation -----------------------------------------------------
const baseSpec = {
  id: 'sales_by_customer', name: 'Sales by Customer', category: 'sales',
  params: standardReportParams(),
  columns: [
    { key: 'customer', label: 'Customer' },
    { key: 'total', label: 'Total', align: 'right', fmt: 'money' }, // fmt alias
    { key: 'share', align: 'right', format: 'percent' },            // label humanized
  ],
  run: (p, data) => ({ rows: data.orders.map((o) => ({ customer: o.customer, total: o.total, share: o.share })) }),
};
const def = defineReport(baseSpec);
assert.ok(Object.isFrozen(def), 'definition is frozen');
assert.equal(def.columns[1].format, 'money', 'fmt alias normalized to format');
assert.equal(def.columns[2].label, 'Share', 'missing label humanized from key');
assert.equal(def.columns[0].align, 'left', 'align defaults left');
assert.equal(def.defaults.date_basis, 'created');
assert.equal(def.defaults.void_policy, 'exclude');
assert.deepEqual(def.params.find((p) => p.key === 'date_basis').options.map((o) => o.value), DATE_BASIS_OPTIONS);

assert.throws(() => defineReport({ name: 'x', category: 'sales', columns: [{ key: 'a' }], run: () => [] }), /requires an id/);
assert.throws(() => defineReport({ id: 'x', category: 'sales', columns: [{ key: 'a' }], run: () => [] }), /requires a name/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'nope', columns: [{ key: 'a' }], run: () => [] }), /invalid category/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [{ key: 'a' }] }), /run\(params, data\) function/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [], run: () => [] }), /at least one column/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [{ key: 'a' }, { key: 'a' }], run: () => [] }), /duplicate column key/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [{ key: 'a', align: 'sideways' }], run: () => [] }), /invalid align/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [{ key: 'a', format: 'sparkle' }], run: () => [] }), /invalid format/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', params: [{ key: 'p', type: 'wat' }], columns: [{ key: 'a' }], run: () => [] }), /invalid type/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', params: [{ key: 'p', type: 'select' }], columns: [{ key: 'a' }], run: () => [] }), /non-empty options/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', params: [{ key: 'p', type: 'date_basis', options: ['created', 'shipped'] }], columns: [{ key: 'a' }], run: () => [] }), /not a valid date basis/);
assert.throws(() => defineReport({ id: 'x', name: 'x', category: 'sales', params: [{ key: 'p', type: 'text' }, { key: 'p', type: 'text' }], columns: [{ key: 'a' }], run: () => [] }), /duplicate param key/);

// --- date range presets (all, incl. custom) ----------------------------------------
{
  const cases = [
    ['today', '2026-11-04', '2026-11-04'],
    ['yesterday', '2026-11-03', '2026-11-03'],
    ['this_week', '2026-11-02', '2026-11-08'],   // Monday-start week
    ['last_week', '2026-10-26', '2026-11-01'],
    ['this_month', '2026-11-01', '2026-11-30'],
    ['last_month', '2026-10-01', '2026-10-31'],
    ['this_quarter', '2026-10-01', '2026-12-31'], // Nov → Q4
    ['this_year', '2026-01-01', '2026-12-31'],
  ];
  for (const [preset, f, t] of cases) {
    const r = resolveDateRange(preset, NOW);
    assert.equal(r.preset, preset);
    assert.equal(key(r.from), f, `${preset} from`);
    assert.equal(key(r.to), t, `${preset} to`);
    assert.equal(r.from.getHours(), 0, `${preset} from is start-of-day`);
    assert.equal(r.to.getHours(), 23, `${preset} to is end-of-day`);
  }
  const c = resolveDateRange({ preset: 'custom', from: '2026-10-10', to: '2026-10-12' }, NOW);
  assert.equal(key(c.from), '2026-10-10');
  assert.equal(key(c.to), '2026-10-12');
  const openEnd = resolveDateRange({ from: '2026-10-10' }, NOW); // implicit custom, unbounded end
  assert.equal(openEnd.preset, 'custom');
  assert.equal(openEnd.to, null);
  assert.throws(() => resolveDateRange('fortnight', NOW), /unknown date range preset/);
  const unbounded = resolveDateRange(null, NOW);
  assert.equal(unbounded.from, null);
  assert.equal(unbounded.to, null);
}

// --- filterByDateRange ------------------------------------------------------------------
const rows = [
  { id: 'a', at: '2026-11-04T09:00:00' },  // today
  { id: 'b', at: '2026-11-03' },           // yesterday (local-midnight parse)
  { id: 'c', at: '2026-10-15' },           // last month
  { id: 'd', at: '' },                     // undated
];
{
  const r = filterByDateRange(rows, { field: 'at', range: 'today', now: NOW });
  assert.deepEqual(r.rows.map((x) => x.id), ['a']);
  assert.equal(key(r.from), '2026-11-04');
  const lw = filterByDateRange(rows, { field: 'at', range: 'last_week', now: NOW });
  assert.deepEqual(lw.rows.map((x) => x.id), [], 'last week is Oct 26–Nov 1');
  const lm = filterByDateRange(rows, { field: 'at', range: 'last_month', now: NOW });
  assert.deepEqual(lm.rows.map((x) => x.id), ['c']);
  const all = filterByDateRange(rows, { field: 'at', range: null, now: NOW });
  assert.equal(all.rows.length, 4, 'unbounded range keeps undated rows too');
  const fn = filterByDateRange(rows, { field: (x) => x.at, range: 'today', now: NOW });
  assert.deepEqual(fn.rows.map((x) => x.id), ['a'], 'accessor fn field works');
  const openEnd = filterByDateRange(rows, { field: 'at', range: { from: '2026-11-03' }, now: NOW });
  assert.deepEqual(openEnd.rows.map((x) => x.id), ['a', 'b'], 'custom open end keeps everything after from');
}

// --- void policies -----------------------------------------------------------------------
const mixed = [
  { id: 'ok1', status: 'sent' },
  { id: 'v1', void: true },
  { id: 'v2', deleted: true },
  { id: 'v3', status: 'void' },
  { id: 'v4', is_void: true },
  { id: 'ok2', status: 'paid' },
];
assert.equal(isVoidRow(mixed[0]), false);
assert.equal(isVoidRow(mixed[1]), true);
assert.equal(isVoidRow(mixed[2]), true);
assert.equal(isVoidRow(mixed[3]), true);
assert.equal(isVoidRow('nope'), false);
assert.deepEqual(voidPolicyFilter(mixed, 'exclude').map((r) => r.id), ['ok1', 'ok2']);
assert.deepEqual(voidPolicyFilter(mixed).map((r) => r.id), ['ok1', 'ok2'], 'exclude is the default');
assert.equal(voidPolicyFilter(mixed, 'include').length, 6);
assert.deepEqual(voidPolicyFilter(mixed, 'only').map((r) => r.id), ['v1', 'v2', 'v3', 'v4']);
assert.throws(() => voidPolicyFilter(mixed, 'shred'), /unknown void policy/);

// --- runReport shape + param resolution --------------------------------------------------------
{
  const data = {
    orders: [
      { customer: 'Acme', total: 26.65, share: 0.625, ignored: 'x' },
      { customer: 'Big Co', total: 16, share: 0.375 },
    ],
  };
  let seenParams;
  const spy = defineReport({
    ...baseSpec,
    run: (p, d) => { seenParams = p; return { rows: d.orders }; },
    summarize: (rs) => ({ totals: { customer: 'Total', total: rs.reduce((s, r) => s + r.total, 0), share: null } }),
  });
  const res = runReport(spy, {
    params: {
      date_range: { preset: 'custom', from: '2026-10-01', to: '2026-10-31' },
      date_basis: 'completed',
      void_policy: 'bogus',          // invalid → default + warning
      salesperson: '  Sam  ',        // trimmed
    },
    data, now: NOW,
  });
  assert.equal(res.columns.length, 3);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].customer, 'Acme');
  assert.equal(res.rows[0].share, 0.625);
  assert.equal(res.rows[0].ignored, 'x', 'extra row keys preserved for drilldowns');
  assert.equal(res.meta.reportId, 'sales_by_customer');
  assert.equal(res.meta.rowCount, 2);
  assert.equal(res.meta.generatedAt, NOW.toISOString());
  assert.equal(seenParams.date_basis, 'completed');
  assert.equal(seenParams.date_range.preset, 'custom');
  assert.equal(key(seenParams.date_range.from), '2026-10-01', 'run() receives resolved Dates');
  assert.equal(seenParams.void_policy, 'exclude', 'invalid select coerced to default');
  assert.equal(seenParams.salesperson, 'Sam');
  assert.ok(res.meta.warnings.some((w) => w.includes('void_policy')));
  assert.deepEqual(res.meta.paramEcho, seenParams, 'paramEcho mirrors resolved params');
  assert.equal(Math.round(res.summary.totals.total * 100) / 100, 42.65, 'summarize totals row lands on summary');
  assert.equal(res.summary.totals.customer, 'Total');
}

// Array rows zip to columns; missing object keys → null; bare array return.
{
  const zip = defineReport({
    id: 'zip', name: 'Zip', category: 'activity',
    columns: [{ key: 'a' }, { key: 'b', format: 'money' }, { key: 'c' }],
    run: () => [['x', 5, true], { a: 'y', b: 7 }], // mixed array + object rows
  });
  const res = runReport(zip, { now: NOW });
  assert.deepEqual(res.rows[0], { a: 'x', b: 5, c: true });
  assert.equal(res.rows[1].c, null, 'missing column key normalized to null');
  const bare = defineReport({ id: 'bare', name: 'B', category: 'activity', columns: [{ key: 'a' }], run: () => [{ a: 1 }] });
  assert.equal(runReport(bare, { now: NOW }).rows[0].a, 1, 'bare array return accepted');
  const dyn = defineReport({ id: 'dyn', name: 'D', category: 'sales', columns: [{ key: 'a' }], run: () => ({ columns: [{ key: 'm', label: 'Oct' }, { key: 'n', label: 'Nov' }], rows: [[1, 2]] }) });
  const dres = runReport(dyn, { now: NOW });
  assert.deepEqual(dres.columns.map((c) => c.key), ['m', 'n'], 'run() may override columns (crosstab)');
  const bad = defineReport({ id: 'bad', name: 'B', category: 'sales', columns: [{ key: 'a' }], run: () => ({ rows: 'nope' }) });
  assert.throws(() => runReport(bad, { now: NOW }), /must return rows/);
}

// Param coercion details: boolean/number/multiselect + date_range default.
{
  const p = defineReport({
    id: 'p', name: 'P', category: 'sales',
    params: [
      { key: 'flag', type: 'boolean', label: 'Flag', default: false },
      { key: 'min', type: 'number', label: 'Min', default: null },
      { key: 'sts', type: 'multiselect', label: 'S', options: ['sent', 'paid', 'void'], default: [] },
      { key: 'dr', type: 'date_range', label: 'Range', default: 'this_year' },
    ],
    columns: [{ key: 'a' }],
    run: (params) => [{ a: JSON.stringify(params) }],
  });
  const res = runReport(p, { params: { flag: 'true', min: '12.5', sts: ['paid', 'bogus', 'void'] }, now: NOW });
  const got = JSON.parse(res.rows[0].a);
  assert.equal(got.flag, true, 'boolean coerces "true"');
  assert.equal(got.min, 12.5, 'number coerces numeric string');
  assert.deepEqual(got.sts, ['paid', 'void'], 'multiselect drops invalid options');
  assert.equal(got.dr.preset, 'this_year', 'date_range default resolves');
  assert.equal(key(new Date(got.dr.from)), '2026-01-01');
}

// summarize returning an array wraps to { totals }.
{
  const s = defineReport({
    id: 's', name: 'S', category: 'financial',
    columns: [{ key: 'label' }, { key: 'amt', format: 'money' }],
    run: () => [['a', 1], ['b', 2]],
    summarize: () => ['Total', 3],
  });
  assert.deepEqual(runReport(s, { now: NOW }).summary, { totals: ['Total', 3] });
}

// --- CSV -----------------------------------------------------------------------------------------
{
  const cols = [
    { key: 'name', label: 'Customer, Inc.' },
    { key: 'note', label: 'Note' },
    { key: 'total', label: 'Total', format: 'money' },
    { key: 'share', label: 'Share', format: 'percent' },
    { key: 'when', label: 'When', format: 'date' },
    { key: 'n', label: 'N', format: 'int' },
  ];
  const csv = rowsToCsv(cols, [
    { name: 'Acme, LLC', note: 'said "hi"', total: 26.656, share: 0.42, when: '2026-11-04T12:00:00', n: 3.6 },
    { name: 'Line\nBreak', note: '', total: null, share: null, when: '', n: null },
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], '"Customer, Inc.",Note,Total,Share,When,N', 'header label with comma is quoted');
  assert.equal(lines[1], '"Acme, LLC","said ""hi""",26.66,0.42,2026-11-04,4', 'escaping + money raw + pct raw + ISO date + int rounding');
  assert.ok(csv.includes('"Line\nBreak",,,,,\n'), 'embedded newline quoted; nulls empty');
  assert.ok(csv.endsWith('\n'));
  assert.ok(!csv.includes('$'), 'money is a raw number, not a display string');
  // array rows zip by column order
  const csv2 = rowsToCsv([{ key: 'a' }, { key: 'b', format: 'money' }], [['x', 9.996], ['y', 9.995]]);
  assert.equal(csv2.split('\n')[1], 'x,10', 'array rows zip to columns; money rounds to cents');
  assert.equal(csv2.split('\n')[2], 'y,9.99', '9.995 is stored as 9.99499… — cents rounding is IEEE-exact');
}

// --- display formatting + helpers --------------------------------------------------------------------
assert.equal(formatCellValue(1234.5, { format: 'money' }), '$1,234.50');
assert.equal(formatCellValue(0.42, { format: 'percent' }), '42.0%');
assert.equal(formatCellValue(1234, { format: 'int' }), '1,234');
assert.equal(formatCellValue('2026-11-04T10:00:00', { format: 'date' }), '2026-11-04');
assert.equal(parseReportDate('not a date'), null);
assert.equal(key(parseReportDate('2026-02-28')), '2026-02-28', 'YYYY-MM-DD parses local-midnight');
assert.deepEqual(standardReportParams(['date_range', 'void_policy']).map((p) => p.key), ['date_range', 'void_policy']);
assert.equal(standardReportParams().length, 5, 'standard set: date_basis/date_range/salesperson/location/void_policy');

rmSync(out, { force: true });
console.log('PASS report-engine');
