// scripts/test-permit-server.mjs — offline tests for the permit-server
// control plane. No network, no fleet: pure helpers + control-file state.
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'permit-server-test-'));
process.env.PERMIT_AUDIT_DIR = tmp; // must land before the lib imports

const { readControl, waitWhilePaused, heartbeat, heartbeatFile, DEFAULT_CONTROL, HEARTBEAT_DIR, _resetCacheForTests } = await import('./lib/server-control.mjs');
const { activeSetFor, guardPausedNames, isEmergency, pressureDeficit, downScaleCount, spawnMarginsOk, maySpawnResearcher, spawnHoldReason, workAvailable, idleCullList, cpuAvg30, researcherCap, nextSliceIndex, memoryAllowance, admitResearcher, cullOrder, reserveBytesOf, fleetBudgetBytesOf, nextBackoff, lockStale, rotateIfBig, isCrashLoop, applyAuditReversal } = await import('./permit-server.mjs');

const ctl = path.join(tmp, 'server-control.json');
const writeCtl = (o) => { writeFileSync(ctl, JSON.stringify({ ...DEFAULT_CONTROL, ...o, updated_at: new Date().toISOString() })); _resetCacheForTests(); };
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

// ── audit/adjudication reversal shape ────────────────────────────────────
{
  const before = { id: 'o1', name: 'Electrical inspection office', authority_roles: ['electrical_inspection'], authority_verification_status: 'needs_verification' };
  const other = { id: 'o2', name: 'County Building Department', authority_roles: ['building'] };
  const live = { offices: [other], archived_offices: [{ ...before, authority_roles: [], retired_reason: 'covered elsewhere' }] };
  const r = applyAuditReversal(live, { action: 'adjudicate_resolution', office_id: 'o1', before_office: before, office_index: 0 });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.offices.map((o) => o.id), ['o1', 'o2']);
  assert.equal(r.offices[0].authority_roles[0], 'electrical_inspection');
  assert.equal(r.archived_offices.length, 0); // archived copy is consumed by restoration
  const renamed = applyAuditReversal({ offices: [{ id: 'o1', name: 'Planning Commission' }] }, { action: 'rename', office_id: 'o1', before_name: 'Planning Planning Commission' });
  assert.equal(renamed.offices[0].name, 'Planning Planning Commission');
  const missing = applyAuditReversal({ offices: [{ id: 'x' }] }, { action: 'demote', office_id: 'o1' });
  assert.equal(missing.error, 'office not on the live record');
}

// ── active set / state machine ───────────────────────────────────────────
{
  const run = { state: 'running', verification: true, expansion: false, expansion_locked: true };
  const active = activeSetFor(run);
  assert.equal(active.length, 75); // dash + flusher + mirror + 64 local-res slots + seed + verifier + hygiene + profile-relink + ai-extractor + ai-auditor + recheck-relabel + judge-retro
  assert.ok(active.includes('write-flusher') && active.includes('local-res-15') && active.includes('local-res-63') && active.includes('dashboard'));
  assert.ok(!active.includes('office-sweep-0') && !active.includes('forever-runner'));
  // needs_recheck flag off → the relabel worker stays dormant
  const dormant = activeSetFor({ ...run, needs_recheck: false });
  assert.ok(!dormant.includes('recheck-relabel') && !dormant.includes('judge-retro'));
  // paused keeps the same process set — workers self-idle, none are killed
  assert.deepEqual(activeSetFor({ ...run, state: 'paused' }).sort(), active.sort());
  // stopped leaves only the dashboard so the UI can start it again
  assert.deepEqual(activeSetFor({ ...run, state: 'stopped' }), ['dashboard']);
  // expansion ON but locked → still excluded; unlocked → included
  const locked = activeSetFor({ ...run, expansion: true, expansion_locked: true });
  assert.ok(!locked.includes('office-sweep-0'));
  const open = activeSetFor({ ...run, expansion: true, expansion_locked: false });
  assert.equal(open.length, 81);
  assert.ok(open.includes('office-sweep-3') && open.includes('parcel-resolver') && open.includes('forever-runner'));
  // verification OFF drops its whole group, keeps core
  const off = activeSetFor({ ...run, verification: false });
  assert.ok(!off.includes('local-res-0') && !off.includes('authority-verifier') && off.includes('write-flusher'));
  // ai_extract / ai_audit flags drop only their own worker (default on)
  const noExtract = activeSetFor({ ...run, ai_extract: false });
  assert.ok(!noExtract.includes('ai-extractor') && noExtract.includes('ai-auditor'));
  const noAudit = activeSetFor({ ...run, ai_audit: false });
  assert.ok(!noAudit.includes('ai-auditor') && noAudit.includes('ai-extractor'));
  // researcherAllowed culls slots outside the wanted set — they leave
  // the active set entirely so reconcile stops (not pauses) them.
  const wanted = ['local-res-3', 'local-res-4', 'local-res-5', 'local-res-6', 'local-res-7'];
  const culled = activeSetFor(run, undefined, wanted);
  const culledRes = culled.filter((n) => /^local-res-/.test(n));
  assert.deepEqual(culledRes.sort(), [...wanted].sort());
  assert.equal(culledRes.length, 5);
  assert.equal(culled.length, 75 - 64 + 5); // window replaces the full slot set
  assert.ok(culled.includes('authority-verifier') && culled.includes('write-flusher'));
  // empty wanted set → no researcher processes at all
  assert.equal(activeSetFor(run, undefined, []).filter((n) => /^local-res-/.test(n)).length, 0);
  // null → legacy behavior, all slots
  assert.equal(activeSetFor(run, undefined, null).filter((n) => /^local-res-/.test(n)).length, 64);
}

