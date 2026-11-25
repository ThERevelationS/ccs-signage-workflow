// scripts/test-permit-server.mjs — offline tests for the permit-server
// control plane. No network, no fleet: pure helpers + control-file state.
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'permit-server-test-'));
process.env.PERMIT_AUDIT_DIR = tmp; // must land before the lib imports

const { readControl, waitWhilePaused, heartbeat, heartbeatFile, DEFAULT_CONTROL, HEARTBEAT_DIR } = await import('./lib/server-control.mjs');
const { activeSetFor, guardLevelFor, guardPausedNames, guardNextLevel, researcherTarget, researcherStep, researcherWindow, nextBackoff, lockStale, rotateIfBig } = await import('./permit-server.mjs');

const ctl = path.join(tmp, 'server-control.json');
const writeCtl = (o) => writeFileSync(ctl, JSON.stringify({ ...DEFAULT_CONTROL, ...o, updated_at: new Date().toISOString() }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── control file defaults + restore ──────────────────────────────────────
{
  const c = readControl(ctl); // missing file → defaults
  assert.equal(c.state, 'running'); assert.equal(c.verification, true);
  assert.equal(c.expansion, false); assert.equal(c.expansion_locked, true);
  writeCtl({ state: 'paused', verification: false });
  await sleep(20);
  const c2 = readControl(ctl); // restore: same fields a controller restart reads
  assert.equal(c2.state, 'paused'); assert.equal(c2.verification, false); assert.equal(c2.expansion_locked, true);
}

// ── active set / state machine ───────────────────────────────────────────
{
  const run = { state: 'running', verification: true, expansion: false, expansion_locked: true };
  const active = activeSetFor(run);
  assert.equal(active.length, 23); // dash + flusher + mirror + 16 local-res + seed + verifier + hygiene + profile-relink
  assert.ok(active.includes('write-flusher') && active.includes('local-res-15') && active.includes('dashboard'));
  assert.ok(!active.includes('office-sweep-0') && !active.includes('forever-runner'));
  // paused keeps the same process set — workers self-idle, none are killed
  assert.deepEqual(activeSetFor({ ...run, state: 'paused' }).sort(), active.sort());
  // stopped leaves only the dashboard so the UI can start it again
  assert.deepEqual(activeSetFor({ ...run, state: 'stopped' }), ['dashboard']);
  // expansion ON but locked → still excluded; unlocked → included
  const locked = activeSetFor({ ...run, expansion: true, expansion_locked: true });
  assert.ok(!locked.includes('office-sweep-0'));
  const open = activeSetFor({ ...run, expansion: true, expansion_locked: false });
  assert.equal(open.length, 29);
  assert.ok(open.includes('office-sweep-3') && open.includes('parcel-resolver') && open.includes('forever-runner'));
  // verification OFF drops its whole group, keeps core
  const off = activeSetFor({ ...run, verification: false });
  assert.ok(!off.includes('local-res-0') && !off.includes('authority-verifier') && off.includes('write-flusher'));
  // researcherAllowed culls slices outside the adaptive window — they leave
  // the active set entirely so reconcile stops (not pauses) them.
  const win = researcherWindow(0, 5);
  const culled = activeSetFor(run, undefined, win.names);
  const culledRes = culled.filter((n) => /^local-res-/.test(n));
  assert.deepEqual(culledRes.sort(), [...win.names].sort());
  assert.equal(culledRes.length, 5);
  assert.equal(culled.length, 23 - 16 + 5); // window replaces the full slice set
  assert.ok(culled.includes('authority-verifier') && culled.includes('write-flusher'));
  // empty window (guard L1+) → no researcher processes at all
  assert.equal(activeSetFor(run, undefined, []).filter((n) => /^local-res-/.test(n)).length, 0);
  // null → legacy behavior, all slices
  assert.equal(activeSetFor(run, undefined, null).filter((n) => /^local-res-/.test(n)).length, 16);
}

// ── resource guard thresholds + stepped hysteresis ───────────────────────
{
  const GB = 1024 ** 3;
  assert.equal(guardLevelFor(9 * GB), 0);
  assert.equal(guardLevelFor(4 * GB), 0);   // ≥3.5GB → clear
  assert.equal(guardLevelFor(3 * GB), 1);   // <3.5GB → researchers pause
  assert.equal(guardLevelFor(1.2 * GB), 2); // <1.5GB → all but flusher
  assert.equal(guardLevelFor(NaN), 0);
  // L1 pauses NOTHING — researchers are culled from the spawn set instead
  // (a paused slice still holds ~500MB; stopping it releases the pressure).
  assert.deepEqual(guardPausedNames(1), []);
  const l2 = guardPausedNames(2);
  // L2 pauses non-researcher workers only: flusher + dashboard exempt,
  // researchers stopped not paused.
  assert.equal(l2.length, 5); // mirror-sync + seed-scan + verifier + hygiene + profile-relink
  assert.ok(!l2.includes('write-flusher') && !l2.includes('dashboard') && !l2.includes('local-res-3') && !l2.includes('office-sweep-1'));
  assert.ok(l2.includes('mirror-sync') && l2.includes('authority-verifier'));
  // step-up is immediate at any depth
  assert.equal(guardNextLevel(0, 3 * GB, 0).level, 1);
  assert.equal(guardNextLevel(1, 1.2 * GB, 0).level, 2);
  assert.equal(guardNextLevel(0, 1.2 * GB, 0).level, 2);
  // holding at the current level resets the recovery streak
  assert.deepEqual(guardNextLevel(2, 1.4 * GB, 3).level, 2);
  assert.equal(guardNextLevel(2, 1.4 * GB, 3).streak, 0);
  // step-down 2→1 needs >3.5GB for 4 ticks (60s)
  assert.equal(guardNextLevel(2, 4 * GB, 0).level, 2);
  assert.equal(guardNextLevel(2, 4 * GB, 0).streak, 1);
  assert.equal(guardNextLevel(2, 4 * GB, 3).level, 1); // 4th sustained tick releases to L1
  // …but not while free sits in the L1 band
  assert.equal(guardNextLevel(2, 2 * GB, 3).level, 2);
  // step-down 1→0 needs >5GB for 8 ticks (120s)
  assert.equal(guardNextLevel(1, 5.5 * GB, 6).level, 1);
  assert.equal(guardNextLevel(1, 5.5 * GB, 7).level, 0);
  assert.equal(guardNextLevel(1, 4.5 * GB, 7).level, 1); // 4.5GB isn't >5GB — held
  // sequential full release: 2→1 at 60s, then 1→0 at 120s
  assert.equal(guardNextLevel(2, 6 * GB, 3).level, 1);
  assert.equal(guardNextLevel(1, 6 * GB, 7).level, 0);
  // re-trip mid-recovery resets the streak
  assert.equal(guardNextLevel(2, 1.2 * GB, 2).level, 2);
  assert.equal(guardNextLevel(2, 1.2 * GB, 2).streak, 0);
}

// ── adaptive researcher window ───────────────────────────────────────────
{
  const GB = 1024 ** 3, MB = 1024 ** 2;
  // clamp(floor((free−4GB)/avgRss), 2, 16)
  assert.equal(researcherTarget(12 * GB, 400 * MB), 16);              // 8GB/400MB=20 → cap
  assert.equal(researcherTarget(6 * GB, 400 * MB), 5);                // 2GB/400MB=5
  assert.equal(researcherTarget(4.1 * GB, 400 * MB), 2);              // ~0 → floor 2
  assert.equal(researcherTarget(9 * GB, NaN), Math.floor(5 * GB / (500 * MB))); // unmeasured → 500MB default
  // ±2/min rate limit toward target, clamped to [2,16]
  assert.equal(researcherStep(16, 6), 14);
  assert.equal(researcherStep(2, 16), 4);
  assert.equal(researcherStep(14, 14), 14);
  assert.equal(researcherStep(3, 1), 2);   // can't go below the floor
  assert.equal(researcherStep(15, 99), 16); // can't exceed total
  assert.equal(researcherStep(undefined, 7), 14); // unmeasured starts at total, steps ±2
  // rotation: contiguous wrap-around window, start advances by allowed per epoch
  const E = 10 * 60 * 1000;
  const w1 = researcherWindow(7 * E, 5);
  assert.equal(w1.start, (7 * 5) % 16); // =3
  assert.deepEqual(w1.names, ['local-res-3', 'local-res-4', 'local-res-5', 'local-res-6', 'local-res-7']);
  const w2 = researcherWindow(7 * E, 13); // start = 91 % 16 = 11 → wraps
  assert.equal(w2.start, 11);
  assert.equal(w2.names.length, 13);
  assert.deepEqual(w2.names.slice(0, 5), ['local-res-11', 'local-res-12', 'local-res-13', 'local-res-14', 'local-res-15']);
  assert.equal(w2.names[5], 'local-res-0'); // wrapped to slice 0
  // every slice is covered across a full rotation cycle
  const covered = new Set();
  for (let e = 0; e < 16; e++) researcherWindow(e * E, 5).names.forEach((n) => covered.add(n));
  assert.equal(covered.size, 16);
}

// ── restart backoff ──────────────────────────────────────────────────────
{
  assert.equal(nextBackoff(0, 0), 2000); // floor 1s, doubles per crash
  assert.equal(nextBackoff(1000, 0), 2000);
  assert.equal(nextBackoff(32000, 60000), 60000); // cap
  assert.equal(nextBackoff(32000, 5 * 60 * 1000 + 1), 1000); // 5min healthy → reset
}

// ── waitWhilePaused: pause → resume → stopped → guard ───────────────────
{
  mkdirSync(HEARTBEAT_DIR, { recursive: true });
  writeCtl({ state: 'running' });
  const t0 = Date.now();
  const c = await waitWhilePaused('test-worker', { controlFile: ctl, pollMs: 40 });
  assert.equal(c.state, 'running');
  assert.ok(Date.now() - t0 < 1000);
  let hb = JSON.parse(readFileSync(heartbeatFile('test-worker'), 'utf8'));
  assert.equal(hb.state, 'busy'); assert.equal(hb.pid, process.pid);

  // paused blocks until a resume lands
  writeCtl({ state: 'paused' });
  await sleep(30);
  let resolved = false;
  const p = waitWhilePaused('test-worker', { controlFile: ctl, pollMs: 40 }).then((r) => { resolved = true; return r; });
  await sleep(200);
  assert.equal(resolved, false);
  hb = JSON.parse(readFileSync(heartbeatFile('test-worker'), 'utf8'));
  assert.equal(hb.state, 'idle');
  writeCtl({ state: 'running' });
  const r = await p;
  assert.equal(r.state, 'running'); assert.equal(resolved, true);

  // guard_paused named worker idles even while running
  writeCtl({ state: 'running', guard_paused: ['test-worker'] });
  await sleep(30);
  resolved = false;
  const p2 = waitWhilePaused('test-worker', { controlFile: ctl, pollMs: 40 }).then(() => { resolved = true; });
  await sleep(180);
  assert.equal(resolved, false);
  writeCtl({ state: 'running', guard_paused: [] });
  await p2; assert.equal(resolved, true);

  // stopped → onStopped fires instead of resolving
  writeCtl({ state: 'stopped' });
  await sleep(30);
  const stopped = await waitWhilePaused('test-worker', { controlFile: ctl, pollMs: 40, onStopped: (cc) => 'STOP:' + cc.state });
  assert.equal(stopped, 'STOP:stopped');
}

// ── lock stale detection ─────────────────────────────────────────────────
{
  const lock = path.join(tmp, 'permit-server.lock');
  assert.equal(lockStale(lock), false); // absent → free
  const dead = spawnSync(process.execPath, ['-e', '0']).pid; // exited → dead pid
  writeFileSync(lock, JSON.stringify({ pid: dead, at: new Date().toISOString() }));
  assert.equal(lockStale(lock), true);
  writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  assert.equal(lockStale(lock), false); // our own pid — held, not stale
}

// ── log rotation (keep 3) ────────────────────────────────────────────────
{
  const f = path.join(tmp, 'worker.log');
  for (let i = 0; i < 4; i++) {
    writeFileSync(f, `pass ${i} `.repeat(60));
    rotateIfBig(f, 200);
    await sleep(15);
  }
  assert.ok(existsSync(`${f}.1`)); assert.ok(existsSync(`${f}.2`));
  assert.ok(!existsSync(`${f}.3`)); // oldest evicted — exactly 3 kept
  assert.ok(readFileSync(`${f}.1`, 'utf8').includes('pass 3')); // newest rotation has the last pass
}

// ── heartbeat round-trip ─────────────────────────────────────────────────
{
  heartbeat('hb-test', 'busy', 'item x');
  const hb = JSON.parse(readFileSync(heartbeatFile('hb-test'), 'utf8'));
  assert.equal(hb.state, 'busy'); assert.equal(hb.item, 'item x'); assert.ok(hb.at);
}

console.log('PASS permit-server');
