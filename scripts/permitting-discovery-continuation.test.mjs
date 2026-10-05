import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {continueKnownDiscovery,continueDiscoveryBacklog,discoveryBacklogQuery} from '../base44/shared/permittingDiscoveryContinuation.mjs';
const verification={};new Function('exports',ts.transpileModule(fs.readFileSync('base44/shared/jurisdictionVerification.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(verification);
const seed='https://city.example/forms';
async function fixture(){const scan=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async()=>({html:'<a href="/sign-forms">Sign Forms</a><a href="/fees">Fees</a>',finalUrl:seed})});
 let version=1,row={id:'j',state:'OH',verification_status:'verified',website_url:'https://city.example',permitting_url:seed,updated_date:'v1',documents:scan.documents.map((d,i)=>({...d,id:'d'+i})),discovery_scan_state:scan.continuation_state};
 const fetched=[];const entity={get:async()=>structuredClone(row),filter:async()=>[structuredClone(row)],updateMany:async(q,p)=>{if(q.updated_date!==row.updated_date)return{updated:0};row={...row,...p.$set,updated_date:'v'+(++version)};return{updated:1};}};
 const options={entity,jurisdictionId:'j',invalidateProfile:verification.invalidateVerifiedJurisdictionAfterResearch,fetchPage:async url=>{fetched.push(url);return{html:'<a href="/sign.pdf">Sign Application</a>',finalUrl:url};}};
 return{options,fetched,get:()=>row,patch:p=>{row={...row,...p,updated_date:'v'+(++version)};}};
}
test('scheduled continuation processes one saved page, keeps IDs and invalidates changed verified profile',async()=>{
 const f=await fixture();const old=f.get().documents.map(d=>d.id);const r=await continueDiscoveryBacklog(f.options);
 assert.equal(r.attempted_pages,1);assert.equal(r.llm_calls,0);assert.deepEqual(f.fetched,['https://city.example/sign-forms']);
 assert.deepEqual(f.get().documents.slice(0,old.length).map(d=>d.id),old);assert.equal(f.get().verification_status,'needs_verification');assert.equal(f.get().discovery_scan_state.pending_pages.length,1);
});
test('successive scheduled cycles drain the frontier without repeating root or completed pages',async()=>{
 const f=await fixture();await continueDiscoveryBacklog(f.options);await continueDiscoveryBacklog(f.options);const r=await continueDiscoveryBacklog(f.options);assert(r.skipped);assert.equal(f.fetched.length,2);assert.equal(new Set(f.fetched).size,2);assert.equal(f.get().documents.filter(d=>d.url.endsWith('sign.pdf')).length,1);
});
test('manual collection, disabled refresh and blocked frontier prevent network and writes',async()=>{
 for(const patch of [{_manual_documents:true},{auto_refresh:false}]){const f=await fixture();f.patch(patch);assert((await continueKnownDiscovery(f.options)).skipped);assert.equal(f.fetched.length,0);}
 const f=await fixture();f.patch({discovery_scan_state:{...f.get().discovery_scan_state,blocked:true}});assert((await continueKnownDiscovery(f.options)).skipped);
});
test('changed seed blocks the old frontier for review without losing pending or visited URLs',async()=>{
 const f=await fixture(),old=structuredClone(f.get().discovery_scan_state);f.patch({permitting_url:'https://city.example/new-forms'});const r=await continueKnownDiscovery(f.options);assert.equal(r.status,'frontier_review_required');assert(f.get().discovery_scan_state.blocked);assert.deepEqual(f.get().discovery_scan_state.pending_pages,old.pending_pages);assert.equal(f.fetched.length,0);
});
test('page fetch failure is saved as an unresolved gap and other pending pages remain',async()=>{
 const f=await fixture();const r=await continueKnownDiscovery({...f.options,fetchPage:async()=>{throw Error('unavailable');}});assert.equal(r.unresolved_gaps,1);assert.equal(r.pending_pages,1);assert.equal(f.get().discovery_scan_state.gaps[0].reason,'page_fetch_failed');
});
test('staff document edit during scanning blocks atomic cursor/document replacement',async()=>{
 const f=await fixture(),old=structuredClone(f.get().discovery_scan_state);await assert.rejects(continueKnownDiscovery({...f.options,fetchPage:async url=>{f.patch({documents:[{id:'staff',url:'https://city.example/manual.pdf',source:'manual'}]});return{html:'<a href="/sign.pdf">Sign Application</a>',finalUrl:url};}}));assert.equal(f.get().documents[0].id,'staff');assert.deepEqual(f.get().discovery_scan_state,old);
});
test('automatic query excludes disabled/manual/blocked collections and requires pending work',()=>{
 const q=discoveryBacklogQuery();assert.deepEqual(q.auto_refresh,{$ne:false});assert.deepEqual(q._manual_documents,{$ne:true});assert.deepEqual(q['discovery_scan_state.blocked'],{$ne:true});assert.deepEqual(q['discovery_scan_state.pending_pages.0'],{$exists:true});
});
