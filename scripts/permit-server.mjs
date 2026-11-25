#!/usr/bin/env node
// Permit server — the single controller for the whole fleet (replaces
// start-permitting-fleet.ps1). Owns worker processes (spawn, restart with
// backoff, taskkill tree-stop), writes .audit-work/server-control.json (the
// ONLY writer), serves the local control API on 127.0.0.1:4175, runs the
// memory guard, and keeps the dashboard (live-serve.tmp.mjs, port 4174)
// alive. Workers self-pause/stop via scripts/lib/server-control.mjs.
// Lock: .audit-work/permit-server.lock — refuses to start twice.
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync, openSync, readSync, closeSync } from 'node:fs';
import { AUDIT, CONTROL_FILE, HEARTBEAT_DIR, DEFAULT_CONTROL } from './lib/server-control.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = path.join(AUDIT, 'permit-server.lock');
const EVENTS = path.join(ROOT, '.live-events.jsonl');
const API_PORT = Number(process.env.PERMIT_SERVER_PORT || 4175);
const DASH_PORT = '4174';
const LOG_MAX = 50 * 1024 * 1024;      // rotate at 50MB, keep .1/.2 (3 total)
const GUARD_MS = 15000;
const LOW_RESEARCH = 3.5 * 1024 ** 3;  // <3.5GB free → researchers pause (L1)
const LOW_ALL = 1.5 * 1024 ** 3;       // <1.5GB free → everything but flusher (L2)
// Step-down hysteresis: L2→L1 after free >3.5GB for 60s; L1→L0 after >5GB
// for 120s. Step-up is immediate — pressure wins over hysteresis.
const STEP_21_FREE = 3.5 * 1024 ** 3;
const STEP_21_TICKS = Math.ceil(60000 / GUARD_MS);
const STEP_10_FREE = 5 * 1024 ** 3;
const STEP_10_TICKS = Math.ceil(120000 / GUARD_MS);
// Adaptive researchers at L0: allowed = clamp(floor((free−4GB)/avgRss), 2,
// 16), adjusted ≤±2 per minute, window rotated every 10min so every slice
// gets runtime. Paused slices stay spawned but idle via guard_paused.
const RES_HEADROOM = 4 * 1024 ** 3;
const RES_DEFAULT_RSS = 500 * 1024 ** 2; // 500MB until live RSS is measured
const RES_MIN = 2;
const RES_STEP = 2;
const RES_TOTAL = 16;
const RES_ADJUST_MS = 60000;
const RES_ROTATE_MS = 10 * 60 * 1000;
const RESERVE_DEFAULT_GB = 4;          // spawn admission keeps this much free
const FLEET_BUDGET_DEFAULT_GB = 12;    // total fleet RSS cap
const MEM_HISTORY_MS = 30 * 60 * 1000; // sparkline window, sampled per tick
const RSS_CAP = 1.5 * 1024 ** 3;       // restart a worker over 1.5GB
const DRAIN_MS = 60000;                // stop: grace for the flusher's batch
const HEALTHY_MS = 5 * 60 * 1000;      // alive this long → restart backoff resets
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GB = (b) => Math.round(b / 1024 ** 3 * 10) / 10;

// ── worker catalog (the start-permitting-fleet.ps1 set) ─────────────────
// Event aliases map catalog names to the `worker` field those scripts emit
// to .live-events.jsonl (names predate the controller).
function catalog() {
  const w = [
    { name: 'write-flusher', group: 'core', script: 'scripts/permitting-write-flusher.mjs', args: ['--rate', '35'], events: ['flusher', 'write-flusher'] },
    { name: 'mirror-sync', group: 'core', script: 'scripts/permitting-mirror-sync.mjs', events: ['mirror-sync'] },
    { name: 'seed-scan', group: 'verification', script: 'scripts/permitting-office-seed-scan.mjs', events: ['sweep-seed', 'seed-scan'] },
    { name: 'authority-verifier', group: 'verification', script: 'scripts/permitting-authority-verifier.mjs', args: ['--delay-ms', '600'], events: ['authverif0', 'authority-verifier'] },
    { name: 'queue-hygiene', group: 'verification', script: 'scripts/permitting-queue-hygiene.mjs', events: ['queuehyg', 'queue-hygiene'] },
    // One-shot profile relink — re-arms every 6h so newly-historical links
    // get re-pointed without a human (§1E). --apply is safe: it re-validates
    // every entry against the current mirror and holds ambiguous ones.
    { name: 'profile-relink', group: 'verification', script: 'scripts/permitting-profile-relink.mjs', args: ['--apply'], events: ['profile-relink'], once: true, every_ms: 6 * 3600e3 },
  ];
  for (let i = 0; i < 16; i++) w.push({ name: `local-res-${i}`, group: 'verification', script: 'scripts/permitting-local-researcher.mjs', args: ['--slice', String(i), '--slices', '16'], events: [`local-res-${i}`], researcher: true });
  for (let i = 0; i < 4; i++) w.push({ name: `office-sweep-${i}`, group: 'expansion', script: 'scripts/permitting-office-sweep.mjs', args: ['--slice', String(i), '--slices', '4', '--delay-ms', '800'], events: [`sweep${i}`], researcher: true, once: true });
  w.push({ name: 'forever-runner', group: 'expansion', script: 'scripts/permitting-forever-runner.mjs', args: ['--workers', '8', '--delay-ms', '300'], events: ['forever', 'forever-runner'], researcher: true });
  w.push({ name: 'parcel-resolver', group: 'expansion', script: 'scripts/permitting-parcel-resolver.mjs', events: ['parcelres', 'parcel-resolver'], researcher: true });
  // Dashboard is controller-owned too — the UI you press Start on, so it
  // stays up even in state 'stopped' (it never pauses; it serves, not works).
  w.push({ name: 'dashboard', group: 'dashboard', script: 'scripts/live-serve.tmp.mjs', env: { DASH_PORT }, events: ['dash', 'dashboard'] });
  return w;
}
const CATALOG = catalog();

