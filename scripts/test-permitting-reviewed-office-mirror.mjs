import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileReviewedOfficesWithoutSavedCopies as reconcile} from '../src/components/permitting/permittingReviewedOfficeMirror.mjs';

const profile=(id='p',state='OH',receipt={status:'complete',committed_sequence:1})=>({id,state,name:'Pilot City',office_authority_review_state:receipt});
const office=(patch={})=>({id:'saved-office',name:'Inspection Department',
  government_office_id:'gov',authority_roles:['electrical_permit'],
  authority_verification_status:'staff_verified',...patch});
const locality=(id='l',patch={})=>({id,state:'OH',name:'Pilot City',jurisdiction_profile_id:'p',offices:[office()],...patch});
const event=(patch={})=>({id:'review-1',method:'office-authority-v1',jurisdiction_id:'p',sequence:1,relation_key:'area-one',
  role:'electrical_permit',coverage_area:'Pilot City',action:'verify',requested_by:'Staff',
  office_snapshot:{government_office_id:'gov',name:'Inspection Department'},
  profile_snapshot:{id:'p',state:'OH',name:'Pilot City'},
  responsibility_confirmed:true,address_authority_resolved:false,...patch});
const run=(localities=[locality()],profiles=[profile()],events=[event()])=>reconcile(localities,profiles,events);

test('an exact mirror is only a saved reference and never verified authority',()=>{
 const r=run();
 assert.equal(r.states.OH.relation_histories,1);
 assert.equal(r.states.OH.saved_copy_reference_only,1);
 assert.equal(r.items.length,0);
 assert.equal(r.authority_verified,false);assert.equal(r.source_currentness_verified,false);assert.equal(r.complete,false);
 assert.match(r.notice,/optional workflow gaps/);
});

test('review exists without a saved tracker locality, and does not create one',()=>{
 const rows=[];const initial=JSON.stringify(rows);
 const r=run(rows);
 assert.equal(r.states.OH.no_saved_locality,1);
 assert.equal(r.items[0].profile_id,'p');
 assert.equal(r.items[0].canonical_office_id,'gov');
 assert.equal(JSON.stringify(rows),initial);
});

test('exact profile link exists but canonical office copy does not',()=>{
 const r=run([locality('l',{offices:[office({government_office_id:'other',name:'Inspection Department'})]})]);
 assert.equal(r.items[0].status,'no_saved_office');
});

test('roles cannot be inferred from office name, type, broad electrical or opposite electrical responsibility',()=>{
 for (const assigned of [['electrical_inspection'],['electrical'],[]]) {
   const r=run([locality('l',{offices:[office({authority_roles:assigned})]})]);
   assert.equal(r.items[0].status,'role_not_assigned');
 }
 const r=run([locality()],undefined,[event({role:'electrical_inspection',relation_key:'inspection-area'})]);
 assert.equal(r.items[0].status,'role_not_assigned');
});

test('matching office and role with unreviewed saved link stays pending',()=>{
 const r=run([locality('l',{offices:[office({authority_verification_status:'needs_verification'})]})]);
 assert.equal(r.items[0].status,'office_needs_review');
});

test('shared exact profile IDs remain ambiguous, even when one office copy matches',()=>{
 const r=run([locality('a'),locality('b',{offices:[]})]);
 assert.equal(r.items[0].status,'shared_locality_reference');
 assert.deepEqual(r.items[0].saved_locality_ids,['a','b']);
});

test('saved locality in wrong state does not become an office match',()=>{
 const r=run([locality('l',{state:'KY'})]);
 assert.equal(r.items[0].status,'locality_state_conflict');
});

test('revocation supersedes prior verification and never creates a missing-copy task',()=>{
 const r=run([], [profile('p','OH',{status:'complete',committed_sequence:2})], [
  event(),event({id:'revoked',action:'revoke',sequence:2})]);
 assert.equal(r.states.OH.revoked,1);
 assert.equal(r.states.OH.no_saved_locality,0);
 assert.equal(r.items.length,0);
});

test('superseded verify is not separately treated as a missing-copy task',()=>{
 const r=run([], [profile('p','OH',{status:'complete',committed_sequence:2})], [
  event(),event({id:'replacement',sequence:2})]);
 assert.equal(r.states.OH.relation_histories,1);
 assert.equal(r.states.OH.no_saved_locality,1);
 assert.equal(r.items[0].review_id,'replacement');
});

