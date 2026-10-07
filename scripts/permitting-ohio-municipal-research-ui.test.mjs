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
