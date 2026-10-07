import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
for(const source of manifest.sources){
 const bytes=readFileSync(source.retained_path);
 if(source.status!=='archived'||bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Archive identity differs');
 if(source.file.endsWith('.html'))writeFileSync(root+source.file.replace('.html','.txt'),projectHtmlText(bytes.toString()).text+'\n');
}
const rows=[{id:'69a7043e496af8043b9e4f00',name:'City of Harrison',state:'OH',type:'city',source:'https://www.harrisonohio.gov/158/Permits',online_form_url:'https://us.cloudpermit.com/login',
 notes:['The City describes Cloudpermit for building permits and inspections since January 2025. The retained paper applications remain linked; confirm which submission route applies to the proposed sign.',
'The Permits page routes electrical inquiries to IBI. The separate Inspections page explicitly lists Inspection Bureau Incorporated for electric inspections and final electrical inspection in its Sign checklist. These support inspection/routing candidates; permit issuance and canonical provider identity remain separately unapproved.',
'The links labeled Temporary Signs Instructions and Permanent Signs Instructions currently return byte-identical PDFs. Both original link identities are preserved; do not assume they contain distinct instructions.',
'The zoning application includes permanent and temporary sign options. Current district standards, exemptions, fees and paper/portal applicability still require review.'],
 references:[{label:'Official City inspection page',url:'https://www.harrisonohio.gov/157/Inspections'}]},
{id:'6ac1a0de30219cc619d6e7d3',name:'Village of Addyston',state:'OH',type:'village',source:'https://www.addystonohio.org/zoning',
 notes:['The Village zoning page publishes building-inspector and code-enforcement contacts and links a zoning ordinance. Retention does not establish current adopted sign requirements.',
'A signage/building permit application and an online application portal were not located on the reviewed zoning page. This is a recorded collection gap, not a claim that the Village has no form or permit requirement.',
'Separate electrical permit issuance and electrical inspection offices remain unresolved. Building-inspector contact alone does not establish electrical responsibility.']}];
const labels={'harrison-temporary-sign-instructions.pdf':'Temporary-sign instructions link — same bytes as permanent link','harrison-permanent-sign-instructions.pdf':'Permanent-sign instructions link — same bytes as temporary link','harrison-commercial-application.pdf':'Commercial building application','harrison-zoning-application.pdf':'Zoning application — permanent/temporary signs','harrison-variance-application.pdf':'Variance application','addyston-linked-zoning-ordinance.pdf':'Village-linked zoning ordinance — currentness unreviewed'};
mkdirSync('public/permitting-evidence/harrison-addyston',{recursive:true});
for(const row of rows){row.observed_on='2026-10-07';row.resources=manifest.sources.filter(s=>s.city===row.name&&s.file.endsWith('.pdf')).map(s=>{
 copyFileSync(s.retained_path,'public/permitting-evidence/harrison-addyston/'+s.file);
 return {file:s.file,label:labels[s.file],source:s.official_url,archive:'/permitting-evidence/harrison-addyston/'+s.file,format:'PDF',sha256:s.sha256,bytes:s.bytes};
});}
const path='src/components/permitting/ohioMunicipalResearch.json';
const prior=JSON.parse(readFileSync(path));
writeFileSync(path,JSON.stringify([...prior.filter(p=>!rows.some(r=>r.id===p.id)),...rows],null,2)+'\n');
writeFileSync(root+'office-reconciliation.json',JSON.stringify({profiles:rows,staff_approved:false,electrical_roles_approved:false,live_records_changed:0,retained_downloads:6,distinct_pdf_hashes:new Set(manifest.sources.filter(s=>s.file.endsWith('.pdf')).map(s=>s.sha256)).size,
gaps:['Addyston permit applications and electrical offices','Harrison permit issuer/canonical inspection provider approval','Current sign-code applicability and fees','App-storage/source-catalog registration']},null,2)+'\n');
console.log('Six original PDF downloads retained (five distinct byte identities); three official pages; no authority approvals.');
