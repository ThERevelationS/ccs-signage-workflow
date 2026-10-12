import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {transform} from 'esbuild';

const source=await fs.readFile('src/components/permitting/googleMapsAuthFailure.js','utf8');
const compiled=(await transform(source,{format:'cjs',target:'es2022'})).code;
function harness(previous){
 const window=previous===undefined?{}:{gm_authFailure:previous},module={exports:{}};
 vm.runInNewContext(compiled,{module,window});
 return {window,subscribe:module.exports.subscribeGoogleMapsAuthFailure};
}
test('one throwing subscriber cannot block other maps or the existing handler',()=>{
 const calls=[];let receiver;
 const previous=function(value){calls.push('previous:'+value);receiver=this;};
 const h=harness(previous),stopA=h.subscribe(()=>{throw Error('synthetic consumer error');}),stopB=h.subscribe(value=>calls.push('map:'+value));
 h.window.gm_authFailure('denied');assert.deepEqual(calls,['map:denied','previous:denied']);assert.equal(receiver,h.window);
 stopB();stopA();assert.equal(h.window.gm_authFailure,previous);
});
test('cleanup preserves an unrelated callback installed later',()=>{
 const h=harness(()=>{}),stop=h.subscribe(()=>{}),replacement=()=>{};
 h.window.gm_authFailure=replacement;stop();assert.equal(h.window.gm_authFailure,replacement);
});
test('subscriptions using the same callback retain independent lifetimes',()=>{
 const h=harness();let count=0;const callback=()=>{count++;};
 const stopA=h.subscribe(callback),stopB=h.subscribe(callback);stopA();h.window.gm_authFailure();assert.equal(count,1);
 stopB();assert.equal(Object.hasOwn(h.window,'gm_authFailure'),false);
});
test('repeated disposal cannot remove a later map subscription',()=>{
 const h=harness(),stopA=h.subscribe(()=>{});stopA();let count=0;
 const stopB=h.subscribe(()=>{count++;});stopA();h.window.gm_authFailure();assert.equal(count,1);stopB();
 assert.equal(Object.hasOwn(h.window,'gm_authFailure'),false);
});
test('a map unmounted during failure notification is not notified afterward',()=>{
 const h=harness(),calls=[];let stopB;
 const stopA=h.subscribe(()=>{calls.push('first');stopB();});stopB=h.subscribe(()=>calls.push('closed'));
 h.window.gm_authFailure();assert.deepEqual(calls,['first']);stopA();
});
test('maps subscribing during failure notification wait for the next event',()=>{
 const h=harness(),calls=[];let stopB;
 const stopA=h.subscribe(()=>{calls.push('first');stopB ||= h.subscribe(()=>calls.push('new'));});
 h.window.gm_authFailure();assert.deepEqual(calls,['first']);h.window.gm_authFailure();assert.deepEqual(calls,['first','first','new']);
 stopA();stopB();assert.equal(Object.hasOwn(h.window,'gm_authFailure'),false);
});
