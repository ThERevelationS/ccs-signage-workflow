import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {textSha256,assembledSourceText} from '../base44/shared/jurisdictionSourcePdfText.mjs';
import {reviewSourceAuthority} from '../base44/shared/permittingSourceAuthorityReview.mjs';
import {canonicalAuthorityOffice,reviewOfficeAuthority,assessOfficeAuthorityReview} from '../base44/shared/permittingOfficeAuthority.mjs';
import {verifyPdfOfficeDelegation,explicitElectricalDelegation} from '../base44/shared/permittingPdfOfficeDelegation.mjs';
const clone=structuredClone;
async function setup(){
 const f=await ruleFixture({source:{authority_classification:'administrative_guidance',verification_status:'needs_verification'}});
 const text='Pilot Permit Center\nCity of Pilot\nElectrical inspections are performed by Regional Agency.\nElectrical permits are issued by Regional Agency.';
 const page={...f.page,text,text_sha256:await textSha256(new TextEncoder().encode(text))};
 f.patchSource({extracted_pages:[page],extracted_text:assembledSourceText(f.source(),[page]),jurisdiction_profile_doc_id:'doc'});
 let profile={id:'profile',name:'Pilot',state:'OH',type:'city',updated_date:'p1',website_url:'https://gov.test/',
  documents:[{id:'doc',url:f.source().official_url,file_url:f.source().archived_file_url,
   source_sha256:f.source().file_hash_sha256,stored_sha256:f.source().file_hash_sha256,source_bytes:100,stored_bytes:100}]};
 const offices=['Pilot Permit Center','Regional Agency'].map((name,i)=>({id:'catalog'+i,government_office_id:'office'+i,
  government_office:{name,state:'OH',verification_status:'staff_verified',verified_by:'Reviewer',verified_at:'2026-10-04T18:00:00Z',source_url:'https://gov.test/office'+i}}));
 const settingsEntity={filter:async()=>[{setting_value:{items:clone(offices)}}]};
 let writes=0;const events=[];
 const profileEntity={get:async()=>clone(profile),updateMany:async(q,p)=>{
  if(q.updated_date!==profile.updated_date)return{updated:0};
  profile={...profile,...clone(p.$set),updated_date:'p'+(++writes+1)};return{updated:1};
 }};
 await reviewSourceAuthority({sourceEntity:f.api.sourceEntity,segmentEntity:f.api.segmentEntity,profileEntity,settingsEntity,auditEntity:f.api.runEntity,
  sourceDocumentId:'source',requestId:'source-scope-review-00001',actor:'Admin',expectedUpdatedDate:f.source().updated_date,
  input:{publisher_name:'Pilot Permit Center',government_office_id:'office0',scope_kind:'named_jurisdiction',named_areas:['Pilot'],
   publisher_proof:{physical_page:1,excerpt:'Pilot Permit Center'},scope_proof:{physical_page:1,excerpt:'City of Pilot'},
   current_source_confirmed:true,current_evidence_url:'https://gov.test/forms',current_evidence_reference:'Current forms listing',review_notes:'Reviewed current municipal source.'}});
 const reviewEntity={filter:async q=>clone(events.filter(e=>Object.entries(q).every(([k,v])=>e[k]===v))),
  create:async e=>{const row={...clone(e),id:'event'+events.length};events.push(row);return clone(row);}};
 const deps={sourceEntity:f.api.sourceEntity,segmentEntity:f.api.segmentEntity,profileEntity,settingsEntity,reviewEntity};
 const input={evidence_kind:'pdf_delegation',source_document_id:'source',government_office_id:'office1',
  role:'electrical_inspection',coverage_area:'Pilot',responsibility_confirmed:true,review_notes:'Reviewed explicit delegated inspection role.',
  role_proof:{physical_page:1,excerpt:'Electrical inspections are performed by Regional Agency.'}};
 return {f,deps,input,offices,events,profile:()=>profile,writes:()=>writes};
}
test('delegation records distinct publisher and responsible office through existing ledger',async()=>{
 const s=await setup();
 const preview=await reviewOfficeAuthority(s.deps,{jurisdictionId:'profile',input:s.input,dryRun:true,actor:'Admin',action:'verify'});
 assert.equal(s.writes(),0);assert.equal(preview.proposal.publisher_snapshot.government_office_id,'office0');
 assert.equal(preview.proposal.office_snapshot.government_office_id,'office1');
 const saved=await reviewOfficeAuthority(s.deps,{jurisdictionId:'profile',input:s.input,actor:'Admin',action:'verify',
  requestId:'delegation-review-000001',expectedUpdatedDate:s.profile().updated_date});
 assert.equal(saved.status,'recorded');assert.equal(s.events.length,1);
 assert.equal((await assessOfficeAuthorityReview(s.deps,saved.review,s.profile())).verified,true);
 s.offices[0].government_office.source_url='https://gov.test/replaced';
 assert.equal((await assessOfficeAuthorityReview(s.deps,saved.review,s.profile())).verified,false);
});
test('issuer and inspection clauses remain separate; contact and negated text fail',()=>{
 assert.equal(explicitElectricalDelegation('electrical_permit','Electrical permits are issued by Regional Agency.','Regional Agency'),true);
 assert.equal(explicitElectricalDelegation('electrical_inspection','Electrical inspections are performed by Regional Agency.','Regional Agency'),true);
 for(const quote of ['Contact Regional Agency for electrical inspections.','Electrical inspections are not performed by Regional Agency.',
  'Electrical inspections are performed by Other Agency.','Electrical permits are issued by Regional Agency.'])
  assert.equal(explicitElectricalDelegation('electrical_inspection',quote,'Regional Agency'),false);
});
test('unreviewed identities, wrong state/scope, changed archive and inexact quote are blocked without writes',async()=>{
 for(const mutate of [
  s=>s.offices[1].government_office.verification_status='needs_verification',
  s=>s.offices[0].government_office.verification_status='needs_verification',
  s=>s.offices[1].government_office.state='KY',
  s=>s.input.coverage_area='Other',
  s=>s.profile().documents[0].stored_sha256='b'.repeat(64),
  s=>s.input.role_proof.excerpt='Electrical inspections are performed by Other Agency.',
  s=>s.input.government_office_id='office0',
  s=>s.f.patchSource({authority_review:null}),
  s=>s.profile().website_url='https://other.test/']){
  const s=await setup();mutate(s);
  await assert.rejects(verifyPdfOfficeDelegation(s.deps,s.profile(),s.input,canonicalAuthorityOffice));
  assert.equal(s.writes(),0);assert.equal(s.events.length,0);
 }
});
test('delegation role proof detects OCR/truncation and changed responsible identity',async()=>{
 for(const mutate of [
  s=>s.f.patchSource({extracted_pages:[{...s.f.source().extracted_pages[0],needs_ocr_review:true}]}),
  s=>s.offices[1].government_office.name='Another Agency',
  s=>s.input.role='electrical']){
  const s=await setup();mutate(s);
  await assert.rejects(verifyPdfOfficeDelegation(s.deps,s.profile(),s.input,canonicalAuthorityOffice));
 }
});
test('permit issuance preview records only issuer role and no inspection approval',async()=>{
 const s=await setup();s.input.role='electrical_permit';
 s.input.role_proof.excerpt='Electrical permits are issued by Regional Agency.';
 const p=await reviewOfficeAuthority(s.deps,{jurisdictionId:'profile',input:s.input,dryRun:true,action:'verify',actor:'Admin'});
 assert.equal(p.proposal.role,'electrical_permit');assert.equal(s.events.length,0);
});
test('responsible identity replacement after reservation releases without creating an event',async()=>{
 const s=await setup(),write=s.deps.profileEntity.updateMany;
 s.deps.profileEntity.updateMany=async(q,p)=>{
  const result=await write(q,p);
  if(p.$set.office_authority_review_state.status==='creating')s.offices[1].government_office.name='Changed Agency';
  return result;
 };
 const result=await reviewOfficeAuthority(s.deps,{jurisdictionId:'profile',input:s.input,actor:'Admin',action:'verify',
  requestId:'delegation-review-000002',expectedUpdatedDate:s.profile().updated_date});
 assert.equal(result.status,'not_recorded');assert.equal(result.retry_safe,true);assert.equal(s.events.length,0);
});
test('compiled delegation context offers only separately verified same-state responsible offices',async()=>{
 const {build}=await import('esbuild');
 let handler;globalThis.Deno={serve:fn=>{handler=fn;}};
 const b=await build({entryPoints:['base44/functions/permittingOfficeAuthorityReview/entry.ts'],bundle:true,write:false,
  format:'esm',platform:'neutral',plugins:[{name:'sdk',setup(build){
   build.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
   build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.pdfDelegationClient;',loader:'js'}));
  }}]});
 await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 const s=await setup();s.deps.profileEntity.filter=async()=>[];
 globalThis.pdfDelegationClient={auth:{me:async()=>({role:'admin',email:'admin@test'})},asServiceRole:{entities:{
  JurisdictionProfile:s.deps.profileEntity,PermittingSourceDocument:s.deps.sourceEntity,GlobalSettings:s.deps.settingsEntity,
  PermittingSourceTextSegment:s.deps.segmentEntity,PermittingOfficeAuthorityReview:s.deps.reviewEntity}}};
 const request=()=>new Request('https://test/',{method:'POST',body:JSON.stringify({action:'context',evidence_kind:'pdf_delegation',source_document_id:'source'})});
 let result=await (await handler(request())).json();
 assert.deepEqual(result.offices.map(o=>o.id),['office1']);
 s.offices[1].government_office.verification_status='needs_verification';
 result=await (await handler(request())).json();assert.deepEqual(result.offices,[]);
 assert.equal(s.writes(),0);assert.equal(s.events.length,0);
});
