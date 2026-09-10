import fs from 'node:fs';
import { transformSync } from 'esbuild';
const assert=(c,m)=>{if(!c)throw new Error(m)};
function load(){let s=fs.readFileSync('base44/functions/ensureCustomerSummary/entry.ts','utf8').replace(/^import .*?;\s*/s,'');s+='\n;globalThis.__fn=deleteVerified;';const out=transformSync(s,{loader:'ts',format:'iife',target:'es2020'}).code;globalThis.Deno={serve(){}};(0,eval)(out);const f=globalThis.__fn;delete globalThis.__fn;delete globalThis.Deno;return f}
function entity({mode='normal'}={}){let row={id:'s1',summary_key:'customer_summary:v1:test',updated_date:'v1'};return{async deleteMany(q){if(mode==='concurrent_edit'){row={...row,updated_date:'v2',notes:'new'};return{deleted:0}}if(!row||q.id!==row.id||q.summary_key!==row.summary_key||q.updated_date!==row.updated_date)return{deleted:0};row=null;if(mode==='throw_after_delete')throw new Error('response lost');return{deleted:1}},async get(id){return row&&row.id===id?{...row}:null},state:()=>row?{...row}:null}}
let p=0,t=0;async function test(n,f){t++;try{await f();p++;console.log('PASS',n)}catch(e){console.error('FAIL',n,'-',e.message)}}
const fn=load(),rec={id:'s1',summary_key:'customer_summary:v1:test',updated_date:'v1'};
await test('normal conditional delete',async()=>{const E=entity();await fn(E,rec);assert(E.state()===null,'row remains')});
await test('concurrent edit blocks delete',async()=>{const E=entity({mode:'concurrent_edit'});let failed=false;try{await fn(E,rec)}catch(e){failed=/changed before deletion/.test(e.message)}assert(failed,'did not fail');assert(E.state()?.updated_date==='v2','newer row lost')});
await test('lost response after durable delete recovers',async()=>{const E=entity({mode:'throw_after_delete'});await fn(E,rec);assert(E.state()===null,'row remains')});
console.log(`RESULT ${p}/${t}`);if(p!==t)process.exit(1);
