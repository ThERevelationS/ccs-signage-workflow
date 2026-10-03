import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRewriteSourceAuthority,
  gateResearchRegulatoryPromotion,
  isComprehensiveRewriteResearch,
} from '../base44/shared/jurisdictionResearchAuthorityGate.mjs';

const regulatoryUpdate = {
  permit_requirements: { max_height_ft: 99 },
  sqft_width_height_rules: 'candidate dimensions',
  documents: [{ title: 'source retained', url: 'https://official.example/source.pdf' }],
};

test('deterministic source classifier catches rewrite signals when model says current adopted', () => {
  const cases = [
    { documents: [{ title: '2026 ZO Draft Text', url: 'https://official.example/2026-zo-draft.pdf' }] },
    { sources: [{ name: 'Proposed Zoning Regulations', url: 'https://official.example/proposal' }] },
    { official_sources: [{ title: 'Comprehensive Zoning Ordinance Rewrite', url: 'https://official.example/rewrite' }] },
    { source_documents: [{ label: 'Replacement Sign Code', source_url: 'https://official.example/signs' }] },
  ];
  for (const sourceData of cases) {
    const data = { authority_candidate: { is_comprehensive_rewrite: false, kind: 'current_adopted' }, ...sourceData };
    const classified = classifyRewriteSourceAuthority(data);
    assert.equal(classified.isComprehensiveRewrite, true);
    assert.ok(classified.matchedSignals.length > 0);
    assert.equal(isComprehensiveRewriteResearch(data), true);
    const gated = gateResearchRegulatoryPromotion({ jurisdiction: { id: 'boone' }, researchData: data, updateData: regulatoryUpdate });
    assert.equal(gated.blocked, true);
    assert.equal(Object.hasOwn(gated.updateData, 'permit_requirements'), false);
    assert.deepEqual(gated.updateData.documents, regulatoryUpdate.documents);
  }
});

test('generic adopted/current zoning sources do not false-positive as rewrites', () => {
  const cases = [
    { documents: [{ title: 'Boone County Zoning Regulations Article 34 Signs', url: 'https://official.example/article34.pdf' }] },
    { sources: [{ title: 'Current Sign Ordinance', url: 'https://official.example/code/signs' }] },
    { documents: [{ title: 'Zoning Regulations', description: 'Adopted regulations currently in force' }] },
    { authority_candidate: { kind: 'narrow_amendment' }, documents: [{ title: 'Manufactured Home Text Amendment' }] },
  ];
  for (const data of cases) {
    assert.equal(classifyRewriteSourceAuthority(data).isComprehensiveRewrite, false);
    assert.equal(isComprehensiveRewriteResearch(data), false);
  }
});

test('model rewrite flag still fails closed when documents are absent', () => {
  const data = { authority_candidate: { kind: 'zoning_rewrite', is_comprehensive_rewrite: true } };
  assert.equal(classifyRewriteSourceAuthority(data).isComprehensiveRewrite, false);
  assert.equal(isComprehensiveRewriteResearch(data), true);
});
