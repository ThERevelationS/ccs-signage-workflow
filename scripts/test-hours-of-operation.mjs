import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-hours-of-operation.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/hoursOfOperationModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  DAY_NAMES, DAY_INDEX, HOURS_KINDS,
  DEFAULT_PRODUCTION_HOURS, DEFAULT_SALES_HOURS,
  normalizeSchedule, normalizeKind, parseHoursString, hoursFor,
  isBusinessDay, isBusinessTime, nextOpen,
  addBusinessDays, businessHoursBetween,
  dueDateWithClock, followUpDateWithClock,
  toDueDateClock, openDayIndexes, toLocalDate, toDateOnly,
} = await import(pathToFileURL(out).href);

// Weekday anchors (verified): 2026-11-01 Sun, 11-02 Mon, 11-03 Tue,
// 11-04 Wed, 11-05 Thu, 11-06 Fri, 11-07 Sat, 11-08 Sun, 11-09 Mon,
// 11-10 Tue, 11-11 Wed (a "holiday" in several tests).
const MON = '2026-11-02';
const WED = '2026-11-04';
const FRI = '2026-11-06';
const SAT = '2026-11-07';
const MON2 = '2026-11-09';
const TUE2 = '2026-11-10';
const WED2 = '2026-11-11';
const local = (s) => new Date(s).getTime(); // 'YYYY-MM-DDTHH:MM:SS' = local

// --- exports / constants ----------------------------------------------------
assert.equal(DAY_NAMES[0], 'sunday');
assert.equal(DAY_NAMES[1], 'monday');
assert.equal(DAY_NAMES[6], 'saturday');
assert.equal(DAY_INDEX['m'], 1);
assert.equal(DAY_INDEX['thurs'], 4);
assert.equal(DAY_INDEX['sat'], 6);
assert.equal(HOURS_KINDS.PRODUCTION, 'production');
assert.equal(HOURS_KINDS.SALES, 'sales');
assert.equal(normalizeKind('sales_center'), 'sales');
assert.equal(normalizeKind('counter'), 'sales');
assert.equal(normalizeKind('prod'), 'production');
assert.equal(normalizeKind(undefined), 'production');

// Defaults: production Mon–Fri 07:00–17:00, sales Mon–Fri 08:00–17:00, sat closed.
assert.equal(DEFAULT_PRODUCTION_HOURS.days[1][0].open, '07:00');
assert.equal(DEFAULT_PRODUCTION_HOURS.days[1][0].close, '17:00');
assert.deepEqual(DEFAULT_PRODUCTION_HOURS.days[0], [], 'prod sun closed');
assert.deepEqual(DEFAULT_PRODUCTION_HOURS.days[6], [], 'prod sat closed');
assert.equal(DEFAULT_SALES_HOURS.days[1][0].open, '08:00');
assert.equal(DEFAULT_SALES_HOURS.days[1][0].close, '17:00');
assert.deepEqual(DEFAULT_SALES_HOURS.days[6], [], 'sales sat closed (spec)');

