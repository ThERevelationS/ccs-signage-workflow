import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-2026-zoning-update-status-evidence-2026-10-02.json', 'utf8'));
const homepage = readFileSync(evidence.linkedFrom, 'utf8');

test('Boone 2026 zoning rewrite remains separated from adopted Article 34 authority', () => {
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.bytes, 43562);
  assert.match(homepage, /August 07, 2026[\s\S]*2026 Zoning Update[\s\S]*_T18_R30\.php/i);
  assert.equal(evidence.rewriteUrl, 'https://online.encodeplus.com/regs/boonecounty-ky-rewrite/');
  assert.match(evidence.countyStatusText, /2026 Zoning Ordinance Update has begun/i);
  assert.equal(evidence.authorityBoundary, 'update_in_progress_not_adoption_evidence');
  assert.match(evidence.evidenceScope, /does not state that the rewrite has been adopted, enacted, or made effective/i);
  assert.match(evidence.evidenceScope, /must not replace, override, or silently modify.*adopted Article 34/i);
  assert.match(evidence.adoptedSignAuthority, /adopted Boone County Zoning Regulations Article 34 remains the sign-regulation authority/i);
});
