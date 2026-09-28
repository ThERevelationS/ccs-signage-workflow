import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-sign-permit-checklist-evidence-2026-09-28.json', 'utf8'));
const html = readFileSync('public/permitting/sources/boone-ky/planning-applications-forms-page-2026-09-28.html', 'utf8');

test('current Planning Commission Sign Permit checklist has bounded source identity evidence', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.contentType, 'application/pdf');
  assert.equal(evidence.bytes, 46354);
  assert.equal(evidence.sha256, '58275e6fca4ad7ad67491544e50c8bfe0d9465d6c12de3cee5f69014cbfe8880');
  assert.match(html, /SignPermit_checklist\.pdf[^>]*>[\s\S]*?Sign Permit/i);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(evidence.evidenceScope, /current checklist source identity and current listing only/i);
  assert.match(evidence.evidenceScope, /does not by itself establish that every checklist instruction, requirement, fee, jurisdiction rule, submission workflow, approval path, or applicability statement remains current/i);
});
