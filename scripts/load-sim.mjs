#!/usr/bin/env node
// WS-0 load harness — N concurrent simulated staff sessions against the live
// app. Each session replays the real hot-path call sequence (roster read →
// status_lite → status → correction list) with think time between rounds.
//
// Usage: node scripts/load-sim.mjs [N] [rounds] [--flow=kiosk|mount|poll] [--stagger=ms]
//   N       concurrent sessions (default 10; try 25 for the confirmed target)
//   rounds  flow repetitions per session (default 3)
// Reports client-visible latency percentiles, HTTP statuses, 429s, and the
// server-reported `entity_calls` delta now attached to gateway responses.

import fs from 'node:fs';

// The api/apps route serves the DEPLOYED function build (where sandbox
// functions deploy lands); the site subdomain serves the published bundle.
const API = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions/';
const N = Math.max(1, Number(process.argv[2] || process.env.N || 10));
const ROUNDS = Math.max(1, Number(process.argv[3] || process.env.ROUNDS || 3));
const FLOW = (process.argv.find((a) => a.startsWith('--flow='))?.split('=')[1] || process.env.FLOW || 'kiosk');
const EMAIL = process.env.SIM_EMAIL || 'brett@cincisigns.com';

const tokenFile = ['.permit-token.txt', '.permit-session-token']
  .map((p) => { try { return fs.readFileSync(p, 'utf8').trim().split('\n')[0].trim(); } catch { return null; } })
  .find(Boolean);
if (!tokenFile) { console.error('No session token file found (.permit-token.txt)'); process.exit(1); }
const token = tokenFile;

const stats = { calls: 0, http429: 0, http5xx: 0, http200: 0, other: 0, entityCalls: 0, entityCallsSeen: 0 };
const latencies = [];
const perAction = new Map(); // name -> {n, ms[], ecalls[]}

async function call(fn, body, label) {
  const t0 = Date.now();
  let status = 0, entityCalls = null, ok = false;
  try {
    const r = await fetch(`${API}${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, session_token: token }),
      signal: AbortSignal.timeout(60000),
    });
    status = r.status;
    const j = await r.json().catch(() => null);
    ok = r.status === 200 && j?.success !== false;
    if (j && Number.isFinite(Number(j.entity_calls))) { entityCalls = Number(j.entity_calls); }
  } catch { status = 0; }
  const ms = Date.now() - t0;
  stats.calls++;
  if (status === 429) stats.http429++; else if (status >= 500) stats.http5xx++; else if (status === 200) stats.http200++; else stats.other++;
  latencies.push(ms);
  if (entityCalls != null) { stats.entityCalls += entityCalls; stats.entityCallsSeen++; }
  const a = perAction.get(label) || { n: 0, ms: [], ec: [] };
  a.n++; a.ms.push(ms); if (entityCalls != null) a.ec.push(entityCalls);
  perAction.set(label, a);
  return { ms, status, ok };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms, j = 0.3) => Math.round(ms * (1 - j + Math.random() * j * 2));

// Call sequences mirroring the real client at each lifecycle phase.
//   kiosk — pre-WS-3 mount replay: roster → status_lite → status → corrections
//   mount — post-WS-3 mount wave: appBootstrap + roster + status_lite
//   poll  — steady-state ambient: status_lite only (leader-elected poll tick)
const FLOWS = {
  kiosk: (id, round) => [
    ['staffDataRead', { entity: 'AuthorizedEmail', limit: 200 }, 'roster'],
    ['timeClockAction', { action: 'status_lite', target_email: EMAIL }, 'status_lite'],
    ['timeClockAction', { action: 'status', target_email: EMAIL, request_id: `sim-${id}-${round}` }, 'status'],
    ['timeClockAction', { action: 'list_correction_requests', target_email: EMAIL, request_id: `simc-${id}-${round}` }, 'corrections'],
  ],
  mount: (id, round) => [
    ['appBootstrap', { action: 'bootstrap' }, 'bootstrap'],
    ['staffDataRead', { entity: 'AuthorizedEmail', limit: 200 }, 'roster'],
    ['timeClockAction', { action: 'status_lite', target_email: EMAIL }, 'status_lite'],
  ],
  poll: (id, round) => [
    ['timeClockAction', { action: 'status_lite', target_email: EMAIL }, 'status_lite'],
  ],
};
const flow = FLOWS[FLOW] || FLOWS.kiosk;
// --stagger=<ms>: per-session join spacing. Default 700ms (burst-ish); real
// morning mounts spread wider — pass ~2000 for a representative overlap.
const STAGGER = Number(process.argv.find((a) => a.startsWith('--stagger='))?.split('=')[1] || 700);

async function session(id) {
  await sleep(jitter(id * STAGGER)); // staggered join, like real staff
  for (let round = 0; round < ROUNDS; round++) {
    for (const [fn, payload, label] of flow(id, round)) {
      await call(fn, payload, label);
    }
    await sleep(jitter(4000)); // think time between punches/refreshes
  }
}

const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

const t0 = Date.now();
await Promise.all(Array.from({ length: N }, (_, i) => session(i)));
const wall = Date.now() - t0;

latencies.sort((a, b) => a - b);
console.log('\n===== LOAD SIM RESULT =====');
console.log(`sessions=${N} rounds=${ROUNDS} wall=${(wall / 1000).toFixed(1)}s calls=${stats.calls}`);
console.log(`HTTP: 200=${stats.http200} 429=${stats.http429} 5xx=${stats.http5xx} other=${stats.other}`);
console.log(`latency ms: p50=${pct(latencies, 0.5)} p95=${pct(latencies, 0.95)} p99=${pct(latencies, 0.99)} max=${latencies[latencies.length - 1] || 0}`);
console.log(`entity_calls (server-reported): total=${stats.entityCalls} across ${stats.entityCallsSeen} calls | est/min=${(stats.entityCalls / (wall / 60000)).toFixed(1)}`);
console.log('\nper-action:');
for (const [name, a] of perAction) {
  a.ms.sort((x, y) => x - y);
  const ec = a.ec.length ? (a.ec.reduce((x, y) => x + y, 0) / a.ec.length).toFixed(1) : 'n/a';
  console.log(`  ${name.padEnd(14)} n=${a.n} p50=${pct(a.ms, 0.5)}ms p95=${pct(a.ms, 0.95)}ms avg_entity_calls=${ec}`);
}
if (stats.http429) console.log('\n⚠ 429s observed — the shared budget saturated under this load.');
