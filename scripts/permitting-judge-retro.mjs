#!/usr/bin/env node
// Retro AI-judge pass over staff_verified offices — newest-promoted first.
//
// FEED: for each staff_verified office, the strict-pass evidence per role
// becomes a retro candidate in promote-candidates.jsonl (retro:true). The
// auditor's judge lane picks them up ahead of audit units. Feeding is
// capped (FEED_CAP un-judged retro candidates pending) so the retro doesn't
// flood the judge lane at the expense of live candidates.
//
// CONSUME: judge-verdicts.jsonl retro rows —
//   'no'      → needs_recheck via the relabel path (live point read, merge
//               by office id, FIFO enqueue, mirrorApply, revert log) +
//               needs_recheck research boost for the failed roles.
//   'unclear' → stays verified, listed in judge-unclear.jsonl for Brett.
//   'yes'     → stays verified; nothing is written.
//
// Only 'no' verdicts produce writes here — the safe direction. Live
// (non-retro) verdicts are the verifier's business when promote_hold lifts.
//
//   node scripts/permitting-judge-retro.mjs [--once]
import { readFileSync, writeFileSync, appendFileSync, existsSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue, outboxDepth } from './lib/outbox.mjs';
import { addBoostOnce } from './lib/research-boost.mjs';
import { strictRoleEvidence, researchForOffice, buildCountyIndex, countyProfileFor } from './permitting-authority-verifier.mjs';
import { readLocLive } from './permitting-recheck-relabel.mjs';
import { appendCandidates, pendingCandidates, verdictMap, vkey, candHash, UNCLEAR_FILE, JUDGE_PROMPT_VERSION, LEGACY_PROMPT_VERSION } from './lib/promote-judge.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { idleWait } from './lib/event-tail.mjs';

const WORKER = 'judge-retro';
const ONCE = process.argv.includes('--once');
const FEED_CAP = Number(process.env.RETRO_FEED_CAP || 400);
const REVERT_FILE = '.audit-work/judge-retro-revert.jsonl';
const STATE_FILE = '.audit-work/judge-retro-state.json';
const STATS_FILE = '.audit-work/judge-retro-stats.json';
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: WORKER, ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
// Retro state is prompt-versioned. v1 acted/fed rows are audit history only;
// resetting them is safe because the candidate log still carries the evidence.
function readRetroState() {
  const s = readJSON(STATE_FILE, null);
  if (s?.prompt_version === JUDGE_PROMPT_VERSION) {
    s.fed = s.fed || {}; s.acted = s.acted || [];
    return s;
  }
  if (s && !existsSync(`${STATE_FILE}.${LEGACY_PROMPT_VERSION}.bak`)) {
    try { writeFileSync(`${STATE_FILE}.${LEGACY_PROMPT_VERSION}.bak`, JSON.stringify(s, null, 1)); } catch {}
  }
  return { prompt_version: JUDGE_PROMPT_VERSION, fed: {}, acted: [] };
}

