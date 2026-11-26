#!/usr/bin/env node
// Needs-a-person cleanup — soft-retire the data-quality junk clogging the
// verifier's needs-review list. Nothing is ever deleted:
//   · retired offices move into archived_offices[] on the same record
//   · paper-township localities tombstone with duplicate_of
//   · every touched record is logged (before+after) to a revert log
//   · every write goes through the outbox and is read back live
//
//   node scripts/permitting-needs-person-cleanup.mjs            # dry-run → plan JSON
//   node scripts/permitting-needs-person-cleanup.mjs --apply    # enqueue + readback
//   node scripts/permitting-needs-person-cleanup.mjs --revert   # replay log backwards
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { cleanOfficeName, isGenericOfficeName, isPlaceholderOffice } from './lib/office-name-clean.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const OFFICE_STATE = '.audit-work/verify-office-state.json';
const LEDGER = '.audit-work/verification-ledger.json';
const PLAN_FILE = '.audit-work/needs-person-cleanup-plan.json';
const LOG_FILE = '.audit-work/needs-person-cleanup-log.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

export const PAPER_RE = /[(][^)]*paper[^)]*no permitting authority/i;

// ── Class 1: paper townships ─────────────────────────────────────────────
// The record itself carries "(paper — no permitting authority)". Tombstone
// onto the county jurisdiction (preferred) or a same-named real locality.
function absorbTarget(l, locs) {
  const same = locs.filter((x) => x.id !== l.id && !x.duplicate_of && x.state === l.state);
  const county = String(l.county_name || '').replace(/\s+county$/i, '');
  if (county) {
    const cand = same.find((x) => x.jurisdiction_type === 'county' && String(x.name || '').toLowerCase().includes(county.toLowerCase()));
    if (cand) return cand;
  }
  const base = String(l.name || '').replace(/ *[(][^)]*[)]/g, '').trim().toLowerCase();
  return same.find((x) => String(x.name || '').toLowerCase() === base && x.id !== l.id) || null;
}

// ── Plan ─────────────────────────────────────────────────────────────────
// Offices only enter a class when they have a needs_verification record —
// the needs-a-person universe. Clean and verified offices are never touched.
export function buildPlan(locs, officeRecs) {
  const plan = { paper: [], renames: [], non_permit: [], merges: [], kept_placeholder: [], skipped_paper: [] };
  const byId = new Map((locs || []).map((l) => [l.id, l]));

  for (const l of locs || []) {
    if (l?.duplicate_of || !PAPER_RE.test(String(l?.name || ''))) continue;
    const target = absorbTarget(l, locs);
    if (target) plan.paper.push({ locality_id: l.id, name: l.name, state: l.state, target_id: target.id, target_name: `${target.name}, ${target.state}` });
    else plan.skipped_paper.push({ locality_id: l.id, name: l.name, why: 'no absorbing jurisdiction found' });
  }

  const recsByLoc = new Map();
  for (const [key, rec] of Object.entries(officeRecs || {})) {
    if (!rec || rec.status !== 'needs_verification') continue;
    if (!recsByLoc.has(rec.locality_id)) recsByLoc.set(rec.locality_id, []);
    recsByLoc.get(rec.locality_id).push({ key, rec });
  }
  for (const [locId, recs] of recsByLoc) {
    const loc = byId.get(locId);
    if (!loc || loc.duplicate_of) continue;
    const live = new Set((loc.offices || []).map((o) => `${locId}:${o.id || o.name}`));
    for (const { key, rec } of recs) {
      if (!live.has(key)) continue;
      const office = (loc.offices || []).find((o) => `${locId}:${o.id || o.name}` === key);
      if (!office) continue;
      // Class 3 — evidence already says it isn't a permitting office.
      if ((rec.reasons || []).includes('non_permit_body')) {
        plan.non_permit.push({ locality_id: locId, jurisdiction: `${loc.name}, ${loc.state}`, office_id: office.id, office: office.name, roles: office.authority_roles || [] });
        continue;
      }
      const c = cleanOfficeName(office.name);
      const placeholder = (c.stripped.length && c.generic) || isPlaceholderOffice(office.name, loc.name);
      if (placeholder) {
        // Class 4 — retire only when a real office covers EVERY role it holds,
        // and never retire a verified office.
        if (String(office.authority_verification_status) === 'staff_verified') {
          plan.kept_placeholder.push({ locality_id: locId, jurisdiction: `${loc.name}, ${loc.state}`, office: office.name, why: 'verified — never merged away' });
          continue;
        }
        const real = (loc.offices || []).filter((o) => o !== office && !isPlaceholderOffice(o.name, loc.name));
        const roles = office.authority_roles || [];
        const uncovered = roles.filter((r) => !real.some((o) => (o.authority_roles || []).includes(r)));
        if (roles.length && !uncovered.length) {
          const into = real.filter((o) => roles.some((r) => (o.authority_roles || []).includes(r))).map((o) => o.name);
          plan.merges.push({ locality_id: locId, jurisdiction: `${loc.name}, ${loc.state}`, office_id: office.id, office: office.name, roles, into });
        } else {
          plan.kept_placeholder.push({ locality_id: locId, jurisdiction: `${loc.name}, ${loc.state}`, office: office.name, roles, why: uncovered.length ? `sole target for ${uncovered.join(', ')}` : 'no roles recorded' });
        }
        continue;
      }
      // Class 2 — cleaned name is a real office name → rename, unless another
      // office already carries it (then it is effectively a duplicate).
      if (c.stripped.length && c.clean && !c.generic) {
        const clash = (loc.offices || []).some((o) => o !== office && String(o.name || '').toLowerCase() === c.clean.toLowerCase());
        if (!clash) plan.renames.push({ locality_id: locId, jurisdiction: `${loc.name}, ${loc.state}`, office_id: office.id, from: office.name, to: c.clean });
      }
    }
  }
  return plan;
}

