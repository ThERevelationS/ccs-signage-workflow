import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditCincinnatiElectricalReview} from './audit-cincinnati-electrical-review.mjs';
const fixture=JSON.parse(readFileSync('docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/electrical-review-readiness-snapshot.json','utf8'));
test('live archive registration and all retained page hashes pass without duplicate upload',()=>{
 const before=structuredClone(fixture),result=auditCincinnatiElectricalReview(fixture);
 assert.equal(result.archive_registered,true);assert.equal(result.extraction_integrity_verified,true);
 assert.equal(result.duplicate_upload_needed,false);assert.deepEqual(fixture,before);
});
test('unreviewed source and office, or contact-only text, cannot approve either role',()=>{
 const result=auditCincinnatiElectricalReview(fixture);
 assert.equal(result.source_scope_review_passes,false);assert.equal(result.office_identity_status,'needs_verification');
 for(const role of Object.values(result.roles)){
  assert.equal(role.retained_quote_matches,true);assert.equal(role.existing_role_gate_accepts,false);
  assert.equal(role.ready_for_approval,false);
 }
 assert.equal(result.authority_verified,false);
 assert.equal(result.publisher_responsible_office_separation_required,true);
});
test('archive replacement, wrong locality, text tampering and incomplete extraction are detected',()=>{
 for(const mutate of [
  s=>s.document.stored_sha256='0'.repeat(64),s=>s.profile.id='other',s=>s.source.archived_file_url='https://example.com/replacement.pdf']){
  const s=structuredClone(fixture);mutate(s);assert.equal(auditCincinnatiElectricalReview(s).archive_registered,false);
 }
 for(const mutate of [s=>s.source.extracted_pages[1].text+='altered',s=>s.source.extracted_pages[1].needs_ocr_review=true,
  s=>s.source.text_extraction_state.complete_document_text=false]){
  const s=structuredClone(fixture);mutate(s);assert.equal(auditCincinnatiElectricalReview(s).extraction_integrity_verified,false);
 }
});
