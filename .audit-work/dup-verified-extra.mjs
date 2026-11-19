import { readFileSync } from 'node:fs';
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const L = new Map(locs.map((l) => [l.id, l]));
const plan = JSON.parse(readFileSync('.audit-work/dup-consolidation-plan.json', 'utf8')).plan;
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const offKey = (o) => [n(o.name || o.office_name || o.title), n(o.role || o.office_type || o.type)].join('|');
const isVer = (o) => /verified/i.test(String(o.verification || o.status || o.verified_by || '')) && !/unverif|not_verif|needs/.test(String(o.verification || ''));
let uniqueTotal = 0, uniqueVerified = 0, groupsNeedingMerge = 0;
const ex = [];
for (const p of plan) {
  const w = L.get(p.winner);
  const wk = new Set((w.offices || []).map(offKey));
  for (const lid of p.losers) {
    const l = L.get(lid);
    if (!l) continue;
    const extra = (l.offices || []).filter((o) => !wk.has(offKey(o)));
    uniqueTotal += extra.length;
    const ver = extra.filter(isVer);
    uniqueVerified += ver.length;
    if (ver.length) { groupsNeedingMerge++; if (ex.length < 6) ex.push({ key: p.key, ver: ver.map((o) => `${o.name || o.office_name}|${o.role || o.office_type}|${o.verification}`) }); }
  }
}
console.log({ uniqueLoserOffices: uniqueTotal, uniqueVerified, groupsWithLoserUniqueVerified: groupsNeedingMerge });
console.log(JSON.stringify(ex, null, 1));