// ── Apply ────────────────────────────────────────────────────────────────
// All edits for one locality collapse into a single update write.
export function planToUpdates(plan, locs) {
  const byId = new Map((locs || []).map((l) => [l.id, l]));
  const touched = new Map();
  const t = (id) => { if (!touched.has(id)) touched.set(id, { renames: new Map(), retire: new Map() }); return touched.get(id); };
  for (const p of plan.paper || []) { if (p.target_id) t(p.locality_id).paper = p; }
  for (const r of plan.renames || []) t(r.locality_id).renames.set(r.office_id || r.from, r);
  for (const r of plan.non_permit || []) t(r.locality_id).retire.set(r.office_id || r.office, { ...r, retired_reason: 'not a permitting office' });
  for (const r of plan.merges || []) t(r.locality_id).retire.set(r.office_id || r.office, { ...r, retired_reason: `duplicate — roles covered by ${r.into.join(', ')}` });
  const updates = [];
  for (const [locId, e] of touched) {
    const loc = byId.get(locId);
    if (!loc) continue;
    const offices = [], archived = [...(loc.archived_offices || [])];
    const officeKey = (o) => o.id || o.name;
    for (const o of loc.offices || []) {
      const k = officeKey(o);
      if (e.retire.has(k) || e.retire.has(o.id) || e.retire.has(o.name)) {
        const r = e.retire.get(k) || e.retire.get(o.id) || e.retire.get(o.name);
        archived.push({ ...o, retired_reason: r.retired_reason, retired_at: new Date().toISOString(), retired_by: 'needs-person-cleanup' });
        continue;
      }
      const rn = e.renames.get(k) || e.renames.get(o.id) || e.renames.get(o.name);
      offices.push(rn ? { ...o, name: rn.to } : o);
    }
    const data = { offices, archived_offices: archived };
    if (e.paper) {
      data.duplicate_of = e.paper.target_id;
      data.permit_required_summary = `No permitting authority — paper township only; permits are handled by ${e.paper.target_name}.`;
    }
    const verified = offices.filter((o) => o.authority_verification_status === 'staff_verified').length;
    const summary = [
      e.renames.size ? `renamed ${e.renames.size}` : null,
      e.retire.size ? `archived ${e.retire.size} non-permit/duplicate office(s)` : null,
      e.paper ? `tombstoned → ${e.paper.target_name}` : null,
    ].filter(Boolean).join('; ');
    data.office_change_log = [...(loc.office_change_log || []), { at: new Date().toISOString(), summary: `cleanup: ${summary}`, office_count: offices.length, verified_count: verified }].slice(-20);
    updates.push({ locality_id: locId, name: loc.name, state: loc.state, data, before: { offices: loc.offices, archived_offices: loc.archived_offices || [], duplicate_of: loc.duplicate_of || null, permit_required_summary: loc.permit_required_summary || null, office_change_log: loc.office_change_log || [] } });
  }
  return updates;
}