// --- normalizeSchedule: accepted shapes --------------------------------------
// Entries array (dueDateEngine.clockFromHours-compatible + closed/holiday).
{
  const s = normalizeSchedule([
    { day: 'monday', open: '08:00', close: '17:00' },
    { days_of_week: [2, 3, 4, 5] },              // day keys, no times → all-day
    { weekday: 6, closed: true },
    { date: '2026-12-25' },
  ]);
  assert.equal(s.days[1][0].open, '08:00');
  assert.equal(s.days[2][0].open, '00:00', 'bare day entry → all-day window');
  assert.equal(s.days[5][0].close, '24:00');
  assert.deepEqual(s.days[6], [], 'closed entry leaves the day empty');
  assert.deepEqual(s.holidays, ['2026-12-25']);
}
// Keyed map (incl. group keys + closed + string window).
{
  const s = normalizeSchedule({
    mon: { open: '07:00', close: '15:00' },
    weekdays: '09:00-17:00',
    sat: null,
    holidays: ['2026-12-25'],
  });
  assert.equal(s.days[1][0].open, '07:00', 'explicit day beats the group key (both applied, sorted)');
  assert.equal(s.days[3][0].open, '09:00');
  assert.deepEqual(s.days[6], [], 'null value = closed');
  assert.deepEqual(s.holidays, ['2026-12-25']);
}
// Single-entry object, JSON string, canonical passthrough, garbage.
{
  const s = normalizeSchedule({ day: 'saturday', open: '09:00', close: '13:00' });
  assert.equal(s.days[6][0].open, '09:00');
}
{
  const s = normalizeSchedule('{"tue":{"open":"06:00","close":"14:00"}}');
  assert.equal(s.days[2][0].close, '14:00', 'JSON string parses');
}
{
  const s = normalizeSchedule(DEFAULT_PRODUCTION_HOURS);
  assert.equal(s.days[4][0].open, '07:00', 'canonical passthrough');
  assert.ok(s.days.every(Array.isArray));
}
assert.equal(normalizeSchedule(null), null);
assert.equal(normalizeSchedule([]), null);
assert.equal(normalizeSchedule('totally bogus text'), null);
assert.equal(normalizeSchedule('closed'), null, 'empty result → not a schedule');
assert.equal(normalizeSchedule({ days: [[], [], [], [], [], [], []] }), null, 'all-closed canonical → null');
assert.equal(normalizeSchedule({ foo: 'bar' }), null, 'no day keys → null');
// Holidays-only → schedule exists, open every non-holiday day.
{
  const s = normalizeSchedule({ holidays: ['2026-11-11'] });
  assert.deepEqual(s.holidays, ['2026-11-11']);
  assert.ok(isBusinessTime(`${MON}T10:00:00`, s), 'holidays-only → non-holiday days open');
  assert.ok(!isBusinessTime(`${WED2}T10:00:00`, s), 'the holiday itself is closed');
  assert.ok(!isBusinessDay(WED2, s));
}

// --- parseHoursString (SalesLocation.hours free text) -------------------------
{
  const s = parseHoursString('M-F 8-5');
  assert.equal(s.days[1][0].open, '08:00');
  assert.equal(s.days[1][0].close, '17:00', 'bare "8-5" reads 08:00–17:00');
  assert.equal(s.days[5][0].close, '17:00');
  assert.deepEqual(s.days[0], []);
}
{
  const s = parseHoursString('daily 7-5; sun closed');
  assert.equal(s.days[6][0].open, '07:00');
  assert.deepEqual(s.days[0], [], 'closed segment clears the day');
}
{
  const s = parseHoursString('mon-fri 8:00-17:00; sat 9-1');
  assert.equal(s.days[6][0].open, '09:00');
  assert.equal(s.days[6][0].close, '13:00');
}
{
  const s = parseHoursString('weekdays 8:00a-5:00p');
  assert.equal(s.days[3][0].open, '08:00');
  assert.equal(s.days[3][0].close, '17:00');
}
{
  const s = parseHoursString('24/7');
  assert.equal(s.days[0][0].close, '24:00');
}
assert.equal(parseHoursString(''), null);
assert.equal(parseHoursString('call ahead for hours'), null);

