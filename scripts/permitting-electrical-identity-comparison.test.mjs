import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {savedOfficeIdentityComparisons} from '../src/components/permitting/officeResearchIdentityComparison.mjs';
import {updateOfficeResearchDraft} from '../src/components/permitting/officeResearchDraftEditing.mjs';
const fixture=JSON.parse(readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/electrical-identity-comparison-fixture-2026-10-18.json'));
test('exact saved positions retain separate unapproved issuer and inspector references without mutation',()=>{
 const original=structuredClone(fixture),rows=savedOfficeIdentityComparisons(fixture);
 assert.deepEqual(rows.map(x=>[x.entry.role,x.current,x.finding_index]),[['electrical_permit',true,3],['electrical_inspection',true,4]]);
 for(const {entry} of rows)assert.equal(entry.equivalence_confirmed,false);
 assert.equal(rows[1].entry.catalog_reference.recorded_government_office_id,null);
 assert.deepEqual(fixture,original);
});
test('staff edits preserve historical comparison but mark only the edited basis stale',()=>{
 const draft=structuredClone(fixture.roles[3]);draft.office_name='Staff edited issuer';
 const changed=updateOfficeResearchDraft(fixture,3,draft);
 const rows=savedOfficeIdentityComparisons(changed);
 assert.equal(rows[0].current,false);assert.equal(rows[1].current,true);
 assert.equal(rows[0].entry.recorded_basis.office_name,'City of Sharonville');
 assert.deepEqual(changed.identity_reconciliation,fixture.identity_reconciliation);
});
test('legacy research, changed profile identity, conflicting positions and reordered roles do not appear current',()=>{
 assert.deepEqual(savedOfficeIdentityComparisons({method:fixture.method,roles:fixture.roles}),[]);
 const wrong=structuredClone(fixture);wrong.profile_snapshot.id='other';assert.deepEqual(savedOfficeIdentityComparisons(wrong),[]);
 const duplicate=structuredClone(fixture);duplicate.identity_reconciliation.entries.push(duplicate.identity_reconciliation.entries[0]);
 assert.equal(savedOfficeIdentityComparisons(duplicate)[0].current,false);
 const reordered=structuredClone(fixture);[reordered.roles[3],reordered.roles[4]]=[reordered.roles[4],reordered.roles[3]];
 assert.ok(savedOfficeIdentityComparisons(reordered).every(x=>!x.current&&x.finding_index===null));
});
