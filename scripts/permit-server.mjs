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
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { AUDIT, CONTROL_FILE, HEARTBEAT_DIR, DEFAULT_CONTROL } from './lib/server-control.mjs';
import { enqueue } from './lib/outbox.mjs';
import { mirrorApply } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { cullPlan, growSession, resolveTarget } from './lib/ai-sessions.mjs';
import { rotateAppendFileCopyTruncate } from './lib/bounded-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = path.join(AUDIT, 'permit-server.lock');
const EVENTS = path.join(ROOT, '.live-events.jsonl');
const API_PORT = Number(process.env.PERMIT_SERVER_PORT || 4175);
const DASH_PORT = '4174';
const LOG_MAX = 50 * 1024 * 1024;      // rotate at 50MB, keep .1/.2 (3 total)
const EVENTS_MAX = 20 * 1024 * 1024;   // .live-events.jsonl — same treatment
const GUARD_MS = 3000;                 // fast sensing — scale "at a moment's notice"
const LOW_ALL = 1.5 * 1024 ** 3;       // free <1.5GB → emergency pause of non-researchers
const COMMIT_CULL_BYTES = 3 * 1024 ** 3;  // commit headroom <3GB → memory pressure
const COMMIT_PAUSE_BYTES = 1.5 * 1024 ** 3; // commit headroom <1.5GB → emergency
// Auto-scale model: DOWN is immediate — any tick over a margin culls
// ceil(deficit/avgRss) researchers newest-first. UP is paced — at most one
// spawn per 10s, only while every margin still holds with cushion. Recovery
// re-admits culled slices after 15s of clean margins (not the old 60–120s).
const RES_DEFAULT_RSS = 500 * 1024 ** 2; // 500MB until live RSS is measured
const RES_MAX = 64;                    // technical safety ceiling — auto mode is otherwise uncapped
const RES_SPAWN_MS = 10000;            // ≤1 researcher spawn per 10s
const RES_SETTLE_MS = 10000;           // previous spawn must be alive ≥10s
const RES_ROTATE_MS = 10 * 60 * 1000;  // fairness — cycle slices through runtime
const RECOVER_HOLD_MS = 15000;         // clean-margin hold before unpause/re-admit
const SCALE_UP_MARGIN = 1 * 1024 ** 3; // spawn needs free − rss ≥ reserve + 1GB
const SCALE_UP_COMMIT = 4 * 1024 ** 3; // …and commit headroom − rss ≥ 4GB
const CPU_SPAWN_MAX = 85;              // no new researcher while 30s avg CPU exceeds this
const CPU_CULL_MAX = 95;               // over this → cull one researcher per 10s
const CPU_CULL_MS = 10000;
const IDLE_CULL_MS = 2 * 60 * 1000;    // researchers idle on empty work >2min get culled
const RESERVE_DEFAULT_GB = 4;          // spawn admission keeps this much free
const FLEET_BUDGET_DEFAULT_GB = 12;    // total fleet RSS cap
const MEM_HISTORY_MS = 30 * 60 * 1000; // sparkline window, sampled per tick
const RSS_CAP = 1.5 * 1024 ** 3;       // restart a worker over 1.5GB
const DRAIN_MS = 60000;                // stop: grace for the flusher's batch
const HEALTHY_MS = 5 * 60 * 1000;      // alive this long → restart backoff resets
const CRASH_LOOP_WINDOW_MS = 5 * 60 * 1000;
const CRASH_LOOP_THRESHOLD = 3;        // 3 unexpected exits inside 5min quarantines the worker
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GB = (b) => Math.round(b / 1024 ** 3 * 10) / 10;

// ── worker catalog (the start-permitting-fleet.ps1 set) ─────────────────
// Event aliases map catalog names to the `worker` field those scripts emit
// to .live-events.jsonl (names predate the controller).
function catalog() {
  const w = [
    { name: 'write-flusher', group: 'core', script: 'scripts/permitting-write-flusher.mjs', args: ['--rate', '35', '--max-rate', '120'], events: ['flusher', 'write-flusher'] },
    { name: 'mirror-sync', group: 'core', script: 'scripts/permitting-mirror-sync.mjs', events: ['mirror-sync'] },
    { name: 'seed-scan', group: 'verification', script: 'scripts/permitting-office-seed-scan.mjs', events: ['sweep-seed', 'seed-scan'] },
    { name: 'authority-verifier', group: 'verification', script: 'scripts/permitting-authority-verifier.mjs', args: ['--delay-ms', '600'], events: ['authverif0', 'authority-verifier'] },
    { name: 'queue-hygiene', group: 'verification', script: 'scripts/permitting-queue-hygiene.mjs', events: ['queuehyg', 'queue-hygiene'] },
    // One-shot profile relink — re-arms every 6h so newly-historical links
    // get re-pointed without a human (§1E). --apply is safe: it re-validates
    // every entry against the current mirror and holds ambiguous ones.
    { name: 'profile-relink', group: 'verification', script: 'scripts/permitting-profile-relink.mjs', args: ['--apply'], events: ['profile-relink'], once: true, every_ms: 6 * 3600e3 },
    // SWE-2.1 consumers — the extractor owns a 2-session ACP pool and eats
    // researcher-fed units; the auditor reviews every locality record (1
    // session, yields when the extract queue is deep). Both idle (not die)
    // when their flag is off, so the dashboard can show why.
    { name: 'ai-extractor', group: 'verification', script: 'scripts/permitting-ai-extractor.mjs', env: { DEVIN_LLM_QUEUE: 'extract', DEVIN_LLM_SESSIONS: '2', DEVIN_LLM_BATCH: '5' }, events: ['ai-extractor'], flag: 'ai_extract' },
    { name: 'ai-auditor', group: 'verification', script: 'scripts/permitting-ai-auditor.mjs', env: { DEVIN_LLM_QUEUE: 'audit', DEVIN_LLM_SESSIONS: '1', DEVIN_LLM_BATCH: '5' }, events: ['ai-auditor'], flag: 'ai_audit' },
    // Strict relabel + retro judge — dormant until the needs_recheck flag is flipped on.
    { name: 'recheck-relabel', group: 'verification', script: 'scripts/permitting-recheck-relabel.mjs', events: ['recheck-relabel'], flag: 'needs_recheck' },
    { name: 'judge-retro', group: 'verification', script: 'scripts/permitting-judge-retro.mjs', events: ['judge-retro'], flag: 'needs_recheck' },
  ];
  // 64 interchangeable researcher slots — dynamic claims share work, so the
  // live count is whatever the gates allow (auto) or the user asked (manual).
  for (let i = 0; i < RES_MAX; i++) w.push({ name: `local-res-${i}`, group: 'verification', script: 'scripts/permitting-local-researcher.mjs', args: ['--id', String(i)], events: [`local-res-${i}`], researcher: true });
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
    if (w.flag && control[w.flag] === false) continue; // ai_extract / ai_audit toggles
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
// Emergency pause: free under 1.5GB, or commit headroom under 1.5GB (the
// overnight "low virtual memory" crash was commit exhaustion, not free RAM).
export function isEmergency(freeBytes, commitHeadroomBytes) {
  return freeBytes < LOW_ALL || (commitHeadroomBytes != null && commitHeadroomBytes < COMMIT_PAUSE_BYTES);
}
// Pressure = how many bytes of margin we're short, across the three
// automatic blockers: free under the reserve, commit headroom under 3GB,
// or the fleet over its budget. Positive → cull this tick.
export function pressureDeficit({ freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes }) {
  return Math.max(
    reserveBytes - freeBytes,
    commitHeadroomBytes == null ? -Infinity : COMMIT_CULL_BYTES - commitHeadroomBytes,
    fleetRssBytes - budgetBytes,
  );
}
// Cull count for a deficit: each researcher frees ~avgRss, rounded up.
export function downScaleCount(deficitBytes, avgRssBytes) {
  return deficitBytes > 0 ? Math.ceil(deficitBytes / avgRssOr(avgRssBytes)) : 0;
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

// Crash-loop quarantine. The old health endpoint could *report* frequent
// restarts, but the controller kept respawning forever and the dashboard had
// no actionable error. Persist quarantines so a controller restart does not
// erase the evidence; `/worker {action:'start'}` is the deliberate reset.
export function isCrashLoop(restarts, now = Date.now(), windowMs = CRASH_LOOP_WINDOW_MS, threshold = CRASH_LOOP_THRESHOLD) {
  return (restarts || []).filter((t) => now - t < windowMs).length >= threshold;
}
const CRASH_FILE = path.join(AUDIT, 'crash-loops.json');
let crashLoops = readJSON(CRASH_FILE, {}) || {};
function saveCrashLoops() { try { writeFileSync(CRASH_FILE, JSON.stringify(crashLoops, null, 2)); } catch {} }
function markCrashLoop(name, error) {
  crashLoops[name] = { at: new Date().toISOString(), error: String(error || 'worker exited repeatedly').slice(0, 500) };
  saveCrashLoops();
}
function clearCrashLoop(name) {
  if (!crashLoops[name]) return;
  delete crashLoops[name];
  saveCrashLoops();
}
function tailText(f, bytes = 4096) {
  try {
    const st = statSync(f), fd = openSync(f, 'r');
    const size = Math.min(st.size, bytes), buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, st.size - size); closeSync(fd);
    return buf.toString('utf8').trim();
  } catch { return ''; }
}

// Live point reads for the /audit/revert endpoint — same pattern the
// cleanup tool uses; reverts merge onto CURRENT live offices, never a
// stale mirror array.
const FN = `https://base44.app/api/apps/${process.env.PERMIT_APP_ID || '68dfcc5e57bbbc35387da97c'}/functions`;
let apiToken = null;
async function apiLogin() {
  for (let i = 0; i < 6; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { apiToken = t.token; return true; }
    await sleep(3000 + i * 2000);
  }
  return false;
}
async function apiCall(fn, body, retried = false) {
  await paceCall(fn);
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: apiToken, ...body }), signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!r) return null;
  if ((r.status === 401 || r.status === 403) && !retried) { await apiLogin(); return apiCall(fn, body, true); }
  return r.json().catch(() => null);
}
const liveLocality = async (id) => {
  const j = await apiCall('staffDataRead', { entity: 'PermitLocality', query: { id }, limit: 1 });
  return (j?.records || j?.items || j?.data || [])[0] || null;
};

