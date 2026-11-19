#!/usr/bin/env node
// Mirror sync daemon — the ONLY process that pages full entity tables against
// the app. Runs on a timer, writes local snapshots every worker consumes.
// This is the fix for fleet read traffic locking the app up: 4 table pulls
// per cycle total, instead of ~12+ full scans across all workers per pass.
//
// Usage: node scripts/permitting-mirror-sync.mjs [--once] [--sync-ms 600000]
// Emits mirror_synced / mirror_error to .live-events.jsonl.
import { appendFileSync } from 'node:fs';
import { putMirrorSnapshot, getMirror } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ONCE = args.includes('--once');
const SYNC_MS = Number(flag('--sync-ms', 10 * 60 * 1000));
const EVENTS = '.live-events.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (e) => { try { appendFileSync(EVENTS, JSON.stringify({ t: new Date().toISOString(), worker: 'mirror-sync', ...e }) + '\n'); } catch {} };

// Each source gets its own freshness TTL — queue rows churn fastest,
// profiles slowest. A source is only re-pulled when its mirror is older.
const SOURCES = [
  { name: 'queue', entity: 'SourceCollectionQueue', query: {}, ttl: 5 * 60 * 1000 },
  { name: 'localities', entity: 'PermitLocality', query: {}, ttl: 10 * 60 * 1000 },
  // OH profiles carry fat office_research payloads — a 5000-row page exceeds the
  // function's response cap (HTTP 500 worker exception). Page at 1000.
  { name: 'profiles-oh', entity: 'JurisdictionProfile', query: { state: 'OH' }, ttl: 20 * 60 * 1000, page: 1000 },
  { name: 'profiles-ky', entity: 'JurisdictionProfile', query: { state: 'KY' }, ttl: 20 * 60 * 1000 },
  // MP-11.4 — recent permit outcomes only (bounded, newest first) so the
  // observed-vs-claimed aggregation reads sparse, not a full table pull.
  { name: 'permit-lines', entity: 'PermitLineItem', query: {}, sort: '-updated_date', ttl: 15 * 60 * 1000, max: 1000 },
  { name: 'rules', entity: 'PermitResolutionRule', query: { active: true }, ttl: 5 * 60 * 1000 },
];

let token = '';
async function login() {
  for (let i = 0; i < 8; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return true; }
    await sleep(4000 + i * 3000);
  }
  return false;
}
async function call(fn, body) {
  for (let i = 0; i < 6; i++) {
    await paceCall(fn);
    const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }), signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r?.status === 401) { await login(); continue; }
    if (r && (r.status === 429 || r.status >= 500)) { await sleep(5000 + i * 5000); continue; }
    return r ? await r.json().catch(() => null) : null;
  }
  return null;
}
async function readAll(entity, query, label, sort, max, page = 5000) {
  const out = [];
  for (let skip = 0; ; skip += page) {
    const j = await call('staffDataRead', { entity, query, sort, limit: page, skip });
    if (!j) { emit({ stage: 'mirror_error', address: 'mirror sync', ok: false, detail: `${label}: read stalled — keeping previous snapshot` }); return null; }
    const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data?.items) ? j.data.items : []);
    out.push(...items);
    emit({ stage: 'mirror_page', address: 'mirror sync', ok: true, detail: `${label}: ${out.length} rows${items.length === page ? '…' : ' (done)'}` });
    if (items.length < page || (max && out.length >= max)) return max ? out.slice(0, max) : out;
    await sleep(1200); // pace pages — this daemon is the app's only big reader
  }
}

let pass = 0;
emit({ stage: 'mirror_boot', address: 'mirror sync', ok: true, detail: `mirror-sync live — ${SOURCES.length} sources · cycle ${SYNC_MS / 1000}s` });
while (true) {
  pass++;
  if (!token && !(await login())) { emit({ stage: 'mirror_error', address: 'mirror sync', ok: false, detail: 'login failed — retrying' }); await sleep(SYNC_MS); continue; }
  for (const s of SOURCES) {
    const cur = getMirror(s.name);
    if (cur && Date.now() - cur.at < s.ttl) continue; // still fresh — skip the pull entirely
    const rows = await readAll(s.entity, s.query, s.name, s.sort, s.max, s.page);
    if (rows === null) continue;
    // Snapshot write preserves local-pending rows: a sync pulled between a
    // worker's mirrorApply and its outbox flush would otherwise roll the
    // mirror back to older remote state (apply-ready oscillated this way).
    putMirrorSnapshot(s.name, rows);
    emit({ stage: 'mirror_synced', address: 'mirror sync', ok: true, detail: `${s.name}: ${rows.length} rows` });
    await sleep(2000); // breathe between sources
  }
  emit({ stage: 'mirror_cycle', address: 'mirror sync', ok: true, detail: `pass ${pass} complete` });
  if (ONCE) break;
  await sleep(SYNC_MS);
}
