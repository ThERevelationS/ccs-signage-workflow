import { permitCreds } from './lib/permit-creds.mjs';
#!/usr/bin/env node
// Builds a fixture of REAL business/institution addresses across Ohio and
// Kentucky by asking Nominatim for well-known places in each city. The
// returned address components are what the resolver gets — every entry is an
// address at least one geocoder knows exists (unlike synthetic house numbers).
// Usage: node scripts/build-business-address-fixture.mjs [--target 500] [--out .fixture-business-addresses.json]

const OH_CITIES = [
  "Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton", "Parma",
  "Canton", "Youngstown", "Lorain", "Hamilton", "Springfield", "Kettering",
  "Elyria", "Lakewood", "Newark", "Mansfield", "Middletown", "Bowling Green",
  "Findlay", "Lima", "Marion", "Zanesville", "Chillicothe", "Portsmouth",
  "Ashland", "Athens", "Marietta", "Wooster", "Defiance", "Sidney", "Tiffin",
  "Fremont", "Norwalk", "Wapakoneta", "Celina", "Van Wert", "Bucyrus",
  "Coshocton", "Cambridge", "Ironton", "Wilmington", "Washington Court House",
  "Circleville", "Steubenville", "Sandusky", "Piqua", "Greenville", "Urbana",
  // expanded pool for larger fixtures
  "Grove City", "Dublin", "Westerville", "Reynoldsburg", "Hilliard",
  "Upper Arlington", "Gahanna", "Worthington", "Whitehall", "Bexley",
  "Delaware", "Marysville", "London", "Pickerington", "Canal Winchester",
  "Pataskala", "Heath", "Granville", "Johnstown", "Sunbury", "Powell",
  "Galena", "West Jefferson", "Plain City", "Mount Sterling", "Sabina",
  "Blanchester", "Georgetown", "Mount Orab", "Hillsboro", "Greenfield",
  "Waverly", "Jackson", "Wellston", "McArthur", "Logan", "Lancaster",
  "Massillon", "Alliance", "North Canton", "Green", "Barberton", "Norton",
  "Wadsworth", "Medina", "Brunswick", "Strongsville", "North Royalton",
  "Broadview Heights", "Brecksville", "Bedford", "Maple Heights", "Solon",
  "Twinsburg", "Aurora", "Streetsboro", "Kent", "Ravenna", "Stow",
  "Cuyahoga Falls", "Hudson", "Tallmadge", "Fairlawn", "Orrville", "Rittman",
  "Seville", "Loudonville", "Bellville", "Lexington", "Ontario", "Shelby",
  "Willard", "Bellevue", "Clyde", "Upper Sandusky", "Kenton", "Ada",
  "Bluffton", "Ottawa", "Delphos", "Spencerville", "Saint Marys", "Minster",
  "New Bremen", "Coldwater", "Fort Recovery", "Arcanum", "Lewisburg", "Eaton",
  "Camden", "Germantown", "Miamisburg", "West Carrollton", "Moraine",
  "Oakwood", "Trotwood", "Clayton", "Englewood", "Vandalia", "Brookville",
  "Tipp City", "West Milton", "Covington", "Yellow Springs", "Cedarville",
  "Jamestown", "Bellbrook", "Waynesville", "South Lebanon", "Maineville",
  "Morrow", "Goshen", "Amelia", "Batavia", "Williamsburg", "Bethel",
  "New Richmond", "Milford", "Mariemont", "Silverton", "Cheviot", "Cleves",
  "Harrison", "Newtown", "Mount Healthy", "Springdale", "Glendale",
  "Evendale", "Lockland", "Saint Bernard", "Deer Park", "Fairfax", "Madeira",
  "Blue Ash", "Loveland", "Mason", "Wyoming", "Reading", "Sharonville",
  "Norwood", "Forest Park", "Montgomery", "Lebanon", "Oxford", "Trenton",
  "Monroe", "Franklin", "Springboro", "Centerville", "Beavercreek",
  "Huber Heights", "Fairborn", "Xenia", "Troy", "West Chester", "Fairfield",
  "Mason", "Hamilton",
];
const KY_CITIES = [
  "Louisville", "Lexington", "Bowling Green", "Owensboro", "Covington",
  "Florence", "Georgetown", "Richmond", "Nicholasville", "Elizabethtown",
  "Hopkinsville", "Independence", "Frankfort", "Henderson", "Jeffersontown",
  "Radcliff", "Ashland", "Madisonville", "Winchester", "Murray", "Somerset",
  "Bardstown", "Danville", "Paducah", "Pikeville", "Maysville", "Corbin",
  "London", "Berea",
  // expanded pool for larger fixtures
  "Bellevue", "Dayton", "Fort Mitchell", "Fort Wright", "Villa Hills",
  "Lakeside Park", "Crestview Hills", "Edgewood", "Elsmere", "Cold Spring",
  "Highland Heights", "Southgate", "Wilder", "Alexandria", "Silver Grove",
  "Bromley", "Ludlow", "Park Hills", "Crescent Springs", "Taylor Mill",
  "Walton", "Union", "Warsaw", "Owenton", "Carrollton", "La Grange",
  "Crestwood", "Simpsonville", "Shelbyville", "Taylorsville",
  "Mount Washington", "Shepherdsville", "Hillview", "Lebanon", "Springfield",
  "Hodgenville", "Vine Grove", "Brandenburg", "Irvington", "Hardinsburg",
  "Leitchfield", "Munfordville", "Horse Cave", "Cave City", "Glasgow",
  "Edmonton", "Tompkinsville", "Burkesville", "Columbia", "Russell Springs",
  "Albany", "Monticello", "Whitley City", "Williamsburg", "Barbourville",
  "Pineville", "Middlesboro", "Harlan", "Hazard", "Jackson", "Beattyville",
  "Irvine", "Stanton", "Owingsville", "Morehead", "Flemingsburg", "Carlisle",
  "Cynthiana", "Paris", "Versailles", "Lawrenceburg", "Harrodsburg",
  "Stanford", "Lancaster", "Wilmore", "Mount Vernon", "Manchester",
  "Burnside", "Liberty", "Campbellsville", "Greensburg", "Scottsville",
  "Franklin", "Russellville", "Auburn", "Morgantown", "Brownsville",
  "Beaver Dam", "Hartford", "Greenville", "Central City", "Princeton",
  "Calvert City", "Benton", "Hazel", "Mayfield", "Wingo", "Clinton",
  "Hickman", "Fulton", "Wickliffe", "Bardwell", "Smithland", "Marion",
  "Providence", "Clay", "Dixon", "Sebree", "Hanson", "Corydon", "Morganfield",
  "Sturgis", "Uniontown", "Livermore", "Calhoun", "Whitesville", "Philpot",
  "Newport", "Fort Thomas", "Erlanger", "Burlington", "Hebron",
];
const PLACES = [
  "Walmart", "Kroger", "McDonald's", "Walgreens", "Speedway", "Home Depot",
  "Dollar General", "Bob Evans", "Marathon gas", "Meijer", "CVS Pharmacy",
  "Taco Bell", "Burger King", "Dollar Tree", "AutoZone", "O'Reilly Auto Parts",
  "Tractor Supply", "Lowe's", "Sheetz", "Circle K", "Arby's", "Wendy's",
  "Starbucks", "Dunkin'", "Chick-fil-A", "Applebee's", "Family Dollar",
  "Save a Lot", "Aldi", "KFC", "Subway", "Pizza Hut", "Domino's",
  "Little Caesars", "Big Lots", "Harbor Freight", "Giant Eagle",
  "post office", "city hall", "public library", "high school", "courthouse",
  "fire station", "police department", "hospital",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const target = args.includes("--target") ? Number(args[args.indexOf("--target") + 1]) : 500;
const perCity = args.includes("--per-city") ? Number(args[args.indexOf("--per-city") + 1]) : 9;
const placeOffset = args.includes("--place-offset") ? Number(args[args.indexOf("--place-offset") + 1]) : 0;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".fixture-business-addresses.json";

const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let fnToken = '';
async function fnLogin() {
  for (let i = 0; i < 5; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { fnToken = t.token; return; }
    await sleep(3000 + i * 3000);
  }
}
// Google Places Text Search via the app's deployed key wrapper — rich small-town
// business coverage that OSM lacks. Returns raw hits; caller parses.
async function placesSearch(city, st, retried = false) {
  const r = await fetch(`${FN}/fixtureBusinessSearch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: fnToken, query: `businesses in ${city}, ${st === 'OH' ? 'Ohio' : 'Kentucky'}` }), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) { await fnLogin(); return placesSearch(city, st, true); }
  if (r.status === 429 || r.status === 500) { await sleep(4000); if (!retried) return placesSearch(city, st, true); return null; }
  if (j.status !== 'OK') return null;
  // normalize Places hit → the Nominatim-shaped record the loop consumes
  return (j.results || []).map((p) => {
    const addr = String(p.address || '').replace(/, USA$/, '');
    const m = addr.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})(?:\s+(\d{5}))?$/);
    if (!m) return null;
    return { name: p.name, address: { road: m[1].replace(/^\d+\s+/, '').trim(), house_number: (m[1].match(/^\d+/) || [''])[0], city: m[2].trim(), postcode: m[4], 'ISO3166-2-lvl4': 'US-' + m[3] }, _pref: addr };
  }).filter(Boolean);
}

async function search(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=us&addressdetails=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "User-Agent": "ccs-signage-address-fixture/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) return null;
  const j = await r.json();
  return Array.isArray(j) ? j : null;
}

const seen = new Set();
const out = [];
// resume: reload any addresses already streamed by an earlier (killed) run
try {
  for (const line of (await import('node:fs')).readFileSync('.fixture-pool-live.jsonl', 'utf8').trim().split('\n')) {
    const o = JSON.parse(line);
    if (!seen.has(o.address.toLowerCase())) { seen.add(o.address.toLowerCase()); out.push(o); }
  }
  if (out.length) console.log(`resuming: ${out.length} addresses already collected`);
} catch {}
let queries = 0, misses = 0;
const cities = [
  ...OH_CITIES.map((c) => [c, "OH"]),
  ...KY_CITIES.map((c) => [c, "KY"]),
];
let placeIdx = placeOffset; // second-pass runs start deeper in PLACES so the same city gets different business types
// Scatter the order — the raw list is biggest-cities-first, which would spend
// the whole run on metros. Shuffle once so every minute of collection mixes
// small towns from all over both states.
let sh = 424243;
const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { sh = (sh * 1103515245 + 12345) >>> 0; const j = sh % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
await fnLogin();
const cityOrder = shuf(cities.slice());
// cities already at cap from a resumed run get skipped instead of re-burning queries
const cityHave = {};
for (const o of out) cityHave[o.city_queried] = (cityHave[o.city_queried] || 0) + 1;
for (const [city, st] of cityOrder) {
  if ((cityHave[city] || 0) >= perCity) { console.log(`${city}, ${st}: already at cap (${cityHave[city]}) — skipped`); continue; }
  let got = cityHave[city] || 0, tries = 0;
  // Google Places first — one call returns up to 20 real small-town businesses.
  if (got < perCity && out.length < target) {
    const hits = await placesSearch(city, st).catch(() => null);
    queries++;
    await sleep(300);
    if (hits && hits.length) {
      for (const hit of hits) {
        if (got >= perCity || out.length >= target) break;
        const a = hit.address || {};
        const road = a.road || "", num = a.house_number || "";
        const town = a.city || city;
        const state = (a["ISO3166-2-lvl4"] || "").includes("OH") ? "OH" : (a["ISO3166-2-lvl4"] || "").includes("KY") ? "KY" : null;
        if (!road || !num || !state || state !== st) continue;
        const addr = hit._pref || `${num} ${road}, ${town}, ${state}${a.postcode ? " " + a.postcode : ""}`;
        if (seen.has(addr.toLowerCase())) continue;
        seen.add(addr.toLowerCase());
        const rec = { address: addr, place: hit.name || 'business', city_queried: city, state, osm_type: 'google_places' };
        out.push(rec);
        (await import('node:fs')).appendFileSync('.fixture-pool-live.jsonl', JSON.stringify(rec) + '\n');
        got++;
      }
    }
  }
  while (got < perCity && tries < perCity * 2 && out.length < target) {
    const place = PLACES[placeIdx++ % PLACES.length];
    tries++;
    const hits = await search(`${place}, ${city}, ${st === "OH" ? "Ohio" : "Kentucky"}`).catch(() => null);
    queries++;
    await sleep(1100); // Nominatim: max 1 request/second
    if (!hits || !hits.length) { misses++; continue; }
    let any = false;
    for (const hit of hits) {
      if (got >= perCity || out.length >= target) break;
      const a = hit.address || {};
      const road = a.road || a.pedestrian || a.footway || "";
      const num = a.house_number || "";
      const town = a.city || a.town || a.village || a.municipality || city;
      const state = (a["ISO3166-2-lvl4"] || "").includes("OH") ? "OH" : (a["ISO3166-2-lvl4"] || "").includes("KY") ? "KY" : null;
      if (!road || !num || !state || state !== st) continue;
      const addr = `${num} ${road}, ${town}, ${state}${a.postcode ? " " + a.postcode : ""}`;
      if (seen.has(addr.toLowerCase())) continue;
      seen.add(addr.toLowerCase());
      const rec = { address: addr, place: hit.name || place, city_queried: city, state, osm_type: hit.osm_type };
      out.push(rec);
      (await import('node:fs')).appendFileSync('.fixture-pool-live.jsonl', JSON.stringify(rec) + '\n');
      got++;
      any = true;
    }
    if (!any) misses++;
  }
  if (out.length >= target) break;
  console.log(`${city}, ${st}: ${got} (total ${out.length}, ${queries} queries, ${misses} misses)`);
}
const { writeFileSync } = await import("node:fs");
writeFileSync(outFile, JSON.stringify(out.map((o) => o.address), null, 1));
writeFileSync(outFile.replace(".json", "-detail.json"), JSON.stringify(out, null, 1));
writeFileSync('.fixture-build-done', new Date().toISOString() + ' ' + out.length);
console.log(`\nWrote ${out.length} addresses to ${outFile} (${queries} queries, ${misses} misses)`);
