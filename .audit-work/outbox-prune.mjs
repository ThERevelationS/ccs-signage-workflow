#!/usr/bin/env node
// One-time outbox repair before replaying the 34h backlog (fleet down since 2026-11-07 10:48).
// - SourceCollectionQueue updates: drop if the row is gone remotely or was updated AFTER the write was queued.
// - PermitLocality updates: drop if remote updated after the write was queued.
// - PermitLookupIndex creates: one per address_key (latest wins); drop keys that already exist remotely.
// - Reset attempts/last_error for records that failed only because of gateway bugs (403 allowlist, items-vs-records parse).
// Run ONLY while the write flusher is stopped. Backs up outbox + inflight first.
// Usage: node .audit-work/outbox-prune.mjs [--apply]   (dry-run by default)
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { permitCreds } from '../scripts/lib/permit-creds.mjs';

const APPLY = process.argv.includes('--apply');
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const OUTBOX = '.audit-work/outbox.jsonl', INFLIGHT = '.audit-work/outbox-inflight.jsonl';
const ts = (s) => (s ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : 0);
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json());
if (!login?.token) throw new Error('login failed');
const read = async (entity, skip = 0) => {
  const r = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: login.token, entity, limit: 5000, skip }) });
  const j = await r.json();
  if (!Array.isArray(j?.items)) throw new Error(`${entity} read failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.items;
};
const readAll = async (entity) => { const out = []; for (let skip = 0; ; skip += 5000) { const page = await read(entity, skip); out.push(...page); if (page.length < 5000) return out; } };

const [queue, localities, lookups] = await Promise.all([readAll('SourceCollectionQueue'), readAll('PermitLocality'), readAll('PermitLookupIndex')]);
const Q = new Map(queue.map((r) => [r.id, r])), L = new Map(localities.map((r) => [r.id, r]));
const existingKeys = new Set(lookups.map((r) => String(r.address_key || '')).filter(Boolean));
console.log(`live: queue ${queue.length} · localities ${localities.length} · lookup index ${lookups.length}`);

const recs = [...readJsonl(INFLIGHT), ...readJsonl(OUTBOX)];
const stats = {}; const bump = (k) => (stats[k] = (stats[k] || 0) + 1);
const latestLookup = new Map();
for (const r of recs) if (r.entity === 'PermitLookupIndex' && r.op === 'create') {
  const k = String(r.data?.address_key || '');
  if (!latestLookup.has(k) || latestLookup.get(k).at < r.at) latestLookup.set(k, r);
}
const n = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const scqKey = (d) => [n(d?.jurisdiction_name), n(d?.state), n(d?.parent_county_name).replace(/ county$/, ''), n(d?.jurisdiction_type), n(d?.source_category)].join('|');
const liveScq = new Set(queue.map(scqKey));
const kept = [];
for (const r of recs) {
  if (r.entity === 'SourceCollectionQueue' && r.op === 'create') {
    const k = scqKey(r.data);
    if (liveScq.has(k)) { bump('drop SCQ create — identical live row'); continue; }
    liveScq.add(k);
  }
  if (r.entity === 'SourceCollectionQueue' && r.op === 'update' && r.id) {
    const cur = Q.get(r.id);
    if (!cur) { bump('drop SCQ update — row gone'); continue; }
    if (ts(cur.updated_date) > r.at) { bump('drop SCQ update — remote newer'); continue; }
  }
  if (r.entity === 'PermitLocality' && r.op === 'update' && r.id) {
    const cur = L.get(r.id);
    if (!cur) { bump('drop locality update — row gone'); continue; }
    if (ts(cur.updated_date) > r.at) { bump('drop locality update — remote newer'); continue; }
  }
  if (r.entity === 'PermitLookupIndex' && r.op === 'create') {
    const k = String(r.data?.address_key || '');
    if (!k) { bump('drop lookup — no address_key'); continue; }
    if (existingKeys.has(k)) { bump('drop lookup — already indexed'); continue; }
    if (latestLookup.get(k) !== r) { bump('drop lookup — superseded duplicate'); continue; }
  }
  if (/cannot be written here|row not found for CAS close/.test(String(r.last_error || ''))) { r.attempts = 0; delete r.last_error; bump('reset attempts (gateway bug)'); }
  kept.push(r); bump(`keep ${r.entity}.${r.op}`);
}
console.log(stats);
console.log(`records ${recs.length} → ${kept.length}`);
if (!APPLY) { console.log('dry run — pass --apply to rewrite the outbox'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(OUTBOX, `${OUTBOX}.bak-${stamp}`);
if (existsSync(INFLIGHT)) copyFileSync(INFLIGHT, `${INFLIGHT}.bak-${stamp}`);
writeFileSync(OUTBOX, kept.map((r) => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : ''));
writeFileSync(INFLIGHT, '');
console.log(`applied — backups at *.bak-${stamp}`);
