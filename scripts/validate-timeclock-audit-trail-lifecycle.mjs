// Source-level regression coverage for Time Clock Audit Trail async lifecycle guarantees.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, payrollMembershipCompanyDate, payrollMembershipFromAudit } from '../base44/shared/timeClockPayrollMembershipEvidence.mjs';

const source = readFileSync(new URL('../src/components/timeclock/TimeClockAuditTrail.jsx', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');

assert.equal(PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, 1, 'shared payroll-membership evidence contract version must remain explicit');
assert.match(backendSource, /from '\.\.\/\.\.\/shared\/timeClockPayrollMembershipEvidence\.mjs'/);
assert.match(source, /from "\.\.\/\.\.\/\.\.\/base44\/shared\/timeClockPayrollMembershipEvidence\.mjs"/);
assert.match(backendSource, /contract_version: PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION/);
assert.match(source, /Number\(expected\?\.contract_version \|\| 0\) === PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION/);
console.log('PASS payroll membership evidence producer and verifier import one shared versioned contract');

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
assert.match(mountBlock, /if \(initialTimeEntryId\)[\s\S]*loadRows\(initialTimeEntryId, initialExpectedEvidence\)[\s\S]*else[\s\S]*loadRows\(\)/);
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
assert.match(transitionBlock, /loadRows\(timeEntryId, expectedEvidence\)/);
console.log('PASS rapid investigation changes request the newest TimeEntry scope');

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
assert.ok(loadRowsBlock.indexOf('setRows([]);') < loadRowsBlock.indexOf('setRows(loadedRows);'), 'scoped integrity rejection must occur before accepting returned rows');
console.log('PASS exact scoped audit rows are accepted only after TimeEntry integrity validation');

assert.match(loadRowsBlock, /mismatchedRows\.length > 0/);
assert.match(loadRowsBlock, /No scoped audit records are being displayed/);
assert.match(loadRowsBlock, /mismatched_audit_ids: mismatchedRows\.map/);
console.log('PASS mixed-TimeEntry scoped responses are rejected wholesale with diagnostic audit IDs');

assert.match(loadRowsBlock, /String\(row\?\.time_entry_id \|\| ""\)\.trim\(\) !== scopedId/);
console.log('PASS scoped rows missing a TimeEntry ID are treated as integrity failures');

const integrityGuardStart = loadRowsBlock.indexOf('if (scopedId) {');
const integrityGuardEnd = loadRowsBlock.indexOf('setRows(loadedRows);', integrityGuardStart);
assert.ok(integrityGuardStart >= 0 && integrityGuardEnd > integrityGuardStart);
assert.match(loadRowsBlock.slice(integrityGuardStart, integrityGuardEnd), /mismatchedRows/);
assert.match(loadRowsBlock, /scopedId \? \{ time_entry_id: scopedId \} : \{\}/);
console.log('PASS ordinary unscoped recent-history responses bypass scoped TimeEntry rejection');

assert.match(loadRowsBlock, /const requiredAuditIds = \[\.\.\.new Set\(/);
assert.match(loadRowsBlock, /const returnedAuditIds = new Set\(loadedRows\.map/);
assert.match(loadRowsBlock, /const missingAuditIds = requiredAuditIds\.filter\(\(id\) => !returnedAuditIds\.has\(id\)\)/);
assert.match(loadRowsBlock, /if \(missingAuditIds\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*completeness check failed/);
console.log('PASS scoped investigation fails closed when any expected conflict audit ID is missing');

assert.ok(loadRowsBlock.indexOf('mismatchedRows.length > 0') < loadRowsBlock.indexOf('missingAuditIds.length > 0'), 'TimeEntry integrity must be established before completeness');
assert.ok(loadRowsBlock.indexOf('missingAuditIds.length > 0') < loadRowsBlock.lastIndexOf('setRows(loadedRows);'), 'completeness must be established before accepting scoped rows');
console.log('PASS conflict evidence completeness is verified before scoped rows are presented');

assert.match(loadRowsBlock, /const contradictoryEvidence = requiredEvidence\.filter\(\(expected\) => !conflictEvidenceMatchesAudit/);
assert.match(loadRowsBlock, /if \(contradictoryEvidence\.length > 0\)[\s\S]*setRows\(\[\]\);[\s\S]*evidence-content check failed/);
assert.ok(loadRowsBlock.indexOf('missingAuditIds.length > 0') < loadRowsBlock.indexOf('contradictoryEvidence.length > 0'), 'completeness must be established before immutable evidence content comparison');
assert.ok(loadRowsBlock.indexOf('contradictoryEvidence.length > 0') < loadRowsBlock.lastIndexOf('setRows(loadedRows);'), 'content agreement must be established before accepting scoped rows');
console.log('PASS expected conflict audit IDs must also match immutable evidence content before display');

assert.match(source, /String\(row\?\.action \|\| ""\) === String\(expected\?\.action \|\| ""\)/);
assert.match(source, /String\(row\?\.request_id \|\| ""\) === String\(expected\?\.request_id \|\| ""\)/);
assert.match(source, /String\(row\?\.server_timestamp \|\| ""\) === String\(expected\?\.server_timestamp \|\| ""\)/);
assert.match(source, /membership\?\.company_date/);
assert.match(source, /membership\?\.clock_in/);
assert.match(source, /membership\?\.source/);
console.log('PASS conflict evidence comparison binds action, request, server time, company date, clock-in, and source');

assert.match(source, /loadRows\(investigation\?\.time_entry_id, investigationEvidence\)/);
console.log('PASS scoped refresh preserves the complete expected immutable conflict evidence');

console.log('PASS 15/15 Time Clock Audit Trail lifecycle, integrity, completeness, evidence-content, and contract-version scenarios');
