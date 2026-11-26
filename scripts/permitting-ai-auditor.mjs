#!/usr/bin/env node
// ai-auditor — SWE-2.1 reviews EVERY non-duplicate PermitLocality from local
// mirrors only (no fetches). Findings route through CODE, never the model:
//   verified-office demotions only when deterministic checks agree (50/hr
//   cap, 5% breaker), junk names only via the cleaner's own output,
//   non_permit_body only when the tightened rule agrees, contact/county/
//   type/duplicate findings go to the researcher boost pool, the rest to
//   the findings list.
// Audit priority (user rule): runs its sessions regardless of the extract
// queue — memory culling still frees researchers → extractor → auditor last.
//   node scripts/permitting-ai-auditor.mjs [--once] [--pilot N]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, openSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { drainQueue, outputFor, clearUnit, enqueueUnit, queueDepth, probeAuth, acpInfo, setSessionTarget, sessionFor } from './lib/devin-llm.mjs';
import { cleanOfficeName, isNonPermitOfficeName } from './lib/office-name-clean.mjs';
import { addBoost } from './lib/research-boost.mjs';
import { resolveTarget } from './lib/ai-sessions.mjs';
import { strictRoleEvidence, isOfficialSource } from './permitting-authority-verifier.mjs';
import { enqueue } from './lib/outbox.mjs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const HEARTBEAT_DIR = '.audit-work/heartbeats';

