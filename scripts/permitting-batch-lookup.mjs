#!/usr/bin/env node
// MP-12.1 — Batch address lookup. CSV in → the fleet resolves them through
// the normal pipeline (index, rules, geocode, offices) → CSV out with
// jurisdiction + offices + status. Pre-bid territory sweeps: hundreds of
// addresses resolve in the background instead of one-at-a-time lookups.
//
//   node scripts/permitting-batch-lookup.mjs --csv leads.csv [--column address]
//   node scripts/permitting-batch-lookup.mjs --csv leads.csv --wait 30 --out results.csv
//   node scripts/permitting-batch-lookup.mjs --batch <id> --export results.csv
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

const args = process.argv.slice(2);
const val = (f) => args.includes(f) ? args[args.indexOf(f) + 1] : null;
const CSV = val('--csv');
const COL = val('--column') || 'address';
const BATCH = val('--batch');
const OUT = val('--out') || val('--export');
const WAIT_MIN = Number(val('--wait') || 0);
const FIXTURE = '.fixture-business-all.json';
const EVENTS = '.live-events.jsonl';
const BATCH_DIR = '.audit-work/batches';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmsOf = (e) => { const t = typeof e.t === 'number' ? e.t : Date.parse(e.t); return Number.isNaN(t) ? 0 : t; };

function latestStages() {
  const out = {};
  try {
    for (const l of readFileSync(EVENTS, 'utf8').trim().split('\n')) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (!e || e.start || e.step || !e.address || !e.stage) continue;
      if (!(e.address in out) || tmsOf(e) > tmsOf(out[e.address])) out[e.address] = e;
    }
  } catch {}
  return out;
}

async function csvAddresses(file, col) {
  const rl = createInterface({ input: createReadStream(file) });
  const addrs = [];
  let header = -1, seenHeader = false;
  for await (const line of rl) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (!seenHeader) {
      seenHeader = true;
      const idx = cells.findIndex((c) => c.toLowerCase() === col.toLowerCase());
      header = idx >= 0 ? idx : (cells.length === 1 ? 0 : -1);
      if (header < 0) { console.error(`no '${col}' column in ${file}`); process.exit(1); }
      continue;
    }
    if (cells[header]) addrs.push(cells[header]);
  }
  return addrs;
}

function exportCsv(batchId) {
  const batch = JSON.parse(readFileSync(`${BATCH_DIR}/${batchId}.json`, 'utf8'));
  const latest = latestStages();
  const rows = batch.addresses.map((a) => {
    const e = latest[a];
    const stage = e?.stage || 'pending';
    const resolved = /^resolved_|office_created|located_no_locality/.test(stage);
    const pick = resolved ? (String(e.trace || '').match(/inside ([^+—(]+)/)?.[1] || e.jurisdiction || '') : '';
    return [a, stage, pick.trim(), e?.county || '', e?.detail ? String(e.detail).slice(0, 80).replace(/,/g, ';') : ''];
  });
  const csv = ['address,status,jurisdiction,county,detail', ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const out = OUT || `.audit-work/batches/${batchId}-results.csv`;
  writeFileSync(out, csv);
  const done = rows.filter((r) => /^resolved_/.test(r[1])).length;
  console.log(`${out} — ${done}/${rows.length} resolved`);
}

async function main() {
  if (BATCH) { exportCsv(BATCH); return; }
  if (!CSV) { console.error('usage: --csv <file> [--column address] [--wait N] | --batch <id> --export out.csv'); process.exit(1); }
  const addrs = await csvAddresses(CSV, COL);
  if (!addrs.length) { console.error('no addresses parsed'); process.exit(1); }
  const batchId = `b${Date.now().toString(36)}`;
  const { mkdirSync } = await import('node:fs');
  mkdirSync(BATCH_DIR, { recursive: true });
  writeFileSync(`${BATCH_DIR}/${batchId}.json`, JSON.stringify({ created: new Date().toISOString(), addresses: addrs }, null, 1));
  // Inject into the fixture — the forever-runner's next cycle picks them up.
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const merged = [...new Set([...fixture, ...addrs])];
  writeFileSync(FIXTURE, JSON.stringify(merged));
  console.log(`batch ${batchId}: ${addrs.length} addresses into the pipeline (${merged.length - fixture.length} new)`);
  if (WAIT_MIN > 0) {
    const deadline = Date.now() + WAIT_MIN * 60000;
    const want = new Set(addrs);
    while (Date.now() < deadline) {
      const latest = latestStages();
      const pending = addrs.filter((a) => !latest[a] || /needs_review|unresolved|invoke|geocode/.test(latest[a].stage));
      console.log(`${new Date().toISOString().slice(11, 19)} — ${pending.length} pending`);
      if (!pending.length) break;
      await sleep(20000);
    }
    exportCsv(batchId);
  } else console.log(`export later: node scripts/permitting-batch-lookup.mjs --batch ${batchId} --export results.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
