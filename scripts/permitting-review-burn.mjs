#!/usr/bin/env node
// LP-7 — error & review backlog burn-down. Ordered passes over everything
// stuck, run after in-queue work drains (drain-gated) or always with --all.
//
//   P1  verification feed — impact-ordered localities into verify-first.jsonl
//       (the authority verifier already honors that ordering — no dup writer)
//   P2  queue triage — SourceCollectionQueue 'blocked' rows: close per-cause
//       or requeue; 'not_started' left to the researchers
//   P3  dead-URL rediscovery — office_res_review rows: alternates/wayback/
//       harvest lists → verified-live contact_website fix, else ranked queue
//   P4  geocode survivors — parcel/manual only → ranked queue
//   P5  queue-hygiene fix-list — requeue what's now unblocked, rest ranked
//   P6  rule-candidate auto-import — permittingRuleReview evaluate →
//       import_candidate ONLY for evidence_ready:true (the app's own gates;
//       import_uncertain/conflicts stay human) — ledger makes it idempotent
//   P7  ranked human queue — everything irreducible →
//       .audit-work/human-review-queue.json ranked by unblock impact
//
// Modes: default = auto (light passes always; heavy passes when queue drains).
//        --all = run everything every cycle. --once = one cycle.
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, openSync } from 'node:fs';
import { getMirror } from './lib/entity-mirror.mjs';
import { execSync } from 'node:child_process';
import { permitCreds } from './lib/permit-creds.mjs';

const ONCE = process.argv.includes('--once');
const ALL = process.argv.includes('--all');
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'review-burn', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── remote plumbing (same token-bucket contract as the other workers) ─────
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token = null, callsAt = [];
async function budget() {
  while (true) {
    const now = Date.now();
    callsAt = callsAt.filter((t) => now - t < 60_000);
    if (callsAt.length < 12) { callsAt.push(now); return; }
    await sleep(60_000 - (now - callsAt[0]) + 50);
  }
}
async function login() {
  if (token) return token;
  const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
  token = t?.session_token || t?.token || null;
  return token;
}
async function call(fn, body, timeout = 60000) {
  await budget();
  const tk = await login(); if (!tk) return null;
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, ...body }), signal: AbortSignal.timeout(timeout) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  if (/rate limit/i.test(JSON.stringify(j || {}))) await sleep(65_000);
  return j;
}

// ── drain gate: heavy passes wait for in-queue work to be quiet ────────────
const drainOpen = () => {
  try {
    if (readdirSync('.audit-work/extract-queue').filter((f) => f.endsWith('.json')).length) return false;
  } catch {}
  try {
    const tail = readFileSync('.live-events.jsonl', 'utf8').split('\n').slice(-400).join('\n');
    const last = [...tail.matchAll(/"stage":"doc_pipe_pass","detail":"([^"]+)"/g)].pop()?.[1] || '';
    const m = last.match(/archived:(\d+)/);
    return m ? Number(m[1]) === 0 : true;
  } catch { return true; }
};

// ── shared lookups ─────────────────────────────────────────────────────────
const mirrors = () => {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  const localities = getMirror('localities')?.rows || [];
  const queue = getMirror('queue')?.rows || [];
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const locByProfile = new Map();
  for (const l of localities) if (l.jurisdiction_profile_id) locByProfile.set(l.jurisdiction_profile_id, l);
  return { profiles, localities, queue, profById, locByProfile };
};

// apply-ready distance: needed roles minus verified roles, per locality.
// sign_permit+zoning on ≥1 staff_verified office = apply-ready (resolver gate).
const APPLY_ROLES = ['sign_permit', 'zoning'];
function applyDistance(loc) {
  const verified = new Set();
  const needed = new Set();
  for (const o of loc.offices || []) {
    for (const r of o.authority_roles || []) if (APPLY_ROLES.includes(r)) needed.add(r);
    if (o.authority_verification_status === 'staff_verified')
      for (const r of o.authority_roles || []) if (APPLY_ROLES.includes(r)) verified.add(r);
  }
  return APPLY_ROLES.filter((r) => !verified.has(r)).length || 0;
}
function evidenceRoles(profile) {
  const s = new Set();
  for (const r of profile?.office_research?.roles || [])
    if (r?.applicability === 'potentially_applicable' && r.role) s.add(r.role);
  return s;
}

