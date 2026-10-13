import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';

const dir=resolve('node_modules/.cache/selector-office-id-lookup');
await mkdir(dir,{recursive:true});
await build({entryPoints:['src/components/permitting/SelectorSourceOfficeReviewLookup.jsx'],
 outfile:dir+'/lookup.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',
 external:['react','react/jsx-runtime'],
 plugins:[{name:'mock-base44',setup(build){
  build.onResolve({filter:/base44Client/},args=>({path:args.path,namespace:'mock-client'}));
  build.onLoad({filter:/.*/,namespace:'mock-client'},()=>({contents:'export const base44={entities:{}};'}));
 }}]});
const {default:View}=await import(dir+'/lookup.mjs');
after(async()=>rm(dir,{recursive:true,force:true}));
const profile={id:'oh-profile',state:'OH'};
const document={id:'doc-1',url:'https://gov.example/permit.pdf'};
const buttons=tree=>tree.root.findAllByType('button');
test('the exact review lookup stays dormant until explicit click and suppresses repeated clicks',async()=>{
 let calls=0,finish;
 const lookup=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(View,{profile,document,read:lookup}));});
 assert.equal(calls,0);
 assert.equal(buttons(tree).length,1);
 await act(async()=>{buttons(tree)[0].props.onClick();buttons(tree)[0].props.onClick();});
 assert.equal(calls,1);
 assert.equal(buttons(tree)[0].props.disabled,true);
 await act(async()=>finish({status:'recorded_history_read',document_id:'doc-1',source_id:'catalog-1',
  notice:'Historical reference only; jurisdiction must be verified.',items:[{
   role:'electrical_permit',review_id:'verified-before',latest_review_id:'revoked-later',
   office_id:'canonical-1',physical_page:2,status:'revoked',latest_source_id:'',
   review_ids:['verified-before','revoked-later']}] }));
 const view=JSON.stringify(tree.toJSON());
 for(const phrase of ['catalog-1','verified-before','revoked-later','canonical-1','revoked','Historical reference only'])
  assert.match(view,new RegExp(phrase));
 assert.match(view,/not current electrical office approval/);
 assert.equal(buttons(tree)[0].props.disabled,false);
 await act(async()=>tree.unmount());
});
test('failed lookup stays a warning, missing document identity blocks button',async()=>{
 let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(View,{profile,document,read:async()=>{throw Error('Scope unavailable')}}));});
 await act(async()=>buttons(tree)[0].props.onClick());
 assert.match(JSON.stringify(tree.toJSON()),/Scope unavailable/);
 assert.match(JSON.stringify(tree.toJSON()),/Do not infer/);
 await act(async()=>tree.update(React.createElement(View,{profile,document:{id:'',url:''}})));
 assert.equal(buttons(tree).length,0);
 assert.match(JSON.stringify(tree.toJSON()),/source identity/);
 await act(async()=>tree.unmount());
});
test('switching exact document identity removes previous result and does not auto query',async()=>{
 let calls=0,tree;
 const lookup=async()=>{calls++;return {status:'no_visible_catalog_link',document_id:'doc-1',items:[],notice:'No catalog visible'};};
 await act(async()=>{tree=Renderer.create(React.createElement(View,{profile,document,read:lookup}));});
 await act(async()=>buttons(tree)[0].props.onClick());
 assert.equal(calls,1);
 assert.match(JSON.stringify(tree.toJSON()),/No catalog visible/);
 await act(async()=>tree.update(React.createElement(View,{profile,document:{...document,id:'doc-2'},read:lookup})));
 assert.doesNotMatch(JSON.stringify(tree.toJSON()),/No catalog visible/);
 assert.equal(calls,1);
 await act(async()=>tree.unmount());
});
