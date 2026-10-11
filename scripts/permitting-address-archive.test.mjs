import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {continuePermittingDocumentArchiveBacklog} from '../base44/shared/permittingDocumentArchiveBacklog.mjs';
import {archiveDocumentEligible} from '../base44/shared/jurisdictionArchiveContinuation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {retainAddressResearchFiles,archiveOwnedAddressResearchFile,archiveOwnedAddressResearchReferral,continueAddressResearchArchives} from '../base44/shared/permittingAddressArchive.mjs';
const actor={id:'employee',email:'Employee@example.com'},pdf='%PDF-1.7 sample';
function fixture(){
 let rows=[],version=0;const calls={uploads:0,source:0,stored:0,hosts:[]},state={failReadback:false,failUpload:false,html:false};
 const entity={filter:async q=>structuredClone(rows.filter(row=>Object.entries(q).every(([key,value])=>row[key]===value))),create:async data=>{const row={...structuredClone(data),id:'collection-'+rows.length,updated_date:'v'+(++version)};rows.push(row);return structuredClone(row);},get:async id=>structuredClone(rows.find(row=>row.id===id)),updateMany:async(q,patch)=>{let updated=0;rows=rows.map(row=>{if(!Object.entries(q).every(([key,value])=>row[key]===value))return row;updated++;return {...row,...structuredClone(patch.$set),updated_date:'v'+(++version)};});return {updated};}};
 const fetchSource=async(url,init,host)=>{calls.hosts.push(host);if(url.startsWith('https://files.example.com/')){calls.stored++;if(state.failReadback)throw Error('readback offline');}else calls.source++;return new Response(state.html?'<html>not a file</html>':pdf,{headers:{'content-type':state.html?'text/html':'application/pdf'}});};
 const uploadFile=async({file})=>{assert.equal(await file.text(),pdf);calls.uploads++;if(state.failUpload)throw Error('upload acknowledgement lost');return {file_url:'https://files.example.com/original.pdf'};};
 const automatic={started:true,scans:[{target:{name:'Example',state:'OH',type:'municipality'},continuation_state:{seed_url:'https://government.example.com/forms'},documents:[{url:'https://government.example.com/sign.pdf',title:'Sign form',source:'official_page_harvest',doc_type:'permit_application'},{url:'https://government.example.com/electrical.pdf',title:'Electrical form',source:'official_page_harvest'},{url:'https://outside.example.com/other.pdf',title:'Other',source:'official_page_harvest'}]}]};
 const options={entity,actor,scanRunId:'run-id',resolution:{status:'location_verified',state:'OH'},automatic,fetchSource,uploadFile};
 return {entity,calls,state,options,rows:()=>rows,patch:data=>{rows[0]={...rows[0],...data,updated_date:'v'+(++version)};}};
}
test('automatic address retention saves one original, verifies bytes and retains all same-host pending files separately',async()=>{
 const f=fixture(),events=[],r=await retainAddressResearchFiles({...f.options,onProgress:async e=>events.push(e)});
 assert.equal(r.collections.length,1);assert.equal(f.rows()[0].documents.length,2);assert.equal(f.calls.uploads,1);assert.deepEqual(f.calls.hosts,['government.example.com',null]);
 const doc=f.rows()[0].documents[0];assert.equal(doc.archive_state.status,'complete');assert.match(doc.source_sha256,/^[a-f0-9]{64}$/);assert.equal(doc.source_sha256,doc.stored_sha256);assert.equal(f.rows()[0].authority_established,false);assert.equal(f.rows()[0].reference_only,true);assert.equal(f.rows()[0].owner_email,'employee@example.com');assert(events.some(e=>e.kind==='download'));assert(events.some(e=>e.kind==='readback'));
});
test('replaying collection initialization keeps the same receipt and does not upload again',async()=>{
 const f=fixture();await retainAddressResearchFiles(f.options);await retainAddressResearchFiles({...f.options,archiveLimit:0});assert.equal(f.rows().length,1);assert.equal(f.calls.uploads,1);
});
test('manual selected pending file can be saved without an overall manual collection cap',async()=>{
 const f=fixture();await retainAddressResearchFiles(f.options);const row=f.rows()[0],doc=row.documents[1];const r=await archiveOwnedAddressResearchFile({...f.options,collectionId:row.id,documentId:doc.id});assert.equal(r.success,true);assert.equal(f.calls.uploads,2);assert(f.rows()[0].documents.every(d=>d.archive_state.status==='complete'));
});
test('foreign owner and changed reference scope cannot fetch, upload or modify collection',async()=>{
 const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const row=f.rows()[0],doc=row.documents[0];
 await assert.rejects(archiveOwnedAddressResearchFile({...f.options,actor:{id:'other',email:'other@example.com'},collectionId:row.id,documentId:doc.id}),/not available/);
 f.patch({authority_established:true});await assert.rejects(archiveOwnedAddressResearchFile({...f.options,collectionId:row.id,documentId:doc.id}),/not available/);assert.equal(f.calls.uploads,0);assert.equal(f.calls.source,0);
});
test('readback recovery verifies durable uploaded receipt without downloading or uploading again',async()=>{
 const f=fixture();f.state.failReadback=true;await retainAddressResearchFiles(f.options);assert.equal(f.calls.uploads,1);const row=f.rows()[0],doc=row.documents[0];assert.equal(doc.archive_state.status,'uploaded');f.state.failReadback=false;const r=await archiveOwnedAddressResearchFile({...f.options,collectionId:row.id,documentId:doc.id});assert.equal(r.success,true);assert.equal(f.calls.uploads,1);assert.equal(f.calls.source,1);
});
test('uncertain upload acknowledgement blocks manual duplicate upload',async()=>{
 const f=fixture();f.state.failUpload=true;await retainAddressResearchFiles(f.options);const row=f.rows()[0],doc=row.documents[0];assert.equal(doc.archive_state.status,'upload_uncertain');const r=await archiveOwnedAddressResearchFile({...f.options,collectionId:row.id,documentId:doc.id});assert.equal(r.skipped,true);assert.equal(f.calls.uploads,1);
});
test('HTML masquerading as a file is rejected before upload',async()=>{
 const f=fixture();f.state.html=true;const r=await retainAddressResearchFiles(f.options);assert.equal(r.status,'needs_review');assert.equal(f.calls.uploads,0);assert.equal(f.rows()[0].documents[0].file_url,undefined);
});
test('duplicate collection and unavailable activity refuse collection creation or archival',async()=>{
 const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});await f.entity.create(f.rows()[0]);const r=await retainAddressResearchFiles(f.options);assert.equal(r.status,'needs_review');assert.equal(f.calls.uploads,0);const unavailable=await retainAddressResearchFiles({...f.options,scanRunId:null});assert.equal(unavailable.status,'unavailable');assert.equal(f.calls.uploads,0);
});
test('unconfirmed location retains reference-only originals without manufacturing geographic verification',async()=>{
 const f=fixture();await retainAddressResearchFiles({...f.options,resolution:{status:'needs_review'}});assert.equal(f.rows()[0].location_verified,false);assert.equal(f.rows()[0].authority_established,false);
});