// Pure reversal calculation, exported for tests. Rename/demote restore one
// field; retire/adjudication restore the full pre-action office snapshot and
// remove its archived_offices copy. No network or filesystem access here.
export function applyAuditReversal(live, e) {
  if (!live?.offices || !e) return { error: 'locality not readable' };
  let offices;
  let archived_offices = live.archived_offices || [];
  if ((e.action === 'retire' || e.action === 'adjudicate_resolution') && e.before_office) {
    const before = e.before_office;
    const key = (o) => o?.id || o?.name;
    const targetKey = before.id || before.name || e.office_id;
    archived_offices = archived_offices.filter((o) => key(o) !== targetKey);
    offices = [...live.offices];
    const activeIdx = offices.findIndex((o) => key(o) === targetKey || key(o) === e.office_id);
    if (activeIdx >= 0) offices[activeIdx] = before;
    else offices.splice(Math.min(Number.isFinite(e.office_index) ? e.office_index : offices.length, offices.length), 0, before);
    return { offices, archived_offices };
  }
  let changed = false;
  offices = live.offices.map((o) => {
    if ((o.id || o.name) !== e.office_id) return o;
    changed = true;
    return e.action === 'rename' ? { ...o, name: e.before_name } : { ...o, authority_verification_status: 'staff_verified' };
  });
  if (!changed) return { error: 'office not on the live record' };
  return { offices, archived_offices };
}

// Undo an ai-audit/adjudication auto-action against the LIVE record.
async function revertAuditEntry(entry_id) {
  const line = readFileSync(`${AUDIT}/ai-audit-reverts.jsonl`, 'utf8').split('\n').reverse().find((l) => l.includes(`"${entry_id}"`));
  const e = line ? JSON.parse(line) : null;
  if (!e) return { error: 'entry not found' };
  if (e.reverted) return { error: 'already reverted' };
  const live = await liveLocality(e.locality_id);
  if (!live?.offices) return { error: 'locality not readable' };
  const reversal = applyAuditReversal(live, e);
  if (reversal.error) return { error: reversal.error };
  const data = { offices: reversal.offices, archived_offices: reversal.archived_offices };
  enqueue({ entity: 'PermitLocality', op: 'update', id: e.locality_id, data, priority: 1, note: `ai-audit revert — ${e.action} ${e.office_id}` });
  mirrorApply('localities', { id: e.locality_id, ...data });
  appendFileSync(`${AUDIT}/ai-audit-reverts.jsonl`, JSON.stringify({ at: new Date().toISOString(), entry_id, action: `revert_${e.action}`, locality_id: e.locality_id, office_id: e.office_id }) + '\n');
  return { ok: true };
}