const FN = `https://base44.app/api/apps/${process.env.PERMIT_APP_ID || '68dfcc5e57bbbc35387da97c'}/functions`;
let token = null;
async function login() {
  for (let i = 0; i < 6; i++) {
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
  if (!r.ok) return { error: `HTTP ${r.status}` };
  return j;
}
const readById = async (entity, id) => {
  const j = await call('staffDataRead', { entity, query: { id }, limit: 1 });
  return (j?.records || j?.items || j?.data || [])[0] || null;
};

const WORKER = 'ai-auditor';
const ONCE = process.argv.includes('--once');
const PILOT = Number(process.argv.find((a) => a.startsWith('--pilot'))?.split('=')[1] || process.argv[process.argv.indexOf('--pilot') + 1] || 0) || null;
const FINDINGS = '.audit-work/ai-audit-findings.jsonl';
const REVERT_LOG = '.audit-work/ai-audit-reverts.jsonl';
const BOOST = '.audit-work/research-boost.jsonl';
const STATS = '.audit-work/ai-audit-stats.json';
const STATE_DIR = '.audit-work/audit-state';
const BREAKER_FILE = '.audit-work/ai-audit-breaker.json';
const BREAKER_CLEAR = '.audit-work/ai-audit-breaker-clear';
const VERIFY_FIRST = '.audit-work/verify-first.jsonl';
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: WORKER, ...e }) + '\n', { flag: 'a' }); } catch {} };
const appendLine = (f, o) => { try { writeFileSync(openSync(f, 'a'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const readControl = () => readJSON('.audit-work/server-control.json', {});
const auditSettings = () => {
  const c = readControl().ai_audit_settings || {};
  return { demote_cap_hr: c.demote_cap_hr ?? 50, breaker_pct: c.breaker_pct ?? 5, sessions: c.sessions ?? 3, sessions_mode: c.sessions_mode || 'auto' };
};

const stats = { sent: 0, answered: 0, failed: 0, audited: 0, findings: 0, demoted: 0, renamed: 0, boosted: 0, logged: 0, discarded: 0, current: null, breaker_tripped: false, demote_tokens: [], verified_flagged: 0, verified_audited: 0 };
// The breaker survives restarts — a tripped state persisted here is re-armed
// on boot; only the controller's clear marker releases it.
{
  const prior = readJSON(BREAKER_FILE, null);
  if (prior) { stats.breaker_tripped = true; stats.verified_flagged = prior.flagged || 0; stats.verified_audited = prior.audited || 0; }
}
const sessionLast = {}; // session idx → last finding it produced (live panel)
// Per-session heartbeats for the dashboard's live panel.
function sessionHeartbeats() {
  try {
    const info = acpInfo();
    for (const s of info.detail || []) {
      const hb = { at: new Date().toISOString(), session: s.i, busy: s.busy, alive: s.alive, units: s.units, since: s.since, partial: s.partial, model: s.model, last_finding: sessionLast[s.i] || null, stage: s.busy ? 'waiting on SWE-2.1' : 'idle' };
      writeFileSync(`${HEARTBEAT_DIR}/ai-auditor-s${s.i}.json`, JSON.stringify(hb));
    }
    return info.detail || [];
  } catch { return []; }
}
const saveStats = () => {
  const sessions = sessionHeartbeats();
  try { writeFileSync(STATS, JSON.stringify({ at: new Date().toISOString(), acp: acpInfo(), settings: auditSettings(), queue_depth: queueDepth(), sessions_live: sessions, ...stats }, null, 1)); } catch {}
};

const FINDING_TYPES = new Set(['wrong_jurisdiction', 'non_permit_body', 'junk_name', 'role_not_supported_by_quote', 'contact_mismatch', 'duplicate_office', 'wrong_county_or_type', 'paper_township', 'stale_or_placeholder', 'other']);
const BOOST_TYPES = new Set(['contact_mismatch', 'wrong_county_or_type', 'duplicate_office', 'wrong_jurisdiction']);

function buildUnit(loc, profile) {
  const offices = (loc.offices || []).map((o) => ({
    office_id: o.id || o.name, name: o.name, roles: o.authority_roles || [],
    contact_phone: o.contact_phone || null, contact_email: o.contact_email || null, contact_address: o.contact_address || null,
    status: o.authority_verification_status || null,
    evidence: (o.authority_evidence || []).slice(0, 4).map((e) => ({ quote: e.quote || e.responsibility_quote, url: e.source_url || e.official_source_url })),
    service_area: o.service_area || null,
  }));
  const domain = profile?.website_url || profile?.permitting_url || null;
  const payload = { name: loc.name, jurisdiction_type: loc.jurisdiction_type, county: loc.county_name, state: loc.state, parent_county: loc.parent_county || null, profile_id: loc.jurisdiction_profile_id, official_domain: domain, offices };
  return {
    id: `audit-${loc.id}`,
    prompt: `Audit this permitting record for data errors. JURISDICTION: ${JSON.stringify({ name: loc.name, type: loc.jurisdiction_type, county: loc.county_name, state: loc.state })} OFFICIAL DOMAIN: ${domain} OFFICES: ${JSON.stringify(offices)}. Return findings only when the data is wrong or unsupported — each {office_id|null, type, field, current, suggested|null, reason, quote|null, confidence}. Types: wrong_jurisdiction, non_permit_body, junk_name, role_not_supported_by_quote, contact_mismatch, duplicate_office, wrong_county_or_type, paper_township, stale_or_placeholder, other.`,
    schema: { findings: [{ office_id: 'string|null', type: 'one of the finding types', field: 'string', current: 'current value', suggested: 'suggested value|null', reason: 'why it looks wrong', quote: 'supporting quote|null', confidence: '0-1' }] },
    kind: 'ai-audit', meta: { locality_id: loc.id, jurisdiction: loc.name, state: loc.state, offices: offices.map((o) => ({ office_id: o.office_id, name: o.name, roles: o.roles, status: o.status, evidence: o.evidence })), official_domain: domain },
  };
}

const contentHash = (loc) => createHash('sha1').update(JSON.stringify({ n: loc.name, t: loc.jurisdiction_type, c: loc.county_name, d: loc.duplicate_of, o: (loc.offices || []).map((o) => [o.id || o.name, o.name, o.authority_roles, o.authority_verification_status, (o.authority_evidence || []).length, o.contact_phone, o.contact_email]) })).digest('hex');

// Deterministic re-check the auditor runs before demoting a verified office.
// Only demotes to the safe side (needs_verification) — never the other way.
function deterministicAgrees(meta, finding) {
  const o = meta.offices.find((x) => x.office_id === finding.office_id || x.name === finding.office_id);
  if (!o) return true; // office gone — nothing to defend
  if (finding.type === 'wrong_jurisdiction') {
    const name = String(o.name || '').toLowerCase();
    const jur = String(meta.jurisdiction || '').toLowerCase().replace(/^(city of|village of|township of)\s+/, '').split(' ')[0];
    const county = String(meta.county || '').toLowerCase();
    const url = (o.evidence || []).map((e) => e.url).join(' ');
    if (url && !isOfficialSource(url, { name: meta.jurisdiction, county_name: meta.county, website_url: meta.official_domain })) return true;
    return false;
  }
  // role_not_supported_by_quote — re-run the verifier's own evidence check
  const role = String(finding.field || '').split(' ')[0];
  const ev = (o.evidence || []).find((e) => e.url);
  if (!ev?.quote) return true; // no quote at all — agrees there is no support
  const gaps = strictRoleEvidence(role, { office_name: o.name, official_source_url: ev.url, responsibility_quote: ev.quote }, o.name, meta.jurisdiction, { name: meta.jurisdiction, county_name: meta.county, website_url: meta.official_domain });
  return gaps.length > 0;
}

async function demote(locality_id, office_id, reason) {
  const live = await readById('PermitLocality', locality_id).catch(() => null);
  if (!live?.offices) return false;
  // needs_recheck keeps contacts and visibility but stops counting as
  // verified; needs_verification is the fallback while the flag is off.
  const label = readControl().needs_recheck ? 'needs_recheck' : 'needs_verification';
  let changed = false;
  const offices = live.offices.map((o) => {
    if ((o.id || o.name) !== office_id) return o;
    changed = true;
    return { ...o, authority_verification_status: label, ...(label === 'needs_recheck' ? { recheck_reason: `ai-audit: ${reason}`, recheck_at: new Date().toISOString() } : {}) };
  });
  if (!changed) return false;
  enqueue({ entity: 'PermitLocality', op: 'update', id: locality_id, data: { offices }, priority: 1, note: `ai-audit demote — ${reason}` });
  mirrorApply('localities', { id: locality_id, offices });
  return true;
}

// Pure routing decision — the model proposes, code decides. Testable without
// files or remote calls: callers pass the deterministic-check result and the
// cap/breaker context in ctx.
export function decideAction(meta, f, ctx) {
  const office = (meta?.offices || []).find((o) => o.office_id === f.office_id || o.name === f.office_id);
  if ((f.type === 'role_not_supported_by_quote' || f.type === 'wrong_jurisdiction') && office?.status === 'staff_verified') {
    if (!ctx.demoteAgreed) return 'discarded_check_passed';
    if (ctx.breakerTripped || (ctx.verifiedAudited > 20 && (ctx.verifiedFlagged / ctx.verifiedAudited) * 100 > ctx.set.breaker_pct)) return 'breaker_tripped';
    if (ctx.demoteTokens >= ctx.set.demote_cap_hr) return 'cap_limited';
    return 'demote';
  }
  if (f.type === 'junk_name' && office) return ctx.cleanerOutput && ctx.cleanerOutput !== office.name ? 'name_cleaned' : 'discarded_cleaner_noop';
  if (f.type === 'non_permit_body' && office) return isNonPermitOfficeName(office.name) ? 'logged_rule_agrees' : 'review_rule_disagrees';
  if (BOOST_TYPES.has(f.type)) return 'sent_to_researchers';
  return 'logged';
}

async function processOutput(id) {
  const out = outputFor(id);
  const meta = out?.meta || null;
  if (!meta) { stats.failed++; return 0; }
  const findings = (Array.isArray(out?.output?.findings) ? out.output.findings : []).filter((f) => f && FINDING_TYPES.has(f.type));
  if (out == null) { stats.failed++; }
  const set = auditSettings();
  for (const f of findings) {
    stats.findings++;
    const office = meta.offices.find((o) => o.office_id === f.office_id || o.name === f.office_id);
    const rec = { locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state, office_id: f.office_id, office_name: office?.name || null, verified: office?.status === 'staff_verified', ...f };
    const now = Date.now();
    let action;
    if ((f.type === 'role_not_supported_by_quote' || f.type === 'wrong_jurisdiction') && office?.status === 'staff_verified') {
      stats.verified_flagged++;
      stats.demote_tokens = stats.demote_tokens.filter((t) => now - t < 3600000);
    }
    const decided = decideAction(meta, f, {
      set, demoteAgreed: office?.status === 'staff_verified' && (f.type === 'role_not_supported_by_quote' || f.type === 'wrong_jurisdiction') ? deterministicAgrees(meta, f) : false,
      breakerTripped: stats.breaker_tripped, verifiedAudited: stats.verified_audited, verifiedFlagged: stats.verified_flagged,
      demoteTokens: stats.demote_tokens.length, cleanerOutput: office ? cleanOfficeName(office.name).clean : null,
    });
    if (decided === 'discarded_check_passed' || decided === 'discarded_cleaner_noop' || decided === 'review_rule_disagrees') { stats.discarded++; action = decided; }
    else if (decided === 'breaker_tripped') { stats.breaker_tripped = true; action = decided; try { writeFileSync(BREAKER_FILE, JSON.stringify({ at: new Date().toISOString(), flagged: stats.verified_flagged, audited: stats.verified_audited, pct: set.breaker_pct })); } catch {} emit({ stage: 'ai_audit_breaker', ok: false, detail: `${set.breaker_pct}% breaker tripped — ${stats.verified_flagged}/${stats.verified_audited} verified flagged; auto-demotion paused` }); }
    else if (decided === 'cap_limited') action = decided;
    else if (decided === 'demote') {
      if (await demote(meta.locality_id, f.office_id, `${f.type}: ${String(f.reason || '').slice(0, 120)}`)) {
        stats.demoted++; stats.demote_tokens.push(now); action = 'demoted';
        const entry_id = `audit-${Date.now()}-${stats.demoted}`;
        appendLine(REVERT_LOG, { entry_id, action: 'demote', locality_id: meta.locality_id, office_id: f.office_id, office_name: office.name, finding: f.type, reason: f.reason });
        appendLine(VERIFY_FIRST, { name: meta.jurisdiction, state: meta.state, at: Date.now(), tier: 'audit', result: 'demoted' });
        // Demoted verified offices lead the audit lane — researchers re-fetch
        // official evidence before anything else.
        addBoost({ type: 'demote', locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state, finding: { type: 'demote', field: f.field, reason: f.reason } });
        emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `demoted ${office?.name || f.office_id} — ${f.type} re-checks` });
      } else action = 'logged';
    } else if (decided === 'name_cleaned') {
      const clean = cleanOfficeName(office.name).clean;
      const live = await readById('PermitLocality', meta.locality_id).catch(() => null);
      if (live?.offices) {
        const offices = live.offices.map((o) => (o.id || o.name) === f.office_id ? { ...o, name: clean } : o);
        enqueue({ entity: 'PermitLocality', op: 'update', id: meta.locality_id, data: { offices }, priority: 1, note: `ai-audit clean — ${office.name} → ${clean}` });
        mirrorApply('localities', { id: meta.locality_id, offices });
        stats.renamed++; action = 'name_cleaned';
        appendLine(REVERT_LOG, { entry_id: `audit-${Date.now()}-${stats.renamed}`, action: 'rename', locality_id: meta.locality_id, office_id: f.office_id, before_name: office.name, after_name: clean });
        emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `name cleaned — "${office.name}" → "${clean}"` });
      } else action = 'logged';
    } else if (decided === 'sent_to_researchers') {
      addBoost({ type: f.type, locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state, finding: { type: f.type, field: f.field, current: f.current, suggested: f.suggested, reason: f.reason } });
      stats.boosted++; action = 'sent_to_researchers';
      emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `sent to researchers — ${f.type} on ${office?.name || f.office_id || 'record'}` });
    } else action = decided; // logged / logged_rule_agrees
    if (/^discarded_/.test(action)) emit({ stage: 'ai_audit_finding', address: `${meta.jurisdiction}, ${meta.state}`, ok: false, detail: `discarded ${f.type} on ${office?.name || f.office_id || 'record'} — ${action}` });
    else if (action !== 'logged') emit({ stage: 'ai_audit_finding', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `confirmed ${f.type} on ${office?.name || f.office_id || 'record'} → ${action}` });
    appendLine(FINDINGS, { ...rec, action });
    if (action === 'logged' || action === 'review_rule_disagrees') stats.logged++;
  }
  return findings.length;
}

