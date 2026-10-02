import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-time-limit-waiver-45-days-source-gap-2026-10-02.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('Boone 45-Day Time Limit Waiver source gap is preserved without inventing a PDF archive', () => {
  assert.equal(evidence.listedLabel, 'Time Limit Waiver Request (45 Days)');
  assert.equal(evidence.archiveStatus, 'not_archived_source_unavailable');
  assert.equal(evidence.repositoryPath, null);
  assert.match(applicationsHtml, /Forms\/45DayWaiver\.pdf[^>]*>[\s\S]*?Time Limit Waiver Request \(45 Days\)/i);
  assert.equal(evidence.verificationAttempts.length, 2);
  for (const attempt of evidence.verificationAttempts) {
    assert.equal(attempt.httpStatus, 403);
    assert.equal(attempt.contentType, 'text/html');
  }
  assert.equal(existsSync('public/permitting/sources/boone-ky/time-limit-waiver-45-days-2026-10-02.pdf'), false);
  assert.match(evidence.evidenceScope, /no PDF archive, byte count, PDF hash, form contents/i);
  assert.match(evidence.evidenceScope, /source-availability gap only/i);
  assert.match(evidence.evidenceScope, /HTML denial responses are not archived as the form/i);
});
