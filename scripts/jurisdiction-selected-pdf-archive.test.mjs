import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {archiveKnownJurisdictionSource} from '../base44/shared/jurisdictionArchiveContinuation.mjs';

const bytes=Buffer.from('%PDF-1.7 retained official form');
const knownPdf={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
function fixture({extra={},readbackFails=false,uploadUncertain=false,responseBytes=bytes,contentType='application/pdf',host='https://city.example'}={}){
 let version=1,profile={id:'j',name:'City',state:'OH',website_url:host,updated_date:'v1',documents:[
 {id:'selected',url:'https://city.example/forms/sign-application/',title:'Sign application',doc_type:'permit_application',source:'official_page_harvest',...extra},
 {id:'html',url:'https://city.example/forms/',title:'Forms page',source:'official_page_harvest'}]};
 const rows=[],calls={uploads:0,downloads:0,readbacks:0,creates:0};
 const entity={get:async()=>structuredClone(profile),updateMany:async(q,p)=>{
 if(q.updated_date!==profile.updated_date)return{updated:0};profile={...profile,...p.$set,updated_date:'v'+(++version)};return{updated:1};}};
 const api={entity,jurisdictionId:'j',documentId:'selected',manual:true,knownPdf,
 catalogEntity:{filter:async()=>structuredClone(rows),create:async data=>{calls.creates++;const row={...data,id:'source'};rows.push(row);return row;}},
 fetchSource:async url=>{if(url.startsWith('https://storage.example')){calls.readbacks++;if(readbackFails)throw Error('Readback unavailable');return new Response(bytes,{headers:{'content-type':'application/pdf'}});}
 calls.downloads++;return new Response(responseBytes,{headers:{'content-type':contentType}});},
 uploadFile:async({file})=>{calls.uploads++;assert.equal(file.name,'sign-application.pdf');assert.equal(file.type,'application/pdf');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);if(uploadUncertain)throw Error('Lost upload acknowledgement');return{file_url:'https://storage.example/sign-application.pdf'};}};
 return{api,calls,rows,profile:()=>profile,recover:()=>{readbackFails=false;},patch:patch=>{profile={...profile,...patch,updated_date:'v'+(++version)};}};
}
test('explicit hash-bound PDF selection archives an extensionless official URL and catalogs it without authority',async()=>{
 const f=fixture();const before=structuredClone(f.profile().documents[1]);const r=await archiveKnownJurisdictionSource(f.api);
 assert.equal(r.archived,1);assert.equal(r.catalog.created,1);assert.equal(f.calls.uploads,1);
 assert.equal(f.profile().documents[0].stored_sha256,knownPdf.sha256);assert.deepEqual(f.profile().documents[1],before);
 assert.equal(f.rows[0].authority_classification,'application_form');assert.equal(f.rows[0].content_status,'unknown');
 assert.equal(f.rows[0].verification_status,'needs_verification');assert.equal(f.rows[0].issuing_office,undefined);
});
test('automatic and unbound manual requests leave extensionless resources untouched',async()=>{
 for(const patch of [{manual:false,knownPdf:null},{knownPdf:null},{documentId:'',knownPdf:null}]){
 const f=fixture();assert.equal((await archiveKnownJurisdictionSource({...f.api,...patch})).skipped,true);
 assert.equal(f.calls.downloads,0);assert.equal(f.calls.uploads,0);}
});
test('known PDF mode requires manual selection, valid fingerprint and bounded bytes',async()=>{
 for(const patch of [{manual:false},{documentId:''},{knownPdf:{...knownPdf,sha256:'bad'}},{knownPdf:{...knownPdf,bytes:500000000}},{knownPdf:{...knownPdf,bytes:1.5}}]){
 const f=fixture();await assert.rejects(archiveKnownJurisdictionSource({...f.api,...patch}),/selected manual PDF/);assert.equal(f.calls.downloads,0);}
});
test('selected PDF must start on the canonical official host',async()=>{
 const f=fixture({host:'https://another.example'});await assert.rejects(archiveKnownJurisdictionSource(f.api),/canonical profile/);
 assert.equal(f.calls.downloads,0);assert.equal(f.profile().documents[0].archive_state,undefined);
});
test('HTML, forged PDF content and changed original bytes cannot upload',async()=>{
 for(const options of [{contentType:'text/html',responseBytes:Buffer.from('<html>portal</html>')},{responseBytes:Buffer.from('not a PDF')},{responseBytes:Buffer.from('%PDF-1.7 changed form')},{contentType:'application/octet-stream'}]){
 const f=fixture(options);const r=await archiveKnownJurisdictionSource(f.api);assert.equal(r.status,'failed');assert.equal(f.calls.uploads,0);assert.equal(f.calls.creates,0);}
});
test('manual, pinned, hashed, archived and collection protections remain absolute',async()=>{
 for(const extra of [{source:'manual'},{pinned:true},{archive_pinned:true},{source_sha256:'kept'},{file_url:'kept'}]){
 const f=fixture({extra});assert.equal((await archiveKnownJurisdictionSource(f.api)).skipped,true);assert.equal(f.calls.downloads,0);}
 const f=fixture();f.patch({_manual_documents:true});assert.equal((await archiveKnownJurisdictionSource(f.api)).reason,'manual_collection');
});
test('concurrent selected PDF calls upload only once',async()=>{
 const f=fixture();const results=await Promise.allSettled([archiveKnownJurisdictionSource({...f.api,token:'a'}),archiveKnownJurisdictionSource({...f.api,token:'b'})]);
 assert.equal(f.calls.uploads,1);assert.equal(f.calls.creates,1);assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.archived===1).length,1);
});
test('uncertain upload and complete redelivery never repeat uploads or creates',async()=>{
 const uncertain=fixture({uploadUncertain:true});assert.equal((await archiveKnownJurisdictionSource(uncertain.api)).status,'upload_uncertain');
 assert.equal((await archiveKnownJurisdictionSource(uncertain.api)).skipped,true);assert.equal(uncertain.calls.uploads,1);
 const f=fixture();await archiveKnownJurisdictionSource(f.api);assert.equal((await archiveKnownJurisdictionSource(f.api)).skipped,true);
 assert.equal(f.calls.uploads,1);assert.equal(f.calls.creates,1);
});
test('readback resumes the saved upload and rejects changed retained expectations',async()=>{
 const f=fixture({readbackFails:true});assert.equal((await archiveKnownJurisdictionSource(f.api)).status,'uploaded');
 await assert.rejects(archiveKnownJurisdictionSource({...f.api,knownPdf:{...knownPdf,sha256:'b'.repeat(64)}}),/expectation changed/);
 f.recover();assert.equal((await archiveKnownJurisdictionSource(f.api)).archived,1);
 assert.equal(f.calls.uploads,1);assert.equal(f.calls.downloads,1);assert.equal(f.calls.readbacks,2);
});

