#!/usr/bin/env node
// ai-extractor — the only owner of the ACP extraction pool. Drains
// .audit-work/extract-queue via devin-llm (devin.exe acp --model swe-2.1),
// runs the hard code guard on every answer, and writes accepted evidence as
// normal needs_verification research drafts (extracted_by 'swe-2.1') through
// the outbox. The verifier is unchanged — it still decides promotion.
//
//   node scripts/permitting-ai-extractor.mjs [--once]
import { readdirSync, readFileSync, writeFileSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drainQueue, outputFor, clearUnit, queueDepth, probeAuth, acpInfo, setSessionTarget } from './lib/devin-llm.mjs';
import { validateExtractAnswer } from './lib/ai-extract-guard.mjs';
import { enqueue } from './lib/outbox.mjs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { resolveTarget } from './lib/ai-sessions.mjs';

const WORKER = 'ai-extractor';
const ONCE = process.argv.includes('--once');
const STATS = '.audit-work/ai-extract-stats.json';
const QUEUE_DIR = '.audit-work/extract-queue';
const EVENTS = '.live-events.jsonl';
const VERIFY_FIRST = '.audit-work/verify-first.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: WORKER, ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const readControl = () => readJSON('.audit-work/server-control.json', {});

const stats = { sent: 0, answered: 0, accepted: 0, rejected: {}, promoted_evidence: 0, last_unit: null, last_result: null };
const bump = (reason) => { stats.rejected[reason] = (stats.rejected[reason] || 0) + 1; };
const saveStats = () => {
  const info = acpInfo();
  try {
    for (const s of info.detail || []) {
      writeFileSync(`.audit-work/heartbeats/ai-extractor-s${s.i}.json`, JSON.stringify({ at: new Date().toISOString(), session: s.i, busy: s.busy, alive: s.alive, units: s.units, since: s.since, partial: s.partial, model: s.model, stage: s.busy ? 'waiting on SWE-2.1' : 'idle' }));
    }
  } catch {}
  try { writeFileSync(STATS, JSON.stringify({ at: new Date().toISOString(), queue_depth: queueDepth(), acp: info, sessions_live: info.detail, ...stats }, null, 1)); } catch {}
};

// Pure scoring for tests + the worker loop: run the guard over a unit's
// answers, return accepted answers and per-answer reject reasons.
export function scoreAnswers(meta, answers) {
  const accepted = [], rejected = [];
  for (const a of answers || []) {
    if (a == null) continue;
    const v = validateExtractAnswer({ pages: meta?.pages || [] }, a);
    if (v.ok) accepted.push(a); else rejected.push({ reason: v.reason });
  }
  return { accepted, rejected };
}

// Merge accepted answers into the profile's office_research.roles — the
// exact shape a researcher's draft write takes — then verify-first.
function writeDraft(meta, answers, profById) {
  const loc = (getMirror('localities')?.rows || []).find((l) => l.id === meta.locality_id);
  const profile = loc && profById.get(loc.jurisdiction_profile_id);
  if (!profile?.id) return false;
  const roles = (profile.office_research?.roles || []).slice();
  let added = 0;
  for (const a of answers) {
    if (roles.some((r) => r.role === a.role && String(r.responsibility_quote) === a.quote)) continue;
    roles.push({
      role: a.role, office_name: a.office_name || `${meta.jurisdiction} offices`,
      official_source_url: a.source_url, applicability: 'potentially_applicable',
      responsibility_quote: a.quote, service_area: null, delegation_quote: null,
      contact_info: { contact_phone: a.phone || null, contact_email: a.email || null, contact_address: a.address || null },
      research_fields: {}, extracted_by: 'swe-2.1',
    });
    added++;
  }
  if (!added) return false;
  const out = { ...(profile.office_research || {}), roles };
  enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: out }, mirror: `profiles-${String(profile.state || meta.state).toLowerCase()}`, priority: 1, note: `ai-extract draft — ${meta.jurisdiction}` });
  mirrorApply(`profiles-${String(profile.state || meta.state).toLowerCase()}`, { id: profile.id, office_research: out });
  return true;
}

