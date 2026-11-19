#!/usr/bin/env node
// Local address resolver — ZERO external spend, drop-in replacement for the
// resolvePermittingAddress invoke (which burns a Google geocode per address).
//
//   address → Nominatim (1/s, free) → Census geocoder (free) →
//   resolveSpatialLocation (free gov GIS: Census TIGERweb + OH/KY ArcGIS) →
//   exactConfiguredLocality vs localities MIRROR → stage events →
//   outbox enqueues (queue demand rows + PermitLookupIndex entries)
//
// Same CLI + event contract as permitting-address-validation.mjs so the
// forever-runner can spawn it interchangeably and the dashboard sees the
// same stages: --file <pool.json> --limit N --workers N --delay-ms N
// --events .live-events.jsonl --json <summary.json>
import { openSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto';
import { resolveSpatialLocation, exactConfiguredLocality } from '../base44/shared/permittingSpatialResolution.mjs';
import { buildIndexEntry, indexAddressKey } from '../base44/shared/permittingLookupIndex.mjs';
import { normalizeAddressState } from '../base44/shared/permittingAddressState.js';
import { getMirror } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const POOL_FILE = arg('--file', '.remaining-pool-forever.json');
const EVENTS = arg('--events', '.live-events.jsonl');
const WORKERS = Math.min(Number(arg('--workers', 4)), 8);
const DELAY_MS = Number(arg('--delay-ms', 1200));
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const SUMMARY = arg('--json', '.validation-local.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), ...e }) + '\n', { flag: 'a' }); } catch {} };

// ── MP-10.4 municipal zoning layers — verified endpoints; key = state|city ──
const ZONING_GIS = {
  'oh|columbus': {
    url: 'https://gis.columbus.gov/arcgis/rest/services/Applications/Zoning/MapServer/20/query',
    map: (a) => ({ district: a.CLASSIFICATION || a.GENERAL_ZONING_CATEGORY || null, category: a.GENERAL_ZONING_CATEGORY || null, height: a.HEIGHT_DISTRICT || null, status: a.ZONING_STATUS || null, source: 'columbus-gis' }),
  },
  'oh|cleveland': {
    url: 'https://services3.arcgis.com/dty2kHktVXHrqO8i/ArcGIS/rest/services/Zoning_Authoritative/FeatureServer/5/query',
    map: (a) => ({ district: a.ZONE_CODE || null, category: a.ZONE_USE || null, height: a.ZONE_HGT != null ? String(a.ZONE_HGT) : null, area: a.ZONE_DIST || null, source: 'cleveland-open-data' }),
  },
  'oh|cincinnati': {
    url: 'https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data_Feature_Collection/FeatureServer/31/query',
    map: (a) => ({ district: a.ZONING || a.ZONE_TYPE || null, category: a.DIS_NAME || null, source: 'cagis-open-data' }),
  },
  'oh|dayton': {
    url: 'https://maps.daytonohio.gov/server/rest/services/Viewer/Zoning_Viewer_Layers/MapServer/17/query',
    map: (a) => ({ district: a.NEW_ZONE || a.ZONE || null, category: a.DISTRICT || null, source: 'dayton-gis' }),
  },
  'ky|louisville': {
    url: 'https://gis.lojic.org/maps/rest/services/LojicSolutions/OpenDataDevelopment/MapServer/15/query',
    map: (a) => ({ district: a.ZONING_CODE || null, category: a.ZONING_NAME || null, type: a.ZONING_TYPE || null, source: 'lojic' }),
  },
  'ky|lexington': {
    url: 'https://maps.lexingtonky.gov/lfucggis/rest/services/planning/MapServer/6/query',
    map: (a) => ({ district: a.ZONING || null, ordinance_link: a.LINK || null, source: 'lfucg-gis' }),
  },
  'oh|toledo': {
    url: 'https://gis.toledo.oh.gov/arcgis/rest/services/Public/ZoningArcMapServiceHub/MapServer/1/query',
    map: (a) => ({ district: a.Zoning || null, category: a.Description || null, ordinance_link: a.Uses || null, source: 'toledo-gis' }),
  },
  'oh|portsmouth': {
    url: 'https://www.sciotocountyengineer.org/arcgis/rest/services/planningandzoning/PlanningandZoning/MapServer/3/query',
    map: (a) => ({ district: a.code || null, source: 'scioto-pz' }),
  },
  // Hamilton County CAGIS per-jurisdiction zoning layers — one service covers
  // 16 munis+townships with a shared field shape (verified: Norwood GBD/R2).
  ...Object.fromEntries(Object.entries({
    'anderson township': 12, 'blue ash': 13, 'cheviot': 20, 'colerain township': 19,
    'crosby township': 14, 'delhi township': 23, 'forest park': 15, 'lockland': 16,
    'madeira': 36, 'montgomery': 17, 'north bend': 25, 'norwood': 18,
    'springfield township': 26, 'sycamore township': 27, 'symmes township': 24, 'woodlawn': 22,
  }).map(([city, lyr]) => [`oh|${city}`, {
    url: `https://cagisonline.hamilton-co.org/arcgis/rest/services/Countywide_Layers/Zoning/MapServer/${lyr}/query`,
    map: (a) => ({ district: a.ZONING || null, category: a.ZONE_DESCRIPTION || null, jurisdiction: a.JURISDICTION || null, overlay: a.ZONEOVERLAY || null, source: 'cagis-countywide' }),
  }])),
  // Summit County — Admin_and_Planning/ZoningNov2025 covers ALL 31 Summit
  // jurisdictions as per-muni layers (verified: Akron U-3/H5, Twinsburg C-5).
  // GOVERNMENT self-reports the muni; township/city pairs stay as separate
  // keys so a township address never stamps the sibling city's zoning.
  ...Object.fromEntries(Object.entries({
    'twinsburg township': 0, 'twinsburg': 1, 'tallmadge': 2, 'stow': 3,
    'springfield township': 4, 'silver lake': 5, 'sagamore hills township': 6,
    'richfield township': 7, 'richfield': 8, 'reminderville': 9, 'peninsula': 10,
    'norton': 11, 'northfield village': 12, 'northfield center township': 13,
    'new franklin': 14, 'munroe falls': 15, 'mogadore': 16, 'macedonia': 17,
    'lakemore': 18, 'hudson': 19, 'green': 20, 'fairlawn': 21,
    'cuyahoga falls': 22, 'coventry township': 23, 'copley township': 24,
    'clinton': 25, 'boston township': 26, 'boston heights': 27, 'bath township': 28,
    'barberton': 29, 'akron': 30,
  }).map(([city, lyr]) => [`oh|${city}`, {
    url: `https://scgis.summitoh.net/hosted/rest/services/Admin_and_Planning/ZoningNov2025/MapServer/${lyr}/query`,
    map: (a) => ({ district: a.ZONE_ || a.ZONE || a.ZONING || null, category: a.GENERAL || a.ZONE_DESC || a.DISTRICT_N || null, height: a.HEIGHT || null, area_req: a.AREA_REQUI || a.MIN_LOT_SI || null, jurisdiction: a.GOVERNMENT || null, gov_type: a.GOV_TYPE || null, front_setback: a.FRONT_SETB || null, rear_setback: a.REAR_SETBA || null, side_setback: a.SIDE_SETBA || null, source: 'summit-zoning' }),
  }])),
};

// Countywide zoning layers — query once, then keep the feature whose
// jurisdiction field matches the resolved locality (never blend munis).
const ZONING_COUNTYWIDE = {
  'oh|cuyahoga': {
    url: 'https://gis.cuyahogacounty.gov/server/rest/services/CCPC/CCPC_Zoning/MapServer/1/query',
    cityField: 'CITY',
    map: (a) => ({ district: a.MUNI_ZONE_ || null, category: a.ZONE_DESI || a.GENERALIZE || null, city: a.CITY || null, ordinance_link: a.URL || null, overlay: a.OVERLAY_ZONE || null, source: 'ccpc-countywide' }),
  },
  // Hamilton RZC layer covers county-zoned (township/unincorporated) areas —
  // it returns nothing inside self-zoning munis, so any hit is trustworthy.
  'oh|hamilton': {
    url: 'https://cagisonline.hamilton-co.org/arcgis/rest/services/Countywide_Layers/Zoning/MapServer/21/query',
    map: (a) => ({ district: a.ZONING || null, category: a.ZONE_DESCRIPTION || null, jurisdiction_code: a.JURISDICTION || null, zone_admin: a.ZONEADMIN || null, source: 'cagis-rzc' }),
  },
  // LINK-GIS (NKY) — one Identify_Zoning service covers every city in Kenton,
  // Campbell, and Pendleton counties. CITY_NAME disambiguates; ORDINANCE is a
  // per-city code link (encodeplus/municode). Verified Covington DTC+HP,
  // Newport CBDF.
  'ky|kenton': {
    url: 'https://maps.linkgis.org/server/rest/services/Identify_Zoning/MapServer/0/query',
    cityField: 'CITY_NAME',
    map: (a) => ({ district: a.PRIMARY_ZO || a.ZONE || null, category: a.PRIMARY_DE || null, overlay: a.OVERLAY_ZO || null, overlay_desc: a.OVERLAY_DE || null, city: a.CITY_NAME || null, ordinance_link: a.ORDINANCE || null, form_based: a.FBC === 'Y' || null, source: 'linkgis-kenton' }),
  },
  'ky|campbell': {
    url: 'https://maps.linkgis.org/server/rest/services/Identify_Zoning/MapServer/1/query',
    cityField: 'CITY_NAME',
    map: (a) => ({ district: a.ZONE || a.ZONE_LABEL || null, category: a.PRIMARY_DE || a.ZONE_ALIAS || null, city: a.CITY_NAME || null, ordinance_link: a.ORDINANCE || null, source: 'linkgis-campbell' }),
  },
  'ky|pendleton': {
    url: 'https://maps.linkgis.org/server/rest/services/Identify_Zoning/MapServer/2/query',
    cityField: 'CITY_NAME',
    map: (a) => ({ district: a.ZONE || a.ZONING || null, category: a.PRIMARY_DE || null, city: a.CITY_NAME || null, ordinance_link: a.ORDINANCE || null, source: 'linkgis-pendleton' }),
  },
  // Boone County GIS — JURISDICTN names the zoning authority (BCPC = county
  // planning), BZ*LINK fields carry per-district encodeplus code links.
  'ky|boone': {
    url: 'https://secure.boonecountygis.com/server/rest/services/ServicesBoone/ZoningDistrictsLayer_Boone/MapServer/0/query',
    map: (a) => ({ district: a.BASEZONING || a.ZONINGLABL || null, category: a.ZONINGDESC || null, jurisdiction_code: a.JURISDICTN || null, ordinance_link: a.BZARTHLINK || null, source: 'boone-gis' }),
  },
  // Butler County — BC_Zoning covers only county-zoned townships (self-zoned
  // munis + West Chester/Liberty return nothing), so any hit is trustworthy.
  // Verified Ross Twp → A-1.
  'oh|butler': {
    url: 'https://maps.bcohio.gov/server/rest/services/BC_Zoning/MapServer/0/query',
    map: (a) => ({ district: a.ZONING || null, source: 'butler-county-zoning' }),
  },
  // Clermont County — township-scoped zoning (DIST + TOWNSHIP authority +
  // HYPERLINK to the resolution text). Villages/cities self-zone, so a
  // township-name match is required before stamping.
  'oh|clermont': {
    url: 'https://maps.clermontcountyohio.gov/server/rest/services/WMAS/Zoning/MapServer/0/query',
    cityField: 'TOWNSHIP',
    map: (a) => ({ district: a.DIST || a.DIST_GEN || null, category: a.DIST_SPEC || null, township: a.TOWNSHIP || null, ordinance_link: a.HYPERLINK || null, source: 'clermont-zoning' }),
  },
};
const normPlace = (s) => String(s || '').toLowerCase().replace(/^(city|village|township|borough) of /, '').replace(/\s+(city|village|township|borough|county)$/, '').trim();
async function zoningPointQuery(url, g, buffered) {
  const dist = buffered ? '&distance=250&units=esriSRUnit_Foot' : '';
  const q = `${url}?geometry=${g.lon}%2C${g.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects${dist}&outFields=*&returnGeometry=false&f=json`;
  const j = await fetch(q, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null);
  return j?.features || [];
}
async function zoningLookup(cityName, state, g, county) {
  // Raw name first, normalized second — "Twinsburg Township" must NOT
  // normalize to "twinsburg" and stamp city zoning on a township address.
  const name = normPlace(cityName);
  const cfg = ZONING_GIS[`${String(state || '').toLowerCase()}|${String(cityName || '').toLowerCase().trim()}`] ||
    ZONING_GIS[`${String(state || '').toLowerCase()}|${name}`];
  if (cfg) {
    for (const buffered of [false, true]) {
      const feats = await zoningPointQuery(cfg.url, g, buffered);
      if (feats.length) { const z = cfg.map(feats[0].attributes); if (z?.district || z?.category) return z; }
    }
  }
  const cw = ZONING_COUNTYWIDE[`${String(state || '').toLowerCase()}|${normPlace(county)}`];
  if (!cw) return null;
  const feats = await zoningPointQuery(cw.url, g, false);
  if (!feats.length) return null;
  const match = cw.cityField
    ? feats.find((f) => normPlace(f.attributes?.[cw.cityField]) === name)
    : feats[0];
  const a = match?.attributes;
  if (!a) return null;
  const z = cw.map(a);
  return z?.district || z?.category ? z : null;
}

// ── Free geocoders ───────────────────────────────────────────────────────
// Nominatim ToS: max 1 req/sec ACROSS ALL WORKERS — a per-process timer lets
// N workers burst N/sec and gets the IP banned. Cross-process token bucket:
// a lock dir (mkdir is atomic) guards a shared last-request timestamp file.
const NOM_LOCK = '.audit-work/nominatim-mutex';
const NOM_TS = '.audit-work/nominatim-last.json';
// rmdir races across workers (stale-break vs finally) and Windows EPERM on a
// just-scanned dir both kill the geocode path — force:true ignores ENOENT and
// retries absorb transient EPERM.
const nomUnlock = () => { try { rmSync(NOM_LOCK, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 }); } catch {} };
async function nominatimSlot() {
  for (;;) {
    try { mkdirSync(NOM_LOCK); } catch {
      // Stale-lock break: a crashed worker between mkdir/rmdir leaves the dir
      // behind — break locks older than 15s or every worker idles forever.
      try { const { statSync } = await import('node:fs'); if (Date.now() - statSync(NOM_LOCK).mtimeMs > 15000) { nomUnlock(); continue; } } catch {}
      await sleep(60 + Math.random() * 120); continue;
    }
    try {
      let last = 0;
      try { last = JSON.parse(readFileSync(NOM_TS, 'utf8')).t || 0; } catch {}
      const now = Date.now();
      if (now - last < 1050) { const w = 1050 - (now - last); nomUnlock(); await sleep(w); continue; }
      writeFileSync(NOM_TS, JSON.stringify({ t: now, pid: process.pid }));
      return;
    } finally { nomUnlock(); }
  }
}
async function geocodeNominatim(address) {
  await nominatimSlot();
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=${encodeURIComponent(address)}`, { headers: { 'User-Agent': 'ccs-signage-permitting-local-resolver/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`nominatim HTTP ${r.status}`);
  const hit = (await r.json())?.[0];
  if (!hit?.lat || !hit?.lon) return null;
  const a = hit.address || {};
  const exact = ['house', 'building', 'yes'].includes(String(hit.addresstype || hit.type || '').toLowerCase());
  return {
    lat: Number(hit.lat), lon: Number(hit.lon), provider: 'nominatim',
    formatted_address: hit.display_name || '',
    location_exact: exact, approximate_source: !exact,
    address_parts: {
      administrative_area_level_1: a.state || '',
      administrative_area_level_2: a.county || '',
      administrative_area_level_3: a.township || a.municipality || a.county_subdivision || '',
      locality: a.city || a.town || a.village || a.hamlet || '',
    },
  };
}
async function geocodeCensus(address) {
  // Census locator — free US-gov geocoder, no key. Street/city/state split.
  const parts = String(address).split(',').map((s) => s.trim()).filter(Boolean);
  const street = parts[0] || '';
  const stateM = (parts.join(' ').match(/\b(OH|KY|Ohio|Kentucky)\b/) || [])[1] || '';
  const city = parts.length > 1 ? parts[1].replace(/\s+(OH|KY|Ohio|Kentucky)(?:\s+\d{5}(-\d{4})?)?$/i, '').trim() : '';
  if (!street || !stateM) return null;
  const q = new URLSearchParams({ street, city, state: normalizeAddressState(stateM), benchmark: 'Public_AR_Current', format: 'json' });
  const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/address?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`census HTTP ${r.status}`);
  const m = (await r.json())?.result?.addressMatches?.[0];
  if (!m?.coordinates) return null;
  return {
    lat: m.coordinates.y, lon: m.coordinates.x, provider: 'census',
    formatted_address: m.matchedAddress || '',
    location_exact: true, approximate_source: false,
    address_parts: {
      administrative_area_level_1: m.addressComponents?.state || stateM,
      administrative_area_level_2: '', administrative_area_level_3: '',
      locality: m.addressComponents?.city || '',
    },
  };
}
// MP-2.1 — batch-geocoded answers skip the 1/sec Nominatim slot entirely.
const GEO_CACHE = '.audit-work/geocode-cache.json';
let geoCache = null;
function geoCacheGet(address) {
  if (!geoCache) { try { geoCache = JSON.parse(readFileSync(GEO_CACHE, 'utf8')); } catch { geoCache = {}; } }
  const g = geoCache[String(address).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()];
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon)) return null;
  // Spatial resolution needs state (+ locality hints) — derive them from the
  // pool address format "street, city, ST zip" the cache was built from.
  const m = String(address).match(/,\s*([^,]+?),\s*([A-Z]{2})\s*\d{0,5}/);
  return { lat: g.lat, lon: g.lon, provider: g.provider || 'census-batch', formatted_address: g.formatted || '', location_exact: !!g.location_exact, address_parts: { administrative_area_level_1: m?.[2] || '', administrative_area_level_2: '', administrative_area_level_3: '', locality: m?.[1] || '' } };
}
async function geocode(address, onStep) {
  const cached = geoCacheGet(address);
  if (cached) { onStep?.(`cache: ${(cached.formatted_address || '').slice(0, 80)}`); return cached; }
  try {
    const g = await geocodeNominatim(address);
    if (g) { onStep?.(`Nominatim: ${g.formatted_address.slice(0, 80)}`); return g; }
  } catch (e) { onStep?.(`Nominatim failed: ${String(e?.message || e).slice(0, 60)} — trying Census`); }
  const g2 = await geocodeCensus(address);
  if (g2) onStep?.(`Census locator: ${g2.formatted_address.slice(0, 80)}`);
  return g2;
}
const fetchJSON = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// ── Catalog (mirrors — zero remote reads) ────────────────────────────────
let localities = [], profiles = [], queuedDemand = new Set(), rules = [];
// Fallback rule cache for before mirror-sync's first pull lands.
const localRules = (() => { try { return JSON.parse(readFileSync('.audit-work/rules.json', 'utf8')); } catch { return []; } })();

// Index-write dedup — re-resolved addresses would otherwise mint duplicate
// PermitLookupIndex rows through the blind-FIFO outbox. Keyed on the entry's
// content hash: identical re-writes inside REFRESH_MS are skipped, but a real
// change (zoning landed, offices verified) writes immediately. Rows older
// than REFRESH_MS rewrite anyway so TTLs never lapse unwritten.
const IDX_WRITTEN = '.audit-work/index-written.json';
const IDX_REFRESH_MS = 3 * 864e5;
let indexWritten = {};
try { indexWritten = JSON.parse(readFileSync(IDX_WRITTEN, 'utf8')); } catch {}
let idxDirty = 0;
const idxStamp = (k, h) => { indexWritten[k] = { t: Date.now(), h }; if (++idxDirty % 25 === 0) { try { writeFileSync(IDX_WRITTEN, JSON.stringify(indexWritten)); } catch {} } };
const idxFlush = () => { try { writeFileSync(IDX_WRITTEN, JSON.stringify(indexWritten)); } catch {} };
async function loadCatalog() {
  // Mirrors only — the sync daemon owns remote refreshes; stale is fine.
  localities = getMirror('localities')?.rows || [];
  rules = getMirror('rules')?.rows || localRules;
  const oh = getMirror('profiles-oh')?.rows || [];
  const ky = getMirror('profiles-ky')?.rows || [];
  profiles = [...oh, ...ky];
  const queue = getMirror('queue')?.rows || [];
  queuedDemand = new Set(queue.filter((r) => !['sources_found', 'duplicate', 'blocked'].includes(String(r.status || ''))).map((r) => `${String(r.jurisdiction_name || '').toLowerCase().trim()}|${String(r.parent_county_name || '').toLowerCase().trim()}|${normalizeAddressState(r.state)}`));
}

const VERIFIED_ROLES = { sign_permit: 1, zoning: 1 };
function applyReady(offices) {
  let s = false, z = false;
  for (const o of offices || []) {
    if (o?.authority_verification_status !== 'staff_verified') continue;
    const roles = Array.isArray(o.authority_roles) ? o.authority_roles : [];
    if (roles.includes('sign_permit')) s = true;
    if (roles.includes('zoning')) z = true;
  }
  return s && z;
}

// ── Per-address resolution ───────────────────────────────────────────────
async function resolveOne(address, workerId) {
  const step = (detail) => emit({ worker: String(workerId), address, step: true, detail });
  emit({ worker: String(workerId), address, start: true });
  const out = { address, ok: false, stage: 'unresolved', detail: '' };
  try {
    const g = await geocode(address, step);
    if (!g) { out.stage = 'geocode'; out.detail = 'Nominatim + Census found no match'; emit({ worker: String(workerId), stage: 'geocode', address, ok: false, detail: out.detail }); return out; }
    step(`Boundary check at ${g.lat}, ${g.lon}`);
    const resolution = await resolveSpatialLocation({
      geocode: g, fetchJSON, rules, enteredAddress: address,
      onProgress: async (p) => { if (p?.detail) step(p.detail); },
    });
    if (resolution.status === 'invalid_input') {
      out.stage = 'invalid_input'; out.detail = resolution.reason || 'not a real address';
      emit({ worker: String(workerId), stage: 'invalid_input', address, ok: true, detail: out.detail });
      return out;
    }
    if (resolution.status === 'needs_review') {
      out.stage = 'needs_review'; out.detail = (resolution.reason || 'boundary review').slice(0, 140);
      emit({ worker: String(workerId), stage: 'needs_review', address, ok: true, detail: out.detail });
      return out;
    }
    if (resolution.status !== 'location_verified' || !resolution.target) {
      out.stage = 'unresolved'; out.detail = (resolution.reason || 'no jurisdiction match').slice(0, 140);
      emit({ worker: String(workerId), stage: 'unresolved', address, ok: false, detail: out.detail });
      return out;
    }
    // Locality match + verified-office gate — same stages the app emits.
    const target = resolution.target;
    const loc = exactConfiguredLocality(localities, resolution, profiles);
    const jtag = { name: target.name || '', state: normalizeAddressState(target.state) || target.state || '', county: target.county || '', type: target.type || '' };
    if (loc) {
      const ready = applyReady(loc.offices);
      out.ok = true;
      out.stage = ready ? 'resolved_apply' : 'resolved_needs_office_check';
      out.detail = `${target.name}, ${target.state} (${target.type}) — ${ready ? 'offices verified' : 'locality on file, offices unverified'}`;
      emit({ worker: String(workerId), stage: out.stage, address, ok: true, detail: out.detail, jurisdiction: jtag });
    } else {
      out.ok = true; out.stage = 'located_no_locality';
      out.detail = `${target.name}, ${target.state} (${target.type}) — jurisdiction found, no office record`;
      // Demand-queue the missing office record — deduped by name|county|state.
      const dkey = `${String(target.name || '').toLowerCase().trim()}|${String(target.county || '').toLowerCase().trim()}|${normalizeAddressState(target.state)}`;
      if (!queuedDemand.has(dkey)) {
        queuedDemand.add(dkey);
        enqueue({ entity: 'SourceCollectionQueue', op: 'create', data: { jurisdiction_name: target.name, state: target.state, jurisdiction_type: target.type === 'municipality' ? 'city' : (target.type || 'city'), parent_county_name: target.county || null, status: 'not_started', dispatch_rank: 0, missing_next: 'Office research — auto-queued by a local address resolution that needed verified offices.' }, note: `demand queue — ${target.name}, ${target.state}` });
      }
      emit({ worker: String(workerId), stage: 'located_no_locality', address, ok: true, detail: out.detail, jurisdiction: jtag });
    }
    // Lookup-index write — keeps the app's speed layer warm, buffered.
    // MP-9.3 — TTL scales with verification confidence: corroborated offices
    // keep 90d, unverified/parked get 14d, boundary-edge answers just 7d.
    const corroborated = (loc?.offices || []).some((o) => o?.corroboration_tier === 'verified');
    const ttl = (resolution?.target?.distance_m ?? 999) < 120 ? 7 : corroborated ? 90 : 14;
    const entry = buildIndexEntry({ address, point: resolution.point, resolution, geocode: g, revision: 'local-resolver', fingerprint: 'local', offices: loc?.offices, ttlDays: ttl });
    // MP-10.4 — municipal zoning district per address, where a verified
    // zoning-map layer exists. Point-in-district at the geocoded point;
    // failures are silent (zoning is enrichment, never a blocker).
    if (entry && g?.lat && g?.lon) {
      const zoning = await zoningLookup(target.name, target.state, g, target.county).catch(() => null);
      if (zoning) {
        entry.zoning_district = zoning.district; entry.zoning_context = zoning; out.zoning_district = zoning.district;
        emit({ worker: String(workerId), stage: 'zoning', address, ok: true, detail: `${zoning.district} — ${zoning.category || zoning.type || zoning.source}` });
      }
    }
    if (entry) {
      const k = indexAddressKey(address);
      // Hash the STABLE payload only — expires_at/last_verified_at/resolved_at
      // and source checked_at stamps differ every run and would defeat dedup.
      const norm = { ...entry, expires_at: null, last_verified_at: null, resolved_at: null,
        resolution: entry.resolution ? { ...entry.resolution, sources: (entry.resolution.sources || []).map((s) => ({ kind: s.kind, url: s.url })) } : entry.resolution };
      const h = createHash('sha1').update(JSON.stringify(norm)).digest('hex');
      const prev = indexWritten[k];
      if (prev && prev.h === h && Date.now() - prev.t < IDX_REFRESH_MS) {
        emit({ worker: String(workerId), stage: 'index_skip', address, ok: true, detail: 'unchanged index row still fresh' });
      } else {
        enqueue({ entity: 'PermitLookupIndex', op: 'create', data: entry, note: `index — ${k}` });
        idxStamp(k, h);
      }
    }
    return out;
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 140);
    out.stage = /boundary|spatial|arcgis|GIS|Municipal/i.test(msg) ? 'boundary' : 'invoke';
    out.detail = msg;
    emit({ worker: String(workerId), stage: out.stage, address, ok: false, detail: msg });
    return out;
  }
}

async function main() {
  const pool = (existsSync(POOL_FILE) ? JSON.parse(readFileSync(POOL_FILE, 'utf8')) : []).slice(0, LIMIT);
  if (!pool.length) { console.log('local resolver: empty pool — nothing to do'); return; }
  await loadCatalog();
  console.log(`local resolver: ${pool.length} addresses · ${localities.length} localities · ${profiles.length} profiles · ${WORKERS} workers · ${DELAY_MS}ms/worker · ZERO external spend`);
  emit({ stage: 'loop_start', address: 'local resolver', ok: true, detail: `LOCAL resolution — free geocode + gov GIS · ${pool.length} queued · ${WORKERS} workers`, start: true });
  let idx = 0, done = 0;
  const counts = {};
  async function worker(id) {
    while (true) {
      const i = idx++;
      if (i >= pool.length) return;
      const r = await resolveOne(pool[i], id);
      counts[r.stage] = (counts[r.stage] || 0) + 1;
      if (++done % 20 === 0) console.log(`[local ${id}] ${done}/${pool.length} — ${JSON.stringify(counts)}`);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));
  idxFlush();
  writeFileSync(SUMMARY, JSON.stringify({ finished_at: new Date().toISOString(), pool: pool.length, counts }, null, 2));
  emit({ stage: 'loop_done', address: 'local resolver', ok: true, detail: `local pass complete — ${JSON.stringify(counts)}` });
  console.log('local resolver done:', counts);
}
main().catch((e) => { console.error('resolver fatal:', e); emit({ stage: 'invoke', address: 'local resolver', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
