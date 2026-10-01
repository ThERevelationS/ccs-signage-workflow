import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-certificate-of-appropriateness-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Certificate of Appropriateness source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 96854);
  assert.equal(evidence.sha256, 'f8d3a644ba6c7555788bbaa3b607119168ae2f775cc2f29781b1d455fef167b7');
  assert.equal(evidence.listedLabel, 'Certificate of Appropriateness');
  assert.match(applicationsHtml, /Applications\/CertAppropriateness\.pdf[^>]*>[\s\S]*?Certificate of Appropriateness/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Certificate of Appropriateness, historic review, architectural review, or design approval is required/i);
  assert.match(evidence.evidenceScope, /No historic\/design-review or sign-project requirement should be inferred/i);
});
