import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-rewrite-adoption-records-archive-2026-10-03.json', 'utf8'));
const index = readFileSync(evidence.indexRepositoryPath, 'utf8');

test('Boone late-2026 Planning Commission adoption records are archived without inventing an adoption conclusion', () => {
  assert.equal(evidence.indexHttpStatus, 200);
  assert.match(index, /October 7, 2026 Business Meeting/i);
  assert.match(index, /October 7, 2026 Public Hearing/i);
  assert.match(index, /September 16, 2026 Business Meeting/i);
  assert.match(index, /September 2, 2026 Business Meeting/i);
  assert.match(index, /September 2, 2026 Public Hearings/i);
  assert.equal(evidence.records.length, 7);

  for (const record of evidence.records) {
    assert.ok(existsSync(record.repositoryPath), record.repositoryPath);
    const bytes = readFileSync(record.repositoryPath);
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
  }

  assert.equal(evidence.indexAvailability.october7BusinessMinutesLinked, false);
  assert.equal(evidence.indexAvailability.october7PublicHearingMinutesLinked, false);
  assert.equal(evidence.indexAvailability.september16BusinessMinutesLinked, false);
  assert.equal(evidence.indexAvailability.september2BusinessMinutesLinked, true);
  assert.equal(evidence.indexAvailability.september2PublicHearingMinutesLinked, true);
  assert.equal(evidence.contentReviewStatus, 'pending_reliable_pdf_text_or_visual_review');
  assert.match(evidence.evidenceScope, /does not claim that the records do or do not contain zoning-rewrite adoption action/i);
  assert.match(evidence.adoptedSignAuthority, /Continue using.*adopted.*Article 34/i);
});
