#!/usr/bin/env node
// Profile relink applier — §1E of OPERATIONS_MASTERPLAN.
//
// Reads .audit-work/mirrors (localities + profiles-oh/ky), re-runs the
// lead-authored planner selection (identical logic to the 2026-11-24 dry-run
// generator .audit-work/relink-plan.mjs) so every decision is validated
// against CURRENT mirror state, then:
//   relink[]            → op:update PermitLocality.jurisdiction_profile_id (updateMany is REJECTED on this entity)
//   ambiguous_resolved[]→ derive the locality's county (office contact_address
//                         → Census geocode, office-name "X County" hints,
//                         locality-name geocode); a unique matching candidate
//                         relinks, otherwise needs_review
//   none[]              → needs_review
//   keepers             → where the target profile has 0 office_research.roles
//                         and the retired source has some: COPY the research
//                         onto the target (never move/delete)
//
// Usage:
//   node scripts/permitting-profile-relink.mjs            # dry run — prints + writes plan report
//   node scripts/permitting-profile-relink.mjs --apply    # enqueue the writes through the outbox
//   node scripts/permitting-profile-relink.mjs --verify   # after the flusher drains: readback samples
//
// Applied writes journal to .audit-work/relink-applied.jsonl
// ({locality_id, old_profile_id, new_profile_id, at}) — the undo record —
// and needs_review rows to .audit-work/relink-needs-review.jsonl.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getMirror, mirrorAgeMs } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { mirrorApply } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const REVERT = process.argv.includes('--revert') ? process.argv[process.argv.indexOf('--revert') + 1] : null;
const PLAN_FILE = '.audit-work/relink-plan.json';
// relink-log.jsonl is the undo record — --revert <this file> walks it back.
const APPLIED_LOG = '.audit-work/relink-log.jsonl';
const REVIEW_LOG = '.audit-work/relink-needs-review.jsonl';
const REPORT = '.audit-work/relink-report.json';
const CENSUS_GEOCODE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const CENSUS_COUNTY_LAYER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── planner selection — byte-for-byte the dry-run generator's logic ──────
const norm = (s) => String(s || '').toLowerCase().replace(/^(city|village|town) of /, '').replace(/\b(city|village|town|township|twp)\b/g, '').replace(/[^a-z0-9]/g, '');
const ctype = (t) => /township|twp/i.test(t || '') ? 'township' : /county/i.test(t || '') ? 'county' : 'municipal';
const ncounty = (s) => String(s || '').toLowerCase().replace(/county/g, '').replace(/[^a-z]/g, '');
function buildPlan(profiles, locs) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const linked = new Map(); for (const l of locs) linked.set(l.jurisdiction_profile_id, (linked.get(l.jurisdiction_profile_id) || 0) + 1);
  const active = profiles.filter((p) => p.verification_status !== 'historical');
  const idx = new Map(); for (const p of active) { const k = `${p.state}|${norm(p.name)}|${ctype(p.type)}`; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(p); }
  const research = (p) => (p.office_research?.roles || []).length;
  const out = { relink: [], ambiguous_resolved: [], none: [], ok: 0 };
  for (const l of locs) {
    const cur = byId.get(l.jurisdiction_profile_id);
    if (cur && cur.verification_status !== 'historical') { out.ok++; continue; }
    const lt = ctype(l.jurisdiction_type || l.name);
    let cands = idx.get(`${l.state}|${norm(l.name)}|${lt}`) || [];
    const lc = (String(l.county_name || '').split(/[\/;]/).map(ncounty).filter(Boolean));
    if (lc.length && cands.length > 1) { const f = cands.filter((p) => lc.includes(ncounty(p.parent_county?.name || p.county_name))); if (f.length) cands = f; }
    if (lc.length) cands = cands.filter((p) => { const pc = ncounty(p.parent_county?.name || p.county_name); return !pc || lc.includes(pc); });
    const nv = (l.offices || []).filter((o) => o.authority_verification_status !== 'staff_verified').length;
    const rec = { locality_id: l.id, name: l.name, state: l.state, county: l.county_name, type: lt, from: l.jurisdiction_profile_id, from_status: cur ? cur.verification_status : 'missing', unverified_offices: nv };
    if (!cands.length) { out.none.push(rec); continue; }
    const ranked = [...cands].sort((a, b) => (linked.get(b.id) || 0) - (linked.get(a.id) || 0) || research(b) - research(a) || (b.documents || []).length - (a.documents || []).length);
    const pick = ranked[0];
    const r = { ...rec, to: pick.id, to_name: pick.name, to_county: pick.parent_county?.name || pick.county_name || null, to_research_roles: research(pick), to_docs: (pick.documents || []).length, from_research_roles: cur ? research(cur) : 0, candidates: cands.length, candidate_ids: cands.map((c) => c.id) };
    (cands.length > 1 ? out.ambiguous_resolved : out.relink).push(r);
  }
  return out;
}

