import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildElectricalOfficeInquiry } from '../src/components/permitting/electricalOfficeInquiry.mjs';
const initial = JSON.parse(readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/electrical-identity-comparison-fixture-2026-10-18.json'));
const before = JSON.stringify(initial);
for (const role of ['electrical_permit', 'electrical_inspection']) {
  const output = buildElectricalOfficeInquiry(initial, role);
  assert.equal(output.available, true);
  assert.match(output.text, /Sharonville, OH/);
  assert.match(output.text, /Project address \/ parcel: \[add before contacting\]/);
  assert.match(output.text, /current official/);
  assert.match(output.text, /commercial sign/);
  assert.match(output.text, /Prepared from saved research only/);
  assert.match(output.text, /Residential-Permitting-Guide-2026/);
}
assert.match(buildElectricalOfficeInquiry(initial, 'electrical_permit').text, /distinguish issuance from intake and inspections/);
assert.match(buildElectricalOfficeInquiry(initial, 'electrical_inspection').text, /contract or delegation/);
const duplicate = structuredClone(initial);
duplicate.roles.push(structuredClone(duplicate.roles.find(row => row.role === 'electrical_inspection')));
assert.match(buildElectricalOfficeInquiry(duplicate, 'electrical_inspection').text, /Candidate 2/);
assert.match(buildElectricalOfficeInquiry(duplicate, 'electrical_inspection').text, /none has been selected/);
const empty = {...initial, roles: []};
assert.match(buildElectricalOfficeInquiry(empty, 'electrical_permit').text, /No saved finding/);
const unsafe = structuredClone(initial);
unsafe.roles.find(row => row.role === 'electrical_permit').official_source_url = 'javascript:alert(1)';
assert.doesNotMatch(buildElectricalOfficeInquiry(unsafe, 'electrical_permit').text, /javascript:/);
const complete = structuredClone(initial);
const permit = complete.roles.find(row => row.role === 'electrical_permit');
for (const key of Object.keys(permit.research_fields)) permit.research_fields[key] = 'Recorded';
assert.match(buildElectricalOfficeInquiry(complete, 'electrical_permit').text, /current official source/);
for (const research of [null, {...initial, profile_snapshot: null}, {...initial, method:'other'}, {...initial, profile_snapshot:{...initial.profile_snapshot, state:'XX'}}])
 assert.equal(buildElectricalOfficeInquiry(research, 'electrical_permit').available, false);
assert.equal(buildElectricalOfficeInquiry(initial, 'building').available, false);
assert.equal(JSON.stringify(initial), before);
console.log('Electrical office inquiry: role separation, missing/duplicate findings, current evidence questions, safe links, locality validation and immutable input passed.');
