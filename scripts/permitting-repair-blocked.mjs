#!/usr/bin/env node
// Blocked/fix-list repair — recovers rows the v1 pipeline stranded:
//
//   • queue `blocked` rows: v1 marked "requires review/held" details terminal
//     and nothing ever re-queued them. County rows with self-identity and any
//     row whose county geocodes cleanly go back to not_started for the v2
//     researcher (which has its own evidence gates and ignores legacy holds).
//   • hygiene fix-list "profile lacks parent_county too — cannot place":
//     geocode the jurisdiction, backfill profile.county_name — next hygiene
//     pass absorbs the county-less row automatically.
//   • "ambiguous — matches profiles in N counties": geocode picks the county,
//     we backfill the queue row's parent_county_name so hygiene merges right.
//
// Paper/remnant townships and rows Nominatim can't place stay blocked — those
// genuinely need human review; we just make their missing_next clearer.
//
// All writes through outbox + mirrorApply — never touches remote directly.
// Usage: node scripts/permitting-repair-blocked.mjs [--once]
import { openSync, writeFileSync, readFileSync, mkdirSync, rmdirSync, statSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { sleep } from './lib/office-research.mjs';
import { jurisdictionToPermitLocality } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { regionalProvidersFor } from '../base44/shared/regionalProviders.mjs';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const EVENTS = '.live-events.jsonl';
const CLAIMS_FILE = '.audit-work/repair-blocked-claims.json';
const FIX_LIST = '.audit-work/queue-hygiene-fix-list.json';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'repair-blocked', ...e }) + '\n', { flag: 'a' }); } catch {} };
let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')); } catch {}
// MP-7.6 — claim-ledger GC on every save: entries >45d are ancient history
// and only bloat the file (repair claims re-run harmlessly if re-attempted).
const saveClaims = () => {
  try {
    const cutoff = Date.now() - 45 * 86400000;
    for (const [k, v] of Object.entries(claims)) { if (Date.parse(v?.at || '') < cutoff) delete claims[k]; }
    writeFileSync(CLAIMS_FILE, JSON.stringify(claims));
  } catch {}
};

// ── Nominatim — same cross-process token bucket as the resolvers (1 req/sec
// fleet-wide, shared lock files so this worker can't bust the policy) ──────
const NOM_LOCK = '.audit-work/nominatim-mutex';
const NOM_TS = '.audit-work/nominatim-last.json';
async function nominatimSlot() {
  for (;;) {
    try { mkdirSync(NOM_LOCK); } catch {
      try { if (Date.now() - statSync(NOM_LOCK).mtimeMs > 15000) { rmdirSync(NOM_LOCK); continue; } } catch {}
      await sleep(60 + Math.random() * 120); continue;
    }
    try {
      let last = 0;
      try { last = JSON.parse(readFileSync(NOM_TS, 'utf8')).t || 0; } catch {}
      const now = Date.now();
      // rmdir can EPERM transiently on Windows (AV/indexer holds the handle) —
      // a leftover lock self-heals via the 15s stale break, so never throw.
      if (now - last < 1050) { const w = 1050 - (now - last); try { rmdirSync(NOM_LOCK); } catch {} await sleep(w); continue; }
      writeFileSync(NOM_TS, JSON.stringify({ t: now, pid: process.pid }));
      return;
    } finally { try { rmdirSync(NOM_LOCK); } catch {} }
  }
}
// Returns { county, state, display } or null. `q` should be "Name, ST".
async function geocodeCounty(q, wantState) {
  await nominatimSlot();
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=us&addressdetails=1&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'ccs-signage-blocked-repair/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const stateName = { OH: 'ohio', KY: 'kentucky' }[String(wantState || '').toUpperCase()];
    for (const hit of await r.json()) {
      const a = hit?.address || {};
      if (stateName && String(a.state || '').toLowerCase() !== stateName) continue;
      const county = String(a.county || '').replace(/\s+county$/i, '').trim();
      if (county) return { county, state: a.state, display: hit.display_name || '' };
    }
  } catch {}
  return null;
}

const countyOf = (s) => String(s || '').replace(/\s+county$/i, '').trim().toLowerCase();