// ── emergency + pause set ────────────────────────────────────────────────
{
  const GB = 1024 ** 3;
  // emergency: free <1.5GB OR commit headroom <1.5GB — either one trips it
  assert.equal(isEmergency(9 * GB, null), false);
  assert.equal(isEmergency(1.2 * GB, null), true);
  assert.equal(isEmergency(9 * GB, 1.4 * GB), true);   // commit exhaustion
  assert.equal(isEmergency(9 * GB, 2 * GB), false);
  // the pause set: non-researcher workers only — flusher + dashboard exempt,
  // researchers are culled from the spawn set, never paused
  const l2 = guardPausedNames(2);
  assert.equal(l2.length, 9); // mirror-sync + seed-scan + verifier + hygiene + profile-relink + ai-extractor + ai-auditor + recheck-relabel + judge-retro
  assert.ok(!l2.includes('write-flusher') && !l2.includes('dashboard') && !l2.includes('local-res-3') && !l2.includes('office-sweep-1'));
  assert.ok(l2.includes('mirror-sync') && l2.includes('authority-verifier'));
}

// ── scale-down: pressure deficit + cull count ────────────────────────────
{
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const base = { freeBytes: 8 * GB, reserveBytes: 4 * GB, commitHeadroomBytes: 10 * GB, fleetRssBytes: 4 * GB, budgetBytes: 12 * GB };
  assert.ok(pressureDeficit(base) < 0);                                          // all margins clean
  assert.equal(pressureDeficit({ ...base, freeBytes: 3 * GB }), 1 * GB);         // free under reserve
  assert.equal(pressureDeficit({ ...base, commitHeadroomBytes: 2 * GB }), 1 * GB); // headroom <3GB
  assert.equal(pressureDeficit({ ...base, commitHeadroomBytes: null }), -4 * GB); // missing headroom ignored for cull → max(−4, −∞, −8)
  assert.equal(pressureDeficit({ ...base, fleetRssBytes: 13 * GB }), 1 * GB);    // over budget
  // the worst margin wins
  assert.equal(pressureDeficit({ ...base, freeBytes: 3.5 * GB, fleetRssBytes: 14 * GB }), 2 * GB);
  // cull count: ceil(deficit / avgRss), 0 at/under zero deficit
  assert.equal(downScaleCount(1.1 * GB, 500 * MB), 3);   // 2.2 → 3
  assert.equal(downScaleCount(1 * GB, 512 * MB), 2);     // exact fit → no over-cull
  assert.equal(downScaleCount(0.4 * GB, 500 * MB), 1);   // small dip → 1, not all
  assert.equal(downScaleCount(0, 500 * MB), 0);
  assert.equal(downScaleCount(-2 * GB, 500 * MB), 0);
  assert.equal(downScaleCount(1 * GB, NaN), 3);          // unmeasured → 500MB default: 1024/500 → 3
  // emergency → deficit is reserve − free ≥ ~2.5GB → ~5+ culls per tick,
  // draining fast without waiting
  assert.ok(downScaleCount(pressureDeficit({ ...base, freeBytes: 1.2 * GB }), 500 * MB) >= 5);
}

