// Synthetic/source-only checks for manager correction review time handling and safety copy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIME_CLOCK_COMPANY_TIME_ZONE,
  companyDateTimeInputFromIso,
  formatCompanyDateTime,
  parseCompanyDateTimeInput,
  shiftDurationSummary,
} from '../src/components/timeclock/timeClockCompanyTime.js';

assert.equal(TIME_CLOCK_COMPANY_TIME_ZONE, 'America/New_York');
assert.equal(companyDateTimeInputFromIso('2026-09-29T01:24:00.000Z'), '2026-09-28T21:24');
assert.match(formatCompanyDateTime('2026-09-29T01:24:00.000Z'), /Sep 28, 2026/);
console.log('PASS company display/input formatting is pinned to America/New_York');

const summer = parseCompanyDateTimeInput('2026-09-28T21:24');
assert.equal(summer.ok, true, JSON.stringify(summer));
assert.equal(summer.iso, '2026-09-29T01:24:00.000Z');
const winter = parseCompanyDateTimeInput('2026-01-15T08:00');
assert.equal(winter.ok, true, JSON.stringify(winter));
assert.equal(winter.iso, '2026-01-15T13:00:00.000Z');
console.log('PASS company-local edited punches convert to the correct EDT/EST UTC instants');

const springGap = parseCompanyDateTimeInput('2026-03-08T02:30');
assert.equal(springGap.ok, false);
assert.match(springGap.error, /does not exist|daylight/i);
const fallRepeat = parseCompanyDateTimeInput('2026-11-01T01:30');
assert.equal(fallRepeat.ok, false);
assert.equal(fallRepeat.ambiguous, true);
assert.equal(fallRepeat.candidates.length, 2);
assert.match(fallRepeat.error, /occurs twice|daylight/i);
console.log('PASS DST gap and repeated-hour inputs fail closed instead of guessing');

const duration = shiftDurationSummary(
  '2026-09-28T13:14:59.048Z',
  '2026-09-29T01:24:00.000Z',
  30,
);
assert.equal(duration.valid, true);
assert.equal(duration.grossMinutes, 729);
assert.equal(duration.netMinutesBeforeWorkPause, 699);
assert.equal(shiftDurationSummary('2026-09-29T02:00:00.000Z', '2026-09-29T01:00:00.000Z', 0).valid, false);
assert.equal(shiftDurationSummary('2026-09-28T13:00:00.000Z', '2026-09-28T14:00:00.000Z', 90).valid, false);
console.log('PASS duration preview matches backend minute-floor/lunch safety semantics');

const source = readFileSync(new URL('../src/components/timeclock/CorrectionRequestAdminPanel.jsx', import.meta.url), 'utf8');
assert.match(source, /Employee-reported Clock Out/);
assert.match(source, /Approve Reported Time/);
assert.match(source, /Apply Edited Time/);
assert.match(source, /Reject & Keep Unresolved/);
assert.match(source, /Correction approval is not shift approval/);
assert.match(source, /leaves the completed shift at <strong>Needs Review<\/strong>/);
assert.match(source, /Tracked Work Pause time, if any, remains preserved/);
assert.match(source, /parseCompanyDateTimeInput\(clockIn, selected\?\.requested_changes\?\.clock_in\)/);
assert.match(source, /parseCompanyDateTimeInput\(clockOut, selected\?\.requested_changes\?\.clock_out\)/);
assert.doesNotMatch(source, /new Date\(clockIn\)/);
assert.doesNotMatch(source, /new Date\(clockOut\)/);
console.log('PASS review UI distinguishes reported vs edited actions and avoids device-timezone parsing');

console.log('PASS 5/5 Time Clock correction review UI scenarios');