// --- hoursFor: location → settings → defaults --------------------------------
// Settings tier: the A-21 GlobalSettings object, flat, KV row, and KV array.
{
  const settings = { hoursOfOperation: { production_hours: [{ day: 'saturday', open: '09:00', close: '13:00' }] } };
  const s = hoursFor(null, { settings, kind: 'production' });
  assert.equal(s.source, 'settings');
  assert.equal(s.days[6][0].open, '09:00');
}
{
  const s = hoursFor(null, {
    settings: [{ setting_key: 'hoursOfOperation', setting_value: { sales_center_hours: [{ day: 'mon', open: '10:00', close: '18:00' }] } }],
    kind: 'sales',
  });
  assert.equal(s.source, 'settings', 'KV row array resolves');
  assert.equal(s.days[1][0].open, '10:00');
}
{
  const s = hoursFor(null, {
    settings: { setting_key: 'hoursOfOperation', setting_value: { production_hours: [{ day: 'sun', open: '08:00', close: '12:00' }] } },
    kind: 'production',
  });
  assert.equal(s.source, 'settings', 'single KV row resolves via setting_value');
  assert.equal(s.days[0][0].open, '08:00');
}
// Location tier beats settings; kind-specific location fields beat `hours`.
{
  const s = hoursFor(
    { name: 'East', id: 'loc1', hours: '{"mon":{"open":"06:00","close":"14:00"}}' },
    { settings: { production_hours: [{ day: 'mon', open: '07:00', close: '17:00' }] }, kind: 'production' },
  );
  assert.equal(s.source, 'location');
  assert.equal(s.location_id, 'loc1');
  assert.equal(s.days[1][0].open, '06:00', 'location JSON hours win');
}
{
  const s = hoursFor(
    { name: 'Main', hours: 'M-F 8-5', production_hours: [{ day: 'mon', open: '05:00', close: '15:00' }] },
    { kind: 'production' },
  );
  assert.equal(s.days[1][0].open, '05:00', 'kind-specific field beats generic hours');
  const sales = hoursFor(
    { name: 'Main', hours: 'M-F 8-5', production_hours: [{ day: 'mon', open: '05:00', close: '15:00' }] },
    { kind: 'sales' },
  );
  assert.equal(sales.days[1][0].open, '08:00', 'sales kind uses the generic hours text');
}
// Unparseable location hours falls through to settings, then defaults.
{
  const s = hoursFor({ hours: 'call us' }, { settings: { sales_center_hours: [{ day: 'tue', open: '11:00', close: '19:00' }] }, kind: 'sales' });
  assert.equal(s.source, 'settings');
  assert.equal(s.days[2][0].open, '11:00');
}
{
  const prod = hoursFor(null, { kind: 'production' });
  assert.equal(prod.source, 'default');
  assert.equal(prod.days[1][0].open, '07:00');
  const sales = hoursFor(null, { kind: 'sales_center' });
  assert.equal(sales.days[1][0].open, '08:00', 'sales_center alias picks the sales default');
}

// --- isBusinessTime / isBusinessDay ------------------------------------------
assert.ok(isBusinessTime(`${MON}T10:00:00`, DEFAULT_PRODUCTION_HOURS));
assert.ok(isBusinessTime(`${MON}T07:00:00`, DEFAULT_PRODUCTION_HOURS), 'open instant inclusive');
assert.ok(!isBusinessTime(`${MON}T17:00:00`, DEFAULT_PRODUCTION_HOURS), 'close instant exclusive');
assert.ok(!isBusinessTime(`${MON}T06:59:00`, DEFAULT_PRODUCTION_HOURS));
assert.ok(!isBusinessTime(`${SAT}T10:00:00`, DEFAULT_PRODUCTION_HOURS), 'closed day');
assert.ok(isBusinessTime(`${SAT}T10:00:00`, null), 'null schedule → unrestricted');
assert.ok(isBusinessDay(SAT, null), 'unrestricted → every day a business day');
assert.ok(!isBusinessDay(SAT, DEFAULT_SALES_HOURS));
// Overnight window (close <= open spans midnight) + tail.
{
  const night = normalizeSchedule({ fri: { open: '20:00', close: '02:00' } });
  assert.ok(isBusinessTime(`${FRI}T23:00:00`, night));
  assert.ok(isBusinessTime(`${SAT}T01:00:00`, night), "yesterday's overnight tail");
  assert.ok(!isBusinessTime(`${SAT}T03:00:00`, night), 'past the tail');
  assert.ok(!isBusinessTime(`${FRI}T19:00:00`, night));
}
// Multi-window day + holiday.
{
  const s = normalizeSchedule({
    mon: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }],
    holidays: ['2026-11-02'],
  });
  assert.ok(!isBusinessTime(`${MON}T10:00:00`, s), 'holiday closes both windows');
  const noHol = normalizeSchedule({ mon: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }] });
  assert.ok(isBusinessTime(`${MON}T10:00:00`, noHol));
  assert.ok(!isBusinessTime(`${MON}T12:30:00`, noHol), 'gap between windows');
  assert.ok(isBusinessTime(`${MON}T14:00:00`, noHol));
}

