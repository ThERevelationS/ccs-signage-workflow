import { readFileSync, writeFileSync } from 'node:fs';
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const L = new Map(locs.map((l) => [l.id, l]));
const lines = JSON.parse(readFileSync('.audit-work/mirrors/permit-lines.json', 'utf8')).rows;
const rep = JSON.parse(readFileSync('.audit-work/locality-identity-report.json', 'utf8'));
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const verified = (r) => (r.offices || []).filter((o) => n(o.verification || o.status) === 'staff_verified' || n(o.verification) === 'verified').length;

// Winner: most offices → most verified offices → richest fields → oldest created
const richness = (r) => ['county_name', 'parent_county_name', 'jurisdiction_type', 'jurisdiction_profile_id', 'website', 'phone'].filter((k) => r[k]).length;
const score = (r) => [(r.offices || []).length, verified(r), richness(r)];
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (score(a)[i] !== score(b)[i]) return score(b)[i] - score(a)[i]; return String(a.created_date).localeCompare(String(b.created_date)); };

const plan = [];
for (const [key, ids] of rep.identical) {
  const rows = ids.map((id) => L.get(id)).filter(Boolean).sort(cmp);
  if (rows.length < 2) continue;
  const [winner, ...losers] = rows;
  plan.push({ key, winner: winner.id, winnerScore: score(winner), losers: losers.map((l) => l.id), loserProfiles: [...new Set(losers.map((l) => l.jurisdiction_profile_id).filter(Boolean))], sameProfile: new Set(rows.map((r) => r.jurisdiction_profile_id)).size === 1 });
}
const loserIds = new Set(plan.flatMap((p) => p.losers));
const lineRefs = lines.filter((l) => loserIds.has(l.locality_id));
console.log({ groups: plan.length, losers: loserIds.size, permitLineRefsToLosers: lineRefs.length, sameProfileGroups: plan.filter((p) => p.sameProfile).length });
console.log('sample:', JSON.stringify(plan.slice(0, 4), null, 1));
console.log('line refs:', lineRefs.map((l) => ({ line: l.id.slice(-6), locality: (l.locality_id || '').slice(-6), name: l.locality_name })));
writeFileSync('.audit-work/dup-consolidation-plan.json', JSON.stringify({ at: new Date().toISOString(), plan }, null, 1));