test('www aliases retain source scope and a changed external source is rejected before fetch',async()=>{
 const f=fixture();f.options.automatic.scans[0].documents[0].url='https://www.government.example.com/sign.pdf';const r=await retainAddressResearchFiles({...f.options,archiveLimit:0});assert.equal(r.collections[0].documents.length,2);const row=f.rows()[0];f.patch({documents:row.documents.map((d,i)=>i?d:{...d,url:'https://outside.example.com/sign.pdf'})});await assert.rejects(archiveOwnedAddressResearchFile({...f.options,collectionId:row.id,documentId:row.documents[0].id}),/outside the saved host/);assert.equal(f.calls.source,0);
});
test('owner change during upload prevents receipt writes and result disclosure under old owner',async()=>{
 const f=fixture();const upload=f.options.uploadFile;const r=await retainAddressResearchFiles({...f.options,uploadFile:async data=>{const result=await upload(data);f.patch({owner_id:'other'});return result;}});assert.equal(r.status,'needs_review');assert.equal(r.collections[0].documents,undefined);assert.equal(f.rows()[0].documents[0].file_url,undefined);assert.equal(f.rows()[0].owner_id,'other');
});

function backgroundFixture(f){
 const actions=new Map(),sourceRun={id:'run-id',status:'complete',action_kind:'address',owner_id:actor.id,owner_email:actor.email.toLowerCase()};
 const scanEntity={get:async id=>id==='run-id'?structuredClone(sourceRun):structuredClone(actions.get(id)),filter:async q=>[...actions.values()].filter(row=>row.action_token===q.action_token),create:async data=>{const row={id:'action-'+actions.size,...structuredClone(data)};actions.set(row.id,row);return row;},update:async(id,patch)=>{const row={...actions.get(id),...structuredClone(patch)};actions.set(id,row);return row;}};
 const entity={...f.entity,filter:async(q,...args)=>typeof q.state==='string'?structuredClone(f.rows().filter(row=>row.state===q.state&&row.auto_refresh===true&&(row.discovery_scan_state?.external_referrals?.some(ref=>!(row.documents || []).some(doc=>doc.url===ref.url))||row.documents.some(doc=>archiveDocumentEligible(doc,{scopedExternal:true,now:Date.parse((q.documents || q.$or?.[0]?.documents)?.$elemMatch?.$and?.[0]?.$or?.[1]?.['archive_state.retry_after']?.$lte || '') || Date.now()}))))):f.entity.filter(q,...args)};
 return {entity,scanEntity,sourceRun,actions,fetchSource:f.options.fetchSource,uploadFile:f.options.uploadFile,state:'OH'};
}
test('automatic continuation archives the pending original with owner-scoped per-file activity and no research call',async()=>{
 const f=fixture();await retainAddressResearchFiles(f.options);const options=backgroundFixture(f),r=await continueAddressResearchArchives(options);assert.equal(r.archived,1);assert.equal(r.archive_queue,'address');assert.equal(r.collection,undefined);assert.equal(r.jurisdiction,undefined);assert.equal(f.calls.uploads,2);const run=[...options.actions.values()][0];assert.equal(run.owner_id,actor.id);assert.equal(run.action_kind,'address_archive');assert.equal(run.status,'complete');assert(run.events.some(e=>e.kind==='saved_original'));assert(run.events.some(e=>e.kind==='download'));
});
test('automatic continuation refuses changed origin owners, active initial scans and disabled collections',async()=>{
 for(const mode of ['foreign','running','disabled']){
  const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const options=backgroundFixture(f);
  if(mode==='foreign')options.sourceRun.owner_id='foreign';
  if(mode==='running')options.sourceRun.status='running';
  if(mode==='disabled')f.patch({auto_refresh:false});
  const r=await continueAddressResearchArchives(options);assert.equal(r.skipped,true);assert.equal(f.calls.uploads,0);assert.equal(options.actions.size,0);
 }
});
test('automatic readback recovery respects backoff and reuses the durable uploaded receipt',async()=>{
 const f=fixture();f.state.failReadback=true;await retainAddressResearchFiles(f.options);const options=backgroundFixture(f);f.state.failReadback=false;f.patch({documents:[f.rows()[0].documents[0]]});const r=await continueAddressResearchArchives({...options,now:()=>Date.now()+24*60*60*1000});assert.equal(r.archived,1);assert.equal(f.calls.uploads,1);assert.equal(f.calls.source,1);
});
test('duplicate collections cannot upload in the automatic worker',async()=>{
 const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});await f.entity.create({...f.rows()[0],id:undefined});const options=backgroundFixture(f),r=await continueAddressResearchArchives(options);assert.equal(r.success,false);assert.equal(f.calls.uploads,0);
});
function repositoryFixture(state='OH'){
 let row={id:'repository',name:'Repository',state,updated_date:'v1',documents:[{id:'repo-file',url:'https://government.example.com/repo.pdf',title:'Repository form',source:'official_page_harvest'}]},version=1;
 return {filter:async q=>q.state===row.state&&(row.discovery_scan_state?.external_referrals?.some(ref=>!(row.documents || []).some(doc=>doc.url===ref.url))||row.documents.some(doc=>archiveDocumentEligible(doc))?[structuredClone(row)]:[],get:async()=>structuredClone(row),updateMany:async(q,patch)=>{if(q.updated_date!==row.updated_date)return {updated:0};row={...row,...structuredClone(patch.$set),updated_date:'v'+(++version)};return {updated:1};}};
}
test('queue rotation selects one address or repository original without expanding the one-file cycle budget',async()=>{
 for(const preferAddressArchives of [true,false]){
  const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const address=backgroundFixture(f),r=await continuePermittingDocumentArchiveBacklog({entity:repositoryFixture(),addressEntity:address.entity,scanEntity:address.scanEntity,fetchAddressSource:address.fetchSource,fetchSource:address.fetchSource,uploadFile:address.uploadFile,preferAddressArchives});
  assert.equal(r.archive_queue,preferAddressArchives?'address':'jurisdiction');assert.equal(f.calls.uploads,1);
 }
});
test('Ohio address originals precede Kentucky repository files even on a repository-preferred turn',async()=>{
 const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const address=backgroundFixture(f),empty=repositoryFixture('KY');
 const r=await continuePermittingDocumentArchiveBacklog({entity:empty,addressEntity:address.entity,scanEntity:address.scanEntity,fetchAddressSource:address.fetchSource,fetchSource:address.fetchSource,uploadFile:address.uploadFile,preferAddressArchives:false});
 assert.equal(r.archive_queue,'address');assert.equal(f.calls.uploads,1);
});

test('automatic pause during upload preserves the pause and prevents a second file attempt in the cycle',async()=>{
 const f=fixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});await f.entity.create({...f.rows()[0],collection_key:'run-id:1'});const options=backgroundFixture(f),upload=options.uploadFile;
 const r=await continueAddressResearchArchives({...options,uploadFile:async data=>{const result=await upload(data);f.patch({auto_refresh:false});return result;}});
 assert.equal(r.success,false);assert.equal(f.calls.uploads,1);assert.equal(f.rows()[0].auto_refresh,false);assert.equal(f.rows()[1].documents[0].archive_state,undefined);
});

