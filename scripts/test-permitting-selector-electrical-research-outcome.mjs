import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeSelectorElectricalResearchOutcome as summarize} from '../src/components/permitting/selectorElectricalResearchOutcome.mjs';

const profile=()=>({id:'oh-profile',name:'Example City',state:'OH',type:'city',documents:[]});
const locality=()=>({id:'oh-tracker',name:'Example City',state:'OH',jurisdiction_profile_id:'oh-profile',
  offices:[{id:'issuer',authority_verification_status:'staff_verified',authority_roles:['electrical_permit']},
    {id:'inspector',authority_verification_status:'needs_verification',authority_roles:['electrical_inspection']}]});
const response=(extras={})=>({data:{success:true,jurisdiction:profile(),discovered_documents:0,scan_run:{status:'complete'},...extras}});
const run=(extras={})=>summarize({response:response(extras),target:profile(),locality:locality(),action:'research'});

test('zero reported documents does not imply no office, and separate electrical role gaps remain',()=>{
 const result=run();
 assert.equal(result.profile_id,'oh-profile');assert.equal(result.state,'OH');
 assert.equal(result.observed_docs,0);assert.equal(result.saved_documents,0);
 assert.equal(result.action,'research');assert.equal(result.needs_run_review,false);
 assert.equal(result.has_exact_locality_link,true);
 assert.deepEqual(result.roles,[{role:'electrical_permit',status:'staff_verified'},{role:'electrical_inspection',status:'needs_review'}]);
 assert.match(result.warning,/does not assign permit issuers/);
});
test('both missing specific roles remain unestablished even with legacy broad electrical verification',()=>{
 const l=locality();l.offices=[{authority_verification_status:'staff_verified',authority_roles:['electrical']}];
 const result=summarize({response:response({discovered_documents:8}),target:profile(),locality:l,action:'discovery'});
 assert.equal(result.observed_docs,8);assert.equal(result.action,'discovery');
 assert.deepEqual(result.roles.map(r=>r.status),['missing','missing']);
});
test('exact saved profile ID AND state required for office comparison; names cannot substitute',()=>{
 for(const mismatched of [{...locality(),jurisdiction_profile_id:'other'},{...locality(),jurisdiction_profile_id:''},{...locality(),state:'KY'},null]){
  const result=summarize({response:response({discovered_documents:2}),target:profile(),locality:mismatched});
  assert.equal(result.has_exact_locality_link,false);
  assert.deepEqual(result.roles.map(r=>r.status),['not_assessed','not_assessed']);
 }
});
test('changed/missing server identity or non-success cannot be displayed as acknowledged research',()=>{
 for(const payload of [
  response({success:false}),response({jurisdiction:{...profile(),id:'other'}}),
  response({jurisdiction:{...profile(),state:'KY'}}),response({jurisdiction:null}),
  {data:{success:true}},null,{data:{error:'Timed out'}}
 ])assert.throws(()=>summarize({response:payload,target:profile(),locality:locality()}),/not confirmed|does not match/);
});
test('failed archival or discovery stage, unknown run status and absent counts remain explicit',()=>{
 for(const patch of [
  {archival:{success:false}}, {discovery_scan:{success:false}},
  {scan_run:{status:'completed_with_errors'}}, {scan_run:{status:'unknown'}}
 ])assert.equal(run(patch).needs_run_review,true);
 assert.equal(run({discovered_documents:-1}).observed_docs,null);
 assert.equal(run({discovered_documents:'0'}).observed_docs,null);
 assert.equal(run({scan_run:undefined}).needs_run_review,true);
 const noCounts=run({discovered_documents:undefined,jurisdiction:{...profile(),documents:undefined}});
 assert.equal(noCounts.observed_docs,null);assert.equal(noCounts.saved_documents,null);
});
test('inputs and current office review fields stay unchanged and no network requests occur',()=>{
 const input=response(),target=profile(),current=locality(),before=JSON.stringify([input,target,current]);
 summarize({response:input,target,locality:current});
 assert.equal(JSON.stringify([input,target,current]),before);
});
test('picker shows role-specific research follow-up only after acknowledged response and preserves existing scan controls',()=>{
 const src=readFileSync('src/components/permitting/SelectorScanActions.jsx','utf8');
 assert.match(src,/summarizeSelectorElectricalResearchOutcome/);
 assert.match(src,/setFeedback\(outcome\)/);
 assert.match(src,/feedback\?\.profile_id===profile\.id/);
 assert.match(src,/No document entries were reported by this attempt/);
 assert.match(src,/Saved links and Scan activity may still contain discoveries/);
 assert.match(src,/do not assign a permit issuer or inspection provider from a geographic name alone/i);
 assert.match(src,/before retrying; unresolved electrical offices remain unverified/);
 assert.match(src,/pending\.current\.has\(key\)/);
 assert.match(src,/runAction\('refreshJurisdiction'/);
 assert.match(src,/Find missing information/);
 assert.match(src,/Scan activity/);
});