// ── scale-up gate: margins + pacing + settle ─────────────────────────────
{
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const margins = { freeBytes: 8 * GB, reserveBytes: 4 * GB, commitHeadroomBytes: 10 * GB, fleetRssBytes: 4 * GB, budgetBytes: 12 * GB, avgRssBytes: 500 * MB };
  // spawnMarginsOk: free − rss ≥ reserve + 1GB cushion
  assert.equal(spawnMarginsOk(margins), true);                            // 8−0.5 ≥ 5
  assert.equal(spawnMarginsOk({ ...margins, freeBytes: 5.4 * GB }), false); // 5.4−0.5 < 5
  assert.equal(spawnMarginsOk({ ...margins, freeBytes: 5.5 * GB }), true);  // 5.5−0.5 = 5
  // commit headroom − rss ≥ 4GB; a missing reading fails closed
  assert.equal(spawnMarginsOk({ ...margins, commitHeadroomBytes: 4.4 * GB }), false); // 4.4−0.5 < 4
  assert.equal(spawnMarginsOk({ ...margins, commitHeadroomBytes: 4.5 * GB }), true);
  assert.equal(spawnMarginsOk({ ...margins, commitHeadroomBytes: null }), false);
  // fleet + rss ≤ budget
  assert.equal(spawnMarginsOk({ ...margins, fleetRssBytes: 11.6 * GB }), false); // 11.6+0.5 > 12
  assert.equal(spawnMarginsOk({ ...margins, fleetRssBytes: 11.5 * GB }), true);
  // pacing: at most one spawn per 10s
  const ok = { ...margins, now: 100000, lastSpawnAt: null, lastSpawnAliveMs: null };
  assert.equal(maySpawnResearcher(ok), true);
  assert.equal(maySpawnResearcher({ ...ok, lastSpawnAt: 95000 }), false);   // 5s ago
  assert.equal(maySpawnResearcher({ ...ok, lastSpawnAt: 90000 }), true);    // 10s ago
  // settle: previous spawn alive <10s blocks (RSS not measured yet)
  assert.equal(maySpawnResearcher({ ...ok, lastSpawnAliveMs: 4000 }), false);
  assert.equal(maySpawnResearcher({ ...ok, lastSpawnAliveMs: 11000 }), true);
  // no flapping: between reserve and reserve+1GB nothing culls AND nothing
  // spawns — the oscillating band is a dead zone both ways
  const band = { ...margins, freeBytes: 4.4 * GB };
  assert.ok(pressureDeficit({ freeBytes: band.freeBytes, reserveBytes: 4 * GB, commitHeadroomBytes: 10 * GB, fleetRssBytes: 4 * GB, budgetBytes: 12 * GB }) <= 0);
  assert.equal(spawnMarginsOk(band), false);
}

// ── uncapped up-scale gate: every gate can hold, in order ────────────────
{
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const ok = { freeBytes: 8 * GB, reserveBytes: 4 * GB, commitHeadroomBytes: 10 * GB, fleetRssBytes: 4 * GB, budgetBytes: 12 * GB, avgRssBytes: 500 * MB, cpuPct: 30, workAvail: 40, liveCount: 10, now: 100000, lastSpawnAt: null, lastSpawnAliveMs: null };
  assert.equal(spawnHoldReason(ok), null);                                  // all gates pass
  assert.equal(spawnHoldReason({ ...ok, freeBytes: 5 * GB }), 'memory');    // 5−0.5 < 5
  assert.equal(spawnHoldReason({ ...ok, commitHeadroomBytes: null }), 'memory'); // missing probe fails closed
  assert.equal(spawnHoldReason({ ...ok, fleetRssBytes: 12 * GB }), 'memory');
  assert.equal(spawnHoldReason({ ...ok, cpuPct: 86 }), 'cpu');              // >85 blocks
  assert.equal(spawnHoldReason({ ...ok, cpuPct: 85 }), null);               // 85 is the limit, not over it
  assert.equal(spawnHoldReason({ ...ok, cpuPct: null }), null);             // missing CPU reading fails open
  assert.equal(spawnHoldReason({ ...ok, workAvail: 10, liveCount: 10 }), 'work'); // fleet outnumbers work
  assert.equal(spawnHoldReason({ ...ok, workAvail: 0, liveCount: 0 }), 'work');   // nothing claimable → nothing to add
  assert.equal(spawnHoldReason({ ...ok, workAvail: null }), null);          // stale/missing probe fails open (bootstrap)
  assert.equal(spawnHoldReason({ ...ok, lastSpawnAt: 95000 }), 'pace');     // 5s since last spawn
  assert.equal(spawnHoldReason({ ...ok, lastSpawnAliveMs: 4000 }), 'pace'); // previous spawn not settled
  // memory wins over the later gates when several fail at once
  assert.equal(spawnHoldReason({ ...ok, freeBytes: 1 * GB, cpuPct: 99, workAvail: 0 }), 'memory');
  assert.equal(spawnHoldReason({ ...ok, cpuPct: 99, workAvail: 0 }), 'cpu');
}

