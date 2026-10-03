// Synthetic/source-only checks for every Time Clock datetime-local input surface.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companyDateTimeInputFromIso,
  parseCompanyDateTimeInput,
} from '../src/components/timeclock/timeClockCompanyTime.js';

const preciseIso = '2026-09-28T13:14:59.048Z';
const shown = companyDateTimeInputFromIso(preciseIso);
assert.equal(shown, '2026-09-28T09:14');
const preserved = parseCompanyDateTimeInput(shown, preciseIso);
assert.equal(preserved.ok, true, JSON.stringify(preserved));
assert.equal(preserved.preserved, true);
assert.equal(preserved.iso, preciseIso);
const changed = parseCompanyDateTimeInput('2026-09-28T09:15', preciseIso);
assert.equal(changed.ok, true, JSON.stringify(changed));
assert.equal(changed.iso, '2026-09-28T13:15:00.000Z');
assert.notEqual(changed.preserved, true);
console.log('PASS untouched minute-only controls preserve exact original seconds and milliseconds');

const files = {
  missedOut: readFileSync(new URL('../src/components/timeclock/MissedPunchResolutionDialog.jsx', import.meta.url), 'utf8'),
  missedIn: readFileSync(new URL('../src/components/timeclock/LateClockInReviewDialog.jsx', import.meta.url), 'utf8'),
  employeeCorrection: readFileSync(new URL('../src/components/timeclock/CorrectionRequestDialog.jsx', import.meta.url), 'utf8'),
  managerCorrection: readFileSync(new URL('../src/components/timeclock/CorrectionRequestAdminPanel.jsx', import.meta.url), 'utf8'),
  adminDirect: readFileSync(new URL('../src/components/timeclock/TimeClockAdmin.jsx', import.meta.url), 'utf8'),
};

for (const [name, source] of Object.entries(files)) {
  assert.match(source, /TIME_CLOCK_COMPANY_TIME_LABEL/, name + ' must label company time');
  assert.match(source, /parseCompanyDateTimeInput/, name + ' must use explicit company-time parsing');
}
assert.doesNotMatch(files.missedOut, /new Date\(claimedClockOut\)/);
assert.doesNotMatch(files.missedIn, /new Date\(claimedClockIn\)/);
assert.doesNotMatch(files.employeeCorrection, /new Date\(clockIn\)|new Date\(clockOut\)/);
assert.doesNotMatch(files.managerCorrection, /new Date\(clockIn\)|new Date\(clockOut\)/);
assert.doesNotMatch(files.adminDirect, /new Date\(e\.target\.value\)/);
console.log('PASS all editable Time Clock wall-clock fields avoid device-timezone Date parsing');

assert.match(files.employeeCorrection, /parseCompanyDateTimeInput\(clockIn, clockInSourceIso\)/);
assert.match(files.employeeCorrection, /parseCompanyDateTimeInput\(clockOut, clockOutSourceIso\)/);
assert.match(files.managerCorrection, /parseCompanyDateTimeInput\(clockIn, selected\?\.requested_changes\?\.clock_in\)/);
assert.match(files.managerCorrection, /parseCompanyDateTimeInput\(clockOut, selected\?\.requested_changes\?\.clock_out\)/);
assert.match(files.adminDirect, /parseCompanyDateTimeInput\(editingClockInInput, editingEntryBaseline\.clock_in\)/);
assert.match(files.adminDirect, /parseCompanyDateTimeInput\(editingClockOutInput, editingEntryBaseline\.clock_out\)/);
console.log('PASS prepopulated correction editors preserve exact authoritative punch instants when unchanged');

const datetimeCount = Object.values(files)
  .map((source) => (source.match(/type="datetime-local"/g) || []).length)
  .reduce((sum, count) => sum + count, 0);
assert.equal(datetimeCount, 8);
console.log('PASS all 8 current Time Clock datetime-local controls are covered by the hardened surfaces');

console.log('PASS 4/4 Time Clock company-time input hardening scenarios');