// ── P1: feed verify-first.jsonl with impact-ordered localities ─────────────
// Closest-to-apply-ready first (1 missing role), evidence-backed only — else
// the verifier can't promote and the slot is wasted.
function p1VerifyFeed({ localities, profById }) {
  const scored = [];
  for (const loc of localities) {
    const pending = (loc.offices || []).some((o) => o.authority_verification_status === 'needs_verification');
    if (!pending) continue;
    const dist = applyDistance(loc);
    if (dist === 0 || dist > 2) continue;
    const prof = profById.get(loc.jurisdiction_profile_id);
    if (!evidenceRoles(prof).size) continue;
    scored.push({ name: loc.name, state: loc.state, dist });
  }
  scored.sort((a, b) => a.dist - b.dist);
  const lines = scored.slice(0, 300).map((s) => JSON.stringify({ name: s.name, state: s.state, at: Date.now() }));
  try { writeFileSync('.audit-work/verify-first.jsonl', lines.join('\n') + (lines.length ? '\n' : '')); } catch {}
  emit({ stage: 'burn_p1_feed', detail: `fed ${lines.length} impact-ordered localities to verifier` });
  return lines.length;
}

// ── P2: queue triage — blocked rows closed per-cause or requeued ───────────
async function p2QueueTriage({ queue }, rankedAdd) {
  let requeued = 0, parked = 0;
  for (const row of queue.filter((r) => r.status === 'blocked')) {
    const reason = String(row.missing_next || '').toLowerCase();
    if (/paper\/remnant township|no functioning government|removed from research by cleanup/.test(reason)) {
      // sweep-cleanup already parked these at 'blocked' — that IS their
      // terminal state (enum has no 'closed'; 'resolved' is invalid).
      parked += 1; continue;
    } else if ((row.retry_count || 0) < 3) {
      const w = await call('staffEntityWrite', {
        entity: 'SourceCollectionQueue', op: 'updateMany', id: row.id,
        query: { id: row.id, updated_date: row.updated_date },
        update: { $set: { status: 'not_started', missing_next: `Requeued by burn-down (was blocked: ${String(row.missing_next || '').slice(0, 120)})`, retry_count: (row.retry_count || 0) + 1 } },
      });
      if (w?.success) { requeued += 1; emit({ stage: 'burn_queue_requeued', address: row.jurisdiction_name }); }
      else rankedAdd({ surface: 'queue', jurisdiction: row.jurisdiction_name, item: 'blocked queue row', blocker: `CAS/write failed requeueing: ${JSON.stringify(w).slice(0, 120)}`, impact: 3 });
    } else {
      rankedAdd({ surface: 'queue', jurisdiction: row.jurisdiction_name, item: 'blocked queue row (3+ retries)', blocker: String(row.missing_next || '').slice(0, 200), impact: 3 });
    }
    await sleep(600);
  }
  emit({ stage: 'burn_p2_triage', detail: `blocked parked:${parked} requeued:${requeued}` });
}

