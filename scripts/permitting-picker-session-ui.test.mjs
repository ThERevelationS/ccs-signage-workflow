import * as draftActions from '../src/components/permitting/pickerDraftAction.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),code=(await transform(await fs.readFile('src/components/permitting/LocalityPickerDialog.jsx','utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'})).code;
async function harness({profiles=[]}={}){
 let auth={currentUser:{id:'first',role:'admin'},sessionToken:'same'},tree;const requests=[],drafts=[],applied=[],module={exports:{}};
 const ui=new Proxy({}, {get:(_,name)=>props=>{if((name==='Dialog'||name==='AlertDialog')&&!props.open)return null;return React.createElement(name==='Input'?'input':name==='Button'?'button':'div',props,name==='Input'?undefined:props.children);}});
 vm.runInNewContext(code,{module,console,setTimeout:()=>0,require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>auth};
  if(name==='@/api/base44Client')return {base44:{entities:{JurisdictionProfile:{},PermitLocality:{}}}};
  if(name.includes('/ui/'))return ui;
  if(name==='lucide-react')return new Proxy({}, {get:()=>()=>null});
  if(name==='./ResearchProgressContext')return {useResearchProgress:()=>({runAction:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))})};
  if(name.includes('loadAllEntityRows'))return {loadAllEntityRows:async()=>profiles};
  if(name==='./pickerDraftAction.mjs')return draftActions;
  if(name==='./permitLocalityPersistence')return {createPermitLocalityIfAbsent:input=>new Promise((resolve,reject)=>drafts.push({input,resolve,reject}))};
  if(name.includes('permittingAddressLocality'))return {summarizeMatchedLocalityAuthority:()=>({verified_office_count:0,verified_roles:[],roles_needing_review:[]})};
  if(name==='./jurisdictionPermitBridge')return {findRepositoryJurisdictionMatches:()=>[],hasDuplicateRepositoryIdentity:()=>false,jurisdictionToDraftPermitLocality:row=>({name:row.name,state:row.state,offices:[]})};
  if(name==='./jurisdictionTrust')return {assessJurisdictionTrust:()=>({})};
  return {__esModule:true,default:()=>null};
 }});
 const render=()=>React.createElement(module.exports.default,{isOpen:true,onClose:()=>{},localities:[],onApply:(...args)=>applied.push(args)});
 await act(async()=>{tree=Renderer.create(render());});
 return {tree,requests,drafts,applied,async type(){await act(async()=>tree.root.findAllByType('input').find(n=>n.props.placeholder?.startsWith('e.g.')).props.onChange({target:{value:'Private address'}}));},
 async search(){await act(async()=>{tree.root.findAllByType('button').find(n=>n.children.includes('Find my jurisdiction')).props.onClick();});},
 async change(actor){auth=actor;await act(async()=>tree.update(render()));},async close(){await act(async()=>tree.unmount());}};
}
test('account and role changes reset the entered address and discard late search results',async()=>{
 for(const actor of [{currentUser:{id:'second',role:'admin'},sessionToken:'same'},{currentUser:{id:'first',role:'staff'},sessionToken:'same'}]){
  const h=await harness();try{await h.type();await h.search();await h.change(actor);assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/Private address/);await act(async()=>h.requests[0].resolve({data:{success:false,error:'OLD SEARCH ERROR'}}));assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/OLD SEARCH ERROR/);assert.equal(h.applied.length,0);}finally{await h.close();}
 }
});
test('same-account rerender preserves entered address; signout hides picker',async()=>{
 const h=await harness();try{await h.type();await h.change({currentUser:{id:'first',role:'admin'},sessionToken:'same'});assert.match(JSON.stringify(h.tree.toJSON()),/Private address/);await h.change({currentUser:null,sessionToken:''});assert.equal(h.tree.toJSON(),null);}finally{await h.close();}
});

