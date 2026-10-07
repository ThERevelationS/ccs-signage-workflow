import test from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const bundle=await build({entryPoints:['src/components/permitting/OhioMunicipalResearchResources.jsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic'});
const Component=(await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
const dossiers=JSON.parse(readFileSync('src/components/permitting/ohioMunicipalResearch.json'));
const render=(jurisdiction,isAdmin=true)=>renderToStaticMarkup(React.createElement(Component,{jurisdiction,isAdmin}));
test('exact Ohio locality identity and admin access are required for both dossiers',()=>{
 for(const row of dossiers){assert.equal(render(row,false),'');assert.ok(render(row).includes(row.name));
 for(const [key,value] of Object.entries({id:'different',name:'Cincinnati',state:'KY',type:row.type==='village'?'city':'village'}))assert.equal(render({...row,[key]:value}),'');}
 assert.equal(render(null),'');
});
test('all six original downloads match retained bytes, manifest hashes and formats',()=>{
 const manifest=JSON.parse(readFileSync('docs/official-evidence/ohio-nearby-offices-2026-10-07/manifest.json'));
 const nearby=dossiers.filter(d=>['Norwood','Deer Park'].includes(d.name));
 assert.equal(nearby.flatMap(d=>d.resources).length,6);
 for(const row of nearby)for(const resource of row.resources){const source=manifest.sources.find(s=>s.file===resource.file),bytes=readFileSync('public'+resource.archive);
 assert.deepEqual(bytes,readFileSync(source.retained_path));assert.equal(bytes.length,resource.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),resource.sha256);assert.equal(resource.sha256,source.sha256);
 assert.equal(resource.source,source.request_url||source.official_url);assert.equal(resource.format,resource.file.split('.').at(-1).toUpperCase());}
});
test('submission differences and responsibility limits remain visible',()=>{
 const norwood=render(dossiers.find(d=>d.name==='Norwood')),deer=render(dossiers.find(d=>d.name==='Deer Park'));
 assert.match(norwood,/cannot be emailed/);assert.match(norwood,/printed phone differs/);
 assert.match(deer,/fax or email as feasible/);assert.match(deer,/Do not infer county permitting authority/);
 assert.match(deer,/Retained DOCX/);assert.match(deer,/Retained DOC/);
 for(const html of [norwood,deer]){assert.match(html,/awaiting staff review/);assert.match(html,/separate pending reviews/);assert.match(html,/do not create an approved workflow/);}
});
test('new research remains outside the approved evidence disclosure',()=>{
 const code=readFileSync('src/components/permitting/LocalityApprovedEvidence.jsx','utf8');
 assert.match(code,/<ElectricalResearchResources[^>]*\/><OhioMunicipalResearchResources/);
});

test('Cheviot and Cleves original PDFs preserve archive identities and draft labels',()=>{
 const manifest=JSON.parse(readFileSync('docs/official-evidence/ohio-west-offices-2026-10-07/manifest.json'));
 const west=dossiers.filter(d=>['Cheviot','Cleves'].includes(d.name));
 assert.equal(west.length,2);assert.equal(west.flatMap(d=>d.resources).length,8);
 for(const row of west)for(const resource of row.resources){
 const source=manifest.sources.find(s=>s.file===resource.file),bytes=readFileSync('public'+resource.archive);
 assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert.deepEqual(bytes,readFileSync(source.retained_path));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),resource.sha256);assert.equal(bytes.length,resource.bytes);
 }
 const cleves=render(west.find(d=>d.name==='Cleves')),cheviot=render(west.find(d=>d.name==='Cheviot'));
 assert.match(cleves,/DRAFT zoning manual — not approved law/);assert.match(cleves,/complete searchable text is not claimed/);
 assert.match(cleves,/addresses differ/);assert.match(cheviot,/National Inspection Corporation/);
 for(const html of [cleves,cheviot])assert.match(html,/responsibilities remain unresolved|does not establish separate electrical/);
});