// ── county derivation for ambiguous rows (Census geocoder path, free) ────
async function fetchJSON(url, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(800 * (i + 1)); continue; }
      return await r.json();
    } catch (e) { last = e; await sleep(800 * (i + 1)); }
  }
  throw last;
}
async function censusCounty(address) {
  try {
    const data = await fetchJSON(`${CENSUS_GEOCODE}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`);
    const c = data?.result?.addressMatches?.[0]?.addressComponents?.county;
    return c || null;
  } catch { return null; }
}
// The resolver's free county path: nominatim point → Census State_County
// boundary layer. (onelineaddress needs a street, so place names geocode
// here instead.) Same geometry helpers as permitting-address-validation.
function pointInRings(rings, p) {
  let inside = false;
  for (const ring of rings || []) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
let lastNominatim = 0;
async function geocodeNominatim(address) {
  const wait = Math.max(0, lastNominatim + 1050 - Date.now()); // OSM policy: 1 req/s
  if (wait) await sleep(wait);
  lastNominatim = Date.now();
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=${encodeURIComponent(address)}`, { headers: { 'User-Agent': 'ccs-signage-permitting-relink/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const hit = (await r.json())?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    return { lat: Number(hit.lat), lng: Number(hit.lon) };
  } catch { return null; }
}
async function countyAt(point) {
  try {
    const params = new URLSearchParams({ f: 'json', where: '1=1', geometry: JSON.stringify({ x: point.lng, y: point.lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '25', units: 'esriSRUnit_Meter', outFields: 'NAME', returnGeometry: 'true', outSR: '4326', resultRecordCount: '5' });
    const data = await fetchJSON(`${CENSUS_COUNTY_LAYER}/query?${params}`);
    const inside = (data?.features || []).filter((f) => pointInRings(f.geometry?.rings, point));
    const nm = inside.length === 1 ? String(inside[0].attributes.NAME || '') : '';
    return /county$/i.test(nm) ? nm : nm ? `${nm} County` : null;
  } catch { return null; }
}
// Office-name identity hint — 'Deerfield Township Planning & Zoning' names
// the jurisdiction directly. When candidates mix types (the widened
// no-candidate search), exactly one hinted candidate beats a geocode.
function officeHint(loc, cands) {
  const hinted = new Set();
  for (const o of loc.offices || []) {
    const on = String(o.name || '').toLowerCase();
    if (!on) continue;
    for (const c of cands) {
      const cn = String(c.name || '').toLowerCase().replace(/^(city|village|town) of /, '').trim();
      if (cn.length < 4 || !on.includes(cn)) continue;
      const t = ctype(c.type);
      if (t === 'township' && !/\btownship\b|\btwp\b/.test(on)) continue;
      if (t === 'county' && !/\bcounty\b/.test(on)) continue;
      hinted.add(c.id);
    }
  }
  return hinted.size === 1 ? [...hinted][0] : null;
}
// Returns {county, via} or null — office addresses, office-name county hints,
// then the locality's own name geocoded.
async function deriveCounty(loc, cands) {
  for (const o of loc.offices || []) {
    const addr = o.contact_address || o.address;
    if (addr) { const c = await censusCounty(`${addr}, ${loc.state}`); if (c) return { county: c, via: 'office_address' }; }
  }
  const candCounties = new Map();
  for (const p of cands) { const pc = ncounty(p.parent_county?.name || p.county_name); if (pc && !candCounties.has(pc)) candCounties.set(pc, p.parent_county?.name || p.county_name); }
  const hinted = new Set();
  for (const o of loc.offices || []) {
    for (const m of String(o.name || '').matchAll(/\b([A-Z][a-z]+)\s+County\b/g)) {
      if (candCounties.has(ncounty(m[0]))) hinted.add(m[0]);
    }
  }
  if (hinted.size === 1) return { county: [...hinted][0], via: 'office_name' };
  const bare = `${String(loc.name || '').replace(/\s+(city|village|town|township)$/i, '')}, ${loc.state}`;
  const c = await censusCounty(bare);
  if (c) return { county: c, via: 'name_geocode' };
  const pt = await geocodeNominatim(bare);
  if (pt) {
    const bc = await countyAt(pt);
    if (bc) return { county: bc, via: 'name_geocode_boundary' };
  }
  return null;
}

// ── gateway (readback verification only) ──────────────────────────────────
let token = null;
async function login() {
  for (let i = 0; i < 8; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return true; }
    await sleep(3000 + i * 2000);
  }
  return false;
}
async function call(fn, body, retried = false) {
  await paceCall(fn);
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }), signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!r) return { error: 'network' };
  if ((r.status === 401 || r.status === 403) && !retried) { await login(); return call(fn, body, true); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(6000); return call(fn, body, retried); }
  if (!r.ok) return { error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}` };
  return j;
}
const readById = async (entity, id) => {
  // Point reads by id are served live (the 45s cache only bites list reads);
  // a `cursor` param is NOT accepted on staffDataRead — it 400s the request.
  const j = await call('staffDataRead', { entity, query: { id }, limit: 1 });
  return (j?.records || j?.items || j?.data || [])[0] || null;
};

