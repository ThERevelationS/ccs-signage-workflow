import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIdentityTypeCorrection as build, applyIdentityTypeCorrection as apply} from '../base44/shared/jurisdictionIdentityCorrection.mjs';
const fixture=()=>{
 const profile={id:'p1',name:'Norwood',state:'OH',type:'village',parent_county:'Hamilton',website_url:'https://norwoodohio.gov/',permitting_url:null,updated_date:'v1',documents:[{url:'archive.pdf'}],activity_log:[{id:'old',action:'created'}]};
 return {profile,expected:structuredClone(profile),newType:'city',actor:'admin@example.test',requestId:'correction_test_01',timestamp:'2026-10-07T00:00:00Z',
 evidence:{profile_id:'p1',state:'OH',new_type:'city',official_identity_reviewed:true,county_relationship_reviewed:true,reference_key:'incorporated_place:3957386',notes:'Official City of Norwood wording and county reference reviewed.',source_url:'https://norwoodohio.gov/',sha256:'a'.repeat(64),retrieved_at:'2026-10-06T23:58:00Z'}};
};
test('type and provenance commit together without mutating documents/history/identity',()=>{
 const input=fixture(), original=structuredClone(input.profile),next=build(input);
 assert.deepEqual(Object.keys(next),['type','activity_log']);assert.deepEqual(input.profile,original);
 assert.deepEqual(next.activity_log[0],original.activity_log[0]);assert.equal(next.activity_log[1].changes.authority_verified,false);
 assert.equal(next.activity_log[1].changes.before.type,'village');assert.equal(next.activity_log[1].changes.after.type,'city');
});
test('stale or incomplete expected identities fail',()=>{
 for(const key of ['updated_date','id','name','state','type','parent_county','website_url','permitting_url']){
  const x=fixture();delete x.expected[key];assert.throws(()=>build(x));
 }
 const x=fixture();x.profile.updated_date='v2';assert.throws(()=>build(x),/version/);
});
test('verification and every nonempty review receipt block without clearing them',()=>{
 for(const patch of [{verification_status:'verified'},{verified_by:'staff'},{verified_at:'2026-01-01'},
 {html_evidence_state:{status:'complete'}},{office_authority_review_state:{status:'uncertain'}},
 {rewrite_authority:{adoptionStatus:'verified'}},{rewrite_authority:{effectiveDateStatus:'verified'}}]){
  const x=fixture();Object.assign(x.profile,patch);assert.throws(()=>build(x),/reconciliation/);assert.deepEqual(Object.fromEntries(Object.keys(patch).map(k=>[k,x.profile[k]])),patch);
 }
});
test('evidence must bind target, state, type and reviewed county relationship',()=>{
 for(const patch of [{profile_id:'p2'},{state:'KY'},{new_type:'township'},{official_identity_reviewed:false},{county_relationship_reviewed:false},{sha256:'bad'},{source_url:'https://user:secret@example.test/'}]){
 const x=fixture();Object.assign(x.evidence,patch);assert.throws(()=>build(x));}
});
test('exact CAS preserves independent Cleves records and blocks raced writes',async()=>{
 const x=fixture();let writes=0;const entity={get:async()=>x.profile,updateMany:async(query,update)=>{writes++;assert.deepEqual(query,{id:'p1',updated_date:'v1'});assert.deepEqual(Object.keys(update.$set),['type','activity_log']);return {updated:0};}};
 await assert.rejects(()=>apply({entity,...x}),/did not confirm/);assert.equal(writes,1);assert.equal(x.profile.type,'village');
});
test('lost acknowledgement reconciles once with exact provenance, no second write',async()=>{
 const x=fixture();let saved=structuredClone(x.profile),writes=0;
 const entity={get:async()=>saved,updateMany:async(q,u)=>{writes++;saved={...saved,...u.$set,updated_date:'v2'};throw Error('timeout');}};
 assert.equal((await apply({entity,...x})).type,'city');assert.equal(writes,1);assert.deepEqual(saved.documents,x.profile.documents);
});
test('unknown outcome does not repeat; successful write verifies saved history',async()=>{
 const x=fixture();let writes=0;
 await assert.rejects(()=>apply({entity:{updateMany:async()=>{writes++;throw Error('timeout');},get:async()=>x.profile},...x}),/timeout/);assert.equal(writes,1);
 let saved;const entity={updateMany:async(q,u)=>{saved={...x.profile,...u.$set};return {updated:1};},get:async()=>saved};assert.equal((await apply({entity,...x})).type,'city');
});