// ── work availability probe + rolling CPU average + idle cull ────────────
{
  const now = Date.now();
  const tf = path.join(tmp, 'targets.json');
  writeFileSync(tf, JSON.stringify({ at: now, gap: 3, queue: 12, fulfill: 40 }));
  assert.equal(workAvailable(now, tf), 19);     // 3+12+min(40,4)
  writeFileSync(tf, JSON.stringify({ at: now, gap: 0, queue: 0, fulfill: 2 }));
  assert.equal(workAvailable(now, tf), 2);      // fulfill alone still counts (small)
  writeFileSync(tf, JSON.stringify({ at: now - 61e3, gap: 50, queue: 50 }));
  assert.equal(workAvailable(now, tf), null);   // stale probe → unknown → fail open
  assert.equal(workAvailable(now, path.join(tmp, 'missing.json')), null);
  // rolling 30s CPU average
  const samples = [{ t: now - 40e3, pct: 90 }, { t: now - 10e3, pct: 80 }, { t: now - 2e3, pct: 70 }];
  assert.equal(Math.round(cpuAvg30(now, samples)), 75);          // old sample dropped
  assert.equal(cpuAvg30(now, [{ t: now - 31e3, pct: 99 }]), null); // nothing in window → unknown
  // idle cull: heartbeats idle ≥2min on 'no work', newest-spawned first —
  // a paused fleet ('paused'/'stopped'/'memory guard' items) never triggers it
  const rec = (n, startedAt) => ({ spec: { name: `local-res-${n}` }, startedAt });
  const hbs = { 'local-res-1': { state: 'idle', item: 'no work', at: new Date(now - 3 * 60e3).toISOString() }, 'local-res-2': { state: 'busy', at: new Date(now - 30e3).toISOString() }, 'local-res-3': { state: 'idle', item: 'no work', at: new Date(now - 90e3).toISOString() }, 'local-res-4': { state: 'idle', item: 'no work', at: new Date(now - 5 * 60e3).toISOString() }, 'local-res-5': { state: 'idle', item: 'paused', at: new Date(now - 10 * 60e3).toISOString() } };
  const victims = idleCullList([rec(1, 100), rec(2, 200), rec(3, 300), rec(4, 400), rec(5, 500)], (n) => hbs[n], now);
  assert.deepEqual(victims.map((r) => r.spec.name), ['local-res-4', 'local-res-1']); // newest first; 90s idle + paused-worker skipped
  assert.equal(idleCullList([rec(2, 200)], (n) => hbs[n], now).length, 0); // busy workers never culled
}

