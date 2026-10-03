import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRewriteAuthorityPromotion,
  assertRewriteAuthorityPromotable,
  REWRITE_AUTHORITY_BLOCK_REASONS,
} from '../src/components/permitting/jurisdictionAuthorityGate.js';

const candidate = { jurisdictionId: 'union', title: '2026 zoning rewrite' };
const verified = { id: 'union', jurisdiction: 'City of Union', adoptionStatus: 'verified', effectiveDateStatus: 'verified' };

test('rewrite authority gate requires adoption and effectiveness for the same jurisdiction', () => {
  assert.deepEqual(assessRewriteAuthorityPromotion({ candidate, authority: verified }), {
    promotable: true, reasons: [], authorityMode: 'verified_rewrite',
  });

  const pending = assessRewriteAuthorityPromotion({
    candidate,
    authority: { ...verified, adoptionStatus: 'not_verified', effectiveDateStatus: 'not_verified' },
  });
  assert.equal(pending.promotable, false);
  assert.deepEqual(pending.reasons, [
    REWRITE_AUTHORITY_BLOCK_REASONS.ADOPTION_NOT_VERIFIED,
    REWRITE_AUTHORITY_BLOCK_REASONS.EFFECTIVE_DATE_NOT_VERIFIED,
  ]);
  assert.equal(pending.authorityMode, 'retain_current_adopted_authority');

  const crossJurisdiction = assessRewriteAuthorityPromotion({
    candidate,
    authority: { ...verified, id: 'florence', jurisdiction: 'City of Florence' },
  });
  assert.equal(crossJurisdiction.promotable, false);
  assert.deepEqual(crossJurisdiction.reasons, [REWRITE_AUTHORITY_BLOCK_REASONS.JURISDICTION_MISMATCH]);

  const missing = assessRewriteAuthorityPromotion({ candidate });
  assert.equal(missing.promotable, false);
  assert.deepEqual(missing.reasons, [REWRITE_AUTHORITY_BLOCK_REASONS.MISSING_JURISDICTION]);

  assert.throws(
    () => assertRewriteAuthorityPromotable({ candidate, authority: { ...verified, effectiveDateStatus: 'not_verified' } }),
    /Retain the currently adopted jurisdiction-specific authority/i
  );
});

test('name fallback is exact after normalization and never permits cross-jurisdiction inference', () => {
  const byName = assessRewriteAuthorityPromotion({
    candidate: { jurisdiction: ' City of Walton ' },
    authority: { jurisdiction: 'city of walton', adoptionStatus: 'VERIFIED', effectiveDateStatus: 'verified' },
  });
  assert.equal(byName.promotable, true);

  const otherCity = assessRewriteAuthorityPromotion({
    candidate: { jurisdiction: 'City of Walton' },
    authority: { jurisdiction: 'City of Florence', adoptionStatus: 'verified', effectiveDateStatus: 'verified' },
  });
  assert.equal(otherCity.promotable, false);
  assert.deepEqual(otherCity.reasons, [REWRITE_AUTHORITY_BLOCK_REASONS.JURISDICTION_MISMATCH]);
});
