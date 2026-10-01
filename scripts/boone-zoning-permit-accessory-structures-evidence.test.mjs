import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-permit-accessory-structures-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Zoning Permit Accessory Structures source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 461820);
  assert.equal(evidence.sha256, 'f1b89a5a00e77d21971c84c8cae7655ff306efcc8cf35c10bdbb2d94da7a93d9');
  assert.equal(evidence.listedLabel, 'Zoning Permit (Accessory Structures)');
  assert.match(applicationsHtml, /Applications\/ZoningPermitAcc\.pdf[^>]*>[\s\S]*?Zoning Permit \(Accessory Structures\)/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when an accessory-structure zoning permit is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
