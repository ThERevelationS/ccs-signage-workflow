import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-tenant-finish-evidence-2026-10-01.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Boone Tenant Finish source is archived with bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 93516);
  assert.equal(evidence.sha256, 'f3201126e030d73fdf3da59c6f6c0176d0f637547202599732b4d164ddd7b552');
  assert.equal(evidence.listedLabel, 'Tenant Finish');
  assert.match(applicationsHtml, /Applications\/TenantFinish\.pdf[^>]*>[\s\S]*?Tenant Finish/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a Tenant Finish application is required/i);
  assert.match(evidence.evidenceScope, /No sign-project requirement should be inferred/i);
});
