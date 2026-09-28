import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-advertising-display-evidence-2026-09-28.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Planning Commission Temporary Advertising Display source is archived with identity-only evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.listedLabel, 'Temporary Advertising Display');
  assert.match(applicationsHtml, /href="Documents\/Applications Forms\/Applications\/TAD\.pdf"[^>]*>[\s\S]*?Temporary Advertising Display/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish every requirement, fee, eligibility rule, jurisdiction boundary, submission workflow, approval path, or applicability/i);
});