async function repairBlocked(queue, profiles) {
  const rows = queue.filter((r) => String(r.status || '') === 'blocked' && !claims[`bq-${r.id}`]);
  let reset = 0, kept = 0;
  for (const row of rows) {
    const label = `${row.jurisdiction_name}, ${row.state}`;
    const note = String(row.missing_next || '');
    // Legit blocks stay: paper townships genuinely have no government.
    if (/paper\/remnant|no functioning government/i.test(note)) { claims[`bq-${row.id}`] = { result: 'kept_paper', at: new Date().toISOString() }; kept++; continue; }
    let county = countyOf(row.parent_county_name);
    let ok = false;
    if (/county/i.test(String(row.jurisdiction_type || '')) && county && county === countyOf(row.jurisdiction_name)) {
      ok = true; // county row with self-identity — trivially resolvable
    } else {
      const geo = await geocodeCounty(`${row.jurisdiction_name}, ${row.state}`, row.state);
      if (geo) {
        county = countyOf(geo.county);
        ok = true;
        if (county && countyOf(row.parent_county_name) !== county) {
          enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { parent_county_name: `${geo.county.replace(/\s+county$/i, '')} County` }, mirror: 'queue', note: `repair backfill county — ${label}` });
          mirrorApply('queue', { id: row.id, parent_county_name: `${geo.county.replace(/\s+county$/i, '')} County` });
        }
      }
    }
    if (ok) {
      enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { status: 'not_started', missing_next: `Repair reset ${new Date().toISOString().slice(0, 10)} — legacy review-hold cleared; v2 researcher re-judges.`, last_activity: new Date().toISOString() }, mirror: 'queue', note: `repair unblock — ${label}` });
      mirrorApply('queue', { id: row.id, status: 'not_started', missing_next: 'Repair reset — legacy review-hold cleared.' });
      emit({ stage: 'repair_reset', address: label, ok: true, detail: `blocked → not_started${county ? ` (county ${county})` : ''}` });
      claims[`bq-${row.id}`] = { result: 'reset', at: new Date().toISOString() };
      reset++;
    } else {
      // Genuinely unplaceable — sharpen the note so review sees the real ask.
      enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { missing_next: `NEEDS REVIEW: no county resolvable for "${row.jurisdiction_name}, ${row.state}" via geocode — confirm jurisdiction identity.` }, mirror: 'queue', note: `repair sharpen — ${label}` });
      mirrorApply('queue', { id: row.id, missing_next: `NEEDS REVIEW: no county resolvable for "${row.jurisdiction_name}, ${row.state}" via geocode.` });
      claims[`bq-${row.id}`] = { result: 'kept_unplaced', at: new Date().toISOString() };
      kept++;
    }
    saveClaims();
  }
  if (rows.length) emit({ stage: 'repair_pass', ok: true, detail: `blocked scan — ${reset} reset · ${kept} kept` });
}

async function repairFixList(queue, profiles) {
  let list = [];
  try { list = Object.values(JSON.parse(readFileSync(FIX_LIST, 'utf8'))); } catch { return; }
  const byName = (n, s) => profiles.filter((p) => String(p.name || '').toLowerCase() === String(n || '').toLowerCase() && String(p.state || '').toUpperCase() === String(s || '').toUpperCase());
  let fixed = 0, skipped = 0;
  for (const e of list) {
    if (!e?.id || claims[`fl-${e.id}`]) continue;
    const label = `${e.jurisdiction}, ${e.state}`;
    const geo = await geocodeCounty(`${e.jurisdiction}, ${e.state}`, e.state);
    if (!geo) { claims[`fl-${e.id}`] = { result: 'no_geocode', at: new Date().toISOString() }; skipped++; continue; }
    const county = countyOf(geo.county);
    const cands = byName(e.jurisdiction, e.state);
    const pick = cands.length === 1 ? cands[0] : cands.find((p) => countyOf(p.county_name) === county);
    // Backfill the profile's missing county so hygiene can place the row.
    if (pick && !countyOf(pick.county_name)) {
      enqueue({ entity: 'JurisdictionProfile', op: 'update', id: pick.id, data: { county_name: `${geo.county.replace(/\s+county$/i, '')} County` }, mirror: `profiles-${String(e.state || '').toLowerCase()}`, note: `repair county backfill — ${label}` });
      mirrorApply(`profiles-${String(e.state || '').toLowerCase()}`, { id: pick.id, county_name: `${geo.county.replace(/\s+county$/i, '')} County` });
    }
    // Backfill the queue row's county — hygiene's absorber reads this field.
    const row = queue.find((r) => r.id === e.id);
    if (row && countyOf(row.parent_county_name) !== county) {
      enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: e.id, data: { parent_county_name: `${geo.county.replace(/\s+county$/i, '')} County` }, mirror: 'queue', note: `repair fix-list county — ${label}` });
      mirrorApply('queue', { id: e.id, parent_county_name: `${geo.county.replace(/\s+county$/i, '')} County` });
    }
    emit({ stage: 'repair_fixlist', address: label, ok: true, detail: `county → ${geo.county} (${cands.length} profile candidate(s))` });
    claims[`fl-${e.id}`] = { result: 'county_set', at: new Date().toISOString() };
    fixed++;
    saveClaims();
  }
  if (list.length) emit({ stage: 'repair_pass', ok: true, detail: `fix-list scan — ${fixed} county-backfilled · ${skipped} ungeocodable` });
}

