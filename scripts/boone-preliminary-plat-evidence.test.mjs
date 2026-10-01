import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-preliminary-plat-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Preliminary Plat source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 111218);
  assert.equal(evidence.sha256, 'd202dee95cd274a676b247cf2fb6d4e860c6e0e6a1f8e222c58a7acd8057c231');
  assert.equal(evidence.listedLabel, 'Preliminary Plat');
  assert.match(applicationsHtml, /Applications\/PreliminaryPlat\.pdf[^>]*>[\s\S]*?Preliminary Plat/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Preliminary Plat is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
