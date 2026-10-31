import {normalizeOfficeResearch} from '../base44/shared/permittingOfficeResearch.mjs';
import {silentScanReporter} from '../base44/shared/permittingScanReporter.mjs';
import { readPermittingResourceResponse } from '../base44/shared/permittingResourceResponse.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { scanOfficialPermittingPages, combineResearchAndDiscoveredDocuments, applyDiscoveryFetchTimestamp } from '../base44/shared/permittingDiscoveryScan.mjs';
import { retainOfficeResearchResponseHistory } from '../base44/shared/officeResearchResponseHistory.mjs';
import { mergeJurisdictionResearchDocuments } from '../base44/shared/jurisdictionResearchDocumentMerge.mjs';
import { assertOfficialProfileResearchIdentity, assertResearchSourceIdentity } from '../base44/shared/permittingSourceIdentity.mjs';
const entry=fs.readFileSync('base44/functions/refreshJurisdiction/entry.ts','utf8');
const compiled=ts.transpileModule(entry.slice(entry.indexOf('async function refreshJurisdictionRecord')),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness({profile={},ai={},pages={}}={}) {
  const initial={id:'fixture',name:'Fixture',state:'OH',type:'city',updated_date:'v1',permitting_url:'https://city.gov/permits',documents:[{id:'manual',url:'https://city.gov/old.pdf',source:'manual',file_url:'stored',extracted_text:'preserve'}],...profile};
  let written, researchCalls=0;const fetched=[];
  const deps={normalizeOfficeResearch,silentScanReporter,readPermittingResourceResponse,scanOfficialPermittingPages,combineResearchAndDiscoveredDocuments,applyDiscoveryFetchTimestamp,retainOfficeResearchResponseHistory,mergeJurisdictionResearchDocuments,
    assertOfficialProfileResearchIdentity,assertResearchSourceIdentity,
    safeExternalFetch:async url=>{fetched.push(url);if(!(url in pages))throw Error('fixture unavailable');return new Response(pages[url],{headers:{'content-type':'text/html'}});},
    INTERNAL_FUNCTION_CAPABILITY:'fixture-capability',RESEARCH_FETCH_TIMEOUT_MS:12000,readResearchDocumentBytes:async response=>new Uint8Array(await response.arrayBuffer()),
    sanitizeJurisdictionResearch:v=>v,gateResearchRegulatoryPromotion:({updateData})=>({blocked:false,updateData}),
    invalidateVerifiedJurisdictionAfterResearch:(_,v)=>v,jurisdictionProtectionGuards:()=>[],
    replaceJurisdictionFieldsIfUnchanged:async ({nextFields})=>{written=nextFields;return {...initial,...nextFields};},
    archiveKnownJurisdictionSource:async()=>{throw Error('test must defer archive');}};
  const fn=new Function(...Object.keys(deps),compiled+'; return refreshJurisdictionRecord;')(...Object.values(deps));
  const sdk={asServiceRole:{entities:{JurisdictionProfile:{get:async()=>initial}},functions:{invoke:async()=>{researchCalls++;return {data:ai};}}}};
  return {run:(discovery=false, recoverFetchFailures=false,rescanSourceUrl=null)=>fn(sdk,'fixture',undefined,discovery,false,false,recoverFetchFailures,null,silentScanReporter,rescanSourceUrl),fetched,get written(){return written;},get researchCalls(){return researchCalls;},initial};
}

test('actual refresh adds deterministic missing file even when AI already supplied one',async()=>{
  const h=harness({ai:{permitting_url:'https://city.gov/permits',documents:[{url:'https://city.gov/ai.pdf',title:'AI form'}]},pages:{'https://city.gov/permits':'<a href="/missing.pdf">Sign Application</a>'}});
  const r=await h.run();assert.equal(h.researchCalls,1);assert.equal(h.fetched.length,1);
  assert(r.jurisdiction.documents.some(d=>d.url.endsWith('/missing.pdf') && d.source==='official_page_harvest'));
  assert.deepEqual(r.jurisdiction.documents[0],h.initial.documents[0]);assert.equal(r.discovery_scan.llm_calls,0);
});
test('actual discovery-only refresh follows linked pages with no AI and retains archive handoff',async()=>{
  const h=harness({pages:{'https://city.gov/permits':'<a href="/building/forms">Building Forms</a>','https://city.gov/building/forms':'<a href="/sign.pdf">Sign Application</a>'}});
  const r=await h.run(true);assert.equal(h.researchCalls,0);assert.equal(r.research_attempts,0);assert.equal(h.fetched.length,2);
  const doc=r.jurisdiction.documents.find(d=>d.url.endsWith('/sign.pdf'));assert(doc.id);assert.equal(doc.source,'official_page_harvest');
  assert(doc.verification_notes.includes('/building/forms'));assert.equal(r.archival,null);
});
test('manual document collection cannot be changed or harvested',async()=>{
  const h=harness({profile:{_manual_documents:true},ai:{permitting_url:'https://city.gov/permits',documents:[{url:'https://city.gov/new.pdf'}]}});
  await h.run();assert.equal(h.fetched.length,0);assert.equal(h.written.documents,undefined);
  await assert.rejects(h.run(true),/unprotected document collection/);
});
test('optional HTML fetch failure preserves usable AI discovery',async()=>{
  const h=harness({ai:{permitting_url:'https://city.gov/permits',documents:[{url:'https://city.gov/ai.pdf'}]}});
  const r=await h.run();assert(r.jurisdiction.documents.some(d=>d.url.endsWith('/ai.pdf')));
  assert.equal(r.discovery_scan.success,false);assert.equal(r.discovery_scan.jurisdiction_coverage_complete,false);
});
test('discovery-only seed failure performs no profile write',async()=>{
  const h=harness();await assert.rejects(h.run(true),/could not read/);assert.equal(h.written,undefined);
});
test('invalid optional AI seed cannot discard the AI document list',async()=>{
  const h=harness({ai:{permitting_url:'not a URL',documents:[{url:'https://city.gov/ai.pdf'}]}});
  const r=await h.run();assert.equal(h.fetched.length,0);assert.equal(r.discovery_scan.success,false);
  assert(r.jurisdiction.documents.some(d=>d.url.endsWith('/ai.pdf')));
});

test('broader discovery preserves pinned and archive-pinned records exactly',()=>{
  for (const flag of ['pinned','archive_pinned']) {
    const old={id:'protected',url:'https://city.gov/sign.pdf',source:'official_page_harvest',title:'Reviewed title',verification_notes:'Staff evidence',[flag]:true};
    assert.deepEqual(mergeJurisdictionResearchDocuments([old],[{url:old.url,title:'New harvested title',doc_type:'permit_application'}]),[old]);
  }
});

test('actual discovery-only refresh saves and resumes the frontier rather than rereading root',async()=>{
 const root='https://city.gov/permits';const h=harness({pages:{[root]:'<a href="/sign-forms">Sign Forms</a><a href="/fees">Fees</a><a href="/zoning">Zoning</a>','https://city.gov/sign-forms':'<a href="/sign.pdf">Sign Application</a>','https://city.gov/fees':'<a href="/fees.pdf">Permit Fees</a>'}});
 const first=await h.run(true);assert.equal(first.jurisdiction.discovery_scan_state.pending_pages.length,1);
 const resumed=harness({profile:first.jurisdiction,pages:{'https://city.gov/zoning':'<a href="/code.pdf">Zoning Code</a>'}});const second=await resumed.run(true);
 assert.deepEqual(resumed.fetched,['https://city.gov/zoning']);assert.equal(second.jurisdiction.discovery_scan_state.pending_pages.length,0);assert(second.jurisdiction.documents.some(d=>d.url.endsWith('/code.pdf')));
});


test('actual refresh retry clears successful gap and preserves unrelated pending pages and manual archive',async()=>{
 const root='https://city.gov/permits', failed='https://city.gov/sign-forms';
 const state={method:'official-page-frontier-v1',seed_url:root,max_depth:2,visited_urls:[root,failed],pending_pages:[{url:'https://city.gov/fees',depth:1}],gaps:[{url:failed,reason:'page_fetch_failed',depth:1,requires_review:true}],attempted_pages_total:2};
 const h=harness({profile:{discovery_scan_state:state},pages:{[failed]:'<a href="/sign.pdf">Sign Application</a>'}});
 const r=await h.run(true,true);
 assert.deepEqual(h.fetched,[failed]);assert.equal(h.researchCalls,0);
 assert.deepEqual(r.jurisdiction.documents[0],h.initial.documents[0]);
 assert.deepEqual(r.jurisdiction.discovery_scan_state.pending_pages,state.pending_pages);
 assert.equal(r.jurisdiction.discovery_scan_state.gaps.length,0);
 assert.equal(r.jurisdiction.discovery_scan_state.attempted_pages_total,3);
 assert.ok(r.jurisdiction.documents.some(d=>d.url.endsWith('/sign.pdf')));
});

test('Sharonville live-shaped seed rejects unsaved department rescan before fetch or write',async()=>{
 const seed='https://www.sharonville.org/394/Sign-Application';
 const department='https://www.sharonville.org/123/Building-Zoning-and-Planning';
 const h=harness({profile:{name:'Sharonville',permitting_url:seed},pages:{[department]:fs.readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/building-zoning.html','utf8')}});
 await assert.rejects(h.run(true,false,department),/not a saved official discovery page/);
 assert.deepEqual(h.fetched,[]);assert.equal(h.written,undefined);assert.equal(h.researchCalls,0);
});

test('retained Sharonville selected-page refresh saves guide identity and preserves protected documents on replay',async()=>{
 const root='https://www.sharonville.org/123/Building-Zoning-and-Planning';
 const guide='https://www.sharonville.org/DocumentCenter/View/4576/Residential-Permitting-Guide-2026';
 const html=fs.readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/building-zoning.html','utf8');
 const protectedDocs=['manual','pinned','archive_pinned'].map((flag,i)=>({id:'protected-'+i,url:root+'?retained='+i,title:'Staff record',source:flag==='manual'?'manual':'official_page_harvest',...(flag==='manual'?{}:{[flag]:true}),file_url:'stored-'+i,extracted_text:'preserve'}));
 const h=harness({profile:{name:'Sharonville',permitting_url:root,documents:protectedDocs},pages:{[root]:html}});
 const r=await h.run(true,false,root);
 assert.deepEqual(h.fetched,[root]);assert.equal(h.researchCalls,0);assert.equal(r.archival,null);
 const doc=r.jurisdiction.documents.find(d=>d.url===guide);
 assert.ok(doc?.id);assert.equal(doc.source,'official_page_harvest');assert.equal(doc.discovery_page_url,root);
 assert.equal(doc.file_url,undefined);assert.equal(r.discovery_scan.authority_established,false);
 for(const old of protectedDocs)assert.deepEqual(r.jurisdiction.documents.find(d=>d.id===old.id),old);
 const replay=harness({profile:r.jurisdiction,pages:{[root]:html}});
 const second=await replay.run(true,false,root);
 assert.deepEqual(replay.fetched,[root]);assert.equal(replay.researchCalls,0);
 const copies=second.jurisdiction.documents.filter(d=>d.url===guide);
 assert.equal(copies.length,1);assert.equal(copies[0].id,doc.id);
 for(const old of protectedDocs)assert.deepEqual(second.jurisdiction.documents.find(d=>d.id===old.id),old);
});

test('failed recovery with empty pending list reports failure and persists only retained progress',async()=>{
 const root='https://city.gov/permits';
 const state={method:'official-page-frontier-v1',seed_url:root,max_depth:2,visited_urls:[root],pending_pages:[],gaps:[{url:root,reason:'page_fetch_failed',depth:0,requires_review:true}],attempted_pages_total:1};
 const h=harness({profile:{discovery_scan_state:state}});
 const r=await h.run(true,true);
 assert.equal(r.discovery_scan.success,false);assert.equal(r.discovery_scan.traversal_complete,false);
 assert.deepEqual(r.jurisdiction.discovery_scan_state.gaps,state.gaps);
 assert.equal(r.jurisdiction.discovery_scan_state.attempted_pages_total,2);
 assert.deepEqual(r.jurisdiction.documents,h.initial.documents);assert.equal(h.researchCalls,0);
});

test('research refresh saves office findings and electrical details on the exact profile',async()=>{
 const h=harness({ai:{documents:[],office_research:{roles:[{role:'electrical_permit',office_name:'Fixture permit office',official_source_url:'https://city.gov/electrical',research_fields:{permit_application:'https://city.gov/application',fees:'Official schedule'}}]}}});
 const result=await h.run();assert.equal(h.researchCalls,1);
 assert.equal(result.jurisdiction.office_research.profile_snapshot.id,'fixture');
 assert.equal(result.jurisdiction.office_research.roles.find(r=>r.role==='electrical_permit').research_fields.fees,'Official schedule');
 assert.equal(Object.hasOwn(result.jurisdiction,'offices'),false);
});