async function externalFixture(){
 const f=fixture(),html='<a href="https://outside.example.com/sign.pdf">Sign form</a><a href="https://portal.example.com/apply">Apply online</a>';
 const scan=await scanOfficialPermittingPages({seedUrl:'https://government.example.com/forms',fetchPage:async()=>new Response(html,{headers:{'content-type':'text/html'}}),maxPages:1,maxDepth:1});
 f.options.automatic.scans=[{target:{name:'Example',state:'OH',type:'municipality'},...scan}];
 const fetch=f.options.fetchSource;f.state.linkPresent=true;f.options.fetchSource=async(url,init,host)=>{if(url==='https://government.example.com/forms'){f.calls.source++;f.calls.hosts.push(host);return new Response(f.state.linkPresent?html:'<p>No form remains</p>',{headers:{'content-type':'text/html'}});}return fetch(url,init,host);};
 return f;
}
test('external-only address findings retain exact referrals and save one verified direct original with origin recheck',async()=>{const f=await externalFixture(),events=[];const r=await retainAddressResearchFiles({...f.options,onProgress:async e=>events.push(e)});assert.equal(r.status,'retained');assert.equal(f.calls.uploads,1);assert.deepEqual(f.calls.hosts,['government.example.com','outside.example.com',null]);const c=f.rows()[0];assert.equal(c.documents.length,1);assert.equal(c.discovery_scan_state.external_referrals.length,1);assert.equal(c.documents[0].archive_state.status,'complete');assert.equal(c.documents[0].external_referral_provenance.seed_url,c.permitting_url);assert.equal(c.documents[0].external_referral_provenance.jurisdiction_id,c.id);assert(events.some(e=>e.kind==='official_link_recheck'));assert.equal(c.authority_established,false);});
test('retained external reference can be selected manually without broad host approval',async()=>{const f=await externalFixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const c=f.rows()[0],ref=c.discovery_scan_state.external_referrals[0];assert.equal(c.documents.length,0);const result=await archiveOwnedAddressResearchReferral({...f.options,collectionId:c.id,selection:ref});assert.equal(result.success,true);assert.equal(f.calls.uploads,1);assert.equal(f.rows()[0].documents[0].archive_state.status,'complete');});
test('external automatic continuation selects retained referral with one-file budget and owner progress',async()=>{const f=await externalFixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const options={...backgroundFixture(f),fetchSource:f.options.fetchSource},result=await continueAddressResearchArchives(options);assert.equal(result.archived,1);assert.equal(result.archive_queue,'address');assert.equal(f.calls.uploads,1);assert.equal([...options.actions.values()][0].owner_id,actor.id);assert.equal(result.collection,undefined);});
test('removed referring-page link blocks external bytes and uploads',async()=>{const f=await externalFixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});f.state.linkPresent=false;const c=f.rows()[0],ref=c.discovery_scan_state.external_referrals[0];await assert.rejects(archiveOwnedAddressResearchReferral({...f.options,collectionId:c.id,selection:ref}),/exact selected/);assert.equal(f.calls.uploads,0);assert(!f.calls.hosts.includes('outside.example.com'));});
test('foreign owner, missing page provenance and arbitrary selection cannot authorize external fetches',async()=>{for(const mode of ['owner','page','selection']){const f=await externalFixture();await retainAddressResearchFiles({...f.options,archiveLimit:0});const c=f.rows()[0],ref=c.discovery_scan_state.external_referrals[0];if(mode==='owner')f.options.actor={id:'foreign',email:'foreign@example.com'};if(mode==='page')f.patch({discovery_scan_state:{...c.discovery_scan_state,visited_urls:[]}});await assert.rejects(archiveOwnedAddressResearchReferral({...f.options,collectionId:c.id,selection:mode==='selection'?{...ref,url:'https://arbitrary.example/file.pdf'}:ref}));assert.equal(f.calls.source,0);assert.equal(f.calls.uploads,0);}});
test('external readback recovery reuses stored receipt without another origin-page fetch or upload',async()=>{const f=await externalFixture();f.state.failReadback=true;await retainAddressResearchFiles(f.options);const c=f.rows()[0],d=c.documents[0];assert.equal(d.archive_state.status,'uploaded');const requests=f.calls.source;f.state.failReadback=false;f.state.linkPresent=false;const result=await archiveOwnedAddressResearchFile({...f.options,collectionId:c.id,documentId:d.id});assert.equal(result.success,true);assert.equal(f.calls.uploads,1);assert.equal(f.calls.source,requests);});
test('external uncertain upload does not repeat upload; changed owner during upload cannot publish receipt',async()=>{const f=await externalFixture();f.state.failUpload=true;await retainAddressResearchFiles(f.options);const c=f.rows()[0],d=c.documents[0];assert.equal(d.archive_state.status,'upload_uncertain');await archiveOwnedAddressResearchFile({...f.options,collectionId:c.id,documentId:d.id});assert.equal(f.calls.uploads,1);const g=await externalFixture(),upload=g.options.uploadFile;const result=await retainAddressResearchFiles({...g.options,uploadFile:async data=>{const saved=await upload(data);g.patch({owner_id:'foreign'});return saved;}});assert.equal(result.status,'needs_review');assert.equal(result.collections[0].documents,undefined);assert.equal(g.rows()[0].documents[0].file_url,undefined);});
test('HTTP or tampered external referral stays outside retained download scope',async()=>{for(const mode of ['http','hash']){const f=await externalFixture();const ref=f.options.automatic.scans[0].external_referrals[0];if(mode==='http')ref.url=ref.linked_href='http://outside.example.com/sign.pdf';else ref.source_page_sha256='invalid';const result=await retainAddressResearchFiles(f.options);assert.equal(result.collections.length,0);assert.equal(f.calls.uploads,0);}});
