import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/submission-review/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const evidence=Object.fromEntries(manifest.sources.map(s=>{
 const bytes=readFileSync(s.retained_path);
 if(bytes.length!==s.bytes||createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('City page identity differs');
 const text=projectHtmlText(bytes.toString()).text;
 writeFileSync(root+s.file.replace('.html','.txt'),text+'\n');
 return[s.file,{...s,text}];
}));
const permits=evidence['permits.html'],inspections=evidence['inspections.html'];
for(const [record,phrases] of [[permits,['January 2025','Cloudpermit','Paper Versions']],[inspections,['202-8494','381-6080']]])for(const phrase of phrases)if(!record.text.includes(phrase))throw Error('Retained City text lacks '+phrase);
const ocrRoot='docs/official-evidence/ohio-harrison-addyston-2026-10-07/ocr/';
const ocr=JSON.parse(readFileSync(ocrRoot+'render-ocr-manifest.json'));
for(const p of ocr.pages)if(createHash('sha256').update(readFileSync(ocrRoot+'page-'+p.page+'.txt')).digest('hex')!==p.raw_ocr_sha256)throw Error('Raw OCR changed');
const rows=[
{topic:'Submission method',guide:'Physical page 1 requests four paper plan copies.',city:'Current Permits page describes Cloudpermit from January 2025 and still lists paper versions.',review:'Confirm sign-specific paper/portal acceptance; supersession is not established.',page:1,url:permits.official_url,html_sha256:permits.sha256},
{topic:'City inspection contact',guide:'Physical page 2 prints 513-202-8488 for foundation, mounting and final inspections.',city:'Current Inspections page lists Harrison Building Department at 513-202-8494.',review:'Confirm scheduling contact before use; preserve both published numbers.',page:2,url:inspections.official_url,html_sha256:inspections.sha256},
{topic:'Electrical inspection',guide:'Physical page 2 prints IBI and 513-381-6080 for illuminated/wired signs.',city:'Current Inspections page names Inspection Bureau Incorporated and the same 513-381-6080 number.',review:'Consistent inspection contact evidence; canonical identity and responsibility approval remain pending. Permit issuance is separate.',page:2,url:inspections.official_url,html_sha256:inspections.sha256}
].map(row=>({...row,guide_url:'/permitting-evidence/harrison-addyston/harrison-temporary-sign-instructions.pdf#page='+row.page,
guide_source_sha256:ocr.source_sha256,raw_ocr_sha256:ocr.pages.find(p=>p.page===row.page).raw_ocr_sha256,
staff_approved:false,currentness_approved:false}));
writeFileSync(root+'routing-comparison.json',JSON.stringify({rows,supersession_approved:false,live_records_changed:0},null,2)+'\n');
const path='src/components/permitting/ohioMunicipalResearch.json',dossiers=JSON.parse(readFileSync(path));
dossiers.find(d=>d.id==='69a7043e496af8043b9e4f00').routing_comparison=rows;
writeFileSync(path,JSON.stringify(dossiers,null,2)+'\n');
console.log('Three guide/current-page comparisons retained; no supersession or responsibility approvals.');
