// Synthetic-only renderer checks for archived/invalid active TimeEntry alerts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../src/components/timeclock/TimeClockExceptionCenter.jsx', import.meta.url),
  'utf8',
);
const compiled = transformSync(source, {
  loader: 'jsx', format: 'cjs', jsx: 'automatic', target: 'es2022',
}).code;

const uiStub = (tag) => ({ children, ...props }) => React.createElement(tag, {
  className: props.className,
  type: props.type,
}, children);
const imports = {
  '@/components/ui/badge': { Badge: uiStub('span') },
  '@/components/ui/button': { Button: uiStub('button') },
  'lucide-react': Object.fromEntries(
    ['AlertTriangle', 'Briefcase', 'Clock3', 'Coffee', 'FileWarning', 'Pause', 'RefreshCw', 'ShieldAlert']
      .map((name) => [name, 'span']),
  ),
  'date-fns': { parseISO: (value) => new Date(value), format: () => 'Sep 1 at 10:00 AM' },
};
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => imports[id] || require(id),
  console, Date, Map, Set,
}, { filename: 'synthetic-timeclock-exception-center.js', timeout: 4000 });
const ExceptionCenter = module.exports.default;
assert.equal(typeof ExceptionCenter, 'function');

const email = 'worker@synthetic.invalid';
const baseProps = {
  employeeStates: [], activeBreaks: [], activeWorkPauses: [],
  activeLaborSegments: [], correctionRequests: [], punchExceptions: [],
  onRefresh: () => {}, onReviewEntry: () => {}, onApproveEntry: () => {},
};
function render(timeEntries, overrides = {}) {
  return renderToStaticMarkup(React.createElement(ExceptionCenter, {
    ...baseProps, timeEntries, ...overrides,
  }));
}
const archivedOld = {
  id: 'archived-old', status: 'clocked_in', clock_in: '2026-03-06T17:10:51.905Z',
  user_email: email, archived_test_data: true,
};
const archivedAdmin = {
  id: 'archived-admin', status: 'clocked_in', clock_in: 'invalid',
  user_email: email, archived_admin: true,
};
const invalidLive = {
  id: 'invalid-live', status: 'clocked_in', clock_in: null,
  user_email: email,
};

const archivedMarkup = render([archivedOld, archivedAdmin]);
assert.match(archivedMarkup, /No Time Clock exceptions currently need manager attention/);
assert.doesNotMatch(archivedMarkup, /invalid clock-in time|Possible missed clock-out/i);
console.log('PASS archived test/admin active rows do not create phantom Needs Attention alerts');

const invalidMarkup = render([archivedOld, invalidLive]);
assert.match(invalidMarkup, /Active shift has an invalid clock-in time/);
assert.match(invalidMarkup, /unarchived TimeEntry is marked active/);
assert.match(invalidMarkup, /Review/);
assert.doesNotMatch(invalidMarkup, /Possible missed clock-out/);
console.log('PASS real invalid active shift gets actionable critical alert without invalid date formatting');

const normalMarkup = render([{
  id: 'old-live', user_email: email, status: 'clocked_in',
  clock_in: '2026-09-01T14:00:00.000Z',
}]);
assert.match(normalMarkup, /Possible missed clock-out/);
assert.match(normalMarkup, /Active shift is not linked to employee state/);
console.log('PASS existing missed-clock-out and orphaned-live-shift alerts still display');

const unresolvedMarkup = render([{
  id: 'missed-punch-review', user_email: email, user_name: 'Synthetic Employee',
  status: 'needs_resolution', clock_in: '2026-09-27T14:00:00.000Z',
  punch_resolution_pending_at: '2026-09-28T12:00:00.000Z',
}]);
assert.match(unresolvedMarkup, /Missed punch awaiting manager review/);
assert.match(unresolvedMarkup, /no fabricated Clock Out/);
assert.doesNotMatch(unresolvedMarkup, /Active shift is not linked to employee state/);
console.log('PASS unresolved missed punch is visible to management without being treated as an active shift');