// --- nextOpen ------------------------------------------------------------------
assert.equal(nextOpen(`${MON}T18:00:00`, DEFAULT_PRODUCTION_HOURS).getTime(), local('2026-11-03T07:00:00'), 'after close → next morning');
assert.equal(nextOpen(`${SAT}T12:00:00`, DEFAULT_PRODUCTION_HOURS).getTime(), local(`${MON2}T07:00:00`), 'weekend → Monday open');
assert.equal(nextOpen(`${MON}T10:00:00`, DEFAULT_PRODUCTION_HOURS).getTime(), local(`${MON}T10:00:00`), 'already open → same instant');
{
  const s = normalizeSchedule({ weekdays: '08:00-17:00', holidays: ['2026-11-03'] });
  assert.equal(nextOpen(`${MON}T18:00:00`, s).getTime(), local('2026-11-04T08:00:00'), 'holiday skipped');
}
assert.equal(nextOpen(`${FRI}T18:00:00`, DEFAULT_SALES_HOURS).getTime(), local(`${MON2}T08:00:00`), 'sales clock opens 08:00');

// --- addBusinessDays (whole-day skip semantics) --------------------------------
assert.equal(toDateOnly(addBusinessDays(`${FRI}T15:00:00`, 1, DEFAULT_PRODUCTION_HOURS)), MON2, 'Fri+1 → Mon');
assert.equal(addBusinessDays(`${FRI}T15:00:00`, 1, DEFAULT_PRODUCTION_HOURS).getHours(), 15, 'time-of-day preserved');
assert.equal(toDateOnly(addBusinessDays(`${WED}T09:00:00`, 3, DEFAULT_PRODUCTION_HOURS)), MON2, 'Wed+3 skips weekend');
assert.equal(toDateOnly(addBusinessDays(`${SAT}T09:00:00`, 1, DEFAULT_PRODUCTION_HOURS)), MON2, 'closed-day anchor counts forward');
assert.equal(toDateOnly(addBusinessDays(`${SAT}T09:00:00`, 0, DEFAULT_PRODUCTION_HOURS)), SAT, 'N=0 returns anchor even on a closed day');
assert.equal(toDateOnly(addBusinessDays(`${FRI}T09:00:00`, 1, null)), SAT, 'unrestricted → calendar days');
{
  const s = normalizeSchedule({ weekdays: '08:00-17:00', holidays: ['2026-11-09'] });
  assert.equal(toDateOnly(addBusinessDays(`${FRI}T09:00:00`, 1, s)), TUE2, 'holiday skipped');
}
{
  const satOpen = normalizeSchedule({ 'mon-sat': '07:00-17:00' });
  assert.equal(toDateOnly(addBusinessDays(`${FRI}T09:00:00`, 1, satOpen)), SAT, 'open Saturday counts');
}

// --- businessHoursBetween ------------------------------------------------------
// Full open window Mon 07:00–17:00 = 10h.
assert.equal(businessHoursBetween(`${MON}T09:00:00`, `${MON}T12:00:00`, DEFAULT_PRODUCTION_HOURS), 3);
assert.equal(businessHoursBetween(`${MON}T12:00:00`, '2026-11-03T12:00:00', DEFAULT_PRODUCTION_HOURS), 10, 'Mon 12-17 (5h) + Tue 07-12 (5h)');
assert.equal(businessHoursBetween(`${FRI}T16:00:00`, `${MON2}T09:00:00`, DEFAULT_PRODUCTION_HOURS), 3, 'weekend excluded: Fri 16-17 + Mon 07-09');
assert.equal(businessHoursBetween(`${FRI}T18:00:00`, `${MON2}T06:00:00`, DEFAULT_PRODUCTION_HOURS), 0, 'outside all windows');
assert.equal(businessHoursBetween(`${MON}T12:00:00`, `${MON}T09:00:00`, DEFAULT_PRODUCTION_HOURS), 0, 'to<=from → 0');
assert.equal(businessHoursBetween(`${SAT}T00:00:00`, '2026-11-09T00:00:00', null), 48, 'unrestricted → all elapsed hours');
{
  const night = normalizeSchedule({ fri: { open: '20:00', close: '02:00' } });
  assert.equal(businessHoursBetween(`${FRI}T20:00:00`, `${SAT}T02:00:00`, night), 6, 'overnight window');
  assert.equal(businessHoursBetween(`${FRI}T21:00:00`, `${SAT}T01:00:00`, night), 4);
}
{
  const overlap = normalizeSchedule({ mon: [{ open: '08:00', close: '12:00' }, { open: '11:00', close: '17:00' }] });
  assert.equal(businessHoursBetween(`${MON}T08:00:00`, `${MON}T17:00:00`, overlap), 9, 'overlapping windows merged — no double count');
}

