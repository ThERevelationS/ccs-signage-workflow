import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-map-amendment-checklist-evidence-2026-10-02.json', 'utf8'));
const html = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Zoning Map Amendment checklist has bounded source identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 224612);
  assert.equal(evidence.sha256, '178a3866f8c92a5cd65796c2209bb9a9937b3d7ba3e96e5a6bcf3dd29879803c');
  assert.match(html, /Checklists\/ZoningMapAmendment_checklist\.pdf[^>]*>[\s\S]*?Zoning Map Amendment/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current checklist source identity and current listing only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish when a zoning map amendment is required/i);
});
