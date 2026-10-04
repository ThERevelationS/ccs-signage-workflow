import test from 'node:test';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {extractPdfTextChunk,readVerifiedPdfArchive,textSha256,pdfItemsText,PDF_TEXT_MAX_BYTES} from '../base44/shared/jurisdictionSourcePdfText.mjs';
function makePdf() {const pdf=new jsPDF();for(let p=1;p<=7;p++){if(p>1)pdf.addPage();pdf.text('Original document text page '+p,20,20);}return new Uint8Array(pdf.output('arraybuffer'));}
const openPdf=data=>getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,verbosity:0});
test('real PDF text parser preserves physical page numbers and resumes after five pages',async()=>{
 const bytes=makePdf();const source={id:'s',file_hash_sha256:await textSha256(bytes)};
 const first=await extractPdfTextChunk({bytes:bytes.slice(),source,openPdf});
 assert.equal(first.total_pages,7);assert.equal(first.pages.length,5);assert.equal(first.next_page,6);
 for(const page of first.pages){assert.ok(page.text.includes('Original document text page '+page.page));assert.equal(page.source_sha256,source.file_hash_sha256);assert.equal(page.text_sha256,await textSha256(new TextEncoder().encode(page.text)));}
 const last=await extractPdfTextChunk({bytes:bytes.slice(),source,startPage:6,openPdf});assert.deepEqual(last.pages.map(p=>p.page),[6,7]);assert.equal(last.next_page,8);
});
test('archive bytes must match the exact saved catalog hash and size',async()=>{
 const bytes=makePdf();const source={archived_file_url:'https://storage.test/a.pdf',file_bytes:bytes.length,file_hash_sha256:await textSha256(bytes)};
 assert.equal((await readVerifiedPdfArchive(source,async()=>new Response(bytes))).length,bytes.length);
 await assert.rejects(readVerifiedPdfArchive({...source,file_hash_sha256:'b'.repeat(64)},async()=>new Response(bytes)),/identity/);
 await assert.rejects(readVerifiedPdfArchive({...source,file_bytes:bytes.length+1},async()=>new Response(bytes)),/identity/);
});
test('HTML, oversize, non-PDF and HTTP errors are retained failures without parsing',async()=>{
 const source={archived_file_url:'https://storage.test/a.pdf',file_bytes:5,file_hash_sha256:'a'.repeat(64)};
 for(const response of [new Response('<html>',{headers:{'content-type':'text/html'}}),new Response('not pdf'),new Response('x',{headers:{'content-length':String(PDF_TEXT_MAX_BYTES+1)}}),new Response('missing',{status:404})]){
 await assert.rejects(readVerifiedPdfArchive(source,async()=>response));
 }
});
test('page text respects line endings and omits non-text operators',()=>{
 assert.equal(pdfItemsText([{str:'Permit',hasEOL:false},{str:'Application',hasEOL:true},{str:'Submit drawings',hasEOL:true},{type:'beginMarkedContent'}]),'Permit Application\nSubmit drawings');
});
