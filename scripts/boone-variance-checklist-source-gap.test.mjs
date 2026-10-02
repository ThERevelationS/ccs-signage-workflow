import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-variance-checklist-source-gap-2026-10-02.json', 'utf8'));
const html = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('Boone Variance checklist source gap is preserved without inventing a PDF archive', () => {
  assert.equal(evidence.listedLabel, 'Variance (BOA)');
  assert.equal(evidence.archiveStatus, 'not_archived_source_unavailable');
  assert.equal(evidence.repositoryPath, null);
  assert.match(html, /Checklists\/Variance_checklist\.pdf[^>]*>[\s\S]*?Variance \(BOA\)/i);
  assert.equal(evidence.verificationAttempts.length, 2);
  for (const attempt of evidence.verificationAttempts) assert.equal(attempt.httpStatus, 403);
  assert.equal(evidence.verificationAttempts[1].contentType, 'text/html');
  assert.equal(evidence.verificationAttempts[1].bytes, 118);
  assert.equal(existsSync('public/permitting/sources/boone-ky/variance-checklist-2026-10-02.pdf'), false);
  assert.match(evidence.evidenceScope, /no PDF archive, PDF byte count, PDF hash, checklist contents/i);
  assert.match(evidence.evidenceScope, /source-availability gap only/i);
  assert.match(evidence.evidenceScope, /HTML denial response is not archived as the checklist/i);
});
