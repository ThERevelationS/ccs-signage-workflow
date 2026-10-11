import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source=await fs.readFile('src/components/permitting/ResearchProgressContext.jsx','utf8');
const compiled=(await transform(source,{loader:'jsx',format:'cjs',target:'es2022'})).code;
function harness({error,run=null,result=null,statusError=null}={}){
 let state,timers=new Set(),calls=[];
 const React={createContext:()=>({Provider:'provider'}),createElement:(type,props)=>({type,props}),useState:init=>{state=typeof init==='function'?init():init;return [state,update=>{state=typeof update==='function'?update(state):update;}];},useCallback:fn=>fn,useRef:value=>({current:value}),useEffect:()=>{}};
 const base44={functions:{invoke:async(name,payload)=>{calls.push({name,payload});if(name==='permittingScanStatus'){if(statusError)throw statusError;return {data:{run}};}if(error)throw error;return {data:result || {success:true}};}}};
 const sandbox={module:{exports:{}},require:name=>{if(name==='react')return React;if(name==='@/api/base44Client')return {base44};throw Error(name);},sessionStorage:{getItem:()=>null},window:{localStorage:{getItem:()=>null}},crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),console};
 vm.runInNewContext(compiled,sandbox);
 const context=sandbox.module.exports.ResearchProgressProvider({children:null}).props.value;
 return {context,row:()=>Object.values(state)[0],timers,calls};
}
for(const error of [{status:401,message:'raw auth rejection'},{response:{status:401,data:{error:'raw auth rejection'}},message:'Request failed'}]){
 test('confirmed sign-in rejection stops scan tracking with a useful message',async()=>{
  const h=harness({error,statusError:{response:{status:401}}});
  await assert.rejects(h.context.runAction('resolvePermittingAddress',{},'Address scan'),/Sign in again, then try this scan/);
  assert.equal(h.row().status,'failed');assert.equal(h.row().stage,'Sign in to scan');assert.equal(h.row().response_lost,false);assert.equal(h.row().indeterminate,false);assert.equal(h.row().activity_warning,null);assert.equal(h.timers.size,0);
  assert(!JSON.stringify(h.row()).includes('raw auth rejection'));
 });
}
test('lost network response remains unconfirmed and can recover saved activity',async()=>{
 const h=harness({error:new Error('Network disconnected')});
 await assert.rejects(h.context.runAction('resolvePermittingAddress',{},'Address scan'),/Network disconnected/);
 assert.equal(h.row().status,'unknown');assert.equal(h.row().response_lost,true);assert.equal(h.timers.size,0);
});
test('a saved running scan is preserved when sign-in rejection follows submission',async()=>{
 const h=harness({error:{status:401},run:{status:'running',stage:'Scanning source',processed:1,total:3,events:[{kind:'page_start'}]}});
 await assert.rejects(h.context.runAction('resolvePermittingAddress',{},'Address scan'));
 assert.equal(h.row().status,'running');assert.equal(h.row().processed,1);assert.equal(h.row().events.length,1);assert.equal(h.row().response_lost,true);
});
test('a saved completed scan is preserved after its response is lost',async()=>{
 const h=harness({error:{response:{status:401}},run:{status:'complete',stage:'Complete',events:[{kind:'finished'}]}});
 await assert.rejects(h.context.runAction('resolvePermittingAddress',{},'Address scan'));
 assert.equal(h.row().status,'complete');assert.equal(h.row().events[0].kind,'finished');
});
test('a denied operation remains uncertain rather than falsely asserting expired sign-in',async()=>{
 const h=harness({error:{response:{status:403},message:'Not allowed'}});
 await assert.rejects(h.context.runAction('resolvePermittingAddress',{},'Address scan'));
 assert.equal(h.row().status,'unknown');assert.equal(h.row().response_lost,true);assert.notEqual(h.row().stage,'Sign in to scan');
});
