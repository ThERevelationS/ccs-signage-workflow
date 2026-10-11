import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import { Children, isValidElement } from 'react';

const require=createRequire(import.meta.url);
const source=await fs.readFile('src/components/permitting/ResearchProgressBar.jsx','utf8');
const code=(await transform(source,{loader:'jsx',jsx:'automatic',format:'cjs',target:'es2022'})).code;
function render(rows){
 const checked=[],dismissed=[],sandbox={module:{exports:{}},require:name=>name==='./ResearchProgressContext'?{useResearchProgress:()=>({actions:Object.fromEntries(rows.map(row=>[row.id,row])),refreshAction:id=>checked.push(id),clearProgress:id=>dismissed.push(id)})}:require(name)};
 vm.runInNewContext(code,sandbox);
 return {tree:sandbox.module.exports.default({inline:true}),checked,dismissed};
}
function nodes(tree,type){const result=[];function visit(node){if(!isValidElement(node))return;if(node.type===type)result.push(node);Children.forEach(node.props.children,visit);}visit(tree);return result;}
function text(tree){if(tree==null||typeof tree==='boolean')return '';if(typeof tree==='string'||typeof tree==='number')return String(tree);if(Array.isArray(tree))return tree.map(text).join('');return isValidElement(tree)?Children.toArray(tree.props.children).map(text).join(''):'';}
const paused={id:'scan-a',label:'Address scan',status:'running',stage:'Scanning government page',tracking_paused:true,response_lost:true,indeterminate:true,total:5,processed:2,current_url:'https://example.gov/signs',events:[{kind:'found',detail:'Found sign application'}]};
test('paused scan freezes its progress and retains sources, findings and saved-status retry',()=>{
 const r=render([paused]),progress=nodes(r.tree,'progress')[0],summary=text(r.tree);
 assert.equal(progress.props.value,2);assert.equal(progress.props.max,5);
 assert.match(summary,/Live updates paused/);assert.match(summary,/Last saved step: Scanning government page/);assert.match(summary,/Last saved progress: 2\/5/);assert.match(summary,/https:\/\/example.gov\/signs/);assert.match(summary,/Found sign application/);
 const retry=nodes(r.tree,'button').find(button=>text(button)==='Check saved action status');assert(retry);retry.props.onClick();assert.deepEqual(r.checked,['scan-a']);
 assert.doesNotMatch(text(nodes(r.tree,'h2')[0]),/active/);
});
test('paused scan with an unknown total does not animate or invent a percentage',()=>{
 const r=render([{...paused,total:0,processed:0}]),progress=nodes(r.tree,'progress')[0];
 assert.equal(progress.props.value,0);assert.equal(progress.props.max,1);assert.match(text(r.tree),/Progress is unavailable until saved status can be checked/);assert.doesNotMatch(text(r.tree),/Scanning — total steps/);
});
test('simultaneous scans keep independent paused and live progress bars',()=>{
 const r=render([paused,{id:'scan-b',label:'Office scan',status:'running',stage:'Reading office source',indeterminate:true,events:[]}]),bars=nodes(r.tree,'progress');
 assert.equal(bars.length,2);assert.equal(bars[0].props.value,2);assert.equal(Object.hasOwn(bars[1].props,'value'),false);assert.equal(bars[1].props['aria-label'],'Office scan progress');assert.match(text(r.tree),/Reading office source/);assert.match(text(nodes(r.tree,'h2')[0]),/2 actions/);
});
test('lost live response freezes tracking while an evidenced completed scan stays complete',()=>{
 const r=render([{...paused,tracking_paused:false},{id:'scan-b',label:'Finished scan',status:'complete',stage:'Complete',response_lost:true,indeterminate:true,events:[{kind:'finished'}]}]),bars=nodes(r.tree,'progress');
 assert.equal(bars[0].props.value,2);assert.equal(bars[1].props.value,1);assert.match(text(nodes(r.tree,'section')[0]),/Live updates unavailable/);assert.doesNotMatch(text(nodes(r.tree,'section')[1]),/Live updates unavailable/);assert.match(text(nodes(r.tree,'section')[1]),/Action status: complete/);
});
