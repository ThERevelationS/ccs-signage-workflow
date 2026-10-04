import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {textSha256,assembledSourceText} from '../base44/shared/jurisdictionSourcePdfText.mjs';
import {reviewSourceAuthority} from '../base44/shared/permittingSourceAuthorityReview.mjs';
import {reviewedAdministrativeSource,sourceSupportsRule,assertSourceScopeReviewEvidence} from '../base44/shared/permittingSourceAuthorityPolicy.mjs';
import {loadRuleEvidence,prepareRuleCandidate,verifyRuleForApproval} from '../base44/shared/permittingRuleEvidence.mjs';
import {invalidateSourceRules} from '../base44/shared/permittingSourceRuleInvalidation.mjs';
async function setup(options={}){
 const f=await ruleFixture({source:{authority_classification:'application_form',content_status:'unknown',verification_status:'needs_verification'},createRun:options.createAudit || 'ok'});
 const text='Pilot Planning Department\nServing unincorporated Pilot.\nSubmit two drawings with the application.\nApplication fee: $50.\nMaximum area is 50 square feet.';
 const page={...f.page,text,text_sha256:await textSha256(new TextEncoder().encode(text))};
 f.patchSource({extracted_pages:[page],extracted_text:assembledSourceText(f.source(),[page])});
 const profile={id:'profile',name:'Pilot',state:'OH',type:'county'};
 const input={publisher_name:'Pilot Planning Department',scope_kind:'unincorporated',named_areas:['unincorporated Pilot'],
  publisher_proof:{physical_page:1,excerpt:'Pilot Planning Department'},
  scope_proof:{physical_page:1,excerpt:'Serving unincorporated Pilot.'},
  current_source_confirmed:true,current_evidence_url:'https://gov.test/forms',current_evidence_reference:'Official current forms index',
  review_notes:'Staff checked current office forms and the explicitly named unincorporated service area.'};
 const settings={setting_value:{items:[{id:'catalogOffice',government_office_id:'canonicalOffice',government_office:{
  name:'Pilot Planning Department',verification_status:'staff_verified',source_url:'https://gov.test/office'}}]}};
 const api={sourceEntity:f.api.sourceEntity,segmentEntity:f.api.segmentEntity,
  profileEntity:{get:async()=>structuredClone(profile)},settingsEntity:{filter:async()=>[structuredClone(settings)]},
  auditEntity:f.api.runEntity,sourceDocumentId:'source',input,action:'verify',requestId:'source-review-request-00001',
  expectedUpdatedDate:f.source().updated_date,actor:'admin@example.test',now:f.api.now};
 const candidate=async(raw={})=>prepareRuleCandidate(await loadRuleEvidence({...api,startPage:1,pageCount:1}),
  {physical_page:1,rule_category:'submittal_requirement',excerpt:'Submit two drawings with the application.',
   requirement:'Submit two drawings with the application.',confidence:'high',...raw},{extractionDate:'2026-10-04T20:00:00Z'});
 return{f,api,input,profile,page,settings,candidate};
}
test('administrative preview validates office/scope with zero writes or credits',async()=>{
 const t=await setup(),before=structuredClone(t.f.source()),result=await reviewSourceAuthority({...t.api,dryRun:true});
 assert.equal(result.dry_run,true);assert.equal(result.proposal.authority_review.destination_authority_resolved,false);
 assert.deepEqual(t.f.source(),before);assert.equal(t.f.calls.runCreates,0);assert.equal(t.f.calls.llm,0);
});
test('review binds exact source/page/profile/publisher/scope and retains archive/text/classification',async()=>{
 const t=await setup(),before=structuredClone(t.f.source()),result=await reviewSourceAuthority(t.api);
 assert.equal(result.status,'applied');assert.equal(t.f.calls.runCreates,1);assert.equal(reviewedAdministrativeSource(t.f.source()),true);
 for(const key of ['archived_file_url','file_hash_sha256','file_bytes','extracted_text','extracted_pages','authority_classification','notes_gaps'])
  assert.deepEqual(t.f.source()[key],before[key]);
 assert.equal((await reviewSourceAuthority(t.api)).replayed,true);assert.equal(t.f.calls.runCreates,1);assert.equal(t.f.calls.llm,0);
});
test('missing current-source confirmation, invented office/scope and blanket county coverage cannot verify',async()=>{
 for(const patch of [{current_source_confirmed:false},{publisher_name:'Invented Office'},{named_areas:['All cities']},
  {scope_kind:'named_jurisdiction',named_areas:['Pilot']},{scope_kind:'unincorporated',named_areas:['Pilot']},
  {current_evidence_url:'javascript:unsafe'},{current_evidence_reference:''},{review_notes:''},
  {scope_proof:{physical_page:1,excerpt:'Invented county jurisdiction coverage'}}]){
  const t=await setup();await assert.rejects(reviewSourceAuthority({...t.api,input:{...t.input,...patch}}));
  assert.equal(t.f.calls.sourceWrites,0);assert.equal(t.f.calls.runCreates,0);
 }
});
test('adopted-code and draft/historical source promotions remain blocked by administrative review',async()=>{
 for(const patch of [{authority_classification:'current_adopted'},{content_status:'draft'},{content_status:'proposed'},
  {content_status:'historical'},{content_status:'superseded'},{superseded_by:'replacement'}]){
  const t=await setup();t.f.patchSource(patch);await assert.rejects(reviewSourceAuthority({...t.api,expectedUpdatedDate:t.f.source().updated_date}));
  assert.equal(t.f.calls.sourceWrites,0);assert.equal(t.f.source().authority_classification,patch.authority_classification || 'application_form');
 }
});
test('canonical profile mismatch, state mismatch and missing identity block source verification',async()=>{
 for(const patch of [{name:'Different county'},{state:'IN'},{id:'wrong'}]){
  const t=await setup();Object.assign(t.profile,patch);await assert.rejects(reviewSourceAuthority(t.api));assert.equal(t.f.calls.runCreates,0);
 }
 const t=await setup();t.f.patchSource({jurisdiction_id:null});
 await assert.rejects(reviewSourceAuthority({...t.api,expectedUpdatedDate:t.f.source().updated_date}),/canonical/);
});
test('unknown audit creates never repeat; an exact delayed audit can reconcile',async()=>{
 const t=await setup({createAudit:'missing'});
 assert.equal((await reviewSourceAuthority(t.api)).status,'review_uncertain');
 assert.equal(t.f.source().verification_status,'needs_verification');assert.equal(t.f.calls.runCreates,1);
 assert.equal((await reviewSourceAuthority(t.api)).status,'review_uncertain');assert.equal(t.f.calls.runCreates,1);
 await assert.rejects(reviewSourceAuthority({...t.api,requestId:'source-review-request-00002',expectedUpdatedDate:t.f.source().updated_date}),/Reconcile/);
 t.f.lateRun();assert.equal((await reviewSourceAuthority(t.api)).status,'applied');assert.equal(t.f.calls.runCreates,1);
});
test('lost audit/source acknowledgements converge without extra audits or replaced text',async()=>{
 const t=await setup({createAudit:'lost'});t.f.loseSource();
 assert.equal((await reviewSourceAuthority(t.api)).status,'applied');assert.equal(t.f.calls.runCreates,1);
});
test('concurrent staff decisions cannot both reserve the source review',async()=>{
 const t=await setup();await Promise.allSettled([reviewSourceAuthority(t.api),
  reviewSourceAuthority({...t.api,requestId:'source-review-request-00002'})]);
 assert.equal(t.f.calls.runCreates,1);assert.equal(t.f.source().verification_status,'verified');
});
test('request id reuse with another decision/actor/source is rejected without altering review',async()=>{
 const t=await setup();await reviewSourceAuthority(t.api);const before=structuredClone(t.f.source());
 for(const args of [{actor:'other@example.test'},{input:{...t.input,review_notes:'A different review'}},{sourceDocumentId:'other'}])
  await assert.rejects(reviewSourceAuthority({...t.api,...args}));
 assert.deepEqual(t.f.source(),before);assert.equal(t.f.calls.runCreates,1);
});
test('active/uncertain extraction and imports block scope mutation instead of stranding their intent',async()=>{
 for(const patch of [{rule_import_state:{status:'uncertain'}},{rule_extraction_state:{status:'llm_uncertain'}},
  {rule_extraction_state:{status:'running'}}]){
  const t=await setup();t.f.patchSource(patch);await assert.rejects(reviewSourceAuthority({...t.api,expectedUpdatedDate:t.f.source().updated_date}),/Reconcile/);
  assert.equal(t.f.calls.runCreates,0);
 }
});
test('a stale preview version cannot overwrite another source edit',async()=>{
 const t=await setup();t.f.patchSource({reviewer:'Other reviewer'});
 await assert.rejects(reviewSourceAuthority(t.api),/Source changed/);assert.equal(t.f.source().reviewer,'Other reviewer');
});
test('source/authority edits while audit is created are preserved and not approved',async()=>{
 for(const patch of [{jurisdiction_scope:'Different staff scope'},{file_hash_sha256:'b'.repeat(64)},
  {extracted_pages:[{page:1,text:'changed',text_sha256:'b'.repeat(64)}]}]){
  const t=await setup(),create=t.api.auditEntity.create;
  t.api.auditEntity.create=async data=>{const result=await create(data);t.f.patchSource(patch);return result;};
  await assert.rejects(reviewSourceAuthority(t.api));
  assert.equal(t.f.source().verification_status,'needs_verification');for(const key of Object.keys(patch))assert.deepEqual(t.f.source()[key],patch[key]);
 }
});
test('unrelated concurrent archive HTTP metadata remains preserved after review',async()=>{
 const t=await setup(),create=t.api.auditEntity.create;t.api.auditEntity.create=async data=>{
  const result=await create(data);t.f.patchSource({http_outcome:'200'});return result;};
 assert.equal((await reviewSourceAuthority(t.api)).status,'applied');assert.equal(t.f.source().http_outcome,'200');
});
test('optional canonical publisher must be unique, verified, literal and remain current',async()=>{
 const t=await setup();t.api.input={...t.input,government_office_id:'canonicalOffice'};await reviewSourceAuthority(t.api);
 assert.equal(t.f.source().authority_review.office_reference.locality_authority_established,false);
 t.settings.setting_value.items[0].government_office.verification_status='needs_verification';
 await assert.rejects(assertSourceScopeReviewEvidence(t.f.source(),t.api),/office identity/);
 for(const variant of ['duplicate','wrong','unverified']){
  const p=await setup();if(variant==='duplicate')p.settings.setting_value.items.push(p.settings.setting_value.items[0]);
  if(variant==='wrong')p.settings.setting_value.items[0].government_office.name='Different Office';
  if(variant==='unverified')p.settings.setting_value.items[0].government_office.verification_status='needs_verification';
  await assert.rejects(reviewSourceAuthority({...p.api,input:{...p.input,government_office_id:'canonicalOffice'}}));
 }
});
test('administrative instructions require reviewed office/scope but never become regulatory evidence',async()=>{
 const t=await setup();assert.equal(sourceSupportsRule(t.f.source(),await t.candidate()),false);
 await reviewSourceAuthority(t.api);const c=await t.candidate();
 assert.equal(c.rule_kind,'administrative_instruction');assert.equal(c.is_operational,false);
 assert.equal((await verifyRuleForApproval(c,t.api)).length,1);
 assert.equal(sourceSupportsRule(t.f.source(),{...c,rule_kind:'regulatory_rule'}),false);
 for(const patch of [{rule_category:'dimensional'},{rule_category:'exemption'},{rule_category:'permit_applicability'},
  {rule_category:'illumination_electronic'},{rule_kind:'regulatory_rule'}])
  await assert.rejects(verifyRuleForApproval({...c,...patch},t.api));
 const dimension=await t.candidate({rule_category:'fee_timing',excerpt:'Maximum area is 50 square feet.',
  requirement:'Maximum area is 50 square feet.',numeric_literal:'50 square feet'});
 await assert.rejects(verifyRuleForApproval(dimension,t.api));
 const fee=await t.candidate({rule_category:'fee_timing',excerpt:'Application fee: $50.',requirement:'Application fee: $50.',numeric_literal:'$50'});
 assert.equal((await verifyRuleForApproval(fee,t.api)).length,1);
});
test('changed profile, page proof or source review id blocks instruction approval',async()=>{
 for(const change of ['profile','proof','id']){
  const t=await setup();await reviewSourceAuthority(t.api);const c=await t.candidate();
  if(change==='profile')t.profile.state='KY';
  if(change==='proof')t.f.patchSource({authority_review:{...t.f.source().authority_review,proofs:t.f.source().authority_review.proofs.map(p=>({...p,text_sha256:'b'.repeat(64)}))}});
  if(change==='id')t.f.patchSource({authority_review:{...t.f.source().authority_review,review_id:'different-review'}});
  await assert.rejects(verifyRuleForApproval(c,t.api));
 }
});
test('revocation retains source and immutable earlier review; old instruction requires re-review',async()=>{
 const t=await setup();await reviewSourceAuthority(t.api);const c=await t.candidate(),oldReview=t.f.source().authority_review;
 await reviewSourceAuthority({...t.api,action:'revoke',input:{},requestId:'source-review-request-00002',expectedUpdatedDate:t.f.source().updated_date});
 assert.equal(t.f.runs.length,2);assert.equal(t.f.runs[0].next_fields.authority_review.review_id,oldReview.review_id);
 assert.equal(t.f.source().authority_review.status,'revoked');assert.equal(t.f.source().authority_classification,'application_form');
 assert.equal(sourceSupportsRule(t.f.source(),c),false);await assert.rejects(verifyRuleForApproval(c,t.api));
});
test('new scoped reviews create distinct candidate identities and preserve prior evidence',async()=>{
 const t=await setup();await reviewSourceAuthority(t.api);const first=await t.candidate();
 await reviewSourceAuthority({...t.api,requestId:'source-review-request-00002',expectedUpdatedDate:t.f.source().updated_date});
 const second=await t.candidate();assert.notEqual(first.extraction_key,second.extraction_key);assert.equal(t.f.runs.length,2);
});
test('rule recheck validates instruction profile/scope even if source bytes are unchanged',async()=>{
 const t=await setup();await reviewSourceAuthority(t.api);const c=await t.candidate();
 t.f.rules.push({...c,id:'rule1',status:'staff_approved',is_workflow_instruction:true,is_operational:false,version:1,updated_date:'ruleVersion'});
 t.profile.state='KY';
 const rules={...t.f.api.ruleEntity,filter:async()=>structuredClone(t.f.rules)};
 const r=await invalidateSourceRules({...t.api,ruleEntity:rules,sourceDocumentId:'source'});
 assert.equal(r.rules_flagged,1);assert.equal(t.f.rules[0].is_workflow_instruction,false);assert.equal(t.f.rules[0].status,'needs_review');
});
