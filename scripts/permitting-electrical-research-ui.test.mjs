
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
 assert.match(html,/email intake and digital uploads/);
 assert.match(html,/City process is separate from IBI electrical submissions/);
 assert.match(html,/May 2017/);
 assert.match(html,/operational availability has not been verified/);
 assert.match(html,/Ohio applicability after the migration remains unresolved/);
 assert.equal((html.match(/Retained PDF/g)||[]).length,4);
});
test('every retained download matches original archived bytes and provenance hashes',()=>{
 const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/provider/';
 const dossier=JSON.parse(readFileSync(root+'role-resource-reconciliation.json','utf8'));
 const refs=JSON.parse(readFileSync('src/components/permitting/cincinnatiElectricalResearch.json','utf8'));
 const signManifest=JSON.parse(readFileSync(root+'../sign-scope/manifest.json','utf8'));
 const originals=[...signManifest.sources.filter(r=>r.file),dossier.roles.electrical_permit.account_instructions_archive,...dossier.retained_fee_and_submittal_resources.filter(r=>r.file)];
 for(const r of refs.resources){
  const bytes=readFileSync('public'+r.archive);
  assert.deepEqual(bytes,readFileSync(root+(r.file==='cincinnati-signs-handout.pdf'?'../sign-scope/':'')+r.file));
  const source=originals.find(o=>o.file===r.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
  assert.equal(r.source,source.url||source.source_url);
 }
});
test('research disclosure is a sibling of approved evidence',()=>{
 const s=readFileSync('src/components/permitting/LocalityApprovedEvidence.jsx','utf8');
 assert.match(s,/\/><ElectricalResearchResources jurisdiction=\{jurisdiction\} isAdmin=\{isAdmin\}/);
});
test('zoning research preserves boundary, overlay and electrical coverage limits',()=>{
 const html=render();
 assert.match(html,/Related City zoning scope — awaiting review/);
 assert.match(html,/base zoning district, and applicable overlays/);
 assert.match(html,/mailing address alone does not resolve jurisdiction/);
 assert.match(html,/does not establish IBI electrical service coverage/);
 assert.match(html,/Current sign exemptions.*remain unresolved/);
 assert.match(html,/current fee before submitting/);
});
test('zoning request download matches retained original and official page link',()=>{
 const research=JSON.parse(readFileSync('src/components/permitting/cincinnatiElectricalResearch.json'));
 const packet=JSON.parse(readFileSync('docs/official-evidence/ohio-electrical-discovery-2026-10-06/scope-review/scope-review-packet.json'));
 const bytes=readFileSync('public'+research.scope_review.form_archive);
 assert.deepEqual(bytes,readFileSync(packet.request_form.retained_path));
 assert.equal(bytes.length,packet.request_form.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),research.scope_review.form_sha256);
 assert.equal(research.scope_review.form_sha256,packet.request_form.sha256);
 assert.equal(research.scope_review.form_source,packet.request_form.official_url);
 assert.equal(packet.request_form.fee_verified,false);
 assert.equal(packet.locality_coverage_approved,false);
 assert.equal(packet.compiled_code_status.current_exemptions_established,false);
});
test('explicit inspection statement stays separate from unresolved permit issuer and approvals',()=>{
 const html=render();
 assert.match(html,/Explicit City statement retained; approval pending/);
 assert.match(html,/Issuer responsibility unresolved/);
 assert.match(html,/original HTTP provider link/);
 const packet=JSON.parse(readFileSync('docs/official-evidence/ohio-electrical-discovery-2026-10-06/electrical-office-review/electrical-office-review-packet.json'));
 assert.equal(packet.roles.electrical_inspection.explicit_municipal_responsibility_clause_retained,true);
 assert.equal(packet.roles.electrical_inspection.approved,false);
 assert.equal(packet.roles.electrical_permit.explicit_issuer_established,false);
 assert.equal(packet.roles.electrical_permit.approved,false);
 assert.equal(packet.original_link_upgraded,false);
 assert.equal(packet.redirect_verified,false);
 assert.equal(packet.provider_contact_retrieval.status,'not_archived');
 assert.equal(packet.blockers.length,3);
});
