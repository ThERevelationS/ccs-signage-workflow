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
import { addBoost, addBoostOnce } from './lib/research-boost.mjs';
import { resolveTarget } from './lib/ai-sessions.mjs';
import { strictRoleEvidence, isOfficialSource } from './permitting-authority-verifier.mjs';
import { pendingCandidates, verdictMap, appendVerdict, judgeUnit, judgeUnitId, JUDGE_PROMPT_VERSION } from './lib/promote-judge.mjs';
import { enqueue } from './lib/outbox.mjs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { buildAdjudicationUnit, validateAdjudicationVerdict, buildResolutionPatch, validateResolutionPatch, adjudicationTargets, structuralFactsFor } from './lib/needs-review-adjudication.mjs';

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

// Full-office-array writes are asynchronous. A second action on the same
// locality must build on the first pending write, not on the pre-write live
// point read, or the later update clobbers the first when both flush.
const pendingLocalityWrites = new Map(); // id → {at, data}
const PENDING_WRITE_OVERLAY_MS = 10 * 60 * 1000;
export function overlayPendingLocality(live, pending) {
  if (!live || !pending?.data || Date.now() - pending.at > PENDING_WRITE_OVERLAY_MS) return live;
  return { ...live, ...pending.data };
}
function noteLocalityWrite(id, data) {
  pendingLocalityWrites.set(id, { at: Date.now(), data });
}
async function readLocalityForWrite(id) {
  const live = await readById('PermitLocality', id).catch(() => null);
  return overlayPendingLocality(live, pendingLocalityWrites.get(id));
}

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
const NEEDS_LEDGER = '.audit-work/verification-ledger.json';
const OFFICE_STATE = '.audit-work/verify-office-state.json';
const ADJUDICATION_STATE = '.audit-work/adjudication-state.json';
const ADJUDICATION_RESULTS = '.audit-work/adjudication-results.jsonl';
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

const stats = { sent: 0, answered: 0, failed: 0, audited: 0, findings: 0, demoted: 0, renamed: 0, retired: 0, boosted: 0, logged: 0, discarded: 0, already_applied: 0, current: null, breaker_tripped: false, demote_tokens: [], verified_flagged: 0, verified_audited: 0 };

// Breaker population: only offices verified under the strict judge era count.
// Legacy offices (no authority_verified_at, or verified before judge v2 went
// live) still demote when the evidence fails — they just can't re-trip the
// safety breaker during the expected cleanup wave.
export const STRICT_VERIFY_ERA_AT = '2026-11-26T22:00:00.000Z';
const STRICT_VERIFY_ERA_MS = Date.parse(STRICT_VERIFY_ERA_AT);
const BREAKER_POPULATION = 'strict-era-v1';
export function isStrictEraVerified(office) {
  // New strict promotions are stamped authority_verified_at by the verifier.
  // The strict verifier versions already running wrote the timestamp as
  // verified_at — treat either as proof of strict-era evaluation, but never
  // offices with no strict timestamp at all.
  const t = Date.parse(office?.authority_verified_at || office?.verified_at || '');
  return Number.isFinite(t) && t >= STRICT_VERIFY_ERA_MS;
}

// The breaker survives restarts — a tripped state persisted here is re-armed
// on boot; only the controller's clear marker releases it. Pre-fix breaker
// files have no population marker and are intentionally reset: they measured
// the legacy cleanup wave this version excludes.
{
  const prior = readJSON(BREAKER_FILE, null);
  if (prior?.population === BREAKER_POPULATION) { stats.breaker_tripped = true; stats.verified_flagged = prior.flagged || 0; stats.verified_audited = prior.audited || 0; }
  else if (prior) { try { unlinkSync(BREAKER_FILE); } catch {} }
}

