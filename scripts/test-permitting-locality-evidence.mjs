import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const dir=resolve('node_modules/.cache/permitting-locality-evidence');
await mkdir(dir,{recursive:true});
try {
 const outfile=resolve(dir,'panel.mjs');
 await build({entryPoints:['src/components/permitting/LocalityApprovedEvidence.jsx'],outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',
  alias:{'@':resolve('src')},external:['react','react-dom','react/jsx-runtime'],plugins:[{name:'isolated-sdk',setup(b){
   b.onResolve({filter:/base44Client/},()=>({path:'client',namespace:'mock'}));
   b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const base44={functions:{invoke(...args){return globalThis.localityEvidenceInvocation(...args);}}};'}));
  }}]});
 globalThis.window={self:null,top:null,localStorage:{getItem:()=> 'isolated-fixture-session'}};
 const {default:Panel}=await import(pathToFileURL(outfile));
 const calls=[],pending=[];
 globalThis.localityEvidenceInvocation=(name,payload)=>{calls.push({name,payload});return new Promise(resolve=>pending.push(resolve));};
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.children?text(n.children):'';
 const hash='a'.repeat(64);
 const A={id:'locality-A',name:'Pilot A',permitting_url:'https://example.test/portal',contact_info:{department:'Pilot A planning',phone:'555-0100'},documents:[
  {id:'form',title:'Pilot A application',doc_type:'permit_application',url:'https://example.test/form.pdf',file_url:'https://example.test/stored.pdf',source_sha256:hash,stored_sha256:hash,source_bytes:100,stored_bytes:100},
  {id:'fee',title:'Pilot A fees',doc_type:'fee_schedule',url:'https://example.test/fees.pdf',file_url:'https://example.test/unverified.pdf',source_sha256:hash,stored_sha256:'b'.repeat(64),source_bytes:100,stored_bytes:100},
  {id:'bad',title:'Legacy checklist',doc_type:'checklist',url:'javascript:alert(1)',file_url:'data:text/html,invalid'},
 ]},B={id:'locality-B',name:'Pilot B'};
 let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,{jurisdiction:A,isAdmin:true}));});
 const full=()=>text(tree.toJSON());
 const toggle=open=>act(async()=>tree.root.findByType('details').props.onToggle({currentTarget:{open}}));
 const button=label=>tree.root.findAllByType('button').find(b=>text(b.props.children)===label);
 assert.equal(tree.root.findByType('details').props.open,false);assert.equal(calls.length,0);
 await toggle(true);assert.equal(calls.length,0);
 const links=tree.root.findAllByType('a').map(a=>a.props.href);
 assert.ok(links.includes('https://example.test/form.pdf'));assert.ok(links.includes('https://example.test/stored.pdf'));
 assert.ok(links.includes('https://example.test/portal'));assert.ok(links.includes('https://example.test/fees.pdf'));
 assert.ok(!links.includes('https://example.test/unverified.pdf'));assert.ok(links.every(url=>url.startsWith('https://')));
 assert.match(full(),/Pilot A planning/);assert.match(full(),/authority requires confirmation/);
 assert.match(full(),/Source link missing or unusable/);assert.match(full(),/Verified stored PDF not available/); // Opening a locality never spends AI credits or retrieves automatically.
 await act(async()=>{button('Load approved evidence').props.onClick();});
 assert.equal(calls[0].name,'permittingRuleReview');assert.equal(calls[0].payload.jurisdiction_id,A.id);
 assert.equal(calls[0].payload.action,'retrieve_evidence');assert.equal(calls[0].payload.session_token,'isolated-fixture-session');
 const response={data:{success:true,evidence:[{rule_id:'r1',rule_kind:'regulatory_rule',requirement:'Pilot A approved quotation',citations:[]}],blocked:[],has_more:false,checked_at:'2026-10-06T14:00:00Z'}};
 await act(async()=>pending.shift()(response));assert.match(full(),/Pilot A approved quotation/);
 await act(async()=>tree.update(React.createElement(Panel,{jurisdiction:B,isAdmin:true})));
 assert.equal(tree.root.findByType('details').props.open,false);assert.doesNotMatch(full(),/Pilot A approved quotation|Pilot A application|Pilot A planning/);
 await toggle(true);assert.match(full(),/No application form, checklist or fee schedule/);assert.match(full(),/No department contact/);await act(async()=>{button('Load approved evidence').props.onClick();});assert.equal(calls.at(-1).payload.jurisdiction_id,B.id);
 await toggle(false);await act(async()=>pending.shift()(response));await toggle(true);
 assert.doesNotMatch(full(),/Pilot A approved quotation/);assert.ok(button('Load approved evidence'));
 await act(async()=>{button('Load approved evidence').props.onClick();});
 await act(async()=>tree.update(React.createElement(Panel,{jurisdiction:B,isAdmin:false})));
 await act(async()=>pending.shift()(response));await toggle(true);
 assert.match(full(),/An administrator must load and verify/);assert.equal(tree.root.findAllByType('button').length,0);
 assert.doesNotMatch(full(),/Pilot A approved quotation/);assert.equal(calls.length,3);
 await act(async()=>tree.unmount());
 console.log('Locality evidence acceptance passed: manual-only retrieval, scoped authenticated request, locality reset, collapse cancellation, admin-loss quote removal, forms/contact scope, unsafe URL rejection and verified-archive-only links. No live API calls.');
} finally {
 delete globalThis.window;delete globalThis.localityEvidenceInvocation;await rm(dir,{recursive:true,force:true});
}
