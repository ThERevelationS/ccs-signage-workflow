import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {normalizeOfficeResearch,officeResearchPrompt,officeResearchChecklist} from '../base44/shared/permittingOfficeResearch.mjs';
import {jurisdictionProtectionGuards} from '../base44/shared/jurisdictionPersistence.mjs';
test('research checklist covers all roles and detailed separate electrical responsibilities',()=>{
 const prompt=officeResearchPrompt();assert.equal(officeResearchChecklist.roles.length,7);
 for(const term of ['electrical_permit','electrical_inspection','Inspection stages','Contractor requirements','Inspection scheduling','Commercial sign applicability'])assert.ok(prompt.includes(term),term);
 assert.ok(prompt.includes('separately'));assert.ok(prompt.includes('documents[]'));
});
test('research findings keep all seven roles as drafts with explicit missing fields',()=>{
 const result=normalizeOfficeResearch({roles:[{role:'electrical_permit',office_name:'Fixture Electrical Office',official_source_url:'https://fixture.gov/electrical',verification_status:'staff_verified',research_fields:{fees:'See official schedule',contractor_registration_or_licensing:'Registration required'}}]},
  {jurisdiction:{id:'profile',name:'Fixture',state:'OH',type:'city'},now:()=> '2026-10-14'});
 assert.equal(result.roles.length,7);assert.equal(result.profile_snapshot.id,'profile');
 const issuer=result.roles.find(r=>r.role==='electrical_permit'),inspection=result.roles.find(r=>r.role==='electrical_inspection');
 assert.equal(issuer.verification_status,'needs_verification');assert.equal(issuer.research_fields.fees,'See official schedule');
 assert.equal(inspection.office_name,null);assert.equal(inspection.research_fields.required_inspection_stages,null);
 assert.equal(normalizeOfficeResearch({}),null);
 assert.ok(Object.hasOwn(jurisdictionProtectionGuards({}, {office_research:result}),'_manual_requirements'));
});
test('unsafe links and ambiguous names remain unresolved drafts',()=>{
 const result=normalizeOfficeResearch({roles:[{role:'sign_permit',official_source_url:'javascript:alert(1)'},{role:'electrical_inspection',office_name:'A'},{role:'electrical_inspection',office_name:'B'}]});
 assert.equal(result.roles[0].official_source_url,null);
 assert.equal(result.roles.find(r=>r.role==='electrical_inspection').office_name,null);
});
let handler;let calls=0,prompt,schema;
const bundle=await build({entryPoints:['base44/functions/jurisdictionResearchAgent/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
 plugins:[{name:'sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.officeResearchFixture;',loader:'js'}));}}]});
globalThis.Deno={serve:fn=>handler=fn};await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('actual agent collects office checklist in its single existing AI call',async()=>{
 globalThis.officeResearchFixture={auth:{me:async()=>({role:'admin',id:'user'})},asServiceRole:{integrations:{Core:{InvokeLLM:async input=>{
  calls++;prompt=input.prompt;schema=input.response_json_schema;return {documents:[],office_research:{roles:[{role:'electrical_inspection',office_name:'Fixture Inspector',official_source_url:'https://fixture.gov/inspections',research_fields:{required_inspection_stages:'Rough and final',scheduling_contact_or_portal:'https://fixture.gov/book'}}]}};}}}}};
 const response=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({jurisdictionName:'Fixture',jurisdictionState:'OH',jurisdictionType:'city'})}));
 const json=await response.json();assert.equal(response.status,200);assert.equal(calls,1);
 assert.ok(prompt.includes('electrical_permit'));assert.ok(schema.properties.office_research);
 assert.equal(json.data.office_research.roles.find(r=>r.role==='electrical_inspection').research_fields.required_inspection_stages,'Rough and final');
 assert.equal(json.data.office_research.profile_snapshot.name,'Fixture');
});
