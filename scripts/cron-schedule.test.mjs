import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCron, isValidTimeZone, nextRuns, minIntervalMinutes,
  describeCron, firingMinutesOverlap, validateSchedule, MIN_INTERVAL_MINUTES,
} from '../src/shared/cronSchedule.mjs';

test('parseCron accepts valid expressions', () => {
  const p = parseCron('*/15 1-6 2,4 3-12/2 1-5');
  assert.equal(p.minute.size, 4);
  assert.deepEqual([...p.hour], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...p.dom], [2, 4]);
  assert.deepEqual([...p.month], [3, 5, 7, 9, 11]);
  assert.equal(p.domStar, false);
  assert.equal(p.dowStar, false);
  const star = parseCron('* * * * *');
  assert.equal(star.domStar, true);
  assert.equal(star.dowStar, true);
  const dow7 = parseCron('0 0 * * 7');
  assert.deepEqual([...dow7.dow], [0]);
  const nStep = parseCron('5/20 * * * *'); // n/s means n-max/s
  assert.deepEqual([...nStep.minute], [5, 25, 45]);
});

test('parseCron rejects invalid expressions', () => {
  for (const bad of [
    '@daily', '0 0 * * * *', '0 0 * *', '0 0 L * *', '0 0 * * MON',
    '0 0 * JAN *', '0 0 * * 1#2', '0 0 ? * *', '0 0 * * 1W',
    '61 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8',
    '*/0 * * * *', 'a-b * * * *', '5-2 * * * *',
  ]) {
    assert.throws(() => parseCron(bad), undefined, bad);
  }
});

test('isValidTimeZone', () => {
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
  assert.equal(isValidTimeZone(''), false);
});

test('nextRuns exact instants for minute list', () => {
  const from = new Date('2026-06-01T12:00:00Z'); // 08:00 EDT
  const runs = nextRuns('8,23,38,53 * * * *', 'America/New_York', from, 5);
  assert.deepEqual(
    runs.map((d) => d.toISOString()),
    [
      '2026-06-01T12:08:00.000Z',
      '2026-06-01T12:23:00.000Z',
      '2026-06-01T12:38:00.000Z',
      '2026-06-01T12:53:00.000Z',
      '2026-06-01T13:08:00.000Z',
    ],
  );
});

test('daily 7:00 across DST start and end shifts UTC instant', () => {
  // EST->EDT on 2026-03-08: before is 12:00Z, after is 11:00Z.
  const beforeStart = nextRuns('0 7 * * *', 'America/New_York', new Date('2026-03-01T00:00:00Z'), 8);
  assert.equal(beforeStart[0].toISOString(), '2026-03-01T12:00:00.000Z');
  assert.equal(beforeStart[6].toISOString(), '2026-03-07T12:00:00.000Z');
  assert.equal(beforeStart[7].toISOString(), '2026-03-08T11:00:00.000Z');
  // EDT->EST on 2026-11-01: before is 11:00Z, after is 12:00Z.
  const beforeEnd = nextRuns('0 7 * * *', 'America/New_York', new Date('2026-10-30T00:00:00Z'), 4);
  assert.equal(beforeEnd[0].toISOString(), '2026-10-30T11:00:00.000Z');
  assert.equal(beforeEnd[3].toISOString(), '2026-11-02T12:00:00.000Z');
});

test('dom/dow OR semantics when both restricted', () => {
  // dom=1 OR dow=Monday: 2026-06-01 is a Monday; next run is 2026-06-01 (dow) even though dom!=1... wait 6/1 IS dom=1. Use dom=2.
  const runs = nextRuns('0 9 2 * 1', 'UTC', new Date('2026-05-31T00:00:00Z'), 3);
  // Mondays: Jun 1, Jun 8, Jun 15; dom=2: Jun 2. Either matches -> Jun 1, Jun 2, Jun 8.
  assert.deepEqual(runs.map((d) => d.toISOString().slice(0, 10)), ['2026-06-01', '2026-06-02', '2026-06-08']);
  // dom restricted, dow star -> only dom.
  const domOnly = nextRuns('0 9 2 * *', 'UTC', new Date('2026-05-31T00:00:00Z'), 1);
  assert.equal(domOnly[0].toISOString().slice(0, 10), '2026-06-02');
});

test('minIntervalMinutes', () => {
  const from = new Date('2026-06-01T00:00:00Z');
  assert.equal(minIntervalMinutes('*/5 * * * *', 'UTC', from), 5);
  assert.equal(minIntervalMinutes('2-59/5 * * * *', 'UTC', from), 5);
  assert.equal(minIntervalMinutes('*/2 * * * *', 'UTC', from), 2);
  assert.equal(minIntervalMinutes('0 7 * * 1-5', 'UTC', from), 1440);
  assert.equal(minIntervalMinutes('0 7 1 1 *', 'UTC', from), Infinity); // single run
});

test('validateSchedule', () => {
  assert.equal(validateSchedule('*/2 * * * *', 'UTC').ok, false);
  assert.match(validateSchedule('*/2 * * * *', 'UTC').error, /every 5 minutes/);
  assert.equal(validateSchedule('*/5 * * * *', 'UTC').ok, true);
  assert.equal(validateSchedule('0 7 * * *', 'America/New_York').ok, true);
  assert.equal(validateSchedule('bad cron', 'UTC').ok, false);
  assert.equal(validateSchedule('*/5 * * * *', 'Not/AZone').ok, false);
  assert.equal(MIN_INTERVAL_MINUTES, 5);
});

test('describeCron', () => {
  assert.equal(describeCron('*/15 * * * *'), 'Every 15 minutes');
  assert.equal(describeCron('8,23,38,53 * * * *'), 'Every hour at :08, :23, :38, :53');
  assert.equal(describeCron('2-59/5 * * * *'), 'Every 5 minutes starting at :02');
  assert.equal(describeCron('0 7 * * *'), 'Daily at 7:00 AM');
  assert.equal(describeCron('30 18 * * *'), 'Daily at 6:30 PM');
  assert.equal(describeCron('0 7 * * 1-5'), 'Weekdays at 7:00 AM');
  assert.equal(describeCron('0 6 * * 1'), 'Every Monday at 6:00 AM');
  assert.equal(describeCron('0 6 * * 1,4'), 'Mondays and Thursdays at 6:00 AM');
  assert.equal(describeCron('15 * * * *'), 'Every hour at :15');
  assert.equal(describeCron('0 3 15 * *'), 'Custom schedule (0 3 15 * *)');
});

test('firingMinutesOverlap', () => {
  const from = new Date('2026-06-01T00:00:00Z');
  const overlap = firingMinutesOverlap('*/15 * * * *', 'UTC', '15 * * * *', 'UTC', from);
  assert.equal(overlap.length, 5);
  assert.equal(overlap[0].toISOString(), '2026-06-01T00:15:00.000Z');
  assert.equal(firingMinutesOverlap('2-59/5 * * * *', 'UTC', '*/15 * * * *', 'UTC', from).length, 0);
});

test('src and base44 copies are identical', () => {
  const a = readFileSync(new URL('../src/shared/cronSchedule.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const b = readFileSync(new URL('../base44/shared/cronSchedule.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(a, b);
});
