// MP-11.1 — office-change detector. Fingerprints every PermitLocality's
// offices[] (name, roles, contact fields, verification) each pass; when a
// locality's fingerprint changes vs the stored snapshot, emit `office_change`
// and append a compact entry to the locality's `office_change_log` (cap 20)
// so the app can alert staff who attached offices before the change.
// Runs on the localities mirror — zero remote reads per pass.
import { readFileSync, writeFileSync, openSync, writeFileSync as writeSync } from 'fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { sleep } from './lib/office-research.mjs';
import { createHash } from 'crypto';

const EVENTS = '.live-events.jsonl';
const FP_FILE = '.audit-work/office-fingerprints.json';
const LOG_CAP = 20;
const CYCLE_MS = Number(process.env.OFFICE_DIFF_CYCLE_MS || 5 * 60 * 1000);
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeSync(evFd, JSON.stringify({ t: Date.now(), worker: 'office-diff', ...e }) + '\n', { flag: 'a' }); } catch {} };

let fingerprints = {};
try { fingerprints = JSON.parse(readFileSync(FP_FILE, 'utf8')); } catch {}
const saveFp = () => { try { writeFileSync(FP_FILE, JSON.stringify(fingerprints)); } catch {} };

const OFFICE_KEYS = ['name', 'roles', 'applicable_roles', 'phone', 'email', 'address', 'website', 'permit_url', 'application_form_url', 'fee_schedule_text', 'submission_methods', 'review_time', 'required_documents', 'inspection_contact', 'permit_expiry_text', 'verification_status', 'corroboration_tier'];
function fingerprint(loc) {
  const h = createHash('sha1');
  for (const o of loc.offices || []) {
    for (const k of OFFICE_KEYS) h.update(String(o[k] == null ? '' : typeof o[k] === 'object' ? JSON.stringify(o[k]) : o[k]));
    h.update('|');
  }
  return h.digest('hex');
}

// Compact human-readable diff summary for the change log.
function describeChange(prev, loc) {
  const offices = loc.offices || [];
  const parts = [];
  if (prev && prev.count != null && prev.count !== offices.length) parts.push(`offices ${prev.count}→${offices.length}`);
  const verified = offices.filter((o) => o.verification_status === 'staff_verified').length;
  if (prev && prev.verified != null && prev.verified !== verified) parts.push(`verified ${prev.verified}→${verified}`);
  const names = offices.map((o) => o.name).filter(Boolean);
  if (!parts.length) parts.push(`office data updated (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''})`);
  return parts.join('; ');
}

// MP-11.4 — observed-outcomes aggregation. Roll up the recent PermitLineItem
// mirror per locality: real elapsed days (submitted → approval/received) and
// real fees paid, stamped on the locality so claimed office data can be
// compared against what actually happened.
const dayMs = 86400000;
function observedPass() {
  const lines = getMirror('permit-lines')?.rows || [];
  if (!lines.length) return 0;
  const byLoc = new Map();
  for (const l of lines) {
    const locId = String(l.locality_id || '').trim();
    if (!locId) continue;
    const submitted = new Date(l.submitted_date || l.applied_date || 0).getTime();
    const decided = new Date(l.approval_date || l.permit_received_date || l.denial_date || 0).getTime();
    const days = submitted && decided && decided >= submitted ? Math.round((decided - submitted) / dayMs) : null;
    const fee = Number(l.jurisdiction_fee_amount);
    const denied = !!l.denial_date;
    if (days == null && !Number.isFinite(fee) && !denied) continue;
    const agg = byLoc.get(locId) || { days: [], fees: [], denied: 0, count: 0 };
    agg.count++;
    if (days != null) agg.days.push(days);
    if (Number.isFinite(fee) && fee >= 0) agg.fees.push(fee);
    if (denied) agg.denied++;
    byLoc.set(locId, agg);
  }
  const locs = getMirror('localities')?.rows || [];
  const byId = new Map(locs.map((l) => [String(l.id), l]));
  let stamped = 0;
  for (const [locId, agg] of byLoc) {
    const loc = byId.get(locId);
    if (!loc) continue;
    const avg = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null);
    const observed = {
      permits_observed: agg.count,
      avg_decision_days: avg(agg.days),
      fee_min: agg.fees.length ? Math.min(...agg.fees) : null,
      fee_max: agg.fees.length ? Math.max(...agg.fees) : null,
      fee_avg: avg(agg.fees),
      denial_count: agg.denied,
      computed_at: new Date().toISOString(),
      sample_window: 'last ~1000 lines',
    };
    const prev = loc.observed_outcomes;
    if (prev && JSON.stringify({ ...prev, computed_at: null }) === JSON.stringify({ ...observed, computed_at: null })) continue;
    enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { observed_outcomes: observed }, mirror: 'localities', note: `observed outcomes — ${loc.name || loc.id}` });
    mirrorApply('localities', { id: loc.id, observed_outcomes: observed });
    stamped++;
  }
  if (stamped) emit({ stage: 'observed_outcomes', ok: true, detail: `${stamped} localities stamped with observed permit outcomes` });
  return stamped;
}

async function pass() {
  const stamped = observedPass();
  const locs = getMirror('localities')?.rows || [];
  let changed = 0;
  for (const loc of locs) {
    if (!loc?.id) continue;
    const offices = loc.offices || [];
    if (!offices.length) continue;
    const fp = fingerprint(loc);
    const prev = fingerprints[loc.id];
    if (prev && prev.fp !== fp) {
      const entry = {
        at: new Date().toISOString(),
        summary: describeChange(prev, loc),
        office_count: offices.length,
        verified_count: offices.filter((o) => o.verification_status === 'staff_verified').length,
      };
      const log = [...(Array.isArray(loc.office_change_log) ? loc.office_change_log : []), entry].slice(-LOG_CAP);
      enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { office_change_log: log }, mirror: 'localities', note: `office change — ${loc.name || loc.id}` });
      mirrorApply('localities', { id: loc.id, office_change_log: log });
      emit({ stage: 'office_change', address: `${loc.name}, ${loc.state}`, ok: true, detail: entry.summary.slice(0, 140) });
      changed++;
    }
    fingerprints[loc.id] = { fp, count: offices.length, verified: offices.filter((o) => o.verification_status === 'staff_verified').length };
  }
  saveFp();
  emit({ stage: 'office_diff_pass', ok: true, detail: `${locs.length} localities scanned, ${changed} office change(s)` });
}

async function main() {
  emit({ stage: 'office_diff_boot', ok: true, start: true, detail: 'office-change detector online' });
  for (;;) {
    try { await pass(); } catch (e) { emit({ stage: 'office_diff_error', ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    await sleep(CYCLE_MS);
  }
}

if (process.argv[1] && /permitting-office-diff/.test(process.argv[1])) main();
