import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleFixture} from './permitting-rule-evidence-fixture.mjs';
import {loadRuleEvidence,prepareRuleCandidate,validateRuleCandidates,verifyRuleForApproval,assertEvidenceCurrent,assertRuleApplicabilityEvidence} from '../base44/shared/permittingRuleEvidence.mjs';
import {extractEvidenceUnit,importEvidenceCandidate} from '../base44/shared/permittingRuleEvidenceRun.mjs';
test('exact selected page evidence stages one candidate without creating or activating rules; replay consumes no credits',async()=>{
 const f=await ruleFixture();const r=await extractEvidenceUnit(f.api);
 assert.equal(r.candidates_staged,1);assert.equal(r.rules_created,0);assert.equal(r.llm_calls,1);
 assert.equal(r.candidates[0].numeric_value,50);assert.equal(r.candidates[0].unit,'square feet');
 assert.equal(r.candidates[0].status,'needs_review');assert.equal(r.candidates[0].is_operational,false);
 assert.equal(r.candidates[0].citations[0].physical_page,1);assert.equal(r.candidates[0].evidence_context.full_code_review,false);
 assert.equal((await extractEvidenceUnit(f.api)).llm_calls,0);assert.equal(f.calls.llm,1);assert.equal(f.rules.length,0);
});
test('preview requires no durable writes, credits, uploads or source changes',async()=>{
 const f=await ruleFixture();const before=structuredClone(f.source());
 const r=await extractEvidenceUnit({...f.api,dryRun:true,requestId:''});assert.equal(r.llm_calls,0);assert.equal(r.evidence.length,1);
 assert.deepEqual(f.source(),before);assert.equal(f.runs.length,0);
});
test('invented quote/requirement/section/page/numeric/structured terms are rejected',async()=>{
 const f=await ruleFixture(),unit=await loadRuleEvidence(f.api);
 for(const patch of [{excerpt:'Invented requirement copied from nowhere.'},{requirement:'The maximum sign is 500 feet.'},{physical_page:9},
  {section_reference:'3409.'},{numeric_literal:'500 square feet'},{numeric_literal:'50'},{sign_type:'wall sign'},{trigger:'Any new construction'}]) {
  await assert.rejects(prepareRuleCandidate(unit,{...f.raw,...patch},{extractionDate:'2026-10-04T17:00:00Z'}));
 }
 const r=await validateRuleCandidates(unit,{rules:[f.raw,{...f.raw,excerpt:'made up'}]},{extractionDate:'2026-10-04T17:00:00Z'});
 assert.equal(r.candidates.length,1);assert.equal(r.rejected.length,1);
});
test('candidate arrays above the output bound are rejected, never partially trusted',async()=>{
 const f=await ruleFixture(),unit=await loadRuleEvidence(f.api);
 await assert.rejects(validateRuleCandidates(unit,{rules:Array.from({length:41},()=>f.raw)}),/invalid candidate batch/);
});
test('unknown/draft/historical source labels cannot become operational through high AI confidence',async()=>{
 for(const source of [{authority_classification:'unknown_review_required',content_status:'unknown',verification_status:'needs_verification'},
  {content_status:'draft'},{authority_classification:'comprehensive_rewrite'},{content_status:'historical'}]) {
  const f=await ruleFixture({source});const r=await extractEvidenceUnit(f.api),rule=r.candidates[0];
  assert.equal(rule.is_operational,false);await assert.rejects(verifyRuleForApproval(rule,f.api));
 }
});
test('concurrent selected-source requests reserve at most one LLM call',async()=>{
 const f=await ruleFixture();await Promise.allSettled([extractEvidenceUnit({...f.api,token:'one'}),extractEvidenceUnit({...f.api,token:'two'})]);
 assert.equal(f.calls.llm,1);assert.equal(f.calls.runCreates,1);
});
test('lost source/run/create acknowledgements converge without repeated credits or duplicate runs',async()=>{
 const f=await ruleFixture({createRun:'lost'});f.loseSource();f.loseRun();
 assert.equal((await extractEvidenceUnit(f.api)).status,'complete');assert.equal(f.calls.llm,1);assert.equal(f.calls.runCreates,1);
});
test('unknown run creation is never repeated; a delayed reserved run can reconcile explicitly',async()=>{
 const f=await ruleFixture({createRun:'missing'});
 assert.equal((await extractEvidenceUnit(f.api)).status,'run_uncertain');assert.equal(f.calls.llm,0);
 assert.equal((await extractEvidenceUnit(f.api)).status,'run_uncertain');assert.equal(f.calls.runCreates,1);
 await assert.rejects(extractEvidenceUnit({...f.api,requestId:'manual-request-00000002'}),/Reconcile/);
 f.lateRun();assert.equal((await extractEvidenceUnit(f.api)).status,'complete');assert.equal(f.calls.llm,1);assert.equal(f.calls.runCreates,1);
});
test('failed LLM attempt is durably counted and redelivery does not retry it',async()=>{
 const f=await ruleFixture({failLlm:true});assert.equal((await extractEvidenceUnit(f.api)).status,'failed');
 assert.equal(f.runs[0].llm_attempts,1);assert.equal((await extractEvidenceUnit(f.api)).llm_calls,0);assert.equal(f.calls.llm,1);
});
test('manual fresh request after a known failure has no automatic daily quota/backoff',async()=>{
 const f=await ruleFixture({failLlm:true});await extractEvidenceUnit(f.api);
 f.api.invokeLlm=async()=>{f.calls.llm++;return{rules:[f.raw]};};
 assert.equal((await extractEvidenceUnit({...f.api,requestId:'manual-request-00000002'})).status,'complete');
 assert.equal(f.calls.llm,2);
});
test('source/authority changes during LLM analysis preserve source and discard stale candidates',async()=>{
 for(const patch of [{verification_status:'needs_verification'},{file_hash_sha256:'b'.repeat(64)},{jurisdiction_scope:'Other office'}]) {
  const f=await ruleFixture();f.api.invokeLlm=async()=>{f.calls.llm++;f.patchSource(patch);return{rules:[f.raw]};};
  await assert.rejects(extractEvidenceUnit(f.api));
  assert.equal(f.runs[0].status,'failed');assert.equal(f.runs[0].candidates.length,0);assert.equal(f.rules.length,0);
 }
});
test('unrelated source notes from another worker are preserved; stale scope is never overridden',async()=>{
 const f=await ruleFixture();f.api.invokeLlm=async()=>{f.calls.llm++;f.patchSource({http_outcome:'200'});return{rules:[f.raw]};};
 assert.equal((await extractEvidenceUnit(f.api)).status,'complete');assert.equal(f.source().http_outcome,'200');
});
test('request id cannot be reused for other physical pages or changed authority snapshots',async()=>{
 const f=await ruleFixture();await extractEvidenceUnit(f.api);f.patchSource({notes_gaps:'Reviewed source scope changed'});
 await assert.rejects(extractEvidenceUnit(f.api),/different source/);assert.equal(f.calls.llm,1);
});
test('single candidate import creates only a nonoperational rule and dedupes across redelivery',async()=>{
 const f=await ruleFixture();const run=await extractEvidenceUnit(f.api);
 const r=await importEvidenceCandidate({...f.api,runId:run.run_id,candidateIndex:0});
 assert.equal(r.rules_created,1);assert.equal(r.rule.status,'needs_review');assert.equal(r.rule.is_operational,false);
 assert.equal((await importEvidenceCandidate({...f.api,runId:run.run_id,candidateIndex:0})).rules_created,0);
 assert.equal(f.calls.ruleCreates,1);assert.equal(f.calls.llm,1);
});
test('uncertain candidate creation does not repeat, even manually; delayed rule reconciles',async()=>{
 const f=await ruleFixture({createRule:'missing'}),run=await extractEvidenceUnit(f.api);
 const args={...f.api,runId:run.run_id,candidateIndex:0};
 assert.equal((await importEvidenceCandidate(args)).status,'import_uncertain');
 assert.equal((await importEvidenceCandidate(args)).status,'import_uncertain');assert.equal(f.calls.ruleCreates,1);
 f.lateRule();const late=await importEvidenceCandidate(args);assert.equal(late.success,true);assert.equal(late.rules_created,0);assert.equal(f.calls.ruleCreates,1);
});
test('concurrent candidate imports create only one rule',async()=>{
 const f=await ruleFixture(),run=await extractEvidenceUnit(f.api);
 await Promise.allSettled([importEvidenceCandidate({...f.api,runId:run.run_id,candidateIndex:0,token:'one'}),
  importEvidenceCandidate({...f.api,runId:run.run_id,candidateIndex:0,token:'two'})]);assert.equal(f.calls.ruleCreates,1);
});
test('staged candidates cannot be imported after source/page replacement or tampering',async()=>{
 for(const change of ['source','candidate','hash']) {
  const f=await ruleFixture(),run=await extractEvidenceUnit(f.api);
  if(change==='source')f.patchSource({file_hash_sha256:'b'.repeat(64)});
  if(change==='candidate')f.runs[0].candidates[0].requirement='Invented law';
  if(change==='hash')f.runs[0].candidates_sha256='b'.repeat(64);
  await assert.rejects(importEvidenceCandidate({...f.api,runId:run.run_id,candidateIndex:0}));assert.equal(f.calls.ruleCreates,0);
 }
});
test('previous staff decisions and edits are never overwritten during deduped import',async()=>{
 const f=await ruleFixture(),run=await extractEvidenceUnit(f.api),args={...f.api,runId:run.run_id,candidateIndex:0};
 await importEvidenceCandidate(args);f.advance();f.rules[0].status='staff_rejected';f.rules[0].reviewer='Other reviewer';
 await importEvidenceCandidate(args);assert.equal(f.rules[0].status,'staff_rejected');assert.equal(f.rules[0].reviewer,'Other reviewer');
 f.rules[0].requirement='Staff edited text';await assert.rejects(importEvidenceCandidate(args),/staff edits/);
 assert.equal(f.rules[0].requirement,'Staff edited text');assert.equal(f.calls.ruleCreates,1);
});
test('approval validates literal page hashes, source adoption/review, numbers and complete text',async()=>{
 const f=await ruleFixture(),run=await extractEvidenceUnit(f.api),rule=run.candidates[0];
 assert.equal((await verifyRuleForApproval(rule,f.api)).length,1);
 for(const patch of [{numeric_value:999},{unit:'feet'},{requirement:'Maximum area is 500 square feet.'},
  {jurisdiction_id:'wrong'},{draft_context:true},{trigger:'Unsupported staff trigger'},{exceptions:'Invented exemption'},
  {rule_category:'unknown'},{evidence_context:{...rule.evidence_context,jurisdiction_scope:'Other office'}},
  {citations:[{...rule.citations[0],archived_file_url:'https://wrong.test/file.pdf'}]},
  {citations:[{...rule.citations[0],text_sha256:'b'.repeat(64)}]}])
  await assert.rejects(verifyRuleForApproval({...rule,...patch},f.api));
 f.patchSource({text_extraction_state:{...f.source().text_extraction_state,complete_document_text:false,status:'partial'}});
 await assert.rejects(verifyRuleForApproval(rule,f.api),/Complete/);
});
test('approval does not trust one good citation mixed with unsupported source evidence',async()=>{
 const f=await ruleFixture(),run=await extractEvidenceUnit(f.api),rule=run.candidates[0];
 await assert.rejects(verifyRuleForApproval({...rule,citations:[...rule.citations,{...rule.citations[0],official_url:'https://wrong.test'}]},f.api));
});
test('a fresh analysis run cannot bypass another run\'s uncertain rule create',async()=>{
 const f=await ruleFixture({createRule:'missing'}),first=await extractEvidenceUnit(f.api);
 assert.equal((await importEvidenceCandidate({...f.api,runId:first.run_id,candidateIndex:0})).status,'import_uncertain');
 const second=await extractEvidenceUnit({...f.api,requestId:'manual-request-00000002'});
 assert.equal((await importEvidenceCandidate({...f.api,runId:second.run_id,candidateIndex:0})).status,'import_uncertain');
 assert.equal(f.calls.ruleCreates,1);
 f.lateRule();assert.equal((await importEvidenceCandidate({...f.api,runId:second.run_id,candidateIndex:0})).rules_created,0);
 assert.equal(f.calls.ruleCreates,1);
});
test('different completed runs sharing a literal candidate cannot create duplicate rules concurrently',async()=>{
 const f=await ruleFixture(),first=await extractEvidenceUnit(f.api),second=await extractEvidenceUnit({...f.api,requestId:'manual-request-00000002'});
 await Promise.allSettled([importEvidenceCandidate({...f.api,runId:first.run_id,candidateIndex:0,token:'one'}),
  importEvidenceCandidate({...f.api,runId:second.run_id,candidateIndex:0,token:'two'})]);
 assert.equal(f.calls.ruleCreates,1);assert.equal(f.rules.length,1);
});
test('legacy approval also requires explicit support for stored numeric values',async()=>{
 const f=await ruleFixture(),run=await extractEvidenceUnit(f.api),legacy={...run.candidates[0],evidence_validation:undefined};
 assert.equal((await verifyRuleForApproval(legacy,f.api)).length,1);
 await assert.rejects(verifyRuleForApproval({...legacy,numeric_value:999},f.api),/numeric fields/);
 await assert.rejects(verifyRuleForApproval({...legacy,numeric_literal:''},f.api),/numeric fields/);
});
test('timed-out manual LLM is counted once and never retried implicitly',async()=>{
 const f=await ruleFixture(),realTimeout=globalThis.setTimeout;
 f.api.invokeLlm=()=>{f.calls.llm++;return new Promise(()=>{});};
 globalThis.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms===60_000?1:ms,...args);
 try {
  const result=await extractEvidenceUnit(f.api);assert.equal(result.status,'llm_uncertain');assert.equal(result.llm_attempts,1);
  assert.equal((await extractEvidenceUnit(f.api)).llm_calls,0);assert.equal(f.calls.llm,1);
  f.advance();await assert.rejects(extractEvidenceUnit({...f.api,requestId:'manual-request-00000002'}),/Reconcile/);
 } finally {globalThis.setTimeout=realTimeout;}
});



