import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {assembledSourceText,textSha256} from '../base44/shared/jurisdictionSourcePdfText.mjs';
import {registerOfficeCandidate,getOfficeCandidate} from '../base44/shared/permittingOfficeCandidate.mjs';
let handler;
const bundle=await build({entryPoints:['base44/functions/permittingOfficeCandidate/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
 plugins:[{name:'mock-sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.officeCandidateFixture;',loader:'js'}));}}]});
globalThis.Deno={serve:fn=>{handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const clone=v=>structuredClone(v);
async function setup({role='admin',mode='ok'}={}){
 const f=await ruleFixture({source:{authority_classification:'application_form',content_status:'unknown',verification_status:'needs_verification',
  jurisdiction_profile_doc_id:'doc',issuing_office:null}});
 const text='Pilot Planning Department\nSign Permit Application\nTownship contact information requires review.';
 const page={...f.page,text,text_sha256:await textSha256(new TextEncoder().encode(text))};
 f.patchSource({extracted_pages:[page],extracted_text:assembledSourceText(f.source(),[page])});
 const s=f.source(),profile={id:'profile',name:'Pilot',state:'OH',type:'county',notes:'Preserve staff notes',
  documents:[{id:'doc',url:s.official_url,file_url:s.archived_file_url,source_sha256:s.file_hash_sha256,
   stored_sha256:s.file_hash_sha256,source_bytes:s.file_bytes,stored_bytes:s.file_bytes}]};
 const old={id:'original',name:'Preserved Office',workflow_steps:[{id:'step',name:'Existing workflow'}],
  government_office:{verification_status:'staff_verified',verified_by:'original reviewer'}};
 const row={id:'setting',setting_key:'permitOfficeCatalog',updated_date:'v1',setting_value:{items:[clone(old)],keep:'manual field'}};
 const counts={writes:0,service:0,filters:0};let version=1,beforeWrite,beforeSecondEvidence,sourceGets=0,failRead=false;
 const sourceEntity={get:async()=>{sourceGets++;if(sourceGets===2 && beforeSecondEvidence)beforeSecondEvidence();return clone(f.source());}};
 const settingsEntity={filter:async(q,sort,limit,skip)=>{assert.equal(q.setting_key,'permitOfficeCatalog');assert.equal(sort,'id');assert.equal(limit,2);assert.equal(skip,0);
  counts.filters++;if(failRead)throw Error('Read unavailable');return [clone(row)];},
  updateMany:async(q,p)=>{counts.writes++;if(beforeWrite)beforeWrite();if(mode==='missing')throw Error('Unknown response');
   if(q.id!==row.id || q.updated_date!==row.updated_date || q.setting_key!==row.setting_key)return{updated:0};
   row.setting_value=clone(p.$set.setting_value);row.updated_date='v'+(++version);
   if(mode==='lost')throw Error('Lost acknowledgement');if(mode==='read_lost')failRead=true;return{updated:1};}};
 const deps={sourceEntity,profileEntity:{get:async()=>clone(profile)},segmentEntity:f.api.segmentEntity,settingsEntity};
 const input={source_document_id:'source',office_name:'Pilot Planning Department',physical_page:1,publisher_quote:'Pilot Planning Department'};
 const preview=()=>registerOfficeCandidate(deps,{input,dryRun:true});
 const save=async(p,inputOverride=input)=>registerOfficeCandidate(deps,{input:inputOverride,expectedCatalogVersion:p.expected_catalog_updated_date,
  expectedEvidenceDigest:p.expected_evidence_digest,actor:'admin@example.test',now:()=> '2026-10-04T21:00:00Z'});
 globalThis.officeCandidateFixture={auth:{me:async()=>role===null?null:{role,email:'admin@example.test'}},
  get asServiceRole(){counts.service++;return{entities:{PermittingSourceDocument:sourceEntity,JurisdictionProfile:deps.profileEntity,
   PermittingSourceTextSegment:deps.segmentEntity,GlobalSettings:settingsEntity}};}};
 const call=async body=>{const r=await handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};};
 return {f,profile,row,old,deps,input,counts,preview,save,call,beforeWrite:fn=>{beforeWrite=fn;},
  beforeSecondEvidence:fn=>{beforeSecondEvidence=fn;},resetSourceReads:()=>{sourceGets=0;},restoreRead:()=>{failRead=false;}};
}
test('candidate backend rejects non-admin access before service-role reads',async()=>{
 for(const role of [null,'user','external']){const t=await setup({role});assert.equal((await t.call({action:'register'})).status,403);
  assert.equal(t.counts.service,0);assert.equal(t.counts.writes,0);}
});
test('compiled handler preview/register/get_request record one candidate with no authority claim',async()=>{
 const t=await setup(),p=await t.call({action:'preview',candidate:t.input});assert.equal(p.status,200);assert.equal(t.counts.writes,0);
 const body={action:'register',candidate:t.input,expected_catalog_updated_date:p.data.expected_catalog_updated_date,expected_evidence_digest:p.data.expected_evidence_digest};
 const r=await t.call(body);assert.equal(r.status,200);assert.equal(r.data.office.government_office.verification_status,'needs_verification');
 const found=await t.call({action:'get_request',office_id:r.data.office.id,registration_key:r.data.office.office_candidate_registration.registration_key});
 assert.equal(found.data.status,'registered');assert.equal(found.data.authority_verified,false);assert.equal(found.data.address_authority_resolved,false);
 assert.equal((await t.call(body)).data.status,'registered');assert.equal(t.row.setting_value.items.length,2);assert.equal(t.counts.writes,1);
});
test('candidate preview preserves source, profiles, old catalog entries and all authority flags',async()=>{
 const t=await setup(),before=clone({row:t.row,profile:t.profile,source:t.f.source()}),p=await t.preview();
 assert.equal(p.proposal.government_office.verification_status,'needs_verification');assert.deepEqual(p.proposal.workflow_steps,[]);
 assert.equal(p.proposal.government_office.verified_by,'');assert.ok(!Object.hasOwn(p.proposal,'authority_roles'));
 assert.deepEqual({row:t.row,profile:t.profile,source:t.f.source()},before);assert.equal(t.f.calls.llm,0);assert.equal(t.counts.writes,0);
});
test('registration appends only the candidate, preserving every existing catalog field and workflow',async()=>{
 const t=await setup(),p=await t.preview(),source=clone(t.f.source()),profile=clone(t.profile);await t.save(p);
 assert.deepEqual(t.row.setting_value.items[0],t.old);assert.equal(t.row.setting_value.keep,'manual field');
 assert.deepEqual(t.profile,profile);assert.deepEqual(t.f.source(),source);assert.equal(t.f.calls.llm,0);
});
test('generic or invented publisher names, quotes and malformed selections are rejected',async()=>{
 for(const patch of [{office_name:'Board of Zoning Appeals',publisher_quote:'Board of Zoning Appeals'},
  {office_name:'Pilot Invented Office',publisher_quote:'Pilot Invented Office'},{publisher_quote:'Pilot Planning Department has all jurisdiction'},
  {physical_page:2},{physical_page:1.5},{office_name:'',publisher_quote:''}]){
  const t=await setup();await assert.rejects(registerOfficeCandidate(t.deps,{input:{...t.input,...patch},dryRun:true}));assert.equal(t.counts.writes,0);
 }
});
test('archive replacement, missing source lineage, wrong bytes and page hash changes fail closed',async()=>{
 for(const mode of ['url','file','hash','bytes','duplicate','page','state','profile']){
  const t=await setup(),d=t.profile.documents[0];
  if(mode==='url')d.url='https://other.test/form.pdf';if(mode==='file')d.file_url='https://other.test/archive.pdf';
  if(mode==='hash')d.stored_sha256='b'.repeat(64);if(mode==='bytes')d.stored_bytes++;
  if(mode==='duplicate')t.profile.documents.push(clone(d));if(mode==='page')t.f.patchSource({extracted_pages:[{...t.f.source().extracted_pages[0],text_sha256:'b'.repeat(64)}]});
  if(mode==='state')t.profile.state='IN';if(mode==='profile')t.profile.name='Other';
  await assert.rejects(t.preview());assert.equal(t.counts.writes,0);
 }
});
test('stale preview leaves a concurrently edited office catalog untouched',async()=>{
 const t=await setup(),p=await t.preview();t.row.updated_date='new';t.row.setting_value.keep='concurrent';
 await assert.rejects(t.save(p),/changed/);assert.equal(t.row.setting_value.keep,'concurrent');assert.equal(t.counts.writes,0);
});
test('source/page/profile changes after preview block registration',async()=>{
 const t=await setup(),p=await t.preview();t.f.patchSource({title:'New source version'});
 await assert.rejects(t.save(p),/changed/);assert.equal(t.counts.writes,0);
});
test('source changes during final recheck block the catalog mutation',async()=>{
 const t=await setup(),p=await t.preview();t.resetSourceReads();t.beforeSecondEvidence(()=>t.f.patchSource({title:'Changed during save'}));
 await assert.rejects(t.save(p),/changed before/);assert.equal(t.counts.writes,0);
});
test('atomic catalog conflict does not overwrite concurrent setting data',async()=>{
 const t=await setup(),p=await t.preview();t.beforeWrite(()=>{t.row.updated_date='new';t.row.setting_value.keep='other session';});
 await assert.rejects(t.save(p),/concurrently/);assert.equal(t.row.setting_value.keep,'other session');assert.equal(t.row.setting_value.items.length,1);
});
test('concurrent same-candidate submissions yield one stable catalog entry',async()=>{
 const t=await setup(),p=await t.preview();await Promise.allSettled([t.save(p),t.save(p)]);
 assert.equal(t.row.setting_value.items.length,2);assert.equal(new Set(t.row.setting_value.items.map(x=>x.id)).size,2);
});
test('lost update acknowledgement reconciles the same saved candidate',async()=>{
 const t=await setup({mode:'lost'}),r=await t.save(await t.preview());assert.equal(r.reconciled,true);assert.equal(t.counts.writes,1);
});
test('unknown updates are looked up once and never retried automatically',async()=>{
 const t=await setup({mode:'missing'}),r=await t.save(await t.preview());assert.equal(r.status,'registration_uncertain');
 assert.equal(t.counts.writes,1);assert.equal(t.row.setting_value.items.length,1);
 const check=await getOfficeCandidate(t.deps,{officeId:r.office_id,registrationKey:r.registration_key});assert.equal(check.status,'not_found');assert.equal(t.counts.writes,1);
});
test('uncertain readback later recovers exactly the original registration without another write',async()=>{
 const t=await setup({mode:'read_lost'}),r=await t.save(await t.preview());assert.equal(r.status,'registration_uncertain');t.restoreRead();
 assert.equal((await getOfficeCandidate(t.deps,{officeId:r.office_id,registrationKey:r.registration_key})).status,'registered');assert.equal(t.counts.writes,1);
});
test('matching legacy office is exposed for review, never overwritten or marked verified',async()=>{
 const t=await setup();t.row.setting_value.items.push({id:'legacy',name:'Pilot Planning Department',contact_phone:'manual'});
 const p=await t.preview();assert.equal(p.existing_office.id,'legacy');const before=clone(t.row);
 assert.equal((await t.save(p)).status,'existing_office');assert.deepEqual(t.row,before);assert.equal(t.counts.writes,0);
});
test('duplicate names/canonical IDs and conflicting state are quarantined',async()=>{
 for(const mode of ['names','ids','state']){
  const t=await setup();if(mode==='ids')t.row.setting_value.items.push({...clone(t.old),id:'second',government_office_id:t.old.id});
  else{t.row.setting_value.items.push({id:'office',name:t.input.office_name,government_office:{state:mode==='state'?'KY':'OH'}});
   if(mode==='names')t.row.setting_value.items.push({id:'another',name:t.input.office_name});}
  await assert.rejects(t.preview());assert.equal(t.counts.writes,0);
 }
});
test('saved candidate lookup requires exact registration identity and never writes',async()=>{
 const t=await setup(),r=await t.save(await t.preview());
 assert.equal((await getOfficeCandidate(t.deps,{officeId:r.office.id,registrationKey:'b'.repeat(64)})).status,'not_found');
 assert.equal(t.counts.writes,1);
});
