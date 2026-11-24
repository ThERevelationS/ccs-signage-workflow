#!/usr/bin/env node
// Write flusher — the ONLY process allowed to stream worker writes at the app.
// Drains .audit-work/outbox.jsonl FIFO via staffEntityBulkWrite — up to 100
// writes inside ONE invoke — so the fleet's writes share a controlled slice
// of the entity budget without HTTP bursts (the per-record flood is what
// locked the site).
//
// Durability: a taken batch moves to outbox-inflight.jsonl BEFORE flushing.
// Any crash mid-batch leaves the records on disk; the next boot requeues the
// whole batch (replays are safe — creates dedupe, updates are idempotent).
// Per-record failures retry up to 8 attempts then journal to outbox-errors —
// nothing is ever silently lost.
//
// Tuning: --rate 300 (records/min) · --batch 100 · --once for a single drain.
import { openSync, writeFileSync, readFileSync, existsSync, appendFileSync, mkdirSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { enqueue, takeBatch, outboxDepth, journal, requeueTail, compactOutbox, OUTBOX, OUTBOX_DONE, OUTBOX_ERR } from './lib/outbox.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const RATE = Math.max(1, Number(flag('--rate', 300)));        // records per minute
const BATCH = Math.min(200, Math.max(1, Number(flag('--batch', 100))));
const SPACING = Math.max(1000, Math.ceil(BATCH * 60000 / RATE)); // ms between invokes
const ONCE = args.includes('--once');
const EVENTS = '.live-events.jsonl';
const INFLIGHT = '.audit-work/outbox-inflight.jsonl';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'flusher', ...e }) + '\n', { flag: 'a' }); } catch {} };

