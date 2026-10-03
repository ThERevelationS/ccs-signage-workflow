import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-planning-home-fee-schedule-evidence-2026-10-02.json', 'utf8'));
const homepage = readFileSync(evidence.sourcePage, 'utf8');

test('Boone Planning Commission homepage Fee Schedule reuses identical archived 2021 source without promoting fees to current', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 281297);
  assert.equal(evidence.sha256, '9ed3230d1997a8086a6d9c598aaa0ea34c955b524707ffd58070aea68eb9e49a');
  assert.equal(evidence.matchesExistingArchive, true);
  assert.equal(evidence.archiveAction, 'reused_existing_identical_archive');
  assert.match(homepage, /Documents\/About%20us\/FeeSchedule\.pdf[^>]*>[\s\S]*?Fee Schedule/i);

  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);

  assert.match(evidence.documentRevisionEvidence, /May 19, 2021/i);
  assert.match(evidence.evidenceScope, /current homepage listing and current source-file identity only/i);
  assert.match(evidence.evidenceScope, /does not establish that any individual fee amount.*remains current in 2026/i);
});
