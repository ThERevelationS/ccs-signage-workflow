import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const review = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-rewrite-sep02-sep16-content-review-2026-10-03.json', 'utf8'));
const archive = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-rewrite-adoption-records-archive-2026-10-03.json', 'utf8'));

test('Sep 2 minutes and Sep 16 annotated agenda preserve a bounded no-rewrite-action finding', () => {
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

  const sep2 = review.records.find((r) => r.id === 'sep02_business_minutes');
  const sep16 = review.records.find((r) => r.id === 'sep16_business_annotated_agenda');
  assert.ok(sep2 && sep16);

  const sep2Text = readFileSync(sep2.extractedTextPath, 'utf8');
  const sep16Text = readFileSync(sep16.extractedTextPath, 'utf8');
  assert.match(sep2Text, /Long-Range Planning\/Comprehensive Plan[\s\S]{0,120}No Report/i);
  assert.match(sep2Text, /2045 Comprehensive Plan[\s\S]{0,80}adopted February 2026/i);
  assert.match(sep2Text, /NEW BUSINESS:[\s\S]{0,350}October 7, 2026/i);
  assert.match(sep16Text, /September 2, 2026 - Business Meeting & Public Hearings\s*[–-]\s*APPROVED/i);
  assert.match(sep16Text, /Cooper Steel[\s\S]{0,180}APPROVED UNANIMOUSLY/i);

  assert.equal(archive.contentReviewStatus, 'partial_review_complete_sep02_minutes_sep16_annotated_agenda');
  assert.equal(archive.reviewEvidencePath, 'docs/permitting-boone-ky-zoning-rewrite-sep02-sep16-content-review-2026-10-03.json');
  assert.deepEqual(archive.reviewedRecordIds, ['sep02_business_minutes', 'sep16_business_annotated_agenda']);
  assert.match(review.authorityBoundary, /bounded finding about these two records only/i);
  assert.match(review.adoptedSignAuthority, /Continue using.*adopted.*Article 34/i);
});
