import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source=await fs.readFile('src/components/permitting/ResearchProgressContext.jsx','utf8');
const compiled=(await transform(source,{loader:'jsx',format:'cjs',target:'es2022'})).code;
function harness({error,run=null,result=null,statusError=null,invoke=null}={}){
 let state,initialized=false,refIndex=0,refs=[],effects=[],timers=new Set(),calls=[];const statusState={error:statusError,run};
 const React={createContext:()=>({Provider:'provider'}),createElement:(type,props)=>({type,props}),useState:init=>{if(!initialized){state=typeof init==='function'?init():init;initialized=true;}return [state,update=>{state=typeof update==='function'?update(state):update;}];},useCallback:fn=>fn,useRef:value=>{const index=refIndex++;return refs[index] ||= {current:value};},useEffect:effect=>effects.push(effect)};
 const base44={functions:{invoke:async(name,payload)=>{calls.push({name,payload});if(invoke)return invoke(name,payload);if(name==='permittingScanStatus'){if(statusState.error)throw statusState.error;return {data:{run:statusState.run}};}if(error)throw error;return {data:result || {success:true}};}}};
 const sandbox={module:{exports:{}},require:name=>{if(name==='react')return React;if(name==='@/api/base44Client')return {base44};throw Error(name);},sessionStorage:{getItem:()=>null},window:{localStorage:{getItem:()=>null}},crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),console};
 vm.runInNewContext(compiled,sandbox);
 function render(){refIndex=0;effects=[];return sandbox.module.exports.ResearchProgressProvider({children:null}).props.value;}
 const context=render();
 return {context,render,get effects(){return effects;},row:()=>Object.values(state)[0],timers,calls,setStatus:(error,run=null)=>{statusState.error=error;statusState.run=run;}};
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

