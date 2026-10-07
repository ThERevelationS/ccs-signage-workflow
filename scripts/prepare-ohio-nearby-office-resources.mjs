import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-nearby-offices-2026-10-07/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
for(const source of manifest.sources){
 const data=readFileSync(source.retained_path);
 if(source.status!=='archived' || data.length!==source.bytes || createHash('sha256').update(data).digest('hex')!==source.sha256)throw Error('Retained document identity differs: '+source.file);
 if(source.file.endsWith('.html'))writeFileSync(root+source.file.replace('.html','.txt'),projectHtmlText(data.toString()).text+'\n');
}
const labels={'norwood-sign-application.pdf':'Signage permit application','norwood-business-checklist.pdf':'Business preliminary checklist','norwood-fees-2026.pdf':'Linked building and zoning fees (2026)',
 'deer-park-building-process.docx':'Building permit process (August 2025)','deer-park-building-zoning-application.doc':'Building and zoning application (April 2022)','deer-park-fees-2026.pdf':'City-linked Hamilton County fee schedule (2026)'};
const profiles=[{id:'6ac19f0cd3b3f47e53ac0596',name:'Norwood',state:'OH',type:'city',source:'https://www.norwoodohio.gov/162/Building-Department',
 notes:['The City department page says applications and plans cannot be emailed. Confirm the current submission method before use.',
 'The business checklist names a separate electrical permit through an Inspection Bureau candidate. Its printed phone differs from the provider website; the number and exact agency identity need reconciliation.',
 'Permit issuance and electrical inspection responsibilities remain separately unapproved. A reference to a provider does not establish its service coverage.']},
 {id:'6ac19f1a3d1976f72bf908a7',name:'Deer Park',state:'OH',type:'city',source:'https://www.deerpark-oh.gov/departments/building-permits-and-inspections/',
 notes:['The City page routes electrical permits through IBI and links the provider. This supports routing research; permit issuance and inspection responsibilities still need independent review.',
 'The City page allows mail, drop-off, fax or email as feasible and calls for three plan copies when plans are needed. Confirm the submission method for the proposed sign.',
 'The fee schedule is City-linked Hamilton County material. Do not infer county permitting authority or electrical fees from that link.']}];
mkdirSync('public/permitting-evidence/ohio-nearby',{recursive:true});
for(const profile of profiles){profile.observed_on='2026-10-07';profile.resources=manifest.sources.filter(s=>s.city===profile.name && !s.file.endsWith('.html')).map(s=>{
 copyFileSync(s.retained_path,'public/permitting-evidence/ohio-nearby/'+s.file);
 return{file:s.file,label:labels[s.file],source:s.request_url || s.official_url,archive:'/permitting-evidence/ohio-nearby/'+s.file,format:s.file.split('.').at(-1).toUpperCase(),sha256:s.sha256,bytes:s.bytes};
 });}
writeFileSync('src/components/permitting/ohioMunicipalResearch.json',JSON.stringify(profiles,null,2)+'\n');
writeFileSync(root+'office-reconciliation.json',JSON.stringify({profiles,staff_approved:false,role_approvals_created:false,
 canonical_offices_changed:false,locality_links_changed:false,fees_verified:false,
 gaps:['Canonical electrical-office identities','Independent permit issuer and inspection evidence','Sign-specific applicability and district standards','Current fee calculation and submission acceptance'],
 retained_document_count:manifest.sources.filter(s=>!s.file.endsWith('.html')).length},null,2)+'\n');
console.log('Two Ohio municipal dossiers prepared; six original documents retained; no authority approvals.');
