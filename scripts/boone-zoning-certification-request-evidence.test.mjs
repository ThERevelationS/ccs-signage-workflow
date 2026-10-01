import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-certification-request-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Zoning Certification Request source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 134750);
  assert.equal(evidence.sha256, '8f58ae495fe838e9779470bc6174164ad2b1f31d7975e951d6e9aa733ca28ef0');
  assert.equal(evidence.listedLabel, 'Zoning Certification Request');
  assert.match(applicationsHtml, /Applications\/ZoningCertRequest\.pdf[^>]*>[\s\S]*?Zoning Certification Request/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a zoning certification request is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
