import { readFileSync } from 'node:fs';
import { getMirror } from '../scripts/lib/entity-mirror.mjs';
const locs = getMirror('localities').rows;
const queue = getMirror('queue').rows;
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const base = (v) => n(v).replace(/\s*\([^)]*\)\s*$/, '').replace(/^(city|village|town|township|county) of /, '').replace(/ (city|village|township|county)$/, '').trim();
const live = locs.filter((l) => !String(l.duplicate_of || '').trim());
const noCounty = live.filter((l) => !String(l.county_name || l.parent_county_name || '').trim());

// index queue rows by name|state → set of parent_county_name values
const byKey = new Map();
for (const q of queue) {
  const c = String(q.parent_county_name || '').trim();
  if (!c) continue;
  const k = `${base(q.jurisdiction_name)}|${n(q.state)}`;
  if (!byKey.has(k)) byKey.set(k, new Set());
  byKey.get(k).add(c);
}
let resolvableUnique = 0, ambiguous = 0, noQueueRow = 0;
const resList = [], ambList = [];
for (const l of noCounty) {
  const k = `${base(l.name)}|${n(l.state)}`;
  const cs = byKey.get(k);
  if (!cs || !cs.size) { noQueueRow++; continue; }
  if (cs.size === 1) { resolvableUnique++; resList.push(`${l.name}, ${l.state} → ${[...cs][0]}`); }
  else { ambiguous++; ambList.push(`${l.name}, ${l.state} → ${[...cs].join(' / ')}`); }
}
console.log({ noCounty: noCounty.length, resolvableUniqueCounty: resolvableUnique, ambiguousCounty: ambiguous, noQueueRow });
console.log('resolvable sample:', resList.slice(0, 15).join(' | '));
console.log('ambiguous:', ambList.slice(0, 15).join(' | '));
