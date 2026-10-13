import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSavedLocalityProfileLinks as links } from '../src/components/permitting/permittingCoverageReader.mjs';
import { reconcileSavedOfficeEvidence as audit } from '../src/components/permitting/permittingOfficeEvidenceReader.mjs';

const reviewed = (changes={}) => ({
  id:'office',name:'Electrical office',government_office_id:'canonical-office',
  authority_roles:['electrical_permit'],authority_verification_status:'staff_verified',
  authority_verified_by:'Staff fixture',authority_verified_at:'2026-10-01T13:15:00Z',
  authority_verification_notes:'Staff must inspect source separately',
  ...changes
});
const locality=(id,offices=[],extras={})=>({
  id,name:'Example City',state:'OH',jurisdiction_profile_id:'p',offices,...extras
});
const profile=[{id:'p',name:'Example City',state:'OH'}];
const run=(rows,profiles=profile)=>audit(rows,links(rows,profiles));

test('well-formed saved office and profile IDs remain references, not proof of authority',()=>{
 const result=run([locality('oh',[reviewed()])]);
 assert.equal(result.states.OH.office_count,1);
 assert.equal(result.states.OH.recorded_staff_verified_offices,1);
 assert.equal(result.states.OH.electrical_issuer_assignments,1);
 assert.equal(result.states.OH.electrical_inspection_assignments,0);
 assert.deepEqual(result.reviews,[]);
 assert.equal(result.authority_verified,false);assert.equal(result.completeness_verified,false);
 assert.match(result.notice,/not independently corroborated/);
});

test('unlinked saved locality leaves verified office flagged for profile relationship review',()=>{
 const r=run([locality('oh',[reviewed()],{jurisdiction_profile_id:undefined})]);
 assert.equal(r.states.OH.profile_link_review,1);
 assert.deepEqual(r.reviews[0].link_flags,['unlinked']);
});

test('explicitly linked but unavailable profile ID cannot become verified via names',()=>{
 const r=run([locality('oh',[reviewed()],{jurisdiction_profile_id:'missing'})]);
 assert.deepEqual(r.reviews[0].link_flags,['missing_target']);
});

test('state and name conflict flag office link review without replacing saved IDs',()=>{
 const r=run([locality('oh',[reviewed()])],[{id:'p',name:'Other City',state:'KY'}]);
 assert.deepEqual(r.reviews[0].link_flags,['state_review','name_review']);
});

test('legacy broad electrical role does not establish issuer or inspector assignments',()=>{
 const r=run([locality('oh',[reviewed({authority_roles:['electrical']})])]);
 assert.equal(r.states.OH.electrical_issuer_assignments,0);
 assert.equal(r.states.OH.electrical_inspection_assignments,0);
 assert.equal(r.states.OH.authority_roles_review,0);
});

test('same office can have two explicitly assigned electrical roles but no automatic approval',()=>{
 const r=run([locality('oh',[reviewed({authority_roles:['electrical_permit','electrical_inspection']})])]);
 assert.equal(r.states.OH.electrical_issuer_assignments,1);
 assert.equal(r.states.OH.electrical_inspection_assignments,1);
 assert.equal(r.authority_verified,false);
});

test('unverified configured offices are not promoted to staff verified',()=>{
 const r=run([locality('oh',[reviewed({authority_verification_status:'needs_verification',authority_verified_by:'',authority_verification_notes:''})])]);
 assert.equal(r.states.OH.recorded_staff_verified_offices,0);
 assert.equal(r.states.OH.verification_provenance_review,0);
 assert.equal(r.authority_verified,false);
});

test('staff-verified role missing reviewer, time or notes produces inspectable review flags',()=>{
 const r=run([locality('oh',[
   reviewed({id:'a',authority_verified_by:''}),
   reviewed({id:'b',authority_verified_at:'2026-13-99'}),
   reviewed({id:'c',authority_verification_notes:''})
 ])]);
 assert.equal(r.states.OH.verification_provenance_review,3);
 assert.equal(r.reviews.find(x=>x.office_id==='a').missing_reviewer,true);
 assert.equal(r.reviews.find(x=>x.office_id==='b').missing_or_invalid_date,true);
 assert.equal(r.reviews.find(x=>x.office_id==='c').missing_notes,true);
});