test('electrical provider guide retains identity while XLS and municipal roles stay unresolved',()=>{
 const manifest=JSON.parse(readFileSync('docs/official-evidence/ohio-west-offices-2026-10-07/electrical-routing/manifest.json'));
 const original=manifest.sources.find(s=>s.file==='ibi-eztrak-new-user.pdf');
 assert.equal(manifest.sources.find(s=>s.file.endsWith('.xls')).status,'retrieval_gap');
 for(const row of dossiers.filter(d=>['Cheviot','Cleves'].includes(d.name))){
 const r=row.electrical_research,bytes=readFileSync('public'+r.guide_archive);
 assert.deepEqual(bytes,readFileSync(original.retained_path));assert.equal(bytes.length,r.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);
 for(const flag of ['coverage_approved','permit_issuer_approved','inspection_role_approved'])assert.equal(r[flag],false);
 const html=render(row);assert.match(html,/municipal coverage unresolved/);assert.match(html,/HTTP 406/);assert.match(html,/Retained ezTrak guide PDF/);
 assert.match(html,/Official inspection-area XLS — retention gap/);assert.ok(html.includes('https://eztrak.cagis.org/'));
 assert.equal(render(row,false),'');
 }
});

test('Harrison and Addyston originals, online portal and duplicate bytes remain explicit',()=>{
 const manifest=JSON.parse(readFileSync('docs/official-evidence/ohio-harrison-addyston-2026-10-07/manifest.json'));
 const rows=dossiers.filter(d=>['City of Harrison','Village of Addyston'].includes(d.name));
 assert.equal(rows.length,2);assert.equal(rows.flatMap(d=>d.resources).length,6);
 for(const row of rows)for(const resource of row.resources){
 const source=manifest.sources.find(s=>s.file===resource.file),bytes=readFileSync('public'+resource.archive);
 assert.deepEqual(bytes,readFileSync(source.retained_path));assert.equal(bytes.length,resource.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),resource.sha256);
 }
 const h=rows.find(d=>d.name==='City of Harrison'),a=rows.find(d=>d.name==='Village of Addyston');
 assert.equal(h.resources[0].sha256,h.resources[1].sha256);assert.equal(new Set(rows.flatMap(d=>d.resources).map(r=>r.sha256)).size,5);
 const html=render(h);assert.match(html,/byte-identical/);assert.ok(html.includes('https://us.cloudpermit.com/login'));assert.ok(html.includes('https://www.harrisonohio.gov/157/Inspections'));
 assert.match(html,/permit issuance and canonical provider identity remain separately unapproved/);
 assert.equal(render({...h,id:'6ac1ebd2b2a2ba1a032a8985',name:'Harrison County',type:'county'}),'');
 assert.match(render(a),/recorded collection gap/);assert.match(render(a),/does not establish electrical responsibility/);
});

test('PDF page extraction preserves physical numbering, hashes and OCR gaps',()=>{
 const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/';
 const extraction=JSON.parse(readFileSync(root+'pdf-text-extraction.json'));
 assert.equal(extraction.distinct_archives_parsed,5);
 for(const doc of extraction.documents){
 assert.equal(doc.pages.length,doc.total_pages);assert.equal(doc.searchable_content_complete,false);assert.equal(doc.ocr_performed,false);
 for(const [index,page] of doc.pages.entries()){assert.equal(page.page,index+1);assert.equal(page.source_sha256,doc.source_sha256);assert.equal(page.text_sha256,createHash('sha256').update(page.text).digest('hex'));}
 }
 for(const doc of extraction.documents.filter(d=>d.file.includes('sign-instructions'))){assert.equal(doc.pages_with_embedded_text,0);assert.ok(doc.pages.every(p=>p.needs_ocr_review));}
 const add=dossiers.find(d=>d.name==='Village of Addyston');
 assert.equal(add.document_findings.length,4);
 for(const row of dossiers.filter(d=>['City of Harrison','Village of Addyston'].includes(d.name)))for(const finding of row.document_findings){
 const doc=extraction.documents.find(d=>finding.archive.includes(d.file)),page=doc.pages[finding.physical_page-1];
 if(!finding.observation_method)assert.equal(finding.text_sha256,page.text_sha256);assert.equal(finding.source_sha256,doc.source_sha256);
 assert.equal(finding.authority_approved,false);assert.match(finding.archive,new RegExp('#page='+finding.physical_page+'$'));
 }
 assert.match(render(add),/must not be treated as a zoning-sign exemption/);
 assert.match(render(dossiers.find(d=>d.name==='City of Harrison')),/visual-transcription candidates pending staff review/);
});

