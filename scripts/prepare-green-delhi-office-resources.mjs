import{readFileSync,writeFileSync,mkdirSync,copyFileSync}from'node:fs';import{createHash}from'node:crypto';import{projectHtmlText}from'../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-green-delhi-2026-10-07/',manifest=JSON.parse(readFileSync(root+'manifest.json'));
for(const s of manifest.sources.filter(s=>s.status==='archived')){const b=readFileSync(s.retained_path);if(b.length!==s.bytes||createHash('sha256').update(b).digest('hex')!==s.sha256)throw Error('Archive differs');if(s.file.endsWith('.html'))writeFileSync(root+s.file.replace('.html','.txt'),projectHtmlText(b.toString()).text+'\n');}
const text=readFileSync(root+'green-zoning.txt','utf8');for(const needle of ['northeastern Green Township','ezTrak','Zoning Application'])if(!text.includes(needle))throw Error('Routing evidence missing');
mkdirSync('public/permitting-evidence/green-delhi',{recursive:true});
for(const s of manifest.sources.filter(s=>s.status==='archived'&&(s.file.endsWith('.pdf')||s.file==='green-street-directory.html')))copyFileSync(s.retained_path,'public/permitting-evidence/green-delhi/'+s.file);
const directory=manifest.sources.find(s=>s.file==='green-street-directory.html');
const row={id:'6ac1aae70e3a16c893d4e506',name:'Green Township',state:'OH',type:'township',source:'https://www.greentwp.org/1201/Development-Zoning',observed_on:'2026-10-07',
notes:['The official Township page describes two zoning jurisdictions: Northeast Green Township and Hamilton County elsewhere. Check the street/address range before choosing a route; township name alone does not approve job-address coverage.',
'The Township links iWorQ zoning applications for its northeast jurisdiction and county ezTrak outside that area. The iWorQ original download failed hostname certificate verification; its content is not retained. No application was submitted.',
'A standalone sign PDF application was not located on the reviewed Township page. Online commercial/residential zoning applications are linked, with sign applicability still requiring review.',
'Electrical permit issuance and electrical inspection offices remain separately unresolved. A zoning portal or building route does not establish electrical responsibility.'],
references:[{label:'Northeast Township zoning applications — original retention gap',url:'https://greentownship_permit.portal.iworq.net/portalhome/greentownship_permit'},{label:'County ezTrak — outside northeast zoning jurisdiction per Township page',url:'https://eztrak.cagis.org/'},{label:'Official northeast street directory',url:directory.official_url}],
resources:[{file:directory.file,label:'Northeast zoning street directory — address review pending',source:directory.official_url,archive:'/permitting-evidence/green-delhi/'+directory.file,format:'HTML',bytes:directory.bytes,sha256:directory.sha256}]};
const path='src/components/permitting/ohioMunicipalResearch.json',prior=JSON.parse(readFileSync(path));
const previous=prior.find(p=>p.id===row.id);
for(const note of previous?.notes||[])if(note.startsWith('The electrical provider homepage')&&!row.notes.includes(note))row.notes.push(note);
for(const ref of previous?.references||[])if(ref.url==='https://www.inspectionbureau.com/electrical-plan-review/'&&!row.references.some(r=>r.url===ref.url))row.references.push(ref);
writeFileSync(path,JSON.stringify([...prior.filter(p=>p.id!==row.id),row],null,2)+'\n');
writeFileSync(root+'office-reconciliation.json',JSON.stringify({profiles:[row,{id:null,name:'Delhi Township',state:'OH',type:'township',identity_status:'no match in OH canonical profile name query'}],retained_pdf_pages:189,staff_approved:false,currentness_approved:false,coverage_approved:false,electrical_roles_approved:false,live_records_changed:0,gaps:['Delhi canonical identity','Green standalone sign form/applicability','iWorQ original retention','Separate electrical issuer and inspector','Current zoning amendments and sign applicability','App-storage/catalog registration']},null,2)+'\n');
console.log('Green exact-locality research prepared; Delhi originals retained without invented profile.');
