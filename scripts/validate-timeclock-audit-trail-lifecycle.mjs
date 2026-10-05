// Source-level regression coverage for Time Clock Audit Trail async lifecycle guarantees.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/timeclock/TimeClockAuditTrail.jsx', import.meta.url), 'utf8');

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
assert.match(mountBlock, /if \(initialTimeEntryId\)[\s\S]*loadRows\(initialTimeEntryId\)[\s\S]*else[\s\S]*loadRows\(\)/);
assert.equal((mountBlock.match(/loadRows\(/g) || []).length, 2, 'mount effect should choose exactly one of scoped or recent-history loading');
console.log('PASS initial scoped mount chooses one deterministic audit request');

const transitionEffectStart = source.indexOf('useEffect(() => {', previousRefStart);
const filteredStart = source.indexOf('const filtered = useMemo', transitionEffectStart);
assert.ok(transitionEffectStart >= 0 && filteredStart > transitionEffectStart);
const transitionBlock = source.slice(transitionEffectStart, filteredStart);
assert.match(transitionBlock, /previous\.nonce !== investigation\?\.nonce \|\| previous\.time_entry_id !== timeEntryId/);
assert.match(transitionBlock, /if \(!changed \|\| !timeEntryId\) return/);
assert.match(transitionBlock, /setSearch\(timeEntryId\)/);
assert.match(transitionBlock, /loadRows\(timeEntryId\)/);
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

console.log('PASS 9/9 Time Clock Audit Trail lifecycle and result-integrity scenarios');
