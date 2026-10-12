import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';

// Execute the actual loader against simulated DOM, SDK and timers. No browser,
// credentials, external requests or production records.
const source=await fs.readFile('src/components/permitting/googleMapsLoader.js','utf8');
const compiled=(await transform(source,{format:'cjs',target:'es2022'})).code;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const scripts=[],timers=new Map(),calls=[],window={};let timerId=0;
 const document={getElementById:id=>scripts.find(script=>script.id===id&&!script.removed),
  createElement:()=>({removed:false,remove(){this.removed=true;}}),head:{appendChild:script=>scripts.push(script)}};
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,window,document,console,crypto:webcrypto,
  setTimeout:callback=>{const id=++timerId;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  require:name=>{assert.equal(name,'@/api/base44Client');return {base44:{functions:{invoke:async(name,body)=>{calls.push({name,body});return {data:{apiKey:'synthetic-map-key'}};}}}};}});
 const callback=script=>new URL(script.src).searchParams.get('callback');
 const sdk=()=>{window.google={maps:{Map:class {},geometry:{spherical:{}}}};};
 return {load:module.exports.loadGoogleMaps,window,scripts,timers,calls,callback,sdk,
  timeout(){assert.equal(timers.size,1);const [id,run]=timers.entries().next().value;timers.delete(id);run();}};
}
async function timedOutAttempt(h){const first=h.load('synthetic-session');const rejection=assert.rejects(first,/Map connection timed out/);await flush();assert.equal(h.scripts.length,1);const script=h.scripts[0],callback=h.callback(script),fn=h.window[callback];h.timeout();await rejection;return {script,callback,fn};}
test('a stale SDK response cannot complete a later retry',async()=>{
 const h=harness(),old=await timedOutAttempt(h);let resolved=false;
 const retry=h.load('synthetic-session').then(value=>{resolved=true;return value;});await flush();
 const current=h.scripts[1],currentCallback=h.callback(current);h.sdk();
 h.window[old.callback]?.();await flush();
 assert.equal(resolved,false,'old request callback must not resolve the current attempt');
 assert.notEqual(old.callback,currentCallback);
 h.window[currentCallback]();await retry;assert.equal(resolved,true);assert.equal(h.timers.size,0);
});
test('captured old callback cleanup cannot delete the retry callback',async()=>{
 const h=harness(),old=await timedOutAttempt(h);const retry=h.load('synthetic-session');await flush();
 const currentCallback=h.callback(h.scripts[1]),currentFn=h.window[currentCallback];h.sdk();old.fn();await flush();
 assert.equal(h.window[currentCallback],currentFn);
 h.window[currentCallback]();await retry;assert.equal(h.timers.size,0);
});
test('concurrent map instances share one configuration and SDK request',async()=>{
 const h=harness(),first=h.load('synthetic-session'),second=h.load('synthetic-session');
 assert.equal(first,second);await flush();assert.equal(h.calls.length,1);assert.equal(h.scripts.length,1);
 h.sdk();h.window[h.callback(h.scripts[0])]();const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(h.timers.size,0);
});
test('script connection failure permits one fresh explicit retry',async()=>{
 const h=harness(),first=h.load('synthetic-session'),rejection=assert.rejects(first,/Map could not connect/);await flush();h.scripts[0].onerror();await rejection;
 assert.equal(h.scripts[0].removed,true);const retry=h.load('synthetic-session');await flush();assert.equal(h.calls.length,2);
 h.sdk();h.window[h.callback(h.scripts[1])]();await retry;assert.equal(h.timers.size,0);
});