// Exact repeat suppression for automatic writes. The audit-state hash can
// legitimately change while the write is still flowing through the outbox;
// without this the same rename/demote is applied again minutes later.
export function readActionLog(file = REVERT_LOG) {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
export function actionAlreadyApplied(entries, want, now = Date.now(), windowMs = 7 * 24 * 3600e3) {
  return (entries || []).some((e) => {
    if (!e || e.action !== want.action || String(e.office_id || '') !== String(want.office_id || '')) return false;
    const at = Date.parse(e.at || '');
    if (!Number.isFinite(at) || now - at > windowMs || at > now + 60000) return false;
    if (want.action === 'rename') return e.before_name === want.before_name && e.after_name === want.after_name;
    if (want.action === 'demote') return Boolean(e.before_status && e.after_status && e.before_status === want.before_status && e.after_status === want.after_status);
    return false;
  });
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
    authority_verified_at: o.authority_verified_at || null,
    verified_at: o.verified_at || null,
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

const contentHash = (loc) => createHash('sha1').update(JSON.stringify({ n: loc.name, t: loc.jurisdiction_type, c: loc.county_name, d: loc.duplicate_of, o: (loc.offices || []).map((o) => [o.id || o.name, o.name, o.authority_roles, o.authority_verification_status, o.authority_verified_at, o.not_applicable_roles, (o.authority_evidence || []).length, o.contact_phone, o.contact_email]) })).digest('hex');

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
  const live = await readLocalityForWrite(locality_id);
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
  noteLocalityWrite(locality_id, { offices });
  mirrorApply('localities', { id: locality_id, offices });
  return true;
}

// Soft-retire a non-permitting body: the office is never deleted. It moves to
// archived_offices with a full snapshot and a reversal reason, while the
// declared office_change_log records the active-count transition.
async function retireOffice(locality_id, office_id, reason, retiredBy = 'ai-auditor') {
  const live = await readLocalityForWrite(locality_id);
  if (!live?.offices) return null;
  const key = (o) => o?.id || o?.name;
  let target = null;
  let targetIndex = -1;
  const offices = [];
  for (const [i, o] of live.offices.entries()) {
    if (key(o) === office_id || o.name === office_id) { target = o; targetIndex = i; }
    else offices.push(o);
  }
  if (!target) return null;
  const at = new Date().toISOString();
  const archived = [...(live.archived_offices || []), { ...target, retired_reason: reason, retired_at: at, retired_by: retiredBy }];
  const verified = offices.filter((o) => o.authority_verification_status === 'staff_verified').length;
  const office_change_log = [...(live.office_change_log || []), { at, summary: `ai-audit: archived non-permit office ${target.name}`, office_count: offices.length, verified_count: verified }].slice(-20);
  const data = { offices, archived_offices: archived, office_change_log };
  enqueue({ entity: 'PermitLocality', op: 'update', id: locality_id, data, priority: 1, note: `ai-audit retire non-permit — ${target.name}` });
  noteLocalityWrite(locality_id, data);
  mirrorApply('localities', { id: locality_id, ...data });
  return { target, targetIndex, data, at };
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
  if (f.type === 'non_permit_body' && office) return isNonPermitOfficeName(office.name) ? 'retire_non_permit' : 'review_rule_disagrees';
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
      if (isStrictEraVerified(office)) stats.verified_flagged++;
      stats.demote_tokens = stats.demote_tokens.filter((t) => now - t < 3600000);
    }
    const decided = decideAction(meta, f, {
      set, demoteAgreed: office?.status === 'staff_verified' && (f.type === 'role_not_supported_by_quote' || f.type === 'wrong_jurisdiction') ? deterministicAgrees(meta, f) : false,
      breakerTripped: stats.breaker_tripped, verifiedAudited: stats.verified_audited, verifiedFlagged: stats.verified_flagged,
      demoteTokens: stats.demote_tokens.length, cleanerOutput: office ? cleanOfficeName(office.name).clean : null,
    });
    if (decided === 'discarded_check_passed' || decided === 'discarded_cleaner_noop' || decided === 'review_rule_disagrees') { stats.discarded++; action = decided; }
    else if (decided === 'breaker_tripped') { stats.breaker_tripped = true; action = decided; try { writeFileSync(BREAKER_FILE, JSON.stringify({ at: new Date().toISOString(), population: BREAKER_POPULATION, flagged: stats.verified_flagged, audited: stats.verified_audited, pct: set.breaker_pct })); } catch {} emit({ stage: 'ai_audit_breaker', ok: false, detail: `${set.breaker_pct}% breaker tripped — ${stats.verified_flagged}/${stats.verified_audited} strict-era verified flagged; auto-demotion paused` }); }
    else if (decided === 'cap_limited') action = decided;
    else if (decided === 'demote') {
      const label = readControl().needs_recheck ? 'needs_recheck' : 'needs_verification';
      if (actionAlreadyApplied(readActionLog(), { action: 'demote', office_id: f.office_id, before_status: 'staff_verified', after_status: label })) {
        stats.already_applied++; action = 'already_applied';
      } else if (await demote(meta.locality_id, f.office_id, `${f.type}: ${String(f.reason || '').slice(0, 120)}`)) {
        stats.demoted++; stats.demote_tokens.push(now); action = 'demoted';
        const entry_id = `audit-${Date.now()}-${stats.demoted}`;
        appendLine(REVERT_LOG, { entry_id, action: 'demote', locality_id: meta.locality_id, office_id: f.office_id, office_name: office.name, finding: f.type, reason: f.reason, before_status: 'staff_verified', after_status: label });
        appendLine(VERIFY_FIRST, { name: meta.jurisdiction, state: meta.state, at: Date.now(), tier: 'audit', result: 'demoted' });
        // Demoted verified offices lead the audit lane — researchers re-fetch
        // official evidence before anything else.
        addBoost({ type: 'demote', locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state, finding: { type: 'demote', field: f.field, reason: f.reason } });
        emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `demoted ${office?.name || f.office_id} — ${f.type} re-checks` });
      } else action = 'logged';
    } else if (decided === 'retire_non_permit') {
      const retired = await retireOffice(meta.locality_id, f.office_id, `non-permitting body — ${String(f.reason || '').slice(0, 160)}`);
      if (retired) {
        stats.retired++; action = 'retired_non_permit';
        appendLine(REVERT_LOG, { entry_id: `audit-${Date.now()}-${stats.retired}`, action: 'retire', locality_id: meta.locality_id, office_id: f.office_id, office_name: retired.target.name, office_index: retired.targetIndex, before_office: retired.target, reason: f.reason });
        emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `archived non-permit office — ${retired.target.name}` });
      } else action = 'logged';
    } else if (decided === 'name_cleaned') {
      const clean = cleanOfficeName(office.name).clean;
      if (actionAlreadyApplied(readActionLog(), { action: 'rename', office_id: f.office_id, before_name: office.name, after_name: clean })) {
        stats.already_applied++; action = 'already_applied';
      } else {
        const live = await readLocalityForWrite(meta.locality_id);
        if (live?.offices) {
          const offices = live.offices.map((o) => (o.id || o.name) === f.office_id ? { ...o, name: clean } : o);
          enqueue({ entity: 'PermitLocality', op: 'update', id: meta.locality_id, data: { offices }, priority: 1, note: `ai-audit clean — ${office.name} → ${clean}` });
          noteLocalityWrite(meta.locality_id, { offices });
          mirrorApply('localities', { id: meta.locality_id, offices });
          stats.renamed++; action = 'name_cleaned';
          appendLine(REVERT_LOG, { entry_id: `audit-${Date.now()}-${stats.renamed}`, action: 'rename', locality_id: meta.locality_id, office_id: f.office_id, before_name: office.name, after_name: clean });
          emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `name cleaned — "${office.name}" → "${clean}"` });
        } else action = 'logged';
      }
    } else if (decided === 'sent_to_researchers') {
      addBoost({ type: f.type, locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state, finding: { type: f.type, field: f.field, current: f.current, suggested: f.suggested, reason: f.reason } });
      stats.boosted++; action = 'sent_to_researchers';
      emit({ stage: 'ai_audit_action', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `sent to researchers — ${f.type} on ${office?.name || f.office_id || 'record'}` });
    } else action = decided; // logged
    if (/^discarded_/.test(action)) emit({ stage: 'ai_audit_finding', address: `${meta.jurisdiction}, ${meta.state}`, ok: false, detail: `discarded ${f.type} on ${office?.name || f.office_id || 'record'} — ${action}` });
    else if (action !== 'logged') emit({ stage: 'ai_audit_finding', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `confirmed ${f.type} on ${office?.name || f.office_id || 'record'} → ${action}` });
    appendLine(FINDINGS, { ...rec, action });
    if (action === 'logged' || action === 'review_rule_disagrees') stats.logged++;
  }
  return findings.length;
}