// keep-awake helper — the PC must not sleep while the fleet runs or pauses.
// The ps1 (scripts/keep-awake.ps1) watches server-control.json itself; we
// just keep it alive and report its liveness.
const KEEPAWAKE_PID = `${AUDIT}/keep-awake.pid`;
function keepAwakePid() {
  try { const pid = Number(readFileSync(KEEPAWAKE_PID, 'utf8').trim()); return Number.isFinite(pid) && pid > 0 && pidAlive(pid) ? pid : null; } catch { return null; }
}
let keepAwakeSpawnedAt = 0;
function ensureKeepAwake() {
  if (keepAwakePid()) return;
  // The ps1 takes a few seconds to land its pidfile — don't respawn every
  // tick while a fresh spawn is still starting.
  if (Date.now() - keepAwakeSpawnedAt < 30000) return;
  try {
    const fd = openSync(`${AUDIT}/keep-awake.log`, 'a');
    // No detached:true — a console-detached powershell.exe exits instantly on
    // Windows. windowsHide alone keeps it invisible; unref keeps exit clean.
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(ROOT, 'scripts', 'keep-awake.ps1')], { windowsHide: true, stdio: ['ignore', fd, fd] });
    child.unref();
    keepAwakeSpawnedAt = Date.now();
    emit({ stage: 'keep_awake', detail: `keep-awake.ps1 spawned pid ${child.pid}` });
  } catch (e) { emit({ stage: 'keep_awake', ok: false, detail: `keep-awake spawn failed — ${String(e?.message || e).slice(0, 120)}` }); }
}

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
    // restart-on-crash — backoff doubles per failure, resets after 5min healthy.
    // Three unexpected exits inside five minutes is a crash loop: quarantine
    // instead of respawning forever, and surface the log tail as the reason.
    r.restarts.push(Date.now()); r.restarts = r.restarts.slice(-20);
    r.proc = null;
    if (isCrashLoop(r.restarts)) {
      const tail = tailText(logFile(spec.name)).split('\n').filter(Boolean).slice(-3).join(' | ');
      const err = `${spec.name} exited ${r.restarts.length} time(s); last code=${code} sig=${sig}${tail ? ` — ${tail}` : ''}`;
      markCrashLoop(spec.name, err);
      emit({ stage: 'worker_crash_loop', ok: false, detail: err });
      return;
    }
    const delay = r.backoff = nextBackoff(r.backoff, Date.now() - r.startedAt);
    r.restartTimer = setTimeout(() => { const cur = procs.get(spec.name); if (cur) { cur.restartTimer = null; if (!cur.proc && !cur.stoppedByUs && !shuttingDown && !crashLoops[spec.name]) spawnWorker(spec); } }, delay);
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
    // devin.exe ACP children belong to the ai-extractor / ai-auditor workers —
    // they don't show under node.exe, so their RSS is summed separately and
    // folded into the fleet total (per-child split needs a parent map we
    // don't have from tasklist).
    const dout = execFileSync('tasklist', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq devin.exe'], { encoding: 'utf8', timeout: 8000 });
    for (const line of dout.split('\n')) {
      const m = line.match(/^"devin\.exe","(\d+)","[^"]*","\d+","([\d,]+) K"/);
      if (m) map.set(-Number(m[1]), Number(m[2].replace(/,/g, '')) * 1024); // negative key = devin.exe pid
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
// resWanted = the slice membership the controller aims for. It fills toward
// the user's cap instantly, but actual spawns are gated 1/10s by
// maySpawnResearcher; pressure culls remove members the same tick.
let guard = { level: 0, paused: false, pressureAt: 0, since: null, avgRss: 0, fleetRss: 0, lastSpawn: null, resNext: 0, lastRotate: 0 };
const resWanted = new Set();
const guardActions = [];

// ── Windows commit sensing — one long-lived probe, never per-tick ────────
// os.freemem ≈ Available MBytes (verified on this box). But the overnight
// crash was commit exhaustion ("low virtual memory") — the counter probe
// emits `availMB committedBytes commitLimit` every 2s; headroom = limit −
// committed. Stale >10s or dead → headroom reports null (and the probe
// restarts); a null headroom blocks scale-up but never triggers a cull.
const memProbe = { proc: null, avail: null, committed: null, limit: null, cpu: null, at: 0 };
const cpuSamples = []; // {t, pct} — rolling 30s window for the CPU gates
export function cpuAvg30(now = Date.now(), samples = cpuSamples) {
  const w = samples.filter((s) => now - s.t <= 30000);
  return w.length ? w.reduce((a, s) => a + s.pct, 0) / w.length : null;
}
function commitHeadroomBytes() {
  if (!memProbe.at || Date.now() - memProbe.at > 10000 || !Number.isFinite(memProbe.limit)) return null;
  return memProbe.limit - memProbe.committed;
}
function startMemProbe() {
  if (memProbe.proc || shuttingDown) return;
  let proc;
  try {
    proc = spawn('powershell', ['-NoProfile', '-Command',
      'while($true){ $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; $c = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name=\'_Total\'"; "$($m.AvailableMBytes) $($m.CommittedBytes) $($m.CommitLimit) $($c.PercentProcessorTime)"; Start-Sleep -Seconds 2 }'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { setTimeout(startMemProbe, 5000).unref(); return; }
  memProbe.proc = proc;
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const parts = buf.slice(0, i).trim().split(/\s+/).map(Number);
      buf = buf.slice(i + 1);
      if (parts.length >= 3 && parts.every(Number.isFinite)) {
        memProbe.avail = parts[0]; memProbe.committed = parts[1]; memProbe.limit = parts[2]; memProbe.at = Date.now();
        if (parts.length >= 4) {
          memProbe.cpu = parts[3];
          cpuSamples.push({ t: memProbe.at, pct: parts[3] });
          while (cpuSamples.length && memProbe.at - cpuSamples[0].t > 30000) cpuSamples.shift();
        }
      }
    }
  });
  const dead = () => { if (memProbe.proc === proc) memProbe.proc = null; setTimeout(startMemProbe, 5000).unref(); };
  proc.on('exit', dead);
  proc.on('error', dead);
}

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
  syncResMembership();
  const want = new Set(activeSetFor(control, CATALOG, researcherRunSet()));
  const isSlice = (n) => /^local-res-\d+$/.test(n);
  let spawned = 0;
  for (const spec of CATALOG) {
    const r = procs.get(spec.name);
    const alive = isAlive(r);
    if (want.has(spec.name)) {
      // Recurring one-shots (profile-relink every 6h) re-arm after the interval.
      if (spec.once && r?.finished && spec.every_ms && Date.now() - (r.finishedAt || 0) >= spec.every_ms) r.finished = false;
      if (crashLoops[spec.name] || alive || r?.restartTimer || (spec.once && r?.finished)) continue;
      // Researcher slices: the up-scale gate decides — margins (reserve +
      // 1GB cushion, commit headroom −4GB, fleet under budget), at most one
      // spawn per 10s, previous spawn settled. Pacing blocks are invisible;
      // margin blocks surface as "blocked-by-memory" on the dashboard.
      if (isSlice(spec.name)) {
        const last = guard.lastSpawn && procs.get(guard.lastSpawn.name);
        const lastSpawnAliveMs = isAlive(last) ? Date.now() - last.startedAt : null;
        const margins = { freeBytes: os.freemem(), reserveBytes: reserveBytesOf(control), commitHeadroomBytes: commitHeadroomBytes(), fleetRssBytes: guard.fleetRss, budgetBytes: fleetBudgetBytesOf(control), avgRssBytes: guard.avgRss };
        // Up-scale gates in order of cost: memory margins (fails closed on
        // missing commit data), CPU 30s average, claimable work, then the
        // one-spawn-per-10s pacing with settle time. The first failing gate
        // is the dashboard's hold reason.
        const cpu = cpuAvg30();
        const wa = workAvailable();
        const hold = spawnHoldReason({ ...margins, cpuPct: cpu, workAvail: wa, liveCount: liveRes().length, now: Date.now(), lastSpawnAt: guard.lastSpawn?.at ?? null, lastSpawnAliveMs });
        if (hold) {
          if (spawnHold.get(spec.name) !== hold) {
            spawnHold.set(spec.name, hold);
            const why = { memory: `margins don't fit another ${GB(margins.avgRssBytes || RES_DEFAULT_RSS)}GB researcher yet`, cpu: `CPU averaging ${Math.round(cpu)}% (limit ${CPU_SPAWN_MAX}%)`, work: `only ${wa} piece${wa === 1 ? '' : 's'} of claimable work left`, pace: 'spawn pacing' }[hold];
            guardActions.push({ at: new Date().toISOString(), detail: `spawn blocked ${spec.name} — ${why}` });
            guardActions.splice(0, Math.max(0, guardActions.length - 50));
            emit({ stage: 'guard', detail: `spawn blocked ${spec.name} — ${why}` });
          }
          if (hold === 'memory') admitBlocked.add(spec.name);
          continue;
        }
        spawnHold.delete(spec.name);
        admitBlocked.delete(spec.name);
        spawnWorker(spec);
        guard.lastSpawn = { name: spec.name, at: Date.now() };
        continue;
      }
      // Other researcher-flagged workers (expansion, dormant) keep the
      // plain reserve admission; non-researchers stagger ≤2 per pass.
      if (spec.researcher && !admitResearcher(os.freemem(), guard.avgRss, reserveBytesOf(control))) continue;
      if (spawned >= 2) continue;
      spawnWorker(spec); spawned++;
    } else if (r?.proc && !r.stoppedByUs) { emit({ stage: 'worker_stop', detail: `${spec.name} not in active set` }); stopWorker(spec.name); }
  }
}

// ── researcher membership + limits ───────────────────────────────────────
const resCfg = (c) => ({ mode: 'auto', max: 16, disabled: [], killall: false, ...(c?.researchers || {}) });
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
// Display estimate — how many researchers memory could host right now.
export function memoryAllowance(freeBytes, avgRssBytes, reserveBytes, total = RES_MAX) {
  return Math.max(0, Math.min(total, Math.floor((freeBytes - reserveBytes) / avgRssOr(avgRssBytes))));
}
// The cap on membership: auto mode is UNCAPPED — memory, CPU and available
// work decide how many run, bounded only by the RES_MAX safety ceiling.
// Manual = exactly the user's count. killall pins 0 until the user picks a
// mode or count again.
export function researcherCap(control, total = RES_MAX) {
  const rc = resCfg(control);
  if (rc.killall) return 0;
  if (rc.mode === 'manual') {
    const max = Number(rc.max);
    return Math.max(0, Math.min(total, Number.isFinite(max) ? Math.floor(max) : 0));
  }
  return total;
}
// ── work-availability gate ───────────────────────────────────────────────
// Each researcher publishes how much work is claimable right now to
// .audit-work/research-targets.json (gap targets + queue rows + a small
// fulfill allowance — fulfill is real work but shouldn't drive unbounded
// scaling). No fleet runs more researchers than there is work for. Stale or
// missing data fails OPEN so the fleet can always bootstrap a probe.
const TARGETS_FILE = path.join(AUDIT, 'research-targets.json');
export function workAvailable(now = Date.now(), file = TARGETS_FILE) {
  const j = readJSON(file, null);
  if (!j || !Number.isFinite(j.at) || now - j.at > 60000) return null;
  return Math.max(0, (Number(j.gap) || 0) + (Number(j.queue) || 0) + Math.min(Number(j.fulfill) || 0, 4));
}
// The whole probe — cooling-down counts, exhausted jurisdictions, next
// release and the per-tier breakdown the dashboard's Verification tab shows.
export function workProbe(now = Date.now(), file = TARGETS_FILE) {
  const j = readJSON(file, null);
  if (!j || !Number.isFinite(j.at) || now - j.at > 60000) return null;
  return j;
}
// Scale-up margins: another researcher only starts when all three limits
// still hold after its projected RSS lands — reserve plus a 1GB cushion,
// commit headroom minus 4GB, fleet under budget. A missing commit reading
// fails closed (no spawn) — pressure data we can't see can't be trusted.
export function spawnMarginsOk({ freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes, avgRssBytes }) {
  const a = avgRssOr(avgRssBytes);
  return freeBytes - a >= reserveBytes + SCALE_UP_MARGIN
    && commitHeadroomBytes != null && commitHeadroomBytes - a >= SCALE_UP_COMMIT
    && fleetRssBytes + a <= budgetBytes;
}
// Full up-scale gate: margins + at most one spawn per 10s + the previous
// spawn settled (alive ≥10s so its real RSS feeds avgRss). A dead previous
// spawn only needs the pacing wait — crash backoff handles its restart.
export function spawnPacingOk({ now, lastSpawnAt, lastSpawnAliveMs }) {
  if (lastSpawnAt != null && now - lastSpawnAt < RES_SPAWN_MS) return false;
  if (lastSpawnAliveMs != null && lastSpawnAliveMs < RES_SETTLE_MS) return false;
  return true;
}
export function maySpawnResearcher({ freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes, avgRssBytes, now, lastSpawnAt, lastSpawnAliveMs }) {
  if (!spawnMarginsOk({ freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes, avgRssBytes })) return false;
  return spawnPacingOk({ now, lastSpawnAt, lastSpawnAliveMs });
}
// The full uncapped up-scale gate as one pure decision: memory margins →
// CPU 30s average → claimable work → pacing. Returns the holding gate name
// (the dashboard's hold reason) or null when a spawn may proceed. A null
// workAvail (stale/missing probe data) fails open so the fleet can always
// bootstrap its first researcher.
export function spawnHoldReason({ freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes, avgRssBytes, cpuPct, workAvail, liveCount, now, lastSpawnAt, lastSpawnAliveMs }) {
  if (!spawnMarginsOk({ freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes, avgRssBytes })) return 'memory';
  if (cpuPct != null && cpuPct > CPU_SPAWN_MAX) return 'cpu';
  if (workAvail != null && liveCount >= workAvail) return 'work';
  if (!spawnPacingOk({ now, lastSpawnAt, lastSpawnAliveMs })) return 'pace';
  return null;
}
// Cull order for memory pressure: newest-spawned first (the oldest slice is
// likeliest to be mid-item; the newest hasn't earned its keep yet).
export function cullOrder(records) {
  return records.slice().sort((a, b) => b.startedAt - a.startedAt);
}
// Idle cull selection: live researchers whose heartbeat has said 'idle'
// continuously for idleMs, newest-spawned first. hbByName(name) → heartbeat
// record or null. Only the worker's own 'no work' signal counts — 'paused'/
// 'stopped'/'memory guard' idle states must never trigger a work cull.
export function idleCullList(records, hbByName, now, idleMs = IDLE_CULL_MS) {
  return cullOrder(records).filter((r) => {
    const hb = hbByName(r.spec.name);
    return hb?.state === 'idle' && hb.item === 'no work' && hb.at && now - new Date(hb.at).getTime() >= idleMs;
  });
}
// Rotation pointer: next slot index not already wanted, user-disabled, or
// blocked by any guard. Returns -1 when nothing is available.
export function nextSliceIndex(start, taken, disabled, blocked, total = RES_MAX) {
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const n = `local-res-${idx}`;
    if (!taken.has(n) && !disabled.has(n) && !blocked.has(n)) return idx;
  }
  return -1;
}
const memBlocked = new Set();   // slices culled for memory — stay out until recovery
const cpuBlocked = new Set();   // slices culled while CPU >95% — back when the 30s avg drops under 85%
const workBlocked = new Set();  // slices culled after idling >2min on empty work
const admitBlocked = new Set(); // wanted slices that failed spawn margins
const spawnHold = new Map();    // spec.name → 'memory'|'cpu'|'work'|'pace' — the gate holding it back
const memHistory = [];          // {t, free, fleet, headroom} per tick, 30min ring
const isAlive = (r) => Boolean(r?.proc && !r.proc.killed && r.proc.exitCode === null);
const liveRes = () => [...procs.values()].filter((r) => /^local-res-\d+$/.test(r.spec.name) && isAlive(r));

