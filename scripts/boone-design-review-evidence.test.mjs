import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-design-review-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Design Review source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 145988);
  assert.equal(evidence.sha256, 'c8ebf0386a4ed903f9a498c9ba990d03098d1fc2fae433cbe415371c22bc9654');
  assert.equal(evidence.listedLabel, 'Design Review');
  assert.match(applicationsHtml, /Applications\/DesignReview\.pdf[^>]*>[\s\S]*?Design Review/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when Design Review is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
