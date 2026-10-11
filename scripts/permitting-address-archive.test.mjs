import test from 'node:test';
import assert from 'node:assert/strict';
import {retainAddressResearchFiles,archiveOwnedAddressResearchFile} from '../base44/shared/permittingAddressArchive.mjs';
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
