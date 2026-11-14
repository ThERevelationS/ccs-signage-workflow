#!/usr/bin/env node
// WS-6 — Fleet supervisor. Two failure modes killed throughput silently:
//   1. A worker process DIES (the feeder ran dead ~5h before anyone noticed).
//   2. A worker lives but stalls (no events for 15min while work exists).
// This daemon checks every 60s: missing processes get respawned, stalled
// processes get killed+respawned, and everything lands in .live-events.jsonl
// so the dashboard's SUPERVISORS bubble reflects real restarts.
//
//   node scripts/permitting-fleet-supervisor.mjs [--check-ms 60000] [--stall-min 15]
import { readFileSync, openSync, writeFileSync, existsSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const CHECK_MS = arg('--check-ms', 60000);
const STALL_MS = arg('--stall-min', 15) * 60000;
const EVENTS = '.live-events.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'fleet-supervisor', ...e }) + '\n', { flag: 'a' }); } catch {} };

// pattern (commandLine match) → spawn args; expected = minimum instance count
const ROSTER = [
  { key: 'permitting-local-resolver', args: ['scripts/permitting-local-resolver.mjs', '--file', '.remaining-pool-forever.json', '--limit', '6122', '--workers', '8', '--delay-ms', '100'], expected: 1 },
  { key: 'permitting-repair-blocked', args: ['scripts/permitting-repair-blocked.mjs'], expected: 1 },
  { key: 'permitting-office-seed-scan', args: ['scripts/permitting-office-seed-scan.mjs'], expected: 1 },
  { key: 'permitting-mirror-sync', args: ['scripts/permitting-mirror-sync.mjs'], expected: 1 },
  { key: 'permitting-write-flusher', args: ['scripts/permitting-write-flusher.mjs'], expected: 1 },
  { key: 'permitting-pipeline-trigger', args: ['scripts/permitting-pipeline-trigger.mjs'], expected: 1 },
  { key: 'permitting-queue-hygiene', args: ['scripts/permitting-queue-hygiene.mjs'], expected: 1 },
  { key: 'permitting-address-feeder', args: ['scripts/permitting-address-feeder.mjs'], expected: 1 },
  { key: 'permitting-parcel-resolver', args: ['scripts/permitting-parcel-resolver.mjs'], expected: 1 },
  { key: 'permitting-county-propagate', args: ['scripts/permitting-county-propagate.mjs'], expected: 1 },
  { key: 'permitting-forever-runner', args: ['scripts/permitting-forever-runner.mjs'], expected: 1 },
  { key: 'permitting-metrics', args: ['scripts/permitting-metrics.mjs'], expected: 1 },
  { key: 'permitting-error-watchdog', args: ['scripts/permitting-error-watchdog.mjs'], expected: 1 },
  // The designed queue-drainer — lease-guarded singleton, exactly ONE ever.
  // DISABLED under lean: permittingResearchBacklogDispatch requires an ADMIN
  // token (staff login gets 403) — the office-researchers below drain
  // not_started directly via CAS claims and are the real drainer on this box.
  { key: 'permitting-research-runner', args: ['scripts/permitting-research-runner.mjs'], expected: 1 },
  // The actual not_started drainer — CAS-claims queue rows itself, needs no
  // dispatch. Rostered near the top so it wins slots under the process cap.
  { key: 'permitting-office-researcher', args: (i) => ['scripts/permitting-office-researcher.mjs', '--slice', String(i), '--slices', '4'], expected: 4 },
  // Download/doc lanes FIRST — under the process cap, spawn order decides who
  // gets slots; the research slices are the flexible ones and must lose the
  // race, not the lanes that actually pull documents.
  { key: 'permitting-doc-pipeline', args: ['scripts/permitting-doc-pipeline.mjs'], expected: 1 },
  { key: 'permitting-rule-extractor', args: ['scripts/permitting-rule-extractor.mjs'], expected: 1 },
  { key: 'permitting-signage-facts-worker', args: ['scripts/permitting-signage-facts-worker.mjs'], expected: 1 },
  { key: 'permitting-locality-seeder', args: ['scripts/permitting-locality-seeder.mjs'], expected: 1 },
  { key: 'permitting-text-extractor', args: ['scripts/permitting-text-extractor.mjs'], expected: 1 },
  { key: 'permitting-file-uploader', args: ['scripts/permitting-file-uploader.mjs'], expected: 1 },
  { key: 'permitting-source-monitor', args: ['scripts/permitting-source-monitor.mjs'], expected: 1 },
  { key: 'permitting-authority-verifier', args: (i) => ['scripts/permitting-authority-verifier.mjs', '--slice', String(i), '--slices', '2', '--delay-ms', '100'], expected: 2 },
  // LP-7 backlog burn-down — drain-gated error/review passes + ranked human queue.
  { key: 'permitting-review-burn', args: ['scripts/permitting-review-burn.mjs'], expected: 1 },
  // Host keep-awake — holds SetThreadExecutionState while any fleet worker or
  // the dashboard lives; releases ~5min after the last one exits.
  { key: 'permitting-keep-awake', args: ['scripts/permitting-keep-awake.mjs'], expected: 1 },
  // Slice counts trimmed 2026-11-05 — 54 expected processes + duplicate pileups
  // (invisible-to-WMI spawns respawned every tick) reached 74 node processes and
  // the disk-I/O storm stalled the host IDE. Sized for a workstation now.
  { key: 'permitting-local-researcher', args: (i) => ['scripts/permitting-local-researcher.mjs', '--slice', String(i), '--slices', '3'], expected: 3 },
  { key: 'permitting-gap-researcher', args: (i) => ['scripts/permitting-gap-researcher.mjs', '--slice', String(i), '--slices', '8'], expected: 8 },
  { key: 'permitting-headless-research', args: (i) => ['scripts/permitting-headless-research.mjs', '--slice', String(i), '--slices', '2'], expected: 2 },
  { key: 'permitting-bbs-harvest', args: ['scripts/permitting-bbs-harvest.mjs'], expected: 1 },
  // regional-harvest deliberately unrostered — its blanket zoning coverage
  // claims ("provider serves the county" != "administers this jurisdiction's
  // zoning") were false-attribution bulk evidence; entries stripped by
  // .audit-work/strip-regional-entries.mjs
  { key: 'permitting-ordinance-scan', args: (i) => ['scripts/permitting-ordinance-scan.mjs', '--slice', String(i), '--slices', '1'], expected: 1 },
  { key: 'permitting-parcel-discover', args: (i) => ['scripts/permitting-parcel-discover.mjs', '--slice', String(i), '--slices', '2'], expected: 2 },
  { key: 'permitting-office-diff', args: ['scripts/permitting-office-diff.mjs'], expected: 1 },
];

// ── Roster sizing ──────────────────────────────────────────────────────────
// The full roster expects ~34 workers ≈ 6GB of node processes — that thrashed
// the workstation (paging-file exhaustion, IDE stalls). PROFILE=lean (default)
// cuts heavy slices to workstation-safe counts; FLEET_FULL=1 or --profile full
// restores the published roster for a server that can carry it.
const PROFILE = (process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : (process.env.FLEET_FULL === '1' ? 'full' : 'lean'));
if (PROFILE !== 'full') {
  const LEAN = {
    'permitting-gap-researcher': 2, 'permitting-local-researcher': 1,
    'permitting-headless-research': 1, 'permitting-parcel-discover': 1,
    'permitting-authority-verifier': 2,
    'permitting-bbs-harvest': 0, 'permitting-office-diff': 0,
    'permitting-office-researcher': 2, 'permitting-research-runner': 0,
    'permitting-parcel-resolver': 0, 'permitting-county-propagate': 0,
    'permitting-ordinance-scan': 0, 'permitting-metrics': 0,
  };
  for (const e of ROSTER) {
    if (e.key in LEAN) e.expected = LEAN[e.key];
    // local-resolver's internal --workers 8 is heavy too — halve it in lean.
    if (e.key === 'permitting-local-resolver') e.args = e.args.map((a) => a === '8' ? '2' : a);
  }
}
// Hard ceiling: never respawn past this many permitting processes, regardless
// of roster expectations — the spawn-registry gap (WMI-invisible pids) is what
// turned one "missing" reading into a 74-process pileup.
const MAX_PROCS = arg('--max-procs', PROFILE === 'full' ? 40 : 20);
const rosterTotal = ROSTER.reduce((s, r) => s + r.expected, 0);

// Slice-aware matching: each sliced worker's commandLine carries --slice N,
// so count instances per slice index; unsliced entries just need >=expected.
// Returns {pid, cmd} pairs — PIDs are needed to kill EXCESS instances, which is
// how the 74-process pileup happened: a spawn invisible to WMI (null CommandLine)
// looked missing every tick and got respawned forever.
function liveInstances() {
  const raw = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Depth 1 -Compress"', { encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const j = JSON.parse(raw.trim() || '[]');
  return (Array.isArray(j) ? j : [j]).map((p) => ({ pid: p.ProcessId, cmd: p.CommandLine || '' }));
}
const killPid = (pid) => { try { execSync(`taskkill /PID ${pid} /F`, { timeout: 10000, windowsHide: true }); } catch {} };

// Spawn registry — supervisor-spawned PIDs persist in .audit-work/fleet-spawns.json.
// A live recorded pid counts as present even when WMI can't see its CommandLine
// (detached spawns intermittently report null → looked "missing" → respawned
// every tick → pileup). process.kill(pid, 0) is the existence check.
const SPAWNS = '.audit-work/fleet-spawns.json';
const readSpawns = () => { try { return JSON.parse(readFileSync(SPAWNS, 'utf8')); } catch { return {}; } };
const writeSpawns = (s) => { try { writeFileSync(SPAWNS, JSON.stringify(s)); } catch {} };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };

