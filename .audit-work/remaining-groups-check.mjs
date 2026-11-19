import { readFileSync } from 'node:fs';
import { getMirror } from '../scripts/lib/entity-mirror.mjs';
const locs = getMirror('localities').rows;
const L = new Map(locs.map((l) => [l.id, l]));
const rep = JSON.parse(readFileSync('.audit-work/locality-identity-report.json', 'utf8'));
const planKeys = new Set(rep.identical.map(([k]) => k));
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const countyKey = (v) => String(v ?? '').split('/').map((p) => n(p).replace(/ county$/, '')).filter(Boolean).sort().join('/');
const live = locs.filter((l) => !String(l.duplicate_of || '').trim());
const groups = {};
for (const l of live) { const k = [n(l.name), n(l.state), n(l.jurisdiction_type), countyKey(l.county_name || l.parent_county_name)].join('|'); (groups[k] = groups[k] || []).push(l); }
const identical = Object.entries(groups).filter(([, r]) => r.length > 1);
let plannedPending = 0, unplanned = [];
for (const [k, rows] of identical) {
  if (planKeys.has(k)) plannedPending++;
  else unplanned.push({ k, rows: rows.map((r) => ({ id: r.id.slice(-6), created: (r.created_date || '').slice(0, 13), type: r.jurisdiction_type, county: r.county_name || r.parent_county_name })) });
}
console.log({ identicalNow: identical.length, fromOriginalPlan_pendingFold: plannedPending, NEW_unplanned: unplanned.length });
console.log(JSON.stringify(unplanned.slice(0, 12), null, 1));
