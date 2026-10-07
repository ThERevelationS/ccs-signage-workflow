import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewHandoutClassification} from './preview-cincinnati-handout-classification.mjs';
import {sourceSupportsRule,reviewedAdministrativeSource} from '../base44/shared/permittingSourceAuthorityPolicy.mjs';
const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/publisher-review/';
const source=JSON.parse(readFileSync(root+'source-classification-before.json','utf8')),manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
test('classification cannot establish current guidance or approved law and preserves source',()=>{
 const before=structuredClone(source),proposal=previewHandoutClassification(source,manifest),after={...source,...proposal.fields};
 assert.deepEqual(source,before);assert.equal(after.authority_classification,'administrative_guidance');
 assert.equal(reviewedAdministrativeSource(after),false);
 assert.equal(sourceSupportsRule(after,{rule_kind:'administrative_instruction',rule_category:'procedure'}),false);
 assert.equal(sourceSupportsRule(after,{rule_kind:'regulatory_rule'}),false);
 assert.equal(after.verification_status,'needs_verification');assert.equal(after.content_status,'unknown');
});
test('replaced bytes, reviewed source, active analysis or stale identity blocks classification',()=>{
 for(const change of [
  s=>s.id='other',s=>s.file_hash_sha256='b'.repeat(64),s=>s.authority_review={status:'active'},
  s=>s.rule_extraction_state={status:'running'},s=>s.updated_date='',s=>s.verification_status='verified']){
  const s=structuredClone(source);change(s);assert.throws(()=>previewHandoutClassification(s,manifest));
 }
 const m=structuredClone(manifest);m.sources.find(s=>s.matches_retained_archive).matches_retained_archive=false;
 assert.throws(()=>previewHandoutClassification(source,m));
});
