#!/usr/bin/env node
// MP-6.4/9.1 — Parcel GIS + auditor endpoint discovery. Guessing county
// ArcGIS hosts doesn't work (every county hosts differently), so this probes
// each county profile's own website for the conventional service paths and
// records VERIFIED endpoints to .audit-work/county-gis.json — the table the
// parcel resolver reads via its COUNTY_GIS registry hook.
//
//   node scripts/permitting-parcel-discover.mjs [--slice i --slices n] [--once]
import { openSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { getMirror } from './lib/entity-mirror.mjs';

const args = process.argv.slice(2);
const SLICE = Number(args[args.indexOf('--slice') + 1] || 0);
const SLICES = Number(args[args.indexOf('--slices') + 1] || 1);
const ONCE = args.includes('--once');
const EVENTS = '.live-events.jsonl';
const OUT = '.audit-work/county-gis.json';
const CLAIMS = '.audit-work/county-gis-claims.json';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `gis-${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const table = () => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return {}; } };
const save = (t) => writeFileSync(OUT, JSON.stringify(t, null, 1));
const claims = () => { try { return JSON.parse(readFileSync(CLAIMS, 'utf8')); } catch { return {}; } };
const saveClaims = (c) => writeFileSync(CLAIMS, JSON.stringify(c, null, 1));

const sliceOf = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997; return h % SLICES; };

// Probe a base URL for an ArcGIS REST services catalog that answers JSON.
async function probeArcgis(origin) {
  const paths = [
    '/arcgis/rest/services?f=json',
    '/arcgis/rest/services/Parcel/MapServer?f=json',
    '/server/rest/services?f=json',
    '/ArcGIS/rest/services?f=json',
  ];
  for (const p of paths) {
    try {
      const r = await fetch(origin + p, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      if (j && (j.services || j.layers || j.currentVersion)) return { base: origin + p.replace(/\?f=json$/, ''), services: (j.services || []).slice(0, 30).map((s) => s.name) };
    } catch {}
  }
  return null;
}

async function main() {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  const counties = profiles.filter((p) => /county/i.test(String(p.type || p.jurisdiction_type || '')) || / county$/i.test(p.name));
  const cl = claims();
  const mine = counties.filter((c) => sliceOf(c.id || c.name) === SLICE && !cl[c.id]);
  emit({ stage: 'gis_boot', ok: true, start: true, detail: `${mine.length} counties to probe for ArcGIS/parcel endpoints` });
  const t = table();
  for (const c of mine) {
    const site = c.website_url || c.office_research?.website_url;
    const countySlug = c.name.toLowerCase().replace(/\s+county\s*/i, '').replace(/[^a-z0-9]/g, '');
    const st = String(c.state).toLowerCase();
    // Candidate hosts: the county's own site, its gis/maps/auditor subdomain
    // variants, and the common auditor-site patterns (counties host GIS off
    // the main domain more often than on it).
    const origins = [];
    try { if (site) origins.push(new URL(site).origin); } catch {}
    for (const h of [
      `https://gis.${countySlug}county${st}.gov`, `https://maps.${countySlug}county${st}.gov`,
      `https://gis.${countySlug}ohio.gov`, `https://gis.${countySlug}-oh.gov`,
      `https://auditor.${countySlug}county${st}.gov`, `https://${countySlug}countyauditor.${st === 'oh' ? 'org' : 'gov'}`,
      `https://www.${countySlug}countyauditor.${st === 'oh' ? 'org' : 'gov'}`,
      `https://www.${countySlug}county${st}.gov`,
    ]) origins.push(h);
    let hit = null;
    for (const o of origins) { hit = await probeArcgis(o); if (hit) break; }
    const origin = origins[0] || 'no-site';
    const key = `${String(c.state).toLowerCase()}|${c.name.toLowerCase().replace(/\s*county$/i, '').trim()}`;
    if (hit) {
      t[key] = { county: c.name, state: c.state, base: hit.base, services: hit.services, verified_at: new Date().toISOString() };
      save(t);
      emit({ stage: 'gis_found', address: `${c.name}, ${c.state}`, ok: true, detail: `${hit.base} — ${hit.services.length} services` });
      cl[c.id] = { result: 'found', at: Date.now() };
    } else {
      emit({ stage: 'gis_miss', address: `${c.name}, ${c.state}`, ok: false, detail: `no ArcGIS catalog across ${origins.length} candidate hosts` });
      cl[c.id] = { result: 'miss', at: Date.now() };
    }
    saveClaims(cl);
    await sleep(1500);
  }
}

main().then(() => { if (!ONCE) setTimeout(main, 60 * 60000); }).catch((e) => { emit({ stage: 'gis_error', ok: false, detail: String(e?.message || e).slice(0, 140) }); process.exit(1); });
