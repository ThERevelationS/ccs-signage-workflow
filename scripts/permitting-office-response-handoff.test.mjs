import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {captureElectricalOfficeResponses} from '../src/components/permitting/electricalOfficeResponseHandoff.mjs';
import {createOfficeResearchResponse} from '../src/components/permitting/officeResearchResponses.mjs';
import {compareSavedDrafts} from '../src/components/permitting/permitDraftComparison.mjs';

const locality={id:'fixture-oh',name:'Fixture municipality',state:'OH',type:'city'};
const research={method:'office-research-requirements-v1',profile_snapshot:locality,roles:[
 {role:'electrical_permit',office_name:'ORIGINAL_ISSUER',research_fields:{scope:'unverified'}},
 {role:'electrical_inspection',office_name:'ORIGINAL_INSPECTOR'}]};
const draft={responding_office:'ISSUER_REPLY',response_date:'2026-10-18',exact_quote:'QUOTE_BEGIN '+ 'Synthetic office statement. '.repeat(120)+' QUOTE_END',source_reference:'Synthetic email only',source_url:'https://example.gov/permit'};
research.staff_responses=[
 createOfficeResearchResponse(research,'electrical_permit',{...draft,currentness:'claims_current'}, {id:'office-response-fixture-0001',actor:'Fixture staff',now:()=>'2026-10-18T12:00:00Z'}),
 createOfficeResearchResponse(research,'electrical_inspection',{...draft,responding_office:'INSPECTOR_REPLY',source_url:'',exact_quote:'Synthetic inspection statement.'},{id:'office-response-fixture-0002',actor:'Fixture staff',now:()=>'2026-10-18T12:00:00Z'})];
const original=JSON.stringify(research);
const result=captureElectricalOfficeResponses(research,locality);
assert.equal(result.status,'captured');
assert.deepEqual(result.roles.map(row=>[row.role,row.responses.length]),[['electrical_permit',1],['electrical_inspection',1]]);
const permit=result.roles[0].responses[0];
assert.equal(permit.evidence.exact_quote,research.staff_responses[0].exact_quote);
assert.equal(permit.evidence.currentness,'claims_current');
assert.equal(permit.evidence.commercial_sign_scope,'unknown');
assert.equal(permit.evidence.site_applicability,'unknown');
assert.equal(permit.locality_matches_research,true);
assert.equal(permit.findings_match_research,true);
research.staff_responses[0].exact_quote='LATER_REPLY';
research.roles[0].research_fields.scope='Changed';
assert.ok(permit.evidence.exact_quote.endsWith('QUOTE_END'));
assert.equal(permit.evidence.recorded_findings[0].research_fields.scope,'unverified');
const later=captureElectricalOfficeResponses(research,locality);
assert.equal(later.roles[0].responses[0].findings_match_research,false);
const earlierRow={id:'earlier',snapshot:{jurisdiction:locality,steps:[],electrical_planning_handoff:{office_responses:result}}};
const revision=structuredClone(earlierRow);
revision.id='revision';
revision.snapshot.electrical_planning_handoff.office_responses=later;
const changes=compareSavedDrafts(earlierRow,revision);
assert.equal(changes.find(row=>row.label==='Electrical office planning handoff').changed,true);
assert.ok(earlierRow.snapshot.electrical_planning_handoff.office_responses.roles[0].responses[0].evidence.exact_quote.endsWith('QUOTE_END'));
assert.equal(captureElectricalOfficeResponses(research,{...locality,id:'other'}).status,'research_identity_unresolved');
assert.equal(captureElectricalOfficeResponses(research,{...locality,state:'KY'}).roles[0].responses.length,0);
assert.equal(captureElectricalOfficeResponses({...research,staff_responses:{}},locality).status,'history_unreadable');
assert.equal(captureElectricalOfficeResponses({...research,staff_responses:[]},locality).roles[0].responses.length,0);
assert.equal(captureElectricalOfficeResponses({...research,staff_responses:[{...research.staff_responses[0],authority_approved:true}]},locality).omitted_entry_count,1);
const historical=structuredClone(research);
historical.staff_responses[0].profile_snapshot.id='historical-other';
assert.equal(captureElectricalOfficeResponses(historical,locality).roles[0].responses[0].locality_matches_research,false);
historical.staff_responses.push(structuredClone(historical.staff_responses[0]));
assert.equal(captureElectricalOfficeResponses(historical,locality).roles[0].responses[0].response_identity_unique,false);
// Bundle the actual existing workflow entry with a synthetic data writer only.
const writes=[];
globalThis.__handoffTestApi={entities:{PermittingWorkflowDraft:{create:async payload=>{writes.push(structuredClone(payload));return {id:'synthetic-saved',...structuredClone(payload)};}}}};
const bundle=await build({entryPoints:['src/components/permitting/permitWorkflowDesigner.js'],bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'synthetic-api',setup(b){b.onResolve({filter:/^@\/api\/base44Client$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const base44=globalThis.__handoffTestApi;',loader:'js'}));}}]});
const {createElectricalPlanningHandoff,saveWorkflowDraft}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const restored=JSON.parse(original);
const handoff=createElectricalPlanningHandoff(restored,locality);
assert.equal(handoff.office_responses.roles[0].responses[0].evidence.responding_office,'ISSUER_REPLY');
const saved=await saveWorkflowDraft({jurisdiction:{jurisdiction_id:locality.id},steps:[],electrical_planning_handoff:handoff},{electricalWork:true},'Synthetic snapshot','Unverified');
assert.equal(writes.length,1);
assert.equal(writes[0].work_order_id,undefined);
restored.staff_responses[0].exact_quote='Changed live research';
assert.ok(saved.snapshot.electrical_planning_handoff.office_responses.roles[0].responses[0].evidence.exact_quote.endsWith('QUOTE_END'));
assert.equal(saved.snapshot.electrical_planning_handoff.office_responses.roles[0].responses[0].evidence.authority_approved,false);
delete globalThis.__handoffTestApi;
console.log('PASS response handoff: role separation, exact quote/scope/history, deep snapshot isolation, changed findings/locality/duplicate warnings, legacy/malformed evidence, actual workflow capture/save and revision comparison; synthetic writer only.');
