#!/usr/bin/env node
// Forever runner — continuous permitting-address validation until killed.
//
// Each cycle rebuilds the retry pool from .live-events.jsonl: every fixture
// address whose LATEST stage is retryable (needs_review + all failure stages)
// or that has never been processed. Resolved/terminal stages are skipped —
// a needs_review flag gets re-attempted forever, which is exactly what makes
// rule mints and newly-researched offices convert flags into resolutions
// without a human touching the queue.
//
//   node scripts/permitting-forever-runner.mjs [--workers 4] [--cycle-sleep 45000] [--idle-sleep 90000]
//
// Stop = kill the process. Emits loop_* stages to .live-events.jsonl under
// worker label "forever" (lands in the SUPERVISORS bubble).
import { readFileSync, writeFileSync, existsSync, openSync, writeFileSync as writeFd } from 'node:fs';
import { spawn } from 'node:child_process';
import { permitCreds } from './lib/permit-creds.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : dflt; };
const WORKERS = Math.min(arg('--workers', 4), 12);
const DELAY_MS = arg('--delay-ms', 2500); // per-worker pace between invokes — the site shares this budget
const CYCLE_SLEEP = arg('--cycle-sleep', 45000);
const IDLE_SLEEP = arg('--idle-sleep', 90000);
const EVENTS = '.live-events.jsonl';
const FIXTURE = '.fixture-business-all.json';
const POOL_FILE = '.remaining-pool-forever.json';
const SUMMARY_FILE = '.validation-A.json';

// Stages the loop re-attemps every cycle. Everything else is terminal:
// resolved*/location_verified/rule_*/office_created(_followup)/office_exists/
// research_queued(_followup) are done; invalid_input is a permanent reject;
// office-side stages (sweep_/cleanup_/seed_office_*/watchdog_/profile_*)
// are not address outcomes at all.
const RETRY = new Set(['needs_review', 'invoke', 'unresolved', 'city_conflict', 'geocode', 'boundary', 'draft_error', 'office_error', 'research_queue_error', 'seed_office_error', 'stuck', 'no_profile', 'located_no_locality']);

const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFd(evFd, JSON.stringify({ t: Date.now(), worker: 'forever', ...e }) + '\n'); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The child must run the LIVE function — a public-mode pass bypasses deployed
// rules/county GIS/the index and still writes "resolved" marks. Fetch the
// session token here with retries so a 429 can't silently degrade a cycle.
const APP = '68dfcc5e57bbbc35387da97c';
async function ensureToken() {
  for (let i = 0; i < 6; i++) {
    try {
      const j = await fetch(`https://base44.app/api/apps/${APP}/functions/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }), signal: AbortSignal.timeout(20000) }).then((r) => r.json());
      if (j?.token) return j.token;
    } catch {}
    await sleep(5000 + i * 5000);
  }
  return '';
}

// Event timestamps are mixed epoch-ms numbers (validator) and ISO strings
// (sweep/research). Raw > comparison across the two is NaN — a first-seen
// stale stage stayed "latest" forever, which kept ~1,230 already-done
// addresses pinned in the retry pool and starved real work.
const tmsOf = (e) => { const t = typeof e.t === 'number' ? e.t : Date.parse(e.t); return Number.isNaN(t) ? 0 : t; };
function latestStages() {
  const out = {};
  try {
    for (const l of readFileSync(EVENTS, 'utf8').trim().split('\n')) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (!e || e.start || e.step || !e.address || !e.stage) continue;
      if (!(e.address in out) || tmsOf(e) > tmsOf(out[e.address])) out[e.address] = { t: tmsOf(e), stage: e.stage };
    }
  } catch {}
  return out;
}

const RERUN_FILE = '.forever-rerun.json';
function buildPool() {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) || [];
  const latest = latestStages();
  const pool = new Set(fixture.filter((a) => { const s = latest[a]?.stage; return !s || RETRY.has(s); }));
  // One-shot rerun file: addresses to force back into the pool once (e.g.
  // results a public-mode detour marked without the deployed pipeline).
  try {
    if (existsSync(RERUN_FILE)) {
      for (const a of JSON.parse(readFileSync(RERUN_FILE, 'utf8')) || []) if (fixture.includes(a)) pool.add(a);
      writeFileSync(RERUN_FILE, '[]');
    }
  } catch {}
  const out = [...pool];
  const counts = {};
  for (const a of out) counts[latest[a]?.stage || 'never_run'] = (counts[latest[a]?.stage || 'never_run'] || 0) + 1;
  return { pool: out, counts };
}

function runValidator(pool, token) {
  return new Promise((resolve) => {
    writeFileSync(POOL_FILE, JSON.stringify(pool));
    const child = spawn(process.execPath, [
      // LOCAL resolver — free geocode + gov GIS + mirrors; zero external spend.
      'scripts/permitting-local-resolver.mjs',
      '--file', POOL_FILE,
      '--limit', String(pool.length),
      '--workers', String(WORKERS),
      '--delay-ms', String(DELAY_MS),
      '--json', SUMMARY_FILE,
      '--events', EVENTS,
    ], { env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => resolve(code));
  });
}

emit({ stage: 'loop_start', address: 'forever runner', ok: true, detail: `continuous validation — ${WORKERS} workers, retries needs_review + failures every cycle` });
let cycle = 0;
while (true) {
  cycle++;
  const { pool, counts } = buildPool();
  if (!pool.length) {
    emit({ stage: 'loop_idle', address: `cycle ${cycle}`, ok: true, detail: 'nothing retryable — all fixture addresses terminal' });
    await sleep(IDLE_SLEEP);
    continue;
  }
  emit({ stage: 'loop_cycle', address: `cycle ${cycle}`, ok: true, detail: `${pool.length} to attempt — ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')}`.slice(0, 220) });
  const token = await ensureToken();
  if (!token) {
    emit({ stage: 'loop_idle', address: `cycle ${cycle}`, ok: false, detail: 'no live session token after retries — holding the cycle rather than running public-mode' });
    await sleep(IDLE_SLEEP);
    continue;
  }
  const code = await runValidator(pool, token);
  if (code === 42) {
    emit({ stage: 'loop_idle', address: `cycle ${cycle}`, ok: false, detail: 'child refused public-mode (token dropped) — retrying next cycle' });
    await sleep(IDLE_SLEEP);
    continue;
  }
  emit({ stage: 'loop_cycle_done', address: `cycle ${cycle}`, ok: code === 0, detail: `validator exited ${code}` });
  await sleep(CYCLE_SLEEP);
}
