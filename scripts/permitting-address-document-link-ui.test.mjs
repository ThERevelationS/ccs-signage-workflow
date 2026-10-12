import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),code=(await transform(await fs.readFile('src/components/permitting/AddressDocumentLink.jsx','utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'})).code;
const preview={dry_run:true,expected_evidence_digest:'a'.repeat(64),expected_updated_date:'v1',document_title:'Original',jurisdiction_name:'Example',state:'OH'};
async function harness(){
 let auth={currentUser:{id:'admin',role:'admin'},sessionToken:'session'},props={collection:{id:'collection',location_verified:true},document:{id:'document',title:'Original'}},tree;
 const reads=[],writes=[],module={exports:{}};
 const pending=(list,input)=>new Promise((resolve,reject)=>list.push({input,resolve,reject}));
 vm.runInNewContext(code,{module,require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>auth};
  if(name==='@/api/base44Client')return {base44:{functions:{invoke:(_name,input)=>pending(reads,input)}}};
  if(name==='./ResearchProgressContext')return {useResearchProgress:()=>({runAction:(_name,input)=>pending(writes,input)})};
  throw Error(name);
 }});
 await act(async()=>{tree=Renderer.create(React.createElement(module.exports.default,props));});
 return {reads,writes,tree,button:label=>tree.root.findAllByType('button').find(n=>n.children.includes(label)),
  async update(patch={},actor){props={...props,...patch};if(actor)auth=actor;await act(async()=>tree.update(React.createElement(module.exports.default,props)));},
  async close(){await act(async()=>tree.unmount());}};
}
test('duplicate preview and confirm clicks issue one request; exact preview evidence is submitted',async()=>{
 const h=await harness();try{
  await act(async()=>{const click=h.button('Preview jurisdiction link').props.onClick;click();click();});assert.equal(h.reads.length,1);
  await act(async()=>h.reads[0].resolve({data:preview}));
  await act(async()=>{const click=h.button('I reviewed it — link original').props.onClick;click();click();});assert.equal(h.writes.length,1);assert.equal(h.writes[0].input.expected_evidence_digest,preview.expected_evidence_digest);
  await act(async()=>h.writes[0].resolve({data:{status:'linked'}}));assert.match(JSON.stringify(h.tree.toJSON()),/Original linked/);
 }finally{await h.close();}
});
test('document and account changes discard outstanding responses and stale confirmations',async()=>{
 for(const change of ['document','account']){
  const h=await harness();try{
   await act(async()=>{h.button('Preview jurisdiction link').props.onClick();});
   await h.update(change==='document'?{document:{id:'other',title:'Other'}}:{},change==='account'?{currentUser:{id:'other-admin',role:'admin'},sessionToken:'other-session'}:undefined);
   await act(async()=>h.reads[0].resolve({data:preview}));assert.equal(h.button('I reviewed it — link original'),undefined);assert.equal(h.writes.length,0);
   await act(async()=>{h.button('Preview jurisdiction link').props.onClick();});await act(async()=>h.reads[1].resolve({data:preview}));
   await h.update({document:{id:'third',title:'Third'}});assert.equal(h.button('I reviewed it — link original'),undefined);
  }finally{await h.close();}
 }
});
test('malformed previews and request failures require a fresh preview before confirmation',async()=>{
 const h=await harness();try{
  await act(async()=>{h.button('Preview jurisdiction link').props.onClick();});await act(async()=>h.reads[0].resolve({data:{...preview,expected_evidence_digest:''}}));
  assert.equal(h.button('I reviewed it — link original'),undefined);
  await act(async()=>{h.button('Preview jurisdiction link').props.onClick();});await act(async()=>h.reads[1].resolve({data:preview}));
  await act(async()=>{h.button('I reviewed it — link original').props.onClick();});await act(async()=>h.writes[0].reject(Error('Lost response')));
  assert.equal(h.button('I reviewed it — link original'),undefined);assert.match(JSON.stringify(h.tree.toJSON()),/Lost response/);
 }finally{await h.close();}
});
test('nonadmins and unverified collections cannot preview or link',async()=>{
 const h=await harness();try{
  await h.update({}, {currentUser:{id:'staff',role:'staff'},sessionToken:'staff'});assert.equal(h.tree.toJSON(),null);
  await h.update({collection:{id:'collection',location_verified:false}},{currentUser:{id:'admin',role:'admin'},sessionToken:'session'});
  assert.match(JSON.stringify(h.tree.toJSON()),/Verify the collection/);assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
 }finally{await h.close();}
});
