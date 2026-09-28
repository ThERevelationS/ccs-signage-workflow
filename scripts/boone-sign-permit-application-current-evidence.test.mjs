import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-sign-permit-application-current-evidence-2026-09-28.json','utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html','utf8');

test('current Boone Sign Permit application preserves new source version without replacing the prior archive', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.listedLabel, 'Sign Permit');
  assert.match(applicationsHtml, /Applications\/SignPermit\.pdf[^>]*>[\s\S]*?Sign Permit/i);
  const current = readFileSync(evidence.repositoryPath);
  const prior = readFileSync(evidence.priorArchivedRepositoryPath);
  assert.equal(current.length, evidence.bytes);
  assert.equal(prior.length, evidence.priorArchivedBytes);
  assert.equal(current.subarray(0,5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(current).digest('hex'), evidence.sha256);
  assert.equal(createHash('sha256').update(prior).digest('hex'), evidence.priorArchivedSha256);
  assert.notEqual(evidence.sha256, evidence.priorArchivedSha256);
  assert.equal(evidence.sameAsPriorArchive, false);
  assert.match(evidence.evidenceScope, /both versions are retained rather than replacing history/i);
  assert.match(evidence.evidenceScope, /source-version change only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish that every instruction, requirement, fee, eligibility rule, jurisdiction boundary, submission workflow, approval path, or applicability statement/i);
});
