import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const decision = JSON.parse(readFileSync('docs/permitting-boone-ky-sign-permit-drawing-copy-corroboration-2026-09-28.json','utf8'));
const change = JSON.parse(readFileSync(decision.currentApplicationEvidence,'utf8'));
const checklist = JSON.parse(readFileSync(decision.currentChecklistEvidence,'utf8'));

test('one-copy drawing count remains non-authoritative until independently corroborated', () => {
  const candidate = change.comparison.substantiveChangeCandidates.find(x => x.field === 'submitted_drawing_copy_count');
  assert.ok(candidate);
  assert.equal(candidate.status, 'current_form_change_candidate_requires_corroboration');
  assert.equal(decision.decision, 'not_yet_corroborated');
  assert.match(checklist.evidenceScope, /current checklist source identity and current listing only/i);
  assert.match(checklist.evidenceScope, /does not by itself establish that every checklist instruction, requirement/i);
  assert.match(decision.reason, /does not independently establish or corroborate the submitted-drawing copy count/i);
  assert.match(decision.useRule, /Do not promote one copy into automated authoritative permit requirements/i);
});
