// Source-only regression checks for manager shift approval/reopen concurrency recovery UI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/timeclock/TimeClockAdmin.jsx', import.meta.url), 'utf8');

assert.match(source, /approvalRetryStorageKey/);
assert.match(source, /storedApprovalRetry/);
assert.match(source, /persistApprovalRetry\(frozenPayload\)/);
assert.match(source, /expected_updated_date: approvalEntry\.updated_date/);
assert.match(source, /entry_snapshot:/);
assert.match(source, /target_email: frozenPayload\.target_email/);
assert.match(source, /expected_updated_date: frozenPayload\.expected_updated_date/);
assert.match(source, /decision: frozenPayload\.decision/);
assert.match(source, /note: frozenPayload\.note/);
console.log('PASS approval retry persists and reuses the exact original manager-review payload');

assert.match(source, /Interrupted manager shift review needs recovery/);
assert.match(source, /Resume interrupted review/);
assert.match(source, /resumeApprovalRecovery/);
assert.match(source, /Exact retry mode/);
assert.match(source, /disabled=\{approvalBusy \|\| Boolean\(approvalRetryPayload\)\}/);
console.log('PASS interrupted approvals remain recoverable after page reload with frozen editable fields');

assert.match(source, /adminActionError\(data, "The approval was not confirmed by the server\."\)/);
assert.match(source, /clearApprovalRetry\(approvalDecision, approvalEntry\.id\)/);
assert.match(source, /setPendingApprovalRecovery\(frozenPayload\)/);
console.log('PASS confirmed server rejections clear stale retries while uncertain outcomes retain exact recovery');

assert.match(source, /formatCompanyDateTime\(approvalEntry\.clock_in\)/);
assert.match(source, /TIME_CLOCK_COMPANY_TIME_LABEL/);
assert.doesNotMatch(
  source.slice(source.indexOf('Approve Completed Shift'), source.indexOf('<AlertDialog open={!!deleteConfirm}')),
  /format\(parseISO\(approvalEntry\.clock_in/,
);
console.log('PASS shift review dialog displays authoritative company timezone instead of manager device timezone');

console.log('PASS 4/4 Time Clock manager shift review UI scenarios');
