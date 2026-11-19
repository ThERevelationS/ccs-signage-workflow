#!/usr/bin/env node
// Office sweep — enumerates EVERY permitting jurisdiction in OH + KY from the
// states' own GIS layers (the same sources the resolver trusts) and ensures
// each has: JurisdictionProfile → SourceCollectionQueue row → PermitLocality
// draft. This is the supply side of the office pipeline — the research
// dispatch drains the queue and fills real office data.
//
// Slicing: run N instances with --slice i --slices N; work is partitioned by
// county-group so workers can never collide on the same entity.
//
// Idempotent: locality exists → skip; profile exists → reuse; queue row
// exists → skip. Re-running a county converges to "already exists".
// Persistent failures land in .audit-work/sweep-fix-list.json (10 attempts).
//
// Usage:
//   node scripts/permitting-office-sweep.mjs --slice 0 --slices 4 [--delay-ms 1500] [--dry-run]
// Emits sweep_* / office_* / research_* stages to .live-events.jsonl.
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';
import { jurisdictionToPermitLocality, normalizePermitJurisdictionName } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { normalizeAddressState } from '../src/shared/permittingAddressState.js';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const SLICE = args.includes('--slice') ? Number(args[args.indexOf('--slice') + 1]) : 0;
const SLICES = args.includes('--slices') ? Number(args[args.indexOf('--slices') + 1]) : 1;
const DELAY = args.includes('--delay-ms') ? Number(args[args.indexOf('--delay-ms') + 1]) : 1500;
const DRY = args.includes('--dry-run');
const EVENTS = '.live-events.jsonl';
const ATTEMPTS_FILE = `.audit-work/sweep-attempts-${SLICE}.json`;
const FIXLIST = `.audit-work/sweep-fix-list.json`;
const MAX_ATTEMPTS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── enumeration sources (same layers the resolver queries) ──
const SRC = {
  tigerCounties: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=STATE%3D%27{FIPS}%27&outFields=BASENAME,GEOID&returnGeometry=false&resultRecordCount=200&f=json',
  // FUNCSTAT='A' is the functioning-civil-township filter: Ohio's official
  // 1,308 townships. 'F' rows are incorporated places standing in as their own
  // county subdivision (paper-township territory) — NOT townships. 'N'/'I'/'C'
  // rows are nonfunctioning/statistical. This is the same layer the resolver
  // uses for township boundaries.
  ohTownships: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/1/query?where=STATE%3D%2739%27%20AND%20FUNCSTAT%3D%27A%27&outFields=BASENAME,COUNTY,GEOID&returnGeometry=false&resultRecordCount=2000&f=json',
  ohMunicipalities: 'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0/query?where=1%3D1&outFields=municipality,fips_code&returnGeometry=false&resultRecordCount=2000&f=json',
  kyCities: 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0/query?where=1%3D1&outFields=NAME,COUNTY,CLASS,COSEAT&returnGeometry=false&resultRecordCount=1000&f=json',
};
async function fetchJSON(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(1500 * (i + 1)); continue; }
      return await r.json();
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw last;
}

// ── app plumbing (same shapes as permitting-bulk-office-drafts.mjs) ──
let token = '';
async function freshToken() {
  for (let i = 0; i < 5; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return; }
    await sleep(3000 + i * 3000);
  }
  throw new Error('login failed');
}
async function call(fn, body, retried = false, serverRetry = 0) {
  await paceCall(fn);
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }) });
  if ((r.status === 401 || r.status === 403) && !retried) { await freshToken(); return call(fn, body, true); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(4000); return call(fn, body, retried, serverRetry); }
  if ((r.status >= 500 || j?.error === 'user-exception') && serverRetry < 6) {
    await sleep(3000 * (serverRetry + 1));
    return call(fn, body, retried, serverRetry + 1);
  }
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}

