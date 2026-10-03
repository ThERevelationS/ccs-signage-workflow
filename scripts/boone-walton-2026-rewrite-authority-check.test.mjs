import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const e=JSON.parse(readFileSync('docs/permitting-boone-ky-walton-2026-rewrite-authority-check-2026-10-03.json','utf8'));

test('Walton rewrite authority remains jurisdiction-pending',()=>{
  assert.equal(e.jurisdiction,'City of Walton');
  assert.equal(e.legislativeBody,'Walton City Council');
  for(const s of Object.values(e.officialSources)){
    const b=readFileSync(s.repositoryPath);
    assert.equal(b.length,s.bytes);
    assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);
  }
  assert.deepEqual(e.reviewedSeptemberOrdinances.map(x=>x.number),['2026-11','2026-12','2026-15','2026-13','2026-14','2026-16']);
  assert.ok(e.reviewedSeptemberOrdinances.every(x=>x.rewriteReplacement===false));
  assert.equal(e.knownNarrowZoningAmendment.number,'2026-03');
  assert.equal(e.knownNarrowZoningAmendment.rewriteReplacement,false);
  assert.equal(e.knownNarrowZoningAmendment.signArticle34Replacement,false);
  assert.match(e.ordinanceIndexPlaceholderBoundary,/blank descriptions and blank download hrefs/i);
  assert.match(e.authorityFinding,/no reviewed legislative item establishes adoption/i);
  assert.match(e.authorityBoundary,/October 6 caucus and October 8 Council/i);
  assert.match(e.adoptedSignAuthority,/Continue using.*Article 34/i);
});