test('administrative extraction rejects regulatory categories before staging, while retaining literal submission instructions',async()=>{
 for (const classification of ['application_form','checklist','fee_schedule','administrative_guidance']) {
  const f=await ruleFixture({source:{authority_classification:classification}}), unit=await loadRuleEvidence(f.api);
  await assert.rejects(prepareRuleCandidate(unit,f.raw),/administrative source purpose/);
  const raw={...f.raw,rule_category:classification==='fee_schedule'?'procedure':'submittal_requirement',excerpt:'Submit two drawings with the application.',requirement:'Submit two drawings with the application.',numeric_literal:''};
  const candidate=await prepareRuleCandidate(unit,raw);
  assert.equal(candidate.rule_kind,'administrative_instruction');assert.equal(candidate.is_operational,false);
  const batch=await validateRuleCandidates(unit,{rules:[f.raw,raw]});assert.equal(batch.candidates.length,1);assert.equal(batch.rejected.length,1);
 }
});


test('extraction readiness rejects missing or malformed archive identity before AI or writes',async()=>{
 for(const source of [{file_hash_sha256:''},{file_hash_sha256:'bad'},{file_bytes:0},{file_bytes:-1},{file_bytes:1.5},{archived_file_url:''},{archived_file_url:'javascript:alert(1)'},{archived_file_url:'https://user:secret@storage.test/file.pdf'}]){
  const f=await ruleFixture({source});
  await assert.rejects(extractEvidenceUnit(f.api),/retained archive/);
  assert.equal(f.calls.llm,0);assert.equal(f.runs.length,0);assert.equal(f.rules.length,0);
 }
});

