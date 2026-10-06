import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const dir=resolve('node_modules/.cache/permitting-evidence-search');
await mkdir(dir,{recursive:true});
try {
 const outfile=resolve(dir,'panel.mjs');
 await build({entryPoints:['src/components/admin/PermittingApprovedEvidenceSearch.jsx'],outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',
  alias:{'@':resolve('src')},external:['react','react-dom','react/jsx-runtime'],plugins:[{name:'no-live-api',setup(b){
   b.onResolve({filter:/base44Client/},()=>({path:'client',namespace:'mock'}));
   b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const base44={functions:{invoke(){throw Error("Live API forbidden in component acceptance");}}};'}));
  }}]});
 globalThis.window={self:null,top:null};
 const {default:Panel}=await import(pathToFileURL(outfile));
 delete globalThis.window;
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.children?text(n.children):'';
 const pending=[],calls=[];
 const retrieveEvidence=payload=>{calls.push(payload);return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
 const props={jurisdictionId:'A',jurisdictionName:'Pilot A',retrieveEvidence};
 let tree;
 await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,props));});
 const button=label=>tree.root.findAllByType('button').find(b=>text(b.props.children)===label);
 const full=()=>text(tree.toJSON());
 const row={rule_id:'r1',rule_kind:'regulatory_rule',requirement:'Maximum area is 50 square feet.',
  trigger:'when illuminated',exceptions:'painted wall signs',sign_type:'wall sign',jurisdiction_scope:'Pilot A',
  reviewer:'Staff reviewer',reviewed_at:'2026-10-06',citations:[{physical_page:2,excerpt:'Maximum area is 50 square feet.',
  official_url:'https://example.test/code',archived_file_url:'https://example.test/retained.pdf'}]};
 const page={success:true,evidence:[row],blocked:[{rule_id:'blocked',blocker:'Authority changed'}],has_more:true,next_cursor:'25',checked_at:'2026-10-06T13:30:00Z'};
 // The synchronous ref prevents double-click overlap before a React rerender.
 await act(async()=>{const fn=button('Load approved evidence').props.onClick;fn();fn();});
 assert.equal(calls.length,1);
 await act(async()=>pending.shift().resolve(page));
 assert.match(full(),/More approved records remain/);assert.match(full(),/Address applicability still requires review/);
 assert.match(full(),/painted wall signs/);assert.match(full(),/Physical PDF page 2/);assert.match(full(),/Authority changed/);
 assert.equal(tree.root.findAllByType('a').length,2);
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'nonexistent'}}));
 assert.match(full(),/0 matching requirements/);assert.match(full(),/does not establish that a permit is unnecessary/);
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:''}}));
 await act(async()=>button('Load next evidence page').props.onClick());
 assert.equal(calls[1].cursor,'25');
 await act(async()=>pending.shift().resolve({...page,evidence:[{...row,rule_id:'r2',rule_kind:'administrative_instruction'}],blocked:[],has_more:false,next_cursor:null}));
 assert.match(full(),/Reviewed submission instruction/);assert.match(full(),/2 loaded verified records/);
 // A request begun for A may not paint evidence over B.
 await act(async()=>button('Refresh approved evidence').props.onClick());
 const stale=pending.shift();
 await act(async()=>tree.update(React.createElement(Panel,{...props,jurisdictionId:'B',jurisdictionName:'Pilot B'})));
 await act(async()=>stale.resolve(page));
 assert.doesNotMatch(full(),/Maximum area/);assert.match(full(),/Pilot B/);
 await act(async()=>button('Load approved evidence').props.onClick());
 assert.equal(calls.at(-1).jurisdiction_id,'B');
 await act(async()=>pending.shift().resolve({...page,has_more:false,next_cursor:null}));
 await act(async()=>button('Refresh approved evidence').props.onClick());
 await act(async()=>pending.shift().reject(Error('Current evidence unavailable')));
 assert.match(full(),/Current evidence unavailable/);assert.doesNotMatch(full(),/Maximum area/);
 await act(async()=>tree.update(React.createElement(Panel,{...props,jurisdictionId:'B',disabled:true})));
 assert.equal(button('Load approved evidence').props.disabled,true);
 await act(async()=>tree.unmount());
 console.log('Approved evidence panel acceptance passed: quotes/links, uncertainty, loaded-page search, pagination, single-flight, stale scope, failed refresh and disabled controls. No live API or browser calls.');
} finally {await rm(dir,{recursive:true,force:true});}
