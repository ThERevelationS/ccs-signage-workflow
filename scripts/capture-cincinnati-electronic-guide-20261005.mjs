import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {extractPdfTextChunk} from '../base44/shared/jurisdictionSourcePdfText.mjs';
globalThis.pdfjsWorker={WorkerMessageHandler};
const dir='docs/official-evidence/cincinnati-submission-2026-10-05';
const url='https://www.cincinnati-oh.gov/buildings/building-permit-forms-applications/application-forms/all-forms-handouts-checklists-alphabetical-list/electronic-document-submission-guidelines/';
const retained=JSON.parse(await readFile(dir+'/retained-extraction-evidence.json','utf8'));
const html=Buffer.from(retained.html.raw_html_base64,'base64').toString();
if(!html.includes(url.replace('https://www.cincinnati-oh.gov','')))throw Error('PDF URL not present in retained official HTML');
const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
let response,current=url;
try{
for(let hop=0;hop<4;hop++){response=await fetch(current,{signal:ctl.signal,redirect:'manual'});if([301,302,303,307,308].includes(response.status)){const next=new URL(response.headers.get('location'),current);if(next.protocol!=='https:'||next.hostname!=='www.cincinnati-oh.gov'||hop===3)throw Error('Unapproved redirect');current=next.href;continue;}break;}
if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw Error('Expected official PDF');
const chunks=[];let size=0;for await(const c of response.body){size+=c.length;if(size>2000000)throw Error('Capture exceeds bound');chunks.push(c);}
const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid signature');
const sha=createHash('sha256').update(bytes).digest('hex');
await writeFile(dir+'/electronic-submission-guide.pdf',bytes,{flag:'wx'});
const result=await extractPdfTextChunk({bytes:new Uint8Array(bytes),source:{id:'retained-cincinnati-electronic-submission-guide-20261005',file_hash_sha256:sha},openPdf:data=>getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,verbosity:0})});
if(result.total_pages!==result.pages.length||result.pages.some(p=>p.needs_ocr_review||p.truncated))throw Error('Incomplete text requires continuation');
const evidence={phase:5,official_url:url,final_url:current,retrieved_at:new Date().toISOString(),file_bytes:bytes.length,file_hash_sha256:sha,pdf_path:dir+'/electronic-submission-guide.pdf',linked_from_html_evidence_id:'6ac3a8f5ba1cd9e4db999cb2',llm_calls:0,authority_established:false,total_pages:result.total_pages,pages:result.pages};
await writeFile(dir+'/electronic-submission-guide-evidence.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({url,sha256:sha,bytes:bytes.length,pages:result.total_pages,page1_text:result.pages[0].text}));
}finally{clearTimeout(timer);}
