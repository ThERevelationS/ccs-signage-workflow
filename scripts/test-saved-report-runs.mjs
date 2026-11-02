// Unit checks for base44/shared/savedReportRunsModel.ts (masterplan J-09):
// saved report runs — run history + parameter persistence + re-run +
// scheduled digest delivery via H-13. Covers canonical params/hash
// stability (key-order independence), runRecord shape + deterministic
// creation_request_key, rerunSpec replay, savedViewFor naming, cron-hint
// next-run math (daily/weekly/monthly incl. month-end clamp), due
// detection + advance stamp, history sorting/filters, and the digest
// line-item bridge. esbuild-bundle pattern — same as test-digest-batch.mjs.
//
// Run: node scripts/test-saved-report-runs.mjs  →  prints "PASS saved-report-runs"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-saved-report-runs-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/savedReportRunsModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  REPORT_RUN_KEY_PREFIX,
  SCHEDULED_REPORT_KEY_PREFIX,
  REPORT_RUN_DIGEST_KIND,
  REPORT_DEEP_LINK_BASE,
  HISTORY_LIMIT_DEFAULT,
  canonicalParams,
  canonicalParamsJson,
  paramsHash,
  paramSignature,
  reportRunDayMs,
  runRecord,
  savedViewFor,
  parseRunParams,
  rerunSpec,
  normalizeCronHint,
  nextRunAt,
  scheduledReportPatch,
  scheduledRunsDue,
  scheduledReportRunStamp,
  historyRows,
  reportRunDigestItem,
} = await import(pathToFileURL(out).href);

const DAY = '2026-11-02';
const NOW = '2026-11-02T15:04:00'; // local-time ISO — schedule math is wall-clock

// ---------------------------------------------------------------------------
// canonical params / hash stability — key order must never matter
// ---------------------------------------------------------------------------
{
  const a = { date_basis: 'created', date_range: 'this_month', statuses: ['open', 'built'] };
  const b = { statuses: ['open', 'built'], date_range: 'this_month', date_basis: 'created' };
  assert.equal(canonicalParamsJson(a), canonicalParamsJson(b), 'canonical JSON key-order independent');
  assert.equal(
    canonicalParamsJson({ b: 1, a: 2 }),
    '{"a":2,"b":1}',
    'top-level keys sorted',
  );
  assert.equal(
    canonicalParamsJson({ z: { y: 1, x: 2 }, a: [{ d: 4, c: 3 }] }),
    '{"a":[{"c":3,"d":4}],"z":{"x":2,"y":1}}',
    'nested keys deep-sorted',
  );
  assert.equal(paramsHash(a), paramsHash(b), 'hash key-order independent');
  assert.notEqual(paramsHash(a), paramsHash({ ...a, statuses: ['open'] }), 'different params → different hash');
  assert.equal(paramsHash(a), paramsHash(canonicalParams(a)), 'hash stable across canonicalize round-trip');
  assert.equal(
    canonicalParamsJson({ keep: 1, drop: undefined, fn: () => 1, nan: NaN }),
    '{"keep":1,"nan":null}',
    'JSON semantics: undefined/function drop, NaN → null',
  );
  assert.equal(canonicalParamsJson(null), '{}', 'null params → empty canonical');
  assert.equal(canonicalParamsJson('junk'), '{}', 'non-object params → empty canonical');
  assert.deepEqual(
    canonicalParams({ b: { y: 2, x: 1 }, a: [3, undefined] }),
    { a: [3, null], b: { x: 1, y: 2 } },
    'canonicalParams returns JSON-safe deep-sorted object',
  );
  assert.equal(
    paramSignature({ range: 'this_month', basis: 'created', tags: ['a', 'b'], blank: '' }),
    'basis=created&blank=&range=this_month&tags=a|b',
    'paramSignature sorted k=v text',
  );
}

