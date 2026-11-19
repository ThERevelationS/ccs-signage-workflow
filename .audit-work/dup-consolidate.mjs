#!/usr/bin/env node
// Locality dedupe — tombstone loser rows in each identical-identity group.
// Policy (approved): winner = most offices → most verified → richest fields →
// oldest created. Losers get duplicate_of: <winner_id> — soft delete, all data
// preserved on the row; pickers/bridge already exclude duplicate_of rows.
// No office merge: 0 of the loser-unique offices are verified (research junk).
// Profiles untouched — 71 groups link to duplicate profiles, separate decision.
// Usage: node .audit-work/dup-consolidate.mjs [--apply]   (dry-run by default)
import { readFileSync, writeFileSync } from 'node:fs';
import { enqueue } from '../scripts/lib/outbox.mjs';
import { mirrorApply } from '../scripts/lib/entity-mirror.mjs';

const APPLY = process.argv.includes('--apply');
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows;
const L = new Map(locs.map((l) => [l.id, l]));
const plan = JSON.parse(readFileSync('.audit-work/dup-consolidation-plan.json', 'utf8')).plan;

const s = (v) => String(v ?? '').trim();
const updates = [], skips = [];
for (const p of plan) {
  const w = L.get(p.winner);
  if (!w || s(w.duplicate_of)) { skips.push({ key: p.key, why: 'winner missing or itself tombstoned' }); continue; }
  for (const lid of p.losers) {
    const l = L.get(lid);
    if (!l) { skips.push({ key: p.key, id: lid, why: 'loser row missing from mirror' }); continue; }
    if (s(l.duplicate_of)) { skips.push({ key: p.key, id: lid, why: `already tombstoned → ${l.duplicate_of}` }); continue; }
    updates.push({ key: p.key, id: lid, name: l.name, state: l.state, winner: p.winner });
  }
}
console.log(`groups ${plan.length} · loser updates ${updates.length} · skips ${skips.length}`);
if (skips.length) console.log('skips:', JSON.stringify(skips.slice(0, 10), null, 1));
console.log('sample:', updates.slice(0, 5).map((u) => `${u.name} ${u.state} [${u.id.slice(-6)}] → ${u.winner.slice(-6)}`).join('\n  '));
writeFileSync('.audit-work/dup-consolidate-report.json', JSON.stringify({ at: new Date().toISOString(), updates, skips }, null, 1));
if (!APPLY) { console.log('dry run — pass --apply to enqueue'); process.exit(0); }
for (const u of updates) {
  enqueue({ entity: 'PermitLocality', op: 'update', id: u.id, data: { duplicate_of: u.winner }, mirror: 'localities', note: `dedupe tombstone — ${u.name}, ${u.state} → ${u.winner.slice(-6)}` });
  mirrorApply('localities', { id: u.id, duplicate_of: u.winner });
}
console.log(`enqueued ${updates.length} PermitLocality tombstones`);
