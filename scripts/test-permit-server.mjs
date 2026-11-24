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
const { activeSetFor, guardLevelFor, guardPausedNames, guardNextLevel, nextBackoff, lockStale, rotateIfBig } = await import('./permit-server.mjs');

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
  assert.equal(active.length, 22); // dash + flusher + mirror + 16 local-res + seed + verifier + hygiene
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
  assert.equal(open.length, 28);
  assert.ok(open.includes('office-sweep-3') && open.includes('parcel-resolver') && open.includes('forever-runner'));
  // verification OFF drops its whole group, keeps core
  const off = activeSetFor({ ...run, verification: false });
  assert.ok(!off.includes('local-res-0') && !off.includes('authority-verifier') && off.includes('write-flusher'));
}

// ── resource guard thresholds + hysteresis ───────────────────────────────
{
  const GB = 1024 ** 3;
  assert.equal(guardLevelFor(9 * GB), 0);
  assert.equal(guardLevelFor(5.5 * GB), 1);
  assert.equal(guardLevelFor(2 * GB), 2);
  assert.equal(guardLevelFor(NaN), 0);
  const l1 = guardPausedNames(1);
  assert.ok(l1.includes('local-res-3') && l1.includes('office-sweep-1') && l1.includes('forever-runner') && l1.includes('parcel-resolver'));
  assert.ok(!l1.includes('write-flusher') && !l1.includes('mirror-sync') && !l1.includes('authority-verifier') && !l1.includes('dashboard') && !l1.includes('seed-scan'));
  const l2 = guardPausedNames(2);
  assert.equal(l2.length, 26); // everything except flusher + dashboard
  assert.ok(!l2.includes('write-flusher') && !l2.includes('dashboard'));
  // hysteresis: rising pressure trips instantly; clearing needs 8 samples >8GB
  assert.equal(guardNextLevel(0, 5 * GB, 0).level, 1);
  assert.equal(guardNextLevel(1, 9 * GB, 3).level, 1); // still held — streak too short
  assert.equal(guardNextLevel(1, 9 * GB, 7).level, 0); // 8th high sample clears
  assert.equal(guardNextLevel(1, 2 * GB, 7).level, 2); // worse pressure overrides instantly
  assert.equal(guardNextLevel(2, 9 * GB, 0).highStreak, 1); // streak counting up
  assert.equal(guardNextLevel(2, 7 * GB, 5).highStreak, 0); // below high-water resets the streak
  assert.equal(guardNextLevel(2, 7 * GB, 5).level, 2); // …and stays paused — only level 0 resumes
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
