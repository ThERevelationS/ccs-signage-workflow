import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { resolveResearchProfile, classifyBacklogRows, jurisdictionProfileTypeForQueueRow } from '../base44/shared/permittingResearchBacklog.mjs';
const source=fs.readFileSync(new URL('../base44/functions/permittingResearchBacklogDispatch/entry.ts',import.meta.url),'utf8');
const start=source.indexOf('async function ensureProfileForQueueRow(');
const end=source.indexOf('Deno.serve',start);
const compiled=transformSync(source.slice(start,end),{loader:'ts',format:'cjs'}).code;
const ensure=new Function('resolveResearchProfile','jurisdictionProfileTypeForQueueRow',compiled+';return ensureProfileForQueueRow;')(resolveResearchProfile,jurisdictionProfileTypeForQueueRow);
const row={id:'q',jurisdiction_name:'Union',state:'OH',jurisdiction_type:'city',parent_county_name:'Adams County'};
const profile=(type='city',county='Adams County',id='p')=>({id,name:'Union',state:'OH',type,parent_county:{name:county},website_url:'https://example.gov'});

test('same-county different types neither reconcile nor dispatch',()=>{
 const p=profile('township');
 const plan=classifyBacklogRows({queueRows:[row],profiles:[p]});
 assert.equal(plan.reconcile.length,0);assert.equal(plan.dispatch.length,0);assert.deepEqual(plan.conflicts,[row]);
});
test('compiled creation path blocks mismatched existing locality without writes',async()=>{
 let writes=0;
 await assert.rejects(ensure(row,[profile('village')],{create:async()=>{writes++;}}),/identity is conflicting/);
 assert.equal(writes,0);
});
test('duplicate compatible profiles require review rather than arbitrary selection',async()=>{
 const profiles=[profile('city','Adams County','p1'),profile('city','Adams County','p2')];
 assert.equal(resolveResearchProfile(row,profiles).conflict,true);
 let writes=0;await assert.rejects(ensure(row,profiles,{create:async()=>{writes++;}}));assert.equal(writes,0);
});
test('compatible placeholder is reused without new profile or false completed research',async()=>{
 const p=profile();delete p.website_url;
 const plan=classifyBacklogRows({queueRows:[row],profiles:[],identityProfiles:[p]});
 assert.equal(plan.reconcile.length,0);assert.equal(plan.dispatch.length,1);
 let writes=0;const result=await ensure(row,[p],{create:async()=>{writes++;}});
 assert.equal(result.profile,p);assert.equal(result.created,false);assert.equal(writes,0);
});
test('explicitly different county permits independent research',()=>{
 assert.equal(resolveResearchProfile(row,[profile('township','Allen County')]).conflict,false);
 const plan=classifyBacklogRows({queueRows:[row],profiles:[profile('township','Allen County')]});
 assert.equal(plan.dispatch.length,1);assert.equal(plan.conflicts.length,0);
});
test('unknown and generic profile types do not become cities',()=>{
 for(const type of ['unknown','municipality',undefined]){
  assert.equal(resolveResearchProfile(row,[{...profile(),type}]).conflict,true);
 }
});
test('placeholder county cannot disguise a same-name type conflict',()=>{
 assert.equal(resolveResearchProfile(row,[profile('township','INFORMATION NOT FOUND')]).conflict,true);
});
test('legacy village and generated municipality retain village queue compatibility',()=>{
 const village={...row,jurisdiction_type:'village'};
 for(const type of ['village','municipality'])assert.equal(resolveResearchProfile(village,[profile(type)]).profile.type,type);
 assert.equal(resolveResearchProfile(village,[profile('city')]).conflict,true);
});