let token = null;
async function login() {
  for (let i = 0; i < 8; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return true; }
    await sleep(4000 + i * 3000);
  }
  return false;
}
async function call(fn, body, retried = false, netRetry = 0) {
  let r;
  await paceCall(fn);
  // 60s hard timeout — a hung TCP connection previously stalled the flusher
  // silently for 20+ min while the outbox kept growing behind it.
  try { r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }), signal: AbortSignal.timeout(60000) }); }
  catch (e) { if (netRetry < 5) { await sleep(3000 * (netRetry + 1)); return call(fn, body, retried, netRetry + 1); } return { error: String(e?.message || e) }; }
  if ((r.status === 401 || r.status === 403) && !retried) { await login(); return call(fn, body, true, netRetry); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(6000); return call(fn, body, retried, netRetry); }
  if (r.status === 404) return { error: 'function_not_found', status: 404 };
  if (!r.ok) return { error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}` };
  return j;
}

// ── In-flight ledger — taken batches live on disk until fully journaled ──
function requeueInflight() {
  if (!existsSync(INFLIGHT)) return;
  const pending = readFileSync(INFLIGHT, 'utf8').trim().split('\n').filter(Boolean);
  if (!pending.length) { writeFileSync(INFLIGHT, ''); return; }
  // Locked tail-appends — a prepend would clobber enqueues that landed
  // between the read and the rewrite.
  for (const l of pending) { try { requeueTail(JSON.parse(l)); } catch {} }
  writeFileSync(INFLIGHT, '');
  emit({ stage: 'outbox_recovered', ok: true, detail: `requeued ${pending.length} in-flight write(s) from a crashed batch` });
}
const markInflight = (batch) => { try { writeFileSync(INFLIGHT, batch.map((r) => JSON.stringify(r)).join('\n') + '\n'); } catch {} };
const clearInflight = () => { try { writeFileSync(INFLIGHT, ''); } catch {} };

const MAX_ATTEMPTS = 8;
function requeueOrDrop(rec, err) {
  rec.attempts = (rec.attempts || 0) + 1;
  rec.last_error = String(err).slice(0, 200);
  if (rec.attempts >= MAX_ATTEMPTS) {
    journal(OUTBOX_ERR, rec);
    emit({ stage: 'outbox_error', jurisdiction: rec.note || rec.entity, detail: `${rec.entity}.${rec.op} dropped after ${MAX_ATTEMPTS} tries: ${String(err).slice(0, 120)}`, ok: false });
  } else {
    requeueTail(rec); // locked tail — transient failures don't block FIFO
  }
}

// Fallback for queue-status updates when only the single-record gateway is
// reachable: staffEntityWrite allows only CAS updateMany on this entity —
// point-read updated_date, then update CAS-anchored.
async function flushSingle(rec) {
  let body = { entity: rec.entity, op: rec.op };
  if (rec.id) body.id = rec.id;
  if (rec.query) body.query = rec.query;
  if (rec.update) body.update = rec.update;
  if (rec.data) body.data = rec.data;
  if (rec.entity === 'SourceCollectionQueue' && rec.op === 'update' && rec.id) {
    const row = await call('staffDataRead', { entity: 'SourceCollectionQueue', query: { id: rec.id }, limit: 1 });
    const cur = row?.items?.[0] || row?.records?.[0] || row?.record || (Array.isArray(row) ? row[0] : null);
    if (!cur?.updated_date) return { error: 'queue row not found for CAS close' };
    body = { entity: rec.entity, op: 'updateMany', query: { id: rec.id, updated_date: cur.updated_date }, update: { $set: rec.data || {} } };
  }
  return call('staffEntityWrite', body);
}

let bulkAvailable = null; // null = untested; cached after first invoke
async function flushBatch(batch) {
  if (bulkAvailable !== false) {
    const res = await call('staffEntityBulkWrite', { writes: batch.map((r) => ({ entity: r.entity, op: r.op, ...(r.id ? { id: r.id } : {}), ...(r.query ? { query: r.query } : {}), ...(r.update ? { update: r.update } : {}), ...(r.data ? { data: r.data } : {}) })) });
    if (res?.error === 'function_not_found') { bulkAvailable = false; emit({ stage: 'outbox_error', ok: false, detail: 'staffEntityBulkWrite not on this runtime — per-record fallback' }); }
    else if (!res?.error && Array.isArray(res?.results)) {
      bulkAvailable = true;
      const covered = new Set();
      for (const r of res.results) {
        const rec = batch[r.i];
        if (!rec) continue;
        covered.add(r.i);
        if (r.ok) { journal(OUTBOX_DONE, { ...rec, remote_id: r.id || rec.id || null }); emit({ stage: 'outbox_flushed', jurisdiction: rec.note || rec.entity, detail: `${rec.entity}.${rec.op}${rec.note ? ` — ${rec.note}` : ''}`, ok: true }); }
        else requeueOrDrop(rec, r.error || 'bulk record failed');
      }
      // Gap guard: a record missing from results[] must not vanish unjournaled.
      batch.forEach((rec, i) => { if (!covered.has(i)) requeueOrDrop(rec, 'no result returned for record'); });
      return true;
    }
    else { return false; } // transient invoke failure — caller retries/requeues
  }
  // Per-record fallback — slower but keeps the pipeline alive pre-deploy.
  for (const rec of batch) {
    const res = await flushSingle(rec);
    if (res?.error) requeueOrDrop(rec, res.error);
    else { journal(OUTBOX_DONE, { ...rec, remote_id: res?.record?.id || res?.id || rec.id || null }); emit({ stage: 'outbox_flushed', jurisdiction: rec.note || rec.entity, detail: `${rec.entity}.${rec.op}${rec.note ? ` — ${rec.note}` : ''}`, ok: true }); }
    await sleep(Math.ceil(60000 / 35)); // legacy path stays at the gentle 35/min pace
  }
  return true;
}

// Single-instance guard — two flushers taking batches from the same file
// would split the queue and corrupt write order. PID + heartbeat lock: the
// holder touches hb each batch, so a killed flusher (or a Windows-reused PID
// that makes kill(pid,0) lie) is detected by heartbeat staleness, not just
// PID liveness. Never exits on contention — a waiting standby is itself a
// supervisor: if the live flusher dies, the standby takes the lock and drains.
const INSTANCE_LOCK = '.audit-work/flusher-instance';
const HB = `${INSTANCE_LOCK}/hb`;
{
  for (let waited = 0; ; waited++) {
    try { mkdirSync(INSTANCE_LOCK); writeFileSync(`${INSTANCE_LOCK}/pid`, String(process.pid)); writeFileSync(HB, String(Date.now())); break; }
    catch {
      let steal = false;
      try {
        const pid = Number(readFileSync(`${INSTANCE_LOCK}/pid`, 'utf8'));
        const hbAge = Date.now() - Number(readFileSync(HB, 'utf8') || 0);
        const alive = pid && pid !== process.pid && (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
        if (!alive || hbAge > 90000) steal = true;
      } catch { steal = true; }
      // rmSync recursive — the lock dir holds pid+hb files and rmdirSync
      // can't remove a non-empty dir on Windows, so steals never landed.
      if (steal) { try { rmSync(INSTANCE_LOCK, { recursive: true, force: true }); } catch {} continue; }
      if (waited && waited % 4 === 0) emit({ stage: 'outbox_wait', ok: true, detail: 'standby — another flusher holds the lock, will take over if it dies' });
      await sleep(15000);
    }
  }
  process.on('exit', () => { try { rmSync(INSTANCE_LOCK, { recursive: true, force: true }); } catch {} });
}

emit({ stage: 'outbox_flush', detail: `write flusher live — bulk ${BATCH}/invoke · ~${RATE} records/min cap`, ok: true, start: true });
// The flusher is the ONLY writer — it must never die on a transient auth
// blip. Keep cycling login with backoff until the app is reachable again.
while (!(await login())) {
  emit({ stage: 'outbox_error', detail: 'login failed — retrying in 60s (writes keep buffering)', ok: false });
  await sleep(60000);
}
requeueInflight();

// Event-log rotation — .live-events.jsonl is append-only across the whole
// fleet (~100MB/day at bulk rates). Copy+truncate, NEVER rename: every worker
// holds a persistent append fd that follows the inode — a rename strands all
// of them writing into the renamed file. Truncation keeps fds valid.
const EVENTS_PREV = '.live-events-prev.jsonl';
let lastRotate = 0;
function rotateEvents() {
  if (Date.now() - lastRotate < 60000) return;
  lastRotate = Date.now();
  try {
    if (statSync(EVENTS).size > 25 * 1024 * 1024) {
      try { copyFileSync(EVENTS, EVENTS_PREV); writeFileSync(EVENTS, ''); } catch {}
      emit({ stage: 'outbox_pass', ok: true, detail: 'event log rotated (25MB cap)' });
    }
  } catch {}
}

while (true) {
  await waitWhilePaused('write-flusher', { item: 'outbox drain' });
  try { writeFileSync(HB, String(Date.now())); } catch {}
  // FIFO compaction: when the backlog grows huge, most lines are superseded
  // writes to the same rows — merge them before taking a batch.
  const depthNow = outboxDepth();
  if (depthNow > 10000) {
    const c = compactOutbox();
    if (c?.dropped > 0) emit({ stage: 'outbox_pass', ok: true, detail: `compacted ${c.before} → ${c.after} (−${c.dropped} superseded)` });
  }
  const batch = takeBatch(BATCH);
  if (!batch.length) {
    if (ONCE) break;
    heartbeat('write-flusher', 'idle', 'queue empty');
    await sleep(10000);
    continue;
  }
  markInflight(batch);
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    ok = await flushBatch(batch);
    if (!ok) await sleep(5000 * (attempt + 1));
  }
  if (!ok) {
    // Whole batch invoke failed persistently — locked tail-append; retry
    // lands behind newer records rather than clobbering them.
    for (const rec of batch) requeueTail(rec);
    emit({ stage: 'outbox_error', ok: false, detail: `bulk invoke unreachable — requeued ${batch.length} write(s), backing off` });
    clearInflight();
    await sleep(30000);
    continue;
  }
  clearInflight();
  rotateEvents();
  emit({ stage: 'outbox_pass', detail: `flushed batch of ${batch.length} · depth ${outboxDepth()} · mode ${bulkAvailable ? 'bulk' : 'per-record'}`, ok: true });
  if (ONCE) break;
  await sleep(SPACING);
}
