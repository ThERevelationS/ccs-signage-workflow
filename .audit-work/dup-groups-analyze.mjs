import { readFileSync } from 'node:fs';
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const L = new Map(locs.map((l) => [l.id, l]));
const rep = JSON.parse(readFileSync('.audit-work/locality-identity-report.json', 'utf8'));
const stats = { groups: rep.identical.length, sameProfile: 0, diffProfile: 0, missingRows: 0, groupsWithOffices: 0, neitherHasOffices: 0 };
const diffExamples = [];
for (const [key, ids] of rep.identical) {
  const rows = ids.map((id) => L.get(id)).filter(Boolean);
  if (rows.length < 2) { stats.missingRows++; continue; }
  const profs = new Set(rows.map((r) => r.jurisdiction_profile_id || ''));
  if (profs.size === 1 && [...profs][0]) stats.sameProfile++;
  else if (profs.size > 1) {
    stats.diffProfile++;
    if (diffExamples.length < 8) diffExamples.push({ key, rows: rows.map((r) => ({ id: r.id.slice(-6), prof: (r.jurisdiction_profile_id || 'none').slice(-6), offices: (r.offices || []).length, dup_of: !!r.duplicate_of, created: (r.created_date || '').slice(0, 10) })) });
  }
  const withOff = rows.filter((r) => (r.offices || []).length > 0);
  if (withOff.length) stats.groupsWithOffices++; else stats.neitherHasOffices++;
}
console.log(JSON.stringify(stats, null, 1));
console.log('diff-profile examples:', JSON.stringify(diffExamples, null, 1));
