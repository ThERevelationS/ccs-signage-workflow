import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const exceptionSource = readFileSync(new URL('../src/components/timeclock/TimeClockExceptionCenter.jsx', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../src/components/timeclock/TimeClockAdmin.jsx', import.meta.url), 'utf8');
const correctionSource = readFileSync(new URL('../src/components/timeclock/CorrectionRequestAdminPanel.jsx', import.meta.url), 'utf8');
const quickClockSource = readFileSync(new URL('../src/components/timeclock/QuickClockSection.jsx', import.meta.url), 'utf8');

assert.match(quickClockSource, /refreshAuthoritativeSessionState\(\{ quiet: true \}\)/);
assert.match(quickClockSource, /restored === "punch_resolution"/);
assert.match(quickClockSource, /Previous shift needs punch confirmation before a new Clock In/);
assert.match(quickClockSource, /open=\{Boolean\(punchResolution && activeEntry && selectedUser\)\}/);
console.log('PASS authoritative session restore re-opens unresolved punch confirmation after login/focus');

assert.match(exceptionSource, /pendingCorrectionByEntryId\.set\(request\.time_entry_id, request\)/);
assert.match(exceptionSource, /if \(request\?\.time_entry_id && unresolvedPunchEntries\.some\(entry => entry\.id === request\.time_entry_id\)\) continue/);
assert.match(exceptionSource, /Review Correction/);
assert.match(exceptionSource, /onReviewCorrection\(item\.correctionRequest\)/);
console.log('PASS Needs Attention collapses unresolved shift + pending correction into one actionable manager item');

assert.match(adminSource, /onReviewCorrection=\{\(request\) => setCorrectionReviewRequestId\(request\?\.id \|\| ""\)\}/);
assert.match(adminSource, /reviewRequestId=\{correctionReviewRequestId\}/);
assert.match(correctionSource, /requests\.find\(\(request\) => request\.id === reviewRequestId\)/);
assert.match(correctionSource, /openReview\(requestedReview\)/);
console.log('PASS manager attention action routes to the exact authoritative correction-review dialog');

assert.match(exceptionSource, /Review Shift/);
assert.match(exceptionSource, /onReviewEntry\(item\.entry\)/);
console.log('PASS unrelated integrity exceptions retain direct shift-review routing');

console.log('PASS 4/4 Time Clock unresolved-punch return/routing scenarios');