// ── MP-1.2: sources_found truth audit ─────────────────────────────────────
// A row closed `sources_found` must mean research LANDED on the profile.
// Measured: 1,130 of 3,287 checkable rows have <3 roles — empty successes
// (the county-fallback targetProfile=null discard closed them while writing
// nothing). Stamp evidence_role_count on every closed row; reopen thin ones.
const baseName = (n) => String(n || '').toLowerCase().replace(/\s+(city|village|township|county)$/i, '').trim();
const countyKey = (s) => String(s || '').replace(/\s+county$/i, '').trim().toLowerCase();
function findProfile(row, profiles) {
  const base = baseName(row.jurisdiction_name);
  const st = String(row.state || '').toUpperCase();
  const cands = profiles.filter((p) => baseName(p.name) === base && String(p.state || '').toUpperCase() === st);
  if (cands.length === 1) return cands[0];
  const ck = countyKey(row.parent_county_name);
  return cands.find((p) => countyKey(p.county_name) === ck) || cands[0] || null;
}
async function truthAudit(queue, profiles) {
  const rows = queue.filter((r) => String(r.status || '') === 'sources_found' && !claims[`ta-${r.id}`]);
  let ok = 0, reopened = 0;
  for (const row of rows) {
    const label = `${row.jurisdiction_name}, ${row.state}`;
    const prof = findProfile(row, profiles);
    const n = prof ? (prof.office_research?.roles || []).length : 0;
    enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { evidence_role_count: n }, mirror: 'queue', note: `truth audit — ${label}` });
    mirrorApply('queue', { id: row.id, evidence_role_count: n });
    if (n < 3) {
      enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { status: 'not_started', missing_next: `Truth audit reopened — closed sources_found with only ${n} research role(s) landed; v2 re-research required.`, last_activity: new Date().toISOString() }, mirror: 'queue', note: `truth reopen — ${label}` });
      mirrorApply('queue', { id: row.id, status: 'not_started', missing_next: `Truth audit reopened — ${n} role(s).` });
      emit({ stage: 'repair_truth', address: label, ok: true, detail: `sources_found→not_started — only ${n} role(s) actually landed` });
      reopened++;
    } else ok++;
    claims[`ta-${row.id}`] = { result: n < 3 ? 'reopened' : 'verified', roles: n, at: new Date().toISOString() };
  }
  if (rows.length) { saveClaims(); emit({ stage: 'repair_pass', ok: true, detail: `truth audit — ${ok} verified · ${reopened} reopened (of ${rows.length} sources_found audited)` }); }
}

