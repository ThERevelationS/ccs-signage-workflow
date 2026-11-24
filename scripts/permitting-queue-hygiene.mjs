#!/usr/bin/env node
// Queue hygiene worker — keeps SourceCollectionQueue identity-clean so the
// researchers only ever work real, county-anchored jurisdictions.
//
// Repairs three drift classes the sweep/researcher can't self-heal:
//
//  1) IDENTITY DUPLICATES — same jurisdiction twice under spelling variants
//     ("Wellington" vs "Wellington Township", "Lorain" vs "Lorain County").
//     Identity = normalized name + normalized county + state + type. The row
//     furthest along wins; losers → 'duplicate'. ~2,300 stale rows existed —
//     each would burn a full research pass or worse, research the wrong
//     profile.
//  2) COUNTY-LESS ROWS — "Monroe | OH" can't pick between Ohio's ~20 Monroes
//     → researcher researches a wrong/blank profile → "no office roles" errors.
//     With a county-qualified sibling the row is redundant → 'duplicate'.
//     With none, backfill parent_county_name from a unique profile match.
//     Ambiguous/no profile → fix list (humans, the true <1%).
//  3) PARTIAL_GAPS — terminal-by-accident: nothing ever re-picks them, and the
//     85 current ones are mostly missing profiles the researcher's
//     ensureProfile creates on pickup. Requeue → 'not_started' so the normal
//     pipeline retries; rows that keep cycling land on the fix list.
//
// CAS writes only (id, updated_date) — races with researchers lose cleanly.
// Reads ride the entity mirror; confirmed writes write through via mirrorApply.
//
// Usage: node scripts/permitting-queue-hygiene.mjs [--once] [--dry-run]
// Emits queue_hygiene_* stages to .live-events.jsonl.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const flag = (n, d) => args.includes(n) ? args[args.indexOf(n) + 1] : d;
const ONCE = args.includes('--once');
const DRY = args.includes('--dry-run');
const PASS_SLEEP = Number(flag('--pass-sleep', 15 * 60 * 1000));
const WRITE_GAP_MS = Number(flag('--write-gap', 350)); // shared 140/60s write budget with the fleet
const EVENTS = '.live-events.jsonl';
const FIXLIST = '.audit-work/queue-hygiene-fix-list.json';
const MAX_PG_CYCLES = 3; // partial_gaps → not_started requeues before fix-listing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (e) => { const line = JSON.stringify({ t: Date.now(), worker: 'queuehyg', ...e }); try { appendFileSync(EVENTS, line + '\n'); } catch {} console.log(line); };

const nn = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(township|city|village|county|municipality|of|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
const nc = (s) => String(s || '').toLowerCase().replace(/\s+county$/, '').trim();
// city|village|municipality = one municipal corporation under different labels
// (population class, not a distinct jurisdiction). township/county stay split —
// "Monroe Township" and "City of Monroe" ARE different jurisdictions.
const tn = (t) => { t = String(t || '').toLowerCase(); return ['city', 'village', 'municipality'].includes(t) ? 'municipal' : t; };
const ACTIVE = new Set(['not_started', 'source_discovery', 'research_in_flight', 'partial_gaps', 'sources_found', 'verified_current', 'blocked']);
const RANK = { verified_current: 6, sources_found: 5, research_in_flight: 4, source_discovery: 3, partial_gaps: 2, not_started: 1, blocked: 0 };

let token = '';
async function login() {
  for (let i = 0; i < 8; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return true; }
    await sleep(4000 + i * 3000);
  }
  return false;
}
async function call(fn, body, { timeout = 30000 } = {}) {
  for (let i = 0; i < 6; i++) {
    await paceCall(fn);
    const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }), signal: AbortSignal.timeout(timeout) }).catch(() => null);
    if (r?.status === 401) { await login(); continue; }
    if (r && (r.status === 429 || r.status >= 500)) { await sleep(5000 + i * 5000); continue; }
    return r ? { status: r.status, ...(await r.json().catch(() => ({}))) } : {};
  }
  return null;
}
async function readAll(entity, query, label) {
  const out = [];
  for (let skip = 0; ; skip += 5000) {
    const j = await call('staffDataRead', { entity, query, limit: 5000, skip });
    if (!j) return null;
    const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data?.items) ? j.data.items : []);
    out.push(...items);
    if (label) emit({ stage: 'queue_hygiene_pass', ok: true, start: true, step: true, detail: `${label}: loaded ${out.length} rows${items.length === 5000 ? '…' : ' (done)'}` });
    if (items.length < 5000) return out;
  }
}
// CAS on loaded updated_date; success mirrors locally. Losing the race = skip.
async function casWrite(row, patch) {
  if (DRY) return { success: true, dry: true };
  const r = await call('staffEntityWrite', { entity: 'SourceCollectionQueue', op: 'updateMany', id: row.id, query: { id: row.id, updated_date: row.updated_date }, update: { $set: patch } });
  if (r?.success) mirrorApply('queue', r.record || { id: row.id, ...patch });
  return r;
}
// Independent CAS writes are safe to pool — each races only its own row.
// call() self-throttles on 429/5xx so the pool can't exceed the shared budget.
const CONCURRENCY = 6;
async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); await sleep(WRITE_GAP_MS); }
  }));
  return out;
}
// Profile writes use the single-record update op (sweep convention); terminal
// mark is verification_status:'historical' — excluded by every matcher.
async function writeProfile(p, patch) {
  if (DRY) return { success: true, dry: true };
  const r = await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'update', id: p.id, data: patch });
  if (r?.success || r?.record || r?.id) mirrorApply(`profiles-${String(p.state || '').toLowerCase()}`, r?.record || { id: p.id, ...patch });
  return r;
}
const pcName = (p) => p?.parent_county?.name || p?.parent_county_name || '';
const profileHasResearch = (p = {}) => !!(String(p.website_url || '').trim() || String(p.permitting_url || '').trim() || (p.office_research?.roles || []).length || (p.documents || []).length);
const fixList = [];
const note = (r, msg) => fixList.push({ id: r.id, jurisdiction: r.jurisdiction_name, county: r.parent_county_name, state: r.state, status: r.status, reason: msg, t: new Date().toISOString() });