// Which slices may be spawned right now: the wanted membership minus
// user-disabled and memory-culled names.
function researcherRunSet() {
  const disabled = new Set(resCfg(control).disabled);
  return [...resWanted].filter((n) => !disabled.has(n) && !memBlocked.has(n) && !cpuBlocked.has(n) && !workBlocked.has(n));
}
// Membership maintenance, run every reconcile: shrink to the user's cap
// (pending spawns first, then newest live), rotate the longest-running
// slice for a fresh one every 10min (fairness), then grow toward the cap.
// Growing only adjusts membership — the spawn gate paces actual starts.
function syncResMembership() {
  const cap = researcherCap(control);
  const disabled = new Set(resCfg(control).disabled);
  // The work gate caps membership too — no point wanting 40 researchers
  // when 6 pieces of work exist. Live workers are never trimmed here (the
  // idle cull drains them); membership just can't outgrow max(work, live).
  const wa = workAvailable();
  const effCap = wa == null ? cap : Math.min(cap, Math.max(wa, liveRes().length));
  for (const n of [...resWanted]) if (disabled.has(n)) resWanted.delete(n);
  while (resWanted.size > effCap) {
    const pending = [...resWanted].filter((n) => !isAlive(procs.get(n)));
    const drop = pending[0] || cullOrder([...resWanted].map((n) => procs.get(n)).filter(isAlive))[0]?.spec.name || [...resWanted][0];
    resWanted.delete(drop);
  }
  const now = Date.now();
  if (now - guard.lastRotate >= RES_ROTATE_MS) {
    guard.lastRotate = now;
    const live = liveRes().filter((r) => resWanted.has(r.spec.name));
    if (live.length) {
      const oldest = live.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
      resWanted.delete(oldest.spec.name);
      const idx = nextSliceIndex(guard.resNext, resWanted, disabled, allBlocked());
      if (idx >= 0) { guard.resNext = (idx + 1) % RES_MAX; resWanted.add(`local-res-${idx}`); emit({ stage: 'guard', detail: `rotation — ${oldest.spec.name} rests, local-res-${idx} takes its slot` }); }
    }
  }
  while (resWanted.size < effCap) {
    const idx = nextSliceIndex(guard.resNext, resWanted, disabled, allBlocked());
    if (idx < 0) break;
    guard.resNext = (idx + 1) % RES_MAX;
    resWanted.add(`local-res-${idx}`);
  }
}
const allBlocked = () => new Set([...memBlocked, ...cpuBlocked, ...workBlocked]);