const savedToken='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function seedRunning(h){h.context.trackAction({action_token:savedToken,status:'running',stage:'Scanning government website',processed:2,total:5,events:[{kind:'page_start',detail:'Original evidence'}]});}
for(const statusError of [{status:401},{response:{status:401,data:{error:'private rejection details'}}}]){
 test('saved status sign-in rejection pauses tracking without changing scan evidence',async()=>{
  const h=harness({statusError});seedRunning(h);
  await h.context.refreshAction(savedToken);
  assert.equal(h.row().status,'running');assert.equal(h.row().stage,'Scanning government website');assert.equal(h.row().processed,2);assert.equal(h.row().events[0].detail,'Original evidence');assert.equal(h.row().tracking_paused,true);assert.equal(h.row().response_lost,true);assert.match(h.row().activity_warning,/Sign in again/);assert(!JSON.stringify(h.row()).includes('private rejection details'));
 });
}
test('successful manual saved-status retry clears the sign-in pause without submitting another scan',async()=>{
 const h=harness({statusError:{status:401}});seedRunning(h);await h.context.refreshAction(savedToken);
 h.setStatus(null,{status:'complete',stage:'Complete',processed:5,total:5,events:[{kind:'finished'}]});
 await h.context.refreshAction(savedToken);
 assert.equal(h.row().status,'complete');assert.equal(h.row().tracking_paused,false);assert.equal(h.row().response_lost,false);assert.equal(h.row().activity_warning,null);assert(h.calls.every(c=>c.name==='permittingScanStatus'));assert(h.calls.every(c=>c.payload.action_token===savedToken));
});
test('saved-status network failure is handled inline and preserves the last known progress',async()=>{
 const h=harness({statusError:new Error('private transport details')});seedRunning(h);
 await h.context.refreshAction(savedToken);
 assert.equal(h.row().status,'running');assert.equal(h.row().processed,2);assert.equal(h.row().tracking_paused,false);assert.equal(h.row().response_lost,true);assert.match(h.row().activity_warning,/could not be checked/);assert(!JSON.stringify(h.row()).includes('private transport details'));
});
test('successful retry with no saved run remains explicitly unconfirmed',async()=>{
 const h=harness({statusError:{status:401}});seedRunning(h);await h.context.refreshAction(savedToken);
 h.setStatus(null,null);await h.context.refreshAction(savedToken);
 assert.equal(h.row().status,'unknown');assert.equal(h.row().tracking_paused,false);assert.equal(h.row().response_lost,true);assert.match(h.row().stage,/execution unconfirmed/);
});
test('automatic recovery skips paused rows and resumes checks after a successful manual retry',async()=>{
 const h=harness({statusError:{status:401}});seedRunning(h);await h.context.refreshAction(savedToken);
 h.render();const before=h.calls.length;let cleanup=h.effects[1]();await Promise.resolve();await Promise.resolve();
 assert.equal(h.calls.length,before);cleanup();
 h.setStatus(null,{status:'running',stage:'Scanning',processed:3,total:5});await h.context.refreshAction(savedToken);
 h.render();const afterManual=h.calls.length;cleanup=h.effects[1]();await Promise.resolve();await Promise.resolve();
 assert.equal(h.calls.length,afterManual+1);cleanup();assert.equal(h.timers.size,0);
});

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function queuedStatus(){const pending=[];const h=harness({invoke:()=>{const request=deferred();pending.push(request);return request.promise;}});seedRunning(h);return {h,pending};}
test('an older status response cannot replace a newer completed result',async()=>{
 const {h,pending}=queuedStatus(),older=h.context.refreshAction(savedToken),newer=h.context.refreshAction(savedToken);
 pending[1].resolve({data:{run:{status:'complete',stage:'Complete',processed:5,total:5}}});await newer;
 pending[0].resolve({data:{run:{status:'running',stage:'Old source',processed:1,total:5}}});await older;
 assert.equal(h.row().status,'complete');assert.equal(h.row().processed,5);
});
test('an older sign-in rejection cannot pause tracking after a successful retry',async()=>{
 const {h,pending}=queuedStatus(),older=h.context.refreshAction(savedToken),newer=h.context.refreshAction(savedToken);
 pending[1].resolve({data:{run:{status:'running',stage:'New source',processed:4,total:5}}});await newer;
 pending[0].reject({status:401});await older;
 assert.equal(h.row().tracking_paused,false);assert.equal(h.row().response_lost,false);assert.equal(h.row().activity_warning,null);assert.equal(h.row().processed,4);
});
test('dismissing a scan card discards an outstanding status response',async()=>{
 const {h,pending}=queuedStatus(),check=h.context.refreshAction(savedToken);
 h.context.clearProgress(savedToken);pending[0].resolve({data:{run:{status:'complete',stage:'Complete'}}});await check;
 assert.equal(h.row(),undefined);
});
test('dismissing a scan card discards an outstanding status failure and later background tracking',async()=>{
 const {h,pending}=queuedStatus(),check=h.context.refreshAction(savedToken);
 h.context.clearProgress(savedToken);pending[0].reject({status:401});await check;
 assert.equal(h.row(),undefined);h.context.trackAction({action_token:savedToken,status:'complete'});assert.equal(h.row(),undefined);
});
test('an in-flight poll cannot regress an action after its final response arrives',async()=>{
 const action=deferred(),status=deferred();
 const h=harness({invoke:name=>name==='permittingScanStatus'?status.promise:action.promise});
 const executing=h.context.runAction('resolvePermittingAddress',{},'Address scan');
 h.timers.values().next().value();
 action.resolve({data:{success:true,scan_run:{status:'complete',stage:'Complete',processed:5,total:5}}});await executing;
 status.resolve({data:{run:{status:'running',stage:'Old page',processed:1,total:5}}});await Promise.resolve();await Promise.resolve();
 assert.equal(h.row().status,'complete');assert.equal(h.row().processed,5);assert.equal(h.timers.size,0);
});