// Pure helpers — exported for scripts/test-permit-server.mjs.
export function activeSetFor(control, catalog = CATALOG, researcherAllowed = null) {
  const set = new Set(['dashboard']);
  if (!control || control.state === 'stopped') return [...set];
  for (const w of catalog) {
    if (w.group === 'core') set.add(w.name);
    else if (w.group === 'verification' && control.verification) set.add(w.name);
    else if (w.group === 'expansion' && control.expansion && !control.expansion_locked) set.add(w.name);
  }
  // researcherAllowed (array of local-res-* names) culls slices outside the
  // adaptive window — they leave the active set entirely so reconcile stops
  // them (clean stop, not a crash) and the memory pressure actually drops.
  const stopped = new Set(control.stopped_workers || []);
  const out = [...set].filter((n) => !stopped.has(n));
  if (researcherAllowed != null) return out.filter((n) => !/^local-res-\d+$/.test(n) || researcherAllowed.includes(n));
  return out;
}
// Guard levels: 0 none · 1 researchers pause (<3.5GB) · 2 all but flusher (<1.5GB).
export function guardLevelFor(freeBytes) {
  if (!Number.isFinite(freeBytes)) return 0;
  if (freeBytes < LOW_ALL) return 2;
  if (freeBytes < LOW_RESEARCH) return 1;
  return 0;
}
// Pause list drives worker self-idle via waitWhilePaused. Researchers are
// NOT on it — pausing a spawned researcher frees nothing (each holds ~500MB
// working set), so guard levels cull them from the spawn set instead and
// let the memory actually release. Only non-researcher workers pause at L2.
export function guardPausedNames(level, catalog = CATALOG) {
  if (level < 2) return [];
  return catalog.filter((w) => w.group !== 'dashboard' && w.name !== 'write-flusher' && !w.researcher).map((w) => w.name);
}
export function nextBackoff(prevMs, aliveMs) {
  if (aliveMs >= HEALTHY_MS) return 1000;
  return Math.min(60000, Math.max(1000, (prevMs || 1000) * 2));
}

const emit = (e) => { try { appendFileSync(EVENTS, JSON.stringify({ t: Date.now(), worker: 'permit-server', ok: true, ...e }) + '\n'); } catch {} };
const readJSON = (f, dflt) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return dflt; } };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function writeControl(patch, by = 'permit-server') {
  const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
  const next = { ...cur, ...patch, updated_at: new Date().toISOString(), by };
  try { mkdirSync(AUDIT, { recursive: true }); writeFileSync(CONTROL_FILE, JSON.stringify(next, null, 2)); } catch {}
  return next;
}

// ── process table ────────────────────────────────────────────────────────
const procs = new Map(); // name → {proc, log, restarts:[ts], startedAt, backoff, stopWanted}
function logFile(name) { return path.join(AUDIT, `${name}.log`); }
// Pure rotation: f → f.1 → f.2 (keep 3 total). Exported for the test file.
export function rotateIfBig(f, max = LOG_MAX) {
  try {
    if (statSync(f).size <= max) return false;
    const f2 = `${f}.2`, f1 = `${f}.1`;
    if (existsSync(f2)) unlinkSync(f2);
    if (existsSync(f1)) renameSync(f1, f2);
    renameSync(f, f1);
    return true;
  } catch { return false; }
}
function rotateLogIfBig(name) {
  const f = logFile(name);
  if (!existsSync(f)) return;
  try { if (statSync(f).size <= LOG_MAX) return; } catch { return; }
  rotateIfBig(f);
}
function spawnWorker(spec) {
  if (procs.get(spec.name)?.proc && !procs.get(spec.name).proc.killed) return;
  rotateLogIfBig(spec.name);
  // stdio wants a real fd — a not-yet-open WriteStream fails spawn on Node ≥20.
  const fd = openSync(logFile(spec.name), 'a');
  const env = { ...process.env, PERMIT_AUTO_LOGIN: '1', ...(spec.env || {}) };
  const proc = spawn(process.execPath, [spec.script, ...(spec.args || [])], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); // the child owns its dup of the handle now
  const rec = { proc, spec, restarts: procs.get(spec.name)?.restarts || [], startedAt: Date.now(), backoff: procs.get(spec.name)?.backoff || 1000, stoppedByUs: false };
  procs.set(spec.name, rec);
  emit({ stage: 'worker_spawn', detail: `${spec.name} pid ${proc.pid}` });
  proc.on('exit', (code, sig) => {
    const r = procs.get(spec.name);
    emit({ stage: 'worker_exit', ok: code === 0, detail: `${spec.name} exited code=${code} sig=${sig}${r?.stoppedByUs ? ' (stopped by controller)' : ''}` });
    if (!r) return;
    // Culled/stopped workers keep a dead proc handle (taskkill never sets
    // Node's killed flag) — clear it or spawnWorker's already-running guard
    // treats them as alive and they can never re-enter the active set.
    if (r.stoppedByUs || shuttingDown) { r.proc = null; return; }
    // One-shot workers (office sweep) exit 0 when their pass completes —
    // that's "done", not a crash; a nonzero exit still restarts them.
    if (spec.once && code === 0) { r.finished = true; r.finishedAt = Date.now(); r.proc = null; return; }
    // restart-on-crash — backoff doubles per failure, resets after 5min healthy
    r.restarts.push(Date.now()); r.restarts = r.restarts.slice(-20);
    r.proc = null;
    const delay = r.backoff = nextBackoff(r.backoff, Date.now() - r.startedAt);
    r.restartTimer = setTimeout(() => { const cur = procs.get(spec.name); if (cur) { cur.restartTimer = null; if (!cur.proc && !cur.stoppedByUs && !shuttingDown) spawnWorker(spec); } }, delay);
    r.restartTimer.unref();
  });
}
function killTree(pid) {
  try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch { try { process.kill(pid); } catch {} }
}
function stopWorker(name, hardMs = 8000) {
  const r = procs.get(name);
  if (!r?.proc) return;
  r.stoppedByUs = true;
  const pid = r.proc.pid;
  // state:'stopped' makes self-pausing workers exit on their own — give them
  // a beat, then taskkill the tree (forever-runner's resolver children die too).
  setTimeout(() => { if (pidAlive(pid)) killTree(pid); }, hardMs).unref();
}