async function processOutputs(profById) {
  const outDir = '.audit-work/extract-out';
  const files = readdirSync(outDir).filter((f) => f.startsWith('loc-') && f.endsWith('.json'));
  for (const f of files) {
    const id = f.slice(0, -5);
    const out = outputFor(id);
    let meta = out?.meta || null;
    if (!meta) { try { meta = JSON.parse(readFileSync(join(QUEUE_DIR, `${id}.json`), 'utf8')).meta; } catch {} }
    if (!meta?.pages) { clearUnit(id); continue; }
    const answers = Array.isArray(out?.output?.answers) ? out.output.answers : [];
    stats.answered++;
    const { accepted, rejected } = scoreAnswers(meta, answers);
    for (const r of rejected) bump(r.reason);
    if (accepted.length) {
      stats.accepted += accepted.length;
      if (writeDraft(meta, accepted, profById)) {
        try { openSync(VERIFY_FIRST, 'a'); writeFileSync(VERIFY_FIRST, JSON.stringify({ name: meta.jurisdiction, state: meta.state, at: Date.now(), tier: 'ai', result: 'swe-2.1' }) + '\n', { flag: 'a' }); } catch {}
        emit({ stage: 'ai_extract_accepted', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `${accepted.length} role evidence accepted (swe-2.1) → draft + verify-first` });
      }
    }
    stats.last_unit = id; stats.last_result = { answered: answers.length, accepted: accepted.length };
    clearUnit(id);
  }
  stats.sent += 0; // sent is incremented by batch starts below
}

async function main() {
  emit({ stage: 'ai_extract_boot', ok: true, start: true, detail: `ai-extractor live — swe-2.1 evidence hunts via acp (${process.env.DEVIN_LLM_SESSIONS || 2} sessions, batch ${process.env.DEVIN_LLM_BATCH || 5})` });
  // Live panel: drainQueue blocks for a whole batch, so session state would
  // only ever snapshot as idle — refresh heartbeats on a timer instead.
  setInterval(() => { try { saveStats(); } catch {} }, 1500).unref();
  do {
    await waitWhilePaused(WORKER, { item: 'extract queue' });
    if (readControl().ai_extract === false) { heartbeat(WORKER, 'idle', 'ai_extract off — regex-only'); saveStats(); await sleep(30000); if (ONCE) return; continue; }
    // Session count: manual pins 1–8; auto follows the guard's target file.
    const ctrl = readControl();
    const xset = ctrl.ai_extract_settings || {};
    setSessionTarget(resolveTarget({ mode: xset.sessions_mode || 'auto', manual: xset.sessions ?? 2, auto: readJSON('.audit-work/ai-session-targets.json', {}).extract ?? 2 }));
    const auth = await probeAuth();
    if (auth !== 'ok') { heartbeat(WORKER, 'idle', 'SWE-2.1 not signed in'); saveStats(); await sleep(60000); if (ONCE) return; continue; }
    const depth = queueDepth();
    if (!depth) { heartbeat(WORKER, 'idle', 'extract queue empty'); saveStats(); await sleep(20000); if (ONCE) return; continue; }
    const before = depth;
    const profiles = [...(getMirror('profiles-oh.slim')?.rows || []), ...(getMirror('profiles-ky.slim')?.rows || [])];
    const profById = new Map(profiles.map((p) => [p.id, p]));
    const r = await drainQueue({ maxBatches: 6, sleepMs: 3000 });
    stats.sent += Math.min(before, r.batches * (Number(process.env.DEVIN_LLM_BATCH) || 5)) || before;
    await processOutputs(profById);
    heartbeat(WORKER, 'working', `drained ${r.produced || 0} outputs · queue ${queueDepth()}`);
    saveStats();
    if (ONCE) return;
    await sleep(8000);
  } while (true);
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch((e) => { emit({ stage: 'ai_extract_error', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
