import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {PDF_TEXT_MAX_BYTES,readVerifiedPdfArchive,extractPdfTextChunk,textSha256} from '../base44/shared/jurisdictionSourcePdfText.mjs';
test('retained Sharonville guide fits bounded extraction and preserves first batch provenance',async()=>{
 const bytes=new Uint8Array(readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/residential-guide-2026.pdf'));
 const source={id:'synthetic-guide',archived_file_url:'https://storage.test/guide.pdf',file_bytes:11002258,
 file_hash_sha256:'4086899c8a7bceb4ebc12bc891bc2107729d17616503e4941c60390ed62104d9'};
 assert.equal(PDF_TEXT_MAX_BYTES,12*1024*1024);assert.ok(bytes.length>10*1024*1024);
 const verified=await readVerifiedPdfArchive(source,async()=>new Response(bytes));
 const chunk=await extractPdfTextChunk({bytes:verified,source,openPdf:data=>getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,verbosity:0})});
 assert.deepEqual(chunk.pages.map(p=>p.page),[1,2,3,4,5]);assert.equal(chunk.next_page,6);
 for(const page of chunk.pages){assert.equal(page.source_sha256,source.file_hash_sha256);assert.equal(page.source_document_id,source.id);assert.equal(page.text_sha256,await textSha256(new TextEncoder().encode(page.text)));}
});
test('stream exceeding new hard bound cancels before hash or parsing',async()=>{
 let cancelled=false;
 const response={ok:true,headers:new Headers({'content-type':'application/pdf'}),body:new ReadableStream({
 start(c){c.enqueue(new Uint8Array(PDF_TEXT_MAX_BYTES+1));},cancel(){cancelled=true;}})};
 await assert.rejects(readVerifiedPdfArchive({archived_file_url:'https://storage.test/guide.pdf'},async()=>response),/bounded/);
 assert.equal(cancelled,true);
});
