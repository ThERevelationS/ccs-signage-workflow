import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPublisherProvenance,loadPublisherEvidence} from './audit-cincinnati-publisher-provenance.mjs';
test('retained Cincinnati publication trail is supported without approval or alias claims',()=>{
 const result=auditPublisherProvenance(loadPublisherEvidence());
 assert.deepEqual(result.errors,[]);assert.equal(result.status,'publication_chain_supported');
 assert.equal(result.conclusions.exact_alias_mapping_established,false);
 assert.equal(result.conclusions.source_currentness_approved,false);
 assert.equal(result.conclusions.office_authority_approved,false);
 assert.equal(result.conclusions.http_redirect_verified,false);
});
for(const [name,mutate] of [
 ['modified handout',x=>x.pdf=Buffer.concat([x.pdf,Buffer.from('changed')])],
 ['modified official index',x=>x.index=Buffer.from(x.index.toString().replaceAll('signs-informational-handout','other-handout'))],
 ['changed office archive',x=>x.identityHtml=Buffer.from('replacement')],
 ['wrong source jurisdiction',x=>x.source.jurisdiction_id='other'],
 ['unclear publisher extraction',x=>x.source.extracted_pages[0].needs_ocr_review=true],
 ['replaced printed quote',x=>x.reconciliation.source_publisher_quote.excerpt='Invented Department'],
 ['cross-host link',x=>x.reconciliation.current_official_index_link='https://other.test/buildings/signs-informational-handout/']
])test('rejects '+name,()=>{const x=loadPublisherEvidence();mutate(x);const result=auditPublisherProvenance(x);assert.equal(result.status,'evidence_inconsistent');assert.ok(result.errors.length);assert.equal(result.conclusions.retained_publication_chain_verified,false);});