// --- dueDateWithClock (production clock for deadline math) ---------------------
assert.equal(dueDateWithClock({ product_lead_days: 1 }, { now: FRI }), MON2, 'default production clock skips weekend');
assert.equal(dueDateWithClock({ product_lead_days: 3 }, { now: WED }), MON2);
assert.equal(dueDateWithClock({ product_lead_days: 0 }, { now: FRI }), FRI, 'zero lead → anchor day');
assert.equal(dueDateWithClock({}, { now: FRI, lead_days: 2 }), TUE2, 'explicit lead_days param');
{
  const satOpen = normalizeSchedule({ 'mon-sat': '07:00-17:00' });
  assert.equal(dueDateWithClock({ product_lead_days: 1 }, { now: FRI, schedule: satOpen }), SAT, 'caller-supplied schedule honored');
}
assert.equal(dueDateWithClock({ lead_days: 4 }, { now: 'garbage' }), '', 'unparseable now → ""');

// --- followUpDateWithClock (sales clock for follow-up math) --------------------
{
  const iso = followUpDateWithClock(`${FRI}T10:00:00`, 1, DEFAULT_SALES_HOURS);
  assert.equal(new Date(iso).getTime(), local(`${MON2}T10:00:00`), 'Fri sent +1 sales day → Mon same time');
}
{
  const iso = followUpDateWithClock(`${SAT}T09:00:00`, 0, DEFAULT_SALES_HOURS);
  assert.equal(new Date(iso).getTime(), local(`${MON2}T08:00:00`), 'lands outside hours → snapped to next open');
}
{
  const iso = followUpDateWithClock(`${FRI}T18:30:00`, 1, DEFAULT_SALES_HOURS);
  assert.equal(new Date(iso).getTime(), local(`${TUE2}T08:00:00`), 'Mon 18:30 is closed → Tue open');
}
assert.equal(followUpDateWithClock('garbage', 1, DEFAULT_SALES_HOURS), '');
{
  // Sales and production clocks diverge on Saturday: sales (Mon–Fri) pushes
  // a Friday+1 follow-up to Monday; a Mon–Sat schedule lands Saturday.
  const satOpen = normalizeSchedule({ 'mon-sat': '08:00-17:00' });
  const iso = followUpDateWithClock(`${FRI}T10:00:00`, 1, satOpen);
  assert.equal(new Date(iso).getTime(), local(`${SAT}T10:00:00`));
}

// --- toDueDateClock bridge -----------------------------------------------------
{
  const c = toDueDateClock(DEFAULT_PRODUCTION_HOURS);
  assert.deepEqual(c.business_days, [1, 2, 3, 4, 5]);
  assert.deepEqual(c.holidays, []);
  const s = normalizeSchedule([{ day: 'tue', open: '09:00', close: '17:00' }, { date: '2026-12-25' }]);
  const c2 = toDueDateClock(s, 'shop');
  assert.deepEqual(c2.business_days, [2]);
  assert.deepEqual(c2.holidays, ['2026-12-25']);
  assert.equal(c2.name, 'shop');
  assert.equal(toDueDateClock(null).business_days, null, 'unrestricted → calendar-mode clock');
}
assert.deepEqual(openDayIndexes(DEFAULT_SALES_HOURS), [1, 2, 3, 4, 5]);
assert.deepEqual(openDayIndexes(null), [0, 1, 2, 3, 4, 5, 6]);

// --- misc ----------------------------------------------------------------------
assert.equal(toDateOnly(toLocalDate('2026-11-02')), '2026-11-02');
assert.equal(toLocalDate('not a date'), null);
assert.equal(toDateOnly(addBusinessDays(MON, 5, DEFAULT_PRODUCTION_HOURS)), MON2, 'date-only input → local-midnight convention');

rmSync(out, { force: true });
console.log('PASS hours-of-operation');