// ---------------------------------------------------------------------------
// runRecord — shape, timestamp, deterministic creation_request_key
// ---------------------------------------------------------------------------
{
  const params = { date_basis: 'created', date_range: 'this_month' };
  const rec = runRecord('sales_by_customer', params, {
    actor_id: 'Alice@Shop.com', now: NOW, row_count: 42, duration_ms: 137.6,
  });
  const hash = paramsHash(params);
  const dayMs = new Date(2026, 10, 2).getTime(); // local midnight of run day
  assert.equal(rec.report_id, 'sales_by_customer', 'report_id carried');
  assert.equal(rec.params_snapshot, canonicalParamsJson(params), 'params_snapshot is canonical JSON string');
  assert.equal(rec.params_hash, hash, 'params_hash = paramsHash');
  assert.equal(rec.run_by, 'alice@shop.com', 'actor normalized lowercase');
  assert.equal(rec.run_at, new Date(NOW).toISOString(), 'run_at = ISO of now');
  assert.equal(rec.row_count, 42, 'row_count carried');
  assert.equal(rec.duration_ms, 138, 'duration_ms rounded int');
  assert.equal(
    rec.creation_request_key,
    `rptrun:sales_by_customer:${hash}:${dayMs}`,
    'creation_request_key = rptrun:<report>:<hash>:<day-ms>',
  );
  assert.equal(reportRunDayMs(NOW), dayMs, 'reportRunDayMs = local-midnight ms');
  // retry-safety semantics: same report + same params + same day → same key
  const rec2 = runRecord('sales_by_customer', { date_range: 'this_month', date_basis: 'created' }, {
    actor_id: 'bob@shop.com', now: '2026-11-02T08:00:00', row_count: 9,
  });
  assert.equal(
    rec2.creation_request_key, rec.creation_request_key,
    'same report+params+day reuses key regardless of actor/time-of-day',
  );
  const rec3 = runRecord('sales_by_customer', params, { now: '2026-11-03T00:30:00' });
  assert.notEqual(rec3.creation_request_key, rec.creation_request_key, 'new day → new key');
  const rec4 = runRecord('sales_by_customer', { ...params, salesperson: 'al' }, { now: NOW });
  assert.notEqual(rec4.creation_request_key, rec.creation_request_key, 'new params → new key');
  const other = runRecord('orders_by_status', params, { now: NOW });
  assert.notEqual(other.creation_request_key, rec.creation_request_key, 'new report → new key');
  assert.equal(REPORT_RUN_KEY_PREFIX, 'rptrun', 'key prefix exported');
  assert.equal(runRecord('r', {}, { now: NOW }).run_by, '', 'missing actor → blank run_by');
  assert.equal(runRecord('r', {}, { now: NOW }).row_count, 0, 'missing row_count → 0');
}

// ---------------------------------------------------------------------------
// rerunSpec / parseRunParams — replay reproduces the original params
// ---------------------------------------------------------------------------
{
  const params = { date_basis: 'built', statuses: ['open', 'built'], range: { preset: 'custom', from: '2026-10-01', to: '2026-10-31' } };
  const rec = runRecord('parts_needed', params, { now: NOW });
  const spec = rerunSpec(rec);
  assert.equal(spec.report_id, 'parts_needed', 'replay carries report_id');
  assert.deepEqual(spec.params, params, 'replay reproduces params verbatim');
  assert.equal(paramsHash(spec.params), rec.params_hash, 'replayed params hash identically');
  // object-shaped stored rows also replay
  assert.deepEqual(
    rerunSpec({ report_id: 'r2', params: { a: 1, b: 2 } }),
    { report_id: 'r2', params: { a: 1, b: 2 } },
    'object params field tolerated',
  );
  assert.deepEqual(rerunSpec({ report_id: 'r3', params_snapshot: '{bad json' }), { report_id: 'r3', params: {} }, 'bad snapshot → empty params');
  assert.deepEqual(rerunSpec(null), { report_id: '', params: {} }, 'junk record → safe empty spec');
  assert.deepEqual(parseRunParams({ params_snapshot: '[1,2]' }), {}, 'non-object snapshot → {}');
}

// ---------------------------------------------------------------------------
// savedViewFor — name suggestion + canonical params
// ---------------------------------------------------------------------------
{
  const v = savedViewFor('sales_by_customer', { date_basis: 'created', salesperson: 'alice' });
  assert.equal(v.report_id, 'sales_by_customer', 'view carries report_id');
  assert.equal(v.name, 'Sales By Customer — date_basis=created&salesperson=alice', 'name = humanized id + signature');
  assert.deepEqual(v.params, { date_basis: 'created', salesperson: 'alice' }, 'view params canonical');
  assert.equal(savedViewFor('wip_by_status', {}).name, 'Wip By Status', 'empty params → base name only');
  assert.equal(savedViewFor('', {}).name, 'Report', 'blank id → Report fallback');
  assert.equal(savedViewFor('r', { a: 2, b: 1 }).params.b, 1, 'params preserved');
}

