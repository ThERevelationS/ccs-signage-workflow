#!/usr/bin/env node
// needs_recheck relabel worker — flag-gated (server-control `needs_recheck`,
// default off; the catalog entry only spawns when the flag is on).
//
// Pass: every staff_verified office that fails the strict evidence check
// becomes 'needs_recheck' — keeps contacts, stays visible, stops counting
// as verified — with recheck_reason/recheck_at. Live point read + merge by
// office id, individual updates through the outbox (no priority lane — the
// flusher's normal traffic goes first), mirrorApply for local truth, a
// revert log for undo, and boost-lane entries so researchers re-prove them
// right behind the audit lane. On pass end the audit breaker baseline resets
// (its 22.6% was measured against pre-tightening data).
//
//   node scripts/permitting-recheck-relabel.mjs [--once]
//   --plan    dry-run only: write .audit-work/recheck-plan.json and exit
//   --revert  restore statuses from .audit-work/recheck-revert.jsonl
//   --verify  live read-back pass over the revert log entries
import { readFileSync, writeFileSync, appendFileSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue, outboxDepth } from './lib/outbox.mjs';
import { addBoost } from './lib/research-boost.mjs';
import { strictRoleEvidence, researchForOffice, buildCountyIndex, countyProfileFor } from './permitting-authority-verifier.mjs';
import { cleanOfficeName, isGenericOfficeName, isNonPermitOfficeName, isPlaceholderOffice } from './lib/office-name-clean.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { idleWait } from './lib/event-tail.mjs';

const WORKER = 'recheck-relabel';
const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const PLAN = args.includes('--plan');
const REVERT = args.includes('--revert');
const VERIFY = args.includes('--verify');
const PLAN_FILE = '.audit-work/recheck-plan.json';
const REVERT_FILE = '.audit-work/recheck-revert.jsonl';
const BREAKER_FILE = '.audit-work/ai-audit-breaker.json';
const STATS_FILE = '.audit-work/recheck-relabel-stats.json';
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: WORKER, ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const readControl = () => readJSON('.audit-work/server-control.json', {});
const subCheck = (g) => g.split(':').slice(1).join(':');