function sliceOf(cmdline, key) {
  const m = String(cmdline).match(/--slice\s+(\d+)/);
  return m ? Number(m[1]) : -1;
}

// WS-4 — business-hours quiet mode. Same window as read-ledger's DAY_BUDGET
// (local Sun-off 07:00-19:00): the heavy spenders stop continuous loops so
// the keepers (mirror-sync, feeder, write-flusher, lanes) get the full
// 30-call/min fleet ledger to themselves. --once-capable workers get ONE
// hourly pass; the rest of the research class pauses until 19:00.
// FLEET_QUIET=0 disables.
const QUIET_MODE = process.env.FLEET_QUIET !== '0';
const quietHours = () => { const d = new Date(); return d.getDay() !== 0 && d.getHours() >= 7 && d.getHours() < 19; };
const QUIET_PASS_MS = 60 * 60000;
const QUIET_ONCE = new Set([
  'permitting-authority-verifier', 'permitting-office-researcher',
  'permitting-repair-blocked', 'permitting-review-burn',
  'permitting-ordinance-scan', 'permitting-parcel-resolver',
  'permitting-county-propagate',
]);
const QUIET_PAUSE = new Set([
  'permitting-local-resolver', 'permitting-local-researcher',
  'permitting-gap-researcher', 'permitting-headless-research',
  'permitting-parcel-discover', 'permitting-bbs-harvest',
  'permitting-office-diff',
]);
const quietPassAt = new Map(); // `key|idx` -> ts of last --once spawn