// ── researcher cap + slot rotation pointer ───────────────────────────────
{
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const ctl = { researchers: { mode: 'auto', max: 16, disabled: [] }, limits: { reserve_gb: 4 } };
  // auto = UNCAPPED up to the 64 safety ceiling — memory/CPU/work gates
  // decide the real count. Manual = exactly the user's count. killall = 0.
  assert.equal(researcherCap(ctl), 64);
  assert.equal(researcherCap({ ...ctl, researchers: { mode: 'auto', max: 4 } }), 64); // auto ignores max
  assert.equal(researcherCap({ ...ctl, researchers: { mode: 'manual', max: 8 } }), 8);
  assert.equal(researcherCap({ ...ctl, researchers: { mode: 'manual', max: 200 } }), 64); // clamped to ceiling
  assert.equal(researcherCap({ ...ctl, researchers: { mode: 'manual', max: 0 } }), 0);
  assert.equal(researcherCap({ ...ctl, researchers: { mode: 'auto', max: 16, killall: true } }), 0); // kill-all pins 0
  assert.equal(researcherCap({}), 64); // defaults = auto
  // memoryAllowance — display estimate of what memory could host
  assert.equal(memoryAllowance(12 * GB, 400 * MB, 4 * GB), 20);   // 8GB/400MB=20 — no cap under 64
  assert.equal(memoryAllowance(200 * GB, 400 * MB, 4 * GB), 64);  // ceiling still applies
  assert.equal(memoryAllowance(6 * GB, 400 * MB, 4 * GB), 5);     // 2GB/400MB=5
  assert.equal(memoryAllowance(4.1 * GB, 400 * MB, 4 * GB), 0);
  assert.equal(memoryAllowance(9 * GB, NaN, 4 * GB), 10);         // unmeasured → 500MB default
  assert.equal(reserveBytesOf({ limits: { reserve_gb: 6 } }), 6 * GB);
  assert.equal(reserveBytesOf({ limits: { reserve_gb: 99 } }), 10 * GB); // clamped
  assert.equal(reserveBytesOf({}), 4 * GB);
  assert.equal(fleetBudgetBytesOf({}), 12 * GB);
  // plain reserve admission (expansion researchers)
  assert.equal(admitResearcher(5 * GB, 400 * MB, 4 * GB), true);
  assert.equal(admitResearcher(4.2 * GB, 400 * MB, 4 * GB), false);
  assert.equal(admitResearcher(4.5 * GB, NaN, 4 * GB), true);
  // newest-first cull order (pressure + budget drains)
  const rs = (n, t) => ({ spec: { name: `local-res-${n}` }, startedAt: t });
  assert.deepEqual(cullOrder([rs(0, 100), rs(5, 400), rs(9, 200)]).map((r) => r.spec.name), ['local-res-5', 'local-res-9', 'local-res-0']);
  // rotation pointer: next index skipping wanted/disabled/blocked, wraps
  const taken = new Set(['local-res-3']);
  assert.equal(nextSliceIndex(0, taken, new Set(), new Set()), 0);
  assert.equal(nextSliceIndex(3, taken, new Set(), new Set()), 4); // skips index 3
  assert.equal(nextSliceIndex(15, taken, new Set(), new Set()), 15);
  assert.equal(nextSliceIndex(15, new Set(['local-res-15']), new Set(), new Set()), 16); // next free slot
  assert.equal(nextSliceIndex(63, new Set(['local-res-63']), new Set(), new Set()), 0); // wraps at the ceiling
  assert.equal(nextSliceIndex(0, new Set(), new Set(['local-res-0']), new Set()), 1);   // disabled skipped
  assert.equal(nextSliceIndex(0, new Set(), new Set(), new Set(['local-res-0'])), 1);   // mem-blocked skipped
  const all = new Set(Array.from({ length: 64 }, (_, i) => `local-res-${i}`));
  assert.equal(nextSliceIndex(0, all, new Set(), new Set()), -1);
  assert.equal(nextSliceIndex(0, new Set(Array.from({ length: 16 }, (_, i) => `local-res-${i}`)), new Set(), new Set()), 16); // slots go past 16 now
  // pointer walk covers all 16 slices — every slice gets runtime
  const covered = new Set(); const t2 = new Set();
  for (let p = 0, i = 0; i < 16; i++) { const idx = nextSliceIndex(p, t2, new Set(), new Set()); covered.add(idx); t2.add(`local-res-${idx}`); p = idx + 1; }
  assert.equal(covered.size, 16);
}

// ── user-stopped workers excluded from the active set ────────────────────
{
  const run = { state: 'running', verification: true, expansion: false, expansion_locked: true };
  const stopped = activeSetFor({ ...run, stopped_workers: ['seed-scan', 'queue-hygiene'] });
  assert.ok(!stopped.includes('seed-scan') && !stopped.includes('queue-hygiene') && stopped.includes('authority-verifier'));
}

// ── control file: researcher/limit fields persist ────────────────────────
{
  writeCtl({ researchers: { mode: 'manual', max: 7, disabled: ['local-res-3'] }, stopped_workers: ['seed-scan'], limits: { reserve_gb: 6, fleet_budget_gb: 8 } });
  await sleep(20);
  const c = readControl(ctl);
  assert.equal(c.researchers.mode, 'manual'); assert.equal(c.researchers.max, 7);
  assert.deepEqual(c.researchers.disabled, ['local-res-3']);
  assert.deepEqual(c.stopped_workers, ['seed-scan']);
  assert.equal(c.limits.reserve_gb, 6); assert.equal(c.limits.fleet_budget_gb, 8);
  writeCtl({ researchers: { mode: 'auto', max: 16, disabled: [] }, stopped_workers: [], limits: { reserve_gb: 4, fleet_budget_gb: 12 } }); // restore
}

// ── restart backoff ──────────────────────────────────────────────────────
{
  assert.equal(nextBackoff(0, 0), 2000); // floor 1s, doubles per crash
  assert.equal(nextBackoff(1000, 0), 2000);
  assert.equal(nextBackoff(32000, 60000), 60000); // cap
  assert.equal(nextBackoff(32000, 5 * 60 * 1000 + 1), 1000); // 5min healthy → reset
  // Crash-loop detector: exactly 3 unexpected exits inside 5min quarantines.
  const now = Date.now();
  assert.equal(isCrashLoop([now - 1000, now - 2000], now), false);
  assert.equal(isCrashLoop([now - 1000, now - 2000, now - 3000], now), true);
  assert.equal(isCrashLoop([now - 1000, now - 2000, now - 6 * 60 * 1000], now), false);
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