async function pass() {
  const queue = await mirrorRead('queue', 20 * 60 * 1000, async () => null);
  if (!queue) { emit({ stage: 'queue_hygiene_error', ok: false, detail: 'queue mirror unavailable' }); return; }
  const rows = queue.filter((r) => r?.id && !r.is_sample && ACTIVE.has(r.status));
  let dup = 0, absorbed = 0, backfilled = 0, requeued = 0, staleReleased = 0, errors = 0, fixN = 0;

  // ── 1) identity-duplicate groups ──
  const groups = new Map();
  for (const r of rows) {
    const k = [nn(r.jurisdiction_name), nc(r.parent_county_name), String(r.state || '').toUpperCase(), tn(r.jurisdiction_type)].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const dupOps = [];
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    const live = g.filter((r) => r.status !== 'blocked');
    if (!live.length) continue; // all blocked — terminal by design (unincorporated etc.)
    live.sort((a, b) => (RANK[b.status] || 0) - (RANK[a.status] || 0) || String(a.created_date).localeCompare(String(b.created_date)));
    const keep = live[0];
    for (const loser of live.slice(1).concat(g.filter((r) => r.status === 'blocked')))
      dupOps.push([loser, { status: 'duplicate', last_activity: new Date().toISOString(), missing_next: `Duplicate of queue row ${keep.id} (${keep.jurisdiction_name} / ${keep.parent_county_name || 'no county'} / ${keep.status}) — merged by queue hygiene.` }]);
  }
  emit({ stage: 'queue_hygiene_pass', ok: true, start: true, step: true, detail: `writing ${dupOps.length} duplicate marks…` });
  for (const r of await pool(dupOps, ([row, patch]) => casWrite(row, patch))) {
    if (r?.success || r?.dry) dup++; else if (r === null || r?.status >= 400) errors++;
  }

  // ── 2) county-less rows (non-county types only) ──
  const qualified = new Set(rows.filter((r) => r.parent_county_name && r.status !== 'duplicate').map((r) => `${nn(r.jurisdiction_name)}|${String(r.state || '').toUpperCase()}|${tn(r.jurisdiction_type)}`));
  const countyLess = rows.filter((r) => !r.parent_county_name && r.status !== 'duplicate' && tn(r.jurisdiction_type) !== 'county');
  const absorbOps = [], backfillOps = [];
  let profiles = null;
  for (const r of countyLess) {
    const k = `${nn(r.jurisdiction_name)}|${String(r.state || '').toUpperCase()}|${tn(r.jurisdiction_type)}`;
    if (qualified.has(k)) {
      absorbOps.push([r, { status: 'duplicate', last_activity: new Date().toISOString(), missing_next: 'County-less row — a county-qualified row for this jurisdiction exists; absorbed by queue hygiene.' }]);
      continue;
    }
    // no qualified sibling — try a unique profile match to backfill the county
    if (!profiles) {
      const oh = await mirrorRead('profiles-oh', 45 * 60 * 1000, async () => null) || [];
      const ky = await mirrorRead('profiles-ky', 45 * 60 * 1000, async () => null) || [];
      profiles = oh.concat(ky);
    }
    // Unambiguous = exactly ONE county among same-name profiles. Township
    // candidates don't disambiguate a city row — but a lone same-name profile
    // (village typed 'city' on the row, etc.) is safe to inherit from.
    const cands = profiles.filter((p) => nn(p.name) === nn(r.jurisdiction_name) && String(p.state || '').toUpperCase() === String(r.state || '').toUpperCase() && (p.parent_county?.name || p.parent_county_name));
    const counties = [...new Set(cands.map((p) => nc(p.parent_county?.name || p.parent_county_name)))];
    if (counties.length === 1) {
      const county = cands.find((p) => nc(p.parent_county?.name || p.parent_county_name) === counties[0]).parent_county?.name;
      backfillOps.push([r, { parent_county_name: county, last_activity: new Date().toISOString(), missing_next: `County backfilled (${county}) by queue hygiene.` }]);
    } else {
      const anyMatch = profiles.filter((p) => nn(p.name) === nn(r.jurisdiction_name) && String(p.state || '').toUpperCase() === String(r.state || '').toUpperCase());
      note(r, counties.length ? `county-less row is ambiguous — matches profiles in ${counties.length} counties` : anyMatch.length ? 'profile exists but lacks parent_county too — cannot place' : 'county-less row matches no profile — cannot place');
      fixN++;
    }
  }
  emit({ stage: 'queue_hygiene_pass', ok: true, start: true, step: true, detail: `writing ${absorbOps.length} absorbed + ${backfillOps.length} backfills…` });
  for (const r of await pool(absorbOps, ([row, patch]) => casWrite(row, patch))) {
    if (r?.success || r?.dry) absorbed++; else if (r === null || r?.status >= 400) errors++;
  }
  for (const r of await pool(backfillOps, ([row, patch]) => casWrite(row, patch))) {
    if (r?.success || r?.dry) backfilled++; else if (r === null || r?.status >= 400) errors++;
  }

  // ── 3) partial_gaps requeue — nothing else ever re-picks these ──
  const pgOps = [];
  for (const r of rows.filter((x) => x.status === 'partial_gaps')) {
    const cycles = Number(r.requeue_cycles || 0);
    if (cycles >= MAX_PG_CYCLES) { note(r, `partial_gaps persisted through ${cycles} requeues — needs human/deeper research`); fixN++; continue; }
    pgOps.push([r, { status: 'not_started', requeue_cycles: cycles + 1, last_activity: new Date().toISOString(), missing_next: `Requeued by queue hygiene (cycle ${cycles + 1}) — ${String(r.missing_next || 'research returned partial evidence').slice(0, 90)}` }]);
  }
  for (const r of await pool(pgOps, ([row, patch]) => casWrite(row, patch))) {
    if (r?.success || r?.dry) requeued++; else if (r === null || r?.status >= 400) errors++;
  }

  // ── 4) stale research_in_flight safety net (researcher owns this; we only
  //       catch leftovers when no researcher is alive) ──
  const staleMs = 45 * 60 * 1000;
  for (const r of rows.filter((x) => x.status === 'research_in_flight')) {
    const age = Date.now() - Date.parse(r.last_activity || r.updated_date || 0);
    if (age > staleMs) {
      const w = await casWrite(r, { status: 'not_started', last_activity: new Date().toISOString(), missing_next: 'Released by queue hygiene — claim stale >45min with no heartbeat.' });
      if (w?.success || w?.dry) staleReleased++;
    }
  }

  // ── 5) profile dedup — research-created junk profiles (matchProfile used
  //       to read the dead parent_county_name field, so county checks always
  //       passed → a same-name profile got created per county-less row).
  //       Group nn(name)|state|tn(type); split by county; county-less members
  //       shadow whichever qualified sibling exists (or stay un-attributable
  //       junk) → losers marked 'historical', same as the sweep's dedupe.
  //       Township vs municipal NEVER merge — different jurisdictions.
  let profDup = 0;
  if (!profiles) {
    const oh = await mirrorRead('profiles-oh', 45 * 60 * 1000, async () => null) || [];
    const ky = await mirrorRead('profiles-ky', 45 * 60 * 1000, async () => null) || [];
    profiles = oh.concat(ky);
  }
  const liveProfs = profiles.filter((p) => p?.id && !p.is_sample && !['historical', 'duplicate'].includes(String(p.verification_status || '').toLowerCase()) && !String(p.duplicate_of || '').trim());
  const pGroups = new Map();
  for (const p of liveProfs) {
    const k = [nn(p.name), String(p.state || '').toUpperCase(), tn(p.type)].join('|');
    if (!pGroups.has(k)) pGroups.set(k, []);
    pGroups.get(k).push(p);
  }
  const profOps = [];
  for (const [, g] of pGroups) {
    if (g.length < 2) continue;
    const qualified = g.filter((p) => pcName(p));
    const countyLessM = g.filter((p) => !pcName(p));
    // one keeper per county bucket — rank: research-bearing > verified > oldest
    const byCounty = new Map();
    for (const p of qualified) {
      const c = nc(pcName(p));
      if (!byCounty.has(c)) byCounty.set(c, []);
      byCounty.get(c).push(p);
    }
    const keepIds = new Set();
    const rank = (p) => (profileHasResearch(p) ? 4 : 0) + (p.verification_status === 'verified' ? 2 : 0);
    for (const [, bucket] of byCounty) {
      bucket.sort((a, b) => rank(b) - rank(a) || String(a.created_date || '').localeCompare(String(b.created_date || '')));
      keepIds.add(bucket[0].id);
      for (const loser of bucket.slice(1)) profOps.push([loser, { verification_status: 'historical' }]);
    }
    if (countyLessM.length) {
      if (byCounty.size === 0) {
        // all county-less — keep the best single record (unique-name places)
        const sorted = [...countyLessM].sort((a, b) => rank(b) - rank(a) || String(a.created_date || '').localeCompare(String(b.created_date || '')));
        keepIds.add(sorted[0].id);
        for (const loser of sorted.slice(1)) profOps.push([loser, { verification_status: 'historical' }]);
      } else {
        // county-less junk shadowing qualified sibling(s) — research on these
        // is unattributable to a county; mark historical + note if it had data
        for (const loser of countyLessM) {
          profOps.push([loser, { verification_status: 'historical' }]);
          if (profileHasResearch(loser)) note({ id: loser.id, jurisdiction_name: loser.name, parent_county_name: '(none)', state: loser.state, status: 'profile' }, `county-less profile with research marked historical — qualified sibling exists in ${[...byCounty.keys()].join('/')}`);
        }
      }
    }
  }
  emit({ stage: 'queue_hygiene_pass', ok: true, start: true, step: true, detail: `writing ${profOps.length} profile dedup marks…` });
  for (const r of await pool(profOps, ([p, patch]) => writeProfile(p, patch))) {
    if (r?.success || r?.record || r?.dry) profDup++; else if (r === null || r?.status >= 400) errors++;
  }

  if (fixList.length) {
    const byId = new Map(fixList.map((f) => [f.id, f]));
    mkdirSync('.audit-work', { recursive: true });
    writeFileSync(FIXLIST, JSON.stringify([...byId.values()], null, 2));
  }
  emit({ stage: 'queue_hygiene_done', ok: true, detail: `rows:${rows.length} dup:${dup} absorbed:${absorbed} backfill:${backfilled} requeue:${requeued} stale:${staleReleased} profdup:${profDup} fixlist:${fixN} err:${errors}${DRY ? ' [DRY]' : ''}` });
}

(async () => {
  emit({ stage: 'queue_hygiene_pass', ok: true, start: true, step: true, detail: 'queue hygiene worker up' });
  if (!DRY && !(await login())) { emit({ stage: 'queue_hygiene_error', ok: false, detail: 'login failed' }); process.exit(1); }
  do {
    await waitWhilePaused('queue-hygiene', { item: 'hygiene pass' });
    try { await pass(); } catch (e) { emit({ stage: 'queue_hygiene_error', ok: false, detail: String(e?.message || e).slice(0, 180) }); }
    if (!ONCE) { heartbeat('queue-hygiene', 'idle', 'between passes'); await sleep(PASS_SLEEP); }
  } while (!ONCE);
})();
