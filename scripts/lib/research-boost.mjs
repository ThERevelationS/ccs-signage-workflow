// The audit boost lane — localities the ai-auditor routed to researchers.
// They go to the FRONT of target selection, ahead of every tier/gap target;
// the 2h tier cooldown does not apply, claim locks and host pacing still do.
// A boost clears once a researcher has worked it — one boost per finding.
import { readFileSync, writeFileSync, openSync, existsSync } from 'node:fs';

export const BOOST_FILE = '.audit-work/research-boost.jsonl';
export const DONE_FILE = '.audit-work/research-boost-done.jsonl';

const readJsonl = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const append = (f, o) => { try { writeFileSync(openSync(f, 'a'), JSON.stringify(o) + '\n', { flag: 'a' }); } catch {} };

// Lane classes in priority order — the audit tab's ordering contract:
// demoted verified offices → wrong_jurisdiction/county → contact/duplicate.
export const BOOST_CLASS = { demote: 0, jurisdiction: 1, contact: 2 };
export function boostClassFor(type) {
  if (type === 'demote') return 'demote';
  if (type === 'wrong_jurisdiction' || type === 'wrong_county_or_type') return 'jurisdiction';
  return 'contact'; // contact_mismatch, duplicate_office, anything else routed
}

export function addBoost(rec) {
  const bid = `b${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  append(BOOST_FILE, { bid, cls: boostClassFor(rec.finding?.type || rec.type || 'contact'), at: new Date().toISOString(), ...rec });
  return bid;
}

export function pendingBoosts(doneFile = DONE_FILE) {
  const done = new Set(readJsonl(doneFile).map((r) => r.bid));
  return readJsonl(BOOST_FILE).filter((b) => b.bid && !done.has(b.bid));
}

export function markBoostDone(bid) {
  append(DONE_FILE, { bid, at: new Date().toISOString() });
}

// Ordered target objects for the researcher's claim loop. Boosted targets
// carry their finding so the crawl can aim at it; tier starts at whatever
// the locality hasn't tried (the boost only skips the COOLDOWN, not tiers).
export function boostTargets(boosts, locById, nextTierFor) {
  const byLoc = new Map();
  for (const b of boosts) {
    const loc = locById.get(b.locality_id);
    if (!loc || loc.duplicate_of) continue;
    const prev = byLoc.get(b.locality_id);
    if (!prev || BOOST_CLASS[b.cls] < BOOST_CLASS[prev.cls]) byLoc.set(b.locality_id, { b, loc });
  }
  return [...byLoc.values()].sort((a, z) => BOOST_CLASS[a.b.cls] - BOOST_CLASS[z.b.cls]).map(({ b, loc }) => ({
    boost: b.bid, boostCls: b.cls, locality_id: loc.id, loc,
    offices: (loc.offices || []).filter((o) => o.authority_verification_status !== 'staff_verified').map((o) => o.id || o.name),
    reasons: [b.finding?.type || 'audit_finding'], missing_roles: [],
    finding: b.finding || null,
    tier: typeof nextTierFor === 'function' ? nextTierFor(loc.id) || 1 : 1,
  }));
}
