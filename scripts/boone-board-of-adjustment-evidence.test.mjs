import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-board-of-adjustment-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Board of Adjustment source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 103276);
  assert.equal(evidence.sha256, 'd68df6cbdf222712e3f31286491b36f4dae140df618727a8e6169930c76626dc');
  assert.equal(evidence.listedLabel, 'Board of Adjustment (BOA)');
  assert.match(applicationsHtml, /Applications\/BOA\.pdf[^>]*>[\s\S]*?Board of Adjustment \(BOA\)/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when Board of Adjustment review, a variance, an appeal, or another BOA action is required/i);
  assert.match(evidence.evidenceScope, /No BOA, variance, appeal, or sign-project requirement should be inferred/i);
});
