// Source-level regression coverage for Time Clock Audit Trail async lifecycle guarantees.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/timeclock/TimeClockAuditTrail.jsx', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');

const frontendContractVersion = source.match(/const PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION = (\d+);/)?.[1];
const backendContractVersion = backendSource.match(/const PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION = (\d+);/)?.[1];
assert.ok(frontendContractVersion, 'frontend payroll-membership evidence contract version must exist');
assert.equal(frontendContractVersion, backendContractVersion, 'frontend/backend payroll-membership evidence contract versions must remain identical');
assert.match(backendSource, /contract_version: PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION/);
assert.match(source, /Number\(expected\?\.contract_version \|\| 0\) === PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION/);
console.log('PASS payroll membership evidence producer and verifier share one explicit contract version');

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
