// Fast business-address fixture via the Overpass API: ONE request per city
// returns every OSM feature that carries a house number + street inside that
// city's administrative boundary — vs one 1.1s Nominatim request per guess.
// Writes the pool file INCREMENTALLY after every city so progress is provable.
import { appendFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const target = args.includes('--target') ? Number(args[args.indexOf('--target') + 1]) : 6000;
const perCity = args.includes('--per-city') ? Number(args[args.indexOf('--per-city') + 1]) : 20;
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.fixture-overpass.json';
const startAt = args.includes('--start-at') ? Number(args[args.indexOf('--start-at') + 1]) : 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CITIES = JSON.parse(readFileSync('.cities-oh-ky.json', 'utf8')); // [[name, ST], ...]
const seen = new Set();
const out = [];
try {
  for (const x of JSON.parse(readFileSync(outFile.replace('.json', '-detail.json'), 'utf8'))) {
    seen.add(x.address.toLowerCase()); out.push(x);
  }
  console.log(`resuming: ${out.length} already collected`);
} catch {}

async function query(city, st) {
  const q = `[out:json][timeout:25];
area["name"="${city.replace(/"/g, '')}"]["admin_level"="8"]["boundary"="administrative"]->.a;
nwr["addr:housenumber"]["addr:street"](area.a);
out tags ${perCity * 3};`;
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'User-Agent': 'ccs-signage-address-fixture/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.elements || [];
}

const flush = () => {
  writeFileSync(outFile, JSON.stringify(out.map((o) => o.address), null, 1));
  writeFileSync(outFile.replace('.json', '-detail.json'), JSON.stringify(out, null, 1));
};

for (let i = startAt; i < CITIES.length && out.length < target; i++) {
  const [city, st] = CITIES[i];
  const els = await query(city, st).catch(() => null);
  let got = 0;
  if (els) {
    for (const el of els) {
      if (got >= perCity || out.length >= target) break;
      const t = el.tags || {};
      const town = t['addr:city'] || city;
      const state = (t['addr:state'] || '').replace(/Ohio|OH/i, 'OH').replace(/Kentucky|KY/i, 'KY') || st;
      if (state !== 'OH' && state !== 'KY') continue;
      const addr = `${t['addr:housenumber']} ${t['addr:street']}, ${town}, ${state}${t['addr:postcode'] ? ' ' + t['addr:postcode'] : ''}`;
      const key = addr.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ address: addr, place: t.name || '', city_queried: city, state, osm_type: el.type });
      got++;
    }
  }
  flush();
  console.log(`${city}, ${st}: ${got} (total ${out.length}/${target}, city ${i + 1}/${CITIES.length})`);
  appendFileSync('.fixture-overpass.progress', `${i + 1}\n`);
  await sleep(els === null ? 5000 : 1200); // Overpass fair-use ≈ 1 req/1-2s; back off on failure
}
flush();
console.log(`\nWrote ${out.length} addresses to ${outFile}`);
