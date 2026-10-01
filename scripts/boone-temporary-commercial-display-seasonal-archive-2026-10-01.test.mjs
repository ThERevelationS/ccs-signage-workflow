import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const fresh = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-commercial-display-seasonal-evidence-2026-10-01.json', 'utf8'));
const prior = JSON.parse(readFileSync('docs/permitting-boone-ky-temporary-commercial-display-seasonal-evidence-2026-09-28.json', 'utf8'));
const html = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('seasonal Temporary Commercial Display archive closes the prior source-evidence gap', () => {
  assert.equal(fresh.listedLabel, 'Temporary Commercial Display (Seasonal)');
  assert.equal(fresh.httpStatus, 200);
  assert.equal(fresh.contentType, 'application/pdf');
  assert.equal(fresh.bytes, 170116);
  assert.equal(fresh.sha256, 'ae3be76260c5be717b63bb4fa510fa381d58246815b3f79cd9a941a4b4b0b255');
  assert.equal(prior.sha256, fresh.sha256);
  assert.equal(prior.bytes, fresh.bytes);
  assert.match(html, /Applications\/TCDSeasonal\.pdf[^>]*>[\s\S]*?Temporary Commercial Display \(Seasonal\)/i);
  const bytes = readFileSync(fresh.repositoryPath);
  assert.equal(bytes.length, fresh.bytes);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fresh.sha256);
  assert.match(fresh.evidenceScope, /current source identity and category availability only/i);
  assert.match(fresh.evidenceScope, /does not by itself establish when this application is required/i);
});