// ── MP-1.1: demand weight ─────────────────────────────────────────────────
// Parked addresses ARE the demand signal — a jurisdiction with 87 real
// addresses waiting must outrank one with zero. Latest-stage-per-address
// semantics (a parked address that later flips resolved_apply un-counts).
const PARKED_STAGES = new Set(['resolved_needs_office_check', 'located_no_locality']);
const RESOLVED_STAGES = new Set([...PARKED_STAGES, 'resolved_apply']);
async function demandWeight(queue) {
  // Tail the events file — newest parked wins; older events for the same
  // address are overwritten by later stages.
  let lines = [];
  try { lines = readFileSync('.live-events.jsonl', 'utf8').trim().split('\n'); } catch {}
  const tms = (e) => { const t = typeof e.t === 'number' ? e.t : Date.parse(e.t); return Number.isNaN(t) ? 0 : t; };
  const latest = new Map();
  for (const l of lines) {
    let e = null; try { e = JSON.parse(l); } catch { continue; }
    if (!e?.address || !RESOLVED_STAGES.has(e.stage) || e.start || e.step) continue;
    const prev = latest.get(e.address);
    if (!prev || tms(e) > tms(prev)) latest.set(e.address, e);
  }
  const dem = new Map(); // 'name|state' -> parked count
  for (const e of latest.values()) {
    if (!PARKED_STAGES.has(e.stage)) continue;
    // Newer events carry a structured jurisdiction tag; older ones embedded it
    // in the detail text ("Cincinnati, OH (city) — …") — parse either.
    let name = e.jurisdiction?.name || '', state = e.jurisdiction?.state || '';
    if (!name) {
      const m = String(e.detail || '').match(/^([^,]+),\s*([A-Z]{2})\s*\(/);
      if (m) { name = m[1]; state = m[2]; }
    }
    const key = `${baseName(name)}|${String(state || '').toUpperCase()}`;
    if (key === '|' || key.startsWith('|')) continue;
    dem.set(key, (dem.get(key) || 0) + 1);
  }
  let stamped = 0;
  for (const row of queue) {
    const key = `${baseName(row.jurisdiction_name)}|${String(row.state || '').toUpperCase()}`;
    const w = dem.get(key) || 0;
    if (Number(row.demand_weight || 0) === w) continue;
    enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { demand_weight: w }, mirror: 'queue', note: `demand weight ${w} — ${row.jurisdiction_name}` });
    mirrorApply('queue', { id: row.id, demand_weight: w });
    stamped++;
  }
  if (stamped || dem.size) emit({ stage: 'repair_pass', ok: true, detail: `demand weight — ${dem.size} jurisdiction(s) with parked demand · ${stamped} row(s) stamped` });
}

// ── MP-5.4: staleness re-verify ─────────────────────────────────────────
// Research >90d old is a claim, not a fact — offices reorganize, URLs move.
// Rotate stale profiles back into the queue (bounded per pass, claim-gated
// so each profile re-verifies at most once per 90d window).
const STALE_MS = 90 * 86400000;
async function stalenessRequeue(queue, profiles) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  let requeued = 0;
  for (const row of queue) {
    if (requeued >= 25) break; // bounded — a full rotation every ~10 passes
    if (String(row.status) !== 'sources_found') continue;
    const p = byId.get(row.jurisdiction_profile_id);
    const at = Date.parse(p?.office_research?.researched_at || '');
    if (!Number.isFinite(at) || Date.now() - at < STALE_MS) continue;
    const ck = `stale-${row.id}`;
    if (claims[ck] && Date.now() - new Date(claims[ck].at).getTime() < STALE_MS) continue;
    enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { status: 'not_started', missing_next: 'STALENESS re-verify — research >90d old, re-confirm offices still hold' }, mirror: 'queue', note: `staleness requeue — ${row.jurisdiction_name}` });
    mirrorApply('queue', { id: row.id, status: 'not_started' });
    claims[ck] = { result: 'requeued', at: new Date().toISOString() };
    requeued++;
  }
  if (requeued) { saveClaims(); emit({ stage: 'repair_pass', ok: true, detail: `staleness — ${requeued} profile(s) >90d requeued for re-verification` }); }
}

