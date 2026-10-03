import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const e=JSON.parse(readFileSync('docs/permitting-boone-ky-planning-unit-legislative-authority-map-2026-10-03.json','utf8'));

test('Planning Unit adoption authority remains jurisdiction-specific',()=>{
  assert.deepEqual(e.planningUnitJurisdictions.map(x=>x.jurisdiction),['Unincorporated Boone County','City of Florence','City of Union','City of Walton']);
  assert.equal(e.planningUnitJurisdictions.find(x=>x.jurisdiction==='City of Florence').legislativeBody,'Florence City Council');
  assert.equal(e.planningUnitJurisdictions.find(x=>x.jurisdiction==='City of Union').legislativeBody,'Union City Commission');
  assert.equal(e.planningUnitJurisdictions.find(x=>x.jurisdiction==='City of Walton').legislativeBody,'Walton City Council');
  for(const s of Object.values(e.officialSources)){
    const b=readFileSync(s.repositoryPath);
    assert.equal(b.length,s.bytes);
    assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);
  }
  const florence=readFileSync(e.officialSources.florence.repositoryPath,'utf8');
  const union=readFileSync(e.officialSources.union.repositoryPath,'utf8');
  const wm=readFileSync(e.officialSources.waltonMinutes.repositoryPath,'utf8');
  const wo=readFileSync(e.officialSources.waltonOrdinances.repositoryPath,'utf8');
  assert.match(florence,/Council Meeting Agendas &amp; Minutes/i);
  assert.match(florence,/City Ordinances/i);
  assert.match(union,/2026 MEETING AGENDAS/i);
  assert.match(union,/Official records are retained at the City Building/i);
  assert.match(wm,/City Council Minutes/i);
  assert.match(wo,/Ordinance 2026-03/i);
  assert.match(wo,/BOONE COUNTY ZONING REGULATIONS/i);
  const article=readFileSync(e.jurisdictionBasis.article34RepositoryPath,'utf8');
  for(const term of ['City of Florence','City of Union','City of Walton','Unincorporated Boone County']) assert.ok(article.includes(term));
  assert.match(e.authorityBoundary,/Fiscal Court action alone must not be generalized/i);
  assert.match(e.authorityBoundary,/does not claim.*adopted the 2026 comprehensive rewrite/i);
});