const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `sweep${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };

// ── identity rules (mirror the picker's isDetectedCandidate exactly) ──
const TYPE_MAP = { municipality: ['city', 'village', 'municipality'], township: ['township'], county: ['county'] };
const countyOf = (v) => String(v || '').toLowerCase().replace(/\s*county$/u, '').trim();
function identityOk(profile, target) {
  if (!profile || !target) return false;
  if (String(profile.duplicate_of || '').trim()) return false;
  if (String(profile.verification_status || '').toLowerCase() === 'historical') return false;
  return (TYPE_MAP[target.type] || [target.type]).includes(String(profile.type || '').toLowerCase())
    && normalizePermitJurisdictionName(profile.name) === normalizePermitJurisdictionName(target.name)
    && normalizeAddressState(profile.state) === normalizeAddressState(target.state)
    && (!target.county || !profile.parent_county?.name || countyOf(profile.parent_county.name) === countyOf(target.county));
}
function queueKeyFor(name, state, type, parentCounty) {
  const t = String(type || '').toLowerCase();
  const qt = t === 'county' ? 'county' : t === 'township' ? 'township' : t === 'village' ? 'village' : 'city';
  return [String(name || '').trim().toLowerCase(), String(state || '').trim().toLowerCase(), qt, String(parentCounty || '').trim().toLowerCase()].join('|');
}
const qtypeFor = (type) => ({ county: 'county', township: 'township', village: 'village' }[type] || 'city');

// ── enumerate the whole sweep once, then partition ──
async function enumerateTargets() {
  const [ohCounties, kyCounties, ohTwp, ohMuni, kyCity] = await Promise.all([
    fetchJSON(SRC.tigerCounties.replace('{FIPS}', '39')),
    fetchJSON(SRC.tigerCounties.replace('{FIPS}', '21')),
    fetchJSON(SRC.ohTownships),
    fetchJSON(SRC.ohMunicipalities),
    fetchJSON(SRC.kyCities),
  ]);
  const targets = [];
  const ohCountyByFips = {};
  for (const f of ohCounties.features || []) { targets.push({ name: `${f.attributes.BASENAME} County`, state: 'OH', type: 'county', county: f.attributes.BASENAME, geoid: f.attributes.GEOID }); ohCountyByFips[String(f.attributes.GEOID).slice(2)] = f.attributes.BASENAME; }
  for (const f of kyCounties.features || []) targets.push({ name: `${f.attributes.BASENAME} County`, state: 'KY', type: 'county', county: f.attributes.BASENAME, geoid: f.attributes.GEOID });
  for (const f of ohTwp.features || []) {
    const twp = String(f.attributes.BASENAME || '').trim();
    const county = ohCountyByFips[String(f.attributes.COUNTY || '').padStart(3, '0')] || '';
    if (!twp || !county) continue;
    targets.push({ name: `${twp} Township`, state: 'OH', type: 'township', county, geoid: f.attributes.GEOID });
  }
  for (const f of ohMuni.features || []) {
    const m = String(f.attributes.municipality || '').trim();
    if (!m) continue;
    targets.push({ name: m, state: 'OH', type: 'municipality', county: '', geoid: f.attributes.fips_code });
  }
  for (const f of kyCity.features || []) {
    const c = String(f.attributes.NAME || '').trim();
    if (!c) continue;
    // Proper-case the all-caps state layer ("ADAIRVILLE" → "Adairville")
    const proper = (s) => String(s || '').toLowerCase().replace(/(^|\s|[-'])([a-z])/g, (m, p, ch) => p + ch.toUpperCase());
    const name = proper(c);
    targets.push({ name, state: 'KY', type: 'municipality', county: proper(f.attributes.COUNTY), geoid: String(f.attributes.FIPS || ''), ky_class: f.attributes.CLASS, county_seat: f.attributes.COSEAT === 'YES' });
  }
  // Partition by county-group: every entity hangs off (state|county) — OH
  // municipalities carry no county on the state layer (names unique statewide)
  // so they hash on the name itself.
  const mine = targets.filter((t) => {
    const key = `${t.state}|${t.county || t.name}`.toLowerCase();
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % SLICES === SLICE;
  });
  return { all: targets.length, mine };
}

// ── startup loads ──
// staffDataRead caps `limit` at 5000 — page with `skip` beyond that
// truncates and the dedupe sets below would create duplicates past row 500.
// Page with `skip` until a short page comes back.
async function readAllRows(entity, query = {}) {
  const out = [];
  for (let skip = 0; skip < 20000; skip += 5000) {
    const j = await call('staffDataRead', { entity, query, limit: 5000, skip });
    const items = j.items || [];
    out.push(...items);
    if (items.length < 5000) break;
  }
  return out;
}
let localities = null, localityIds = null, profiles = null, queued = null;
async function loadAll() {
  // Mirror-first: the sync daemon owns remote reads; self-sync only if it's dead.
  const [lj, poh, pky, qj] = await Promise.all([
    mirrorRead('localities', 45 * 60 * 1000, async () => null),
    mirrorRead('profiles-oh', 45 * 60 * 1000, async () => null),
    mirrorRead('profiles-ky', 45 * 60 * 1000, async () => null),
    mirrorRead('queue', 20 * 60 * 1000, async () => null),
  ]);
  localities = lj || [];
  localityIds = new Set(localities.map((l) => `${normalizePermitJurisdictionName(l.name)}|${normalizeAddressState(l.state)}`));
  profiles = [...(poh || []), ...(pky || [])];
  queued = new Set((qj || []).map((r) => queueKeyFor(r.jurisdiction_name, r.state, r.jurisdiction_type, r.parent_county_name)));
}

const attempts = existsSync(ATTEMPTS_FILE) ? JSON.parse(readFileSync(ATTEMPTS_FILE, 'utf8')) : {};
const fixList = existsSync(FIXLIST) ? JSON.parse(readFileSync(FIXLIST, 'utf8')) : [];
const fixKeys = new Set(fixList.map((f) => f.key));
const saveAttempts = () => { try { writeFileSync(ATTEMPTS_FILE, JSON.stringify(attempts)); } catch {} };
const saveFixList = () => { try { writeFileSync(FIXLIST, JSON.stringify(fixList)); } catch {} };

// Pending-create ledger — local-only (NOT the shared mirrors, so no other
// worker ever sees a phantom row with a fake id). Keyed by the same identity
// key as `attempts`; entries drop once the real record shows up in a mirror.
const PENDING_FILE = '.audit-work/sweep-pending.json';
let pending = existsSync(PENDING_FILE) ? JSON.parse(readFileSync(PENDING_FILE, 'utf8')) : {};
const savePending = () => { try { writeFileSync(PENDING_FILE, JSON.stringify(pending)); } catch {} };

async function ensureQueueRow(target) {
  const qtype = qtypeFor(target.type === 'municipality' ? 'city' : target.type);
  const key = queueKeyFor(target.name, target.state, qtype, target.county || '');
  if (queued.has(key)) return { queued: true, existed: true };
  // Buffered create — the flusher lands it; the local `queued` set prevents
  // re-enqueue within this run and the pending ledger across restarts.
  enqueue({ entity: 'SourceCollectionQueue', op: 'create', data: { jurisdiction_name: target.name, state: target.state, jurisdiction_type: qtype, parent_county_name: target.county || null, status: 'not_started', dispatch_rank: 1, missing_next: 'Office research — queued by the statewide office sweep.' }, note: `sweep queue — ${target.name}, ${target.state}` });
  queued.add(key);
  return { queued: true, pending: true };
}

async function processTarget(target) {
  const key = `${normalizePermitJurisdictionName(target.name)}|${normalizeAddressState(target.state)}|${target.type}|${countyOf(target.county)}`;
  const label = `${target.name}, ${target.state} (${target.type}${target.county ? ', ' + target.county + ' Co.' : ''})`;
  if (fixKeys.has(key)) { emit({ stage: 'sweep_skipped_fixlist', address: label, ok: true, detail: 'on the fix list — skipped' }); return; }
  attempts[key] = (attempts[key] || 0) + 1; saveAttempts();
  if (attempts[key] > MAX_ATTEMPTS) {
    if (!fixKeys.has(key)) { fixKeys.add(key); fixList.push({ key, target, attempts: attempts[key], moved_at: new Date().toISOString() }); saveFixList(); }
    emit({ stage: 'sweep_stuck', address: label, ok: false, detail: `${MAX_ATTEMPTS} attempts — moved to the sweep fix list` });
    return;
  }
  emit({ start: true, address: label });
  try {
    if (localityIds.has(`${normalizePermitJurisdictionName(target.name)}|${normalizeAddressState(target.state)}`)) {
      await ensureQueueRow(target);
      emit({ stage: 'office_exists', address: label, ok: true, detail: 'office record already exists — research queue confirmed' });
      delete attempts[key]; saveAttempts();
      return;
    }
    const cands = profiles.filter((p) => identityOk(p, target));
    let profile = null;
    if (cands.length === 1) {
      profile = cands[0];
      if (pending[key]?.profile) { delete pending[key].profile; savePending(); } // real row landed
    } else if (cands.length === 0) {
      const pendAge = pending[key]?.at ? Date.now() - new Date(pending[key].at).getTime() : 0;
      if (pending[key]?.profile && pendAge < 24 * 60 * 60 * 1000) {
        emit({ stage: 'profile_pending', address: label, ok: true, detail: `profile create buffered — waiting for the flusher + mirror sync (${Math.round(pendAge / 60000)}m)` });
        return;
      }
      if (pending[key]?.profile) { delete pending[key].profile; savePending(); emit({ stage: 'profile_pending_stale', address: label, ok: false, detail: 'buffered profile never landed (24h) — re-enqueueing' }); }
      await ensureQueueRow(target);
      emit({ stage: 'research_queued', address: label, ok: true, detail: 'queued for office research (sweep)' });
      const pdata = {
        name: target.name, state: target.state,
        type: target.type === 'municipality' ? 'city' : target.type,
        auto_refresh: true, verification_status: 'needs_verification',
        ...(target.county ? { parent_county: { name: target.county } } : {}),
        activity_log: [{ id: crypto.randomUUID(), action: 'created', description: 'Created automatically by the statewide office sweep; office research queued.', user: 'system:permittingOfficeSweep', timestamp: new Date().toISOString() }],
        notes: `Auto-created by the statewide office sweep (${target.state} GIS enumeration${target.geoid ? ', geoid ' + target.geoid : ''}). Office research queued.`,
      };
      enqueue({ entity: 'JurisdictionProfile', op: 'create', data: pdata, mirror: `profiles-${String(target.state || '').toLowerCase()}`, note: `sweep profile — ${label}` });
      pending[key] = { ...(pending[key] || {}), profile: true, at: new Date().toISOString() }; savePending();
      emit({ stage: 'profile_created', address: label, ok: true, detail: 'repository profile create buffered — locality waits for the real id' });
      return; // no real profile.id yet — the locality needs it; next pass creates it
    } else {
      // Same-name collision — same deterministic collapse as the generator.
      const parents = new Set(cands.map((p) => countyOf(p.parent_county?.name || '')).filter(Boolean));
      if (parents.size > 1) { emit({ stage: 'no_profile', address: label, ok: false, detail: `${cands.length} same-name candidates across different counties — needs a human to pick` }); return; }
      const countyTarget = countyOf(target.county || '');
      const rank = (p) => (countyTarget && countyOf(p.parent_county?.name || '') === countyTarget ? 4 : 0) + (p.verification_status === 'verified' ? 2 : 0) + ((p.office_research?.roles || []).length > 0 ? 1 : 0);
      const sorted = [...cands].sort((a, b) => rank(b) - rank(a) || String(a.created_date || '').localeCompare(String(b.created_date || '')));
      profile = sorted[0];
      for (const loser of sorted.slice(1)) {
        enqueue({ entity: 'JurisdictionProfile', op: 'update', id: loser.id, data: { verification_status: 'historical' }, mirror: `profiles-${String(loser.state || target.state || '').toLowerCase()}`, note: `sweep dedupe — ${loser.name}` });
        mirrorApply(`profiles-${String(loser.state || target.state || '').toLowerCase()}`, { id: loser.id, verification_status: 'historical' });
      }
      emit({ stage: 'profile_deduped', address: label, ok: true, detail: `${cands.length} same-name records collapsed → kept ${profile.id}` });
      await ensureQueueRow(target);
    }
    if (pending[key]?.locality) {
      // Buffered create in flight — wait for the mirror to show the real row.
      if (Date.now() - new Date(pending[key].at || 0).getTime() < 24 * 60 * 60 * 1000) return;
      delete pending[key].locality; savePending();
    }
    let payload;
    try { payload = jurisdictionToPermitLocality(profile); } catch (e) { emit({ stage: 'no_profile', address: label, ok: false, detail: String(e?.message || e).slice(0, 120) }); return; }
    enqueue({ entity: 'PermitLocality', op: 'create', data: payload, mirror: 'localities', note: `sweep locality — ${label}` });
    pending[key] = { ...(pending[key] || {}), locality: true, at: new Date().toISOString() }; savePending();
    localityIds.add(`${normalizePermitJurisdictionName(payload.name)}|${normalizeAddressState(payload.state)}`); // in-run dedupe; mirror adds it once flushed
    emit({ stage: 'office_created', address: label, ok: true, detail: `office record create buffered — ${(payload.offices || []).length} office(s), lands via the flusher` });
    delete attempts[key]; saveAttempts();
  } catch (err) {
    emit({ stage: 'office_error', address: label, ok: false, detail: String(err?.message || err).slice(0, 120) });
  }
  await sleep(DELAY);
}

// ── run ──
await freshToken();
emit({ stage: 'sweep_start', address: `slice ${SLICE}/${SLICES}`, ok: true, detail: 'enumerating OH + KY jurisdictions from state GIS' });
const { all, mine } = await enumerateTargets();
await loadAll();
emit({ stage: 'sweep_enumerated', address: `slice ${SLICE}/${SLICES}`, ok: true, detail: `${all} jurisdictions enumerated statewide — ${mine.length} assigned to this worker` });
console.log(`sweep ${SLICE}/${SLICES}: ${mine.length} of ${all} jurisdictions — ${localities.length} localities, ${profiles.length} profiles, ${queued.size} queued`);
if (DRY) { mine.slice(0, 30).forEach((t) => console.log('  ', t.state, t.type.padEnd(12), t.name.padEnd(32), t.county || '')); process.exit(0); }
let n = 0;
for (const t of mine) {
  await processTarget(t);
  if (++n % 25 === 0) emit({ stage: 'sweep_progress', address: `slice ${SLICE}/${SLICES}`, ok: true, detail: `${n}/${mine.length} processed` });
}
emit({ stage: 'sweep_done', address: `slice ${SLICE}/${SLICES}`, ok: true, detail: `${mine.length} jurisdictions processed — ${fixList.length} on the fix list` });
console.log(`sweep ${SLICE}/${SLICES} done: ${mine.length} processed, ${fixList.length} fix-listed`);
