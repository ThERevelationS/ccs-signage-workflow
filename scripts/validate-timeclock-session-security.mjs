// Synthetic/source-only checks for Time Clock personal-session inactivity locking and return status.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIME_CLOCK_IDLE_LOGOUT_MS,
  remainingTimeClockSessionMs,
  classifyTimeClockLoginStatus,
} from '../src/components/timeclock/timeClockSessionSecurity.js';

assert.equal(TIME_CLOCK_IDLE_LOGOUT_MS, 15 * 60 * 1000);
assert.equal(remainingTimeClockSessionMs(1_000, 1_000), TIME_CLOCK_IDLE_LOGOUT_MS);
assert.equal(remainingTimeClockSessionMs(1_000, 1_000 + TIME_CLOCK_IDLE_LOGOUT_MS - 1), 1);
assert.equal(remainingTimeClockSessionMs(1_000, 1_000 + TIME_CLOCK_IDLE_LOGOUT_MS), 0);
assert.equal(remainingTimeClockSessionMs(0, 5_000), 0);
console.log('PASS idle-session deadline is deterministic at 15 minutes');

const stale = classifyTimeClockLoginStatus({
  success: true,
  status: 'clocked_in',
  requires_punch_resolution: true,
  entry: { id: 'entry-stale', clock_in: '2026-10-01T12:00:00.000Z' },
  punch_resolution: { type: 'missed_clock_out' },
});
assert.equal(stale.kind, 'punch_resolution');
assert.equal(stale.entryId, 'entry-stale');

const active = classifyTimeClockLoginStatus({
  success: true,
  status: 'clocked_in',
  entry: { id: 'entry-active', clock_in: '2026-10-03T12:00:00.000Z' },
});
assert.equal(active.kind, 'clocked_in');

const pendingReview = classifyTimeClockLoginStatus({
  success: true,
  status: 'clocked_out',
  unresolved_punch_review: {
    count: 1,
    has_integrity_issue: false,
    has_rejected_item: false,
    items: [{ time_entry_id: 'old-entry', review_state: 'awaiting_manager_review' }],
  },
});
assert.equal(pendingReview.kind, 'pending_punch_review');
assert.equal(pendingReview.count, 1);
assert.equal(pendingReview.item.time_entry_id, 'old-entry');

const pendingShiftReview = classifyTimeClockLoginStatus({
  success: true,
  status: 'clocked_out',
  pending_shift_review: {
    count: 1,
    missed_clock_in_count: 1,
    corrected_shift_count: 0,
    has_integrity_issue: false,
    items: [{ time_entry_id: 'corrected-entry', review_kind: 'missed_clock_in', review_state: 'awaiting_shift_approval' }],
  },
});
assert.equal(pendingShiftReview.kind, 'pending_shift_review');
assert.equal(pendingShiftReview.count, 1);
assert.equal(pendingShiftReview.missedClockInCount, 1);
assert.equal(pendingShiftReview.correctedShiftCount, 0);
assert.equal(pendingShiftReview.item.review_kind, 'missed_clock_in');
assert.equal(pendingShiftReview.item.time_entry_id, 'corrected-entry');

const transition = classifyTimeClockLoginStatus({
  success: true,
  status: 'clocked_in',
  transition: 'break_end',
  entry: { id: 'entry-transition', clock_in: '2026-10-03T12:00:00.000Z' },
});
assert.equal(transition.kind, 'transition');

assert.equal(classifyTimeClockLoginStatus({ success: true, status: 'clocked_out' }).kind, 'clocked_out');
assert.equal(classifyTimeClockLoginStatus({ success: false, status: 'clocked_in' }).kind, 'unverified');
console.log('PASS return-login reporting preserves authoritative state categories including unresolved prior punch review');

const source = readFileSync(new URL('../src/pages/TimeClock.jsx', import.meta.url), 'utf8');
const clearStart = source.indexOf('const clearEmployeeSession');
const loginStart = source.indexOf('const handleLogin', clearStart);
const idleEffectStart = source.indexOf('useEffect(() => {\n    if (!loggedInUser?.email || !timeClockSessionToken)', loginStart);
assert.ok(clearStart >= 0 && loginStart > clearStart && idleEffectStart > loginStart);
const clearBlock = source.slice(clearStart, loginStart);
const loginBlock = source.slice(loginStart, idleEffectStart);

assert.match(clearBlock, /setLoggedInUser\(null\)/);
assert.match(clearBlock, /setTimeClockSessionToken\(""\)/);
assert.match(clearBlock, /setShowTimeOffRequest\(false\)/);
assert.match(clearBlock, /setEditingTimeOff\(null\)/);
assert.match(clearBlock, /setCorrectionEntry\(null\)/);
assert.match(clearBlock, /This did not Clock Out/);
assert.doesNotMatch(clearBlock, /action:\s*"clock_out"/i);
assert.doesNotMatch(clearBlock, /timeClockAction/);
console.log('PASS inactivity lock clears sensitive UI only and contains no backend punch mutation');

assert.match(loginBlock, /action:\s*"status"/);
assert.match(loginBlock, /session_token:\s*token/);
assert.match(loginBlock, /target_email:\s*email/);
assert.doesNotMatch(loginBlock, /clock_action_intent/);
assert.doesNotMatch(loginBlock, /action:\s*"clock_in"/i);
assert.doesNotMatch(loginBlock, /action:\s*"clock_out"/i);
console.log('PASS return login performs a passive authoritative status report only');

assert.match(source, /\["pointerdown", "keydown", "touchstart", "scroll"\]/);
assert.match(source, /window\.addEventListener\("focus", checkIdle\)/);
assert.match(source, /document\.addEventListener\("visibilitychange", checkOnReturn\)/);
assert.match(source, /clearEmployeeSession\(\{ reason: "idle" \}\)/);
assert.match(source, /employee-session/);
assert.match(source, /shared-session/);
assert.match(source, /Previous punch report is awaiting manager review/);
assert.match(source, /can still start a new shift normally/);
assert.match(source, /Punch correction applied — shift still needs approval/);
assert.match(source, /Missed Clock In recorded — shift still needs approval/);
assert.match(source, /employee-reported Clock In is recorded/);
assert.match(source, /separate manager shift-approval step/);
const quickClockSource = readFileSync(new URL('../src/components/timeclock/QuickClockSection.jsx', import.meta.url), 'utf8');
assert.match(quickClockSource, /unresolved_punch_review/);
assert.match(quickClockSource, /still awaiting manager follow-up/);
assert.match(quickClockSource, /pending_shift_review/);
assert.match(quickClockSource, /missed_clock_in_count/);
assert.match(quickClockSource, /reconstructed missed-Clock-In shift still needs/);
assert.match(quickClockSource, /final manager shift approval/);
console.log('PASS activity, background-return, credential-reset, unresolved-punch, and corrected-shift approval warnings are present');

console.log('PASS 6/6 Time Clock personal-session security scenarios');
