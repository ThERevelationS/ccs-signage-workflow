// Synthetic-only renderer checks for manager Punch Exception reporting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../src/components/timeclock/TimeClockPunchExceptionReport.jsx', import.meta.url),
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
    ['AlertTriangle', 'Clock3', 'FileWarning', 'ShieldCheck'].map((name) => [name, 'span']),
  ),
  'date-fns': { format: () => 'Sep 28, 2026 4:00 PM' },
};
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => imports[id] || require(id),
  console, Date, Map, Set,
}, { filename: 'synthetic-timeclock-punch-report.js', timeout: 4000 });
const PunchReport = module.exports.default;
assert.equal(typeof PunchReport, 'function');

const employee = 'worker@synthetic.invalid';
const entries = [
  {
    id: 'late-entry', user_email: employee, user_name: 'Synthetic Employee',
    status: 'clocked_out', approval_status: 'needs_review',
  },
  {
    id: 'missed-out-entry', user_email: employee, user_name: 'Synthetic Employee',
    status: 'needs_resolution', approval_status: 'needs_review',
  },
];
const rows = [
  {
    id: 'late-case', user_email: employee, user_name: 'Synthetic Employee',
    time_entry_id: 'late-entry', exception_type: 'late_clock_in', status: 'pending_manager_review',
    detected_at: '2026-09-28T20:00:00.000Z', submitted_at: '2026-09-28T20:00:00.000Z',
    claimed_clock_in: '2026-09-28T12:00:00.000Z',
    resolution_note: 'Employee reconstructed a missing Clock In.',
  },
  {
    id: 'out-case', user_email: employee, user_name: 'Synthetic Employee',
    time_entry_id: 'missed-out-entry', exception_type: 'missed_clock_out', status: 'pending_manager_review',
    detected_at: '2026-09-27T22:30:00.000Z', submitted_at: '2026-09-28T12:00:00.000Z',
    claimed_clock_out: '2026-09-27T22:00:00.000Z',
  },
  {
    id: 'through-case', user_email: employee, user_name: 'Synthetic Employee',
    time_entry_id: 'late-entry', exception_type: 'missed_clock_out', status: 'worked_through',
    detected_at: '2026-09-26T12:00:00.000Z', submitted_at: '2026-09-26T12:01:00.000Z',
  },
  {
    id: 'resolved-case', user_email: employee, user_name: 'Synthetic Employee',
    time_entry_id: 'late-entry', exception_type: 'late_clock_in', status: 'resolved',
    detected_at: '2026-09-25T20:00:00.000Z', submitted_at: '2026-09-25T20:00:00.000Z',
    claimed_clock_in: '2026-09-25T12:00:00.000Z',
  },
  {
    id: 'monitor-case', user_email: employee, user_name: 'Synthetic Employee',
    time_entry_id: 'late-entry', exception_type: 'missed_clock_out', status: 'open',
    detected_at: '2026-09-29T13:00:00.000Z',
    resolution_note: 'Scheduled stale-shift monitor detected an active cross-date shift past the missed-punch review threshold. No punch time was changed.',
  },
];

const markup = renderToStaticMarkup(React.createElement(PunchReport, {
  punchExceptions: rows,
  timeEntries: entries,
  onReviewEntry: () => {},
}));
assert.match(markup, /Punch Exception Reports/);
assert.match(markup, /3 need review/);
assert.match(markup, /Missed Clock In/);
assert.match(markup, /Missed Clock Out/);
assert.match(markup, /Worked Through/);
assert.match(markup, /Employee reported arrival/);
assert.match(markup, /Employee reported prior Clock Out/);
assert.match(markup, /No Clock Out was invented or changed/);
assert.match(markup, /scheduled monitor detected a long-running active shift/);
assert.match(markup, /No Clock Out was created or changed/);
assert.match(markup, /confirm with the employee before any correction/);
assert.match(markup, /Shift Needs Review/);
assert.match(markup, /View Shift/);
assert.match(markup, /audit history, not automatic payroll approval/);
console.log('PASS punch report distinguishes scheduled detection from employee-attested punch reports');

const emptyMarkup = renderToStaticMarkup(React.createElement(PunchReport, {
  punchExceptions: [],
  timeEntries: [],
}));
assert.match(emptyMarkup, /0 need review/);
assert.match(emptyMarkup, /No punch exception reports have been recorded/);
console.log('PASS empty punch report renders a clear no-record state');
console.log('PASS 2/2 Time Clock punch exception reporting scenarios');
