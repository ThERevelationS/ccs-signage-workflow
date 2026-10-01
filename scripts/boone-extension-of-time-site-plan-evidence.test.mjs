import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-extension-of-time-site-plan-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Extension of Time of Site Plan form is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 93415);
  assert.equal(evidence.sha256, '8558506db64c6e5c124ecf0db8baddb7fb105f96db8b747553e2afc5ff5c2476');
  assert.equal(evidence.listedLabel, 'Extension of Time of Site Plan');
  assert.match(applicationsHtml, /Forms\/ExtSitePlan\.pdf[^>]*>[\s\S]*?Extension of Time of Site Plan/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /separate form from the Site Plan application/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when an extension may be requested or granted/i);
  assert.match(evidence.evidenceScope, /No extension availability, entitlement, or sign-project requirement should be inferred/i);
});