test('canonical office ID is provenance only; missing canonical ID is explicit normalization review',()=>{
 const r=run([locality('oh',[reviewed({government_office_id:'',catalog_office_id:'catalog-123'})])]);
 assert.equal(r.states.OH.canonical_office_identity_missing,1);
 assert.equal(r.reviews[0].flags.includes('canonical_office_identity_missing'),true);
});

test('pending issuer and inspector assignments expose missing canonical identity without promotion',()=>{
 for(const role of ['electrical_permit','electrical_inspection']){
  for(const canonical of [undefined,null,'','   ']){
   const rows=[locality('oh',[reviewed({authority_roles:[role],authority_verification_status:'needs_verification',government_office_id:canonical,catalog_office_id:'catalog'})])];
   const before=JSON.stringify(rows),r=run(rows);
   assert.equal(r.states.OH.canonical_office_identity_missing,1);
   assert.equal(r.states.OH.canonical_office_identity_malformed,0);
   assert.equal(r.states.OH.recorded_staff_verified_offices,0);
   assert.equal(r.reviews[0].missing_canonical_office_id,true);
   assert.equal(r.reviews[0].recorded_staff_verified,false);
   assert.deepEqual(r.reviews[0].authority_roles,[role]);
   assert.equal(JSON.stringify(rows),before);
  }
 }
});
test('padded or nonstring canonical identity is malformed for historical and pending roles',()=>{
 for(const status of ['staff_verified','needs_verification']){
  for(const canonical of [' canonical-office ',12,{},[]]){
   const rows=[locality('oh',[reviewed({authority_verification_status:status,government_office_id:canonical})])];
   const before=JSON.stringify(rows),r=run(rows);
   assert.equal(r.states.OH.canonical_office_identity_malformed,1);
   assert.equal(r.states.OH.canonical_office_identity_missing,0);
   assert.equal(r.states.OH.canonical_electrical_role_copy_review,0);
   assert.equal(r.reviews[0].malformed_canonical_office_id,true);
   assert.equal(r.reviews[0].recorded_staff_verified,status==='staff_verified');
   assert.equal(JSON.stringify(rows),before);
  }
 }
});
test('unassigned legacy categories do not become electrical assignments through identity flags',()=>{
 const r=run([locality('oh',[reviewed({authority_roles:[],authority_verification_status:'needs_verification',government_office_id:undefined,office_type:'Electrical Inspectors'})])]);
 assert.equal(r.states.OH.canonical_office_identity_missing,0);
 assert.equal(r.states.OH.electrical_issuer_assignments,0);
 assert.equal(r.states.OH.electrical_inspection_assignments,0);
 assert.deepEqual(r.reviews,[]);
});
test('duplicates, missing scoped office ID and missing name remain review items',()=>{
 const r=run([locality('oh',[reviewed({id:'same'}),reviewed({id:'same'}),reviewed({id:' ',name:''})])]);
 assert.equal(r.states.OH.office_identity_review,3);
 assert.equal(r.reviews.filter(x=>x.duplicate_local_office_id).length,2);
 assert.equal(r.reviews.filter(x=>x.missing_office_name).length,1);
 assert.equal(r.reviews.filter(x=>x.missing_or_malformed_local_office_id).length,1);
});

test('unsupported or missing reviewed roles do not silently pass',()=>{
 const r=run([locality('oh',[reviewed({id:'a',authority_roles:['electrical_permit','made_up']}),reviewed({id:'b',authority_roles:[]})])]);
 assert.equal(r.states.OH.authority_roles_review,2);
 assert.equal(r.states.OH.electrical_issuer_assignments,1);
});

test('Ohio evidence reviews before Kentucky; scope ignores other states',()=>{
 const rows=[
   locality('ky',[reviewed()],{state:'KY',jurisdiction_profile_id:'missing'}),
   locality('wv',[reviewed()],{state:'WV'}),
   locality('oh',[reviewed({authority_verified_by:''})])
 ];
 const r=run(rows);
 assert.deepEqual(r.reviews.map(x=>x.locality_id),['oh','ky']);
 assert.equal(r.states.OH.locality_count,1);
 assert.equal(r.states.KY.locality_count,1);
});

test('no saved offices never means permitting authority complete',()=>{
 const r=run([locality('a',[])]);
 assert.equal(r.states.OH.office_count,0);
 assert.equal(r.completeness_verified,false);
});