async function main() {
  emit({ stage: 'ai_audit_boot', ok: true, start: true, detail: 'ai-auditor live — SWE-2.1 record audit over local mirrors' });
  // Live panel: drainQueue blocks for a whole batch, so session state would
  // only ever snapshot as idle — refresh heartbeats on a timer instead.
  setInterval(() => { try { saveStats(); } catch {} }, 1500).unref();
  mkdirSync(STATE_DIR, { recursive: true });
  do {
    await waitWhilePaused(WORKER, { item: 'audit coverage' });
    const ctrl = readControl();
    if (ctrl.ai_audit === false || ctrl.ai_audit_paused) { heartbeat(WORKER, 'idle', ctrl.ai_audit === false ? 'ai_audit off' : 'paused'); saveStats(); await sleep(30000); if (ONCE) return; continue; }
    // Session count: manual pins 1–8 from the audit settings; auto follows
    // the guard's target file (researchers cut first under pressure).
    const aset = ctrl.ai_audit_settings || {};
    setSessionTarget(resolveTarget({ mode: aset.sessions_mode || 'auto', manual: aset.sessions ?? 3, auto: readJSON('.audit-work/ai-session-targets.json', {}).audit ?? 3 }));
    // "Resume auto-demotion" — the controller drops this marker file; consume
    // it AND the persisted breaker state so a later re-trip isn't pre-cleared.
    if (stats.breaker_tripped && existsSync(BREAKER_CLEAR)) {
      try { unlinkSync(BREAKER_CLEAR); } catch {}
      try { unlinkSync(BREAKER_FILE); } catch {}
      stats.breaker_tripped = false; stats.verified_flagged = 0; stats.verified_audited = 0;
      emit({ stage: 'ai_audit_breaker', ok: true, detail: 'auto-demotion resumed — breaker cleared by user' });
    }
    const auth = await probeAuth();
    if (auth !== 'ok') { heartbeat(WORKER, 'idle', 'SWE-2.1 not signed in'); saveStats(); await sleep(60000); if (ONCE) return; continue; }
    // Coverage: verified-first, then partial, then the rest; skip duplicates
    // and unchanged records (audit-state content hash).
    const localities = (getMirror('localities')?.rows || []).filter((l) => !l.duplicate_of && !/(paper — no permitting authority)/.test(l.name));
    const profById = new Map([...(getMirror('profiles-oh.slim')?.rows || []), ...(getMirror('profiles-ky.slim')?.rows || [])].map((p) => [p.id, p]));
    const score = (l) => (l.offices || []).reduce((a, o) => a + (o.authority_verification_status === 'staff_verified' ? 1 : 0), 0);
    localities.sort((a, b) => score(b) - score(a));
    let total = 0, done = 0;
    const limit = PILOT || localities.length;
    for (const loc of localities) {
      if (total >= limit) break;
      const h = contentHash(loc);
      const stPath = `${STATE_DIR}/${loc.id}.json`;
      const st = readJSON(stPath, null);
      if (st?.hash === h) { done++; continue; }
      const pending = existsSync(`.audit-work/audit-queue/audit-${loc.id}.json`) || existsSync(`.audit-work/audit-out/audit-${loc.id}.json`);
      if (pending) continue;
      const unit = buildUnit(loc, profById.get(loc.jurisdiction_profile_id));
      enqueueUnit(unit);
      emit({ stage: 'ai_audit_unit_sent', address: `${loc.name}, ${loc.state}`, ok: true, detail: `queued ${(loc.offices || []).length} office(s) for SWE-2.1 review` });
      total++;
      stats.current = `${loc.name}, ${loc.state}`;
      if (total >= (Number(process.env.DEVIN_LLM_BATCH) || 5) * 3) break; // feed in waves
    }
    if (!total && queueDepth() === 0) {
      const r = await drainQueue({ maxBatches: 4, sleepMs: 4000 }).catch(() => null);
      heartbeat(WORKER, 'idle', 'coverage complete — waiting for record changes');
      saveStats(); await sleep(60000); if (ONCE) return; continue;
    }
    const res = await drainQueue({ maxBatches: 4, sleepMs: 4000 });
    stats.sent += res.produced || 0;
    // process outputs
    try {
      for (const f of readdirSync('.audit-work/audit-out').filter((x) => x.startsWith('audit-') && x.endsWith('.json'))) {
        const id = f.slice(0, -5);
        stats.answered++;
        const sessIdx = sessionFor(id);
        const out = outputFor(id);
        emit({ stage: 'ai_audit_unit_answered', address: out?.meta ? `${out.meta.jurisdiction}, ${out.meta.state}` : id, ok: out != null, detail: out ? `${(out.output?.findings || []).length} finding(s) from SWE-2.1${sessIdx != null ? ` (session ${sessIdx + 1})` : ''}` : 'no readable output' });
        if (sessIdx != null && out?.output?.findings?.length) sessionLast[sessIdx] = { at: new Date().toISOString(), jurisdiction: out.meta?.jurisdiction, finding: out.output.findings[0]?.type, reason: out.output.findings[0]?.reason };
        await processOutput(id);
        const meta = out?.meta;
        if (!meta) { clearUnit(id); continue; }
        const loc = localities.find((l) => l.id === meta.locality_id);
        if (loc) {
          writeFileSync(`${STATE_DIR}/${loc.id}.json`, JSON.stringify({ at: Date.now(), hash: contentHash(loc) }));
          stats.audited++;
          stats.verified_audited += (meta.offices || []).filter((o) => o.status === 'staff_verified').length;
        }
        clearUnit(id);
        stats.current = null;
      }
    } catch {}
    heartbeat(WORKER, 'working', `audited ${stats.audited} · queue ${queueDepth()} · findings ${stats.findings}`);
    saveStats();
    if (ONCE) return;
    await sleep(6000);
  } while (true);
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === pathResolve(process.argv[1]);
if (isMain) main().catch((e) => { emit({ stage: 'ai_audit_error', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
