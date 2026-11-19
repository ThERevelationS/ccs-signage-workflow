#!/usr/bin/env node
// Office researcher worker — one of N parallel researchers draining the
// SourceCollectionQueue research backlog. The in-app dispatcher stays untouched;
// this worker honors the same queue protocol (not_started → source_discovery →
// sources_found/blocked) via the same updated_date CAS, so neither system can
// double-research a row.
// Per row: CAS-reserve → jurisdictionResearchAgent (the app's own research
// engine — one LLM pass, normalized office_research.roles) → CAS-write the
// research onto the matching JurisdictionProfile (only if it still has none) →
// close the queue row. Failures return to not_started for a later pass; after
// MAX_ATTEMPTS they block (mirroring the dispatcher's retry_limit).
// Usage: node scripts/permitting-office-researcher.mjs --slice 0 --slices 4
//        [--once] [--max-per-pass 25]
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const flag = (n, d) => args.includes(n) ? args[args.indexOf(n) + 1] : d;
const EVENTS = args.includes('--events') ? flag('--events') : '.live-events.jsonl';
const SLICE = Number(flag('--slice', 0));
const SLICES = Number(flag('--slices', 4));
const ONCE = args.includes('--once');
const MAX_PER_PASS = Number(flag('--max-per-pass', 25));
const MAX_ATTEMPTS = 3;
const PASS_SLEEP = Number(flag('--pass-sleep', 60000));
const WORKER = `sweep-res${SLICE}`; // /^sweep/ → OFFICE bubble
const SELF = `office researcher ${SLICE}`; // unique address — worker-level events must not clobber other researchers' rows in the live view
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emit(e) {
  const line = JSON.stringify({ t: new Date().toISOString(), worker: WORKER, ...e });
  try { appendFileSync(EVENTS, line + '\n'); } catch {}
  console.log(line);
}
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(township|city|village|county|municipality|of|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

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
  return null; // exhausted — callers must treat null as failure, never as empty data
}
async function readAll(entity, query, label) {
  const out = [];
  for (let skip = 0; ; skip += 5000) {
    const j = await call('staffDataRead', { entity, query, limit: 5000, skip });
    if (!j) { emit({ stage: 'office_res_step', address: SELF, ok: true, start: true, step: true, detail: `${label}: read stalled on gateway — pausing pass` }); return null; }
    const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data?.items) ? j.data.items : []);
    out.push(...items);
    if (label) emit({ stage: 'office_res_step', address: SELF, ok: true, start: true, step: true, detail: `${label}: loaded ${out.length} rows${items.length === 5000 ? '…' : ' (done)'}` });
    if (items.length < 5000) return out;
  }
}
// CAS write: only applies if the row still has the loaded updated_date.
// Successful writes mirror back locally so the shared snapshot stays warm.
const cas = async (entity, row, patch) => {
  const r = await call('staffEntityWrite', { entity, op: 'updateMany', id: row.id, query: { id: row.id, updated_date: row.updated_date }, update: { $set: patch } });
  if (r?.success && entity === 'SourceCollectionQueue') mirrorApply('queue', r.record || { id: row.id, ...patch });
  return r;
};

// Reservations use 'research_in_flight' — a status the in-app dispatcher never
// touches (it reserves to 'source_discovery' and reconciles only that status),
// so our claims can't be reclaimed mid-research. Dead-worker leftovers get
// released by the stale-claim sweep below.
const CLAIM_STATUS = 'research_in_flight';

// staffEntityWrite updateMany only accepts {id, updated_date} — a status-
// conditional write needs a fresh read first, then CAS on the new timestamp.
async function casWhileReserved(rowId, patch) {
  const j = await call('staffDataRead', { entity: 'SourceCollectionQueue', query: { id: rowId }, limit: 1 });
  const row = Array.isArray(j?.items) ? j.items[0] : null;
  if (!row || row.status !== CLAIM_STATUS) return { skipped: true };
  return cas('SourceCollectionQueue', row, patch);
}