// ---------------------------------------------------------------------------
// normalizeCronHint / nextRunAt — daily / weekly / monthly + month-end clamp
// ---------------------------------------------------------------------------
{
  assert.equal(normalizeCronHint('daily'), 'daily', 'daily canonical');
  assert.equal(normalizeCronHint('weekly_mon'), 'weekly_mon', 'weekly_mon canonical');
  assert.equal(normalizeCronHint('weekly friday'), 'weekly_fri', 'weekday name normalized');
  assert.equal(normalizeCronHint('monthly_1'), 'monthly_1', 'monthly_1 canonical');
  assert.equal(normalizeCronHint('monthly_15'), 'monthly_15', 'monthly_<dom> generalized');
  assert.equal(normalizeCronHint('monthly_32'), 'daily', 'out-of-range dom → daily fallback');
  assert.equal(normalizeCronHint('bogus'), 'daily', 'unknown hint → daily (fail-visible)');
  assert.equal(normalizeCronHint(''), 'daily', 'blank → daily');
  assert.equal(normalizeCronHint('weekly'), 'weekly_mon', 'bare weekly → Monday');

  // daily — next day, same wall time (strictly after anchor)
  const from = new Date(2026, 10, 2, 15, 4, 0, 0); // Mon Nov 2 2026 15:04 local
  assert.equal(
    nextRunAt('daily', from),
    new Date(2026, 10, 3, 15, 4, 0, 0).toISOString(),
    'daily → next day same wall time',
  );
  // weekly_mon — Wed Nov 4 → Mon Nov 9; Mon Nov 2 (a Monday, same instant) → +7d
  assert.equal(
    nextRunAt('weekly_mon', new Date(2026, 10, 4, 15, 4)),
    new Date(2026, 10, 9, 15, 4).toISOString(),
    'weekly_mon from Wednesday → next Monday',
  );
  assert.equal(
    nextRunAt('weekly_mon', from),
    new Date(2026, 10, 9, 15, 4).toISOString(),
    'weekly_mon from a Monday rolls to next week (strictly after)',
  );
  assert.equal(
    nextRunAt('weekly_sun', from),
    new Date(2026, 10, 8, 15, 4).toISOString(),
    'weekly_sun → coming Sunday',
  );
  // monthly_1 — mid-month → 1st of next month; ON the 1st → next month
  assert.equal(
    nextRunAt('monthly_1', new Date(2026, 10, 15, 9, 0)),
    new Date(2026, 11, 1, 9, 0).toISOString(),
    'monthly_1 mid-month → next 1st',
  );
  assert.equal(
    nextRunAt('monthly_1', new Date(2026, 10, 1, 9, 0)),
    new Date(2026, 11, 1, 9, 0).toISOString(),
    'monthly_1 on the 1st rolls forward a month',
  );
  // month-end clamp — Jan 31 anchored monthly_31: Feb clamps to 28 (2026
  // non-leap) then resumes 31 in March (independent clamp, no cascade)
  assert.equal(
    nextRunAt('monthly_31', new Date(2026, 0, 31, 8, 30)),
    new Date(2026, 1, 28, 8, 30).toISOString(),
    'monthly_31 Jan 31 → Feb 28 (clamped, non-leap)',
  );
  assert.equal(
    nextRunAt('monthly_31', new Date(2024, 0, 31, 8, 30)),
    new Date(2024, 1, 29, 8, 30).toISOString(),
    'monthly_31 Jan 31 → Feb 29 (clamped, leap year)',
  );
  assert.equal(
    nextRunAt('monthly_31', new Date(2026, 1, 28, 8, 30)),
    new Date(2026, 2, 31, 8, 30).toISOString(),
    'clamp does not cascade — March returns to 31',
  );
  assert.equal(
    nextRunAt('monthly_30', new Date(2026, 1, 28, 8, 30)),
    new Date(2026, 2, 30, 8, 30).toISOString(),
    'monthly_30 skips February entirely',
  );
  // year rollover
  assert.equal(
    nextRunAt('monthly_1', new Date(2026, 11, 31, 12, 0)),
    new Date(2027, 0, 1, 12, 0).toISOString(),
    'monthly across year boundary',
  );
  assert.equal(
    nextRunAt('daily', new Date(2026, 11, 31, 12, 0)),
    new Date(2027, 0, 1, 12, 0).toISOString(),
    'daily across year boundary',
  );
}

