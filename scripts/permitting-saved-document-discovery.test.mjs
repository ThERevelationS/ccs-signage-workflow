import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {validateSavedDiscoverySelection,discoverSelectedSavedDocument} from '../base44/shared/permittingSavedDocumentDiscovery.mjs';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
globalThis.crypto ||= webcrypto;
const url='https://www.sharonville.org/123/Building-Zoning-and-Planning';
const seed='https://www.sharonville.org/394/Sign-Application';
const guide='https://www.sharonville.org/DocumentCenter/View/4576/Residential-Permitting-Guide-2026';
const fixture=()=>({id:'synthetic-profile',name:'Sharonville',state:'OH',type:'city',updated_date:'v1',permitting_url:seed,
 documents:[{id:'department',url,title:'Department',source:'ai_discovered'},
 {id:'protected',url:guide,title:'Pinned guide',source:'manual',pinned:true,file_url:'retained'}],
 discovery_scan_state:{method:'official-page-frontier-v1',seed_url:seed,max_depth:2,attempted_pages_total:1,
 visited_urls:[seed],pending_pages:[],gaps:[],external_referrals:[]}});
const selection=p=>({document_id:'department',url,profile_id:p.id,name:p.name,state:p.state,type:p.type,profile_version:p.updated_date});
function entityFor(p){let current=structuredClone(p),writes=0;return{get:async()=>structuredClone(current),
 updateMany:async(q,patch)=>{assert.equal(q.updated_date,current.updated_date);current={...current,...patch.$set,updated_date:'v2'};writes++;return{updated:1};},
 change:fn=>fn(current),writes:()=>writes};}
