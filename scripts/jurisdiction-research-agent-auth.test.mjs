import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {INTERNAL_FUNCTION_CAPABILITY} from '../base44/shared/internalFunctionCapability.ts';

let handler;
const bundle=await build({entryPoints:['base44/functions/jurisdictionResearchAgent/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
 plugins:[{name:'sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.researchAuthFixture;',loader:'js'}));}}]});
globalThis.Deno={serve:fn=>handler=fn};await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function fixture(me){
 const state={llmCalls:0};
 globalThis.researchAuthFixture={auth:{me},asServiceRole:{integrations:{Core:{InvokeLLM:async()=>{state.llmCalls++;return {documents:[]};}}}}};
 return state;
}
const invoke=extra=>handler(new Request('https://test',{method:'POST',body:JSON.stringify({jurisdictionName:'Fixture',jurisdictionState:'OH',jurisdictionType:'city',...extra})}));

test('anonymous caller is rejected before the LLM call',async()=>{
 const state=fixture(async()=>{throw new Error('no session');});
 assert.equal((await invoke()).status,401);assert.equal(state.llmCalls,0);
});
test('non-admin authenticated caller is rejected before the LLM call',async()=>{
 const state=fixture(async()=>({id:'u',role:'user'}));
 assert.equal((await invoke()).status,403);assert.equal(state.llmCalls,0);
});
test('forged internal capability is rejected',async()=>{
 const state=fixture(async()=>({id:'u',role:'user'}));
 assert.equal((await invoke({_internal_capability:'x'.repeat(64)})).status,403);assert.equal(state.llmCalls,0);
});
test('admin caller runs research',async()=>{
 const state=fixture(async()=>({id:'a',role:'admin'}));
 assert.equal((await invoke()).status,200);assert.equal(state.llmCalls,1);
});
test('backend callers holding the internal capability run research without a user',async()=>{
 const state=fixture(async()=>null);
 assert.equal((await invoke({_internal_capability:INTERNAL_FUNCTION_CAPABILITY})).status,200);assert.equal(state.llmCalls,1);
});
