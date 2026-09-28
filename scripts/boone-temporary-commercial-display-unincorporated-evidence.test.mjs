import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-commercial-display-unincorporated-evidence-2026-09-28.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Planning Commission Temporary Commercial Display Unincorporated source has bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 193000);
  assert.equal(evidence.sha256, '3628f1b0702615d4fb0b39bf03bf2ee4a0cfacb307dc8c20c58a92fb673b2b16');
  assert.equal(evidence.listedLabel, 'Temporary Commercial Display (Unincorporated)');
  assert.match(applicationsHtml, /TCDBooneCounty\.pdf[^>]*>[\s\S]*?Temporary Commercial Display \(Unincorporated\)/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not independently establish which addresses, parcels, municipalities, businesses, projects, or display types qualify as unincorporated/i);
  assert.match(evidence.evidenceScope, /does not by itself establish every requirement, fee, eligibility rule, jurisdiction boundary, submission workflow, approval path, duration limit, or applicability/i);
});
