import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
const hookCode=(await transform(await fs.readFile('src/components/permitting/useLocalityOfficeGapReview.js','utf8'),{format:'cjs'})).code;
const dialogCode=(await transform(await fs.readFile('src/components/permitting/PermitSettingsDialog.jsx','utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'})).code;
const admin={currentUser:{id:'admin-fixture',email:'admin@example.test',role:'admin'},isRegistered:true};
const row={id:'locality-a',name:'Fresh saved locality',state:'OH',offices:[]};
async function hookHarness({auth=admin,get=async()=>row}={}){
 let actor=auth,latest,tree;const calls=[];
 const module={exports:{}};
 vm.runInNewContext(hookCode,{module,require:name=>{
  if(name==='react')return React;
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>actor};
  if(name==='@/api/base44Client')return {base44:{entities:{PermitLocality:{get:async id=>{calls.push(id);return get(id);}}}}};
  throw Error(name);
 }});
 function Harness(){latest=module.exports.default();return null;}
 await act(async()=>{tree=Renderer.create(React.createElement(Harness));});
 return {calls,read:module.exports.readExactLocalityForReview,state:()=>latest,
  async open(id){await act(async()=>latest.open(id));},
  async changeAuth(value){actor=value;await act(async()=>tree.update(React.createElement(Harness)));},
  async close(){await act(async()=>tree.unmount());}};
}
test('review reads the exact saved ID and returns fresh data without mutations',async()=>{
 const h=await hookHarness();try{await h.open('locality-a');assert.deepEqual(h.calls,['locality-a']);assert.equal(h.state().record,row);assert.equal(h.state().openingId,null);}finally{await h.close();}
});
test('denied or unregistered users cannot launch locality review',async()=>{
 for(const auth of [{currentUser:{id:'staff',role:'staff'},isRegistered:true},{...admin,isRegistered:false}]){
  const h=await hookHarness({auth});try{await h.open('locality-a');assert.equal(h.state().canReview,false);assert.equal(h.calls.length,0);assert.equal(h.state().record,null);}finally{await h.close();}
 }
});
test('duplicate clicks share one pending review read',async()=>{
 let release;const h=await hookHarness({get:()=>new Promise(resolve=>{release=resolve;})});try{
  await act(async()=>{h.state().open('locality-a');h.state().open('locality-a');});assert.equal(h.calls.length,1);
  await act(async()=>release(row));assert.equal(h.state().record,row);
 }finally{await h.close();}
});
test('a mismatched response never opens another locality',async()=>{
 const h=await hookHarness({get:async()=>({...row,id:'another-locality'})});try{
  await h.open('locality-a');assert.equal(h.state().record,null);assert.match(h.state().error,/identity could not be confirmed/);
 }finally{await h.close();}
});
test('failed reads remain inline and an explicit retry can recover',async()=>{
 let fail=true;const h=await hookHarness({get:async()=>{if(fail)throw Error('private provider detail');return row;}});try{
  await h.open('locality-a');assert.match(h.state().error,/could not be read/);assert.doesNotMatch(h.state().error,/private provider/);assert.equal(h.state().record,null);
  fail=false;await h.open('locality-a');assert.equal(h.state().record,row);assert.equal(h.state().error,'');
 }finally{await h.close();}
});
test('a response from a previous account cannot reopen its editor',async()=>{
 let release;const h=await hookHarness({get:()=>new Promise(resolve=>{release=resolve;})});try{
  await act(async()=>{h.state().open('locality-a');});await h.changeAuth({...admin,currentUser:{...admin.currentUser,id:'other-admin'}});
  await act(async()=>release(row));assert.equal(h.state().record,null);assert.equal(h.state().error,'');
 }finally{await h.close();}
});
test('invalid references are rejected before any API call',async()=>{
 const h=await hookHarness();try{for(const id of ['',null,'../another-record'])await assert.rejects(h.read(id,{get:async()=>{throw Error('should not call API');}}),/reference is invalid/);}finally{await h.close();}
});
function dialogHarness({save,remove}={}){
 const uiCache=new Map(),writes=[],offices=[],saveCalls=[],module={exports:{}};
 const ui=new Proxy({}, {get(_,name){
  if(uiCache.has(name))return uiCache.get(name);
  const Component=props=>{
   if((name==='Dialog'||name==='AlertDialog')&&!props.open)return null;
   const tag=name==='Button'||String(name).startsWith('AlertDialogAction')||name==='AlertDialogCancel'?'button':name==='Input'?'input':'div';
   return React.createElement(tag,props,tag==='input'?undefined:props.children);
  };uiCache.set(name,Component);return Component;
 }});
 const refuseWrite=()=>{writes.push('mutation');throw Error('Unexpected write');};
 vm.runInNewContext(dialogCode,{module,console,require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/api/base44Client')return {base44:{entities:{PermitLocality:{create:refuseWrite,update:refuseWrite,delete:refuseWrite,get:async()=>null},GlobalSettings:{}}}};
  if(name.startsWith('@/components/ui/'))return ui;
  if(name==='lucide-react')return new Proxy({}, {get:()=>()=>null});
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>admin};
  if(name==='./LocalityOfficeEditor')return {__esModule:true,default:props=>{offices.push(props);return null;}};
  if(name==='./LocalityProfileLinkEditor')return {__esModule:true,default:()=>null};
  if(name==='./OfficeCatalogEditor')return {__esModule:true,default:()=>null};
  if(name.includes('builderEntityPersistence'))return {deleteEntityIfUnchanged:remove || refuseWrite,expectedEntityFields:()=>({}),replaceEntityFieldsIfUnchanged:async args=>{saveCalls.push(args);return save?save(args):refuseWrite();}};
  if(name==='./permitGlobalSettingsPersistence')return {loadSingleGlobalSetting:async()=>null,saveGlobalSettingValueIfUnchanged:refuseWrite};
  if(name==='./permitLocalityPersistence')return {createPermitLocalityIfAbsent:refuseWrite};
  if(name==='./localityOfficeCatalogBridge')return {copyCatalogOfficeToLocality:refuseWrite,resolveCatalogOfficeProvenance:()=>null};
  if(name.includes('loadAllEntityRows'))return {loadAllEntityRows:async()=>[]};
  throw Error(name);
 }});
 return {Component:module.exports.default,writes,offices,saveCalls};
}
test('the existing editor selects by exact ID once and preserves later unsaved edits',async()=>{
 const h=dialogHarness(),a={...row,name:'Same name'},b={...row,id:'locality-b',name:'Same name',zip:'45200',offices:[{id:'office-b',authority_verification_status:'needs_verification'}]};
 const props={isOpen:true,onClose:()=>{},localities:[a,b],initialSelectedLocalityId:b.id};let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(h.Component,props));});
  assert.equal(h.offices.at(-1).localityId,'locality-b');assert.equal(h.offices.at(-1).office.authority_verification_status,'needs_verification');assert.equal(h.writes.length,0);
  const input=tree.root.findAllByType('input').find(node=>node.props.value==='Same name');
  await act(async()=>input.props.onChange({target:{value:'Unsaved edit'}}));
  await act(async()=>tree.update(React.createElement(h.Component,{...props,initialSelectedLocalityId:a.id})));
  assert(tree.root.findAllByType('input').some(node=>node.props.value==='Unsaved edit'));assert.match(JSON.stringify(tree.toJSON()),/Unsaved changes/);assert.equal(h.writes.length,0);
 }finally{await act(async()=>tree?.unmount());}
});
test('missing or duplicated initial locality IDs cannot select a different record',async()=>{
 for(const localities of [[row],[row,{...row}]]){
  const h=dialogHarness();let tree;try{
   await act(async()=>{tree=Renderer.create(React.createElement(h.Component,{isOpen:true,onClose:()=>{},localities,initialSelectedLocalityId:localities.length===1?'absent':row.id}));});
   assert.match(JSON.stringify(tree.toJSON()),/unavailable or ambiguous/);assert.equal(h.offices.length,0);assert.equal(h.writes.length,0);
  }finally{await act(async()=>tree?.unmount());}
 }
});

