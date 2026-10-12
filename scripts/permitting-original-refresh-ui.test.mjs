import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import * as batch from '../src/components/permitting/addressOriginalBatch.mjs';
const require=createRequire(import.meta.url),code=(await transform(await fs.readFile('src/components/permitting/AutomaticAddressScanResults.jsx','utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'})).code;
async function harness(){
 let auth={currentUser:{id:'first',role:'admin'},sessionToken:'first'},archives={collections:[{id:'c',target:{name:'Original collection'},documents:[]}]},tree;
 const reads=[],tracked=[],timers=new Map(),module={exports:{}};let timerId=0;
 const trackAction=run=>tracked.push(run);
 vm.runInNewContext(code,{module,URL,Date,setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id),require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>auth};
  if(name==='@/api/base44Client')return {base44:{functions:{invoke:()=>new Promise((resolve,reject)=>reads.push({resolve,reject}))}}};
  if(name==='./ResearchProgressContext')return {useResearchProgress:()=>({runAction:()=>{throw Error('Unexpected write');},trackAction})};
  if(name==='./addressOriginalBatch.mjs')return batch;
  return {__esModule:true,default:()=>null,OriginalCollectionStatus:()=>null};
 }});
 const props=()=>({scanResult:{started:true,scans:[]},archives});
 await act(async()=>{tree=Renderer.create(React.createElement(module.exports.default,props()));});
 return {tree,reads,tracked,tick:()=>{for(const fn of timers.values())fn();},click:()=>tree.root.findAllByType('button').find(n=>n.children.includes('Check saved files')).props.onClick(),
 async update({actor,data}={}){if(actor)auth=actor;if(data)archives=data;await act(async()=>tree.update(React.createElement(module.exports.default,props())));},
 async close(){await act(async()=>tree.unmount());}};
}
test('duplicate manual refresh clicks make one read',async()=>{
 const h=await harness();try{await act(async()=>{h.click();h.click();});assert.equal(h.reads.length,1);await act(async()=>h.reads[0].resolve({data:{collections:[],actions:[{id:'active'}]}}));assert.equal(h.tracked.length,1);}finally{await h.close();}
});
test('stale account or collection responses cannot publish files or action cards',async()=>{
 for(const change of ['account','collection']){
 const h=await harness();try{
  await act(async()=>{h.click();});
  await h.update(change==='account'?{actor:{currentUser:{id:'second',role:'admin'},sessionToken:'second'}}:{data:{collections:[{id:'new',target:{name:'New collection'},documents:[]}]}});
  await act(async()=>h.reads[0].resolve({data:{collections:[{id:'old',target:{name:'STALE FILES'},documents:[]}],actions:[{id:'stale'}]}}));
  assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/STALE FILES/);assert.equal(h.tracked.length,0);
 }finally{await h.close();}
 }
});
test('old-account failure cannot replace a newer refresh state',async()=>{
 const h=await harness();try{
  await act(async()=>{h.click();});await h.update({actor:{currentUser:{id:'second',role:'admin'},sessionToken:'second'}});
  await act(async()=>{h.click();});await act(async()=>h.reads[0].reject(Error('old')));
  assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/could not update/);
  await act(async()=>h.reads[1].resolve({data:{collections:[],actions:[]}}));
 }finally{await h.close();}
});

test('old role/account polls cannot publish files, actions or failures',async()=>{
 for(const reject of [false,true]){
  const h=await harness();try{
   await act(async()=>{h.tick();h.tick();});assert.equal(h.reads.length,1);
   await h.update({actor:{currentUser:{id:'second',role:'staff'},sessionToken:'first'}});
   await act(async()=>{if(reject)h.reads[0].reject(Error('old'));else h.reads[0].resolve({data:{collections:[{id:'old',target:{name:'OLD POLL'},documents:[]}],actions:[{id:'old'}]}});});
   assert.equal(h.tracked.length,0);assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/OLD POLL|could not update/);
  }finally{await h.close();}
 }
});
test('manual check supersedes earlier poll and blocks overlapping timer reads',async()=>{
 const h=await harness();try{
  await act(async()=>{h.tick();});await act(async()=>{h.click();h.tick();});assert.equal(h.reads.length,2);
  await act(async()=>h.reads[1].resolve({data:{collections:[{id:'c',target:{name:'NEW MANUAL'},documents:[]}],actions:[{id:'new'}]}}));
  await act(async()=>h.reads[0].resolve({data:{collections:[{id:'c',target:{name:'OLD POLL'},documents:[]}],actions:[{id:'old'}]}}));
  assert.match(JSON.stringify(h.tree.toJSON()),/NEW MANUAL/);assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/OLD POLL/);assert.deepEqual(h.tracked.map(row=>row.id),['new']);
 }finally{await h.close();}
});
test('signed-out sessions do not start background reads',async()=>{
 const h=await harness();try{await h.update({actor:{currentUser:null,sessionToken:''}});await act(async()=>{h.tick();});assert.equal(h.reads.length,0);}finally{await h.close();}
});