// ---------------------------------------------------------------------------
// scheduledReportPatch — ScheduledReport row shape
// ---------------------------------------------------------------------------
{
  const patch = scheduledReportPatch({
    report_id: 'sales_by_customer',
    params: { date_basis: 'created', date_range: 'this_month' },
    user: 'Alice@Shop.com',
    delivery: 'digest',
    cron_hint: 'weekly_mon',
    now: NOW, // Mon Nov 2 2026 15:04 local
  });
  assert.equal(patch.report_id, 'sales_by_customer', 'patch report_id');
  assert.deepEqual(patch.params, { date_basis: 'created', date_range: 'this_month' }, 'patch params canonical object');
  assert.equal(patch.params_hash, paramsHash({ date_range: 'this_month', date_basis: 'created' }), 'patch params_hash');
  assert.equal(patch.user_email, 'alice@shop.com', 'user_email normalized');
  assert.equal(patch.delivery, 'digest', 'delivery digest');
  assert.equal(patch.cron_hint, 'weekly_mon', 'cron_hint canonicalized');
  assert.equal(patch.enabled, true, 'enabled default true');
  assert.equal(patch.last_run_at, null, 'last_run_at null before first run');
  assert.equal(
    patch.next_run_at,
    new Date(2026, 10, 9, 15, 4).toISOString(),
    'next_run_at computed from hint + now',
  );
  assert.equal(
    patch.creation_request_key,
    `rptsched:alice@shop.com:sales_by_customer:${patch.params_hash}`,
    'deterministic schedule key rptsched:<user>:<report>:<hash>',
  );
  assert.equal(SCHEDULED_REPORT_KEY_PREFIX, 'rptsched', 'schedule prefix exported');
  // defaults + normalizations
  const d = scheduledReportPatch({ report_id: 'r', params: {}, user: 'u@x.co', now: NOW });
  assert.equal(d.delivery, 'digest', 'missing delivery → digest (item is digest delivery)');
  assert.equal(
    scheduledReportPatch({ report_id: 'r', params: {}, user: 'u', delivery: 'immediate', cron_hint: 'daily', now: NOW }).delivery,
    'immediate',
    'immediate delivery honored',
  );
  assert.equal(
    scheduledReportPatch({ report_id: 'r', params: {}, user: 'u', delivery: 'bogus', now: NOW }).delivery,
    'digest',
    'unknown delivery → digest',
  );
  assert.equal(
    scheduledReportPatch({ report_id: 'r', params: {}, user: 'u', enabled: false, now: NOW }).enabled,
    false,
    'explicit enabled false honored',
  );
  // last_run_at anchors next_run_at — a late sweep catches up on cadence
  const resumed = scheduledReportPatch({
    report_id: 'r', params: {}, user: 'u', cron_hint: 'daily',
    last_run_at: '2026-10-30T15:04:00', now: NOW,
  });
  assert.equal(resumed.last_run_at, new Date('2026-10-30T15:04:00').toISOString(), 'last_run_at echoed ISO');
  assert.equal(
    resumed.next_run_at,
    new Date(2026, 9, 31, 15, 4).toISOString(),
    'next_run_at resumes from last_run_at (overdue → fires immediately)',
  );
}

// ---------------------------------------------------------------------------
// scheduledRunsDue / scheduledReportRunStamp — the sweep surface
// ---------------------------------------------------------------------------
{
  const rows = [
    { id: 'a', enabled: true, next_run_at: new Date(2026, 10, 2, 9, 0).toISOString() },
    { id: 'b', enabled: true, next_run_at: new Date(2026, 10, 2, 18, 0).toISOString() }, // future
    { id: 'c', enabled: false, next_run_at: new Date(2026, 10, 1, 9, 0).toISOString() }, // disabled
    { id: 'd', enabled: true, next_run_at: new Date(2026, 10, 1, 9, 0).toISOString() }, // oldest debt
    { id: 'e', enabled: true, next_run_at: 'not-a-date' },
    { id: 'f', next_run_at: new Date(2026, 10, 2, 10, 0).toISOString() }, // enabled absent → due
  ];
  const due = scheduledRunsDue(rows, { now: NOW });
  assert.deepEqual(due.map((r) => r.id), ['d', 'a', 'f'], 'due rows oldest-first, disabled/future/bad-date excluded');
  assert.deepEqual(scheduledRunsDue(null, { now: NOW }), [], 'null rows → []');
  assert.deepEqual(scheduledRunsDue([], { now: NOW }), [], 'empty → []');

  const stamp = scheduledReportRunStamp({ cron_hint: 'weekly_mon' }, { now: NOW });
  assert.equal(stamp.last_run_at, new Date(NOW).toISOString(), 'stamp last_run_at = now');
  assert.equal(
    stamp.next_run_at,
    new Date(2026, 10, 9, 15, 4).toISOString(),
    'stamp recomputes next from now (no catch-up drip)',
  );
}

