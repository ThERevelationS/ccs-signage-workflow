import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve('node_modules/.cache/coverage-sdk-acceptance');await mkdir(dir,{recursive:true});
globalThis.window={self:null,top:null};
try{
await build({entryPoints:['src/components/permitting/PermittingRecordedCoverage.jsx'],outfile:dir+'/panel.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',alias:{'@':resolve('src')},external:['react','react/jsx-runtime'],plugins:[{name:'no-api',setup(b){b.onResolve({filter:/base44Client|EmailGate|PermitSettingsDialog/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path.includes('EmailGate')?'export const useAuth=()=>({currentUser:null,isRegistered:false});':args.path.includes('PermitSettingsDialog')?'export default function Dialog(){return null;}':'export const base44={};'}));}}]});
const {readRecordedCoverage}=await import(dir+'/panel.mjs');
let calls=[],progress=[];
const queue={id:'q',state:'OH',jurisdiction_name:'Miami Township',jurisdiction_type:'township',parent_county_name:'Hamilton County'};
const profile={id:'p',state:'OH',name:'Miami Township',type:'township',parent_county:{name:'Hamilton County'}};
const api={entities:{
SourceCollectionQueue:{filter:async(query,options)=>{calls.push({entity:'queue',query,options});return options.cursor?{items:[queue],has_more:false,next_cursor:null}:{items:[queue],has_more:true,next_cursor:'queue-next'};}},
JurisdictionProfile:{filter:async(query,options)=>{calls.push({entity:'profile',query,options});return {items:[profile],has_more:false,next_cursor:null};}},
PermitLocality:{filter:async(query,options)=>{calls.push({entity:'locality',query,options});return options.cursor?{items:[{id:'ky-locality',state:'KY',name:'Kentucky fixture'}],has_more:false}:{items:[{id:'locality',state:'OH',name:'Office gap fixture',offices:[{authority_roles:['electrical_permit'],authority_verification_status:'staff_verified'}]}],has_more:true,next_cursor:'locality-next'};}}
}};
const result=await readRecordedCoverage(()=>true,value=>progress.push(value),api);
assert.equal(calls.length,5);assert.equal(calls[4].options.cursor,'locality-next');assert.equal(calls[1].options.cursor,'queue-next');assert.equal(calls[2].options.cursor,undefined);
for(const c of calls){assert.deepEqual(c.query,{state:{$in:['OH','KY']}});assert.equal(c.options.limit,500);assert.equal(c.options.sort,'id');assert.ok(c.options.fields.includes('id'));assert.ok(!c.options.fields.includes('documents'));}
assert.equal(result.electrical_offices.states.OH.roles.electrical_permit.staff_verified,1);assert.equal(result.electrical_offices.states.KY.roles.electrical_inspection.missing,1);assert.equal(result.electrical_offices.inventory_complete,false);assert.ok(progress.includes('Read 2 saved locality office setups'));
assert.equal(result.items.length,1);assert.deepEqual(result.official.candidate_counts,{OH:2318,KY:530});assert.ok(progress.includes('Read 1 queue records'));
let current=true,profilesRead=0;
await assert.rejects(readRecordedCoverage(()=>current,()=>{}, {entities:{SourceCollectionQueue:{filter:async()=>{current=false;return {items:[],has_more:false};}},JurisdictionProfile:{filter:async()=>{profilesRead++;}}}}),/superseded/);assert.equal(profilesRead,0);
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>{throw Error('Profile access unavailable');}}}}),/Profile access unavailable/);
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>({items:[],has_more:false})},PermitLocality:{filter:async()=>{throw Error('Office access unavailable');}}}}),/Office access unavailable/);
console.log('SDK adapter acceptance passed: OH/KY scope, projected identity fields, cursor handoff/dedupe, cancellation before next entity and failure propagation. Mocked SDK only.');
}finally{delete globalThis.window;await rm(dir,{recursive:true,force:true});}
