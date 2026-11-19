import esbuild from 'esbuild';
import fs from 'node:fs'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>(globalThis.__tplSave||((x)=>({id:'t1',...x.data})))(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async()=>true;`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>[];`,
  '@/components/estimator/foundation/foundationSaveSession': `let __n=0;export const newCreationRequestKey=(k)=>'k'+(++__n);`,
};
const plugin={name:'s',setup(b){b.onResolve({filter:/.*/},a=>STUBS[a.path]?{path:a.path,namespace:'s'}:undefined);b.onLoad({filter:/.*/,namespace:'s'},a=>({contents:STUBS[a.path],loader:'js'}));}};
const r=await esbuild.build({entryPoints:[path.resolve('src/components/estimator/foundation/FoundationTemplateDialog.jsx')],bundle:true,format:'esm',platform:'node',write:false,plugins:[plugin],loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-test-renderer']});
fs.writeFileSync('.audit-work/foundation-template05/dbg.mjs',r.outputFiles[0].text);
const D=(await import(pathToFileURL(path.resolve('.audit-work/foundation-template05/dbg.mjs')).href)).default;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.window={confirm:()=>true};
const calls=[];let fail=true;
globalThis.__tplSave=(a)=>{calls.push(a);console.log('SAVE called',calls.length);return fail?Promise.reject(new Error('lost')):Promise.resolve({id:'t'})};
let c;await act(async()=>{c=TestRenderer.create(React.createElement(D,{open:true,mode:'save',onClose:()=>{},project:{id:'p1',items:[{id:'i',quantity:1}],walls:[{id:'w',shape:{points:[{x:0,z:0},{x:9,z:0}],closed:false,segments:[{length:9}]}}],wall_caps:[{wall_index:0,segment_index:0}],poles:[{id:'po',foundation_index:1,signs:[{}]}],signage_cabinets:[{mount:'foundation',foundation_index:0}],landscape:{},ai_engineering_data:{},notes:'n',builder_sync_attempt:{key:'r'}},onApply:()=>true}))});
await act(async()=>{await Promise.resolve()});
const inp=c.root.findAll(e=>e?.props?.value!==undefined)[0];
await act(async()=>{inp.props.onChange({target:{value:'K'}})});
const btn=()=>c.root.findAll(e=>e?.props?.children==='Save Template').map(e=>e.props)[0];
console.log('btn?',!!btn());
await act(async()=>{const p=btn().onClick();console.log('p1',!!p);await p;});
console.log('alerts',c.root.findAll(e=>e?.props?.role==='alert').map(e=>e.props.children));
fail=false;
await act(async()=>{const p=btn().onClick();console.log('p2',!!p);await p;});
console.log('calls',calls.length, calls.map(a=>a.idempotencyKey));
