import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/ocr/';
const manifest=JSON.parse(readFileSync(root+'render-ocr-manifest.json'));
const sha=data=>createHash('sha256').update(data).digest('hex');
for(const p of manifest.pages)for(const [ext,hash] of [['png',p.png_sha256],['txt',p.raw_ocr_sha256],['tsv',p.tsv_sha256]])if(sha(readFileSync(root+'page-'+p.page+'.'+ext))!==hash)throw Error('OCR/render receipt identity differs');
const excerpts=[
{page:1,label:'Scanned instructions: paper plan package',excerpt:'Complete an application for a permit and submit four copies of plans for review to the Building Department',text:'The scanned guide calls for four plan copies, including a scaled plot plan, sign illustrations, attachment/foundation details and lighting information. Reconcile this paper route with the City’s current Cloudpermit guidance.'},
{page:2,label:'Scanned instructions: separate electrical permit',excerpt:'A separate electrical permit is Inspection Bureau Incorporated (IBI) at 381-6080.',text:'The printed guide names Inspection Bureau Incorporated (IBI) in its separate electrical-permit line. Its unusual printed wording is preserved; provider identity and permit-issuer approval remain pending.'},
{page:2,label:'Scanned instructions: electrical inspections',excerpt:'If the sign is illuminated or wired for electricity, contact IBI at 513-381-6080.',text:'The guide separately directs illuminated/wired signs to IBI for electrical inspection. Foundation, mounting and final inspections have separate City contact lines. Current scheduling/contact details require review.'},
{page:2,label:'Scanned instructions: temporary and portable signs',excerpt:'Portable signs are not permitted.',text:'The guide has temporary-sign limits and a portable-sign prohibition. These are unapproved transcription candidates; current sign-code exceptions, district applicability and restrictions are not established.'}];
const findings=excerpts.map(e=>{
 const p=manifest.pages.find(p=>p.page===e.page);
 return{label:e.label,text:e.text,physical_page:e.page,archive:'/permitting-evidence/harrison-addyston/harrison-temporary-sign-instructions.pdf#page='+e.page,
 source_sha256:manifest.source_sha256,render_sha256:p.png_sha256,raw_ocr_sha256:p.raw_ocr_sha256,
 excerpt:e.excerpt,excerpt_sha256:sha(e.excerpt),observation_method:'agent visual transcription from retained 150 DPI physical-page render',region:{x:0,y:0,width:1,height:1},
 verification_status:'pending_staff_review',authority_approved:false,currentness_approved:false};
});
writeFileSync(root+'visual-transcription-candidates.json',JSON.stringify({findings,staff_approved:false,raw_ocr_preserved:true,original_embedded_text_unchanged:true},null,2)+'\n');
const path='src/components/permitting/ohioMunicipalResearch.json',rows=JSON.parse(readFileSync(path)),h=rows.find(r=>r.id==='69a7043e496af8043b9e4f00');
h.document_findings=[...h.document_findings.filter(f=>!f.observation_method),...findings];
h.extraction_note='Both byte-identical sign-instruction PDFs still have no embedded text. Both physical pages now have retained renders, raw OCR/TSV and separate visual-transcription candidates pending staff review. OCR does not establish current requirements.';
h.ocr_references=[1,2].map(page=>{
 const name='harrison-sign-instructions-page-'+page+'-raw-ocr.txt';
 copyFileSync(root+'page-'+page+'.txt','public/permitting-evidence/harrison-addyston/'+name);
 return{label:'Raw OCR — physical page '+page+' (uncorrected)',url:'/permitting-evidence/harrison-addyston/'+name};
});
writeFileSync(path,JSON.stringify(rows,null,2)+'\n');
console.log('Four visual-transcription candidates retained separately from raw OCR; no authority approval.');
