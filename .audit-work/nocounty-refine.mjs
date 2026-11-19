import { getMirror } from '../scripts/lib/entity-mirror.mjs';
const locs = getMirror('localities').rows;
const queue = getMirror('queue').rows;
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const base = (v) => n(v).replace(/\s*\([^)]*\)\s*$/, '').replace(/^(city|village|town|township|county) of /, '').replace(/ (city|village|township|county)$/, '').trim();
const normCounty = (v) => n(v).replace(/ county$/, '');
const live = locs.filter((l) => !String(l.duplicate_of || '').trim());
const noCounty = live.filter((l) => !String(l.county_name || l.parent_county_name || '').trim());

const byKey = new Map();
for (const q of queue) {
  const c = String(q.parent_county_name || '').trim();
  if (!c) continue;
  const k = `${base(q.jurisdiction_name)}|${n(q.state)}`;
  if (!byKey.has(k)) byKey.set(k, new Set());
  byKey.get(k).add(c);
}
const buckets = { unique: [], formatVariant: [], trueMulti: [] };
for (const l of noCounty) {
  const cs = [...(byKey.get(`${base(l.name)}|${n(l.state)}`) || [])];
  if (!cs.length) continue;
  const norm = [...new Set(cs.map(normCounty))];
  if (norm.length === 1) buckets.unique.push({ l, county: cs[0] });
  else if (cs.length === norm.length) buckets.trueMulti.push({ l, counties: cs });
  else buckets.formatVariant.push({ l, county: norm[0], raw: cs });
}
console.log({ noCounty: noCounty.length, unique: buckets.unique.length, formatVariant: buckets.formatVariant.length, trueMulti: buckets.trueMulti.length });
console.log('trueMulti sample:', buckets.trueMulti.slice(0, 20).map((x) => `${x.l.name}, ${x.l.state} → ${x.counties.join(' / ')}`).join(' | '));
