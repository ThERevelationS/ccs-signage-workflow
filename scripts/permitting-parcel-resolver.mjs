#!/usr/bin/env node
// Parcel resolver — the systemic gate for the "close to a boundary" review
// class. The resolver flags when no corroborator agrees (geocoder claim,
// entered city, rules); a county parcel/auditor map is the next authority —
// the parcel's tax district IS the jurisdiction, determined at survey level,
// not inferred from a pin near an edge.
//
// Flow per flagged address:
//   latest needs_review "close to a boundary" mark
//   → Census geocode (same locator the validators fall back to)
//   → county parcel layer: point query, then same-street/majority fallback
//     for road-right-of-way pins (parcels exclude pavement)
//   → parcel municipality == inside-boundary pick? → mint a
//     PermitResolutionRule via permitting-review-resolve (auto-resolves this
//     address and rides along for future similar ones)
//   → parcel municipality == the OTHER boundary candidate? → the pick was
//     wrong — mint the rule for the parcel's true municipality instead
//   → no parcel / split evidence → stays needs_review (the true <1%)
//
// County coverage is config-driven — counties without queryable parcel GIS
// simply stay flagged for humans.
//
// Usage: node scripts/permitting-parcel-resolver.mjs [--once] [--dry-run]
// Emits parcel_resolve_* stages to .live-events.jsonl.
import { execFileSync } from 'node:child_process';
import { openSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const DRY = args.includes('--dry-run');
const EVENTS = '.live-events.jsonl';
const PASS_SLEEP = 10 * 60 * 1000;
const DONE_FILE = '.audit-work/parcel-resolved.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'parcelres', ...e }) + '\n', { flag: 'a' }); } catch {} };

// ── flagged items (same latest-mark logic as permitting-review-resolve) ──
function flaggedItems() {
  const evs = readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const tms = (e) => { const t = typeof e.t === 'number' ? e.t : Date.parse(e.t); return Number.isNaN(t) ? 0 : t; };
  const last = new Map();
  for (const e of evs) {
    if (!e.address || e.start || e.step) continue;
    // parcel_resolve_* events are OUR diagnostics — they must not become an
    // address's latest mark or a needs_review flag vanishes unresolved.
    if (/^parcel_resolve_/.test(String(e.stage || ''))) continue;
    if (!last.has(e.address) || tms(e) > tms(last.get(e.address))) last.set(e.address, e);
  }
  // Both jurisdiction-confirmation flag classes are parcel-resolvable:
  // "close to a boundary" (two candidates) and "approximate address /
  // cannot confirm jurisdiction" (none) — the boundary layer answers both.
  return [...last.values()].filter((e) => e.stage === 'needs_review' && /close to a boundary|approximate address|cannot confirm its jurisdiction/i.test(String(e.detail || e.reason || '')));
}
// Timestamped completions: a flag emitted AFTER an address was resolved means
// its rule failed to apply (bad pick, name-normalization gap) — resurface it
// once for a parcel_rule_refute audit event rather than hiding it forever.
const done = () => { try { const d = JSON.parse(readFileSync(DONE_FILE, 'utf8')); return new Map(Array.isArray(d) ? d.map((a) => [a, 0]) : Object.entries(d)); } catch { return new Map(); } };
const doneAt = (a) => done().get(a) || 0;
const markDone = (a) => { const s = done(); s.set(a, Date.now()); writeFileSync(DONE_FILE, JSON.stringify(Object.fromEntries(s))); };

// ── geocode: Census onelineaddress (authoritative position; the flag is
//    about jurisdiction, so position quality just needs parcel-level truth) ──
async function geocode(address) {
  const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const j = await fetch(u, { signal: AbortSignal.timeout(20000) }).then((r) => r.json()).catch(() => null);
  const m = (j?.result?.addressMatches || [])[0];
  if (m) return { lat: m.coordinates.y, lon: m.coordinates.x, matched: m.matchedAddress };
  // Census misses on non-structured addresses ("145 Old Hwy, U.S 60") —
  // Nominatim's fuzzy parser rescues those. Rare path, 1/sec is plenty.
  const n = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'ccs-permitting-parcel-resolver/1.0' } }).then((r) => r.json()).catch(() => null);
  const hit = n?.[0];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon), matched: hit.display_name } : null;
}
// Flag events carry only {address, detail} — no county. The FCC census-area
// lookup names the county at the geocoded point (free, no key).
async function countyAt(g) {
  const j = await fetch(`https://geo.fcc.gov/api/census/area?lat=${g.lat}&lon=${g.lon}&format=json`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null);
  return String(j?.results?.[0]?.county_name || '').replace(/ County$/i, '').trim();
}

