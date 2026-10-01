import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-conveyance-plat-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Conveyance Plat source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 148246);
  assert.equal(evidence.sha256, 'f059307b7640b6704a4b619dca4d79000acd9dd2133788b2c78e0e1a1cf22af2');
  assert.equal(evidence.listedLabel, 'Conveyance Plat');
  assert.match(applicationsHtml, /Applications\/ConveyancePlat\.pdf[^>]*>[\s\S]*?Conveyance Plat/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Conveyance Plat is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
