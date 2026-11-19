#!/usr/bin/env node
// County fill — backfill PermitLocality.county_name for rows with no county,
// sourced from SourceCollectionQueue.parent_county_name. Guards: only rows
// whose queue rows name EXACTLY ONE normalized county get written (unique +
// same-county format variants); true multi-candidate rows go to a fix-list —
// could be a real multi-county municipality or two same-name jurisdictions,
// can't tell without profile data. Empty-field only, never overwrites.
// Usage: node .audit-work/county-fill-backfill.mjs [--apply]   (dry-run default)
import { writeFileSync } from 'node:fs';
import { getMirror, mirrorApply } from '../scripts/lib/entity-mirror.mjs';
import { enqueue as oqEnqueue } from '../scripts/lib/outbox.mjs';

const APPLY = process.argv.includes('--apply');
const locs = getMirror('localities').rows;
const queue = getMirror('queue').rows;
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const base = (v) => n(v).replace(/\s*\([^)]*\)\s*$/, '').replace(/^(city|village|town|township|county) of /, '').replace(/ (city|village|township|county)$/, '').trim();
const normCounty = (v) => n(v).replace(/ county$/, '');
const titleCase = (v) => String(v ?? '').trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => `Mc${c.toUpperCase()}`);
const countyLabel = (v) => `${titleCase(normCounty(v))} County`;

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
const writes = [], held = [];
for (const l of noCounty) {
  const cs = [...(byKey.get(`${base(l.name)}|${n(l.state)}`) || [])];
  if (!cs.length) continue;
  // split ' / '-joined candidates too — a queue row can itself carry a multi list
  const parts = [...new Set(cs.flatMap((c) => String(c).split('/')).map(normCounty).filter(Boolean))];
  if (parts.length === 1) writes.push({ id: l.id, name: l.name, state: l.state, county: countyLabel(parts[0]), from: cs });
  else held.push({ id: l.id, name: l.name, state: l.state, candidates: cs });
}
console.log(`no-county ${noCounty.length} · safe writes ${writes.length} · held multi ${held.length}`);
console.log('sample:', writes.slice(0, 6).map((w) => `${w.name}, ${w.state} → ${w.county}`).join(' | '));
console.log('held:', held.map((h) => `${h.name}, ${h.state} → ${h.candidates.join(' / ')}`).join(' | '));
writeFileSync('.audit-work/county-fill-report.json', JSON.stringify({ at: new Date().toISOString(), writes, held }, null, 1));
if (!APPLY) { console.log('dry run — pass --apply to enqueue'); process.exit(0); }
for (const w of writes) {
  oqEnqueue({ entity: 'PermitLocality', op: 'update', id: w.id, data: { county_name: w.county }, mirror: 'localities', note: `county fill from queue — ${w.name}, ${w.state} → ${w.county}` });
  mirrorApply('localities', { id: w.id, county_name: w.county });
}
console.log(`enqueued ${writes.length} county fills`);