// ── FEED ─────────────────────────────────────────────────────────────────
// staff_verified offices sorted by verified_at desc (never-dated last) get
// retro candidates for every role whose stored evidence passes strict —
// the exact evidence that promoted them is what the judge re-examines.
async function feed() {
  const [locs, oh, ky] = await Promise.all([
    mirrorRead('localities', 15 * 60e3, async () => null),
    mirrorRead('profiles-oh', 30 * 60e3, async () => null),
    mirrorRead('profiles-ky', 30 * 60e3, async () => null),
  ]);
  const profById = new Map([...(oh || []), ...(ky || [])].map((p) => [p.id, p]));
  const countyIndex = buildCountyIndex([...(oh || []), ...(ky || [])]);
  const cands = pendingCandidates();
  const verdicts = verdictMap();
  let pendingRetro = 0;
  for (const [k, c] of cands) if (c.retro === true && !verdicts.has(k)) pendingRetro++;
  const offices = [];
  for (const loc of locs || []) {
    if (loc.duplicate_of) continue;
    for (const o of loc.offices || []) {
      if (o.authority_verification_status !== 'staff_verified') continue;
      offices.push({ loc, o, at: o.verified_at || o.authority_verified_at || '' });
    }
  }
  offices.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  let fed = 0, scanned = 0;
  const state = readRetroState();
  for (const { loc, o } of offices) {
    scanned++;
    const profile = profById.get(loc.jurisdiction_profile_id);
    const countyProfile = countyProfileFor(loc, countyIndex);
    const judgeRows = [], toAppend = [];
    for (const role of o.authority_roles || []) {
      const entries = researchForOffice(profile, o.name, loc, o.authority_roles || [], o.id, countyProfile)
        .filter((e) => e.role === role && String(e?.applicability) === 'potentially_applicable');
      const best = entries.map((e) => ({ e, gaps: strictRoleEvidence(role, e, o.name, loc.name, profile) })).sort((a, b) => a.gaps.length - b.gaps.length)[0];
      if (!best || best.gaps.length) continue; // strict-fail roles are the relabel path's job
      const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const row = { role, entry_office_name: clean(best.e.office_name || best.e.label), quote: clean(best.e.responsibility_quote), url: clean(best.e.official_source_url) };
      const h = candHash({ office_id: o.id, role, quote: row.quote });
      const key = vkey(o.id, role, h);
      if (verdicts.has(key)) continue;
      const withHash = { ...row, cand_hash: h, alreadyQueued: cands.has(key) };
      judgeRows.push(withHash);
      if (!withHash.alreadyQueued) toAppend.push(withHash);
    }
    // The cap limits NEW candidate rows, not bookkeeping for rows that are
    // already queued. Otherwise a full legacy candidate backlog would prevent
    // state.fed registration and consume() would wait forever.
    const room = Math.max(0, FEED_CAP - pendingRetro);
    const appendRows = toAppend.slice(0, room);
    const effectiveRows = judgeRows.filter((r) => r.alreadyQueued || appendRows.some((a) => a.role === r.role && a.cand_hash === r.cand_hash));
    if (!effectiveRows.length) continue;
    if (appendRows.length) {
      appendCandidates(loc, o, appendRows.map(({ alreadyQueued, ...r }) => r), { retro: true });
      pendingRetro += appendRows.length;
    }
    // state.fed is the completion contract for consume(). Keep it even after
    // some roles are judged; only add newly-discovered roles/hashes here.
    const prior = state.fed[o.id] || { hashes: {}, roles: [] };
    const roles = new Set([...(prior.roles || []), ...effectiveRows.map((r) => r.role)]);
    const hashes = { ...(prior.hashes || {}) };
    for (const r of effectiveRows) hashes[r.role] = r.cand_hash;
    state.fed[o.id] = {
      ...prior,
      locality_id: loc.id, jurisdiction: `${loc.name}, ${loc.state}`, office_name: o.name,
      roles: [...roles], hashes, fed_at: prior.fed_at || new Date().toISOString(), prompt_version: JUDGE_PROMPT_VERSION,
    };
    fed++;
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  if (fed) emit({ stage: 'retro_fed', ok: true, detail: `${fed} staff_verified office(s) registered for ${JUDGE_PROMPT_VERSION} retro judgment (${pendingRetro} pending)` });
  return { fed, pendingRetro, scanned, total: offices.length };
}

// ── CONSUME ──────────────────────────────────────────────────────────────
// An office is judged-complete when every fed retro role has a verdict.
// 'no' on any role → needs_recheck for the whole office (office-level
// status), reason names the judge's per-role verdicts.
// Completion is keyed through verdictMap()'s prompt-versioned keys — v1 rows
// remain in the verdict log but cannot satisfy a v2 retro candidate.
async function consume() {
  const state = readRetroState();
  state.acted = state.acted || [];
  const done = new Set(state.acted);
  const verdicts = verdictMap(true); // v2 keys are the only keys looked up below
  let relabeled = 0, unclear = 0, clean = 0, completeOffices = 0, waiting = 0;
  for (const [officeId, fed] of Object.entries(state.fed || {})) {
    if (done.has(officeId)) continue;
    const roleNames = [...new Set(fed.roles || Object.keys(fed.hashes || {}))];
    if (!roleNames.length) continue;
    const rows = [];
    for (const role of roleNames) {
      const h = (fed.hashes || {})[role];
      const v = h ? verdicts.get(vkey(officeId, role, h)) : null;
      if (v) rows.push(v);
    }
    if (rows.length < roleNames.length) { waiting++; continue; }
    completeOffices++;
    const no = rows.filter((r) => r.verdict === 'no');
    const un = rows.filter((r) => r.verdict === 'unclear');
    if (no.length) {
      const live = await readLocLive(fed.locality_id);
      if (!live?.offices) { emit({ stage: 'retro_relabel_error', detail: `${fed.jurisdiction} live read failed` }); continue; }
      const reason = `AI judge ${JUDGE_PROMPT_VERSION}: ${no.map((r) => `${r.role} — ${String(r.reason || 'evidence does not assign this duty').slice(0, 140)}`).join(' · ')}`;
      let changed = 0;
      const offices = live.offices.map((o) => {
        if (o.id !== officeId || o.authority_verification_status !== 'staff_verified') return o;
        changed++;
        return { ...o, authority_verification_status: 'needs_recheck', recheck_reason: reason.slice(0, 500), recheck_at: new Date().toISOString() };
      });
      if (changed) {
        enqueue({ entity: 'PermitLocality', op: 'update', id: fed.locality_id, data: { offices }, mirror: 'localities', note: `retro judge ${JUDGE_PROMPT_VERSION} — ${fed.jurisdiction}` });
        mirrorApply('localities', { ...live, offices });
        appendFileSync(REVERT_FILE, JSON.stringify({ at: new Date().toISOString(), prompt_version: JUDGE_PROMPT_VERSION, locality_id: fed.locality_id, jurisdiction: fed.jurisdiction, offices: [{ id: officeId, name: fed.office_name, before_status: 'staff_verified', verdicts: rows.map((r) => ({ role: r.role, verdict: r.verdict, reason: r.reason, guard: r.guard || null, cand_hash: r.cand_hash })) }] }) + '\n');
        addBoostOnce({ locality_id: fed.locality_id, type: 'needs_recheck', finding: { type: 'needs_recheck', roles: no.map((r) => r.role), offices: [fed.office_name], reason } });
        emit({ stage: 'retro_relabeled', jurisdiction: fed.jurisdiction, ok: true, detail: `${fed.office_name} → needs_recheck (${no.map((r) => r.role).join(', ')})` });
        relabeled += changed;
      }
    } else if (un.length) {
      for (const r of un) {
        appendFileSync(UNCLEAR_FILE, JSON.stringify({ at: new Date().toISOString(), prompt_version: JUDGE_PROMPT_VERSION, office_id: officeId, locality_id: fed.locality_id, jurisdiction: fed.jurisdiction, office_name: fed.office_name, role: r.role, provider: r.provider, reason: r.reason, guard: r.guard || null, url: r.url, cand_hash: r.cand_hash }) + '\n');
        addBoostOnce({ locality_id: fed.locality_id, type: 'judge_unclear', finding: { type: 'judge_unclear', roles: [r.role], offices: [fed.office_name], cand_hash: r.cand_hash, reason: `AI judge unclear: ${String(r.reason || 'evidence does not assign this duty').slice(0, 180)}` } });
      }
      unclear += un.length;
    } else clean++;
    state.acted.push(officeId); done.add(officeId);
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  return { relabeled, unclear, clean, waiting, judgedOffices: completeOffices };
}

async function tick() {
  const f = await feed();
  const c = await consume();
  writeFileSync(STATS_FILE, JSON.stringify({ at: new Date().toISOString(), feed: f, consume: c }, null, 1));
  heartbeat(WORKER, 'busy', `retro: ${f.pendingRetro} pending · ${c.judgedOffices} judged · ${c.relabeled} relabeled`);
}

async function main() {
  for (;;) {
    await waitWhilePaused(WORKER);
    await tick();
    if (ONCE) return;
    while (await outboxDepth() > 10000) { heartbeat(WORKER, 'idle', 'outbox blowout — waiting'); await sleep(15000); }
    await idleWait(120e3);
  }
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === pathResolve(process.argv[1]);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
