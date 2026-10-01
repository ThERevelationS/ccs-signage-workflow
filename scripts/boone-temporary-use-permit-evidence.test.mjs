import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-use-permit-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Temporary Use Permit source has bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 177522);
  assert.equal(evidence.sha256, '26c0583a93b72019c49fc27dd57f9d4640953218a8f89a7f0109392400122721');
  assert.equal(evidence.listedLabel, 'Temporary Use Permit');
  assert.match(applicationsHtml, /Applications\/TempUsePermit\.pdf[^>]*>[\s\S]*?Temporary Use Permit/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Temporary Use Permit is required/i);
  assert.match(evidence.evidenceScope, /particular permitting project/i);
});
