import test from 'node:test';import assert from 'node:assert/strict';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from '../base44/shared/jurisdictionPersistence.mjs';
const seedUrl='https://city.example/forms';
const pages={ [seedUrl]:'<a href="/sign-forms">Sign Forms</a><a href="/fees">Fees</a>',
 'https://city.example/sign-forms':'<a href="/sign.pdf">Sign Application</a>',
 'https://city.example/fees':'<a href="/fees.pdf">Permit Fees</a>' };
const run=(extra={})=>scanOfficialPermittingPages({seedUrl,maxPages:1,fetchPage:async url=>{if(!(url in pages))throw Error('missing');return{html:pages[url],finalUrl:url};},...extra});
test('three requests resume from saved frontier and never reread successful root/pages',async()=>{
 const fetched=[];const fetchPage=async url=>{fetched.push(url);return{html:pages[url],finalUrl:url};};
 const a=await run({fetchPage});const b=await run({fetchPage,resume:a.continuation_state,existingDocuments:a.documents});const c=await run({fetchPage,resume:b.continuation_state,existingDocuments:[...a.documents,...b.documents]});
 assert.deepEqual(fetched,[seedUrl,'https://city.example/sign-forms','https://city.example/fees']);
 assert.equal(c.continuation_state.attempted_pages_total,3);assert.equal(c.pending_pages.length,0);assert.equal(c.traversal_complete,true);
 const d=await run({fetchPage,resume:c.continuation_state});assert.equal(fetched.length,3);assert.equal(d.success,true);assert.equal(d.attempted_pages,0);
});
test('resume preserves PDF title/type on an extensionless pending resource',async()=>{
 const a=await run({fetchPage:async url=>({html:'<a href="/assets/sign">Sign Application Checklist</a>',finalUrl:url})});
 const b=await run({resume:a.continuation_state,existingDocuments:a.documents,fetchPage:async url=>({resource_kind:'pdf',classification_method:'http-mime-signature-v1',finalUrl:url})});
 const doc=b.documents[0];assert.equal(doc.title,'Sign Application Checklist');assert.equal(doc.doc_type,'checklist');assert.equal(doc.resource_classification.source_url,doc.url);
});
test('failures remain explicit and do not cause completed pages to repeat',async()=>{
 const a=await run();const b=await run({resume:a.continuation_state,fetchPage:async()=>{throw Error('unavailable');}});
 assert(b.gaps.some(g=>g.reason==='page_fetch_failed'));const c=await run({resume:b.continuation_state});assert.equal(c.attempted_pages,1);assert.equal(c.traversal_complete,false);assert.equal(c.gaps.length,1);
});
test('foreign seeds, off-host pending URLs, malformed depth and unknown cursor formats fail before fetching',async()=>{
 const a=await run();let fetches=0;for(const patch of [{seed_url:'https://other.example/forms'},{method:'other'},{pending_pages:[{url:'https://other.example/forms',depth:1}]},{pending_pages:[{url:'https://city.example/forms',depth:9}]},{attempted_pages_total:Infinity}])
 await assert.rejects(run({resume:{...a.continuation_state,...patch},fetchPage:async()=>{fetches++;}}));assert.equal(fetches,0);
});
function fixture(){let v=1,row={id:'j',updated_date:'v1',documents:[],discovery_scan_state:null,_manual_documents:false,permitting_url:seedUrl,website_url:'https://city.example'};let loseAck=false;
 const entity={get:async()=>structuredClone(row),updateMany:async(q,p)=>{if(q.updated_date!==row.updated_date)return{updated:0};row={...row,...p.$set,updated_date:'v'+(++v)};if(loseAck){loseAck=false;throw Error('lost acknowledgment');}return{updated:1};}};
 return{entity,get:()=>row,patch:p=>{row={...row,...p,updated_date:'v'+(++v)};},loseAck:()=>{loseAck=true;}};
}
const persist=(f,snapshot,scan)=>replaceJurisdictionFieldsIfUnchanged({entity:f.entity,jurisdiction:snapshot,nextFields:{documents:scan.documents,discovery_scan_state:scan.continuation_state},guardFields:{_manual_documents:snapshot._manual_documents,permitting_url:snapshot.permitting_url,website_url:snapshot.website_url}});
test('cursor and discovered links commit together; lost acknowledgment reconciles the same receipt',async()=>{
 const f=fixture(),snapshot=structuredClone(f.get()),a=await run();f.loseAck();await persist(f,snapshot,a);assert.deepEqual(f.get().documents,a.documents);assert.deepEqual(f.get().discovery_scan_state,a.continuation_state);
});
test('two writers cannot discard one another’s distinct saved frontier',async()=>{
 const f=fixture(),snapshot=structuredClone(f.get()),a=await run();await persist(f,snapshot,a);
 const different={...a,continuation_state:{...a.continuation_state,pending_pages:[]}};await assert.rejects(persist(f,snapshot,different),/another session/);assert.deepEqual(f.get().discovery_scan_state,a.continuation_state);
});
test('concurrent source URL, manual protection or document changes block stale progress writes',async()=>{
 for(const patch of [{permitting_url:'https://city.example/new-forms'},{_manual_documents:true},{documents:[{id:'staff',url:'https://city.example/manual.pdf'}]}]){const f=fixture(),snapshot=structuredClone(f.get()),a=await run();f.patch(patch);await assert.rejects(persist(f,snapshot,a));for(const [k,v]of Object.entries(patch))assert.deepEqual(f.get()[k],v);assert.equal(f.get().discovery_scan_state,null);}
});
