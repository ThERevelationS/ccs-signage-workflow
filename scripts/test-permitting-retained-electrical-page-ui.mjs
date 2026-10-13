import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';

const dir=resolve('node_modules/.cache/retained-electrical-review-ui');
await mkdir(dir,{recursive:true});
globalThis.window={self:null,top:null};
try {
  await build({entryPoints:['src/components/permitting/PermittingRetainedPageReview.jsx'],
    outfile:dir+'/page-review.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',
    alias:{'@':resolve('src')},external:['react','react/jsx-runtime'],
    plugins:[{name:'fake-api',setup(build){
      build.onResolve({filter:/base44Client/},args=>({path:args.path,namespace:'fake-api'}));
      build.onLoad({filter:/.*/,namespace:'fake-api'},()=>({contents:'export const base44={entities:{}};'}));
    }}]});
  const {default:Review}=await import(dir+'/page-review.mjs');
  const candidates=[
    {review_id:'oh-1',state:'OH',profile_name:'Pilot',role:'electrical_permit',source_document_id:'pdf-1',physical_page:2},
    {review_id:'ky-2',state:'KY',profile_name:'Another Pilot',role:'electrical_inspection',source_document_id:'pdf-2',physical_page:3}
  ];
  let hits=0,finish,tree;
  const readPage=async (_api,candidate)=>{hits++;assert.equal(candidate.review_id,'oh-1');return new Promise(resolve=>finish=resolve);};
  await act(async()=>{tree=Renderer.create(React.createElement(Review,{candidates,readPage}));});
  assert.equal(hits,0);
  assert.match(JSON.stringify(tree.toJSON()),/Manually check one recorded review at a time/);
  assert.match(JSON.stringify(tree.toJSON()),/Electrical inspection provider/);
  const buttons=()=>tree.root.findAllByType('button').filter(n=>n.props['aria-label']?.startsWith('Check retained PDF page for'));
  assert.equal(buttons().length,2);
  await act(async()=>{buttons()[0].props.onClick();buttons()[0].props.onClick();buttons()[1].props.onClick();});
  assert.equal(hits,1);assert.ok(buttons().every(b=>b.props.disabled===true));
  await act(async()=>{finish({review_id:'oh-1',physical_page:2,notice:'Retained quote matches; authority is not verified.'});});
  assert.ok(buttons().every(b=>b.props.disabled===false));
  assert.match(JSON.stringify(tree.toJSON()),/Retained quote matches; authority is not verified/);
  await act(async()=>tree.update(React.createElement(Review,{candidates:[],readPage})));
  assert.equal(buttons().length,0);
  assert.match(JSON.stringify(tree.toJSON()),/does not indicate statewide coverage/);
  await act(async()=>tree.unmount());
  const rejected=async()=>{throw Error('Source access unavailable');};
  await act(async()=>{tree=Renderer.create(React.createElement(Review,{candidates:[candidates[0]],readPage:rejected}));});
  await act(async()=>{await buttons()[0].props.onClick();});
  assert.match(JSON.stringify(tree.toJSON()),/Source access unavailable/);
  assert.ok(!/current legal authority confirmed/i.test(JSON.stringify(tree.toJSON())));
  await act(async()=>tree.unmount());
  console.log('Retained page manual UI acceptance passed: explicit one-at-a-time click, duplicate guard, session remount, read error, and no automatic authority.');
} finally {
  delete globalThis.window;
  await rm(dir,{recursive:true,force:true});
}
