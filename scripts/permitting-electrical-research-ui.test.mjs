
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const b=await build({entryPoints:['src/components/permitting/ElectricalResearchResources.jsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic'});
const Component=(await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))).default;
const jurisdiction={id:'6ac1a123edda6d8dd942690b',name:'Cincinnati',state:'OH',type:'city'};
const render=(j=jurisdiction,isAdmin=true)=>renderToStaticMarkup(React.createElement(Component,{jurisdiction:j,isAdmin}));
test('research requires admin and exact locality identity',()=>{
 assert.equal(render(jurisdiction,false),'');
 for(const [key,value] of Object.entries({id:'other',name:'Cleves',state:'KY',type:'county'})) assert.equal(render({...jurisdiction,[key]:value}),'');
 assert.equal(render(null),'');
});
test('candidate references remain visibly unapproved with routing limits',()=>{
 const html=render();
 assert.match(html,/awaiting staff review/);
 assert.match(html,/unapproved candidate/);
 assert.match(html,/Historical reference/);
 assert.match(html,/operational availability has not been verified/);
 assert.match(html,/Ohio applicability after the migration remains unresolved/);
 assert.equal((html.match(/Retained PDF/g)||[]).length,3);
});
test('every retained download matches original archived bytes and provenance hashes',()=>{
 const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/provider/';
 const dossier=JSON.parse(readFileSync(root+'role-resource-reconciliation.json','utf8'));
 const refs=JSON.parse(readFileSync('src/components/permitting/cincinnatiElectricalResearch.json','utf8'));
 const originals=[dossier.roles.electrical_permit.account_instructions_archive,...dossier.retained_fee_and_submittal_resources.filter(r=>r.file)];
 for(const r of refs.resources){
  const bytes=readFileSync('public'+r.archive);
  assert.deepEqual(bytes,readFileSync(root+r.file));
  const source=originals.find(o=>o.file===r.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
  assert.equal(r.source,source.url||source.source_url);
 }
});
test('research disclosure is a sibling of approved evidence',()=>{
 const s=readFileSync('src/components/permitting/LocalityApprovedEvidence.jsx','utf8');
 assert.match(s,/\/><ElectricalResearchResources jurisdiction=\{jurisdiction\} isAdmin=\{isAdmin\}/);
});
