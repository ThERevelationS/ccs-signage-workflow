import{readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
const root='docs/official-evidence/ohio-northbend-whitewater-2026-10-07/';
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
for(const s of manifest.sources.filter(s=>s.status==='archived')){const b=readFileSync(s.retained_path);if(b.length!==s.bytes||hash(b)!==s.sha256)throw Error('Original identity changed');}
const doc=JSON.parse(readFileSync(root+'northbend-linked-zoning-code.pages.json'));
const source=manifest.sources.find(s=>s.file===doc.file);
if(doc.source_sha256!==source.sha256)throw Error('Extraction source changed');
const selections=[
[1,'April 28, 2025','Printed adoption statement','The cover states adoption April 28, 2025. Later amendments and current compilation remain unverified.'],
[40,'a Zoning Permit shall be obtained','Permit trigger and exemptions','Part 4.B starts with a zoning-permit trigger and enumerated exemptions. An exemption must be checked against its conditions and the proposed sign; it does not establish a building or electrical exemption.'],
[42,'Pole Signs','Freestanding signs','The retained page includes district-specific freestanding tables, per-face accounting, base and landscaping provisions, and a pole-sign restriction. Use the original table for review; no district or numeric allowance is approved for a job.'],
[44,'1 sq. ft. per 1 lineal foot','Wall sign district table','The wall-sign table varies by district, frontage and building width; PUD provisions refer to an approved development plan. Page-linked table remains unreviewed for current applicability.'],
[45,'Sign Lighting','Window, wayfinding and sign lighting','The page includes window coverage, wayfinding, entrance-wall and drive-through provisions, then begins sign lighting. Lighting continues on the next page; a cross-reference printed as B.13.a requires review against the section numbering.'],
[46,'4,000K','Lighting and temporary signs','The retained text includes a 4,000K lighting limit and temporary-sign rules with different small/large permit triggers, district restrictions and duration provisions. These are document candidates; zoning lighting conditions do not identify an electrical permit issuer or inspector.'],
[47,'auto dimming photocell','Electronic displays and murals','The page contains message timing, transition and auto-dimming provisions plus mural permits. Review sign type and district before applying these provisions.'],
[48,'State Director of Transportation','Billboard certificates and state permits','The billboard section describes a sign zoning certificate and a possible state transportation permit in addition to local review. Routine-maintenance language here does not establish an electrical-permit exemption.']
];
const findings=selections.map(([physical_page,needle,label,text])=>{
 const p=doc.pages.find(p=>p.page===physical_page);
 if(!p||!p.text.includes(needle)||hash(p.text)!==p.text_sha256||p.source_sha256!==source.sha256)throw Error('Page evidence changed: '+label);
 return{label,text,physical_page,source_sha256:source.sha256,text_sha256:p.text_sha256,matched_text:needle,observation_method:'embedded PDF text review',staff_approved:false,currentness_approved:false,applicability_approved:false,archive:'/permitting-evidence/northbend-whitewater/'+doc.file+'#page='+physical_page};
});
mkdirSync('public/permitting-evidence/northbend-whitewater',{recursive:true});
const resources=manifest.sources.filter(s=>s.status==='archived'&&s.file.endsWith('.pdf')).map(s=>{
 copyFileSync(s.retained_path,'public/permitting-evidence/northbend-whitewater/'+s.file);
 return{file:s.file,label:s.file.includes('right-of-way')?'Village right-of-way application — separate from sign approval':'Village-linked zoning code — current amendments unverified',source:s.official_url,archive:'/permitting-evidence/northbend-whitewater/'+s.file,format:'PDF',bytes:s.bytes,sha256:s.sha256};
});
const row={id:'6ac19f1c2fbbf3b8bb27397c',name:'North Bend',state:'OH',type:'village',source:'https://www.northbendohio.org/zoning',observed_on:'2026-10-07',resources,document_findings:findings,
notes:['The Village zoning page identifies Hamilton County zoning assistance and county building-permit issuance. Office identity, current responsibility and job-address coverage still require approval.',
'The reviewed Village forms page links a right-of-way application. This form does not replace sign zoning or building approval. A separate sign application/online submission route was not located on that page.',
'The county zoning page and 2024 zoning application originals returned HTTP 403. They remain retention gaps.',
'Electrical permit issuance and electrical inspection remain independently unresolved. Sign-lighting standards do not establish either office.'],
references:[{label:'Official Village forms page',url:'https://www.northbendohio.org/forms'}],
extraction_note:'Embedded text was extracted across 181 code pages and two right-of-way pages. Page findings remain pending review; extraction does not verify tables, current amendments or complete searchable content.'};
if(existsSync(root+'county-routing/routing-review.json')){
 const routing=JSON.parse(readFileSync(root+'county-routing/routing-review.json'));
 row.references.push({label:'County digital permitting reference — original retention gap; sign route unconfirmed',url:routing.observations[0].url});
 row.notes.push('The county digital-permitting reference describes ezTrak with partner-agency paper exceptions. Its original HTML download is blocked (HTTP 403); North Bend sign-specific portal applicability remains unconfirmed. This reference does not resolve electrical permit issuance or inspection.');
}
const path='src/components/permitting/ohioMunicipalResearch.json',prior=JSON.parse(readFileSync(path));
writeFileSync(path,JSON.stringify([...prior.filter(p=>p.id!==row.id),row],null,2)+'\n');
writeFileSync(root+'sign-content-review-packet.json',JSON.stringify({profile:row,findings,staff_approved:false,currentness_approved:false,electrical_roles_approved:false,live_records_changed:0},null,2)+'\n');
console.log('North Bend two original downloads and eight physical-page candidates prepared; no role or law approvals.');
