import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-final-plat-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Final Plat source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 96429);
  assert.equal(evidence.sha256, '29eef2919d174153bc5f4e663ee91a443203a2a5c88476f1f09430de2e6aa0ae');
  assert.equal(evidence.listedLabel, 'Final Plat');
  assert.match(applicationsHtml, /Applications\/FinalPlat\.pdf[^>]*>[\s\S]*?Final Plat/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Final Plat is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