test('existing exact repository profile link is preserved in locality save payload',async()=>{
 const linked={...row,jurisdiction_profile_id:'repository-profile-oh'};
 const h=dialogHarness({save:async args=>({...linked,...args.nextFields})});let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(h.Component,{isOpen:true,onClose:()=>{},localities:[linked],initialSelectedLocalityId:linked.id}));});
  const save=tree.root.findAllByType('button').find(node=>node.children.some(child=>typeof child==='string'&&child.trim()==='Save Locality'));
  await act(async()=>save.props.onClick());
  assert.equal(h.saveCalls.length,1);
  assert.equal(h.saveCalls[0].nextFields.jurisdiction_profile_id,linked.jurisdiction_profile_id);
 }finally{await act(async()=>tree?.unmount());}
});

test('confirmed locality save notifies once and notification failure does not undo success',async()=>{
 const notifications=[],saved={...row,name:'Changed locality'};
 const h=dialogHarness({save:async()=>saved});let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(h.Component,{isOpen:true,onClose:()=>{},localities:[row],initialSelectedLocalityId:row.id,onLocalitySaved:id=>{notifications.push(id);throw Error('Fixture refresh failure');}}));});
  const input=tree.root.findAllByType('input').find(node=>node.props.value===row.name);
  await act(async()=>input.props.onChange({target:{value:'Changed locality'}}));
  const save=tree.root.findAllByType('button').find(node=>node.children.some(child=>typeof child==='string'&&child.trim()==='Save Locality'));
  await act(async()=>save.props.onClick());assert.deepEqual(notifications,[row.id]);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Unsaved changes|Fixture refresh failure/);
 }finally{await act(async()=>tree?.unmount());}
});
test('failed locality save does not notify coverage',async()=>{
 const notifications=[],h=dialogHarness({save:async()=>{throw Error('Fixture save rejected');}});let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(h.Component,{isOpen:true,onClose:()=>{},localities:[row],initialSelectedLocalityId:row.id,onLocalitySaved:id=>notifications.push(id)}));});
  const save=tree.root.findAllByType('button').find(node=>node.children.some(child=>typeof child==='string'&&child.trim()==='Save Locality'));
  await act(async()=>save.props.onClick());assert.deepEqual(notifications,[]);
 }finally{await act(async()=>tree?.unmount());}
});

