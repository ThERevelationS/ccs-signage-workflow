#!/usr/bin/env node
// Research-dispatch runner — keeps permittingResearchBacklogDispatch invoked
// so the SourceCollectionQueue actually drains. The function is lease-guarded
// (one collection cycle at a time), so this is a supervisor loop, not a
// parallel worker: invoke → wait for the cycle → invoke again.
// Emits research_* events to .live-events.jsonl.
// Usage: node scripts/permitting-research-runner.mjs [--interval-s 120]
import { openSync, writeFileSync } from 'node:fs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const INTERVAL_S = args.includes('--interval-s') ? Number(args[args.indexOf('--interval-s') + 1]) : 120;
const EVENTS = '.live-events.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = '';
async function freshToken() {
  for (let i = 0; i < 5; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return; }
    await sleep(3000 + i * 3000);
  }
  throw new Error('login failed');
}
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'research', ...e }) + '\n', { flag: 'a' }); } catch {} };

await freshToken();
emit({ stage: 'research_runner_start', address: '', ok: true, detail: `dispatch loop started (cycle gap ${INTERVAL_S}s)` });
let consecutiveErrors = 0;
const CYCLE = 'research dispatch cycle';
while (true) {
  try {
    emit({ start: true, address: CYCLE });
    await paceCall('permittingResearchBacklogDispatch');
    const r = await fetch(`${FN}/permittingResearchBacklogDispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, manual: true }), signal: AbortSignal.timeout(600000) });
    const j = await r.json().catch(() => ({}));
    const body = j?.data || j;
    if (r.status === 401 || r.status === 403) { await freshToken(); continue; }
    if (r.status === 429 || r.status >= 500 || body?.error === 'user-exception') {
      consecutiveErrors++;
      emit({ stage: 'research_dispatch_error', address: CYCLE, ok: false, detail: `HTTP ${r.status} ${JSON.stringify(body).slice(0, 120)}`.slice(0, 140) });
      await sleep(Math.min(60000 * consecutiveErrors, 300000));
      continue;
    }
    consecutiveErrors = 0;
    const status = body?.status || body?.reason || 'unknown';
    if (status === 'collection_cycle_active' || /interval|wait|active/i.test(String(status))) {
      emit({ stage: 'research_cycle_idle', address: CYCLE, ok: true, detail: 'another cycle holds the lease — standing by' });
      await sleep(INTERVAL_S * 1000 * 2);
      continue;
    }
    const done = body?.dispatched ?? body?.processed ?? body?.count ?? null;
    emit({ stage: 'research_cycle_done', address: CYCLE, ok: true, detail: `cycle ${status}${done != null ? ` — ${done} jurisdiction(s) researched` : ''}` });
    await sleep(INTERVAL_S * 1000);
  } catch (e) {
    consecutiveErrors++;
    emit({ stage: 'research_dispatch_error', address: CYCLE, ok: false, detail: String(e?.message || e).slice(0, 140) });
    await sleep(Math.min(60000 * consecutiveErrors, 300000));
  }
}
