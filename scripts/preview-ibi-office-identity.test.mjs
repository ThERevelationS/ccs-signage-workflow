import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewIbiIdentity} from './preview-ibi-office-identity.mjs';
const snapshot=JSON.parse(readFileSync('docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/ibi-catalog-preview-snapshot.json','utf8'));
test('preview preserves legacy contacts/workflow and never approves roles',()=>{
 const before=structuredClone(snapshot),p=previewIbiIdentity(snapshot);
 assert.deepEqual(snapshot,before);
 assert.deepEqual(p.proposed_office.workflow_steps,snapshot.office.workflow_steps);
 for(const key of Object.keys(snapshot.office))assert.deepEqual(p.proposed_office[key],snapshot.office[key]);
 assert.equal(p.proposed_office.government_office.verification_status,'needs_verification');
 assert.equal(p.proposed_office.government_office.verified_by,'');
 assert.equal(p.authority_verified,false);assert.equal(p.applied,false);
 assert.equal(p.locality_links_changed,false);
 assert.deepEqual(p.expected_catalog,{id:snapshot.id,setting_key:snapshot.setting_key,updated_date:snapshot.updated_date});
 assert.equal(p.evidence.electrical_permit.status,'needs_review');
 assert.equal(p.evidence.electrical_inspection.status,'needs_review');
});
test('unknown, unversioned or previously canonical office blocks preview',()=>{
 for(const mutation of [
  s=>s.updated_date='',s=>s.setting_key='other',s=>s.office.id='other',
  s=>s.office.government_office_id='reviewed',s=>s.office.government_office={},
  s=>s.other_office_ids.push(s.office.id)]){
  const s=structuredClone(snapshot);mutation(s);assert.throws(()=>previewIbiIdentity(s));
 }
});
test('workflow changes alter exact-office guard; role evidence matches retained PDF',()=>{
 const p=previewIbiIdentity(snapshot),s=structuredClone(snapshot);
 s.office.workflow_steps[0].name='Changed';
 assert.notEqual(previewIbiIdentity(s).expected_office_sha256,p.expected_office_sha256);
 const manifest=JSON.parse(readFileSync('docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/manifest.json','utf8'));
 assert.equal(p.evidence.electrical_permit.sha256,manifest.sources[0].sha256);
 assert.equal(p.evidence.electrical_inspection.sha256,manifest.sources[0].sha256);
});
