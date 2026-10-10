import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {validatePermitDocumentBytes} from '../base44/shared/permittingDocumentValidation.mjs';
import {discoverOfficialPermittingResources} from '../base44/shared/jurisdictionPermittingLinkDiscovery.mjs';
import {archiveKnownJurisdictionSource} from '../base44/shared/jurisdictionArchiveContinuation.mjs';
const originalPaths=[
 'docs/official-evidence/ohio-nearby-offices-2026-10-07/deer-park-building-process.docx',
 'docs/official-evidence/ohio-nearby-offices-2026-10-07/deer-park-building-zoning-application.doc',
 'docs/official-evidence/ohio-elmwoodplace-2026-10-07/fee-schedule-2024.xlsx',
 'docs/official-evidence/ohio-elmwoodplace-2026-10-07/right-of-way.docx'];
const originals=originalPaths.map(path=>({path,format:path.split('.').at(-1),bytes:new Uint8Array(readFileSync(path))}));
test('retained Ohio Word and Excel originals pass without changing their bytes',()=>{
 for(const row of originals){const before=row.bytes.slice();const result=validatePermitDocumentBytes(row.bytes,{format:row.format});
 assert.equal(result.format,row.format);assert.equal(result.validation_method,'document-container-signature-v1');assert.deepEqual(row.bytes,before);}
});
test('HTML with missing, generic or forged document MIME is rejected for every supported format',()=>{
 for(const format of ['pdf','doc','docx','xls','xlsx','txt','csv'])for(const contentType of ['', 'application/octet-stream','application/msword'])
 assert.throws(()=>validatePermitDocumentBytes(new TextEncoder().encode('\uFEFF <!DOCTYPE HTML><html>Access denied</html>'),{format,contentType}),/HTML/);
});
test('Office ZIP subtype mismatch, truncation and directory corruption require review',()=>{
 const docx=originals[0].bytes,xlsx=originals[2].bytes;
 assert.throws(()=>validatePermitDocumentBytes(docx,{format:'xlsx'}),/requested document format/);
 assert.throws(()=>validatePermitDocumentBytes(xlsx,{format:'docx'}),/requested document format/);
 for(const bytes of [docx.subarray(0,80),docx.subarray(0,docx.length-1),new TextEncoder().encode('PK\u0003\u0004 fake zip')])
 assert.throws(()=>validatePermitDocumentBytes(bytes,{format:'docx'}));
 const bad=docx.slice();let entry=-1;
 for(let i=0;i<bad.length-4;i++)if(bad[i]===80&&bad[i+1]===75&&bad[i+2]===1&&bad[i+3]===2){entry=i;break;}
 assert(entry>=0);new DataView(bad.buffer).setUint32(entry+42,0xffffffff,true);
 assert.throws(()=>validatePermitDocumentBytes(bad,{format:'docx'}),/invalid Office ZIP entry/);
});
test('binary, unknown and unsupported text encodings cannot masquerade as text documents',()=>{
 assert.equal(validatePermitDocumentBytes(new TextEncoder().encode('Fee,Amount\nReview,50'),{format:'csv'}).format,'csv');
 assert.throws(()=>validatePermitDocumentBytes(new Uint8Array([0xff,0xfe,0]),{format:'txt'}),/encoding/);
 assert.throws(()=>validatePermitDocumentBytes(new Uint8Array([65,0,66]),{format:'txt'}),/binary/);
 assert.throws(()=>validatePermitDocumentBytes(new Uint8Array([65]),{format:'exe'}),/Unsupported/);
});
test('embedded resource discovery preserves source identity, host scope and duplicate rejection',()=>{
 const seed='https://county.gov/forms',html=
 '<base href="https://county.gov/"><object data="files/sign-application.docx" title="Sign application"></object>'+
 '<embed src="/files/sign-fees.xlsx" aria-label="Sign Fees">'+
 '<iframe src="/files/electrical-checklist.pdf" title="Electrical checklist"></iframe>'+
 '<a href="/files/sign-application.docx#page=1">Sign Application</a>'+
 '<object data="https://outside.test/sign.pdf" title="Sign"></object>'+
 '<embed src="https://user:pass@county.gov/sign.pdf" title="Sign">'+
 '<iframe src="/video" title="Sign installation"></iframe>'+
 '<script><embed src="/fake-sign.pdf"></script><!-- <object data="/old-sign.pdf"> -->';
 const rows=discoverOfficialPermittingResources(html,seed);
 assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.url)).size,4);
 assert.equal(rows.find(r=>r.url.endsWith('sign-fees.xlsx')).discovery_element,'embed');
 assert.equal(rows.find(r=>r.url.endsWith('electrical-checklist.pdf')).doc_type,'checklist');
 assert(rows.every(r=>r.url.startsWith('https://county.gov/')));
 assert(rows.every(r=>r.authority_verified!==true));
});
test('extensionless embedded PDF declarations are discovered but do not claim byte classification',()=>{
 const rows=discoverOfficialPermittingResources('<object type="application/pdf" data="/assets/sign" title="Sign application"></object>','https://county.gov/forms');
 const doc=rows.find(r=>r.url.endsWith('/sign'));assert(doc);assert.equal(doc.resource_classification,undefined);
});
async function archiveFixture(format,bytes){
 let version=1,uploads=0,stored;
 let profile={id:'fixture',name:'Fixture Ohio locality',state:'OH',updated_date:'v1',documents:[{id:'doc',url:'https://county.gov/sign.'+format,source:'official_page_harvest'}]};
 const entity={get:async()=>structuredClone(profile),updateMany:async(q,p)=>{
 if(q.updated_date!==profile.updated_date)return{updated:0};profile={...profile,...p.$set,updated_date:'v'+(++version)};return{updated:1};}};
 const options={entity,jurisdictionId:'fixture',documentId:'doc',fetchSource:async url=>new Response(url.includes('storage.test')?stored:bytes,{headers:{'content-type':'application/octet-stream'}}),
 uploadFile:async({file})=>{uploads++;stored=new Uint8Array(await file.arrayBuffer());return{file_url:'https://storage.test/original'};}};
 const result=await archiveKnownJurisdictionSource(options);
 return {result,uploads,profile,options};
}
test('worker rejects disguised HTML before upload and records a recoverable failed source',async()=>{
 for(const format of ['doc','docx','xls','xlsx','csv','txt']){
 const f=await archiveFixture(format,new TextEncoder().encode('<html>Server error</html>'));
 assert.equal(f.result.success,false);assert.equal(f.uploads,0);assert.equal(f.profile.documents[0].archive_state.status,'failed');
 assert.equal(f.profile.documents[0].file_url,undefined);assert.match(f.result.error,/HTML/);}
});
test('real Office originals run through download, upload and readback once with validation provenance',async()=>{
 for(const row of originals){const f=await archiveFixture(row.format,row.bytes);const doc=f.profile.documents[0];
 assert.equal(f.result.archived,1);assert.equal(f.uploads,1);
 assert.equal(doc.source_sha256,doc.stored_sha256);assert.equal(doc.source_bytes,row.bytes.length);
 assert.equal(doc.archive_state.detected_format,row.format);assert.equal(doc.archive_state.validation_method,'document-container-signature-v1');
 assert.equal(doc.archive_state.source_final_url,doc.url);
 assert.equal((await archiveKnownJurisdictionSource(f.options)).skipped,true);}
});
test('compiled direct downloader blocks forged Office document before storage despite matching expected hash',async()=>{
 const output=await build({entryPoints:['base44/functions/downloadPermitPDF/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onResolve({filter:/safeExternalFetch\.ts$/},()=>({path:'fetch',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'js',contents:path==='sdk'?'export const createClientFromRequest=()=>globalThis.directFixture;':'export const safeExternalFetch=async()=>new Response(globalThis.directBytes,{headers:{"content-type":"application/octet-stream"}});'}));}}]});
 let handler;globalThis.Deno={serve:fn=>{handler=fn;}};
 await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 const bytes=new TextEncoder().encode('<html>Not a Word form</html>');
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 let uploads=0,writes=0;globalThis.directBytes=bytes;
 globalThis.directFixture={auth:{me:async()=>({role:'admin'})},entities:{JurisdictionProfile:{
 get:async()=>({id:'fixture',documents:[{url:'https://county.gov/sign.doc',source_sha256:hash,source_bytes:bytes.length}]}),
 updateMany:async()=>{writes++;throw Error('Unexpected write');}}},integrations:{Core:{UploadFile:async()=>{uploads++;throw Error('Unexpected upload');}}}};
 const response=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({jurisdiction_id:'fixture',document_url:'https://county.gov/sign.doc'})}));
 assert.equal(response.status,415);assert.equal(uploads,0);assert.equal(writes,0);assert.match((await response.json()).error,/HTML/);
});