// Identity match: normalized name + state + compatible type + same parent
// county when both carry one. Ambiguous → null (never guess).
function matchProfile(row, profiles) {
  const wantName = norm(row.jurisdiction_name);
  const wantState = String(row.state || '').toUpperCase();
  const wantType = String(row.jurisdiction_type || '').toLowerCase();
  const wantCounty = norm(row.parent_county_name);
  const typeOk = (pt) => {
    pt = String(pt || '').toLowerCase();
    if (pt === wantType) return true;
    return wantType === 'municipality' && (pt === 'city' || pt === 'village');
  };
  const cands = profiles.filter((p) =>
    norm(p.name) === wantName && String(p.state || '').toUpperCase() === wantState && typeOk(p.type) &&
    (!wantCounty || !norm(p.parent_county?.name || p.parent_county_name) || norm(p.parent_county?.name || p.parent_county_name) === wantCounty) &&
    !['historical', 'duplicate'].includes(String(p.verification_status || '').toLowerCase()));
  return cands.length === 1 ? cands[0] : null;
}

const step = (address, detail) => emit({ stage: 'office_res_step', address, ok: true, start: true, step: true, detail });

// Profiles come from the local mirror (daemon-synced ~20min). A match miss
// does ONE targeted remote read before declaring absent — sweep-created
// profiles younger than the mirror TTL would otherwise get duplicated.
let profileCache = null, profileCacheAt = 0;
async function profilesCached() {
  if (profileCache && Date.now() - profileCacheAt < 10 * 60 * 1000) return profileCache;
  const oh = await mirrorRead('profiles-oh', 45 * 60 * 1000, () => readAll('JurisdictionProfile', { state: 'OH' }, 'OH profiles'));
  if (oh === null) return null;
  const ky = await mirrorRead('profiles-ky', 45 * 60 * 1000, () => readAll('JurisdictionProfile', { state: 'KY' }, 'KY profiles'));
  if (ky === null) return null;
  profileCache = [...oh, ...ky];
  profileCacheAt = Date.now();
  return profileCache;
}
async function findProfile(row) {
  let p = matchProfile(row, profileCache || []);
  if (p) return p;
  // Mirror miss — one sparse point read, never a full-table reload.
  const j = await call('staffDataRead', { entity: 'JurisdictionProfile', query: { name: row.jurisdiction_name, state: row.state }, limit: 20 });
  const cands = Array.isArray(j?.items) ? j.items : (j?.data?.items || []);
  p = matchProfile(row, cands);
  if (p) { if (profileCache) profileCache.push(p); return p; }
  return null;
}

