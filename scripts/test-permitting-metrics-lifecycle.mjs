import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
const dir='node_modules/.cache/metrics-lifecycle';await mkdir(dir,{recursive:true});
const pending=[];
globalThis.__metricsApi={entities:new Proxy({}, {get:()=>({aggregate:()=>Promise.resolve({rows:[]}),filter:()=>Promise.resolve({items:[],has_more:false}),count:q=>{if(q.last_checked)return new Promise((resolve,reject)=>pending.push({resolve,reject}));return Promise.resolve(0);}})})};
try {
await build({entryPoints:['src/components/permitting/PermittingCompletenessDashboard.jsx'],outfile:dir+'/dashboard.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^(lucide-react|@\/|\.\/usePermittingQueueBrowse$|\.\/PermittingRecordedCoverage$)/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>{
if(a.path.includes('base44Client'))return {contents:'export const base44=globalThis.__metricsApi;'};
if(a.path.includes('usePermittingQueueBrowse'))return {contents:'export default ()=>({queuePage:{items:[],has_more:false},loadingQueue:false,queueError:"",loadQueue:()=>{}});'};
if(a.path.includes('PermittingRecordedCoverage'))return {contents:'export default ()=>null;'};
const names=a.path==='lucide-react'?'Database FileCheck2 ShieldCheck AlertTriangle Clock ChevronDown Search Loader2 Layers MapPin FileText Activity':a.path.includes('/select')?'Select SelectContent SelectItem SelectTrigger SelectValue':a.path.includes('/collapsible')?'Collapsible CollapsibleContent CollapsibleTrigger':a.path.split('/').at(-1).replace(/^./,x=>x.toUpperCase());
return {contents:'import React from "react";'+names.split(' ').map(n=>`export const ${n}=p=>React.createElement("${n}",p,p.children);`).join('')};});}}]});
const {default:Dashboard}=await import('../'+dir+'/dashboard.mjs');let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Dashboard));});assert.equal(pending.length,1);
await act(async()=>pending[0].resolve(90));
const change=tree.root.findAllByType('Select').find(x=>x.props.value==='90').props.onValueChange;
await act(async()=>{change('30');});assert.equal(pending.length,2);
await act(async()=>{change('60');});assert.equal(pending.length,3);
await act(async()=>pending[2].resolve(60));assert.match(JSON.stringify(tree.toJSON()),/60 stale \(> 60d\)/);
await act(async()=>pending[1].resolve(30));assert.match(JSON.stringify(tree.toJSON()),/60 stale \(> 60d\)/);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/30 stale/);
await act(async()=>{change('180');});await act(async()=>{change('365');});
const original=console.error;console.error=()=>{};try{await act(async()=>pending[3].reject(Error('obsolete failure')));}finally{console.error=original;}
assert.doesNotMatch(JSON.stringify(tree.toJSON()),/obsolete failure/);
await act(async()=>pending[4].resolve(365));assert.match(JSON.stringify(tree.toJSON()),/365 stale \(> 365d\)/);
await act(async()=>{change('30');});await act(async()=>tree.unmount());await act(async()=>pending[5].resolve(30));
console.log('Metrics lifecycle passed: actual dashboard, out-of-order thresholds, obsolete failure and unmount. Mock APIs only.');
}finally{delete globalThis.__metricsApi;await rm(dir,{recursive:true,force:true});}