// ── needs-review adjudication lane ─────────────────────────────────────
// Lowest-priority SWE lane: one unit per held office. Positive resolutions are
// guarded twice (verdict shape/evidence, then the exact write patch) and are
// counted only after a live read-back proves the write landed.
const ADJ_LIMIT_ARG = Number(process.argv.find((a) => a.startsWith('--adjudicate-limit'))?.split('=')[1] || process.argv[process.argv.indexOf('--adjudicate-limit') + 1] || NaN);
function adjudicationLimit(ctrl) {
  if (Number.isFinite(ADJ_LIMIT_ARG)) return Math.max(0, ADJ_LIMIT_ARG);
  const c = ctrl.ai_adjudication || {};
  if (c.enabled === false) return 0;
  return Number.isFinite(Number(c.limit)) ? Math.max(0, Number(c.limit)) : 20; // pilot-sized default
}
function adjudicationState() { return readJSON(ADJUDICATION_STATE, { offices: {} }); }
function saveAdjudicationState(state) { try { writeFileSync(ADJUDICATION_STATE, JSON.stringify(state, null, 1)); } catch {} }
const ADJUDICATION_COHORT = '.audit-work/adjudication-pilot-cohort.json';
function adjudicationCohort(ctrl, targets, limit) {
  // The default 20 is a pilot cohort, not a rolling replacement window. An
  // operator can scale later by setting ai_adjudication.limit explicitly.
  const explicit = Number.isFinite(Number(ctrl?.ai_adjudication?.limit));
  if (explicit || limit !== 20) return targets;
  let cohort = readJSON(ADJUDICATION_COHORT, null);
  if (!cohort?.keys?.length) {
    cohort = { created_at: new Date().toISOString(), limit, keys: targets.slice(0, limit).map((t) => `${t.loc.id}:${t.office.id || t.office.name}`) };
    try { writeFileSync(ADJUDICATION_COHORT, JSON.stringify(cohort, null, 1)); } catch {}
    return targets.slice(0, limit);
  }
  const keys = new Set(cohort.keys);
  return targets.filter((t) => keys.has(`${t.loc.id}:${t.office.id || t.office.name}`));
}
function inAdjudicationCohort(ctrl, key) {
  if (Number.isFinite(Number(ctrl?.ai_adjudication?.limit))) return true;
  const cohort = readJSON(ADJUDICATION_COHORT, null);
  return !cohort?.keys?.length || cohort.keys.includes(key);
}
function countyProfileForAdjudication(loc, profiles) {
  const county = String(loc.county_name || loc.parent_county_name || '').replace(/\s+county$/i, '').toLowerCase();
  if (!county) return null;
  return (profiles || []).find((p) => /county/i.test(String(p.type || p.jurisdiction_type || '')) && String(p.state || '').toUpperCase() === String(loc.state || '').toUpperCase() && String(p.name || '').toLowerCase().includes(county)) || null;
}
function feedAdjudicationUnits(localities, profById, ctrl) {
  const limit = adjudicationLimit(ctrl);
  if (!limit) return 0;
  const ledger = readJSON(NEEDS_LEDGER, null);
  const rows = ledger?.needs_review || [];
  if (!rows.length) return 0;
  const officeState = readJSON(OFFICE_STATE, { offices: {} });
  const adj = adjudicationState();
  const profiles = [...profById.values()];
  let queueFiles = [];
  try { queueFiles = readdirSync('.audit-work/audit-queue'); } catch {}
  const unitPending = (id) => queueFiles.some((f) => f === `${id}.json` || f.startsWith(`${id}.json.claim-`));
  // `limit` is the total pilot population, not merely the number fed in one
  // pass. Existing queued/claimed units consume slots even when changing
  // ledger eligibility rotates the target list underneath them.
  let slots = Math.max(0, limit - queueFiles.filter((f) => f.startsWith('adjudicate-')).length);
  let queued = 0;
  const targets = adjudicationCohort(ctrl, adjudicationTargets({ ledgerRows: rows, localities, officeState, adjudicated: adj.offices || {}, limit }), limit);
  for (const t of targets) {
    if (!slots) break;
    const profile = profById.get(t.loc.jurisdiction_profile_id) || null;
    const countyProfile = countyProfileForAdjudication(t.loc, profiles);
    const unit = buildAdjudicationUnit(t.row, t.loc, t.office, officeState, profile, countyProfile);
    const key = `${t.loc.id}:${unit.meta.office_id}`;
    const prior = adj.offices?.[key];
    if (prior?.hash === unit.meta.hash && ['not_applicable', 'covered_elsewhere', 'exists_unproven'].includes(prior.verdict)) continue;
    if (unitPending(unit.id) || existsSync(`.audit-work/audit-out/${unit.id}.json`)) continue;
    enqueueUnit(unit);
    queueFiles.push(`${unit.id}.json`); // do not re-feed inside this same pass
    slots--;
    queued++;
    emit({ stage: 'ai_adjudicate_feed', address: `${t.loc.name}, ${t.loc.state}`, ok: true, detail: `${t.office.name} — ${unit.meta.missing_roles.join('+')} adjudication queued` });
  }
  return queued;
}