test('Harrison OCR and visual transcription keep separate immutable source identities',()=>{
 const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/ocr/';
 const manifest=JSON.parse(readFileSync(root+'render-ocr-manifest.json'));
 const receipt=JSON.parse(readFileSync(root+'visual-transcription-candidates.json'));
 assert.equal(receipt.raw_ocr_preserved,true);assert.equal(receipt.original_embedded_text_unchanged,true);assert.equal(receipt.findings.length,4);
 for(const p of manifest.pages){
 for(const [ext,key] of [['png','png_sha256'],['txt','raw_ocr_sha256'],['tsv','tsv_sha256']])assert.equal(createHash('sha256').update(readFileSync(root+'page-'+p.page+'.'+ext)).digest('hex'),p[key]);
 assert.deepEqual(readFileSync('public/permitting-evidence/harrison-addyston/harrison-sign-instructions-page-'+p.page+'-raw-ocr.txt'),readFileSync(root+'page-'+p.page+'.txt'));
 }
 assert.match(readFileSync(root+'page-2.txt','utf8'),/IB!/);
 for(const f of receipt.findings){const p=manifest.pages.find(p=>p.page===f.physical_page);assert.equal(f.render_sha256,p.png_sha256);assert.equal(f.raw_ocr_sha256,p.raw_ocr_sha256);assert.equal(f.excerpt_sha256,createHash('sha256').update(f.excerpt).digest('hex'));assert.equal(f.currentness_approved,false);assert.equal(f.verification_status,'pending_staff_review');}
 const h=dossiers.find(r=>r.name==='City of Harrison'),html=render(h);
 assert.match(html,/four plan copies/);assert.match(html,/separately directs illuminated/);assert.match(html,/Raw OCR — physical page 2/);assert.match(html,/unapproved transcription candidates/);
});

test('Harrison routing comparison keeps discrepancies and matched inspection contact separate',()=>{
 const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/submission-review/';
 const packet=JSON.parse(readFileSync(root+'routing-comparison.json')),manifest=JSON.parse(readFileSync(root+'manifest.json'));
 assert.equal(packet.rows.length,3);assert.equal(packet.supersession_approved,false);
 for(const row of packet.rows){const s=manifest.sources.find(s=>s.official_url===row.url);assert.equal(row.html_sha256,createHash('sha256').update(readFileSync(s.retained_path)).digest('hex'));assert.equal(row.currentness_approved,false);assert.equal(row.staff_approved,false);assert.match(row.guide_url,new RegExp('#page='+row.page+'$'));}
 const h=dossiers.find(d=>d.name==='City of Harrison'),html=render(h);
 assert.match(html,/513-202-8488/);assert.match(html,/513-202-8494/);assert.match(html,/supersession is not established/);assert.match(html,/Permit issuance is separate/);
 assert.match(html,/<table/);assert.equal(render(h,false),'');
});

