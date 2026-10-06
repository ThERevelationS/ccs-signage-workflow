import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve('node_modules/.cache/queue-browse');await mkdir(dir,{recursive:true});
try{
await build({entryPoints:['src/components/permitting/usePermittingQueueBrowse.js'],outfile:dir+'/hook.mjs',bundle:true,platform:'node',format:'esm',external:['react']});
const {default:useBrowse,queueBrowseQuery}=await import(dir+'/hook.mjs');let value;const pending=[],calls=[];
const read=(q,o)=>{calls.push({q,o});return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
const filters={state:'OH',jurisdiction_type:'all',status:'all',parent_county_name:'all'};
function Harness({state='OH'}){value=useBrowse(read,{...filters,state},'');return null;}
let tree;await act(async()=>{tree=Renderer.create(React.createElement(Harness));});
await act(async()=>tree.update(React.createElement(Harness,{state:'KY'})));
await act(async()=>pending[0].resolve({items:[{id:'OH'}],has_more:false}));assert.equal(value.queuePage.items.length,0);
await act(async()=>pending[1].resolve({items:[{id:'KY'}],has_more:true,next_cursor:'next'}));assert.equal(value.queuePage.items[0].id,'KY');
await act(async()=>{value.loadQueue(false);value.loadQueue(false);});assert.equal(calls.length,3);assert.equal(calls[2].o.cursor,'next');
await act(async()=>pending[2].resolve({items:[{id:'KY'},{id:'KY2'}],has_more:false}));assert.equal(value.queuePage.items.length,2);
await act(async()=>value.loadQueue(true));assert.equal(value.queuePage.items.length,0);
await act(async()=>pending[3].reject(Error('Fixture failed')));assert.equal(value.queuePage.items.length,0);assert.match(value.queueError,/Fixture failed/);
assert.equal(queueBrowseQuery(filters,'a+b (city)').jurisdiction_name.$regex,'a\\+b \\(city\\)');
await act(async()=>tree.unmount());console.log('Queue browse passed: out-of-order scopes, single-flight paging, stable-ID dedupe, failed-refresh clearing and literal search. No live APIs.');
}finally{await rm(dir,{recursive:true,force:true});}
