import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {textSha256,assembledSourceText} from '../base44/shared/jurisdictionSourcePdfText.mjs';
import {reviewSourceAuthority} from '../base44/shared/permittingSourceAuthorityReview.mjs';
import {reviewOfficeAuthority,assessOfficeAuthorityReview,listOfficeAuthorityReviews,getOfficeAuthorityRequest,OFFICE_AUTHORITY_ROLES} from '../base44/shared/permittingOfficeAuthority.mjs';
import {LOCALITY_AUTHORITY_ROLES} from '../src/components/permitting/localityAuthorityVerification.js';
const clone=v=>structuredClone(v);
const matches=(row,q)=>Object.entries(q).every(([k,v])=>{
 if(v && typeof v==='object')return (!Object.hasOwn(v,'$lte') || row[k]<=v.$lte) && (!Object.hasOwn(v,'$lt') || row[k]<v.$lt);
 return row[k]===v;
});
async function setup({createMode='ok'}={}){
 const f=await ruleFixture({source:{authority_classification:'application_form',content_status:'unknown',verification_status:'needs_verification'}});
 const text='Pilot Planning Department\nAreas served:\nunincorporated Pilot\nTown\nSign Permit Application\nBuilding permit applications are handled by Pilot Planning Department.\nElectrical permit applications are handled by Pilot Planning Department.\nContact our office for historic review.';
 const page={...f.page,text,text_sha256:await textSha256(new TextEncoder().encode(text))};
 f.patchSource({extracted_pages:[page],extracted_text:assembledSourceText(f.source(),[page])});
 const profiles={profile:{id:'profile',name:'Pilot',state:'OH',type:'county',updated_date:'p1',notes:'Keep manual notes',documents:[{id:'original'}]},
  town:{id:'town',name:'Town',state:'OH',type:'city',updated_date:'t1'}};
 const setting={setting_value:{items:[{id:'catalog',government_office_id:'office',government_office:{
  name:'Pilot Planning Department',verification_status:'staff_verified',verified_by:'Office reviewer',verified_at:'2026-10-04T18:00:00Z',
  source_url:'https://gov.test/office',phone:'555-0100'}}]}};
 const counts={profileWrites:0,creates:0,filters:0},events=[];let version=2,lostProfile=false,lateIntent,beforeWrite,beforeCreate;
 const profileEntity={get:async id=>{if(!profiles[id])throw Object.assign(Error('No profile'),{status:404});return clone(profiles[id]);},
  updateMany:async(q,p)=>{
   if(beforeWrite){const fn=beforeWrite;beforeWrite=null;await fn();}
   const row=profiles[q.id];if(!row || row.updated_date!==q.updated_date)return{updated:0};
   Object.assign(row,clone(p.$set),{updated_date:'p'+version++});counts.profileWrites++;
   if(lostProfile){lostProfile=false;throw Error('Lost profile acknowledgement');}return{updated:1};
  }};
 const settingsEntity={filter:async()=>[clone(setting)]};
 await reviewSourceAuthority({sourceEntity:f.api.sourceEntity,segmentEntity:f.api.segmentEntity,profileEntity,settingsEntity,auditEntity:f.api.runEntity,
  sourceDocumentId:'source',requestId:'source-scope-review-00001',actor:'Admin',expectedUpdatedDate:f.source().updated_date,
  input:{publisher_name:'Pilot Planning Department',scope_kind:'listed_areas',named_areas:['unincorporated Pilot','Town'],
   publisher_proof:{physical_page:1,excerpt:'Pilot Planning Department'},scope_proof:{physical_page:1,excerpt:'Areas served:\nunincorporated Pilot\nTown'},
   current_source_confirmed:true,current_evidence_url:'https://gov.test/forms',current_evidence_reference:'Current forms index',review_notes:'Confirmed current publisher and listed service area.'}});
 const reviewEntity={get:async id=>{const e=events.find(x=>x.id===id);if(!e)throw Object.assign(Error('No event'),{status:404});return clone(e);},
  filter:async(q,sort,limit,skip=0)=>{
   assert.equal(typeof sort,'string');assert.equal(Number.isInteger(limit),true);assert.equal(Number.isInteger(skip),true);counts.filters++;
   const rows=events.filter(e=>matches(e,q));
   if(sort==='-sequence')rows.sort((a,b)=>b.sequence-a.sequence);
   return clone(rows.slice(skip,skip+limit));
  },create:async e=>{
   counts.creates++;lateIntent=clone(e);if(beforeCreate)await beforeCreate();
   if(createMode==='missing')throw Error('Unknown create');
   const row={...clone(e),id:'review'+events.length};events.push(row);
   if(createMode==='lost')throw Error('Lost event acknowledgement');return clone(row);
  }};
 const deps={profileEntity,settingsEntity,reviewEntity,sourceEntity:f.api.sourceEntity,segmentEntity:f.api.segmentEntity};
 const input={source_document_id:'source',government_office_id:'office',role:'sign_permit',coverage_area:'unincorporated Pilot',
  role_proof:{physical_page:1,excerpt:'Sign Permit Application'},responsibility_confirmed:true,review_notes:'Staff confirmed this office handles sign applications for the quoted area.'};
 const args={jurisdictionId:'profile',requestId:'office-role-review-00001',expectedUpdatedDate:profiles.profile.updated_date,input,actor:'admin@example.test'};
 return{f,profiles,setting,counts,events,deps,input,args,page,review:extra=>reviewOfficeAuthority(deps,{...args,...extra}),
  patchProfile:(id,p)=>Object.assign(profiles[id],clone(p),{updated_date:'p'+version++}),
  loseProfile:()=>{lostProfile=true;},beforeWrite:fn=>{beforeWrite=fn;},beforeCreate:fn=>{beforeCreate=fn;},
  lateEvent:()=>events.push({...clone(lateIntent),id:'lateReview'})};
}
test('authority role vocabulary matches legacy locality/schema roles',()=>assert.deepEqual(OFFICE_AUTHORITY_ROLES,LOCALITY_AUTHORITY_ROLES.map(([role])=>role)));
test('preview checks explicit publisher/role/coverage with zero relationship writes or LLM',async()=>{
 const t=await setup(),before=clone(t.profiles);const r=await t.review({dryRun:true});
 assert.equal(r.proposal.coverage_kind,'unincorporated');assert.equal(r.proposal.address_authority_resolved,false);
 assert.deepEqual(t.profiles,before);assert.equal(t.counts.creates,0);assert.equal(t.counts.profileWrites,0);assert.equal(t.f.calls.llm,0);
});
test('save records one immutable review and preserves all profile documents/notes',async()=>{
 const t=await setup(),before=clone(t.profiles.profile),r=await t.review();
 assert.equal(r.status,'recorded');assert.equal(t.events.length,1);assert.equal(t.profiles.profile.office_authority_review_state.committed_sequence,1);
 assert.deepEqual(t.profiles.profile.documents,before.documents);assert.equal(t.profiles.profile.notes,before.notes);
 assert.equal((await t.review()).replayed,true);assert.equal(t.counts.creates,1);
 const rows=await listOfficeAuthorityReviews(t.deps,{jurisdictionId:'profile'});assert.equal(rows.items[0].verified,true);
 assert.equal(rows.address_authority_resolved,false);assert.equal(t.f.calls.llm,0);
});
test('county record cannot establish blanket county/city authority or unsupported roles',async()=>{
 for(const patch of [{coverage_area:'Pilot'},{coverage_area:'Town'},{role:'unknown'},{government_office_id:'wrong'},
  {responsibility_confirmed:false},{review_notes:''},{role:'building'},{role_proof:{physical_page:1,excerpt:'Invented sign permit responsibility'}}]){
  const t=await setup();await assert.rejects(t.review({input:{...t.input,...patch}}));assert.equal(t.counts.creates,0);assert.equal(t.counts.profileWrites,0);
 }
});
test('a county publisher can serve an explicitly named city without declaring countywide authority or parentage',async()=>{
 const t=await setup(),r=await t.review({jurisdictionId:'town',expectedUpdatedDate:t.profiles.town.updated_date,input:{...t.input,coverage_area:'Town'}});
 assert.equal(r.review.source_profile_id,'profile');assert.equal(r.review.profile_snapshot.id,'town');
 assert.equal(r.review.coverage_basis,'explicit_named_service_area');assert.equal(r.review.coverage_kind,'named_jurisdiction');
 assert.equal((await listOfficeAuthorityReviews(t.deps,{jurisdictionId:'town'})).items[0].verified,true);
});
test('cross-state, ambiguous canonical office and unverified identity are rejected',async()=>{
 for(const mode of ['state','duplicate','unverified','missing_review','bad_source_url']){
  const t=await setup();
  if(mode==='state')t.patchProfile('town',{state:'KY'});
  if(mode==='duplicate')t.setting.setting_value.items.push(clone(t.setting.setting_value.items[0]));
  if(mode==='unverified')t.setting.setting_value.items[0].government_office.verification_status='needs_verification';
  if(mode==='missing_review')t.f.patchSource({authority_review:null});
  if(mode==='bad_source_url')t.setting.setting_value.items[0].government_office.source_url='javascript:unsafe';
  await assert.rejects(t.review({jurisdictionId:'town',expectedUpdatedDate:t.profiles.town.updated_date,input:{...t.input,coverage_area:'Town'}}));
  assert.equal(t.counts.creates,0);
 }
});
test('same and different concurrent deliveries cannot create duplicate relationship events',async()=>{
 for(const same of [true,false]){
  const t=await setup();await Promise.allSettled([t.review(),t.review({requestId:same?t.args.requestId:'office-role-review-00002'})]);
  assert.equal(t.counts.creates,1);assert.equal(t.events.length,1);
 }
});
test('unknown event creates are not repeated; an exact delayed event can reconcile',async()=>{
 const t=await setup({createMode:'missing'});
 assert.equal((await t.review()).status,'review_uncertain');assert.equal((await t.review()).status,'review_uncertain');
 await assert.rejects(t.review({requestId:'office-role-review-00002',expectedUpdatedDate:t.profiles.profile.updated_date}),/pending/);
 assert.equal(t.counts.creates,1);assert.equal((await listOfficeAuthorityReviews(t.deps,{jurisdictionId:'profile'})).items.length,0);
 t.lateEvent();assert.equal((await t.review()).status,'recorded');assert.equal(t.counts.creates,1);
});
test('lost create and profile acknowledgements converge on the same event',async()=>{
 const t=await setup({createMode:'lost'});t.loseProfile();assert.equal((await t.review()).status,'recorded');
 assert.equal(t.counts.creates,1);assert.equal(t.events.length,1);
});
test('pending same-request status readback cannot take over an active reservation',async()=>{
 const t=await setup();t.beforeCreate(async()=>{
  const state=clone(t.profiles.profile.office_authority_review_state),writes=t.counts.profileWrites;
  assert.equal((await t.review()).status,'review_uncertain');assert.deepEqual(t.profiles.profile.office_authority_review_state,state);
  assert.equal(t.counts.profileWrites,writes);
 });
 assert.equal((await t.review()).status,'recorded');assert.equal(t.counts.creates,1);
});
test('a request cannot change decision or reviewer on replay',async()=>{
 const t=await setup();await t.review();
 for(const patch of [{actor:'someone@example.test'},{input:{...t.input,review_notes:'Different decision'}}])await assert.rejects(t.review(patch));
 assert.equal(t.counts.creates,1);
});
test('a stale preview preserves concurrent edits and cannot save',async()=>{
 const t=await setup();t.patchProfile('profile',{notes:'New staff notes'});
 await assert.rejects(t.review(),/changed/);assert.equal(t.profiles.profile.notes,'New staff notes');assert.equal(t.counts.creates,0);
});
test('source evidence changed after reservation is a known no-create outcome, safely released',async()=>{
 const t=await setup();t.beforeWrite(()=>t.f.patchSource({verification_status:'needs_verification'}));
 const r=await t.review();assert.equal(r.status,'not_recorded');assert.equal(r.retry_safe,true);assert.equal(t.counts.creates,0);
 assert.equal(t.profiles.profile.office_authority_review_state.committed_sequence,0);
 assert.equal(t.profiles.profile.office_authority_review_state.status,'not_recorded');
});
test('fresh reads withdraw verification after office, source, target identity or page evidence changes',async()=>{
 for(const mode of ['office','source','target','page','review']){
  const t=await setup();const saved=await t.review();
  if(mode==='office')t.setting.setting_value.items[0].government_office.phone='New contact';
  if(mode==='source')t.f.patchSource({file_hash_sha256:'b'.repeat(64)});
  if(mode==='target')t.patchProfile('profile',{name:'Different'});
  if(mode==='page')t.f.patchSource({extracted_pages:[{...t.page,text:'Changed'}]});
  if(mode==='review')t.f.patchSource({authority_review:{...t.f.source().authority_review,review_id:'new-scope-id'}});
  const assessment=await assessOfficeAuthorityReview(t.deps,saved.review,t.profiles.profile);
  assert.equal(assessment.verified,false,mode);assert.equal(t.events.length,1);
 }
});
test('revocation appends permanent history without changing source, previous review or unrelated roles',async()=>{
 const t=await setup();const first=await t.review(),before=clone(first.review),source=clone(t.f.source());
 const revoked=await t.review({action:'revoke',requestId:'office-revoke-review-00002',expectedUpdatedDate:t.profiles.profile.updated_date,
  input:{revoke_review_id:first.review.id,review_notes:'Responsibility requires re-verification.'}});
 assert.equal(revoked.review.action,'revoke');assert.equal(t.events.length,2);assert.deepEqual(t.events[0],before);
 assert.deepEqual(t.f.source(),source);const list=await listOfficeAuthorityReviews(t.deps,{jurisdictionId:'profile'});
 assert.deepEqual(list.items.map(x=>x.state),['revoked','historical']);
 await assert.rejects(t.review({action:'revoke',requestId:'office-revoke-review-00003',expectedUpdatedDate:t.profiles.profile.updated_date,
  input:{revoke_review_id:first.review.id,review_notes:'Old revocation target'}}),/no longer/);
});
test('read pagination is five events and excludes uncommitted future records',async()=>{
 const t=await setup(),seed=(await t.review()).review;
 t.events.splice(0,1);
 for(let n=1;n<=8;n++)t.events.push({...clone(seed),id:'event'+n,sequence:n,relation_key:seed.relation_key});
 t.profiles.profile.office_authority_review_state.committed_sequence=7;
 const first=await listOfficeAuthorityReviews(t.deps,{jurisdictionId:'profile'});assert.equal(first.items.length,5);
 assert.equal(first.items[0].id,'event7');assert.equal(first.has_more,true);assert.equal(first.next_cursor,'3');
 const next=await listOfficeAuthorityReviews(t.deps,{jurisdictionId:'profile',cursor:first.next_cursor});assert.equal(next.items.length,2);
 assert.equal(next.has_more,false);assert.equal(t.f.calls.llm,0);
});
test('request lookup is read-only and does not treat an uncommitted intent as verified authority',async()=>{
 const t=await setup({createMode:'missing'});await t.review();t.lateEvent();
 const before=clone(t.profiles),r=await getOfficeAuthorityRequest(t.deps,{jurisdictionId:'profile',requestId:t.args.requestId});
 assert.equal(r.committed,false);assert.deepEqual(t.profiles,before);assert.equal(t.counts.creates,1);
});
test('malformed stored review and invalid cursors fail closed',async()=>{
 const t=await setup();assert.equal((await assessOfficeAuthorityReview(t.deps,{action:'verify'},t.profiles.profile)).verified,false);
 await assert.rejects(listOfficeAuthorityReviews(t.deps,{jurisdictionId:'profile',cursor:'bad'}),/cursor/);
});
