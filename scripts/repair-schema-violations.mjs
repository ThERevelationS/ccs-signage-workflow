#!/usr/bin/env node
// CAS-repairs rows found by scripts/validate-entity-values.mjs where the fix is
// lossless: string->number/integer on finite numeric strings. Each write is
// anchored on a FRESH updated_date re-read right before the write, so a row
// edited between scan and repair is skipped, never clobbered.
//   node scripts/repair-schema-violations.mjs [--dry-run]
import { readFileSync } from 'node:fs';
import { paceCall } from './lib/read-ledger.mjs';

const DRY = process.argv.includes('--dry-run');
const TOKEN = readFileSync(process.env.PERMIT_TOKEN_FILE || '.permit-token.txt', 'utf8').trim().split('\n')[0].trim();
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn, body) => {
  await paceCall('schema-repair');
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, session_token: TOKEN }) });
  if (r.status === 429) { await sleep(5000); return call(fn, body); }
  return { s: r.status, j: await r.json().catch(() => null) };
};

const scan = JSON.parse(readFileSync('.audit-work/schema-violations.json', 'utf8'));
const fixable = scan.violations.filter((v) => v.declared === 'number' && v.found === 'string' && Number.isFinite(Number(JSON.parse(v.value))));
console.log(`${fixable.length}/${scan.violations.length} violations are lossless string->number repairs`);

let fixed = 0, skipped = 0, failed = 0;
for (const v of fixable) {
  // Fresh read for the CAS anchor — repair must never overwrite a newer edit.
  const cur = await call('staffDataRead', { entity: v.entity, query: { id: v.id }, limit: 1 });
  const row = cur.j?.items?.[0];
  if (!row?.id || !row?.updated_date) { failed++; console.log(`  ! read failed ${v.id}`); continue; }
  const raw = row[v.field];
  const num = Number(raw);
  if (typeof raw !== 'string' || !Number.isFinite(num)) { skipped++; continue; } // already fixed elsewhere
  if (DRY) { console.log(`  ~ ${v.id} ${v.field}: "${raw}" -> ${num}`); skipped++; continue; }
  const w = await call('staffEntityWrite', { entity: v.entity, id: v.id, op: 'updateMany', query: { id: v.id, updated_date: row.updated_date }, update: { $set: { [v.field]: num } } });
  const upd = w.j?.result?.updated ?? w.j?.updated;
  if (w.s === 200 && upd === 1) { fixed++; }
  else { failed++; console.log(`  ! write ${v.id}: ${w.s} ${JSON.stringify(w.j).slice(0, 100)}`); }
  await sleep(150);
}
console.log(`\n===== REPAIR ${DRY ? '(DRY)' : ''}=====`);
console.log(`fixed: ${fixed} | skipped (already clean): ${skipped} | failed: ${failed}`);
