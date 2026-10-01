import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-uniform-wireless-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Uniform Wireless source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 141631);
  assert.equal(evidence.sha256, '7ea68d1eb70ab84766b0593c0125d1ac13600ce44dd8519b56521520496cbfce');
  assert.equal(evidence.listedLabel, 'Uniform Wireless');
  assert.match(applicationsHtml, /Applications\/UniformWireless\.pdf[^>]*>[\s\S]*?Uniform Wireless/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when the application is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