// ── county parcel adapters — each returns a municipality name or null ──
// Hamilton County, OH — CAGIS parcels; TAXDST_DIS "DEER PARK-DEER PARK CSD"
// carries the municipality before the dash.
const HAM = 'https://cagisonline.hamilton-co.org/arcgis/rest/services/HCE/Cadastral/MapServer/0/query';
async function hamiltonMuni(g, addrParts) {
  const fields = 'TAXDST_DIS,ADDRNO,ADDRST';
  const point = `${HAM}?geometry=${g.lon}%2C${g.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=false&f=json`;
  let j = await fetch(point, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
  let hits = (j?.features || []).map((f) => f.attributes);
  if (!hits.length) {
    // Pin on road ROW — the street's parcels decide. Same-street parcels win;
    // otherwise majority district in a ~60m box.
    const d = 0.0006;
    const box = `${HAM}?geometry=${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=false&f=json`;
    j = await fetch(box, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    hits = (j?.features || []).map((f) => f.attributes);
  }
  if (!hits.length) return { muni: null, how: 'no_parcels' };
  const muniOf = (a) => {
    const d = String(a.TAXDST_DIS || '');
    const name = d.split('-')[0].trim();
    return /^CINTI CORP$/i.test(name) ? 'Cincinnati' : name || null;
  };
  // same-street parcels by name + closest address number
  const street = (addrParts.street || '').toUpperCase();
  const num = Number(addrParts.number || 0);
  const sameSt = hits.filter((a) => street && String(a.ADDRST || '').toUpperCase().includes(street));
  const scored = sameSt.length ? sameSt : hits;
  const named = scored.filter((a) => muniOf(a));
  if (!named.length) return { muni: null, how: 'no_named_district' };
  if (num) named.sort((a, b) => Math.abs(Number(a.ADDRNO || 0) - num) - Math.abs(Number(b.ADDRNO || 0) - num));
  const best = muniOf(named[0]);
  const agree = named.filter((a) => muniOf(a) === best).length;
  return { muni: best, how: sameSt.length ? 'same_street' : 'majority', votes: `${agree}/${named.length}` };
}
// Montgomery County, OH — parcel polygons carry district CODES; the county's
// corporation-boundary layer at the parcel centroid names the city directly.
const MON = 'https://gis.mcohio.org/server/rest/services/VantagePoints/AUDGIS_B1/MapServer';
async function montgomeryMuni(g) {
  const F = 'SDE.mc_parcel_polygon.OBJECTID';
  const q = `${MON}/7/query?geometry=${g.lon}%2C${g.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${F}&returnGeometry=true&outSR=4326&f=json`;
  let j = await fetch(q, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
  let ring = j?.features?.[0]?.geometry?.rings?.[0];
  if (!ring) {
    const d = 0.0006;
    const box = `${MON}/7/query?geometry=${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${F}&returnGeometry=true&outSR=4326&f=json`;
    j = await fetch(box, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    ring = j?.features?.[0]?.geometry?.rings?.[0];
  }
  if (!ring) return { muni: null, how: 'no_parcels' };
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const corp = `${MON}/13/query?geometry=${cx}%2C${cy}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=NAME&returnGeometry=false&f=json`;
  const cj = await fetch(corp, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
  const name = cj?.features?.[0]?.attributes?.NAME || null;
  return { muni: name ? name[0] + name.slice(1).toLowerCase() : null, how: 'corp_boundary' };
}
// Franklin County, OH — Municipal Boundary layer names the corporation/township
// under any point (roads included — no ROW gap). NAME + MUNITYP on layer 3.
const FRA = 'https://gis.franklincountyohio.gov/hosting/rest/services/BaseMap/Administrative_Area/MapServer/3/query';
async function franklinMuni(g) {
  const q = (geom, env) => `${FRA}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=NAME,MUNITYP&returnGeometry=false&f=json`;
  const hit = async (geom, env) => {
    const j = await fetch(q(geom, env), { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  let hits = await hit(`${g.lon}%2C${g.lat}`, false);
  if (!hits.length) {
    const d = 0.0006;
    hits = await hit(`${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, true);
  }
  if (!hits.length) return { muni: null, how: 'no_boundary' };
  const a = hits[0];
  const name = String(a.NAME || a.NAME2 || '').trim();
  const typ = String(a.MUNITYP || '').trim();
  return { muni: name || null, muni_type: typ || null, how: 'muni_boundary' };
}
// Cuyahoga County, OH — MUNICIPALITY polygons carry MUNI_NAME directly.
const CUY = 'https://gis.cuyahogacounty.gov/server/rest/services/MyPlace/MyPLACE_Parcel_Fabric_Basemap/MapServer/6/query';
async function cuyahogaMuni(g) {
  const q = (geom, env) => `${CUY}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=MUNI_NAME&returnGeometry=false&f=json`;
  const hit = async (geom, env) => {
    const j = await fetch(q(geom, env), { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  let hits = await hit(`${g.lon}%2C${g.lat}`, false);
  if (!hits.length) {
    const d = 0.0006;
    hits = await hit(`${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, true);
  }
  const name = String(hits[0]?.MUNI_NAME || '').trim();
  return { muni: name || null, how: 'muni_boundary' };
}
// Butler County, OH — Boundaries service: Corp layer names municipalities,
// Township layer covers the unincorporated remainder (INCORPORAT=NO →
// "<name> Township" so a township never blends with a same-named city).
const BUT_CORP = 'https://maps.bcohio.gov/server/rest/services/Boundaries/MapServer/3/query';
const BUT_TWP = 'https://maps.bcohio.gov/server/rest/services/Boundaries/MapServer/4/query';
async function butlerMuni(g) {
  const hit = async (base, geom, env, fields) => {
    const j = await fetch(`${base}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  const env = (d) => `${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`;
  let corp = await hit(BUT_CORP, `${g.lon}%2C${g.lat}`, false, 'NAME');
  if (!corp.length) corp = await hit(BUT_CORP, env(0.0006), true, 'NAME');
  if (corp.length) return { muni: String(corp[0].NAME || '').trim() || null, muni_type: 'municipality', how: 'corp_boundary' };
  let twp = await hit(BUT_TWP, `${g.lon}%2C${g.lat}`, false, 'NAME,INCORPORAT');
  if (!twp.length) twp = await hit(BUT_TWP, env(0.0006), true, 'NAME,INCORPORAT');
  if (!twp.length) return { muni: null, how: 'no_boundary' };
  const nm = String(twp[0].NAME || '').trim();
  const uninc = String(twp[0].INCORPORAT || '').toUpperCase() === 'NO';
  return { muni: nm ? (uninc ? `${nm} Township` : nm) : null, muni_type: uninc ? 'township' : 'municipality', how: 'township_boundary' };
}
// Kentucky statewide — Secretary-of-State corporate boundary polygons cover
// EVERY incorporated city in all 120 counties (NAME + COUNTY + SOSLINK;
// verified HARDINSBURG/BRECKINRIDGE). KY has no townships: unincorporated
// land is county territory, so a miss means the county governs.
const KYB = 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0/query';
async function kentuckyMuni(g) {
  const hit = async (geom, env) => {
    const j = await fetch(`${KYB}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=NAME,CLASS,COUNTY&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  let hits = await hit(`${g.lon}%2C${g.lat}`, false);
  if (!hits.length) {
    const d = 0.0006;
    hits = await hit(`${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, true);
  }
  const name = String(hits[0]?.NAME || '').trim();
  if (name) return { muni: name.charAt(0) + name.slice(1).toLowerCase(), muni_type: 'city', how: 'ky_sos_boundary' };
  return { muni: null, muni_type: 'unincorporated', how: 'ky_sos_unincorporated' };
}
// Clermont County, OH — WMAS/Township carries ALL jurisdiction classes in one
// layer: Type = TOWNSHIP / VILLAGE / CITY. Verified Amelia → BATAVIA TOWNSHIP
// (the village dissolved into the township). Village TOWNNAMEs carry a " V"
// suffix; names are ALL-CAPS so title-case them for rule minting.
const CLE = 'https://maps.clermontcountyohio.gov/server/rest/services/WMAS/Township/MapServer/0/query';
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(township|of|and)\b/gi, (m) => m.toLowerCase() === 'of' || m.toLowerCase() === 'and' ? m.toLowerCase() : m);
async function clermontMuni(g) {
  const hit = async (geom, env) => {
    const j = await fetch(`${CLE}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=TOWNNAME,Type&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  let hits = await hit(`${g.lon}%2C${g.lat}`, false);
  if (!hits.length) {
    const d = 0.0006;
    hits = await hit(`${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, true);
  }
  const a = hits[0];
  if (!a) return { muni: null, how: 'no_boundary' };
  const raw = String(a.TOWNNAME || '').replace(/\s+V$/i, '').trim();
  if (!raw) return { muni: null, how: 'no_boundary' };
  const t = String(a.Type || '').toUpperCase();
  if (t === 'TOWNSHIP' || t === ' ') return { muni: `${titleCase(raw)} Township`, muni_type: 'township', how: 'clermont_township' };
  return { muni: titleCase(raw), muni_type: t === 'CITY' ? 'municipality' : 'village', how: 'clermont_boundary' };
}
// Stark County, OH — Auditor/CVTBoundaries covers every city, village and
// township: CVT_NAME + SUBTYPE (C/V/T). Verified Massillon SUBTYPE:C.
const STK = 'https://scgisa.starkcountyohio.gov/arcgis/rest/services/Auditor/CVTBoundaries/MapServer/0/query';
async function starkMuni(g) {
  const hit = async (geom, env) => {
    const j = await fetch(`${STK}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=CVT_NAME,FULLNAME,SUBTYPE&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  let hits = await hit(`${g.lon}%2C${g.lat}`, false);
  if (!hits.length) { const d = 0.0006; hits = await hit(`${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, true); }
  const a = hits[0];
  if (!a) return { muni: null, how: 'no_boundary' };
  // CVT_NAME embeds the class ("PLAIN TWP.", "CITY OF X") — strip it before
  // re-suffixing so picks carry canonical names.
  const nm = titleCase(String(a.CVT_NAME || a.FULLNAME || '').replace(/\s+(twp|tp|city|village)\.?$/i, ''));
  if (!nm) return { muni: null, how: 'no_boundary' };
  const t = String(a.SUBTYPE || '').toUpperCase();
  if (t === 'T') return { muni: `${nm} Township`, muni_type: 'township', how: 'stark_cvt' };
  return { muni: nm, muni_type: t === 'C' ? 'municipality' : 'village', how: 'stark_cvt' };
}
// Licking County, OH — Auditor/Boundaries Jurisdictions layer: one row per
// jurisdiction with JurisdictionName/JurisdictionType + MunicipalityName /
// TownshipName split fields. Verified Johnstown City.
const LCK = 'https://gis.lickingcounty.gov/server/rest/services/Auditor/Boundaries/MapServer/0/query';
async function lickingMuni(g) {
  const hit = async (geom, env) => {
    const j = await fetch(`${LCK}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=JurisdictionName,JurisdictionType,MunicipalityName,TownshipName&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  let hits = await hit(`${g.lon}%2C${g.lat}`, false);
  if (!hits.length) { const d = 0.0006; hits = await hit(`${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, true); }
  const a = hits[0];
  if (!a) return { muni: null, how: 'no_boundary' };
  if (a.MunicipalityName) return { muni: titleCase(a.MunicipalityName), muni_type: /city/i.test(a.JurisdictionType || '') ? 'municipality' : 'village', how: 'licking_jurisdictions' };
  if (a.TownshipName) return { muni: `${titleCase(a.TownshipName)} Township`, muni_type: 'township', how: 'licking_jurisdictions' };
  const jn = String(a.JurisdictionName || '').trim();
  return { muni: jn ? titleCase(jn) : null, muni_type: /township/i.test(a.JurisdictionType || '') ? 'township' : 'municipality', how: 'licking_jurisdictions' };
}
// Highland County, OH — no public MapServer; AGOL FeatureServices instead.
// Corp layer = municipal corporations; parcels carry TaxDistDes
// ("<CIVIL>-<SCHOOL>", e.g. MADISON-GREENFIELD EVSD = Madison Twp, Greenfield
// EVSD). Verified: 12001 OH-753 geocodes outside Greenfield corp and its
// parcel's tax district resolves it to Madison Township.
const HLD_CORP = 'https://services.arcgis.com/1cRPllBKe5adN2Dv/arcgis/rest/services/HIghlandOH_Corp/FeatureServer/0/query';
const HLD_PCL = 'https://services.arcgis.com/1cRPllBKe5adN2Dv/arcgis/rest/services/HighlandOH_Parcels/FeatureServer/0/query';
async function highlandMuni(g) {
  const hit = async (url, fields, geom, env) => {
    const j = await fetch(`${url}?geometry=${geom}&geometryType=${env ? 'esriGeometryEnvelope' : 'esriGeometryPoint'}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  const d = 0.0006, env = `${g.lon - d}%2C${g.lat - d}%2C${g.lon + d}%2C${g.lat + d}`, pt = `${g.lon}%2C${g.lat}`;
  // Corp boundaries are exact — a point miss IS meaningful (buffered retry
  // false-positives nearby corps onto township parcels).
  const corp = await hit(HLD_CORP, 'CorpName', pt, false);
  if (corp[0]?.CorpName) return { muni: titleCase(corp[0].CorpName), muni_type: 'municipality', how: 'highland_corp' };
  // Unincorporated → parcel tax district's civil segment names the township.
  let pcl = await hit(HLD_PCL, 'TaxDistDes', pt, false);
  if (!pcl.length) pcl = await hit(HLD_PCL, 'TaxDistDes', env, true);
  const civil = String(pcl[0]?.TaxDistDes || '').split('-')[0].trim();
  if (civil && !/corp/i.test(civil)) return { muni: `${titleCase(civil)} Township`, muni_type: 'township', how: 'highland_parcel_taxdist' };
  return { muni: null, how: 'no_boundary' };
}
// Ohio statewide fallback — OGRIP boundaryData (official county-sourced
// township polygons, independent of Census TIGER) + the hosted municipal
// boundary layer. Exact-point queries: inside a muni polygon → municipality;
// muni miss + township hit → township. Covers every OH county without a
// dedicated adapter (e.g. Warren, whose county GIS hosts are unreachable).
const OH_MUNI = 'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0/query';
const OH_TWP = 'https://maps.ohio.gov/arcgis/rest/services/OGRIP/boundaryData/MapServer/3/query';
async function ohioFallbackMuni(g) {
  const hit = async (url, fields) => {
    const j = await fetch(`${url}?geometry=${g.lon}%2C${g.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=false&f=json`, { signal: AbortSignal.timeout(25000) }).then((r) => r.json()).catch(() => null);
    return (j?.features || []).map((f) => f.attributes);
  };
  const muni = await hit(OH_MUNI, 'MUNI_NAME,MUNI_TYPE,COUNTY_NAM');
  if (muni[0]?.MUNI_NAME) return { muni: titleCase(muni[0].MUNI_NAME), muni_type: /village/i.test(muni[0].MUNI_TYPE || '') ? 'village' : 'municipality', how: 'oh_statewide_muni' };
  const twp = await hit(OH_TWP, 'TOWNSHIP,COUNTY');
  if (twp[0]?.TOWNSHIP) return { muni: `${titleCase(twp[0].TOWNSHIP)} Township`, muni_type: 'township', how: 'oh_statewide_twp' };
  return { muni: null, how: 'no_boundary' };
}
const COUNTY_GIS = {
  'oh|hamilton': hamiltonMuni,
  'oh|montgomery': montgomeryMuni,
  'oh|franklin': franklinMuni,
  'oh|cuyahoga': cuyahogaMuni,
  'oh|butler': butlerMuni,
  'oh|clermont': clermontMuni,
  'oh|stark': starkMuni,
  'oh|licking': lickingMuni,
  'oh|highland': highlandMuni,
  'oh|*': ohioFallbackMuni, // statewide OGRIP/muni fallback — every OH county
  'ky|*': kentuckyMuni, // statewide layer — covers every KY county
};

// ── candidate municipality from the flag event (trace: "inside X + County") ──
function insidePick(e) {
  const tr = String(e.trace || '');
  const m = tr.match(/inside ([^+—]+)\+/i) || tr.match(/inside ([^,]+)/i);
  if (m) return m[1].trim();
  const t = String(e.targets || '');
  const m2 = t.match(/^([^+(]+)\s*\(/);
  return m2 ? m2[1].trim() : null;
}
const countyOf = (e) => {
  const c = String(e.county || '') || (String(e.trace || '').match(/([A-Za-z ]+) \(county\)/) || [])[1] || (String(e.targets || '').match(/([A-Za-z ]+) \(county\)/) || [])[1] || '';
  return c.replace(/ County$/i, '').trim();
};
const normJ = (s) => String(s || '').toLowerCase().replace(/\s+(city|village|town|county|township|corporation|corp)$/, '').replace(/\s+/g, ' ').trim();

function resolve(address, pick, county, state) {
  // the battle-tested rule writer — handles dedupe + entity write + event
  const out = execFileSync('node', [
    'scripts/permitting-review-resolve.mjs', '--address', address, '--pick', pick,
    '--county', `${county} County`, '--state', state || 'OH', '--scope', 'address',
  ], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  return out;
}

async function pass() {
  const tms = (e) => { const t = typeof e.t === 'number' ? e.t : Date.parse(e.t); return Number.isNaN(t) ? 0 : t; };
  const flagged = flaggedItems();
  const refutes = flagged.filter((e) => doneAt(e.address) && tms(e) > doneAt(e.address));
  for (const e of refutes) emit({ stage: 'parcel_rule_refute', address: e.address, detail: `resolved ${new Date(doneAt(e.address)).toISOString()} but re-flagged — minted rule did not apply` });
  const flags = flagged.filter((e) => !doneAt(e.address) || tms(e) > doneAt(e.address));
  emit({ stage: 'parcel_resolve_pass', detail: `${flags.length} boundary flags to check` });
  for (const e of flags) {
    await waitWhilePaused('parcel-resolver', { item: e.address });
    const state = (String(e.address).match(/, ([A-Z]{2})/) || [])[1] || 'OH';
    const g = await geocode(e.address);
    if (!g) { emit({ stage: 'parcel_resolve_none', address: e.address, detail: 'geocode miss' }); continue; }
    // County comes from the event when present, else the geocoded point —
    // modern flag events carry only {address, detail}, no county field.
    const county = countyOf(e) || await countyAt(g);
    const adapter = COUNTY_GIS[`${state.toLowerCase()}|${String(county).toLowerCase()}`] || COUNTY_GIS[`${state.toLowerCase()}|*`];
    if (!adapter) { emit({ stage: 'parcel_resolve_none', address: e.address, detail: `no parcel layer for ${county || '?'}, ${state}` }); continue; }
    const parts = { street: (e.address.match(/^\d+\s+(.+?),/) || [])[1] || '', number: (e.address.match(/^(\d+)/) || [])[1] || '' };
    const r = await adapter(g, parts);
    const inside = insidePick(e);
    // Unincorporated land (KY has no townships) means the county governs —
    // the pick is the county jurisdiction, not a municipality.
    const pickName = r.muni || (r.muni_type === 'unincorporated' && county ? `${county} County` : null);
    if (!pickName) { emit({ stage: 'parcel_resolve_none', address: e.address, detail: `parcel evidence empty (${r.how})` }); continue; }
    const parcelIs = normJ(pickName), insideIs = normJ(inside);
    if (insideIs && parcelIs === insideIs) {
      emit({ stage: 'parcel_resolve_ok', address: e.address, detail: `parcel ${r.how}${r.votes ? ` ${r.votes}` : ''} confirms ${pickName} — minting rule` });
      if (!DRY) { resolve(e.address, inside, county, state); markDone(e.address); }
    } else if (insideIs && parcelIs !== insideIs) {
      // parcel says the OTHER side — the inside-boundary pick was wrong; the
      // parcel district is the survey-level truth, so rule for the parcel's
      // municipality and log the correction loudly.
      emit({ stage: 'parcel_resolve_mismatch', address: e.address, detail: `pick ${inside} rejected — parcel district is ${pickName} (${r.how}${r.votes ? ` ${r.votes}` : ''}) — ruling for parcel` });
      if (!DRY) { resolve(e.address, pickName, county, state); markDone(e.address); }
    } else {
      // No candidate at all — "approximate address" flags. The municipal/
      // township boundary at the point IS jurisdiction truth; rule for it.
      emit({ stage: 'parcel_resolve_pick', address: e.address, detail: `no candidate — boundary truth is ${pickName} (${r.how}) — ruling for parcel` });
      if (!DRY) { resolve(e.address, pickName, county, state); markDone(e.address); }
    }
    await sleep(1200);
  }
  emit({ stage: 'parcel_resolve_done', detail: 'pass complete' });
}

(async () => {
  do {
    await waitWhilePaused('parcel-resolver', { item: 'parcel pass' });
    try { await pass(); } catch (e) { emit({ stage: 'parcel_resolve_error', detail: String(e?.message || e).slice(0, 180) }); }
    if (!ONCE) { heartbeat('parcel-resolver', 'idle', 'between passes'); await sleep(PASS_SLEEP); }
  } while (!ONCE);
})();
