import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-conditional-use-permit-checklist-evidence-2026-10-02.json', 'utf8'));
const html = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Conditional Use Permit checklist has bounded source identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 102649);
  assert.equal(evidence.sha256, 'd2dd9e55aad6283a1496b4147b814143f6005c8a79ca3d14f71388976911778b');
  assert.match(html, /ConditionalUsePermit_checklist\.pdf/i);
  assert.match(html, /Conditional\s+use\s+Permit\s+\(BOA\)/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current checklist source identity and current listing only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish that every checklist instruction, requirement, fee, jurisdiction rule, submission workflow, hearing procedure, approval path, or applicability statement remains current/i);
});
