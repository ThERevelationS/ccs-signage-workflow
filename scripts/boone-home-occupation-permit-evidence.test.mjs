import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-home-occupation-permit-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Home Occupation Permit source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 192711);
  assert.equal(evidence.sha256, '56a2ddf660a15b5240753e45bb362ecd8e9700d058caa35b7b84648b1512beea');
  assert.equal(evidence.listedLabel, 'Home Occupation Permit');
  assert.match(applicationsHtml, /Applications\/HomeOccupation\.pdf[^>]*>[\s\S]*?Home Occupation Permit/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Home Occupation Permit is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
