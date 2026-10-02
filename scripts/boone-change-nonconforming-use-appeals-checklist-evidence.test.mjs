import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-change-nonconforming-use-appeals-checklist-evidence-2026-10-02.json', 'utf8'));
const html = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Change of Non-Conforming Use & Appeals checklist has bounded source identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 100511);
  assert.equal(evidence.sha256, '28a67406a9556617b1a711957093c321ff43520c517afbee3c7690dca0bbbe63');
  assert.match(html, /ChangeNonConformingandAppeals_checklist\.pdf/i);
  assert.match(html, /Change of Non-Conforming Use & Appeals \(BOA\)|Change of Nonconforming Use and Appeals \(BOA\)/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current checklist source identity and current listing only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish that every checklist instruction, requirement, fee, jurisdiction rule, submission workflow, appeal procedure, approval path, or applicability statement remains current/i);
});
