import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-grading-plan-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Grading Plan source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 141814);
  assert.equal(evidence.sha256, 'ddc43c66da95643167dd1510a2b296ca3c3a0fe1f91dc76ddf06c4f4b3adc3a9');
  assert.equal(evidence.listedLabel, 'Grading Plan');
  assert.match(applicationsHtml, /Applications\/GradingPlan\.pdf[^>]*>[\s\S]*?Grading Plan/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Grading Plan is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
