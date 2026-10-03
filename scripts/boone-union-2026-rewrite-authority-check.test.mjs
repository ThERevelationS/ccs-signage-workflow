import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const e=JSON.parse(readFileSync('docs/permitting-boone-ky-union-2026-rewrite-authority-check-2026-10-03.json','utf8'));
test('Union latest posted agendas do not get misclassified as comprehensive zoning rewrite adoption',()=>{
 assert.equal(e.jurisdiction,'City of Union, Kentucky');
 assert.equal(e.legislativeBody,'Union City Commission');
 assert.equal(e.reviewedOfficialAgendas.length,3);
 for(const s of e.reviewedOfficialAgendas){
  const b=readFileSync(s.repositoryPath);
  assert.equal(b.length,s.bytes);
  assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);
  assert.equal(Object.values(s.targetTermCounts).reduce((a,b)=>a+b,0),0);
 }
 assert.equal(e.latestPostedAgenda.meetingDate,'2026-10-05');
 assert.equal(e.latestPostedAgenda.statusAsOfCheck,'upcoming');
 assert.equal(e.rewriteAdoptionAgendaItemFound,false);
 assert.equal(e.observedLegislation.ordinance,'2026-12');
 assert.match(e.observedLegislation.scope,/tax rates/i);
 assert.equal(e.observedLegislation.rewriteReplacement,false);
 assert.match(e.relatedButDistinctPlanningWork,/distinct from evidence of adoption/i);
 assert.match(e.authorityBoundary,/does not prove that no unposted ordinance/i);
 assert.match(e.adoptedSignAuthority,/Do not treat Union as having adopted/i);
});