const lateClockInEntry = {
  id: 'late-clock-in-entry', user_email: email, user_name: 'Synthetic Employee',
  status: 'clocked_out', clock_in: '2026-09-28T12:00:00.000Z', clock_out: '2026-09-28T20:00:00.000Z',
  approval_status: 'needs_review',
};
const lateClockInCase = {
  id: 'late-clock-in-case', user_email: email, user_name: 'Synthetic Employee',
  time_entry_id: lateClockInEntry.id, exception_type: 'late_clock_in', status: 'pending_manager_review',
  claimed_clock_in: '2026-09-28T12:00:00.000Z', detected_at: '2026-09-28T20:00:00.000Z',
};
const lateClockInMarkup = render([lateClockInEntry], { punchExceptions: [lateClockInCase] });
assert.match(lateClockInMarkup, /Missed Clock In awaiting manager review/);
assert.match(lateClockInMarkup, /reconstructed shift must remain Needs Review/);
assert.match(lateClockInMarkup, /Approve Shift/);
console.log('PASS completed employee-attested missed Clock In routes directly to final shift approval');

const activeLateClockInMarkup = render([{ ...lateClockInEntry, id: 'late-clock-in-active', status: 'clocked_in', clock_out: null }], {
  punchExceptions: [{ ...lateClockInCase, id: 'late-clock-in-active-case', time_entry_id: 'late-clock-in-active' }],
});
assert.doesNotMatch(activeLateClockInMarkup, /Approve Shift/);
assert.match(activeLateClockInMarkup, /Review Shift/);
console.log('PASS active reconstructed missed Clock In cannot be offered final shift approval before Clock Out');

const resolvedLateClockInMarkup = render([lateClockInEntry], {
  punchExceptions: [{ ...lateClockInCase, status: 'resolved' }],
});
assert.match(resolvedLateClockInMarkup, /No Time Clock exceptions currently need manager attention/);
assert.doesNotMatch(resolvedLateClockInMarkup, /Missed Clock In awaiting manager review/);
console.log('PASS resolved punch exception does not remain in Needs Attention');

const dedupedMissedClockOutMarkup = render([{
  id: 'missed-out-entry', user_email: email, user_name: 'Synthetic Employee',
  status: 'needs_resolution', clock_in: '2026-09-27T14:00:00.000Z',
}], {
  punchExceptions: [{
    id: 'missed-out-case', user_email: email, user_name: 'Synthetic Employee',
    time_entry_id: 'missed-out-entry', exception_type: 'missed_clock_out', status: 'pending_manager_review',
    claimed_clock_out: '2026-09-27T22:00:00.000Z',
  }],
});
assert.equal((dedupedMissedClockOutMarkup.match(/Missed punch awaiting manager review/g) || []).length, 1);
assert.doesNotMatch(dedupedMissedClockOutMarkup, /Missed Clock Out report needs manager follow-up/);
console.log('PASS missed Clock Out report is deduplicated against its needs_resolution shift alert');

const orphanPunchCaseMarkup = render([], {
  punchExceptions: [{
    id: 'orphan-case', user_email: email, exception_type: 'late_clock_in',
    status: 'pending_manager_review', time_entry_id: 'missing-entry',
  }],
});
assert.match(orphanPunchCaseMarkup, /Punch exception is missing its linked shift/);
assert.match(orphanPunchCaseMarkup, /Investigate before approving or finalizing/);
console.log('PASS orphaned punch exception becomes a critical management integrity alert');

