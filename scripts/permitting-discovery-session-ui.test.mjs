import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import * as scans from '../src/components/permitting/addressPageScan.mjs';
const require=createRequire(import.meta.url),code=(await transform(await fs.readFile('src/components/permitting/AddressResearchPages.jsx','utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'})).code;
async function harness(){
 let auth={currentUser:{id:'first',role:'admin'},sessionToken:'first'},collection={id:'c',target:{name:'Fixture'},discovery:{pending_pages:[{url:'https://example.org/a'}],gaps:[{reason:'page_fetch_failed',url:'https://example.org/b'}],last_pages:[],last_resources:[]}},tree;
 const requests=[],updates=[],busy=[],module={exports:{}};
 vm.runInNewContext(code,{module,URL,require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>auth};
  if(name==='./addressPageScan.mjs')return scans;
  if(name==='./ResearchProgressContext')return {useResearchProgress:()=>({actions:{},runAction:(_name,input)=>new Promise((resolve,reject)=>requests.push({input,resolve,reject}))})};
  throw Error(name);
 }});
 const props=()=>({collection,review:false,disabled:false,onUpdate:row=>updates.push(row),onBusyChange:(id,value)=>busy.push({id,value})});
 await act(async()=>{tree=Renderer.create(React.createElement(module.exports.default,props()));});
 return {tree,requests,updates,busy,collection,click:label=>tree.root.findAllByType('button').find(node=>node.children.includes(label)).props.onClick(),
 async change(kind){if(kind==='account')auth={currentUser:{id:'second',role:'admin'},sessionToken:'second'};else collection={...collection,id:'new'};await act(async()=>tree.update(React.createElement(module.exports.default,props())));},
 async close(){await act(async()=>tree.unmount());}};
}
test('each discovery mode discards old-account completion and stops continuation',async()=>{
 for(const label of ['Scan remaining pages','Retry failed pages','Retry this page']){
 const h=await harness();try{
  await act(async()=>{h.click(label);h.click(label);});assert.equal(h.requests.length,1);
  await h.change('account');
  await act(async()=>h.requests[0].resolve({data:{success:true,attempted_pages:1,collection:h.collection,pages:[]}}));
  assert.equal(h.requests.length,1);assert.equal(h.updates.length,0);assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/scan finished|retry finished|pass finished/);
 }finally{await h.close();}
 }
});
test('old collection failure cannot change a newly running collection or its busy callback',async()=>{
 const h=await harness();try{
  await act(async()=>{h.click('Scan remaining pages');});await h.change('collection');await act(async()=>{h.click('Scan remaining pages');});
  const count=h.busy.length;await act(async()=>h.requests[0].reject(Error('OLD ERROR')));assert.equal(h.busy.length,count);assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/OLD ERROR/);
  await act(async()=>h.requests[1].resolve({data:{attempted_pages:0,collection:{...h.collection,id:'new'},pages:[]}}));assert.equal(h.updates.length,1);
 }finally{await h.close();}
});
