import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-public-records-request-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Public Records Request form is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 172221);
  assert.equal(evidence.sha256, '3104a1a2c7abd25916ee0f9431cd26b9696d430110a7801bd97ae103af5bb1d5');
  assert.equal(evidence.listedLabel, 'Public Records Request');
  assert.match(applicationsHtml, /Forms\/PublicRecordsRequest\.pdf[^>]*>[\s\S]*?Public Records Request/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish that a public-records request is part of a normal permit application/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement or routine permitting workflow step should be inferred/i);
});
