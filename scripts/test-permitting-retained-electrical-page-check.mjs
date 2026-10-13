import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {sourceAuthoritySnapshot} from '../base44/shared/permittingRuleEvidence.mjs';
import {textSha256,PDF_TEXT_METHOD,assembledSourceText} from '../base44/shared/jurisdictionSourcePdfText.mjs';
import {SOURCE_TEXT_SEGMENT_MODE} from '../base44/shared/jurisdictionSourceTextSegments.mjs';
import {reconcileRecordedElectricalEvidence} from '../src/components/permitting/permittingElectricalSourceAudit.mjs';
import {checkRetainedElectricalPage} from '../src/components/permitting/permittingRetainedElectricalPageCheck.mjs';

const clone=structuredClone, sha=async text=>textSha256(new TextEncoder().encode(text));
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
async function fixture(role='electrical_permit') {
  const f=await ruleFixture();
  const excerpt=role==='electrical_permit'?'Electrical permits are issued by Pilot Permit Center.':
    'Electrical inspections are performed by Pilot Inspector.';
  const text='Chapter 34, Pilot City. '+excerpt+' Current adopted text.';
  const page={...f.page,text,text_sha256:await sha(text)};
  const review={status:'active',review_id:'scope-1',scope_kind:'named_jurisdiction',named_areas:['Pilot']};
  f.patchSource({extracted_pages:[page],extracted_text:assembledSourceText(f.source(),[page]),authority_review:review});
  const source=f.source(),profile={id:'profile',state:'OH',name:'Pilot',type:'city',
    office_authority_review_state:{status:'complete',committed_sequence:1}};
  const event={id:'review-1',method:'office-authority-v1',action:'verify',
    jurisdiction_id:'profile',sequence:1,relation_key:'relationship',role,
    profile_snapshot:{id:'profile',state:'OH'},office_snapshot:{government_office_id:'office-1',name:'Pilot Permit Center'},
    source_document_id:'source',source_review_id:'scope-1',source_snapshot:sourceAuthoritySnapshot(source),
    coverage_area:'Pilot',coverage_kind:'named_jurisdiction',coverage_basis:'same_profile_scope',
    responsibility_confirmed:true,address_authority_resolved:false,
    role_proof:{physical_page:1,text_sha256:page.text_sha256,excerpt}};
  let history=[event],calls=[];
  const api={entities:{
    PermittingOfficeAuthorityReview:{filter:async(query,options)=>{
      calls.push({name:'history',query,options});return{items:clone(history),has_more:false};
    }},
    JurisdictionProfile:{get:async id=>{calls.push({name:'profile',id});return clone(profile);}},
    PermittingSourceDocument:{get:async id=>{calls.push({name:'source',id});return clone(source);}},
    PermittingSourceTextSegment:{filter:async()=>{throw Error('Unnecessary segment read');}}
  }};
  const candidate=()=>reconcileRecordedElectricalEvidence([profile],history,[source]).retained_page_candidates[0];
  return {source,profile,event,api,candidate,calls,setHistory:v=>{history=v},page,excerpt};
}
test('one explicitly selected issuer citation matches cryptographically validated retained physical page, not authority',async()=>{
 const f=await fixture();
 assert.equal(f.candidate().review_id,'review-1');
 const result=await checkRetainedElectricalPage(f.api,f.candidate());
 assert.equal(result.status,'retained_quote_matches');assert.equal(result.physical_page,1);
 assert.equal(result.text_sha256,f.page.text_sha256);
 assert.deepEqual([result.profile_state,result.profile_name,result.profile_type,result.profile_id],['OH','Pilot','city','profile']);
 assert.deepEqual([result.recorded_office_name,result.canonical_office_id],['Pilot Permit Center','office-1']);
 assert.deepEqual([result.recorded_coverage_area,result.recorded_coverage_kind,result.recorded_coverage_basis,result.source_review_id],['Pilot','named_jurisdiction','same_profile_scope','scope-1']);
 assert.equal(result.recorded_quote,f.excerpt);
 assert.equal(result.address_authority_verified,false);assert.equal(result.current_official_source_verified,false);
 assert.deepEqual(f.calls.map(c=>c.name),['history','profile','source']);
 assert.deepEqual(f.calls[0].query,{jurisdiction_id:'profile',relation_key:'relationship',method:'office-authority-v1'});
 assert.equal(f.calls[0].options.limit,50);
});
test('inspection citation is separate and must match inspection text on its own page',async()=>{
 const f=await fixture('electrical_inspection');
 const result=await checkRetainedElectricalPage(f.api,f.candidate());
 assert.equal(result.role,'electrical_inspection');
});
test('quoted phrase absent from retained page is rejected with no authority finding',async()=>{
 const f=await fixture();
 const original=f.candidate();
 f.event.role_proof.excerpt='Electrical permits are issued by Another Office.';
 f.setHistory([f.event]);
 await assert.rejects(checkRetainedElectricalPage(f.api,original),/quote or page text hash differs/);
});
test('changed physical page text checksum fails shared retained-page hash validation',async()=>{
 const f=await fixture();
 f.source.extracted_pages[0].text_sha256='c'.repeat(64);
 await assert.rejects(checkRetainedElectricalPage(f.api,f.candidate()),/provenance or text hash differs/);
});
test('retained page marked truncated or needing OCR remains unavailable for verification',async()=>{
 for(const flag of ['truncated','needs_ocr_review']){
   const f=await fixture();f.source.extracted_pages[0][flag]=true;
   await assert.rejects(checkRetainedElectricalPage(f.api,f.candidate()),/OCR or truncation/);
 }
});
test('source snapshot changed, uncertain receipt or latest revocation blocks page reads',async()=>{
 const changed=await fixture(),changedCandidate=changed.candidate();changed.source.verification_status='needs_verification';
 await assert.rejects(checkRetainedElectricalPage(changed.api,changedCandidate),/Current recorded relationship/);
 const pending=await fixture();const candidate=pending.candidate();
 pending.profile.office_authority_review_state.status='uncertain';
 await assert.rejects(checkRetainedElectricalPage(pending.api,candidate),/Current recorded relationship/);
 const revoked=await fixture();const before=revoked.candidate();
 revoked.profile.office_authority_review_state.committed_sequence=2;
 revoked.setHistory([revoked.event,{...revoked.event,id:'revoke',sequence:2,action:'revoke'}]);
 await assert.rejects(checkRetainedElectricalPage(revoked.api,before),/Current recorded relationship/);
});
test('candidate role, profile, relation or review ID cannot be switched by name',async()=>{
 const f=await fixture();const base=f.candidate();
 for(const patch of [{role:'electrical_inspection'},{jurisdiction_profile_id:'other'},
  {relation_key:'other'},{review_id:'other'},{physical_page:2}]){
  await assert.rejects(checkRetainedElectricalPage(f.api,{...base,...patch}),/Current recorded relationship|not readable|changed|unavailable/);
 }
});
test('missing or malformed scoped pages and duplicate event identities fail closed',async()=>{
 const f=await fixture(),candidate=f.candidate();
 f.setHistory([f.event,f.event]);
 await assert.rejects(checkRetainedElectricalPage(f.api,candidate),/repeated during pagination/);
 const g=await fixture();
 g.source.text_extraction_state.pages_extracted=0;
 await assert.rejects(checkRetainedElectricalPage(g.api,g.candidate()),/cursor requires review/);
});
test('session change before or during a remote read suppresses stale result',async()=>{
 const f=await fixture(),candidate=f.candidate();
 await assert.rejects(checkRetainedElectricalPage(f.api,candidate,()=>false),/superseded/);
 let live=true;f.api.entities.JurisdictionProfile.get=async()=>{live=false;return clone(f.profile)};
 await assert.rejects(checkRetainedElectricalPage(f.api,candidate,()=>live),/superseded/);
});
test('committed segmented physical page checks the exact segment registration and page hash',async()=>{
 const f=await fixture();const second='Electrical permits are issued by Pilot Permit Center. Segment page two.';
 const page2={...f.page,page:2,text:second,text_sha256:await sha(second)};
 const source=f.source,reg=[SOURCE_TEXT_SEGMENT_MODE,source.id,source.file_hash_sha256,PDF_TEXT_METHOD,2].join(':');
 const data={registration_key:reg,source_document_id:source.id,source_sha256:source.file_hash_sha256,
  archived_file_url:source.archived_file_url,file_bytes:source.file_bytes,method:PDF_TEXT_METHOD,
  page_start:2,page_end:2,total_pages:2,pages:[page2]};
 const payload=await sha(JSON.stringify(canon(data))),segment={...data,id:'segment-1',payload_sha256:payload};
 source.text_extraction_state={...source.text_extraction_state,storage_mode:SOURCE_TEXT_SEGMENT_MODE,
  inline_page_count:1,segment_count:1,pages_extracted:2,total_pages:2,next_page:3,
  last_segment:{id:segment.id,registration_key:reg,payload_sha256:payload,page_start:2,page_end:2,total_pages:2}};
 f.event.role_proof={physical_page:2,text_sha256:page2.text_sha256,excerpt:'Electrical permits are issued by Pilot Permit Center.'};
 f.setHistory([f.event]);f.api.entities.PermittingSourceTextSegment.filter=async(query,options)=>{
  assert.equal(query.source_document_id,'source');assert.equal(query.page_start.$lte,2);
  assert.equal(options.limit,6);return{items:[clone(segment)],has_more:false};
 };
 const pageCandidate={...f.candidate(),physical_page:2};
 const result=await checkRetainedElectricalPage(f.api,pageCandidate);
 assert.equal(result.status,'retained_quote_matches');assert.equal(result.physical_page,2);
});
