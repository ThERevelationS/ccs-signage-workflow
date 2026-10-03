import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessStoredRewriteAuthority,
  gateResearchRegulatoryPromotion,
  isComprehensiveRewriteResearch,
} from '../base44/shared/jurisdictionResearchAuthorityGate.mjs';

const regulatoryUpdate = {
  permit_requirements: { max_height_ft: 99 },
  sqft_width_height_rules: 'rewrite dimensions',
  height_allowances: 'rewrite height',
  setback_rules: 'rewrite setback',
  lighting_allowances: 'rewrite lighting',
  documents: [{ title: '2026 rewrite', url: 'https://official.example/rewrite.pdf' }],
  contact_info: { department: 'Planning' },
  last_updated: '2026-10-03T18:00:00.000Z',
};

test('comprehensive rewrite research cannot promote regulatory fields without stored verified authority', () => {
  const jurisdiction = { id: 'union', name: 'City of Union' };
  const researchData = { authority_candidate: { is_comprehensive_rewrite: true, kind: 'comprehensive_rewrite' } };
  const result = gateResearchRegulatoryPromotion({ jurisdiction, researchData, updateData: regulatoryUpdate });

  assert.equal(isComprehensiveRewriteResearch(researchData), true);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.reasons, ['missing_authority_evidence']);
  for (const field of ['permit_requirements','sqft_width_height_rules','height_allowances','setback_rules','lighting_allowances']) {
    assert.equal(Object.hasOwn(result.updateData, field), false, field);
  }
  assert.deepEqual(result.updateData.documents, regulatoryUpdate.documents);
  assert.deepEqual(result.updateData.contact_info, regulatoryUpdate.contact_info);
  assert.equal(result.updateData.last_updated, regulatoryUpdate.last_updated);
});

test('rewrite promotion requires verified adoption and effectiveness for the same stored jurisdiction', () => {
  const base = {
    id: 'union',
    name: 'City of Union',
    rewrite_authority: {
      jurisdictionId: 'union',
      adoptionStatus: 'verified',
      effectiveDateStatus: 'not_verified',
    },
  };
  assert.deepEqual(assessStoredRewriteAuthority(base), {
    promotable: false,
    reasons: ['effective_date_not_verified'],
  });

  const mismatch = assessStoredRewriteAuthority({
    ...base,
    rewrite_authority: { ...base.rewrite_authority, jurisdictionId: 'florence', effectiveDateStatus: 'verified' },
  });
  assert.deepEqual(mismatch, { promotable: false, reasons: ['jurisdiction_mismatch'] });

  const verified = {
    ...base,
    rewrite_authority: { ...base.rewrite_authority, effectiveDateStatus: 'verified' },
  };
  const allowed = gateResearchRegulatoryPromotion({
    jurisdiction: verified,
    researchData: { authority_candidate: { kind: 'zoning_rewrite' } },
    updateData: regulatoryUpdate,
  });
  assert.equal(allowed.blocked, false);
  assert.deepEqual(allowed.updateData.permit_requirements, regulatoryUpdate.permit_requirements);
});

test('ordinary current-law research is unchanged by the rewrite gate', () => {
  const result = gateResearchRegulatoryPromotion({
    jurisdiction: { id: 'boone', name: 'Boone County' },
    researchData: { authority_candidate: { is_comprehensive_rewrite: false, kind: 'current_adopted' } },
    updateData: regulatoryUpdate,
  });
  assert.equal(result.blocked, false);
  assert.deepEqual(result.updateData, regulatoryUpdate);
});