test('omitted applicability stays unknown through staging and import; staff applicability edits are preserved',async()=>{
 const f=await ruleFixture();const staged=await extractEvidenceUnit(f.api);
 const applicability=staged.candidates[0].evidence_context.applicability;
 assert.equal(applicability.address_applicability,'requires_review');
 for(const field of Object.values(applicability.fields))assert.deepEqual(field,{status:'not_established_in_excerpt',literal:''});
 await importEvidenceCandidate({...f.api,runId:f.runs[0].id,candidateIndex:0});
 assert.deepEqual(f.rules[0].evidence_context.applicability,applicability);
 f.rules[0].evidence_context.applicability.address_applicability='all_addresses';
 assert.throws(()=>assertRuleApplicabilityEvidence(f.rules[0]),/Applicability evidence/);
 await assert.rejects(importEvidenceCandidate({...f.api,runId:f.runs[0].id,candidateIndex:0}),/staff edits/);
 assert.equal(f.rules[0].evidence_context.applicability.address_applicability,'all_addresses');
});
test('quoted applicability stays literal without granting address applicability; invented universal scope is rejected',async()=>{
 const f=await ruleFixture(),unit=await loadRuleEvidence(f.api);
 const raw={...f.raw,excerpt:f.text,sign_type:'Sign',trigger:'before installation',exceptions:''};
 const candidate=await prepareRuleCandidate(unit,raw);
 assert.deepEqual(candidate.evidence_context.applicability.fields.trigger,{status:'quoted',literal:'before installation'});
 assert.equal(candidate.evidence_context.applicability.address_applicability,'requires_review');
 assertRuleApplicabilityEvidence(candidate);
 await assert.rejects(prepareRuleCandidate(unit,{...raw,zoning_district_applicability:'all districts'}),/literal/);
 assertRuleApplicabilityEvidence({evidence_context:{}});
});