// ── Readback ─────────────────────────────────────────────────────────────
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
  if (!r.ok) return { error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}` };
  return j;
}
const readById = async (entity, id) => {
  const j = await call('staffDataRead', { entity, query: { id }, limit: 1 });
  return (j?.records || j?.items || j?.data || [])[0] || null;
};

async function main() {
  const applyMode = process.argv.includes('--apply');
  const revertMode = process.argv.includes('--revert');
  const locs = (getMirror('localities')?.rows || []);
  const officeRecs = readJSON(OFFICE_STATE, { offices: {} }).offices || {};
  const ledger = readJSON(LEDGER, {});

  if (revertMode) {
    const entries = (existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []).reverse();
    if (!entries.length) { console.log('revert: no log entries'); return; }
    let n = 0;
    for (const e of entries) {
      enqueue({ entity: 'PermitLocality', op: 'update', id: e.locality_id, data: { offices: e.before.offices, archived_offices: e.before.archived_offices, duplicate_of: e.before.duplicate_of, permit_required_summary: e.before.permit_required_summary, office_change_log: e.before.office_change_log }, mirror: 'localities', note: `cleanup revert — ${e.name}` });
      mirrorApply('localities', { id: e.locality_id, ...e.before });
      n++;
    }
    console.log(`revert: enqueued ${n} locality restore(s)`);
    return;
  }

  const plan = buildPlan(locs, officeRecs);
  const counts = {
    paper_township: plan.paper.length,
    skipped_paper: plan.skipped_paper.length,
    junk_name_rename: plan.renames.length,
    non_permit_retire: plan.non_permit.length,
    placeholder_merge: plan.merges.length,
    kept_placeholder_target: plan.kept_placeholder.length,
  };
  const ex = (a, n = 10) => a.slice(0, n);
  writeFileSync(PLAN_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    before: { needs_a_person: ledger.needs_review_total || 0, unverified_offices: ledger.offices?.needs_verification || 0 },
    counts,
    examples: {
      paper_township: ex(plan.paper), skipped_paper: ex(plan.skipped_paper),
      junk_name_rename: ex(plan.renames), non_permit_retire: ex(plan.non_permit),
      placeholder_merge: ex(plan.merges), kept_placeholder_target: ex(plan.kept_placeholder),
    },
  }, null, 1));
  console.log(`plan → ${PLAN_FILE}:`, JSON.stringify(counts));

  if (!applyMode) { console.log('dry-run — pass --apply to write through the outbox'); return; }

  const updates = planToUpdates(plan, locs);
  console.log(`apply: ${updates.length} localities touched`);
  for (const u of updates) {
    appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...u }) + '\n');
    enqueue({ entity: 'PermitLocality', op: 'update', id: u.locality_id, data: u.data, mirror: 'localities', note: `needs-person cleanup — ${u.name}` });
    mirrorApply('localities', { id: u.locality_id, ...u.data });
  }

  // Read-back — the write-flusher drains the outbox on its ~15s loop; poll
  // point reads (live, uncached) until every touched locality reflects.
  if (!updates.length) { console.log('apply: nothing to verify'); return; }
  if (!(await login())) { console.log('apply: writes enqueued; readback skipped (no login)'); return; }
  const okSet = new Set(), pending = new Map(updates.map((u) => [u.locality_id, u]));
  const deadline = Date.now() + 6 * 60e3;
  while (pending.size && Date.now() < deadline) {
    for (const [id, u] of [...pending]) {
      const row = await readById('PermitLocality', id).catch(() => null);
      if (!row) continue;
      const officesOk = JSON.stringify((row.offices || []).map((o) => o.id || o.name)) === JSON.stringify(u.data.offices.map((o) => o.id || o.name));
      const archOk = (row.archived_offices || []).length >= (u.data.archived_offices || []).length;
      const paperOk = !u.data.duplicate_of || String(row.duplicate_of) === String(u.data.duplicate_of);
      if (officesOk && archOk && paperOk) { okSet.add(id); pending.delete(id); }
    }
    if (pending.size) await sleep(20000);
  }
  console.log(`readback: ${okSet.size}/${updates.length} localities verified live${pending.size ? ` — still pending: ${[...pending.values()].map((u) => u.name).join(', ')}` : ''}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
