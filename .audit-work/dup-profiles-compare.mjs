import { readFileSync } from 'node:fs';
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const L = new Map(locs.map((l) => [l.id, l]));
const profs = [
  ...JSON.parse(readFileSync('.audit-work/mirrors/profiles-oh.json', 'utf8')).rows,
  ...JSON.parse(readFileSync('.audit-work/mirrors/profiles-ky.json', 'utf8')).rows,
];
const P = new Map(profs.map((p) => [p.id, p]));
const rep = JSON.parse(readFileSync('.audit-work/locality-identity-report.json', 'utf8'));
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
let diffGroups = 0, profIdentical = 0, profSameName = 0, profDiffName = 0;
const examples = [];
for (const [key, ids] of rep.identical) {
  const rows = ids.map((id) => L.get(id)).filter(Boolean);
  const pids = [...new Set(rows.map((r) => r.jurisdiction_profile_id || '').filter(Boolean))];
  if (pids.length < 2) continue;
  diffGroups++;
  const ps = pids.map((id) => P.get(id)).filter(Boolean);
  const names = new Set(ps.map((p) => n(p.name)));
  const types = new Set(ps.map((p) => n(p.type)));
  const counties = new Set(ps.map((p) => n(typeof p.parent_county === 'object' ? p.parent_county?.name : p.parent_county)));
  if (names.size === 1 && types.size === 1 && counties.size === 1) profIdentical++;
  else if (names.size === 1) profSameName++;
  else {
    profDiffName++;
    if (examples.length < 6) examples.push({ key, profiles: ps.map((p) => ({ id: p.id.slice(-6), name: p.name, type: p.type, county: typeof p.parent_county === 'object' ? p.parent_county?.name : p.parent_county, roles: (p.office_research?.roles || []).length })) });
  }
}
console.log({ diffGroups, profIdentical_nameTypeCounty: profIdentical, profSameName_diffMeta: profSameName, profDiffName: profDiffName });
console.log(JSON.stringify(examples, null, 1));
