import test from 'node:test';import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {readPermittingResourceResponse} from '../base44/shared/permittingResourceResponse.mjs';
import {archiveKnownJurisdictionSource} from '../base44/shared/jurisdictionArchiveContinuation.mjs';
import {extractKnownSourceText,automaticSourceTextGuard} from '../base44/shared/jurisdictionSourceTextContinuation.mjs';
import {readVerifiedPdfArchive,extractPdfTextChunk} from '../base44/shared/jurisdictionSourcePdfText.mjs';

test('extensionless discovery → verified archive → catalog → real PDF text stays review-pending',async()=>{
 const pdf=new jsPDF();pdf.text('Sign application checklist: fixture evidence only.',20,20);const bytes=new Uint8Array(pdf.output('arraybuffer'));
 const seed='https://city.example/forms',url='https://city.example/assets/sign-application',stored='https://storage.example/sign-application.pdf';
 const fetchSource=async link=>new Response(link===seed?'<a href="/assets/sign-application">Sign Application</a>':bytes,{headers:{'content-type':link===seed?'text/html':'application/pdf'}});
 const scan=await scanOfficialPermittingPages({seedUrl:seed,fetchPage:async link=>({...await readPermittingResourceResponse(await fetchSource(link)),finalUrl:link})});
 const doc=scan.documents.find(d=>d.url===url);assert.equal(doc.resource_classification.kind,'pdf');
 let version=1,profile={id:'fixture',name:'Fixture City',state:'OH',website_url:'https://city.example',updated_date:'v1',documents:[{...doc,id:'doc'}]};
 const entity={get:async()=>structuredClone(profile),updateMany:async(q,p)=>{if(q.updated_date!==profile.updated_date)return{updated:0};profile={...profile,...p.$set,updated_date:'v'+(++version)};return{updated:1};}};
 let source,uploads=0,creates=0,sourceVersion=1;
 const catalogEntity={filter:async()=>source?[structuredClone(source)]:[],create:async data=>{creates++;source={...data,id:'source',updated_date:'s1'};return structuredClone(source);},get:async()=>structuredClone(source),updateMany:async(q,p)=>{if(q.updated_date!==source.updated_date)return{updated:0};source={...source,...p.$set,updated_date:'s'+(++sourceVersion)};return{updated:1};}};
 const archive=await archiveKnownJurisdictionSource({entity,catalogEntity,jurisdictionId:'fixture',documentId:'doc',fetchSource,uploadFile:async({file})=>{uploads++;assert.equal(file.type,'application/pdf');assert(file.name.endsWith('.pdf'));assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);return{file_url:stored};}});
 assert.equal(archive.archived,1);assert.equal(creates,1);assert.equal(source.verification_status,'needs_verification');
 globalThis.pdfjsWorker={WorkerMessageHandler};
 const text=await extractKnownSourceText({entity:catalogEntity,sourceDocumentId:'source',automatic:true,canAutomaticallyExtract:automaticSourceTextGuard(entity),readAndExtract:async({source,startPage})=>extractPdfTextChunk({source,startPage,bytes:await readVerifiedPdfArchive(source,fetchSource),openPdf:data=>getDocument({data,isEvalSupported:false,disableFontFace:true,verbosity:0})})});
 assert.equal(text.status,'complete');assert.equal(source.extracted_pages.length,1);assert(source.extracted_pages[0].text.includes('fixture evidence only'));
 assert.equal(source.verification_status,'needs_verification');assert.equal(source.content_status,'unknown');
 assert.equal(uploads,1);assert.equal(creates,1);assert.equal((await archiveKnownJurisdictionSource({entity,jurisdictionId:'fixture',documentId:'doc',fetchSource,uploadFile:async()=>{throw Error('duplicate upload');}})).skipped,true);
});