test('independent covered areas retain distinct relation histories',()=>{
 const r=run([], [profile('p','OH',{status:'complete',committed_sequence:2})], [
  event(),event({id:'other-area',sequence:2,relation_key:'area-two',coverage_area:'Other quoted area'})]);
 assert.equal(r.states.OH.relation_histories,2);
 assert.equal(r.states.OH.no_saved_locality,2);
});

test('uncertain reservation and future event sequences are never treated as committed',()=>{
 for(const receipt of [{status:'creating',committed_sequence:1},{status:'uncertain',committed_sequence:1},{status:'complete',committed_sequence:0}]) {
  const r=run(undefined,[profile('p','OH',receipt)]);
  assert.equal(r.items[0].status,'uncommitted_or_uncertain');
 }
 const r=run(undefined,undefined,[event(),event({id:'future',sequence:2,action:'revoke'})]);
 assert.equal(r.items[0].status,'uncommitted_or_uncertain');
});

test('conflicting equal-sequence current events must be reviewed, not resolved automatically',()=>{
 const r=run(undefined,undefined,[event(),event({id:'conflict',action:'revoke'})]);
 assert.equal(r.items[0].status,'ambiguous_history');
});

test('unrecognized roles or conflicting profile/office proof cannot certify even a saved-copy reference',()=>{
 for (const patch of [
  {role:'unknown'}, {office_snapshot:{government_office_id:''}},
  {profile_snapshot:{id:'other',state:'OH'}},{profile_snapshot:{id:'p',state:'KY'}},
  {responsibility_confirmed:false},{address_authority_resolved:true},
  {coverage_area:''},{relation_key:''}
 ]) {
  const r=run(undefined,undefined,[event(patch)]);
  assert.equal(r.items[0].status,'invalid_review_identity',JSON.stringify(patch));
 }
});

test('missing readable profile reports bounded uncertainty instead of guessing same-name link',()=>{
 const r=run([locality('l')],[],[event()]);
 assert.equal(r.items[0].status,'target_profile_unavailable');
 assert.equal(r.items[0].profile_id,'p');
});

test('Ohio-first list and ignored out-of-scope events',()=>{
 const r=run([],[profile('p'),profile('ky','KY'),profile('tn','TN')],[
  event({id:'k',jurisdiction_id:'ky',profile_snapshot:{id:'ky',state:'KY'}}),
  event({id:'out',jurisdiction_id:'tn',profile_snapshot:{id:'tn',state:'TN'}}),
  event({id:'o'})
 ]);
 assert.deepEqual(r.items.map(item=>item.state),['OH','KY']);
 assert.deepEqual(r.excluded_event_ids,['out']);
});

test('invalid or duplicate identities and malformed office collections stop the audit',()=>{
 assert.throws(()=>run(null),/Invalid/);
 assert.throws(()=>run([locality('a'),locality('a')]),/duplicate/);
 assert.throws(()=>run(undefined,[profile(),profile()]),/duplicate/);
 assert.throws(()=>run(undefined,undefined,[event(),event()]),/duplicate/);
 assert.throws(()=>run([locality('a',{offices:{bad:true}})]),/Malformed/);
});

test('6,000 distinct verified review references remain uncapped and inputs unchanged',()=>{
 const profiles=Array.from({length:6000},(_,i)=>profile('profile-'+i));
 const saved=Array.from({length:6000},(_,i)=>locality('locality-'+i,{jurisdiction_profile_id:'profile-'+i}));
 const reviews=Array.from({length:6000},(_,i)=>event({id:'review-'+i,jurisdiction_id:'profile-'+i,
   profile_snapshot:{id:'profile-'+i,state:'OH',name:'Pilot City'},relation_key:'area-'+i}));
 const before=JSON.stringify([profiles,saved,reviews]);
 const r=run(saved,profiles,reviews);
 assert.equal(r.states.OH.relation_histories,6000);
 assert.equal(r.states.OH.saved_copy_reference_only,6000);
 assert.equal(r.items.length,0);
 assert.equal(JSON.stringify([profiles,saved,reviews]),before);
});
