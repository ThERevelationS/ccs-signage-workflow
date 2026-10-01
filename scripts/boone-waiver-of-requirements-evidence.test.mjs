import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-waiver-of-requirements-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Waiver of Requirements source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 97026);
  assert.equal(evidence.sha256, '9f85eff75d8f8f37c365c8298902b91339b0f67f317d214f2a1e73978035f268');
  assert.equal(evidence.listedLabel, 'Waiver of Requirements');
  assert.match(applicationsHtml, /Applications\/WaiverofRequirements\.pdf[^>]*>[\s\S]*?Waiver of Requirements/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish which requirements may be waived/i);
  assert.match(evidence.evidenceScope, /No waiver availability or sign-project exception should be inferred/i);
});
