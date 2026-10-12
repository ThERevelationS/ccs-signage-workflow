import assert from 'node:assert/strict';
import {reconcileElectricalOfficeCoverage} from '../src/components/permitting/permittingCoverageReader.mjs';
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
 await act(async()=>resolveRead({items:[{state:'profile_missing'}],invalid_profile_ids:[],unmatched_profile_ids:[],checked_at:'fixture',electrical_offices:reconcileElectricalOfficeCoverage([{id:'locality',state:'OH',name:'Office gap fixture',offices:[{authority_roles:['electrical_permit'],authority_verification_status:'staff_verified'}]}]),official:{source_vintage:'fixture',source_rows:3647,candidate_counts:{OH:2318,KY:530},status_review_count:25,statistical_reference_count:774,queue:{missing:[{state:'OH',type:'township',name:'Miami',county_name:'Hamilton'}]},profiles:{missing:[]},notice:'Permission-scoped candidates only.'}}));
 assert.match(JSON.stringify(tree.toJSON()),/Recorded identity matches do not establish/);assert.match(JSON.stringify(tree.toJSON()),/Official geographic inventory/);assert.match(JSON.stringify(tree.toJSON()),/Miami/);assert.match(JSON.stringify(tree.toJSON()),/Hamilton County/);
 assert.match(JSON.stringify(tree.toJSON()),/Recorded electrical office review gaps/);assert.match(JSON.stringify(tree.toJSON()),/Office gap fixture/);assert.match(JSON.stringify(tree.toJSON()),/Inspection provider not established/);assert.match(JSON.stringify(tree.toJSON()),/State \/ role/);
 await act(async()=>tree.update(React.createElement(Panel,{readCoverage:async()=>{throw Error('Fixture failure');}})));
 await act(async()=>click());assert.match(JSON.stringify(tree.toJSON()),/Fixture failure/);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Read completed/);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Recorded electrical office review gaps/);
 await act(async()=>tree.unmount());console.log('Coverage panel passed: manual only, duplicate-click guard, explicit uncertainty and failed-refresh clearing. No live API calls.');
}finally{delete globalThis.window;await rm(dir,{recursive:true,force:true});}