test('two immediate address-search clicks start one scan',async()=>{
 const h=await harness();try{
  await h.type();const click=h.tree.root.findAllByType('button').find(n=>n.children.includes('Find my jurisdiction')).props.onClick;
  await act(async()=>{click();click();});assert.equal(h.requests.length,1);
  await act(async()=>h.requests[0].resolve({data:{success:false,error:'Current error'}}));assert.match(JSON.stringify(h.tree.toJSON()),/Current error/);
  await h.search();assert.equal(h.requests.length,2);await act(async()=>h.requests[1].resolve({data:{success:false,error:'Retry error'}}));
 }finally{await h.close();}
});
test('editing the address permits a new scan and the old result cannot release its busy state',async()=>{
 const h=await harness();try{
  await h.type();await h.search();await h.type();await h.search();assert.equal(h.requests.length,2);
  await act(async()=>h.requests[0].resolve({data:{success:false,error:'OLD RESULT'}}));assert.doesNotMatch(JSON.stringify(h.tree.toJSON()),/OLD RESULT/);assert.match(JSON.stringify(h.tree.toJSON()),/Searching/);
  await act(async()=>h.requests[1].resolve({data:{success:false,error:'NEW RESULT'}}));assert.match(JSON.stringify(h.tree.toJSON()),/NEW RESULT/);
 }finally{await h.close();}
});

test('manual repository selection uses exact ID, confirms once, and cannot apply after account change',async()=>{
 const profiles=[{id:'oh',name:'Same name',state:'OH',type:'city'},{id:'ky',name:'Same name',state:'KY',type:'city'}];
 for(const stale of [false,true]){
  const h=await harness({profiles});try{
   await act(async()=>h.tree.root.findByType('select').props.onChange({target:{value:'oh'}}));
   await act(async()=>h.tree.root.findAllByType('button').find(n=>n.children.includes('Review draft creation')).props.onClick());
   const confirm=h.tree.root.findAll(n=>typeof n.props.onClick==='function'&&n.children.some(child=>typeof child==='string'&&child.trim()==='Create Draft & Apply')).at(-1).props.onClick;
   await act(async()=>{confirm({preventDefault:()=>{}});confirm({preventDefault:()=>{}});});assert.equal(h.drafts.length,1);assert.equal(h.drafts[0].input.data.state,'OH');assert.equal(h.applied.length,0);
   if(stale)await h.change({currentUser:{id:'second',role:'admin'},sessionToken:'same'});
   await act(async()=>h.drafts[0].resolve({record:{id:'draft-oh',name:'Same name',state:'OH'}}));assert.equal(h.applied.length,stale?0:1);
  }finally{await h.close();}
 }
});
test('address entry and staff role do not offer manual repository draft creation',async()=>{
 const h=await harness({profiles:[{id:'oh',name:'Fixture',state:'OH'}]});try{
  await h.type();assert.equal(h.tree.root.findAllByType('select').length,0);
  await h.change({currentUser:{id:'staff',role:'staff'},sessionToken:'staff'});assert.equal(h.tree.root.findAllByType('select').length,0);
 }finally{await h.close();}
});

test('confirmation reloads the repository and blocks changed or deleted reviewed profiles',async()=>{
 for(const deleted of [false,true]){
  const profiles=[{id:'oh',name:'Fixture',state:'OH',type:'city'}],h=await harness({profiles});
  try{
   await act(async()=>h.tree.root.findByType('select').props.onChange({target:{value:'oh'}}));
   await act(async()=>h.tree.root.findAllByType('button').find(n=>n.children.includes('Review draft creation')).props.onClick());
   profiles.splice(0,1,...(deleted?[]:[{id:'oh',name:'Changed',state:'OH',type:'city'}]));
   const confirm=h.tree.root.findAll(n=>typeof n.props.onClick==='function'&&n.children.some(child=>typeof child==='string'&&child.trim()==='Create Draft & Apply')).at(-1).props.onClick;
   await act(async()=>confirm({preventDefault:()=>{}}));
   assert.equal(h.drafts.length,0);assert.equal(h.applied.length,0);assert.match(JSON.stringify(h.tree.toJSON()),/review it again/);
  }finally{await h.close();}
 }
});
