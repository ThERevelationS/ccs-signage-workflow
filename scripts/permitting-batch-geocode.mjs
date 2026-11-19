#!/usr/bin/env node
// MP-2.1 — Census BATCH geocoder. One POST geocodes up to 10k addresses
// (free US-gov service, no key) instead of spending a 1/sec Nominatim slot
// per address. Results land in .audit-work/geocode-cache.json — the local
// resolver checks the cache first, so batch hits skip both Nominatim and
// the single-address Census call entirely.
//
//   node scripts/permitting-batch-geocode.mjs [--pool .remaining-pool-forever.json] [--limit 9000]
//
// Census endpoint: geocoding.geo.census.gov/geocoder/geographies/addressbatch
//   POST multipart: addressFile=CSV "id,street,city,state,zip"
//   benchmark=Public_AR_Current&returntype=locations
//   Response CSV: "id","in_addr","match","exact|non_exact","out_addr","lon,lat","tigerLine","side"
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const POOL = arg('pool', '.remaining-pool-forever.json');
const LIMIT = Number(arg('limit', 9000));
const CACHE = '.audit-work/geocode-cache.json';
const EVENTS = '.live-events.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'batch-geocode', ...e }) + '\n', { flag: 'a' }); } catch {} };

const key = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const load = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

// "123 Main St, Fairfield, OH 45014" → {street, city, state, zip}
function splitAddress(a) {
  const m = String(a || '').match(/^(.*?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$/);
  if (!m) return null;
  return { street: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4] || '' };
}

// Latest-stage-per-address from the event log — only unattempted +
// geocode-failed entries go through the batch (resolved ones don't need it).
function ungeocoded(pool) {
  const seen = new Map();
  try {
    for (const l of readFileSync(EVENTS, 'utf8').trim().split('\n')) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (!e.address || !e.stage || e.start || e.step) continue;
      seen.set(key(e.address), e.stage);
    }
  } catch {}
  return pool.filter((a) => {
    const s = seen.get(key(a));
    return !s || s === 'geocode';
  });
}

async function batchPost(rows) {
  const csv = rows.map((r, i) => `${i + 1},"${r.p.street}","${r.p.city}","${r.p.state}","${r.p.zip}"`).join('\n');
  const fd = new FormData();
  fd.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addr.csv');
  fd.append('benchmark', 'Public_AR_Current');
  const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd, signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error(`census batch HTTP ${r.status}`);
  return r.text();
}

// Response rows: "id","input","status","quality","matched","lon,lat",...
function parseResponse(text, rows) {
  const out = [];
  for (const line of text.trim().split('\n')) {
    const f = line.match(/"([^"]*)"/g)?.map((s) => s.slice(1, -1));
    if (!f || f.length < 6) continue;
    const [id, , status, quality, matched, coords] = f;
    const row = rows[Number(id) - 1];
    if (!row || !/^match$/i.test(status)) continue;
    const [lon, lat] = String(coords || '').split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ address: row.address, g: { lat, lon, provider: 'census-batch', formatted: matched, location_exact: /exact/i.test(quality) && !/non/i.test(quality) } });
  }
  return out;
}

const pool = load(POOL, []);
const cache = load(CACHE, {});
const todo = ungeocoded(pool)
  .map((a) => ({ address: a, p: splitAddress(a) }))
  .filter((r) => r.p && !cache[key(r.address)])
  .slice(0, LIMIT);

emit({ stage: 'batch_geo_start', ok: true, start: true, detail: `${todo.length} address(es) → Census batch (pool ${pool.length})` });
if (!todo.length) { console.log('batch-geocode: nothing to do'); process.exit(0); }

let hits = 0;
for (let i = 0; i < todo.length; i += 5000) {
  const chunk = todo.slice(i, i + 5000);
  try {
    const text = await batchPost(chunk);
    const got = parseResponse(text, chunk);
    for (const { address, g } of got) cache[key(address)] = { ...g, at: Date.now() };
    hits += got.length;
    emit({ stage: 'batch_geo_pass', ok: true, detail: `batch ${Math.floor(i / 5000) + 1}: ${got.length}/${chunk.length} matched` });
  } catch (e) {
    emit({ stage: 'batch_geo_error', ok: false, detail: String(e?.message || e).slice(0, 140) });
  }
}
writeFileSync(CACHE, JSON.stringify(cache));
emit({ stage: 'batch_geo_done', ok: true, detail: `${hits}/${todo.length} batch-geocoded → geocode-cache.json (${Object.keys(cache).length} total)` });
console.log(`batch-geocode: ${hits}/${todo.length} matched — cache ${Object.keys(cache).length} entries`);
