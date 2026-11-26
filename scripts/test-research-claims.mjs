// test-research-claims — shared work claims + cooldown store for the
// uncapped researcher fleet: lock exclusivity (incl. a real two-process
// race), stale reclaim, concurrent cooldown writers, slice-file migration.
// Uses a temp .audit-work dir via PERMIT_AUDIT_DIR — never touches live state.
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'ccs-claims-'));
process.env.PERMIT_AUDIT_DIR = tmp; // must land before the lib import
const { claim, releaseClaim, claimedIds, readCooldowns, writeCooldown, migrateSliceClaims, publishTargets, CLAIMS_DIR, COOLDOWN_DIR, CLAIM_TTL, TARGETS_FILE } = await import('./lib/research-claims.mjs');

// ── claim/release basics in-process (exclusivity across PROCESSES is
// proven by the race test below — claims are per-pid, so re-claiming an id
// the same process already holds is an idempotent true, not a second hold) ──
{
  assert.equal(claim('loc-1', 'local-res-0'), true);
  assert.equal(claim('loc-1', 'local-res-1'), true, 'same process = same holder → idempotent');
  assert.ok(claimedIds().has('loc-1'));
  releaseClaim('loc-1');
  assert.ok(!claimedIds().has('loc-1'), 'release frees the id');
  assert.equal(claim('loc-1', 'local-res-1'), true); // released → claimable again
  releaseClaim('loc-1');
}

// ── stale reclaim: dead pid, expired TTL, unparseable lock ───────────────
{
  const deadPid = 99999999;
  writeFileSync(`${CLAIMS_DIR}/${encodeURIComponent('loc-2')}.pid${deadPid}.lock`, JSON.stringify({ pid: deadPid, worker: 'ghost', at: new Date().toISOString() }));
  assert.equal(claim('loc-2', 'local-res-0'), true, 'dead-pid lock reclaims');
  releaseClaim('loc-2');
  // Expired TTL — a live pid whose lock outlived the TTL.
  writeFileSync(`${CLAIMS_DIR}/${encodeURIComponent('loc-3')}.pid99997.lock`, JSON.stringify({ pid: process.ppid || process.pid, worker: 'old-me', at: new Date(Date.now() - CLAIM_TTL - 1000).toISOString() }));
  assert.equal(claim('loc-3', 'local-res-0'), true, 'expired lock reclaims');
  releaseClaim('loc-3');
  // Unparseable + YOUNG = mid-write — must be treated as held, not stolen
  // (create-then-write isn't atomic on Windows; the two-racer test below
  // proves why this matters).
  const { utimesSync } = await import('node:fs');
  writeFileSync(`${CLAIMS_DIR}/${encodeURIComponent('loc-4')}.pid99996.lock`, 'not json{');
  assert.equal(claim('loc-4', 'local-res-0'), false, 'young unparseable lock is mid-write — held');
  const old = new Date(Date.now() - 60e3);
  utimesSync(`${CLAIMS_DIR}/${encodeURIComponent('loc-4')}.pid99996.lock`, old, old);
  assert.equal(claim('loc-4', 'local-res-0'), true, 'old unparseable lock reclaims');
  releaseClaim('loc-4');
}

// ── two-process race on ONE id: at most one holder, ever ─────────────────
// Each child loops: claim → while holding, re-read the lock and verify the
// recorded pid is still its own → release. Any read showing another pid is
// an exclusivity violation.
{
  mkdirSync(CLAIMS_DIR, { recursive: true });
  // Exclusivity = no two processes inside their hold interval at once.
  // Each winner logs {ev:'w',pid,at} on win and {ev:'r',pid,at} on release
  // to a shared journal; the parent checks for overlapping intervals.
  const LOG = path.join(tmp, 'race-log.jsonl');
  const child = `
    const { claim, releaseClaim } = await import('./scripts/lib/research-claims.mjs');
    import { appendFileSync } from 'node:fs';
    const id = 'race-target', me = process.pid, LOG = process.env.RACE_LOG;
    const log = (ev) => appendFileSync(LOG, JSON.stringify({ ev, pid: me, at: Date.now() }) + '\\n');
    let wins = 0;
    for (let i = 0; i < 120; i++) {
      if (!claim(id, 'racer')) { await new Promise((r) => setTimeout(r, Math.random() * 4)); continue; }
      wins++; log('w');
      await new Promise((r) => setTimeout(r, Math.random() * 6));
      releaseClaim(id); log('r');
    }
    console.log(JSON.stringify({ wins }));
  `;
  const { spawn } = await import('node:child_process');
  const race = () => new Promise((res) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', child], { cwd: process.cwd(), env: { ...process.env, RACE_LOG: LOG } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => res(JSON.parse(out.trim().split('\n').pop() || '{}')));
  });
  const [a, b] = await Promise.all([race(), race()]);
  assert.ok(a.wins > 0 && b.wins > 0, `both racers claimed work (a=${a.wins} b=${b.wins})`);
  // Interval-overlap check: an open hold must never see another process's win.
  const open = new Set(); let overlaps = 0;
  const evs = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((x, y) => x.at - y.at);
  for (const e of evs) { if (e.ev === 'w') { if (open.size) overlaps++; open.add(e.pid); } else open.delete(e.pid); }
  assert.equal(overlaps, 0, 'no two processes held the claim at the same time');
}