// ── MP-6.5: locality minting ────────────────────────────────────────────
// `located_no_locality` parked because no PermitLocality row existed — the
// queue demand-row got researched, but nothing turned the profile into a
// locality. Mint PermitLocality rows (offices via the bridge) for profiles
// that have real research and no matching locality.
async function mintLocalities(queue, profiles) {
  const locs = getMirror('localities')?.rows || [];
  const locKeys = new Set(locs.map((l) => `${baseName(l.name)}|${String(l.state || '').toUpperCase()}`));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  let minted = 0;
  for (const row of queue) {
    if (String(row.status) !== 'sources_found' || !row.jurisdiction_profile_id) continue;
    const key = `${baseName(row.jurisdiction_name)}|${String(row.state || '').toUpperCase()}`;
    if (locKeys.has(key)) continue;
    const p = byId.get(row.jurisdiction_profile_id);
    const roles = (p?.office_research?.roles || []).filter((r) => /potentially_applicable|applicable|confirmed/i.test(String(r?.applicability)));
    if (roles.length < 2) continue; // don't mint locality shells on thin evidence
    const ck = `mint-${key}`;
    if (claims[ck]) continue;
    try {
      const locData = jurisdictionToPermitLocality(p);
      locData.jurisdiction_profile_id = p.id;
      enqueue({ entity: 'PermitLocality', op: 'create', data: locData, note: `locality minted — ${key}` });
      claims[ck] = { result: 'minted', at: new Date().toISOString() };
      locKeys.add(key);
      minted++;
      emit({ stage: 'repair_pass', ok: true, detail: `locality minted — ${row.jurisdiction_name}, ${row.state} (${locData.offices?.length || 0} offices)` });
    } catch (e) { claims[ck] = { result: `err:${String(e?.message || e).slice(0, 80)}`, at: new Date().toISOString() }; }
  }
  if (minted) saveClaims();
}

// ── MP-4.8: serves_jurisdictions visibility ─────────────────────────────
// A regional provider's serves_counties is abstract until it's names —
// "KIPDA covers Oldham County" becomes "KIPDA covers Pewee Valley, La Grange,
// Crestwood…" so the app can say "county/regional body covers you."
async function servesJurisdictions(profiles) {
  // county name (state-scoped) -> jurisdiction names from profiles
  const byCounty = new Map();
  for (const p of profiles) {
    const c = String(p.county_name || p.parent_county_name || '').toLowerCase().replace(/\s+county$/i, '').trim();
    if (!c) continue;
    const k = `${c}|${String(p.state || '').toUpperCase()}`;
    if (!byCounty.has(k)) byCounty.set(k, []);
    byCounty.get(k).push(p.name);
  }
  let stamped = 0;
  for (const p of profiles) {
    const rps = p.office_research?.regional_providers || [];
    if (!rps.length) continue;
    const serves = new Set();
    for (const rp of rps) {
      for (const c of rp.serves_counties || []) {
        for (const n of byCounty.get(`${String(c).toLowerCase()}|${String(rp.state || p.state).toUpperCase()}`) || []) serves.add(n);
      }
    }
    if (!serves.size) continue;
    const list = [...serves].sort().slice(0, 200);
    const cur = p.office_research?.serves_jurisdictions || [];
    if (JSON.stringify(cur) === JSON.stringify(list)) continue;
    const research = { ...(p.office_research || {}), roles: p.office_research?.roles || [], serves_jurisdictions: list };
    enqueue({ entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { office_research: research }, mirror: null, note: `serves_jurisdictions — ${p.name}` });
    mirrorApply(String(p.state).toUpperCase() === 'KY' ? 'profiles-ky' : 'profiles-oh', { id: p.id, office_research: research });
    stamped++;
  }
  if (stamped) emit({ stage: 'repair_pass', ok: true, detail: `serves_jurisdictions — ${stamped} regional-provider profile(s) stamped` });
}

emit({ stage: 'repair_boot', address: 'blocked/fix-list repair', ok: true, start: true, detail: 'geocode-repair legacy blocked rows + unplaceable fix-list entries + sources_found truth audit — Nominatim bucket shared with resolvers' });
(async () => {
  while (true) {
    try {
      const queue = getMirror('queue')?.rows || [];
      const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
      await repairBlocked(queue, profiles);
      await repairFixList(queue, profiles);
      await truthAudit(queue, profiles);
      await demandWeight(queue);
      await stalenessRequeue(queue, profiles);
      await mintLocalities(queue, profiles);
      await servesJurisdictions(profiles);
    } catch (e) { emit({ stage: 'repair_error', ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    if (ONCE) break;
    await sleep(10 * 60 * 1000); // rescan — new blocked rows appear as v1 remnants surface
  }
  process.exit(0);
})();
