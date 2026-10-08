import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
globalThis.pdfjsWorker={WorkerMessageHandler};
const root='docs/official-evidence/ohio-reading-2026-10-08/';
const manifest=JSON.parse(readFileSync(root+'post-june-minutes-manifest.json'));const documents=[];
for(const source of manifest.filter(s=>s.retained&&s.file.endsWith('.pdf'))){
 const bytes=readFileSync(root+source.file);
 if(bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Archive identity differs');
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true,isEvalSupported:false}).promise;const pages=[];
 for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number),content=await page.getTextContent(),annotations=await page.getAnnotations();
  const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').replace(/[ \t]+/g,' ').trim();
  pages.push({page:number,text,text_sha256:createHash('sha256').update(text).digest('hex'),source_sha256:source.sha256,method:'pdfjs embedded text, no OCR',visual_reviewed:false,form_fields:annotations.filter(a=>a.subtype==='Widget').map(a=>({name:a.fieldName,type:a.fieldType,alternate_text:a.alternativeText,read_only:a.readOnly,required:a.required})),needs_visual_or_ocr_review:true});
 }
 const record={file:source.file,source_sha256:source.sha256,total_pages:pdf.numPages,pages,searchable_content_complete:false,currentness_approved:false,authority_approved:false};documents.push(record);writeFileSync(root+source.file.replace('.pdf','.pages.json'),JSON.stringify(record,null,2)+'\n');await pdf.destroy();
 console.log(JSON.stringify({file:source.file,pages:record.total_pages,fields:pages.reduce((n,p)=>n+p.form_fields.length,0),text_lengths:pages.map(p=>p.text.length)}));
}
writeFileSync(root+'post-june-minutes-text-extraction.json',JSON.stringify({documents,authority_approved:false,currentness_approved:false},null,2)+'\n');