// ── stale lock raced by four processes: exactly one winner ───────────────
// They claim on a shared wall-clock barrier and hold while alive — a winner
// that exits instantly would be legitimately reclaimed (dead pid), which is
// not the race being tested.
{
  const id = 'stale-race';
  writeFileSync(`${CLAIMS_DIR}/${encodeURIComponent(id)}.pid99999998.lock`, JSON.stringify({ pid: 99999998, worker: 'ghost', at: new Date().toISOString() }));
  const { spawn } = await import('node:child_process');
  const barrier = Date.now() + 3000;
  const child = `
    const { claim } = await import('./scripts/lib/research-claims.mjs');
    const T = Number(process.env.BARRIER);
    while (Date.now() < T) await new Promise((r) => setTimeout(r, 15));
    // Perfectly-simultaneous creators yield to each other (zero holders,
    // never two) — the worker loop retries, so we do too, with jitter.
    let won = false;
    for (let i = 0; i < 15 && !won; i++) {
      won = claim('stale-race', 'r');
      if (!won) await new Promise((r) => setTimeout(r, Math.random() * 60));
    }
    if (won) await new Promise((r) => setTimeout(r, 1500)); // hold while alive
    console.log(won ? 'WON' : 'LOST');
  `;
  const once = () => new Promise((res) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', child], { cwd: process.cwd(), env: { ...process.env, BARRIER: String(barrier) } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => res(out.trim() === 'WON'));
  });
  const results = await Promise.all([once(), once(), once(), once()]);
  assert.equal(results.filter(Boolean).length, 1, `exactly one winner reclaiming a stale lock (got ${results.filter(Boolean).length})`);
}

// ── cooldown store: concurrent writers, per-id files, no races ───────────
{
  const { spawn } = await import('node:child_process');
  const child = `
    const { writeCooldown } = await import('./scripts/lib/research-claims.mjs');
    const me = process.env.WRITER;
    for (let i = 0; i < 25; i++) writeCooldown(me + '-key-' + i, { result: i % 2 ? 'new' : 'none', writer: me });
    console.log('done');
  `;
  const w = (id) => new Promise((res) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', child], { cwd: process.cwd(), env: { ...process.env, WRITER: id } });
    p.on('exit', () => res());
  });
  await Promise.all([w('w1'), w('w2'), w('w3'), w('w4')]);
  const cds = readCooldowns();
  assert.equal(Object.keys(cds).length, 100, 'all 100 cooldown files landed');
  assert.ok(cds['w1-key-0'].at && ['new', 'none'].includes(cds['w1-key-0'].result));
  // Same-key concurrent writes: last writer wins, always valid JSON.
  const same = `const { writeCooldown } = await import('./scripts/lib/research-claims.mjs'); for (let i = 0; i < 40; i++) writeCooldown('shared', { result: 'none', n: i, writer: process.env.WRITER }); console.log('x');`;
  const s = (id) => new Promise((res) => { const p = spawn(process.execPath, ['--input-type=module', '-e', same], { cwd: process.cwd(), env: { ...process.env, WRITER: id } }); p.on('exit', res); });
  await Promise.all([s('A'), s('B')]);
  const shared = JSON.parse(readFileSync(`${COOLDOWN_DIR}/${encodeURIComponent('shared')}.json`, 'utf8'));
  assert.ok(shared.at && ['A', 'B'].includes(shared.writer), 'shared key always parses to a whole write');
}

// ── migration: per-slice claims files fold into the shared store ─────────
{
  const old = {
    'gap-L1': { result: 'new', at: new Date(Date.now() - 60e3).toISOString() },
    'q|X': { result: 'no_site', at: new Date(Date.now() - 3600e3).toISOString() },
  };
  writeFileSync(`${tmp}/local-research-claims-0.json`, JSON.stringify(old));
  writeFileSync(`${tmp}/local-research-claims-7.json`, JSON.stringify({ 'gap-L1': { result: 'none', at: new Date(Date.now() - 120e3).toISOString() } }));
  writeFileSync(`${tmp}/gap-research-claims-3.json`, JSON.stringify({ ignored: { result: 'x', at: new Date().toISOString() } })); // other worker's file — not ours
  const n = migrateSliceClaims(tmp);
  assert.equal(n, 2, 'two distinct keys land — the older duplicate does not overwrite');
  const cds = readCooldowns();
  assert.equal(Object.keys(cds).filter((k) => ['gap-L1', 'q|X'].includes(k)).length, 2);
  assert.equal(cds['gap-L1'].result, 'new', 'newest timestamp wins across slice files');
  assert.equal(cds['q|X'].result, 'no_site');
  assert.equal(cds.ignored, undefined, "other workers' claim files untouched");
  // Idempotent: re-migration doesn't rewind a newer shared entry.
  writeCooldown('gap-L1', { result: 'none' });
  migrateSliceClaims(tmp);
  assert.equal(readCooldowns()['gap-L1'].result, 'none');
}

// ── publishTargets: the work-availability probe file ─────────────────────
{
  publishTargets({ gap: 3, queue: 12, fulfill: 40 });
  const j = JSON.parse(readFileSync(TARGETS_FILE, 'utf8'));
  assert.equal(j.gap, 3); assert.equal(j.queue, 12); assert.ok(j.at && j.pid);
}

console.log('PASS research-claims');
