import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const root='docs/official-evidence/ohio-green-delhi-2026-10-07/',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const files=['delhi-permanent-sign-application.pdf','delhi-zoning-resolution.pdf'];
const docs=Object.fromEntries(files.map(file=>{const s=manifest.sources.find(s=>s.file===file),b=readFileSync(s.retained_path);if(hash(b)!==s.sha256||b.length!==s.bytes)throw Error('Original changed');const d=JSON.parse(readFileSync(root+file.replace('.pdf','.pages.json')));if(d.source_sha256!==s.sha256)throw Error('Extraction changed');return[file,{s,d}];}));
const specs=[
[files[0],1,'Signs also require a building permit','County building routing','The retained form routes sign building permits to Hamilton County Buildings & Inspections. This does not identify a separate electrical issuer or inspector.'],
[files[0],2,'photometric drawing','Submission package','The form requests four or six drawing sets based on county requirements plus one Township set, site/elevation plans, sign dimensions and illumination, existing-sign photos/dimensions and photometric drawings for lit signs. Confirm current paper/digital acceptance.'],
[files[0],3,'New Sign','Printed fee candidates','The April 2021 form prints new-sign and face-change fee formulas and a doubled-fee checkbox. These remain historical printed candidates; current fees are not approved.'],
[files[1],4,'MONROE COUNTY, INDIANA','Document identity anomaly','Physical page 4 names Monroe County, Indiana above its table list, while the retained document is published as Delhi zoning. Preserve the original and verify publisher correction/current compilation before approval.'],
[files[1],105,'electrically illuminated signs','Permit and electrical-code applicability','Article 17 describes zoning certificates, sign-panel changes and compliance with the applicable electrical code for illuminated signs. No code edition or electrical office is established here.'],
[files[1],107,'Each sign exempt','Conditional zoning exemptions','Signs exempt from zoning certificates must still comply with applicable height, area and location standards. This does not establish building or electrical exemptions.'],
[files[1],112,'Summary Table of Permitted Signs','District and sign-type table','Article 17 includes a district/sign-type summary table. Preserve its original layout and linked provisions; no numeric or district allowance is approved for a job.'],
[files[1],117,'Temporary Signs','Temporary-sign standards','Temporary signs have separate standards in Section 17.9; permit exemption alone does not remove size, placement or duration review.']
];
const findings=specs.map(([file,physical_page,needle,label,text])=>{const{s,d}=docs[file],p=d.pages[physical_page-1];if(p.page!==physical_page||!p.text.includes(needle)||hash(p.text)!==p.text_sha256)throw Error('Finding mismatch: '+label);return{file,physical_page,label,text,matched_text:needle,source_sha256:s.sha256,text_sha256:p.text_sha256,archive:'/permitting-evidence/green-delhi/'+file+'#page='+physical_page,staff_approved:false,currentness_approved:false,authority_approved:false};});
const pageSource=manifest.sources.find(s=>s.file==='delhi-zoning.html'),html=readFileSync(pageSource.retained_path);
if(hash(html)!==pageSource.sha256)throw Error('Township page changed');
const normalized=readFileSync(root+'delhi-zoning.txt','utf8');if(!normalized.includes('5031 Delhi Road'))throw Error('Current address absent');
const packet={locality:{name:'Delhi Township',state:'OH',type:'township',canonical_id:null},findings,address_comparison:{application_address:'697 Neeb Road',application_page:1,application_sha256:docs[files[0]].s.sha256,township_page_address:'5031 Delhi Road',township_page_url:pageSource.official_url,township_page_sha256:pageSource.sha256,review:'Confirm current sign intake location; neither address silently supersedes the other.',approved:false},electrical_permit_issuer_approved:false,electrical_inspector_approved:false,currentness_approved:false,staff_approved:false,live_records_changed:0};
writeFileSync(root+'delhi-sign-review-packet.json',JSON.stringify(packet,null,2)+'\n');
console.log('Eight Delhi page findings and intake-address/document-identity discrepancies retained.');