function respawnOnce(entry, idx) {
  const args = [...(typeof entry.args === 'function' ? entry.args(idx) : entry.args), '--once'];
  const child = spawn('node', args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  const spawns = readSpawns();
  spawns[`${entry.key}|${idx}|once`] = child.pid;
  writeSpawns(spawns);
  quietPassAt.set(`${entry.key}|${idx}`, Date.now());
  emit({ stage: 'fleet_quiet_pass', ok: true, detail: `${entry.key}${idx >= 0 ? ` slice ${idx}` : ''} — business-hours --once pass (pid ${child.pid})` });
}

function respawn(entry, idx) {
  const args = typeof entry.args === 'function' ? entry.args(idx) : entry.args;
  const child = spawn('node', args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  const spawns = readSpawns();
  spawns[`${entry.key}|${idx}`] = child.pid;
  writeSpawns(spawns);
  emit({ stage: 'fleet_respawn', ok: true, detail: `${entry.key}${idx >= 0 ? ` slice ${idx}` : ''} — was missing, respawned (pid ${child.pid})` });
  return child.pid;
}

emit({ stage: 'fleet_boot', ok: true, start: true, detail: `supervisor live [${PROFILE}] — ${rosterTotal} workers under watch (cap ${MAX_PROCS}), check ${CHECK_MS / 1000}s, stall ${STALL_MS / 60000}min` });

const lastEventAt = new Map(); // worker label -> ts (stall detection)
async function tick() {
  // MP-7.4 — FLEET-PAUSE: drop a `.fleet-pause` file in the repo root and
  // the supervisor stops respawning + exits, so the whole fleet winds down
  // without hunting 30 PIDs.
  if (existsSync('.fleet-pause')) { emit({ stage: 'fleet_pause', ok: true, detail: '.fleet-pause present — supervisor exiting (workers drain naturally)' }); process.exit(0); }
  let lines = [];
  try { lines = liveInstances(); } catch (e) { emit({ stage: 'fleet_error', ok: false, detail: `process listing failed: ${String(e?.message || e).slice(0, 100)}` }); return; }
  const nodeLines = lines.filter((l) => l.cmd.includes('permitting-'));
  const spawns = readSpawns();
  const spawnPresent = (key, idx) => { const pid = spawns[`${key}|${idx}`]; return pid && pidAlive(pid) ? pid : null; };
  let respawned = 0, culled = 0;
  const atCap = () => nodeLines.length + respawned >= MAX_PROCS;
  const quiet = QUIET_MODE && quietHours();
  for (const entry of ROSTER) {
    if (quiet && (QUIET_ONCE.has(entry.key) || QUIET_PAUSE.has(entry.key))) {
      // Quiet window: continuous instances of the heavy spenders are culled
      // like expected:0; --once-capable ones get a single hourly pass.
      for (const extra of nodeLines.filter((l) => l.cmd.includes(entry.key) && !l.cmd.includes('--once'))) { killPid(extra.pid); culled++; }
      if (!QUIET_ONCE.has(entry.key) || entry.expected === 0) continue;
      for (let i = 0; i < entry.expected; i++) {
        const idx = entry.expected > 1 ? i : -1;
        const k = `${entry.key}|${idx}`;
        // First quiet tick seeds a deterministic stagger so the whole quiet
        // set doesn't fire its hourly passes in the same minute.
        if (!quietPassAt.has(k)) {
          let h = idx + 7; for (const c of entry.key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
          quietPassAt.set(k, Date.now() - QUIET_PASS_MS + (h % 60) * 60000);
        }
        const passAlive = (() => { const pid = readSpawns()[`${entry.key}|${idx}|once`]; return pid && pidAlive(pid); })();
        if (!passAlive && Date.now() - quietPassAt.get(k) >= QUIET_PASS_MS && !atCap()) respawnOnce(entry, idx);
      }
      continue;
    }
    if (entry.expected === 0) {
      // Lean profile pruned this worker — kill any stragglers.
      for (const extra of nodeLines.filter((l) => l.cmd.includes(entry.key))) { killPid(extra.pid); culled++; }
      continue;
    }
    const matching = nodeLines.filter((l) => l.cmd.includes(entry.key));
    if (entry.expected === 1) {
      // Excess instances: keep the oldest (lowest pid), kill the rest.
      if (matching.length > 1) {
        for (const extra of matching.sort((a, b) => a.pid - b.pid).slice(1)) { killPid(extra.pid); culled++; }
      }
      if (!matching.length && !spawnPresent(entry.key, -1) && !atCap()) { respawn(entry, -1); respawned++; }
      continue;
    }
    const seenSlices = new Set();
    for (let i = 0; i < entry.expected; i++) {
      const sliceProcs = matching.filter((l) => sliceOf(l.cmd) === i);
      if (sliceProcs.length > 1) for (const extra of sliceProcs.sort((a, b) => a.pid - b.pid).slice(1)) { killPid(extra.pid); culled++; }
      if (sliceProcs.length) seenSlices.add(i);
      if (!sliceProcs.length && !spawnPresent(entry.key, i) && !atCap()) { respawn(entry, i); respawned++; }
    }
    // Procs with an out-of-range slice index (leftover from a bigger roster)
    // get killed too — they'd churn against partitions that no longer exist.
    for (const extra of matching) {
      const s = sliceOf(extra.cmd);
      if (s >= entry.expected || (s === -1 && entry.expected > 1)) { killPid(extra.pid); culled++; }
    }
  }
  if (culled) emit({ stage: 'fleet_cull', ok: true, detail: `killed ${culled} excess/duplicate worker(s) — roster is ${ROSTER.reduce((s, r) => s + r.expected, 0)} max` });
  // Stall detection: freshest event per worker label. Stalled = process exists
  // but emitted nothing in STALL_MS while the fleet otherwise produces events.
  try {
    const tail = readFileSync(EVENTS, 'utf8').trim().split('\n').slice(-3000);
    for (const l of tail) {
      try {
        const e = JSON.parse(l);
        if (e.worker && e.t) lastEventAt.set(e.worker, Math.max(lastEventAt.get(e.worker) || 0, e.t));
      } catch {}
    }
    const now = Date.now();
    for (const entry of ROSTER) {
      const label = entry.key.replace('permitting-', '');
      const last = lastEventAt.get(`${label}-0`) || lastEventAt.get(label) || lastEventAt.get(`${label}-1`);
      if (!last || now - last < STALL_MS) continue;
      // Only restart stalled workers whose process is alive (dead is handled above).
      const procs = nodeLines.filter((l) => l.cmd.includes(entry.key));
      if (!procs.length) continue;
      emit({ stage: 'fleet_stall', ok: false, detail: `${label} silent ${Math.round((now - last) / 60000)}min — killing for respawn` });
      try {
        for (const p of procs) killPid(p.pid);
        lastEventAt.set(label, now); // don't spam restarts while it boots
        emit({ stage: 'fleet_respawn', ok: true, detail: `${label} — stalled ${Math.round((now - last) / 60000)}min, killed for respawn` });
      } catch {}
    }
  } catch {}
  if (respawned) emit({ stage: 'fleet_respawn_batch', ok: true, detail: `${respawned} worker(s) respawned` });
}

(async () => { while (true) { await tick().catch(() => {}); await new Promise((r) => setTimeout(r, CHECK_MS)); } })()
  .catch((e) => { emit({ stage: 'fleet_error', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
