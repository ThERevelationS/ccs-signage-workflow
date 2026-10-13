import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRecordedAuthorityReviewEvents as reconcile} from '../src/components/permitting/permittingReviewEventReconciliation.mjs';
const role = 'electrical_permit';
const profile=(id='p',receipt={committed_sequence:1,status:'complete'},state='OH')=>({id,name:'Example',state,office_authority_review_state:receipt});
const locality=(id='loc',roles=[role],settings={})=>({id,state:'OH',name:'Example',jurisdiction_profile_id:'p',
 offices:[{id:'local-office',name:'Office',government_office_id:'gov-1',authority_roles:roles,authority_verification_status:'staff_verified',...settings.office}],...settings.locality});
const event=(patch={})=>({id:'r1',method:'office-authority-v1',jurisdiction_id:'p',sequence:1,relation_key:'relation-a',role,action:'verify',
 office_snapshot:{government_office_id:'gov-1'},profile_snapshot:{id:'p',state:'OH'},
 source_document_id:'source-1',source_review_id:'source-review-1',coverage_area:'Example',
 requested_by:'Reviewer',responsibility_confirmed:true,address_authority_resolved:false,...patch});
const run=(l=[locality()],p=[profile()],e=[event()])=>reconcile(l,p,e);

test('exact committed event is a historical reference, not a verified authority',()=>{
 const r=run();assert.equal(r.states.OH.saved_verified_role_assignments,1);
 assert.equal(r.states.OH.recorded_event_reference,1);assert.equal(r.items.length,0);
 assert.equal(r.authority_verified,false);assert.equal(r.source_currentness_verified,false);
 assert.match(r.notice,/not fresh source verification/);
});
test('no event for exact profile/canonical office/role is unresolved, never inferred by names',()=>{
 for(const patch of [{office_snapshot:{government_office_id:'different'}},{role:'electrical_inspection'},{jurisdiction_id:'other'}]){
  const r=run(undefined,undefined,[event(patch)]);assert.equal(r.items[0].status,'no_exact_review');
 }
});
test('issuer and inspector require separate exact evidence; broad electrical remains excluded',()=>{
 const r=run([locality('loc',[role,'electrical_inspection','electrical'])]);
 assert.equal(r.states.OH.saved_verified_role_assignments,2);
 assert.equal(r.states.OH.recorded_event_reference,1);
 assert.deepEqual(r.items.map(x=>x.role),['electrical_inspection']);
});
test('uncommitted newer verify or revoke cannot be treated as a current review',()=>{
 const r=run(undefined,undefined,[event(),event({id:'r2',sequence:2,action:'revoke'})]);
 assert.equal(r.items[0].status,'event_uncommitted');
 assert.equal(r.states.OH.recorded_event_reference,0);
});
test('current revocation overrides earlier verification without deleting history',()=>{
 const r=run(undefined,[profile('p',{committed_sequence:2,status:'complete'})],
 [event(),event({id:'r2',sequence:2,action:'revoke',replaces_review_id:'r1'})]);
 assert.equal(r.items[0].status,'review_revoked');assert.equal(r.items[0].review_id,'r2');
});
test('latest replacement verify represents event history but does not verify current sources',()=>{
 const r=run(undefined,[profile('p',{committed_sequence:2,status:'complete'})],
 [event(),event({id:'r2',sequence:2})]);
 assert.equal(r.states.OH.recorded_event_reference,1);
});
test('ambiguous current events and scopes fail closed',()=>{
 const p=[profile('p',{committed_sequence:3,status:'complete'})];
 let r=run(undefined,p,[event(),event({id:'r2',sequence:1})]);
 assert.equal(r.items[0].status,'event_ambiguous');
 r=run(undefined,p,[event(),event({id:'r2',relation_key:'other-area',sequence:2,coverage_area:'Elsewhere'})]);
 assert.equal(r.items[0].status,'event_ambiguous');
});
test('corrupt committed record cannot become a positive reference',()=>{
 const bad=[{source_document_id:'',html_evidence_id:''},{address_authority_resolved:true},
   {profile_snapshot:{id:'not-p',state:'OH'}},{action:'garbled'},
   {requested_by:''},{source_review_id:''},{responsibility_confirmed:false}];
 for(const patch of bad){
  const r=run(undefined,undefined,[event(patch)]);
  assert.equal(r.items[0].status,'review_record_conflict',JSON.stringify(patch));
 }
});
test('official HTML review is possible without a PDF source id, still not freshly verified',()=>{
 const r=run(undefined,undefined,[event({source_document_id:'',source_review_id:'',evidence_kind:'official_html',html_evidence_id:'html-id'})]);
 assert.equal(r.states.OH.recorded_event_reference,1);
 assert.equal(r.authority_verified,false);
});
test('creating or uncertain profile reservation is not trusted',()=>{
 for(const status of ['creating','uncertain']){
  const r=run(undefined,[profile('p',{committed_sequence:1,status})]);assert.equal(r.items[0].status,'pending_receipt');
 }
});
test('missing and malformed identity fail closed without linking to namesakes',()=>{
 let r=run([locality('loc',undefined,{locality:{jurisdiction_profile_id:''}})]);
 assert.equal(r.items[0].status,'unresolved_link_or_office');
 r=run([locality('loc',undefined,{office:{government_office_id:''}})]);
 assert.equal(r.items[0].status,'unresolved_link_or_office');
 r=run(undefined,[profile('p',undefined,'KY')]);assert.equal(r.items[0].status,'unresolved_link_or_office');
});
test('non-Ohio/Kentucky records are not assigned inferred roles; Ohio listed first',()=>{
 const ky={...locality('ky'),state:'KY'};
 const oh={...locality('oh'),offices:[{...locality().offices[0],government_office_id:''}]};
 const r=run([ky,oh,{...locality('other'),state:'WV'}],[profile(),profile('other',undefined,'WV')],[]);
 assert.deepEqual(r.items.map(x=>x.locality_id),['oh','ky']);assert.equal(r.states.KY.saved_verified_role_assignments,1);
});
test('repeat event or profile/locality IDs and malformed office collection halt reconciliation',()=>{
 assert.throws(()=>run(undefined,undefined,[event(),event()]),/repeated/);
 assert.throws(()=>run(undefined,[profile(),profile()]),/duplicate/);
 assert.throws(()=>run([locality(),locality()]),/duplicate/);
 assert.throws(()=>run([{...locality(),offices:'not-array'}]),/Malformed/);
});
test('6,000 independently linked role assignments remain uncapped and unchanged',()=>{
 const p=Array.from({length:6000},(_,i)=>profile('p'+i,{committed_sequence:1,status:'complete'}));
 const l=Array.from({length:6000},(_,i)=>({...locality('loc'+i),jurisdiction_profile_id:'p'+i}));
 const e=Array.from({length:6000},(_,i)=>event({id:'event'+i,jurisdiction_id:'p'+i,profile_snapshot:{id:'p'+i,state:'OH'}}));
 const before=JSON.stringify([p,l,e]);const r=run(l,p,e);
 assert.equal(r.states.OH.recorded_event_reference,6000);assert.equal(r.items.length,0);
 assert.equal(JSON.stringify([p,l,e]),before);
});