function resolutionConfirmed(live, officeId, roles) {
  const active = (live?.offices || []).find((o) => (o.id || o.name) === officeId);
  if (active) {
    if ((active.authority_roles || []).some((r) => roles.includes(r))) return false;
    const na = active.not_applicable_roles || {};
    return roles.every((r) => na[r]?.verdict);
  }
  const archived = (live?.archived_offices || []).find((o) => (o.id || o.name) === officeId);
  return Boolean(archived && roles.every((r) => archived.not_applicable_roles?.[r]?.verdict));
}

async function writeResolutionWithReadback(meta, verdict) {
  const live = await readLocalityForWrite(meta.locality_id);
  if (!live?.offices) return { ok: false, errors: ['live point read failed'] };
  const check = validateAdjudicationVerdict(verdict, meta, live);
  if (!check.ok) return { ok: false, errors: check.errors, stage: 'verdict_guard' };
  const patch = buildResolutionPatch(live, meta.office_id, verdict);
  if (patch.error) return { ok: false, errors: [patch.error], stage: 'patch_build' };
  const patchCheck = validateResolutionPatch(live, meta.office_id, verdict, patch);
  if (!patchCheck.ok) return { ok: false, errors: patchCheck.errors, stage: 'patch_guard' };
  enqueue({ entity: 'PermitLocality', op: 'update', id: meta.locality_id, data: patch.data, priority: 1, note: `needs-review adjudication — ${meta.office_name}` });
  noteLocalityWrite(meta.locality_id, patch.data);
  mirrorApply('localities', { id: meta.locality_id, ...patch.data });
  // The outbox is asynchronous. Do not count the office resolved until the
  // live entity read-back shows either role removal + NA metadata or the
  // archived snapshot. Priority writes are fast under an empty queue, but the
  // fleet can legitimately be draining a thousand-record research backlog;
  // five minutes is the conservative confirmation window.
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const back = await readById('PermitLocality', meta.locality_id).catch(() => null);
    if (resolutionConfirmed(back, meta.office_id, verdict.roles_resolved || [])) {
      const n = (stats.adjudication_writes || 0) + 1;
      appendLine(REVERT_LOG, {
        entry_id: `adjudicate-${Date.now()}-${n}`, action: 'adjudicate_resolution', locality_id: meta.locality_id,
        office_id: meta.office_id, office_name: meta.office_name, before_office: patch.target,
        verdict: verdict.verdict, roles_resolved: verdict.roles_resolved || [], reason: verdict.reason,
      });
      return { ok: true, patch, confirmed: true };
    }
  }
  return { ok: false, errors: ['write read-back timeout — not counted resolved'], stage: 'readback', patch };
}

