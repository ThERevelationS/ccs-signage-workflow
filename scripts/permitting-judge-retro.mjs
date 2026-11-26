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
import { addBoost } from './lib/research-boost.mjs';
import { strictRoleEvidence, researchForOffice, buildCountyIndex, countyProfileFor } from './permitting-authority-verifier.mjs';
import { readLocLive } from './permitting-recheck-relabel.mjs';
import { appendCandidates, pendingCandidates, verdictMap, vkey, candHash, UNCLEAR_FILE } from './lib/promote-judge.mjs';
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
  const state = readJSON(STATE_FILE, { fed: {} });
  for (const { loc, o } of offices) {
    if (pendingRetro >= FEED_CAP) break;
    scanned++;
    const profile = profById.get(loc.jurisdiction_profile_id);
    const countyProfile = countyProfileFor(loc, countyIndex);
    const roleRows = [];
    for (const role of o.authority_roles || []) {
      const entries = researchForOffice(profile, o.name, loc, o.authority_roles || [], o.id, countyProfile)
        .filter((e) => e.role === role && String(e?.applicability) === 'potentially_applicable');
      const best = entries.map((e) => ({ e, gaps: strictRoleEvidence(role, e, o.name, loc.name, profile) })).sort((a, b) => a.gaps.length - b.gaps.length)[0];
      if (!best || best.gaps.length) continue; // strict-fail roles are the relabel path's job
      const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const row = { role, entry_office_name: clean(best.e.office_name || best.e.label), quote: clean(best.e.responsibility_quote), url: clean(best.e.official_source_url) };
      const h = candHash({ office_id: o.id, role, quote: row.quote });
      if (cands.has(vkey(o.id, role, h)) || verdicts.has(vkey(o.id, role, h))) continue;
      roleRows.push({ ...row, cand_hash: h });
    }
    if (!roleRows.length) continue;
    appendCandidates(loc, o, roleRows, { retro: true });
    state.fed[o.id] = { locality_id: loc.id, jurisdiction: `${loc.name}, ${loc.state}`, office_name: o.name, roles: roleRows.map((r) => r.role), fed_at: new Date().toISOString() };
    fed++;
    pendingRetro += roleRows.length;
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  if (fed) emit({ stage: 'retro_fed', ok: true, detail: `${fed} staff_verified office(s) queued for retro judgment (${pendingRetro} pending)` });
  return { fed, pendingRetro, scanned, total: offices.length };
}

// ── CONSUME ──────────────────────────────────────────────────────────────
// An office is judged-complete when every fed retro role has a verdict.
// 'no' on any role → needs_recheck for the whole office (office-level
// status), reason names the judge's per-role verdicts.
function readVerdictRows() { try { return readFileSync('.audit-work/judge-verdicts.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }

async function consume() {
  const state = readJSON(STATE_FILE, { fed: {}, acted: [] });
  state.acted = state.acted || [];
  const done = new Set(state.acted);
  const verdictRows = readVerdictRows().filter((v) => v.retro === true);
  const byOffice = new Map();
  for (const v of verdictRows) {
    const g = byOffice.get(v.office_id) || [];
    g.push(v); byOffice.set(v.office_id, g);
  }
  let relabeled = 0, unclear = 0, clean = 0;
  for (const [officeId, rows] of byOffice) {
    if (done.has(officeId)) continue;
    const fed = state.fed[officeId];
    if (!fed) continue; // not ours (or state lost — skip rather than guess)
    // wait until every fed role got a verdict
    const fedRoles = new Set(fed.roles);
    if (new Set(rows.map((r) => r.role)).size < fedRoles.size) continue;
    const no = rows.filter((r) => r.verdict === 'no');
    const un = rows.filter((r) => r.verdict === 'unclear');
    if (no.length) {
      const live = await readLocLive(fed.locality_id);
      if (!live?.offices) { emit({ stage: 'retro_relabel_error', detail: `${fed.jurisdiction} live read failed` }); continue; }
      const reason = `AI judge: ${no.map((r) => `${r.role} — ${String(r.reason || 'evidence does not assign this duty').slice(0, 140)}`).join(' · ')}`;
      let changed = 0;
      const offices = live.offices.map((o) => {
        if (o.id !== officeId || o.authority_verification_status !== 'staff_verified') return o;
        changed++;
        return { ...o, authority_verification_status: 'needs_recheck', recheck_reason: reason.slice(0, 500), recheck_at: new Date().toISOString() };
      });
      if (changed) {
        enqueue({ entity: 'PermitLocality', op: 'update', id: fed.locality_id, data: { offices }, mirror: 'localities', note: `retro judge — ${fed.jurisdiction}` });
        mirrorApply('localities', { ...live, offices });
        appendFileSync(REVERT_FILE, JSON.stringify({ at: new Date().toISOString(), locality_id: fed.locality_id, jurisdiction: fed.jurisdiction, offices: [{ id: officeId, name: fed.office_name, before_status: 'staff_verified', verdicts: rows.map((r) => ({ role: r.role, verdict: r.verdict, reason: r.reason })) }] }) + '\n');
        addBoost({ locality_id: fed.locality_id, type: 'needs_recheck', finding: { type: 'needs_recheck', roles: no.map((r) => r.role), offices: [fed.office_name], reason } });
        emit({ stage: 'retro_relabeled', jurisdiction: fed.jurisdiction, ok: true, detail: `${fed.office_name} → needs_recheck (${no.map((r) => r.role).join(', ')})` });
        relabeled += changed;
      }
    } else if (un.length) {
      for (const r of un) appendFileSync(UNCLEAR_FILE, JSON.stringify({ at: new Date().toISOString(), office_id: officeId, locality_id: fed.locality_id, jurisdiction: fed.jurisdiction, office_name: fed.office_name, role: r.role, provider: r.provider, reason: r.reason, url: r.url }) + '\n');
      unclear += un.length;
    } else clean++;
    state.acted.push(officeId); done.add(officeId);
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  return { relabeled, unclear, clean, judgedOffices: byOffice.size };
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