function loadData() {
  for (const m of ['localities', 'profiles-oh', 'profiles-ky']) {
    const age = mirrorAgeMs(m);
    if (!Number.isFinite(age)) throw new Error(`mirror ${m} missing`);
    if (age > 25 * 60 * 1000) console.warn(`warn: mirror ${m} is ${Math.round(age / 60000)}min old — waiting for mirror-sync freshness is safer`);
  }
  const profiles = [...(getMirror('profiles-oh.slim')?.rows || []), ...(getMirror('profiles-ky.slim')?.rows || [])];
  const locs = (getMirror('localities')?.rows || []).filter((r) => !r.duplicate_of);
  return { profiles, locs };
}

async function main() {
  const { profiles, locs } = loadData();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const locById = new Map(locs.map((l) => [l.id, l]));
  const plan = buildPlan(profiles, locs);
  const sum = (a) => a.reduce((s, r) => s + r.unverified_offices, 0);
  console.log(`fresh plan — ok ${plan.ok} · relink ${plan.relink.length} (${sum(plan.relink)} offices) · ambiguous ${plan.ambiguous_resolved.length} · none ${plan.none.length}`);
  let prior = null;
  try { prior = JSON.parse(readFileSync(PLAN_FILE, 'utf8')); } catch {}
  if (prior) console.log(`stored plan (input file) — relink ${prior.relink?.length} · ambiguous ${prior.ambiguous_resolved?.length} · none ${prior.none?.length} — fresh plan governs the apply`);
  writeFileSync(PLAN_FILE, JSON.stringify({ ...plan, generated: new Date().toISOString() }, null, 1));

  // ── validate relink entries against the CURRENT mirror ──────────────────
  const applyList = [], skipped = [], copyList = [], reviewList = [];
  for (const r of plan.relink) {
    const loc = locById.get(r.locality_id);
    const cur = loc ? byId.get(loc.jurisdiction_profile_id) : null;
    const to = byId.get(r.to);
    if (!loc) { skipped.push({ ...r, why: 'locality missing' }); continue; }
    if (loc.duplicate_of) { skipped.push({ ...r, why: 'locality tombstoned' }); continue; }
    if (String(loc.jurisdiction_profile_id || '') !== String(r.from || '')) { skipped.push({ ...r, why: `link changed since plan (${loc.jurisdiction_profile_id})` }); continue; }
    if (cur && cur.verification_status !== 'historical') { skipped.push({ ...r, why: 'link already active' }); continue; }
    if (!to) { skipped.push({ ...r, why: 'target profile missing' }); continue; }
    if (to.verification_status === 'historical') { skipped.push({ ...r, why: 'target retired since plan' }); continue; }
    applyList.push({ rec: r, loc, to });
    if (keeperCopy(to, cur)) copyList.push({ rec: r, from: cur, to });
  }

  // ── ambiguous: derive county, unique match relinks, else needs_review ───
  const ambResolved = [];
  for (const r of plan.ambiguous_resolved) {
    const loc = locById.get(r.locality_id);
    if (!loc || loc.duplicate_of) { reviewList.push({ ...r, reason: 'locality_missing_or_tombstoned' }); continue; }
    const cands = (r.candidate_ids || []).map((id) => byId.get(id)).filter(Boolean);
    const got = await deriveCounty(loc, cands);
    if (!got) { reviewList.push({ ...r, reason: 'county_underivable' }); continue; }
    const match = cands.filter((p) => ncounty(p.parent_county?.name || p.county_name) === ncounty(got.county));
    if (match.length === 1) ambResolved.push({ rec: { ...r, to: match[0].id, to_name: match[0].name, to_county: match[0].parent_county?.name || match[0].county_name || null, derived_county: got.county, via: got.via }, loc, to: match[0] });
    else reviewList.push({ ...r, reason: `county ${got.county} matched ${match.length} candidate(s)`, via: got.via });
  }
  // ── no-candidate rows: widen across ALL profile types before holding ───
  // A missing jurisdiction_type makes ctype() guess 'municipal', hiding real
  // township/county profiles (the Deerfield case). Retry with the type
  // constraint dropped, then disambiguate: office-name identity hint first,
  // Census/TIGER county match second. Still 0 or >1 → hold with evidence.
  const active = profiles.filter((p) => p.verification_status !== 'historical');
  const noneResolved = [];
  let evidenceCalls = 0;
  for (const r of plan.none) {
    const loc = locById.get(r.locality_id);
    if (!loc || loc.duplicate_of) { reviewList.push({ ...r, reason: 'locality_missing_or_tombstoned' }); continue; }
    const cands = active.filter((p) => String(p.state) === String(loc.state) && norm(p.name) === norm(String(loc.name || '').replace(/ *[(][^)]*[)]/g, '')));
    if (!cands.length) {
      // Record what free geocoding says about the place so the hold carries
      // evidence — capped so a large none list can't queue hours of lookups.
      let ev = null;
      if (evidenceCalls < 40) { evidenceCalls++; ev = await deriveCounty(loc, []); }
      reviewList.push({ ...r, reason: 'no_candidate', via: ev?.via, derived_county: ev?.county });
      continue;
    }
    let match = null, via = null;
    const hint = officeHint(loc, cands);
    if (hint) { match = cands.filter((c) => c.id === hint); via = 'office_name_hint'; }
    if (!match) {
      const got = await deriveCounty(loc, cands);
      if (!got) { reviewList.push({ ...r, reason: 'county_underivable', candidates: cands.length, candidate_ids: cands.map((c) => c.id) }); continue; }
      const f = cands.filter((p) => ncounty(p.parent_county?.name || p.county_name) === ncounty(got.county));
      if (f.length !== 1) { reviewList.push({ ...r, reason: `county ${got.county} matched ${f.length} candidate(s)`, via: got.via, candidates: cands.length, candidate_ids: cands.map((c) => c.id) }); continue; }
      match = f; via = `widened_${got.via}`;
    }
    const to = match[0];
    noneResolved.push({ rec: { ...r, to: to.id, to_name: to.name, to_county: to.parent_county?.name || to.county_name || null, candidates: cands.length, via }, loc, to });
  }

  console.log(`\nvalidated — apply ${applyList.length} · skip ${skipped.length} · ambiguous→relink ${ambResolved.length} · none→relink ${noneResolved.length} · needs_review ${reviewList.length} · keeper copies ${copyList.length}`);
  for (const s of skipped.slice(0, 10)) console.log('  SKIP', s.name, s.state, '-', s.why);
  for (const a of ambResolved) console.log('  AMB→', a.rec.name, a.rec.state, '|', a.rec.derived_county, `(${a.rec.via})`, '→', a.to.name, a.rec.to_county);
  for (const n of noneResolved) console.log('  NONE→', n.rec.name, n.rec.state, '|', n.rec.via, '→', n.to.name, n.rec.to_county);
  for (const rv of reviewList.slice(0, 10)) console.log('  REVIEW', rv.name, rv.state, '-', rv.reason);
  const report = { at: new Date().toISOString(), applied_plan: 'current-mirror replan', apply: applyList.map((a) => a.rec), skipped, amb_resolved: ambResolved.map((a) => a.rec), none_resolved: noneResolved.map((n) => n.rec), needs_review: reviewList, keeper_copies: copyList.map((c) => ({ locality_id: c.rec.locality_id, profile: c.to.id, roles: (c.from.office_research?.roles || []).length })) };
  writeFileSync(REPORT, JSON.stringify(report, null, 1));
  // needs-review.jsonl is CURRENT STATE (the ledger's held list reads it), not
  // history — rewrite per run so resolved items stop surfacing. The report
  // file above is the archive.
  writeFileSync(REVIEW_LOG, reviewList.map((rv) => JSON.stringify({ locality_id: rv.locality_id, name: rv.name, state: rv.state, reason: rv.reason, candidates: rv.candidates || 0, derived_county: rv.derived_county, via: rv.via, at: new Date().toISOString() })).join('\n') + (reviewList.length ? '\n' : ''));
  if (!APPLY) { console.log(`\ndry run — report at ${REPORT} · pass --apply to enqueue`); return; }

  // ── enqueue: PermitLocality allows only create/update (NO updateMany —
  // the gateway rejects it with "record type cannot be written here") so
  // relinks ride the same op:update {id,data} shape every other worker
  // uses; the single-field $set-equivalent lands via update-merge. ────────
  const j = (file, rec) => appendFileSync(file, JSON.stringify(rec) + '\n');
  let queued = 0;
  for (const a of [...applyList, ...ambResolved, ...noneResolved]) {
    // County backfill — when the locality's county_name is empty and the target
    // profile carries one, fix the identity alongside the link (the missing
    // county is what held Harrison). Logged for revert.
    const countyFix = !a.loc.county_name && a.rec.to_county ? a.rec.to_county : null;
    enqueue({
      entity: 'PermitLocality', op: 'update', id: a.loc.id,
      data: { jurisdiction_profile_id: a.to.id, ...(countyFix ? { county_name: countyFix } : {}) },
      note: `profile relink — ${a.loc.name}, ${a.loc.state} → ${a.to.name}`,
      tag: 'relink',
    });
    mirrorApply('localities', { id: a.loc.id, jurisdiction_profile_id: a.to.id, ...(countyFix ? { county_name: countyFix } : {}) });
    j(APPLIED_LOG, { locality_id: a.loc.id, old_profile_id: a.loc.jurisdiction_profile_id || null, new_profile_id: a.to.id, old_county_name: a.loc.county_name || null, new_county_name: countyFix, at: new Date().toISOString(), via: a.rec.via || 'single_candidate' });
    queued++;
  }
  for (const c of copyList) {
    const mirror = String(c.to.state || '').toUpperCase() === 'KY' ? 'profiles-ky' : 'profiles-oh';
    enqueue({
      entity: 'JurisdictionProfile', op: 'update', id: c.to.id,
      data: { office_research: c.from.office_research },
      note: `research copy — ${c.rec.name} target keeper (${(c.from.office_research?.roles || []).length} roles)`,
      tag: 'relink',
    });
    mirrorApply(mirror, { id: c.to.id, office_research: c.from.office_research });
    j(APPLIED_LOG, { profile_copy: true, target_profile_id: c.to.id, source_profile_id: c.from.id, roles: (c.from.office_research?.roles || []).length, at: new Date().toISOString() });
    queued++;
  }
  console.log(`enqueued ${queued} writes (${applyList.length + ambResolved.length + noneResolved.length} relinks + ${copyList.length} research copies); ${reviewList.length} needs_review recorded — outbox drains at the fleet's write rate`);
}