const correctedNeedsApprovalEntry = {
  id: 'corrected-needs-approval', user_email: email, user_name: 'Synthetic Employee',
  status: 'clocked_out', clock_in: '2026-09-27T14:00:00.000Z', clock_out: '2026-09-27T22:00:00.000Z',
  approval_status: 'needs_review', last_correction_request_id: 'terminal-correction-001',
};
const correctedNeedsApprovalMarkup = render([correctedNeedsApprovalEntry]);
assert.match(correctedNeedsApprovalMarkup, /Corrected shift awaits final approval/);
assert.match(correctedNeedsApprovalMarkup, /separate manager shift approval is required/);
assert.match(correctedNeedsApprovalMarkup, /Approve Shift/);
const fullyApprovedMarkup = render([{ ...correctedNeedsApprovalEntry, approval_status: 'approved' }]);
assert.doesNotMatch(fullyApprovedMarkup, /Corrected shift awaits final approval/);
console.log('PASS corrected completed shift stays in Needs Attention until separate shift approval');

const monitoredOldEntry = {
  id: 'monitored-old-entry', user_email: email, user_name: 'Synthetic Employee',
  status: 'clocked_in', clock_in: '2026-09-01T14:00:00.000Z',
};
const monitoredOldMarkup = render([monitoredOldEntry], {
  employeeStates: [{
    id: 'monitored-state', user_email: email, user_name: 'Synthetic Employee',
    status: 'clocked_in', active_entry_id: monitoredOldEntry.id,
    break_status: 'working', work_pause_status: 'working', labor_status: 'idle',
  }],
  punchExceptions: [{
    id: 'monitor-open-case', user_email: email, user_name: 'Synthetic Employee',
    time_entry_id: monitoredOldEntry.id, exception_type: 'missed_clock_out', status: 'open',
    detected_at: '2026-09-02T14:00:00.000Z',
  }],
});
assert.match(monitoredOldMarkup, /Long-running shift detected/);
assert.match(monitoredOldMarkup, /scheduled monitor detected a long-running active shift/);
assert.match(monitoredOldMarkup, /No Clock Out was created or changed/);
assert.doesNotMatch(monitoredOldMarkup, /Employee reported a Clock Out/);
assert.doesNotMatch(monitoredOldMarkup, /Possible missed clock-out/);
console.log('PASS scheduled open punch case replaces the duplicate generic old-shift warning');

const acknowledgedOldEntry = {
  id: 'acknowledged-old-entry', user_email: email, user_name: 'Synthetic Employee',
  status: 'clocked_in', clock_in: '2026-09-01T14:00:00.000Z',
};
const acknowledgedMarkup = render([acknowledgedOldEntry], {
  employeeStates: [{
    id: 'acknowledged-state', user_email: email, user_name: 'Synthetic Employee',
    status: 'clocked_in', active_entry_id: acknowledgedOldEntry.id,
    break_status: 'working', work_pause_status: 'working', labor_status: 'idle',
  }],
  punchExceptions: [{
    id: 'worked-through-case', user_email: email, user_name: 'Synthetic Employee',
    time_entry_id: acknowledgedOldEntry.id, exception_type: 'missed_clock_out', status: 'worked_through',
    acknowledged_until: '2999-01-01T00:00:00.000Z',
  }],
});
assert.doesNotMatch(acknowledgedMarkup, /Possible missed clock-out/);
assert.match(acknowledgedMarkup, /No Time Clock exceptions currently need manager attention/);
console.log('PASS fresh Worked Through acknowledgement suppresses stale-shift manager warning');

const expiredAcknowledgementMarkup = render([acknowledgedOldEntry], {
  employeeStates: [{
    id: 'expired-state', user_email: email, user_name: 'Synthetic Employee',
    status: 'clocked_in', active_entry_id: acknowledgedOldEntry.id,
    break_status: 'working', work_pause_status: 'working', labor_status: 'idle',
  }],
  punchExceptions: [{
    id: 'expired-worked-through-case', user_email: email, user_name: 'Synthetic Employee',
    time_entry_id: acknowledgedOldEntry.id, exception_type: 'missed_clock_out', status: 'worked_through',
    acknowledged_until: '2020-01-01T00:00:00.000Z',
  }],
});
assert.match(expiredAcknowledgementMarkup, /Possible missed clock-out/);
console.log('PASS expired Worked Through acknowledgement allows stale-shift warning to return');

console.log('PASS 13/13 Time Clock management exception renderer scenarios');
