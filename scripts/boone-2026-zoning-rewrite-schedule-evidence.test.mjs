import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-2026-zoning-rewrite-schedule-evidence-2026-10-02.json', 'utf8'));
const bytes = readFileSync(evidence.repositoryPath);
const html = bytes.toString('utf8');

test('Boone 2026 rewrite schedule remains proposed process evidence, not adopted replacement authority', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(bytes.length, 11646);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  assert.match(html, /Click to view the 2026 ZO draft text/i);
  assert.match(html, /current version of the zoning regulations was adopted in late 2022\/early 2023/i);
  assert.match(html, /overall project is anticipated to be adopted in late 2026/i);
  assert.match(html, /Proposed text will be shared on this website allowing for public comment/i);
  assert.match(html, /September 2026 - October 2026:[\s\S]*Adoption process including public hearing and action before the Planning Commission/i);
  assert.match(html, /October 2026 - December 2026:[\s\S]*Adoption by the legislative bodies/i);
  assert.equal(evidence.authorityBoundary, 'proposed_rewrite_adoption_process_not_replacement_authority');
  assert.match(evidence.evidenceScope, /not proof that final adoption has occurred/i);
  assert.match(evidence.evidenceScope, /No rewrite provision may replace, override, or silently modify/i);
});
