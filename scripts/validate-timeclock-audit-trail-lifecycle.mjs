// Source-level regression coverage for Time Clock Audit Trail async lifecycle guarantees.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, classifyAuthoritativePayrollAuditIntegrity, payrollMembershipCompanyDate, payrollMembershipFromAudit } from '../base44/shared/timeClockPayrollMembershipEvidence.mjs';

const source = readFileSync(new URL('../src/components/timeclock/TimeClockAuditTrail.jsx', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');
const payPeriodManagerSource = readFileSync(new URL('../src/components/timeclock/PayPeriodManager.jsx', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../src/components/timeclock/TimeClockAdmin.jsx', import.meta.url), 'utf8');

assert.equal(PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, 1, 'shared payroll-membership evidence contract version must remain explicit');
assert.match(backendSource, /from '\.\.\/\.\.\/shared\/timeClockPayrollMembershipEvidence\.mjs'/);
assert.match(source, /from "@\/shared\/timeClockPayrollMembershipEvidence\.mjs"/);
assert.match(backendSource, /contract_version: PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION/);
assert.match(backendSource, /validatePayrollMembershipConflictEvidence/);
assert.match(backendSource, /payrollMembershipConflictEvidenceIsMalformed/);
assert.match(backendSource, /conflict_evidence_invalid: true/);
assert.match(backendSource, /conflict_evidence: \[\]/);
assert.match(source, /Number\(expected\?\.contract_version \|\| 0\) === PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION/);
console.log('PASS payroll membership evidence producer and verifier import one shared versioned contract');
console.log('PASS backend conflict-evidence producer validates the complete shared contract and fails closed before emitting malformed evidence');
assert.match(backendSource, /type: 'payroll_membership_evidence_invalid'/);
assert.match(backendSource, /Invalid payroll membership provenance was detected/);
assert.match(payPeriodManagerSource, /historyResult\?\.conflict\?\.type === "payroll_membership_evidence_invalid"/);
assert.match(payPeriodManagerSource, /Payroll evidence integrity failure/);
assert.match(payPeriodManagerSource, /No malformed evidence was returned/);
console.log('PASS invalid backend payroll-membership provenance is distinguished from valid evidence conflicts through Payroll History');
assert.match(payPeriodManagerSource, /mode: "integrity"/);
assert.match(payPeriodManagerSource, /evidence: \[\]/);
assert.match(payPeriodManagerSource, /Inspect authoritative Audit Trail/);
assert.match(adminSource, /mode = "conflict"/);
assert.match(adminSource, /mode: mode === "integrity" \? "integrity" : "conflict"/);
assert.match(source, /const integrityInvestigation = investigationActive && investigation\?\.mode === "integrity"/);
assert.match(source, /The invalid provenance was not passed into this view or treated as trusted evidence/);
assert.match(source, /onClick=\{\(\) => loadRows\(investigation\?\.time_entry_id, investigationEvidence, integrityInvestigation\)\}/);
console.log('PASS invalid-provenance investigation scopes authoritative Audit Trail without forwarding malformed expected evidence and preserves integrity validation on refresh');

const COMPANY_TIME_ZONE = 'America/New_York';
const canonicalPayrollMembership = payrollMembershipFromAudit;

const membershipFixtures = [
  {
    name: 'verified normalized clock-out envelope',
    row: { action: 'clock_out', server_timestamp: '2026-10-05T20:00:00.000Z', details: { result_clock_in: '2026-10-05T12:30:00.000Z', payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T12:30:00.000Z' } } },
    expected: { company_date: '2026-10-05', clock_in: '2026-10-05T12:30:00.000Z', source: 'verified_normalized_audit_envelope' },
  },
  {
    name: 'Eastern company date crosses UTC midnight',
    row: { action: 'clock_in', server_timestamp: '2026-10-06T02:15:00.000Z', details: { employee_attested_clock_in: '2026-10-06T02:15:00.000Z', payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-06T02:15:00.000Z' } } },
    expected: { company_date: '2026-10-05', clock_in: '2026-10-06T02:15:00.000Z', source: 'verified_normalized_audit_envelope' },
  },
  {
    name: 'malformed normalized envelope rejects rather than falling back',
    row: { action: 'admin_correction', details: { corrected: { clock_in: '2026-10-05T13:00:00.000Z' }, original: { clock_in: '2026-10-05T12:00:00.000Z' }, payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-04', clock_in: '2026-10-05T13:00:00.000Z' } } },
    expected: null,
  },
  {
    name: 'verified normalized admin correction envelope',
    row: { action: 'admin_correction', details: { corrected: { clock_in: '2026-10-05T13:15:00.000Z' }, payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T13:15:00.000Z' } } },
    expected: { company_date: '2026-10-05', clock_in: '2026-10-05T13:15:00.000Z', source: 'verified_normalized_audit_envelope' },
  },
  {
    name: 'verified normalized admin archive envelope prefers archived entry',
    row: { action: 'admin_archive', details: { archived_entry: { clock_in: '2026-10-05T14:00:00.000Z' }, original: { clock_in: '2026-10-05T13:00:00.000Z' }, payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T14:00:00.000Z' } } },
    expected: { company_date: '2026-10-05', clock_in: '2026-10-05T14:00:00.000Z', source: 'verified_normalized_audit_envelope' },
  },
  {
    name: 'normalized clock-in semantic mismatch rejects',
    row: { action: 'clock_in', server_timestamp: '2026-10-05T15:00:00.000Z', details: { employee_attested_clock_in: '2026-10-05T14:59:00.000Z', payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T15:00:00.000Z' } } },
    expected: null,
  },
  {
    name: 'normalized clock-out semantic mismatch rejects',
    row: { action: 'clock_out', details: { result_clock_in: '2026-10-05T12:29:00.000Z', payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T12:30:00.000Z' } } },
    expected: null,
  },
  {
    name: 'normalized admin correction semantic mismatch rejects',
    row: { action: 'admin_correction', details: { corrected: { clock_in: '2026-10-05T13:14:00.000Z' }, payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T13:15:00.000Z' } } },
    expected: null,
  },
  {
    name: 'normalized admin archive semantic mismatch rejects',
    row: { action: 'admin_archive', details: { archived_entry: { clock_in: '2026-10-05T13:59:00.000Z' }, payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T14:00:00.000Z' } } },
    expected: null,
  },
  {
    name: 'unsupported normalized envelope version rejects',
    row: { action: 'clock_out', details: { result_clock_in: '2026-10-05T12:30:00.000Z', payroll_membership: { version: 2, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T12:30:00.000Z' } } },
    expected: null,
  },
  {
    name: 'wrong normalized envelope time zone rejects',
    row: { action: 'clock_out', details: { result_clock_in: '2026-10-05T12:30:00.000Z', payroll_membership: { version: 1, time_zone: 'UTC', company_date: '2026-10-05', clock_in: '2026-10-05T12:30:00.000Z' } } },
    expected: null,
  },
  {
    name: 'normalized envelope on unsupported action rejects',
    row: { action: 'notes_update', details: { payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: '2026-10-05', clock_in: '2026-10-05T12:30:00.000Z' } } },
    expected: null,
  },
  {
    name: 'legacy immutable audit uses stable candidate precedence',
    row: { action: 'admin_correction', details: { payroll_clock_in: '2026-10-05T11:00:00.000Z', original: { clock_in: '2026-10-05T12:00:00.000Z' }, corrected: { clock_in: '2026-10-05T13:00:00.000Z' } } },
    expected: { company_date: '2026-10-05', clock_in: '2026-10-05T11:00:00.000Z', source: 'immutable_audit' },
  },
  {
    name: 'legacy clock-in falls back to immutable server timestamp',
    row: { action: 'clock_in', server_timestamp: '2026-10-05T14:45:00.000Z', details: {} },
    expected: { company_date: '2026-10-05', clock_in: '2026-10-05T14:45:00.000Z', source: 'immutable_audit' },
  },
  { name: 'unusable legacy evidence rejects', row: { action: 'clock_out', details: { detected_clock_in: 'not-a-date' } }, expected: null },
];
for (const fixture of membershipFixtures) assert.deepEqual(canonicalPayrollMembership(fixture.row), fixture.expected, fixture.name);
assert.doesNotMatch(backendSource, /const payrollMembershipFromAudit =/);
assert.doesNotMatch(source, /function payrollMembershipFromAudit\(/);
assert.doesNotMatch(backendSource, /const normalizedPayrollMembershipFromAudit =/);
assert.doesNotMatch(source, /function normalizedPayrollMembershipFromAudit\(/);
assert.doesNotMatch(backendSource, /function payrollMembershipCompanyDate\(/);
assert.doesNotMatch(source, /function payrollMembershipCompanyDate\(/);
console.log(`PASS ${membershipFixtures.length}/${membershipFixtures.length} canonical payroll-membership fixtures execute the shared backend/frontend implementation`);

const companyDateFixtures = [
  ['spring DST before jump', '2026-03-08T06:59:59.999Z', '2026-03-08'],
  ['spring DST after jump', '2026-03-08T07:00:00.000Z', '2026-03-08'],
  ['fall DST first 1:30', '2026-11-01T05:30:00.000Z', '2026-11-01'],
  ['fall DST repeated 1:30', '2026-11-01T06:30:00.000Z', '2026-11-01'],
  ['Eastern previous date before spring transition', '2026-03-08T04:59:59.999Z', '2026-03-07'],
];
for (const [name, instant, expected] of companyDateFixtures) assert.equal(payrollMembershipCompanyDate(instant), expected, name);
console.log(`PASS ${companyDateFixtures.length}/${companyDateFixtures.length} payroll-membership company-date DST boundary fixtures`);

const malformedInputs = [null, undefined, '', 0, false, {}, [], { details: null }, { action: 17, details: { payroll_membership: 'bad' } }, { action: 'clock_in', details: { payroll_membership: { version: 1, time_zone: COMPANY_TIME_ZONE, company_date: {}, clock_in: {} } } }];
for (const value of malformedInputs) assert.equal(payrollMembershipFromAudit(value), null, `malformed evidence must reject: ${JSON.stringify(value)}`);
console.log(`PASS ${malformedInputs.length}/${malformedInputs.length} malformed/non-string payroll-membership inputs fail closed`);

assert.match(source, /const requestSequenceRef = useRef\(0\)/);
assert.match(source, /const mountedRef = useRef\(true\)/);
assert.match(source, /const requestSequence = \+\+requestSequenceRef\.current/);
assert.match(source, /!mountedRef\.current \|\| requestSequence !== requestSequenceRef\.current/);
assert.match(source, /mountedRef\.current && requestSequence === requestSequenceRef\.current/);
console.log('PASS stale audit responses cannot replace a newer requested scope');

const mountEffectStart = source.indexOf('useEffect(() => {\n    mountedRef.current = true;');
const previousRefStart = source.indexOf('const previousInvestigationRef', mountEffectStart);
assert.ok(mountEffectStart >= 0 && previousRefStart > mountEffectStart);
const mountBlock = source.slice(mountEffectStart, previousRefStart);
assert.match(mountBlock, /const initialTimeEntryId = String\(investigation\?\.time_entry_id \|\| ""\)\.trim\(\)/);
assert.match(mountBlock, /const initialExpectedEvidence = Array\.isArray\(investigation\?\.evidence\) \? investigation\.evidence : \[\]/);
assert.match(mountBlock, /const initialIntegrityMode = investigation\?\.mode === "integrity"/);
assert.match(mountBlock, /if \(initialTimeEntryId\)[\s\S]*loadRows\(initialTimeEntryId, initialExpectedEvidence, initialIntegrityMode\)[\s\S]*else[\s\S]*loadRows\(\)/);
assert.equal((mountBlock.match(/loadRows\(/g) || []).length, 2, 'mount effect should choose exactly one of scoped or recent-history loading');
console.log('PASS initial scoped mount chooses one deterministic audit request');

const transitionEffectStart = source.indexOf('useEffect(() => {', previousRefStart);
const filteredStart = source.indexOf('const filtered = useMemo', transitionEffectStart);
assert.ok(transitionEffectStart >= 0 && filteredStart > transitionEffectStart);
const transitionBlock = source.slice(transitionEffectStart, filteredStart);
assert.match(transitionBlock, /previous\.nonce !== investigation\?\.nonce \|\| previous\.time_entry_id !== timeEntryId/);
assert.match(transitionBlock, /if \(!changed \|\| !timeEntryId\) return/);
assert.match(transitionBlock, /setSearch\(timeEntryId\)/);
assert.match(transitionBlock, /const expectedEvidence = Array\.isArray\(investigation\?\.evidence\) \? investigation\.evidence : \[\]/);
assert.match(transitionBlock, /loadRows\(timeEntryId, expectedEvidence, investigation\?\.mode === "integrity"\)/);
console.log('PASS rapid investigation changes request the newest TimeEntry scope');

assert.match(source, /if \(scopedId && integrityMode\)/);
assert.match(source, /TimeClockAudit\.filter\(\{ time_entry_id: scopedId \}, \{ sort: "-server_timestamp", limit: 5000 \}\)/);
assert.match(source, /const maxIntegrityPageRequests = 100/);
assert.match(source, /let integrityPageRequestCount = 1/);
assert.match(source, /while \(true\)/);
assert.match(source, /if \(integrityPageRequestCount > maxIntegrityPageRequests\)/);
assert.match(source, /exceeded its .*request safety budget before authoritative history completeness could be proven/);
assert.match(source, /if \(!page \|\| typeof page !== "object" \|\| Array\.isArray\(page\)\)/);
assert.match(source, /pagination returned a malformed authoritative page/);
assert.match(source, /if \(!Array\.isArray\(page\.items\)\)/);
assert.match(source, /authoritative page items in an invalid format/);
assert.match(source, /if \(typeof page\.has_more !== "boolean"\)/);
assert.match(source, /invalid has_more completeness flag/);
assert.match(source, /page\.next_cursor !== null && page\.next_cursor !== undefined && typeof page\.next_cursor !== "string"/);
assert.match(source, /continuation cursor in an invalid format/);
assert.match(source, /const pageItems = page\.items/);
assert.match(source, /if \(page\.has_more && pageItems\.length === 0\)/);
assert.match(source, /empty non-terminal page, so evidence progress cannot be proven/);
const emptyPageProgressGuard = source.indexOf('if (page.has_more && pageItems.length === 0)');
const pageAccumulation = source.indexOf('loadedRows.push(...pageItems)');
assert.ok(emptyPageProgressGuard >= 0 && pageAccumulation > emptyPageProgressGuard, 'empty non-terminal pages must fail closed before authoritative rows are accumulated or another cursor is followed');
assert.match(source, /const malformedPageItemIndexes = pageItems/);
assert.match(source, /!row \|\| typeof row !== "object" \|\| Array\.isArray\(row\)/);
assert.match(source, /if \(malformedPageItemIndexes\.length > 0\)/);
assert.match(source, /malformed authoritative audit record.*inside a valid page/);
assert.match(source, /const mismatchedPageRows = pageItems\.filter\(\(row\) => String\(row\.time_entry_id \|\| ""\)\.trim\(\) !== scopedId\)/);
assert.match(source, /if \(mismatchedPageRows\.length > 0\)/);
assert.match(source, /authoritative audit record.*outside the requested TimeEntry scope/);
const pageScopeGuard = source.indexOf('if (mismatchedPageRows.length > 0)');
assert.ok(pageScopeGuard >= 0 && pageAccumulation > pageScopeGuard, 'out-of-scope TimeEntry rows must fail closed on their pagination page before authoritative accumulation or another cursor request');
assert.match(source, /let previousPageOldestTimestampMs = null/);
assert.match(source, /const pageTimestampMs = pageItems\.map\(\(row\) => Date\.parse\(String\(row\.server_timestamp \|\| ""\)\)\)/);
assert.match(source, /if \(invalidTimestampIndexes\.length > 0\)/);
assert.match(source, /valid server timestamp required to prove cursor ordering/);
assert.match(source, /const pageOrderingReversalIndex = pageTimestampMs\.findIndex/);
assert.match(source, /outside newest-to-oldest server timestamp order/);
assert.match(source, /const currentPageNewestTimestampMs = pageTimestampMs\[0\]/);
assert.match(source, /if \(currentPageNewestTimestampMs > previousPageOldestTimestampMs\)/);
assert.match(source, /crossed the prior page timestamp boundary/);
assert.match(source, /Equal server timestamps are therefore a legitimate boundary tie/);
assert.doesNotMatch(source, /currentPageNewestTimestampMs >= previousPageOldestTimestampMs/);
assert.match(source, /previousPageOldestTimestampMs = pageTimestampMs\[pageTimestampMs\.length - 1\]/);
const pageOrderingGuard = source.indexOf('if (pageOrderingReversalIndex >= 0)');
const crossPageOrderingGuard = source.indexOf('if (previousPageOldestTimestampMs !== null');
assert.ok(pageOrderingGuard >= 0 && crossPageOrderingGuard > pageOrderingGuard && pageAccumulation > crossPageOrderingGuard, 'page-local and cross-page timestamp ordering must be proven before authoritative accumulation');
assert.match(source, /const pageAuditIds = pageItems\.map\(\(row\) => String\(row\.id \|\| ""\)\.trim\(\)\)/);
assert.match(source, /const missingAuditIdIndexes = pageAuditIds/);
assert.match(source, /!auditId \? rowIndex : -1/);
assert.match(source, /if \(missingAuditIdIndexes\.length > 0\)/);
assert.match(source, /authoritative audit record.*without an immutable Audit ID/);
const missingAuditIdGuard = source.indexOf('if (missingAuditIdIndexes.length > 0)');
assert.ok(missingAuditIdGuard >= 0 && pageAccumulation > missingAuditIdGuard, 'missing immutable Audit IDs must fail closed at the pagination boundary before the page is accumulated');
assert.match(source, /const duplicateAuditIdsWithinPage = \[\.\.\.new Set\(pageAuditIds\.filter\(\(id, index\) => pageAuditIds\.indexOf\(id\) !== index\)\)\]/);
assert.match(source, /if \(duplicateAuditIdsWithinPage\.length > 0\)/);
assert.match(source, /duplicate immutable Audit ID.*inside one authoritative page/);
const withinPageDuplicateGuard = source.indexOf('if (duplicateAuditIdsWithinPage.length > 0)');
assert.ok(withinPageDuplicateGuard >= 0 && pageAccumulation > withinPageDuplicateGuard, 'same-page duplicate immutable Audit IDs must fail closed before the page is accumulated');
assert.match(source, /loadedRows\.push\(\.\.\.pageItems\)/);
assert.match(source, /if \(!page\.has_more\)[\s\S]*if \(nextCursor\)[\s\S]*continuation cursor on a terminal authoritative page/);
assert.match(source, /if \(!nextCursor\)/);
assert.match(source, /pagination reported more authoritative audit records without a continuation cursor/);
assert.match(source, /const seenCursors = new Set\(\)/);
assert.match(source, /const seenPageAuditIds = new Set\(\)/);
assert.match(source, /const repeatedPageAuditIds = \[\.\.\.new Set\(pageAuditIds\.filter\(\(id\) => seenPageAuditIds\.has\(id\)\)\)\]/);
assert.match(source, /pagination repeated .* immutable audit record/);
assert.match(source, /const nextCursor = String\(page\.next_cursor \|\| ""\)\.trim\(\)/);
assert.match(source, /if \(seenCursors\.has\(nextCursor\)\)/);
assert.match(source, /pagination repeated a continuation cursor and was stopped before it could loop indefinitely/);
assert.match(source, /seenCursors\.add\(nextCursor\)/);
assert.match(source, /if \(integrityPageRequestCount >= maxIntegrityPageRequests\)/);
assert.match(source, /reached its .*request safety budget while additional authoritative audit records still remained/);
assert.match(source, /integrityPageRequestCount \+= 1/);
const requestBudgetGuard = source.indexOf('if (integrityPageRequestCount >= maxIntegrityPageRequests)');
const continuationRequest = source.indexOf('TimeClockAudit.filter({ time_entry_id: scopedId }, { cursor: nextCursor, limit: 5000 })');
assert.ok(requestBudgetGuard >= 0 && continuationRequest > requestBudgetGuard, 'integrity pagination request budget must fail closed before issuing a continuation request beyond the bounded safety threshold');
assert.match(source, /TimeClockAudit\.filter\(\{ time_entry_id: scopedId \}, \{ cursor: nextCursor, limit: 5000 \}\)/);
assert.doesNotMatch(source, /integrityMode && loadedRows\.length >= 100/);
const integrityPaginationStart = source.indexOf('if (scopedId && integrityMode)');
const integrityClassification = source.indexOf('classifyAuthoritativePayrollAuditIntegrity(loadedRows)');
assert.ok(integrityPaginationStart >= 0 && integrityClassification > integrityPaginationStart, 'integrity classification must occur only after the cursor walk completes');
console.log('PASS integrity investigation walks every scoped authoritative audit page and fails closed on malformed page structure, empty non-terminal pages without evidence progress, malformed records, out-of-scope TimeEntry rows, missing immutable Audit IDs, same-page duplicate Audit IDs, contradictory terminal cursors, missing/repeated cursors, or records repeated across pages');

assert.match(source, /if \(integrityMode\)/);
assert.match(source, /classifyAuthoritativePayrollAuditIntegrity\(loadedRows\)/);
assert.match(source, /authoritative_integrity_diagnostics/);
assert.match(source, /setIntegrityDiagnostics\(authoritativeIntegrityDiagnostics\.map/);
assert.match(source, /setRows\(loadedRowLocators\)/);
assert.match(source, /diagnostic only and are not being presented as trusted payroll evidence/);
assert.match(source, /Malformed authoritative provenance/);
assert.match(source, /Diagnostic only — not trusted payroll evidence/);
assert.match(source, /function integrityValidationSummary\(validation\)/);
assert.match(source, /Company date does not match clock-in in America\/New_York/);
assert.match(source, /integrityValidationSummary\(integrityDiagnostic\.validation\)/);
assert.match(source, /diagnostic_locator: loadedRowLocators\[item\.diagnostic_row_index\]\?\.diagnostic_locator/);
assert.match(source, /diagnostic_locator: `request-\$\{requestSequence\}-row-\$\{rowIndex\}`/);
assert.match(source, /row\.id \|\| "Missing immutable audit ID"/);
console.log('PASS integrity investigation identifies malformed authoritative membership rows, explains failed rules, and uses row-local diagnostic identity for every diagnostic row without promoting it to authoritative evidence');

assert.match(source, /duplicate_audit_ids: duplicateIntegrityAuditIds/);
assert.match(source, /Duplicate immutable Audit ID/);
assert.match(source, /shared by multiple authoritative records/);
assert.doesNotMatch(source, /integrityDiagnosticByAuditId/);
assert.match(source, /integrityInvestigation \? diagnosticLocator/);
console.log('PASS integrity mode preserves every duplicate immutable Audit-ID row as a separate diagnostic and never collapses duplicate identity through an ID-keyed map');

assert.match(source, /return rows\.filter\(\(\{ row \}\) =>/);
assert.match(source, /filtered\.map\(\(\{ row, diagnostic_locator: diagnosticLocator \}\) =>/);
assert.doesNotMatch(source, /rows\.indexOf\(row\)/);
assert.match(source, /integrityDiagnosticByLocator\.get\(diagnosticLocator\)/);
assert.match(source, /const loadedRowLocators = loadedRows\.map/);
assert.doesNotMatch(source, /integrityDiagnosticByRowIndex/);
console.log('PASS refresh-local opaque locators stay attached through filtering/rendering and prevent fresh response reordering from transferring integrity diagnostics');

const mixedDuplicateRows = [
  { id: 'audit-duplicate', action: 'clock_in', request_id: 'request-valid', server_timestamp: '2026-10-05T13:00:00.000Z', details: { employee_attested_clock_in: '2026-10-05T13:00:00.000Z' } },
  { id: 'audit-duplicate', action: 'clock_in', request_id: '', server_timestamp: '2026-10-05T14:00:00.000Z', details: { employee_attested_clock_in: '2026-10-05T14:00:00.000Z' } },
];
const mixedDuplicateIntegrity = classifyAuthoritativePayrollAuditIntegrity(mixedDuplicateRows);
assert.deepEqual(mixedDuplicateIntegrity.duplicate_audit_ids, ['audit-duplicate']);
assert.equal(mixedDuplicateIntegrity.diagnostics.length, 2);
assert.deepEqual(mixedDuplicateIntegrity.diagnostics.map((item) => item.diagnostic_row_index), [0, 1]);
assert.equal(mixedDuplicateIntegrity.diagnostics[0].duplicate_immutable_audit_id, true);
assert.equal(mixedDuplicateIntegrity.diagnostics[0].validation, null, 'valid duplicate row must not inherit malformed provenance from its same-ID neighbor');
assert.equal(mixedDuplicateIntegrity.diagnostics[1].duplicate_immutable_audit_id, true);
assert.ok(mixedDuplicateIntegrity.diagnostics[1].validation?.missing_fields.includes('request_id'), 'malformed duplicate row must retain its own provenance failure');
console.log('PASS mixed valid/malformed duplicate Audit-ID rows keep deterministic row-local provenance classification without cross-row inheritance');

assert.match(source, /onExitInvestigation\(\);[\s\S]*loadRows\(\);/);
assert.match(source, /setSearch\(""\);[\s\S]*setActionFilter\("all"\);[\s\S]*onExitInvestigation/);
console.log('PASS exiting investigation clears filters and reloads recent audit history');

assert.match(mountBlock, /return \(\) => \{[\s\S]*mountedRef\.current = false;[\s\S]*requestSequenceRef\.current \+= 1;/);
assert.match(source, /if \(!mountedRef\.current\) return;/);
console.log('PASS unmount invalidates in-flight audit requests and suppresses late state updates');

const loadRowsStart = source.indexOf('const loadRows = async');
const mountEffectBoundary = source.indexOf('useEffect(() => {', loadRowsStart);
assert.ok(loadRowsStart >= 0 && mountEffectBoundary > loadRowsStart);
const loadRowsBlock = source.slice(loadRowsStart, mountEffectBoundary);

assert.match(loadRowsBlock, /const scopedId = String\(timeEntryId \|\| ""\)\.trim\(\)/);
assert.match(loadRowsBlock, /TimeClockAudit\.filter\(scopedId \? \{ time_entry_id: scopedId \} : \{\}/);
assert.match(loadRowsBlock, /const mismatchedRows = loadedRows\.filter\(\(row\) => String\(row\?\.time_entry_id \|\| ""\)\.trim\(\) !== scopedId\)/);
assert.match(loadRowsBlock, /if \(mismatchedRows\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*setError\(`/);
assert.ok(loadRowsBlock.indexOf('setRows([]);') < loadRowsBlock.indexOf('setRows(loadedRowLocators);'), 'scoped integrity rejection must occur before accepting returned rows');
console.log('PASS exact scoped audit rows are accepted only after TimeEntry integrity validation');

assert.match(loadRowsBlock, /mismatchedRows\.length > 0/);
assert.match(loadRowsBlock, /No scoped audit records are being displayed/);
assert.match(loadRowsBlock, /mismatched_audit_ids: mismatchedRows\.map/);
console.log('PASS mixed-TimeEntry scoped responses are rejected wholesale with diagnostic audit IDs');

assert.match(loadRowsBlock, /String\(row\?\.time_entry_id \|\| ""\)\.trim\(\) !== scopedId/);
console.log('PASS scoped rows missing a TimeEntry ID are treated as integrity failures');

const integrityGuardStart = loadRowsBlock.indexOf('if (scopedId) {');
const integrityGuardEnd = loadRowsBlock.indexOf('setRows(loadedRowLocators);', integrityGuardStart);
assert.ok(integrityGuardStart >= 0 && integrityGuardEnd > integrityGuardStart);
assert.match(loadRowsBlock.slice(integrityGuardStart, integrityGuardEnd), /mismatchedRows/);
assert.match(loadRowsBlock, /scopedId \? \{ time_entry_id: scopedId \} : \{\}/);
console.log('PASS ordinary unscoped recent-history responses bypass scoped TimeEntry rejection');

assert.match(loadRowsBlock, /const requiredEvidence = Array\.isArray\(expectedEvidence\) \? expectedEvidence : \[\]/);
assert.match(loadRowsBlock, /const missingRequiredAuditIdCount = requiredEvidence\.filter\(\(item\) => !String\(item\?\.audit_id \|\| ""\)\.trim\(\)\)\.length/);
assert.match(loadRowsBlock, /if \(missingRequiredAuditIdCount > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*no immutable audit ID/);
assert.match(loadRowsBlock, /missing_conflict_audit_id_count: missingRequiredAuditIdCount/);
assert.match(loadRowsBlock, /const requiredAuditIds = requiredEvidence\.map/);
assert.ok(loadRowsBlock.indexOf('missingRequiredAuditIdCount > 0') < loadRowsBlock.indexOf('duplicateRequiredAuditIds.length > 0'), 'expected audit IDs must be present before duplicate detection');
console.log('PASS blank or missing expected conflict audit identities fail closed instead of being filtered away');
assert.match(source, /payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence/);
assert.match(loadRowsBlock, /\.map\(validatePayrollMembershipConflictEvidence\)/);
assert.match(loadRowsBlock, /\.filter\(payrollMembershipConflictEvidenceIsMalformed\)/);
assert.doesNotMatch(loadRowsBlock, /supportedEvidenceActions|supportedEvidenceSources|const isIsoInstant|const isCompanyDate|requiredEvidenceFields/);
console.log('PASS expected conflict provenance validation uses one shared payroll-membership evidence contract without local rule duplication');
assert.match(loadRowsBlock, /if \(malformedRequiredEvidence\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*evidence-shape check failed/);
assert.match(loadRowsBlock, /malformed_conflict_evidence: malformedRequiredEvidence/);
assert.ok(loadRowsBlock.indexOf('malformedRequiredEvidence.length > 0') < loadRowsBlock.indexOf('duplicateRequiredAuditIds.length > 0'), 'expected evidence shape must be valid before identity/completeness checks');
assert.ok(loadRowsBlock.indexOf('malformedRequiredEvidence.length > 0') < loadRowsBlock.indexOf('contradictoryEvidence.length > 0'), 'malformed expected provenance must be distinguished from authoritative evidence contradiction');
console.log('PASS malformed expected conflict provenance fails closed as an evidence-shape error before authoritative comparison');
assert.match(loadRowsBlock, /const duplicateRequiredAuditIds = \[\.\.\.new Set\(requiredAuditIds\.filter/);
assert.match(loadRowsBlock, /if \(duplicateRequiredAuditIds\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*evidence-identity check failed/);
assert.match(loadRowsBlock, /duplicate_conflict_audit_ids: duplicateRequiredAuditIds/);
assert.ok(loadRowsBlock.indexOf('duplicateRequiredAuditIds.length > 0') < loadRowsBlock.indexOf('missingAuditIds.length > 0'), 'expected evidence identity must be unique before completeness');
console.log('PASS duplicate or contradictory expected conflict audit identities fail closed before completeness');

assert.match(loadRowsBlock, /const returnedAuditIdList = loadedRows\.map/);
assert.match(loadRowsBlock, /const missingReturnedAuditIdCount = returnedAuditIdList\.filter\(\(id\) => !id\)\.length/);
assert.match(loadRowsBlock, /if \(missingReturnedAuditIdCount > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*no immutable audit ID/);
assert.match(loadRowsBlock, /missing_returned_audit_id_count: missingReturnedAuditIdCount/);
assert.ok(loadRowsBlock.indexOf('missingReturnedAuditIdCount > 0') < loadRowsBlock.indexOf('duplicateReturnedAuditIds.length > 0'), 'returned audit IDs must be present before duplicate detection');
assert.ok(loadRowsBlock.indexOf('missingReturnedAuditIdCount > 0') < loadRowsBlock.indexOf('const returnedAuditIds = new Set(returnedAuditIdList)'), 'returned audit IDs must be present before set construction');
console.log('PASS blank or missing returned immutable audit identities fail closed before evidence verification');

assert.match(loadRowsBlock, /const duplicateReturnedAuditIds = \[\.\.\.new Set\(returnedAuditIdList\.filter/);
assert.match(loadRowsBlock, /if \(duplicateReturnedAuditIds\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*returned-identity check failed/);
assert.match(loadRowsBlock, /duplicate_returned_audit_ids: duplicateReturnedAuditIds/);
assert.ok(loadRowsBlock.indexOf('duplicateReturnedAuditIds.length > 0') < loadRowsBlock.indexOf('const returnedAuditIds = new Set(returnedAuditIdList)'), 'returned audit identities must be unique before set construction');
assert.ok(loadRowsBlock.indexOf('duplicateReturnedAuditIds.length > 0') < loadRowsBlock.indexOf('missingAuditIds.length > 0'), 'returned audit identities must be unique before completeness');
console.log('PASS duplicate returned immutable audit identities fail closed before set collapse or completeness');

assert.match(loadRowsBlock, /const returnedAuditIds = new Set\(returnedAuditIdList\)/);
assert.match(loadRowsBlock, /const missingAuditIds = requiredAuditIds\.filter\(\(id\) => !returnedAuditIds\.has\(id\)\)/);
assert.match(loadRowsBlock, /if \(missingAuditIds\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*completeness check failed/);
console.log('PASS scoped investigation fails closed when any expected conflict audit ID is missing');

assert.ok(loadRowsBlock.indexOf('mismatchedRows.length > 0') < loadRowsBlock.indexOf('missingAuditIds.length > 0'), 'TimeEntry integrity must be established before completeness');
assert.ok(loadRowsBlock.indexOf('missingAuditIds.length > 0') < loadRowsBlock.lastIndexOf('setRows(loadedRowLocators);'), 'completeness must be established before accepting scoped rows');
console.log('PASS conflict evidence completeness is verified before scoped rows are presented');

assert.match(loadRowsBlock, /const contradictoryEvidence = requiredEvidence\.filter\(\(expected\) => !conflictEvidenceMatchesAudit/);
assert.match(loadRowsBlock, /if \(contradictoryEvidence\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*evidence-content check failed/);
assert.ok(loadRowsBlock.indexOf('missingAuditIds.length > 0') < loadRowsBlock.indexOf('contradictoryEvidence.length > 0'), 'completeness must be established before immutable evidence content comparison');
assert.ok(loadRowsBlock.indexOf('contradictoryEvidence.length > 0') < loadRowsBlock.lastIndexOf('setRows(loadedRowLocators);'), 'content agreement must be established before accepting scoped rows');
console.log('PASS expected conflict audit IDs must also match immutable evidence content before display');

assert.match(source, /String\(row\?\.action \|\| ""\) === String\(expected\?\.action \|\| ""\)/);
assert.match(source, /String\(row\?\.request_id \|\| ""\) === String\(expected\?\.request_id \|\| ""\)/);
assert.match(source, /String\(row\?\.server_timestamp \|\| ""\) === String\(expected\?\.server_timestamp \|\| ""\)/);
assert.match(source, /membership\?\.company_date/);
assert.match(source, /membership\?\.clock_in/);
assert.match(source, /membership\?\.source/);
console.log('PASS conflict evidence comparison binds action, request, server time, company date, clock-in, and source');

assert.match(source, /loadRows\(investigation\?\.time_entry_id, investigationEvidence, integrityInvestigation\)/);
console.log('PASS scoped refresh preserves expected immutable conflict evidence and the active investigation integrity mode');

console.log('PASS 17/17 Time Clock Audit Trail lifecycle, integrity, identity, completeness, evidence-content, and contract-version scenarios');