async function researchRow(row) {
  const label = `${row.jurisdiction_name}, ${row.state}`;
  step(label, 'reserving queue row (CAS)…');
  // 1) CAS-reserve: not_started → source_discovery (loses cleanly to any other worker/dispatch)
  const now = new Date().toISOString();
  const r = await cas('SourceCollectionQueue', row, { status: CLAIM_STATUS, research_requested_at: now, last_activity: now, missing_next: `Being researched by ${WORKER}.` });
  if (!r || r.error || r.success === false) return 'reserve_lost';
  emit({ stage: 'office_res_start', address: label, ok: true, start: true, detail: `researching offices (${row.jurisdiction_type || 'jurisdiction'})` });

  const fail = async (detail, blocked = false) => {
    const attempts = (Number(row.research_dispatch_attempts) || 0) + 1;
    // Paper/remnant townships fold to the parent county permanently —
    // 'duplicate', not 'blocked', so the backlog card stays clean. The signal
    // is the ROW's missing_next (sweeper marker) — the engine releases them
    // with the generic identity-review message, not the paper marker.
    const paperTownship = /paper\/remnant|no functioning government/i.test(`${row.missing_next || ''} ${detail}`);
    const terminal = paperTownship || blocked || attempts >= MAX_ATTEMPTS || /requires review|held for this jurisdiction/i.test(detail);
    const releaseTo = paperTownship ? 'duplicate' : terminal ? 'blocked' : 'not_started';
    step(label, `releasing row → ${releaseTo === 'not_started' ? 'not_started (retry)' : releaseTo}`);
    await casWhileReserved(row.id, { status: releaseTo, research_dispatch_attempts: attempts, last_activity: new Date().toISOString(), missing_next: terminal ? (paperTownship ? `Paper/remnant township — folded to parent county jurisdiction: ${detail.slice(0, 80)}` : `Office researcher blocked after ${attempts} attempt(s): ${detail.slice(0, 100)}`) : 'Office researcher transient failure — eligible for retry.' });
    // Review-holds and transient retries are not errors — only a hard failure
    // (engine down, write dead after retries) earns office_res_error.
    const stage = terminal ? 'office_res_review' : 'office_res_retry';
    emit({ stage, address: label, ok: false, detail: detail.slice(0, 160) });
    return 'failed';
  };

  // Mirror of profileHasResearchEvidence (base44/shared/permittingResearchBacklog.mjs)
  const hasEvidence = (p = {}) => !!(String(p.website_url || '').trim() || String(p.permitting_url || '').trim() || String(p.ai_summary || '').trim() || (p.documents || []).length || (p.permit_requirements && Object.keys(p.permit_requirements).length) || (p.contact_info && Object.values(p.contact_info).some((v) => String(v || '').trim())));

  // 2) Ensure a profile exists — mirrors ensureProfileForQueueRow in the dispatch
  let profile = await findProfile(row);
  // Already-researched profile? Close instantly — dup/variant queue rows must
  // never burn a ~2min engine call on a profile that's already done. Gate on
  // office_research.roles specifically (what the verifier consumes), not just
  // website-level evidence — a sparse profile still needs the engine.
  if (profile && (profile.office_research?.roles || []).length) {
    step(label, 'profile already has research evidence — closing row (no engine call)…');
    const done = await casWhileReserved(row.id, { status: 'sources_found', last_activity: new Date().toISOString(), missing_next: 'Research already present on the matched profile — closed by office research worker.' });
    emit({ stage: 'office_res_done', address: label, ok: true, detail: `sources_found (already researched)${done?.skipped ? ' · row closed by peer' : ''}` });
    return 'done';
  }
  if (!profile) {
    step(label, 'no repository profile — creating one…');
    const created = await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'create', data: { name: row.jurisdiction_name, state: row.state, type: row.jurisdiction_type || 'city', ...(row.parent_county_name ? { parent_county: { name: row.parent_county_name } } : {}), verification_status: 'needs_verification', auto_refresh: true, notes: 'Auto-created by the office research worker; research queued on the research backlog.', activity_log: [{ id: crypto.randomUUID(), action: 'created', description: 'Created automatically by the office research worker before research ran.', user: 'system:permittingOfficeResearcher', timestamp: new Date().toISOString() }] } });
    profile = created?.record || created?.jurisdiction || created?.data || null;
    if (!profile?.id) return fail('profile create failed — sweep/dispatch will retry');
    if (profileCache) profileCache.push(profile);
    mirrorApply(`profiles-${String(row.state || '').toLowerCase()}`, profile); // write-through — every worker sees it before the next daemon sync
  }

  // 3) Research via the deployed engine — refreshJurisdiction persists
  // office_research + evidence fields onto the profile itself.
  // Heartbeat the queue claim for the engine's duration: without it, runs
  // >20min stale out mid-flight → the close skips → success logged as error
  // → the row gets re-researched (the duplicate-work class that flooded
  // office_res_error).
  step(label, 'research engine running — refreshJurisdiction deep scan (30–90s)…');
  const heartbeat = setInterval(() => { casWhileReserved(row.id, { last_activity: new Date().toISOString() }).catch(() => null); }, 120000);
  let res;
  try {
    res = await call('refreshJurisdiction', { jurisdiction_id: profile.id, defer_archive: true, automatic_research: true }, { timeout: 240000 });
  } finally { clearInterval(heartbeat); }
  const result = res?.data || res;
  if (!result?.success) return fail(String(result?.error || `refresh failed (HTTP ${res.status || '?'})`).slice(0, 140));

  const researched = result.jurisdiction?.id ? result.jurisdiction : profile;
  const status = hasEvidence(researched) ? 'sources_found' : 'partial_gaps';

  // 4) Refresh the claim, then close the queue row. Research routinely runs
  // >20min; without this touch the stale-claim sweep releases the row
  // mid-close and the success gets logged as an error.
  await casWhileReserved(row.id, { last_activity: new Date().toISOString() });
  step(label, `closing queue row → ${status}…`);
  const done = await casWhileReserved(row.id, { status, last_activity: new Date().toISOString(), missing_next: status === 'sources_found' ? 'Office research completed by the local office-research worker.' : 'Research completed but returned no usable evidence; admin review required.' });
  const roles = researched.office_research?.roles?.length || 0;
  // Research succeeded → profile has the data. A skipped close means a peer
  // or the stale sweep already advanced the row — still a done, not an error.
  if (done?.error) emit({ stage: 'office_res_error', address: label, ok: false, detail: `close-write failed: ${String(done.error).slice(0, 140)}` });
  else emit({ stage: 'office_res_done', address: label, ok: true, detail: `${status}${done?.skipped ? ' (row closed by peer)' : ''} — ${roles} office roles · ${(researched.documents || []).length} documents` });
  return 'done';
}

