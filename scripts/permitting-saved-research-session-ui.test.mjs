import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),code=(await transform(await fs.readFile('src/components/permitting/SavedAddressResearch.jsx','utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'})).code;
async function harness(){
 let auth={currentUser:{id:'first',role:'admin'},sessionToken:'same'},review=false,tree;const requests=[],module={exports:{}};
 vm.runInNewContext(code,{module,require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>auth};
  if(name==='@/api/base44Client')return {base44:{functions:{invoke:(_name,input)=>new Promise((resolve,reject)=>requests.push({input,resolve,reject}))}}};
  if(name==='./AutomaticAddressScanResults')return {__esModule:true,default:props=>React.createElement('p',null,props.archives.collections.map(row=>row.name).join(','))};
  throw Error(name);
 }});
 const render=()=>React.createElement(module.exports.default,{review});
 await act(async()=>{tree=Renderer.create(render());});
 return {tree,requests,click:()=>tree.root.findAllByType('button')[0].props.onClick(),
 async update(actor,mode=false){auth=actor;review=mode;await act(async()=>tree.update(render()));},
 async close(){await act(async()=>tree.unmount());}};
}
test('duplicate browse clicks make one read and same-account object refresh preserves loaded files',async()=>{
 const h=await harness();try{
  await act(async()=>{h.click();h.click();});assert.equal(h.requests.length,1);
  await act(async()=>h.requests[0].resolve({data:{collections:[{id:'c',name:'CURRENT FILE'}]}}));
  await h.update({currentUser:{id:'first',role:'admin'},sessionToken:'same'});assert.match(JSON.stringify(h.tree.toJSON()),/CURRENT FILE/);
 }finally{await h.close();}
});
test('account and role changes clear already-visible files even with the same token',async()=>{
 for(const actor of [{currentUser:{id:'second',role:'admin'},sessionToken:'same'},{currentUser:{id:'first',role:'staff'},sessionToken:'same'}]){
  const h=await harness();try{
   await act(async()=>{h.click();});await act(async()=>h.requests[0].resolve({data:{collections:[{id:'c',name:'PRIVATE OLD FILE'}],next_cursor:'old-cursor'}}));
   await h.update(actor);assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/PRIVATE OLD FILE|Show older research/);
  }finally{await h.close();}
 }
});
test('late old-account results and errors cannot reach the new account view',async()=>{
 for(const fail of [false,true]){
  const h=await harness();try{
   await act(async()=>{h.click();});await h.update({currentUser:{id:'second',role:'admin'},sessionToken:'same'});
   await act(async()=>{h.click();});await act(async()=>{if(fail)h.requests[0].reject(Error('old'));else h.requests[0].resolve({data:{collections:[{id:'old',name:'OLD FILE'}]}});});
   assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/OLD FILE|could not load/);
   await act(async()=>h.requests[1].resolve({data:{collections:[{id:'new',name:'NEW FILE'}]}}));assert.match(JSON.stringify(h.tree.toJSON()),/NEW FILE/);
  }finally{await h.close();}
 }
});
test('signout and nonadmin review hide the research browser',async()=>{
 const h=await harness();try{
  await h.update({currentUser:null,sessionToken:''});assert.equal(h.tree.toJSON(),null);
  await h.update({currentUser:{id:'staff',role:'staff'},sessionToken:'same'},true);assert.equal(h.tree.toJSON(),null);assert.equal(h.requests.length,0);
 }finally{await h.close();}
});
