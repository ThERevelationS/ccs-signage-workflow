import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const path='docs/permitting-boone-ky-2026-rewrite-adoption-status-matrix-2026-10-03.json';
const m=JSON.parse(readFileSync(path,'utf8'));

test('Boone Planning Unit rewrite matrix fails closed per jurisdiction',()=>{
  assert.equal(m.planningUnitAggregateStatus,'not_promotable_across_planning_unit');
  assert.equal(m.promotionRule.scope,'per_jurisdiction');
  assert.equal(m.promotionRule.crossJurisdictionInferenceAllowed,false);
  assert.equal(m.promotionRule.planningCommissionRecommendationCountsAsAdoption,false);
  assert.equal(m.promotionRule.agendaSchedulingCountsAsAdoption,false);
  assert.equal(m.promotionRule.draftOrProjectSiteCountsAsAdoption,false);
  assert.equal(m.promotionRule.blankOrdinancePlaceholderCountsAsAdoption,false);
  assert.equal(m.promotionRule.narrowTextAmendmentCountsAsComprehensiveRewrite,false);
  assert.equal(m.promotionRule.defaultOnMissingOrConflictingEvidence,'retain_current_adopted_article34');
  assert.match(m.statusSemantics.not_verified,/must not be interpreted as proof that the fact is false/i);

  assert.deepEqual(
    m.jurisdictions.map(x=>x.id),
    ['boone_unincorporated','florence','union','walton']
  );
  assert.deepEqual(
    m.jurisdictions.map(x=>x.legislativeBody),
    ['Boone County Fiscal Court','Florence City Council','Union City Commission','Walton City Council']
  );

  for(const j of m.jurisdictions){
    assert.equal(j.adoptionStatus,'not_verified');
    assert.equal(j.effectiveDateStatus,'not_verified');
    assert.equal(j.rewriteAuthorityStatus,'not_promotable');
    assert.equal(j.scannerEligibleForPromotion,false);
    assert.match(j.fallbackAuthority,/Article 34/i);
    assert.ok(existsSync(j.evidenceFile),j.evidenceFile);
    const hash=createHash('sha256').update(readFileSync(j.evidenceFile)).digest('hex');
    assert.equal(hash,j.evidenceSha256);
  }

  for(const s of Object.values(m.sourceEvidence)){
    assert.ok(existsSync(s.path),s.path);
    const hash=createHash('sha256').update(readFileSync(s.path)).digest('hex');
    assert.equal(hash,s.sha256);
  }

  const boone=m.jurisdictions.find(x=>x.id==='boone_unincorporated');
  const florence=m.jurisdictions.find(x=>x.id==='florence');
  const union=m.jurisdictions.find(x=>x.id==='union');
  const walton=m.jurisdictions.find(x=>x.id==='walton');

  assert.equal(boone.checkedThrough.highestPostedOrdinance,'2026-15');
  assert.equal(florence.checkedThrough.highestReviewedOrdinance,'O-21-2026');
  assert.equal(union.checkedThrough.latestPostedAgendaStatus,'upcoming');
  assert.deepEqual(walton.checkedThrough.futureMeetingsKnown,['2026-10-06 caucus','2026-10-08 council']);

  assert.match(m.currentSignAuthority,/Article 34/i);
  assert.match(m.nextLogicalChunk,/scanner authority-gating contract/i);
});