test('numeric substrings cannot silently change quoted amounts or units',async()=>{
 const f=await ruleFixture(),unit=await loadRuleEvidence(f.api);
 for(const [requirement,numeric_literal] of [
  ['Maximum area is 150 square feet.','50 square feet'],
  ['Maximum area is 1.50 square feet.','50 square feet'],
  ['Maximum fee is $150 dollars.','150 dollars'],
  ['Maximum area is 50 square feetwide.','50 square feet'],
  ['Maximum area is 1234,567 square feet.','1234,567 square feet'],
  ['Maximum area is -50 square feet.','50 square feet']]) {
  const selected=structuredClone(unit);selected.evidence.pages[0].text=requirement;
  await assert.rejects(prepareRuleCandidate(selected,{...f.raw,section_reference:'',excerpt:requirement,requirement,numeric_literal}),/Numeric/);
 }
 for(const numeric_literal of ['150 square feet','1,500 square feet','50 square feet']) {
  const requirement='Maximum area is '+numeric_literal+'.',selected=structuredClone(unit);selected.evidence.pages[0].text=requirement;
  const c=await prepareRuleCandidate(selected,{...f.raw,section_reference:'',excerpt:requirement,requirement,numeric_literal});
  assert.equal(c.numeric_value,Number(numeric_literal.split(' ')[0].replace(/,/g,'')));
 }
});
test('physical page identifiers must be positive integers',async()=>{
 const f=await ruleFixture(),unit=await loadRuleEvidence(f.api);
 for(const physical_page of ['1',0,-1,1.5,null])await assert.rejects(prepareRuleCandidate(unit,{...f.raw,physical_page}),/page or category/);
});
