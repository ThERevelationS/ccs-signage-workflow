#!/usr/bin/env node
// Backfill PermitLocality.county_name + jurisdiction_type from the locality's OWN linked
// JurisdictionProfile (jurisdiction_profile_id). No name-based inference — never-merge rule.
// Guards: profile must exist, same state, same base name (city/village/township suffix and
// "City of"/"Village of" prefixes ignored). Existing values are never overwritten; a disagreement
// is reported as a conflict instead. Writes go through the outbox (flusher drains them).
// Usage: node .audit-work/locality-identity-backfill.mjs [--apply]   (dry-run by default)
import { readFileSync, writeFileSync } from 'node:fs';
import { permitCreds } from '../scripts/lib/permit-creds.mjs';
import { enqueue } from '../scripts/lib/outbox.mjs';
import { mirrorApply } from '../scripts/lib/entity-mirror.mjs';

const APPLY = process.argv.includes('--apply');
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const TYPES = new Set(['county', 'city', 'village', 'township', 'municipality', 'unincorporated_community']);
const s = (v) => String(v ?? '').trim();
const n = (v) => s(v).toLowerCase().replace(/\s+/g, ' ');
const baseName = (v) => n(v).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+—\s.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^(city|village|town|township) of /, '').replace(/ (city|village|township|county)$/, '').trim();
const titleCase = (v) => s(v).toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => `Mc${c.toUpperCase()}`);
const countyLabel = (part) => { const t = titleCase(s(part).replace(/\s+county$/i, '')); return t ? `${t} County` : ''; };
const normalizeCounty = (raw) => s(raw).split('/').map(countyLabel).filter(Boolean).join(' / ');
const countyKey = (v) => s(v).split('/').map((p) => n(p).replace(/ county$/, '')).filter(Boolean).sort().join('/');

const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json());
if (!login?.token) throw new Error('login failed');
const readAll = async (entity) => {
  const out = [];
  for (let skip = 0; ; skip += 5000) {
    const j = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: login.token, entity, limit: 5000, skip }) }).then((r) => r.json());
    if (!Array.isArray(j?.items)) throw new Error(`${entity} read failed: ${JSON.stringify(j).slice(0, 200)}`);
    out.push(...j.items);
    if (j.items.length < 5000) return out;
  }
};

const localities = await readAll('PermitLocality');
const profiles = [
  ...JSON.parse(readFileSync('.audit-work/mirrors/profiles-oh.json', 'utf8')).rows,
  ...JSON.parse(readFileSync('.audit-work/mirrors/profiles-ky.json', 'utf8')).rows,
];
const P = new Map(profiles.map((p) => [p.id, p]));

const stats = {}; const bump = (k) => (stats[k] = (stats[k] || 0) + 1);
const writes = [], conflicts = [], skipped = [];
for (const loc of localities) {
  if (s(loc.duplicate_of)) { bump('skip — tombstoned'); continue; }
  const p = P.get(s(loc.jurisdiction_profile_id));
  if (!p) { bump(s(loc.jurisdiction_profile_id) ? 'skip — profile not in mirror' : 'skip — no profile link'); skipped.push({ id: loc.id, name: loc.name, state: loc.state, why: 'no linked profile' }); continue; }
  if (n(p.state) !== n(loc.state)) { bump('skip — profile state mismatch'); skipped.push({ id: loc.id, name: loc.name, state: loc.state, why: `profile ${p.name} is ${p.state}` }); continue; }
  if (baseName(p.name) !== baseName(loc.name)) { bump('skip — profile name mismatch'); skipped.push({ id: loc.id, name: loc.name, state: loc.state, why: `profile name "${p.name}"` }); continue; }

  const type = TYPES.has(n(p.type)) ? n(p.type) : '';
  let county = normalizeCounty(p.parent_county?.name || (typeof p.parent_county === 'string' ? p.parent_county : ''));
  if (!county && type === 'county') county = countyLabel(p.name);

  const data = {};
  const haveCounty = s(loc.county_name || loc.parent_county_name);
  if (county) {
    if (!haveCounty) data.county_name = county;
    else if (countyKey(haveCounty) !== countyKey(county)) { bump('conflict — county'); conflicts.push({ id: loc.id, name: loc.name, state: loc.state, field: 'county_name', current: haveCounty, profile: county }); }
    else if (!s(loc.county_name)) data.county_name = haveCounty;
  } else if (!haveCounty) { bump('no county available (profile has none)'); skipped.push({ id: loc.id, name: loc.name, state: loc.state, why: 'profile has no parent_county' }); }
  if (type) {
    if (!s(loc.jurisdiction_type)) data.jurisdiction_type = type;
    else if (n(loc.jurisdiction_type) !== type) { bump('conflict — type'); conflicts.push({ id: loc.id, name: loc.name, state: loc.state, field: 'jurisdiction_type', current: loc.jurisdiction_type, profile: type }); }
  }
  if (!Object.keys(data).length) { bump('nothing to write'); continue; }
  if (data.county_name) bump('write county_name'); if (data.jurisdiction_type) bump('write jurisdiction_type');
  writes.push({ id: loc.id, name: loc.name, state: loc.state, data });
}

// After backfill: same name + state + type + county groups that would still look identical in the picker.
const after = new Map(localities.map((l) => [l.id, { ...l, ...(writes.find((w) => w.id === l.id)?.data || {}) }]));
const groups = {};
for (const l of after.values()) { if (s(l.duplicate_of)) continue; const k = [n(l.name), n(l.state), n(l.jurisdiction_type), countyKey(l.county_name || l.parent_county_name)].join('|'); (groups[k] = groups[k] || []).push(l.id); }
const identical = Object.entries(groups).filter(([, ids]) => ids.length > 1);
const stillNoCounty = [...after.values()].filter((l) => !s(l.duplicate_of) && !s(l.county_name || l.parent_county_name)).length;

console.log(`live localities ${localities.length}`); console.log(stats);
console.log(`writes ${writes.length} · conflicts ${conflicts.length} · still no county after backfill ${stillNoCounty} · identical-looking groups after backfill ${identical.length}`);
const multi = writes.filter((w) => String(w.data.county_name || '').includes('/'));
console.log('multi-county:', multi.map((w) => `${w.name} (${w.state}) → ${w.data.county_name}`).join(' | '));
console.log('sample writes:', writes.slice(0, 6).map((w) => `${w.name} ${w.state} → ${JSON.stringify(w.data)}`).join('\n  '));
writeFileSync('.audit-work/locality-identity-report.json', JSON.stringify({ at: new Date().toISOString(), stats, writes, conflicts, skipped, identical }, null, 1));
console.log('report → .audit-work/locality-identity-report.json');
if (!APPLY) { console.log('dry run — pass --apply to enqueue'); process.exit(0); }
for (const w of writes) {
  enqueue({ entity: 'PermitLocality', op: 'update', id: w.id, data: w.data, mirror: 'localities', priority: 1, note: `identity backfill — ${w.name}, ${w.state}` });
  mirrorApply('localities', { id: w.id, ...w.data });
}
console.log(`enqueued ${writes.length} PermitLocality updates`);