// ── RSS sampling via tasklist (one call, all node.exe) ──────────────────
function rssByPid() {
  const map = new Map();
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq node.exe'], { encoding: 'utf8', timeout: 8000 });
    for (const line of out.split('\n')) {
      const m = line.match(/^"node\.exe","(\d+)","[^"]*","\d+","([\d,]+) K"/);
      if (m) map.set(Number(m[1]), Number(m[2].replace(/,/g, '')) * 1024);
    }
  } catch {}
  return map;
}

// Kill orphaned node workers from a previous controller instance — a crash
// would otherwise leave them double-running next to respawns.
function reapOrphans() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`], { encoding: 'utf8', timeout: 15000 });
    let rows = JSON.parse(out || '[]'); if (!Array.isArray(rows)) rows = [rows];
    for (const r of rows) {
      const cmd = String(r.CommandLine || '');
      if (r.ProcessId === process.pid) continue;
      if (/scripts[\\/](permitting-|live-serve\.tmp)/.test(cmd) && !/permit-server\.mjs/.test(cmd)) {
        emit({ stage: 'orphan_reap', detail: `pid ${r.ProcessId} — ${cmd.slice(0, 120)}` });
        killTree(r.ProcessId);
      }
    }
  } catch {}
}

// ── lock ────────────────────────────────────────────────────────────────
export function lockStale(lockFile) {
  const cur = readJSON(lockFile, null);
  if (!cur?.pid) return false; // no lock, or an unparseable one — treat as free
  return cur.pid !== process.pid && !pidAlive(cur.pid);
}
function acquireLock() {
  const cur = readJSON(LOCK_FILE, null);
  if (cur?.pid && cur.pid !== process.pid && pidAlive(cur.pid)) {
    console.error(`permit-server already running (pid ${cur.pid}) — lock ${LOCK_FILE}`);
    process.exit(1);
  }
  mkdirSync(AUDIT, { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
}
function releaseLock() { try { const c = readJSON(LOCK_FILE, null); if (c?.pid === process.pid) unlinkSync(LOCK_FILE); } catch {} }

// ── controller state ─────────────────────────────────────────────────────
let control = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
let shuttingDown = false;
// allowed starts at RES_MIN, not RES_TOTAL: cold-booting all 16 slices at
// once (~8GB transient) trips the guard and culls them back — observed 2x.
let guard = { level: 0, streak: 0, since: null, allowed: RES_MIN, avgRss: 0, lastAdjust: 0, windowStart: 0 };
const guardActions = [];

let vpCache = { at: 0, data: undefined };
function verificationProgress() {
  if (vpCache.data !== undefined && Date.now() - vpCache.at < 30000) return vpCache.data;
  vpCache = { at: Date.now(), data: readJSON(path.join(AUDIT, 'verification-ledger.json'), null) };
  return vpCache.data;
}
function reconcile() {
  control = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, control) };
  // §1E gate — expansion stays locked while anything workable or held is
  // left: needs_verification == 0 AND needs_review == 0 AND no held relinks.
  // One-way unlock; requires a ledger no older than 30min so a dead
  // verifier's last write can never unlock expansion.
  const vp = verificationProgress();
  const vpFresh = vp?.at && Date.now() - new Date(vp.at).getTime() < 30 * 60e3;
  if (control.expansion_locked && vpFresh && vp.offices && vp.offices.needs_verification === 0 && !(vp.offices.needs_review || 0) && !(vp.held_relinks || []).length) {
    emit({ stage: 'expansion_unlocked', detail: 'verification ledger clean — expansion lock cleared' });
    control = writeControl({ expansion_locked: false }, 'verification-gate');
  }
  const want = new Set(activeSetFor(control, CATALOG, researcherRunSet()));
  let spawned = 0;
  for (const spec of CATALOG) {
    const r = procs.get(spec.name);
    const alive = Boolean(r?.proc && !r.proc.killed && r.proc.exitCode === null);
    if (want.has(spec.name)) {
      // Recurring one-shots (profile-relink every 6h) re-arm after the interval.
      if (spec.once && r?.finished && spec.every_ms && Date.now() - (r.finishedAt || 0) >= spec.every_ms) r.finished = false;
      // Stagger starts — a cold boot of ~22 node workers at once spikes RAM
      // hard enough to trip the guard (observed on this box).
      if (!alive && !r?.restartTimer && !(spec.once && r?.finished) && spawned < 2) {
        // Spawn admission: a researcher only starts if free − its projected
        // RSS still holds the reserve — memory vetoes any count the user or
        // the adaptive window asks for.
        if (spec.researcher && !admitResearcher(os.freemem(), guard.avgRss, reserveBytesOf(control))) {
          if (!admitBlocked.has(spec.name)) {
            admitBlocked.add(spec.name);
            guardActions.push({ at: new Date().toISOString(), detail: `spawn blocked ${spec.name} — free ${GB(os.freemem())}GB − ${GB(guard.avgRss || RES_DEFAULT_RSS)}GB projected < ${GB(reserveBytesOf(control))}GB reserve` });
            emit({ stage: 'guard', detail: `spawn blocked ${spec.name} — insufficient memory headroom` });
          }
          continue;
        }
        admitBlocked.delete(spec.name);
        spawnWorker(spec); spawned++;
      }
    } else if (r?.proc && !r.stoppedByUs) { emit({ stage: 'worker_stop', detail: `${spec.name} not in active set` }); stopWorker(spec.name); }
  }
}

// Hysteresis: rising pressure steps up immediately; recovery releases ONE
// level at a time, each only after its floor has held for its window.
export function guardNextLevel(curLevel, freeBytes, streak) {
  const sampled = guardLevelFor(freeBytes);
  if (sampled >= curLevel) return { level: sampled, streak: 0, changed: sampled !== curLevel };
  const step = curLevel === 2
    ? { above: STEP_21_FREE, ticks: STEP_21_TICKS }
    : { above: STEP_10_FREE, ticks: STEP_10_TICKS };
  const s = freeBytes > step.above ? streak + 1 : 0;
  const release = s >= step.ticks;
  return { level: release ? curLevel - 1 : curLevel, streak: release ? 0 : s, changed: release };
}

// ── adaptive researchers (level 0 only) ──────────────────────────────────
const resCfg = (c) => ({ mode: 'auto', max: RES_TOTAL, disabled: [], ...(c?.researchers || {}) });
export function reserveBytesOf(control) {
  const gb = Number(control?.limits?.reserve_gb);
  return Math.max(2, Math.min(10, Number.isFinite(gb) ? gb : RESERVE_DEFAULT_GB)) * 1024 ** 3;
}
export function fleetBudgetBytesOf(control) {
  const gb = Number(control?.limits?.fleet_budget_gb);
  return Math.max(1, Math.min(28, Number.isFinite(gb) ? gb : FLEET_BUDGET_DEFAULT_GB)) * 1024 ** 3;
}
const avgRssOr = (b) => (Number.isFinite(b) && b > 0 ? b : RES_DEFAULT_RSS);
// Spawn admission — a researcher may spawn only when, after its projected
// RSS lands, free memory still holds the reserve. Stricter than the count
// cap: the user's manual max can never push past memory.
export function admitResearcher(freeBytes, avgRssBytes, reserveBytes) {
  return freeBytes - avgRssOr(avgRssBytes) >= reserveBytes;
}
// How many researchers memory can host right now (floor 0, no RES_MIN).
export function memoryAllowance(freeBytes, avgRssBytes, reserveBytes, total = RES_TOTAL) {
  return Math.max(0, Math.min(total, Math.floor((freeBytes - reserveBytes) / avgRssOr(avgRssBytes))));
}
// Effective researcher allowance: auto = adaptive formula capped by the
// user's max; manual = exactly the user's count, still capped by memory.
export function researcherAllowance(control, freeBytes, avgRssBytes, total = RES_TOTAL) {
  const res = resCfg(control);
  const max = Math.max(0, Math.min(total, Number.isFinite(res.max) ? res.max : total));
  const mem = memoryAllowance(freeBytes, avgRssBytes, reserveBytesOf(control), total);
  if (res.mode === 'manual') return Math.min(max, mem);
  if (max === 0) return 0;
  return Math.min(max, Math.max(Math.min(RES_MIN, max), mem));
}
export function researcherStep(prev, target, total = RES_TOTAL) {
  const p = Number.isFinite(prev) ? prev : total;
  const moved = p + Math.max(-RES_STEP, Math.min(RES_STEP, target - p));
  return Math.max(0, Math.min(total, moved));
}
// Cull order for memory pressure: newest-spawned first (the oldest slice is
// likeliest to be mid-item; the newest hasn't earned its keep yet).
export function cullOrder(records) {
  return records.slice().sort((a, b) => b.startedAt - a.startedAt);
}
// Contiguous wrap-around window of `allowed` slices, skipping user-disabled
// names; the start advances by `allowed` per 10-min epoch so every slice
// gets runtime over a full cycle.
export function researcherWindow(now, allowed, total = RES_TOTAL, disabled = []) {
  const start = ((Math.floor(now / RES_ROTATE_MS) * allowed) % total + total) % total;
  const dis = new Set(disabled);
  const names = [];
  for (let i = 0; names.length < allowed && i < total; i++) {
    const n = `local-res-${(start + i) % total}`;
    if (!dis.has(n)) names.push(n);
  }
  return { start, names };
}
const memBlocked = new Set();   // slices culled for memory — stay out until recovery
const admitBlocked = new Set(); // window slices that failed spawn admission
const userStarted = new Set();  // manually started slices — wanted until next rotation
const memHistory = [];          // {t, free, fleet} per guard tick, 30min ring
// Which slices may be spawned right now. L0: the rotating window plus
// user-started pins, minus disabled and memory-blocked. Under pressure
// (L1+): nothing new spawns, but live slices stay wanted — the emergency
// cull drains them newest-first until free ≥ the L1 floor, so a dip kills
// only as many as memory can't hold instead of all 16 at once.
function researcherRunSet() {
  const disabled = new Set(resCfg(control).disabled);
  if (guard.level === 0) {
    const win = researcherWindow(Date.now(), guard.allowed, RES_TOTAL, [...disabled]);
    return win.names.concat([...userStarted]).filter((n) => !disabled.has(n) && !memBlocked.has(n));
  }
  return [...procs.values()]
    .filter((r) => /^local-res-\d+$/.test(r.spec.name) && r.proc && !r.proc.killed && r.proc.exitCode === null && !disabled.has(r.spec.name) && !memBlocked.has(r.spec.name))
    .map((r) => r.spec.name);
}

// Guard tick + RSS cap + log rotation.
async function guardTick() {
  const free = os.freemem();
  const rss = rssByPid();
  const t = guardNextLevel(guard.level, free, guard.streak);
  guard.streak = t.streak;
  const newLevel = t.level;
  if (newLevel > 0 && guard.level !== newLevel) guard.since = new Date().toISOString();
  if (newLevel === 0 && t.changed) guard.since = null;
  guard.level = newLevel;
  const now = Date.now();
  const act = (msg) => { guardActions.push({ at: new Date().toISOString(), detail: msg }); guardActions.splice(0, Math.max(0, guardActions.length - 50)); emit({ stage: 'guard', detail: msg }); };
  const liveRes = () => [...procs.values()]
    .filter((r) => /^local-res-\d+$/.test(r.spec.name) && r.proc && !r.proc.killed && r.proc.exitCode === null);
  // Measured average researcher RSS feeds admission + the adaptive count.
  const resRsses = liveRes().map((r) => rss.get(r.proc.pid)).filter(Boolean);
  if (resRsses.length) guard.avgRss = resRsses.reduce((a, b) => a + b, 0) / resRsses.length;
  // Fleet RSS + 30-min history for the dashboard memory panel.
  let fleetRss = 0;
  for (const r of procs.values()) if (r.proc && !r.proc.killed && r.proc.exitCode === null) fleetRss += rss.get(r.proc.pid) || 0;
  guard.fleetRss = fleetRss;
  memHistory.push({ t: now, free, fleet: fleetRss });
  while (memHistory.length && now - memHistory[0].t > MEM_HISTORY_MS) memHistory.shift();
  // Adaptive researcher window — binds only at L0. Auto steps ≤±2/min;
  // manual tracks the user's count directly. Both capped by what memory
  // allows and by the user's max.
  if (guard.level === 0 && now - guard.lastAdjust >= RES_ADJUST_MS) {
    guard.lastAdjust = now;
    const target = researcherAllowance(control, free, guard.avgRss, RES_TOTAL);
    guard.allowed = resCfg(control).mode === 'manual' ? target : researcherStep(guard.allowed, target);
  }
  const win = researcherWindow(now, guard.allowed, RES_TOTAL, resCfg(control).disabled);
  if (guard.windowStart !== win.start) userStarted.clear(); // manual pins last one rotation
  guard.windowStart = win.start;
  // ── automatic memory blockers ─────────────────────────────────────────
  // Fleet budget: total worker RSS over the cap → cull newest researchers
  // until under. Culled slices are memBlocked so reconcile can't respawn
  // them straight back into the same pressure.
  const budget = fleetBudgetBytesOf(control);
  if (fleetRss > budget) {
    for (const r of cullOrder(liveRes().filter((x) => !memBlocked.has(x.spec.name)))) {
      if (fleetRss <= budget) break;
      const mb = Math.round((rss.get(r.proc.pid) || 0) / 1048576);
      memBlocked.add(r.spec.name);
      stopWorker(r.spec.name);
      fleetRss -= rss.get(r.proc.pid) || 0;
      act(`fleet budget cull ${r.spec.name} (${mb}MB) — fleet RSS ${GB(fleetRss)}GB over ${GB(budget)}GB budget`);
    }
  }
  // Emergency / pressure cull: free below the L1 floor → kill the newest
  // researcher per tick until free recovers ≥3.5GB. One mechanism covers
  // the L1 band and the <1.5GB emergency — drains to fit, not to zero.
  if (free < LOW_RESEARCH) {
    const victim = cullOrder(liveRes().filter((x) => !memBlocked.has(x.spec.name)))[0];
    if (victim) {
      memBlocked.add(victim.spec.name);
      stopWorker(victim.spec.name);
      act(`${free < LOW_ALL ? 'emergency' : 'pressure'} cull ${victim.spec.name} — free ${GB(free)}GB < ${GB(LOW_RESEARCH)}GB, killing newest first until ≥${GB(LOW_RESEARCH)}GB`);
    }
  }
  // Recovery: all pressure gone and the fleet fits its budget → re-admit
  // culled slices. Level hysteresis (60s/120s holds) still gates L0 itself.
  if (guard.level === 0 && memBlocked.size && free > STEP_10_FREE && fleetRss + (guard.avgRss || RES_DEFAULT_RSS) <= budget) memBlocked.clear();
  // Pause list = non-researcher workers at L2 only. Researcher slices are
  // culled from the spawn set by reconcile, not paused — a paused slice
  // still holds its ~500MB, so pausing never released memory pressure.
  const names = guardPausedNames(guard.level);
  // Reconcile the paused set, not only on level transitions: a restarted
  // controller inherits whatever the previous one last wrote, and with
  // in-memory level 0 a "changed" transition never fires — workers would
  // stay guard-paused on a dead controller's list forever. At L0 the same
  // reconcile carries the adaptive researcher window.
  const stale = control.guard_paused || [];
  const drift = stale.length !== names.length || names.some((n) => !stale.includes(n));
  if (t.changed || drift) {
    writeControl({ guard_paused: names }, 'permit-server guard');
    const msg = t.changed
      ? (guard.level === 0 ? `guard cleared — free ${GB(free)}GB` : `guard level ${guard.level} — free ${GB(free)}GB, pausing ${names.length} worker(s)`)
      : `guard pause set reconciled (${stale.length} → ${names.length} entries) — free ${GB(free)}GB, researchers ${guard.level === 0 ? win.names.length : 0}/${RES_TOTAL}`;
    guardActions.push({ at: new Date().toISOString(), detail: msg }); guardActions.splice(0, Math.max(0, guardActions.length - 50));
    emit({ stage: 'guard', detail: msg });
  }
  for (const [name, r] of procs) {
    if (!r.proc || r.stoppedByUs) continue;
    const bytes = rss.get(r.proc.pid);
    if (bytes && bytes > RSS_CAP) {
      emit({ stage: 'worker_rss_restart', ok: false, detail: `${name} at ${GB(bytes)}GB > ${GB(RSS_CAP)}GB — restarting` });
      stopWorker(name);
      setTimeout(() => { const cur = procs.get(name); if (cur) { cur.stoppedByUs = false; if (!cur.proc) spawnWorker(cur.spec); } }, 500).unref();
    }
    rotateLogIfBig(name);
  }
}

// Tail .live-events.jsonl (last 256KB) → last event per worker alias.
function tailEvents() {
  const byAlias = new Map();
  try {
    const f = statSync(EVENTS);
    const fd = openSync(EVENTS, 'r');
    const size = Math.min(f.size, 256 * 1024);
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, f.size - size);
    closeSync(fd);
    for (const line of buf.toString('utf8').split('\n')) {
      const t = line.trim(); if (!t.startsWith('{')) continue;
      try { const e = JSON.parse(t); if (e.worker) byAlias.set(String(e.worker), e); } catch {}
    }
  } catch {}
  return byAlias;
}
function statusJSON() {
  const evs = tailEvents();
  const rss = rssByPid();
  const now = Date.now();
  const workers = CATALOG.map((spec) => {
    const r = procs.get(spec.name);
    const hb = readJSON(path.join(HEARTBEAT_DIR, `${spec.name}.json`), null);
    let lastEvent = null;
    for (const a of spec.events || []) if (evs.has(a)) { const e = evs.get(a); if (!lastEvent || String(e.t) > String(lastEvent.t)) lastEvent = { t: e.t, stage: e.stage, detail: String(e.detail || '').slice(0, 160) }; }
    const alive = Boolean(r?.proc && !r.proc.killed && r.proc.exitCode === null);
    const recentRestarts = (r?.restarts || []).filter((t) => now - t < 10 * 60 * 1000).length;
    // One status word per row for the dashboard table.
    let status;
    const disRes = new Set(resCfg(control).disabled);
    const stoppedW = new Set(control.stopped_workers || []);
    if (alive) status = hb?.state === 'idle' ? 'idle' : 'running';
    else if (spec.once && r?.finished) status = 'done';
    else if (disRes.has(spec.name) || stoppedW.has(spec.name)) status = 'stopped-by-user';
    else if (memBlocked.has(spec.name)) status = 'culled-by-memory';
    else if (admitBlocked.has(spec.name)) status = 'blocked-by-memory';
    else if (/^local-res-\d+$/.test(spec.name) && control.state !== 'stopped') status = 'culled-by-memory'; // out of the memory-sized window / pressure-drained
    else if ((control.guard_paused || []).includes(spec.name)) status = 'paused-by-guard';
    else status = 'stopped';
    return { name: spec.name, group: spec.group, status, pid: alive ? r.proc.pid : null, alive, rss_mb: alive && rss.get(r.proc.pid) ? Math.round(rss.get(r.proc.pid) / 1048576) : null, uptime_s: alive && r ? Math.round((now - r.startedAt) / 1000) : null, restarts: (r?.restarts || []).length, recent_restarts: recentRestarts, crash_looping: recentRestarts >= 5, last_heartbeat: hb, last_event: lastEvent };
  });
  const vp = verificationProgress();
  const res = resCfg(control);
  return { state: control.state, verification: Boolean(control.verification), expansion: Boolean(control.expansion), expansion_locked: Boolean(control.expansion_locked), guard: { level: guard.level, since: guard.since, paused: control.guard_paused || [], actions: guardActions.slice(-10), researchers: { allowed: guard.level === 0 ? guard.allowed : 0, requested: res.mode === 'manual' ? res.max : null, memory_allows: memoryAllowance(os.freemem(), guard.avgRss, reserveBytesOf(control)), mode: res.mode, max: res.max, disabled: res.disabled, mem_blocked: [...memBlocked], total: RES_TOTAL, window_start: guard.windowStart, avg_rss_mb: guard.avgRss ? Math.round(guard.avgRss / 1048576) : null } }, limits: { reserve_gb: Number(control.limits?.reserve_gb) || RESERVE_DEFAULT_GB, fleet_budget_gb: Number(control.limits?.fleet_budget_gb) || FLEET_BUDGET_DEFAULT_GB }, memory: { free_gb: GB(os.freemem()), total_gb: GB(os.totalmem()), fleet_rss_gb: GB(guard.fleetRss || 0), history: memHistory.map((h) => ({ t: h.t, free_gb: GB(h.free), fleet_gb: GB(h.fleet) })) }, updated_at: control.updated_at || null, workers, verification_progress: vp ? { at: vp.at, jurisdictions: vp.jurisdictions, offices: vp.offices, gap_reasons: vp.gap_reasons, missing_roles: vp.missing_roles, promotions: vp.promotions, eta: vp.eta, held_relinks: (vp.held_relinks || []).length, needs_review_total: vp.needs_review_total || 0 } : null };
}

// ── stop: pause → flusher drains → kill trees ────────────────────────────
async function stopAll() {
  writeControl({ state: 'stopped' }, 'permit-server api');
  control.state = 'stopped';
  const deadline = Date.now() + DRAIN_MS;
  while (Date.now() < deadline) {
    const r = procs.get('write-flusher');
    const alive = r?.proc && !r.proc.killed && r.proc.exitCode === null;
    const hb = readJSON(path.join(HEARTBEAT_DIR, 'write-flusher.json'), null);
    if (!alive || hb?.state === 'idle') break;
    await sleep(1000);
  }
  for (const spec of CATALOG) if (spec.group !== 'dashboard') stopWorker(spec.name, 4000);
  emit({ stage: 'fleet_stopped', detail: `all workers stopped (dashboard up on :${DASH_PORT})` });
}

// ── HTTP API (localhost only) ────────────────────────────────────────────
const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, statusJSON());
    if (req.method === 'GET' && url.pathname === '/health') { const s = statusJSON(); return json(res, 200, { ok: !s.workers.some((w) => w.crash_looping), crash_looping: s.workers.filter((w) => w.crash_looping).map((w) => w.name), state: s.state }); }
    if (req.method === 'POST') {
      const body = await new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
      if (url.pathname === '/start') { for (const r of procs.values()) r.finished = false; writeControl({ state: 'running' }, 'api'); reconcile(); return json(res, 200, { ok: true }); }
      if (url.pathname === '/pause') { writeControl({ state: 'paused' }, 'api'); reconcile(); return json(res, 200, { ok: true }); }
      if (url.pathname === '/resume') { writeControl({ state: 'running' }, 'api'); reconcile(); return json(res, 200, { ok: true }); }
      if (url.pathname === '/stop') { stopAll().catch(() => {}); return json(res, 200, { ok: true }); }
      if (url.pathname === '/verification') { writeControl({ verification: Boolean(body.on) }, 'api'); reconcile(); return json(res, 200, { ok: true, verification: Boolean(body.on) }); }
      if (url.pathname === '/expansion') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        if (cur.expansion_locked && body.on) return json(res, 409, { error: 'expansion locked until verification is done' });
        if (body.on) for (const r of procs.values()) if (r.spec.once) r.finished = false; // re-enable re-runs one-shot sweeps
        writeControl({ expansion: Boolean(body.on) }, 'api'); reconcile(); return json(res, 200, { ok: true, expansion: Boolean(body.on) });
      }
      // Researcher count controls: {mode:'auto'|'manual', max:0..16}.
      // max:0 is the dashboard's kill-all — every live slice culls now.
      if (url.pathname === '/researchers') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        const rc = resCfg(cur);
        if (body.mode != null) { if (!['auto', 'manual'].includes(body.mode)) return json(res, 400, { error: 'mode must be auto|manual' }); rc.mode = body.mode; }
        if (body.max != null) { const m = Math.floor(Number(body.max)); if (!Number.isFinite(m) || m < 0 || m > RES_TOTAL) return json(res, 400, { error: `max must be 0..${RES_TOTAL}` }); rc.max = m; }
        control = writeControl({ researchers: rc }, 'api');
        // Recompute the window now — guardTick only adjusts every 60s, so a
        // kill-all (max 0) or count change would otherwise respawn the stale
        // window for up to a minute after the slices were stopped.
        if (guard.level === 0) {
          const t = researcherAllowance(control, os.freemem(), guard.avgRss, RES_TOTAL);
          guard.allowed = resCfg(control).mode === 'manual' ? t : researcherStep(guard.allowed, t);
        }
        if (rc.max === 0) {
          for (const r of procs.values()) if (/^local-res-\d+$/.test(r.spec.name) && r.proc && !r.proc.killed && r.proc.exitCode === null) stopWorker(r.spec.name);
          emit({ stage: 'guard', detail: 'kill-all — researchers max set to 0, all slices stopping' });
        }
        reconcile(); return json(res, 200, { ok: true, researchers: rc });
      }
      // Per-worker start/stop. Stop is blocked for core writers (the
      // flusher only stops via the global Stop drain) and the dashboard.
      if (url.pathname === '/worker') {
        const spec = CATALOG.find((w) => w.name === body.name);
        if (!spec) return json(res, 404, { error: `unknown worker ${body.name}` });
        const isRes = /^local-res-\d+$/.test(spec.name);
        if (body.action === 'stop') {
          if (spec.group === 'core' || spec.group === 'dashboard') return json(res, 409, { error: `${spec.name} is core — use the global Stop instead` });
          const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
          if (isRes) { const rc = resCfg(cur); if (!rc.disabled.includes(spec.name)) rc.disabled.push(spec.name); control = writeControl({ researchers: rc }, 'api'); }
          else { const sw = new Set(cur.stopped_workers || []); sw.add(spec.name); control = writeControl({ stopped_workers: [...sw] }, 'api'); }
          stopWorker(spec.name); reconcile(); return json(res, 200, { ok: true });
        }
        if (body.action === 'start') {
          const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
          if (isRes) {
            const rc = resCfg(cur); rc.disabled = rc.disabled.filter((n) => n !== spec.name);
            control = writeControl({ researchers: rc }, 'api');
            memBlocked.delete(spec.name); admitBlocked.delete(spec.name);
            userStarted.add(spec.name); // stays wanted until the next window rotation
          } else {
            const sw = new Set(cur.stopped_workers || []); sw.delete(spec.name); control = writeControl({ stopped_workers: [...sw] }, 'api');
            const r = procs.get(spec.name); if (r) r.finished = false;
          }
          reconcile(); return json(res, 200, { ok: true });
        }
        return json(res, 400, { error: 'action must be start|stop' });
      }
      // Memory limits: {reserve_gb:2..10, fleet_budget_gb:1..28}.
      if (url.pathname === '/limits') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        const lim = { ...(cur.limits || {}) };
        if (body.reserve_gb != null) { const g = Number(body.reserve_gb); if (!Number.isFinite(g) || g < 2 || g > 10) return json(res, 400, { error: 'reserve_gb must be 2..10' }); lim.reserve_gb = g; }
        if (body.fleet_budget_gb != null) { const g = Number(body.fleet_budget_gb); if (!Number.isFinite(g) || g < 1 || g > 28) return json(res, 400, { error: 'fleet_budget_gb must be 1..28' }); lim.fleet_budget_gb = g; }
        control = writeControl({ limits: lim }, 'api'); return json(res, 200, { ok: true, limits: lim });
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
});

async function main() {
  // The exe spawns us hidden with no stderr redirect — a fatal crash
  // otherwise leaves no trace (controller died silently once already).
  process.on('uncaughtException', (e) => {
    try { appendFileSync('.audit-work/permit-server.err.log', `${new Date().toISOString()} uncaughtException ${e?.stack || e}\n`); } catch {}
    process.exit(1);
  });
  process.on('unhandledRejection', (e) => {
    try { appendFileSync('.audit-work/permit-server.err.log', `${new Date().toISOString()} unhandledRejection ${e?.stack || e}\n`); } catch {}
  });
  acquireLock();
  // Fresh state if the file never existed; otherwise restore exactly.
  if (!existsSync(CONTROL_FILE)) writeControl({}, 'permit-server boot');
  control = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
  emit({ stage: 'server_boot', detail: `permit-server pid ${process.pid} — restored state=${control.state} verification=${control.verification} expansion=${control.expansion}` });
  reapOrphans();
  server.listen(API_PORT, '127.0.0.1', () => console.log(`permit-server API on 127.0.0.1:${API_PORT} — dashboard http://localhost:${DASH_PORT}`));
  setInterval(reconcile, 2000).unref();
  setInterval(() => guardTick().catch(() => {}), GUARD_MS).unref();
  reconcile();
  guardTick().catch(() => {}); // heals a stale guard_paused list at boot, before workers read it
  const bye = () => { shuttingDown = true; writeControl({ state: 'stopped' }, 'permit-server exit'); releaseLock(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye); process.on('exit', releaseLock);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