// ── --verify: sample-read applied writes after the flusher drains ─────────
async function verify() {
  if (!existsSync(APPLIED_LOG)) { console.log('no relink-applied.jsonl yet'); return; }
  const applied = readFileSync(APPLIED_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const relinks = applied.filter((a) => !a.profile_copy && !a.revert);
  const copies = applied.filter((a) => a.profile_copy);
  if (!(await login())) { console.log('login failed'); process.exit(1); }
  const sample = (arr, n) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
  // --first N reads back EVERY one of the first N applied relinks (the
  // staged first-batch rule); otherwise a 20-wide sample.
  const FIRST = Number(process.argv[process.argv.indexOf('--first') + 1]) || 0;
  const check = FIRST ? relinks.slice(0, FIRST) : sample(relinks, 20);
  let ok = 0, bad = [];
  for (const a of check) {
    const row = await readById('PermitLocality', a.locality_id);
    if (row?.jurisdiction_profile_id === a.new_profile_id) ok++;
    else bad.push({ id: a.locality_id, got: row?.jurisdiction_profile_id, want: a.new_profile_id });
  }
  console.log(`locality readback: ${ok}/${check.length} links live`);
  if (bad.length) console.log('  mismatches:', JSON.stringify(bad));
  let cok = 0, cbad = [];
  for (const c of sample(copies, 10)) {
    const row = await readById('JurisdictionProfile', c.target_profile_id);
    const n = (row?.office_research?.roles || []).length;
    if (n >= c.roles) cok++; else cbad.push({ id: c.target_profile_id, got: n, want: c.roles });
  }
  console.log(`research-copy readback: ${cok}/${Math.min(10, copies.length)} profiles carry roles`);
  if (cbad.length) console.log('  misses:', JSON.stringify(cbad));
}

// ── --revert <log>: undo every forward relink in a relink-log.jsonl ───────
// Reverse write is CAS'd on the mirror's current updated_date like the
// forward path. Profile research copies are additive — no undo needed.
// Entries whose forward link never landed (or was already reverted) skip.
// Pure core: which log entries produce a reverse write for these localities.
// Skips profile_copy/revert rows and entries whose forward link isn't live.
function revertEntries(lines, locs) {
  const locById = new Map(locs.map((l) => [l.id, l]));
  const out = [];
  for (const e of lines) {
    if (!e || e.profile_copy || e.revert) continue;
    const loc = locById.get(e.locality_id);
    if (!loc || String(loc.jurisdiction_profile_id || '') !== String(e.new_profile_id || '')) continue;
    out.push({ loc, back: e.old_profile_id || null });
  }
  return out;
}
async function revert(logPath) {
  const { locs } = loadData();
  const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const todo = revertEntries(lines, locs);
  const skipped = lines.filter((e) => e && !e.profile_copy && !e.revert).length - todo.length;
  let queued = 0;
  for (const { loc, back } of todo) {
    const from = loc.jurisdiction_profile_id || null;
    enqueue({
      entity: 'PermitLocality', op: 'update', id: loc.id,
      data: { jurisdiction_profile_id: back },
      note: `relink revert — ${loc.name}, ${loc.state}`,
      tag: 'relink-revert',
    });
    mirrorApply('localities', { id: loc.id, jurisdiction_profile_id: back });
    appendFileSync(APPLIED_LOG, JSON.stringify({ revert: true, locality_id: loc.id, old_profile_id: from, new_profile_id: back, at: new Date().toISOString() }) + '\n');
    queued++;
  }
  console.log(`revert ${logPath} — ${queued} writes enqueued · ${skipped} skipped (forward link not live)`);
}

// Research carry-over rule: the active target keeps its own research; only
// when it has NONE and the retired source has roles do we copy across.
export function keeperCopy(to, cur) {
  return (to?.office_research?.roles || []).length === 0 && !!cur && (cur.office_research?.roles || []).length > 0;
}

export { buildPlan, revertEntries };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  if (REVERT) revert(REVERT);
  else if (VERIFY) verify();
  else main();
}
