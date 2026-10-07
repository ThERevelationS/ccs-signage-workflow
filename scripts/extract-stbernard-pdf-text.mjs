import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
globalThis.pdfjsWorker={WorkerMessageHandler};
const root='docs/official-evidence/ohio-stbernard-2026-10-07/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const cache=new Map(),documents=[];
for(const source of manifest.sources.filter(s=>s.status==='archived'&&s.file.endsWith('.pdf'))){
 const bytes=readFileSync(source.retained_path);
 if(bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Archive identity differs');
 let pages=cache.get(source.sha256);
 if(!pages){
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true,isEvalSupported:false}).promise;
 pages=[];
 for(let number=1;number<=pdf.numPages;number++){
 const page=await pdf.getPage(number),content=await page.getTextContent();
 const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').replace(/[ \t]+/g,' ').trim();
 pages.push({page:number,text,text_sha256:createHash('sha256').update(text).digest('hex'),text_status:text.length?'embedded_text_extracted':'no_embedded_text',needs_ocr_review:!text.length,method:'pdfjs-dist embedded text; no OCR',source_sha256:source.sha256});
 }
 await pdf.destroy();cache.set(source.sha256,pages);
 }
 const record={file:source.file,official_url:source.official_url,source_sha256:source.sha256,source_bytes:source.bytes,total_pages:pages.length,pages_with_embedded_text:pages.filter(p=>p.text.length).length,extraction_covers_all_physical_pages:true,embedded_text_present_on_all_pages:pages.every(p=>p.text.length>0),searchable_content_complete:false,ocr_performed:false,pages};
 documents.push(record);writeFileSync(root+source.file.replace('.pdf','.pages.json'),JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({file:source.file,pages:record.total_pages,text_pages:record.pages_with_embedded_text,ocr_needed:pages.some(p=>p.needs_ocr_review)}));
}
writeFileSync(root+'pdf-text-extraction.json',JSON.stringify({documents,staff_approved:false,currentness_approved:false,authority_approved:false,distinct_archives_parsed:cache.size},null,2)+'\n');
