import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-surface-mining-special-use-permit-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Surface Mining Special Use Permit source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 125633);
  assert.equal(evidence.sha256, 'bab7b4e367f3adfcc7449d0cd102694dc44f09f574a99a17eeca3b2e09007412');
  assert.equal(evidence.listedLabel, 'Surface Mining Special Use Permit');
  assert.match(applicationsHtml, /Applications\/SurfaceMining\.pdf[^>]*>[\s\S]*?Surface Mining Special Use Permit/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Surface Mining Special Use Permit is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
