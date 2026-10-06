import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const dir=resolve('node_modules/.cache/coverage-panel');await mkdir(dir,{recursive:true});
globalThis.window={self:null,top:null};
try{
 await build({entryPoints:['src/components/permitting/PermittingRecordedCoverage.jsx'],outfile:dir+'/panel.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',alias:{'@':resolve('src')},external:['react','react/jsx-runtime'],plugins:[{name:'no-api',setup(b){b.onResolve({filter:/base44Client/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const base44={};'}));}}]});
 const {default:Panel}=await import(dir+'/panel.mjs');let calls=0,resolveRead;
 const readCoverage=()=>{calls++;return new Promise(r=>resolveRead=r);};let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(Panel,{readCoverage}));});
 assert.equal(calls,0);const click=()=>tree.root.findByType('button').props.onClick();
 await act(async()=>{click();click();});assert.equal(calls,1);
 await act(async()=>resolveRead({items:[{state:'profile_missing'}],invalid_profile_ids:[],unmatched_profile_ids:[],checked_at:'fixture'}));
 assert.match(JSON.stringify(tree.toJSON()),/Official inventory denominator not reconciled/);
 await act(async()=>tree.update(React.createElement(Panel,{readCoverage:async()=>{throw Error('Fixture failure');}})));
 await act(async()=>click());assert.match(JSON.stringify(tree.toJSON()),/Fixture failure/);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Read completed/);
 await act(async()=>tree.unmount());console.log('Coverage panel passed: manual only, duplicate-click guard, explicit uncertainty and failed-refresh clearing. No live API calls.');
}finally{delete globalThis.window;await rm(dir,{recursive:true,force:true});}
