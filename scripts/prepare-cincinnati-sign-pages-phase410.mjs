import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {extractPdfTextChunk,PDF_TEXT_MAX_BYTES} from '../base44/shared/jurisdictionSourcePdfText.mjs';
const manifest=JSON.parse(await readFile('docs/official-evidence/cincinnati-2026-10-05/manifest.json','utf8'));
globalThis.pdfjsWorker={WorkerMessageHandler};
const sha=b=>createHash('sha256').update(b).digest('hex');
const selected=manifest.sources.filter(s=>s.content_type==='application/pdf');
if(selected.length!==2)throw Error('Expected exactly two retained PDFs.');
const packet={phase:'4.10',jurisdiction_id:'6ac1a123edda6d8dd942690b',storage_kind:'git_retained_originals',app_storage_archive_completed:false,catalog_registration_completed:false,authority_verified:false,llm_calls:0,downloads:0,uploads:0,sources:[]};
for(const retained of selected){
 const bytes=await readFile(retained.archived_repo_path);
 if(bytes.length>PDF_TEXT_MAX_BYTES||bytes.length!==retained.file_bytes||sha(bytes)!==retained.file_hash_sha256||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Retained source identity mismatch: '+retained.name);
 const id='retained-cincinnati-'+retained.name+'-'+retained.file_hash_sha256.slice(0,12);
 const source={id,file_hash_sha256:retained.file_hash_sha256};
 const result=await extractPdfTextChunk({bytes:new Uint8Array(bytes),source,openPdf:data=>getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,verbosity:0})});
 // This is a bounded local evidence packet, never a substitute for app catalog identity.
 for(const p of result.pages)if(sha(p.text)!==p.text_sha256||p.source_sha256!==retained.file_hash_sha256)throw Error('Page identity mismatch.');
 packet.sources.push({...retained,retained_evidence_id:id,catalog_source_document_id:null,total_pages:result.total_pages,next_page:result.next_page,text_complete:result.next_page>result.total_pages&&!result.pages.some(p=>p.truncated||p.needs_ocr_review),pages:result.pages,manual_archive_request:{jurisdiction_id:packet.jurisdiction_id,document_id:'cincinnati-official-'+retained.name+'-20261005',known_pdf:{sha256:retained.file_hash_sha256,bytes:retained.file_bytes}},scope_caveat:retained.name==='outdoor-advertising-application'?'Outdoor advertising application; applicability to a business identification sign is not established.':'Informational handout; currentness, applicability and regulatory authority require separate review.'});
}
await writeFile('docs/permitting-cincinnati-sign-pages-phase410.json',JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sources:packet.sources.map(s=>({name:s.name,pages:s.total_pages,retained_pages:s.pages.length,text_complete:s.text_complete,bytes:s.file_bytes})),uploads:0,llm_calls:0}));
