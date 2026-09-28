import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-commercial-display-seasonal-evidence-2026-09-28.json', 'utf8'));
const applicationsHtml = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Planning Commission Temporary Commercial Display Seasonal source has bounded identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 170116);
  assert.equal(evidence.sha256, 'ae3be76260c5be717b63bb4fa510fa381d58246815b3f79cd9a941a4b4b0b255');
  assert.equal(evidence.listedLabel, 'Temporary Commercial Display (Seasonal)');
  assert.match(applicationsHtml, /TCDSeasonal\.pdf[^>]*>[\s\S]*?Temporary Commercial Display \(Seasonal\)/i);
  assert.match(evidence.evidenceScope, /current source identity and category availability only/i);
  assert.match(evidence.evidenceScope, /does not independently establish what dates, businesses, municipalities, addresses, projects, or display types qualify as seasonal/i);
  assert.match(evidence.evidenceScope, /does not by itself establish every requirement, fee, eligibility rule, jurisdiction boundary, submission workflow, approval path, duration limit, or applicability/i);
});
