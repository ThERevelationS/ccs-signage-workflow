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
  activeLaborSegments: [], correctionRequests: [],
  onRefresh: () => {}, onReviewEntry: () => {},
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
console.log('PASS 3/3 Time Clock management exception renderer scenarios');
