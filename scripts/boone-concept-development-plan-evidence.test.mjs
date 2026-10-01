import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-concept-development-plan-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Concept Development Plan source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 134126);
  assert.equal(evidence.sha256, '2be3723444528ff920c1138c084951aa7354ed7496f571fbc93cdac64e2520d9');
  assert.equal(evidence.listedLabel, 'Concept Development Plan');
  assert.match(applicationsHtml, /Applications\/CDP\.pdf[^>]*>[\s\S]*?Concept Development Plan/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Concept Development Plan is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
