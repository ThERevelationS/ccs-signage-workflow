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
 for(const row of dossiers.filter(d=>d.document_findings))for(const finding of row.document_findings){
 const doc=extraction.documents.find(d=>finding.archive.includes(d.file)),page=doc.pages[finding.physical_page-1];
 assert.equal(finding.text_sha256,page.text_sha256);assert.equal(finding.source_sha256,doc.source_sha256);
 assert.equal(finding.authority_approved,false);assert.match(finding.archive,new RegExp('#page='+finding.physical_page+'$'));
 }
 assert.match(render(add),/must not be treated as a zoning-sign exemption/);
 assert.match(render(dossiers.find(d=>d.name==='City of Harrison')),/OCR\/visual transcription is still required/);
});
