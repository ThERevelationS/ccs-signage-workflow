import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const e = JSON.parse(readFileSync('docs/permitting-boone-ky-enacted-ordinances-authority-boundary-2026-10-03.json','utf8'));
const bytes = readFileSync(e.repositoryPath);
const html = bytes.toString('utf8');

test('official enacted ordinances distinguish prior targeted amendments from the 2026 comprehensive rewrite', () => {
  assert.equal(bytes.length, e.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), e.sha256);
  assert.equal(e.highestListed2026Ordinance, '2026-15');
  assert.equal(e.highestListed2026PostedDate, '2026-09-23');
  assert.ok(e.listed2026OrdinanceLinks.some((x) => x.ordinance === '2026-01'));
  assert.ok(e.listed2026OrdinanceLinks.some((x) => x.ordinance === '2026-02'));
  assert.ok(e.listed2026OrdinanceLinks.some((x) => x.ordinance === '2026-15'));
  assert.ok(html.includes('2026-01 Truck Parking Text Amendment.pdf'));
  assert.ok(html.includes('2026-02 Mfg Home Text Admendment.pdf'));
  assert.equal(e.relevantPriorTextAmendments.length, 2);
  for (const amendment of e.relevantPriorTextAmendments) {
    assert.equal(amendment.comprehensiveRewrite, false);
    assert.equal(amendment.article34Replacement, false);
  }
  assert.equal(e.comprehensive2026ZoningRewriteEnactmentFound, false);
  assert.equal(e.article34ReplacementEnactmentFound, false);
  assert.ok(e.authorityBoundary.includes('targeted zoning text amendments'));
  assert.ok(e.authorityBoundary.includes('no listed enactment identifying Article 34 sign-rule replacement'));
  assert.ok(e.adoptedSignAuthority.includes('Article 34'));
});
