// One-shot: harvest VERIFIED code-library ordinance URLs from countywide GIS
// zoning layers (CCPC Cuyahoga URL field, CAGIS Hamilton ORDINANCE field) and
// stamp ordinance_url on matching JurisdictionProfile rows — the same field
// the ordinance scanner writes, but sourced from county GIS instead of
// Cloudflare-walled library discovery.
//
// Only fills EMPTY ordinance_url — never overwrites a richer scanned record.
// Paged queries (the CCPC layer is ~13k polygons) + server-side URL filter so
// payloads stay small. Emits gis_ord_* events; writes through the outbox.

import { openSync, writeFileSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';

const EVENTS = '.live-events.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'gis-ord-harvest', ...e }) + '\n', { flag: 'a' }); } catch {} };

const SOURCES = [
  { name: 'ccpc', state: 'OH', cityField: 'CITY', urlField: 'URL', urlFilter: "URL IS NOT NULL AND URL <> ''",
    url: 'https://gis.cuyahogacounty.gov/server/rest/services/CCPC/CCPC_Zoning/MapServer/1/query' },
  // LINK-GIS NKY — CITY_NAME + ORDINANCE per district polygon.
  { name: 'linkgis-kenton', state: 'KY', cityField: 'CITY_NAME', urlField: 'ORDINANCE', urlFilter: "ORDINANCE IS NOT NULL AND ORDINANCE <> ''",
    url: 'https://maps.linkgis.org/server/rest/services/Identify_Zoning/MapServer/0/query' },
  { name: 'linkgis-campbell', state: 'KY', cityField: 'CITY_NAME', urlField: 'ORDINANCE', urlFilter: "ORDINANCE IS NOT NULL AND ORDINANCE <> ''",
    url: 'https://maps.linkgis.org/server/rest/services/Identify_Zoning/MapServer/1/query' },
  { name: 'linkgis-pendleton', state: 'KY', cityField: 'CITY_NAME', urlField: 'ORDINANCE', urlFilter: "ORDINANCE IS NOT NULL AND ORDINANCE <> ''",
    url: 'https://maps.linkgis.org/server/rest/services/Identify_Zoning/MapServer/2/query' },
  ...Object.entries({
    'Anderson Township': 12, 'Blue Ash': 13, 'Cheviot': 20, 'Colerain Township': 19,
    'Crosby Township': 14, 'Delhi Township': 23, 'Forest Park': 15, 'Lockland': 16,
    'Madeira': 36, 'Montgomery': 17, 'North Bend': 25, 'Norwood': 18,
    'Springfield Township': 26, 'Sycamore Township': 27, 'Symmes Township': 24, 'Woodlawn': 22,
  }).map(([city, lyr]) => ({
    name: `cagis-${lyr}`, state: 'OH', cityField: null, fixedCity: city, urlField: 'ORDINANCE', urlFilter: "ORDINANCE IS NOT NULL AND ORDINANCE <> ''",
    url: `https://cagisonline.hamilton-co.org/arcgis/rest/services/Countywide_Layers/Zoning/MapServer/${lyr}/query`,
  })),
];

const norm = (s) => String(s || '').toLowerCase().replace(/^(city|village|township) of /, '').replace(/\s+(city|village|township|borough)$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const isLibUrl = (u) => /^https?:\/\//i.test(String(u || '')) && /municode|amlegal|ecode360|codepublishing|sterlingcodifiers|qcode\.us|generalcode|codelibrary|ordinance|encodeplus/i.test(String(u));
const PAGE = 2000;

async function harvest(src) {
  const fields = [src.cityField, src.urlField].filter(Boolean).join('%2C');
  const where = encodeURIComponent(src.urlFilter);
  const pairs = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const q = `${src.url}?where=${where}&outFields=${fields}&returnGeometry=false&resultRecordCount=${PAGE}&resultOffset=${offset}&orderByFields=OBJECTID&f=json`;
    const j = await fetch(q, { signal: AbortSignal.timeout(45000) }).then((r) => r.json()).catch(() => null);
    const feats = j?.features || [];
    for (const f of feats) {
      const city = src.fixedCity || f.attributes?.[src.cityField];
      const url = f.attributes?.[src.urlField];
      if (city && isLibUrl(url) && !pairs.has(norm(city))) pairs.set(norm(city), String(url).trim());
    }
    if (!feats.length || (feats.length < PAGE && !j?.exceededTransferLimit)) break;
  }
  return pairs;
}

async function main() {
  const oh = getMirror('profiles-oh')?.rows || [];
  const ky = getMirror('profiles-ky')?.rows || [];
  const byNorm = new Map();
  for (const p of [...oh, ...ky]) {
    for (const nm of [p.jurisdiction_name, p.name]) {
      const k = `${norm(nm)}|${String(p.state || '').toUpperCase()}`;
      if (nm && !byNorm.has(k)) byNorm.set(k, p);
    }
  }
  let stamped = 0, skipped = 0, unmatched = 0;
  for (const src of SOURCES) {
    const pairs = await harvest(src).catch(() => new Map());
    for (const [cityKey, url] of pairs) {
      const p = byNorm.get(`${cityKey}|${src.state}`) || byNorm.get(`${cityKey.replace(/ township$/, '')}|${src.state}`);
      if (!p) { unmatched++; continue; }
      if (p.ordinance_url) { skipped++; continue; }
      enqueue({ entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { ordinance_url: url }, mirror: null, note: `gis ordinance url — ${p.jurisdiction_name || p.name}` });
      mirrorApply(String(p.state).toUpperCase() === 'KY' ? 'profiles-ky' : 'profiles-oh', { id: p.id, ordinance_url: url });
      emit({ stage: 'gis_ord_url', address: `${p.jurisdiction_name || p.name}, ${p.state}`, ok: true, detail: url.slice(0, 100) });
      stamped++;
    }
  }
  emit({ stage: 'gis_ord_done', address: 'harvest', ok: true, detail: `${stamped} stamped, ${skipped} already had urls, ${unmatched} unmatched` });
  console.log(`gis-ord-harvest: ${stamped} stamped, ${skipped} had urls, ${unmatched} unmatched`);
}
main().catch((e) => { console.error(e); process.exit(1); });