// ---------------------------------------------------------------------------
// historyRows — newest-first + filters + limit
// ---------------------------------------------------------------------------
{
  const runs = [
    runRecord('sales_by_customer', { a: 1 }, { actor_id: 'al@x.co', now: '2026-11-01T10:00:00', row_count: 3 }),
    runRecord('sales_by_customer', { a: 1 }, { actor_id: 'bo@x.co', now: '2026-11-02T08:00:00', row_count: 4 }),
    runRecord('wip_by_status', { b: 2 }, { actor_id: 'al@x.co', now: '2026-11-02T09:00:00', row_count: 5 }),
    { id: 'legacy', report_id: 'sales_by_customer', run_by: 'al@x.co', created_date: '2026-10-30T12:00:00Z' },
    { id: 'nodate', report_id: 'sales_by_customer', run_by: 'al@x.co' },
    'junk',
  ];
  const all = historyRows(runs, { limit: 50 });
  assert.deepEqual(
    all.map((r) => r.id ?? r.creation_request_key),
    [runs[2].creation_request_key, runs[1].creation_request_key, runs[0].creation_request_key, 'legacy', 'nodate'],
    'newest-first; undated rows sink to bottom; junk dropped',
  );
  const scoped = historyRows(runs, { report_id: 'sales_by_customer' });
  assert.equal(scoped.length, 4, 'report_id filter');
  assert.ok(scoped.every((r) => r.report_id === 'sales_by_customer'), 'filter holds');
  const mine = historyRows(runs, { user: 'AL@x.co' });
  assert.equal(mine.length, 4, 'user filter case-insensitive');
  assert.ok(mine.every((r) => (r.run_by ?? '').toLowerCase() === 'al@x.co'), 'user rows only');
  const both = historyRows(runs, { report_id: 'wip_by_status', user: 'al@x.co' });
  assert.equal(both.length, 1, 'combined filters');
  assert.equal(historyRows(runs, { limit: 2 }).length, 2, 'limit slices');
  assert.equal(historyRows(runs, {}).length, 5, `default limit ${HISTORY_LIMIT_DEFAULT} keeps all 5`);
  assert.deepEqual(historyRows(runs, { limit: 0 }), [], 'limit 0 → []');
  assert.deepEqual(historyRows(null), [], 'null runs → []');
  // user_email alias rows match the user filter too
  assert.equal(
    historyRows([{ report_id: 'r', user_email: 'al@x.co', run_at: NOW }], { user: 'al@x.co' }).length,
    1,
    'user_email alias matches user filter',
  );
}

// ---------------------------------------------------------------------------
// reportRunDigestItem — H-13 bridge ({title, deep_link, kind})
// ---------------------------------------------------------------------------
{
  const rec = runRecord('sales_by_customer', {}, { now: NOW, row_count: 42 });
  const item = reportRunDigestItem(rec, { report_name: 'Sales by Customer' });
  assert.equal(item.kind, REPORT_RUN_DIGEST_KIND, 'digest item kind');
  assert.equal(item.title, 'Sales by Customer ready — 42 rows', 'item title carries name + row count');
  assert.equal(item.deep_link, `${REPORT_DEEP_LINK_BASE}?report=sales_by_customer`, 'deep link = /OpsReports?report=<id>');
  const bare = reportRunDigestItem({ report_id: 'wip_by_status', row_count: 1 });
  assert.equal(bare.title, 'Wip By Status ready — 1 row', 'singular row grammar + humanized fallback name');
  assert.equal(reportRunDigestItem({ report_id: '' }).deep_link, REPORT_DEEP_LINK_BASE, 'blank id → base link');
}

rmSync(out);
console.log('PASS saved-report-runs');
