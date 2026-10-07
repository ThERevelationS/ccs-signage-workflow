import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {textSha256,assembledSourceText} from '../base44/shared/jurisdictionSourcePdfText.mjs';
import {verifyPublisherAliasCandidate} from '../base44/shared/permittingPublisherAliasEvidence.mjs';
async function fixture(text='Pilot Department is also known as Pilot Dept.'){
 const f=await ruleFixture();
 const page={...f.page,text,text_sha256:await textSha256(new TextEncoder().encode(text))};
 f.patchSource({official_url:'https://gov.test/identity.pdf',extracted_pages:[page],extracted_text:assembledSourceText({...f.source(),official_url:'https://gov.test/identity.pdf'},[page])});
 const office={id:'catalog',government_office_id:'office',government_office:{name:'Pilot Department',state:'OH',verification_status:'staff_verified',source_url:'https://gov.test/office'}};
 const profile={id:f.source().jurisdiction_id,name:f.source().jurisdiction_name,state:'OH',type:'city',website_url:'https://gov.test/'};
 const deps={sourceEntity:f.api.sourceEntity,segmentEntity:f.api.segmentEntity,getOffice:async()=>office};
 const input={government_office_id:'office',printed_name:'Pilot Dept',source_document_id:f.source().id,physical_page:1,text_sha256:page.text_sha256,excerpt:'Pilot Department is also known as Pilot Dept.'};
 return {f,office,profile,deps,input};
}
test('literal mapping returns candidate without approvals',async()=>{const x=await fixture();const result=await verifyPublisherAliasCandidate(x.deps,x.profile,x.input);assert.equal(result.status,'candidate_only');assert.equal(result.publisher_approved,false);});
for(const [name,mutate] of [
 ['withdrawn office',x=>x.office.government_office.verification_status='needs_verification'],
 ['wrong state',x=>x.office.government_office.state='KY'],
 ['different jurisdiction',x=>x.profile.id='another'],
 ['unofficial host',x=>x.profile.website_url='https://other.test/'],
 ['changed page hash',x=>x.input.text_sha256='f'.repeat(64)],
 ['alias equals canonical',x=>x.input.printed_name='Pilot Department'],
 ['paraphrased proof',x=>x.input.excerpt='Pilot Department / Pilot Dept']
])test(name,async()=>{const x=await fixture();mutate(x);await assert.rejects(()=>verifyPublisherAliasCandidate(x.deps,x.profile,x.input),{status:409});});
for(const text of ['Pilot Department\nPilot Dept','Not true: Pilot Department is also known as Pilot Dept.'])test('rejects co-occurrence or qualified mapping: '+text,async()=>{const x=await fixture(text);await assert.rejects(()=>verifyPublisherAliasCandidate(x.deps,x.profile,x.input),{status:409});});
