import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-map-amendment-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Zoning Map Amendment source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 121133);
  assert.equal(evidence.sha256, '78a0fd401145d17aaf133db6a08b72dcb2313b35b7dd1ddc806727f040b37757');
  assert.equal(evidence.listedLabel, 'Zoning Map Amendment');
  assert.match(applicationsHtml, /Applications\/ZMA\.pdf[^>]*>[\s\S]*?Zoning Map Amendment/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a zoning map amendment is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
