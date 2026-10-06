import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const dir=resolve('node_modules/.cache/permitting-locality-office');await mkdir(dir,{recursive:true});
try {
 const outfile=resolve(dir,'panel.mjs');
 await build({entryPoints:['src/components/permitting/LocalityOfficeEvidence.jsx'],outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',alias:{'@':resolve('src')},external:['react','react-dom','react/jsx-runtime'],plugins:[{name:'no-live-api',setup(b){
  b.onResolve({filter:/base44Client/},()=>({path:'client',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const base44={functions:{invoke(){throw Error("Live API forbidden");}}};'}));
 }}]});
 globalThis.window={self:null,top:null};const {default:Panel}=await import(pathToFileURL(outfile));delete globalThis.window;
 const pending=[],calls=[],retrieveEvidence=payload=>{calls.push(payload);return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.children?text(n.children):'';
 let tree;const props={jurisdictionId:'A',retrieveEvidence};await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,props));});
 const button=label=>tree.root.findAllByType('button').find(b=>text(b.props.children)===label),full=()=>text(tree.toJSON());
 assert.equal(calls.length,0);
 await act(async()=>{const fn=button('Load reviewed office evidence').props.onClick;fn();fn();});assert.equal(calls.length,1);
 const row={id:'review1',relation_key:'office:sign:area',sequence:1,action:'verify',role:'sign_permit',coverage_area:'Unincorporated Pilot A',coverage_kind:'unincorporated',office_snapshot:{name:'Pilot planning',source_url:'https://example.test/office'},verified:true,is_current_review:true,state:'staff_verified',role_proof:{excerpt:'Our office handles sign permits.',physical_page:2},official_url:'https://example.test/form',archived_file_url:'https://example.test/archive.pdf',requested_by:'Reviewer',requested_at:'2026-10-06'};
 const page={success:true,jurisdiction_id:'A',profile_updated_date:'p1',checked_at:'2026-10-06',items:[row],has_more:true,next_cursor:'5'};
 await act(async()=>pending.shift().resolve(page));assert.match(full(),/Current staff-verified relationship/);assert.match(full(),/unincorporated area only/);assert.match(full(),/Physical PDF page 2/);assert.equal(tree.root.findAllByType('a').length,3);
 await act(async()=>{button('Load more office reviews').props.onClick();});assert.equal(calls.at(-1).expected_profile_updated_date,'p1');assert.equal(calls.at(-1).cursor,'5');
 await act(async()=>pending.shift().resolve({...page,has_more:false,next_cursor:null,items:[{...row,id:'review2',verified:false,state:'revoked',action:'revoke',role_proof:{excerpt:'DO NOT DISPLAY STALE QUOTE'}}]}));
 assert.match(full(),/Not verified for use — revoked/);assert.doesNotMatch(full(),/DO NOT DISPLAY STALE QUOTE/);assert.match(full(),/2 loaded review records/);
 await act(async()=>{button('Refresh office evidence').props.onClick();});assert.doesNotMatch(full(),/Current staff-verified relationship/);
 await act(async()=>pending.shift().reject(Error('Evidence unavailable')));assert.match(full(),/Evidence unavailable/);assert.equal(tree.root.findAllByType('a').length,0);
 await act(async()=>{button('Load reviewed office evidence').props.onClick();});const stale=pending.shift();
 await act(async()=>tree.update(React.createElement(Panel,{...props,jurisdictionId:'B'})));await act(async()=>stale.resolve(page));assert.doesNotMatch(full(),/Pilot planning/);
 await act(async()=>{button('Load reviewed office evidence').props.onClick();});await act(async()=>pending.shift().resolve(page));assert.match(full(),/could not be verified for this locality/);
 await act(async()=>tree.unmount());console.log('Office evidence component acceptance passed: manual read, single-flight, quote/source display, coverage boundaries, revoked proof exclusion, versioned pagination, failed refresh and stale-scope rejection. No live API calls.');
} finally {delete globalThis.window;await rm(dir,{recursive:true,force:true});}