const pdfHint={kind:'pdf',method:'http-mime-signature-v1',source_url:'https://city.example/forms/sign-application/'};
test('classified extensionless PDF uses the automatic hash/readback/catalog pipeline',async()=>{
 const f=fixture({extra:{resource_classification:pdfHint}});const r=await archiveKnownJurisdictionSource({...f.api,manual:false,knownPdf:null});
 assert.equal(r.archived,1);assert.equal(r.catalog.created,1);assert.equal(f.calls.uploads,1);assert.equal(f.profile().documents[0].stored_sha256,knownPdf.sha256);
 assert.equal(f.rows[0].verification_status,'needs_verification');assert.equal(f.rows[0].content_status,'unknown');
});
test('classified resource changed to HTML or forged PDF cannot upload',async()=>{
 for(const options of [{contentType:'text/html'},{responseBytes:Buffer.from('not a PDF')}]){const f=fixture({...options,extra:{resource_classification:pdfHint}});const r=await archiveKnownJurisdictionSource({...f.api,manual:false,knownPdf:null});assert.equal(r.status,'failed');assert.equal(f.calls.uploads,0);}
});
test('classified automatic retry verifies saved upload rather than uploading again',async()=>{
 const f=fixture({extra:{resource_classification:pdfHint},readbackFails:true});const args={...f.api,manual:false,knownPdf:null};assert.equal((await archiveKnownJurisdictionSource(args)).status,'uploaded');f.recover();
 // Automatic backoff is retained; an authorized manual retry resumes this receipt.
 assert.equal((await archiveKnownJurisdictionSource({...args,manual:true})).archived,1);assert.equal(f.calls.uploads,1);assert.equal(f.calls.downloads,1);
});
test('classification does not override pinned/manual/collection protection or upload uncertainty',async()=>{
 for(const extra of [{pinned:true},{archive_pinned:true},{source:'manual'}]){const f=fixture({extra:{resource_classification:pdfHint,...extra}});assert.equal((await archiveKnownJurisdictionSource({...f.api,manual:false,knownPdf:null})).skipped,true);assert.equal(f.calls.uploads,0);}
 const f=fixture({extra:{resource_classification:pdfHint},uploadUncertain:true});const args={...f.api,manual:false,knownPdf:null};assert.equal((await archiveKnownJurisdictionSource(args)).status,'upload_uncertain');assert.equal((await archiveKnownJurisdictionSource(args)).skipped,true);assert.equal(f.calls.uploads,1);
});
