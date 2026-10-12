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
 const reads=[],tracked=[],module={exports:{}};
 vm.runInNewContext(code,{module,URL,Date,setInterval:()=>1,clearInterval:()=>{},require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>auth};
  if(name==='@/api/base44Client')return {base44:{functions:{invoke:()=>new Promise((resolve,reject)=>reads.push({resolve,reject}))}}};
  if(name==='./ResearchProgressContext')return {useResearchProgress:()=>({runAction:()=>{throw Error('Unexpected write');},trackAction:run=>tracked.push(run)})};
  if(name==='./addressOriginalBatch.mjs')return batch;
  return {__esModule:true,default:()=>null,OriginalCollectionStatus:()=>null};
 }});
 const props=()=>({scanResult:{started:true,scans:[]},archives});
 await act(async()=>{tree=Renderer.create(React.createElement(module.exports.default,props()));});
 return {tree,reads,tracked,click:()=>tree.root.findAllByType('button').find(n=>n.children.includes('Check saved files')).props.onClick(),
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
