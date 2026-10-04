import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGovernmentOfficeCatalogEntry,updateGovernmentOfficeCatalogEntry,updateGovernmentOfficeVerification} from '../src/components/permitting/governmentOfficeCatalog.js';
import {copyCatalogOfficeToLocality} from '../src/components/permitting/localityOfficeCatalogBridge.js';

const office=()=>({
 id:'office-candidate-1',government_office_id:'office-candidate-1',
 name:'Campbell County Planning, Zoning and Building Inspection',
 contact_phone:'(859) 292-3880',workflow_steps:[{id:'original-step',name:'Staff workflow',type:'checkbox'}],
 office_candidate_registration:{registration_key:'retained-candidate',snapshot:{proof:{excerpt:'Original publisher'}}},
 office_identity_reviews:[{review_id:'prior-review',reviewed_by:'Named reviewer',authority_verified:false}],
 government_office:{name:'Campbell County Planning, Zoning and Building Inspection',phone:'(859) 292-3880',
 state:'KY',verification_status:'staff_verified',verified_by:'Named reviewer',verified_at:'2026-10-04T20:00:00Z',
 source_url:'https://campbellcountyky.gov/department/index.php?structureid=37',
 retained_identity_evidence:{repo_path:'docs/official-evidence/office.html',sha256:'abc',proofs:['Exact official identity']}}
});
test('catalog normalization preserves state and retained evidence from newer office reviews',()=>{
 const original=office(),normalized=normalizeGovernmentOfficeCatalogEntry(original);
 assert.equal(normalized.government_office.state,'KY');
 assert.deepEqual(normalized.government_office.retained_identity_evidence,original.government_office.retained_identity_evidence);
 assert.deepEqual(normalized.office_candidate_registration,original.office_candidate_registration);
 assert.deepEqual(normalized.office_identity_reviews,original.office_identity_reviews);
 assert.deepEqual(normalized.workflow_steps,original.workflow_steps);
 assert.deepEqual(original,office());
});
test('workflow edits preserve current identity review and state without changing authority',()=>{
 const original=office(),next=updateGovernmentOfficeCatalogEntry(original,{workflow_steps:[{id:'new-step',name:'New workflow'}]});
 assert.equal(next.government_office.verification_status,'staff_verified');
 assert.equal(next.government_office.state,'KY');
 assert.deepEqual(next.government_office.retained_identity_evidence,original.government_office.retained_identity_evidence);
 assert.deepEqual(next.office_identity_reviews,original.office_identity_reviews);
 assert.equal(Object.hasOwn(next,'authority_roles'),false);
});
test('contact changes revoke verification while retaining evidence and history',()=>{
 const original=office(),next=updateGovernmentOfficeCatalogEntry(original,{contact_phone:'Changed phone'});
 assert.equal(next.government_office.verification_status,'needs_verification');
 assert.equal(next.government_office.verified_by,'');
 assert.equal(next.government_office.verified_at,'');
 assert.equal(next.government_office.state,'KY');
 assert.deepEqual(next.government_office.retained_identity_evidence,original.government_office.retained_identity_evidence);
 assert.deepEqual(next.office_identity_reviews,original.office_identity_reviews);
 assert.deepEqual(next.office_candidate_registration,original.office_candidate_registration);
});
test('verification and revocation preserve retained review provenance',()=>{
 const original=office();
 for(const status of ['needs_verification','staff_verified']){
  const next=updateGovernmentOfficeVerification(original,{verification_status:status},'New reviewer',()=> '2026-10-04T21:00:00Z');
  assert.equal(next.government_office.state,'KY');
  assert.deepEqual(next.government_office.retained_identity_evidence,original.government_office.retained_identity_evidence);
  assert.deepEqual(next.office_identity_reviews,original.office_identity_reviews);
 }
});
test('retained evidence never fabricates a verification flag',()=>{
 const original=office();original.government_office.verification_status='unknown';
 const next=normalizeGovernmentOfficeCatalogEntry(original);
 assert.equal(next.government_office.verification_status,'needs_verification');
 assert.equal(next.government_office.verified_by,'');
 assert.equal(next.government_office.verified_at,'');
 assert.equal(next.government_office.state,'KY');
});
test('locality copy keeps independent workflow and does not inherit identity review as authority',()=>{
 const original=office(),copy=copyCatalogOfficeToLocality(original,0,()=> 'local-new');
 assert.equal(copy.government_office_id,original.government_office_id);
 assert.notEqual(copy.workflow_steps[0].id,original.workflow_steps[0].id);
 for(const field of ['office_identity_reviews','retained_identity_evidence','authority_roles','authority_verification_status','government_office'])assert.equal(Object.hasOwn(copy,field),false);
 assert.deepEqual(original,office());
});
