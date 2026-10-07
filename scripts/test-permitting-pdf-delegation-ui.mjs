import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const dir=resolve('node_modules/.cache/permitting-pdf-delegation-ui');await mkdir(dir,{recursive:true});
const memory=new Map();globalThis.sessionStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
let committed=false;
const calls=[];globalThis.delegationUiInvoke=async(_name,body)=>{
 calls.push(structuredClone(body));
 if(body.action==='context')return {data:{success:true,source_review:{status:'active',publisher_name:'City Permit Center',named_areas:['Pilot','Other']},
  targets:[{id:'profile',name:'Pilot',state:'OH',type:'city'},{id:'other',name:'Other',state:'OH',type:'city'}],
  offices:[{id:'regional',catalog_id:'cat',name:'Regional Agency',verification_status:'staff_verified'}]}};
 if(body.action==='preview')return {data:{success:true,expected_updated_date:'p1',proposal:{evidence_kind:body.review.evidence_kind,
  publisher_snapshot:{name:'City Permit Center'},office_snapshot:{name:'Regional Agency'},role_label:body.review.role,
  coverage_area:body.review.coverage_area,role_proof:body.review.role_proof}}};
 if(body.action==='verify')return {data:{success:false,status:'review_uncertain',error:'Unknown response'}};
 if(body.action==='get_request')return {data:{success:true,committed}};
 throw Error('Unexpected request');
};
try{
 const file=resolve(dir,'panel.mjs');
 await build({entryPoints:['src/components/admin/PermittingOfficeAuthorityReview.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',
  jsx:'automatic',alias:{'@':resolve('src')},external:['react','react-dom','react/jsx-runtime'],plugins:[{name:'mock-api',setup(b){
   b.onResolve({filter:/base44Client/},()=>({path:'client',namespace:'mock'}));
   b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const base44={functions:{invoke:(...args)=>globalThis.delegationUiInvoke(...args)}};'}));
  }}]});
 globalThis.window={self:null,top:null};
 const {default:Panel}=await import(pathToFileURL(file));delete globalThis.window;
 const source={id:'source',jurisdiction_id:'profile',jurisdiction_name:'Pilot'};
 const props={source,disabled:false,onBusy:()=>{}};
 let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,props));});
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.children?text(n.children):'';
 const button=label=>tree.root.findAllByType('button').find(b=>text(b.props.children)===label);
 const full=()=>text(tree.toJSON());
 const change=async(node,value)=>act(async()=>node.props.onChange({target:{value}}));
 await change(tree.root.findByProps({id:'office-responsibility-mode'}),'pdf_delegation');
 await act(async()=>button('Load source and office options').props.onClick());
 assert.equal(calls.at(-1).evidence_kind,'pdf_delegation');
 let selects=tree.root.findAllByType('select');
 assert.deepEqual(selects[1].findAllByType('option').map(o=>o.props.value),['profile']);
 assert.deepEqual(selects[3].findAllByType('option').map(o=>o.props.value),['electrical_permit','electrical_inspection']);
 assert.deepEqual(selects[4].findAllByType('option').map(o=>o.props.value),['','Pilot']);
 assert.match(full(),/Source publisher: City Permit Center/);
 await change(selects[2],'regional');
 await change(selects[3],'electrical_permit');
 await change(tree.root.findAllByType('textarea')[0],'Electrical permits are issued by Regional Agency.');
 await change(tree.root.findAllByType('textarea')[1],'Reviewed current issuer evidence.');
 await act(async()=>tree.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));
 await act(async()=>button('Preview responsibility review').props.onClick());
 assert.equal(calls.at(-1).review.evidence_kind,'pdf_delegation');
 assert.equal(calls.at(-1).review.role,'electrical_permit');
 assert.equal(calls.at(-1).review.role_label,'electrical_permit');
 assert.match(full(),/Publishing office: City Permit Center/);assert.match(full(),/Responsible office: Regional Agency/);
 assert.match(full(),/does not establish adopted law or job-address applicability/);
 await change(tree.root.findAllByType('textarea')[0],'Changed quote');
 assert.equal(button('Confirm relationship decision'),undefined);
 await act(async()=>button('Preview responsibility review').props.onClick());
 await act(async()=>button('Confirm relationship decision').props.onClick());
 const saved=structuredClone(calls.at(-1));assert.equal(saved.action,'verify');assert.equal(saved.review.evidence_kind,'pdf_delegation');
 assert.equal(tree.root.findByProps({id:'office-responsibility-mode'}).props.disabled,true);
 await act(async()=>tree.unmount());
 await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,props));});
 assert.equal(tree.root.findByProps({id:'office-responsibility-mode'}).props.value,'pdf_delegation');
 assert.equal(tree.root.findByProps({id:'office-responsibility-mode'}).props.disabled,true);
 await act(async()=>button('Resume same relationship decision').props.onClick());
 assert.deepEqual(calls.at(-1),saved);
 committed=true;
 await act(async()=>button('Check saved relationship review').props.onClick());
 await act(async()=>button('Load source and office options').props.onClick());
 assert.equal(tree.root.findAllByType('select')[3].props.value,'electrical_inspection');
 await act(async()=>tree.unmount());memory.clear();
 await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,props));});
 await act(async()=>button('Load source and office options').props.onClick());
 assert.equal(calls.at(-1).evidence_kind,undefined);
 await change(tree.root.findByProps({id:'office-responsibility-mode'}),'pdf_delegation');
 assert.equal(tree.root.findAllByType('fieldset').length,0);
 await act(async()=>tree.unmount());
 await act(async()=>{tree=TestRenderer.create(React.createElement(Panel,{...props,source:{...source,id:'html',evidence_kind:'official_html'}}));});
 assert.equal(tree.root.findAllByProps({id:'office-responsibility-mode'}).length,0);
 await act(async()=>button('Load source and office options').props.onClick());
 assert.equal(calls.at(-1).evidence_kind,'official_html');
 assert.deepEqual(tree.root.findAllByType('select')[2].findAllByType('option').map(o=>o.props.value),['zoning']);
 await act(async()=>tree.unmount());
 console.log('PDF delegation UI acceptance passed: explicit mode payloads, scoped roles/target, separate identities, preview invalidation, frozen recovery/replay, context reset, legacy PDF and HTML routing. Mock API only.');
}finally{
 delete globalThis.window;delete globalThis.delegationUiInvoke;delete globalThis.sessionStorage;await rm(dir,{recursive:true,force:true});
}
