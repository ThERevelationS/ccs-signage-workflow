import { readFileSync } from 'node:fs';
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const L = new Map(locs.map((l) => [l.id, l]));
const plan = JSON.parse(readFileSync('.audit-work/dup-consolidation-plan.json', 'utf8')).plan;
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const offKey = (o) => [n(o.name || o.office_name || o.title), n(o.role || o.office_type || o.type)].join('|');
let identical = 0, winnerMissingOffices = 0, loserOnlyOffices = 0, losersWithPendingApplies = 0, losersWithOtherFields = [];
const ex = [];
for (const p of plan) {
  const w = L.get(p.winner);
  for (const lid of p.losers) {
    const l = L.get(lid);
    if (!l) continue;
    const wk = new Set((w.offices || []).map(offKey));
    const extra = (l.offices || []).filter((o) => !wk.has(offKey(o)));
    if (!extra.length) identical++; else { loserOnlyOffices += extra.length; winnerMissingOffices++; if (ex.length < 5) ex.push({ key: p.key, loser: lid.slice(-6), extra: extra.map((o) => offKey(o)) }); }
    if ((l.pending_applies || []).length) losersWithPendingApplies++;
    const other = ['notes', 'research_notes', 'source_urls', 'lookup_notes'].filter((f) => l[f] && !w[f]);
    if (other.length) losersWithOtherFields.push({ key: p.key, fields: other });
  }
}
console.log({ losersFullyCoveredByWinner: identical, losersWithUniqueOffices: winnerMissingOffices, uniqueLoserOfficesTotal: loserOnlyOffices, losersWithPendingApplies, losersWithUniqueFields: losersWithOtherFields.length });
console.log(JSON.stringify(ex, null, 1));
console.log('field examples:', losersWithOtherFields.slice(0, 8));
