import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-2026-zoning-rewrite-meetings-evidence-2026-10-03.json', 'utf8'));
const html = readFileSync(evidence.repositoryPath, 'utf8');
const bytes = readFileSync(evidence.repositoryPath);

test('Boone rewrite Meetings page does not promote draft rewrite to adopted authority', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.bytes, 10690);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(html, /hearings on the draft Zoning Regulations/i);
  assert.match(html, /April 29, 2026 at 6:00 pm/i);
  assert.match(html, /July 16, 2026/i);
  assert.equal(evidence.listedEvents.length, 2);
  assert.equal(evidence.laterAdoptionEntryPresent, false);
  assert.doesNotMatch(html, /September[^<]{0,100}(adopt|hearing)|October[^<]{0,100}(adopt|hearing)/i);
  assert.match(evidence.evidenceScope, /absence is evidence about this page only/i);
  assert.match(evidence.evidenceScope, /does not establish replacement authority/i);
});