test('locality deletion waits for confirmation and confirmed completion before notifying',async()=>{
 let release;const calls=[],notifications=[],h=dialogHarness({remove:args=>{calls.push(args);return new Promise(resolve=>release=resolve);}});let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(h.Component,{isOpen:true,onClose:()=>{},localities:[row],initialSelectedLocalityId:row.id,onLocalityDeleted:id=>{notifications.push(id);throw Error('Fixture delete notification failure');}}));});
  const button=label=>tree.root.findAllByType('button').find(node=>node.children.some(child=>typeof child==='string'&&child.trim()===label));
  await act(async()=>button('Delete').props.onClick());assert.equal(calls.length,0);assert.deepEqual(notifications,[]);
  await act(async()=>{button('Delete Locality').props.onClick();});assert.equal(calls.length,1);assert.equal(calls[0].record.id,row.id);assert.equal(calls[0].guardFields.name,row.name);assert.deepEqual(notifications,[]);
  await act(async()=>release());assert.deepEqual(notifications,[row.id]);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Fixture delete notification failure/);assert.equal(tree.root.findAllByType('input').filter(node=>node.props.value===row.name).length,0);
 }finally{await act(async()=>tree?.unmount());}
});
test('rejected locality deletion leaves the record visible and does not notify',async()=>{
 const notifications=[],h=dialogHarness({remove:async()=>{throw Error('Fixture delete rejected');}});let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(h.Component,{isOpen:true,onClose:()=>{},localities:[row],initialSelectedLocalityId:row.id,onLocalityDeleted:id=>notifications.push(id)}));});
  const button=label=>tree.root.findAllByType('button').find(node=>node.children.some(child=>typeof child==='string'&&child.trim()===label));
  await act(async()=>button('Delete').props.onClick());await act(async()=>button('Delete Locality').props.onClick());assert.deepEqual(notifications,[]);assert.match(JSON.stringify(tree.toJSON()),/Fixture delete rejected/);assert(tree.root.findAllByType('input').some(node=>node.props.value===row.name));
 }finally{await act(async()=>tree?.unmount());}
});
