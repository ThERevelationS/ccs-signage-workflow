import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-west-offices-2026-10-07/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
for(const s of manifest.sources){
 const bytes=readFileSync(s.retained_path);
 if(s.status!=='archived'||bytes.length!==s.bytes||createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('Archive identity differs: '+s.file);
 if(s.file.endsWith('.html'))writeFileSync(root+s.file.replace('.html','.txt'),projectHtmlText(bytes.toString()).text+'\n');
}
const labels={'cheviot-building-application.pdf':'Building application — includes Sign permit type','cheviot-variance-application.pdf':'Variance application','cheviot-resubmittal-application.pdf':'Resubmittal application','cheviot-fees-2026.pdf':'City-linked Hamilton County fees (2026; applicability unreviewed)',
'cleves-general-building-application.pdf':'General building application — scanned original','cleves-mechanical-application.pdf':'Mechanical application — scanned original','cleves-linked-zoning-manual.pdf':'Village-linked zoning manual — currentness unreviewed','cleves-draft-zoning-manual.pdf':'DRAFT zoning manual — not approved law'};
const rows=[{id:'6ac1a0ff78ee7a352ad77367',name:'Cheviot',state:'OH',type:'city',source:'https://cheviot.org/departments/building-zoning/',
notes:['The City page directs applications to City Hall by drop-off, mail or email to egassett@cheviot.org; City Hall forwards them to National Inspection Corporation and payment is made to the City.',
'The building application includes a Sign checkbox. The resubmittal form and variance form list different paper-copy requirements; confirm the applicable route before submission.',
'National Inspection Corporation is a building-review reference. Separate electrical permit issuance and electrical inspection responsibilities remain unresolved.',
'The City-linked Hamilton County fee document is retained without approving its sign fees or county authority.']},
{id:'6ac1a161934312388bd3ca04',name:'Cleves',state:'OH',type:'village',source:'https://www.clevesoh.gov/zoning',
notes:['The Village lists general and mechanical building applications on its Forms page. These scanned originals are retained; complete searchable text is not claimed.',
'The zoning page says the linked manual and map are provided as a convenience and asks applicants to contact the Zoning Official for official designations.',
'The separately linked DRAFT zoning manual is retained as proposed research only. It must not replace adopted requirements or generate an approved workflow.',
'The directory identifies building and zoning contacts; it does not establish separate electrical permit issuance or inspection responsibility.',
'Village Hall addresses differ between the Forms footer and the Directory/zoning page. Confirm the current delivery address before submitting.']}];
mkdirSync('public/permitting-evidence/ohio-west',{recursive:true});
for(const row of rows){row.observed_on='2026-10-07';row.resources=manifest.sources.filter(s=>s.city===row.name&&s.file.endsWith('.pdf')).map(s=>{
 copyFileSync(s.retained_path,'public/permitting-evidence/ohio-west/'+s.file);
 return{file:s.file,label:labels[s.file],source:s.official_url,archive:'/permitting-evidence/ohio-west/'+s.file,format:'PDF',sha256:s.sha256,bytes:s.bytes};
});}
const path='src/components/permitting/ohioMunicipalResearch.json';
const prior=JSON.parse(readFileSync(path));
for(const row of rows){const old=prior.find(p=>p.id===row.id);if(old?.electrical_research)row.electrical_research=old.electrical_research;}
writeFileSync(path,JSON.stringify([...prior.filter(p=>!rows.some(r=>r.id===p.id)),...rows],null,2)+'\n');
writeFileSync(root+'office-reconciliation.json',JSON.stringify({profiles:rows,staff_approved:false,electrical_roles_approved:false,source_currentness_approved:false,live_records_changed:0,retained_document_count:8,
gaps:['Separate electrical offices and roles','Current adopted sign rules and zoning district applicability','Confirmed submission address and fee applicability','App-storage and source-catalog registration']},null,2)+'\n');
console.log('Cheviot and Cleves: eight original PDFs and four official pages retained; no authority approvals.');
