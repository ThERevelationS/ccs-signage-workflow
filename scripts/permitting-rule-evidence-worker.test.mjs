import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
const handlers={};
for(const name of ['permittingRuleExtraction','permittingRuleReview','permittingRuleInvalidate']) {
 const built=await build({entryPoints:['base44/functions/'+name+'/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
  plugins:[{name:'mock-sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
   b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.ruleWorkerFixture;',loader:'js'}));}}]});
 globalThis.Deno={serve:fn=>{handlers[name]=fn;}};
 await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
}
const matches=(row,query)=>Object.entries(query).every(([key,value])=>{
 if(key==='citations')return (row.citations || []).some(c=>matches(c,value.$elemMatch));
 if(value && typeof value==='object')return value.$in?value.$in.includes(row[key]):value.$gt?row[key]>value.$gt:false;
 return row[key]===value;
});
async function setup(options={}) {
 const f=await ruleFixture(options),counts={service:0,filters:[]},rules=f.api.ruleEntity;
 rules.filter=async(q,sort,limit,skip=0)=>{
  assert.equal(typeof sort,'string');assert.equal(Number.isInteger(limit),true);assert.equal(Number.isInteger(skip),true);
  counts.filters.push([q,sort,limit,skip]);
  const rows=f.rules.filter(row=>matches(row,q)).sort((a,b)=>a.id.localeCompare(b.id));
  return structuredClone(rows.slice(skip,skip+limit));
 };
 rules.count=async q=>f.rules.filter(row=>matches(row,q)).length;
 rules.aggregate=async({query,groupBy})=>{
  const groups={};for(const row of f.rules.filter(r=>matches(r,query)))groups[row[groupBy]]=(groups[row[groupBy]] || 0)+1;
  return {rows:Object.entries(groups).map(([key,count])=>({[groupBy]:key,count})),truncated:false};
 };
 const sourceEntity={...f.api.sourceEntity,filter:async(q,sort,limit,skip,fields)=>{
  counts.filters.push([q,sort,limit,skip,fields]);return Array.from({length:limit},(_,i)=>({id:'source'+(skip+i),title:'Document '+i}));}};
 globalThis.ruleWorkerFixture={auth:{me:async()=>options.role===null?null:{role:options.role || 'admin',email:'admin@example.test'}},
  get asServiceRole(){counts.service++;return{entities:{PermittingSourceDocument:sourceEntity,
   PermittingSourceTextSegment:f.api.segmentEntity,PermittingRuleExtractionRun:f.api.runEntity,PermittingRule:rules},
   integrations:{Core:{InvokeLLM:f.api.invokeLlm}}};}};
 const call=async(name,body)=>{
  const response=await handlers[name](new Request('https://test',{method:'POST',body:JSON.stringify(body)}));
  return {status:response.status,data:await response.json()};
 };
 const extract=(extra={})=>call('permittingRuleExtraction',{action:'extract',source_document_id:'source',start_page:1,page_count:1,request_id:f.api.requestId,...extra});
 const review=(body)=>call('permittingRuleReview',body);
 const importRule=async()=>{
  const run=await extract();assert.equal(run.status,200);
  const imported=await review({action:'import_candidate',run_id:run.data.run_id,candidate_index:0});
  assert.equal(imported.status,200);assert.equal(imported.data.success,true);return imported.data.rule;
 };
 return {f,counts,call,extract,review,importRule};
}
test('all three handlers deny staff/anonymous before service access',async()=>{
 for(const role of [null,'user','external'])for(const name of Object.keys(handlers)){
  const t=await setup({role});assert.equal((await t.call(name,{})).status,403);assert.equal(t.counts.service,0);assert.equal(t.f.calls.llm,0);
 }
});
test('manual selected-page extraction stages one run and replay spends zero credits',async()=>{
 const t=await setup();const r=await t.extract();assert.equal(r.status,200);assert.equal(r.data.candidates.length,1);
 assert.equal(r.data.rules_created,0);assert.equal(r.data.llm_calls,1);assert.equal(t.f.rules.length,0);
 const again=await t.extract();assert.equal(again.data.replayed,true);assert.equal(again.data.llm_calls,0);assert.equal(t.f.calls.llm,1);
});
test('preview/get_run/source pagination read without LLM or writes',async()=>{
 const t=await setup();
 assert.equal((await t.extract({action:'preview'})).data.llm_calls,0);
 const list=await t.call('permittingRuleExtraction',{action:'sources',jurisdiction_id:'profile',cursor:'20'});
 assert.equal(list.data.sources.length,20);assert.equal(list.data.next_cursor,'40');
 assert.deepEqual(t.counts.filters.at(-1).slice(0,4),[{jurisdiction_id:'profile'},'id',21,20]);
 assert.ok(!t.counts.filters.at(-1)[4].includes('extracted_text'));
 assert.equal((await t.extract({action:'get_run'})).data.not_found,true);
 assert.equal(t.f.calls.llm,0);assert.equal(t.f.calls.sourceWrites,0);assert.equal(t.f.calls.runCreates,0);
});
test('legacy broad extraction/automatic/invalid page requests cannot call AI',async()=>{
 const t=await setup();for(const body of [{jurisdiction_name:'Pilot'},{source_document_id:'source',page_count:6},
  {source_document_id:'source',start_page:'1'},{source_document_id:'source',automatic:true},{source_document_id:'source',queued:true}])
  assert.equal((await t.call('permittingRuleExtraction',body)).status,400);
 assert.equal(t.f.calls.llm,0);
});
test('rule list/counts honor SDK array signatures and real aggregation rows',async()=>{
 const t=await setup();await t.importRule();
 const rows=await t.review({action:'list',jurisdiction_id:'profile',limit:1,cursor:'0'});
 assert.equal(rows.status,200);assert.equal(rows.data.rules.length,1);assert.equal(rows.data.has_more,false);
 assert.deepEqual(t.counts.filters.at(-1),[{jurisdiction_id:'profile'},'-created_date',2,0]);
 const counts=await t.review({action:'counts',jurisdiction_id:'profile'});
 assert.equal(counts.data.total,1);assert.deepEqual(counts.data.by_status,[{status:'needs_review',count:1}]);
 assert.equal((await t.review({action:'list',cursor:'bad'})).status,400);
});
test('single import requires staff review and approvals verify current page evidence',async()=>{
 const t=await setup();const rule=await t.importRule();
 assert.equal(rule.is_operational,false);assert.equal(rule.status,'needs_review');
 const approved=await t.review({action:'approve',rule_id:rule.id,expected_version:1});
 assert.equal(approved.status,200);assert.equal(approved.data.rule.version,2);assert.equal(approved.data.rule.is_operational,true);
 assert.equal(approved.data.rule.citations[0].verification_status,'verified');
 const repeat=await t.review({action:'import_candidate',run_id:t.f.runs[0].id,candidate_index:0});
 assert.equal(repeat.data.rules_created,0);assert.equal(repeat.data.rule.status,'staff_approved');assert.equal(t.f.calls.ruleCreates,1);
});
test('unknown/draft authority and changed archive cannot be promoted',async()=>{
 for(const patch of [{authority_classification:'application_form',verification_status:'needs_verification'},
   {content_status:'draft'},{file_hash_sha256:'b'.repeat(64)}]) {
  const t=await setup();const rule=await t.importRule();t.f.patchSource(patch);
  assert.equal((await t.review({action:'approve',rule_id:rule.id,expected_version:1})).status,409);assert.equal(t.f.rules[0].is_operational,false);
 }
});
test('material edits demote approval; notes preserve it; unsupported edits cannot be reapproved',async()=>{
 const t=await setup(),rule=await t.importRule();
 await t.review({action:'approve',rule_id:rule.id,expected_version:1});
 const notes=await t.review({action:'edit',rule_id:rule.id,expected_version:2,edits:{notes:'Staff note'}});
 assert.equal(notes.data.rule.is_operational,true);
 const edit=await t.review({action:'edit',rule_id:rule.id,expected_version:3,edits:{numeric_value:999}});
 assert.equal(edit.data.rule.status,'needs_review');assert.equal(edit.data.rule.is_operational,false);
 assert.equal((await t.review({action:'approve',rule_id:rule.id,expected_version:4})).status,409);
});
test('concurrent reviewer changes survive narrow conditional update',async()=>{
 const t=await setup(),rule=await t.importRule(),update=t.f.api.ruleEntity.updateMany;
 t.f.api.ruleEntity.updateMany=async()=>{Object.assign(t.f.rules[0],{notes:'Concurrent staff edit',version:2,updated_date:'concurrent'});return{updated:0};};
 assert.equal((await t.review({action:'reject',rule_id:rule.id,expected_version:1})).status,409);
 assert.equal(t.f.rules[0].notes,'Concurrent staff edit');assert.equal(t.f.rules[0].status,'needs_review');
 t.f.api.ruleEntity.updateMany=update;
});
test('lost review acknowledgement converges on same operation, without another mutation',async()=>{
 const t=await setup(),rule=await t.importRule(),update=t.f.api.ruleEntity.updateMany;
 t.f.api.ruleEntity.updateMany=async(q,p)=>{await update(q,p);throw Error('lost acknowledgement');};
 const result=await t.review({action:'reject',rule_id:rule.id,expected_version:1,reason:'Source review needed'});
 assert.equal(result.status,200);assert.equal(result.data.rule.version,2);assert.equal(t.f.calls.ruleWrites,1);
});
test('unvalidated supersession is blocked and superseded history cannot be edited',async()=>{
 const t=await setup(),rule=await t.importRule();
 assert.equal((await t.review({action:'supersede',rule_id:rule.id,replacement_rule:{requirement:'invented'}})).status,409);
 t.f.rules[0].status='superseded';
 for(const action of ['edit','reject','approve'])assert.equal((await t.review({action,rule_id:rule.id,expected_version:1,edits:{requirement:'invented'}})).status,409);
 assert.equal(t.f.calls.ruleWrites,0);assert.equal(t.f.calls.ruleCreates,1);
});
test('source invalidation compares citation hashes and demotes without losing evidence',async()=>{
 const t=await setup(),rule=await t.importRule();await t.review({action:'approve',rule_id:rule.id,expected_version:1});
 const before=structuredClone(t.f.rules[0].citations);t.f.patchSource({file_hash_sha256:'b'.repeat(64)});
 const result=await t.call('permittingRuleInvalidate',{source_document_id:'source'});
 assert.equal(result.status,200);assert.equal(result.data.rules_flagged,1);assert.equal(result.data.llm_calls,0);
 assert.equal(t.f.rules[0].status,'needs_review');assert.equal(t.f.rules[0].is_operational,false);assert.deepEqual(t.f.rules[0].citations,before);
 assert.equal((await t.call('permittingRuleInvalidate',{source_document_id:'source'})).data.rules_flagged,0);
});
test('source review scope changes invalidate prior approval even when file bytes stay the same',async()=>{
 const t=await setup(),rule=await t.importRule();await t.review({action:'approve',rule_id:rule.id,expected_version:1});
 assert.equal(t.f.rules[0].evidence_context.approved_sources.length,1);
 t.f.patchSource({jurisdiction_scope:'Separate township authority'});
 const result=await t.call('permittingRuleInvalidate',{source_document_id:'source'});
 assert.equal(result.data.rules_flagged,1);assert.equal(t.f.rules[0].is_operational,false);assert.equal(t.f.calls.llm,1);
});
test('invalidation is bounded, cursor based, and preserves concurrent staff changes',async()=>{
 const t=await setup(),rule=await t.importRule();await t.review({action:'approve',rule_id:rule.id,expected_version:1});
 t.f.patchSource({verification_status:'needs_verification'});
 t.f.api.ruleEntity.updateMany=async()=>{t.f.rules[0].notes='Newer staff decision';return{updated:0};};
 const result=await t.call('permittingRuleInvalidate',{source_document_id:'source',cursor:'rule0'});
 assert.equal(result.data.conflicts,1);assert.equal(result.data.rules_flagged,0);assert.equal(t.f.rules[0].notes,'Newer staff decision');
 assert.deepEqual(t.counts.filters.at(-1).slice(1),['id',51,0]);
 assert.deepEqual(t.counts.filters.at(-1)[0].id,{$gt:'rule0'});
 assert.equal((await t.call('permittingRuleInvalidate',{source_document_id:'source',new_hash:'invented'})).status,409);
});
test('admin UI uses selected-source previews, stable manual ids, and separate one-candidate import',async()=>{
 const child=await readFile('src/components/admin/PermittingRuleEvidenceExtraction.jsx','utf8');
 const parent=await readFile('src/components/admin/PermittingRulesReview.jsx','utf8');
 assert.match(child,/sessionStorage.setItem/);assert.match(child,/action === "extract" && !id/);
 assert.match(child,/action === "import_candidate"/);assert.match(child,/action: "sources"/);
 assert.match(child,/Check saved result/);assert.match(child,/!preview/);assert.doesNotMatch(parent,/Run Extraction \(Boone\)/);
 assert.match(parent,/PermittingRuleEvidenceExtraction/);
});
test('review edits preserve conflicting source flags and historical classification',async()=>{
 for(const status of ['needs_review','historical']) {
  const t=await setup(),rule=await t.importRule();
  t.f.rules[0].status=status;t.f.rules[0].conflict_state='conflicting_sources';
  const changed=await t.review({action:'edit',rule_id:rule.id,expected_version:1,edits:{requirement:'Maximum area is 50 square feet. Changed'}});
  assert.equal(changed.status,200);assert.equal(changed.data.rule.status,status);
  assert.equal(changed.data.rule.conflict_state,'conflicting_sources');assert.equal(changed.data.rule.is_operational,false);
  assert.equal((await t.review({action:'approve',rule_id:rule.id,expected_version:2})).status,409);
 }
});

test('provider controls are tracked, replayable and never importable as extraction',async()=>{
 for(const action of ['provider_control','provider_schema_control']) {
  const t=await setup();let args;
  const service=globalThis.ruleWorkerFixture.asServiceRole;
  service.integrations.Core.InvokeLLM=async value=>{args=value;t.f.calls.llm++;return 'OK';};
  globalThis.ruleWorkerFixture={auth:globalThis.ruleWorkerFixture.auth,asServiceRole:service};
  const r=await t.extract({action});
  assert.equal(r.data.success,true);assert.equal(r.data.provider_control,true);assert.equal(r.data.candidates.length,0);
  assert.equal(r.data.method,action==='provider_control'?'provider-control-v1':'provider-schema-control-v1');
  assert.equal(args.prompt.includes('EVIDENCE'),false);
  assert.equal(Boolean(args.response_json_schema),action==='provider_schema_control');
  const replay=await t.extract({action});assert.equal(replay.data.llm_calls,0);assert.equal(t.f.calls.llm,1);
  assert.equal((await t.extract()).status,409);
  const imported=await t.review({action:'import_candidate',run_id:r.data.run_id,candidate_index:0});
  assert.notEqual(imported.status,200);assert.equal(t.f.rules.length,0);
 }
});

test('JSON text transport retains literal validation and fails closed on invalid JSON',async()=>{
 for(const invalid of [false,true]) {
  const t=await setup(),service=globalThis.ruleWorkerFixture.asServiceRole;
  const original=service.integrations.Core.InvokeLLM;
  service.integrations.Core.InvokeLLM=async args=>{
   assert.equal(args.response_json_schema,undefined);assert.match(args.prompt,/Return ONLY a JSON object/);
   const result=await original(args);return invalid?'not JSON':JSON.stringify(result);
  };
  globalThis.ruleWorkerFixture={auth:globalThis.ruleWorkerFixture.auth,asServiceRole:service};
  const r=await t.extract();
  if(invalid){assert.equal(r.status,409);assert.equal(t.f.runs[0].status,'failed');}
  else {assert.equal(r.data.success,true);assert.equal(r.data.candidates.length,1);}
  assert.equal(t.f.calls.llm,1);assert.equal(t.f.rules.length,0);
 }
});

test('candidate handoff checks current evidence without importing or making AI calls',async()=>{
 const t=await setup(),extracted=await t.extract(),before=structuredClone(t.f.runs);
 const result=await t.review({action:'candidate_handoff',run_id:extracted.data.run_id});
 assert.equal(result.status,200);assert.equal(result.data.candidates.length,1);
 assert.equal(result.data.staff_approval_required,true);assert.equal(result.data.llm_calls,0);
 assert.equal(t.f.calls.llm,1);assert.equal(t.f.rules.length,0);assert.deepEqual(t.f.runs,before);
 t.f.runs[0].candidates[0].requirement='altered';
 assert.equal((await t.review({action:'candidate_handoff',run_id:extracted.data.run_id})).status,409);
});
test('candidate handoff refuses provider diagnostic receipts',async()=>{
 const t=await setup(),r=await t.extract({action:'provider_control'});
 assert.equal((await t.review({action:'candidate_handoff',run_id:r.data.run_id})).status,409);
 assert.equal(t.f.rules.length,0);
});

test('explicit conflict resolution verifies evidence, preserves history and does not approve',async()=>{
 const t=await setup(),rule=await t.importRule();
 const stored=t.f.rules[0];stored.conflict_state='conflicting_sources';
 const payload={action:'resolve_conflict',rule_id:rule.id,expected_version:stored.version,rationale:'Every retained source supports this literal requirement within the recorded authority scope.',reviewed_all_citations:true};
 assert.equal((await t.review({...payload,reviewed_all_citations:false})).status,400);
 const result=await t.review(payload);assert.equal(result.status,200);
 assert.equal(result.data.rule.conflict_state,'under_review');assert.equal(result.data.rule.status,'needs_review');
 assert.equal(result.data.rule.is_operational,false);assert.equal(result.data.rule.is_workflow_instruction,false);
 assert.deepEqual(result.data.rule.citations,rule.citations);
 assert.equal(result.data.rule.evidence_context.conflict_resolutions.length,1);
 assert.equal(result.data.rule.evidence_context.conflict_resolutions[0].previous_conflict_state,'conflicting_sources');
 assert.equal((await t.review(payload)).status,409);
});
test('conflict resolution cannot bypass draft or historical evidence',async()=>{
 for(const field of ['draft_context','status']) {
  const t=await setup(),rule=await t.importRule();t.f.rules[0].conflict_state='conflicting_sources';
  t.f.rules[0][field]=field==='status'?'historical':true;
  const before=structuredClone(t.f.rules);
  const result=await t.review({action:'resolve_conflict',rule_id:rule.id,expected_version:rule.version,
   rationale:'Reviewed all cited sources and recorded the scope of the apparent conflict.',reviewed_all_citations:true});
  assert.equal(result.status,409);assert.deepEqual(t.f.rules,before);
 }
});

test('conflict resolution preserves conflicts when source authority changed',async()=>{
 const t=await setup(),rule=await t.importRule();t.f.rules[0].conflict_state='conflicting_sources';
 t.f.patchSource({verification_status:'needs_verification'});
 const before=structuredClone(t.f.rules);
 const result=await t.review({action:'resolve_conflict',rule_id:rule.id,expected_version:rule.version,
  rationale:'Reviewed every retained citation and its relationship to the disputed requirement.',reviewed_all_citations:true});
 assert.equal(result.status,409);assert.deepEqual(t.f.rules,before);
});


test('saved request lookup reopens the same run and readiness detects changed evidence without writes',async()=>{
 const t=await setup(),extracted=await t.extract();
 const before=structuredClone(t.f.calls),runs=structuredClone(t.f.runs);
 const saved=await t.extract({action:'get_run'});
 assert.equal(saved.status,200);assert.equal(saved.data.success,true);
 assert.equal(saved.data.run.id,extracted.data.run_id);assert.equal(saved.data.llm_calls,0);
 const ready=await t.review({action:'candidate_handoff',run_id:saved.data.run.id});
 assert.equal(ready.status,200);assert.equal(ready.data.candidates[0].evidence_ready,true);
 t.f.runs[0].candidates[0].requirement='Changed after saved lookup';
 assert.equal((await t.review({action:'candidate_handoff',run_id:saved.data.run.id})).status,409);
 assert.deepEqual(t.f.calls,before);assert.equal(t.f.rules.length,0);
 t.f.runs[0].candidates[0].requirement=runs[0].candidates[0].requirement;
 assert.deepEqual(t.f.runs,runs);
});


test('material applicability edits refresh metadata, preserve history and still require literal approval',async()=>{
 const t=await setup(),rule=await t.importRule();
 t.f.rules[0].evidence_context.conflict_resolutions=[{rationale:'Preserved prior review'}];
 const edited=await t.review({action:'edit',rule_id:rule.id,expected_version:rule.version,edits:{exceptions:'unsupported exception'}});
 assert.equal(edited.status,200);assert.equal(edited.data.rule.status,'needs_review');
 assert.equal(edited.data.rule.is_operational,false);assert.equal(edited.data.rule.is_workflow_instruction,false);
 assert.equal(edited.data.rule.evidence_context.applicability.fields.exceptions.literal,'unsupported exception');
 assert.equal(edited.data.rule.evidence_context.applicability.address_applicability,'requires_review');
 assert.equal(edited.data.rule.evidence_context.conflict_resolutions[0].rationale,'Preserved prior review');
 assert.equal((await t.review({action:'approve',rule_id:rule.id,expected_version:edited.data.rule.version})).status,409);
 const cleared=await t.review({action:'edit',rule_id:rule.id,expected_version:edited.data.rule.version,edits:{exceptions:''}});
 assert.equal(cleared.status,200);assert.equal(cleared.data.rule.evidence_context.applicability.fields.exceptions.status,'not_established_in_excerpt');
 assert.equal((await t.review({action:'approve',rule_id:rule.id,expected_version:cleared.data.rule.version})).status,200);
});

test('review history retains approval attribution across another staff notes edit and rejection',async()=>{
 const t=await setup(),rule=await t.importRule();
 const approved=await t.review({action:'approve',rule_id:rule.id,expected_version:1});
 assert.equal(approved.status,200);
 const decision=approved.data.rule;
 globalThis.ruleWorkerFixture.auth.me=async()=>({role:'admin',email:'editor@example.test',full_name:'Second reviewer'});
 const notes=await t.review({action:'edit',rule_id:rule.id,expected_version:2,edits:{notes:'Second staff note'}});
 assert.equal(notes.status,200);
 for(const key of ['reviewer','reviewer_email','reviewed_at'])assert.equal(notes.data.rule[key],decision[key]);
 const h=notes.data.rule.evidence_context.review_history;
 assert.deepEqual(h.map(e=>e.action),['approve','edit']);
 assert.equal(h[1].reviewer_email,'editor@example.test');
 assert.equal(h[1].before.notes,decision.notes);
 assert.equal(h[1].after.notes,'Second staff note');
 assert.equal(h[0].after.status,'staff_approved');
 assert.deepEqual(h[0].approved_sources,decision.evidence_context.approved_sources);
 const rejected=await t.review({action:'reject',rule_id:rule.id,expected_version:3,reason:'Needs updated source'});
 assert.equal(rejected.status,200);
 assert.equal(rejected.data.rule.reviewer_email,'editor@example.test');
 assert.deepEqual(rejected.data.rule.evidence_context.review_history.slice(0,2),h);
 assert.equal(rejected.data.rule.evidence_context.review_history[2].before.reviewer_email,'admin@example.test');
});
test('malformed history blocks writes and lost acknowledgement appends exactly one event',async()=>{
 const t=await setup(),rule=await t.importRule();
 t.f.rules[0].evidence_context.review_history={legacy:'requires reconciliation'};
 const before=structuredClone(t.f.rules);
 assert.equal((await t.review({action:'reject',rule_id:rule.id,expected_version:1})).status,409);
 assert.deepEqual(t.f.rules,before);
 t.f.rules[0].evidence_context.review_history=[];
 const update=t.f.api.ruleEntity.updateMany;
 t.f.api.ruleEntity.updateMany=async(q,p)=>{await update(q,p);throw Error('lost response');};
 const saved=await t.review({action:'reject',rule_id:rule.id,expected_version:1});
 assert.equal(saved.status,200);
 assert.equal(saved.data.rule.evidence_context.review_history.length,1);
 assert.equal(saved.data.rule.evidence_context.review_history[0].operation_id,saved.data.rule.review_operation_id);
 assert.equal((await t.review({action:'reject',rule_id:rule.id,expected_version:1})).status,409);
 assert.equal(t.f.rules[0].evidence_context.review_history.length,1);
});
