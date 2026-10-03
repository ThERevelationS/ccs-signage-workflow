import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const review = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-rewrite-oct07-agendas-content-review-2026-10-03.json', 'utf8'));
const archive = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-rewrite-adoption-records-archive-2026-10-03.json', 'utf8'));

test('Oct 7 Business/Public Hearing agendas preserve a bounded no-rewrite-adoption-item finding', () => {
  assert.equal(review.records.length, 2);
  for (const record of review.records) {
    assert.equal(record.rewriteAdoptionActionFound, false);
    assert.ok(existsSync(record.sourcePath));
    assert.ok(existsSync(record.extractedTextPath));
    const bytes = readFileSync(record.sourcePath);
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    for (const count of Object.values(record.reviewTerms)) assert.equal(count, 0);
  }

  const business = review.records.find((r) => r.id === 'oct07_business_agenda');
  const hearing = review.records.find((r) => r.id === 'oct07_public_hearing_agenda');
  assert.ok(business && hearing);

  const businessText = readFileSync(business.extractedTextPath, 'utf8');
  const hearingText = readFileSync(hearing.extractedTextPath, 'utf8');

  assert.match(businessText, /Conditional Use Permit for an Electronic Message[\s\S]{0,80}Board\/Screen/i);
  assert.match(businessText, /Long Range Planning\/Comprehensive Plan/i);
  assert.match(hearingText, /CHANGE OF CONCEPT DEVELOPMENT PLAN/i);
  assert.match(hearingText, /modification of the previously approved[\s\S]{0,80}development sign/i);

  assert.equal(archive.contentReviewStatus, 'available_sep02_sep16_oct07_records_reviewed_no_rewrite_adoption_item_found');
  assert.equal(archive.octoberReviewEvidencePath, 'docs/permitting-boone-ky-zoning-rewrite-oct07-agendas-content-review-2026-10-03.json');
  assert.deepEqual(archive.reviewedRecordIds, [
    'sep02_business_minutes',
    'sep16_business_annotated_agenda',
    'oct07_business_agenda',
    'oct07_public_hearing_agenda'
  ]);
  assert.match(review.remainingAuthorityReview, /October 7, 2026 Business Meeting and Public Hearing minutes were not linked/i);
  assert.match(review.authorityBoundary, /bounded finding about the agendas only/i);
  assert.match(review.adoptedSignAuthority, /Continue using.*adopted.*Article 34/i);
});