test('six thousand saved offices have no total cap and remain read-only',()=>{
 const rows=Array.from({length:6000},(_,i)=>locality('loc'+i,[reviewed({id:'off'+i})],{jurisdiction_profile_id:'p'+i}));
 const profiles=Array.from({length:6000},(_,i)=>({id:'p'+i,state:'OH',name:'Example City'}));
 const before=JSON.stringify(rows);
 const r=run(rows,profiles);
 assert.equal(r.states.OH.office_count,6000);assert.equal(r.reviews.length,0);
 assert.equal(JSON.stringify(rows),before);
});

test('distinct local copy IDs sharing exact canonical issuer identity become review items',()=>{
 const rows=[locality('oh',[reviewed({id:'a',name:'First name'}),reviewed({id:'b',name:'Other name'})])];
 const before=JSON.stringify(rows),r=run(rows);
 assert.equal(r.states.OH.canonical_electrical_role_copy_review,2);
 assert.equal(r.states.OH.office_identity_review,0);
 assert.equal(r.states.OH.recorded_staff_verified_offices,2);
 assert.deepEqual(r.reviews.map(x=>x.office_id),['a','b']);
 for(const row of r.reviews){
  assert.equal(row.government_office_id,'canonical-office');
  assert.deepEqual(row.duplicate_electrical_roles,['electrical_permit']);
  assert.deepEqual(row.duplicate_electrical_copy_counts,{electrical_permit:2});
 }
 assert.equal(JSON.stringify(rows),before);
});
test('shared canonical provider across distinct roles or localities is never grouped as a duplicate',()=>{
 const r=run([locality('a',[reviewed({id:'issuer'}),reviewed({id:'inspector',authority_roles:['electrical_inspection']})]),
  locality('b',[reviewed({id:'other-locality'})],{jurisdiction_profile_id:'p2'})],[...profile,{id:'p2',name:'Example City',state:'OH'}]);
 assert.equal(r.states.OH.canonical_electrical_role_copy_review,0);
 assert.deepEqual(r.reviews,[]);
});
test('duplicate role entries do not count a single copy twice; pending copies still need identity review',()=>{
 const single=run([locality('a',[reviewed({authority_roles:['electrical_permit','electrical_permit']})])]);
 assert.equal(single.states.OH.canonical_electrical_role_copy_review,0);
 const r=run([locality('a',[reviewed({id:'issuer'}),reviewed({id:'pending',authority_verification_status:'needs_verification'})])]);
 assert.equal(r.states.OH.canonical_electrical_role_copy_review,2);
 assert.equal(r.states.OH.recorded_staff_verified_offices,1);
 assert.equal(r.reviews.find(row=>row.office_id==='pending').recorded_staff_verified,false);
});
test('only exact nonempty canonical IDs establish duplicate-copy candidates',()=>{
 const r=run([locality('a',[reviewed({id:'a',government_office_id:'exact'}),
  reviewed({id:'b',government_office_id:' exact '}),reviewed({id:'c',government_office_id:''}),
  reviewed({id:'d',government_office_id:''}),reviewed({id:'e',government_office_id:'different'})])]);
 assert.equal(r.states.OH.canonical_electrical_role_copy_review,0);
});
test('thousands of copies for both roles retain bounded per-copy counts without mutation',()=>{
 const rows=[locality('large',Array.from({length:4000},(_,i)=>reviewed({id:'copy-'+i,authority_roles:['electrical_permit','electrical_inspection']})))];
 const before=JSON.stringify(rows),r=run(rows);
 assert.equal(r.states.OH.canonical_electrical_role_copy_review,4000);
 assert.equal(r.reviews.length,4000);
 for(const row of r.reviews)assert.deepEqual(row.duplicate_electrical_copy_counts,{electrical_permit:4000,electrical_inspection:4000});
 assert.equal(JSON.stringify(rows),before);
});
test('malformed collections or locality identity fail safely',()=>{
 assert.throws(()=>run([locality('bad',null,{offices:'invalid'})]),/malformed/);
 assert.throws(()=>run([locality('same'),locality('same')]),/repeated|duplicate/);
 assert.throws(()=>audit(null,{states:{},reviews:[]}),/Invalid/);
});
