import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output=await build({entryPoints:['base44/shared/safeExternalFetch.ts'],bundle:true,write:false,format:'esm',platform:'neutral'});
const {safeExternalFetch}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
async function run(destination,scope,privateDns=false){const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno,calls=[];globalThis.Deno={resolveDns:async(h,t)=>t==='A'?[privateDns?'127.0.0.1':'93.184.216.34']:[]};globalThis.fetch=async u=>{calls.push(u.href);return calls.length===1?new Response(null,{status:302,headers:{location:destination}}):new Response('ok');};try{return {response:await safeExternalFetch('https://city.gov/form.pdf',{},5,scope),calls};}catch(error){return {error,calls};}finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}}
test('off-host redirect is rejected before target HTTP fetch',async()=>{const r=await run('https://other.gov/file.pdf',u=>u.hostname==='city.gov');assert.match(r.error.message,/outside/);assert.equal(r.calls.length,1);});
test('same-host redirect remains allowed',async()=>{const r=await run('/new.pdf',u=>u.hostname==='city.gov');assert.equal(await r.response.text(),'ok');assert.equal(r.calls.length,2);});
test('legacy unscoped public redirects remain supported',async()=>{const r=await run('https://other.gov/file.pdf');assert.equal(r.response.status,200);assert.equal(r.calls.length,2);});
test('private DNS remains blocked before HTTP',async()=>{const r=await run('/new.pdf',undefined,true);assert.match(r.error.message,/Private/);assert.equal(r.calls.length,0);});