// Plain description of which margins are breached, for the action log.
function pressureReasons(freeBytes, reserveBytes, commitHeadroomBytes, fleetRssBytes, budgetBytes) {
  const parts = [];
  if (freeBytes < reserveBytes) parts.push(`free ${GB(freeBytes)}GB < ${GB(reserveBytes)}GB reserve`);
  if (commitHeadroomBytes != null && commitHeadroomBytes < COMMIT_CULL_BYTES) parts.push(`Windows memory headroom ${GB(commitHeadroomBytes)}GB < ${GB(COMMIT_CULL_BYTES)}GB`);
  if (fleetRssBytes > budgetBytes) parts.push(`server using ${GB(fleetRssBytes)}GB > ${GB(budgetBytes)}GB limit`);
  return parts.join(' + ');
}

// Guard tick (every 3s): sense → cull on any breached margin → pause
// non-researchers on emergency → recover after 15s clean → RSS cap → logs.
async function guardTick() {
  ensureKeepAwake(); // respawn the sleep-prevention helper if it died
  const free = os.freemem();
  const rss = rssByPid();
  const now = Date.now();
  const headroom = commitHeadroomBytes();
  const reserve = reserveBytesOf(control);
  const budget = fleetBudgetBytesOf(control);
  const act = (msg) => { guardActions.push({ at: new Date().toISOString(), detail: msg }); guardActions.splice(0, Math.max(0, guardActions.length - 50)); emit({ stage: 'guard', detail: msg }); };
  // Measured average researcher RSS feeds admission + the cull count.
  const resRsses = liveRes().map((r) => rss.get(r.proc.pid)).filter(Boolean);
  if (resRsses.length) guard.avgRss = resRsses.reduce((a, b) => a + b, 0) / resRsses.length;
  // Fleet RSS + 30-min history for the dashboard memory panel.
  let fleetRss = 0, devinRss = 0, devinCount = 0;
  for (const r of procs.values()) if (isAlive(r)) fleetRss += rss.get(r.proc.pid) || 0;
  for (const [pid, b] of rss) if (pid < 0) { devinRss += b; devinCount++; }
  fleetRss += devinRss; // ACP children are fleet memory too
  guard.fleetRss = fleetRss; guard.devinRss = devinRss; guard.devinCount = devinCount;
  memHistory.push({ t: now, free, fleet: fleetRss, headroom });
  while (memHistory.length && now - memHistory[0].t > MEM_HISTORY_MS) memHistory.shift();
  // ── scale down, immediately ────────────────────────────────────────────
  // Any breached margin → cull ceil(deficit/avgRss) researchers the same
  // tick, newest first. Culled slices leave the wanted set and memBlocked
  // keeps them out until margins hold 15s clean — no instant re-spawn into
  // the same pressure.
  const emergency = isEmergency(free, headroom);
  const deficit = pressureDeficit({ freeBytes: free, reserveBytes: reserve, commitHeadroomBytes: headroom, fleetRssBytes: fleetRss, budgetBytes: budget });
  if (deficit > 0 || emergency) {
    guard.pressureAt = now;
    if (emergency && !guard.paused) {
      guard.paused = true;
      guard.since = new Date().toISOString();
      act(`memory emergency — free ${GB(free)}GB${headroom != null ? `, Windows headroom ${GB(headroom)}GB` : ''} — pausing background work`);
    }
    let n = downScaleCount(Math.max(deficit, 0), guard.avgRss);
    const why = pressureReasons(free, reserve, headroom, fleetRss, budget) || 'low memory';
    const n0 = n;
    for (const r of cullOrder(liveRes().filter((x) => !memBlocked.has(x.spec.name)))) {
      if (n <= 0) break;
      n--;
      memBlocked.add(r.spec.name);
      resWanted.delete(r.spec.name);
      stopWorker(r.spec.name);
      act(`${emergency ? 'emergency' : 'pressure'} cull ${r.spec.name} — ${why}`);
    }
    // Researchers first — if pressure remains, cut ai-extractor sessions,
    // then ai-auditor sessions (their workers only pause at emergency,
    // alongside other non-flusher workers).
    const credited = (n0 - n) * avgRssOr(guard.avgRss);
    const rest = Math.max(deficit, 0) - credited;
    if (rest > 0) {
      const aiT = readJSON(`${AUDIT}/ai-session-targets.json`, null) || { extract: 2, audit: 3 };
      const plan = cullPlan({ deficitBytes: rest, researchers: 0, extractSessions: aiT.extract || 0, auditSessions: aiT.audit || 0, avgDevinRssBytes: devinCount ? devinRss / devinCount : null });
      if (plan.extCuts || plan.audCuts) {
        aiT.extract = Math.max(0, (aiT.extract || 0) - plan.extCuts);
        aiT.audit = Math.max(0, (aiT.audit || 0) - plan.audCuts);
        aiT.at = Date.now();
        try { writeFileSync(`${AUDIT}/ai-session-targets.json`, JSON.stringify(aiT)); } catch {}
        act(`pressure — AI sessions cut: extractor −${plan.extCuts} → ${aiT.extract}, auditor −${plan.audCuts} → ${aiT.audit}`);
      }
    }
  }
  // ── AI session auto-grow: +1 lane session per ~15s when every margin
  // passes after reserving the session's measured RSS — same gates as
  // researcher admission. Manual mode pins from audit/extract settings.
  {
    const aiT = readJSON(`${AUDIT}/ai-session-targets.json`, null) || { extract: 2, audit: 3 };
    const xset = control.ai_extract_settings || {}, aset = control.ai_audit_settings || {};
    const devAvg = devinCount ? devinRss / devinCount : 400 * 1024 ** 2;
    let next = { ...aiT };
    if (xset.sessions_mode === 'manual') next.extract = resolveTarget({ mode: 'manual', manual: xset.sessions ?? 2 });
    if (aset.sessions_mode === 'manual') next.audit = resolveTarget({ mode: 'manual', manual: aset.sessions ?? 3 });
    if (deficit <= 0 && !emergency && (!guard.aiGrowAt || now - guard.aiGrowAt >= 15000)) {
      const gates = { freeBytes: free, reserveBytes: reserve, commitHeadroomBytes: headroom, fleetRssBytes: fleetRss, budgetBytes: budget, avgDevinRssBytes: devAvg, cpuPct: cpuAvg30(), cpuMaxPct: CPU_SPAWN_MAX };
      if (xset.sessions_mode !== 'manual') next.extract = growSession({ current: aiT.extract ?? 2, max: 8, ...gates });
      if (aset.sessions_mode !== 'manual') next.audit = growSession({ current: aiT.audit ?? 3, max: 8, ...gates });
      guard.aiGrowAt = now;
    }
    if (next.extract !== aiT.extract || next.audit !== aiT.audit) {
      next.at = now;
      try { writeFileSync(`${AUDIT}/ai-session-targets.json`, JSON.stringify(next)); } catch {}
      if (next.extract > aiT.extract || next.audit > aiT.audit) emit({ stage: 'guard', detail: `AI sessions grow — extractor ${next.extract}, auditor ${next.audit}` });
    }
    guard.aiTargets = next;
  }
  // ── CPU cull: sustained >95% → shed one researcher per 10s ───────────
  const cpu = cpuAvg30(now);
  if (cpu != null && cpu > CPU_CULL_MAX && (!guard.lastCpuCull || now - guard.lastCpuCull >= CPU_CULL_MS)) {
    const victim = cullOrder(liveRes().filter((x) => !memBlocked.has(x.spec.name) && !cpuBlocked.has(x.spec.name)))[0];
    if (victim) {
      guard.lastCpuCull = now;
      cpuBlocked.add(victim.spec.name);
      resWanted.delete(victim.spec.name);
      stopWorker(victim.spec.name);
      act(`CPU cull ${victim.spec.name} — processor averaging ${Math.round(cpu)}% for 30s`);
    }
  }
  if (cpuBlocked.size && (cpu == null || cpu < CPU_SPAWN_MAX)) { cpuBlocked.clear(); act('CPU recovered — culled researchers can start again'); }
  // ── idle cull: researchers waiting on empty work >2min are shed ──────
  // newest first. The work gate keeps them out until fresh work appears.
  for (const r of idleCullList(liveRes(), (n) => readJSON(path.join(HEARTBEAT_DIR, `${n}.json`), null), now)) {
    workBlocked.add(r.spec.name);
    resWanted.delete(r.spec.name);
    stopWorker(r.spec.name);
    const hb = readJSON(path.join(HEARTBEAT_DIR, `${r.spec.name}.json`), null);
    act(`idle cull ${r.spec.name} — no claimable work for ${Math.round((hb?.at ? now - new Date(hb.at).getTime() : 0) / 60000)}min`);
  }
  if (workBlocked.size) {
    const wa = workAvailable(now);
    if (wa == null || wa > liveRes().length) workBlocked.clear(); // work came back (or went unknown — fail open)
  }
  // ── recover: 15s of clean margins releases the pause and re-admits ────
  const recovered = guard.pressureAt > 0 && deficit <= 0 && !emergency && now - guard.pressureAt >= RECOVER_HOLD_MS;
  if (guard.paused && recovered) {
    guard.paused = false;
    guard.since = null;
    act(`memory recovered — free ${GB(free)}GB — resuming background work`);
  }
  if (recovered && memBlocked.size) { memBlocked.clear(); act('memory margins held — culled researchers can start again'); }
  guard.level = guard.paused ? 2 : 0;
  // Pause list = non-researcher workers during emergency only. Researcher
  // slices are culled from the spawn set, not paused — a paused slice still
  // holds its ~500MB, so pausing never released memory pressure.
  const names = guard.paused ? guardPausedNames(2) : [];
  const stale = control.guard_paused || [];
  const drift = stale.length !== names.length || names.some((n) => !stale.includes(n));
  if (drift) writeControl({ guard_paused: names }, 'permit-server guard');
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
  // Event writers keep persistent append fds; rename rotation strands them in
  // the archived inode. Copy+truncate keeps the path live (a few telemetry
  // lines can be lost during the copy; events are not correctness data). The
  // flusher also rotates at 25MB; this is the fallback when it is down.
  rotateAppendFileCopyTruncate(EVENTS, path.join(ROOT, '.live-events-prev.jsonl'), EVENTS_MAX);
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
    if (crashLoops[spec.name]) status = 'crash_looping';
    else if (alive) status = hb?.state === 'idle' ? 'idle' : 'running';
    else if (spec.once && r?.finished) status = 'done';
    else if (disRes.has(spec.name) || stoppedW.has(spec.name)) status = 'stopped-by-user';
    else if (memBlocked.has(spec.name)) status = 'culled-by-memory';
    else if (cpuBlocked.has(spec.name)) status = 'culled-by-cpu';
    else if (workBlocked.has(spec.name)) status = 'culled-idle';
    else if (spawnHold.get(spec.name) === 'work') status = 'no-work';
    else if (spawnHold.get(spec.name) === 'cpu') status = 'blocked-by-cpu';
    else if (spawnHold.get(spec.name) === 'pace') status = 'ramping';
    else if (admitBlocked.has(spec.name) || resWanted.has(spec.name)) status = 'blocked-by-memory'; // queued for a spawn slot / margins
    else if (/^local-res-\d+$/.test(spec.name) && control.state !== 'stopped') status = 'stopped'; // slot exists but isn't in the wanted set — uncapped slots are just off
    else if ((control.guard_paused || []).includes(spec.name)) status = 'paused-by-guard';
    else status = 'stopped';
    return { name: spec.name, group: spec.group, status, pid: alive ? r.proc.pid : null, alive, rss_mb: alive && rss.get(r.proc.pid) ? Math.round(rss.get(r.proc.pid) / 1048576) : null, uptime_s: alive && r ? Math.round((now - r.startedAt) / 1000) : null, restarts: (r?.restarts || []).length, recent_restarts: recentRestarts, crash_looping: Boolean(crashLoops[spec.name]), crash_error: crashLoops[spec.name]?.error || null, crash_loop_at: crashLoops[spec.name]?.at || null, last_heartbeat: hb, last_event: lastEvent };
  });
  const vp = verificationProgress();
  // Verified counts must reflect the live app, not the mirror (which folds
  // unflushed local upserts and has overstated progress). mirror-sync writes
  // live-verified-count.json from RAW remote rows every cycle — prefer it
  // while it's fresh (<35min); the mirror-derived ledger is the fallback.
  if (vp?.offices) {
    const lv = readJSON(`${AUDIT}/live-verified-count.json`, null);
    if (lv?.staff_verified != null && Date.now() - Date.parse(lv.at || 0) < 35 * 60e3) {
      vp.offices = { ...vp.offices, staff_verified: lv.staff_verified };
      vp.verified_source = 'live';
    } else vp.verified_source = 'mirror';
  }
  const res = resCfg(control);
  const headroom = commitHeadroomBytes();
  // Why the next researcher isn't starting — the dashboard shows this when
  // the live count sits below the cap.
  let holdReason = null;
  const resCap = researcherCap(control);
  if (resCfg(control).killall) holdReason = 'all researchers were stopped — pick a mode or count to start again';
  else if (control.state === 'running' && control.verification && liveRes().length < resCap) {
    const a = avgRssOr(guard.avgRss), free = os.freemem(), reserve = reserveBytesOf(control), budget = fleetBudgetBytesOf(control);
    const cpu = cpuAvg30(), wa = workAvailable();
    if (guard.paused) holdReason = 'memory is critically low — background work is paused until it recovers';
    else if (free - a < reserve + SCALE_UP_MARGIN) holdReason = `free memory is ${GB(free)} GB — a new researcher needs ${GB(reserve + SCALE_UP_MARGIN)} GB + ${GB(a)} GB`;
    else if (headroom == null) holdReason = `Windows memory headroom is being measured — a new researcher needs ${GB(SCALE_UP_COMMIT)} GB + ${GB(a)} GB`;
    else if (headroom - a < SCALE_UP_COMMIT) holdReason = `Windows memory headroom is ${GB(headroom)} GB — a new researcher needs ${GB(SCALE_UP_COMMIT)} GB + ${GB(a)} GB`;
    else if (guard.fleetRss + a > budget) holdReason = `the server is already using ${GB(guard.fleetRss)} GB of its ${GB(budget)} GB memory limit`;
    else if (cpu != null && cpu > CPU_SPAWN_MAX) holdReason = `the processor is busy — CPU has averaged ${Math.round(cpu)}% for 30 seconds (limit ${CPU_SPAWN_MAX}%)`;
    else if (wa != null && liveRes().length >= wa) {
      const probe = workProbe(), exh = Number(probe?.exhausted) || 0;
      if (wa === 0 && exh > 0) holdReason = `all ${exh} remaining jurisdictions ran every research tier — they need a person to look`;
      else if (wa === 0 && probe?.next_release) holdReason = `all research is cooling down — the next batch unlocks at ${new Date(probe.next_release).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      else holdReason = `only ${wa} piece${wa === 1 ? '' : 's'} of research work are waiting — no point running more researchers than that`;
    }
    else if (resCap >= RES_MAX && liveRes().length >= RES_MAX) holdReason = `at the safety ceiling of ${RES_MAX}`;
    else holdReason = 'ramping up — researchers start one at a time, every 10 seconds';
  }
  return { state: control.state, verification: Boolean(control.verification), expansion: Boolean(control.expansion), expansion_locked: Boolean(control.expansion_locked), keep_awake: Boolean(control.state !== 'stopped' && keepAwakePid()), promote_hold: control.promote_hold !== false, guard: { level: guard.level, since: guard.since, paused: control.guard_paused || [], actions: guardActions.slice(-10), researchers: { allowed: resWanted.size, requested: res.mode === 'manual' ? res.max : null, memory_allows: memoryAllowance(os.freemem(), guard.avgRss, reserveBytesOf(control)), mode: res.mode, max: res.max, disabled: res.disabled, mem_blocked: [...memBlocked], total: RES_MAX, ceiling: RES_MAX, killall: Boolean(res.killall), work_available: workAvailable(), work_detail: (() => { const p = workProbe(); return p ? { cooling: Number(p.cooling) || 0, exhausted: Number(p.exhausted) || 0, next_release: p.next_release || null, tiers: p.tiers || {} } : null; })(), cpu_pct: cpuAvg30() != null ? Math.round(cpuAvg30()) : null, next_slice: guard.resNext, hold_reason: holdReason, avg_rss_mb: guard.avgRss ? Math.round(guard.avgRss / 1048576) : null } }, limits: { reserve_gb: Number(control.limits?.reserve_gb) || RESERVE_DEFAULT_GB, fleet_budget_gb: Number(control.limits?.fleet_budget_gb) || FLEET_BUDGET_DEFAULT_GB }, memory: { free_gb: GB(os.freemem()), total_gb: GB(os.totalmem()), fleet_rss_gb: GB(guard.fleetRss || 0), cpu_pct: memProbe.cpu != null ? Math.round(memProbe.cpu) : null, commit_used_gb: Number.isFinite(memProbe.committed) ? GB(memProbe.committed) : null, commit_limit_gb: Number.isFinite(memProbe.limit) ? GB(memProbe.limit) : null, commit_headroom_gb: headroom != null ? GB(headroom) : null, history: memHistory.map((h) => ({ t: h.t, free_gb: GB(h.free), fleet_gb: GB(h.fleet), headroom_gb: h.headroom != null ? GB(h.headroom) : null })) }, updated_at: control.updated_at || null, workers, verification_progress: vp ? { at: vp.at, jurisdictions: vp.jurisdictions, offices: vp.offices, gap_reasons: vp.gap_reasons, missing_roles: vp.missing_roles, promotions: vp.promotions, eta: vp.eta, held_relinks: (vp.held_relinks || []).length, needs_review_total: vp.needs_review_total || 0, verified_source: vp.verified_source || 'mirror' } : null, ai: {
    extract: { on: control.ai_extract !== false, ...readJSON(`${AUDIT}/ai-extract-stats.json`, {}) },
    audit: {
      on: control.ai_audit !== false, paused: Boolean(control.ai_audit_paused), settings: control.ai_audit_settings || { demote_cap_hr: 50, breaker_pct: 5, sessions: 1 },
      ...readJSON(`${AUDIT}/ai-audit-stats.json`, {}),
      // coverage: audit-state files over the non-duplicate locality count
      coverage: (() => { try { const done = readdirSync(`${AUDIT}/audit-state`).length; const total = (readJSON(`${AUDIT}/mirrors/localities.json`, { rows: [] }).rows || []).filter((l) => !l.duplicate_of && !/paper — no permitting authority/.test(l.name)).length; return { done, total }; } catch { return { done: 0, total: 0 }; } })(),
      reverts: (() => { try { return readFileSync(`${AUDIT}/ai-audit-reverts.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-50).map((l) => JSON.parse(l)); } catch { return []; } })(),
    },
    devin_rss_mb: Math.round((guard.devinRss || 0) / 1048576), devin_children: guard.devinCount || 0, targets: guard.aiTargets || null,
    // Per-session live rows for the audit tab's live panel — the auditor
    // writes one heartbeat per ACP session.
    audit_sessions: (() => { try { return readdirSync(HEARTBEAT_DIR).filter((f) => /^ai-auditor-s\d+\.json$/.test(f)).map((f) => readJSON(path.join(HEARTBEAT_DIR, f), null)).filter(Boolean); } catch { return []; } })(),
    extract_sessions: (() => { try { return readdirSync(HEARTBEAT_DIR).filter((f) => /^ai-extractor-s\d+\.json$/.test(f)).map((f) => readJSON(path.join(HEARTBEAT_DIR, f), null)).filter(Boolean); } catch { return []; } })(),
    boost_waiting: (() => { try { const done = new Set(readFileSync(`${AUDIT}/research-boost-done.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).bid)); return readFileSync(`${AUDIT}/research-boost.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((b) => b.bid && !done.has(b.bid)).length; } catch { return 0; } })(),
  } };
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
      // Promotion hold toggle. ON means strict-pass offices remain judge
      // candidates; OFF lets the verifier promote only v2-yes guarded verdicts.
      if (url.pathname === '/promote-hold') {
        const on = body.on !== false;
        control = writeControl({ promote_hold: on }, 'api');
        reconcile();
        return json(res, 200, { ok: true, promote_hold: control.promote_hold !== false });
      }
      // SWE-2.1 feature flags — off removes the worker from the active set
      // (clean stop); the dashboard reads the flags for its status lines.
      if (url.pathname === '/ai-extract') { control = writeControl({ ai_extract: Boolean(body.on) }, 'api'); reconcile(); return json(res, 200, { ok: true, ai_extract: Boolean(body.on) }); }
      if (url.pathname === '/ai-audit') {
        const patch = {};
        if (body.on != null) patch.ai_audit = Boolean(body.on);
        if (body.paused != null) patch.ai_audit_paused = Boolean(body.paused);
        control = writeControl(patch, 'api'); reconcile(); return json(res, 200, { ok: true, ai_audit: control.ai_audit, paused: control.ai_audit_paused });
      }
      if (url.pathname === '/audit/settings') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        const s = { ...(cur.ai_audit_settings || {}) };
        if (body.demote_cap_hr != null) { const v = Math.floor(Number(body.demote_cap_hr)); if (!Number.isFinite(v) || v < 1 || v > 500) return json(res, 400, { error: 'demote_cap_hr must be 1..500' }); s.demote_cap_hr = v; }
        if (body.breaker_pct != null) { const v = Number(body.breaker_pct); if (!Number.isFinite(v) || v < 1 || v > 50) return json(res, 400, { error: 'breaker_pct must be 1..50' }); s.breaker_pct = v; }
        if (body.sessions != null) { const v = Math.floor(Number(body.sessions)); if (!Number.isFinite(v) || v < 1 || v > 8) return json(res, 400, { error: 'sessions must be 1..8' }); s.sessions = v; }
        if (body.sessions_mode != null) { if (!['auto', 'manual'].includes(body.sessions_mode)) return json(res, 400, { error: 'sessions_mode must be auto|manual' }); s.sessions_mode = body.sessions_mode; }
        control = writeControl({ ai_audit_settings: s }, 'api');
        return json(res, 200, { ok: true, ai_audit_settings: s });
      }
      if (url.pathname === '/extract/settings') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        const s = { ...(cur.ai_extract_settings || {}) };
        if (body.sessions != null) { const v = Math.floor(Number(body.sessions)); if (!Number.isFinite(v) || v < 1 || v > 8) return json(res, 400, { error: 'sessions must be 1..8' }); s.sessions = v; }
        if (body.sessions_mode != null) { if (!['auto', 'manual'].includes(body.sessions_mode)) return json(res, 400, { error: 'sessions_mode must be auto|manual' }); s.sessions_mode = body.sessions_mode; }
        control = writeControl({ ai_extract_settings: s }, 'api');
        return json(res, 200, { ok: true, ai_extract_settings: s });
      }
      // Clear the 5% breaker — the worker polls this marker and re-arms.
      if (url.pathname === '/ai-audit/resume-demotion') {
        try { writeFileSync(`${AUDIT}/ai-audit-breaker-clear`, String(Date.now())); } catch {}
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/audit/revert') {
        if (!apiToken && !(await apiLogin())) return json(res, 503, { error: 'live read unavailable — login failed' });
        const r = await revertAuditEntry(String(body.entry_id || ''));
        return json(res, r.error ? 404 : 200, r);
      }
      if (url.pathname === '/expansion') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        if (cur.expansion_locked && body.on) return json(res, 409, { error: 'expansion locked until verification is done' });
        if (body.on) for (const r of procs.values()) if (r.spec.once) r.finished = false; // re-enable re-runs one-shot sweeps
        writeControl({ expansion: Boolean(body.on) }, 'api'); reconcile(); return json(res, 200, { ok: true, expansion: Boolean(body.on) });
      }
      // Researcher controls: {mode:'auto'|'manual', max:0..64, killall}.
      // Auto ignores max (uncapped up to the 64 ceiling). Kill-all pins the
      // count to 0 until the user picks a mode or a non-zero count again.
      if (url.pathname === '/researchers') {
        const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
        const rc = resCfg(cur);
        if (body.mode != null) { if (!['auto', 'manual'].includes(body.mode)) return json(res, 400, { error: 'mode must be auto|manual' }); rc.mode = body.mode; rc.killall = false; }
        if (body.max != null) { const m = Math.floor(Number(body.max)); if (!Number.isFinite(m) || m < 0 || m > RES_MAX) return json(res, 400, { error: `max must be 0..${RES_MAX}` }); rc.max = m; rc.killall = m === 0; }
        if (body.killall === true) rc.killall = true;
        if (body.killall === false) rc.killall = false;
        control = writeControl({ researchers: rc }, 'api');
        // Recompute membership now — reconcile only runs every 2s and a
        // kill-all or count drop shouldn't wait for it.
        syncResMembership();
        if (rc.killall || (rc.mode === 'manual' && rc.max === 0)) {
          for (const r of procs.values()) if (/^local-res-\d+$/.test(r.spec.name) && isAlive(r)) stopWorker(r.spec.name);
          emit({ stage: 'guard', detail: 'kill-all — all researchers stopping, count pinned at 0' });
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
          clearCrashLoop(spec.name);
          const r0 = procs.get(spec.name);
          if (r0?.restartTimer) { clearTimeout(r0.restartTimer); r0.restartTimer = null; }
          const cur = { ...DEFAULT_CONTROL, ...readJSON(CONTROL_FILE, {}) };
          if (isRes) {
            const rc = resCfg(cur); rc.disabled = rc.disabled.filter((n) => n !== spec.name); rc.killall = false;
            control = writeControl({ researchers: rc }, 'api');
            memBlocked.delete(spec.name); cpuBlocked.delete(spec.name); workBlocked.delete(spec.name); admitBlocked.delete(spec.name); spawnHold.delete(spec.name);
            resWanted.add(spec.name); // user-started slices are wanted (may exceed the cap by one)
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
  startMemProbe();
  setInterval(reconcile, 2000).unref();
  setInterval(() => guardTick().catch(() => {}), GUARD_MS).unref();
  reconcile();
  guardTick().catch(() => {}); // heals a stale guard_paused list at boot, before workers read it
  const bye = () => { shuttingDown = true; try { memProbe.proc?.kill(); } catch {} writeControl({ state: 'stopped' }, 'permit-server exit'); releaseLock(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye); process.on('exit', releaseLock);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
