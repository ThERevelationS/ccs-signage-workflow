import { readPermittingResourceResponse } from '../base44/shared/permittingResourceResponse.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { scanOfficialPermittingPages, combineResearchAndDiscoveredDocuments } from '../base44/shared/permittingDiscoveryScan.mjs';
import { mergeJurisdictionResearchDocuments } from '../base44/shared/jurisdictionResearchDocumentMerge.mjs';
const entry=fs.readFileSync('base44/functions/refreshJurisdiction/entry.ts','utf8');
const compiled=ts.transpileModule(entry.slice(entry.indexOf('async function refreshJurisdictionRecord')),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness({profile={},ai={},pages={}}={}) {
  const initial={id:'fixture',name:'Fixture',state:'OH',type:'city',updated_date:'v1',permitting_url:'https://city.gov/permits',documents:[{id:'manual',url:'https://city.gov/old.pdf',source:'manual',file_url:'stored',extracted_text:'preserve'}],...profile};
  let written, researchCalls=0;const fetched=[];
  const deps={readPermittingResourceResponse,scanOfficialPermittingPages,combineResearchAndDiscoveredDocuments,mergeJurisdictionResearchDocuments,
    safeExternalFetch:async url=>{fetched.push(url);if(!(url in pages))throw Error('fixture unavailable');return new Response(pages[url],{headers:{'content-type':'text/html'}});},
    RESEARCH_FETCH_TIMEOUT_MS:12000,readResearchDocumentBytes:async response=>new Uint8Array(await response.arrayBuffer()),
    sanitizeJurisdictionResearch:v=>v,gateResearchRegulatoryPromotion:({updateData})=>({blocked:false,updateData}),
    invalidateVerifiedJurisdictionAfterResearch:(_,v)=>v,jurisdictionProtectionGuards:()=>[],
    replaceJurisdictionFieldsIfUnchanged:async ({nextFields})=>{written=nextFields;return {...initial,...nextFields};},
    archiveKnownJurisdictionSource:async()=>{throw Error('test must defer archive');}};
  const fn=new Function(...Object.keys(deps),compiled+'; return refreshJurisdictionRecord;')(...Object.values(deps));
  const sdk={asServiceRole:{entities:{JurisdictionProfile:{get:async()=>initial}},functions:{invoke:async()=>{researchCalls++;return {data:ai};}}}};
  return {run:(discovery=false)=>fn(sdk,'fixture',undefined,discovery,false),fetched,get written(){return written;},get researchCalls(){return researchCalls;},initial};
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