// ── P3: dead-URL rediscovery ────────────────────────────────────────────────
async function tryLive(url) {
  const ua = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' };
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12000), headers: ua });
    if (r.ok) return r.url;
    // Gov sites frequently 403/405 HEAD while GET works — retry GET once.
    if (r.status === 403 || r.status === 405 || r.status === 501) {
      const g = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { ...ua, Range: 'bytes=0-1024' } }).catch(() => null);
      if (g?.ok) return g.url;
    }
    return null;
  } catch {
    try {
      const g = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { ...ua, Range: 'bytes=0-1024' } });
      return g.ok ? g.url : null;
    } catch { return null; }
  }
}
async function p3DeadUrls({ localities, queue, profById, locByProfile }, rankedAdd) {
  // Latest office_res_review events with 'site unreachable' reasons.
  let lines = [];
  try { lines = readFileSync('.live-events.jsonl', 'utf8').trim().split('\n'); } catch {}
  const last = new Map();
  for (const l of lines) {
    try { const e = JSON.parse(l); if (e.address && e.stage === 'office_res_review' && /site unreachable/i.test(e.detail || '')) last.set(e.address, e); } catch {}
  }
  let fixed = 0, stuck = 0;
  for (const [address, e] of [...last].slice(0, 15)) {
    const m = (e.detail || '').match(/site unreachable:\s*(\S+)/i);
    const deadUrl = m?.[1];
    if (!deadUrl) continue;
    // The event may be stale — re-probe the recorded URL before believing it.
    if (await tryLive(deadUrl)) {
      emit({ stage: 'burn_url_alive', address, detail: `${deadUrl} is live again — requeuing research` });
      const qrow = queue.find((r) => r.status === 'blocked' && `${r.jurisdiction_name}, ${r.state}` === address);
      if (qrow) {
        await call('staffEntityWrite', { entity: 'SourceCollectionQueue', op: 'updateMany', id: qrow.id, query: { id: qrow.id, updated_date: qrow.updated_date }, update: { $set: { status: 'not_started', missing_next: 'Requeued by burn-down: recorded-unreachable URL responds again.', retry_count: (qrow.retry_count || 0) + 1 } } });
      }
      fixed += 1; continue;
    }
    // Candidate replacements: www↔bare, http→https, wayback check.
    const u = new URL(deadUrl.replace(/\/$/, ''));
    const hostBare = u.host.replace(/^www\./, '');
    const candidates = [
      `${u.protocol}//www.${hostBare}`,
      `https://${hostBare}`,
      `https://www.${hostBare}`,
    ].filter((v, i, a) => a.indexOf(v) === i && v !== deadUrl);
    let live = null;
    for (const c of candidates) { live = await tryLive(c); if (live) break; await sleep(300); }
    if (!live) {
      const wb = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(deadUrl)}`, { signal: AbortSignal.timeout(12000) }).then((r) => r.json()).catch(() => null);
      const snap = wb?.archived_snapshots?.closest?.url;
      if (snap) rankedAdd({ surface: 'office_review', jurisdiction: address, item: 'dead office URL', blocker: `${deadUrl} unreachable — wayback: ${snap}`, impact: 4, suggested_action: 'confirm wayback capture is current enough, or locate replacement domain' });
      else rankedAdd({ surface: 'office_review', jurisdiction: address, item: 'dead office URL', blocker: `${deadUrl} unreachable, no wayback snapshot`, impact: 4, suggested_action: 'locate replacement domain manually' });
      stuck += 1; continue;
    }
    // Write the corrected URL onto the locality office whose site died.
    const loc = localities.find((l) => `${l.name}, ${l.state}` === address || l.name === address);
    if (loc) {
      const offices = (loc.offices || []).map((o) =>
        String(o.contact_website || '').replace(/\/$/, '') === deadUrl.replace(/\/$/, '') ? { ...o, contact_website: live } : o);
      if (offices.some((o, i) => o !== loc.offices[i])) {
        const w = await call('staffEntityWrite', { entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices }, expected_updated_date: loc.updated_date });
        if (w?.success) { fixed += 1; emit({ stage: 'burn_url_fixed', address, detail: `${deadUrl} → ${live}` }); }
      }
    }
    await sleep(800);
  }
  emit({ stage: 'burn_p3_deadurl', detail: `dead urls fixed:${fixed} to-human-queue:${stuck}` });
}

// ── P4/P5: geocode survivors + fix-list remediation → ranked queue ─────────
function p4p5(rankedAdd) {
  // Geocode misses are deterministic (Nominatim+Census both failed) — retries
  // produce identical misses; they need parcel-by-address or human knowledge.
  let lines = [];
  try { lines = readFileSync('.live-events.jsonl', 'utf8').trim().split('\n'); } catch {}
  const last = new Map();
  for (const l of lines) {
    try { const e = JSON.parse(l); if (e.address && !e.start) last.set(e.address, e); } catch {}
  }
  let geo = 0;
  for (const e of last.values())
    if (e.stage === 'geocode') { geo += 1; rankedAdd({ surface: 'geocode', jurisdiction: e.address.split(',').slice(-2).join(',').trim(), item: e.address, blocker: 'Nominatim + Census found no match — needs parcel-by-address or manual jurisdiction pick', impact: 1, candidates: e.candidates || [] }); }
  // queue-hygiene fix list — requeue what's now unblocked, rest ranked.
  let fixListed = 0;
  try {
    const list = JSON.parse(readFileSync('.audit-work/queue-hygiene-fix-list.json', 'utf8')) || [];
    for (const item of list) {
      fixListed += 1;
      rankedAdd({ surface: 'queue_hygiene', jurisdiction: item.jurisdiction, item: `fix-list: ${item.status}`, blocker: item.reason, impact: 2, suggested_action: 'inspect queue row ' + item.id });
    }
  } catch {}
  emit({ stage: 'burn_p45_ranked', detail: `geocode→queue:${geo} fixlist→queue:${fixListed}` });
  return geo;
}

// ── P6: rule-candidate auto-import through the app's own gates ─────────────
// PermittingRuleExtractionRun is backend-only RLS — no staffDataRead path.
// The extractor's claim ledger is the enumeration source: run_id when the
// write returned it, else resolve via request_key (deterministic per unit).
const IMPORT_LEDGER = '.audit-work/rule-import-claims.json';
const P6_RUN_CAP = 25; // candidate_handoff re-verifies every source — expensive
async function p6RuleImport(rankedAdd) {
  let ledger = {};
  try { ledger = JSON.parse(readFileSync(IMPORT_LEDGER, 'utf8')); } catch {}
  // Enumerate written runs across all extractor slice ledgers.
  const runs = []; // {unit, run_id, jurisdiction_id, request_key}
  try {
    for (const f of readdirSync('.audit-work').filter((x) => /^rule-extract-claims-\d+\.json$/.test(x))) {
      const c = JSON.parse(readFileSync(`.audit-work/${f}`, 'utf8')) || {};
      for (const [unit, v] of Object.entries(c))
        if (v?.result === 'written') runs.push({ unit, run_id: v.run_id || null, jurisdiction_id: v.jurisdiction_id || null, request_key: `local-rule-evidence:${unit}` });
    }
  } catch {}
  let imported = 0, held = 0, seen = 0, resolved = 0;
  for (const r of runs) {
    if (seen >= P6_RUN_CAP) break;
    // Resolve run_id through the app when the write response wasn't captured.
    if (!r.run_id) {
      const g = await call('permittingRuleReview', { action: 'run_by_key', request_key: r.request_key });
      if (!g?.success || !g.run_id) { if (g?.success && g.not_found) held += 1; continue; }
      r.run_id = g.run_id; resolved += 1;
      await sleep(400);
    }
    if (ledger[`${r.run_id}:*`]) continue; // whole-run ledger short-circuit
    // candidate_handoff = the app's own evidence gate (verifyRuleForApproval +
    // assertApprovalSourcesCurrent per candidate). evidence_ready:true means
    // the same checks a staff reviewer would see have already passed.
    const ev = await call('permittingRuleReview', { action: 'candidate_handoff', run_id: r.run_id });
    if (!ev?.success) { held += 1; continue; }
    seen += 1;
    let allDone = true;
    const notReady = [];
    for (const c of ev.candidates || []) {
      const key = `${r.run_id}:${c.candidate_index}`;
      if (c.imported_rule_id || ledger[key]) continue;
      allDone = false;
      if (!c.evidence_ready) { held += 1; notReady.push(c); continue; }
      const im = await call('permittingRuleReview', { action: 'import_candidate', run_id: r.run_id, candidate_index: c.candidate_index });
      if (im?.success) { imported += 1; ledger[key] = { at: Date.now(), rule_id: im.rule?.id || null, rules_created: im.rules_created || 0 }; }
      else if (im?.status === 'import_uncertain' || im?.status === 'create_uncertain') { held += 1; } // stays human
      await sleep(900);
    }
    // One human item per run — the blockers are almost always the same
    // upstream dependency (source doc authority review), not 40 decisions.
    if (notReady.length) {
      const reasons = [...new Set(notReady.map((c) => String(c.blocker || 'evidence not ready').slice(0, 120)))];
      rankedAdd({ surface: 'rule_import', jurisdiction: r.jurisdiction_id, item: `run ${r.run_id}: ${notReady.length} candidate(s) held`, blocker: reasons.join(' | '), impact: 2, suggested_action: /unverified|changed|another authority/i.test(reasons.join(' ')) ? 'verify the source document first (PermittingSourceAuthorityReview) — then this import unblocks automatically' : 'inspect candidates in the rule review UI' });
    }
    if (allDone) ledger[`${r.run_id}:*`] = { at: Date.now(), done: true };
    await sleep(500);
  }
  try { writeFileSync(IMPORT_LEDGER, JSON.stringify(ledger)); } catch {}
  emit({ stage: 'burn_p6_import', detail: `runs:${seen} ids-resolved:${resolved} rules imported:${imported} held-for-human:${held}` });
  return imported;
}

// ── P7: the ranked human queue ──────────────────────────────────────────────
const HQ = '.audit-work/human-review-queue.json';
function writeRankedQueue(items, { localities, profById }) {
  // Impact: apply-ready distance (lower dist = higher value unblocked) +
  // surface weight. Ranked desc.
  const dist = new Map();
  for (const l of localities) dist.set(`${String(l.name).toLowerCase()}|${l.state}`, applyDistance(l));
  const scored = items.map((it) => {
    const key = `${String(it.jurisdiction || '').toLowerCase().replace(/,\s*\w+$/, '')}|${(it.jurisdiction || '').split(',').pop()?.trim()}`;
    const d = [...dist.entries()].find(([k]) => k.startsWith(String(it.jurisdiction || '').toLowerCase().split(',')[0]));
    const prox = d ? Math.max(0, 3 - d[1]) : 1;
    return { ...it, score: (it.impact || 1) * 10 + prox, queued_at: new Date().toISOString(), pick_hint: it.surface === 'geocode' ? `node scripts/permitting-review-resolve.mjs --address "${it.item}" --pick "<Jurisdiction>"` : undefined };
  }).sort((a, b) => b.score - a.score);
  const dedup = new Map();
  for (const s of scored) dedup.set(`${s.surface}|${s.jurisdiction}|${s.item}`, s);
  const out = { generated_at: new Date().toISOString(), count: dedup.size, items: [...dedup.values()] };
  writeFileSync(HQ, JSON.stringify(out, null, 1));
  emit({ stage: 'burn_queue_depth', detail: `${out.count} items need a human — ranked in .audit-work/human-review-queue.json` });
  return out.count;
}

// ── main ───────────────────────────────────────────────────────────────────
async function cycle() {
  const M = mirrors();
  const ranked = [];
  const rankedAdd = (it) => ranked.push(it);
  emit({ stage: 'burn_cycle', detail: `mode:${ALL ? 'all' : drainOpen() ? 'auto(drained)' : 'auto(light)'}` });
  p1VerifyFeed(M);                                    // always — local only
  await p2QueueTriage(M, rankedAdd);                  // light remote, cold rows
  if (ALL || drainOpen()) {
    await p3DeadUrls(M, rankedAdd);
    p4p5(rankedAdd);
    await p6RuleImport(rankedAdd);
  }
  const depth = writeRankedQueue(ranked, M);
  // Self-healing geocode lane: the mint script reads the queue we just wrote
  // and auto-mints postal rules for unique safe matches (township-only and
  // ambiguous stay human by design). The mirror-sync rules table refreshes
  // within 5min, then validator retries resolve the flagged addresses —
  // closing the flag→rule→resolve loop with zero human touch.
  try {
    // Local-file-only pass — cheap enough to run every cycle regardless of
    // drain state; otherwise a backed-up outbox suppresses minting forever.
    execSync('node scripts/permitting-geocode-rule-mint.mjs', { stdio: 'ignore', timeout: 300000, windowsHide: true });
    emit({ stage: 'burn_geo_mint', ok: true, detail: 'geo rule-mint pass complete — new cities auto-ruled' });
  } catch (e) { emit({ stage: 'burn_geo_mint', ok: false, detail: `mint failed: ${String(e?.message || e).slice(0, 100)}` }); }
  return depth;
}

emit({ stage: 'burn_boot', address: 'review burn-down', ok: true, start: true, detail: `LP-7 backlog burn-down — ${ALL ? 'all passes' : 'auto mode'}` });
(async () => {
  while (true) {
    try { await cycle(); } catch (e) { emit({ stage: 'burn_err', ok: false, detail: String(e?.message || e).slice(0, 150) }); }
    if (ONCE) break;
    await sleep(10 * 60 * 1000);
  }
})();
