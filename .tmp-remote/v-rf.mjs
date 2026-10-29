// Static acceptance for the exact-request-ID fencing contract shared by every
// Time Clock mutation path. Behavioural coverage lives in the component
// validators; this file pins the fencing contract so a future refactor cannot
// silently drop it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync('src/components/timeclock/TimeClockAdmin.jsx', 'utf8');
const payPeriod = readFileSync('src/components/timeclock/PayPeriodManager.jsx', 'utf8');
const correctionDialog = readFileSync('src/components/timeclock/CorrectionRequestDialog.jsx', 'utf8');
const timeOff = readFileSync('src/components/timeclock/TimeOffRequestDialog.jsx', 'utf8');
const adminPanel = readFileSync('src/components/timeclock/CorrectionRequestAdminPanel.jsx', 'utf8');
const timeClockPage = readFileSync('src/pages/TimeClock.jsx', 'utf8');
const quickClock = readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');

// Every storage-backed clear must accept an expected request ID and refuse to
// delete an ID it did not settle.
assert.match(admin, /function clearAdminRequestId\(action, entryId, expectedRequestId = ""\)/);
assert.match(admin, /sessionStorage\.getItem\(adminRequestStorageKey\(action, entryId\)\) !== expectedRequestId/);
assert.match(admin, /function clearApprovalRetry\(decision, entryId, expectedRequestId = ""\)/);
assert.match(admin, /storedApprovalRetry\(decision, entryId\)\?\.request_id !== expectedRequestId/);
assert.match(payPeriod, /function clearStoredPeriodRequestId\(key, expectedRequestId = ""\)/);
assert.match(payPeriod, /stored\.request_id !== expectedRequestId/);
assert.match(correctionDialog, /function clearCorrectionSubmission\(entryId, expectedRequestId = ""\)/);
assert.match(timeOff, /function clearOperation\(key, expectedRequestId = ""\)/);
assert.match(timeClockPage, /function clearNotesRequest\(entryId, expectedRequestId = ""\)/);
assert.match(adminPanel, /function clearReviewRetry\(correctionRequestId, expectedRequestId = ""\)/);
assert.match(quickClock, /const clearRequest = \(action, email, expectedRequestId = ""\)/);
console.log('PASS storage-backed request clears are fenced by the expected request ID');

// Acknowledgement paths must pass the request ID they are settling.
assert.match(admin, /clearAdminRequestId\("admin_correct_entry", editingEntryBaseline\.id, requestId\)/);
assert.match(admin, /clearAdminRequestId\(requestAction, approvalEntry\.id, frozenPayload\.request_id\)/);
assert.match(admin, /clearAdminRequestId\(requestAction, entry\?\.id, recoveredRequestId\)/);
assert.match(admin, /clearAdminRequestId\("admin_archive_entry", entry\.id, requestId\)/);
assert.match(admin, /clearApprovalRetry\(approvalDecision, approvalEntry\.id, frozenPayload\.request_id\)/);
assert.match(admin, /clearAdminRequestId\(requestAction, entry\?\.id, recoveredRequestId\)/);
assert.match(payPeriod, /clearRequestId\(stored\.key, stored\.request_id\)/);
assert.match(payPeriod, /clearRequestId\(key, requestId\)/);
assert.match(correctionDialog, /clearCorrectionSubmission\(entry\.id, activeRequestId\)/);
assert.match(timeOff, /clearOperation\(storageKey, requestId\)/);
assert.match(timeClockPage, /clearNotesRequest\(entryId, requestId\)/);
assert.match(adminPanel, /clearReviewRetry\(selected\.id, payload\.request_id\)/);
assert.match(quickClock, /clearRequest\("clock_in", email, requestId\)/);
assert.match(quickClock, /clearRequest\("work_pause_start", email, requestId\)/);
assert.match(quickClock, /clearRequest\("resolve_punch_exception", email, requestId\)/);
assert.match(quickClock, /clearRequest\("recover_missed_clock_in", email, requestId\)/);
console.log('PASS acknowledgement paths clear only the request ID they settled');

// A submitted pay-period request with an uncertain outcome must not be
// discarded by a divergent payload; the caller must surface the preserved
// request instead (same contract as the correction/time-off/notes dialogs).
assert.match(payPeriod, /if \(stored\?\.submitted\) return null;/);
assert.match(payPeriod, /if \(!requestId\) \{\s*setError\("A previously submitted pay-period action still needs server confirmation\./);
assert.match(correctionDialog, /JSON\.stringify\(stored\.payload\) !== JSON\.stringify\(payload\)/);
assert.match(timeOff, /JSON\.stringify\(stored\.payload\) !== JSON\.stringify\(payload\)/);
console.log('PASS uncertain submitted requests cannot be silently replaced by a divergent payload');

// Manager correction review retries are durable across reloads and recovered
// with frozen fields when the request is reopened.
assert.match(adminPanel, /reviewRetryStorageKey\(correctionRequestId\)/);
assert.match(adminPanel, /payload\.correction_request_id !== correctionRequestId/);
assert.match(adminPanel, /const storedRetry = storedReviewRetry\(request\.id\)/);
assert.match(adminPanel, /persistReviewRetry\(selected\.id, payload\.request_id, decision, frozenPayload\)/);
assert.match(adminPanel, /requestId: storedRetry\.request_id/);
assert.match(adminPanel, /payload: storedRetry\.payload/);
console.log('PASS manager correction review retries persist and recover the exact frozen request');

console.log('PASS 4/4 Time Clock request-ID fencing contract groups');
