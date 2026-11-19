#!/usr/bin/env node
// MP-7.8 — Metrics worker. Every 15min, snapshot the pipeline scorecard into
// .audit-work/metrics-history.jsonl — apply-ready rate, verification counts,
// parked/apply conversions, queue health, demand leaders. The dashboard reads
// trends off this instead of re-computing from the event log.
//
//   node scripts/permitting-metrics.mjs [--once]
import { openSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { getMirror } from './lib/entity-mirror.mjs';

const EVENTS = '.live-events.jsonl';
const HIST = '.audit-work/metrics-history.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'metrics', ...e }) + '\n', { flag: 'a' }); } catch {} };

function snapshot() {
  const locs = getMirror('localities')?.rows || [];
  const queue = getMirror('queue')?.rows || [];
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  const offices = locs.flatMap((l) => l.offices || []);
  const verified = offices.filter((o) => o?.authority_verification_status === 'staff_verified');
  const corroborated = offices.filter((o) => o?.corroboration_tier === 'verified');
  const contactable = offices.filter((o) => o?.contact_phone || o?.contact_email);
  const qBy = (s) => queue.filter((r) => r.status === s).length;
  const roles = profiles.flatMap((p) => (p.office_research?.roles || []).filter((r) => /potentially_applicable|applicable|confirmed/i.test(String(r?.applicability))));
  // Address outcomes: latest stage per address from events tail (bounded).
  const stage = {};
  try {
    for (const l of readFileSync(EVENTS, 'utf8').trim().split('\n').slice(-40000)) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (!e.address || !e.stage || e.start || e.step || !/resolved|located|geocode|parcel|unresolved|needs_review/.test(e.stage)) continue;
      stage[e.address] = e.stage;
    }
  } catch {}
  const out = {};
  for (const s of Object.values(stage)) out[s] = (out[s] || 0) + 1;
  const snap = {
    at: new Date().toISOString(), t: Date.now(),
    localities: locs.length, offices: offices.length,
    offices_verified: verified.length, offices_corroborated: corroborated.length,
    offices_contactable: contactable.length,
    queue: { not_started: qBy('not_started'), sources_found: qBy('sources_found'), blocked: qBy('blocked'), in_flight: qBy('research_in_flight'), partial: qBy('partial_gaps') },
    evidence_roles: roles.length,
    // MP-12.3 — lookup SLA: % of addresses landing on the self-contained
    // terminal stages (resolved_apply = offices attached, answers in one
    // index read) vs stages that still need resolution work.
    lookup_sla: (() => {
      const total = Object.values(out).reduce((s, n) => s + n, 0);
      if (!total) return null;
      const selfContained = (out.resolved_apply || 0) + (out.resolved_no_permit_required || 0);
      return { addresses: total, self_contained: selfContained, pct: +(100 * selfContained / total).toFixed(1) };
    })(),
    demand_top: Object.entries(
      queue.filter((r) => (r.demand_weight || 0) > 0).reduce((m, r) => { m[r.jurisdiction_name] = r.demand_weight; return m; }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, w]) => `${n}:${w}`),
    addresses: out,
  };
  writeFileSync(HIST, JSON.stringify(snap) + '\n', { flag: 'a' });
  emit({ stage: 'metrics_snapshot', ok: true, detail: `loc ${locs.length} · off ${offices.length} · verified ${verified.length} · corroborated ${corroborated.length} · apply ${out.resolved_apply || 0} · parked ${(out.resolved_needs_office_check || 0) + (out.located_no_locality || 0)}` });
  return snap;
}

const ONCE = process.argv.includes('--once');
(async () => {
  do { snapshot(); if (ONCE) break; await new Promise((r) => setTimeout(r, 15 * 60000)); } while (true);
})().catch((e) => { emit({ stage: 'metrics_error', ok: false, detail: String(e?.message || e).slice(0, 140) }); process.exit(1); });
