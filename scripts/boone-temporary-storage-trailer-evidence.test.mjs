import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-storage-trailer-evidence-2026-09-29.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Temporary Storage Trailer source has bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 177582);
  assert.equal(evidence.sha256, '99f7a0307e9dac44365e98fa085553155361002c7b564a1c2992980917689dd3');
  assert.equal(evidence.listedLabel, 'Temporary Storage Trailer');
  assert.match(applicationsHtml, /Applications\/TST\.pdf[^>]*>[\s\S]*?Temporary Storage Trailer/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Temporary Storage Trailer application is required/i);
  assert.match(evidence.evidenceScope, /particular sign or permitting project/i);
});