async function processAdjudicationOutput(id) {
  const out = outputFor(id);
  const meta = out?.meta;
  if (!meta?.locality_id || !meta?.office_id) { clearUnit(id); return { skipped: 'no meta' }; }
  const cohortKey = `${meta.locality_id}:${meta.office_id}`;
  if (!inAdjudicationCohort(readControl(), cohortKey)) {
    emit({ stage: 'ai_adjudicate_done', address: `${meta.jurisdiction}, ${meta.state}`, ok: true, detail: `${meta.office_name} ignored — outside the fixed 20-office pilot cohort` });
    clearUnit(id);
    return { skipped: 'outside pilot cohort' };
  }
  const verdict = out?.output || {};
  const key = `${meta.locality_id}:${meta.office_id}`;
  const state = adjudicationState();
  state.offices = state.offices || {};
  let result = { verdict: verdict.verdict || 'invalid', action: 'rejected', errors: [] };
  if (out?.output?.error) {
    result.errors = [String(out.output.error).slice(0, 300)];
  } else if (verdict.verdict === 'exists_unproven') {
    const check = validateAdjudicationVerdict(verdict, meta, (getMirror('localities')?.rows || []).find((l) => l.id === meta.locality_id));
    if (check.ok) {
      const proof = String(verdict.proof_expectation || '').trim();
      const boost = addBoostOnce({
        type: 'exists_unproven', locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state,
        finding: { type: 'exists_unproven', offices: [meta.office_id], roles: verdict.roles_resolved || meta.missing_roles || [], missing_proof: proof, reason: `Find exactly: ${proof}` },
      });
      result = { verdict: 'exists_unproven', action: boost.already ? 'boost_already_pending' : 'boosted', errors: [], proof_expectation: proof };
    } else result.errors = check.errors;
  } else if (verdict.verdict === 'not_applicable' || verdict.verdict === 'covered_elsewhere') {
    const wr = await writeResolutionWithReadback(meta, verdict);
    if (wr.ok) result = { verdict: verdict.verdict, action: 'write_confirmed', errors: [], archived: wr.patch.archived === true };
    else result = { verdict: verdict.verdict, action: 'rejected', errors: [`${wr.stage || 'write'}: ${(wr.errors || []).join('; ')}`] };
  } else {
    result.errors = ['invalid or missing verdict'];
  }
  const at = new Date().toISOString();
  state.offices[key] = {
    at, hash: meta.hash, verdict: result.verdict, action: result.action,
    roles_resolved: verdict.roles_resolved || [], office_name: meta.office_name,
    errors: result.errors || [], confirmed: result.action === 'write_confirmed' || result.action === 'boosted' || result.action === 'boost_already_pending',
  };
  saveAdjudicationState(state);
  appendLine(ADJUDICATION_RESULTS, { locality_id: meta.locality_id, jurisdiction: meta.jurisdiction, state: meta.state, office_id: meta.office_id, office_name: meta.office_name, missing_roles: meta.missing_roles, verdict, result });
  stats.adjudicated = (stats.adjudicated || 0) + 1;
  if (result.action === 'write_confirmed') stats.adjudication_writes = (stats.adjudication_writes || 0) + 1;
  emit({ stage: 'ai_adjudicate_done', address: `${meta.jurisdiction}, ${meta.state}`, ok: !result.errors.length, detail: `${meta.office_name} → ${result.verdict}/${result.action}${result.errors?.length ? ` — ${result.errors[0]}` : ''}` });
  clearUnit(id);
  return result;
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
    // Consume finished adjudication answers before feeding/draining more
    // work. Otherwise a continuous audit wave can postpone guarded resolution
    // writes for many minutes even though the answers are already on disk.
    try {
      for (const f of readdirSync('.audit-work/audit-out').filter((x) => x.startsWith('adjudicate-') && x.endsWith('.json'))) {
        await processAdjudicationOutput(f.slice(0, -5));
      }
    } catch {}
    // ── promotion-judge lane: strict-pass candidates become judge units ──
    // (one office per unit, all candidate roles) — claimed ahead of audit
    // units by the runBatch judge-first sort. v1 units/outputs are dead:
    // verdict keys are prompt-versioned, so they are removed once and the
    // same evidence is regenerated under v2 instead of being consumed as v2.
    {
      if (!main.legacyJudgePurged) {
        let purged = 0;
        for (const dir of ['.audit-work/audit-queue', '.audit-work/audit-out']) {
          for (const f of readdirSync(dir).filter((x) => x.startsWith('judge-') && x.endsWith('.json'))) {
            let version = null;
            try {
              const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
              version = j?.meta?.prompt_version || j?.__meta?.prompt_version || null;
            } catch {}
            if (version !== JUDGE_PROMPT_VERSION) {
              try { unlinkSync(`${dir}/${f}`); purged++; } catch {}
            }
          }
        }
        main.legacyJudgePurged = true;
        if (purged) emit({ stage: 'ai_judge_v1_invalidated', ok: true, detail: `${purged} stale judge unit/output file(s) removed — evidence will be re-judged under ${JUDGE_PROMPT_VERSION}` });
      }
      const cands = pendingCandidates();
      const verdicts = verdictMap();
      const byOffice = new Map();
      const candRows = [...cands.entries()].sort((a, b) => {
        const ra = a[1].retro === true ? 1 : 0, rb = b[1].retro === true ? 1 : 0;
        return rb - ra || String(b[1].at || '').localeCompare(String(a[1].at || ''));
      });
      for (const [k, c] of candRows) {
        if (verdicts.has(k)) continue;
        const g = byOffice.get(c.office_id) || { meta: { locality_id: c.locality_id, jurisdiction: c.jurisdiction, office_name: c.office_name, retro: false }, roles: [] };
        if (c.retro === true) g.meta.retro = true;
        g.roles.push(c); byOffice.set(c.office_id, g);
      }
      let judgeFed = 0;
      for (const [officeId, g] of byOffice) {
        const qid = judgeUnitId(officeId);
        if (existsSync(`.audit-work/audit-queue/${qid}.json`) || existsSync(`.audit-work/audit-out/${qid}.json`)) continue;
        enqueueUnit(judgeUnit(officeId, g.meta, g.roles));
        judgeFed++;
      }
      if (judgeFed) emit({ stage: 'ai_judge_fed', ok: true, detail: `${judgeFed} office(s) queued for ${JUDGE_PROMPT_VERSION} promotion judgment` });
    }
    let total = 0, done = 0;
    const limit = PILOT || localities.length;
    const batchSize = Number(process.env.DEVIN_LLM_BATCH) || 5;
    // Cap the audit backlog at three batches. Without this the feeder adds
    // another wave every loop while SWE is still thinking, starving the
    // lower-priority adjudication lane behind an ever-growing audit queue.
    let auditFiles = [];
    try { auditFiles = readdirSync('.audit-work/audit-queue').filter((x) => x.startsWith('audit-')); } catch {}
    let adjudFiles = [];
    try { adjudFiles = readdirSync('.audit-work/audit-queue').filter((x) => x.startsWith('adjudicate-')); } catch {}
    let auditPending = auditFiles.length;
    // The lane sort alone is not enough: audit coverage is effectively
    // infinite, so refilling it after every batch would starve the finite
    // adjudication pilot forever. Existing audit units still run first; while
    // adjudication work is waiting, simply do not replenish the audit lane.
    const auditFeedCap = adjudFiles.length ? 0 : batchSize * 3;
    for (const loc of localities) {
      if (total >= limit || auditPending >= auditFeedCap) break;
      const h = contentHash(loc);
      const stPath = `${STATE_DIR}/${loc.id}.json`;
      const st = readJSON(stPath, null);
      if (st?.hash === h) { done++; continue; }
      const pending = existsSync(`.audit-work/audit-queue/audit-${loc.id}.json`) || existsSync(`.audit-work/audit-out/audit-${loc.id}.json`);
      if (pending) continue;
      const unit = buildUnit(loc, profById.get(loc.jurisdiction_profile_id));
      enqueueUnit(unit);
      auditPending++;
      emit({ stage: 'ai_audit_unit_sent', address: `${loc.name}, ${loc.state}`, ok: true, detail: `queued ${(loc.offices || []).length} office(s) for SWE-2.1 review` });
      total++;
      stats.current = `${loc.name}, ${loc.state}`;
    }
    // Needs-review adjudication is deliberately fed before draining but sorted
    // behind judge/audit units inside devin-llm — lowest priority, one office
    // per unit, capped at the pilot/operator limit.
    const adjudicateFed = feedAdjudicationUnits(localities, profById, ctrl);
    if (adjudicateFed) emit({ stage: 'ai_adjudicate_fed', ok: true, detail: `${adjudicateFed} needs-review office adjudication unit(s) queued` });
    if (!total && queueDepth() === 0) {
      const r = await drainQueue({ maxBatches: 4, sleepMs: 4000 }).catch(() => null);
      heartbeat(WORKER, 'idle', 'coverage complete — waiting for record changes');
      saveStats(); await sleep(60000); if (ONCE) return; continue;
    }
    const res = await drainQueue({ maxBatches: 4, sleepMs: 4000 });
    stats.sent += res.produced || 0;
    // process outputs — judge verdicts first (they unblock promotions)
    try {
      for (const f of readdirSync('.audit-work/audit-out').filter((x) => x.startsWith('judge-') && x.endsWith('.json'))) {
        const id = f.slice(0, -5);
        const out = outputFor(id);
        const meta = out?.meta;
        if (meta?.prompt_version !== JUDGE_PROMPT_VERSION) {
          emit({ stage: 'ai_judge_stale_output', ok: false, detail: `${id} ignored — prompt ${meta?.prompt_version || 'v1/unknown'} is not ${JUDGE_PROMPT_VERSION}` });
          clearUnit(id);
          continue;
        }
        const results = Array.isArray(out?.output?.results) ? out.output.results : [];
        const written = [];
        for (const v of results) {
          const found = (meta?.roles || []).find((r) => r.role === v?.role) || {};
          const entry = { ...found, jurisdiction: meta?.jurisdiction, office_name: meta?.office_name };
          written.push(appendVerdict(meta?.office_id || id.replace(/^judge-/, ''), meta?.locality_id || null, meta?.office_name || null, v?.role, v, entry, meta?.retro === true));
        }
        stats.judged = (stats.judged || 0) + results.length;
        emit({ stage: 'ai_judge_answered', address: meta?.jurisdiction ? `${meta.jurisdiction.name}, ${meta.jurisdiction.state}` : id, ok: results.length > 0, detail: written.map((v) => `${v.role}:${v.verdict}${v.guard ? `/${v.guard}` : ''}`).join(' ') || 'no verdicts' });
        clearUnit(id);
      }
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
          // Actions processed above write-through to the mirror immediately,
          // but `loc` is the pre-batch snapshot. Hash the CURRENT mirror row —
          // hashing the stale snapshot is what made every rename look new again
          // on the next pass and re-fired the same action.
          const freshLoc = (getMirror('localities')?.rows || []).find((l) => l.id === loc.id) || loc;
          Object.assign(loc, freshLoc);
          writeFileSync(`${STATE_DIR}/${loc.id}.json`, JSON.stringify({ at: Date.now(), hash: contentHash(freshLoc) }));
          stats.audited++;
          stats.verified_audited += (meta.offices || []).filter((o) => o.status === 'staff_verified' && isStrictEraVerified(o)).length;
        }
        clearUnit(id);
        stats.current = null;
      }
      for (const f of readdirSync('.audit-work/audit-out').filter((x) => x.startsWith('adjudicate-') && x.endsWith('.json'))) {
        await processAdjudicationOutput(f.slice(0, -5));
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