test('North Bend originals and page findings remain research-only for exact village identity',()=>{
 const row=dossiers.find(d=>d.id==='6ac19f1c2fbbf3b8bb27397c');
 assert.equal(row.resources.length,2);assert.equal(row.document_findings.length,8);
 const root='docs/official-evidence/ohio-northbend-whitewater-2026-10-07/';
 const manifest=JSON.parse(readFileSync(root+'manifest.json'));
 const pdf=JSON.parse(readFileSync(root+'northbend-linked-zoning-code.pages.json'));
 for(const r of row.resources){const original=manifest.sources.find(s=>s.file===r.file),bytes=readFileSync('public'+r.archive);
 assert.deepEqual(bytes,readFileSync(original.retained_path));assert.equal(bytes.length,r.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
 for(const f of row.document_findings){const p=pdf.pages.find(p=>p.page===f.physical_page);
 assert.equal(f.source_sha256,pdf.source_sha256);assert.equal(f.text_sha256,p.text_sha256);
 assert.ok(p.text.includes(f.matched_text));assert.equal(f.staff_approved,false);assert.equal(f.currentness_approved,false);assert.equal(f.applicability_approved,false);
 assert.ok(f.archive.endsWith('#page='+f.physical_page));}
 const html=render(row);assert.match(html,/April 28, 2025/);assert.match(html,/4,000K/);assert.match(html,/independently unresolved/);
 assert.equal(render({...row,type:'township'}),'');assert.equal(render({...row,name:'Whitewater Township'}),'');
 assert.equal(dossiers.some(d=>d.name==='Whitewater Township'),false);
 const reconciliation=JSON.parse(readFileSync(root+'office-reconciliation.json'));
 assert.equal(reconciliation.profiles.find(p=>p.name==='Whitewater Township').id,null);
});

test('Green split zoning and Delhi original forms preserve locality and role gaps',()=>{
 const root='docs/official-evidence/ohio-green-delhi-2026-10-07/';
 const m=JSON.parse(readFileSync(root+'manifest.json')),e=JSON.parse(readFileSync(root+'pdf-text-extraction.json'));
 assert.equal(e.documents.reduce((n,d)=>n+d.total_pages,0),189);
 for(const s of m.sources.filter(s=>s.status==='archived')){const b=readFileSync(s.retained_path);assert.equal(b.length,s.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);}
 for(const d of e.documents){assert.equal(d.pages.length,d.total_pages);assert.equal(d.searchable_content_complete,false);
 for(const [i,p]of d.pages.entries()){assert.equal(p.page,i+1);assert.equal(p.source_sha256,d.source_sha256);assert.equal(createHash('sha256').update(p.text).digest('hex'),p.text_sha256);}
 assert.deepEqual(readFileSync('public/permitting-evidence/green-delhi/'+d.file),readFileSync(root+d.file));}
 const row=dossiers.find(d=>d.name==='Green Township'),html=render(row);
 assert.match(html,/two zoning jurisdictions/);assert.match(html,/certificate verification/);assert.match(html,/separately unresolved/);
 assert.equal(row.online_form_url,undefined);assert.equal(render({...row,type:'city'}),'');
 const r=row.resources[0];assert.deepEqual(readFileSync('public'+r.archive),readFileSync(root+r.file));
 assert.equal(dossiers.some(d=>d.name==='Delhi Township'),false);
 const packet=JSON.parse(readFileSync(root+'office-reconciliation.json'));assert.equal(packet.profiles[1].id,null);assert.equal(packet.electrical_roles_approved,false);assert.equal(packet.live_records_changed,0);
});

test('Delhi sign packet preserves page evidence, anomalies and separate pending roles',()=>{
 const root='docs/official-evidence/ohio-green-delhi-2026-10-07/',p=JSON.parse(readFileSync(root+'delhi-sign-review-packet.json'));
 assert.equal(p.findings.length,8);assert.equal(p.locality.canonical_id,null);assert.equal(p.live_records_changed,0);
 assert.equal(p.electrical_permit_issuer_approved,false);assert.equal(p.electrical_inspector_approved,false);
 for(const f of p.findings){const d=JSON.parse(readFileSync(root+f.file.replace('.pdf','.pages.json'))),page=d.pages[f.physical_page-1];
 assert.equal(f.source_sha256,d.source_sha256);assert.equal(f.text_sha256,page.text_sha256);
 assert.ok(page.text.includes(f.matched_text));assert.equal(f.currentness_approved,false);assert.equal(f.authority_approved,false);}
 assert.equal(p.address_comparison.application_address,'697 Neeb Road');assert.equal(p.address_comparison.township_page_address,'5031 Delhi Road');
 assert.equal(p.address_comparison.approved,false);
 assert.ok(p.findings.some(f=>f.matched_text==='MONROE COUNTY, INDIANA'));
});

test('Ohio electrical legacy form is not promoted to current submission or coverage authority',()=>{
 const root='docs/official-evidence/ohio-electrical-application-review-2026-10-07/',p=JSON.parse(readFileSync(root+'routing-review.json')),m=JSON.parse(readFileSync(root+'manifest.json'));
 assert.equal(m.sources.length,3);assert.ok(m.sources.every(s=>s.status==='retention_gap'&&!s.sha256));
 assert.equal(p.electrical_permit_issuer_approved,false);assert.equal(p.electrical_inspector_approved,false);assert.equal(p.service_area_approved,false);
 assert.equal(p.observations[1].current_submission_route_approved,false);
 for(const id of ['6ac1aae70e3a16c893d4e506','6ac19f1c2fbbf3b8bb27397c']){
 const row=dossiers.find(r=>r.id===id),html=render(row);
 assert.match(html,/older form is not a confirmed current Ohio route/);
 assert.equal(row.notes.filter(n=>n.startsWith('The electrical provider homepage')).length,1);
 assert.equal(row.references.filter(r=>r.url===p.observations[2].url).length,1);
 assert.equal(row.online_form_url,undefined);}
});

test('Hamilton Miami and Crosby sources preserve county identity and scanned-original gaps',()=>{
 const root='docs/official-evidence/ohio-miami-crosby-2026-10-07/',m=JSON.parse(readFileSync(root+'manifest.json')),e=JSON.parse(readFileSync(root+'pdf-text-extraction.json')),p=JSON.parse(readFileSync(root+'office-reconciliation.json'));
 assert.equal(m.sources.filter(s=>s.status==='archived').length,6);
 for(const s of m.sources){const b=readFileSync(s.retained_path);assert.equal(b.length,s.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);if(s.file.endsWith('.pdf'))assert.deepEqual(b,readFileSync('public/permitting-evidence/miami-crosby/'+s.file));}
 assert.equal(e.documents.reduce((n,d)=>n+d.total_pages,0),174);
 const scan=e.documents.find(d=>d.file.includes('maintenance'));assert.equal(scan.pages_with_embedded_text,0);assert.ok(scan.pages.every(p=>p.needs_ocr_review));assert.equal(scan.ocr_performed,false);
 for(const d of e.documents)for(const[i,page]of d.pages.entries()){assert.equal(page.page,i+1);assert.equal(page.source_sha256,d.source_sha256);assert.equal(createHash('sha256').update(page.text).digest('hex'),page.text_sha256);}
 assert.equal(p.profiles[0].county,'Hamilton');assert.equal(p.profiles[0].canonical_id,null);assert.equal(p.profiles[0].conflicting_records.length,2);assert.equal(p.profiles[1].canonical_id,null);assert.equal(p.electrical_permit_issuer_approved,false);assert.equal(p.electrical_inspector_approved,false);assert.equal(p.live_records_changed,0);
 assert.equal(dossiers.some(d=>p.profiles[0].conflicting_records.some(r=>r.id===d.id)),false);
 assert.match(readFileSync(root+'crosby-zoning.txt','utf8'),/dcarter@cvennemeier@/);
});

test('Crosby sign review keeps zoning/electrical exemptions and printed cross-reference distinct',()=>{
 const root='docs/official-evidence/ohio-miami-crosby-2026-10-07/',p=JSON.parse(readFileSync(root+'crosby-sign-review-packet.json'));
 assert.equal(p.findings.length,9);assert.equal(p.locality.canonical_id,null);assert.equal(p.live_records_changed,0);
 assert.equal(p.electrical_permit_issuer_approved,false);assert.equal(p.electrical_inspector_approved,false);
 for(const f of p.findings){const d=JSON.parse(readFileSync(root+f.file.replace('.pdf','.pages.json'))),page=d.pages[f.physical_page-1];
 assert.equal(f.source_sha256,d.source_sha256);assert.equal(f.text_sha256,page.text_sha256);assert.ok(page.text.includes(f.matched_text));
 assert.equal(f.currentness_approved,false);assert.equal(f.authority_approved,false);assert.equal(f.applicability_approved,false);
 assert.ok(f.archive.endsWith('#page='+f.physical_page));}
 const z=JSON.parse(readFileSync(root+'crosby-zoning-resolution.pages.json'));
 assert.match(z.pages[101].text,/Article\s+13/);
 assert.match(p.findings.find(f=>f.label==='Maintenance and electrical components').text,/does not establish an electrical-permit/);
 assert.match(p.findings.find(f=>f.label==='Sign-area measurement').text,/require visual\/table review/);
 assert.equal(dossiers.some(d=>d.name==='Crosby Township'),false);
});

test('Harrison and Symmes township archives retain 199 physical pages without identity or office approval',()=>{
 const root='docs/official-evidence/ohio-harrison-symmes-townships-2026-10-07/',m=JSON.parse(readFileSync(root+'manifest.json')),r=JSON.parse(readFileSync(root+'office-reconciliation.json')),e=JSON.parse(readFileSync(root+'pdf-text-extraction.json'));
 assert.equal(m.sources.length,4);for(const s of m.sources){const b=readFileSync(s.retained_path);assert.equal(b.length,s.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);if(s.file.endsWith('.pdf'))assert.deepEqual(readFileSync('public/permitting-evidence/harrison-symmes-townships/'+s.file),b);}
 assert.equal(e.documents.reduce((n,d)=>n+d.total_pages,0),199);for(const d of e.documents){assert.equal(d.pages.length,d.total_pages);assert.equal(d.searchable_content_complete,false);for(const p of d.pages){assert.equal(p.source_sha256,d.source_sha256);assert.equal(createHash('sha256').update(p.text).digest('hex'),p.text_sha256);}}
 assert.equal(r.profiles.length,2);for(const p of r.profiles){assert.equal(p.id,null);assert.equal(p.county,'Hamilton');assert.equal(dossiers.some(d=>d.name===p.name),false);}
 assert.match(r.profiles[0].routing_candidate,/not City of Harrison or Harrison County/);
 for(const k of ['staff_approved','currentness_approved','coverage_approved','electrical_permit_issuer_approved','electrical_inspector_approved'])assert.equal(r[k],false);
 assert.equal(r.live_records_changed,0);assert.match(r.map_version_review,/2017/);
});