let pass = 0;
emit({ stage: 'office_res_boot', address: SELF, ok: true, start: true, detail: `${WORKER} live — drains SourceCollectionQueue via the app research engine (slice ${SLICE}/${SLICES})` });
await sleep(SLICE * 15000); // stagger the herd — 4 workers must not hit login+reads in lockstep
while (true) {
  pass++;
  if (!token && !(await login())) { emit({ stage: 'office_res_error', address: SELF, ok: false, detail: 'login failed — retrying' }); await sleep(PASS_SLEEP); continue; }
  // One mirror read feeds both the stale-claim sweep and the row list —
  // the daemon refreshes 'queue' every ~5min; self-sync only if it's dead.
  step(SELF, `pass ${pass}: loading research queue…`);
  const allQueue = await mirrorRead('queue', 20 * 60 * 1000, () => readAll('SourceCollectionQueue', {}, 'queue'));
  if (allQueue === null) { await sleep(PASS_SLEEP); continue; }
  // Stale-claim sweep: release rows a dead worker left behind (>20min old).
  // Dispatch-owned 'source_discovery' rows carry research_dispatch_token —
  // those belong to the in-app system and are never touched here.
  const stale = allQueue.filter((r) => r.status === CLAIM_STATUS);
  for (const s of stale) {
    if (Date.now() - Date.parse(s.research_requested_at || s.updated_date || 0) > 20 * 60 * 1000)
      await cas('SourceCollectionQueue', s, { status: 'not_started', missing_next: 'Released from a stale worker claim — eligible for retry.' });
  }
  const allRows = allQueue.filter((r) => r.status === 'not_started');
  // Never research a county-less non-county row: "Monroe | OH" can't pick among
  // Ohio's ~20 Monroes — claiming it creates a county-less junk profile and
  // yields "no office roles" errors. Queue hygiene absorbs/backfills these.
  const rows = allRows.filter((r) => ['OH', 'KY'].includes(String(r.state || '').toUpperCase()) && hash(r.id) % SLICES === SLICE &&
    (r.parent_county_name || String(r.jurisdiction_type || '').toLowerCase() === 'county'));
  if (!rows.length) {
    emit({ stage: 'office_res_idle', address: SELF, ok: true, detail: `pass ${pass}: queue empty — waiting for the sweep to queue more` });
    if (ONCE) break;
    await sleep(PASS_SLEEP); continue;
  }
  step(SELF, `${rows.length} rows in my slice — profiles ${profileCache ? 'cached' : 'loading'}…`);
  let done = 0, failed = 0, skipped = 0;
  for (const row of rows.slice(0, MAX_PER_PASS)) {
    const out = await researchRow(row);
    if (out === 'done') done++; else if (out === 'failed') failed++; else skipped++;
    await sleep(2000); // pace LLM calls — they're the real cost
  }
  emit({ stage: 'office_res_pass', address: SELF, ok: true, detail: `pass ${pass}: ${done} researched · ${failed} failed · ${skipped} contended of ${rows.length} queued` });
  if (ONCE) break;
  await sleep(PASS_SLEEP);
}