// ── live point read (same staffDataRead path the other workers use) ───────
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token = null;
async function login() {
  const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
  if (t?.token) { token = t.token; return true; }
  return false;
}
async function call(fn, body, retried = false, netRetry = 0) {
  let r;
  await paceCall(fn);
  try { r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }), signal: AbortSignal.timeout(60000) }); }
  catch (e) { if (netRetry < 4) { await sleep(3000 * (netRetry + 1)); return call(fn, body, retried, netRetry + 1); } return { error: String(e?.message || e) }; }
  if ((r.status === 401 || r.status === 403) && !retried) { await login(); return call(fn, body, true, netRetry); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}` };
  return j;
}
async function readLocLive(id) {
  const j = await call('staffDataRead', { entity: 'PermitLocality', query: { id }, limit: 1 });
  return j?.items?.[0] || j?.records?.[0] || j?.record || (Array.isArray(j) ? j[0] : null);
}

// ── strict-fail scan (mirror data, same rules the audit estimate uses) ────
// Offices whose ONLY failure is no_matching_entry are excluded — their
// promote-time evidence hasn't been located, so there is nothing strict can
// judge. They're listed separately and relabelled only once real evidence
// exists to check. Per-role proven/failed drives recheck_reason.
function scan(localities, profById, countyIndex) {
  const targets = [], excluded = [];
  for (const loc of localities) {
    if (loc.duplicate_of) continue;
    const profile = profById.get(loc.jurisdiction_profile_id);
    const countyProfile = countyProfileFor(loc, countyIndex);
    const badOffices = [];
    for (const o of loc.offices || []) {
      if (o.authority_verification_status !== 'staff_verified') continue;
      const cname = cleanOfficeName(o.name).clean;
      const subs = new Set();
      const proven = [], failed = [];
      const nameJunk = !cname || isGenericOfficeName(cname) || isNonPermitOfficeName(o.name) || isPlaceholderOffice(o.name, loc.name);
      if (nameJunk) subs.add('office_name_junk');
      for (const role of o.authority_roles || []) {
        const entries = researchForOffice(profile, o.name, loc, o.authority_roles || [], o.id, countyProfile).filter((e) => e.role === role && String(e?.applicability) === 'potentially_applicable');
        if (!entries.length) { subs.add('no_matching_entry'); failed.push(role); continue; }
        const best = entries.map((e) => strictRoleEvidence(role, e, o.name, loc.name, profile)).sort((a, b) => a.length - b.length)[0];
        if (!best.length && !nameJunk) { proven.push(role); continue; }
        failed.push(role);
        for (const g of best) subs.add(subCheck(g));
      }
      if (!subs.size) continue;
      const rec = { id: o.id, name: o.name, subs: [...subs].sort(), proven, failed };
      if (subs.size === 1 && subs.has('no_matching_entry')) excluded.push({ ...rec, jurisdiction: `${loc.name}, ${loc.state}` });
      else badOffices.push(rec);
    }
    if (badOffices.length) targets.push({ loc, badOffices });
  }
  return { targets, excluded };
}

// "proven: building · needs proof: sign_permit" — office-level status, but
// the reason names which roles still need evidence (researchers target
// only those; the verifier re-promotes when every assigned role passes).
function recheckReason(b) {
  return `${b.proven.length ? `proven: ${b.proven.join(', ')} · ` : ''}needs proof: ${b.failed.join(', ')}${b.subs.includes('office_name_junk') ? ' · office name flagged' : ''}`;
}

// ── merge one locality live → enqueue needs_recheck updates ──────────────
async function relabelLoc(t) {
  const live = await readLocLive(t.loc.id);
  if (!live?.offices) return { loc: t.loc, skipped: 'read_failed' };
  const want = new Map(t.badOffices.filter((b) => b.id).map((b) => [b.id, b]));
  let changed = 0;
  const offices = live.offices.map((o) => {
    const b = want.get(o.id);
    if (!b || o.authority_verification_status !== 'staff_verified') return o;
    changed++;
    return { ...o, authority_verification_status: 'needs_recheck', recheck_reason: recheckReason(b), recheck_at: new Date().toISOString() };
  });
  if (!changed) return { loc: t.loc, skipped: 'already_changed' };
  enqueue({ entity: 'PermitLocality', op: 'update', id: t.loc.id, data: { offices }, mirror: 'localities', note: `recheck relabel — ${t.loc.name}, ${t.loc.state}` });
  mirrorApply('localities', { ...live, offices });
  const entry = { at: new Date().toISOString(), locality_id: t.loc.id, jurisdiction: `${t.loc.name}, ${t.loc.state}`, offices: t.badOffices.filter((b) => want.has(b.id)).map((b) => ({ id: b.id, name: b.name, subs: b.subs, before_status: 'staff_verified' })) };
  appendFileSync(REVERT_FILE, JSON.stringify(entry) + '\n');
  return { loc: t.loc, changed };
}

// Offices already enqueued (revert log) must not re-enqueue on the next
// hourly pass: the remote still reads staff_verified until the flusher
// drains the backlog, so both the mirror and the live read look "undone".
const alreadyDone = () => {
  const ids = new Set();
  for (const row of revertRows()) for (const o of row.offices || []) if (o.id) ids.add(o.id);
  return ids;
};

async function applyPass() {
  const [locs, oh, ky] = await Promise.all([
    mirrorRead('localities', 15 * 60e3, async () => null),
    mirrorRead('profiles-oh', 30 * 60e3, async () => null),
    mirrorRead('profiles-ky', 30 * 60e3, async () => null),
  ]);
  const profById = new Map([...(oh || []), ...(ky || [])].map((p) => [p.id, p]));
  const countyIndex = buildCountyIndex([...(oh || []), ...(ky || [])]);
  const { targets, excluded } = scan(locs || [], profById, countyIndex);
  const doneIds = PLAN ? new Set() : alreadyDone();
  if (doneIds.size) for (const t of targets) t.badOffices = t.badOffices.filter((b) => !doneIds.has(b.id));
  const liveTargets = targets.filter((t) => t.badOffices.length);
  const plan = {
    at: new Date().toISOString(), localities: targets.length,
    offices: targets.reduce((n, t) => n + t.badOffices.length, 0),
    excluded_no_matching_entry: { count: excluded.length, offices: excluded },
    by_subcheck: {}, examples: targets.flatMap((t) => t.badOffices.map((b) => ({ jurisdiction: `${t.loc.name}, ${t.loc.state}`, office: b.name, subs: b.subs, reason: recheckReason(b) }))).slice(0, 15),
  };
  for (const t of targets) for (const b of t.badOffices) for (const s of b.subs) plan.by_subcheck[s] = (plan.by_subcheck[s] || 0) + 1;
  plan.enqueued_already = doneIds.size;
  writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 1));
  if (PLAN) { console.log(JSON.stringify(plan, null, 1)); return; }
  emit({ stage: 'recheck_plan', detail: `${plan.offices} offices on ${plan.localities} localities fail strict (${doneIds.size} already enqueued)`, ok: true });

  let done = 0, officesChanged = 0, skipped = 0;
  // Below normal traffic: enqueues are FIFO (no priority lane) behind the
  // whole existing backlog and paced ~24 loc/min — bounded marginal load.
  // A depth gate can only deadlock here (the fleet's standing backlog
  // perpetually grows): normal writes are never displaced because every
  // relabel item lands behind everything already queued. The only hard
  // stop is a genuine backlog blowout ceiling.
  for (const t of liveTargets) {
    await waitWhilePaused(WORKER, { item: `relabel ${t.loc.name}` });
    if (readControl().needs_recheck === false) { emit({ stage: 'recheck_paused', detail: 'needs_recheck flag off — stopping', ok: true }); break; }
    while (await outboxDepth() > 10000) { heartbeat(WORKER, 'idle', `outbox blowout — waiting`); await sleep(15000); }
    const r = await relabelLoc(t);
    done++;
    if (r.changed) {
      officesChanged += r.changed;
      const failedRoles = [...new Set(t.badOffices.flatMap((b) => b.failed))];
      addBoost({ locality_id: t.loc.id, type: 'needs_recheck', finding: { type: 'needs_recheck', roles: failedRoles, offices: t.badOffices.map((b) => b.name), reason: `strict re-check: ${r.changed} office(s) — needs proof: ${failedRoles.join(', ')}` } });
    }
    else skipped++;
    heartbeat(WORKER, 'busy', `relabel ${done}/${liveTargets.length}`);
    if (done % 25 === 0) writeFileSync(STATS_FILE, JSON.stringify({ at: new Date().toISOString(), done, targets: liveTargets.length, offices_changed: officesChanged, skipped }, null, 1));
    await sleep(1500); // paced localities/min — bounded marginal load on the FIFO
  }
  // Breaker baseline reset: the 22.6% trip measured pre-tightening data.
  // The auditor only zeroes its IN-MEMORY counters via the clear marker —
  // writing the trip file alone gets overwritten by its next blocked flag.
  try { writeFileSync(BREAKER_FILE, JSON.stringify({ at: new Date().toISOString(), flagged: 0, audited: 0, pct: 0, reset: 'baseline reset after strict-relabel pass' })); } catch {}
  try { writeFileSync('.audit-work/ai-audit-breaker-clear', new Date().toISOString()); } catch {}
  writeFileSync(STATS_FILE, JSON.stringify({ at: new Date().toISOString(), done, targets: liveTargets.length, offices_changed: officesChanged, skipped, complete: done >= liveTargets.length }, null, 1));
  emit({ stage: 'recheck_done', detail: `${officesChanged} offices → needs_recheck on ${done - skipped} localities (${skipped} skipped)`, ok: true });
}

// ── revert / verify helpers ───────────────────────────────────────────────
const revertRows = () => { try { return readFileSync(REVERT_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
async function revertPass() {
  const rows = revertRows();
  let done = 0;
  for (const row of rows) {
    const live = await readLocLive(row.locality_id);
    if (!live?.offices) continue;
    const want = new Map(row.offices.map((o) => [o.id, o]));
    let changed = 0;
    const offices = live.offices.map((o) => { const w = want.get(o.id); if (!w || o.authority_verification_status !== 'needs_recheck') return o; changed++; return { ...o, authority_verification_status: w.before_status || 'staff_verified', recheck_reason: null, recheck_at: null }; });
    if (!changed) continue;
    enqueue({ entity: 'PermitLocality', op: 'update', id: row.locality_id, data: { offices }, mirror: 'localities', note: `recheck revert — ${row.jurisdiction}`, priority: 1 });
    mirrorApply('localities', { ...live, offices });
    done++;
    await sleep(800);
  }
  console.log(`reverted ${done} localities`);
}
async function verifyPass() {
  const rows = revertRows();
  let ok = 0, bad = 0;
  for (const row of rows) {
    const live = await readLocLive(row.locality_id);
    const want = new Map(row.offices.map((o) => [o.id, o]));
    const mis = (live?.offices || []).filter((o) => want.has(o.id) && o.authority_verification_status !== 'needs_recheck').length;
    if (mis) { bad++; console.log('MISS', row.jurisdiction, mis); } else ok++;
    await sleep(300);
  }
  console.log(`verify: ${ok} localities all-needs_recheck, ${bad} with misses`);
}

async function main() {
  if (REVERT) return revertPass();
  if (VERIFY) return verifyPass();
  if (PLAN) return applyPass(); // plan never touches the outbox
  for (;;) {
    if (readControl().needs_recheck === false) { heartbeat(WORKER, 'idle', 'needs_recheck flag off'); await sleep(30000); if (ONCE) return; continue; }
    await applyPass();
    if (ONCE) return;
    await idleWait(3600e3); // re-evaluate hourly: new verifies get re-checked
  }
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === pathResolve(process.argv[1]);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
export { scan };
