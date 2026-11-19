#!/usr/bin/env node
// Pipeline trigger daemon — converts completion events into trigger files so
// downstream stages react in seconds instead of waiting for 10-min polls:
//
//   office_res_done / gap_res_done   → triggers/seed/<slug>   (seed-scan merges research onto offices)
//   seed_office_backfilled           → triggers/verify/<slug> (verifier scans that locality now)
//
// Trigger files live in a DIRECTORY — one atomic file per hint. No
// read-modify-write races: producers writeFileSync a new name, consumers
// unlink after reading; mkdir/rename/unlink are the atomic primitives.
import { writeFileSync, mkdirSync, openSync, writeFileSync as wf } from 'node:fs';
import { createTail } from './lib/event-tail.mjs';

const EVENTS = '.live-events.jsonl';
const TRIG = '.audit-work/triggers';
const POLL = Number(process.argv.includes('--poll') ? process.argv[process.argv.indexOf('--poll') + 1] : 4000);
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'pipe-trigger', ...e }) + '\n', { flag: 'a' }); } catch {} };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'x';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tail = createTail(EVENTS, '.audit-work/trigger-cursor.json');

for (const k of ['seed', 'verify']) { try { mkdirSync(`${TRIG}/${k}`, { recursive: true }); } catch {} }

function hint(kind, name, state) {
  try { writeFileSync(`${TRIG}/${kind}/${slug(`${name}|${state}`)}.json`, JSON.stringify({ name, state, at: Date.now() })); } catch {}
}
// "Name, ST" — every worker emits its jurisdiction as address this way.
const parseAddr = (a) => { const m = String(a || '').match(/^(.*),\s*([A-Z]{2})\s*$/); return m ? { name: m[1], state: m[2] } : null; };

const MAP = {
  office_res_done: 'seed',       // researcher wrote profile evidence → merge it
  gap_res_done: 'seed',          // gap researcher enriched research → merge it
  seed_office_backfilled: 'verify', // offices changed → verifier judges now
  prop_done: 'seed',             // county propagation wrote research → merge
};

emit({ stage: 'pipe_boot', address: 'pipeline trigger', ok: true, start: true, detail: 'event→trigger bridge live — seed/verify wake on completions' });
let forwarded = 0;
(async () => {
  while (true) {
    const events = tail();
    for (const e of events) {
      const kind = MAP[e.stage];
      if (!kind) continue;
      const j = parseAddr(e.address || e.jurisdiction);
      if (!j) continue;
      hint(kind, j.name, j.state);
      forwarded++;
    }
    if (forwarded) { emit({ stage: 'pipe_forwarded', detail: `${forwarded} trigger(s) written` }); forwarded = 0; }
    await sleep(POLL);
  }
})().catch((e) => { emit({ stage: 'pipe_error', detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
