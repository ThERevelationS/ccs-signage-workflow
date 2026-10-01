import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-site-plan-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Site Plan application is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 129492);
  assert.equal(evidence.sha256, 'c08b314c71f5d9a8c6f3bb32b6fb166400d3692246c58fe341d76e7617e3c9cf');
  assert.equal(evidence.listedLabel, 'Site Plan');
  assert.match(applicationsHtml, /Applications\/SitePlan\.pdf[^>]*>[\s\S]*?Site Plan/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Site Plan is required/i);
  assert.match(evidence.evidenceScope, /Extension of Time of Site Plan form is not this application/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
