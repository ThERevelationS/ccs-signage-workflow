// Permitting error watchdog — tails .live-events.jsonl and re-pools any
// address whose latest event is a retryable failure (invoke / unresolved /
// office_error). Actions are appended back into .live-events.jsonl as
// watchdog_* stages so the dashboard feed shows exactly what the agent did
// and when. Run: node scripts/permitting-error-watchdog.mjs
//
// Policy (kept deliberately small — this is a router, not a second scanner):
//   - fail-stage latest event for an address not already queued -> append to
//     .retry-failed.json (deduped) + emit watchdog_retry_queued
//   - no permitting-address-validation process alive AND retry queue
//     non-empty -> spawn a 2-worker retry pass on that file, emit
//     watchdog_retry_launch, reset the queue file
//   - needs_review is NOT a failure class — it is the intentional human-flag
//     state and is never re-pooled (a human must pick the jurisdiction)
//   - one retry pass at a time, 2 workers max: honors the user's cap of two
//     concurrent address lookups total
//   - watchdog_alive heartbeat every 5 min so the dashboard can tell the
//     agent is awake (counts: queued, retried, spawned)
import { readFileSync, writeFileSync, existsSync, appendFileSync, openSync, readSync, statSync, closeSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const EVENTS = '.live-events.jsonl';
const QUEUE_FILE = '.retry-failed.json';
const FAILSET = new Set(['invoke', 'unresolved', 'office_error']);
const POLL_MS = 5000;
const SPAWN_CHECK_MS = 60000;
const HEARTBEAT_MS = 300000;

const fd = openSync(EVENTS, 'a');
const emit = (stage, detail = '', address = '') => {
  try {
    const line = JSON.stringify({ t: Date.now(), stage, address, detail: String(detail).slice(0, 200), worker: 'watchdog' }) + '\n';
    appendFileSync(EVENTS, line);
  } catch {}
};

const readQueue = () => { try { return JSON.parse(readFileSync(QUEUE_FILE, 'utf8')) || []; } catch { return []; } };
const writeQueue = (q) => { try { writeFileSync(QUEUE_FILE, JSON.stringify(q)); } catch {} };
let queue = readQueue();
const inQueue = new Set(queue);

const validationAlive = () => {
  try {
    const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe' AND CommandLine LIKE '%permitting-address-validation%'\\" | Measure-Object | Select-Object -ExpandProperty Count"`, { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
    lastCount = out === '' ? NaN : Number(out);
    if (out === '' || Number.isNaN(lastCount)) return true; // unreadable -> assume busy, never spawn
    return lastCount > 0;
  } catch { lastCount = NaN; return true; } // can't tell -> don't spawn
};
let lastCount = NaN;

// Seed the queue with every address currently holding a stale fail-stage mark
// (the ~16 that fell outside the restart pool). Latest-stage wins, same rule
// as the dashboard — an address that already re-resolved is skipped.
const seedStale = () => {
  const byAddr = new Map();
  let off = 0;
  try {
    const st = statSync(EVENTS);
    const buf = Buffer.alloc(Math.min(st.size, 40 * 1024 * 1024));
    const f2 = openSync(EVENTS, 'r');
    readSync(f2, buf, 0, buf.length, 0); closeSync(f2);
    for (const l of buf.toString('utf8').trim().split('\n')) {
      try { const e = JSON.parse(l); if (e.address && e.stage) byAddr.set(e.address, e); } catch {}
    }
    off = st.size;
  } catch {}
  let seeded = 0;
  for (const e of byAddr.values()) {
    if (FAILSET.has(e.stage) && !inQueue.has(e.address)) { queue.push(e.address); inQueue.add(e.address); seeded++; }
  }
  if (seeded) { writeQueue(queue); emit('watchdog_seed', `seeded ${seeded} stale failed address(es) into the retry queue`); }
  return off;
};

let offset = seedStale();
let spawned = 0, retried = 0;
emit('watchdog_alive', `watchdog online — queue ${queue.length}`);

const tailNew = () => {
  let st;
  try { st = statSync(EVENTS); } catch { return; }
  if (st.size < offset) offset = 0; // log rotated
  if (st.size === offset) return;
  const buf = Buffer.alloc(st.size - offset);
  const f2 = openSync(EVENTS, 'r');
  readSync(f2, buf, 0, buf.length, offset); closeSync(f2);
  offset = st.size;
  const latest = new Map();
  for (const l of buf.toString('utf8').split('\n')) {
    try { const e = JSON.parse(l); if (e.address && e.stage) latest.set(e.address, e); } catch {}
  }
  let added = 0, cleared = 0;
  for (const [addr, e] of latest) {
    if (FAILSET.has(e.stage) && !inQueue.has(addr)) { queue.push(addr); inQueue.add(addr); added++; retried++; }
    else if (!FAILSET.has(e.stage) && inQueue.has(addr)) { // it recovered before the pass ran — drop it
      const i = queue.indexOf(addr); if (i >= 0) queue.splice(i, 1); inQueue.delete(addr); cleared++;
    }
  }
  if (added) { writeQueue(queue); for (const [a, e] of latest) if (inQueue.has(a) && FAILSET.has(e.stage)) emit('watchdog_retry_queued', `new failure queued for retry — ${e.stage}: ${e.detail || ''}`.slice(0, 200), a); }
  if (cleared) writeQueue(queue);
};

let lastSpawnCheck = 0, lastBeat = Date.now();
const spawnRetry = () => {
  if (Date.now() - lastSpawnCheck < SPAWN_CHECK_MS) return;
  lastSpawnCheck = Date.now();
  if (!queue.length || validationAlive()) return;
  const targets = queue.slice(); writeQueue([]); queue = []; inQueue.clear();
  const tmp = '.retry-pass.json';
  try { writeFileSync(tmp, JSON.stringify(targets)); } catch { return; }
  const child = spawn('node', ['scripts/permitting-address-validation.mjs', '--file', tmp, '--limit', String(targets.length), '--workers', '1', '--json', '.validation-retry-pass.json', '--events', EVENTS], { detached: true, windowsHide: true, stdio: ['ignore', openSync('.watchdog-retry.log', 'a'), openSync('.watchdog-retry.log', 'a')], env: { ...process.env } });
  child.unref();
  spawned++;
  emit('watchdog_retry_launch', `launched 1-worker retry pass on ${targets.length} failed address(es) (validation procs seen: ${lastCount})`);
};

setInterval(tailNew, POLL_MS);
setInterval(spawnRetry, POLL_MS);
setInterval(() => emit('watchdog_alive', `heartbeat — queue ${queue.length} · ${retried} queued this session · ${spawned} pass(es) launched`), HEARTBEAT_MS);
console.log('watchdog online — tailing', EVENTS);
