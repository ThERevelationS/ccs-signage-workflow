import { readFileSync } from 'node:fs';
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const countyKey = (v) => String(v ?? '').split('/').map((p) => n(p).replace(/ county$/, '')).filter(Boolean).sort().join('/');
const live = locs.filter((l) => !String(l.duplicate_of || '').trim());
const groups = {};
for (const l of live) {
  const k = [n(l.name), n(l.state), n(l.jurisdiction_type), countyKey(l.county_name || l.parent_county_name)].join('|');
  (groups[k] = groups[k] || []).push(l);
}
const identical = Object.entries(groups).filter(([, rows]) => rows.length > 1);
const stillNoCounty = live.filter((l) => !String(l.county_name || l.parent_county_name || '').trim());
console.log({ liveRows: live.length, tombstoned: locs.length - live.length, identicalGroupsRemaining: identical.length, noCounty: stillNoCounty.length });
if (identical.length) console.log('remaining:', identical.slice(0, 15).map(([k, r]) => `${k} (${r.length})`).join(' · '));
const ambiguous = stillNoCounty.filter((l) => live.filter((o) => o.id !== l.id && n(o.name) === n(l.name) && n(o.state) === n(l.state)).length > 0);
console.log('no-county rows that share name+state with another live row (still ambiguous in picker):', ambiguous.length, ambiguous.slice(0, 10).map((l) => `${l.name}, ${l.state}`).join(' · '));
