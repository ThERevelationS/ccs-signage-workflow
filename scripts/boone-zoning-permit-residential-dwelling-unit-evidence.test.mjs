import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-permit-residential-dwelling-unit-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Zoning Permit Residential Dwelling Unit source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 516035);
  assert.equal(evidence.sha256, 'ff8f3fb26e177f894e8c75d845b1b2e9de8b11fbed317a4156339b5e4d7bb51e');
  assert.equal(evidence.listedLabel, 'Zoning Permit (Residential Dwelling Unit)');
  assert.match(applicationsHtml, /Applications\/ZoningPermitRes\.pdf[^>]*>[\s\S]*?Zoning Permit \(Residential Dwelling Unit\)/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a residential dwelling zoning permit is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
