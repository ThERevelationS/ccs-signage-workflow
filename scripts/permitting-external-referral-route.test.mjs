import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let handler,role='admin',calls=0;
const output=await build({entryPoints:['base44/functions/continueJurisdictionArchives/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onResolve({filter:/jurisdictionExternalReferralArchive\.mjs$/},()=>({path:'external',namespace:'mock'}));
 b.onResolve({filter:/safeExternalFetch\.ts$/},()=>({path:'fetch',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:path==='sdk'?'export const createClientFromRequest=()=>globalThis.routeClient;':path==='external'?'export async function archiveExternalJurisdictionReferral(o){return o.fetchScopedSource("https://www.city.gov/sign.pdf",{},"city.gov");}':'export async function safeExternalFetch(url,init,max,allowed){globalThis.routeCalls();if(!allowed(new URL(url)))throw Error("www scope normalization failed");if(allowed(new URL("https://other.gov/sign.pdf")))throw Error("Off-host scope allowed");return {success:true};}'}));
}}]});
globalThis.Deno={serve:fn=>handler=fn};globalThis.routeClient={auth:{me:async()=>({role})},asServiceRole:{entities:{},integrations:{Core:{}}}};globalThis.routeCalls=()=>calls++;
await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const request=body=>handler(new Request('https://app.test',{method:'POST',body:JSON.stringify(body)}));
const selection={jurisdiction_id:'j1',external_referral:{url:'https://www.city.gov/sign.pdf',source_page_url:'https://city.gov/forms'}};
test('compiled route normalizes www while restricting host',async()=>{role='admin';const r=await request(selection);assert.equal(r.status,200);assert.equal((await r.json()).success,true);assert.equal(calls,1);});
test('non-admin cannot collect external referrals',async()=>{role='user';const before=calls;assert.equal((await request(selection)).status,403);assert.equal(calls,before);role='admin';});
test('automatic, mixed and malformed selections fail before fetching',async()=>{for(const body of [{...selection,automatic:true},{...selection,document_id:'d1'},{jurisdiction_id:'j1',external_referral:[]},{jurisdiction_id:'j1',external_referral:{url:'x'}}]){const before=calls;assert.equal((await request(body)).status,400);assert.equal(calls,before);}});