test('exact retained department harvest preserves PDF frontier and protected guide',async()=>{
 const p=fixture(),entity=entityFor(p);let fetches=0;
 const result=await discoverSelectedSavedDocument({entity,profile:p,selection:selection(p),fetchPage:async selected=>{
  assert.equal(selected,url);fetches++;return{html:readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/building-zoning.html','utf8'),finalUrl:url};}});
 assert.equal(fetches,1);assert.equal(entity.writes(),1);
 const {saved_document_scans,...frontier}=result.jurisdiction.discovery_scan_state;
 assert.deepEqual(frontier,p.discovery_scan_state);assert.equal(saved_document_scans.length,1);
 assert.ok(result.discovery_scan.documents.some(d=>d.url===guide));
 assert.deepEqual(result.jurisdiction.documents.find(d=>d.id==='protected'),p.documents[1]);
 assert.equal(result.research_attempts,0);assert.equal(result.archival,null);
 assert.equal(result.selected_document_receipt.authority_established,false);
 assert.throws(()=>validateSavedDiscoverySelection(result.jurisdiction,selection(result.jurisdiction)),/already/);
 const resumed=await scanOfficialPermittingPages({seedUrl:seed,resume:result.jurisdiction.discovery_scan_state,fetchPage:()=>{throw Error('no fetch');}});
 assert.deepEqual(resumed.continuation_state.saved_document_scans,saved_document_scans);
});
for(const [label,mutate] of [
 ['stale',p=>p.updated_date='v2'],['identity',p=>p.name='Other'],['state',p=>p.state='XX'],
 ['type',p=>p.type='other'],['protected collection',p=>p._manual_documents=true],
 ['changed URL',p=>p.documents[0].url+='?changed'],['duplicate ID',p=>p.documents.push({...p.documents[0],url:url+'?other'})],
 ['duplicate URL',p=>p.documents.push({...p.documents[0],id:'other'})],
 ['manual',p=>p.documents[0].source='manual'],['pinned',p=>p.documents[0].pinned=true],
 ['archive pinned',p=>p.documents[0].archive_pinned=true],['archived',p=>p.documents[0].file_url='file'],
 ['hashed',p=>p.documents[0].source_sha256='hash'],['stored hash',p=>p.documents[0].stored_sha256='hash'],
 ['archive reservation',p=>p.documents[0].archive_state={status:'pending'}],
 ['blocked frontier',p=>p.discovery_scan_state.blocked=true],
 ['duplicate receipt',p=>p.discovery_scan_state.saved_document_scans=[{document_id:'department',source_url:url}]]
])test(label+' fails before fetch/write',async()=>{
 const p=fixture(),s=selection(p);mutate(p);const entity=entityFor(p);let fetches=0;
 await assert.rejects(discoverSelectedSavedDocument({entity,profile:p,selection:s,fetchPage:()=>{fetches++;}}));
 assert.equal(fetches,0);assert.equal(entity.writes(),0);
});
for(const bad of ['https://external.example/page','javascript:alert(1)','https://user:pw@www.sharonville.org/page','https://www.sharonville.org:444/page','https://www.sharonville.org/page#fragment'])
 test('unsafe/external '+bad,()=>{const p=fixture();p.documents[0].url=bad;const s={...selection(p),url:bad};assert.throws(()=>validateSavedDiscoverySelection(p,s));});
test('edit after preflight blocks before fetch',async()=>{
 const p=fixture(),entity=entityFor(p);entity.change(r=>r.updated_date='v2');let fetches=0;
 await assert.rejects(discoverSelectedSavedDocument({entity,profile:p,selection:selection(p),fetchPage:()=>{fetches++;}}));
 assert.equal(fetches,0);assert.equal(entity.writes(),0);
});
test('concurrent document change after fetch preserves newer data',async()=>{
 const p=fixture(),entity=entityFor(p);
 await assert.rejects(discoverSelectedSavedDocument({entity,profile:p,selection:selection(p),fetchPage:async()=>{
  entity.change(r=>{r.documents[0].title='Newer';r.updated_date='v2';});
  return{html:'<a href="/forms">Permitting Forms</a>',finalUrl:url};}}));
 assert.equal(entity.writes(),0);assert.equal((await entity.get()).documents[0].title,'Newer');
});
test('failed fetch saves no receipt or documents',async()=>{
 const p=fixture(),entity=entityFor(p);
 await assert.rejects(discoverSelectedSavedDocument({entity,profile:p,selection:selection(p),fetchPage:async()=>{throw Error('offline');}}));
 assert.equal(entity.writes(),0);
});
test('ordinary rescan still refuses saved department outside original frontier',async()=>{
 const p=fixture();let fetches=0;
 await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,resume:p.discovery_scan_state,rescanUrl:url,existingDocuments:p.documents,fetchPage:()=>{fetches++;}}));
 assert.equal(fetches,0);
});


test('Sharonville live timestamp correction: ten rediscovered links retain fetch dates and new calendar has none',async()=>{
 const live=JSON.parse(readFileSync('docs/permitting-sharonville-discovery-live-2026-10-21.json','utf8'));
 const p=fixture();
 const selectedUrl=live.selected_document_receipt.source_url;
 p.documents[0]={...p.documents[0],url:selectedUrl,last_fetched:'2026-10-14T01:05:24.573Z',extracted_text:'Retained page text'};
 const linked=live.timestamp_provenance_issue.linked_documents_incorrectly_restamped.map((row,i)=>({
  id:row.id,url:`https://www.sharonville.org/forms/permit-${i}`,title:`Permit Form ${i}`,doc_type:'permit_application',
  source:'official_page_harvest',last_fetched:row.fields.find(f=>f.key==='last_fetched').before,
  extracted_text:`Retained content ${i}`,verification_notes:'Existing source evidence'
 }));
 p.documents.push(...linked);
 p.office_research={roles:[{role:'electrical_permit',office_name:'Unverified office'}],saved_identity_comparisons:[{status:'unverified'}]};
 const priorReceipt={document_id:'previous',source_url:url,scanned_at:'2026-10-18T00:00:00Z'};
 p.discovery_scan_state.saved_document_scans=[priorReceipt];
 const original=structuredClone(p),entity=entityFor(p),fetched=[];
 const added=live.added_documents[0];
 const s={...selection(p),url:selectedUrl};
 const html=linked.map(d=>`<a href="${d.url}">${d.title}</a>`).join('')+
  `<a href="${added.url}">${added.title}</a><a href="${guide}">Sign Permit Guide</a>`+
  '<a href="https://external.example/permit-form">Electrical Permit Application</a>';
 const before=Date.now();
 const result=await discoverSelectedSavedDocument({entity,profile:p,selection:s,fetchPage:async target=>{
  fetched.push(target);return{html,finalUrl:selectedUrl};
 }});
 const after=Date.now(),saved=result.jurisdiction,stamp=result.selected_document_receipt.scanned_at;
 assert.deepEqual(fetched,[selectedUrl]);assert.equal(entity.writes(),1);
 assert.equal(saved.documents.length,p.documents.length+1);
 for(const old of linked){
  const actual=saved.documents.find(d=>d.id===old.id);
  assert.equal(actual.last_fetched,old.last_fetched);
  for(const field of ['id','url','extracted_text','verification_notes'])assert.equal(actual[field],old[field]);
 }
 const calendar=saved.documents.find(d=>d.url===added.url);
 assert.ok(calendar?.id);assert.equal(Object.hasOwn(calendar,'last_fetched'),false);
 const selected=saved.documents.find(d=>d.id==='department');
 assert.deepEqual(selected,{...p.documents[0],last_fetched:stamp});
 assert.ok(Date.parse(stamp)>=before && Date.parse(stamp)<=after);
 assert.deepEqual(saved.documents.find(d=>d.id==='protected'),p.documents[1]);
 assert.deepEqual(saved.office_research,p.office_research);
 const {saved_document_scans,...frontier}=saved.discovery_scan_state;
 const {saved_document_scans:oldHistory,...oldFrontier}=p.discovery_scan_state;
 assert.deepEqual(frontier,oldFrontier);assert.deepEqual(saved_document_scans[0],oldHistory[0]);
 assert.equal(saved_document_scans.length,2);
 assert.equal(result.research_attempts,0);assert.equal(result.llm_calls,0);assert.equal(result.archival,null);
 assert.equal(saved_document_scans[1].authority_established,false);
 assert.deepEqual(p,original);
});

test('successfully read selected page receives a date even when it exposes no relevant links',async()=>{
 const p=fixture(),entity=entityFor(p);
 const result=await discoverSelectedSavedDocument({entity,profile:p,selection:selection(p),
  fetchPage:async()=>({html:'<p>No application links on this page.</p>',finalUrl:url})});
 assert.equal(result.discovery_scan.documents.length,0);
 assert.equal(result.jurisdiction.documents[0].last_fetched,result.selected_document_receipt.scanned_at);
 assert.deepEqual(result.jurisdiction.documents[1],p.documents[1]);
});

test('selected-page PDF classification retains routing metadata and timestamps only the fetched document',async()=>{
 const p=fixture(),entity=entityFor(p);
 const result=await discoverSelectedSavedDocument({entity,profile:p,selection:selection(p),
  fetchPage:async()=>({resource_kind:'pdf',classification_method:'mime-and-signature-v1',finalUrl:url})});
 const selected=result.jurisdiction.documents[0];
 assert.equal(selected.resource_classification.kind,'pdf');
 assert.equal(selected.last_fetched,result.selected_document_receipt.scanned_at);
 assert.deepEqual(result.jurisdiction.documents[1],p.documents[1]);
});
